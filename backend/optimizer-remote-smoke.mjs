import assert from 'node:assert/strict';
import {remoteOptimizer} from './optimizer-remote.mjs';

const people=[
 {id:'a',name:'A',bio:'',color:'',interests:[]},
 {id:'b',name:'B',bio:'',color:'',interests:[]},
 {id:'c',name:'C',bio:'',color:'',interests:[]},
 {id:'d',name:'D',bio:'',color:'',interests:[]},
 {id:'e',name:'E',bio:'',color:'',interests:[]},
];
const matches=[{id:'m',label:'공통 주제',category:'기타',kind:'exact',members:['a','b'],evidence:[{profile:'a',label:'공통 주제'},{profile:'b',label:'공통 주제'}],reason:'test'}];
const config={GROUP_SOLVER_URL:'https://solver.example.test/optimize',GROUP_SOLVER_TOKEN:'secret-token'};
const originalFetch=globalThis.fetch;
const originalTimeout=AbortSignal.timeout;

async function withFetch(fake,run){
 globalThis.fetch=fake;
 try{return await run();}finally{globalThis.fetch=originalFetch;}
}

async function testRequiresConfiguration(){
 let calls=0;
 await withFetch(async()=>{calls++;throw new Error('must not fetch');},async()=>{
  await assert.rejects(remoteOptimizer({})(people,matches,4),/GROUP_SOLVER_URL과 GROUP_SOLVER_TOKEN/);
  await assert.rejects(remoteOptimizer({GROUP_SOLVER_URL:config.GROUP_SOLVER_URL})(people,matches,4),/GROUP_SOLVER_URL과 GROUP_SOLVER_TOKEN/);
  await assert.rejects(remoteOptimizer({GROUP_SOLVER_TOKEN:config.GROUP_SOLVER_TOKEN})(people,matches,4),/GROUP_SOLVER_URL과 GROUP_SOLVER_TOKEN/);
 });
 assert.equal(calls,0);
}

async function testSendsAuthenticatedRequestAndReturnsPlans(){
 let request;
 const plans=[{mode:'cohesion',groups:[{ids:['a','b']},{ids:['c','d','e']}]}];
 await withFetch(async(url,init)=>{request={url,init};return {ok:true,json:async()=>({plans})};},async()=>{
  assert.strictEqual(await remoteOptimizer(config)(people,matches,4),plans);
 });
 assert.equal(request.url,config.GROUP_SOLVER_URL);
 assert.equal(request.init.method,'POST');
 assert.deepEqual(request.init.headers,{'Content-Type':'application/json',Authorization:'Bearer secret-token'});
 assert.deepEqual(JSON.parse(request.init.body),{people,matches,size:4});
 assert(request.init.signal instanceof AbortSignal);
}

async function testUsesBoundedTimeout(){
 let timeoutMs;
 AbortSignal.timeout=ms=>{timeoutMs=ms;return AbortSignal.abort(new DOMException('timed out','TimeoutError'));};
 try{
  await withFetch(async(_url,{signal})=>{throw signal.reason;},async()=>{
   await assert.rejects(remoteOptimizer(config)(people,matches,4),/CP-SAT 서버에 연결하지 못했어요/);
  });
 }finally{AbortSignal.timeout=originalTimeout;}
 assert.equal(timeoutMs,25_000);
}

async function testPreservesCallerCancellation(){
 const controller=new AbortController(),reason=new DOMException('caller cancelled','AbortError');
 let entered;const started=new Promise(resolve=>entered=resolve);let receivedSignal;
 const pending=withFetch(async(_url,{signal})=>{
  receivedSignal=signal;entered();
  return new Promise((_resolve,reject)=>{
   const abort=()=>reject(signal.reason);
   if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  });
 },()=>remoteOptimizer(config)(people,matches,4,controller.signal));
 await started;controller.abort(reason);
 await assert.rejects(pending,error=>error===reason);
 assert(receivedSignal.aborted);
 assert.equal(receivedSignal.reason,reason);
}

async function testHandlesNetworkAndHttpErrors(){
 await withFetch(async()=>{throw new Error('socket closed');},async()=>{
  await assert.rejects(remoteOptimizer(config)(people,matches,4),/CP-SAT 서버에 연결하지 못했어요/);
 });
 await withFetch(async()=>({ok:false,status:503}),async()=>{
  await assert.rejects(remoteOptimizer(config)(people,matches,4),/CP-SAT 서버에 연결하지 못했어요/);
 });
}

async function testRejectsMalformedJson(){
 await withFetch(async()=>({ok:true,json:async()=>{throw new SyntaxError('invalid json');}}),async()=>{
  await assert.rejects(remoteOptimizer(config)(people,matches,4),/편성 결과 형식이 잘못됐어요/);
 });
}

async function testRejectsMissingPlans(){
 await withFetch(async()=>({ok:true,json:async()=>({plans:[]})}),async()=>{
  await assert.rejects(remoteOptimizer(config)(people,matches,4),/CP-SAT 서버가 편성안을 반환하지 않았어요/);
 });
}

async function testRejectsMalformedGroupIds(){
 await withFetch(async()=>({ok:true,json:async()=>({plans:[{groups:[{}]}]})}),async()=>{
  await assert.rejects(remoteOptimizer(config)(people,matches,4),/편성 결과 형식이 잘못됐어요/);
 });
}

async function assertInvalidPlans(plans){
 await withFetch(async()=>({ok:true,json:async()=>({plans})}),async()=>{
  await assert.rejects(remoteOptimizer(config)(people,matches,4),/참가자가 누락되거나 중복됐어요/);
 });
}

async function testRejectsDuplicateMembership(){
 await assertInvalidPlans([{groups:[{ids:['a','b','c']},{ids:['c','d','e']}]}]);
}

async function testRejectsOmittedMembership(){
 await assertInvalidPlans([{groups:[{ids:['a','b']},{ids:['c','d']}]}]);
}

async function testRejectsOversizedGroups(){
 await assertInvalidPlans([{groups:[{ids:['a','b','c','d','e']}]}]);
}

try{
 await testRequiresConfiguration();
 await testSendsAuthenticatedRequestAndReturnsPlans();
 await testUsesBoundedTimeout();
 await testPreservesCallerCancellation();
 await testHandlesNetworkAndHttpErrors();
 await testRejectsMalformedJson();
 await testRejectsMissingPlans();
 await testRejectsMalformedGroupIds();
 await testRejectsDuplicateMembership();
 await testRejectsOmittedMembership();
 await testRejectsOversizedGroups();
 console.log('PASS remote optimizer auth, request contract, timeout/network errors, and strict group membership validation');
}finally{
 globalThis.fetch=originalFetch;
 AbortSignal.timeout=originalTimeout;
}
