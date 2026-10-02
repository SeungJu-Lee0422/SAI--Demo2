import {ensureProfileColumns} from './profile-migration.mjs';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {api} from './api.mjs';
import {semanticPairs} from './semantic.mjs';
import {createDemoStore} from './demo-store.mjs';
import {createDemoApi} from './demo-api.mjs';
const demoApi=createDemoApi(createDemoStore());
fs.mkdirSync('.data',{recursive:true});const sqlite=new DatabaseSync('.data/sai.sqlite');sqlite.exec('PRAGMA foreign_keys=ON');
sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');

function prepare(sql){let args=[];const stmt=sqlite.prepare(sql);return{bind(...v){args=v;return this;},async first(){return stmt.get(...args)||null;},async all(){return{results:stmt.all(...args)};},async run(){return stmt.run(...args);}};}
const DB={prepare,async batch(stmts){sqlite.exec('BEGIN');try{const result=[];for(const s of stmts)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
for(const name of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){if(!sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(name)){if(name.startsWith('0001_'))await ensureProfileColumns(DB);sqlite.exec(fs.readFileSync('drizzle/'+name,'utf8'));sqlite.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name);}}
const server=createServer(async(req,res)=>{try{
const url=new URL(req.url,`http://${req.headers.host}`);if(url.pathname.startsWith('/api/')){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16*1024*1024){res.writeHead(413);res.end('too large');return;}}
const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}: {})});const result=url.pathname.startsWith('/api/demo/')?await demoApi(request):await api(request,{DB,OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_MODEL:process.env.OPENAI_MODEL,OLLAMA_URL:process.env.OLLAMA_URL,OLLAMA_MODEL:process.env.OLLAMA_MODEL,semanticPairs});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;}
const root=path.resolve('dist/client'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}const chosen=fs.existsSync(file)&&fs.statSync(file).isFile()?file:path.join(root,'index.html');if(!fs.existsSync(chosen)){res.writeHead(200,{'Content-Type':'text/plain;charset=utf-8'});res.end('사이 API 준비 완료. 휴대폰에서 Expo 앱을 실행하세요.');return;}
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.json':'application/json'};res.writeHead(200,{'Content-Type':types[path.extname(chosen)]||'application/octet-stream'});fs.createReadStream(chosen).pipe(res);
}catch(e){console.error(e);res.writeHead(500);res.end('서버 오류');}});
server.listen(Number(process.env.PORT||8788),process.env.HOST||'127.0.0.1',()=>console.log(`사이 Demo http://localhost:${process.env.PORT||8788}`));
