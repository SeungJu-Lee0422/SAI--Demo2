import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';

// Real HTTP + SQLite + CP-SAT; no external accounts and no writes to the demo DB.
const scratch=await mkdtemp(join(tmpdir(),'sai-live-'));
const probe=createServer();
await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const server=spawn(process.execPath,['backend/local.mjs'],{
 env:{...process.env,SAI_PORT:String(port),SAI_DB_PATH:join(scratch,'test.sqlite'),SAI_DEMO_DIR:join(scratch,'demo'),YOUTUBE_CLIENT_ID:'',YOUTUBE_CLIENT_SECRET:''},
 stdio:['ignore','pipe','pipe'],
});
const origin=`http://127.0.0.1:${port}`;
try{
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('local server startup timed out')),10000);
  server.stdout.once('data',()=>{clearTimeout(timer);resolve();});
  server.once('error',error=>{clearTimeout(timer);reject(error);});
  server.once('exit',code=>{clearTimeout(timer);reject(new Error(`server exited ${code}`));});
 });
 async function call(body,token='',query='',expected=200){
  const response=await fetch(origin+'/api/app'+query,{
   method:body?'POST':'GET',
   headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
  });
  const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;
 }
 const tokens=[],ids=[];
 for(let i=0;i<12;i++){
  const password='test-password-'+crypto.randomUUID();
  const account=await call({action:'register',username:`live_${i}`,password,confirmPassword:password});
  tokens.push(account.token);
  ids.push((await call({action:'saveProfile',name:`검증${i+1}`,interests:[
   {id:`music-${i}`,label:i%2?'DAY6':'데이식스',category:'음악',shared:true},
   {id:`work-${i}`,label:'머신러닝',category:'공부·일',shared:true},
   {id:`private-${i}`,label:'비공개 검증',category:'기타',shared:false},
  ]},account.token)).id);
 }
 const imported=await call({action:'importLinkedInText',text:'Skills:\nComputer Vision\nDeep Learning\nProjects:\nVisual Recognition'},tokens[0]);
 assert(imported.count>=2);
 const owner=(await call(undefined,tokens[0])).me;
 assert(owner.interests.some(t=>t.source?.kind==='linkedin'&&!t.shared));
 const visible=(await call(undefined,'','?profile='+ids[0])).profile;
 assert(visible.interests.every(t=>t.shared&&!t.source));
 const sources=(await call(undefined,tokens[0],'?sources=1')).sources;
 assert.equal(sources.linkedin.status,'ok');assert(sources.linkedin.itemCount>=2);
 await call({action:'startYouTubeOAuth'},tokens[0],'',503);
 const room=await call({action:'createRoom',name:'실제 서버 검증 모임'},tokens[0]);
 for(let i=1;i<12;i++)await call({action:'joinRoom',id:room.id},tokens[i]);
 const analyzed=await call({action:'analyze',room:room.id,selected:ids},tokens[0]);
 assert.equal(analyzed.people.length,12);
 assert.equal(analyzed.matches.find(m=>m.label==='DAY6').members.length,12);
 assert(analyzed.people.every(p=>p.interests.every(t=>t.shared)));
 const optimized=await call({action:'optimizeGroups',room:room.id,selected:ids,size:4},tokens[0]);
 assert.equal(optimized.plans.length,3);
 const signatures=new Set();
 for(const plan of optimized.plans){
  assert.equal(plan.algorithm,'ortools-cp-sat');
  assert(['OPTIMAL','FEASIBLE'].includes(plan.solverStatus));
  assert.deepEqual(plan.groups.flatMap(g=>g.ids).sort(),ids.slice().sort());
  assert.equal(plan.groups.length,3);assert(plan.groups.every(g=>g.ids.length===4));
  assert(plan.groups.every(g=>g.interests.length<=3&&g.interests.every(m=>m.evidence.every(e=>g.ids.includes(e.profile)))));
  signatures.add(plan.groups.map(g=>g.ids.slice().sort().join(',')).sort().join('|'));
 }
 assert.equal(signatures.size,3);
 const assignment={size:4,selected:ids,groups:optimized.plans[0].groups.map(g=>g.ids),unassigned:[]};
 await call({action:'saveRoomPlan',room:room.id,plan:assignment},tokens[1],'',403);
 await call({action:'saveRoomPlan',room:room.id,plan:assignment},tokens[0]);
 const saved=(await call(undefined,tokens[0],'?room='+room.id)).selectedRoom.plan;
 assert.deepEqual(saved.groups,assignment.groups);
 await call({action:'requestFriend',id:ids[1]},tokens[0]);
 await call({action:'acceptFriend',id:ids[0]},tokens[1]);
 await call({action:'requestFriend',id:ids[2]},tokens[0]);
 await call({action:'acceptFriend',id:ids[0]},tokens[2]);
 const friends=await call({action:'analyze',profileIds:ids.slice(0,3)},tokens[0]);
 assert.equal(friends.people.length,3);
 await call({action:'analyze',profileIds:[ids[0],ids[3]]},tokens[0],'',403);
 console.log('PASS live HTTP/SQLite: private LinkedIn import, source status, 12-person CP-SAT Top-3, exact-once assignment, owner-only confirmation, and multi-friend analysis');
}finally{server.kill('SIGTERM');}
