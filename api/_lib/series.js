// ⚽ Liga das Séries no servidor: inscrição (time de defesa), tabela, desafios e fechamento da temporada.
// Os duelos usam createDuelMatch (o defensor vira uma CPU jogando com o time dele).
import { SERIES, TOP_SERIE, SERIE_TEAM, SERIE_LEVEL_CAP, SERIE_DAILY, SERIE_SAME_FOE, SERIE_UP, SERIE_DOWN, SERIE_PRIZE,
  newSerie, seasonId, seasonName, dayId, serieTable, clubById, clubTeam, clubsOf, applySerieDuel, zoneOf, serieInfo } from '../../shared/data/series.js';
import { MYTHICAL, SPECIES } from '../../shared/data/pokemon.js';
import { createMon } from '../../shared/rules/monsters.js';
import { createRng, randomSeed } from '../../shared/rules/rng.js';
import { bad, notFound, publicMatch, mutateProfile, getOrCreateProfile } from './core.js';
import { createDuelMatch } from './tournament.js';

const CPU_PREFIX = 'cpu_s_';
const full = (db, m) => (m ? db.getMatch(m.id) : null);

/** Copia da Coleção com nível limitado (para ataque/defesa). */
function teamFrom(vault, uids) {
  const out = uids.map(u => vault.find(v => v.uid === u)).filter(Boolean).slice(0, SERIE_TEAM);
  return out.map(v => ({ ...v, lvl: Math.min(SERIE_LEVEL_CAP, v.lvl), tf: undefined }));
}

// ---------------------------------------------------------------- temporada
/**
 * Fecha a temporada anterior (uma vez): calcula as tabelas finais, decide quem sobe/cai e paga o pódio.
 * Guardado em game_config 'serie_history' = { closed: { [season]: { moves: {userId: div}, podium: [...] } } }.
 */
async function closeSeason(db, season, now = new Date()) {
  const hist = (await db.getConfig('serie_history')) || { closed: {} };
  hist.closed ||= {};
  if (hist.closed[season]) return hist.closed[season];
  const rows = await db.listProfiles(2000);
  const humans = rows.filter(r => r.stats?.serie?.season === season && (r.stats.serie.defense || []).length);
  const result = { moves: {}, podium: [], at: now.toISOString() };
  hist.closed[season] = result; // marca antes de pagar (evita pagar duas vezes)
  for (let div = 0; div <= TOP_SERIE; div++) {
    const list = humans.filter(r => (r.stats.serie.div | 0) === div).map(r => ({ id: r.id, name: r.trainer_name, ...r.stats.serie }));
    const table = serieTable(div, list, season, now); // temporada já acabou: clubes com o mês inteiro
    for (const row of table) {
      if (row.club) continue;
      const z = zoneOf(row.pos, table.length, div);
      result.moves[row.id] = z === 'up' ? div + 1 : z === 'down' ? div - 1 : div;
      if (row.pos <= 3) result.podium.push({ id: row.id, name: row.name, div, pos: row.pos, prize: SERIE_PRIZE[div][row.pos - 1], mythical: div === TOP_SERIE && row.pos === 1 });
    }
  }
  await db.setConfig('serie_history', hist);
  for (const p of result.podium) {
    try { if (db.walletAdd) await db.walletAdd(p.id, p.prize, 0); } catch (e) { console.error('[serie prize]', e.message); }
    if (p.mythical) {
      const rng = createRng(randomSeed());
      const sp = rng.pick(MYTHICAL.filter(id => SPECIES[id]));
      const mon = createMon(rng, sp, 50, { shiny: false, capTier: 5 });
      mon.ot = p.name; mon.from = `serie:${season}`;
      try { await mutateProfile(db, p.id, prof => ({ vault: [...(prof.vault || []), mon] })); } catch (e) { console.error('[serie mythical]', e.message); }
      p.prizeMon = sp;
    }
    if (db.insertFeed) {
      try { await db.insertFeed({ kind: 'champion', text: `⚽ ${p.name} terminou em ${p.pos}º na ${SERIES[p.div].name} (${seasonName(season)})${p.mythical ? ' e ganhou um Pokémon Mítico!' : '!'}`, data: { name: p.name } }); } catch { /* ok */ }
    }
  }
  await db.setConfig('serie_history', hist);
  return result;
}

/** Garante a Série da temporada atual (vira a temporada: sobe/cai pela tabela final). */
async function ensureSerie(db, prof, now = new Date()) {
  const season = seasonId(now);
  const cur = prof.stats?.serie;
  if (cur?.season === season) return { ...newSerie(season), ...cur };
  if (!cur) return newSerie(season, 0);
  const closed = await closeSeason(db, cur.season, now);
  const div = closed.moves[prof.id] ?? Math.max(0, (cur.div | 0) - 1); // não terminou a tabela (sem defesa): cai uma
  return { ...newSerie(season, div), defense: cur.defense || [], prev: { season: cur.season, div: cur.div, pts: cur.pts } };
}

async function saveSerie(db, userId, serie) {
  await mutateProfile(db, userId, prof => ({ stats: { ...(prof.stats || {}), serie } }));
}

// ---------------------------------------------------------------- operações (via /api/match)
export async function serieOp(db, user, body) {
  const prof = await getOrCreateProfile(db, user);
  const now = new Date();
  let serie = await ensureSerie(db, prof, now);
  if (prof.stats?.serie?.season !== serie.season) await saveSerie(db, user.id, serie);
  const vault = prof.vault || [];

  if (body.op === 'serie_defense') {
    const uids = [...new Set((body.uids || []).map(String))].filter(u => vault.some(v => v.uid === u)).slice(0, SERIE_TEAM);
    if (!uids.length) bad(`Escolha até ${SERIE_TEAM} Pokémon da Coleção para defender.`);
    serie = { ...serie, defense: uids };
    await saveSerie(db, user.id, serie);
    return serieView(db, user.id, serie, vault, now);
  }
  if (body.op === 'serie_challenge') return challenge(db, user, prof, serie, body, now);
  return serieView(db, user.id, serie, vault, now);
}

async function serieView(db, userId, serie, vault, now) {
  const rows = await db.listProfiles(2000);
  const season = serie.season;
  const humans = [];
  for (const r of rows) {
    const s = r.stats?.serie;
    if (!s || s.season !== season || (s.div | 0) !== serie.div || !(s.defense || []).length) continue;
    const def = teamFrom(r.vault || [], s.defense);
    humans.push({ id: r.id, name: r.trainer_name, avatar: r.avatar, pts: s.pts | 0, j: s.j | 0, v: s.v | 0, d: s.d | 0, sp: s.sp | 0, dv: s.dv | 0, dd: s.dd | 0,
      defense: def.map(m => ({ sp: m.sp, lvl: m.lvl, shiny: !!m.shiny })), me: r.id === userId });
  }
  const table = serieTable(serie.div, humans, season, now).map(r => ({
    ...r, zone: zoneOf(r.pos, humans.length + clubsOf(serie.div).length, serie.div),
    defense: r.club ? clubTeam(clubById(r.id)).map(m => ({ sp: m.sp, lvl: m.lvl })) : r.defense
  }));
  const today = dayId(now);
  const used = serie.day === today ? serie.dayCount : 0;
  const foes = serie.day === today ? serie.foesToday || [] : [];
  const hist = (await db.getConfig('serie_history'))?.closed || {};
  const lastSeason = Object.keys(hist).sort().pop();
  return {
    serie: { ...serie, info: serieInfo(serie.div), seasonName: seasonName(season), left: Math.max(0, SERIE_DAILY - used), foesToday: foes,
      defenseMons: teamFrom(vault, serie.defense || []).map(m => ({ uid: m.uid, sp: m.sp, lvl: m.lvl, shiny: !!m.shiny })) },
    table,
    rules: { team: SERIE_TEAM, cap: SERIE_LEVEL_CAP, daily: SERIE_DAILY, up: SERIE_UP, down: SERIE_DOWN, prize: SERIE_PRIZE[serie.div] },
    series: SERIES,
    last: lastSeason ? { season: lastSeason, seasonName: seasonName(lastSeason), podium: hist[lastSeason].podium || [] } : null
  };
}

async function challenge(db, user, prof, serie, body, now) {
  // já tem um duelo da Série em andamento? volta para ele
  const mine = await db.myMatches(user.id);
  const live = await full(db, mine.find(m => m.options?.serie && m.status === 'playing'));
  if (live) return { match: publicMatch(live, user.id) };
  if (!(serie.defense || []).length) bad('Inscreva primeiro o seu time de defesa (3 Pokémon).');
  const today = dayId(now);
  if (serie.day !== today) serie = { ...serie, day: today, dayCount: 0, foesToday: [] };
  if (serie.dayCount >= SERIE_DAILY) bad(`Você já fez os ${SERIE_DAILY} ataques de hoje. Volte amanhã — sua defesa continua jogando por você.`);
  const target = String(body.target || '');
  if (!target || target === user.id) bad('Escolha um adversário da tabela.');
  if ((serie.foesToday || []).filter(x => x === target).length >= SERIE_SAME_FOE) bad('Você já enfrentou esse adversário hoje.');

  // time do atacante
  const vault = prof.vault || [];
  let uids = (body.teamUids || []).map(String);
  if (!uids.length) uids = serie.defense;
  const myTeam = teamFrom(vault, uids);
  if (!myTeam.length) bad('Escolha seu time de ataque.');

  // adversário: clube CPU ou treinador da mesma série
  let foe;
  const club = clubById(target);
  if (club) {
    if (club.div !== serie.div) bad('Esse clube é de outra série.');
    foe = { id: `${CPU_PREFIX}${club.id}`, name: club.name, avatar: 7, isBot: true, teamMons: clubTeam(club), ref: club.id };
  } else {
    const other = await db.getProfile(target);
    const os = other?.stats?.serie;
    if (!other || os?.season !== serie.season || (os.div | 0) !== serie.div) bad('Esse treinador não está na sua série nesta temporada.');
    const team = teamFrom(other.vault || [], os.defense || []);
    if (!team.length) bad('Esse treinador está sem time de defesa.');
    foe = { id: `${CPU_PREFIX}${other.id.slice(0, 12)}`, name: `${other.trainer_name} (defesa)`, avatar: other.avatar || 1, isBot: true, teamMons: team, ref: other.id };
  }
  // gasta o ataque ao começar (sair no meio não devolve)
  serie = { ...serie, dayCount: serie.dayCount + 1, foesToday: [...(serie.foesToday || []), target] };
  await saveSerie(db, user.id, serie);
  const me = { id: user.id, name: prof.trainer_name, avatar: prof.avatar || 1, teamMons: myTeam };
  const row = await createDuelMatch(db, {
    name: `⚽ ${serieInfo(serie.div).name}: ${me.name} x ${foe.name}`, a: me, b: foe, hostId: user.id,
    options: { mode: 'duel', serie: { season: serie.season, div: serie.div, attacker: user.id, defender: foe.ref } }
  });
  return { match: publicMatch(row, user.id) };
}

/** Fim de um duelo da Série: pontos do atacante e (se for treinador) do defensor. */
export async function serieFinished(db, row) {
  const o = row.options?.serie;
  const st = row.state;
  if (!o || !st) return;
  const att = st.players.find(p => p.id === o.attacker);
  const foe = st.players.find(p => p.id !== o.attacker);
  if (!att || !foe) return;
  const win = st.winner === att.id;
  const kos = foe.team.filter(m => m.hp <= 0).length;
  const lost = att.team.filter(m => m.hp <= 0).length;
  let result = null;
  await mutateProfile(db, o.attacker, prof => {
    const s = prof.stats?.serie;
    if (!s || s.season !== o.season) return null;
    const r = applySerieDuel({ ...newSerie(s.season, s.div), ...s }, null, { win, kos, lost });
    result = { win, kos, lost, sp: r.sp, pts: win ? 3 : 0 };
    const log = [{ at: Date.now(), kind: 'atk', foe: foe.name, win, kos, lost }, ...(s.log || [])].slice(0, 20);
    return { stats: { ...(prof.stats || {}), serie: { ...r.att, log } } };
  });
  if (!clubById(o.defender)) {
    await mutateProfile(db, o.defender, prof => {
      const s = prof.stats?.serie;
      if (!s || s.season !== o.season) return null;
      const r = applySerieDuel({ ...newSerie(s.season, s.div), j: 0, v: 0, d: 0, sp: 0, pts: 0 }, { ...newSerie(s.season, s.div), ...s }, { win, kos, lost });
      const log = [{ at: Date.now(), kind: 'def', foe: att.name, win: !win, kos: lost, lost: kos }, ...(s.log || [])].slice(0, 20);
      return { stats: { ...(prof.stats || {}), serie: { ...r.def, log } } };
    });
  }
  try { // mostra o resultado na tela do fim do duelo
    const cur = await db.getMatch(row.id);
    if (cur?.state && result) await db.updateMatch(cur.id, cur.version, { state: { ...cur.state, serieResult: result }, version: cur.version + 1 });
  } catch { /* só visual */ }
}

export { notFound, closeSeason, ensureSerie };
