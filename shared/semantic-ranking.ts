import {canonical,positiveInterests,eligibleMatches,type Profile,type Match} from './matching.ts';

export function embeddingItems(people:Profile[]){
 return people.flatMap(p=>positiveInterests(p).map(t=>({profile:p.id,...t})));
}
export function embeddingTexts(people:Profile[]){return embeddingItems(people).map(t=>t.category+' 관심사: '+t.label);}
export function rankSemantic(people:Profile[],vectors:number[][]):Match[]{
 const tags=embeddingItems(people);if(tags.length!==vectors.length)throw new Error('관심사와 벡터 수가 다릅니다.');
 if(vectors.some(v=>!v.length||v.length!==vectors[0]?.length||v.some(x=>!Number.isFinite(x))))throw new Error('분석 벡터 형식을 확인해주세요.');
 const cosine=(a:number,b:number)=>vectors[a].reduce((sum,v,k)=>sum+v*vectors[b][k],0);
 const matches:Match[]=[],seen=new Set<string>();
 // Each member needs direct evidence to the anchor; transitive pairs alone cannot prove a group topic.
 for(let i=0;i<tags.length;i++){
  const anchor=tags[i],byMember=new Map<string,{index:number;score:number}>();
  byMember.set(anchor.profile,{index:i,score:1});
  for(let j=0;j<tags.length;j++){
   const candidate=tags[j];if(candidate.profile===anchor.profile||candidate.category!==anchor.category)continue;
   const score=cosine(i,j);if(score<.75)continue;
   if(!byMember.has(candidate.profile)||score>byMember.get(candidate.profile)!.score)byMember.set(candidate.profile,{index:j,score});
  }
  const selected=[...byMember.values()];
  if(selected.length<2||selected.every(x=>canonical(tags[x.index].label)===canonical(anchor.label)))continue;
  const signature=selected.map(x=>tags[x.index].profile+':'+tags[x.index].id).sort().join('|');
  if(seen.has(signature))continue;seen.add(signature);
  const labels=[...new Set(selected.map(x=>tags[x.index].label))];
  matches.push({id:'qwen3-'+matches.length,label:labels.slice(0,2).join(' · '),category:anchor.category,kind:'ai',similarity:Math.min(...selected.map(x=>x.score)),members:[...byMember.keys()],evidence:selected.map(x=>{const t=tags[x.index];return {profile:t.profile,label:t.label,...(t.source?{source:t.source}:{})};}),reason:'각 구성원의 관심사가 하나의 주제에 직접 연결되는 근거를 찾았어요.'});
 }
 return eligibleMatches(matches,people).sort((a,b)=>b.members.length-a.members.length||(b.similarity||0)-(a.similarity||0));
}
