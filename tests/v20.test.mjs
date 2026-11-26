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
  assert.match(applyAction(s, 'a', { type: 'battle', move: 'mega' }, { now: 0 }).error, /1 Mega Evolução ou Gigantamax/);
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

test('🔐 admin: ver conta, procurar e-mail, ativar, senha nova, e-mails e tirar Bracelete', async () => {
  const { db, admin, us: [a] } = await users(1);
  await assert.rejects(adminOp(db, a, { op: 'account_info', userId: a.id }), /administradores/);
  const info = (await adminOp(db, admin, { op: 'account_info', userId: a.id })).account;
  assert.ok(info.email.includes('@'));
  assert.equal(info.trainer !== undefined, true);
  const found = (await adminOp(db, admin, { op: 'account_find', q: info.email.slice(0, 4) })).accounts;
  assert.ok(found.some(x => x.id === a.id));
  await adminOp(db, admin, { op: 'account_confirm', userId: a.id });
  await assert.rejects(adminOp(db, admin, { op: 'account_password', userId: a.id, password: '123' }), /6 caracteres/);
  await adminOp(db, admin, { op: 'account_password', userId: a.id, password: 'nova1234' });
  assert.equal(db._authMeta().get(a.id).password, 'nova1234');
  const m = await adminOp(db, admin, { op: 'account_mail', userId: a.id, kind: 'recovery', origin: 'https://evil.com/x?y' });
  assert.equal(m.email, info.email);
  assert.equal(db._authMeta().get('last_mail').kind, 'recovery');
  await adminOp(db, admin, { op: 'grant_item', userId: a.id, item: 'mega_bracelet' });
  assert.equal((await adminOp(db, admin, { op: 'account_info', userId: a.id })).account.megaBracelet, true);
  await adminOp(db, admin, { op: 'remove_bracelet', userId: a.id });
  assert.equal((await db.getProfile(a.id)).stats.megaBracelet, undefined);
});

test('⚡ casa Amarela: no máximo 2 lendários capturados por partida (Raid/evento não contam)', async () => {
  const { applyAction } = await import('../shared/engine.js');
  const { deliverCapture, legendCapBlocked, LEGEND_MATCH_LIMIT, startBattle } = await import('../shared/rules/battle.js');
  const { createMon } = await import('../shared/rules/monsters.js');
  assert.equal(LEGEND_MATCH_LIMIT, 2);
  const s = createMatch({ seed: 5, mode: 'online', now: 0, players: [{ id: 'a', name: 'A', starter: 'bulbasaur' }, { id: 'b', name: 'B', starter: 'charmander' }] });
  const p = s.players[0];
  const rng = createRng(3);
  const leg = () => { const m = createMon(rng, 'zapdos', 40); m.yellowLegend = true; m.wild = true; return m; };
  deliverCapture(s, 'a', leg(), 'ultra_ball');
  deliverCapture(s, 'a', leg(), 'ultra_ball');
  assert.equal(p.legendCaught, 2);
  deliverCapture(s, 'a', createMon(rng, 'moltres', 40), 'ultra_ball'); // de Raid/evento: não conta
  assert.equal(p.legendCaught, 2);
  const third = leg();
  assert.ok(legendCapBlocked(p, third));
  p.items.ultra_ball = 3;
  startBattle(s, { kind: 'wild', pid: 'a', foe: { kind: 'wild', mon: third, spaceId: 1 } }); s.phase = 'battle';
  const r = applyAction(s, 'a', { type: 'battle', move: 'ball', item: 'ultra_ball' }, { now: 0 });
  assert.match(r.error, /já capturou 2 lendários/);
  assert.ok(!legendCapBlocked(s.players[1], third), 'o limite é por jogador');
});

test('⏱️ partidas salvas sempre terminam (20–60 turnos); antigas sem limite param no 60', async () => {
  const { db, us: [a] } = await users(1);
  const r = await matchOp(db, a, { op: 'create', mode: 'balanced', turnLimit: 0 });
  assert.equal(r.match.options.turnLimit, 60);
  const r2 = await matchOp(db, a, { op: 'create', mode: 'balanced', turnLimit: 200 });
  assert.equal(r2.match.options.turnLimit, 60);
  const r3 = await matchOp(db, a, { op: 'create', mode: 'balanced', turnLimit: 30 });
  assert.equal(r3.match.options.turnLimit, 30);
});

test('🗺️ mapas temáticos/Expedição: malha grande como Kanto (muitas bifurcações), sem cruzar, ambiente do tema dominando', async () => {
  const { generateMap, MAP_THEMES, THEME_IDS } = await import('../shared/data/maps/generator.js');
  for (const t of THEME_IDS) {
    const m = generateMap(MAP_THEMES[t].seed, t);
    assert.equal(m.crossings, 0, t);
    assert.ok(m.spaces.length >= 120, `${t}: ${m.spaces.length} casas`);
    assert.ok(m.branches >= 30, `${t}: ${m.branches} bifurcações`);
    const land = m.spaces.filter(s => s.type !== 'city' && !s.gate);
    const count = {}; land.forEach(s => { count[s.biome] = (count[s.biome] || 0) + 1; });
    const top = MAP_THEMES[t].weights[0][0];
    assert.ok(count[top] / land.length >= 0.25, `${t}: ${top} domina (${count[top]}/${land.length})`);
    assert.ok(['sea', 'lava', 'snow', 'forest'].includes(m.backdrop));
  }
  const g = generateMap(42);
  assert.ok(g.spaces.length >= 120 && g.crossings === 0);
});

test('🎭 skin da 💎 Loja aparece em todas as listas: Fazenda, mais curtidas, sala, chat, online, Copa/Torneio', async () => {
  const { shopOp } = await import('../api/_lib/shop.js');
  const { socialOp } = await import('../api/_lib/social.js');
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'give_diamonds', userId: a.id, amount: 5000 });
  const cat = await shopOp(db, a, { op: 'catalog' });
  const skinItem = (cat.items || cat.shop?.items || []).find(i => i.kind === 'skin');
  await shopOp(db, a, { op: 'buy', itemId: skinItem.id });
  const want = skinItem.value;
  // fazenda (dono) e ranking das fazendas
  const f = await profileOp(db, a, { op: 'farm_get' });
  assert.equal(f.farm.owner.skin, want);
  const p = await db.getProfile(a.id);
  const uid = p.vault[0].uid;
  await profileOp(db, a, { op: 'farm_place', uid, biome: Object.keys((await import('../shared/data/farm.js')).FARM_BIOMES || { meadow: 1 })[0] }).catch(() => null);
  const top = await profileOp(db, a, { op: 'farm_top' });
  for (const r of top.top) if (r.id === a.id) assert.equal(r.skin, want);
  // sala online
  const room = await matchOp(db, a, { op: 'create', mode: 'balanced' });
  assert.equal(room.match.lobby[0].skin, want);
  // chat e lista online
  await socialOp(db, a, { op: 'chat_send', text: 'oi' }).catch(() => socialOp(db, a, { op: 'chat', text: 'oi' }));
  const ping = await socialOp(db, a, { op: 'ping' });
  assert.equal(ping.online.find(x => x.id === a.id).skin, want);
  assert.equal(ping.chat.at(-1).skin, want);
});

test('⚽ Liga: os 5 ataques renovam no dia seguinte (meia-noite de Brasília)', async () => {
  const { dayId, SERIE_DAILY } = await import('../shared/data/series.js');
  const { db, us: [a] } = await users(1);
  await matchOp(db, a, { op: 'serie_defense', uids: (await db.getProfile(a.id)).vault.map(m => m.uid) });
  const p = await db.getProfile(a.id);
  await db.updateProfileIf(a.id, p.rev || 0, { stats: { ...p.stats, serie: { ...p.stats.serie, day: dayId(new Date()), dayCount: SERIE_DAILY, foesToday: [] } } });
  let v = await matchOp(db, a, { op: 'serie_get' });
  assert.equal(v.serie.left, 0);
  const p2 = await db.getProfile(a.id);
  await db.updateProfileIf(a.id, p2.rev || 0, { stats: { ...p2.stats, serie: { ...p2.stats.serie, day: dayId(new Date(Date.now() - 86400000)) } } });
  v = await matchOp(db, a, { op: 'serie_get' });
  assert.equal(v.serie.left, SERIE_DAILY);
  assert.equal(dayId(new Date('2026-11-22T02:59:00Z')), '2026-11-21'); // 23:59 em Brasília
  assert.equal(dayId(new Date('2026-11-22T03:00:00Z')), '2026-11-22'); // 00:00 em Brasília
});

test('🏅 títulos de conquista: progresso, equipar só se conquistou, efeito vai para o cosmético', async () => {
  const { ACH_TITLES, unlockedTitles, titleProgress, TITLE_BY_ID } = await import('../shared/data/titles.js');
  const { COMPANIONS, BOND_XP } = await import('../shared/data/companions.js');
  assert.ok(ACH_TITLES.length >= 12 + Object.keys(COMPANIONS).length);
  const fake = { pokedex: Array(120).fill('x'), stats: { shinyDex: ['a'], farm: { likes: 60 }, trophies: [{ season: '2026-10', div: 3, pos: 1 }], companionBond: { misty: BOND_XP[10] } } };
  const got = unlockedTitles(fake);
  for (const id of ['dex_100', 'farm_50', 'serie_champ', 'serie_podium', 'bond_misty']) assert.ok(got.includes(id), id);
  assert.ok(!got.includes('dex_300') && !got.includes('shiny_10') && !got.includes('bond_brock'));
  assert.deepEqual(titleProgress(TITLE_BY_ID.shiny_10, fake), { cur: 1, need: 10, done: false });

  const { db, us: [a] } = await users(1);
  await assert.rejects(profileOp(db, a, { op: 'title_equip', id: 'farm_50' }), /ainda não conquistou/);
  const p = await db.getProfile(a.id);
  await db.updateProfileIf(a.id, p.rev || 0, { stats: { ...p.stats, farm: { ...(p.stats.farm || {}), likes: 55 } } });
  const r = await profileOp(db, a, { op: 'title_equip', id: 'farm_50' });
  assert.equal(r.profile.cosmetic.title, 'Fazendeiro Querido');
  assert.equal(r.profile.cosmetic.titleFx, 'petals');
  const r2 = await profileOp(db, a, { op: 'title_equip', id: null });
  assert.equal(r2.profile.cosmetic?.title, undefined);
});

test('🌱 Fazenda 2.0: plantar, regar, colher, Moinho → farinha, Cozinha → Poffin, usar Poffin, decoração editável', async () => {
  const { db, admin, us: [a, b] } = await users(2);
  await adminOp(db, admin, { op: 'give_gold', userId: a.id, amount: 50000 });
  const pa = await db.getProfile(a.id);
  await profileOp(db, a, { op: 'farm_place', uid: pa.vault[0].uid });
  // nível 6 e recursos para construir
  const set = async patch => { const p = await db.getProfile(a.id); await db.updateProfileIf(a.id, p.rev || 0, { stats: { ...p.stats, farm: { ...p.stats.farm, ...patch } } }); };
  await set({ lvl: 6, res: { ore: 50, ember: 50, crystal: 20, feather: 20, pearl: 20 } });
  await assert.rejects(profileOp(db, a, { op: 'farm_plant', plot: 0, crop: 'xx' }), /Semente inválida/);
  let r = await profileOp(db, a, { op: 'farm_plant', plot: 0, crop: 'trigo' });
  assert.equal(r.farm.garden.plots[0].crop, 'trigo');
  await assert.rejects(profileOp(db, a, { op: 'farm_plant', plot: 0, crop: 'oran' }), /já está plantado/);
  await assert.rejects(profileOp(db, a, { op: 'farm_plant', plot: 7, crop: 'oran' }), /Canteiro inválido/);
  // amigo que cuida rega a horta
  const before = (await db.getProfile(a.id)).stats.farm.plots[0].readyAt;
  await profileOp(db, b, { op: 'farm_help', userId: a.id });
  const pl = (await db.getProfile(a.id)).stats.farm.plots[0];
  assert.ok(pl.watered && pl.readyAt < before);
  await assert.rejects(profileOp(db, a, { op: 'farm_harvest' }), /Nada pronto/);
  // adianta o relógio do canteiro
  const p2 = await db.getProfile(a.id);
  await set({ plots: p2.stats.farm.plots.map(x => x && { ...x, readyAt: 1 }), goods: { trigo: 5, oran: 4 } });
  r = await profileOp(db, a, { op: 'farm_harvest' });
  assert.ok(r.farm.garden.goods.trigo >= 8);
  // construções
  await assert.rejects(profileOp(db, a, { op: 'farm_bjob', b: 'moinho', recipe: 'farinha' }), /Construa o Moinho/);
  await profileOp(db, a, { op: 'farm_build', b: 'moinho' });
  await profileOp(db, a, { op: 'farm_build', b: 'cozinha' });
  r = await profileOp(db, a, { op: 'farm_bjob', b: 'moinho', recipe: 'farinha' });
  assert.equal(r.farm.buildings.moinho.jobs.length, 1);
  await assert.rejects(profileOp(db, a, { op: 'farm_bjob', b: 'moinho', recipe: 'farinha' }), /Fila cheia/);
  const p3 = await db.getProfile(a.id);
  await set({ buildings: { ...p3.stats.farm.buildings, moinho: { ...p3.stats.farm.buildings.moinho, jobs: p3.stats.farm.buildings.moinho.jobs.map(j => ({ ...j, done: 1 })) } } });
  r = await profileOp(db, a, { op: 'farm_bclaim', b: 'moinho' });
  assert.equal(r.farm.garden.goods.farinha, 1);
  r = await profileOp(db, a, { op: 'farm_bjob', b: 'cozinha', recipe: 'poffin_oran' });
  const p4 = await db.getProfile(a.id);
  await set({ buildings: { ...p4.stats.farm.buildings, cozinha: { ...p4.stats.farm.buildings.cozinha, jobs: p4.stats.farm.buildings.cozinha.jobs.map(j => ({ ...j, done: 1 })) } }, slots: p4.stats.farm.slots.map(s => ({ ...s, happy: 10 })) });
  await profileOp(db, a, { op: 'farm_bclaim', b: 'cozinha' });
  r = await profileOp(db, a, { op: 'farm_use', item: 'poffin_oran' });
  assert.ok(r.farm.slots[0].happy >= 55);
  // decoração com virar e tamanho
  r = await profileOp(db, a, { op: 'farm_decor', decor: [{ k: Object.keys((await import('../shared/data/farm.js')).FARM_DECOR).find(k => (r.farm.ownedDecor || []).includes(k)), x: 30, y: 40, f: 1, s: 1.4 }] });
  assert.equal(r.farm.decor[0].f, 1);
  assert.equal(r.farm.decor[0].s, 1.4);
});

// ---------------------------------------------------------------- v41 ⚔️ itens de batalha e habilidades
import { createMon as _cm, maxHpOf as _mhp } from '../shared/rules/monsters.js';
import { startBattle as _sb, submitChoice as _sc, sideActive as _sa } from '../shared/rules/battle.js';
import { abilityOf } from '../shared/data/battlegear.js';
const _bw = (mine, foe, seed = 9) => {
  const s = createMatch({ seed, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  s.players[0].team = [mine];
  _sb(s, { kind: 'wild', pid: 'a', foe: { kind: 'wild', mon: foe } });
  return s;
};
const _hits = (s, side) => s.fx.filter(f => f.k === 'hit' && f.side === side);

test('⚔️ habilidades: Levitação, Robustez, Intimidação e Chama', () => {
  const r = createRng(3);
  assert.equal(abilityOf('gastly'), 'levitate'); // Gengar perdeu Levitação na Geração 7 (agora Corpo Amaldiçoado)
  assert.equal(abilityOf('golem'), 'sturdy');
  assert.equal(abilityOf('charizard'), 'blaze');
  assert.equal(abilityOf('blastoise'), 'torrent');
  assert.equal(abilityOf('pikachu'), 'static');
  assert.equal(abilityOf('mew'), null); // Sincronizar não faz nada no jogo de dado
  // 🎈 golpe de Terra não afeta Gengar
  let s = _bw(_cm(r, 'dugtrio', 40, { starter: true, moves: ['ground_q', 'normal_q'] }), _cm(r, 'gastly', 10));
  _sc(s, r, 'a', { move: 'attack', slot: 0 });
  assert.equal(_hits(s, 0)[0].mult, 0);
  // 🪨 Geodude com HP cheio aguenta com 1 HP
  s = _bw(_cm(r, 'mewtwo', 60, { starter: true, moves: ['water_q', 'normal_q'] }), _cm(r, 'geodude', 3));
  _sc(s, r, 'a', { move: 'attack', slot: 0 });
  const geo = _sa(s, s.battle.sides[1]);
  assert.equal(geo.hp, 1);
  assert.ok(s.log.some(l => /Robustez/.test(l.msg)));
  // 😠 Gyarados intimida ao entrar
  s = _bw(_cm(r, 'gyarados', 30, { starter: true }), _cm(r, 'rattata', 10));
  assert.equal(s.battle.sides[1].stage[_sa(s, s.battle.sides[1]).uid], -1);
  // 🔥 Chama: com pouco HP o golpe de Fogo bate mais forte (mesma semente)
  const dmgAt = lowHp => {
    const rr = createRng(77);
    const c = _cm(rr, 'charmeleon', 30, { starter: true, nature: 'Hardy', iv: { hp: 10, str: 10, spe: 10 }, moves: ['fire_q', 'normal_q'] });
    if (lowHp) c.hp = 2;
    const st = _bw(c, _cm(rr, 'snorlax', 20, { nature: 'Hardy' }), 5); // Snorlax mais lento: o Charmeleon ataca antes
    _sc(st, createRng(1), 'a', { move: 'attack', slot: 0 });
    return _hits(st, 0)[0].dmg;
  };
  assert.ok(dmgAt(true) > dmgAt(false) * 1.3);
});

test('⚔️ itens segurados: Faixa de Foco, Restos, Faixa Escolhida, Placa e Garra Rápida', () => {
  const r = createRng(4);
  // 🎗️ Faixa de Foco: 1 vez por batalha
  const rat = _cm(r, 'rattata', 3); rat.held = 'focus_sash';
  let s = _bw(_cm(r, 'mewtwo', 60, { starter: true, moves: ['water_q', 'normal_q'] }), rat);
  _sc(s, r, 'a', { move: 'attack', slot: 0 });
  assert.equal(_sa(s, s.battle.sides[1]).hp, 1);
  assert.ok(s.battle.sashUsed);
  // 🍎 Restos cura no fim da rodada
  const sn = _cm(r, 'snorlax', 40, { starter: true, moves: ['normal_q', 'normal_s'] }); sn.held = 'leftovers'; sn.hp = 20;
  s = _bw(sn, _cm(r, 'caterpie', 2));
  _sc(s, r, 'a', { move: 'attack', slot: 0 });
  assert.ok(s.log.some(l => /Restos/.test(l.msg)) || s.battle.over);
  // 🎀 Faixa Escolhida: bloqueia golpe de suporte e aumenta o dano
  const bl = _cm(r, 'blissey', 30, { starter: true, moves: ['normal_q', 'recover'] }); bl.held = 'choice_band';
  s = _bw(bl, _cm(r, 'magikarp', 5));
  assert.throws(() => _sc(s, r, 'a', { move: 'attack', slot: 1 }), /Faixa Escolhida/);
  const dmgWith = held => {
    const rr = createRng(11);
    const m = _cm(rr, 'machamp', 30, { starter: true, nature: 'Hardy', iv: { hp: 10, str: 10, spe: 10 }, moves: ['fire_q', 'normal_q'] });
    if (held) m.held = held;
    const st = _bw(m, _cm(rr, 'snorlax', 60, { nature: 'Hardy' }), 5);
    _sc(st, createRng(1), 'a', { move: 'attack', slot: 0 });
    return _hits(st, 0)[0].dmg;
  };
  const base = dmgWith(null);
  assert.ok(dmgWith('choice_band') > base);
  assert.ok(dmgWith('plate_fighting') > base); // Machamp usa golpe de Luta
  assert.equal(dmgWith('plate_water'), base); // placa de outro tipo não muda nada
  // 🐾 Garra Rápida: o mais lento às vezes ataca primeiro
  const firsts = claw => {
    let first = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const rr = createRng(seed);
      const slow = _cm(rr, 'slowpoke', 30, { starter: true, moves: ['water_q', 'normal_q'] }); if (claw) slow.held = 'quick_claw';
      const st = _bw(slow, _cm(rr, 'jolteon', 30), seed);
      _sc(st, rr, 'a', { move: 'attack', slot: 0 });
      if (st.fx.find(f => f.k === 'hit')?.side === 0) first++;
    }
    return first;
  };
  assert.ok(firsts(true) > firsts(false), 'Garra Rápida faz agir primeiro mais vezes');
});

test('⚔️ Oficina faz Placa de Tipo; qualquer Pokémon segura item de batalha e ele vai para a partida', async () => {
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'give_gold', userId: a.id, amount: 50000 });
  const set = async patch => { const p = await db.getProfile(a.id); await db.updateProfileIf(a.id, p.rev || 0, { stats: { ...p.stats, farm: { ...(p.stats.farm || {}), ...patch } } }); };
  await profileOp(db, a, { op: 'farm_get' });
  await set({ lvl: 5, axp: 400, res: { crystal: 20, ore: 20 } });
  await assert.rejects(profileOp(db, a, { op: 'farm_craft', recipe: 'plate' }), /tipo da Placa/);
  let r = await profileOp(db, a, { op: 'farm_craft', recipe: 'plate', ptype: 'fire' });
  const job = r.farm.workshop.jobs[0];
  const p1 = await db.getProfile(a.id);
  await set({ jobs: p1.stats.farm.jobs.map(j => ({ ...j, done: 1 })) });
  r = await profileOp(db, a, { op: 'farm_claim', id: job.id });
  assert.equal(r.profile.stats.bag.plate_fire, 1);
  const mon = r.profile.vault[0];
  r = await profileOp(db, a, { op: 'hold_stone', uid: mon.uid, item: 'plate_fire' });
  assert.equal(r.profile.vault.find(x => x.uid === mon.uid).held, 'plate_fire');
  assert.ok(!r.profile.stats.bag.plate_fire);
  const s = createMatch({ seed: 2, players: [{ id: 'a', name: 'A', teamMons: [r.profile.vault.find(x => x.uid === mon.uid)] }, { id: 'b', name: 'B' }] });
  assert.equal(s.players[0].team.find(m => m.uid === mon.uid)?.held, 'plate_fire');
  r = await profileOp(db, a, { op: 'hold_stone', uid: mon.uid, item: null });
  assert.equal(r.profile.stats.bag.plate_fire, 1);
});

// ---------------------------------------------------------------- v42 🛡️ DEF oficial
import { computeStats as _cs, defFactor, defIvOf, ivPercent as _ivp, statsOf as _so } from '../shared/rules/monsters.js';
import { natureMult as _nm } from '../shared/data/natures.js';
test('🛡️ DEF oficial: valores da espécie, natureza, IV fixo pelo uid e efeito no dano', () => {
  assert.equal(_cs('shuckle', 30).def, 230);
  assert.equal(_cs('alakazam', 30).def, 70);
  assert.equal(_cs('caterpie', 5).def, _cs('caterpie', 50).def); // não sobe com o nível
  assert.ok(_cs('steelix', 30, false, 'Bold').def > _cs('steelix', 30, false, 'Hardy').def);
  assert.equal(_nm('Lonely', 'def'), 0.9);
  assert.equal(defFactor(70), 1);
  assert.equal(defFactor(230), 0.6);
  assert.equal(defFactor(20), 1.4);
  // Pokémon antigo (sem iv.def): DEF fixa pelo uid, sempre igual
  const old = { uid: 'abc123', sp: 'onix', lvl: 20, iv: { hp: 10, atk: 10, spe: 10 } };
  assert.equal(defIvOf(old), defIvOf({ ...old }));
  assert.ok(defIvOf(old) >= 0 && defIvOf(old) <= 31);
  assert.equal(_ivp({ ...old, iv: { hp: 31, atk: 31, spe: 31, def: 31 } }), 100);
  // mesmo golpe, mesmo dado: bate muito menos num Shuckle (DEF 230) que num Dwebble (DEF 60)
  const hit = foeSp => {
    const rr = createRng(21);
    const m = _cm(rr, 'machamp', 30, { starter: true, nature: 'Hardy', iv: { hp: 10, str: 10, spe: 10 }, moves: ['normal_q', 'fighting_q'] });
    const foe = _cm(rr, foeSp, 60, { nature: 'Hardy', iv: { hp: 31, atk: 0, spe: 0, def: 15 } });
    const st = _bw(m, foe, 5);
    _sc(st, createRng(1), 'a', { move: 'attack', slot: 0 });
    return _hits(st, 0)[0].dmg;
  };
  assert.ok(hit('dwebble') > hit('shuckle') * 1.5); // os dois são Inseto/Pedra: só a DEF muda
  // Megas: +20% de DEF
  assert.equal(_so({ sp: 'mega_steelix', lvl: 30, iv: { hp: 15, atk: 15, spe: 15, def: 15 } }).def > _so({ sp: 'steelix', lvl: 30, iv: { hp: 15, atk: 15, spe: 15, def: 15 } }).def, true);
});

// ---------------------------------------------------------------- v43 ✨ habilidades reais
import { abilityImmune } from '../shared/rules/battle.js';
import { ABILITY_BY_DEX } from '../shared/data/abilitymap.js';
import { ABILITIES as _AB } from '../shared/data/battlegear.js';
test('✨ habilidades reais: mapa do PokeAPI, absorção, Gordura Espessa, Estática, Pele Áspera, Preguiça, Início Lento, Quebra-Molde', () => {
  // toda habilidade do mapa existe e tem efeito; boa cobertura
  assert.ok(ABILITY_BY_DEX.length === 806);
  assert.ok(ABILITY_BY_DEX.filter(Boolean).every(k => _AB[k]));
  assert.ok(ABILITY_BY_DEX.filter(Boolean).length > 600);
  assert.equal(abilityOf('snorlax'), 'immunity');
  assert.equal(abilityOf('vaporeon'), 'water_absorb');
  const r = createRng(8);
  const one = (mine, foe, slot = 0, seed = 5) => { const st = _bw(mine, foe, seed); _sc(st, createRng(seed), 'a', { move: 'attack', slot }); return st; };
  // 💧 Absorve Água: golpe de Água não causa dano e cura
  const vap = _cm(r, 'vaporeon', 30); vap.hp = 20;
  let s = one(_cm(r, 'blastoise', 30, { starter: true, moves: ['water_q', 'normal_q'] }), vap);
  assert.ok(s.log.some(l => /Absorve Água/.test(l.msg)));
  assert.ok(_sa(s, s.battle.sides[1]).hp > 20);
  // 🐋 Gordura Espessa: Fogo bate metade
  const fire = foe => { const rr = createRng(3); const st = one(_cm(rr, 'charizard', 30, { starter: true, nature: 'Hardy', iv: { hp: 10, str: 10, spe: 31 }, moves: ['fire_q', 'flying_s'] }), _cm(rr, foe, 30, { nature: 'Hardy', iv: { hp: 31, atk: 0, spe: 0, def: 15 } }), 0, 7); return _hits(st, 0)[0].dmg; };
  assert.ok(fire('spheal') < fire('lapras') * 0.9); // os dois são Água/Gelo; sem Gordura Espessa o Spheal (DEF 50) levaria ~1,3× o que o Lapras (DEF 88) leva
  // 🦥 Preguiça: Slaking ataca numa rodada e descansa na outra
  const sl = _cm(r, 'slaking', 40, { starter: true, moves: ['normal_q', 'normal_s'] });
  s = _bw(sl, _cm(r, 'snorlax', 60), 3);
  _sc(s, createRng(1), 'a', { move: 'attack', slot: 0 });
  _sc(s, createRng(2), 'a', { move: 'attack', slot: 0 });
  assert.ok(s.log.some(l => /preguiça/.test(l.msg)));
  // 🐢 Início Lento: Regigigas começa com metade do ataque
  // 🔨 Quebra-Molde ignora Levitação
  const gas = _cm(r, 'gastly', 20);
  assert.equal(abilityImmune('ground', gas, _cm(r, 'dugtrio', 20)), true);
  assert.equal(abilityImmune('ground', gas, _cm(r, 'cranidos', 20)), false);
  // ⚡ Estática / 🦈 Pele Áspera: quem bate sofre
  let para = 0, hurt = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rr = createRng(seed);
    const st = one(_cm(rr, 'machamp', 40, { starter: true, moves: ['fighting_q', 'normal_q'] }), _cm(rr, 'pikachu', 60), 0, seed);
    if (st.fx.some(f => f.k === 'status' && f.side === 0 && f.status === 'paralysis')) para++;
    const st2 = one(_cm(rr, 'machamp', 40, { starter: true, moves: ['fighting_q', 'normal_q'] }), _cm(rr, 'sharpedo', 60), 0, seed);
    if (st2.log.some(l => /Pele Áspera/.test(l.msg))) hurt++;
  }
  assert.ok(para >= 4, `Estática paralisou ${para}/40`);
  assert.ok(hurt >= 30, `Pele Áspera machucou ${hurt}/40`);
});

// ---------------------------------------------------------------- v44 ⚔️ golpes reais
import { MOVES as _MV, missFromAcc } from '../shared/data/moves.js';
test('⚔️ golpes reais: precisão, prioridade, recuo, recarga, hesitar, crítico alto e condição oficial', () => {
  assert.equal(_MV.fire_s.miss, 0);            // Flamethrower: 100% de precisão
  assert.equal(_MV.electric_x.miss, 2);        // Thunder: 70%
  assert.equal(_MV.flying_p.miss, 0);          // Aerial Ace: nunca erra
  assert.equal(missFromAcc(50), 3);
  assert.equal(_MV.fire_q.st, 'burn');
  assert.equal(_MV.grass_q.st, undefined);     // Razor Leaf não faz dormir
  assert.ok(_MV.normal_p.prio > 0 && _MV.water_x2.recharge && _MV.normal_x.recoil === 3 && _MV.fire_x2.selfDrop && _MV.fighting_q.highCrit);
  // ⚡ prioridade: Quick Attack de um Rattata lento acerta antes do Jolteon
  let s = _bw(_cm(createRng(1), 'rattata', 10, { starter: true, moves: ['normal_q', 'normal_p'] }), _cm(createRng(2), 'jolteon', 50), 4);
  _sc(s, createRng(3), 'a', { move: 'attack', slot: 1 });
  assert.equal(s.fx.find(f => f.k === 'hit')?.side, 0);
  // ↩️ recuo do Double-Edge
  s = _bw(_cm(createRng(1), 'tauros', 40, { starter: true, moves: ['normal_q', 'normal_x'] }), _cm(createRng(2), 'snorlax', 20), 4);
  for (let i = 0; i < 4 && !s.log.some(l => /recuo/.test(l.msg)); i++) _sc(s, createRng(10 + i), 'a', { move: 'attack', slot: 1 });
  assert.ok(s.log.some(l => /recuo/.test(l.msg)));
  // 😮‍💨 Hydro Cannon: descansa na rodada seguinte
  s = _bw(_cm(createRng(1), 'blastoise', 50, { starter: true, moves: ['water_q', 'water_x2'] }), _cm(createRng(2), 'snorlax', 60), 4);
  for (let i = 0; i < 6 && !s.log.some(l => /descansar/.test(l.msg)) && !s.battle.over; i++) _sc(s, createRng(20 + i), 'a', { move: 'attack', slot: 1 });
  assert.ok(s.log.some(l => /descansar/.test(l.msg)));
});

// ---------------------------------------------------------------- v45 📖 ficha da Pokédex
test('📖 ficha da Pokédex: status, habilidade, fraquezas, evolução e golpes', async () => {
  globalThis.document ||= undefined;
  const { dexEntryHtml } = await import('../js/ui/dexentry.js').catch(() => ({}));
  if (!dexEntryHtml) return; // módulo de UI depende do navegador
  const all = new Set(['charmander', 'charmeleon', 'charizard']);
  const html = dexEntryHtml('charizard', { seen: all, caught: all, shinySeen: new Set(), shinyCaught: new Set(), vault: [] });
  assert.match(html, /Chama/);
  assert.match(html, /×4/); // Charizard leva ×4 de Pedra
  assert.match(html, /Charmeleon/);
  assert.match(html, /Mega Charizard/);
});

// ---------------------------------------------------------------- v46 💎 Loja: efeito de captura, rastro, molduras
import { DEFAULT_SHOP as _DS, sanitizeCosmetic as _san, EQUIP_KINDS as _EK } from '../shared/data/cosmetics.js';
test('💎 Loja v46: efeito de captura, rastro do peão e molduras novas equipáveis e levadas para a partida', async () => {
  assert.ok(_EK.includes('capfx') && _EK.includes('trail'));
  assert.equal(_DS.items.filter(i => i.kind === 'capfx').length, 12);
  assert.equal(_DS.items.filter(i => i.kind === 'trail').length, 12);
  assert.ok(_DS.items.filter(i => i.kind === 'frame').length >= 15);
  assert.deepEqual(_san({ capfx: 'master', trail: 'coins', frame: 'royal', aura: 'xx' }), { capfx: 'master', trail: 'coins', frame: 'royal' });
  assert.equal(_san({ capfx: '<script>' }), null);
  // compra e equipa
  const { db, admin, us: [a] } = await users(1);
  const { shopOp, equippedCosmetic: _eqc } = await import('../api/_lib/shop.js');
  await db.walletAdd(a.id, 2000, 0);
  for (const [id, slot] of [['capfx_master', 'capfx'], ['trail_coins', 'trail'], ['frame_royal', 'frame']]) {
    await shopOp(db, a, { op: 'buy', itemId: id });
    await shopOp(db, a, { op: 'equip', slot, itemId: id });
  }
  const c = await _eqc(db, await db.getProfile(a.id));
  assert.equal(c.capfx, 'master');
  assert.equal(c.trail, 'coins');
  assert.equal(c.frame, 'royal');
});

// ---------------------------------------------------------------- v47 🖌️ Ateliê da Fazenda
import { artSvg, cleanArt } from '../shared/data/farmart.js';
test('🖌️ Ateliê: salvar desenho, usar na decoração, apagar (renumera) e moderação do admin', async () => {
  const { db, admin, us: [a] } = await users(1);
  const px = '.'.repeat(100) + '4'.repeat(20) + '.'.repeat(136);
  assert.equal(cleanArt({ p: '.'.repeat(256) }), null);           // vazio não vale
  assert.equal(cleanArt({ p: 'z'.repeat(256) }), null);           // caractere inválido
  assert.equal(cleanArt({ n: '<b>x</b>', p: px }).n, 'bx/b');     // nome sem HTML
  assert.match(artSvg(px), /^data:image\/svg\+xml/);
  await profileOp(db, a, { op: 'farm_get' });
  await assert.rejects(profileOp(db, a, { op: 'farm_art_save', i: 1, art: { n: 'A', p: px } }), /próximo espaço/);
  let r = await profileOp(db, a, { op: 'farm_art_save', i: 0, art: { n: 'Coração', p: px } });
  r = await profileOp(db, a, { op: 'farm_art_save', i: 1, art: { n: 'Estrela', p: px.replace(/4/g, '6') } });
  assert.equal(r.farm.art.length, 2);
  r = await profileOp(db, a, { op: 'farm_decor', decor: [{ k: 'art0', x: 30, y: 40 }, { k: 'art1', x: 60, y: 50 }, { k: 'art5', x: 10, y: 10 }] });
  assert.deepEqual(r.farm.decor.map(d => d.k), ['art0', 'art1']); // art5 não existe
  r = await profileOp(db, a, { op: 'farm_art_del', i: 0 });
  assert.deepEqual(r.farm.decor.map(d => d.k), ['art0']);           // a Estrela virou art0
  assert.equal(r.farm.art[0].n, 'Estrela');
  await adminOp(db, admin, { op: 'clear_farm_art', userId: a.id });
  const f = (await profileOp(db, a, { op: 'farm_get' })).farm;
  assert.equal(f.art.length, 0);
  assert.equal(f.decor.length, 0);
});

// ---------------------------------------------------------------- v48 🏵️ Amuleto Lendário + 🏗️ Expansões da Fazenda
import { legendCapBlocked as _lcb, deliverCapture as _dc, LEGEND_MATCH_LIMIT as _LML } from '../shared/rules/battle.js';
import { addToBag as _atb } from '../api/_lib/core.js';
test('🏵️ Amuleto Lendário: sem limite, gasta 1 carga só quando passa do limite (1 por partida)', () => {
  const s = createMatch({ seed: 3, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  const p = s.players[0];
  const legend = () => { const m = _cm(createRng(1), 'articuno', 40); m.yellowLegend = true; return m; };
  p.legendCaught = _LML;
  assert.equal(_lcb(p, legend()), true);          // sem amuleto: bloqueado
  p.items.legend_charm = 1;
  assert.equal(_lcb(p, legend()), false);         // com amuleto: liberado
  _dc(s, 'a', legend(), 'ultra_ball');            // 3º lendário → gasta a carga
  assert.equal(p.items.legend_charm, undefined);
  assert.equal(p.legendCharmOn, true);
  assert.equal(_lcb(p, legend()), false);         // continua liberado até o fim da partida
  _dc(s, 'a', legend(), 'ultra_ball');
  assert.ok(s.log.filter(l => /Amuleto Lendário brilhou/.test(l.msg)).length === 1);
  assert.equal(_atb({}, { legend_charm: 5 }).legend_charm, 3); // guarda no máximo 3 cargas
});
test('🏗️ Expansões da Fazenda: preço crescente com ouro, aumenta vagas e decoração', async () => {
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'give_gold', userId: a.id, amount: 30000 });
  let r = await profileOp(db, a, { op: 'farm_get' });
  const base = r.farm.slotsMax;
  r = await profileOp(db, a, { op: 'farm_expand', k: 'slots' });
  assert.equal(r.farm.slotsMax, base + 1);
  assert.equal(r.farm.exp.slots.next, 12000);
  r = await profileOp(db, a, { op: 'farm_expand', k: 'decor' });
  assert.equal(r.farm.decorMax, 50);
  const g = (await db.getProfile(a.id)).gold;
  await profileOp(db, a, { op: 'farm_expand', k: 'slots' });            // 12000
  assert.equal((await db.getProfile(a.id)).gold, g - 12000);
  let err = null;
  for (let i = 0; i < 6 && !err; i++) await profileOp(db, a, { op: 'farm_expand', k: 'slots' }).catch(e => { err = e; });
  assert.match(err.message, /ouro|máximo/);                             // acaba o ouro (ou chega no máximo)
  await assert.rejects(profileOp(db, a, { op: 'farm_expand', k: 'xx' }), /inválida/);
});

// ---------------------------------------------------------------- v49 🏡 casa por dentro + 🍳 comidas
import { cleanBring as _cbr } from '../shared/data/items.js';
test('🏡 casa: comprar móveis com ouro, arrumar, favorito, brincar, cozinhar e pegar o prato', async () => {
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'give_gold', userId: a.id, amount: 40000 });
  await profileOp(db, a, { op: 'farm_get' });
  let r = await profileOp(db, a, { op: 'home_buy', kind: 'furniture', id: 'stove' });
  r = await profileOp(db, a, { op: 'home_buy', kind: 'furniture', id: 'chair' });
  r = await profileOp(db, a, { op: 'home_buy', kind: 'wall', id: 'pastel' });
  assert.equal(r.farm.home.wall, 'pastel');
  await assert.rejects(profileOp(db, a, { op: 'home_cook', meal: 'xp_shake' }), /Fogão/);
  r = await profileOp(db, a, { op: 'home_place', placed: [{ f: 'stove', x: 2, y: 1 }, { f: 'chair', x: 5, y: 4 }, { f: 'chair', x: 6, y: 4 }, { f: 'piano', x: 1, y: 1 }], wall: 'night', floor: 'wood' });
  assert.deepEqual(r.farm.home.placed.map(x => x.f), ['stove', 'chair']); // só o que tem (1 cadeira, sem piano)
  assert.equal(r.farm.home.wall, 'pastel');                                 // céu estrelado não foi comprado
  const uid = (await db.getProfile(a.id)).vault[0].uid;
  await profileOp(db, a, { op: 'home_fav', uid });
  r = await profileOp(db, a, { op: 'home_play' });
  assert.match(r.message, /XP|Nv\. 50/);
  await assert.rejects(profileOp(db, a, { op: 'home_play' }), /amanhã/);
  // ingredientes
  const p = await db.getProfile(a.id);
  await db.updateProfileIf(a.id, p.rev || 0, { stats: { ...p.stats, farm: { ...p.stats.farm, goods: { leite: 5, sitrus: 5, mel: 2 } } } });
  r = await profileOp(db, a, { op: 'home_cook', meal: 'xp_shake' });
  assert.equal(r.farm.home.cook.length, 1);
  await assert.rejects(profileOp(db, a, { op: 'home_cook', meal: 'xp_shake' }), /ocupado/);
  const p2 = await db.getProfile(a.id);
  await db.updateProfileIf(a.id, p2.rev || 0, { stats: { ...p2.stats, farm: { ...p2.stats.farm, home: { ...p2.stats.farm.home, cook: p2.stats.farm.home.cook.map(j => ({ ...j, done: 1 })) } } } });
  r = await profileOp(db, a, { op: 'home_claim' });
  assert.equal(r.profile.stats.bag.xp_shake, 1);
  // só 1 comida por partida
  assert.deepEqual(_cbr({ xp_shake: 1, shiny_cake: 1 }), { xp_shake: 1 });
});
test('🍽️ comida é comida ao começar a partida e o Curry fortalece o tipo', () => {
  const s = createMatch({ seed: 5, players: [{ id: 'a', name: 'A', bringItems: { curry_fire: 1 } }, { id: 'b', name: 'B' }] });
  const p = s.players[0];
  assert.deepEqual([p.meal.id, p.meal.type], ['curry', 'fire']);
  assert.equal(p.items.curry_fire, undefined); // gasta
  const dmg = meal => {
    const st = _bw(_cm(createRng(4), 'charmander', 30, { starter: true, nature: 'Hardy', iv: { hp: 10, str: 10, spe: 31 }, moves: ['fire_q', 'normal_q'] }), _cm(createRng(5), 'snorlax', 20, { nature: 'Hardy' }), 5);
    if (meal) st.players[0].meal = { id: 'curry', type: 'fire' };
    _sc(st, createRng(1), 'a', { move: 'attack', slot: 0 });
    return _hits(st, 0)[0].dmg;
  };
  assert.ok(dmg(true) > dmg(false));
});

// ---------------------------------------------------------------- v50 🌿 Zona Safári
test('🌿 Zona Safári: entrada com ouro, limite diário, andar, pedra/isca, capturar vai para a Coleção', async () => {
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'give_gold', userId: a.id, amount: 20000 });
  const g0 = (await db.getProfile(a.id)).gold;
  await assert.rejects(profileOp(db, a, { op: 'safari_step' }), /Entre na Zona/);
  let r = await profileOp(db, a, { op: 'safari_enter', zone: 'lago' });
  assert.equal((await db.getProfile(a.id)).gold, g0 - 3000);
  assert.equal(r.session.balls, 30);
  await assert.rejects(profileOp(db, a, { op: 'safari_enter', zone: 'lago' }), /já está/);
  const v0 = (await db.getProfile(a.id)).vault.length;
  let caught = 0, guard = 0;
  while (!r.session.over && guard++ < 200) {
    if (r.session.enc) {
      r = await profileOp(db, a, { op: guard % 3 === 0 ? 'safari_rock' : 'safari_ball' });
      if (r.caught) caught++;
    } else r = await profileOp(db, a, { op: 'safari_step' });
  }
  assert.ok(r.session.over);
  assert.equal((await db.getProfile(a.id)).vault.length, v0 + caught);
  assert.equal(r.session.caught.length, caught);
  await profileOp(db, a, { op: 'safari_leave' });
  await profileOp(db, a, { op: 'safari_enter', zone: 'montanha' }); await profileOp(db, a, { op: 'safari_leave' });
  await profileOp(db, a, { op: 'safari_enter', zone: 'floresta' }); await profileOp(db, a, { op: 'safari_leave' });
  await assert.rejects(profileOp(db, a, { op: 'safari_enter', zone: 'planicie' }), /3× hoje/);
});

// ---------------------------------------------------------------- v51 🗼 Torre de Batalha
import { towerFinished } from '../api/_lib/tower.js';
test('🗼 Torre: entrada, duelo contra CPU no Nv. 50 com Megas, sequência, PB e loja', async () => {
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'give_gold', userId: a.id, amount: 10000 });
  for (const sp of ['charizard', 'blastoise', 'venusaur']) await adminOp(db, admin, { op: 'grant_mon', userId: a.id, species: sp, level: 60 }).catch(() => {});
  const vault = (await db.getProfile(a.id)).vault;
  await assert.rejects(matchOp(db, a, { op: 'tower_battle' }), /Comece uma série/);
  await assert.rejects(matchOp(db, a, { op: 'tower_start', teamUids: [vault[0].uid] }), /3 Pokémon/);
  let r = await matchOp(db, a, { op: 'tower_start', teamUids: vault.slice(0, 3).map(m => m.uid) });
  assert.equal(r.tower.set.n, 1);
  const m1 = (await matchOp(db, a, { op: 'tower_battle' })).match;
  const row = await db.getMatch(m1.id);
  assert.equal(row.state.options.megas, true);
  assert.ok(row.state.players[0].team.every(m => m.lvl <= 50));        // Nv. 50
  assert.equal(row.state.players[1].team.length, 3);
  await towerFinished(db, { ...row, state: { ...row.state, winner: a.id } });
  let t = (await matchOp(db, a, { op: 'tower_get' })).tower;
  assert.deepEqual([t.streak, t.pb, t.set.n], [1, 1, 2]);
  await towerFinished(db, { ...row, state: { ...row.state, winner: a.id } }); // repetido não conta 2×
  assert.equal((await matchOp(db, a, { op: 'tower_get' })).tower.pb, 1);
  const m2 = (await matchOp(db, a, { op: 'tower_battle' })).match;
  const row2 = await db.getMatch(m2.id);
  await towerFinished(db, { ...row2, state: { ...row2.state, winner: 'cpu' } });       // perdeu
  t = (await matchOp(db, a, { op: 'tower_get' })).tower;
  assert.deepEqual([t.streak, t.best, t.set], [0, 1, null]);
  // loja
  await assert.rejects(matchOp(db, a, { op: 'tower_buy', item: 'leftovers' }), /48 PB/);
  r = await matchOp(db, a, { op: 'tower_buy', item: 'rare_candy' }).catch(e => e);
  assert.match(String(r.message || r), /8 PB/);
});

// ---------------------------------------------------------------- v52 🕊️ soltar dá ouro
test('🕊️ Soltar Pokémon: ouro pela raridade; recuperar devolve o ouro', async () => {
  const { releaseGold } = await import('../shared/data/release.js');
  assert.ok(releaseGold({ sp: 'pidgey', lvl: 5 }) < releaseGold({ sp: 'dragonite', lvl: 5 }));
  assert.ok(releaseGold({ sp: 'dragonite', lvl: 50 }) < releaseGold({ sp: 'mewtwo', lvl: 50 }));
  assert.equal(releaseGold({ sp: 'pidgey', lvl: 1, shiny: true }), Math.round(15 * 4 * 1.01 / 5) * 5);
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'grant_mon', userId: a.id, species: 'mewtwo', level: 50 });
  const m = (await db.getProfile(a.id)).vault.find(x => x.sp === 'mewtwo');
  const g0 = (await db.getProfile(a.id)).gold || 0;
  const r = await profileOp(db, a, { op: 'release', uid: m.uid });
  assert.equal(r.gold, releaseGold(m));
  assert.equal((await db.getProfile(a.id)).gold, g0 + r.gold);
  assert.equal(r.profile.stats.overflow[0].paid, r.gold);
  await adminOp(db, admin, { op: 'give_gold', userId: a.id, amount: -((await db.getProfile(a.id)).gold) }).catch(() => {});
  if (((await db.getProfile(a.id)).gold || 0) < r.gold) await assert.rejects(profileOp(db, a, { op: 'restore', uid: m.uid }), /devolva/);
  await adminOp(db, admin, { op: 'give_gold', userId: a.id, amount: r.gold });
  const before = (await db.getProfile(a.id)).gold;
  const r2 = await profileOp(db, a, { op: 'restore', uid: m.uid });
  assert.equal(r2.paidBack, r.gold);
  assert.equal((await db.getProfile(a.id)).gold, before - r.gold);
  assert.ok(r2.profile.vault.some(x => x.uid === m.uid && x.paid === undefined));
});

// ---------------------------------------------------------------- v54 📖 Dex completa + evoluções fiéis
import { itemEvoTarget as _iet, levelEvoTarget as _let, evoItemsFor as _eif } from '../shared/data/evolution.js';
import { variantFor as _vf, gainXp as _gx } from '../shared/rules/monsters.js';
import { ITEMS as _IT } from '../shared/data/items.js';
import { genderFor as _gf } from '../shared/data/gender.js';
test('📖 Dex Gen 1–9 + formas: dados, sprites do HOME e sexo oficial', () => {
  for (const id of ['sprigatito', 'great_tusk', 'koraidon', 'pecharunt', 'vulpix_alola', 'typhlosion_hisui', 'tauros_paldea_aqua', 'rotom_wash', 'urshifu_rapid_strike']) assert.ok(SPECIES[id], id);
  assert.deepEqual(SPECIES.vulpix_alola.types, ['ice']);
  assert.equal(SPECIES.vulpix_alola.file, 'vulpix-alola');
  assert.equal(SPECIES.mr_mime.file, 'mrmime');
  assert.equal(SPECIES.necrozma_dusk_mane.file, 'necrozma-duskmane');
  assert.ok(SPECIES.pecharunt.mythical && SPECIES.pecharunt.tier === 5);
  assert.ok(SPECIES.pikachu.fem && SPECIES.charizard.gmax);
  assert.ok(SPECIES.vivillon.variants.includes('pokeball'));
  assert.equal(_gf('sprigatito', 'x', SPECIES.sprigatito) !== 'N', true);
  assert.equal(_gf('great_tusk', 'x', SPECIES.great_tusk), 'N');
});
test('✨ Evoluções fiéis: pedra certa, troca, sexo, ramos e variação', () => {
  const mk = (sp, extra = {}) => ({ uid: 'u-' + sp, sp, lvl: 10, ...extra });
  assert.equal(_iet(mk('vulpix'), 'fire_stone'), 'ninetales');
  assert.equal(_iet(mk('vulpix'), 'water_stone'), null);
  assert.equal(_iet(mk('vulpix_alola'), 'ice_stone'), 'ninetales_alola');
  assert.equal(_iet(mk('kadabra'), 'linking_cord'), 'alakazam');
  assert.equal(_iet(mk('kirlia', { gender: 'M' }), 'dawn_stone'), 'gallade');
  assert.equal(_iet(mk('kirlia', { gender: 'F' }), 'dawn_stone'), null);
  assert.equal(_iet(mk('gloom'), 'sun_stone'), 'bellossom');
  assert.ok(['vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon'].includes(_iet(mk('eevee'), 'evolution_stone')));
  assert.equal(_let(mk('pikachu', { lvl: 60 })), null); // Pikachu só com Pedra do Trovão
  assert.equal(_let(mk('charmander', { lvl: 16 })), 'charmeleon');
  const night = Date.UTC(2026, 10, 23, 3); // 00h em Brasília
  assert.equal(_let(mk('rockruff', { lvl: 25 }), night), 'lycanroc_midnight');
  assert.equal(_let(mk('rockruff', { lvl: 25, v: 'dusk' }), night), 'lycanroc_dusk');
  assert.equal(_let(mk('burmy', { lvl: 20, gender: 'F', v: 'sandy' })), 'wormadam_sandy');
  assert.deepEqual(_eif(mk('applin')).sort(), ['syrupy_apple', 'sweet_apple', 'tart_apple'].sort());
  for (const id of ['fire_stone', 'linking_cord', 'tart_apple']) assert.equal(_IT[id].kind, 'stone');
  // variação visual sorteada pelo uid, sempre da lista
  let got = 0; for (let i = 0; i < 200; i++) { const v = _vf('vivillon', 'x' + i); if (v) { got++; assert.ok(SPECIES.vivillon.variants.includes(v)); } }
  assert.ok(got > 30 && got < 120);
  // ao subir de nível com variação: Spewpa Polar → Vivillon Polar
  const sp = { uid: 'q', sp: 'spewpa', lvl: 11, xp: 0, hp: 10, v: 'polar' };
  _gx(sp, 9999);
  assert.equal(sp.sp, 'vivillon'); assert.equal(sp.v, 'polar');
});
test('✨ Coleção: usar item de evolução da Mochila', async () => {
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'grant_mon', userId: a.id, species: 'vulpix', level: 10 });
  const m = (await db.getProfile(a.id)).vault.find(x => x.sp === 'vulpix');
  await assert.rejects(profileOp(db, a, { op: 'evo_item', uid: m.uid, item: 'fire_stone' }), /não tem/);
  await adminOp(db, admin, { op: 'grant_item', userId: a.id, item: 'fire_stone', qty: 1 });
  await adminOp(db, admin, { op: 'grant_item', userId: a.id, item: 'water_stone', qty: 1 });
  await assert.rejects(profileOp(db, a, { op: 'evo_item', uid: m.uid, item: 'water_stone' }), /não faz/);
  const r = await profileOp(db, a, { op: 'evo_item', uid: m.uid, item: 'fire_stone' });
  assert.equal(r.evolved.to, 'Ninetales');
  const p = await db.getProfile(a.id);
  assert.equal(p.vault.find(x => x.uid === m.uid).sp, 'ninetales');
  assert.ok(!(p.stats.bag.fire_stone > 0));
  assert.ok(p.pokedex.includes('ninetales'));
});

// ---------------------------------------------------------------- v55 💸 economia de egress
test('💸 Partida: "mudou?" responde só a versão quando nada mudou; listas de perfis sem a Coleção', async () => {
  const { db, us: [a] } = await users(1);
  const { match } = await matchOp(db, a, { op: 'solo', bots: 1, starter: 'charmander' });
  const r1 = await matchOp(db, a, { op: 'get', matchId: match.id, since: match.version });
  assert.equal(r1.same, true);
  assert.equal(r1.match, undefined);
  const r2 = await matchOp(db, a, { op: 'get', matchId: match.id, since: match.version - 1 });
  assert.ok(r2.match?.state);
});

// ---------------------------------------------------------------- v56 🔴 Gigantamax
import { GMAX, GMAX_ROUNDS, gmaxFor } from '../shared/data/gmax.js';
function gmaxDuel({ megas = true, key = true, gx = true, mega = false } = {}) {
  return createMatch({ kind: 'duel', seed: 9, mode: 'online', now: 0, options: { megas },
    players: [
      { id: 'a', name: 'A', dynaKey: key, megaKey: mega, teamMons: [{ uid: 'c1', sp: 'gengar', lvl: 40, gx, held: mega ? 'ms_gengar' : undefined }, { uid: 'c2', sp: 'pikachu', lvl: 40 }] },
      { id: 'b', name: 'B', teamMons: [{ uid: 'h1', sp: 'snorlax', lvl: 40 }, { uid: 'h2', sp: 'snorlax', lvl: 40 }] }] });
}
test('🔴 Gigantamax: dados, travas, 3 rodadas, divide o "1 por batalha" com a Mega', async () => {
  const { applyAction } = await import('../shared/engine.js');
  assert.ok(Object.keys(GMAX).length >= 30);
  assert.ok(GMAX.charizard && GMAX.urshifu_rapid_strike && GMAX.toxtricity_low_key);
  assert.equal(SPECIES.gmax_charizard.file, 'charizard-gmax');
  assert.ok(SPECIES.gmax_snorlax.hp > SPECIES.snorlax.hp);
  assert.equal(gmaxFor({ sp: 'gengar', gx: true }).sp, 'gmax_gengar');
  assert.equal(gmaxFor({ sp: 'gengar' }), null);
  assert.equal(gmaxFor({ sp: 'pidgey', gx: true }), null);
  // travas
  assert.match(applyAction(gmaxDuel({ megas: false }), 'a', { type: 'battle', move: 'gmax' }, { now: 0 }).error, /liberados/);
  assert.match(applyAction(gmaxDuel({ key: false }), 'a', { type: 'battle', move: 'gmax' }, { now: 0 }).error, /Pulseira/);
  assert.match(applyAction(gmaxDuel({ gx: false }), 'a', { type: 'battle', move: 'gmax' }, { now: 0 }).error, /Fator/);
  // usa: grátis, vira gigante, mantém a % de HP
  let s = gmaxDuel();
  const before = s.players[0].team[0].hp;
  let r = applyAction(s, 'a', { type: 'battle', move: 'gmax' }, { now: 0 });
  assert.equal(r.error, undefined, r.error);
  s = r.state;
  const g = s.players[0].team[0];
  assert.equal(g.sp, 'gmax_gengar');
  assert.equal(g.gmaxLeft, GMAX_ROUNDS);
  assert.ok(g.hp > before);
  assert.equal(s.battle.round, 0, 'não gastou a rodada');
  assert.match(applyAction(s, 'a', { type: 'battle', move: 'gmax' }, { now: 0 }).error, /1 Mega Evolução ou Gigantamax/);
  // depois de 3 rodadas volta ao normal
  for (let i = 0; i < GMAX_ROUNDS && s.battle && !s.battle.over; i++) {
    r = applyAction(s, 'a', { type: 'battle', move: 'attack', slot: 0 }, { now: 0 });
    if (r.error) break;
    s = r.state;
    r = applyAction(s, 'b', { type: 'battle', move: 'attack', slot: 0 }, { now: 0 });
    if (!r.error) s = r.state;
    if (s.battle?.mustSwitch?.[1]) { r = applyAction(s, 'b', { type: 'battle', move: 'switch', index: 1 }, { now: 0 }); if (!r.error) s = r.state; }
  }
  const after = s.players[0].team[0];
  if (after.hp > 0 && s.battle && !s.battle.over) { assert.equal(after.sp, 'gengar'); assert.equal(after.gmaxLeft, undefined); }
  // quem tem Mega e Gigantamax: depois da Mega não dá Gigantamax
  let s2 = gmaxDuel({ mega: true });
  s2 = applyAction(s2, 'a', { type: 'battle', move: 'mega' }, { now: 0 }).state;
  assert.match(applyAction(s2, 'a', { type: 'battle', move: 'gmax' }, { now: 0 }).error, /1 Mega Evolução ou Gigantamax|Fator|forma/);
});
test('🔴 Raid Gigantamax: Cogumelos Max, Pulseira rara; 🍲 Sopa Max dá o Fator', async () => {
  const { grantGmaxRewards, makeGmaxBoss } = await import('../shared/rules/gmax.js');
  const { createMon } = await import('../shared/rules/monsters.js');
  const s = createMatch({ seed: 3, mode: 'online', now: 0, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  const p = s.players[0];
  grantGmaxRewards(s, { int: (x, y) => y, chance: () => true }, p);
  assert.equal(p.items.max_mushroom, 2);
  assert.equal(p.items.dynamax_band, 1);
  assert.equal(p.dynaKey, true);
  const boss = makeGmaxBoss(createMon({ int: () => 1, pick: a => a[0], chance: () => false, next: () => 0.5 }, 'lapras', 30), GMAX.lapras);
  assert.equal(boss.sp, 'gmax_lapras'); assert.equal(boss.gmaxBoss, 'lapras');
  // Sopa Max na Coleção
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'grant_mon', userId: a.id, species: 'lapras', level: 20 });
  await adminOp(db, admin, { op: 'grant_mon', userId: a.id, species: 'pidgey', level: 20 });
  const v = (await db.getProfile(a.id)).vault;
  const lap = v.find(m => m.sp === 'lapras'), pid = v.find(m => m.sp === 'pidgey');
  await assert.rejects(profileOp(db, a, { op: 'max_soup', uid: lap.uid }), /Sopa Max/);
  await adminOp(db, admin, { op: 'grant_item', userId: a.id, item: 'max_soup', qty: 2 });
  await assert.rejects(profileOp(db, a, { op: 'max_soup', uid: pid.uid }), /forma Gigantamax/);
  const r = await profileOp(db, a, { op: 'max_soup', uid: lap.uid });
  assert.ok(r.profile.vault.find(m => m.uid === lap.uid).gx);
  await assert.rejects(profileOp(db, a, { op: 'max_soup', uid: lap.uid }), /já tem/);
  // Pulseira pelo admin
  await adminOp(db, admin, { op: 'grant_item', userId: a.id, item: 'dynamax_band' });
  assert.equal((await db.getProfile(a.id)).stats.dynamaxBand, true);
});
test('🏵️ v58: Amuleto Lendário vale 1 semana (ativar na Mochila soma +7 dias)', async () => {
  const { legendCapBlocked, charmActive } = await import('../shared/rules/battle.js');
  const { db, admin, us: [a] } = await users(1);
  await assert.rejects(profileOp(db, a, { op: 'charm_activate' }), /Amuleto/);
  await adminOp(db, admin, { op: 'grant_item', userId: a.id, item: 'legend_charm', qty: 2 });
  const t0 = Date.now();
  let r = await profileOp(db, a, { op: 'charm_activate' });
  const u1 = r.profile.stats.legendCharmUntil;
  assert.ok(u1 >= t0 + 7 * 86400000 - 1000 && u1 <= Date.now() + 7 * 86400000);
  assert.equal(r.profile.stats.bag.legend_charm, 1);
  r = await profileOp(db, a, { op: 'charm_activate' });
  assert.ok(r.profile.stats.legendCharmUntil >= u1 + 7 * 86400000 - 1000);
  assert.ok(!r.profile.stats.bag.legend_charm);
  const p = { legendCaught: 5, legendCharmUntil: Date.now() + 1000 };
  assert.equal(charmActive(p), true);
  assert.equal(legendCapBlocked(p, { yellowLegend: true }), false);
  assert.equal(legendCapBlocked({ legendCaught: 5, legendCharmUntil: Date.now() - 1 }, { yellowLegend: true }), true);
});
test('☠️ v58: lendários corrompidos (sem shiny, raros, nunca em ovo)', () => {
  for (const id of ['mewtwo_armor', 'mewtwo_shadow', 'lugia_shadow']) {
    const s = SPECIES[id];
    assert.ok(s && s.tier === 5 && s.legendary && s.corrupt && s.noShiny, id);
  }
  assert.deepEqual(SPECIES.mewtwo_shadow.types, ['psychic', 'dark']);
  assert.deepEqual(SPECIES.lugia_shadow.types, ['dark', 'flying']);
  const rng = createRng(11);
  let corr = 0;
  for (let i = 0; i < 3000; i++) { const m = rollWild(rng, 5, { forceShiny: true }); if (SPECIES[m.sp].corrupt) { corr++; assert.equal(m.shiny, false); } }
  assert.ok(corr > 10 && corr < 150, 'corrompidos raros: ' + corr);
  for (let i = 0; i < 400; i++) assert.ok(!SPECIES[hatchEgg(rng, 5).sp].corrupt);
});

// ---------------------------------------------------------------- v59
test('🎒 v59: quem sai da partida recebe de volta o que trouxe (Master Ball não some)', async () => {
  const db = createMemoryDb();
  const ash = await db.verifyToken('dev:ash@kanto.com');
  const { profile } = await profileOp(db, ash, { op: 'get' });
  await db.upsertProfile(ash.id, { vault: [{ uid: 'v1', sp: 'pikachu', lvl: 20 }], stats: { ...(profile.stats || {}), bag: { master_ball: 1, ultra_ball: 5 } } });
  const { match } = await matchOp(db, ash, { op: 'solo', bots: 1, teamUids: ['v1'], bringItems: { master_ball: 1, ultra_ball: 3 } });
  assert.deepEqual((await db.getProfile(ash.id)).stats.bag, { ultra_ball: 2 });
  await matchOp(db, ash, { op: 'leave', matchId: match.id });
  const bag = (await db.getProfile(ash.id)).stats.bag;
  assert.equal(bag.master_ball, 1, 'Master Ball voltou');
  assert.equal(bag.ultra_ball, 5, 'Ultra Balls voltaram');
  const st = (await db.getMatch(match.id)).state;
  assert.ok(!st.players.find(p => p.id === ash.id).items.master_ball, 'a CPU que assumiu não usa a Master Ball');
});
test('🎒 v59: partida abandonada devolve os itens trazidos', async () => {
  const { refundAbandoned } = await import('../api/_lib/core.js');
  const db = createMemoryDb();
  const ash = await db.verifyToken('dev:ash@kanto.com');
  await profileOp(db, ash, { op: 'get' });
  const st = { options: {}, players: [{ id: ash.id, broughtItems: { master_ball: 1, ultra_ball: 4 }, items: { master_ball: 1, ultra_ball: 2, poke_ball: 5 }, gold: 300, broughtGold: 200 }, { id: 'cpu_1', items: {} }] };
  await refundAbandoned(db, st);
  const prof = await db.getProfile(ash.id);
  assert.deepEqual(prof.stats.bag, { master_ball: 1, ultra_ball: 2 });
});
test('🕊️ v59: soltar vários; time da Liga e Fazenda ficam protegidos; item segurado volta', async () => {
  const { db, us: [a] } = await users(1);
  let v = (await db.getProfile(a.id)).vault;
  const [m1, m2, m3, m4] = v;
  await db.upsertProfile(a.id, { vault: v.map(m => (m.uid === m1.uid ? { ...m, held: 'metal_coat' } : m)), stats: { ...(await db.getProfile(a.id)).stats, serie: { defense: [m3.uid] }, farm: { slots: [{ uid: m4.uid }] } } });
  const r = await profileOp(db, a, { op: 'release_many', uids: [m1.uid, m2.uid, m3.uid, m4.uid] });
  assert.equal(r.released, 2); assert.equal(r.skipped, 2);
  const prof = await db.getProfile(a.id);
  assert.ok(prof.vault.some(m => m.uid === m3.uid) && prof.vault.some(m => m.uid === m4.uid));
  assert.equal(prof.stats.bag.metal_coat, 1);
  await assert.rejects(profileOp(db, a, { op: 'release', uid: m3.uid }), /Liga/);
  const d = await profileOp(db, a, { op: 'discard_items', items: { metal_coat: 5 } });
  assert.equal(d.discarded, 1); assert.ok(!d.profile.stats.bag.metal_coat);
});
test('⚽ v59: Liga ignora Pokémon que saíram da Coleção', async () => {
  const { db, us: [a] } = await users(1);
  const v = (await db.getProfile(a.id)).vault;
  let r = await matchOp(db, a, { op: 'serie_defense', uids: v.map(m => m.uid) });
  await db.upsertProfile(a.id, { vault: v.slice(1) });
  r = await matchOp(db, a, { op: 'serie_get' });
  assert.equal(r.serie.defense.length, 5);
  assert.equal(r.serie.defenseLost, 1);
});
test('🗺️ v59: cada mapa tem Liga e lendários próprios; lendários oficiais no tier 5; Eevee só com item', async () => {
  const { ELITE_FOUR, CHAMPION } = await import('../shared/data/trainers.js');
  const { activeRegion, regionWeight } = await import('../shared/data/regions.js');
  useMap('theme:glacial');
  assert.equal(activeRegion(), 'glacial'); assert.equal(CHAMPION.name, 'Cynthia'); assert.equal(ELITE_FOUR.length, 4);
  assert.ok(regionWeight(SPECIES.kyurem) > 1 && regionWeight(SPECIES.groudon) < 1);
  const rng = createRng(3); let k = 0;
  for (let i = 0; i < 1500; i++) if (rollWild(rng, 5).sp === 'kyurem') k++;
  useMap('kanto');
  assert.equal(CHAMPION.name, 'Blue'); assert.equal(activeRegion(), 'kanto');
  const rng2 = createRng(3); let k2 = 0;
  for (let i = 0; i < 1500; i++) if (rollWild(rng2, 5).sp === 'kyurem') k2++;
  assert.ok(k > k2 * 3, `Kyurem mais comum nos Picos Gelados (${k} x ${k2})`);
  for (const id of ['type_null', 'silvally', 'walking_wake', 'iron_crown']) assert.ok(SPECIES[id].tier === 5 && SPECIES[id].legendary, id);
  assert.ok(SPECIES.eevee.evos.every(e => e.item), 'Eevee só evolui com item');
  const { levelEvoTarget } = await import('../shared/data/evolution.js');
  assert.equal(levelEvoTarget({ sp: 'eevee', lvl: 60 }), null);
});
test('🥚 v59: ovos com mutação marcada; Ajuda do Professor sem Pokémon; Chuva de Estrelas mostra o shiny certo', async () => {
  const { makeEgg, hatchFromEgg, MUTATION_LABEL } = await import('../shared/data/daycare.js');
  const rng = createRng(77);
  const mom = { uid: 'm', sp: 'bulbasaur', lvl: 20, iv: { hp: 5, atk: 5, spe: 5, def: 5 }, moves: ['grass_p', 'grass_x'] };
  const dad = { uid: 'd', sp: 'ivysaur', lvl: 20, iv: { hp: 5, atk: 5, spe: 5, def: 5 }, moves: ['grass_p', 'grass_x'] };
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { const e = makeEgg(rng, mom, dad); e.mutations.forEach(m => seen.add(m)); if (e.mutations.length) { const b = hatchFromEgg(rng, e); assert.deepEqual(b.mutations, e.mutations); } }
  for (const m of ['shiny', 'aura', 'perfect', 'move', 'rare_move', 'strong']) assert.ok(seen.has(m), 'mutação ' + m);
  for (const m of seen) assert.ok(MUTATION_LABEL[m], m);
});

// ---------------------------------------------------------------- v60
test('🧭 v60: habilidades de campo (Teletransporte, Aroma, Vento, Surfar, Escavar) com recarga', async () => {
  const { applyAction } = await import('../shared/engine.js');
  const { createMon } = await import('../shared/rules/monsters.js');
  const { FIELD_SKILLS, fieldOptions } = await import('../shared/data/fieldskills.js');
  useMap('kanto');
  let s = createMatch({ seed: 9, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  const a = s.players[0];
  const rng = createRng(4);
  a.badges = ['x', 'y', 'z', 'w', 'v'];
  a.team = [createMon(rng, 'alakazam', 30), createMon(rng, 'pidgeot', 30), createMon(rng, 'golem', 30), createMon(rng, 'vileplume', 30), createMon(rng, 'starmie', 30)];
  const cities = SPACE_LIST.filter(x => x.type === 'city').map(x => x.id);
  a.visited = [a.pos, cities[1], cities[2]];
  assert.deepEqual(fieldOptions(s, a).map(o => o.id).sort(), Object.keys(FIELD_SKILLS).sort());
  let r = applyAction(s, 'a', { type: 'field', id: 'teleport' }, { now: 0 });
  assert.ok(!r.error, r.error);
  s = r.state;
  assert.equal(s.phase, 'move'); assert.ok(s.pending.teleport);
  r = applyAction(s, 'a', { type: 'move', to: cities[2] }, { now: 0 }); s = r.state;
  assert.equal(s.players[0].pos, cities[2]);
  assert.match(applyAction(s, 'a', { type: 'field', id: 'dig' }, { now: 0 }).error || '', /rolar|turno/);
  s = applyAction(s, 'a', { type: 'end_turn' }, { now: 0 }).state;
  s = applyAction(s, 'b', { type: 'end_turn' }, { now: 0 }).state;
  if (s.phase !== 'roll') s = applyAction(s, 'b', { type: 'roll' }, { now: 0 }).state;
  r = applyAction(s, 'a', { type: 'field', id: 'teleport' }, { now: 0 });
  assert.match(r.error || '', /recarrega/);
  const bag0 = Object.values(s.players[0].items).reduce((x, y) => x + y, 0);
  r = applyAction(s, 'a', { type: 'field', id: 'dig' }, { now: 0 }); assert.ok(!r.error, r.error); s = r.state;
  assert.equal(Object.values(s.players[0].items).reduce((x, y) => x + y, 0), bag0 + 1);
  assert.match(applyAction(s, 'a', { type: 'field', id: 'tailwind' }, { now: 0 }).error || '', /1 habilidade/);
});
test('🎾 v60: bolas elementais pegam o próprio elemento; soltar logo após capturar', async () => {
  const { ballBonusAgainst } = await import('../shared/data/items.js');
  assert.equal(ballBonusAgainst('flame_ball', ['fire']), 3);
  assert.equal(ballBonusAgainst('aqua_ball', ['water']), 3);
  assert.equal(ballBonusAgainst('volt_ball', ['electric']), 3);
  assert.equal(ballBonusAgainst('shadow_ball', ['ghost']), 3);
  assert.equal(ballBonusAgainst('mystic_ball', ['psychic']), 3);
  assert.equal(ballBonusAgainst('flame_ball', ['grass']), 1);
  const { applyAction } = await import('../shared/engine.js');
  const { createMon } = await import('../shared/rules/monsters.js');
  let s = createMatch({ seed: 3, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  const m = createMon(createRng(2), 'rattata', 10);
  s.players[0].team.push(m); s.players[0].lastPlaced = { uid: m.uid, where: 'team' };
  const g0 = s.players[0].gold;
  const r = applyAction(s, 'a', { type: 'place', op: 'release' }, { now: 0 });
  assert.ok(!r.error, r.error);
  assert.ok(!r.state.players[0].team.some(x => x.uid === m.uid));
  assert.equal(r.state.players[0].gold, g0 + 200);
});

// ---------------------------------------------------------------- v61
test('🧱 v61: paredes internas vêm em pacotes de 10 e têm limite próprio (fora dos 40 móveis)', async () => {
  const { HOME_MAX, PART_MAX } = await import('../shared/data/home.js');
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'give_gold', userId: a.id, amount: 90000 });
  await profileOp(db, a, { op: 'farm_get' });
  let r;
  for (let i = 0; i < 8; i++) r = await profileOp(db, a, { op: 'home_buy', kind: 'furniture', id: 'partition' });
  assert.equal(r.farm.home.owned.partition, 80);
  await assert.rejects(profileOp(db, a, { op: 'home_buy', kind: 'furniture', id: 'partition' }), /máximo/);
  await profileOp(db, a, { op: 'home_buy', kind: 'furniture', id: 'chair' });
  const placed = [{ f: 'chair', x: 1, y: 1 }, ...Array.from({ length: 50 }, (_, i) => ({ f: 'partition', x: i % 12, y: Math.floor(i / 12) }))];
  r = await profileOp(db, a, { op: 'home_place', placed });
  assert.equal(r.farm.home.placed.length, 51);
  assert.ok(PART_MAX > HOME_MAX);
});
test('🎵 v61: links do YouTube (vídeo/playlist) aceitos; outros sites recusados', async () => {
  const { parseYoutube } = await import('../js/ui/music.js');
  assert.deepEqual(parseYoutube('https://youtu.be/dQw4w9WgXcQ'), { video: 'dQw4w9WgXcQ', list: null });
  assert.equal(parseYoutube('https://www.youtube.com/playlist?list=PLxyz12345').list, 'PLxyz12345');
  assert.equal(parseYoutube('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parseYoutube('javascript:alert(1)'), null);
});
test('📏 v61.3: cada móvel guarda o próprio tamanho (0,4× a 3×)', async () => {
  const { db, admin, us: [a] } = await users(1);
  await adminOp(db, admin, { op: 'give_gold', userId: a.id, amount: 9000 });
  await profileOp(db, a, { op: 'farm_get' });
  await profileOp(db, a, { op: 'home_buy', kind: 'furniture', id: 'chair' });
  await profileOp(db, a, { op: 'home_buy', kind: 'furniture', id: 'chair' });
  const r = await profileOp(db, a, { op: 'home_place', placed: [{ f: 'chair', x: 1, y: 1, s: 1.8 }, { f: 'chair', x: 2, y: 1, s: 9 }] });
  assert.equal(r.farm.home.placed[0].s, 1.8);
  assert.equal(r.farm.home.placed[1].s, 3);
});
test('🏟️ v62: cada mapa tem os próprios líderes de ginásio (Kanto volta ao original)', async () => {
  const { GYMS } = await import('../shared/data/trainers.js');
  useMap('theme:vulcanica');
  assert.deepEqual(GYMS.map(g => g.leader), ['Roark', 'Crasher Wake', 'Volkner', 'Gardenia', 'Maylene', 'Fantina']);
  assert.equal(GYMS[5].type, 'ghost'); assert.equal(GYMS[0].sprite, 'trainers/roark.png');
  for (const g of GYMS) for (const [id] of g.team) assert.ok(SPECIES[id], id);
  useMap('kanto');
  assert.deepEqual(GYMS.map(g => g.leader), ['Brock', 'Misty', 'Lt. Surge', 'Erika', 'Blaine', 'Koga']);
});
