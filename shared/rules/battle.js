// Sistema de batalha por rodadas — o mesmo para selvagens, treinadores NPC, ginásios, Liga e PvP.
//
// Cada rodada: os dois lados escolhem uma ação (atacar, trocar, item, pokébola, fugir).
// Trocas/itens/pokébolas/fuga acontecem primeiro; depois os ataques, do mais rápido (maior nível) ao mais lento.
// Dano = (ataque × 0,7 + d6) × efetividade de tipo × (crítico 1,5 no 6 / golpe fraco 0,5 no 1)

import { getSpecies } from '../data/pokemon.js';
import { getItem, ballBonusAgainst } from '../data/items.js';
import { bestAttack, effectivenessLabel, TYPE_LABELS } from './types.js';
import { computeStats, maxHpOf, gainXp, xpReward, healMon } from './monsters.js';
import {
  fail, getPlayer, log, fx, takeItem, giveMon, markSeen, healthyIndex, hasHealthy, speciesName
} from './helpers.js';

export const MAX_ROUNDS = 30;
const CAPTURE_TARGET = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 };
const WILD_FLEE_AFTER_FAIL = { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.3, 5: 0.35 };

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
  const first = healthyIndex(p.team);
  if (first < 0) fail('Você não tem Pokémon em condições de lutar.');

  const sides = [{ kind: 'player', pid: p.id, active: first, boost: {}, seen: [p.team[first].uid] }];
  if (cfg.foe.kind === 'wild') {
    sides.push({ kind: 'wild', team: [cfg.foe.mon], active: 0, boost: {}, seen: [] });
  } else if (cfg.foe.kind === 'npc') {
    sides.push({ kind: 'npc', name: cfg.foe.name, title: cfg.foe.title || '', sprite: cfg.foe.sprite || null,
      team: cfg.foe.team, active: 0, boost: {}, seen: [], prize: cfg.foe.prize || 0 });
  } else {
    const q = getPlayer(state, cfg.foe.pid);
    const qi = healthyIndex(q.team);
    if (qi < 0) fail(`${q.name} não tem Pokémon em condições de lutar.`);
    sides.push({ kind: 'player', pid: q.id, active: qi, boost: {}, seen: [q.team[qi].uid] });
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
  markSeen(p, foeMon.sp);
  if (sides[1].kind === 'player') markSeen(getPlayer(state, sides[1].pid), sideActive(state, sides[0]).sp);

  const foeSide = sides[1];
  if (cfg.kind === 'wild') {
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
    case 'attack':
      return;
    case 'switch': {
      const i = Number(choice.index);
      if (!team[i]) fail('Pokémon inválido.');
      if (team[i].hp <= 0) fail('Esse Pokémon está desmaiado.');
      if (i === side.active && !b.mustSwitch[si]) fail('Esse Pokémon já está em campo.');
      if (i === side.active && b.mustSwitch[si]) fail('Escolha outro Pokémon.');
      return;
    }
    case 'item': {
      const it = getItem(choice.item);
      if (!it || !['heal', 'revive', 'boost'].includes(it.kind)) fail('Esse item não pode ser usado em batalha.');
      if (!(player.items[choice.item] > 0)) fail('Você não tem esse item.');
      const target = team[choice.index ?? side.active];
      if (!target) fail('Alvo inválido.');
      if (it.kind === 'heal' && (target.hp <= 0 || target.hp >= maxHpOf(target))) fail('Esse Pokémon não precisa de cura.');
      if (it.kind === 'revive' && target.hp > 0) fail('Revive só funciona em Pokémon desmaiado.');
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
    const choices = b.sides.map((s, i) => b.choices[i] || aiChoice(state, i));
    b.choices = [null, null];
    resolveRound(state, rng, choices);
  }
}

/** IA simples para NPC/selvagem: ataca sempre. */
function aiChoice() {
  return { move: 'attack' };
}

// ---------------------------------------------------------------- rodada
function doSwitch(state, si, index) {
  const side = state.battle.sides[si];
  const team = sideTeam(state, side);
  side.active = index;
  if (!side.seen.includes(team[index].uid)) side.seen.push(team[index].uid);
  log(state, `🔄 ${sideName(state, side)} enviou ${speciesName(team[index].sp)}!`);
  const other = state.battle.sides[1 - si];
  if (other.kind === 'player') markSeen(getPlayer(state, other.pid), team[index].sp);
}

function useBattleItem(state, si, choice) {
  const side = state.battle.sides[si];
  const player = getPlayer(state, side.pid);
  const team = sideTeam(state, side);
  const it = getItem(choice.item);
  const target = team[choice.index ?? side.active];
  takeItem(player, choice.item);
  if (it.kind === 'heal') {
    const healed = healMon(target, it.healPct);
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
    fx(state, { k: 'capture', roll: 6, total: 99, target: 0, ok: true, ball: ballId });
    return 'captured';
  }

  const mine = sideActive(state, side);
  const max = maxHpOf(wild);
  const hpBonus = wild.hp <= max * 0.25 ? 2 : wild.hp <= max * 0.5 ? 1 : 0;
  const lvlBonus = mine && mine.lvl >= wild.lvl + 5 ? 1 : 0;
  const bBonus = ballBonusAgainst(ballId, sp.types);
  const target = CAPTURE_TARGET[sp.tier] + (wild.shiny ? 1 : 0);
  const roll = rng.d6();
  const total = roll + bBonus + hpBonus + lvlBonus;
  const ok = roll !== 1 && total >= target;

  const parts = [`🎲 ${roll}`];
  if (bBonus) parts.push(`bola +${bBonus}`);
  if (hpBonus) parts.push(`HP baixo +${hpBonus}`);
  if (lvlBonus) parts.push(`nível +${lvlBonus}`);
  const detail = `${parts.join(' · ')} = ${total} (precisa ${target}+)`;
  fx(state, { k: 'capture', roll, total, target, ok, ball: ballId });

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

function attackDamage(state, rng, si) {
  const b = state.battle;
  const atkSide = b.sides[si];
  const defSide = b.sides[1 - si];
  const a = sideActive(state, atkSide);
  const d = sideActive(state, defSide);
  const aSp = getSpecies(a.sp);
  const dSp = getSpecies(d.sp);
  const atk = computeStats(a.sp, a.lvl, a.shiny).atk + (atkSide.boost[a.uid] || 0);
  const { mult, type } = bestAttack(aSp.types, dSp.types);
  const roll = rng.d6();
  const critMod = roll === 6 ? 1.5 : roll === 1 ? 0.5 : 1;
  let dmg = mult === 0 ? 0 : Math.max(1, Math.round((atk * 0.7 + roll) * mult * critMod));
  dmg = Math.min(dmg, d.hp);
  d.hp -= dmg;

  const eff = effectivenessLabel(mult);
  let msg = `${monLabel(state, atkSide)} usou um golpe de ${TYPE_LABELS[type]} (🎲${roll})`;
  if (mult === 0) msg += ` — não afeta ${speciesName(d.sp)}!`;
  else {
    msg += ` e causou ${dmg} de dano`;
    if (roll === 6) msg += ' — CRÍTICO!';
    else if (roll === 1) msg += ' (golpe fraco)';
    if (eff) msg += (roll === 6 ? ' ' : '. ') + eff;
    else if (roll !== 6) msg += '.';
  }
  log(state, msg, mult >= 2 ? 'good' : mult < 1 ? 'bad' : 'battle');
  fx(state, { k: 'hit', side: si, roll, dmg, mult, crit: roll === 6, type });
  return d.hp <= 0;
}

function awardKO(state, winnerSi, loserSi) {
  const b = state.battle;
  const winSide = b.sides[winnerSi];
  const loseSide = b.sides[loserSi];
  const foe = sideActive(state, loseSide);
  log(state, `💥 ${monLabel(state, loseSide)} desmaiou!`, 'battle');
  fx(state, { k: 'faint', side: loserSi });
  if (winSide.kind !== 'player') return;

  const player = getPlayer(state, winSide.pid);
  const isTrainer = loseSide.kind !== 'wild';
  let xp = xpReward(foe, isTrainer);
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
  attackers.sort((x, y) => sideActive(state, b.sides[y]).lvl - sideActive(state, b.sides[x]).lvl || x - y);
  for (const si of attackers) {
    const me = sideActive(state, b.sides[si]);
    if (!me || me.hp <= 0) continue; // desmaiou antes de agir
    const fainted = attackDamage(state, rng, si);
    if (fainted) {
      const loser = 1 - si;
      awardKO(state, si, loser);
      if (handleFaint(state, rng, loser)) return;
      break; // quem desmaiou não ataca nesta rodada
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
  if (!hasHealthy(team)) {
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
    if (other.kind === 'player') markSeen(getPlayer(state, other.pid), m.sp);
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
  mon.ball = ballId;
  const where = giveMon(p, mon);
  log(state, `🎉 ${speciesName(mon.sp)}${mon.shiny ? ' ✨' : ''} entrou ${where === 'team' ? 'na equipe' : 'no PC (equipe cheia)'} de ${p.name}!`, mon.shiny ? 'shiny' : 'good');
}
