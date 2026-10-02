import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {validateAvatar} from './avatar.mjs';
import {getConnectionStatus,startOAuth,finishOAuth,listYoutubePlaylists,importYoutube,importLinkedIn} from './demo-data.mjs';
import {analyzeRecords,commonInterests,optimizeGroups} from './demo-analysis.mjs';

export function createDemoApi(store,environment=process.env){
 const jobs=new Map();
 const solverPython=process.platform==='win32'?'.data/solver-env/Scripts/python.exe':'.data/solver-env/bin/python';
 const pythonPath=environment.SAI_PYTHON||environment.SAI_SOLVER_PYTHON||(fs.existsSync(solverPython)?path.resolve(solverPython):fs.existsSync('.venv/Scripts/python.exe')?path.resolve('.venv/Scripts/python.exe'):fs.existsSync('.venv/bin/python')?path.resolve('.venv/bin/python'):'python');
 const env={...environment};
 const response=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
 const active=id=>[...jobs.values()].some(j=>j.sessionId===id&&['queued','running'].includes(j.status));
 const state=async id=>{const data=store.getSession(id),imports={};for(const provider of ['youtube','linkedin']){const value=data.imports[provider];imports[provider]=value?{summary:value.summary,samples:(value.samples||value.sections||value.records||[]).slice(0,8).map(item=>typeof item==='string'?{title:item}:{title:item.title||item.name||item.label||'프로필 데이터',text:item.text,source:provider,url:item.url})}:null;}return{me:data.me,people:[data.me,...store.profiles()],groups:data.groups,imports,integrations:await getConnectionStatus(id,env,store)};};
 function selected(id,ids){if(!Array.isArray(ids)||ids.length<2||ids.length>30||new Set(ids).size!==ids.length)throw new Error('2~30명의 서로 다른 참여자를 선택해주세요.');const people=[store.getSession(id).me,...store.profiles()];return ids.map(id=>{const profile=people.find(p=>p.id===id);if(!profile)throw new Error('참여자를 찾을 수 없습니다. 새로고침해주세요.');return structuredClone(profile);});}
 return async function demoApi(request){
  const url=new URL(request.url);
  // This unauthenticated presentation surface is deliberately confined to the local server.
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))return response({error:'Demo는 localhost에서 열어주세요.'},403);
  const origin=request.headers.get('origin');
  if(request.method==='POST'&&((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site'))return response({error:'이 Demo 화면에서 다시 요청해주세요.'},403);
  const existing=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('sai_demo='))?.slice(9);
  const sessionId=store.ensureSession(existing);
  const cookie=`sai_demo=${sessionId}; HttpOnly; SameSite=Lax; Path=/api/demo; Max-Age=2592000`;
  function json(body,status=200){return response(body,status,{'Set-Cookie':cookie});}
  try{
   const callback=url.pathname.match(/^\/api\/demo\/oauth\/(youtube|linkedin)\/callback$/);
   if(callback&&request.method==='GET'){
    try{const connected=await finishOAuth(callback[1],url,env,store,sessionId);if(callback[1]==='linkedin'&&connected.records?.length){const data=store.getSession(sessionId);const previous=data.imports.linkedin;data.imports.linkedin={...previous,records:[...connected.records,...(previous?.records||[]).filter(r=>r.kind!=='basic')],summary:{...previous?.summary,basicProfile:connected.profile?.name},samples:previous?.samples||connected.records};store.setSession(sessionId,data);}return new Response(null,{status:303,headers:{Location:`/?oauth=connected&provider=${callback[1]}`,'Set-Cookie':cookie,'Cache-Control':'no-store'}});}
    catch(error){return new Response(null,{status:303,headers:{Location:`/?oauth_error=${encodeURIComponent(error.message)}&provider=${callback[1]}`,'Set-Cookie':cookie,'Cache-Control':'no-store'}});}
   }
   if(request.method==='GET'){
    if(url.pathname==='/api/demo/state')return json(await state(sessionId));
    if(url.pathname==='/api/demo/youtube/playlists')return json(await listYoutubePlaylists(sessionId,env,store));
    const jobId=url.pathname.match(/^\/api\/demo\/jobs\/([^/]+)$/)?.[1];
    if(jobId){const job=jobs.get(jobId);if(!job||job.sessionId!==sessionId)return json({error:'분석 작업을 찾을 수 없습니다.'},404);const{sessionId:omit,createdAt,...publicJob}=job;return json(publicJob);}
    return json({error:'요청한 Demo 기능을 찾을 수 없습니다.'},404);
   }
   if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
   if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON 형식으로 요청해주세요.'},415);
   const text=await request.text();if(Buffer.byteLength(text)>16*1024*1024)return json({error:'입력 파일은 6MB 이하로 올려주세요.'},413);
   let body;try{body=JSON.parse(text);}catch{return json({error:'요청 형식을 확인해주세요.'},400);}
   if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'요청 형식을 확인해주세요.'},400);
   if(url.pathname==='/api/demo/oauth/start'){if(!['youtube','linkedin'].includes(body.provider))return json({error:'연결할 서비스를 선택해주세요.'},400);const result=await startOAuth(body.provider,sessionId,env,store);return json({url:typeof result==='string'?result:result.authorizationUrl});}
   if(active(sessionId))return json({error:'진행 중인 분석이 끝난 뒤 다시 시도해주세요.'},409);
   if(url.pathname==='/api/demo/profile'){
    const name=String(body.name||'').trim();if(!name||name.length>30)return json({error:'이름은 1~30자로 입력해주세요.'},400);
    const data=store.getSession(sessionId);data.me={...data.me,name,avatar:validateAvatar(body.avatar===undefined?data.me.avatar||'':body.avatar)};store.setSession(sessionId,data);return json(await state(sessionId));
   }
   if(url.pathname==='/api/demo/import/youtube'||url.pathname==='/api/demo/import/linkedin'){
    const provider=url.pathname.endsWith('youtube')?'youtube':'linkedin';
    const result=provider==='youtube'?await importYoutube(sessionId,{playlistIds:body.playlistIds,includeSubscriptions:body.includeSubscriptions===true},env,store):await importLinkedIn(body);
    const data=store.getSession(sessionId);data.imports[provider]=result;
    // Changing inputs invalidates the derived profile until it has been analyzed again.
    data.me.interests=[];store.setSession(sessionId,data);return json(await state(sessionId));
   }
   if(url.pathname==='/api/demo/jobs'){
    if(!['profile','common','groups'].includes(body.kind))return json({error:'분석 종류를 선택해주세요.'},400);
    let people=[];if(body.kind!=='profile')people=selected(sessionId,body.profileIds);
    if(body.kind==='groups'&&![3,4,5].includes(body.tableSize))return json({error:'테이블당 3·4·5명 중 선택해주세요.'},400);
    if(body.kind==='groups'&&people.length>24)return json({error:'Demo 그룹은 최대 24명을 선택해주세요.'},400);
    const data=store.getSession(sessionId),records=Object.values(data.imports).flatMap(value=>value?.records||[]).filter(record=>record.kind!=='basic');
    if(body.kind==='profile'&&!records.length)return json({error:'YouTube 또는 LinkedIn 실제 데이터를 먼저 추가해주세요.'},400);
    for(const[id,job]of jobs)if(Date.now()-job.createdAt>3600000&&job.status!=='running')jobs.delete(id);
    const id=randomUUID(),job={id,sessionId,status:'queued',message:'분석을 준비하고 있어요',createdAt:Date.now()};jobs.set(id,job);
    setImmediate(async()=>{
     job.status='running';const onProgress=value=>{job.message=typeof value==='string'?value:value.message;job.stage=typeof value==='object'?value.stage:undefined;};
     try{
      if(body.kind==='profile'){const interests=await analyzeRecords(records,{onProgress});const fresh=store.getSession(sessionId);fresh.me.interests=interests;store.setSession(sessionId,fresh);job.result={interests};}
      else if(body.kind==='common'){onProgress('선택한 모든 사람의 관심사와 근거를 비교하고 있어요');job.result={interests:await commonInterests(people)};}
      else{job.result=await optimizeGroups(people,body.tableSize,{onProgress,pythonPath});for(const plan of job.result.plans){plan.id=`${id}:${plan.id}`;for(const group of plan.groups)group.id=`${id}:${group.id}`;}}
      job.status='complete';job.message='분석을 완료했어요';
     }catch(error){job.status='error';job.error=error.message||'분석을 완료하지 못했습니다.';job.message=job.error;}
    });
    return json({id},202);
   }
   if(url.pathname==='/api/demo/groups'){
    const name=String(body.name||'').trim();if(!name||name.length>60)return json({error:'그룹 이름은 1~60자로 입력해주세요.'},400);
    const job=[...jobs.values()].find(j=>j.sessionId===sessionId&&j.status==='complete'&&j.result?.plans?.some(p=>p.id===body.plan?.id));
    const plan=job?.result.plans.find(p=>p.id===body.plan.id);if(!plan)return json({error:'분석이 완료된 편성안을 선택해주세요.'},400);
    const data=store.getSession(sessionId),all=[data.me,...store.profiles()],ids=plan.groups.flatMap(g=>g.memberIds);
    data.groups.unshift({id:randomUUID(),name,createdAt:new Date().toISOString(),plan,people:all.filter(p=>ids.includes(p.id)),solver:job.result.solver});data.groups=data.groups.slice(0,50);store.setSession(sessionId,data);return json(await state(sessionId));
   }
   return json({error:'요청한 Demo 기능을 찾을 수 없습니다.'},404);
  }catch(error){return json({error:error.message||'요청을 처리하지 못했습니다.'},error.status||400);}
 };
}
