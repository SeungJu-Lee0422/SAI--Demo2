import assert from 'node:assert/strict';
import {createBridgeValidatorHandler} from './vercel-bridge-validator.mjs';

const TOKEN='bridge-validator-token-that-is-at-least-32-characters';
const url='https://fixture.invalid/api/bridge-validate';
const people=[
 {id:'person-a',name:'Private Alice',bio:'private',avatar:'https://private.invalid/a',interests:[
  {id:'a-public',label:'  Anime  ',category:'콘텐츠',shared:true,preference:'like',source:{kind:'youtube',label:'Watch history',detail:'Stories and robots',url:'https://youtube.invalid/a'}},
  {id:'a-private',label:'Private diary',category:'기타',shared:false,preference:'like'},
 ]},
 {id:'person-b',name:'Private Bob',interests:[
  {id:'b-public',label:'Japan Travel',category:'여행',shared:true,preference:'explore',source:{kind:'linkedin',label:'Tokyo notes',detail:'contact test@example.com',url:'https://linkedin.invalid/b'}},
 ]},
];
const candidate={id:'anime-travel',label:'애니메이션 배경지 일본 여행',category:'여행',reason:'서로 다른 공개 관심사를 구체적인 여행 이야기로 연결해요.',connections:[
 {profile:'person-a',interests:['a-public'],reason:'작품 배경과 연결돼요.'},
 {profile:'person-b',interests:['b-public'],reason:'일본 방문지와 연결돼요.'},
]};
const body={people,candidates:[candidate],direct:[]};
const request=(value=body,options={})=>new Request(url,{method:options.method||'POST',headers:{'Content-Type':'application/json',...(options.auth===false?{}:{Authorization:`Bearer ${options.token||TOKEN}`}),...(options.headers||{})},...(options.method==='GET'?{}:{body:typeof value==='string'?value:JSON.stringify(value)}),signal:options.signal});

async function data(response){return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};}

async function testAuthAndMethods(){
 let calls=0;const validate=async()=>{calls++;return [];};
 let result=await data(await createBridgeValidatorHandler({BRIDGE_VALIDATOR_TOKEN:TOKEN},validate)(request(undefined,{method:'GET'})));
 assert.equal(result.status,405);assert.equal(result.cache,'no-store');
 result=await data(await createBridgeValidatorHandler({},validate)(request()));assert.equal(result.status,503);
 result=await data(await createBridgeValidatorHandler({BRIDGE_VALIDATOR_TOKEN:TOKEN},validate)(request(body,{auth:false})));assert.equal(result.status,401);
 result=await data(await createBridgeValidatorHandler({BRIDGE_VALIDATOR_TOKEN:TOKEN},validate)(request(body,{token:'wrong'})));assert.equal(result.status,401);
 assert.equal(calls,0,'authentication failures must not load or invoke Qwen');
}

async function testBoundsBeforeModel(){
 let calls=0;const handler=createBridgeValidatorHandler({GROUP_SOLVER_TOKEN:TOKEN},async()=>{calls++;return [];});
 const invalid=[
  '{',
  {...body,people:people.slice(0,1)},
  {...body,people:[people[0],{...people[1],id:'person-a'}]},
  {...body,people:[{...people[0],id:'x'.repeat(81)},people[1]]},
  {...body,people:[{...people[0],interests:Array(7).fill(people[0].interests[0])},people[1]]},
  {...body,candidates:[]},
  {...body,candidates:Array(4).fill(candidate)},
  {...body,candidates:[{...candidate,connections:[candidate.connections[0],{...candidate.connections[1],interests:['foreign']}]}]},
  {...body,direct:Array(601).fill({label:'topic',category:'기타'})},
 ];
 for(const value of invalid)assert.equal((await handler(request(value))).status,400);
 assert.equal(calls,0);
 const declared=await handler(request('{}',{headers:{'Content-Length':String(1024*1024+1)}}));assert.equal(declared.status,413);
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(700_000));controller.enqueue(new Uint8Array(400_000));controller.close();}});
 const streamed=new Request(url,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`},body:stream,duplex:'half'});
 assert.equal((await handler(streamed)).status,413);
 assert.equal(calls,0,'oversized bodies must not invoke Qwen');
}

async function testSanitizationAndModelResult(){
 let received;
 const matches=[{id:'trusted',kind:'bridge'}];
 const handler=createBridgeValidatorHandler({BRIDGE_VALIDATOR_TOKEN:TOKEN},async(...args)=>{received=args;return matches;});
 const response=await handler(request()),result=await data(response);
 assert.equal(result.status,200);assert.deepEqual(result.body,{matches});
 const [safePeople,safeCandidates,safeDirect,signal]=received;
 assert(signal instanceof AbortSignal);assert.deepEqual(safeDirect,[]);assert.equal(safeCandidates[0].id,candidate.id);
 assert.deepEqual(safePeople.map(person=>Object.keys(person).sort()),[['id','interests'],['id','interests']]);
 assert.equal(safePeople[0].interests.length,1);assert.equal(safePeople[0].interests[0].label,'Anime');
 assert.equal(safePeople[1].interests[0].source.detail,undefined);
 const serialized=JSON.stringify(safePeople);
 for(const forbidden of ['Private Alice','Private Bob','private.invalid','Private diary','test@example.com','youtube.invalid','linkedin.invalid'])assert(!serialized.includes(forbidden));
}

async function testRuntimeAndCancellation(){
 const failure=createBridgeValidatorHandler({BRIDGE_VALIDATOR_TOKEN:TOKEN},async()=>{throw new Error(`internal ${TOKEN}`);});
 const failed=await data(await failure(request()));assert.equal(failed.status,503);assert(!JSON.stringify(failed.body).includes(TOKEN));
 const invalidResult=createBridgeValidatorHandler({BRIDGE_VALIDATOR_TOKEN:TOKEN},async()=>Array(4).fill({}));
 assert.equal((await invalidResult(request())).status,503);
 const controller=new AbortController(),reason=new DOMException('caller cancelled','AbortError');
 let entered;const started=new Promise(resolve=>entered=resolve);
 const cancelling=createBridgeValidatorHandler({BRIDGE_VALIDATOR_TOKEN:TOKEN},async()=>new Promise(()=>{entered();}));
 const pending=cancelling(request(body,{signal:controller.signal}));await started;controller.abort(reason);
 await assert.rejects(pending,error=>error===reason);
}

await testAuthAndMethods();
await testBoundsBeforeModel();
await testSanitizationAndModelResult();
await testRuntimeAndCancellation();
const thin=await import('../api/bridge-validate.ts');
assert.equal(typeof thin.fetch,'function');assert.equal(thin.handler,thin.fetch);assert.equal(thin.default.fetch,thin.fetch);
console.log('PASS Vercel bridge validator auth, bounded streaming input, public sanitization, injected model boundary, safe errors, cancellation, and thin lazy-model API export');
