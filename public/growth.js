// Roll Call hero growth: spell slots to level 20, spells up to 9th level, class features to 20,
// subclasses (2 per class), feats, known-spell tables, companions and factions.
// Extends RULES on the server (required by rules.js) and in the browser (script after rules.js).
(function (root) {
  function extend(R) {
    // ---------- spell slots, levels 1-20 (5e) ----------
    const FULL = [[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
    const HALF = [[], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2]];
    const PACT_N = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4];
    R.slotTable = function (cls, level) {
      const C = R.CLASSES[cls]; if (!C || !C.caster) return [];
      const i = Math.max(1, Math.min(20, level)) - 1;
      if (C.caster === 'full') return FULL[i].slice();
      if (C.caster === 'half') { if (C.earlySpells && level === 1) return [1]; return HALF[i].slice(); }
      if (C.caster === 'pact') { const sl = Math.min(5, Math.ceil(level / 2)); const t = []; for (let k = 0; k < sl - 1; k++) t[k] = 0; t[sl - 1] = PACT_N[i]; return t; }
      return [];
    };
    R.maxSpellLevel = function (cls, level) {
      const C = R.CLASSES[cls]; const t = R.slotTable(cls, level); let m = 0; t.forEach((n, i) => { if (n) m = i + 1; });
      if (C && C.caster === 'pact') m = t.length + (level >= 11 ? Math.min(4, Math.floor((level - 9) / 2)) : 0); // mystic arcanum
      return m;
    };
    R.classSpells = function (cls, level) {
      const max = R.maxSpellLevel(cls, level); const C = R.CLASSES[cls]; if (!C || !C.caster) return [];
      return Object.keys(R.SPELLS).filter(k => R.SPELLS[k].cls.includes(cls) && (R.SPELLS[k].lvl === 0 ? C.caster !== 'half' : R.SPELLS[k].lvl <= max));
    };
    // known (leveled) spells for classes that pick their spells; others prepare everything they can cast
    R.KNOWN = {
      Bard: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
      Sorcerer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
      Warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
      Ranger: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
      Wizard: [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44]
    };
    R.knownCount = (cls, level) => R.KNOWN[cls] ? R.KNOWN[cls][Math.max(1, Math.min(20, level)) - 1] : null;

    // ---------- conditions ----------
    Object.assign(R.CONDITIONS, {
      stunned: { name: 'Stunned', icon: '💫' }, grappled: { name: 'Grappled', icon: '🤼' }, banished: { name: 'Banished', icon: '🌀' },
      polymorphed: { name: 'Turned into a sheep', icon: '🐑' }, hasted: { name: 'Hasted', icon: '⚡', good: true }, mage_armor: { name: 'Mage Armor', icon: '🔷', good: true },
      sacred: { name: 'Sacred Weapon', icon: '🌟', good: true }, vowed: { name: 'Sworn Enemy', icon: '🎯' }, wildshaped: { name: 'Wild Shape', icon: '🐻', good: true },
      disengaged: { name: 'Disengaging', icon: '↩️', good: true }, concentrating: { name: 'Concentrating', icon: '🧠', good: true }, blinded: { name: 'Blinded', icon: '🙈' },
      foresight: { name: 'Foresight', icon: '👁️', good: true }, warded: { name: 'Death Ward', icon: '💀', good: true }
    });

    // ---------- class features to level 20 ----------
    const addF = (cls, lvl, keys) => { const F = R.CLASSES[cls].features; F[lvl] = (F[lvl] || []).concat(keys); };
    addF('Barbarian', 7, ['feral_instinct']); addF('Barbarian', 9, ['brutal_critical']); addF('Barbarian', 11, ['relentless_rage']);
    addF('Bard', 2, ['jack_of_all_trades']); addF('Bard', 6, ['countercharm']);
    addF('Cleric', 8, ['divine_strike']);
    addF('Druid', 2, ['wild_shape']);
    addF('Fighter', 9, ['indomitable']); addF('Fighter', 11, ['extra_attack2']); addF('Fighter', 20, ['extra_attack3']);
    addF('Monk', 5, ['stunning_strike']); addF('Monk', 7, ['evasion']);
    addF('Paladin', 6, ['aura_protection']); addF('Paladin', 11, ['improved_smite']);
    addF('Ranger', 6, ['natures_veil']);
    addF('Rogue', 7, ['evasion']); addF('Rogue', 11, ['reliable_talent']);
    addF('Warlock', 2, ['agonizing_blast']);
    // subclass choice point (all classes choose at level 3 here, to keep it simple for new players)
    Object.keys(R.CLASSES).forEach(k => addF(k, 3, ['subclass_choice']));

    Object.assign(R.FEATURES, {
      subclass_choice: { name: 'Path', kind: 'passive', hidden: true, desc: 'Choose your path at level 3.' },
      feral_instinct: { name: 'Feral Instinct', kind: 'passive', desc: 'Advantage on initiative.' },
      brutal_critical: { name: 'Brutal Critical', kind: 'passive', desc: 'Roll one extra weapon die on a critical hit.' },
      relentless_rage: { name: 'Relentless Rage', kind: 'passive', uses: () => 1, rest: 'short', desc: 'While raging, drop to 1 HP instead of 0 (Con save).' },
      jack_of_all_trades: { name: 'Jack of All Trades', kind: 'passive', desc: 'Add half your proficiency to checks you are not trained in.' },
      countercharm: { name: 'Countercharm', kind: 'passive', desc: 'You and nearby allies have advantage against fear and charm.' },
      divine_strike: { name: 'Divine Strike', kind: 'passive', desc: 'Once per turn, +1d8 radiant on a weapon hit.' },
      wild_shape: { name: 'Wild Shape', kind: 'action', uses: () => 2, rest: 'short', desc: 'Become a bear: temp HP and bear claws (2d6). Can\'t cast spells while shaped.' },
      indomitable: { name: 'Indomitable', kind: 'passive', uses: () => 1, rest: 'long', desc: 'Reroll a failed saving throw.' },
      extra_attack2: { name: 'Extra Attack (3)', kind: 'passive', desc: 'Attack three times with the Attack action.' },
      extra_attack3: { name: 'Extra Attack (4)', kind: 'passive', desc: 'Attack four times with the Attack action.' },
      stunning_strike: { name: 'Stunning Strike', kind: 'passive', desc: 'Spend 1 ki on a melee hit: Con save or the foe is stunned.' },
      evasion: { name: 'Evasion', kind: 'passive', desc: 'Dex saves: take no damage on a success, half on a failure.' },
      aura_protection: { name: 'Aura of Protection', kind: 'passive', desc: 'You and allies within 2 squares add your Cha to saving throws.' },
      improved_smite: { name: 'Improved Divine Smite', kind: 'passive', desc: 'Every melee hit deals +1d8 radiant.' },
      natures_veil: { name: "Nature's Veil", kind: 'bonus', uses: (l, ch) => Math.max(1, Math.floor((l + 3) / 4) + 1), rest: 'long', desc: 'Turn invisible until your next turn.' },
      reliable_talent: { name: 'Reliable Talent', kind: 'passive', desc: 'Trained skill checks never roll lower than 10.' },
      agonizing_blast: { name: 'Agonizing Blast', kind: 'passive', desc: 'Add Cha to Eldritch Blast damage.' },
      // subclass features
      frenzy: { name: 'Frenzy', kind: 'passive', desc: 'While raging, make one extra attack each turn.' },
      mindless_rage: { name: 'Mindless Rage', kind: 'passive', desc: "Can't be charmed or frightened while raging." },
      bear_spirit: { name: 'Bear Spirit', kind: 'passive', desc: 'While raging, resist all damage except psychic.' },
      aspect_bear: { name: 'Aspect of the Bear', kind: 'passive', desc: 'Carry twice as much; advantage on Strength checks.' },
      cutting_words: { name: 'Cutting Words', kind: 'passive', desc: 'Reaction: spend Bardic Inspiration to make an enemy attack on an ally miss (–1d6).' },
      combat_inspiration: { name: 'Combat Inspiration', kind: 'passive', desc: 'Your inspiration also adds +1d6 damage.' },
      disciple_of_life: { name: 'Disciple of Life', kind: 'passive', desc: 'Healing spells heal 2 + spell level more.' },
      blessed_healer: { name: 'Blessed Healer', kind: 'passive', desc: 'When you heal others, you heal 2 + spell level too.' },
      warding_flare: { name: 'Warding Flare', kind: 'passive', uses: (l, ch) => Math.max(1, R.mod(ch.scores.wis)), rest: 'long', desc: 'Reaction: blinding light makes an attack against you miss more often.' },
      radiance_of_dawn: { name: 'Radiance of Dawn', kind: 'action', uses: () => 1, rest: 'short', desc: 'Searing light: 2d10 + level radiant to enemies within 3 (Con save half).' },
      moon_form: { name: 'Circle of the Moon', kind: 'passive', desc: 'Wild Shape is a bonus action and your bear is tougher.' },
      natural_recovery: { name: 'Natural Recovery', kind: 'passive', desc: 'Regain a spell slot on a short rest.' },
      lands_stride: { name: "Land's Stride", kind: 'passive', desc: 'Difficult terrain costs no extra movement.' },
      improved_critical: { name: 'Improved Critical', kind: 'passive', desc: 'Score a critical hit on 19 or 20 (18 at level 15).' },
      remarkable_athlete: { name: 'Remarkable Athlete', kind: 'passive', desc: '+half proficiency to Str, Dex and Con checks.' },
      maneuvers: { name: 'Combat Maneuvers', kind: 'passive', desc: 'Superiority dice (d8): Trip Attack knocks foes prone, Precision turns near-misses into hits.' },
      open_hand: { name: 'Open Hand Technique', kind: 'passive', desc: 'Flurry of Blows hits knock foes prone (Dex save).' },
      shadow_step: { name: 'Shadow Step', kind: 'bonus', cost: 'ki', target: 'tile', range: 12, desc: 'Spend 1 ki: teleport up to 12 squares and gain advantage on your next attack.' },
      sacred_weapon: { name: 'Sacred Weapon', kind: 'action', uses: () => 1, rest: 'short', desc: 'Add your Charisma to attack rolls for 1 minute.' },
      vow_of_enmity: { name: 'Vow of Enmity', kind: 'bonus', uses: () => 1, rest: 'short', target: 'enemy', range: 2, desc: 'Advantage on attacks against one foe for 1 minute.' },
      colossus_slayer: { name: 'Colossus Slayer', kind: 'passive', desc: 'Once per turn, +1d8 damage against a wounded foe.' },
      ranger_companion: { name: "Ranger's Companion", kind: 'passive', desc: 'An animal companion fights beside you.' },
      fast_hands: { name: 'Fast Hands', kind: 'passive', desc: 'Use items as a bonus action.' },
      assassinate: { name: 'Assassinate', kind: 'passive', desc: 'Advantage in round 1; hits on round 1 deal extra sneak damage.' },
      draconic_resilience: { name: 'Draconic Resilience', kind: 'passive', desc: 'Scales give AC 13 + Dex and +1 HP per level.' },
      elemental_affinity: { name: 'Elemental Affinity', kind: 'passive', desc: '+Charisma to fire spell damage.' },
      wild_surge: { name: 'Wild Magic Surge', kind: 'passive', desc: 'Leveled spells sometimes trigger a random magical surprise.' },
      tides_of_chaos: { name: 'Tides of Chaos', kind: 'passive', uses: () => 1, rest: 'long', desc: 'Your first missed attack each day is rerolled.' },
      dark_blessing: { name: "Dark One's Blessing", kind: 'passive', desc: 'Defeating a foe grants temp HP = Cha + level.' },
      fey_presence: { name: 'Fey Presence', kind: 'action', uses: () => 1, rest: 'short', desc: 'Enemies within 2 squares are charmed or frightened (Wis save).' },
      sculpt_spells: { name: 'Sculpt Spells', kind: 'passive', desc: 'Your area spells never hurt allies.' },
      empowered_evocation: { name: 'Empowered Evocation', kind: 'passive', desc: '+Int to the damage of your damage spells.' },
      arcane_ward: { name: 'Arcane Ward', kind: 'passive', desc: 'Casting leveled spells gives you a ward of temp HP (2 × level + Int).' },
      // feats
      feat_alert: { name: 'Alert', kind: 'passive', feat: true, desc: '+5 initiative; you can\'t be surprised.' },
      feat_tough: { name: 'Tough', kind: 'passive', feat: true, desc: '+2 max HP per level.' },
      feat_lucky: { name: 'Lucky', kind: 'passive', feat: true, uses: () => 3, rest: 'long', desc: '3 times a day, a missed attack or failed save is rerolled.' },
      feat_sentinel: { name: 'Sentinel', kind: 'passive', feat: true, desc: 'Your opportunity attacks stop enemies cold, even if they Disengage.' },
      feat_gwm: { name: 'Great Weapon Master', kind: 'passive', feat: true, desc: '+3 damage with two-handed weapons.' },
      feat_sharpshooter: { name: 'Sharpshooter', kind: 'passive', feat: true, desc: 'Ranged attacks ignore cover and deal +2 damage.' },
      feat_warcaster: { name: 'War Caster', kind: 'passive', feat: true, desc: 'Advantage on saves to keep concentration.' },
      feat_mobile: { name: 'Mobile', kind: 'passive', feat: true, desc: '+10 ft speed; enemies you attack get no opportunity attack on you.' },
      feat_resilient: { name: 'Resilient', kind: 'passive', feat: true, desc: '+1 Con and proficiency in Con saves.' },
      feat_healer: { name: 'Healer', kind: 'passive', feat: true, desc: 'Stabilizing an ally also heals them 1d6 + 4 + their level.' },
      feat_dual: { name: 'Dual Wielder', kind: 'passive', feat: true, desc: '+1 AC while holding a weapon in each hand.' },
      feat_polearm: { name: 'Polearm Master', kind: 'passive', feat: true, desc: 'Attacks with spears, staffs and tridents add a 1d4 butt-end strike.' },
      feat_magic_initiate: { name: 'Magic Initiate', kind: 'passive', feat: true, desc: 'Learn Fire Bolt, Healing Word and Magic Missile (1/day each).' },
      feat_observant: { name: 'Observant', kind: 'passive', feat: true, desc: '+1 Wis and +5 to Perception and Investigation.' },
      feat_durable: { name: 'Durable', kind: 'passive', feat: true, desc: '+1 Con; short rests heal at least twice your Con.' },
      feat_shield_master: { name: 'Shield Master', kind: 'passive', feat: true, desc: 'Shove as a bonus action while holding a shield; +2 to Dex saves.' }
    });
    R.FEATS = Object.keys(R.FEATURES).filter(k => R.FEATURES[k].feat);

    // ---------- subclasses ----------
    R.SUBCLASSES = {
      Barbarian: { berserker: { name: 'Path of the Berserker', icon: '🪓', desc: 'Pure fury: an extra attack every turn while raging.', f: { 3: ['frenzy'], 6: ['mindless_rage'] } },
        bear: { name: 'Path of the Bear', icon: '🐻', desc: 'The bear spirit: shrug off almost every kind of damage while raging.', f: { 3: ['bear_spirit'], 6: ['aspect_bear'] } } },
      Bard: { lore: { name: 'College of Lore', icon: '📚', desc: 'Words as weapons: make enemies miss your friends.', f: { 3: ['cutting_words'] } },
        valor: { name: 'College of Valor', icon: '🗡️', desc: 'Battle bard: inspiration adds damage, extra attack at 6.', f: { 3: ['combat_inspiration'], 6: ['extra_attack'] } } },
      Cleric: { life: { name: 'Life Domain', icon: '💚', desc: 'The best healer in the land.', f: { 3: ['disciple_of_life'], 6: ['blessed_healer'] } },
        light: { name: 'Light Domain', icon: '☀️', desc: 'Blinding flares and searing dawn light.', f: { 3: ['warding_flare', 'radiance_of_dawn'] }, spells: ['burning_hands', 'scorching_ray', 'fireball', 'wall_of_fire', 'flame_strike'] } },
      Druid: { moon: { name: 'Circle of the Moon', icon: '🌕', desc: 'Become a mighty bear as a bonus action.', f: { 3: ['moon_form'] } },
        land: { name: 'Circle of the Land', icon: '🍃', desc: 'Extra spell power and walking through brambles.', f: { 3: ['natural_recovery'], 6: ['lands_stride'] }, spells: ['hold_person', 'call_lightning', 'ice_storm'] } },
      Fighter: { champion: { name: 'Champion', icon: '🏆', desc: 'Critical hits on 19 and 20. Simple and deadly.', f: { 3: ['improved_critical'], 7: ['remarkable_athlete'] } },
        battlemaster: { name: 'Battle Master', icon: '♟️', desc: 'Trip foes and turn misses into hits with superiority dice.', f: { 3: ['maneuvers'] } } },
      Monk: { open_hand: { name: 'Way of the Open Hand', icon: '✋', desc: 'Every flurry knocks enemies flat.', f: { 3: ['open_hand'] } },
        shadow: { name: 'Way of Shadow', icon: '🌑', desc: 'Teleport through shadows and strike unseen.', f: { 3: ['shadow_step'] } } },
      Paladin: { devotion: { name: 'Oath of Devotion', icon: '🌟', desc: 'A holy blade that never misses its mark.', f: { 3: ['sacred_weapon'] } },
        vengeance: { name: 'Oath of Vengeance', icon: '🎯', desc: 'Swear an oath against one enemy and hunt it down.', f: { 3: ['vow_of_enmity'] }, spells: ['hunters_mark', 'hold_person', 'haste'] } },
      Ranger: { hunter: { name: 'Hunter', icon: '🏹', desc: 'Giant-slayer: extra damage to wounded foes.', f: { 3: ['colossus_slayer'] } },
        beastmaster: { name: 'Beast Master', icon: '🐺', desc: 'A loyal wolf companion fights by your side.', f: { 3: ['ranger_companion'] } } },
      Rogue: { thief: { name: 'Thief', icon: '🧤', desc: 'Lightning-quick hands: use items as a bonus action.', f: { 3: ['fast_hands'] } },
        assassin: { name: 'Assassin', icon: '🗡️', desc: 'Strike first, strike hard: deadly in the first round.', f: { 3: ['assassinate'] } } },
      Sorcerer: { draconic: { name: 'Draconic Bloodline', icon: '🐉', desc: 'Dragon scales and fire that burns hotter.', f: { 3: ['draconic_resilience'], 6: ['elemental_affinity'] } },
        wild: { name: 'Wild Magic', icon: '🎲', desc: 'Chaotic magic with surprising side effects!', f: { 3: ['wild_surge', 'tides_of_chaos'] } } },
      Warlock: { fiend: { name: 'The Fiend', icon: '😈', desc: 'Your patron rewards every victory with dark vigor.', f: { 3: ['dark_blessing'] }, spells: ['burning_hands', 'scorching_ray', 'fireball', 'wall_of_fire'] },
        archfey: { name: 'The Archfey', icon: '🧚', desc: 'Fey magic that charms and terrifies.', f: { 3: ['fey_presence'] }, spells: ['faerie_fire', 'sleep', 'hypnotic_pattern', 'greater_invisibility'] } },
      Wizard: { evocation: { name: 'School of Evocation', icon: '🔥', desc: 'Blast spells that spare your friends and hit harder.', f: { 3: ['sculpt_spells'], 10: ['empowered_evocation'] } },
        abjuration: { name: 'School of Abjuration', icon: '🛡️', desc: 'Magical wards that soak up damage.', f: { 3: ['arcane_ward'] } } }
    };
    R.featuresAt = function (cls, level, sub) {
      const out = []; const F = R.CLASSES[cls].features; Object.keys(F).forEach(l => { if (+l <= level) out.push(...F[l]); });
      const S = sub && R.SUBCLASSES[cls] && R.SUBCLASSES[cls][sub]; if (S) Object.keys(S.f).forEach(l => { if (+l <= level) out.push(...S.f[l]); });
      return [...new Set(out)].filter(k => k !== 'subclass_choice');
    };

    // ---------- new spells (levels 1-9) ----------
    const C = (...a) => a; const AR = ['Wizard', 'Sorcerer'], WSW = ['Wizard', 'Sorcerer', 'Warlock'], DV = ['Cleric', 'Paladin'], ALLC = ['Wizard', 'Sorcerer', 'Bard', 'Cleric', 'Druid', 'Warlock'];
    const conc = ['bless', 'hex', 'hunters_mark', 'faerie_fire', 'entangle', 'hold_person', 'shield_of_faith'];
    conc.forEach(k => { if (R.SPELLS[k]) R.SPELLS[k].conc = true; });
    Object.assign(R.SPELLS, {
      // 1st
      chromatic_orb: { name: 'Chromatic Orb', lvl: 1, cls: C('Wizard', 'Sorcerer'), kind: 'attack', target: 'enemy', range: 18, dice: '3d8', type: 'lightning', desc: 'Hurl a sphere of raw energy.' },
      inflict_wounds: { name: 'Inflict Wounds', lvl: 1, cls: C('Cleric'), kind: 'attack', target: 'enemy', range: 1, dice: '3d10', type: 'necrotic', desc: 'A touch that withers flesh.' },
      command: { name: 'Command', lvl: 1, cls: C('Cleric', 'Paladin', 'Bard'), kind: 'debuff', save: 'wis', target: 'enemy', range: 12, cond: 'prone', rounds: 1, desc: '"GROVEL!" The foe drops prone.' },
      heroism: { name: 'Heroism', lvl: 1, cls: C('Bard', 'Paladin'), kind: 'buff', target: 'ally', range: 1, cond: 'blessed', rounds: 10, temp: 5, conc: true, desc: 'Fearless: temp HP and courage.' },
      mage_armor: { name: 'Mage Armor', lvl: 1, cls: C('Wizard', 'Sorcerer'), kind: 'buff', target: 'self', cond: 'mage_armor', rounds: 600, desc: 'Invisible armor: AC 13 + Dex all day.' },
      ice_knife: { name: 'Ice Knife', lvl: 1, cls: C('Wizard', 'Sorcerer', 'Druid'), kind: 'save', save: 'dex', target: 'area', range: 12, radius: 1, dice: '3d6', type: 'cold', half: true, desc: 'A shard of ice explodes in a burst of frost.' },
      // 2nd
      invisibility: { name: 'Invisibility', lvl: 2, cls: C('Wizard', 'Sorcerer', 'Bard', 'Warlock'), kind: 'buff', target: 'ally', range: 1, cond: 'hidden', rounds: 60, conc: true, desc: 'Turn a hero invisible until they attack.' },
      lesser_restoration: { name: 'Lesser Restoration', lvl: 2, cls: C('Cleric', 'Druid', 'Paladin', 'Ranger', 'Bard'), kind: 'cleanse', target: 'ally', range: 1, desc: 'Cure poison, paralysis and blindness.' },
      aid: { name: 'Aid', lvl: 2, cls: C('Cleric', 'Paladin'), kind: 'buff', target: 'allies', count: 3, range: 6, cond: 'blessed', rounds: 1, temp: 5, desc: 'Bolster up to 3 heroes with 5 temp HP.' },
      web: { name: 'Web', lvl: 2, cls: C('Wizard', 'Sorcerer'), kind: 'debuff', save: 'dex', target: 'area', range: 12, radius: 2, cond: 'restrained', rounds: 3, conc: true, desc: 'Sticky webs restrain everything in an area.' },
      acid_arrow: { name: 'Acid Arrow', lvl: 2, cls: C('Wizard'), kind: 'attack', target: 'enemy', range: 18, dice: '6d4', type: 'acid', desc: 'A hissing green arrow of acid.' },
      prayer_of_healing: { name: 'Prayer of Healing', lvl: 2, cls: C('Cleric'), kind: 'heal', target: 'allies', count: 6, range: 6, dice: '2d8', addMod: true, desc: 'Heal the whole party (out of combat only).', noCombat: true },
      flaming_sphere: { name: 'Flaming Sphere', lvl: 2, cls: C('Wizard', 'Druid'), kind: 'save', save: 'dex', target: 'area', range: 12, radius: 1, dice: '2d6', type: 'fire', half: true, desc: 'A rolling ball of flame.' },
      // 3rd
      haste: { name: 'Haste', lvl: 3, cls: C('Wizard', 'Sorcerer'), kind: 'buff', target: 'ally', range: 6, cond: 'hasted', rounds: 10, conc: true, desc: 'Double speed, +2 AC and an extra attack.' },
      slow: { name: 'Slow', lvl: 3, cls: C('Wizard', 'Sorcerer'), kind: 'debuff', save: 'wis', target: 'area', range: 24, radius: 2, cond: 'slowed', rounds: 10, conc: true, desc: 'Foes move at half speed.' },
      call_lightning: { name: 'Call Lightning', lvl: 3, cls: C('Druid'), kind: 'save', save: 'dex', target: 'area', range: 24, radius: 1, dice: '3d10', type: 'lightning', half: true, desc: 'A storm cloud strikes on command.' },
      revivify: { name: 'Revivify', lvl: 3, cls: C('Cleric', 'Paladin', 'Druid', 'Ranger'), kind: 'revive', target: 'any', range: 1, hp: 1, desc: 'Bring a fallen hero back to life with 1 HP.' },
      hypnotic_pattern: { name: 'Hypnotic Pattern', lvl: 3, cls: C('Wizard', 'Sorcerer', 'Bard', 'Warlock'), kind: 'debuff', save: 'wis', target: 'area', range: 24, radius: 2, cond: 'charmed', rounds: 3, conc: true, desc: 'Swirling colors leave foes dazed.' },
      fear: { name: 'Fear', lvl: 3, cls: C('Wizard', 'Sorcerer', 'Bard', 'Warlock'), kind: 'debuff', save: 'wis', target: 'area', range: 6, radius: 2, cond: 'frightened', rounds: 3, conc: true, desc: 'Foes flee in terror.' },
      dispel_magic: { name: 'Dispel Magic', lvl: 3, cls: ALLC.concat('Paladin'), kind: 'cleanse', target: 'ally', range: 24, all: true, desc: 'End harmful magic on a hero.' },
      vampiric_touch: { name: 'Vampiric Touch', lvl: 3, cls: C('Wizard', 'Warlock'), kind: 'attack', target: 'enemy', range: 1, dice: '3d6', type: 'necrotic', drain: true, desc: 'Steal life: heal half the damage.' },
      conjure_animals: { name: 'Conjure Animals', lvl: 3, cls: C('Druid', 'Ranger'), kind: 'summon', summon: 'wolf', count: 2, rounds: 10, conc: true, desc: 'Two spirit wolves fight for you.' },
      // 4th
      ice_storm: { name: 'Ice Storm', lvl: 4, cls: C('Wizard', 'Sorcerer', 'Druid'), kind: 'save', save: 'dex', target: 'area', range: 30, radius: 2, dice: '4d8', type: 'cold', half: true, desc: 'Hail pounds a wide area.' },
      blight: { name: 'Blight', lvl: 4, cls: C('Wizard', 'Sorcerer', 'Druid', 'Warlock'), kind: 'save', save: 'con', target: 'enemy', range: 6, dice: '8d8', type: 'necrotic', half: true, desc: 'Drain the life from one creature.' },
      polymorph: { name: 'Polymorph', lvl: 4, cls: C('Wizard', 'Sorcerer', 'Bard', 'Druid'), kind: 'debuff', save: 'wis', target: 'enemy', range: 12, cond: 'polymorphed', rounds: 10, conc: true, desc: 'Turn a monster into a harmless sheep.' },
      greater_invisibility: { name: 'Greater Invisibility', lvl: 4, cls: C('Wizard', 'Sorcerer', 'Bard'), kind: 'buff', target: 'ally', range: 1, cond: 'hidden', rounds: 10, conc: true, lasting: true, desc: 'Stay invisible even while attacking.' },
      dimension_door: { name: 'Dimension Door', lvl: 4, cls: C('Wizard', 'Sorcerer', 'Bard', 'Warlock'), kind: 'teleport', target: 'tile', range: 30, desc: 'Step through a door in the air.' },
      banishment: { name: 'Banishment', lvl: 4, cls: C('Wizard', 'Sorcerer', 'Cleric', 'Paladin', 'Warlock'), kind: 'banish', save: 'cha', target: 'enemy', range: 12, rounds: 10, conc: true, desc: 'Send a creature to another plane.' },
      wall_of_fire: { name: 'Wall of Fire', lvl: 4, cls: C('Wizard', 'Sorcerer', 'Druid'), kind: 'save', save: 'dex', target: 'area', range: 24, radius: 2, dice: '5d8', type: 'fire', half: true, desc: 'A roaring wall of flame.' },
      death_ward: { name: 'Death Ward', lvl: 4, cls: C('Cleric', 'Paladin'), kind: 'buff', target: 'ally', range: 1, cond: 'warded', rounds: 600, desc: 'The next time this hero would drop to 0, they stay at 1 HP.' },
      // 5th
      cone_of_cold: { name: 'Cone of Cold', lvl: 5, cls: C('Wizard', 'Sorcerer'), kind: 'save', save: 'con', target: 'area', range: 6, radius: 2, dice: '8d8', type: 'cold', half: true, desc: 'A blast of killing frost.' },
      flame_strike: { name: 'Flame Strike', lvl: 5, cls: C('Cleric'), kind: 'save', save: 'dex', target: 'area', range: 12, radius: 1, dice: '8d6', type: 'radiant', half: true, desc: 'A pillar of holy fire.' },
      mass_cure_wounds: { name: 'Mass Cure Wounds', lvl: 5, cls: C('Cleric', 'Druid', 'Bard'), kind: 'heal', target: 'allies', count: 6, range: 12, dice: '3d8', addMod: true, desc: 'Heal up to six heroes.' },
      hold_monster: { name: 'Hold Monster', lvl: 5, cls: C('Wizard', 'Sorcerer', 'Bard', 'Warlock'), kind: 'debuff', save: 'wis', target: 'enemy', range: 18, cond: 'paralyzed', rounds: 2, conc: true, desc: 'Freeze any creature in place.' },
      insect_plague: { name: 'Insect Plague', lvl: 5, cls: C('Cleric', 'Druid', 'Sorcerer'), kind: 'save', save: 'con', target: 'area', range: 60, radius: 2, dice: '4d10', type: 'piercing', half: true, desc: 'A swarm of biting locusts.' },
      raise_dead: { name: 'Raise Dead', lvl: 5, cls: C('Cleric', 'Paladin', 'Bard'), kind: 'revive', target: 'any', range: 1, hp: 'half', noCombat: true, desc: 'Return a dead hero to life (out of combat).' },
      greater_restoration: { name: 'Greater Restoration', lvl: 5, cls: C('Cleric', 'Druid', 'Bard'), kind: 'cleanse', target: 'ally', range: 1, all: true, desc: 'Remove any curse or condition.' },
      conjure_elemental: { name: 'Conjure Elemental', lvl: 5, cls: C('Wizard', 'Druid'), kind: 'summon', summon: 'earth_elemental', count: 1, rounds: 10, conc: true, desc: 'Call an earth elemental to fight for you.' },
      // 6th
      chain_lightning: { name: 'Chain Lightning', lvl: 6, cls: C('Wizard', 'Sorcerer'), kind: 'save', save: 'dex', target: 'area', range: 30, radius: 3, dice: '10d8', type: 'lightning', half: true, desc: 'Lightning leaps from foe to foe.' },
      disintegrate: { name: 'Disintegrate', lvl: 6, cls: C('Wizard', 'Sorcerer'), kind: 'save', save: 'dex', target: 'enemy', range: 12, dice: '10d6+40', type: 'force', desc: 'A green ray that turns foes to dust.' },
      heal: { name: 'Heal', lvl: 6, cls: C('Cleric', 'Druid'), kind: 'heal', target: 'ally', range: 12, dice: '1d1+69', desc: 'Heal 70 HP and cure ailments.', cleanse: true },
      harm: { name: 'Harm', lvl: 6, cls: C('Cleric'), kind: 'save', save: 'con', target: 'enemy', range: 12, dice: '14d6', type: 'necrotic', half: true, desc: 'A sickening wave of necrotic power.' },
      sunbeam: { name: 'Sunbeam', lvl: 6, cls: C('Wizard', 'Sorcerer', 'Druid'), kind: 'save', save: 'con', target: 'area', range: 12, radius: 1, dice: '6d8', type: 'radiant', half: true, cond: 'blinded', rounds: 1, desc: 'A beam of sunlight blinds and burns.' },
      blade_barrier: { name: 'Blade Barrier', lvl: 6, cls: C('Cleric'), kind: 'save', save: 'dex', target: 'area', range: 18, radius: 2, dice: '6d10', type: 'slashing', half: true, desc: 'A whirling wall of blades.' },
      // 7th
      finger_of_death: { name: 'Finger of Death', lvl: 7, cls: C('Wizard', 'Sorcerer', 'Warlock'), kind: 'save', save: 'con', target: 'enemy', range: 12, dice: '7d8+30', type: 'necrotic', half: true, desc: 'Point, and dark energy rips through a foe.' },
      fire_storm: { name: 'Fire Storm', lvl: 7, cls: C('Cleric', 'Druid', 'Sorcerer'), kind: 'save', save: 'dex', target: 'area', range: 30, radius: 3, dice: '7d10', type: 'fire', half: true, desc: 'Sheets of roaring flame.' },
      regenerate: { name: 'Regenerate', lvl: 7, cls: C('Cleric', 'Druid', 'Bard'), kind: 'heal', target: 'ally', range: 1, dice: '4d8+15', desc: 'Regrow wounds in an instant.' },
      resurrection: { name: 'Resurrection', lvl: 7, cls: C('Cleric', 'Bard'), kind: 'revive', target: 'any', range: 1, hp: 'full', desc: 'Return a dead hero to full health.' },
      prismatic_spray: { name: 'Prismatic Spray', lvl: 7, cls: C('Wizard', 'Sorcerer'), kind: 'save', save: 'dex', target: 'area', range: 6, radius: 2, dice: '10d6', type: 'fire', half: true, desc: 'Seven rainbow rays of doom.' },
      // 8th
      sunburst: { name: 'Sunburst', lvl: 8, cls: C('Cleric', 'Druid', 'Wizard', 'Sorcerer'), kind: 'save', save: 'con', target: 'area', range: 30, radius: 4, dice: '12d6', type: 'radiant', half: true, cond: 'blinded', rounds: 2, desc: 'Brilliant sunlight blinds everything.' },
      earthquake: { name: 'Earthquake', lvl: 8, cls: C('Cleric', 'Druid', 'Sorcerer'), kind: 'save', save: 'dex', target: 'area', range: 30, radius: 4, dice: '5d10', type: 'bludgeoning', half: true, cond: 'prone', rounds: 1, desc: 'The ground splits and heaves.' },
      power_word_stun: { name: 'Power Word Stun', lvl: 8, cls: C('Wizard', 'Sorcerer', 'Bard', 'Warlock'), kind: 'debuff', save: 'con', target: 'enemy', range: 12, cond: 'stunned', rounds: 2, desc: 'One word, and the foe is stunned.' },
      incendiary_cloud: { name: 'Incendiary Cloud', lvl: 8, cls: C('Wizard', 'Sorcerer'), kind: 'save', save: 'dex', target: 'area', range: 30, radius: 3, dice: '10d8', type: 'fire', half: true, desc: 'Smoke and embers fill the battlefield.' },
      // 9th
      meteor_swarm: { name: 'Meteor Swarm', lvl: 9, cls: C('Wizard', 'Sorcerer'), kind: 'save', save: 'dex', target: 'area', range: 60, radius: 4, dice: '20d6+20d6', type: 'fire', half: true, desc: 'Burning meteors rain from the sky.' },
      power_word_kill: { name: 'Power Word Kill', lvl: 9, cls: C('Wizard', 'Sorcerer', 'Bard', 'Warlock'), kind: 'pwk', target: 'enemy', range: 12, desc: 'A foe with 100 HP or less simply dies.' },
      mass_heal: { name: 'Mass Heal', lvl: 9, cls: C('Cleric'), kind: 'heal', target: 'allies', count: 6, range: 12, dice: '1d1+99', cleanse: true, desc: 'Heal the whole party completely.' },
      true_resurrection: { name: 'True Resurrection', lvl: 9, cls: C('Cleric', 'Druid'), kind: 'revive', target: 'any', range: 12, hp: 'full', desc: 'Restore a fallen hero, no matter what.' },
      foresight: { name: 'Foresight', lvl: 9, cls: C('Wizard', 'Bard', 'Druid', 'Warlock'), kind: 'buff', target: 'ally', range: 1, cond: 'foresight', rounds: 600, desc: 'Advantage on everything; enemies have disadvantage against them.' },
      storm_of_vengeance: { name: 'Storm of Vengeance', lvl: 9, cls: C('Druid'), kind: 'save', save: 'con', target: 'area', range: 60, radius: 5, dice: '10d6', type: 'thunder', half: true, cond: 'prone', rounds: 1, desc: 'A furious storm tears across the sky.' }
    });
    // fix the one 2-part dice formula into a single die pool
    R.SPELLS.meteor_swarm.dice = '40d6';

    // ---------- companions (pets, familiars, mounts) ----------
    R.COMPANIONS = {
      dog: { name: 'Hound', mkey: 'wolf', price: 25, icon: '🐕', desc: 'A loyal hound that bites foes and sniffs out danger.', hpPer: 4, kind: 'pet' },
      hawk: { name: 'Hawk', mkey: 'giant_eagle', price: 40, icon: '🦅', desc: 'Swoops in to peck enemies and scout ahead.', hpPer: 3, kind: 'pet', scale: 0.6 },
      boar: { name: 'Boar', mkey: 'giant_boar', price: 50, icon: '🐗', desc: 'A grumpy boar that charges anything that threatens you.', hpPer: 5, kind: 'pet' },
      pony: { name: 'Pony', mkey: 'giant_boar', price: 30, icon: '🐴', desc: 'A sturdy mount: +2 squares of movement out of combat travel and carries loot.', hpPer: 4, kind: 'mount', noFight: true },
      cat: { name: 'Familiar Cat', mkey: 'panther', price: 0, icon: '🐈', desc: 'A familiar that helps you attack (advantage) and scouts.', hpPer: 2, kind: 'familiar', helper: true },
      owl: { name: 'Familiar Owl', mkey: 'giant_eagle', price: 0, icon: '🦉', desc: 'A familiar that flies in to help you aim.', hpPer: 2, kind: 'familiar', helper: true },
      wolf: { name: 'Wolf Companion', mkey: 'wolf', price: 0, icon: '🐺', desc: "A Beast Master's wolf. Grows stronger with you.", hpPer: 6, kind: 'companion' }
    };

    // ---------- factions ----------
    R.FACTIONS = {
      watch: { name: 'The Harbor Watch', icon: '🛡️', desc: 'Guards and honest folk. Like monster-slayers and hate thieves.' },
      guild: { name: 'The Salt Rats', icon: '🐀', desc: 'Smugglers and thieves. Pay well, ask no questions.' },
      circle: { name: 'The Green Circle', icon: '🌿', desc: 'Druids and rangers who protect the wild places.' },
      temple: { name: 'The Lantern Temple', icon: '🕯️', desc: 'Priests who fight the undead and heal the sick.' },
      crown: { name: 'The Crown', icon: '👑', desc: 'Nobles and knights of the realm.' }
    };
    R.repTier = (v) => v >= 60 ? { n: 'Hero', icon: '🌟', disc: 0.7 } : v >= 25 ? { n: 'Friend', icon: '😊', disc: 0.85 } : v > -25 ? { n: 'Neutral', icon: '😐', disc: 1 } : v > -60 ? { n: 'Distrusted', icon: '😠', disc: 1.25 } : { n: 'Enemy', icon: '💢', disc: 1.6 };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = extend; else if (root.RULES) extend(root.RULES);
})(typeof window !== 'undefined' ? window : globalThis);
