const MODEL='onnx-community/Qwen3-Embedding-0.6B-ONNX';
const MAX_MODEL_BYTES=640*1024*1024;
let ready;

// Transformers.js asks its cache for a Response when loading an ONNX buffer in
// Node. Return the owned buffer directly: Response(buffer) would copy 614MB.
class ModelResponse extends Response{
 constructor(bytes,headers){super(null,{headers});this.bytes=bytes;}
 async arrayBuffer(){return this.bytes.buffer;}
}

export function createModelMemoryCache(){
 const entries=new Map();
 return {
  async match(key){const entry=entries.get(key);return entry?new ModelResponse(entry.bytes,entry.headers):undefined;},
  async put(key,response,progress){
   const advertised=Number(response.headers.get('content-length'));
   if(!Number.isSafeInteger(advertised)||advertised<=0||advertised>MAX_MODEL_BYTES)throw new Error('Qwen model download size is unavailable or exceeds the limit.');
   const bytes=new Uint8Array(advertised),reader=response.body?.getReader();
   if(!reader)throw new Error('Qwen model download has no body.');
   let loaded=0;
   try{
    while(true){
     const {value,done}=await reader.read();if(done)break;
     if(loaded+value.byteLength>advertised)throw new Error('Qwen model download exceeds its declared size.');
     bytes.set(value,loaded);loaded+=value.byteLength;
     progress?.({loaded,total:advertised,progress:100*loaded/advertised});
    }
    if(loaded!==advertised)throw new Error('Qwen model download is incomplete.');
    entries.set(key,{bytes,headers:response.headers});
   }catch(error){await reader.cancel().catch(()=>{});throw error;}
   finally{reader.releaseLock();}
  },
  clear(){entries.clear();},
 };
}

export function configureQwenRuntime(env,vercel=process.env.VERCEL==='1'){
 if(!vercel){env.cacheDir='.data/models';return {dtype:'q8'};}
 const memory=createModelMemoryCache();
 env.allowLocalModels=false;env.allowRemoteModels=true;
 env.useFSCache=false;env.useBrowserCache=false;env.useCustomCache=true;env.customCache=memory;
 // Avoid native weight prepacking and graph copies during initialization so
 // the q8 embedding model fits the existing Hobby function's 2GB memory.
 return {dtype:'q8',device:'cpu',session_options:{
  intraOpNumThreads:1,interOpNumThreads:1,
  enableCpuMemArena:false,enableMemPattern:false,graphOptimizationLevel:'disabled',
  extra:{session:{disable_prepacking:'1'}},
 }};
}

export function getQwenExtractor(){
 ready??=(async()=>{
  const {pipeline,env}=await import('@huggingface/transformers');
  const options=configureQwenRuntime(env);
  try{return await pipeline('feature-extraction',MODEL,options);}
  finally{if(process.env.VERCEL==='1')env.customCache?.clear();}
 })().catch(error=>{ready=undefined;throw error;});
 return ready;
}
