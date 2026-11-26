// Map generation: themed, connected, with zones (near/mid/far/boss) for placing encounters & points of interest.
// Tiles: . grass  , dirt path  : cobblestone  = stone floor  _ wood floor  s sand  # wall  ~ deep water  % shallow water
//        T tree  r rock  ^ cliff  + door  o barrel/crate  b bar  t table  w well  f brazier/lantern  x rubble  p pier  G gate  h house roof  c bed
const BLOCK = new Set(['#', '~', 'T', 'r', '^', 'o', 'b', 't', 'w', 'f', 'G', 'h', 'c']);
const SIGHT_BLOCK = new Set(['#', '^', 'G', 'h']);
const DIFFICULT = new Set(['%', 'x']);

const R = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[R(a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function grid(W, H, ch) { const g = []; for (let y = 0; y < H; y++) { g.push(new Array(W).fill(ch)); } return g; }
function rect(g, x, y, w, h, ch) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy] && g[yy][xx] !== undefined) g[yy][xx] = ch; }
function outline(g, x, y, w, h, ch) { for (let xx = x; xx < x + w; xx++) { set(g, xx, y, ch); set(g, xx, y + h - 1, ch); } for (let yy = y; yy < y + h; yy++) { set(g, x, yy, ch); set(g, x + w - 1, yy, ch); } }
function set(g, x, y, ch) { if (g[y] && g[y][x] !== undefined) g[y][x] = ch; }
function get(g, x, y) { return g[y] && g[y][x] !== undefined ? g[y][x] : '#'; }
const passableCh = (ch) => !BLOCK.has(ch);

function windingPath(g, x0, y0, y1, ch, width = 2, wander = 3, xmin = 1, xmax) {
  const W = g[0].length; xmax = xmax == null ? W - 2 : xmax; let x = x0;
  const dir = y1 < y0 ? -1 : 1;
  for (let y = y0; dir < 0 ? y >= y1 : y <= y1; y += dir) {
    for (let k = 0; k < width; k++) set(g, x + k, y, ch);
    if (R(wander) === 0) { const nx = clamp(x + (R(2) ? 1 : -1), xmin, xmax - width + 1); for (let k = 0; k < width; k++) set(g, nx + k, y, ch); x = nx; }
  }
  return x;
}
function bfs(g, sx, sy, passFn) {
  const H = g.length, W = g[0].length; const d = new Int32Array(W * H).fill(-1); const q = [[sx, sy]]; d[sy * W + sx] = 0;
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const i = ny * W + nx; if (d[i] >= 0 || !passFn(get(g, nx, ny))) continue; d[i] = d[y * W + x] + 1; q.push([nx, ny]); } }
  return d;
}
function carveLine(g, x0, y0, x1, y1, ch, keepFn) {
  let x = x0, y = y0; let guard = 0;
  while ((x !== x1 || y !== y1) && guard++ < 500) {
    if (!keepFn || !keepFn(get(g, x, y))) set(g, x, y, ch);
    if (x !== x1 && (y === y1 || R(2))) x += Math.sign(x1 - x); else y += Math.sign(y1 - y);
  }
  if (!keepFn || !keepFn(get(g, x1, y1))) set(g, x1, y1, ch);
}
function ensureConnected(g, from, to, ch) {
  const d = bfs(g, from[0], from[1], passableCh); const W = g[0].length;
  if (d[to[1] * W + to[0]] >= 0) return;
  carveLine(g, from[0], from[1], to[0], to[1], ch, (c) => c === '+' || c === 'G');
}
function scatter(g, ch, n, onlyOn) { const H = g.length, W = g[0].length; for (let i = 0; i < n; i++) { const x = R(W), y = R(H); if (onlyOn.includes(get(g, x, y))) set(g, x, y, ch); } }
function clusters(g, ch, n, size, onlyOn) { const H = g.length, W = g[0].length; for (let i = 0; i < n; i++) { const cx = R(W), cy = R(H); for (let k = 0; k < size; k++) { const x = cx + R(3) - 1, y = cy + R(3) - 1; if (onlyOn.includes(get(g, x, y))) set(g, x, y, ch); } } }

function zonesOf(g, entry, opts = {}) {
  const H = g.length, W = g[0].length; const d = bfs(g, entry[0], entry[1], passableCh);
  const z = { near: [], mid: [], far: [], boss: [] };
  const inBoss = (x, y) => opts.bossRoom && x >= opts.bossRoom.x && x < opts.bossRoom.x + opts.bossRoom.w && y >= opts.bossRoom.y && y < opts.bossRoom.y + opts.bossRoom.h;
  const pts = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[y * W + x] < 0 || !passableCh(g[y][x]) || g[y][x] === '+') continue;
    if (inBoss(x, y)) { z.boss.push([x, y]); continue; }
    pts.push([x, y]);
  }
  const ys = pts.map(p => p[1]); const y0 = Math.min(...ys), y1 = Math.max(...ys); const span = Math.max(1, y1 - y0);
  for (const [x, y] of pts) { const t = (y - y0) / span; if (t > 0.66) z.near.push([x, y]); else if (t > 0.33) z.mid.push([x, y]); else z.far.push([x, y]); }
  // also allow boss-zone reachable only through gate: compute ignoring gate
  if (opts.bossRoom && !z.boss.length) for (let y = opts.bossRoom.y; y < opts.bossRoom.y + opts.bossRoom.h; y++) for (let x = opts.bossRoom.x; x < opts.bossRoom.x + opts.bossRoom.w; x++) if (passableCh(get(g, x, y))) z.boss.push([x, y]);
  if (!z.far.length) z.far = z.mid.slice(); if (!z.mid.length) z.mid = z.near.slice();
  if (!z.boss.length) z.boss = z.far.slice();
  return z;
}

// ---------------- themes ----------------
function town(opts = {}) {
  const W = 16, H = 26; const g = grid(W, H, '.');
  const sea = opts.sea !== false;
  if (sea) { rect(g, 0, 0, W, 3, '~'); rect(g, 0, 3, W, 1, 's'); for (let y = 0; y < 3; y++) { set(g, 4, y, 'p'); set(g, 11, y, 'p'); } set(g, 3, 0, 'p'); set(g, 5, 0, 'p'); }
  // main street + cross street + plaza
  rect(g, 7, sea ? 4 : 0, 2, H - (sea ? 4 : 0), ':'); rect(g, 1, 12, W - 2, 2, ':'); rect(g, 5, 10, 6, 6, ':'); set(g, 7, 12, 'w');
  rect(g, 1, sea ? 4 : 1, W - 2, 1, ':');
  // houses (x,y,w,h, doorSide)
  const houses = [[1, 6, 5, 4, 'r'], [10, 6, 5, 4, 'l'], [1, 16, 5, 4, 'r'], [10, 16, 5, 4, 'l'], [1, 21, 4, 3, 'r'], [11, 21, 4, 3, 'l']];
  const doors = [];
  houses.forEach(([x, y, w, h, side], i) => {
    rect(g, x, y, w, h - 1, 'h'); rect(g, x, y + h - 1, w, 1, '#');
    const dx = side === 'r' ? x + w - 2 : x + 1; set(g, dx, y + h - 1, '+'); set(g, dx, y + h, ':');
    carveLine(g, dx, y + h, 7, y + h, ':', (c) => c === 'w');
    doors.push([dx, y + h - 1]);
  });
  scatter(g, 'T', 10, ['.']); clusters(g, 'r', 2, 2, ['.']); scatter(g, 'o', 6, ['.']);
  set(g, 12, 13, 'f'); set(g, 3, 13, 'f');
  const entry = [7, H - 1];
  const zones = zonesOf(g, entry);
  return { w: W, h: H, g, entry, doors, exitSpots: { near: [7, H - 1], far: [8, sea ? 4 : 0], inn: doors[1] }, zones, npcSpots: [[6, 11], [10, 11], [6, 14], [10, 14], [4, 10], [12, 10], [4, 20], [12, 20]].filter(([x, y]) => passableCh(get(g, x, y))) };
}

function coastroad() {
  const W = 16, H = 26; const g = grid(W, H, '.');
  let edge = 3; for (let y = 0; y < H; y++) { edge = clamp(edge + (R(3) - 1), 2, 5); rect(g, 0, y, edge, 1, '~'); set(g, edge, y, '^'); if (R(3) === 0) set(g, edge + 1, y, 'r'); }
  const px = windingPath(g, 8, H - 1, 0, ',', 2, 3, 6, W - 3);
  // side trail to the far-left (sea caves)
  carveLine(g, px, 3, 6, 1, ',');
  clusters(g, 'r', 5, 3, ['.']); scatter(g, 'T', 14, ['.']); scatter(g, 'x', 6, ['.']);
  const entry = [8, H - 1]; ensureConnected(g, entry, [6, 1], ','); ensureConnected(g, entry, [W - 3, 0], ',');
  set(g, W - 3, 0, ','); set(g, W - 2, 0, ','); carveLine(g, px, 1, W - 3, 0, ',');
  return { w: W, h: H, g, entry, exitSpots: { near: [8, H - 1], far: [6, 1], far2: [W - 3, 0] }, zones: zonesOf(g, entry) };
}

function caveCarve(W, H, floor, wall) {
  const g = grid(W, H, wall);
  let x = Math.floor(W / 2), y = H - 2;
  // main tunnel up
  while (y > 1) { for (let k = -1; k <= 1; k++) set(g, x + k, y, floor); if (R(2)) x = clamp(x + (R(2) ? 1 : -1), 2, W - 3); else y--; }
  // chambers
  for (let i = 0; i < 7; i++) { const cx = 2 + R(W - 4), cy = 2 + R(H - 4), r = 2 + R(2); for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r + 1) set(g, cx + xx, cy + yy, floor); carveLine(g, cx, cy, Math.floor(W / 2), cy + (R(2) ? 2 : -2), floor); }
  // borders stay wall
  for (let yy = 0; yy < H; yy++) { set(g, 0, yy, wall); set(g, W - 1, yy, wall); } for (let xx = 0; xx < W; xx++) set(g, xx, 0, wall);
  set(g, Math.floor(W / 2), H - 1, floor); set(g, Math.floor(W / 2) - 1, H - 1, floor);
  return g;
}

function seacave() {
  const W = 18, H = 28; const g = caveCarve(W, H, 's', '#');
  // water pools & shallows
  for (let i = 0; i < 4; i++) { const cx = 2 + R(W - 4), cy = 4 + R(H - 10); for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) { if (get(g, cx + xx, cy + yy) !== 's') continue; const d2 = xx * xx + yy * yy; if (d2 <= 1) set(g, cx + xx, cy + yy, '~'); else if (d2 <= 5) set(g, cx + xx, cy + yy, '%'); } }
  clusters(g, 'o', 6, 3, ['s']); scatter(g, 'f', 6, ['s']); scatter(g, 'x', 8, ['s']); scatter(g, 'r', 6, ['s']);
  const entry = [Math.floor(W / 2), H - 1];
  // make sure the top is reachable
  const top = [Math.floor(W / 2), 2]; set(g, top[0], top[1], 's'); ensureConnected(g, entry, top, 's');
  return { w: W, h: H, g, entry, exitSpots: { near: entry }, zones: zonesOf(g, entry) };
}

function dungeon(opts = {}) {
  const W = opts.w || 18, H = opts.h || 28; const floor = opts.floor || '='; const g = grid(W, H, '#');
  const rooms = [];
  let bossRoom = null;
  if (opts.boss) { bossRoom = { x: 3, y: 1, w: W - 6, h: 6 }; rect(g, bossRoom.x, bossRoom.y, bossRoom.w, bossRoom.h, floor); }
  const tries = opts.rooms || 9;
  for (let i = 0; i < 60 && rooms.length < tries; i++) {
    const w = 4 + R(4), h = 3 + R(3), x = 1 + R(W - w - 2), y = (opts.boss ? 9 : 1) + R(H - h - (opts.boss ? 11 : 3));
    if (rooms.some(r => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue;
    rect(g, x, y, w, h, floor); rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  const entryRoom = { x: (W >> 1) - 2, y: H - 4, w: 4, h: 3, cx: W >> 1, cy: H - 3 }; rect(g, entryRoom.x, entryRoom.y, entryRoom.w, entryRoom.h, floor); rooms.push(entryRoom);
  rooms.sort((a, b) => b.cy - a.cy);
  for (let i = 1; i < rooms.length; i++) { const a = rooms[i - 1], b = rooms[i]; carveLine(g, a.cx, a.cy, b.cx, b.cy, floor, (c) => c !== '#'); }
  // extra loops
  for (let i = 0; i < 2; i++) { const a = pick(rooms), b = pick(rooms); carveLine(g, a.cx, a.cy, b.cx, b.cy, floor, (c) => c !== '#'); }
  set(g, W >> 1, H - 1, floor);
  let gate = null;
  if (bossRoom) {
    const gx = W >> 1; const top = rooms[rooms.length - 1];
    // corridor from the highest room to the gate under the boss room
    carveLine(g, top.cx, top.cy, gx, bossRoom.y + bossRoom.h + 1, floor, (c) => c !== '#');
    set(g, gx, bossRoom.y + bossRoom.h + 1, floor); set(g, gx - 1, bossRoom.y + bossRoom.h + 1, floor);
    for (let xx = bossRoom.x - 1; xx <= bossRoom.x + bossRoom.w; xx++) set(g, xx, bossRoom.y + bossRoom.h, '#');
    if (opts.gate) { set(g, gx, bossRoom.y + bossRoom.h, 'G'); set(g, gx - 1, bossRoom.y + bossRoom.h, 'G'); gate = [[gx - 1, bossRoom.y + bossRoom.h], [gx, bossRoom.y + bossRoom.h]]; }
    else { set(g, gx, bossRoom.y + bossRoom.h, '+'); }
    // boss room dressing
    set(g, bossRoom.x + 1, bossRoom.y + 1, 'f'); set(g, bossRoom.x + bossRoom.w - 2, bossRoom.y + 1, 'f');
  }
  // doors where corridors meet rooms (light touch)
  rooms.forEach(r => { if (R(2)) return; const y = r.y + r.h; const x = r.cx; if (get(g, x, y) === floor && get(g, x - 1, y) === '#' && get(g, x + 1, y) === '#') set(g, x, y, '+'); });
  // dressing
  const dress = opts.dress || ['x', 'f', '%'];
  rooms.forEach(r => { if (R(3) === 0) set(g, r.x, r.y, 'f'); if (R(2)) set(g, r.x + r.w - 1, r.y + r.h - 1, pick(['o', 'x'])); });
  if (dress.includes('%')) scatter(g, '%', 14, [floor]);
  if (dress.includes('x')) scatter(g, 'x', 10, [floor]);
  const entry = [W >> 1, H - 1];
  ensureConnected(g, entry, [rooms[rooms.length - 1].cx, rooms[rooms.length - 1].cy], floor);
  if (bossRoom) ensureConnected(g, entry, [W >> 1, bossRoom.y + bossRoom.h + 1], floor);
  if (get(g, entry[0], entry[1]) === '+') set(g, entry[0], entry[1], floor);
  return { w: W, h: H, g, entry, rooms, bossRoom, gate, exitSpots: { near: entry, far: [rooms[rooms.length - 1].cx, rooms[rooms.length - 1].cy] }, zones: zonesOf(g, entry, { bossRoom }) };
}

function cellar() {
  const W = 14, H = 22; const r = dungeon({ w: W, h: H, floor: '_', rooms: 6, dress: ['x'] });
  clusters(r.g, 'o', 7, 3, ['_']);
  ensureConnected(r.g, r.entry, r.exitSpots.far, '_');
  r.zones = zonesOf(r.g, r.entry); return r;
}

function causeway() {
  const W = 16, H = 26; const g = grid(W, H, '~');
  // shallows band around a winding stone road
  let x = 6;
  for (let y = H - 1; y >= 4; y--) { rect(g, x - 1, y, 5, 1, '%'); rect(g, x, y, 3, 1, '='); if (R(3) === 0) x = clamp(x + (R(2) ? 1 : -1), 3, W - 6); }
  // islands
  for (let i = 0; i < 4; i++) { const cx = 2 + R(W - 4), cy = 6 + R(H - 10); rect(g, cx - 1, cy - 1, 3, 3, 's'); set(g, cx, cy, pick(['r', 'x', 's'])); carveLine(g, cx, cy, x + 1, cy, '%', (c) => c === '=' || c === 's'); }
  // lighthouse base
  rect(g, 3, 0, W - 6, 4, '#'); rect(g, 6, 2, 4, 2, '='); set(g, 7, 3, '+'); set(g, 8, 3, '+'); rect(g, 6, 4, 4, 1, '=');
  carveLine(g, x + 1, 5, 7, 4, '=');
  const entry = [x + 1, H - 1]; set(g, entry[0], entry[1], '=');
  ensureConnected(g, entry, [7, 4], '=');
  return { w: W, h: H, g, entry, exitSpots: { near: entry, far: [7, 3] }, zones: zonesOf(g, entry) };
}

function forest() {
  const W = 16, H = 26; const g = grid(W, H, '.');
  scatter(g, 'T', 120, ['.']); clusters(g, 'r', 4, 3, ['.']);
  for (let i = 0; i < 4; i++) { const cx = 2 + R(W - 4), cy = 3 + R(H - 6); rect(g, cx - 2, cy - 1, 4, 3, '.'); }
  const px = windingPath(g, 7, H - 1, 0, ',', 2, 3);
  const entry = [7, H - 1]; ensureConnected(g, entry, [px, 0], ',');
  scatter(g, '%', 6, ['.']);
  return { w: W, h: H, g, entry, exitSpots: { near: entry, far: [px, 0] }, zones: zonesOf(g, entry) };
}
function road() {
  const W = 16, H = 26; const g = grid(W, H, '.');
  scatter(g, 'T', 40, ['.']); clusters(g, 'r', 4, 3, ['.']);
  if (R(2)) { const sx = R(W); for (let y = 0; y < H; y++) { set(g, sx, y, '~'); set(g, sx + 1, y, '%'); } }
  const px = windingPath(g, 7, H - 1, 0, ',', 2, 3);
  const entry = [7, H - 1]; ensureConnected(g, entry, [px, 0], ',');
  return { w: W, h: H, g, entry, exitSpots: { near: entry, far: [px, 0] }, zones: zonesOf(g, entry) };
}
function cave() {
  const W = 18, H = 28; const g = caveCarve(W, H, '=', '#');
  scatter(g, 'x', 14, ['=']); clusters(g, 'r', 4, 3, ['=']); scatter(g, '%', 6, ['=']); scatter(g, 'f', 4, ['=']);
  const entry = [Math.floor(W / 2), H - 1]; const top = [Math.floor(W / 2), 2]; set(g, top[0], top[1], '='); ensureConnected(g, entry, top, '=');
  return { w: W, h: H, g, entry, exitSpots: { near: entry, far: top }, zones: zonesOf(g, entry) };
}

const THEMES = {
  town, coastroad, seacave, causeway, forest, road, cave, cellar,
  lighthouse: () => dungeon({ boss: true, gate: true, dress: ['x', '%', 'f'] }),
  dungeon: (o) => dungeon(Object.assign({ boss: true, gate: false }, o || {}))
};
function generate(theme, opts) {
  const fn = THEMES[theme] || THEMES.road;
  const m = fn(opts);
  return Object.assign(m, { theme, tiles: m.g.map(r => r.join('')) });
}

module.exports = { generate, BLOCK, SIGHT_BLOCK, DIFFICULT, THEMES: Object.keys(THEMES) };
