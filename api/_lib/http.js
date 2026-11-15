// Camada HTTP compartilhada pelas funções da Vercel (/api/*) e pelo servidor de desenvolvimento.
import { HttpError } from './core.js';

let dbPromise = null;
export async function getDb() {
  if (globalThis.__PMHX_DB__) return globalThis.__PMHX_DB__; // servidor de dev injeta o banco em memória
  if (!dbPromise) dbPromise = import('./supabase-db.js').then(m => m.supabaseDb);
  return dbPromise;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

/**
 * Envolve um handler: lê o corpo, valida o token (Authorization: Bearer ...) e trata erros.
 * handler(db, user, body, req) -> objeto JSON
 */
export function route(handler, { auth = true, methods = ['POST'] } = {}) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) return send(res, 405, { error: 'Método não permitido.' });
      const db = await getDb();
      let user = null;
      const h = req.headers.authorization || req.headers.Authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : null;
      if (token) user = await db.verifyToken(token);
      if (auth && !user) return send(res, 401, { error: 'Faça login novamente.' });
      const body = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://x').searchParams) : await readBody(req);
      const out = await handler(db, user, body, req);
      send(res, 200, out);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error('[api]', e);
      send(res, 500, { error: 'Erro interno no servidor.' });
    }
  };
}
