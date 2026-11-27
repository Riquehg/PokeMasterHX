// Modos de jogo: Battle Royale e Conquista.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction, whoMustAct, _internals } from '../shared/engine.js';
import { createMon } from '../shared/rules/monsters.js';
import { createRng } from '../shared/rules/rng.js';
import { stormAt, STORM_START, citiesOf } from '../shared/rules/modes.js';
import * as T from '../shared/data/trainers.js';
import { useMap } from '../shared/data/board.js';

const T0 = 1700000000000;
const make = (rules, extra = {}) => createMatch({ seed: 11, mode: 'online', now: T0, rules, ...extra,
  players: [{ id: 'ash', name: 'Ash', starter: 'charmander' }, { id: 'gary', name: 'Gary', starter: 'squirtle' }, { id: 'misty', name: 'Misty', starter: 'bulbasaur' }] });
const endTurns = (s, n) => { for (let i = 0; i < n; i++) { const p = s.players[s.current]; const r = applyAction(s, p.id, { type: 'end_turn' }, { now: T0 }); assert.ok(!r.error, r.error); s = r.state; } return s; };

test('Battle Royale: jogadores espalhados, todos obedecem, tempestade fecha e machuca quem está fora', async () => {
  let s = make('royale');
  assert.equal(s.rules, 'royale');
  assert.ok(s.royale.center && s.royale.ring > 0);
  assert.equal(new Set(s.players.map(p => p.pos)).size, 3, 'cada um começa num lugar');
  assert.ok(s.players.every(p => p.noRules && p.team[0].lvl >= 12));
  const ring0 = s.royale.ring;
  // avança rodadas até a tempestade começar
  s = endTurns(s, 3 * STORM_START);
  assert.ok(s.royale.ring < ring0, 'a tempestade fechou');
  // coloca Ash fora da área segura e passa uma rodada
  const far = Object.keys(s.board || {}).length >= 0 && (await import('../shared/data/board.js')).SPACE_LIST.find(x => stormAt(s, x.id).in && !x.gate);
  s.players[0].pos = far.id;
  const hp0 = s.players[0].team[0].hp;
  s = endTurns(s, 3);
  assert.ok(s.players[0].team[0].hp < hp0 || s.players[0].out, 'a tempestade machucou');
});

test('Battle Royale: perder o PvP elimina; o último de pé vence', () => {
  let s = make('royale');
  // Misty perde: equipe zerada e eliminação direta pelas regras
  s.players[1].team.forEach(m => { m.hp = 0; });
  s.players[2].out = true; s.players[2].place = 3; // Misty já tinha sido eliminada
  // Gary e Misty caem em PvP contra Ash (simulado pelo fim de batalha)
  s.players[1].team.forEach(m => { m.hp = 1; });
  s.players[0].pos = s.players[1].pos;
  s = _internals.land(s, 'ash', s.players[1].pos);
  assert.equal(s.battle?.kind, 'pvp', 'cair na casa de outro = batalha obrigatória');
  // Ash ataca até Gary cair
  for (let i = 0; i < 20 && s.battle; i++) {
    const who = whoMustAct(s);
    for (const id of who) { const r = applyAction(s, id, { type: 'battle', move: 'attack', slot: 0 }, { now: T0 }); if (!r.error) s = r.state; }
  }
  const gary = s.players.find(p => p.id === 'gary');
  assert.ok(gary.out, 'Gary eliminado');
  assert.equal(s.status, 'finished', 'Misty já estava sem Pokémon, Ash é o último de pé');
  assert.equal(s.winner, 'ash');
});

test('Battle Royale: Centro Pokémon cura só uma vez por cidade', () => {
  let s = make('royale');
  const city = s.players[0];
  const sp = T.GYMS[0].space;
  city.pos = sp; s.phase = 'action'; s.current = 0;
  s.royale.ring = 999;
  let r = applyAction(s, 'ash', { type: 'city', op: 'heal' }, { now: T0 });
  assert.ok(!r.error, r.error);
  r = applyAction(r.state, 'ash', { type: 'city', op: 'heal' }, { now: T0 });
  assert.match(r.error, /uma vez/);
  r = applyAction(s, 'ash', { type: 'city', op: 'gym' }, { now: T0 });
  assert.match(r.error, /ginásios estão fechados/);
});

test('Conquista: vencer o líder domina a cidade, escolher guarnição e outro jogador toma a cidade', () => {
  let s = make('conquest');
  assert.equal(s.rules, 'conquest');
  assert.equal(s.options.turnLimit, 40);
  const g = T.GYMS[0];
  const ash = s.players[0];
  ash.team = [createMon(createRng(1), 'charizard', 60, { starter: true, moves: ['fire_q', 'flying_s', 'fighting_s'] }), createMon(createRng(2), 'pidgeot', 50, {})];
  ash.pos = g.space; s.phase = 'action'; s.current = 0;
  let r = applyAction(s, 'ash', { type: 'city', op: 'gym' }, { now: T0 });
  assert.ok(!r.error, r.error); s = r.state;
  for (let i = 0; i < 20 && s.battle; i++) { const rr = applyAction(s, 'ash', { type: 'battle', move: 'attack', slot: 2 }, { now: T0 }); if (!rr.error) s = rr.state; }
  assert.equal(s.conquest.owners[g.id], 'ash');
  assert.ok(s.players[0].badges.includes(g.id));
  assert.deepEqual(whoMustAct(s), ['ash']);
  assert.equal(s.pending.kind, 'garrison');
  const pid = s.players[0].team[1].uid;
  r = applyAction(s, 'ash', { type: 'garrison', uids: [pid] }, { now: T0 });
  assert.ok(!r.error, r.error); s = r.state;
  assert.equal(s.conquest.garrison[g.id].length, 1);
  assert.equal(s.players[0].team.length, 1);
  assert.equal(citiesOf(s, 'ash'), 1);
  // renda no começo da rodada
  const gold = s.players[0].gold;
  s = endTurns(s, 3);
  assert.ok(s.players[0].gold > gold);
  // Gary ataca a guarnição e toma a cidade
  const gary = s.players.find(p => p.id === 'gary');
  gary.team = [createMon(createRng(3), 'mewtwo', 60, {})];
  gary.noRules = true;
  gary.pos = g.space; s.phase = 'action'; s.current = 1; s.turnFlags = {};
  r = applyAction(s, 'gary', { type: 'city', op: 'gym' }, { now: T0 });
  assert.ok(!r.error, r.error); s = r.state;
  assert.equal(s.battle.kind, 'siege');
  for (let i = 0; i < 20 && s.battle; i++) { const rr = applyAction(s, 'gary', { type: 'battle', move: 'attack', slot: 0 }, { now: T0 }); if (!rr.error) s = rr.state; }
  assert.equal(s.conquest.owners[g.id], 'gary');
  assert.ok(s.players[0].box.some(m => m.uid === pid), 'o defensor volta para o PC do dono anterior');
  assert.equal(s.pending.kind, 'garrison');
  useMap('kanto');
});

test('Conquista: dominar todas as cidades vence na hora; bônus de tipo da cidade', async () => {
  const { conquestMult } = await import('../shared/rules/modeBonus.js');
  let s = make('conquest');
  for (const g of T.GYMS.slice(1)) s.conquest.owners[g.id] = 'ash';
  assert.equal(conquestMult(s, 'ash', 'water', T.GYMS), 1.1); // Cerulean (Água) dominada
  assert.equal(conquestMult(s, 'gary', 'water', T.GYMS), 1);
  const g = T.GYMS[0];
  const ash = s.players[0];
  ash.team = [createMon(createRng(1), 'charizard', 60, { starter: true, moves: ['fire_q', 'flying_s', 'fighting_s'] })];
  ash.pos = g.space; s.phase = 'action'; s.current = 0;
  let r = applyAction(s, 'ash', { type: 'city', op: 'gym' }, { now: T0 });
  s = r.state;
  for (let i = 0; i < 20 && s.battle; i++) { const rr = applyAction(s, 'ash', { type: 'battle', move: 'attack', slot: 2 }, { now: T0 }); if (!rr.error) s = rr.state; }
  assert.equal(s.status, 'finished');
  assert.equal(s.winner, 'ash');
});
