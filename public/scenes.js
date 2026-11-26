// Paper-cut scene illustrations: a layered landscape for every place theme, used on arrival cards and boss intros.
(function (root) {
  const W = 360, H = 150;
  let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const hashStr = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 2147483647; return h || 1; };
  const P = (d, fill, extra = "") => `<path d="${d}" ${/\bfill=/.test(extra) ? "" : `fill="${fill}"`} ${extra}/>`;
  const ridge = (y, amp, n, fill, jag) => { let d = `M0 ${H} L0 ${y}`; for (let i = 0; i <= n; i++) { const x = i * W / n; const yy = y - (jag ? (i % 2 ? amp : amp * 0.15) * (0.6 + rnd() * 0.6) : Math.sin(i * 1.3 + rnd() * 2) * amp * 0.5 + amp * 0.5 * rnd()); d += ` L${x.toFixed(1)} ${yy.toFixed(1)}`; } return P(d + ` L${W} ${H}Z`, fill); };
  const hills = (y, amp, fill) => { let d = `M0 ${H} L0 ${y}`; const n = 5; for (let i = 0; i < n; i++) { const x0 = i * W / n, x1 = (i + 1) * W / n; d += ` Q${(x0 + x1) / 2} ${y - amp * (0.5 + rnd())} ${x1} ${y + (rnd() - 0.5) * 8}`; } return P(d + ` L${W} ${H}Z`, fill); };
  const tree = (x, y, s, c) => P(`M${x} ${y - 34 * s} L${x - 12 * s} ${y - 8 * s} L${x - 5 * s} ${y - 8 * s} L${x - 15 * s} ${y + 6 * s} L${x + 15 * s} ${y + 6 * s} L${x + 5 * s} ${y - 8 * s} L${x + 12 * s} ${y - 8 * s}Z`, c) + P(`M${x - 2 * s} ${y + 6 * s} h${4 * s} v${8 * s} h${-4 * s}Z`, '#4a2c17');
  const round = (x, y, s, c) => `<circle cx="${x}" cy="${y - 16 * s}" r="${14 * s}" fill="${c}"/><circle cx="${x - 10 * s}" cy="${y - 8 * s}" r="${9 * s}" fill="${c}"/><circle cx="${x + 10 * s}" cy="${y - 9 * s}" r="${10 * s}" fill="${c}"/>` + P(`M${x - 2 * s} ${y - 4 * s} h${4 * s} v${14 * s} h${-4 * s}Z`, '#4a2c17');
  const house = (x, y, s, wall, roof) => P(`M${x - 14 * s} ${y} v${-16 * s} h${28 * s} v${16 * s}Z`, wall) + P(`M${x - 18 * s} ${y - 15 * s} L${x} ${y - 30 * s} L${x + 18 * s} ${y - 15 * s}Z`, roof) + `<rect x="${x - 4 * s}" y="${y - 9 * s}" width="${8 * s}" height="${9 * s}" fill="#4a2c17"/><rect x="${x + 6 * s}" y="${y - 13 * s}" width="${5 * s}" height="${5 * s}" fill="#ffd36b"/>`;
  const waves = (y, c, a = 0.8) => { let d = `M0 ${y}`; for (let x = 0; x <= W; x += 20) d += ` Q${x + 5} ${y - 4} ${x + 10} ${y} T${x + 20} ${y}`; return P(d + ` L${W} ${H} L0 ${H}Z`, c, `opacity="${a}"`); };
  const stars = (n, col = '#fff8d8') => Array.from({ length: n }, () => `<circle cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * 60).toFixed(0)}" r="${(0.6 + rnd() * 1.1).toFixed(1)}" fill="${col}" opacity="${(0.5 + rnd() * 0.5).toFixed(2)}"/>`).join('');
  const sky = (a, b) => `<linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const torch = (x, y) => `<rect x="${x - 1.5}" y="${y}" width="3" height="12" fill="#5a3a1f"/><path d="M${x} ${y - 10} Q${x + 6} ${y - 2} ${x} ${y + 1} Q${x - 6} ${y - 2} ${x} ${y - 10}Z" fill="#ff8a3d"/><path d="M${x} ${y - 5} Q${x + 3} ${y - 1} ${x} ${y + 1} Q${x - 3} ${y - 1} ${x} ${y - 5}Z" fill="#ffd36b"/><circle cx="${x}" cy="${y - 2}" r="16" fill="#ffb04a" opacity=".12"/>`;
  const THEMES = {
    town: (o) => { let s = sky('#f2c98a', '#f6e3b8') + `<rect width="${W}" height="${H}" fill="url(#skyg)"/><circle cx="290" cy="40" r="20" fill="#fff4d6"/>` + hills(95, 20, '#b8c48a');
      if (o.sea) s += waves(118, '#5f9ac0') + P('M250 118 L262 92 L274 118Z', '#e8e0d0') + P('M262 92 v26', 'none', 'stroke="#4a2c17" stroke-width="2"') + P('M240 118 Q262 126 284 118Z', '#7a4a2b');
      for (let i = 0; i < 7; i++) s += house(30 + i * 34 + rnd() * 8, o.sea ? 116 : 128, 0.75 + rnd() * 0.4, ['#e8d6b0', '#d9c49a', '#f0e2c4'][i % 3], ['#b5452c', '#8a4f2b', '#5b6f86', '#7a5a3a'][i % 4]);
      return s + ridge(H - 10, 6, 12, '#6b5a3a'); },
    forest: (o) => { let s = sky('#cfe3c0', '#e8efd0') + `<rect width="${W}" height="${H}" fill="url(#skyg)"/>` + hills(80, 25, '#8fb07a');
      for (let i = 0; i < 9; i++) s += tree(20 + i * 42 + rnd() * 10, 100, 0.9 + rnd() * 0.3, '#4f7a3a'); s += hills(118, 10, '#5f8a4a');
      for (let i = 0; i < 7; i++) s += (i % 2 ? tree : round)(10 + i * 56 + rnd() * 10, 140, 1.1 + rnd() * 0.3, '#3a5f2b');
      return s + `<path d="M150 ${H} Q170 125 200 120 Q215 118 220 ${H}Z" fill="#c9a66a" opacity=".8"/>`; },
    swamp: () => { let s = sky('#b8c4a0', '#d8d8b8') + `<rect width="${W}" height="${H}" fill="url(#skyg)"/>` + hills(92, 14, '#7a8a5a');
      for (let i = 0; i < 6; i++) { const x = 30 + i * 60 + rnd() * 20; s += P(`M${x} 120 Q${x - 4} 80 ${x + 2} 50 Q${x + 6} 80 ${x + 4} 120Z`, '#4a4a2b') + P(`M${x + 2} 60 Q${x + 20} 64 ${x + 28} 80 M${x + 2} 70 Q${x - 18} 74 ${x - 22} 92`, 'none', 'stroke="#4a4a2b" stroke-width="3" fill="none"') + P(`M${x + 26} 78 v18 M${x - 22} 90 v14`, 'none', 'stroke="#6a7a4a" stroke-width="2"'); }
      s += waves(124, '#4f5f3a', 0.9); for (let i = 0; i < 5; i++) s += `<ellipse cx="${40 + i * 70}" cy="${134 + rnd() * 6}" rx="12" ry="3" fill="#7fa04a"/>`;
      return s + `<circle cx="80" cy="96" r="3" fill="#cff07a" opacity=".8"/><circle cx="210" cy="86" r="2.5" fill="#cff07a" opacity=".8"/><circle cx="300" cy="100" r="3" fill="#cff07a" opacity=".7"/>`; },
    mountain: () => { let s = sky('#a8c4e0', '#e0ecf4') + `<rect width="${W}" height="${H}" fill="url(#skyg)"/>` + ridge(70, 50, 8, '#8a95a8', true);
      for (let i = 0; i < 4; i++) { const x = 45 + i * 90; s += P(`M${x - 14} ${58} L${x} ${34 + rnd() * 6} L${x + 14} ${58} L${x + 6} ${54} L${x} ${60} L${x - 6} ${54}Z`, '#f4f8fc'); }
      s += ridge(108, 30, 10, '#6b7686', true) + hills(132, 12, '#7a8a6a'); for (let i = 0; i < 6; i++) s += tree(20 + i * 64, 140, 0.8, '#3a5a4a'); return s; },
    cave: () => { let s = `<rect width="${W}" height="${H}" fill="#2a2420"/>` + `<ellipse cx="180" cy="90" rx="150" ry="70" fill="#3a322a"/><ellipse cx="180" cy="95" rx="90" ry="45" fill="#14110e"/>`;
      for (let i = 0; i < 12; i++) { const x = 10 + i * 30 + rnd() * 10; s += P(`M${x - 8} 0 L${x} ${18 + rnd() * 26} L${x + 8} 0Z`, '#4a4038'); }
      for (let i = 0; i < 7; i++) { const x = 20 + i * 52 + rnd() * 10; s += P(`M${x - 9} ${H} L${x} ${H - 18 - rnd() * 20} L${x + 9} ${H}Z`, '#4a4038'); }
      return s + `<circle cx="120" cy="96" r="2" fill="#7ff0d0"/><circle cx="240" cy="84" r="2" fill="#7ff0d0"/><circle cx="200" cy="110" r="1.6" fill="#7ff0d0" opacity=".7"/>`; },
    dungeon: () => { let s = `<rect width="${W}" height="${H}" fill="#2b2622"/>`;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) s += `<rect x="${c * 38 + (r % 2) * 19 - 10}" y="${r * 19}" width="36" height="17" fill="${['#3a342e', '#423a33', '#383028'][(r + c) % 3]}"/>`;
      [70, 180, 290].forEach(x => { s += P(`M${x - 36} ${H} V70 Q${x} 30 ${x + 36} 70 V${H}Z`, '#14110e'); }); s += torch(125, 64) + torch(235, 64);
      return s + `<rect y="${H - 14}" width="${W}" height="14" fill="#1e1a16"/>`; },
    cellar: () => { let s = `<rect width="${W}" height="${H}" fill="#3a2c20"/>` + `<rect y="0" width="${W}" height="22" fill="#2a1f16"/>`;
      for (let i = 0; i < 8; i++) s += `<rect x="${i * 46}" y="0" width="8" height="${H}" fill="#2a1f16"/>`;
      for (let i = 0; i < 6; i++) { const x = 30 + i * 58, y = 118; s += `<ellipse cx="${x}" cy="${y}" rx="20" ry="26" fill="#7a4a2b"/><rect x="${x - 20}" y="${y - 12}" width="40" height="4" fill="#4a3a2a"/><rect x="${x - 20}" y="${y + 8}" width="40" height="4" fill="#4a3a2a"/>`; }
      return s + torch(180, 50); },
    seacave: () => THEMES.cave() + waves(128, '#2f5b7a', 0.95),
    coastroad: () => { let s = sky('#b8d4ec', '#f0e8d0') + `<rect width="${W}" height="${H}" fill="url(#skyg)"/>` + waves(96, '#5f9ac0') + waves(110, '#4a82ad');
      s += P(`M0 ${H} L0 60 Q40 50 70 70 Q110 90 130 ${H}Z`, '#9a8a6a') + P(`M0 ${H} L0 90 Q30 84 60 100 Q90 118 100 ${H}Z`, '#7a6a4a') + P('M40 120 Q80 110 140 130 Q200 146 260 ' + H, 'none', 'stroke="#d9c48a" stroke-width="5" fill="none"');
      return s + `<path d="M260 50 q6 -4 12 0 q6 -4 12 0" fill="none" stroke="#5a5a5a" stroke-width="1.5"/>`; },
    causeway: () => { let s = sky('#5a6a8a', '#a8b4c8') + `<rect width="${W}" height="${H}" fill="url(#skyg)"/>` + stars(12) + waves(92, '#3a5a7a') + waves(104, '#2f4f6f');
      s += P(`M150 ${H} L170 96 L190 96 L210 ${H}Z`, '#3a3a3a') + P(`M266 96 V40 L274 36 L282 40 V96Z`, '#d8d0c0') + P('M264 40 L274 28 L284 40Z', '#8a2f1c') + `<circle cx="274" cy="44" r="4" fill="#ffd36b"/>`; return s; },
    lighthouse: () => { let s = sky('#2a3450', '#4a5a7a') + `<rect width="${W}" height="${H}" fill="url(#skyg)"/>` + stars(30);
      s += P('M0 ' + H + ' L0 110 Q90 96 180 108 Q270 120 360 104 L360 ' + H + 'Z', '#1e2a3a') + P('M160 112 L168 30 L192 30 L200 112Z', '#e8e0d0') + P('M164 70 h32 v10 h-32Z M162 96 h36 v10 h-36Z', '#b5452c') + P('M158 30 L180 14 L202 30Z', '#3a3a48') + `<rect x="170" y="32" width="20" height="10" fill="#7ff0d0"/><path d="M180 37 L360 10 L360 50Z" fill="#7ff0d0" opacity=".18"/>`;
      return s + waves(126, '#1a3550', 0.95); },
    road: () => { let s = sky('#c8dcec', '#f4ead0') + `<rect width="${W}" height="${H}" fill="url(#skyg)"/><circle cx="70" cy="36" r="16" fill="#fff4d6"/>` + hills(84, 24, '#a8c08a') + hills(110, 18, '#8fae6a');
      s += P(`M150 ${H} Q160 120 190 110 Q215 102 205 96 L212 96 Q226 106 214 116 Q190 128 210 ${H}Z`, '#d9c48a'); for (let i = 0; i < 5; i++) s += round(30 + i * 75 + rnd() * 20, 128 + rnd() * 6, 0.8, '#4f7a3a');
      return s + P('M250 118 v-14 h14 v14 M246 104 h22', 'none', 'stroke="#6b4a2b" stroke-width="3" fill="none"'); }
  };
  THEMES.coast = THEMES.coastroad;
  function sceneSVG(theme, name, o = {}) {
    seed = hashStr((name || '') + theme); const f = THEMES[theme] || THEMES[o.biome] || THEMES.road;
    const body = f(o);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${body.includes('url(#skyg)') ? '' : ''}<filter id="pc" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="2" stdDeviation="1.2" flood-opacity=".35"/></filter></defs><g filter="url(#pc)">${body}</g><rect width="${W}" height="${H}" fill="none" stroke="#2b1d12" stroke-width="6"/></svg>`;
  }
  function pickTheme(scene) {
    if (!scene) return 'road'; const n = scene.name || '';
    if (scene.kind === 'town') return 'town';
    if (/mire|fen|bog|marsh|swamp/i.test(n)) return 'swamp';
    if (/peak|hold|spire|mountain|pass\b/i.test(n) && scene.theme !== 'dungeon') return 'mountain';
    return scene.theme || 'road';
  }
  root.SCENES = { sceneSVG, pickTheme, themes: Object.keys(THEMES) };
})(typeof window !== 'undefined' ? window : globalThis);
