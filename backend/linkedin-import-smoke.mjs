import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {api} from './api.mjs';
import {sanitizeBrightDataProfile} from './linkedin-import.mjs';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort()){
 if(file.startsWith('0001_'))sql.exec("ALTER TABLE profiles ADD COLUMN instagram_handle TEXT NOT NULL DEFAULT ''; ALTER TABLE profiles ADD COLUMN instagram_visible TEXT NOT NULL DEFAULT 'private';");
 sql.exec(fs.readFileSync('drizzle/'+file,'utf8').replaceAll('--> statement-breakpoint',''));
}
const DB={prepare(query){const statement=sql.prepare(query);let values=[];return{bind(...args){values=args;return this;},async first(){return statement.get(...values)||null;},async all(){return{results:statement.all(...values)};},async run(){return statement.run(...values);}};},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
let clock=2_000_000_000_000,fetchCalls=0,triggerCalls=0,progressCalls=0,progressFailures=0,geminiPrompt='';
const fetchMock=async(input,init={})=>{
 fetchCalls++;const url=new URL(String(input));
 if(url.pathname==='/datasets/v3/trigger'){
  triggerCalls++;
  const owner=sql.prepare('SELECT owner FROM linkedin_import_jobs WHERE stage=\'triggering\' ORDER BY updated DESC LIMIT 1').get();assert(owner,'trigger state must be durable before the paid request');
  assert.equal(url.origin,'https://api.brightdata.com');assert.equal(url.searchParams.get('dataset_id'),'gd_l1viktl72bvl7bjuj0');assert.equal(url.searchParams.get('format'),'json');assert.equal(init.headers.Authorization,'Bearer bright-secret');const requestBody=JSON.parse(init.body);assert.equal(requestBody.length,1);assert.match(requestBody[0].url,/^https:\/\/www\.linkedin\.com\/in\//);
  return Response.json({snapshot_id:'snapshot-1'});
 }
 if(url.pathname.startsWith('/datasets/v3/progress/')){progressCalls++;if(url.pathname.endsWith('/failed-snapshot'))return Response.json({status:'failed'});if(progressFailures-->0)return new Response('busy',{status:503});return Response.json({status:progressCalls===1?'running':'ready'});}
 if(url.pathname==='/datasets/v3/snapshot/snapshot-1')return Response.json([{name:'Alice Person',email:'alice@example.com',phone:'+82 10 1234 5678',headline:'데이터 제품을 만드는 엔지니어',about:'주말에는 재즈 공연과 데이터 시각화를 탐구합니다.',experience:[{title:'추천 시스템 엔지니어',company:'Example Corp',description:'음악 추천과 머신러닝 파이프라인 개발'}],skills:['Python','Machine Learning'],profile_url:'https://linkedin.com/in/alice-example'}]);
 if(url.hostname==='generativelanguage.googleapis.com'){
  assert.equal(init.headers['x-goog-api-key'],'gemini-secret');assert.match(url.pathname,/gemini-3\.5-flash-lite:generateContent$/);const body=JSON.parse(init.body);assert.equal(body.generationConfig.maxOutputTokens,1600);geminiPrompt=body.contents[0].parts[0].text;assert(!geminiPrompt.includes('alice@example.com'));assert(!geminiPrompt.includes('1234 5678'));assert(!geminiPrompt.includes('Alice Person'));
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({candidates:[{label:'음악 추천 시스템',category:'공부·일',evidence:'음악 추천과 머신러닝 파이프라인 개발'},{label:'재즈 공연',category:'음악',evidence:'주말에는 재즈 공연과 데이터 시각화를 탐구합니다.'},{label:'근거 없음',category:'기타',evidence:'입력에 없는 문장'}]})}]}}]});
 }
 throw new Error('unexpected fetch '+url);
};
const env={DB,BRIGHTDATA_API_KEY:'bright-secret',GEMINI_API_KEY:'gemini-secret',fetch:fetchMock,now:()=>clock};
async function call(body,token='',override={}){const response=await api(new Request('https://app.test/api/app',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),{...env,...override});return{status:response.status,data:await response.json()};}
async function account(username,profile=true){const password='private-password-123',registered=await call({action:'register',username,password,confirmPassword:password});assert.equal(registered.status,200);if(profile)await call({action:'saveProfile',name:username,interests:[{id:'keep',label:'기존 관심사',category:'기타',shared:true,preference:'like'}]},registered.data.token);return registered.data.token;}

assert.equal(sanitizeBrightDataProfile({name:'Secret Name',email:'secret@test.dev',skills:['Python'],experience:[{title:'Engineer',description:'Built search products'}]}).includes('Secret Name'),false);
assert.equal((await call({action:'startLinkedInImport',url:'https://evil.test/in/alice'})).status,401);
const noProfile=await account('noprofile',false);assert.equal((await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/no-profile'},noProfile)).status,400);
const alice=await account('alice'),bob=await account('bob');
const beforeInvalid=fetchCalls;assert.equal((await call({action:'startLinkedInImport',url:'http://linkedin.com/in/alice'},alice)).status,400);assert.equal(fetchCalls,beforeInvalid);
assert.equal((await call({action:'startLinkedInImport',url:'https://user:pass@linkedin.com/in/alice'},alice)).status,400);assert.equal((await call({action:'startLinkedInImport',url:'https://linkedin.com:444/in/alice'},alice)).status,400);assert.equal((await call({action:'startLinkedInImport',url:'https://linkedin.com/in/alice%20smith'},alice)).status,400);
const concurrentStarts=await Promise.all([call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/bob-example'},bob),call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/bob-example'},bob)]);assert.deepEqual(concurrentStarts.map(result=>result.status),[200,200],JSON.stringify(concurrentStarts));assert.equal(new Set(concurrentStarts.map(result=>result.data.jobId)).size,1);assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM linkedin_import_jobs WHERE owner=(SELECT owner FROM accounts WHERE username='bob') AND status='pending'").get().count,1);
sql.prepare("UPDATE linkedin_import_jobs SET status='failed' WHERE id=?").run(concurrentStarts[0].data.jobId);
const started=await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/alice-example?tracking=1#bio'},alice);assert.equal(started.status,200);assert.equal(started.data.url,'https://www.linkedin.com/in/alice-example');
assert.equal((await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/alice-example'},alice)).data.jobId,started.data.jobId);
assert.equal((await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/different'},alice)).status,429);
assert.equal((await call({action:'pollLinkedInImport',jobId:started.data.jobId},bob)).status,404);
await Promise.all([call({action:'pollLinkedInImport',jobId:started.data.jobId},alice),call({action:'pollLinkedInImport',jobId:started.data.jobId},alice)]);assert.equal(triggerCalls,1);
let polled={data:{status:'pending'}};for(let attempt=0;attempt<6&&polled.data.status==='pending';attempt++)polled=await call({action:'pollLinkedInImport',jobId:started.data.jobId},alice);assert.equal(progressCalls,2);assert.equal(polled.data.status,'ready');assert.equal(polled.data.candidates.length,2);assert(polled.data.candidates.every(item=>item.shared===false&&item.preference==='explore'&&item.source.kind==='linkedin'));
assert.equal(sql.prepare('SELECT payload FROM linkedin_import_jobs WHERE id=?').get(started.data.jobId).payload,null);
assert.equal(JSON.stringify(sql.prepare('SELECT * FROM linkedin_import_jobs WHERE id=?').get(started.data.jobId)).includes('alice@example.com'),false);
assert.equal((await call({action:'saveLinkedInImport',jobId:started.data.jobId,selectedIds:['forged']},alice)).status,400);
assert.equal((await call({action:'saveLinkedInImport',jobId:started.data.jobId,selectedIds:[polled.data.candidates[0].id,polled.data.candidates[0].id]},alice)).status,400);
const saved=await call({action:'saveLinkedInImport',jobId:started.data.jobId,selectedIds:polled.data.candidates.map(item=>item.id)},alice);assert.equal(saved.status,200);assert.equal(saved.data.count,2);assert.equal(saved.data.interests.find(item=>item.id==='keep').shared,true);assert(saved.data.interests.filter(item=>item.source?.kind==='linkedin').every(item=>item.shared===false&&item.preference==='explore'));
const aliceProfile=sql.prepare("SELECT id FROM profiles WHERE owner=(SELECT owner FROM accounts WHERE username='alice')").get();const publicView=await api(new Request('https://app.test/api/app?profile='+aliceProfile.id),env);assert.equal((await publicView.json()).profile.interests.some(item=>item.source?.kind==='linkedin'),false);

clock+=61_000;progressFailures=1;const retried=await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/retry-case'},alice);
let retryPoll=await call({action:'pollLinkedInImport',jobId:retried.data.jobId},alice);assert.equal(retryPoll.data.status,'pending','trigger stage');
retryPoll=await call({action:'pollLinkedInImport',jobId:retried.data.jobId},alice);assert.equal(retryPoll.data.status,'pending','retryable progress stage');assert.equal(sql.prepare('SELECT attempts FROM linkedin_import_jobs WHERE id=?').get(retried.data.jobId).attempts,1);
retryPoll=await call({action:'pollLinkedInImport',jobId:retried.data.jobId},alice);assert.equal(retryPoll.data.status,'pending','successful progress retry');sql.prepare("UPDATE linkedin_import_jobs SET status='failed' WHERE id=?").run(retried.data.jobId);
clock+=61_000;const missing=await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/missing-key'},alice);const missingPoll=await call({action:'pollLinkedInImport',jobId:missing.data.jobId},alice,{BRIGHTDATA_API_KEY:''});assert.equal(missingPoll.data.status,'failed');assert.match(missingPoll.data.error,/API 설정/);
clock+=61_000;const providerFailed=await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/provider-failed'},alice);sql.prepare("UPDATE linkedin_import_jobs SET stage='progress',provider_ref='failed-snapshot' WHERE id=?").run(providerFailed.data.jobId);const providerFailure=await call({action:'pollLinkedInImport',jobId:providerFailed.data.jobId},alice);assert.equal(providerFailure.data.status,'failed');assert.match(providerFailure.data.error,/수집하지 못했어요/);
clock+=61_000;const malformed=await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/malformed-model'},alice);sql.prepare("UPDATE linkedin_import_jobs SET stage='generate',payload='skills: Python' WHERE id=?").run(malformed.data.jobId);const malformedFetch=async(input,init)=>{const url=new URL(String(input));assert.equal(url.hostname,'generativelanguage.googleapis.com');return Response.json({candidates:[{content:{parts:[{thought:true,text:'{\"candidates\":[]}'},{text:'not json'}]}}]});};const malformedPoll=await call({action:'pollLinkedInImport',jobId:malformed.data.jobId},alice,{fetch:malformedFetch});assert.equal(malformedPoll.data.status,'failed');assert.match(malformedPoll.data.error,/올바른 관심사 후보/);
clock+=61_000;const lost=await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/lost-response'},alice);let lostCalls=0;const lostFetch=async()=>{lostCalls++;assert.equal(sql.prepare('SELECT stage FROM linkedin_import_jobs WHERE id=?').get(lost.data.jobId).stage,'triggering');return new Response('accepted but response was lost',{status:200,headers:{'Content-Type':'application/json'}});};const lostPoll=await call({action:'pollLinkedInImport',jobId:lost.data.jobId},alice,{fetch:lostFetch});assert.equal(lostPoll.data.status,'failed');clock+=60_000;assert.equal((await call({action:'pollLinkedInImport',jobId:lost.data.jobId},alice,{fetch:lostFetch})).data.status,'failed');assert.equal(lostCalls,1);
clock+=61_000;const orphaned=await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/orphaned-trigger'},alice);sql.prepare("UPDATE linkedin_import_jobs SET stage='triggering',lease_until=? WHERE id=?").run(clock-1,orphaned.data.jobId);const beforeOrphanPoll=triggerCalls,orphanedPoll=await call({action:'pollLinkedInImport',jobId:orphaned.data.jobId},alice);assert.equal(orphanedPoll.data.status,'failed');assert.equal(triggerCalls,beforeOrphanPoll);
sql.prepare("UPDATE linkedin_import_jobs SET status='pending',expires=? WHERE id=?").run(clock-1,concurrentStarts[0].data.jobId);clock+=11*60*1000;const expired=await call({action:'startLinkedInImport',url:'https://www.linkedin.com/in/after-expiry'},bob);assert.equal(expired.status,200);assert.equal(sql.prepare('SELECT status FROM linkedin_import_jobs WHERE id=?').get(concurrentStarts[0].data.jobId).status,'failed');
assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM linkedin_import_jobs WHERE payload IS NOT NULL').get().count,0);
console.log('PASS: LinkedIn URL validation, owner jobs, cooldown/reuse, claim concurrency, Bright Data async stages/retry, sanitized Gemini evidence, trusted private save and failure messages');
