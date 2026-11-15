// Utilitários de estado compartilhados entre engine.js e battle.js.
import { getSpecies } from '../data/pokemon.js';
import { getSpace } from '../data/board.js';
import { TEAM_SIZE, fullHeal } from './monsters.js';

export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
    this.isGameError = true;
  }
}

export function fail(msg) {
  throw new GameError(msg);
}

export function getPlayer(state, pid) {
  return state.players.find(p => p.id === pid) || null;
}

export function currentPlayer(state) {
  return state.players[state.current] || null;
}

export function log(state, msg, kind = 'info') {
  state.log.push({ t: state.turn, msg, kind });
  const cap = state.logCap || 120;
  if (state.log.length > cap) state.log.splice(0, state.log.length - cap);
  if (state.battle) {
    state.battle.log.push(msg);
    if (state.battle.log.length > 40) state.battle.log.splice(0, state.battle.log.length - 40);
  }
}

export function fx(state, effect) {
  state.fx.push(effect);
}

export function addItem(player, itemId, qty = 1) {
  player.items[itemId] = (player.items[itemId] || 0) + qty;
}

export function takeItem(player, itemId, qty = 1) {
  if ((player.items[itemId] || 0) < qty) return false;
  player.items[itemId] -= qty;
  if (player.items[itemId] <= 0) delete player.items[itemId];
  return true;
}

export function markSeen(player, speciesId) {
  if (!player.seen.includes(speciesId)) player.seen.push(speciesId);
}

export function markCaught(player, speciesId) {
  markSeen(player, speciesId);
  if (!player.caught.includes(speciesId)) player.caught.push(speciesId);
}

/** Coloca o Pokémon na equipe (ou no PC se a equipe estiver cheia). */
export function giveMon(player, mon) {
  delete mon.wild;
  mon.ot = mon.ot || player.id;
  markCaught(player, mon.sp);
  if (mon.shiny) player.stats.shinies += 1;
  player.stats.captures += 1;
  if (player.team.length < TEAM_SIZE) {
    player.team.push(mon);
    return 'team';
  }
  player.box.push(mon);
  return 'box';
}

export function healthyIndex(team, exclude = -1) {
  return team.findIndex((m, i) => i !== exclude && m.hp > 0);
}

export function hasHealthy(team) {
  return team.some(m => m.hp > 0);
}

/** Desmaio total: volta para a última cidade, perde 10% do ouro e a equipe é curada. */
export function blackout(state, player, goldLossPct = 0.1) {
  const lost = Math.floor(player.gold * goldLossPct);
  player.gold -= lost;
  player.pos = player.lastCity;
  player.team.forEach(fullHeal);
  const city = getSpace(player.lastCity);
  log(state, `💫 Toda a equipe de ${player.name} desmaiou! Correu de volta para ${city.name} e perdeu ${lost} de ouro.`, 'bad');
  return lost;
}

export function speciesName(id) {
  const s = getSpecies(id);
  return s ? s.name : id;
}

export function clone(obj) {
  return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}
