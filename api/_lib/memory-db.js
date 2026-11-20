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
  const payments = new Map();
  const feed = [];
  const listings = new Map();
  const chat = [];
  let chatId = 0;
  const friends = [];
  const offers = new Map();
  const now = () => new Date().toISOString();
  const brief = m => { const { id, code, name, host_id, status, has_pin, options, lobby, updated_at } = copy(m); return { id, code, name, host_id, status, has_pin, options, lobby, updated_at }; };
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
      const cur = profiles.get(id) || { id, trainer_name: 'Treinador', avatar: 1, is_admin: profiles.size === 0, pokedex: [], pokedex_seen: [], vault: [], stats: {}, points: 0, rating: 1000, diamonds: 0, gold: 0, cosmetics: {}, rev: 0 };
      const next = { ...cur, ...copy(patch), id, rev: (cur.rev || 0) + 1 };
      profiles.set(id, next);
      return copy(next);
    },
    async updateProfileIf(id, rev, patch) {
      const cur = profiles.get(id);
      if (!cur || (cur.rev || 0) !== (rev || 0)) return null;
      const next = { ...cur, ...copy(patch), id, rev: (cur.rev || 0) + 1 };
      profiles.set(id, next);
      return copy(next);
    },
    async walletAdd(id, dD, dG) {
      const p = profiles.get(id);
      if (!p) return null;
      if ((p.diamonds || 0) + dD < 0 || (p.gold || 0) + dG < 0) return null;
      p.diamonds = (p.diamonds || 0) + dD;
      p.gold = (p.gold || 0) + dG;
      return { diamonds: p.diamonds, gold: p.gold };
    },
    async insertListing(row) { const r = { id: randomUUID(), status: 'open', created_at: now(), updated_at: now(), ...copy(row) }; listings.set(r.id, r); return copy(r); },
    async getListing(id) { return copy(listings.get(id) || null); },
    async updateListingIf(id, from, patch) {
      const r = listings.get(id);
      if (!r || !from.includes(r.status)) return null;
      Object.assign(r, copy(patch), { updated_at: now() });
      return copy(r);
    },
    async listListings({ status, sellerId, buyerId, sp, tier, shiny, limit = 60 } = {}) {
      const st = status ? [].concat(status) : null;
      return [...listings.values()].filter(r => (!st || st.includes(r.status)) && (!sellerId || r.seller_id === sellerId) && (!buyerId || r.buyer_id === buyerId)
        && (!sp || r.sp === sp) && (!tier || r.tier === tier) && (!shiny || r.shiny)).reverse().slice(0, limit).map(copy);
    },
    async insertOffer(row) { const r = { id: randomUUID(), status: 'pending', created_at: now(), updated_at: now(), ...copy(row) }; offers.set(r.id, r); return copy(r); },
    async getOffer(id) { return copy(offers.get(id) || null); },
    async updateOfferIf(id, from, patch) {
      const r = offers.get(id);
      if (!r || !from.includes(r.status)) return null;
      Object.assign(r, copy(patch), { updated_at: now() });
      return copy(r);
    },
    async listOffers({ listingId, buyerId, sellerId, status, limit = 100 } = {}) {
      const st = status ? [].concat(status) : null;
      return [...offers.values()].filter(r => (!listingId || r.listing_id === listingId) && (!buyerId || r.buyer_id === buyerId)
        && (!sellerId || r.seller_id === sellerId) && (!st || st.includes(r.status))).reverse().slice(0, limit).map(copy);
    },
    async touchSeen(id) { const p = profiles.get(id); if (p) p.last_seen = now(); },
    async listOnline(sinceIso, limit = 60) {
      return [...profiles.values()].filter(p => p.last_seen && p.last_seen >= sinceIso).sort((a, b) => (b.last_seen > a.last_seen ? 1 : -1)).slice(0, limit).map(copy);
    },
    async countOnline(sinceIso) { return [...profiles.values()].filter(p => p.last_seen && p.last_seen >= sinceIso).length; },
    async insertChat(row) { const r = { id: ++chatId, created_at: now(), ...copy(row) }; chat.push(r); if (chat.length > 300) chat.shift(); return copy(r); },
    async listChat(sinceId = 0, limit = 50) { return chat.filter(c => c.id > sinceId).slice(-limit).reverse().map(copy); },
    async lastChatOf(userId) { return copy([...chat].reverse().find(c => c.user_id === userId) || null); },
    async deleteChat(id) { const i = chat.findIndex(c => c.id === id); if (i >= 0) chat.splice(i, 1); },
    async searchProfiles(q, limit = 10) {
      const t = String(q).toLowerCase();
      return [...profiles.values()].filter(p => (p.trainer_name || '').toLowerCase().includes(t)).slice(0, limit).map(copy);
    },
    async getProfilesByIds(ids) { return ids.map(id => profiles.get(id)).filter(Boolean).map(copy); },
    async listFriendships(userId) { return friends.filter(f => f.user_id === userId || f.friend_id === userId).map(copy); },
    async insertFriendship(row) {
      const i = friends.findIndex(f => f.user_id === row.user_id && f.friend_id === row.friend_id);
      const r = { status: 'pending', created_at: now(), ...copy(row) };
      if (i >= 0) friends[i] = r; else friends.push(r);
    },
    async updateFriendship(a, b, patch) { const f = friends.find(x => x.user_id === a && x.friend_id === b); if (f) Object.assign(f, patch); },
    async deleteFriendship(a, b) {
      for (let i = friends.length - 1; i >= 0; i--) {
        const f = friends[i];
        if ((f.user_id === a && f.friend_id === b) || (f.user_id === b && f.friend_id === a)) friends.splice(i, 1);
      }
    },
    async listProfiles(limit) {
      return [...profiles.values()].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, limit).map(copy);
    },

    async getMatch(id) { return copy(matches.get(id) || null); },
    async getMatchByCode(code) {
      return copy([...matches.values()].find(m => m.code === code && ['lobby', 'playing'].includes(m.status)) || null);
    },
    // Mesmas colunas que o Supabase devolve nas listas (sem state/version) — assim os testes pegam o uso errado
    async listOpenMatches() {
      return [...matches.values()].filter(m => (m.status === 'lobby' || (m.status === 'playing' && m.options?.lateJoin && !m.options?.solo)) && m.is_public).map(brief);
    },
    async myMatches(userId) {
      return [...matches.values()].filter(m => members.get(m.id)?.has(userId) && ['lobby', 'playing'].includes(m.status)).map(brief);
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
    async addDiamonds(uid, amount) {
      const p = profiles.get(uid);
      if (!p) return null;
      const cur = p.diamonds || 0;
      if (cur + amount < 0) return null;
      p.diamonds = cur + amount;
      return p.diamonds;
    },
    async insertPayment(row) { const r = { id: randomUUID(), status: 'pending', created_at: new Date().toISOString(), ...copy(row) }; payments.set(r.id, r); return copy(r); },
    async getPayment(id) { return copy(payments.get(id) || null); },
    async updatePaymentIf(id, from, patch) {
      const p = payments.get(id);
      if (!p || !from.includes(p.status)) return false;
      payments.set(id, { ...p, ...copy(patch) });
      return true;
    },
    async listPayments(limit = 100, userId = null) {
      return [...payments.values()].filter(p => !userId || p.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map(copy);
    },
    async insertFeed(row) { feed.push({ id: feed.length + 1, created_at: new Date().toISOString(), data: {}, ...copy(row) }); },
    async listFeedKinds(kinds, limit = 15) { return feed.filter(f => kinds.includes(f.kind)).slice(-limit).reverse().map(copy); },
    async listFeed(since = 0, limit = 20) { return feed.filter(f => f.id > since).slice(-limit).reverse().map(copy); },
    async getConfig(k) { return copy(config.get(k) ?? null); },
    async setConfig(k, v) { config.set(k, copy(v)); }
  };
}
