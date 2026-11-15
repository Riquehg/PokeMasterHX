// POST /api/match  { op: create|join|get|update|add_bot|remove|options|start|leave, ... }
import { route } from './_lib/http.js';
import { matchOp } from './_lib/core.js';

export default route((db, user, body) => matchOp(db, user, body));
