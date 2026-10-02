import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createServer} from 'node:net';
import {findMatches} from '../shared/matching.ts';
import {optimizeGroups} from './vercel-optimizer.mjs';

const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const python=process.env.SAI_SOLVER_PYTHON||(existsSync('.data/solver-env/bin/python')?'.data/solver-env/bin/python':'python3');
const token=crypto.randomUUID()+crypto.randomUUID(),url=`http://127.0.0.1:${port}/api/solver`;
const server=spawn(python,['-u','-c',`from http.server import HTTPServer; from api.solver import handler; print('ready',flush=True); HTTPServer(('127.0.0.1',${port}),handler).serve_forever()`],{env:{...process.env,GROUP_SOLVER_TOKEN:token},stdio:['ignore','pipe','pipe']});
let errors='';server.stderr.on('data',chunk=>errors+=String(chunk));
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('solver startup timeout')),10000);server.stdout.once('data',()=>{clearTimeout(timer);resolve();});server.once('exit',()=>{clearTimeout(timer);reject(new Error(errors));});server.once('error',reject);});
 const call=(body,authorization=`Bearer ${token}`,method='POST')=>fetch(url,{method,headers:{'Content-Type':'application/json',Authorization:authorization},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 assert.equal((await call({},'wrong')).status,401);
 assert.equal((await call({},undefined,'GET')).status,405);
 assert.equal((await call({count:true})).status,400);
 assert.equal((await call({count:6,groupCount:2,candidates:[{members:[0,0],utility:1,pairCoverage:1}]})).status,400);
 assert.equal((await call({count:6,groupCount:2,candidates:[{members:[0,1,2],utility:-1,pairCoverage:1}]})).status,400);
 const people=Array.from({length:12},(_,i)=>({id:`p${i}`,name:`참가자${i}`,interests:[{id:`t${i}`,label:'재즈',category:'음악',shared:true}]}));
 const plans=await optimizeGroups(people,findMatches(people),4,{GROUP_SOLVER_URL:url,GROUP_SOLVER_TOKEN:token});
 assert.equal(plans.length,3);
 for(const plan of plans){
  assert.equal(plan.algorithm,'ortools-cp-sat');assert(['OPTIMAL','FEASIBLE'].includes(plan.solverStatus));
  assert.equal(plan.groups.length,3);assert(plan.groups.every(g=>g.ids.length===4));
  assert.deepEqual(plan.groups.flatMap(g=>g.ids).sort(),people.map(p=>p.id).sort());
 }
 console.log('PASS Vercel Python handler auth/input limits and native HTTP 12-person real CP-SAT Top-3 exact cover');
}finally{server.kill('SIGTERM');}
