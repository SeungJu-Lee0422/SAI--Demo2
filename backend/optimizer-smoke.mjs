import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {findMatches} from '../shared/matching.ts';
import {rankInterests,scoreGroup} from '../shared/grouping.ts';
import {buildGroupCandidates,optimizeGroups} from './group-optimizer.mjs';

const profile=(id,labels=['공통 주제'])=>({id,name:id,bio:'',color:'',interests:labels.map((label,index)=>({id:`${id}-${index}`,label,category:'공부·일',shared:true}))});
const evidence=(profile,label)=>({profile,label});
const match=(id,label,members)=>({id,label,category:'공부·일',kind:'exact',members,evidence:members.map(member=>evidence(member,label)),reason:'test'});

const tablePeople=['a','b','c','d'].map(id=>profile(id));
const tableMatches=[
 match('inside','테이블 주제',['a','b','c']),
 match('outside','외부 주제',['c','d']),
];
const ranked=rankInterests(tableMatches,tablePeople.slice(0,3));
assert.equal(ranked.length,1);
assert.deepEqual(ranked[0].members,['a','b','c']);
assert(ranked[0].evidence.every(item=>item.profile!=='d'));

const duplicatePairMatches=[
 match('pair-one','주제 1',['a','b']),
 match('pair-two','주제 2',['a','b']),
 match('pair-with-outsider','주제 3',['a','b','d']),
];
const groupMetrics=scoreGroup(tablePeople,duplicatePairMatches,['a','b','c']);
assert.equal(groupMetrics.pairCoverage,1/3);
assert.equal(groupMetrics.memberBalance,0);
assert.deepEqual(groupMetrics,scoreGroup(tablePeople,duplicatePairMatches.map(item=>({...item,members:item.members.filter(id=>id!=='d'),evidence:item.evidence.filter(item=>item.profile!=='d')})),['a','b','c']));

const validatePlan=(plan,people,size)=>{
 const assigned=plan.groups.flatMap(group=>group.ids);
 assert.equal(assigned.length,people.length);
 assert.equal(new Set(assigned).size,people.length);
 assert.deepEqual(assigned.slice().sort(),people.map(person=>person.id).sort());
 const expectedGroups=Math.ceil(people.length/size);
 const low=Math.floor(people.length/expectedGroups),high=Math.ceil(people.length/expectedGroups);
 assert.equal(plan.groups.length,expectedGroups);
 assert(plan.groups.every(group=>group.ids.length>=low&&group.ids.length<=high));
 assert(plan.groups.every(group=>Number.isFinite(group.score)&&group.score>=0&&group.score<=1));
 assert(plan.groups.every(group=>group.interests.length<=3&&group.interests.every(interest=>interest.members.every(id=>group.ids.includes(id)))));
 for(const group of plan.groups)for(const value of Object.values(group.metrics))assert(Number.isFinite(value)&&value>=0&&value<=1);
 assert.equal(plan.unassigned.length,0);
 assert.equal(plan.algorithm,'ortools-cp-sat');
 assert(['OPTIMAL','FEASIBLE'].includes(plan.solverStatus));
};
const signatures=plans=>plans.map(plan=>plan.groups.map(group=>group.ids.slice().sort().join(',')).sort().join('|'));

async function solve(count,size=4,labelsFor=()=>['공통 주제']){
 const people=Array.from({length:count},(_,index)=>profile(`p${String(index).padStart(2,'0')}`,labelsFor(index)));
 const matches=findMatches(people);
 const started=performance.now();
 const plans=await optimizeGroups(people,matches,size);
 const elapsed=performance.now()-started;
 assert.equal(plans.length,3);
 for(const plan of plans)validatePlan(plan,people,size);
 assert.equal(new Set(signatures(plans)).size,plans.length);
 assert(elapsed<15_000,`${count}명 최적화가 ${Math.round(elapsed)}ms 걸렸습니다.`);
 return {people,matches,plans,elapsed};
}

const sixFirst=await solve(6,3);
const sixSecond=await solve(6,3);
assert.deepEqual(signatures(sixSecond.plans),signatures(sixFirst.plans));
assert.equal(sixFirst.plans.length,3);

const twelveFirst=await solve(12,4);
const twelveSecond=await solve(12,4);
assert.deepEqual(signatures(twelveSecond.plans),signatures(twelveFirst.plans));
assert.equal(twelveFirst.plans.length,3);

const twentyFour=await solve(24,4,index=>[`클러스터 ${Math.floor(index/4)}`]);
assert.equal(buildGroupCandidates(twentyFour.people,twentyFour.matches,4).candidateScope,'exhaustive');
const thirty=await solve(30,4,index=>[`클러스터 ${index<24?Math.floor(index/4):6+Math.floor((index-24)/3)}`]);
assert.equal(buildGroupCandidates(thirty.people,thirty.matches,4).candidateScope,'bounded');

console.log(`PASS scoped ranking, unique pair coverage, real CP-SAT exact cover, balanced capacity, deterministic Top 3, and bounded runtimes (12=${Math.round(twelveFirst.elapsed)}ms, 24=${Math.round(twentyFour.elapsed)}ms, 30=${Math.round(thirty.elapsed)}ms)`);
