import {createHash, randomBytes} from 'node:crypto';

const BASE_URL = 'http://localhost:8788';
const OAUTH_TTL_MS = 10 * 60 * 1000;
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const LINKEDIN_SCOPE = 'openid profile';
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_PROFILE_CHARS = 120000;
const MAX_PDF_PAGES = 50;
const PROVIDERS = {
  youtube: {authorization: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: YOUTUBE_SCOPE, prefix: 'YOUTUBE'},
  linkedin: {authorization: 'https://www.linkedin.com/oauth/v2/authorization', token: 'https://www.linkedin.com/oauth/v2/accessToken', scope: LINKEDIN_SCOPE, prefix: 'LINKEDIN'},
};

export class DemoDataError extends Error {
  constructor(message, status = 400, code = 'DEMO_DATA_ERROR') {
    super(message); this.name = 'DemoDataError'; this.status = status; this.code = code;
  }
}

function providerConfig(provider, env) {
  const details = PROVIDERS[provider];
  if (!details) throw new DemoDataError('지원하지 않는 연결입니다.', 400, 'UNKNOWN_PROVIDER');
  if ((env.DEMO_BASE_URL || BASE_URL).replace(/\/$/, '') !== BASE_URL) {
    throw new DemoDataError(`로컬 Demo의 DEMO_BASE_URL은 ${BASE_URL}이어야 합니다.`, 500, 'INVALID_BASE_URL');
  }
  return {...details, clientId: String(env[`${details.prefix}_CLIENT_ID`] || '').trim(), clientSecret: String(env[`${details.prefix}_CLIENT_SECRET`] || '').trim(), redirectUri: `${BASE_URL}/api/demo/oauth/${provider}/callback`};
}

function limits(env) {
  const cap = (value, fallback, maximum) => Math.max(1, Math.min(maximum, Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : fallback));
  return {playlists: cap(env.DEMO_MAX_PLAYLISTS, 100, 500), videos: cap(env.DEMO_MAX_VIDEOS, 2000, 10000), subscriptions: cap(env.DEMO_MAX_SUBSCRIPTIONS, 500, 2000)};
}

export function getIntegrationConfig(env = process.env) {
  return Object.fromEntries([...Object.keys(PROVIDERS).map(provider => {
    const config = providerConfig(provider, env);
    return [provider, {configured: Boolean(config.clientId && config.clientSecret), redirectUri: config.redirectUri, scope: config.scope}];
  }), ['limits', limits(env)]]);
}

function requireConfigured(provider, env) {
  const config = providerConfig(provider, env);
  if (!config.clientId || !config.clientSecret) throw new DemoDataError(`${provider === 'youtube' ? 'YouTube' : 'LinkedIn'} 연결용 Client ID와 Client Secret을 .env에 설정해 주세요. OAUTH_SETUP.md에 설정 방법이 있습니다.`, 503, 'OAUTH_NOT_CONFIGURED');
  return config;
}

function requireSession(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length < 16 || sessionId.length > 256) throw new DemoDataError('Demo 세션이 없습니다. 화면을 새로고침해 주세요.', 401, 'SESSION_REQUIRED');
}

async function fetchJson(url, init, env, provider) {
  let response;
  try {
    response = await (env.DEMO_FETCH || globalThis.fetch)(url, {...init, signal: AbortSignal.timeout(20000)});
  } catch {
    throw new DemoDataError(`${provider} 서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.`, 502, 'PROVIDER_UNREACHABLE');
  }
  let body;
  try { body = await response.json(); } catch { throw new DemoDataError(`${provider} 서버에서 올바르지 않은 응답을 받았습니다.`, 502, 'INVALID_PROVIDER_RESPONSE'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DemoDataError(`${provider} 서버에서 올바르지 않은 응답을 받았습니다.`, 502, 'INVALID_PROVIDER_RESPONSE');
  if (!response.ok || body.error) {
    const reasons = Array.isArray(body.error?.errors) ? body.error.errors.map(item => item.reason) : [];
    const denied = response.status === 401 || body.error === 'invalid_grant';
    const quota = reasons.includes('quotaExceeded') || reasons.includes('dailyLimitExceeded') || response.status === 429;
    const message = denied ? `${provider} 연결이 만료되었거나 취소되었습니다. 다시 연결해 주세요.`
      : quota ? `${provider} API 사용 한도에 도달했습니다. 나중에 다시 시도해 주세요.`
        : response.status === 403 ? `${provider} 데이터 접근이 거부되었습니다. 읽기 권한과 API 활성화 상태를 확인해 주세요.`
          : `${provider} 요청을 완료하지 못했습니다 (HTTP ${response.status}). OAuth 설정과 계정 권한을 확인해 주세요.`;
    throw new DemoDataError(message, denied ? 401 : quota ? 429 : 502, denied ? 'OAUTH_RECONNECT_REQUIRED' : quota ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_REQUEST_FAILED');
  }
  return body;
}

export async function startOAuth(provider, sessionId, env = process.env, store) {
  requireSession(sessionId);
  const config = requireConfigured(provider, env);
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const expiresAt = Date.now() + OAUTH_TTL_MS;
  await store.putOAuthState(state, {provider, sessionId, verifier, redirectUri: config.redirectUri, expiresAt});
  const url = new URL(config.authorization);
  const query = {response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri, scope: config.scope, state, code_challenge: challenge, code_challenge_method: 'S256'};
  if (provider === 'youtube') Object.assign(query, {access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true'});
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return {authorizationUrl: url.href, provider, expiresAt};
}

function tokenData(body, existing = null) {
  if (typeof body.access_token !== 'string' || !body.access_token || body.access_token.length > 12000) throw new DemoDataError('OAuth 토큰 응답이 올바르지 않습니다. 다시 연결해 주세요.', 502, 'INVALID_TOKEN_RESPONSE');
  if (body.token_type && body.token_type.toLowerCase() !== 'bearer') throw new DemoDataError('지원하지 않는 OAuth 토큰 유형입니다.', 502, 'INVALID_TOKEN_RESPONSE');
  const duration = Number(body.expires_in);
  if (!Number.isFinite(duration) || duration <= 0) throw new DemoDataError('OAuth 토큰 만료 시간이 올바르지 않습니다.', 502, 'INVALID_TOKEN_RESPONSE');
  return {accessToken: body.access_token, refreshToken: body.refresh_token || existing?.refreshToken || null, expiresAt: Date.now() + duration * 1000, scope: body.scope || existing?.scope || '', connectedAt: existing?.connectedAt || new Date().toISOString(), profile: existing?.profile || null};
}

export async function finishOAuth(provider, callbackUrl, env = process.env, store, expectedSessionId) {
  requireSession(expectedSessionId);
  const config = requireConfigured(provider, env);
  const url = callbackUrl instanceof URL ? callbackUrl : new URL(callbackUrl);
  if (url.origin + url.pathname !== config.redirectUri) throw new DemoDataError('OAuth callback 주소가 올바르지 않습니다.', 400, 'INVALID_CALLBACK');
  const state = url.searchParams.get('state');
  if (!state || state.length > 256) throw new DemoDataError('OAuth 상태를 확인할 수 없습니다. 다시 연결해 주세요.', 401, 'INVALID_OAUTH_STATE');
  const pending = await store.takeOAuthState(state);
  if (!pending || pending.provider !== provider || pending.sessionId !== expectedSessionId || pending.expiresAt < Date.now() || pending.redirectUri !== config.redirectUri) {
    throw new DemoDataError('OAuth 요청이 만료되었거나 현재 세션과 일치하지 않습니다. 다시 연결해 주세요.', 401, 'INVALID_OAUTH_STATE');
  }
  if (url.searchParams.has('error')) throw new DemoDataError('계정 연결을 승인하지 않았습니다. 연결 버튼으로 다시 시도할 수 있어요.', 400, 'OAUTH_CANCELLED');
  const code = url.searchParams.get('code');
  if (!code || code.length > 12000) throw new DemoDataError('OAuth 인증 코드가 없습니다. 다시 연결해 주세요.', 400, 'OAUTH_CODE_MISSING');
  const body = new URLSearchParams({grant_type: 'authorization_code', code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, code_verifier: pending.verifier});
  const exchanged = await fetchJson(config.token, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body}, env, provider);
  const tokens = tokenData(exchanged);
  if (provider === 'youtube' && tokens.scope && !tokens.scope.split(' ').includes(YOUTUBE_SCOPE)) throw new DemoDataError('YouTube 읽기 권한이 승인되지 않았습니다. 다시 연결해 주세요.', 403, 'OAUTH_SCOPE_MISSING');
  let records = [];
  if (provider === 'linkedin') {
    const info = await fetchJson('https://api.linkedin.com/v2/userinfo', {headers: {Authorization: `Bearer ${tokens.accessToken}`}}, env, 'LinkedIn');
    if (!info.sub || !info.name) throw new DemoDataError('LinkedIn 기본 프로필 정보를 읽을 수 없습니다.', 502, 'LINKEDIN_PROFILE_UNAVAILABLE');
    const picture = typeof info.picture === 'string' && info.picture.startsWith('https://') ? info.picture : undefined;
    tokens.profile = {name: cleanText(info.name, 160), ...(picture ? {picture} : {})};
    // OIDC supplies basic identity, not employment/skills. Career evidence comes from the supplied document.
    records = [{id: `linkedin:basic:${hash(String(info.sub))}`, source: 'linkedin', kind: 'basic', title: tokens.profile.name, text: `LinkedIn 기본 프로필: ${tokens.profile.name}`}];
  }
  await store.setOAuth(pending.sessionId, provider, tokens);
  return {sessionId: pending.sessionId, provider, profile: tokens.profile, records};
}

export async function getConnectionStatus(sessionId, env = process.env, store) {
  requireSession(sessionId);
  const config = getIntegrationConfig(env);
  const entries = await Promise.all(Object.keys(PROVIDERS).map(async provider => {
    const token = await store.getOAuth(sessionId, provider);
    const expired = Boolean(token && token.expiresAt <= Date.now());
    return [provider, {configured: config[provider].configured, connected: Boolean(token && (!expired || (provider === 'youtube' && token.refreshToken))), expired, ...(token?.profile ? {profile: token.profile} : {}), ...(token ? {expiresAt: token.expiresAt} : {})}];
  }));
  return Object.fromEntries(entries);
}

async function accessToken(sessionId, env, store) {
  requireSession(sessionId);
  let tokens = await store.getOAuth(sessionId, 'youtube');
  if (!tokens) throw new DemoDataError('먼저 YouTube 계정을 연결해 주세요.', 401, 'YOUTUBE_NOT_CONNECTED');
  if (tokens.expiresAt <= Date.now() + 30000) {
    if (!tokens.refreshToken) throw new DemoDataError('YouTube 연결이 만료되었습니다. 다시 연결해 주세요.', 401, 'OAUTH_RECONNECT_REQUIRED');
    const config = requireConfigured('youtube', env);
    try {
      const body = await fetchJson(config.token, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: config.clientId, client_secret: config.clientSecret})}, env, 'YouTube');
      tokens = tokenData(body, tokens);
      await store.setOAuth(sessionId, 'youtube', tokens);
    } catch (error) {
      if (error.code === 'OAUTH_RECONNECT_REQUIRED') await store.setOAuth(sessionId, 'youtube', null);
      throw error;
    }
  }
  return tokens.accessToken;
}

async function youtubeRequest(resource, params, token, env) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  return fetchJson(url, {headers: {Authorization: `Bearer ${token}`}}, env, 'YouTube');
}

async function youtubePages(resource, params, limit, token, env) {
  const items = []; const seen = new Set(); let pageToken; let truncated = false;
  do {
    const page = await youtubeRequest(resource, {...params, maxResults: Math.min(50, limit - items.length), pageToken}, token, env);
    if (!Array.isArray(page.items)) throw new DemoDataError('YouTube 목록 응답이 올바르지 않습니다.', 502, 'INVALID_PROVIDER_RESPONSE');
    const remaining = limit - items.length;
    items.push(...page.items.slice(0, remaining));
    pageToken = page.nextPageToken;
    if (pageToken && (typeof pageToken !== 'string' || pageToken.length > 1024 || seen.has(pageToken))) throw new DemoDataError('YouTube 페이지 응답이 반복되었습니다. 다시 불러와 주세요.', 502, 'INVALID_PAGINATION');
    if (pageToken) seen.add(pageToken);
    if (items.length >= limit) {truncated = Boolean(pageToken) || page.items.length > remaining; break;}
    if (seen.size >= 250) {truncated = Boolean(pageToken); break;}
  } while (pageToken);
  return {items, truncated};
}

function cleanText(value, maximum = 6000) {return String(value || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim().slice(0, maximum);}
function hash(text) {return createHash('sha256').update(text).digest('hex').slice(0, 20);}
function topicName(url) {const name = String(url).split('/').pop(); try {return decodeURIComponent(name).replace(/_/g, ' ');} catch {return name.replace(/_/g, ' ');}}
function playlistInfo(item) {
  return {id: item.id, title: cleanText(item.snippet?.title, 300), description: cleanText(item.snippet?.description), itemCount: Number(item.contentDetails?.itemCount || 0), thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || null};
}

async function playlistsWithToken(token, env) {
  const limit = limits(env).playlists;
  const result = await youtubePages('playlists', {part: 'snippet,contentDetails', mine: 'true'}, limit, token, env);
  return {playlists: result.items.map(playlistInfo), truncated: result.truncated, limit};
}

export async function listYoutubePlaylists(sessionId, env = process.env, store) {
  return playlistsWithToken(await accessToken(sessionId, env, store), env);
}

export async function importYoutube(sessionId, options = {}, env = process.env, store) {
  const token = await accessToken(sessionId, env, store);
  const bounds = limits(env);
  const listed = await playlistsWithToken(token, env);
  if (options.playlistIds !== undefined && (!Array.isArray(options.playlistIds) || (!options.playlistIds.length && options.includeSubscriptions !== true) || options.playlistIds.some(id => typeof id !== 'string' || id.length > 160))) throw new DemoDataError('가져올 재생목록을 선택하거나 구독 채널 불러오기를 켜 주세요.', 400, 'INVALID_PLAYLIST_SELECTION');
  const requested = options.playlistIds && new Set(options.playlistIds);
  if (requested && [...requested].some(id => !listed.playlists.some(item => item.id === id))) throw new DemoDataError('현재 연결한 계정의 재생목록을 선택해 주세요. 목록을 새로 불러오면 다시 선택할 수 있어요.', 400, 'PLAYLIST_NOT_OWNED');
  const selected = listed.playlists.filter(item => !requested || requested.has(item.id));
  const records = selected.map(item => ({id: `youtube:playlist:${item.id}`, source: 'youtube', kind: 'playlist', title: item.title, text: `${item.title}\n${item.description}`.trim(), url: `https://www.youtube.com/playlist?list=${encodeURIComponent(item.id)}`}));
  let truncated = requested ? false : listed.truncated; let collectedItems = 0; const videoMap = new Map();
  for (const playlist of selected) {
    if (collectedItems >= bounds.videos) {truncated = true; break;}
    const result = await youtubePages('playlistItems', {part: 'snippet,contentDetails', playlistId: playlist.id}, bounds.videos - collectedItems, token, env);
    collectedItems += result.items.length; truncated ||= result.truncated;
    for (const item of result.items) {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      const previous = videoMap.get(videoId);
      if (previous) previous.playlists.add(playlist.title);
      else videoMap.set(videoId, {item, playlists: new Set([playlist.title])});
    }
  }
  const videoIds = [...videoMap.keys()]; let videoCount = 0; const importedVideos = new Set();
  for (let index = 0; index < videoIds.length; index += 50) {
    const result = await youtubeRequest('videos', {part: 'snippet,contentDetails,topicDetails', id: videoIds.slice(index, index + 50).join(',')}, token, env);
    if (!Array.isArray(result.items)) throw new DemoDataError('YouTube 영상 응답이 올바르지 않습니다.', 502, 'INVALID_PROVIDER_RESPONSE');
    for (const video of result.items) {
      if (!videoMap.has(video.id) || importedVideos.has(video.id)) continue;
      const snippet = video.snippet || {}; const playlists = [...videoMap.get(video.id).playlists];
      const title = cleanText(snippet.title, 300);
      const parts = [title, cleanText(snippet.description), snippet.channelTitle && `채널: ${cleanText(snippet.channelTitle, 300)}`, snippet.tags?.length && `태그: ${snippet.tags.slice(0, 60).map(tag => cleanText(tag, 160)).join(', ')}`, `재생목록: ${playlists.join(', ')}`, video.topicDetails?.topicCategories?.length && `주제: ${video.topicDetails.topicCategories.map(topicName).join(', ')}`].filter(Boolean);
      records.push({id: `youtube:video:${video.id}`, source: 'youtube', kind: 'video', title, text: parts.join('\n'), url: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`}); importedVideos.add(video.id); videoCount++;
    }
  }
  let subscriptionCount = 0;
  if (options.includeSubscriptions === true) {
    const subscribed = await youtubePages('subscriptions', {part: 'snippet', mine: 'true'}, bounds.subscriptions, token, env);
    truncated ||= subscribed.truncated;
    for (const subscription of subscribed.items) {
      const snippet = subscription.snippet || {}; const channelId = snippet.resourceId?.channelId;
      if (!channelId) continue;
      const title = cleanText(snippet.title, 300);
      records.push({id: `youtube:subscription:${channelId}`, source: 'youtube', kind: 'subscription', title, text: `${title}\n${cleanText(snippet.description)}`.trim(), url: `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`}); subscriptionCount++;
    }
  }
  return {records, summary: {playlists: selected.length, videos: videoCount, playlistItems: collectedItems, subscriptions: subscriptionCount, unavailableVideos: Math.max(0, videoIds.length - videoCount), truncated, limits: bounds}, samples: records.filter(record => record.kind === 'playlist').slice(0, 6).concat(records.filter(record => record.kind === 'video').slice(0, 3))};
}

const HEADINGS = [
  ['career', /^(경력|경력 사항|직무|업무 경험|experience|work experience|professional experience|employment)\s*[:：]?$/i],
  ['skills', /^(기술|기술 역량|보유 기술|핵심 역량|주요 보유기술|skills|top skills|technical skills|skills?\s*(?:&|and)\s*endorsements)\s*[:：]?$/i],
  ['education', /^(교육|학력|전공|교육 사항|education|academic background)\s*[:：]?$/i],
  ['projects', /^(프로젝트|주요 프로젝트|projects|personal projects|publications|논문|특허|patents)\s*[:：]?$/i],
  ['industry', /^(산업|산업 분야|분야|industry|industries)\s*[:：]?$/i],
  ['profile', /^(소개|요약|프로필|summary|about|profile|contact|연락처|certifications|자격증|languages|언어)\s*[:：]?$/i],
];

function profileSections(text) {
  const groups = []; let section = {kind: 'profile', title: 'LinkedIn 프로필', lines: []};
  const flush = () => {const value = section.lines.join('\n').trim(); if (value) groups.push({kind: section.kind, title: section.title, text: value});};
  for (const line of text.split('\n')) {
    const heading = HEADINGS.find(([, match]) => match.test(line.trim()));
    if (heading) {flush(); section = {kind: heading[0], title: line.trim(), lines: []};}
    else section.lines.push(line);
  }
  flush(); return groups;
}

async function pdfText(buffer) {
  let pdfjs;
  try {pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');} catch {throw new DemoDataError('PDF 파서가 설치되지 않았습니다. npm install 후 다시 시도하거나 프로필 텍스트를 붙여 넣어 주세요.', 503, 'PDF_PARSER_UNAVAILABLE');}
  let document; let loadingTask;
  try {
    loadingTask = pdfjs.getDocument({data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false, disableFontFace: true});
    document = await loadingTask.promise;
    const pages = Math.min(document.numPages, MAX_PDF_PAGES); const result = [];
    for (let index = 1; index <= pages; index++) {
      const page = await document.getPage(index); const content = await page.getTextContent();
      let line = ''; const lines = []; let lastY;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform?.[5];
        if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 3 && line.trim()) {lines.push(line.trim()); line = '';}
        line += `${item.str} `; lastY = y;
        if (item.hasEOL) {lines.push(line.trim()); line = ''; lastY = undefined;}
      }
      if (line.trim()) lines.push(line.trim());
      result.push(lines.join('\n')); page.cleanup();
    }
    return {text: result.join('\n\n'), pages, totalPages: document.numPages, truncated: document.numPages > MAX_PDF_PAGES};
  } catch (error) {
    if (error?.name === 'PasswordException') throw new DemoDataError('암호가 설정된 PDF는 읽을 수 없습니다. 암호 없는 프로필 PDF나 텍스트를 입력해 주세요.', 400, 'PDF_PASSWORD_REQUIRED');
    throw new DemoDataError('PDF에서 텍스트를 읽지 못했습니다. LinkedIn에서 내보낸 PDF 또는 프로필 텍스트를 입력해 주세요.', 400, 'INVALID_PROFILE_PDF');
  } finally {if (loadingTask) await loadingTask.destroy();}
}

export async function importLinkedIn({text = '', fileBase64, fileName = ''} = {}) {
  if (typeof text !== 'string' || typeof fileName !== 'string') throw new DemoDataError('프로필 입력 형식이 올바르지 않습니다.', 400, 'INVALID_PROFILE_INPUT');
  if (text.length > MAX_FILE_BYTES || fileName.length > 255) throw new DemoDataError('프로필 입력이 너무 큽니다. 6 MB 이하 파일을 사용해 주세요.', 413, 'PROFILE_TOO_LARGE');
  let contents = text; let pdf; let originalChars = text.length;
  if (fileBase64 !== undefined) {
    if (typeof fileBase64 !== 'string' || fileBase64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(fileBase64) || fileBase64.length % 4 !== 0) throw new DemoDataError('6 MB 이하의 올바른 PDF/TXT 파일을 선택해 주세요.', 413, 'INVALID_PROFILE_FILE');
    const buffer = Buffer.from(fileBase64, 'base64');
    if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new DemoDataError('비어 있지 않은 6 MB 이하 파일을 선택해 주세요.', 413, 'PROFILE_TOO_LARGE');
    if (/\.pdf$/i.test(fileName)) {
      if (!buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')) throw new DemoDataError('올바른 PDF 파일을 선택해 주세요.', 400, 'INVALID_PROFILE_PDF');
      pdf = await pdfText(buffer); contents = [contents, pdf.text].filter(Boolean).join('\n\n');
    } else if (/\.txt$/i.test(fileName)) {
      let fileText; try {fileText = new TextDecoder('utf-8', {fatal: true}).decode(buffer);} catch {throw new DemoDataError('TXT 파일을 UTF-8 형식으로 저장해서 다시 선택해 주세요.', 400, 'INVALID_PROFILE_TEXT_ENCODING');}
      contents = [contents, fileText].filter(Boolean).join('\n\n');
    } else throw new DemoDataError('PDF 또는 UTF-8 TXT 파일을 선택해 주세요.', 400, 'UNSUPPORTED_PROFILE_FILE');
    originalChars = contents.length;
  }
  contents = cleanText(contents, MAX_PROFILE_CHARS);
  if (contents.length < 20) throw new DemoDataError(pdf ? 'PDF에서 분석할 텍스트를 찾지 못했습니다. 이미지 PDF라면 프로필 텍스트를 붙여 넣어 주세요.' : '경력·기술 등을 포함한 프로필 텍스트를 20자 이상 입력해 주세요.', 400, pdf ? 'PDF_TEXT_UNAVAILABLE' : 'PROFILE_TEXT_REQUIRED');
  const sections = profileSections(contents);
  const records = [];
  for (const section of sections) {
    const chunks = []; let current = '';
    for (const line of section.text.split('\n')) {
      if (current && current.length + line.length + 1 > 1600) {chunks.push(current); current = '';}
      for (let offset = 0; offset < line.length; offset += 1600) {
        const piece = line.slice(offset, offset + 1600);
        if (offset > 0 && current) {chunks.push(current); current = '';}
        current += `${current ? '\n' : ''}${piece}`;
      }
    }
    if (current.trim()) chunks.push(current);
    for (let index = 0; index < chunks.length; index++) records.push({id: `linkedin:${section.kind}:${hash(`${section.title}\n${chunks[index]}`)}`, source: 'linkedin', kind: section.kind, title: `${section.title}${chunks.length > 1 ? ` (${index + 1})` : ''}`, text: `${section.title}\n${chunks[index]}`});
  }
  return {records, summary: {fileName: cleanText(fileName, 255) || null, characters: contents.length, sections: sections.length, records: records.length, ...(pdf ? {pages: pdf.pages, totalPages: pdf.totalPages} : {}), truncated: originalChars > MAX_PROFILE_CHARS || Boolean(pdf?.truncated)}, sections};
}
