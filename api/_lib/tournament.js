// 🏆 Torneio (duelos ranqueados 1x1 com o time da Coleção) e 🏟️ Copa (chaveamento de até 8, eliminatório).
// Duelos usam o motor normal (createMatch kind 'duel'): só a batalha, sem tabuleiro, sem XP e sem insígnias.
import { createMatch } from '../../shared/engine.js';
import { randomSeed } from '../../shared/rules/rng.js';
import { CUP_PRIZE, CUP_MIN_HUMANS_FOR_PRIZE, CUP_ELO_BONUS, DUEL_LEVEL_CAP, nextPow2 } from '../../shared/data/cup.js';
import { serieFinished } from './series.js';
import { skinFor, equippedCosmetic } from './shop.js';
import { bad, notFound, publicMatch, eloDeltas, START_RATING, mutateProfile, leagueStats } from './core.js';

const isCpu = id => String(id).startsWith('cpu_');

/** Time do jogador para o duelo: os escolhidos da Coleção (ou os 6 mais fortes), com limite de nível. */
export async function duelTeam(db, entry, levelCap = DUEL_LEVEL_CAP) {
  if (entry.isBot) return entry.teamMons || null;
  const prof = await db.getProfile(entry.id);
  const vault = prof?.vault || [];
  let team = (entry.teamUids || []).map(u => vault.find(v => v.uid === u)).filter(Boolean);
  if (!team.length) team = [...vault].sort((a, b) => b.lvl - a.lvl).slice(0, 6);
  if (!team.length) return null;
  return team.slice(0, 6).map(v => ({ ...v, lvl: levelCap ? Math.min(levelCap, v.lvl) : v.lvl }));
}

/** Time de uma CPU para duelo/copa (nível parecido com o dos humanos). */
function botTeam(level, seed) {
  const pool = ['charizard', 'blastoise', 'venusaur', 'gengar', 'machamp', 'alakazam', 'gyarados', 'arcanine', 'lapras', 'snorlax', 'jolteon',
    'tyranitar', 'salamence', 'garchomp', 'lucario', 'gardevoir', 'metagross', 'greninja', 'scizor', 'dragonite', 'togekiss', 'excadrill'];
  const out = [];
  let s = seed;
  for (let i = 0; i < 6; i++) { s = (s * 1103515245 + 12345) % 2 ** 31; out.push({ uid: `b${seed}_${i}`, sp: pool[s % pool.length], lvl: level }); }
  return out;
}

/** Cria uma partida de duelo já em andamento. */
export async function createDuelMatch(db, { name, a, b, options, hostId, megas = false }) {
  // cosméticos (skin, moldura...) de quem é gente: Torneio e Copa não traziam, e o peão aparecia com a foto padrão
  for (const e of [a, b]) {
    if (e.cosmetic || e.isBot || String(e.id).startsWith('cpu_')) continue;
    try { const prof = await db.getProfile(e.id); if (prof) e.cosmetic = await equippedCosmetic(db, prof); } catch { /* sem cosmético */ }
  }
  const state = createMatch({
    kind: 'duel', id: 'pending', mode: 'online', seed: randomSeed(), now: Date.now(), options: { megas: !!megas },
    players: [a, b].map(e => ({ id: e.id, name: e.name, avatar: e.avatar, isBot: !!e.isBot, teamMons: e.teamMons, cosmetic: e.cosmetic, megaKey: !!e.megaKey }))
  });
  const finished = state.status === 'finished';
  const row = await db.insertMatch({
    code: 'D' + Math.random().toString(36).slice(2, 7).toUpperCase(), name, host_id: hostId, status: finished ? 'finished' : 'playing',
    is_public: false, has_pin: false, options, lobby: [a, b].map(e => ({ id: e.id, name: e.name, avatar: e.avatar, skin: e.skin || e.cosmetic?.skin || null, isBot: !!e.isBot, ready: true })),
    state: { ...state, id: undefined }, version: 1
  });
  const fixed = { ...state, id: row.id };
  await db.updateMatch(row.id, 1, { state: fixed, version: 2 });
  for (const e of [a, b]) if (!e.isBot) await db.addMember(row.id, e.id);
  return { ...row, state: fixed, version: 2 };
}

// ---------------------------------------------------------------- Torneio: fila de duelos ranqueados
/** As listas do banco não trazem state/version: busca a linha completa. */
const full = (db, m) => (m ? db.getMatch(m.id) : null);

export async function duelQueue(db, user, body, profile) {
  // já tem duelo em andamento? volta para ele
  const mine = await db.myMatches(user.id);
  const live = await full(db, mine.find(m => m.options?.mode === 'duel' && m.status === 'playing'));
  if (live) return { match: publicMatch(live, user.id) };
  const waiting = await full(db, mine.find(m => m.options?.mode === 'duel_queue' && m.status === 'lobby'));
  const entry = { id: user.id, name: profile.trainer_name, avatar: profile.avatar || 1, skin: await skinFor(db, profile), teamUids: (body.teamUids || []).map(String).slice(0, 6) };
  entry.teamMons = await duelTeam(db, entry);
  if (!entry.teamMons) bad('Sua Coleção está vazia. Capture Pokémon no Treino ou no Online para montar um time.');

  // procura alguém esperando (rating mais próximo primeiro)
  const open = (await db.listOpenMatches()).filter(m => m.options?.mode === 'duel_queue' && m.host_id !== user.id && m.status === 'lobby');
  const myRating = profile.rating ?? START_RATING;
  open.sort((x, y) => Math.abs((x.options.rating ?? START_RATING) - myRating) - Math.abs((y.options.rating ?? START_RATING) - myRating));
  for (const brief of open) {
    const q = await db.getMatch(brief.id);
    if (!q || q.status !== 'lobby') continue;
    // trava a vaga (só um consegue)
    const ok = await db.updateMatch(q.id, q.version, { status: 'finished', version: q.version + 1 });
    if (!ok) continue;
    if (waiting) await db.updateMatch(waiting.id, waiting.version, { status: 'finished', version: waiting.version + 1 });
    const other = q.lobby[0];
    other.teamMons = await duelTeam(db, other);
    if (!other.teamMons) continue;
    const row = await createDuelMatch(db, { name: `Torneio: ${other.name} x ${entry.name}`, a: other, b: entry, options: { mode: 'duel', ranked: true }, hostId: other.id });
    await db.updateMatch(q.id, q.version + 1, { options: { ...q.options, duelId: row.id }, version: q.version + 2 });
    return { match: publicMatch(row, user.id) };
  }
  if (waiting) {
    const lobby = [{ ...entry, teamMons: undefined }];
    await db.updateMatch(waiting.id, waiting.version, { lobby, version: waiting.version + 1 });
    return { queued: true, match: publicMatch({ ...waiting, lobby }, user.id) };
  }
  const row = await db.insertMatch({
    code: 'Q' + Math.random().toString(36).slice(2, 7).toUpperCase(), name: `Fila de ${profile.trainer_name}`, host_id: user.id, status: 'lobby',
    is_public: true, has_pin: false, options: { mode: 'duel_queue', rating: myRating, maxPlayers: 1 }, lobby: [{ ...entry, teamMons: undefined }], state: null, version: 1
  });
  await db.addMember(row.id, user.id);
  return { queued: true, match: publicMatch(row, user.id) };
}

/** Enquanto espera na fila: o duelo já começou? */
export async function duelQueueStatus(db, user) {
  const mine = await db.myMatches(user.id);
  const live = await full(db, mine.find(m => m.options?.mode === 'duel' && m.status === 'playing'));
  if (live) return { match: publicMatch(live, user.id) };
  const waiting = await full(db, mine.find(m => m.options?.mode === 'duel_queue' && m.status === 'lobby'));
  return { queued: !!waiting, match: waiting ? publicMatch(waiting, user.id) : null };
}

export async function duelQueueCancel(db, user) {
  const mine = await db.myMatches(user.id);
  for (const b of mine.filter(x => x.options?.mode === 'duel_queue' && x.status === 'lobby')) {
    const m = await db.getMatch(b.id);
    if (!m) continue;
    await db.updateMatch(m.id, m.version, { status: 'finished', version: m.version + 1 });
    await db.removeMember(m.id, user.id);
  }
  return { ok: true };
}

// ---------------------------------------------------------------- Copa: chaveamento eliminatório até 8
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Inicia a Copa (sala no modo 'cup'): sorteia o chaveamento e cria os duelos da 1ª rodada. */
export async function startCup(db, row, lobby, userId) {
  if (lobby.length < 2) bad('A Copa precisa de pelo menos 2 participantes.');
  const levelCap = row.options?.levelCap || DUEL_LEVEL_CAP;
  const humans = lobby.filter(e => !e.isBot);
  const players = [];
  for (const e of lobby) {
    const p = { id: e.id, name: e.name, avatar: e.avatar, skin: e.skin || null, isBot: !!e.isBot, teamUids: e.teamUids || [] };
    p.teamMons = e.isBot ? null : await duelTeam(db, p, levelCap);
    if (!e.isBot && !p.teamMons) bad(`${e.name} não tem Pokémon na Coleção.`);
    players.push(p);
  }
  const avg = Math.round(players.filter(p => p.teamMons).flatMap(p => p.teamMons.map(m => m.lvl)).reduce((a, b, _, arr) => a + b / arr.length, 0)) || 30;
  players.filter(p => p.isBot).forEach((p, i) => { p.teamMons = botTeam(Math.max(10, Math.round(avg * 0.9)), 7 + i * 13); });

  const size = nextPow2(players.length);
  const seeds = shuffle(players);
  const byes = size - players.length; // vagas vazias = passe direto (bye), no máximo 1 por confronto
  const round = [];
  for (let i = 0; i < size / 2; i++) {
    const a = seeds.shift();
    const b = i < byes ? null : seeds.shift();
    round.push({ a: a.id, b: b ? b.id : null, matchId: null, winner: null });
  }
  const cup = {
    kind: 'cup', status: 'playing', levelCap, humans: humans.length,
    players: players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, skin: p.skin || null, isBot: p.isBot })),
    teams: Object.fromEntries(players.map(p => [p.id, p.teamMons])),
    rounds: [round], champion: null, runnerUp: null, prize: null, log: [`🏟️ Copa iniciada com ${players.length} treinadores!`]
  };
  const next = { ...row, state: cup, status: 'playing', version: row.version + 1 };
  if (!(await db.updateMatch(row.id, row.version, { state: cup, status: 'playing', version: row.version + 1 }))) bad('A sala mudou. Tente de novo.');
  await launchRound(db, next);
  return { match: publicMatch(await db.getMatch(row.id), userId) };
}

const roundName = (n, total) => (n === total - 1 ? 'Final' : n === total - 2 ? 'Semifinal' : n === total - 3 ? 'Quartas de final' : `Rodada ${n + 1}`);

/** Cria os duelos que faltam na rodada atual e resolve passes diretos. */
async function launchRound(db, cupRow) {
  for (let tries = 0; tries < 6; tries++) {
    const row = await db.getMatch(cupRow.id);
    const cup = structuredClone(row.state);
    const r = cup.rounds.length - 1;
    const totalRounds = Math.log2(nextPow2(cup.players.length));
    let changed = false;
    const created = [];
    for (const [i, m] of cup.rounds[r].entries()) {
      if (m.winner || m.matchId) continue;
      if (!m.a || !m.b) { m.winner = m.a || m.b; m.bye = true; changed = true; continue; }
      const A = cup.players.find(p => p.id === m.a), B = cup.players.find(p => p.id === m.b);
      const duel = await createDuelMatch(db, {
        name: `Copa ${row.name} · ${roundName(r, totalRounds)}`, hostId: row.host_id,
        a: { ...A, teamMons: cup.teams[A.id] }, b: { ...B, teamMons: cup.teams[B.id] },
        options: { mode: 'duel', cupId: row.id, round: r, slot: i, ranked: !A.isBot && !B.isBot }
      });
      m.matchId = duel.id; changed = true;
      created.push(duel);
      if (duel.status === 'finished') m.winner = duel.state.winner; // CPU x CPU termina na hora
    }
    if (!changed) return;
    if (await db.updateMatch(row.id, row.version, { state: cup, version: row.version + 1 })) {
      for (const d of created) if (d.status === 'finished') await duelFinished(db, d);
      return maybeAdvance(db, row.id);
    }
  }
}

/** Se a rodada acabou, monta a próxima (ou coroa o campeão). */
async function maybeAdvance(db, cupId) {
  for (let tries = 0; tries < 6; tries++) {
    const row = await db.getMatch(cupId);
    if (!row?.state || row.state.status !== 'playing') return;
    const cup = structuredClone(row.state);
    const cur = cup.rounds[cup.rounds.length - 1];
    if (cur.some(m => !m.winner)) return;
    const winners = cur.map(m => m.winner);
    const name = id => cup.players.find(p => p.id === id)?.name || '?';
    if (winners.length === 1) {
      const final = cur[0];
      cup.champion = final.winner;
      cup.runnerUp = final.bye ? null : (final.a === final.winner ? final.b : final.a);
      cup.status = 'finished';
      cup.log.push(`👑 ${name(cup.champion)} é o campeão da Copa!`);
      const prize = cupPrize(cup);
      cup.prize = prize;
      if (await db.updateMatch(row.id, row.version, { state: cup, status: 'finished', version: row.version + 1 })) {
        await payCup(db, cup, prize, row.name);
        return;
      }
      continue;
    }
    const next = [];
    for (let i = 0; i < winners.length; i += 2) next.push({ a: winners[i], b: winners[i + 1] || null, matchId: null, winner: null });
    cup.rounds.push(next);
    cup.log.push(`➡️ ${next.length === 1 ? 'Final' : 'Próxima rodada'}: ${next.map(m => `${name(m.a)} x ${m.b ? name(m.b) : '—'}`).join(' · ')}`);
    if (await db.updateMatch(row.id, row.version, { state: cup, version: row.version + 1 })) return launchRound(db, row);
  }
}

export function cupPrize(cup) {
  const enough = cup.humans >= CUP_MIN_HUMANS_FOR_PRIZE;
  const isHuman = id => id && !isCpu(id);
  return {
    champion: isHuman(cup.champion) && enough ? CUP_PRIZE.champion * cup.humans : 0,
    runnerUp: isHuman(cup.runnerUp) && enough ? CUP_PRIZE.runnerUp * cup.humans : 0,
    elo: isHuman(cup.champion) && enough ? CUP_ELO_BONUS : 0,
    note: enough ? null : `Prêmio em 💎 só com ${CUP_MIN_HUMANS_FOR_PRIZE}+ treinadores humanos.`
  };
}

async function payCup(db, cup, prize, cupName) {
  const name = id => cup.players.find(p => p.id === id)?.name || '?';
  if (prize.champion) await db.addDiamonds(cup.champion, prize.champion);
  if (prize.runnerUp && cup.runnerUp) await db.addDiamonds(cup.runnerUp, prize.runnerUp);
  if (!isCpu(cup.champion)) {
    await mutateProfile(db, cup.champion, p => ({
      rating: (p.rating ?? START_RATING) + (prize.elo || 0),
      stats: { ...(p.stats || {}), cups: ((p.stats || {}).cups || 0) + 1 }
    }));
  }
  if (db.insertFeed && !isCpu(cup.champion)) {
    try {
      await db.insertFeed({ kind: 'champion', text: `🏟️ ${name(cup.champion)} venceu a Copa "${cupName}"${prize.champion ? ` e ganhou ${prize.champion} 💎` : ''}!`,
        data: { name: name(cup.champion) } });
    } catch { /* ok */ }
  }
}

/** Chamado quando um duelo termina: Elo (se ranqueado) e avanço da Copa. */
export async function duelFinished(db, row) {
  const st = row.state;
  if (row.options?.serie) return serieFinished(db, row);
  const humans = st.players.filter(p => !isCpu(p.id));
  if (row.options?.ranked && humans.length === 2) {
    const deltas = st.ratingChanges || await eloDeltas(db, st, humans);
    const leagueChanges = {};
    for (const p of humans) {
      let reward = 0;
      await mutateProfile(db, p.id, prof => {
        let s = { ...(prof.stats || {}) };
        // 🏆 Liga: vitória/derrota no duelo ranqueado
        const lg = leagueStats(s, st.winner === p.id ? 1 : 2, 2);
        s = lg.stats; reward = lg.reward;
        leagueChanges[p.id] = { delta: lg.result.delta, change: lg.result.change, div: lg.result.to, lp: lg.result.league.lp };
        s.ranked = (s.ranked || 0) + 1;
        s.duels = (s.duels || 0) + 1;
        s.rankedWins = (s.rankedWins || 0) + (st.winner === p.id ? 1 : 0);
        s.duelWins = (s.duelWins || 0) + (st.winner === p.id ? 1 : 0);
        return { rating: Math.max(100, (prof.rating ?? START_RATING) + (deltas[p.id] || 0)), stats: s };
      });
      if (reward && db.walletAdd) { try { await db.walletAdd(p.id, reward, 0); } catch { /* ok */ } }
    }
    // mostra o resultado da Liga na tela do fim do duelo
    try {
      const cur = await db.getMatch(row.id);
      if (cur?.state) await db.updateMatch(cur.id, cur.version, { state: { ...cur.state, leagueChanges }, version: cur.version + 1 });
    } catch { /* só visual */ }
    if (st.winner && !isCpu(st.winner)) { try { await db.walletAdd(st.winner, 0, 60); } catch { /* ok */ } } // ouro da conta pela vitória
  }
  const cupId = row.options?.cupId;
  if (!cupId) return;
  for (let tries = 0; tries < 6; tries++) {
    const cupRow = await db.getMatch(cupId);
    if (!cupRow?.state) return;
    const cup = structuredClone(cupRow.state);
    const m = cup.rounds[row.options.round]?.[row.options.slot];
    if (!m || m.winner) break;
    m.winner = st.winner;
    const name = id => cup.players.find(p => p.id === id)?.name || '?';
    cup.log.push(`⚔️ ${name(m.a)} x ${name(m.b)} → ${name(st.winner)} avançou!`);
    if (await db.updateMatch(cupRow.id, cupRow.version, { state: cup, version: cupRow.version + 1 })) break;
  }
  await maybeAdvance(db, cupId);
}

export { notFound };
