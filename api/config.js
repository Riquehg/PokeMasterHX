// GET /api/config — configuração pública para o navegador (URL/anon key do Supabase + Pokémon do Dia).
// A anon key é pública por natureza; a segurança vem das políticas RLS do schema.sql.
import { route } from './_lib/http.js';
import { configInfo } from './_lib/core.js';

export default route(async db => {
  const dev = !!globalThis.__PMHX_DB__;
  let info = { dailyPokemon: null };
  try { info = await configInfo(db); } catch (e) { console.error('[config]', e.message); }
  return {
    dev,
    supabaseUrl: dev ? null : process.env.SUPABASE_URL || null,
    supabaseAnonKey: dev ? null : process.env.SUPABASE_ANON_KEY || null,
    storageUrl: process.env.SPRITES_URL || null,
    ...info
  };
}, { auth: false, methods: ['GET'] });
