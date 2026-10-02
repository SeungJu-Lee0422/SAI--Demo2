import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer as createNetServer} from 'node:net';
import {remoteBridgeValidator} from './bridge-validator-remote.mjs';
import {bridgeTexts,validateBridgeTopics} from '../shared/conversation-topics.ts';

const TOKEN='bridge-validator-token-that-is-long-enough';
const URL='https://validator.example.test/bridge';
const interest=(id,label,category,extra={})=>({id,label,category,shared:true,preference:'like',...extra});
const person=(id,name,interests,extra={})=>({id,name,bio:`${name} private biography`,color:'#123456',avatar:`https://private.example/${id}.png`,instagramHandle:`${id}_private`,interests,...extra});
const connection=(profile,...interests)=>({profile,interests,reason:`${profile}의 공개 관심사와 이어져요.`});

const people=[
 person('person-a','Alice',[
  interest('a-anime','Anime','콘텐츠',{source:{kind:'youtube',label:'Gundam review',detail:'Mobile suits and stories',url:'https://youtube.example/watch/a'}}),
  ...Array.from({length:7},(_,index)=>interest(`a-extra-${index}`,`Extra ${index}`,'기타',index===0?{source:{kind:'youtube',label:'Public playlist',detail:'contact test@example.com',url:'https://youtube.example/private'}}:{})),
  interest('a-private','Private interest','기타',{shared:false}),
  interest('a-avoid','Avoided interest','콘텐츠',{preference:'avoid'}),
 ]),
 person('person-b','Bob',[
  interest('b-travel','Japan Travel','여행',{source:{kind:'linkedin',label:'Tokyo itinerary',detail:'Museums and neighborhoods',url:'https://linkedin.example/b'}}),
 ]),
];
const candidate={
 id:'anime-travel',label:'애니메이션 배경지로 떠나는 일본 여행',category:'여행',reason:'서로 다른 관심사를 구체적인 여행 대화로 연결해요.',
 connections:[connection('person-a','a-anime'),connection('person-b','b-travel')],confidence:.82,
};
const fixtureVectors=bridgeTexts(people,[candidate]).map(()=>[1,0]);
const trustedMatch=validateBridgeTopics(people,[candidate],fixtureVectors)[0];
assert(trustedMatch,'the pure validator fixture must produce a trusted bridge');

function configured(fetch){return remoteBridgeValidator({BRIDGE_VALIDATOR_URL:URL,BRIDGE_VALIDATOR_TOKEN:TOKEN,fetch});}
function response(matches){return {ok:true,json:async()=>({matches})};}

async function testConfiguration(){
 assert.equal(remoteBridgeValidator({}),undefined);
 assert.equal(remoteBridgeValidator({BRIDGE_VALIDATOR_URL:URL}),undefined);
 assert.equal(remoteBridgeValidator({BRIDGE_VALIDATOR_TOKEN:TOKEN}),undefined);
 assert.equal(remoteBridgeValidator({BRIDGE_VALIDATOR_URL:URL,BRIDGE_VALIDATOR_TOKEN:'too-short'}),undefined);
 assert.equal(typeof remoteBridgeValidator({BRIDGE_VALIDATOR_URL:URL,GROUP_SOLVER_TOKEN:TOKEN,fetch:async()=>response([])}),'function');
}

async function testRequestAndTrustedResponse(){
 let request,calls=0;
 const validate=configured(async(url,init)=>{calls++;request={url,init};return response([trustedMatch]);});
 const matches=await validate(people,[candidate],[]);
 assert.equal(calls,1);
 assert.deepEqual(matches,[trustedMatch]);
 assert.equal(request.url,URL);
 assert.equal(request.init.method,'POST');
 assert.equal(request.init.redirect,'error');
 assert.deepEqual(request.init.headers,{'Content-Type':'application/json',Authorization:`Bearer ${TOKEN}`});
 assert(request.init.signal instanceof AbortSignal);
 const body=JSON.parse(request.init.body);
 assert.deepEqual(body.candidates,[candidate]);
 assert.deepEqual(body.direct,[]);
 assert.deepEqual(body.people.map(item=>Object.keys(item).sort()),[['id','interests'],['id','interests']]);
 assert(body.people.every(item=>item.interests.length<=6));
 const serialized=JSON.stringify(body);
 for(const forbidden of ['Alice','Bob','private biography','private.example','instagramHandle','Private interest','Avoided interest','test@example.com','youtube.example','linkedin.example'])assert(!serialized.includes(forbidden),`request leaked ${forbidden}`);
 assert(serialized.includes('Mobile suits and stories'));
 assert(serialized.includes('Museums and neighborhoods'));
 assert(body.people.flatMap(item=>item.interests).every(item=>!item.source||!('url' in item.source)));
 assert.equal(matches[0].evidence.find(item=>item.profile==='person-a').source.url,'https://youtube.example/watch/a','trusted evidence is reconstructed from current public data after verification');
}

async function testRemoteFailures(){
 await assert.rejects(configured(async()=>({ok:false,status:503}))(people,[candidate]),/AI 검증 서버에 연결하지 못했어요/);
 await assert.rejects(configured(async()=>({ok:true,json:async()=>({error:{message:'remote secret'}})}))(people,[candidate]),error=>/AI 검증 응답을 확인해주세요/.test(error.message)&&!error.message.includes('remote secret'));
 await assert.rejects(configured(async()=>({ok:true,json:async()=>{throw new SyntaxError('invalid json');}}))(people,[candidate]),SyntaxError);
 await assert.rejects(configured(async()=>response(Array(4).fill(trustedMatch)))(people,[candidate]),/AI 검증 응답을 확인해주세요/);
}

async function testCurrentEvidenceRequired(){
 const changed=people.map(item=>item.id==='person-a'?{...item,interests:item.interests.map(value=>value.id==='a-anime'?{...value,source:{...value.source,detail:'Changed public evidence'}}:value)}:item);
 assert.deepEqual(await configured(async()=>response([trustedMatch]))(changed,[candidate]),[],'changed evidence must invalidate a remote match');
 const madePrivate=people.map(item=>item.id==='person-a'?{...item,interests:item.interests.map(value=>value.id==='a-anime'?{...value,shared:false}:value)}:item);
 assert.deepEqual(await configured(async()=>response([trustedMatch]))(madePrivate,[candidate]),[],'a now-private reference must invalidate a remote match');
}

async function testAbortPreserved(){
 const controller=new AbortController(),reason=new DOMException('cancelled','AbortError');
 controller.abort(reason);
 const validate=configured(async(_url,{signal})=>{signal.throwIfAborted();});
 await assert.rejects(validate(people,[candidate],[],controller.signal),error=>error===reason);
}

async function freePort(){
 const probe=createNetServer();
 await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
 const port=probe.address().port;
 await new Promise(resolve=>probe.close(resolve));
 return port;
}

async function waitForService(child){
 let stderr='';child.stderr.on('data',chunk=>stderr+=String(chunk));
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(`bridge validator fixture startup timeout: ${stderr}`)),10_000);
  const fail=code=>{clearTimeout(timer);reject(new Error(`bridge validator fixture exited ${code}: ${stderr}`));};
  child.once('exit',fail);child.once('error',reject);
  child.stdout.on('data',chunk=>{if(String(chunk).includes('SAI CP-SAT service')){clearTimeout(timer);child.off('exit',fail);resolve();}});
 });
}

async function stopService(child){
 if(child.exitCode!==null)return;
 const exited=new Promise(resolve=>child.once('exit',resolve));
 child.kill('SIGTERM');
 await exited;
}

async function testSolverServiceBoundary(){
 const port=await freePort(),base=`http://127.0.0.1:${port}`,groupToken='group-solver-token-that-is-at-least-32-characters',bridgeToken='bridge-validator-token-at-least-32-characters';
 const child=spawn(process.execPath,['backend/solver-service.mjs'],{env:{...process.env,GROUP_SOLVER_PORT:String(port),GROUP_SOLVER_HOST:'127.0.0.1',GROUP_SOLVER_TOKEN:groupToken,BRIDGE_VALIDATOR_TOKEN:bridgeToken},stdio:['ignore','pipe','pipe']});
 try{
  await waitForService(child);
  const post=(path,body,token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  assert.equal((await post('/bridge-validate',{people:[],candidates:[],direct:[]},'wrong-token')).status,401);
  assert.equal((await post('/bridge-validate',{people:[],candidates:[],direct:[]},bridgeToken)).status,400,'invalid bounds must fail before any model load');
  assert.equal((await post('/solve',{people:[],matches:[],size:4},groupToken)).status,400,'the existing solve route remains available');
 }finally{await stopService(child);}

 const shortPort=await freePort();
 const short=spawn(process.execPath,['backend/solver-service.mjs'],{env:{...process.env,GROUP_SOLVER_PORT:String(shortPort),GROUP_SOLVER_HOST:'127.0.0.1',GROUP_SOLVER_TOKEN:groupToken,BRIDGE_VALIDATOR_TOKEN:'too-short'},stdio:['ignore','ignore','pipe']});
 let stderr='';short.stderr.on('data',chunk=>stderr+=String(chunk));
 const code=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{short.kill('SIGTERM');reject(new Error('short-token fixture did not exit'));},10_000);
  short.once('error',reject);short.once('exit',value=>{clearTimeout(timer);resolve(value);});
 });
 assert.notEqual(code,0);
 assert.match(stderr,/BRIDGE_VALIDATOR_TOKEN.*32/);
}

await testConfiguration();
await testRequestAndTrustedResponse();
await testRemoteFailures();
await testCurrentEvidenceRequired();
await testAbortPreserved();
await testSolverServiceBoundary();
console.log('PASS remote bridge validator configuration, bounded public payload, trusted reconstruction, remote errors, current evidence, aborts, and HTTP boundary fixture (no model invocation)');
