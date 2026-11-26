// The wider realm: several towns on a world map, travel with road encounters, faction reputation,
// and personal side-quests built from each hero's backstory.
const R = require('../public/rules.js');
const E = require('./engine');
const ADV = require('./adventure');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const uid = () => Math.random().toString(36).slice(2, 7);

const TOWN_POOL = [
  { key: 'thornwick', name: 'Thornwick', biome: 'forest', faction: 'circle', x: 24, y: 38, desc: 'A village of mossy roofs and rope bridges, deep in the old wood.' },
  { key: 'ironhold', name: 'Ironhold', biome: 'mountain', faction: 'crown', x: 70, y: 18, desc: 'A walled mountain town of forges, banners and grumpy dwarves.' },
  { key: 'mirefall', name: 'Mirefall', biome: 'swamp', faction: 'guild', x: 16, y: 74, desc: 'A stilt-town above black water, where nobody asks your real name.' },
  { key: 'brightwater', name: 'Brightwater', biome: 'coast', faction: 'temple', x: 84, y: 60, desc: 'A white-stone harbor city ringing with temple bells.' }
];
const EDGES = [['hub', 'thornwick'], ['hub', 'mirefall'], ['hub', 'brightwater'], ['thornwick', 'ironhold'], ['thornwick', 'mirefall'], ['ironhold', 'brightwater']];
const FIRST = ['Agnes', 'Bram', 'Cora', 'Dunstan', 'Elsie', 'Fenwick', 'Gilda', 'Hob', 'Imelda', 'Jory', 'Katla', 'Lorne', 'Mabel', 'Nils', 'Orla', 'Percival', 'Quill', 'Rosalind', 'Sten', 'Tamsin', 'Ulric', 'Vera', 'Wendel', 'Yara'];
const LAST = ['Bramblefoot', 'Copperkettle', 'Duskwater', 'Fernwhistle', 'Goldbarrow', 'Hollowell', 'Ironsides', 'Mossgrave', 'Oakenshield', 'Pebbleworth', 'Quickfinger', 'Saltmarsh', 'Thistledown', 'Underbough'];
const SKINS = ['#f6d3b3', '#e0b48a', '#c68e5e', '#8d5a3a', '#5c3a24'];
const HAIRS = ['#1d140e', '#4a2c17', '#8a5a2b', '#d9a62e', '#e8e0d0', '#b5452c', '#5a5a5a'];
const CLOAKS = ['#b5452c', '#2f5b9a', '#4f8a3a', '#8a4fa3', '#3b3b46', '#d9a62e', '#c7782e', '#5b6f86'];
const look = (o = {}) => Object.assign({ skin: pick(SKINS), hair: pick(HAIRS), cloak: pick(CLOAKS), hairStyle: Math.floor(Math.random() * 8) }, o);
const person = () => `${pick(FIRST)} ${pick(LAST)}`;

function rep(c) { c.rep = c.rep || {}; Object.keys(R.FACTIONS).forEach(k => { if (c.rep[k] == null) c.rep[k] = 0; }); return c.rep; }
function changeRep(c, fac, n, why) {
  if (!R.FACTIONS[fac] || !n) return; const r = rep(c); const before = R.repTier(r[fac]).n;
  r[fac] = Math.max(-100, Math.min(100, r[fac] + n));
  const F = R.FACTIONS[fac]; const after = R.repTier(r[fac]);
  E.addLog(c, 'system', `${F.icon} ${F.name} ${n > 0 ? 'approves' : 'disapproves'}${why ? ` (${why})` : ''}: ${n > 0 ? '+' : ''}${n} rep${after.n !== before ? ` — you are now ${after.icon} ${after.n}!` : ''}`);
}
function townFaction(c, sceneKey) { const node = c.world && Object.values(c.world.nodes).find(n => n.scene === sceneKey); return node ? node.faction : null; }
function priceMult(c) { const f = townFaction(c, c.sceneId); return f ? R.repTier(rep(c)[f]).disc : 1; }

function makeTown(c, T) {
  const npcs = [];
  const add = (k, n) => { c.npcs[k] = Object.assign({ key: k, met: false, revealed: false, scene: T.key, look: look() }, n); npcs.push(k); };
  const F = R.FACTIONS[T.faction];
  add(`${T.key}_inn`, { name: person(), role: `Innkeeper, the ${pick(['Sleepy', 'Rusty', 'Dancing', 'Lucky', 'Crooked'])} ${pick(['Boar', 'Lantern', 'Kettle', 'Otter', 'Crown'])}`, desc: 'Busy, chatty, always polishing a mug.', inn: true,
    topics: { Rumors: pick([`Folk say ${F.name} runs this town, whatever the mayor thinks.`, 'Strange lights on the road at night. Nobody goes out after dark anymore.', 'A traveling wizard paid in gold that turned into leaves the next morning!']), 'A room': 'A warm bed and a hot meal: 5 gold for the whole party. Sleep well!' } });
  add(`${T.key}_smith`, { name: person(), role: 'Blacksmith', desc: 'Soot-covered and proud of every blade.', shop: R.SHOP_SMITH.slice(), topics: { Weapons: 'Best steel this side of the mountains. Take a look.' } });
  add(`${T.key}_priest`, { name: person(), role: 'Village healer', desc: 'Gentle hands, tired eyes.', shop: R.SHOP_TEMPLE.slice(), heals: true, look: look({ cloak: '#f3e6cc' }), topics: { Healing: 'I can mend wounds, cure poison, and — for a price — even call back the fallen.' } });
  add(`${T.key}_merchant`, { name: person(), role: 'Trader', desc: 'Has a little of everything, and a story for each.', shop: R.SHOP_GENERAL.slice(), topics: { Wares: 'Rope, potions, torches — adventurers always need more torches.' } });
  add(`${T.key}_agent`, { name: person(), role: `${F.icon} Agent of ${F.name}`, desc: F.desc, look: look({ cloak: { watch: '#5b6f86', guild: '#3b3b46', circle: '#4f8a3a', temple: '#f3e6cc', crown: '#8a4fa3' }[T.faction] }), faction: T.faction,
    topics: { [`About ${F.name}`]: `${F.desc} Help folk around here and we'll remember it — so will the shopkeepers.`, 'How do I earn your trust?': { circle: 'Protect the forest. Rid it of things that do not belong.', crown: 'Keep the roads safe. Bring down giants, bandits and worse.', guild: 'Do jobs, keep secrets, and never rat on a friend.', temple: 'Put the restless dead back to rest and heal the hurt.', watch: 'Stop the raiders and smugglers.' }[T.faction] } });
  c.sceneDefs[T.key] = { name: T.name, kind: 'town', theme: 'town', sea: T.biome === 'coast', biome: T.biome, desc: T.desc, npcs, exits: [{ to: '__world', label: '🗺️ Road out of town' }], pois: [{ type: 'shrine', name: 'Town shrine' }, { type: 'clue', name: 'Notice board', text: `WELCOME TO ${T.name.toUpperCase()}. By order of ${F.name}: be kind, pay your tab, and report monsters to the authorities.` }] };
}

// set up the realm around the campaign's starting town (safe to call more than once)
function setup(c) {
  if (c.world) return c.world;
  const hub = c.startScene; if (!c.sceneDefs || !c.sceneDefs[hub]) return null;
  rep(c);
  const nodes = { hub: { key: 'hub', name: c.sceneDefs[hub].name, scene: hub, kind: 'town', x: 52, y: 64, faction: c.sceneDefs[hub].faction || 'watch', biome: c.sceneDefs[hub].sea ? 'coast' : 'road', discovered: true } };
  TOWN_POOL.forEach(T => { const key = c.sceneDefs[T.key] ? T.key + '_' + uid() : T.key; const T2 = Object.assign({}, T, { key }); makeTown(c, T2); nodes[T.key] = { key: T.key, name: T.name, scene: key, kind: 'town', x: T.x, y: T.y, faction: T.faction, biome: T.biome, discovered: false }; });
  const hd = c.sceneDefs[hub]; hd.exits = hd.exits || []; if (!hd.exits.some(e => e.to === '__world')) hd.exits.push({ to: '__world', label: '🗺️ Road out of town' });
  const hs = c.scenes && c.scenes[hub];
  if (hs && !hs.pois.some(p => p.to === '__world')) { const [x, y] = E.freeSpotNear(hs, hs.entry[0], Math.max(1, hs.entry[1] - 2)); hs.pois.push({ id: uid(), type: 'exit', x, y, name: '🗺️ Road out of town', to: '__world' }); }
  c.world = { nodes, edges: EDGES.slice(), at: 'hub', trips: 0 };
  return c.world;
}
function nodeOfScene(c, sceneKey) { return c.world && Object.values(c.world.nodes).find(n => n.scene === sceneKey); }
function neighbors(c, key) { return c.world.edges.filter(e => e.includes(key)).map(e => e[0] === key ? e[1] : e[0]); }

function travel(c, toKey, H) {
  const W = setup(c); if (!W) return { error: 'No map yet' };
  if (c.turn.mode === 'combat') return { error: "You can't travel in the middle of a fight!" };
  const here = nodeOfScene(c, c.sceneId) || W.nodes[W.at]; const to = W.nodes[toKey]; if (!to) return { error: 'Unknown place' };
  if (here && here.key === toKey) return { error: "You're already here" };
  if (here && !neighbors(c, here.key).includes(toKey)) return { error: `No road from ${here.name} to ${to.name} — go through another town` };
  W.trips++; const lvl = Math.max(1, E.avgLevel(c));
  E.addLog(c, 'narration', `🗺️ The party sets out for ${to.name}. ${pick(['The road winds through hills and hollows.', 'Rain drums on your hoods for hours.', 'Birdsong follows you for miles.', 'A cold wind pushes at your backs.'])}`, { who: 'DM' });
  // road encounter?
  if (Math.random() < 0.4) {
    const key = `roadenc_${W.trips}`; const biome = to.biome === 'town' ? 'road' : to.biome;
    c.sceneDefs[key] = { name: `The road to ${to.name}`, kind: 'wild', theme: biome === 'forest' || biome === 'swamp' ? 'forest' : biome === 'coast' ? 'coastroad' : 'road', biome, desc: 'Something is waiting on the road ahead.',
      encounters: [{ m: ADV.buildEncounter(biome, lvl, Math.max(1, Object.keys(c.characters).length), 'medium'), where: 'mid' }],
      pois: [{ type: 'chest', name: "A traveler's lost pack", loot: { gold: `${1 + lvl}d6`, items: [pick(['potion_healing', 'rations', 'alch_fire'])] }, where: 'far' }],
      exits: [{ to: to.scene, label: `Continue to ${to.name}`, where: 'far' }, ...(here ? [{ to: here.scene, label: `Back to ${here.name}`, where: 'near' }] : [])] };
    E.enterScene(c, key, here ? here.scene : null); E.buildExploreOrder(c);
    E.addLog(c, 'alert', `⚠️ Trouble on the road to ${to.name}!`);
    return { ok: true, encounter: true };
  }
  arrive(c, to);
  return { ok: true };
}
let WH = null; function setHooks(h) { WH = h; }
function arrive(c, to) { E.enterScene(c, to.scene, null); E.buildExploreOrder(c); }
// any arrival in a town (map travel or walking in from a road) marks it, greets the party and seeds its adventure
function onEnter(c, key) {
  const to = nodeOfScene(c, key); if (!to) return; to.discovered = true; c.world.at = to.key;
  if (to.faction && c._lastTown !== to.key) { const t = R.repTier(rep(c)[to.faction]); E.addLog(c, 'system', `${R.FACTIONS[to.faction].icon} ${R.FACTIONS[to.faction].name} holds sway in ${to.name}. They see you as: ${t.icon} ${t.n}.`); }
  if (c._lastTown !== to.key) E.addLog(c, 'title', to.name, { premise: c.sceneDefs[to.scene].desc });
  c._lastTown = to.key;
  if (!to.seeded && to.key !== 'hub' && WH && WH.addAdventure) { to.seeded = true; WH.addAdventure(c, Math.max(1, E.avgLevel(c)), to.scene, { theme: to.biome, faction: to.faction }); }
}

// ---------- backstory hooks ----------
const HOOKS = [
  { re: /\b(brother|sister|mother|father|mom|dad|mum|uncle|aunt|grand(?:ma|pa|mother|father)|cousin|son|daughter|twin|family)\b/i, theme: 'dungeon', boss: ['bandit_captain', 'cult_leader', 'thug', 'hobgoblin_captain'], title: (n, m) => `${n}'s Lost ${cap(m)}`, hook: (n, m) => `Someone in this town has news of ${n}'s ${m}. They were taken to a hideout nearby.` },
  { re: /\b(dragon|wyrm|drake)\b/i, theme: 'cave', boss: ['red_wyrmling', 'white_wyrmling', 'black_wyrmling', 'young_green', 'young_red'], title: (n) => `${n} and the Dragon`, hook: (n) => `Scorched sheep, melted rocks... a dragon has been seen nearby — maybe the very one from ${n}'s past.` },
  { re: /\b(revenge|killed|murder(?:ed)?|betray(?:ed)?|rival|nemesis)\b/i, theme: 'dungeon', boss: ['assassin', 'veteran', 'bandit_captain', 'knight', 'death_knight'], title: (n) => `${n}'s Reckoning`, hook: (n) => `The one who wronged ${n} has been spotted. Time to settle the score.` },
  { re: /\b(owe|owes|debt|loan|gambl)/i, theme: 'cave', boss: ['thug', 'bandit_captain', 'ogre', 'bugbear_chief'], title: (n) => `${n}'s Debt`, hook: (n) => `A collector is asking around for ${n}. Pay up — or do them a dangerous favor.` },
  { re: /\b(stolen|lost|heirloom|treasure|map|sword|amulet|ring)\b/i, theme: 'dungeon', boss: ['mimic', 'ogre', 'flesh_golem', 'mummy'], title: (n) => `${n}'s Heirloom`, hook: (n) => `Someone saw an item matching ${n}'s description in a ruin outside town.` },
  { re: /\b(curse|cursed|witch|hag|spell)\b/i, theme: 'swamp', boss: ['green_hag', 'sea_hag', 'night_hag'], title: (n) => `${n}'s Curse`, hook: (n) => `A witch in the marsh knows the truth about ${n}'s curse.` },
  { re: /\b(ghost|undead|haunt|necromancer|grave)/i, theme: 'dungeon', boss: ['wight', 'ghost', 'mummy', 'wraith'], title: (n) => `The Ghosts of ${n}'s Past`, hook: (n) => `The dead are restless — and one of them keeps whispering ${n}'s name.` },
  { re: /\b(sea|ship|pirate|ocean|sail|shipwreck)/i, theme: 'coast', boss: ['merrow', 'sahuagin', 'hunter_shark', 'giant_octopus'], title: (n) => `${n} and the Deep`, hook: (n) => `A wreck washed ashore bearing a flag ${n} knows well.` },
  { re: /\b(wolf|forest|druid|beast|hunt)/i, theme: 'forest', boss: ['owlbear', 'werewolf', 'dire_wolf', 'brown_bear'], title: (n) => `The Beast that Haunts ${n}`, hook: (n) => `Hunters found tracks — huge ones — near where ${n} grew up.` }
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function personalQuest(c, ch, H) {
  if (!ch || ch.personalQuest || !c.world) return null;
  const bs = String(ch.backstory || ''); let h = HOOKS.find(x => x.re.test(bs)); const m = h && (bs.match(h.re) || [])[1];
  if (!h) h = { theme: 'road', boss: ['ogre', 'bandit_captain', 'owlbear', 'troll'], title: (n) => `${n} Makes a Name`, hook: (n) => `A bard is looking for a hero to write a song about. ${n} could be the one — if they can prove it.` };
  const lvl = Math.max(1, ch.level);
  const ok = h.boss.filter(k => R.BESTIARY[k] && R.crNum(R.BESTIARY[k].cr) <= Math.max(1, lvl + 1));
  const boss = ok.length ? ok[ok.length - 1] : h.boss[0];
  const towns = Object.values(c.world.nodes).filter(n => n.kind === 'town' && n.key !== 'hub'); const town = pick(towns.length ? towns : Object.values(c.world.nodes));
  const save = { chapter: c.adventure.chapter, title: c.adventure.title };
  c._pq = (c._pq || 100) + 1; c.adventure.chapter = c._pq - 1;
  const g = { name: person(), role: `Knows ${ch.name}'s past`, desc: 'Watches you like they have been waiting a long time.', look: look() };
  const r = ADV.generateNext(c, lvl, town.scene, { theme: h.theme, boss, giver: g, hook: h.hook(ch.name, m || 'family'), questTitle: `⭐ ${h.title(ch.name, m || 'family')}`, name: undefined,
    topics: { [`About ${ch.name}`]: `"${bs.slice(0, 160)}${bs.length > 160 ? '…' : ''}" — yes, I know that story. Better than you think.` } });
  c.adventure.chapter = save.chapter; c.adventure.title = save.title;
  const q = c.quests[c.quests.length - 1]; q.personal = ch.id; q.faction = town.faction; q.reward = Object.assign({}, q.reward, { xp: Math.round((q.reward?.xp || 300) * 0.8) });
  const hd = c.sceneDefs[town.scene]; hd.exits = hd.exits || []; hd.exits.push({ to: r.roadKey, label: c.sceneDefs[r.roadKey].name }); hd.npcs = hd.npcs || []; hd.npcs.push(r.giverKey);
  if (c.scenes[town.scene] && H && H.placeGiver) H.placeGiver(c, town.scene, r);
  ch.personalQuest = q.id;
  E.addLog(c, 'quest', `⭐ A personal story for ${ch.name}: someone in ${town.name} knows about their past…`, { who: ch.name });
  return q;
}

// event hooks from the engine
E.EV.onQuestDone = (c, q) => { if (!c.world) return; const f = q.faction || nodeOfScene(c, c.sceneId)?.faction || 'watch'; changeRep(c, f, q.personal ? 10 : 15, `quest: ${q.title.replace(/^⭐ /, '')}`); };
E.EV.onKill = (c, t) => {
  if (!c.world) return; const M = R.BESTIARY[t.mkey] || {}; c._repTick = c._repTick || {};
  const bump = (f, why) => { const k = f + ':' + c.sceneId + ':' + (c.turn.round || 0); if (c._repTick[k]) return; c._repTick[k] = 1; changeRep(c, f, 2, why); };
  if (M.type === 'undead') bump('temple', 'put the dead to rest');
  else if (/bandit|thug|smuggler|cult|pirate/.test(t.mkey)) bump('watch', 'stopped outlaws');
  else if (M.type === 'giant' || /orc|hobgoblin|gnoll|bugbear/.test(t.mkey)) bump('crown', 'kept the roads safe');
  else if (['aberration', 'fiend', 'ooze'].includes(M.type)) bump('circle', 'cleansed the wild');
  if (Object.keys(c._repTick).length > 200) c._repTick = {};
};
E.EV.onEnter = onEnter;

module.exports = { setHooks, setup, travel, arrive, rep, changeRep, priceMult, townFaction, personalQuest, neighbors, nodeOfScene };
