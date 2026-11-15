// POST /api/shop  { op: catalog|buy|equip|pix_create|pix_status } — Loja de Diamantes
import { route } from './_lib/http.js';
import { shopOp } from './_lib/shop.js';

export default route((db, user, body, req) => shopOp(db, user, body, req));
