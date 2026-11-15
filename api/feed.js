// GET /api/feed?since=ID — avisos globais (capturas lendárias/shiny, campeões, anúncios)
import { route } from './_lib/http.js';
import { feedOp } from './_lib/shop.js';

export default route((db, user, body) => feedOp(db, body), { auth: false, methods: ['GET'] });
