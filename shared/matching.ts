export type Preference='like'|'avoid'|'explore';
export type SourceEvidence={kind:'youtube'|'linkedin'|'demo';label:string;detail?:string;url?:string};
export type Interest={id:string;label:string;category:string;shared:boolean;preference?:Preference;source?:SourceEvidence};
export type Profile={id:string;name:string;bio:string;color:string;interests:Interest[];avatar?:string;instagramHandle?:string;instagramVisible?:boolean;linkedinHandle?:string;linkedinVisible?:boolean;isDemo?:boolean};
export type Match={id:string;label:string;category:string;kind:'exact'|'related'|'ai'|'bridge';members:string[];evidence:{profile:string;label:string;source?:SourceEvidence}[];reason:string;similarity?:number;relevance?:Record<string,number>;consensus?:number;conversationScore?:number;validation?:{model:'Qwen3-Embedding-0.6B';coverage:number;specificity:number;evidenceStamp?:string};connections?:{profile:string;interests:string[];reason?:string}[]};
export const categories=['전체','음악','게임','여행','운동','콘텐츠','음식','공부·일','기타'];
export const preferenceNames={like:'좋아해요',avoid:'피하고 싶어요',explore:'해보고 싶어요'};
export const preferenceQuestions={like:'무엇을 좋아해요?',avoid:'무엇을 싫어하거나 피하고 싶어요?',explore:'새롭게 해보고 싶은 것은요?'};
export function preferenceOf(t:Interest):Preference{return t.preference||'like';}
export function positiveInterests(p:Profile){return p.interests.filter(t=>t.shared&&preferenceOf(t)!=='avoid');}
export function eligibleMatches(matches:Match[],profiles:Profile[]){
 return matches.filter(m=>{
  const relevant=m.kind==='bridge'?profiles.filter(profile=>m.members.includes(profile.id)):profiles;
  const avoided=new Set(relevant.flatMap(p=>p.interests.filter(t=>t.shared&&preferenceOf(t)==='avoid').map(t=>t.category+':'+canonical(t.label))));
  if(avoided.has(m.category+':'+canonical(m.label))||m.evidence.some(e=>avoided.has(m.category+':'+canonical(e.label))))return false;
  if(m.kind!=='bridge')return true;
  const avoidedLabels=new Set(relevant.flatMap(p=>p.interests.filter(t=>t.shared&&preferenceOf(t)==='avoid').map(t=>canonical(t.label))));
  return !avoidedLabels.has(canonical(m.label))&&!m.evidence.some(e=>avoidedLabels.has(canonical(e.label)));
 });
}
const aliases:Record<string,string>={'데이식스':'day6','데식':'day6','day6':'day6','하데스':'hades','hades':'hades','인공지능':'ai','ai/ml':'ai','머신러닝':'machinelearning','기계학습':'machinelearning','넷플릭스':'netflix'};
export function canonical(s:string){const k=s.toLowerCase().replace(/[\s·_\-]/g,'');return aliases[k]||k;}
const concepts=[{label:'일본 여행',category:'여행',words:['일본','교토','오사카','도쿄','후쿠오카']},{label:'데이터·AI',category:'공부·일',words:['인공지능','머신러닝','기계학습','데이터','machinelearning']},{label:'야외 활동',category:'운동',words:['러닝','등산','하이킹','트레킹']}];
export function findMatches(profiles:Profile[]):Match[]{
 const map=new Map<string,Match>();
 for(const p of profiles)for(const t of positiveInterests(p)){
  const key=canonical(t.label);if(!key)continue;
  let m=map.get(key);if(!m){m={id:'exact-'+key,label:key==='day6'?'DAY6':t.label,category:t.category,kind:'exact',members:[],evidence:[],reason:'좋아하거나 해보고 싶은 관심사가 겹쳐요.'};map.set(key,m);}
  if(!m.members.includes(p.id)){m.members.push(p.id);m.evidence.push({profile:p.id,label:t.label,...(t.source?{source:t.source}:{})});}
 }
 const result=[...map.values()].filter(x=>x.members.length>=2);
 for(const c of concepts){const evidence=profiles.flatMap(p=>{const t=positiveInterests(p).find(t=>c.words.some(w=>canonical(t.label).includes(canonical(w))));return t?[{profile:p.id,label:t.label,...(t.source?{source:t.source}:{})}]:[];});
  if(evidence.length<2||new Set(evidence.map(x=>canonical(x.label))).size<2)continue;
  result.push({id:'related-'+c.label,label:c.label,category:c.category,kind:'related',members:evidence.map(x=>x.profile),evidence,reason:'서로 다른 항목을 같은 관심 분야로 묶었어요.'});}
 return eligibleMatches(result,profiles).sort((a,b)=>b.members.length-a.members.length||(a.kind==='exact'?0:1)-(b.kind==='exact'?0:1)||a.label.localeCompare(b.label));
}
export function normalizeInstagram(value:string){
 let s=value.trim();if(!s)return '';
 if(/^https?:\/\//i.test(s)){try{const u=new URL(s);if(!['instagram.com','www.instagram.com'].includes(u.hostname)||u.username||u.password||u.port)throw new Error();const parts=u.pathname.split('/').filter(Boolean);if(parts.length!==1)throw new Error();s=parts[0];}catch{throw new Error('Instagram 아이디 또는 프로필 링크를 확인해주세요.');}}
 s=s.replace(/^@/,'').toLowerCase();if(!/^[a-z0-9_][a-z0-9_.]{0,29}$/.test(s)||s.endsWith('.')||s.includes('..')||['accounts','explore','direct','p','reel','reels','stories'].includes(s))throw new Error('Instagram 아이디는 영문·숫자·밑줄·마침표로 1~30자 입력해주세요.');return s;
}
export function normalizeLinkedIn(value:string){
 let s=value.trim();if(!s)return '';
 if(/^https?:\/\//i.test(s)){try{const u=new URL(s);if(!['linkedin.com','www.linkedin.com'].includes(u.hostname)||u.username||u.password||u.port)throw new Error();const parts=u.pathname.split('/').filter(Boolean);if(parts.length!==2||parts[0]!=='in')throw new Error();s=decodeURIComponent(parts[1]);}catch{throw new Error('LinkedIn 개인 프로필 아이디 또는 링크를 확인해주세요.');}}
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,99}$/.test(s))throw new Error('LinkedIn 프로필 아이디는 영문·숫자·밑줄·하이픈으로 2~100자 입력해주세요.');return s.toLowerCase();
}
export function contactOrSensitive(s:string){return /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}|\d{6}[- ]?[1-4]\d{6}|https?:\/\/|비밀번호|비번|주민등록)/i.test(s);}
export const demo:Profile[]=[
 {id:'demo-a',name:'혜진',bio:'음악, 게임, 가끔은 여행',color:'#3154F5',interests:[['DAY6','음악'],['하데스','게임'],['교토 여행','여행'],['머신러닝','공부·일'],['러닝','운동']].map(([label,category],i)=>({id:'a'+i,label,category,shared:true}))},
 {id:'demo-b',name:'지우',bio:'좋아하는 건 오래 좋아해요',color:'#E54B31',interests:[['데이식스','음악'],['일본 여행','여행'],['데이터 분석','공부·일'],['클라이밍','운동'],['커피','음식']].map(([label,category],i)=>({id:'b'+i,label,category,shared:true}))},
 {id:'demo-c',name:'민서',bio:'플레이리스트 수집 중',color:'#9B53DC',interests:[['DAY6','음악'],['오사카 여행','여행'],['러닝','운동'],['영화','콘텐츠'],['커피','음식']].map(([label,category],i)=>({id:'c'+i,label,category,shared:true}))},
 {id:'demo-d',name:'준호',bio:'함께 게임할 사람 찾는 중',color:'#19876E',interests:[['하데스','게임'],['일본 여행','여행'],['클라이밍','운동'],['영화','콘텐츠'],['사진','기타']].map(([label,category],i)=>({id:'d'+i,label,category,shared:true}))}
];
