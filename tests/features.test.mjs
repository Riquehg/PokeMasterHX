// Tiers estáveis, naturezas, obediência por insígnias, prêmios, PC automático, Raids e eventos especiais.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createMatch, applyAction, _internals } from '../shared/engine.js';
import { rollWild, createMon, computeStats, hatchEgg } from '../shared/rules/monsters.js';
import { canUse, badgesNeeded, giveMon } from '../shared/rules/helpers.js';
import { BADGE_REWARDS } from '../shared/data/trainers.js';
import { createRng } from '../shared/rules/rng.js';
import { getSpecies } from '../shared/data/pokemon.js';
import { SPACE_LIST } from '../shared/data/board.js';
import { cardsForTier } from '../shared/data/events.js';
import { NATURES, NATURE_NAMES, natureMult } from '../shared/data/natures.js';

const T0 = 1_700_000_000_000;
const game = (seed = 7) => createMatch({ seed, mode: 'online', now: T0, players: [{ id: 'ash', name: 'Ash', starter: 'charmander' }, { id: 'gary', name: 'Gary', starter: 'squirtle' }] });
const eventSpace = tier => SPACE_LIST.find(s => s.type === 'event' && s.tier === tier).id;

function finishBattle(state, who) {
  for (let i = 0; i < 120 && state.battle; i++) {
    const b = state.battle;
    const si = b.sides.findIndex(s => s.pid === who);
    const team = state.players.find(p => p.id === who).team;
    const action = b.mustSwitch[si]
      ? { type: 'battle', move: 'switch', index: team.findIndex((m, k) => m.hp > 0 && k !== b.sides[si].active) }
      : { type: 'battle', move: 'attack' };
    const r = applyAction(state, who, action, { now: T0 });
    if (r.error) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

test('tier estável: cada cor só gera o próprio tier (inclui o Pokémon do Dia)', () => {
  const rng = createRng(3);
  for (let t = 1; t <= 5; t++) {
    for (let i = 0; i < 300; i++) assert.equal(getSpecies(rollWild(rng, t, { dailyPokemon: 'pikachu' }).sp).tier, t);
  }
  // Pikachu (tier 3) nunca aparece numa casa Rosa
  let seen = 0;
  for (let i = 0; i < 400; i++) if (rollWild(rng, 3, { dailyPokemon: 'pikachu' }).sp === 'pikachu') seen++;
  assert.ok(seen > 40, 'Pokémon do Dia aparece bastante no tier dele');
});

test('naturezas: 25 nomes, 5 neutras, +10%/−10% nos status', () => {
  assert.equal(NATURE_NAMES.length, 25);
  assert.equal(Object.values(NATURES).filter(v => !v).length, 5);
  const base = computeStats('machamp', 30, false, 'Hardy');
  const brave = computeStats('machamp', 30, false, 'Adamant'); // +atk −spe
  assert.ok(brave.atk > base.atk && brave.spe < base.spe && brave.maxHp === base.maxHp);
  assert.equal(natureMult('Bold', 'hp'), 1.1);
  const m = createMon(createRng(1), 'pidgey', 5);
  assert.ok(NATURE_NAMES.includes(m.nature));
});

test('obediência: tier 3 precisa de 2 insígnias, tier 4 de 3, tier 5 de 4; inicial sempre obedece', () => {
  const rng = createRng(2);
  const p = { badges: ['a'], team: [] };
  const t3 = createMon(rng, 'venusaur', 30), t4 = hatchEgg(rng, 4), t5 = createMon(rng, 'mewtwo', 40);
  assert.deepEqual([badgesNeeded(t3), badgesNeeded(t4), badgesNeeded(t5)], [2, 3, 4]);
  assert.equal(canUse(p, t3), false);
  p.badges.push('b');
  assert.equal(canUse(p, t3), true);
  assert.equal(canUse(p, t4), false);
  assert.equal(canUse({ badges: [] }, createMon(rng, 'pikachu', 5, { starter: true })), true);
  // evolução não muda a regra: um Bulbasaur capturado (tier 1) vira Venusaur e continua obedecendo
  const bulba = createMon(rng, 'bulbasaur', 40);
  bulba.sp = 'venusaur';
  assert.equal(canUse({ badges: [] }, bulba), true);
});

test('obediência na batalha: sem insígnias, o lendário não entra e não pode ser escolhido na troca', () => {
  let s = game(11);
  const p = s.players[0];
  p.team.push(createMon(createRng(9), 'mewtwo', 40));
  s = _internals.boardEvent(s, 'ash', eventSpace(1), 'route_trainer');
  assert.equal(s.battle.sides[0].active, 0, 'entra o inicial');
  const r = applyAction(s, 'ash', { type: 'battle', move: 'switch', index: 1 }, { now: T0 });
  assert.match(r.error, /obedece/);
  // só com o lendário de pé: não consegue batalhar
  let s2 = game(12);
  s2.players[0].team[0].hp = 0;
  s2.players[0].team.push(createMon(createRng(9), 'mewtwo', 40));
  s2 = _internals.boardEvent(s2, 'ash', eventSpace(1), 'route_trainer');
  assert.equal(s2.battle, null);
});

test('time com 6: capturas e ovos vão para o PC automaticamente (com aviso)', () => {
  let s = game(5);
  const p = s.players[0];
  const rng = createRng(4);
  while (p.team.length < 6) p.team.push(createMon(rng, 'rattata', 5));
  assert.equal(giveMon(p, createMon(rng, 'pidgey', 5)), 'box');
  assert.equal(p.team.length, 6);
  s = _internals.boardEvent(s, 'ash', eventSpace(2), 'pokemon_egg');
  const me = s.players[0];
  assert.equal(me.team.length, 6);
  assert.equal(me.box.length, 2);
  assert.ok(s.fx.some(f => f.k === 'placed' && f.where === 'box'));
});

test('prêmios de insígnia: a 2ª insígnia dá um ovo de tier 2', () => {
  let s = game(21);
  const p = s.players[0];
  p.badges = ['boulder'];
  p.pos = 20; // Cerulean (Misty)
  p.team = [createMon(createRng(1), 'venusaur', 45, { starter: true }), createMon(createRng(2), 'raichu', 45, { starter: true })];
  s.phase = 'action';
  let r = applyAction(s, 'ash', { type: 'city', op: 'gym' }, { now: T0 });
  assert.equal(r.error, undefined, r.error);
  s = finishBattle(r.state, 'ash');
  const me = s.players[0];
  assert.equal(me.badges.length, 2);
  const egg = [...me.team, ...me.box].find(m => getSpecies(m.sp).tier === 2 && m.capTier === 2);
  assert.ok(egg, 'chocou um Pokémon de tier 2');
});

test('a 6ª insígnia não dá mais lendário nem Master Ball', () => {
  const r6 = BADGE_REWARDS[6];
  assert.ok(!r6.items?.master_ball);
  assert.ok((r6.egg || 0) < 5);
});

test('casas Amarelas só têm eventos especiais; Raid só nas Azuis e Vermelhas', () => {
  const t5 = cardsForTier(5).map(c => c.id);
  assert.deepEqual(t5.sort(), ['ancient_egg', 'league_treasure', 'legend_shrine', 'master_trainer', 'mew_blessing', 'star_shower']);
  assert.ok(cardsForTier(3).some(c => c.id === 'raid'));
  assert.ok(cardsForTier(4).some(c => c.id === 'raid'));
  assert.ok(!cardsForTier(2).some(c => c.id === 'raid'));
  assert.ok(!cardsForTier(1).some(c => c.id === 'raid'));
});

test('Raid: chefe lendário com HP extra, sem pokébolas, vitória dá prêmio e tentativa de captura', () => {
  let s = game(31);
  const p = s.players[0];
  p.team = Array.from({ length: 6 }, (_, i) => createMon(createRng(i + 1), 'mewtwo', 60, { starter: true }));
  p.items.ultra_ball = 0;
  s = _internals.boardEvent(s, 'ash', eventSpace(4), 'raid');
  assert.equal(s.battle.kind, 'raid');
  const boss = s.battle.sides[1].team[0];
  assert.equal(getSpecies(boss.sp).tier >= 3, true);
  assert.ok(boss.bonusHp > 0 && boss.raid);
  const ball = applyAction(s, 'ash', { type: 'battle', move: 'ball', item: 'poke_ball' }, { now: T0 });
  assert.ok(ball.error);
  const gold = s.players[0].gold;
  s = finishBattle(s, 'ash');
  assert.equal(s.battle?.over ?? true, true);
  assert.ok(s.players[0].gold > gold, 'ganhou ouro');
  assert.ok(s.log.some(l => /venceu a RAID/.test(l.msg)));
  assert.ok(s.log.some(l => /se acalmou|escapou para o céu/.test(l.msg)));
});

test('eventos especiais: Chuva de Estrelas traz Pokémon forte (shiny só às vezes); Tesouro dá ouro e itens', () => {
  let shinies = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = _internals.boardEvent(game(seed), 'ash', eventSpace(5), 'star_shower', seed);
    assert.equal(s.battle.kind, 'wild');
    assert.ok(getSpecies(s.battle.sides[1].team[0].sp).tier >= 3);
    if (s.battle.sides[1].team[0].shiny) shinies++;
  }
  assert.ok(shinies > 2 && shinies < 30, `shinies: ${shinies}`);
  let s2 = game(42);
  const g = s2.players[0].gold;
  s2 = _internals.boardEvent(s2, 'ash', eventSpace(5), 'league_treasure');
  assert.ok(s2.players[0].gold >= g + 600);
});
