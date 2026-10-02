import {timingSafeEqual} from 'node:crypto';
import {representativeInterests} from '../shared/conversation-topics.ts';
import {contactOrSensitive} from '../shared/matching.ts';
import {validateBridgeTopics as nativeValidateBridgeTopics} from './semantic.mjs';

const MAX_BODY_BYTES=1024*1024;

class InputError extends Error{
 constructor(status=400){super('invalid input');this.status=status;}
}

function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}

function safeText(value,min,max){
 if(typeof value!=='string'||value.length<min||value.length>max||/[\u0000-\u001f\u007f]/.test(value)||contactOrSensitive(value)||/@[a-z0-9_.-]{2,}|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/i.test(value))return '';
 const clean=value.replace(/\s+/g,' ').trim();return clean.length>=min&&clean.length<=max?clean:'';
}

function reference(value,max=100){
 if(typeof value!=='string'||!value.length||value.length>max||/[\u0000-\u001f\u007f]/.test(value))return '';
 if(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))return value;
 return safeText(value,1,max);
}

async function readBody(request){
 const lengthHeader=request.headers.get('content-length'),declared=Number(lengthHeader);
 if(lengthHeader!==null&&(!Number.isFinite(declared)||declared<=0||declared>MAX_BODY_BYTES))throw new InputError(413);
 if(!request.body)throw new InputError();
 const reader=request.body.getReader(),chunks=[];let size=0;
 while(true){
  const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;if(size>MAX_BODY_BYTES){try{await reader.cancel();}catch{}throw new InputError(413);}chunks.push(value);
 }
 if(!size)throw new InputError();
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new InputError();}
}

function sanitizedPeople(value){
 if(!Array.isArray(value)||value.length<2||value.length>30)throw new InputError();
 const ids=new Set(),profiles=[];
 for(const raw of value){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new InputError();
  const id=reference(raw.id,80);if(!id||ids.has(id)||!Array.isArray(raw.interests)||raw.interests.length>6)throw new InputError();
  ids.add(id);const interests=[];const interestIds=new Set();
  for(const item of raw.interests){
   if(!item||typeof item!=='object'||Array.isArray(item))throw new InputError();
   const interestId=reference(item.id),label=safeText(item.label,1,120),category=safeText(item.category,1,80);
   if(!interestId||interestIds.has(interestId)||!label||!category||typeof item.shared!=='boolean'||(item.preference!==undefined&&!['like','avoid','explore'].includes(item.preference)))throw new InputError();
   interestIds.add(interestId);let source;
   if(item.source!==undefined){
    if(!item.source||typeof item.source!=='object'||Array.isArray(item.source)||!['youtube','linkedin','demo'].includes(item.source.kind))throw new InputError();
    const sourceLabel=safeText(item.source.label,1,120),detail=item.source.detail===undefined?'':safeText(item.source.detail,1,240);
    source={kind:item.source.kind,label:sourceLabel||item.source.kind,...(detail?{detail}:{})};
   }
   interests.push({id:interestId,label,category,shared:item.shared,...(item.preference?{preference:item.preference}:{}),...(source?{source}:{})});
  }
  profiles.push({id,name:'',bio:'',color:'',interests});
 }
 const representatives=representativeInterests(profiles).map(person=>({id:person.id,interests:person.interests.map(item=>({id:item.id,label:item.label,category:item.category,shared:true,...(item.preference?{preference:item.preference}:{}),...(item.source?{source:{kind:item.source.kind,label:item.source.label,...(item.source.detail?{detail:item.source.detail}:{})}}:{})}))}));
 if(representatives.some(person=>!person.interests.length))throw new InputError();
 return representatives;
}

function validatedCandidates(value,people){
 if(!Array.isArray(value)||value.length<1||value.length>3)throw new InputError();
 const interestsByProfile=new Map(people.map(person=>[person.id,new Set(person.interests.map(item=>item.id))]));
 return value.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['id','label','category','reason','connections','confidence'].includes(key)))throw new InputError();
  const id=reference(raw.id,80),label=safeText(raw.label,2,80),category=safeText(raw.category,1,40),reason=safeText(raw.reason,4,360);
  if(!id||!label||!category||!reason||!Array.isArray(raw.connections)||raw.connections.length!==people.length||(raw.confidence!==undefined&&(!Number.isFinite(raw.confidence)||raw.confidence<0||raw.confidence>1)))throw new InputError();
  const seen=new Set(),connections=raw.connections.map(connection=>{
   if(!connection||typeof connection!=='object'||Array.isArray(connection)||Object.keys(connection).some(key=>!['profile','interests','reason'].includes(key)))throw new InputError();
   const profile=reference(connection.profile,80),connectionReason=safeText(connection.reason,2,240);
   if(!profile||seen.has(profile)||!interestsByProfile.has(profile)||!connectionReason||!Array.isArray(connection.interests)||connection.interests.length<1||connection.interests.length>6)throw new InputError();
   seen.add(profile);const interests=connection.interests.map(item=>reference(item));
   if(interests.some(item=>!item)||new Set(interests).size!==interests.length||interests.some(item=>!interestsByProfile.get(profile).has(item)))throw new InputError();
   return {profile,interests,reason:connectionReason};
  });
  if(seen.size!==people.length)throw new InputError();
  return {id,label,category,reason,connections,...(raw.confidence===undefined?{}:{confidence:raw.confidence})};
 });
}

function validatedDirect(value){
 if(!Array.isArray(value)||value.length>600)throw new InputError();
 return value.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['label','category'].includes(key)))throw new InputError();
  const label=safeText(raw.label,1,120),category=safeText(raw.category,1,80);if(!label||!category)throw new InputError();
  return {label,category};
 });
}

function abortable(task,signal){
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(task).then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
 });
}

export function createBridgeValidatorHandler(env=process.env,validateBridgeTopics=nativeValidateBridgeTopics){
 return async request=>{
  if(request.method!=='POST')return json(405,{error:'method not allowed'});
  const token=env.BRIDGE_VALIDATOR_TOKEN||env.GROUP_SOLVER_TOKEN;
  if(typeof token!=='string'||token.length<32)return json(503,{error:'validator not configured'});
  const given=Buffer.from(String(request.headers.get('authorization')||'')),expected=Buffer.from(`Bearer ${token}`);
  if(given.length!==expected.length||!timingSafeEqual(given,expected))return json(401,{error:'unauthorized'});
  try{
   const input=await readBody(request);
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['people','candidates','direct'].includes(key)))throw new InputError();
   const people=sanitizedPeople(input.people),candidates=validatedCandidates(input.candidates,people),direct=validatedDirect(input.direct);
   const matches=await abortable(()=>validateBridgeTopics(people,candidates,direct,request.signal),request.signal);
   if(!Array.isArray(matches)||matches.length>3)throw new Error('invalid validator result');
   return json(200,{matches});
  }catch(error){
   if(request.signal.aborted||error?.name==='AbortError')throw request.signal.reason||error;
   if(error instanceof InputError)return json(error.status,{error:error.status===413?'request too large':'invalid bridge input'});
   return json(503,{error:'bridge validation unavailable'});
  }
 };
}
