// IA dos jogadores CPU. Recebe o estado e devolve UMA ação (o engine aplica e chama de novo).
// Também é usada para jogar por quem ficou inativo no online.

import { getSpecies } from './data/pokemon.js';
import { getSpace } from './data/board.js';
import { ITEMS, shopFor, ballBonusAgainst } from './data/items.js';
import { GYMS, gymAt, ELITE_FOUR, ELITE_SPACE, CHAMPION_SPACE, BADGES_TO_LEAGUE, CHAMPION } from './data/trainers.js';
import { bestAttack } from './rules/types.js';
import { maxHpOf, WILD_LEVELS, TEAM_SIZE } from './rules/monsters.js';
import { distancesFrom } from './rules/movement.js';
import { getPlayer, currentPlayer } from './rules/helpers.js';
import { sideTeam, sideActive, sideIndexOf } from './rules/battle.js';

const CITY_SPACES = [5, 20, 39, 60, 70, 91, 95, 107, 114, 122, 124];

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

function bestSwitch(team, activeIdx, foe) {
  let best = -1, bestScore = -Infinity;
  team.forEach((m, i) => {
    if (i === activeIdx || m.hp <= 0) return;
    const score = matchup(m, foe) * 10 - matchup(foe, m) * 4 + m.lvl * 0.6 + hpRatio(m) * 5;
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
    return { type: 'battle', move: 'switch', index: bestSwitch(team, side.active, foe) };
  }

  // Cura quando o ativo está mal e ainda vale a pena
  const heal = healItem(p);
  if (heal && hpRatio(me) < 0.3 && (b.kind !== 'wild' || getSpecies(foe.sp).tier >= 2)) {
    return { type: 'battle', move: 'item', item: heal, index: side.active };
  }

  // Troca se estiver em grande desvantagem de tipo
  const myMult = matchup(me, foe);
  if (myMult <= 0.5) {
    const sw = bestSwitch(team, side.active, foe);
    if (sw >= 0 && matchup(team[sw], foe) >= 2) return { type: 'battle', move: 'switch', index: sw };
  }

  if (b.kind === 'wild') {
    const sp = getSpecies(foe.sp);
    const newSpecies = !p.caught.includes(foe.sp);
    const want = newSpecies || foe.shiny || sp.tier >= 3 || p.team.length < TEAM_SIZE;
    const ball = bestBall(p, foe);
    if (want && ball) {
      const weak = hpRatio(foe) <= 0.5;
      if (weak || sp.tier <= 1 || ball === 'master_ball' || me.hp < foe.hp * 0.5) {
        return { type: 'battle', move: 'ball', item: ball };
      }
    }
    if (foe.lvl > me.lvl + 8 && !want) return { type: 'battle', move: 'flee' };
    // Batalha indo mal (2+ desmaiados ou equipe abaixo de 40%) e o selvagem ainda inteiro: foge
    const down = team.filter(m => m.hp <= 0).length;
    if ((down >= 2 || teamHealth(p) < 0.4) && hpRatio(foe) > 0.4) return { type: 'battle', move: 'flee' };
    // Se o golpe não afeta, foge (evita empates infinitos)
    if (myMult === 0) {
      const sw = bestSwitch(team, side.active, foe);
      if (sw >= 0 && matchup(team[sw], foe) > 0) return { type: 'battle', move: 'switch', index: sw };
      return { type: 'battle', move: 'flee' };
    }
  }

  if (myMult === 0) {
    const sw = bestSwitch(team, side.active, foe);
    if (sw >= 0 && matchup(team[sw], foe) > 0) return { type: 'battle', move: 'switch', index: sw };
  }
  return { type: 'battle', move: 'attack' };
}

// ------------------------------------------------------------------ turno
function gymReady(p, gym) {
  const strongest = Math.max(...gym.team.map(t => t[1]));
  return topLevels(p, 2) >= strongest - 2 && teamHealth(p) > 0.8;
}

function goalSpace(p) {
  if (teamHealth(p) < 0.45) return 'heal';
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
  const goal = goalSpace(p);
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
    s += (state.seed % 7 === id % 7) ? 0.5 : 0; // desempate leve
    if (s > bestScore) { bestScore = s; best = id; }
  }
  return { type: 'move', to: best };
}

function cityActions(state, p) {
  const sp = getSpace(p.pos);
  if (!sp || sp.type !== 'city') return null;

  if ([...p.team].some(m => m.hp < maxHpOf(m))) return { type: 'city', op: 'heal' };

  // PC: completa a equipe e troca o mais fraco pelo melhor do PC
  if (p.box.length) {
    if (p.team.length < TEAM_SIZE) {
      const bi = p.box.reduce((bi, m, i, arr) => (m.lvl > arr[bi].lvl ? i : bi), 0);
      return { type: 'pc', op: 'withdraw', box: bi };
    }
    const wi = p.team.reduce((wi, m, i, arr) => (m.lvl < arr[wi].lvl ? i : wi), 0);
    const bi = p.box.reduce((bi, m, i, arr) => (m.lvl > arr[bi].lvl ? i : bi), 0);
    if (p.box[bi].lvl > p.team[wi].lvl + 2) return { type: 'pc', op: 'swap', team: wi, box: bi };
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
  if (!p.items.revive && p.gold > 1500) {
    const rv = shop.find(o => o.id === 'revive');
    if (rv) return { type: 'city', op: 'buy', item: 'revive', qty: 1 };
  }

  // Desafios oficiais
  if (!state.turnFlags.gym) {
    const gym = gymAt(sp.id);
    if (gym && !p.badges.includes(gym.id) && gymReady(p, gym)) return { type: 'city', op: 'gym' };
    if (p.badges.length >= BADGES_TO_LEAGUE && teamHealth(p) > 0.95) {
      if (sp.id === ELITE_SPACE && p.eliteStage < ELITE_FOUR.length && goalSpace(p) === ELITE_SPACE) return { type: 'city', op: 'league' };
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

export function botAction(state, pid) {
  const p = getPlayer(state, pid);

  if (state.pending?.kind === 'pvp_invite' && state.pending.to === pid) {
    return { type: 'respond', accept: true };
  }
  if (state.battle && !state.battle.over) return battleAction(state, p);

  const cp = currentPlayer(state);
  if (!cp || cp.id !== pid) return { type: 'end_turn' };

  if (state.phase === 'move') return chooseDestination(state, p);

  const city = cityActions(state, p);
  if (city) return city;
  const item = itemActions(state, p);
  if (item) return item;

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
