// Trocas dentro da partida (Pokémon, itens e ouro).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction } from '../shared/engine.js';
import { createMon } from '../shared/rules/monsters.js';
import { createRng } from '../shared/rules/rng.js';

const T0 = 1_700_000_000_000;
const two = (opts = {}) => createMatch({ seed: 3, mode: 'online', now: T0, options: opts,
  players: [{ id: 'ash', name: 'Ash', starter: 'charmander' }, { id: 'gary', name: 'Gary', starter: 'squirtle' }] });

test('troca entre humanos: proposta, aceite, Pokémon/itens/ouro mudam de dono', () => {
  let s = two();
  const rng = createRng(1);
  s.players[0].box.push(createMon(rng, 'pidgey', 12));
  s.players[1].team.push(createMon(rng, 'rattata', 9));
  const pid = s.players[0].box[0].uid, rid = s.players[1].team[1].uid;
  const g0 = s.players[0].gold, g1 = s.players[1].gold;
  let r = applyAction(s, 'ash', { type: 'trade_offer', to: 'gary', give: { mon: pid, gold: 100, items: { potion: 1 } }, want: { mon: rid } }, { now: T0 });
  assert.equal(r.error, undefined, r.error);
  s = r.state;
  assert.equal(s.trades.length, 1);
  // Gary aceita mesmo não sendo a vez dele
  r = applyAction(s, 'gary', { type: 'trade_respond', id: s.trades[0].id, accept: true }, { now: T0 });
  assert.equal(r.error, undefined, r.error);
  s = r.state;
  const [ash, gary] = s.players;
  assert.ok([...gary.team, ...gary.box].some(m => m.uid === pid));
  assert.ok([...ash.team, ...ash.box].some(m => m.uid === rid));
  assert.equal(ash.gold, g0 - 100);
  assert.equal(gary.gold, g1 + 100);
  assert.ok(ash.tradedAway.includes(pid));
  assert.ok(gary.tradedAway.includes(rid));
  assert.equal(s.trades.length, 0);
});

test('troca: validações (vazio, sem saldo, competitivo, cancelar)', () => {
  let s = two();
  assert.match(applyAction(s, 'ash', { type: 'trade_offer', to: 'gary', give: {}, want: {} }, { now: T0 }).error, /vazia/);
  assert.match(applyAction(s, 'ash', { type: 'trade_offer', to: 'gary', give: { gold: 999999 }, want: { gold: 1 } }, { now: T0 }).error, /não tem/);
  assert.match(applyAction(s, 'ash', { type: 'trade_offer', to: 'gary', give: { mon: s.players[0].team[0].uid }, want: { gold: 1 } }, { now: T0 }).error, /pelo menos 1/);
  assert.match(applyAction(two({ trades: false }), 'ash', { type: 'trade_offer', to: 'gary', give: { gold: 10 }, want: { gold: 1 } }, { now: T0 }).error, /desativadas/);
  let r = applyAction(s, 'ash', { type: 'trade_offer', to: 'gary', give: { gold: 10 }, want: { items: { potion: 1 } } }, { now: T0 });
  s = r.state;
  r = applyAction(s, 'ash', { type: 'trade_respond', id: s.trades[0].id, cancel: true }, { now: T0 });
  assert.equal(r.state.trades.length, 0);
});

test('troca com CPU: aceita se for vantajosa, recusa se não for', () => {
  let s = createMatch({ seed: 4, mode: 'online', now: T0, players: [{ id: 'ash', name: 'Ash' }, { id: 'cpu_1', name: 'CPU', isBot: true }] });
  const cpuMon = s.players[1].team[0].uid;
  let r = applyAction(s, 'ash', { type: 'trade_offer', to: 'cpu_1', give: { gold: 1 }, want: { items: { poke_ball: 1 } } }, { now: T0 });
  assert.equal(r.error, undefined, r.error);
  assert.ok(r.state.log.some(l => /recusou/.test(l.msg)));
  r = applyAction(s, 'ash', { type: 'trade_offer', to: 'cpu_1', give: { gold: 400 }, want: { items: { poke_ball: 1 } } }, { now: T0 });
  assert.ok(r.state.log.some(l => /Troca feita/.test(l.msg)));
  assert.ok(cpuMon);
});
