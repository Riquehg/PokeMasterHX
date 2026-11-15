// Servidor local de desenvolvimento: `npm run dev` -> http://localhost:3000
// Serve o site e as mesmas funções /api da Vercel, mas com banco EM MEMÓRIA e login de mentira
// (qualquer e-mail/senha). Bom para testar o multiplayer em duas abas sem configurar nada.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryDb } from '../api/_lib/memory-db.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const db = createMemoryDb();
globalThis.__PMHX_DB__ = db;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

const routes = {};
for (const name of ['match', 'action', 'rooms', 'profile', 'leaderboard', 'admin', 'config']) {
  routes['/api/' + name] = (await import(`../api/${name}.js`)).default;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Eventos em tempo real no dev (substitui o Supabase Realtime): /api/_events?matchId=...
  if (url.pathname === '/api/_events') {
    const id = url.searchParams.get('matchId');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': ok\n\n');
    const off = db.onMatchChange(mid => { if (mid === id) res.write(`data: ${JSON.stringify({ matchId: mid })}\n\n`); });
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { off(); clearInterval(ping); });
    return;
  }
  if (routes[url.pathname]) return routes[url.pathname](req, res);
  if (url.pathname.startsWith('/api/')) { res.writeHead(404); return res.end('{}'); }

  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  const file = join(root, path);
  if (!file.startsWith(root) || /(^|[/\\])(api|scripts|tests|supabase|node_modules)([/\\]|$)/.test(path.split(/[/\\]/)[0])) {
    res.writeHead(404); return res.end('not found');
  }
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`🎮 PokeMasterHX dev em http://localhost:${port} (banco em memória, login livre)`));
