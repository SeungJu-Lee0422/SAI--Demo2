import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTursoDBFromEnv} from './turso-db.mjs';
import {ensureProfileColumns} from './profile-migration.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),migrationDir=path.join(root,'drizzle');
// These checked-in migrations contain static SQLite DDL without quoted semicolons.
// Strip line comments first because migration 0001 has prose containing a semicolon.
const splitStatements=sql=>sql.replace(/--[^\r\n]*/g,'').split(';').map(value=>value.trim()).filter(Boolean);

export async function migrateTurso({env=process.env,db=createTursoDBFromEnv(env),directory=migrationDir}={}){
 await db.prepare('CREATE TABLE IF NOT EXISTS turso_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)').run();
 const names=(await fs.readdir(directory)).filter(name=>name.endsWith('.sql')).sort();
 let applied=0;
 for(const name of names){
  if(await db.prepare('SELECT name FROM turso_migrations WHERE name=?').bind(name).first())continue;
  if(name.startsWith('0001_'))await ensureProfileColumns(db);
  const sql=await fs.readFile(path.join(directory,name),'utf8'),statements=splitStatements(sql).map(query=>db.prepare(query));
  await db.batch([...statements,db.prepare('INSERT INTO turso_migrations(name,applied_at) VALUES(?,?)').bind(name,new Date().toISOString())]);
  applied++;
  console.log(`Applied ${name}`);
 }
 return applied;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN){console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.');process.exitCode=1;}
 else await migrateTurso();
}
