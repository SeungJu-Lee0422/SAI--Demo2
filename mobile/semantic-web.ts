import type {Profile,Match} from '../shared/matching';
// One worker per analysis: leaving the operation cannot retain private vectors.
export function browserSemantic(people:Profile[],onProgress:(message:string)=>void,signal?:AbortSignal):Promise<Match[]>{
 return new Promise((resolve,reject)=>{
  if(typeof Worker==='undefined'){reject(new Error('이 브라우저는 의미 비교를 지원하지 않아요. 기본 공통점은 볼 수 있어요.'));return;}
  const worker=new Worker('/embedding/worker.js',{type:'module'});
  const requestId=Date.now().toString();
  const timeout=setTimeout(()=>finish(new Error('AI 모델 준비 시간이 초과됐어요. 네트워크 상태를 확인하고 다시 시도해주세요.')),900000);
  const abort=()=>finish(new Error('참여자나 공유 항목이 변경되어 비교를 중단했어요. 다시 분석해주세요.'));
  function finish(error?:Error,matches?:Match[]){clearTimeout(timeout);signal?.removeEventListener('abort',abort);worker.terminate();if(error)reject(error);else resolve(matches||[]);}
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  worker.onerror=()=>finish(new Error('의미 비교를 실행하지 못했어요. 기본 공통점은 계속 사용할 수 있어요.'));
  worker.onmessage=event=>{const p=event.data;if(p.requestId!==requestId)return;if(p.status==='progress')onProgress(p.message);else if(p.status==='complete')finish(undefined,p.matches);else if(p.status==='error')finish(new Error(p.message));};
  worker.postMessage({requestId,people:people.map(p=>({id:p.id,interests:p.interests.filter(t=>t.shared)}))});
 });
}
