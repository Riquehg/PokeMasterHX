// GET /api/health — diagnóstico da configuração (abra no navegador: https://SEU-SITE/api/health).
// Não revela as chaves: só diz quais variáveis existem, de que tipo são e se o banco responde.
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
  const { serviceKey, supabaseUrl, SERVICE_KEY_NAMES } = await import('./_lib/supabase-db.js');
  const url = supabaseUrl();
  const service = serviceKey();
  const anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const out = {
    ambiente_vercel: process.env.VERCEL_ENV || 'desconhecido',
    variaveis_encontradas: Object.keys(process.env).filter(k => /SUPABASE/i.test(k)).sort(),
    SUPABASE_URL: url ? 'ok' : 'ausente',
    chave_publica: anon ? 'presente' : 'ausente',
    chave_do_servidor: `${keyKind(service)}${service ? ' — lida de ' + SERVICE_KEY_NAMES.find(n => process.env[n]) : ''}`,
    tabelas: {},
    problemas: []
  };
  if (!url) out.problemas.push('Falta SUPABASE_URL.');
  if (!anon) out.problemas.push('Falta SUPABASE_ANON_KEY (chave anon / Publishable key).');
  if (!service) out.problemas.push('Falta a chave do servidor: crie SUPABASE_SERVICE_ROLE_KEY com a chave service_role (ou Secret key sb_secret_...). Marque o ambiente "Production" e faça Redeploy.');
  if (/ERRADA/.test(out.chave_do_servidor)) out.problemas.push('A chave do servidor é a pública. Use a service_role / Secret key (Supabase > Project Settings > API Keys).');
  if (anon && service && anon.trim() === service.trim()) out.problemas.push('A chave pública e a do servidor são iguais — a do servidor precisa ser a service_role/secret.');

  if (url && service && !/ERRADA/.test(out.chave_do_servidor)) {
    const { admin } = await import('./_lib/supabase-db.js');
    // Confere tabela por tabela, com as colunas que o jogo usa
    const expected = {
      profiles: 'id, trainer_name, avatar, is_admin, pokedex, vault, stats, points, rating, diamonds, cosmetics',
      matches: 'id, code, name, host_id, status, is_public, has_pin, options, lobby, state, chat, version',
      match_players: 'match_id, user_id',
      match_secrets: 'match_id, pin',
      game_config: 'key, value',
      payments: 'id, user_id, package_id, diamonds, amount, status, mp_payment_id',
      global_feed: 'id, kind, text, data'
    };
    for (const [t, cols] of Object.entries(expected)) {
      const { error } = await admin().from(t).select(cols, { head: true }).limit(1);
      out.tabelas[t] = error ? `ERRO: ${error.message}` : 'ok';
      if (error) out.problemas.push(`${t}: ${error.message} — rode o supabase/schema.sql (versão mais nova) no SQL Editor.`);
    }
    const { error: fnErr } = await admin().rpc('add_diamonds', { uid: '00000000-0000-0000-0000-000000000000', amount: 0 });
    out.funcao_add_diamonds = fnErr ? `ERRO: ${fnErr.message}` : 'ok';
    if (fnErr) out.problemas.push(`Função add_diamonds: ${fnErr.message} — rode o supabase/schema.sql.`);
  }
  out.ok = out.problemas.length === 0;
  return out;
}, { auth: false, methods: ['GET'] });
