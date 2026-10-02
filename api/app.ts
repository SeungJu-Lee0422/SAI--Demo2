import {api} from '../backend/api.mjs';
import {createTursoDBFromEnv,TursoDatabaseError} from '../backend/turso-db.mjs';
import {optimizeGroups} from '../backend/vercel-optimizer.mjs';

const unavailable=()=>Response.json({error:'저장소 연결 설정이 아직 완료되지 않았어요.'},{status:503,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
const preflight=()=>new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}});

export async function handler(request:Request){
 if(request.method==='OPTIONS')return preflight();
 let DB;
 try{DB=createTursoDBFromEnv(process.env);}catch(error){if(error instanceof TursoDatabaseError){console.error('database configuration unavailable');return unavailable();}throw error;}
 try{return await api(request,{DB,optimizeGroups,OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_MODEL:process.env.OPENAI_MODEL,YOUTUBE_CLIENT_ID:process.env.YOUTUBE_CLIENT_ID,YOUTUBE_CLIENT_SECRET:process.env.YOUTUBE_CLIENT_SECRET,YOUTUBE_REDIRECT_URI:process.env.YOUTUBE_REDIRECT_URI});}
 catch(error){console.error('vercel api failed',error instanceof Error?error.name:'unknown');return Response.json({error:'처리하지 못했어요. 잠시 후 다시 시도해주세요.'},{status:503,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});}
}

export default {fetch:handler};
