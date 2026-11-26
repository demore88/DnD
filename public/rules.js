// Roll Call — shared D&D 5e-style rules & content (SRD-based mechanics, original adventure).
// Loaded by the server (require) and the phone client (window.RULES).
(function (root) {
  const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
  const SKILLS = {
    acrobatics: 'dex', animal_handling: 'wis', arcana: 'int', athletics: 'str', deception: 'cha', history: 'int', insight: 'wis',
    intimidation: 'cha', investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis', performance: 'cha', persuasion: 'cha',
    religion: 'int', sleight_of_hand: 'dex', stealth: 'dex', survival: 'wis'
  };

  // ---------------- races ----------------
  const RACES = {
    Human: { bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 30, traits: ['Versatile: +1 to every ability'], blurb: 'Adaptable and ambitious.' },
    Elf: { bonus: { dex: 2, int: 1 }, speed: 30, dark: true, traits: ['Darkvision', 'Keen Senses (Perception)', 'Fey Ancestry: can\'t be magically put to sleep'], skills: ['perception'], blurb: 'Graceful, keen-eyed, long-lived.' },
    Dwarf: { bonus: { con: 2, wis: 1 }, speed: 25, dark: true, traits: ['Darkvision', 'Dwarven Resilience: advantage vs poison', 'Stonecunning'], blurb: 'Tough as the mountains.' },
    Halfling: { bonus: { dex: 2, cha: 1 }, speed: 25, traits: ['Lucky: reroll natural 1s', 'Brave: advantage vs fear', 'Nimble'], blurb: 'Small, quick, and lucky.' },
    Dragonborn: { bonus: { str: 2, cha: 1 }, speed: 30, traits: ['Breath Weapon (2d6, 1/rest)', 'Damage Resistance'], feature: 'breath_weapon', blurb: 'Proud draconic warriors.' },
    Gnome: { bonus: { int: 2, con: 1 }, speed: 25, dark: true, traits: ['Darkvision', 'Gnome Cunning: advantage on magic saves'], blurb: 'Clever tinkerers and illusionists.' },
    'Half-Elf': { bonus: { cha: 2, dex: 1, con: 1 }, speed: 30, dark: true, traits: ['Darkvision', 'Fey Ancestry', 'Skill Versatility'], blurb: 'Between two worlds.' },
    'Half-Orc': { bonus: { str: 2, con: 1 }, speed: 30, dark: true, traits: ['Darkvision', 'Relentless Endurance: drop to 1 HP instead of 0 (1/rest)', 'Savage Attacks: bigger crits'], skills: ['intimidation'], blurb: 'Fierce and unbreakable.' },
    Tiefling: { bonus: { cha: 2, int: 1 }, speed: 30, dark: true, traits: ['Darkvision', 'Hellish Resistance (fire)', 'Infernal Legacy'], blurb: 'Touched by fiendish blood.' }
  };

  // ---------------- weapons & armor ----------------
  const WEAPONS = {
    club: { name: 'Club', dice: '1d4', ab: 'str', type: 'bludgeoning' },
    dagger: { name: 'Dagger', dice: '1d4', ab: 'fin', range: 4, type: 'piercing', light: true },
    handaxe: { name: 'Handaxe', dice: '1d6', ab: 'str', range: 4, type: 'slashing', light: true },
    javelin: { name: 'Javelin', dice: '1d6', ab: 'str', range: 6, type: 'piercing' },
    mace: { name: 'Mace', dice: '1d6', ab: 'str', type: 'bludgeoning' },
    quarterstaff: { name: 'Quarterstaff', dice: '1d6', ab: 'str', type: 'bludgeoning' },
    spear: { name: 'Spear', dice: '1d6', ab: 'str', range: 4, type: 'piercing' },
    light_crossbow: { name: 'Light Crossbow', dice: '1d8', ab: 'dex', range: 16, ranged: true, type: 'piercing' },
    shortbow: { name: 'Shortbow', dice: '1d6', ab: 'dex', range: 16, ranged: true, type: 'piercing' },
    sling: { name: 'Sling', dice: '1d4', ab: 'dex', range: 6, ranged: true, type: 'bludgeoning' },
    battleaxe: { name: 'Battleaxe', dice: '1d8', ab: 'str', type: 'slashing' },
    greataxe: { name: 'Greataxe', dice: '1d12', ab: 'str', type: 'slashing', heavy: true },
    greatsword: { name: 'Greatsword', dice: '2d6', ab: 'str', type: 'slashing', heavy: true },
    longsword: { name: 'Longsword', dice: '1d8', ab: 'str', type: 'slashing' },
    morningstar: { name: 'Morningstar', dice: '1d8', ab: 'str', type: 'piercing' },
    rapier: { name: 'Rapier', dice: '1d8', ab: 'fin', type: 'piercing' },
    scimitar: { name: 'Scimitar', dice: '1d6', ab: 'fin', type: 'slashing', light: true },
    shortsword: { name: 'Shortsword', dice: '1d6', ab: 'fin', type: 'piercing', light: true },
    warhammer: { name: 'Warhammer', dice: '1d8', ab: 'str', type: 'bludgeoning' },
    longbow: { name: 'Longbow', dice: '1d8', ab: 'dex', range: 30, ranged: true, type: 'piercing' },
    unarmed: { name: 'Unarmed Strike', dice: '1d4', ab: 'fin', type: 'bludgeoning' }
  };
  // armor: base, dexMax (null = unlimited), cat
  const ARMOR = {
    leather: { name: 'Leather Armor', base: 11, dexMax: null, cat: 'light' },
    studded: { name: 'Studded Leather', base: 12, dexMax: null, cat: 'light' },
    chain_shirt: { name: 'Chain Shirt', base: 13, dexMax: 2, cat: 'medium' },
    scale: { name: 'Scale Mail', base: 14, dexMax: 2, cat: 'medium' },
    breastplate: { name: 'Breastplate', base: 14, dexMax: 2, cat: 'medium' },
    half_plate: { name: 'Half Plate', base: 15, dexMax: 2, cat: 'medium' },
    chain_mail: { name: 'Chain Mail', base: 16, dexMax: 0, cat: 'heavy' },
    splint: { name: 'Splint Armor', base: 17, dexMax: 0, cat: 'heavy' },
    plate: { name: 'Plate Armor', base: 18, dexMax: 0, cat: 'heavy' }
  };

  // ---------------- classes ----------------
  // features: level -> feature keys. caster: full | half | pact | null
  const CLASSES = {
    Barbarian: { hitDie: 12, primary: 'str', saves: ['str', 'con'], armorProf: ['light', 'medium', 'shield'], unarmored: 'con', start: { armor: null, shield: false, weapons: ['greataxe', 'handaxe', 'javelin'] },
      skillChoices: ['athletics', 'intimidation', 'perception', 'survival', 'nature', 'animal_handling'], picks: 2, features: { 1: ['rage', 'unarmored_defense'], 2: ['reckless_attack'], 3: [], 5: ['extra_attack'] },
      icon: '🪓', color: '#b5452c', blurb: 'Furious warrior. Rage to hit harder and shrug off blows.' },
    Bard: { hitDie: 8, primary: 'cha', saves: ['dex', 'cha'], armorProf: ['light'], caster: 'full', castAb: 'cha', start: { armor: 'leather', weapons: ['rapier', 'dagger'] },
      skillChoices: Object.keys(SKILLS), picks: 3, features: { 1: ['bardic_inspiration'], 2: [], 5: [] }, icon: '🪕', color: '#8a4fa3', blurb: 'Magic through music. Inspire friends, mock foes, heal.' },
    Cleric: { hitDie: 8, primary: 'wis', saves: ['wis', 'cha'], armorProf: ['light', 'medium', 'heavy', 'shield'], caster: 'full', castAb: 'wis', start: { armor: 'chain_mail', shield: true, weapons: ['mace', 'light_crossbow'] },
      skillChoices: ['history', 'insight', 'medicine', 'persuasion', 'religion'], picks: 2, features: { 1: [], 2: ['turn_undead'], 5: [] }, icon: '✨', color: '#d9a62e', blurb: 'Holy warrior. Best healer, scares the undead.' },
    Druid: { hitDie: 8, primary: 'wis', saves: ['int', 'wis'], armorProf: ['light', 'medium', 'shield'], caster: 'full', castAb: 'wis', start: { armor: 'leather', shield: true, weapons: ['scimitar', 'sling'] },
      skillChoices: ['arcana', 'animal_handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'], picks: 2, features: { 1: [], 2: [] }, icon: '🌿', color: '#4f8a3a', blurb: 'Nature magic. Tangles foes, calls fire and heals.' },
    Fighter: { hitDie: 10, primary: 'str', saves: ['str', 'con'], armorProf: ['light', 'medium', 'heavy', 'shield'], start: { armor: 'chain_mail', shield: true, weapons: ['longsword', 'light_crossbow', 'handaxe'] },
      skillChoices: ['acrobatics', 'animal_handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'], picks: 2, features: { 1: ['second_wind', 'fighting_style'], 2: ['action_surge'], 5: ['extra_attack'] },
      icon: '🗡️', color: '#5b6f86', blurb: 'Master of arms and armor. Tough, steady, dangerous.' },
    Monk: { hitDie: 8, primary: 'dex', saves: ['str', 'dex'], armorProf: [], unarmored: 'wis', start: { armor: null, weapons: ['shortsword', 'unarmed', 'dagger'] },
      skillChoices: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'], picks: 2, features: { 1: ['martial_arts', 'unarmored_defense'], 2: ['ki', 'flurry'], 5: ['extra_attack'] },
      icon: '👊', color: '#c7782e', blurb: 'Lightning fists. Extra strikes every turn.' },
    Paladin: { hitDie: 10, primary: 'str', saves: ['wis', 'cha'], armorProf: ['light', 'medium', 'heavy', 'shield'], caster: 'half', castAb: 'cha', start: { armor: 'chain_mail', shield: true, weapons: ['longsword', 'javelin'] },
      skillChoices: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'], picks: 2, features: { 1: ['lay_on_hands'], 2: ['divine_smite'], 5: ['extra_attack'] },
      icon: '🛡️', color: '#c9b458', blurb: 'Sworn knight. Heals by touch, smites with holy fire.' },
    Ranger: { hitDie: 10, primary: 'dex', saves: ['str', 'dex'], armorProf: ['light', 'medium', 'shield'], caster: 'half', castAb: 'wis', earlySpells: true, start: { armor: 'scale', weapons: ['longbow', 'shortsword', 'shortsword'] },
      skillChoices: ['animal_handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'], picks: 3, features: { 1: ['favored_foe'], 2: [], 5: ['extra_attack'] },
      icon: '🏹', color: '#3f6b4a', blurb: 'Hunter and tracker. Deadly with a bow.' },
    Rogue: { hitDie: 8, primary: 'dex', saves: ['dex', 'int'], armorProf: ['light'], start: { armor: 'leather', weapons: ['shortsword', 'shortbow', 'dagger'] },
      skillChoices: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight_of_hand', 'stealth'], picks: 4,
      features: { 1: ['sneak_attack', 'thieves_cant'], 2: ['cunning_action'], 5: ['uncanny_dodge'] }, icon: '🗝️', color: '#3b3b46', blurb: 'Sneaky striker. Huge damage when an ally is close.' },
    Sorcerer: { hitDie: 6, primary: 'cha', saves: ['con', 'cha'], armorProf: [], caster: 'full', castAb: 'cha', start: { armor: null, weapons: ['dagger', 'quarterstaff'] },
      skillChoices: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'], picks: 2, features: { 1: [], 2: [] }, icon: '🔥', color: '#c23b4e', blurb: 'Born with raw magic. Big blasts.' },
    Warlock: { hitDie: 8, primary: 'cha', saves: ['wis', 'cha'], armorProf: ['light'], caster: 'pact', castAb: 'cha', start: { armor: 'leather', weapons: ['dagger', 'light_crossbow'] },
      skillChoices: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'], picks: 2, features: { 1: [], 2: [] }, icon: '👁️', color: '#4b2f6b', blurb: 'Power from a mysterious patron. Eldritch Blast!' },
    Wizard: { hitDie: 6, primary: 'int', saves: ['int', 'wis'], armorProf: [], caster: 'full', castAb: 'int', start: { armor: null, weapons: ['quarterstaff', 'dagger'] },
      skillChoices: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'], picks: 2, features: { 1: ['arcane_recovery'], 2: [] }, icon: '📜', color: '#2f5b9a', blurb: 'Scholar of spells. The most magic of all.' }
  };

  // usable features: kind action|bonus|free|passive, uses per rest
  const FEATURES = {
    rage: { name: 'Rage', kind: 'bonus', uses: (l) => l >= 3 ? 3 : 2, rest: 'long', desc: '+2 melee damage and take half damage from weapon hits for 10 rounds.' },
    unarmored_defense: { name: 'Unarmored Defense', kind: 'passive', desc: 'No armor? Add a second ability to AC.' },
    reckless_attack: { name: 'Reckless Attack', kind: 'passive', desc: 'Toggle when attacking: advantage for you, but enemies get advantage on you this round.' },
    extra_attack: { name: 'Extra Attack', kind: 'passive', desc: 'Attack twice with the Attack action.' },
    bardic_inspiration: { name: 'Bardic Inspiration', kind: 'bonus', uses: (l, ch) => Math.max(1, mod(ch.scores.cha)), rest: 'long', target: 'ally', range: 12, desc: 'An ally adds +1d6 to their next attack or check.' },
    turn_undead: { name: 'Turn Undead', kind: 'action', uses: () => 1, rest: 'short', desc: 'Undead within 6 squares make a Wisdom save or flee in terror.' },
    second_wind: { name: 'Second Wind', kind: 'bonus', uses: () => 1, rest: 'short', desc: 'Heal 1d10 + your level.' },
    fighting_style: { name: 'Fighting Style: Defense', kind: 'passive', desc: '+1 AC while wearing armor.' },
    action_surge: { name: 'Action Surge', kind: 'free', uses: () => 1, rest: 'short', desc: 'Take one extra action this turn.' },
    martial_arts: { name: 'Martial Arts', kind: 'bonus', desc: 'After you attack, make a bonus unarmed strike.' },
    ki: { name: 'Ki', kind: 'passive', desc: 'Ki points fuel Flurry of Blows.' },
    flurry: { name: 'Flurry of Blows', kind: 'bonus', cost: 'ki', desc: 'Spend 1 ki: two bonus unarmed strikes.' },
    lay_on_hands: { name: 'Lay on Hands', kind: 'action', pool: (l) => 5 * l, rest: 'long', target: 'ally', range: 1, desc: 'Heal by touch from a pool of 5 HP per level.' },
    divine_smite: { name: 'Divine Smite', kind: 'passive', desc: 'When you hit with a melee attack, spend a spell slot for +2d8 radiant damage.' },
    favored_foe: { name: "Hunter's Mark", kind: 'passive', desc: 'You know Hunter\'s Mark. Mark prey for +1d6 damage.' },
    sneak_attack: { name: 'Sneak Attack', kind: 'passive', desc: 'Once per turn, +Xd6 damage if you have advantage or an ally is next to the target.' },
    thieves_cant: { name: "Thieves' Cant", kind: 'passive', desc: 'Secret rogue language and signs.' },
    cunning_action: { name: 'Cunning Action', kind: 'passive', desc: 'Dash or Hide as a bonus action.' },
    uncanny_dodge: { name: 'Uncanny Dodge', kind: 'passive', desc: 'Halve the first hit you take each round.' },
    arcane_recovery: { name: 'Arcane Recovery', kind: 'passive', desc: 'Regain a spell slot on a short rest.' },
    breath_weapon: { name: 'Breath Weapon', kind: 'action', uses: () => 1, rest: 'short', target: 'area', range: 3, radius: 1, desc: 'Dex save, 2d6 damage to enemies in a small blast (half on save).' }
  };

  // ---------------- spells ----------------
  // kind: attack | save | auto | heal | buff | debuff | utility.  target: enemy | ally | self | area
  const SPELLS = {
    fire_bolt: { name: 'Fire Bolt', lvl: 0, cls: ['Wizard', 'Sorcerer'], kind: 'attack', target: 'enemy', range: 24, dice: '1d10', type: 'fire', scale: true, desc: 'Hurl a mote of fire.' },
    ray_of_frost: { name: 'Ray of Frost', lvl: 0, cls: ['Wizard', 'Sorcerer'], kind: 'attack', target: 'enemy', range: 12, dice: '1d8', type: 'cold', scale: true, cond: 'slowed', rounds: 1, desc: 'Freezing beam; target is slowed.' },
    shocking_grasp: { name: 'Shocking Grasp', lvl: 0, cls: ['Wizard', 'Sorcerer'], kind: 'attack', target: 'enemy', range: 1, dice: '1d8', type: 'lightning', scale: true, desc: 'Lightning from your hand.' },
    sacred_flame: { name: 'Sacred Flame', lvl: 0, cls: ['Cleric'], kind: 'save', save: 'dex', target: 'enemy', range: 12, dice: '1d8', type: 'radiant', scale: true, desc: 'Holy fire falls on a foe (Dex save).' },
    toll_the_dead: { name: 'Toll the Dead', lvl: 0, cls: ['Cleric', 'Wizard', 'Warlock'], kind: 'save', save: 'wis', target: 'enemy', range: 12, dice: '1d8', woundedDice: '1d12', type: 'necrotic', scale: true, desc: 'A doleful bell — hurts more if they\'re wounded.' },
    eldritch_blast: { name: 'Eldritch Blast', lvl: 0, cls: ['Warlock'], kind: 'attack', target: 'enemy', range: 24, dice: '1d10', type: 'force', scale: true, desc: 'Crackling beam of force.' },
    vicious_mockery: { name: 'Vicious Mockery', lvl: 0, cls: ['Bard'], kind: 'save', save: 'wis', target: 'enemy', range: 12, dice: '1d4', type: 'psychic', scale: true, cond: 'mocked', rounds: 1, desc: 'Insult so cutting it hurts. Target has disadvantage on its next attack.' },
    produce_flame: { name: 'Produce Flame', lvl: 0, cls: ['Druid'], kind: 'attack', target: 'enemy', range: 6, dice: '1d8', type: 'fire', scale: true, desc: 'Throw a flickering flame.' },
    thorn_whip: { name: 'Thorn Whip', lvl: 0, cls: ['Druid'], kind: 'attack', target: 'enemy', range: 6, dice: '1d6', type: 'piercing', scale: true, pull: 2, desc: 'Thorny vine lashes and pulls the target closer.' },
    magic_missile: { name: 'Magic Missile', lvl: 1, cls: ['Wizard', 'Sorcerer'], kind: 'auto', target: 'enemy', range: 24, dice: '1d4+1', darts: 3, type: 'force', desc: 'Three darts that never miss.' },
    cure_wounds: { name: 'Cure Wounds', lvl: 1, cls: ['Cleric', 'Druid', 'Bard', 'Paladin', 'Ranger'], kind: 'heal', target: 'ally', range: 1, dice: '1d8', addMod: true, desc: 'Touch an ally to heal them.' },
    healing_word: { name: 'Healing Word', lvl: 1, cls: ['Cleric', 'Bard', 'Druid'], kind: 'heal', cast: 'bonus', target: 'ally', range: 12, dice: '1d4', addMod: true, desc: 'A quick word heals an ally from afar. Bonus action.' },
    guiding_bolt: { name: 'Guiding Bolt', lvl: 1, cls: ['Cleric'], kind: 'attack', target: 'enemy', range: 24, dice: '4d6', type: 'radiant', cond: 'lit', rounds: 1, desc: 'A flash of light. The next attack on the target has advantage.' },
    thunderwave: { name: 'Thunderwave', lvl: 1, cls: ['Wizard', 'Sorcerer', 'Bard', 'Druid'], kind: 'save', save: 'con', target: 'self', radius: 1, dice: '2d8', type: 'thunder', half: true, push: 2, desc: 'A boom blasts enemies next to you away (Con save).' },
    burning_hands: { name: 'Burning Hands', lvl: 1, cls: ['Wizard', 'Sorcerer'], kind: 'save', save: 'dex', target: 'area', range: 3, radius: 1, dice: '3d6', type: 'fire', half: true, desc: 'A sheet of flame (Dex save, half on success).' },
    sleep: { name: 'Sleep', lvl: 1, cls: ['Wizard', 'Sorcerer', 'Bard'], kind: 'sleep', target: 'area', range: 18, radius: 2, dice: '5d8', desc: 'Put creatures to sleep, weakest first.' },
    bless: { name: 'Bless', lvl: 1, cls: ['Cleric', 'Paladin'], kind: 'buff', target: 'allies', count: 3, range: 6, cond: 'blessed', rounds: 10, desc: 'Up to 3 allies add +1d4 to attacks and saves.' },
    shield_of_faith: { name: 'Shield of Faith', lvl: 1, cls: ['Cleric', 'Paladin'], kind: 'buff', cast: 'bonus', target: 'ally', range: 12, cond: 'shield_of_faith', rounds: 10, desc: '+2 AC to an ally. Bonus action.' },
    shield: { name: 'Shield', lvl: 1, cls: ['Wizard', 'Sorcerer'], kind: 'buff', cast: 'bonus', target: 'self', cond: 'shielded', rounds: 1, desc: '+5 AC until your next turn.' },
    faerie_fire: { name: 'Faerie Fire', lvl: 1, cls: ['Bard', 'Druid'], kind: 'debuff', save: 'dex', target: 'area', range: 12, radius: 1, cond: 'outlined', rounds: 10, desc: 'Glowing outline — attacks against them have advantage.' },
    entangle: { name: 'Entangle', lvl: 1, cls: ['Druid'], kind: 'debuff', save: 'str', target: 'area', range: 18, radius: 1, cond: 'restrained', rounds: 3, desc: 'Grasping weeds restrain foes (Str save).' },
    hex: { name: 'Hex', lvl: 1, cls: ['Warlock'], kind: 'debuff', cast: 'bonus', target: 'enemy', range: 18, cond: 'hexed', rounds: 60, noSave: true, desc: 'Curse a foe: your hits deal +1d6 necrotic. Bonus action.' },
    hunters_mark: { name: "Hunter's Mark", lvl: 1, cls: ['Ranger'], kind: 'debuff', cast: 'bonus', target: 'enemy', range: 18, cond: 'marked', rounds: 60, noSave: true, desc: 'Mark your prey: your hits deal +1d6. Bonus action.' },
    charm_person: { name: 'Charm Person', lvl: 1, cls: ['Bard', 'Wizard', 'Sorcerer', 'Warlock', 'Druid'], kind: 'debuff', save: 'wis', target: 'enemy', range: 6, cond: 'charmed', rounds: 3, humanoid: true, desc: 'A humanoid sees you as a friend and won\'t attack (Wis save).' },
    armor_of_agathys: { name: 'Armor of Agathys', lvl: 1, cls: ['Warlock'], kind: 'buff', target: 'self', cond: 'agathys', rounds: 60, temp: 5, desc: '5 temporary HP; attackers take 5 cold damage.' },
    goodberry: { name: 'Goodberry', lvl: 1, cls: ['Druid', 'Ranger'], kind: 'utility', target: 'self', item: 'goodberry', qty: 10, desc: 'Ten magic berries, each heals 1 HP.' },
    detect_magic: { name: 'Detect Magic', lvl: 1, cls: ['Wizard', 'Sorcerer', 'Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger'], kind: 'utility', target: 'self', reveal: 'magic', desc: 'Sense hidden magic and secrets nearby.' },
    scorching_ray: { name: 'Scorching Ray', lvl: 2, cls: ['Wizard', 'Sorcerer'], kind: 'attack', target: 'enemy', range: 24, dice: '2d6', rays: 3, type: 'fire', desc: 'Three rays of fire.' },
    shatter: { name: 'Shatter', lvl: 2, cls: ['Wizard', 'Sorcerer', 'Bard', 'Warlock'], kind: 'save', save: 'con', target: 'area', range: 12, radius: 2, dice: '3d8', type: 'thunder', half: true, desc: 'A ringing blast (Con save).' },
    hold_person: { name: 'Hold Person', lvl: 2, cls: ['Wizard', 'Sorcerer', 'Bard', 'Cleric', 'Druid', 'Warlock'], kind: 'debuff', save: 'wis', target: 'enemy', range: 12, cond: 'paralyzed', rounds: 2, humanoid: true, desc: 'Freeze a humanoid in place. Hits on it are critical.' },
    misty_step: { name: 'Misty Step', lvl: 2, cls: ['Wizard', 'Sorcerer', 'Warlock'], kind: 'teleport', cast: 'bonus', target: 'tile', range: 6, desc: 'Teleport 6 squares. Bonus action.' },
    spiritual_weapon: { name: 'Spiritual Weapon', lvl: 2, cls: ['Cleric'], kind: 'attack', cast: 'bonus', target: 'enemy', range: 12, dice: '1d8', addMod: true, type: 'force', desc: 'A floating weapon strikes. Bonus action.' },
    moonbeam: { name: 'Moonbeam', lvl: 2, cls: ['Druid'], kind: 'save', save: 'con', target: 'area', range: 24, radius: 1, dice: '2d10', type: 'radiant', half: true, desc: 'A silvery beam burns foes (Con save).' },
    fireball: { name: 'Fireball', lvl: 3, cls: ['Wizard', 'Sorcerer'], kind: 'save', save: 'dex', target: 'area', range: 30, radius: 2, dice: '8d6', type: 'fire', half: true, desc: 'The classic. A huge explosion (Dex save).' },
    mass_healing_word: { name: 'Mass Healing Word', lvl: 3, cls: ['Cleric', 'Bard'], kind: 'heal', cast: 'bonus', target: 'allies', count: 6, range: 12, dice: '1d4', addMod: true, desc: 'Heal the whole party. Bonus action.' },
    spirit_guardians: { name: 'Spirit Guardians', lvl: 3, cls: ['Cleric'], kind: 'save', save: 'wis', target: 'self', radius: 2, dice: '3d8', type: 'radiant', half: true, desc: 'Spirits sear every foe around you (Wis save).' },
    lightning_bolt: { name: 'Lightning Bolt', lvl: 3, cls: ['Wizard', 'Sorcerer'], kind: 'save', save: 'dex', target: 'area', range: 20, radius: 1, dice: '8d6', type: 'lightning', half: true, desc: 'A stroke of lightning (Dex save).' }
  };

  const CONDITIONS = {
    raging: { name: 'Raging', icon: '😤', good: true }, blessed: { name: 'Blessed', icon: '🙏', good: true }, shielded: { name: 'Shield', icon: '🔰', good: true },
    shield_of_faith: { name: 'Shield of Faith', icon: '🛡️', good: true }, inspired: { name: 'Inspired', icon: '🎵', good: true }, hidden: { name: 'Hidden', icon: '🫥', good: true },
    dodging: { name: 'Dodging', icon: '💨', good: true }, helped: { name: 'Helped', icon: '🤝', good: true }, agathys: { name: 'Armor of Agathys', icon: '❄️', good: true },
    reckless: { name: 'Reckless', icon: '💢' }, poisoned: { name: 'Poisoned', icon: '🤢' }, prone: { name: 'Prone', icon: '🫠' }, restrained: { name: 'Restrained', icon: '🕸️' },
    frightened: { name: 'Frightened', icon: '😱' }, charmed: { name: 'Charmed', icon: '💗' }, paralyzed: { name: 'Paralyzed', icon: '🧊' }, asleep: { name: 'Asleep', icon: '💤' },
    slowed: { name: 'Slowed', icon: '🐌' }, mocked: { name: 'Mocked', icon: '🤡' }, lit: { name: 'Glowing', icon: '🌟' }, outlined: { name: 'Outlined', icon: '✴️' },
    hexed: { name: 'Hexed', icon: '🟣' }, marked: { name: 'Marked', icon: '🎯' }, turned: { name: 'Turned', icon: '☀️' }
  };

  // ---------------- items ----------------
  const ITEMS = {
    potion_healing: { name: 'Potion of Healing', icon: '🧪', use: 'heal', dice: '2d4+2', cast: 'bonus', price: 50, desc: 'Drink (bonus action) to heal 2d4+2.' },
    potion_greater: { name: 'Potion of Greater Healing', icon: '⚗️', use: 'heal', dice: '4d4+4', cast: 'bonus', price: 150, desc: 'Heal 4d4+4.' },
    potion_heroism: { name: 'Potion of Heroism', icon: '🦸', use: 'buff', cond: 'blessed', rounds: 10, temp: 10, price: 120, desc: '10 temp HP and Blessed for 10 rounds.' },
    alch_fire: { name: "Alchemist's Fire", icon: '🔥', use: 'throw', dice: '2d6', type: 'fire', range: 4, price: 50, desc: 'Throw: 2d6 fire on a hit.' },
    holy_water: { name: 'Holy Water', icon: '💧', use: 'throw', dice: '2d6', type: 'radiant', undeadOnly: true, range: 4, price: 25, desc: 'Throw: 2d6 radiant vs undead.' },
    antitoxin: { name: 'Antitoxin', icon: '🍵', use: 'cure', cure: 'poisoned', price: 50, desc: 'Cures poison.' },
    scroll_mm: { name: 'Scroll of Magic Missile', icon: '📜', use: 'spell', spell: 'magic_missile', price: 75, desc: 'Anyone can read it once: Magic Missile.' },
    scroll_fireball: { name: 'Scroll of Fireball', icon: '📜', use: 'spell', spell: 'fireball', price: 300, desc: 'Read once: Fireball!' },
    goodberry: { name: 'Goodberry', icon: '🫐', use: 'heal', dice: '1', cast: 'bonus', desc: 'Heals 1 HP.' },
    healers_kit: { name: "Healer's Kit", icon: '🩹', use: 'stabilize', price: 5, desc: 'Stabilize a fallen ally.' },
    thieves_tools: { name: "Thieves' Tools", icon: '🛠️', tool: true, price: 25, desc: 'Advantage on picking locks and disarming traps.' },
    torch: { name: 'Torch', icon: '🔦', price: 1, desc: 'Light.' }, rope: { name: 'Rope, 50 ft', icon: '🪢', price: 1, desc: 'Climb, tie, haul.' },
    rations: { name: 'Rations', icon: '🍞', price: 1, desc: 'Food for a day.' },
    // gear
    shield_item: { name: 'Shield', icon: '🛡️', equip: 'shield', price: 10, desc: '+2 AC.' },
    leather: { name: 'Leather Armor', icon: '🦺', equip: 'armor', armor: 'leather', price: 10 },
    studded: { name: 'Studded Leather', icon: '🦺', equip: 'armor', armor: 'studded', price: 45 },
    chain_shirt: { name: 'Chain Shirt', icon: '⛓️', equip: 'armor', armor: 'chain_shirt', price: 50 },
    scale: { name: 'Scale Mail', icon: '⛓️', equip: 'armor', armor: 'scale', price: 50 },
    breastplate: { name: 'Breastplate', icon: '🥋', equip: 'armor', armor: 'breastplate', price: 400 },
    half_plate: { name: 'Half Plate', icon: '🥋', equip: 'armor', armor: 'half_plate', price: 750 },
    splint: { name: 'Splint Armor', icon: '🥋', equip: 'armor', armor: 'splint', price: 200 },
    plate: { name: 'Plate Armor', icon: '🥋', equip: 'armor', armor: 'plate', price: 1500 },
    w_longsword: { name: 'Longsword', icon: '🗡️', equip: 'weapon', weapon: 'longsword', price: 15 }, w_rapier: { name: 'Rapier', icon: '🗡️', equip: 'weapon', weapon: 'rapier', price: 25 },
    w_greatsword: { name: 'Greatsword', icon: '⚔️', equip: 'weapon', weapon: 'greatsword', price: 50 }, w_warhammer: { name: 'Warhammer', icon: '🔨', equip: 'weapon', weapon: 'warhammer', price: 15 },
    w_longbow: { name: 'Longbow', icon: '🏹', equip: 'weapon', weapon: 'longbow', price: 50 }, w_shortbow: { name: 'Shortbow', icon: '🏹', equip: 'weapon', weapon: 'shortbow', price: 25 },
    w_dagger: { name: 'Dagger', icon: '🔪', equip: 'weapon', weapon: 'dagger', price: 2 }, w_battleaxe: { name: 'Battleaxe', icon: '🪓', equip: 'weapon', weapon: 'battleaxe', price: 10 },
    w_p1_sword: { name: '+1 Longsword', icon: '🗡️', equip: 'weapon', weapon: 'longsword', plus: 1, magic: true, price: 500 },
    w_p1_bow: { name: '+1 Shortbow', icon: '🏹', equip: 'weapon', weapon: 'shortbow', plus: 1, magic: true, price: 500 },
    w_p1_dagger: { name: '+1 Dagger "Tidebite"', icon: '🔪', equip: 'weapon', weapon: 'dagger', plus: 1, magic: true, price: 400 },
    w_p1_mace: { name: '+1 Mace of the Dawn', icon: '🔨', equip: 'weapon', weapon: 'mace', plus: 1, magic: true, extra: { dice: '1d6', type: 'radiant', vs: 'undead' }, price: 600 },
    ring_prot: { name: 'Ring of Protection', icon: '💍', equip: 'ring', ac: 1, magic: true, price: 800, desc: '+1 AC.' },
    cloak_prot: { name: 'Cloak of Protection', icon: '🧥', equip: 'cloak', ac: 1, magic: true, price: 800, desc: '+1 AC.' },
    boots_striding: { name: 'Boots of Striding', icon: '🥾', equip: 'boots', speed: 10, magic: true, price: 500, desc: '+10 ft speed.' },
    wand_mm: { name: 'Wand of Magic Missiles', icon: '🪄', use: 'spell', spell: 'magic_missile', charges: 7, magic: true, price: 800, desc: '7 charges of Magic Missile.' },
    // story items
    bell_key: { name: 'Barnacled Bell Key', icon: '🗝️', story: true, desc: 'A green-crusted key shaped like a bell clapper.' },
    tide_chant: { name: 'Tide-Chant Scroll', icon: '🌊', story: true, desc: 'A sea-shanty that parts the tide over the causeway.' },
    seaglass: { name: 'Shard of Moonlit Seaglass', icon: '💎', story: true, desc: 'It glows faintly — Sister Ilsa wanted this.' },
    locket: { name: "Tobin's Locket", icon: '📿', story: true, desc: 'A tin locket with a painting of Old Marta inside.' },
    choir_letter: { name: 'Waterlogged Letter', icon: '✉️', story: true, desc: '"The Choir pays in pearls. Bring the clapper to the cove." — signed with a drowned bell.' },
    rat_crown: { name: 'Tiny Rat Crown', icon: '👑', story: true, desc: 'Made of bent spoons. Wren will laugh.' }
  };
  const SHOP_GENERAL = ['potion_healing', 'antitoxin', 'healers_kit', 'thieves_tools', 'alch_fire', 'holy_water', 'torch', 'rope', 'rations'];
  const SHOP_SMITH = ['shield_item', 'leather', 'studded', 'chain_shirt', 'scale', 'breastplate', 'splint', 'w_longsword', 'w_rapier', 'w_greatsword', 'w_warhammer', 'w_battleaxe', 'w_longbow', 'w_shortbow', 'w_dagger'];
  const SHOP_TEMPLE = ['potion_healing', 'potion_greater', 'holy_water', 'antitoxin', 'scroll_mm', 'healers_kit'];

  // ---------------- monsters ----------------
  // art: {a: archetype, c1, c2, eye, x: extras[]}; att: attacks; traits; special: recharge abilities
  const M = (o) => o;
  const BESTIARY = {
    giant_rat: M({ name: 'Giant Rat', hp: 7, ac: 12, speed: 6, xp: 25, cr: '1/8', type: 'beast', att: [{ n: 'Bite', hit: 4, dmg: '1d4+2', type: 'piercing' }], traits: ['pack_tactics'], art: { a: 'beast', c1: '#6e5a4c', c2: '#d9a3a0', eye: '#ff4040', x: ['ears', 'tail', 'thin'] } }),
    rat_king: M({ name: 'The Rat King', hp: 34, ac: 13, speed: 6, xp: 200, cr: '1', type: 'beast', boss: true, att: [{ n: 'Swarm of Bites', hit: 5, dmg: '2d6+1', type: 'piercing' }], multi: 1, traits: ['pack_tactics'], special: [{ n: 'Call the Mischief', kind: 'summon', recharge: 5, summon: 'giant_rat', count: 2 }], art: { a: 'swarm', c1: '#5b4a3e', c2: '#d9a62e', eye: '#ff4040', x: ['crown'] } }),
    kobold: M({ name: 'Kobold', hp: 5, ac: 12, speed: 6, xp: 25, cr: '1/8', type: 'humanoid', att: [{ n: 'Dagger', hit: 4, dmg: '1d4+2', type: 'piercing' }, { n: 'Sling', hit: 4, dmg: '1d4+2', range: 6, type: 'bludgeoning' }], traits: ['pack_tactics', 'cowardly'], art: { a: 'humanoid', c1: '#b5542c', c2: '#7a3a1c', eye: '#ffd36b', x: ['horns', 'tail', 'small', 'snout'] } }),
    goblin: M({ name: 'Goblin', hp: 7, ac: 15, speed: 6, xp: 50, cr: '1/4', type: 'humanoid', att: [{ n: 'Scimitar', hit: 4, dmg: '1d6+2', type: 'slashing' }, { n: 'Shortbow', hit: 4, dmg: '1d6+2', range: 16, type: 'piercing' }], traits: ['nimble_escape', 'cowardly'], art: { a: 'humanoid', c1: '#7aa63f', c2: '#6b4a2b', eye: '#ffd36b', x: ['ears', 'small', 'teeth'] } }),
    goblin_boss: M({ name: 'Goblin Boss', hp: 21, ac: 17, speed: 6, xp: 200, cr: '1', type: 'humanoid', att: [{ n: 'Scimitar', hit: 4, dmg: '1d6+2', type: 'slashing' }], multi: 2, traits: ['nimble_escape'], art: { a: 'humanoid', c1: '#5f8f33', c2: '#8a2f1c', eye: '#ffd36b', x: ['ears', 'small', 'teeth', 'crown'] } }),
    bandit: M({ name: 'Bandit', hp: 11, ac: 12, speed: 6, xp: 25, cr: '1/8', type: 'humanoid', att: [{ n: 'Scimitar', hit: 3, dmg: '1d6+1', type: 'slashing' }, { n: 'Light Crossbow', hit: 3, dmg: '1d8+1', range: 16, type: 'piercing' }], traits: ['cowardly'], art: { a: 'humanoid', c1: '#d8a57a', c2: '#5a4a3a', eye: '#2b1d12', x: ['hood', 'mask'] } }),
    smuggler: M({ name: 'Smuggler', hp: 16, ac: 13, speed: 6, xp: 50, cr: '1/4', type: 'humanoid', att: [{ n: 'Cutlass', hit: 4, dmg: '1d6+2', type: 'slashing' }, { n: 'Throwing Knife', hit: 4, dmg: '1d4+2', range: 6, type: 'piercing' }], traits: ['cowardly'], art: { a: 'humanoid', c1: '#c98f62', c2: '#2f5b9a', eye: '#2b1d12', x: ['bandana', 'beard'] } }),
    mara_vex: M({ name: 'Mara Vex, Smuggler Queen', hp: 45, ac: 15, speed: 6, xp: 450, cr: '2', type: 'humanoid', boss: true, att: [{ n: 'Cutlass', hit: 5, dmg: '1d6+3', type: 'slashing' }, { n: 'Throwing Knife', hit: 5, dmg: '1d4+3', range: 6, type: 'piercing' }], multi: 2, traits: ['parry'], special: [{ n: 'Rally the Crew!', kind: 'summon', recharge: 6, summon: 'smuggler', count: 1, once: true }], art: { a: 'humanoid', c1: '#a86f4a', c2: '#8a2f1c', eye: '#2b1d12', x: ['tricorn', 'coat'] } }),
    cultist: M({ name: 'Choir Cultist', hp: 9, ac: 12, speed: 6, xp: 25, cr: '1/8', type: 'humanoid', att: [{ n: 'Hooked Knife', hit: 3, dmg: '1d6+1', type: 'slashing' }], traits: ['dark_devotion'], art: { a: 'humanoid', c1: '#9db7a8', c2: '#1e3d4a', eye: '#7ff0d0', x: ['hood', 'robe'] } }),
    cult_fanatic: M({ name: 'Choir Cantor', hp: 24, ac: 13, speed: 6, xp: 200, cr: '1', type: 'humanoid', att: [{ n: 'Ritual Dagger', hit: 4, dmg: '1d4+2', type: 'piercing' }], multi: 2, special: [{ n: 'Drowning Hymn', kind: 'save', recharge: 4, save: 'wis', dc: 11, dice: '2d8', type: 'psychic', range: 12, cond: 'frightened', rounds: 1 }], traits: ['dark_devotion'], art: { a: 'humanoid', c1: '#9db7a8', c2: '#0f2a33', eye: '#7ff0d0', x: ['hood', 'robe', 'bell'] } }),
    skeleton: M({ name: 'Skeleton', hp: 13, ac: 13, speed: 6, xp: 50, cr: '1/4', type: 'undead', att: [{ n: 'Shortsword', hit: 4, dmg: '1d6+2', type: 'piercing' }, { n: 'Shortbow', hit: 4, dmg: '1d6+2', range: 16, type: 'piercing' }], traits: ['vuln_bludgeoning'], art: { a: 'skeleton', c1: '#ece3cf', c2: '#5a4a3a', eye: '#ff6b3d' } }),
    drowned_one: M({ name: 'Drowned One', hp: 22, ac: 8, speed: 4, xp: 50, cr: '1/4', type: 'undead', att: [{ n: 'Clammy Slam', hit: 3, dmg: '1d6+1', type: 'bludgeoning' }], traits: ['undead_fortitude'], art: { a: 'zombie', c1: '#7fa08a', c2: '#3f5f3a', eye: '#d8ffef', x: ['seaweed'] } }),
    zombie: M({ name: 'Zombie', hp: 22, ac: 8, speed: 4, xp: 50, cr: '1/4', type: 'undead', att: [{ n: 'Slam', hit: 3, dmg: '1d6+1', type: 'bludgeoning' }], traits: ['undead_fortitude'], art: { a: 'zombie', c1: '#9aa77a', c2: '#5a4a3a', eye: '#fff08a' } }),
    ghoul: M({ name: 'Ghoul', hp: 22, ac: 12, speed: 6, xp: 200, cr: '1', type: 'undead', att: [{ n: 'Claws', hit: 4, dmg: '2d4+2', type: 'slashing', save: { ab: 'con', dc: 10, cond: 'paralyzed', rounds: 1, notElf: true } }], art: { a: 'zombie', c1: '#8b8f9c', c2: '#3a2a4a', eye: '#ffd36b', x: ['claws', 'hunch'] } }),
    shadow: M({ name: 'Shadow', hp: 16, ac: 12, speed: 8, xp: 100, cr: '1/2', type: 'undead', att: [{ n: 'Strength Drain', hit: 4, dmg: '2d6+2', type: 'necrotic' }], traits: ['shadow_stealth', 'resist_weapons'], art: { a: 'ghost', c1: '#2b2b3a', c2: '#000', eye: '#d0d0ff' } }),
    wolf: M({ name: 'Wolf', hp: 11, ac: 13, speed: 8, xp: 50, cr: '1/4', type: 'beast', att: [{ n: 'Bite', hit: 4, dmg: '2d4+2', type: 'piercing', save: { ab: 'str', dc: 11, cond: 'prone', rounds: 1 } }], traits: ['pack_tactics'], art: { a: 'beast', c1: '#8a8a8f', c2: '#e8e0d0', eye: '#ffd36b', x: ['ears', 'tail', 'snout'] } }),
    dire_wolf: M({ name: 'Dire Wolf', hp: 37, ac: 14, speed: 10, xp: 200, cr: '1', type: 'beast', size: 2, att: [{ n: 'Bite', hit: 5, dmg: '2d6+3', type: 'piercing', save: { ab: 'str', dc: 13, cond: 'prone', rounds: 1 } }], traits: ['pack_tactics'], art: { a: 'beast', c1: '#4a4a52', c2: '#d0c8b8', eye: '#ff6b3d', x: ['ears', 'tail', 'snout', 'big'] } }),
    giant_spider: M({ name: 'Giant Spider', hp: 26, ac: 14, speed: 6, xp: 200, cr: '1', type: 'beast', size: 2, att: [{ n: 'Venom Bite', hit: 5, dmg: '1d8+3', type: 'piercing', extra: { dice: '2d8', type: 'poison', save: 'con', dc: 11 } }], special: [{ n: 'Web', kind: 'attack', recharge: 5, hit: 5, range: 6, cond: 'restrained', rounds: 2 }], art: { a: 'spider', c1: '#2b2236', c2: '#b5452c', eye: '#ff4040' } }),
    giant_crab: M({ name: 'Giant Crab', hp: 13, ac: 15, speed: 6, xp: 25, cr: '1/8', type: 'beast', att: [{ n: 'Pincer', hit: 3, dmg: '1d6+1', type: 'bludgeoning', save: { ab: 'str', dc: 11, cond: 'restrained', rounds: 1 } }], art: { a: 'crab', c1: '#d0603a', c2: '#f3e6cc', eye: '#2b1d12' } }),
    sahuagin: M({ name: 'Sahuagin Raider', hp: 22, ac: 12, speed: 6, xp: 100, cr: '1/2', type: 'humanoid', att: [{ n: 'Coral Spear', hit: 3, dmg: '1d6+1', type: 'piercing' }, { n: 'Claws', hit: 3, dmg: '1d4+1', type: 'slashing' }], multi: 2, traits: ['blood_frenzy'], art: { a: 'humanoid', c1: '#3f8a8a', c2: '#d9a62e', eye: '#fff08a', x: ['fins', 'teeth', 'tail'] } }),
    orc: M({ name: 'Orc', hp: 15, ac: 13, speed: 6, xp: 100, cr: '1/2', type: 'humanoid', att: [{ n: 'Greataxe', hit: 5, dmg: '1d12+3', type: 'slashing' }, { n: 'Javelin', hit: 5, dmg: '1d6+3', range: 6, type: 'piercing' }], traits: ['aggressive'], art: { a: 'humanoid', c1: '#7f9a5f', c2: '#5a3a1f', eye: '#ff4040', x: ['tusks', 'brow'] } }),
    hobgoblin: M({ name: 'Hobgoblin', hp: 11, ac: 18, speed: 6, xp: 100, cr: '1/2', type: 'humanoid', att: [{ n: 'Longsword', hit: 3, dmg: '1d8+1', type: 'slashing' }, { n: 'Longbow', hit: 3, dmg: '1d8+1', range: 30, type: 'piercing' }], traits: ['martial_advantage'], art: { a: 'humanoid', c1: '#c7632e', c2: '#3b3b46', eye: '#ffd36b', x: ['ears', 'helm'] } }),
    bugbear: M({ name: 'Bugbear', hp: 27, ac: 16, speed: 6, xp: 200, cr: '1', type: 'humanoid', size: 2, att: [{ n: 'Morningstar', hit: 4, dmg: '2d8+2', type: 'piercing' }], traits: ['surprise_attack'], art: { a: 'brute', c1: '#a0703a', c2: '#5a3a1f', eye: '#ffd36b', x: ['ears', 'fur'] } }),
    gnoll: M({ name: 'Gnoll', hp: 22, ac: 15, speed: 6, xp: 100, cr: '1/2', type: 'humanoid', att: [{ n: 'Spear', hit: 4, dmg: '1d6+2', type: 'piercing' }, { n: 'Longbow', hit: 3, dmg: '1d8+1', range: 30, type: 'piercing' }], traits: ['rampage'], art: { a: 'humanoid', c1: '#c9a65a', c2: '#6b4a2b', eye: '#ff6b3d', x: ['snout', 'ears', 'spots'] } }),
    ogre: M({ name: 'Ogre', hp: 59, ac: 11, speed: 8, xp: 450, cr: '2', type: 'giant', size: 2, att: [{ n: 'Greatclub', hit: 6, dmg: '2d8+4', type: 'bludgeoning' }, { n: 'Javelin', hit: 6, dmg: '2d6+4', range: 6, type: 'piercing' }], art: { a: 'brute', c1: '#b08f6a', c2: '#6b4a2b', eye: '#2b1d12', x: ['tusks', 'belly'] } }),
    owlbear: M({ name: 'Owlbear', hp: 59, ac: 13, speed: 8, xp: 700, cr: '3', type: 'monstrosity', size: 2, att: [{ n: 'Beak', hit: 7, dmg: '1d10+5', type: 'piercing' }, { n: 'Claws', hit: 7, dmg: '2d8+5', type: 'slashing' }], multi: 2, multiAll: true, art: { a: 'brute', c1: '#7a5a3a', c2: '#e8d0a0', eye: '#ffd36b', x: ['beak', 'feathers'] } }),
    harpy: M({ name: 'Harpy', hp: 38, ac: 11, speed: 8, xp: 200, cr: '1', type: 'monstrosity', att: [{ n: 'Claws', hit: 3, dmg: '2d4+1', type: 'slashing' }], multi: 2, special: [{ n: 'Luring Song', kind: 'save', recharge: 5, save: 'wis', dc: 11, range: 12, radius: 3, cond: 'charmed', rounds: 1 }], flying: true, art: { a: 'winged', c1: '#c98f62', c2: '#5a3a6b', eye: '#ff4040' } }),
    wisp: M({ name: "Will-o'-Wisp", hp: 18, ac: 19, speed: 10, xp: 450, cr: '2', type: 'undead', att: [{ n: 'Shock', hit: 4, dmg: '2d8', type: 'lightning' }], flying: true, traits: ['resist_weapons', 'flicker'], art: { a: 'wisp', c1: '#bff0ff', c2: '#6fb7ff', eye: '#ffffff' } }),
    grey_ooze: M({ name: 'Grey Ooze', hp: 22, ac: 8, speed: 2, xp: 100, cr: '1/2', type: 'ooze', att: [{ n: 'Pseudopod', hit: 3, dmg: '1d6+1', type: 'bludgeoning', extra: { dice: '2d6', type: 'acid' } }], art: { a: 'ooze', c1: '#8f9a9a', c2: '#5f6a6a', eye: '#d8ffef' } }),
    mimic: M({ name: 'Mimic', hp: 40, ac: 12, speed: 3, xp: 450, cr: '2', type: 'monstrosity', att: [{ n: 'Sticky Pseudopod', hit: 5, dmg: '1d8+3', type: 'bludgeoning', save: { ab: 'str', dc: 13, cond: 'restrained', rounds: 1 } }, { n: 'Bite', hit: 5, dmg: '1d8+3', type: 'piercing', extra: { dice: '1d8', type: 'acid' } }], multi: 2, multiAll: true, art: { a: 'mimic', c1: '#8a5a2b', c2: '#d9a62e', eye: '#ff4040' } }),
    green_wyrmling: M({ name: 'Green Wyrmling', hp: 38, ac: 17, speed: 8, xp: 450, cr: '2', type: 'dragon', att: [{ n: 'Bite', hit: 4, dmg: '1d10+2', type: 'piercing', extra: { dice: '1d6', type: 'poison' } }], special: [{ n: 'Poison Breath', kind: 'save', recharge: 5, save: 'con', dc: 11, dice: '6d6', type: 'poison', half: true, range: 3, radius: 2 }], flying: true, art: { a: 'winged', c1: '#4f8a3a', c2: '#d9e66a', eye: '#ffd36b', x: ['horns', 'tail', 'dragon'] } }),
    bell_warden: M({ name: 'The Bell-Warden', hp: 75, ac: 14, speed: 6, xp: 1100, cr: '4', type: 'undead', boss: true, size: 2, att: [{ n: 'Tide Claw', hit: 5, dmg: '1d8+3', type: 'slashing', extra: { dice: '1d6', type: 'cold' } }], multi: 2,
      special: [{ n: 'Drowning Toll', kind: 'save', recharge: 5, save: 'con', dc: 13, dice: '3d8', type: 'thunder', half: true, self: true, radius: 2, cond: 'prone', rounds: 1 }, { n: 'Call the Drowned', kind: 'summon', at: 0.5, summon: 'drowned_one', count: 2, once: true }],
      traits: ['undead_fortitude'], art: { a: 'priestess', c1: '#6f9a8f', c2: '#1e3d4a', eye: '#7ff0d0', x: ['bell', 'seaweed', 'crown'] } })
  };

  const ENCOUNTER_TABLES = {
    road: [['wolf', 'wolf'], ['bandit', 'bandit', 'bandit'], ['goblin', 'goblin', 'goblin'], ['wolf', 'wolf', 'wolf'], ['orc', 'goblin', 'goblin'], ['harpy'], ['gnoll', 'gnoll'], ['dire_wolf'], ['ogre'], ['owlbear']],
    forest: [['wolf', 'wolf'], ['giant_spider'], ['goblin', 'goblin', 'goblin'], ['wisp'], ['owlbear'], ['dire_wolf', 'wolf'], ['green_wyrmling'], ['gnoll', 'gnoll', 'hobgoblin']],
    cave: [['kobold', 'kobold', 'kobold', 'kobold'], ['giant_spider'], ['grey_ooze'], ['goblin', 'goblin', 'goblin_boss'], ['bugbear', 'goblin'], ['giant_rat', 'giant_rat', 'giant_rat'], ['ogre'], ['shadow', 'shadow']],
    dungeon: [['skeleton', 'skeleton'], ['zombie', 'zombie'], ['ghoul'], ['cultist', 'cultist', 'cultist'], ['shadow'], ['mimic'], ['hobgoblin', 'hobgoblin'], ['cult_fanatic', 'cultist', 'cultist'], ['skeleton', 'skeleton', 'skeleton', 'ghoul']],
    coast: [['giant_crab', 'giant_crab'], ['sahuagin', 'sahuagin'], ['smuggler', 'smuggler'], ['drowned_one', 'drowned_one'], ['harpy']]
  };
  const BOSSES = { road: ['ogre', 'owlbear'], forest: ['green_wyrmling', 'owlbear'], cave: ['goblin_boss', 'ogre', 'bugbear'], dungeon: ['cult_fanatic', 'ghoul', 'mimic'], coast: ['sahuagin', 'mara_vex'] };

  const XP_LEVELS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
  const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
  const FULL_SLOTS = [[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2]];
  const HALF_SLOTS = [[], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2]];

  function mod(score) { return Math.floor((score - 10) / 2); }
  function prof(level) { return 2 + Math.floor((Math.max(1, level) - 1) / 4); }
  function levelForXp(xp) { let l = 1; for (let i = 0; i < XP_LEVELS.length; i++) if (xp >= XP_LEVELS[i]) l = i + 1; return l; }
  function slotTable(cls, level) {
    const C = CLASSES[cls]; if (!C || !C.caster) return [];
    const i = Math.min(level, 10) - 1;
    if (C.caster === 'full') return FULL_SLOTS[i].slice();
    if (C.caster === 'half') { const t = HALF_SLOTS[i].slice(); if (C.earlySpells && level === 1) return [1]; return t.length ? t : (level === 1 ? [] : []); }
    if (C.caster === 'pact') { const n = level === 1 ? 1 : 2; const sl = level >= 5 ? 3 : level >= 3 ? 2 : 1; const t = []; t[sl - 1] = n; for (let k = 0; k < sl - 1; k++) t[k] = 0; return t; }
    return [];
  }
  function maxSpellLevel(cls, level) { const t = slotTable(cls, level); let m = 0; t.forEach((n, i) => { if (n) m = i + 1; }); if (CLASSES[cls]?.caster === 'pact') m = t.length; return m; }
  function classSpells(cls, level) {
    const max = maxSpellLevel(cls, level); const C = CLASSES[cls]; if (!C || (!C.caster)) return [];
    return Object.keys(SPELLS).filter(k => SPELLS[k].cls.includes(cls) && (SPELLS[k].lvl === 0 ? C.caster !== 'half' : SPELLS[k].lvl <= max));
  }
  function featuresAt(cls, level) { const out = []; const F = CLASSES[cls].features; Object.keys(F).forEach(l => { if (+l <= level) out.push(...F[l]); }); return [...new Set(out)]; }
  function parseDice(f) {
    const m = String(f || '').replace(/\s+/g, '').toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
    if (!m) { const n = parseInt(f, 10); return isNaN(n) ? null : { n: 0, s: 0, b: n }; }
    return { n: Math.min(parseInt(m[1] || '1', 10), 60), s: Math.min(parseInt(m[2], 10), 1000), b: parseInt(m[3] || '0', 10) };
  }
  function cantripDice(dice, level) { const p = parseDice(dice); const n = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1; return `${p.n * n}d${p.s}${p.b ? (p.b > 0 ? '+' : '') + p.b : ''}`; }

  function computeAC(ch) {
    const C = CLASSES[ch.class]; const s = ch.scores; const eq = ch.equip || {};
    let ac;
    const arm = eq.armor && ARMOR[ITEMS[eq.armor]?.armor || eq.armor];
    if (arm) { const d = mod(s.dex); ac = arm.base + (arm.dexMax == null ? d : Math.min(arm.dexMax, d)); if (ch.features && ch.features.includes('fighting_style')) ac += 1; }
    else { ac = 10 + mod(s.dex); if (C.unarmored && !(eq.shield && C.unarmored === 'wis')) ac += mod(s[C.unarmored]); }
    if (eq.shield) ac += 2;
    ['ring', 'cloak'].forEach(k => { if (eq[k] && ITEMS[eq[k]]) ac += ITEMS[eq[k]].ac || 0; });
    return ac;
  }

  // ---------------- the starter adventure ----------------
  const ADVENTURE = {
    key: 'drowned_bell', title: 'The Drowned Bell',
    premise: 'Every night at midnight, a bell tolls from beneath the waves off the fishing town of Saltmere — the bell of a lighthouse that sank a hundred years ago. And every night it rings, another fisherman walks into the sea and doesn\'t come back.',
    hook: 'Rain hammers the slate roofs of Saltmere as your boots hit the dock. Out past the breakwater, where the old lighthouse sank a hundred years ago, the sea is perfectly, unnaturally still. Then — *BONG*. A bell, deep under the water. Along the wharf, shutters slam. An old woman in a harbormaster\'s coat grabs your sleeve: "You\'re adventurers? Then the gods sent you. My boy Tobin walked into the sea three nights ago. Please — come to the harbor office."',
    start: 'saltmere',
    quests: [
      { id: 'main', title: 'The Tolling Bell', giver: 'Old Marta', main: true, desc: 'Find out why the drowned bell rings — and what happened to Tobin and the missing fishermen.',
        objectives: [{ k: 'talk:marta', t: 'Speak with Old Marta at the harbor office' }, { k: 'enter:cliff_road', t: 'Take the cliff road out of town' }, { k: 'enter:cove', t: 'Find the smugglers\' hideout' }, { k: 'free:tobin', t: 'Rescue Tobin' }, { k: 'item:tide_chant', t: 'Find a way across the drowned causeway' }, { k: 'enter:lighthouse', t: 'Enter the Drowned Lighthouse' }, { k: 'kill:bell_warden', t: 'Silence the Bell-Warden' }],
        reward: { gold: 150, xp: 600, item: 'w_p1_mace' } },
      { id: 'rats', title: 'Rats in the Cellar', giver: 'Wren Tallowmere', desc: 'Something big has been gnawing through the ale barrels under the Gull & Anchor.', objectives: [{ k: 'enter:cellar', t: 'Go down into the cellar' }, { k: 'kill:rat_king', t: 'Defeat whatever leads the rats' }, { k: 'talk:wren', t: 'Tell Wren it\'s done' }], reward: { gold: 25, xp: 150, item: 'potion_healing' } },
      { id: 'seaglass', title: 'Moonlit Seaglass', giver: 'Sister Ilsa', desc: 'Sister Ilsa needs a shard of moonlit seaglass from the cove to bless the town\'s protective wards.', objectives: [{ k: 'item:seaglass', t: 'Find moonlit seaglass in the cove' }, { k: 'talk:ilsa', t: 'Bring it to Sister Ilsa' }], reward: { gold: 0, xp: 150, item: 'potion_greater' } },
      { id: 'kip', title: 'What Kip Saw', giver: 'Kip', desc: 'The street kid Kip swears he saw something the night Tobin vanished — but he wants payment first.', objectives: [{ k: 'talk:kip', t: 'Get Kip to talk (5 gold or a good Persuasion)' }, { k: 'item:choir_letter', t: 'Find proof of who\'s behind it' }], reward: { gold: 10, xp: 100 } }
    ],
    npcs: {
      marta: { name: 'Old Marta', role: 'Harbormaster', look: { skin: '#e0b48a', hair: '#e8e0d0', cloak: '#2f5b9a', hairStyle: 3 }, desc: 'Weathered, sharp-tongued, terrified for her son.', secret: 'Her grandfather was the lighthouse keeper who rang the bell to lure ships onto the rocks for salvage. She has never told anyone.',
        topics: { 'The bell': 'It started a fortnight ago. Midnight, every night. Six men gone into the water, smiling like they were going home.', 'Tobin': 'My boy. Three nights ago he got up from supper, walked down the pier, and kept walking. I found his boots on the rocks by the cliff road.', 'The lighthouse': 'Sank in a storm a hundred years back. At low tide you can see the top of it past the breakwater. There was a causeway once — it\'s underwater now.' }, quest: 'main', gives: { gold: 20 } },
      wren: { name: 'Wren Tallowmere', role: 'Innkeeper, the Gull & Anchor', look: { skin: '#c68e5e', hair: '#b5452c', cloak: '#8a4fa3', hairStyle: 1 }, desc: 'Cheerful, loud, knows every rumor in town.', secret: 'She\'s been buying smuggled rum from the cove and suspects the smugglers know more than they let on.',
        topics: { 'Rumors': 'The smugglers out at the cove have gone quiet. No rum for two weeks. And Kip — the street kid — has been jumpy as a cat.', 'A room': 'A bed and hot stew, 5 gold a night. You\'ll sleep like the dead. Er. Bad choice of words.', 'The cellar': 'Rats! Big ones. One of them wears a little crown, I swear it on my mother.' }, quest: 'rats', inn: true },
      ilsa: { name: 'Sister Ilsa', role: 'Priestess of the Tidemother', look: { skin: '#f6d3b3', hair: '#1d140e', cloak: '#e8e0d0', hairStyle: 1 }, desc: 'Calm, kind, sees more than she says.', secret: 'She has dreamed of a drowned woman in a bell-crown singing beneath the sea.',
        topics: { 'The Tidemother': 'She keeps sailors safe — when she\'s listened to. Lately the sea feels... occupied. Something else is singing down there.', 'Healing': 'I sell what potions I can. The Tidemother\'s blessing is free, if you need it.', 'Dreams': 'Every night I dream of a woman wearing a bell as a crown. She sings, and the drowned dance.' }, quest: 'seaglass', shop: SHOP_TEMPLE, heals: true },
      brann: { name: 'Brann Ironpot', role: 'Blacksmith', look: { skin: '#8d5a3a', hair: '#1d140e', cloak: '#5b6f86', hairStyle: 0 }, desc: 'Huge, gentle, covered in soot.', secret: 'The smugglers had him forge a bell-shaped key a month ago. He didn\'t ask why. He feels sick about it.',
        topics: { 'Weapons': 'Good steel, fair prices. Have a look.', 'Strange work': 'Funny you ask... a month back some cove folk had me forge a key. Shaped like a bell clapper. Paid in pearls. Pearls!' }, shop: SHOP_SMITH },
      kip: { name: 'Kip', role: 'Street kid', look: { skin: '#e0b48a', hair: '#8a5a2b', cloak: '#c7782e', hairStyle: 2 }, desc: 'Ten years old, fast, freckled, hungry.', secret: 'He saw hooded figures with glowing green eyes leading Tobin to the cove — and the smuggler queen Mara Vex paying them.',
        topics: { 'What did you see?': 'Maybe I saw somethin\'. Maybe I didn\'t. Five gold says I did.' }, quest: 'kip', wants: { gold: 5, dc: 13, skill: 'persuasion' },
        reveal: 'Okay, okay! The night Tobin went, there were people in hoods — eyes glowin\' green like seaweed lamps — walkin\' him along the cliff road toward the cove. And Mara Vex, the smuggler queen, was there. She PAID them. Pearls. I saw it.' },
      holt: { name: 'Sergeant Holt', role: 'Town guard', look: { skin: '#c68e5e', hair: '#4a2c17', cloak: '#5b6f86', beard: 5 }, desc: 'Big, tired, honest. Hasn\'t slept since the bell started.', secret: 'He\'s been ordered by the mayor to keep quiet about the smugglers — the mayor buys their rum.',
        topics: { 'The missing men': 'Six gone. I\'ve walked the cliffs every night. Nothing but boot prints going INTO the water.', 'Trouble in town': 'Keep your blades sheathed in town and we\'ll get along fine.', 'The smugglers': 'Officially, there are no smugglers in Saltmere. ...Unofficially, check the sea caves south on the cliff road.' } },
      pell: { name: 'Guard Pell', role: 'Town guard', look: { skin: '#f6d3b3', hair: '#d9a62e', cloak: '#5b6f86', hairStyle: 6 }, desc: 'Young, jumpy, very proud of her spear.', topics: { 'How\'s the watch?': 'Quiet! Too quiet. I\'ve polished this spear eleven times tonight.', 'The bell': 'When it rings, the gulls all fly AWAY from the sea. Every single one.' } },
      tobin: { name: 'Tobin', role: 'Missing fisherman', look: { skin: '#e0b48a', hair: '#4a2c17', cloak: '#3f6b4a', hairStyle: 0 }, desc: 'Marta\'s son, half-drowned and chained.',
        topics: { 'What happened?': 'I heard singing... beautiful singing. Next I knew I was in chains. The Choir — the hooded ones — they take us to the lighthouse at low tide. They say the Warden needs voices for her choir.', 'The causeway': 'Mara has a scroll — the Tide-Chant. Sing it at the causeway and the sea pulls back. It\'s in her chest.' } }
    },
    scenes: {
      saltmere: { name: 'Saltmere', kind: 'town', theme: 'town', desc: 'A rain-soaked fishing town of crooked houses, nets and gulls, huddled against the cliffs.',
        npcs: ['marta', 'wren', 'ilsa', 'brann', 'kip', 'holt', 'pell'], exits: [{ to: 'cliff_road', label: 'Cliff Road' }, { to: 'cellar', label: 'Gull & Anchor cellar', quest: 'rats' }], pois: [{ type: 'shrine', name: 'Tidemother Shrine' }, { type: 'clue', name: 'Notice Board', text: 'MISSING: Tobin Saltwell, Hal Grey, Brother Pell, the Dunmore twins, Old Fisk. All last seen near the water at midnight. — Harbor Office' }] },
      cellar: { name: 'Gull & Anchor Cellar', kind: 'dungeon', theme: 'cellar', dark: true, desc: 'Damp stone, smashed barrels, and a smell that could peel paint. Red eyes glitter between the casks.',
        encounters: [{ m: ['giant_rat', 'giant_rat'], where: 'mid' }, { m: ['rat_king', 'giant_rat'], where: 'far', boss: true }], pois: [{ type: 'chest', loot: { gold: '3d6', items: ['rat_crown'] }, where: 'far' }, { type: 'trap', name: 'Rotten floorboards', dc: 12, save: 'dex', dmg: '1d6', where: 'mid' }], exits: [{ to: 'saltmere', label: 'Back up to the inn' }] },
      cliff_road: { name: 'The Cliff Road', kind: 'wild', theme: 'coastroad', desc: 'A muddy track winding along black cliffs above a hungry grey sea.',
        encounters: [{ m: ['wolf', 'wolf'], where: 'mid' }], pois: [{ type: 'clue', name: 'Tobin\'s boots', text: 'A pair of fisherman\'s boots, neatly placed side by side on the rocks — and drag marks heading south, toward the sea caves.', where: 'mid' }, { type: 'chest', name: 'Overturned cart', loot: { gold: '2d10', items: ['potion_healing', 'rope'] }, where: 'mid' }],
        exits: [{ to: 'saltmere', label: 'Back to Saltmere', where: 'near' }, { to: 'cove', label: 'Sea caves', where: 'far' }, { to: 'causeway', label: 'The drowned causeway', where: 'far', needs: 'tide_chant', locked: 'The causeway is under ten feet of black water. You\'d need some way to part the tide.' }] },
      cove: { name: "Smuggler's Cove", kind: 'dungeon', theme: 'seacave', dark: true, desc: 'A dripping sea cave lit by lanterns, stacked with crates and the bones of old boats.',
        encounters: [{ m: ['giant_crab', 'giant_crab'], where: 'near' }, { m: ['smuggler', 'smuggler', 'bandit'], where: 'mid' }, { m: ['mara_vex', 'smuggler'], where: 'far', boss: true }],
        prisoner: { npc: 'tobin', where: 'far' },
        pois: [{ type: 'chest', name: 'Mara\'s sea chest', locked: 13, loot: { gold: '4d10', items: ['tide_chant', 'choir_letter', 'w_p1_dagger'] }, where: 'far' }, { type: 'clue', name: 'Glowing pool', text: 'A tide pool glows with moonlight that isn\'t there. At its bottom lies a shard of seaglass.', item: 'seaglass', check: { skill: 'perception', dc: 11 }, where: 'mid' }, { type: 'trap', name: 'Tripwire bell', dc: 13, save: 'dex', dmg: '1d4', alarm: true, where: 'near' }, { type: 'chest', loot: { gold: '2d6', items: ['alch_fire'] }, where: 'mid' }],
        exits: [{ to: 'cliff_road', label: 'Back to the cliff road', where: 'near' }] },
      causeway: { name: 'The Parted Causeway', kind: 'wild', theme: 'causeway', desc: 'As the Tide-Chant ends, the sea groans and draws back, revealing a slick stone causeway — and things that were waiting under the water.',
        encounters: [{ m: ['drowned_one', 'drowned_one', 'sahuagin'], where: 'mid' }], pois: [{ type: 'shrine', name: 'Barnacled statue of the Tidemother' }, { type: 'chest', name: 'Shipwreck strongbox', loot: { gold: '3d10', items: ['potion_healing', 'holy_water', 'holy_water'] }, where: 'mid' }],
        exits: [{ to: 'cliff_road', label: 'Back to shore', where: 'near' }, { to: 'lighthouse', label: 'The Drowned Lighthouse', where: 'far' }] },
      lighthouse: { name: 'The Drowned Lighthouse', kind: 'dungeon', theme: 'lighthouse', dark: true, desc: 'Water drips from every stone. Green lamps burn without heat. Somewhere above, a choir of the drowned is humming.',
        encounters: [{ m: ['cultist', 'cultist', 'drowned_one'], where: 'near' }, { m: ['skeleton', 'skeleton', 'cult_fanatic'], where: 'mid' }, { m: ['mimic'], where: 'mid', disguise: 'chest' }, { m: ['bell_warden', 'drowned_one'], where: 'boss', boss: true }],
        gate: { needs: 'bell_key', text: 'A rusted iron gate shaped like a ribcage. In its lock, a keyhole shaped like a bell clapper.' },
        pois: [{ type: 'chest', name: 'Keeper\'s lockbox', loot: { gold: '3d10', items: ['bell_key', 'potion_healing'] }, where: 'mid' }, { type: 'trap', name: 'Flooding pressure plate', dc: 13, save: 'dex', dmg: '2d6', where: 'mid' }, { type: 'trap', name: 'Choir glyph', dc: 12, save: 'wis', dmg: '2d6', where: 'near' },
          { type: 'clue', name: 'Keeper\'s logbook', text: 'Final entry, a hundred years old: "Marta\'s grandmother was right. Ringing the bell to wreck ships for salvage was a sin. The sea has heard. Something is coming up from below." The name of the keeper: Edrin Saltwell.', check: { skill: 'investigation', dc: 10 }, where: 'mid' },
          { type: 'chest', name: 'Bell-Warden\'s hoard', loot: { gold: '10d10', items: ['ring_prot', 'potion_greater', 'scroll_fireball'] }, where: 'boss' }],
        exits: [{ to: 'causeway', label: 'Back down to the causeway', where: 'near' }] }
    },
    ending: 'With a final shuddering toll, the great bell cracks in two. The green lamps gutter out. Somewhere far below, the singing stops — and in Saltmere, six fishermen sit bolt upright in their beds, soaked to the bone, alive. Old Marta weeps on the dock when Tobin walks home. The town will tell this story for a hundred years.'
  };

  const api = { ABILITIES, ABILITY_NAMES, SKILLS, RACES, CLASSES, FEATURES, SPELLS, CONDITIONS, ITEMS, WEAPONS, ARMOR, BESTIARY, ENCOUNTER_TABLES, BOSSES, XP_LEVELS, STANDARD_ARRAY,
    SHOP_GENERAL, SHOP_SMITH, SHOP_TEMPLE, ADVENTURE, mod, prof, levelForXp, slotTable, maxSpellLevel, classSpells, featuresAt, parseDice, cantripDice, computeAC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RULES = api;
})(typeof window !== 'undefined' ? window : globalThis);
