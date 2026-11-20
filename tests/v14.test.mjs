// v14: Arena Royale, Hardcore, expulsar, entrar no meio, Liga com divisões.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction, addLatePlayer, whoMustAct } from '../shared/engine.js';
import { graphDist } from '../shared/rules/modes.js';
import { useMap, SPACE_LIST } from '../shared/data/board.js';
import { ARENA } from '../shared/data/maps/arena.js';
import { applyLeagueResult, ensureSeason, newLeague, LP_PER_DIV, TOP_DIV, divInfo } from '../shared/data/league.js';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { matchOp, actionOp, leaderboard, recordResults, leagueStats } from '../api/_lib/core.js';

const T0 = 1700000000000;
const P = n => [{ id: 'ash', name: 'Ash', starter: 'charmander' }, { id: 'gary', name: 'Gary', starter: 'squirtle' }, { id: 'misty', name: 'Misty', starter: 'bulbasaur' },
  { id: 'brock', name: 'Brock', starter: 'bulbasaur' }, { id: 'may', name: 'May', starter: 'torchic' }, { id: 'red', name: 'Red', starter: 'pikachu' }].slice(0, n);

test('Arena Royale: mapa simétrico sem cruzar rotas; todos começam à mesma distância do centro', () => {
  assert.equal(ARENA.spaces.length, 73);
  for (const n of [2, 3, 4, 6]) {
    const s = createMatch({ seed: 5 + n, mode: 'online', now: T0, rules: 'royale', players: P(n) });
    assert.equal(s.map, 'arena');
    useMap('arena');
    const d = graphDist(s.royale.center);
    const dists = s.players.map(p => d[p.pos]);
    assert.equal(new Set(s.players.map(p => p.pos)).size, n, 'bases diferentes');
    assert.equal(new Set(dists).size, 1, `mesma distância (${dists})`);
    assert.ok(s.players.every(p => ARENA.bases.includes(p.pos)));
  }
  // tier sobe da borda para o centro: base é Rosa, Santuários (Amarelo) só perto do centro
  useMap('arena');
  const d = graphDist(1);
  for (const sp of SPACE_LIST.filter(x => x.tier === 5 && x.type === 'pokemon')) assert.ok(d[sp.id] <= 3);
  useMap('kanto');
});

test('Hardcore: perdeu a equipe = eliminado; o último de pé vence', () => {
  let s = createMatch({ seed: 3, mode: 'online', now: T0, players: P(2), options: { hardcore: true } });
  assert.equal(s.options.hardcore, true);
  // Ash perde um selvagem com a equipe zerada
  const r = applyAction(s, 'ash', { type: 'roll' }, { now: T0 });
  s = r.state;
  s.players[0].team.forEach(m => { m.hp = 0; });
  // aplica a regra do "desmaio geral" direto
  return import('../shared/rules/modes.js').then(M => {
    const st = structuredClone(s);
    M.knockOut(st, st.players[0], 0.1);
    assert.ok(st.players[0].out && st.players[0].hardcoreLost);
    // normal (sem hardcore) só volta para a cidade
    const n = createMatch({ seed: 3, mode: 'online', now: T0, players: P(2) });
    n.players[0].team.forEach(m => { m.hp = 0; });
    M.knockOut(n, n.players[0], 0.1);
    assert.ok(!n.players[0].out && n.players[0].team[0].hp > 0);
    // na próxima ação o jogo termina com Gary vencendo
    const after = applyAction(st, 'gary', { type: 'chat' }, { now: T0 });
    assert.ok(!after.error, after.error);
    assert.equal(after.state.status, 'finished');
    assert.equal(after.state.winner, 'gary');
  });
});

test('Expulsar: o jogador sai da rodada na hora e a vez passa', () => {
  let s = createMatch({ seed: 9, mode: 'online', now: T0, players: P(3) });
  assert.equal(s.players[s.current].id, 'ash');
  const r = applyAction(s, 'ash', { type: 'kicked' }, { now: T0 });
  assert.ok(!r.error, r.error);
  s = r.state;
  assert.ok(s.players[0].out && s.players[0].kicked);
  assert.notEqual(s.players[s.current].id, 'ash');
  assert.equal(s.status, 'playing');
  // ninguém espera por ele
  assert.ok(!whoMustAct(s).includes('ash'));
});

test('Entrar no meio: novato entra com nível perto da média e ajuda; Battle Royale não deixa', () => {
  let s = createMatch({ seed: 4, mode: 'online', now: T0, players: P(2) });
  s.players.forEach(p => { p.team[0].lvl = 24; });
  const r = addLatePlayer(s, { id: 'eve', name: 'Eve', starter: 'chikorita' });
  assert.ok(!r.error, r.error);
  const eve = r.state.players.find(p => p.id === 'eve');
  assert.ok(eve.team[0].lvl >= 18, `nível ${eve.team[0].lvl}`);
  assert.ok(eve.lateJoin && eve.items.great_ball >= 3);
  assert.match(addLatePlayer(r.state, { id: 'eve', name: 'Eve' }).error, /já está/);
  const roy = createMatch({ seed: 4, mode: 'online', now: T0, rules: 'royale', players: P(2) });
  assert.match(addLatePlayer(roy, { id: 'eve', name: 'Eve' }).error, /Battle Royale/);
});

test('Liga: sobe com 100 PL, proteção depois de subir, cai abaixo de 0, temporada nova desce 3 e dá 💎', () => {
  let L = newLeague('2026-11');
  let up = null;
  for (let i = 0; i < 6 && !up; i++) { const r = applyLeagueResult(L, { place: 1, players: 2 }); L = r.league; if (r.change === 'up') up = r; }
  assert.ok(up, 'subiu');
  assert.equal(L.div, 1);
  assert.equal(L.shield, 3);
  // com proteção, derrotas não derrubam
  for (let i = 0; i < 3; i++) L = applyLeagueResult(L, { place: 2, players: 2 }).league;
  assert.equal(L.div, 1);
  assert.equal(L.shield, 0);
  const down = applyLeagueResult(L, { place: 2, players: 2 });
  assert.equal(down.change, 'down');
  assert.equal(down.league.div, 0);
  assert.equal(down.league.lp, 75);
  // tabuleiro com 4: 1º ganha mais, último perde
  assert.ok(applyLeagueResult(newLeague(), { place: 1, players: 4 }).delta > applyLeagueResult(newLeague(), { place: 2, players: 4 }).delta);
  assert.ok(applyLeagueResult({ ...newLeague(), lp: 50 }, { place: 4, players: 4 }).delta < 0);
  // temporada
  const old = { ...newLeague('2026-10'), div: 7, peak: 9, games: 20 };
  const roll = ensureSeason(old, '2026-11');
  assert.equal(roll.league.div, 4);
  assert.ok(roll.reward > 0);
  assert.equal(ensureSeason(roll.league, '2026-11').reward, 0);
  assert.equal(divInfo(TOP_DIV).tier, 'grao_mestre');
});

test('API: anfitrião expulsa no meio, outro entra no meio pela lista; Hardcore não salva quem caiu', async () => {
  const db = createMemoryDb();
  const ash = await db.verifyToken('dev:ash@kanto.com');
  const gary = await db.verifyToken('dev:gary@kanto.com');
  const eve = await db.verifyToken('dev:eve@kanto.com');
  const { match } = await matchOp(db, ash, { op: 'create', name: 'HC', maxPlayers: 4, hardcore: true });
  assert.equal(match.options.hardcore, true);
  assert.equal(match.options.lateJoin, true);
  await matchOp(db, gary, { op: 'join', matchId: match.id });
  await matchOp(db, gary, { op: 'update', matchId: match.id, ready: true });
  const started = (await matchOp(db, ash, { op: 'start', matchId: match.id })).match;
  assert.equal(started.state.options.hardcore, true);
  // entra no meio
  const late = (await matchOp(db, eve, { op: 'join', matchId: match.id })).match;
  assert.equal(late.status, 'playing');
  assert.ok(late.state.players.some(p => p.id === 'eve' || p.name.toLowerCase().includes('eve')));
  // só o anfitrião expulsa
  const eveId = late.state.players[2].id;
  await assert.rejects(matchOp(db, gary, { op: 'kick', matchId: match.id, target: eveId }), /anfitrião/);
  const k = (await matchOp(db, ash, { op: 'kick', matchId: match.id, target: eveId })).match;
  assert.ok(k.state.players[2].kicked);
  // expulso não volta
  await assert.rejects(matchOp(db, eve, { op: 'join', matchId: match.id }), /removido/);
});

test('API: Liga atualiza no Competitivo e aparece no ranking', async () => {
  const db = createMemoryDb();
  const ash = await db.verifyToken('dev:ash@kanto.com');
  const gary = await db.verifyToken('dev:gary@kanto.com');
  const { match } = await matchOp(db, ash, { op: 'create', name: 'R', mode: 'ranked' });
  await matchOp(db, gary, { op: 'join', matchId: match.id });
  await matchOp(db, gary, { op: 'update', matchId: match.id, ready: true });
  const st = (await matchOp(db, ash, { op: 'start', matchId: match.id })).match.state;
  st.status = 'finished'; st.winner = st.players[0].id;
  await recordResults(db, st, { mode: 'ranked' });
  const lb = await leaderboard(db);
  assert.equal(lb.league.table.length, 2);
  assert.ok(lb.league.table[0].lp > 0);
  assert.ok(st.leagueChanges[st.players[0].id].delta > 0);
  assert.ok(st.leagueChanges[st.players[1].id].delta < 0 || st.leagueChanges[st.players[1].id].lp === 0);
});
