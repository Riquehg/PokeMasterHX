// GET  /api/feed?since=ID — avisos globais (capturas lendárias/shiny, campeões, mercado, anúncios)
// POST /api/feed { op } — social: ping (online), chat global, amigos (mesmo endpoint: a Vercel grátis aceita só 12 funções)
import { route } from './_lib/http.js';
import { feedOp } from './_lib/shop.js';
import { socialOp } from './_lib/social.js';

export default route((db, user, body, req) => (req.method === 'GET' ? feedOp(db, body) : socialOp(db, user, body)), { auth: false, methods: ['GET', 'POST'] });
