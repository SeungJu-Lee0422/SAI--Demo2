import {canonical,contactOrSensitive,positiveInterests,type Interest,type Match,type Profile} from './matching.ts';

export const BRIDGE_THRESHOLDS={minimumDirectTopics:3,perMemberRelevance:.60,harmonicConsensus:.65,maxCandidates:3} as const;
export type BridgeCandidate={id:string;label:string;category:string;reason:string;connections:{profile:string;interests:string[];reason:string}[];confidence?:number};

const clean=(value:string,max=240)=>value.replace(/\s+/g,' ').trim().slice(0,max);
const itemKey=(profile:string,id:string)=>profile+'\u0000'+id;

export function representativeInterests(people:Profile[]):Profile[]{
 return people.map(person=>{
  const buckets=new Map<string,Interest[]>();
  for(const interest of positiveInterests(person)){
   const label=clean(interest.label,120),category=clean(interest.category,80);
   if(!label||!category||contactOrSensitive(label))continue;
   const sourceDetail=clean(interest.source?.detail||''),sourceLabel=clean(interest.source?.label||'',120);
   const sanitized:Interest={...interest,label,category,...(interest.source?{source:{kind:interest.source.kind,label:sourceLabel&&!contactOrSensitive(sourceLabel)?sourceLabel:interest.source.kind,...(sourceDetail&&!contactOrSensitive(sourceDetail)?{detail:sourceDetail}:{}),...(interest.source.url?{url:interest.source.url}:{})}}:{})};
   const list=buckets.get(category)||[];list.push(sanitized);buckets.set(category,list);
  }
  for(const list of buckets.values())list.sort((a,b)=>canonical(a.label).localeCompare(canonical(b.label))||a.id.localeCompare(b.id));
  const ordered=[...buckets].sort(([a],[b])=>a.localeCompare(b,'ko'));
  const interests:Interest[]=[];
  for(let depth=0;interests.length<6;depth++){
   let added=false;
   for(const [,list] of ordered)if(list[depth]&&interests.length<6){interests.push(list[depth]);added=true;}
   if(!added)break;
  }
  return {...person,interests};
 });
}

function representativeItems(people:Profile[]){return representativeInterests(people).flatMap(person=>person.interests.map(interest=>({profile:person.id,interest})));}

export function bridgeEvidenceStamp(people:Profile[],connections:BridgeCandidate['connections']|NonNullable<Match['connections']>):string{
 if(!Array.isArray(connections)||!connections.length||connections.length>people.length)return '';
 const representatives=new Map(representativeItems(people).map(item=>[itemKey(item.profile,item.interest.id),item.interest]));
 const rows:{profile:string;id:string;category:string;label:string;sourceLabel:string;detail:string}[]=[];
 for(const connection of connections){
  if(!connection||typeof connection.profile!=='string'||connection.profile.length>100||!Array.isArray(connection.interests)||!connection.interests.length||connection.interests.length>6)return '';
  for(const id of connection.interests){
   if(typeof id!=='string'||id.length>100)return '';
   const interest=representatives.get(itemKey(connection.profile,id));if(!interest)return '';
   rows.push({profile:connection.profile,id:interest.id,category:interest.category,label:interest.label,sourceLabel:interest.source?.label||'',detail:interest.source?.detail||''});
  }
 }
 rows.sort((a,b)=>a.profile.localeCompare(b.profile)||a.id.localeCompare(b.id)||a.category.localeCompare(b.category)||a.label.localeCompare(b.label)||a.sourceLabel.localeCompare(b.sourceLabel)||a.detail.localeCompare(b.detail));
 return JSON.stringify(rows);
}

export function bridgeTexts(people:Profile[],candidates:BridgeCandidate[]):string[]{
 const interests=representativeItems(people).map(({interest})=>`${interest.category} 관심사: ${interest.label}${interest.source?.detail?`\n공개 근거: ${interest.source.detail}`:''}`);
 return [...interests,...candidates.map(candidate=>`${candidateText(candidate?.category,1,40)} 대화 주제: ${candidateText(candidate?.label,2,80)}`)];
}

export function harmonicMean(values:number[]):number{
 if(!values.length||values.some(value=>!Number.isFinite(value)||value<=0))return 0;
 return values.length/values.reduce((sum,value)=>sum+1/value,0);
}

const specific=(label:string,category:string)=>{
 const value=canonical(label),categoryValue=canonical(category);
 if(value.length<2||value===categoryValue)return 0;
 const broad=['공통관심사','대화주제','취미','관심사','문화','라이프스타일','콘텐츠','활동','일상','기타','interest','interests','commoninterest','commoninterests','conversationtopic','conversationtopics','hobby','hobbies','culture','lifestyle','entertainment','activity','activities','content','leisure','experience','story','conversation'];
 if(broad.includes(value))return 0;
 const detail=Math.min(1,Math.max(0,(clean(label).length-3)/17));
 return .65+.35*detail;
};

export function conversationTopicScore(match:Match,people:Profile[]){
 const relevance=Object.fromEntries(people.map(person=>{
  const actual=match.relevance?.[person.id];
  const fallback=match.members.includes(person.id)?(match.kind==='exact'?1:match.kind==='bridge'?0:match.similarity??.6):0;
  return [person.id,Math.min(1,Math.max(0,actual??fallback))];
 }));
 const consensus=harmonicMean(people.map(person=>relevance[person.id]));
 const evidenceCoverage=people.length?people.filter(person=>match.evidence.some(item=>item.profile===person.id)).length/people.length:0;
 const specificity=specific(match.label,match.category);
 if(match.kind==='bridge')return {relevance,consensus,evidenceCoverage,specificity,conversationScore:.60*consensus+.20*evidenceCoverage+.20*specificity};
 const matchType=match.kind==='exact'?1:match.kind==='related'?.85:.75;
 return {relevance,consensus,evidenceCoverage,specificity,conversationScore:.55*consensus+.20*matchType+.15*evidenceCoverage+.10*specificity};
}

const cosine=(a:number[],b:number[])=>{
 const aa=Math.sqrt(a.reduce((sum,value)=>sum+value*value,0)),bb=Math.sqrt(b.reduce((sum,value)=>sum+value*value,0));
 if(!aa||!bb)return 0;
 return a.reduce((sum,value,index)=>sum+value*b[index],0)/(aa*bb);
};

const candidateText=(value:unknown,min:number,max:number)=>{
 if(typeof value!=='string'||value.length<min||value.length>max||/[\u0000-\u001f\u007f]/.test(value)||contactOrSensitive(value)||/@[a-z0-9_.-]{2,}|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/i.test(value))return '';
 const valueClean=clean(value,max);return valueClean.length>=min?valueClean:'';
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const referenceId=(value:unknown,min:number,max:number)=>typeof value==='string'&&value.length>=min&&value.length<=max&&uuid.test(value)?value:candidateText(value,min,max);

const sameTopic=(left:string,right:string)=>{
 const a=canonical(left),b=canonical(right);if(!a||!b)return false;
 return a===b||(Math.min(a.length,b.length)>=4&&(a.includes(b)||b.includes(a)));
};

export function directTopicsForPeople(direct:Match[],people:Profile[]):Match[]{
 const ids=new Set(people.map(person=>person.id));
 return direct.filter(match=>match.kind!=='bridge'&&ids.size>0&&[...ids].every(id=>match.members.includes(id)&&match.evidence.some(item=>item.profile===id)));
}

export function shouldDiscoverBridge(direct:Match[],people:Profile[],min=BRIDGE_THRESHOLDS.minimumDirectTopics):boolean{
 const count=directTopicsForPeople(direct,people).filter(match=>specific(match.label,match.category)>0).length;
 return count<min;
}

export function validateBridgeTopics(people:Profile[],candidates:BridgeCandidate[],vectors:number[][],direct:Match[]=[]):Match[]{
 const items=representativeItems(people),expected=items.length+candidates.length;
 if(vectors.length!==expected)throw new Error('관심사·브리지 주제와 벡터 수가 다릅니다.');
 const dimension=vectors[0]?.length||0;
 if(!dimension||vectors.some(vector=>vector.length!==dimension||vector.some(value=>!Number.isFinite(value))))throw new Error('분석 벡터 형식을 확인해주세요.');
 const peopleById=new Map(people.map(person=>[person.id,person]));
 const itemIndexes=new Map(items.map((item,index)=>[itemKey(item.profile,item.interest.id),index]));
 const itemInterests=new Map(items.map(item=>[itemKey(item.profile,item.interest.id),item.interest]));
 const avoids=new Set(people.flatMap(person=>person.interests.filter(interest=>interest.shared&&interest.preference==='avoid').map(interest=>canonical(interest.label))));
 const accepted:Match[]=[];
 for(let candidateIndex=0;candidateIndex<candidates.length;candidateIndex++){
  const candidate=candidates[candidateIndex] as BridgeCandidate|null;
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||Object.keys(candidate).some(key=>!['id','label','category','reason','connections','confidence'].includes(key)))continue;
  const id=referenceId(candidate.id,1,80),label=candidateText(candidate.label,2,80),category=candidateText(candidate.category,1,40),reason=candidateText(candidate.reason,4,360),specificity=specific(label,category);
  if(!id||!label||!category||!reason||!specificity||direct.some(match=>sameTopic(label,match.label))||avoids.has(canonical(label))||!Array.isArray(candidate.connections))continue;
  if(candidate.confidence!==undefined&&(!Number.isFinite(candidate.confidence)||candidate.confidence<0||candidate.confidence>1))continue;
  if(candidate.connections.length!==people.length||new Set(candidate.connections.map(connection=>connection?.profile)).size!==people.length)continue;
  const relevance:Record<string,number>={},evidence:Match['evidence']=[],connections:NonNullable<Match['connections']>=[];
  const distinctLabels=new Set<string>();let valid=true,referenced=0;
  for(const person of people){
   const connection=candidate.connections.find(item=>item.profile===person.id);
   const connectionReason=candidateText(connection?.reason,2,240);
   if(!connection||typeof connection!=='object'||Array.isArray(connection)||Object.keys(connection).some(key=>!['profile','interests','reason'].includes(key))||!referenceId(connection.profile,1,100)||!peopleById.has(connection.profile)||!Array.isArray(connection.interests)||!connection.interests.length||connection.interests.length>6||!connectionReason||connection.interests.some(interestId=>!referenceId(interestId,1,100))||new Set(connection.interests).size!==connection.interests.length){valid=false;break;}
   const actual=new Map(positiveInterests(person).map(interest=>[interest.id,interest]));
   const resolved:Interest[]=[];const indexes:number[]=[];
   for(const interestId of connection.interests){
    const interest=actual.get(interestId),index=itemIndexes.get(itemKey(person.id,interestId)),representative=itemInterests.get(itemKey(person.id,interestId));
    if(!interest||!representative||index===undefined||avoids.has(canonical(interest.label))){valid=false;break;}
    resolved.push(representative);indexes.push(index);distinctLabels.add(canonical(interest.label));
   }
   if(!valid)break;
   const candidateVector=vectors[items.length+candidateIndex];
   const memberRelevance=Math.max(...indexes.map(index=>cosine(vectors[index],candidateVector)));
   if(!Number.isFinite(memberRelevance)||memberRelevance<BRIDGE_THRESHOLDS.perMemberRelevance){valid=false;break;}
   relevance[person.id]=memberRelevance;referenced+=resolved.length;
   evidence.push(...resolved.map(interest=>({profile:person.id,label:interest.label,...(interest.source?{source:interest.source}:{})})));
   connections.push({profile:person.id,interests:connection.interests.slice(),reason:connectionReason});
  }
  const consensus=harmonicMean(people.map(person=>relevance[person.id]||0));
  if(!valid||distinctLabels.size<2||consensus<BRIDGE_THRESHOLDS.harmonicConsensus)continue;
  const coverage=Math.min(1,referenced/Math.max(1,people.length));
  const conversationScore=.60*consensus+.20*coverage+.20*specificity;
  const evidenceStamp=bridgeEvidenceStamp(people,connections);if(!evidenceStamp)continue;
  accepted.push({id,label,category,kind:'bridge',members:people.map(person=>person.id),evidence,reason,similarity:consensus,relevance,consensus,conversationScore,validation:{model:'Qwen3-Embedding-0.6B',coverage,specificity,evidenceStamp},connections});
 }
 const ranked=accepted.sort((a,b)=>(b.conversationScore||0)-(a.conversationScore||0)||a.id.localeCompare(b.id)),seen=new Set<string>();
 return ranked.filter(match=>{if([...seen].some(label=>sameTopic(match.label,label)))return false;seen.add(match.label);return true;}).slice(0,BRIDGE_THRESHOLDS.maxCandidates);
}

export function rankConversationTopics(direct:Match[],bridges:Match[],people:Profile[]):Match[]{
 const rankedDirect=direct.map(match=>{const result=conversationTopicScore(match,people);return {...match,relevance:{...match.relevance,...result.relevance},consensus:result.consensus,conversationScore:result.conversationScore};});
 const usableBridges=shouldDiscoverBridge(direct,people)?bridges.flatMap(match=>{const result=conversationTopicScore(match,people);return match.kind==='bridge'&&match.validation?.model==='Qwen3-Embedding-0.6B'&&result.consensus>=BRIDGE_THRESHOLDS.harmonicConsensus&&people.every(person=>match.members.includes(person.id)&&match.evidence.some(item=>item.profile===person.id)&&(match.relevance?.[person.id]||0)>=BRIDGE_THRESHOLDS.perMemberRelevance)?[{...match,consensus:result.consensus,conversationScore:result.conversationScore}]:[];}):[];
 return [...rankedDirect,...usableBridges].sort((a,b)=>(b.conversationScore||0)-(a.conversationScore||0)||a.label.localeCompare(b.label));
}
