import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getIntegrationConfig, startOAuth, finishOAuth, listYoutubePlaylists, importYoutube, importLinkedIn, getConnectionStatus} from './demo-data.mjs';

function memoryStore() {
  const states = new Map(); const tokens = new Map();
  return {states, tokens, getOAuth(session, provider) {return tokens.get(`${session}:${provider}`) || null;}, setOAuth(session, provider, value) {if (value) tokens.set(`${session}:${provider}`, structuredClone(value)); else tokens.delete(`${session}:${provider}`);}, putOAuthState(state, value) {states.set(state, structuredClone(value));}, takeOAuthState(state) {const value = states.get(state); states.delete(state); return value;}};
}
const session = 'session-012345678901234567890';
const otherSession = 'session-987654321098765432109';
const env = {YOUTUBE_CLIENT_ID: 'fixture-youtube-id', YOUTUBE_CLIENT_SECRET: 'fixture-youtube-secret', LINKEDIN_CLIENT_ID: 'fixture-linkedin-id', LINKEDIN_CLIENT_SECRET: 'fixture-linkedin-secret'};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code);

assert.equal(getIntegrationConfig({}).youtube.configured, false);
assert.throws(() => getIntegrationConfig({...env, DEMO_BASE_URL: 'https://untrusted.invalid'}), error => error.code === 'INVALID_BASE_URL');
await rejectsCode(startOAuth('youtube', session, {}, memoryStore()), 'OAUTH_NOT_CONFIGURED');
const store = memoryStore();
const started = await startOAuth('youtube', session, env, store);
const authorization = new URL(started.authorizationUrl); const state = authorization.searchParams.get('state');
assert.equal(authorization.origin, 'https://accounts.google.com');
assert.equal(authorization.searchParams.get('scope'), 'https://www.googleapis.com/auth/youtube.readonly');
assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
assert.equal(authorization.searchParams.get('code_challenge'), createHash('sha256').update(store.states.get(state).verifier).digest('base64url'));
assert(!started.authorizationUrl.includes(env.YOUTUBE_CLIENT_SECRET));

let exchangeCalls = 0;
const exchangeEnv = {...env, DEMO_FETCH: async (url, init) => {
  assert.equal(String(url), 'https://oauth2.googleapis.com/token'); exchangeCalls++;
  assert.equal(init.method, 'POST'); assert.equal(init.body.get('client_secret'), env.YOUTUBE_CLIENT_SECRET);
  assert.equal(init.body.get('redirect_uri'), 'http://localhost:8788/api/demo/oauth/youtube/callback');
  assert.equal(createHash('sha256').update(init.body.get('code_verifier')).digest('base64url'), authorization.searchParams.get('code_challenge'));
  return json({access_token: 'private-fixture-access', refresh_token: 'private-fixture-refresh', token_type: 'Bearer', expires_in: 3600, scope: 'https://www.googleapis.com/auth/youtube.readonly'});
}};
const callback = new URL('http://localhost:8788/api/demo/oauth/youtube/callback'); callback.searchParams.set('state', state); callback.searchParams.set('code', 'fixture-code');
const finished = await finishOAuth('youtube', callback, exchangeEnv, store, session);
assert.equal(finished.sessionId, session); assert.equal(exchangeCalls, 1);
assert(!JSON.stringify(finished).includes('private-fixture-access'));
assert(!JSON.stringify(await getConnectionStatus(session, env, store)).includes('private-fixture'));
await rejectsCode(finishOAuth('youtube', callback, exchangeEnv, store, session), 'INVALID_OAUTH_STATE');
await rejectsCode(importYoutube(otherSession, {}, env, store), 'YOUTUBE_NOT_CONNECTED');

for (const type of ['wrong-session', 'expired', 'wrong-provider', 'cancelled']) {
  const begin = await startOAuth('youtube', session, env, store); const value = new URL(begin.authorizationUrl).searchParams.get('state');
  if (type === 'expired') store.states.get(value).expiresAt = Date.now() - 1;
  if (type === 'wrong-provider') store.states.get(value).provider = 'linkedin';
  const url = new URL(`http://localhost:8788/api/demo/oauth/youtube/callback?state=${value}&code=unused`);
  if (type === 'cancelled') url.searchParams.set('error', 'access_denied');
  await rejectsCode(finishOAuth('youtube', url, exchangeEnv, store, type === 'wrong-session' ? otherSession : session), type === 'cancelled' ? 'OAUTH_CANCELLED' : 'INVALID_OAUTH_STATE');
  assert(!store.states.has(value));
}
assert.equal(exchangeCalls, 1);

const calls = [];
const youtubeEnv = {...env, DEMO_FETCH: async (input, init) => {
  const url = new URL(input); const resource = url.pathname.split('/').pop(); calls.push({resource, page: url.searchParams.get('pageToken'), max: url.searchParams.get('maxResults'), playlist: url.searchParams.get('playlistId')});
  assert.equal(init.headers.Authorization, 'Bearer private-fixture-access'); assert.equal(url.origin, 'https://www.googleapis.com');
  if (resource === 'playlists') return url.searchParams.has('pageToken') ? json({items: [{id: 'p2', snippet: {title: 'Career talks'}, contentDetails: {itemCount: 1}}]}) : json({items: [{id: 'p1', snippet: {title: 'Deep Learning Playlist', description: 'Vision and language models'}, contentDetails: {itemCount: 2}}], nextPageToken: 'playlists-page-2'});
  if (resource === 'playlistItems') {
    if (url.searchParams.get('playlistId') === 'p2') return json({items: [{contentDetails: {videoId: 'v1'}}]});
    return url.searchParams.has('pageToken') ? json({items: [{contentDetails: {videoId: 'v2'}}]}) : json({items: [{contentDetails: {videoId: 'v1'}}], nextPageToken: 'videos-page-2'});
  }
  if (resource === 'videos') return json({items: [{id: 'v1', snippet: {title: 'Transformer architecture', description: 'The actual video description', channelTitle: 'ML Channel', tags: ['NLP', 'AI']}, topicDetails: {topicCategories: ['https://en.wikipedia.org/wiki/Artificial_intelligence']}}, {id: 'v2', snippet: {title: 'Computer vision', description: 'Object detection'}}].filter(video => url.searchParams.get('id').split(',').includes(video.id))});
  if (resource === 'subscriptions') return url.searchParams.has('pageToken') ? json({items: [{id: 's2', snippet: {title: 'Music Channel', description: 'Japanese live music', resourceId: {channelId: 'c2'}}}]}) : json({items: [{id: 's1', snippet: {title: 'AI research', resourceId: {channelId: 'c1'}}}], nextPageToken: 'subscriptions-page-2'});
  throw new Error(`Unexpected resource: ${resource}`);
}};
const listed = await listYoutubePlaylists(session, youtubeEnv, store);
assert.deepEqual(listed.playlists.map(item => item.id), ['p1', 'p2']); assert.equal(listed.truncated, false);
const imported = await importYoutube(session, {includeSubscriptions: true}, youtubeEnv, store);
assert.equal(imported.summary.playlists, 2); assert.equal(imported.summary.videos, 2); assert.equal(imported.summary.subscriptions, 2); assert.equal(imported.summary.playlistItems, 3); assert.equal(imported.summary.truncated, false);
assert(imported.records.find(item => item.id === 'youtube:video:v1').text.includes('Deep Learning Playlist, Career talks'));
assert(imported.records.find(item => item.id === 'youtube:video:v1').text.includes('NLP, AI'));
assert.equal(imported.records.filter(item => item.id === 'youtube:video:v1').length, 1);
assert(calls.some(call => call.resource === 'subscriptions' && call.page === 'subscriptions-page-2'));
const selected = await importYoutube(session, {playlistIds: ['p2']}, youtubeEnv, store);
assert.equal(selected.summary.playlists, 1); assert.equal(selected.summary.videos, 1); assert.equal(selected.summary.subscriptions, 0);
const priorCalls = calls.length;
const subscriptionsOnly = await importYoutube(session, {playlistIds: [], includeSubscriptions: true}, youtubeEnv, store);
assert.equal(subscriptionsOnly.summary.playlists, 0); assert.equal(subscriptionsOnly.summary.videos, 0); assert.equal(subscriptionsOnly.summary.playlistItems, 0); assert.equal(subscriptionsOnly.summary.subscriptions, 2);
assert(subscriptionsOnly.records.every(record => record.kind === 'subscription'));
assert(!calls.slice(priorCalls).some(call => ['playlistItems', 'videos'].includes(call.resource)));
await rejectsCode(importYoutube(session, {playlistIds: ['someone-elses-playlist']}, youtubeEnv, store), 'PLAYLIST_NOT_OWNED');
await rejectsCode(importYoutube(session, {playlistIds: []}, youtubeEnv, store), 'INVALID_PLAYLIST_SELECTION');
const bounded = await importYoutube(session, {includeSubscriptions: true}, {...youtubeEnv, DEMO_MAX_VIDEOS: '1', DEMO_MAX_SUBSCRIPTIONS: '1'}, store);
assert.equal(bounded.summary.videos, 1); assert.equal(bounded.summary.subscriptions, 1); assert.equal(bounded.summary.truncated, true);
assert.equal((await listYoutubePlaylists(session, {...youtubeEnv, DEMO_MAX_PLAYLISTS: 1}, store)).truncated, true);
await rejectsCode(listYoutubePlaylists(session, {...env, DEMO_FETCH: async () => json({error: {errors: [{reason: 'quotaExceeded'}]}}, 403)}, store), 'PROVIDER_QUOTA_EXCEEDED');
await rejectsCode(listYoutubePlaylists(session, {...env, DEMO_FETCH: async () => json({items: [], nextPageToken: 'same'})}, store), 'INVALID_PAGINATION');

const refreshStore = memoryStore(); refreshStore.setOAuth(session, 'youtube', {accessToken: 'expired', refreshToken: 'refresh-credential', expiresAt: 0});
const refreshEnv = {...env, DEMO_FETCH: async (input, init) => {
  if (String(input) === 'https://oauth2.googleapis.com/token') {assert.equal(init.body.get('grant_type'), 'refresh_token'); return json({access_token: 'fresh-access', expires_in: 3600});}
  assert.equal(init.headers.Authorization, 'Bearer fresh-access'); return json({items: []});
}};
await listYoutubePlaylists(session, refreshEnv, refreshStore); assert.equal(refreshStore.getOAuth(session, 'youtube').refreshToken, 'refresh-credential');
refreshStore.getOAuth(session, 'youtube').expiresAt = 0;
await rejectsCode(listYoutubePlaylists(session, {...env, DEMO_FETCH: async () => json({error: 'invalid_grant'}, 400)}, refreshStore), 'OAUTH_RECONNECT_REQUIRED');
assert.equal(refreshStore.getOAuth(session, 'youtube'), null);

const linkedinStore = memoryStore(); const linkedinStart = await startOAuth('linkedin', session, env, linkedinStore); const linkedinAuth = new URL(linkedinStart.authorizationUrl);
assert.equal(linkedinAuth.searchParams.get('scope'), 'openid profile');
const linkedinEnv = {...env, DEMO_FETCH: async (url, init) => {
  if (String(url) === 'https://www.linkedin.com/oauth/v2/accessToken') return json({access_token: 'linkedin-private-access', token_type: 'Bearer', expires_in: 86400});
  assert.equal(String(url), 'https://api.linkedin.com/v2/userinfo'); assert.equal(init.headers.Authorization, 'Bearer linkedin-private-access');
  return json({sub: 'actual-member-id', name: 'Fixture member', picture: 'https://media.licdn.com/fixture.png'});
}};
const linkedinFinished = await finishOAuth('linkedin', `http://localhost:8788/api/demo/oauth/linkedin/callback?state=${linkedinAuth.searchParams.get('state')}&code=real-code`, linkedinEnv, linkedinStore, session);
assert.equal(linkedinFinished.profile.name, 'Fixture member'); assert.equal(linkedinFinished.records[0].kind, 'basic');
assert(!JSON.stringify(linkedinFinished).includes('linkedin-private-access'));

const profile = '민수\nAI engineer\nExperience\nComputer vision engineer at Example\nBuilt an object detection pipeline\nTop Skills\nPython\nPyTorch\nEducation\nAI Convergence degree\nProjects\nComputer Vision Project';
const parsed = await importLinkedIn({text: profile});
assert(parsed.records.some(record => record.kind === 'career' && record.text.includes('object detection')));
assert(parsed.records.some(record => record.kind === 'skills' && record.text.includes('PyTorch')));
assert(parsed.records.some(record => record.kind === 'education' && record.text.includes('Convergence')));
assert(parsed.records.some(record => record.kind === 'projects' && record.text.includes('Computer Vision Project')));
assert(parsed.records.every(record => record.source === 'linkedin'));
const textFile = await importLinkedIn({fileName: 'profile.txt', fileBase64: Buffer.from(profile).toString('base64')}); assert.equal(textFile.summary.characters, profile.length);
assert.equal((await importLinkedIn({text: '직무 AI engineering '.repeat(10000)})).summary.truncated, true);
await rejectsCode(importLinkedIn({text: 'short'}), 'PROFILE_TEXT_REQUIRED');
await rejectsCode(importLinkedIn({fileName: 'bad.txt', fileBase64: Buffer.from([255]).toString('base64')}), 'INVALID_PROFILE_TEXT_ENCODING');
await rejectsCode(importLinkedIn({fileName: 'wrong.pdf', fileBase64: Buffer.from('not a PDF').toString('base64')}), 'INVALID_PROFILE_PDF');
await rejectsCode(importLinkedIn({fileName: 'unsupported.docx', fileBase64: Buffer.from(profile).toString('base64')}), 'UNSUPPORTED_PROFILE_FILE');

// This fixture is a real PDF byte stream parsed by PDF.js; no mocked PDF extraction.
function actualPdf() {
  const lines = ['Fixture member', 'Experience', 'Computer Vision Engineer', 'Built image segmentation models', 'Top Skills', 'Python PyTorch', 'Education', 'AI Convergence degree'];
  const stream = `BT /F1 12 Tf 50 780 Td ${lines.map((line, index) => `${index ? '0 -20 Td ' : ''}(${line}) Tj`).join('\n')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let content = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => {offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n`;});
  const xref = Buffer.byteLength(content); content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}
const fromPdf = await importLinkedIn({fileName: 'linkedin-profile.pdf', fileBase64: actualPdf().toString('base64')});
assert.equal(fromPdf.summary.pages, 1); assert(fromPdf.records.some(record => record.kind === 'career' && record.text.includes('segmentation'))); assert(fromPdf.records.some(record => record.kind === 'skills' && record.text.includes('PyTorch')));
console.log('PASS: real OAuth endpoint contracts, session-bound one-use state/PKCE, token privacy/refresh/revocation, account playlist selection, full pagination and explicit limits, real LinkedIn text/PDF parsing and errors');
