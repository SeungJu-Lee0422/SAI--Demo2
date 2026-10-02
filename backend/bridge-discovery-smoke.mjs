import assert from 'node:assert/strict';
import {discoverBridgeTopics} from './bridge-discovery.mjs';

const people=[
 {id:'p-a',name:'민수',bio:'private biography',avatar:'https://private.test/a.png',instagramHandle:'secret_a',interests:[
  {id:'a-anime',label:'Anime',category:'콘텐츠',shared:true,preference:'like',source:{kind:'youtube',label:'Gundam review',detail:'Mobile suits and stories',url:'https://youtube.test/a'}},
  {id:'a-manga',label:'Manga',category:'콘텐츠',shared:true,preference:'explore'},
  {id:'a-private',label:'Private item',category:'기타',shared:false,preference:'like'},
  {id:'a-avoid',label:'Horror',category:'콘텐츠',shared:true,preference:'avoid'},
  ...Array.from({length:8},(_,i)=>({id:`a-extra-${i}`,label:`Extra ${i}`,category:'기타',shared:true,preference:'like'})),
 ]},
 {id:'p-b',name:'지은',bio:'also private',linkedinHandle:'secret-b',interests:[
  {id:'b-travel',label:'Japan Travel',category:'여행',shared:true,preference:'like',source:{kind:'linkedin',label:'Tokyo itinerary',detail:'Museums and neighborhoods',url:'https://linkedin.test/b'}},
  {id:'b-food',label:'Japanese Food',category:'음식',shared:true,preference:'like'},
 ]},
];
const direct=[];

function output(candidates,status='completed'){
 return {ok:true,json:async()=>({status,outputs:[{type:'model_output',content:[{type:'text',text:JSON.stringify({candidates})}]}]})};
}

function textOutput(text){
 return {ok:true,json:async()=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text}]}]})};
}

function candidate(overrides={}){
 return {
  id:'anime-travel',label:'애니메이션 성지순례',category:'여행',reason:'애니메이션 작품과 일본 여행지를 함께 이야기할 수 있어요.',
  connections:[
   {profile:'p-a',interests:['a-anime'],reason:'작품의 실제 배경과 연결돼요.'},
   {profile:'p-b',interests:['b-travel'],reason:'일본 여행지 탐색과 연결돼요.'},
  ],confidence:.82,...overrides,
 };
}

async function call(fake,overrides={}){
 return discoverBridgeTopics(people,direct,{GEMINI_API_KEY:'server-secret',fetch:fake,...overrides});
}

async function testRequestAndPrivacy(){
 let request,calls=0,timeoutMs;
 const originalTimeout=AbortSignal.timeout;
 AbortSignal.timeout=ms=>{timeoutMs=ms;return originalTimeout(ms);};
 let result;
 try{result=await call(async(url,init)=>{calls++;request={url,init};return output([candidate()]);});}
 finally{AbortSignal.timeout=originalTimeout;}
 assert.deepEqual(result,[candidate()]);
 assert.equal(calls,1);
 assert.equal(timeoutMs,15_000);
 assert.equal(request.url,'https://generativelanguage.googleapis.com/v1beta/interactions');
 assert.equal(request.init.method,'POST');
 assert.deepEqual(request.init.headers,{'Content-Type':'application/json','x-goog-api-key':'server-secret'});
 const body=JSON.parse(request.init.body);
 assert.equal(body.model,'gemini-3.5-flash-lite');
 assert.equal(body.store,false);
 assert.equal(body.response_format.type,'text');
 assert.equal(body.response_format.mime_type,'application/json');
 assert.equal(body.response_format.schema.properties.candidates.maxItems,3);
 assert(!JSON.stringify(body.response_format.schema).includes('minLength'));
 assert(!JSON.stringify(body.response_format.schema).includes('maxLength'));
 const profiles=JSON.parse(body.input.match(/PROFILES=(.*)$/m)[1]);
 assert(profiles.every(profile=>profile.interests.length<=6));
 assert(!request.init.body.includes('민수'));
 assert(!request.init.body.includes('private biography'));
 assert(!request.init.body.includes('secret_a'));
 assert(!request.init.body.includes('private.test'));
 assert(!request.init.body.includes('Private item'));
 assert(!request.init.body.includes('Horror'));
 assert(!request.init.body.includes('youtube.test'));
 assert(request.init.signal instanceof AbortSignal);
 let customBody;
 await call(async(_url,init)=>{customBody=JSON.parse(init.body);return output([]);},{GEMINI_MODEL:'gemini-custom'});
 assert.equal(customBody.model,'gemini-custom');
}

async function testNoBridgeAndValidation(){
 assert.deepEqual(await call(async()=>output([])),[]);
 assert.deepEqual(await call(async()=>textOutput('NO_VALID_BRIDGE')),[]);
 const malformed=[
  candidate({connections:[{profile:'p-a',interests:['a-anime'],reason:'ok'}]}),
  candidate({id:'foreign',connections:[candidate().connections[0],{profile:'p-b',interests:['not-real'],reason:'ok'}]}),
  candidate({id:'broad',label:'문화'}),
  candidate({id:'sensitive',label:'https://example.test/topic'}),
 ];
 assert.deepEqual(await call(async()=>output(malformed)),[]);
 const directDuplicate=[{id:'d',label:'애니메이션 성지순례',category:'여행',kind:'exact',members:['p-a','p-b'],evidence:[],reason:'same'}];
 assert.deepEqual(await discoverBridgeTopics(people,directDuplicate,{GEMINI_API_KEY:'server-secret',fetch:async()=>output([candidate()])}),[]);
}

async function testErrorsAndAbort(){
 let calls=0;
 const skipped=await discoverBridgeTopics(people,[
  {id:'d1',label:'Anime',category:'콘텐츠',kind:'exact',members:['p-a','p-b'],evidence:[{profile:'p-a',label:'Anime'},{profile:'p-b',label:'Anime'}],reason:'same'},
  {id:'d2',label:'Travel',category:'여행',kind:'exact',members:['p-a','p-b'],evidence:[{profile:'p-a',label:'Travel'},{profile:'p-b',label:'Travel'}],reason:'same'},
  {id:'d3',label:'Food',category:'음식',kind:'exact',members:['p-a','p-b'],evidence:[{profile:'p-a',label:'Food'},{profile:'p-b',label:'Food'}],reason:'same'},
 ],{fetch:async()=>{calls++;throw new Error('must not fetch');}});
 assert.deepEqual(skipped,[]);assert.equal(calls,0);
 await assert.rejects(discoverBridgeTopics(people,direct,{}),error=>error.code==='BRIDGE_NOT_CONFIGURED'&&/GEMINI_API_KEY/.test(error.message));
 await assert.rejects(call(async()=>({ok:false,status:401})),error=>/응답하지 않았어요/.test(error.message)&&!error.message.includes('server-secret'));
 await assert.rejects(call(async()=>output([], 'failed')),/결과 형식이 올바르지 않아요/);
 const aborted=new DOMException('cancelled','AbortError');
 await assert.rejects(call(async()=>{throw aborted;}),error=>error===aborted);
}

async function testUuidReferences(){
 const id='00000000-0000-4000-8000-010123456789';
 const members=people.map((person,index)=>index===0?{...person,id,interests:[{id,label:'Anime',category:'콘텐츠',shared:true}]}:person);
 const topic=candidate({id,connections:[{profile:id,interests:[id],reason:'작품의 실제 배경과 연결돼요.'},candidate().connections[1]]});
 assert.deepEqual(await discoverBridgeTopics(members,[],{GEMINI_API_KEY:'fixture',fetch:async()=>output([topic])}),[topic],'opaque UUID references cannot be mistaken for phone numbers');
}

await testRequestAndPrivacy();
await testUuidReferences();
await testNoBridgeAndValidation();
await testErrorsAndAbort();
console.log('PASS bridge discovery request/privacy bounds, strict grounding, no-bridge behavior, model errors, aborts, and configuration');
