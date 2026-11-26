/* Roll Call — phone client */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RR = window.RULES, ART = window.ART, BOARD = window.BOARD;
  const app = $('#app'), sheetRoot = $('#modal');
  const fmt = (n) => (n >= 0 ? '+' : '') + n;
  const cap = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  const S = { token: localStorage.getItem('rc_token'), me: null, campaigns: [], C: null, tab: 'play', ws: null, view: 'splash', aiReady: false, drawer: 'peek', target: null, lastLogId: null, seenFx: new Set(), creator: null, composer: null };

  // ---------------- utils ----------------
  async function api(path, body) {
    const res = await fetch('/api' + path, { method: body !== undefined ? 'POST' : 'GET', headers: Object.assign({ 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' }, S.token ? { authorization: 'Bearer ' + S.token } : {}), body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    let j = {}; try { j = await res.json(); } catch (e) { }
    if (res.status === 401) { logout(); throw new Error('Please log in'); }
    if (!res.ok) throw new Error(j.error || 'Something went wrong');
    return j;
  }
  function toast(msg, kind) { const d = document.createElement('div'); d.className = kind || ''; d.textContent = msg; $('#toast').appendChild(d); setTimeout(() => d.remove(), 2600); }
  async function act(op, body) { try { const r = await api(`/c/${S.C.id}/${op}`, body || {}); if (r.note) toast(r.note); return r; } catch (e) { toast(e.message, 'err'); buzz(80); throw e; } }
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };
  function sheet(html, onMount, opts = {}) {
    sheetRoot.innerHTML = `<div class="backdrop" data-close></div><div class="sheet ${opts.cls || ''}"><button class="x" data-close aria-label="Close">✕</button>${html}</div>`;
    sheetRoot.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
    if (onMount) onMount(sheetRoot.querySelector('.sheet'));
  }
  function closeSheet() { sheetRoot.innerHTML = ''; }
  const sheetOpen = () => !!sheetRoot.innerHTML;
  function logout() { localStorage.removeItem('rc_token'); S.token = null; S.me = null; if (S.ws) S.ws.close(); showSplash(true); }
  const svgImg = (svg, cls = '') => `<span class="pic ${cls}">${svg}</span>`;
  function gearOf(ch) {
    if (!ch.weapons) return ch.gear || {}; const w0 = ch.weapons[0], w1 = ch.weapons[1];
    const main = w0 ? (ch.class === 'Wizard' && w0.k === 'quarterstaff' ? 'staff' : w0.k) : null; let off = null;
    if (ch.equip && ch.equip.shield) off = 'shield'; else if (w0 && w1 && w0.light && w1.light && !w0.ranged && !w1.ranged) off = w1.k;
    else if (w0 && !w0.ranged && !['greataxe', 'greatsword', 'quarterstaff', 'spear'].includes(w0.k)) off = { Sorcerer: 'flame', Warlock: 'orb', Cleric: 'holy' }[ch.class] || null;
    return { main, off, plus: w0 ? (w0.plus || 0) : 0 };
  }
  const heroArt = (ch, size) => ART.heroSVG(ch.look, ch.class || ch.cls, ch.race, size, gearOf(ch));
  const heroPic = (ch, size = 64) => svgImg(heroArt(ch, size));
  const npcPic = (n, size = 56) => svgImg(ART.npcSVG(n.look || {}, n.chained ? 'prisoner' : (n.art || n.role), size));
  // ---------- appearance editor ----------
  const SW = { skin: ['#f6d3b3', '#eec39a', '#e0b48a', '#c68e5e', '#a86f45', '#8d5a3a', '#5c3a24', '#9bc48a', '#7fb0a0', '#b7a2d6', '#d97a6a', '#9aa3ad'],
    hair: ['#1d140e', '#4a2c17', '#8a5a2b', '#c98f4a', '#d9a62e', '#f0dfa0', '#e8e0d0', '#b5452c', '#e86a8a', '#2f5b9a', '#4f8a3a', '#5a5a5a'],
    cloak: ['#b5452c', '#8a2f1c', '#c7782e', '#d9a62e', '#4f8a3a', '#3f6b4a', '#2f5b9a', '#5b6f86', '#8a4fa3', '#4b2f6b', '#3b3b46', '#e8e0d0'],
    eyes: ['#2b1d12', '#4a7ab5', '#4f8a3a', '#8a5a2b', '#9aa3ad', '#b5452c', '#ffd36b', '#9b6bd1'], scale: ['#c9553c', '#4f8a3a', '#2f5b9a', '#d9a62e', '#3b3b46', '#c9ccd1', '#8a2f1c', '#e8e0d0'] };
  const HG_NAMES = { auto: 'Class default', none: 'Nothing', hood: 'Hood', helm: 'Helmet', wizard: 'Wizard hat', circlet: 'Circlet', bandana: 'Bandana', feather: 'Feathered cap', horned: 'Horned helm', crown: 'Crown', tricorn: 'Tricorn', straw: 'Straw hat', headband: 'Headband' };
  const MARK_NAMES = { none: 'None', freckles: 'Freckles', scar: 'Scar', eyepatch: 'Eyepatch', warpaint: 'War paint', glasses: 'Glasses', tattoo: 'Tattoo' };
  function lookEditor(look, race, cls) {
    const sw = (key, list, allowNone) => `<div class="swatches">${allowNone ? `<button class="sw none ${!look[key] ? 'on' : ''}" data-lk="${key}" data-v="">✕</button>` : ''}${list.map(c => `<button class="sw ${look[key] === c ? 'on' : ''}" style="background:${c}" data-lk="${key}" data-v="${c}"></button>`).join('')}</div>`;
    const chips = (key, opts, cur) => `<div class="chips">${opts.map(([v, l]) => `<button class="chip ${String(cur) === String(v) ? 'on' : ''}" data-lk="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const beardDef = look.beard != null ? look.beard : (race === 'Dwarf' ? 3 : 0);
    const buildDef = look.build != null ? look.build : (ART.BIGB[race] != null ? Math.max(ART.BIGB[race], cls === 'Barbarian' ? 2 : 0) : cls === 'Barbarian' ? 2 : 1);
    const skinLbl = { Tabaxi: 'Fur', Bugbear: 'Fur', Kenku: 'Feathers', Kobold: 'Scales', Lizardfolk: 'Scales', Tortle: 'Skin', Triton: 'Skin' }[race] || 'Skin';
    const skinList = ART.RACE_PAL[race] ? ART.RACE_PAL[race].concat(SW.skin.slice(0, 3)) : SW.skin;
    if (!look.skin && ART.RACE_SKIN[race]) look.skin = ART.RACE_SKIN[race];
    return `<div class="lookedit">
      ${race === 'Dragonborn' ? `<div class="small">Scales</div>${sw('scale', SW.scale)}` : `<div class="small">${skinLbl}</div>${sw('skin', skinList)}`}
      ${race === 'Tortle' ? `<div class="small">Shell</div>${sw('shell', ['#4f6a3a', '#6b5a3a', '#3a5a5a', '#8a6a3a', '#5a4a6a', '#2f4a2f'], true)}` : ''}
      <div class="small">Hair color</div>${sw('hair', SW.hair)}
      <div class="small">Hair style</div>${chips('hairStyle', ART.HAIR_STYLES.map((h, i) => [i, h]), look.hairStyle || 0)}
      ${race !== 'Dragonborn' ? `<div class="small">Facial hair</div>${chips('beard', ART.BEARDS.map((h, i) => [i, h]), beardDef)}` : ''}
      <div class="small">Eyes</div>${sw('eyes', SW.eyes, true)}
      <div class="small">Brows</div>${chips('brows', [[0, 'Normal'], [1, 'Fierce'], [2, 'Kind']], look.brows || 0)}
      <div class="small">Face</div>${chips('mark', ART.MARKS.map(m => [m, MARK_NAMES[m]]), look.mark || 'none')}
      <div class="small">Headgear</div>${chips('headgear', ART.HEADGEAR.map(h => [h, HG_NAMES[h] || h]), look.headgear || 'auto')}
      <div class="small">Build</div>${chips('build', [[0, 'Slim'], [1, 'Average'], [2, 'Broad'], [3, 'Huge']], buildDef)}
      <div class="small">Outfit</div>${sw('cloak', SW.cloak)}
      <div class="small">Trim</div>${sw('trim', SW.cloak, true)}
      <div class="small">Cape</div>${sw('cape', SW.cloak, true)}
      <div class="small">Extras</div><div class="chips"><button class="chip ${look.gloves ? 'on' : ''}" data-lk="gloves" data-v="${look.gloves ? '' : '1'}">🧤 Gloves</button><button class="chip ${look.earring ? 'on' : ''}" data-lk="earring" data-v="${look.earring ? '' : '1'}">✨ Earring</button><button class="chip" id="lkRandom">🎲 Randomize</button></div></div>`;
  }
  function bindLook(root, look, onChange) {
    $$('[data-lk]', root).forEach(b => b.onclick = () => { const k = b.dataset.lk; let v = b.dataset.v; if (['hairStyle', 'beard', 'brows', 'build'].includes(k)) v = +v; if (k === 'gloves' || k === 'earring') v = !!v; if (v === '') v = null; look[k] = v; onChange(); });
    const r = $('#lkRandom', root); if (r) r.onclick = () => { const pk = (a) => a[Math.floor(Math.random() * a.length)]; Object.assign(look, { skin: pk(SW.skin.slice(0, 7)), hair: pk(SW.hair), hairStyle: Math.floor(Math.random() * 10), beard: pk([0, 0, 0, 1, 2, 3, 5]), mark: pk(ART.MARKS), cloak: pk(SW.cloak), trim: pk([null, ...SW.cloak]), eyes: pk([null, ...SW.eyes]), brows: Math.floor(Math.random() * 3) }); onChange(); };
  }
  function lookSheet() {
    const ch = myChar(); const look = JSON.parse(JSON.stringify(ch.look || {}));
    const draw = () => sheet(`<h2>🎨 ${esc(ch.name)}'s look</h2><div class="center lookprev">${ART.heroSVG(look, ch.class, ch.race, 140, gearOf(ch))}</div>${lookEditor(look, ch.race, ch.class)}<button class="btn green block lg" id="lkSave">Save look</button>`, (m) => {
      bindLook(m, look, () => { const sc = m.scrollTop; draw(); sheetRoot.querySelector('.sheet').scrollTop = sc; });
      $('#lkSave').onclick = async () => { await act('character', { edit: true, look }); closeSheet(); toast('🎨 Looking good!'); };
    });
    draw();
  }

  // ---------------- push ----------------
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  async function regSW() { if (!('serviceWorker' in navigator)) return null; try { return await navigator.serviceWorker.register('/sw.js'); } catch (e) { return null; } }
  const b64 = (s) => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
  async function enablePush() {
    if (isIOS && !standalone) { sheet(`<h2>📲 One quick step</h2><p>iPhones only send turn alerts to the home-screen app:</p><ol class="steps"><li>Tap <b>Share</b> <span class="muted">(square with arrow)</span></li><li>Tap <b>Add to Home Screen</b></li><li>Open <b>Roll Call</b> from your home screen and turn alerts on</li></ol>`); return; }
    if (!('Notification' in window) || !('PushManager' in window)) { toast('This browser can\'t do alerts — try Chrome or the home-screen app'); return; }
    const perm = await Notification.requestPermission(); if (perm !== 'granted') { toast('Alerts are blocked — allow notifications for this site'); return; }
    const reg = await regSW(); await navigator.serviceWorker.ready; const { key } = await api('/vapid');
    let sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    await api('/push/subscribe', { sub: sub.toJSON() }); await api('/push/test', {});
    toast('🔔 Turn alerts on!'); if (S.me) S.me.push = true; if (S.view === 'home') renderHome(); if (S.view === 'camp') renderTab();
  }

  // ---------------- websocket ----------------
  function connectWS() {
    if (S.ws && S.ws.readyState <= 1) return;
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?token=' + S.token); S.ws = ws;
    ws.onopen = () => { if (S.C) ws.send(JSON.stringify({ t: 'sub', campaignId: S.C.id, visible: !document.hidden })); };
    ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.t === 'campaign' && S.C && msg.campaign.id === S.C.id) { S.C = msg.campaign; onUpdate(); } };
    ws.onclose = () => { S.ws = null; setTimeout(() => { if (S.token) connectWS(); }, 2000); };
  }
  document.addEventListener('visibilitychange', () => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ t: 'vis', visible: !document.hidden })); if (!document.hidden && S.view === 'home') loadHome(); });
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.t === 'open') { const c = new URL(e.data.url, location.href).searchParams.get('c'); if (c) openCampaign(c); } });

  // ---------------- splash ----------------
  function showSplash(skip) {
    S.view = 'splash';
    const crowd = ['goblin', 'skeleton', 'wolf', 'giant_spider', 'mimic', 'owlbear', 'bell_warden', 'green_wyrmling'];
    app.innerHTML = `<div class="splash"><div class="parade">${crowd.map((k, i) => `<span style="animation-delay:${-i * 2.3}s">${ART.monsterSVG(k, 64)}</span>`).join('')}</div>
      <div class="logo"><span>R</span><span>O</span><span>L</span><span>L</span><br><span>C</span><span>A</span><span>L</span><span>L</span></div>
      <div class="tagline">Dungeons & Dragons in your pocket.<br>We'll ping you when it's your turn.</div>
      <div class="heroes-row">${['Fighter', 'Wizard', 'Rogue', 'Cleric'].map((c, i) => ART.heroSVG({ skin: ['#e0b48a', '#f6d3b3', '#8d5a3a', '#c68e5e'][i], hair: ['#4a2c17', '#e8e0d0', '#1d140e', '#b5452c'][i], cloak: RR.CLASSES[c].color, hairStyle: i }, c, ['Dwarf', 'Elf', 'Halfling', 'Human'][i], 70)).join('')}</div>
      <div id="loginSlot"></div></div>`;
    const showLogin = () => {
      if ($('#loginSlot .login')) return;
      $('#loginSlot').innerHTML = `<div class="login card"><label>Adventurer name</label><input id="ln" autocomplete="username" maxlength="24" autocapitalize="off">
        <label>Password</label><input id="lp" type="password" autocomplete="current-password">
        <div class="row" style="margin-top:12px"><button class="btn green grow" id="bLogin">Log in</button><button class="btn ghost grow" id="bReg">I'm new</button></div></div>`;
      const go = async (reg) => { try { const r = await api(reg ? '/register' : '/login', { name: $('#ln').value, pass: $('#lp').value }); S.token = r.token; localStorage.setItem('rc_token', r.token); start(); } catch (e) { toast(e.message, 'err'); } };
      $('#bLogin').onclick = () => go(false); $('#bReg').onclick = () => go(true); $('#lp').onkeydown = (e) => { if (e.key === 'Enter') go(false); };
    };
    if (skip) showLogin(); else { setTimeout(showLogin, 2600); app.onclick = () => { app.onclick = null; showLogin(); }; }
  }

  // ---------------- home ----------------
  async function loadHome() { try { const r = await api('/me'); S.me = r.user; S.campaigns = r.campaigns; S.aiReady = r.aiReady; if (S.view === 'home') renderHome(); } catch (e) { } }
  function showHome() { S.view = 'home'; S.C = null; BOARD.redraw(); if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ t: 'sub', campaignId: null })); history.replaceState(null, '', '/'); renderHome(); loadHome(); }
  function renderHome() {
    const me = S.me || {}; const pushOn = me.push && 'Notification' in window && Notification.permission === 'granted';
    app.innerHTML = `<div class="home"><div class="home-top"><div class="brand">⚔️ Roll Call</div><button class="chip" id="bOut">${esc(me.name || '')} · log out</button></div>
      ${pushOn ? '' : `<div class="card banner gold"><div class="grow"><b>🔔 Turn alerts</b><div class="small">Get pinged when it's your move.</div></div><button class="btn dark sm" id="bPush">Turn on</button></div>`}
      ${S.campaigns.length ? S.campaigns.map(c => `<button class="card camp" data-open="${c.id}">
          <div class="camp-pic">${c.hero ? ART.heroSVG(c.hero.look, c.hero.cls, null, 58) : `<span class="seal">${c.dmMode === 'ai' ? '🤖' : '🎭'}</span>`}</div>
          <div class="grow left"><div class="camp-name">${esc(c.name)}</div><div class="small muted">${esc(c.adventure || '')}${c.scene ? ' · 📍 ' + esc(c.scene) : ''}</div>
          <div class="small">${c.status !== 'active' ? '<span class="tag">Gathering party · ' + c.code + '</span>' : c.myTurn ? `<span class="tag hot">${c.mode === 'combat' ? '⚔️ YOUR TURN' : '🎲 YOUR MOVE'}</span>` : c.dmTurn ? '<span class="tag blue">📜 DM needed</span>' : `<span class="muted">Waiting on ${esc(c.current)}</span>`}</div></div><b class="chev">›</b></button>`).join('')
        : `<div class="card center empty"><div class="emptyart">${ART.monsterSVG('mimic', 110)}</div><h2>No adventures yet</h2><p class="muted">Start a campaign and share the code with your friends — or join theirs.</p></div>`}
      </div><div class="dock"><button class="btn green grow" id="bNew">＋ New campaign</button><button class="btn blue grow" id="bJoin">Join with code</button></div>`;
    $('#bOut').onclick = logout; if ($('#bPush')) $('#bPush').onclick = enablePush;
    $$('[data-open]').forEach(el => el.onclick = () => openCampaign(el.dataset.open));
    $('#bNew').onclick = newCampaignSheet; $('#bJoin').onclick = joinSheet;
  }
  function newCampaignSheet() {
    const st = { dm: 'ai', pace: 'async', adv: 'bell' };
    sheet(`<h2>New campaign</h2>
      <label>Name</label><input id="cn" placeholder="Friday Night Heroes" maxlength="60">
      <label>Adventure</label><div class="opts" id="advc"><button class="opt on" data-v="bell"><b>🔔 The Drowned Bell</b><span>A haunted fishing town, missing fishermen, smugglers and a sunken lighthouse. Built in, ready to play.</span></button><button class="opt" data-v="custom" ${S.aiReady ? '' : 'disabled'}><b>✨ Your own idea</b><span>${S.aiReady ? 'Describe it and the AI DM writes the whole adventure.' : 'Needs the AI key on the server.'}</span></button></div>
      <textarea id="cp" rows="3" class="hidden" placeholder="e.g. A wizard school where the statues come alive at night..."></textarea>
      <label>Dungeon Master</label><div class="opts two" id="dmc"><button class="opt on" data-v="ai"><b>🤖 AI DM</b><span>Runs the story. You can take over any time.</span></button><button class="opt" data-v="human"><b>🎭 I'll DM</b><span>You run it with DM tools.</span></button></div>
      <label>Pace</label><div class="opts two" id="pc"><button class="opt on" data-v="async"><b>📬 On the go</b><span>Take turns whenever. Push alerts.</span></button><button class="opt" data-v="live"><b>⚡ Live</b><span>Everyone playing at once.</span></button></div>
      <button class="btn green block lg" id="cgo">Create</button>`, (m) => {
      const pickOne = (sel, key) => $$(sel + ' .opt', m).forEach(b => b.onclick = () => { if (b.disabled) return; st[key] = b.dataset.v; $$(sel + ' .opt', m).forEach(x => x.classList.toggle('on', x === b)); if (key === 'adv') $('#cp').classList.toggle('hidden', st.adv !== 'custom'); });
      pickOne('#advc', 'adv'); pickOne('#dmc', 'dm'); pickOne('#pc', 'pace');
      $('#cgo').onclick = async () => { try { const r = await api('/campaigns', { name: $('#cn').value || 'New Campaign', dmMode: st.dm, pace: st.pace, premise: st.adv === 'custom' ? $('#cp').value : '' }); closeSheet(); openCampaign(r.id, 'hero'); } catch (e) { toast(e.message, 'err'); } };
    });
  }
  function joinSheet() {
    sheet(`<h2>Join a party</h2><label>Code from your friend</label><input id="jc" maxlength="6" class="code-in" autocapitalize="characters" autocomplete="off"><button class="btn blue block lg" id="jgo">Join</button>`, () => {
      $('#jc').focus(); $('#jgo').onclick = async () => { try { const r = await api('/join', { code: $('#jc').value }); closeSheet(); openCampaign(r.id, 'hero'); } catch (e) { toast(e.message, 'err'); } };
    });
  }

  // ---------------- campaign shell ----------------
  const myChar = () => S.C && Object.values(S.C.characters).find(c => c.ownerId === S.C.me);
  const myTok = () => { const ch = myChar(); return ch && S.C.scene && S.C.scene.tokens.find(t => t.charId === ch.id); };
  const inCombat = () => S.C.turn.mode === 'combat';
  const isMyTurn = () => S.C.status === 'active' && S.C.turn.currentUserId === S.C.me;
  const myRoll = () => { const pr = S.C.turn.pendingRoll; const ch = myChar(); return pr && ch && pr.charId === ch.id ? pr : null; };
  const canActCombat = () => inCombat() && isMyTurn() && S.C.turn.phase === 'act' && myChar()?.hp > 0;
  const humanDM = () => S.C.isDM && !S.C.aiActive;

  async function openCampaign(id, tab) {
    try {
      S.C = await api('/c/' + id); S.view = 'camp'; S.target = null; S.drawer = 'peek';
      S.lastLogId = S.C.log.length ? S.C.log[S.C.log.length - 1].id : null; S.seenFx = new Set(S.C.log.map(e => e.id));
      S.tab = tab || (myChar() ? 'play' : 'hero'); if (S.tab === 'hero' && myChar()) S.tab = 'play';
      history.replaceState(null, '', '/?c=' + id);
      app.innerHTML = `<div class="camp"><header class="hud" id="hud"></header><main id="main"></main><nav class="tabs" id="tabs"></nav></div>`;
      S.wasMine = false; onUpdate(true); connectWS();
      if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ t: 'sub', campaignId: id, visible: !document.hidden }));
    } catch (e) { toast(e.message, 'err'); showHome(); }
  }
  function onUpdate(first) {
    const C = S.C;
    const mine = isMyTurn() || !!myRoll();
    if (!first && mine && !S.wasMine) { buzz([180, 90, 180]); banner(myRoll() ? `🎲 Roll ${myRoll().label}!` : inCombat() ? '⚔️ Your turn!' : '🎲 The spotlight is on you!'); }
    S.wasMine = mine;
    // fx for new log entries
    const fresh = C.log.filter(e => !S.seenFx.has(e.id)); fresh.forEach(e => S.seenFx.add(e.id));
    if (!first) fresh.forEach((e, i) => setTimeout(() => handleFresh(e), i * 260));
    if (S.target && !targetStillValid()) S.target = null;
    renderHud(); renderTabs(); renderTab();
  }
  function handleFresh(e) {
    if (e.fx) BOARD.playFx(e);
    const me = S.C.me; const mt = myTok();
    if (e.fx && (e.fx.k === 'check' || e.fx.k === 'free') && e.fx.uid === me) diceShow(e.fx.pick || e.fx.tot, e.fx.tot, e.fx.ok, e.fx.k === 'free');
    if (e.fx && e.fx.k === 'atk' && mt && e.fx.a === mt.id && e.fx.pick) diceShow(e.fx.pick, e.fx.tot, e.fx.hit, false, e.fx.crit);
    if (e.kind === 'scene') titleCard('📍 ' + e.text, e.desc);
    if (e.kind === 'title') titleCard(e.text, e.premise, true);
    if (e.kind === 'initiative') { buzz([60, 40, 60]); setTimeout(() => BOARD.frame(S.C.scene.tokens.filter(t => t.kind === 'pc' || t.kind === 'monster')), 300); titleCard('⚔️ Roll for initiative!', (e.order || []).map(o => `${o.name} ${o.init}`).join(' · ')); }
    if (e.kind === 'victory') titleCard('🏆 Victory!', e.text.replace('Victory! ', ''));
    if (e.kind === 'quest' && /New quest|complete/.test(e.text)) banner(e.text);
    if (e.kind === 'levelup' && e.fx?.charId === myChar()?.id) buzz([100, 50, 100, 50, 200]);
  }
  function banner(text) { const d = document.createElement('div'); d.className = 'turnbanner'; d.textContent = text; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); }
  function titleCard(title, sub, big) { if (S.tab !== 'play') return; const d = document.createElement('div'); d.className = 'titlecard' + (big ? ' big' : ''); d.innerHTML = `<div class="tc-in"><div class="tc-t">${esc(title)}</div>${sub ? `<div class="tc-s">${esc(sub)}</div>` : ''}</div>`; d.onclick = () => d.remove(); document.body.appendChild(d); setTimeout(() => d.remove(), big ? 4200 : 2600); }

  function renderHud() {
    const C = S.C, el = $('#hud'); if (!el) return;
    const sc = C.scene; let line;
    if (C.status === 'lobby') line = `Gathering the party · code <b>${C.code}</b>`;
    else if (C.status === 'building') line = '🤖 The DM is writing your adventure…';
    else if (myRoll()) line = `<span class="hot">🎲 Roll ${esc(myRoll().label)}!</span>`;
    else if (isMyTurn() && C.turn.phase === 'act') line = `<span class="hot">${inCombat() ? '⚔️ Your turn' : '🎲 Your spotlight'}</span>`;
    else if (C.aiBusy) line = '🤖 The DM is thinking…';
    else if (C.turn.phase === 'dm') line = humanDM() ? '<span class="hot">📜 You\'re up, DM</span>' : '📜 Waiting on the DM';
    else if (C.turn.phase === 'monster') line = `👹 ${esc(C.turn.currentName)} is acting…`;
    else line = `${inCombat() ? '⚔️' : '🎲'} ${esc(C.turn.currentName)}'s ${inCombat() ? 'turn' : 'spotlight'}`;
    el.innerHTML = `<button class="back" id="bBack" aria-label="Back">‹</button><div class="hud-t"><div class="hud-n">${esc(sc ? sc.name : C.name)}${C.status === 'active' ? ` · ${inCombat() ? 'Round ' + C.turn.round : 'Exploring'}` : ''}</div><div class="hud-l">${line}</div></div>
      <div class="dots">${C.members.map(m => `<i class="${m.visible ? 'on' : m.online ? 'away' : ''}" title="${esc(m.name)}"></i>`).join('')}</div>`;
    $('#bBack').onclick = showHome;
  }
  function renderTabs() {
    const el = $('#tabs'); if (!el) return; const ch = myChar();
    const pips = { hero: !ch || ch.levelUpReady, journal: S.C.quests.some(q => q.status === 'active' && !S.seenQuests?.has(q.id)), party: humanDM() && S.C.turn.phase === 'dm' };
    el.innerHTML = [['play', '🎲', 'Play'], ['hero', '🧙', 'Hero'], ['journal', '📖', 'Journal'], ['party', '👥', S.C.isDM ? 'Party·DM' : 'Party']].map(([k, i, n]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}"><b>${i}</b>${n}${pips[k] ? '<s></s>' : ''}</button>`).join('');
    $$('[data-tab]', el).forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.target = null; if (S.tab === 'journal') S.seenQuests = new Set(S.C.quests.map(q => q.id)); renderTabs(); renderTab(true); });
  }
  function renderTab(force) {
    const main = $('#main'); if (!main) return;
    if (S.tab === 'play') renderPlay(force);
    else { S.playBuilt = false; if (S.tab === 'hero') renderHero(); else if (S.tab === 'journal') renderJournal(); else renderParty(); }
  }

  // ---------------- PLAY ----------------
  function renderPlay(force) {
    const C = S.C; const main = $('#main');
    if (C.status !== 'active') { S.playBuilt = false; renderLobby(); return; }
    if (!S.playBuilt || force || !$('#board')) {
      main.innerHTML = `<div class="play drawer-${S.drawer}" id="play">
        <div class="initbar" id="initbar"></div>
        <div class="boardwrap"><canvas id="board"></canvas><div class="mapbtns"><button class="fab sm" id="bMe" aria-label="Center on me">📍</button></div><div class="targetbar hidden" id="targetbar"></div></div>
        <section class="story" id="story"><button class="handle" id="handle"><span></span></button><div class="log" id="log"></div></section>
        <div class="actbar" id="actbar"></div></div>`;
      S.playBuilt = true; S.renderedLog = 0;
      BOARD.init($('#board'), { onTap, onDoubleTap: () => { const t = myTok(); if (t) BOARD.center(t.x, t.y); } }); BOARD.fit();
      $('#bMe').onclick = () => { const t = myTok(); if (t) BOARD.center(t.x, t.y); };
      $('#handle').onclick = () => { S.drawer = S.drawer === 'peek' ? 'full' : S.drawer === 'full' ? 'min' : 'peek'; $('#play').className = 'play drawer-' + S.drawer; BOARD.redraw(); scrollLog(); };
    }
    // board state
    BOARD.setState(C, boardOpts());
    renderInit(); renderLog(); renderActBar(); renderTargetBar();
    const t = myTok(); if (t && isMyTurn() && inCombat()) BOARD.ensureVisible(t.x, t.y);
  }
  function boardOpts() {
    const o = { targets: null, reach: null, area: null, npcMarks: {} };
    Object.values(S.C.npcs || {}).forEach(n => { if (!n.here) return; const hot = n.topics.find(t => t.hot); if (hot) o.npcMarks[n.key] = hot.id === 'turnin' ? '?' : '!'; });
    if (S.target) { o.targets = S.target.valid || null; o.targetColor = S.target.color; if (S.target.area) o.area = S.target.area; if (S.target.range) o.rangeRing = S.target.range; }
    else if (canActCombat()) o.reach = reachable();
    return o;
  }
  function reachable() {
    const C = S.C, s = C.scene, t = myTok(); if (!t || !C.turn.res) return null; const budget = C.turn.res.move; if (budget <= 0) return null;
    const blk = new Set(['#', '~', 'T', 'r', '^', 'o', 'b', 't', 'w', 'f', 'G', 'h', 'c']); if (RR.RACES[myChar()?.race]?.swim) blk.delete('~'); const diff = new Set(['%', 'x']);
    const occ = new Set(s.tokens.filter(o => o.id !== t.id && !o.dead).map(o => o.y * s.w + o.x));
    const enemy = new Set(s.tokens.filter(o => o.kind === 'monster' || o.kind === 'npc' || o.kind === 'mimic').map(o => o.y * s.w + o.x));
    const traps = new Set(s.pois.filter(p => p.type === 'trap' && !p.disarmed).map(p => p.y * s.w + p.x));
    const dist = new Map([[t.y * s.w + t.x, 0]]); const q = [[t.x, t.y]]; const out = new Set();
    while (q.length) { q.sort((a, b) => dist.get(a[1] * s.w + a[0]) - dist.get(b[1] * s.w + b[0])); const [x, y] = q.shift(); const d0 = dist.get(y * s.w + x);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue; const i = ny * s.w + nx; const ch = s.tiles[ny][nx]; if (blk.has(ch) || enemy.has(i) || s.seen[i] !== '1' || traps.has(i)) continue; if (dx && dy && (blk.has(s.tiles[y][x + dx]) || blk.has(s.tiles[y + dy][x]))) continue; const nd = d0 + (diff.has(ch) ? 2 : 1); if (nd > budget) continue; if (nd < (dist.get(i) ?? 99)) { dist.set(i, nd); q.push([nx, ny]); if (!occ.has(i)) out.add(i); } } }
    return out;
  }
  function renderInit() {
    const el = $('#initbar'); const C = S.C; if (!el) return;
    if (!inCombat()) { const q = C.quests.find(x => x.status === 'active' && x.main) || C.quests.find(x => x.status === 'active'); const o = q && q.objectives.find(x => !x.done); el.innerHTML = q && o ? `<button class="questline" id="ql">📜 <b>${esc(q.title)}:</b> ${esc(o.t)}</button>` : ''; el.className = 'initbar quest'; if ($('#ql')) $('#ql').onclick = () => { S.tab = 'journal'; renderTabs(); renderTab(true); }; return; }
    el.className = 'initbar';
    el.innerHTML = C.turn.order.map((e, i) => { const cur = i === C.turn.index; let pic, hp = 1, dead = false;
      if (e.kind === 'pc') { const ch = C.characters[e.charId]; if (!ch) return ''; pic = heroArt(ch, 40); hp = Math.max(0, ch.hp) / ch.maxHp; dead = ch.hp <= 0; }
      else { const t = C.scene.tokens.find(x => x.id === e.tokenId); if (!t) return ''; pic = ART.monsterSVG(t.mkey, 40); hp = t.hpPct; }
      return `<div class="ini ${cur ? 'cur' : ''} ${e.kind} ${dead ? 'dead' : ''}">${pic}<i style="width:${hp * 100}%"></i></div>`; }).join('');
    const cur = el.querySelector('.cur'); if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  // story log
  const HIDE = new Set(['move']);
  function entryHTML(e) {
    const C = S.C; const mine = e.uid === C.me;
    switch (e.kind) {
      case 'title': return `<div class="e title"><div class="e-k">Chapter</div>${esc(e.text)}</div>`;
      case 'scene': return `<div class="e scene">📍 ${esc(e.text)}${e.desc ? `<div class="e-sub">${esc(e.desc)}</div>` : ''}</div>`;
      case 'narration': return `<div class="e narr">${e.who && e.who !== 'DM' ? `<div class="e-k">${esc(e.who)}</div>` : ''}${esc(e.text)}</div>`;
      case 'npc': { const n = C.npcs[e.npc]; return `<div class="e npc">${n ? npcPic(n, 34) : ''}<div><div class="e-k">${esc(e.who)}</div>“${esc(e.text)}”</div></div>`; }
      case 'clue': return `<div class="e clue"><div class="e-k">🔎 ${esc(e.who || 'Clue')}</div>${esc(e.text)}</div>`;
      case 'say': case 'action': return `<div class="e said ${mine ? 'mine' : ''}"><div class="e-k">${esc(e.who)}${e.to ? ' → ' + esc(e.to) : ''}</div>${e.kind === 'say' ? '“' + esc(e.text) + '”' : esc(e.text)}</div>`;
      case 'chat': return `<div class="e chat ${mine ? 'mine' : ''}"><b>${esc(e.who)}:</b> ${esc(e.text)}</div>`;
      case 'roll': return `<div class="e roll">${esc(e.text)}</div>`;
      case 'spell': case 'feature': case 'item': return `<div class="e magic">${esc(e.text)}</div>`;
      case 'alert': return `<div class="e alert">${esc(e.text)}</div>`;
      case 'kill': return `<div class="e kill">💀 ${esc(e.text)}</div>`;
      case 'victory': return `<div class="e victory">🏆 ${esc(e.text)}</div>`;
      case 'initiative': return `<div class="e alert">⚔️ Roll for initiative! ${esc((e.order || []).map(o => o.name + ' ' + o.init).join(', '))}</div>`;
      case 'quest': return `<div class="e quest">${e.text.startsWith('New') ? '📜' : e.text.startsWith('🏆') ? '' : ''} ${esc(e.text)}${e.desc ? `<div class="e-sub">${esc(e.desc)}</div>` : ''}</div>`;
      case 'loot': return `<div class="e loot">${esc(e.text)}</div>`;
      case 'levelup': return `<div class="e victory">${esc(e.text)}</div>`;
      case 'rest': return `<div class="e rest">${esc(e.text)}</div>`;
      default: return `<div class="e sys">${esc(e.text)}</div>`;
    }
  }
  function renderLog() {
    const el = $('#log'); if (!el) return; const C = S.C; const list = C.log.filter(e => !HIDE.has(e.kind) && e.text);
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (S.renderedLog !== list.length || S.renderedLogFirst !== list[0]?.id) { el.innerHTML = list.slice(-120).map(entryHTML).join('') + (C.aiBusy ? '<div class="e thinking">🤖 The Dungeon Master is writing…</div>' : ''); S.renderedLog = list.length; S.renderedLogFirst = list[0]?.id; if (near || true) scrollLog(); }
    else { const th = el.querySelector('.thinking'); if (C.aiBusy && !th) { el.insertAdjacentHTML('beforeend', '<div class="e thinking">🤖 The Dungeon Master is writing…</div>'); scrollLog(); } if (!C.aiBusy && th) th.remove(); }
  }
  const scrollLog = () => requestAnimationFrame(() => { const el = $('#log'); if (el) el.scrollTop = el.scrollHeight; });

  // action bar
  function renderActBar() {
    const el = $('#actbar'); if (!el) return; const C = S.C; const ch = myChar(); const t = myTok();
    if (S.target) { el.innerHTML = ''; el.className = 'actbar hidden'; return; }
    el.className = 'actbar';
    const pr = myRoll();
    if (pr) { el.innerHTML = `<button class="btn gold block xl pulse" id="bRoll">🎲 Roll ${esc(pr.label)}${pr.death ? '' : ''}</button>${pr.death ? '<div class="small center muted">Roll 10+ three times to stabilize. Three failures and...</div>' : `<div class="row"><button class="chip grow" data-adv="adv">Advantage</button><button class="chip grow" data-adv="dis">Disadvantage</button></div>`}`; $('#bRoll').onclick = () => { buzz(50); act('roll', {}); }; $$('[data-adv]', el).forEach(b => b.onclick = () => act('roll', { adv: b.dataset.adv })); return; }
    if (!ch) { el.innerHTML = `<button class="btn green block lg" id="bMake">🧙 Make your hero to join in</button>`; $('#bMake').onclick = () => { S.tab = 'hero'; renderTabs(); renderTab(true); }; return; }
    if (inCombat()) {
      if (canActCombat()) {
        const r = C.turn.res; const hasSpells = ch.spells.length; const feats = usableFeatures(ch);
        el.innerHTML = `<div class="res"><span class="${r.action ? '' : 'used'}">⚔️ Action</span><span class="${r.bonus ? '' : 'used'}">✦ Bonus</span><span class="${r.move ? '' : 'used'}">👣 ${r.move}</span>${r.attacksLeft > 0 ? `<span>🗡️ ${r.attacksLeft} more</span>` : ''}</div>
          <div class="acts">
            <button data-a="attack" ${r.action || r.attacksLeft ? '' : 'disabled'}><b>⚔️</b>Attack</button>
            ${hasSpells ? `<button data-a="magic"><b>✨</b>Magic</button>` : ''}
            ${feats.length ? `<button data-a="ability"><b>⭐</b>Ability</button>` : ''}
            <button data-a="item"><b>🎒</b>Item</button>
            <button data-a="more"><b>⋯</b>More</button>
            <button data-a="end" class="end"><b>⏭</b>End</button></div>`;
      } else {
        const down = ch.hp <= 0;
        el.innerHTML = `<div class="waiting">${down ? (ch.dead ? '☠️ Your hero has fallen.' : '💔 You\'re unconscious — friends can heal you!') : `⏳ ${esc(C.turn.currentName)}'s turn…`}</div><div class="acts slim"><button data-a="chat"><b>💬</b>Chat</button><button data-a="dice"><b>🎲</b>Dice</button>${humanDM() ? `<button data-a="dm"><b>📜</b>DM</button>` : ''}</div>`;
      }
    } else {
      const spot = isMyTurn() && C.turn.phase === 'act';
      el.innerHTML = `${spot ? `<div class="spot"><div class="grow"><b>🎲 Your spotlight!</b> <span class="small">Tell the DM what ${esc(ch.name)} does — or just explore.</span></div></div>` : C.turn.phase === 'dm' ? `<div class="waiting small">${C.aiBusy ? '🤖 The DM is writing…' : humanDM() ? '📜 Your call, DM — narrate, then tap Resolve.' : '📜 Waiting on the DM…'}</div>` : ''}
        <div class="acts">${spot ? `<button data-a="do" class="hot"><b>✍️</b>Do…</button>` : ''}
          <button data-a="search"><b>🔍</b>Search</button>
          <button data-a="talk"><b>💬</b>${spot ? 'Chat' : 'Chat'}</button>
          <button data-a="rest"><b>🏕️</b>Rest</button>
          <button data-a="more"><b>⋯</b>More</button>
          ${spot ? `<button data-a="pass" class="end"><b>⏭</b>Pass</button>` : humanDM() ? `<button data-a="dm"><b>📜</b>DM</button>` : `<button data-a="dice"><b>🎲</b>Dice</button>`}</div>`;
    }
    $$('[data-a]', el).forEach(b => b.onclick = () => onAct(b.dataset.a));
  }
  function onAct(a) {
    const ch = myChar();
    if (a === 'attack') return startAttack();
    if (a === 'magic') return spellSheet();
    if (a === 'ability') return featureSheet();
    if (a === 'item') return itemSheet();
    if (a === 'more') return moreSheet();
    if (a === 'end') { buzz(30); return act('endturn', {}); }
    if (a === 'pass') return act('endturn', {});
    if (a === 'do') return composer('do');
    if (a === 'talk' || a === 'chat') return composer('chat');
    if (a === 'search') return act('search', {});
    if (a === 'rest') return restSheet();
    if (a === 'dice') return diceTray();
    if (a === 'dm') return dmSheet();
  }
  function composer(mode, extra = {}) {
    const ch = myChar(); const C = S.C;
    const label = mode === 'do' ? `What does ${esc(ch.name)} do?` : mode === 'say' ? `What do you say to ${esc(extra.npc.name)}?` : mode === 'narrate' ? 'Narrate as the DM' : 'Talk to your party (out of character)';
    const ph = mode === 'do' ? 'I sneak up to the window and peek inside...' : mode === 'say' ? 'Ask about the lighthouse, make a deal, tell a joke...' : mode === 'narrate' ? 'The door creaks open...' : 'Should we open the chest?';
    sheet(`<h3>${label}</h3>${mode === 'do' ? '<div class="small muted">Climb, sneak, trick, persuade, investigate... the DM decides what happens (and may ask for a roll).</div>' : ''}
      <textarea id="ctext" rows="3" placeholder="${ph}"></textarea>
      ${mode === 'do' ? `<div class="chips">${['I search for hidden doors', 'I sneak ahead', 'I listen at the door', 'I try to intimidate them', 'I look for tracks'].map(s => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      ${mode === 'narrate' ? `<label class="check"><input type="checkbox" id="cpass" ${C.turn.phase === 'dm' ? 'checked' : ''}> Resolve & move the spotlight on</label>` : ''}
      <button class="btn ${mode === 'chat' ? 'dark' : 'green'} block lg" id="cgo">${mode === 'do' ? 'Do it' : 'Send'}</button>`, (m) => {
      const ta = $('#ctext'); setTimeout(() => ta.focus(), 50);
      $$('[data-s]', m).forEach(b => b.onclick = () => { ta.value = b.dataset.s; ta.focus(); });
      $('#cgo').onclick = async () => { const text = ta.value.trim(); if (!text) return; try { if (mode === 'do') await act('do', { text }); else if (mode === 'say') await act('say', { npcKey: extra.npc.key, text }); else if (mode === 'narrate') await act('narrate', { text, pass: $('#cpass')?.checked }); else await act('chat', { text }); closeSheet(); if (mode === 'say') setTimeout(() => talkSheet(extra.npc.key), 300); } catch (e) { } };
    }, { cls: 'top' });
  }

  // ---------- targeting ----------
  function setTarget(t) { S.target = t; closeSheet(); renderPlay(); }
  function targetStillValid() { return S.C.status === 'active' && (S.target.free || canActCombat() || !inCombat()); }
  function renderTargetBar() {
    const el = $('#targetbar'); if (!el) return;
    if (!S.target) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<div class="grow"><b>${esc(S.target.title)}</b><div class="small">${esc(S.target.hint || 'Tap a target')}</div></div>${S.target.extra || ''}<button class="btn sm dark" id="tCancel">Cancel</button>`;
    $('#tCancel').onclick = () => { S.target = null; renderPlay(); };
    if (S.target.mount) S.target.mount(el);
  }
  const foes = () => S.C.scene.tokens.filter(t => t.kind === 'monster');
  const allies = () => S.C.scene.tokens.filter(t => t.kind === 'pc');
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  function weaponStats(ch, w) {
    const ab = w.ab === 'fin' ? (ch.scores.dex >= ch.scores.str ? 'dex' : 'str') : (ch.class === 'Monk' && (w.k === 'unarmed' || w.k === 'shortsword') && ch.scores.dex > ch.scores.str ? 'dex' : w.ab);
    const m = RR.mod(ch.scores[ab]); let dice = w.dice; if (ch.class === 'Monk' && w.k === 'unarmed') dice = ch.level >= 5 ? '1d6' : '1d4';
    return { hit: m + RR.prof(ch.level) + (w.plus || 0), dmg: `${dice}${(m + (w.plus || 0)) ? fmt(m + (w.plus || 0)) : ''}`, range: w.range || (ch.features.includes('long_limbed') && !w.ranged ? 2 : 1) };
  }
  function startAttack(wi = null, preTarget = null) {
    const ch = myChar(); const t = myTok();
    let w = wi != null ? wi : (() => { const f = foes().filter(m => !m.dimmed); const near = f.some(m => cheb(m, t) <= 1); let i = ch.weapons.findIndex(x => near ? !x.ranged : x.ranged); return i < 0 ? 0 : i; })();
    const opts = { smite: false, reckless: false };
    const build = () => {
      const W = ch.weapons[w]; const st = weaponStats(ch, W);
      const valid = new Set(foes().filter(m => cheb(m, t) <= st.range).map(m => m.id));
      return { title: `⚔️ ${W.name} · ${fmt(st.hit)} to hit · ${st.dmg}`, hint: valid.size ? 'Tap a glowing enemy' : `Nothing in reach (${st.range === 1 ? 'move next to one' : 'range ' + st.range})`, valid, color: '#ff5a3d', range: st.range > 1 ? { x: t.x, y: t.y, r: st.range } : null,
        extra: `<div class="wsel">${ch.weapons.length > 1 ? `<button class="chip" id="wNext">🔄</button>` : ''}${ch.features.includes('divine_smite') && ch.slots.some(s => s.max - s.used > 0) ? `<button class="chip ${opts.smite ? 'on' : ''}" id="wSmite">✨ Smite</button>` : ''}${ch.features.includes('reckless_attack') && !S.C.turn.res.attacked ? `<button class="chip ${opts.reckless ? 'on' : ''}" id="wReck">💢 Reckless</button>` : ''}</div>`,
        mount: () => { if ($('#wNext')) $('#wNext').onclick = () => { w = (w + 1) % ch.weapons.length; S.target = build(); renderPlay(); }; if ($('#wSmite')) $('#wSmite').onclick = () => { opts.smite = !opts.smite; S.target = build(); renderPlay(); }; if ($('#wReck')) $('#wReck').onclick = () => { opts.reckless = !opts.reckless; S.target = build(); renderPlay(); }; },
        pick: async (hit) => { const tk = hit?.token; if (!tk || tk.kind !== 'monster') return false; if (!valid.has(tk.id)) { toast(`Out of reach — ${st.range === 1 ? 'move next to it first' : 'range ' + st.range}`); return true; } buzz(40); try { await act('attack', { targetId: tk.id, weapon: w, smite: opts.smite, reckless: opts.reckless }); } catch (e) { } const r = S.C.turn.res; S.target = r && r.attacksLeft > 0 && canActCombat() ? build() : null; renderPlay(); return true; } };
    };
    if (preTarget) { const st = weaponStats(ch, ch.weapons[w]); if (cheb(preTarget, t) <= st.range) { act('attack', { targetId: preTarget.id, weapon: w }); return; } }
    setTarget(build());
  }
  function onTap(x, y, hit) {
    const C = S.C; if (C.status !== 'active') return;
    if (S.target) { (async () => { const s = S.target; const handled = await s.pick(hit, { x, y }); if (handled === false && s.tilePick) s.tilePick({ x, y }); })(); return; }
    const ch = myChar(); const t = myTok();
    if (hit && hit.token) {
      const tk = hit.token;
      if (tk.kind === 'monster') return monsterSheet(tk);
      if (tk.kind === 'npc') return talkSheet(tk.npcKey);
      if (tk.kind === 'mimic') return poiSheet({ type: 'chest', name: 'Chest', id: null, tokenId: tk.id, x: tk.x, y: tk.y });
      if (tk.kind === 'pc') { if (t && tk.id === t.id) return; return allySheet(tk); }
    }
    if (hit && hit.poi) return poiSheet(hit.poi);
    // move
    if (!ch || !t) return;
    if (humanDM() && S.dmSpawn) { act('spawn', { mkey: S.dmSpawn, x, y }); S.dmSpawn = null; return; }
    if (inCombat()) { if (!canActCombat()) { toast(`Wait for your turn`); return; } const reach = reachable(); if (!reach || !reach.has(y * C.scene.w + x)) { toast(C.turn.res.move ? 'Too far this turn' : 'No movement left'); return; } }
    if (C.scene.seen[y * C.scene.w + x] !== '1') { toast('You can\'t see that far — explore closer'); return; }
    act('move', { x, y }).catch(() => { });
  }

  // ---------- sheets ----------
  function monsterSheet(tk) {
    const ch = myChar(); const t = myTok(); const M = RR.BESTIARY[tk.mkey] || {}; const d = t ? cheb(t, tk) : 99;
    const hpWord = tk.hpPct >= 1 ? 'Unhurt' : tk.hpPct > .5 ? 'Hurt' : tk.hpPct > .25 ? 'Bloodied' : 'Nearly dead';
    const attackBtns = ch && (canActCombat() || !inCombat()) && (S.C.turn.res?.action || S.C.turn.res?.attacksLeft || !inCombat()) ? ch.weapons.map((w, i) => { const st = weaponStats(ch, w); const ok = d <= st.range; return `<button class="btn ${ok ? 'red' : 'ghost'} block" data-w="${i}" ${ok ? '' : 'disabled'}>⚔️ ${esc(w.name)} <span class="muted2">${fmt(st.hit)} · ${st.dmg}${ok ? '' : ` · range ${st.range}`}</span></button>`; }).join('') : '';
    sheet(`<div class="mon-head">${svgImg(ART.monsterSVG(tk.mkey, 110), 'big')}<div><h2>${esc(tk.name)}</h2><div class="small muted">${esc(M.type || '')} · CR ${M.cr || '?'}${tk.boss ? ' · <b class="hot">BOSS</b>' : ''}</div>
      <div class="hpbar mon"><i style="width:${tk.hpPct * 100}%"></i></div><div class="small">${hpWord}${tk.hp != null ? ` (${tk.hp}/${tk.maxHp}, AC ${tk.ac})` : ''} · ${d === 99 ? '' : d + ' squares away'}</div>
      ${tk.conds.length ? `<div class="chips">${tk.conds.map(k => `<span class="chip">${RR.CONDITIONS[k]?.icon || ''} ${RR.CONDITIONS[k]?.name || k}</span>`).join('')}</div>` : ''}</div></div>
      ${M.att ? `<div class="small muted">${M.att.map(a => a.n).join(' · ')}${(M.traits || []).length ? ' · ' + M.traits.map(cap).join(', ') : ''}</div>` : ''}
      ${attackBtns ? `<div class="col sp">${attackBtns}</div>` : ''}
      ${ch && ch.spells.length && (canActCombat() || !inCombat()) ? `<button class="btn purple block" id="mSpell">✨ Cast a spell at it</button>` : ''}
      ${humanDM() ? `<div class="row wrap sp"><button class="chip" data-hp="-5">−5 HP</button><button class="chip" data-hp="-1">−1</button><button class="chip" data-hp="5">+5</button><button class="chip" id="mRm">Remove</button></div>` : ''}`, (m) => {
      $$('[data-w]', m).forEach(b => b.onclick = async () => { buzz(40); closeSheet(); try { await act('attack', { targetId: tk.id, weapon: +b.dataset.w }); } catch (e) { } });
      if ($('#mSpell')) $('#mSpell').onclick = () => spellSheet(tk);
      $$('[data-hp]', m).forEach(b => b.onclick = () => act('hp', { tokenId: tk.id, amount: +b.dataset.hp }));
      if ($('#mRm')) $('#mRm').onclick = () => { act('removetoken', { tokenId: tk.id }); closeSheet(); };
    });
  }
  function allySheet(tk) {
    const C = S.C; const ch = C.characters[tk.charId]; const me = myChar(); const t = myTok(); const d = t ? cheb(t, tk) : 99;
    const heals = me ? me.spells.filter(k => RR.SPELLS[k].kind === 'heal' && RR.SPELLS[k].target === 'ally') : [];
    const potion = me ? me.inventory.findIndex(i => i.k === 'potion_healing' || i.k === 'potion_greater') : -1;
    sheet(`<div class="mon-head">${heroPic(ch, 96)}<div><h2>${esc(ch.name)}</h2><div class="small">Lv ${ch.level} ${esc(ch.race)} ${esc(ch.class)}</div><div class="hpbar"><i style="width:${Math.max(0, ch.hp) / ch.maxHp * 100}%"></i></div><div class="small">${ch.dead ? '☠️ Fallen' : ch.hp <= 0 ? '💔 Unconscious!' : `HP ${ch.hp}/${ch.maxHp} · AC ${RR.computeAC(ch)}`} · ${d} squares away</div></div></div>
      ${me ? `<div class="col sp">${heals.map(k => `<button class="btn green block" data-spell="${k}">✨ ${RR.SPELLS[k].name} <span class="muted2">${RR.SPELLS[k].range === 1 ? 'touch' : 'range ' + RR.SPELLS[k].range}</span></button>`).join('')}
        ${me.features.includes('lay_on_hands') && me.pool > 0 ? `<button class="btn green block" id="aLoh">🙌 Lay on Hands (${me.pool} HP left)</button>` : ''}
        ${me.features.includes('bardic_inspiration') ? `<button class="btn purple block" id="aInsp">🎵 Bardic Inspiration</button>` : ''}
        ${potion >= 0 && ch.hp < ch.maxHp ? `<button class="btn ghost block" id="aPot">🧪 Give a potion (must be next to them)</button>` : ''}
        ${inCombat() ? `<button class="btn ghost block" id="aHelp">🤝 Help (they get advantage)</button>` : ''}
        ${ch.hp <= 0 && !ch.dead ? `<button class="btn ghost block" id="aStab">🩹 Stabilize (Medicine)</button>` : ''}
        <button class="btn ghost block" id="aGive">🎁 Give an item or gold</button></div>` : ''}`, () => {
      $$('[data-spell]').forEach(b => b.onclick = async () => { closeSheet(); await act('cast', { spell: b.dataset.spell, targetId: tk.id }).catch(() => { }); });
      if ($('#aLoh')) $('#aLoh').onclick = async () => { closeSheet(); await act('feature', { key: 'lay_on_hands', targetId: tk.id }).catch(() => { }); };
      if ($('#aInsp')) $('#aInsp').onclick = async () => { closeSheet(); await act('feature', { key: 'bardic_inspiration', targetId: tk.id }).catch(() => { }); };
      if ($('#aPot')) $('#aPot').onclick = async () => { closeSheet(); await act('item', { idx: potion, targetId: tk.id }).catch(() => { }); };
      if ($('#aHelp')) $('#aHelp').onclick = async () => { closeSheet(); await act('basic', { kind: 'help', targetId: tk.id }).catch(() => { }); };
      if ($('#aStab')) $('#aStab').onclick = async () => { closeSheet(); await act('basic', { kind: 'stabilize', targetId: tk.id }).catch(() => { }); };
      if ($('#aGive')) $('#aGive').onclick = () => giveSheet(ch);
    });
  }
  function giveSheet(to) {
    const me = myChar();
    sheet(`<h2>Give to ${esc(to.name)}</h2><ul class="list">${me.inventory.map((it, i) => `<li><span>${RR.ITEMS[it.k]?.icon || '•'} ${esc(it.n)}${it.q > 1 ? ' ×' + it.q : ''}</span><button class="chip" data-g="${i}">Give</button></li>`).join('')}</ul>
      <label>Gold (you have ${me.gold})</label><div class="row"><input id="gg" type="number" min="1" max="${me.gold}" placeholder="10"><button class="btn gold sm" id="ggo">Give gold</button></div>`, (m) => {
      $$('[data-g]', m).forEach(b => b.onclick = async () => { await act('give', { idx: +b.dataset.g, toCharId: to.id }).catch(() => { }); closeSheet(); });
      $('#ggo').onclick = async () => { await act('givegold', { toCharId: to.id, amount: +$('#gg').value }).catch(() => { }); closeSheet(); };
    });
  }
  function poiSheet(p) {
    const ch = myChar(); const C = S.C;
    const info = {
      chest: p.opened ? ['📦', p.name, 'Empty — already looted.', null] : ['📦', p.name, p.locked ? 'It\'s locked. You can try to pick or force it.' : 'What treasures lie within?', p.locked ? '🔓 Try to unlock & open' : '📦 Open it'],
      clue: ['🔎', p.name, p.read ? 'You\'ve already studied this.' : 'Something here is worth a closer look.', p.read ? '📖 Read again' : '🔎 Investigate'],
      shrine: ['🕯️', p.name, 'A place of quiet power. Pray for a blessing (once per hero).', '🙏 Pray'],
      trap: ['⚠️', p.name, p.disarmed ? 'Disarmed. Safe to walk over.' : 'A trap! Walk around it — or try to disarm it (Sleight of Hand).', p.disarmed ? null : '🛠️ Try to disarm'],
      gate: ['🚪', p.name, p.open ? 'The gate stands open.' : (p.needs ? `Locked. It needs: ${p.needs}.` : 'Locked.'), p.open ? null : '🗝️ Try the gate'],
      exit: ['🧭', p.toName || p.name, p.ready ? `Travel to ${p.toName || p.name}. The whole party goes together.` : (p.needs ? `You'll need ${p.needs} to go this way.` : 'Blocked.'), p.ready ? `🧭 Travel` : '🔍 Look closer']
    }[p.type] || ['❓', p.name, '', 'Interact'];
    sheet(`<div class="poi-head">${svgImg(ART.propSVG(p.type, 90, { opened: p.opened, open: p.open, locked: p.type === 'exit' && !p.ready }), 'big')}<div><h2>${esc(info[1])}</h2><p>${esc(info[2])}</p></div></div>
      ${info[3] && ch ? `<button class="btn green block lg" id="pGo">${info[3]}</button>${inCombat() ? '<div class="small center muted">Uses your action (you\'ll walk there first if needed).</div>' : '<div class="small center muted">Your hero walks over automatically.</div>'}` : ''}`, () => {
      if ($('#pGo')) $('#pGo').onclick = async () => { closeSheet(); buzz(30); try { await act('interact', p.tokenId ? { tokenId: p.tokenId } : { poiId: p.id }); } catch (e) { } };
    });
  }
  function talkSheet(key) {
    const C = S.C; const n = C.npcs[key]; if (!n) return; const ch = myChar();
    const lines = C.log.filter(e => (e.kind === 'npc' && e.npc === key) || (e.kind === 'say' && e.to === n.name)).slice(-6);
    sheet(`<div class="talk-head">${npcPic(n, 92)}<div><h2>${esc(n.name)}</h2><div class="small muted">${esc(n.role)}</div><div class="small">${esc(n.desc)}</div></div></div>
      ${n.secret ? `<div class="e clue small"><div class="e-k">🔓 Secret revealed</div>${esc(n.secret)}</div>` : ''}
      <div class="talk-log">${lines.length ? lines.map(entryHTML).join('') : `<div class="e npc">${npcPic(n, 34)}<div>“${n.met ? 'Back again?' : 'Hello there, traveler.'}”</div></div>`}</div>
      <div class="topics">${n.topics.map(t => `<button class="topic ${t.hot ? 'hot' : ''}" data-t="${esc(t.id)}">${esc(t.label)}</button>`).join('')}
      ${C.aiActive || humanDM() ? `<button class="topic say" id="tSay">💬 Say something…</button>` : ''}</div>`, (m) => {
      $$('[data-t]', m).forEach(b => b.onclick = async () => {
        const id = b.dataset.t;
        if (id === 'shop') return shopSheet(n);
        try { const r = await act('talk', { npcKey: key, topic: id }); } catch (e) { return; }
        setTimeout(() => { if (sheetOpen()) talkSheet(key); }, 120);
      });
      if ($('#tSay')) $('#tSay').onclick = () => composer('say', { npc: n });
      const tl = $('.talk-log', m); tl.scrollTop = tl.scrollHeight;
    });
  }
  function shopSheet(n) {
    const ch = myChar();
    sheet(`<h2>🛒 ${esc(n.name)}'s wares</h2><div class="small">You have <b>💰 ${ch.gold} gold</b></div>
      <ul class="list shop">${n.shop.map(it => `<li><div><b>${it.icon} ${esc(it.name)}</b><div class="small muted">${esc(it.desc || '')}</div></div><button class="btn sm ${ch.gold >= it.price ? 'gold' : 'ghost'}" data-buy="${it.k}" ${ch.gold >= it.price ? '' : 'disabled'}>${it.price} gp</button></li>`).join('')}</ul>
      <h3>Sell</h3><ul class="list">${ch.inventory.filter(i => RR.ITEMS[i.k]?.price && !RR.ITEMS[i.k]?.story).map(i => `<li><span>${RR.ITEMS[i.k].icon} ${esc(i.n)}${i.q > 1 ? ' ×' + i.q : ''}</span><button class="chip" data-sell="${ch.inventory.indexOf(i)}">Sell ${Math.floor(RR.ITEMS[i.k].price / 2)} gp</button></li>`).join('') || '<li class="muted small">Nothing to sell.</li>'}</ul>
      <button class="btn ghost block" id="sBack">‹ Back to ${esc(n.name)}</button>`, (m) => {
      $$('[data-buy]', m).forEach(b => b.onclick = async () => { try { await act('buy', { npcKey: n.key, item: b.dataset.buy }); buzz(30); toast('🛒 Bought!'); setTimeout(() => shopSheet(S.C.npcs[n.key]), 150); } catch (e) { } });
      $$('[data-sell]', m).forEach(b => b.onclick = async () => { try { await act('sell', { idx: +b.dataset.sell }); setTimeout(() => shopSheet(S.C.npcs[n.key]), 150); } catch (e) { } });
      $('#sBack').onclick = () => talkSheet(n.key);
    });
  }
  function slotPips(ch) { return ch.slots.map((s, i) => s.max ? `<span class="pips"><i>L${i + 1}</i>${'●'.repeat(s.max - s.used)}${'○'.repeat(s.used)}</span>` : '').join(''); }
  function spellSheet(preTarget) {
    const ch = myChar(); const C = S.C; const r = C.turn.res;
    const avail = (S) => S.lvl === 0 || ch.slots.some((s, i) => i + 1 >= S.lvl && s.max - s.used > 0);
    const costOk = (S) => !inCombat() || (S.cast === 'bonus' ? r.bonus : r.action);
    const groups = {}; ch.spells.forEach(k => { const S = RR.SPELLS[k]; (groups[S.lvl] = groups[S.lvl] || []).push(k); });
    sheet(`<h2>✨ Magic</h2><div class="small">${slotPips(ch) || 'Cantrips are free — cast them every turn!'} <span class="muted">· Spell attack ${fmt(RR.prof(ch.level) + RR.mod(ch.scores[RR.CLASSES[ch.class].castAb]))} · Save DC ${8 + RR.prof(ch.level) + RR.mod(ch.scores[RR.CLASSES[ch.class].castAb])}</span></div>
      ${Object.keys(groups).sort().map(l => `<h4>${l == 0 ? 'Cantrips' : 'Level ' + l}</h4>${groups[l].map(k => { const S = RR.SPELLS[k]; const ok = avail(S) && costOk(S); return `<button class="spell ${ok ? '' : 'off'}" data-k="${k}" ${ok ? '' : 'disabled'}><div class="row"><b class="grow">${esc(S.name)}</b><span class="tag ${S.cast === 'bonus' ? 'blue' : ''}">${S.cast === 'bonus' ? 'Bonus' : 'Action'}</span>${S.range ? `<span class="tag">${S.range === 1 ? 'Touch' : S.range * 5 + ' ft'}</span>` : ''}${S.dice ? `<span class="tag">${S.scale ? RR.cantripDice(S.dice, ch.level) : S.dice}</span>` : ''}</div><div class="small muted">${esc(S.desc)}</div></button>`; }).join('')}`).join('')}`, (m) => {
      $$('[data-k]', m).forEach(b => b.onclick = () => castFlow(b.dataset.k, preTarget));
    });
  }
  function castFlow(key, preTarget) {
    const S0 = RR.SPELLS[key]; const ch = myChar(); const t = myTok();
    const go = async (body) => { buzz(40); try { await act('cast', Object.assign({ spell: key }, body)); } catch (e) { } S.target = null; renderPlay(); };
    if (S0.target === 'self' || S0.target === 'allies' || S0.kind === 'utility') { closeSheet(); return go({}); }
    if (S0.target === 'enemy') {
      if (preTarget && cheb(preTarget, t) <= S0.range) { closeSheet(); return go({ targetId: preTarget.id }); }
      const valid = new Set(foes().filter(m => cheb(m, t) <= S0.range).map(m => m.id));
      return setTarget({ title: `✨ ${S0.name}`, hint: valid.size ? 'Tap a glowing enemy' : 'No enemy in range', valid, color: '#c9a6ff', range: { x: t.x, y: t.y, r: S0.range }, free: !inCombat(), pick: async (hit) => { const tk = hit?.token; if (!tk || !valid.has(tk.id)) { if (tk) toast('Out of range'); return true; } await go({ targetId: tk.id }); return true; } });
    }
    if (S0.target === 'ally') {
      const valid = new Set(allies().filter(a => cheb(a, t) <= S0.range).map(a => a.id));
      return setTarget({ title: `✨ ${S0.name}`, hint: S0.range === 1 ? 'Tap yourself or an ally next to you' : 'Tap a hero', valid, color: '#8fd16a', range: S0.range > 1 ? { x: t.x, y: t.y, r: S0.range } : null, free: !inCombat(), pick: async (hit) => { const tk = hit?.token; if (!tk || tk.kind !== 'pc') return true; if (!valid.has(tk.id)) { toast('Too far'); return true; } await go({ targetId: tk.id }); return true; } });
    }
    if (S0.target === 'area' || S0.target === 'tile') {
      let spot = null;
      const tgt = { title: `✨ ${S0.name}`, hint: S0.target === 'tile' ? 'Tap where to teleport' : 'Tap where to aim, then tap again to cast', color: '#ff7a3d', range: { x: t.x, y: t.y, r: S0.range }, free: !inCombat(), valid: new Set(),
        pick: async (hit, pos) => { if (cheb(pos, t) > S0.range) { toast('Out of range'); return true; } if (S0.target === 'tile') { await go({ x: pos.x, y: pos.y }); return true; } if (spot && spot.x === pos.x && spot.y === pos.y) { await go({ x: pos.x, y: pos.y }); return true; } spot = pos; tgt.area = { x: pos.x, y: pos.y, r: S0.radius || 1 }; tgt.hint = 'Tap the same spot again to cast'; S.target = tgt; renderPlay(); return true; } };
      return setTarget(tgt);
    }
  }
  function usableFeatures(ch) { return ch.features.filter(k => { const F = RR.FEATURES[k]; return F && F.kind !== 'passive' && !(k === 'martial_arts'); }).concat(ch.features.includes('martial_arts') ? ['martial_arts'] : []); }
  function featureUsesLeft(ch, k) { const F = RR.FEATURES[k]; if (!F.uses) return null; return F.uses(ch.level, ch) - (ch.uses[k] || 0); }
  function featureSheet() {
    const ch = myChar(); const r = S.C.turn.res;
    const feats = usableFeatures(ch);
    sheet(`<h2>⭐ Abilities</h2>${feats.map(k => { const F = RR.FEATURES[k]; const left = featureUsesLeft(ch, k); const cost = F.kind; const ok = (left == null || left > 0) && (cost === 'free' || !inCombat() || (cost === 'bonus' ? r?.bonus : r?.action)) && (k !== 'flurry' || (ch.ki && ch.ki.used < ch.ki.max)) && (k !== 'martial_arts' || (r?.attacked && r?.bonus)) && (k !== 'lay_on_hands' || ch.pool > 0);
      return `<button class="spell ${ok ? '' : 'off'}" data-f="${k}" ${ok ? '' : 'disabled'}><div class="row"><b class="grow">${esc(F.name)}</b><span class="tag ${cost === 'bonus' ? 'blue' : ''}">${cap(cost)}</span>${left != null ? `<span class="tag">${left} left</span>` : ''}${k === 'lay_on_hands' ? `<span class="tag">${ch.pool} HP</span>` : ''}${k === 'flurry' && ch.ki ? `<span class="tag">${ch.ki.max - ch.ki.used} ki</span>` : ''}</div><div class="small muted">${esc(F.desc)}</div></button>`; }).join('')}
      ${ch.features.filter(k => RR.FEATURES[k]?.kind === 'passive').length ? `<h4>Always on</h4><div class="chips">${ch.features.filter(k => RR.FEATURES[k]?.kind === 'passive').map(k => `<span class="chip" title="${esc(RR.FEATURES[k].desc)}">${esc(RR.FEATURES[k].name)}</span>`).join('')}</div>` : ''}`, (m) => {
      $$('[data-f]', m).forEach(b => b.onclick = () => {
        const k = b.dataset.f; const t = myTok();
        if (k === 'martial_arts' || k === 'flurry') { const valid = new Set(foes().filter(f => cheb(f, t) <= 1).map(f => f.id)); return setTarget({ title: k === 'flurry' ? '👊 Flurry of Blows' : '👊 Bonus unarmed strike', hint: 'Tap an adjacent enemy', valid, pick: async (hit) => { const tk = hit?.token; if (!tk || !valid.has(tk.id)) return true; await act(k === 'flurry' ? 'feature' : 'attack', k === 'flurry' ? { key: 'flurry', targetId: tk.id } : { targetId: tk.id, unarmedBonus: true }).catch(() => { }); S.target = null; renderPlay(); return true; } }); }
        if (k === 'hungry_jaws') { const valid = new Set(foes().filter(f => cheb(f, t) <= 1).map(f => f.id)); return setTarget({ title: '🦎 Hungry Jaws', hint: 'Tap an adjacent enemy to bite', valid, pick: async (hit) => { const tk = hit?.token; if (!tk || !valid.has(tk.id)) return true; await act('feature', { key: k, targetId: tk.id }).catch(() => { }); S.target = null; renderPlay(); return true; } }); }
        if (k === 'bardic_inspiration' || k === 'lay_on_hands' || k === 'healing_hands') { const valid = new Set(allies().filter(a => (k !== 'bardic_inspiration' ? cheb(a, t) <= 1 : a.id !== t.id && cheb(a, t) <= 12)).map(a => a.id)); return setTarget({ title: RR.FEATURES[k].name, hint: 'Tap a hero', valid, color: '#8fd16a', pick: async (hit) => { const tk = hit?.token; if (!tk || !valid.has(tk.id)) return true; await act('feature', { key: k, targetId: tk.id }).catch(() => { }); S.target = null; renderPlay(); return true; } }); }
        if (k === 'breath_weapon') { let spot = null; const tg = { title: '🐲 Breath Weapon', hint: 'Tap where to breathe (within 3), tap again to fire', range: { x: t.x, y: t.y, r: 3 }, valid: new Set(), pick: async (hit, pos) => { if (cheb(pos, t) > 3) { toast('Too far'); return true; } if (spot && spot.x === pos.x && spot.y === pos.y) { await act('feature', { key: k, x: pos.x, y: pos.y }).catch(() => { }); S.target = null; renderPlay(); return true; } spot = pos; tg.area = { x: pos.x, y: pos.y, r: 1 }; S.target = tg; renderPlay(); return true; } }; return setTarget(tg); }
        closeSheet(); act('feature', { key: k }).catch(() => { });
      });
    });
  }
  function itemSheet() {
    const ch = myChar(); const usable = ch.inventory.map((it, i) => ({ it, i, I: RR.ITEMS[it.k] })).filter(x => x.I && x.I.use);
    sheet(`<h2>🎒 Use an item</h2>${usable.length ? usable.map(({ it, i, I }) => `<button class="spell" data-i="${i}"><div class="row"><b class="grow">${I.icon} ${esc(it.n)}${it.q > 1 ? ' ×' + it.q : ''}</b><span class="tag ${I.cast === 'bonus' ? 'blue' : ''}">${I.cast === 'bonus' ? 'Bonus' : 'Action'}</span></div><div class="small muted">${esc(I.desc || '')}</div></button>`).join('') : '<p class="muted">Nothing usable. Buy potions in town!</p>'}
      <button class="btn ghost block" id="iAll">Open full pack</button>`, (m) => {
      $$('[data-i]', m).forEach(b => b.onclick = () => {
        const i = +b.dataset.i; const I = RR.ITEMS[ch.inventory[i].k]; const t = myTok();
        if (I.use === 'throw') { const valid = new Set(foes().filter(f => cheb(f, t) <= I.range).map(f => f.id)); return setTarget({ title: `${I.icon} Throw ${I.name}`, hint: 'Tap an enemy', valid, pick: async (hit) => { const tk = hit?.token; if (!tk || !valid.has(tk.id)) return true; await act('item', { idx: i, targetId: tk.id }).catch(() => { }); S.target = null; renderPlay(); return true; } }); }
        if (I.use === 'spell') { const Sp = RR.SPELLS[I.spell]; if (Sp.target === 'enemy') { const valid = new Set(foes().filter(f => cheb(f, t) <= Sp.range).map(f => f.id)); return setTarget({ title: `${I.icon} ${I.name}`, hint: 'Tap an enemy', valid, pick: async (hit) => { const tk = hit?.token; if (!tk || !valid.has(tk.id)) return true; await act('item', { idx: i, targetId: tk.id }).catch(() => { }); S.target = null; renderPlay(); return true; } }); } if (Sp.target === 'area') { let spot = null; const tg = { title: `${I.icon} ${I.name}`, hint: 'Tap where, then tap again', range: { x: t.x, y: t.y, r: Sp.range }, valid: new Set(), pick: async (hit, pos) => { if (spot && spot.x === pos.x && spot.y === pos.y) { await act('item', { idx: i, x: pos.x, y: pos.y }).catch(() => { }); S.target = null; renderPlay(); return true; } spot = pos; tg.area = { x: pos.x, y: pos.y, r: Sp.radius }; S.target = tg; renderPlay(); return true; } }; return setTarget(tg); } }
        closeSheet(); act('item', { idx: i }).catch(() => { });
      });
      $('#iAll').onclick = () => { closeSheet(); S.tab = 'hero'; renderTabs(); renderTab(true); };
    });
  }
  function moreSheet() {
    const ch = myChar(); const r = S.C.turn.res; const cunning = ch.features.includes('cunning_action') || ch.features.includes('nimble_escape'); const dashB = cunning || ch.features.includes('aggressive');
    const t = myTok(); const restrained = t && t.conds.includes('restrained');
    if (!inCombat()) {
      sheet(`<h2>More</h2><div class="col">
        <button class="btn ghost block" id="mGather">📣 Call the party to me</button>
        <button class="btn ghost block" id="mCheck">🎯 Make a skill check</button>
        <button class="btn ghost block" id="mDice">🎲 Roll dice</button>
        <button class="btn ghost block" id="mChat">💬 Party chat</button>
        ${humanDM() ? `<button class="btn blue block" id="mDM">📜 DM tools</button>` : ''}</div>`, () => {
        $('#mGather').onclick = () => { closeSheet(); act('gather', {}); }; $('#mCheck').onclick = checkSheet; $('#mDice').onclick = diceTray; $('#mChat').onclick = () => composer('chat'); if ($('#mDM')) $('#mDM').onclick = dmSheet;
      }); return;
    }
    const b = (k, label, desc, cost, ok = true) => `<button class="spell ${ok ? '' : 'off'}" data-k="${k}" data-bonus="${cost === 'bonus' ? 1 : ''}" ${ok ? '' : 'disabled'}><div class="row"><b class="grow">${label}</b><span class="tag ${cost === 'bonus' ? 'blue' : ''}">${cap(cost)}</span></div><div class="small muted">${desc}</div></button>`;
    sheet(`<h2>More actions</h2>
      ${restrained ? b('breakfree', '💪 Break free', 'Athletics or Acrobatics vs DC 12.', 'action', r.action) : ''}
      ${b('dash', '🏃 Dash', 'Double your movement this turn.', dashB && r.bonus ? 'bonus' : 'action', r.action || (dashB && r.bonus))}
      ${b('dodge', '💨 Dodge', 'Attacks against you have disadvantage until your next turn.', 'action', r.action)}
      ${b('hide', '🫥 Hide', 'Stealth check. If hidden, your next attack has advantage.', cunning && r.bonus ? 'bonus' : 'action', r.action || (cunning && r.bonus))}
      ${ch.weapons.filter(w => w.light && !w.ranged).length >= 2 ? b('offhand', '🗡️ Off-hand attack', 'After attacking with a light weapon, strike with the other.', 'bonus', r.bonus && r.lightUsed) : ''}
      ${b('do', '✍️ Something creative…', 'Swing from the chandelier, shove, trick... the DM decides.', 'action', r.action)}
      ${b('chat', '💬 Party chat', 'Talk out of character.', 'free')}`, (m) => {
      $$('[data-k]', m).forEach(x => x.onclick = () => {
        const k = x.dataset.k;
        if (k === 'do') return composer('do'); if (k === 'chat') return composer('chat');
        if (k === 'offhand') { const lw = ch.weapons.findIndex((w, i) => w.light && !w.ranged && i > 0) || 1; const valid = new Set(foes().filter(f => cheb(f, t) <= 1).map(f => f.id)); return setTarget({ title: '🗡️ Off-hand attack', hint: 'Tap an adjacent enemy', valid, pick: async (hit) => { const tk = hit?.token; if (!tk || !valid.has(tk.id)) return true; await act('attack', { targetId: tk.id, weapon: lw, offhand: true }).catch(() => { }); S.target = null; renderPlay(); return true; } }); }
        closeSheet(); act('basic', { kind: k, bonus: !!x.dataset.bonus });
      });
    });
  }
  function restSheet() {
    const C = S.C; const sc = C.scene;
    const inn = Object.values(C.npcs).find(n => n.here && n.inn);
    sheet(`<h2>🏕️ Rest</h2>
      <button class="spell" id="rShort"><b>☕ Short rest</b><div class="small muted">An hour to bind wounds: spend Hit Dice to heal and recharge some abilities. (${2 - (C.shortRests || 0)} left before you need a long rest)</div></button>
      ${sc.kind === 'town' ? (inn ? `<button class="spell" id="rInn"><b>🛏️ Rent rooms at the inn</b><div class="small muted">Full heal, all spells and abilities back. 5 gold per hero.</div></button>` : '') : `<button class="spell" id="rCamp"><b>🌙 Make camp</b><div class="small muted">A full long rest... if nothing finds you in the night. Safer once an area is cleared.</div></button>`}`, () => {
      $('#rShort').onclick = () => { closeSheet(); act('rest', { kind: 'short' }); };
      if ($('#rInn')) $('#rInn').onclick = () => { closeSheet(); act('talk', { npcKey: inn.key, topic: 'rest' }); };
      if ($('#rCamp')) $('#rCamp').onclick = () => { closeSheet(); act('rest', { kind: 'camp' }); };
    });
  }
  function checkSheet() {
    const ch = myChar();
    sheet(`<h2>🎯 Skill check</h2><div class="skillgrid">${Object.keys(RR.SKILLS).map(k => { const m = RR.mod(ch.scores[RR.SKILLS[k]]) + (ch.skills.includes(k) ? RR.prof(ch.level) : 0); return `<button class="sk ${ch.skills.includes(k) ? 'prof' : ''}" data-sk="${k}"><span>${cap(k)}</span><b>${fmt(m)}</b></button>`; }).join('')}</div>`, (m) => {
      $$('[data-sk]', m).forEach(b => b.onclick = () => { closeSheet(); act('check', { skill: b.dataset.sk }); });
    });
  }
  function diceTray() {
    const dice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '2d6'];
    sheet(`<h2>🎲 Dice</h2><div class="dice-grid">${dice.map(d => `<button class="btn ${d === 'd20' ? 'red' : 'ghost'}" data-d="${d}">${d}</button>`).join('')}</div>
      <div class="row sp"><input id="df" placeholder="3d6+2"><button class="btn dark" id="dgo">Roll</button></div><div class="small muted">Rolls are shown to the whole party.</div>`, (m) => {
      const roll = (f) => { closeSheet(); act('freeroll', { formula: f }); };
      $$('[data-d]', m).forEach(b => b.onclick = () => roll(b.dataset.d.startsWith('d') ? '1' + b.dataset.d : b.dataset.d));
      $('#dgo').onclick = () => roll($('#df').value || '1d20');
    });
  }
  // big tumbling d20
  function diceShow(pick, tot, ok, free, crit) {
    const d = document.createElement('div'); d.className = 'diceov';
    const res = free ? '' : ok === true ? (crit ? 'CRITICAL!' : 'Success!') : ok === false ? (pick === 1 ? 'Natural 1…' : 'Miss…') : '';
    d.innerHTML = `<div class="d20 roll"><svg viewBox="0 0 100 100" width="130" height="130"><polygon points="50,4 92,28 92,72 50,96 8,72 8,28" fill="${pick === 20 ? '#d9a62e' : pick === 1 ? '#5a3a3a' : '#b5452c'}" stroke="#2b1d12" stroke-width="3"/><polygon points="50,22 78,66 22,66" fill="rgba(255,255,255,.15)" stroke="#2b1d12" stroke-width="2"/><text x="50" y="58" text-anchor="middle" font-size="30" font-weight="900" fill="#fff8ea" id="dnum">?</text></svg></div><div class="dres"></div>`;
    document.body.appendChild(d);
    let i = 0; const spin = setInterval(() => { const n = d.querySelector('#dnum'); if (n) n.textContent = 1 + Math.floor(Math.random() * 20); if (++i > 8) { clearInterval(spin); n.textContent = pick; d.querySelector('.d20').classList.remove('roll'); d.querySelector('.d20').classList.add(pick === 20 ? 'nat20' : pick === 1 ? 'nat1' : 'land'); d.querySelector('.dres').innerHTML = `${tot !== pick && tot != null ? `<b>${tot}</b> total` : ''}${res ? `<div class="${ok ? 'good' : 'bad'}">${res}</div>` : ''}`; if (pick === 20) buzz([60, 40, 60, 40, 200]); } }, 55);
    d.onclick = () => d.remove(); setTimeout(() => d.remove(), 1700);
  }

  // ---------------- lobby ----------------
  function renderLobby() {
    const C = S.C; const main = $('#main'); const ch = myChar(); const owner = C.ownerId === C.me; const chars = Object.values(C.characters);
    main.innerHTML = `<div class="scroll lobby"><div class="card center tilt">
      <div class="small muted">${C.adventure ? 'Your adventure' : 'A custom adventure'}</div><h1>${esc(C.adventure ? C.adventure.title : 'Written by the AI DM')}</h1>
      <p class="premise">${esc(C.adventure ? C.adventure.premise : C.premise)}</p>
      ${C.status === 'building' ? '<div class="thinking big">🤖 The Dungeon Master is writing your adventure… (about 30 seconds)</div>' : ''}</div>
      <div class="card center"><div class="small">Invite friends with this code</div><div class="bigcode">${C.code}</div><button class="btn ghost sm" id="share">📤 Share invite</button></div>
      <div class="card"><h3>Heroes ready</h3><div class="party-row">${chars.map(c => `<div class="pmini">${heroPic(c, 64)}<b>${esc(c.name)}</b><span class="small muted">${esc(c.race)} ${esc(c.class)}</span></div>`).join('') || '<span class="muted">No heroes yet.</span>'}</div>
      ${!ch ? `<button class="btn green block lg" id="bMake">🧙 Create your hero</button>` : ''}
      ${owner && C.status === 'lobby' ? `<button class="btn red block xl" id="bStart" ${chars.length ? '' : 'disabled'}>📜 Begin the adventure</button><div class="small center muted">Friends can still join after you start.</div>` : C.status === 'lobby' ? `<div class="center muted">Waiting for the leader to begin…</div>` : ''}</div>
      ${pushPrompt()}</div>`;
    $('#share').onclick = () => share();
    if ($('#bMake')) $('#bMake').onclick = () => { S.tab = 'hero'; renderTabs(); renderTab(true); };
    if ($('#bStart')) $('#bStart').onclick = () => act('start', {});
    if ($('#bPush2')) $('#bPush2').onclick = enablePush;
  }
  const pushPrompt = () => (S.me && S.me.push && 'Notification' in window && Notification.permission === 'granted') ? '' : `<div class="card banner gold"><div class="grow"><b>🔔 Turn alerts</b><div class="small">So you know when it's your move.</div></div><button class="btn dark sm" id="bPush2">Turn on</button></div>`;
  async function share() { const C = S.C; const text = `Join my D&D party "${C.name}" on Roll Call! Code: ${C.code}`; try { if (navigator.share) await navigator.share({ title: 'Roll Call', text, url: location.origin }); else { await navigator.clipboard.writeText(text + ' ' + location.origin); toast('Invite copied'); } } catch (e) { } }

  // ---------------- HERO ----------------
  function renderHero() {
    const main = $('#main'); const ch = myChar(); if (!ch) return renderCreator();
    const C = S.C; const ac = RR.computeAC(ch); const nextXp = RR.XP_LEVELS[ch.level] || ch.xp; const prevXp = RR.XP_LEVELS[ch.level - 1] || 0;
    const sk = (k) => RR.mod(ch.scores[RR.SKILLS[k]]) + (ch.skills.includes(k) ? RR.prof(ch.level) : 0);
    const castAb = RR.CLASSES[ch.class].castAb;
    const eq = ch.equip;
    main.innerHTML = `<div class="scroll hero">
      <div class="card herohead"><button class="portrait" id="bLook">${heroArt(ch, 110)}<span class="editpen">🎨</span></button><div class="grow"><h2>${esc(ch.name)}</h2><div>Level ${ch.level} ${esc(ch.race)} ${esc(ch.class)}</div>
        <div class="hpbar big"><i style="width:${Math.max(0, ch.hp) / ch.maxHp * 100}%"></i>${ch.temp ? `<u style="width:${Math.min(100, ch.temp / ch.maxHp * 100)}%"></u>` : ''}<span>${ch.dead ? '☠️ Dead' : ch.hp <= 0 ? '💔 Down' : `${ch.hp} / ${ch.maxHp} HP`}${ch.temp ? ` +${ch.temp}` : ''}</span></div>
        <div class="xp"><div class="hpbar xpbar"><i style="width:${Math.min(100, (ch.xp - prevXp) / Math.max(1, nextXp - prevXp) * 100)}%"></i><span>XP ${ch.xp} / ${nextXp}</span></div>${ch.levelUpReady ? `<button class="btn gold sm pulse" id="bLvl">⭐ Level up!</button>` : ''}</div></div></div>
      <div class="statrow"><div><b>🛡️ ${ac}</b>AC</div><div><b>👣 ${ch.speed}</b>Speed</div><div><b>${fmt(RR.mod(ch.scores.dex))}</b>Init</div><div><b>${fmt(RR.prof(ch.level))}</b>Prof</div><div><b>💰 ${ch.gold}</b>Gold</div></div>
      ${ch.conds.length ? `<div class="chips">${ch.conds.map(k => `<span class="chip">${RR.CONDITIONS[k.k]?.icon || ''} ${RR.CONDITIONS[k.k]?.name || k.k}</span>`).join('')}</div>` : ''}
      <div class="abil">${RR.ABILITIES.map(a => `<button class="card ab" data-ab="${a}"><div class="k">${a.toUpperCase()}</div><div class="m">${fmt(RR.mod(ch.scores[a]))}</div><div class="s">${ch.scores[a]}${ch.saves.includes(a) ? ' ★' : ''}</div></button>`).join('')}</div>
      <div class="small center muted">Tap to roll a check · ★ = proficient saving throw</div>
      <div class="card"><h3>⚔️ Attacks</h3><ul class="list">${ch.weapons.map((w, i) => { const st = weaponStats(ch, w); return `<li><span>${esc(w.name)}${w.range > 1 ? ` <span class="small muted">${w.range * 5} ft</span>` : ''}</span><span><b>${fmt(st.hit)}</b> · ${st.dmg}${ch.weapons.length > 1 ? ` <button class="mini" data-unw="${i}">✕</button>` : ''}</span></li>`; }).join('')}</ul></div>
      ${ch.spells.length ? `<div class="card"><h3>✨ Spells</h3><div class="small">${slotPips(ch)} <span class="muted">· attack ${fmt(RR.prof(ch.level) + RR.mod(ch.scores[castAb]))} · DC ${8 + RR.prof(ch.level) + RR.mod(ch.scores[castAb])}</span></div><div class="chips">${ch.spells.map(k => `<button class="chip" data-sp="${k}">${RR.SPELLS[k].lvl ? '' : '∞ '}${esc(RR.SPELLS[k].name)}</button>`).join('')}</div></div>` : ''}
      <div class="card"><h3>⭐ Features</h3><div class="chips">${ch.features.map(k => RR.FEATURES[k] ? `<button class="chip" data-ft="${k}">${esc(RR.FEATURES[k].name)}${featureUsesLeft(ch, k) != null ? ` (${featureUsesLeft(ch, k)})` : ''}</button>` : '').join('')}${RR.RACES[ch.race].traits.map(t => `<span class="chip muted2">${esc(t)}</span>`).join('')}</div></div>
      <div class="card"><h3>🛡️ Equipped</h3><ul class="list">
        <li><span>Armor</span><span>${eq.armor ? esc(RR.ITEMS[eq.armor]?.name || RR.ARMOR[eq.armor]?.name) + ` <button class="mini" data-une="armor">✕</button>` : '<span class="muted">none</span>'}</span></li>
        <li><span>Shield</span><span>${eq.shield ? 'Shield (+2) <button class="mini" data-une="shield">✕</button>' : '<span class="muted">none</span>'}</span></li>
        ${['ring', 'cloak', 'boots'].filter(k => eq[k]).map(k => `<li><span>${cap(k)}</span><span>${esc(RR.ITEMS[eq[k]].name)} <button class="mini" data-une="${k}">✕</button></span></li>`).join('')}</ul></div>
      <div class="card"><h3>🎒 Pack</h3><ul class="list">${ch.inventory.map((it, i) => { const I = RR.ITEMS[it.k]; return `<li data-inv="${i}"><span>${I?.icon || '•'} ${esc(it.n)}${it.q > 1 ? ' ×' + it.q : ''}${it.ch != null ? ` (${it.ch} charges)` : ''}</span><b class="chev">›</b></li>`; }).join('') || '<li class="muted">Empty</li>'}</ul></div>
      <div class="card"><h3>🎯 Skills</h3><div class="skillgrid">${Object.keys(RR.SKILLS).map(k => `<button class="sk ${ch.skills.includes(k) ? 'prof' : ''}" data-sk="${k}"><span>${cap(k)}</span><b>${fmt(sk(k))}</b></button>`).join('')}</div></div>
      <div class="card"><h3>📖 Backstory</h3><textarea id="bs" rows="3" placeholder="Where does your hero come from? What do they want? The DM uses this!">${esc(ch.backstory)}</textarea><button class="btn ghost sm" id="saveBs">Save</button></div>
      <div style="height:20px"></div></div>`;
    $('#bLook').onclick = lookSheet;
    if ($('#bLvl')) $('#bLvl').onclick = async () => { try { const r = await act('levelup', {}); if (r.levelup) levelUpCard(r.levelup); } catch (e) { } };
    $$('[data-ab]').forEach(b => b.onclick = () => sheet(`<h2>${RR.ABILITY_NAMES[b.dataset.ab]}</h2><div class="col"><button class="btn green block" id="abC">🎲 ${RR.ABILITY_NAMES[b.dataset.ab]} check (${fmt(RR.mod(ch.scores[b.dataset.ab]))})</button><button class="btn ghost block" id="abS">🛡️ Saving throw (${fmt(RR.mod(ch.scores[b.dataset.ab]) + (ch.saves.includes(b.dataset.ab) ? RR.prof(ch.level) : 0))})</button></div>`, () => { $('#abC').onclick = () => { closeSheet(); act('check', { ability: b.dataset.ab }); }; $('#abS').onclick = () => { closeSheet(); act('check', { ability: b.dataset.ab, save: true }); }; }));
    $$('[data-sk]').forEach(b => b.onclick = () => act('check', { skill: b.dataset.sk }));
    $$('[data-sp]').forEach(b => b.onclick = () => { const Sp = RR.SPELLS[b.dataset.sp]; sheet(`<h2>✨ ${esc(Sp.name)}</h2><div class="chips"><span class="tag">${Sp.lvl ? 'Level ' + Sp.lvl : 'Cantrip'}</span><span class="tag">${Sp.cast === 'bonus' ? 'Bonus action' : 'Action'}</span>${Sp.range ? `<span class="tag">${Sp.range === 1 ? 'Touch' : Sp.range * 5 + ' ft'}</span>` : ''}${Sp.dice ? `<span class="tag">${Sp.scale ? RR.cantripDice(Sp.dice, ch.level) : Sp.dice}</span>` : ''}</div><p>${esc(Sp.desc)}</p><div class="small muted">Cast it from the Play screen with ✨ Magic.</div>`); });
    $$('[data-ft]').forEach(b => b.onclick = () => { const F = RR.FEATURES[b.dataset.ft]; sheet(`<h2>⭐ ${esc(F.name)}</h2><p>${esc(F.desc)}</p>`); });
    $$('[data-inv]').forEach(li => li.onclick = () => invSheet(+li.dataset.inv));
    $$('[data-une]').forEach(b => b.onclick = (e) => { e.stopPropagation(); act('unequip', { what: b.dataset.une }); });
    $$('[data-unw]').forEach(b => b.onclick = (e) => { e.stopPropagation(); act('unequip', { what: 'weapon', i: +b.dataset.unw }); });
    $('#saveBs').onclick = async () => { await act('character', { edit: true, backstory: $('#bs').value }); toast('Saved'); };
  }
  function invSheet(i) {
    const ch = myChar(); const it = ch.inventory[i]; const I = RR.ITEMS[it.k] || {};
    const others = Object.values(S.C.characters).filter(c => c.id !== ch.id);
    sheet(`<h2>${I.icon || '•'} ${esc(it.n)}${it.q > 1 ? ' ×' + it.q : ''}</h2><p>${esc(I.desc || (I.armor ? `AC ${RR.ARMOR[I.armor].base}${RR.ARMOR[I.armor].dexMax == null ? ' + Dex' : RR.ARMOR[I.armor].dexMax ? ' + Dex (max 2)' : ''} · ${RR.ARMOR[I.armor].cat} armor` : I.weapon ? `${RR.WEAPONS[I.weapon].dice} ${RR.WEAPONS[I.weapon].type}${I.plus ? ' · +' + I.plus + ' magic' : ''}` : ''))}</p>
      <div class="col">${I.use ? `<button class="btn green block" id="iUse">Use</button>` : ''}${I.equip ? `<button class="btn blue block" id="iEq">Equip</button>` : ''}
      ${others.length ? `<div class="row wrap">${others.map(o => `<button class="chip" data-to="${o.id}">🎁 Give to ${esc(o.name)}</button>`).join('')}</div>` : ''}
      ${!I.story ? `<button class="btn ghost block" id="iDrop">Drop</button>` : '<div class="small muted">Important story item.</div>'}</div>`, (m) => {
      if ($('#iUse')) $('#iUse').onclick = () => { closeSheet(); act('item', { idx: i }); };
      if ($('#iEq')) $('#iEq').onclick = () => { closeSheet(); act('equip', { idx: i }); };
      $$('[data-to]', m).forEach(b => b.onclick = () => { closeSheet(); act('give', { idx: i, toCharId: b.dataset.to }); });
      if ($('#iDrop')) $('#iDrop').onclick = () => { closeSheet(); act('drop', { idx: i }); };
    });
  }
  function levelUpCard(r) {
    sheet(`<div class="center"><div class="lvlburst">⭐</div><h1>Level ${r.level}!</h1><p><b>+${r.hp} max HP</b></p>
      ${r.features.length ? `<h3>New abilities</h3><div class="chips center">${r.features.map(f => `<span class="chip on">${esc(f)}</span>`).join('')}</div>` : ''}
      ${r.spells.length ? `<h3>New spells</h3><div class="chips center">${r.spells.map(f => `<span class="chip on">${esc(f)}</span>`).join('')}</div>` : ''}
      ${r.slots.length ? `<div class="small">Spell slots: ${r.slots.map((n, i) => n ? `L${i + 1}×${n}` : '').filter(Boolean).join(' · ')}</div>` : ''}
      <button class="btn gold block lg" data-close>Awesome!</button></div>`, (m) => { $$('[data-close]', m).forEach(b => b.onclick = closeSheet); });
  }

  // creator
  function renderCreator() {
    const main = $('#main');
    const st = S.creator || (S.creator = { name: S.me ? S.me.name : '', race: 'Human', class: 'Fighter', method: 'std', pool: RR.STANDARD_ARRAY.slice(), assign: {}, skills: [], look: { skin: '#e0b48a', hair: '#4a2c17', hairStyle: 0, cloak: null }, backstory: '' });
    if (!Object.keys(st.assign).length) autoAssign(st);
    const C = RR.CLASSES[st.class]; const race = RR.RACES[st.race]; const look = Object.assign({}, st.look, { cloak: st.look.cloak || C.color });
    const fin = (a) => st.assign[a] + (race.bonus[a] || 0);
    const hp = C.hitDie + RR.mod(fin('con'));
    const SK = ['#f6d3b3', '#e0b48a', '#c68e5e', '#8d5a3a', '#5c3a24', '#9bc48a', '#b7a2d6', '#d97a6a'];
    const HA = ['#1d140e', '#4a2c17', '#8a5a2b', '#d9a62e', '#e8e0d0', '#b5452c', '#2f5b9a', '#5a5a5a'];
    const CL = ['#b5452c', '#2f5b9a', '#4f8a3a', '#8a4fa3', '#3b3b46', '#d9a62e', '#c7782e', '#5b6f86'];
    main.innerHTML = `<div class="scroll creator">
      <div class="card preview"><div class="portrait">${ART.heroSVG(look, st.class, st.race, 120, { main: { Wizard: 'staff' }[st.class] || RR.CLASSES[st.class].start.weapons[0], off: RR.CLASSES[st.class].start.shield ? 'shield' : undefined })}</div><div class="grow"><input id="hn" value="${esc(st.name)}" maxlength="24" placeholder="Hero name"><div class="small">${esc(st.race)} ${esc(st.class)} · ❤️ ${hp} HP · 🛡️ AC ${RR.computeAC({ race: st.race, class: st.class, scores: Object.fromEntries(RR.ABILITIES.map(a => [a, fin(a)])), equip: { armor: C.start.armor, shield: C.start.shield }, features: RR.featuresAt(st.class, 1) })}</div><button class="chip" id="rndName">🎲 Random name</button></div></div>
      <h3>1 · Class</h3><div class="picks">${Object.keys(RR.CLASSES).map(k => `<button class="pick ${st.class === k ? 'on' : ''}" data-class="${k}">${ART.heroSVG(Object.assign({}, look, { cloak: RR.CLASSES[k].color, headgear: 'auto', trim: null }), k, st.race, 54)}<b>${k}</b></button>`).join('')}</div>
      <div class="blurb">${C.icon} <b>${st.class}:</b> ${esc(C.blurb)}</div>
      <h3>2 · Race</h3><div class="picks race">${Object.keys(RR.RACES).map(r => `<button class="pick ${st.race === r ? 'on' : ''}" data-race="${r}">${ART.heroSVG(Object.assign({}, look, { headgear: 'none', beard: undefined, build: undefined, skin: r === st.race ? look.skin : (ART.RACE_SKIN[r] || (ART.RACE_SKIN[st.race] ? '#e0b48a' : look.skin)) }), null, r, 50, { gear: false })}<b>${r}</b><span>${Object.entries(RR.RACES[r].bonus).map(([k, v]) => k.toUpperCase() + '+' + v).join(' ').replace('STR+1 DEX+1 CON+1 INT+1 WIS+1 CHA+1', 'All +1')}</span></button>`).join('')}</div>
      <div class="blurb"><b>${st.race}:</b> ${esc(race.blurb)} ${esc(race.traits.join(' · '))}</div>
      <h3>3 · Abilities</h3><div class="row wrap"><button class="chip ${st.method === 'std' ? 'on' : ''}" id="mStd">✨ Recommended</button><button class="chip ${st.method === 'roll' ? 'on' : ''}" id="mRoll">🎲 Roll 4d6</button></div>
      <div class="abil edit">${RR.ABILITIES.map(a => `<div class="card ab"><div class="k">${a.toUpperCase()}${a === C.primary ? ' ⭐' : ''}</div><div class="m">${fin(a)}</div><div class="s">${fmt(RR.mod(fin(a)))}</div><div class="row"><button class="mini" data-dn="${a}">◀</button><button class="mini" data-up="${a}">▶</button></div></div>`).join('')}</div>
      <div class="small muted center">◀ ▶ swaps scores between abilities. ⭐ = most important for a ${st.class}.</div>
      <h3>4 · Skills <span class="small muted">pick ${C.picks}</span></h3><div class="chips">${C.skillChoices.map(k => `<button class="chip ${st.skills.includes(k) ? 'on' : ''}" data-sk="${k}">${cap(k)}</button>`).join('')}</div>
      <h3>5 · Look</h3>${lookEditor(st.look, st.race, st.class)}
      <h3>6 · Backstory <span class="small muted">optional</span></h3><textarea id="hb" rows="3" placeholder="Raised by smugglers. Owes a dragon 3 gold. Afraid of ducks.">${esc(st.backstory)}</textarea>
      <button class="btn red block xl" id="hgo">⚔️ Join the adventure</button><div style="height:20px"></div></div>`;
    const keep = () => { st.name = $('#hn').value; st.backstory = $('#hb').value; };
    const rer = () => { keep(); const sc = $('.creator').scrollTop; renderCreator(); $('.creator').scrollTop = sc; };
    $$('[data-class]').forEach(b => b.onclick = () => { st.class = b.dataset.class; st.skills = []; st.look.cloak = null; autoAssign(st); rer(); });
    $$('[data-race]').forEach(b => b.onclick = () => { const prev = st.race; st.race = b.dataset.race; const pal = (r) => ART.RACE_PAL[r] || SW.skin; if (!pal(st.race).includes(st.look.skin) || (ART.RACE_SKIN[prev] && st.look.skin === ART.RACE_SKIN[prev])) st.look.skin = ART.RACE_SKIN[st.race] || '#e0b48a'; rer(); });
    $('#mStd').onclick = () => { st.method = 'std'; st.pool = RR.STANDARD_ARRAY.slice(); autoAssign(st); rer(); };
    $('#mRoll').onclick = () => { st.method = 'roll'; st.pool = Array.from({ length: 6 }, () => { const r = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a); return r[0] + r[1] + r[2]; }).sort((a, b) => b - a); autoAssign(st); buzz(60); rer(); };
    const order = RR.ABILITIES;
    const swap = (a, dir) => { const vals = order.map(k => st.assign[k]); const sorted = [...new Set(vals)].sort((x, y) => x - y); const cur = st.assign[a]; const other = order.filter(k => k !== a).sort((x, y) => st.assign[x] - st.assign[y]); const target = dir > 0 ? other.find(k => st.assign[k] > cur) : other.slice().reverse().find(k => st.assign[k] < cur); if (!target) return; const tv = st.assign[target]; st.assign[target] = cur; st.assign[a] = tv; rer(); };
    $$('[data-up]').forEach(b => b.onclick = () => swap(b.dataset.up, 1)); $$('[data-dn]').forEach(b => b.onclick = () => swap(b.dataset.dn, -1));
    $$('[data-sk]').forEach(b => b.onclick = () => { const k = b.dataset.sk; if (st.skills.includes(k)) st.skills = st.skills.filter(x => x !== k); else if (st.skills.length < C.picks) st.skills.push(k); else toast(`Pick ${C.picks} — tap one to swap it`); rer(); });
    bindLook($('.lookedit'), st.look, rer);
    $('#rndName').onclick = () => { const A = ['Bram', 'Kira', 'Thorne', 'Wyn', 'Ash', 'Rook', 'Juniper', 'Tamsin', 'Fen', 'Orla', 'Kael', 'Pip', 'Sable', 'Ivo', 'Nim', 'Rhea', 'Dax', 'Lark']; const B = ['Ironfoot', 'Swiftbrook', 'Ashveil', 'Thornwood', 'Stormcall', 'Quickfingers', 'Brightshield', 'Moonwhisper', 'Emberheart', 'Graves']; st.name = A[Math.floor(Math.random() * A.length)] + ' ' + B[Math.floor(Math.random() * B.length)]; $('#hn').value = st.name; };
    $('#hgo').onclick = async () => {
      keep(); if (!st.name.trim()) return toast('Name your hero'); if (st.skills.length < C.picks) { const left = C.skillChoices.filter(k => !st.skills.includes(k)); while (st.skills.length < C.picks && left.length) st.skills.push(left.shift()); }
      try { await act('character', { name: st.name, race: st.race, class: st.class, base: st.assign, skills: st.skills, look: Object.assign({}, st.look, { cloak: st.look.cloak || C.color }), backstory: st.backstory }); S.creator = null; buzz([80, 40, 120]); toast('🧙 Hero created!'); S.tab = 'play'; renderTabs(); renderTab(true); } catch (e) { }
    };
  }
  function autoAssign(st) { const C = RR.CLASSES[st.class]; const pri = { Barbarian: ['str', 'con', 'dex', 'wis', 'cha', 'int'], Bard: ['cha', 'dex', 'con', 'wis', 'int', 'str'], Cleric: ['wis', 'con', 'str', 'dex', 'cha', 'int'], Druid: ['wis', 'con', 'dex', 'int', 'cha', 'str'], Fighter: ['str', 'con', 'dex', 'wis', 'cha', 'int'], Monk: ['dex', 'wis', 'con', 'str', 'int', 'cha'], Paladin: ['str', 'cha', 'con', 'wis', 'dex', 'int'], Ranger: ['dex', 'wis', 'con', 'str', 'int', 'cha'], Rogue: ['dex', 'con', 'int', 'wis', 'cha', 'str'], Sorcerer: ['cha', 'con', 'dex', 'wis', 'int', 'str'], Warlock: ['cha', 'con', 'dex', 'wis', 'int', 'str'], Wizard: ['int', 'con', 'dex', 'wis', 'cha', 'str'] }[st.class]; const pool = st.pool.slice().sort((a, b) => b - a); pri.forEach((a, i) => st.assign[a] = pool[i]); }

  // ---------------- JOURNAL ----------------
  function renderJournal() {
    const C = S.C; const main = $('#main'); const owner = C.ownerId === C.me;
    const qs = C.quests.filter(q => q.status === 'active').concat(C.quests.filter(q => q.status === 'done'));
    const npcs = Object.values(C.npcs).filter(n => n.met || n.here);
    main.innerHTML = `<div class="scroll journal">
      <div class="card tilt"><div class="small muted">${C.adventure ? 'Chapter ' + (C.adventure.chapter || 1) : ''}</div><h2>${esc(C.adventure ? C.adventure.title : C.name)}</h2><p class="premise">${esc(C.adventure ? C.adventure.premise : '')}</p>
        ${C.adventure && C.adventure.done && owner ? `<button class="btn red block lg" id="bNext">📜 Start the next chapter</button>` : ''}</div>
      <h3>📜 Quests</h3>${qs.length ? qs.map(q => `<div class="card quest ${q.status}"><div class="row"><b class="grow">${q.main ? '⭐ ' : ''}${esc(q.title)}</b>${q.status === 'done' ? '<span class="tag green">Done</span>' : ''}</div>${q.giver ? `<div class="small muted">From ${esc(q.giver)}</div>` : ''}<div class="small">${esc(q.desc || '')}</div>
        <ul class="objs">${q.objectives.map((o, i) => { const firstOpen = q.objectives.findIndex(x => !x.done) === i; return `<li class="${o.done ? 'done' : firstOpen ? 'next' : ''}">${o.done ? '✔' : firstOpen ? '➤' : '○'} ${esc(o.t)}</li>`; }).join('')}</ul>
        ${q.reward && q.status !== 'done' ? `<div class="small muted">Reward: ${[q.reward.gold ? q.reward.gold + ' gold' : '', q.reward.xp ? q.reward.xp + ' XP' : '', q.reward.item ? (RR.ITEMS[q.reward.item]?.name || q.reward.item) : ''].filter(Boolean).join(' · ')}</div>` : ''}</div>`).join('') : '<p class="muted">No quests yet — talk to people!</p>'}
      <h3>🧑‍🤝‍🧑 People</h3><div class="people">${npcs.map(n => `<button class="card person" data-npc="${n.key}">${npcPic(n, 54)}<div class="left"><b>${esc(n.name)}</b><div class="small muted">${esc(n.role)}</div>${n.here ? '<span class="tag green">Here</span>' : ''}${n.secret ? '<span class="tag gold">Secret known</span>' : ''}</div></button>`).join('') || '<p class="muted">Nobody yet.</p>'}</div>
      <h3>🗺️ Places</h3><div class="chips">${C.scenes.map(s => `<span class="chip ${C.scene && s.key === C.scene.key ? 'on' : ''}">${C.scene && s.key === C.scene.key ? '📍 ' : ''}${esc(s.name)}</span>`).join('')}</div>
      <div style="height:20px"></div></div>`;
    if ($('#bNext')) $('#bNext').onclick = () => act('nextadventure', {});
    $$('[data-npc]').forEach(b => b.onclick = () => { const n = C.npcs[b.dataset.npc]; if (n.here) talkSheet(n.key); else sheet(`<div class="talk-head">${npcPic(n, 92)}<div><h2>${esc(n.name)}</h2><div class="small muted">${esc(n.role)}</div><p>${esc(n.desc)}</p></div></div>${n.secret ? `<div class="e clue"><div class="e-k">🔓 Secret</div>${esc(n.secret)}</div>` : ''}<div class="small muted">Not here right now.</div>`); });
  }

  // ---------------- PARTY & DM ----------------
  function renderParty() {
    const C = S.C; const main = $('#main'); const owner = C.ownerId === C.me; const chars = Object.values(C.characters);
    main.innerHTML = `<div class="scroll party">
      <div class="card row"><div class="grow"><div class="small muted">Invite code</div><div class="bigcode sm">${C.code}</div></div><button class="btn ghost sm" id="share">📤 Share</button></div>
      ${pushPrompt()}
      <h3>👥 Party</h3>${C.members.map(m => { const ch = chars.find(c => c.ownerId === m.id); return `<div class="card member" ${ch ? `data-peek="${ch.id}"` : ''}>${ch ? heroPic(ch, 54) : '<span class="pic empty">?</span>'}<div class="grow"><b>${esc(m.name)}</b>${m.id === C.ownerId ? ' 👑' : ''}${C.dmUserId === m.id && !C.aiActive ? ' <span class="tag blue">DM</span>' : ''}<div class="small">${ch ? `${esc(ch.name)} · Lv${ch.level} ${esc(ch.class)}` : 'No hero yet'}</div>${ch ? `<div class="hpbar thin"><i style="width:${Math.max(0, ch.hp) / ch.maxHp * 100}%"></i></div>` : ''}</div><div class="center small"><i class="dot ${m.visible ? 'on' : m.online ? 'away' : ''}"></i><br>${m.push ? '🔔' : '🔕'}</div></div>`; }).join('')}
      <div class="card"><h3>⚙️ Game</h3>
        <div class="small">Pace</div><div class="chips"><button class="chip ${C.pace === 'async' ? 'on' : ''}" data-pace="async" ${C.isDM ? '' : 'disabled'}>📬 On the go</button><button class="chip ${C.pace === 'live' ? 'on' : ''}" data-pace="live" ${C.isDM ? '' : 'disabled'}>⚡ Live</button></div>
        <div class="small muted">${C.pace === 'async' ? 'Everyone takes turns whenever. Push alerts + a reminder after 12 hours.' : 'Playing together right now.'}</div>
        ${C.pace === 'live' && C.isDM ? `<div class="small" style="margin-top:8px">Turn timer</div><div class="chips">${[0, 60, 120, 300].map(s => `<button class="chip ${C.turnTimer === s ? 'on' : ''}" data-timer="${s}">${s ? s / 60 + ' min' : 'Off'}</button>`).join('')}</div>` : ''}
        <div class="small" style="margin-top:8px">Dungeon Master</div>
        <div class="row wrap">${C.aiActive ? '<span class="tag">🤖 AI is the DM</span>' : C.dmMode === 'ai' ? '<span class="tag gold wrap">🤖 AI DM is waiting for its key — the built-in adventure runs itself, and the creator has DM tools</span>' : `<span class="tag blue">🎭 ${esc((C.members.find(m => m.id === C.dmUserId) || {}).name || 'Human')} is the DM</span>`}
          ${C.isDM ? (C.aiActive ? `<button class="chip" data-dm="human">🎭 Take over</button>` : owner ? `<button class="chip" data-dm="ai" ${C.aiReady ? '' : 'disabled'}>🤖 Hand to AI${C.aiReady ? '' : ' (no key yet)'}</button>` : '') : ''}</div></div>
      ${C.isDM ? dmPanel() : ''}
      <div style="height:20px"></div></div>`;
    $('#share').onclick = share; if ($('#bPush2')) $('#bPush2').onclick = enablePush;
    $$('[data-peek]').forEach(el => el.onclick = () => { const ch = C.characters[el.dataset.peek]; const tk = C.scene && C.scene.tokens.find(t => t.charId === ch.id); if (tk && ch.ownerId !== C.me) allySheet(tk); });
    $$('[data-pace]').forEach(b => b.onclick = () => act('settings', { pace: b.dataset.pace })); $$('[data-timer]').forEach(b => b.onclick = () => act('settings', { turnTimer: +b.dataset.timer }));
    $$('[data-dm]').forEach(b => b.onclick = () => act('settings', { dmMode: b.dataset.dm }));
    bindDm(main);
  }
  function dmPanel() {
    const C = S.C; const hum = humanDM(); const heroes = Object.values(C.characters);
    return `<div class="card dm"><h3>📜 DM screen</h3>
      ${C.status === 'active' && hum ? `
        ${C.turn.phase === 'dm' ? `<div class="banner gold small"><b>You're up!</b> A player acted. Narrate the result, ask for a roll, or resolve.</div>` : ''}
        <div class="grid2"><button class="btn green" id="dNarr">📜 Narrate</button><button class="btn blue" id="dResolve" ${C.turn.phase === 'dm' ? '' : 'disabled'}>▶ Resolve</button><button class="btn gold" id="dRoll">🎲 Ask a roll</button><button class="btn red" id="dSpawn">👹 Add monster</button>
        ${inCombat() ? `<button class="btn ghost" id="dEnd">🏳️ End combat</button><button class="btn ghost" id="dAuto" ${C.turn.current?.kind === 'pc' ? '' : 'disabled'}>🤖 Auto-play hero</button>` : `<button class="btn ghost" id="dFight">⚔️ Start combat</button><button class="btn ghost" id="dRest">🌙 Long rest</button>`}
        <button class="btn ghost" id="dSkip">⏭ Skip turn</button><button class="btn ghost" id="dReward">🎁 Reward</button></div>
        <label>Send the party to…</label><div class="row"><select id="dScene">${C.scenes.map(s => `<option value="${s.key}" ${C.scene && s.key === C.scene.key ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select><button class="btn sm dark" id="dTravel">Go</button></div>
        ${heroes.some(h => h.dead) ? `<div class="row wrap">${heroes.filter(h => h.dead).map(h => `<button class="chip" data-rev="${h.id}">🌟 Revive ${esc(h.name)}</button>`).join('')}</div>` : ''}` : C.aiActive ? '<p class="small muted">The AI is running the game. Take over above any time.</p>' : ''}
      <h4>📚 Your rulebooks</h4><div class="small muted">Upload your D&D book text files — the AI DM pulls rules, monsters and lore from them.</div>
      <ul class="list">${C.library.map(b => `<li><span>${esc(b.title)} <span class="small muted">${Math.round(b.size / 1000)}k</span></span><button class="mini" data-delbook="${b.id}">✕</button></li>`).join('')}</ul>
      <input type="file" id="libF" accept=".txt,.md,text/plain" multiple>
      ${C.notes.length ? `<h4>🤖 AI's notes</h4><ul class="list small">${C.notes.slice(-10).map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>`;
  }
  function bindDm(root) {
    const C = S.C; const on = (id, fn) => { const el = $('#' + id, root); if (el) el.onclick = fn; };
    on('dNarr', () => composer('narrate')); on('dResolve', () => act('resolve', {})); on('dRoll', rollAskSheet); on('dSpawn', spawnSheet);
    on('dEnd', () => act('endcombat', {})); on('dAuto', () => act('autohero', {})); on('dFight', () => act('startcombat', {})); on('dRest', () => act('longrest', {})); on('dSkip', () => act('endturn', {})); on('dReward', rewardSheet);
    on('dTravel', () => act('travel', { scene: $('#dScene').value }));
    $$('[data-rev]', root).forEach(b => b.onclick = () => act('revive', { charId: b.dataset.rev }));
    $$('[data-delbook]', root).forEach(b => b.onclick = () => act('deletebook', { bookId: b.dataset.delbook }));
    const lf = $('#libF', root); if (lf) lf.onchange = async (e) => { for (const f of e.target.files) { try { const text = await f.text(); await api(`/c/${C.id}/library?title=${encodeURIComponent(f.name.replace(/\.(txt|md)$/i, ''))}`, text); toast('📚 Added ' + f.name); } catch (err) { toast(err.message, 'err'); } } };
  }
  function dmSheet() { sheet(dmPanel(), (m) => bindDm(m)); }
  function rollAskSheet() {
    const C = S.C; const heroes = Object.values(C.characters).filter(h => !h.dead);
    sheet(`<h2>🎲 Ask for a roll</h2><label>Who</label><select id="rrC">${heroes.map(h => `<option value="${h.id}" ${C.turn.current?.charId === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>
      <label>What</label><select id="rrS">${Object.keys(RR.SKILLS).map(k => `<option value="s:${k}">${cap(k)}</option>`).join('')}${RR.ABILITIES.map(a => `<option value="a:${a}">${RR.ABILITY_NAMES[a]}</option>`).join('')}</select>
      <label>Difficulty</label><div class="chips">${[[10, 'Easy'], [13, 'Medium'], [15, 'Hard'], [18, 'Very hard']].map(([d, l]) => `<button class="chip" data-dc="${d}">${l} (${d})</button>`).join('')}</div>`, (m) => {
      $$('[data-dc]', m).forEach(b => b.onclick = () => { const [k, n] = $('#rrS').value.split(':'); act('requestroll', { charId: $('#rrC').value, skill: k === 's' ? n : null, ability: k === 'a' ? n : null, label: (k === 's' ? cap(n) : RR.ABILITY_NAMES[n]) + ' check', dc: +b.dataset.dc }); closeSheet(); });
    });
  }
  function spawnSheet() {
    const B = RR.BESTIARY, crn = (k) => RR.crNum ? RR.crNum(B[k].cr) : 0;
    const all = Object.keys(B).sort((a, b) => crn(a) - crn(b) || B[a].name.localeCompare(B[b].name));
    const BIOMES = [['', 'All'], ['dungeon', '🏰 Dungeon'], ['cave', '🕳️ Cave'], ['forest', '🌲 Forest'], ['swamp', '🐸 Swamp'], ['mountain', '⛰️ Mountain'], ['coast', '🌊 Coast'], ['road', '🛤️ Road']];
    const st = { q: '', bio: '', max: 99 };
    const lvl = Math.max(1, ...Object.values(S.C.characters || {}).map(h => h.level || 1));
    const list = () => all.filter(k => (!st.bio || (B[k].bio || []).includes(st.bio)) && crn(k) <= st.max && (!st.q || (B[k].name + ' ' + B[k].type).toLowerCase().includes(st.q)));
    const img = (k) => { const svg = ART.monsterSVG(k, 60); return `<img loading="lazy" alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`; };
    const draw = (m) => { const l = list(); $('#mpN', m).textContent = `${l.length} monsters`; $('.monpick', m).innerHTML = l.map(k => `<button data-m="${k}">${img(k)}<b>${esc(B[k].name)}</b><span>CR ${B[k].cr}${B[k].boss ? ' · 👑' : ''}</span></button>`).join('') || '<div class="muted small">Nothing matches.</div>';
      $$('[data-m]', m).forEach(b => b.onclick = () => { S.dmSpawn = b.dataset.m; closeSheet(); S.tab = 'play'; renderTabs(); renderTab(true); toast(`Tap the map to place the ${B[b.dataset.m].name}`); }); };
    sheet(`<h2>👹 Add a monster</h2><div class="small muted">Pick one, then tap the map where it appears. <span id="mpN"></span></div>
      <input id="mpQ" placeholder="Search — dragon, undead, goblin…" autocomplete="off">
      <div class="chips" id="mpB">${BIOMES.map(([k, n]) => `<button class="chip${k === '' ? ' on' : ''}" data-b="${k}">${n}</button>`).join('')}</div>
      <div class="chips" id="mpC">${[['99', 'Any CR'], [String(Math.max(1, Math.floor(lvl / 2))), 'Easy'], [String(lvl), 'Fair fight'], [String(lvl + 3), 'Deadly']].map(([v, n], i) => `<button class="chip${i === 0 ? ' on' : ''}" data-c="${v}">${n}</button>`).join('')}</div>
      <div class="monpick"></div>`, (m) => {
      $('#mpQ', m).oninput = (e) => { st.q = e.target.value.trim().toLowerCase(); draw(m); };
      $$('[data-b]', m).forEach(b => b.onclick = () => { st.bio = b.dataset.b; $$('[data-b]', m).forEach(x => x.classList.toggle('on', x === b)); draw(m); });
      $$('[data-c]', m).forEach(b => b.onclick = () => { st.max = +b.dataset.c; $$('[data-c]', m).forEach(x => x.classList.toggle('on', x === b)); draw(m); });
      draw(m);
    });
  }
  function rewardSheet() {
    const heroes = Object.values(S.C.characters);
    sheet(`<h2>🎁 Reward</h2><label>Hero</label><select id="rwC">${heroes.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select><label>Gold</label><input id="rwG" type="number" placeholder="25"><label>XP</label><input id="rwX" type="number" placeholder="100"><label>Item</label><select id="rwI"><option value="">— none —</option>${Object.keys(RR.ITEMS).filter(k => !RR.ITEMS[k].story).map(k => `<option value="${k}">${RR.ITEMS[k].icon} ${esc(RR.ITEMS[k].name)}</option>`).join('')}</select><button class="btn gold block lg" id="rwGo">Give</button>`, () => {
      $('#rwGo').onclick = () => { act('reward', { charId: $('#rwC').value, gold: +$('#rwG').value || 0, xp: +$('#rwX').value || 0, item: $('#rwI').value || null }); closeSheet(); };
    });
  }

  // ---------------- boot ----------------
  async function start() {
    regSW();
    try { const r = await api('/me'); S.me = r.user; S.campaigns = r.campaigns; S.aiReady = r.aiReady; } catch (e) { showSplash(true); return; }
    connectWS(); const c = new URLSearchParams(location.search).get('c'); if (c) openCampaign(c); else showHome();
  }
  window.RC = S;
  if (S.token) start(); else showSplash(false);
})();
