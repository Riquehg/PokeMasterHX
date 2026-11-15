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
    supabaseUrl: dev ? null : (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim() || null,
    supabaseAnonKey: dev ? null : (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim() || null,
    storageUrl: process.env.SPRITES_URL || null,
    ...info
  };
}, { auth: false, methods: ['GET'] });
