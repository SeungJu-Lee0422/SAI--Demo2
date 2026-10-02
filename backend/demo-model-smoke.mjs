import assert from 'node:assert/strict';
import {analyzeRecords} from './demo-analysis.mjs';
let lastStage='';
const records=[
 {id:'validation-career',source:'linkedin',kind:'skills',title:'Skills and projects',text:'Machine learning, deep learning, computer vision and object detection. Built Python image recognition projects.'},
 {id:'validation-music',source:'youtube',kind:'video',title:'YOASOBI THE FIRST TAKE',text:'Japanese music J-pop live performance by YOASOBI and Ado.'},
];
const interests=await analyzeRecords(records,{onProgress:p=>{if(p.stage!==lastStage){lastStage=p.stage;console.log(p.message);}}});
assert(interests.some(i=>i.id==='ai'||i.id==='vision'),'AI career evidence should produce an AI topic');
assert(interests.some(i=>i.id==='jpop'),'Japanese music evidence should produce J-pop');
assert(interests.every(i=>i.evidence.every(e=>records.some(r=>r.id===e.id))),'Every interest must preserve its input evidence ID');
console.log('Real Qwen3-Embedding smoke passed:',interests.map(i=>`${i.label} ${i.score}`).join(', '));
