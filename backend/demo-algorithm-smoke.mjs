import assert from 'node:assert/strict';
import {analyzeRecords,optimizeGroups,scoreCandidateGroups} from './demo-analysis.mjs';
import {commonInterests,demoProfiles,demoTopics,expectedTableSizes} from '../shared/demo-analysis.ts';

const profile=(id,labels,score=90)=>({id,name:id,color:'#000',interests:labels.map((label,index)=>({id:`${id}-${index}`,label,category:'테스트',score,evidence:[{id:`${id}-e${index}`,source:'demo',title:`${label} example`,text:`${id}의 명시적 시현 예시 ${label}`}]}))});
const trio=[profile('a',['일본 음악','AI']),profile('b',['일본 음악','Computer Vision']),profile('c',['일본 음악','데이터 분석'])];
const topics=commonInterests(trio);
assert(topics.some(topic=>topic.label==='일본 음악'));
assert(topics.some(topic=>topic.label==='AI·머신러닝'&&topic.matchType==='Category'));
assert(topics.every(topic=>topic.members.length===3&&topic.evidence.length===3&&topic.evidence.every(member=>member.sources.length>0)));
assert.deepEqual(commonInterests([profile('a',['일본 음악']),profile('b',['일본 음악','게임']),profile('c',['게임'])]),[], 'Pair-only overlap must never become an all-member common topic.');
assert.deepEqual(commonInterests([profile('a',['일본 음악']),{...profile('b',['일본 음악']),interests:[]}]),[]);
assert.throws(()=>commonInterests([trio[0],trio[0]]),/중복/);
assert.throws(()=>expectedTableSizes(7,3),/편성할 수 없습니다/);
assert.deepEqual(expectedTableSizes(10,4),{tables:3,lower:3,upper:4,smallTables:2,largeTables:1});
const oneVector=index=>Array.from({length:demoTopics.length},(_,column)=>column===index?1:0);
let seenTexts;
const records=[
 {id:'yt-1',source:'youtube',title:'Deep Learning Playlist',text:'Machine learning neural network course',url:'https://www.youtube.com/playlist?list=one'},
 {id:'li-1',source:'linkedin',title:'Computer Vision Project',text:'Computer vision image recognition engineer'},
 {id:'basic-identity',source:'linkedin',kind:'basic',title:'Only Name',text:'Person Name'},
];
const analyzed=await analyzeRecords(records,{embed:async texts=>{
 seenTexts=texts;
 return texts.map((text,index)=>index<2?oneVector(index===0?0:1):oneVector(index-2));
}});
assert(!seenTexts.some(text=>text.includes('Only Name')), 'OIDC name must not become career evidence.');
assert(analyzed.some(interest=>interest.label==='AI·머신러닝'&&interest.evidence.some(e=>e.id==='yt-1')));
assert(analyzed.some(interest=>interest.label==='Computer Vision'&&interest.evidence.some(e=>e.id==='li-1')));
assert(analyzed.every(interest=>interest.evidence.every(e=>e.source!=='demo')));
await assert.rejects(()=>analyzeRecords([{id:'fake',source:'demo',title:'AI',text:'sample'}]),/실제/);
await assert.rejects(()=>analyzeRecords(records,{embed:async()=>[]}),/데이터 수/);
await assert.rejects(()=>analyzeRecords(records,{embed:async texts=>texts.map(()=>[0,0])}),/빈 벡터/);
await assert.rejects(()=>analyzeRecords(Array.from({length:3001},()=>records[0])),/3,000/);

const signature=plan=>plan.groups.map(group=>group.memberIds.slice().sort().join(',')).sort().join('|');
function verify(result,people,capacity) {
 assert.equal(result.solver.engine,'OR-Tools CP-SAT');
 assert.equal(result.plans.length,3);
 assert.equal(new Set(result.plans.map(signature)).size,3);
 assert(result.solver.runs.every(run=>['OPTIMAL','FEASIBLE'].includes(run.status)));
 for(const plan of result.plans) {
   const ids=plan.groups.flatMap(group=>group.memberIds);
   assert.equal(ids.length,people.length);
   assert.equal(new Set(ids).size,people.length);
   assert.deepEqual(ids.slice().sort(),people.map(person=>person.id).sort());
   assert(plan.groups.every(group=>group.memberIds.length>=3&&group.memberIds.length<=capacity));
   assert(plan.groups.every(group=>group.interests.every(topic=>topic.members.length===group.memberIds.length&&topic.evidence.length===group.memberIds.length)));
   assert(plan.groups.every(group=>Object.values(group.quality).every(score=>score>=0&&score<=100)));
 }
}

const ten=demoProfiles.slice(0,10);
const tenResult=await optimizeGroups(ten,4,{timeLimitSeconds:3});
verify(tenResult,ten,4);
assert(tenResult.plans.every(plan=>plan.groups.map(group=>group.memberIds.length).sort().join(',')==='3,3,4'));
const twentyFour=await optimizeGroups(demoProfiles,4,{timeLimitSeconds:4});
verify(twentyFour,demoProfiles,4);
assert.equal(twentyFour.solver.candidateCount,10626);
assert.equal(twentyFour.solver.candidateEnumeration,'exhaustive');
const single=await optimizeGroups(demoProfiles.slice(0,4),4,{timeLimitSeconds:1});
assert.equal(single.plans.length,1);
assert.match(single.solver.note,/1개/);
await assert.rejects(()=>optimizeGroups(ten,4,{pythonPath:'C:/missing-sai-python.exe'}),/Python 실행 환경/);
assert.throws(()=>scoreCandidateGroups([...ten,ten[0]],4),/중복/);
console.log(`PASS all-member coverage, evidence, semantic analysis contract, 10/24 real CP-SAT assignment, balanced size, distinct alternatives, infeasible/invalid runtime errors. 24-member elapsed ${twentyFour.solver.elapsedMs}ms; ${twentyFour.solver.status}.`);
