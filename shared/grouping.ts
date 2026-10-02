import {canonical,positiveInterests,eligibleMatches,type Profile,type Match} from './matching.ts';
export function rankInterests(matches:Match[],people:Profile[]){return eligibleMatches(matches,people).slice().sort((a,b)=>b.members.length-a.members.length||(a.kind==='exact'?0:1)-(b.kind==='exact'?0:1)||(b.similarity||0)-(a.similarity||0)||a.label.localeCompare(b.label));}
export function suggestGroups(people:Profile[],matches:Match[],size=4){
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
   if(min>best){best=min;chosen=[i,j];}
  }
  if(!chosen)break;const [i,j]=chosen;clusters[i]=[...clusters[i],...clusters[j]].sort();clusters.splice(j,1);
 }
 const groups=clusters.filter(c=>c.length>1).map(ids=>{const scores=ids.flatMap((a,i)=>ids.slice(i+1).map(b=>pair(a,b)));const evidence=rankInterests(safe.filter(m=>m.members.filter(id=>ids.includes(id)).length>=2),people);return {ids,score:scores.reduce((a,b)=>a+b,0)/scores.length,interests:evidence.slice(0,3)};}).sort((a,b)=>b.score-a.score||b.ids.length-a.ids.length);
 return {groups,unassigned:clusters.filter(c=>c.length===1).flat(),pair};
}
