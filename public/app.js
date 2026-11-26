/* Roll Call client */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app'), modalRoot = $('#modal');
  const RR = window.RULES;
  const S = { token: localStorage.getItem('rc_token'), me: null, campaigns: [], C: null, tab: 'story', ws: null, mode: 'action', lastLogLen: 0, cam: null, sel: null, wasMyTurn: false, view: 'splash', aiReady: false };

  // ---------- utils ----------
  async function api(path, body, method) {
    const res = await fetch('/api' + path, { method: method || (body !== undefined ? 'POST' : 'GET'), headers: Object.assign({ 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' }, S.token ? { authorization: 'Bearer ' + S.token } : {}), body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    let j = {}; try { j = await res.json(); } catch (e) { }
    if (res.status === 401) { logout(); throw new Error('Please log in'); }
    if (!res.ok) throw new Error(j.error || 'Something went wrong');
    return j;
  }
  function toast(msg, ms = 2600) { const d = document.createElement('div'); d.textContent = msg; $('#toast').appendChild(d); setTimeout(() => d.remove(), ms); }
  async function act(op, body) { try { const r = await api(`/c/${S.C.id}/${op}`, body || {}); if (r.note) toast(r.note); return r; } catch (e) { toast(e.message); throw e; } }
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };
  const fmt = (n) => (n >= 0 ? '+' : '') + n;
  const skillName = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  function modal(html, onMount) {
    modalRoot.innerHTML = `<div class="backdrop" data-close></div><div class="sheet-modal"><button class="x" data-close aria-label="Close">✕</button>${html}</div>`;
    modalRoot.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
    if (onMount) onMount(modalRoot.querySelector('.sheet-modal'));
  }
  function closeModal() { modalRoot.innerHTML = ''; }
  function logout() { localStorage.removeItem('rc_token'); S.token = null; S.me = null; if (S.ws) S.ws.close(); showSplash(true); }

  // ---------- token art (paper-cut) ----------
  function tokenSVG(look, cls, size = 84) {
    look = look || {}; const C = RR.CLASSES[cls] || {};
    const hs = look.hairStyle || 0;
    const hair = [
      `<path d="M27 37 Q30 18 50 18 Q70 18 73 37 Q62 28 50 29 Q38 28 27 37Z" fill="${look.hair}"/>`,
      `<path d="M25 40 Q26 16 50 16 Q74 16 75 40 L75 62 Q70 50 70 38 Q50 30 30 38 Q30 50 25 62Z" fill="${look.hair}"/>`,
      `<path d="M30 30 L36 14 L44 26 L50 10 L56 26 L64 14 L70 30 Q50 24 30 30Z" fill="${look.hair}"/>`,
      `<circle cx="50" cy="16" r="8" fill="${look.hair}"/><path d="M28 36 Q30 20 50 20 Q70 20 72 36 Q50 26 28 36Z" fill="${look.hair}"/>`
    ][hs % 4];
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><filter id="ds"><feDropShadow dx="1.5" dy="2" stdDeviation="0" flood-opacity=".35"/></filter><g filter="url(#ds)">
      <path d="M14 98 Q16 62 50 60 Q84 62 86 98Z" fill="${look.cloak || C.color || '#777'}"/>
      <path d="M40 62 L50 76 L60 62Z" fill="#f3e6cc" opacity=".8"/>
      <circle cx="50" cy="40" r="21" fill="${look.skin || '#e0b48a'}"/>
      <circle cx="43" cy="42" r="2.6" fill="#2b1d12"/><circle cx="57" cy="42" r="2.6" fill="#2b1d12"/>
      <path d="M44 50 Q50 54 56 50" stroke="#2b1d12" stroke-width="2.2" fill="none" stroke-linecap="round"/>${hair}
      <text x="78" y="92" font-size="22" text-anchor="middle">${C.icon || ''}</text></g></svg>`;
  }
  const imgCache = {};
  function tokenImg(look, cls) {
    const key = JSON.stringify(look) + cls; if (imgCache[key]) return imgCache[key];
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(tokenSVG(look, cls, 100).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
    imgCache[key] = img; img.onload = () => drawBoard(); return img;
  }

  // ---------- push ----------
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  async function regSW() { if (!('serviceWorker' in navigator)) return null; try { return await navigator.serviceWorker.register('/sw.js'); } catch (e) { return null; } }
  function b64ToU8(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...s].map(c => c.charCodeAt(0))); }
  async function enablePush() {
    if (isIOS && !standalone) { modal(`<h2>📲 Add to Home Screen first</h2><p>On iPhone, turn alerts only work from the home-screen app.</p><ol><li>Tap the <b>Share</b> button in Safari</li><li>Choose <b>Add to Home Screen</b></li><li>Open Roll Call from your home screen and tap <b>Turn on alerts</b> again</li></ol>`); return; }
    if (!('Notification' in window) || !('PushManager' in window)) { toast("This browser can't do push alerts"); return; }
    const perm = await Notification.requestPermission(); if (perm !== 'granted') { toast('Alerts blocked — allow notifications in settings'); return; }
    const reg = await regSW(); await navigator.serviceWorker.ready;
    const { key } = await api('/vapid');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
    await api('/push/subscribe', { sub: sub.toJSON() });
    await api('/push/test', {});
    toast('🔔 Turn alerts on!'); if (S.me) S.me.push = true; if (S.view === 'home') renderHome();
  }

  // ---------- websocket ----------
  function connectWS() {
    if (S.ws && S.ws.readyState <= 1) return;
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?token=' + S.token);
    S.ws = ws;
    ws.onopen = () => { if (S.C) ws.send(JSON.stringify({ t: 'sub', campaignId: S.C.id, visible: !document.hidden })); };
    ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.t === 'campaign' && S.C && msg.campaign.id === S.C.id) { S.C = msg.campaign; onCampaignUpdate(); } };
    ws.onclose = () => { S.ws = null; setTimeout(() => { if (S.token) connectWS(); }, 2000); };
  }
  document.addEventListener('visibilitychange', () => {
    if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ t: 'vis', visible: !document.hidden }));
    if (!document.hidden && S.view === 'home') loadHome();
  });
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.t === 'open') { const c = new URL(e.data.url, location.href).searchParams.get('c'); if (c) openCampaign(c); } });

  // ---------- splash / login ----------
  function showSplash(skipAnim) {
    S.view = 'splash';
    app.innerHTML = `<div class="splash"><div class="logo"><span>R</span><span>O</span><span>L</span><span>L</span><br><span>C</span><span>A</span><span>L</span><span>L</span></div>
      <div class="tagline">D&amp;D in your pocket. We'll ping you when it's your turn.</div>
      <div class="dice-row"><b>🎲</b><b>🗡️</b><b>🐉</b></div><div id="loginSlot"></div></div>`;
    const showLogin = () => {
      if ($('#loginSlot .login')) return;
      $('#loginSlot').innerHTML = `<div class="login paper"><h2 id="lt">Welcome, adventurer</h2>
        <label>Name</label><input id="ln" autocomplete="username" maxlength="24">
        <label>Password</label><input id="lp" type="password" autocomplete="current-password">
        <div class="row" style="margin-top:12px"><button class="btn green grow" id="bLogin">Log in</button><button class="btn ghost grow" id="bReg">New player</button></div></div>`;
      const go = async (reg) => {
        try { const r = await api(reg ? '/register' : '/login', { name: $('#ln').value, pass: $('#lp').value }); S.token = r.token; localStorage.setItem('rc_token', r.token); start(); }
        catch (e) { toast(e.message); }
      };
      $('#bLogin').onclick = () => go(false); $('#bReg').onclick = () => go(true);
      $('#lp').onkeydown = (e) => { if (e.key === 'Enter') go(false); };
    };
    if (skipAnim) showLogin(); else { setTimeout(showLogin, 2200); app.onclick = () => { app.onclick = null; showLogin(); }; }
  }

  // ---------- home ----------
  async function loadHome() {
    try { const r = await api('/me'); S.me = r.user; S.campaigns = r.campaigns; S.aiReady = r.aiReady; if (S.view === 'home') renderHome(); } catch (e) { }
  }
  async function showHome() {
    S.view = 'home'; S.C = null; if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ t: 'sub', campaignId: null }));
    history.replaceState(null, '', '/'); renderHome(); loadHome();
  }
  function renderHome() {
    const me = S.me || {};
    const pushOn = me.push && 'Notification' in window && Notification.permission === 'granted';
    app.innerHTML = `<div class="home"><div class="home-top"><h1>⚔️ Roll Call</h1><button class="btn small ghost" id="bOut">${esc(me.name || '')} · Log out</button></div>
      ${pushOn ? '' : `<div class="paper alert-banner"><div class="row"><div class="grow"><b>🔔 Get pinged on your turn</b><div class="tiny">So you can play on the go.</div></div><button class="btn dark small" id="bPush">Turn on alerts</button></div></div>`}
      ${S.campaigns.length ? S.campaigns.map((c, i) => `<div class="paper camp-card ${i % 2 ? 'tilt-r' : 'tilt-l'}" data-open="${c.id}">
        <div class="seal">${c.dmMode === 'ai' ? '🤖' : '🎭'}</div>
        <div class="grow"><h3 style="margin:0">${esc(c.name)}</h3>
          <div class="tiny muted">${c.players} player${c.players === 1 ? '' : 's'} · ${c.pace === 'live' ? 'Live' : 'Async'} · code ${c.code}</div>
          <div style="margin-top:4px">${c.status === 'lobby' ? '<span class="badge">Gathering party</span>' : c.myTurn ? '<span class="badge turn">YOUR TURN</span>' : c.dmTurn ? '<span class="badge dm">DM needed</span>' : `<span class="tiny">Waiting on ${esc(c.current)}</span>`}</div>
        </div><b style="font-size:24px">›</b></div>`).join('') : `<div class="paper center"><h2>No adventures yet</h2><p class="muted">Start a campaign and share the code with your party, or join a friend's.</p></div>`}
      </div>
      <div class="home-actions"><button class="btn green" id="bNew">＋ New campaign</button><button class="btn blue" id="bJoin">Join with code</button></div>`;
    $('#bOut').onclick = logout;
    if ($('#bPush')) $('#bPush').onclick = enablePush;
    app.querySelectorAll('[data-open]').forEach(el => el.onclick = () => openCampaign(el.dataset.open));
    $('#bNew').onclick = newCampaignModal; $('#bJoin').onclick = joinModal;
  }
  function newCampaignModal() {
    let dm = 'ai', pace = 'async';
    modal(`<h2>New campaign</h2>
      <label>Campaign name</label><input id="cn" placeholder="The Sunken Crown" maxlength="60">
      <label>Dungeon Master</label><div class="chips" id="dmc"><button class="chip on" data-v="ai">🤖 AI DM</button><button class="chip" data-v="human">🎭 I'll be DM</button></div>
      <div class="tiny muted" style="margin-top:4px">${S.aiReady ? 'You can take over from the AI (or hand back) any time.' : '⚠️ The AI DM key isn\'t set on the server yet — you\'ll run the game until it is.'}</div>
      <label>Pace</label><div class="chips" id="pc"><button class="chip on" data-v="async">📬 Async — play whenever</button><button class="chip" data-v="live">⚡ Live — all online</button></div>
      <label>Adventure idea (optional)</label><textarea id="cp" rows="3" placeholder="A haunted lighthouse town where fishermen keep vanishing…"></textarea>
      <button class="btn green block" style="margin-top:14px" id="cgo">Create</button>`, (m) => {
      m.querySelectorAll('#dmc .chip').forEach(b => b.onclick = () => { dm = b.dataset.v; m.querySelectorAll('#dmc .chip').forEach(x => x.classList.toggle('on', x === b)); });
      m.querySelectorAll('#pc .chip').forEach(b => b.onclick = () => { pace = b.dataset.v; m.querySelectorAll('#pc .chip').forEach(x => x.classList.toggle('on', x === b)); });
      $('#cgo').onclick = async () => { try { const r = await api('/campaigns', { name: $('#cn').value || 'New Campaign', dmMode: dm, pace, premise: $('#cp').value }); closeModal(); openCampaign(r.id, 'hero'); } catch (e) { toast(e.message); } };
    });
  }
  function joinModal() {
    modal(`<h2>Join a party</h2><label>Campaign code</label><input id="jc" maxlength="6" style="text-transform:uppercase;font-size:28px;text-align:center;letter-spacing:.3em" autocapitalize="characters">
      <button class="btn blue block" style="margin-top:14px" id="jgo">Join</button>`, () => {
      $('#jc').focus();
      $('#jgo').onclick = async () => { try { const r = await api('/join', { code: $('#jc').value }); closeModal(); openCampaign(r.id, 'hero'); } catch (e) { toast(e.message); } };
    });
  }

  // ---------- campaign ----------
  async function openCampaign(id, tab) {
    try {
      S.C = await api('/c/' + id); S.view = 'camp'; S.lastLogLen = 0; S.cam = null; S.sel = null;
      const mine = myChar();
      S.tab = tab || (mine ? (S.C.status === 'lobby' ? 'party' : 'story') : 'hero');
      history.replaceState(null, '', '/?c=' + id);
      renderCampShell(); connectWS();
      if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ t: 'sub', campaignId: id, visible: !document.hidden }));
      S.wasMyTurn = isMyTurn();
    } catch (e) { toast(e.message); showHome(); }
  }
  const myChar = () => S.C && Object.values(S.C.characters).find(c => c.ownerId === S.C.me);
  const isMyTurn = () => S.C && S.C.status === 'active' && S.C.turn.currentUserId === S.C.me;
  const myPendingRoll = () => { const pr = S.C && S.C.turn.pendingRoll; const mc = myChar(); return pr && mc && pr.charId === mc.id ? pr : null; };
  const dmNeeded = () => S.C.isDM && !S.C.aiActive && S.C.status === 'active' && S.C.turn.phase === 'dm';

  function onCampaignUpdate() {
    const mine = isMyTurn() || !!myPendingRoll();
    if (mine && !S.wasMyTurn) { buzz([200, 100, 200]); toast(myPendingRoll() ? `🎲 Roll ${myPendingRoll().label}!` : '⚔️ Your turn!'); }
    S.wasMyTurn = mine;
    renderHud(); renderTabs(); renderPane();
  }

  function renderCampShell() {
    app.innerHTML = `<div class="camp"><div class="hud" id="hud"></div><div class="pane" id="pane"></div><div id="below"></div><nav class="tabs" id="tabs"></nav></div>`;
    onCampaignUpdate();
  }
  function renderHud() {
    const C = S.C, t = C.turn; const el = $('#hud'); if (!el) return;
    let line;
    if (C.status === 'lobby') line = `<span class="t">Gathering the party · code ${C.code}</span>`;
    else if (myPendingRoll()) line = `<span class="t mine">🎲 Roll ${esc(myPendingRoll().label)}!</span>`;
    else if (isMyTurn()) line = `<span class="t mine">⚔️ Your turn!</span>`;
    else if (C.aiBusy) line = `<span class="t">🤖 The DM is thinking…</span>`;
    else if (t.phase === 'dm') line = `<span class="t">${dmNeeded() ? '<span style="color:#ffd36b">📜 You\'re up, DM</span>' : '📜 Waiting on the DM'}</span>`;
    else line = `<span class="t">Waiting on ${esc(t.currentName)}</span>`;
    el.innerHTML = `<button class="back" id="bBack">‹</button><div class="title"><div class="n">${esc(C.name)}${C.status === 'active' ? ` · ${t.mode === 'combat' ? '⚔️ Combat' : '🧭 Explore'} · Round ${t.round}` : ''}</div>${line}</div>
      <div class="dots">${C.members.map(m => `<span class="dot ${m.visible ? 'on' : m.online ? 'away' : ''}" title="${esc(m.name)}"></span>`).join('')}</div>`;
    $('#bBack').onclick = showHome;
  }
  function renderTabs() {
    const el = $('#tabs'); if (!el) return;
    const tabs = [['story', '📜', 'Story'], ['board', '🗺️', 'Board'], ['hero', '🧙', 'Hero'], ['town', '🏘️', 'Town'], ['party', '👥', S.C.isDM ? 'Party/DM' : 'Party']];
    const mc = myChar();
    el.innerHTML = tabs.map(([k, i, n]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}"><b>${i}</b>${n}${k === 'hero' && (!mc || mc.levelUpReady) ? '<span class="pip"></span>' : ''}${k === 'party' && dmNeeded() ? '<span class="pip"></span>' : ''}</button>`).join('');
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.lastLogLen = 0; renderTabs(); renderPane(true); });
  }
  function renderPane(force) {
    const pane = $('#pane'), below = $('#below'); if (!pane) return;
    if (S.tab !== 'story') below.innerHTML = '';
    if (S.tab === 'story') renderStory(force);
    else if (S.tab === 'board') renderBoard(force);
    else if (S.tab === 'hero') renderHero();
    else if (S.tab === 'town') renderTown();
    else renderParty();
  }

  // ---------- story ----------
  function entryHTML(e) {
    const mine = e.uid === S.C.me;
    const who = e.who ? `<span class="who">${esc(e.who)}</span>` : '';
    return `<div class="entry ${e.kind}${mine ? ' mine' : ''}">${e.kind === 'system' ? '' : who}${esc(e.text)}</div>`;
  }
  function renderStory(force) {
    const pane = $('#pane'), below = $('#below'); const C = S.C;
    let scroller = $('#logScroll');
    if (!scroller || force) {
      pane.innerHTML = `<div class="scroll" id="logScroll"><div class="log" id="log"></div><div id="think"></div></div><button class="fab" id="diceFab">🎲</button>`;
      scroller = $('#logScroll'); S.lastLogLen = 0; $('#diceFab').onclick = diceTray;
    }
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
    if (C.log.length !== S.lastLogLen || force) {
      $('#log').innerHTML = C.log.map(entryHTML).join('') || '<div class="entry system">The story starts here.</div>';
      if (nearBottom || S.lastLogLen === 0) requestAnimationFrame(() => scroller.scrollTop = scroller.scrollHeight);
      S.lastLogLen = C.log.length;
    }
    $('#think').innerHTML = C.aiBusy ? '<div class="thinking">🤖 The Dungeon Master is writing…</div>' : '';
    // composer area
    const pr = myPendingRoll(); const myTurn = isMyTurn(); const mc = myChar();
    let html = '';
    if (C.status === 'lobby') html = `<div class="rollcall paper center">${mc ? (C.ownerId === C.me ? 'Invite friends with code <b>' + C.code + '</b>, then start the adventure from the Party tab.' : 'Waiting for the creator to start the adventure…') : 'Make your hero in the Hero tab first.'}</div>`;
    else if (pr) html = `<div class="rollcall col"><button class="btn gold block" id="bRoll">🎲 Roll ${esc(pr.label)} (${pr.death ? 'd20' : 'd20' + fmt(pr.mod)})</button>${pr.death ? '' : `<div class="row"><button class="btn small ghost grow" data-adv="adv">Advantage</button><button class="btn small ghost grow" data-adv="dis">Disadvantage</button></div>`}</div>`;
    else if (mc) {
      if (myTurn && C.turn.phase === 'act') S.mode = S.modeLocked ? S.mode : 'action'; else if (S.mode === 'action') S.mode = 'chat';
      const canAct = myTurn && C.turn.phase === 'act';
      html = `<div class="mode-toggle"><button class="chip ${S.mode === 'action' ? 'on' : ''}" data-mode="action" ${canAct ? '' : 'disabled style="opacity:.4"'}>⚔️ My action</button><button class="chip ${S.mode === 'chat' ? 'on' : ''}" data-mode="chat">💬 Party chat</button>${canAct ? `<span class="grow"></span><button class="chip" id="bPass">Pass turn</button>` : ''}${C.isDM ? `<button class="chip ${S.mode === 'dm' ? 'on' : ''}" data-mode="dm">📜 Narrate</button>` : ''}</div>
        <div class="composer"><textarea id="txt" rows="1" placeholder="${S.mode === 'action' ? 'What does ' + esc(mc.name) + ' do?' : S.mode === 'dm' ? 'Narrate as the DM…' : 'Talk to the party (out of character)'}"></textarea><button class="btn ${S.mode === 'action' ? 'green' : S.mode === 'dm' ? 'blue' : 'dark'}" id="bSend">${S.mode === 'action' ? 'Do it' : 'Send'}</button></div>`;
    } else if (C.isDM) {
      S.mode = 'dm';
      html = `<div class="composer"><textarea id="txt" rows="1" placeholder="Narrate as the DM…"></textarea><button class="btn blue" id="bSend">Send</button></div>`;
    } else html = `<div class="rollcall"><button class="btn green block" id="bMake">🧙 Make your hero to play</button></div>`;
    const prevTxt = $('#txt') ? $('#txt').value : '';
    const hadFocus = document.activeElement && document.activeElement.id === 'txt';
    below.innerHTML = html;
    if ($('#txt')) {
      const ta = $('#txt'); ta.value = prevTxt; if (hadFocus) ta.focus();
      ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };
    }
    below.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { if (b.disabled) return; S.mode = b.dataset.mode; S.modeLocked = true; renderStory(); });
    if ($('#bSend')) $('#bSend').onclick = async () => {
      const text = $('#txt').value.trim(); if (!text) return;
      try {
        if (S.mode === 'action') await act('action', { text });
        else if (S.mode === 'dm') await act('narrate', { text, pass: C.turn.phase === 'dm' && confirmPass() });
        else await act('chat', { text, asDM: !mc });
        $('#txt').value = ''; S.modeLocked = false;
      } catch (e) { }
    };
    if ($('#bPass')) $('#bPass').onclick = () => act('endturn', {});
    if ($('#bRoll')) $('#bRoll').onclick = () => rollPending();
    below.querySelectorAll('[data-adv]').forEach(b => b.onclick = () => rollPending(b.dataset.adv));
    if ($('#bMake')) $('#bMake').onclick = () => { S.tab = 'hero'; renderTabs(); renderPane(); };
  }
  function confirmPass() { return S.C.turn.phase === 'dm'; }
  async function rollPending(adv) { buzz(60); try { await act('roll', { adv }); } catch (e) { } }

  function diceTray() {
    const dice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '2d6'];
    let adv = null;
    modal(`<h2>🎲 Dice</h2><div class="dice-result" id="dr">–</div><div class="tiny center muted" id="drd"></div>
      <div class="dice-grid" style="margin-top:10px">${dice.map(d => `<button class="btn ${d === 'd20' ? 'red' : 'ghost'}" data-d="${d}">${d}</button>`).join('')}</div>
      <label>Custom (e.g. 3d6+2)</label><div class="row"><input id="df" placeholder="1d20+5"><button class="btn dark" id="dgo">Roll</button></div>
      <label>What for? (optional)</label><input id="dl" placeholder="Perception">
      <div class="tiny muted" style="margin-top:10px">Rolls show up in the story for everyone.</div>`, (m) => {
      const roll = async (f) => {
        $('#dr').classList.remove('spin'); void $('#dr').offsetWidth; $('#dr').classList.add('spin'); buzz(40);
        try { const r = await act('roll', { formula: f, label: $('#dl').value }); if (r.roll) { $('#dr').textContent = r.roll.total; $('#drd').textContent = `${f}: [${r.roll.rolls.join(', ')}]${r.roll.bonus ? fmt(r.roll.bonus) : ''}`; } } catch (e) { }
      };
      m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => roll(b.dataset.d.startsWith('d') ? '1' + b.dataset.d : b.dataset.d));
      $('#dgo').onclick = () => roll($('#df').value || '1d20');
    });
  }

  // ---------- board ----------
  const TILE = 40;
  const TCOL = { '.': '#8fb35e', ',': '#d6b679', '#': '#6b5847', '~': '#4f8fc9', 'T': '#8fb35e', 'r': '#8fb35e', '+': '#8a5a2b', '=': '#c9a272', 'b': '#7a4b26', 't': '#c9a272', 'w': '#8fb35e', 'f': '#c9a272' };
  function renderBoard(force) {
    const pane = $('#pane'); const C = S.C;
    if (!$('#boardCanvas') || force) {
      pane.innerHTML = `<div class="board-wrap" id="bw"><canvas id="boardCanvas"></canvas></div><div class="board-info" id="binfo"></div><div class="board-bar" id="bbar"></div><button class="fab" id="diceFab">🎲</button>`;
      $('#diceFab').onclick = diceTray; setupBoardInput();
    }
    const mc = myChar(); const t = C.turn;
    const mt = mc && C.board.tokens.find(x => x.charId === mc.id);
    const loc = C.towns.find(x => x.id === C.location);
    $('#binfo').innerHTML = `<span class="chip">${loc ? '🏘️ ' + esc(loc.name) : '🌲 The wilds'} · ${esc(C.board.theme)}</span>${t.mode === 'combat' && isMyTurn() && mc ? `<span class="chip">👣 ${Math.floor(mc.speed / 5) - t.moved} moves · ⚔️ ${Math.max(0, (mc.features.includes('Extra Attack') ? 2 : 1) - t.attacks)} attacks</span>` : ''}${S.sel ? `<span class="chip">Tap a square to move</span>` : ''}`;
    $('#bbar').innerHTML = `${mt ? `<button class="btn small ghost" id="bFind">📍 Me</button>` : ''}${isMyTurn() && t.phase === 'act' ? `<button class="btn small green" id="bEnd">End turn</button>` : ''}`;
    if ($('#bFind')) $('#bFind').onclick = () => { centerOn(mt.x, mt.y); drawBoard(); };
    if ($('#bEnd')) $('#bEnd').onclick = () => act('endturn', {});
    if (!S.cam) { const cv = $('#boardCanvas'); const scale = Math.min(1.3, (cv.clientWidth || 360) / (C.board.w * TILE)); S.cam = { s: Math.max(.5, scale), x: 0, y: 0 }; if (mt) centerOn(mt.x, mt.y); else centerOn(C.board.w / 2, C.board.h - 4); }
    drawBoard();
  }
  function centerOn(tx, ty) { const cv = $('#boardCanvas'); if (!cv || !S.cam) return; S.cam.x = cv.clientWidth / 2 - (tx + .5) * TILE * S.cam.s; S.cam.y = cv.clientHeight / 2 - (ty + .5) * TILE * S.cam.s; }
  function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
  function drawBoard() {
    const cv = $('#boardCanvas'); if (!cv || !S.C) return; const C = S.C, B = C.board;
    const dpr = window.devicePixelRatio || 1; const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.save(); g.translate(S.cam.x, S.cam.y); g.scale(S.cam.s, S.cam.s);
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
      const ch = B.tiles[y][x]; const px = x * TILE, py = y * TILE; const r = hash(x, y);
      g.fillStyle = TCOL[ch] || '#8fb35e'; g.fillRect(px, py, TILE + .5, TILE + .5);
      g.globalAlpha = .12; g.fillStyle = r > .5 ? '#fff' : '#000'; g.fillRect(px + r * 20, py + (1 - r) * 20, 10, 6); g.globalAlpha = 1;
      if (ch === '#') { g.fillStyle = '#4a3c30'; g.fillRect(px, py + TILE - 7, TILE, 7); g.fillStyle = '#7d6956'; g.fillRect(px + 3, py + 3, TILE - 6, TILE - 12); }
      else if (ch === 'T') { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(px + 22, py + 30, 15, 8, 0, 0, 7); g.fill(); g.fillStyle = r > .5 ? '#2f6b34' : '#3b7a3a'; g.beginPath(); g.moveTo(px + 20, py + 2); g.lineTo(px + 36, py + 30); g.lineTo(px + 4, py + 30); g.fill(); g.fillStyle = '#5a3a1f'; g.fillRect(px + 17, py + 30, 6, 8); }
      else if (ch === 'r') { g.fillStyle = '#5d5d5d'; g.beginPath(); g.moveTo(px + 6, py + 32); g.lineTo(px + 12, py + 12); g.lineTo(px + 28, py + 8); g.lineTo(px + 35, py + 30); g.fill(); g.fillStyle = '#8a8a8a'; g.beginPath(); g.moveTo(px + 12, py + 14); g.lineTo(px + 27, py + 10); g.lineTo(px + 24, py + 20); g.fill(); }
      else if (ch === '~') { g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(px + 6, py + 16 + r * 8); g.quadraticCurveTo(px + 14, py + 10 + r * 8, px + 22, py + 16 + r * 8); g.stroke(); }
      else if (ch === '+') { g.fillStyle = '#5a3a1f'; g.fillRect(px + 8, py + 4, TILE - 16, TILE - 8); g.fillStyle = '#d9a62e'; g.fillRect(px + TILE - 14, py + 20, 3, 3); }
      else if (ch === '=' || ch === 't' || ch === 'f') { g.strokeStyle = 'rgba(80,50,20,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py + 13); g.lineTo(px + TILE, py + 13); g.moveTo(px, py + 27); g.lineTo(px + TILE, py + 27); g.stroke(); }
      if (ch === 't') { g.fillStyle = '#7a4b26'; g.beginPath(); g.arc(px + 20, py + 20, 13, 0, 7); g.fill(); }
      if (ch === 'b') { g.fillStyle = '#9a6538'; g.fillRect(px, py + 8, TILE, 20); }
      if (ch === 'w') { g.fillStyle = '#777'; g.beginPath(); g.arc(px + 20, py + 20, 14, 0, 7); g.fill(); g.fillStyle = '#2f5b9a'; g.beginPath(); g.arc(px + 20, py + 20, 8, 0, 7); g.fill(); }
      if (ch === 'f') { g.fillStyle = '#e0702a'; g.beginPath(); g.moveTo(px + 10, py + 34); g.lineTo(px + 20, py + 8); g.lineTo(px + 30, py + 34); g.fill(); g.fillStyle = '#ffd36b'; g.beginPath(); g.moveTo(px + 15, py + 34); g.lineTo(px + 20, py + 18); g.lineTo(px + 25, py + 34); g.fill(); }
    }
    g.strokeStyle = 'rgba(43,29,18,.13)'; g.lineWidth = 1;
    for (let x = 0; x <= B.w; x++) { g.beginPath(); g.moveTo(x * TILE, 0); g.lineTo(x * TILE, B.h * TILE); g.stroke(); }
    for (let y = 0; y <= B.h; y++) { g.beginPath(); g.moveTo(0, y * TILE); g.lineTo(B.w * TILE, y * TILE); g.stroke(); }
    // movement range
    const cur = C.turn.current; const mc = myChar();
    if (S.sel) {
      const t = B.tokens.find(x => x.id === S.sel);
      if (t) {
        let range = 99; if (C.turn.mode === 'combat' && mc && t.charId === mc.id) range = Math.floor(mc.speed / 5) - C.turn.moved;
        g.fillStyle = 'rgba(255,230,120,.28)';
        for (let y = t.y - range; y <= t.y + range; y++) for (let x = t.x - range; x <= t.x + range; x++) if (x >= 0 && y >= 0 && x < B.w && y < B.h && range < 99) g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    // tokens
    for (const t of B.tokens) {
      if (t.dead && t.kind !== 'pc') continue;
      const cx = t.x * TILE + TILE / 2, cy = t.y * TILE + TILE / 2;
      const isCur = cur && ((cur.kind === 'pc' && t.charId === cur.charId) || cur.tokenId === t.id);
      if (isCur) { g.strokeStyle = '#ffd36b'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 21, 0, 7); g.stroke(); }
      if (S.sel === t.id) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.setLineDash([5, 4]); g.beginPath(); g.arc(cx, cy, 23, 0, 7); g.stroke(); g.setLineDash([]); }
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(cx + 2, cy + 15, 15, 5, 0, 0, 7); g.fill();
      if (t.kind === 'pc') {
        const img = tokenImg(t.look, t.cls);
        g.globalAlpha = t.dead ? .35 : (t.hp <= 0 ? .6 : 1);
        if (img.complete) g.drawImage(img, cx - 19, cy - 21, 38, 38);
        g.globalAlpha = 1;
      } else {
        g.fillStyle = t.kind === 'npc' ? '#f3e6cc' : '#c9553c'; g.beginPath();
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = 16 + (i % 2 ? 2 : 0); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.fill();
        g.font = '20px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t.emoji || '👾', cx, cy + 1);
      }
      if (t.maxHp) { const w = 30; g.fillStyle = '#3a1a10'; g.fillRect(cx - w / 2, cy - 25, w, 5); g.fillStyle = t.kind === 'pc' ? '#8fd16a' : '#ff8a6b'; g.fillRect(cx - w / 2, cy - 25, w * Math.max(0, t.hp) / t.maxHp, 5); }
      if (t.kind === 'pc') { g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#2b1d12'; g.lineWidth = 3; const nm = t.name.length > 10 ? t.name.slice(0, 9) + '…' : t.name; g.strokeText(nm, cx, cy + 27); g.fillText(nm, cx, cy + 27); }
    }
    g.restore();
  }
  function setupBoardInput() {
    const cv = $('#boardCanvas'); const pts = new Map(); let start = null, moved = false, pinch = null;
    const toTile = (ex, ey) => { const r = cv.getBoundingClientRect(); return [Math.floor(((ex - r.left) - S.cam.x) / (TILE * S.cam.s)), Math.floor(((ey - r.top) - S.cam.y) / (TILE * S.cam.s))]; };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y }; moved = false; } else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: S.cam.s, cx: S.cam.x, cy: S.cam.y, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; moved = true; } });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const ns = Math.max(.4, Math.min(2.5, pinch.s * d / pinch.d)); const r = cv.getBoundingClientRect(); const mx = pinch.mx - r.left, my = pinch.my - r.top; S.cam.x = mx - (mx - pinch.cx) * ns / pinch.s; S.cam.y = my - (my - pinch.cy) * ns / pinch.s; S.cam.s = ns; drawBoard(); }
      else if (start) { const dx = e.clientX - start.x, dy = e.clientY - start.y; if (Math.hypot(dx, dy) > 8) moved = true; if (moved) { S.cam.x = start.cx + dx; S.cam.y = start.cy + dy; drawBoard(); } }
    });
    const up = (e) => { const wasTap = pts.size === 1 && !moved; pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (wasTap) onTap(...toTile(e.clientX, e.clientY)); if (!pts.size) start = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); start = null; pinch = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const ns = Math.max(.4, Math.min(2.5, S.cam.s * (e.deltaY < 0 ? 1.1 : .9))); const r = cv.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; S.cam.x = mx - (mx - S.cam.x) * ns / S.cam.s; S.cam.y = my - (my - S.cam.y) * ns / S.cam.s; S.cam.s = ns; drawBoard(); }, { passive: false });
    window.addEventListener('resize', () => drawBoard());
  }
  async function onTap(x, y) {
    const C = S.C, B = C.board; const t = B.tokens.find(k => k.x === x && k.y === y && !(k.dead && k.kind !== 'pc'));
    const mc = myChar();
    if (t) {
      if (t.kind === 'pc' && (t.charId === mc?.id || C.isDM)) { S.sel = S.sel === t.id ? null : t.id; renderBoard(); return; }
      tokenSheet(t); return;
    }
    if (S.sel) {
      const id = S.sel;
      try { await act('move', { tokenId: id, x, y }); buzz(20); } catch (e) { }
      if (C.turn.mode !== 'combat') S.sel = null; else { const mt = S.C.board.tokens.find(k => k.id === id); if (mc && mt && mt.charId === mc.id && Math.floor(mc.speed / 5) - S.C.turn.moved <= 0) S.sel = null; }
      renderBoard(); return;
    }
    if (C.isDM && S.spawn) { try { await act('spawn', { name: S.spawn, x, y }); } catch (e) { } S.spawn = null; renderBoard(); }
  }
  function tokenSheet(t) {
    const C = S.C; const mc = myChar(); const me = mc && C.board.tokens.find(k => k.charId === mc.id);
    if (t.kind === 'pc') { const ch = C.characters[t.charId]; heroPeek(ch); return; }
    const d = me ? Math.max(Math.abs(me.x - t.x), Math.abs(me.y - t.y)) : 99;
    const canAttack = mc && t.kind === 'monster' && mc.hp > 0;
    modal(`<h2>${t.emoji} ${esc(t.name)}</h2>
      <div class="kv"><div><b>${t.hp}/${t.maxHp}</b>HP</div><div><b>${t.ac}</b>AC</div><div><b>${d === 99 ? '–' : d}</b>squares away</div></div>
      ${canAttack ? `<h3 class="section">Attack</h3><div class="col">${mc.weapons.map((w, i) => { const rg = w.range || 1; const ok = d <= rg; const a = atkPreview(mc, w); return `<button class="btn ${ok ? 'red' : 'ghost'} block" data-w="${i}" ${ok ? '' : 'disabled'}>${esc(w.name)} · ${fmt(a.hit)} to hit · ${a.dmg}${ok ? '' : ` (range ${rg})`}</button>`; }).join('')}</div>
        <div class="row" style="margin-top:8px"><button class="chip" id="advT">Advantage: off</button></div>
        <div class="tiny muted" style="margin-top:6px">${C.turn.mode === 'combat' ? (isMyTurn() ? 'It\'s your turn.' : 'Wait for your turn to attack.') : 'Attacking starts combat — everyone rolls initiative.'}</div>` : ''}
      ${C.isDM ? `<h3 class="section">DM</h3><div class="row wrap"><button class="btn small ghost" data-hp="-5">−5 HP</button><button class="btn small ghost" data-hp="-1">−1</button><button class="btn small ghost" data-hp="1">+1</button><button class="btn small ghost" data-hp="5">+5 HP</button><button class="btn small dark" id="rmT">Remove</button></div>
        ${C.turn.current && C.turn.current.tokenId === t.id ? `<div class="col" style="margin-top:8px">${Object.values(C.characters).filter(c => !c.dead).map(c => `<button class="btn small red" data-mt="${c.id}">${esc(t.name)} attacks ${esc(c.name)}</button>`).join('')}<button class="btn small blue" id="autoT">Auto-play its turn</button></div>` : ''}` : ''}`, (m) => {
      let adv = null;
      if ($('#advT')) $('#advT').onclick = () => { adv = adv ? null : 'adv'; $('#advT').textContent = 'Advantage: ' + (adv ? 'on' : 'off'); $('#advT').classList.toggle('on', !!adv); };
      m.querySelectorAll('[data-w]').forEach(b => b.onclick = async () => { buzz(50); try { await act('attack', { targetId: t.id, weapon: +b.dataset.w, adv }); closeModal(); S.tab = 'story'; renderTabs(); renderPane(true); } catch (e) { } });
      m.querySelectorAll('[data-hp]').forEach(b => b.onclick = async () => { await act('hp', { tokenId: t.id, amount: +b.dataset.hp }); closeModal(); });
      if ($('#rmT')) $('#rmT').onclick = async () => { await act('removetoken', { tokenId: t.id }); closeModal(); };
      m.querySelectorAll('[data-mt]').forEach(b => b.onclick = async () => { const tt = C.board.tokens.find(k => k.charId === b.dataset.mt); await act('monsterattack', { monsterId: t.id, targetId: tt.id }); closeModal(); });
      if ($('#autoT')) $('#autoT').onclick = async () => { await act('monsterauto', {}); closeModal(); };
    });
  }
  function atkPreview(ch, w) {
    const abil = (w.ability === 'str' && !w.range && ch.scores.dex > ch.scores.str && /rapier|shortsword|dagger|scimitar/i.test(w.name)) ? 'dex' : w.ability;
    const m = RR.mod(ch.scores[abil]); const addMod = !(w.spell && !/eldritch/i.test(w.name));
    let dice = w.dice; if (w.spell && ch.level >= 5) dice = dice.replace(/^1d/, ch.level >= 17 ? '4d' : ch.level >= 11 ? '3d' : '2d');
    return { hit: m + RR.prof(ch.level), dmg: dice + (addMod && m ? fmt(m) : '') };
  }
  function heroPeek(ch) {
    if (!ch) return;
    modal(`<div class="sheet-head"><div class="portrait">${tokenSVG(ch.look, ch.class)}</div><div><h2>${esc(ch.name)}</h2><div>Level ${ch.level} ${esc(ch.race)} ${esc(ch.class)}</div><div class="tiny muted">Player: ${esc((S.C.members.find(m => m.id === ch.ownerId) || {}).name)}</div></div></div>
      <div class="hpbar"><i style="width:${Math.max(0, ch.hp) / ch.maxHp * 100}%"></i></div><div class="kv"><div><b>${ch.hp}/${ch.maxHp}</b>HP</div><div><b>${ch.ac}</b>AC</div><div><b>${ch.speed}</b>ft</div></div>
      ${ch.backstory ? `<p class="muted">${esc(ch.backstory)}</p>` : ''}
      ${S.C.isDM ? `<div class="row wrap section">${ch.dead ? `<button class="btn small gold" id="rev">Revive</button>` : ''}<button class="btn small ghost" id="rew">Give reward</button></div>` : ''}`, () => {
      if ($('#rev')) $('#rev').onclick = async () => { await act('revive', { charId: ch.id }); closeModal(); };
      if ($('#rew')) $('#rew').onclick = () => rewardModal(ch.id);
    });
  }

  // ---------- hero ----------
  function renderHero() {
    const pane = $('#pane'); const ch = myChar();
    if (!ch) { renderCreator(); return; }
    const sk = (k) => { const a = RR.SKILLS[k]; return RR.mod(ch.scores[a]) + (ch.skills.includes(k) ? RR.prof(ch.level) : 0); };
    const nextXp = RR.XP_LEVELS[ch.level] || ch.xp; const prevXp = RR.XP_LEVELS[ch.level - 1] || 0;
    const saves = RR.CLASSES[ch.class].saves;
    pane.innerHTML = `<div class="scroll"><div class="paper tilt-l">
      <div class="sheet-head"><div class="portrait" id="por">${tokenSVG(ch.look, ch.class)}</div><div class="grow"><h2 style="margin:0">${esc(ch.name)}</h2><div>Level ${ch.level} ${esc(ch.race)} ${esc(ch.class)}</div>
        <div class="hpbar"><i style="width:${Math.max(0, ch.hp) / ch.maxHp * 100}%"></i></div><div class="tiny">${ch.dead ? '☠️ Dead' : ch.hp <= 0 ? `💔 Unconscious — saves ${ch.deathSaves || 0}✔ ${ch.deathFails || 0}✖` : `HP ${ch.hp} / ${ch.maxHp}`}</div></div></div>
      <div class="kv section"><div><b>🛡️ ${ch.ac}</b>Armor</div><div><b>👣 ${ch.speed}</b>Speed</div><div><b>${fmt(RR.prof(ch.level))}</b>Proficiency</div></div>
      <div class="section"><div class="row"><span class="tiny grow">XP ${ch.xp} / ${nextXp}</span>${ch.levelUpReady ? `<button class="btn small gold" id="bLvl">⭐ Level up!</button>` : ''}</div><div class="hpbar xpbar"><i style="width:${Math.min(100, (ch.xp - prevXp) / Math.max(1, nextXp - prevXp) * 100)}%"></i></div></div>
    </div>
    <div class="stats">${RR.ABILITIES.map(a => `<button class="paper stat" data-check="${a}"><div class="k">${a.toUpperCase()}</div><div class="m">${fmt(RR.mod(ch.scores[a]))}</div><div class="s">${ch.scores[a]}${saves.includes(a) ? ' · save ★' : ''}</div></button>`).join('')}</div>
    <div class="paper tilt-r"><h3>⚔️ Attacks</h3><ul class="list">${ch.weapons.map(w => { const a = atkPreview(ch, w); return `<li><span>${esc(w.name)}${w.range ? ` <span class="tiny muted">range ${w.range}</span>` : ''}</span><b>${fmt(a.hit)} · ${a.dmg}</b></li>`; }).join('')}</ul>
      <div class="tiny muted">Attack from the Board: tap a monster.</div></div>
    ${ch.spells && ch.spells.length ? `<div class="paper section"><h3>✨ Spells ${ch.slots ? `<span class="badge">${ch.slots.max - ch.slots.used}/${ch.slots.max} slots</span>` : ''}</h3><div class="chips">${ch.spells.map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div><div class="tiny muted" style="margin-top:6px">Cast by describing it in your action, e.g. "I cast Cure Wounds on Bram".</div></div>` : ''}
    <div class="paper section"><h3>🎯 Skills <span class="tiny muted">tap to roll</span></h3><ul class="list">${Object.keys(RR.SKILLS).map(k => `<li data-skill="${k}"><span>${ch.skills.includes(k) ? '★ ' : ''}${skillName(k)} <span class="tiny muted">${RR.SKILLS[k].toUpperCase()}</span></span><b>${fmt(sk(k))}</b></li>`).join('')}</ul></div>
    <div class="paper section tilt-l"><h3>🎒 Pack <span class="badge">💰 ${ch.gold} gold</span></h3><ul class="list">${ch.inventory.map((it, i) => `<li><span>${esc(it)}</span>${/potion of healing/i.test(it) ? `<button class="btn small green" data-potion>Drink</button>` : `<button class="btn small ghost" data-drop="${i}">✕</button>`}</li>`).join('')}</ul>
      <div class="row section"><input id="newItem" placeholder="Add an item"><button class="btn small dark" id="addItem">Add</button></div></div>
    <div class="paper section"><h3>🌟 Features</h3><div class="chips">${ch.features.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div></div>
    <div class="paper section"><h3>📖 Backstory</h3><textarea id="bs" rows="3" placeholder="Where did your hero come from?">${esc(ch.backstory)}</textarea><button class="btn small ghost" style="margin-top:8px" id="saveBs">Save</button></div>
    <div style="height:90px"></div></div><button class="fab" id="diceFab">🎲</button>`;
    $('#diceFab').onclick = diceTray;
    if ($('#bLvl')) $('#bLvl').onclick = async () => { await act('levelup', {}); toast('⭐ Level up!'); buzz([100, 50, 100]); };
    pane.querySelectorAll('[data-check]').forEach(b => b.onclick = () => quickRoll(`1d20${fmt(RR.mod(ch.scores[b.dataset.check]))}`, RR.ABILITY_NAMES[b.dataset.check] + ' check'));
    pane.querySelectorAll('[data-skill]').forEach(b => b.onclick = () => quickRoll(`1d20${fmt(sk(b.dataset.skill))}`, skillName(b.dataset.skill)));
    pane.querySelectorAll('[data-potion]').forEach(b => b.onclick = () => act('usepotion', {}));
    pane.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => { const inv = ch.inventory.slice(); inv.splice(+b.dataset.drop, 1); act('character', { edit: true, inventory: inv }); });
    $('#addItem').onclick = () => { const v = $('#newItem').value.trim(); if (v) act('character', { edit: true, inventory: ch.inventory.concat([v]) }); };
    $('#saveBs').onclick = async () => { await act('character', { edit: true, backstory: $('#bs').value }); toast('Saved'); };
  }
  async function quickRoll(f, label) { buzz(40); try { const r = await act('roll', { formula: f, label }); if (r.roll) toast(`🎲 ${label}: ${r.roll.total}`); } catch (e) { } }

  function renderCreator() {
    const pane = $('#pane');
    const st = S.creator || (S.creator = { name: S.me ? S.me.name : '', race: 'Human', class: 'Fighter', method: 'array', pool: RR.STANDARD_ARRAY.slice(), assign: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, skills: [], look: { skin: '#e0b48a', hair: '#4a2c17', hairStyle: 0, cloak: null }, backstory: '' });
    const C = RR.CLASSES[st.class]; const race = RR.RACES[st.race];
    const look = Object.assign({}, st.look, { cloak: st.look.cloak || C.color });
    const SKINS = ['#f6d3b3', '#e0b48a', '#c68e5e', '#8d5a3a', '#5c3a24', '#9bc48a', '#b7a2d6', '#d97a6a'];
    const HAIRS = ['#1d140e', '#4a2c17', '#8a5a2b', '#d9a62e', '#e8e0d0', '#b5452c', '#2f5b9a', '#5a5a5a'];
    const CLOAKS = ['#b5452c', '#2f5b9a', '#4f8a3a', '#8a4fa3', '#3b3b46', '#d9a62e', '#c7782e', '#5b6f86'];
    const finalScore = (a) => st.assign[a] + (race.bonus[a] || 0);
    pane.innerHTML = `<div class="scroll"><div class="paper"><h2>🧙 Create your hero</h2>
      <div class="row"><div class="portrait">${tokenSVG(look, st.class)}</div><div class="grow"><label>Name</label><input id="hn" value="${esc(st.name)}" maxlength="30"></div></div>
      <label>Race</label><div class="pick-grid">${Object.keys(RR.RACES).map(r => `<button class="pick ${st.race === r ? 'on' : ''}" data-race="${r}">${esc(r)}<div class="tiny">${Object.entries(RR.RACES[r].bonus).map(([k, v]) => k.toUpperCase() + '+' + v).join(' ').replace('STR+1 DEX+1 CON+1 INT+1 WIS+1 CHA+1', 'All +1')}</div></button>`).join('')}</div>
      <div class="tiny muted" style="margin-top:4px">${race.traits.join(' · ')} · speed ${race.speed} ft</div>
      <label>Class</label><div class="pick-grid">${Object.keys(RR.CLASSES).map(k => `<button class="pick ${st.class === k ? 'on' : ''}" data-class="${k}"><b>${RR.CLASSES[k].icon}</b>${k}<div class="tiny">d${RR.CLASSES[k].hitDie} · ${RR.CLASSES[k].primary.toUpperCase()}</div></button>`).join('')}</div>
      <div class="tiny muted" style="margin-top:4px">${C.features.join(' · ')}${C.spells ? ' · Spells: ' + C.spells.join(', ') : ''}</div>
      <label>Ability scores</label><div class="row" style="margin-bottom:8px"><button class="chip ${st.method === 'array' ? 'on' : ''}" id="mArr">Standard set</button><button class="chip ${st.method === 'roll' ? 'on' : ''}" id="mRoll">🎲 Roll 4d6</button><button class="chip" id="mAuto">✨ Best for ${st.class}</button></div>
      ${RR.ABILITIES.map(a => `<div class="ab-row"><span>${RR.ABILITY_NAMES[a]}</span><select data-ab="${a}">${st.pool.map((v, i) => `<option value="${i}" ${st.assign[a] === v && st.pool.indexOf(st.assign[a]) === i ? 'selected' : ''}>${v}</option>`).join('')}</select><b>${finalScore(a)} (${fmt(RR.mod(finalScore(a)))})</b></div>`).join('')}
      <div class="tiny muted">Every number in the set is used once — picking a number swaps it with whichever ability had it.</div>
      <label>Skills — pick ${C.picks}</label><div class="chips">${C.skillChoices.map(k => `<button class="chip ${st.skills.includes(k) ? 'on' : ''}" data-sk="${k}">${skillName(k)}</button>`).join('')}</div>
      <label>Look</label><div class="tiny">Skin</div><div class="swatches">${SKINS.map(c => `<button class="sw ${look.skin === c ? 'on' : ''}" style="background:${c}" data-skin="${c}"></button>`).join('')}</div>
      <div class="tiny" style="margin-top:6px">Hair</div><div class="swatches">${HAIRS.map(c => `<button class="sw ${look.hair === c ? 'on' : ''}" style="background:${c}" data-hair="${c}"></button>`).join('')}<button class="chip" id="hstyle">Style ${look.hairStyle + 1}/4</button></div>
      <div class="tiny" style="margin-top:6px">Cloak</div><div class="swatches">${CLOAKS.map(c => `<button class="sw ${look.cloak === c ? 'on' : ''}" style="background:${c}" data-cloak="${c}"></button>`).join('')}</div>
      <label>Backstory (optional — the DM will use it)</label><textarea id="hb" rows="3" placeholder="Raised by smugglers, owes a debt to a dragon…">${esc(st.backstory)}</textarea>
      <button class="btn green block" style="margin-top:14px;min-height:58px;font-size:19px" id="hgo">⚔️ Join the adventure</button></div><div style="height:30px"></div></div>`;
    const keep = () => { st.name = $('#hn').value; st.backstory = $('#hb').value; };
    const rer = () => { keep(); const sc = $('#pane .scroll').scrollTop; renderCreator(); $('#pane .scroll').scrollTop = sc; };
    pane.querySelectorAll('[data-race]').forEach(b => b.onclick = () => { st.race = b.dataset.race; rer(); });
    pane.querySelectorAll('[data-class]').forEach(b => b.onclick = () => { st.class = b.dataset.class; st.skills = []; st.look.cloak = null; autoAssign(st); rer(); });
    $('#mArr').onclick = () => { st.method = 'array'; st.pool = RR.STANDARD_ARRAY.slice(); autoAssign(st); rer(); };
    $('#mRoll').onclick = () => { st.method = 'roll'; st.pool = Array.from({ length: 6 }, () => { const r = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a); return r[0] + r[1] + r[2]; }).sort((a, b) => b - a); autoAssign(st); buzz(60); rer(); };
    $('#mAuto').onclick = () => { autoAssign(st); rer(); };
    pane.querySelectorAll('[data-ab]').forEach(sel => sel.onchange = () => {
      const a = sel.dataset.ab; const v = st.pool[+sel.value]; const other = RR.ABILITIES.find(x => x !== a && st.assign[x] === v);
      if (other) st.assign[other] = st.assign[a]; st.assign[a] = v; rer();
    });
    pane.querySelectorAll('[data-sk]').forEach(b => b.onclick = () => { const k = b.dataset.sk; if (st.skills.includes(k)) st.skills = st.skills.filter(x => x !== k); else if (st.skills.length < C.picks) st.skills.push(k); else toast(`Pick ${C.picks} — tap one to remove it first`); rer(); });
    pane.querySelectorAll('[data-skin]').forEach(b => b.onclick = () => { st.look.skin = b.dataset.skin; rer(); });
    pane.querySelectorAll('[data-hair]').forEach(b => b.onclick = () => { st.look.hair = b.dataset.hair; rer(); });
    pane.querySelectorAll('[data-cloak]').forEach(b => b.onclick = () => { st.look.cloak = b.dataset.cloak; rer(); });
    $('#hstyle').onclick = () => { st.look.hairStyle = (st.look.hairStyle + 1) % 4; rer(); };
    $('#hgo').onclick = async () => {
      keep(); if (!st.name.trim()) return toast('Name your hero');
      if (st.skills.length < C.picks) return toast(`Pick ${C.picks} skills`);
      try { await act('character', { name: st.name, race: st.race, class: st.class, base: st.assign, skills: st.skills, look: Object.assign({}, st.look, { cloak: st.look.cloak || C.color }), backstory: st.backstory }); S.creator = null; toast('🧙 Hero created!'); S.tab = S.C.status === 'lobby' ? 'party' : 'story'; renderTabs(); renderPane(true); } catch (e) { }
    };
  }
  function autoAssign(st) {
    const C = RR.CLASSES[st.class]; const order = [C.primary, 'con', 'dex', 'str', 'wis', 'int', 'cha'].filter((v, i, a) => a.indexOf(v) === i);
    const pool = st.pool.slice().sort((a, b) => b - a); order.forEach((a, i) => { st.assign[a] = pool[i]; });
  }

  // ---------- town ----------
  function renderTown() {
    const pane = $('#pane'); const C = S.C; const town = C.towns.find(t => t.id === C.location); const mc = myChar();
    pane.innerHTML = `<div class="scroll">
      ${town ? `<div class="paper tilt-l"><h2>🏘️ ${esc(town.name)}</h2><p>${esc(town.desc)}</p></div>
        ${town.places && town.places.length ? `<div class="paper section"><h3>📍 Places</h3><ul class="list">${town.places.map(p => `<li><div><b>${esc(p.name)}</b> <span class="tiny muted">${esc(p.type || '')}</span><div class="tiny">${esc(p.desc || '')}</div></div></li>`).join('')}</ul></div>` : ''}
        ${town.npcs && town.npcs.length ? `<div class="paper section tilt-r"><h3>🧑‍🤝‍🧑 Folk</h3><ul class="list">${town.npcs.map(n => `<li><div><b>${esc(n.name)}</b> <span class="tiny muted">${esc(n.role || '')}</span><div class="tiny">${esc(n.desc || '')}</div></div></li>`).join('')}</ul></div>` : ''}
        <div class="paper section"><h3>🛒 Shop ${mc ? `<span class="badge">💰 ${mc.gold}</span>` : ''}</h3><ul class="list">${(town.shop || []).map((s, i) => `<li><span>${esc(s.item)}</span><button class="btn small ${mc && mc.gold >= s.price ? 'gold' : 'ghost'}" data-buy="${i}">${s.price} gp</button></li>`).join('')}</ul></div>`
        : `<div class="paper center"><h2>🌲 The wilds</h2><p class="muted">No town here. ${C.towns.length ? 'Your party knows of the places below.' : C.status === 'lobby' ? 'Towns appear once the adventure starts.' : ''}</p></div>`}
      ${C.towns.length ? `<div class="paper section alt"><h3>🗺️ Known places</h3><ul class="list">${C.towns.map(t => `<li><span>${t.id === C.location ? '📍 ' : ''}${esc(t.name)}</span>${C.isDM && t.id !== C.location ? `<button class="btn small ghost" data-travel="${t.id}">Travel</button>` : ''}</li>`).join('')}${C.isDM && C.location ? `<li><span>The wilds</span><button class="btn small ghost" data-travel="">Leave town</button></li>` : ''}</ul></div>` : ''}
      ${C.isDM ? `<div class="paper section"><h3>DM: add a town</h3><input id="tn" placeholder="Town name"><textarea id="td" rows="2" style="margin-top:6px" placeholder="What's it like?"></textarea><button class="btn small blue" style="margin-top:6px" id="tadd">Add & go there</button></div>` : ''}
      <div style="height:90px"></div></div><button class="fab" id="diceFab">🎲</button>`;
    $('#diceFab').onclick = diceTray;
    pane.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => { try { await act('buy', { townId: town.id, index: +b.dataset.buy }); toast('🛒 Bought!'); } catch (e) { } });
    pane.querySelectorAll('[data-travel]').forEach(b => b.onclick = () => act('travel', { townId: b.dataset.travel || null }));
    if ($('#tadd')) $('#tadd').onclick = () => { if ($('#tn').value.trim()) act('town', { name: $('#tn').value, desc: $('#td').value, go: true }); };
  }

  // ---------- party & DM ----------
  function renderParty() {
    const pane = $('#pane'); const C = S.C; const mc = myChar(); const owner = C.ownerId === C.me;
    const chars = Object.values(C.characters);
    const memberRows = C.members.map(m => { const ch = chars.find(c => c.ownerId === m.id); return `<li ${ch ? `data-peek="${ch.id}"` : ''}><div class="row"><span class="dot ${m.visible ? 'on' : m.online ? 'away' : ''}"></span><div><b>${esc(m.name)}</b>${m.id === C.ownerId ? ' 👑' : ''}${(C.dmUserId === m.id && !C.aiActive) ? ' 🎭 DM' : ''}${m.push ? ' 🔔' : ''}<div class="tiny">${ch ? `${esc(ch.name)} · Lv${ch.level} ${esc(ch.race)} ${esc(ch.class)} · HP ${ch.hp}/${ch.maxHp}` : 'No hero yet'}</div></div></div></li>`; }).join('');
    const order = C.turn.order.map((e, i) => `<span class="chip ${i === C.turn.index ? 'on' : ''}">${e.init != null && C.turn.mode === 'combat' ? e.init + ' · ' : ''}${esc(e.name)}</span>`).join('');
    let dmHtml = '';
    if (C.isDM) {
      const heroes = chars.filter(c => !c.dead);
      const cur = C.turn.current;
      dmHtml = `<div class="paper section alt"><h2>📜 DM screen</h2>
        <div class="row wrap">${C.aiActive ? '<span class="badge">🤖 AI is running the game</span>' : `<span class="badge dm">🎭 ${C.dmUserId === C.me ? 'You are' : 'A human is'} the DM</span>`}
          ${C.aiActive ? `<button class="btn small blue" data-dmmode="human">🎭 Take over as DM</button>` : (owner ? `<button class="btn small ghost" data-dmmode="ai" ${C.aiReady ? '' : 'disabled'}>🤖 Hand back to AI${C.aiReady ? '' : ' (no key)'}</button>` : '')}</div>
        ${C.status === 'active' && !C.aiActive ? `
          ${C.turn.phase === 'dm' ? `<div class="paper section" style="background:#ffe6a8"><b>You're up.</b> ${cur && cur.kind === 'monster' ? `It's <b>${esc(C.turn.currentName)}</b>'s turn — tap it on the Board to attack, or auto-play.` : 'Narrate what happens in the Story tab, ask for a roll, or pass to the next player.'}</div>` : ''}
          <div class="row wrap section"><button class="btn small green" id="dPass">⏭️ Next turn</button>${cur && cur.kind === 'monster' ? `<button class="btn small blue" id="dAuto">🤖 Auto-play monster</button>` : ''}</div>
          <h3 class="section">Ask for a roll</h3><div class="row"><select id="rrC">${heroes.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select><select id="rrS"><option value="">— ability —</option>${RR.ABILITIES.map(a => `<option value="a:${a}">${RR.ABILITY_NAMES[a]}</option>`).join('')}${Object.keys(RR.SKILLS).map(k => `<option value="s:${k}">${skillName(k)}</option>`).join('')}</select></div>
          <div class="row" style="margin-top:6px"><input id="rrD" type="number" placeholder="DC (optional)"><button class="btn small gold" id="rrGo">Ask</button></div>
          <h3 class="section">Monsters</h3><div class="row"><select id="spN">${Object.keys(RR.BESTIARY).map(k => `<option>${k}</option>`).join('')}</select><button class="btn small red" id="spGo">Place on board</button></div>
          <div class="row wrap" style="margin-top:6px">${C.turn.mode === 'combat' ? `<button class="btn small dark" id="cEnd">End combat</button>` : `<button class="btn small red" id="cStart">⚔️ Start combat</button>`}</div>
          <h3 class="section">Scene</h3><div class="row wrap">${['town', 'road', 'forest', 'cave', 'dungeon', 'tavern'].map(t => `<button class="chip" data-map="${t}">${t}</button>`).join('')}</div>
          <div class="row wrap" style="margin-top:8px"><button class="btn small ghost" data-rest="short">☕ Short rest</button><button class="btn small ghost" data-rest="long">🌙 Long rest</button></div>` : ''}
        <h3 class="section">📚 Rulebooks for the DM <span class="tiny muted">(your .txt files)</span></h3>
        <ul class="list">${C.library.map(b => `<li><span>${esc(b.title)} <span class="tiny muted">${Math.round(b.size / 1000)}k chars</span></span><button class="btn small ghost" data-delbook="${b.id}">✕</button></li>`).join('') || '<li class="muted tiny">None yet — upload your book text files and the AI DM will pull rules, monsters and lore from them.</li>'}</ul>
        <input type="file" id="libF" accept=".txt,.md,text/plain" multiple style="margin-top:6px">
        ${C.notes.length ? `<h3 class="section">🤖 AI's notes</h3><ul class="list">${C.notes.slice(-12).map(n => `<li class="tiny">${esc(n)}</li>`).join('')}</ul>` : ''}
      </div>`;
    }
    pane.innerHTML = `<div class="scroll">
      ${C.status === 'lobby' ? `<div class="paper center tilt-l"><h2>Gather your party</h2><div class="tiny">Share this code</div><div style="font-size:44px;letter-spacing:.2em;font-weight:900">${C.code}</div><button class="btn small ghost" id="share">📤 Share invite</button>
        ${owner ? `<button class="btn green block" style="margin-top:14px;min-height:58px;font-size:19px" id="startG" ${chars.length ? '' : 'disabled'}>📜 Start the adventure</button><div class="tiny muted">${chars.length ? chars.length + ' hero' + (chars.length > 1 ? 'es' : '') + ' ready. Friends can join later too.' : 'Make your hero first (Hero tab).'}</div>` : '<p class="muted">Waiting for the creator to start…</p>'}</div>` : `<div class="paper tilt-l"><div class="row"><div class="grow"><b>Invite code</b> <span style="font-size:22px;letter-spacing:.15em">${C.code}</span></div><button class="btn small ghost" id="share">📤 Share</button></div></div>`}
      <div class="paper section"><h3>👥 Party</h3><ul class="list">${memberRows}</ul></div>
      ${C.status === 'active' ? `<div class="paper section tilt-r"><h3>${C.turn.mode === 'combat' ? '⚔️ Initiative' : '🔁 Turn order'}</h3><div class="chips">${order}</div></div>` : ''}
      <div class="paper section"><h3>⚙️ Game settings</h3>
        <div class="tiny">Pace</div><div class="chips"><button class="chip ${C.pace === 'async' ? 'on' : ''}" data-pace="async" ${C.isDM ? '' : 'disabled'}>📬 Async</button><button class="chip ${C.pace === 'live' ? 'on' : ''}" data-pace="live" ${C.isDM ? '' : 'disabled'}>⚡ Live</button></div>
        <div class="tiny muted" style="margin-top:4px">${C.pace === 'async' ? 'Take turns whenever — you get a push alert when it\'s your turn, and a reminder after 12 hours.' : 'Everyone online together. Optional turn timer keeps things moving.'}</div>
        ${C.pace === 'live' && C.isDM ? `<div class="tiny" style="margin-top:8px">Turn timer</div><div class="chips">${[0, 60, 120, 300].map(s => `<button class="chip ${C.turnTimer === s ? 'on' : ''}" data-timer="${s}">${s ? s / 60 + ' min' : 'Off'}</button>`).join('')}</div>` : ''}
        <div class="row section"><button class="btn small ghost" id="pushB">🔔 Turn alerts on this phone</button></div></div>
      ${dmHtml}<div style="height:90px"></div></div><button class="fab" id="diceFab">🎲</button>`;
    $('#diceFab').onclick = diceTray;
    $('#share').onclick = async () => { const text = `Join my D&D party "${C.name}" on Roll Call! Code: ${C.code}`; const url = location.origin; try { if (navigator.share) await navigator.share({ title: 'Roll Call', text, url }); else { await navigator.clipboard.writeText(text + ' ' + url); toast('Copied invite'); } } catch (e) { } };
    if ($('#startG')) $('#startG').onclick = async () => { await act('start', {}); S.tab = 'story'; renderTabs(); renderPane(true); };
    pane.querySelectorAll('[data-peek]').forEach(li => li.onclick = () => heroPeek(C.characters[li.dataset.peek]));
    pane.querySelectorAll('[data-pace]').forEach(b => b.onclick = () => C.isDM && act('settings', { pace: b.dataset.pace }));
    pane.querySelectorAll('[data-timer]').forEach(b => b.onclick = () => act('settings', { turnTimer: +b.dataset.timer }));
    $('#pushB').onclick = enablePush;
    pane.querySelectorAll('[data-dmmode]').forEach(b => b.onclick = () => act('settings', { dmMode: b.dataset.dmmode }));
    if ($('#dPass')) $('#dPass').onclick = () => act('pass', {});
    if ($('#dAuto')) $('#dAuto').onclick = () => act('monsterauto', {});
    if ($('#rrGo')) $('#rrGo').onclick = () => { const v = $('#rrS').value; if (!v) return toast('Pick an ability or skill'); const [k, n] = v.split(':'); act('requestroll', { charId: $('#rrC').value, ability: k === 'a' ? n : null, skill: k === 's' ? n : null, label: k === 'a' ? RR.ABILITY_NAMES[n] + ' check' : skillName(n) + ' check', dc: $('#rrD').value }); toast('Roll requested'); };
    if ($('#spGo')) $('#spGo').onclick = () => { S.spawn = $('#spN').value; S.tab = 'board'; renderTabs(); renderPane(true); toast(`Tap a square to place the ${S.spawn}`); };
    if ($('#cStart')) $('#cStart').onclick = () => act('startcombat', {});
    if ($('#cEnd')) $('#cEnd').onclick = () => act('endcombat', {});
    pane.querySelectorAll('[data-map]').forEach(b => b.onclick = () => act('newmap', { theme: b.dataset.map }));
    pane.querySelectorAll('[data-rest]').forEach(b => b.onclick = () => act('rest', { kind: b.dataset.rest }));
    pane.querySelectorAll('[data-delbook]').forEach(b => b.onclick = () => act('deletebook', { bookId: b.dataset.delbook }));
    if ($('#libF')) $('#libF').onchange = async (e) => {
      for (const f of e.target.files) { try { const text = await f.text(); await api(`/c/${C.id}/library?title=${encodeURIComponent(f.name.replace(/\.(txt|md)$/i, ''))}`, text); toast('📚 Added ' + f.name); } catch (err) { toast(err.message); } }
    };
  }
  function rewardModal(charId) {
    modal(`<h2>Give reward</h2><label>Gold</label><input id="rg" type="number" placeholder="25"><label>XP</label><input id="rx" type="number" placeholder="100"><label>Item</label><input id="ri" placeholder="Silver dagger">
      <button class="btn gold block" style="margin-top:12px" id="rgo">Give</button>`, () => { $('#rgo').onclick = async () => { await act('reward', { charId, gold: +$('#rg').value || 0, xp: +$('#rx').value || 0, item: $('#ri').value.trim() || null }); closeModal(); }; });
  }

  // ---------- boot ----------
  async function start() {
    regSW();
    try { const r = await api('/me'); S.me = r.user; S.campaigns = r.campaigns; S.aiReady = r.aiReady; } catch (e) { showSplash(true); return; }
    connectWS();
    const c = new URLSearchParams(location.search).get('c');
    if (c) openCampaign(c); else showHome();
  }
  if (S.token) start(); else showSplash(false);
})();
