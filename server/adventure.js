// Adventure loading: the built-in module, procedural follow-up adventures, and AI-written outlines.
const R = require('../public/rules.js');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 8);

function installModule(c, mod) {
  mod = mod || R.ADVENTURE;
  c.adventure = { key: mod.key, title: mod.title, premise: mod.premise, ending: mod.ending, hook: mod.hook, chapter: 1 };
  c.sceneDefs = clone(mod.scenes);
  c.npcs = {};
  Object.entries(clone(mod.npcs)).forEach(([k, n]) => { c.npcs[k] = Object.assign({ key: k, met: false, revealed: false, scene: null }, n); });
  // place module npcs in scenes
  Object.entries(c.sceneDefs).forEach(([sk, s]) => { (s.npcs || []).forEach(nk => { if (c.npcs[nk]) c.npcs[nk].scene = sk; }); if (s.prisoner && c.npcs[s.prisoner.npc]) { c.npcs[s.prisoner.npc].scene = sk; c.npcs[s.prisoner.npc].chained = true; } });
  c.quests = mod.quests.map(q => Object.assign(clone(q), { status: q.main ? 'active' : 'hidden', objectives: q.objectives.map(o => ({ k: o.k, t: o.t, done: false })) }));
  c.startScene = mod.start;
}

const ADJ = ['Whispering', 'Sunken', 'Burning', 'Forgotten', 'Howling', 'Crimson', 'Shattered', 'Weeping', 'Ashen', 'Moonless', 'Thornbound', 'Gilded'];
const PLACE = { forest: ['Wood', 'Thicket', 'Glade', 'Hollow'], cave: ['Grotto', 'Warren', 'Caverns', 'Mines'], dungeon: ['Crypt', 'Keep', 'Vault', 'Catacombs', 'Tomb'], road: ['Pass', 'Crossing', 'Ridge'] };
const HOOKS = {
  forest: ['Woodcutters have stopped coming home from the {name}.', 'Something in the {name} is stealing children\'s laughter — literally. The village is silent.', 'A hunter staggered out of the {name}, babbling about eyes in the trees.'],
  cave: ['Miners broke into the {name} and something broke out.', 'Livestock vanish every night. The tracks lead into the {name}.', 'A treasure map points to the {name}. So does a trail of very large footprints.'],
  dungeon: ['The seal on the {name} cracked during last night\'s storm. Lights burn inside.', 'A dying knight begs you to finish what she started in the {name}.', 'Gravediggers swear the dead in the {name} are walking again.']
};
const GIVERS = [
  { name: 'Captain Roswyn Hale', role: 'Town watch captain', desc: 'Stern, scarred, honest.', look: { skin: '#c68e5e', hair: '#1d140e', cloak: '#5b6f86', hairStyle: 0 } },
  { name: 'Mother Agna', role: 'Hedge witch', desc: 'Ancient, cackling, knows too much.', look: { skin: '#9bc48a', hair: '#e8e0d0', cloak: '#4f8a3a', hairStyle: 1 } },
  { name: 'Lord Pellam Ashby', role: 'Nervous nobleman', desc: 'Sweaty, rich, desperate.', look: { skin: '#f6d3b3', hair: '#d9a62e', cloak: '#8a4fa3', hairStyle: 3 } },
  { name: 'Dagny Two-Axes', role: 'Retired adventurer', desc: 'One eye, two axes, zero patience.', look: { skin: '#e0b48a', hair: '#b5452c', cloak: '#b5452c', hairStyle: 2 } }
];

function scaleEnc(list, level) {
  const out = list.slice();
  if (level >= 3) out.push(list[0]);
  if (level >= 5) out.push(list[list.length - 1]);
  return out;
}
function bossFor(theme, level) {
  const pool = (R.BOSSES[theme] || R.BOSSES.dungeon).filter(k => { const m = R.BESTIARY[k]; const cr = eval(m.cr); return level <= 2 ? cr <= 1 : level <= 4 ? cr <= 3 : true; });
  return pick(pool.length ? pool : R.BOSSES[theme] || ['ogre']);
}

// Make a fresh adventure that starts from the hub town.
function generateNext(c, level, hubKey, outline) {
  const theme = outline?.theme || pick(['forest', 'cave', 'dungeon']);
  const name = outline?.name || `The ${pick(ADJ)} ${pick(PLACE[theme])}`;
  const n = (c.adventure?.chapter || 1) + 1;
  const roadKey = `road_${n}`, siteKey = `site_${n}`;
  const table = R.ENCOUNTER_TABLES[theme] || R.ENCOUNTER_TABLES.dungeon;
  const boss = outline?.boss && R.BESTIARY[outline.boss] ? outline.boss : bossFor(theme, level);
  const giverKey = `giver_${n}`; const g = outline?.giver || pick(GIVERS);
  const hook = outline?.hook || pick(HOOKS[theme] || HOOKS.dungeon).replace('{name}', name);
  c.npcs[giverKey] = { key: giverKey, name: g.name, role: g.role, desc: g.desc, look: g.look, scene: hubKey, met: false, revealed: false, secret: outline?.secret || '',
    topics: Object.assign({ 'The trouble': hook, 'The way there': `Take the road out of town. You can't miss the ${name} — just follow the crows.` }, outline?.topics || {}), quest: `q${n}` };
  c.sceneDefs[roadKey] = { name: outline?.roadName || `Road to the ${name.replace(/^The /, '')}`, kind: 'wild', theme: theme === 'forest' ? 'forest' : 'road', desc: outline?.roadDesc || 'The road narrows. Birds go quiet.',
    encounters: [{ m: scaleEnc(pick(R.ENCOUNTER_TABLES.road.slice(0, Math.min(10, 4 + level))), level), where: 'mid' }],
    pois: [{ type: 'chest', name: 'Abandoned pack', loot: { gold: '2d10', items: [pick(['potion_healing', 'alch_fire', 'antitoxin'])] }, where: 'mid' }, { type: 'shrine', name: 'Wayside shrine', where: 'near' }],
    exits: [{ to: hubKey, label: 'Back to town', where: 'near' }, { to: siteKey, label: name, where: 'far' }] };
  const magic = pick(['w_p1_sword', 'w_p1_bow', 'cloak_prot', 'boots_striding', 'wand_mm', 'potion_heroism', 'ring_prot']);
  c.sceneDefs[siteKey] = { name, kind: 'dungeon', theme, dark: theme !== 'forest', desc: outline?.desc || `${name}. The air tastes of old iron and older secrets.`,
    encounters: [{ m: scaleEnc(pick(table), level), where: 'near' }, { m: scaleEnc(pick(table), level), where: 'mid' }, { m: scaleEnc(pick(table), level), where: 'far' }, { m: [boss, ...pick(table).slice(0, 1 + (level >= 3 ? 1 : 0))], where: 'boss', boss: true }],
    pois: [{ type: 'chest', loot: { gold: `${2 + level}d10`, items: ['potion_healing'] }, where: 'mid' }, { type: 'trap', name: pick(['Spiked pit', 'Poison needle', 'Swinging blade', 'Collapsing floor']), dc: 12 + Math.floor(level / 2), save: 'dex', dmg: `${1 + Math.floor(level / 2)}d6`, where: 'mid' },
      { type: 'trap', name: pick(['Glyph of warding', 'Fire jet']), dc: 13, save: 'dex', dmg: `${2 + Math.floor(level / 2)}d6`, where: 'far' }, { type: 'clue', name: outline?.clueName || 'Scrawled warning', text: outline?.clue || `Scratched into the wall: "It is not the ${R.BESTIARY[boss].name} you should fear. It is what it guards."`, where: 'far', check: { skill: 'investigation', dc: 11 } },
      { type: 'chest', name: 'The hoard', loot: { gold: `${5 + level * 2}d10`, items: [magic, 'potion_greater'] }, where: 'boss' }],
    exits: [{ to: roadKey, label: 'Back out', where: 'near' }] };
  c.quests.push({ id: `q${n}`, title: outline?.questTitle || name, giver: g.name, desc: hook, status: 'hidden', objectives: [{ k: `talk:${giverKey}`, t: `Hear out ${g.name}`, done: false }, { k: `enter:${siteKey}`, t: `Find ${name}`, done: false }, { k: `kill:${boss}`, t: `Defeat the ${R.BESTIARY[boss].name}`, done: false }, { k: `talk:${giverKey}`, t: `Return to ${g.name}`, done: false }],
    reward: { gold: 50 + level * 40, xp: 300 + level * 250, item: pick(['potion_greater', 'potion_heroism', 'scroll_fireball']) } });
  c.adventure.chapter = n; c.adventure.title = name;
  return { giverKey, roadKey, siteKey, name };
}

// Turn an AI outline into a playable adventure (validated, with safe fallbacks).
function fromOutline(c, o) {
  if (!o || !o.town || !Array.isArray(o.sites) || !o.sites.length) throw new Error('bad outline');
  const town = o.town;
  c.adventure = { key: 'custom', title: String(o.title || 'A New Adventure').slice(0, 60), premise: String(o.premise || c.premise || '').slice(0, 600), hook: String(o.hook || '').slice(0, 900), ending: String(o.ending || 'And so the tale is told — for now.').slice(0, 800), chapter: 1 };
  c.npcs = {}; c.quests = []; c.sceneDefs = {};
  const hub = 'hub';
  const npcKeys = [];
  (town.npcs || []).slice(0, 6).forEach((n, i) => {
    const k = 'npc' + i; npcKeys.push(k);
    const topics = {}; Object.entries(n.topics || {}).slice(0, 4).forEach(([q, a]) => { topics[String(q).slice(0, 40)] = String(a).slice(0, 400); });
    const shop = n.shop === 'smith' ? R.SHOP_SMITH : n.shop === 'temple' ? R.SHOP_TEMPLE : n.shop === 'general' ? R.SHOP_GENERAL : null;
    c.npcs[k] = { key: k, name: String(n.name || 'Stranger').slice(0, 40), role: String(n.role || '').slice(0, 50), desc: String(n.desc || '').slice(0, 200), secret: String(n.secret || '').slice(0, 300), topics, scene: hub, met: false, revealed: false, shop, inn: !!n.inn, heals: n.shop === 'temple',
      look: { skin: pick(['#f6d3b3', '#e0b48a', '#c68e5e', '#8d5a3a']), hair: pick(['#1d140e', '#4a2c17', '#d9a62e', '#e8e0d0', '#b5452c']), cloak: pick(['#b5452c', '#2f5b9a', '#4f8a3a', '#8a4fa3', '#5b6f86']), hairStyle: i % 4 } };
  });
  if (!Object.values(c.npcs).some(n => n.shop)) { const k = 'npc_shop'; c.npcs[k] = { key: k, name: 'Bettle Quickcoin', role: 'Merchant', desc: 'Sells everything, haggles about everything.', topics: { 'Wares': 'Have a look, have a look!' }, scene: hub, shop: R.SHOP_GENERAL, look: { skin: '#e0b48a', hair: '#4a2c17', cloak: '#d9a62e', hairStyle: 3 } }; npcKeys.push(k); }
  if (!Object.values(c.npcs).some(n => n.inn)) { const k = 'npc_inn'; c.npcs[k] = { key: k, name: 'Mags Underhill', role: 'Innkeeper', desc: 'Warm stew, warmer gossip.', topics: { 'Rumors': o.hook || 'Strange times, strange times.' }, scene: hub, inn: true, look: { skin: '#c68e5e', hair: '#b5452c', cloak: '#8a4fa3', hairStyle: 1 } }; npcKeys.push(k); }
  const sites = o.sites.slice(0, 3);
  const siteKeys = sites.map((s, i) => 'site' + i);
  const exits = [{ to: siteKeys[0], label: String(sites[0].name || 'The road').slice(0, 40) }];
  c.sceneDefs[hub] = { name: String(town.name || 'Town').slice(0, 40), kind: 'town', theme: 'town', sea: !!town.coastal, desc: String(town.desc || '').slice(0, 300), npcs: npcKeys, exits, pois: [{ type: 'shrine', name: 'Shrine' }, { type: 'clue', name: 'Notice board', text: String(o.hook || '').slice(0, 300) }] };
  const okTheme = (t) => ['forest', 'road', 'cave', 'dungeon', 'seacave', 'coastroad', 'causeway', 'cellar'].includes(t) ? t : 'dungeon';
  const okM = (arr) => (Array.isArray(arr) ? arr : []).map(String).filter(k => R.BESTIARY[k]).slice(0, 5);
  sites.forEach((s, i) => {
    const theme = okTheme(s.theme);
    const enc = (s.encounters || []).slice(0, 4).map((e, j) => ({ m: okM(e.monsters).length ? okM(e.monsters) : pick(R.ENCOUNTER_TABLES[theme] || R.ENCOUNTER_TABLES.dungeon), where: ['near', 'mid', 'far'][j % 3] }));
    if (i === sites.length - 1) { const b = R.BESTIARY[s.boss] ? s.boss : bossFor(theme === 'forest' ? 'forest' : 'dungeon', 1); enc.push({ m: [b, ...(okM(s.minions).length ? okM(s.minions) : [])], where: 'boss', boss: true }); c._bossKey = b; }
    const pois = [{ type: 'chest', loot: { gold: '3d10', items: ['potion_healing'] }, where: 'mid' }, { type: 'trap', name: String(s.trap || 'Hidden trap').slice(0, 40), dc: 12, save: 'dex', dmg: '1d6', where: 'mid' }];
    if (s.clue) pois.push({ type: 'clue', name: String(s.clueName || 'Something odd').slice(0, 40), text: String(s.clue).slice(0, 400), where: 'far', check: { skill: 'investigation', dc: 11 } });
    if (i === sites.length - 1) pois.push({ type: 'chest', name: 'Treasure', loot: { gold: '6d10', items: [pick(['w_p1_sword', 'ring_prot', 'cloak_prot', 'wand_mm']), 'potion_greater'] }, where: 'boss' });
    const ex = [{ to: i === 0 ? hub : siteKeys[i - 1], label: 'Go back', where: 'near' }];
    if (i < sites.length - 1) ex.push({ to: siteKeys[i + 1], label: String(sites[i + 1].name || 'Onward').slice(0, 40), where: 'far' });
    c.sceneDefs[siteKeys[i]] = { name: String(s.name || 'Unknown place').slice(0, 40), kind: theme === 'road' || theme === 'forest' || theme === 'coastroad' || theme === 'causeway' ? 'wild' : 'dungeon', theme, dark: ['cave', 'dungeon', 'seacave', 'cellar'].includes(theme), desc: String(s.desc || '').slice(0, 300), encounters: enc, pois, exits: ex };
  });
  const giver = npcKeys[0];
  c.quests.push({ id: 'main', main: true, title: String(o.questTitle || c.adventure.title).slice(0, 60), giver: c.npcs[giver].name, desc: String(o.hook || '').slice(0, 400), status: 'active',
    objectives: [{ k: `talk:${giver}`, t: `Talk to ${c.npcs[giver].name}`, done: false }, ...siteKeys.map((k, i) => ({ k: `enter:${k}`, t: `Reach ${c.sceneDefs[k].name}`, done: false })), { k: `kill:${c._bossKey}`, t: `Defeat the ${R.BESTIARY[c._bossKey].name}`, done: false }],
    reward: { gold: 150, xp: 600, item: 'potion_greater' } });
  c.npcs[giver].quest = 'main';
  delete c._bossKey;
  c.startScene = hub;
}

module.exports = { installModule, generateNext, fromOutline };
