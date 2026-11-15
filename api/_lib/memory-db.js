// Adaptador em memória — usado pelo servidor de desenvolvimento (npm run dev) e pelos testes.
// Login "de mentira": o token é "dev:<email>".
import { randomUUID } from 'node:crypto';

export function createMemoryDb() {
  const profiles = new Map();
  const matches = new Map();
  const secrets = new Map();
  const members = new Map(); // matchId -> Set(userId)
  const config = new Map();
  const users = new Map(); // email -> id
  const listeners = new Set();
  const notify = id => listeners.forEach(fn => fn(id));
  const copy = v => (v == null ? v : structuredClone(v));

  return {
    onMatchChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async verifyToken(token) {
      if (!token || !token.startsWith('dev:')) return null;
      const email = token.slice(4).toLowerCase();
      if (!users.has(email)) users.set(email, randomUUID());
      return { id: users.get(email), email, name: email.split('@')[0] };
    },

    async getProfile(id) { return copy(profiles.get(id) || null); },
    async upsertProfile(id, patch) {
      const cur = profiles.get(id) || { id, trainer_name: 'Treinador', avatar: 1, is_admin: profiles.size === 0, pokedex: [], vault: [], stats: {}, points: 0 };
      const next = { ...cur, ...copy(patch), id };
      profiles.set(id, next);
      return copy(next);
    },
    async listProfiles(limit) {
      return [...profiles.values()].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, limit).map(copy);
    },

    async getMatch(id) { return copy(matches.get(id) || null); },
    async getMatchByCode(code) {
      return copy([...matches.values()].find(m => m.code === code && ['lobby', 'playing'].includes(m.status)) || null);
    },
    async listOpenMatches() {
      return [...matches.values()].filter(m => m.status === 'lobby' && m.is_public).map(copy);
    },
    async myMatches(userId) {
      return [...matches.values()].filter(m => members.get(m.id)?.has(userId) && ['lobby', 'playing'].includes(m.status)).map(copy);
    },
    async insertMatch(row) {
      const id = randomUUID();
      const r = { ...copy(row), id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      matches.set(id, r);
      notify(id);
      return copy(r);
    },
    async updateMatch(id, expectedVersion, patch) {
      const cur = matches.get(id);
      if (!cur || cur.version !== expectedVersion) return false;
      matches.set(id, { ...cur, ...copy(patch), updated_at: new Date().toISOString() });
      notify(id);
      return true;
    },
    async setSecret(id, pin) { secrets.set(id, pin); },
    async getSecret(id) { return secrets.get(id) || ''; },
    async addMember(mid, uid) { if (!members.has(mid)) members.set(mid, new Set()); members.get(mid).add(uid); },
    async removeMember(mid, uid) { members.get(mid)?.delete(uid); },
    async listMembers(mid) { return [...(members.get(mid) || [])]; },
    async getConfig(k) { return copy(config.get(k) ?? null); },
    async setConfig(k, v) { config.set(k, copy(v)); }
  };
}
