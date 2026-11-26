// Roll Call game engine: scenes, vision, encounters, turns, combat, spells, monsters, quests, NPCs.
const crypto = require('crypto');
const R = require('../public/rules.js');
const MG = require('./mapgen');
const ADV = require('./adventure');

const MONSTER_DELAY = parseInt(process.env.MONSTER_DELAY || '900', 10);
let H = { notifyTurn() { }, notifyUser() { }, notifyDM() { }, queueAI() { }, aiActive() { return false; }, userName() { return '?'; } };
function setHooks(h) { H = Object.assign(H, h); }

const uid = (n = 4) => crypto.randomBytes(n).toString('hex');
const now = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (n) => crypto.randomInt(n);
const pick = (a) => a[rnd(a.length)];
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// ---------------- dice ----------------
function rollDice(formula, crit) {
  const p = R.parseDice(formula); if (!p) return { total: 0, rolls: [], bonus: 0 };
  const n = crit ? p.n * 2 : p.n; const rolls = []; for (let i = 0; i < n; i++) rolls.push(1 + rnd(p.s || 1));
  return { formula, rolls, bonus: p.b, total: rolls.reduce((a, b) => a + b, 0) + p.b };
}
function d20(adv, lucky) {
  const one = () => { let r = 1 + rnd(20); if (lucky && r === 1) r = 1 + rnd(20); return r; };
  const a = one(), b = one();
  if (adv === 'adv') return { pick: Math.max(a, b), rolls: [a, b], adv };
  if (adv === 'dis') return { pick: Math.min(a, b), rolls: [a, b], adv };
  return { pick: a, rolls: [a], adv: null };
}
const advOf = (a, d) => (a > 0 && d === 0) ? 'adv' : (d > 0 && a === 0) ? 'dis' : null;

// ---------------- log ----------------
function addLog(c, kind, text, extra) {
  const e = Object.assign({ id: uid(5), t: now(), kind, text: String(text || '').slice(0, 4000) }, extra || {});
  c.log.push(e); if (c.log.length > 2500) c.log.splice(0, c.log.length - 2500); c.updatedAt = now(); return e;
}

// ---------------- campaign ----------------
function newCampaign(owner, opts, codeTaken) {
  let code; do { code = Math.random().toString(36).slice(2, 7).toUpperCase(); } while (codeTaken(code));
  const c = {
    id: uid(6), code, name: String(opts.name || 'New Campaign').slice(0, 60), ownerId: owner.id, premise: String(opts.premise || '').slice(0, 600),
    dmMode: opts.dmMode === 'human' ? 'human' : 'ai', dmUserId: opts.dmMode === 'human' ? owner.id : null, pace: opts.pace === 'live' ? 'live' : 'async', turnTimer: 0,
    status: 'lobby', members: [owner.id], characters: {}, log: [], notes: [], events: [], flags: {}, quests: [], npcs: {}, scenes: {}, sceneDefs: {}, sceneId: null,
    turn: { mode: 'explore', order: [], index: 0, round: 1, phase: 'act', pendingRoll: null, startedAt: now(), res: null, notified: 0, xpPool: 0, goldPool: 0 },
    library: [], createdAt: now(), updatedAt: now(), shortRests: 0
  };
  if (!c.premise) ADV.installModule(c); else c.pendingOutline = true;
  return c;
}

// ---------------- characters ----------------
function makeWeapon(key, item) {
  const W = R.WEAPONS[key] || R.WEAPONS.club; const it = item ? R.ITEMS[item] : null;
  return Object.assign({ k: key }, W, { name: it ? it.name : W.name, plus: it?.plus || 0, extra: it?.extra || null, item: item || null, magic: !!it?.magic });
}
function buildCharacter(owner, input) {
  const race = R.RACES[input.race] ? input.race : 'Human';
  const cls = R.CLASSES[input.class] ? input.class : 'Fighter';
  const C = R.CLASSES[cls];
  const base = {}; R.ABILITIES.forEach(a => { base[a] = clamp(parseInt(input.base?.[a], 10) || 10, 3, 18); });
  const scores = {}; R.ABILITIES.forEach(a => { scores[a] = base[a] + (R.RACES[race].bonus[a] || 0); });
  const skills = (input.skills || []).filter(s => C.skillChoices.includes(s)).slice(0, C.picks);
  (R.RACES[race].skills || []).forEach(s => { if (!skills.includes(s)) skills.push(s); });
  const ch = {
    id: uid(4), ownerId: owner.id, name: String(input.name || owner.name).slice(0, 24), race, class: cls, level: 1, xp: 0, base, scores, skills, saves: C.saves.slice(),
    maxHp: Math.max(1, C.hitDie + R.mod(scores.con)), hp: 0, temp: 0, hitDice: 1, speed: R.RACES[race].speed,
    equip: { armor: C.start.armor, shield: !!C.start.shield, ring: null, cloak: null, boots: null }, weapons: C.start.weapons.map(k => makeWeapon(k)),
    spells: [], slots: [], features: [], uses: {}, pool: 0, ki: null,
    inventory: [{ k: 'potion_healing', n: 'Potion of Healing', q: 2 }, { k: 'rations', n: 'Rations', q: 5 }, { k: 'torch', n: 'Torch', q: 3 }, { k: 'rope', n: 'Rope, 50 ft', q: 1 }],
    gold: 15 + rnd(10), conds: [], deathSaves: 0, deathFails: 0, stable: false, dead: false,
    look: Object.assign({ skin: '#e0b48a', hair: '#4a2c17', cloak: C.color, hairStyle: 0 }, cleanLook(input.look)), backstory: String(input.backstory || '').slice(0, 500), joinedAt: now()
  };
  if (cls === 'Rogue') ch.inventory.push({ k: 'thieves_tools', n: "Thieves' Tools", q: 1 });
  if (cls === 'Cleric' || cls === 'Paladin') ch.inventory.push({ k: 'holy_water', n: 'Holy Water', q: 1 });
  raceFeats(race).forEach(f => ch.features.push(f));
  refreshClass(ch); ch.hp = ch.maxHp;
  return ch;
}
function cleanLook(l) {
  const out = {}; if (!l || typeof l !== 'object') return out;
  const col = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
  ['skin', 'hair', 'cloak', 'trim', 'eyes', 'cape', 'scale', 'horns', 'shieldColor', 'shell'].forEach(k => { const v = col(l[k]); if (v) out[k] = v; else if (l[k] === null) out[k] = null; });
  ['hairStyle', 'beard', 'brows', 'build'].forEach(k => { const v = parseInt(l[k], 10); if (!isNaN(v) && v >= 0 && v < 12) out[k] = v; });
  ['mark', 'headgear'].forEach(k => { if (typeof l[k] === 'string' && /^[a-z]{1,12}$/.test(l[k])) out[k] = l[k]; });
  ['gloves', 'earring'].forEach(k => { if (l[k] != null) out[k] = !!l[k]; });
  return out;
}
function raceFeats(race) { const r = R.RACES[race] || {}; return [].concat(r.feature || [], r.features || []); }
function refreshClass(ch) {
  const C = R.CLASSES[ch.class];
  const feats = R.featuresAt(ch.class, ch.level);
  ch.features = [...new Set([...feats, ...raceFeats(ch.race)])];
  const st = R.slotTable(ch.class, ch.level); const old = ch.slots || [];
  ch.slots = st.map((n, i) => ({ max: n, used: Math.min(old[i]?.used || 0, n) }));
  ch.spells = R.classSpells(ch.class, ch.level);
  if (ch.features.includes('favored_foe') && !ch.spells.includes('hunters_mark')) ch.spells.push('hunters_mark');
  if (ch.features.includes('lay_on_hands') && ch.pool == null) ch.pool = 5 * ch.level;
  if (ch.features.includes('ki')) ch.ki = { max: ch.level, used: Math.min(ch.ki?.used || 0, ch.level) };
  ch.ac = R.computeAC(ch);
  ch.castAb = C.castAb || null;
}
function featureUses(ch, k) { const F = R.FEATURES[k]; if (!F || !F.uses) return null; return F.uses(ch.level, ch); }
function attacksPerAction(ch) { return ch.features.includes('extra_attack') ? 2 : 1; }
function spellAtk(ch) { return R.prof(ch.level) + R.mod(ch.scores[ch.castAb || 'int']); }
function spellDC(ch) { return 8 + spellAtk(ch); }
function passivePerception(ch) { return 10 + R.mod(ch.scores.wis) + (ch.skills.includes('perception') ? R.prof(ch.level) : 0); }
function skillMod(ch, skill) { const ab = R.SKILLS[skill]; return R.mod(ch.scores[ab]) + (ch.skills.includes(skill) ? R.prof(ch.level) : 0); }
function saveMod(ch, ab) { return R.mod(ch.scores[ab]) + (ch.saves.includes(ab) ? R.prof(ch.level) : 0); }
function invFind(ch, key) { return ch.inventory.findIndex(i => i.k === key && i.q > 0); }
function invAdd(ch, key, name, q = 1) {
  const it = R.ITEMS[key]; const n = name || (it ? it.name : String(key));
  const ex = ch.inventory.find(i => (key && i.k === key) || (!key && i.n === n));
  if (ex && !(it && it.equip)) ex.q += q; else ch.inventory.push({ k: key || null, n, q, ch: it?.charges || undefined });
}
function invRemove(ch, idx, q = 1) { const it = ch.inventory[idx]; if (!it) return; it.q -= q; if (it.q <= 0) ch.inventory.splice(idx, 1); }
function partyHas(c, key) { return Object.values(c.characters).some(ch => invFind(ch, key) >= 0); }

// ---------------- scenes ----------------
const scene = (c) => c.scenes[c.sceneId];
function pcTokens(c) { const s = scene(c); return s ? s.tokens.filter(t => t.kind === 'pc') : []; }
function tokenOfChar(c, charId) { const s = scene(c); return s && s.tokens.find(t => t.charId === charId); }
function charOfToken(c, t) { return t && t.kind === 'pc' ? c.characters[t.charId] : null; }
function tileAt(s, x, y) { if (x < 0 || y < 0 || x >= s.w || y >= s.h) return '#'; return s.tiles[y][x]; }
function setTile(s, x, y, ch) { const row = s.tiles[y]; s.tiles[y] = row.slice(0, x) + ch + row.slice(x + 1); }
function occupied(s, x, y, ignoreId) { return s.tokens.some(t => t.id !== ignoreId && !t.gone && t.x === x && t.y === y); }
function walkable(s, x, y, swim) { const ch = tileAt(s, x, y); return swim && ch === '~' ? true : !MG.BLOCK.has(ch); }
function canSwim(c, t) { if (!t || t.kind !== 'pc') return false; const ch = c.characters[t.charId]; return !!(ch && R.RACES[ch.race]?.swim); }
function freeSpotNear(s, x, y, ignoreId, maxR = 8) {
  for (let r = 0; r <= maxR; r++) { const cands = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const nx = x + dx, ny = y + dy; if (walkable(s, nx, ny) && !occupied(s, nx, ny, ignoreId) && !s.pois.some(p => p.x === nx && p.y === ny && p.type !== 'trap')) cands.push([nx, ny]); } if (cands.length) return pick(cands); }
  return [x, y];
}
function takeZoneSpot(s, zone, used) {
  const pts = (s.zones[zone] || s.zones.mid || []).filter(([x, y]) => !used.has(x + ',' + y) && walkable(s, x, y));
  if (!pts.length) return null; const p = pick(pts); used.add(p[0] + ',' + p[1]); return p;
}

function monsterToken(c, key, x, y, extra) {
  const M = R.BESTIARY[key] || R.BESTIARY.goblin;
  const lvl = avgLevel(c); const scale = lvl >= 3 ? 1 + 0.12 * (lvl - 2) : 1;
  const hp = Math.round(M.hp * (M.boss ? Math.max(1, partySize(c) / 4) * scale : scale));
  return Object.assign({ id: uid(4), kind: 'monster', mkey: key, name: M.name, x, y, hp, maxHp: hp, ac: M.ac, conds: [], recharge: {}, used: {}, size: M.size || 1, boss: !!M.boss, facing: 1 }, extra || {});
}
function partySize(c) { return Math.max(1, Object.values(c.characters).filter(ch => !ch.dead).length); }
function avgLevel(c) { const a = Object.values(c.characters); return a.length ? Math.round(a.reduce((s, ch) => s + ch.level, 0) / a.length) : 1; }

function buildScene(c, key) {
  const def = c.sceneDefs[key]; if (!def) return null;
  const m = MG.generate(def.theme, { sea: def.sea });
  const s = { key, name: def.name, kind: def.kind, theme: def.theme, desc: def.desc, dark: !!def.dark, w: m.w, h: m.h, tiles: m.tiles, zones: m.zones, entry: m.entry, seen: '0'.repeat(m.w * m.h), tokens: [], pois: [], visited: false, gate: m.gate || null };
  const used = new Set([m.entry.join(',')]);
  // exits
  const exitSpots = Object.assign({}, m.exitSpots);
  (def.exits || []).forEach((e, i) => {
    let spot;
    if (e.to === 'cellar' && m.exitSpots.inn) spot = m.exitSpots.inn;
    else if (e.where === 'near' || (i === 0 && def.kind !== 'town' && !e.where)) spot = exitSpots.near;
    else if (e.where === 'far' && exitSpots.far) { spot = exitSpots.far; exitSpots.far = exitSpots.far2 || null; }
    else spot = exitSpots.far || exitSpots.far2 || takeZoneSpot(s, 'far', used) || exitSpots.near;
    if (!spot) spot = takeZoneSpot(s, 'far', used);
    used.add(spot.join(','));
    s.pois.push({ id: uid(3), type: 'exit', x: spot[0], y: spot[1], name: e.label, to: e.to, needs: e.needs || null, lockedText: e.locked || null, quest: e.quest || null });
  });
  // npcs
  (def.npcs || []).forEach((nk, i) => {
    const n = c.npcs[nk]; if (!n) return; const spot = (m.npcSpots && m.npcSpots[i]) || takeZoneSpot(s, 'mid', used) || freeSpotNear(s, 8, 12);
    used.add(spot.join(',')); s.tokens.push({ id: uid(4), kind: 'npc', npcKey: nk, name: n.name, x: spot[0], y: spot[1], look: n.look, conds: [] });
  });
  if (def.prisoner && c.npcs[def.prisoner.npc] && !c.flags['freed_' + def.prisoner.npc]) {
    const spot = takeZoneSpot(s, def.prisoner.where === 'boss' ? 'boss' : def.prisoner.where || 'far', used) || freeSpotNear(s, 8, 4);
    s.tokens.push({ id: uid(4), kind: 'npc', npcKey: def.prisoner.npc, name: c.npcs[def.prisoner.npc].name, x: spot[0], y: spot[1], look: c.npcs[def.prisoner.npc].look, chained: true, conds: [] });
  }
  // gate
  if (s.gate && def.gate) s.pois.push({ id: uid(3), type: 'gate', x: s.gate[1][0], y: s.gate[1][1], tiles: s.gate, name: 'Iron gate', needs: def.gate.needs, text: def.gate.text });
  // pois
  (def.pois || []).forEach(p => {
    const spot = p.where ? takeZoneSpot(s, p.where, used) : (def.kind === 'town' ? takeZoneSpot(s, 'mid', used) : takeZoneSpot(s, pick(['near', 'mid']), used)); if (!spot) return;
    const poi = Object.assign({ id: uid(3), x: spot[0], y: spot[1] }, JSON.parse(JSON.stringify(p)));
    if (poi.type === 'trap') { poi.hidden = true; poi.name = poi.name || 'Trap'; }
    if (poi.type === 'chest') poi.name = poi.name || pick(['Old chest', 'Iron-bound chest', 'Dusty crate', 'Rotting chest']);
    if (poi.type === 'clue' && poi.check) poi.hidden = false;
    s.pois.push(poi);
  });
  // encounters
  (def.encounters || []).forEach((e, ei) => {
    const anchor = takeZoneSpot(s, e.where || 'mid', used); if (!anchor) return; const encId = `${key}_${ei}`;
    e.m.forEach((mk, j) => {
      const [x, y] = j === 0 ? anchor : freeSpotNear(s, anchor[0], anchor[1]);
      const t = monsterToken(c, mk, x, y, { dormant: true, enc: encId, boss: !!(R.BESTIARY[mk]?.boss) });
      if (e.disguise === 'chest') { t.disguise = 'chest'; }
      s.tokens.push(t);
    });
  });
  if (def.kind === 'town') s.seen = '1'.repeat(s.w * s.h);
  c.scenes[key] = s; return s;
}

function enterScene(c, key, fromKey) {
  if (!c.sceneDefs[key]) return false;
  const old = scene(c);
  const pcs = old ? old.tokens.filter(t => t.kind === 'pc') : [];
  if (old) old.tokens = old.tokens.filter(t => t.kind !== 'pc');
  let s = c.scenes[key] || buildScene(c, key);
  c.sceneId = key;
  // place party at the exit that leads back where they came from, or the entry
  let ax = s.entry[0], ay = s.entry[1];
  const back = fromKey && s.pois.find(p => p.type === 'exit' && p.to === fromKey); if (back) { ax = back.x; ay = back.y; }
  const chars = Object.values(c.characters);
  chars.forEach(ch => {
    let t = pcs.find(p => p.charId === ch.id) || { id: uid(4), kind: 'pc', charId: ch.id, conds: [] };
    const [x, y] = freeSpotNear(s, ax, ay, t.id); t.x = x; t.y = y; t.name = ch.name; s.tokens.push(t);
  });
  const first = !s.visited; s.visited = true;
  updateVision(c, true);
  addLog(c, 'scene', s.name, { scene: key, desc: first ? s.desc : null });
  if (first) { event(c, 'enter:' + key); if (H.aiActive(c)) H.queueAI(c, 'flavor', { what: `The party arrives at ${s.name} for the first time. Scene: ${s.desc}. Describe it vividly in 2-3 sentences with one intriguing detail.` }); }
  return true;
}

// ---------------- vision ----------------
function los(s, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy, x = x0, y = y0;
  while (true) {
    if (x === x1 && y === y1) return true;
    if (!(x === x0 && y === y0) && MG.SIGHT_BLOCK.has(tileAt(s, x, y))) return false;
    const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; }
  }
}
function computeVisible(c, s) {
  const vis = new Set(); const rad = s.dark ? 5 : 9;
  s.tokens.filter(t => t.kind === 'pc').forEach(t => {
    const ch = c.characters[t.charId]; if (!ch || ch.dead) return; const r = rad + (s.dark && R.RACES[ch.race].dark ? 1 : 0);
    for (let y = t.y - r; y <= t.y + r; y++) for (let x = t.x - r; x <= t.x + r; x++) {
      if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue; if ((x - t.x) ** 2 + (y - t.y) ** 2 > r * r + r) continue;
      if (los(s, t.x, t.y, x, y)) vis.add(y * s.w + x);
    }
  });
  return vis;
}
function updateVision(c, silent) {
  const s = scene(c); if (!s) return;
  const vis = computeVisible(c, s); s.vis = [...vis];
  let seen = s.seen.split(''); vis.forEach(i => { seen[i] = '1'; }); s.seen = seen.join('');
  // passive trap detection
  const pcs = pcTokens(c);
  s.pois.filter(p => p.type === 'trap' && p.hidden && !p.disarmed).forEach(p => {
    for (const t of pcs) { const ch = c.characters[t.charId]; if (ch && cheb(t, p) <= 2 && passivePerception(ch) >= p.dc) { p.hidden = false; p.found = true; addLog(c, 'system', `👁️ ${ch.name} spots a trap: ${p.name}!`, { fx: { k: 'spot', x: p.x, y: p.y } }); break; } }
  });
  // encounters wake when seen
  const woke = new Set();
  s.tokens.filter(t => t.kind === 'monster' && t.dormant && !t.disguise && vis.has(t.y * s.w + t.x)).forEach(t => woke.add(t.enc));
  if (woke.size) { woke.forEach(e => wakeEncounter(c, e)); return true; }
  return false;
}
function wakeEncounter(c, encId, surpriseBy) {
  const s = scene(c); const group = s.tokens.filter(t => t.enc === encId && t.dormant);
  if (!group.length) return;
  group.forEach(t => { t.dormant = false; delete t.disguise; });
  const names = summarizeNames(group);
  const boss = group.find(t => t.boss);
  addLog(c, 'alert', boss ? `${boss.name} rises to face you!` : `Enemies! ${names}`, { fx: { k: 'alert', ids: group.map(t => t.id) } });
  if (c.turn.mode !== 'combat') startCombat(c, encId, surpriseBy);
  else { group.forEach(t => c.turn.order.push({ kind: 'monster', tokenId: t.id, init: initMonster(t) })); }
  if (H.aiActive(c)) H.queueAI(c, 'flavor', { what: `${boss ? 'BOSS FIGHT: ' + boss.name : 'Combat starts against ' + names} in ${s.name}. Give a tense 1-2 sentence description of the enemies appearing${boss ? ' and a short menacing line of dialogue from the boss' : ''}.` });
}
function summarizeNames(group) { const n = {}; group.forEach(t => { n[t.name] = (n[t.name] || 0) + 1; }); const pl = (w) => /f$/.test(w) ? w.slice(0, -1) + 'ves' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : /(s|x|ch|sh)$/.test(w) ? w + 'es' : w + 's'; return Object.entries(n).map(([k, v]) => v > 1 ? `${v} ${pl(k)}` : `${/^[AEIOU]/.test(k) ? 'an' : 'a'} ${k}`).join(', '); }

// ---------------- quests & events ----------------
function event(c, k) {
  if (!c.events.includes(k)) c.events.push(k);
  let changed = false;
  for (const q of c.quests) {
    if (q.status === 'done') continue;
    for (let i = 0; i < q.objectives.length; i++) {
      const o = q.objectives[i]; if (o.done || o.k !== k) continue;
      if (k.startsWith('talk:') && q.objectives.slice(0, i).some(p => !p.done)) continue;
      if (q.status === 'hidden' && !k.startsWith('talk:')) { o.done = true; continue; }
      o.done = true; changed = true;
      if (q.status !== 'hidden') { const xp = q.main ? 75 : 40; Object.values(c.characters).forEach(ch => { if (!ch.dead) giveXp(c, ch, xp); }); addLog(c, 'quest', `✔ ${o.t} (+${xp} XP each)`, { quest: q.title }); }
      if (k.startsWith('talk:')) break;
    }
    if (q.status === 'active' && q.objectives.every(o => o.done)) completeQuest(c, q);
  }
  return changed;
}
function offerQuest(c, qid) {
  const q = c.quests.find(x => x.id === qid); if (!q || q.status !== 'hidden') return false;
  q.status = 'active'; addLog(c, 'quest', `New quest: ${q.title}`, { quest: q.title, desc: q.desc });
  // re-apply past events (except talk)
  c.events.filter(e => !e.startsWith('talk:')).forEach(e => q.objectives.forEach(o => { if (o.k === e) o.done = true; }));
  return true;
}
function completeQuest(c, q) {
  q.status = 'done'; const rw = q.reward || {};
  const alive = Object.values(c.characters).filter(ch => !ch.dead);
  alive.forEach(ch => { if (rw.gold) ch.gold += rw.gold; if (rw.xp) giveXp(c, ch, rw.xp); });
  if (rw.item && alive.length) { const lucky = alive[rnd(alive.length)]; invAdd(lucky, rw.item); }
  addLog(c, 'quest', `🏆 Quest complete: ${q.title}! ${rw.gold ? `+${rw.gold} gold each. ` : ''}${rw.xp ? `+${rw.xp} XP each. ` : ''}${rw.item ? `Reward: ${R.ITEMS[rw.item]?.name || rw.item}.` : ''}`, { quest: q.title, fx: { k: 'quest' } });
  if (q.main && c.adventure) {
    c.adventureDone = true;
    addLog(c, 'narration', c.adventure.ending, { who: 'The End' });
    addLog(c, 'system', '📜 A new adventure awaits — the creator can start the next chapter from the Journal.');
  }
  if (H.aiActive(c)) H.queueAI(c, 'flavor', { what: `The party completed the quest "${q.title}". Celebrate it in 2 sentences.` });
}
function giveXp(c, ch, amt) {
  ch.xp = (ch.xp || 0) + amt;
  if (R.levelForXp(ch.xp) > ch.level && !ch.levelUpReady) { ch.levelUpReady = true; addLog(c, 'system', `⭐ ${ch.name} can level up!`, { fx: { k: 'levelready', charId: ch.id } }); }
}

// ---------------- conditions ----------------
function condsOf(c, t) { const ch = charOfToken(c, t); return ch ? ch.conds : (t.conds || (t.conds = [])); }
function hasCond(c, t, k) { return condsOf(c, t).some(x => x.k === k); }
function addCond(c, t, k, rounds, src, extra) {
  const cs = condsOf(c, t); const ex = cs.find(x => x.k === k);
  if (ex) { ex.r = Math.max(ex.r, rounds); if (src) ex.src = src; } else cs.push(Object.assign({ k, r: rounds, src: src || null }, extra || {}));
}
function removeCond(c, t, k) { const cs = condsOf(c, t); const i = cs.findIndex(x => x.k === k); if (i >= 0) cs.splice(i, 1); }
function tickConds(c, t) {
  const cs = condsOf(c, t); for (let i = cs.length - 1; i >= 0; i--) { cs[i].r--; if (cs[i].r <= 0) { const k = cs[i].k; cs.splice(i, 1); if (['restrained', 'paralyzed', 'frightened', 'charmed', 'raging', 'turned', 'asleep'].includes(k)) addLog(c, 'system', `${t.name} is no longer ${R.CONDITIONS[k]?.name.toLowerCase() || k}.`); } }
}
function isHelpless(c, t) { return ['paralyzed', 'asleep'].some(k => hasCond(c, t, k)); }

// ---------------- hp ----------------
function hpOf(c, t) { const ch = charOfToken(c, t); return ch ? ch.hp : t.hp; }
function maxHpOf(c, t) { const ch = charOfToken(c, t); return ch ? ch.maxHp : t.maxHp; }
function acOf(c, t) {
  const ch = charOfToken(c, t); let ac = ch ? R.computeAC(ch) : t.ac;
  if (hasCond(c, t, 'shielded')) ac += 5; if (hasCond(c, t, 'shield_of_faith')) ac += 2; if (hasCond(c, t, 'shelled')) ac += 4;
  return ac;
}
function isAlive(c, t) { if (!t || t.gone) return false; const ch = charOfToken(c, t); return ch ? !ch.dead : t.hp > 0; }
function isUp(c, t) { const ch = charOfToken(c, t); return ch ? (!ch.dead && ch.hp > 0) : t.hp > 0; }
function isUndead(t) { return t.kind === 'monster' && R.BESTIARY[t.mkey]?.type === 'undead'; }
function isHumanoid(t) { return t.kind === 'pc' || (t.kind === 'monster' && R.BESTIARY[t.mkey]?.type === 'humanoid'); }

function damage(c, t, amount, dtype, opts = {}) {
  if (amount <= 0) return 0;
  const ch = charOfToken(c, t);
  let dmg = amount;
  if (ch) {
    if (hasCond(c, t, 'raging') && ['bludgeoning', 'piercing', 'slashing'].includes(dtype)) dmg = Math.floor(dmg / 2);
    if (ch.features.includes('uncanny_dodge') && opts.attack && !c.turn['ud_' + ch.id + '_' + c.turn.round]) { c.turn['ud_' + ch.id + '_' + c.turn.round] = 1; dmg = Math.floor(dmg / 2); }
    if ((R.RACES[ch.race]?.resist || []).includes(dtype)) dmg = Math.floor(dmg / 2);
    if (ch.features.includes('stones_endurance') && opts.attack && !ch.uses.stones_endurance && ch.hp > 0 && (dmg >= 8 || dmg >= ch.hp)) { ch.uses.stones_endurance = 1; const red = rollDice('1d12').total + R.mod(ch.scores.con); dmg = Math.max(0, dmg - red); addLog(c, 'system', `🪨 ${ch.name} braces like a mountain — Stone's Endurance blocks ${red} damage!`); }
    if (ch.temp) { const a = Math.min(ch.temp, dmg); ch.temp -= a; dmg -= a; }
    if (ch.hp <= 0) { if (!ch.dead) { ch.deathFails += opts.crit ? 2 : 1; if (ch.deathFails >= 3) die(c, t); } return amount; }
    ch.hp -= dmg;
    if (ch.hp <= 0) {
      if (ch.race === 'Half-Orc' && !ch.uses.relentless && ch.hp > -ch.maxHp) { ch.uses.relentless = 1; ch.hp = 1; addLog(c, 'system', `💢 ${ch.name} refuses to fall! (Relentless Endurance)`); return amount; }
      if (-ch.hp >= ch.maxHp) { ch.hp = 0; die(c, t); return amount; }
      ch.hp = 0; ch.deathSaves = 0; ch.deathFails = 0; ch.stable = false; ch.conds = ch.conds.filter(x => x.k !== 'raging');
      addLog(c, 'alert', `💔 ${ch.name} falls unconscious!`, { fx: { k: 'down', t: t.id } });
    }
    if (hasCond(c, t, 'agathys') && opts.attacker && opts.melee) { const a = opts.attacker; a.hp = Math.max(0, a.hp - 5); addLog(c, 'system', `❄️ ${a.name} takes 5 cold from Armor of Agathys.`); if (a.hp <= 0) killMonster(c, a); }
    removeCond(c, t, 'asleep');
    return amount;
  }
  const M = R.BESTIARY[t.mkey] || {};
  const traits = M.traits || [];
  const phys = ['bludgeoning', 'piercing', 'slashing'].includes(dtype);
  const has = (arr) => (arr || []).some(k => k === dtype || (k === 'weapons' && phys && opts.weapon && !opts.magic) || (k === 'nonmagical' && phys && !opts.magic));
  if (has(M.immune)) { if (!t.immNote) { t.immNote = {}; } if (!t.immNote[dtype]) { t.immNote[dtype] = 1; addLog(c, 'system', `🛡️ ${t.name} is immune to ${dtype}!`); } return 0; }
  if ((traits.includes('resist_weapons') && opts.weapon && !opts.magic) || has(M.resist)) dmg = Math.floor(dmg / 2);
  if ((traits.includes('vuln_bludgeoning') && dtype === 'bludgeoning') || has(M.vuln)) dmg *= 2;
  if (M.regen && (M.regenStop || ['fire', 'acid', 'radiant']).includes(dtype)) t.noRegen = c.turn.round;
  t.hp -= dmg; removeCond(c, t, 'asleep'); if (hasCond(c, t, 'charmed')) removeCond(c, t, 'charmed');
  if (t.hp <= 0) {
    if (traits.includes('undead_fortitude') && dtype !== 'radiant' && !opts.crit && !t.fortUsed) { const r = d20().pick + 3; if (r >= 5 + dmg) { t.hp = 1; t.fortUsed = true; addLog(c, 'system', `🧟 ${t.name} refuses to stay down!`); return dmg; } }
    killMonster(c, t);
  } else if (M.special) {
    M.special.filter(sp => sp.at && sp.kind === 'summon' && !t.used[sp.n] && t.hp <= t.maxHp * sp.at).forEach(sp => { t.used[sp.n] = 1; summon(c, t, sp); });
  }
  return dmg;
}
function heal(c, t, amount) {
  const ch = charOfToken(c, t);
  if (ch) { if (ch.dead) return 0; const was = ch.hp; ch.hp = Math.min(ch.maxHp, Math.max(0, ch.hp) + amount); if (was <= 0 && ch.hp > 0) { ch.deathSaves = 0; ch.deathFails = 0; ch.stable = false; addLog(c, 'system', `💚 ${ch.name} is back on their feet!`); } return ch.hp - Math.max(0, was); }
  const was = t.hp; t.hp = Math.min(t.maxHp, t.hp + amount); return t.hp - was;
}
function die(c, t) { const ch = charOfToken(c, t); ch.dead = true; ch.hp = 0; addLog(c, 'alert', `☠️ ${ch.name} has died.`, { fx: { k: 'die', t: t.id } }); }
function killMonster(c, t) {
  if (t.gone) return; t.gone = true; t.hp = 0;
  const M = R.BESTIARY[t.mkey] || {};
  addLog(c, 'kill', `${t.name} is defeated!`, { fx: { k: 'kill', t: t.id } });
  c.turn.xpPool += M.xp || 25;
  if (M.type === 'humanoid') c.turn.goldPool += rollDice(M.boss ? '6d10' : '1d6').total;
  event(c, 'kill:' + t.mkey);
  const s = scene(c); s.tokens = s.tokens.filter(x => x.id !== t.id);
  const idx = c.turn.order.findIndex(e => e.tokenId === t.id);
  if (idx >= 0) { c.turn.order.splice(idx, 1); if (idx < c.turn.index) c.turn.index--; if (c.turn.index >= c.turn.order.length) c.turn.index = 0; }
}
function summon(c, t, sp) {
  const s = scene(c); const made = [];
  for (let i = 0; i < (sp.count || 1); i++) { const [x, y] = freeSpotNear(s, t.x, t.y); const m = monsterToken(c, sp.summon, x, y, { enc: t.enc }); s.tokens.push(m); made.push(m); if (c.turn.mode === 'combat') c.turn.order.push({ kind: 'monster', tokenId: m.id, init: initMonster(m) }); }
  addLog(c, 'alert', `${t.name}: ${sp.n}! ${summarizeNames(made)} join the fight!`, { fx: { k: 'summon', ids: made.map(m => m.id) } });
}

// ---------------- turns ----------------
function initMonster(t) { return d20().pick + (t.size > 1 ? 0 : 2); }
function freshRes(c, ch) { return { action: 1, bonus: 1, move: ch ? Math.floor((ch.speed + (ch.equip.boots ? R.ITEMS[ch.equip.boots]?.speed || 0 : 0)) / 5) : 6, attacksLeft: 0, sneak: false, attacked: false, lightUsed: false, surge: false }; }
function buildExploreOrder(c) {
  c.turn.order = Object.values(c.characters).filter(ch => !ch.dead).sort((a, b) => a.joinedAt - b.joinedAt).map(ch => ({ kind: 'pc', charId: ch.id }));
  if (c.turn.index >= c.turn.order.length) c.turn.index = 0;
}
const currentEntry = (c) => c.turn.order[c.turn.index] || null;
function currentUserId(c) { const e = currentEntry(c); return e && e.kind === 'pc' ? c.characters[e.charId]?.ownerId : null; }
function nameOfEntry(c, e) { if (!e) return '—'; if (e.kind === 'pc') return c.characters[e.charId]?.name || '?'; const t = scene(c)?.tokens.find(x => x.id === e.tokenId); return t ? t.name : 'Monster'; }
function activeMonsters(c) { const s = scene(c); return s ? s.tokens.filter(t => t.kind === 'monster' && !t.dormant && !t.gone && t.hp > 0) : []; }

function startCombat(c, encId, surpriseBy) {
  const mons = activeMonsters(c); if (!mons.length) return false;
  const entries = [];
  Object.values(c.characters).filter(ch => !ch.dead).forEach(ch => entries.push({ kind: 'pc', charId: ch.id, init: d20(null, ch.race === 'Halfling').pick + R.mod(ch.scores.dex) }));
  mons.forEach(t => entries.push({ kind: 'monster', tokenId: t.id, init: initMonster(t) + (surpriseBy === 'monsters' ? 10 : 0) }));
  entries.sort((a, b) => b.init - a.init || (a.kind === 'pc' ? -1 : 1));
  c.turn.mode = 'combat'; c.turn.order = entries; c.turn.index = 0; c.turn.round = 1; c.turn.xpPool = 0; c.turn.goldPool = 0;
  addLog(c, 'initiative', 'Roll for initiative!', { order: entries.map(e => ({ name: nameOfEntry(c, e), init: e.init })) });
  beginTurn(c); return true;
}
function endCombat(c) {
  if (c.turn.mode !== 'combat') return;
  const alive = Object.values(c.characters).filter(ch => !ch.dead);
  const each = alive.length ? Math.floor(c.turn.xpPool / alive.length) : 0; const gold = alive.length ? Math.floor(c.turn.goldPool / alive.length) : 0;
  alive.forEach(ch => { giveXp(c, ch, each); ch.gold += gold; ch.conds = ch.conds.filter(x => ['poisoned'].includes(x.k)); });
  Object.values(c.characters).forEach(ch => { if (ch.hp <= 0 && !ch.dead) { ch.stable = true; } });
  addLog(c, 'victory', `Victory! +${each} XP each${gold ? `, +${gold} gold each from the fallen` : ''}.`, { fx: { k: 'victory' } });
  c.turn.mode = 'explore'; c.turn.xpPool = 0; c.turn.goldPool = 0; c.turn.round = 1;
  buildExploreOrder(c); c.turn.index = 0;
  if (H.aiActive(c)) H.queueAI(c, 'flavor', { what: 'The party just won the fight. Describe the aftermath in 1-2 sentences and hint at what to explore next.' });
  // stabilized heroes wake with 1 hp after the fight
  Object.values(c.characters).forEach(ch => { if (ch.hp <= 0 && !ch.dead) { ch.hp = 1; ch.stable = false; addLog(c, 'system', `${ch.name} comes to with 1 HP.`); } });
  beginTurn(c);
}
function checkCombatEnd(c) {
  if (c.turn.mode !== 'combat') return false;
  const pcsUp = Object.values(c.characters).filter(ch => !ch.dead && ch.hp > 0);
  if (!pcsUp.length) { partyDefeat(c); return true; }
  if (!activeMonsters(c).length) { endCombat(c); return true; }
  return false;
}
function partyDefeat(c) {
  addLog(c, 'alert', 'The party has fallen...');
  const start = c.startScene || Object.keys(c.sceneDefs)[0];
  Object.values(c.characters).forEach(ch => { ch.dead = false; ch.hp = 1; ch.deathFails = 0; ch.deathSaves = 0; ch.stable = false; ch.gold = Math.floor(ch.gold / 2); ch.conds = []; });
  // monsters reset to dormant
  const s = scene(c); s.tokens.forEach(t => { if (t.kind === 'monster') { t.dormant = true; t.hp = t.maxHp; t.conds = []; } });
  c.turn.mode = 'explore';
  addLog(c, 'narration', 'Darkness... then candlelight. You wake on cots in a quiet shrine, bandaged and sore. Someone dragged you back to safety — but your purses are lighter.', { who: 'DM' });
  enterScene(c, start, null); buildExploreOrder(c); c.turn.index = 0; beginTurn(c);
}

function beginTurn(c) {
  c.turn.phase = 'act'; c.turn.pendingRoll = null; c.turn.startedAt = now(); c.turn.notified = 0;
  const e = currentEntry(c); if (!e) return;
  if (c.turn.mode !== 'combat') { c.turn.res = null; notify(c); return; }
  if (e.kind === 'pc') {
    const ch = c.characters[e.charId]; const t = tokenOfChar(c, ch?.id);
    if (!ch || ch.dead || !t) return advance(c);
    c.turn.res = freshRes(c, ch);
    tickConds(c, t);
    if (hasCond(c, t, 'prone')) { removeCond(c, t, 'prone'); c.turn.res.move = Math.floor(c.turn.res.move / 2); addLog(c, 'system', `${ch.name} stands up.`); }
    if (hasCond(c, t, 'restrained')) c.turn.res.move = 0;
    if (hasCond(c, t, 'slowed')) c.turn.res.move = Math.floor(c.turn.res.move / 2);
    if (ch.hp <= 0) {
      if (ch.stable) return advance(c);
      c.turn.phase = 'roll'; c.turn.pendingRoll = { charId: ch.id, label: 'Death Saving Throw', death: true, mod: 0 };
    } else if (isHelpless(c, t)) { addLog(c, 'system', `${ch.name} is ${hasCond(c, t, 'asleep') ? 'asleep' : 'paralyzed'} and loses the turn!`); return advance(c); }
    notify(c);
  } else {
    c.turn.phase = 'monster'; c.turn.res = null;
    if (H.aiActive(c) || !c.dmUserId || c.flags.autoMonsters !== false) { setTimeout(() => { try { runMonsterTurns(c); } catch (err) { console.error(err); } H.changed(c); }, MONSTER_DELAY); }
    else H.notifyDM(c, `${nameOfEntry(c, e)}'s turn.`);
  }
}
function advance(c) {
  if (c.status !== 'active') return;
  if (c.turn.mode === 'combat' && checkCombatEnd(c)) return;
  if (c.turn.mode === 'explore') buildExploreOrder(c);
  if (!c.turn.order.length) return;
  const wasIndex = c.turn.index;
  c.turn.index = (c.turn.index + 1) % c.turn.order.length;
  if (c.turn.index <= wasIndex) { c.turn.round++; if (c.turn.mode === 'combat' && H.aiActive(c) && c.turn.round % 2 === 0) H.queueAI(c, 'flavor', { what: `Round ${c.turn.round - 1} of the fight just ended. In ONE short dramatic sentence, describe the state of the battle.` }); }
  beginTurn(c);
}
function notify(c) { H.notifyTurn(c); }

// ---------------- pathing & movement ----------------
function pathTo(c, s, t, tx, ty, budget, opts = {}) {
  if (tx < 0 || ty < 0 || tx >= s.w || ty >= s.h) return null;
  const W = s.w; const dist = new Map(); const prev = new Map(); const key = (x, y) => y * W + x;
  const enemyAt = (x, y) => s.tokens.some(o => o.id !== t.id && !o.gone && o.x === x && o.y === y && (t.kind === 'pc' ? (o.kind === 'monster' && !o.dormant) || o.kind === 'npc' : o.kind === 'pc' || o.kind === 'npc'));
  const anyAt = (x, y) => occupied(s, x, y, t.id); const sw = canSwim(c, t);
  const start = key(t.x, t.y); dist.set(start, 0); const q = [[0, t.x, t.y]];
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]); const [d, x, y] = q.shift(); if (d > (dist.get(key(x, y)) ?? 1e9)) continue;
    if (x === tx && y === ty) break;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      if (!walkable(s, nx, ny, sw) || enemyAt(nx, ny)) continue;
      if (dx && dy && (!walkable(s, x + dx, y, sw) || !walkable(s, x, y + dy, sw))) continue; // no corner cutting
      if (t.kind === 'pc' && s.seen[key(nx, ny)] !== '1' && !(nx === tx && ny === ty && opts.allowUnseen)) continue;
      if (t.kind === 'pc' && !opts.intoTrap && s.pois.some(p => p.type === 'trap' && !p.hidden && !p.disarmed && p.x === nx && p.y === ny) && !(nx === tx && ny === ty)) continue;
      const step = MG.DIFFICULT.has(tileAt(s, nx, ny)) ? 2 : 1; const nd = d + step; if (budget != null && nd > budget) continue;
      if (nd < (dist.get(key(nx, ny)) ?? 1e9)) { dist.set(key(nx, ny), nd); prev.set(key(nx, ny), key(x, y)); q.push([nd, nx, ny]); }
    }
  }
  const end = key(tx, ty); if (!dist.has(end)) return null;
  if (anyAt(tx, ty)) return null;
  const path = []; let k = end; while (k !== start) { path.unshift([k % W, Math.floor(k / W)]); k = prev.get(k); }
  return { path, cost: dist.get(end) };
}
// Moves a PC step by step: triggers traps, wakes encounters. Returns {path, stopped}
function walk(c, t, path) {
  const s = scene(c); const walked = [];
  for (const [x, y] of path) {
    if (x > t.x) t.facing = 1; else if (x < t.x) t.facing = -1;
    t.x = x; t.y = y; walked.push([x, y]);
    const trap = s.pois.find(p => p.type === 'trap' && !p.disarmed && !p.triggered && p.x === x && p.y === y);
    if (trap) { springTrap(c, t, trap); break; }
    if (updateVision(c)) break;
  }
  return walked;
}
function springTrap(c, t, trap) {
  const ch = charOfToken(c, t); trap.triggered = true; trap.hidden = false; trap.found = true;
  const r = d20(null, ch?.race === 'Halfling'); const total = r.pick + (ch ? saveMod(ch, trap.save || 'dex') : 0);
  const dmg = rollDice(trap.dmg || '1d6').total; const ok = total >= trap.dc;
  addLog(c, 'alert', `⚠️ ${t.name} triggers a ${trap.name}! ${R.ABILITY_NAMES[trap.save || 'dex']} save: ${r.pick}${fmtMod(total - r.pick)} = ${total} vs DC ${trap.dc} — ${ok ? `dodges half (${Math.floor(dmg / 2)} damage)` : `${dmg} damage!`}`, { fx: { k: 'trap', t: t.id, dmg: ok ? Math.floor(dmg / 2) : dmg } });
  damage(c, t, ok ? Math.floor(dmg / 2) : dmg, 'piercing');
  if (trap.alarm) { const s = scene(c); const enc = s.tokens.find(m => m.kind === 'monster' && m.dormant && !m.disguise); if (enc) { addLog(c, 'alert', '🔔 A bell jangles somewhere in the dark! Something heard that...'); wakeEncounter(c, enc.enc, 'monsters'); } }
}
const fmtMod = (n) => (n >= 0 ? '+' : '') + n;

// ---------------- attacks ----------------
function weaponAbility(ch, w) { if (w.ab === 'fin') return ch.scores.dex >= ch.scores.str ? 'dex' : 'str'; if (ch.class === 'Monk' && (w.k === 'unarmed' || w.k === 'shortsword') && ch.scores.dex > ch.scores.str) return 'dex'; return w.ab; }
function weaponDice(ch, w) { if (ch.class === 'Monk' && (w.k === 'unarmed')) return ch.level >= 5 ? '1d6' : '1d4'; return w.dice; }
function attackRollMods(c, att, tgt, ranged) {
  let a = 0, d = 0; const notes = [];
  if (hasCond(c, att, 'hidden')) { a++; notes.push('hidden'); }
  if (hasCond(c, att, 'helped')) { a++; notes.push('helped'); }
  if (hasCond(c, att, 'reckless')) a++;
  if (['poisoned', 'frightened', 'restrained', 'prone'].some(k => hasCond(c, att, k))) { d++; notes.push('hampered'); }
  if (hasCond(c, att, 'mocked')) { d++; notes.push('mocked'); }
  if (hasCond(c, tgt, 'prone')) { if (ranged) d++; else a++; }
  if (['restrained', 'paralyzed', 'asleep', 'outlined', 'lit'].some(k => hasCond(c, tgt, k))) a++;
  if (hasCond(c, tgt, 'reckless')) a++;
  if (hasCond(c, tgt, 'dodging')) d++;
  if (att.kind === 'monster' && hasCond(c, tgt, 'hidden')) { d++; notes.push('can\'t see them'); }
  if (ranged) { const s = scene(c); const foes = s.tokens.filter(o => !o.gone && o.id !== att.id && cheb(o, att) <= 1 && (att.kind === 'pc' ? o.kind === 'monster' && !o.dormant && o.hp > 0 && !isHelpless(c, o) : o.kind === 'pc' && isUp(c, o))); if (foes.length) { d++; notes.push('enemy adjacent'); } }
  if (att.kind === 'pc') { const ach = charOfToken(c, att); if (ach && ach.features.includes('pack_tactics_pc') && scene(c).tokens.some(o => o.kind === 'pc' && o.id !== att.id && isUp(c, o) && cheb(o, tgt) <= 1)) { a++; notes.push('pack tactics'); } }
  if (att.kind === 'monster') { const traits = R.BESTIARY[att.mkey]?.traits || []; if (traits.includes('pack_tactics') && scene(c).tokens.some(o => o.kind === 'monster' && o.id !== att.id && !o.gone && !o.dormant && cheb(o, tgt) <= 1)) { a++; notes.push('pack tactics'); } }
  return { adv: advOf(a, d), notes };
}
function consumeAttackConds(c, att, tgt) { removeCond(c, att, 'hidden'); removeCond(c, att, 'helped'); removeCond(c, att, 'mocked'); removeCond(c, tgt, 'lit'); }

// PC weapon attack
function pcAttack(c, ch, t, tgt, w, opts = {}) {
  const ranged = !!w.ranged || (w.range && cheb(t, tgt) > 1);
  const ab = weaponAbility(ch, w); const m = R.mod(ch.scores[ab]);
  const hitB = m + R.prof(ch.level) + (w.plus || 0);
  const mods = attackRollMods(c, t, tgt, ranged);
  let adv = opts.adv || mods.adv; if (opts.adv && mods.adv && opts.adv !== mods.adv) adv = null;
  const r = d20(adv, ch.race === 'Halfling');
  let bonus = 0, bonusTxt = '';
  if (hasCond(c, t, 'blessed')) { const b = rollDice('1d4').total; bonus += b; bonusTxt += ` +${b} bless`; }
  const insp = condsOf(c, t).find(x => x.k === 'inspired'); if (insp) { const b = rollDice('1d6').total; bonus += b; bonusTxt += ` +${b} inspiration`; removeCond(c, t, 'inspired'); }
  const total = r.pick + hitB + bonus; const ac = acOf(c, tgt);
  const autoCrit = isHelpless(c, tgt) && cheb(t, tgt) <= 1;
  const crit = r.pick === 20 || (autoCrit && r.pick !== 1 && total >= ac); const hit = r.pick !== 1 && (crit || total >= ac);
  consumeAttackConds(c, t, tgt);
  let dmg = 0; const parts = [];
  if (hit) {
    const base = rollDice(weaponDice(ch, w), crit); dmg = base.total + (opts.offhand && m > 0 ? 0 : m) + (w.plus || 0); parts.push(`${base.total}${fmtMod((opts.offhand && m > 0 ? 0 : m) + (w.plus || 0))}`);
    if (crit && ch.race === 'Half-Orc' && !ranged) { const e = rollDice(weaponDice(ch, w)).total; dmg += e; parts.push(`${e} savage`); }
    if (hasCond(c, t, 'raging') && !ranged && ab === 'str') { dmg += 2; parts.push('2 rage'); }
    if (ch.features.includes('fury_small') && !ch.uses.fury_small) { ch.uses.fury_small = 1; dmg += ch.level; parts.push(`${ch.level} fury of the small`); }
    if (ch.features.includes('surprise_attack') && c.turn.mode === 'combat' && c.turn.round === 1 && !c.turn.res?.surprise) { if (c.turn.res) c.turn.res.surprise = true; const e = rollDice('2d6', crit).total; dmg += e; parts.push(`${e} surprise attack`); }
    if (ch.equip.armor == null && false) { }
    const hx = condsOf(c, tgt).find(x => (x.k === 'hexed' || x.k === 'marked') && x.src === t.id); if (hx) { const e = rollDice('1d6', crit).total; dmg += e; parts.push(`${e} ${hx.k === 'hexed' ? 'hex' : 'mark'}`); }
    if (w.extra && (!w.extra.vs || (w.extra.vs === 'undead' && isUndead(tgt)))) { const e = rollDice(w.extra.dice, crit).total; dmg += e; parts.push(`${e} ${w.extra.type}`); }
    if (ch.features.includes('sneak_attack') && !c.turn.res.sneak && (w.ab === 'fin' || w.ranged) && adv !== 'dis') {
      const ally = scene(c).tokens.some(o => o.kind === 'pc' && o.id !== t.id && isUp(c, o) && cheb(o, tgt) <= 1);
      if (adv === 'adv' || ally) { const e = rollDice(`${Math.ceil(ch.level / 2)}d6`, crit).total; dmg += e; parts.push(`${e} sneak attack`); c.turn.res.sneak = true; }
    }
    if (opts.smite && ch.features.includes('divine_smite') && !ranged) {
      const sl = ch.slots.findIndex(s => s.max - s.used > 0);
      if (sl >= 0) { ch.slots[sl].used++; const e = rollDice(`${2 + sl + (isUndead(tgt) ? 1 : 0)}d8`, crit).total; dmg += e; parts.push(`${e} divine smite`); }
    }
  }
  const txt = `${ch.name} ${ranged ? 'shoots' : 'attacks'} ${tgt.name} with ${w.name}: 🎲 ${r.rolls.join('/')}${fmtMod(hitB)}${bonusTxt} = ${total} vs AC ${ac}${mods.notes.length ? ` (${mods.notes.join(', ')})` : ''} — ${!hit ? (r.pick === 1 ? 'natural 1, miss!' : 'miss!') : crit ? `CRITICAL HIT! ${dmg} damage!` : `hit! ${dmg} damage`}${hit && parts.length > 1 ? ` (${parts.join(' + ')})` : ''}`;
  addLog(c, 'roll', txt, { who: ch.name, uid: ch.ownerId, fx: { k: 'atk', a: t.id, t: tgt.id, d20: r.rolls, pick: r.pick, tot: total, hit, crit, dmg, ranged: !!ranged } });
  if (dmg) damage(c, tgt, dmg, w.type, { attack: true, weapon: true, magic: !!w.magic || !!w.plus, crit, attacker: t, melee: !ranged });
  return { hit, crit, dmg };
}

// Monster attack
function monsterAttack(c, m, tgt, a) {
  const ranged = (a.range || 1) > 1 && cheb(m, tgt) > 1;
  const mods = attackRollMods(c, m, tgt, ranged);
  const r = d20(mods.adv); const total = r.pick + a.hit; const ac = acOf(c, tgt);
  const crit = r.pick === 20 || (isHelpless(c, tgt) && cheb(m, tgt) <= 1 && total >= ac); const hit = r.pick !== 1 && (crit || total >= ac);
  consumeAttackConds(c, m, tgt);
  let dmg = 0; let extraTxt = '';
  if (hit) {
    dmg = Math.max(1, rollDice(a.dmg, crit).total);
    if (a.extra) { let e = rollDice(a.extra.dice, crit).total; if (a.extra.save) { const ch = charOfToken(c, tgt); const sv = d20().pick + (ch ? saveMod(ch, a.extra.save) : 0); if (sv >= a.extra.dc) e = Math.floor(e / 2); } dmg += e; extraTxt = ` (+${e} ${a.extra.type})`; }
  }
  addLog(c, 'roll', `${m.name} ${ranged ? 'fires at' : 'attacks'} ${tgt.name} (${a.n}): 🎲 ${r.rolls.join('/')}${fmtMod(a.hit)} = ${total} vs AC ${ac}${mods.notes.length ? ` (${mods.notes.join(', ')})` : ''} — ${!hit ? 'miss!' : crit ? `CRITICAL! ${dmg} damage!` : `hit for ${dmg}${extraTxt}`}`, { who: m.name, fx: { k: 'atk', a: m.id, t: tgt.id, d20: r.rolls, pick: r.pick, tot: total, hit, crit, dmg, ranged } });
  if (hit) {
    damage(c, tgt, dmg, a.type, { attack: true, crit, attacker: m, melee: !ranged });
    if (a.save && isAlive(c, tgt)) { const ch = charOfToken(c, tgt); if (!(a.save.notElf && ch && ch.race === 'Elf')) { const sv = d20().pick + (ch ? saveMod(ch, a.save.ab) : 0); if (sv < a.save.dc) { addCond(c, tgt, a.save.cond, a.save.rounds || 1, m.id); addLog(c, 'system', `${tgt.name} is ${R.CONDITIONS[a.save.cond]?.name.toLowerCase() || a.save.cond}! (${R.ABILITY_NAMES[a.save.ab]} save ${sv} vs DC ${a.save.dc})`); } } }
  }
  return hit;
}

// ---------------- monster AI ----------------
function runMonsterTurns(c) {
  let guard = 0;
  while (c.status === 'active' && c.turn.mode === 'combat' && guard++ < 30) {
    const e = currentEntry(c); if (!e || e.kind !== 'monster') break;
    const m = scene(c).tokens.find(x => x.id === e.tokenId);
    if (m && !m.gone && m.hp > 0) monsterTurn(c, m);
    if (checkCombatEnd(c)) return;
    c.turn.index = (c.turn.index + 1) % c.turn.order.length; if (c.turn.index === 0) { c.turn.round++; }
    const nx = currentEntry(c); if (nx && nx.kind === 'pc') { beginTurn(c); return; }
  }
  if (c.turn.mode === 'combat') beginTurn(c);
}
function monsterTurn(c, m) {
  const s = scene(c); const M = R.BESTIARY[m.mkey] || {}; tickConds(c, m);
  if (M.regen && m.hp > 0 && m.hp < m.maxHp) { if (m.noRegen != null && m.noRegen >= c.turn.round - 1) { addLog(c, 'system', `🔥 ${m.name}'s wounds smoke — it can't regenerate!`); m.noRegen = null; } else { const h = Math.min(M.regen, m.maxHp - m.hp); m.hp += h; addLog(c, 'system', `🩸 ${m.name}'s wounds knit closed (+${h} HP).`, { fx: { k: 'heal', t: m.id, amt: h } }); } }
  if (isHelpless(c, m)) { addLog(c, 'system', `${m.name} is ${hasCond(c, m, 'asleep') ? 'fast asleep 💤' : 'paralyzed'}.`); return; }
  const pcs = s.tokens.filter(t => t.kind === 'pc' && isUp(c, t));
  if (!pcs.length) return;
  let speed = M.speed || 6; if (hasCond(c, m, 'restrained')) speed = 0; if (hasCond(c, m, 'slowed')) speed = Math.floor(speed / 2);
  if (hasCond(c, m, 'prone')) { removeCond(c, m, 'prone'); speed = Math.floor(speed / 2); }
  // charmed: do nothing hostile
  if (hasCond(c, m, 'charmed')) { addLog(c, 'system', `💗 ${m.name} looks at you fondly and won't attack.`); return; }
  // fleeing
  const afraid = hasCond(c, m, 'frightened') || hasCond(c, m, 'turned');
  const cowardly = (M.traits || []).includes('cowardly') && m.hp <= m.maxHp * 0.3 && !m.boss;
  if (afraid || cowardly) {
    const nearest = pcs.reduce((a, b) => cheb(a, m) < cheb(b, m) ? a : b);
    let best = null, bd = cheb(nearest, m);
    for (let dy = -speed; dy <= speed; dy++) for (let dx = -speed; dx <= speed; dx++) { const x = m.x + dx, y = m.y + dy; if (!walkable(s, x, y) || occupied(s, x, y, m.id)) continue; const p = pathTo(c, s, m, x, y, speed); if (!p) continue; const d = Math.min(...pcs.map(p2 => Math.max(Math.abs(p2.x - x), Math.abs(p2.y - y)))); if (d > bd) { bd = d; best = [x, y]; } }
    if (best) { m.x = best[0]; m.y = best[1]; }
    addLog(c, 'system', afraid ? `😱 ${m.name} flees in terror!` : `🏃 ${m.name} tries to run away!`, { fx: { k: 'move', t: m.id } });
    if (cowardly && !afraid && bd >= 6 && rnd(2) === 0) { addLog(c, 'system', `${m.name} escapes into the dark!`); m.gone = true; s.tokens = s.tokens.filter(x => x.id !== m.id); const i = c.turn.order.findIndex(e => e.tokenId === m.id); if (i >= 0) { c.turn.order.splice(i, 1); if (i <= c.turn.index) c.turn.index--; } }
    return;
  }
  // specials
  for (const sp of (M.special || [])) {
    if (sp.at) continue;
    if (sp.once && m.used[sp.n]) continue;
    if (m.recharge[sp.n] === false) { if (1 + rnd(6) >= (sp.recharge || 6)) m.recharge[sp.n] = true; else continue; }
    if (sp.kind === 'summon') { if (rnd(3) === 0) { m.used[sp.n] = 1; m.recharge[sp.n] = false; summon(c, m, sp); return; } continue; }
    if (sp.kind === 'save') {
      const center = sp.self ? m : pcs.reduce((a, b) => cheb(a, m) < cheb(b, m) ? a : b);
      if (!sp.self && cheb(center, m) > (sp.range || 6)) continue;
      const hits = pcs.filter(p => cheb(p, center) <= (sp.radius || 0));
      if (hits.length < (sp.radius ? (m.boss ? 1 : 2) : 1)) continue;
      m.recharge[sp.n] = false; if (sp.once) m.used[sp.n] = 1;
      addLog(c, 'alert', `${m.name} uses ${sp.n}!`, { fx: { k: 'blast', x: center.x, y: center.y, r: sp.radius || 0, from: m.id } });
      hits.forEach(p => { const ch = charOfToken(c, p); const sv = d20(null, ch?.race === 'Halfling').pick + (ch ? saveMod(ch, sp.save) : 0); const ok = sv >= sp.dc; let dmg = sp.dice ? rollDice(sp.dice).total : 0; if (ok) dmg = sp.half ? Math.floor(dmg / 2) : 0;
        addLog(c, 'roll', `${p.name} ${R.ABILITY_NAMES[sp.save]} save ${sv} vs DC ${sp.dc} — ${ok ? 'resists' : 'fails'}${dmg ? `, ${dmg} ${sp.type || ''} damage` : ''}`, { fx: { k: 'dmg', t: p.id, dmg } });
        if (dmg) damage(c, p, dmg, sp.type || 'force'); if (!ok && sp.cond && isAlive(c, p)) addCond(c, p, sp.cond, sp.rounds || 1, m.id); });
      return;
    }
    if (sp.kind === 'attack') { const tgt = pcs.filter(p => cheb(p, m) <= (sp.range || 6) && !hasCond(c, p, sp.cond))[0]; if (!tgt) continue; m.recharge[sp.n] = false; const r = d20().pick + sp.hit; const ac = acOf(c, tgt); if (r >= ac) { let dm = 0; if (sp.dmg) dm = damage(c, tgt, rollDice(sp.dmg).total, sp.type || 'bludgeoning', { attack: true, attacker: m }); if (sp.cond) addCond(c, tgt, sp.cond, sp.rounds || 1, m.id); addLog(c, 'roll', `${m.name} uses ${sp.n} on ${tgt.name}: ${r} vs AC ${ac} — hit${dm ? ` for ${dm} ${sp.type || ''}` : ''}${sp.cond ? `, ${tgt.name} is ${R.CONDITIONS[sp.cond]?.name.toLowerCase()}` : ''}!`, { fx: { k: 'atk', a: m.id, t: tgt.id, hit: true, dmg: dm, ranged: cheb(tgt, m) > 1 } }); } else addLog(c, 'roll', `${m.name} uses ${sp.n} on ${tgt.name}: ${r} vs AC ${ac} — miss!`, { fx: { k: 'atk', a: m.id, t: tgt.id, hit: false, ranged: true } }); return; }
  }
  // choose a target: reachable, prefer wounded/low AC; bosses prefer casters
  const melee = (M.att || []).filter(a => (a.range || 1) <= 1); const rangedAtt = (M.att || []).filter(a => (a.range || 1) > 1);
  const score = (p) => cheb(p, m) * 2 + hpOf(c, p) / 4 + acOf(c, p) / 3 + (hasCond(c, p, 'hidden') ? 12 : 0) + (canSwim(c, p) && tileAt(scene(c), p.x, p.y) === '~' ? 8 : 0) - (m.boss && ['Wizard', 'Sorcerer', 'Cleric'].includes(charOfToken(c, p)?.class) ? 3 : 0);
  const ordered = pcs.slice().sort((a, b) => score(a) - score(b));
  let tgt = ordered[0];
  // ranged monsters keep distance if they can
  if (rangedAtt.length && (!melee.length || (cheb(tgt, m) > 1 && cheb(tgt, m) <= rangedAtt[0].range))) {
    const inRange = ordered.find(p => cheb(p, m) <= rangedAtt[0].range && cheb(p, m) > 1);
    if (inRange && (!melee.length || cheb(inRange, m) > 2)) { tgt = inRange; doAttacks(c, m, tgt, rangedAtt, M); return; }
  }
  // move toward target (adjacent square)
  if (cheb(tgt, m) > 1 && speed > 0) {
    let best = null;
    for (const p of ordered) {
      const spots = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const x = p.x + dx, y = p.y + dy; if (walkable(s, x, y) && !occupied(s, x, y, m.id)) spots.push([x, y]); }
      for (const [x, y] of spots) { const path = pathTo(c, s, m, x, y, null); if (path && (!best || path.cost < best.cost)) best = Object.assign(path, { tgt: p }); }
      if (best && best.tgt === p) break;
    }
    if (best) {
      tgt = best.tgt; let spent = 0; const steps = [];
      for (const [x, y] of best.path) { const cost = MG.DIFFICULT.has(tileAt(s, x, y)) ? 2 : 1; if (spent + cost > speed) break; spent += cost; if (x !== m.x) m.facing = x > m.x ? 1 : -1; m.x = x; m.y = y; steps.push([x, y]); }
      if (steps.length) addLog(c, 'move', '', { fx: { k: 'move', t: m.id, path: steps } });
    }
  }
  if (cheb(tgt, m) <= 1 && melee.length) doAttacks(c, m, tgt, melee, M);
  else if (rangedAtt.length) { const p = pcs.find(p2 => cheb(p2, m) <= rangedAtt[0].range); if (p) doAttacks(c, m, p, rangedAtt, M); else addLog(c, 'system', `${m.name} closes in.`); }
  else addLog(c, 'system', `${m.name} closes in.`);
}
function doAttacks(c, m, tgt, atts, M) {
  const n = M.multi || 1; const list = M.multiAll ? atts.concat((M.att || []).filter(a => !atts.includes(a) && (a.range || 1) <= 1)).slice(0, n) : Array(n).fill(atts[0]);
  for (const a of list) { if (!isUp(c, tgt)) { const s = scene(c); const other = s.tokens.find(p => p.kind === 'pc' && isUp(c, p) && cheb(p, m) <= (a.range || 1)); if (!other) break; tgt = other; } monsterAttack(c, m, tgt, a); }
}

// simple autopilot for a PC (used by the DM's "auto-play" button)
function autoHero(c, ch) {
  const t = tokenOfChar(c, ch.id); const s = scene(c); if (!t || ch.hp <= 0) return;
  if (ch.hp < ch.maxHp * 0.35) { const i = invFind(ch, 'potion_healing'); if (i >= 0 && c.turn.res.bonus) { useItem(c, ch, t, i, null); } }
  const foes = activeMonsters(c); if (!foes.length) return;
  const ranged = ch.weapons.find(w => w.ranged); const melee = ch.weapons.find(w => !w.ranged) || ch.weapons[0];
  let tgt = foes.reduce((a, b) => cheb(a, t) < cheb(b, t) ? a : b);
  if (ranged && cheb(tgt, t) > 1 && cheb(tgt, t) <= ranged.range) { pcAttack(c, ch, t, tgt, ranged); return; }
  if (cheb(tgt, t) > 1) { let best = null; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const p = pathTo(c, s, t, tgt.x + dx, tgt.y + dy, c.turn.res.move); if (p && (!best || p.cost < best.cost)) best = p; } if (best) walk(c, t, best.path); }
  if (cheb(tgt, t) <= 1 && tgt.hp > 0) { for (let i = 0; i < attacksPerAction(ch) && tgt.hp > 0; i++) pcAttack(c, ch, t, tgt, melee); }
  else addLog(c, 'system', `${ch.name} moves up.`);
}

// ---------------- spells ----------------
function slotFor(ch, lvl, want) {
  if (lvl === 0) return 0;
  if (want) { const s = ch.slots[want - 1]; if (s && s.max - s.used > 0 && want >= lvl) return want; return -1; }
  for (let i = lvl - 1; i < ch.slots.length; i++) if (ch.slots[i] && ch.slots[i].max - ch.slots[i].used > 0) return i + 1;
  return -1;
}
function upDice(dice, extra) { if (!extra) return dice; const p = R.parseDice(dice); return `${p.n + extra}d${p.s}${p.b ? fmtMod(p.b) : ''}`; }
function castSpell(c, ch, t, key, target, opts = {}) {
  const S = R.SPELLS[key]; if (!S) return { error: 'Unknown spell' };
  const s = scene(c);
  const slot = opts.free ? S.lvl : slotFor(ch, S.lvl, opts.slot);
  if (slot < 0) return { error: `No level ${S.lvl}+ spell slots left` };
  const up = Math.max(0, slot - S.lvl);
  const atkB = opts.atk != null ? opts.atk : spellAtk(ch); const dc = opts.dc != null ? opts.dc : spellDC(ch); const castM = R.mod(ch.scores[ch.castAb || 'int']);
  // targets
  let tgts = [];
  const foes = s.tokens.filter(o => o.kind === 'monster' && !o.dormant && !o.gone && o.hp > 0);
  const allies = s.tokens.filter(o => o.kind === 'pc' && isAlive(c, o));
  if (S.target === 'enemy') { const tg = s.tokens.find(o => o.id === target?.id); if (!tg || tg.kind !== 'monster') return { error: 'Pick an enemy' }; if (cheb(t, tg) > (S.range || 1)) return { error: `Out of range (${S.range} squares)` }; tgts = [tg]; }
  else if (S.target === 'ally') { const tg = s.tokens.find(o => o.id === (target?.id || t.id)); if (!tg || tg.kind !== 'pc') return { error: 'Pick a hero' }; if (cheb(t, tg) > (S.range || 1)) return { error: `Too far — ${S.range === 1 ? 'you must touch them' : S.range + ' squares'}` }; tgts = [tg]; }
  else if (S.target === 'allies') { tgts = allies.filter(o => cheb(o, t) <= S.range).sort((a, b) => hpOf(c, a) / maxHpOf(c, a) - hpOf(c, b) / maxHpOf(c, b)).slice(0, (S.count || 3) + up); }
  else if (S.target === 'self') { tgts = S.radius ? foes.filter(o => cheb(o, t) <= S.radius) : [t]; }
  else if (S.target === 'area') { const x = target?.x, y = target?.y; if (x == null) return { error: 'Pick a spot' }; if (cheb(t, { x, y }) > S.range) return { error: 'Out of range' }; tgts = foes.filter(o => cheb(o, { x, y }) <= S.radius); if (!tgts.length && S.kind !== 'sleep') return { error: 'No enemies in that area' }; }
  else if (S.target === 'tile') { const x = target?.x, y = target?.y; if (x == null || !walkable(s, x, y) || occupied(s, x, y, t.id) || cheb(t, { x, y }) > S.range || s.seen[y * s.w + x] !== '1') return { error: 'Pick an open square you can see within 6' }; }
  if (slot > 0 && !opts.free) ch.slots[slot - 1].used++;
  const fx = { k: 'spell', a: t.id, name: S.name, spell: key, t: tgts.map(x => x.id), x: target?.x, y: target?.y, r: S.radius || 0, type: S.type || S.kind };
  const lines = [];
  const dmgDice = (d) => S.scale ? R.cantripDice(d, ch.level) : upDice(d, up);
  if (S.kind === 'attack') {
    const n = (S.rays || 1) + (S.rays ? up : 0);
    for (let i = 0; i < n; i++) {
      const tg = tgts[0]; if (!tg || tg.gone) break;
      const mods = attackRollMods(c, t, tg, S.range > 1); const r = d20(mods.adv, ch.race === 'Halfling'); let b = 0; if (hasCond(c, t, 'blessed')) b += rollDice('1d4').total;
      const tot = r.pick + atkB + b; const ac = acOf(c, tg); const crit = r.pick === 20; const hit = r.pick !== 1 && (crit || tot >= ac); consumeAttackConds(c, t, tg);
      let dmg = 0; if (hit) { dmg = rollDice(dmgDice(S.dice), crit).total + (S.addMod ? castM : 0); const hx = condsOf(c, tg).find(x => x.k === 'hexed' && x.src === t.id); if (hx) dmg += rollDice('1d6').total; }
      lines.push(`${tg.name}: 🎲 ${r.rolls.join('/')}${fmtMod(atkB)} = ${tot} vs AC ${ac} — ${hit ? (crit ? `CRIT! ${dmg}` : `${dmg}`) + ' ' + (S.type || '') + ' damage' : 'miss'}`);
      fx.hit = hit; fx.dmg = (fx.dmg || 0) + dmg;
      if (dmg) damage(c, tg, dmg, S.type, { crit, magic: true });
      if (hit && S.cond && !tg.gone) addCond(c, tg, S.cond, S.rounds || 1, t.id);
      if (hit && S.pull && !tg.gone) { for (let k = 0; k < S.pull; k++) { const nx = tg.x + Math.sign(t.x - tg.x), ny = tg.y + Math.sign(t.y - tg.y); if (cheb({ x: nx, y: ny }, t) >= 1 && walkable(s, nx, ny) && !occupied(s, nx, ny, tg.id)) { tg.x = nx; tg.y = ny; } } }
    }
  } else if (S.kind === 'save') {
    tgts.forEach(tg => {
      const sv = d20().pick + monsterSave(tg, S.save); const ok = sv >= dc; let dice = S.dice; if (S.woundedDice && tg.hp < tg.maxHp) dice = S.woundedDice;
      let dmg = rollDice(dmgDice(dice)).total; if (ok) dmg = S.half ? Math.floor(dmg / 2) : 0;
      lines.push(`${tg.name} ${S.save.toUpperCase()} save ${sv} vs DC ${dc} — ${ok ? (dmg ? `half: ${dmg}` : 'dodges it') : `${dmg} ${S.type || ''} damage`}`);
      fx.dmg = (fx.dmg || 0) + dmg;
      if (dmg) damage(c, tg, dmg, S.type, { magic: true });
      if (!ok && !tg.gone) { if (S.cond) addCond(c, tg, S.cond, S.rounds || 1, t.id); if (S.push) { for (let k = 0; k < S.push; k++) { const nx = tg.x + Math.sign(tg.x - t.x), ny = tg.y + Math.sign(tg.y - t.y); if (walkable(s, nx, ny) && !occupied(s, nx, ny, tg.id)) { tg.x = nx; tg.y = ny; } } } }
    });
  } else if (S.kind === 'auto') {
    const n = (S.darts || 1) + up; let total = 0; const tg = tgts[0];
    for (let i = 0; i < n && !tg.gone; i++) { const d = rollDice(S.dice).total; total += d; }
    lines.push(`${n} glowing darts slam into ${tg.name} for ${total} force damage`); fx.dmg = total; fx.hit = true; damage(c, tg, total, 'force', { magic: true });
  } else if (S.kind === 'heal') {
    tgts.forEach(tg => { const amt = rollDice(upDice(S.dice, up)).total + (S.addMod ? castM : 0); const got = heal(c, tg, Math.max(1, amt)); lines.push(`${tg.name} heals ${got} HP`); fx.heal = (fx.heal || 0) + got; });
  } else if (S.kind === 'buff') {
    tgts.forEach(tg => { addCond(c, tg, S.cond, S.rounds || 10, t.id); if (S.temp) { const cht = charOfToken(c, tg); if (cht) cht.temp = Math.max(cht.temp || 0, S.temp + up * 5); } lines.push(`${tg.name} is ${R.CONDITIONS[S.cond]?.name || S.cond}`); });
  } else if (S.kind === 'debuff') {
    tgts.forEach(tg => {
      if (S.humanoid && !isHumanoid(tg)) { lines.push(`${tg.name} isn't humanoid — no effect`); return; }
      if (!S.noSave) { const sv = d20().pick + monsterSave(tg, S.save); if (sv >= dc) { lines.push(`${tg.name} resists (${S.save.toUpperCase()} ${sv} vs DC ${dc})`); return; } }
      if (S.cond === 'hexed' || S.cond === 'marked') scene(c).tokens.forEach(o => { if (o.conds) o.conds = o.conds.filter(x => !(x.k === S.cond && x.src === t.id)); });
      addCond(c, tg, S.cond, S.rounds || 1, t.id); lines.push(`${tg.name} is ${R.CONDITIONS[S.cond]?.name.toLowerCase() || S.cond}!`);
    });
  } else if (S.kind === 'sleep') {
    let pool = rollDice(upDice(S.dice, up * 2)).total; const start = pool;
    const cands = s.tokens.filter(o => o.kind === 'monster' && !o.dormant && !o.gone && cheb(o, target) <= S.radius && !isUndead(o) && !hasCond(c, o, 'asleep')).sort((a, b) => a.hp - b.hp);
    const slept = []; for (const o of cands) { if (o.hp > pool) break; pool -= o.hp; addCond(c, o, 'asleep', 10, t.id); slept.push(o.name); }
    fx.t = cands.filter(o => slept.includes(o.name)).map(o => o.id);
    lines.push(slept.length ? `💤 ${slept.join(', ')} fall${slept.length === 1 ? 's' : ''} asleep! (${start} HP of sleep)` : `The sleep magic (${start} HP) isn't enough for anything there.`);
  } else if (S.kind === 'teleport') {
    t.x = target.x; t.y = target.y; lines.push(`${ch.name} vanishes in silver mist and reappears`); updateVision(c);
  } else if (S.kind === 'utility') {
    if (S.item) { invAdd(ch, S.item, null, S.qty || 1); lines.push(`${ch.name} conjures ${S.qty} goodberries`); }
    if (S.reveal) { let found = 0; s.pois.forEach(p => { if (p.hidden && cheb(p, t) <= 6) { p.hidden = false; p.found = true; found++; } }); s.tokens.forEach(o => { if (o.disguise && cheb(o, t) <= 6) { o.revealed = true; found++; } }); lines.push(found ? `✨ ${ch.name} senses ${found} hidden thing${found > 1 ? 's' : ''} nearby!` : 'No hidden magic nearby.'); }
  }
  addLog(c, 'spell', `✨ ${ch.name} casts ${S.name}${slot > 0 ? ` (level ${slot})` : ''}${lines.length ? ': ' + lines.join('; ') : ''}`, { who: ch.name, uid: ch.ownerId, fx });
  return { ok: true };
}
function monsterSave(t, ab) { if (t.kind === 'pc') return 0; const M = R.BESTIARY[t.mkey] || {}; let b = M.boss ? 4 : 1; if ((M.size || 1) > 1 && (ab === 'str' || ab === 'con')) b += 2; if (M.type === 'undead' && ab === 'wis') b += 1; if (ab === 'dex' && M.type === 'ooze') b -= 2; return b; }

// ---------------- items ----------------
function useItem(c, ch, t, idx, target) {
  const it = ch.inventory[idx]; if (!it) return { error: 'No such item' }; const I = R.ITEMS[it.k];
  if (!I || !I.use) return { error: `${it.n} can't be used like that` };
  const s = scene(c);
  if (I.use === 'heal') { const tg = target ? s.tokens.find(o => o.id === target.id && o.kind === 'pc') : t; if (!tg) return { error: 'Pick a hero' }; if (cheb(tg, t) > 1) return { error: 'You must be next to them' }; const amt = rollDice(I.dice).total; const got = heal(c, tg, amt); invRemove(ch, idx); addLog(c, 'item', `${I.icon} ${ch.name} ${tg.id === t.id ? 'drinks' : 'pours'} ${I.name}${tg.id === t.id ? '' : ' into ' + tg.name + "'s mouth"} — +${got} HP`, { who: ch.name, fx: { k: 'heal', t: tg.id, amt: got } }); return { ok: true, cost: tg.id === t.id ? (I.cast || 'action') : 'action' }; }
  if (I.use === 'buff') { addCond(c, t, I.cond, I.rounds || 10); if (I.temp) ch.temp = Math.max(ch.temp || 0, I.temp); invRemove(ch, idx); addLog(c, 'item', `${I.icon} ${ch.name} drinks ${I.name} and feels heroic!`, { who: ch.name, fx: { k: 'heal', t: t.id, amt: 0 } }); return { ok: true, cost: 'action' }; }
  if (I.use === 'cure') { removeCond(c, t, I.cure); invRemove(ch, idx); addLog(c, 'item', `${I.icon} ${ch.name} drinks ${I.name}.`); return { ok: true, cost: 'action' }; }
  if (I.use === 'throw') {
    const tg = target && s.tokens.find(o => o.id === target.id && o.kind === 'monster'); if (!tg) return { error: 'Pick a target' }; if (cheb(tg, t) > I.range) return { error: `Out of range (${I.range})` };
    invRemove(ch, idx); const r = d20(attackRollMods(c, t, tg, true).adv); const tot = r.pick + R.mod(ch.scores.dex) + R.prof(ch.level); const hit = r.pick !== 1 && tot >= acOf(c, tg);
    const ok = !I.undeadOnly || isUndead(tg); const dmg = hit && ok ? rollDice(I.dice).total : 0;
    addLog(c, 'roll', `${I.icon} ${ch.name} throws ${I.name} at ${tg.name}: 🎲 ${r.pick}${fmtMod(tot - r.pick)} = ${tot} — ${hit ? (ok ? `${dmg} ${I.type} damage!` : 'it splashes harmlessly') : 'miss!'}`, { who: ch.name, fx: { k: 'atk', a: t.id, t: tg.id, hit, dmg, ranged: true } });
    if (dmg) damage(c, tg, dmg, I.type, { magic: true }); return { ok: true, cost: 'action' };
  }
  if (I.use === 'spell') {
    const r = castSpell(c, ch, t, I.spell, target, { free: true, atk: ch.castAb ? spellAtk(ch) : 5, dc: ch.castAb ? spellDC(ch) : 13 }); if (r.error) return r;
    if (I.charges) { it.ch = (it.ch == null ? I.charges : it.ch) - 1; if (it.ch <= 0) { invRemove(ch, idx); addLog(c, 'system', `${I.name} crumbles to dust.`); } } else invRemove(ch, idx);
    return { ok: true, cost: 'action' };
  }
  if (I.use === 'stabilize') { const tg = target && s.tokens.find(o => o.id === target.id && o.kind === 'pc'); const tch = charOfToken(c, tg); if (!tch || tch.hp > 0 || tch.dead) return { error: 'Pick a fallen ally' }; if (cheb(tg, t) > 1) return { error: 'Get next to them' }; tch.stable = true; invRemove(ch, idx); addLog(c, 'item', `🩹 ${ch.name} stabilizes ${tch.name}.`); return { ok: true, cost: 'action' }; }
  return { error: 'Nothing happens' };
}

// ---------------- POIs & interaction ----------------
function lootChest(c, ch, poi) {
  const L = poi.loot || {}; const gold = L.gold ? rollDice(L.gold).total : 0;
  const got = [];
  if (gold) { ch.gold += gold; got.push(`${gold} gold`); }
  (L.items || []).forEach(k => { invAdd(ch, k); got.push(R.ITEMS[k]?.name || k); if (R.ITEMS[k]?.story) event(c, 'item:' + k); });
  if (!L.items && !L.gold) { const extra = pick(['potion_healing', 'alch_fire', 'holy_water', null, null]); if (extra) { invAdd(ch, extra); got.push(R.ITEMS[extra].name); } }
  poi.opened = true;
  addLog(c, 'loot', `📦 ${ch.name} opens the ${poi.name}: ${got.length ? got.join(', ') : 'empty...'}!`, { who: ch.name, fx: { k: 'loot', x: poi.x, y: poi.y }, items: got });
}
function rollCheck(c, ch, t, skillOrAb, label, dc, advIn) {
  const isSkill = !!R.SKILLS[skillOrAb]; const m = isSkill ? skillMod(ch, skillOrAb) : R.mod(ch.scores[skillOrAb]);
  let a = 0, d = 0; if (advIn === 'adv') a++; if (advIn === 'dis') d++;
  if (isSkill && ch.features.includes('kenku_recall') && ch.skills.includes(skillOrAb)) a++;
  if (isSkill && ch.features.includes('shapechanger') && ['deception', 'persuasion', 'performance'].includes(skillOrAb)) a++;
  if (t && ['poisoned', 'frightened'].some(k => hasCond(c, t, k))) d++; if (t && hasCond(c, t, 'helped')) { a++; removeCond(c, t, 'helped'); }
  const r = d20(advOf(a, d), ch.race === 'Halfling'); let bonus = 0; let btxt = '';
  const insp = t && condsOf(c, t).find(x => x.k === 'inspired'); if (insp) { const b = rollDice('1d6').total; bonus += b; btxt = ` +${b}🎵`; removeCond(c, t, 'inspired'); }
  const total = r.pick + m + bonus; const ok = dc ? total >= dc : null;
  addLog(c, 'roll', `🎲 ${ch.name} — ${label}: ${r.rolls.join('/')}${fmtMod(m)}${btxt} = ${total}${r.pick === 20 ? ' (NAT 20!)' : r.pick === 1 ? ' (nat 1…)' : ''}${dc ? (ok ? ` ✅ vs DC ${dc}` : ` ❌ vs DC ${dc}`) : ''}`, { who: ch.name, uid: ch.ownerId, fx: { k: 'check', d20: r.rolls, pick: r.pick, tot: total, ok, uid: ch.ownerId } });
  return { total, ok, nat: r.pick };
}
function interact(c, ch, t, poi) {
  const s = scene(c);
  if (poi.type === 'chest') {
    if (poi.opened) return { error: 'Already empty' };
    const mimic = s.tokens.find(m => m.disguise === 'chest' && m.x === poi.x && m.y === poi.y);
    if (poi.locked && !poi.unlocked) {
      const tools = invFind(ch, 'thieves_tools') >= 0; const useSkill = tools || ch.skills.includes('sleight_of_hand') ? 'sleight_of_hand' : 'athletics';
      const r = rollCheck(c, ch, t, useSkill, useSkill === 'athletics' ? 'Force the lock' : 'Pick the lock', poi.locked + (useSkill === 'athletics' ? 2 : 0), tools ? 'adv' : null);
      if (!r.ok) { addLog(c, 'system', `🔒 The ${poi.name} stays shut.`); return { ok: true, spent: true }; }
      poi.unlocked = true;
    }
    lootChest(c, ch, poi); return { ok: true, spent: true };
  }
  if (poi.type === 'trap') {
    if (poi.disarmed) return { error: 'Already disarmed' };
    const tools = invFind(ch, 'thieves_tools') >= 0;
    const r = rollCheck(c, ch, t, 'sleight_of_hand', 'Disarm the ' + poi.name, poi.dc, tools ? 'adv' : null);
    if (r.ok) { poi.disarmed = true; addLog(c, 'system', `🛠️ ${ch.name} disarms the ${poi.name}.`); giveXp(c, ch, 25); }
    else if (r.total <= poi.dc - 5) { springTrap(c, t, poi); }
    else addLog(c, 'system', `${ch.name} can't quite figure out the ${poi.name}.`);
    return { ok: true, spent: true };
  }
  if (poi.type === 'clue') {
    if (poi.read && !poi.check) { addLog(c, 'clue', poi.text, { who: poi.name }); return { ok: true }; }
    if (poi.check && !poi.solved) {
      const r = rollCheck(c, ch, t, poi.check.skill, `${R.SKILLS[poi.check.skill] ? poi.check.skill.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : poi.check.skill} — ${poi.name}`, poi.check.dc);
      if (!r.ok) { addLog(c, 'system', `${ch.name} doesn't find anything useful... yet.`); return { ok: true, spent: true }; }
      poi.solved = true;
    }
    poi.read = true; addLog(c, 'clue', poi.text, { who: poi.name, fx: { k: 'clue', x: poi.x, y: poi.y } });
    if (poi.item && !poi.taken) { poi.taken = true; invAdd(ch, poi.item); event(c, 'item:' + poi.item); addLog(c, 'loot', `${ch.name} takes the ${R.ITEMS[poi.item]?.name}.`, { fx: { k: 'loot', x: poi.x, y: poi.y } }); }
    giveXp(c, ch, 10);
    return { ok: true, spent: true };
  }
  if (poi.type === 'shrine') {
    poi.used = poi.used || {}; if (poi.used[ch.id]) return { error: 'The shrine has already blessed you here' };
    if (c.turn.mode === 'combat') return { error: 'No time to pray — you\'re in a fight!' };
    poi.used[ch.id] = 1; const h = heal(c, t, rollDice('1d8+2').total); addCond(c, t, 'blessed', 10);
    addLog(c, 'item', `🕯️ ${ch.name} prays at the ${poi.name}. +${h} HP and Blessed for the next fight.`, { fx: { k: 'heal', t: t.id, amt: h } }); return { ok: true };
  }
  if (poi.type === 'gate') {
    if (poi.open) return { error: 'It\'s open' };
    if (!partyHas(c, poi.needs)) { addLog(c, 'clue', poi.text || 'It\'s locked tight.', { who: poi.name }); return { ok: true }; }
    poi.open = true; (poi.tiles || []).forEach(([x, y]) => setTile(s, x, y, '+'));
    addLog(c, 'alert', `🗝️ ${ch.name} turns the ${R.ITEMS[poi.needs]?.name || 'key'}. With a scream of rust, the gate swings open...`, { fx: { k: 'gate', x: poi.x, y: poi.y } });
    updateVision(c); return { ok: true, spent: true };
  }
  if (poi.type === 'exit') {
    if (c.turn.mode === 'combat') return { error: 'You can\'t leave in the middle of a fight!' };
    if (poi.needs && !partyHas(c, poi.needs)) { addLog(c, 'clue', poi.lockedText || 'The way is blocked.', { who: poi.name }); return { ok: true }; }
    if (poi.quest) { const q = c.quests.find(x => x.id === poi.quest); if (q && q.status === 'hidden') { addLog(c, 'system', `🚪 ${poi.name}: it's locked. Maybe ask around town first.`); return { ok: true }; } }
    if (poi.needs === 'tide_chant' && !c.flags.tideParted) { c.flags.tideParted = true; addLog(c, 'narration', `${ch.name} unrolls the Tide-Chant and sings. The words taste of salt. Slowly — impossibly — the sea draws back like a curtain, revealing a slick black causeway leading to the lighthouse.`, { who: 'The Tide-Chant' }); }
    const from = c.sceneId; enterScene(c, poi.to, from); buildExploreOrder(c);
    return { ok: true, moved: true };
  }
  return { error: 'Nothing to do with that' };
}
function searchArea(c, ch, t) {
  const s = scene(c); const key = `${ch.id}:${t.x >> 2},${t.y >> 2}:${s.key}`; c.flags.searched = c.flags.searched || {};
  if (c.flags.searched[key]) return { error: 'You already searched around here — try somewhere else' };
  c.flags.searched[key] = 1;
  const useInv = ch.skills.includes('investigation') && skillMod(ch, 'investigation') > skillMod(ch, 'perception');
  const r = rollCheck(c, ch, t, useInv ? 'investigation' : 'perception', 'Search', null);
  let found = 0;
  s.pois.forEach(p => { if (p.hidden && cheb(p, t) <= 4 && r.total >= p.dc) { p.hidden = false; p.found = true; found++; addLog(c, 'alert', `👁️ ${ch.name} finds a ${p.name}!`, { fx: { k: 'spot', x: p.x, y: p.y } }); } });
  s.tokens.forEach(m => { if (m.disguise && !m.revealed && cheb(m, t) <= 4 && r.total >= 12) { m.revealed = true; found++; addLog(c, 'alert', `👁️ ${ch.name} notices the chest is... breathing.`, { fx: { k: 'spot', x: m.x, y: m.y } }); } });
  if (!found) { if (r.total >= 15 && rnd(3) === 0) { const g = rollDice('2d6').total; ch.gold += g; addLog(c, 'loot', `${ch.name} finds ${g} gold tucked in a crack.`); } else addLog(c, 'system', `${ch.name} finds nothing unusual nearby.`); }
  return { ok: true, spent: true };
}

// ---------------- NPC talk ----------------
function npcTopics(c, n) {
  const out = Object.keys(n.topics || {}).map(k => ({ id: 't:' + k, label: k }));
  const q = n.quest && c.quests.find(x => x.id === n.quest);
  if (q && q.status === 'hidden') out.unshift({ id: 'quest', label: '📜 Ask about work', hot: true });
  const turnIn = c.quests.find(qq => qq.status === 'active' && qq.objectives.some((o, i) => !o.done && o.k === 'talk:' + n.key && qq.objectives.slice(0, i).every(p => p.done)));
  if (turnIn) out.unshift({ id: 'turnin', label: `✔ ${turnIn.objectives.find(o => !o.done).t}`, hot: true });
  if (n.wants && !c.flags['paid_' + n.key]) { out.push({ id: 'pay', label: `💰 Pay ${n.wants.gold} gold` }); out.push({ id: 'persuade', label: `🗣️ Persuade (DC ${n.wants.dc})` }); }
  if (n.chained && !c.flags['freed_' + n.key]) out.unshift({ id: 'free', label: '⛓️ Break the chains', hot: true });
  if (n.shop) out.push({ id: 'shop', label: '🛒 Trade' });
  if (n.inn) out.push({ id: 'rest', label: '🛏️ Rent rooms — long rest (5 gp each)' });
  if (n.heals) out.push({ id: 'heal', label: '🙏 Ask for healing' });
  if (n.heals && Object.values(c.characters).some(ch => ch.dead)) out.unshift({ id: 'revive', label: '🌟 Bring back the fallen (50 gp each)', hot: true });
  return out;
}
function talk(c, ch, t, n, topic) {
  const s = scene(c); const tok = s.tokens.find(o => o.npcKey === n.key);
  const say = (text) => addLog(c, 'npc', text, { who: n.name, npc: n.key });
  const first = !n.met; n.met = true;
  if (first && !topic) { say(`${n.desc ? '' : ''}${greeting(n)}`); }
  if (topic === 'quest') { offerQuest(c, n.quest); const q = c.quests.find(x => x.id === n.quest); say(q.desc); event(c, 'talk:' + n.key); return { ok: true }; }
  if (topic === 'turnin') { event(c, 'talk:' + n.key); say(pick(['You did it! Thank you, truly.', 'Ha! I knew you lot were the real thing.', 'The gods bless you. Here — you\'ve earned this.'])); return { ok: true }; }
  if (topic === 'pay') { if (ch.gold < n.wants.gold) return { error: 'Not enough gold' }; ch.gold -= n.wants.gold; c.flags['paid_' + n.key] = 1; say(n.reveal || 'Fine, fine. Here\'s what I know...'); if (n.reveal) n.revealed = true; event(c, 'talk:' + n.key); return { ok: true }; }
  if (topic === 'persuade') {
    if (c.flags['tried_' + n.key + '_' + ch.id]) return { error: `${n.name} won't be talked into it by you again` };
    c.flags['tried_' + n.key + '_' + ch.id] = 1; const r = rollCheck(c, ch, t, n.wants.skill || 'persuasion', `Persuade ${n.name}`, n.wants.dc);
    if (r.ok) { c.flags['paid_' + n.key] = 1; say(n.reveal || 'Alright, alright...'); n.revealed = true; event(c, 'talk:' + n.key); } else say('Nice try. Five gold.');
    return { ok: true };
  }
  if (topic === 'free') {
    if (c.turn.mode === 'combat') return { error: 'Finish the fight first!' };
    if (t && tok && cheb(t, tok) > 1) return { error: `Get next to ${n.name} first` };
    const r = rollCheck(c, ch, t, 'athletics', 'Break the chains', 10);
    if (!r.ok) { addLog(c, 'system', 'The rusty chains hold... try again.'); return { ok: true }; }
    c.flags['freed_' + n.key] = 1; n.chained = false; event(c, 'free:' + n.key); say('Thank you... thank you! I thought I\'d die down here.');
    Object.entries(n.topics || {}).forEach(([k, v]) => say(v)); n.revealed = true;
    // send them home
    const hub = c.startScene; if (tok) s.tokens = s.tokens.filter(o => o !== tok); n.scene = hub; n.topics = { 'Thank you': 'I owe you my life. Mother hasn\'t stopped crying since I walked in the door.' };
    const hs = c.scenes[hub]; if (hs) { const [x, y] = freeSpotNear(hs, hs.entry[0], hs.entry[1] - 4); hs.tokens.push({ id: uid(4), kind: 'npc', npcKey: n.key, name: n.name, x, y, look: n.look, conds: [] }); }
    if (c.npcs.marta) c.npcs.marta.topics['Tobin is home'] = 'You brought my boy home. I... I have something to tell you. My grandfather was the last lighthouse keeper. He rang that bell on stormy nights to wreck ships for salvage. Whatever is down there — it remembers.';
    Object.values(c.characters).forEach(x => giveXp(c, x, 100));
    addLog(c, 'system', '✨ +100 XP each for the rescue!');
    return { ok: true };
  }
  if (topic === 'rest') {
    if (c.turn.mode === 'combat') return { error: 'Not now!' };
    const cost = 5 * Object.values(c.characters).filter(x => !x.dead).length; if (ch.gold < cost) return { error: `Rooms for everyone cost ${cost} gold` };
    ch.gold -= cost; longRest(c); say('Sleep well! Breakfast is at dawn, and it\'s mostly fish.'); return { ok: true };
  }
  if (topic === 'heal') {
    c.flags.healDay = c.flags.healDay || {}; if (c.flags.healDay[c.sceneId + c.turn.round]) return { error: 'She has already helped you' };
    Object.values(c.characters).forEach(x => { if (!x.dead) { x.hp = x.maxHp; x.conds = x.conds.filter(k => k.k !== 'poisoned'); } });
    c.flags.healDay[c.sceneId + c.turn.round] = 1; say('Tidemother, mend them. ...There. Go gently.'); addLog(c, 'system', '💚 The whole party is healed to full.', { fx: { k: 'healall' } }); return { ok: true };
  }
  const counts = !n.wants || c.flags['paid_' + n.key];
  if (topic === 'revive') {
    const dead = Object.values(c.characters).filter(x => x.dead); if (!dead.length) return { error: 'Nobody needs reviving' };
    const cost = 50 * dead.length; if (ch.gold < cost) return { error: `That costs ${cost} gold — friends can give you gold from the Hero tab` };
    ch.gold -= cost; dead.forEach(x => { x.dead = false; x.hp = 1; x.deathFails = 0; x.deathSaves = 0; x.conds = []; });
    say('Tidemother, return what the dark has taken... Breathe. Breathe!'); addLog(c, 'alert', `🌟 ${dead.map(x => x.name).join(' and ')} gasp${dead.length > 1 ? '' : 's'} back to life!`, { fx: { k: 'healall' } });
    buildExploreOrder(c); return { ok: true };
  }
  if (topic && topic.startsWith('t:')) { const k = topic.slice(2); if (n.topics && n.topics[k]) { say(n.topics[k]); if (counts) event(c, 'talk:' + n.key); } return { ok: true }; }
  if (!topic && counts) { event(c, 'talk:' + n.key); }
  return { ok: true };
}
function greeting(n) { return pick([`Hello there. I'm ${n.name}, ${n.role.toLowerCase()}.`, `${n.name}, ${n.role.toLowerCase()}. What do you need?`, `Well met! Name's ${n.name}.`]); }

// ---------------- rests & leveling ----------------
function longRest(c) {
  Object.values(c.characters).forEach(ch => {
    if (ch.dead) return; ch.hp = ch.maxHp; ch.temp = 0; ch.slots.forEach(s => s.used = 0); ch.uses = {}; if (ch.features.includes('lay_on_hands')) ch.pool = 5 * ch.level; if (ch.ki) ch.ki.used = 0;
    ch.hitDice = Math.min(ch.level, (ch.hitDice || 0) + Math.max(1, Math.floor(ch.level / 2))); ch.conds = []; ch.deathFails = 0; ch.deathSaves = 0; ch.stable = false;
  });
  c.shortRests = 0; addLog(c, 'rest', '🌙 The party takes a long rest. HP, spells and abilities restored.', { fx: { k: 'healall' } });
}
function shortRest(c) {
  Object.values(c.characters).forEach(ch => {
    if (ch.dead) return; const C = R.CLASSES[ch.class];
    if (ch.hitDice > 0 && ch.hp < ch.maxHp) { ch.hitDice--; ch.hp = Math.min(ch.maxHp, Math.max(ch.hp, 0) + Math.max(1, rollDice(`1d${C.hitDie}`).total + R.mod(ch.scores.con))); }
    Object.keys(ch.uses).forEach(k => { if (R.FEATURES[k]?.rest === 'short') delete ch.uses[k]; });
    if (C.caster === 'pact') ch.slots.forEach(s => s.used = 0);
    if (ch.features.includes('arcane_recovery') && !ch.uses.arcane) { const s = ch.slots.find(x => x.used > 0); if (s) { s.used--; ch.uses.arcane = 1; } }
    if (ch.ki) ch.ki.used = 0;
  });
  c.shortRests++; addLog(c, 'rest', '☕ The party takes a short rest, binds wounds and catches their breath.', { fx: { k: 'healall' } });
}
function levelUp(c, ch) {
  const target = R.levelForXp(ch.xp); if (target <= ch.level) { ch.levelUpReady = false; return null; }
  const C = R.CLASSES[ch.class]; const before = { features: ch.features.slice(), spells: ch.spells.slice(), slots: ch.slots.map(s => s.max) };
  let gained = 0;
  while (ch.level < target) {
    ch.level++; const g = Math.max(1, Math.floor(C.hitDie / 2) + 1 + R.mod(ch.scores.con)); ch.maxHp += g; ch.hp += g; gained += g; ch.hitDice = (ch.hitDice || 0) + 1;
    if ([4, 8, 12, 16, 19].includes(ch.level)) { const a = C.primary; const inc = Math.min(2, 20 - ch.scores[a]); ch.base[a] += inc; ch.scores[a] += inc; if (inc < 2) { ch.scores.con = Math.min(20, ch.scores.con + (2 - inc)); ch.base.con += 2 - inc; } }
    if (ch.features.includes('lay_on_hands')) ch.pool = (ch.pool || 0) + 5;
  }
  refreshClass(ch); ch.levelUpReady = false;
  const newF = ch.features.filter(f => !before.features.includes(f)).map(f => R.FEATURES[f]?.name || f);
  const newS = ch.spells.filter(s => !before.spells.includes(s)).map(s => R.SPELLS[s].name);
  const summary = { level: ch.level, hp: gained, features: newF, spells: newS, slots: ch.slots.map(s => s.max) };
  addLog(c, 'levelup', `⭐ ${ch.name} reaches level ${ch.level}! +${gained} max HP${newF.length ? '. New: ' + newF.join(', ') : ''}${newS.length ? '. Spells: ' + newS.join(', ') : ''}`, { who: ch.name, fx: { k: 'levelup', charId: ch.id } });
  return summary;
}

// ---------------- equipment ----------------
function equipItem(c, ch, idx) {
  const it = ch.inventory[idx]; const I = it && R.ITEMS[it.k]; if (!I || !I.equip) return { error: 'You can\'t equip that' };
  const C = R.CLASSES[ch.class];
  if (I.equip === 'armor') { const A = R.ARMOR[I.armor]; if (!C.armorProf.includes(A.cat)) return { error: `${ch.class}s can't use ${A.cat} armor` }; if (c.turn.mode === 'combat') return { error: 'Not during combat' }; if (ch.equip.armor) invAdd(ch, ch.equip.armor); ch.equip.armor = it.k; }
  else if (I.equip === 'shield') { if (!C.armorProf.includes('shield')) return { error: `${ch.class}s aren't trained with shields` }; if (ch.equip.shield) return { error: 'Already holding a shield' }; ch.equip.shield = true; }
  else if (I.equip === 'weapon') { if (ch.weapons.length >= 5) return { error: 'Hands full — unequip a weapon first' }; ch.weapons.unshift(makeWeapon(I.weapon, it.k)); }
  else { const slot = I.equip; if (ch.equip[slot]) invAdd(ch, ch.equip[slot]); ch.equip[slot] = it.k; }
  invRemove(ch, idx); ch.ac = R.computeAC(ch); addLog(c, 'system', `${ch.name} equips ${I.name}.`); return { ok: true };
}
function unequip(c, ch, what, i) {
  if (what === 'weapon') { const w = ch.weapons[i]; if (!w) return { error: 'No weapon' }; if (ch.weapons.length <= 1) return { error: 'Keep at least one weapon' }; ch.weapons.splice(i, 1); invAdd(ch, w.item || ('w_' + w.k), w.name); }
  else if (what === 'shield') { if (!ch.equip.shield) return { error: 'No shield' }; ch.equip.shield = false; invAdd(ch, 'shield_item'); }
  else if (['armor', 'ring', 'cloak', 'boots'].includes(what)) { if (!ch.equip[what]) return { error: 'Nothing there' }; if (what === 'armor' && c.turn.mode === 'combat') return { error: 'Not during combat' }; invAdd(ch, ch.equip[what]); ch.equip[what] = null; }
  ch.ac = R.computeAC(ch); return { ok: true };
}

module.exports = { canSwim, raceFeats,
  cleanLook, setHooks, uid, now, rollDice, d20, addLog, newCampaign, buildCharacter, refreshClass, makeWeapon, featureUses, attacksPerAction, spellAtk, spellDC, skillMod, saveMod, passivePerception,
  invFind, invAdd, invRemove, partyHas, scene, pcTokens, tokenOfChar, charOfToken, tileAt, walkable, occupied, freeSpotNear, buildScene, enterScene, updateVision, wakeEncounter,
  event, offerQuest, completeQuest, giveXp, condsOf, hasCond, addCond, removeCond, isHelpless, hpOf, acOf, isAlive, isUp, damage, heal, killMonster, monsterToken,
  startCombat, endCombat, checkCombatEnd, beginTurn, advance, buildExploreOrder, currentEntry, currentUserId, nameOfEntry, activeMonsters, freshRes,
  pathTo, walk, pcAttack, runMonsterTurns, autoHero, castSpell, useItem, interact, searchArea, npcTopics, talk, longRest, shortRest, levelUp, equipItem, unequip, rollCheck, summarizeNames, cheb, fmtMod, avgLevel
};
