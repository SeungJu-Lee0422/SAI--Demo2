import {demoProfiles} from './demo-fixtures.mjs';

export const isDemoProfile = profile => profile.owner === `demo:${profile.id}`;
export const isDemoRoom = room => room.id === `demo-room-${room.owner}`;

export async function ensureDefaultDemoData(db, profile) {
 const roomId = `demo-room-${profile.id}`;
 // Keep the room as the initialization marker even after leaving it or removing friends.
 if (await db.prepare('SELECT id FROM rooms WHERE id=?').bind(roomId).first()) return;
 const created = new Date().toISOString();
 const examples = demoProfiles();
 const statements = examples.map(example => {
  const interests = example.interests.map(interest => ({
   id: interest.id, label: interest.label, category: interest.category, score: interest.score,
   shared: true, preference: 'like',
   source: {kind: 'demo', label: interest.evidence[0].title, detail: interest.evidence[0].text},
  }));
  return db.prepare('INSERT OR IGNORE INTO profiles (id,owner,name,bio,interests,color,created) VALUES (?,?,?,?,?,?,?)')
   .bind(example.id, `demo:${example.id}`, example.name, '기존 24명 데모 참가자 · 예시 관심사 데이터', JSON.stringify(interests), example.color, created);
 });
 statements.push(...examples.map(example => db.prepare("INSERT OR IGNORE INTO friendships (sender,recipient,status) SELECT ?,?,'accepted' WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE id=?)")
  .bind(profile.id, example.id, roomId)));
 statements.push(db.prepare('INSERT OR IGNORE INTO rooms (id,owner,name,created) VALUES (?,?,?,?)')
  .bind(roomId, profile.id, '24명 데모 모임', created));
 statements.push(...[profile, ...examples].map(person => db.prepare('INSERT OR IGNORE INTO members (room,profile) VALUES (?,?)').bind(roomId, person.id)));
 await db.batch(statements);
}
