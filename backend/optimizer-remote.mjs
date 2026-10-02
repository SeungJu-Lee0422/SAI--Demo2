export function remoteOptimizer(env){
 return async(people,matches,size,signal)=>{
  if(!env.GROUP_SOLVER_URL||!env.GROUP_SOLVER_TOKEN)throw new Error('서버 CP-SAT 연결을 설정해주세요. GROUP_SOLVER_URL과 GROUP_SOLVER_TOKEN이 필요해요.');
  signal?.throwIfAborted();
  const timeout=AbortSignal.timeout(25000),activeSignal=signal?AbortSignal.any([signal,timeout]):timeout;
  let response;
  try{response=await fetch(env.GROUP_SOLVER_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.GROUP_SOLVER_TOKEN}`},body:JSON.stringify({people,matches,size}),signal:activeSignal});}
  catch(error){if(signal?.aborted||error?.name==='AbortError')throw signal?.reason||error;throw new Error('CP-SAT 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');}
  if(!response.ok)throw new Error('CP-SAT 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
  let result;try{result=await response.json();}catch(error){if(signal?.aborted||error?.name==='AbortError')throw signal?.reason||error;throw new Error('편성 결과 형식이 잘못됐어요.');}
  if(!Array.isArray(result?.plans)||!result.plans.length)throw new Error('CP-SAT 서버가 편성안을 반환하지 않았어요.');
  const ids=new Set(people.map(p=>p.id));
  for(const plan of result.plans){
   if(!Array.isArray(plan?.groups)||plan.groups.some(g=>!Array.isArray(g?.ids)||g.ids.some(id=>typeof id!=='string')))throw new Error('편성 결과 형식이 잘못됐어요.');
   const assigned=plan.groups.flatMap(g=>g.ids||[]);
   if(assigned.length!==ids.size||new Set(assigned).size!==ids.size||assigned.some(id=>!ids.has(id))||plan.groups.some(g=>g.ids.length<2||g.ids.length>size))throw new Error('편성 결과에서 참가자가 누락되거나 중복됐어요.');
  }
  return result.plans;
 };
}
