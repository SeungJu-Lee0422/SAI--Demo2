// Local-only baseline bootstrap. Production adopts the verified pre-existing
// columns through migration 0001; Vercel uses tracked migrations instead.
export async function ensureProfileColumns(DB){
 const columns=async()=>new Set((await DB.prepare('PRAGMA table_info(profiles)').all()).results.map(c=>c.name));
 let existing=await columns();
 for(const [name,defaultValue] of [['instagram_handle',''],['instagram_visible','private']]){
  if(existing.has(name))continue;
  try{await DB.prepare(`ALTER TABLE profiles ADD COLUMN ${name} TEXT NOT NULL DEFAULT '${defaultValue}'`).run();}
  catch(error){existing=await columns();if(!existing.has(name))throw error;}
 }
}
