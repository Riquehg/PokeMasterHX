// ⚽ Liga das Séries (estilo Brasileirão): Série D → C → B → A, temporada mensal.
// Assíncrona: cada treinador inscreve um TIME DE DEFESA (3 Pokémon da Coleção). Os outros desafiam esse time
// num duelo 1x1 contra a CPU que joga com ele — não precisa ninguém estar online.
//  - Vitória no ataque: +3 pontos. Defesa que segura o ataque: +1 ponto para o dono (mesmo offline).
//  - Saldo (SP) = Pokémon derrubados − Pokémon perdidos (como saldo de gols).
//  - Clubes CPU completam cada série e somam pontos todo dia (ritmo de referência).
//  - Fim do mês: os 4 primeiros sobem, os 4 últimos caem (só treinadores; clubes ficam). Pódio ganha 💎;
//    o campeão da Série A ganha um Pokémon Mítico.
// Fica em profiles.stats.serie (sem mudar o banco). Histórico de fechamento em game_config 'serie_history'.
import { createRng } from '../rules/rng.js';
import { seasonId, seasonName } from './league.js';

export const SERIES = [
  { idx: 0, id: 'D', name: 'Série D', icon: '🟤', color: '#a0714a', level: 32 },
  { idx: 1, id: 'C', name: 'Série C', icon: '⚪', color: '#c8c8c8', level: 38 },
  { idx: 2, id: 'B', name: 'Série B', icon: '🟡', color: '#e0b84a', level: 44 },
  { idx: 3, id: 'A', name: 'Série A', icon: '🏆', color: '#4ad07a', level: 50 }
];
export const TOP_SERIE = SERIES.length - 1;
export const SERIE_TEAM = 3;          // Pokémon no time (ataque e defesa)
export const SERIE_LEVEL_CAP = 50;    // nível máximo (justo para todos)
export const SERIE_DAILY = 5;         // ataques por dia
export const SERIE_SAME_FOE = 1;      // ataques contra o mesmo adversário por dia
export const SERIE_UP = 4;            // sobem
export const SERIE_DOWN = 4;          // caem
export const PTS_ATTACK_WIN = 3;
export const PTS_DEFENSE_WIN = 1;
/** 💎 para o 1º, 2º e 3º lugar (posição geral, contando clubes) de cada série. */
export const SERIE_PRIZE = { 0: [6, 3, 2], 1: [10, 5, 3], 2: [16, 8, 5], 3: [30, 15, 10] };

export const serieInfo = idx => SERIES[Math.max(0, Math.min(TOP_SERIE, idx | 0))];
export { seasonId, seasonName };

export function newSerie(season = seasonId(), div = 0) {
  return { season, div, pts: 0, j: 0, v: 0, d: 0, sp: 0, dv: 0, dd: 0, defense: [], day: '', dayCount: 0, foesToday: [], log: [] };
}

export const dayId = (now = new Date()) => now.toISOString().slice(0, 10);

/** Dias da temporada já "jogados" pelos clubes (até hoje, inclusive). */
export function seasonDays(season, now = new Date()) {
  const [y, m] = season.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (seasonId(now) !== season) return now < new Date(Date.UTC(y, m - 1, 1)) ? 0 : last;
  return now.getUTCDate();
}

// ---------------------------------------------------------------- clubes CPU
const CLUB_NAMES = [
  ['Pallet FC', 'Viridian EC', 'Pewter Rocks', 'Clube Cerulean', 'Vermilion SC', 'Lavender Ghosts'],
  ['Celadon Flora', 'Saffron Psi', 'Fuchsia Ninjas', 'Cinnabar Fogo', 'Johto United', 'Goldenrod AC'],
  ['Ecruteak Sábios', 'Olivine Porto', 'Mahogany Gelo', 'Blackthorn Dragões', 'Hoenn Atlético', 'Lilycove Mar'],
  ['Indigo Elite', 'Sinnoh Real', 'Unova Galáctico', 'Kalos Esmeralda', 'Alola Sol', 'Mt. Silver Lendas']
];
const CLUB_TEAMS = [
  [['raticate', 'pidgeotto', 'beedrill'], ['fearow', 'nidorino', 'golbat'], ['graveler', 'onix', 'kabuto'], ['starmie', 'seaking', 'golduck'], ['raichu', 'magneton', 'electabuzz'], ['haunter', 'gengar', 'hypno']],
  [['vileplume', 'victreebel', 'tangela'], ['kadabra', 'mr_mime', 'jynx'], ['venomoth', 'weezing', 'muk'], ['ninetales', 'rapidash', 'magmar'], ['furret', 'noctowl', 'ampharos'], ['miltank', 'granbull', 'girafarig']],
  [['houndoom', 'espeon', 'umbreon'], ['skarmory', 'steelix', 'kingdra'], ['piloswine', 'lapras', 'dewgong'], ['dragonair', 'gyarados', 'kingdra'], ['blaziken', 'swampert', 'sceptile'], ['milotic', 'walrein', 'sharpedo']],
  [['dragonite', 'tyranitar', 'gengar'], ['garchomp', 'lucario', 'togekiss'], ['hydreigon', 'volcarona', 'excadrill'], ['greninja', 'talonflame', 'aegislash'], ['decidueye', 'incineroar', 'kommo_o'], ['metagross', 'salamence', 'gardevoir']]
];
/** Força de cada clube (0..1): define o ritmo de pontos por dia. */
const CLUB_POWER = [0.62, 0.55, 0.5, 0.45, 0.4, 0.34];

export function clubsOf(div) {
  return CLUB_NAMES[div].map((name, i) => ({ id: `club_${SERIES[div].id}${i}`, name, div, team: CLUB_TEAMS[div][i], power: CLUB_POWER[i], club: true }));
}
export const clubById = id => {
  const m = /^club_([DCBA])(\d)$/.exec(String(id));
  if (!m) return null;
  const div = SERIES.findIndex(s => s.id === m[1]);
  return clubsOf(div)[Number(m[2])] || null;
};

/** Time de defesa de um clube (nível da série). */
export function clubTeam(club) {
  const lvl = SERIES[club.div].level;
  return club.team.map((sp, i) => ({ uid: `${club.id}_${i}`, sp, lvl }));
}

/** Campanha simulada do clube até o dia `days` da temporada (determinística). */
export function clubRecord(club, season, days) {
  const rng = createRng(hash(`${season}|${club.id}`));
  const r = { pts: 0, j: 0, v: 0, d: 0, sp: 0, dv: 0, dd: 0 };
  for (let k = 0; k < days; k++) {
    const games = 1 + rng.int(0, 1); // 1 ou 2 jogos por dia (ritmo de referência para quem joga)
    for (let g = 0; g < games; g++) {
      r.j++;
      if (rng.chance(club.power)) { r.v++; r.pts += PTS_ATTACK_WIN; r.sp += rng.int(1, 3); }
      else { r.d++; r.sp -= rng.int(1, 3); }
    }
    if (rng.chance(0.5)) { if (rng.chance(club.power)) { r.dv++; r.pts += PTS_DEFENSE_WIN; } else r.dd++; }
  }
  return r;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Ordem da tabela: pontos, vitórias, saldo, menos jogos. */
export const serieSort = (a, b) => b.pts - a.pts || b.v - a.v || b.sp - a.sp || a.j - b.j || String(a.name).localeCompare(String(b.name));

/** Tabela de uma série: treinadores + clubes. rows = [{ id, name, avatar, ...record }] */
export function serieTable(div, humans, season, now = new Date()) {
  const days = seasonDays(season, now);
  const clubs = clubsOf(div).map(c => ({ id: c.id, name: c.name, club: true, ...clubRecord(c, season, days) }));
  return [...humans, ...clubs].sort(serieSort).map((r, i) => ({ ...r, pos: i + 1 }));
}

/** Zona da posição na tabela: 'up' (sobe), 'down' (cai) ou null. */
export function zoneOf(pos, total, div) {
  if (div < TOP_SERIE && pos <= SERIE_UP) return 'up';
  if (div > 0 && pos > total - SERIE_DOWN) return 'down';
  return null;
}

/** Resultado de um duelo da Série para o atacante e o defensor. */
export function applySerieDuel(att, def, { win, kos, lost }) {
  const sp = kos - lost;
  const A = { ...att, j: att.j + 1, v: att.v + (win ? 1 : 0), d: att.d + (win ? 0 : 1), sp: att.sp + sp, pts: att.pts + (win ? PTS_ATTACK_WIN : 0) };
  const D = def ? { ...def, dv: def.dv + (win ? 0 : 1), dd: def.dd + (win ? 1 : 0), pts: def.pts + (win ? 0 : PTS_DEFENSE_WIN) } : null;
  return { att: A, def: D, sp };
}

export const serieLabel = S => `${serieInfo(S?.div || 0).icon} ${serieInfo(S?.div || 0).name} · ${S?.pts || 0} pts`;
