import {pipeline,env,TextStreamer} from '/embedding/transformers.min.js';
import {extractionPrompt,parseTasteOutput,validateTasteInput} from '../shared/taste-extraction.ts';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.wasmPaths={mjs:new URL('/embedding/ort-wasm-simd-threaded.mjs',self.location.origin).href,wasm:new URL('/embedding/ort-wasm-simd-threaded.wasm',self.location.origin).href};
self.onmessage=async event=>{
 const {requestId,text,preference,operation}=event.data;
 const progress=message=>self.postMessage({requestId,status:'progress',message});
 try{
  if(operation!=='prepare')validateTasteInput(text);
  if(!['like','avoid','explore'].includes(preference))throw new Error('질문을 선택해주세요.');
  progress('AI 모델을 준비하고 있어요. 처음에는 다운로드에 시간이 걸려요.');
  const generator=await pipeline('text-generation','onnx-community/Qwen3-0.6B-ONNX',{device:'wasm',dtype:'q8',progress_callback:p=>{if(p.status==='progress'&&p.file?.endsWith('.onnx'))progress(`AI 모델 다운로드 중 · ${Math.floor(p.progress||0)}%`);}});
  if(operation==='prepare'){await generator.dispose();self.postMessage({requestId,status:'complete',candidates:[]});return;}
  progress('문장에서 취향을 정리하고 있어요…');let chars=0;
  const output=await generator(extractionPrompt(text,preference),{max_new_tokens:256,do_sample:false,tokenizer_encode_kwargs:{enable_thinking:false},streamer:new TextStreamer(generator.tokenizer,{skip_prompt:true,skip_special_tokens:true,callback_function:chunk=>{chars+=chunk.length;if(chars%20<chunk.length)progress('문장에서 취향을 정리하고 있어요…');}})});
  const generated=output[0].generated_text;
  const raw=typeof generated==='string'?generated:generated.at(-1).content;
  const candidates=parseTasteOutput(raw,text,preference);
  await generator.dispose();self.postMessage({requestId,status:'complete',candidates});
 }catch(e){console.warn('AI worker error',e.name,e.message);self.postMessage({requestId,status:'error',message:e.message?.startsWith('정리 결과')||e.message?.startsWith('개인정보')?e.message:'취향 정리를 완료하지 못했어요. PC에서 연결과 메모리 상태를 확인하고 다시 시도해주세요.'});}
};
