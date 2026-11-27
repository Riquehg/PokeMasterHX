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

test('Pokédex completa: #001 a #1025 (+ formas), ids únicos, tipos válidos, evoluções existentes', () => {
  const base = SPECIES_LIST.filter(s => !s.form);
  assert.equal(base.length, 1025);
  assert.deepEqual(base.map(s => s.dex), Array.from({ length: 1025 }, (_, i) => i + 1));
  assert.equal(new Set(SPECIES_LIST.map(s => s.id)).size, SPECIES_LIST.length);
  for (const s of SPECIES_LIST.filter(x => x.form)) assert.ok(SPECIES[s.form] && SPECIES[s.form].dex === s.dex, s.id);
  for (const s of SPECIES_LIST) for (const e of s.evos) assert.ok(SPECIES[e.to] && (e.lvl || e.item), `${s.id} → ${e.to}`);
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

test('golpes: todo Pokémon tem 3 (v64); o 1º é do 1º tipo; suporte tem golpe de suporte', () => {
  for (const s of SPECIES_LIST) {
    const mv = movesOf(s.id);
    assert.equal(mv.length, s.id === 'ditto' ? 2 : 3, s.id);
    assert.equal(mv[0].type, s.types[0]);
    assert.equal(mv[0].kind, 'dmg');
    if (s.role) assert.ok(['heal', 'buff', 'debuff', 'drain'].includes(mv[1].kind), s.id);
    else assert.equal(mv[1].type, s.types[1] || s.types[0], s.id);
  }
  assert.equal(movesOf('blissey')[1].kind, 'heal');
  assert.equal(movesOf('gyarados')[1].kind, 'buff');
  assert.equal(movesOf('arcanine')[1].kind, 'debuff');
  assert.equal(movesOf('amoonguss')[1].kind, 'drain');
  assert.deepEqual(movesOf('charizard').map(m => m.name).slice(0, 2), ['Ember', 'Air Slash']);
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
  let s = battleWith(createMon(rng, 'charizard', 30, { starter: true, nature: 'Hardy', moves: ['fire_q', 'flying_s'] }), createMon(rng, 'venusaur', 30, { nature: 'Hardy', moves: ['grass_q', 'poison_s', 'grass_s'] }));
  submitChoice(s, rng, 'a', { move: 'attack', slot: 0 });
  const hit = s.fx.find(f => f.k === 'hit' && f.side === 0);
  assert.equal(hit.move, 'Ember');
  assert.equal(hit.mult, 2);

  // Blissey cura
  s = battleWith(createMon(rng, 'blissey', 30, { starter: true, moves: ['normal_q', 'recover'] }), createMon(rng, 'magikarp', 5));
  const bl = s.players[0].team[0];
  bl.hp = 10;
  submitChoice(s, rng, 'a', { move: 'attack', slot: 1 });
  assert.ok(s.players[0].team[0].hp > 10);

  // Gyarados fortalece (estágio +1)
  s = battleWith(createMon(rng, 'gyarados', 30, { starter: true, moves: ['water_q', 'swords_dance'] }), createMon(rng, 'magikarp', 5));
  submitChoice(s, rng, 'a', { move: 'attack', slot: 1 });
  assert.equal(s.battle.sides[0].stage[s.players[0].team[0].uid], 1);

  // Arcanine intimida: a habilidade 😠 Intimidação já tira 1 estágio ao entrar; o golpe tira mais 1
  s = battleWith(createMon(rng, 'arcanine', 30, { starter: true, moves: ['fire_q', 'intimidate'] }), createMon(rng, 'rattata', 10));
  const foe = sideActive(s, s.battle.sides[1]);
  assert.equal(s.battle.sides[1].stage[foe.uid], -1);
  submitChoice(s, rng, 'a', { move: 'attack', slot: 1 });
  assert.equal(s.battle.sides[1].stage[foe.uid], -2);
});

test('raridade: shiny raríssimo e lendário difícil de capturar', () => {
  assert.ok(BASE_SHINY_RATE <= 1 / 400);
  const rng = createRng(77);
  let sh = 0;
  for (let i = 0; i < 20000; i++) if (rollWild(rng, 1).shiny) sh++;
  assert.ok(sh > 20 && sh < 80, `shinies em 20000: ${sh}`);
  assert.ok(CAPTURE_TARGET[5] >= 8 && CAPTURE_TARGET[5] > CAPTURE_TARGET[4] + 1);
  assert.ok(WILD_FLEE_AFTER_FAIL[5] >= 0.5);
  assert.ok(raidCatchChance({ badges: [1, 2, 3, 4, 5, 6] }) <= 0.2);
  assert.equal(ITEMS.master_ball.price, 0, 'Master Ball não vende em loja');
});

test('variação individual: IVs e golpes mudam de um Pikachu para outro', async () => {
  const { rollMoveIds, monMoves, MOVES, possibleSecondMoves } = await import('../shared/data/moves.js');
  const { ivPercent, computeStats } = await import('../shared/rules/monsters.js');
  const rng = createRng(11);
  const seen = new Set(), pots = new Set();
  for (let i = 0; i < 200; i++) {
    const m = createMon(rng, 'pikachu', 20);
    assert.ok(m.iv.hp >= 0 && m.iv.hp <= 31 && m.iv.atk <= 31 && m.iv.spe <= 31);
    assert.equal(m.moves.length, 3);
    assert.equal(monMoves(m)[0].type, 'electric');
    seen.add(monMoves(m)[1].name);
    pots.add(ivPercent(m));
  }
  assert.ok(seen.has('Thunderbolt') && seen.has('Thunder'), [...seen].join(','));
  assert.ok(seen.size >= 3, 'tem golpes de cobertura também');
  assert.ok(pots.size > 20);
  // IV perfeito x péssimo muda o ataque
  const hi = computeStats('pikachu', 30, false, 'Hardy', { hp: 31, atk: 31, spe: 31 });
  const lo = computeStats('pikachu', 30, false, 'Hardy', { hp: 0, atk: 0, spe: 0 });
  assert.ok(hi.atk > lo.atk && hi.maxHp > lo.maxHp && hi.spe > lo.spe);
  // golpe pesado erra no 1–2
  assert.equal(MOVES.electric_x.miss, 2);
  assert.ok(possibleSecondMoves('pikachu').some(m => m.name === 'Iron Tail'));
  // Pokémon antigo (sem variação salva) usa a padrão da espécie
  assert.deepEqual(monMoves({ sp: 'charizard' }).map(m => m.name).slice(0, 2), ['Ember', 'Air Slash']);
  assert.ok(rollMoveIds(rng, 'blissey').length === 3);
});
