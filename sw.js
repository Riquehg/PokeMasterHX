// Service worker do app instalável (PWA).
// - Arquivos do jogo (HTML/JS/CSS/ícones): rede primeiro, cache como reserva (sempre pega a versão nova quando online).
// - Sprites do Supabase Storage: cache primeiro (economiza dados no celular).
// - /api: nunca passa pelo cache (sempre ao vivo).
const VERSION = 'pmhx-v33';
const SPRITES = 'pmhx-sprites-2'; // nome novo = apaga o cache antigo (que podia guardar "não encontrado")
const SHELL = ['/', '/index.html', '/css/app.css', '/js/main.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/favicon.ico'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== SPRITES).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return; // sempre ao vivo
  // sprites e fontes: cache primeiro
  if (url.pathname.includes('/storage/v1/object/public/') || url.hostname.endsWith('fonts.gstatic.com') || url.hostname.endsWith('fonts.googleapis.com')) {
    e.respondWith(caches.open(SPRITES).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      // pede com CORS para saber se o arquivo existe; só guarda o que deu certo (nunca um 404)
      let res;
      try { res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); } catch { return fetch(req); }
      if (res.ok) c.put(req.url, res.clone());
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
