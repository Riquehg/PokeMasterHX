// GET /api/health — diagnóstico da configuração (abra no navegador: https://SEU-SITE/api/health).
// Não revela as chaves: só diz se estão presentes, de que tipo são e se o banco responde.
import { route } from './_lib/http.js';

function keyKind(k) {
  if (!k) return 'ausente';
  if (k.startsWith('sb_secret_')) return 'secret (ok)';
  if (k.startsWith('sb_publishable_')) return 'publishable (ERRADA para o servidor)';
  try {
    const payload = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString('utf8'));
    if (payload.role === 'service_role') return 'service_role (ok)';
    if (payload.role === 'anon') return 'anon (ERRADA para o servidor)';
    return `role=${payload.role}`;
  } catch {
    return 'formato desconhecido';
  }
}

export default route(async () => {
  if (globalThis.__PMHX_DB__) return { ok: true, mode: 'dev (banco em memória)' };
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_ANON_KEY;
  const out = {
    SUPABASE_URL: url ? 'ok' : 'ausente',
    SUPABASE_ANON_KEY: anon ? 'presente' : 'ausente',
    SUPABASE_SERVICE_ROLE_KEY: keyKind(service),
    tabelas: {},
    problemas: []
  };
  if (!url) out.problemas.push('Defina SUPABASE_URL na Vercel (Settings > Environment Variables) e faça Redeploy.');
  if (!anon) out.problemas.push('Defina SUPABASE_ANON_KEY (chave anon/publishable).');
  if (!service) out.problemas.push('Defina SUPABASE_SERVICE_ROLE_KEY (chave service_role/secret).');
  if (/ERRADA/.test(out.SUPABASE_SERVICE_ROLE_KEY)) out.problemas.push('SUPABASE_SERVICE_ROLE_KEY está com a chave pública. Use a "service_role" (ou "Secret key") em Supabase > Project Settings > API Keys.');

  if (url && service) {
    const { admin } = await import('./_lib/supabase-db.js');
    for (const t of ['profiles', 'matches', 'match_players', 'match_secrets', 'game_config']) {
      const { error } = await admin().from(t).select('*', { count: 'exact', head: true });
      out.tabelas[t] = error ? `ERRO: ${error.message}` : 'ok';
      if (error) out.problemas.push(`Tabela ${t}: ${error.message} — rode o supabase/schema.sql no SQL Editor.`);
    }
  }
  out.ok = out.problemas.length === 0;
  return out;
}, { auth: false, methods: ['GET'] });
