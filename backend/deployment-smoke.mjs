// Creates temporary accounts on the specified deployment, then removes only those accounts.
import assert from 'node:assert/strict';
import {createTursoDBFromEnv} from './turso-db.mjs';

const origin=process.env.SAI_DEPLOYMENT_URL?.replace(/\/$/,'');
if(!origin)throw new Error('SAI_DEPLOYMENT_URL is required.');
const DB=createTursoDBFromEnv(),prefix=`vqa_${crypto.randomUUID().replaceAll('-','').slice(0,12)}`;
const users=[],ids=[];let room;
async function call(body,token='',query='',expected=200){
 const response=await fetch(origin+'/api/app'+query,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{throw new Error(`${body?.action||'GET'} HTTP ${response.status}: ${text.slice(0,150)}`);}assert.equal(response.status,expected,JSON.stringify(data));return data;
}
try{
 const home=await fetch(origin);assert.equal(home.status,200);assert.match(home.headers.get('content-type'),/text\/html/);
 const empty=await call();assert.equal(empty.account,null);
 assert.equal((await fetch(origin+'/api/solver',{method:'POST',body:'{}'})).status,401);
 for(let i=0;i<12;i++){
  const username=`${prefix}_${i}`,password=crypto.randomUUID()+crypto.randomUUID();
  users.push({username,password});
  const account=await call({action:'register',username,password,confirmPassword:password});users[i].token=account.token;
  const {id}=await call({action:'saveProfile',name:`배포검증${i+1}`,interests:[{id:`shared-${i}`,label:'재즈',category:'음악',shared:true},{id:`private-${i}`,label:'개인 비공개 항목',category:'기타',shared:false}]},account.token);ids.push(id);
 }
 const publicProfile=(await call(undefined,'','?profile='+ids[0])).profile;assert.equal(publicProfile.interests.length,1);
 const login=await call({action:'login',username:users[0].username,password:users[0].password});
 assert.equal((await call(undefined,login.token)).me.id,ids[0]);
 await call({action:'requestFriend',id:ids[1]},users[0].token);await call({action:'acceptFriend',id:ids[0]},users[1].token);
 assert.equal((await call(undefined,users[0].token)).friends.length,1);
 room=(await call({action:'createRoom',name:'배포 검증 임시 모임'},users[0].token)).id;
 for(let i=1;i<12;i++)await call({action:'joinRoom',id:room},users[i].token);
 const result=await call({action:'optimizeGroups',room,selected:ids,size:4},users[0].token);
 assert.equal(result.plans.length,3);
 for(const plan of result.plans){assert.equal(plan.algorithm,'ortools-cp-sat');assert(['OPTIMAL','FEASIBLE'].includes(plan.solverStatus));assert.deepEqual(plan.groups.flatMap(g=>g.ids).sort(),ids.slice().sort());assert.equal(plan.groups.length,3);assert(plan.groups.every(g=>g.ids.length===4));}
 const assignment={size:4,selected:ids,groups:result.plans[0].groups.map(g=>g.ids),unassigned:[]};
 await call({action:'saveRoomPlan',room,plan:assignment},users[1].token,'',403);
 await call({action:'saveRoomPlan',room,plan:assignment},users[0].token);
 assert.deepEqual((await call(undefined,login.token,'?room='+room)).selectedRoom.plan.groups,assignment.groups);
 await call({action:'optimizeGroups',room,selected:ids,size:4,useAI:true},users[0].token,'',503);
 await call({action:'logout'},login.token);assert.equal((await call(undefined,login.token)).account,null);
 console.log('PASS public Vercel signup/login, persistent private profiles, accepted friendship, 12-person real CP-SAT, owner-only saved assignment, and logout');
}finally{
 if(room)await DB.prepare('DELETE FROM rooms WHERE id=?').bind(room).run();
 for(const user of users){
  const account=await DB.prepare('SELECT owner FROM accounts WHERE username=?').bind(user.username).first();if(!account)continue;
  await DB.batch([DB.prepare('DELETE FROM profiles WHERE owner=?').bind(account.owner),DB.prepare('DELETE FROM sessions WHERE owner=?').bind(account.owner),DB.prepare('DELETE FROM accounts WHERE owner=? AND username=?').bind(account.owner,user.username)]);
 }
 console.log('Temporary deployment test accounts removed.');
}
