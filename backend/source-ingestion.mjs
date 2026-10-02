import {canonical,contactOrSensitive} from '../shared/matching.ts';

const headings=new Map([
 ['skills','skill'],['skill','skill'],['기술','skill'],['보유 기술','skill'],
 ['experience','career'],['work experience','career'],['경력','career'],
 ['education','education'],['학력','education'],
 ['projects','project'],['project','project'],['프로젝트','project'],
 ['contact',''],['연락처',''],['about',''],['소개',''],['languages',''],['언어',''],['licenses & certifications',''],['자격증',''],['volunteering',''],['봉사',''],['recommendations',''],['추천',''],['honors & awards',''],['수상',''],
]);
const ignored=/^(?:contact|연락처|email|이메일|phone|전화|address|주소|profile|프로필|summary|요약|about|소개|name|이름)$/i;
const dates=/\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(?:present|현재|재직 중)\b/gi;

function cleanLine(value){
 let line=String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/^[-•▪◦*]+\s*/,'').replace(/\s+/g,' ').trim();
 if(!line||line.length>240||ignored.test(line)||contactOrSensitive(line)||/(?:^|\s)(?:www\.|linkedin\.com\/|@[a-z0-9_.-]{2,})/i.test(line))return '';
 line=line.replace(dates,'').replace(/\s*[–—-]\s*/g,' · ').replace(/(?:^|\s)\d{1,2}\s*(?:년|개월)(?=\s|$)/g,' ').replace(/\s+/g,' ').replace(/^[·,;|\s]+|[·,;|\s]+$/g,'');
 return line.length>=2?line:'';
}

function candidate(label,section,evidence=label){const value=cleanLine(label);if(!value)return null;const compact=value.length>60?value.slice(0,57).trimEnd()+'…':value;return {label:compact,category:'공부·일',evidence:cleanLine(evidence).slice(0,240),section};}

export function parseLinkedInText(input){
 const lines=String(input||'').slice(0,50000).split(/\r?\n/),out=[];let section='';
 for(const raw of lines){
  const trimmed=raw.trim(),inline=trimmed.match(/^([^:]{2,30}):\s*(.+)$/),headingKey=trimmed.replace(/:\s*$/,'').toLocaleLowerCase();
  if(headings.has(headingKey)){section=headings.get(headingKey);continue;}
  if(inline){const inlineKey=inline[1].trim().toLocaleLowerCase();if(headings.has(inlineKey)){section=headings.get(inlineKey);if(section)for(const part of inline[2].split(/[,;|·]/)){const row=candidate(part,section,part);if(row)out.push(row);}continue;}}
  if(!section)continue;
  if(section==='skill'){for(const part of trimmed.split(/[,;|·]/)){const row=candidate(part,section,part);if(row)out.push(row);}}
  else {const row=candidate(trimmed,section,trimmed);if(row)out.push(row);}
 }
 const seen=new Set();return out.filter(x=>{const k=canonical(x.label);if(!k||seen.has(k))return false;seen.add(k);return true;}).slice(0,40);
}

export function mergeSourceInterests(existing,candidates,kind){
 const out=Array.isArray(existing)?existing.filter(x=>x&&typeof x==='object'&&typeof x.label==='string'&&typeof x.category==='string'):[],seen=new Set(out.map(x=>`${x.category}:${canonical(x.label)}`));
 for(const c of candidates){if(!c||typeof c.label!=='string'||contactOrSensitive(c.label))continue;const category=['음악','게임','여행','운동','콘텐츠','음식','공부·일','기타'].includes(c.category)?c.category:'기타',k=`${category}:${canonical(c.label)}`;if(seen.has(k))continue;seen.add(k);const detail=typeof c.evidence==='string'?c.evidence.slice(0,240):'',url=typeof c.url==='string'&&/^https:\/\/(?:www\.)?youtube\.com\//.test(c.url)?c.url:undefined;out.push({id:crypto.randomUUID(),label:c.label.slice(0,60),category,shared:false,preference:'like',source:{kind,label:c.label.slice(0,60),...(detail?{detail}:{}),...(url?{url}:{})}});}
 return out.slice(0,100);
}

export function sourceSummary(row){
 if(!row)return {youtube:{status:'never',itemCount:0,candidateCount:0,updated:null,summary:null,samples:[],counts:{}},linkedin:{status:'never',itemCount:0,candidateCount:0,updated:null,summary:null,samples:[],counts:{}}};
 const parse=value=>{try{return value?JSON.parse(value):null;}catch{return null;}};
 const normalized=(kind,status,value)=>{const summary=parse(value),data=summary&&typeof summary==='object'?summary:{},channels=kind==='youtube'&&Array.isArray(data.channels)?data.channels.filter(channel=>channel&&typeof channel.id==='string'&&typeof channel.title==='string').map(channel=>({id:channel.id,title:channel.title,description:typeof channel.description==='string'?channel.description:'',url:typeof channel.url==='string'?channel.url:`https://www.youtube.com/channel/${encodeURIComponent(channel.id)}`})):undefined;return {status:status||'never',itemCount:Number(data.itemCount||0),candidateCount:Number(data.candidateCount||0),updated:row[`${kind}_updated`]||row.updated||null,summary,samples:Array.isArray(data.samples)?data.samples.slice(0,3):[],counts:data.counts&&typeof data.counts==='object'?data.counts:{},errors:Array.isArray(data.errors)?data.errors:[],...(channels?{channels}:{})};};
 return {youtube:normalized('youtube',row.youtube_status,row.youtube_summary),linkedin:normalized('linkedin',row.linkedin_status,row.linkedin_summary)};
}

export function youtubeCategory(...values){
 const text=values.filter(Boolean).join(' ').toLocaleLowerCase();
 const rules=[
  ['공부·일',/(?:\b(?:ai|ml|study|learn|education|course|lecture|coding|programming|developer|software|data science|machine learning|deep learning)\b|인공지능|머신러닝|딥러닝|데이터|공부|학습|강의|코딩|개발)/],
  ['음악',/(?:\b(?:music|song|singer|artist|band|album|jazz|rock|hip[ -]?hop|k[ -]?pop|j[ -]?pop|piano|guitar)\b|음악|노래|가수|밴드|앨범|재즈|피아노|기타 연주)/],
  ['게임',/(?:\b(?:game|gaming|gameplay|esports|minecraft|valorant)\b|게임|플레이|이스포츠)/],
  ['여행',/(?:\b(?:travel|trip|tour|journey)\b|여행|관광)/],
  ['운동',/(?:\b(?:workout|fitness|running|climbing|yoga|sports)\b|운동|러닝|클라이밍|요가|헬스)/],
  ['음식',/(?:\b(?:cooking|recipe|food|coffee|cafe|baking|mukbang)\b|요리|레시피|음식|커피|카페|베이킹|먹방)/],
  ['콘텐츠',/(?:\b(?:movie|film|anime|drama|book|reading)\b|영화|애니|드라마|독서|책)/],
 ];
 return rules.find(([,pattern])=>pattern.test(text))?.[0]||'콘텐츠';
}

export async function youtubeCandidates(accessToken,request=fetch){
 const headers={Authorization:`Bearer ${accessToken}`};
 async function get(path,params){const url=new URL('https://www.googleapis.com/youtube/v3/'+path);for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));const response=await request(url,{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`YouTube API ${path} failed (${response.status})`);return response.json();}
 const [subscriptionResult,playlistResult]=await Promise.allSettled([get('subscriptions',{part:'snippet',mine:'true',maxResults:25}),get('playlists',{part:'snippet',mine:'true',maxResults:10})]),errors=[],candidates=[],channels=[];
 const subscriptions=subscriptionResult.status==='fulfilled'?subscriptionResult.value:{items:[]};if(subscriptionResult.status==='rejected')errors.push('subscriptions');
 const playlists=playlistResult.status==='fulfilled'?playlistResult.value:{items:[]};if(playlistResult.status==='rejected')errors.push('playlists');
 const playlistRows=Array.isArray(playlists.items)?playlists.items.slice(0,5):[],itemResults=await Promise.allSettled(playlistRows.map(row=>get('playlistItems',{part:'snippet',playlistId:row.id,maxResults:5}))),itemPages=[];
 itemResults.forEach((result,index)=>{if(result.status==='fulfilled')itemPages.push(result.value);else errors.push(`playlistItems:${index+1}`);});
 for(const row of subscriptions.items||[]){const title=row?.snippet?.title,id=row?.snippet?.resourceId?.channelId;if(typeof title==='string'&&typeof id==='string'&&id){const description=typeof row.snippet.description==='string'?row.snippet.description:'';channels.push({id,title:title.slice(0,120),description:description.slice(0,500),url:`https://www.youtube.com/channel/${encodeURIComponent(id)}`});candidates.push({label:title,category:youtubeCategory(title,description),evidence:'구독 채널',url:`https://www.youtube.com/channel/${encodeURIComponent(id)}`});}}
 for(const row of playlistRows){const title=row?.snippet?.title;if(typeof title==='string')candidates.push({label:title,category:youtubeCategory(title,row?.snippet?.description),evidence:'내 재생목록',url:`https://www.youtube.com/playlist?list=${encodeURIComponent(row.id)}`});}
 for(const page of itemPages)for(const row of page.items||[]){const snippet=row?.snippet,title=snippet?.title;if(typeof title!=='string'||title==='Deleted video'||title==='Private video')continue;const videoId=snippet?.resourceId?.videoId;candidates.push({label:title,category:youtubeCategory(title,snippet.channelTitle,snippet.description),evidence:snippet.channelTitle?`재생목록 영상 · ${snippet.channelTitle}`:'재생목록 영상',url:videoId?`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`:undefined});}
 return {candidates,channels,counts:{subscriptions:(subscriptions.items||[]).length,playlists:playlistRows.length,items:itemPages.reduce((n,page)=>n+(page.items||[]).length,0)},errors,successfulCalls:(subscriptionResult.status==='fulfilled'?1:0)+(playlistResult.status==='fulfilled'?1:0)+itemPages.length};
}
