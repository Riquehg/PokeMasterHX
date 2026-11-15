// POST /api/action  { matchId, action: { type, ... } } — jogada validada pelo motor no servidor
import { route } from './_lib/http.js';
import { actionOp } from './_lib/core.js';

export default route((db, user, body) => actionOp(db, user, body));
