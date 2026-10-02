import {prepareOptimization,formatOptimization} from './group-candidates.mjs';

export async function optimizeGroups(people,matches,size,env=process.env,signal){
 const url=env.GROUP_SOLVER_URL;
 if(!url||!env.GROUP_SOLVER_TOKEN||env.GROUP_SOLVER_TOKEN.length<32)throw new Error('CP-SAT 서버 설정이 아직 완료되지 않았어요.');
 signal?.throwIfAborted();
 const context=prepareOptimization(people,matches,size);
 const timeout=AbortSignal.timeout(25000),activeSignal=signal?AbortSignal.any([signal,timeout]):timeout;
 let response;
 try{
  response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.GROUP_SOLVER_TOKEN}`},body:JSON.stringify(context.input),signal:activeSignal,redirect:'error'});
 }catch(error){if(signal?.aborted||error?.name==='AbortError')throw signal?.reason||error;throw new Error('CP-SAT 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');}
 if(!response.ok)throw new Error('CP-SAT 계산을 완료하지 못했어요. 잠시 후 다시 시도해주세요.');
 let result;try{result=await response.json();}catch(error){if(signal?.aborted||error?.name==='AbortError')throw signal?.reason||error;throw new Error('CP-SAT 결과 형식을 확인해주세요.');}
 return formatOptimization(people,matches,context,result);
}
