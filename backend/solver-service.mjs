import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {optimizeGroups} from './group-optimizer.mjs';

const token=process.env.GROUP_SOLVER_TOKEN;
if(!token||token.length<32)throw new Error('GROUP_SOLVER_TOKEN에 32자 이상의 비밀값을 설정해주세요.');
const port=Number(process.env.GROUP_SOLVER_PORT||8790),host=process.env.GROUP_SOLVER_HOST||'127.0.0.1';
const server=createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 const given=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from(`Bearer ${token}`);
 if(req.method!=='POST'||req.url!=='/solve'){res.writeHead(404);res.end(JSON.stringify({error:'not found'}));return;}
 if(given.length!==expected.length||!timingSafeEqual(given,expected)){res.writeHead(401);res.end(JSON.stringify({error:'unauthorized'}));return;}
 try{
  let body='';for await(const chunk of req){body+=chunk;if(body.length>1024*1024){res.writeHead(413);res.end(JSON.stringify({error:'request too large'}));return;}}
  const {people,matches,size}=JSON.parse(body);
  if(!Array.isArray(people)||people.length<3||people.length>30||people.some(p=>!p||typeof p.id!=='string'||!Array.isArray(p.interests)||p.interests.length>100)||!Array.isArray(matches)||matches.length>600)throw new Error('편성 입력 범위를 확인해주세요.');
  res.end(JSON.stringify({plans:await optimizeGroups(people,matches,size)}));
 }catch(error){res.writeHead(400);res.end(JSON.stringify({error:error.message||'편성 계산 실패'}));}
});
server.listen(port,host,()=>console.log(`SAI CP-SAT service http://${host}:${port}/solve`));
