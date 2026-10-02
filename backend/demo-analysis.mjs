import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {demoTopics, commonInterests, commonFromPrepared, prepareDemoProfile, validateDemoProfiles, groupQuality, expectedTableSizes} from '../shared/demo-analysis.ts';

export {commonInterests};
export const QWEN_MODEL='onnx-community/Qwen3-Embedding-0.6B-ONNX';
const backendDirectory=path.dirname(fileURLToPath(import.meta.url));
let extractorPromise;
const emit=(callback,stage,message,progress)=>callback?.({stage,message,progress});
const normalize=(vector)=>{
  if(!Array.isArray(vector)||!vector.length||vector.some(v=>!Number.isFinite(v)))throw new Error('Embedding 모델이 유효한 벡터를 반환하지 않았습니다.');
  const length=Math.hypot(...vector);
  if(!length)throw new Error('Embedding 모델이 빈 벡터를 반환했습니다.');
  return vector.map(v=>v/length);
};
const cosine=(a,b)=>{
  if(a.length!==b.length)throw new Error('Embedding 벡터 차원이 일치하지 않습니다.');
  return a.reduce((sum,value,index)=>sum+value*b[index],0);
};

async function qwenEmbed(texts,onProgress) {
  if(!extractorPromise) {
    extractorPromise=(async()=>{
      const {pipeline,env}=await import('@huggingface/transformers');
      env.cacheDir=process.env.SAI_MODEL_CACHE||path.resolve(backendDirectory,'../.data/models');
      return pipeline('feature-extraction',QWEN_MODEL,{dtype:'q8',progress_callback:(event)=>{
        if(event.status==='progress')emit(onProgress,'model','Qwen3-Embedding 모델을 준비하고 있어요',Math.min(34,5+Math.round((event.progress||0)*0.29)));
      }});
    })().catch(error=>{extractorPromise=undefined;throw error;});
  }
  const extractor=await extractorPromise,vectors=[];
  // Small batches keep memory bounded on demo laptops. Pooling follows Qwen's last-token format.
  for(let start=0;start<texts.length;start+=4) {
    const output=await extractor(texts.slice(start,start+4),{pooling:'last_token',normalize:true,truncation:true,max_length:256});
    vectors.push(...output.tolist());
    emit(onProgress,'embedding','Qwen3로 실제 데이터의 의미를 분석하고 있어요',35+Math.round(45*Math.min(1,(start+4)/texts.length)));
  }
  return vectors;
}

function cleanText(value) {
  return String(value||'').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,' ').replace(/\s+/g,' ').trim();
}

function keywordMatch(text,keyword) {
  // Short Latin terms such as AI / Ado / UI need word boundaries to avoid "paid" etc.
  const escaped=keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return /^[a-z0-9\s-]+$/i.test(keyword) ? new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`,'i').test(text) : text.includes(keyword.toLowerCase());
}

export async function analyzeRecords(records,{onProgress,embed}={}) {
  if(!Array.isArray(records)||!records.length)throw new Error('먼저 YouTube 데이터를 불러오거나 LinkedIn 프로필 데이터를 등록해주세요.');
  if(records.length>3000)throw new Error('한 번에 최대 3,000개의 데이터 항목을 분석할 수 있습니다. 재생목록을 나누어 불러와주세요.');
  emit(onProgress,'preprocess','데이터를 정리하고 있어요',3);
  const cleaned=records.filter(record=>record.kind!=='basic').map((record,index)=>({
    id:String(record.id||`import-${index}`),source:record.source,title:cleanText(record.title).slice(0,300),text:cleanText(record.text).slice(0,6000),
    ...(record.url?{url:String(record.url)}:{}),
  })).filter(record=>['youtube','linkedin'].includes(record.source)&&(record.title||record.text));
  if(!cleaned.length)throw new Error('분석할 실제 YouTube 또는 LinkedIn 데이터가 없습니다.');
  const unique=[...new Map(cleaned.map(record=>[`${record.source}:${record.id}`,record])).values()];
  // Repeated playlist/channel descriptions are represented once for computation, but their
  // original source IDs are retained as evidence. Nothing is replaced with sample data.
  const texts=unique.map(record=>`${record.title}\n${record.text}`.slice(0,1800));
  const distinctTexts=[...new Set(texts)];
  const descriptions=demoTopics.map(topic=>`${topic.label}\n${topic.description}`);
  emit(onProgress,'embedding',`${unique.length}개 데이터 항목에서 관심사를 찾고 있어요`,10);
  const embedded=await (embed?embed([...distinctTexts,...descriptions]):qwenEmbed([...distinctTexts,...descriptions],onProgress));
  if(!Array.isArray(embedded)||embedded.length!==distinctTexts.length+descriptions.length)throw new Error('Embedding 응답의 데이터 수가 일치하지 않습니다.');
  const vectors=embedded.map(normalize),textVectors=new Map(distinctTexts.map((text,index)=>[text,vectors[index]]));
  const topicVectors=vectors.slice(distinctTexts.length),matches=new Map();
  for(let index=0;index<unique.length;index++) {
    const record=unique[index],vector=textVectors.get(texts[index]),lower=texts[index].toLowerCase();
    const candidates=demoTopics.map((topic,topicIndex)=>{
      const similarity=cosine(vector,topicVectors[topicIndex]);
      const lexical=topic.keywords.some(keyword=>keywordMatch(lower,keyword));
      // Explicit mentions anchor a topic. The semantic component is always computed by Qwen.
      // Pure semantic matches use an intentionally conservative, uncalibrated threshold.
      const strength=lexical?0.72+0.28*Math.max(0,similarity):Math.max(0,(similarity-0.32)/0.68);
      return {topic,similarity,lexical,strength};
    }).filter(candidate=>(candidate.lexical&&candidate.similarity>=0.10)||candidate.similarity>=0.57)
      .sort((a,b)=>b.strength-a.strength).slice(0,3);
    for(const match of candidates) {
      const list=matches.get(match.topic.id)||[];
      list.push({record,strength:match.strength,lexical:match.lexical});matches.set(match.topic.id,list);
    }
  }
  emit(onProgress,'merge','다른 서비스의 관심사를 합치고 있어요',88);
  const interests=[...matches].map(([id,items])=>{
    const topic=demoTopics.find(topic=>topic.id===id);
    const ranked=items.sort((a,b)=>b.strength-a.strength);
    const strongest=ranked.slice(0,5),average=strongest.reduce((sum,item)=>sum+item.strength,0)/strongest.length;
    const sourceCount=new Set(items.map(item=>item.record.source)).size;
    const score=Math.min(99,Math.round(45+42*average+Math.min(8,3*Math.log2(items.length))+3*(sourceCount-1)));
    return {id,label:topic.label,category:topic.category,score,evidence:ranked.slice(0,12).map(item=>item.record),matchType:'Semantic'};
  }).filter(interest=>interest.score>=50).sort((a,b)=>b.score-a.score||b.evidence.length-a.evidence.length||a.label.localeCompare(b.label)).slice(0,15);
  emit(onProgress,'complete',interests.length?'나의 관심사 분석이 완료되었어요':'등록한 데이터에서 충분한 관심사 근거를 찾지 못했어요',100);
  return interests;
}

function combinations(count,size,callback) {
  const current=[];
  function visit(start) {
    if(current.length===size){callback(current.slice());return;}
    for(let index=start;index<=count-(size-current.length);index++){current.push(index);visit(index+1);current.pop();}
  }
  visit(0);
}

export function scoreCandidateGroups(profiles,capacity,{onProgress}={}) {
  validateDemoProfiles(profiles,3);
  const sizing=expectedTableSizes(profiles.length,capacity);
  const prepared=profiles.map(prepareDemoProfile),pairs=new Map();
  for(let a=0;a<profiles.length;a++)for(let b=a+1;b<profiles.length;b++) {
    const connected=commonFromPrepared([profiles[a],profiles[b]],[prepared[a],prepared[b]]).some(topic=>topic.score>=40);
    pairs.set(`${a}:${b}`,connected?1:0);
  }
  const candidates=[];
  emit(onProgress,'score','각 그룹의 대화 가능성을 계산하고 있어요',15);
  const sizes=[...new Set([sizing.lower,sizing.upper])];
  for(const size of sizes)combinations(profiles.length,size,indices=>{
    const members=indices.map(index=>profiles[index]);
    const topics=commonFromPrepared(members,indices.map(index=>prepared[index]));
    let connections=0,pairCount=0;
    for(let a=0;a<indices.length;a++)for(let b=a+1;b<indices.length;b++){connections+=pairs.get(`${indices[a]}:${indices[b]}`)||0;pairCount++;}
    const quality=groupQuality(members,topics,100*connections/pairCount);
    candidates.push({members:indices,score:quality.groupUtility});
  });
  return {candidates,sizing};
}

async function solveWithPython(payload,{pythonPath,onProgress}={}) {
  const projectPython=path.resolve(backendDirectory,'../.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const executable=pythonPath||process.env.SAI_PYTHON||(existsSync(projectPython)?projectPython:'python');
  emit(onProgress,'optimize','전체 조합에서 균형 좋은 편성을 찾고 있어요',55);
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,[path.join(backendDirectory,'demo-solver.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let stdout='',stderr='',settled=false;
    const fail=error=>{if(!settled){settled=true;clearTimeout(timer);reject(error);}};
    const timer=setTimeout(()=>{child.kill();fail(new Error('CP-SAT 실행 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'));},55000);
    child.on('error',error=>fail(new Error(`CP-SAT Python 실행 환경을 확인해주세요. SAI_PYTHON 또는 .venv가 필요합니다. (${error.code||error.message})`)));
    child.stdout.on('data',chunk=>{stdout+=chunk; if(stdout.length>2*1024*1024){child.kill();fail(new Error('CP-SAT 응답이 허용 크기를 초과했습니다.'));}});
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.stdin.on('error',error=>fail(new Error(`CP-SAT 입력 전달에 실패했습니다: ${error.message}`)));
    child.on('close',code=>{
      if(settled)return;
      clearTimeout(timer);settled=true;
      if(code!==0){reject(new Error(`CP-SAT 편성에 실패했습니다. ${stderr.trim().slice(-800)||`Python 종료 코드 ${code}`}`));return;}
      try{const result=JSON.parse(stdout);if(result.error)throw new Error(result.error);resolve(result);}catch(error){reject(new Error(`CP-SAT 결과를 읽을 수 없습니다: ${error.message}`));}
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function optimizeGroups(profiles,tableSize,{onProgress,pythonPath,timeLimitSeconds=8}={}) {
  const started=Date.now();
  emit(onProgress,'compare','공통 관심사를 비교하고 있어요',5);
  const {candidates,sizing}=scoreCandidateGroups(profiles,tableSize,{onProgress});
  const timeLimit=Math.max(0.1,Math.min(12,Number(timeLimitSeconds)||8));
  const result=await solveWithPython({participants:profiles.length,tables:sizing.tables,candidates,topK:3,timeLimitSeconds:timeLimit},{pythonPath,onProgress});
  if(!Array.isArray(result.plans)||!result.plans.length)throw new Error(`제한 시간 안에 유효한 편성을 찾지 못했습니다. (${result.status||'UNKNOWN'})`);
  const signatures=new Set();
  const plans=result.plans.map((plan,planIndex)=>{
    const chosen=plan.candidateIndices.map(index=>candidates[index]);
    const assignments=chosen.flatMap(candidate=>candidate?.members||[]);
    if(chosen.some(candidate=>!candidate)||assignments.length!==profiles.length||new Set(assignments).size!==profiles.length||assignments.some(index=>index<0||index>=profiles.length))throw new Error('CP-SAT 편성의 참가자 배정 검증에 실패했습니다.');
    const signature=chosen.map(candidate=>candidate.members.join(',')).sort().join('|');
    if(signatures.has(signature))throw new Error('CP-SAT이 중복 편성안을 반환했습니다.');
    signatures.add(signature);
    const groups=chosen.sort((a,b)=>a.members[0]-b.members[0]).map((candidate,groupIndex)=>{
      const members=candidate.members.map(index=>profiles[index]),interests=commonInterests(members),quality=groupQuality(members,interests);
      return {id:`plan-${planIndex+1}-table-${groupIndex+1}`,memberIds:members.map(member=>member.id),score:quality.groupUtility,interests:interests.slice(0,3),quality};
    });
    const scores=groups.map(group=>group.score),average=scores.reduce((a,b)=>a+b,0)/scores.length;
    return {id:`plan-${planIndex+1}`,label:['전체 대화 가능성 우선','그룹 간 균형 우선','다양한 사람과의 연결 우선'][planIndex],score:Math.round(average),minGroupScore:Math.min(...scores),balance:Math.round(100-(Math.max(...scores)-Math.min(...scores))),groups};
  });
  const solver={engine:'OR-Tools CP-SAT',status:result.status,optimal:result.status==='OPTIMAL',timeLimitSeconds:timeLimit,candidateCount:candidates.length,elapsedMs:Date.now()-started,plansFound:plans.length,candidateEnumeration:'exhaustive',runs:result.runs,...(result.terminationStatus?{terminationStatus:result.terminationStatus}:{})};
  const notes=[];
  if(plans.length<3)notes.push(result.terminationStatus==='INFEASIBLE'?`조건을 만족하는 서로 다른 편성안은 ${plans.length}개입니다.`:`제한 시간 안에 서로 다른 편성안을 ${plans.length}개 찾았습니다.`);
  if(!solver.optimal)notes.push('시간 제한 안에서 찾은 실행 가능한 편성입니다. 최적성은 증명되지 않았습니다.');
  if(sizing.lower!==sizing.upper)notes.push(`남는 인원이 생기지 않도록 ${sizing.lower}~${sizing.upper}명으로 테이블을 구성했습니다.`);
  if(notes.length)solver.note=notes.join(' ');
  emit(onProgress,'complete','추천 편성안이 준비되었어요',100);
  return {plans,solver};
}
