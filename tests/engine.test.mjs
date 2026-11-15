// Testes do motor de regras: `npm test` (usa o runner nativo do Node 18+).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createMatch, applyAction, whoMustAct, score } from '../shared/engine.js';
import { against, bestAttack, normalizeType } from '../shared/rules/types.js';
import { computeStats, createMon, gainXp } from '../shared/rules/monsters.js';
import { createRng } from '../shared/rules/rng.js';
import { destinations, canEnter } from '../shared/rules/movement.js';
import { SPECIES } from '../shared/data/pokemon.js';
import { SPACES } from '../shared/data/board.js';
import { simulate } from './sim.mjs';

const T0 = 1_700_000_000_000;

function twoHumans(seed = 42, extra = {}) {
  return createMatch({
    seed, mode: 'online', now: T0,
    players: [
      { id: 'ash', name: 'Ash', starter: 'charmander' },
      { id: 'gary', name: 'Gary', starter: 'squirtle' }
    ],
    ...extra
  });
}

function act(state, who, action, now = T0) {
  const r = applyAction(state, who, action, { now });
  return r;
}

function ok(state, who, action, now) {
  const r = act(state, who, action, now);
  assert.equal(r.error, undefined, `ação ${JSON.stringify(action)} falhou: ${r.error}`);
  return r.state;
}

/** Joga a vez de alguém até cair numa situação específica (ou resolve batalhas atacando). */
function finishBattle(state, who) {
  for (let i = 0; i < 80 && state.battle; i++) {
    const b = state.battle;
    const si = b.sides.findIndex(s => s.pid === who);
    if (si < 0) break;
    if (b.mustSwitch[si]) {
      const team = state.players.find(p => p.id === who).team;
      state = ok(state, who, { type: 'battle', move: 'switch', index: team.findIndex(m => m.hp > 0) });
    } else {
      const r = act(state, who, { type: 'battle', move: 'attack' });
      if (r.error) break;
      state = r.state;
    }
  }
  return state;
}

// ---------------------------------------------------------------- tipos
test('tabela de tipos: casos clássicos e tipo duplo multiplicam', () => {
  assert.equal(against('water', ['fire']), 2);
  assert.equal(against('electric', ['ground']), 0);
  assert.equal(against('grass', ['water', 'ground']), 4);
  assert.equal(against('fire', ['water', 'rock']), 0.25);
  assert.equal(against('ghost', ['normal']), 0);
  assert.equal(against('dragon', ['fairy']), 0);
  assert.equal(against('fighting', ['dark', 'steel']), 4);
  assert.deepEqual(bestAttack(['fire', 'flying'], ['grass', 'bug']), { mult: 4, type: 'fire' });
});

test('tipos antigos em português (com acento) são reconhecidos', () => {
  assert.equal(normalizeType('Água'), 'water');
  assert.equal(normalizeType('Elétrico'), 'electric');
  assert.equal(normalizeType('Psíquico'), 'psychic');
  assert.equal(normalizeType('Sombrio'), 'dark');
  assert.equal(normalizeType('Dragão'), 'dragon');
});

test('todas as espécies têm tipos válidos e evoluções existentes', () => {
  for (const s of Object.values(SPECIES)) {
    assert.ok(s.types.length >= 1 && s.types.every(t => normalizeType(t) === t), s.id);
    if (s.evolvesTo) assert.ok(SPECIES[s.evolvesTo], `${s.id} -> ${s.evolvesTo}`);
  }
});

// ---------------------------------------------------------------- status / XP
test('status dependem da espécie (não só do tier) e do nível; shiny é mais forte', () => {
  const machop = computeStats('machop', 10);
  const caterpie = computeStats('caterpie', 10);
  assert.ok(machop.atk > caterpie.atk);
  assert.ok(computeStats('bulbasaur', 20).maxHp > computeStats('bulbasaur', 5).maxHp);
  assert.ok(computeStats('bulbasaur', 10, true).atk >= computeStats('bulbasaur', 10).atk);
});

test('XP sobe nível e evolui no nível certo', () => {
  const rng = createRng(1);
  const mon = createMon(rng, 'charmander', 15);
  const msgs = gainXp(mon, 10_000);
  assert.ok(mon.lvl > 16);
  assert.ok(['charmeleon', 'charizard'].includes(mon.sp));
  assert.ok(msgs.some(m => m.includes('evoluiu')));
});

// ---------------------------------------------------------------- tabuleiro
test('tabuleiro: 120 casas todas conectadas e vizinhança simétrica', () => {
  const ids = Object.keys(SPACES).map(Number);
  assert.equal(ids.length, 120);
  for (const id of ids) for (const n of SPACES[id].links) assert.ok(SPACES[n].links.includes(id), `${id}<->${n}`);
});

test('movimento: entrada da Liga exige 6 insígnias; casas com tipo exigem o tipo na equipe', () => {
  const p = { pos: 87, badges: [], team: [{ sp: 'pidgey', hp: 10, lvl: 5 }] };
  assert.equal(canEnter(p, 107), false);
  p.badges = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.equal(canEnter(p, 107), true);
  assert.equal(canEnter(p, 31), false); // exige Pedra
  p.team.push({ sp: 'geodude', hp: 10, lvl: 5 });
  assert.equal(canEnter(p, 31), true);
  const d = destinations({ pos: 5, badges: [], team: [{ sp: 'pidgey', hp: 10 }] }, 3);
  assert.ok(d.options.length > 0 && d.steps === 3);
});

// ---------------------------------------------------------------- engine
test('estado inicial: equipe inicial, itens, ouro e vez do primeiro jogador', () => {
  const s = twoHumans();
  assert.equal(s.players.length, 2);
  assert.equal(s.players[0].team[0].sp, 'charmander');
  assert.equal(s.players[0].items.poke_ball, 5);
  assert.deepEqual(whoMustAct(s), ['ash']);
  assert.equal(s.phase, 'roll');
});

test('não é a sua vez: ação é rejeitada e o estado não muda', () => {
  const s = twoHumans();
  const r = act(s, 'gary', { type: 'roll' });
  assert.match(r.error, /Não é a sua vez/);
  assert.equal(r.state, s);
});

test('applyAction é puro (não muta o estado recebido) e determinístico', () => {
  const s = twoHumans(7);
  const snapshot = JSON.stringify(s);
  const a = ok(s, 'ash', { type: 'roll' });
  const b = ok(s, 'ash', { type: 'roll' });
  assert.equal(JSON.stringify(s), snapshot);
  assert.deepEqual(a.pending, b.pending);
});

test('rolar, mover para destino válido; destino inválido é recusado', () => {
  let s = twoHumans(3);
  s = ok(s, 'ash', { type: 'roll' });
  assert.equal(s.phase, 'move');
  const bad = act(s, 'ash', { type: 'move', to: 124 });
  assert.match(bad.error, /Destino inválido/);
  s = ok(s, 'ash', { type: 'move', to: s.pending.options[0] });
  assert.ok(['battle', 'action', 'roll'].includes(s.phase));
});

test('captura: bola é consumida e, se der certo, o Pokémon entra na equipe e na Pokédex', () => {
  let captured = false;
  for (let seed = 1; seed < 200 && !captured; seed++) {
    let s = twoHumans(seed);
    s = ok(s, 'ash', { type: 'roll' });
    // procura destino que seja casa de Pokémon
    const to = s.pending.options.find(id => SPACES[id].type === 'pokemon');
    if (!to) continue;
    s = ok(s, 'ash', { type: 'move', to });
    assert.equal(s.battle.kind, 'wild');
    const wildSp = s.battle.sides[1].team[0].sp;
    const balls = s.players[0].items.poke_ball;
    const r = act(s, 'ash', { type: 'battle', move: 'ball', item: 'poke_ball' });
    assert.equal(r.error, undefined);
    assert.equal(r.state.players[0].items.poke_ball ?? 0, balls - 1);
    if (r.state.players[0].team.some(m => m.sp === wildSp && m.uid === s.battle.sides[1].team[0].uid)) {
      captured = true;
      assert.ok(r.state.players[0].caught.includes(wildSp));
      assert.equal(r.state.battle, null);
      assert.equal(r.state.board[to], undefined);
    }
  }
  assert.ok(captured, 'nenhuma captura em 200 seeds?');
});

test('batalha selvagem resolve com ataques e devolve a fase de ação', () => {
  let s = twoHumans(11);
  for (let i = 0; i < 30; i++) {
    if (whoMustAct(s)[0] !== 'ash') break;
    if (s.phase === 'roll') s = ok(s, 'ash', { type: 'roll' });
    if (s.phase === 'move') s = ok(s, 'ash', { type: 'move', to: s.pending.options.find(id => SPACES[id].type === 'pokemon') ?? s.pending.options[0] });
    if (s.battle) {
      s = finishBattle(s, 'ash');
      if (s.battle && s.battle.kind !== 'wild') continue;
      assert.equal(s.battle, null);
      assert.ok(s.lastBattle);
      return;
    }
    if (s.phase === 'action') s = ok(s, 'ash', { type: 'end_turn' });
    if (whoMustAct(s)[0] === 'gary') {
      // gary só encerra
      if (s.phase === 'roll') s = ok(s, 'gary', { type: 'roll' });
      if (s.phase === 'move') s = ok(s, 'gary', { type: 'move', to: s.pending.options[0] });
      s = finishBattle(s, 'gary');
      if (!s.battle && whoMustAct(s)[0] === 'gary') s = ok(s, 'gary', { type: 'end_turn' });
    }
  }
});

test('loja e centro: comprar desconta ouro; curar restaura HP', () => {
  let s = twoHumans(5);
  // Ash começa em Pallet (cidade)
  s = ok(s, 'ash', { type: 'city', op: 'buy', item: 'poke_ball', qty: 2 });
  assert.equal(s.players[0].gold, 500 - 200);
  assert.equal(s.players[0].items.poke_ball, 7);
  const r = act(s, 'ash', { type: 'city', op: 'buy', item: 'ultra_ball', qty: 1 });
  assert.match(r.error, /não é vendido aqui/);
  s.players[0].team[0].hp = 1;
  s = ok(s, 'ash', { type: 'city', op: 'heal' });
  assert.ok(s.players[0].team[0].hp > 1);
});

test('ginásio: só na cidade do ginásio, 1 desafio por turno, vitória dá insígnia', () => {
  let s = twoHumans(9);
  s.players[0].pos = 39; // Pewter
  // Equipe forte para garantir a vitória
  const rng = createRng(1);
  s.players[0].team = [createMon(rng, 'blastoise', 35, { starter: true }), createMon(rng, 'venusaur', 35, { starter: true })];
  s = ok(s, 'ash', { type: 'city', op: 'gym' });
  assert.equal(s.battle.kind, 'gym');
  const flee = act(s, 'ash', { type: 'battle', move: 'flee' });
  assert.match(flee.error, /fugir/);
  s = finishBattle(s, 'ash');
  assert.ok(s.players[0].badges.includes('boulder'));
  const again = act(s, 'ash', { type: 'city', op: 'gym' });
  assert.ok(again.error);
});

test('PvP: desafio na mesma casa, aceite do outro jogador e escolhas simultâneas', () => {
  let s = twoHumans(21);
  s.phase = 'action';
  s.players[1].pos = s.players[0].pos;
  s = ok(s, 'ash', { type: 'challenge', target: 'gary' });
  assert.equal(s.pending.kind, 'pvp_invite');
  assert.deepEqual(whoMustAct(s), ['gary']);
  assert.match(act(s, 'ash', { type: 'end_turn' }).error, /Aguardando resposta/);
  s = ok(s, 'gary', { type: 'respond', accept: true });
  assert.equal(s.battle.kind, 'pvp');
  assert.deepEqual(whoMustAct(s).sort(), ['ash', 'gary']);
  // Ash escolhe primeiro: a rodada só resolve quando Gary escolher
  s = ok(s, 'ash', { type: 'battle', move: 'attack' });
  assert.deepEqual(whoMustAct(s), ['gary']);
  const hpBefore = s.players[0].team[0].hp + s.players[1].team[0].hp;
  s = ok(s, 'gary', { type: 'battle', move: 'attack' });
  assert.ok(s.battle ? s.battle.round === 1 : s.lastBattle.kind === 'pvp');
  assert.ok(s.players[0].team[0].hp + s.players[1].team[0].hp < hpBefore, 'alguém levou dano');
  // termina a batalha
  for (let i = 0; i < 60 && s.battle; i++) {
    for (const id of whoMustAct(s)) {
      const b = s.battle; const si = b.sides.findIndex(x => x.pid === id);
      const team = s.players.find(p => p.id === id).team;
      s = ok(s, id, b.mustSwitch[si] ? { type: 'battle', move: 'switch', index: team.findIndex(m => m.hp > 0) } : { type: 'battle', move: 'attack' });
      if (!s.battle) break;
    }
  }
  assert.equal(s.battle, null);
  assert.equal(s.lastBattle.kind, 'pvp');
  const total = s.players[0].gold + s.players[1].gold;
  assert.equal(total, 1000); // ouro só muda de mão
});

test('PvP contra CPU é aceito automaticamente e a CPU escolhe sozinha', () => {
  let s = createMatch({ seed: 5, now: T0, players: [{ id: 'ash', name: 'Ash' }, { id: 'cpu', name: 'CPU', isBot: true }] });
  s.phase = 'action';
  s.players[1].pos = s.players[0].pos;
  s = ok(s, 'ash', { type: 'challenge', target: 'cpu' });
  assert.equal(s.battle.kind, 'pvp');
  assert.deepEqual(whoMustAct(s), ['ash']);
  s = ok(s, 'ash', { type: 'battle', move: 'attack' });
  assert.equal(s.battle ? s.battle.round : 1, 1);
});

test('AFK: outro jogador só pode pular depois de 90s e a CPU joga a vez', () => {
  let s = twoHumans(2);
  assert.match(act(s, 'gary', { type: 'skip_afk' }, T0 + 10_000).error, /Aguarde/);
  s = ok(s, 'gary', { type: 'skip_afk' }, T0 + 91_000);
  assert.equal(s.players[0].isBot, false, 'volta a ser humano');
  assert.deepEqual(whoMustAct(s), ['gary']);
});

test('sair da partida: CPU assume o lugar e o jogo continua', () => {
  let s = twoHumans(2);
  s = ok(s, 'ash', { type: 'leave' });
  assert.equal(s.players[0].isBot, true);
  assert.deepEqual(whoMustAct(s), ['gary']);
});

test('estado é serializável em JSON e pequeno o bastante para o Realtime', () => {
  const r = simulate(123, 4, 40);
  r.state.log = r.state.log.slice(-120); // no jogo real o log é limitado a 120 linhas
  const json = JSON.stringify(r.state);
  assert.deepEqual(JSON.parse(json).players.length, 4);
  assert.ok(json.length < 400_000, `estado com ${json.length} bytes`);
});

test('simulação: partidas só com CPU terminam (sem travar) e alguém vira campeão', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = simulate(seed * 101, 3, 300);
    assert.equal(r.stuck, false, `travou na seed ${seed}`);
    assert.equal(r.state.status, 'finished', `seed ${seed} não terminou`);
    const w = r.state.players.find(p => p.id === r.state.winner);
    assert.ok(w.champion && w.badges.length === 6);
  }
});

test('limite de turnos encerra por pontos', () => {
  const r = simulate(77, 2, 100);
  let s = createMatch({ seed: 77, now: 0, options: { turnLimit: 3 }, players: [{ id: 'a', isBot: true }, { id: 'b', isBot: true }] });
  // createMatch já roda os bots; com limite 3 a partida acaba logo
  assert.equal(s.status, 'finished');
  assert.ok(s.log.some(l => /pontos/.test(l.msg)));
  assert.ok(score(s.players[0]) >= 0 && r);
});
