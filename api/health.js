// GET /api/health — diagnóstico da configuração (abra no navegador: https://SEU-SITE/api/health).
// Não revela as chaves: só diz quais variáveis existem, de que tipo são e se o banco responde.
import { route, getDb } from './_lib/http.js';

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

const health = route(async () => {
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
      profiles: 'id, trainer_name, avatar, is_admin, pokedex, vault, stats, points, rating, diamonds, cosmetics, gold, rev, pokedex_seen, last_seen',
      matches: 'id, code, name, host_id, status, is_public, has_pin, options, lobby, state, chat, version',
      match_players: 'match_id, user_id',
      match_secrets: 'match_id, pin',
      game_config: 'key, value',
      payments: 'id, user_id, package_id, diamonds, amount, status, mp_payment_id',
      global_feed: 'id, kind, text, data',
      market_listings: 'id, seller_id, mon, sp, tier, price_gold, price_diamonds, accept_offers, status',
      market_offers: 'id, listing_id, seller_id, buyer_id, gold, diamonds, mons, status',
      global_chat: 'id, user_id, name, avatar, text',
      friendships: 'user_id, friend_id, status'
    };
    for (const [t, cols] of Object.entries(expected)) {
      const { error } = await admin().from(t).select(cols, { head: true }).limit(1);
      out.tabelas[t] = error ? `ERRO: ${error.message}` : 'ok';
      if (error) out.problemas.push(`${t}: ${error.message} — rode o supabase/schema.sql (versão mais nova) no SQL Editor.`);
    }
    const { error: fnErr } = await admin().rpc('add_diamonds', { uid: '00000000-0000-0000-0000-000000000000', amount: 0 });
    out.funcao_add_diamonds = fnErr ? `ERRO: ${fnErr.message}` : 'ok';
    if (fnErr) out.problemas.push(`Função add_diamonds: ${fnErr.message} — rode o supabase/schema.sql.`);
    const { error: wErr } = await admin().rpc('wallet_add', { uid: '00000000-0000-0000-0000-000000000000', d_diamonds: 0, d_gold: 0 });
    out.funcao_wallet_add = wErr ? `ERRO: ${wErr.message}` : 'ok';
    if (wErr) out.problemas.push(`Função wallet_add: ${wErr.message} — rode o supabase/schema.sql.`);
  }
  out.ok = out.problemas.length === 0;
  return out;
}, { auth: false, methods: ['GET'] });

// ⏰ Vercel Cron (vercel.json): GET /api/health?cron=serie no dia 1 à meia-noite de Brasília.
// A Vercel manda "Authorization: Bearer <CRON_SECRET>" — configure a variável CRON_SECRET no projeto.
export default async function handler(req, res) {
  if (!String(req.url || '').includes('cron=serie')) return health(req, res);
  const json = (code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!secret || auth !== `Bearer ${secret}`) return json(401, { error: 'Cron sem autorização (configure CRON_SECRET na Vercel).' });
  try {
    const { serieCron } = await import('./_lib/series.js');
    json(200, await serieCron(await getDb()));
  } catch (e) {
    console.error('[cron serie]', e);
    json(500, { error: String(e?.message || e) });
  }
}
