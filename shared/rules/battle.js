// Sistema de batalha por rodadas — o mesmo para selvagens, treinadores NPC, ginásios, Liga e PvP.
//
// Cada rodada: os dois lados escolhem uma ação (atacar, trocar, item, pokébola, fugir).
// Trocas/itens/pokébolas/fuga acontecem primeiro; depois os ataques, do mais rápido (maior nível) ao mais lento.
// Dano = (ataque × 0,7 + d6) × efetividade de tipo × (crítico 1,5 no 6 / golpe fraco 0,5 no 1)

import { getSpecies } from '../data/pokemon.js';
import { getItem, ballBonusAgainst } from '../data/items.js';
import { against, bestAttack, effectivenessLabel, TYPE_LABELS } from './types.js';
import { monMoves, STAB } from '../data/moves.js';
import { companionBonus, progressMission } from './missions.js';
import { weatherMult, weatherInflict, weatherChip, weatherOf } from './weather.js';
import { statsOf, maxHpOf, gainXp, xpReward, healMon } from './monsters.js';
import {
  fail, getPlayer, log, fx, takeItem, giveMon, markSeen, healthyIndex, hasHealthy, speciesName, canUse, usableIndex, badgesNeeded
} from './helpers.js';

export const MAX_ROUNDS = 30;
// Lendários (tier 5) são muito difíceis: precisa 10+ e fogem com facilidade depois de escapar da bola.
export const CAPTURE_TARGET = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 10 };
export const WILD_FLEE_AFTER_FAIL = { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.3, 5: 0.6 };

// ---------------------------------------------------------------- lados
export function sideTeam(state, side) {
  return side.kind === 'player' ? getPlayer(state, side.pid).team : side.team;
}

export function sideActive(state, side) {
  return sideTeam(state, side)[side.active] || null;
}

export function sideName(state, side) {
  if (side.kind === 'player') return getPlayer(state, side.pid).name;
  if (side.kind === 'wild') return 'Selvagem';
  return side.name;
}

function monLabel(state, side) {
  const m = sideActive(state, side);
  const n = speciesName(m.sp);
  if (side.kind === 'wild') return `${n} selvagem`;
  if (side.kind === 'player') return `${n} (${getPlayer(state, side.pid).name})`;
  return `${n} de ${side.name}`;
}

// ---------------------------------------------------------------- início
/**
 * cfg = { kind, pid, foe }
 *  kind: 'wild' | 'trainer' | 'rocket' | 'gym' | 'elite' | 'champion' | 'pvp'
 *  foe:  { kind:'wild', mon, spaceId } | { kind:'npc', name, title, sprite, team, prize, ref } | { kind:'player', pid }
 */
export function startBattle(state, cfg) {
  const p = getPlayer(state, cfg.pid);
  const first = usableIndex(p);
  if (first < 0) fail(p.team.some(m => m.hp > 0)
    ? 'Nenhum Pokémon seu de pé te obedece ainda — conquiste mais insígnias ou cure a equipe.'
    : 'Você não tem Pokémon em condições de lutar.');

  const sides = [{ kind: 'player', pid: p.id, active: first, boost: {}, stage: {}, seen: [p.team[first].uid] }];
  if (cfg.foe.kind === 'wild') {
    sides.push({ kind: 'wild', team: [cfg.foe.mon], active: 0, boost: {}, stage: {}, seen: [] });
  } else if (cfg.foe.kind === 'npc') {
    sides.push({ kind: 'npc', name: cfg.foe.name, title: cfg.foe.title || '', sprite: cfg.foe.sprite || null,
      team: cfg.foe.team, active: 0, boost: {}, stage: {}, seen: [], prize: cfg.foe.prize || 0 });
  } else {
    const q = getPlayer(state, cfg.foe.pid);
    const qi = usableIndex(q);
    if (qi < 0) fail(`${q.name} não tem Pokémon em condições de lutar.`);
    sides.push({ kind: 'player', pid: q.id, active: qi, boost: {}, stage: {}, seen: [q.team[qi].uid] });
  }

  state.battle = {
    kind: cfg.kind,
    ref: cfg.ref || null,
    spaceId: cfg.foe.spaceId || null,
    round: 0,
    sides,
    choices: [null, null],
    mustSwitch: [false, false],
    log: [],
    over: false
  };

  // Pokédex: os dois lados "veem" o adversário
  const foeMon = sideActive(state, sides[1]);
  markSeen(p, foeMon.sp, !!foeMon.shiny);
  if (sides[1].kind === 'player') { const mm = sideActive(state, sides[0]); markSeen(getPlayer(state, sides[1].pid), mm.sp, !!mm.shiny); }

  const foeSide = sides[1];
  fx(state, {
    k: 'battle', kind: cfg.kind, pid: p.id,
    foe: foeSide.kind === 'player'
      ? { kind: 'player', pid: foeSide.pid }
      : { kind: foeSide.kind, name: foeSide.name || null, title: foeSide.title || null, sprite: foeSide.sprite || null, sp: foeMon.sp, lvl: foeMon.lvl, shiny: !!foeMon.shiny, count: foeSide.team.length }
  });
  if (cfg.kind === 'raid') {
    log(state, `🔥 RAID! ${speciesName(foeMon.sp)}${foeMon.shiny ? ' ✨SHINY✨' : ''} lendário (Nv. ${foeMon.lvl}, ${maxHpOf(foeMon)} HP) desafia ${p.name}!`, 'battle');
  } else if (cfg.kind === 'wild') {
    log(state, `🌿 Um ${speciesName(foeMon.sp)}${foeMon.shiny ? ' ✨SHINY✨' : ''} selvagem (Nv. ${foeMon.lvl}) apareceu!`, foeMon.shiny ? 'shiny' : 'info');
  } else if (foeSide.kind === 'npc') {
    log(state, `⚔️ ${foeSide.title ? foeSide.title + ' ' : ''}${foeSide.name} desafia ${p.name}! Enviou ${speciesName(foeMon.sp)} (Nv. ${foeMon.lvl}).`, 'battle');
  } else {
    log(state, `⚔️ PvP: ${p.name} x ${getPlayer(state, foeSide.pid).name}!`, 'battle');
  }
  return state.battle;
}

// ---------------------------------------------------------------- escolhas
/** Quais lados são controlados por jogadores (que precisam escolher)? */
export function humanSides(state) {
  return state.battle.sides.map((s, i) => (s.kind === 'player' ? i : -1)).filter(i => i >= 0);
}

export function sideIndexOf(state, pid) {
  return state.battle.sides.findIndex(s => s.kind === 'player' && s.pid === pid);
}

function validateChoice(state, si, choice) {
  const b = state.battle;
  const side = b.sides[si];
  const team = sideTeam(state, side);
  const player = getPlayer(state, side.pid);

  if (b.mustSwitch[si] && choice.move !== 'switch') fail('Seu Pokémon desmaiou — escolha outro para entrar.');

  switch (choice.move) {
    case 'attack': {
      const slot = Number(choice.slot || 0);
      if (![0, 1].includes(slot)) fail('Golpe inválido.');
      return;
    }
    case 'switch': {
      const i = Number(choice.index);
      if (!team[i]) fail('Pokémon inválido.');
      if (team[i].hp <= 0) fail('Esse Pokémon está desmaiado.');
      if (!canUse(player, team[i])) fail(`${speciesName(team[i].sp)} não te obedece ainda: precisa de ${badgesNeeded(team[i])} insígnias.`);
      if (i === side.active && !b.mustSwitch[si]) fail('Esse Pokémon já está em campo.');
      if (i === side.active && b.mustSwitch[si]) fail('Escolha outro Pokémon.');
      return;
    }
    case 'item': {
      const it = getItem(choice.item);
      if (!it || !['heal', 'revive', 'boost', 'cure'].includes(it.kind)) fail('Esse item não pode ser usado em batalha.');
      if (!(player.items[choice.item] > 0)) fail('Você não tem esse item.');
      const target = team[choice.index ?? side.active];
      if (!target) fail('Alvo inválido.');
      if (it.kind === 'heal' && (target.hp <= 0 || target.hp >= maxHpOf(target))) fail('Esse Pokémon não precisa de cura.');
      if (it.kind === 'revive' && target.hp > 0) fail('Revive só funciona em Pokémon desmaiado.');
      if (it.kind === 'cure' && !side.status?.[target.uid]) fail('Esse Pokémon não tem nenhuma condição para curar.');
      return;
    }
    case 'ball': {
      if (b.kind !== 'wild') fail('Só dá para capturar Pokémon selvagens.');
      const it = getItem(choice.item);
      if (!it || it.kind !== 'ball') fail('Escolha uma Pokébola.');
      if (!(player.items[choice.item] > 0)) fail('Você não tem essa Pokébola.');
      return;
    }
    case 'flee':
      if (b.kind === 'elite' || b.kind === 'champion' || b.kind === 'gym') fail('Não dá para fugir de uma batalha oficial.');
      return;
    default:
      fail('Ação de batalha inválida.');
  }
}

/** Registra a escolha de um jogador. Resolve a rodada quando todos os lados humanos escolheram. */
export function submitChoice(state, rng, pid, choice) {
  const b = state.battle;
  if (!b || b.over) fail('Não há batalha em andamento.');
  const si = sideIndexOf(state, pid);
  if (si < 0) fail('Você não está nesta batalha.');
  validateChoice(state, si, choice);

  // Troca forçada após desmaio é instantânea (não gasta a rodada)
  if (b.mustSwitch[si]) {
    doSwitch(state, si, Number(choice.index));
    b.mustSwitch[si] = false;
    return;
  }
  if (b.mustSwitch.some(Boolean)) fail('Aguardando o adversário escolher o próximo Pokémon.');

  b.choices[si] = { ...choice };
  const humans = humanSides(state);
  if (humans.every(i => b.choices[i])) {
    const choices = b.sides.map((s, i) => b.choices[i] || aiChoice(state, i, rng));
    b.choices = [null, null];
    resolveRound(state, rng, choices);
  }
}

// ---------------------------------------------------------------- condições (status) — valem até o fim da batalha
export const STATUS = {
  burn:      { name: 'Queimado',    adj: 'queimado',    icon: '🔥', short: 'QUE', color: '#e2583a', desc: 'Perde 1/12 do HP por rodada e ataca 25% mais fraco' },
  poison:    { name: 'Envenenado',  adj: 'envenenado',  icon: '☠️', short: 'ENV', color: '#9b4bc9', desc: 'Perde 1/8 do HP por rodada' },
  paralysis: { name: 'Paralisado',  adj: 'paralisado',  icon: '⚡', short: 'PAR', color: '#e8c12e', desc: '25% de chance de não agir; metade da velocidade' },
  sleep:     { name: 'Dormindo',    adj: 'dormindo',    icon: '💤', short: 'DOR', color: '#7f8aa6', desc: 'Não age por 1 a 3 rodadas' },
  freeze:    { name: 'Congelado',   adj: 'congelado',   icon: '🧊', short: 'CON', color: '#6fd0f0', desc: 'Não age; 25% de chance de descongelar por rodada (fogo descongela)' }
};
// tipo do golpe → condição que pode causar
export const TYPE_STATUS = { fire: 'burn', poison: 'poison', electric: 'paralysis', ice: 'freeze', grass: 'sleep', ghost: 'sleep' };
const INFLICT_CHANCE = { q: 0.08, s: 0.15, x: 0.25 };
const IMMUNE = { burn: ['fire'], poison: ['poison', 'steel'], paralysis: ['electric'], freeze: ['ice'], sleep: [] };

export function statusOf(b, si, mon) {
  return mon ? b.sides[si].status?.[mon.uid] || null : null;
}

function tryInflict(state, rng, defSi, d, move, aSp) {
  const b = state.battle;
  const id = TYPE_STATUS[move.type];
  if (!id || move.kind !== 'dmg') return;
  const side = b.sides[defSi];
  side.status ||= {};
  if (side.status[d.uid]) return; // já tem uma condição
  if (IMMUNE[id].some(t => getSpecies(d.sp).types.includes(t))) return;
  const tier = move.id?.slice(-1) || 's';
  let chance = INFLICT_CHANCE[tier] || 0.15;
  if (id === 'poison') chance += 0.1;
  if (companionBonus(state, 1 - defSi)?.inflict === move.type) chance += 0.1; // companheiro (ex.: Koga) aumenta a chance
  chance *= weatherInflict(state, id); // clima (ex.: Tempestade dobra a paralisia)
  if (!rng.chance(chance)) return;
  side.status[d.uid] = { id, turns: id === 'sleep' ? rng.int(1, 3) : 0 };
  log(state, `${STATUS[id].icon} ${monLabel(state, side)} ficou ${STATUS[id].adj}!`, 'bad');
  fx(state, { k: 'status', side: defSi, uid: d.uid, status: id });
}

/** Antes de atacar: dormindo/congelado/paralisado podem perder a vez. */
function canActWithStatus(state, rng, si) {
  const b = state.battle;
  const side = b.sides[si];
  const mon = sideActive(state, side);
  const st = side.status?.[mon.uid];
  if (!st) return true;
  const who = monLabel(state, side);
  if (st.id === 'sleep') {
    if (st.turns > 0) { st.turns -= 1; log(state, `💤 ${who} está dormindo...`); fx(state, { k: 'status_skip', side: si, uid: mon.uid, status: 'sleep' }); return false; }
    delete side.status[mon.uid];
    log(state, `☀️ ${who} acordou!`, 'good');
    return true;
  }
  if (st.id === 'freeze') {
    if (rng.chance(0.25)) { delete side.status[mon.uid]; log(state, `☀️ ${who} descongelou!`, 'good'); return true; }
    log(state, `🧊 ${who} está congelado e não consegue se mexer!`);
    fx(state, { k: 'status_skip', side: si, uid: mon.uid, status: 'freeze' });
    return false;
  }
  if (st.id === 'paralysis' && rng.chance(0.25)) {
    log(state, `⚡ ${who} está paralisado e não conseguiu agir!`);
    fx(state, { k: 'status_skip', side: si, uid: mon.uid, status: 'paralysis' });
    return false;
  }
  return true;
}

/** Cura condição (item Cura Total). */
export function cureStatus(b, si, uid) {
  if (b?.sides[si]?.status?.[uid]) { delete b.sides[si].status[uid]; return true; }
  return false;
}

/** IA para NPC/selvagem: escolhe o melhor golpe (selvagens às vezes erram a escolha). */
function aiChoice(state, si, rng) {
  const b = state.battle;
  const wild = b.sides[si].kind === 'wild';
  if (wild && rng && rng.chance(0.3)) return { move: 'attack', slot: rng.int(0, 1) };
  return { move: 'attack', slot: bestMoveSlot(state, si) };
}

// ---------------------------------------------------------------- golpes
const stageMult = st => (st >= 0 ? 1 + 0.4 * st : 1 - 0.3 * -st);

function atkOf(state, si) {
  const side = state.battle.sides[si];
  const a = sideActive(state, side);
  const st = (side.stage || {})[a.uid] || 0;
  const burned = side.status?.[a.uid]?.id === 'burn' ? 0.75 : 1;
  return Math.max(1, (statsOf(a).atk + (side.boost[a.uid] || 0)) * stageMult(st) * burned);
}

/** Dano esperado (média do dado) de um golpe do lado si contra o ativo do outro lado. */
export function expectedDamage(state, si, move) {
  const b = state.battle;
  const a = sideActive(state, b.sides[si]);
  const d = sideActive(state, b.sides[1 - si]);
  if (!a || !d || move.kind === 'heal' || move.kind === 'buff' || move.kind === 'debuff') return 0;
  const mult = against(move.type, getSpecies(d.sp).types);
  const stab = getSpecies(a.sp).types.includes(move.type) ? STAB : 1;
  const hit = 1 - (move.miss || 0) / 6;
  return (atkOf(state, si) * 0.7 + 3.5) * (move.power || 1) * mult * stab * hit;
}

/** Melhor golpe para o lado si (usada pela IA dos NPCs e das CPUs). */
export function bestMoveSlot(state, si) {
  const b = state.battle;
  const side = b.sides[si];
  const me = sideActive(state, side);
  const foe = sideActive(state, b.sides[1 - si]);
  const moves = monMoves(me);
  const myMax = maxHpOf(me);
  const foeHit = Math.max(...monMoves(foe).map(m => expectedDamage(state, 1 - si, m)));
  let best = 0, bestScore = -1;
  moves.forEach((m, i) => {
    let score = expectedDamage(state, si, m);
    if (score >= foe.hp) score += 1000; // derruba agora
    const stage = (side.stage || {})[me.uid] || 0;
    const foeStage = (b.sides[1 - si].stage || {})[foe.uid] || 0;
    if (m.kind === 'heal') score = me.hp < myMax * 0.5 && foeHit < myMax * 0.4 ? Math.min(myMax - me.hp, myMax * 0.4) * 1.3 : 0;
    if (m.kind === 'buff') score = stage < 2 && me.hp > foeHit * 2.2 ? expectedDamage(state, si, moves[0]) * 1.1 : 0;
    if (m.kind === 'debuff') score = foeStage > -2 && me.hp > foeHit * 1.8 ? foeHit * 0.9 : 0;
    if (m.kind === 'drain') score += Math.min(myMax - me.hp, score / 2) * 0.6;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

// ---------------------------------------------------------------- rodada
function doSwitch(state, si, index) {
  const side = state.battle.sides[si];
  const team = sideTeam(state, side);
  side.active = index;
  fx(state, { k: 'switch', side: si, uid: team[index].uid });
  if (!side.seen.includes(team[index].uid)) side.seen.push(team[index].uid);
  log(state, `🔄 ${sideName(state, side)} enviou ${speciesName(team[index].sp)}!`);
  const other = state.battle.sides[1 - si];
  if (other.kind === 'player') markSeen(getPlayer(state, other.pid), team[index].sp, !!team[index].shiny);
}

function useBattleItem(state, si, choice) {
  const side = state.battle.sides[si];
  const player = getPlayer(state, side.pid);
  const team = sideTeam(state, side);
  const it = getItem(choice.item);
  const target = team[choice.index ?? side.active];
  takeItem(player, choice.item);
  if (it.kind === 'cure') {
    cureStatus(state.battle, si, target.uid);
    log(state, `💊 ${player.name} usou ${it.name}: ${speciesName(target.sp)} está curado da condição.`, 'good');
    fx(state, { k: 'status_cure', side: si, uid: target.uid });
  } else if (it.kind === 'heal') {
    const healed = healMon(target, it.healPct * (companionBonus(state, si)?.potion || 1));
    fx(state, { k: 'heal', side: si, uid: target.uid, amount: healed, hpAfter: target.hp, maxHp: maxHpOf(target) });
    log(state, `💊 ${player.name} usou ${it.name}: ${speciesName(target.sp)} recuperou ${healed} HP.`);
  } else if (it.kind === 'revive') {
    target.hp = Math.max(1, Math.ceil(maxHpOf(target) * it.healPct));
    log(state, `✨ ${player.name} usou ${it.name}: ${speciesName(target.sp)} voltou à batalha!`);
  } else if (it.kind === 'boost') {
    const act = sideActive(state, side);
    side.boost[act.uid] = (side.boost[act.uid] || 0) + it.atk;
    log(state, `🔥 ${speciesName(act.sp)} ficou mais forte (+${it.atk} de ataque)!`);
  }
}

function tryCapture(state, rng, si, ballId) {
  const b = state.battle;
  const side = b.sides[si];
  const player = getPlayer(state, side.pid);
  const wildSide = b.sides[1 - si];
  const wild = sideActive(state, wildSide);
  const sp = getSpecies(wild.sp);
  const ball = getItem(ballId);
  takeItem(player, ballId);
  player.stats.ballsThrown += 1;

  if (ball.bonus >= 99) {
    fx(state, { k: 'capture', pid: player.id, roll: 6, total: 99, target: 0, ok: true, ball: ballId, sp: wild.sp, shiny: !!wild.shiny, shakes: 3 });
    return 'captured';
  }

  const mine = sideActive(state, side);
  const max = maxHpOf(wild);
  const hpBonus = wild.hp <= max * 0.25 ? 2 : wild.hp <= max * 0.5 ? 1 : 0;
  const lvlBonus = mine && mine.lvl >= wild.lvl + 5 ? 1 : 0;
  const bBonus = ballBonusAgainst(ballId, sp.types);
  const target = CAPTURE_TARGET[sp.tier] + (wild.shiny ? 1 : 0);
  const roll = rng.d6();
  const st = statusOf(b, 1 - si, wild);
  const stBonus = st ? (st.id === 'sleep' || st.id === 'freeze' ? 2 : 1) : 0; // condição ajuda a capturar (como nos jogos)
  const total = roll + bBonus + hpBonus + lvlBonus + stBonus;
  const ok = roll !== 1 && total >= target;

  const parts = [`🎲 ${roll}`];
  if (bBonus) parts.push(`bola +${bBonus}`);
  if (hpBonus) parts.push(`HP baixo +${hpBonus}`);
  if (lvlBonus) parts.push(`nível +${lvlBonus}`);
  if (stBonus) parts.push(`${STATUS[st.id].adj} +${stBonus}`);
  const detail = `${parts.join(' · ')} = ${total} (precisa ${target}+)`;
  const shakes = ok ? 3 : roll === 1 ? 0 : Math.max(0, Math.min(2, 3 + (total - target)));
  fx(state, { k: 'capture', pid: player.id, roll, total, target, ok, ball: ballId, sp: wild.sp, shiny: !!wild.shiny, shakes });

  if (ok) {
    log(state, `🔴 ${player.name} jogou uma ${ball.name}... ${detail}. Capturou!`, 'good');
    return 'captured';
  }
  log(state, `🔴 ${player.name} jogou uma ${ball.name}... ${detail}. ${roll === 1 ? 'Falha crítica!' : 'Escapou da bola!'}`, 'bad');
  if (rng.chance(WILD_FLEE_AFTER_FAIL[sp.tier])) return 'escaped';
  return null;
}

function tryFlee(state, rng, si) {
  const b = state.battle;
  const side = b.sides[si];
  if (b.kind !== 'wild') { // contra treinadores: desistência
    log(state, `🏳️ ${sideName(state, side)} desistiu da batalha.`, 'bad');
    return 'surrender';
  }
  const mine = sideActive(state, side);
  const wild = sideActive(state, b.sides[1 - si]);
  const chance = Math.max(0.3, Math.min(1, 0.75 + 0.05 * (mine.lvl - wild.lvl)));
  if (rng.chance(chance)) {
    log(state, `🏃 ${sideName(state, side)} fugiu da batalha.`);
    return 'fled';
  }
  log(state, `🏃 ${sideName(state, side)} tentou fugir, mas não conseguiu!`, 'bad');
  return null;
}

function attackDamage(state, rng, si, slot = 0) {
  const b = state.battle;
  const atkSide = b.sides[si];
  const defSide = b.sides[1 - si];
  atkSide.stage ||= {};
  defSide.stage ||= {};
  const a = sideActive(state, atkSide);
  const d = sideActive(state, defSide);
  const aSp = getSpecies(a.sp);
  const dSp = getSpecies(d.sp);
  const mv = monMoves(a);
  const move = mv[slot] || mv[0];
  const who = monLabel(state, atkSide);

  // golpes de suporte
  if (move.kind === 'heal') {
    const healed = healMon(a, 0.4);
    fx(state, { k: 'heal', side: si, uid: a.uid, amount: healed, hpAfter: a.hp, maxHp: maxHpOf(a), move: move.name });
    log(state, `💚 ${who} usou ${move.name} e recuperou ${healed} HP.`, 'good');
    return false;
  }
  if (move.kind === 'buff') {
    const st = atkSide.stage[a.uid] || 0;
    if (st >= 2) { log(state, `${who} usou ${move.name}, mas o ataque já está no máximo.`); return false; }
    atkSide.stage[a.uid] = st + 1;
    fx(state, { k: 'buff', side: si, uid: a.uid, move: move.name, stage: st + 1 });
    log(state, `🔺 ${who} usou ${move.name}! Ataque subiu (+${(st + 1) * 40}%).`, 'good');
    return false;
  }
  if (move.kind === 'debuff') {
    const st = defSide.stage[d.uid] || 0;
    if (st <= -2) { log(state, `${who} usou ${move.name}, mas ${speciesName(d.sp)} já está acuado ao máximo.`); return false; }
    defSide.stage[d.uid] = st - 1;
    fx(state, { k: 'debuff', side: 1 - si, uid: d.uid, move: move.name, stage: st - 1 });
    log(state, `🔻 ${who} usou ${move.name}! O ataque de ${speciesName(d.sp)} caiu (−${(1 - st) * 30}%).`, 'battle');
    return false;
  }

  const atk = atkOf(state, si);
  const type = move.type;
  const mult = against(type, dSp.types);
  const stab = aSp.types.includes(type) ? STAB : 1;
  const roll = rng.d6();
  if (move.miss && roll <= move.miss) {
    log(state, `${who} usou ${move.name} (🎲${roll})... e errou!`, 'bad');
    fx(state, { k: 'hit', side: si, roll, dmg: 0, mult, miss: true, type, move: move.name, atkUid: a.uid, defUid: d.uid, hpAfter: d.hp, maxHp: maxHpOf(d) });
    return false;
  }
  const critMod = roll === 6 ? 1.5 : roll === 1 ? 0.5 : 1;
  const cb = companionBonus(state, si);
  const compMult = cb?.types?.includes(type) ? 1 + cb.dmg : 1; // bônus do companheiro (ex.: Misty em golpes de Água)
  const wMult = weatherMult(state, type); // clima (ex.: Chuva +30% em Água)
  let dmg = mult === 0 ? 0 : Math.max(1, Math.round((atk * 0.7 + roll) * (move.power || 1) * stab * mult * critMod * compMult * wMult));
  dmg = Math.min(dmg, d.hp);
  d.hp -= dmg;
  let drained = 0;
  if (move.kind === 'drain' && dmg > 0) drained = healMon(a, 0, Math.ceil(dmg / 2));

  const eff = effectivenessLabel(mult);
  let msg = `${who} usou ${move.name} (🎲${roll})`;
  if (mult === 0) msg += ` — não afeta ${speciesName(d.sp)}!`;
  else {
    msg += ` e causou ${dmg} de dano`;
    if (roll === 6) msg += ' — CRÍTICO!';
    else if (roll === 1) msg += ' (golpe fraco)';
    if (eff) msg += (roll === 6 ? ' ' : '. ') + eff;
    else if (roll !== 6) msg += '.';
    if (wMult > 1) msg += ` ${weatherOf(state).icon} (clima +${Math.round((wMult - 1) * 100)}%)`;
    else if (wMult < 1) msg += ` ${weatherOf(state).icon} (clima −${Math.round((1 - wMult) * 100)}%)`;
  }
  if (drained) msg += ` 💚 +${drained} HP`;
  // chance de causar condição (queimadura, veneno, paralisia, sono, congelamento)
  if (dmg > 0 && d.hp > 0) tryInflict(state, rng, 1 - si, d, move, aSp);
  // golpe de fogo descongela
  if (type === 'fire' && defSide.status?.[d.uid]?.id === 'freeze') { delete defSide.status[d.uid]; log(state, `🔥 ${speciesName(d.sp)} descongelou!`, 'good'); }
  log(state, msg, mult >= 2 ? 'good' : mult < 1 ? 'bad' : 'battle');
  fx(state, { k: 'hit', side: si, roll, dmg, mult, crit: roll === 6, weak: roll === 1, type, move: move.name, atkUid: a.uid, defUid: d.uid, hpAfter: d.hp, maxHp: maxHpOf(d) });
  if (drained) fx(state, { k: 'heal', side: si, uid: a.uid, amount: drained, hpAfter: a.hp, maxHp: maxHpOf(a) });
  return d.hp <= 0;
}

function awardKO(state, winnerSi, loserSi) {
  const b = state.battle;
  const winSide = b.sides[winnerSi];
  const loseSide = b.sides[loserSi];
  const foe = sideActive(state, loseSide);
  log(state, `💥 ${monLabel(state, loseSide)} desmaiou!`, 'battle');
  fx(state, { k: 'faint', side: loserSi, uid: foe.uid });
  if (state.options.duel) return; // duelo não dá XP (não muda a Coleção)
  if (winSide.kind !== 'player') return;
  progressMission(state, winSide.pid, { k: 'ko', sp: foe.sp });

  const player = getPlayer(state, winSide.pid);
  const isTrainer = loseSide.kind !== 'wild';
  let xp = xpReward(foe, isTrainer) * (companionBonus(state, winnerSi)?.xp || 1);
  if (state.options.dailyPokemon && foe.sp === state.options.dailyPokemon) xp *= 2;
  if (foe.shiny) xp = Math.round(xp * 1.5);
  const team = player.team;
  const active = sideActive(state, winSide);
  const msgs = [];
  team.forEach(m => {
    if (m.hp <= 0) return;
    const share = m.uid === active.uid ? 1 : winSide.seen.includes(m.uid) ? 0.6 : 0.4;
    // Escala estilo Gen 5: vencer Pokémon bem mais fracos rende pouco XP (evita "farm")
    const scale = Math.min(1.5, ((2 * foe.lvl + 10) / (foe.lvl + m.lvl + 10)) ** 2);
    msgs.push(...gainXp(m, xp * share * scale));
  });
  log(state, `⭐ ${speciesName(active.sp)} ganhou ${Math.round(xp)} XP (o resto da equipe também aprendeu um pouco).`);
  msgs.forEach(m => log(state, m, 'good'));
}

function resolveRound(state, rng, choices) {
  const b = state.battle;
  b.round += 1;

  // 1) ações rápidas (troca, item, bola, fuga) — na ordem dos lados
  for (let si = 0; si < 2; si++) {
    const c = choices[si];
    if (c.move === 'switch') doSwitch(state, si, Number(c.index));
    else if (c.move === 'item') useBattleItem(state, si, c);
    else if (c.move === 'ball') {
      const r = tryCapture(state, rng, si, c.item);
      if (r === 'captured') return endBattle(state, rng, { result: 'captured', by: si, ball: c.item });
      if (r === 'escaped') {
        log(state, `💨 O ${speciesName(sideActive(state, b.sides[1 - si]).sp)} fugiu!`, 'bad');
        return endBattle(state, rng, { result: 'escaped', by: si });
      }
    } else if (c.move === 'flee') {
      const r = tryFlee(state, rng, si);
      if (r === 'fled') return endBattle(state, rng, { result: 'fled', by: si });
      if (r === 'surrender') return endBattle(state, rng, { result: 'win', winner: 1 - si, surrender: true });
    }
  }

  // 2) ataques, por velocidade (nível; empate: lado 0)
  const attackers = [0, 1].filter(si => choices[si].move === 'attack');
  // velocidade = nível × natureza (+/-10%); empate: lado 0
  const speedOf = si => { const m = sideActive(state, b.sides[si]); return statsOf(m).spe * (b.sides[si].status?.[m.uid]?.id === 'paralysis' ? 0.5 : 1); };
  attackers.sort((x, y) => speedOf(y) - speedOf(x) || x - y);
  for (const si of attackers) {
    const me = sideActive(state, b.sides[si]);
    if (!me || me.hp <= 0) continue; // desmaiou antes de agir
    if (!canActWithStatus(state, rng, si)) continue; // dormindo, congelado ou paralisado
    const fainted = attackDamage(state, rng, si, Number(choices[si].slot || 0));
    if (fainted) {
      const loser = 1 - si;
      awardKO(state, si, loser);
      if (handleFaint(state, rng, loser)) return;
      break; // quem desmaiou não ataca nesta rodada
    }
  }

  // 3) fim da rodada: queimadura e veneno tiram HP
  if (!b.over) {
    for (let si = 0; si < 2; si++) {
      const mon = sideActive(state, b.sides[si]);
      if (!mon || mon.hp <= 0 || b.mustSwitch[si]) continue;
      const st = statusOf(b, si, mon);
      if (st?.id !== 'burn' && st?.id !== 'poison') continue;
      const dmg = Math.max(1, Math.round(maxHpOf(mon) / (st.id === 'burn' ? 12 : 8)));
      mon.hp = Math.max(0, mon.hp - dmg);
      log(state, `${STATUS[st.id].icon} ${monLabel(state, b.sides[si])} sofreu ${dmg} de dano por estar ${STATUS[st.id].adj}.`, 'bad');
      fx(state, { k: 'status_dmg', side: si, uid: mon.uid, status: st.id, dmg, hpAfter: mon.hp, maxHp: maxHpOf(mon) });
      if (mon.hp <= 0) {
        awardKO(state, 1 - si, si);
        if (handleFaint(state, rng, si)) return;
      }
    }
  }

  // 4) clima: Nevasca e Tempestade de areia tiram um pouco de HP de quem não é imune
  if (!b.over && weatherOf(state).chip) {
    for (let si = 0; si < 2; si++) {
      const mon = sideActive(state, b.sides[si]);
      if (!mon || mon.hp <= 0 || b.mustSwitch[si]) continue;
      const dmg = Math.min(mon.hp, weatherChip(state, mon, maxHpOf(mon)));
      if (!dmg) continue;
      mon.hp -= dmg;
      const W = weatherOf(state);
      log(state, `${W.icon} ${monLabel(state, b.sides[si])} sofreu ${dmg} de dano por causa da ${W.name.toLowerCase()}.`, 'bad');
      fx(state, { k: 'weather_dmg', side: si, uid: mon.uid, weather: state.weather.id, dmg, hpAfter: mon.hp, maxHp: maxHpOf(mon) });
      if (mon.hp <= 0) {
        awardKO(state, 1 - si, si);
        if (handleFaint(state, rng, si)) return;
      }
    }
  }

  // Lado que não atacou (ex.: jogou bola) pode ter sofrido desmaio sem ser o "atacante"
  for (let si = 0; si < 2; si++) {
    const act = sideActive(state, b.sides[si]);
    if (act && act.hp <= 0 && !b.mustSwitch[si] && !b.over) {
      if (handleFaint(state, rng, si)) return;
    }
  }

  if (!b.over && b.round >= MAX_ROUNDS) {
    log(state, '⌛ A batalha se arrastou demais e terminou empatada.');
    endBattle(state, rng, { result: 'draw' });
  }
}

/** Trata o desmaio do Pokémon ativo de um lado. Retorna true se a batalha acabou. */
function handleFaint(state, rng, si) {
  const b = state.battle;
  const side = b.sides[si];
  const team = sideTeam(state, side);
  const alive = side.kind === 'player' ? usableIndex(getPlayer(state, side.pid)) >= 0 : hasHealthy(team);
  if (!alive) {
    endBattle(state, rng, { result: 'win', winner: 1 - si });
    return true;
  }
  if (side.kind === 'player') {
    b.mustSwitch[si] = true;
  } else {
    // NPC escolhe o próximo com melhor vantagem de tipo contra o ativo do jogador
    const vs = sideActive(state, b.sides[1 - si]);
    const vsTypes = getSpecies(vs.sp).types;
    let best = -1, bestScore = -Infinity;
    team.forEach((m, i) => {
      if (m.hp <= 0) return;
      const score = bestAttack(getSpecies(m.sp).types, vsTypes).mult * 10 + m.lvl;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    side.active = best;
    const m = team[best];
    log(state, `➡️ ${sideName(state, side)} enviou ${speciesName(m.sp)} (Nv. ${m.lvl})!`);
    const other = b.sides[1 - si];
    if (other.kind === 'player') markSeen(getPlayer(state, other.pid), m.sp, !!m.shiny);
  }
  return false;
}

// ---------------------------------------------------------------- fim
/** O engine registra um callback para aplicar recompensas/consequências (evita dependência circular). */
let onBattleEnd = null;
export function setBattleEndHandler(fn) {
  onBattleEnd = fn;
}

function endBattle(state, rng, outcome) {
  const b = state.battle;
  b.over = true;
  b.outcome = outcome;
  if (onBattleEnd) onBattleEnd(state, rng, b, outcome);
}

/** Conveniência para o engine: captura bem-sucedida coloca o Pokémon no time. */
export function deliverCapture(state, pid, mon, ballId) {
  const p = getPlayer(state, pid);
  const ball = getItem(ballId);
  if (ball && ball.aura) mon.aura = ball.aura;
  if (p.cosmetic?.aura) mon.aura = p.cosmetic.aura; // estilo de captura comprado na loja (só visual)
  mon.ball = ballId;
  if (ballId) progressMission(state, pid, { k: 'capture', sp: mon.sp });
  const where = giveMon(p, mon);
  (p.captureLog ||= []).push({ sp: mon.sp, shiny: !!mon.shiny, t: state.turn || 0 });
  if (p.captureLog.length > 20) p.captureLog.splice(0, p.captureLog.length - 20);
  fx(state, { k: 'placed', pid, sp: mon.sp, shiny: !!mon.shiny, where, via: ballId ? 'capture' : 'egg' });
  log(state, `🎉 ${speciesName(mon.sp)}${mon.shiny ? ' ✨' : ''} entrou ${where === 'team' ? 'na equipe' : 'no PC (equipe cheia)'} de ${p.name}!`, mon.shiny ? 'shiny' : 'good');
}
