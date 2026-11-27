// Roll Call narrator: reads the story aloud. Uses the device's built-in voices for free; if the server has a
// premium voice key (ELEVENLABS_API_KEY), players can switch on lifelike AI voices.
// Every NPC keeps their own voice; the DM has a steady narrator voice.
(function (root) {
  const KEY = 'rc_narr';
  const DEF = { on: true, mode: 'story', rate: 1, premium: false, narrator: '' };
  let V = Object.assign({}, DEF); try { Object.assign(V, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(V)); } catch (e) { } };
  const synth = root.speechSynthesis; let voices = []; let unlocked = false; let premiumOK = false; let token = null;
  const queue = []; let busy = false; let current = null;

  function loadVoices() {
    if (!synth) return; const all = synth.getVoices() || [];
    const en = all.filter(v => /^en(-|_|$)/i.test(v.lang)); voices = en.length ? en : all;
    const score = (v) => (/natural|neural|premium|enhanced|siri|google/i.test(v.name) ? 3 : 0) + (/en-GB/i.test(v.lang) ? 1 : 0) + (v.localService ? 0.5 : 0);
    voices.sort((a, b) => score(b) - score(a));
  }
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }
  const hash = (s) => { let h = 5; for (const ch of String(s)) h = (h * 33 + ch.charCodeAt(0)) >>> 0; return h; };
  const MALE = /daniel|george|arthur|guy|ryan|thomas|fred|alex|aaron|james|david|mark|oliver|male|rishi|gordon|lee|reed|eddy|ralph|bruce|junior/i;
  function narratorVoice() { if (V.narrator) { const v = voices.find(x => x.name === V.narrator); if (v) return v; } return voices.find(v => MALE.test(v.name) && /GB|UK|British|Daniel|George|Arthur/i.test(v.lang + v.name)) || voices.find(v => MALE.test(v.name)) || voices[0]; }
  function voiceFor(e) {
    if (e.kind === 'npc' && e.npc) { const h = hash(e.npc); const pool = voices.filter(v => v !== narratorVoice()); const v = pool.length ? pool[h % pool.length] : narratorVoice(); return { v, pitch: 0.75 + ((h >> 4) % 8) * 0.08, rate: 0.92 + ((h >> 8) % 5) * 0.04, id: 'npc:' + e.npc }; }
    if (e.kind === 'kill' || /monster/.test(e.who || '')) return { v: narratorVoice(), pitch: 0.6, rate: 0.9, id: 'monster' };
    return { v: narratorVoice(), pitch: 0.95, rate: 0.98, id: 'dm' };
  }
  const STORY = new Set(['title', 'scene', 'narration', 'npc', 'clue', 'quest', 'victory', 'levelup']);
  const ALL = new Set([...STORY, 'roll', 'spell', 'feature', 'alert', 'kill', 'loot', 'initiative']);
  function clean(t) {
    return String(t || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/[*_#`~>|]/g, '').replace(/\bHP\b/g, 'hit points').replace(/\bAC\b/g, 'armor class').replace(/\bDC\b/g, 'difficulty').replace(/(\d+)d(\d+)/g, '$1 d $2').replace(/\s+/g, ' ').trim();
  }
  function lineFor(e) {
    if (e.kind === 'scene') return clean(e.text) + (e.desc ? '. ' + clean(e.desc) : '');
    if (e.kind === 'title') return clean(e.text) + (e.premise ? '. ' + clean(e.premise) : '');
    if (e.kind === 'npc') return clean(e.text);
    if (e.kind === 'initiative') return 'Roll for initiative!';
    return clean(e.text);
  }
  function wanted(e) { if (!V.on || !e || !e.text) return false; return (V.mode === 'all' ? ALL : STORY).has(e.kind); }

  // ---------- playback ----------
  function duck(on) { try { root.SOUND && root.SOUND.duck && root.SOUND.duck(on); } catch (e) { } }
  function next() {
    if (busy || !queue.length) return; const job = queue.shift(); busy = true; duck(true);
    const done = () => { busy = false; current = null; if (!queue.length) duck(false); setTimeout(next, 120); };
    if (V.premium && premiumOK && token) return playPremium(job).then(done, () => { speakLocal(job, done); });
    speakLocal(job, done);
  }
  function speakLocal(job, done) {
    if (!synth) return done(); const u = new SpeechSynthesisUtterance(job.text); const vv = job.voice;
    if (vv.v) u.voice = vv.v; u.lang = (vv.v && vv.v.lang) || 'en-US'; u.pitch = vv.pitch; u.rate = Math.max(0.5, Math.min(2, vv.rate * V.rate));
    let finished = false; const fin = () => { if (finished) return; finished = true; clearTimeout(guard); done(); };
    u.onend = fin; u.onerror = fin; const guard = setTimeout(fin, 2500 + job.text.length * 90 / V.rate);
    current = { stop: () => synth.cancel() }; synth.speak(u);
  }
  async function playPremium(job) {
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ text: job.text.slice(0, 600), voice: job.voice.id }) });
    if (!r.ok) throw new Error('tts'); const blob = await r.blob(); const url = URL.createObjectURL(blob);
    return new Promise((res, rej) => { const a = new Audio(url); a.playbackRate = Math.max(0.6, Math.min(1.6, V.rate)); current = { stop: () => { a.pause(); res(); } }; a.onended = () => { URL.revokeObjectURL(url); res(); }; a.onerror = rej; a.play().catch(rej); });
  }
  function enqueue(e, force) {
    if (!force && !wanted(e)) return; const text = lineFor(e); if (!text) return;
    if (force) stop();
    if (queue.length >= 5) queue.splice(0, queue.length - 4); // never fall far behind the game
    queue.push({ text, voice: voiceFor(e) }); next();
  }
  function stop() { queue.length = 0; try { current && current.stop(); } catch (e) { } if (synth) synth.cancel(); busy = false; duck(false); }
  function unlock() { if (unlocked || !synth) return; unlocked = true; try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) { } }
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => root.addEventListener && root.addEventListener(ev, unlock, { passive: true }));

  // ---------- settings UI ----------
  function settingsHTML() {
    const opts = voices.slice(0, 40).map(v => `<option value="${v.name.replace(/"/g, '&quot;')}" ${narratorVoice() === v ? 'selected' : ''}>${v.name.replace(/</g, '')} (${v.lang})</option>`).join('');
    return `<h3>🗣️ Narrator</h3><div class="chips"><button class="chip ${V.on ? 'on' : ''}" id="nOn">${V.on ? '🗣️ Narrator on' : '🤐 Narrator off'}</button>
      <button class="chip ${V.mode === 'story' ? 'on' : ''}" data-nm="story">📖 Story only</button><button class="chip ${V.mode === 'all' ? 'on' : ''}" data-nm="all">🎲 Story + dice</button></div>
      <div class="row snd"><span class="grow">🐢 Speed 🐇</span><input type="range" min="60" max="160" value="${Math.round(V.rate * 100)}" id="nRate"></div>
      ${synth ? `<label class="small">Narrator voice</label><select id="nVoice">${opts}</select>` : '<div class="small muted">This device has no built-in voices.</div>'}
      ${premiumOK ? `<button class="chip ${V.premium ? 'on' : ''}" id="nPrem">✨ Premium AI voices ${V.premium ? 'on' : 'off'}</button>` : ''}
      <button class="btn ghost block" id="nTest">▶️ Test the narrator</button>`;
  }
  function bindSettings(m) {
    const q = (s) => m.querySelector(s), qa = (s) => m.querySelectorAll(s);
    if (q('#nOn')) q('#nOn').onclick = () => { V.on = !V.on; save(); if (!V.on) stop(); q('#nOn').classList.toggle('on', V.on); q('#nOn').textContent = V.on ? '🗣️ Narrator on' : '🤐 Narrator off'; };
    qa('[data-nm]').forEach(b => b.onclick = () => { V.mode = b.dataset.nm; save(); qa('[data-nm]').forEach(x => x.classList.toggle('on', x === b)); });
    if (q('#nRate')) q('#nRate').oninput = (e) => { V.rate = e.target.value / 100; save(); };
    if (q('#nVoice')) q('#nVoice').onchange = (e) => { V.narrator = e.target.value; save(); };
    if (q('#nPrem')) q('#nPrem').onclick = () => { V.premium = !V.premium; save(); q('#nPrem').classList.toggle('on', V.premium); q('#nPrem').textContent = `✨ Premium AI voices ${V.premium ? 'on' : 'off'}`; };
    if (q('#nTest')) q('#nTest').onclick = () => { unlock(); enqueue({ kind: 'narration', text: 'The tavern falls silent as the door creaks open. Rain drips from your cloak. Somewhere in the dark, a bell begins to toll.' }, true); setTimeout(() => enqueue({ kind: 'npc', npc: 'test_barkeep', text: 'Well now, you lot look like trouble. Sit down before you drip on my floor.' }), 50); };
  }
  function setToken(t) { token = t; if (!t) return; fetch('/api/tts/status', { headers: { authorization: 'Bearer ' + t } }).then(r => r.json()).then(j => { premiumOK = !!j.premium; }).catch(() => { }); }
  root.NARR = { onLog: (e) => enqueue(e), say: (e) => { unlock(); enqueue(e, true); }, stop, settingsHTML, bindSettings, setToken, get on() { return V.on; }, canSay: (e) => ALL.has(e.kind) || STORY.has(e.kind) };
})(typeof window !== 'undefined' ? window : globalThis);
