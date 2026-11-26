// Shared D&D 5e-style rules data (SRD-based). Loaded by both server and client.
(function (root) {
  const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

  const SKILLS = {
    acrobatics: 'dex', animal_handling: 'wis', arcana: 'int', athletics: 'str', deception: 'cha',
    history: 'int', insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis',
    nature: 'int', perception: 'wis', performance: 'cha', persuasion: 'cha', religion: 'int',
    sleight_of_hand: 'dex', stealth: 'dex', survival: 'wis'
  };

  const RACES = {
    Human: { bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 30, traits: ['Versatile'] },
    Elf: { bonus: { dex: 2, int: 1 }, speed: 30, traits: ['Darkvision', 'Keen Senses', 'Fey Ancestry', 'Trance'] },
    Dwarf: { bonus: { con: 2, wis: 1 }, speed: 25, traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning'] },
    Halfling: { bonus: { dex: 2, cha: 1 }, speed: 25, traits: ['Lucky', 'Brave', 'Nimble'] },
    Dragonborn: { bonus: { str: 2, cha: 1 }, speed: 30, traits: ['Breath Weapon (2d6)', 'Damage Resistance'] },
    Gnome: { bonus: { int: 2, con: 1 }, speed: 25, traits: ['Darkvision', 'Gnome Cunning'] },
    'Half-Elf': { bonus: { cha: 2, dex: 1, con: 1 }, speed: 30, traits: ['Darkvision', 'Fey Ancestry'] },
    'Half-Orc': { bonus: { str: 2, con: 1 }, speed: 30, traits: ['Darkvision', 'Relentless Endurance', 'Savage Attacks'] },
    Tiefling: { bonus: { cha: 2, int: 1 }, speed: 30, traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'] }
  };

  // armor: {base, dex: true|max number|false, extra:[ability] , shield}
  const CLASSES = {
    Barbarian: { hitDie: 12, primary: 'str', saves: ['str', 'con'], armor: { base: 10, dex: true, extra: ['con'] }, skillChoices: ['athletics', 'intimidation', 'perception', 'survival', 'nature', 'animal_handling'], picks: 2,
      weapons: [{ name: 'Greataxe', dice: '1d12', ability: 'str' }, { name: 'Handaxe (thrown)', dice: '1d6', ability: 'str', range: 4 }], features: ['Rage (2/day, +2 damage)', 'Unarmored Defense'], icon: '🪓', color: '#b5452c' },
    Bard: { hitDie: 8, primary: 'cha', saves: ['dex', 'cha'], armor: { base: 11, dex: true }, skillChoices: Object.keys(SKILLS), picks: 3,
      weapons: [{ name: 'Rapier', dice: '1d8', ability: 'dex' }, { name: 'Vicious Mockery', dice: '1d4', ability: 'cha', range: 12, spell: true }], spells: ['Vicious Mockery', 'Healing Word', 'Charm Person', 'Thunderwave'], features: ['Bardic Inspiration (d6)'], icon: '🪕', color: '#8a4fa3' },
    Cleric: { hitDie: 8, primary: 'wis', saves: ['wis', 'cha'], armor: { base: 16, dex: false, shield: 2 }, skillChoices: ['history', 'insight', 'medicine', 'persuasion', 'religion'], picks: 2,
      weapons: [{ name: 'Mace', dice: '1d6', ability: 'str' }, { name: 'Sacred Flame', dice: '1d8', ability: 'wis', range: 12, spell: true }], spells: ['Sacred Flame', 'Cure Wounds', 'Guiding Bolt', 'Bless'], features: ['Divine Domain'], icon: '✨', color: '#d9a62e' },
    Druid: { hitDie: 8, primary: 'wis', saves: ['int', 'wis'], armor: { base: 11, dex: true, shield: 2 }, skillChoices: ['arcana', 'animal_handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'], picks: 2,
      weapons: [{ name: 'Scimitar', dice: '1d6', ability: 'dex' }, { name: 'Produce Flame', dice: '1d8', ability: 'wis', range: 6, spell: true }], spells: ['Produce Flame', 'Healing Word', 'Entangle', 'Goodberry'], features: ['Druidic'], icon: '🌿', color: '#4f8a3a' },
    Fighter: { hitDie: 10, primary: 'str', saves: ['str', 'con'], armor: { base: 16, dex: false, shield: 2 }, skillChoices: ['acrobatics', 'animal_handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'], picks: 2,
      weapons: [{ name: 'Longsword', dice: '1d8', ability: 'str' }, { name: 'Light Crossbow', dice: '1d8', ability: 'dex', range: 16 }], features: ['Second Wind (1d10+level)', 'Fighting Style: Defense'], icon: '🗡️', color: '#5b6f86' },
    Monk: { hitDie: 8, primary: 'dex', saves: ['str', 'dex'], armor: { base: 10, dex: true, extra: ['wis'] }, skillChoices: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'], picks: 2,
      weapons: [{ name: 'Shortsword', dice: '1d6', ability: 'dex' }, { name: 'Unarmed Strike', dice: '1d4', ability: 'dex' }], features: ['Martial Arts', 'Unarmored Defense'], icon: '👊', color: '#c7782e' },
    Paladin: { hitDie: 10, primary: 'str', saves: ['wis', 'cha'], armor: { base: 16, dex: false, shield: 2 }, skillChoices: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'], picks: 2,
      weapons: [{ name: 'Longsword', dice: '1d8', ability: 'str' }, { name: 'Javelin (thrown)', dice: '1d6', ability: 'str', range: 6 }], features: ['Divine Sense', 'Lay on Hands (5 HP)'], icon: '🛡️', color: '#c9b458' },
    Ranger: { hitDie: 10, primary: 'dex', saves: ['str', 'dex'], armor: { base: 14, dex: 2 }, skillChoices: ['animal_handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'], picks: 3,
      weapons: [{ name: 'Longbow', dice: '1d8', ability: 'dex', range: 30 }, { name: 'Shortsword', dice: '1d6', ability: 'dex' }], features: ['Favored Enemy', 'Natural Explorer'], icon: '🏹', color: '#3f6b4a' },
    Rogue: { hitDie: 8, primary: 'dex', saves: ['dex', 'int'], armor: { base: 11, dex: true }, skillChoices: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight_of_hand', 'stealth'], picks: 4,
      weapons: [{ name: 'Shortsword', dice: '1d6', ability: 'dex' }, { name: 'Shortbow', dice: '1d6', ability: 'dex', range: 16 }], features: ['Sneak Attack (1d6)', "Thieves' Cant", 'Expertise'], icon: '🗝️', color: '#3b3b46' },
    Sorcerer: { hitDie: 6, primary: 'cha', saves: ['con', 'cha'], armor: { base: 10, dex: true }, skillChoices: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'], picks: 2,
      weapons: [{ name: 'Fire Bolt', dice: '1d10', ability: 'cha', range: 24, spell: true }, { name: 'Dagger', dice: '1d4', ability: 'dex' }], spells: ['Fire Bolt', 'Ray of Frost', 'Magic Missile', 'Shield'], features: ['Sorcerous Origin'], icon: '🔥', color: '#c23b4e' },
    Warlock: { hitDie: 8, primary: 'cha', saves: ['wis', 'cha'], armor: { base: 11, dex: true }, skillChoices: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'], picks: 2,
      weapons: [{ name: 'Eldritch Blast', dice: '1d10', ability: 'cha', range: 24, spell: true }, { name: 'Dagger', dice: '1d4', ability: 'dex' }], spells: ['Eldritch Blast', 'Hex', 'Armor of Agathys'], features: ['Otherworldly Patron', 'Pact Magic'], icon: '👁️', color: '#4b2f6b' },
    Wizard: { hitDie: 6, primary: 'int', saves: ['int', 'wis'], armor: { base: 10, dex: true }, skillChoices: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'], picks: 2,
      weapons: [{ name: 'Fire Bolt', dice: '1d10', ability: 'int', range: 24, spell: true }, { name: 'Quarterstaff', dice: '1d6', ability: 'str' }], spells: ['Fire Bolt', 'Mage Hand', 'Magic Missile', 'Shield', 'Sleep'], features: ['Arcane Recovery', 'Spellbook'], icon: '📜', color: '#2f5b9a' }
  };

  const BESTIARY = {
    'Goblin': { hp: 7, ac: 15, hit: 4, dmg: '1d6+2', xp: 50, emoji: '👺', speed: 6 },
    'Kobold': { hp: 5, ac: 12, hit: 4, dmg: '1d4+2', xp: 25, emoji: '🦎', speed: 6 },
    'Giant Rat': { hp: 7, ac: 12, hit: 4, dmg: '1d4+2', xp: 25, emoji: '🐀', speed: 6 },
    'Wolf': { hp: 11, ac: 13, hit: 4, dmg: '2d4+2', xp: 50, emoji: '🐺', speed: 8 },
    'Skeleton': { hp: 13, ac: 13, hit: 4, dmg: '1d6+2', xp: 50, emoji: '💀', speed: 6 },
    'Zombie': { hp: 22, ac: 8, hit: 3, dmg: '1d6+1', xp: 50, emoji: '🧟', speed: 4 },
    'Bandit': { hp: 11, ac: 12, hit: 3, dmg: '1d6+1', xp: 25, emoji: '🥷', speed: 6 },
    'Orc': { hp: 15, ac: 13, hit: 5, dmg: '1d12+3', xp: 100, emoji: '👹', speed: 6 },
    'Giant Spider': { hp: 26, ac: 14, hit: 5, dmg: '1d8+3', xp: 200, emoji: '🕷️', speed: 6 },
    'Bugbear': { hp: 27, ac: 16, hit: 4, dmg: '2d8+2', xp: 200, emoji: '🐻', speed: 6 },
    'Ghoul': { hp: 22, ac: 12, hit: 4, dmg: '2d6+2', xp: 200, emoji: '🧛', speed: 6 },
    'Ogre': { hp: 59, ac: 11, hit: 6, dmg: '2d8+4', xp: 450, emoji: '🧌', speed: 8 },
    'Owlbear': { hp: 59, ac: 13, hit: 7, dmg: '2d8+5', xp: 700, emoji: '🦉', speed: 8 },
    'Young Dragon': { hp: 136, ac: 18, hit: 9, dmg: '2d10+5', xp: 3900, emoji: '🐉', speed: 8 }
  };

  const XP_LEVELS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

  const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

  const SHOP_STOCK = [
    { item: 'Potion of Healing (2d4+2)', price: 50 }, { item: 'Rations (1 day)', price: 1 }, { item: 'Torch', price: 1 },
    { item: 'Rope, 50 ft', price: 1 }, { item: 'Healer\'s Kit', price: 5 }, { item: 'Arrows (20)', price: 1 },
    { item: 'Shield (+2 AC)', price: 10 }, { item: 'Chain Shirt', price: 50 }, { item: 'Longsword', price: 15 },
    { item: 'Dagger', price: 2 }, { item: 'Lantern', price: 5 }, { item: 'Thieves\' Tools', price: 25 }
  ];

  function mod(score) { return Math.floor((score - 10) / 2); }
  function prof(level) { return 2 + Math.floor((Math.max(1, level) - 1) / 4); }
  function levelForXp(xp) { let l = 1; for (let i = 0; i < XP_LEVELS.length; i++) if (xp >= XP_LEVELS[i]) l = i + 1; return l; }

  function computeAC(sheet) {
    const c = CLASSES[sheet.class]; if (!c) return 10;
    const a = c.armor; const s = sheet.scores; let ac = a.base;
    if (a.dex === true) ac += mod(s.dex); else if (typeof a.dex === 'number') ac += Math.min(a.dex, mod(s.dex));
    (a.extra || []).forEach(k => { ac += mod(s[k]); });
    if (a.shield) ac += a.shield;
    return ac + (sheet.acBonus || 0);
  }

  // Parse "2d6+3", "d20", "1d8-1", "4d6"
  function parseDice(f) {
    const m = String(f || '').replace(/\s+/g, '').toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
    if (!m) { const n = parseInt(f, 10); return isNaN(n) ? null : { n: 0, s: 0, b: n }; }
    return { n: Math.min(parseInt(m[1] || '1', 10), 50), s: Math.min(parseInt(m[2], 10), 1000), b: parseInt(m[3] || '0', 10) };
  }

  const api = { ABILITIES, ABILITY_NAMES, SKILLS, RACES, CLASSES, BESTIARY, XP_LEVELS, STANDARD_ARRAY, SHOP_STOCK, mod, prof, levelForXp, computeAC, parseDice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RULES = api;
})(typeof window !== 'undefined' ? window : globalThis);
