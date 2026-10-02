import {Platform} from 'react-native';
import {personalItems,type PersonalTopic} from '../shared/interest-profile';
import type {Profile} from '../shared/matching';

export function analyzePersonalInterests(person:Profile,onProgress:(message:string)=>void,signal?:AbortSignal):Promise<PersonalTopic[]>{
 return new Promise((resolve,reject)=>{
  if(Platform.OS!=='web'||typeof Worker==='undefined'){reject(new Error('개인 AI 관심사 분석은 웹 브라우저에서 실행해주세요.'));return;}
  if(!personalItems(person).length){reject(new Error('먼저 외부 데이터를 가져오거나 관심사를 등록해주세요.'));return;}
  const worker=new Worker('/embedding/worker.js',{type:'module'}),requestId=crypto.randomUUID();
  let settled=false;
  const timeout=setTimeout(()=>finish(new Error('분석 시간이 초과됐어요. 연결 상태를 확인해주세요.')),900000);
  function finish(error?:Error,topics?:PersonalTopic[]){
   if(settled)return;settled=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);worker.terminate();
   if(error)reject(error);else resolve(topics||[]);
  }
  const abort=()=>finish(new Error('관심사 분석을 중단했어요.'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  worker.onerror=()=>finish(new Error('AI 분석을 실행하지 못했어요. 메모리와 네트워크 상태를 확인해주세요.'));
  worker.onmessage=event=>{const p=event.data;if(p.requestId!==requestId)return;if(p.status==='progress')onProgress(p.message);else if(p.status==='complete')finish(undefined,p.topics);else if(p.status==='error')finish(new Error(p.message));};
  worker.postMessage({requestId,operation:'personal',person:{...person,interests:personalItems(person)}});
 });
}
