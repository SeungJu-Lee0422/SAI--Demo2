import {canonical,positiveInterests,eligibleMatches,type Profile,type Match} from './matching.ts';
export function interestScore(m:Match,people:Profile[]){const ids=new Set(people.map(p=>p.id));const coverage=m.members.filter(id=>ids.has(id)).length/Math.max(1,people.length);return Math.round(100*coverage*(m.kind==='exact'?1:Math.min(1,Math.max(0,m.similarity??.6))));}
export function rankInterests(matches:Match[],people:Profile[]){
 const ids=new Set(people.map(p=>p.id));
 const scoped=matches.map(m=>({...m,members:m.members.filter(id=>ids.has(id)),evidence:m.evidence.filter(e=>ids.has(e.profile))})).filter(m=>m.members.length>=2);
 return eligibleMatches(scoped,people).sort((a,b)=>interestScore(b,people)-interestScore(a,people)||b.members.length-a.members.length||a.label.localeCompare(b.label));
}
export function suggestGroups(people:Profile[],matches:Match[],size=4,mode:PlanMode='cohesion'){
 const safe=eligibleMatches(matches,people);const limit=Math.max(2,Math.min(6,size));
 const tags=new Map(people.map(p=>[p.id,positiveInterests(p)]));
 const key=(a:string,b:string)=>JSON.stringify([a,b].sort());const edgesByPair=new Map<string,Match[]>();const pairCache=new Map<string,number>();
 for(const m of safe)for(let i=0;i<m.members.length;i++)for(let j=i+1;j<m.members.length;j++){const k=key(m.members[i],m.members[j]);const list=edgesByPair.get(k)||[];list.push(m);edgesByPair.set(k,list);}
 const pair=(a:string,b:string)=>{
  const k=key(a,b);if(pairCache.has(k))return pairCache.get(k)!;
  const aa=tags.get(a)||[],bb=tags.get(b)||[];if(!aa.length||!bb.length)return 0;
  const edges=edgesByPair.get(k)||[];if(!edges.length){pairCache.set(k,0);return 0;}
  const best=(from:string,to:string)=>{const own=tags.get(from)||[],other=tags.get(to)||[];return own.reduce((sum,t)=>sum+Math.max(0,...other.map(u=>Math.max(0,...edges.filter(m=>m.category===t.category&&m.evidence.some(e=>e.profile===from&&canonical(e.label)===canonical(t.label))&&m.evidence.some(e=>e.profile===to&&canonical(e.label)===canonical(u.label))).map(m=>m.kind==='exact'?1:m.similarity||.6)))),0)/own.length;};
  const score=(best(a,b)+best(b,a))/2;pairCache.set(k,score);return score;
 };
 // Complete-link grouping: every new member must have a positive connection to every member.
 // No forced placement of people without evidence. Stable ties use profile IDs.
 let clusters=people.map(p=>[p.id]).sort((a,b)=>a[0].localeCompare(b[0]));
 while(true){let chosen:[number,number]|null=null,best=0;
  for(let i=0;i<clusters.length;i++)for(let j=i+1;j<clusters.length;j++){
   if(clusters[i].length+clusters[j].length>limit)continue;
   const scores=clusters[i].flatMap(a=>clusters[j].map(b=>pair(a,b)));const min=Math.min(...scores);
   if(min<=0)continue;const mean=scores.reduce((a,b)=>a+b,0)/scores.length;const combined=clusters[i].length+clusters[j].length;
   const score=mode==='cohesion'?min:mode==='balance'?.55*min+.45*combined/limit:.5*mean+.5*min+.05*(clusters[i].length===1||clusters[j].length===1?1:0);
   if(score>best){best=score;chosen=[i,j];}
  }
  if(!chosen)break;const [i,j]=chosen;clusters[i]=[...clusters[i],...clusters[j]].sort();clusters.splice(j,1);
 }
 const groups=clusters.filter(c=>c.length>1).map(ids=>{const scores=ids.flatMap((a,i)=>ids.slice(i+1).map(b=>pair(a,b)));const evidence=rankInterests(safe.filter(m=>m.members.filter(id=>ids.includes(id)).length>=2),people.filter(p=>ids.includes(p.id)));return {ids,score:scores.reduce((a,b)=>a+b,0)/scores.length,interests:evidence.slice(0,3)};}).sort((a,b)=>b.score-a.score||b.ids.length-a.ids.length);
 return {groups,unassigned:clusters.filter(c=>c.length===1).flat(),pair};
}

export type PlanMode='cohesion'|'balance'|'coverage';
export type GroupPlan={mode:PlanMode;groups:{ids:string[];score:number;interests:Match[];metrics?:GroupMetrics}[];unassigned:string[];score:number;minScore:number;range:number;algorithm:string;solverStatus?:string;candidateCount?:number;candidateScope?:'exhaustive'|'bounded'};
export type GroupMetrics={topicStrength:number;memberBalance:number;topicBreadth:number;pairCoverage:number;utility:number};
export function scoreGroup(people:Profile[],matches:Match[],ids:string[]):GroupMetrics{
 const pp=people.filter(p=>ids.includes(p.id)),topics=rankInterests(matches,pp).slice(0,3);
 const weights=topics.map(m=>interestScore(m,pp)/100);
 const topicStrength=weights.length?weights.reduce((sum,n)=>sum+n,0)/weights.length:0;
 const memberSupport=pp.map(p=>Math.max(0,...topics.filter(m=>m.members.includes(p.id)).map(m=>m.kind==='exact'?1:m.similarity??.6)));
 const memberBalance=memberSupport.length?Math.min(...memberSupport):0;
 const topicBreadth=Math.min(1,new Set(topics.map(m=>m.category)).size/3);
 const linkedPairs=new Set<string>();
 for(const m of topics)for(let i=0;i<m.members.length;i++)for(const other of m.members.slice(i+1))linkedPairs.add(JSON.stringify([m.members[i],other].sort()));
 const pairCoverage=linkedPairs.size/Math.max(1,pp.length*(pp.length-1)/2);
 return {topicStrength,memberBalance,topicBreadth,pairCoverage,utility:.4*topicStrength+.25*memberBalance+.15*topicBreadth+.2*pairCoverage};
}
export function groupPlans(people:Profile[],matches:Match[],size:number){
 if(!people.length)return [];
 const limit=Math.max(3,Math.min(6,size)),base=suggestGroups(people,matches,limit),pair=base.pair;
 const ids=people.map(p=>p.id).sort();
 const tags=new Map(people.map(p=>[p.id,positiveInterests(p)]));
 const degree=new Map(ids.map(id=>[id,ids.filter(other=>other!==id&&pair(id,other)>0).length]));
 const stableMatch=(m:Match):Match=>({...m,members:m.members.slice().sort(),evidence:m.evidence.slice().sort((a,b)=>a.profile.localeCompare(b.profile)||canonical(a.label).localeCompare(canonical(b.label)))});
 const plans:GroupPlan[]=[]; const seen=new Set<string>();
 const balancedOrder=[...ids].sort((a,b)=>(degree.get(a)||0)-(degree.get(b)||0)||a.localeCompare(b)),zigzag:string[]=[];
 for(let left=0,right=balancedOrder.length-1;left<=right;left++,right--){zigzag.push(balancedOrder[left]);if(left<right)zigzag.push(balancedOrder[right]);}
 const coverageOrder=[...ids].sort((a,b)=>(tags.get(b)?.length||0)-(tags.get(a)?.length||0)||(degree.get(b)||0)-(degree.get(a)||0)||a.localeCompare(b));
 if(coverageOrder.length>1)coverageOrder.push(coverageOrder.shift()!);
 const variants:{mode:PlanMode;groups:string[][];unassigned:string[]}[]=[{mode:'cohesion',groups:base.groups.map(g=>g.ids),unassigned:base.unassigned}];
 for(const [mode,order] of [['balance',zigzag],['coverage',coverageOrder]] as [PlanMode,string[]][]){
  const remaining=new Set(order),groups:string[][]=[],unassigned:string[]=[];
  for(const seed of order){if(!remaining.delete(seed))continue;const group=[seed];
   while(group.length<limit){let best:string|undefined,bestScore=-Infinity;
    for(const id of order){if(!remaining.has(id))continue;const vals=group.map(other=>pair(id,other));if(vals.some(value=>value<=0))continue;
     const min=Math.min(...vals),mean=vals.reduce((sum,value)=>sum+value,0)/vals.length;
     const score=mode==='balance'?2*min+mean-.001*(degree.get(id)||0):min+mean+.001*(tags.get(id)?.length||0);
     if(score>bestScore){best=id;bestScore=score;}
    }
    if(!best)break;group.push(best);remaining.delete(best);
   }
   if(group.length>1)groups.push(group.sort());else unassigned.push(seed);
  }
  variants.push({mode,groups,unassigned:unassigned.sort()});
 }
 for(const {mode,groups,unassigned} of variants){
  if(!groups.length)continue;
  const signature=groups.map(g=>g.slice().sort().join(',')).sort().join('|');if(seen.has(signature))continue;seen.add(signature);
  const outGroups=groups.map(g=>{const vals=g.flatMap((a,i)=>g.slice(i+1).map(b=>pair(a,b)));const cohesion=vals.reduce((a,b)=>a+b,0)/vals.length;const pp=people.filter(p=>g.includes(p.id));const interests=rankInterests(matches.filter(m=>m.members.filter(id=>g.includes(id)).length>=2),pp).slice(0,3).map(stableMatch);return {ids:g.slice().sort(),score:cohesion,interests};}).sort((a,b)=>a.ids[0].localeCompare(b.ids[0]));
  const weights=outGroups.map(g=>g.ids.length*(g.ids.length-1)/2),totalPairs=weights.reduce((a,b)=>a+b,0);
  const total=outGroups.reduce((sum,g,i)=>sum+g.score*weights[i],0)/totalPairs;
  plans.push({mode,groups:outGroups,unassigned:unassigned.slice().sort(),score:Math.round(total*100),minScore:Math.round(Math.min(...outGroups.map(g=>g.score))*100),range:Math.round((Math.max(...outGroups.map(g=>g.score))-Math.min(...outGroups.map(g=>g.score)))*100),algorithm:'deterministic-complete-link'});
 }
 return plans;
}
