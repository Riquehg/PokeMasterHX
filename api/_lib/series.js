// ⚽ Liga das Séries no servidor: inscrição (time de defesa), tabela, desafios e fechamento da temporada.
// Os duelos usam createDuelMatch (o defensor vira uma CPU jogando com o time dele).
import { SERIES, TOP_SERIE, SERIE_TEAM, SERIE_LEVEL_CAP, SERIE_DAILY, SERIE_SAME_FOE, SERIE_UP, SERIE_DOWN, SERIE_PRIZE, SERIE_ITEMS, SERIE_SLOTS,
  newSerie, cleanTeam, lateStartPoints, seasonId, seasonName, dayId, serieTable, botById, botTeam, applySerieDuel, zoneOf, serieInfo, trophyLabel } from '../../shared/data/series.js';
import { ITEMS } from '../../shared/data/items.js';
import { MYTHICAL, SPECIES } from '../../shared/data/pokemon.js';
import { createMon } from '../../shared/rules/monsters.js';
import { createRng, randomSeed } from '../../shared/rules/rng.js';
import { bad, notFound, publicMatch, mutateProfile, getOrCreateProfile, addToBag } from './core.js';
import { createDuelMatch } from './tournament.js';
import { getShop, equippedSkin, equippedCosmetic } from './shop.js';

const CPU_PREFIX = 'cpu_s_';
const full = (db, m) => (m ? db.getMatch(m.id) : null);

/** Copia da Coleção com nível limitado (para ataque/defesa). */
function teamFrom(vault, uids) {
  const out = uids.map(u => vault.find(v => v.uid === u)).filter(Boolean).slice(0, SERIE_TEAM);
  return out.map(v => ({ ...v, lvl: Math.min(SERIE_LEVEL_CAP, v.lvl), tf: undefined }));
}

/** Resultados reais contra os treinadores CPU nesta temporada (game_config 'serie_bots'). */
async function botAdj(db, season) {
  const cfg = await db.getConfig('serie_bots');
  return cfg?.season === season ? cfg.adj || {} : {};
}
async function addBotAdj(db, season, botId, d) {
  const cfg = (await db.getConfig('serie_bots')) || {};
  const adj = cfg.season === season ? { ...(cfg.adj || {}) } : {};
  const cur = adj[botId] || { pts: 0, dv: 0, dd: 0 };
  adj[botId] = { pts: cur.pts + (d.pts || 0), dv: cur.dv + (d.dv || 0), dd: cur.dd + (d.dd || 0) };
  await db.setConfig('serie_bots', { season, adj });
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
  const result = { moves: {}, final: {}, podium: [], champions: {}, at: now.toISOString() };
  hist.closed[season] = result; // marca antes de pagar (evita pagar duas vezes)
  const adj = await botAdj(db, season);
  for (let div = 0; div <= TOP_SERIE; div++) {
    const list = humans.filter(r => (r.stats.serie.div | 0) === div).map(r => ({ id: r.id, name: r.trainer_name, ...r.stats.serie }));
    const table = serieTable(div, list, season, now, adj); // temporada já acabou: CPU com o mês inteiro
    result.champions[div] = table.slice(0, 2).map(r => r.name); // quem ganhou (pode ser CPU — aparece como treinador)
    for (const row of table) {
      if (row.bot) continue;
      const z = zoneOf(row.pos, table.length, div);
      result.moves[row.id] = z === 'up' ? div + 1 : z === 'down' ? div - 1 : div;
      result.final[row.id] = { pos: row.pos, total: table.length, div, pts: row.pts, v: row.v, d: row.d, sp: row.sp };
      if (row.pos <= 3) result.podium.push({ id: row.id, name: row.name, div, pos: row.pos, prize: SERIE_PRIZE[div][row.pos - 1], mythical: div === TOP_SERIE && row.pos === 1 });
    }
  }
  await db.setConfig('serie_history', hist);
  for (const p of result.podium) {
    try { if (db.walletAdd) await db.walletAdd(p.id, p.prize, 0); } catch (e) { console.error('[serie prize]', e.message); }
    if (p.pos <= 2) { // 🏆 troféu + item especial da série
      p.items = SERIE_ITEMS[p.div][p.pos - 1];
      const trophy = { season, seasonName: seasonName(season), div: p.div, pos: p.pos, at: now.toISOString() };
      try {
        await mutateProfile(db, p.id, prof => {
          const st = { ...(prof.stats || {}) };
          if ((st.trophies || []).some(t => t.season === season && t.div === p.div)) return null;
          st.trophies = [trophy, ...(st.trophies || [])].slice(0, 120);
          st.bag = addToBag(st.bag, p.items);
          return { stats: st };
        });
      } catch (e) { console.error('[serie trophy]', e.message); }
    }
    if (p.mythical) {
      const rng = createRng(randomSeed());
      const sp = rng.pick(MYTHICAL.filter(id => SPECIES[id]));
      const mon = createMon(rng, sp, 50, { shiny: false, capTier: 5 });
      mon.ot = p.name; mon.from = `serie:${season}`;
      try { await mutateProfile(db, p.id, prof => ({ vault: [...(prof.vault || []), mon] })); } catch (e) { console.error('[serie mythical]', e.message); }
      p.prizeMon = sp;
    }
    if (db.insertFeed) {
      try { await db.insertFeed({ kind: 'champion', text: `⚽ ${p.name} terminou em ${p.pos}º na ${SERIES[p.div].name} (${seasonName(season)})${p.pos <= 2 ? ` e levou o troféu de ${p.pos === 1 ? 'campeão' : 'vice'}` : ''}${p.mythical ? ' + um Pokémon Mítico!' : '!'}`, data: { name: p.name } }); } catch { /* ok */ }
    }
  }
  await db.setConfig('serie_history', hist);
  // já coloca todo mundo que jogou na série nova (assim o "Resultado da temporada" aparece no menu, sem esperar abrir a Liga)
  const newSeason = seasonId(now);
  if (newSeason !== season) {
    for (const r of humans) {
      try {
        await mutateProfile(db, r.id, prof => {
          const cur = prof.stats?.serie;
          if (!cur || cur.season !== season) return null;
          return { stats: { ...(prof.stats || {}), serie: rolledSerie(prof.id, cur, result, newSeason) } };
        });
      } catch (e) { console.error('[serie rollover]', e.message); }
    }
  }
  return result;
}

/** Série nova a partir da antiga + resultado do fechamento (com o resumo para a janela "Resultado da temporada"). */
function rolledSerie(userId, cur, closed, season) {
  const fin = closed.final?.[userId];
  const div = closed.moves[userId] ?? Math.max(0, (cur.div | 0) - 1); // não terminou a tabela (sem defesa): cai uma
  const pod = (closed.podium || []).find(p => p.id === userId);
  return {
    ...newSerie(season, div), defense: cur.defense || [], team: cur.team || null, start: 0,
    prev: { season: cur.season, seasonName: seasonName(cur.season), div: cur.div | 0, newDiv: div, pos: fin?.pos || null, total: fin?.total || null,
      pts: fin?.pts ?? cur.pts ?? 0, v: fin?.v ?? cur.v ?? 0, d: fin?.d ?? cur.d ?? 0, sp: fin?.sp ?? cur.sp ?? 0,
      prize: pod?.prize || 0, items: pod?.items || (pod && pod.pos <= 2 ? SERIE_ITEMS[pod.div][pod.pos - 1] : null), mythical: pod?.prizeMon || (pod?.mythical ? true : null),
      trophy: pod && pod.pos <= 2 ? pod.pos : 0, seen: false }
  };
}

/** Garante a Série da temporada atual (vira a temporada: sobe/cai pela tabela final). */
async function ensureSerie(db, prof, now = new Date()) {
  const season = seasonId(now);
  const cur = prof.stats?.serie;
  if (cur?.season === season) return { ...newSerie(season), ...cur };
  if (!cur) return newSerie(season, 0);
  const closed = await closeSeason(db, cur.season, now);
  return rolledSerie(prof.id, cur, closed, season);
}

/** ⏰ Vercel Cron (dia 1, meia-noite de Brasília): fecha a temporada que acabou e já vira todo mundo. */
export async function serieCron(db, now = new Date()) {
  const prev = seasonId(new Date(now.getTime() - 6 * 3600000)); // 6 h antes = mês que acabou
  const cur = seasonId(now);
  if (prev === cur) return { ok: true, closed: null, note: 'Temporada ainda em andamento.' };
  const r = await closeSeason(db, prev, now);
  return { ok: true, closed: prev, podium: r.podium.length, players: Object.keys(r.final || {}).length };
}

async function saveSerie(db, userId, serie) {
  await mutateProfile(db, userId, prof => ({ stats: { ...(prof.stats || {}), serie } }));
}

// ---------------------------------------------------------------- operações (via /api/match)
export async function serieOp(db, user, body) {
  const prof = await getOrCreateProfile(db, user);
  const now = new Date();
  let serie = await ensureSerie(db, prof, now);
  let changed = prof.stats?.serie?.season !== serie.season;
  // 🏁 quem se inscreveu com a temporada andando (antes desta regra) ganha os pontos de largada uma vez
  if (serie.start === undefined && (serie.defense || []).length) { const st = lateStartPoints(serie.div, serie.season, now); serie = { ...serie, start: st, pts: (serie.pts | 0) + st }; changed = true; }
  if (body.op === 'serie_seen' && serie.prev && !serie.prev.seen) { serie = { ...serie, prev: { ...serie.prev, seen: true } }; changed = true; }
  if (changed) await saveSerie(db, user.id, serie);
  if (body.op === 'serie_seen') return { ok: true };
  const vault = prof.vault || [];

  if (body.op === 'serie_team') { // ⚽ nome e escudo do time
    const team = cleanTeam(body.team, `${prof.trainer_name} FC`);
    const rows = await db.listProfiles(2000);
    if (rows.some(r => r.id !== user.id && r.stats?.serie?.team?.name?.toLowerCase() === team.name.toLowerCase())) bad('Já existe um time com esse nome. Escolha outro.');
    serie = { ...serie, team };
    await saveSerie(db, user.id, serie);
    return serieView(db, user.id, serie, vault, now);
  }
  if (body.op === 'serie_defense') {
    const uids = [...new Set((body.uids || []).map(String))].filter(u => vault.some(v => v.uid === u)).slice(0, SERIE_TEAM);
    if (uids.length < Math.min(SERIE_TEAM, vault.length) || !uids.length) bad(`O time de defesa precisa ter ${SERIE_TEAM} Pokémon da Coleção.`);
    serie = { ...serie, defense: uids, team: serie.team || cleanTeam(null, `${prof.trainer_name} FC`) };
    if (serie.start === undefined) { const st = lateStartPoints(serie.div, serie.season, now); serie.start = st; serie.pts = (serie.pts | 0) + st; }
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
  let shopItems = [];
  try { shopItems = (await getShop(db)).items || []; } catch { /* sem vitrine: avatar padrão */ }
  for (const r of rows) {
    const s = r.stats?.serie;
    if (!s || s.season !== season || (s.div | 0) !== serie.div || !(s.defense || []).length) continue;
    const def = teamFrom(r.vault || [], s.defense);
    humans.push({ id: r.id, name: r.trainer_name, avatar: r.avatar, skin: equippedSkin(r, shopItems), club: s.team || cleanTeam(null, `${r.trainer_name} FC`), trophies: (r.stats?.trophies || []).length, pts: s.pts | 0, j: s.j | 0, v: s.v | 0, d: s.d | 0, sp: s.sp | 0, dv: s.dv | 0, dd: s.dd | 0,
      defense: def.map(m => ({ sp: m.sp, lvl: m.lvl, shiny: !!m.shiny })), me: r.id === userId });
  }
  const raw = serieTable(serie.div, humans, season, now, await botAdj(db, season));
  // os treinadores CPU aparecem como qualquer treinador (sem marcação)
  const table = raw.map(({ bot, ...r }) => ({
    ...r, zone: zoneOf(r.pos, raw.length, serie.div), trophies: r.trophies || (bot ? fakeTrophies(r.id, serie.div) : 0),
    defense: bot ? botTeam(botById(r.id)).map(m => ({ sp: m.sp, lvl: m.lvl })) : r.defense
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
    trophies: (await db.getProfile(userId))?.stats?.trophies || [],
    rules: { slots: SERIE_SLOTS, items: SERIE_ITEMS[serie.div].map(it => Object.entries(it).map(([id, q]) => `${q}x ${ITEMS[id]?.name || id}`).join(' + ')), team: SERIE_TEAM, cap: SERIE_LEVEL_CAP, daily: SERIE_DAILY, up: SERIE_UP, down: SERIE_DOWN, prize: SERIE_PRIZE[serie.div] },
    series: SERIES,
    last: lastSeason ? { season: lastSeason, seasonName: seasonName(lastSeason), champions: hist[lastSeason].champions || {} } : null
  };
}

async function challenge(db, user, prof, serie, body, now) {
  // já tem um duelo da Série em andamento? volta para ele
  const mine = await db.myMatches(user.id);
  const live = await full(db, mine.find(m => m.options?.serie && m.status === 'playing'));
  if (live) return { match: publicMatch(live, user.id) };
  if (!(serie.defense || []).length) bad(`Inscreva primeiro o seu time de defesa (${SERIE_TEAM} Pokémon).`);
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
  if (myTeam.length < Math.min(SERIE_TEAM, vault.length) || !myTeam.length) bad(`O time de ataque precisa ter ${SERIE_TEAM} Pokémon.`);

  // adversário: treinador CPU ou treinador da mesma série
  let foe;
  const bot = botById(target);
  if (bot) {
    if (bot.div !== serie.div) bad('Esse treinador não está na sua série nesta temporada.');
    foe = { id: `${CPU_PREFIX}${bot.id}`, name: `${bot.club.name} (${bot.name})`, avatar: bot.avatar, cosmetic: bot.skin ? { skin: bot.skin } : null, isBot: true, teamMons: botTeam(bot), ref: bot.id };
  } else {
    const other = await db.getProfile(target);
    const os = other?.stats?.serie;
    if (!other || os?.season !== serie.season || (os.div | 0) !== serie.div) bad('Esse treinador não está na sua série nesta temporada.');
    const team = teamFrom(other.vault || [], os.defense || []);
    if (!team.length) bad('Esse treinador está sem time de defesa.');
    foe = { id: `${CPU_PREFIX}${other.id.slice(0, 12)}`, name: `${os.team?.name || other.trainer_name + ' FC'} (${other.trainer_name})`, avatar: other.avatar || 1, cosmetic: await equippedCosmetic(db, other).catch(() => null), isBot: true, teamMons: team, ref: other.id };
  }
  // gasta o ataque ao começar (sair no meio não devolve)
  serie = { ...serie, dayCount: serie.dayCount + 1, foesToday: [...(serie.foesToday || []), target] };
  await saveSerie(db, user.id, serie);
  const me = { id: user.id, name: serie.team?.name || prof.trainer_name, avatar: prof.avatar || 1, cosmetic: await equippedCosmetic(db, prof).catch(() => null), teamMons: myTeam };
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
    const log = [{ at: Date.now(), kind: 'atk', foe: foe.name.replace(/^cpu_s_/, ''), win, kos, lost }, ...(s.log || [])].slice(0, 20);
    return { stats: { ...(prof.stats || {}), serie: { ...r.att, log } } };
  });
  if (botById(o.defender)) {
    try { await addBotAdj(db, o.season, o.defender, win ? { dd: 1 } : { pts: 1, dv: 1 }); } catch (e) { console.error('[serie bot]', e.message); }
  } else {
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

/** Os CPU também "têm" troféus (para não destoar dos treinadores). */
function fakeTrophies(id, div) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 7 === 0 ? 1 + (h % 3) + (div >> 1) : 0;
}

export { notFound, closeSeason, ensureSerie };
