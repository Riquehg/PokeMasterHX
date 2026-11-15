// POST /api/admin  { op: set_daily|list_users|grant_mon|set_admin|close_match } — só profiles.is_admin = true
import { route } from './_lib/http.js';
import { adminOp } from './_lib/core.js';

export default route((db, user, body) => adminOp(db, user, body));
