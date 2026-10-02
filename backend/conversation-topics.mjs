import {discoverBridgeTopics} from './bridge-discovery.mjs';
import {bridgeEvidenceStamp,directTopicsForPeople,rankConversationTopics, representativeInterests, shouldDiscoverBridge} from '../shared/conversation-topics.ts';
import {canonical, eligibleMatches, findMatches, positiveInterests} from '../shared/matching.ts';
import {rankInterests} from '../shared/grouping.ts';

export async function withDeadline(task,signal,timeoutMs){
  const timeout=AbortSignal.timeout(Math.max(1,Math.floor(timeoutMs))),active=signal?AbortSignal.any([signal,timeout]):timeout;
  active.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const aborted=()=>{active.removeEventListener('abort',aborted);reject(active.reason);};
    active.addEventListener('abort',aborted,{once:true});
    Promise.resolve().then(()=>task(active)).then(value=>{active.removeEventListener('abort',aborted);resolve(value);},error=>{active.removeEventListener('abort',aborted);reject(error);});
  });
}

export async function optimizeConversationGroups(people,direct,env,size,signal,deadlineAt=Date.now()+55000){
  const remaining=cap=>Math.max(1,Math.min(cap,deadlineAt-Date.now()));
  const directMatches=eligibleMatches(direct,people);
  const seeds=people.length>size?await withDeadline(active=>env.optimizeGroups(people,directMatches,size,active),signal,remaining(25000)):null;
  const seedPlans=Array.isArray(seeds)?seeds:seeds?.plans;
  const fallback={matches:directMatches,bridgeTopics:[],bridgeStatus:'unavailable',bridgeMessage:'연결 주제를 시간 안에 검증하지 못했어요. 공유 관심사를 기준으로 편성했어요.'};
  let conversation;
  try{conversation=await withDeadline(active=>groupConversationTopics(people,direct,env,size,seedPlans||[],active),signal,remaining(20000));}
  catch(error){if(signal?.aborted)throw error;conversation=fallback;}
  if(seeds&&!conversation.bridgeTopics.length)return {optimized:seeds,conversation};
  try{
    const optimized=await withDeadline(active=>env.optimizeGroups(people,eligibleMatches(conversation.matches,people),size,active),signal,remaining(seeds?15000:25000));
    return {optimized,conversation};
  }catch(error){if(signal?.aborted||!seeds)throw error;return {optimized:seeds,conversation:{...fallback,bridgeMessage:'연결 주제를 반영한 편성을 완료하지 못했어요. 공유 관심사로 계산한 편성을 보여드려요.'}};}
}

export async function validatePlanBridgeTopics(people,plan,env,signal,deadlineAt=Date.now()+55000){
  const batches=new Map();
  for(const topic of plan.bridgeTopics){
    const key=topic.members.slice().sort().join('|'),topics=batches.get(key)||[];
    topics.push(topic);batches.set(key,topics);
  }
  const jobs=[...batches.values()].flatMap(topics=>Array.from({length:Math.ceil(topics.length/3)},(_,index)=>topics.slice(index*3,index*3+3)));
  return withDeadline(async active=>{
    const result=[];
    for(let offset=0;offset<jobs.length;offset+=3){
      active.throwIfAborted();
      const checked=await Promise.all(jobs.slice(offset,offset+3).map(async topics=>{
        const supported=people.filter(person=>topics[0].members.includes(person.id));
        const candidates=topics.map(topic=>({id:topic.id,label:topic.label,category:topic.category,reason:topic.reason,connections:topic.connections}));
        const validated=await env.validateBridgeTopics(supported,candidates,directTopicsForPeople(findMatches(supported),supported),active);
        return currentBridgeTopics(supported,validated).filter(topic=>plan.groups.some(group=>rankInterests([topic],people.filter(person=>group.includes(person.id))).length>0));
      }));
      result.push(...checked.flat());
    }
    return result;
  },signal,deadlineAt-Date.now());
}

export async function conversationTopics(people, direct, env, signal) {
  const base = rankConversationTopics(direct, [], people);
  if (!shouldDiscoverBridge(direct, people)) return {matches: base, bridgeStatus: 'not-needed', bridgeTopics: []};
  if (!env.validateBridgeTopics) return {matches: base, bridgeTopics: [], bridgeStatus: 'unavailable', bridgeMessage: '연결 주제의 AI 검증 설정이 아직 완료되지 않았어요.'};
  try {
    const scopedDirect=directTopicsForPeople(direct,people);
    const candidates = await discoverBridgeTopics(people, scopedDirect, env, signal);
    if (!candidates.length) return {matches: base, bridgeStatus: 'none', bridgeTopics: []};
    const bridges = await env.validateBridgeTopics(people, candidates, scopedDirect, signal);
    signal?.throwIfAborted();
    const trusted = currentBridgeTopics(people, bridges);
    return {matches: rankConversationTopics(direct, trusted, people), bridgeTopics: trusted, bridgeStatus: trusted.length ? 'complete' : 'none'};
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return {matches: base, bridgeTopics: [], bridgeStatus: 'unavailable', bridgeMessage: error?.code === 'BRIDGE_NOT_CONFIGURED' ? '연결 주제 추천을 사용하려면 서버의 GEMINI_API_KEY를 설정해주세요.' : '연결 주제 추천을 완료하지 못했어요. 잠시 후 다시 시도해주세요.'};
  }
}

export async function groupConversationTopics(people,direct,env,size,seedPlans,signal){
  if(people.length<=size)return conversationTopics(people,direct,env,signal);
  const seen=new Set(),scopes=[];
  for(const plan of seedPlans)for(const group of plan.groups){
    const key=group.ids.slice().sort().join('|');
    if(seen.has(key))continue;seen.add(key);
    const members=people.filter(person=>group.ids.includes(person.id));
    if(members.length>=2&&shouldDiscoverBridge(direct,members))scopes.push(members);
  }
  // Limit paid discovery to three seed tables, rather than every CP-SAT candidate.
  const results=await Promise.all(scopes.slice(0,3).map(members=>conversationTopics(members,direct,env,signal)));
  const bridgeTopics=results.flatMap((result,index)=>result.bridgeTopics.map((topic,topicIndex)=>({...topic,id:`table-bridge-${index}-${topicIndex}-${topic.id.slice(0,60)}`})));
  return {matches:[...rankConversationTopics(direct,[],people),...bridgeTopics],bridgeTopics,bridgeStatus:bridgeTopics.length?'complete':results.some(result=>result.bridgeStatus==='unavailable')?'unavailable':scopes.length?'none':'not-needed',bridgeMessage:results.find(result=>result.bridgeMessage)?.bridgeMessage,bridgeScope:'bounded'};
}

// A saved explanation must still refer to the same currently public interests.
export function currentBridgeTopics(people, topics) {
  if (!Array.isArray(topics)) return [];
  const byId = new Map(people.map(person => [person.id, person]));
  const publicInterests=new Map(representativeInterests(people).map(person=>[person.id,new Map(person.interests.map(interest=>[interest.id,interest]))]));
  return eligibleMatches(topics.filter(topic => {
    if (topic?.kind !== 'bridge' || topic.validation?.model !== 'Qwen3-Embedding-0.6B' || !Array.isArray(topic.members) || topic.members.length < 2 || !Array.isArray(topic.connections) || !Array.isArray(topic.evidence)) return false;
    if(!topic.validation.evidenceStamp||topic.validation.evidenceStamp!==bridgeEvidenceStamp(people.filter(person=>topic.members.includes(person.id)),topic.connections))return false;
    return topic.members.every(id => {
      const person = byId.get(id), refs = topic.connections.find(connection => connection.profile === id)?.interests;
      if (!person || !Array.isArray(refs) || !refs.length) return false;
      return refs.every(ref => {
        const interest = positiveInterests(person).find(item => item.id === ref);
        return interest && topic.evidence.some(row => row.profile === id && canonical(row.label) === canonical(interest.label));
      });
    });
  }), people).map(topic => ({...topic, evidence: topic.connections.flatMap(connection => {
    return (connection.interests || []).flatMap(id => {
      const interest = publicInterests.get(connection.profile)?.get(id);
      return interest ? [{profile: connection.profile, label: interest.label, ...(interest.source ? {source: interest.source} : {})}] : [];
    });
  })}));
}
