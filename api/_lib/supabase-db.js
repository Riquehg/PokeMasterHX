// Adaptador de banco para produção (Supabase / Postgres). Usa a service role key — só roda no servidor.
import { createClient } from '@supabase/supabase-js';

let client = null;

// Aceita os nomes mais comuns (inclusive SUPABASE_KEY, usado pelo servidor antigo do Render)
export const SERVICE_KEY_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_KEY'];
export function serviceKey() {
  for (const n of SERVICE_KEY_NAMES) if (process.env[n]) return process.env[n].trim();
  return null;
}
export function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '') || null;
}
export function admin() {
  if (!client) {
    const url = supabaseUrl();
    const key = serviceKey();
    if (!url || !key) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente da Vercel.');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

const MATCH_COLS = 'id, code, name, host_id, status, is_public, has_pin, options, lobby, state, chat, version, created_at, updated_at';

export const supabaseDb = {
  async verifyToken(token) {
    const { data, error } = await admin().auth.getUser(token);
    if (error || !data?.user) return null;
    const u = data.user;
    return { id: u.id, email: u.email, name: u.user_metadata?.trainer_name || null };
  },

  async getProfile(id) {
    return check(await admin().from('profiles').select('*').eq('id', id).maybeSingle());
  },
  async upsertProfile(id, patch) {
    const existing = await this.getProfile(id);
    const res = existing
      ? await updateWithRevFallback(id, { ...patch, updated_at: new Date().toISOString() }, (existing.rev || 0) + 1)
      : check(await admin().from('profiles').insert({ id, ...patch }).select('*').maybeSingle());
    if (!res) throw new Error('row-level security: o perfil não pôde ser gravado');
    return res;
  },
  /** Grava só se ninguém mexeu no perfil desde a leitura (rev igual). Devolve o perfil novo ou null. */
  async updateProfileIf(id, rev, patch) {
    if (noRevColumn) return updateWithRevFallback(id, { ...patch, updated_at: new Date().toISOString() }, 0);
    const { data, error } = await admin().from('profiles')
      .update({ ...patch, rev: (rev || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', id).eq('rev', rev || 0).select('*');
    if (error && isMissingRev(error)) { noRevColumn = true; return updateWithRevFallback(id, { ...patch, updated_at: new Date().toISOString() }, 0); }
    if (error) throw new Error(error.message);
    return data?.[0] || null;
  },
  /** Soma ouro e diamantes atomicamente (null se ficaria negativo). */
  async walletAdd(id, dDiamonds, dGold) {
    const { data, error } = await admin().rpc('wallet_add', { uid: id, d_diamonds: dDiamonds | 0, d_gold: dGold | 0 });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { diamonds: row.diamonds, gold: row.gold } : null;
  },

  // ----- Mercado Global
  async insertListing(row) { return check(await admin().from('market_listings').insert(row).select('*').single()); },
  async getListing(id) { return check(await admin().from('market_listings').select('*').eq('id', id).maybeSingle()); },
  async updateListingIf(id, from, patch) {
    const { data, error } = await admin().from('market_listings').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).in('status', from).select('*');
    if (error) throw new Error(error.message);
    return data?.[0] || null;
  },
  async listListings({ status, sellerId, buyerId, sp, tier, shiny, limit = 60 } = {}) {
    let q = admin().from('market_listings').select('*').order('created_at', { ascending: false }).limit(limit);
    if (status) q = q.in('status', [].concat(status));
    if (sellerId) q = q.eq('seller_id', sellerId);
    if (buyerId) q = q.eq('buyer_id', buyerId);
    if (sp) q = q.eq('sp', sp);
    if (tier) q = q.eq('tier', tier);
    if (shiny) q = q.eq('shiny', true);
    return check(await q);
  },
  async insertOffer(row) { return check(await admin().from('market_offers').insert(row).select('*').single()); },
  async getOffer(id) { return check(await admin().from('market_offers').select('*').eq('id', id).maybeSingle()); },
  async updateOfferIf(id, from, patch) {
    const { data, error } = await admin().from('market_offers').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).in('status', from).select('*');
    if (error) throw new Error(error.message);
    return data?.[0] || null;
  },
  async listOffers({ listingId, buyerId, sellerId, status, limit = 100 } = {}) {
    let q = admin().from('market_offers').select('*').order('created_at', { ascending: false }).limit(limit);
    if (listingId) q = q.eq('listing_id', listingId);
    if (buyerId) q = q.eq('buyer_id', buyerId);
    if (sellerId) q = q.eq('seller_id', sellerId);
    if (status) q = q.in('status', [].concat(status));
    return check(await q);
  },

  async listProfiles(limit) {
    return check(await admin().from('profiles').select('id, trainer_name, avatar, points, rating, diamonds, gold, stats, pokedex, vault, is_admin, last_seen').order('points', { ascending: false }).limit(limit));
  },

  async getMatch(id) {
    if (!id) return null;
    return check(await admin().from('matches').select(MATCH_COLS).eq('id', id).maybeSingle());
  },
  async getMatchByCode(code) {
    return check(await admin().from('matches').select(MATCH_COLS).eq('code', code).in('status', ['lobby', 'playing']).maybeSingle());
  },
  async listOpenMatches() {
    return check(await admin().from('matches').select('id, code, name, host_id, status, has_pin, options, lobby, updated_at')
      .in('status', ['lobby', 'playing']).eq('is_public', true).order('updated_at', { ascending: false }).limit(40))
      .filter(r => r.status === 'lobby' || (r.options?.lateJoin && !r.options?.solo && Date.now() - new Date(r.updated_at).getTime() < 30 * 60 * 1000));
  },
  async myMatches(userId) {
    const ids = check(await admin().from('match_players').select('match_id').eq('user_id', userId)).map(r => r.match_id);
    if (!ids.length) return [];
    return check(await admin().from('matches').select('id, code, name, host_id, status, has_pin, options, lobby, updated_at')
      .in('id', ids).in('status', ['lobby', 'playing']).order('updated_at', { ascending: false }).limit(10));
  },
  async insertMatch(row) {
    return check(await admin().from('matches').insert(row).select(MATCH_COLS).single());
  },
  /** Atualização otimista: só grava se a versão ainda for a esperada. */
  async updateMatch(id, expectedVersion, patch) {
    const data = check(await admin().from('matches').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).eq('version', expectedVersion).select('id'));
    return data.length > 0;
  },

  async setSecret(matchId, pin) {
    check(await admin().from('match_secrets').upsert({ match_id: matchId, pin }));
  },
  async getSecret(matchId) {
    const r = check(await admin().from('match_secrets').select('pin').eq('match_id', matchId).maybeSingle());
    return r ? r.pin : '';
  },

  async addMember(matchId, userId) {
    check(await admin().from('match_players').upsert({ match_id: matchId, user_id: userId }));
  },
  async removeMember(matchId, userId) {
    check(await admin().from('match_players').delete().eq('match_id', matchId).eq('user_id', userId));
  },
  async listMembers(matchId) {
    return check(await admin().from('match_players').select('user_id').eq('match_id', matchId)).map(r => r.user_id);
  },

  // ---- diamantes / pagamentos
  async addDiamonds(userId, amount) {
    const { data, error } = await admin().rpc('add_diamonds', { uid: userId, amount });
    if (error) throw new Error(error.message);
    return data; // novo saldo, ou null se ficaria negativo
  },
  async insertPayment(row) {
    return check(await admin().from('payments').insert(row).select('*').single());
  },
  async getPayment(id) {
    return check(await admin().from('payments').select('*').eq('id', id).maybeSingle());
  },
  /** Atualiza só se o status atual estiver na lista (evita creditar duas vezes). */
  async updatePaymentIf(id, fromStatuses, patch) {
    const data = check(await admin().from('payments').update(patch).eq('id', id).in('status', fromStatuses).select('id'));
    return data.length > 0;
  },
  async listPayments(limit = 100, userId = null) {
    let q = admin().from('payments').select('*').order('created_at', { ascending: false }).limit(limit);
    if (userId) q = q.eq('user_id', userId);
    return check(await q);
  },

  // ---- feed global
  // ----- social
  async touchSeen(id) {
    const { error } = await admin().from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async listOnline(sinceIso, limit = 60) {
    return check(await admin().from('profiles').select('id, trainer_name, avatar, rating, points, cosmetics, last_seen')
      .gte('last_seen', sinceIso).order('last_seen', { ascending: false }).limit(limit));
  },
  async countOnline(sinceIso) {
    const { count, error } = await admin().from('profiles').select('id', { count: 'exact', head: true }).gte('last_seen', sinceIso);
    if (error) throw new Error(error.message);
    return count || 0;
  },
  async insertChat(row) { return check(await admin().from('global_chat').insert(row).select('*').single()); },
  async listChat(sinceId = 0, limit = 50) {
    return check(await admin().from('global_chat').select('*').gt('id', sinceId).order('id', { ascending: false }).limit(limit));
  },
  async lastChatOf(userId) {
    return check(await admin().from('global_chat').select('*').eq('user_id', userId).order('id', { ascending: false }).limit(1).maybeSingle());
  },
  async deleteChat(id) { check(await admin().from('global_chat').delete().eq('id', id)); },
  async searchProfiles(q, limit = 10) {
    const safe = String(q).replace(/[%_,()]/g, '');
    return check(await admin().from('profiles').select('id, trainer_name, avatar, rating, points, last_seen').ilike('trainer_name', `%${safe}%`).limit(limit));
  },
  async getProfilesByIds(ids) {
    if (!ids.length) return [];
    return check(await admin().from('profiles').select('id, trainer_name, avatar, rating, points, stats, last_seen').in('id', ids));
  },
  async listFriendships(userId) {
    return check(await admin().from('friendships').select('*').or(`user_id.eq.${userId},friend_id.eq.${userId}`));
  },
  async insertFriendship(row) { check(await admin().from('friendships').upsert(row)); },
  async updateFriendship(userId, friendId, patch) { check(await admin().from('friendships').update(patch).eq('user_id', userId).eq('friend_id', friendId)); },
  async deleteFriendship(a, b) {
    check(await admin().from('friendships').delete().eq('user_id', a).eq('friend_id', b));
    check(await admin().from('friendships').delete().eq('user_id', b).eq('friend_id', a));
  },

  async insertFeed(row) {
    check(await admin().from('global_feed').insert(row));
  },
  async listFeedKinds(kinds, limit = 15) {
    return check(await admin().from('global_feed').select('*').in('kind', kinds).order('id', { ascending: false }).limit(limit));
  },
  async listFeed(sinceId = 0, limit = 20) {
    return check(await admin().from('global_feed').select('*').gt('id', sinceId).order('id', { ascending: false }).limit(limit));
  },

  async getConfig(key) {
    const r = check(await admin().from('game_config').select('value').eq('key', key).maybeSingle());
    return r ? r.value : null;
  },
  async setConfig(key, value) {
    check(await admin().from('game_config').upsert({ key, value, updated_at: new Date().toISOString() }));
  }
};

// Se o banco ainda não tem a coluna "rev" (schema.sql antigo), grava sem ela em vez de quebrar.
let noRevColumn = false;
const isMissingRev = e => /'rev' column|column .*rev.* does not exist|profiles\.rev/i.test(e?.message || '');
async function updateWithRevFallback(id, patch, nextRev) {
  if (!noRevColumn) {
    const r = await admin().from('profiles').update({ ...patch, rev: nextRev }).eq('id', id).select('*').maybeSingle();
    if (!r.error) return r.data;
    if (!isMissingRev(r.error)) throw new Error(r.error.message);
    noRevColumn = true;
    console.warn('[db] coluna profiles.rev não existe — rode o supabase/schema.sql mais novo.');
  }
  return check(await admin().from('profiles').update(patch).eq('id', id).select('*').maybeSingle());
}

