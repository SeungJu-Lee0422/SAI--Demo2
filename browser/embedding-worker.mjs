import {pipeline,env} from '/embedding/transformers.min.js';
import {embeddingTexts,rankSemantic} from '../shared/semantic-ranking.ts';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.wasmPaths={
 mjs:new URL('/embedding/ort-wasm-simd-threaded.mjs',self.location.origin).href,
 wasm:new URL('/embedding/ort-wasm-simd-threaded.wasm',self.location.origin).href,
};
let extractor;
const cache=new Map();
self.onmessage=async event=>{
 const {requestId,people}=event.data;
 try{
  const texts=embeddingTexts(people);if(!texts.length){self.postMessage({requestId,status:'complete',matches:[]});return;}
  if(texts.length>600)throw new Error('한 번에 최대 600개의 공유 관심사를 비교할 수 있어요.');
  self.postMessage({requestId,status:'progress',message:extractor?'관심사 의미를 비교하고 있어요.':'AI 모델을 준비하고 있어요. 첫 실행은 다운로드에 시간이 걸려요.'});
  extractor??=pipeline('feature-extraction','onnx-community/Qwen3-Embedding-0.6B-ONNX',{dtype:'q8',device:'wasm',progress_callback:p=>{
   if(p.status==='progress'&&p.file?.endsWith('.onnx'))self.postMessage({requestId,status:'progress',message:`AI 모델 다운로드 중 · ${Math.floor(p.progress||0)}%`});
  }});
  let model;try{model=await extractor;}catch(e){extractor=null;throw e;}
  const missing=[...new Set(texts.filter(t=>!cache.has(t)))];
  for(let i=0;i<missing.length;i+=1){const batch=missing.slice(i,i+1);const output=await model(batch,{pooling:'last_token',normalize:true,truncation:true,max_length:128});output.tolist().forEach((v,j)=>cache.set(batch[j],v));self.postMessage({requestId,status:'progress',message:`관심사 비교 중 · ${Math.min(i+1,missing.length)} / ${missing.length}`});}
  const matches=rankSemantic(people,texts.map(t=>cache.get(t)));
  self.postMessage({requestId,status:'complete',matches});
  // Do not retain embeddings for another room or after sharing changes.
  cache.clear();
 }catch(e){cache.clear();self.postMessage({requestId,status:'error',message:'AI 의미 비교를 완료하지 못했어요. 메모리와 네트워크 상태를 확인해주세요. 기본 공통점은 계속 볼 수 있어요.'});}
};
