import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createDemoStore} from './demo-store.mjs';
import {createDemoApi} from './demo-api.mjs';

const directory=path.resolve('.data',`demo-api-test-${Date.now()}`);
let store=createDemoStore(directory);
const api=createDemoApi(store,process.env);
let cookie='';
async function request(route,body,{session=cookie,origin}={}){
 const response=await api(new Request('http://localhost:8788/api/demo'+route,{method:body===undefined?'GET':'POST',headers:{...(session?{Cookie:session}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 if(!cookie)cookie=response.headers.get('set-cookie').split(';')[0];
 return{status:response.status,data:await response.json()};
}
async function awaitJob(id){for(let i=0;i<1500;i++){const response=await request('/jobs/'+id);if(response.data.status==='complete')return response.data.result;if(response.data.status==='error')throw new Error(response.data.error);await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Job timeout');}
const initial=await request('/state');
assert.equal(initial.status,200);assert.equal(initial.data.people.length,25);
assert(initial.data.people.slice(1).every(p=>p.isDemo&&p.interests.every(i=>i.evidence.every(e=>e.source==='demo'))));
assert.equal(initial.data.integrations.youtube.configured,false);
assert.equal((await request('/profile',{name:'테스터',avatar:''},{origin:'https://example.invalid'})).status,403);
assert.equal((await request('/oauth/start',{provider:'youtube'})).data.error.includes('Client ID'),true);
assert.equal((await request('/jobs',{kind:'profile'})).status,400);
const foreign=await request('/state',undefined,{session:''});const foreignCookie=foreign.data.me.id;
assert.notEqual(foreignCookie,initial.data.me.id);
assert.equal((await request('/import/linkedin',{text:'Skills\nMachine learning, deep learning, computer vision and Python projects.'})).status,200);
const input=await request('/state');assert(input.data.imports.linkedin.summary.records>0);
assert(input.data.imports.linkedin.samples.every(s=>s.source==='linkedin'));
const ids=initial.data.people.slice(1,5).map(p=>p.id);
const commonStarted=await request('/jobs',{kind:'common',profileIds:ids});
const common=await awaitJob(commonStarted.data.id);
assert(common.interests.length>0);assert(common.interests.every(t=>t.members.length===ids.length&&t.evidence.length===ids.length));
assert.equal((await request('/jobs/'+commonStarted.data.id,undefined,{session:''})).status,404);
const groupIds=initial.data.people.slice(1,13).map(p=>p.id);
const first=await request('/jobs',{kind:'groups',profileIds:groupIds,tableSize:4});
const optimization=await awaitJob(first.data.id);
assert.equal(optimization.solver.engine,'OR-Tools CP-SAT');assert.equal(optimization.plans.length,3);
for(const plan of optimization.plans){const members=plan.groups.flatMap(g=>g.memberIds);assert.equal(members.length,groupIds.length);assert.equal(new Set(members).size,groupIds.length);assert(plan.groups.every(g=>g.memberIds.length===4));}
const saved=await request('/groups',{name:'로컬 확인',plan:optimization.plans[1]});
assert.equal(saved.data.groups[0].plan.id,optimization.plans[1].id);assert.equal(saved.data.groups[0].people.length,12);
const second=await request('/jobs',{kind:'groups',profileIds:groupIds,tableSize:3});
const secondPlans=await awaitJob(second.data.id);
assert.notEqual(secondPlans.plans[0].id,optimization.plans[0].id,'Plan identity must be unique per job');
const savedAgain=await request('/groups',{name:'새 조건 확인',plan:secondPlans.plans[0]});
assert(savedAgain.data.groups[0].plan.groups.every(g=>g.memberIds.length===3));
const sessionId=cookie.slice(9);store.setOAuth(sessionId,'youtube',{accessToken:'local-test-token',expiresAt:Date.now()+3600000});
assert(!fs.readFileSync(path.join(directory,'demo.sqlite')).includes(Buffer.from('local-test-token')),'Tokens must be encrypted on disk');
store.close();store=createDemoStore(directory);
assert.equal(store.getOAuth(sessionId,'youtube').accessToken,'local-test-token');assert.equal(store.getSession(sessionId).groups.length,2);
store.close();
console.log('Demo API smoke passed: imports, session isolation, all-member evidence, real CP-SAT, saves and encrypted token persistence.');
