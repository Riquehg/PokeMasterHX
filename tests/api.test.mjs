// Testes do backend (salas, jogadas, permissões) com o banco em memória.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { matchOp, actionOp, listRooms, recordResults, adminOp, profileOp } from '../api/_lib/core.js';
import { whoMustAct } from '../shared/engine.js';

async function setup() {
  const db = createMemoryDb();
  const ash = await db.verifyToken('dev:ash@kanto.com');
  const gary = await db.verifyToken('dev:gary@kanto.com');
  const eve = await db.verifyToken('dev:eve@kanto.com');
  return { db, ash, gary, eve };
}

async function rejects(p, re) {
  await assert.rejects(p, e => re.test(e.message));
}

test('criar sala, entrar por código, CPU, pronto e iniciar', async () => {
  const { db, ash, gary } = await setup();
  const { match } = await matchOp(db, ash, { op: 'create', name: 'Kanto', starter: 'charmander', maxPlayers: 4 });
  assert.equal(match.status, 'lobby');
  assert.equal(match.lobby.length, 1);

  const rooms = await listRooms(db, gary);
  assert.equal(rooms.rooms.length, 1);

  const j = await matchOp(db, gary, { op: 'join', code: match.code.toLowerCase(), starter: 'squirtle' });
  assert.equal(j.match.lobby.length, 2);

  await rejects(matchOp(db, gary, { op: 'add_bot', matchId: match.id }), /anfitrião/);
  await matchOp(db, ash, { op: 'add_bot', matchId: match.id });
  await rejects(matchOp(db, ash, { op: 'start', matchId: match.id }), /Pronto/);
  await matchOp(db, gary, { op: 'update', matchId: match.id, ready: true });
  const s = await matchOp(db, ash, { op: 'start', matchId: match.id });
  assert.equal(s.match.status, 'playing');
  assert.equal(s.match.state.players.length, 3);
  assert.equal(s.match.state.players[1].team[0].sp, 'squirtle');
  assert.ok(s.match.state.options.dailyPokemon);
});

test('jogadas: só o jogador da vez; quem não é membro é barrado', async () => {
  const { db, ash, gary, eve } = await setup();
  const { match } = await matchOp(db, ash, { op: 'create', name: 'X' });
  await matchOp(db, gary, { op: 'join', matchId: match.id });
  await matchOp(db, gary, { op: 'update', matchId: match.id, ready: true });
  const started = (await matchOp(db, ash, { op: 'start', matchId: match.id })).match;

  const first = whoMustAct(started.state)[0];
  const [me, other] = first === ash.id ? [ash, gary] : [gary, ash];

  const wrong = await actionOp(db, other, { matchId: match.id, action: { type: 'roll' } });
  assert.match(wrong.error, /Não é a sua vez/);

  await rejects(actionOp(db, eve, { matchId: match.id, action: { type: 'roll' } }), /não está nesta partida/);

  const r = await actionOp(db, me, { matchId: match.id, action: { type: 'roll' } });
  assert.equal(r.error, undefined);
  assert.equal(r.match.state.phase, 'move');
  assert.equal(r.match.version, started.version + 1);
});

test('PIN protege a sala; o PIN não aparece para o cliente', async () => {
  const { db, ash, gary } = await setup();
  const { match } = await matchOp(db, ash, { op: 'create', name: 'Secreta', pin: '1234', isPublic: false });
  assert.equal(match.hasPin, true);
  assert.equal(JSON.stringify(match).includes('1234'), false);
  await rejects(matchOp(db, gary, { op: 'join', code: match.code, pin: '0000' }), /PIN incorreto/);
  const ok = await matchOp(db, gary, { op: 'join', code: match.code, pin: '1234' });
  assert.equal(ok.match.lobby.length, 2);
  assert.equal((await listRooms(db, gary)).rooms.length, 0, 'sala privada não aparece na lista');
});

test('conflito de versão é resolvido recalculando a jogada', async () => {
  const { db, ash } = await setup();
  const { match } = await matchOp(db, ash, { op: 'create', name: 'Solo+CPU' });
  await matchOp(db, ash, { op: 'add_bot', matchId: match.id });
  await matchOp(db, ash, { op: 'start', matchId: match.id });
  // Simula outra escrita concorrente aumentando a versão "por fora" uma vez
  const orig = db.updateMatch.bind(db);
  let bumped = false;
  db.updateMatch = async (id, v, patch) => {
    if (!bumped) { bumped = true; const row = await db.getMatch(id); await orig(id, row.version, { version: row.version + 1 }); }
    return orig(id, v, patch);
  };
  const r = await actionOp(db, ash, { matchId: match.id, action: { type: 'roll' } });
  assert.equal(r.error, undefined);
  assert.equal(r.match.state.phase, 'move');
});

test('sair do lobby passa o anfitrião; sair em jogo vira CPU', async () => {
  const { db, ash, gary } = await setup();
  const { match } = await matchOp(db, ash, { op: 'create', name: 'Y' });
  await matchOp(db, gary, { op: 'join', matchId: match.id });
  await matchOp(db, ash, { op: 'leave', matchId: match.id });
  const row = await db.getMatch(match.id);
  assert.equal(row.host_id, gary.id);
  assert.equal(row.lobby.length, 1);

  const m2 = (await matchOp(db, ash, { op: 'create', name: 'Z' })).match;
  await matchOp(db, gary, { op: 'join', matchId: m2.id });
  await matchOp(db, gary, { op: 'update', matchId: m2.id, ready: true });
  await matchOp(db, ash, { op: 'start', matchId: m2.id });
  const r = await matchOp(db, gary, { op: 'leave', matchId: m2.id });
  const g = r.match.state.players.find(p => p.id === gary.id);
  assert.equal(g.isBot, true);
});

test('fim de partida grava Pokédex, estatísticas, pontos e Cofre no perfil', async () => {
  const { db, ash } = await setup();
  await profileOp(db, ash, { op: 'get' });
  const fake = {
    id: 'm1', winner: ash.id,
    players: [{ id: ash.id, caught: ['pikachu', 'eevee'], champion: true, badges: [1, 2, 3, 4, 5, 6], eliteStage: 4,
      team: [{ uid: 'u1', sp: 'raichu', lvl: 40, shiny: false }], box: [{ uid: 'u2', sp: 'eevee', lvl: 12, shiny: true }],
      stats: { captures: 2, shinies: 1, pvpWins: 1 } }]
  };
  await recordResults(db, fake);
  const p = await db.getProfile(ash.id);
  assert.deepEqual(p.pokedex.sort(), ['eevee', 'pikachu']);
  assert.equal(p.stats.wins, 1);
  assert.equal(p.stats.champion, 1);
  assert.equal(p.vault[0].uid, 'u2', 'shiny tem prioridade no Cofre');
  assert.ok(p.points > 0);
});

test('admin: só is_admin; Pokémon do Dia e presente para o Cofre', async () => {
  const { db, ash, gary } = await setup();
  await profileOp(db, ash, { op: 'get' }); // primeiro perfil do banco em memória vira admin
  await profileOp(db, gary, { op: 'get' });
  await rejects(adminOp(db, gary, { op: 'list_users' }), /administradores/);
  const d = await adminOp(db, ash, { op: 'set_daily', species: 'mewtwo' });
  assert.equal(d.dailyPokemon, 'mewtwo');
  await adminOp(db, ash, { op: 'grant_mon', userId: gary.id, species: 'dratini', level: 9, shiny: true });
  const g = await db.getProfile(gary.id);
  assert.equal(g.vault[0].sp, 'dratini');
});

test('Cofre: Pokémon herdado entra limitado ao nível 10', async () => {
  const { db, ash } = await setup();
  await profileOp(db, ash, { op: 'get' });
  await db.upsertProfile(ash.id, { vault: [{ uid: 'v1', sp: 'dragonite', lvl: 50, shiny: true }] });
  const { match } = await matchOp(db, ash, { op: 'create', name: 'Herança' });
  await matchOp(db, ash, { op: 'update', matchId: match.id, vaultUid: 'v1' });
  await matchOp(db, ash, { op: 'add_bot', matchId: match.id });
  const s = (await matchOp(db, ash, { op: 'start', matchId: match.id })).match.state;
  const team = s.players.find(p => p.id === ash.id).team;
  assert.equal(team.length, 2);
  assert.equal(team[1].sp, 'dragonite');
  assert.ok(team[1].lvl <= 10);
});
