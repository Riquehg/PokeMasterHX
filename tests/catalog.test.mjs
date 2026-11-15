// Catálogo completo (806), golpes e raridade.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SPECIES_LIST, SPECIES, getSpecies, speciesByTier, STARTERS } from '../shared/data/pokemon.js';
import { movesOf, SUPPORT } from '../shared/data/moves.js';
import { TYPES } from '../shared/rules/types.js';
import { BASE_SHINY_RATE, rollWild, createMon, maxHpOf } from '../shared/rules/monsters.js';
import { CAPTURE_TARGET, WILD_FLEE_AFTER_FAIL, startBattle, submitChoice, sideActive } from '../shared/rules/battle.js';
import { createMatch, raidCatchChance } from '../shared/engine.js';
import { createRng } from '../shared/rules/rng.js';
import { ITEMS } from '../shared/data/items.js';

test('Pokédex completa: #001 a #806, ids únicos, tipos válidos, evoluções existentes', () => {
  assert.equal(SPECIES_LIST.length, 806);
  assert.deepEqual(SPECIES_LIST.map(s => s.dex), Array.from({ length: 806 }, (_, i) => i + 1));
  assert.equal(new Set(SPECIES_LIST.map(s => s.id)).size, 806);
  for (const s of SPECIES_LIST) {
    assert.ok(s.types.length >= 1 && s.types.length <= 2, s.id);
    for (const t of s.types) assert.ok(TYPES.includes(t), `${s.id}: ${t}`);
    if (s.evolvesTo) assert.ok(SPECIES[s.evolvesTo], `${s.id} → ${s.evolvesTo}`);
    assert.ok(s.tier >= 1 && s.tier <= 5 && s.hp > 0 && s.str > 0, s.id);
  }
  for (const id of STARTERS) assert.ok(getSpecies(id));
  for (let t = 1; t <= 5; t++) assert.ok(speciesByTier(t).length >= 40, `tier ${t}`);
  // lendários todos no tier 5
  for (const s of SPECIES_LIST) if (s.legendary) assert.equal(s.tier, 5, s.id);
  for (const id of ['mewtwo', 'raikou', 'rayquaza', 'arceus', 'tapu_koko', 'necrozma']) assert.equal(getSpecies(id).tier, 5, id);
  for (const id of ['greninja', 'mimikyu', 'lucario', 'garchomp']) assert.ok(getSpecies(id), id);
});

test('golpes: todo Pokémon tem 2; o 1º é do 1º tipo; suporte tem golpe de suporte', () => {
  for (const s of SPECIES_LIST) {
    const mv = movesOf(s.id);
    assert.equal(mv.length, 2, s.id);
    assert.equal(mv[0].type, s.types[0]);
    assert.equal(mv[0].kind, 'dmg');
    if (s.role) assert.ok(['heal', 'buff', 'debuff', 'drain'].includes(mv[1].kind), s.id);
    else assert.equal(mv[1].type, s.types[1] || s.types[0], s.id);
  }
  assert.equal(movesOf('blissey')[1].kind, 'heal');
  assert.equal(movesOf('gyarados')[1].kind, 'buff');
  assert.equal(movesOf('arcanine')[1].kind, 'debuff');
  assert.equal(movesOf('amoonguss')[1].kind, 'drain');
  assert.deepEqual(movesOf('charizard').map(m => m.name), ['Ember', 'Air Slash']);
  assert.ok(SUPPORT.healer);
});

function battleWith(mine, foe) {
  const s = createMatch({ seed: 9, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  s.players[0].team = [mine];
  startBattle(s, { kind: 'wild', pid: 'a', foe: { kind: 'wild', mon: foe } });
  return s;
}

test('batalha: golpe escolhido define tipo; suporte cura, fortalece e intimida', () => {
  const rng = createRng(5);
  // Charizard: Ember (fogo) contra Venusaur é super efetivo
  let s = battleWith(createMon(rng, 'charizard', 30, { starter: true, nature: 'Hardy' }), createMon(rng, 'venusaur', 30, { nature: 'Hardy' }));
  submitChoice(s, rng, 'a', { move: 'attack', slot: 0 });
  const hit = s.fx.find(f => f.k === 'hit' && f.side === 0);
  assert.equal(hit.move, 'Ember');
  assert.equal(hit.mult, 2);

  // Blissey cura
  s = battleWith(createMon(rng, 'blissey', 30, { starter: true }), createMon(rng, 'magikarp', 5));
  const bl = s.players[0].team[0];
  bl.hp = 10;
  submitChoice(s, rng, 'a', { move: 'attack', slot: 1 });
  assert.ok(s.players[0].team[0].hp > 10);

  // Gyarados fortalece (estágio +1)
  s = battleWith(createMon(rng, 'gyarados', 30, { starter: true }), createMon(rng, 'magikarp', 5));
  submitChoice(s, rng, 'a', { move: 'attack', slot: 1 });
  assert.equal(s.battle.sides[0].stage[s.players[0].team[0].uid], 1);

  // Arcanine intimida (estágio −1 no rival)
  s = battleWith(createMon(rng, 'arcanine', 30, { starter: true }), createMon(rng, 'rattata', 10));
  submitChoice(s, rng, 'a', { move: 'attack', slot: 1 });
  const foe = sideActive(s, s.battle.sides[1]);
  assert.equal(s.battle.sides[1].stage[foe.uid], -1);
});

test('raridade: shiny raríssimo e lendário difícil de capturar', () => {
  assert.ok(BASE_SHINY_RATE <= 1 / 400);
  const rng = createRng(77);
  let sh = 0;
  for (let i = 0; i < 20000; i++) if (rollWild(rng, 1).shiny) sh++;
  assert.ok(sh > 20 && sh < 80, `shinies em 20000: ${sh}`);
  assert.ok(CAPTURE_TARGET[5] >= 10);
  assert.ok(WILD_FLEE_AFTER_FAIL[5] >= 0.5);
  assert.ok(raidCatchChance({ badges: [1, 2, 3, 4, 5, 6] }) <= 0.2);
  assert.equal(ITEMS.master_ball.price, 0, 'Master Ball não vende em loja');
});
