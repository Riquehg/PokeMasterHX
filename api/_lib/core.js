// Lógica do backend, independente de infraestrutura.
// Recebe um "db" (adaptador Supabase em produção, memória no servidor de desenvolvimento/testes).
import { createMatch, applyAction, score, MAX_PLAYERS } from '../../shared/engine.js';
import { randomSeed } from '../../shared/rules/rng.js';
import { SPECIES, STARTERS } from '../../shared/data/pokemon.js';
import { dailyPokemon } from '../../shared/daily.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = msg => { throw new HttpError(400, msg); };
const forbidden = msg => { throw new HttpError(403, msg || 'Sem permissão.'); };
const notFound = msg => { throw new HttpError(404, msg || 'Não encontrado.'); };

const VAULT_MAX = 30;
const BOT_NAMES = ['Brendan', 'May', 'Dawn', 'Lucas', 'Hilda', 'Nate', 'Serena', 'Calem', 'Red', 'Leaf'];

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
  if (body.op === 'get' || !body.op) return { profile: p };
  if (body.op === 'update') {
    const patch = {};
    if (body.trainerName !== undefined) patch.trainer_name = cleanName(body.trainerName);
    if (body.avatar !== undefined) patch.avatar = Math.max(1, Math.min(8, Number(body.avatar) || 1));
    return { profile: await db.upsertProfile(user.id, patch) };
  }
  bad('Operação inválida.');
}

export async function leaderboard(db) {
  const rows = await db.listProfiles(50);
  return {
    ranking: rows.map(r => ({
      name: r.trainer_name, avatar: r.avatar, points: r.points || 0,
      pokedex: (r.pokedex || []).length, wins: r.stats?.wins || 0, champion: r.stats?.champion || 0,
      shinies: r.stats?.shinies || 0
    }))
  };
}

// ------------------------------------------------------------------ salas
async function currentDaily(db) {
  const cfg = await db.getConfig('daily_pokemon');
  return dailyPokemon(cfg);
}

export async function configInfo(db) {
  return { dailyPokemon: await currentDaily(db) };
}

export async function listRooms(db, user) {
  const rows = await db.listOpenMatches();
  const mine = user ? await db.myMatches(user.id) : [];
  const brief = r => ({
    id: r.id, code: r.code, name: r.name, status: r.status, hasPin: !!r.has_pin,
    players: (r.lobby || []).length, maxPlayers: r.options?.maxPlayers || 4,
    host: (r.lobby || []).find(e => e.id === r.host_id)?.name || '?', updatedAt: r.updated_at
  });
  return { rooms: rows.map(brief), mine: mine.map(brief) };
}

function lobbyEntry(profile, body) {
  const starter = SPECIES[body.starter] && STARTERS.includes(body.starter) ? body.starter : 'bulbasaur';
  return {
    id: profile.id,
    name: cleanName(profile.trainer_name),
    avatar: profile.avatar || 1,
    starter,
    vaultUid: null,
    isBot: false,
    ready: false
  };
}

export async function matchOp(db, user, body) {
  const op = body.op;
  if (op === 'create') return createRoom(db, user, body);
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

  switch (op) {
    case 'update': {
      if (!me) bad('Você não está no lobby.');
      if (body.starter !== undefined) {
        if (!STARTERS.includes(body.starter)) bad('Inicial inválido.');
        me.starter = body.starter;
      }
      if (body.vaultUid !== undefined) {
        if (body.vaultUid === null) me.vaultUid = null;
        else {
          const prof = await getOrCreateProfile(db, user);
          if (!(prof.vault || []).some(v => v.uid === body.vaultUid)) bad('Pokémon não está no seu Cofre.');
          me.vaultUid = body.vaultUid;
        }
      }
      if (body.ready !== undefined) me.ready = !!body.ready;
      return save(db, row, { lobby }, user.id);
    }
    case 'add_bot': {
      if (!isHost) forbidden('Só o anfitrião adiciona CPUs.');
      if (lobby.length >= (row.options?.maxPlayers || 4)) bad('Sala cheia.');
      const n = lobby.filter(e => e.isBot).length;
      const id = 'cpu_' + Math.random().toString(36).slice(2, 8);
      lobby.push({ id, name: `${BOT_NAMES[n % BOT_NAMES.length]} (CPU)`, avatar: ((n + 3) % 8) + 1,
        starter: STARTERS[Math.floor(Math.random() * STARTERS.length)], isBot: true, ready: true });
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
      const options = { ...(row.options || {}) };
      if (body.turnLimit !== undefined) options.turnLimit = Math.max(0, Math.min(200, Number(body.turnLimit) || 0));
      if (body.maxPlayers !== undefined) options.maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Number(body.maxPlayers) || 4));
      return save(db, row, { options }, user.id);
    }
    case 'start': {
      if (!isHost) forbidden('Só o anfitrião inicia a partida.');
      if (lobby.length < 2) bad('Precisa de pelo menos 2 participantes (adicione uma CPU se quiser).');
      const notReady = lobby.filter(e => !e.isBot && e.id !== user.id && !e.ready);
      if (notReady.length) bad(`Aguardando: ${notReady.map(e => e.name).join(', ')} marcar "Pronto".`);
      const players = [];
      for (const e of lobby) {
        const p = { id: e.id, name: e.name, avatar: e.avatar, isBot: e.isBot, starter: e.starter };
        if (e.vaultUid && !e.isBot) {
          const prof = await db.getProfile(e.id);
          const vm = (prof?.vault || []).find(v => v.uid === e.vaultUid);
          if (vm) p.extraMon = { sp: vm.sp, lvl: Math.min(10, vm.lvl), shiny: vm.shiny };
        }
        players.push(p);
      }
      const now = Date.now();
      const state = createMatch({
        id: row.id, mode: 'online', seed: randomSeed(), now, players,
        options: { dailyPokemon: await currentDaily(db), turnLimit: row.options?.turnLimit || 0 }
      });
      return save(db, row, { status: state.status === 'finished' ? 'finished' : 'playing', state }, user.id);
    }
    default:
      bad('Operação inválida.');
  }
}

async function createRoom(db, user, body) {
  const profile = await getOrCreateProfile(db, user);
  const name = cleanName(body.name, `Sala de ${profile.trainer_name}`).slice(0, 30);
  const options = {
    maxPlayers: Math.max(2, Math.min(MAX_PLAYERS, Number(body.maxPlayers) || 4)),
    turnLimit: Math.max(0, Math.min(200, Number(body.turnLimit) || 0))
  };
  const pin = String(body.pin || '').replace(/\D/g, '').slice(0, 6);
  let row = null;
  for (let i = 0; i < 5 && !row; i++) {
    try {
      row = await db.insertMatch({
        code: roomCode(), name, host_id: user.id, status: 'lobby', is_public: body.isPublic !== false,
        has_pin: !!pin, options, lobby: [lobbyEntry(profile, body)], state: null, version: 1
      });
    } catch (e) {
      if (!String(e.message).includes('duplicate')) throw e;
    }
  }
  if (!row) throw new Error('Não foi possível gerar o código da sala.');
  if (pin) await db.setSecret(row.id, pin);
  await db.addMember(row.id, user.id);
  return { match: publicMatch(row, user.id) };
}

async function joinRoom(db, user, body) {
  const row = body.code ? await db.getMatchByCode(String(body.code).toUpperCase().trim()) : await db.getMatch(body.matchId);
  if (!row) notFound('Sala não encontrada. Confira o código.');
  const members = await db.listMembers(row.id);
  if (members.includes(user.id)) return { match: publicMatch(row, user.id) }; // reconectar
  if (row.status !== 'lobby') bad('A partida já começou.');
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
    const res = await actionOp(db, user, { matchId: row.id, action: { type: 'leave' } });
    return res;
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
    const patch = { state, version: row.version + 1, status: finished ? 'finished' : 'playing' };
    const ok = await db.updateMatch(row.id, row.version, patch);
    if (!ok) continue; // conflito de versão: outra jogada entrou antes — recalcula
    if (finished) await recordResults(db, state);
    return { match: publicMatch({ ...row, ...patch }, user.id) };
  }
  throw new HttpError(409, 'Muitas jogadas ao mesmo tempo. Tente de novo.');
}

/** Fim de partida online: grava Pokédex, estatísticas, pontos e guarda o melhor Pokémon no Cofre. */
export async function recordResults(db, state) {
  for (const p of state.players) {
    if (p.id.startsWith('cpu_')) continue;
    const prof = await db.getProfile(p.id);
    if (!prof) continue;
    const pokedex = [...new Set([...(prof.pokedex || []), ...p.caught])];
    const st = { ...(prof.stats || {}) };
    st.matches = (st.matches || 0) + 1;
    st.wins = (st.wins || 0) + (state.winner === p.id ? 1 : 0);
    st.champion = (st.champion || 0) + (p.champion ? 1 : 0);
    st.captures = (st.captures || 0) + p.stats.captures;
    st.shinies = (st.shinies || 0) + p.stats.shinies;
    st.pvpWins = (st.pvpWins || 0) + p.stats.pvpWins;
    st.bestScore = Math.max(st.bestScore || 0, score(p));
    const vault = [...(prof.vault || [])];
    const best = [...p.team, ...p.box].sort((a, b) => (b.shiny - a.shiny) || (b.lvl - a.lvl))[0];
    if (best && !vault.some(v => v.uid === best.uid)) {
      vault.push({ uid: best.uid, sp: best.sp, lvl: best.lvl, shiny: !!best.shiny, aura: best.aura || null, from: state.id, at: new Date().toISOString() });
      vault.sort((a, b) => (b.shiny - a.shiny) || (b.lvl - a.lvl));
      vault.length = Math.min(vault.length, VAULT_MAX);
    }
    const points = pokedex.length * 10 + st.wins * 300 + st.champion * 500 + st.shinies * 50 + st.pvpWins * 25;
    await db.upsertProfile(p.id, { pokedex, stats: st, vault, points });
  }
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
      return { users: rows.map(r => ({ id: r.id, name: r.trainer_name, points: r.points, isAdmin: r.is_admin, pokedex: (r.pokedex || []).length, vault: (r.vault || []).length })) };
    }
    case 'grant_mon': {
      if (!SPECIES[body.species]) bad('Espécie inválida.');
      const prof = await db.getProfile(body.userId);
      if (!prof) notFound('Usuário não encontrado.');
      const vault = [...(prof.vault || [])];
      vault.unshift({ uid: 'adm' + Date.now().toString(36), sp: body.species, lvl: Math.max(1, Math.min(60, Number(body.level) || 5)), shiny: !!body.shiny, aura: null, from: 'admin', at: new Date().toISOString() });
      vault.length = Math.min(vault.length, VAULT_MAX);
      await db.upsertProfile(body.userId, { vault });
      return { ok: true };
    }
    case 'set_admin': {
      await db.upsertProfile(body.userId, { is_admin: !!body.value });
      return { ok: true };
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
