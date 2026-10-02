import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
import {demoProfiles} from './demo-fixtures.mjs';

export function createDemoStore(directory='.data'){
 fs.mkdirSync(directory,{recursive:true});
 const db=new DatabaseSync(path.join(directory,'demo.sqlite'));
 db.exec(`CREATE TABLE IF NOT EXISTS demo_sessions (id TEXT PRIMARY KEY, profile TEXT NOT NULL, imports TEXT NOT NULL, groups_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS demo_oauth (session_id TEXT NOT NULL, provider TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(session_id,provider));`);
 const keyPath=path.join(directory,'demo-token.key');
 if(!fs.existsSync(keyPath))fs.writeFileSync(keyPath,randomBytes(32),{mode:0o600});
 const key=fs.readFileSync(keyPath);
 const states=new Map();
 const encrypt=value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64');};
 const decrypt=value=>{const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));};
 function ensureSession(id){if(!id||!/^[a-f0-9]{64}$/.test(id))id=randomBytes(32).toString('hex');if(!db.prepare('SELECT id FROM demo_sessions WHERE id=?').get(id)){const me={id:'local-'+randomUUID(),name:'나',color:'#222222',avatar:'',interests:[],isDemo:false};db.prepare('INSERT INTO demo_sessions VALUES (?,?,?,?)').run(id,JSON.stringify(me),'{}','[]');}return id;}
 function getSession(id){const row=db.prepare('SELECT * FROM demo_sessions WHERE id=?').get(id);if(!row)throw new Error('Demo 세션이 만료되었습니다. 새로고침해주세요.');return{me:JSON.parse(row.profile),imports:JSON.parse(row.imports),groups:JSON.parse(row.groups_json)};}
 function setSession(id,data){db.prepare('UPDATE demo_sessions SET profile=?, imports=?, groups_json=? WHERE id=?').run(JSON.stringify(data.me),JSON.stringify(data.imports),JSON.stringify(data.groups),id);}
 return{ensureSession,getSession,setSession,profiles:demoProfiles,
  getOAuth(id,provider){const row=db.prepare('SELECT payload FROM demo_oauth WHERE session_id=? AND provider=?').get(id,provider);return row?decrypt(row.payload):null;},
  setOAuth(id,provider,data){if(data==null)db.prepare('DELETE FROM demo_oauth WHERE session_id=? AND provider=?').run(id,provider);else db.prepare('INSERT INTO demo_oauth VALUES (?,?,?) ON CONFLICT(session_id,provider) DO UPDATE SET payload=excluded.payload').run(id,provider,encrypt(data));},
  putOAuthState(state,data){const now=Date.now();for(const[k,v]of states)if(now-v.storedAt>600000)states.delete(k);states.set(state,{...data,storedAt:now});},
  takeOAuthState(state){const data=states.get(state);states.delete(state);return data&&Date.now()-data.storedAt<=600000?data:null;},
  close(){db.close();},
 };
}
