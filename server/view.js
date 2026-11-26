// What each player is allowed to see.
const R = require('../public/rules.js');
const E = require('./engine');

function gearOf(ch) {
  const w0 = ch.weapons[0]; const w1 = ch.weapons[1];
  const main = w0 ? (ch.class === 'Wizard' && w0.k === 'quarterstaff' ? 'staff' : w0.k) : null;
  let off = null;
  if (ch.equip.shield) off = 'shield';
  else if (w0 && w1 && w0.light && w1.light && !w0.ranged && !w1.ranged) off = w1.k;
  else if (w0 && !w0.ranged && !['greataxe', 'greatsword', 'quarterstaff', 'spear'].includes(w0.k)) off = { Sorcerer: 'flame', Warlock: 'orb', Cleric: 'holy' }[ch.class] || null;
  return { main, off, plus: w0 ? (w0.plus || 0) : 0 };
}
function viewFor(c, u, ctx) {
  const dm = ctx.isDM; const aiOn = ctx.aiActive; const dmFull = c.dmMode === 'human' && c.dmUserId === u.id;
  const s = E.scene(c);
  let sceneView = null;
  if (s) {
    const vis = new Set(s.vis || []); const seenAt = (x, y) => s.seen[y * s.w + x] === '1'; const visAt = (x, y) => vis.has(y * s.w + x);
    const visStr = Array.from({ length: s.w * s.h }, (_, i) => vis.has(i) ? '1' : '0').join('');
    const combatIds = new Set(c.turn.mode === 'combat' ? c.turn.order.filter(e => e.tokenId).map(e => e.tokenId) : []);
    const tokens = [];
    for (const t of s.tokens) {
      if (t.gone) continue;
      if (t.kind === 'pc') { const ch = c.characters[t.charId]; if (!ch) continue; tokens.push({ id: t.id, kind: 'pc', charId: ch.id, name: ch.name, x: t.x, y: t.y, hp: ch.hp, maxHp: ch.maxHp, temp: ch.temp, ac: R.computeAC(ch), conds: ch.conds.map(k => k.k), look: ch.look, cls: ch.class, race: ch.race, dead: ch.dead, facing: t.facing || 1, ownerId: ch.ownerId, gear: gearOf(ch) }); continue; }
      if (t.kind === 'npc') { if (dmFull || seenAt(t.x, t.y)) tokens.push({ id: t.id, kind: 'npc', npcKey: t.npcKey, name: t.name, x: t.x, y: t.y, look: t.look, chained: !!t.chained, role: c.npcs[t.npcKey]?.art || c.npcs[t.npcKey]?.role }); continue; }
      if (t.kind === 'ally') { tokens.push({ id: t.id, kind: 'ally', mkey: t.mkey, petKey: t.petKey, name: t.name, x: t.x, y: t.y, hpPct: Math.max(0, Math.ceil(t.hp / t.maxHp * 10) / 10), hp: t.hp, maxHp: t.maxHp, ac: t.ac, ownerId: t.ownerId, conds: (t.conds || []).map(k => k.k), facing: t.facing || 1, size: t.size || 1, summoned: !!t.summonedBy }); continue; }
      if (t.banished && !dmFull) continue;
      // monsters
      const visible = visAt(t.x, t.y) || combatIds.has(t.id);
      if (t.disguise && !t.revealed) { if (dmFull || seenAt(t.x, t.y)) tokens.push({ id: t.id, kind: 'mimic', x: t.x, y: t.y, dm: dmFull ? t.name : undefined }); continue; }
      if (t.dormant && !dmFull && !t.revealed) continue;
      if (!visible && !dmFull && !t.revealed) continue;
      const hpPct = Math.ceil(t.hp / t.maxHp * 10) / 10;
      tokens.push({ id: t.id, kind: 'monster', mkey: t.mkey, name: t.name, x: t.x, y: t.y, hpPct, hp: dmFull ? t.hp : undefined, maxHp: dmFull ? t.maxHp : undefined, ac: dmFull ? t.ac : undefined, conds: (t.conds || []).map(k => k.k), boss: t.boss, size: t.size || 1, facing: t.facing || 1, dormant: dmFull ? !!t.dormant : undefined, revealed: !!t.revealed, dimmed: !visAt(t.x, t.y) });
    }
    const pois = s.pois.filter(p => dmFull || ((!p.hidden) && seenAt(p.x, p.y))).map(p => ({ id: p.id, type: p.type, x: p.x, y: p.y, name: p.name, opened: !!p.opened, locked: !!p.locked && !p.unlocked, disarmed: !!p.disarmed, triggered: !!p.triggered, found: !!p.found, hidden: dmFull ? !!p.hidden : undefined, read: !!p.read, open: !!p.open, to: p.to, needs: p.needs ? (R.ITEMS[p.needs]?.name || p.needs) : null, ready: p.type === 'exit' ? (!p.needs || E.partyHas(c, p.needs)) : undefined, toName: p.to ? c.sceneDefs[p.to]?.name : undefined, used: p.used && E.characterOf ? undefined : undefined }));
    sceneView = { key: s.key, name: s.name, kind: s.kind, theme: s.theme, dark: s.dark, desc: s.desc, w: s.w, h: s.h, tiles: s.tiles, seen: dmFull ? '1'.repeat(s.w * s.h) : s.seen, vis: dmFull ? '1'.repeat(s.w * s.h) : visStr, tokens, pois };
  }
  const npcsHere = new Set(s ? s.tokens.filter(t => t.kind === 'npc').map(t => t.npcKey) : []);
  const npcs = {};
  Object.values(c.npcs || {}).forEach(n => {
    if (!(n.met || npcsHere.has(n.key) || dmFull)) return;
    npcs[n.key] = { key: n.key, name: n.name, role: n.role, art: n.art || null, desc: n.desc, look: n.look, here: npcsHere.has(n.key), met: !!n.met, topics: E.npcTopics(c, n), shop: n.shop ? n.shop.map(k => ({ k, name: R.ITEMS[k].name, icon: R.ITEMS[k].icon, price: R.ITEMS[k].price, desc: R.ITEMS[k].desc || '' })) : null, inn: !!n.inn, heals: !!n.heals, secret: (n.revealed || dmFull) ? n.secret : null, chained: !!n.chained };
  });
  const order = c.turn.order.map((e, i) => ({ i, kind: e.kind, charId: e.charId, tokenId: e.tokenId, init: e.init, name: E.nameOfEntry(c, e) }));
  return {
    id: c.id, code: c.code, name: c.name, premise: c.premise, ownerId: c.ownerId, dmMode: c.dmMode, dmUserId: c.dmUserId, aiReady: ctx.aiReady, aiActive: aiOn, aiBusy: !!c.aiBusy,
    pace: c.pace, turnTimer: c.turnTimer, status: c.status, members: ctx.members, music: ctx.music || {}, characters: c.characters, world: c.world ? { nodes: c.world.nodes, edges: c.world.edges, at: c.world.at } : null, rep: c.rep || null, safety: c.safety || null, adventure: c.adventure ? { title: c.adventure.title, premise: c.adventure.premise, chapter: c.adventure.chapter, done: !!c.adventureDone } : null,
    log: c.log.slice(-300), turn: { mode: c.turn.mode, round: c.turn.round, phase: c.turn.phase, index: c.turn.index, order, current: E.currentEntry(c), currentUserId: E.currentUserId(c), currentName: E.nameOfEntry(c, E.currentEntry(c)), res: c.turn.res, pendingRoll: c.turn.pendingRoll, startedAt: c.turn.startedAt },
    scene: sceneView, quests: c.quests.filter(q => q.status !== 'hidden' || dmFull), npcs, library: c.library, notes: dm ? c.notes : [], isDM: dm, dmFull, me: u.id, shortRests: c.shortRests,
    scenes: dmFull ? Object.entries(c.sceneDefs || {}).map(([k, d]) => ({ key: k, name: d.name, visited: !!c.scenes[k]?.visited })) : Object.entries(c.scenes || {}).filter(([, sc]) => sc.visited).map(([k, sc]) => ({ key: k, name: sc.name, visited: true })),
    updatedAt: c.updatedAt
  };
}
module.exports = { viewFor, gearOf };
