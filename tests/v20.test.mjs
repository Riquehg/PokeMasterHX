// v20: só 2 casas lendárias por mapa, mapas temáticos, mapas do painel admin, Míticos e a Liga das Séries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapFor, useMap, validateCustomMap, isMapId, SPACE_LIST } from '../shared/data/board.js';
import { createMatch } from '../shared/engine.js';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { profileOp, adminOp, matchOp, actionOp, configInfo } from '../api/_lib/core.js';
import { closeSeason } from '../api/_lib/series.js';
import { whoMustAct } from '../shared/engine.js';
import { SPECIES, MYTHICAL } from '../shared/data/pokemon.js';
import { rollWild, hatchEgg } from '../shared/rules/monsters.js';
import { createRng } from '../shared/rules/rng.js';
import { serieTable, clubsOf, applySerieDuel, newSerie, zoneOf } from '../shared/data/series.js';

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

test('Séries: tabela com clubes, zonas de acesso/rebaixamento e pontos do duelo', () => {
  const t = serieTable(1, [{ id: 'u1', name: 'Ana', pts: 999, j: 5, v: 5, d: 0, sp: 9 }], '2026-11', new Date('2026-11-20T12:00:00Z'));
  assert.equal(t.length, 7);
  assert.equal(t[0].id, 'u1');
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
    for (const sp of ['charizard', 'blastoise', 'venusaur']) await adminOp(db, admin, { op: 'grant_mon', userId: u.id, species: sp, level: 60 });
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
  assert.equal(g.serie.defense.length, 3);
  await matchOp(db, b, { op: 'serie_defense', uids: vb.map(m => m.uid) });
  const view = await matchOp(db, a, { op: 'serie_get' });
  assert.equal(view.table.length, 8, '2 treinadores + 6 clubes');
  assert.ok(view.table.find(r => r.id === b.id).defense.every(m => m.lvl === 50));

  const c = await matchOp(db, a, { op: 'serie_challenge', target: b.id });
  assert.equal(c.match.state.kind, 'duel');
  assert.ok(c.match.state.players[1].isBot, 'a defesa de B joga como CPU (B não precisa estar online)');
  await assert.rejects(matchOp(db, a, { op: 'serie_challenge', target: b.id }).then(r => { if (r.match.id === c.match.id) throw new Error('mesmo duelo'); }), /mesmo duelo/);
  const done = await playOut(db, c.match.id, a);
  assert.equal(done.status, 'finished');
  const sa = (await db.getProfile(a.id)).stats.serie, sb = (await db.getProfile(b.id)).stats.serie;
  assert.equal(sa.j, 1);
  assert.equal(sa.pts, done.state.winner === a.id ? 3 : 0);
  assert.equal(sb.pts, done.state.winner === a.id ? 0 : 1);
  assert.equal(sb.log[0].kind, 'def');
  assert.ok((await db.getMatch(c.match.id)).state.serieResult);

  await assert.rejects(matchOp(db, a, { op: 'serie_challenge', target: b.id }), /já enfrentou/);
  const club = clubsOf(0)[0];
  const cc = await matchOp(db, a, { op: 'serie_challenge', target: club.id });
  assert.equal(cc.match.state.players[1].team[0].lvl, 32);
  await playOut(db, cc.match.id, a);
  for (const cl of clubsOf(0).slice(1, 4)) await playOut(db, (await matchOp(db, a, { op: 'serie_challenge', target: cl.id })).match.id, a);
  await assert.rejects(matchOp(db, a, { op: 'serie_challenge', target: clubsOf(0)[5].id }), /ataques de hoje/);
});

test('Séries: virada da temporada sobe os primeiros, paga o pódio e o campeão da Série A ganha um Mítico', async () => {
  const { db, us: [a, b] } = await users(2);
  for (const u of [a, b]) await matchOp(db, u, { op: 'serie_defense', uids: (await db.getProfile(u.id)).vault.map(m => m.uid) });
  // A campeã da Série A em outubro, B última da Série D
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
  assert.equal(pa.vault.length, va + 1);
  assert.ok(SPECIES[pa.vault.at(-1).sp].mythical);
  const gb = await matchOp(db, b, { op: 'serie_get' });
  assert.equal(gb.serie.div, 1, 'B caiu da Série B para a C');
  // fecha uma vez só
  const again = await closeSeason(db, '2026-10');
  assert.equal(again.podium[0].id, a.id);
  assert.equal(((await db.getProfile(a.id)).diamonds || 0) - before, 30);
});
