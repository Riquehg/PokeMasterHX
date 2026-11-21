// v20: só 2 casas lendárias por mapa, mapas temáticos, mapas do painel admin, Míticos e a Liga das Séries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapFor, useMap, validateCustomMap, isMapId, SPACE_LIST } from '../shared/data/board.js';
import { createMatch } from '../shared/engine.js';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { profileOp, adminOp, matchOp, actionOp, configInfo, listRooms } from '../api/_lib/core.js';
import { closeSeason } from '../api/_lib/series.js';
import { whoMustAct } from '../shared/engine.js';
import { SPECIES, MYTHICAL } from '../shared/data/pokemon.js';
import { rollWild, hatchEgg } from '../shared/rules/monsters.js';
import { createRng } from '../shared/rules/rng.js';
import { serieTable, botsOf, botTeam, applySerieDuel, newSerie, zoneOf, SERIE_SLOTS, cleanTeam } from '../shared/data/series.js';

const legendSpaces = m => m.spaces.filter(s => s.type === 'pokemon' && s.tier === 5).map(s => s.id);

test('cada mapa tem exatamente 2 casas de Pokémon Amarelas (as cartas Amarelas continuam)', () => {
  for (const id of ['kanto', 'gen:123', 'gen:999', 'theme:arquipelago', 'theme:vulcanica', 'theme:glacial', 'theme:floresta']) {
    const m = mapFor(id, 5);
    assert.equal(legendSpaces(m).length, 2, id);
    assert.ok(m.spaces.some(s => s.type === 'event' && s.tier === 5), `${id} ainda tem eventos Amarelos (Raids/Santuário)`);
  }
  assert.deepEqual(legendSpaces(mapFor('kanto')).sort(), [113, 123]);
  useMap('kanto');
});

test('mapas temáticos: ambientes do tema, mesmo layout sempre, e a partida guarda o id', () => {
  const a = mapFor('theme:vulcanica'), b = mapFor('theme:vulcanica');
  assert.equal(a, b);
  const biomes = new Set(a.spaces.filter(s => s.type !== 'city' && !s.gate).map(s => s.biome));
  assert.ok(biomes.has('volcano') || biomes.has('desert'));
  assert.ok(!biomes.has('snow'));
  assert.equal(a.crossings, 0);
  const s = createMatch({ seed: 2, mode: 'local', now: 0, map: 'theme:glacial', players: [{ id: 'a', name: 'A' }] });
  assert.equal(s.map, 'theme:glacial');
  assert.ok(isMapId('theme:floresta') && !isMapId('theme:xyz'));
  useMap('kanto');
});

function demoMap() {
  const k = mapFor('kanto');
  return { id: 'teste', name: 'Teste', desc: 'cópia', ratio: k.ratio, start: k.start, elite: k.elite, champion: k.champion, gyms: { ...k.gyms },
    spaces: k.spaces.map(s => ({ ...s, tier: s.type === 'pokemon' && s.tier === 4 ? 5 : s.tier, links: s.links.slice() })) };
}

test('editor de mapas: valida, limita lendárias a 2, publica e a sala online usa o mapa', async () => {
  assert.throws(() => validateCustomMap({ ...demoMap(), start: 6 }), /CIDADE como início/);
  assert.throws(() => validateCustomMap({ ...demoMap(), gyms: { ...demoMap().gyms, soul: 20 } }), /cidades diferentes/);
  const broken = demoMap(); broken.spaces.push({ id: 999, x: 50, y: 50, type: 'pokemon', tier: 1, biome: 'grass', links: [] });
  assert.throws(() => validateCustomMap(broken), /sem ligação/);
  const ok = validateCustomMap(demoMap());
  assert.equal(legendSpaces(ok).length, 2);
  assert.equal(ok.id, 'custom:teste');

  const db = createMemoryDb();
  const admin = await db.verifyToken('dev:admin@kanto.com');
  await profileOp(db, admin, { op: 'get' });
  await adminOp(db, admin, { op: 'save_map', map: demoMap(), published: false });
  assert.equal((await configInfo(db)).maps.length, 0, 'rascunho não aparece');
  const r = await adminOp(db, admin, { op: 'save_map', map: demoMap(), published: true });
  assert.equal(r.map.rev, 2);
  assert.equal((await configInfo(db)).maps[0].id, 'custom:teste');
  const solo = await matchOp(db, admin, { op: 'solo', bots: 1, map: 'custom:teste' });
  assert.equal(solo.match.state.map, 'custom:teste');
  assert.equal(solo.match.state.mapData.spaces.length, ok.spaces.length);
  useMap('kanto');
  // o motor reativa o mapa da partida a partir do estado
  const { applyAction } = await import('../shared/engine.js');
  applyAction(solo.match.state, admin.id, { type: 'noop' }, { now: Date.now() });
  assert.equal(SPACE_LIST.length, ok.spaces.length);
  useMap('kanto');
  await adminOp(db, admin, { op: 'delete_map', id: 'custom:teste' });
  assert.equal((await adminOp(db, admin, { op: 'list_maps' })).maps.length, 0);
});

test('Míticos: categoria própria, raros nas casas Amarelas e nunca em ovos', () => {
  assert.ok(SPECIES.mew.mythical && SPECIES.mew.legendary);
  assert.ok(!SPECIES.mewtwo.mythical);
  assert.ok(SPECIES.nihilego.ultra);
  const rng = createRng(9);
  let myth = 0;
  for (let i = 0; i < 3000; i++) if (SPECIES[rollWild(rng, 5).sp].mythical) myth++;
  assert.ok(myth > 40 && myth < 250, `míticos raros (${myth}/3000)`);
  for (let i = 0; i < 500; i++) assert.ok(!SPECIES[hatchEgg(rng, 5).sp].mythical);
  assert.ok(MYTHICAL.length >= 15);
});

test('Séries: 20 vagas com treinadores CPU (nome, time e escudo próprios), que saem conforme entram jogadores', () => {
  for (let d = 0; d < 4; d++) {
    const bots = botsOf(d);
    assert.equal(bots.length, 20);
    assert.equal(new Set(bots.map(b => b.name)).size, 20);
    for (const b of bots) { assert.ok(b.club.name && b.club.crest); assert.equal(botTeam(b).length, 6); for (const m of botTeam(b)) assert.ok(SPECIES[m.sp], m.sp); }
  }
  assert.notEqual(botsOf(0)[0].club.name, botsOf(3)[0].club.name);
  const now = new Date('2026-11-20T12:00:00Z');
  const t = serieTable(1, [{ id: 'u1', name: 'Ana', pts: 999, j: 5, v: 5, d: 0, sp: 9 }], '2026-11', now);
  assert.equal(t.length, SERIE_SLOTS);
  assert.equal(t[0].id, 'u1');
  const many = Array.from({ length: 15 }, (_, i) => ({ id: 'h' + i, name: 'H' + i, pts: 0, j: 0, v: 0, d: 0, sp: 0 }));
  const t2 = serieTable(1, many, '2026-11', now);
  assert.equal(t2.filter(r => r.bot).length, 5, 'sobram só 5 CPU (os mais fortes)');
  const full = serieTable(1, many, '2026-11', now, {}).filter(r => r.bot).map(r => r.pts);
  const all = serieTable(1, [], '2026-11', now).map(r => r.pts);
  assert.deepEqual(full, all.slice(0, 5));
  assert.equal(cleanTeam({ name: '  <b>Trovão</b> FC  ', crest: '🔥', color: 'xx' }).name, 'bTrovão/b FC');
  assert.equal(zoneOf(1, 7, 1), 'up');
  assert.equal(zoneOf(7, 7, 1), 'down');
  assert.equal(zoneOf(7, 7, 0), null, 'Série D não cai');
  assert.equal(zoneOf(1, 7, 3), null, 'Série A não sobe');
  const r = applySerieDuel(newSerie(), newSerie(), { win: false, kos: 1, lost: 3 });
  assert.equal(r.att.pts, 0); assert.equal(r.att.sp, -2); assert.equal(r.def.pts, 1); assert.equal(r.def.dv, 1);
});

async function users(n) {
  const db = createMemoryDb();
  const admin = await db.verifyToken('dev:admin@kanto.com');
  await profileOp(db, admin, { op: 'get' });
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = await db.verifyToken(`dev:s${i}@kanto.com`);
    await profileOp(db, u, { op: 'update', trainerName: `S${i}`, avatar: 1 });
    for (const sp of ['charizard', 'blastoise', 'venusaur', 'pikachu', 'gengar', 'snorlax']) await adminOp(db, admin, { op: 'grant_mon', userId: u.id, species: sp, level: 60 });
    out.push(u);
  }
  return { db, admin, us: out };
}
async function playOut(db, matchId, u) {
  for (let i = 0; i < 300; i++) {
    const row = await db.getMatch(matchId);
    if (row.status !== 'playing') return row;
    if (!whoMustAct(row.state).includes(u.id)) continue;
    const b = row.state.battle;
    const si = b.sides.findIndex(s => s.pid === u.id);
    const team = row.state.players.find(p => p.id === u.id).team;
    const action = b.mustSwitch[si] ? { type: 'battle', move: 'switch', index: team.findIndex((m, k) => m.hp > 0 && k !== b.sides[si].active) } : { type: 'battle', move: 'attack', slot: 0 };
    await actionOp(db, u, { matchId, action });
  }
  return db.getMatch(matchId);
}

test('Séries: inscrição, desafio contra a defesa de outro treinador (offline) e contra clube; limites do dia', async () => {
  const { db, us: [a, b] } = await users(2);
  const va = (await db.getProfile(a.id)).vault, vb = (await db.getProfile(b.id)).vault;
  await assert.rejects(matchOp(db, a, { op: 'serie_challenge', target: b.id }), /time de defesa/);
  const g = await matchOp(db, a, { op: 'serie_defense', uids: va.map(m => m.uid) });
  assert.equal(g.serie.div, 0);
  assert.equal(g.serie.defense.length, 6);
  await assert.rejects(matchOp(db, b, { op: 'serie_defense', uids: vb.slice(0, 3).map(m => m.uid) }), /precisa ter 6/);
  await matchOp(db, b, { op: 'serie_defense', uids: vb.map(m => m.uid) });
  const view = await matchOp(db, a, { op: 'serie_get' });
  assert.equal(view.table.length, 20, '2 treinadores + 18 CPU');
  assert.ok(view.table.every(r => r.bot === undefined), 'CPU não são marcados');
  assert.ok(view.table.find(r => r.id === b.id).defense.every(m => m.lvl === 50));
  const t = await matchOp(db, a, { op: 'serie_team', team: { name: 'Trovão FC', crest: '⚡', color: '#e04848' } });
  assert.equal(t.table.find(r => r.me).club.name, 'Trovão FC');
  await assert.rejects(matchOp(db, b, { op: 'serie_team', team: { name: 'trovão fc' } }), /Já existe/);

  const c = await matchOp(db, a, { op: 'serie_challenge', target: b.id });
  assert.equal(c.match.state.kind, 'duel');
  assert.ok(c.match.state.players[1].isBot, 'a defesa de B joga como CPU (B não precisa estar online)');
  await assert.rejects(matchOp(db, a, { op: 'serie_challenge', target: b.id }).then(r => { if (r.match.id === c.match.id) throw new Error('mesmo duelo'); }), /mesmo duelo/);
  const done = await playOut(db, c.match.id, a);
  assert.equal(done.status, 'finished');
  const sa = (await db.getProfile(a.id)).stats.serie, sb = (await db.getProfile(b.id)).stats.serie;
  assert.equal(sa.j, 1);
  assert.equal(sa.pts - (sa.start || 0), done.state.winner === a.id ? 3 : 0);
  assert.equal(sb.pts - (sb.start || 0), done.state.winner === a.id ? 0 : 1);
  assert.equal(sb.log[0].kind, 'def');
  assert.ok((await db.getMatch(c.match.id)).state.serieResult);

  await assert.rejects(matchOp(db, a, { op: 'serie_challenge', target: b.id }), /já enfrentou/);
  const bot = botsOf(0)[0];
  const cc = await matchOp(db, a, { op: 'serie_challenge', target: bot.id });
  assert.equal(cc.match.state.players[1].team[0].lvl, 32);
  assert.ok(cc.match.state.players[1].name.includes(bot.club.name));
  const res = await playOut(db, cc.match.id, a);
  const adj = (await db.getConfig('serie_bots')).adj[bot.id];
  assert.equal(adj.pts, res.state.winner === a.id ? 0 : 1, 'resultado real conta para o CPU');
  for (const cl of botsOf(0).slice(1, 4)) await playOut(db, (await matchOp(db, a, { op: 'serie_challenge', target: cl.id })).match.id, a);
  await assert.rejects(matchOp(db, a, { op: 'serie_challenge', target: botsOf(0)[5].id }), /ataques de hoje/);
});

test('Séries: virada da temporada sobe os primeiros, paga o pódio e o campeão da Série A ganha um Mítico', async () => {
  const { db, us: [a, b] } = await users(2);
  for (const u of [a, b]) await matchOp(db, u, { op: 'serie_defense', uids: (await db.getProfile(u.id)).vault.map(m => m.uid) });
  // A campeã da Série A em outubro, B última da Série B
  const set = async (u, s) => { const p = await db.getProfile(u.id); await db.updateProfileIf(u.id, p.rev || 0, { stats: { ...p.stats, serie: { ...p.stats.serie, ...s } } }); };
  await set(a, { season: '2026-10', div: 3, pts: 9999, v: 99 });
  await set(b, { season: '2026-10', div: 2, pts: 0 });
  const before = (await db.getProfile(a.id)).diamonds || 0;
  const va = (await db.getProfile(a.id)).vault.length;
  const g = await matchOp(db, a, { op: 'serie_get' });
  assert.equal(g.serie.div, 3, 'Série A não sobe');
  assert.equal(g.serie.prev.season, '2026-10');
  const pa = await db.getProfile(a.id);
  assert.equal((pa.diamonds || 0) - before, 30);
  assert.equal(pa.stats.trophies[0].pos, 1);
  assert.equal(pa.stats.trophies[0].div, 3);
  assert.equal(pa.stats.bag.master_ball, 1);
  assert.equal(pa.stats.bag.shiny_charm, 1);
  assert.equal(pa.stats.bag.tm, 3);
  assert.equal(pa.vault.length, va + 1);
  assert.ok(SPECIES[pa.vault.at(-1).sp].mythical);
  const gb = await matchOp(db, b, { op: 'serie_get' });
  assert.equal(gb.serie.div, 1, 'B caiu da Série B para a C');
  // fecha uma vez só
  const again = await closeSeason(db, '2026-10');
  assert.equal(again.podium[0].id, a.id);
  assert.equal(((await db.getProfile(a.id)).diamonds || 0) - before, 30);
  assert.equal((await db.getProfile(a.id)).stats.trophies.length, 1);
});

test('captura lendária: repele acima de 50%, 2 dados com teto de bônus, Mítico mais difícil; comuns iguais', async () => {
  const { captureMath, captureProb, startBattle, submitChoice } = await import('../shared/rules/battle.js');
  const { createMon } = await import('../shared/rules/monsters.js');
  const { maxHpOf } = await import('../shared/rules/monsters.js');
  const leg = createMon(createRng(1), 'zapdos', 40);
  const me = createMon(createRng(2), 'pikachu', 60);
  assert.equal(captureProb(captureMath(leg, me, 'rainbow_ball', null)), 0, 'HP cheio: repele');
  leg.hp = Math.floor(maxHpOf(leg) * 0.2);
  const ultra = captureProb(captureMath(leg, me, 'ultra_ball', null));
  const best = captureProb(captureMath(leg, me, 'rainbow_ball', { id: 'sleep' }));
  assert.ok(Math.abs(ultra - 6 / 36) < 1e-9, `Ultra + HP baixo ≈ 17% (${ultra})`);
  assert.ok(best <= 10 / 36 + 1e-9, `teto ≈ 28% (${best})`);
  const mew = createMon(createRng(3), 'mew', 40); mew.hp = Math.floor(maxHpOf(mew) * 0.2);
  assert.ok(captureProb(captureMath(mew, me, 'ultra_ball', null)) < ultra, 'Mítico mais difícil');
  const pid = createMon(createRng(4), 'pidgey', 5);
  assert.ok(captureProb(captureMath(pid, me, 'poke_ball', null)) >= 4 / 6, 'comuns continuam fáceis');
  // no motor: bola repelida com HP cheio, sem fugir
  const s = createMatch({ seed: 4, mode: 'local', now: 0, players: [{ id: 'a', name: 'A' }] });
  me.trust = true; s.players[0].team = [me]; s.players[0].items.ultra_ball = 3;
  const wild = createMon(createRng(5), 'raikou', 40); wild.wild = true;
  startBattle(s, { kind: 'wild', pid: 'a', foe: { kind: 'wild', mon: wild } });
  submitChoice(s, createRng(6), 'a', { move: 'ball', item: 'ultra_ball' });
  assert.ok(s.log.some(l => /repeliu/.test(l.msg)));
  assert.equal(s.players[0].items.ultra_ball, 2);
});

test('Séries: a tabela mostra a skin de treinador comprada na loja', async () => {
  const { db, us: [a] } = await users(1);
  const p = await db.getProfile(a.id);
  await db.updateProfileIf(a.id, p.rev || 0, { cosmetics: { owned: ['skin_leon'], equipped: { skin: 'skin_leon' } } });
  await matchOp(db, a, { op: 'serie_defense', uids: p.vault.map(m => m.uid) });
  const v = await matchOp(db, a, { op: 'serie_get' });
  assert.equal(v.table.find(r => r.me).skin, 'leon');
  const c = await matchOp(db, a, { op: 'serie_challenge', target: botsOf(0)[0].id });
  assert.equal(c.match.state.players[0].cosmetic.skin, 'leon');
});

test('salas no limbo: sala nova fecha a antiga, lobby parado some/encerra, último humano sair encerra a partida', async () => {
  const { db, us: [a, b] } = await users(2);
  const r1 = await matchOp(db, a, { op: 'create', name: 'Sala 1' });
  const r2 = await matchOp(db, a, { op: 'create', name: 'Sala 2' });
  assert.equal((await db.getMatch(r1.match.id)).status, 'abandoned', 'criar outra sala fecha a antiga');
  let list = await listRooms(db, b);
  assert.ok(list.rooms.some(r => r.id === r2.match.id));
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 20 * 60000; // 20 min sem ninguém na sala
    list = await listRooms(db, b);
    assert.ok(!list.rooms.some(r => r.id === r2.match.id), 'some da lista');
    assert.equal((await db.getMatch(r2.match.id)).status, 'lobby', 'ainda não encerrou');
    Date.now = () => realNow() + 3 * 3600000;
    await listRooms(db, b);
    assert.equal((await db.getMatch(r2.match.id)).status, 'abandoned', 'encerrou depois de 2 h');
  } finally { Date.now = realNow; }
  // partida com CPU: o único humano sai → encerra
  const s = await matchOp(db, b, { op: 'create', name: 'Com CPU' });
  await matchOp(db, b, { op: 'add_bot', matchId: s.match.id });
  await matchOp(db, b, { op: 'start', matchId: s.match.id });
  await matchOp(db, b, { op: 'leave', matchId: s.match.id });
  assert.ok(['abandoned', 'finished'].includes((await db.getMatch(s.match.id)).status), 'não fica em andamento');
  assert.ok(!(await listRooms(db, b)).mine.some(r => r.id === s.match.id));
});

test('Séries: pontos de largada, horário de Brasília, cron de fechamento e janela de resultado', async () => {
  const { seasonId: sid, dayId, lateStartPoints, seasonDays } = await import('../shared/data/series.js');
  assert.equal(sid(new Date('2026-12-01T02:00:00Z')), '2026-11', 'meia-noite de Brasília = 03:00 UTC');
  assert.equal(sid(new Date('2026-12-01T03:30:00Z')), '2026-12');
  assert.equal(dayId(new Date('2026-11-21T02:00:00Z')), '2026-11-20');
  assert.equal(lateStartPoints(0, '2026-11', new Date('2026-11-01T12:00:00Z')), 0, 'dia 1: largada zero');
  const late = lateStartPoints(0, '2026-11', new Date('2026-11-20T15:00:00Z'));
  const top = serieTable(0, [], '2026-11', new Date('2026-11-20T15:00:00Z'))[0].pts;
  assert.ok(late > 0 && top - late < 45, `largada ${late}, líder ${top}`);
  assert.equal(seasonDays('2026-11', new Date('2026-12-05T12:00:00Z')), 30);

  const { db, us: [a] } = await users(1);
  await matchOp(db, a, { op: 'serie_defense', uids: (await db.getProfile(a.id)).vault.map(m => m.uid) });
  const p = await db.getProfile(a.id);
  assert.equal(p.stats.serie.pts, p.stats.serie.start);
  // simula fim de outubro na Série D com muitos pontos
  await db.updateProfileIf(a.id, p.rev || 0, { stats: { ...p.stats, serie: { ...p.stats.serie, season: '2026-10', pts: 500, v: 99 } } });
  const { serieCron } = await import('../api/_lib/series.js');
  const r = await serieCron(db, new Date('2026-11-01T03:10:00Z'));
  assert.equal(r.closed, '2026-10');
  const after = (await db.getProfile(a.id)).stats.serie;
  assert.equal(after.season, '2026-11', 'o cron já virou o jogador');
  assert.equal(after.div, 1, 'subiu da D para a C');
  assert.equal(after.prev.pos, 1);
  assert.equal(after.prev.trophy, 1);
  assert.ok(after.prev.items.tm >= 1);
  assert.ok(after.team, 'o time continua');
  assert.equal(after.pts, 0, 'começa zerado (largada só para quem entra depois)');
  await matchOp(db, a, { op: 'serie_seen' });
  assert.equal((await db.getProfile(a.id)).stats.serie.prev.seen, true);
  assert.equal((await serieCron(db, new Date('2026-11-15T03:10:00Z'))).closed, null);
});

test('🎁 prêmio diário: sequência, reset ao perder dia, uma vez por dia; 📦 boxes da Coleção; 🛡️ defesa vista', async () => {
  const { dailyStatus, DAILY_REWARDS } = await import('../shared/data/daily.js');
  const d1 = new Date('2026-11-20T15:00:00Z'), d2 = new Date('2026-11-21T15:00:00Z'), d4 = new Date('2026-11-23T15:00:00Z');
  assert.equal(dailyStatus(null, d1).nextStreak, 1);
  assert.equal(dailyStatus({ last: '2026-11-20', streak: 3 }, d2).nextStreak, 4);
  assert.equal(dailyStatus({ last: '2026-11-20', streak: 3 }, d4).nextStreak, 1, 'perdeu dia: volta ao 1');
  assert.equal(dailyStatus({ last: '2026-11-20', streak: 7 }, d2).cycleDay, 1, 'depois do dia 7 recomeça o ciclo');
  assert.ok(dailyStatus({ last: '2026-11-20', streak: 27 }, d2).bonus.master_ball);
  assert.equal(DAILY_REWARDS.length, 7);

  const { db, us: [a] } = await users(1);
  const g0 = (await db.getProfile(a.id)).gold || 0;
  const r = await profileOp(db, a, { op: 'daily_claim' });
  assert.equal(r.claimed.streak, 1);
  assert.equal((r.profile.gold || 0) - g0, 300);
  await assert.rejects(profileOp(db, a, { op: 'daily_claim' }), /já pegou/);

  const vault = (await db.getProfile(a.id)).vault;
  const b = await profileOp(db, a, { op: 'boxes_set', boxes: [
    { id: 'b1', name: 'Fortes', icon: '⚔️', uids: [vault[0].uid, vault[1].uid, 'naoexiste'] },
    { id: 'b2', name: '<b>Água</b>', icon: 'xx', uids: [vault[1].uid, vault[2].uid] }] });
  const bx = b.profile.stats.boxes;
  assert.deepEqual(bx[0].uids, [vault[0].uid, vault[1].uid]);
  assert.deepEqual(bx[1].uids, [vault[2].uid], 'um Pokémon fica em uma box só');
  assert.equal(bx[1].icon, '📦');
  assert.ok(!bx[1].name.includes('<'));

  await matchOp(db, a, { op: 'serie_defense', uids: vault.map(m => m.uid) });
  await matchOp(db, a, { op: 'serie_def_seen' });
  assert.ok((await db.getProfile(a.id)).stats.serie.defSeen > 0);
});

test('♂/♀ sexo fixo pelo uid; 🌾 Fazenda: XP com o tempo (teto diário, Nv. 50), recursos, carinho, visitas e decoração só visual', async () => {
  const { genderFor, genderOf } = await import('../shared/data/gender.js');
  const { createMon } = await import('../shared/rules/monsters.js');
  assert.equal(genderFor('ditto', 'x'), 'N');
  assert.equal(genderFor('chansey', 'x'), 'F');
  assert.equal(genderFor('tauros', 'x'), 'M');
  assert.equal(genderFor('zapdos', 'x', SPECIES.zapdos), 'N');
  let males = 0;
  for (let i = 0; i < 400; i++) if (genderFor('charmander', 'u' + i) === 'M') males++;
  assert.ok(males > 310 && males < 380, `iniciais ~87,5% machos (${males}/400)`);
  const m = createMon(createRng(3), 'pikachu', 5);
  assert.ok(['M', 'F'].includes(m.gender));
  assert.equal(genderOf({ sp: m.sp, uid: m.uid }), m.gender, 'mesmo sexo calculado depois');

  const { tickFarm, newFarm, XP_DAY_CAP, slotsFor } = await import('../shared/data/farm.js');
  const f = newFarm(0);
  const mon = { uid: 'a', sp: 'squirtle', lvl: 10 };
  f.slots.push({ uid: 'a', biome: 'lago', happy: 100, t: 0 });
  tickFarm(f, new Map([['a', mon]]), () => ['water'], 2 * 3600000);
  assert.ok(f.slots[0].pxp > 110 && f.slots[0].pxp < 150, `2h no lago ≈ 30×1,5×~1,4×2 (${f.slots[0].pxp})`);
  assert.ok(f.slots[0].pres >= 1.4);
  tickFarm(f, new Map([['a', mon]]), () => ['water'], 200 * 3600000);
  assert.ok(f.slots[0].dayXp <= XP_DAY_CAP + 1e-6);
  assert.equal(slotsFor(1), 6); assert.equal(slotsFor(99), 20);

  const { db, us: [a, b] } = await users(2);
  const va = (await db.getProfile(a.id)).vault.slice().sort((x, y) => (x.sp === 'charizard' ? -1 : y.sp === 'charizard' ? 1 : 0));
  const placed = await profileOp(db, a, { op: 'farm_place', uid: va[0].uid });
  assert.equal(placed.farm.slots.length, 1);
  assert.equal(placed.farm.slots[0].biome, 'vulcao', 'Charizard vai pro vulcão');
  // simula 10 h passando
  const pr = await db.getProfile(a.id);
  pr.stats.farm.slots[0].t -= 10 * 3600000;
  await db.updateProfileIf(a.id, pr.rev || 0, { stats: pr.stats });
  const lvl0 = va[0].lvl;
  const col = await profileOp(db, a, { op: 'farm_collect' });
  assert.equal(lvl0, 60);
  assert.equal(col.collected.xp, 0, 'acima do Nv. 50 a Fazenda não sobe mais');
  assert.ok((col.farm.res.ember || 0) >= 5, 'Brasas do vulcão');
  const sold = await profileOp(db, a, { op: 'farm_sell', res: 'ember', qty: 2 });
  assert.equal(sold.gold, 28);
  await profileOp(db, a, { op: 'farm_care' });
  await assert.rejects(profileOp(db, a, { op: 'farm_care' }), /já receberam/);
  // Pokémon de nível baixo sobe de nível na Fazenda
  await adminOp(db, (await db.verifyToken('dev:admin@kanto.com')), { op: 'grant_mon', userId: a.id, species: 'charmander', level: 5 });
  const ch = (await db.getProfile(a.id)).vault.find(m => m.sp === 'charmander');
  await profileOp(db, a, { op: 'farm_place', uid: ch.uid });
  const p2 = await db.getProfile(a.id);
  p2.stats.farm.slots.find(s => s.uid === ch.uid).t -= 20 * 3600000;
  await db.updateProfileIf(a.id, p2.rev || 0, { stats: p2.stats });
  const c2 = await profileOp(db, a, { op: 'farm_collect' });
  assert.ok(c2.profile.vault.find(m => m.uid === ch.uid).lvl >= 12, 'subiu vários níveis (teto de 600 XP no dia)');
  // visitas
  const liked = await profileOp(db, b, { op: 'farm_like', userId: a.id });
  assert.equal(liked.farm.likes, 1);
  await assert.rejects(profileOp(db, b, { op: 'farm_like', userId: a.id }), /já curtiu/);
  await profileOp(db, b, { op: 'farm_help', userId: a.id });
  assert.equal((await profileOp(db, a, { op: 'farm_get' })).farm.visits.length, 2);
  // decoração: grátis entra, paga sem comprar não entra
  const d = await profileOp(db, a, { op: 'farm_decor', decor: [{ k: 'tree', x: 10, y: 10 }, { k: 'castle', x: 50, y: 50 }] });
  assert.deepEqual(d.farm.decor.map(x => x.k), ['tree']);
  assert.equal((await profileOp(db, a, { op: 'farm_top' })).top[0].id, a.id);
  await assert.rejects(profileOp(db, a, { op: 'train', uid: va[0].uid }), /Fazenda/);
});

test('🥚 Creche: compatibilidade, ovos com o tempo (limite/incubadora), herança, mutações e chocar na Coleção', async () => {
  const { canBreed, baseForm, makeEgg, MUTATION } = await import('../shared/data/daycare.js');
  const M = (sp, g, extra = {}) => ({ uid: sp + g + Math.random(), sp, gender: g, lvl: 30, iv: { hp: 31, atk: 31, spe: 31 }, nature: 'adamant', moves: ['fire_q', 'fire_x'], ...extra });
  assert.equal(baseForm('charizard'), 'charmander');
  assert.ok(canBreed(M('charizard', 'F'), M('charmander', 'M')).ok);
  assert.match(canBreed(M('charizard', 'M'), M('charmander', 'M')).why, /macho/);
  assert.match(canBreed(M('pikachu', 'F'), M('squirtle', 'M')).why, /Não combinam/);
  assert.ok(canBreed(M('arcanine', 'F'), M('charmeleon', 'M')).ok, 'tipo em comum');
  assert.ok(canBreed(M('magnemite', 'N'), M('ditto', 'N')).ok, 'sem sexo só com Ditto');
  assert.match(canBreed(M('ditto', 'N'), M('ditto', 'N')).why, /Dois Ditto/);
  assert.match(canBreed(M('zapdos', 'N'), M('ditto', 'N')).why, /Lendários/);
  const rng = createRng(7);
  const e = makeEgg(rng, M('charizard', 'F'), M('arcanine', 'M'), { natureFrom: 'mother' });
  assert.equal(e.sp, 'charmander');
  assert.equal(e.nature, 'adamant');
  assert.ok(['hp', 'atk', 'spe'].filter(k => e.iv[k] === 31).length >= 2, 'herdou 2 potenciais perfeitos');
  let shiny = 0, perfect = 0;
  const r2 = createRng(99);
  for (let i = 0; i < 4000; i++) { const x = makeEgg(r2, M('pidgey', 'F', { iv: { hp: 0, atk: 0, spe: 0 } }), M('pidgey', 'M', { iv: { hp: 0, atk: 0, spe: 0 } })); if (x.shiny) shiny++; if (x.mutations.includes('perfect')) perfect++; }
  assert.ok(shiny > 10 && shiny < 60, `shiny ~1/150 (${shiny}/4000)`);
  assert.ok(perfect > 25 && perfect < 80, `perfeito ~1/80 (${perfect}/4000)`);

  const { db, us: [a] } = await users(1);
  const admin = await db.verifyToken('dev:admin@kanto.com');
  await adminOp(db, admin, { op: 'grant_mon', userId: a.id, species: 'ditto', level: 20 });
  const v = (await db.getProfile(a.id)).vault;
  const ditto = v.find(m => m.sp === 'ditto'), pika = v.find(m => m.sp === 'pikachu');
  const set = await profileOp(db, a, { op: 'farm_daycare', a: ditto.uid, b: pika.uid });
  assert.ok(set.farm.daycare.nextEggIn > 5 * 3600000);
  // passa 30 h: no máximo 3 ovos (incubadora), não 5
  const p = await db.getProfile(a.id);
  p.stats.farm.daycare.since -= 30 * 3600000;
  await db.updateProfileIf(a.id, p.rev || 0, { stats: p.stats });
  const g = await profileOp(db, a, { op: 'farm_get' });
  assert.ok(g.farm.eggs.length >= 1 && g.farm.eggs.length <= 3);
  const egg = g.farm.eggs[0];
  await assert.rejects(profileOp(db, a, { op: 'farm_hatch', id: 'nada' }), /não encontrado/);
  void egg;
  await profileOp(db, a, { op: 'farm_daycare', a: ditto.uid, b: pika.uid }); // grava a Fazenda com os ovos (mesmo casal mantém o relógio)
  const p3 = await db.getProfile(a.id);
  assert.ok(p3.stats.farm.eggs.length >= 1);
  p3.stats.farm.eggs[0].readyAt = Date.now() - 1000;
  await db.updateProfileIf(a.id, p3.rev || 0, { stats: p3.stats });
  const eid = (await db.getProfile(a.id)).stats.farm.eggs[0].id;
  const h = await profileOp(db, a, { op: 'farm_hatch', id: eid });
  assert.equal(h.baby.sp, 'pichu', 'nasce na forma básica');
  assert.equal(h.baby.lvl, 5);
  assert.ok(h.baby.bred);
  assert.ok(h.profile.vault.some(m => m.uid === h.baby.uid));
  assert.ok(['M', 'F'].includes(h.baby.gender));
});

test('🔨 Oficina: receitas com tempo e recursos de vários biomas, nível de Artesão, bancadas, pedidos do dia, itens da Fazenda e limite semanal', async () => {
  const { RECIPES, dailyOrders, artisanOf, benchesFor } = await import('../shared/data/workshop.js');
  assert.equal(benchesFor(1), 1); assert.equal(benchesFor(4), 2); assert.equal(benchesFor(7), 3); assert.equal(benchesFor(30), 3);
  assert.equal(artisanOf(0).lvl, 1); assert.equal(artisanOf(3500).lvl, 4);
  assert.deepEqual(dailyOrders('u1', '2026-11-21'), dailyOrders('u1', '2026-11-21'), 'pedidos fixos no dia');
  assert.ok(Object.keys(RECIPES.master.cost).length >= 7, 'Master Ball pede todos os recursos');

  const { db, us: [a] } = await users(1);
  const give = async (res, extra = {}) => { const p = await db.getProfile(a.id); const farm = { ...(p.stats.farm || { lvl: 1, xp: 0, slots: [], res: {}, decor: [] }), res, ...extra }; await db.updateProfileIf(a.id, p.rev || 0, { stats: { ...p.stats, farm } }); };
  await assert.rejects(profileOp(db, a, { op: 'farm_craft', recipe: 'poke5' }), /Faltam recursos/);
  await give({ berry: 50, ore: 50, pearl: 50, ember: 50, crystal: 50, essence: 50, feather: 50 });
  await assert.rejects(profileOp(db, a, { op: 'farm_craft', recipe: 'tm' }), /Mestre Artesão/);
  const c = await profileOp(db, a, { op: 'farm_craft', recipe: 'poke5' });
  assert.equal(c.farm.workshop.jobs.length, 1);
  assert.equal(c.farm.res.berry, 47);
  await assert.rejects(profileOp(db, a, { op: 'farm_craft', recipe: 'ration' }), /bancadas estão ocupadas/);
  await assert.rejects(profileOp(db, a, { op: 'farm_claim', id: c.farm.workshop.jobs[0].id }), /Ainda fabricando/);
  let p = await db.getProfile(a.id); p.stats.farm.jobs[0].done = Date.now() - 1; await db.updateProfileIf(a.id, p.rev || 0, { stats: p.stats });
  const before = (await db.getProfile(a.id)).stats.bag?.poke_ball || 0;
  const got = await profileOp(db, a, { op: 'farm_claim', id: c.farm.workshop.jobs[0].id });
  assert.equal((got.profile.stats.bag.poke_ball || 0) - before, 5);
  assert.equal(got.farm.workshop.axp, RECIPES.poke5.xp);
  // gold insuficiente devolve tudo
  const g0 = (await db.getProfile(a.id)).gold || 0;
  await db.walletAdd(a.id, 0, -g0);
  await assert.rejects(profileOp(db, a, { op: 'farm_craft', recipe: 'great3' }), /Ouro insuficiente/);
  assert.equal((await db.getProfile(a.id)).stats.farm.res.ore, 48, 'recursos não foram gastos');
  // pedido do dia
  const o = got.farm.workshop.orders[0];
  const del = await profileOp(db, a, { op: 'farm_order', idx: 0 });
  assert.equal(del.reward.gold, o.gold);
  await assert.rejects(profileOp(db, a, { op: 'farm_order', idx: 0 }), /já entregue/);
  // itens da Fazenda: Doce Raro e Fertilizante
  await give({ ...((await db.getProfile(a.id)).stats.farm.res) }, { items: { candy: 1, fert: 1, incense: 1 }, axp: 5000 });
  await adminOp(db, await db.verifyToken('dev:admin@kanto.com'), { op: 'grant_mon', userId: a.id, species: 'rattata', level: 19 });
  const mon = (await db.getProfile(a.id)).vault.find(m => m.sp === 'rattata');
  const lv = mon.lvl;
  const u = await profileOp(db, a, { op: 'farm_use', item: 'candy', uid: mon.uid });
  const after = u.profile.vault.find(m => m.uid === mon.uid);
  assert.equal(after.lvl, lv + 1);
  assert.equal(after.sp, 'raticate', 'Doce Raro também evolui');
  const f = await profileOp(db, a, { op: 'farm_use', item: 'fert' });
  assert.ok(f.farm.workshop.fert > Date.now());
  const inc = await profileOp(db, a, { op: 'farm_use', item: 'incense' });
  assert.equal(inc.farm.workshop.incense, 3);
  // Grão-Mestre: Master Ball 1×/semana
  await give({ berry: 99, ore: 99, pearl: 99, ember: 99, crystal: 99, essence: 99, feather: 99 }, { lvl: 7, axp: 5000, jobs: [] });
  await db.walletAdd(a.id, 0, 50000);
  await profileOp(db, a, { op: 'farm_craft', recipe: 'master' });
  await assert.rejects(profileOp(db, a, { op: 'farm_craft', recipe: 'master' }), /1 vez por semana/);
  // decoração exclusiva
  await profileOp(db, a, { op: 'farm_craft', recipe: 'statue' });
  p = await db.getProfile(a.id); const sj = p.stats.farm.jobs.find(j => j.recipe === 'statue'); sj.done = 0; await db.updateProfileIf(a.id, p.rev || 0, { stats: p.stats });
  const st = await profileOp(db, a, { op: 'farm_claim', id: sj.id });
  assert.ok(st.farm.ownedDecor.includes('statue'));
  const dd = await profileOp(db, a, { op: 'farm_decor', decor: [{ k: 'statue', x: 30, y: 30 }] });
  assert.equal(dd.farm.decor[0].k, 'statue');
});

test('🏡 Casinha do Companheiro: felicidade cai mais devagar, +XP no tipo dele e laço ao cuidar', async () => {
  const { tickFarm, newFarm } = await import('../shared/data/farm.js');
  const mk = () => { const f = newFarm(0); f.slots.push({ uid: 'a', biome: 'lago', happy: 100, t: 0 }); return f; };
  const mon = new Map([['a', { uid: 'a', sp: 'squirtle', lvl: 10 }]]);
  const f1 = tickFarm(mk(), mon, () => ['water'], 10 * 3600000);
  const f2 = tickFarm(mk(), mon, () => ['water'], 10 * 3600000, { decayMult: 0.6, boostTypes: ['water'] });
  const f3 = tickFarm(mk(), mon, () => ['water'], 3 * 3600000), f4 = tickFarm(mk(), mon, () => ['water'], 3 * 3600000, { boostTypes: ['water'] });
  assert.ok(f2.slots[0].happy > f1.slots[0].happy, 'cai mais devagar');
  assert.ok(f4.slots[0].pxp > f3.slots[0].pxp * 1.15, 'treina os do tipo dele');

  const { db, us: [a] } = await users(1);
  const p = await db.getProfile(a.id);
  await db.updateProfileIf(a.id, p.rev || 0, { stats: { ...p.stats, companions: ['misty'], companion: 'misty' } });
  await profileOp(db, a, { op: 'farm_place', uid: p.vault[0].uid });
  const h = await profileOp(db, a, { op: 'farm_house', x: 30, y: 40 });
  assert.equal(h.farm.companion.id, 'misty');
  assert.deepEqual(h.farm.house, { x: 30, y: 40 });
  const c = await profileOp(db, a, { op: 'farm_care' });
  assert.equal(c.bond, 3);
  assert.equal((await db.getProfile(a.id)).stats.companionBond.misty, 3);
  const r = await profileOp(db, a, { op: 'farm_house', remove: true });
  assert.equal(r.farm.house, null);
  assert.equal(r.farm.companion, null);
});

// ------------------------------------------------------------------ v30 · 💎 Mega Evolução
test('💎 Megas: 68 formas fora da Pokédex, com pedra, fragmento e status maiores', async () => {
  const { MEGAS, MEGA_KEYS, megaFor } = await import('../shared/data/megas.js');
  const { SPECIES_LIST } = await import('../shared/data/pokemon.js');
  const { ITEMS, isKeepable, bringLimit } = await import('../shared/data/items.js');
  const { computeStats } = await import('../shared/rules/monsters.js');
  assert.equal(MEGA_KEYS.length, 68);
  assert.deepEqual(SPECIES.mega_clefable.types, ['fairy', 'flying']);
  assert.ok(!SPECIES_LIST.some(s => s.mega), 'Megas não entram na Pokédex/selvagens');
  assert.deepEqual(SPECIES.mega_charizard_x.types, ['fire', 'dragon']);
  assert.equal(SPECIES.mega_gyarados.types[1], 'dark');
  for (const k of MEGA_KEYS) {
    assert.ok(ITEMS[`ms_${k}`] && ITEMS[`mf_${k}`], k);
    assert.ok(isKeepable(`ms_${k}`) && bringLimit(`ms_${k}`) === 0, 'fica na conta, não vai para a partida');
  }
  const a = computeStats('gengar', 40), b = computeStats('mega_gengar', 40);
  assert.ok(b.atk > a.atk && b.spe > a.spe);
  assert.equal(megaFor({ sp: 'gengar', held: 'ms_gengar' }).key, 'gengar');
  assert.equal(megaFor({ sp: 'gengar', held: 'ms_alakazam' }), null);
  assert.equal(MEGAS.charizard_y.base, 'charizard');
});

function megaDuel({ megas = true, key = true, held = 'ms_gengar' } = {}) {
  return createMatch({ kind: 'duel', seed: 9, mode: 'online', now: 0, options: { megas },
    players: [
      { id: 'a', name: 'A', megaKey: key, teamMons: [{ uid: 'g1', sp: 'gengar', lvl: 40, held }, { uid: 'g2', sp: 'pikachu', lvl: 40 }] },
      { id: 'b', name: 'B', teamMons: [{ uid: 'h1', sp: 'snorlax', lvl: 40 }] }] });
}

test('💎 Mega na batalha: ação grátis, 1 por batalha, precisa de Bracelete + pedra + sala liberada', async () => {
  const { applyAction } = await import('../shared/engine.js');
  let s = megaDuel();
  const r = applyAction(s, 'a', { type: 'battle', move: 'mega' }, { now: 0 });
  assert.equal(r.error, undefined, r.error);
  s = r.state;
  const g = s.players[0].team[0];
  assert.equal(g.sp, 'mega_gengar');
  assert.equal(g.tf.sp, 'gengar');
  assert.equal(s.battle.round, 0, 'não gastou a rodada');
  assert.ok(s.fx.some(f => f.k === 'mega'));
  assert.match(applyAction(s, 'a', { type: 'battle', move: 'mega' }, { now: 0 }).error, /1 vez/);
  assert.match(applyAction(megaDuel({ megas: false }), 'a', { type: 'battle', move: 'mega' }, { now: 0 }).error, /não está liberada/);
  assert.match(applyAction(megaDuel({ key: false }), 'a', { type: 'battle', move: 'mega' }, { now: 0 }).error, /Bracelete/);
  assert.match(applyAction(megaDuel({ held: null }), 'a', { type: 'battle', move: 'mega' }, { now: 0 }).error, /Megapedra/);
});

test('💎 Mega Raid: fragmentos para quem vence; Bracelete só cai lá e vira flag da conta', async () => {
  const { grantMegaRewards, makeMegaBoss } = await import('../shared/rules/mega.js');
  const { MEGAS } = await import('../shared/data/megas.js');
  const { createMon } = await import('../shared/rules/monsters.js');
  const s = createMatch({ seed: 3, mode: 'online', now: 0, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  const p = s.players[0];
  const rng = { int: (x, y) => y, chance: () => true };
  grantMegaRewards(s, rng, p, 'gengar', true);
  assert.equal(p.items.mf_gengar, 3);
  assert.equal(p.items.mega_bracelet, 1);
  assert.equal(p.megaKey, true, 'já pode usar na partida');
  grantMegaRewards(s, rng, p, 'gengar', true);
  assert.equal(p.items.mega_bracelet, 1, 'não cai outro');
  const boss = makeMegaBoss(createMon(createRng(1), 'gengar', 30), MEGAS.gengar);
  assert.equal(boss.sp, 'mega_gengar');
  assert.equal(boss.megaBoss, 'gengar');
});

test('💎 conta: segurar/tirar Megapedra, Oficina fabrica a pedra com 10 fragmentos, Liga A/B libera Megas', async () => {
  const { db, admin, us: [a] } = await users(1);
  let p = await db.getProfile(a.id);
  const ch = p.vault.find(m => m.sp === 'charizard');
  await adminOp(db, admin, { op: 'grant_item', userId: a.id, item: 'ms_charizard_x', qty: 1 });
  await adminOp(db, admin, { op: 'grant_item', userId: a.id, item: 'mega_bracelet' });
  await assert.rejects(profileOp(db, a, { op: 'hold_stone', uid: p.vault.find(m => m.sp === 'gengar').uid, item: 'ms_charizard_x' }), /só funciona/);
  let r = await profileOp(db, a, { op: 'hold_stone', uid: ch.uid, item: 'ms_charizard_x' });
  assert.equal(r.profile.vault.find(m => m.uid === ch.uid).held, 'ms_charizard_x');
  assert.equal(r.profile.stats.bag.ms_charizard_x, undefined);
  assert.equal(r.profile.stats.megaBracelet, true);
  r = await profileOp(db, a, { op: 'hold_stone', uid: ch.uid, item: null });
  assert.equal(r.profile.vault.find(m => m.uid === ch.uid).held, undefined);
  assert.equal(r.profile.stats.bag.ms_charizard_x, 1);
  // Oficina: Megapedra precisa de Grão-Mestre + 10 fragmentos
  p = await db.getProfile(a.id);
  await db.updateProfileIf(a.id, p.rev || 0, { gold: 99999, stats: { ...p.stats, bag: { ...p.stats.bag, mf_gengar: 9 }, farm: { ...(p.stats.farm || {}), axp: 999999, res: { crystal: 50, essence: 50 } } } });
  await assert.rejects(profileOp(db, a, { op: 'farm_craft', recipe: 'megastone', mega: 'gengar' }), /Faltam fragmentos/);
  p = await db.getProfile(a.id);
  await db.updateProfileIf(a.id, p.rev || 0, { stats: { ...p.stats, bag: { ...p.stats.bag, mf_gengar: 12 } } });
  const c = await profileOp(db, a, { op: 'farm_craft', recipe: 'megastone', mega: 'gengar' });
  assert.equal(c.profile.stats.bag.mf_gengar, 2);
  const job = c.farm.workshop.jobs.find(j => j.recipe === 'megastone');
  assert.equal(job.mega, 'gengar');
  p = await db.getProfile(a.id);
  await db.updateProfileIf(a.id, p.rev || 0, { stats: { ...p.stats, farm: { ...p.stats.farm, jobs: p.stats.farm.jobs.map(j => ({ ...j, done: 1 })) } } });
  const got = await profileOp(db, a, { op: 'farm_claim', id: job.id });
  assert.equal(got.profile.stats.bag.ms_gengar, 1);
  // Liga: CPU das Séries A/B levam Megapedra
  const { MEGA_SERIE } = await import('../shared/data/series.js');
  assert.equal(MEGA_SERIE, 2);
  assert.ok(botsOf(3).some(b => botTeam(b).some(m => m.held)));
  assert.ok(!botsOf(1).some(b => botTeam(b).some(m => m.held)));
});

test('💎 sala: Megas só no modo Coleção; o treino com time leva o Bracelete para a partida', async () => {
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'grant_item', userId: a.id, item: 'mega_bracelet' });
  const bal = await matchOp(db, a, { op: 'create', mode: 'balanced', megas: true });
  assert.equal(bal.match.options.megas, false);
  const col = await matchOp(db, a, { op: 'create', mode: 'collection', megas: true });
  assert.equal(col.match.options.megas, true);
  const p = await db.getProfile(a.id);
  const solo = await matchOp(db, a, { op: 'solo', bots: 1, megas: true, teamUids: p.vault.slice(0, 2).map(m => m.uid) });
  assert.equal(solo.match.state.options.megas, true);
  assert.equal(solo.match.state.players.find(x => x.id === a.id).megaKey, true);
});

test('💎 Pokédex Mega: quem evolui registra (normal e shiny), o adversário vê; a conta guarda', async () => {
  const { applyAction } = await import('../shared/engine.js');
  const { mergeMegaDex } = await import('../api/_lib/core.js');
  const s0 = megaDuel();
  s0.players[0].team[0].shiny = true;
  const s = applyAction(s0, 'a', { type: 'battle', move: 'mega' }, { now: 0 }).state;
  assert.deepEqual(s.players[0].megaDex, { seen: ['gengar'], used: ['gengar'], shinySeen: ['gengar'], shinyUsed: ['gengar'] });
  assert.deepEqual(s.players[1].megaDex.used, []);
  assert.deepEqual(s.players[1].megaDex.seen, ['gengar']);
  assert.ok(!s.players[0].seen.includes('mega_gengar'), 'a Pokédex normal não ganha a forma Mega');
  assert.equal(mergeMegaDex({ seen: ['gengar'], used: ['gengar'] }, { seen: ['gengar'] }), null);
  assert.deepEqual(mergeMegaDex(null, s.players[0].megaDex).shinyUsed, ['gengar']);
});

test('💎 Mega não conta como evolução (sem animação de evoluir nem missão) — nem ao voltar', async () => {
  const { applyAction } = await import('../shared/engine.js');
  let s = applyAction(megaDuel(), 'a', { type: 'battle', move: 'mega' }, { now: 0 }).state;
  assert.ok(!s.fx.some(f => f.k === 'evolve'));
  // termina a batalha: volta à forma normal sem 'evolve'
  for (let i = 0; i < 200 && s.battle; i++) {
    let moved = false;
    for (const who of ['a', 'b']) {
      const si = s.battle?.sides.findIndex(x => x.pid === who);
      if (si < 0 || !s.battle) continue;
      const team = s.players.find(p => p.id === who).team;
      const a = s.battle.mustSwitch[si] ? { type: 'battle', move: 'switch', index: team.findIndex(m => m.hp > 0) } : { type: 'battle', move: 'attack' };
      const r = applyAction(s, who, a, { now: 0 });
      if (!r.error) { s = r.state; moved = true; assert.ok(!s.fx.some(f => f.k === 'evolve'), 'sem evolução falsa'); }
    }
    if (!moved) break;
  }
  assert.equal(s.battle, null);
  assert.equal(s.players[0].team[0].sp, 'gengar');
});

test('➕ recém-capturado: escolher equipe ou PC na hora (troca com alguém da equipe)', async () => {
  const { applyAction } = await import('../shared/engine.js');
  const { deliverCapture } = await import('../shared/rules/battle.js');
  const { createMon } = await import('../shared/rules/monsters.js');
  let s = createMatch({ seed: 5, mode: 'online', now: 0, players: [{ id: 'a', name: 'A', starter: 'bulbasaur' }, { id: 'b', name: 'B', starter: 'charmander' }] });
  const p = s.players[0];
  const rng = createRng(2);
  while (p.team.length < 6) p.team.push(createMon(rng, 'rattata', 5));
  const novo = createMon(rng, 'pikachu', 10);
  deliverCapture(s, 'a', novo, 'poke_ball');
  assert.equal(p.lastPlaced.where, 'box');
  // fora da vez e fora da cidade também pode (é só organizar o recém-capturado)
  s = applyAction(s, 'a', { type: 'place', op: 'to_team', swap: 3 }, { now: 0 }).state;
  assert.equal(s.players[0].team[3].sp, 'pikachu');
  assert.equal(s.players[0].box.at(-1).sp, 'rattata');
  assert.equal(s.players[0].lastPlaced, undefined);
  assert.match(applyAction(s, 'a', { type: 'place', op: 'to_box' }, { now: 0 }).error, /Nada para organizar/);
  // na equipe → mandar para o PC
  const s2 = createMatch({ seed: 6, mode: 'online', now: 0, players: [{ id: 'a', name: 'A', starter: 'bulbasaur' }, { id: 'b', name: 'B', starter: 'charmander' }] });
  deliverCapture(s2, 'a', createMon(rng, 'eevee', 8), 'poke_ball');
  const r = applyAction(s2, 'a', { type: 'place', op: 'to_box' }, { now: 0 }).state;
  assert.equal(r.players[0].box.at(-1).sp, 'eevee');
  assert.equal(r.players[0].team.length, 1);
});
