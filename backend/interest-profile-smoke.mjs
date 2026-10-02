import assert from 'node:assert/strict';
import {personalItems,personalTexts,rankPersonal} from '../shared/interest-profile.ts';
import {embeddingItems,rankSemantic} from '../shared/semantic-ranking.ts';

const source={kind:'youtube',label:'시청 기록',detail:'Blue Note 라이브 공연',url:'https://example.com/watch'};
const person={id:'owner',name:'Owner',bio:'',color:'',interests:[
 {id:'private-like',label:'실내 재즈',category:'음악',shared:false,preference:'like',source},
 {id:'shared-explore',label:'즉흥 공연',category:'음악',shared:true,preference:'explore'},
 {id:'private-avoid',label:'시끄러운 공연',category:'음악',shared:false,preference:'avoid'},
 {id:'shared-avoid',label:'붐비는 축제',category:'여행',shared:true,preference:'avoid'},
 {id:'other-category',label:'실내 클라이밍',category:'운동',shared:false,preference:'like'},
]};

assert.deepEqual(personalItems(person).map(item=>item.id),['private-like','shared-explore','other-category']);
assert(personalTexts(person)[0].includes(source.detail));
assert(!personalTexts(person).some(text=>text.includes('시끄러운')||text.includes('붐비는')));

const personalTopics=rankPersonal(person,[[1,0],[.8,.6],[1,0]]);
const jazzTopic=personalTopics.find(topic=>topic.label==='실내 재즈');
assert(jazzTopic);
assert.deepEqual(jazzTopic.evidence.map(item=>item.label),['실내 재즈','즉흥 공연']);
assert(personalTopics.every(topic=>person.interests.some(item=>item.label===topic.label)));
assert.strictEqual(jazzTopic.evidence[0].source,source);
assert(personalTopics.some(topic=>topic.label==='실내 클라이밍'&&topic.evidence.length===1));

assert.throws(()=>rankPersonal(person,[[1,0]]),/벡터 수/);
assert.throws(()=>rankPersonal(person,[[1,0],[1],[1,0]]),/벡터 형식/);
assert.throws(()=>rankPersonal(person,[[1,0],[Number.NaN,0],[1,0]]),/벡터 형식/);
assert.throws(()=>rankPersonal(person,[[1,0],[],[1,0]]),/벡터 형식/);

const profile=(id,label,vector,{extra=[]}={})=>({
 id,name:id,bio:'',color:'',vector,
 interests:[{id:`${id}-public`,label,category:'공부·일',shared:true,preference:'like',source:{kind:'linkedin',label:`${id} 경력`,detail:`${label} 프로젝트`}},...extra],
});
const semanticPeople=[
 profile('a','추천 시스템',[1,0],{extra:[{id:'a-private',label:'비공개 취미',category:'공부·일',shared:false,preference:'like'}]}),
 profile('b','개인화 모델',[.8,.6],{extra:[{id:'b-avoid',label:'광고 최적화',category:'공부·일',shared:true,preference:'avoid'}]}),
 profile('c','랭킹 품질',[.8,-.6]),
 profile('d','밴딧 실험',[.28,.96]),
];
const semanticVectors=embeddingItems(semanticPeople).map(item=>semanticPeople.find(person=>person.id===item.profile).vector);
assert.equal(semanticVectors.length,4);
const semanticMatches=rankSemantic(semanticPeople,semanticVectors);
const threeMemberMatch=semanticMatches.find(match=>match.members.length===3&&['a','b','c'].every(id=>match.members.includes(id)));
assert(threeMemberMatch);
assert.deepEqual(new Set(threeMemberMatch.evidence.map(item=>item.profile)),new Set(threeMemberMatch.members));
assert(threeMemberMatch.evidence.every(item=>item.source?.detail));
assert(!semanticMatches.some(match=>match.members.length===4));
assert(!semanticMatches.some(match=>match.evidence.some(item=>['비공개 취미','광고 최적화'].includes(item.label))));
assert.throws(()=>rankSemantic(semanticPeople,semanticVectors.slice(1)),/벡터 수/);
assert.throws(()=>rankSemantic(semanticPeople,semanticVectors.map((vector,index)=>index===2?[1]:vector)),/벡터 형식/);

console.log('PASS personal private interests, avoidance exclusion, grounded clusters, source preservation, direct multi-member semantic evidence, and malformed vectors');
