// v19: Mochila da conta, TM, golpes novos, Transformação (Ditto/Mew), selvagens no nível do jogador no Battle Royale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction, scaleWildForRoyale } from '../shared/engine.js';
import { startBattle, submitChoice } from '../shared/rules/battle.js';
import { createMon } from '../shared/rules/monsters.js';
import { createRng } from '../shared/rules/rng.js';
import { MOVES, tmMovesFor, monMoves, rollMoveIds } from '../shared/data/moves.js';
import { ITEMS, isKeepable, cleanBring, shopFor } from '../shared/data/items.js';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { matchOp, profileOp, recordResults, bagFromMatch } from '../api/_lib/core.js';
import { marketOp } from '../api/_lib/market.js';

const game = (seed = 3) => createMatch({ seed, mode: 'online', now: 0, players: [{ id: 'ash', name: 'Ash' }, { id: 'gary', name: 'Gary' }] });

test('golpes novos por tipo e TM', () => {
  for (const t of ['fire', 'water', 'dragon', 'fairy']) for (const k of ['p', 's2', 'x2']) assert.ok(MOVES[`${t}_${k}`], `${t}_${k}`);
  const tms = tmMovesFor('charizard').map(m => m.id);
  assert.ok(tms.includes('fire_x2') && tms.includes('flying_p'));
  assert.deepEqual(monMoves({ sp: 'ditto', moves: ['normal_q', 'normal_s'] }).map(m => m.id), ['normal_q', 'transform']);
  const ids = new Set();
  for (let i = 0; i < 300; i++) ids.add(rollMoveIds(createRng(i), 'pikachu')[1]);
  assert.ok([...ids].some(id => id.endsWith('_p')) && [...ids].some(id => id.endsWith('2')), 'variações novas aparecem');
  assert.equal(ITEMS.shiny_charm.price, 0);
  assert.ok(!shopFor(5).some(i => i.id === 'shiny_charm' || i.id === 'tm'), 'Amuleto e TM não são vendidos nas cidades');
});

test('Transform: Ditto copia, guarda forma (sem gastar a vez), usa forma guardada e volta no fim da batalha', () => {
  const s = game();
  const p = s.players[0];
  const ditto = createMon(createRng(1), 'ditto', 30, { shiny: true });
  p.team = [ditto];
  const foe = createMon(createRng(2), 'charizard', 30);
  startBattle(s, { kind: 'wild', pid: 'ash', foe: { kind: 'wild', mon: foe } });
  const rng = createRng(5);
  submitChoice(s, rng, 'ash', { move: 'attack', slot: 1 });
  assert.equal(ditto.sp, 'charizard');
  assert.equal(ditto.tf.sp, 'ditto');
  submitChoice(s, rng, 'ash', { move: 'form', op: 'store' });
  assert.equal(ditto.forms.length, 1);
  assert.equal(s.battle.choices[0], null, 'guardar não gastou a vez');
  submitChoice(s, rng, 'ash', { move: 'form', op: 'reset' });
  assert.equal(ditto.sp, 'ditto');
  if (!s.battle.over) {
    submitChoice(s, rng, 'ash', { move: 'form', op: 'use', i: 0 });
    assert.equal(ditto.sp, 'charizard');
    submitChoice(s, rng, 'ash', { move: 'flee' });
  }
  // a batalha termina e ele volta a ser Ditto, mantendo a forma guardada
  while (s.battle && !s.battle.over) submitChoice(s, rng, 'ash', { move: 'flee' });
  assert.equal(ditto.sp, 'ditto');
  assert.ok(!ditto.tf);
  assert.equal(ditto.forms[0].sp, 'charizard');
});

test('TM na partida troca o 2º golpe', () => {
  const s = game();
  const p = s.players[0];
  p.items.tm = 1;
  const r = applyAction(s, 'ash', { type: 'use_item', item: 'tm', index: 0, move: `${(p.team[0].sp === 'charmander' ? 'fire' : 'normal')}_x2` }, { now: 0 });
  if (r.error) { // inicial de outro tipo: usa um golpe da lista dele
    const mv = tmMovesFor(p.team[0].sp)[2].id;
    const r2 = applyAction(s, 'ash', { type: 'use_item', item: 'tm', index: 0, move: mv }, { now: 0 });
    assert.ok(!r2.error, r2.error);
    assert.equal(r2.state.players[0].team[0].moves[1], mv);
  } else assert.ok(!r.state.players[0].items.tm);
  assert.match(applyAction(s, 'ash', { type: 'use_item', item: 'tm', index: 0, move: 'dragon_x' }, { now: 0 }).error || '', /aprende|não tem/);
});

test('Mochila: só Pokébolas/Amuleto/TM ficam; levar tira da conta; sobra volta', async () => {
  assert.ok(isKeepable('ultra_ball') && isKeepable('tm') && isKeepable('shiny_charm'));
  assert.ok(!isKeepable('potion') && !isKeepable('revive') && !isKeepable('x_attack') && !isKeepable('rare_candy'));
  assert.deepEqual(cleanBring({ ultra_ball: 50, tm: 9, potion: 3 }), { ultra_ball: 10, tm: 3 });
  assert.deepEqual(bagFromMatch({ items: { poke_ball: 7, potion: 3, tm: 1, ultra_ball: 2 } }), { poke_ball: 2, tm: 1, ultra_ball: 2 });

  const db = createMemoryDb();
  const ash = await db.verifyToken('dev:ash@kanto.com');
  const { profile } = await profileOp(db, ash, { op: 'get' });
  await db.upsertProfile(ash.id, { vault: [{ uid: 'v1', sp: 'pikachu', lvl: 20 }], stats: { ...(profile.stats || {}), bag: { ultra_ball: 6, tm: 2 } } });
  const { match } = await matchOp(db, ash, { op: 'solo', bots: 1, teamUids: ['v1'], bringItems: { ultra_ball: 4, tm: 1 } });
  const me = match.state.players.find(p => p.id === ash.id);
  assert.equal(me.items.ultra_ball, 4);
  assert.equal(me.items.tm, 1);
  let prof = await db.getProfile(ash.id);
  assert.deepEqual(prof.stats.bag, { ultra_ball: 2, tm: 1 });
  // fim: sobrou 1 Ultra Ball + 3 Poké Ball extras + 2 poções → só as bolas voltam
  const st = match.state;
  const p = st.players.find(x => x.id === ash.id);
  p.items = { ultra_ball: 1, poke_ball: 8, potion: 2, tm: 1 };
  st.status = 'finished'; st.winner = p.id;
  await recordResults(db, st, { mode: 'collection' });
  prof = await db.getProfile(ash.id);
  assert.deepEqual(prof.stats.bag, { ultra_ball: 3, tm: 2, poke_ball: 3 });
  assert.ok(st.bagChanges[ash.id]);
  // TM num Pokémon da Coleção
  const mv = tmMovesFor('pikachu').find(m => m.id === 'electric_x2').id;
  const r = await profileOp(db, ash, { op: 'use_tm', uid: 'v1', move: mv });
  assert.equal(r.profile.vault[0].moves[1], mv);
  assert.equal(r.profile.stats.bag.tm, 1);
});

test('Mercado: anunciar, comprar e cancelar itens', async () => {
  const db = createMemoryDb();
  const ash = await db.verifyToken('dev:ash@kanto.com');
  const gary = await db.verifyToken('dev:gary@kanto.com');
  await profileOp(db, ash, { op: 'get' }); await profileOp(db, gary, { op: 'get' });
  await db.upsertProfile(ash.id, { stats: { bag: { tm: 3, shiny_charm: 1 } } });
  await db.walletAdd(gary.id, 0, 5000);
  await assert.rejects(marketOp(db, ash, { op: 'create_item', item: 'potion', qty: 1, priceGold: 10 }), /não pode ser negociado/);
  const { listing } = await marketOp(db, ash, { op: 'create_item', item: 'tm', qty: 2, priceGold: 800 });
  assert.equal((await db.getProfile(ash.id)).stats.bag.tm, 1);
  const list = (await marketOp(db, gary, { op: 'browse', kind: 'items' })).listings;
  assert.equal(list.length, 1);
  await marketOp(db, gary, { op: 'buy', listingId: listing.id });
  assert.equal((await db.getProfile(gary.id)).stats.bag.tm, 2);
  const l2 = (await marketOp(db, ash, { op: 'create_item', item: 'shiny_charm', qty: 1, priceGold: 9000 })).listing;
  await marketOp(db, ash, { op: 'cancel', listingId: l2.id });
  assert.equal((await db.getProfile(ash.id)).stats.bag.shiny_charm, 1);
});

test('Battle Royale: selvagem comum acompanha o nível do jogador; lendário e Vermelho não', () => {
  const s = createMatch({ seed: 4, mode: 'online', now: 0, rules: 'royale', players: [{ id: 'ash', name: 'Ash' }, { id: 'gary', name: 'Gary' }] });
  const p = s.players[0];
  p.team[0].lvl = 30;
  const m = createMon(createRng(3), 'rattata', 5);
  scaleWildForRoyale(s, createRng(1), p, m, 1);
  assert.ok(m.lvl >= 27 && m.lvl <= 31, `nível ${m.lvl}`);
  const red = createMon(createRng(3), 'gyarados', 25);
  scaleWildForRoyale(s, createRng(1), p, red, 4);
  assert.equal(red.lvl, 25);
  const c = game();
  const m2 = createMon(createRng(3), 'rattata', 5);
  scaleWildForRoyale(c, createRng(1), c.players[0], m2, 1);
  assert.equal(m2.lvl, 5, 'fora do Royale não muda');
});
