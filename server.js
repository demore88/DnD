// Roll Call — mobile D&D with turn alerts and an AI Dungeon Master
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const webpush = require('web-push');
const E = require('./server/engine');
const OPS = require('./server/ops');
const AI = require('./server/ai');
const { viewFor } = require('./server/view');

const PORT = process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(path.join(DATA_DIR, 'library'), { recursive: true }); fs.mkdirSync(path.join(DATA_DIR, 'music'), { recursive: true });

// ---------- storage ----------
const DB_FILE = path.join(DATA_DIR, 'db.json');
let db = { users: {}, sessions: {}, campaigns: {}, vapid: null, v: 2 };
try { const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); db = Object.assign(db, loaded); } catch (e) { }
// drop campaigns from the old prototype format
Object.keys(db.campaigns).forEach(id => { if (!db.campaigns[id].sceneDefs) delete db.campaigns[id]; });
let saveTimer = null;
function save() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); }, 400); }
if (!db.vapid) { db.vapid = webpush.generateVAPIDKeys(); save(); }
webpush.setVapidDetails('mailto:NES.demore@gmail.com', db.vapid.publicKey, db.vapid.privateKey);
const now = () => Date.now();
const uid = (n = 8) => crypto.randomBytes(n).toString('hex');

// ---------- push ----------
const sockets = new Map();
function userVisibleIn(userId, cid) { for (const s of sockets.values()) if (s.userId === userId && s.campaignId === cid && s.visible) return true; return false; }
async function pushUser(userId, payload, c, force) {
  const u = db.users[userId]; if (!u || !u.pushSubs || !u.pushSubs.length) return;
  if (!force && c && userVisibleIn(userId, c.id)) return;
  const body = JSON.stringify(payload); const keep = [];
  await Promise.all(u.pushSubs.map(async (sub) => { try { await webpush.sendNotification(sub, body, { TTL: 3600 * 12 }); keep.push(sub); } catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) keep.push(sub); } }));
  u.pushSubs = keep; save();
}
function notifyTurn(c) {
  const who = E.currentUserId(c); if (!who) return; const e = E.currentEntry(c); const ch = c.characters[e.charId];
  c.turn.notified = now();
  const pr = c.turn.pendingRoll; const loc = E.scene(c)?.name || c.name;
  const body = pr ? `${ch.name}: roll ${pr.label}!` : c.turn.mode === 'combat' ? `${ch.name}, it's your turn to fight! (round ${c.turn.round})` : `${ch.name}, the spotlight is on you in ${loc}. What do you do?`;
  pushUser(who, { title: c.turn.mode === 'combat' ? `⚔️ ${c.name}: your turn!` : `🎲 ${c.name}`, body, url: `/?c=${c.id}`, tag: 'turn-' + c.id }, c);
}
function notifyDM(c, msg) { if (AI.active(c)) return; pushUser(c.dmUserId || c.ownerId, { title: `📜 ${c.name}: DM needed`, body: msg, url: `/?c=${c.id}`, tag: 'dm-' + c.id }, c); }
const userName = (id) => db.users[id]?.name || '?';
function membersOf(c) { return c.members.map(id => ({ id, name: userName(id), online: [...sockets.values()].some(s => s.userId === id && s.campaignId === c.id), visible: userVisibleIn(id, c.id), push: !!(db.users[id]?.pushSubs?.length) })); }
function ctxFor(c, u) { return { isDM: OPS.isDM(c, u), aiActive: AI.active(c), aiReady: AI.enabled(), members: membersOf(c), music: db.users[c.ownerId]?.music || {} }; }
function broadcast(c) { for (const [ws, s] of sockets) if (s.campaignId === c.id && ws.readyState === 1) { const u = db.users[s.userId]; if (u) ws.send(JSON.stringify({ t: 'campaign', campaign: viewFor(c, u, ctxFor(c, u)) })); } }
function changed(c) { save(); broadcast(c); }

const hooks = { notifyTurn, notifyDM, notifyUser: (id, p, c) => pushUser(id, p, c), queueAI: (c, k, x) => AI.queue(c, k, x), aiActive: (c) => AI.active(c), userName, changed, dataDir: DATA_DIR };
E.setHooks(hooks); OPS.setHooks(hooks); AI.setHooks(hooks);

// ---------- http ----------
const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.text({ limit: '25mb', type: 'text/plain' }));
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res, p) => { if (/\.(html|js|css)$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const hashPass = (p, salt) => crypto.scryptSync(String(p), salt, 32).toString('hex');
function auth(req, res, next) { const t = (req.headers.authorization || '').replace('Bearer ', ''); const u = db.users[db.sessions[t]]; if (!u) return bad(res, 'Please log in', 401); req.user = u; next(); }

app.post('/api/register', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 24); const pass = String(req.body.pass || '');
  if (name.length < 2) return bad(res, 'Pick a name (2+ letters)'); if (pass.length < 4) return bad(res, 'Password needs 4+ characters');
  if (Object.values(db.users).some(u => u.name.toLowerCase() === name.toLowerCase())) return bad(res, 'That name is taken');
  const salt = uid(8); const code = recoveryCode(); const u = { id: uid(6), name, salt, pass: hashPass(pass, salt), rec: hashPass(code, salt), pushSubs: [], createdAt: now() }; db.users[u.id] = u;
  const token = uid(16); db.sessions[token] = u.id; save(); res.json({ token, user: { id: u.id, name }, recovery: code });
});
app.post('/api/login', (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase(); const u = Object.values(db.users).find(x => x.name.toLowerCase() === name);
  if (slow('login:' + name + ':' + req.ip)) return bad(res, 'Too many tries — wait 15 minutes', 429);
  if (!u || hashPass(req.body.pass || '', u.salt) !== u.pass) return bad(res, 'Wrong name or password');
  const token = uid(16); db.sessions[token] = u.id; save(); res.json({ token, user: { id: u.id, name: u.name } });
});
function recoveryCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 12; i++) { s += A[crypto.randomInt(A.length)]; if (i === 3 || i === 7) s += '-'; } return s; }
const tries = new Map(); const slow = (key) => { const t = tries.get(key) || { n: 0, at: now() }; if (now() - t.at > 15 * 60 * 1000) { t.n = 0; t.at = now(); } t.n++; tries.set(key, t); return t.n > 8; };
// ---------- custom music: each user's own tracks per mood, used in every campaign they create ----------
const MOODS = ['town', 'explore', 'dungeon', 'combat', 'boss'];
const AUDIO_EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/flac': 'flac' };
app.use('/music', express.static(path.join(DATA_DIR, 'music'), { maxAge: '30d', immutable: true }));
app.get('/api/music', auth, (req, res) => res.json({ music: req.user.music || {}, moods: MOODS }));
app.post('/api/music/:mood', auth, express.raw({ type: 'audio/*', limit: '40mb' }), (req, res) => {
  const mood = req.params.mood; if (!MOODS.includes(mood)) return bad(res, 'Unknown mood');
  const ext = AUDIO_EXT[(req.headers['content-type'] || '').split(';')[0].toLowerCase()]; if (!ext) return bad(res, 'Use an MP3, WAV, OGG, M4A or FLAC file');
  if (!Buffer.isBuffer(req.body) || req.body.length < 1000) return bad(res, 'That file looks empty');
  const u = req.user; u.music = u.music || {};
  if (u.music[mood]) { try { fs.unlinkSync(path.join(DATA_DIR, 'music', path.basename(u.music[mood]))); } catch (e) { } }
  const name = `${u.id}_${mood}_${crypto.randomBytes(6).toString('hex')}.${ext}`; fs.writeFileSync(path.join(DATA_DIR, 'music', name), req.body);
  u.music[mood] = '/music/' + name; save(); Object.values(db.campaigns).filter(c => c.ownerId === u.id).forEach(c => broadcast(c)); res.json({ ok: true, music: u.music });
});
app.delete('/api/music/:mood', auth, (req, res) => { const u = req.user; if (u.music && u.music[req.params.mood]) { try { fs.unlinkSync(path.join(DATA_DIR, 'music', path.basename(u.music[req.params.mood]))); } catch (e) { } delete u.music[req.params.mood]; save(); Object.values(db.campaigns).filter(c => c.ownerId === u.id).forEach(c => broadcast(c)); } res.json({ ok: true, music: u.music || {} }); });
// ---------- premium narrator voices (optional: set ELEVENLABS_API_KEY on the server) ----------
const TTS_KEY = process.env.ELEVENLABS_API_KEY || '';
const TTS_DIR = path.join(DATA_DIR, 'tts'); fs.mkdirSync(TTS_DIR, { recursive: true });
const TTS_NARRATOR = process.env.TTS_NARRATOR_VOICE || 'JBFqnCBsd6RMkjVDRZzb';
const TTS_POOL = ['pNInz6obpgDQGcFmaJgB', 'EXAVITQu4vr4xnAQ', 'VR6AewLTigWG4xSOukaG', 'MF3mGyEYCl7XYWbV9V6O', 'TxGEqnHWrfWFTfGW9XjX', 'AZnzlk1XvdvUeBnXmlld', 'ErXwobaYiN019PkySvjV', 'yoZ06aMxZJJ28mfd3POQ', '21m00Tcm4TlvDq8ikWAM'];
const ttsUse = new Map(); const TTS_DAILY = parseInt(process.env.TTS_DAILY_CHARS || '40000', 10);
app.get('/api/tts/status', auth, (req, res) => res.json({ premium: !!TTS_KEY }));
app.post('/api/tts', auth, async (req, res) => {
  if (!TTS_KEY) return bad(res, 'Premium voices are not set up', 404);
  const text = String(req.body.text || '').slice(0, 600).trim(); if (!text) return bad(res, 'Nothing to say');
  const who = String(req.body.voice || 'dm'); let h = 7; for (const ch of who) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const voice = who === 'dm' ? TTS_NARRATOR : TTS_POOL[h % TTS_POOL.length];
  const file = path.join(TTS_DIR, crypto.createHash('sha1').update(voice + '|' + text).digest('hex') + '.mp3');
  if (fs.existsSync(file)) { res.setHeader('content-type', 'audio/mpeg'); return res.send(fs.readFileSync(file)); }
  const day = new Date().toISOString().slice(0, 10); const k = req.user.id + day; const used = ttsUse.get(k) || 0;
  if (used + text.length > TTS_DAILY) return bad(res, 'Daily premium voice limit reached', 429); ttsUse.set(k, used + text.length);
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, { method: 'POST', headers: { 'xi-api-key': TTS_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify({ text, model_id: process.env.TTS_MODEL || 'eleven_flash_v2_5' }) });
    if (!r.ok) return bad(res, 'Voice service error ' + r.status, 502);
    const buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(file, buf);
    try { const files = fs.readdirSync(TTS_DIR); if (files.length > 3000) files.map(f => ({ f, t: fs.statSync(path.join(TTS_DIR, f)).mtimeMs })).sort((a, b) => a.t - b.t).slice(0, 500).forEach(x => fs.unlinkSync(path.join(TTS_DIR, x.f))); } catch (e) { }
    res.setHeader('content-type', 'audio/mpeg'); res.send(buf);
  } catch (e) { bad(res, 'Voice service unreachable', 502); }
});
app.post('/api/password', auth, (req, res) => {
  const u = req.user; if (hashPass(req.body.old || '', u.salt) !== u.pass) return bad(res, 'Your current password is wrong');
  const p = String(req.body.pass || ''); if (p.length < 4) return bad(res, 'New password needs 4+ characters');
  u.pass = hashPass(p, u.salt); Object.keys(db.sessions).forEach(t => { if (db.sessions[t] === u.id && t !== (req.headers.authorization || '').replace('Bearer ', '')) delete db.sessions[t]; }); save(); res.json({ ok: true });
});
app.post('/api/recovery', auth, (req, res) => { const u = req.user; const code = recoveryCode(); u.rec = hashPass(code, u.salt); save(); res.json({ recovery: code }); });
app.post('/api/reset', (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase(); if (slow('reset:' + name + ':' + req.ip)) return bad(res, 'Too many tries — wait 15 minutes', 429);
  const u = Object.values(db.users).find(x => x.name.toLowerCase() === name); const code = String(req.body.code || '').trim().toUpperCase();
  if (!u || !u.rec || hashPass(code, u.salt) !== u.rec) return bad(res, 'That name and recovery code don\'t match');
  const p = String(req.body.pass || ''); if (p.length < 4) return bad(res, 'New password needs 4+ characters');
  u.pass = hashPass(p, u.salt); const nc = recoveryCode(); u.rec = hashPass(nc, u.salt); Object.keys(db.sessions).forEach(t => { if (db.sessions[t] === u.id) delete db.sessions[t]; });
  const token = uid(16); db.sessions[token] = u.id; save(); res.json({ token, user: { id: u.id, name: u.name }, recovery: nc });
});
// full story + chat log for the campaign creator (parent view)
app.get('/api/c/:id/log.txt', auth, (req, res) => {
  const c = db.campaigns[req.params.id]; if (!c || !c.members.includes(req.user.id)) return bad(res, 'Not found', 404);
  if (c.ownerId !== req.user.id) return bad(res, 'Only the campaign creator can download the full log', 403);
  const lines = c.log.filter(e => e.kind !== 'move' && e.text).map(e => `[${new Date(e.t).toISOString().replace('T', ' ').slice(0, 16)}] ${e.kind.toUpperCase()}${e.who ? ' · ' + e.who : ''}${e.uid ? ' (' + (db.users[e.uid]?.name || '?') + ')' : ''}: ${e.text}`);
  res.setHeader('content-type', 'text/plain; charset=utf-8'); res.setHeader('content-disposition', `attachment; filename="${c.name.replace(/[^a-z0-9]+/gi, '_')}_log.txt"`); res.send(lines.join('\n'));
});
app.get('/api/me', auth, (req, res) => {
  const u = req.user;
  const camps = Object.values(db.campaigns).filter(c => c.members.includes(u.id)).sort((a, b) => b.updatedAt - a.updatedAt).map(c => {
    const pr = c.turn.pendingRoll; const myCh = Object.values(c.characters).find(x => x.ownerId === u.id);
    return { id: c.id, name: c.name, code: c.code, status: c.status, dmMode: c.dmMode, pace: c.pace, players: c.members.length, adventure: c.adventure?.title, scene: E.scene(c)?.name, mode: c.turn.mode,
      myTurn: c.status === 'active' && (E.currentUserId(c) === u.id || (pr && myCh && pr.charId === myCh.id)), dmTurn: c.status === 'active' && c.turn.phase === 'dm' && !AI.active(c) && OPS.isDM(c, u),
      current: E.nameOfEntry(c, E.currentEntry(c)), hero: myCh ? { name: myCh.name, cls: myCh.class, level: myCh.level, look: myCh.look, hp: myCh.hp, maxHp: myCh.maxHp } : null, updatedAt: c.updatedAt };
  });
  res.json({ user: { id: u.id, name: u.name, push: (u.pushSubs || []).length > 0 }, campaigns: camps, aiReady: AI.enabled() });
});
app.get('/api/vapid', (req, res) => res.json({ key: db.vapid.publicKey }));
app.post('/api/push/subscribe', auth, (req, res) => { const sub = req.body.sub; if (!sub || !sub.endpoint) return bad(res, 'bad subscription'); const u = req.user; u.pushSubs = (u.pushSubs || []).filter(s => s.endpoint !== sub.endpoint); u.pushSubs.push(sub); if (u.pushSubs.length > 5) u.pushSubs.shift(); save(); res.json({ ok: true }); });
app.post('/api/push/test', auth, async (req, res) => { await pushUser(req.user.id, { title: '🎲 Roll Call', body: 'Turn alerts are on. We\'ll ping you when it\'s your turn!', url: '/' }, null, true); res.json({ ok: true }); });
app.post('/api/campaigns', auth, (req, res) => { const c = E.newCampaign(req.user, req.body || {}, (code) => Object.values(db.campaigns).some(x => x.code === code)); db.campaigns[c.id] = c; save(); res.json({ id: c.id }); });
app.post('/api/join', auth, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase(); const c = Object.values(db.campaigns).find(x => x.code === code); if (!c) return bad(res, 'No campaign with that code');
  if (!c.members.includes(req.user.id)) { if (c.members.length >= 8) return bad(res, 'That party is full'); c.members.push(req.user.id); E.addLog(c, 'system', `👋 ${req.user.name} joined.`); changed(c); }
  res.json({ id: c.id });
});
app.get('/api/c/:id', auth, (req, res) => { const c = db.campaigns[req.params.id]; if (!c || !c.members.includes(req.user.id)) return bad(res, 'Not found', 404); res.json(viewFor(c, req.user, ctxFor(c, req.user))); });
app.post('/api/c/:id/library', auth, (req, res) => {
  const c = db.campaigns[req.params.id]; if (!c || !OPS.isDM(c, req.user)) return bad(res, 'DM only', 403);
  const text = typeof req.body === 'string' ? req.body : String(req.body.text || ''); if (text.length < 20) return bad(res, 'That file looks empty');
  const id = uid(4); fs.mkdirSync(path.join(DATA_DIR, 'library', c.id), { recursive: true }); fs.writeFileSync(path.join(DATA_DIR, 'library', c.id, id + '.txt'), text);
  c.library.push({ id, title: String(req.query.title || 'Book').slice(0, 80), size: text.length }); AI.clearLibCache(c.id); changed(c); res.json({ ok: true });
});
app.post('/api/c/:id/:op', auth, (req, res) => {
  const c = db.campaigns[req.params.id]; if (!c || !c.members.includes(req.user.id)) return bad(res, 'Not found', 404);
  try {
    const out = OPS.handle(c, req.user, req.params.op, req.body || {});
    if (out && out.deleteBook) { try { fs.unlinkSync(path.join(DATA_DIR, 'library', c.id, out.deleteBook + '.txt')); } catch (e) { } AI.clearLibCache(c.id); }
    changed(c);
    if (out && out.error) return bad(res, out.error);
    res.json(out || { ok: true });
  } catch (e) { console.error(e); bad(res, 'Server error: ' + e.message, 500); }
});

// reminders & live turn timers
setInterval(() => {
  for (const c of Object.values(db.campaigns)) {
    if (c.status !== 'active' || c.aiBusy) continue; const who = E.currentUserId(c);
    if (c.pace === 'live' && c.turnTimer && who && c.turn.phase === 'act' && now() - c.turn.startedAt > c.turnTimer * 1000) { E.addLog(c, 'system', `⏰ Time's up for ${E.nameOfEntry(c, E.currentEntry(c))}.`); E.advance(c); changed(c); continue; }
    if (c.pace === 'async' && who && c.turn.notified && now() - c.turn.notified > 12 * 3600 * 1000) { notifyTurn(c); save(); }
  }
}, 15000);

// ---------- websocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const u = db.users[db.sessions[new URL(req.url, 'http://x').searchParams.get('token')]]; if (!u) return ws.close();
  sockets.set(ws, { userId: u.id, campaignId: null, visible: true });
  ws.on('message', (m) => {
    let msg; try { msg = JSON.parse(m); } catch (e) { return; } const s = sockets.get(ws); if (!s) return;
    if (msg.t === 'sub') { const prev = s.campaignId; s.campaignId = msg.campaignId; s.visible = msg.visible !== false; const c = db.campaigns[msg.campaignId]; if (c && c.members.includes(u.id)) broadcast(c); if (prev && prev !== msg.campaignId && db.campaigns[prev]) broadcast(db.campaigns[prev]); }
    else if (msg.t === 'vis') { s.visible = !!msg.visible; const c = db.campaigns[s.campaignId]; if (c) broadcast(c); }
  });
  ws.on('close', () => { const s = sockets.get(ws); sockets.delete(ws); if (s && db.campaigns[s.campaignId]) broadcast(db.campaigns[s.campaignId]); });
});
setInterval(() => { for (const ws of wss.clients) { try { ws.ping(); } catch (e) { } } }, 25000);

app.get('/healthz', (req, res) => res.send('ok'));
app.get(/^\/(?!api|ws).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
server.listen(PORT, () => console.log(`Roll Call on :${PORT} — AI DM ${AI.enabled() ? 'ON (' + AI.MODEL + ')' : 'off (set ANTHROPIC_API_KEY)'}`));
process.on('SIGTERM', () => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) { } process.exit(0); });
module.exports = { db };
