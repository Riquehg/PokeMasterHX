// 🏆 Liga Ranqueada: divisões com Pontos de Liga (PL), subir e cair de divisão, temporadas mensais.
// Vale para as partidas ranqueadas: Duelo ranqueado (Torneio) e o modo Competitivo do tabuleiro.
// Fica salvo em profiles.stats.league (sem mudar o banco).
//
//  - Cada divisão tem 100 PL. Chegou a 100 → sobe (sobra vai junto). Abaixo de 0 → cai (volta com 75 PL).
//  - Quem acabou de subir tem 3 partidas de proteção: não cai de divisão (só fica com 0 PL).
//  - Sequência de 3+ vitórias dá +5 PL por vitória.
//  - Grão-Mestre não tem teto: os PL só acumulam (é a tabela do topo).
//  - Nova temporada todo mês: todo mundo desce 3 divisões (mínimo Bronze III) e recebe 💎 pela melhor divisão da anterior.
import { ELO_TIERS } from './elo.js';

const ROMAN = ['III', 'II', 'I'];
const SPLIT = ['bronze', 'prata', 'ouro', 'platina', 'diamante']; // com III/II/I

export const LEAGUE_DIVS = [
  ...SPLIT.flatMap(id => {
    const t = ELO_TIERS.find(x => x.id === id);
    return ROMAN.map(r => ({ tier: id, name: `${t.name} ${r}`, icon: t.icon, color: t.color }));
  }),
  ...['mestre', 'grao_mestre'].map(id => { const t = ELO_TIERS.find(x => x.id === id); return { tier: id, name: t.name, icon: t.icon, color: t.color }; })
].map((d, i) => ({ ...d, idx: i }));
export const TOP_DIV = LEAGUE_DIVS.length - 1;
export const LP_PER_DIV = 100;
export const PROMO_SHIELD = 3;
export const SEASON_DROP = 3;

/** Prêmio em 💎 pela melhor divisão da temporada (por camada). */
export const SEASON_REWARD = { bronze: 5, prata: 10, ouro: 20, platina: 35, diamante: 55, mestre: 80, grao_mestre: 120 };

export const seasonId = (date = new Date()) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
export function seasonName(id) {
  const [y, m] = String(id).split('-').map(Number);
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `Temporada ${months[(m || 1) - 1]} ${y}`;
}

export const divInfo = idx => LEAGUE_DIVS[Math.max(0, Math.min(TOP_DIV, idx | 0))];

export function newLeague(season = seasonId()) {
  return { season, div: 0, lp: 0, peak: 0, wins: 0, losses: 0, games: 0, streak: 0, shield: 0, last: [] };
}

/** Garante a liga da temporada atual (vira a temporada se mudou). Devolve { league, reward, rolled }. */
export function ensureSeason(league, season = seasonId()) {
  if (!league || typeof league !== 'object') return { league: newLeague(season), reward: 0, rolled: false };
  if (league.season === season) return { league: { ...newLeague(season), ...league }, reward: 0, rolled: false };
  const peakTier = divInfo(league.peak ?? league.div).tier;
  const played = (league.games || 0) > 0;
  const div = Math.max(0, (league.div | 0) - SEASON_DROP);
  return {
    league: { ...newLeague(season), div, peak: div, prev: { season: league.season, div: league.div, peak: league.peak ?? league.div } },
    reward: played ? SEASON_REWARD[peakTier] || 0 : 0,
    rolled: true
  };
}

/**
 * PL de uma partida pela colocação. Duelo: place 1 de 2 (vitória) ou 2 de 2 (derrota).
 * Tabuleiro com N jogadores: 1º ganha bem, o último perde; o meio fica perto de zero.
 */
export function lpDelta(place, players, streak = 0) {
  const n = Math.max(2, players | 0);
  let d;
  if (n === 2) d = place === 1 ? 22 : -18;
  else {
    const table = { 1: 28, 2: 12, 3: -4 };
    d = place === n ? -16 : table[place] ?? -10;
  }
  if (d > 0 && streak >= 2) d += 5; // 3ª vitória seguida em diante
  return d;
}

/** Aplica o resultado. Devolve { league, delta, change: 'up'|'down'|null, from, to }. */
export function applyLeagueResult(prev, { place, players }) {
  const L = { ...newLeague(prev?.season), ...(prev || {}) };
  const win = place === 1;
  const delta = lpDelta(place, players, L.streak);
  const from = L.div;
  L.games += 1;
  if (win) { L.wins += 1; L.streak = Math.max(1, L.streak + 1); } else { L.losses += 1; L.streak = 0; }
  let change = null;
  L.lp += delta;
  if (L.div === TOP_DIV) {
    if (L.lp < 0) {
      if (L.shield > 0) L.lp = 0;
      else { L.div -= 1; L.lp = 75; change = 'down'; }
    }
  } else if (L.lp >= LP_PER_DIV) {
    L.div += 1;
    L.lp = L.div === TOP_DIV ? L.lp - LP_PER_DIV : Math.min(LP_PER_DIV - 1, L.lp - LP_PER_DIV);
    L.shield = PROMO_SHIELD;
    change = 'up';
  } else if (L.lp < 0) {
    if (L.div === 0 || L.shield > 0) L.lp = 0;
    else { L.div -= 1; L.lp = 75; change = 'down'; }
  }
  if (change !== 'up' && L.shield > 0) L.shield -= 1;
  L.peak = Math.max(L.peak | 0, L.div);
  L.last = [...(L.last || []), win ? 'V' : place === 2 && players > 2 ? '2' : 'D'].slice(-10);
  return { league: L, delta, change, from, to: L.div };
}

/** Ordem da tabela: divisão, depois PL, depois vitórias. */
export const leagueSort = (a, b) => b.div - a.div || b.lp - a.lp || b.wins - a.wins;

export function leagueLabel(L) {
  const d = divInfo(L?.div || 0);
  return `${d.icon} ${d.name} · ${L?.lp || 0} PL`;
}
