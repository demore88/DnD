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
fs.mkdirSync(path.join(DATA_DIR, 'library'), { recursive: true });

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
function ctxFor(c, u) { return { isDM: OPS.isDM(c, u), aiActive: AI.active(c), aiReady: AI.enabled(), members: membersOf(c) }; }
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
  const salt = uid(8); const u = { id: uid(6), name, salt, pass: hashPass(pass, salt), pushSubs: [], createdAt: now() }; db.users[u.id] = u;
  const token = uid(16); db.sessions[token] = u.id; save(); res.json({ token, user: { id: u.id, name } });
});
app.post('/api/login', (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase(); const u = Object.values(db.users).find(x => x.name.toLowerCase() === name);
  if (!u || hashPass(req.body.pass || '', u.salt) !== u.pass) return bad(res, 'Wrong name or password');
  const token = uid(16); db.sessions[token] = u.id; save(); res.json({ token, user: { id: u.id, name: u.name } });
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
