import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {prepareOptimization,formatOptimization} from './group-candidates.mjs';
export {buildGroupCandidates} from './group-candidates.mjs';

const solverPath=fileURLToPath(new URL('./group-solver.py',import.meta.url));
const defaultPython=fileURLToPath(new URL(process.platform==='win32'?'../.data/solver-env/Scripts/python.exe':'../.data/solver-env/bin/python',import.meta.url));

function runSolver(input,signal){
 signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const python=process.env.SAI_SOLVER_PYTHON||(existsSync(defaultPython)?defaultPython:'python3');
  const child=spawn(python,[solverPath],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='',settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(result);};
  const timeout=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('CP-SAT 계산 시간이 초과됐어요. 참가자를 줄여 다시 시도해주세요.'));},15000);
  const abort=()=>{child.kill('SIGKILL');finish(signal.reason||new DOMException('cancelled','AbortError'));};
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  child.on('error',()=>finish(new Error('CP-SAT 실행 환경이 없어요. npm run solver:setup을 실행해주세요.')));
  child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>1024*1024){child.kill('SIGKILL');finish(new Error('편성 결과가 너무 커요.'));}});
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  child.on('close',code=>{if(code!==0){finish(new Error(stderr.includes('ortools')?'OR-Tools가 설치되지 않았어요. npm run solver:setup을 실행해주세요.':'CP-SAT 계산을 완료하지 못했어요.'));return;}try{const result=JSON.parse(stdout);if(!Array.isArray(result))throw new Error();finish(undefined,result);}catch{finish(new Error('CP-SAT 결과 형식을 확인해주세요.'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
 });
}

export async function optimizeGroups(people,matches,size,signal){
 const context=prepareOptimization(people,matches,size);
 return formatOptimization(people,matches,context,await runSolver(context.input,signal));
}
