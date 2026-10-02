import {rankInterests,scoreGroup,groupPlans,suggestGroups} from '../shared/grouping.ts';

function combinations(values,size,visit,start=0,prefix=[]){
 if(!size){visit(prefix);return;}
 for(let i=start;i<=values.length-size;i++)combinations(values,size-1,visit,i+1,[...prefix,values[i]]);
}
function choose(n,k){let result=1;for(let i=1;i<=k;i++)result=result*(n-i+1)/i;return result;}

export function buildGroupCandidates(people,matches,size){
 const n=people.length,k=Math.ceil(n/size),low=Math.floor(n/k),high=Math.ceil(n/k),sizes=[...new Set([low,high])];
 const candidateScope=sizes.reduce((sum,g)=>sum+choose(n,g),0)<=16000?'exhaustive':'bounded';
 const bySignature=new Map(),ids=people.map(p=>p.id),indices=people.map((_,i)=>i),seedSignatures=[];
 function add(members){
  const sorted=members.slice().sort((a,b)=>a-b),signature=sorted.join(',');
  if(bySignature.has(signature))return;
  const groupIds=sorted.map(i=>ids[i]),metrics=scoreGroup(people,matches,groupIds);
  bySignature.set(signature,{members:sorted,ids:groupIds,...metrics,metrics});
 }
 // Seed a complete feasible cover so pruning can never leave a participant unplaceable.
 for(const plan of groupPlans(people,matches,size))for(const group of plan.groups)add(group.ids.map(id=>ids.indexOf(id)));
 const groupSizes=Array.from({length:k},(_,i)=>low+(i<n%k?1:0));
 for(let shift=0;shift<3;shift++){
  const order=indices.slice(shift).concat(indices.slice(0,shift)),cover=[];let offset=0;
  for(const count of groupSizes){const members=order.slice(offset,offset+count);offset+=count;add(members);cover.push(members.slice().sort((a,b)=>a-b).join(','));}
  seedSignatures.push(cover);
 }
 if(candidateScope==='exhaustive')for(const count of sizes)combinations(indices,count,add);
 else {
  const pair=suggestGroups(people,matches,size).pair;
  for(const anchor of indices){
   const neighbors=indices.filter(i=>i!==anchor).sort((a,b)=>pair(ids[anchor],ids[b])-pair(ids[anchor],ids[a])||a-b).slice(0,11);
   for(const count of sizes)combinations(neighbors,count-1,others=>add([anchor,...others]));
  }
 }
 const candidates=[...bySignature.values()],lookup=new Map(candidates.map((c,i)=>[c.members.join(','),i]));
 return {candidates,groupCount:k,candidateScope,hints:seedSignatures.map(cover=>cover.map(s=>lookup.get(s)))};
}

export function prepareOptimization(people,matches,size){
 if(![3,4,5].includes(size)||people.length<3||people.length>30||new Set(people.map(p=>p.id)).size!==people.length)throw new Error('편성은 3~30명과 테이블당 3/4/5명으로 설정해주세요.');
 const context=buildGroupCandidates(people,matches,size);
 return {...context,input:{count:people.length,groupCount:context.groupCount,hints:context.hints,candidates:context.candidates.map(c=>({members:c.members,utility:c.utility,pairCoverage:c.pairCoverage}))}};
}

export function formatOptimization(people,matches,context,results){
 const {candidates,candidateScope}=context;
 if(!Array.isArray(results)||results.some(r=>!r||!Array.isArray(r.indexes)||!['OPTIMAL','FEASIBLE'].includes(r.solverStatus)||!['cohesion','balance','coverage'].includes(r.mode)))throw new Error('CP-SAT 결과 형식을 확인해주세요.');
 if(!results.length)throw new Error('시간 안에 편성안을 찾지 못했어요. 참가자를 줄여 다시 시도해주세요.');
 return results.map(result=>{
  const groups=result.indexes.map(index=>{const c=candidates[index];if(!c)throw new Error('잘못된 후보 그룹입니다.');return {ids:c.ids,score:c.utility,metrics:c.metrics,interests:rankInterests(matches,people.filter(p=>c.ids.includes(p.id))).slice(0,3)};});
  const placed=groups.flatMap(g=>g.ids);if(placed.length!==people.length||new Set(placed).size!==people.length)throw new Error('참여자가 중복되거나 누락되었어요.');
  const scores=groups.map(g=>g.score),mean=scores.reduce((a,b)=>a+b,0)/scores.length;
  return {mode:result.mode,groups,unassigned:[],score:Math.round(mean*100),minScore:Math.round(Math.min(...scores)*100),range:Math.round((Math.max(...scores)-Math.min(...scores))*100),algorithm:'ortools-cp-sat',solverStatus:result.solverStatus,candidateCount:candidates.length,candidateScope};
 });
}
