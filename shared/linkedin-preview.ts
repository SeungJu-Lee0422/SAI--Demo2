import {canonical,contactOrSensitive} from './matching.ts';

export const LINKEDIN_TEXT_LIMIT=20000;
export type LinkedInCandidate={label:string;category:string;evidence:string};
const sections=new Map([
 ['skills','공부·일'],['skill','공부·일'],['specialties','공부·일'],['expertise','공부·일'],
 ['기술','공부·일'],['보유 기술','공부·일'],['스킬','공부·일'],['전문 분야','공부·일'],
 ['interests','기타'],['interest','기타'],['관심사','기타'],['관심 분야','기타'],
]);
const otherSections=new Set(['experience','work experience','education','projects','contact','about','summary','languages','certifications','licenses & certifications','licenses and certifications','volunteering','recommendations','honors & awards','경력','학력','프로젝트','연락처','소개','요약','언어','자격증','보유 자격증','봉사','추천','수상']);
const phone=/(?:(?:\+82[-\s]?)?(?:0[2-6]\d?|070)|\+82[-\s]?[2-6]\d?)[-\s]?\d{3,4}[-\s]?\d{4}/;

export function previewLinkedInText(text:string):LinkedInCandidate[]{
 const candidates:LinkedInCandidate[]=[],seen=new Set<string>();let category:string|undefined;
 function add(value:string){
  const label=value.trim().replace(/^[-*•▪◦]+\s*/,'').trim();
  if(!category||!label||label.length>60||contactOrSensitive(label)||phone.test(label)||/[\u0000-\u001f\u007f]/.test(label)||/(?:^|\s)(?:www\.|linkedin\.com\/|@[a-z0-9_.-]{2,})/i.test(label))return;
  const key=category+':'+canonical(label);if(seen.has(key)||candidates.length>=30)return;
  seen.add(key);candidates.push({label,category,evidence:label});
 }
 for(const raw of text.slice(0,LINKEDIN_TEXT_LIMIT).split(/\r?\n/)){
  const line=raw.trim();if(!line){category=undefined;continue;}
  const colon=line.search(/[:：]/),heading=(colon<0?line:line.slice(0,colon)).trim().toLowerCase();
  if(sections.has(heading)){category=sections.get(heading);if(colon>=0)line.slice(colon+1).split(/[,;|·]/).forEach(add);continue;}
  if(colon>=0||otherSections.has(heading)){category=undefined;continue;}
  if(category)line.split(/[,;|·]/).forEach(add);
 }
 return candidates;
}
