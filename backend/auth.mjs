import {normalizeInstagram,normalizeLinkedIn} from '../shared/matching.ts';
import {scrypt as scryptCallback,randomBytes,timingSafeEqual} from 'node:crypto';
const key=(password,salt)=>new Promise((resolve,reject)=>scryptCallback(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(e,v)=>e?reject(e):resolve(v)));
export async function passwordRecord(password){const salt=randomBytes(16).toString('hex');return `scrypt:32768:8:3:${salt}:${(await key(password,salt)).toString('hex')}`;}
export async function verifyPassword(password,record){const parts=record.split(':');if(parts.length!==6||parts.slice(0,4).join(':')!=='scrypt:32768:8:3')return false;const expected=Buffer.from(parts[5],'hex'),actual=await key(password,parts[4]);return expected.length===actual.length&&timingSafeEqual(expected,actual);}
export function validateCredentials(username,password,confirmation){
 if(typeof username!=='string'||!/^[a-zA-Z0-9_]{3,30}$/.test(username))throw new Error('아이디는 영문·숫자·밑줄로 3~30자 입력해주세요.');
 if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('비밀번호는 12~128자로 입력해주세요.');
 if(confirmation!==undefined&&confirmation!==password)throw new Error('비밀번호 확인이 일치하지 않아요.');
 return username.toLowerCase();
}
export async function digest(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Buffer.from(b).toString('hex');}
export async function issueSession(DB,owner){const token=randomBytes(32).toString('hex');await DB.prepare('INSERT INTO sessions(token_hash,owner,created) VALUES(?,?,?)').bind(await digest(token),owner,new Date().toISOString()).run();return token;}
export async function accountAction(req,DB,b,owner,account){
 const username=typeof b.username==='string'?b.username.toLowerCase():'';
 const ip=req.headers.get('CF-Connecting-IP')||'local';const rateKey=await digest(ip+'|'+username);const now=Date.now();
 const rate=await DB.prepare('SELECT attempts,expires FROM auth_attempts WHERE key=?').bind(rateKey).first();
 if(rate&&rate.expires>now&&rate.attempts>=5)return {error:'시도 횟수가 많아요. 15분 후 다시 시도해주세요.',status:429};
 await DB.prepare('INSERT INTO auth_attempts(key,attempts,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires<? THEN 1 ELSE attempts+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END').bind(rateKey,now+900000,now,now).run();
 try{
  if(b.action==='register'){
   const user=validateCredentials(b.username,b.password,b.confirmPassword);
   if(b.confirmPassword===undefined)return {error:'비밀번호 확인을 입력해주세요.',status:400};
   if(account)return {error:'이미 로그인되어 있어요.',status:409};
   if(await DB.prepare('SELECT owner FROM accounts WHERE username=?').bind(user).first())return {error:'이미 사용 중인 아이디예요.',status:409};
   const instagramHandle=normalizeInstagram(String(b.instagramHandle||'')),linkedinHandle=normalizeLinkedIn(String(b.linkedinHandle||''));
   const accountOwner=owner||crypto.randomUUID();const record=await passwordRecord(b.password);
   try{await DB.prepare('INSERT INTO accounts(owner,username,password_hash,created,signup_instagram,signup_linkedin) VALUES(?,?,?,?,?,?)').bind(accountOwner,user,record,new Date().toISOString(),instagramHandle,linkedinHandle).run();}catch{return {error:'이미 사용 중인 아이디예요.',status:409};}
   const legacy=await DB.prepare('SELECT id FROM profiles WHERE owner=?').bind(accountOwner).first();
   if(legacy){await DB.batch([DB.prepare("UPDATE profiles SET instagram_handle=CASE WHEN ?<>'' THEN ? ELSE instagram_handle END,instagram_visible=CASE WHEN ?<>'' THEN 'private' ELSE instagram_visible END,linkedin_handle=CASE WHEN ?<>'' THEN ? ELSE linkedin_handle END,linkedin_visible=CASE WHEN ?<>'' THEN 'private' ELSE linkedin_visible END WHERE owner=?").bind(instagramHandle,instagramHandle,instagramHandle,linkedinHandle,linkedinHandle,linkedinHandle,accountOwner),DB.prepare("UPDATE accounts SET signup_instagram='',signup_linkedin='' WHERE owner=?").bind(accountOwner)]);}
   const token=await issueSession(DB,accountOwner);await DB.prepare('DELETE FROM auth_attempts WHERE key=?').bind(rateKey).run();return {token,account:{username:user,instagramHandle,linkedinHandle}};
  }
  if(typeof b.password!=='string'||b.password.length>128)return {error:'아이디 또는 비밀번호를 확인해주세요.',status:401};
  const found=await DB.prepare('SELECT owner,username,password_hash FROM accounts WHERE username=?').bind(username).first();
  // Run the same expensive operation for unknown usernames to reduce enumeration.
  const valid=await verifyPassword(b.password,found?.password_hash||'scrypt:32768:8:3:00000000000000000000000000000000:'+ '00'.repeat(64));
  if(!found||!valid)return {error:'아이디 또는 비밀번호를 확인해주세요.',status:401};
  const token=await issueSession(DB,found.owner);await DB.prepare('DELETE FROM auth_attempts WHERE key=?').bind(rateKey).run();return {token,account:{username:found.username}};
 }catch(e){return {error:e.message,status:400};}
}
