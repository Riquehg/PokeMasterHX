// Adaptador de banco para produção (Supabase / Postgres). Usa a service role key — só roda no servidor.
import { createClient } from '@supabase/supabase-js';

let client = null;
export function admin() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    if (existing) {
      return check(await admin().from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('*').single());
    }
    return check(await admin().from('profiles').insert({ id, ...patch }).select('*').single());
  },
  async listProfiles(limit) {
    return check(await admin().from('profiles').select('id, trainer_name, avatar, points, stats, pokedex, vault, is_admin').order('points', { ascending: false }).limit(limit));
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
      .eq('status', 'lobby').eq('is_public', true).order('updated_at', { ascending: false }).limit(30));
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

  async getConfig(key) {
    const r = check(await admin().from('game_config').select('value').eq('key', key).maybeSingle());
    return r ? r.value : null;
  },
  async setConfig(key, value) {
    check(await admin().from('game_config').upsert({ key, value, updated_at: new Date().toISOString() }));
  }
};
