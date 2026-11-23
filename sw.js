/*
 * Sequoia menu service worker: keeps the last menu so it still opens on weak café Wi-Fi or offline.
 * - pages, scripts, styles: network first (always fresh when online); the saved copy is used only if the
 *   network fails or takes longer than 4 s
 * - images and fonts: saved copy first (they never change under the same name)
 * - never touches /api/, the captain screen, the setup page, other sites, or anything but GET
 * Bump VERSION to drop every saved copy.
 */
'use strict';
const VERSION = 'sq-v1';
const SHELL = ['./', 'index.html', 'assets/fonts.css', 'assets/config.js', 'assets/landing-data.js', 'assets/landing.js', 'assets/orders.js', 'assets/menu.js'];
const SKIP = /^\/(api\/|captain-|setup-|admin-)/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function save(req, res) {
  if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
  return res;
}
function networkFirst(req, key) {
  const net = fetch(req).then(res => save(key, res));
  const late = new Promise(ok => setTimeout(ok, 4000));
  const saved = () => caches.match(key, { ignoreSearch: true });
  // online and quick: the network answer; slow (> 4 s): the saved copy if there is one; offline: the saved copy
  return Promise.race([net, late.then(() => saved().then(r => r || net))])
    .catch(() => saved().then(r => r || Response.error()));
}
function cacheFirst(req) {
  return caches.match(req).then(r => r || fetch(req).then(res => save(req, res)));
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || SKIP.test(url.pathname)) return;
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, 'index.html'));
  if (/\.(webp|png|jpg|woff2)$/.test(url.pathname)) return e.respondWith(cacheFirst(req));
  if (/\.(js|css)$/.test(url.pathname)) return e.respondWith(networkFirst(req, req));
});
