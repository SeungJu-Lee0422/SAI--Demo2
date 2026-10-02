import {validateTasteInput,type TasteCandidate} from '../shared/taste-extraction';
import type {Preference} from '../shared/matching';
export function browserTaste(text:string,preference:Preference,onProgress:(message:string)=>void,signal?:AbortSignal){return requestTaste('extract',text,preference,onProgress,signal);}
export async function prepareTasteModel(onProgress:(message:string)=>void,signal?:AbortSignal){await requestTaste('prepare','', 'like',onProgress,signal);}
function requestTaste(operation:'prepare'|'extract',text:string,preference:Preference,onProgress:(message:string)=>void,signal?:AbortSignal):Promise<TasteCandidate[]>{
 if(operation==='extract')validateTasteInput(text);
 return new Promise((resolve,reject)=>{
  if(typeof Worker==='undefined'){reject(new Error('이 브라우저는 취향 정리를 지원하지 않아요. 직접 입력은 사용할 수 있어요.'));return;}
  const worker=new Worker('/embedding/taste-worker.js',{type:'module'}),requestId=crypto.randomUUID();let settled=false;
  const timeout=setTimeout(()=>finish(new Error('취향 정리 시간이 초과됐어요. 문장을 짧게 나눠 다시 시도해주세요.')),900000);
  const abort=()=>finish(new Error('취향 정리를 중단했어요.'));
  function finish(error?:Error,candidates?:TasteCandidate[]){if(settled)return;settled=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);worker.terminate();if(error)reject(error);else resolve(candidates||[]);}
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  worker.onerror=()=>finish(new Error('취향 정리를 실행하지 못했어요. 직접 입력은 계속 사용할 수 있어요.'));
  worker.onmessage=event=>{const p=event.data;if(p.requestId!==requestId)return;if(p.status==='progress')onProgress(p.message);else if(p.status==='complete')finish(undefined,p.candidates);else if(p.status==='error')finish(new Error(p.message));};
  worker.postMessage({requestId,operation,text,preference});
 });
}
