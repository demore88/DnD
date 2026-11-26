// AI Dungeon Master: prompts, calls, and applying results to the game.
const fs = require('fs');
const path = require('path');
const R = require('../public/rules.js');
const E = require('./engine');
const ADV = require('./adventure');
const OPS = require('./ops');

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const BASE = process.env.AI_BASE_URL || 'https://api.anthropic.com';
let H = { changed() { }, notifyTurn() { }, notifyUser() { }, userName() { return '?'; }, dataDir: '.' };
function setHooks(h) { H = Object.assign(H, h); }
const enabled = () => !!KEY;
const active = (c) => c.dmMode === 'ai' && !!KEY;

// ---------- library search (the group's own rulebook text files) ----------
const libCache = {};
function libraryChunks(c) {
  if (libCache[c.id]) return libCache[c.id]; const chunks = [];
  for (const b of c.library || []) { try { const txt = fs.readFileSync(path.join(H.dataDir, 'library', c.id, b.id + '.txt'), 'utf8'); for (let i = 0; i < txt.length; i += 1500) chunks.push({ title: b.title, text: txt.slice(i, i + 1700) }); } catch (e) { } }
  libCache[c.id] = chunks; return chunks;
}
function clearLibCache(id) { delete libCache[id]; }
const STOP = new Set('the a an and or of to in on at for with is it i my we you he she they his her their this that what do does be are was were from as by into not can will just then there here our me your them its out up'.split(' '));
function searchLibrary(c, q, k = 3) {
  const chunks = libraryChunks(c); if (!chunks.length) return [];
  const words = [...new Set(String(q).toLowerCase().match(/[a-z']{4,}/g) || [])].filter(w => !STOP.has(w)); if (!words.length) return [];
  return chunks.map(ch => { const t = ch.text.toLowerCase(); let s = 0; for (const w of words) { const m = t.split(w).length - 1; if (m) s += 1 + Math.log(m); } return [s, ch]; }).filter(x => x[0] > 1).sort((a, b) => b[0] - a[0]).slice(0, k).map(x => x[1]);
}

// ---------- prompts ----------
const SYSTEM = `You are the Dungeon Master of a D&D 5th Edition game that a group of friends (about 14 years old) play on their phones, taking turns. You are a GREAT DM: vivid, funny, spooky when it counts, fair, and you make every player feel like the hero.
Style:
- Phone screen: keep narration to 2-4 punchy sentences. Use sensory details (sounds, smells, light). Give NPCs distinct voices.
- Always end by putting a clear choice or question in front of the NEXT player by character name, when it fits.
- PG-13: peril, monsters and spooky stuff are great; no gore detail, no sexual content, no real-world hate.
Rules:
- The game engine already handles movement, attacks, spells, chests, traps and searching on the map. You handle everything else: talking, sneaking, climbing, tricks, clever ideas, lore, consequences.
- When the outcome is uncertain, ask for a roll with request_roll (pick the right skill and a fair DC: 10 easy, 13 medium, 15 hard, 18 very hard). Never decide an uncertain outcome without a roll.
- Reward creativity: say "yes, and..." to clever ideas. Give XP (25-100) for great roleplay or smart solutions.
- Stay consistent with the adventure, the NPCs' secrets and the quests. Reveal secrets only when players earn them.
- Monsters are already placed in the world. Only spawn new monsters when the story clearly calls for it (reinforcements, an ambush the players provoked).
Reply with ONLY one JSON object (no other text). Keys (omit what you don't need):
{"narration": string,
 "npc_reply": string (only when an NPC is being spoken to; their words, in character),
 "request_roll": {"character": name, "label": "Stealth check", "skill": skill_key or null, "ability": "str|dex|con|int|wis|cha" or null, "dc": number},
 "hp_changes": [{"target": name, "amount": number (negative = damage)}],
 "conditions": [{"target": name, "cond": one of ${Object.keys(R.CONDITIONS).join('|')}, "rounds": number}],
 "give_items": [{"character": name, "item": item_key from [${Object.keys(R.ITEMS).filter(k => !R.ITEMS[k].story).join(', ')}] or a short custom item name}],
 "gold": [{"character": name, "amount": number}], "xp": [{"character": name, "amount": number}],
 "spawn": [{"monster": key from [${Object.keys(R.BESTIARY).join(', ')}], "count": number}], "start_combat": bool,
 "remove": [monster names that flee, surrender or leave],
 "quest_offer": bool (an NPC offers their quest), "quest_add": {"title": string, "desc": string, "objectives": [string], "reward_gold": number, "reward_xp": number},
 "quest_progress": [{"quest": title, "objective": number (0-based)}],
 "reveal_secret": bool (the NPC reveals their secret), "memory_note": string (facts to remember, under 25 words), "rep_change": {"<faction key>": number between -10 and 10} (only when the party clearly helps or harms a faction)}
World: the realm has several towns linked by roads, and factions (watch, guild, circle, temple, crown) that remember what the heroes do. Mention reputation when NPCs react. Heroes may have animal companions or familiars — give the animals personality. Each hero may have a personal quest (marked ⭐) drawn from their backstory: weave it in.
ALWAYS follow the TABLE SAFETY rules in the state below. They override everything else.`;

function stateText(c) {
  const s = E.scene(c);
  const party = Object.values(c.characters).map(ch => `- ${ch.name} (${H.userName(ch.ownerId)}): Lv${ch.level} ${ch.race} ${ch.class}, HP ${ch.hp}/${ch.maxHp}, AC ${R.computeAC(ch)}, gold ${ch.gold}${ch.conds.length ? ', ' + ch.conds.map(x => x.k).join('/') : ''}${ch.dead ? ' [DEAD]' : ch.hp <= 0 ? ' [DOWN]' : ''}; items: ${ch.inventory.map(i => i.n + (i.q > 1 ? ' x' + i.q : '')).join(', ')}${ch.backstory ? '; backstory: ' + ch.backstory.slice(0, 160) : ''}`).join('\n');
  const mons = s ? s.tokens.filter(t => t.kind === 'monster' && !t.gone && !t.dormant).map(t => `- ${t.name} HP ${t.hp}/${t.maxHp}${t.conds?.length ? ' (' + t.conds.map(x => x.k).join(',') + ')' : ''}`).join('\n') : '';
  const npcsHere = s ? s.tokens.filter(t => t.kind === 'npc').map(t => { const n = c.npcs[t.npcKey]; return n ? `- ${n.name}, ${n.role}: ${n.desc} SECRET (reveal only if earned): ${n.secret || 'none'}. ${n.revealed ? '(secret already revealed)' : ''}${n.chained ? ' [chained prisoner]' : ''}` : ''; }).join('\n') : '';
  const quests = c.quests.filter(q => q.status !== 'hidden').map(q => `- ${q.title} [${q.status}]: ${q.objectives.map((o, i) => `${i}.${o.done ? '✔' : '☐'} ${o.t}`).join(' ')}`).join('\n');
  const poi = s ? s.pois.filter(p => !p.hidden && p.type !== 'trap').map(p => `${p.name}${p.opened ? ' (looted)' : ''}`).join(', ') : '';
  const recent = c.log.slice(-28).filter(e => e.kind !== 'move').map(e => `[${e.kind}${e.who ? ' ' + e.who : ''}] ${e.text}`).join('\n');
  const SAF = c.safety || {}; const lvl = SAF.level || 'teen';
  const safety = `TABLE SAFETY: content level "${lvl}" — ${lvl === 'family' ? 'family-friendly (ages 8+): no blood or gore, defeated enemies are knocked out or flee rather than killed on screen, no scary body horror, no romance, no swearing, keep peril light and fun.' : 'PG-13 (ages 13+): adventurous peril and spooky moments are fine, but no graphic gore, no sexual content, no real-world hate, no self-harm, no swearing stronger than "blast" or "darn".'}${(SAF.lines || []).length ? ` NEVER include these topics: ${SAF.lines.join(', ')}.` : ''}${SAF.paused ? ' A player tapped the PAUSE card recently: keep things gentle and away from the last scene\'s intense element.' : ''}`;
  const here = c.world ? Object.values(c.world.nodes).find(n => n.scene === c.sceneId) : null;
  const repTxt = c.rep ? Object.entries(c.rep).map(([k, v]) => `${k} ${v} (${R.repTier(v).n})`).join(', ') : '';
  const pets = Object.values(c.characters).filter(ch => (ch.pets || []).length).map(ch => `${ch.name}: ${(ch.pets || []).map(p => p.name).join(', ')}`).join('; ');
  const subs = Object.values(c.characters).filter(ch => ch.subclass).map(ch => `${ch.name}: ${R.SUBCLASSES[ch.class]?.[ch.subclass]?.name}`).join('; ');
  return `${safety}
ADVENTURE: ${c.adventure?.title} — ${c.adventure?.premise || c.premise}
LOCATION: ${s?.name} (${s?.kind}). ${s?.desc}${here ? ` [Held by ${R.FACTIONS[here.faction]?.name}]` : ''}
REPUTATION: ${repTxt || 'n/a'}${pets ? `\nCOMPANIONS: ${pets}` : ''}${subs ? `\nPATHS: ${subs}` : ''}
VISIBLE HERE: ${poi || 'nothing notable'}
MODE: ${c.turn.mode}${c.turn.mode === 'combat' ? ' round ' + c.turn.round : ''}. Spotlight: ${E.nameOfEntry(c, E.currentEntry(c))}
PARTY:
${party}
AWAKE ENEMIES:
${mons || '(none)'}
NPCS HERE:
${npcsHere || '(none)'}
QUESTS:
${quests || '(none)'}
DM NOTES:
${(c.notes || []).slice(-20).join('\n') || '(none)'}
RECENT LOG:
${recent}`;
}

async function call(system, user, maxTokens = 1400) {
  const res = await fetch(BASE + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }) });
  if (!res.ok) { const t = await res.text(); throw new Error(`API ${res.status}: ${t.slice(0, 140)}`); }
  const j = await res.json(); const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('No JSON in reply');
  return JSON.parse(text.slice(a, b + 1));
}

// ---------- queue ----------
const queues = {};
function queue(c, kind, extra) {
  if (!active(c) && kind !== 'outline' && kind !== 'next') return;
  const blocking = ['action', 'roll', 'takeover', 'outline', 'next'].includes(kind);
  if (blocking) c.aiBusy = true;
  const job = async () => {
    try { await run(c, kind, extra || {}); }
    catch (err) {
      console.error('AI', kind, err.message);
      if (kind === 'outline') { ADV.installModule(c); delete c.pendingOutline; E.addLog(c, 'system', '🤖 The AI had trouble writing a custom adventure, so here\'s the built-in one: The Drowned Bell.'); OPS.beginAdventure(c); }
      else if (kind === 'next') { OPS.addNextAdventure(c, E.avgLevel(c), c.startScene, null); }
      else if (blocking) { E.addLog(c, 'system', '🤖 (The DM lost their notes for a second — moving on.)'); if (c.turn.phase === 'dm') OPS.resumeOrAdvance(c); }
    }
    if (blocking) c.aiBusy = false; H.changed(c);
  };
  queues[c.id] = (queues[c.id] || Promise.resolve()).then(job);
  H.changed(c);
}

async function run(c, kind, x) {
  if (kind === 'outline') return runOutline(c);
  if (kind === 'next') return runNext(c);
  const lastAct = c.log.slice(-5).map(e => e.text).join(' ');
  const ex = searchLibrary(c, lastAct + ' ' + (x.text || ''));
  const lib = ex.length ? `\n\nEXCERPTS FROM THE GROUP'S RULEBOOKS (use if relevant):\n${ex.map(e => `--- ${e.title} ---\n${e.text}`).join('\n')}` : '';
  let task;
  const cur = E.nameOfEntry(c, E.currentEntry(c));
  const nextIdx = c.turn.order.length ? (c.turn.index + 1) % c.turn.order.length : 0; const next = E.nameOfEntry(c, c.turn.order[nextIdx]);
  if (kind === 'action') task = `${cur} just declared an action (last [action] in the log). Resolve it. If uncertain, use request_roll for that character. ${c.turn.mode === 'combat' ? 'It is combat — keep it to 1-2 sentences.' : `Afterwards the spotlight passes to ${next}; end by prompting them.`}`;
  else if (kind === 'roll') task = `${cur} just made the roll you asked for (last roll in the log). Narrate the outcome — success or failure should both be interesting. ${c.turn.mode === 'combat' ? '' : `Then prompt ${next}.`}`;
  else if (kind === 'takeover') task = `You are taking over as DM. Recap the situation in 2 sentences and prompt ${cur}.`;
  else if (kind === 'npc') { const n = c.npcs[x.npc]; const ch = c.characters[x.charId]; task = `${ch?.name} says to ${n?.name}: "${x.text}". Reply IN CHARACTER as ${n?.name} (${n?.role}; ${n?.desc}) using npc_reply (1-3 sentences). Their known topics: ${JSON.stringify(n?.topics || {})}. If the hero makes a good argument, trick, or threat that should be rolled, use request_roll first instead of revealing things. Set quest_offer true if they now offer their quest. Set reveal_secret only if the hero earned it.`; }
  else if (kind === 'xcard') task = `A player just tapped the PAUSE / SKIP card. Without asking why and without making a fuss, smoothly change the scene away from whatever was happening: a sudden distraction, a time skip, or the threat retreating. 2 gentle sentences, then give the party an easy, fun choice. Use only "narration".`;
  else task = `${x.what} Use only "narration" (and optional memory_note). Don't change game state.`;
  const out = await call(SYSTEM, stateText(c) + lib + '\n\nTASK: ' + task, kind === 'flavor' || kind === 'xcard' ? 400 : 1200);
  apply(c, out, kind, x);
}

function apply(c, o, kind, x) {
  const findChar = (n) => { if (!n) return null; const l = String(n).toLowerCase(); return Object.values(c.characters).find(ch => ch.name.toLowerCase() === l) || Object.values(c.characters).find(ch => l.includes(ch.name.toLowerCase()) || ch.name.toLowerCase().includes(l)); };
  const s = E.scene(c);
  const findTok = (n) => { if (!n || !s) return null; const l = String(n).toLowerCase(); const ch = findChar(n); if (ch) return E.tokenOfChar(c, ch.id); return s.tokens.find(t => !t.gone && t.name.toLowerCase() === l) || s.tokens.find(t => !t.gone && t.name.toLowerCase().includes(l)); };
  if (kind === 'npc') { const n = c.npcs[x.npc]; if (o.npc_reply && n) E.addLog(c, 'npc', o.npc_reply, { who: n.name, npc: n.key }); if (o.quest_offer && n?.quest) E.offerQuest(c, n.quest); if (o.reveal_secret && n) { n.revealed = true; if (n.secret) E.addLog(c, 'clue', n.secret, { who: `${n.name}'s secret` }); } if (n) E.event(c, 'talk:' + n.key); }
  if (o.narration) E.addLog(c, 'narration', o.narration, { who: 'DM' });
  if (o.rep_change && typeof o.rep_change === 'object') { const W = require('./world'); Object.entries(o.rep_change).slice(0, 3).forEach(([k, v]) => { const n = Math.max(-10, Math.min(10, parseInt(v, 10) || 0)); if (R.FACTIONS[k] && n) W.changeRep(c, k, n); }); }
  if (o.memory_note) { c.notes.push(String(o.memory_note).slice(0, 200)); if (c.notes.length > 60) c.notes.splice(0, c.notes.length - 60); }
  if (kind === 'flavor' || kind === 'xcard') return;
  (o.hp_changes || []).forEach(h => { const t = findTok(h.target); const a = parseInt(h.amount, 10) || 0; if (!t || !a) return; if (a < 0) E.damage(c, t, -a, 'force'); else E.heal(c, t, a); E.addLog(c, 'system', `${t.name} ${a < 0 ? 'takes ' + (-a) + ' damage' : 'heals ' + a + ' HP'}.`, { fx: { k: a < 0 ? 'dmg' : 'heal', t: t.id, dmg: -a, amt: a } }); });
  (o.conditions || []).forEach(k => { const t = findTok(k.target); if (t && R.CONDITIONS[k.cond]) E.addCond(c, t, k.cond, Math.max(1, Math.min(10, parseInt(k.rounds, 10) || 1))); });
  (o.give_items || []).forEach(g => { const ch = findChar(g.character); if (!ch || !g.item) return; const key = R.ITEMS[g.item] ? g.item : null; E.invAdd(ch, key, key ? null : String(g.item).slice(0, 50)); E.addLog(c, 'loot', `🎒 ${ch.name} gets ${key ? R.ITEMS[key].name : g.item}.`); });
  (o.gold || []).forEach(g => { const ch = findChar(g.character); const a = parseInt(g.amount, 10) || 0; if (ch && a) { ch.gold = Math.max(0, ch.gold + a); E.addLog(c, 'loot', `💰 ${ch.name} ${a > 0 ? 'gets' : 'spends'} ${Math.abs(a)} gold.`); } });
  (o.xp || []).forEach(g => { const ch = findChar(g.character); const a = Math.min(300, parseInt(g.amount, 10) || 0); if (ch && a > 0) { E.giveXp(c, ch, a); E.addLog(c, 'system', `✨ ${ch.name} earns ${a} XP!`); } });
  (o.remove || []).forEach(n => { const t = findTok(n); if (t && t.kind === 'monster') { E.addLog(c, 'system', `${t.name} leaves the fight.`); t.gone = true; s.tokens = s.tokens.filter(z => z !== t); const i = c.turn.order.findIndex(e => e.tokenId === t.id); if (i >= 0) { c.turn.order.splice(i, 1); if (i < c.turn.index) c.turn.index--; } } });
  if (o.quest_add && o.quest_add.title) { const id = 'ai' + E.uid(2); const objs = (o.quest_add.objectives || []).slice(0, 6).map((t, i) => ({ k: `ai:${id}:${i}`, t: String(t).slice(0, 80), done: false })); if (objs.length) { c.quests.push({ id, title: String(o.quest_add.title).slice(0, 60), desc: String(o.quest_add.desc || '').slice(0, 300), status: 'active', objectives: objs, reward: { gold: Math.min(500, parseInt(o.quest_add.reward_gold, 10) || 25), xp: Math.min(1000, parseInt(o.quest_add.reward_xp, 10) || 100) } }); E.addLog(c, 'quest', `New quest: ${o.quest_add.title}`, { quest: o.quest_add.title, desc: o.quest_add.desc }); } }
  (o.quest_progress || []).forEach(p => { const q = c.quests.find(qq => qq.title.toLowerCase() === String(p.quest || '').toLowerCase()) || c.quests.find(qq => String(p.quest || '').toLowerCase().includes(qq.title.toLowerCase())); if (!q) return; const i = parseInt(p.objective, 10); const ob = q.objectives[i]; if (ob && !ob.done && ob.k.startsWith('ai:')) { ob.done = true; E.addLog(c, 'quest', `✔ ${ob.t}`, { quest: q.title }); if (q.objectives.every(z => z.done)) E.completeQuest(c, q); } });
  if (o.spawn && o.spawn.length && s) {
    const pc = E.pcTokens(c)[0]; let n = 0;
    o.spawn.slice(0, 3).forEach(sp => { if (!R.BESTIARY[sp.monster]) return; for (let i = 0; i < Math.min(4, parseInt(sp.count, 10) || 1) && n < 6; i++, n++) { const [x0, y0] = E.freeSpotNear(s, pc.x + (Math.random() < .5 ? -4 : 4), pc.y - 4); const m = E.monsterToken(c, sp.monster, x0, y0, { enc: 'ai_' + E.uid(2) }); s.tokens.push(m); if (c.turn.mode === 'combat') c.turn.order.push({ kind: 'monster', tokenId: m.id, init: 10 }); } });
    if (n) { E.updateVision(c); if (c.turn.mode !== 'combat' && (o.start_combat || true)) { E.startCombat(c); return; } }
  }
  if (o.start_combat && c.turn.mode !== 'combat' && E.activeMonsters(c).length) { E.startCombat(c); return; }
  if (o.request_roll && o.request_roll.character) {
    const ch = findChar(o.request_roll.character);
    if (ch && !ch.dead) {
      const rr = o.request_roll;
      c.turn.phase = 'roll'; c.turn.pendingRoll = { charId: ch.id, label: String(rr.label || 'Check').slice(0, 60), skill: R.SKILLS[rr.skill] ? rr.skill : null, ability: R.ABILITIES.includes(rr.ability) ? rr.ability : null, dc: parseInt(rr.dc, 10) || null };
      if (!c.turn.pendingRoll.skill && !c.turn.pendingRoll.ability) c.turn.pendingRoll.ability = 'wis';
      H.notifyUser(ch.ownerId, { title: `🎲 ${c.name}: ${c.turn.pendingRoll.label}!`, body: `${ch.name}, the DM needs a roll.`, url: `/?c=${c.id}`, tag: 'turn-' + c.id }, c);
      return;
    }
  }
  if (kind === 'npc') return;
  if (c.turn.phase === 'dm') OPS.resumeOrAdvance(c);
}

async function runOutline(c) {
  const sys = `You design D&D 5e one-shot adventures for teens (PG-13, or family-friendly if asked) to be played on phones. No gore, no sexual content, no real-world hate. Output ONLY JSON.`;
  const user = `Write an adventure for this premise: "${c.premise}". Party: ${Object.values(c.characters).map(ch => `${ch.name} the ${ch.race} ${ch.class}`).join(', ')} (level 1).
Use ONLY these monster keys: ${Object.keys(R.BESTIARY).join(', ')}. Site themes must be one of: forest, road, cave, dungeon, seacave, coastroad, causeway, cellar.
JSON shape: {"title": string, "premise": string (2 sentences), "hook": string (3-4 vivid sentences read aloud at the start), "ending": string (3 sentences for when they win), "questTitle": string,
"town": {"name": string, "desc": string, "coastal": bool, "npcs": [ {"name": string, "role": string, "desc": string (one line), "secret": string, "shop": "smith"|"temple"|"general"|null, "inn": bool, "topics": {"question": "answer in their voice", ...2-3 topics}} x4-5 — the FIRST npc is the quest giver; include one innkeeper (inn true) and one shop ]},
"sites": [ {"name": string, "theme": string, "desc": string, "encounters": [{"monsters": [keys]} x2-3 (level-1 appropriate: 2-4 weak monsters each)], "clue": string (a discovery that reveals part of the mystery), "clueName": string, "trap": string} x3 — the LAST site has "boss": key and "minions": [keys] ]}`;
  const o = await call(sys, user, 4000);
  ADV.fromOutline(c, o); delete c.pendingOutline; c.status = 'lobby'; OPS.beginAdventure(c);
  c.members.forEach(id => H.notifyUser(id, { title: `📜 ${c.name} has begun!`, body: c.adventure.title, url: `/?c=${c.id}` }, c));
}
async function runNext(c) {
  const lvl = E.avgLevel(c);
  const sys = `You design D&D 5e adventure chapters for teens (PG-13). Output ONLY JSON.`;
  const user = `The party (level ${lvl}: ${Object.values(c.characters).map(ch => `${ch.name} the ${ch.race} ${ch.class}`).join(', ')}) just finished "${c.adventure.title}" (${c.adventure.premise}). DM notes: ${(c.notes || []).slice(-10).join(' | ')}.
Design the NEXT chapter, starting from their home town. Monster keys allowed: ${Object.keys(R.BESTIARY).join(', ')}.
JSON: {"name": "The X of Y" (the dungeon's name), "theme": "forest"|"cave"|"dungeon", "hook": string (2-3 sentences), "desc": string (dungeon description, 1-2 sentences), "roadName": string, "roadDesc": string, "giver": {"name": string, "role": string, "desc": string}, "secret": string (the giver's secret), "topics": {"question": "answer", ...2 topics}, "boss": key, "clue": string, "clueName": string, "questTitle": string}`;
  const o = await call(sys, user, 1500);
  if (o.giver && !o.giver.look) o.giver.look = { skin: '#e0b48a', hair: '#4a2c17', cloak: '#5b6f86', hairStyle: 1 };
  if (!['forest', 'cave', 'dungeon'].includes(o.theme)) o.theme = 'dungeon';
  if (!R.BESTIARY[o.boss]) delete o.boss;
  OPS.addNextAdventure(c, lvl, c.startScene, o);
}

module.exports = { stateText, setHooks, queue, active, enabled, clearLibCache, MODEL };
