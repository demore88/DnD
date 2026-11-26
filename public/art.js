// Roll Call paper-cut art library v2: rigged figures with arms & hands that hold their actual weapons.
// Everything is drawn in a 100x100 box. Heroes, NPC roles, monsters, weapons, shields and props.
(function (root) {
  // Global style knobs (tuned by Matthew's A/B/C/D picks)
  const STYLE = { hand: 'simple', head: 1, outline: 'shadow', wscale: 1.18 };

  const shade = (hex, amt) => { const n = parseInt(String(hex).slice(1), 16); let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt; r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b)); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); };
  function hstr(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function wrap(inner, size, opts = {}) {
    const id = 'p' + hstr(inner + STYLE.outline + (opts.flip ? 'f' : ''));
    const flip = opts.flip ? ' transform="translate(100,0) scale(-1,1)"' : '';
    let f;
    if (STYLE.outline === 'ink') f = `<feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="d"/><feFlood flood-color="#2b1d12"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>`;
    else if (STYLE.outline === 'sticker') f = `<feMorphology in="SourceAlpha" operator="dilate" radius="2.2" result="d"/><feFlood flood-color="#fff8ea"/><feComposite in2="d" operator="in" result="o"/><feDropShadow in="o" dx="1.6" dy="2.2" stdDeviation="0.3" flood-color="#2b1d12" flood-opacity=".5" result="os"/><feMerge><feMergeNode in="os"/><feMergeNode in="SourceGraphic"/></feMerge>`;
    else if (STYLE.outline === 'both') f = `<feMorphology in="SourceAlpha" operator="dilate" radius="1.1" result="d"/><feFlood flood-color="#2b1d12"/><feComposite in2="d" operator="in" result="o"/><feDropShadow in="o" dx="1.6" dy="2.2" stdDeviation="0.3" flood-color="#2b1d12" flood-opacity=".45" result="os"/><feMerge><feMergeNode in="os"/><feMergeNode in="SourceGraphic"/></feMerge>`;
    else f = `<feDropShadow dx="1.6" dy="2.2" stdDeviation="0.3" flood-color="#2b1d12" flood-opacity=".45"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size || 100}" height="${size || 100}"><defs><filter id="${id}" x="-15%" y="-15%" width="135%" height="135%">${f}</filter></defs><g filter="url(#${id})" stroke-linejoin="round" stroke-linecap="round"${flip}>${inner}</g></svg>`;
  }
  function blob(cx, cy, r, n, j, seed) { let d = ''; seed = seed || 1; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const rr = r + Math.sin(i * 7.3 + seed * 3.1) * j; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); } return d + 'Z'; }
  const P = (d, fill, extra = '') => /fill=/.test(extra) ? `<path d="${d}" ${extra}/>` : `<path d="${d}" fill="${fill}" ${extra}/>`;
  const C = (x, y, r, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
  const E = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
  const RC = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
  const L = (d, col, w) => P(d, 'none', `fill="none" stroke="${col}" stroke-width="${w}"`);
  const G = (t, inner) => `<g transform="${t}">${inner}</g>`;

  // ======================= WEAPON & GEAR LIBRARY =======================
  // Local coords: grip at (0,0); business end points UP (-y). g2 = local y of the second hand for two-handed holds.
  const MET = '#dfe3e8', MET2 = '#9aa3ad', MET3 = '#6b737c', WOOD = '#8a5a2b', WOOD2 = '#5a3a1f', GOLD = '#d9a62e', LEA = '#6b4a2b';
  const glow = (d, plus) => plus ? P(d, 'none', `fill="none" stroke="#9fe0ff" stroke-width="4" opacity=".55"`) : '';
  const hilt = (gw, gripLen, pommel = GOLD, guard = WOOD2) => RC(-gw / 2, -4, gw, 3.6, guard, 'rx="1.2"') + RC(-1.9, -1, 3.8, gripLen, LEA, 'rx="1.2"') + C(0, gripLen + 1.2, 2.6, pommel);
  function blade(len, w, plus, tip = 6) { const d = `M${-w / 2} -4 L${-w / 2} ${-len + tip} L0 ${-len} L${w / 2} ${-len + tip} L${w / 2} -4Z`; return glow(d, plus) + P(d, MET) + L(`M0 -6 L0 ${-len + tip}`, MET2, 1.1); }
  const W = {
    longsword: { hold: 'one', draw: (p) => blade(40, 5.4, p) + hilt(17, 8) },
    shortsword: { hold: 'one', light: 1, draw: (p) => blade(29, 5, p) + hilt(14, 7) },
    greatsword: { hold: 'two', g2: 11, draw: (p) => blade(52, 7, p, 8) + RC(-11, -5, 22, 4.4, WOOD2, 'rx="1.5"') + RC(-2.1, -1, 4.2, 16, LEA, 'rx="1.2"') + C(0, 16.4, 3, GOLD) },
    dagger: { hold: 'one', light: 1, draw: (p) => blade(17, 4.4, p, 5) + hilt(10, 6, MET2) },
    rapier: { hold: 'one', draw: (p) => glow('M0 -4 L0 -46', p) + L('M0 -4 L0 -46', MET, 2.4) + P('M-7 -2 Q-8 -9 0 -8 Q8 -9 7 -2 Q0 4 -7 -2Z', GOLD) + RC(-1.6, -1, 3.2, 8, LEA) + C(0, 8, 2.4, GOLD) },
    scimitar: { hold: 'one', light: 1, draw: (p) => { const d = 'M-2.4 -4 Q-3 -20 4 -34 Q7 -24 2.6 -4Z'; return glow(d, p) + P(d, MET) + hilt(12, 7); } },
    cutlass: { hold: 'one', draw: (p) => { const d = 'M-2.6 -4 Q-3.6 -22 3 -36 Q8 -26 2.8 -4Z'; return glow(d, p) + P(d, MET) + P('M-6 -3 Q-7 6 0 8 L0 5 Q-4 4 -3 -3Z', GOLD) + RC(-1.8, -1, 3.6, 8, LEA) + C(0, 8, 2.2, GOLD); } },
    sickle: { hold: 'one', light: 1, draw: (p) => P('M-1.6 0 L-1.6 -14 Q-2 -28 12 -26 Q4 -22 2 -14 L1.6 0Z', MET) + RC(-1.8, -1, 3.6, 9, WOOD) },
    handaxe: { hold: 'one', light: 1, draw: (p) => RC(-1.8, -26, 3.6, 34, WOOD, 'rx="1.5"') + glow('M1 -26 Q12 -30 11 -18 Q6 -16 1 -18Z', p) + P('M1 -26 Q12 -30 11 -18 Q6 -16 1 -18Z', MET) },
    battleaxe: { hold: 'one', draw: (p) => RC(-2, -36, 4, 44, WOOD, 'rx="1.5"') + glow('M1 -38 Q17 -44 16 -24 Q8 -22 1 -25Z', p) + P('M1 -38 Q17 -44 16 -24 Q8 -22 1 -25Z', MET) + P('M-1 -36 Q-9 -36 -8 -29 L-1 -29Z', MET2) },
    greataxe: { hold: 'two', g2: 12, draw: (p) => RC(-2.2, -46, 4.4, 64, WOOD, 'rx="1.6"') + glow('M1 -48 Q22 -56 20 -28 Q10 -27 1 -32Z', p) + P('M1 -48 Q22 -56 20 -28 Q10 -27 1 -32Z', MET) + P('M-1 -48 Q-20 -56 -18 -30 Q-9 -29 -1 -33Z', MET2) + C(0, -49, 2.4, MET3) },
    club: { hold: 'one', draw: () => P('M-2 8 L-4.5 -24 Q0 -32 4.5 -24 L2 8Z', WOOD) + C(-2, -16, 1.2, WOOD2) },
    greatclub: { hold: 'two', g2: 12, draw: () => P('M-2.4 18 L-7 -32 Q0 -44 7 -32 L2.4 18Z', WOOD) + C(-3, -24, 1.8, WOOD2) + C(3, -30, 1.4, WOOD2) + P('M-7 -28 l-4 -2 l3 4Z M7 -20 l4 -1 l-3 4Z', '#cfc6b0') },
    mace: { hold: 'one', draw: (p) => RC(-1.8, -24, 3.6, 32, WOOD2, 'rx="1.4"') + glow('M-7 -30 L0 -36 L7 -30 L7 -22 L0 -18 L-7 -22Z', p) + P('M-7 -30 L0 -36 L7 -30 L7 -22 L0 -18 L-7 -22Z', MET2) + L('M0 -35 L0 -19 M-7 -26 L7 -26', MET3, 1.2) },
    morningstar: { hold: 'one', draw: (p) => RC(-1.8, -26, 3.6, 34, WOOD2, 'rx="1.4"') + P('M0 -40 L3 -36 L8 -37 L6 -32 L10 -29 L6 -26 L8 -21 L3 -22 L0 -18 L-3 -22 L-8 -21 L-6 -26 L-10 -29 L-6 -32 L-8 -37 L-3 -36Z', MET2) + C(0, -29, 5.5, MET3) },
    warhammer: { hold: 'one', draw: (p) => RC(-1.8, -30, 3.6, 38, WOOD, 'rx="1.4"') + glow('M-9 -36 L6 -36 L6 -26 L-9 -26Z', p) + RC(-9, -36, 15, 10, MET2, 'rx="1.5"') + P('M6 -34 L13 -31 L6 -28Z', MET3) },
    spear: { hold: 'pole', g2: -18, draw: (p) => RC(-1.6, -44, 3.2, 66, WOOD, 'rx="1.4"') + glow('M0 -60 L5 -46 L0 -42 L-5 -46Z', p) + P('M0 -60 L5 -46 L0 -42 L-5 -46Z', MET) + RC(-2.2, -43, 4.4, 3, LEA) },
    javelin: { hold: 'one', draw: (p) => RC(-1.3, -34, 2.6, 46, WOOD, 'rx="1.2"') + P('M0 -44 L3.4 -35 L-3.4 -35Z', MET) },
    trident: { hold: 'pole', g2: -18, draw: (p) => RC(-1.6, -44, 3.2, 66, '#3f6b6b', 'rx="1.4"') + P('M-9 -46 L-9 -58 L-7 -52 L-5 -46 L-2 -46 L0 -62 L2 -46 L5 -46 L7 -52 L9 -58 L9 -46 Q0 -42 -9 -46Z', '#e8a08a') },
    pitchfork: { hold: 'pole', g2: -18, draw: () => RC(-1.6, -44, 3.2, 66, WOOD, 'rx="1.4"') + L('M-6 -58 L-6 -46 Q0 -42 6 -46 L6 -58 M0 -60 L0 -44', MET2, 2) },
    quarterstaff: { hold: 'pole', g2: -18, draw: () => RC(-2, -46, 4, 72, WOOD, 'rx="2"') + RC(-2.4, -40, 4.8, 3, LEA) + RC(-2.4, 14, 4.8, 3, LEA) },
    staff: { hold: 'pole', g2: -18, draw: (p) => RC(-2, -40, 4, 66, WOOD2, 'rx="2"') + P('M-2 -40 Q-10 -46 -4 -54 Q4 -58 6 -50 Q6 -44 2 -42Z', WOOD2) + C(0, -48, 4.6, '#6fb7ff') + C(-1.4, -49.5, 1.4, '#fff') + C(0, -48, 8, '#6fb7ff', 'opacity=".25"') },
    bellstaff: { hold: 'pole', g2: -18, draw: () => RC(-2, -40, 4, 66, '#3f5f5a', 'rx="2"') + P('M-8 -40 Q-8 -54 0 -54 Q8 -54 8 -40 L10 -36 L-10 -36Z', '#b08a3a') + C(0, -34, 2.4, '#7a5a1a') + L('M-3 -56 Q0 -62 3 -56', '#3f5f3a', 2) },
    shortbow: { hold: 'bow', draw: () => P('M-2 -30 Q-18 0 -2 30', 'none', `fill="none" stroke="${WOOD}" stroke-width="3.6"`) + L('M-2 -30 L-2 30', '#f3e6cc', 0.9) + RC(-5, -3, 5, 6, LEA, 'rx="1"') },
    longbow: { hold: 'bow', draw: () => P('M-2 -38 Q-20 0 -2 38', 'none', `fill="none" stroke="${WOOD2}" stroke-width="3.8"`) + L('M-2 -38 L-2 38', '#f3e6cc', 0.9) + RC(-5.5, -3, 5.5, 6, LEA, 'rx="1"') },
    light_crossbow: { hold: 'xbow', g2: -14, draw: () => RC(-2.6, -26, 5.2, 34, WOOD, 'rx="1.6"') + P('M-16 -20 Q0 -28 16 -20', 'none', `fill="none" stroke="${MET2}" stroke-width="3"`) + L('M-16 -20 L0 -16 L16 -20', '#f3e6cc', .9) + L('M0 -16 L0 -30', MET3, 1.6) },
    sling: { hold: 'one', draw: () => L('M0 0 Q-3 10 -8 16 M0 0 Q3 10 -4 18', '#8a6a3f', 1.5) + E(-6, 17, 3.6, 2.6, LEA) },
    unarmed: { hold: 'fist', draw: () => '' },
    claws: { hold: 'fist', draw: () => '' },
    // off-hand gear
    shield_round: { hold: 'shield', draw: (p, c) => C(0, 0, 13, c || WOOD) + C(0, 0, 13, 'none', `fill="none" stroke="${MET3}" stroke-width="2.2"`) + C(0, 0, 4, MET2) + L('M-10 -6 L10 -6 M-10 6 L10 6', shade(c || WOOD, -25), 1.2) },
    shield_heater: { hold: 'shield', draw: (p, c, em) => P('M-12 -14 L12 -14 L12 0 Q12 12 0 18 Q-12 12 -12 0Z', c || MET2) + P('M-12 -14 L12 -14 L12 0 Q12 12 0 18 Q-12 12 -12 0Z', 'none', `fill="none" stroke="${MET3}" stroke-width="2"`) + (em || P('M-2 -8 h4 v6 h6 v4 h-6 v8 h-4 v-8 h-6 v-4 h6Z', GOLD)) },
    shield_kite: { hold: 'shield', draw: (p, c) => P('M0 -18 Q12 -14 12 -4 Q10 10 0 22 Q-10 10 -12 -4 Q-12 -14 0 -18Z', c || '#8a2f1c') + L('M0 -16 L0 20 M-10 -4 L10 -4', GOLD, 1.6) },
    shield_sun: { hold: 'shield', draw: (p, c) => C(0, 0, 13, '#f3e6cc') + C(0, 0, 13, 'none', `fill="none" stroke="${GOLD}" stroke-width="2.4"`) + C(0, 0, 5, GOLD) + L('M0 -11 L0 -7 M0 7 L0 11 M-11 0 L-7 0 M7 0 L11 0 M-8 -8 L-5 -5 M5 5 L8 8 M-8 8 L-5 5 M5 -5 L8 -8', GOLD, 1.8) },
    shield_bark: { hold: 'shield', draw: () => P(blob(0, 0, 12.5, 12, 1.2, 4), '#7a5a3a') + L('M-6 -9 Q-3 0 -6 9 M3 -10 Q6 0 3 10', '#5a3a1f', 1.4) + P('M-2 -2 Q2 -8 6 -3 Q2 1 -2 -2Z', '#4f8a3a') },
    holy: { hold: 'item', draw: () => L('M0 -2 L0 -10', GOLD, 1) + C(0, -14, 5.4, GOLD) + C(0, -14, 2.4, '#fff8ea') },
    orb: { hold: 'item', draw: (p, c) => C(0, -9, 7, c || '#9b6bd1', 'opacity=".35"') + C(0, -9, 4.6, c || '#9b6bd1') + C(-1.5, -10.5, 1.4, '#fff') },
    flame: { hold: 'item', draw: () => P('M0 -22 Q8 -12 5 -6 Q3 -2 0 -2 Q-3 -2 -5 -6 Q-8 -12 0 -22Z', '#ff8a3d') + P('M0 -15 Q4 -9 2.5 -6 Q0 -4 -2.5 -6 Q-4 -9 0 -15Z', '#ffd36b') },
    torch: { hold: 'item', draw: () => RC(-1.8, -14, 3.6, 22, WOOD2, 'rx="1.2"') + P('M0 -30 Q8 -20 5 -15 Q3 -12 0 -12 Q-3 -12 -5 -15 Q-8 -20 0 -30Z', '#ff8a3d') + P('M0 -23 Q4 -17 2 -15 Q0 -13 -2 -15 Q-4 -17 0 -23Z', '#ffd36b') },
    lantern: { hold: 'item', draw: () => L('M-4 -2 Q0 -8 4 -2', MET3, 1.4) + RC(-5, 0, 10, 13, '#3a3a3a', 'rx="2"') + RC(-3.5, 2, 7, 9, '#ffd36b', 'rx="1"') + C(0, 6.5, 8, '#ffd36b', 'opacity=".25"') },
    tankard: { hold: 'item', draw: () => RC(-6, -10, 12, 14, '#a8865a', 'rx="1.5"') + RC(-6, -12, 12, 4, '#fff8ea', 'rx="2"') + L('M6 -7 Q11 -4 6 1', '#a8865a', 2.2) + L('M-6 -5 L6 -5 M-6 1 L6 1', '#6b4a2b', 1) },
    book: { hold: 'item', draw: () => RC(-7, -14, 14, 16, '#6b2f2f', 'rx="1.5"') + RC(-6, -13, 2, 14, GOLD) + C(2, -6, 2.4, GOLD) },
    wand: { hold: 'one', draw: () => L('M0 6 L0 -18', '#3a2a1c', 2.4) + C(0, -19, 2.4, '#ffd36b') + C(0, -19, 5, '#ffd36b', 'opacity=".3"') },
    purse: { hold: 'item', draw: () => P('M-6 -2 Q-8 8 0 9 Q8 8 6 -2 Q0 -5 -6 -2Z', '#8a6a3f') + L('M-4 -3 Q0 -7 4 -3', '#5a3a1f', 1.4) + C(0, 3, 1.6, GOLD) },
    tongs: { hold: 'one', draw: () => L('M-1 6 L-2 -20 M1 6 L2 -20', MET3, 2) + RC(-4, -24, 8, 5, '#ff8a3d', 'rx="1"') },
    rag: { hold: 'item', draw: () => P('M-5 -2 Q-8 8 -3 12 Q0 6 3 12 Q8 8 5 -2Z', '#f3e6cc') },
    lute: { hold: 'item', draw: () => '' },
    chains: { hold: 'item', draw: () => '' }
  };
  // map attack/weapon names to art keys
  const ALIAS = { 'hooked knife': 'sickle', 'ritual dagger': 'dagger', 'coral spear': 'trident', 'throwing knife': 'dagger', 'greatclub': 'greatclub', 'light crossbow': 'light_crossbow', 'unarmed strike': 'unarmed' };
  const weaponKey = (k) => { if (!k) return null; const l = String(k).toLowerCase(); if (W[l]) return l; if (ALIAS[l]) return ALIAS[l]; const m = Object.keys(W).find(x => l.includes(x.replace('_', ' '))); return m || null; };

  // ======================= HANDS =======================
  function hand(x, y, skin, style, opts = {}) {
    const st = opts.kind || style || STYLE.hand; const r = (opts.r || 5.2); const sk = skin || '#e0b48a';
    if (st === 'claw') return C(x, y, r, sk) + P(`M${x - 4} ${y - 3} l-3 -5 l4 2Z M${x} ${y - 5} l0 -6 l3 5Z M${x + 4} ${y - 3} l4 -4 l-1 5Z`, '#fff8ea');
    if (st === 'bone') return C(x, y, r * .8, sk) + C(x - 3, y - 3, 1.6, sk) + C(x, y - 4, 1.6, sk) + C(x + 3, y - 3, 1.6, sk);
    if (st === 'glove') return C(x, y, r, '#5a3a1f') + C(x - 1.5, y - 1.6, r * .45, '#7a5232') + RC(x - r, y + r * .5, r * 2, 3, '#3a2414', 'rx="1"');
    if (st === 'fingers') return C(x, y, r, sk) + C(x - 3.4, y - 3.6, 2.1, shade(sk, -10)) + C(x - .6, y - 4.4, 2.1, shade(sk, -10)) + C(x + 2.3, y - 3.8, 2.1, shade(sk, -10)) + E(x + (opts.thumb || 1) * 4.2, y + 1, 2.2, 1.6, sk);
    if (st === 'simple') return C(x, y, r, sk);
    // mitten (default)
    return C(x, y, r, sk) + P(`M${x - r * .6} ${y - r * .3} Q${x} ${y - r * 1.1} ${x + r * .6} ${y - r * .3}`, 'none', `fill="none" stroke="${shade(sk, -30)}" stroke-width=".9"`) + E(x + (opts.thumb || 1) * r * .85, y + .6, r * .42, r * .32, shade(sk, -8));
  }

  // ======================= RIG =======================
  // o: {skin, sleeve, torso, head, back, front, main, off, plus, offColor, offEmblem, build, small, handKind, handR, armW, shoulders}
  function rot(gx, gy, a, lx, ly) { const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [gx + lx * c - ly * s, gy + lx * s + ly * c]; }
  function poseFor(main, off) {
    const M = W[main]; const O = W[off];
    if (!M) return off ? 'oneoff' : 'rest';
    if (M.hold === 'bow') return 'bow'; if (M.hold === 'xbow') return 'xbow'; if (M.hold === 'two') return 'two'; if (M.hold === 'fist') return 'fist';
    if (M.hold === 'pole') return O && O.hold === 'shield' ? 'poleshield' : 'pole';
    if (O && (O.hold === 'one' || W[off]?.light)) return 'dual';
    return 'one';
  }
  function rig(o) {
    const b = o.build == null ? 1 : o.build; const sx = [0.88, 1, 1.12, 1.25][b] || 1;
    const RS = [50 + 15 * sx, 70], LS = [50 - 15 * sx, 70];
    const sleeve = o.sleeve || '#5b6f86'; const skin = o.skin || '#e0b48a'; const aw = (o.armW || 9.5) * sx;
    const ws = STYLE.wscale; const pose = poseFor(o.main, o.off);
    const items = []; // {key, x, y, a, s, layer}
    let MH, OH; // hand positions [x,y]
    let mainA = 0; let offHandOnMain = null;
    switch (pose) {
      case 'one': { const sideHead = ['handaxe', 'battleaxe', 'warhammer', 'mace', 'morningstar', 'tongs'].includes(o.main); MH = sideHead ? [72, 86] : [77, 84]; mainA = sideHead ? 6 : 22; break; }
      case 'oneoff': MH = [76, 88]; break;
      case 'dual': MH = [78, 84]; mainA = 24; OH = [22, 84]; items.push({ key: o.off, x: 22, y: 84, a: -24 }); break;
      case 'two': { MH = [60, 92]; mainA = 30; const M = W[o.main]; offHandOnMain = M.g2 || 11; break; }
      case 'pole': { MH = [76, 92]; mainA = 4; offHandOnMain = W[o.main].g2 || -18; break; }
      case 'poleshield': MH = [77, 88]; mainA = 4; break;
      case 'bow': OH = [24, 78]; items.push({ key: o.main, x: 24, y: 78, a: -4, isMain: true }); MH = [44, 80]; break;
      case 'xbow': { MH = [56, 88]; mainA = 74; offHandOnMain = -14; break; }
      case 'fist': MH = [72, 78]; OH = [28, 78]; break;
      default: MH = [70, 95]; OH = [30, 95];
    }
    if (pose !== 'bow' && o.main && W[o.main] && pose !== 'fist') items.push({ key: o.main, x: MH[0], y: MH[1], a: mainA, isMain: true });
    if (offHandOnMain != null) { OH = rot(MH[0], MH[1], mainA, 0, offHandOnMain * ws); }
    if (o.off && W[o.off] && pose !== 'dual' && pose !== 'bow') {
      const O = W[o.off];
      if (O.hold === 'shield') { OH = OH || [24, 84]; items.push({ key: o.off, x: 22, y: 80, a: -6, shield: true }); }
      else if (!OH) { OH = [24, 86]; items.push({ key: o.off, x: 24, y: 86, a: -6 }); }
    }
    if (!OH) OH = [27, 94];
    // build
    let s = o.back || '';
    s += o.torso || P(`M${50 - 36 * sx} 100 Q${50 - 35 * sx} 70 ${50 - 16 * sx} 64 Q50 70 ${50 + 16 * sx} 64 Q${50 + 35 * sx} 70 ${50 + 36 * sx} 100Z`, sleeve);
    const arm = (S, Hd, out) => { const mx = (S[0] + Hd[0]) / 2 + out * 9, my = (S[1] + Hd[1]) / 2 + 5; return P(`M${S[0]} ${S[1]} Q${mx} ${my} ${Hd[0]} ${Hd[1]}`, 'none', `fill="none" stroke="${shade(sleeve, -18)}" stroke-width="${aw}"`); };
    const armsBehind = arm(LS, OH, -1) + arm(RS, MH, 1);
    s += armsBehind;
    s += o.head ? G(`translate(50 62) scale(${STYLE.head}) translate(-50 -62)`, o.head) : '';
    // weapons (not shields)
    items.filter(i => !i.shield).forEach(i => { const D = W[i.key]; if (!D) return; s += G(`translate(${i.x} ${i.y}) rotate(${i.a}) scale(${ws})`, D.draw(i.isMain ? o.plus : 0, o.offColor, o.offEmblem)); });
    // arrow nocked for bows
    if (pose === 'bow') s += L(`M${MH[0] + 2} ${MH[1] - 1} L16 ${MH[1] - 3}`, '#c9a06a', 1.6) + P(`M16 ${MH[1] - 6} L10 ${MH[1] - 3} L16 ${MH[1]}Z`, MET2);
    // hands on top of grips
    const hk = o.handKind; const hr = o.handR;
    s += hand(OH[0], OH[1], skin, null, { kind: hk, r: hr, thumb: -1 });
    s += hand(MH[0], MH[1], skin, null, { kind: hk, r: hr, thumb: 1 });
    if (pose === 'fist' && o.main === 'unarmed') s += L(`M${MH[0] - 4} ${MH[1] + 3} L${MH[0] + 4} ${MH[1] + 3} M${OH[0] - 4} ${OH[1] + 3} L${OH[0] + 4} ${OH[1] + 3}`, '#f3e6cc', 2);
    // shields over the off hand
    items.filter(i => i.shield).forEach(i => { s += G(`translate(${i.x} ${i.y}) rotate(${i.a}) scale(${ws})`, W[i.key].draw(0, o.offColor, o.offEmblem)); });
    s += o.front || '';
    if (o.small) s = G(`translate(50 100) scale(${o.small}) translate(-50 -100)`, s);
    return s;
  }

  // ======================= HEADS =======================
  function face(skin, o = {}) {
    const y = o.y || 44, cx = 50, r = o.r || 19; const eye = o.eye || '#2b1d12'; const brow = shade(o.hair || '#2b1d12', -20);
    let s = P(blob(cx, y, r, 18, 0.8, 2), skin);
    if (o.cheeks !== false) s += C(cx - 11, y + 6, 3.2, '#e8836b', 'opacity=".35"') + C(cx + 11, y + 6, 3.2, '#e8836b', 'opacity=".35"');
    const mark = o.mark || 'none';
    s += E(cx - 7, y + 1, 2.8, 3.4, '#fff8ea') + C(cx - 6.6, y + 1.6, 1.9, eye);
    if (mark !== 'eyepatch') s += E(cx + 7, y + 1, 2.8, 3.4, '#fff8ea') + C(cx + 7.4, y + 1.6, 1.9, eye);
    const bs = o.brows || 0;
    if (bs === 1) s += L(`M${cx - 11} ${y - 7} L${cx - 3} ${y - 4.5} M${cx + 3} ${y - 4.5} L${cx + 11} ${y - 7}`, brow, 2.6);
    else if (bs === 2) s += L(`M${cx - 11} ${y - 5} Q${cx - 7} ${y - 8} ${cx - 3} ${y - 5.5} M${cx + 3} ${y - 5.5} Q${cx + 7} ${y - 8} ${cx + 11} ${y - 5}`, brow, 2.2);
    else s += L(`M${cx - 11} ${y - 5} L${cx - 3} ${y - 6.5} M${cx + 3} ${y - 6.5} L${cx + 11} ${y - 5}`, brow, 2.4);
    s += L(o.frown ? `M${cx - 5} ${y + 11} Q${cx} ${y + 8} ${cx + 5} ${y + 11}` : `M${cx - 5} ${y + 9} Q${cx} ${y + 13} ${cx + 5} ${y + 9}`, '#2b1d12', 2.2);
    if (mark === 'freckles') [[-12, 4], [-10, 6.5], [-13, 7], [10, 4], [12, 6.5], [9, 7]].forEach(([dx, dy]) => { s += C(cx + dx, y + dy, .9, shade(skin, -45)); });
    if (mark === 'scar') s += L(`M${cx + 5} ${y - 9} L${cx + 11} ${y + 5}`, shade(skin, -55), 1.6) + L(`M${cx + 6} ${y - 4} l3 -1 M${cx + 8} ${y} l3 -1`, shade(skin, -55), 1.1);
    if (mark === 'eyepatch') s += E(cx + 7, y + 1, 4.4, 4, '#1a1a1a') + L(`M${cx - 18} ${y - 6} L${cx + 18} ${y - 3}`, '#1a1a1a', 1.4);
    if (mark === 'warpaint') s += P(`M${cx - 15} ${y + 2} l8 -1 l0 2.4 l-8 1Z M${cx + 15} ${y + 2} l-8 -1 l0 2.4 l8 1Z`, '#b5452c') + L(`M${cx} ${y - 14} L${cx} ${y - 8}`, '#2f5b9a', 2);
    if (mark === 'glasses') s += C(cx - 7, y + 1, 4.6, 'none', `fill="none" stroke="#3a2a1c" stroke-width="1.4"`) + C(cx + 7, y + 1, 4.6, 'none', `fill="none" stroke="#3a2a1c" stroke-width="1.4"`) + L(`M${cx - 2.4} ${y} L${cx + 2.4} ${y}`, '#3a2a1c', 1.4);
    if (mark === 'tattoo') s += P(`M${cx - 14} ${y - 2} q2 -4 4 0 q2 4 4 0`, 'none', `fill="none" stroke="#4b2f6b" stroke-width="1.3"`);
    return s;
  }
  const HAIR_STYLES = ['Short', 'Long', 'Spiky', 'Bun', 'Shaggy', 'Mohawk', 'Ponytail', 'Braids', 'Bald', 'Curly'];
  function hairFor(style, hair, hy = 44) {
    const o = hy - 44; const T = (d) => G(`translate(0 ${o})`, d);
    switch ((style || 0) % HAIR_STYLES.length) {
      case 0: return T(P('M30 42 Q31 22 50 21 Q69 22 70 42 Q63 31 50 32 Q37 31 30 42Z', hair));
      case 1: return T(P('M28 46 Q27 19 50 19 Q73 19 72 46 L74 68 Q68 58 68 42 Q50 33 32 42 Q32 58 26 68Z', hair));
      case 2: return T(P('M31 36 L36 17 L43 30 L50 13 L57 30 L64 17 L69 36 Q50 28 31 36Z', hair));
      case 3: return T(C(50, 19, 8, hair) + P('M30 40 Q32 23 50 23 Q68 23 70 40 Q50 30 30 40Z', hair));
      case 4: return T(P('M29 44 Q28 21 50 20 Q72 21 71 44 Q66 30 58 31 Q54 25 50 30 Q44 25 40 31 Q33 31 29 44Z', hair));
      case 5: return T(P('M44 32 L42 12 L47 20 L50 8 L53 20 L58 12 L56 32Z', hair) + P('M32 40 Q34 30 44 30 L44 34 Q36 34 32 40Z M68 40 Q66 30 56 30 L56 34 Q64 34 68 40Z', shade(hair, 30), 'opacity=".5"'));
      case 6: return T(P('M30 42 Q31 22 50 21 Q69 22 70 42 Q63 31 50 32 Q37 31 30 42Z', hair) + P('M66 30 Q84 30 80 50 Q78 62 72 68 Q74 52 68 38Z', hair) + C(69, 31, 3, shade(hair, -30)));
      case 7: return T(P('M29 44 Q28 20 50 20 Q72 20 71 44 Q63 31 50 32 Q37 31 29 44Z', hair) + [30, 70].map(x => P(`M${x - 4} 42 Q${x - 5} 56 ${x} 70 Q${x + 5} 56 ${x + 4} 42Z`, hair) + L(`M${x - 3} 50 L${x + 3} 52 M${x - 3} 57 L${x + 3} 59 M${x - 2} 64 L${x + 2} 65`, shade(hair, -35), 1.2)).join(''));
      case 8: return T(E(42, 30, 5, 2.4, '#fff', 'opacity=".35"'));
      case 9: return T([[34, 32], [40, 25], [48, 22], [56, 23], [63, 27], [68, 34], [31, 40], [69, 41]].map(([x, y]) => C(x, y, 6.5, hair)).join(''));
    }
  }
  const BEARDS = ['None', 'Stubble', 'Short', 'Long', 'Braided', 'Mustache'];
  function beardFor(b, hair, hy) {
    if (!b) return '';
    if (b === 1) { let s = ''; for (let i = 0; i < 14; i++) { const a = Math.PI * (0.15 + 0.7 * i / 13); s += C(50 + Math.cos(a) * 15, hy + 2 + Math.sin(a) * 13, .8, shade(hair, -10)); } return s; }
    if (b === 2) return P(`M33 ${hy + 2} Q35 ${hy + 22} 50 ${hy + 22} Q65 ${hy + 22} 67 ${hy + 2} Q60 ${hy + 12} 50 ${hy + 12} Q40 ${hy + 12} 33 ${hy + 2}Z`, hair) + L(`M44 ${hy + 9} Q50 ${hy + 12} 56 ${hy + 9}`, '#2b1d12', 2);
    if (b === 3) return P(`M34 ${hy + 4} Q36 ${hy + 32} 50 ${hy + 34} Q64 ${hy + 32} 66 ${hy + 4} Q60 ${hy + 14} 50 ${hy + 14} Q40 ${hy + 14} 34 ${hy + 4}Z`, hair) + L(`M44 ${hy + 9} Q50 ${hy + 12} 56 ${hy + 9}`, '#2b1d12', 2);
    if (b === 4) return P(`M34 ${hy + 4} Q38 ${hy + 20} 50 ${hy + 20} Q62 ${hy + 20} 66 ${hy + 4} Q60 ${hy + 14} 50 ${hy + 14} Q40 ${hy + 14} 34 ${hy + 4}Z`, hair) + P(`M45 ${hy + 18} L50 ${hy + 36} L55 ${hy + 18}Z`, hair) + RC(46.5, hy + 25, 7, 2.6, GOLD) + RC(47.5, hy + 31, 5, 2.4, GOLD) + L(`M44 ${hy + 9} Q50 ${hy + 12} 56 ${hy + 9}`, '#2b1d12', 2);
    if (b === 5) return P(`M40 ${hy + 9} Q45 ${hy + 5} 50 ${hy + 8} Q55 ${hy + 5} 60 ${hy + 9} Q56 ${hy + 12} 50 ${hy + 10} Q44 ${hy + 12} 40 ${hy + 9}Z`, hair);
    return '';
  }
  const HEADGEAR = ['auto', 'none', 'hood', 'helm', 'wizard', 'circlet', 'bandana', 'feather', 'horned', 'crown', 'tricorn', 'straw', 'headband'];
  function headgearFor(g, hy, look, cls) {
    const cl = look.cloak || '#5b6f86';
    switch (g) {
      case 'wizard': return P(`M26 ${hy - 10} Q50 ${hy - 4} 74 ${hy - 10} L70 ${hy - 14} Q50 ${hy - 10} 30 ${hy - 14}Z`, look.hat || '#2f5b9a') + P(`M32 ${hy - 13} Q48 ${hy - 50} 62 ${hy - 38} Q56 ${hy - 34} 66 ${hy - 13}Z`, look.hat || '#2f5b9a') + C(46, hy - 24, 1.6, '#ffd36b') + C(55, hy - 18, 1.2, '#ffd36b');
      case 'helm': return P(`M29 ${hy - 2} Q29 ${hy - 26} 50 ${hy - 26} Q71 ${hy - 26} 71 ${hy - 2} L64 ${hy - 4} L64 ${hy - 8} L36 ${hy - 8} L36 ${hy - 4}Z`, '#9aa3ad') + P(`M48 ${hy - 8} h4 v12 h-4Z`, '#7b848e');
      case 'paladin': return P(`M29 ${hy - 3} Q29 ${hy - 26} 50 ${hy - 26} Q71 ${hy - 26} 71 ${hy - 3} L64 ${hy - 7} L36 ${hy - 7}Z`, '#c9ccd1') + P(`M47 ${hy - 26} L50 ${hy - 36} L53 ${hy - 26}Z`, GOLD) + RC(32, hy - 9, 36, 3, GOLD);
      case 'horned': return P(`M29 ${hy - 3} Q29 ${hy - 26} 50 ${hy - 26} Q71 ${hy - 26} 71 ${hy - 3} L64 ${hy - 7} L36 ${hy - 7}Z`, '#9aa3ad') + P(`M31 ${hy - 14} Q18 ${hy - 20} 20 ${hy - 36} Q26 ${hy - 24} 36 ${hy - 20}Z`, '#e8e0d0') + P(`M69 ${hy - 14} Q82 ${hy - 20} 80 ${hy - 36} Q74 ${hy - 24} 64 ${hy - 20}Z`, '#e8e0d0');
      case 'hood': return P(`M26 ${hy + 4} Q26 ${hy - 28} 50 ${hy - 29} Q74 ${hy - 28} 74 ${hy + 4} Q68 ${hy - 12} 50 ${hy - 13} Q32 ${hy - 12} 26 ${hy + 4}Z`, look.hood || shade(cl, -20));
      case 'rogue': return headgearFor('hood', hy, Object.assign({}, look, { hood: '#3b3b46' })) + P(`M34 ${hy + 6} Q50 ${hy + 14} 66 ${hy + 6} L64 ${hy + 16} Q50 ${hy + 21} 36 ${hy + 16}Z`, '#3b3b46');
      case 'warlock': return P(`M24 ${hy + 8} Q24 ${hy - 30} 50 ${hy - 32} Q76 ${hy - 30} 76 ${hy + 8} Q68 ${hy - 12} 50 ${hy - 13} Q32 ${hy - 12} 24 ${hy + 8}Z`, '#2a1d3a') + C(50, hy - 20, 2.5, '#9b6bd1');
      case 'circlet': return P(`M33 ${hy - 13} Q50 ${hy - 20} 67 ${hy - 13} L66 ${hy - 10} Q50 ${hy - 16} 34 ${hy - 10}Z`, GOLD) + C(50, hy - 16, 2.5, '#fff8ea');
      case 'bandana': return P(`M30 ${hy - 6} Q50 ${hy - 30} 70 ${hy - 6} Q50 ${hy - 12} 30 ${hy - 6}Z`, '#b5452c') + P(`M68 ${hy - 8} l10 4 l-8 4Z`, '#b5452c');
      case 'feather': return P(`M28 ${hy - 10} Q50 ${hy - 30} 72 ${hy - 10} Q50 ${hy - 16} 28 ${hy - 10}Z`, '#8a4fa3') + P(`M60 ${hy - 18} Q78 ${hy - 40} 84 ${hy - 30} Q72 ${hy - 26} 64 ${hy - 14}Z`, GOLD);
      case 'crown': return P(`M35 ${hy - 14} L35 ${hy - 26} L41 ${hy - 19} L50 ${hy - 29} L59 ${hy - 19} L65 ${hy - 26} L65 ${hy - 14}Z`, GOLD) + C(50, hy - 18, 2, '#b5452c');
      case 'tricorn': return P(`M22 ${hy - 10} Q50 ${hy - 2} 78 ${hy - 10} Q70 ${hy - 34} 50 ${hy - 32} Q30 ${hy - 34} 22 ${hy - 10}Z`, '#2b1d12') + L(`M44 ${hy - 22} l12 0`, GOLD, 2);
      case 'straw': return E(50, hy - 12, 30, 6, '#d9b65a') + P(`M36 ${hy - 13} Q38 ${hy - 28} 50 ${hy - 28} Q62 ${hy - 28} 64 ${hy - 13}Z`, '#e3c46a') + RC(36, hy - 16, 28, 3, '#b5452c');
      case 'souwester': return P(`M24 ${hy - 6} Q50 ${hy - 2} 78 ${hy + 2} Q76 ${hy - 26} 50 ${hy - 28} Q30 ${hy - 28} 24 ${hy - 6}Z`, '#e8c14a');
      case 'headband': return P(`M31 ${hy - 8} Q50 ${hy - 14} 69 ${hy - 8} L69 ${hy - 4} Q50 ${hy - 10} 31 ${hy - 4}Z`, look.band || '#b5452c');
      case 'antlers': return P(`M36 ${hy - 14} L30 ${hy - 30} L36 ${hy - 24} L38 ${hy - 34} L41 ${hy - 18}Z`, '#8a5a2b') + P(`M64 ${hy - 14} L70 ${hy - 30} L64 ${hy - 24} L62 ${hy - 34} L59 ${hy - 18}Z`, '#8a5a2b');
      case 'chef': return RC(36, hy - 22, 28, 10, '#fff8ea', 'rx="3"') + C(40, hy - 26, 6, '#fff8ea') + C(50, hy - 29, 7, '#fff8ea') + C(60, hy - 26, 6, '#fff8ea');
      default: return '';
    }
  }
  const CLASS_HAT = { Wizard: 'wizard', Fighter: 'helm', Paladin: 'paladin', Rogue: 'rogue', Ranger: 'hood', Warlock: 'warlock', Bard: 'feather', Cleric: 'circlet', Druid: 'antlers', Monk: 'headband' };
  function heroHead(look, cls, race, hy) {
    const skin0 = look.skin || '#e0b48a'; const hair = look.hair || '#4a2c17'; const cloak = look.cloak || '#5b6f86';
    const skin = race === 'Dragonborn' ? (look.scale || shade(cloak, 40)) : skin0; const hr = (race === 'Halfling' || race === 'Gnome') ? 18 : 19;
    let s = '';
    if (race === 'Elf' || race === 'Half-Elf') { const l = race === 'Elf' ? 15 : 9; s += P(`M33 ${hy - 2} L${33 - l} ${hy - 8} L34 ${hy + 6}Z`, shade(skin, -10)) + P(`M67 ${hy - 2} L${67 + l} ${hy - 8} L66 ${hy + 6}Z`, shade(skin, -10)); }
    if (race === 'Gnome' || race === 'Halfling' || race === 'Half-Orc') s += C(31, hy + 2, 5, shade(skin, -10)) + C(69, hy + 2, 5, shade(skin, -10));
    if (race === 'Half-Orc') s += P(`M28 ${hy} l-6 -6 l6 1Z M72 ${hy} l6 -6 l-6 1Z`, shade(skin, -10));
    const hg0 = look.headgear && look.headgear !== 'auto' ? look.headgear : (CLASS_HAT[cls] || 'none');
    const hatted = !['none', 'circlet', 'headband', 'antlers', 'crown', 'bandana', 'straw', 'tricorn', 'souwester', 'chef'].includes(hg0);
    if (look.hairStyle === 1 || look.hairStyle === 7 || look.hairStyle === 6) { if (!hatted && race !== 'Dragonborn') s += hairFor(look.hairStyle, hair, hy); }
    s += face(skin, { y: hy, r: hr, hair, eye: look.eyes || (race === 'Tiefling' ? '#ffd36b' : race === 'Dragonborn' ? '#d9a62e' : undefined), cheeks: race !== 'Dragonborn', mark: look.mark, brows: look.brows });
    if (race === 'Dragonborn') s += P(`M38 ${hy + 6} Q50 ${hy + 20} 62 ${hy + 6} Q50 ${hy + 12} 38 ${hy + 6}Z`, shade(skin, -18)) + P(`M36 ${hy - 14} L30 ${hy - 26} L42 ${hy - 17}Z`, '#e8e0d0') + P(`M64 ${hy - 14} L70 ${hy - 26} L58 ${hy - 17}Z`, '#e8e0d0') + C(44, hy - 8, 1.6, shade(skin, -25)) + C(56, hy - 8, 1.6, shade(skin, -25)) + C(50, hy - 12, 1.6, shade(skin, -25));
    if (race === 'Gnome') s += E(50, hy + 5, 4, 3.5, shade(skin, -18));
    if (race === 'Half-Orc') s += P(`M42 ${hy + 10} l2 -5 l2 5Z M54 ${hy + 10} l2 -5 l2 5Z`, '#fff8ea');
    const beard = look.beard != null ? look.beard : (race === 'Dwarf' ? 3 : 0);
    if (race !== 'Dragonborn') s += beardFor(beard, hair, hy);
    if (!hatted && race !== 'Dragonborn' && ![1, 6, 7].includes(look.hairStyle)) s += hairFor(look.hairStyle, hair, hy);
    if (race === 'Tiefling') s += P(`M35 ${hy - 12} Q22 ${hy - 22} 28 ${hy - 34} Q30 ${hy - 22} 40 ${hy - 16}Z`, look.horns || '#5a3a6b') + P(`M65 ${hy - 12} Q78 ${hy - 22} 72 ${hy - 34} Q70 ${hy - 22} 60 ${hy - 16}Z`, look.horns || '#5a3a6b');
    s += headgearFor(hg0, hy, look, cls);
    if (look.earring) s += C(32, hy + 9, 1.8, GOLD);
    return s;
  }
  // class outfit pieces drawn over the torso
  function outfit(cls, look, sx) {
    const cl = look.cloak || '#5b6f86'; const tr = look.trim || (cls === 'Cleric' || cls === 'Paladin' ? '#f3e6cc' : shade(cl, 50));
    let s = P('M40 64 L50 80 L60 64 Q50 68 40 64Z', tr, 'opacity=".95"');
    if (cls === 'Fighter' || cls === 'Paladin') s += P('M18 78 Q22 62 36 64 L35 79Z', '#9aa3ad') + P('M82 78 Q78 62 64 64 L65 79Z', '#9aa3ad') + RC(38, 80, 24, 20, '#9aa3ad', 'rx="3"') + L('M38 86 L62 86 M38 92 L62 92', '#7b848e', 1.2);
    if (cls === 'Paladin') s += P('M44 82 L56 82 L56 92 Q50 98 44 92Z', GOLD);
    if (cls === 'Barbarian') s += P(blob(50, 66, 20, 22, 3, 5), '#7a5a3a') + L('M36 74 L64 96', '#5a3a1f', 3);
    if (cls === 'Cleric') s += P('M47 82 h6 v4 h4 v5 h-4 v8 h-6 v-8 h-4 v-5 h4Z', GOLD);
    if (cls === 'Ranger') s += L('M36 66 L64 96', LEA, 3) + P('M64 60 L74 48 L79 52 L70 64Z', '#6b4a2b') + P('M70 46 l2 -7 l2 7Z M74 49 l3 -6 l1 7Z', '#e8e0d0');
    if (cls === 'Bard') s += P('M22 92 Q16 80 24 74 Q32 72 34 82 Q34 94 26 96Z', '#a06a35') + L('M30 76 L42 52', '#6b4a2b', 3);
    if (cls === 'Warlock') s += C(50, 88, 4, '#9b6bd1') + C(50, 88, 1.6, '#fff');
    if (cls === 'Monk') s += P('M38 72 Q50 78 62 72 L62 75 Q50 81 38 75Z', '#b5452c');
    if (cls === 'Rogue') s += L('M36 70 L62 96', '#3a2a1c', 3) + RC(54, 84, 6, 8, '#3a2a1c', 'rx="1"');
    if (cls === 'Druid') s += P('M36 70 Q42 64 46 72 Q40 74 36 70Z', '#4f8a3a') + P('M54 72 Q58 64 64 70 Q60 74 54 72Z', '#4f8a3a');
    if (cls === 'Wizard') s += RC(44, 84, 12, 14, '#6b2f2f', 'rx="1.5"') + RC(45, 85, 2, 12, GOLD);
    if (cls === 'Sorcerer') s += P('M44 80 Q50 74 56 80 Q50 90 44 80Z', '#ff8a3d', 'opacity=".7"');
    if (look.cape) s = P(`M${50 - 30 * sx} 100 Q${50 - 36 * sx} 72 ${50 - 18 * sx} 64 L${50 + 18 * sx} 64 Q${50 + 36 * sx} 72 ${50 + 30 * sx} 100Z`, look.cape, 'opacity=".95"') + s;
    return s;
  }
  // default gear by class (used if the token doesn't say)
  const CLASS_GEAR = { Barbarian: ['greataxe'], Bard: ['rapier'], Cleric: ['mace', 'shield_sun'], Druid: ['scimitar', 'shield_bark'], Fighter: ['longsword', 'shield_heater'], Monk: ['unarmed'], Paladin: ['longsword', 'shield_kite'], Ranger: ['longbow'], Rogue: ['shortsword', 'dagger'], Sorcerer: ['dagger', 'flame'], Warlock: ['dagger', 'orb'], Wizard: ['staff'] };
  function heroSVG(look, cls, race, size, opts = {}) {
    look = look || {}; const cloak = look.cloak || '#5b6f86';
    const small = (race === 'Halfling' || race === 'Gnome') ? 0.9 : race === 'Dwarf' ? 0.96 : null;
    const build = look.build != null ? look.build : (race === 'Half-Orc' || race === 'Dragonborn' || cls === 'Barbarian' ? 2 : race === 'Elf' ? 0 : 1);
    const sx = [0.88, 1, 1.12, 1.25][build];
    let main = opts.main !== undefined ? weaponKey(opts.main) : (opts.gear === false ? null : (CLASS_GEAR[cls] || [])[0]);
    if (cls === 'Wizard' && (main === 'quarterstaff' || main === 'dagger') && !opts.plainStaff) main = main === 'quarterstaff' ? 'staff' : main;
    let off = opts.off !== undefined ? opts.off : (opts.gear === false ? null : (CLASS_GEAR[cls] || [])[1]);
    if (off === 'shield') off = { Cleric: 'shield_sun', Paladin: 'shield_kite', Druid: 'shield_bark', Fighter: 'shield_heater' }[cls] || 'shield_round';
    off = weaponKey(off) || off;
    const skin = race === 'Dragonborn' ? (look.scale || shade(cloak, 40)) : (look.skin || '#e0b48a');
    const hy = 44;
    return wrap(rig({ skin, sleeve: cloak, build, head: heroHead(look, cls, race, hy), front: '', main, off, plus: opts.plus, small, handKind: look.gloves ? 'glove' : null, offColor: look.shieldColor,
      torso: P(`M${50 - 36 * sx} 100 Q${50 - 35 * sx} 70 ${50 - 16 * sx} 64 Q50 70 ${50 + 16 * sx} 64 Q${50 + 35 * sx} 70 ${50 + 36 * sx} 100Z`, cloak) + outfit(cls, look, sx) }), size);
  }

  // ======================= NPC ROLES =======================
  const ROLES = {
    villager: { hat: 'none' }, guard: { hat: 'helm', main: 'spear', off: 'shield_heater', tabard: '#b5452c', emblem: true }, captain: { hat: 'tricorn', main: 'longsword', coat: '#2f5b9a' },
    smith: { hat: 'none', main: 'warhammer', off: 'tongs', apron: '#5a3a1f', build: 2 }, innkeeper: { hat: 'none', main: null, off: 'tankard', apron: '#f3e6cc', offR: 'rag' },
    priest: { hat: 'circlet', main: null, off: 'holy', robe: '#f3e6cc', book: true }, harbor: { hat: 'souwester', main: null, off: 'lantern', coat: '#2f5b9a' },
    kid: { hat: 'none', small: .8, main: 'sling' }, sailor: { hat: 'bandana', main: 'cutlass', stripes: true }, merchant: { hat: 'feather', main: null, off: 'purse', coat: '#8a4fa3' },
    noble: { hat: 'crown', main: 'rapier', coat: '#8a2f1c' }, witch: { hat: 'wizard', main: 'wand', robe: '#2a1d3a', hatColor: '#2a1d3a' }, farmer: { hat: 'straw', main: 'pitchfork' },
    cook: { hat: 'chef', main: null, off: 'tankard', apron: '#f3e6cc' }, prisoner: { hat: 'none', main: null, chains: true }, scholar: { hat: 'none', main: null, off: 'book', robe: '#5b6f86' }
  };
  const ROLE_GUESS = (role) => { const r = String(role || '').toLowerCase(); if (/guard|watch|soldier|sentry/.test(r)) return 'guard'; if (/captain|commander/.test(r)) return 'captain'; if (/smith|forge/.test(r)) return 'smith'; if (/inn|tavern|barkeep|bartender/.test(r)) return 'innkeeper'; if (/priest|cleric|sister|brother|monk|temple/.test(r)) return 'priest'; if (/harbor|fisher|dock/.test(r)) return 'harbor'; if (/kid|child|urchin|boy|girl/.test(r)) return 'kid'; if (/sailor|pirate|smuggl/.test(r)) return 'sailor'; if (/merchant|trader|shop|peddler/.test(r)) return 'merchant'; if (/noble|lord|lady|king|queen|mayor/.test(r)) return 'noble'; if (/witch|wizard|mage|sorcer|hedge/.test(r)) return 'witch'; if (/farm/.test(r)) return 'farmer'; if (/cook|chef/.test(r)) return 'cook'; if (/prison|captive/.test(r)) return 'prisoner'; if (/scholar|sage|librar/.test(r)) return 'scholar'; return 'villager'; };
  function npcSVG(look, role, size, opts = {}) {
    look = look || {}; const R0 = ROLES[role] || ROLES[ROLE_GUESS(role)] || ROLES.villager; const cloak = R0.coat || R0.robe || look.cloak || '#8a6a3f';
    const build = look.build != null ? look.build : (R0.build || 1); const sx = [0.88, 1, 1.12, 1.25][build];
    let torso = P(`M${50 - 36 * sx} 100 Q${50 - 35 * sx} 70 ${50 - 16 * sx} 64 Q50 70 ${50 + 16 * sx} 64 Q${50 + 35 * sx} 70 ${50 + 36 * sx} 100Z`, cloak);
    torso += P('M40 64 L50 80 L60 64 Q50 68 40 64Z', look.trim || shade(cloak, 50));
    if (R0.tabard) torso += P('M38 66 L62 66 L60 100 L40 100Z', R0.tabard) + P('M44 76 L56 76 L56 86 Q50 92 44 86Z', GOLD);
    if (R0.apron) torso += P('M36 74 L64 74 L66 100 L34 100Z', R0.apron) + L('M40 74 L44 64 M60 74 L56 64', R0.apron, 2.4);
    if (R0.stripes) torso += [74, 82, 90].map(y => L(`M24 ${y} L76 ${y}`, '#f3e6cc', 3)).join('');
    if (R0.chains) torso += L('M30 92 Q50 100 70 92', '#8a929c', 3) + C(30, 92, 4, 'none', 'fill="none" stroke="#8a929c" stroke-width="2.4"') + C(70, 92, 4, 'none', 'fill="none" stroke="#8a929c" stroke-width="2.4"');
    if (R0.book) torso += RC(55, 80, 11, 14, '#6b2f2f', 'rx="1.5"');
    const lk = Object.assign({}, look, { headgear: look.headgear && look.headgear !== 'auto' ? look.headgear : R0.hat, hat: R0.hatColor });
    return wrap(rig({ skin: look.skin, sleeve: cloak, build, head: heroHead(lk, null, 'Human', 44), torso, main: opts.main !== undefined ? opts.main : R0.main, off: opts.off !== undefined ? opts.off : R0.off, small: R0.small || null }), size);
  }

  // ======================= MONSTERS =======================
  const eyes = (x, y, gap, r, col) => C(x - gap, y, r + 1.2, '#1a1a1a') + C(x + gap, y, r + 1.2, '#1a1a1a') + C(x - gap, y, r, col) + C(x + gap, y, r, col) + C(x - gap - r * .3, y - r * .3, r * .35, '#fff');
  function humanoidHead(a, hy, hr) {
    const x = a.x || []; const c1 = a.c1, c2 = a.c2; let s = '';
    if (x.includes('fins')) s += P(`M34 ${hy - 6} L18 ${hy - 20} L24 ${hy + 2}Z`, c2) + P(`M66 ${hy - 6} L82 ${hy - 20} L76 ${hy + 2}Z`, c2) + P(`M44 ${hy - hr} L50 ${hy - hr - 14} L56 ${hy - hr}Z`, c2);
    if (x.includes('ears')) s += P(`M${50 - hr + 2} ${hy - 2} L${50 - hr - 16} ${hy - 12} L${50 - hr + 2} ${hy + 6}Z`, shade(c1, -12)) + P(`M${50 + hr - 2} ${hy - 2} L${50 + hr + 16} ${hy - 12} L${50 + hr - 2} ${hy + 6}Z`, shade(c1, -12));
    s += P(blob(50, hy, hr, 16, 1.2, 4), c1);
    if (x.includes('snout')) s += E(50, hy + 8, 9, 6.5, shade(c1, -18)) + C(46.5, hy + 7, 1.4, '#1a1a1a') + C(53.5, hy + 7, 1.4, '#1a1a1a');
    if (x.includes('brow')) s += P(`M36 ${hy - 6} L64 ${hy - 6} L62 ${hy - 2} L38 ${hy - 2}Z`, shade(c1, -25));
    if (x.includes('spots')) s += C(40, hy - 8, 2.5, shade(c1, -35)) + C(60, hy - 4, 2, shade(c1, -35)) + C(56, hy - 12, 1.8, shade(c1, -35));
    s += eyes(50, hy - 1, 6.5, 2.6, a.eye);
    if (x.includes('teeth')) s += P(`M40 ${hy + 9} Q50 ${hy + 14} 60 ${hy + 9} L58 ${hy + 13} L55 ${hy + 10} L52 ${hy + 14} L49 ${hy + 10} L46 ${hy + 14} L43 ${hy + 10}Z`, '#fff8ea');
    else if (!x.includes('snout')) s += L(`M43 ${hy + 9} Q50 ${hy + 6} 57 ${hy + 9}`, '#1a1a1a', 2);
    if (x.includes('tusks')) s += P(`M41 ${hy + 12} l2 -8 l3 8Z`, '#fff8ea') + P(`M54 ${hy + 12} l3 -8 l2 8Z`, '#fff8ea');
    if (x.includes('horns')) s += P(`M38 ${hy - 12} Q30 ${hy - 26} 36 ${hy - 30} Q36 ${hy - 20} 44 ${hy - 14}Z`, '#e8e0d0') + P(`M62 ${hy - 12} Q70 ${hy - 26} 64 ${hy - 30} Q64 ${hy - 20} 56 ${hy - 14}Z`, '#e8e0d0');
    if (x.includes('beard')) s += P(`M38 ${hy + 8} Q40 ${hy + 26} 50 ${hy + 28} Q60 ${hy + 26} 62 ${hy + 8} Q50 ${hy + 16} 38 ${hy + 8}Z`, '#4a2c17');
    if (x.includes('hood')) s += P(`M${50 - hr - 6} ${hy + 8} Q${50 - hr - 6} ${hy - hr - 12} 50 ${hy - hr - 14} Q${50 + hr + 6} ${hy - hr - 12} ${50 + hr + 6} ${hy + 8} Q${50 + hr} ${hy - 8} 50 ${hy - 9} Q${50 - hr} ${hy - 8} ${50 - hr - 6} ${hy + 8}Z`, x.includes('robe') ? c2 : shade(c2, -20));
    if (x.includes('mask')) s += P(`M34 ${hy + 4} Q50 ${hy + 10} 66 ${hy + 4} L64 ${hy + 14} Q50 ${hy + 18} 36 ${hy + 14}Z`, '#3b3b46');
    if (x.includes('bandana')) s += P(`M${50 - hr} ${hy - 6} Q50 ${hy - hr - 10} ${50 + hr} ${hy - 6} Q50 ${hy - 12} ${50 - hr} ${hy - 6}Z`, '#b5452c') + P(`M${50 + hr - 2} ${hy - 8} l10 4 l-8 4Z`, '#b5452c');
    if (x.includes('tricorn')) s += P(`M22 ${hy - 10} Q50 ${hy - 2} 78 ${hy - 10} Q70 ${hy - 34} 50 ${hy - 32} Q30 ${hy - 34} 22 ${hy - 10}Z`, '#2b1d12') + L(`M44 ${hy - 22} l12 0`, GOLD, 2);
    if (x.includes('helm')) s += P(`M${50 - hr - 2} ${hy - 2} Q${50 - hr} ${hy - hr - 10} 50 ${hy - hr - 10} Q${50 + hr} ${hy - hr - 10} ${50 + hr + 2} ${hy - 2} L${50 + hr - 6} ${hy - 6} L${50 - hr + 6} ${hy - 6}Z`, '#6b6f78');
    if (x.includes('crown')) s += P(`M38 ${hy - hr + 2} L38 ${hy - hr - 10} L44 ${hy - hr - 4} L50 ${hy - hr - 12} L56 ${hy - hr - 4} L62 ${hy - hr - 10} L62 ${hy - hr + 2}Z`, GOLD);
    return s;
  }
  function humanoid(a) {
    const x = a.x || []; const sm = x.includes('small'); const c1 = a.c1, c2 = a.c2;
    let torso = x.includes('robe') ? P('M22 100 Q24 66 38 60 Q50 66 62 60 Q76 66 78 100Z', c2) : P('M18 100 Q20 70 36 63 Q50 67 64 63 Q80 70 82 100Z', c2);
    if (x.includes('coat')) torso += P('M22 100 Q24 70 38 62 L44 100Z', shade(c2, -25)) + P('M78 100 Q76 70 62 62 L56 100Z', shade(c2, -25)) + C(50, 78, 2, GOLD) + C(50, 86, 2, GOLD);
    if (x.includes('bell')) torso += P('M42 80 Q42 70 50 70 Q58 70 58 80 L61 86 L39 86Z', '#b08a3a') + C(50, 88, 2.5, '#7a5a1a');
    const back = x.includes('tail') ? P('M62 84 Q86 82 88 64 Q90 58 86 60 Q82 76 60 78Z', shade(c1, -15)) : '';
    return rig({ skin: c1, sleeve: c2, build: sm ? 0 : 1, head: humanoidHead(a, sm ? 46 : 42, sm ? 16 : 17), torso, back, main: a.w, off: a.off, small: sm ? .86 : null, handKind: x.includes('claws') ? 'claw' : null, offColor: a.offColor });
  }
  function brute(a) {
    const x = a.x || []; const c1 = a.c1, c2 = a.c2;
    let torso = P('M8 100 Q6 62 30 52 Q50 58 70 52 Q94 62 92 100Z', x.includes('fur') ? c1 : c2);
    if (x.includes('belly')) torso += E(50, 88, 22, 15, shade(c1, 20));
    if (x.includes('feathers')) torso += P(blob(50, 72, 30, 24, 4, 9), shade(c2, -10));
    let head = '';
    if (x.includes('ears')) head += C(30, 22, 7, shade(c1, -15)) + C(70, 22, 7, shade(c1, -15));
    head += P(blob(50, 36, 22, 18, 1.5, 6), c1);
    if (x.includes('beak')) head += P(blob(50, 34, 16, 16, 2, 2), c2) + P('M42 40 L50 58 L58 40 Q50 36 42 40Z', '#e8b04a');
    head += eyes(50, 32, 9, 3.2, a.eye);
    if (x.includes('tusks')) head += P('M38 50 l3 -10 l4 10Z', '#fff8ea') + P('M55 50 l4 -10 l3 10Z', '#fff8ea');
    if (!x.includes('beak')) head += L('M40 46 Q50 52 60 46', '#1a1a1a', 2.5);
    return rig({ skin: c1, sleeve: c1, build: 3, armW: 12, handR: 7.5, head, torso, main: a.w, handKind: a.w ? null : 'claw' });
  }
  function beast(a) {
    const x = a.x || []; const c1 = a.c1, c2 = a.c2; let s = ''; const big = x.includes('big'); const thin = x.includes('thin');
    if (x.includes('tail')) s += thin ? L('M18 70 Q2 72 4 52', shade(c2, -20), 3.5) : P('M22 66 Q4 60 6 42 Q14 56 26 58Z', c1);
    s += E(46, 70, big ? 32 : 27, big ? 18 : 15, c1);
    s += P('M24 76 L20 98 L28 98 L32 80Z', shade(c1, -20)) + P('M60 78 L58 98 L66 98 L68 78Z', shade(c1, -20)) + P('M34 80 L32 98 L40 98 L42 82Z', c1) + P('M68 76 L72 98 L80 98 L74 74Z', c1);
    s += P('M32 98 l2 -3 l2 3 M72 98 l2 -3 l2 3 l2 -3 l2 3', 'none', 'fill="none" stroke="#fff8ea" stroke-width="1.4"');
    s += E(46, 76, 18, 6, c2, 'opacity=".7"');
    s += P(blob(74, 54, big ? 17 : 15, 14, 1, 7), c1);
    if (x.includes('snout')) s += P('M80 56 L98 62 L96 68 L80 68Z', c1) + C(96, 63, 2.2, '#1a1a1a');
    else s += E(86, 60, 7, 5, shade(c1, -10)) + C(91, 59, 1.6, '#1a1a1a');
    if (x.includes('ears')) s += P('M66 44 L64 28 L74 40Z', shade(c1, -15)) + P('M76 40 L80 26 L84 42Z', shade(c1, -15));
    s += C(76, 50, 3.6, '#1a1a1a') + C(76, 50, 2.4, a.eye) + C(75.3, 49.2, .8, '#fff');
    s += P('M84 68 L86 72 L88 68Z', '#fff8ea') + P('M90 68 L91.5 71 L93 68Z', '#fff8ea');
    return s;
  }
  function skeleton(a) {
    const b = a.c1; let torso = P('M48 56 h4 v30 h-4Z', b);
    for (let i = 0; i < 4; i++) torso += L(`M38 ${60 + i * 5} Q50 ${57 + i * 5} 62 ${60 + i * 5}`, b, 3);
    torso += L('M50 86 L40 100 M50 86 L60 100', b, 4) + P('M40 86 Q50 82 60 86 L58 90 L42 90Z', b);
    let head = P(blob(50, 36, 16, 14, 0.8, 3), b) + RC(42, 47, 16, 8, b, 'rx="2"') + C(44, 36, 4.5, '#1a1a1a') + C(56, 36, 4.5, '#1a1a1a') + C(44, 36, 1.8, a.eye) + C(56, 36, 1.8, a.eye) + P('M48 42 L50 46 L52 42Z', '#1a1a1a') + L('M44 50 v5 M48 50 v5 M52 50 v5 M56 50 v5', '#1a1a1a', 1.4);
    return rig({ skin: b, sleeve: b, armW: 3.4, handKind: 'bone', head, torso, main: a.w, off: a.off, offColor: '#7a6a5a' });
  }
  function zombie(a) {
    const x = a.x || []; let s = ''; const hunch = x.includes('hunch');
    s += P(`M20 100 Q22 ${hunch ? 66 : 70} 36 62 Q50 66 64 62 Q78 70 80 100Z`, a.c2);
    s += P('M20 100 L24 92 L28 100 L32 90 L36 100Z', a.c2) + P('M64 100 L68 90 L72 100 L76 92 L80 100Z', a.c2);
    s += L('M34 66 Q18 66 10 56', shade(a.c2, -10), 8) + L('M66 66 Q82 66 90 56', shade(a.c2, -10), 8);
    s += hand(9, 55, a.c1, null, { kind: x.includes('claws') ? 'claw' : 'fingers', thumb: -1 }) + hand(91, 55, a.c1, null, { kind: x.includes('claws') ? 'claw' : 'fingers', thumb: 1 });
    s += P(blob(hunch ? 46 : 50, hunch ? 46 : 42, 17, 15, 2.2, 8), a.c1);
    s += C(43, 40, 3.8, '#1a1a1a') + C(57, 41, 3, '#1a1a1a') + C(43, 40, 2, a.eye) + C(57, 41, 1.6, a.eye);
    s += L('M42 52 L45 49 L48 52 L51 49 L54 52 L57 49', '#1a1a1a', 2);
    if (x.includes('seaweed')) s += P('M36 30 Q30 46 36 58 Q34 44 40 32Z', '#3f5f3a') + P('M60 28 Q70 40 64 60 Q62 46 56 32Z', '#4f7a3a') + P('M30 64 Q26 80 32 94 Q34 80 36 66Z', '#3f5f3a');
    return s;
  }
  function spider(a) {
    let s = ''; const leg = (x1, y1, x2, y2, x3, y3) => P(`M${x1} ${y1} L${x2} ${y2} L${x3} ${y3}`, 'none', `fill="none" stroke="${a.c1}" stroke-width="4"`);
    [-1, 1].forEach((d) => { for (let i = 0; i < 4; i++) { const y = 56 + i * 6; s += leg(50 + d * 10, y, 50 + d * (28 + i * 2), y - 18 + i * 4, 50 + d * (40 - i), y + 22); } });
    s += E(50, 74, 20, 17, a.c1) + P('M44 66 L56 66 L52 82 L48 82Z', a.c2);
    s += P(blob(50, 52, 12, 12, 1, 3), shade(a.c1, 15));
    s += C(45, 50, 2.6, a.eye) + C(55, 50, 2.6, a.eye) + C(48, 46, 1.8, a.eye) + C(52, 46, 1.8, a.eye) + C(42, 46, 1.4, a.eye) + C(58, 46, 1.4, a.eye);
    s += L('M46 60 Q44 66 46 68 M54 60 Q56 66 54 68', '#e8e0d0', 2.5);
    return s;
  }
  function crab(a) {
    let s = ''; const c1 = a.c1;
    for (let i = 0; i < 3; i++) s += L(`M30 ${72 + i * 5} L14 ${80 + i * 7}`, shade(c1, -20), 4) + L(`M70 ${72 + i * 5} L86 ${80 + i * 7}`, shade(c1, -20), 4);
    s += L('M26 66 Q14 50 18 36', c1, 6) + L('M74 66 Q86 50 82 36', c1, 6);
    s += P('M10 36 Q14 18 26 24 L22 34 Q18 30 16 38Z', c1) + P('M90 36 Q86 18 74 24 L78 34 Q82 30 84 38Z', c1);
    s += P('M18 72 Q20 50 50 48 Q80 50 82 72 Q66 84 50 84 Q34 84 18 72Z', c1) + L('M28 66 Q50 58 72 66', shade(c1, 30), 2.5);
    s += L('M42 52 L40 40 M58 52 L60 40', shade(c1, -20), 2.5) + C(40, 38, 3.6, '#1a1a1a') + C(60, 38, 3.6, '#1a1a1a') + C(39, 37, 1.2, '#fff') + C(59, 37, 1.2, '#fff');
    return s;
  }
  function ooze(a) { return P('M12 96 Q8 70 26 60 Q30 34 50 34 Q72 34 76 58 Q94 66 90 96Z', a.c1, 'opacity=".95"') + L('M28 70 Q32 56 42 58', '#fff', 3) + C(40, 60, 5, '#fff', 'opacity=".25"') + C(64, 76, 7, '#fff', 'opacity=".2"') + C(44, 52, 3.4, '#1a1a1a') + C(58, 54, 3.4, '#1a1a1a') + C(44, 52, 1.6, a.eye) + C(58, 54, 1.6, a.eye); }
  function ghost(a) { return P('M22 96 Q20 30 50 22 Q80 30 78 96 L70 86 L62 96 L54 86 L46 96 L38 86 L30 96Z', a.c1, 'opacity=".92"') + P('M22 60 Q10 54 8 64 Q16 66 24 70Z', a.c1, 'opacity=".9"') + P('M78 60 Q90 54 92 64 Q84 66 76 70Z', a.c1, 'opacity=".9"') + hand(8, 64, a.c1, null, { kind: 'claw' }) + hand(92, 64, a.c1, null, { kind: 'claw' }) + E(41, 46, 5, 7, '#000') + E(59, 46, 5, 7, '#000') + C(41, 46, 2.2, a.eye) + C(59, 46, 2.2, a.eye) + E(50, 64, 5, 7, '#000', 'opacity=".8"'); }
  function wisp(a) { return C(50, 50, 30, a.c2, 'opacity=".25"') + C(50, 50, 20, a.c2, 'opacity=".45"') + P(blob(50, 50, 13, 14, 2, 4), a.c1) + C(46, 47, 2, '#2b3a5a') + C(54, 47, 2, '#2b3a5a') + L('M44 80 Q50 92 46 98 M56 80 Q50 92 56 98', a.c1, 2); }
  function winged(a) {
    const x = a.x || []; const dragon = x.includes('dragon'); let s = '';
    s += P('M48 56 Q16 22 2 34 Q14 40 10 52 Q22 50 24 62 Q34 56 46 66Z', a.c2) + P('M52 56 Q84 22 98 34 Q86 40 90 52 Q78 50 76 62 Q66 56 54 66Z', a.c2);
    if (dragon) { s += P('M54 82 Q80 90 92 74 Q88 86 70 94 Q60 96 52 90Z', a.c1) + E(50, 72, 16, 18, a.c1) + E(50, 76, 9, 12, shade(a.c1, 40)) + hand(36, 86, a.c1, null, { kind: 'claw' }) + hand(64, 86, a.c1, null, { kind: 'claw' }) + P(blob(50, 42, 15, 14, 1, 5), a.c1) + P('M42 48 L50 62 L58 48Z', a.c1) + P('M38 32 L32 18 L44 28Z', '#e8e0d0') + P('M62 32 L68 18 L56 28Z', '#e8e0d0') + eyes(50, 40, 6, 2.6, a.eye) + L('M46 56 l2 3 l2 -3 M50 56 l2 3 l2 -3', '#fff', 1.4); }
    else { s += P('M36 96 Q36 66 50 62 Q64 66 64 96Z', a.c1) + hand(38, 97, '#d9a62e', null, { kind: 'claw', r: 4 }) + hand(62, 97, '#d9a62e', null, { kind: 'claw', r: 4 }) + P(blob(50, 46, 14, 14, .8, 6), '#e0b48a') + P('M34 46 Q34 24 50 26 Q66 24 66 46 Q60 32 50 34 Q40 32 34 46Z', '#4a2c17') + P('M36 44 Q30 66 36 74 L40 48Z', '#4a2c17') + P('M64 44 Q70 66 64 74 L60 48Z', '#4a2c17') + eyes(50, 46, 5.5, 2.2, a.eye) + L('M45 54 Q50 52 55 54', '#8a2f1c', 2); }
    return s;
  }
  function mimic(a) {
    let s = P('M14 56 L86 56 L86 94 L14 94Z', a.c1) + P('M14 60 h72 v5 h-72Z M14 84 h72 v5 h-72Z', shade(a.c1, -30));
    s += P('M12 56 Q12 22 50 22 Q88 22 88 56Z', shade(a.c1, 15)) + RC(12, 50, 76, 5, GOLD);
    s += P('M16 56 L22 66 L28 56 L34 66 L40 56 L46 66 L52 56 L58 66 L64 56 L70 66 L76 56 L82 66 L86 56Z', '#fff8ea') + P('M18 50 L24 42 L30 50 L36 42 L42 50 L48 42 L54 50 L60 42 L66 50 L72 42 L78 50 L84 42 L86 50Z', '#fff8ea');
    s += P('M40 60 Q50 90 62 72 Q70 64 60 62Z', '#c2453c') + C(34, 36, 5, '#1a1a1a') + C(66, 36, 5, '#1a1a1a') + C(34, 36, 2.6, a.eye) + C(66, 36, 2.6, a.eye);
    s += L('M14 80 Q4 86 6 96', '#8a5a2b', 5) + hand(6, 96, '#a06a35', null, { kind: 'claw', r: 4 });
    return s;
  }
  function priestess(a) {
    let torso = P('M12 100 Q14 60 34 52 Q50 58 66 52 Q86 60 88 100Z', a.c2) + P('M18 100 L22 88 L26 100 L30 86 L34 100 L66 100 L70 86 L74 100 L78 88 L82 100Z', shade(a.c2, -20)) + P('M42 70 Q42 60 50 60 Q58 60 58 70 L60 76 L40 76Z', '#b08a3a', 'opacity=".9"');
    let head = P('M28 38 Q26 70 34 84 Q36 60 38 42Z', '#3f5f3a') + P('M72 38 Q74 70 66 84 Q64 60 62 42Z', '#3f5f3a') + P(blob(50, 38, 16, 16, 1, 3), a.c1) + eyes(50, 38, 6, 2.6, a.eye) + L('M44 48 Q50 45 56 48', '#1a1a1a', 2) + P('M30 22 Q30 2 50 2 Q70 2 70 22 L74 30 L26 30Z', '#b08a3a') + RC(26, 30, 48, 4, '#7a5a1a') + C(50, 34, 3, '#7a5a1a');
    return rig({ skin: a.c1, sleeve: a.c2, build: 2, head, torso, main: 'bellstaff', handKind: 'claw' });
  }
  function swarm(a) {
    let s = ''; const rat = (x, y, k) => E(x, y, 10 * k, 6 * k, a.c1) + C(x + 9 * k, y - 2 * k, 5 * k, a.c1) + C(x + 11 * k, y - 3 * k, 1.4 * k, a.eye) + L(`M${x - 10 * k} ${y} Q${x - 20 * k} ${y - 2 * k} ${x - 22 * k} ${y - 8 * k}`, '#d9a3a0', 2 * k);
    s += rat(28, 86, 1) + rat(70, 88, 1) + rat(50, 94, 1.1) + rat(22, 70, .9) + rat(76, 72, .9);
    s += E(50, 66, 22, 15, shade(a.c1, -10)) + C(66, 58, 11, shade(a.c1, -10)) + C(70, 55, 2.6, a.eye) + C(62, 55, 2.6, a.eye) + P('M56 46 L56 36 L61 42 L66 33 L71 42 L76 36 L76 46Z', GOLD);
    s += G('translate(30 72) rotate(-30)', W.sickle.draw()) + hand(30, 72, a.c1, null, { kind: 'claw', r: 4 });
    return s;
  }
  const ARCH = { humanoid, brute, beast, skeleton, zombie, spider, crab, ooze, ghost, wisp, winged, mimic, priestess, swarm };
  // weapon picks for monsters (what they actually attack with)
  const MON_GEAR = { kobold: ['spear'], goblin: ['scimitar', 'shield_round'], goblin_boss: ['scimitar', 'shield_round'], bandit: ['scimitar'], smuggler: ['cutlass', 'dagger'], mara_vex: ['cutlass', 'dagger'], cultist: ['sickle'], cult_fanatic: ['dagger', 'orb'],
    skeleton: ['shortsword', 'shield_round'], sahuagin: ['trident'], orc: ['greataxe'], hobgoblin: ['longsword', 'shield_heater'], bugbear: ['morningstar'], gnoll: ['spear', 'shield_round'], ogre: ['greatclub'] };
  function monsterSVG(key, size, opts = {}) {
    const M = root.RULES.BESTIARY[key]; const art0 = (M && M.art) || { a: 'humanoid', c1: '#888', c2: '#555', eye: '#f00' };
    const g = MON_GEAR[key] || []; const art = Object.assign({}, art0, { w: opts.main || art0.w || g[0], off: opts.off || art0.off || g[1] });
    const f = ARCH[art.a] || humanoid;
    return wrap(f(art), size, { flip: opts.flip });
  }

  // ======================= PROPS =======================
  function propSVG(type, size, opts = {}) {
    let s = '';
    if (type === 'chest') { const o = opts.opened; s += P('M16 52 L84 52 L84 88 L16 88Z', '#8a5a2b') + P('M16 60 h68 v5 h-68Z M16 78 h68 v5 h-68Z', '#5a3a1f'); s += o ? P('M14 52 Q20 22 50 20 Q80 22 86 52 L80 54 Q76 30 50 28 Q24 30 20 54Z', '#a06a35') + P('M22 52 L78 52 L76 60 L24 60Z', '#2b1d12') + C(40, 52, 4, GOLD) + C(52, 50, 3, GOLD) : P('M14 52 Q14 26 50 26 Q86 26 86 52Z', '#a06a35') + RC(44, 50, 12, 12, GOLD) + C(50, 55, 2, '#2b1d12'); }
    if (type === 'clue') s += P('M20 30 L74 22 L80 78 L26 86Z', '#f3e6cc') + L('M30 38 L68 33 M32 48 L70 43 M34 58 L64 54 M36 68 L60 65', '#8a6a3f', 3) + C(76, 26, 8, '#b5452c');
    if (type === 'shrine') s += P('M30 92 L70 92 L64 80 L36 80Z', '#9aa3ad') + P('M40 80 L40 44 L60 44 L60 80Z', '#c9ccd1') + C(50, 34, 13, '#ffd36b', 'opacity=".55"') + P('M50 22 L54 34 L50 44 L46 34Z', '#ffd36b');
    if (type === 'trap') s += P('M16 80 L50 66 L84 80 L50 94Z', '#5a3a1f') + P('M30 80 L34 60 L38 80 M46 82 L50 58 L54 82 M62 80 L66 60 L70 80', '#c9ccd1') + P('M44 36 L56 36 L50 18Z M48 40 h4 v4 h-4Z', '#b5452c');
    if (type === 'gate') s += P('M14 96 L14 30 Q50 6 86 30 L86 96Z', opts.open ? '#2b1d12' : '#4a4f57') + (opts.open ? '' : L('M26 96 V30 M38 96 V20 M50 96 V16 M62 96 V20 M74 96 V30', '#7b848e', 5) + C(50, 60, 6, GOLD));
    if (type === 'exit') s += P('M50 10 L86 46 L64 46 L64 90 L36 90 L36 46 L14 46Z', opts.locked ? '#8a6a3f' : '#f3e6cc') + P('M50 22 L74 46 L58 46 L58 82 L42 82 L42 46 L26 46Z', opts.locked ? '#6b5847' : GOLD);
    if (type === 'npcmark') s += C(50, 50, 30, opts.color || GOLD) + P(opts.q ? 'M40 38 Q40 24 52 24 Q64 26 62 38 Q60 46 52 48 L52 58 L46 58 L46 44 Q56 42 56 37 Q55 31 51 31 Q46 31 46 38Z M46 64 h7 v7 h-7Z' : 'M46 24 h8 v34 h-8Z M46 64 h8 v8 h-8Z', '#2b1d12');
    if (type === 'weapon') { const D = W[weaponKey(opts.key)]; if (D) s += G('translate(50 78) rotate(30) scale(1.1)', D.draw(opts.plus, opts.color)); }
    return wrap(s, size);
  }

  const imgCache = {};
  function toImg(svg) { if (imgCache[svg]) return imgCache[svg]; const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); imgCache[svg] = img; img.onload = () => { if (root.ART.onload) root.ART.onload(); }; return img; }
  const memos = [];
  const memo = (fn) => { const m = new Map(); memos.push(m); return (...a) => { const k = JSON.stringify(a); let v = m.get(k); if (!v) { v = fn(...a); m.set(k, v); if (m.size > 800) m.clear(); } return v; }; };
  function setStyle(s) { Object.assign(STYLE, s || {}); memos.forEach(m => m.clear()); }
  root.ART = { heroSVG: memo(heroSVG), npcSVG: memo(npcSVG), monsterSVG: memo(monsterSVG), propSVG: memo(propSVG), toImg, shade, setStyle, STYLE, WEAPONS: W, weaponKey, HAIR_STYLES, BEARDS, HEADGEAR, ROLES: Object.keys(ROLES), roleGuess: ROLE_GUESS, MARKS: ['none', 'freckles', 'scar', 'eyepatch', 'warpaint', 'glasses', 'tattoo'] };
})(window);
