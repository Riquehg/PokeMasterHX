import { megaBySpecies } from './megas.js';
// ⚽ Liga das Séries (estilo Brasileirão): Série D → C → B → A, temporada mensal.
// Assíncrona: cada treinador inscreve um TIME DE DEFESA (6 Pokémon da Coleção). Os outros desafiam esse time
// num duelo 1x1 contra a CPU que joga com ele — não precisa ninguém estar online.
//  - Vitória no ataque: +3 pontos. Defesa que segura o ataque: +1 ponto para o dono (mesmo offline).
//  - Saldo (SP) = Pokémon derrubados − Pokémon perdidos (como saldo de gols).
//  - Cada série tem 20 vagas; as que sobram são de treinadores CPU (nome/time próprios, aparecem como jogadores).
//    Quanto mais gente entra, mais CPU (os mais fracos) saem da série.
//  - Fim do mês: os 4 primeiros sobem, os 4 últimos caem (só treinadores; os CPU ficam na série deles).
//    1º e 2º ganham troféu (Sala de Troféus) e item especial da série; pódio ganha 💎; campeão da A ganha um Mítico.
// Fica em profiles.stats.serie (sem mudar o banco). Histórico de fechamento em game_config 'serie_history'.
import { createRng } from '../rules/rng.js';
import { seasonId as utcSeasonId, seasonName } from './league.js';

export const SERIES = [
  { idx: 0, id: 'D', name: 'Série D', icon: '🟤', color: '#a0714a', level: 32 },
  { idx: 1, id: 'C', name: 'Série C', icon: '⚪', color: '#c8c8c8', level: 38 },
  { idx: 2, id: 'B', name: 'Série B', icon: '🟡', color: '#e0b84a', level: 44 },
  { idx: 3, id: 'A', name: 'Série A', icon: '🏆', color: '#4ad07a', level: 50 }
];
export const TOP_SERIE = SERIES.length - 1;
export const SERIE_TEAM = 6;          // Pokémon no time (ataque e defesa) — o 1x1 é jogador contra jogador
export const SERIE_LEVEL_CAP = 50;    // nível máximo (justo para todos)
export const SERIE_DAILY = 5;         // ataques por dia
export const SERIE_SAME_FOE = 1;      // ataques contra o mesmo adversário por dia
export const SERIE_UP = 4;            // sobem
export const SERIE_DOWN = 4;          // caem
export const PTS_ATTACK_WIN = 3;
export const PTS_DEFENSE_WIN = 1;
/** 💎 para o 1º, 2º e 3º lugar (posição geral, contando clubes) de cada série. */
export const SERIE_PRIZE = { 0: [6, 3, 2], 1: [10, 5, 3], 2: [16, 8, 5], 3: [30, 15, 10] };

/** 🏆 1º e 2º de cada série: troféu (Sala de Troféus) + item especial na Mochila da conta. */
export const SERIE_ITEMS = {
  0: [{ tm: 2, ultra_ball: 5 }, { tm: 1, ultra_ball: 3 }],
  1: [{ trust_ball: 1, tm: 2 }, { tm: 2, ultra_ball: 5 }],
  2: [{ master_ball: 1, trust_ball: 1, tm: 2 }, { trust_ball: 1, tm: 2 }],
  3: [{ master_ball: 1, shiny_charm: 1, tm: 3 }, { master_ball: 1, tm: 3 }]
};
export const TROPHY_NAMES = { 1: 'Campeão', 2: 'Vice-campeão' };
export const trophyLabel = t => `${t.pos === 1 ? '🏆' : '🥈'} ${TROPHY_NAMES[t.pos]} da ${SERIES[t.div]?.name || 'Série'}`;

export const serieInfo = idx => SERIES[Math.max(0, Math.min(TOP_SERIE, idx | 0))];
export { seasonName };

// 🕛 A Liga das Séries usa o horário de Brasília (UTC−3): a temporada vira à meia-noite do dia 1
// e os ataques do dia renovam à meia-noite.
export const SERIE_TZ_HOURS = -3;
const brt = (now = new Date()) => new Date(now.getTime() + SERIE_TZ_HOURS * 3600000);
export const seasonId = (now = new Date()) => utcSeasonId(brt(now));

export function newSerie(season = seasonId(), div = 0) {
  return { season, div, team: null, pts: 0, j: 0, v: 0, d: 0, sp: 0, dv: 0, dd: 0, defense: [], day: '', dayCount: 0, foesToday: [], log: [] };
}

export const dayId = (now = new Date()) => brt(now).toISOString().slice(0, 10);

/** Dias da temporada já "jogados" pelos clubes (até hoje, inclusive). */
export function seasonDays(season, now = new Date()) {
  const [y, m] = season.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (seasonId(now) !== season) return seasonId(now) < season ? 0 : last;
  return brt(now).getUTCDate();
}

// ---------------------------------------------------------------- treinadores da liga (CPU)
// Cada série tem SERIE_SLOTS vagas. As vagas sem treinador de verdade são de treinadores CPU com nome, avatar e
// time próprios (fixos por série). Conforme entram treinadores, os CPU mais fracos da tabela saem da série.
export const SERIE_SLOTS = 20;
const BOT_NAMES = [
  ['Lucas_PKM', 'duda.trainer', 'Biel Kanto', 'Manu Silva', 'joaozinho99', 'Rafa Mestre', 'Nanda Poke', 'Theo_007', 'Kaká Treinador', 'lelezinha',
    'Pedro H.', 'Juliana R.', 'MateusGamer', 'bia_bulbasaur', 'Vini Ash', 'Carol M.', 'Gui_Fogo', 'Rebeca', 'Tavinho', 'Lari Pikachu'],
  ['Henrique S.', 'Isa.Eevee', 'Brunão', 'Malu Trainer', 'Caio Rocket', 'Gabi Neves', 'Felipe_Snorlax', 'Ana Clara', 'Dudu Pallet', 'Sofia M.',
    'Arthur_Raio', 'Vitória P.', 'Leozin', 'Helena Água', 'Murilo G.', 'Yasmin', 'Davi Cerulean', 'Clara Lua', 'Enzo_Gengar', 'Marina F.'],
  ['Ricardo Sabiá', 'Bea Dragon', 'Thiago Mestre', 'Lívia_Sylveon', 'Gustavo T.', 'Alice Kalos', 'Diego Garchomp', 'Camila R.', 'Rodrigo Elite', 'Lorena',
    'Fábio_Steel', 'Mari Gardevoir', 'Igor Lucario', 'Bruna C.', 'Danilo Hoenn', 'Paulinha', 'Victor_Tyranitar', 'Jéssica M.', 'Otávio', 'Nina Umbreon'],
  ['Mestre Kauã', 'Fernanda Champion', 'Leandro_Rayquaza', 'Patrícia Elite', 'Renan Top1', 'Alessandra K.', 'Marcelo Dragonite', 'Tati Metagross', 'Rodolfo Mega', 'Priscila',
    'Caíque_Hydreigon', 'Lu Alola', 'André Campeão', 'Bárbara S.', 'Wesley Salamence', 'Cris Togekiss', 'Fabrício', 'Mayara_Greninja', 'Sérgio Liga', 'Débora Mestra']
];
const BOT_POOLS = [
  ['raticate', 'pidgeotto', 'beedrill', 'fearow', 'nidorino', 'nidorina', 'golbat', 'graveler', 'onix', 'kabuto', 'starmie', 'seaking', 'golduck', 'raichu', 'magneton',
    'electabuzz', 'haunter', 'hypno', 'persian', 'primeape', 'growlithe', 'poliwhirl', 'weepinbell', 'machoke', 'ponyta', 'slowpoke', 'doduo', 'seel', 'grimer', 'drowzee',
    'krabby', 'cubone', 'koffing', 'rhyhorn', 'tangela', 'horsea', 'staryu', 'eevee', 'furret', 'noctowl', 'ledian', 'ariados', 'flaaffy', 'marill', 'sudowoodo', 'aipom'],
  ['vileplume', 'victreebel', 'kadabra', 'mr_mime', 'jynx', 'venomoth', 'weezing', 'muk', 'ninetales', 'rapidash', 'magmar', 'ampharos', 'miltank', 'granbull',
    'girafarig', 'sandslash', 'nidoking', 'nidoqueen', 'clefable', 'wigglytuff', 'dugtrio', 'golem', 'slowbro', 'dodrio', 'dewgong', 'cloyster', 'kingler', 'electrode',
    'exeggutor', 'marowak', 'hitmonlee', 'hitmonchan', 'kangaskhan', 'tauros', 'pinsir', 'scyther', 'jolteon', 'flareon', 'vaporeon', 'omastar', 'kabutops', 'xatu'],
  ['houndoom', 'espeon', 'umbreon', 'skarmory', 'steelix', 'kingdra', 'piloswine', 'lapras', 'gyarados', 'blaziken', 'swampert', 'sceptile', 'milotic', 'walrein',
    'sharpedo', 'arcanine', 'machamp', 'alakazam', 'gengar', 'aerodactyl', 'snorlax', 'scizor', 'heracross', 'crobat', 'feraligatr', 'typhlosion', 'meganium', 'ursaring',
    'gardevoir', 'breloom', 'aggron', 'flygon', 'altaria', 'absol', 'luxray', 'roserade', 'staraptor', 'lopunny', 'honchkrow', 'mismagius'],
  ['dragonite', 'tyranitar', 'salamence', 'metagross', 'garchomp', 'lucario', 'togekiss', 'hydreigon', 'volcarona', 'excadrill', 'greninja', 'talonflame', 'aegislash',
    'decidueye', 'incineroar', 'primarina', 'kommo_o', 'gallade', 'weavile', 'electivire', 'magmortar', 'rhyperior', 'mamoswine', 'porygon_z', 'gliscor', 'goodra',
    'haxorus', 'chandelure', 'krookodile', 'conkeldurr', 'infernape', 'empoleon', 'torterra', 'tangrowth', 'zoroark', 'mimikyu', 'kingdra', 'gyarados', 'charizard', 'blastoise', 'venusaur']
];
// nomes de time dos treinadores CPU (um por treinador, por série)
const BOT_TEAMS = [
  ['Pallet Juniors', 'Rattata Rangers', 'Viridian Kids', 'Vila Aurora EC', 'Os Caterpies', 'Pewter Pedreiros', 'Bulbas da Várzea', 'Zubat Noturno', 'Kanto Mirim', 'Lagoa Azul FC',
    'Os Pidgeys', 'Fogo de Palha', 'Time do Bairro', 'Gangue do Meowth', 'Vermelho e Branco', 'Spearow United', 'Rota 1 EC', 'Ondinha FC', 'Os Desbravadores', 'Raio Amarelo'],
  ['Cerulean Ondas', 'Celadon Jardim', 'Lavender Assombro', 'Trovão do Norte', 'Saffron Mentes', 'Fuchsia Sombras', 'Porto Coral EC', 'Os Eevees', 'Cinnabar Chamas', 'Garra de Pedra',
    'Granito FC', 'Lua Cheia', 'Vale Verde', 'Os Machokes', 'Furacão Azul', 'Brasa Viva', 'Neblina EC', 'Asa Delta', 'Rota 9 Unidos', 'Maré Alta'],
  ['Johto Imperial', 'Dragões do Sul', 'Ecruteak Sábios', 'Aço Inox', 'Hoenn Atlético', 'Tempestade FC', 'Sombra Lunar', 'Real Goldenrod', 'Fênix Dourada', 'Os Gyarados',
    'Muralha de Ferro', 'Cometa EC', 'Lança Tripla', 'Gelo e Fogo', 'Mahogany Norte', 'Coral Profundo', 'Esporte Clube Absol', 'Garra Afiada', 'Vento Forte', 'Os Umbreons'],
  ['Indigo Elite', 'Sinnoh Real', 'Unova Galáctico', 'Kalos Esmeralda', 'Alola Sol', 'Mt. Silver Lendas', 'Dragonite Squad', 'Os Imbatíveis', 'Mega Campeões', 'Tirania FC',
    'Esquadrão Metagross', 'Garchomp Team', 'Estrela Polar', 'Os Mestres', 'Coroa de Ouro', 'Hydra EC', 'Lucario Club', 'Supernova', 'Arena Suprema', 'Dinastia Kanto']
];
/** Escudos (emblemas) para os times. */
export const CRESTS = ['⚡', '🔥', '💧', '🌿', '❄️', '🐉', '👻', '🌙', '☀️', '⭐', '🌪️', '🪨', '⚔️', '🛡️', '👑', '🦅', '🐺', '🦁', '🐍', '🦈', '🌋', '🌊', '🍀', '💎', '🎯', '🚀', '🎲', '🔱'];
export const CREST_COLORS = ['#e04848', '#e08a2c', '#e6c73a', '#4ac06b', '#2fb3a4', '#3d7fe0', '#6a5ae0', '#b95ae0', '#e05aa8', '#8a6a4a', '#9aa4ad', '#2a2a2a'];
/** Limpa o time escolhido pelo jogador ({ name, crest, color }). */
export function cleanTeam(t, fallbackName = 'Meu Time') {
  const name = String(t?.name ?? '').replace(/[<>"'`&\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 22) || fallbackName;
  return { name, crest: CRESTS.includes(t?.crest) ? t.crest : CRESTS[0], color: CREST_COLORS.includes(t?.color) ? t.color : CREST_COLORS[5] };
}

const SKINS = ['red-masters', 'ash-alola', 'cynthia-masters', 'leon', 'brendan-masters2', 'calem-masters', 'acerola-masters', 'zinnia', 'elaine', 'pokekid', 'pokemonranger-gen6', 'psychic-lgpe'];

function botTeamIds(div, i, pool) {
  const rng = createRng(hash(`bot|${div}|${i}`));
  const out = [];
  while (out.length < SERIE_TEAM) { const sp = rng.pick(pool); if (!out.includes(sp)) out.push(sp); }
  return out;
}
const _bots = [];
/** Os 20 treinadores CPU fixos de uma série (nome, avatar, time e força). */
export function botsOf(div, speciesOk = null) {
  if (_bots[div]) return _bots[div];
  const pool = speciesOk ? BOT_POOLS[div].filter(speciesOk) : BOT_POOLS[div];
  _bots[div] = BOT_NAMES[div].map((name, i) => {
    const rng = createRng(hash(`look|${div}|${i}`));
    return { id: `t_${SERIES[div].id}${(i + 10).toString(36)}`, name, div, avatar: rng.int(1, 8), skin: rng.chance(0.3) ? rng.pick(SKINS) : null,
      club: { name: BOT_TEAMS[div][i], crest: rng.pick(CRESTS), color: rng.pick(CREST_COLORS) },
      power: 0.3 + ((i * 7) % 20) / 20 * 0.34, team: botTeamIds(div, i, pool), bot: true };
  });
  return _bots[div];
}
export const botById = id => {
  const m = /^t_([DCBA])([0-9a-z]+)$/.exec(String(id));
  if (!m) return null;
  const div = SERIES.findIndex(s => s.id === m[1]);
  return botsOf(div).find(b => b.id === id) || null;
};

/** Time de defesa de um treinador CPU (nível da série). */
export const MEGA_SERIE = 2; // 💎 Megas liberadas da Série B (2) para cima
export function botTeam(bot) {
  const lvl = SERIES[bot.div].level;
  const team = bot.team.map((sp, i) => ({ uid: `${bot.id}_${i}`, sp, lvl }));
  // Séries A/B: o treinador CPU leva a Megapedra do primeiro Pokémon do time que tem Mega
  if (bot.div >= MEGA_SERIE) {
    const m = team.find(x => megaBySpecies(x.sp).length);
    if (m) { const opts = megaBySpecies(m.sp); m.held = `ms_${opts[hash(bot.id) % opts.length].key}`; }
  }
  return team;
}

/** Campanha simulada do treinador CPU até o dia `days` da temporada (determinística). adj = resultados reais contra treinadores. */
export function botRecord(bot, season, days, adj = null) {
  const rng = createRng(hash(`${season}|${bot.id}`));
  const r = { pts: 0, j: 0, v: 0, d: 0, sp: 0, dv: 0, dd: 0 };
  for (let k = 0; k < days; k++) {
    const games = 1; // 1 jogo por dia: ritmo de referência (quem joga todo dia passa os CPU)
    for (let g = 0; g < games; g++) {
      r.j++;
      if (rng.chance(bot.power)) { r.v++; r.pts += PTS_ATTACK_WIN; r.sp += rng.int(1, 3); }
      else { r.d++; r.sp -= rng.int(1, 3); }
    }
    if (rng.chance(0.3)) { if (rng.chance(bot.power)) { r.dv++; r.pts += PTS_DEFENSE_WIN; } else r.dd++; }
  }
  if (adj) { r.pts += adj.pts || 0; r.dv += adj.dv || 0; r.dd += adj.dd || 0; }
  return r;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * 🏁 Pontos de largada para quem se inscreve com a temporada andando: os pontos que o 16º colocado
 * (linha do rebaixamento) dos CPU tem hoje. Assim ninguém entra 70 pontos atrás — entra no bolo de baixo.
 */
export function lateStartPoints(div, season, now = new Date()) {
  const days = seasonDays(season, now);
  if (days <= 1) return 0;
  const pts = botsOf(div).map(b => botRecord(b, season, days).pts).sort((a, b) => b - a);
  return pts[Math.min(pts.length - 1, SERIE_SLOTS - SERIE_DOWN - 1)] || 0;
}

/** Ordem da tabela: pontos, vitórias, saldo, menos jogos. */
export const serieSort = (a, b) => b.pts - a.pts || b.v - a.v || b.sp - a.sp || a.j - b.j || String(a.name).localeCompare(String(b.name));

/**
 * Tabela de uma série: treinadores + treinadores CPU nas vagas que sobram (os CPU mais fracos saem primeiro).
 * humans = [{ id, name, avatar, ...record }] · adj = { botId: { pts, dv, dd } } (resultados reais contra os CPU)
 */
export function serieTable(div, humans, season, now = new Date(), adj = {}) {
  const days = seasonDays(season, now);
  const free = Math.max(0, SERIE_SLOTS - humans.length);
  const bots = botsOf(div).map(b => ({ id: b.id, name: b.name, avatar: b.avatar, skin: b.skin, club: b.club, bot: true, ...botRecord(b, season, days, adj[b.id]) }))
    .sort(serieSort).slice(0, free);
  return [...humans, ...bots].sort(serieSort).map((r, i) => ({ ...r, pos: i + 1 }));
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
