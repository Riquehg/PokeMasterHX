// Sessões de jogo. A interface só conversa com uma "sessão":
//  - LocalSession: motor roda no navegador (hot-seat no mesmo aparelho + CPUs), salvo no localStorage.
//  - OnlineSession: cada jogada vai para /api/action (servidor valida e rola os dados) e o estado chega em tempo real.
import { createMatch, applyAction, whoMustAct } from '../shared/engine.js';
import { randomSeed } from '../shared/rules/rng.js';
import { api, watchMatch } from './api.js';
import { CUSTOM_MAPS } from '../shared/data/board.js';

const LOCAL_KEY = 'pmhx_local_v2';

class Emitter {
  constructor() { this.fns = new Set(); }
  on(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
  emit(...a) { this.fns.forEach(f => f(...a)); }
}

export class LocalSession extends Emitter {
  constructor(state) {
    super();
    this.kind = 'local';
    this.state = state;
    this.chat = [];
  }

  static create({ players, options }) {
    const mapData = String(options?.map || '').startsWith('custom:') ? CUSTOM_MAPS[options.map] || null : null;
    const state = createMatch({ mode: 'local', seed: randomSeed(), now: Date.now(), players, options, map: options?.map, mapData, rules: options?.rules });
    const s = new LocalSession(state);
    s.save();
    return s;
  }

  static load() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      const st = JSON.parse(raw);
      if (!st || st.v !== 2) return null;
      return new LocalSession(st);
    } catch { return null; }
  }

  static hasSave() {
    const s = LocalSession.load();
    return !!(s && s.state.status === 'playing');
  }

  static clear() { localStorage.removeItem(LOCAL_KEY); }

  save() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.state)); } catch (e) { console.warn('Não foi possível salvar', e); }
  }

  /** No hot-seat, quem "está jogando" é o primeiro humano que precisa agir. */
  viewerId() {
    const must = whoMustAct(this.state).map(id => this.state.players.find(p => p.id === id)).filter(p => p && !p.isBot);
    if (must.length) return must[0].id;
    const human = this.state.players.find(p => !p.isBot);
    return human ? human.id : this.state.players[0].id;
  }

  canAct(pid) {
    const p = this.state.players.find(x => x.id === pid);
    return !!p && !p.isBot;
  }

  async act(action, actorId) {
    const who = actorId || this.viewerId();
    const { state, error } = applyAction(this.state, who, action, { now: Date.now() });
    if (error) return { error };
    this.state = state;
    this.save();
    this.emit(this.state);
    return { ok: true };
  }

  async sendChat(text) {
    this.chat.push({ name: 'Você', text, at: Date.now() });
    this.emit(this.state);
  }

  close() {}
}

export class OnlineSession extends Emitter {
  constructor(match, meId) {
    super();
    this.kind = 'online';
    this.match = match;
    this.state = match.state;
    this.chat = match.chat || [];
    this.me = meId;
    this.busy = false;
    this.unwatch = watchMatch(match.id, () => this.refresh());
    this.poll = setInterval(() => this.refresh(), 8000);
    document.addEventListener('visibilitychange', this._vis = () => { if (!document.hidden) this.refresh(); });
  }

  viewerId() { return this.me; }
  canAct(pid) { return pid === this.me; }

  apply(match) {
    if (!match) return;
    if (this.match && match.version < this.match.version) return; // resposta atrasada
    const changed = !this.match || match.version !== this.match.version;
    this.match = match;
    this.state = match.state;
    this.chat = match.chat || [];
    if (changed) this.emit(this.state, match);
  }

  async refresh() {
    try {
      const { match } = await api('match', { op: 'get', matchId: this.match.id });
      this.apply(match);
    } catch (e) {
      if (e.status === 403 || e.status === 404) this.emit(null, null, e);
    }
  }

  async act(action) {
    if (this.busy) return { error: 'Aguarde a jogada anterior terminar.' };
    this.busy = true;
    try {
      const r = await api('action', { matchId: this.match.id, action });
      if (r.match) this.apply(r.match);
      return r.error ? { error: r.error } : { ok: true };
    } catch (e) {
      return { error: e.message };
    } finally {
      this.busy = false;
    }
  }

  async sendChat(text) {
    for (let i = 0; i < 2; i++) {
      try {
        const { match } = await api('match', { op: 'chat', matchId: this.match.id, text });
        this.apply(match);
        return;
      } catch (e) {
        if (e.status !== 409) throw e;
      }
    }
  }

  /** Abandona de vez (uma CPU assume) e sai da lista de partidas. */
  async leave() {
    try { await api('match', { op: 'leave', matchId: this.match.id }); } catch (e) { return { error: e.message }; }
    return { ok: true };
  }

  close() {
    this.unwatch();
    clearInterval(this.poll);
    document.removeEventListener('visibilitychange', this._vis);
  }
}
