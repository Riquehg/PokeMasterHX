// Lógica do backend, independente de infraestrutura.
// Recebe um "db" (adaptador Supabase em produção, memória no servidor de desenvolvimento/testes).
import { createMatch, applyAction, score, MAX_PLAYERS } from '../../shared/engine.js';
import { randomSeed } from '../../shared/rules/rng.js';
import { SPECIES, STARTERS } from '../../shared/data/pokemon.js';
import { dailyPokemon } from '../../shared/daily.js';
import { equippedCosmetic, publishCaptures, getAnnouncement, getShop, cleanShop, creditPayment } from './shop.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = msg => { throw new HttpError(400, msg); };
const forbidden = msg => { throw new HttpError(403, msg || 'Sem permissão.'); };
const notFound = msg => { throw new HttpError(404, msg || 'Não encontrado.'); };

export const COLLECTION_MAX = 300;
export const START_RATING = 1000;
const BOT_NAMES = ['Brendan', 'May', 'Dawn', 'Lucas', 'Hilda', 'Nate', 'Serena', 'Calem', 'Red', 'Leaf'];

/**
 * Modos de sala:
 *  balanced   — todos começam com 1 inicial Nv.5 (justo). Pode ter CPUs.
 *  collection — cada um leva até 6 Pokémon da sua Coleção (com limite de nível opcional).
 *  ranked     — competitivo: balanceado, só humanos, limite de turnos obrigatório, vale rating (Elo).
 *  solo       — partida privada contra CPUs (salva na conta).
 */
export const MODES = ['balanced', 'collection', 'ranked', 'solo'];

function cleanName(s, fallback = 'Treinador') {
  const v = String(s || '').replace(/[<>"'`]/g, '').trim().slice(0, 20);
  return v || fallback;
}

function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)];
  return c;
}

export function publicMatch(row, userId) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    hostId: row.host_id,
    status: row.status,
    isPublic: row.is_public,
    hasPin: !!row.has_pin,
    options: row.options || {},
    lobby: row.lobby || [],
    state: row.state || null,
    chat: row.chat || [],
    version: row.version,
    updatedAt: row.updated_at,
    me: userId || null
  };
}

// ------------------------------------------------------------------ perfil
export async function getOrCreateProfile(db, user) {
  let p = await db.getProfile(user.id);
  if (!p) {
    p = await db.upsertProfile(user.id, {
      trainer_name: cleanName(user.name || (user.email || '').split('@')[0]),
      avatar: 1, pokedex: [], vault: [], stats: {}, points: 0
    });
  }
  return p;
}

export async function profileOp(db, user, body) {
  const p = await getOrCreateProfile(db, user);
  if (body.op === 'get' || !body.op) {
    let cosmetic = null;
    try { cosmetic = await equippedCosmetic(db, p); } catch { /* ok */ }
    return { profile: { ...p, cosmetic } };
  }
  if (body.op === 'update') {
    const patch = {};
    if (body.trainerName !== undefined) patch.trainer_name = cleanName(body.trainerName);
    if (body.avatar !== undefined) patch.avatar = Math.max(1, Math.min(8, Number(body.avatar) || 1));
    return { profile: await db.upsertProfile(user.id, patch) };
  }
  if (body.op === 'release') {
    // Soltar um Pokémon da Coleção (não afeta partidas em andamento)
    const vault = (p.vault || []).filter(m => m.uid !== body.uid);
    return { profile: await db.upsertProfile(user.id, { vault }) };
  }
  if (body.op === 'favorite') {
    const vault = (p.vault || []).map(m => (m.uid === body.uid ? { ...m, fav: !m.fav } : m));
    return { profile: await db.upsertProfile(user.id, { vault }) };
  }
  bad('Operação inválida.');
}

export async function leaderboard(db) {
  const rows = await db.listProfiles(100);
  const map = r => ({
    name: r.trainer_name, avatar: r.avatar, points: r.points || 0, rating: r.rating ?? START_RATING,
    ranked: r.stats?.ranked || 0, rankedWins: r.stats?.rankedWins || 0,
    pokedex: (r.pokedex || []).length, wins: r.stats?.wins || 0, champion: r.stats?.champion || 0,
    shinies: r.stats?.shinies || 0
  });
  const all = rows.map(map);
  return {
    ranking: [...all].sort((a, b) => b.points - a.points).slice(0, 50),
    competitive: all.filter(r => r.ranked > 0).sort((a, b) => b.rating - a.rating).slice(0, 50)
  };
}

// ------------------------------------------------------------------ Coleção
function collectionEntry(mon, matchId) {
  return { uid: mon.uid, sp: mon.sp, lvl: mon.lvl, shiny: !!mon.shiny, aura: mon.aura || null, nature: mon.nature || null, capTier: mon.capTier || null, from: matchId, at: new Date().toISOString() };
}

/**
 * Copia equipe + PC dos jogadores humanos para a Coleção da conta (e a Pokédex).
 * Chamado durante a partida (capturas, fim de batalha, PC, saída) e no final.
 */
export async function syncCollection(db, state, pids) {
  for (const p of state.players) {
    if (p.id.startsWith('cpu_') || (pids && !pids.includes(p.id))) continue;
    const prof = await db.getProfile(p.id);
    if (!prof) continue;
    const vault = [...(prof.vault || [])];
    const idx = new Map(vault.map((m, i) => [m.uid, i]));
    for (const mon of [...p.team, ...p.box]) {
      const e = collectionEntry(mon, state.id);
      if (idx.has(mon.uid)) {
        const old = vault[idx.get(mon.uid)];
        vault[idx.get(mon.uid)] = { ...old, sp: e.sp, lvl: Math.max(old.lvl || 1, e.lvl), shiny: e.shiny, aura: e.aura || old.aura || null, nature: old.nature || e.nature || null, capTier: old.capTier || e.capTier || null };
      } else {
        idx.set(mon.uid, vault.length);
        vault.push(e);
      }
    }
    // Limite: remove primeiro os mais fracos que não são shiny nem favoritos
    if (vault.length > COLLECTION_MAX) {
      const keep = new Set([...p.team, ...p.box].map(m => m.uid));
      const removable = vault.filter(m => !m.shiny && !m.fav && !keep.has(m.uid)).sort((a, b) => a.lvl - b.lvl);
      const drop = new Set(removable.slice(0, vault.length - COLLECTION_MAX).map(m => m.uid));
      for (let i = vault.length - 1; i >= 0; i--) if (drop.has(vault[i].uid)) vault.splice(i, 1);
    }
    const pokedex = [...new Set([...(prof.pokedex || []), ...p.caught])];
    await db.upsertProfile(p.id, { vault, pokedex, points: calcPoints(pokedex, prof.stats || {}) });
  }
}

function calcPoints(pokedex, st) {
  return pokedex.length * 10 + (st.wins || 0) * 300 + (st.champion || 0) * 500 + (st.shinies || 0) * 50 + (st.pvpWins || 0) * 25;
}

/** Quais jogadores precisam ter a Coleção sincronizada depois desta jogada? */
function playersToSync(action, prev, next) {
  if (next.status === 'finished') return null; // todos (o fim chama recordResults)
  const ids = new Set();
  for (const f of next.fx || []) {
    if ((f.k === 'capture' && f.ok) || (f.k === 'event' && f.id === 'pokemon_egg')) ids.add(f.pid);
    if (f.k === 'battle_end') (f.pids || []).forEach(id => ids.add(id));
  }
  if (['pc', 'use_item', 'leave', 'reorder'].includes(action?.type)) ids.add('__actor__');
  return ids;
}

// ------------------------------------------------------------------ salas
async function currentDaily(db) {
  const cfg = await db.getConfig('daily_pokemon');
  return dailyPokemon(cfg);
}

export async function configInfo(db) {
  let announcement = null;
  try { announcement = await getAnnouncement(db); } catch { /* sem aviso */ }
  return { dailyPokemon: await currentDaily(db), announcement };
}

export async function listRooms(db, user) {
  const rows = await db.listOpenMatches();
  const mine = user ? await db.myMatches(user.id) : [];
  const brief = r => ({
    id: r.id, code: r.code, name: r.name, status: r.status, hasPin: !!r.has_pin,
    mode: r.options?.mode || 'balanced', levelCap: r.options?.levelCap || 0, turnLimit: r.options?.turnLimit || 0,
    players: (r.lobby || []).length, maxPlayers: r.options?.maxPlayers || 4,
    host: (r.lobby || []).find(e => e.id === r.host_id)?.name || '?', updatedAt: r.updated_at
  });
  return { rooms: rows.filter(r => r.options?.mode !== 'solo').map(brief), mine: mine.map(brief) };
}

function lobbyEntry(profile, body) {
  const starter = SPECIES[body.starter] && STARTERS.includes(body.starter) ? body.starter : 'bulbasaur';
  return { id: profile.id, name: cleanName(profile.trainer_name), avatar: profile.avatar || 1, starter, teamUids: [], isBot: false, ready: false };
}

function botEntry(n) {
  return {
    id: 'cpu_' + Math.random().toString(36).slice(2, 8), name: `${BOT_NAMES[n % BOT_NAMES.length]} (CPU)`, avatar: ((n + 3) % 8) + 1,
    starter: STARTERS[Math.floor(Math.random() * STARTERS.length)], teamUids: [], isBot: true, ready: true
  };
}

function normalizeOptions(body, prev = {}) {
  const o = { ...prev };
  if (body.mode !== undefined) o.mode = MODES.includes(body.mode) ? body.mode : 'balanced';
  o.mode = o.mode || 'balanced';
  if (body.maxPlayers !== undefined) o.maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Number(body.maxPlayers) || 4));
  o.maxPlayers = o.maxPlayers || 4;
  if (body.turnLimit !== undefined) o.turnLimit = Math.max(0, Math.min(200, Number(body.turnLimit) || 0));
  o.turnLimit = o.turnLimit ?? 60;
  if (body.levelCap !== undefined) o.levelCap = Math.max(0, Math.min(60, Number(body.levelCap) || 0));
  o.levelCap = o.levelCap || 0;
  if (o.mode === 'ranked' && !o.turnLimit) o.turnLimit = 40; // competitivo sempre termina
  if (o.mode === 'solo') o.maxPlayers = Math.max(2, o.maxPlayers);
  return o;
}

export async function matchOp(db, user, body) {
  const op = body.op;
  if (op === 'create') return createRoom(db, user, body);
  if (op === 'solo') return createSolo(db, user, body);
  if (op === 'join') return joinRoom(db, user, body);
  if (op === 'get') {
    const row = await db.getMatch(body.matchId);
    if (!row) notFound('Sala não encontrada.');
    const members = await db.listMembers(row.id);
    if (!members.includes(user.id) && !(row.status === 'lobby' && row.is_public)) forbidden();
    return { match: publicMatch(row, user.id) };
  }

  const row = await db.getMatch(body.matchId);
  if (!row) notFound('Sala não encontrada.');
  const members = await db.listMembers(row.id);
  if (!members.includes(user.id)) forbidden('Você não está nesta sala.');
  const isHost = row.host_id === user.id;

  if (op === 'leave') return leaveRoom(db, user, row);
  if (op === 'chat') {
    const text = String(body.text || '').replace(/[<>]/g, '').trim().slice(0, 200);
    if (!text) bad('Mensagem vazia.');
    const prof = await getOrCreateProfile(db, user);
    const chat = [...(row.chat || []), { from: user.id, name: cleanName(prof.trainer_name), text, at: Date.now() }].slice(-60);
    return save(db, row, { chat }, user.id);
  }
  if (row.status !== 'lobby') bad('A partida já começou.');

  const lobby = [...(row.lobby || [])];
  const me = lobby.find(e => e.id === user.id);
  const mode = row.options?.mode || 'balanced';

  switch (op) {
    case 'update': {
      if (!me) bad('Você não está no lobby.');
      if (body.starter !== undefined) {
        if (!STARTERS.includes(body.starter)) bad('Inicial inválido.');
        me.starter = body.starter;
      }
      if (body.teamUids !== undefined) {
        if (mode !== 'collection') bad('Esta sala é balanceada: todos começam com um inicial.');
        const prof = await getOrCreateProfile(db, user);
        const owned = new Set((prof.vault || []).map(v => v.uid));
        const uids = [...new Set((Array.isArray(body.teamUids) ? body.teamUids : []).map(String))].slice(0, 6);
        if (uids.some(u => !owned.has(u))) bad('Algum Pokémon não está na sua Coleção.');
        me.teamUids = uids;
      }
      if (body.ready !== undefined) me.ready = !!body.ready;
      return save(db, row, { lobby }, user.id);
    }
    case 'add_bot': {
      if (!isHost) forbidden('Só o anfitrião adiciona CPUs.');
      if (mode === 'ranked') bad('Partidas competitivas são só entre humanos.');
      if (lobby.length >= (row.options?.maxPlayers || 4)) bad('Sala cheia.');
      lobby.push(botEntry(lobby.filter(e => e.isBot).length));
      return save(db, row, { lobby }, user.id);
    }
    case 'remove': {
      if (!isHost) forbidden('Só o anfitrião remove jogadores.');
      const target = lobby.find(e => e.id === body.target);
      if (!target || target.id === user.id) bad('Jogador inválido.');
      const next = lobby.filter(e => e.id !== body.target);
      if (!target.isBot) await db.removeMember(row.id, target.id);
      return save(db, row, { lobby: next }, user.id);
    }
    case 'options': {
      if (!isHost) forbidden();
      const options = normalizeOptions(body, row.options || {});
      let nextLobby = lobby;
      if (options.mode === 'ranked') nextLobby = lobby.filter(e => !e.isBot);
      if (options.mode !== 'collection') nextLobby = nextLobby.map(e => ({ ...e, teamUids: [] }));
      nextLobby = nextLobby.map(e => (e.isBot ? e : { ...e, ready: false }));
      return save(db, row, { options, lobby: nextLobby }, user.id);
    }
    case 'start':
      if (!isHost) forbidden('Só o anfitrião inicia a partida.');
      return startRoom(db, row, lobby, user.id);
    default:
      bad('Operação inválida.');
  }
}

async function startRoom(db, row, lobby, userId) {
  const options = normalizeOptions({}, row.options || {});
  const mode = options.mode;
  if (lobby.length < 2) bad('Precisa de pelo menos 2 participantes (adicione uma CPU se quiser).');
  if (mode === 'ranked' && lobby.filter(e => !e.isBot).length < 2) bad('O competitivo precisa de pelo menos 2 treinadores humanos.');
  const notReady = lobby.filter(e => !e.isBot && e.id !== row.host_id && !e.ready);
  if (notReady.length) bad(`Aguardando: ${notReady.map(e => e.name).join(', ')} marcar "Pronto".`);
  const players = [];
  for (const e of lobby) {
    const p = { id: e.id, name: e.name, avatar: e.avatar, isBot: e.isBot, starter: e.starter };
    const prof = e.isBot ? null : await db.getProfile(e.id);
    if (prof) { try { p.cosmetic = await equippedCosmetic(db, prof); } catch { /* sem cosmético */ } }
    if (mode === 'collection' && !e.isBot && e.teamUids?.length) {
      const vault = prof?.vault || [];
      p.teamMons = e.teamUids.map(u => vault.find(v => v.uid === u)).filter(Boolean)
        .map(v => ({ ...v, lvl: options.levelCap ? Math.min(options.levelCap, v.lvl) : v.lvl }));
    }
    players.push(p);
  }
  // Coleção: CPUs ficam no nível médio das equipes humanas, para não serem atropeladas
  if (mode === 'collection') {
    const lv = players.filter(p => p.teamMons?.length).flatMap(p => p.teamMons.map(m => m.lvl));
    if (lv.length) {
      const avg = Math.round(lv.reduce((a, b) => a + b, 0) / lv.length);
      players.filter(p => p.isBot).forEach(p => { p.starterLevel = Math.max(5, Math.round(avg * 0.85)); });
    }
  }
  const state = createMatch({
    id: row.id, mode: 'online', seed: randomSeed(), now: Date.now(), players,
    options: { dailyPokemon: await currentDaily(db), turnLimit: options.turnLimit || 0 }
  });
  state.roomMode = mode;
  const res = await save(db, row, { status: state.status === 'finished' ? 'finished' : 'playing', state, options }, userId);
  if (state.status === 'finished') await recordResults(db, state, options);
  return res;
}

async function createRoom(db, user, body) {
  const profile = await getOrCreateProfile(db, user);
  const name = cleanName(body.name, `Sala de ${profile.trainer_name}`).slice(0, 30);
  const options = normalizeOptions({ mode: body.mode, maxPlayers: body.maxPlayers, turnLimit: body.turnLimit ?? 60, levelCap: body.levelCap });
  if (options.mode === 'solo') options.mode = 'balanced';
  const pin = String(body.pin || '').replace(/\D/g, '').slice(0, 6);
  const row = await insertRoom(db, user, { name, options, isPublic: body.isPublic !== false, pin, lobby: [lobbyEntry(profile, body)] });
  return { match: publicMatch(row, user.id) };
}

async function insertRoom(db, user, { name, options, isPublic, pin, lobby }) {
  let row = null;
  for (let i = 0; i < 5 && !row; i++) {
    try {
      row = await db.insertMatch({
        code: roomCode(), name, host_id: user.id, status: 'lobby', is_public: isPublic,
        has_pin: !!pin, options, lobby, state: null, version: 1
      });
    } catch (e) {
      if (!String(e.message).includes('duplicate')) throw e;
    }
  }
  if (!row) throw new Error('Não foi possível gerar o código da sala.');
  if (pin) await db.setSecret(row.id, pin);
  await db.addMember(row.id, user.id);
  return row;
}

/** Partida contra CPUs que roda no servidor e salva na conta (Coleção, Pokédex). */
async function createSolo(db, user, body) {
  const profile = await getOrCreateProfile(db, user);
  const bots = Math.max(1, Math.min(5, Number(body.bots) || 1));
  const useCollection = Array.isArray(body.teamUids) && body.teamUids.length > 0;
  const options = normalizeOptions({ mode: useCollection ? 'collection' : 'balanced', maxPlayers: bots + 1, turnLimit: body.turnLimit ?? 60, levelCap: body.levelCap || 0 });
  const entry = lobbyEntry(profile, body);
  if (useCollection) {
    const owned = new Set((profile.vault || []).map(v => v.uid));
    entry.teamUids = [...new Set(body.teamUids.map(String))].filter(u => owned.has(u)).slice(0, 6);
  }
  const lobby = [entry];
  for (let i = 0; i < bots; i++) lobby.push(botEntry(i));
  const row = await insertRoom(db, user, { name: `Treino de ${profile.trainer_name}`, options: { ...options, solo: true }, isPublic: false, pin: '', lobby });
  return startRoom(db, row, lobby, user.id);
}

async function joinRoom(db, user, body) {
  const row = body.code ? await db.getMatchByCode(String(body.code).toUpperCase().trim()) : await db.getMatch(body.matchId);
  if (!row) notFound('Sala não encontrada. Confira o código.');
  const members = await db.listMembers(row.id);
  if (members.includes(user.id)) return { match: publicMatch(row, user.id) }; // reconectar
  if (row.status !== 'lobby') bad('A partida já começou.');
  if (row.options?.solo) forbidden('Esta é uma partida de treino privada.');
  if (row.has_pin) {
    const pin = await db.getSecret(row.id);
    if (String(body.pin || '') !== pin) forbidden('PIN incorreto.');
  }
  const lobby = [...(row.lobby || [])];
  if (lobby.length >= (row.options?.maxPlayers || 4)) bad('Sala cheia.');
  const profile = await getOrCreateProfile(db, user);
  lobby.push(lobbyEntry(profile, body));
  await db.addMember(row.id, user.id);
  return save(db, row, { lobby }, user.id);
}

async function leaveRoom(db, user, row) {
  if (row.status === 'playing') {
    return actionOp(db, user, { matchId: row.id, action: { type: 'leave' } });
  }
  await db.removeMember(row.id, user.id);
  if (row.status !== 'lobby') return { left: true };
  const lobby = (row.lobby || []).filter(e => e.id !== user.id);
  const humans = lobby.filter(e => !e.isBot);
  if (!humans.length) {
    await db.updateMatch(row.id, row.version, { status: 'abandoned', lobby: [], version: row.version + 1 });
    return { left: true };
  }
  const patch = { lobby };
  if (row.host_id === user.id) patch.host_id = humans[0].id;
  await save(db, row, patch, user.id);
  return { left: true };
}

async function save(db, row, patch, userId) {
  const next = { ...patch, version: row.version + 1 };
  const ok = await db.updateMatch(row.id, row.version, next);
  if (!ok) throw new HttpError(409, 'A sala mudou enquanto você agia. Tente de novo.');
  return { match: publicMatch({ ...row, ...next }, userId) };
}

// ------------------------------------------------------------------ jogadas
export async function actionOp(db, user, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await db.getMatch(body.matchId);
    if (!row) notFound('Partida não encontrada.');
    if (row.status !== 'playing' || !row.state) bad('A partida não está em andamento.');
    const members = await db.listMembers(row.id);
    if (!members.includes(user.id)) forbidden('Você não está nesta partida.');

    const { state, error } = applyAction(row.state, user.id, body.action, { now: Date.now() });
    if (error) return { error, match: publicMatch(row, user.id) };

    const finished = state.status === 'finished';
    if (finished && row.options?.mode === 'ranked') {
      const humans = state.players.filter(p => !p.id.startsWith('cpu_'));
      if (humans.length >= 2) state.ratingChanges = await eloDeltas(db, state, humans);
    }
    const patch = { state, version: row.version + 1, status: finished ? 'finished' : 'playing' };
    const ok = await db.updateMatch(row.id, row.version, patch);
    if (!ok) continue; // conflito de versão: outra jogada entrou antes — recalcula
    try { await publishCaptures(db, state, state.fx); } catch (e) { console.error('[feed]', e.message); }
    if (finished) await recordResults(db, state, row.options || {});
    else {
      const ids = playersToSync(body.action, row.state, state);
      if (ids && ids.size) {
        const list = [...ids].map(id => (id === '__actor__' ? user.id : id));
        try { await syncCollection(db, state, list); } catch (e) { console.error('[sync]', e.message); }
      }
    }
    return { match: publicMatch({ ...row, ...patch }, user.id) };
  }
  throw new HttpError(409, 'Muitas jogadas ao mesmo tempo. Tente de novo.');
}

/** Fim de partida online: Coleção + Pokédex + estatísticas + pontos + rating (competitivo). */
export async function recordResults(db, state, options = {}) {
  await syncCollection(db, state, null);
  const humans = state.players.filter(p => !p.id.startsWith('cpu_'));
  const ranked = options.mode === 'ranked' && humans.length >= 2;
  const deltas = ranked ? (state.ratingChanges || await eloDeltas(db, state, humans)) : {};
  for (const p of humans) {
    const prof = await db.getProfile(p.id);
    if (!prof) continue;
    const st = { ...(prof.stats || {}) };
    st.matches = (st.matches || 0) + 1;
    st.wins = (st.wins || 0) + (state.winner === p.id ? 1 : 0);
    st.champion = (st.champion || 0) + (p.champion ? 1 : 0);
    st.captures = (st.captures || 0) + p.stats.captures;
    st.shinies = (st.shinies || 0) + p.stats.shinies;
    st.pvpWins = (st.pvpWins || 0) + p.stats.pvpWins;
    st.bestScore = Math.max(st.bestScore || 0, score(p));
    const patch = { stats: st, points: calcPoints(prof.pokedex || [], st) };
    if (p.champion && db.insertFeed) {
      try { await db.insertFeed({ kind: 'champion', text: `👑 ${p.name} venceu a Liga e se tornou Campeão!`, data: { name: p.name, avatar: p.avatar } }); } catch { /* ok */ }
    }
    if (ranked) {
      st.ranked = (st.ranked || 0) + 1;
      st.rankedWins = (st.rankedWins || 0) + (state.winner === p.id ? 1 : 0);
      patch.rating = Math.max(100, (prof.rating ?? START_RATING) + (deltas[p.id] || 0));
    }
    await db.upsertProfile(p.id, patch);
  }
}

/** Elo multijogador: cada par de jogadores é um "duelo" decidido pela colocação final. */
export async function eloDeltas(db, state, humans) {
  const ratings = {};
  for (const p of humans) ratings[p.id] = (await db.getProfile(p.id))?.rating ?? START_RATING;
  const order = [...humans].sort((a, b) => (b.id === state.winner) - (a.id === state.winner) || score(b) - score(a));
  const place = Object.fromEntries(order.map((p, i) => [p.id, i]));
  const K = 32 / Math.max(1, humans.length - 1);
  const d = {};
  for (const a of humans) {
    let sum = 0;
    for (const b of humans) {
      if (a.id === b.id) continue;
      const exp = 1 / (1 + 10 ** ((ratings[b.id] - ratings[a.id]) / 400));
      const res = place[a.id] < place[b.id] ? 1 : place[a.id] > place[b.id] ? 0 : 0.5;
      sum += K * (res - exp);
    }
    d[a.id] = Math.round(sum);
  }
  return d;
}

// ------------------------------------------------------------------ admin
export async function adminOp(db, user, body) {
  const me = await getOrCreateProfile(db, user);
  if (!me.is_admin) forbidden('Apenas administradores.');
  switch (body.op) {
    case 'set_daily': {
      if (body.species && !SPECIES[body.species]) bad('Espécie inválida.');
      await db.setConfig('daily_pokemon', body.species ? { species: body.species, date: body.date || null } : null);
      return { ok: true, dailyPokemon: await currentDaily(db) };
    }
    case 'list_users': {
      const rows = await db.listProfiles(200);
      return { users: rows.map(r => ({ id: r.id, name: r.trainer_name, points: r.points, rating: r.rating ?? START_RATING, diamonds: r.diamonds || 0, isAdmin: r.is_admin, pokedex: (r.pokedex || []).length, vault: (r.vault || []).length })) };
    }
    case 'grant_mon': {
      if (!SPECIES[body.species]) bad('Espécie inválida.');
      const prof = await db.getProfile(body.userId);
      if (!prof) notFound('Usuário não encontrado.');
      const vault = [...(prof.vault || [])];
      vault.unshift({ uid: 'adm' + Date.now().toString(36), sp: body.species, lvl: Math.max(1, Math.min(60, Number(body.level) || 5)), shiny: !!body.shiny, aura: null, from: 'admin', at: new Date().toISOString() });
      await db.upsertProfile(body.userId, { vault: vault.slice(0, COLLECTION_MAX) });
      return { ok: true };
    }
    case 'set_admin': {
      await db.upsertProfile(body.userId, { is_admin: !!body.value });
      return { ok: true };
    }
    case 'set_announcement': {
      const a = body.announcement || {};
      const value = {
        id: 'a' + Date.now().toString(36),
        title: String(a.title || '').replace(/[<>]/g, '').slice(0, 80),
        text: String(a.text || '').replace(/[<>]/g, '').slice(0, 600),
        kind: ['info', 'warn', 'event', 'update'].includes(a.kind) ? a.kind : 'info',
        active: !!a.active
      };
      await db.setConfig('announcement', value);
      if (value.active && db.insertFeed) await db.insertFeed({ kind: 'announcement', text: value.title, data: value });
      return { ok: true, announcement: value };
    }
    case 'get_admin_data': {
      const [shop, announcement, payments] = [await getShop(db), await db.getConfig('announcement'), await db.listPayments(100)];
      const profiles = await db.listProfiles(500);
      const names = Object.fromEntries(profiles.map(p => [p.id, p.trainer_name]));
      return { shop, announcement, payments: payments.map(p => ({ ...p, user: names[p.user_id] || p.user_id })) };
    }
    case 'save_shop': {
      const shop = cleanShop(body.shop || {});
      await db.setConfig('shop', shop);
      return { ok: true, shop };
    }
    case 'give_diamonds': {
      const n = Math.round(Number(body.amount) || 0);
      if (!n) bad('Quantidade inválida.');
      const left = await db.addDiamonds(body.userId, n);
      if (left === null) bad('O saldo ficaria negativo.');
      return { ok: true, diamonds: left };
    }
    case 'credit_payment': {
      const ok = await creditPayment(db, body.paymentId);
      return { ok };
    }
    case 'close_match': {
      const row = await db.getMatch(body.matchId);
      if (!row) notFound();
      await db.updateMatch(row.id, row.version, { status: 'abandoned', version: row.version + 1 });
      return { ok: true };
    }
    default:
      bad('Operação inválida.');
  }
}
