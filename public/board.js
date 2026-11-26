// Board renderer: paper-cut tiles, fog of war, tokens, animations, touch input.
(function (root) {
  const TS = 40; // tile size in world px
  const B = { cv: null, g: null, view: null, cam: { x: 0, y: 0, s: 1 }, cb: {}, opts: {}, pos: {}, fxs: [], ghosts: [], staticCache: null, fogCache: null, lastFrame: 0, dirty: true, running: false, t: 0 };
  const hash = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const PAL = {
    '.': ['#8fb35e', '#86ab55', '#97ba66'], ',': ['#c9a56a', '#c19c60'], ':': ['#a39a8c', '#9a9183'], '=': ['#8c8172', '#857a6b'], '_': ['#a87a4a', '#9e7142'], 's': ['#dcc596', '#d4bc8b'],
    '#': ['#5f5145'], '~': ['#3f7fb5'], '%': ['#6fa6c9'], 'T': ['#8fb35e'], 'r': ['#8fb35e'], '^': ['#6b5a4c'], '+': ['#7a4f28'], 'o': null, 'b': ['#a87a4a'], 't': ['#a87a4a'], 'w': [':'], 'f': null, 'x': null, 'p': ['#a8865a'], 'G': null, 'h': ['#9c4a32'], 'c': ['#a87a4a']
  };
  const baseOf = (ch, theme) => {
    if (ch === 'o' || ch === 'x' || ch === 'f' || ch === 'G') return theme === 'cellar' ? '_' : (theme === 'seacave' ? 's' : (theme === 'town' || theme === 'road' || theme === 'forest' || theme === 'coastroad' ? '.' : '='));
    if (ch === 'w') return ':'; if (ch === 'T' || ch === 'r') return theme === 'cave' || theme === 'seacave' ? (theme === 'seacave' ? 's' : '=') : '.';
    if (ch === 'b' || ch === 't' || ch === 'c') return '_';
    return ch;
  };

  function init(cv, cb) {
    B.cv = cv; B.g = cv.getContext('2d'); B.cb = cb || {};
    setupInput(); loop();
    root.ART.onload = () => { B.dirty = true; };
    window.addEventListener('resize', () => { B.dirty = true; });
  }
  function setState(view, opts) {
    const prev = B.view; B.view = view; B.opts = opts || {};
    const s = view && view.scene; if (!s) return;
    if (!prev || !prev.scene || prev.scene.key !== s.key || prev.scene.tiles.join('') !== s.tiles.join('')) { B.staticCache = null; if (!prev || !prev.scene || prev.scene.key !== s.key) { B.pos = {}; B.needCenter = true; } }
    if (!prev || !prev.scene || prev.scene.seen !== s.seen || prev.scene.vis !== s.vis || prev.scene.key !== s.key) B.fogCache = null;
    // tween new positions
    const now = performance.now();
    s.tokens.forEach(t => { const p = B.pos[t.id]; if (!p) B.pos[t.id] = { x: t.x, y: t.y, fx: t.x, fy: t.y, t0: now, dur: 1 }; else if (p.x !== t.x || p.y !== t.y) { const cx = curPos(t.id, now); B.pos[t.id] = { x: t.x, y: t.y, fx: cx.x, fy: cx.y, t0: now, dur: Math.min(900, 110 * Math.max(Math.abs(cx.x - t.x), Math.abs(cx.y - t.y))) }; } });
    // ghosts for removed monsters
    if (prev && prev.scene && prev.scene.key === s.key) prev.scene.tokens.forEach(t => { if (t.kind === 'monster' && !s.tokens.find(o => o.id === t.id)) B.ghosts.push({ t, t0: now }); });
    if (B.needCenter && B.cv.clientWidth) { const me = s.tokens.find(t => t.kind === 'pc' && t.ownerId === view.me) || s.tokens.find(t => t.kind === 'pc'); fit(me); B.needCenter = false; }
    B.dirty = true;
  }
  function curPos(id, now) {
    const p = B.pos[id]; if (!p) return { x: 0, y: 0 };
    const k = Math.min(1, (now - p.t0) / p.dur); const e = k < 1 ? 1 - Math.pow(1 - k, 2) : 1;
    return { x: p.fx + (p.x - p.fx) * e, y: p.fy + (p.y - p.fy) * e, moving: k < 1 };
  }
  function fit(me) {
    const s = B.view.scene; const W = B.cv.clientWidth, Hh = B.cv.clientHeight;
    B.cam.s = Math.max(0.55, Math.min(1.25, W / (Math.min(s.w, 11) * TS)));
    const tx = me ? me.x : s.w / 2, ty = me ? me.y : s.h - 3; center(tx, ty, true);
  }
  function center(tx, ty, now) {
    const W = B.cv.clientWidth, Hh = B.cv.clientHeight;
    const nx = W / 2 - (tx + .5) * TS * B.cam.s, ny = Hh / 2 - (ty + .5) * TS * B.cam.s;
    if (now) { B.cam.x = nx; B.cam.y = ny; B.camAnim = null; } else B.camAnim = { fx: B.cam.x, fy: B.cam.y, x: nx, y: ny, t0: performance.now() };
    B.dirty = true;
  }
  function ensureVisible(tx, ty) { const W = B.cv.clientWidth, Hh = B.cv.clientHeight; const sx = B.cam.x + (tx + .5) * TS * B.cam.s, sy = B.cam.y + (ty + .5) * TS * B.cam.s; if (sx < W * .2 || sx > W * .8 || sy < Hh * .2 || sy > Hh * .8) center(tx, ty); }

  // ---------------- static layer ----------------
  function drawTile(g, ch, x, y, theme, tiles) {
    const px = x * TS, py = y * TS; const r = hash(x, y);
    const base = baseOf(ch, theme); const pal = PAL[base] || PAL['.'];
    g.fillStyle = pal[Math.floor(r * pal.length) % pal.length]; g.fillRect(px, py, TS + .6, TS + .6);
    const below = (tiles[y + 1] || '')[x];
    // ground texture
    if (base === '.') { g.fillStyle = 'rgba(40,70,20,.22)'; for (let i = 0; i < 3; i++) { const a = hash(x, y, i), b = hash(x, y, i + 9); tuft(g, px + 6 + a * 28, py + 8 + b * 26); } if (r > .9) { g.fillStyle = ['#f3e6cc', '#ffd36b', '#e88a9a'][Math.floor(r * 30) % 3]; g.beginPath(); g.arc(px + 10 + r * 20, py + 26, 2.2, 0, 7); g.fill(); } }
    if (base === ',') { g.fillStyle = 'rgba(90,60,30,.18)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(px + hash(x, y, i) * TS, py + hash(x, y, i + 4) * TS, 1.6 + hash(x, y, i + 2) * 2, 0, 7); g.fill(); } }
    if (base === ':' || base === '=') { g.strokeStyle = 'rgba(30,20,10,.22)'; g.lineWidth = 1.2; g.beginPath(); const o = (y % 2) * 13; for (let k = 0; k < 2; k++) { g.moveTo(px, py + k * 20 + .5); g.lineTo(px + TS, py + k * 20 + .5); } g.moveTo(px + o + 6, py); g.lineTo(px + o + 6, py + 20); g.moveTo(px + ((o + 26) % 40), py + 20); g.lineTo(px + ((o + 26) % 40), py + 40); g.stroke(); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(px + 2, py + 2, 16, 8); }
    if (base === '_') { g.strokeStyle = 'rgba(50,25,10,.3)'; g.lineWidth = 1.2; g.beginPath(); for (let k = 1; k < 4; k++) { g.moveTo(px, py + k * 10); g.lineTo(px + TS, py + k * 10); } g.stroke(); g.fillStyle = 'rgba(50,25,10,.35)'; g.fillRect(px + (r * 30 | 0), py + 2, 2, 8); }
    if (base === 's') { g.fillStyle = 'rgba(140,110,60,.25)'; for (let i = 0; i < 6; i++) g.fillRect(px + hash(x, y, i) * TS, py + hash(x, y, i + 3) * TS, 1.6, 1.6); }
    if (base === 'p') { g.fillStyle = '#7a5a3a'; for (let k = 0; k < 4; k++) g.fillRect(px + k * 10 + 1, py, 8, TS); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(px, py + TS - 3, TS, 3); }
    if (ch === '#') {
      const wallTop = '#7d6956';
      g.fillStyle = wallTop; g.fillRect(px, py, TS + .6, TS + .6);
      g.strokeStyle = 'rgba(30,20,10,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py + 13); g.lineTo(px + TS, py + 13); g.moveTo(px, py + 27); g.lineTo(px + TS, py + 27); g.moveTo(px + 20 * (y % 2) + 10, py); g.lineTo(px + 20 * (y % 2) + 10, py + 13); g.moveTo(px + 30 - 20 * (y % 2), py + 13); g.lineTo(px + 30 - 20 * (y % 2), py + 27); g.stroke();
      if (below && below !== '#' && below !== 'h') { g.fillStyle = '#4a3c30'; g.fillRect(px, py + TS - 9, TS + .6, 9); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(px, py + TS, TS, 4); }
    }
    if (ch === 'h') { g.fillStyle = r > .5 ? '#9c4a32' : '#8f4430'; g.fillRect(px, py, TS + .6, TS + .6); g.strokeStyle = 'rgba(40,10,0,.35)'; g.lineWidth = 1.5; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(px, py + k * 10 + 5); g.lineTo(px + TS, py + k * 10 + 5); } g.stroke(); for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) { g.fillStyle = 'rgba(255,220,180,.08)'; g.fillRect(px + j * 10 + (k % 2) * 5, py + k * 10 + 6, 8, 3); } if (below === '#') { } }
    if (ch === '^') { g.fillStyle = '#4f4237'; g.beginPath(); g.moveTo(px, py + TS); g.lineTo(px + TS * .2, py + 6); g.lineTo(px + TS * .55, py + 14); g.lineTo(px + TS * .8, py + 2); g.lineTo(px + TS, py + TS); g.fill(); }
    if (ch === '~') { g.fillStyle = r > .5 ? '#3f7fb5' : '#3a78ac'; g.fillRect(px, py, TS + .6, TS + .6); const up = (tiles[y - 1] || '')[x]; if (up && up !== '~') { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(px, py, TS, 3); } }
    if (ch === '%') { g.fillStyle = '#6fa6c9'; g.fillRect(px, py, TS + .6, TS + .6); g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(px + 14 + r * 12, py + 20, 10, 4, 0, 0, 7); g.fill(); }
    if (ch === '+') { g.fillStyle = base === '+' ? (theme === 'town' ? '#a39a8c' : '#8c8172') : g.fillStyle; g.fillStyle = '#5a3a1f'; g.fillRect(px + 7, py + 3, TS - 14, TS - 4); g.fillStyle = '#7a4f28'; g.fillRect(px + 9, py + 5, TS - 18, TS - 8); g.strokeStyle = 'rgba(30,15,5,.4)'; g.beginPath(); g.moveTo(px + TS / 2, py + 5); g.lineTo(px + TS / 2, py + TS - 3); g.stroke(); g.fillStyle = '#d9a62e'; g.beginPath(); g.arc(px + TS - 14, py + 22, 2, 0, 7); g.fill(); }
    if (ch === 'x') { g.fillStyle = '#6e655a'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(px + 6 + hash(x, y, i) * 28, py + 8 + hash(x, y, i + 5) * 26, 2.5 + hash(x, y, i + 1) * 3, 0, 7); g.fill(); } }
  }
  function tuft(g, x, y) { g.beginPath(); g.moveTo(x, y + 5); g.lineTo(x + 1.5, y); g.lineTo(x + 3, y + 5); g.lineTo(x + 4.5, y + 1); g.lineTo(x + 6, y + 5); g.closePath(); g.fill(); }
  function drawProp(g, ch, x, y, t) {
    const px = x * TS, py = y * TS; const r = hash(x, y, 3);
    const shadow = (cx, cy, rx, ry) => { g.fillStyle = 'rgba(30,20,10,.3)'; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fill(); };
    if (ch === 'T') {
      shadow(px + 23, py + 34, 17, 7);
      g.fillStyle = '#5a3a1f'; g.fillRect(px + 17, py + 24, 6, 13);
      const cols = r > .5 ? ['#2f6b34', '#3b7a3a', '#4f8f45'] : ['#35703a', '#43833f', '#5a9a4c'];
      [[20, 18, 15], [13, 22, 9], [27, 21, 10], [20, 10, 9]].forEach(([cx, cy, rr], i) => { g.fillStyle = cols[Math.min(2, i === 3 ? 2 : i % 2)]; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const q = rr + Math.sin(k * 3 + r * 9) * 1.4; g.lineTo(px + cx + Math.cos(a) * q, py + cy + Math.sin(a) * q); } g.fill(); });
    }
    if (ch === 'r') { shadow(px + 22, py + 32, 15, 6); g.fillStyle = '#6e6e6e'; g.beginPath(); g.moveTo(px + 5, py + 32); g.lineTo(px + 10, py + 14); g.lineTo(px + 24, py + 8); g.lineTo(px + 35, py + 18); g.lineTo(px + 36, py + 32); g.fill(); g.fillStyle = '#9a9a9a'; g.beginPath(); g.moveTo(px + 11, py + 15); g.lineTo(px + 24, py + 10); g.lineTo(px + 26, py + 20); g.lineTo(px + 14, py + 22); g.fill(); }
    if (ch === 'o') { shadow(px + 21, py + 34, 14, 5); g.fillStyle = r > .5 ? '#8a5a2b' : '#9a6535'; if (r > .5) { g.beginPath(); g.ellipse(px + 20, py + 22, 13, 14, 0, 0, 7); g.fill(); g.strokeStyle = '#4a3a2a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(px + 8, py + 15); g.lineTo(px + 32, py + 15); g.moveTo(px + 8, py + 29); g.lineTo(px + 32, py + 29); g.stroke(); } else { g.fillRect(px + 6, py + 9, 28, 26); g.strokeStyle = '#5a3a1f'; g.lineWidth = 2; g.strokeRect(px + 6, py + 9, 28, 26); g.beginPath(); g.moveTo(px + 6, py + 9); g.lineTo(px + 34, py + 35); g.stroke(); } }
    if (ch === 'b') { g.fillStyle = '#7a4b26'; g.fillRect(px, py + 8, TS + .6, 22); g.fillStyle = '#9a6538'; g.fillRect(px, py + 8, TS + .6, 6); }
    if (ch === 't') { shadow(px + 21, py + 30, 15, 6); g.fillStyle = '#8a5a2b'; g.beginPath(); g.arc(px + 20, py + 20, 13, 0, 7); g.fill(); g.fillStyle = '#a06a35'; g.beginPath(); g.arc(px + 20, py + 18, 11, 0, 7); g.fill(); }
    if (ch === 'w') { shadow(px + 21, py + 32, 16, 6); g.fillStyle = '#8a8a8a'; g.beginPath(); g.arc(px + 20, py + 20, 15, 0, 7); g.fill(); g.fillStyle = '#2f5b9a'; g.beginPath(); g.arc(px + 20, py + 20, 9, 0, 7); g.fill(); g.fillStyle = '#5a3a1f'; g.fillRect(px + 4, py + 2, 3, 18); g.fillRect(px + 33, py + 2, 3, 18); g.fillRect(px + 4, py + 2, 32, 3); }
    if (ch === 'G') { const open = false; g.fillStyle = '#3a3f47'; g.fillRect(px, py + 2, TS + .6, TS - 4); g.strokeStyle = '#8a929c'; g.lineWidth = 3.5; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(px + 5 + k * 10, py + 3); g.lineTo(px + 5 + k * 10, py + TS - 3); } g.stroke(); g.fillStyle = '#d9a62e'; g.fillRect(px + 16, py + 18, 8, 6); }
  }
  function buildStatic() {
    const s = B.view.scene; const c = document.createElement('canvas'); c.width = s.w * TS; c.height = s.h * TS; const g = c.getContext('2d');
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) drawTile(g, s.tiles[y][x], x, y, s.theme, s.tiles);
    // soft grid
    g.strokeStyle = 'rgba(43,29,18,.08)'; g.lineWidth = 1;
    for (let x = 0; x <= s.w; x++) { g.beginPath(); g.moveTo(x * TS + .5, 0); g.lineTo(x * TS + .5, s.h * TS); g.stroke(); }
    for (let y = 0; y <= s.h; y++) { g.beginPath(); g.moveTo(0, y * TS + .5); g.lineTo(s.w * TS, y * TS + .5); g.stroke(); }
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) drawProp(g, s.tiles[y][x], x, y);
    if (s.theme === 'seacave' || s.dark) { const grd = g.createRadialGradient(c.width / 2, c.height / 2, c.width * .2, c.width / 2, c.height / 2, c.height * .8); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(10,5,20,.35)'); g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height); }
    B.staticCache = c;
  }
  function buildFog() {
    const s = B.view.scene; const c = document.createElement('canvas'); c.width = s.w; c.height = s.h; const g = c.getContext('2d'); const img = g.createImageData(s.w, s.h);
    for (let i = 0; i < s.w * s.h; i++) { const seen = s.seen[i] === '1', vis = s.vis[i] === '1'; const a = !seen ? 255 : vis ? 0 : 140; img.data[i * 4] = 22; img.data[i * 4 + 1] = 15; img.data[i * 4 + 2] = 10; img.data[i * 4 + 3] = a; }
    g.putImageData(img, 0, 0);
    // upscale smoothly
    const big = document.createElement('canvas'); big.width = s.w * 8; big.height = s.h * 8; const bg = big.getContext('2d'); bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high';
    bg.drawImage(c, 0, 0, s.w, s.h, -4, -4, big.width, big.height);
    B.fogCache = big;
  }

  // ---------------- frame ----------------
  function loop() {
    requestAnimationFrame(loop);
    if (!B.cv || !B.view || !B.view.scene || !B.cv.offsetParent) return;
    const now = performance.now();
    const animating = B.fxs.length || B.ghosts.length || B.camAnim || Object.values(B.pos).some(p => now - p.t0 < p.dur) || B.opts.targets?.size || B.opts.pulse;
    // idle animation at ~12 fps, active at full
    if (!B.dirty && !animating && now - B.lastFrame < 85) return;
    B.lastFrame = now; B.dirty = false; draw(now);
  }
  function draw(now) {
    const cv = B.cv, s = B.view.scene; const dpr = Math.min(2, window.devicePixelRatio || 1); const W = cv.clientWidth, Hh = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
    const g = B.g; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#16100a'; g.fillRect(0, 0, W, Hh);
    clampCam(W, Hh);
    if (B.camAnim) { const k = Math.min(1, (now - B.camAnim.t0) / 350); const e = 1 - Math.pow(1 - k, 3); B.cam.x = B.camAnim.fx + (B.camAnim.x - B.camAnim.fx) * e; B.cam.y = B.camAnim.fy + (B.camAnim.y - B.camAnim.fy) * e; if (k >= 1) B.camAnim = null; }
    if (!B.staticCache) buildStatic(); if (!B.fogCache) buildFog();
    g.save(); g.translate(B.cam.x, B.cam.y); g.scale(B.cam.s, B.cam.s);
    g.drawImage(B.staticCache, 0, 0);
    const t = now / 1000;
    // animated water & fire
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const ch = s.tiles[y][x]; if (ch !== '~' && ch !== 'f' && ch !== '%') continue; if (s.seen[y * s.w + x] !== '1') continue;
      const px = x * TS, py = y * TS;
      if (ch === '~' || ch === '%') { g.strokeStyle = 'rgba(255,255,255,' + (ch === '~' ? .35 : .25) + ')'; g.lineWidth = 2; const o = Math.sin(t * 1.4 + x * .9 + y * .6) * 4; g.beginPath(); g.moveTo(px + 6 + o, py + 18); g.quadraticCurveTo(px + 13 + o, py + 12, px + 20 + o, py + 18); if (ch === '~') { g.moveTo(px + 20 - o, py + 32); g.quadraticCurveTo(px + 27 - o, py + 26, px + 34 - o, py + 32); } g.stroke(); }
      else { const f = Math.sin(t * 9 + x) * 2; g.fillStyle = 'rgba(255,180,60,.18)'; g.beginPath(); g.arc(px + 20, py + 20, 26 + f, 0, 7); g.fill(); g.fillStyle = '#5a4a3a'; g.fillRect(px + 12, py + 26, 16, 8); g.fillStyle = '#e0702a'; g.beginPath(); g.moveTo(px + 11, py + 28); g.quadraticCurveTo(px + 14, py + 12 + f, px + 20, py + 6 - f); g.quadraticCurveTo(px + 26, py + 12 - f, px + 29, py + 28); g.fill(); g.fillStyle = '#ffd36b'; g.beginPath(); g.moveTo(px + 15, py + 28); g.quadraticCurveTo(px + 18, py + 18 + f, px + 20, py + 14); g.quadraticCurveTo(px + 22, py + 18 - f, px + 25, py + 28); g.fill(); }
    }
    // reachable highlight
    if (B.opts.reach) { g.fillStyle = 'rgba(255,230,120,.22)'; g.strokeStyle = 'rgba(255,230,120,.45)'; g.lineWidth = 1; B.opts.reach.forEach(i => { const x = i % s.w, y = Math.floor(i / s.w); g.fillRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4); }); }
    if (B.opts.area) { const a = B.opts.area; g.fillStyle = 'rgba(255,90,40,.25)'; g.strokeStyle = '#ff7a3d'; g.lineWidth = 2; g.fillRect((a.x - a.r) * TS, (a.y - a.r) * TS, (a.r * 2 + 1) * TS, (a.r * 2 + 1) * TS); g.strokeRect((a.x - a.r) * TS, (a.y - a.r) * TS, (a.r * 2 + 1) * TS, (a.r * 2 + 1) * TS); }
    if (B.opts.rangeRing) { const r = B.opts.rangeRing; g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([6, 5]); g.lineWidth = 2; g.strokeRect((r.x - r.r) * TS, (r.y - r.r) * TS, (r.r * 2 + 1) * TS, (r.r * 2 + 1) * TS); g.setLineDash([]); }
    // pois
    s.pois.forEach(p => {
      if (s.seen[p.y * s.w + p.x] !== '1') return; const px = p.x * TS, py = p.y * TS;
      if (p.type === 'trap' && (p.disarmed || !p.found && !p.triggered)) { if (p.disarmed) { g.globalAlpha = .4; } else return; }
      if (p.type === 'gate') return; // drawn as tile
      let svg = root.ART.propSVG(p.type === 'exit' ? 'exit' : p.type, 100, { opened: p.opened, locked: p.type === 'exit' && !p.ready, open: p.open });
      const bob = p.type === 'exit' ? Math.sin(t * 3) * 2 : 0;
      const img = root.ART.toImg(svg); if (img.complete) g.drawImage(img, px + 3, py + 1 + bob, TS - 6, TS - 6);
      g.globalAlpha = 1;
      if (p.type === 'exit' && B.cam.s > .5) label(g, p.toName || p.name, px + TS / 2, py - 4, p.ready ? '#f3e6cc' : '#c9b59a');
      if ((p.type === 'chest' && !p.opened) || (p.type === 'clue' && !p.read) || p.type === 'shrine') { g.fillStyle = 'rgba(255,230,120,' + (.25 + Math.sin(t * 3 + p.x) * .15) + ')'; g.beginPath(); g.arc(px + TS - 6, py + 6, 4, 0, 7); g.fill(); }
    });
    // gate glow if party can open
    // tokens (sorted by y)
    const toks = s.tokens.slice().sort((a, b) => a.y - b.y);
    const cur = B.view.turn && B.view.turn.current;
    const vis = (x, y) => s.vis[y * s.w + x] === '1';
    for (const tk of toks) {
      const p = curPos(tk.id, now); const size = tk.size > 1 ? 1.6 : 1; const cx = p.x * TS + TS / 2, cy = p.y * TS + TS / 2;
      const isCur = cur && ((cur.kind === 'pc' && tk.charId === cur.charId) || cur.tokenId === tk.id) && B.view.turn.mode === 'combat';
      let ox = 0, oy = 0; const lunge = B.fxs.find(f => f.k === 'lunge' && f.id === tk.id); if (lunge) { const k = Math.min(1, (now - lunge.t0) / lunge.dur); const e = Math.sin(k * Math.PI); ox = lunge.dx * e * 12; oy = lunge.dy * e * 12; }
      const shake = B.fxs.find(f => f.k === 'shake' && f.id === tk.id); if (shake) { const k = (now - shake.t0) / shake.dur; ox += Math.sin(k * 40) * 4 * (1 - k); }
      const bob = p.moving ? Math.abs(Math.sin(now / 60)) * -4 : Math.sin(t * 2.2 + (tk.x * 3 + tk.y)) * 1.2;
      const dimmed = tk.kind === 'monster' && tk.dimmed;
      // shadow & base
      g.fillStyle = 'rgba(20,10,5,.35)'; g.beginPath(); g.ellipse(cx + 2 + ox, cy + 15 * size + oy, 15 * size, 5 * size, 0, 0, 7); g.fill();
      if (isCur) { g.strokeStyle = '#ffd36b'; g.lineWidth = 3.5; g.beginPath(); g.ellipse(cx + ox, cy + 13 * size + oy, 17 * size + Math.sin(t * 6) * 1.5, 6.5 * size, 0, 0, 7); g.stroke(); }
      if (B.opts.targets && B.opts.targets.has(tk.id)) { g.strokeStyle = B.opts.targetColor || '#ff5a3d'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 21 * size + Math.sin(t * 7) * 2.5, 0, 7); g.stroke(); }
      if (B.opts.sel === tk.id) { g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.setLineDash([5, 4]); g.beginPath(); g.arc(cx, cy, 22 * size, 0, 7); g.stroke(); g.setLineDash([]); }
      let svg;
      if (tk.kind === 'pc') svg = root.ART.heroSVG(tk.look, tk.cls, tk.race, 100);
      else if (tk.kind === 'npc') svg = root.ART.heroSVG(tk.look, null, 'Human', 100, { gear: false });
      else if (tk.kind === 'mimic') svg = root.ART.propSVG('chest', 100, {});
      else svg = root.ART.monsterSVG(tk.mkey, 100, { flip: tk.facing < 0 });
      const img = root.ART.toImg(svg); const sz = (tk.kind === 'mimic' ? 34 : 42) * size;
      g.globalAlpha = (tk.dead ? .35 : (tk.kind === 'pc' && tk.hp <= 0) ? .55 : 1) * (dimmed ? .55 : 1);
      if (img.complete) { if (tk.kind === 'pc' && tk.hp <= 0) { g.save(); g.translate(cx + ox, cy + 8 + oy); g.rotate(Math.PI / 2); g.drawImage(img, -sz / 2, -sz / 2, sz, sz); g.restore(); } else g.drawImage(img, cx - sz / 2 + ox, cy - sz / 2 - 4 * size + bob + oy, sz, sz); }
      g.globalAlpha = 1;
      if (tk.kind === 'npc' && tk.chained) { g.strokeStyle = '#8a929c'; g.lineWidth = 2.5; g.beginPath(); g.arc(cx - 8, cy + 10, 4, 0, 7); g.arc(cx + 8, cy + 10, 4, 0, 7); g.stroke(); }
      // hp bar
      if (tk.kind === 'pc' || tk.kind === 'monster') {
        const frac = tk.kind === 'pc' ? Math.max(0, tk.hp) / tk.maxHp : tk.hpPct; const w = 30 * size; const bx = cx - w / 2 + ox, by = cy - 26 * size + oy + bob;
        g.fillStyle = 'rgba(20,10,5,.75)'; g.fillRect(bx - 1, by - 1, w + 2, 6); g.fillStyle = tk.kind === 'pc' ? (frac > .5 ? '#8fd16a' : frac > .25 ? '#e8c14a' : '#e8604a') : '#e8604a'; g.fillRect(bx, by, w * frac, 4);
        if (tk.temp) { g.fillStyle = '#6fb7ff'; g.fillRect(bx, by - 3, Math.min(w, w * tk.temp / tk.maxHp), 2); }
        if (tk.boss && B.cam.s > .45) label(g, tk.name, cx, by - 6, '#ffd36b');
      }
      if (tk.kind === 'npc' && B.opts.npcMarks && B.opts.npcMarks[tk.npcKey]) { const m = B.opts.npcMarks[tk.npcKey]; const im = root.ART.toImg(root.ART.propSVG('npcmark', 100, { q: m === '?', color: m === '?' ? '#8fd16a' : '#ffd36b' })); if (im.complete) g.drawImage(im, cx - 8, cy - 40 + Math.sin(t * 4) * 2, 16, 16); }
      if (tk.conds && tk.conds.length) { g.font = '11px system-ui'; g.textAlign = 'center'; const icons = tk.conds.slice(0, 3).map(k => (root.RULES.CONDITIONS[k] || {}).icon || '').join(''); g.fillText(icons, cx + ox, cy + 26 * size + oy); }
      if ((tk.kind === 'pc' || tk.kind === 'npc') && B.cam.s > .6) label(g, tk.name.length > 11 ? tk.name.slice(0, 10) + '…' : tk.name, cx + ox, cy + (tk.conds && tk.conds.length ? 38 : 28) * size + oy, tk.kind === 'npc' ? '#ffe9b0' : '#fff');
    }
    // ghosts (defeated monsters fade & fall)
    B.ghosts = B.ghosts.filter(gh => now - gh.t0 < 700);
    B.ghosts.forEach(gh => { const k = (now - gh.t0) / 700; const tk = gh.t; const img = root.ART.toImg(root.ART.monsterSVG(tk.mkey, 100)); const sz = 42 * (tk.size > 1 ? 1.6 : 1); g.globalAlpha = 1 - k; g.save(); g.translate(tk.x * TS + TS / 2, tk.y * TS + TS / 2 + k * 8); g.rotate(k * 1.2); if (img.complete) g.drawImage(img, -sz / 2, -sz / 2, sz, sz); g.restore(); g.globalAlpha = 1; });
    // fog
    g.imageSmoothingEnabled = true; g.drawImage(B.fogCache, 0, 0, s.w * TS, s.h * TS);
    // effects on top
    B.fxs = B.fxs.filter(f => now - f.t0 < f.dur);
    for (const f of B.fxs) {
      const k = (now - f.t0) / f.dur;
      if (f.k === 'float') { g.font = `900 ${f.big ? 22 : 17}px system-ui`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#1a0f08'; const y = f.y * TS - k * 28; g.globalAlpha = k > .7 ? (1 - k) / .3 : 1; g.strokeText(f.text, f.x * TS + TS / 2, y); g.fillStyle = f.color; g.fillText(f.text, f.x * TS + TS / 2, y); g.globalAlpha = 1; }
      if (f.k === 'proj') { const e = Math.min(1, k * 1.4); const x = f.ax + (f.bx - f.ax) * e, y = f.ay + (f.by - f.ay) * e; g.strokeStyle = f.color; g.lineWidth = f.thick || 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(f.ax + (f.bx - f.ax) * Math.max(0, e - .3), f.ay + (f.by - f.ay) * Math.max(0, e - .3)); g.lineTo(x, y); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
      if (f.k === 'burst') { const rr = (f.r + .5) * TS * (0.3 + k * .9); g.globalAlpha = 1 - k; g.fillStyle = f.color; g.beginPath(); g.arc(f.x * TS + TS / 2, f.y * TS + TS / 2, rr, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); g.globalAlpha = 1; }
      if (f.k === 'slash') { const cx = f.x * TS + TS / 2, cy = f.y * TS + TS / 2; g.globalAlpha = 1 - k; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 14 + k * 4, cy - 14); g.lineTo(cx + 14, cy + 14 - k * 4); g.stroke(); g.strokeStyle = f.color || '#ff5a3d'; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1; }
      if (f.k === 'spark') { const cx = f.x * TS + TS / 2, cy = f.y * TS + TS / 2; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + k; const r1 = 6 + k * 26; g.fillStyle = f.color; g.globalAlpha = 1 - k; g.beginPath(); g.arc(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 - k * 10, 3, 0, 7); g.fill(); } g.globalAlpha = 1; }
    }
    g.restore();
  }
  function clampCam(W, Hh) {
    const s = B.view.scene; const mw = s.w * TS * B.cam.s, mh = s.h * TS * B.cam.s; const pad = 30;
    const fix = (pos, view, size) => size + pad * 2 <= view ? (view - size) / 2 : Math.min(pad, Math.max(view - size - pad, pos));
    if (B.camAnim) { B.camAnim.x = fix(B.camAnim.x, W, mw); B.camAnim.y = fix(B.camAnim.y, Hh, mh); }
    else { B.cam.x = fix(B.cam.x, W, mw); B.cam.y = fix(B.cam.y, Hh, mh); }
  }
  function label(g, text, x, y, col) { g.font = '800 11px system-ui'; g.textAlign = 'center'; const w = g.measureText(text).width + 10; g.fillStyle = 'rgba(30,20,12,.82)'; roundRect(g, x - w / 2, y - 12, w, 15, 6); g.fill(); g.fillStyle = col || '#fff'; g.fillText(text, x, y); }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---------------- effects from log entries ----------------
  const TYPE_COL = { fire: '#ff7a3d', cold: '#8fd8ff', lightning: '#ffe66b', radiant: '#fff2a8', necrotic: '#8a5ad1', force: '#c9a6ff', psychic: '#ff8ad8', thunder: '#b0c4ff', poison: '#8fd16a', acid: '#b6e04a', heal: '#8fd16a', buff: '#ffd36b', debuff: '#c9a6ff', sleep: '#b7a2d6', save: '#ff7a3d', attack: '#ff7a3d', auto: '#c9a6ff' };
  function playFx(e) {
    const f = e.fx; if (!f || !B.view || !B.view.scene) return; const s = B.view.scene; const now = performance.now();
    const tok = (id) => s.tokens.find(t => t.id === id) || B.ghosts.find(g => g.t.id === id)?.t;
    const P = (t) => ({ x: (B.pos[t.id] ? B.pos[t.id].x : t.x), y: (B.pos[t.id] ? B.pos[t.id].y : t.y) });
    const add = (o) => { B.fxs.push(Object.assign({ t0: now }, o)); B.dirty = true; };
    if (f.k === 'atk') {
      const a = tok(f.a), t = tok(f.t); if (!a || !t) return; const pa = P(a), pt = P(t);
      if (f.ranged) add({ k: 'proj', ax: pa.x * TS + TS / 2, ay: pa.y * TS + TS / 2, bx: pt.x * TS + TS / 2, by: pt.y * TS + TS / 2, color: '#e8e0d0', dur: 300, thick: 3 });
      else { const dx = Math.sign(pt.x - pa.x), dy = Math.sign(pt.y - pa.y); add({ k: 'lunge', id: a.id, dx, dy, dur: 260 }); }
      setTimeout(() => { if (f.hit) { add({ k: 'slash', x: pt.x, y: pt.y, dur: 300 }); add({ k: 'shake', id: t.id, dur: 300 }); add({ k: 'float', x: pt.x, y: pt.y, text: f.crit ? `${f.dmg}!` : (f.dmg ? '' + f.dmg : 'HIT'), color: f.crit ? '#ffd36b' : '#ff6b4a', big: f.crit, dur: 1100 }); } else add({ k: 'float', x: pt.x, y: pt.y, text: 'MISS', color: '#e8e0d0', dur: 900 }); }, f.ranged ? 260 : 150);
    }
    if (f.k === 'spell') {
      const a = tok(f.a); const col = TYPE_COL[f.type] || '#c9a6ff'; const pa = a ? P(a) : null;
      (f.t || []).forEach((id, i) => { const t = tok(id); if (!t) return; const pt = P(t); if (pa && (pa.x !== pt.x || pa.y !== pt.y)) add({ k: 'proj', ax: pa.x * TS + TS / 2, ay: pa.y * TS + TS / 2, bx: pt.x * TS + TS / 2, by: pt.y * TS + TS / 2, color: col, dur: 340, thick: 5 }); setTimeout(() => { add({ k: 'spark', x: pt.x, y: pt.y, color: col, dur: 600 }); }, 280); });
      if (f.r && f.x != null) setTimeout(() => add({ k: 'burst', x: f.x, y: f.y, r: f.r, color: col, dur: 600 }), 200);
      else if (f.r && pa) setTimeout(() => add({ k: 'burst', x: pa.x, y: pa.y, r: f.r, color: col, dur: 600 }), 100);
      if (f.dmg && f.t && f.t.length === 1) { const t = tok(f.t[0]); if (t) setTimeout(() => add({ k: 'float', x: P(t).x, y: P(t).y, text: '' + f.dmg, color: col, dur: 1100 }), 320); }
      if (f.heal) (f.t || []).forEach(id => { const t = tok(id); if (t) setTimeout(() => add({ k: 'float', x: P(t).x, y: P(t).y, text: '+' + f.heal, color: '#8fd16a', dur: 1100 }), 300); });
    }
    if (f.k === 'blast') { add({ k: 'burst', x: f.x, y: f.y, r: f.r, color: TYPE_COL[f.type] || '#7ff0d0', dur: 700 }); }
    if (f.k === 'dmg') { const t = tok(f.t); if (t && f.dmg) { add({ k: 'shake', id: t.id, dur: 300 }); add({ k: 'float', x: P(t).x, y: P(t).y, text: '' + f.dmg, color: '#ff6b4a', dur: 1000 }); } }
    if (f.k === 'heal') { const t = tok(f.t); if (t) { add({ k: 'spark', x: P(t).x, y: P(t).y, color: '#8fd16a', dur: 700 }); if (f.amt) add({ k: 'float', x: P(t).x, y: P(t).y, text: '+' + f.amt, color: '#8fd16a', dur: 1000 }); } }
    if (f.k === 'buff') { const t = tok(f.t); if (t) add({ k: 'spark', x: P(t).x, y: P(t).y, color: '#ffd36b', dur: 800 }); }
    if (f.k === 'trap') { const t = tok(f.t); if (t) { add({ k: 'burst', x: P(t).x, y: P(t).y, r: 0, color: '#ff7a3d', dur: 500 }); add({ k: 'float', x: P(t).x, y: P(t).y, text: '' + f.dmg, color: '#ff6b4a', dur: 1000 }); } }
    if (f.k === 'loot' || f.k === 'clue' || f.k === 'spot' || f.k === 'gate') add({ k: 'spark', x: f.x, y: f.y, color: '#ffd36b', dur: 800 });
    if (f.k === 'levelup') { const t = s.tokens.find(o => o.charId === f.charId); if (t) { add({ k: 'spark', x: t.x, y: t.y, color: '#ffd36b', dur: 1200 }); add({ k: 'float', x: t.x, y: t.y, text: 'LEVEL UP!', color: '#ffd36b', big: true, dur: 1600 }); } }
    if (f.k === 'down') { const t = tok(f.t); if (t) add({ k: 'float', x: P(t).x, y: P(t).y, text: 'DOWN!', color: '#ff6b4a', big: true, dur: 1400 }); }
    if (f.k === 'healall') s.tokens.filter(t => t.kind === 'pc').forEach(t => add({ k: 'spark', x: t.x, y: t.y, color: '#8fd16a', dur: 900 }));
    if (f.k === 'alert' || f.k === 'summon') (f.ids || []).forEach(id => { const t = tok(id); if (t) add({ k: 'float', x: P(t).x, y: P(t).y, text: '!', color: '#ff5a3d', big: true, dur: 1000 }); });
  }

  // ---------------- input ----------------
  function setupInput() {
    const cv = B.cv; const pts = new Map(); let start = null, moved = false, pinch = null, lastTap = 0;
    const toTile = (ex, ey) => { const r = cv.getBoundingClientRect(); return [Math.floor(((ex - r.left) - B.cam.x) / (TS * B.cam.s)), Math.floor(((ey - r.top) - B.cam.y) / (TS * B.cam.s))]; };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); B.camAnim = null; if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, cx: B.cam.x, cy: B.cam.y }; moved = false; } else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: B.cam.s, cx: B.cam.x, cy: B.cam.y, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; moved = true; } });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const ns = Math.max(.4, Math.min(2.4, pinch.s * d / pinch.d)); const r = cv.getBoundingClientRect(); const mx = pinch.mx - r.left, my = pinch.my - r.top; B.cam.x = mx - (mx - pinch.cx) * ns / pinch.s; B.cam.y = my - (my - pinch.cy) * ns / pinch.s; B.cam.s = ns; B.dirty = true; }
      else if (start) { const dx = e.clientX - start.x, dy = e.clientY - start.y; if (Math.hypot(dx, dy) > 9) moved = true; if (moved) { B.cam.x = start.cx + dx; B.cam.y = start.cy + dy; B.dirty = true; } }
    });
    const up = (e) => {
      const wasTap = pts.size === 1 && !moved; pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      if (wasTap) { const [x, y] = toTile(e.clientX, e.clientY); const nowT = Date.now(); if (nowT - lastTap < 280 && B.cb.onDoubleTap) { B.cb.onDoubleTap(x, y); lastTap = 0; } else { lastTap = nowT; if (B.cb.onTap) B.cb.onTap(x, y, hitAt(x, y)); } }
      if (!pts.size) start = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); start = null; pinch = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const ns = Math.max(.4, Math.min(2.4, B.cam.s * (e.deltaY < 0 ? 1.1 : .9))); const r = cv.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; B.cam.x = mx - (mx - B.cam.x) * ns / B.cam.s; B.cam.y = my - (my - B.cam.y) * ns / B.cam.s; B.cam.s = ns; B.dirty = true; }, { passive: false });
  }
  function hitAt(x, y) {
    const s = B.view && B.view.scene; if (!s) return null;
    const tk = s.tokens.find(t => t.x === x && t.y === y) || s.tokens.find(t => t.size > 1 && Math.abs(t.x - x) <= 0 && t.y - 1 === y);
    if (tk) return { token: tk };
    const p = s.pois.find(q => q.x === x && q.y === y && s.seen[y * s.w + x] === '1'); if (p) return { poi: p };
    return null;
  }

  function frame(pts) {
    if (!pts.length || !B.cv) return; const W = B.cv.clientWidth, Hh = B.cv.clientHeight;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.max(0.5, Math.min(1.2, Math.min(W / ((x1 - x0 + 3) * TS), Hh / ((y1 - y0 + 3) * TS))));
    B.cam.s = s; center((x0 + x1) / 2, (y0 + y1) / 2);
  }
  root.BOARD = { init, setState, playFx, center, frame, ensureVisible, fit: () => { B.needCenter = true; B.dirty = true; }, redraw: () => { B.dirty = true; }, cam: B.cam, TS };
})(window);
