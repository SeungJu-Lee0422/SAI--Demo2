import {canonical,positiveInterests,eligibleMatches,type Profile,type Match} from './matching.ts';

export function embeddingItems(people:Profile[]){
 return people.flatMap(p=>positiveInterests(p).map(t=>({profile:p.id,...t})));
}
export function embeddingTexts(people:Profile[]){return embeddingItems(people).map(t=>t.category+' 관심사: '+t.label);}
export function rankSemantic(people:Profile[],vectors:number[][]):Match[]{
 const tags=embeddingItems(people);if(tags.length!==vectors.length)throw new Error('관심사와 벡터 수가 다릅니다.');
 const pairs:{a:typeof tags[number];b:typeof tags[number];score:number}[]=[];
 for(let i=0;i<tags.length;i++)for(let j=i+1;j<tags.length;j++){
  const a=tags[i],b=tags[j];if(a.profile===b.profile||a.category!==b.category||canonical(a.label)===canonical(b.label))continue;
  const score=vectors[i].reduce((n,v,k)=>n+v*vectors[j][k],0);
  // Candidate threshold only, not a calibrated probability of shared preference.
  if(Number.isFinite(score)&&score>=.75)pairs.push({a,b,score});
 }
 const matches:Match[]=pairs.sort((a,b)=>b.score-a.score).map((p,i)=>({id:'qwen3-'+i,label:p.a.label+' · '+p.b.label,category:p.a.category,kind:'related',similarity:p.score,members:[p.a.profile,p.b.profile],evidence:[{profile:p.a.profile,label:p.a.label},{profile:p.b.profile,label:p.b.label}],reason:'좋아하거나 해보고 싶은 항목에서 의미가 가까운 후보를 찾았어요. 같은 취향으로 확정한 것은 아니에요.'}));
 return eligibleMatches(matches,people);
}
