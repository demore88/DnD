// Paper-cut SVG art: heroes, NPCs, monsters, and map props. All drawn in a 100x100 box.
(function (root) {
  let fid = 0;
  const shade = (hex, amt) => { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt; r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b)); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); };
  function hstr(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function wrap(inner, size, opts = {}) {
    const id = 'p' + hstr(inner + (opts.flip ? 'f' : ''));
    const flip = opts.flip ? ' transform="translate(100,0) scale(-1,1)"' : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size || 100}" height="${size || 100}"><defs><filter id="${id}" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="1.6" dy="2.2" stdDeviation="0.3" flood-color="#2b1d12" flood-opacity=".45"/></filter></defs><g filter="url(#${id})" stroke-linejoin="round"${flip}>${inner}</g></svg>`;
  }
  // slightly jagged ("scissor cut") circle
  function blob(cx, cy, r, n, j, seed) { let d = ''; seed = seed || 1; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const rr = r + Math.sin(i * 7.3 + seed * 3.1) * j; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); } return d + 'Z'; }
  const P = (d, fill, extra = '') => /fill=/.test(extra) ? `<path d="${d}" ${extra}/>` : `<path d="${d}" fill="${fill}" ${extra}/>`;
  const C = (x, y, r, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
  const E = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;

  // ---------------- heroes & NPCs ----------------
  function face(skin, opts = {}) {
    const eye = opts.eye || '#2b1d12'; const y = opts.y || 44; const cx = 50;
    let s = '';
    s += P(blob(cx, y, opts.r || 19, 18, 0.8, 2), skin);
    if (opts.cheeks !== false) { s += C(cx - 11, y + 6, 3.2, '#e8836b', 'opacity=".35"'); s += C(cx + 11, y + 6, 3.2, '#e8836b', 'opacity=".35"'); }
    s += E(cx - 7, y + 1, 2.8, 3.4, '#fff8ea') + E(cx + 7, y + 1, 2.8, 3.4, '#fff8ea') + C(cx - 6.6, y + 1.6, 1.9, eye) + C(cx + 7.4, y + 1.6, 1.9, eye);
    s += P(`M${cx - 11} ${y - 5} L${cx - 3} ${y - 6.5}`, 'none', `stroke="${shade(opts.hair || '#2b1d12', -20)}" stroke-width="2.4" stroke-linecap="round"`);
    s += P(`M${cx + 3} ${y - 6.5} L${cx + 11} ${y - 5}`, 'none', `stroke="${shade(opts.hair || '#2b1d12', -20)}" stroke-width="2.4" stroke-linecap="round"`);
    s += P(opts.frown ? `M${cx - 5} ${y + 11} Q${cx} ${y + 8} ${cx + 5} ${y + 11}` : `M${cx - 5} ${y + 9} Q${cx} ${y + 13} ${cx + 5} ${y + 9}`, 'none', 'stroke="#2b1d12" stroke-width="2.2" stroke-linecap="round"');
    return s;
  }
  function hairFor(style, hair) {
    const H = [
      P('M30 42 Q31 22 50 21 Q69 22 70 42 Q63 31 50 32 Q37 31 30 42Z', hair),
      P('M28 46 Q27 19 50 19 Q73 19 72 46 L74 68 Q68 58 68 42 Q50 33 32 42 Q32 58 26 68Z', hair),
      P('M31 36 L36 17 L43 30 L50 13 L57 30 L64 17 L69 36 Q50 28 31 36Z', hair),
      C(50, 19, 8, hair) + P('M30 40 Q32 23 50 23 Q68 23 70 40 Q50 30 30 40Z', hair),
      P('M29 44 Q28 21 50 20 Q72 21 71 44 Q66 30 58 31 Q54 25 50 30 Q44 25 40 31 Q33 31 29 44Z', hair)
    ];
    return H[(style || 0) % H.length];
  }
  function body(cloak, trim) {
    return P('M14 100 Q15 70 34 64 Q50 70 66 64 Q85 70 86 100Z', cloak) + P('M40 64 L50 80 L60 64 Q50 68 40 64Z', trim || '#f3e6cc', 'opacity=".9"');
  }
  function heroSVG(look, cls, race, size, opts = {}) {
    look = look || {}; const skin0 = look.skin || '#e0b48a'; const hair = look.hair || '#4a2c17'; const cloak = look.cloak || '#5b6f86';
    let skin = skin0; let s = '';
    const small = race === 'Halfling' || race === 'Gnome';
    if (race === 'Dragonborn') skin = look.scale || shade(cloak, 40);
    s += body(cloak, cls === 'Cleric' || cls === 'Paladin' ? '#f3e6cc' : shade(cloak, 50));
    // class body gear
    if (cls === 'Fighter' || cls === 'Paladin') s += P('M18 76 Q24 62 36 64 L34 78Z', '#9aa3ad') + P('M82 76 Q76 62 64 64 L66 78Z', '#9aa3ad');
    if (cls === 'Barbarian') s += P(blob(50, 68, 22, 22, 3, 5).replace('Z', '') + 'Z', '#7a5a3a', 'opacity=".95"');
    if (cls === 'Cleric') s += P('M47 82 h6 v4 h4 v5 h-4 v8 h-6 v-8 h-4 v-5 h4Z', '#d9a62e');
    if (cls === 'Paladin') s += P('M44 80 L56 80 L56 90 Q50 96 44 90Z', '#d9a62e');
    if (cls === 'Ranger') s += P('M70 58 L80 50 L84 54 L74 66Z', '#6b4a2b') + P('M76 46 l2 -6 l2 6Z', '#e8e0d0');
    if (cls === 'Bard') s += P('M68 62 L84 44 L87 47 L72 66Z', '#8a5a2b') + C(84, 44, 3, '#d9a62e');
    if (cls === 'Warlock') s += C(50, 86, 4, '#9b6bd1') + C(50, 86, 1.6, '#fff');
    if (cls === 'Sorcerer') s += P('M76 86 Q80 76 84 86 Q86 92 80 94 Q74 92 76 86Z', '#ff8a3d') + P('M78 88 Q80 82 82 88 Q82 91 80 92 Q78 91 78 88Z', '#ffd36b');
    if (cls === 'Wizard') s += P('M78 98 L82 56 L85 56 L82 98Z', '#6b4a2b') + C(83.5, 54, 4, '#6fb7ff');
    if (cls === 'Monk') s += P('M38 70 Q50 76 62 70 L62 73 Q50 79 38 73Z', '#b5452c');
    if (cls === 'Rogue') s += P('M30 74 L40 66 L42 68 L33 77Z', '#c9ccd1');
    if (cls === 'Druid') s += P('M36 70 Q42 64 46 72 Q40 74 36 70Z', '#4f8a3a') + P('M54 72 Q58 64 64 70 Q60 74 54 72Z', '#4f8a3a');
    // head
    const hy = small ? 46 : 44; const hr = small ? 18 : 19;
    if (race === 'Elf' || race === 'Half-Elf') { const l = race === 'Elf' ? 15 : 9; s += P(`M33 ${hy - 2} L${33 - l} ${hy - 8} L34 ${hy + 6}Z`, shade(skin, -10)) + P(`M67 ${hy - 2} L${67 + l} ${hy - 8} L66 ${hy + 6}Z`, shade(skin, -10)); }
    if (race === 'Gnome' || race === 'Halfling') { s += C(31, hy + 2, 5, shade(skin, -10)) + C(69, hy + 2, 5, shade(skin, -10)); }
    s += face(skin, { y: hy, r: hr, hair, eye: race === 'Tiefling' ? '#ffd36b' : race === 'Dragonborn' ? '#d9a62e' : undefined, cheeks: race !== 'Dragonborn' });
    if (race === 'Dragonborn') { s += P(`M38 ${hy + 6} Q50 ${hy + 20} 62 ${hy + 6} Q50 ${hy + 12} 38 ${hy + 6}Z`, shade(skin, -18)); s += P(`M36 ${hy - 14} L30 ${hy - 26} L42 ${hy - 17}Z`, '#e8e0d0') + P(`M64 ${hy - 14} L70 ${hy - 26} L58 ${hy - 17}Z`, '#e8e0d0'); }
    if (race === 'Gnome') s += E(50, hy + 5, 4, 3.5, shade(skin, -18));
    if (race === 'Half-Orc') s += P(`M42 ${hy + 10} l2 -5 l2 5Z`, '#fff8ea') + P(`M54 ${hy + 10} l2 -5 l2 5Z`, '#fff8ea');
    // hair / beard
    const hatted = ['Wizard', 'Rogue', 'Ranger', 'Warlock', 'Fighter', 'Paladin', 'Bard'].includes(cls) && opts.gear !== false;
    if (race === 'Dwarf') s += P(`M34 ${hy + 4} Q36 ${hy + 32} 50 ${hy + 34} Q64 ${hy + 32} 66 ${hy + 4} Q60 ${hy + 14} 50 ${hy + 14} Q40 ${hy + 14} 34 ${hy + 4}Z`, hair) + P(`M44 ${hy + 9} Q50 ${hy + 12} 56 ${hy + 9}`, 'none', 'stroke="#2b1d12" stroke-width="2" stroke-linecap="round"');
    if (!hatted && race !== 'Dragonborn') s += hairFor(look.hairStyle, hair);
    if (race === 'Tiefling') s += P(`M35 ${hy - 12} Q22 ${hy - 22} 28 ${hy - 34} Q30 ${hy - 22} 40 ${hy - 16}Z`, '#5a3a6b') + P(`M65 ${hy - 12} Q78 ${hy - 22} 72 ${hy - 34} Q70 ${hy - 22} 60 ${hy - 16}Z`, '#5a3a6b');
    // headgear
    if (opts.gear !== false) {
      if (cls === 'Wizard') s += P('M26 34 Q50 40 74 34 L70 30 Q50 34 30 30Z', '#2f5b9a') + P('M32 31 Q48 -6 62 6 Q56 10 66 31Z', '#2f5b9a') + C(46, 20, 1.6, '#ffd36b') + C(55, 26, 1.2, '#ffd36b');
      if (cls === 'Fighter') s += P(`M29 ${hy - 2} Q29 ${hy - 26} 50 ${hy - 26} Q71 ${hy - 26} 71 ${hy - 2} L64 ${hy - 4} L64 ${hy - 8} L36 ${hy - 8} L36 ${hy - 4}Z`, '#9aa3ad') + P(`M48 ${hy - 8} h4 v12 h-4Z`, '#7b848e');
      if (cls === 'Paladin') s += P(`M29 ${hy - 3} Q29 ${hy - 26} 50 ${hy - 26} Q71 ${hy - 26} 71 ${hy - 3} L64 ${hy - 7} L36 ${hy - 7}Z`, '#c9ccd1') + P(`M47 ${hy - 26} L50 ${hy - 36} L53 ${hy - 26}Z`, '#d9a62e') + P(`M32 ${hy - 9} h36 v3 h-36Z`, '#d9a62e');
      if (cls === 'Rogue') s += P(`M26 ${hy + 4} Q26 ${hy - 28} 50 ${hy - 28} Q74 ${hy - 28} 74 ${hy + 4} Q68 ${hy - 12} 50 ${hy - 13} Q32 ${hy - 12} 26 ${hy + 4}Z`, '#3b3b46') + P(`M34 ${hy + 6} Q50 ${hy + 14} 66 ${hy + 6} L64 ${hy + 16} Q50 ${hy + 21} 36 ${hy + 16}Z`, '#3b3b46');
      if (cls === 'Ranger') s += P(`M26 ${hy + 4} Q26 ${hy - 28} 50 ${hy - 30} Q74 ${hy - 28} 74 ${hy + 4} Q68 ${hy - 12} 50 ${hy - 13} Q32 ${hy - 12} 26 ${hy + 4}Z`, '#3f6b4a');
      if (cls === 'Warlock') s += P(`M24 ${hy + 8} Q24 ${hy - 30} 50 ${hy - 32} Q76 ${hy - 30} 76 ${hy + 8} Q68 ${hy - 12} 50 ${hy - 13} Q32 ${hy - 12} 24 ${hy + 8}Z`, '#2a1d3a') + C(50, hy - 20, 2.5, '#9b6bd1');
      if (cls === 'Bard') s += P(`M28 ${hy - 10} Q50 ${hy - 30} 72 ${hy - 10} Q50 ${hy - 16} 28 ${hy - 10}Z`, '#8a4fa3') + P(`M60 ${hy - 18} Q78 ${hy - 40} 84 ${hy - 30} Q72 ${hy - 26} 64 ${hy - 14}Z`, '#d9a62e');
      if (cls === 'Cleric') s += P(`M33 ${hy - 13} Q50 ${hy - 20} 67 ${hy - 13} L66 ${hy - 10} Q50 ${hy - 16} 34 ${hy - 10}Z`, '#d9a62e') + C(50, hy - 16, 2.5, '#fff8ea');
      if (cls === 'Druid') s += P(`M36 ${hy - 14} L30 ${hy - 30} L36 ${hy - 24} L38 ${hy - 34} L41 ${hy - 18}Z`, '#8a5a2b') + P(`M64 ${hy - 14} L70 ${hy - 30} L64 ${hy - 24} L62 ${hy - 34} L59 ${hy - 18}Z`, '#8a5a2b');
      if (cls === 'Monk') s += P(`M31 ${hy - 8} Q50 ${hy - 14} 69 ${hy - 8} L69 ${hy - 4} Q50 ${hy - 10} 31 ${hy - 4}Z`, '#b5452c');
      if (cls === 'Barbarian') { s += P(`M38 ${hy + 2} l4 -2 M58 ${hy + 2} l4 -2`, 'none', 'stroke="#b5452c" stroke-width="2.5"'); }
    }
    if (opts.npc && opts.role) s += '';
    return wrap(s, size);
  }

  // ---------------- monsters ----------------
  const eyes = (x, y, gap, r, col) => C(x - gap, y, r + 1.2, '#1a1a1a') + C(x + gap, y, r + 1.2, '#1a1a1a') + C(x - gap, y, r, col) + C(x + gap, y, r, col) + C(x - gap - r * .3, y - r * .3, r * .35, '#fff');
  function humanoid(a) {
    const x = a.x || []; const sm = x.includes('small'); const c1 = a.c1, c2 = a.c2; let s = '';
    const hy = sm ? 50 : 42, hr = sm ? 16 : 17;
    if (x.includes('tail')) s += P('M62 84 Q86 82 88 64 Q90 58 86 60 Q82 76 60 78Z', shade(c1, -15));
    if (x.includes('robe')) s += P('M22 100 Q24 66 38 60 Q50 66 62 60 Q76 66 78 100Z', c2);
    else s += P(`M${sm ? 26 : 20} 100 Q${sm ? 28 : 22} 70 38 ${sm ? 68 : 62} Q50 ${sm ? 72 : 66} 62 ${sm ? 68 : 62} Q${sm ? 72 : 78} 70 ${sm ? 74 : 80} 100Z`, c2);
    if (x.includes('coat')) s += P('M22 100 Q24 70 38 62 L44 100Z', shade(c2, -25)) + P('M78 100 Q76 70 62 62 L56 100Z', shade(c2, -25)) + C(50, 78, 2, '#d9a62e') + C(50, 86, 2, '#d9a62e');
    if (x.includes('bell')) s += P('M42 80 Q42 70 50 70 Q58 70 58 80 L61 86 L39 86Z', '#b08a3a') + C(50, 88, 2.5, '#7a5a1a');
    if (x.includes('fins')) s += P(`M34 ${hy - 6} L18 ${hy - 20} L24 ${hy + 2}Z`, c2) + P(`M66 ${hy - 6} L82 ${hy - 20} L76 ${hy + 2}Z`, c2) + P(`M44 ${hy - hr} L50 ${hy - hr - 14} L56 ${hy - hr}Z`, c2);
    if (x.includes('ears')) s += P(`M${50 - hr + 2} ${hy - 2} L${50 - hr - 16} ${hy - 12} L${50 - hr + 2} ${hy + 6}Z`, shade(c1, -12)) + P(`M${50 + hr - 2} ${hy - 2} L${50 + hr + 16} ${hy - 12} L${50 + hr - 2} ${hy + 6}Z`, shade(c1, -12));
    s += P(blob(50, hy, hr, 16, 1.2, 4), c1);
    if (x.includes('snout')) s += E(50, hy + 8, 9, 6.5, shade(c1, -18)) + C(46.5, hy + 7, 1.4, '#1a1a1a') + C(53.5, hy + 7, 1.4, '#1a1a1a');
    if (x.includes('brow')) s += P(`M36 ${hy - 6} L64 ${hy - 6} L62 ${hy - 2} L38 ${hy - 2}Z`, shade(c1, -25));
    if (x.includes('spots')) s += C(40, hy - 8, 2.5, shade(c1, -35)) + C(60, hy - 4, 2, shade(c1, -35)) + C(56, hy - 12, 1.8, shade(c1, -35));
    s += eyes(50, hy - 1, 6.5, 2.6, a.eye);
    if (x.includes('teeth')) s += P(`M40 ${hy + 9} Q50 ${hy + 14} 60 ${hy + 9} L58 ${hy + 13} L55 ${hy + 10} L52 ${hy + 14} L49 ${hy + 10} L46 ${hy + 14} L43 ${hy + 10}Z`, '#fff8ea');
    else if (!x.includes('snout')) s += P(`M43 ${hy + 9} Q50 ${hy + 6} 57 ${hy + 9}`, 'none', 'stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"');
    if (x.includes('tusks')) s += P(`M41 ${hy + 12} l2 -8 l3 8Z`, '#fff8ea') + P(`M54 ${hy + 12} l3 -8 l2 8Z`, '#fff8ea');
    if (x.includes('horns')) s += P(`M38 ${hy - 12} Q30 ${hy - 26} 36 ${hy - 30} Q36 ${hy - 20} 44 ${hy - 14}Z`, '#e8e0d0') + P(`M62 ${hy - 12} Q70 ${hy - 26} 64 ${hy - 30} Q64 ${hy - 20} 56 ${hy - 14}Z`, '#e8e0d0');
    if (x.includes('beard')) s += P(`M38 ${hy + 8} Q40 ${hy + 26} 50 ${hy + 28} Q60 ${hy + 26} 62 ${hy + 8} Q50 ${hy + 16} 38 ${hy + 8}Z`, '#4a2c17');
    if (x.includes('hood')) s += P(`M${50 - hr - 6} ${hy + 8} Q${50 - hr - 6} ${hy - hr - 12} 50 ${hy - hr - 14} Q${50 + hr + 6} ${hy - hr - 12} ${50 + hr + 6} ${hy + 8} Q${50 + hr} ${hy - 8} 50 ${hy - 9} Q${50 - hr} ${hy - 8} ${50 - hr - 6} ${hy + 8}Z`, x.includes('robe') ? c2 : shade(c2, -20));
    if (x.includes('mask')) s += P(`M34 ${hy + 4} Q50 ${hy + 10} 66 ${hy + 4} L64 ${hy + 14} Q50 ${hy + 18} 36 ${hy + 14}Z`, '#3b3b46');
    if (x.includes('bandana')) s += P(`M${50 - hr} ${hy - 6} Q50 ${hy - hr - 10} ${50 + hr} ${hy - 6} Q50 ${hy - 12} ${50 - hr} ${hy - 6}Z`, '#b5452c') + P(`M${50 + hr - 2} ${hy - 8} l10 4 l-8 4Z`, '#b5452c');
    if (x.includes('tricorn')) s += P(`M22 ${hy - 10} Q50 ${hy - 2} 78 ${hy - 10} Q70 ${hy - 34} 50 ${hy - 32} Q30 ${hy - 34} 22 ${hy - 10}Z`, '#2b1d12') + P(`M44 ${hy - 22} l12 0`, 'none', 'stroke="#d9a62e" stroke-width="2"');
    if (x.includes('helm')) s += P(`M${50 - hr - 2} ${hy - 2} Q${50 - hr} ${hy - hr - 10} 50 ${hy - hr - 10} Q${50 + hr} ${hy - hr - 10} ${50 + hr + 2} ${hy - 2} L${50 + hr - 6} ${hy - 6} L${50 - hr + 6} ${hy - 6}Z`, '#6b6f78');
    if (x.includes('crown')) s += P(`M38 ${hy - hr + 2} L38 ${hy - hr - 10} L44 ${hy - hr - 4} L50 ${hy - hr - 12} L56 ${hy - hr - 4} L62 ${hy - hr - 10} L62 ${hy - hr + 2}Z`, '#d9a62e');
    // weapon hint
    s += P('M80 92 L86 52 L89 52 L84 92Z', '#9aa3ad') + P('M78 66 h14 v3 h-14Z', '#6b4a2b');
    return s;
  }
  function brute(a) {
    const x = a.x || []; const c1 = a.c1, c2 = a.c2; let s = '';
    s += P('M10 100 Q8 64 30 54 Q50 60 70 54 Q92 64 90 100Z', x.includes('fur') ? c1 : c2);
    if (x.includes('belly')) s += E(50, 86, 22, 16, shade(c1, 20));
    if (x.includes('feathers')) s += P(blob(50, 70, 30, 24, 4, 9), shade(c2, -10));
    s += P('M8 72 Q2 88 12 98 L22 96 Q18 84 22 74Z', c1) + P('M92 72 Q98 88 88 98 L78 96 Q82 84 78 74Z', c1);
    if (x.includes('ears')) s += C(30, 22, 7, shade(c1, -15)) + C(70, 22, 7, shade(c1, -15));
    s += P(blob(50, 36, 22, 18, 1.5, 6), c1);
    if (x.includes('beak')) s += P('M42 40 L50 58 L58 40 Q50 36 42 40Z', '#e8b04a') + P(blob(50, 34, 16, 16, 2, 2), c2) ;
    s += eyes(50, 32, 9, 3.2, a.eye);
    if (x.includes('tusks')) s += P('M38 50 l3 -10 l4 10Z', '#fff8ea') + P('M55 50 l4 -10 l3 10Z', '#fff8ea');
    if (!x.includes('beak')) s += P('M40 46 Q50 52 60 46', 'none', 'stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"');
    return s;
  }
  function beast(a) {
    const x = a.x || []; const c1 = a.c1, c2 = a.c2; let s = ''; const big = x.includes('big'); const thin = x.includes('thin');
    if (x.includes('tail')) s += thin ? P('M18 70 Q2 72 4 52', 'none', `stroke="${shade(c2, -20)}" stroke-width="3.5" stroke-linecap="round" fill="none"`) : P('M22 66 Q4 60 6 42 Q14 56 26 58Z', c1);
    s += E(46, 70, big ? 32 : 27, big ? 18 : 15, c1);
    s += P('M24 76 L20 98 L28 98 L32 80Z', shade(c1, -20)) + P('M60 78 L58 98 L66 98 L68 78Z', shade(c1, -20)) + P('M34 80 L32 98 L40 98 L42 82Z', c1) + P('M68 76 L72 98 L80 98 L74 74Z', c1);
    s += E(46, 76, 18, 6, c2, 'opacity=".7"');
    // head
    s += P(blob(74, 54, big ? 17 : 15, 14, 1, 7), c1);
    if (x.includes('snout')) s += P('M80 56 L98 62 L96 68 L80 68Z', c1) + C(96, 63, 2.2, '#1a1a1a');
    else s += E(86, 60, 7, 5, shade(c1, -10)) + C(91, 59, 1.6, '#1a1a1a');
    if (x.includes('ears')) s += P('M66 44 L64 28 L74 40Z', shade(c1, -15)) + P('M76 40 L80 26 L84 42Z', shade(c1, -15));
    s += C(76, 50, 3.6, '#1a1a1a') + C(76, 50, 2.4, a.eye) + C(75.3, 49.2, .8, '#fff');
    s += P('M84 68 L86 72 L88 68Z', '#fff8ea') + P('M90 68 L91.5 71 L93 68Z', '#fff8ea');
    return s;
  }
  function skeleton(a) {
    const b = a.c1; let s = '';
    s += P('M48 54 h4 v28 h-4Z', b);
    for (let i = 0; i < 4; i++) s += P(`M38 ${58 + i * 5} Q50 ${55 + i * 5} 62 ${58 + i * 5}`, 'none', `stroke="${b}" stroke-width="3" stroke-linecap="round"`);
    s += P('M50 80 L38 98 M50 80 L62 98', 'none', `stroke="${b}" stroke-width="4" stroke-linecap="round"`);
    s += P('M38 58 L24 76 M62 58 L76 74', 'none', `stroke="${b}" stroke-width="3.5" stroke-linecap="round"`);
    s += P('M74 80 L84 44 L87 45 L78 80Z', '#9aa3ad');
    s += P(blob(50, 34, 16, 14, 0.8, 3), b) + P('M42 46 h16 v8 h-16Z', b);
    s += C(44, 34, 4.5, '#1a1a1a') + C(56, 34, 4.5, '#1a1a1a') + C(44, 34, 1.8, a.eye) + C(56, 34, 1.8, a.eye) + P('M48 40 L50 44 L52 40Z', '#1a1a1a');
    s += P('M44 48 v5 M48 48 v5 M52 48 v5 M56 48 v5', 'none', 'stroke="#1a1a1a" stroke-width="1.4"');
    return s;
  }
  function zombie(a) {
    const x = a.x || []; let s = ''; const hunch = x.includes('hunch');
    s += P(`M20 100 Q22 ${hunch ? 66 : 70} 36 62 Q50 66 64 62 Q78 70 80 100Z`, a.c2);
    s += P('M20 100 L24 92 L28 100 L32 90 L36 100Z', a.c2) + P('M64 100 L68 90 L72 100 L76 92 L80 100Z', a.c2);
    s += P('M30 66 Q14 66 8 58 L10 54 Q20 60 32 60Z', a.c1) + P('M70 66 Q86 66 92 58 L90 54 Q80 60 68 60Z', a.c1);
    if (x.includes('claws')) s += P('M6 56 l-4 -4 M8 54 l-2 -6 M10 54 l1 -6', 'none', 'stroke="#e8e0d0" stroke-width="2"') + P('M94 56 l4 -4 M92 54 l2 -6 M90 54 l-1 -6', 'none', 'stroke="#e8e0d0" stroke-width="2"');
    s += P(blob(hunch ? 46 : 50, hunch ? 46 : 42, 17, 15, 2.2, 8), a.c1);
    s += C(43, 40, 3.8, '#1a1a1a') + C(57, 41, 3, '#1a1a1a') + C(43, 40, 2, a.eye) + C(57, 41, 1.6, a.eye);
    s += P('M42 52 L45 49 L48 52 L51 49 L54 52 L57 49', 'none', 'stroke="#1a1a1a" stroke-width="2" fill="none"');
    if (x.includes('seaweed')) s += P('M36 30 Q30 46 36 58 Q34 44 40 32Z', '#3f5f3a') + P('M60 28 Q70 40 64 60 Q62 46 56 32Z', '#4f7a3a') + P('M30 64 Q26 80 32 94 Q34 80 36 66Z', '#3f5f3a');
    return s;
  }
  function spider(a) {
    let s = ''; const leg = (x1, y1, x2, y2, x3, y3) => P(`M${x1} ${y1} L${x2} ${y2} L${x3} ${y3}`, 'none', `stroke="${a.c1}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"`);
    [[-1, 0], [1, 0]].forEach(([d]) => { for (let i = 0; i < 4; i++) { const y = 56 + i * 6; s += leg(50 + d * 10, y, 50 + d * (28 + i * 2), y - 18 + i * 4, 50 + d * (40 - i), y + 22); } });
    s += E(50, 74, 20, 17, a.c1) + P('M44 66 L56 66 L52 82 L48 82Z', a.c2);
    s += P(blob(50, 52, 12, 12, 1, 3), shade(a.c1, 15));
    s += C(45, 50, 2.6, a.eye) + C(55, 50, 2.6, a.eye) + C(48, 46, 1.8, a.eye) + C(52, 46, 1.8, a.eye) + C(42, 46, 1.4, a.eye) + C(58, 46, 1.4, a.eye);
    s += P('M46 60 Q44 66 46 68 M54 60 Q56 66 54 68', 'none', 'stroke="#e8e0d0" stroke-width="2.5" stroke-linecap="round"');
    return s;
  }
  function crab(a) {
    let s = ''; const c1 = a.c1;
    for (let i = 0; i < 3; i++) { s += P(`M30 ${72 + i * 5} L14 ${80 + i * 7}`, 'none', `stroke="${shade(c1, -20)}" stroke-width="4" stroke-linecap="round"`) + P(`M70 ${72 + i * 5} L86 ${80 + i * 7}`, 'none', `stroke="${shade(c1, -20)}" stroke-width="4" stroke-linecap="round"`); }
    s += P('M26 66 Q14 50 18 36', 'none', `stroke="${c1}" stroke-width="6" stroke-linecap="round" fill="none"`) + P('M74 66 Q86 50 82 36', 'none', `stroke="${c1}" stroke-width="6" stroke-linecap="round" fill="none"`);
    s += P('M10 36 Q14 18 26 24 L22 34 Q18 30 16 38Z', c1) + P('M90 36 Q86 18 74 24 L78 34 Q82 30 84 38Z', c1);
    s += P('M18 72 Q20 50 50 48 Q80 50 82 72 Q66 84 50 84 Q34 84 18 72Z', c1) + P('M28 66 Q50 58 72 66', 'none', `stroke="${shade(c1, 30)}" stroke-width="2.5" fill="none"`);
    s += P('M42 52 L40 40 M58 52 L60 40', 'none', `stroke="${shade(c1, -20)}" stroke-width="2.5"`) + C(40, 38, 3.6, '#1a1a1a') + C(60, 38, 3.6, '#1a1a1a') + C(39, 37, 1.2, '#fff') + C(59, 37, 1.2, '#fff');
    return s;
  }
  function ooze(a) { let s = ''; s += P('M12 96 Q8 70 26 60 Q30 34 50 34 Q72 34 76 58 Q94 66 90 96Z', a.c1, 'opacity=".95"'); s += P('M28 70 Q32 56 42 58', 'none', 'stroke="#fff" stroke-width="3" opacity=".5" stroke-linecap="round" fill="none"'); s += C(40, 60, 5, '#fff', 'opacity=".25"') + C(64, 76, 7, '#fff', 'opacity=".2"'); s += C(44, 52, 3.4, '#1a1a1a') + C(58, 54, 3.4, '#1a1a1a') + C(44, 52, 1.6, a.eye) + C(58, 54, 1.6, a.eye); s += P('M20 96 Q22 100 24 96 M76 96 Q78 100 80 96', 'none', `stroke="${a.c2}" stroke-width="3"`); return s; }
  function ghost(a) { let s = ''; s += P('M22 96 Q20 30 50 22 Q80 30 78 96 L70 86 L62 96 L54 86 L46 96 L38 86 L30 96Z', a.c1, 'opacity=".92"'); s += P('M22 60 Q10 54 8 64 Q16 66 24 70Z', a.c1, 'opacity=".9"') + P('M78 60 Q90 54 92 64 Q84 66 76 70Z', a.c1, 'opacity=".9"'); s += E(41, 46, 5, 7, '#000') + E(59, 46, 5, 7, '#000') + C(41, 46, 2.2, a.eye) + C(59, 46, 2.2, a.eye); s += E(50, 64, 5, 7, '#000', 'opacity=".8"'); return s; }
  function wisp(a) { let s = ''; s += C(50, 50, 30, a.c2, 'opacity=".25"') + C(50, 50, 20, a.c2, 'opacity=".45"') + P(blob(50, 50, 13, 14, 2, 4), a.c1) + C(46, 47, 2, '#2b3a5a') + C(54, 47, 2, '#2b3a5a') + P('M44 80 Q50 92 46 98 M56 80 Q50 92 56 98', 'none', `stroke="${a.c1}" stroke-width="2" opacity=".6" fill="none"`); return s; }
  function winged(a) {
    const x = a.x || []; const dragon = x.includes('dragon'); let s = '';
    s += P('M48 56 Q16 22 2 34 Q14 40 10 52 Q22 50 24 62 Q34 56 46 66Z', a.c2) + P('M52 56 Q84 22 98 34 Q86 40 90 52 Q78 50 76 62 Q66 56 54 66Z', a.c2);
    if (dragon) { s += P('M54 82 Q80 90 92 74 Q88 86 70 94 Q60 96 52 90Z', a.c1); s += E(50, 72, 16, 18, a.c1) + E(50, 76, 9, 12, shade(a.c1, 40)); s += P(blob(50, 42, 15, 14, 1, 5), a.c1) + P('M42 48 L50 62 L58 48Z', a.c1) + P('M38 32 L32 18 L44 28Z', '#e8e0d0') + P('M62 32 L68 18 L56 28Z', '#e8e0d0'); s += eyes(50, 40, 6, 2.6, a.eye); s += P('M46 56 l2 3 l2 -3 M50 56 l2 3 l2 -3', 'none', 'stroke="#fff" stroke-width="1.4"'); }
    else { s += P('M36 96 Q36 66 50 62 Q64 66 64 96Z', a.c1) + P('M40 96 l-4 4 M44 96 l0 4 M56 96 l0 4 M60 96 l4 4', 'none', 'stroke="#d9a62e" stroke-width="2"'); s += P(blob(50, 46, 14, 14, .8, 6), '#e0b48a') + P('M34 46 Q34 24 50 26 Q66 24 66 46 Q60 32 50 34 Q40 32 34 46Z', '#4a2c17') + P('M36 44 Q30 66 36 74 L40 48Z', '#4a2c17') + P('M64 44 Q70 66 64 74 L60 48Z', '#4a2c17'); s += eyes(50, 46, 5.5, 2.2, a.eye); s += P('M45 54 Q50 52 55 54', 'none', 'stroke="#8a2f1c" stroke-width="2" fill="none"'); }
    return s;
  }
  function mimic(a) {
    let s = ''; s += P('M14 56 L86 56 L86 94 L14 94Z', a.c1) + P('M14 60 h72 v5 h-72Z M14 84 h72 v5 h-72Z', shade(a.c1, -30));
    s += P('M12 56 Q12 22 50 22 Q88 22 88 56Z', shade(a.c1, 15)) + P('M12 50 h76 v5 h-76Z', '#d9a62e');
    s += P('M16 56 L22 66 L28 56 L34 66 L40 56 L46 66 L52 56 L58 66 L64 56 L70 66 L76 56 L82 66 L86 56Z', '#fff8ea');
    s += P('M18 50 L24 42 L30 50 L36 42 L42 50 L48 42 L54 50 L60 42 L66 50 L72 42 L78 50 L84 42 L86 50Z', '#fff8ea');
    s += P('M40 60 Q50 90 62 72 Q70 64 60 62Z', '#c2453c');
    s += C(34, 36, 5, '#1a1a1a') + C(66, 36, 5, '#1a1a1a') + C(34, 36, 2.6, a.eye) + C(66, 36, 2.6, a.eye);
    return s;
  }
  function priestess(a) {
    let s = '';
    s += P('M12 100 Q14 60 34 52 Q50 58 66 52 Q86 60 88 100Z', a.c2) + P('M18 100 L22 88 L26 100 L30 86 L34 100 L66 100 L70 86 L74 100 L78 88 L82 100Z', shade(a.c2, -20));
    s += P('M30 56 Q4 60 2 40 Q12 48 26 46Z', a.c1) + P('M70 56 Q96 60 98 40 Q88 48 74 46Z', a.c1) + P('M2 40 l-2 -6 M4 40 l0 -8 M7 41 l2 -7', 'none', 'stroke="#d8ffef" stroke-width="2"') + P('M98 40 l2 -6 M96 40 l0 -8 M93 41 l-2 -7', 'none', 'stroke="#d8ffef" stroke-width="2"');
    s += P('M28 38 Q26 70 34 84 Q36 60 38 42Z', '#3f5f3a') + P('M72 38 Q74 70 66 84 Q64 60 62 42Z', '#3f5f3a');
    s += P(blob(50, 38, 16, 16, 1, 3), a.c1) + eyes(50, 38, 6, 2.6, a.eye) + P('M44 48 Q50 45 56 48', 'none', 'stroke="#1a1a1a" stroke-width="2" fill="none"');
    s += P('M30 22 Q30 2 50 2 Q70 2 70 22 L74 30 L26 30Z', '#b08a3a') + P('M26 30 h48 v4 h-48Z', '#7a5a1a') + C(50, 34, 3, '#7a5a1a');
    s += P('M42 70 Q42 60 50 60 Q58 60 58 70 L60 76 L40 76Z', '#b08a3a', 'opacity=".9"');
    return s;
  }
  function swarm(a) {
    let s = ''; const rat = (x, y, k) => E(x, y, 10 * k, 6 * k, a.c1) + C(x + 9 * k, y - 2 * k, 5 * k, a.c1) + C(x + 11 * k, y - 3 * k, 1.4 * k, a.eye) + P(`M${x - 10 * k} ${y} Q${x - 20 * k} ${y - 2 * k} ${x - 22 * k} ${y - 8 * k}`, 'none', `stroke="#d9a3a0" stroke-width="${2 * k}" fill="none"`);
    s += rat(28, 86, 1) + rat(70, 88, 1) + rat(50, 94, 1.1) + rat(22, 70, .9) + rat(76, 72, .9);
    s += E(50, 66, 22, 15, shade(a.c1, -10)) + C(66, 58, 11, shade(a.c1, -10)) + C(70, 55, 2.6, a.eye) + C(62, 55, 2.6, a.eye);
    s += P('M56 46 L56 36 L61 42 L66 33 L71 42 L76 36 L76 46Z', '#d9a62e');
    return s;
  }
  const ARCH = { humanoid, brute, beast, skeleton, zombie, spider, crab, ooze, ghost, wisp, winged, mimic, priestess, swarm };
  function monsterSVG(key, size, opts = {}) {
    const M = root.RULES.BESTIARY[key]; const art = (M && M.art) || { a: 'humanoid', c1: '#888', c2: '#555', eye: '#f00' };
    const f = ARCH[art.a] || humanoid;
    return wrap(f(art), size, { flip: opts.flip });
  }

  // ---------------- props ----------------
  function propSVG(type, size, opts = {}) {
    let s = '';
    if (type === 'chest') { const o = opts.opened; s += P('M16 52 L84 52 L84 88 L16 88Z', '#8a5a2b') + P('M16 60 h68 v5 h-68Z M16 78 h68 v5 h-68Z', '#5a3a1f'); s += o ? P('M14 52 Q20 22 50 20 Q80 22 86 52 L80 54 Q76 30 50 28 Q24 30 20 54Z', '#a06a35') + P('M22 52 L78 52 L76 60 L24 60Z', '#2b1d12') + C(40, 52, 4, '#d9a62e') + C(52, 50, 3, '#d9a62e') : P('M14 52 Q14 26 50 26 Q86 26 86 52Z', '#a06a35') + P('M44 50 h12 v12 h-12Z', '#d9a62e') + C(50, 55, 2, '#2b1d12'); }
    if (type === 'clue') s += P('M20 30 L74 22 L80 78 L26 86Z', '#f3e6cc') + P('M30 38 L68 33 M32 48 L70 43 M34 58 L64 54 M36 68 L60 65', 'none', 'stroke="#8a6a3f" stroke-width="3" stroke-linecap="round"') + C(76, 26, 8, '#b5452c');
    if (type === 'shrine') s += P('M30 92 L70 92 L64 80 L36 80Z', '#9aa3ad') + P('M40 80 L40 44 L60 44 L60 80Z', '#c9ccd1') + C(50, 34, 13, '#ffd36b', 'opacity=".55"') + P('M50 22 L54 34 L50 44 L46 34Z', '#ffd36b');
    if (type === 'trap') s += P('M16 80 L50 66 L84 80 L50 94Z', '#5a3a1f') + P('M30 80 L34 60 L38 80 M46 82 L50 58 L54 82 M62 80 L66 60 L70 80', '#c9ccd1') + P('M44 36 L56 36 L50 18Z M48 40 h4 v4 h-4Z', '#b5452c');
    if (type === 'gate') s += P('M14 96 L14 30 Q50 6 86 30 L86 96Z', opts.open ? '#2b1d12' : '#4a4f57') + (opts.open ? '' : P('M26 96 V30 M38 96 V20 M50 96 V16 M62 96 V20 M74 96 V30', 'none', 'stroke="#7b848e" stroke-width="5"') + C(50, 60, 6, '#d9a62e'));
    if (type === 'exit') { s += P('M50 10 L86 46 L64 46 L64 90 L36 90 L36 46 L14 46Z', opts.locked ? '#8a6a3f' : '#f3e6cc') + P('M50 22 L74 46 L58 46 L58 82 L42 82 L42 46 L26 46Z', opts.locked ? '#6b5847' : '#d9a62e'); }
    if (type === 'npcmark') s += C(50, 50, 30, opts.color || '#d9a62e') + P(opts.q ? 'M40 38 Q40 24 52 24 Q64 26 62 38 Q60 46 52 48 L52 58 L46 58 L46 44 Q56 42 56 37 Q55 31 51 31 Q46 31 46 38Z M46 64 h7 v7 h-7Z' : 'M46 24 h8 v34 h-8Z M46 64 h8 v8 h-8Z', '#2b1d12');
    return wrap(s, size);
  }

  const imgCache = {};
  function toImg(svg) { if (imgCache[svg]) return imgCache[svg]; const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); imgCache[svg] = img; img.onload = () => { if (root.ART.onload) root.ART.onload(); }; return img; }

  const memo = (fn) => { const m = new Map(); return (...a) => { const k = JSON.stringify(a); let v = m.get(k); if (!v) { v = fn(...a); m.set(k, v); if (m.size > 600) m.clear(); } return v; }; };
  root.ART = { heroSVG: memo(heroSVG), monsterSVG: memo(monsterSVG), propSVG: memo(propSVG), toImg, shade };
})(window);
