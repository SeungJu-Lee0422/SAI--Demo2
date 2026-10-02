import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';

const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const token='solver-service-test-token-at-least-32-characters';
const child=spawn(process.execPath,['backend/solver-service.mjs'],{env:{...process.env,GROUP_SOLVER_HOST:'127.0.0.1',GROUP_SOLVER_PORT:String(port),GROUP_SOLVER_TOKEN:token},stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
try{
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(`solver startup timeout: ${stderr}`)),10000);
  const failed=code=>{clearTimeout(timer);reject(new Error(`solver exited ${code}: ${stderr}`));};
  child.once('exit',failed);child.once('error',failed);
  child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes('SAI CP-SAT service')){clearTimeout(timer);child.off('exit',failed);child.off('error',failed);resolve();}});
 });
 const post=(path,body,auth=token)=>fetch(`http://127.0.0.1:${port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},body});
 assert.equal((await post('/solve','{}','wrong-token')).status,401);
 assert.equal((await post('/solve','{')).status,400);
 assert.equal((await post('/solve',JSON.stringify({people:[],matches:[],size:4}))).status,400);
 const oversized=await post('/solve',JSON.stringify({padding:'x'.repeat(1024*1024)}));
 assert.equal(oversized.status,413);assert.equal(oversized.headers.get('cache-control'),'no-store');
 assert.equal((await post('/unknown','{}')).status,404);
 assert.equal((await post('/bridge-validate','{}')).status,404,'Qwen validation belongs to the native Vercel endpoint, not the CP-SAT service');
 assert.equal((await fetch(`http://127.0.0.1:${port}/solve`)).status,404);
 console.log('PASS standalone CP-SAT service authentication, malformed/bounded input, and route boundaries');
}finally{
 if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
}
