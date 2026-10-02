import assert from 'node:assert/strict';
import {optimizeConversationGroups,validatePlanBridgeTopics} from './conversation-topics.mjs';
import {bridgeTexts,validateBridgeTopics} from '../shared/conversation-topics.ts';

const interest=(id,label,category='기타')=>({id,label,category,shared:true,preference:'like'});
const person=(id,label)=>({id,name:id,bio:'',color:'#123456',interests:[interest(`${id}-interest`,label)]});
const groups=[
 ['a1','a2','a3'],['b1','b2','b3'],['c1','c2','c3'],
];
const interestLabels=['천문 관측','야간 사진','망원경','도시 건축','거리 여행','스케치','커피 로스팅','디저트 탐방','도예'];
const people=groups.flat().map((id,index)=>person(id,interestLabels[index]));
const seedPlans=[{id:'seed-fixture',groups:groups.map(ids=>({ids})),status:'seed'}];
const connection=id=>({profile:id,interests:[`${id}-interest`],reason:`${id}의 공개 관심사와 연결돼요.`});
const waitForAbort=(signal,started=()=>{})=>new Promise((_resolve,reject)=>{
 const keepAlive=setTimeout(()=>{},1000);
 started();const abort=()=>{clearTimeout(keepAlive);reject(signal.reason);};
 if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
});

function discoveryResponse(profiles){
 const first=profiles[0].id;
 const labels={a1:'별자리 관측과 야간 사진 여행',b1:'도시 건축을 기록하는 거리 산책',c1:'커피와 도예를 잇는 디저트 그릇 이야기'};
 const candidate={id:`bridge-${first}`,label:labels[first],category:'기타',reason:'서로 다른 공개 관심사를 모두가 참여할 수 있는 구체적인 대화로 연결해요.',connections:profiles.map(profile=>connection(profile.id))};
 return Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({candidates:[candidate]})}]}]});
}

const parseProfiles=options=>JSON.parse(JSON.parse(options.body).input.match(/PROFILES=(.*)$/m)[1]);
const pureValidate=async(members,candidates,direct)=>validateBridgeTopics(members,candidates,bridgeTexts(members,candidates).map(()=>[1,0]),direct);

async function testDiscoveryBudgetFallsBackToSeed(){
 let solverCalls=0;
 const env={
  GEMINI_API_KEY:'fixture-key',
  optimizeGroups:async()=>{solverCalls++;return seedPlans;},
  validateBridgeTopics:pureValidate,
  fetch:async(_url,{signal})=>waitForAbort(signal),
 };
 const started=Date.now();
 const result=await optimizeConversationGroups(people,[],env,3,undefined,Date.now()+120);
 assert(Date.now()-started<500,'the discovery budget must settle promptly');
 assert.strictEqual(result.optimized,seedPlans);
 assert.equal(solverCalls,1);
 assert.equal(result.conversation.bridgeStatus,'unavailable');
 assert.deepEqual(result.conversation.bridgeTopics,[]);
}

async function testRerunBudgetFallsBackAndDropsBridges(){
 let solverCalls=0,rerunStarted=false;
 const env={
  GEMINI_API_KEY:'fixture-key',
  fetch:async(_url,options)=>discoveryResponse(parseProfiles(options)),
  validateBridgeTopics:pureValidate,
  optimizeGroups:async(_members,_matches,_size,signal)=>{
   solverCalls++;
   if(solverCalls===1)return seedPlans;
   return waitForAbort(signal,()=>{rerunStarted=true;});
  },
 };
 const result=await optimizeConversationGroups(people,[],env,3,undefined,Date.now()+140);
 assert(rerunStarted);
 assert.equal(solverCalls,2);
 assert.strictEqual(result.optimized,seedPlans);
 assert.equal(result.conversation.bridgeStatus,'unavailable');
 assert.deepEqual(result.conversation.bridgeTopics,[],'unapplied bridge topics must not accompany the seed fallback');
}

async function testCallerAbortNeverFallsBack(){
 const controller=new AbortController(),reason=new DOMException('caller cancelled','AbortError');
 let entered;const started=new Promise(resolve=>entered=resolve);
 const env={
  GEMINI_API_KEY:'fixture-key',
  optimizeGroups:async()=>seedPlans,
  validateBridgeTopics:pureValidate,
  fetch:async(_url,{signal})=>waitForAbort(signal,entered),
 };
 const pending=optimizeConversationGroups(people,[],env,3,controller.signal,Date.now()+140);
 await started;controller.abort(reason);
 await assert.rejects(pending,error=>error===reason);
}

const topicLabels=[
 ['별자리 관측과 야간 사진 기록','망원경으로 찾는 계절 천체','밤하늘 촬영 장소 비교'],
 ['현대 건축 드로잉 산책','골목 여행의 공간 관찰','도시 풍경 스케치 모임'],
 ['커피 향을 담은 도예 잔','디저트와 그릇 디자인 탐방','로스팅 색감의 생활 도자기'],
];
function savedTopic(ids,scope,index){
 return {id:`saved-${scope}-${index}`,label:topicLabels[scope][index],category:'기타',reason:'세 사람의 서로 다른 공개 관심사를 구체적인 대화 주제로 연결해요.',members:ids.slice(),connections:ids.map(connection)};
}
const savedTopics=groups.flatMap((ids,scope)=>topicLabels[scope].map((_,index)=>savedTopic(ids,scope,index)));
const plan={groups:groups.map(ids=>ids.slice()),bridgeTopics:savedTopics};

async function testSavedTopicsUseBoundedBatches(){
 let calls=0,active=0,maxActive=0;
 const env={validateBridgeTopics:async(members,candidates,direct,signal)=>{
  calls++;active++;maxActive=Math.max(maxActive,active);
  assert(candidates.length<=3);assert(signal instanceof AbortSignal);
  await new Promise(resolve=>setTimeout(resolve,10));
  try{return validateBridgeTopics(members,candidates,bridgeTexts(members,candidates).map(()=>[1,0]),direct);}
  finally{active--;}
 }};
 const result=await validatePlanBridgeTopics(people,plan,env,undefined,Date.now()+140);
 assert.equal(calls,3);
 assert(maxActive<=3);
 assert.equal(result.length,9);
 assert.deepEqual(new Set(result.map(topic=>topic.id)),new Set(savedTopics.map(topic=>topic.id)));
 assert(result.every(topic=>topic.validation?.model==='Qwen3-Embedding-0.6B'));
}

async function testSavedValidationTimeoutReturnsNothing(){
 let produced=false;
 const env={validateBridgeTopics:async(_members,_candidates,_direct,signal)=>{
  await waitForAbort(signal);produced=true;return [];
 }};
 await assert.rejects(validatePlanBridgeTopics(people,plan,env,undefined,Date.now()+120),error=>error?.name==='TimeoutError');
 assert.equal(produced,false);
}

await testDiscoveryBudgetFallsBackToSeed();
await testRerunBudgetFallsBackAndDropsBridges();
await testCallerAbortNeverFallsBack();
await testSavedTopicsUseBoundedBatches();
await testSavedValidationTimeoutReturnsNothing();
console.log('PASS bridge request budgets preserve seed fallback, caller cancellation, bounded pure-validation batches, and save timeout rejection');
