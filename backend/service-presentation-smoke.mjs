import assert from 'node:assert/strict';
import {toCommonInterest, toDemoPlan, toDemoProfile, toEvidence} from '../shared/service-presentation.ts';

const people = [
  {id:'a',name:'민서',bio:'',color:'#111',isDemo:true,interests:[{id:'a-manual',label:'재즈',category:'음악',shared:true},{id:'a-youtube',label:'Blue Note',category:'음악',shared:true,source:{kind:'youtube',label:'시청 기록',detail:'Blue Note 라이브',url:'https://www.youtube.com/watch?v=test'}},{id:'a-demo',label:'베이킹',category:'음식',shared:true,source:{kind:'demo',label:'인터뷰 예시',detail:'주말마다 새로운 빵을 구워요.'}}]},
  {id:'b',name:'지우',bio:'',color:'#222',interests:[{id:'b-linkedin',label:'피아노',category:'음악',shared:true,source:{kind:'linkedin',label:'LinkedIn Skills',detail:'Jazz piano'}}]},
];
const match = {id:'related-jazz',label:'재즈',category:'음악',kind:'related',members:['a','b'],similarity:.72,reason:'공유 관심사 근거가 연결돼요.',evidence:[{profile:'a',label:'재즈'},{profile:'a',label:'베이킹',source:people[0].interests[2].source},{profile:'b',label:'피아노',source:people[1].interests[0].source}]};

assert.equal(toEvidence(people[0].interests[0]).source, 'manual');
assert.equal(toEvidence(people[0].interests[1]).text, 'Blue Note 라이브');
assert.equal(toEvidence(people[0].interests[2]).source, 'demo');
assert.equal(toEvidence(people[0].interests[2]).title, '인터뷰 예시');
const profile = toDemoProfile(people[0]);
assert.equal(profile.isDemo, true);
assert.equal(profile.interests[0].evidence[0].source, 'manual');
assert.equal(profile.interests[1].evidence[0].source, 'youtube');
assert.equal(profile.interests[0].score, 0, 'missing source scores stay explicit instead of being fabricated');

const common = toCommonInterest(match, people);
assert.equal(common.score, 72);
assert.equal(common.commonality, 100);
assert.equal(common.evidenceStrength, 72);
assert.deepEqual(common.evidence.map(row => row.score), [72,72]);
assert.deepEqual(common.evidence.map(row => row.sources[0].source), ['manual','linkedin']);
assert.deepEqual(common.evidence[0].sources[1], {id:'related-jazz-a-1',source:'demo',title:'인터뷰 예시',text:'주말마다 새로운 빵을 구워요.'});

const plan = toDemoPlan({mode:'balance',groups:[{ids:['a','b'],score:.68,interests:[match],metrics:{topicStrength:.72,memberBalance:.6,topicBreadth:1/3,pairCoverage:1,utility:.69}}],unassigned:['c'],score:68,minScore:68,range:0,algorithm:'ortools-cp-sat',solverStatus:'FEASIBLE',candidateScope:'bounded',candidateCount:42}, people);
assert.equal(plan.label, '그룹 간 균형 우선');
assert.equal(plan.score, 68);
assert.equal(plan.groups[0].score, 68);
assert.deepEqual(plan.groups[0].quality, {topicStrength:72,memberBalance:60,topicBreadth:33,pairCoverage:100,groupUtility:69});
assert.equal(plan.groups[0].interests[0].score, 72);
assert.deepEqual(plan.unassigned, ['c']);
assert.deepEqual({solverStatus:plan.solverStatus,candidateScope:plan.candidateScope,algorithm:plan.algorithm,candidateCount:plan.candidateCount},{solverStatus:'FEASIBLE',candidateScope:'bounded',algorithm:'ortools-cp-sat',candidateCount:42});

console.log('PASS service presentation keeps provenance, existing SAI scores, GroupMetrics, solver metadata, and unassigned members');
