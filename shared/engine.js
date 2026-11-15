// =====================================================================================
// Motor de regras do Pokémon Master Trainer HEX — puro (sem DOM, sem rede).
// Roda igual no navegador (modo local) e no servidor (modo online, autoritativo).
//
//   createMatch(config)                      -> estado inicial
//   applyAction(state, actorId, action, ctx) -> { state, error? }  (não muta o estado recebido)
//
// Todo sorteio usa o RNG cujo estado mora em state.seed — no online quem rola é o servidor.
// =====================================================================================

import { SPECIES, getSpecies, STARTERS } from './data/pokemon.js';
import { SPACE_LIST, getSpace, START_SPACE } from './data/board.js';
import { ITEMS, getItem, shopFor, STARTING_ITEMS, STARTING_GOLD } from './data/items.js';
import {
  GYMS, gymAt, ELITE_FOUR, CHAMPION, ELITE_SPACE, CHAMPION_SPACE, ROUTE_TRAINERS, ROCKET, BADGES_TO_LEAGUE
} from './data/trainers.js';
import { createRng } from './rules/rng.js';
import { createMon, rollWild, fullHeal, healMon, maxHpOf, levelUp, evolve, TEAM_SIZE, WILD_LEVELS, gainXp, BASE_SHINY_RATE } from './rules/monsters.js';
import { destinations, pathTo } from './rules/movement.js';
import { startBattle, submitChoice, setBattleEndHandler, deliverCapture, sideActive, sideIndexOf } from './rules/battle.js';
import {
  GameError, fail, getPlayer, currentPlayer, log, fx, addItem, takeItem, blackout, speciesName, clone, markCaught
} from './rules/helpers.js';
import { speciesByTier } from './data/pokemon.js';
import { EVENT_CARDS } from './data/events.js';
import { sanitizeCosmetic } from './data/cosmetics.js';
import { botAction } from './bots.js';

export const ENGINE_VERSION = 2;
export const AFK_SECONDS = 90;
export const MAX_PLAYERS = 6;

// ------------------------------------------------------------------ criação
/**
 * config = {
 *   id, mode: 'local'|'online', seed, now,
 *   players: [{ id, name, avatar, isBot, starter, starterLevel? }],
 *   options: { dailyPokemon, turnLimit }
 * }
 */
export function createMatch(config) {
  const rng = createRng(config.seed);
  const players = (config.players || []).map((p, i) => newPlayer(rng, p, i));
  if (players.length < 1) fail('A partida precisa de pelo menos 1 jogador.');
  if (players.length > MAX_PLAYERS) fail(`Máximo de ${MAX_PLAYERS} jogadores.`);
  const state = {
    v: ENGINE_VERSION,
    id: config.id || 'local',
    mode: config.mode || 'local',
    status: 'playing',
    seed: rng.state,
    turn: 1,
    current: 0,
    phase: 'roll',
    turnStartedAt: config.now || 0,
    afkStrikes: {},
    options: {
      dailyPokemon: config.options?.dailyPokemon && SPECIES[config.options.dailyPokemon] ? config.options.dailyPokemon : null,
      turnLimit: Number(config.options?.turnLimit) || 0
    },
    players,
    board: {},
    pending: null,
    turnFlags: {},
    battle: null,
    lastBattle: null,
    winner: null,
    log: [],
    fx: [],
    fxSeq: 0
  };
  log(state, `🏁 Partida iniciada com ${players.map(p => p.name).join(', ')}. Boa sorte, treinadores!`);
  if (state.options.dailyPokemon) log(state, `⭐ Pokémon do Dia: ${speciesName(state.options.dailyPokemon)} (aparece mais, XP em dobro e shiny 1/8).`);
  // Se o primeiro jogador for CPU, já joga
  const r = runBots(state, rng, config.now || 0);
  state.seed = rng.state;
  return r;
}

function newPlayer(rng, cfg, index) {
  const starter = SPECIES[cfg.starter] ? cfg.starter : STARTERS[index % STARTERS.length];
  const starterLevel = Math.max(1, Math.min(cfg.isBot ? 60 : 10, Number(cfg.starterLevel) || 5));
  // Modo Coleção: o jogador traz até 6 Pokémon da conta (mantendo o uid para sincronizar de volta)
  const brought = (Array.isArray(cfg.teamMons) ? cfg.teamMons : [])
    .filter(m => m && SPECIES[m.sp]).slice(0, TEAM_SIZE)
    .map(m => {
      const mon = createMon(rng, m.sp, Math.max(1, Math.min(60, Number(m.lvl) || 5)), { shiny: !!m.shiny, ot: cfg.id });
      if (m.uid) mon.uid = String(m.uid);
      if (m.aura) mon.aura = m.aura;
      return mon;
    });
  const mon = brought[0] || createMon(rng, starter, starterLevel, { shiny: !!cfg.starterShiny, ot: cfg.id });
  const p = {
    id: String(cfg.id || `p${index + 1}`),
    name: String(cfg.name || `Treinador ${index + 1}`).slice(0, 24),
    avatar: Number(cfg.avatar) || ((index % 8) + 1),
    isBot: !!cfg.isBot,
    left: false,
    pos: START_SPACE,
    lastCity: START_SPACE,
    visited: [START_SPACE],
    gold: STARTING_GOLD,
    items: { ...STARTING_ITEMS },
    team: brought.length ? brought : [mon],
    box: [],
    badges: [],
    eliteStage: 0,
    champion: false,
    seen: brought.length ? [...new Set(brought.map(m => m.sp))] : [starter],
    caught: brought.length ? [...new Set(brought.map(m => m.sp))] : [starter],
    skip: 0,
    moveBonus: 0,
    stats: { captures: 0, shinies: brought.length ? 0 : (mon.shiny ? 1 : 0), wins: 0, losses: 0, pvpWins: 0, ballsThrown: 0 },
    cosmetic: sanitizeCosmetic(cfg.cosmetic)
  };
  // Pokémon extra (ex.: herdado do Cofre)
  if (cfg.extraMon && SPECIES[cfg.extraMon.sp]) {
    const extra = createMon(rng, cfg.extraMon.sp, Math.min(10, cfg.extraMon.lvl || 5), { shiny: !!cfg.extraMon.shiny, ot: p.id });
    p.team.push(extra);
    markCaught(p, extra.sp);
  }
  return p;
}

// ------------------------------------------------------------------ API principal
export function applyAction(prevState, actorId, action, ctx = {}) {
  const state = clone(prevState);
  const rng = createRng(state.seed);
  const now = Number(ctx.now) || 0;
  state.fx = [];
  try {
    if (state.status !== 'playing') fail('A partida já terminou.');
    dispatch(state, rng, String(actorId), action || {}, now);
    runBots(state, rng, now);
    for (const p of state.players) if (p._afkTemp) { delete p._afkTemp; p.isBot = false; }
    checkTurnLimit(state);
  } catch (e) {
    if (e && e.isGameError) return { state: prevState, error: e.message };
    throw e;
  }
  state.seed = rng.state;
  state.fxSeq = (prevState.fxSeq || 0) + 1;
  return { state };
}

/** Quem precisa agir agora? Retorna lista de ids. Usado pela UI e pelos bots. */
export function whoMustAct(state) {
  if (state.status !== 'playing') return [];
  if (state.pending?.kind === 'pvp_invite') return [state.pending.to];
  const b = state.battle;
  if (b && !b.over) {
    const ids = [];
    b.sides.forEach((s, i) => {
      if (s.kind !== 'player') return;
      if (b.mustSwitch.some(Boolean)) { if (b.mustSwitch[i]) ids.push(s.pid); return; }
      if (!b.choices[i]) ids.push(s.pid);
    });
    return ids;
  }
  const cp = currentPlayer(state);
  return cp ? [cp.id] : [];
}

// ------------------------------------------------------------------ roteamento
function dispatch(state, rng, actorId, action, now) {
  const actor = getPlayer(state, actorId);
  if (!actor) fail('Você não está nesta partida.');
  const type = action.type;

  // Ações permitidas a qualquer jogador a qualquer momento
  if (type === 'leave') return leave(state, rng, actor, now);
  if (type === 'skip_afk') return skipAfk(state, rng, actor, now);
  if (type === 'chat') return; // chat não passa pelo motor

  // Convite de PvP pendente: só o desafiado responde
  if (state.pending?.kind === 'pvp_invite') {
    if (type !== 'respond') fail('Aguardando resposta ao desafio PvP.');
    return respondInvite(state, rng, actor, !!action.accept, now);
  }

  // Batalha em andamento
  if (state.battle && !state.battle.over) {
    if (type !== 'battle') fail('Termine a batalha primeiro.');
    submitChoice(state, rng, actor.id, action);
    afterBattleStep(state);
    return;
  }

  // Fora de batalha: só o jogador da vez
  const cp = currentPlayer(state);
  if (!cp || cp.id !== actor.id) fail(`Não é a sua vez — agora é a vez de ${cp ? cp.name : '?'}.`);

  switch (type) {
    case 'roll': return roll(state, rng, actor);
    case 'move': return move(state, rng, actor, Number(action.to));
    case 'end_turn': return endTurn(state, rng, now);
    case 'use_item': return useItem(state, rng, actor, action);
    case 'city': return cityAction(state, rng, actor, action);
    case 'pc': return pcAction(state, actor, action);
    case 'challenge': return challenge(state, rng, actor, action.target, now);
    case 'reorder': return reorderTeam(state, actor, action);
    default: fail('Ação desconhecida.');
  }
}

function afterBattleStep(state) {
  if (state.battle && state.battle.over) {
    state.lastBattle = summarizeBattle(state, state.battle);
    state.battle = null;
  }
}

function summarizeBattle(state, b) {
  return {
    kind: b.kind,
    outcome: b.outcome,
    sides: b.sides.map(s => s.kind === 'player' ? { kind: 'player', pid: s.pid } : { kind: s.kind, name: s.name || 'Selvagem' }),
    log: b.log.slice(-12),
    fxSeq: state.fxSeq + 1
  };
}

// ------------------------------------------------------------------ turno
function roll(state, rng, p) {
  if (state.phase !== 'roll') fail('Você já rolou o dado neste turno.');
  const die = rng.d6();
  const bonus = p.moveBonus || 0;
  p.moveBonus = 0;
  const total = die + bonus;
  const { steps, options } = destinations(p, total);
  fx(state, { k: 'dice', pid: p.id, value: die, bonus });
  if (!options.length) {
    log(state, `🎲 ${p.name} tirou ${die}${bonus ? ` (+${bonus})` : ''}, mas não há caminho livre. Fica onde está.`);
    state.phase = 'action';
    return;
  }
  state.pending = { kind: 'move', roll: die, bonus, steps, options };
  state.phase = 'move';
  log(state, `🎲 ${p.name} tirou ${die}${bonus ? ` +${bonus} (Bicicleta)` : ''}! Escolha o destino (${steps} casa${steps > 1 ? 's' : ''}).`);
}

function move(state, rng, p, to) {
  if (state.phase !== 'move' || state.pending?.kind !== 'move') fail('Role o dado antes de se mover.');
  if (!state.pending.options.includes(to)) fail('Destino inválido para esta rolagem.');
  const path = pathTo(p, to, state.pending.steps);
  state.pending = null;
  const from = p.pos;
  p.pos = to;
  fx(state, { k: 'move', pid: p.id, from, to, path });
  const sp = getSpace(to);
  log(state, `🚶 ${p.name} foi para ${sp.name}.`);
  resolveSpace(state, rng, p, sp);
}

function resolveSpace(state, rng, p, sp) {
  state.phase = 'action';
  if (sp.type === 'city') return visitCity(state, p, sp);
  if (sp.type === 'pokemon') return wildEncounter(state, rng, p, sp, sp.tier);
  if (sp.type === 'event') return boardEvent(state, rng, p, sp);
}

function endTurn(state, rng, now) {
  if (state.phase === 'move') fail('Escolha um destino antes de encerrar o turno.');
  advanceTurn(state, now);
}

function advanceTurn(state, now) {
  state.pending = null;
  state.turnFlags = {};
  for (let guard = 0; guard < state.players.length * 3; guard++) {
    state.current += 1;
    if (state.current >= state.players.length) {
      state.current = 0;
      state.turn += 1;
    }
    const np = currentPlayer(state);
    if (np.skip > 0) {
      np.skip -= 1;
      log(state, `⏸️ ${np.name} perde esta vez.`);
      continue;
    }
    break;
  }
  state.phase = 'roll';
  state.turnStartedAt = now;
  const np = currentPlayer(state);
  log(state, `➡️ Turno ${state.turn}: vez de ${np.name}.`, 'turn');
  fx(state, { k: 'turn', pid: np.id, turn: state.turn });
  checkTurnLimit(state);
}

function checkTurnLimit(state) {
  if (state.status !== 'playing' || !state.options.turnLimit) return;
  if (state.turn > state.options.turnLimit) {
    const ranked = [...state.players].sort((a, b) => score(b) - score(a));
    finishMatch(state, ranked[0], `Limite de ${state.options.turnLimit} turnos atingido — vitória por pontos.`);
  }
}

export function score(p) {
  const shinies = p.stats.shinies || 0;
  const bestLevels = [...p.team, ...p.box].map(m => m.lvl).sort((a, b) => b - a).slice(0, 6).reduce((a, b) => a + b, 0);
  return p.badges.length * 100 + p.caught.length * 10 + shinies * 50 + p.eliteStage * 100 + (p.champion ? 1000 : 0) + bestLevels;
}

function finishMatch(state, winner, reason) {
  state.status = 'finished';
  state.winner = winner ? winner.id : null;
  state.phase = 'over';
  state.pending = null;
  log(state, `🏆 ${winner ? winner.name : 'Ninguém'} venceu a partida! ${reason || ''}`, 'win');
  fx(state, { k: 'win', pid: state.winner });
}

// ------------------------------------------------------------------ AFK / saída
function leave(state, rng, p, now) {
  if (p.left) return;
  p.left = true;
  p.isBot = true;
  log(state, `🚪 ${p.name} saiu da partida. Uma CPU assumiu o lugar.`, 'bad');
  if (state.players.every(x => x.left || x.isBot) && state.mode === 'online') {
    finishMatch(state, [...state.players].sort((a, b) => score(b) - score(a))[0], 'Todos os humanos saíram.');
  }
}

function skipAfk(state, rng, actor, now) {
  const waiting = whoMustAct(state).map(id => getPlayer(state, id)).filter(x => x && !x.isBot);
  if (!waiting.length) fail('Ninguém está travando a partida.');
  if (waiting.some(w => w.id === actor.id)) fail('Você é quem precisa jogar agora.');
  if (!now || now - (state.turnStartedAt || 0) < AFK_SECONDS * 1000) fail(`Aguarde ${AFK_SECONDS}s de inatividade para pular a vez.`);
  for (const w of waiting) {
    state.afkStrikes[w.id] = (state.afkStrikes[w.id] || 0) + 1;
    log(state, `⏰ ${w.name} ficou inativo e uma CPU jogou por ele${state.afkStrikes[w.id] >= 3 ? ' (de vez, após 3 ausências)' : ''}.`, 'bad');
    w.isBot = true; // a CPU resolve a pendência agora
    if (state.afkStrikes[w.id] < 3) w._afkTemp = true; // volta a ser humano depois
  }
  state.turnStartedAt = now;
}

// ------------------------------------------------------------------ cidades
function visitCity(state, p, sp) {
  p.lastCity = sp.id;
  if (!p.visited.includes(sp.id)) p.visited.push(sp.id);
  const gym = gymAt(sp.id);
  let extra = ' Centro Pokémon e Loja disponíveis.';
  if (gym && !p.badges.includes(gym.id)) extra += ` Ginásio de ${gym.leader} aberto!`;
  if (sp.id === ELITE_SPACE) extra += ' A Elite dos Quatro aguarda.';
  if (sp.id === CHAMPION_SPACE) extra += ' O Campeão aguarda!';
  log(state, `🏙️ ${p.name} chegou em ${sp.name}.${extra}`);
}

function inCity(p) {
  const sp = getSpace(p.pos);
  return sp && sp.type === 'city' ? sp : null;
}

function cityTier(sp) {
  return sp.tier;
}

function cityAction(state, rng, p, a) {
  const sp = inCity(p);
  if (!sp) fail('Você precisa estar numa cidade.');
  if (state.phase === 'move') fail('Escolha o destino primeiro.');

  switch (a.op) {
    case 'heal': {
      [...p.team, ...p.box].forEach(fullHeal);
      log(state, `🏥 Enfermeira Joy curou toda a equipe de ${p.name}.`, 'good');
      return;
    }
    case 'buy': {
      const qty = Math.max(1, Math.min(20, Number(a.qty) || 1));
      const offer = shopFor(cityTier(sp)).find(o => o.id === a.item);
      if (!offer) fail('Esse item não é vendido aqui.');
      if (offer.kind === 'charm' && p.items[a.item]) fail('Você já tem o Amuleto Shiny.');
      const q = offer.kind === 'charm' ? 1 : qty;
      const cost = offer.price * q;
      if (p.gold < cost) fail(`Ouro insuficiente (precisa ${cost}).`);
      p.gold -= cost;
      addItem(p, a.item, q);
      log(state, `🛒 ${p.name} comprou ${q}x ${offer.name} por ${cost} de ouro.`);
      return;
    }
    case 'gym': {
      const gym = gymAt(sp.id);
      if (!gym) fail('Não há ginásio nesta cidade.');
      if (p.badges.includes(gym.id)) fail('Você já tem esta insígnia.');
      if (state.turnFlags.gym) fail('Só um desafio oficial por turno.');
      state.turnFlags.gym = true;
      startBattle(state, {
        kind: 'gym', pid: p.id, ref: gym.id,
        foe: { kind: 'npc', name: gym.leader, title: 'Líder', sprite: gym.sprite, prize: gym.prize, team: npcTeam(rng, gym.team) }
      });
      state.phase = 'battle';
      return;
    }
    case 'league': {
      if (state.turnFlags.gym) fail('Só um desafio oficial por turno.');
      if (p.badges.length < BADGES_TO_LEAGUE) fail(`Precisa de ${BADGES_TO_LEAGUE} insígnias.`);
      if (sp.id === ELITE_SPACE) {
        if (p.eliteStage >= ELITE_FOUR.length) fail('Você já venceu a Elite dos Quatro. Vá até a Arena Final!');
        state.turnFlags.gym = true;
        startEliteBattle(state, rng, p);
        return;
      }
      if (sp.id === CHAMPION_SPACE) {
        if (p.eliteStage < ELITE_FOUR.length) fail('Vença a Elite dos Quatro (Liga Pokémon) primeiro.');
        state.turnFlags.gym = true;
        startBattle(state, {
          kind: 'champion', pid: p.id,
          foe: { kind: 'npc', name: CHAMPION.name, title: CHAMPION.title, sprite: CHAMPION.sprite, prize: CHAMPION.prize, team: npcTeam(rng, CHAMPION.team) }
        });
        state.phase = 'battle';
        return;
      }
      fail('Não há desafio da Liga nesta cidade.');
    }
    default:
      fail('Ação de cidade inválida.');
  }
}

function startEliteBattle(state, rng, p) {
  const e = ELITE_FOUR[p.eliteStage];
  startBattle(state, {
    kind: 'elite', pid: p.id, ref: p.eliteStage,
    foe: { kind: 'npc', name: e.name, title: e.title, sprite: e.sprite, prize: 1000 + p.eliteStage * 250, team: npcTeam(rng, e.team) }
  });
  state.phase = 'battle';
}

function npcTeam(rng, list) {
  return list.map(([sp, lvl]) => createMon(rng, sp, lvl));
}

function pcAction(state, p, a) {
  if (!inCity(p)) fail('O PC só pode ser usado em cidades.');
  const ti = Number(a.team), bi = Number(a.box);
  if (a.op === 'swap') {
    if (!p.team[ti] || !p.box[bi]) fail('Seleção inválida.');
    [p.team[ti], p.box[bi]] = [p.box[bi], p.team[ti]];
    log(state, `💻 ${p.name} trocou ${speciesName(p.box[bi].sp)} por ${speciesName(p.team[ti].sp)} no PC.`);
    return;
  }
  if (a.op === 'deposit') {
    if (!p.team[ti]) fail('Seleção inválida.');
    if (p.team.length <= 1) fail('A equipe precisa de pelo menos 1 Pokémon.');
    const [m] = p.team.splice(ti, 1);
    p.box.push(m);
    log(state, `💻 ${p.name} guardou ${speciesName(m.sp)} no PC.`);
    return;
  }
  if (a.op === 'withdraw') {
    if (!p.box[bi]) fail('Seleção inválida.');
    if (p.team.length >= TEAM_SIZE) fail('A equipe já está cheia (6).');
    const [m] = p.box.splice(bi, 1);
    p.team.push(m);
    log(state, `💻 ${p.name} retirou ${speciesName(m.sp)} do PC.`);
    return;
  }
  if (a.op === 'release') {
    if (!p.box[bi]) fail('Seleção inválida.');
    const [m] = p.box.splice(bi, 1);
    p.gold += 20 * m.lvl;
    log(state, `🌲 ${p.name} soltou ${speciesName(m.sp)} na natureza (+${20 * m.lvl} de ouro do Professor).`);
    return;
  }
  fail('Ação de PC inválida.');
}

function reorderTeam(state, p, a) {
  const i = Number(a.index);
  if (!p.team[i] || i === 0) return;
  const [m] = p.team.splice(i, 1);
  p.team.unshift(m);
}

// ------------------------------------------------------------------ itens fora de batalha
function useItem(state, rng, p, a) {
  const it = getItem(a.item);
  if (!it) fail('Item inválido.');
  if (!(p.items[a.item] > 0)) fail('Você não tem esse item.');
  if (state.phase === 'move') fail('Escolha o destino primeiro.');
  const target = a.index !== undefined ? p.team[Number(a.index)] : null;

  switch (it.kind) {
    case 'heal': {
      if (!target) fail('Escolha um Pokémon.');
      if (target.hp <= 0) fail('Use Revive em Pokémon desmaiado.');
      if (target.hp >= maxHpOf(target)) fail('HP já está cheio.');
      takeItem(p, a.item);
      const h = healMon(target, it.healPct);
      log(state, `💊 ${speciesName(target.sp)} recuperou ${h} HP.`);
      return;
    }
    case 'revive': {
      if (!target || target.hp > 0) fail('Escolha um Pokémon desmaiado.');
      takeItem(p, a.item);
      target.hp = Math.max(1, Math.ceil(maxHpOf(target) * it.healPct));
      log(state, `✨ ${speciesName(target.sp)} foi revivido.`);
      return;
    }
    case 'candy': {
      if (!target) fail('Escolha um Pokémon.');
      takeItem(p, a.item);
      levelUp(target).forEach(m => log(state, m, 'good'));
      return;
    }
    case 'stone': {
      if (!target) fail('Escolha um Pokémon.');
      const sp = getSpecies(target.sp);
      if (!sp.evolvesTo || !getSpecies(sp.evolvesTo)) fail(`${sp.name} não evolui.`);
      takeItem(p, a.item);
      const ev = evolve(target);
      markCaught(p, target.sp);
      log(state, `💎 ${ev.from} evoluiu para ${ev.to} com a Pedra Evolutiva!`, 'good');
      return;
    }
    case 'move_bonus': {
      if (state.phase !== 'roll') fail('Use a Bicicleta antes de rolar o dado.');
      takeItem(p, a.item);
      p.moveBonus += it.bonus;
      log(state, `🚲 ${p.name} subiu na bicicleta: +${it.bonus} casas no próximo movimento.`);
      return;
    }
    case 'escape': {
      takeItem(p, a.item);
      p.pos = p.lastCity;
      state.phase = 'action';
      state.pending = null;
      log(state, `🪢 ${p.name} usou a Corda de Fuga e voltou para ${getSpace(p.lastCity).name}.`);
      fx(state, { k: 'move', pid: p.id, to: p.pos });
      return;
    }
    case 'fly': {
      const to = Number(a.to);
      if (!p.visited.includes(to) || getSpace(to)?.type !== 'city') fail('Escolha uma cidade já visitada.');
      if (to === p.pos) fail('Você já está aí.');
      takeItem(p, a.item);
      p.pos = to;
      state.phase = 'action';
      state.pending = null;
      const sp = getSpace(to);
      log(state, `🕊️ ${p.name} voou até ${sp.name}.`);
      fx(state, { k: 'move', pid: p.id, to });
      visitCity(state, p, sp);
      return;
    }
    default:
      fail('Esse item só pode ser usado em batalha (ou é passivo).');
  }
}

// ------------------------------------------------------------------ encontros e eventos
function wildEncounter(state, rng, p, sp, tier) {
  if (!p.team.some(m => m.hp > 0)) {
    log(state, `😵 ${p.name} está sem Pokémon de pé e não consegue enfrentar o selvagem.`, 'bad');
    return;
  }
  let mon = state.board[sp.id];
  if (!mon) {
    mon = rollWild(rng, tier, { dailyPokemon: state.options.dailyPokemon, shinyCharm: !!p.items.shiny_charm });
    state.board[sp.id] = mon;
  } else {
    log(state, `👀 O ${speciesName(mon.sp)} que já estava aqui continua à espreita (HP ${mon.hp}/${maxHpOf(mon)}).`);
  }
  if (mon.shiny) fx(state, { k: 'shiny', pid: p.id });
  startBattle(state, { kind: 'wild', pid: p.id, foe: { kind: 'wild', mon, spaceId: sp.id } });
  state.phase = 'battle';
}

const EVENT_ITEMS = {
  1: [['poke_ball', 5], ['potion', 4], ['bicycle', 2], ['escape_rope', 1], ['great_ball', 1]],
  2: [['poke_ball', 3], ['great_ball', 4], ['potion', 3], ['super_potion', 2], ['revive', 1], ['x_attack', 1]],
  3: [['great_ball', 3], ['ultra_ball', 3], ['super_potion', 3], ['revive', 2], ['evolution_stone', 1], ['flame_ball', 1], ['aqua_ball', 1]],
  4: [['ultra_ball', 4], ['super_potion', 3], ['revive', 2], ['rare_candy', 2], ['evolution_stone', 1], ['shadow_ball', 1], ['mystic_ball', 1], ['master_ball', 0.3]],
  5: [['ultra_ball', 4], ['rare_candy', 3], ['revive', 2], ['rainbow_ball', 1], ['master_ball', 0.6]]
};

const LUCKY_ITEMS = [['rare_candy', 4], ['evolution_stone', 3], ['rainbow_ball', 2], ['master_ball', 1]];

function boardEvent(state, rng, p, sp) {
  const t = sp.tier;
  const cards = EVENT_CARDS.filter(c => t >= c.minTier);
  const card = rng.weighted(cards.map(c => [c, c.weight]));
  const lore = rng.pick(card.lore).replace(/\{name\}/g, p.name);
  const effects = []; // [{ text, tone }]
  const ev = { k: 'event', pid: p.id, id: card.id, title: card.title, icon: card.icon, tone: card.tone, lore, effects };
  let then = null; // ação depois de mostrar a carta (batalha)

  switch (card.id) {
    case 'lost_bag': {
      const g = rng.int(40, 120) * t;
      p.gold += g;
      effects.push({ text: `+${g} de ouro`, tone: 'good', icon: '🪙' });
      break;
    }
    case 'camper_backpack': {
      const id = rng.weighted(EVENT_ITEMS[t]);
      const q = ITEMS[id].kind === 'ball' && ITEMS[id].bonus < 2 ? rng.int(1, 3) : 1;
      addItem(p, id, q);
      effects.push({ text: `+${q}x ${ITEMS[id].name}`, tone: id === 'master_ball' ? 'shiny' : 'good', item: id });
      break;
    }
    case 'berry_tree': {
      p.team.forEach(fullHeal);
      effects.push({ text: 'Equipe totalmente curada', tone: 'good', icon: '💚' });
      break;
    }
    case 'route_trainer': case 'rocket_ambush': {
      if (!p.team.some(m => m.hp > 0)) {
        effects.push({ text: 'Sua equipe está desmaiada — o desafiante foi embora', tone: 'neutral' });
        break;
      }
      const rocket = card.id === 'rocket_ambush';
      const base = rocket ? ROCKET : rng.pick(ROUTE_TRAINERS);
      const size = rocket ? Math.min(3, 1 + Math.ceil(t / 2)) : rng.int(1, Math.min(3, 1 + Math.floor(t / 2)));
      const team = routeTeam(rng, t, size, base.favorite);
      const prize = Math.round(team.reduce((a, m) => a + m.lvl, 0) * (rocket ? 20 : 12));
      ev.trainer = { name: base.name, sprite: base.sprite };
      effects.push({ text: `Batalha contra ${base.name} (${size} Pokémon)`, tone: 'battle', icon: '⚔️' });
      effects.push({ text: `Prêmio: ${prize} de ouro`, tone: 'good', icon: '🪙' });
      if (rocket) effects.push({ text: 'Se perder: roubam 25% do seu ouro', tone: 'bad', icon: '💸' });
      then = () => {
        startBattle(state, { kind: rocket ? 'rocket' : 'trainer', pid: p.id,
          foe: { kind: 'npc', name: base.name, title: rocket ? '' : 'Treinador', sprite: base.sprite, prize, team } });
        state.phase = 'battle';
      };
      break;
    }
    case 'professor_class': {
      const xp = 36 * t;
      effects.push({ text: `+${xp} XP para a equipe`, tone: 'good', icon: '⭐' });
      fx(state, ev);
      log(state, `${card.icon} ${p.name} tirou a carta "${card.title}" → ${effects.map(e => e.text).join(' · ')}`, 'event');
      p.team.filter(m => m.hp > 0).forEach(m => gainXp(m, xp).forEach(msg => log(state, msg, 'good')));
      return;
    }
    case 'rustling_grass': {
      effects.push({ text: `Pokémon raro (tier ${Math.min(5, t + 1)}) apareceu!`, tone: 'battle', icon: '🌿' });
      then = () => wildEncounter(state, rng, p, sp, Math.min(5, t + 1));
      break;
    }
    case 'pokemon_egg': {
      const pool = speciesByTier(1).filter(s => s.evolvesTo);
      const mon = createMon(rng, rng.pick(pool).id, rng.int(3, 5), { shiny: rng.chance(BASE_SHINY_RATE * 2) });
      ev.mon = { sp: mon.sp, shiny: mon.shiny };
      effects.push({ text: `Nasceu um ${speciesName(mon.sp)}${mon.shiny ? ' ✨SHINY' : ''}!`, tone: mon.shiny ? 'shiny' : 'good', mon: mon.sp });
      fx(state, ev);
      log(state, `${card.icon} ${p.name} tirou a carta "${card.title}" → ${effects.map(e => e.text).join(' · ')}`, 'event');
      deliverCapture(state, p.id, mon, null);
      return;
    }
    case 'storm': {
      p.skip += 1;
      effects.push({ text: 'Perde a próxima vez', tone: 'bad', icon: '⏸️' });
      break;
    }
    case 'zubat_swarm': {
      let total = 0;
      p.team.forEach(m => {
        if (m.hp <= 1) return;
        const d = Math.min(m.hp - 1, Math.ceil(maxHpOf(m) * 0.25));
        m.hp -= d; total += d;
      });
      effects.push({ text: `Equipe perdeu ${total} HP (ninguém desmaia)`, tone: 'bad', icon: '💥' });
      break;
    }
    case 'toll': {
      const g = Math.min(p.gold, Math.max(20, Math.floor(p.gold * 0.1)));
      p.gold -= g;
      effects.push({ text: `-${g} de ouro`, tone: 'bad', icon: '🪙' });
      break;
    }
    case 'meowth_thief': {
      const stealable = Object.keys(p.items).filter(id => p.items[id] > 0 && ITEMS[id] && ITEMS[id].kind !== 'charm');
      if (!stealable.length) { effects.push({ text: 'Mochila vazia — o Meowth saiu de mãos abanando!', tone: 'good' }); break; }
      const id = rng.pick(stealable);
      takeItem(p, id, 1);
      effects.push({ text: `-1x ${ITEMS[id].name}`, tone: 'bad', item: id });
      break;
    }
    case 'shortcut': {
      effects.push({ text: 'Role o dado de novo!', tone: 'good', icon: '🎲' });
      state.phase = 'roll';
      break;
    }
    case 'lucky_find': {
      const id = rng.weighted(LUCKY_ITEMS);
      addItem(p, id, 1);
      effects.push({ text: `+1x ${ITEMS[id].name}`, tone: 'shiny', item: id });
      break;
    }
  }
  fx(state, ev);
  log(state, `${card.icon} ${p.name} tirou a carta "${card.title}" → ${effects.map(e => e.text).join(' · ')}`, card.tone === 'bad' ? 'bad' : card.tone === 'battle' ? 'battle' : 'event');
  if (then) then();
}

function routeTeam(rng, tier, size, favorite) {
  const [lo, hi] = WILD_LEVELS[tier];
  const pool = speciesByTier(tier);
  const fav = pool.filter(s => s.types.some(t => favorite.includes(t)));
  const team = [];
  for (let i = 0; i < size; i++) {
    const s = (fav.length && rng.chance(0.7)) ? rng.pick(fav) : rng.pick(pool);
    team.push(createMon(rng, s.id, rng.int(Math.floor((lo + hi) / 2), hi)));
  }
  return team;
}

// ------------------------------------------------------------------ PvP
function challenge(state, rng, p, targetId, now) {
  if (state.phase !== 'action') fail('Só dá para desafiar depois de se mover.');
  if (state.turnFlags.pvp) fail('Só um desafio PvP por turno.');
  const q = getPlayer(state, String(targetId));
  if (!q || q.id === p.id) fail('Adversário inválido.');
  if (q.pos !== p.pos) fail('O adversário precisa estar na mesma casa que você.');
  if (!p.team.some(m => m.hp > 0)) fail('Sua equipe está desmaiada.');
  if (!q.team.some(m => m.hp > 0)) fail(`${q.name} está com a equipe desmaiada.`);
  state.turnFlags.pvp = true;
  if (q.isBot) {
    log(state, `🤺 ${p.name} desafiou ${q.name} (CPU), que aceitou na hora!`);
    beginPvp(state, p, q);
    return;
  }
  state.pending = { kind: 'pvp_invite', from: p.id, to: q.id };
  state.turnStartedAt = now; // o relógio de inatividade passa a contar para o desafiado
  log(state, `🤺 ${p.name} desafiou ${q.name} para uma batalha PvP! Aguardando resposta...`);
}

function respondInvite(state, rng, actor, accept, now) {
  const inv = state.pending;
  if (actor.id !== inv.to) fail('O convite não é para você.');
  state.pending = null;
  const p = getPlayer(state, inv.from);
  if (!accept) {
    log(state, `🙅 ${actor.name} recusou o desafio de ${p.name}.`);
    return;
  }
  log(state, `🔥 ${actor.name} aceitou o desafio de ${p.name}!`);
  beginPvp(state, p, actor);
}

function beginPvp(state, p, q) {
  startBattle(state, { kind: 'pvp', pid: p.id, foe: { kind: 'player', pid: q.id } });
  state.phase = 'battle';
}

// ------------------------------------------------------------------ fim de batalha
setBattleEndHandler((state, rng, b, outcome) => {
  const p0 = getPlayer(state, b.sides[0].pid);
  const r = outcome.result;
  state.phase = 'action';
  fx(state, { k: 'battle_end', kind: b.kind, result: r, winner: outcome.winner ?? null,
    pids: b.sides.filter(s => s.kind === 'player').map(s => s.pid) });

  if (b.kind === 'wild') {
    const wild = b.sides[1].team[0];
    const sid = b.spaceId;
    if (r === 'captured') {
      delete state.board[sid];
      deliverCapture(state, p0.id, wild, outcome.ball);
    } else if (r === 'escaped') {
      delete state.board[sid];
    } else if (r === 'win' && outcome.winner === 0) {
      delete state.board[sid];
      const g = wild.lvl * 5 * getSpecies(wild.sp).tier;
      p0.gold += g;
      p0.stats.wins += 1;
      log(state, `🏅 ${p0.name} venceu o selvagem e ganhou ${g} de ouro.`, 'good');
    } else if (r === 'win' && outcome.winner === 1) {
      p0.stats.losses += 1;
      blackout(state, p0);
    }
    return;
  }

  if (b.kind === 'pvp') {
    if (r === 'draw') return;
    const w = getPlayer(state, b.sides[outcome.winner].pid);
    const l = getPlayer(state, b.sides[1 - outcome.winner].pid);
    const pay = Math.floor(l.gold * 0.15);
    l.gold -= pay;
    w.gold += pay;
    w.stats.pvpWins += 1;
    w.stats.wins += 1;
    l.stats.losses += 1;
    log(state, `🏆 ${w.name} venceu o PvP e levou ${pay} de ouro de ${l.name}!`, 'win');
    if (!l.team.some(m => m.hp > 0)) blackout(state, l, 0);
    return;
  }

  // NPC: treinador, rocket, ginásio, elite, campeão
  const foe = b.sides[1];
  if (r === 'draw') return;
  if (outcome.winner === 0) {
    p0.gold += foe.prize;
    p0.stats.wins += 1;
    log(state, `🏆 ${p0.name} venceu ${foe.name} e recebeu ${foe.prize} de ouro!`, 'win');
    if (b.kind === 'gym') {
      const gym = GYMS.find(g => g.id === b.ref);
      p0.badges.push(gym.id);
      log(state, `🎖️ ${p0.name} conquistou a ${gym.badge}! (${p0.badges.length}/${GYMS.length})`, 'win');
      fx(state, { k: 'badge', pid: p0.id, badge: gym.id });
    } else if (b.kind === 'elite') {
      p0.eliteStage += 1;
      if (p0.eliteStage < ELITE_FOUR.length) {
        log(state, `➡️ Próximo membro da Elite: ${ELITE_FOUR[p0.eliteStage].name}! (sem cura entre as lutas)`, 'battle');
        state.battle = null;
        startEliteBattle(state, rng, p0);
      } else {
        log(state, `👑 ${p0.name} venceu a Elite dos Quatro! Agora só falta o Campeão na Arena Final.`, 'win');
      }
    } else if (b.kind === 'champion') {
      p0.champion = true;
      finishMatch(state, p0, 'Derrotou o Campeão da Liga!');
    }
    return;
  }

  // derrota para NPC
  p0.stats.losses += 1;
  if (b.kind === 'elite') {
    p0.eliteStage = 0;
    log(state, `📉 ${p0.name} perdeu na Elite dos Quatro e terá que recomeçar o desafio.`, 'bad');
  }
  if (outcome.surrender && b.kind !== 'rocket') return; // desistiu: sem desmaio
  if (b.kind === 'rocket') {
    const stolen = Math.floor(p0.gold * 0.25);
    p0.gold -= stolen;
    log(state, `🦹 A Equipe Rocket roubou ${stolen} de ouro de ${p0.name}!`, 'bad');
  }
  if (!p0.team.some(m => m.hp > 0)) blackout(state, p0, b.kind === 'rocket' ? 0 : 0.1);
});

// ------------------------------------------------------------------ bots
export function runBots(state, rng, now) {
  for (let guard = 0; guard < 400; guard++) {
    if (state.status !== 'playing') break;
    const ids = whoMustAct(state);
    const botId = ids.find(id => getPlayer(state, id)?.isBot);
    if (!botId) break;
    const action = botAction(state, botId);
    try {
      dispatch(state, rng, botId, action, now);
    } catch (e) {
      if (!e.isGameError) throw e;
      // Ação do bot inválida: força o fim do turno para não travar
      const cp = currentPlayer(state);
      if (state.battle && !state.battle.over) {
        state.battle.over = true;
        state.battle.outcome = { result: 'draw' };
        afterBattleStep(state);
        state.phase = 'action';
      } else if (state.pending?.kind === 'pvp_invite') {
        state.pending = null;
      } else if (cp && cp.id === botId) {
        advanceTurn(state, now);
      }
    }
  }
  return state;
}

// Reexporta utilidades úteis para o cliente
export { whoMustAct as mustAct, GameError, sideActive, sideIndexOf };
export { SPACE_LIST, GYMS, ELITE_FOUR, CHAMPION, ITEMS, shopFor };
