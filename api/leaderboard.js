// GET /api/leaderboard — ranking (público)
import { route } from './_lib/http.js';
import { leaderboard } from './_lib/core.js';

export default route(db => leaderboard(db), { auth: false, methods: ['GET'] });
