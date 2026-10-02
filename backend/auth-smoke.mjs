import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {api} from './api.mjs';
const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){if(f.startsWith('0001_'))sql.exec("ALTER TABLE profiles ADD COLUMN instagram_handle TEXT NOT NULL DEFAULT ''; ALTER TABLE profiles ADD COLUMN instagram_visible TEXT NOT NULL DEFAULT 'private';");sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));}
const DB={prepare(query){const stmt=sql.prepare(query);let args=[];return {bind(...values){args=values;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return stmt.run(...args);}};},async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
async function call(body,token=''){const r=await api(new Request('https://test.invalid/api/app',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB});return {status:r.status,data:await r.json()};}
const pass='a-private-password-123';const signup={action:'register',username:'alice',password:pass,confirmPassword:pass};
assert.equal((await call()).data.account,null);
assert.equal((await call({...signup,confirmPassword:'wrong'})).status,400);
const registered=await call(signup);assert.equal(registered.status,200);const token=registered.data.token;
assert.equal((await call()).data.account,null);assert.equal((await call(undefined,token)).data.account.username,'alice');
assert.equal((await call(signup)).status,409);
assert(sql.prepare('SELECT password_hash FROM accounts').get().password_hash.startsWith('scrypt:'));assert(!sql.prepare('SELECT password_hash FROM accounts').get().password_hash.includes(pass));
assert.equal((await call({action:'login',username:'alice',password:'incorrect'})).status,401);
const logged=await call({action:'login',username:'ALICE',password:pass});assert.equal(logged.status,200);assert.notEqual(logged.data.token,token);
await call({action:'saveProfile',name:'Alice',interests:[]},token);
assert.equal((await call(undefined,logged.data.token)).data.me.name,'Alice');
await call({action:'logout'},logged.data.token);assert.equal((await call(undefined,logged.data.token)).data.account,null);
assert.equal((await call({action:'saveProfile',name:'spoof',interests:[]})).status,401);
for(let i=0;i<5;i++)assert.equal((await call({action:'login',username:'nobody',password:pass})).status,401);
assert.equal((await call({action:'login',username:'nobody',password:pass})).status,429);
sql.prepare('UPDATE sessions SET created=? WHERE token_hash IS NOT NULL').run('2000-01-01T00:00:00.000Z');assert.equal((await call(undefined,token)).data.account,null);
console.log('PASS: signup validation, hashed passwords, login, duplicate IDs, session rotation, logout revocation, expiry, write authorization and throttling');
