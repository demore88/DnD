// Player & DM actions.
const R = require('../public/rules.js');
const E = require('./engine');
const ADV = require('./adventure');
const { cheb } = E;

let H = { queueAI() { }, aiActive() { return false; }, notifyUser() { }, notifyDM() { }, userName() { return '?'; } };
function setHooks(h) { H = Object.assign(H, h); }

const isDM = (c, u) => !!u && (c.dmUserId === u.id || c.ownerId === u.id);

function needTurn(c, ch, cost) {
  if (c.status !== 'active') return 'The adventure hasn\'t started';
  if (!ch) return 'Make a hero first';
  if (ch.hp <= 0) return ch.dead ? 'Your hero has died' : 'You\'re unconscious!';
  if (c.turn.mode !== 'combat') return null;
  if (E.currentUserId(c) !== ch.ownerId || E.currentEntry(c)?.charId !== ch.id) return 'Wait for your turn';
  if (c.turn.phase !== 'act') return c.turn.phase === 'roll' ? 'Roll the dice first!' : 'Waiting on the DM';
  if (cost === 'action' && !c.turn.res.action) return 'You\'ve used your action this turn';
  if (cost === 'bonus' && !c.turn.res.bonus) return 'You\'ve used your bonus action this turn';
  return null;
}
function spend(c, cost) { if (c.turn.mode !== 'combat' || !c.turn.res) return; if (cost === 'action') c.turn.res.action = 0; if (cost === 'bonus') c.turn.res.bonus = 0; }
function afterCombatAction(c) { E.checkCombatEnd(c); }

function handle(c, u, op, b) {
  const dm = isDM(c, u);
  const ch = Object.values(c.characters).find(x => x.ownerId === u.id);
  const s = E.scene(c);
  const t = ch && E.tokenOfChar(c, ch.id);
  const inCombat = c.turn.mode === 'combat';
  const myTurn = c.status === 'active' && E.currentUserId(c) === u.id;
  const tokenById = (id) => s && s.tokens.find(o => o.id === id);

  switch (op) {
    // ----- setup -----
    case 'character': {
      if (ch && !b.edit) return { error: 'You already have a hero here' };
      if (ch && b.edit) { if (b.name) ch.name = String(b.name).slice(0, 24); if (b.backstory != null) ch.backstory = String(b.backstory).slice(0, 500); if (b.look) Object.assign(ch.look, E.cleanLook(b.look)); if (t) t.name = ch.name; return { ok: true }; }
      if (Object.keys(c.characters).length >= 6) return { error: 'The party is full (6 heroes max)' };
      const nc = E.buildCharacter(u, b); c.characters[nc.id] = nc;
      E.addLog(c, 'system', `🧙 ${nc.name} the ${nc.race} ${nc.class} joins the party!`, { fx: { k: 'join' } });
      if (c.status === 'active' && s) { const [x, y] = E.freeSpotNear(s, s.entry[0], s.entry[1]); s.tokens.push({ id: E.uid(4), kind: 'pc', charId: nc.id, name: nc.name, x, y, conds: [] }); E.updateVision(c); if (inCombat) c.turn.order.push({ kind: 'pc', charId: nc.id, init: 0 }); else E.buildExploreOrder(c); }
      return { ok: true };
    }
    case 'start': {
      if (c.ownerId !== u.id) return { error: 'Only the campaign creator can start' };
      if (c.status !== 'lobby') return { error: 'Already started' };
      if (!Object.keys(c.characters).length) return { error: 'Make at least one hero first' };
      if (c.pendingOutline && H.aiActive(c)) { c.status = 'building'; H.queueAI(c, 'outline'); E.addLog(c, 'system', '🤖 The Dungeon Master is writing your adventure...'); return { ok: true }; }
      if (c.pendingOutline) { ADV.installModule(c); delete c.pendingOutline; E.addLog(c, 'system', '(No AI key yet, so you\'re playing the built-in adventure, The Drowned Bell.)'); }
      beginAdventure(c);
      c.members.forEach(id => { if (id !== u.id) H.notifyUser(id, { title: `📜 ${c.name} has begun!`, body: c.adventure.title, url: `/?c=${c.id}` }, c); });
      return { ok: true };
    }

    // ----- movement -----
    case 'move': {
      let mover = t; if (b.tokenId && dm && !H.aiActive(c)) mover = tokenById(b.tokenId) || t;
      if (!mover) return { error: 'No hero on the map' };
      const x = parseInt(b.x, 10), y = parseInt(b.y, 10);
      if (mover.kind === 'pc' && mover === t) {
        if (c.status !== 'active') return { error: 'The adventure hasn\'t started' };
        if (ch.hp <= 0) return { error: ch.dead ? 'Your hero has died' : 'You\'re unconscious!' };
        if (inCombat) { const err = needTurn(c, ch); if (err) return { error: err }; }
        if (c.turn.phase === 'dm' && !inCombat && false) return { error: 'Waiting on the DM' };
        if (E.hasCond(c, t, 'restrained')) return { error: 'You\'re restrained! Try to break free.' };
        if (E.hasCond(c, t, 'paralyzed') || E.hasCond(c, t, 'asleep')) return { error: 'You can\'t move!' };
        const budget = inCombat ? c.turn.res.move : 80;
        const p = E.pathTo(c, s, t, x, y, budget, { intoTrap: !!b.force });
        if (!p) return { error: inCombat ? `Can't reach that — ${c.turn.res.move} squares of movement left` : 'You can\'t get there' };
        const walked = E.walk(c, t, p.path);
        if (inCombat) c.turn.res.move -= Math.min(p.cost, c.turn.res.move);
        return { ok: true, path: walked };
      }
      if (!dm) return { error: 'Not your piece' };
      if (!E.walkable(s, x, y) || E.occupied(s, x, y, mover.id)) return { error: 'Blocked' };
      mover.x = x; mover.y = y; return { ok: true };
    }
    case 'gather': {
      if (inCombat) return { error: 'Not during combat' }; if (!t) return { error: 'No hero' };
      E.pcTokens(c).forEach(o => { if (o === t) return; const [x, y] = E.freeSpotNear(s, t.x, t.y, o.id, 3); o.x = x; o.y = y; });
      E.updateVision(c); E.addLog(c, 'system', `📣 ${ch.name} calls the party together.`); return { ok: true };
    }

    // ----- combat actions -----
    case 'attack': {
      const tgt = tokenById(b.targetId); if (!tgt || tgt.kind !== 'monster' || tgt.dormant && !tgt.revealed) return { error: 'Pick an enemy' };
      if (!inCombat) { if (tgt.dormant) E.wakeEncounter(c, tgt.enc); else E.startCombat(c); if (E.currentUserId(c) !== u.id) return { ok: true, note: 'Combat! Wait for your turn.' }; }
      const w = ch.weapons[parseInt(b.weapon, 10) || 0] || ch.weapons[0];
      if (b.offhand) {
        const err = needTurn(c, ch, 'bonus'); if (err) return { error: err };
        if (!c.turn.res.lightUsed || !w.light) return { error: 'Off-hand attacks need a light weapon after attacking with another light weapon' };
        if (cheb(t, tgt) > 1) return { error: 'Get next to it first' };
        spend(c, 'bonus'); E.pcAttack(c, ch, t, tgt, w, { offhand: true }); afterCombatAction(c); return { ok: true };
      }
      if (b.unarmedBonus) {
        const err = needTurn(c, ch, 'bonus'); if (err) return { error: err };
        if (!c.turn.res.attacked || !ch.features.includes('martial_arts')) return { error: 'Attack first, then use Martial Arts' };
        if (cheb(t, tgt) > 1) return { error: 'Get next to it first' };
        spend(c, 'bonus'); E.pcAttack(c, ch, t, tgt, E.makeWeapon('unarmed')); afterCombatAction(c); return { ok: true };
      }
      let err = needTurn(c, ch); if (err) return { error: err };
      if (c.turn.res.attacksLeft <= 0) { if (!c.turn.res.action) return { error: 'No attacks left — end your turn or use a bonus action' }; c.turn.res.action = 0; c.turn.res.attacksLeft = E.attacksPerAction(ch); }
      const range = w.range || (ch.features.includes('long_limbed') && !w.ranged ? 2 : 1); if (cheb(t, tgt) > range) return { error: `${tgt.name} is out of reach${range === 1 ? ' — move next to it' : ` (range ${range})`}` };
      if (b.reckless && ch.features.includes('reckless_attack') && !c.turn.res.attacked) { E.addCond(c, t, 'reckless', 1); }
      c.turn.res.attacksLeft--; c.turn.res.attacked = true; if (w.light && !w.ranged) c.turn.res.lightUsed = true;
      E.pcAttack(c, ch, t, tgt, w, { smite: !!b.smite, adv: b.reckless && ch.features.includes('reckless_attack') ? 'adv' : null });
      afterCombatAction(c); return { ok: true };
    }
    case 'cast': {
      const S = R.SPELLS[b.spell]; if (!S || !ch || !ch.spells.includes(b.spell)) return { error: 'You don\'t know that spell' };
      const cost = S.cast === 'bonus' ? 'bonus' : 'action';
      const err = needTurn(c, ch, cost); if (err) return { error: err };
      if (!inCombat && ['attack', 'save', 'auto', 'debuff', 'sleep'].includes(S.kind)) { const tg = tokenById(b.targetId); if (tg && tg.kind === 'monster') { E.startCombat(c); if (E.currentUserId(c) !== u.id) return { ok: true, note: 'Combat! Wait for your turn.' }; } else if (S.target !== 'area') return { error: 'No enemies around' }; }
      const r = E.castSpell(c, ch, t, b.spell, { id: b.targetId, x: b.x, y: b.y }, { slot: b.slot ? parseInt(b.slot, 10) : null });
      if (r.error) return r; spend(c, cost); afterCombatAction(c); return { ok: true };
    }
    case 'feature': {
      const k = b.key; const F = R.FEATURES[k]; if (!F || !ch.features.includes(k)) return { error: 'You don\'t have that ability' };
      const usesMax = E.featureUses(ch, k); if (usesMax != null && (ch.uses[k] || 0) >= usesMax) return { error: `No uses of ${F.name} left — rest to recover` };
      const cost = F.kind === 'free' ? 'free' : F.kind; const err = needTurn(c, ch, cost); if (err) return { error: err };
      const use = () => { ch.uses[k] = (ch.uses[k] || 0) + 1; };
      if (k === 'feline_agility') { if (!inCombat) return { error: 'Save it for a fight — out of combat you can already run anywhere' }; use(); spend(c, 'bonus'); c.turn.res.move += Math.floor(ch.speed / 5); E.addLog(c, 'feature', `🐈 ${ch.name} bursts into a blur of Feline Agility — double speed!`, { who: ch.name, fx: { k: 'buff', t: t.id, name: 'Feline Agility' } }); return { ok: true }; }
      if (k === 'healing_hands') { const tg = tokenById(b.targetId) || t; const tch = tg && E.charOfToken(c, tg); if (!tch || cheb(t, tg) > 1) return { error: 'Touch an ally (stand next to them)' }; if (tch.dead) return { error: 'Too late for healing hands — try the temple' }; use(); spend(c, 'action'); const h = E.heal(c, tg, E.rollDice(`${ch.level}d4`).total); E.addLog(c, 'feature', `😇 Light pours from ${ch.name}'s hands into ${tch.name}: +${h} HP`, { who: ch.name, fx: { k: 'heal', t: tg.id, amt: h } }); return { ok: true }; }
      if (k === 'shell_defense') { if (!inCombat) return { error: 'Only needed in combat' }; spend(c, 'action'); E.addCond(c, t, 'shelled', 1); E.addLog(c, 'feature', `🐢 ${ch.name} pulls into their shell! (+4 AC until their next turn)`, { who: ch.name, fx: { k: 'buff', t: t.id, name: 'Shell' } }); return { ok: true }; }
      if (k === 'hidden_step') { use(); spend(c, 'bonus'); E.addCond(c, t, 'hidden', 2); E.addLog(c, 'feature', `🍃 ${ch.name} takes a Hidden Step and fades from sight!`, { who: ch.name, fx: { k: 'buff', t: t.id, name: 'Invisible' } }); return { ok: true }; }
      if (k === 'hungry_jaws') {
        const tg = tokenById(b.targetId); if (!tg || tg.kind !== 'monster' || cheb(t, tg) > 1) return { error: 'Pick an adjacent enemy' };
        use(); spend(c, 'bonus'); const jaw = Object.assign(E.makeWeapon('unarmed'), { name: 'Hungry Jaws', dice: '1d6', type: 'piercing', ab: 'str' });
        const r = E.pcAttack(c, ch, t, tg, jaw); if (r.hit) { const tmp = Math.max(1, R.mod(ch.scores.con)); ch.temp = Math.max(ch.temp || 0, tmp); E.addLog(c, 'feature', `🦎 ${ch.name} gulps down the victory: +${tmp} temp HP`, { who: ch.name }); }
        afterCombatAction(c); return { ok: true };
      }
      if (k === 'rage') { if (!inCombat) return { error: 'Save your rage for a fight' }; use(); spend(c, 'bonus'); E.addCond(c, t, 'raging', 10); E.addLog(c, 'feature', `😤 ${ch.name} flies into a RAGE!`, { who: ch.name, fx: { k: 'buff', t: t.id, name: 'Rage' } }); return { ok: true }; }
      if (k === 'second_wind') { use(); spend(c, 'bonus'); const h = E.heal(c, t, E.rollDice('1d10').total + ch.level); E.addLog(c, 'feature', `💪 ${ch.name} catches a Second Wind: +${h} HP`, { who: ch.name, fx: { k: 'heal', t: t.id, amt: h } }); return { ok: true }; }
      if (k === 'action_surge') { if (!inCombat) return { error: 'Only in combat' }; use(); c.turn.res.action = 1; c.turn.res.attacksLeft = 0; E.addLog(c, 'feature', `⚡ ${ch.name} surges with ACTION SURGE — another action!`, { who: ch.name, fx: { k: 'buff', t: t.id, name: 'Action Surge' } }); return { ok: true }; }
      if (k === 'bardic_inspiration') { const tg = tokenById(b.targetId); if (!tg || tg.kind !== 'pc' || tg === t) return { error: 'Pick an ally' }; if (cheb(t, tg) > 12) return { error: 'Too far away' }; use(); spend(c, 'bonus'); E.addCond(c, tg, 'inspired', 100); E.addLog(c, 'feature', `🎵 ${ch.name} inspires ${tg.name} with a rousing verse! (+1d6 to their next roll)`, { who: ch.name, fx: { k: 'buff', t: tg.id, name: 'Inspired' } }); return { ok: true }; }
      if (k === 'lay_on_hands') { const tg = tokenById(b.targetId) || t; if (tg.kind !== 'pc' || cheb(t, tg) > 1) return { error: 'Touch an ally (stand next to them)' }; const tch = E.charOfToken(c, tg); const want = Math.min(ch.pool || 0, parseInt(b.amount, 10) || (tch.maxHp - Math.max(0, tch.hp))); if (want <= 0) return { error: 'Your healing pool is empty' }; ch.pool -= want; spend(c, 'action'); const h = E.heal(c, tg, want); E.addLog(c, 'feature', `🙌 ${ch.name} lays hands on ${tg.name}: +${h} HP`, { who: ch.name, fx: { k: 'heal', t: tg.id, amt: h } }); return { ok: true }; }
      if (k === 'flurry') { if (!ch.ki || ch.ki.used >= ch.ki.max) return { error: 'No ki left' }; if (!c.turn.res.attacked) return { error: 'Attack first, then Flurry' }; const tg = tokenById(b.targetId); if (!tg || tg.kind !== 'monster' || cheb(t, tg) > 1) return { error: 'Pick an adjacent enemy' }; ch.ki.used++; spend(c, 'bonus'); E.addLog(c, 'feature', `👊 ${ch.name} unleashes a Flurry of Blows!`, { who: ch.name }); for (let i = 0; i < 2 && !tg.gone; i++) E.pcAttack(c, ch, t, tg, E.makeWeapon('unarmed')); afterCombatAction(c); return { ok: true }; }
      if (k === 'turn_undead') { use(); spend(c, 'action'); const und = E.activeMonsters(c).filter(m => R.BESTIARY[m.mkey]?.type === 'undead' && cheb(m, t) <= 6); E.addLog(c, 'feature', `☀️ ${ch.name} raises a holy symbol: "BEGONE!"`, { who: ch.name, fx: { k: 'blast', x: t.x, y: t.y, r: 6, from: t.id, type: 'radiant' } }); und.forEach(m => { const sv = E.d20().pick + (m.boss ? 4 : 1); if (sv < E.spellDC(ch)) { E.addCond(c, m, 'turned', 10, t.id); E.addLog(c, 'system', `${m.name} is TURNED and flees!`); } else E.addLog(c, 'system', `${m.name} resists (${sv}).`); }); return { ok: true }; }
      if (k === 'breath_weapon') { const x = parseInt(b.x, 10), y = parseInt(b.y, 10); if (isNaN(x) || cheb(t, { x, y }) > 3) return { error: 'Pick a spot within 3 squares' }; use(); spend(c, 'action'); const dc = 8 + R.mod(ch.scores.con) + R.prof(ch.level); const dice = ch.level >= 6 ? '3d6' : '2d6'; E.addLog(c, 'feature', `🐲 ${ch.name} breathes elemental fury!`, { who: ch.name, fx: { k: 'blast', x, y, r: 1, from: t.id, type: 'fire' } }); E.activeMonsters(c).filter(m => cheb(m, { x, y }) <= 1).forEach(m => { const sv = E.d20().pick + 1; const ok = sv >= dc; let d = E.rollDice(dice).total; if (ok) d = Math.floor(d / 2); E.addLog(c, 'roll', `${m.name} DEX save ${sv} vs DC ${dc} — ${d} damage`, { fx: { k: 'dmg', t: m.id, dmg: d } }); E.damage(c, m, d, 'fire', { magic: true }); }); afterCombatAction(c); return { ok: true }; }
      return { error: `${F.name} works automatically` };
    }
    case 'basic': {
      const k = b.kind; const bonusOk = ch && b.bonus && (((ch.features.includes('cunning_action') || ch.features.includes('nimble_escape')) && ['dash', 'hide'].includes(k)) || (ch.features.includes('aggressive') && k === 'dash'));
      const cost = bonusOk ? 'bonus' : 'action'; const err = needTurn(c, ch, cost); if (err) return { error: err };
      if (k === 'dash') { if (!inCombat) return { error: 'Only needed in combat' }; spend(c, cost); c.turn.res.move += Math.floor(ch.speed / 5); E.addLog(c, 'system', `🏃 ${ch.name} dashes!`); return { ok: true }; }
      if (k === 'dodge') { spend(c, cost); E.addCond(c, t, 'dodging', 1); E.addLog(c, 'system', `💨 ${ch.name} takes the Dodge action — attacks against them have disadvantage.`); return { ok: true }; }
      if (k === 'hide') { spend(c, cost); const r = E.rollCheck(c, ch, t, 'stealth', 'Hide', null); const seen = E.activeMonsters(c).some(m => 10 + 1 >= r.total + 0 && cheb(m, t) <= 2); if (r.total >= 12 && !seen) { E.addCond(c, t, 'hidden', 2); E.addLog(c, 'system', `🫥 ${ch.name} slips out of sight. Next attack has advantage!`); } else E.addLog(c, 'system', `${ch.name} can't find a good hiding spot.`); return { ok: true }; }
      if (k === 'help') { const tg = tokenById(b.targetId); if (!tg || tg.kind !== 'pc' || tg === t || cheb(t, tg) > 1) return { error: 'Stand next to an ally to help them' }; spend(c, cost); E.addCond(c, tg, 'helped', 2); E.addLog(c, 'system', `🤝 ${ch.name} helps ${tg.name} — advantage on their next attack or check.`); return { ok: true }; }
      if (k === 'breakfree') { if (!E.hasCond(c, t, 'restrained')) return { error: 'You\'re not restrained' }; spend(c, cost); const r = E.rollCheck(c, ch, t, ch.scores.dex > ch.scores.str ? 'acrobatics' : 'athletics', 'Break free', 12); if (r.ok) { E.removeCond(c, t, 'restrained'); c.turn.res.move = Math.floor(ch.speed / 5); E.addLog(c, 'system', `${ch.name} breaks free!`); } return { ok: true }; }
      if (k === 'stabilize') { const tg = tokenById(b.targetId); const tch = tg && E.charOfToken(c, tg); if (!tch || tch.hp > 0 || tch.dead || cheb(t, tg) > 1) return { error: 'Stand next to a fallen ally' }; spend(c, cost); const r = E.rollCheck(c, ch, t, 'medicine', `Stabilize ${tch.name}`, 10); if (r.ok) { tch.stable = true; E.addLog(c, 'system', `🩹 ${tch.name} is stable.`); } return { ok: true }; }
      return { error: 'Unknown action' };
    }
    case 'item': {
      const it = ch && ch.inventory[parseInt(b.idx, 10)]; const I = it && R.ITEMS[it.k]; if (!I) return { error: 'No such item' };
      const cost = I.cast === 'bonus' && (!b.targetId || b.targetId === t.id) ? 'bonus' : 'action';
      const err = needTurn(c, ch, inCombat ? cost : null); if (err) return { error: err };
      if (!inCombat && I.use === 'throw') { const tg = tokenById(b.targetId); if (tg && tg.kind === 'monster') { E.startCombat(c); return { ok: true, note: 'Combat! Wait for your turn.' }; } }
      const r = E.useItem(c, ch, t, parseInt(b.idx, 10), b.targetId ? { id: b.targetId, x: b.x, y: b.y } : (b.x != null ? { x: b.x, y: b.y } : null));
      if (r.error) return r; spend(c, r.cost || cost); afterCombatAction(c); return { ok: true };
    }
    case 'endturn': {
      if (!myTurn && !dm) return { error: 'It\'s not your turn' };
      if (c.turn.phase === 'roll' && !dm) return { error: 'Roll the dice first!' };
      if (c.turn.phase === 'dm' && !dm) return { error: 'Waiting on the DM' };
      const e = E.currentEntry(c); if (c.turn.mode === 'combat' && t && e && e.charId === ch?.id) { E.removeCond(c, t, 'reckless'); }
      if (!inCombat) E.addLog(c, 'system', `${E.nameOfEntry(c, e)} ${myTurn ? 'passes the spotlight' : 'is skipped'}.`);
      else if (!myTurn) E.addLog(c, 'system', `The DM skips ${E.nameOfEntry(c, e)}'s turn.`);
      E.advance(c); return { ok: true };
    }
    case 'roll': {
      const pr = c.turn.pendingRoll;
      if (!pr || !ch || pr.charId !== ch.id) return { error: 'No roll needed right now' };
      if (pr.death) {
        const r = E.d20(null, ch.race === 'Halfling').pick; let txt = `💀 Death save: 🎲 ${r}`;
        if (r === 20) { ch.hp = 1; ch.deathFails = 0; ch.deathSaves = 0; txt += ' — NATURAL 20! Back up with 1 HP!'; }
        else if (r === 1) { ch.deathFails += 2; txt += ' — two failures!'; } else if (r >= 10) { ch.deathSaves++; txt += ` — success (${ch.deathSaves}/3)`; } else { ch.deathFails++; txt += ` — failure (${ch.deathFails}/3)`; }
        if (ch.deathSaves >= 3) { ch.stable = true; txt += ' — stable!'; }
        E.addLog(c, 'roll', txt, { who: ch.name, uid: u.id, fx: { k: 'check', d20: [r], pick: r, tot: r, ok: r >= 10, uid: u.id } });
        if (ch.deathFails >= 3) { ch.dead = true; E.addLog(c, 'alert', `☠️ ${ch.name} has died.`); }
        c.turn.pendingRoll = null; c.turn.phase = 'act';
        if (ch.hp <= 0) E.advance(c); else { c.turn.res = E.freshRes(c, ch); }
        return { ok: true };
      }
      const r = E.rollCheck(c, ch, t, pr.skill || pr.ability || 'wis', pr.label, pr.dc, b.adv);
      c.turn.pendingRoll = null; c.turn.phase = 'dm';
      if (H.aiActive(c)) H.queueAI(c, 'roll'); else H.notifyDM(c, `${ch.name} rolled ${r.total} for ${pr.label}`);
      return { ok: true };
    }
    case 'check': {
      if (!ch) return { error: 'Make a hero first' };
      const k = b.skill || b.ability; if (!R.SKILLS[k] && !R.ABILITIES.includes(k) && k !== 'save') return { error: 'Pick a skill' };
      if (b.formula) { const r = E.rollDice(b.formula); E.addLog(c, 'roll', `🎲 ${ch.name}${b.label ? ' — ' + String(b.label).slice(0, 30) : ''}: ${b.formula} → [${r.rolls.join(', ')}]${r.bonus ? E.fmtMod(r.bonus) : ''} = ${r.total}`, { who: ch.name, uid: u.id, fx: { k: 'free', tot: r.total, uid: u.id } }); return { ok: true, roll: r }; }
      const label = R.SKILLS[k] ? k.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) + ' check' : R.ABILITY_NAMES[k] + (b.save ? ' save' : ' check');
      if (b.save) { const r = E.d20(null, ch.race === 'Halfling'); const m = E.saveMod(ch, k); E.addLog(c, 'roll', `🎲 ${ch.name} — ${label}: ${r.pick}${E.fmtMod(m)} = ${r.pick + m}`, { who: ch.name, uid: u.id, fx: { k: 'check', d20: r.rolls, pick: r.pick, tot: r.pick + m, uid: u.id } }); return { ok: true }; }
      E.rollCheck(c, ch, t, k, label, null, b.adv); return { ok: true };
    }
    case 'freeroll': {
      const r = E.rollDice(String(b.formula || '1d20')); if (!r.rolls.length && !r.bonus) return { error: 'Try something like 2d6+1' };
      const who = ch ? ch.name : (dm ? 'DM' : H.userName(u.id));
      E.addLog(c, 'roll', `🎲 ${who}${b.label ? ' — ' + String(b.label).slice(0, 30) : ''}: ${b.formula} → [${r.rolls.join(', ')}]${r.bonus ? E.fmtMod(r.bonus) : ''} = ${r.total}`, { who, uid: u.id, fx: { k: 'free', tot: r.total, uid: u.id } });
      return { ok: true, roll: r };
    }

    // ----- exploration -----
    case 'interact': {
      if (!t) return { error: 'No hero on the map' }; if (ch.hp <= 0) return { error: 'You\'re unconscious!' }; if (inCombat) { const err = needTurn(c, ch, 'action'); if (err) return { error: err }; }
      const poi = s.pois.find(p => p.id === b.poiId); const mtok = b.tokenId && tokenById(b.tokenId);
      const target = poi || (mtok && mtok.disguise ? mtok : null); if (!target) return { error: 'Nothing there' };
      let walked = [];
      const reach = 1;
      const partyNear = target.type === 'exit' && !inCombat && E.pcTokens(c).some(o => cheb(o, target) <= 1) && cheb(t, target) <= 6;
      if (cheb(t, target) > reach && !partyNear) {
        // auto-walk next to it
        let best = null; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const p = E.pathTo(c, s, t, target.x + dx, target.y + dy, inCombat ? c.turn.res.move : 80); if (p && (!best || p.cost < best.cost)) best = p; }
        if (!best && target.type === 'exit') best = E.pathTo(c, s, t, target.x, target.y, inCombat ? c.turn.res.move : 80);
        if (!best) return { error: inCombat ? 'Too far to reach this turn' : 'You can\'t get there' };
        walked = E.walk(c, t, best.path); if (inCombat) c.turn.res.move -= best.cost;
        if ((cheb(t, target) > reach && !(target.type === 'exit' && cheb(t, target) <= 1)) || c.turn.mode !== (inCombat ? 'combat' : 'explore')) return { ok: true, path: walked };
      }
      if (mtok && mtok.disguise) { E.addLog(c, 'alert', `😱 The chest has TEETH! It's a MIMIC!`, { fx: { k: 'alert', ids: [mtok.id] } }); E.wakeEncounter(c, mtok.enc, 'monsters'); return { ok: true, path: walked }; }
      const r = E.interact(c, ch, t, poi); if (r.error) return Object.assign(r, { path: walked });
      if (r.spent && inCombat) spend(c, 'action');
      return { ok: true, path: walked };
    }
    case 'search': {
      if (!t) return { error: 'No hero' }; if (ch.hp <= 0) return { error: 'You\'re unconscious!' }; if (inCombat) { const err = needTurn(c, ch, 'action'); if (err) return { error: err }; }
      const r = E.searchArea(c, ch, t); if (r.error) return r; if (inCombat) spend(c, 'action'); return { ok: true };
    }
    case 'talk': {
      const n = c.npcs[b.npcKey]; if (!n) return { error: 'Nobody there' }; if (!ch) return { error: 'Make a hero first' };
      const tok = s && s.tokens.find(o => o.npcKey === n.key); if (!tok) return { error: `${n.name} isn't here` };
      const r = E.talk(c, ch, t, n, b.topic || null); return r;
    }
    case 'say': {
      const n = c.npcs[b.npcKey]; if (!n || !ch) return { error: 'Nobody to talk to' };
      const text = String(b.text || '').trim().slice(0, 400); if (!text) return { error: 'Say something' };
      n.met = true; E.addLog(c, 'say', text, { who: ch.name, uid: u.id, to: n.name });
      if (H.aiActive(c)) H.queueAI(c, 'npc', { npc: n.key, charId: ch.id, text });
      else { H.notifyDM(c, `${ch.name} says to ${n.name}: "${text.slice(0, 80)}"`); }
      return { ok: true };
    }
    case 'do': {
      const text = String(b.text || '').trim().slice(0, 1200); if (!text) return { error: 'Say what you do' };
      if (!ch) return { error: 'Make a hero first' };
      if (!myTurn) return { error: inCombat ? 'Wait for your turn' : `It's ${E.nameOfEntry(c, E.currentEntry(c))}'s spotlight — use chat, or move and explore freely` };
      if (c.turn.phase !== 'act') return { error: c.turn.phase === 'roll' ? 'Roll the dice first!' : 'Waiting on the DM' };
      if (inCombat) { if (!c.turn.res.action) return { error: 'You\'ve used your action' }; c.turn.res.action = 0; c.turn.resume = true; }
      E.addLog(c, 'action', text, { who: ch.name, uid: u.id });
      c.turn.phase = 'dm';
      if (H.aiActive(c)) H.queueAI(c, 'action'); else H.notifyDM(c, `${ch.name}: ${text.slice(0, 100)}`);
      return { ok: true };
    }
    case 'chat': { const text = String(b.text || '').trim().slice(0, 600); if (!text) return { error: 'Empty' }; E.addLog(c, 'chat', text, { who: ch ? ch.name : (dm ? 'DM' : H.userName(u.id)), uid: u.id }); return { ok: true }; }
    case 'buy': {
      const n = c.npcs[b.npcKey]; if (!n || !n.shop || !ch) return { error: 'No shop' }; if (!s.tokens.some(o => o.npcKey === n.key)) return { error: `${n.name} isn't here` };
      const I = R.ITEMS[b.item]; if (!I || !n.shop.includes(b.item)) return { error: 'They don\'t sell that' };
      if (ch.gold < I.price) return { error: 'Not enough gold' };
      ch.gold -= I.price; E.invAdd(ch, b.item); E.addLog(c, 'loot', `🛒 ${ch.name} buys ${I.name} for ${I.price} gold.`, { who: ch.name }); return { ok: true };
    }
    case 'sell': {
      const it = ch && ch.inventory[parseInt(b.idx, 10)]; const I = it && R.ITEMS[it.k]; if (!I || !I.price || I.story) return { error: 'Nobody wants to buy that' };
      if (!s.tokens.some(o => o.kind === 'npc' && c.npcs[o.npcKey]?.shop)) return { error: 'Find a shopkeeper first' };
      const p = Math.floor(I.price / 2); E.invRemove(ch, parseInt(b.idx, 10)); ch.gold += p; E.addLog(c, 'loot', `💰 ${ch.name} sells ${I.name} for ${p} gold.`); return { ok: true };
    }
    case 'equip': { if (!ch) return { error: 'no hero' }; return E.equipItem(c, ch, parseInt(b.idx, 10)); }
    case 'unequip': { if (!ch) return { error: 'no hero' }; return E.unequip(c, ch, b.what, parseInt(b.i, 10)); }
    case 'drop': { if (!ch) return { error: 'no hero' }; const it = ch.inventory[parseInt(b.idx, 10)]; if (!it) return { error: 'No item' }; if (R.ITEMS[it.k]?.story) return { error: 'You might need that!' }; E.invRemove(ch, parseInt(b.idx, 10), it.q); return { ok: true }; }
    case 'give': {
      if (!ch) return { error: 'no hero' }; const to = c.characters[b.toCharId]; const idx = parseInt(b.idx, 10); const it = ch.inventory[idx]; if (!to || !it || to === ch) return { error: 'Pick who gets it' };
      const tt = E.tokenOfChar(c, to.id); if (inCombat && tt && cheb(t, tt) > 1) return { error: 'Get next to them first' };
      E.invAdd(to, it.k, it.n, 1); E.invRemove(ch, idx, 1); E.addLog(c, 'system', `🤲 ${ch.name} gives ${it.n} to ${to.name}.`); return { ok: true };
    }
    case 'givegold': { if (!ch) return { error: 'no hero' }; const to = c.characters[b.toCharId]; const amt = Math.min(ch.gold, Math.max(0, parseInt(b.amount, 10) || 0)); if (!to || !amt) return { error: 'Nothing to give' }; ch.gold -= amt; to.gold += amt; E.addLog(c, 'system', `💰 ${ch.name} gives ${amt} gold to ${to.name}.`); return { ok: true }; }
    case 'levelup': { if (!ch) return { error: 'no hero' }; const r = E.levelUp(c, ch); if (!r) return { error: 'Not enough XP yet' }; return { ok: true, levelup: r }; }
    case 'rest': {
      if (inCombat) return { error: 'You can\'t rest in a fight!' };
      if (E.activeMonsters(c).length) return { error: 'Enemies are nearby!' };
      if (b.kind === 'short') { if (c.shortRests >= 2) return { error: 'You need a long rest (an inn, or camp in the wilds)' }; E.shortRest(c); return { ok: true }; }
      if (b.kind === 'camp') {
        if (s.kind === 'town') return { error: 'Rent a room at the inn instead' };
        const ambush = s.tokens.some(m => m.kind === 'monster' && m.dormant && !m.disguise) && E.d20().pick <= 8;
        if (ambush) { const m = s.tokens.find(x => x.kind === 'monster' && x.dormant && !x.disguise); E.addLog(c, 'alert', '🌙 You make camp... and in the dead of night, something finds you!'); const pc = E.pcTokens(c)[0]; s.tokens.filter(x => x.enc === m.enc).forEach(x => { const [nx, ny] = E.freeSpotNear(s, pc.x + 3, pc.y - 3, x.id); x.x = nx; x.y = ny; }); E.wakeEncounter(c, m.enc, 'monsters'); return { ok: true }; }
        E.longRest(c); return { ok: true };
      }
      return { error: 'Unknown rest' };
    }
    case 'nextadventure': {
      if (c.ownerId !== u.id) return { error: 'Only the campaign creator can start the next chapter' };
      const hub = c.startScene; const lvl = E.avgLevel(c);
      if (H.aiActive(c)) { H.queueAI(c, 'next'); E.addLog(c, 'system', '🤖 The Dungeon Master is dreaming up your next adventure...'); return { ok: true }; }
      addNextAdventure(c, lvl, hub, null); return { ok: true };
    }
    case 'visible': return { ok: true };
    case 'dbg_explore': {
      if (!process.env.TEST_OPS) return { error: 'no' };
      if (inCombat) return { ok: true, combat: true };
      let best = null, bd = 1e9; const st = E.scene(c);
      for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) { if (st.seen[y * st.w + x] !== '1' || !E.walkable(st, x, y)) continue; const fr = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => st.seen[(y + dy) * st.w + x + dx] === '0'); if (!fr) continue; const p = E.pathTo(c, st, t, x, y, 80); if (p && p.cost > 0 && p.cost < bd) { bd = p.cost; best = p; } }
      if (!best) { const dorm = st.tokens.find(m => m.kind === 'monster' && !m.gone && !m.disguise); if (dorm) { let b2 = null; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const p = E.pathTo(c, st, t, dorm.x + dx, dorm.y + dy, 80); if (p && (!b2 || p.cost < b2.cost)) b2 = p; } if (b2) { E.walk(c, t, b2.path); return { ok: true, moved: true }; } } return { ok: true, done: true }; }
      E.walk(c, t, best.path); return { ok: true, moved: true, combat: c.turn.mode === 'combat' };
    }
  }

  // ----- DM -----
  if (!dm) return { error: 'DM only' };
  switch (op) {
    case 'narrate': {
      const text = String(b.text || '').trim(); if (!text) return { error: 'Empty' };
      E.addLog(c, 'narration', text.slice(0, 3000), { who: 'DM' });
      if (b.pass && c.turn.phase === 'dm') resumeOrAdvance(c);
      return { ok: true };
    }
    case 'npcsay': { const n = c.npcs[b.npcKey]; if (!n) return { error: 'No NPC' }; E.addLog(c, 'npc', String(b.text || '').slice(0, 1000), { who: n.name, npc: n.key }); return { ok: true }; }
    case 'resolve': { if (c.turn.phase === 'dm') resumeOrAdvance(c); return { ok: true }; }
    case 'requestroll': {
      const tch = c.characters[b.charId]; if (!tch) return { error: 'Pick a hero' };
      c.turn.phase = 'roll'; c.turn.pendingRoll = { charId: tch.id, label: String(b.label || 'Check').slice(0, 60), skill: R.SKILLS[b.skill] ? b.skill : null, ability: R.ABILITIES.includes(b.ability) ? b.ability : null, dc: parseInt(b.dc, 10) || null };
      H.notifyUser(tch.ownerId, { title: `🎲 ${c.name}: ${c.turn.pendingRoll.label}!`, body: `${tch.name}, the DM needs a roll.`, url: `/?c=${c.id}`, tag: 'turn-' + c.id }, c);
      return { ok: true };
    }
    case 'spawn': { const x = parseInt(b.x, 10), y = parseInt(b.y, 10); if (!R.BESTIARY[b.mkey]) return { error: 'Unknown monster' }; const [nx, ny] = E.freeSpotNear(s, x, y); const m = E.monsterToken(c, b.mkey, nx, ny, { enc: 'dm_' + E.uid(2) }); s.tokens.push(m); if (inCombat) c.turn.order.push({ kind: 'monster', tokenId: m.id, init: 10 }); E.addLog(c, 'alert', `${m.name} appears!`, { fx: { k: 'summon', ids: [m.id] } }); return { ok: true }; }
    case 'removetoken': { const m = tokenById(b.tokenId); if (m && m.kind === 'monster') E.killMonster(c, m); return { ok: true }; }
    case 'hp': { const m = tokenById(b.tokenId); if (!m) return { error: 'No token' }; const a = parseInt(b.amount, 10) || 0; if (a < 0) E.damage(c, m, -a, 'force'); else E.heal(c, m, a); E.addLog(c, 'system', `${m.name} ${a < 0 ? 'takes ' + (-a) + ' damage' : 'heals ' + a}.`, { fx: { k: a < 0 ? 'dmg' : 'heal', t: m.id, dmg: -a, amt: a } }); E.checkCombatEnd(c); return { ok: true }; }
    case 'startcombat': return E.startCombat(c) ? { ok: true } : { error: 'No awake enemies — place some monsters first' };
    case 'endcombat': E.endCombat(c); return { ok: true };
    case 'autohero': { const e = E.currentEntry(c); if (!inCombat || !e || e.kind !== 'pc') return { error: 'Only on a hero\'s combat turn' }; const hc = c.characters[e.charId]; E.autoHero(c, hc); if (!E.checkCombatEnd(c)) E.advance(c); return { ok: true }; }
    case 'travel': { if (inCombat) return { error: 'End combat first' }; if (!c.sceneDefs[b.scene]) return { error: 'Unknown place' }; E.enterScene(c, b.scene, c.sceneId); E.buildExploreOrder(c); return { ok: true }; }
    case 'reward': { const tch = c.characters[b.charId]; if (!tch) return { error: 'Pick a hero' }; if (b.gold) tch.gold = Math.max(0, tch.gold + (parseInt(b.gold, 10) || 0)); if (b.xp) E.giveXp(c, tch, parseInt(b.xp, 10) || 0); if (b.item) { if (R.ITEMS[b.item]) E.invAdd(tch, b.item); else E.invAdd(tch, null, String(b.item).slice(0, 50)); } E.addLog(c, 'loot', `🎁 The DM rewards ${tch.name}: ${[b.gold ? b.gold + ' gold' : '', b.xp ? b.xp + ' XP' : '', b.item ? (R.ITEMS[b.item]?.name || b.item) : ''].filter(Boolean).join(', ')}`); return { ok: true }; }
    case 'longrest': { if (inCombat) return { error: 'End combat first' }; E.longRest(c); return { ok: true }; }
    case 'revive': { const tch = c.characters[b.charId]; if (!tch) return { error: 'No hero' }; tch.dead = false; tch.hp = Math.max(1, Math.floor(tch.maxHp / 2)); tch.deathFails = 0; tch.deathSaves = 0; E.addLog(c, 'system', `🌟 ${tch.name} returns to life!`); E.buildExploreOrder(c); return { ok: true }; }
    case 'settings': {
      if (b.pace) c.pace = b.pace === 'live' ? 'live' : 'async';
      if (b.turnTimer != null) c.turnTimer = Math.max(0, Math.min(3600, parseInt(b.turnTimer, 10) || 0));
      if (b.name) c.name = String(b.name).slice(0, 60);
      if (b.dmMode) {
        if (b.dmMode === 'ai' && c.ownerId !== u.id) return { error: 'Only the creator can hand the game back to the AI' };
        if (b.dmMode === 'human') { c.dmMode = 'human'; c.dmUserId = u.id; E.addLog(c, 'system', `🎭 ${H.userName(u.id)} takes over as Dungeon Master.`); }
        else { c.dmMode = 'ai'; c.dmUserId = null; E.addLog(c, 'system', '🤖 The AI Dungeon Master takes the screen.'); if (H.aiActive(c) && c.turn.phase === 'dm') H.queueAI(c, 'takeover'); }
      }
      return { ok: true };
    }
    case 'deletebook': { c.library = c.library.filter(x => x.id !== b.bookId); return { ok: true, deleteBook: b.bookId }; }
    case 'kick': { if (c.ownerId !== u.id || b.userId === u.id) return { error: 'No' }; c.members = c.members.filter(x => x !== b.userId); Object.values(c.characters).forEach(x => { if (x.ownerId === b.userId) { delete c.characters[x.id]; Object.values(c.scenes).forEach(sc => { sc.tokens = sc.tokens.filter(o => o.charId !== x.id); }); } }); E.buildExploreOrder(c); return { ok: true }; }
  }
  return { error: 'Unknown action' };
}

function resumeOrAdvance(c) {
  if (c.turn.mode === 'combat' && c.turn.resume) { c.turn.resume = false; c.turn.phase = 'act'; if (!E.checkCombatEnd(c)) H.notifyTurn && H.notifyTurn(c); return; }
  c.turn.resume = false; E.advance(c);
}
function beginAdventure(c) {
  c.status = 'active'; c.turn.mode = 'explore';
  E.enterScene(c, c.startScene, null);
  E.buildExploreOrder(c); c.turn.index = 0;
  E.addLog(c, 'title', c.adventure.title, { premise: c.adventure.premise });
  if (c.adventure.hook) E.addLog(c, 'narration', c.adventure.hook, { who: 'DM' });
  E.beginTurn(c);
  if (H.aiActive(c)) H.queueAI(c, 'flavor', { what: `The adventure "${c.adventure.title}" just began. Welcome each hero by name in one short line each, tying in their backstory if they have one, and end with "What do you do?"` });
}
function addNextAdventure(c, lvl, hub, outline) {
  const r = ADV.generateNext(c, lvl, hub, outline);
  const hubDef = c.sceneDefs[hub]; hubDef.exits = hubDef.exits || []; hubDef.exits.push({ to: r.roadKey, label: c.sceneDefs[r.roadKey].name });
  hubDef.npcs = hubDef.npcs || []; hubDef.npcs.push(r.giverKey);
  const hs = c.scenes[hub];
  if (hs) {
    const used = new Set(hs.pois.map(p => p.x + ',' + p.y));
    const spots = hs.zones.far.concat(hs.zones.mid).filter(([x, y]) => !used.has(x + ',' + y) && E.walkable(hs, x, y) && !E.occupied(hs, x, y));
    const sp = spots[Math.floor(Math.random() * spots.length)] || [hs.entry[0] + 2, hs.entry[1]];
    hs.pois.push({ id: E.uid(3), type: 'exit', x: sp[0], y: sp[1], name: c.sceneDefs[r.roadKey].name, to: r.roadKey });
    const [nx, ny] = E.freeSpotNear(hs, 8, 12); hs.tokens.push({ id: E.uid(4), kind: 'npc', npcKey: r.giverKey, name: c.npcs[r.giverKey].name, x: nx, y: ny, look: c.npcs[r.giverKey].look, conds: [] });
  }
  c.adventureDone = false;
  E.addLog(c, 'title', `Chapter ${c.adventure.chapter}: ${r.name}`, {});
  E.addLog(c, 'narration', `Word reaches town: ${c.npcs[r.giverKey].name} is looking for heroes. ${c.npcs[r.giverKey].topics['The trouble']}`, { who: 'DM' });
  if (c.sceneId !== hub) E.addLog(c, 'system', `Head back to ${c.sceneDefs[hub].name} to find ${c.npcs[r.giverKey].name}.`);
}

module.exports = { handle, setHooks, beginAdventure, addNextAdventure, isDM, resumeOrAdvance };
