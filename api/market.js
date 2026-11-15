// POST /api/market  { op: browse|mine|create|cancel|buy|offer|offer_cancel|offer_respond } — Mercado Global
import { route } from './_lib/http.js';
import { marketOp } from './_lib/market.js';

export default route((db, user, body) => marketOp(db, user, body));
