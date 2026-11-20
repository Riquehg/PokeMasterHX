// IA dos jogadores CPU. Recebe o estado e devolve UMA ação (o engine aplica e chama de novo).
// Também é usada para jogar por quem ficou inativo no online.

import { getSpecies } from './data/pokemon.js';
import { getSpace } from './data/board.js';
import { ITEMS, shopFor, ballBonusAgainst } from './data/items.js';
import { GYMS, gymAt, ELITE_FOUR, ELITE_SPACE, CHAMPION_SPACE, BADGES_TO_LEAGUE, CHAMPION } from './data/trainers.js';
import { bestAttack } from './rules/types.js';
import { maxHpOf, WILD_LEVELS, TEAM_SIZE } from './rules/monsters.js';
import { distancesFrom } from './rules/movement.js';
import { SPACE_LIST } from './data/board.js';
const citySpaces = () => SPACE_LIST.filter(s => s.type === 'city').map(s => s.id);
import { getPlayer, currentPlayer, canUse } from './rules/helpers.js';
import { sideTeam, sideActive, sideIndexOf, bestMoveSlot, expectedDamage, CAPTURE_TARGET, captureMath, captureProb } from './rules/battle.js';
import { monMoves } from './data/moves.js';
import { statsOf } from './rules/monsters.js';
import { rulesOf, stormAt, ownerOf, GARRISON_MAX } from './rules/modes.js';



function hpRatio(m) {
  return m.hp / maxHpOf(m);
}

function teamHealth(p) {
  const tot = p.team.reduce((a, m) => a + maxHpOf(m), 0);
  const cur = p.team.reduce((a, m) => a + Math.max(0, m.hp), 0);
  return tot ? cur / tot : 0;
}

function topLevels(p, n = 3) {
  const lv = p.team.map(m => m.lvl).sort((a, b) => b - a).slice(0, n);
  return lv.reduce((a, b) => a + b, 0) / Math.max(1, lv.length);
}

function matchup(attacker, defender) {
  return bestAttack(getSpecies(attacker.sp).types, getSpecies(defender.sp).types).mult;
}

function bestBall(p, wild) {
  const types = getSpecies(wild.sp).types;
  const tier = getSpecies(wild.sp).tier;
  let best = null, bestBonus = -1;
  for (const [id, n] of Object.entries(p.items)) {
    const it = ITEMS[id];
    if (!it || it.kind !== 'ball' || n <= 0) continue;
    if (id === 'master_ball' && !(tier >= 5 || wild.shiny)) continue; // guarda a Master
    const b = ballBonusAgainst(id, types);
    if (b > bestBonus) { bestBonus = b; best = id; }
  }
  return best;
}

/** Força estimada de um Pokémon (nível, tier, status) — usada para montar a equipe. */
export function monPower(m) {
  const st = statsOf(m);
  return st.atk * 2 + st.maxHp * 0.6 + m.lvl;
}

function moveMatchup(attacker, defender) {
  return Math.max(...monMoves(attacker).filter(mv => mv.kind === 'dmg' || mv.kind === 'drain').map(mv => {
    const sp = getSpecies(attacker.sp);
    return bestAttack([mv.type], getSpecies(defender.sp).types).mult * (sp.types.includes(mv.type) ? 1.2 : 1) * (mv.power || 1);
  }), 0.1);
}

function bestSwitch(team, activeIdx, foe, p) {
  let best = -1, bestScore = -Infinity;
  team.forEach((m, i) => {
    if (i === activeIdx || m.hp <= 0 || (p && !canUse(p, m))) return;
    const score = moveMatchup(m, foe) * 10 - moveMatchup(foe, m) * 6 + m.lvl * 0.6 + hpRatio(m) * 6;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function healItem(p) {
  if (p.items.super_potion > 0) return 'super_potion';
  if (p.items.potion > 0) return 'potion';
  return null;
}

// ------------------------------------------------------------------ batalha
function battleAction(state, p) {
  const b = state.battle;
  const si = sideIndexOf(state, p.id);
  const side = b.sides[si];
  const foeSide = b.sides[1 - si];
  const team = sideTeam(state, side);
  const me = team[side.active];
  const foe = sideActive(state, foeSide);

  if (b.mustSwitch[si]) {
    return { type: 'battle', move: 'switch', index: bestSwitch(team, side.active, foe, p) };
  }

  const slot = bestMoveSlot(state, si);
  const myHit = expectedDamage(state, si, monMoves(me)[slot]);
  const foeHit = Math.max(...monMoves(foe).map(m => expectedDamage(state, 1 - si, m)));
  const official = ['gym', 'elite', 'champion', 'ace', 'raid', 'pvp'].includes(b.kind);

  // Se derruba agora, ataca
  if (myHit >= foe.hp) return { type: 'battle', move: 'attack', slot };

  // Cura condição forte (sono/congelamento/queimadura) com Full Heal
  const st = side.status?.[me.uid]?.id;
  if (st && ['sleep', 'freeze', 'burn'].includes(st) && p.items.full_heal > 0 && hpRatio(me) > 0.35) {
    return { type: 'battle', move: 'item', item: 'full_heal', index: side.active };
  }

  // Cura quando o próximo golpe do rival derruba e a poção salva
  const heal = healItem(p);
  if (heal && me.hp <= foeHit * 1.1 && maxHpOf(me) * 0.4 > foeHit * 0.8 && (official || getSpecies(foe.sp).tier >= 2)) {
    return { type: 'battle', move: 'item', item: heal, index: side.active };
  }

  // X Attack no começo de lutas importantes
  if (official && p.items.x_attack > 0 && !side.boost[me.uid] && hpRatio(me) > 0.7 && foe.hp > myHit * 2) {
    return { type: 'battle', move: 'item', item: 'x_attack', index: side.active };
  }

  // Troca se estiver em desvantagem clara e houver alguém melhor no banco
  const myMult = matchup(me, foe);
  const sw0 = bestSwitch(team, side.active, foe, p);
  if (sw0 >= 0 && b.round > 0 || sw0 >= 0) {
    const cand = team[sw0];
    const gain = moveMatchup(cand, foe) - moveMatchup(me, foe);
    const danger = moveMatchup(foe, me) - moveMatchup(foe, cand);
    if (gain >= 1 && danger >= 0.5 && hpRatio(cand) > 0.5 && me.hp > foeHit * 0.5) return { type: 'battle', move: 'switch', index: sw0 };
    if (myMult <= 0.5 && moveMatchup(cand, foe) >= 2) return { type: 'battle', move: 'switch', index: sw0 };
  }

  if (b.kind === 'wild') {
    const sp = getSpecies(foe.sp);
    const newSpecies = !p.caught.includes(foe.sp);
    const want = newSpecies || foe.shiny || sp.tier >= 3 || p.team.length < TEAM_SIZE;
    const ball = bestBall(p, foe);
    if (want && ball) {
      // chance real: precisa tirar (alvo - bônus) no d6, e 1 sempre falha
      const max = maxHpOf(foe);
      const hpB = foe.hp <= max * 0.25 ? 2 : foe.hp <= max * 0.5 ? 1 : 0;
      const odds = ball === 'master_ball' ? 1 : captureProb(captureMath(foe, me, ball, b.sides[1 - si]?.status?.[foe.uid]));
      const finishing = myHit >= foe.hp; // não derruba o que quer capturar
      if (odds >= 0.66 || (odds >= 0.34 && (hpB >= 1 || me.hp < foeHit * 1.5)) || (odds > 0 && sp.tier >= 5 && hpB >= 2 && odds >= 0.15) || finishing && odds > 0) {
        return { type: 'battle', move: 'ball', item: ball };
      }
      // enfraquece com o golpe mais fraco para não nocautear
      if (hpRatio(foe) > 0.25 && odds < 0.66) {
        const weakSlot = [0, 1].map(i => ({ i, d: expectedDamage(state, si, monMoves(me)[i]) }))
          .filter(x => x.d > 0 && x.d < foe.hp * 0.85).sort((a, c) => c.d - a.d)[0];
        if (weakSlot) return { type: 'battle', move: 'attack', slot: weakSlot.i };
      }
    }
    if (sp.tier >= 5 && !want) return { type: 'battle', move: 'flee' };
    if (foe.lvl > me.lvl + 8 && !want) return { type: 'battle', move: 'flee' };
    // Batalha indo mal (2+ desmaiados ou equipe abaixo de 40%) e o selvagem ainda inteiro: foge
    const down = team.filter(m => m.hp <= 0).length;
    if ((down >= 2 || teamHealth(p) < 0.4) && hpRatio(foe) > 0.4) return { type: 'battle', move: 'flee' };
    if (foeHit >= me.hp && myHit * 2 < foe.hp && !team.some((m, i) => i !== side.active && m.hp > 0 && canUse(p, m))) return { type: 'battle', move: 'flee' };
    // Se o golpe não afeta, foge (evita empates infinitos)
    if (myMult === 0) {
      const sw = bestSwitch(team, side.active, foe, p);
      if (sw >= 0 && matchup(team[sw], foe) > 0) return { type: 'battle', move: 'switch', index: sw };
      return { type: 'battle', move: 'flee' };
    }
  }

  if (myMult === 0) {
    const sw = bestSwitch(team, side.active, foe, p);
    if (sw >= 0 && matchup(team[sw], foe) > 0) return { type: 'battle', move: 'switch', index: sw };
  }
  return { type: 'battle', move: 'attack', slot };
}

// ------------------------------------------------------------------ turno
function gymReady(p, gym) {
  const strongest = Math.max(...gym.team.map(t => t[1]));
  return topLevels(p, 2) >= strongest - 2 && teamHealth(p) > 0.8;
}

function goalSpace(p, state) {
  const rules = rulesOf(state);
  if (rules === 'royale') return state.royale.center; // corre para o centro, longe da tempestade
  if (teamHealth(p) < 0.45) return 'heal';
  if (rules === 'conquest') {
    // cidade de ginásio mais perto que não é minha e que dá para encarar
    const dist = distancesFrom(p, p.pos);
    const best = Math.max(...p.team.map(m => m.lvl));
    const targets = GYMS.filter(g => ownerOf(state, g.id) !== p.id && best >= siegeLevel(state, g) - 5)
      .sort((a, b) => (dist[a.space] ?? 99) - (dist[b.space] ?? 99));
    return targets[0] ? targets[0].space : 'train';
  }
  if (p.badges.length >= BADGES_TO_LEAGUE) {
    const need = p.eliteStage < ELITE_FOUR.length ? ELITE_FOUR[p.eliteStage].team : CHAMPION.team;
    const strongest = Math.max(...need.map(t => t[1]));
    if (topLevels(p, 3) < strongest - 2) return 'train';
    return p.eliteStage < ELITE_FOUR.length ? ELITE_SPACE : CHAMPION_SPACE;
  }
  // Vai para o ginásio aberto mais próximo que não seja impossível; treina no caminho
  const dist = distancesFrom(p, p.pos);
  const best = Math.max(...p.team.map(m => m.lvl));
  const open = GYMS.filter(g => !p.badges.includes(g.id));
  const feasible = open.filter(g => best >= Math.max(...g.team.map(t => t[1])) - 6);
  const pool = feasible.length ? feasible : open;
  pool.sort((a, b) => (dist[a.space] ?? 99) - (dist[b.space] ?? 99));
  return pool[0] ? pool[0].space : 'train';
}

function chooseDestination(state, p) {
  const opts = state.pending.options;
  const goal = goalSpace(p, state);
  const top = topLevels(p);
  let dist = null;
  if (typeof goal === 'number') dist = distancesFrom(p, goal);

  let best = opts[0], bestScore = -Infinity;
  for (const id of opts) {
    const sp = getSpace(id);
    let s = 0;
    if (dist) s -= (dist[id] ?? 50) * 3;
    if (goal === 'heal') s += sp.type === 'city' ? 40 : 0;
    if (goal === 'train' || dist) {
      if (sp.type === 'pokemon' || sp.type === 'event') {
        const [, hi] = WILD_LEVELS[sp.tier];
        const lo = WILD_LEVELS[sp.tier][0];
        if (lo > top + 4) s -= 15; // perigoso demais
        else if (hi >= top - 6) s += 8; // bom para treinar
        else s += 2;
      }
      if (goal === 'train' && sp.type === 'city' && teamHealth(p) < 0.8) s += 6;
    }
    if (state.board[id]?.shiny) s += 20;
    const hs = (state.hotspots || []).find(h => h.space === id);
    if (hs) s += hs.kind === 'chest' ? 25 : hs.kind === 'mystery' ? 22 : hasUsableBot(p) ? 18 : -5; // evento relâmpago
    if (rulesOf(state) === 'royale') {
      const st = stormAt(state, id);
      if (st.soon) s -= 120;                      // fica na tempestade na próxima rodada
      const rival = state.players.find(q => q.id !== p.id && !q.out && q.pos === id);
      if (rival) s += strength(p) > strength(rival) * 1.2 ? 25 : -40; // batalha obrigatória
      if (sp.type === 'city' && teamHealth(p) < 0.7 && !(p.healedAt || []).includes(id) && !st.soon) s += 30;
    }
    if (rulesOf(state) === 'conquest' && sp.type === 'city') {
      const g = gymAt(id);
      if (g && ownerOf(state, g.id) !== p.id && topLevels(p, 2) >= siegeLevel(state, g) - 2 && teamHealth(p) > 0.7) s += 35;
    }
    if (p.quest?.space === id) s += 30; // convite de viagem
    s += (state.seed % 7 === id % 7) ? 0.5 : 0; // desempate leve
    if (s > bestScore) { bestScore = s; best = id; }
  }
  return { type: 'move', to: best };
}

function cityActions(state, p) {
  const sp = getSpace(p.pos);
  if (!sp || sp.type !== 'city') return null;

  const rules = rulesOf(state);
  const canHeal = rules !== 'royale' || (!(p.healedAt || []).includes(sp.id) && !stormAt(state, sp.id).in && teamHealth(p) < 0.85);
  if (canHeal && [...p.team].some(m => m.hp < maxHpOf(m))) return { type: 'city', op: 'heal' };

  // PC: equipe só com quem obedece e é mais forte; quem não obedece vai para o PC
  if (p.box.length) {
    const val = m => (canUse(p, m) ? monPower(m) : -1);
    const bi = p.box.reduce((bi, m, i, arr) => (val(m) > val(arr[bi]) ? i : bi), 0);
    if (p.team.length < TEAM_SIZE && val(p.box[bi]) > 0) return { type: 'pc', op: 'withdraw', box: bi };
    const wi = p.team.reduce((wi, m, i, arr) => (val(m) < val(arr[wi]) ? i : wi), 0);
    if (val(p.box[bi]) > 0 && val(p.box[bi]) > Math.max(0, val(p.team[wi])) * 1.08 && p.team.length > 1) return { type: 'pc', op: 'swap', team: wi, box: bi };
  }


  // Loja
  const shop = shopFor(sp.tier);
  const balls = Object.entries(p.items).filter(([id]) => ITEMS[id]?.kind === 'ball').reduce((a, [, n]) => a + n, 0);
  if (balls < 5) {
    const ballOffer = shop.filter(o => o.kind === 'ball' && !o.typeBonus).sort((a, b) => b.bonus - a.bonus).find(o => o.price * 3 <= p.gold - 100);
    if (ballOffer) return { type: 'city', op: 'buy', item: ballOffer.id, qty: 3 };
  }
  const potions = (p.items.potion || 0) + (p.items.super_potion || 0);
  if (potions < 3) {
    const pot = shop.find(o => o.id === 'super_potion' && o.price * 2 <= p.gold - 200) || shop.find(o => o.id === 'potion' && o.price * 2 <= p.gold - 100);
    if (pot) return { type: 'city', op: 'buy', item: pot.id, qty: 2 };
  }
  const nextGym = GYMS.find(g => !p.badges.includes(g.id));
  if (nextGym && !(p.items.x_attack > 0) && p.gold > 900) {
    const xa = shop.find(o => o.id === 'x_attack');
    if (xa) return { type: 'city', op: 'buy', item: 'x_attack', qty: 1 };
  }
  if (!p.items.revive && p.gold > 1500) {
    const rv = shop.find(o => o.id === 'revive');
    if (rv) return { type: 'city', op: 'buy', item: 'revive', qty: 1 };
  }

  // Conquista: atacar cidade de outro (ou neutra); arrumar a guarnição da própria se estiver vazia
  if (rules === 'conquest') {
    const g = gymAt(sp.id);
    if (!g) return null;
    const owner = ownerOf(state, g.id);
    if (owner !== p.id && !state.turnFlags.gym && topLevels(p, 2) >= siegeLevel(state, g) - 2 && teamHealth(p) > 0.7) return { type: 'city', op: 'gym' };
    if (owner === p.id && !state.turnFlags.manage && !state.conquest.garrison[g.id].length && p.box.some(m => m.hp > 0 || true) && p.box.length) return { type: 'city', op: 'gym' };
    return null;
  }
  if (rules === 'royale') return null;

  // Desafios oficiais
  if (!state.turnFlags.gym) {
    const gym = gymAt(sp.id);
    if (gym && !p.badges.includes(gym.id) && gymReady(p, gym)) return { type: 'city', op: 'gym' };
    if (p.badges.length >= BADGES_TO_LEAGUE && teamHealth(p) > 0.95) {
      if (sp.id === ELITE_SPACE && p.eliteStage < ELITE_FOUR.length && goalSpace(p, state) === ELITE_SPACE) return { type: 'city', op: 'league' };
      if (sp.id === CHAMPION_SPACE && p.eliteStage >= ELITE_FOUR.length) return { type: 'city', op: 'league' };
    }
  }
  return null;
}

function itemActions(state, p) {
  // Revive fora da cidade
  const fainted = p.team.findIndex(m => m.hp <= 0);
  if (fainted >= 0 && p.items.revive > 0) return { type: 'use_item', item: 'revive', index: fainted };
  // Rare Candy no mais forte
  if (p.items.rare_candy > 0) {
    const i = p.team.reduce((bi, m, j, arr) => (m.lvl > arr[bi].lvl ? j : bi), 0);
    return { type: 'use_item', item: 'rare_candy', index: i };
  }
  // Pedra Evolutiva em quem evolui
  if (p.items.evolution_stone > 0) {
    const i = p.team.findIndex(m => { const s = getSpecies(m.sp); return s.evolvesTo && getSpecies(s.evolvesTo); });
    if (i >= 0) return { type: 'use_item', item: 'evolution_stone', index: i };
  }
  return null;
}

function strength(p) {
  return p.team.filter(m => m.hp > 0).reduce((a, m) => a + m.lvl * hpRatio(m), 0);
}

function raidBotAction(state, p) {
  const r = state.raid;
  if (r.stage === 'join') {
    const best = p.team.filter(m => m.hp > 0 && canUse(p, m)).sort((a, b) => monPower(b) - monPower(a))[0];
    return best ? { type: 'raid', op: 'join', uid: best.uid } : { type: 'raid', op: 'decline' };
  }
  if (r.stage === 'fight') {
    const x = r.party.find(y => y.pid === p.id);
    const mon = p.team.find(m => m.uid === x?.uid);
    if (mon && mon.hp < maxHpOf(mon) * 0.35) {
      const pot = ['hyper_potion', 'super_potion', 'potion'].find(id => p.items[id] > 0 && ITEMS[id]?.kind === 'heal');
      if (pot) return { type: 'raid', op: 'item', item: pot };
    }
    if (r.round === 0 && p.items.x_attack > 0 && !(x.boost > 0)) return { type: 'raid', op: 'item', item: 'x_attack' };
    const moves = monMoves(mon);
    const bossTypes = getSpecies(r.boss.sp).types;
    const score = mv => {
      if (mv.kind === 'heal') return mon.hp < maxHpOf(mon) * 0.4 ? 999 : 0;
      if (mv.kind === 'buff') return (x.stage || 0) < 1 && r.round < 2 ? 1.5 : 0;
      if (mv.kind === 'debuff') return r.bossStage > -1 ? 1.2 : 0;
      return bestAttack([mv.type], bossTypes).mult * (mv.power || 1) * (1 - (mv.miss || 0) / 6) * (getSpecies(mon.sp).types.includes(mv.type) ? 1.2 : 1);
    };
    return { type: 'raid', op: 'attack', slot: score(moves[1]) > score(moves[0]) ? 1 : 0 };
  }
  const ball = ['master_ball', 'ultra_ball', 'rainbow_ball', 'great_ball', 'poke_ball'].find(id => p.items[id] > 0)
    || Object.keys(p.items).find(id => ITEMS[id]?.kind === 'ball' && p.items[id] > 0);
  return ball ? { type: 'raid', op: 'catch', ball } : { type: 'raid', op: 'skip' };
}

/** Conquista: quem fica defendendo — prefere Pokémon do PC; da equipe só se sobrar time forte. */
function garrisonBot(state, p) {
  const val = m => monPower(m);
  const box = p.box.slice().sort((a, b) => val(b) - val(a));
  const team = p.team.slice().sort((a, b) => val(b) - val(a));
  const picks = box.slice(0, 2).map(m => m.uid);
  if (picks.length < 2 && team.length > 3) picks.push(...team.slice(3, 3 + (2 - picks.length)).map(m => m.uid));
  return { type: 'garrison', uids: picks.slice(0, GARRISON_MAX) };
}

/** Nível do mais forte que defende a cidade (líder se neutra, guarnição se de alguém). */
function siegeLevel(state, g) {
  const own = ownerOf(state, g.id);
  if (!own) return Math.max(...g.team.map(t => t[1]));
  const gar = state.conquest.garrison[g.id].filter(m => m.hp > 0);
  return gar.length ? Math.max(...gar.map(m => m.lvl)) : Math.max(5, g.team[0][1] - 3);
}

export function botAction(state, pid) {
  const p = getPlayer(state, pid);
  if (state.pending?.kind === 'garrison' && state.pending.pid === pid) return garrisonBot(state, p);

  if (state.pending?.kind === 'pvp_invite' && state.pending.to === pid) {
    const from = getPlayer(state, state.pending.from);
    return { type: 'respond', accept: strength(p) >= strength(from) * 0.85 };
  }
  if (state.raid) return raidBotAction(state, p);
  if (state.battle && !state.battle.over) return battleAction(state, p);

  const cp = currentPlayer(state);
  if (!cp || cp.id !== pid) return { type: 'end_turn' };

  if (state.phase === 'move') return chooseDestination(state, p);

  const city = cityActions(state, p);
  if (city) return city;
  const item = itemActions(state, p);
  if (item) return item;

  // o mais forte (que obedece e está de pé) vai na frente
  const v = m => (canUse(p, m) && m.hp > 0 ? monPower(m) : -1);
  const lead = p.team.reduce((bi, m, i, arr) => (v(m) > v(arr[bi]) ? i : bi), 0);
  if (lead > 0 && v(p.team[lead]) > v(p.team[0]) * 1.05) return { type: 'reorder', index: lead };

  if (state.phase === 'roll') return { type: 'roll' };

  // PvP oportunista
  if (!state.turnFlags.pvp) {
    const rival = state.players.find(q => q.id !== p.id && q.pos === p.pos && q.team.some(m => m.hp > 0));
    if (rival && strength(p) > strength(rival) * 1.25 && p.team.some(m => m.hp > 0)) {
      return { type: 'challenge', target: rival.id };
    }
  }
  return { type: 'end_turn' };
}

const hasUsableBot = p => p.team.some(m => m.hp > 0);
