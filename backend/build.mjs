import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
const result=spawnSync(process.execPath,['node_modules/expo/bin/cli','export','--platform','web','--output-dir','dist/client'],{stdio:'inherit',env:{...process.env,...(process.env.VERCEL==='1'?{EXPO_PUBLIC_LOCAL_DEMO:'0'}:{}),CI:'1',EXPO_NO_TELEMETRY:'1'}});if(result.status!==0)process.exit(result.status||1);
if(process.env.VERCEL!=='1'){
 await fs.mkdir('dist/server',{recursive:true});await build({entryPoints:['backend/worker.mjs'],external:['node:crypto'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022'});
}
await fs.mkdir('dist/client/embedding',{recursive:true});
await build({entryPoints:['browser/embedding-worker.mjs'],outfile:'dist/client/embedding/worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',external:['/embedding/transformers.min.js']});
await build({entryPoints:['browser/taste-worker.mjs'],outfile:'dist/client/embedding/taste-worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',external:['/embedding/transformers.min.js']});
await fs.copyFile('node_modules/@huggingface/transformers/dist/transformers.min.js','dist/client/embedding/transformers.min.js');
for(const ext of ['mjs','wasm'])await fs.copyFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.'+ext,'dist/client/embedding/ort-wasm-simd-threaded.'+ext);
if(process.env.VERCEL!=='1'){
 await fs.mkdir('dist/.openai',{recursive:true});await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
 await fs.writeFile('dist/server/wrangler.json',JSON.stringify({name:'sai',main:'index.js',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],assets:{directory:'../client',binding:'ASSETS',not_found_handling:'single-page-application'},d1_databases:[{binding:'DB',database_name:'sai-db',database_id:'00000000-0000-4000-8000-000000000000'}]},null,2));
}
