// Tiers estáveis, naturezas, obediência por insígnias, prêmios, PC automático, Raids e eventos especiais.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createMatch, applyAction, _internals, whoMustAct } from '../shared/engine.js';
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
  s.players[1].team.forEach(m => { m.hp = 0; }); // ninguém mais pode entrar: Raid solo
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
  // fase de captura: o jogador escolhe a Pokébola
  assert.equal(s.raid?.stage, 'catch');
  assert.deepEqual(whoMustAct(s), ['ash']);
  s.players[0].items.master_ball = 1;
  const r = applyAction(s, 'ash', { type: 'raid', op: 'catch', ball: 'master_ball' }, { now: T0 });
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.state.raid, null);
  assert.ok([...r.state.players[0].team, ...r.state.players[0].box].some(m => m.sp === boss.sp));
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

test('evolução gera o efeito de animação (evolve)', () => {
  let s = game(77);
  const p = s.players[s.current];
  p.team[0] = createMon(createRng(3), 'charmander', 15, { starter: true });
  p.items.rare_candy = 1;
  const r = applyAction(s, p.id, { type: 'use_item', item: 'rare_candy', index: 0 }, { now: T0 });
  assert.equal(r.error, undefined, r.error);
  const ev = r.state.fx.find(f => f.k === 'evolve');
  assert.ok(ev, 'tem efeito evolve');
  assert.equal(ev.from, 'charmander');
  assert.equal(ev.to, 'charmeleon');
});

test('Raid em grupo: todos escolhem 1 Pokémon, derrotam o lendário e tentam capturar na ordem do dano', () => {
  let s = game(91);
  s.players.forEach((p, i) => { p.team = [createMon(createRng(10 + i), 'mewtwo', 60, { starter: true })]; p.items.ultra_ball = 3; });
  // força a versão em grupo
  let g = null;
  for (let seed = 1; seed < 40 && !g; seed++) {
    const t = _internals.boardEvent(s, 'ash', eventSpace(4), 'raid', seed);
    if (t.raid?.group) g = t;
  }
  assert.ok(g, 'saiu uma Raid em grupo');
  assert.deepEqual(whoMustAct(g).sort(), ['ash', 'gary']);
  let r = applyAction(g, 'ash', { type: 'raid', op: 'join', uid: g.players[0].team[0].uid }, { now: T0 });
  assert.equal(r.error, undefined, r.error);
  r = applyAction(r.state, 'gary', { type: 'raid', op: 'join', uid: g.players[1].team[0].uid }, { now: T0 });
  let st = r.state;
  assert.equal(st.raid.stage, 'fight');
  assert.equal(st.raid.party.length, 2);
  for (let i = 0; i < 60 && st.raid?.stage === 'fight'; i++) {
    for (const id of whoMustAct(st)) st = applyAction(st, id, { type: 'raid', op: 'attack', slot: 0 }, { now: T0 }).state;
  }
  if (st.raid?.stage === 'catch') {
    const first = whoMustAct(st)[0];
    const order = [...st.raid.party].sort((a, b) => b.dmg - a.dmg);
    assert.equal(first, order[0].pid, 'quem causou mais dano tenta primeiro');
    for (let i = 0; i < 6 && st.raid; i++) {
      const id = whoMustAct(st)[0];
      st = applyAction(st, id, { type: 'raid', op: 'catch', ball: 'ultra_ball' }, { now: T0 }).state;
    }
  }
  assert.equal(st.raid, null, 'a Raid terminou');
  assert.equal(st.phase, 'action');
});

test('status: golpe pode envenenar e o veneno tira HP no fim da rodada', async () => {
  const { STATUS, startBattle, submitChoice } = await import('../shared/rules/battle.js');
  assert.ok(STATUS.burn && STATUS.poison && STATUS.paralysis && STATUS.sleep && STATUS.freeze);
  let inflicted = 0, ticked = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = game(seed);
    const rng = createRng(seed);
    s.players[0].team = [createMon(rng, 'ekans', 35, { starter: true, moves: ['poison_q', 'poison_x'] })];
    startBattle(s, { kind: 'wild', pid: 'ash', foe: { kind: 'wild', mon: createMon(rng, 'snorlax', 35) } });
    for (let i = 0; i < 8 && !s.battle.over; i++) {
      s.fx = [];
      submitChoice(s, rng, 'ash', { move: 'attack', slot: 1 });
      if (s.fx.some(f => f.k === 'status' && f.status === 'poison')) inflicted++;
      if (s.fx.some(f => f.k === 'status_dmg')) { ticked++; break; }
    }
  }
  assert.ok(inflicted >= 3, `envenenou ${inflicted}x`);
  assert.ok(ticked >= 3, `dano de veneno ${ticked}x`);
});

test('missões: 3 por treinador; completar dá companheiro e entra outra no lugar', async () => {
  const { progressMission } = await import('../shared/rules/missions.js');
  const s = game(5);
  const p = s.players[0];
  assert.equal(p.missions.length, 3);
  p.missions = [{ id: 'mx', tpl: 'catch_type', type: 'water', n: 2, done: 0, text: 'Capture 2 Pokémon do tipo Água', reward: { companion: 'misty' } }];
  progressMission(s, 'ash', { k: 'capture', sp: 'squirtle' });
  assert.equal(p.missions[0].done, 1);
  progressMission(s, 'ash', { k: 'capture', sp: 'pidgey' });
  assert.equal(p.missions[0].done, 1, 'pidgey não é de Água');
  progressMission(s, 'ash', { k: 'capture', sp: 'psyduck' });
  assert.ok(p.companions.includes('misty'));
  assert.equal(p.companion, 'misty');
  assert.equal(p.missions.length, 1, 'ganhou uma missão nova');
  assert.ok(s.fx.some(f => f.k === 'mission_done'));
});

test('companheiro: Misty aumenta o dano de golpes de Água', async () => {
  const { startBattle, submitChoice } = await import('../shared/rules/battle.js');
  const dmgWith = comp => {
    const s = game(3);
    const rng = createRng(4);
    s.players[0].companion = comp;
    s.players[0].team = [createMon(rng, 'squirtle', 20, { starter: true, nature: 'Hardy', iv: { hp: 15, atk: 15, spe: 15 }, moves: ['water_q', 'water_s'] })];
    startBattle(s, { kind: 'wild', pid: 'ash', foe: { kind: 'wild', mon: createMon(createRng(9), 'snorlax', 50, { nature: 'Hardy' }) } });
    submitChoice(s, createRng(77), 'ash', { move: 'attack', slot: 0 });
    return s.fx.find(f => f.k === 'hit' && f.side === 0).dmg;
  };
  assert.ok(dmgWith('misty') > dmgWith(null));
});

test('Pokédex shiny: ver e capturar shiny registra nas listas do jogador', async () => {
  const { markSeen, giveMon: gm } = await import('../shared/rules/helpers.js');
  const s = game(5);
  const p = s.players[0];
  markSeen(p, 'gyarados', true);
  assert.deepEqual(p.shinySeen, ['gyarados']);
  const mon = createMon(createRng(3), 'magikarp', 10, { shiny: true });
  gm(p, mon);
  assert.ok(p.shinyCaught.includes('magikarp') && p.shinySeen.includes('magikarp') && p.caught.includes('magikarp'));
});

test('evento relâmpago: aparece em casa de evento, some com o tempo e ativa ao parar nela', async () => {
  const { HOTSPOT_ROUNDS } = await import('../shared/engine.js');
  let s = game(12);
  // força o surgimento: várias rodadas até aparecer algum
  for (let t = 2; t < 40 && !(s.hotspots || []).length; t++) { s.turn = t; s.fx = []; _internals.tickHotspots(s); }
  assert.ok(s.hotspots.length >= 1, 'apareceu um evento');
  const h = s.hotspots[0];
  assert.equal(SPACE_LIST.find(x => x.id === h.space).type, 'event');
  assert.equal(h.until, s.turn + HOTSPOT_ROUNDS);
  // baú: ouro + itens e some do mapa
  const chest = { space: eventSpace(2), kind: 'chest', until: s.turn + 4, tier: 2 };
  s.hotspots = [chest];
  const g0 = s.players[0].gold;
  const a = _internals.land(s, 'ash', chest.space);
  assert.ok(a.players[0].gold > g0 && a.hotspots.length === 0);
  assert.ok(a.fx.some(f => f.k === 'event' && f.id === 'hotspot_chest'));
  // Pokémon misterioso: vira batalha contra a silhueta
  const mon = createMon(createRng(4), 'dragonite', 30, {});
  s.hotspots = [{ space: eventSpace(3), kind: 'mystery', until: s.turn + 4, tier: 3, mon }];
  const b = _internals.land(s, 'ash', eventSpace(3));
  assert.equal(b.battle?.kind, 'wild');
  assert.equal(b.battle.sides[1].team[0].sp, 'dragonite');
  // vence o prazo
  s.hotspots = [{ ...chest, until: s.turn + 1 }];
  s.turn += 1; s.fx = [];
  _internals.tickHotspots(s);
  assert.ok(!s.hotspots.some(x => x.space === chest.space && x.kind === 'chest' && x.until === s.turn));
  assert.ok(s.fx.some(f => f.k === 'hotspot_gone'));
});

test('mapas: Expedição gera mapa sem rotas cruzadas, com cidades alcançáveis e áreas que exigem habilidade', async () => {
  const { generateMap } = await import('../shared/data/maps/generator.js');
  const { hasGate } = await import('../shared/rules/movement.js');
  for (const seed of [1, 42, 777, 123456]) {
    const m = generateMap(seed);
    assert.equal(m.crossings, 0);
    assert.deepEqual(generateMap(seed).spaces.length, m.spaces.length); // mesma semente = mesmo mapa
    const S = Object.fromEntries(m.spaces.map(s => [s.id, s]));
    const seen = new Set([m.start]); const q = [m.start];
    while (q.length) { const c = q.shift(); for (const n of S[c].links) if (!seen.has(n) && !S[n].gate) { seen.add(n); q.push(n); } }
    for (const id of [...Object.values(m.gyms), m.elite, m.champion]) assert.ok(seen.has(id), `seed ${seed}: casa ${id} alcançável`);
    assert.ok(m.spaces.filter(s => s.gate).length >= 5);
  }
  // Surf: Pokémon de Água OU golpe de Água
  assert.equal(hasGate({ team: [{ sp: 'pidgey', hp: 5, lvl: 5 }] }, 'surf'), false);
  assert.equal(hasGate({ team: [{ sp: 'squirtle', hp: 5, lvl: 5 }] }, 'surf'), true);
  assert.equal(hasGate({ team: [{ sp: 'squirtle', hp: 0, lvl: 5 }] }, 'surf'), false);
});

test('mapas: partida na Expedição usa o mapa gerado (início, ginásios e Liga do mapa)', async () => {
  const { createMatch, applyAction } = await import('../shared/engine.js');
  const { generateMap } = await import('../shared/data/maps/generator.js');
  const T = await import('../shared/data/trainers.js');
  const { useMap } = await import('../shared/data/board.js');
  const s = createMatch({ seed: 99, map: 'gen', players: [{ id: 'a', name: 'A', starter: 'bulbasaur' }, { id: 'b', name: 'B', starter: 'charmander', isBot: true }] });
  assert.match(s.map, /^gen:\d+$/);
  const m = generateMap(Number(s.map.slice(4)));
  assert.equal(s.players[0].pos, m.start);
  // outra partida em Kanto no meio não estraga a primeira
  const k = createMatch({ seed: 5, players: [{ id: 'x', name: 'X', starter: 'bulbasaur' }] });
  assert.equal(k.players[0].pos, 5);
  const r = applyAction(s, 'a', { type: 'roll' }, { now: 1 });
  assert.ok(!r.error, r.error);
  assert.equal(T.ELITE_SPACE, m.elite);
  assert.equal(T.GYMS[0].space, m.gyms.boulder);
  useMap('kanto');
});

test('clima: muda nas rodadas, mexe no dano por tipo e Nevasca tira HP de quem não é Gelo', async () => {
  const W = await import('../shared/rules/weather.js');
  const s = game(21);
  s.weather = { id: 'clear', until: 2 };
  let changed = false;
  for (let t = 2; t < 30 && !changed; t++) { s.turn = t; s.fx = []; if (W.tickWeather(s, (st, f) => st.fx.push(f), () => {}) ) changed = true; }
  assert.ok(changed && s.weather.id !== 'clear' && s.weather.until > s.turn);
  assert.ok(s.fx.some(f => f.k === 'weather'));
  s.weather = { id: 'rain', until: 99 };
  assert.equal(W.weatherMult(s, 'water'), 1.3);
  assert.equal(W.weatherMult(s, 'fire'), 0.7);
  s.weather = { id: 'snow', until: 99 };
  assert.ok(W.weatherChip(s, { sp: 'pikachu' }, 64) > 0);
  assert.equal(W.weatherChip(s, { sp: 'lapras' }, 64), 0);
  s.weather = { id: 'storm', until: 99 };
  assert.equal(W.weatherInflict(s, 'paralysis'), 2);
});
