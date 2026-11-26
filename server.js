// Roll Call — mobile D&D with turn alerts and an AI Dungeon Master
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const webpush = require('web-push');
const R = require('./public/rules.js');

const PORT = process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
fs.mkdirSync(path.join(DATA_DIR, 'library'), { recursive: true });

// ---------- storage ----------
const DB_FILE = path.join(DATA_DIR, 'db.json');
let db = { users: {}, sessions: {}, campaigns: {}, vapid: null };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (e) { /* fresh */ }
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 400);
}
if (!db.vapid) { db.vapid = webpush.generateVAPIDKeys(); save(); }
webpush.setVapidDetails('mailto:NES.demore@gmail.com', db.vapid.publicKey, db.vapid.privateKey);

const uid = (n = 8) => crypto.randomBytes(n).toString('hex');
const now = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- dice ----------
function rollDice(formula) {
  const p = R.parseDice(formula); if (!p) return null;
  const rolls = []; for (let i = 0; i < p.n; i++) rolls.push(1 + crypto.randomInt(p.s));
  return { formula: String(formula), rolls, bonus: p.b, total: rolls.reduce((a, b) => a + b, 0) + p.b };
}
function d20(adv) {
  const a = 1 + crypto.randomInt(20), b = 1 + crypto.randomInt(20);
  if (adv === 'adv') return { pick: Math.max(a, b), rolls: [a, b] };
  if (adv === 'dis') return { pick: Math.min(a, b), rolls: [a, b] };
  return { pick: a, rolls: [a] };
}

// ---------- auth ----------
function hashPass(pass, salt) { return crypto.scryptSync(String(pass), salt, 32).toString('hex'); }
function userFromReq(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '') || req.query.token;
  const id = db.sessions[t]; return id ? db.users[id] : null;
}

// ---------- maps ----------
const BLOCK = new Set(['#', '~', 'T', 'r']);
const MAP_W = 14, MAP_H = 22;
function genMap(theme) {
  const W = MAP_W, H = MAP_H; const g = [];
  const rnd = (n) => crypto.randomInt(n);
  const fill = (ch) => { for (let y = 0; y < H; y++) { g[y] = []; for (let x = 0; x < W; x++) g[y][x] = ch; } };
  const scatter = (ch, n, base) => { for (let i = 0; i < n; i++) { const x = rnd(W), y = rnd(H); if (g[y][x] === base) g[y][x] = ch; } };
  const path = () => { let x = Math.floor(W / 2); for (let y = H - 1; y >= 0; y--) { g[y][x] = ','; if (x + 1 < W) g[y][x + 1] = ','; if (rnd(3) === 0) x = clamp(x + (rnd(2) ? 1 : -1), 1, W - 3); } };
  theme = theme || 'road';
  if (theme === 'forest') { fill('.'); scatter('T', 90, '.'); scatter('r', 10, '.'); path(); }
  else if (theme === 'road') { fill('.'); scatter('T', 30, '.'); scatter('r', 8, '.'); path(); }
  else if (theme === 'cave') {
    fill('#');
    let x = Math.floor(W / 2), y = H - 2;
    for (let i = 0; i < 420; i++) { g[y][x] = '.'; if (x + 1 < W - 1) g[y][x + 1] = '.'; const d = rnd(4); x = clamp(x + (d === 0 ? 1 : d === 1 ? -1 : 0), 1, W - 2); y = clamp(y + (d === 2 ? 1 : d === 3 ? -1 : 0), 1, H - 2); }
    scatter('~', 8, '.'); scatter('r', 8, '.');
  } else if (theme === 'dungeon') {
    fill('#'); const rooms = [];
    for (let i = 0; i < 7; i++) {
      const w = 3 + rnd(4), h = 3 + rnd(4), x = 1 + rnd(W - w - 1), y = 1 + rnd(H - h - 1);
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy][xx] = '=';
      rooms.push([x + (w >> 1), y + (h >> 1)]);
    }
    rooms.push([W >> 1, H - 2]); g[H - 2][W >> 1] = '=';
    rooms.sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < rooms.length; i++) {
      let [x, y] = rooms[i - 1]; const [tx, ty] = rooms[i];
      while (x !== tx) { if (g[y][x] === '#') g[y][x] = '='; x += Math.sign(tx - x); }
      while (y !== ty) { if (g[y][x] === '#') g[y][x] = '='; y += Math.sign(ty - y); }
    }
  } else if (theme === 'tavern') {
    fill('='); for (let x = 0; x < W; x++) { g[0][x] = '#'; g[H - 1][x] = '#'; } for (let y = 0; y < H; y++) { g[y][0] = '#'; g[y][W - 1] = '#'; }
    g[H - 1][W >> 1] = '+'; for (let x = 2; x < W - 2; x++) g[3][x] = 'b';
    for (let i = 0; i < 7; i++) { const x = 2 + rnd(W - 4), y = 6 + rnd(H - 10); g[y][x] = 't'; }
    g[1][W - 2] = 'f';
  } else { // town
    fill('.'); path();
    for (let i = 0; i < 6; i++) {
      const w = 3 + rnd(2), h = 3, x = rnd(2) ? 1 + rnd(3) : W - w - 1 - rnd(2), y = 1 + i * 3 + rnd(2);
      if (y + h >= H - 1) break;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy][xx] = '#';
      g[y + h - 1][x + (w >> 1)] = '+';
    }
    scatter('T', 12, '.'); g[H >> 1][(W >> 1) - 2] = 'w';
  }
  return { theme, w: W, h: H, tiles: g.map(r => r.join('')) };
}
function tileAt(b, x, y) { if (x < 0 || y < 0 || x >= b.w || y >= b.h) return '#'; return b.tiles[y][x]; }
function passable(c, x, y, ignoreId) {
  if (BLOCK.has(tileAt(c.board, x, y))) return false;
  return !c.board.tokens.some(t => t.id !== ignoreId && t.x === x && t.y === y && !t.dead);
}
function freeSpot(c, nx, ny) {
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = nx + dx, y = ny + dy; if (passable(c, x, y)) return [x, y];
  }
  return [nx, ny];
}
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// ---------- campaign helpers ----------
function newCampaign(owner, opts) {
  let code; do { code = Math.random().toString(36).slice(2, 7).toUpperCase(); } while (Object.values(db.campaigns).some(c => c.code === code));
  const c = {
    id: uid(6), code, name: String(opts.name || 'New Campaign').slice(0, 60), ownerId: owner.id,
    premise: String(opts.premise || '').slice(0, 500),
    dmMode: opts.dmMode === 'human' ? 'human' : 'ai', dmUserId: opts.dmMode === 'human' ? owner.id : null,
    pace: opts.pace === 'live' ? 'live' : 'async', turnTimer: 0,
    status: 'lobby', members: [owner.id], characters: {}, log: [], notes: [],
    turn: { mode: 'explore', order: [], index: 0, round: 1, phase: 'act', pendingRoll: null, startedAt: now(), moved: 0, attacks: 0, notified: 0 },
    board: Object.assign(genMap('town'), { tokens: [] }), towns: [], location: null, library: [], createdAt: now(), updatedAt: now()
  };
  db.campaigns[c.id] = c; save(); return c;
}
function isDM(c, u) { return u && (c.dmUserId === u.id || (c.ownerId === u.id)); }
function aiActive(c) { return c.dmMode === 'ai' && !!AI_KEY; }
function charOf(c, userId) { return Object.values(c.characters).find(ch => ch.ownerId === userId); }
function tokenOfChar(c, charId) { return c.board.tokens.find(t => t.charId === charId); }
function addLog(c, kind, text, extra) {
  const e = Object.assign({ id: uid(4), t: now(), kind, text: String(text || '').slice(0, 4000) }, extra || {});
  c.log.push(e); if (c.log.length > 2000) c.log.splice(0, c.log.length - 2000);
  c.updatedAt = now(); return e;
}
function currentEntry(c) { return c.turn.order[c.turn.index] || null; }
function currentUserId(c) {
  const e = currentEntry(c); if (!e) return null;
  if (e.kind === 'pc') return c.characters[e.charId] && c.characters[e.charId].ownerId;
  return null;
}
function nameOfEntry(c, e) {
  if (!e) return '?';
  if (e.kind === 'pc') return (c.characters[e.charId] || {}).name || '?';
  const t = c.board.tokens.find(t => t.id === e.tokenId); return t ? t.name : 'Monster';
}

function buildExploreOrder(c) {
  c.turn.order = Object.values(c.characters).filter(ch => !ch.dead).sort((a, b) => a.joinedAt - b.joinedAt).map(ch => ({ kind: 'pc', charId: ch.id }));
  if (c.turn.index >= c.turn.order.length) c.turn.index = 0;
}

function placeParty(c) {
  const chars = Object.values(c.characters);
  chars.forEach((ch, i) => {
    let t = tokenOfChar(c, ch.id);
    const [x, y] = freeSpot(c, (c.board.w >> 1) - 1 + (i % 3), c.board.h - 2 - Math.floor(i / 3));
    if (!t) { t = { id: uid(4), kind: 'pc', charId: ch.id, name: ch.name }; c.board.tokens.push(t); }
    t.x = x; t.y = y; t.name = ch.name;
  });
}
function syncTokens(c) {
  c.board.tokens.forEach(t => {
    if (t.kind === 'pc') { const ch = c.characters[t.charId]; if (ch) { t.hp = ch.hp; t.maxHp = ch.maxHp; t.ac = ch.ac; t.name = ch.name; t.look = ch.look; t.cls = ch.class; t.dead = !!ch.dead; } }
  });
}

function spawnMonster(c, spec) {
  const base = R.BESTIARY[spec.name] || Object.entries(R.BESTIARY).find(([k]) => String(spec.name || '').toLowerCase().includes(k.toLowerCase()))?.[1] || {};
  const baseName = spec.name || 'Monster';
  const same = c.board.tokens.filter(t => t.base === baseName);
  const sameCount = same.length ? Math.max(...same.map(t => parseInt((t.name.match(/ (\d+)$/) || [0, 1])[1], 10))) : 0;
  let x = spec.x, y = spec.y;
  if (typeof x !== 'number' || typeof y !== 'number') { x = 2 + crypto.randomInt(c.board.w - 4); y = 1 + crypto.randomInt(Math.floor(c.board.h / 3)); }
  [x, y] = freeSpot(c, clamp(x, 0, c.board.w - 1), clamp(y, 0, c.board.h - 1));
  const hp = Number(spec.hp) || base.hp || 10;
  const t = {
    id: uid(4), kind: spec.friendly ? 'npc' : 'monster', base: spec.name || 'Monster',
    name: (spec.name || 'Monster') + (sameCount ? ' ' + (sameCount + 1) : ''), x, y, hp, maxHp: hp,
    ac: Number(spec.ac) || base.ac || 12, hit: Number(spec.hit) || base.hit || 3, dmg: spec.dmg || base.dmg || '1d6+1',
    xp: Number(spec.xp) || base.xp || 50, emoji: spec.emoji || base.emoji || (spec.friendly ? '🙂' : '👾'), speed: base.speed || 6
  };
  c.board.tokens.push(t);
  if (c.turn.mode === 'combat' && t.kind === 'monster') c.turn.order.push({ kind: 'monster', tokenId: t.id, init: d20().pick + 1 });
  return t;
}
function findToken(c, name) {
  if (!name) return null; const n = String(name).toLowerCase();
  return c.board.tokens.find(t => t.name.toLowerCase() === n) || c.board.tokens.find(t => t.name.toLowerCase().startsWith(n)) || c.board.tokens.find(t => t.name.toLowerCase().includes(n));
}
function findChar(c, name) {
  if (!name) return null; const n = String(name).toLowerCase();
  return Object.values(c.characters).find(ch => ch.name.toLowerCase() === n) || Object.values(c.characters).find(ch => ch.name.toLowerCase().includes(n) || n.includes(ch.name.toLowerCase()));
}

function applyDamageToChar(c, ch, amount) {
  if (amount < 0) { // damage
    if (ch.hp <= 0 && !ch.dead) { ch.deathFails = (ch.deathFails || 0) + 1; if (ch.deathFails >= 3) { ch.dead = true; addLog(c, 'system', `☠️ ${ch.name} has died.`); } return; }
    ch.hp = Math.max(0, ch.hp + amount);
    if (ch.hp === 0) { ch.deathFails = 0; ch.deathSaves = 0; ch.stable = false; addLog(c, 'system', `💔 ${ch.name} falls unconscious!`); }
  } else {
    if (ch.dead) return; ch.hp = Math.min(ch.maxHp, ch.hp + amount); if (ch.hp > 0) { ch.deathFails = 0; ch.deathSaves = 0; ch.stable = false; }
  }
}
function applyHp(c, targetName, amount) {
  const ch = findChar(c, targetName);
  if (ch) { applyDamageToChar(c, ch, amount); return; }
  const t = findToken(c, targetName); if (!t || t.kind === 'pc') return;
  t.hp = clamp(t.hp + amount, 0, t.maxHp);
  if (t.hp <= 0) killToken(c, t);
}
function killToken(c, t) {
  if (t.dead) return; t.dead = true;
  addLog(c, 'system', `⚔️ ${t.name} is defeated!`);
  c.turn.xpPool = (c.turn.xpPool || 0) + (t.xp || 0);
  const idx = c.turn.order.findIndex(e => e.tokenId === t.id);
  if (idx >= 0) { c.turn.order.splice(idx, 1); if (idx < c.turn.index) c.turn.index--; if (c.turn.index >= c.turn.order.length) c.turn.index = 0; }
  c.board.tokens = c.board.tokens.filter(x => x.id !== t.id);
}
function giveXp(c, ch, amt) {
  ch.xp = (ch.xp || 0) + amt;
  const lvl = R.levelForXp(ch.xp); if (lvl > ch.level && !ch.levelUpReady) { ch.levelUpReady = true; addLog(c, 'system', `⭐ ${ch.name} can level up! Open your sheet.`); }
}

// ---------- combat ----------
function startCombat(c, silent) {
  const monsters = c.board.tokens.filter(t => t.kind === 'monster' && !t.dead);
  if (!monsters.length) return false;
  const entries = [];
  Object.values(c.characters).filter(ch => !ch.dead).forEach(ch => { const r = d20().pick + R.mod(ch.scores.dex); entries.push({ kind: 'pc', charId: ch.id, init: r }); });
  monsters.forEach(t => entries.push({ kind: 'monster', tokenId: t.id, init: d20().pick + 1 }));
  entries.sort((a, b) => b.init - a.init);
  c.turn.mode = 'combat'; c.turn.order = entries; c.turn.index = 0; c.turn.round = 1; c.turn.xpPool = 0;
  if (!silent) addLog(c, 'system', '⚔️ Roll for initiative! ' + entries.map(e => `${nameOfEntry(c, e)} ${e.init}`).join(', '));
  beginTurn(c);
  return true;
}
function endCombat(c) {
  if (c.turn.mode !== 'combat') return;
  const alive = Object.values(c.characters).filter(ch => !ch.dead);
  const pool = c.turn.xpPool || 0;
  if (pool && alive.length) { const each = Math.floor(pool / alive.length); alive.forEach(ch => giveXp(c, ch, each)); addLog(c, 'system', `🏆 Victory! Each hero earns ${each} XP.`); }
  c.turn.mode = 'explore'; c.turn.xpPool = 0; c.turn.round = 1;
  buildExploreOrder(c); c.turn.index = 0; beginTurn(c);
}
function checkCombatEnd(c) {
  if (c.turn.mode === 'combat' && !c.board.tokens.some(t => t.kind === 'monster' && !t.dead)) { endCombat(c); return true; }
  return false;
}

function resolveAttack(c, attacker, target, opts) {
  // attacker: {name, hit, dmg, isPc, ch}; target token
  const adv = opts && opts.adv;
  const r = d20(adv); const total = r.pick + attacker.hit;
  const ac = target.kind === 'pc' ? (c.characters[target.charId] || {}).ac || 10 : target.ac;
  const crit = r.pick === 20, miss = r.pick === 1 || (!crit && total < ac);
  let text = `${attacker.name} attacks ${target.name}${attacker.weapon ? ' with ' + attacker.weapon : ''}: 🎲 ${r.rolls.join('/')}${attacker.hit >= 0 ? '+' : ''}${attacker.hit} = ${total} vs AC ${ac}`;
  let dmg = 0;
  if (miss) text += ' — miss!';
  else {
    const p = R.parseDice(attacker.dmg); let formula = attacker.dmg;
    if (crit && p) formula = `${p.n * 2}d${p.s}${p.b >= 0 ? '+' : ''}${p.b}`;
    const d = rollDice(formula); dmg = Math.max(1, d.total);
    if (attacker.extraDice) { const e = rollDice(crit ? attacker.extraDice.replace(/^1d/, '2d') : attacker.extraDice); dmg += e.total; text += ` (+${e.total} ${attacker.extraLabel})`; }
    text += crit ? ` — CRITICAL HIT! ${dmg} damage!` : ` — hit for ${dmg} damage.`;
  }
  addLog(c, 'roll', text, { who: attacker.name });
  if (dmg) {
    if (target.kind === 'pc') applyDamageToChar(c, c.characters[target.charId], -dmg);
    else { target.hp = Math.max(0, target.hp - dmg); if (target.hp <= 0) killToken(c, target); }
  }
  syncTokens(c);
  return { hit: !miss, dmg, crit };
}

// Simple monster brain: used by human-DM "auto" button and as AI fallback
function autoMonster(c, t) {
  const pcs = c.board.tokens.filter(x => x.kind === 'pc' && !x.dead && (c.characters[x.charId] || {}).hp > 0);
  if (!pcs.length) return;
  pcs.sort((a, b) => dist(a, t) - dist(b, t)); const target = pcs[0];
  let steps = t.speed || 6;
  while (dist(t, target) > 1 && steps > 0) {
    let best = null, bd = dist(t, target);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = t.x + dx, ny = t.y + dy; if ((dx || dy) && passable(c, nx, ny, t.id)) { const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y)); if (d < bd) { bd = d; best = [nx, ny]; } }
    }
    if (!best) break; t.x = best[0]; t.y = best[1]; steps--;
  }
  if (dist(t, target) <= 1) resolveAttack(c, { name: t.name, hit: t.hit, dmg: t.dmg }, target);
  else addLog(c, 'system', `${t.name} moves closer.`);
}

// ---------- turn flow ----------
function beginTurn(c) {
  c.turn.phase = 'act'; c.turn.pendingRoll = null; c.turn.startedAt = now(); c.turn.moved = 0; c.turn.attacks = 0; c.turn.notified = 0;
  const e = currentEntry(c); if (!e) return;
  if (e.kind === 'pc') {
    const ch = c.characters[e.charId];
    if (!ch || ch.dead) return advance(c);
    if (ch.hp <= 0) {
      if (ch.stable) { addLog(c, 'system', `${ch.name} is unconscious but stable.`); return advance(c); }
      c.turn.phase = 'roll';
      c.turn.pendingRoll = { charId: ch.id, label: 'Death Saving Throw', dice: '1d20', mod: 0, death: true };
    }
    notifyTurn(c);
  } else {
    c.turn.phase = 'dm';
    if (aiActive(c)) queueAI(c, 'monsters');
    else notifyDM(c, 'Monsters are up — run their turn.');
  }
}
function advance(c) {
  if (c.status !== 'active') return;
  if (c.turn.mode === 'combat' && checkCombatEnd(c)) return;
  if (Object.values(c.characters).length && Object.values(c.characters).every(ch => ch.dead)) { addLog(c, 'system', '☠️ The whole party has fallen. The DM may revive or start anew.'); c.turn.phase = 'dm'; return; }
  if (c.turn.mode === 'explore') buildExploreOrder(c);
  if (!c.turn.order.length) return;
  c.turn.index = (c.turn.index + 1) % c.turn.order.length;
  if (c.turn.index === 0) c.turn.round++;
  beginTurn(c);
}

// ---------- push ----------
const sockets = new Map(); // ws -> {userId, campaignId, visible}
function userVisibleIn(userId, campaignId) {
  for (const s of sockets.values()) if (s.userId === userId && s.campaignId === campaignId && s.visible) return true;
  return false;
}
async function pushUser(userId, payload, campaignId, force) {
  const u = db.users[userId]; if (!u || !u.pushSubs || !u.pushSubs.length) return;
  if (!force && campaignId && userVisibleIn(userId, campaignId)) return;
  const body = JSON.stringify(payload);
  const keep = [];
  await Promise.all(u.pushSubs.map(async (sub) => {
    try { await webpush.sendNotification(sub, body, { TTL: 3600 * 12 }); keep.push(sub); }
    catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) keep.push(sub); }
  }));
  u.pushSubs = keep; save();
}
function notifyTurn(c) {
  const uidTurn = currentUserId(c); if (!uidTurn) return;
  const ch = charOf(c, uidTurn);
  const pr = c.turn.pendingRoll;
  c.turn.notified = now();
  pushUser(uidTurn, { title: pr ? `🎲 ${c.name}: roll ${pr.label}!` : `⚔️ Your turn in ${c.name}`, body: pr ? `${ch ? ch.name : 'You'} — tap to roll.` : `${ch ? ch.name : 'Your hero'} is up. ${c.turn.mode === 'combat' ? 'Combat round ' + c.turn.round + '.' : 'What do you do?'}`, url: `/?c=${c.id}`, tag: 'turn-' + c.id }, c.id);
}
function notifyDM(c, msg) {
  if (aiActive(c)) return;
  const dmId = c.dmUserId || c.ownerId;
  pushUser(dmId, { title: `📜 ${c.name}: DM needed`, body: msg, url: `/?c=${c.id}`, tag: 'dm-' + c.id }, c.id);
}

// ---------- library (purchased book texts) ----------
const libCache = {};
function libraryChunks(c) {
  if (libCache[c.id]) return libCache[c.id];
  const chunks = [];
  for (const b of c.library) {
    try {
      const txt = fs.readFileSync(path.join(DATA_DIR, 'library', c.id, b.id + '.txt'), 'utf8');
      for (let i = 0; i < txt.length; i += 1600) chunks.push({ title: b.title, text: txt.slice(i, i + 1800) });
    } catch (e) { }
  }
  libCache[c.id] = chunks; return chunks;
}
const STOP = new Set('the a an and or of to in on at for with is it i my we you he she they his her their this that what do does be are was were from as by into not can will just then there here our me'.split(' '));
function searchLibrary(c, query, k = 3) {
  const chunks = libraryChunks(c); if (!chunks.length) return [];
  const words = [...new Set(String(query).toLowerCase().match(/[a-z']{3,}/g) || [])].filter(w => !STOP.has(w));
  if (!words.length) return [];
  const scored = chunks.map(ch => { const t = ch.text.toLowerCase(); let s = 0; for (const w of words) { const m = t.split(w).length - 1; if (m) s += 1 + Math.log(m); } return [s, ch]; }).filter(x => x[0] > 0);
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, k).map(x => x[1]);
}

// ---------- AI Dungeon Master ----------
const aiQueue = {};
function queueAI(c, reason) {
  c.aiBusy = true;
  const run = async () => {
    try { await runAI(c, reason); }
    catch (e) {
      console.error('AI error', e.message);
      addLog(c, 'system', '🤖 The AI DM stumbled (' + e.message.slice(0, 80) + '). The turn moves on.');
      if (reason === 'monsters') { monsterRunFallback(c); }
      else if (reason === 'victory' || reason === 'takeover') beginTurn(c); else if (reason !== 'opening') advance(c); else beginTurn(c);
    }
    c.aiBusy = false; save(); broadcast(c);
  };
  aiQueue[c.id] = (aiQueue[c.id] || Promise.resolve()).then(run);
  broadcast(c);
}
function monsterRunFallback(c) {
  while (true) {
    const e = currentEntry(c); if (!e || e.kind !== 'monster') break;
    const t = c.board.tokens.find(x => x.id === e.tokenId); if (t) autoMonster(c, t);
    if (c.turn.mode !== 'combat') break;
    const before = c.turn.index; advanceNoBegin(c); if (c.turn.mode !== 'combat' || c.turn.index === before) break;
  }
  if (c.turn.mode === 'combat' && !checkCombatEnd(c)) beginTurnIfPc(c);
}
function advanceNoBegin(c) { if (checkCombatEnd(c)) return; c.turn.index = (c.turn.index + 1) % c.turn.order.length; if (c.turn.index === 0) c.turn.round++; }
function beginTurnIfPc(c) { const e = currentEntry(c); if (e && e.kind === 'pc') beginTurn(c); else if (e) beginTurn(c); }

function stateForAI(c) {
  const chars = Object.values(c.characters).map(ch => `- ${ch.name} (player ${db.users[ch.ownerId]?.name}): Lv${ch.level} ${ch.race} ${ch.class}, HP ${ch.hp}/${ch.maxHp}, AC ${ch.ac}, STR${ch.scores.str} DEX${ch.scores.dex} CON${ch.scores.con} INT${ch.scores.int} WIS${ch.scores.wis} CHA${ch.scores.cha}, gold ${ch.gold}, items: ${(ch.inventory || []).join(', ') || 'none'}${ch.spells?.length ? ', spells: ' + ch.spells.join(', ') : ''}${ch.slots ? `, spell slots ${ch.slots.max - ch.slots.used}/${ch.slots.max}` : ''}${ch.dead ? ' [DEAD]' : ch.hp <= 0 ? ' [UNCONSCIOUS]' : ''}${ch.backstory ? ', backstory: ' + ch.backstory.slice(0, 200) : ''}`).join('\n');
  const toks = c.board.tokens.filter(t => !t.dead).map(t => `- ${t.name} [${t.kind}] at (${t.x},${t.y})${t.kind !== 'pc' ? ` HP ${t.hp}/${t.maxHp} AC ${t.ac}` : ''}`).join('\n');
  const town = c.towns.find(t => t.id === c.location);
  const towns = c.towns.map(t => `- ${t.name}: ${t.desc} | places: ${(t.places || []).map(p => p.name).join(', ')} | NPCs: ${(t.npcs || []).map(n => n.name + ' (' + n.role + ')').join(', ')}`).join('\n');
  const recent = c.log.slice(-30).map(e => `[${e.kind}${e.who ? ' ' + e.who : ''}] ${e.text}`).join('\n');
  const map = c.board.tiles.map((r, y) => String(y).padStart(2, ' ') + ' ' + r).join('\n');
  return `CAMPAIGN: ${c.name}\nPREMISE: ${c.premise || '(none given — invent a classic fantasy adventure)'}\nLOCATION: ${town ? town.name : 'the wilds'} (map theme: ${c.board.theme})\nMODE: ${c.turn.mode}, round ${c.turn.round}\n\nPARTY:\n${chars}\n\nTOKENS ON BOARD (x,y; x 0-${c.board.w - 1} left→right, y 0-${c.board.h - 1} top→bottom; party enters from the bottom):\n${toks || '(none)'}\n\nMAP (# wall, ~ water, T tree, r rock, + door, , path, . ground, = floor, b bar, t table, w well, f fireplace):\n${map}\n\nKNOWN TOWNS:\n${towns || '(none yet)'}\n\nDM NOTES (your memory):\n${c.notes.slice(-25).join('\n') || '(none)'}\n\nRECENT LOG:\n${recent}`;
}

const AI_SYSTEM = `You are the Dungeon Master for a D&D 5th Edition game played on phones by a group of friends around age 14. Run a fun, fair, vivid adventure.
Rules:
- Keep each narration short for a phone screen: 2-5 sentences. End by prompting the NEXT player by character name when it fits.
- Content: PG-13. Adventure peril and monster fights are fine; no gore detail, no sexual content, no real-world hate.
- Follow 5e rules. The server rolls all attack dice and applies weapon damage itself — never invent hit results for attacks already shown in the log as rolls. For anything uncertain a player attempts (sneaking, persuading, climbing, spotting, saving throws), request a roll instead of deciding. Spells: adjudicate them yourself with hp_changes (healing positive, damage negative) and dice you describe; deduct a spell slot with spend_slot for leveled spells.
- Give every player meaningful choices. Reward creativity. Don't railroad. Don't make decisions for player characters.
- Use the source excerpts (from the group's own rulebooks) when they're relevant.
- Spawn monsters onto the board when a fight begins (use names from: ${Object.keys(R.BESTIARY).join(', ')}, or any 5e monster with hp/ac/hit/dmg/xp you supply), and set start_combat true. Place monsters on passable tiles (not # ~ T r) a few squares from the party.
- When the party enters a new settlement, create it with new_town (shops sell items with prices in gold) and set travel_to. Change the battle map with new_map when the scene changes location (themes: town, forest, road, cave, dungeon, tavern).
- Award xp for clever play and quests (monster XP is awarded automatically). Award gold and items for loot.
- Use memory_note to record important facts you must remember (NPC names, promises, quest hooks, secrets). Keep each note under 25 words.
Reply with ONLY a JSON object, no other text, with these keys (omit keys you don't need):
{"narration": string,
 "request_roll": {"character": name, "label": "Stealth check", "ability": "dex", "skill": "stealth" or null, "dc": number} or null,
 "hp_changes": [{"target": name, "amount": number}],
 "spawn": [{"name": string, "x": int, "y": int, "hp": int, "ac": int, "hit": int, "dmg": "1d6+2", "xp": int, "emoji": string, "friendly": bool}],
 "monster_actions": [{"monster": name, "move_to": {"x": int, "y": int} or null, "attack": target character name or null, "say": string or null}],
 "move": [{"target": name, "x": int, "y": int}],
 "remove": [token names that leave the scene],
 "start_combat": bool, "end_combat": bool,
 "give_items": [{"character": name, "item": string}], "take_items": [{"character": name, "item": string}],
 "gold": [{"character": name, "amount": int}], "xp": [{"character": name, "amount": int}],
 "spend_slot": [character names], "rest": "short" | "long" | null,
 "new_town": {"name": string, "desc": string, "places": [{"name": string, "type": string, "desc": string}], "npcs": [{"name": string, "role": string, "desc": string}], "shop": [{"item": string, "price": int}]} or null,
 "travel_to": town name or "wilds" or null,
 "new_map": "town"|"forest"|"road"|"cave"|"dungeon"|"tavern" or null,
 "memory_note": string or null}`;

async function callClaude(system, user) {
  const res = await fetch((process.env.AI_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 1800, system, messages: [{ role: 'user', content: user }] })
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`API ${res.status}: ${t.slice(0, 120)}`); }
  const j = await res.json();
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON in reply');
  return JSON.parse(text.slice(a, b + 1));
}

async function runAI(c, reason) {
  const e = currentEntry(c);
  let task;
  if (reason === 'opening') task = `Begin the adventure. Introduce the setting and starting town with new_town and travel_to (the party starts there; the map is already a town). Write an exciting opening hook in 3-6 sentences and end by asking ${nameOfEntry(c, e)} what they do.`;
  else if (reason === 'monsters') {
    const run = []; for (let i = c.turn.index; i < c.turn.order.length; i++) { const x = c.turn.order[i]; if (x.kind !== 'monster') break; run.push(nameOfEntry(c, x)); }
    task = `It is now the monsters' turn: ${run.join(', ')}. For EACH of these monsters give a monster_actions entry (move up to 6 squares onto a passable tile and attack an adjacent or in-range character, or do something smart like flee or hide). Narrate their intentions briefly (the server will roll the attacks and post the results). Don't spawn new monsters unless reinforcements make sense.`;
    c._monsterRun = run;
  } else if (reason === 'roll') task = `The player just made the roll you requested (see the last log entries). Resolve the outcome. Then wrap up and the turn will pass to the next player.`;
  else if (reason === 'victory') task = `The party just won the fight (see the log). Narrate the victory in 2-4 sentences, hand out any loot with gold/give_items, and prompt ${nameOfEntry(c, e)} for what the party does next.`;
  else if (reason === 'takeover') task = `You are taking over as DM mid-game. Briefly recap the situation in 2-3 sentences and prompt ${nameOfEntry(c, e)}.`;
  else task = `${nameOfEntry(c, e)} just took their turn (see the last log entries). Respond to what they did. If the outcome is uncertain, use request_roll for that character instead of deciding (the turn will wait for the roll). Otherwise resolve it and the turn will pass to the next player in order: ${nameOfEntry(c, c.turn.order[(c.turn.index + 1) % Math.max(1, c.turn.order.length)])}.`;

  const lastAction = c.log.slice(-6).map(x => x.text).join(' ');
  const excerpts = searchLibrary(c, lastAction + ' ' + (c.premise || ''));
  const lib = excerpts.length ? '\n\nSOURCE EXCERPTS FROM THE GROUP\'S BOOKS:\n' + excerpts.map(x => `--- ${x.title} ---\n${x.text}`).join('\n') : '';
  let out;
  try { out = await callClaude(AI_SYSTEM, stateForAI(c) + lib + '\n\nTASK: ' + task); }
  catch (err) { out = await callClaude(AI_SYSTEM, stateForAI(c) + '\n\nTASK: ' + task); }
  applyAI(c, out, reason);
}

function applyAI(c, o, reason) {
  if (o.new_town && o.new_town.name) {
    const t = { id: uid(4), name: String(o.new_town.name).slice(0, 60), desc: String(o.new_town.desc || '').slice(0, 600), places: (o.new_town.places || []).slice(0, 10), npcs: (o.new_town.npcs || []).slice(0, 12), shop: (o.new_town.shop || R.SHOP_STOCK).slice(0, 20).map(s => ({ item: String(s.item).slice(0, 60), price: Math.max(0, parseInt(s.price, 10) || 1) })) };
    const existing = c.towns.find(x => x.name.toLowerCase() === t.name.toLowerCase());
    if (existing) Object.assign(existing, t, { id: existing.id }); else { c.towns.push(t); addLog(c, 'system', `🏘️ Discovered: ${t.name}`); }
  }
  if (o.travel_to) {
    if (String(o.travel_to).toLowerCase() === 'wilds') c.location = null;
    else { const t = c.towns.find(x => x.name.toLowerCase() === String(o.travel_to).toLowerCase()); if (t) c.location = t.id; }
  }
  if (o.new_map && ['town', 'forest', 'road', 'cave', 'dungeon', 'tavern'].includes(o.new_map) && c.turn.mode !== 'combat') {
    const pcs = c.board.tokens.filter(t => t.kind === 'pc');
    c.board = Object.assign(genMap(o.new_map), { tokens: pcs }); placeParty(c);
  }
  if (o.narration) addLog(c, 'narration', o.narration, { who: 'DM' });
  (o.remove || []).forEach(n => { const t = findToken(c, n); if (t && t.kind !== 'pc') { c.board.tokens = c.board.tokens.filter(x => x !== t); const i = c.turn.order.findIndex(e => e.tokenId === t.id); if (i >= 0) { c.turn.order.splice(i, 1); if (i < c.turn.index) c.turn.index--; } } });
  (o.spawn || []).slice(0, Math.max(0, 12 - c.board.tokens.filter(t => t.kind === 'monster').length)).forEach(s => spawnMonster(c, s));
  (o.move || []).forEach(m => { const t = findToken(c, m.target); if (t && t.kind !== 'pc' && passable(c, m.x, m.y, t.id)) { t.x = m.x; t.y = m.y; } });
  (o.hp_changes || []).forEach(h => applyHp(c, h.target, parseInt(h.amount, 10) || 0));
  (o.give_items || []).forEach(g => { const ch = findChar(c, g.character); if (ch && g.item) { ch.inventory.push(String(g.item).slice(0, 60)); addLog(c, 'system', `🎒 ${ch.name} gets ${g.item}`); } });
  (o.take_items || []).forEach(g => { const ch = findChar(c, g.character); if (ch) { const i = ch.inventory.findIndex(x => x.toLowerCase().includes(String(g.item).toLowerCase())); if (i >= 0) ch.inventory.splice(i, 1); } });
  (o.gold || []).forEach(g => { const ch = findChar(c, g.character); if (ch) { ch.gold = Math.max(0, ch.gold + (parseInt(g.amount, 10) || 0)); addLog(c, 'system', `💰 ${ch.name} ${g.amount >= 0 ? 'gains' : 'spends'} ${Math.abs(g.amount)} gold`); } });
  (o.xp || []).forEach(g => { const ch = findChar(c, g.character); if (ch) { giveXp(c, ch, parseInt(g.amount, 10) || 0); addLog(c, 'system', `✨ ${ch.name} earns ${g.amount} XP`); } });
  (o.spend_slot || []).forEach(n => { const ch = findChar(c, n); if (ch && ch.slots) ch.slots.used = Math.min(ch.slots.max, ch.slots.used + 1); });
  if (o.rest) doRest(c, o.rest);
  if (o.memory_note) { c.notes.push(String(o.memory_note).slice(0, 200)); if (c.notes.length > 60) c.notes.splice(0, c.notes.length - 60); }
  syncTokens(c);

  if (reason === 'monsters') {
    const run = c._monsterRun || []; delete c._monsterRun;
    const acts = o.monster_actions || [];
    for (const name of run) {
      const t = findToken(c, name); if (!t || t.dead) continue;
      const a = acts.find(x => x.monster && findToken(c, x.monster) === t);
      if (!a) { autoMonster(c, t); continue; }
      if (a.say) addLog(c, 'chat', a.say, { who: t.name });
      if (a.move_to && typeof a.move_to.x === 'number') { const [nx, ny] = freeSpot(c, clamp(a.move_to.x, 0, c.board.w - 1), clamp(a.move_to.y, 0, c.board.h - 1)); if (dist({ x: nx, y: ny }, t) <= (t.speed || 6) + 1) { t.x = nx; t.y = ny; } }
      if (a.attack) {
        const ch = findChar(c, a.attack); const tt = ch && tokenOfChar(c, ch.id);
        if (tt && !ch.dead) {
          if (dist(t, tt) > 1 && !t.ranged) { // close in if needed
            autoMonster(c, t); continue;
          }
          resolveAttack(c, { name: t.name, hit: t.hit, dmg: t.dmg }, tt);
        }
      }
    }
    // advance past the whole monster run
    let guard = 0;
    while (c.turn.mode === 'combat' && guard++ < 50) {
      if (checkCombatEnd(c)) break;
      const e = currentEntry(c); if (!e || e.kind !== 'monster') break;
      c.turn.index = (c.turn.index + 1) % c.turn.order.length; if (c.turn.index === 0) c.turn.round++;
    }
    if (o.end_combat) { endCombat(c); return; }
    if (c.turn.mode === 'combat') {
      const e = currentEntry(c);
      if (e && e.kind === 'pc') beginTurn(c); else if (e) { beginTurn(c); }
    }
    return;
  }

  if (o.end_combat && c.turn.mode === 'combat') { endCombat(c); return; }
  if (o.start_combat && c.turn.mode !== 'combat') { if (startCombat(c)) return; }

  if (reason === 'opening' || reason === 'takeover' || reason === 'victory') { beginTurn(c); return; }

  if (o.request_roll && o.request_roll.character) {
    const ch = findChar(c, o.request_roll.character);
    if (ch && !ch.dead) {
      const rr = o.request_roll; const ab = R.ABILITIES.includes(rr.ability) ? rr.ability : (R.SKILLS[rr.skill] || 'wis');
      let m = R.mod(ch.scores[ab]);
      if (rr.skill && (ch.skills || []).includes(rr.skill)) m += R.prof(ch.level);
      if (/sav/i.test(rr.label || '') && (R.CLASSES[ch.class]?.saves || []).includes(ab)) m += R.prof(ch.level);
      // the roll belongs to that character; if it's someone else, they roll out of turn
      c.turn.phase = 'roll'; c.turn.pendingRoll = { charId: ch.id, label: String(rr.label || 'Check').slice(0, 60), dice: '1d20', mod: m, dc: rr.dc || null };
      const owner = ch.ownerId; const ent = currentEntry(c);
      pushUser(owner, { title: `🎲 ${c.name}: ${c.turn.pendingRoll.label}!`, body: `${ch.name}, the DM needs a roll.`, url: `/?c=${c.id}`, tag: 'turn-' + c.id }, c.id);
      if (ent && ent.kind === 'pc' && ent.charId !== ch.id) c.turn.pendingRoll.outOfTurn = true;
      return;
    }
  }
  advance(c);
}

function doRest(c, kind) {
  Object.values(c.characters).forEach(ch => {
    if (ch.dead) return;
    if (kind === 'long') { ch.hp = ch.maxHp; if (ch.slots) ch.slots.used = 0; ch.deathFails = 0; ch.deathSaves = 0; ch.stable = false; }
    else { const h = rollDice(`1d${R.CLASSES[ch.class].hitDie}`).total + R.mod(ch.scores.con); ch.hp = Math.min(ch.maxHp, Math.max(ch.hp, 0) + Math.max(1, h)); }
  });
  addLog(c, 'system', kind === 'long' ? '🌙 The party takes a long rest. HP and spell slots restored.' : '☕ The party takes a short rest and patches up.');
  syncTokens(c);
}

// ---------- character creation ----------
function buildCharacter(owner, input) {
  const race = R.RACES[input.race] ? input.race : 'Human';
  const cls = R.CLASSES[input.class] ? input.class : 'Fighter';
  const C = R.CLASSES[cls];
  const base = {}; R.ABILITIES.forEach(a => { base[a] = clamp(parseInt(input.base?.[a], 10) || 10, 3, 18); });
  const scores = {}; R.ABILITIES.forEach(a => { scores[a] = base[a] + (R.RACES[race].bonus[a] || 0); });
  const skills = (input.skills || []).filter(s => C.skillChoices.includes(s)).slice(0, C.picks);
  const maxHp = C.hitDie + R.mod(scores.con);
  const ch = {
    id: uid(4), ownerId: owner.id, name: String(input.name || owner.name).slice(0, 30), race, class: cls, level: 1, xp: 0,
    base, scores, skills, maxHp: Math.max(1, maxHp), hp: Math.max(1, maxHp), speed: R.RACES[race].speed,
    weapons: C.weapons.slice(), spells: (C.spells || []).slice(), slots: C.spells ? { max: 2, used: 0 } : null,
    inventory: ['Backpack', 'Bedroll', 'Rations (5 days)', 'Waterskin', 'Torch (x3)', 'Potion of Healing (2d4+2)'], gold: 15,
    features: C.features.slice().concat(R.RACES[race].traits), backstory: String(input.backstory || '').slice(0, 500),
    look: Object.assign({ skin: '#e0b48a', hair: '#4a2c17', cloak: C.color, hairStyle: 0 }, input.look || {}), joinedAt: now()
  };
  ch.ac = R.computeAC(ch);
  return ch;
}
function levelUp(c, ch) {
  if (!ch.levelUpReady) return false;
  const target = R.levelForXp(ch.xp); if (target <= ch.level) { ch.levelUpReady = false; return false; }
  const C = R.CLASSES[ch.class];
  while (ch.level < target) {
    ch.level++; const gain = Math.max(1, Math.floor(C.hitDie / 2) + 1 + R.mod(ch.scores.con));
    ch.maxHp += gain; ch.hp += gain;
    if (ch.slots) ch.slots.max = Math.min(4 + ch.level, 2 + ch.level);
    if ([4, 8, 12, 16, 19].includes(ch.level)) { const a = C.primary; if (ch.scores[a] < 20) { ch.base[a] += 2; ch.scores[a] = Math.min(20, ch.scores[a] + 2); } }
    if (ch.level === 5 && ['Fighter', 'Barbarian', 'Paladin', 'Ranger', 'Monk'].includes(ch.class)) ch.features.push('Extra Attack');
    if (ch.class === 'Rogue' && ch.level % 2 === 1) ch.features = ch.features.map(f => f.startsWith('Sneak Attack') ? `Sneak Attack (${Math.ceil(ch.level / 2)}d6)` : f);
  }
  ch.ac = R.computeAC(ch); ch.levelUpReady = false;
  addLog(c, 'system', `⭐ ${ch.name} is now level ${ch.level}! (HP ${ch.maxHp})`);
  syncTokens(c); return true;
}

function weaponAttackFor(ch, w) {
  const abil = (w.ability === 'str' && !w.range && ch.scores.dex > ch.scores.str && /rapier|shortsword|dagger|scimitar/i.test(w.name)) ? 'dex' : w.ability;
  const m = R.mod(ch.scores[abil]);
  const hit = m + R.prof(ch.level);
  const addMod = !(w.spell && !/eldritch/i.test(w.name)) || false;
  let dice = w.dice;
  if (w.spell && ch.level >= 5) dice = dice.replace(/^1d/, ch.level >= 17 ? '4d' : ch.level >= 11 ? '3d' : '2d');
  const dmg = `${dice}${addMod ? (m >= 0 ? '+' + m : m) : ''}`;
  return { hit, dmg };
}

// ---------- public view ----------
function viewFor(c, u) {
  const members = c.members.map(id => { const x = db.users[id]; return { id, name: x ? x.name : '?', online: [...sockets.values()].some(s => s.userId === id && s.campaignId === c.id), visible: userVisibleIn(id, c.id), push: !!(x && x.pushSubs && x.pushSubs.length) }; });
  return {
    id: c.id, code: c.code, name: c.name, premise: c.premise, ownerId: c.ownerId, dmMode: c.dmMode, dmUserId: c.dmUserId, aiReady: !!AI_KEY, aiActive: aiActive(c), aiBusy: !!c.aiBusy,
    pace: c.pace, turnTimer: c.turnTimer, status: c.status, members, characters: c.characters,
    log: c.log.slice(-250), turn: Object.assign({}, c.turn, { current: currentEntry(c), currentUserId: currentUserId(c), currentName: nameOfEntry(c, currentEntry(c)), order: c.turn.order.map(e => Object.assign({ name: nameOfEntry(c, e) }, e)) }),
    board: c.board, towns: c.towns, location: c.location, library: c.library, notes: isDM(c, u) ? c.notes : [], isDM: isDM(c, u), me: u.id, updatedAt: c.updatedAt
  };
}
function broadcast(c) {
  for (const [ws, s] of sockets) if (s.campaignId === c.id && ws.readyState === 1) { const u = db.users[s.userId]; if (u) ws.send(JSON.stringify({ t: 'campaign', campaign: viewFor(c, u) })); }
}

// ---------- HTTP ----------
const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.text({ limit: '25mb', type: 'text/plain' }));
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
function auth(req, res, next) { const u = userFromReq(req); if (!u) return bad(res, 'Please log in', 401); req.user = u; next(); }

app.post('/api/register', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 24); const pass = String(req.body.pass || '');
  if (name.length < 2) return bad(res, 'Pick a name (2+ letters)');
  if (pass.length < 4) return bad(res, 'Password needs 4+ characters');
  if (Object.values(db.users).some(u => u.name.toLowerCase() === name.toLowerCase())) return bad(res, 'That name is taken');
  const salt = uid(8); const u = { id: uid(6), name, salt, pass: hashPass(pass, salt), pushSubs: [], createdAt: now() };
  db.users[u.id] = u; const token = uid(16); db.sessions[token] = u.id; save();
  res.json({ token, user: { id: u.id, name: u.name } });
});
app.post('/api/login', (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase();
  const u = Object.values(db.users).find(x => x.name.toLowerCase() === name);
  if (!u || hashPass(req.body.pass || '', u.salt) !== u.pass) return bad(res, 'Wrong name or password');
  const token = uid(16); db.sessions[token] = u.id; save();
  res.json({ token, user: { id: u.id, name: u.name } });
});
app.get('/api/me', auth, (req, res) => {
  const u = req.user;
  const camps = Object.values(db.campaigns).filter(c => c.members.includes(u.id)).sort((a, b) => b.updatedAt - a.updatedAt).map(c => ({
    id: c.id, name: c.name, code: c.code, status: c.status, dmMode: c.dmMode, pace: c.pace, players: c.members.length,
    myTurn: c.status === 'active' && (currentUserId(c) === u.id || (c.turn.pendingRoll && c.characters[c.turn.pendingRoll.charId]?.ownerId === u.id)),
    dmTurn: c.status === 'active' && c.turn.phase === 'dm' && !aiActive(c) && isDM(c, u),
    current: nameOfEntry(c, currentEntry(c)), updatedAt: c.updatedAt, isOwner: c.ownerId === u.id
  }));
  res.json({ user: { id: u.id, name: u.name, push: (u.pushSubs || []).length > 0 }, campaigns: camps, aiReady: !!AI_KEY });
});
app.get('/api/vapid', (req, res) => res.json({ key: db.vapid.publicKey }));
app.post('/api/push/subscribe', auth, (req, res) => {
  const sub = req.body.sub; if (!sub || !sub.endpoint) return bad(res, 'bad subscription');
  const u = req.user; u.pushSubs = (u.pushSubs || []).filter(s => s.endpoint !== sub.endpoint); u.pushSubs.push(sub); if (u.pushSubs.length > 5) u.pushSubs.shift(); save();
  res.json({ ok: true });
});
app.post('/api/push/test', auth, async (req, res) => { await pushUser(req.user.id, { title: '🎲 Roll Call', body: 'Turn alerts are working!', url: '/' }, null, true); res.json({ ok: true }); });

app.post('/api/campaigns', auth, (req, res) => { const c = newCampaign(req.user, req.body || {}); res.json({ id: c.id }); });
app.post('/api/join', auth, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const c = Object.values(db.campaigns).find(x => x.code === code); if (!c) return bad(res, 'No campaign with that code');
  if (!c.members.includes(req.user.id)) {
    if (c.members.length >= 8) return bad(res, 'That party is full (8 max)');
    c.members.push(req.user.id); addLog(c, 'system', `👋 ${req.user.name} joined the party.`); save(); broadcast(c);
  }
  res.json({ id: c.id });
});
app.get('/api/c/:id', auth, (req, res) => {
  const c = db.campaigns[req.params.id]; if (!c || !c.members.includes(req.user.id)) return bad(res, 'Not found', 404);
  res.json(viewFor(c, req.user));
});
app.post('/api/c/:id/library', auth, (req, res) => {
  const c = db.campaigns[req.params.id]; if (!c || !isDM(c, req.user)) return bad(res, 'DM only', 403);
  const title = String(req.query.title || 'Book').slice(0, 80); const text = typeof req.body === 'string' ? req.body : String(req.body.text || '');
  if (text.length < 20) return bad(res, 'That file looks empty');
  const id = uid(4); fs.mkdirSync(path.join(DATA_DIR, 'library', c.id), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'library', c.id, id + '.txt'), text);
  c.library.push({ id, title, size: text.length }); delete libCache[c.id]; save(); broadcast(c);
  res.json({ ok: true });
});

// One endpoint for all in-game actions
app.post('/api/c/:id/:op', auth, (req, res) => {
  const c = db.campaigns[req.params.id]; const u = req.user; const b = req.body || {};
  if (!c || !c.members.includes(u.id)) return bad(res, 'Not found', 404);
  const op = req.params.op; const dm = isDM(c, u);
  const myChar = charOf(c, u.id);
  const myTurn = c.status === 'active' && currentUserId(c) === u.id;
  try {
    const out = handleOp(c, u, op, b, { dm, myChar, myTurn });
    if (out && out.error) return bad(res, out.error);
    save(); broadcast(c); res.json(out || { ok: true });
  } catch (e) { console.error(e); bad(res, 'Server error: ' + e.message, 500); }
});

function handleOp(c, u, op, b, ctx) {
  const { dm, myChar, myTurn } = ctx;
  switch (op) {
    case 'character': {
      if (myChar && !b.edit) return { error: 'You already have a hero here' };
      if (myChar && b.edit) { // light edits: name, backstory, look
        if (b.name) myChar.name = String(b.name).slice(0, 30); if (b.backstory != null) myChar.backstory = String(b.backstory).slice(0, 500);
        if (b.look) myChar.look = Object.assign(myChar.look, b.look); if (Array.isArray(b.inventory)) myChar.inventory = b.inventory.map(x => String(x).slice(0, 60)).slice(0, 60);
        syncTokens(c); return { ok: true };
      }
      const ch = buildCharacter(u, b); c.characters[ch.id] = ch;
      addLog(c, 'system', `🧙 ${ch.name} the ${ch.race} ${ch.class} joins the adventure!`);
      if (c.status === 'active') { placeParty(c); syncTokens(c); if (c.turn.mode === 'explore') buildExploreOrder(c); else c.turn.order.push({ kind: 'pc', charId: ch.id, init: 0 }); }
      return { ok: true };
    }
    case 'start': {
      if (c.ownerId !== u.id) return { error: 'Only the campaign creator can start' };
      if (c.status !== 'lobby') return { error: 'Already started' };
      if (!Object.keys(c.characters).length) return { error: 'At least one hero needs to be made first' };
      c.status = 'active'; c.board = Object.assign(genMap('town'), { tokens: [] }); placeParty(c); syncTokens(c);
      buildExploreOrder(c); c.turn.index = 0; c.turn.round = 1;
      addLog(c, 'system', '📜 The adventure begins!');
      if (aiActive(c)) { c.turn.phase = 'dm'; queueAI(c, 'opening'); }
      else {
        if (c.dmMode === 'ai' && !AI_KEY) addLog(c, 'system', '🤖 The AI DM isn\'t set up on the server yet, so the campaign creator runs the game for now.');
        c.turn.phase = 'dm'; notifyDM(c, 'Set the scene, then pass to the first player.');
      }
      c.members.forEach(id => { if (id !== u.id) pushUser(id, { title: `📜 ${c.name} has begun!`, body: 'Your adventure starts now.', url: `/?c=${c.id}` }, c.id); });
      return { ok: true };
    }
    case 'action': {
      const text = String(b.text || '').trim().slice(0, 1200); if (!text) return { error: 'Say what you do' };
      if (!myTurn) return { error: "It's not your turn — use chat instead" };
      if (c.turn.phase !== 'act') return { error: c.turn.phase === 'roll' ? 'Roll the dice first!' : 'Waiting on the DM' };
      addLog(c, 'action', text, { who: myChar.name, uid: u.id });
      c.turn.phase = 'dm';
      if (aiActive(c)) queueAI(c, 'action'); else notifyDM(c, `${myChar.name}: ${text.slice(0, 100)}`);
      return { ok: true };
    }
    case 'endturn': {
      if (!myTurn && !dm) return { error: "It's not your turn" };
      if (c.turn.phase === 'roll' && !dm) return { error: 'Roll the dice first!' };
      if (myTurn && c.turn.mode === 'combat' && (c.turn.attacks || c.turn.moved) && aiActive(c) && c.turn.phase === 'act' && !b.quiet) {
        // let the AI narrate the combat turn briefly
        c.turn.phase = 'dm'; addLog(c, 'system', `${myChar.name} ends their turn.`); queueAI(c, 'action'); return { ok: true };
      }
      addLog(c, 'system', `${nameOfEntry(c, currentEntry(c))} ${myTurn ? 'passes' : 'is skipped by the DM'}.`);
      advance(c); return { ok: true };
    }
    case 'roll': {
      const pr = c.turn.pendingRoll;
      if (pr && myChar && pr.charId === myChar.id) {
        if (pr.death) {
          const r = 1 + crypto.randomInt(20); const ch = myChar;
          let txt = `💀 ${ch.name} death save: 🎲 ${r}`;
          if (r === 20) { ch.hp = 1; ch.deathFails = 0; ch.deathSaves = 0; txt += ' — NATURAL 20! Back on their feet with 1 HP!'; }
          else if (r === 1) { ch.deathFails = (ch.deathFails || 0) + 2; txt += ' — two failures!'; }
          else if (r >= 10) { ch.deathSaves = (ch.deathSaves || 0) + 1; txt += ` — success (${ch.deathSaves}/3)`; }
          else { ch.deathFails = (ch.deathFails || 0) + 1; txt += ` — failure (${ch.deathFails}/3)`; }
          if (ch.deathSaves >= 3) { ch.stable = true; txt += ' — stable.'; }
          if (ch.deathFails >= 3) { ch.dead = true; txt += ` — ${ch.name} has died.`; }
          addLog(c, 'roll', txt, { who: ch.name }); syncTokens(c);
          c.turn.pendingRoll = null; c.turn.phase = 'act';
          if (ch.hp <= 0) advance(c); else notifyTurn(c);
          return { ok: true };
        }
        const r = d20(b.adv); const total = r.pick + pr.mod;
        let txt = `🎲 ${myChar.name} — ${pr.label}: ${r.rolls.join('/')}${pr.mod >= 0 ? '+' : ''}${pr.mod} = ${total}${r.pick === 20 ? ' (NAT 20!)' : r.pick === 1 ? ' (nat 1…)' : ''}`;
        if (pr.dc) txt += total >= pr.dc ? ` ✅ vs DC ${pr.dc}` : ` ❌ vs DC ${pr.dc}`;
        addLog(c, 'roll', txt, { who: myChar.name });
        c.turn.pendingRoll = null; c.turn.phase = 'dm';
        if (aiActive(c)) queueAI(c, 'roll'); else notifyDM(c, txt);
        return { ok: true };
      }
      const f = String(b.formula || '1d20'); const r = rollDice(f); if (!r) return { error: 'Bad dice, try 2d6+1' };
      addLog(c, 'roll', `🎲 ${myChar ? myChar.name : u.name}${b.label ? ' — ' + String(b.label).slice(0, 40) : ''} rolls ${f}: [${r.rolls.join(', ')}]${r.bonus ? (r.bonus > 0 ? '+' : '') + r.bonus : ''} = ${r.total}`, { who: myChar ? myChar.name : u.name });
      return { ok: true, roll: r };
    }
    case 'chat': {
      const text = String(b.text || '').trim().slice(0, 600); if (!text) return { error: 'empty' };
      addLog(c, b.ic ? 'say' : 'chat', text, { who: dm && b.asDM ? 'DM' : (myChar ? myChar.name : u.name), uid: u.id }); return { ok: true };
    }
    case 'move': {
      const t = c.board.tokens.find(x => x.id === b.tokenId); if (!t) return { error: 'no token' };
      const x = parseInt(b.x, 10), y = parseInt(b.y, 10);
      if (t.kind !== 'pc' || t.charId !== myChar?.id) { if (!dm) return { error: 'Not your piece' }; }
      if (!passable(c, x, y, t.id)) return { error: "Can't move there" };
      if (t.kind === 'pc' && !dm) {
        const ch = c.characters[t.charId]; if (ch.hp <= 0) return { error: "You're unconscious!" };
        if (c.turn.mode === 'combat') {
          if (!myTurn) return { error: 'Wait for your turn to move in combat' };
          const budget = Math.floor(ch.speed / 5); const d = dist(t, { x, y });
          if (c.turn.moved + d > budget) return { error: `Too far — ${budget - c.turn.moved} squares of movement left` };
          c.turn.moved += d;
        }
      }
      t.x = x; t.y = y; return { ok: true };
    }
    case 'attack': {
      if (!myChar) return { error: 'Make a hero first' };
      const target = c.board.tokens.find(x => x.id === b.targetId); if (!target || target.kind === 'pc') return { error: 'Pick a monster to attack' };
      if (c.turn.mode !== 'combat') { if (!startCombat(c)) return { error: 'Nothing to fight' }; if (currentUserId(c) !== u.id) return { ok: true, note: 'Combat started! Wait for your turn.' }; }
      if (currentUserId(c) !== u.id) return { error: "It's not your turn" };
      if (c.turn.phase !== 'act') return { error: 'Not right now' };
      if (myChar.hp <= 0) return { error: "You're unconscious!" };
      const maxAtt = myChar.features.includes('Extra Attack') ? 2 : 1;
      if (c.turn.attacks >= maxAtt) return { error: 'No attacks left this turn — end your turn' };
      const w = myChar.weapons[parseInt(b.weapon, 10) || 0] || myChar.weapons[0];
      const me = tokenOfChar(c, myChar.id); const range = w.range || 1;
      if (dist(me, target) > range) return { error: `${target.name} is out of range (${range === 1 ? 'move next to it' : range + ' squares'})` };
      const a = weaponAttackFor(myChar, w);
      const att = { name: myChar.name, hit: a.hit, dmg: a.dmg, weapon: w.name };
      if (myChar.class === 'Rogue' && c.turn.attacks === 0) {
        const allyNear = c.board.tokens.some(t => t.kind === 'pc' && t.charId !== myChar.id && !t.dead && dist(t, target) <= 1);
        if (allyNear || b.adv === 'adv') { att.extraDice = `${Math.ceil(myChar.level / 2)}d6`; att.extraLabel = 'sneak attack'; }
      }
      c.turn.attacks++;
      resolveAttack(c, att, target, { adv: b.adv });
      if (checkCombatEnd(c)) { if (aiActive(c)) { c.turn.phase = 'dm'; queueAI(c, 'victory'); } return { ok: true }; }
      return { ok: true };
    }
    case 'usepotion': {
      if (!myChar) return { error: 'no hero' };
      const i = myChar.inventory.findIndex(x => /potion of healing/i.test(x)); if (i < 0) return { error: 'No healing potions' };
      myChar.inventory.splice(i, 1); const h = rollDice('2d4+2').total; applyDamageToChar(c, myChar, h);
      addLog(c, 'system', `🧪 ${myChar.name} drinks a Potion of Healing and recovers ${h} HP.`); syncTokens(c); return { ok: true };
    }
    case 'buy': {
      if (!myChar) return { error: 'no hero' };
      const town = c.towns.find(t => t.id === b.townId); if (!town) return { error: 'No shop' };
      if (c.location !== town.id) return { error: `You need to be in ${town.name} to shop there` };
      const it = town.shop[parseInt(b.index, 10)]; if (!it) return { error: 'No such item' };
      if (myChar.gold < it.price) return { error: 'Not enough gold' };
      myChar.gold -= it.price; myChar.inventory.push(it.item);
      if (/^shield/i.test(it.item) && !R.CLASSES[myChar.class].armor.shield) { myChar.acBonus = (myChar.acBonus || 0) + 2; myChar.ac = R.computeAC(myChar); }
      addLog(c, 'system', `🛒 ${myChar.name} buys ${it.item} for ${it.price} gold.`); syncTokens(c); return { ok: true };
    }
    case 'levelup': { if (!myChar) return { error: 'no hero' }; if (!levelUp(c, myChar)) return { error: 'Not enough XP yet' }; return { ok: true }; }
    case 'visible': return { ok: true };
  }
  // ----- DM-only ops -----
  if (!dm) return { error: 'DM only' };
  switch (op) {
    case 'narrate': { const t = String(b.text || '').trim(); if (!t) return { error: 'empty' }; addLog(c, 'narration', t.slice(0, 3000), { who: 'DM' }); if (b.pass && c.turn.phase === 'dm') advance(c); return { ok: true }; }
    case 'pass': { if (c.turn.mode === 'combat' && currentEntry(c)?.kind === 'monster') { advance(c); return { ok: true }; } advance(c); return { ok: true }; }
    case 'requestroll': {
      const ch = c.characters[b.charId]; if (!ch) return { error: 'Pick a hero' };
      const ab = R.ABILITIES.includes(b.ability) ? b.ability : (R.SKILLS[b.skill] || 'wis'); let m = R.mod(ch.scores[ab]);
      if (b.skill && ch.skills.includes(b.skill)) m += R.prof(ch.level);
      c.turn.phase = 'roll'; c.turn.pendingRoll = { charId: ch.id, label: String(b.label || 'Check').slice(0, 60), dice: '1d20', mod: m, dc: parseInt(b.dc, 10) || null };
      pushUser(ch.ownerId, { title: `🎲 ${c.name}: ${c.turn.pendingRoll.label}!`, body: `${ch.name}, the DM needs a roll.`, url: `/?c=${c.id}` }, c.id);
      return { ok: true };
    }
    case 'spawn': { const t = spawnMonster(c, { name: b.name, friendly: b.friendly, x: b.x, y: b.y }); addLog(c, 'system', `${t.emoji} ${t.name} appears!`); return { ok: true }; }
    case 'removetoken': { const t = c.board.tokens.find(x => x.id === b.tokenId); if (t && t.kind !== 'pc') killToken(c, t); return { ok: true }; }
    case 'hp': { const t = c.board.tokens.find(x => x.id === b.tokenId); if (!t) return { error: 'no token' }; applyHp(c, t.kind === 'pc' ? c.characters[t.charId].name : t.name, parseInt(b.amount, 10) || 0); syncTokens(c); return { ok: true }; }
    case 'startcombat': return startCombat(c) ? { ok: true } : { error: 'Spawn some monsters first' };
    case 'endcombat': endCombat(c); return { ok: true };
    case 'monsterauto': {
      const e = currentEntry(c); if (!e || e.kind !== 'monster') return { error: "It's not a monster's turn" };
      const t = c.board.tokens.find(x => x.id === e.tokenId); if (t) autoMonster(c, t); advance(c); return { ok: true };
    }
    case 'monsterattack': {
      const e = currentEntry(c); const t = c.board.tokens.find(x => x.id === (b.monsterId || e?.tokenId)); const target = c.board.tokens.find(x => x.id === b.targetId);
      if (!t || !target) return { error: 'Pick a monster and a target' };
      resolveAttack(c, { name: t.name, hit: t.hit, dmg: t.dmg }, target); return { ok: true };
    }
    case 'newmap': { if (c.turn.mode === 'combat') return { error: 'End combat first' }; const pcs = c.board.tokens.filter(t => t.kind === 'pc'); c.board = Object.assign(genMap(b.theme), { tokens: pcs }); placeParty(c); syncTokens(c); addLog(c, 'system', `🗺️ The scene changes: ${b.theme}.`); return { ok: true }; }
    case 'rest': doRest(c, b.kind === 'long' ? 'long' : 'short'); return { ok: true };
    case 'reward': {
      const ch = c.characters[b.charId]; if (!ch) return { error: 'Pick a hero' };
      if (b.gold) { ch.gold = Math.max(0, ch.gold + (parseInt(b.gold, 10) || 0)); addLog(c, 'system', `💰 ${ch.name} ${b.gold > 0 ? 'gains' : 'loses'} ${Math.abs(b.gold)} gold`); }
      if (b.xp) { giveXp(c, ch, parseInt(b.xp, 10) || 0); addLog(c, 'system', `✨ ${ch.name} earns ${b.xp} XP`); }
      if (b.item) { ch.inventory.push(String(b.item).slice(0, 60)); addLog(c, 'system', `🎒 ${ch.name} gets ${b.item}`); }
      return { ok: true };
    }
    case 'town': {
      const t = { id: uid(4), name: String(b.name || 'Town').slice(0, 60), desc: String(b.desc || '').slice(0, 600), places: [], npcs: [], shop: R.SHOP_STOCK.slice() };
      c.towns.push(t); if (b.go) c.location = t.id; addLog(c, 'system', `🏘️ Discovered: ${t.name}`); return { ok: true };
    }
    case 'travel': { c.location = b.townId || null; const t = c.towns.find(x => x.id === b.townId); addLog(c, 'system', t ? `🚶 The party arrives in ${t.name}.` : '🚶 The party heads into the wilds.'); return { ok: true }; }
    case 'revive': { const ch = c.characters[b.charId]; if (!ch) return { error: 'no hero' }; ch.dead = false; ch.hp = Math.max(1, Math.floor(ch.maxHp / 2)); ch.deathFails = 0; ch.deathSaves = 0; addLog(c, 'system', `🌟 ${ch.name} is brought back!`); syncTokens(c); buildExploreOrder(c); return { ok: true }; }
    case 'settings': {
      if (b.pace) c.pace = b.pace === 'live' ? 'live' : 'async';
      if (b.turnTimer != null) c.turnTimer = clamp(parseInt(b.turnTimer, 10) || 0, 0, 3600);
      if (b.name) c.name = String(b.name).slice(0, 60);
      if (b.dmMode) {
        if (c.ownerId !== u.id && b.dmMode === 'ai') return { error: 'Only the creator can hand the game to the AI' };
        if (b.dmMode === 'human') { c.dmMode = 'human'; c.dmUserId = u.id; addLog(c, 'system', `🎭 ${u.name} takes over as Dungeon Master.`); if (c.aiBusy) { /* AI result will still apply */ } }
        else { c.dmMode = 'ai'; c.dmUserId = null; addLog(c, 'system', '🤖 The AI Dungeon Master takes the screen.'); if (AI_KEY && c.status === 'active') { if (c.turn.phase === 'dm') { const e = currentEntry(c); queueAI(c, e && e.kind === 'monster' ? 'monsters' : 'takeover'); } } }
      }
      return { ok: true };
    }
    case 'deletebook': { c.library = c.library.filter(x => x.id !== b.bookId); try { fs.unlinkSync(path.join(DATA_DIR, 'library', c.id, b.bookId + '.txt')); } catch (e) { } delete libCache[c.id]; return { ok: true }; }
    case 'kick': { if (c.ownerId !== u.id || b.userId === u.id) return { error: 'no' }; c.members = c.members.filter(x => x !== b.userId); for (const ch of Object.values(c.characters)) if (ch.ownerId === b.userId) { delete c.characters[ch.id]; c.board.tokens = c.board.tokens.filter(t => t.charId !== ch.id); } buildExploreOrder(c); return { ok: true }; }
  }
  return { error: 'Unknown action' };
}

// ---------- reminders & live turn timers ----------
setInterval(() => {
  for (const c of Object.values(db.campaigns)) {
    if (c.status !== 'active' || c.aiBusy) continue;
    const uidTurn = currentUserId(c);
    if (c.pace === 'live' && c.turnTimer && uidTurn && c.turn.phase === 'act' && now() - c.turn.startedAt > c.turnTimer * 1000) {
      addLog(c, 'system', `⏰ Time's up for ${nameOfEntry(c, currentEntry(c))}.`); advance(c); save(); broadcast(c); continue;
    }
    if (c.pace === 'async' && uidTurn && c.turn.notified && now() - c.turn.notified > 12 * 3600 * 1000) { notifyTurn(c); save(); }
  }
}, 15000);

// ---------- websocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x'); const u = db.users[db.sessions[url.searchParams.get('token')]];
  if (!u) return ws.close();
  sockets.set(ws, { userId: u.id, campaignId: null, visible: true });
  ws.on('message', (m) => {
    let msg; try { msg = JSON.parse(m); } catch (e) { return; }
    const s = sockets.get(ws); if (!s) return;
    if (msg.t === 'sub') {
      const prev = s.campaignId; s.campaignId = msg.campaignId; s.visible = msg.visible !== false;
      const c = db.campaigns[msg.campaignId]; if (c && c.members.includes(u.id)) { ws.send(JSON.stringify({ t: 'campaign', campaign: viewFor(c, u) })); broadcast(c); }
      if (prev && prev !== msg.campaignId && db.campaigns[prev]) broadcast(db.campaigns[prev]);
    } else if (msg.t === 'vis') { s.visible = !!msg.visible; const c = db.campaigns[s.campaignId]; if (c) broadcast(c); }
  });
  ws.on('close', () => { const s = sockets.get(ws); sockets.delete(ws); if (s && db.campaigns[s.campaignId]) broadcast(db.campaigns[s.campaignId]); });
});
setInterval(() => { for (const ws of wss.clients) { try { ws.ping(); } catch (e) { } } }, 25000);

app.get('/healthz', (req, res) => res.send('ok'));
app.get(/^\/(?!api|ws).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
server.listen(PORT, () => console.log(`Roll Call on :${PORT} (AI DM ${AI_KEY ? 'ON, ' + AI_MODEL : 'off — set ANTHROPIC_API_KEY'})`));
process.on('SIGTERM', () => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) { } process.exit(0); });
