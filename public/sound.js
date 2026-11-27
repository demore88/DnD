// Roll Call sound: synthesized sound effects, location ambience and mood music (Web Audio, no files needed),
// plus optional custom music tracks per mood uploaded by the campaign creator.
(function (root) {
  const KEY = 'rc_sound';
  const DEF = { master: 0.8, music: 0.45, sfx: 0.8, amb: 0.5, mute: false };
  let V = Object.assign({}, DEF); try { Object.assign(V, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
  let ctx = null, out, bus = {}, noiseBuf = null;
  const want = { mood: null, amb: null };
  let mood = null, amb = null, tracks = {}, audioEl = null, musicTimer = null, ambNodes = [], ambTimers = [];

  function ensure() {
    if (ctx) return ctx; const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    out = ctx.createGain(); out.connect(comp); comp.connect(ctx.destination);
    ['music', 'sfx', 'amb'].forEach(k => { bus[k] = ctx.createGain(); bus[k].connect(out); });
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVol(); return ctx;
  }
  function applyVol() { if (!ctx) return; const m = V.mute ? 0 : V.master; out.gain.value = m; bus.music.gain.value = V.music; bus.sfx.gain.value = V.sfx; bus.amb.gain.value = V.amb; if (audioEl) audioEl.volume = Math.min(1, (V.mute ? 0 : V.master) * V.music * 1.6); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(V)); } catch (e) { } applyVol(); }
  function unlock() { const c = ensure(); if (!c) return; if (c.state === 'suspended') c.resume(); if (want.mood !== mood) setMood(want.mood, true); if (want.amb !== amb) setAmb(want.amb, true); }
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => root.addEventListener && root.addEventListener(ev, unlock, { passive: true }));
  const live = () => ctx && ctx.state === 'running';
  const T = () => ctx.currentTime;

  // ---------- building blocks ----------
  function env(g, t, a, peak, hold, rel) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel); }
  function tone(f, t, dur, o = {}) {
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur)); if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain(); env(g, t, o.a || 0.005, o.gain || 0.2, o.hold || 0, o.r || dur);
    let node = osc; if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; f2.Q.value = o.q || 0.7; osc.connect(f2); node = f2; }
    if (o.vib) { const l = ctx.createOscillator(); const lg = ctx.createGain(); l.frequency.value = o.vib; lg.gain.value = f * 0.012; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + (o.r || 0) + 0.1); }
    node.connect(g); g.connect(o.dest || bus.sfx); osc.start(t); osc.stop(t + (o.a || 0.005) + (o.hold || 0) + (o.r || dur) + 0.05);
  }
  function noise(t, dur, o = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1200, t); if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur); f.Q.value = o.q || 1;
    const g = ctx.createGain(); env(g, t, o.a || 0.005, o.gain || 0.2, o.hold || 0, o.r || dur);
    src.connect(f); f.connect(g); g.connect(o.dest || bus.sfx); src.start(t, Math.random()); src.stop(t + (o.a || 0.005) + (o.hold || 0) + (o.r || dur) + 0.05);
  }
  const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const chord = (root2, ints, t, dur, o) => ints.forEach(i => tone(N(root2 + i), t, dur, o));

  // ---------- sound effects ----------
  const FX = {
    tap: (t) => tone(1400, t, 0.04, { type: 'triangle', gain: 0.05, r: 0.04 }),
    hit: (t) => { noise(t, 0.12, { ft: 'lowpass', f: 900, gain: 0.5, r: 0.12 }); tone(140, t, 0.14, { type: 'sine', to: 60, gain: 0.5, r: 0.14 }); },
    crit: (t) => { FX.hit(t); tone(880, t + 0.02, 0.3, { type: 'triangle', gain: 0.15, r: 0.3 }); tone(1320, t + 0.06, 0.4, { type: 'triangle', gain: 0.12, r: 0.4 }); noise(t, 0.25, { ft: 'highpass', f: 4000, gain: 0.15, r: 0.25 }); },
    miss: (t) => noise(t, 0.22, { f: 600, to: 2400, q: 2, gain: 0.25, a: 0.03, r: 0.2 }),
    swing: (t) => noise(t, 0.16, { f: 900, to: 3000, q: 1.5, gain: 0.2, a: 0.02, r: 0.14 }),
    arrow: (t) => { tone(220, t, 0.12, { type: 'triangle', to: 160, gain: 0.25, r: 0.12 }); noise(t + 0.03, 0.25, { f: 3000, to: 1200, q: 3, gain: 0.12, r: 0.22 }); },
    fire: (t) => { noise(t, 0.7, { ft: 'lowpass', f: 400, to: 2400, gain: 0.45, a: 0.08, r: 0.6 }); for (let i = 0; i < 8; i++) noise(t + Math.random() * 0.6, 0.03, { f: 3000, q: 4, gain: 0.15, r: 0.03 }); },
    cold: (t) => { [0, 4, 7, 12].forEach((s, i) => tone(N(88 + s), t + i * 0.04, 0.5, { type: 'sine', gain: 0.07, r: 0.6 })); noise(t, 0.5, { ft: 'highpass', f: 6000, gain: 0.1, r: 0.5 }); },
    lightning: (t) => { noise(t, 0.35, { ft: 'highpass', f: 2000, gain: 0.5, r: 0.3 }); tone(90, t, 0.4, { type: 'sawtooth', to: 40, gain: 0.25, lp: 600, r: 0.4 }); },
    thunder: (t) => { noise(t, 1.2, { ft: 'lowpass', f: 300, to: 80, gain: 0.7, a: 0.02, r: 1.1 }); },
    radiant: (t) => { chord(76, [0, 4, 7, 12], t, 0.9, { type: 'sine', gain: 0.07, a: 0.05, r: 0.9 }); noise(t, 0.6, { ft: 'highpass', f: 5000, gain: 0.08, r: 0.6 }); },
    necrotic: (t) => { tone(90, t, 0.8, { type: 'sawtooth', to: 50, lp: 400, gain: 0.3, a: 0.05, r: 0.7 }); tone(95, t, 0.8, { type: 'sawtooth', to: 48, lp: 400, gain: 0.2, a: 0.05, r: 0.7 }); },
    force: (t) => { tone(300, t, 0.3, { type: 'sine', to: 900, gain: 0.25, r: 0.25 }); tone(150, t + 0.05, 0.3, { type: 'triangle', to: 70, gain: 0.3, r: 0.3 }); },
    acid: (t) => { for (let i = 0; i < 6; i++) tone(600 + Math.random() * 900, t + i * 0.05, 0.06, { type: 'sine', to: 200, gain: 0.08, r: 0.06 }); noise(t, 0.4, { f: 2000, q: 1, gain: 0.12, r: 0.4 }); },
    poison: (t) => FX.acid(t),
    psychic: (t) => { tone(500, t, 0.7, { type: 'sine', vib: 9, gain: 0.12, r: 0.7 }); tone(740, t, 0.7, { type: 'sine', vib: 7, gain: 0.09, r: 0.7 }); },
    heal: (t) => [0, 4, 7, 12, 16].forEach((s, i) => tone(N(72 + s), t + i * 0.07, 0.35, { type: 'sine', gain: 0.1, r: 0.4 })),
    buff: (t) => [12, 7, 16, 19].forEach((s, i) => tone(N(79 + s), t + i * 0.05, 0.25, { type: 'triangle', gain: 0.06, r: 0.3 })),
    debuff: (t) => [0, -3, -6].forEach((s, i) => tone(N(64 + s), t + i * 0.09, 0.3, { type: 'triangle', gain: 0.1, r: 0.3 })),
    dice: (t) => { for (let i = 0; i < 7; i++) { const tt = t + i * 0.055 + Math.random() * 0.02; noise(tt, 0.02, { f: 2500 + Math.random() * 2500, q: 6, gain: 0.25 * (1 - i / 9), r: 0.03 }); } },
    nat20: (t) => { [0, 4, 7, 12].forEach((s, i) => tone(N(72 + s), t + i * 0.09, 0.4, { type: 'square', lp: 2400, gain: 0.07, r: 0.4 })); chord(84, [0, 4, 7], t + 0.4, 0.9, { type: 'triangle', gain: 0.07, r: 0.9 }); },
    nat1: (t) => [0, -1, -2, -5].forEach((s, i) => tone(N(58 + s), t + i * 0.22, 0.25, { type: 'sawtooth', lp: 900, gain: 0.12, r: i === 3 ? 0.7 : 0.25, vib: i === 3 ? 6 : 0 })),
    coin: (t) => { tone(1568, t, 0.08, { type: 'square', lp: 4000, gain: 0.06, r: 0.1 }); tone(2093, t + 0.08, 0.2, { type: 'square', lp: 4000, gain: 0.06, r: 0.25 }); },
    chest: (t) => { tone(160, t, 0.25, { type: 'sawtooth', to: 260, lp: 700, gain: 0.12, r: 0.25 }); FX.coin(t + 0.25); },
    door: (t) => { tone(110, t, 0.6, { type: 'sawtooth', to: 170, lp: 500, q: 6, gain: 0.12, a: 0.05, r: 0.5 }); noise(t + 0.5, 0.15, { ft: 'lowpass', f: 400, gain: 0.3, r: 0.15 }); },
    step: (t) => noise(t, 0.05, { ft: 'lowpass', f: 500, gain: 0.08, r: 0.05 }),
    trap: (t) => { noise(t, 0.08, { ft: 'highpass', f: 2000, gain: 0.4, r: 0.08 }); tone(300, t, 0.2, { type: 'square', to: 80, lp: 1200, gain: 0.2, r: 0.2 }); },
    roar: (t) => { tone(120, t, 0.9, { type: 'sawtooth', to: 60, lp: 900, gain: 0.25, a: 0.08, r: 0.8, vib: 13 }); tone(127, t, 0.9, { type: 'sawtooth', to: 55, lp: 700, gain: 0.2, a: 0.08, r: 0.8 }); noise(t, 0.9, { ft: 'lowpass', f: 700, gain: 0.25, a: 0.08, r: 0.8 }); },
    summon: (t) => { noise(t, 0.6, { f: 300, to: 3000, q: 3, gain: 0.2, a: 0.2, r: 0.4 }); tone(200, t, 0.6, { type: 'sine', to: 600, gain: 0.1, a: 0.2, r: 0.4 }); },
    down: (t) => [0, -4, -7, -12].forEach((s, i) => tone(N(60 + s), t + i * 0.16, 0.3, { type: 'triangle', gain: 0.12, r: 0.35 })),
    kill: (t) => { tone(220, t, 0.25, { type: 'square', to: 55, lp: 1500, gain: 0.12, r: 0.25 }); noise(t, 0.2, { ft: 'lowpass', f: 800, gain: 0.2, r: 0.2 }); },
    levelup: (t) => { [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(N(67 + s), t + i * 0.07, 0.3, { type: 'square', lp: 3000, gain: 0.05, r: 0.3 })); chord(79, [0, 4, 7, 12], t + 0.5, 1.2, { type: 'triangle', gain: 0.06, a: 0.02, r: 1.2 }); },
    quest: (t) => { [[0, 0], [7, 0.15], [12, 0.3]].forEach(([s, d]) => tone(N(67 + s), t + d, 0.25, { type: 'square', lp: 2500, gain: 0.07, r: 0.25 })); chord(79, [0, 4, 7], t + 0.45, 1.1, { type: 'triangle', gain: 0.07, r: 1.1 }); },
    victory: (t) => { [[0, 0], [0, 0.14], [0, 0.28], [4, 0.42], [2, 0.7], [4, 0.84], [7, 1.0]].forEach(([s, d]) => tone(N(72 + s), t + d, 0.16, { type: 'square', lp: 2600, gain: 0.07, r: 0.16 })); chord(72, [0, 4, 7, 12], t + 1.15, 1.4, { type: 'triangle', gain: 0.07, r: 1.4 }); },
    defeat: (t) => [0, -2, -3, -7].forEach((s, i) => tone(N(57 + s), t + i * 0.4, 0.5, { type: 'sawtooth', lp: 700, gain: 0.12, a: 0.05, r: 0.6 })),
    turn: (t) => { tone(N(84), t, 0.2, { type: 'sine', gain: 0.12, r: 0.3 }); tone(N(91), t + 0.12, 0.3, { type: 'sine', gain: 0.1, r: 0.4 }); },
    initiative: (t) => { tone(80, t, 0.3, { type: 'sine', to: 40, gain: 0.6, r: 0.3 }); noise(t, 0.3, { ft: 'lowpass', f: 300, gain: 0.3, r: 0.3 }); tone(N(64), t + 0.1, 0.6, { type: 'sawtooth', lp: 1200, gain: 0.08, r: 0.6 }); tone(N(65), t + 0.1, 0.6, { type: 'sawtooth', lp: 1200, gain: 0.06, r: 0.6 }); },
    shield: (t) => { tone(N(84), t, 0.4, { type: 'triangle', gain: 0.1, r: 0.4 }); noise(t, 0.3, { ft: 'highpass', f: 5000, gain: 0.1, r: 0.3 }); },
    xcard: (t) => chord(72, [0, 7, 12], t, 1.2, { type: 'sine', gain: 0.06, a: 0.1, r: 1.2 }),
    pet: (t) => { tone(700, t, 0.08, { type: 'triangle', to: 1000, gain: 0.08, r: 0.08 }); tone(900, t + 0.1, 0.1, { type: 'triangle', to: 600, gain: 0.08, r: 0.1 }); }
  };
  function sfx(name, delay = 0) { if (!live() || V.mute || !FX[name]) return; try { FX[name](T() + 0.01 + delay); } catch (e) { } }

  // ---------- music: small generative score per mood ----------
  const MOODS = {
    town: { bpm: 96, root: 62, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3], drums: 'light', lead: 'flute', pad: 0.03, bass: 'pluck' },
    explore: { bpm: 74, root: 57, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 6, 4], drums: null, lead: 'pluck', pad: 0.04, bass: 'soft' },
    dungeon: { bpm: 58, root: 50, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 0, 5, 6], drums: 'heart', lead: 'bell', pad: 0.045, bass: 'drone' },
    combat: { bpm: 132, root: 52, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 0, 5, 6], drums: 'drive', lead: 'stab', pad: 0.02, bass: 'eighths' },
    boss: { bpm: 140, root: 50, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 5, 3, 4], drums: 'war', lead: 'choir', pad: 0.035, bass: 'eighths' }
  };
  let step = 0, nextT = 0;
  function chordOf(M, bar) { const deg = M.prog[bar % M.prog.length]; const sc = M.scale; return [0, 2, 4].map(k => M.root + sc[(deg + k) % 7] + 12 * Math.floor((deg + k) / 7)); }
  function playStep(M, t, s) {
    const bar = Math.floor(s / 16), st = s % 16, beat = 60 / M.bpm / 4; const ch = chordOf(M, bar); const d = bus.music;
    if (st === 0 && M.pad) ch.forEach((n, i) => { tone(N(n), t, beat * 16, { type: 'sawtooth', lp: 900, gain: M.pad, a: beat * 4, r: beat * 6, detune: i * 4 - 4, dest: d }); tone(N(n), t, beat * 16, { type: 'sawtooth', lp: 900, gain: M.pad * 0.7, a: beat * 4, r: beat * 6, detune: 7, dest: d }); });
    // bass
    if (M.bass === 'drone' && st === 0) tone(N(ch[0] - 12), t, beat * 16, { type: 'triangle', gain: 0.12, a: beat * 2, r: beat * 4, dest: d });
    if (M.bass === 'soft' && (st === 0 || st === 8)) tone(N(ch[0] - 12), t, beat * 6, { type: 'triangle', gain: 0.1, r: beat * 6, dest: d });
    if (M.bass === 'pluck' && st % 4 === 0) tone(N(ch[st === 4 || st === 12 ? 2 : 0] - 12), t, beat * 2, { type: 'triangle', gain: 0.1, r: beat * 2.5, dest: d });
    if (M.bass === 'eighths' && st % 2 === 0) tone(N(ch[0] - 24 + (st === 14 ? 7 : 0)), t, beat * 1.6, { type: 'sawtooth', lp: 500, gain: 0.12, r: beat * 1.4, dest: d });
    // drums
    const kick = (g) => { tone(110, t, 0.15, { type: 'sine', to: 45, gain: g, r: 0.15, dest: d }); };
    const snare = (g) => { noise(t, 0.15, { f: 1800, q: 0.8, gain: g, r: 0.14, dest: d }); tone(200, t, 0.08, { type: 'triangle', gain: g * 0.4, r: 0.08, dest: d }); };
    const hat = (g) => noise(t, 0.03, { ft: 'highpass', f: 7000, gain: g, r: 0.03, dest: d });
    if (M.drums === 'light') { if (st % 4 === 2) hat(0.04); if (st === 0 || st === 8) kick(0.12); }
    if (M.drums === 'heart' && (st === 0 || st === 3) && bar % 2 === 0) kick(0.22);
    if (M.drums === 'drive') { if (st % 4 === 0) kick(0.32); if (st === 4 || st === 12) snare(0.2); if (st % 2 === 0) hat(0.05); if (st === 14 && bar % 2) snare(0.12); }
    if (M.drums === 'war') { if ([0, 3, 6, 8, 11].includes(st)) kick(0.35); if (st === 4 || st === 12) snare(0.24); if (st % 2) hat(0.04); if (st >= 12 && bar % 4 === 3) tone(160 - st * 4, t, 0.2, { type: 'sine', to: 70, gain: 0.25, r: 0.2, dest: d }); }
    // lead
    const sc = M.scale; const pick = () => M.root + 12 + sc[Math.floor(Math.random() * 7)];
    if (M.lead === 'flute' && st % 2 === 0 && Math.random() < 0.45) tone(N(pick()), t, beat * 2, { type: 'sine', vib: 5, gain: 0.07, a: 0.03, r: beat * 2, dest: d });
    if (M.lead === 'pluck' && st % 2 === 0 && Math.random() < 0.3) tone(N(Math.random() < 0.5 ? ch[Math.floor(Math.random() * 3)] + 12 : pick()), t, beat * 3, { type: 'triangle', gain: 0.08, r: beat * 4, dest: d });
    if (M.lead === 'bell' && st === 0 && Math.random() < 0.6) tone(N(pick() + 12), t + beat * Math.floor(Math.random() * 8), beat * 8, { type: 'sine', gain: 0.05, r: beat * 10, dest: d });
    if (M.lead === 'stab' && (st === 0 || st === 3 || st === 6 || st === 10) && bar % 2 === 0) ch.forEach(n => tone(N(n + 12), t, beat, { type: 'sawtooth', lp: 1800, gain: 0.035, r: beat * 0.8, dest: d }));
    if (M.lead === 'choir' && st === 0) ch.forEach(n => { tone(N(n + 12), t, beat * 16, { type: 'sawtooth', lp: 1100, q: 4, gain: 0.03, a: beat * 3, r: beat * 4, vib: 5, dest: d }); });
  }
  function scheduler() {
    if (!live() || !mood || !MOODS[mood] || tracks[mood]) return;
    const M = MOODS[mood]; const beat = 60 / M.bpm / 4;
    while (nextT < T() + 0.15) { playStep(M, nextT, step); step++; nextT += beat; }
  }
  function setMood(m, force) {
    want.mood = m; if (!ctx || !live()) return; if (m === mood && !force) return;
    mood = m; step = 0; nextT = T() + 0.1;
    // custom track for this mood?
    if (audioEl) { const el = audioEl; audioEl = null; let v = el.volume; const fade = setInterval(() => { v -= 0.05; if (v <= 0) { clearInterval(fade); el.pause(); } else el.volume = v; }, 60); }
    if (m && tracks[m]) { audioEl = new Audio(tracks[m]); audioEl.loop = true; audioEl.volume = 0; applyVol(); const tgt = audioEl.volume; audioEl.volume = 0; audioEl.play().catch(() => { }); let v = 0; const el = audioEl; const fi = setInterval(() => { v = Math.min(tgt, v + 0.04); if (el) el.volume = v; if (v >= tgt) clearInterval(fi); }, 80); }
    if (!musicTimer) musicTimer = setInterval(scheduler, 50);
  }

  // ---------- ambience ----------
  function loopNoise(o) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const f = ctx.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.frequency.value = o.f || 500; f.Q.value = o.q || 0.7;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(o.gain || 0.1, T() + 2);
    if (o.lfo) { const l = ctx.createOscillator(); const lg = ctx.createGain(); l.frequency.value = o.lfo; lg.gain.value = (o.gain || 0.1) * (o.depth || 0.8); l.connect(lg); lg.connect(g.gain); l.start(); ambNodes.push(l); }
    if (o.sweep) { const l = ctx.createOscillator(); const lg = ctx.createGain(); l.frequency.value = o.sweep; lg.gain.value = o.f * 0.6; l.connect(lg); lg.connect(f.frequency); l.start(); ambNodes.push(l); }
    src.connect(f); f.connect(g); g.connect(bus.amb); src.start(); ambNodes.push(src); ambNodes.push(g);
  }
  function drone(f, gain) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(gain, T() + 3); o.connect(g); g.connect(bus.amb); o.start(); ambNodes.push(o); ambNodes.push(g); }
  function every(ms, fn, jitter = 0.6) { const go = () => { const id = setTimeout(() => { if (live()) try { fn(T()); } catch (e) { } go(); }, ms * (1 - jitter / 2 + Math.random() * jitter)); ambTimers.push(id); }; go(); }
  const A = { dest: null };
  const AMB = {
    sea: () => { loopNoise({ f: 500, gain: 0.16, lfo: 0.09, depth: 0.9 }); loopNoise({ f: 1800, ft: 'bandpass', q: 0.5, gain: 0.04, lfo: 0.13 }); every(9000, (t) => { tone(1800, t, 0.25, { type: 'sine', to: 1200, gain: 0.03, r: 0.25, dest: bus.amb }); tone(1500, t + 0.3, 0.3, { type: 'sine', to: 1100, gain: 0.025, r: 0.3, dest: bus.amb }); }); },
    town: () => { loopNoise({ f: 400, ft: 'bandpass', q: 0.6, gain: 0.035, lfo: 0.3, depth: 0.5 }); every(7000, (t) => { tone(1900, t, 0.2, { type: 'sine', to: 1300, gain: 0.025, r: 0.2, dest: bus.amb }); }); every(26000, (t) => [0, 0.9].forEach(d => tone(N(69), t + d, 2.5, { type: 'sine', gain: 0.02, r: 2.5, dest: bus.amb }))); every(11000, (t) => { noise(t, 0.04, { f: 3000, q: 8, gain: 0.03, r: 0.05, dest: bus.amb }); noise(t + 0.12, 0.04, { f: 3400, q: 8, gain: 0.025, r: 0.05, dest: bus.amb }); }); },
    forest: () => { loopNoise({ f: 700, ft: 'bandpass', q: 0.4, gain: 0.05, sweep: 0.05 }); every(3500, (t) => { const f = 2200 + Math.random() * 1800; for (let i = 0; i < 3; i++) tone(f + i * 120, t + i * 0.09, 0.07, { type: 'sine', to: f * 1.3, gain: 0.018, r: 0.07, dest: bus.amb }); }); },
    swamp: () => { loopNoise({ f: 4500, ft: 'bandpass', q: 3, gain: 0.015, lfo: 6, depth: 0.6 }); every(2800, (t) => { for (let i = 0; i < 3; i++) tone(140 + Math.random() * 40, t + i * 0.13, 0.08, { type: 'square', lp: 500, gain: 0.04, r: 0.08, dest: bus.amb }); }); loopNoise({ f: 300, gain: 0.03 }); },
    cave: () => { drone(N(38), 0.03); drone(N(45), 0.015); loopNoise({ f: 220, gain: 0.04, lfo: 0.05 }); every(2600, (t) => { const f = 900 + Math.random() * 900; tone(f, t, 0.12, { type: 'sine', to: f * 0.5, gain: 0.05, r: 0.15, dest: bus.amb }); }); every(30000, (t) => noise(t, 2, { ft: 'lowpass', f: 120, gain: 0.12, a: 0.5, r: 1.5, dest: bus.amb })); },
    wind: () => { loopNoise({ f: 600, ft: 'bandpass', q: 0.8, gain: 0.06, sweep: 0.07, lfo: 0.11, depth: 0.6 }); every(12000, (t) => tone(2400, t, 0.15, { type: 'sine', to: 1700, gain: 0.015, r: 0.15, dest: bus.amb })); }
  };
  function stopAmb() { ambTimers.forEach(clearTimeout); ambTimers = []; const old = ambNodes; ambNodes = []; old.forEach(n => { try { if (n.gain) { n.gain.cancelScheduledValues(T()); n.gain.setValueAtTime(n.gain.value, T()); n.gain.linearRampToValueAtTime(0, T() + 1.2); } } catch (e) { } }); setTimeout(() => old.forEach(n => { try { n.stop && n.stop(); n.disconnect(); } catch (e) { } }), 1400); }
  function setAmb(a, force) { want.amb = a; if (!ctx || !live()) return; if (a === amb && !force) return; amb = a; stopAmb(); if (a && AMB[a]) AMB[a](); }

  // ---------- game hooks ----------
  const DMG_FX = { fire: 'fire', cold: 'cold', lightning: 'lightning', thunder: 'thunder', radiant: 'radiant', necrotic: 'necrotic', force: 'force', acid: 'acid', poison: 'poison', psychic: 'psychic' };
  function onLog(e) {
    const f = e.fx || {}; const k = f.k;
    if (k === 'atk') { if (f.ranged) sfx('arrow'); else sfx('swing'); sfx(f.crit ? 'crit' : f.hit ? 'hit' : 'miss', f.ranged ? 0.18 : 0.08); return; }
    if (k === 'spell') { const ty = f.type; sfx(DMG_FX[ty] || (ty === 'heal' || f.heal ? 'heal' : ty === 'buff' ? 'buff' : ty === 'debuff' || ty === 'sleep' ? 'debuff' : ty === 'summon' ? 'summon' : 'force')); return; }
    if (k === 'blast') { sfx(DMG_FX[f.type] || 'fire'); return; }
    if (k === 'heal' || k === 'healall') return sfx('heal');
    if (k === 'buff') return sfx(/shield/i.test(f.name || '') ? 'shield' : 'buff');
    if (k === 'kill') return sfx('kill');
    if (k === 'down' || k === 'die') return sfx('down');
    if (k === 'summon') return sfx('roar');
    if (k === 'trap') return sfx('trap');
    if (k === 'levelup') return sfx('levelup');
    if (k === 'quest') return sfx('quest');
    if (k === 'victory') return sfx('victory');
    if (k === 'xcard') return sfx('xcard');
    if (k === 'check' || k === 'free') { sfx('dice'); if (f.pick === 20) sfx('nat20', 0.45); if (f.pick === 1) sfx('nat1', 0.45); return; }
    if (e.kind === 'initiative') return sfx('initiative');
    if (e.kind === 'loot') return sfx(/opens/.test(e.text) ? 'chest' : 'coin');
    if (e.kind === 'scene' || e.kind === 'title') return sfx('door');
    if (e.kind === 'alert' && /fallen/.test(e.text)) return sfx('defeat');
  }
  function update(C) {
    if (!C || !C.scene) { setMood(null); setAmb(null); return; }
    tracks = (C.music || {});
    const s = C.scene; const combat = C.turn && C.turn.mode === 'combat';
    const boss = combat && s.tokens.some(t => t.kind === 'monster' && t.boss);
    const m = combat ? (boss ? 'boss' : 'combat') : s.kind === 'town' ? 'town' : s.dark ? 'dungeon' : 'explore';
    setMood(m);
    const th = s.theme;
    const a = s.kind === 'town' ? (/salt|bright|harbor|port|cove/i.test(s.name) ? 'sea' : 'town') : ['seacave', 'coastroad', 'causeway', 'lighthouse'].includes(th) ? 'sea' : th === 'forest' ? (/mire|fen|bog|marsh|swamp/i.test(s.name) ? 'swamp' : 'forest') : ['cave', 'dungeon', 'cellar'].includes(th) ? 'cave' : 'wind';
    setAmb(a);
  }
  function settingsHTML() {
    const sl = (k, label) => `<div class="row snd"><span class="grow">${label}</span><input type="range" min="0" max="100" value="${Math.round(V[k] * 100)}" data-snd="${k}"></div>`;
    return `${sl('master', '🔊 Master')}${sl('music', '🎵 Music')}${sl('sfx', '💥 Effects')}${sl('amb', '🌊 Ambience')}<button class="chip ${V.mute ? 'on' : ''}" id="sndMute">${V.mute ? '🔇 Muted' : '🔈 Mute all'}</button>`;
  }
  function bindSettings(m) {
    m.querySelectorAll('[data-snd]').forEach(r => r.oninput = () => { V[r.dataset.snd] = r.value / 100; save(); });
    const b = m.querySelector('#sndMute'); if (b) b.onclick = () => { V.mute = !V.mute; save(); b.classList.toggle('on', V.mute); b.textContent = V.mute ? '🔇 Muted' : '🔈 Mute all'; if (!V.mute) { unlock(); sfx('turn'); } };
  }
  let ducked = false;
  function duck(on) { ducked = on; if (!ctx) return; const t = T(); ['music', 'amb'].forEach(k => { const g = bus[k].gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime((k === 'music' ? V.music : V.amb) * (on ? 0.3 : 1), t + 0.4); }); if (audioEl) audioEl.volume = Math.min(1, (V.mute ? 0 : V.master) * V.music * 1.6 * (on ? 0.3 : 1)); }
  root.SOUND = { duck, sfx, onLog, update, setMood, setAmb, settingsHTML, bindSettings, unlock, MOODS: ['town', 'explore', 'dungeon', 'combat', 'boss'], get muted() { return V.mute; } };
})(typeof window !== 'undefined' ? window : globalThis);
