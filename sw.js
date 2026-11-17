// Service worker do app instalável (PWA).
// - Arquivos do jogo (HTML/JS/CSS/ícones): rede primeiro, cache como reserva (sempre pega a versão nova quando online).
// - Sprites do Supabase Storage: cache primeiro (economiza dados no celular).
// - /api: nunca passa pelo cache (sempre ao vivo).
const VERSION = 'pmhx-v4';
const SHELL = ['/', '/index.html', '/css/app.css', '/js/main.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/favicon.ico'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'pmhx-sprites').map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return; // sempre ao vivo
  // sprites e fontes: cache primeiro
  if (url.pathname.includes('/storage/v1/object/public/') || url.hostname.endsWith('fonts.gstatic.com') || url.hostname.endsWith('fonts.googleapis.com')) {
    e.respondWith(caches.open('pmhx-sprites').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // arquivos do jogo: rede primeiro
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error())));
});
