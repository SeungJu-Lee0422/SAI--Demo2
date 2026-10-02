import assert from 'node:assert/strict';
const tokens=[],ids=[];
async function call(b,t='',q=''){const r=await fetch('http://localhost:8788/api/app'+q,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},...(b?{body:JSON.stringify(b)}:{})});return{status:r.status,data:await r.json()};}
for(let i=0;i<5;i++){const session=await call({action:'session'});tokens.push(session.data.token);const p=await call({action:'saveProfile',name:'검증'+i,bio:'',interests:[{id:'x',label:i===0?'데이식스':'DAY6',category:'음악',shared:true},{id:'private',label:'비공개테스트',category:'기타',shared:false}]},tokens[i]);assert.equal(p.status,200);ids.push(p.data.id);}
const room=await call({action:'createRoom',name:'검증 모임'},tokens[0]);for(let i=1;i<5;i++)assert.equal((await call({action:'joinRoom',id:room.data.id},tokens[i])).status,200);
const analyze=await call({action:'analyze',room:room.data.id},tokens[0]);assert.equal(analyze.data.people.length,5);assert.equal(analyze.data.matches.find(x=>x.label==='DAY6').members.length,5);assert(!analyze.data.people.some(p=>p.interests.some(t=>t.label==='비공개테스트')));
const stranger=await call({action:'session'});assert.equal((await call({action:'analyze',room:room.data.id},stranger.data.token)).status,400);
await call({action:'requestFriend',id:ids[1]},tokens[0]);assert.equal((await call(undefined,tokens[1])).data.requests.length,1);await call({action:'acceptFriend',id:ids[0]},tokens[1]);assert.equal((await call(undefined,tokens[0])).data.friends.length,1);
const pub=await call(undefined,'','?profile='+ids[0]);assert.equal(pub.data.profile.interests.length,1);assert.equal((await call({action:'saveProfile',name:'연락처',interests:[{id:'bad',label:'010-1234-5678',category:'기타',shared:true}]},tokens[0])).status,400);
for(let i=0;i<5;i++)await call({action:'deleteProfile'},tokens[i]);console.log('PASS: 5-person room, canonical matching, private-item exclusion, friend request/accept, input filtering, profile deletion');
