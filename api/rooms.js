// GET /api/rooms — salas públicas em espera + salas em que eu estou
import { route } from './_lib/http.js';
import { listRooms } from './_lib/core.js';

export default route((db, user) => listRooms(db, user), { methods: ['GET'] });
