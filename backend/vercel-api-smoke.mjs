import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {once} from 'node:events';
import {api} from './api.mjs';
import {createTursoDB,TursoDatabaseError} from './turso-db.mjs';
import {migrateTurso} from './migrate-turso.mjs';

const sqlite=new DatabaseSync(':memory:');

const encode=value=>value===null?{type:'null'}:typeof value==='number'?(Number.isInteger(value)?{type:'integer',value:String(value)}:{type:'float',value}):value instanceof Uint8Array?{type:'blob',base64:Buffer.from(value).toString('base64')}:{type:'text',value:String(value)};
const decode=value=>value.type==='null'?null:value.type==='integer'?Number(value.value):value.type==='float'?value.value:value.type==='blob'?Buffer.from(value.base64,'base64'):value.value;
const connections=new Map();let batonSequence=0,origin='';
const server=createServer(async(request,response)=>{
 let raw='';for await(const chunk of request)raw+=chunk;
 const body=JSON.parse(raw),baton=body.baton||`test-${++batonSequence}`;let inTransaction=connections.has(baton);
 const results=[];
 for(const operation of body.requests){
  if(operation.type==='close'){if(inTransaction){sqlite.exec('ROLLBACK');connections.delete(baton);inTransaction=false;}results.push({type:'ok',response:{type:'close'}});continue;}
  const sql=operation.stmt.sql,args=(operation.stmt.args||[]).map(decode);
  try{
   if(/^BEGIN\b/i.test(sql)){sqlite.exec('BEGIN IMMEDIATE');connections.set(baton,true);inTransaction=true;results.push(ok([],[],0));continue;}
   if(/^COMMIT\b/i.test(sql)){sqlite.exec('COMMIT');connections.delete(baton);inTransaction=false;results.push(ok([],[],0));continue;}
   if(/^ROLLBACK\b/i.test(sql)){sqlite.exec('ROLLBACK');connections.delete(baton);inTransaction=false;results.push(ok([],[],0));continue;}
   const statement=sqlite.prepare(sql);
   if(operation.stmt.want_rows){const rows=statement.all(...args),cols=rows.length?Object.keys(rows[0]):statement.columns().map(column=>column.name);results.push(ok(cols,rows,0));}
   else{const value=statement.run(...args);if(sql.startsWith('INSERT INTO unique_test')&&args[0]==='omit-result')continue;results.push(ok([],[],Number(value.changes),value.lastInsertRowid));}
  }catch(error){results.push({type:'error',error:{message:error.message}});}
 }
 response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({baton:inTransaction?baton:null,base_url:inTransaction?origin:null,results}));
});
function ok(cols,rows,changes,lastInsertRowid=null){return{type:'ok',response:{type:'execute',result:{cols:cols.map(name=>({name})),rows:rows.map(row=>cols.map(name=>encode(row[name]))),affected_row_count:changes,last_insert_rowid:lastInsertRowid==null?null:encode(lastInsertRowid)}}};}

server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
const DB=createTursoDB({url:origin,authToken:'fake-token'});
const call=async(body,token)=>{const response=await api(new Request(origin+'/api/app',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:typeof body==='string'?body:JSON.stringify(body)}),{DB});return{status:response.status,data:await response.json()};};

try{
 assert.rejects(()=>Promise.resolve().then(()=>createTursoDB({url:origin})),TursoDatabaseError);
 assert.throws(()=>createTursoDB({url:'http://remote.example',authToken:'fake-token'}),TursoDatabaseError);
 let capturedUrl='',capturedRedirect='';const protocolDB=createTursoDB({url:'libsql://database.example',authToken:'fake-token',fetchImpl:async(url,options)=>{capturedUrl=String(url);capturedRedirect=options.redirect;return Response.json({baton:null,base_url:null,results:[ok([],[],0),ok([],[],0),{type:'ok',response:{type:'close'}}]});}});
 await protocolDB.prepare('SELECT 1').all();assert.equal(capturedUrl,'https://database.example/v2/pipeline');assert.equal(capturedRedirect,'error');
 assert.equal(await migrateTurso({db:DB}),9);assert.equal(await migrateTurso({db:DB}),0);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM turso_migrations').first()).count,9);
 await DB.prepare('CREATE TABLE unique_test(value TEXT UNIQUE)').run();
 assert.equal((await call({action:'saveProfile',name:'x'})).status,401);
 const registered=await call({action:'register',username:'remote_user',password:'correct horse battery',confirmPassword:'correct horse battery'});
 assert.equal(registered.status,200);assert.equal(typeof registered.data.token,'string');
 const token=registered.data.token;
 const saved=await call({action:'saveProfile',name:'원격 사용자',bio:'Turso 연결 확인',interests:[{id:'music',label:'재즈',category:'음악',shared:true,preference:'like'}]},token);
 assert.equal(saved.status,200);
 const stateResponse=await api(new Request(origin+'/api/app',{headers:{Authorization:`Bearer ${token}`}}),{DB}),state=await stateResponse.json();
 assert.equal(stateResponse.status,200);assert.equal(state.me.name,'원격 사용자');assert.equal(state.me.interests[0].label,'재즈');
 await assert.rejects(()=>DB.batch([DB.prepare('INSERT INTO unique_test(value) VALUES(?)').bind('same'),DB.prepare('INSERT INTO unique_test(value) VALUES(?)').bind('same'),DB.prepare('INSERT INTO unique_test(value) VALUES(?)').bind('later')]),TursoDatabaseError);
 assert.deepEqual((await DB.prepare('SELECT value FROM unique_test').all()).results,[]);
 await assert.rejects(()=>DB.batch([DB.prepare('INSERT INTO unique_test(value) VALUES(?)').bind('omit-result'),DB.prepare('INSERT INTO unique_test(value) VALUES(?)').bind('after-missing')]),TursoDatabaseError);
 assert.deepEqual((await DB.prepare('SELECT value FROM unique_test').all()).results,[]);
 const malformed=await call('{',token);assert.equal(malformed.status,503);assert.equal(JSON.stringify(malformed.data).includes('fake-token'),false);
 const bound=await DB.prepare('SELECT ? AS text_value, ? AS integer_value, ? AS null_value').bind('bound',42,null).first();
 assert.deepEqual(bound,{text_value:'bound',integer_value:42,null_value:null});
 console.log('Vercel Turso API smoke passed: 9 migrations, rerun ledger, signup, persistence, bindings, rollback, and safe errors.');
}finally{server.close();sqlite.close();}
