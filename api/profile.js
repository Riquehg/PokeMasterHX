// POST /api/profile  { op: get|update, trainerName?, avatar? }
import { route } from './_lib/http.js';
import { profileOp } from './_lib/core.js';

export default route((db, user, body) => profileOp(db, user, body));
