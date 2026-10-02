import assert from 'node:assert/strict';
import {bridgeEvidenceStamp,bridgeTexts,harmonicMean,rankConversationTopics,representativeInterests,shouldDiscoverBridge,validateBridgeTopics} from '../shared/conversation-topics.ts';
import {rankInterests,scoreGroup,suggestGroups} from '../shared/grouping.ts';
import {toCommonInterest} from '../shared/service-presentation.ts';
import {rankSemantic} from '../shared/semantic-ranking.ts';
import {eligibleMatches} from '../shared/matching.ts';

const interest=(id,label,category,extra={})=>({id,label,category,shared:true,...extra});
const person=(id,interests)=>({id,name:id,bio:'',color:'#000',interests});
const connection=(profile,...interests)=>({profile,interests,reason:`${profile}의 공개 관심사가 이 주제와 이어져요.`});
const candidate=(id,label,connections,extra={})=>({id,label,category:'브리지',reason:'서로 다른 관심사 사이에서 함께 이야기할 구체적인 접점을 찾았어요.',connections,...extra});

const animePeople=[person('anime',[interest('anime-id','애니메이션','콘텐츠',{source:{kind:'youtube',label:'시청 기록',detail:'x'.repeat(300)}})]),person('japan',[interest('japan-id','일본 여행','여행')])];
const animeCandidate=candidate('anime-japan','애니메이션 배경지로 떠나는 일본 여행',[connection('anime','anime-id'),connection('japan','japan-id')],{confidence:.01});
const animeVectors=[[2,0],[1.6,1.2],[1.8,.6]];
const animeBridge=validateBridgeTopics(animePeople,[animeCandidate],animeVectors);
assert.equal(animeBridge.length,1);
assert.equal(animeBridge[0].kind,'bridge');
const numericUuid='00000000-0000-4000-8000-010123456789';
const uuidPeople=animePeople.map((person,index)=>index===0?{...person,id:numericUuid,interests:person.interests.map(interest=>({...interest,id:numericUuid}))}:person);
const uuidCandidate={...animeCandidate,connections:[{...animeCandidate.connections[0],profile:numericUuid,interests:[numericUuid]},animeCandidate.connections[1]]};
assert.equal(validateBridgeTopics(uuidPeople,[uuidCandidate],animeVectors).length,1,'opaque UUID references cannot be mistaken for phone numbers');
assert(animeBridge[0].consensus>=.65);
assert.deepEqual(Object.keys(animeBridge[0].relevance).sort(),['anime','japan']);
assert.equal(animeBridge[0].validation.evidenceStamp,bridgeEvidenceStamp(animePeople,animeCandidate.connections));
assert.equal(bridgeEvidenceStamp(animePeople,[...animeCandidate.connections].reverse()),animeBridge[0].validation.evidenceStamp,'evidence stamps are connection-order independent');
const categoryChanged=animePeople.map(item=>item.id==='anime'?{...item,interests:item.interests.map(value=>({...value,category:'게임'}))}:item);
const detailChanged=animePeople.map(item=>item.id==='anime'?{...item,interests:item.interests.map(value=>({...value,source:{...value.source,detail:'새로운 공개 근거'}}))}:item);
assert.notEqual(bridgeEvidenceStamp(categoryChanged,animeCandidate.connections),animeBridge[0].validation.evidenceStamp,'same label with a changed category invalidates saved relevance');
assert.notEqual(bridgeEvidenceStamp(detailChanged,animeCandidate.connections),animeBridge[0].validation.evidenceStamp,'changed source detail invalidates saved relevance');
assert.equal(representativeInterests(animePeople)[0].interests[0].source.detail.length,240);
assert.equal(bridgeTexts(animePeople,[animeCandidate]).length,3);
assert(!bridgeTexts(animePeople,[animeCandidate]).at(-1).includes(animeCandidate.connections[0].reason),'generated explanations must not enter embedding text');
const sensitiveSource=person('safe',[interest('safe-id','음악','음악',{source:{kind:'youtube',label:'시청 기록',detail:'문의 test@example.com'}})]);
assert.equal(representativeInterests([sensitiveSource])[0].interests[0].source.detail,undefined,'sensitive source detail must be removed, not retained through object spread');

const crossPeople=[
 person('photo',[interest('photo-id','사진 촬영','기타')]),
 person('travel',[interest('travel-id','도시 여행','여행')]),
 person('architecture',[interest('architecture-id','현대 건축','공부·일')]),
];
const crossCandidate=candidate('city-walk','건축을 기록하는 도시 사진 산책',[connection('photo','photo-id'),connection('travel','travel-id'),connection('architecture','architecture-id')],{confidence:.02});
const crossVectors=[[1,.5,.5],[.5,1,.5],[.5,.5,1],[1,1,1]];
const crossBridge=validateBridgeTopics(crossPeople,[crossCandidate],crossVectors)[0];
assert(crossBridge,'cross-category evidence should form a bridge');
assert.equal(suggestGroups(crossPeople,[crossBridge],3).groups[0].ids.length,3,'complete-link grouping accepts cross-category bridge references');
assert.equal(rankInterests([crossBridge],crossPeople).length,1);
assert.equal(rankInterests([{...crossBridge,validation:undefined}],crossPeople).length,0,'only validator-produced bridges enter group scoring');
assert.equal(rankInterests([crossBridge],[...crossPeople,person('extra',[interest('extra-id','도예','기타')])]).length,0,'an unsupported extra member invalidates the bridge');
const metrics=scoreGroup(crossPeople,[crossBridge],crossPeople.map(item=>item.id));
assert(metrics.topicStrength>0&&metrics.memberBalance>.6&&metrics.pairCoverage===1);
const presented=toCommonInterest(crossBridge,crossPeople);
assert.equal(presented.matchType,'Bridge');
assert(presented.evidence.every(row=>row.score>=60));
assert.equal(Object.keys(presented.explanations).length,3);
const unevenBridge={...crossBridge,relevance:{photo:.94,travel:.90,architecture:.61},consensus:.7,conversationScore:.75};
const strongPair=rankInterests([unevenBridge],crossPeople.slice(0,2))[0];
const weakPair=rankInterests([unevenBridge],crossPeople.slice(1))[0];
assert(strongPair.consensus>weakPair.consensus&&strongPair.conversationScore>weakPair.conversationScore,'bridge score must be recomputed for the current subgroup');
assert.equal(toCommonInterest(unevenBridge,crossPeople.slice(0,2)).consensus,Math.round(strongPair.consensus*100));

const subsetDirect={id:'subset-direct',label:'도시 기록 산책',category:'여행',kind:'ai',members:['photo','travel'],evidence:[{profile:'photo',label:'사진 촬영'},{profile:'travel',label:'도시 여행'}],reason:'두 사람의 직접 주제',similarity:.7,relevance:{photo:.94,travel:.86}};
const globallyRankedDirect=rankConversationTopics([subsetDirect],[],crossPeople)[0];
assert.equal(globallyRankedDirect.consensus,0,'an unsupported global member makes global harmonic consensus zero');
const pairDirect=rankInterests([globallyRankedDirect],crossPeople.slice(0,2))[0];
assert(pairDirect.consensus>.8&&pairDirect.conversationScore>globallyRankedDirect.conversationScore,'direct score recovers for a fully supported subgroup');
assert.equal(toCommonInterest(globallyRankedDirect,crossPeople.slice(0,2)).consensus,Math.round(pairDirect.consensus*100));

const weakVectors=[[1,0],[1,0],[1,0],[1,0],[.58,.815]];
const weakPeople=[person('a',[interest('a-id','애니','콘텐츠')]),person('b',[interest('b-id','도쿄','여행')]),person('c',[interest('c-id','라멘','음식')]),person('d',[interest('d-id','사진','기타')])];
const weakCandidate=candidate('weak','도쿄 애니메이션 미식 사진 여행',weakPeople.map(item=>connection(item.id,`${item.id}-id`)));
assert.equal(validateBridgeTopics(weakPeople,[weakCandidate],weakVectors).length,0,'the weakest member must clear the relevance threshold');
assert.equal(harmonicMean([.9,.9,.9,.6])<.9,true);

const baseConnections=[connection('anime','anime-id'),connection('japan','japan-id')];
const invalidCandidates=[
 candidate('partial','애니메이션 일본 산책',[connection('anime','anime-id')]),
 candidate('private','비공개 취향 여행',[connection('anime','private-id'),connection('japan','japan-id')]),
 candidate('forged','위조 근거 여행',[connection('anime','forged-id'),connection('japan','japan-id')]),
 candidate('broad','관심사',baseConnections),
 candidate('same','하나의 같은 관심',[connection('anime','anime-id'),connection('japan','anime-id')]),
];
for(const invalid of invalidCandidates){
 const vectors=[...animeVectors.slice(0,2),animeVectors[2]];
 assert.equal(validateBridgeTopics(animePeople,[invalid],vectors).length,0,`${invalid.id} must be rejected`);
}
const malformedCandidates=[
 null,
 {...animeCandidate,label:'x'.repeat(81)},
 {...animeCandidate,label:'culture'},
 {...animeCandidate,label:'Hobbies'},
 {...animeCandidate,label:'common interests'},
 {...animeCandidate,reason:'문의 test@example.com'},
 {...animeCandidate,extra:'unexpected'},
 {...animeCandidate,connections:[{...animeCandidate.connections[0],reason:'https://example.com'},animeCandidate.connections[1]]},
];
for(const malformed of malformedCandidates){
 assert.equal(validateBridgeTopics(animePeople,[malformed],[...animeVectors.slice(0,2),animeVectors[2]]).length,0,'malformed, broad, overlong, or sensitive candidates must be rejected');
}
const privatePeople=[person('a',[interest('private','비공개 취미','콘텐츠',{shared:false}),interest('public','애니','콘텐츠')]),person('b',[interest('b','일본','여행')])];
assert.equal(validateBridgeTopics(privatePeople,[candidate('private-ref','일본 애니 여행',[connection('a','private'),connection('b','b')])],[[1,0],[1,0],[1,0]]).length,0);
assert.equal(bridgeEvidenceStamp(privatePeople,[connection('a','private'),connection('b','b')]),'','private references never enter an evidence stamp');
assert.equal(bridgeEvidenceStamp(privatePeople,[{profile:'a',interests:Array(7).fill('public'),reason:'x'},connection('b','b')]),'','evidence stamp inputs are bounded');
const samePeople=[person('a',[interest('a','사진','기타')]),person('b',[interest('b','사진','여행')])];
assert.equal(validateBridgeTopics(samePeople,[candidate('no-distinct','사진 산책',[connection('a','a'),connection('b','b')])],[[1,0],[1,0],[1,0]]).length,0,'a bridge needs distinct member interests');
const avoidPeople=[person('a',[interest('a','애니','콘텐츠'),interest('avoid','일본 여행','음식',{preference:'avoid'})]),person('b',[interest('b','일본 여행','여행')])];
assert.equal(validateBridgeTopics(avoidPeople,[candidate('avoid','일본 애니 여행',[connection('a','a'),connection('b','b')])],[[1,0],[1,0],[1,0]]).length,0,'shared avoids apply across category labels');
const unrelatedAvoider=person('outsider',[interest('outsider-avoid','애니메이션','기타',{preference:'avoid'}),interest('outsider-like','도예','기타')]);
const pool=[...animePeople,unrelatedAvoider];
assert.equal(eligibleMatches(animeBridge,pool).length,1,'an unrelated pool member cannot veto a subset bridge');
assert(suggestGroups(pool,animeBridge,3).groups.some(group=>group.ids.includes('anime')&&group.ids.includes('japan')),'subset bridge remains a grouping candidate in a larger pool');
assert.equal(eligibleMatches([{...animeBridge[0],members:[...animeBridge[0].members,'outsider']}],pool).length,0,'an avoid veto applies when that person joins the bridge members');
const direct=[{id:'direct',label:animeCandidate.label,category:'브리지',kind:'ai',members:['anime','japan'],evidence:[{profile:'anime',label:'애니메이션'},{profile:'japan',label:'일본 여행'}],reason:'direct',similarity:.8}];
assert.equal(validateBridgeTopics(animePeople,[animeCandidate],animeVectors,direct).length,0,'duplicate direct topics are rejected');
assert.throws(()=>validateBridgeTopics(animePeople,[animeCandidate],[[1,0],[1,0],[NaN,0]]),/벡터/);
assert.throws(()=>validateBridgeTopics(animePeople,[animeCandidate],animeVectors.slice(1)),/벡터 수/);

const highConfidence={...animeCandidate,id:'high',label:'일본 애니 로컬 여행',confidence:.99};
const lowConfidence={...animeCandidate,id:'low',label:'애니 일본 로컬 여행',confidence:.01};
const confidenceVectors=[...animeVectors.slice(0,2),[1.7,.7],[1.8,.6]];
const confidenceRank=validateBridgeTopics(animePeople,[highConfidence,lowConfidence],confidenceVectors);
const flippedRank=validateBridgeTopics(animePeople,[{...highConfidence,confidence:.01},{...lowConfidence,confidence:.99}],confidenceVectors);
assert.deepEqual(confidenceRank.map(item=>item.id),flippedRank.map(item=>item.id),'Gemini confidence must not affect deterministic ranking');
assert.equal(confidenceRank[0].id,'low');
assert(shouldDiscoverBridge([],animePeople));
assert(!shouldDiscoverBridge(Array.from({length:3},(_,index)=>({...direct[0],id:`d${index}`,label:`구체적 주제 ${index}`,kind:'exact'})),animePeople));
assert(rankConversationTopics([],animeBridge,animePeople).some(item=>item.kind==='bridge'));
assert(rankConversationTopics(Array.from({length:3},(_,index)=>({...direct[0],id:`d${index}`,label:`구체적 주제 ${index}`,kind:'exact'})),animeBridge,animePeople).every(item=>item.kind!=='bridge'));
const semanticPeople=[person('s1',[interest('s1','도시 사진','여행')]),person('s2',[interest('s2','건축 산책','여행')]),person('s3',[interest('s3','골목 여행','여행')])];
const semantic=rankSemantic(semanticPeople,[[1,0],[.8,.6],[.9,.435889]])[0];
assert.deepEqual(Object.keys(semantic.relevance).sort(),['s1','s2','s3']);
const rankedSemantic=rankConversationTopics([semantic],[],semanticPeople)[0];
assert(Math.abs(rankedSemantic.consensus-harmonicMean(Object.values(semantic.relevance)))<1e-9,'direct semantic consensus uses real per-member relevance');

console.log('PASS bridge topics require public all-member evidence, normalized relevance and harmonic consensus; preserve direct-first ranking; support cross-category grouping and presentation');
