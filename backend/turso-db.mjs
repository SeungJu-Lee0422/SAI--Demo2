// Turso/libSQL HTTP v2 protocol: https://docs.turso.tech/sdk/http/reference
const DEFAULT_TIMEOUT_MS=5000;

export class TursoDatabaseError extends Error{
 constructor(message='원격 저장소 요청에 실패했습니다.',cause){super(message,{cause});this.name='TursoDatabaseError';}
}

function endpoint(value){
 if(typeof value!=='string'||!value.trim())throw new TursoDatabaseError('TURSO_DATABASE_URL이 설정되지 않았습니다.');
 let url;
 try{url=new URL(value.trim().replace(/^libsql:/i,'https:'));}catch{throw new TursoDatabaseError('TURSO_DATABASE_URL 형식이 올바르지 않습니다.');}
 const local=url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='[::1]';
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))throw new TursoDatabaseError('TURSO_DATABASE_URL은 HTTPS 주소여야 합니다.');
 if(!url.pathname.replace(/\/$/,'').endsWith('/v2/pipeline'))url.pathname=url.pathname.replace(/\/$/,'')+'/v2/pipeline';
 url.search='';url.hash='';return url;
}

function encodeValue(value){
 if(value===null)return{type:'null'};
 if(typeof value==='string')return{type:'text',value};
 if(typeof value==='boolean')return{type:'integer',value:value?'1':'0'};
 if(typeof value==='bigint')return{type:'integer',value:String(value)};
 if(typeof value==='number'){
  if(!Number.isFinite(value))throw new TypeError('SQL 인자는 유한한 숫자여야 합니다.');
  return Number.isInteger(value)?{type:'integer',value:String(value)}:{type:'float',value};
 }
 if(value instanceof Uint8Array)return{type:'blob',base64:Buffer.from(value).toString('base64')};
 throw new TypeError('지원하지 않는 SQL 인자 형식입니다.');
}

function decodeValue(value){
 if(!value||value.type==='null')return null;
 if(value.type==='integer'){
  const parsed=Number(value.value);
  return Number.isSafeInteger(parsed)?parsed:value.value;
 }
 if(value.type==='float')return Number(value.value);
 if(value.type==='blob')return Uint8Array.from(Buffer.from(value.base64||'', 'base64'));
 return value.value;
}

function executeRequest(statement,wantRows){return{type:'execute',stmt:{sql:statement.sql,args:statement.args.map(encodeValue),named_args:[],want_rows:wantRows}};}
function assertResultCount(response,expected){if(response.results.length!==expected)throw new TursoDatabaseError('원격 저장소 응답 수가 요청과 일치하지 않습니다.');}
function closeResult(result){if(result?.type!=='ok'||result.response?.type!=='close')throw new TursoDatabaseError('원격 저장소 연결을 닫지 못했습니다.');}

function executeResult(result){
 if(result?.type!=='ok'||result.response?.type!=='execute')throw new TursoDatabaseError('원격 저장소에서 SQL을 실행하지 못했습니다.');
 const value=result.response.result||{},names=(value.cols||[]).map(column=>column.name),rows=(value.rows||[]).map(row=>Object.fromEntries(names.map((name,index)=>[name,decodeValue(row[index])]))),changes=Number(value.affected_row_count||0),rawLastRowId=value.last_insert_rowid,lastRowId=rawLastRowId==null?undefined:(typeof rawLastRowId==='object'?decodeValue(rawLastRowId):(Number.isSafeInteger(Number(rawLastRowId))?Number(rawLastRowId):String(rawLastRowId)));
 return{rows,changes,lastRowId,meta:{changes,last_row_id:lastRowId}};
}

function statement(sql,args=[]){
 return{sql,args,bind(...values){return statement(sql,values);}};
}

export function createTursoDB({url,authToken,fetchImpl=fetch,timeoutMs=DEFAULT_TIMEOUT_MS}={}){
 const initialEndpoint=endpoint(url);
 if(typeof authToken!=='string'||!authToken.trim())throw new TursoDatabaseError('TURSO_AUTH_TOKEN이 설정되지 않았습니다.');
 const headers={Authorization:`Bearer ${authToken.trim()}`,'Content-Type':'application/json'};

 async function pipeline(requests,{baton,baseUrl,timeout=timeoutMs}={}){
  const target=baseUrl?endpoint(baseUrl):initialEndpoint,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await fetchImpl(target,{method:'POST',headers,body:JSON.stringify({requests,...(baton?{baton}:{})}),signal:controller.signal,redirect:'error'});
   if(!response.ok)throw new TursoDatabaseError(`원격 저장소가 HTTP ${response.status}로 응답했습니다.`);
   const data=await response.json();
   if(!data||!Array.isArray(data.results))throw new TursoDatabaseError('원격 저장소 응답 형식이 올바르지 않습니다.');
   return data;
  }catch(error){
   if(error instanceof TursoDatabaseError)throw error;
   throw new TursoDatabaseError(error?.name==='AbortError'?'원격 저장소 요청 시간이 초과되었습니다.':'원격 저장소에 연결하지 못했습니다.',error);
  }finally{clearTimeout(timer);}
 }

 async function query(item,wantRows){const response=await pipeline([executeRequest(statement('PRAGMA foreign_keys=ON'),false),executeRequest(item,wantRows),{type:'close'}]);assertResultCount(response,3);executeResult(response.results[0]);const result=executeResult(response.results[1]);closeResult(response.results[2]);return result;}
 function prepared(item){return{bind(...values){return prepared(statement(item.sql,values));},async first(){return(await query(item,true)).rows[0]||null;},async all(){return{results:(await query(item,true)).rows};},async run(){const result=await query(item,false);return{changes:result.changes,lastRowId:result.lastRowId,meta:result.meta};},_statement:item};}

 return{
  prepare(sql){if(typeof sql!=='string'||!sql.trim())throw new TypeError('SQL 문자열이 필요합니다.');return prepared(statement(sql));},
 async batch(preparedStatements){
   if(!Array.isArray(preparedStatements)||preparedStatements.some(item=>!item?._statement))throw new TypeError('batch에는 prepare().bind() 결과만 전달할 수 있습니다.');
   const deadline=Date.now()+timeoutMs,remaining=()=>Math.max(1,deadline-Date.now());
   const started=await pipeline([executeRequest(statement('PRAGMA foreign_keys=ON'),false),executeRequest(statement('BEGIN IMMEDIATE'),false)],{timeout:remaining()}),baton=started.baton,baseUrl=started.base_url;
   assertResultCount(started,2);executeResult(started.results[0]);executeResult(started.results[1]);
   if(!baton)throw new TursoDatabaseError('원격 저장소 트랜잭션을 시작하지 못했습니다.');
   let currentBaton=baton,currentBaseUrl=baseUrl;
   try{
    const response=await pipeline(preparedStatements.map(item=>executeRequest(item._statement,false)),{baton:currentBaton,baseUrl:currentBaseUrl,timeout:remaining()});
    currentBaton=response.baton||currentBaton;currentBaseUrl=response.base_url||currentBaseUrl;
    assertResultCount(response,preparedStatements.length);
    const values=response.results.map(executeResult);
    const committed=await pipeline([executeRequest(statement('COMMIT'),false),{type:'close'}],{baton:currentBaton,baseUrl:currentBaseUrl,timeout:remaining()});
    assertResultCount(committed,2);executeResult(committed.results[0]);closeResult(committed.results[1]);
    return values.map(result=>({changes:result.changes,lastRowId:result.lastRowId,meta:result.meta}));
   }catch(error){
    try{await pipeline([executeRequest(statement('ROLLBACK'),false),{type:'close'}],{baton:currentBaton,baseUrl:currentBaseUrl,timeout:remaining()});}catch{}
    throw error;
   }
  }
 };
}

export function createTursoDBFromEnv(env=process.env,options={}){
 return createTursoDB({url:env.TURSO_DATABASE_URL,authToken:env.TURSO_AUTH_TOKEN,...options});
}
