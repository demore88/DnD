// Roll Call service worker: turn alerts + light offline shell
const SHELL = 'rollcall-v1';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(['/', '/style.css', '/app.js', '/rules.js', '/manifest.json', '/icons/icon-192.png']).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api') || u.pathname.startsWith('/ws')) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('/'))));
});
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data.json(); } catch (err) { d = { title: 'Roll Call', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Roll Call', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: d.tag || undefined, renotify: true,
    vibrate: [200, 100, 200, 100, 300], data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const w of list) { if ('focus' in w) { w.postMessage({ t: 'open', url }); return w.focus(); } }
    return self.clients.openWindow(url);
  }));
});
