// 🔥 Raid lendária — solo ou em GRUPO.
// Grupo: todos os treinadores podem entrar com 1 Pokémon cada; a cada rodada todos escolhem um golpe,
// o lendário revida em um (ou mais) participantes. Vencendo, cada participante (na ordem de quem causou
// mais dano) pode tentar capturar com uma Pokébola, até alguém conseguir.
// Solo: a batalha normal (time inteiro) e, vencendo, a mesma fase de captura.
import { getSpecies } from '../data/pokemon.js';
import { ITEMS } from '../data/items.js';
import { monMoves, STAB, defaultMoveIds } from '../data/moves.js';
import { statsOf, maxHpOf, healMon, fullHeal, transformInto, revertForm } from './monsters.js';
import { against } from './types.js';
import { fail, getPlayer, log, fx, takeItem, addItem, speciesName } from './helpers.js';
import { canUse } from './helpers.js';
import { playerCompanionBonus, progressMission } from './missions.js';
import { deliverCapture } from './battle.js';
import { grantMegaRewards } from './mega.js';

export const RAID_JOIN_TIMEOUT_TURNS = 1;
/** Itens que dá para usar na luta da Raid em grupo (no lugar do golpe da rodada). */
export const RAID_ITEM_KINDS = ['heal', 'boost'];
export const RAID_GROUP_HP_PER_MEMBER = 0.8; // HP extra do chefe por participante

const BALL_CATCH = { poke_ball: 0, trust_ball: 0, great_ball: 0.04, ultra_ball: 0.08, master_ball: 1 };

/** Chance de captura na Raid com uma bola. */
export function raidBallChance(p, ballId) {
  const it = ITEMS[ballId];
  if (!it || it.kind !== 'ball') return 0;
  if (it.bonus >= 99) return 1;
  const extra = BALL_CATCH[ballId] ?? (it.typeBonus ? 0.1 : 0.05);
  return Math.min(0.28, 0.04 + 0.015 * (p.badges?.length || 0) + extra);
}

function find(p, uid) {
  return p.team.find(m => m.uid === uid) || null;
}

function alive(state, r) {
  return r.party.filter(x => { const m = find(getPlayer(state, x.pid), x.uid); return m && m.hp > 0; });
}

/** Começa uma Raid em grupo: convida todo mundo que pode lutar. */
export function startGroupRaid(state, boss, starterId) {
  const invited = state.players.filter(p => !p.left && p.team.some(m => m.hp > 0 && canUse(p, m))).map(p => p.id);
  state.raid = {
    group: true, stage: 'join', boss, starter: starterId, invited, party: [], declined: [], choices: {}, round: 0,
    bossStage: 0, catchIdx: 0, log: [`🔥 RAID EM GRUPO! ${speciesName(boss.sp)} apareceu. Cada treinador pode entrar com 1 Pokémon.`]
  };
  state.phase = 'raid';
  log(state, `🔥 RAID EM GRUPO contra ${speciesName(boss.sp)}! Todos os treinadores podem participar com 1 Pokémon.`, 'battle');
  fx(state, { k: 'raid_start', sp: boss.sp, shiny: !!boss.shiny, group: true });
}

/** Depois de vencer uma Raid solo: abre a fase de captura. */
export function startCatchStage(state, boss, partyIds) {
  state.raid = {
    group: false, stage: 'catch', boss, starter: partyIds[0], invited: partyIds, party: partyIds.map(pid => ({ pid, uid: null, dmg: 1 })),
    declined: [], choices: {}, round: 0, bossStage: 0, catchIdx: 0, log: [`🎯 ${speciesName(boss.sp)} está exausto! Hora de tentar capturar.`]
  };
  state.phase = 'raid';
}

/** Quem precisa agir na Raid agora. */
export function raidWaiting(state) {
  const r = state.raid;
  if (!r) return [];
  if (r.stage === 'join') return r.invited.filter(id => !r.party.some(x => x.pid === id) && !r.declined.includes(id));
  if (r.stage === 'fight') return alive(state, r).filter(x => r.choices[x.pid] === undefined).map(x => x.pid);
  if (r.stage === 'catch') { const x = catchOrder(r)[r.catchIdx]; return x ? [x.pid] : []; }
  return [];
}

const catchOrder = r => [...r.party].sort((a, b) => b.dmg - a.dmg);

export function raidAction(state, rng, p, a) {
  const r = state.raid;
  if (!r) fail('Não há Raid acontecendo.');
  if (!raidWaiting(state).includes(p.id)) fail('Agora não é a sua vez na Raid.');
  const name = speciesName(r.boss.sp);

  if (r.stage === 'join') {
    if (a.op === 'decline') {
      r.declined.push(p.id);
      r.log.push(`${p.name} ficou de fora.`);
    } else {
      const mon = find(p, String(a.uid || ''));
      if (!mon || mon.hp <= 0) fail('Escolha um Pokémon da equipe que esteja de pé.');
      if (!canUse(p, mon)) fail('Esse Pokémon ainda não te obedece.');
      r.party.push({ pid: p.id, uid: mon.uid, dmg: 0 });
      r.log.push(`${p.name} entrou com ${speciesName(mon.sp)} Nv.${mon.lvl}!`);
    }
    if (raidWaiting(state).length === 0) beginFight(state);
    return;
  }

  if (r.stage === 'fight') {
    if (a.op === 'item') {
      // item no lugar do golpe: cura (Potion, Super Potion...) ou bônus de ataque (X Attack)
      const it = ITEMS[a.item];
      if (!it || !(p.items[a.item] > 0) || !RAID_ITEM_KINDS.includes(it.kind)) fail('Esse item não pode ser usado na Raid.');
      const x = r.party.find(y => y.pid === p.id);
      const m = find(p, x.uid);
      if (it.kind === 'heal' && m.hp >= maxHpOf(m)) fail('Seu Pokémon está com o HP cheio.');
      r.choices[p.id] = { item: a.item };
      if (raidWaiting(state).length === 0) resolveRaidRound(state, rng);
      return;
    }
    const slot = Number(a.slot || 0);
    if (![0, 1].includes(slot)) fail('Golpe inválido.');
    r.choices[p.id] = slot;
    if (raidWaiting(state).length === 0) resolveRaidRound(state, rng);
    return;
  }

  if (r.stage === 'catch') {
    const order = catchOrder(r);
    if (a.op === 'skip') {
      r.log.push(`${p.name} não tentou capturar.`);
    } else {
      const ball = String(a.ball || '');
      if (!(p.items[ball] > 0) || ITEMS[ball]?.kind !== 'ball') fail('Escolha uma Pokébola que você tenha.');
      takeItem(p, ball);
      const chance = raidBallChance(p, ball);
      const ok = rng.chance(chance);
      fx(state, { k: 'capture', pid: p.id, sp: r.boss.sp, shiny: !!r.boss.shiny, ball, ok, shakes: ok ? 3 : rng.int(0, 2), raid: true });
      r.log.push(`${p.name} jogou ${ITEMS[ball].name} (${Math.round(chance * 100)}%)... ${ok ? 'CAPTUROU!' : 'escapou!'}`);
      if (ok) {
        const boss = r.boss;
        if (boss.tf) revertForm(boss); // 💎 Mega volta à forma normal ao ser capturado
        delete boss.bonusHp; delete boss.raid; delete boss.wild; delete boss.megaBoss;
        fullHeal(boss);
        log(state, `🎯 ${p.name} capturou o lendário ${name}${boss.shiny ? ' ✨' : ''} na Raid!`, 'shiny');
        deliverCapture(state, p.id, boss, ball);
        return finishRaid(state);
      }
    }
    r.catchIdx += 1;
    if (r.catchIdx >= order.length) {
      log(state, `💨 Ninguém conseguiu capturar ${name}. Ele voltou para o céu…`, 'bad');
      return finishRaid(state);
    }
  }
}

function beginFight(state) {
  const r = state.raid;
  if (!r.party.length) {
    log(state, `💨 Ninguém entrou na Raid. ${speciesName(r.boss.sp)} foi embora.`);
    return finishRaid(state);
  }
  const base = maxHpOf({ ...r.boss, bonusHp: 0 });
  r.boss.bonusHp = Math.round(base * RAID_GROUP_HP_PER_MEMBER * r.party.length);
  r.boss.hp = maxHpOf(r.boss);
  r.stage = 'fight';
  r.round = 0;
  r.log.push(`⚔️ ${r.party.length} treinador(es) contra ${speciesName(r.boss.sp)} (${r.boss.hp} HP)!`);
  log(state, `⚔️ A Raid começou: ${r.party.length} treinador(es) contra ${speciesName(r.boss.sp)} (${r.boss.hp} HP)!`, 'battle');
}

function hit(rng, atkMon, atkVal, move, defMon, comp) {
  const mult = against(move.type, getSpecies(defMon.sp).types);
  const stab = getSpecies(atkMon.sp).types.includes(move.type) ? STAB : 1;
  const roll = rng.d6();
  if (move.miss && roll <= move.miss) return { dmg: 0, roll, miss: true, mult };
  const crit = roll === 6 ? 1.5 : roll === 1 ? 0.5 : 1;
  const cm = comp?.types?.includes(move.type) ? 1 + comp.dmg : 1;
  const dmg = mult === 0 ? 0 : Math.max(1, Math.round((atkVal * 0.7 + roll) * (move.power || 1) * stab * mult * crit * cm));
  return { dmg, roll, mult, crit: roll === 6 };
}

function resolveRaidRound(state, rng) {
  const r = state.raid;
  const boss = r.boss;
  r.round += 1;
  const members = alive(state, r).map(x => ({ x, p: getPlayer(state, x.pid), m: find(getPlayer(state, x.pid), x.uid) }));
  members.sort((a, b) => statsOf(b.m).spe - statsOf(a.m).spe);
  // itens primeiro (como nas batalhas normais)
  for (const { x, p, m } of members) {
    const ch = r.choices[p.id];
    if (!ch || typeof ch !== 'object') continue;
    const it = ITEMS[ch.item];
    if (!it || !(p.items[ch.item] > 0)) continue;
    takeItem(p, ch.item);
    if (it.kind === 'heal') {
      const h = healMon(m, it.healPct || 0.4);
      r.log.push(`🧪 ${p.name} usou ${it.name} em ${speciesName(m.sp)}: +${h} HP.`);
      fx(state, { k: 'raid_heal', pid: p.id, amount: h, item: ch.item });
    } else if (it.kind === 'boost') {
      x.boost = (x.boost || 0) + (it.atk || 3);
      r.log.push(`💪 ${p.name} usou ${it.name}: ${speciesName(m.sp)} ganhou +${it.atk || 3} de ataque na Raid.`);
      fx(state, { k: 'raid_boost', pid: p.id, item: ch.item });
    }
  }
  for (const { x, p, m } of members) {
    if (boss.hp <= 0) break;
    if (typeof r.choices[p.id] === 'object') continue; // usou item nesta rodada
    const move = monMoves(m)[r.choices[p.id] || 0];
    if (move.kind === 'heal') {
      const h = healMon(m, 0.4);
      r.log.push(`💚 ${speciesName(m.sp)} (${p.name}) usou ${move.name} e recuperou ${h} HP.`);
      fx(state, { k: 'raid_heal', pid: p.id, amount: h });
      continue;
    }
    if (move.kind === 'transform') { // 🧬 Ditto/Mew copiam o lendário durante a Raid
      transformInto(m, boss.sp, Array.isArray(boss.moves) && boss.moves.length === 2 ? boss.moves : defaultMoveIds(boss.sp));
      r.log.push(`🧬 ${p.name}: virou uma cópia de ${speciesName(boss.sp)}!`);
      continue;
    }
    if (move.kind === 'buff') { x.stage = Math.min(2, (x.stage || 0) + 1); r.log.push(`🔺 ${speciesName(m.sp)} (${p.name}) ficou mais forte!`); continue; }
    if (move.kind === 'debuff') { r.bossStage = Math.max(-2, r.bossStage - 1); r.log.push(`🔻 ${speciesName(m.sp)} (${p.name}) intimidou o lendário!`); continue; }
    const st = x.stage || 0;
    const atk = (statsOf(m).atk + (x.boost || 0)) * (st >= 0 ? 1 + 0.4 * st : 1);
    const h = hit(rng, m, atk, move, boss, playerCompanionBonus(p));
    boss.hp = Math.max(0, boss.hp - h.dmg);
    x.dmg += h.dmg;
    if (move.kind === 'drain' && h.dmg) healMon(m, 0, Math.ceil(h.dmg / 2));
    r.log.push(h.miss ? `${speciesName(m.sp)} (${p.name}) usou ${move.name}... errou!` : `${speciesName(m.sp)} (${p.name}) usou ${move.name} (🎲${h.roll}): ${h.dmg} de dano${h.mult >= 2 ? ' — super efetivo!' : h.mult < 1 ? ' — pouco efetivo' : ''}`);
    fx(state, { k: 'raid_hit', pid: p.id, dmg: h.dmg, move: move.name, type: move.type, miss: !!h.miss, bossHp: boss.hp, bossMax: maxHpOf(boss) });
  }
  r.choices = {};

  if (boss.hp <= 0) return raidWon(state, rng);

  // o lendário revida (em mais alvos quanto maior o grupo)
  const targets = alive(state, r);
  const hits = Math.min(targets.length, 1 + Math.floor(r.party.length / 3));
  const bossAtk = statsOf(boss).atk * (r.bossStage >= 0 ? 1 : 1 - 0.3 * -r.bossStage);
  for (let i = 0; i < hits; i++) {
    const pool = alive(state, r);
    if (!pool.length) break;
    const tx = rng.pick(pool);
    const tp = getPlayer(state, tx.pid), tm = find(tp, tx.uid);
    const moves = monMoves(boss).filter(mv => mv.kind === 'dmg' || mv.kind === 'drain');
    const move = moves.sort((a, b) => against(b.type, getSpecies(tm.sp).types) * (b.power || 1) - against(a.type, getSpecies(tm.sp).types) * (a.power || 1))[0] || monMoves(boss)[0];
    const h = hit(rng, boss, bossAtk, move, tm, null);
    tm.hp = Math.max(0, tm.hp - h.dmg);
    r.log.push(`🔥 ${speciesName(boss.sp)} usou ${move.name} em ${speciesName(tm.sp)} (${tp.name}): ${h.miss ? 'errou!' : `${h.dmg} de dano`}${tm.hp <= 0 ? ' — desmaiou!' : ''}`);
    fx(state, { k: 'raid_boss_hit', pid: tp.id, dmg: h.dmg, move: move.name, type: move.type, fainted: tm.hp <= 0 });
  }
  if (!alive(state, r).length) {
    log(state, `😓 O grupo foi derrotado por ${speciesName(boss.sp)}. Ele voltou para o céu…`, 'bad');
    fx(state, { k: 'raid_end', win: false, sp: boss.sp });
    return finishRaid(state);
  }
  if (r.round >= 25) {
    log(state, `⌛ ${speciesName(boss.sp)} se cansou da luta e foi embora.`);
    return finishRaid(state);
  }
}

function raidWon(state, rng) {
  const r = state.raid;
  const boss = r.boss;
  const g = 150 * Math.max(3, getSpecies(boss.sp).tier);
  for (const x of r.party) {
    const p = getPlayer(state, x.pid);
    p.gold += g;
    addItem(p, 'rare_candy', 1);
    // muito raro: uma Bola da Confiança de lembrança da Raid (5%)
    if (rng.chance(0.05)) { addItem(p, 'trust_ball', 1); r.log.push(`🤝 ${p.name} encontrou uma Bola da Confiança no campo de batalha!`); log(state, `🤝 ${p.name} ganhou uma Bola da Confiança raríssima na Raid!`, 'shiny'); }
    // 💿 TM (30%) e ✨ Amuleto Shiny (8%, só se ainda não tiver) — prêmios das Raids lendárias
    if (rng.chance(0.3)) { addItem(p, 'tm', 1); r.log.push(`💿 ${p.name} ganhou um TM!`); log(state, `💿 ${p.name} ganhou um TM na Raid!`, 'good'); }
    if (!p.items.shiny_charm && rng.chance(0.08)) { addItem(p, 'shiny_charm', 1); r.log.push(`✨ ${p.name} ganhou o Amuleto Shiny!`); log(state, `✨ ${p.name} ganhou o raríssimo Amuleto Shiny na Raid!`, 'shiny'); }
    if (boss.megaBoss) r.log.push(...grantMegaRewards(state, rng, p, boss.megaBoss, true)); // 💎 Mega Raid
    p.stats.raids = (p.stats.raids || 0) + 1;
    progressMission(state, p.id, { k: 'raid_win' });
  }
  log(state, `🔥 O grupo derrotou ${speciesName(boss.sp)}! Cada participante ganhou ${g} de ouro e 1 Rare Candy. Agora, a captura!`, 'win');
  fx(state, { k: 'raid_end', win: true, sp: boss.sp, party: r.party.map(x => x.pid) });
  r.stage = 'catch';
  r.catchIdx = 0;
  r.log.push(`🏆 Vitória! Ordem de captura (quem causou mais dano primeiro): ${catchOrder(r).map(x => getPlayer(state, x.pid).name).join(' → ')}`);
}

function finishRaid(state) {
  const r = state.raid;
  for (const x of r.party || []) for (const m of getPlayer(state, x.pid)?.team || []) if (m.tf) revertForm(m);
  state.lastRaid = { sp: r.boss.sp, log: r.log.slice(-10) };
  state.raid = null;
  state.phase = 'action';
}
