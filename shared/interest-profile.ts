import {canonical,preferenceOf,type Profile,type Interest} from './matching.ts';

export type PersonalTopic={id:string;label:string;category:string;score:number;evidence:Interest[]};

// The owner can analyze their own private imports. Sharing is a separate decision.
export function personalItems(person:Profile):Interest[]{
 return person.interests.filter(t=>preferenceOf(t)!=='avoid').slice(0,100);
}

export function personalTexts(person:Profile):string[]{
 return personalItems(person).map(t=>`${t.category} 관심사: ${t.label}${t.source?.detail?` · ${t.source.detail.slice(0,240)}`:''}`);
}

export function rankPersonal(person:Profile,vectors:number[][]):PersonalTopic[]{
 const items=personalItems(person);
 if(items.length!==vectors.length)throw new Error('관심사와 분석 벡터 수가 다릅니다.');
 if(vectors.some(v=>!v.length||v.some(x=>!Number.isFinite(x))||v.length!==vectors[0]?.length))throw new Error('분석 벡터 형식을 확인해주세요.');
 const cosine=(a:number,b:number)=>vectors[a].reduce((sum,x,k)=>sum+x*vectors[b][k],0);
 const remaining=new Set(items.map((_,i)=>i)),topics:PersonalTopic[]=[];
 while(remaining.size){
  const anchor=[...remaining].sort((a,b)=>{
   const support=(i:number)=>[...remaining].filter(j=>items[i].category===items[j].category&&cosine(i,j)>=.75).length;
   return support(b)-support(a)||items[a].label.localeCompare(items[b].label);
  })[0];
  const indexes=[...remaining].filter(i=>items[i].category===items[anchor].category&&(canonical(items[i].label)===canonical(items[anchor].label)||cosine(anchor,i)>=.75));
  if(!indexes.includes(anchor))indexes.push(anchor);
  indexes.forEach(i=>remaining.delete(i));
  const strength=indexes.reduce((sum,i)=>sum+Math.max(0,Math.min(1,cosine(anchor,i))),0)/indexes.length;
  const support=Math.min(1,indexes.length/4);
  topics.push({id:`personal-${items[anchor].id}`,label:items[anchor].label,category:items[anchor].category,score:Math.round(100*(.7*strength+.3*support)),evidence:indexes.map(i=>items[i])});
 }
 return topics.sort((a,b)=>b.score-a.score||b.evidence.length-a.evidence.length||a.label.localeCompare(b.label));
}
