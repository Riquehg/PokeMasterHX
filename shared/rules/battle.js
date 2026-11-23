// Sistema de batalha por rodadas — o mesmo para selvagens, treinadores NPC, ginásios, Liga e PvP.
//
// Cada rodada: os dois lados escolhem uma ação (atacar, trocar, item, pokébola, fugir).
// Trocas/itens/pokébolas/fuga acontecem primeiro; depois os ataques, do mais rápido (maior nível) ao mais lento.
// Dano = (ataque × 0,7 + d6) × efetividade de tipo × (crítico 1,5 no 6 / golpe fraco 0,5 no 1)

import { getSpecies } from '../data/pokemon.js';
import { getItem, ballBonusAgainst } from '../data/items.js';
import { against, bestAttack, effectivenessLabel, TYPE_LABELS } from './types.js';
import { monMoves, STAB, defaultMoveIds, MAX_FORMS } from '../data/moves.js';
import { companionBonus, progressMission, companionLevel } from './missions.js';
import { getCompanion, isIntimate, ASSIST_CHANCE, ASSIST_MAX } from '../data/companions.js';
import { weatherMult, weatherInflict, weatherChip, weatherOf } from './weather.js';
import { conquestMult } from './modeBonus.js';
import { GYMS } from '../data/trainers.js';
import { statsOf, maxHpOf, gainXp, xpReward, healMon, canTransform, transformInto, revertForm, megaEvolveMon, defFactor } from './monsters.js';
import { megaFor } from '../data/megas.js';
import { gmaxFor, GMAX_ROUNDS } from '../data/gmax.js';
import { ABILITIES, abilityOf, PINCH_MULT, BAND_MULT, PLATE_MULT, QUICK_CLAW, LEFTOVERS_FRAC } from '../data/battlegear.js';
import { CURRY_MULT, XP_SHAKE_MULT } from '../data/home.js';
import {
  fail, getPlayer, log, fx, takeItem, giveMon, markSeen, markMega, healthyIndex, hasHealthy, speciesName, canUse, usableIndex, badgesNeeded
} from './helpers.js';

export const MAX_ROUNDS = 30;
// Lendários (tier 5) são difíceis: precisa 8+ (com Ultra Ball e HP cheio ≈ 17%; com HP baixo e condição passa de 50%)
// e fogem com facilidade depois de escapar da bola. (Era 11 — ficava 0% com HP cheio.)
export const CAPTURE_TARGET = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 8 };
export const WILD_FLEE_AFTER_FAIL = { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.3, 5: 0.65 };

/**
 * ⚡ Captura LENDÁRIA (lendários e míticos selvagens): bem mais difícil que a normal.
 *  - Acima de 50% do HP ele repele a bola (bola perdida, sem rolagem).
 *  - Rola 2 dados (2d6) e precisa de 14+ (Mítico 15+, shiny +1). 🎲🎲 1+1 sempre falha.
 *  - Bônus limitados: bola no máximo +2, HP baixo (≤50% +1, ≤25% +2), condição +1 — teto +5. Nível não ajuda.
 *  - Ultra Ball + HP ≤25%: ~17% · + sono/paralisia: ~28%. Cada erro: 65% de chance de ele fugir. Master Ball continua garantida.
 */
export const LEGEND_CAPTURE = { target: 14, mythical: 1, ballMax: 2, bonusMax: 5, minHpRatio: 0.5 };

/** Contas da captura (mesmas no motor, na interface e na CPU). */
export function captureMath(wild, mine, ballId, status) {
  const sp = getSpecies(wild.sp);
  const max = maxHpOf(wild);
  const hpBonus = wild.hp <= max * 0.25 ? 2 : wild.hp <= max * 0.5 ? 1 : 0;
  const bBonus = ballBonusAgainst(ballId, sp.types);
  if (sp.legendary || sp.tier >= 5) {
    const blocked = wild.hp > max * LEGEND_CAPTURE.minHpRatio;
    const ball = Math.min(LEGEND_CAPTURE.ballMax, bBonus);
    const stB = status ? 1 : 0;
    const bonus = Math.min(LEGEND_CAPTURE.bonusMax, ball + hpBonus + stB);
    const target = LEGEND_CAPTURE.target + (sp.mythical ? LEGEND_CAPTURE.mythical : 0) + (wild.shiny ? 1 : 0);
    return { legendary: true, blocked, dice: 2, bonus, target, ball, hpBonus, stBonus: stB, lvlBonus: 0 };
  }
  const lvlBonus = mine && mine.lvl >= wild.lvl + 5 ? 1 : 0;
  const stBonus = status ? (status.id === 'sleep' || status.id === 'freeze' ? 2 : 1) : 0; // condição ajuda a capturar (como nos jogos)
  const target = CAPTURE_TARGET[sp.tier] + (wild.shiny ? 1 : 0);
  return { legendary: false, blocked: false, dice: 1, bonus: bBonus + hpBonus + lvlBonus + stBonus, target, ball: bBonus, hpBonus, stBonus, lvlBonus };
}

/** Chance (0..1) de capturar com essas contas. */
export function captureProb(m) {
  if (m.blocked) return 0;
  let ok = 0;
  if (m.dice === 2) {
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (!(a === 1 && b === 1) && a + b + m.bonus >= m.target) ok++;
    return ok / 36;
  }
  for (let r = 2; r <= 6; r++) if (r + m.bonus >= m.target) ok++;
  return ok / 6;
}

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
  const announce = () => { onEnter(state, 0); onEnter(state, 1); };
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
  announce(); // 😠 Intimidação de quem começa em campo
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
      const me = team[side.active];
      const mv = monMoves(me)[slot];
      if (mv && SUPPORT.includes(mv.kind) && gearOf(me)?.id === 'choice_band') fail('🎀 Com a Faixa Escolhida só dá para usar golpes de ataque.');
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
      if (legendCapBlocked(getPlayer(state, b.sides[si].pid), sideActive(state, b.sides[1 - si]))) fail(`⚡ Você já capturou ${LEGEND_MATCH_LIMIT} lendários das casas Amarelas nesta partida — este não dá para capturar (vença para ganhar XP).`);
      if (sideActive(state, b.sides[1 - si])?.megaBoss) fail('Esse Pokémon está cheio de energia Mega — não dá para capturar. Vença para ganhar fragmentos!');
      const it = getItem(choice.item);
      if (!it || it.kind !== 'ball') fail('Escolha uma Pokébola.');
      if (!(player.items[choice.item] > 0)) fail('Você não tem essa Pokébola.');
      return;
    }
    case 'flee':
      if (b.kind === 'elite' || b.kind === 'champion' || b.kind === 'gym') fail('Não dá para fugir de uma batalha oficial.');
      return;
    case 'mega': { // 💎 Mega Evolução
      const why = megaBlock(state, si);
      if (why) fail(why);
      return;
    }
    case 'gmax': { // 🔴 Gigantamax (v55)
      const why = gmaxBlock(state, si);
      if (why) fail(why);
      return;
    }
    case 'form': { // 🧬 Ditto/Mew: voltar à forma, usar uma forma guardada ou guardar a forma atual
      const me = team[side.active];
      if (!canTransform(me)) fail('Esse Pokémon não se transforma.');
      if (choice.op === 'reset') { if (!me.tf) fail('Ele já está na forma original.'); return; }
      if (choice.op === 'store') {
        if (!me.tf) fail('Transforme-se primeiro para guardar a forma.');
        if ((me.forms || []).some(f => f.sp === me.sp)) fail('Essa forma já está guardada.');
        if ((me.forms || []).length >= MAX_FORMS) fail(`Já tem ${MAX_FORMS} formas guardadas. Esqueça uma antes.`);
        return;
      }
      if (choice.op === 'forget') { if (!me.forms?.[Number(choice.i)]) fail('Forma inválida.'); return; }
      if (choice.op === 'use') {
        const f = me.forms?.[Number(choice.i)];
        if (!f || !getSpecies(f.sp)) fail('Forma inválida.');
        if (me.tf && me.sp === f.sp) fail('Ele já está nessa forma.');
        return;
      }
      fail('Ação de forma inválida.');
    }
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

  // 💎 Mega Evolução: ação grátis (não gasta a rodada), 1 por batalha
  if (choice.move === 'mega') { doMega(state, si); return; }
  if (choice.move === 'gmax') { doGmax(state, si); return; }

  // guardar/esquecer forma não gasta a rodada
  if (choice.move === 'form' && (choice.op === 'store' || choice.op === 'forget')) {
    const me = sideActive(state, b.sides[si]);
    if (choice.op === 'store') {
      me.forms = [...(me.forms || []), { sp: me.sp, moves: Array.isArray(me.moves) ? [...me.moves] : null }];
      log(state, `💾 ${speciesName(me.tf.sp)} guardou a forma de ${speciesName(me.sp)} (${me.forms.length}/${MAX_FORMS}).`, 'good');
      fx(state, { k: 'form_store', side: si, uid: me.uid, sp: me.sp });
    } else {
      const [f] = me.forms.splice(Number(choice.i), 1);
      log(state, `🗑️ Forma de ${speciesName(f.sp)} esquecida.`);
    }
    return;
  }

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
const IMMUNE = { burn: ['fire'], poison: ['poison', 'steel'], paralysis: ['electric'], freeze: ['ice'], sleep: [] };

export function statusOf(b, si, mon) {
  return mon ? b.sides[si].status?.[mon.uid] || null : null;
}

function tryInflict(state, rng, defSi, d, move, aSp, a = null) {
  const b = state.battle;
  const id = move.st; // ⚔️ v44: só golpes que causam condição nos jogos (ex.: Ember 10% queimar, Thunder 30% paralisar)
  if (!id || move.kind !== 'dmg') return;
  const side = b.sides[defSi];
  side.status ||= {};
  if (side.status[d.uid]) return; // já tem uma condição
  if (statusBlocked(state, d, id, true)) return; // tipo, habilidade (Imunidade, Insônia, Pó Escudo...)
  let chance = move.stChance || 0.1;
  { const cb = companionBonus(state, 1 - defSi); if (cb?.inflict === move.type) chance += cb.inflictChance || 0.04; } // companheiro (ex.: Koga) aumenta a chance
  chance *= weatherInflict(state, id); // clima (ex.: Tempestade dobra a paralisia)
  if (a && abilOf(a) === 'serene_grace') chance *= 2; // 🕊️ Graça Serena
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
// ⚔️ v41 — itens de batalha segurados e habilidades
export const gearOf = m => { const it = m?.held ? getItem(m.held) : null; return it?.kind === 'gear' ? { id: m.held, ...it } : null; };
export const abilOf = m => abilityOf(m?.sp);
const SUPPORT = ['heal', 'buff', 'debuff', 'transform'];
const isDmg = mv => mv && (mv.kind === 'dmg' || mv.kind === 'drain' || !mv.kind);
/** Habilidade de DEFESA de d, a não ser que o atacante tenha Quebra-Molde. */
export const defAbil = (a, d) => (a && abilOf(a) === 'mold_breaker' ? null : abilOf(d));
const AB = k => ABILITIES[k] || null;
/** O golpe é absorvido/anulado pela habilidade do alvo? (Levitação, Absorve Água, Para-raios...) */
export function abilityImmune(type, d, a) {
  const A = AB(defAbil(a, d));
  return !!A && (A.immune === type || A.absorb === type);
}
/** Efetividade levando em conta as imunidades por habilidade. */
function typeMultVs(type, d, a) {
  if (abilityImmune(type, d, a)) return 0;
  return against(type, getSpecies(d.sp).types);
}
/** Multiplicador de dano do ATACANTE: habilidade (aperto, Técnico, Garras Duras, Adaptabilidade, Força Bruta, Fogo Interior) e item. */
function abilAtkMult(a, move, side) {
  const type = move.type;
  let m = 1;
  const k = abilOf(a), A = AB(k);
  if (A?.pinch === type && a.hp <= maxHpOf(a) / 3) m *= PINCH_MULT;
  if (k === 'technician' && (move.power || 1) <= 1) m *= 1.5;
  if (k === 'tough_claws') m *= 1.2;
  if (k === 'sheer_force') m *= 1.3;
  if (k === 'adaptability' && getSpecies(a.sp).types.includes(type)) m *= 1.5 / STAB;
  if (k === 'flash_fire' && type === 'fire' && side?.flash?.[a.uid]) m *= 1.5;
  return m;
}
function gearMult(a, type) {
  const g = gearOf(a);
  return (g?.plate === type ? PLATE_MULT : 1) * (g?.id === 'choice_band' ? BAND_MULT : 1);
}
const gearAbilMult = (a, move, side) => abilAtkMult(a, move, side) * gearMult(a, move.type);
/** Multiplicador de dano do DEFENSOR (Gordura Espessa, Multiescamas, Filtro...). */
function defAbilMult(a, d, type, mult) {
  const k = defAbil(a, d), A = AB(k);
  if (!A) return 1;
  let m = 1;
  if (k === 'thick_fat' && (type === 'fire' || type === 'ice')) m *= 0.5;
  if (k === 'heatproof' && type === 'fire') m *= 0.5;
  if (A.weakTo === type) m *= 1.25;
  if (k === 'multiscale' && d.hp >= maxHpOf(d)) m *= 0.5;
  if ((k === 'filter' || k === 'solid_rock' || k === 'prism_armor') && mult >= 2) m *= 0.75;
  return m;
}
/** Condição bloqueada por tipo ou habilidade? (fromMove: veio do golpe do adversário) */
function statusBlocked(state, mon, id, fromMove = false) {
  if ((IMMUNE[id] || []).some(t => getSpecies(mon.sp).types.includes(t))) return true;
  const k = abilOf(mon), A = AB(k);
  if (A?.blocks?.includes(id)) return true;
  if (k === 'leaf_guard' && state.weather?.id === 'sun') return true;
  if (k === 'shield_dust' && fromMove) return true;
  return false;
}
/** Baixar o ataque de um Pokémon (Intimidação ou golpe de debuff). Respeita Corpo Puro & cia e ativa Desafiador/Competitivo. */
function lowerAtk(state, si, mon, source, viaIntimidate = false) {
  const side = state.battle.sides[si];
  side.stage ||= {};
  const k = abilOf(mon), A = AB(k);
  if (A?.guard || (viaIntimidate && k === 'inner_focus')) {
    log(state, `${A.icon} ${A.name} de ${speciesName(mon.sp)}: o ataque dele não cai!`);
    return false;
  }
  const st = side.stage[mon.uid] || 0;
  if (st <= -2) return false;
  side.stage[mon.uid] = st - 1;
  fx(state, { k: 'debuff', side: si, uid: mon.uid, move: source, stage: st - 1 });
  if (k === 'defiant' || k === 'competitive') {
    side.stage[mon.uid] = Math.min(2, st - 1 + 2);
    log(state, `${A.icon} ${A.name}! ${speciesName(mon.sp)} ficou com raiva e o ataque subiu.`, 'good');
    fx(state, { k: 'buff', side: si, uid: mon.uid, move: A.name, stage: side.stage[mon.uid] });
  }
  return true;
}
/** Subir o ataque em +1 por habilidade (Ousadia, Para-raios, Justiceiro...). */
function raiseAtk(state, si, mon, why) {
  const side = state.battle.sides[si];
  side.stage ||= {};
  const st = side.stage[mon.uid] || 0;
  if (st >= 2) return;
  side.stage[mon.uid] = st + 1;
  fx(state, { k: 'buff', side: si, uid: mon.uid, move: why, stage: st + 1 });
  log(state, `🔺 ${why}: o ataque de ${speciesName(mon.sp)} subiu!`, 'good');
}
/** Ao entrar em campo: 😠 Intimidação; marca a rodada de entrada (Início Lento) e zera a Preguiça. */
function onEnter(state, si) {
  const b = state.battle;
  if (!b || b.over) return;
  const side = b.sides[si];
  const me = sideActive(state, side);
  if (!me || me.hp <= 0) return;
  side.entered = { ...(side.entered || {}), [me.uid]: b.round };
  if (side.recharge) delete side.recharge[me.uid];
  if (side.truant) delete side.truant[me.uid];
  if (abilOf(me) !== 'intimidate') return;
  const foe = sideActive(state, b.sides[1 - si]);
  if (!foe || foe.hp <= 0) return;
  const before = (b.sides[1 - si].stage || {})[foe.uid] || 0;
  log(state, `😠 Intimidação de ${speciesName(me.sp)}!`, 'battle');
  if (lowerAtk(state, 1 - si, foe, 'Intimidação', true) && before > ((b.sides[1 - si].stage || {})[foe.uid] || 0)) log(state, `O ataque de ${speciesName(foe.sp)} caiu.`, 'battle');
}

const stageMult = st => (st >= 0 ? 1 + 0.4 * st : 1 - 0.3 * -st);

function atkOf(state, si, foeUnaware = false) {
  const b = state.battle;
  const side = b.sides[si];
  const a = sideActive(state, side);
  let st = (side.stage || {})[a.uid] || 0;
  if (foeUnaware && st > 0) st = 0; // 😶 Indiferente: ignora o ataque aumentado
  const k = abilOf(a);
  const hasStatus = !!side.status?.[a.uid];
  const burned = side.status?.[a.uid]?.id === 'burn' && k !== 'guts' ? 0.75 : 1;
  let ab = AB(k)?.atk || 1; // Força Enorme/Pura, Afobação
  if (k === 'guts' && hasStatus) ab *= 1.5;
  if (k === 'slow_start' && b.round - ((side.entered || {})[a.uid] ?? 0) < 5) ab *= 0.5;
  return Math.max(1, (statsOf(a).atk + (side.boost[a.uid] || 0)) * stageMult(st) * burned * ab);
}
const unawareVs = (state, si) => { const b = state.battle; const a = sideActive(state, b.sides[si]); const d = sideActive(state, b.sides[1 - si]); return defAbil(a, d) === 'unaware'; };

/** Dano esperado (média do dado) de um golpe do lado si contra o ativo do outro lado. */
export function expectedDamage(state, si, move) {
  const b = state.battle;
  const a = sideActive(state, b.sides[si]);
  const d = sideActive(state, b.sides[1 - si]);
  if (!a || !d || move.kind === 'heal' || move.kind === 'buff' || move.kind === 'debuff' || move.kind === 'transform') return 0;
  const mult = typeMultVs(move.type, d, a);
  const stab = getSpecies(a.sp).types.includes(move.type) ? STAB : 1;
  const hit = 1 - (move.miss || 0) / 6;
  return (atkOf(state, si, unawareVs(state, si)) * 0.7 + 3.5) * (move.power || 1) * mult * stab * hit * gearAbilMult(a, move, b.sides[si]) * defAbilMult(a, d, move.type, mult) * defFactor(statsOf(d).def) * (move.recharge ? 0.6 : 1) * (move.selfDrop ? 0.9 : 1) * (move.highCrit ? 1.05 : 1);
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
    if (m.kind === 'transform') score = me.tf || foe.sp === 'ditto' ? -1 : 9999; // Ditto/Mew da CPU copia logo no começo
    if (gearOf(me)?.id === 'choice_band' && SUPPORT.includes(m.kind)) score = -2; // 🎀 só ataca
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

// ---------------------------------------------------------------- rodada
function doSwitch(state, si, index) {
  const side = state.battle.sides[si];
  const team = sideTeam(state, side);
  const out = team[side.active];
  if (out?.gmaxLeft !== undefined) endGmax(state, si, out, 'acabou ao sair de campo');
  if (out && out.hp > 0) { // ✨ ao sair: Regenerador / Cura Natural
    const k = abilOf(out);
    if (k === 'regenerator' && out.hp < maxHpOf(out)) { const h = healMon(out, 1 / 3); if (h) log(state, `♻️ Regenerador: ${speciesName(out.sp)} recuperou ${h} HP ao sair.`, 'good'); }
    if (k === 'natural_cure' && side.status?.[out.uid]) { delete side.status[out.uid]; log(state, `🌸 Cura Natural: ${speciesName(out.sp)} se curou ao sair.`, 'good'); }
  }
  side.active = index;
  fx(state, { k: 'switch', side: si, uid: team[index].uid });
  if (!side.seen.includes(team[index].uid)) side.seen.push(team[index].uid);
  log(state, `🔄 ${sideName(state, side)} enviou ${speciesName(team[index].sp)}!`);
  const other = state.battle.sides[1 - si];
  if (other.kind === 'player') markSeen(getPlayer(state, other.pid), team[index].sp, !!team[index].shiny);
  onEnter(state, si);
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
  const st = statusOf(b, 1 - si, wild);
  const m = captureMath(wild, mine, ballId, st);
  if (m.blocked) { // ⚡ lendário forte demais: repele a bola
    fx(state, { k: 'capture', pid: player.id, roll: 1, total: 0, target: m.target, ok: false, ball: ballId, sp: wild.sp, shiny: !!wild.shiny, shakes: 0, repelled: true });
    log(state, `⚡ ${speciesName(wild.sp)} repeliu a ${ball.name}! Lendários só podem ser capturados com o HP abaixo de 50%.`, 'bad');
    return null;
  }
  const roll = rng.d6();
  const roll2 = m.dice === 2 ? rng.d6() : 0;
  const total = roll + roll2 + m.bonus;
  const ok = (m.dice === 2 ? !(roll === 1 && roll2 === 1) : roll !== 1) && total >= m.target;
  const parts = [m.dice === 2 ? `🎲 ${roll}+${roll2}` : `🎲 ${roll}`];
  if (m.ball) parts.push(`bola +${m.ball}`);
  if (m.hpBonus) parts.push(`HP baixo +${m.hpBonus}`);
  if (m.lvlBonus) parts.push(`nível +${m.lvlBonus}`);
  if (m.stBonus) parts.push(`${STATUS[st.id].adj} +${m.stBonus}`);
  const capped = m.legendary && m.ball + m.hpBonus + m.stBonus > m.bonus ? ` (teto lendário +${m.bonus})` : '';
  const crit = m.dice === 2 ? roll === 1 && roll2 === 1 : roll === 1;
  const detail = `${parts.join(' · ')}${capped} = ${total} (precisa ${m.target}+${m.legendary ? ', captura lendária' : ''})`;
  const shakes = ok ? 3 : crit ? 0 : Math.max(0, Math.min(2, 3 + (total - m.target)));
  fx(state, { k: 'capture', pid: player.id, roll: crit ? 1 : roll, total, target: m.target, ok, ball: ballId, sp: wild.sp, shiny: !!wild.shiny, shakes, legendary: m.legendary });

  if (ok) {
    log(state, `🔴 ${player.name} jogou uma ${ball.name}... ${detail}. Capturou!`, 'good');
    return 'captured';
  }
  log(state, `🔴 ${player.name} jogou uma ${ball.name}... ${detail}. ${crit ? 'Falha crítica!' : 'Escapou da bola!'}`, 'bad');
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

  // 🧬 Transform: vira uma cópia do adversário
  if (move.kind === 'transform') {
    if ((d.tf ? d.tf.sp : d.sp) === 'ditto' || d.sp === 'ditto') { log(state, `${who} tentou se transformar, mas não dá para copiar um Ditto!`); return false; }
    const from = speciesName(a.sp);
    transformInto(a, d.sp, Array.isArray(d.moves) && d.moves.length === 2 ? d.moves : defaultMoveIds(d.sp));
    fx(state, { k: 'transform', side: si, uid: a.uid, to: a.sp, hpAfter: a.hp, maxHp: maxHpOf(a) });
    log(state, `🧬 ${from} usou Transform e virou uma cópia de ${speciesName(a.sp)}${a.shiny ? ' (shiny: cópia mais forte!)' : ''}!`, 'good');
    return false;
  }
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
    log(state, `🔻 ${who} usou ${move.name}!`, 'battle');
    if (lowerAtk(state, 1 - si, d, move.name) && (defSide.stage[d.uid] || 0) < st) log(state, `O ataque de ${speciesName(d.sp)} caiu (−${(1 - st) * 30}%).`, 'battle');
    return false;
  }

  const ak = abilOf(a), dk = defAbil(a, d), DA = AB(dk);
  const type = move.type;
  // ✨ habilidade do alvo absorve o golpe (Absorve Água, Para-raios, Fogo Interior...)
  if (DA?.absorb === type && isDmg(move)) {
    let extra = '';
    if (DA.heal) { const h = healMon(d, DA.heal); extra = h ? ` e recuperou ${h} HP` : ''; if (h) fx(state, { k: 'heal', side: 1 - si, uid: d.uid, amount: h, hpAfter: d.hp, maxHp: maxHpOf(d) }); }
    log(state, `${who} usou ${move.name}, mas ${DA.icon} ${DA.name} de ${speciesName(d.sp)} absorveu o golpe${extra}!`, 'bad');
    fx(state, { k: 'hit', side: si, roll: 0, dmg: 0, mult: 0, type, move: move.name, atkUid: a.uid, defUid: d.uid, hpAfter: d.hp, maxHp: maxHpOf(d) });
    if (DA.boost) raiseAtk(state, 1 - si, d, DA.name);
    if (DA.flash) defSide.flash = { ...(defSide.flash || {}), [d.uid]: true };
    return false;
  }
  const atk = atkOf(state, si, dk === 'unaware');
  const mult = typeMultVs(type, d, a);
  const stab = aSp.types.includes(type) ? STAB : 1;
  const roll = rng.d6();
  // 🎲 erro: Afobação (+1), Olhos Compostos (−1), Véu de Areia/Manto de Neve do alvo (+1), Sem Guarda (nunca erra)
  let missOn = move.miss || 0;
  if (AB(ak)?.missUp) missOn += AB(ak).missUp;
  if (ak === 'compound_eyes' && missOn > 0) missOn -= 1;
  if (DA?.evade && state.weather?.id === DA.evade) missOn += 1;
  if (ak === 'no_guard' || abilOf(d) === 'no_guard') missOn = 0;
  if (missOn && roll <= missOn) {
    log(state, `${who} usou ${move.name} (🎲${roll})... e errou!`, 'bad');
    fx(state, { k: 'hit', side: si, roll, dmg: 0, mult, miss: true, type, move: move.name, atkUid: a.uid, defUid: d.uid, hpAfter: d.hp, maxHp: maxHpOf(d) });
    return false;
  }
  // 🎲 crítico: Sorte Grande (5 ou 6), Atirador (×2), Armadura/Casco do alvo (sem crítico)
  const critFrom = 6 - (ak === 'super_luck' ? 1 : 0) - (move.highCrit ? 1 : 0); // Sorte Grande e golpes de crítico alto
  let crit = roll >= critFrom;
  if (crit && DA?.noCrit) crit = false;
  const critMod = crit ? (ak === 'sniper' ? 2 : 1.5) : roll === 1 ? 0.5 : 1;
  const cb = companionBonus(state, si);
  const compMult = cb?.types?.includes(type) ? 1 + cb.dmg : 1; // bônus do companheiro (ex.: Misty em golpes de Água)
  const wMult = weatherMult(state, type); // clima (ex.: Chuva +30% em Água)
  const cqMult = (atkSide.kind === 'player' ? conquestMult(state, atkSide.pid, type, GYMS) : 1) // Conquista: cidades dominadas
    * (atkSide.kind === 'player' && getPlayer(state, atkSide.pid)?.meal?.type === type ? CURRY_MULT : 1); // 🍛 Curry do tipo
  const gMult = gearAbilMult(a, move, atkSide); // ⚔️ habilidade do atacante + item
  const daMult = defAbilMult(a, d, type, mult); // ✨ habilidade de defesa do alvo
  const dMult = defFactor(statsOf(d).def); // 🛡️ DEF de quem recebe
  let dmg = mult === 0 ? 0 : Math.max(1, Math.round((atk * 0.7 + roll) * (move.power || 1) * stab * mult * critMod * compMult * wMult * cqMult * gMult * daMult * dMult));
  // 🪨 Robustez / 🎗️ Faixa de Foco: com HP cheio, aguenta o golpe com 1 HP
  let endured = null;
  if (dmg >= d.hp && d.hp > 1 && d.hp >= maxHpOf(d)) {
    if (dk === 'sturdy') endured = 'Robustez';
    else if (gearOf(d)?.id === 'focus_sash' && !(b.sashUsed || {})[d.uid]) { endured = 'Faixa de Foco'; b.sashUsed = { ...(b.sashUsed || {}), [d.uid]: true }; }
    if (endured) dmg = d.hp - 1;
  }
  dmg = Math.min(dmg, d.hp);
  d.hp -= dmg;
  let drained = 0;
  if (move.kind === 'drain' && dmg > 0) drained = healMon(a, 0, Math.ceil(dmg / 2));

  const eff = effectivenessLabel(mult);
  let msg = `${who} usou ${move.name} (🎲${roll})`;
  if (mult === 0) msg += ` — não afeta ${speciesName(d.sp)}${DA?.immune === type ? ` (${DA.icon} ${DA.name})` : ''}!`;
  else {
    msg += ` e causou ${dmg} de dano`;
    if (crit) msg += ' — CRÍTICO!';
    else if (roll === 1) msg += ' (golpe fraco)';
    if (eff) msg += (crit ? ' ' : '. ') + eff;
    else if (!crit) msg += '.';
    if (wMult > 1) msg += ` ${weatherOf(state).icon} (clima +${Math.round((wMult - 1) * 100)}%)`;
    else if (wMult < 1) msg += ` ${weatherOf(state).icon} (clima −${Math.round((1 - wMult) * 100)}%)`;
  }
  if (drained) msg += ` 💚 +${drained} HP`;
  if (gMult > 1 && mult > 0) msg += ` ${abilAtkMult(a, move, atkSide) > 1 ? `${AB(ak).icon} ${AB(ak).name}` : ''}${gearMult(a, type) > 1 ? ` ${gearOf(a).emoji}` : ''}`.trimEnd();
  if (daMult !== 1 && mult > 0) msg += ` ${DA.icon} ${DA.name}`;
  if (endured) msg += ` ${endured === 'Robustez' ? '🪨' : '🎗️'} ${speciesName(d.sp)} aguentou firme com a ${endured}!`;
  // chance de causar condição (queimadura, veneno, paralisia, sono, congelamento) — Força Bruta nunca causa
  if (dmg > 0 && d.hp > 0 && ak !== 'sheer_force') tryInflict(state, rng, 1 - si, d, move, aSp, a);
  // golpe de fogo descongela
  if (type === 'fire' && defSide.status?.[d.uid]?.id === 'freeze') { delete defSide.status[d.uid]; log(state, `🔥 ${speciesName(d.sp)} descongelou!`, 'good'); }
  log(state, msg, mult >= 2 ? 'good' : mult < 1 ? 'bad' : 'battle');
  fx(state, { k: 'hit', side: si, roll, dmg, mult, crit, weak: roll === 1, type, move: move.name, atkUid: a.uid, defUid: d.uid, hpAfter: d.hp, maxHp: maxHpOf(d) });
  if (drained) fx(state, { k: 'heal', side: si, uid: a.uid, amount: drained, hpAfter: a.hp, maxHp: maxHpOf(a) });
  // ⚔️ efeitos do golpe (v44): recuo, baixar o próprio ataque, recarga, hesitar
  if (dmg > 0) {
    if (move.recoil && a.hp > 0 && ak !== 'rock_head') {
      const r = Math.min(a.hp, Math.max(1, Math.round(dmg / move.recoil)));
      a.hp -= r;
      log(state, `↩️ ${monLabel(state, atkSide)} sofreu ${r} de recuo.`, 'bad');
      fx(state, { k: 'status_dmg', side: si, uid: a.uid, status: 'recoil', dmg: r, hpAfter: a.hp, maxHp: maxHpOf(a) });
    }
    if (move.selfDrop && a.hp > 0) {
      atkSide.stage ||= {};
      const st = atkSide.stage[a.uid] || 0;
      if (st > -2) { atkSide.stage[a.uid] = st - 1; log(state, `🔻 O ataque de ${speciesName(a.sp)} caiu depois do ${move.name}.`); fx(state, { k: 'debuff', side: si, uid: a.uid, move: move.name, stage: st - 1 }); }
    }
    if (move.recharge && a.hp > 0) atkSide.recharge = { ...(atkSide.recharge || {}), [a.uid]: true };
    if (move.flinch && d.hp > 0 && !(b.acted || {})[1 - si] && ak !== 'sheer_force' && abilOf(d) !== 'inner_focus' && rng.chance(move.flinch * (ak === 'serene_grace' ? 2 : 1))) {
      b.flinch = { ...(b.flinch || {}), [1 - si]: true };
    }
  }
  // ✨ depois do golpe: Justiceiro, pele que pune (Estática, Corpo Chamejante, Pele Áspera...)
  if (dmg > 0) {
    if (dk === 'justified' && type === 'dark' && d.hp > 0) raiseAtk(state, 1 - si, d, 'Justiceiro');
    const PA = AB(abilOf(d)); // pele que pune vale mesmo contra Quebra-Molde (como nos jogos)
    if (PA && a.hp > 0) {
      if (PA.contact && rng.chance(0.3) && !atkSide.status?.[a.uid]) {
        const id = PA.contact === 'spore' ? rng.pick(['poison', 'paralysis', 'sleep']) : PA.contact;
        if (!statusBlocked(state, a, id)) {
          atkSide.status ||= {};
          atkSide.status[a.uid] = { id, turns: id === 'sleep' ? rng.int(1, 3) : 0 };
          log(state, `${PA.icon} ${PA.name} de ${speciesName(d.sp)}: ${monLabel(state, atkSide)} ficou ${STATUS[id].adj}!`, 'bad');
          fx(state, { k: 'status', side: si, uid: a.uid, status: id });
        }
      }
      if (PA.recoil) {
        const r = Math.min(a.hp, Math.max(1, Math.round(maxHpOf(a) / PA.recoil)));
        a.hp -= r;
        log(state, `${PA.icon} ${PA.name} de ${speciesName(d.sp)} machucou ${monLabel(state, atkSide)} (−${r} HP).`, 'bad');
        fx(state, { k: 'status_dmg', side: si, uid: a.uid, status: 'recoil', dmg: r, hpAfter: a.hp, maxHp: maxHpOf(a) });
      }
    }
  }
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
  let xp = xpReward(foe, isTrainer) * (companionBonus(state, winnerSi)?.xp || 1)
    * (player?.meal?.id === 'xp_shake' ? XP_SHAKE_MULT : 1); // 🥤 Vitamina Turbo
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

/**
 * ❤️ Companheiro íntimo (laço Nv. 10): chance por rodada de entrar com o Pokémon dele e usar um golpe especial.
 * Não vale em duelos/Copa nem no Competitivo. Devolve true se a batalha acabou.
 */
function companionAssist(state, rng, si) {
  const b = state.battle;
  if (b.over || state.options?.duel || state.roomMode === 'ranked') return false;
  const side = b.sides[si];
  if (side.kind !== 'player' || b.mustSwitch[si]) return false;
  const p = getPlayer(state, side.pid);
  const c = getCompanion(p?.companion);
  if (!c?.assist || !isIntimate(companionLevel(p))) return false;
  side.assists ||= 0;
  if (side.assists >= ASSIST_MAX || !rng.chance(ASSIST_CHANCE)) return false;
  const me = sideActive(state, side), foeSide = b.sides[1 - si], foe = sideActive(state, foeSide);
  if (!me || me.hp <= 0 || !foe || foe.hp <= 0) return false;
  side.assists += 1;
  const A = c.assist;
  const base = { k: 'assist', side: si, pid: p.id, comp: p.companion, sp: c.mon, move: A.move, type: A.type, kind: A.kind };
  if (A.kind === 'heal') {
    if (me.hp >= maxHpOf(me)) { side.assists -= 1; return false; } // não gasta se estiver de HP cheio
    const healed = healMon(me, 0.25);
    fx(state, { ...base, uid: me.uid, amount: healed, hpAfter: me.hp, maxHp: maxHpOf(me) });
    log(state, `❤️ ${c.name} entrou com ${speciesName(c.mon)} e usou ${A.move}: ${speciesName(me.sp)} recuperou ${healed} HP!`, 'good');
    return false;
  }
  if (A.kind === 'buff') {
    side.stage ||= {};
    const st = side.stage[me.uid] || 0;
    side.stage[me.uid] = Math.min(2, st + 1);
    fx(state, { ...base, uid: me.uid, stage: side.stage[me.uid] });
    log(state, `❤️ ${c.name} entrou com ${speciesName(c.mon)} e usou ${A.move}: o Ataque de ${speciesName(me.sp)} subiu!`, 'good');
    return false;
  }
  if (A.kind === 'debuff') {
    foeSide.stage ||= {};
    const st = foeSide.stage[foe.uid] || 0;
    foeSide.stage[foe.uid] = Math.max(-2, st - 1);
    fx(state, { ...base, uid: foe.uid, stage: foeSide.stage[foe.uid] });
    log(state, `❤️ ${c.name} entrou com ${speciesName(c.mon)} e usou ${A.move}: o Ataque de ${speciesName(foe.sp)} caiu!`, 'good');
    return false;
  }
  if (A.kind === 'status') {
    const id = TYPE_STATUS[A.type];
    foeSide.status ||= {};
    if (id && !foeSide.status[foe.uid] && !IMMUNE[id].some(t => getSpecies(foe.sp).types.includes(t))) {
      foeSide.status[foe.uid] = { id, turns: id === 'sleep' ? rng.int(1, 3) : 0 };
      fx(state, { ...base, uid: foe.uid, status: id });
      log(state, `❤️ ${c.name} entrou com ${speciesName(c.mon)} e usou ${A.move}: ${speciesName(foe.sp)} ficou ${STATUS[id].adj}!`, 'good');
      return false;
    }
    // já tem condição (ou é imune): vira um golpe de dano
  }
  // dano: 12% do HP máximo do alvo × efetividade (mín. 0,5×), sem nocautear direto se for lendário/chefe
  const mult = Math.max(0.5, against(A.type, getSpecies(foe.sp).types) || 0.5);
  let dmg = Math.max(1, Math.round(maxHpOf(foe) * 0.12 * mult));
  if (foe.raid) dmg = Math.min(dmg, foe.hp - 1 > 0 ? foe.hp - 1 : 1);
  dmg = Math.min(dmg, foe.hp);
  foe.hp -= dmg;
  fx(state, { ...base, kind: 'dmg', uid: foe.uid, dmg, mult, hpAfter: foe.hp, maxHp: maxHpOf(foe) });
  log(state, `❤️ ${c.name} entrou com ${speciesName(c.mon)} e usou ${A.move}: ${dmg} de dano em ${speciesName(foe.sp)}!`, 'good');
  if (foe.hp <= 0) {
    awardKO(state, si, 1 - si);
    if (handleFaint(state, rng, 1 - si)) return true;
  }
  return false;
}

// ⚡ Limite de lendários da casa Amarela: 2 capturas por jogador por partida (Raid, eventos e Megas não contam)
export const LEGEND_MATCH_LIMIT = 2;
export const isLegendOrMyth = mon => { const sp = getSpecies(mon?.sp); return !!(sp && (sp.legendary || sp.mythical)); };
export function legendCapBlocked(player, foe) {
  if (player?.legendCharmOn || (player?.items?.legend_charm || 0) > 0) return false; // 🏵️ Amuleto Lendário: sem limite
  return !!(foe?.yellowLegend && (player?.legendCaught || 0) >= LEGEND_MATCH_LIMIT);
}

/** Por que este lado NÃO pode Mega Evoluir agora? (null = pode) */
export function megaBlock(state, si) {
  const b = state.battle;
  const side = b?.sides[si];
  if (!side || side.kind !== 'player') return 'Só treinadores Mega Evoluem.';
  if (!state.options?.megas) return 'Mega Evolução não está liberada nesta partida.';
  const player = getPlayer(state, side.pid);
  if (!player?.megaKey) return 'Você precisa do 🔗 Bracelete Mega (cai em Mega Raids).';
  if (side.megaUsed) return 'Só dá para usar 1 Mega Evolução ou Gigantamax por batalha.';
  const me = sideTeam(state, side)[side.active];
  if (!me || me.hp <= 0) return 'Pokémon inválido.';
  if (!megaFor(me)) return 'Esse Pokémon não está segurando a Megapedra dele.';
  return null;
}
/** Por que este lado NÃO pode dar Gigantamax agora? (null = pode) — mesmas travas da Mega, e divide o "1 por batalha" com ela. */
export function gmaxBlock(state, si) {
  const b = state.battle;
  const side = b?.sides[si];
  if (!side || side.kind !== 'player') return 'Só treinadores usam Gigantamax.';
  if (!state.options?.megas) return 'Mega e Gigantamax não estão liberados nesta partida.';
  const player = getPlayer(state, side.pid);
  if (!player?.dynaKey) return 'Você precisa da 🔴 Pulseira Dynamax (cai em Raids Gigantamax).';
  if (side.megaUsed) return 'Só dá para usar 1 Mega Evolução ou Gigantamax por batalha.';
  const me = sideTeam(state, side)[side.active];
  if (!me || me.hp <= 0) return 'Pokémon inválido.';
  if (!gmaxFor(me)) return me?.gx ? 'Esse Pokémon não tem forma Gigantamax.' : 'Esse Pokémon não tem o ✨ Fator Gigantamax.';
  return null;
}
function doGmax(state, si) {
  const b = state.battle;
  const side = b.sides[si];
  const me = sideTeam(state, side)[side.active];
  const g = gmaxFor(me);
  const from = speciesName(me.sp);
  transformInto(me, g.sp, Array.isArray(me.moves) ? me.moves : null);
  if (!Array.isArray(me.tf.moves)) me.moves = null;
  me.gmaxLeft = GMAX_ROUNDS;
  side.megaUsed = true;
  log(state, `🔴 ${getPlayer(state, side.pid).name}: ${from} ficou GIGANTE — ${speciesName(me.sp)} por ${GMAX_ROUNDS} rodadas!`, 'shiny');
  fx(state, { k: 'gmax', side: si, uid: me.uid, from: g.base, to: me.sp, hpAfter: me.hp, maxHp: maxHpOf(me) });
}
/** Fim do Gigantamax (rodadas acabaram ou saiu de campo). */
function endGmax(state, si, mon, why = 'acabou') {
  if (mon?.gmaxLeft === undefined) return;
  delete mon.gmaxLeft;
  revertForm(mon);
  log(state, `🔴 O Gigantamax de ${speciesName(mon.sp)} ${why} — voltou ao tamanho normal.`);
  fx(state, { k: 'gmax_end', side: si, uid: mon.uid, to: mon.sp, hpAfter: mon.hp, maxHp: maxHpOf(mon) });
}
function doMega(state, si) {
  const b = state.battle;
  const side = b.sides[si];
  const me = sideTeam(state, side)[side.active];
  const m = megaFor(me);
  const from = speciesName(me.sp);
  megaEvolveMon(me, m.sp);
  side.megaUsed = true;
  // 💎 Pokédex Mega: quem evoluiu registra; o adversário (treinador) vê
  markMega(getPlayer(state, side.pid), me.sp, !!me.shiny, true);
  const other = b.sides[1 - si];
  if (other?.kind === 'player') markMega(getPlayer(state, other.pid), me.sp, !!me.shiny);
  log(state, `💎 ${getPlayer(state, side.pid).name}: o ${from} reagiu à ${getItem(me.held)?.name || 'Megapedra'} e Mega Evoluiu em ${speciesName(me.sp)}!`, 'shiny');
  fx(state, { k: 'mega', side: si, uid: me.uid, from: m.base, to: me.sp, hpAfter: me.hp, maxHp: maxHpOf(me) });
}

function resolveRound(state, rng, choices) {
  const b = state.battle;
  b.round += 1;
  // CPU com Bracelete Mega evolui assim que puder
  for (let si = 0; si < 2; si++) {
    const sd = b.sides[si];
    if (sd.kind === 'player' && getPlayer(state, sd.pid)?.isBot && !megaBlock(state, si)) doMega(state, si);
    else if (sd.kind === 'player' && getPlayer(state, sd.pid)?.isBot && !gmaxBlock(state, si)) doGmax(state, si); // 🔴 CPU com Pulseira
  }

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
    } else if (c.move === 'form') {
      const me = sideActive(state, b.sides[si]);
      const base = speciesName(me.tf ? me.tf.sp : me.sp);
      if (c.op === 'reset') {
        revertForm(me);
        log(state, `🧬 ${base} voltou à forma original.`);
        fx(state, { k: 'transform', side: si, uid: me.uid, to: me.sp, reset: true, hpAfter: me.hp, maxHp: maxHpOf(me) });
      } else {
        const f = me.forms[Number(c.i)];
        transformInto(me, f.sp, f.moves);
        log(state, `🧬 ${base} usou uma forma guardada e virou ${speciesName(me.sp)}!`, 'good');
        fx(state, { k: 'transform', side: si, uid: me.uid, to: me.sp, hpAfter: me.hp, maxHp: maxHpOf(me) });
      }
    } else if (c.move === 'flee') {
      const r = tryFlee(state, rng, si);
      if (r === 'fled') return endBattle(state, rng, { result: 'fled', by: si });
      if (r === 'surrender') return endBattle(state, rng, { result: 'win', winner: 1 - si, surrender: true });
    }
  }

  // 1b) ❤️ companheiro íntimo pode entrar na batalha
  for (let si = 0; si < 2; si++) {
    if (companionAssist(state, rng, si)) return;
  }

  // 2) ataques, por velocidade (nível; empate: lado 0)
  const attackers = [0, 1].filter(si => choices[si].move === 'attack');
  // velocidade = nível × natureza (+/-10%); empate: lado 0
  const speedOf = si => { const m = sideActive(state, b.sides[si]); return statsOf(m).spe * (b.sides[si].status?.[m.uid]?.id === 'paralysis' ? 0.5 : 1) * (AB(abilOf(m))?.fast?.includes(state.weather?.id) ? 2 : 1); };
  // 🐾 Garra Rápida: 20% de chance de agir primeiro
  const claw = {};
  for (const si of attackers) if (gearOf(sideActive(state, b.sides[si]))?.id === 'quick_claw' && rng.chance(QUICK_CLAW)) claw[si] = 1;
  // ⚡ prioridade do golpe (Quick Attack, Aqua Jet, Mach Punch...) vem antes de tudo
  const prioOf = si => monMoves(sideActive(state, b.sides[si]))[Number(choices[si].slot || 0)]?.prio || 0;
  attackers.sort((x, y) => prioOf(y) - prioOf(x) || (claw[y] || 0) - (claw[x] || 0) || speedOf(y) - speedOf(x) || x - y);
  b.acted = {}; b.flinch = {};
  for (const si of attackers) if (claw[si]) log(state, `🐾 A Garra Rápida de ${speciesName(sideActive(state, b.sides[si]).sp)} fez ele agir primeiro!`);
  for (const si of attackers) {
    const me = sideActive(state, b.sides[si]);
    if (!me || me.hp <= 0) continue; // desmaiou antes de agir
    const foeNow = sideActive(state, b.sides[1 - si]);
    if (!foeNow || foeNow.hp <= 0) continue;
    b.acted[si] = true;
    if (b.sides[si].recharge?.[me.uid]) { // 😮‍💨 golpe de recarga na rodada anterior
      delete b.sides[si].recharge[me.uid];
      log(state, `😮‍💨 ${monLabel(state, b.sides[si])} precisa descansar depois do golpe pesado.`);
      fx(state, { k: 'status_skip', side: si, uid: me.uid, status: 'recharge' });
      continue;
    }
    if (b.flinch[si]) { // 😵 hesitou (o adversário agiu antes com um golpe que faz hesitar)
      log(state, `😵 ${monLabel(state, b.sides[si])} hesitou e não atacou!`, 'bad');
      fx(state, { k: 'status_skip', side: si, uid: me.uid, status: 'flinch' });
      continue;
    }
    if (!canActWithStatus(state, rng, si)) continue; // dormindo, congelado ou paralisado
    if (abilOf(me) === 'truant') { // 🦥 Preguiça: ataca uma rodada sim, outra não
      const tr = (b.sides[si].truant ||= {});
      if (tr[me.uid]) { delete tr[me.uid]; log(state, `🦥 ${monLabel(state, b.sides[si])} está com preguiça e não fez nada.`); fx(state, { k: 'status_skip', side: si, uid: me.uid, status: 'truant' }); continue; }
      tr[me.uid] = true;
    }
    const fainted = attackDamage(state, rng, si, Number(choices[si].slot || 0));
    if (fainted) {
      const loser = 1 - si;
      awardKO(state, si, loser);
      const mk = abilOf(me);
      if ((mk === 'moxie' || mk === 'beast_boost') && me.hp > 0) raiseAtk(state, si, me, ABILITIES[mk].name); // 😈 Ousadia / 🌀 Impulso Bestial
      if (handleFaint(state, rng, loser)) return;
      if (me.hp <= 0) { awardKO(state, loser, si); if (handleFaint(state, rng, si)) return; }
      break; // quem desmaiou não ataca nesta rodada
    }
    if (me.hp <= 0) { // derrubado pela Pele Áspera / Farpas de Ferro do alvo
      awardKO(state, 1 - si, si);
      if (handleFaint(state, rng, si)) return;
      break;
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

  // 3a) ✨ Troca de Pele (30% cura), Corpo de Gelo / Prato de Chuva (cura no clima)
  if (!b.over) {
    for (let si = 0; si < 2; si++) {
      const mon = sideActive(state, b.sides[si]);
      if (!mon || mon.hp <= 0 || b.mustSwitch[si]) continue;
      const k = abilOf(mon), A = AB(k);
      if (k === 'shed_skin' && b.sides[si].status?.[mon.uid] && rng.chance(0.3)) {
        delete b.sides[si].status[mon.uid];
        log(state, `🐍 Troca de Pele: ${monLabel(state, b.sides[si])} se curou!`, 'good');
      }
      if (A?.heals?.includes(state.weather?.id) && mon.hp < maxHpOf(mon)) {
        const h = healMon(mon, 0, Math.max(1, Math.round(maxHpOf(mon) / 16)));
        if (h) { log(state, `${A.icon} ${A.name}: ${monLabel(state, b.sides[si])} recuperou ${h} HP.`, 'good'); fx(state, { k: 'heal', side: si, uid: mon.uid, amount: h, hpAfter: mon.hp, maxHp: maxHpOf(mon) }); }
      }
    }
  }

  // 3b) 🍎 Restos: recupera um pouco de HP
  if (!b.over) {
    for (let si = 0; si < 2; si++) {
      const mon = sideActive(state, b.sides[si]);
      if (!mon || mon.hp <= 0 || b.mustSwitch[si] || gearOf(mon)?.id !== 'leftovers' || mon.hp >= maxHpOf(mon)) continue;
      const healed = healMon(mon, 0, Math.max(1, Math.round(maxHpOf(mon) / LEFTOVERS_FRAC)));
      if (!healed) continue;
      log(state, `🍎 ${monLabel(state, b.sides[si])} comeu Restos e recuperou ${healed} HP.`, 'good');
      fx(state, { k: 'heal', side: si, uid: mon.uid, amount: healed, hpAfter: mon.hp, maxHp: maxHpOf(mon) });
    }
  }

  // 3c) 🔴 Gigantamax: conta as rodadas
  if (!b.over) {
    for (let si = 0; si < 2; si++) {
      const mon = sideActive(state, b.sides[si]);
      if (!(mon?.gmaxLeft > 0)) continue;
      mon.gmaxLeft -= 1;
      if (mon.gmaxLeft <= 0) endGmax(state, si, mon);
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
    onEnter(state, si);
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
  // 🧬 a transformação dura só a batalha
  for (const side of b.sides) for (const m of sideTeam(state, side) || []) { if (m) delete m.gmaxLeft; if (m?.tf) revertForm(m); }
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
  if (ballId && getItem(ballId)?.trust) mon.trust = true; // Bola da Confiança: obedece sem insígnias
  mon.ball = ballId;
  if (ballId) progressMission(state, pid, { k: 'capture', sp: mon.sp });
  if (mon.yellowLegend) {
    p.legendCaught = (p.legendCaught || 0) + 1; delete mon.yellowLegend;
    // 🏵️ passou do limite graças ao Amuleto Lendário: gasta 1 carga (só 1 por partida)
    if (p.legendCaught > LEGEND_MATCH_LIMIT && !p.legendCharmOn && (p.items?.legend_charm || 0) > 0) {
      p.items.legend_charm -= 1;
      if (!p.items.legend_charm) delete p.items.legend_charm;
      p.legendCharmOn = true; // continua sem limite até o fim desta partida
      log(state, `🏵️ O Amuleto Lendário brilhou! 1 carga usada — sem limite de lendários até o fim da partida.`, 'good');
    }
  }
  const where = giveMon(p, mon);
  p.lastPlaced = { uid: mon.uid, where }; // ➕ dá para escolher na hora: equipe ou PC (ação 'place')
  (p.captureLog ||= []).push({ sp: mon.sp, shiny: !!mon.shiny, t: state.turn || 0 });
  if (p.captureLog.length > 20) p.captureLog.splice(0, p.captureLog.length - 20);
  fx(state, { k: 'placed', pid, uid: mon.uid, sp: mon.sp, shiny: !!mon.shiny, where, via: ballId ? 'capture' : 'egg' });
  log(state, `🎉 ${speciesName(mon.sp)}${mon.shiny ? ' ✨' : ''} entrou ${where === 'team' ? 'na equipe' : 'no PC (equipe cheia)'} de ${p.name}!`, mon.shiny ? 'shiny' : 'good');
}
