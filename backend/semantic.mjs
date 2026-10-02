import {embeddingTexts,rankSemantic} from '../shared/semantic-ranking.ts';
import {bridgeTexts,validateBridgeTopics as validateBridgeVectors} from '../shared/conversation-topics.ts';
let ready;const cache=new Map();
export async function semanticPairs(people){
 const {pipeline,env}=await import('@huggingface/transformers');env.cacheDir='.data/models';
 ready??=pipeline('feature-extraction','onnx-community/Qwen3-Embedding-0.6B-ONNX',{dtype:'q8'});const extractor=await ready;
 const texts=embeddingTexts(people);if(!texts.length)return [];const missing=[...new Set(texts.filter(t=>!cache.has(t)))];
 for(const text of missing){const output=await extractor([text],{pooling:'last_token',normalize:true,truncation:true,max_length:128});cache.set(text,output.tolist()[0]);}
 const matches=rankSemantic(people,texts.map(t=>cache.get(t)));cache.clear();return matches;
}

export async function validateBridgeTopics(people,candidates,direct=[],signal){
 const texts=bridgeTexts(people,candidates);if(!texts.length)return [];
 if(texts.length>183)throw new Error('연결 주제는 최대 30명의 대표 관심사로 검증할 수 있어요.');
 const deadline=AbortSignal.timeout(30000),activeSignal=signal?AbortSignal.any([signal,deadline]):deadline;
 const awaitActive=promise=>new Promise((resolve,reject)=>{
  const abort=()=>{activeSignal.removeEventListener('abort',abort);reject(activeSignal.reason);};
  if(activeSignal.aborted){promise.catch(()=>{});abort();return;}
  activeSignal.addEventListener('abort',abort,{once:true});
  promise.then(value=>{activeSignal.removeEventListener('abort',abort);resolve(value);},error=>{activeSignal.removeEventListener('abort',abort);reject(error);});
 });
 activeSignal.throwIfAborted();
 const {pipeline,env}=await import('@huggingface/transformers');
 if(process.env.VERCEL==='1')throw new Error('Vercel에서는 원격 Qwen3 검증 서버를 연결해주세요.');
 env.cacheDir='.data/models';
 ready??=pipeline('feature-extraction','onnx-community/Qwen3-Embedding-0.6B-ONNX',{dtype:'q8'});
 let extractor;try{extractor=await awaitActive(ready);}catch(error){if(!activeSignal.aborted)ready=null;throw error;}
 const vectorsByText=new Map();
 for(const text of new Set(texts)){
  activeSignal.throwIfAborted();
  const output=await awaitActive(extractor([text],{pooling:'last_token',normalize:true,truncation:true,max_length:128}));
  vectorsByText.set(text,output.tolist()[0]);
 }
 activeSignal.throwIfAborted();
 return validateBridgeVectors(people,candidates,texts.map(text=>vectorsByText.get(text)),direct);
}
