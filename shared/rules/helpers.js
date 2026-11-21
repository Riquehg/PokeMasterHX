// Utilitários de estado compartilhados entre engine.js e battle.js.
import { getSpecies } from '../data/pokemon.js';
import { getSpace } from '../data/board.js';
import { TEAM_SIZE, fullHeal, capTierOf } from './monsters.js';

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

/** 💎 Pokédex Mega: vistas e registradas (quem Mega Evoluiu o próprio Pokémon), normal e shiny. */
export function markMega(player, megaSp, shiny = false, used = false) {
  const key = getSpecies(megaSp)?.mega;
  if (!key || !player) return;
  const d = (player.megaDex ||= { seen: [], used: [], shinySeen: [], shinyUsed: [] });
  const add = (k, v) => { if (!d[k].includes(v)) d[k].push(v); };
  add('seen', key); if (shiny) add('shinySeen', key);
  if (used) { add('used', key); if (shiny) add('shinyUsed', key); }
}
export function markSeen(player, speciesId, shiny = false) {
  if (String(speciesId).startsWith('mega_')) { markMega(player, speciesId, shiny); speciesId = getSpecies(speciesId)?.megaBase || speciesId; } // 💎 Mega conta como a forma base
  if (!player.seen.includes(speciesId)) player.seen.push(speciesId);
  if (shiny) { const l = (player.shinySeen ||= []); if (!l.includes(speciesId)) l.push(speciesId); }
}

export function markCaught(player, speciesId, shiny = false) {
  if (String(speciesId).startsWith('mega_')) speciesId = getSpecies(speciesId)?.megaBase || speciesId;
  markSeen(player, speciesId, shiny);
  if (!player.caught.includes(speciesId)) player.caught.push(speciesId);
  if (shiny) { const l = (player.shinyCaught ||= []); if (!l.includes(speciesId)) l.push(speciesId); }
}

/** Coloca o Pokémon na equipe (ou no PC se a equipe estiver cheia). */
export function giveMon(player, mon) {
  delete mon.wild;
  mon.ot = mon.ot || player.id;
  markCaught(player, mon.sp, !!mon.shiny);
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

// ------------------------------------------------------------------ obediência por insígnias
// Pokémon obtidos de tier alto só obedecem com insígnias suficientes (como nos jogos).
// Iniciais e Pokémon trazidos da Coleção sempre obedecem.
// Insígnias para um Pokémon obedecer, pelo tier: Rosa e Verde nenhuma, Azul 1, Vermelho 2, Amarelo 3.
export const BADGES_TO_USE = { 3: 1, 4: 2, 5: 3 };

export function badgesNeeded(mon) {
  if (!mon || mon.starter || mon.trust) return 0; // inicial e quem foi capturado na Bola da Confiança obedecem sempre
  return BADGES_TO_USE[capTierOf(mon)] || 0;
}

export function canUse(player, mon) {
  if (!player || !player.badges || player.noRules) return true; // NPCs, selvagens e duelos
  return player.badges.length >= badgesNeeded(mon);
}

/** Índice do primeiro Pokémon que pode lutar (vivo e obediente). */
export function usableIndex(player, exclude = -1) {
  return player.team.findIndex((m, i) => i !== exclude && m.hp > 0 && canUse(player, m));
}

export function hasUsable(player) {
  return usableIndex(player) >= 0;
}
