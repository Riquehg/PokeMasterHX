// Verificação das regras pedidas: Pokébolas (inclusive temáticas com aura), evolução por nível e por pedra, tiers das casas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction } from '../shared/engine.js';
import { ITEMS, ballBonusAgainst, shopFor } from '../shared/data/items.js';
import { SPECIES, SPECIES_LIST, getSpecies } from '../shared/data/pokemon.js';
import { SPACE_LIST } from '../shared/data/board.js';
import { createRng } from '../shared/rules/rng.js';
import { createMon, gainXp, rollWild, WILD_LEVELS } from '../shared/rules/monsters.js';

const T0 = 1_700_000_000_000;

test('todas as Pokébolas existem, têm bônus e estão na loja certa', () => {
  const balls = Object.entries(ITEMS).filter(([, it]) => it.kind === 'ball').map(([id]) => id);
  assert.deepEqual(balls.sort(), ['aqua_ball', 'flame_ball', 'great_ball', 'master_ball', 'mystic_ball', 'poke_ball', 'rainbow_ball', 'shadow_ball', 'ultra_ball', 'volt_ball']);
  assert.ok(shopFor(1).some(o => o.id === 'poke_ball'));
  assert.ok(!shopFor(1).some(o => o.id === 'ultra_ball'), 'Ultra só a partir de cidade tier 3');
  assert.ok(shopFor(3).some(o => o.id === 'flame_ball'));
  assert.ok(!shopFor(5).some(o => o.id === 'master_ball'), 'Master Ball não é vendida');
});

test('Pokébolas temáticas: +3 contra os tipos do tema, +1 nos demais', () => {
  assert.equal(ballBonusAgainst('flame_ball', ['grass']), 3);
  assert.equal(ballBonusAgainst('flame_ball', ['water']), 1);
  assert.equal(ballBonusAgainst('aqua_ball', ['rock', 'ground']), 3);
  assert.equal(ballBonusAgainst('volt_ball', ['flying']), 3);
  assert.equal(ballBonusAgainst('shadow_ball', ['ghost']), 3);
  assert.equal(ballBonusAgainst('mystic_ball', ['dragon']), 3);
  assert.equal(ballBonusAgainst('rainbow_ball', ['normal']), 3);
  assert.equal(ballBonusAgainst('ultra_ball', ['normal']), 2);
});

test('capturar com bola temática dá a aura ao Pokémon', () => {
  const auras = { flame_ball: 'flame', aqua_ball: 'aqua', volt_ball: 'volt', shadow_ball: 'shadow', mystic_ball: 'mystic', rainbow_ball: 'rainbow' };
  for (const [ball, aura] of Object.entries(auras)) {
    let done = false;
    for (let seed = 1; seed < 400 && !done; seed++) {
      let s = createMatch({ seed, now: T0, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', isBot: true }] });
      s.players[0].items[ball] = 5;
      const P = SPACE_LIST.find(x => x.type === 'pokemon' && x.tier === 1);
      s.players[0].pos = P.links[0];
      s.phase = 'move';
      s.pending = { kind: 'move', roll: 1, bonus: 0, steps: 1, options: [P.id] };
      let r = applyAction(s, 'a', { type: 'move', to: s.pending.options[0] }, { now: T0 });
      if (r.error || !r.state.battle) continue;
      r = applyAction(r.state, 'a', { type: 'battle', move: 'ball', item: ball }, { now: T0 });
      const caught = r.state.players[0].team.find(m => m.ball === ball);
      if (caught) { assert.equal(caught.aura, aura, ball); done = true; }
    }
    assert.ok(done, `não consegui capturar com ${ball}`);
  }
});

test('evolução por nível acontece no nível do catálogo', () => {
  const rng = createRng(3);
  const checks = [['bulbasaur', 'ivysaur'], ['charmander', 'charmeleon'], ['magikarp', 'gyarados'], ['pichu', 'pikachu']];
  for (const [from, to] of checks) {
    const lvl = getSpecies(from).evolutionLevel;
    const mon = createMon(rng, from, lvl - 1);
    gainXp(mon, 5); assert.equal(mon.sp, from, `${from} não pode evoluir antes do nível ${lvl}`);
    gainXp(mon, (lvl - 1) * 8);
    assert.equal(mon.lvl, lvl);
    assert.equal(mon.sp, to, `${from} deveria virar ${to} no nível ${lvl}`);
  }
});

test('Pedra Evolutiva evolui na hora (fora de batalha) e é consumida', () => {
  let s = createMatch({ seed: 9, now: T0, players: [{ id: 'a', name: 'A', starter: 'eevee' }, { id: 'b', name: 'B', isBot: true }] });
  s.players[0].items.evolution_stone = 1;
  const r = applyAction(s, 'a', { type: 'use_item', item: 'evolution_stone', index: 0 }, { now: T0 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.players[0].team[0].sp, getSpecies('eevee').evolvesTo);
  assert.equal(r.state.players[0].items.evolution_stone, undefined);
  // Pokémon sem evolução não gasta a pedra
  let s2 = createMatch({ seed: 9, now: T0, players: [{ id: 'a', name: 'A', starter: 'pikachu' }, { id: 'b', name: 'B', isBot: true }] });
  s2.players[0].team[0].sp = 'mewtwo';
  s2.players[0].items.evolution_stone = 1;
  const r2 = applyAction(s2, 'a', { type: 'use_item', item: 'evolution_stone', index: 0 }, { now: T0 });
  assert.match(r2.error, /não evolui/);
});

test('todo Pokémon que evolui tem nível de evolução ou pode usar pedra', () => {
  for (const s of SPECIES_LIST) if (s.evolvesTo) assert.ok(SPECIES[s.evolvesTo], s.id);
});

test('tiers: cada casa só gera Pokémon do seu tier (ou raro do tier acima) e no nível da cor', () => {
  const rng = createRng(77);
  for (let tier = 1; tier <= 5; tier++) {
    const seen = { same: 0, above: 0 };
    for (let i = 0; i < 2000; i++) {
      const m = rollWild(rng, tier, {});
      const t = getSpecies(m.sp).tier;
      assert.ok(t === tier || t === tier + 1, `casa tier ${tier} gerou ${m.sp} (tier ${t})`);
      const [lo, hi] = WILD_LEVELS[tier];
      assert.ok(m.lvl >= lo && m.lvl <= hi);
      seen[t === tier ? 'same' : 'above']++;
    }
    if (tier < 5) assert.ok(seen.above / 2000 < 0.12, `raros demais no tier ${tier}`);
  }
});

test('casas do tabuleiro: as 5 cores existem e as cidades têm loja', () => {
  const tiers = new Set(SPACE_LIST.filter(s => s.type === 'pokemon').map(s => s.tier));
  assert.deepEqual([...tiers].sort(), [1, 2, 3, 4, 5]);
});
