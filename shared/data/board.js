// Tabuleiro: o mapa ATIVO da partida. O resto do jogo lê SPACES / SPACE_LIST / START_SPACE daqui.
// Cada partida guarda `state.map` ('kanto' ou 'gen:<semente>'); o motor chama useMap() antes de calcular qualquer coisa.
// Como o motor é síncrono, trocar o mapa ativo no começo de cada chamada é seguro mesmo com várias partidas no servidor.
import { KANTO } from './maps/kanto.js';
import { generateMap, MAP_THEMES, THEME_IDS } from './maps/generator.js';
import { ARENA } from './maps/arena.js';
import { setLeagueSpaces } from './trainers.js';

/** Habilidades que liberam caminhos. Vale ter um Pokémon de pé com o tipo OU com um golpe desse tipo. */
export const GATES = {
  surf:  { name: 'Surf',         icon: '🌊', types: ['water'],              desc: 'atravessar o mar' },
  cut:   { name: 'Cortar',       icon: '🌿', types: ['grass', 'bug'],       desc: 'abrir a mata fechada' },
  smash: { name: 'Quebra-Pedra', icon: '🪨', types: ['fighting', 'rock'],   desc: 'quebrar as pedras do caminho' },
  flash: { name: 'Flash',        icon: '💡', types: ['electric', 'psychic'], desc: 'iluminar a caverna escura' },
  climb: { name: 'Escalada',     icon: '⛰️', types: ['ground', 'dragon'],   desc: 'subir o penhasco' },
  burn:  { name: 'Queimar',      icon: '🔥', types: ['fire'],               desc: 'queimar os espinhos' },
  fly:   { name: 'Voar',         icon: '🪶', types: ['flying'],             desc: 'chegar voando' }
};

/** Ambientes: cor do terreno e tipos que aparecem mais ali. */
export const BIOMES = {
  city:     { name: 'Cidade',          spawn: [] },
  grass:    { name: 'Campos',          spawn: ['normal', 'grass', 'bug'] },
  forest:   { name: 'Floresta',        spawn: ['bug', 'grass', 'poison'] },
  jungle:   { name: 'Selva',           spawn: ['grass', 'bug', 'poison'] },
  coast:    { name: 'Litoral',         spawn: ['water', 'flying', 'normal'] },
  sea:      { name: 'Mar',             spawn: ['water', 'ice'] },
  desert:   { name: 'Deserto',         spawn: ['ground', 'rock', 'fire'] },
  mountain: { name: 'Montanha',        spawn: ['rock', 'ground', 'fighting', 'flying'] },
  cave:     { name: 'Caverna',         spawn: ['rock', 'ground', 'poison'] },
  darkcave: { name: 'Caverna Escura',  spawn: ['ghost', 'dark', 'psychic'] },
  snow:     { name: 'Neve',            spawn: ['ice', 'water'] },
  volcano:  { name: 'Vulcão',          spawn: ['fire', 'rock', 'dragon'] }
};

/** Mapas escolhíveis na criação da sala (os personalizados do painel admin entram com setCustomMaps). */
export const BUILTIN_MAPS = [
  { id: 'kanto', name: 'Kanto', icon: '🗺️', desc: KANTO.desc },
  { id: 'gen', name: 'Expedição', icon: '🧭', desc: 'Mapa novo a cada partida: rotas, ilhas e áreas escondidas diferentes.' },
  ...THEME_IDS.map(t => ({ id: `theme:${t}`, name: MAP_THEMES[t].name, icon: { arquipelago: '🏝️', vulcanica: '🌋', glacial: '🏔️', floresta: '🌳' }[t] || '🗺️', desc: MAP_THEMES[t].desc }))
];
export const MAP_CHOICES = BUILTIN_MAPS.slice();
/** Mapas do jogo que o admin pode editar (a Expedição muda a cada partida, então não). */
export const REPLACEABLE = BUILTIN_MAPS.map(m => m.id).filter(id => id !== 'gen');
/** Mapas do painel admin publicados (vêm do /api/config). Guardados inteiros para o jogo offline. */
export const CUSTOM_MAPS = {};
export function setCustomMaps(list) {
  for (const k of Object.keys(CUSTOM_MAPS)) delete CUSTOM_MAPS[k];
  const ok = (list || []).filter(m => m && m.id && m.name && Array.isArray(m.spaces));
  for (const m of ok) CUSTOM_MAPS[m.id] = m;
  MAP_CHOICES.length = 0;
  MAP_CHOICES.push(...BUILTIN_MAPS, ...ok.filter(m => !m.replaces).map(m => ({ id: m.id, name: m.name, icon: '🛠️', desc: m.desc || 'Mapa criado no painel admin.' })));
}
export const mapChoiceName = id => { const c = MAP_CHOICES.find(m => m.id === id); return c ? `${c.icon} ${c.name}` : id === 'arena' ? '⚔️ Arena Royale' : '🗺️ Kanto'; };
export const isMapId = id => id === 'kanto' || id === 'gen' || (typeof id === 'string' && (id.startsWith('theme:') && THEME_IDS.includes(id.slice(6)) || id.startsWith('custom:')));

/** Casas Amarelas de encontro (Pokémon lendário) por mapa — v64: 3 ou 4 (era 2). As cartas Amarelas (Raids/Santuário) não mudam. */
export const LEGEND_SPACES_MAX = 4;
export const LEGEND_SPACES_DEFAULT = 3;
/**
 * Deixa exatamente 2 casas de Pokémon Amarelas: as indicadas em map.legendSpaces ou, sem isso, as 2 mais longe do início.
 * As outras casas de Pokémon Amarelas viram Vermelhas. Não mexe em cidades nem em casas de evento.
 */
export function capLegendSpaces(map) {
  if (!map || map.capped || map.id === 'arena') return map;
  const byId = new Map(map.spaces.map(s => [s.id, s]));
  const dist = new Map([[map.start, 0]]);
  const q = [map.start];
  while (q.length) { const id = q.shift(); for (const n of byId.get(id)?.links || []) if (!dist.has(n)) { dist.set(n, dist.get(id) + 1); q.push(n); } }
  const far = (a, b) => (dist.get(b.id) ?? -1) - (dist.get(a.id) ?? -1) || a.id - b.id;
  const mons = map.spaces.filter(s => s.type === 'pokemon');
  const want = Math.max(1, Math.min(LEGEND_SPACES_MAX, Number(map.legendMax) || LEGEND_SPACES_DEFAULT));
  const fixed = (map.legendSpaces || []).map(id => byId.get(id)).filter(s => s && s.type === 'pokemon').slice(0, want);
  // completa com casas do fim do mapa (tier 5, depois 4), espalhadas: cada nova fica o mais longe possível das já escolhidas
  const pool = [...mons.filter(s => s.tier === 5).sort(far), ...mons.filter(s => s.tier === 4).sort(far)].filter(s => !fixed.includes(s)).slice(0, 30);
  const hop = src => { const d = new Map([[src, 0]]); const qq = [src]; while (qq.length) { const id = qq.shift(); for (const n of byId.get(id)?.links || []) if (!d.has(n)) { d.set(n, d.get(id) + 1); qq.push(n); } } return d; };
  const keep = [...fixed];
  while (keep.length < want && pool.length) {
    if (!keep.length) { keep.push(pool.shift()); continue; }
    const ds = keep.map(s => hop(s.id));
    let bi = 0, bv = -1;
    pool.forEach((s, i) => { const v = Math.min(...ds.map(d => d.get(s.id) ?? 99)) * 10 + (s.tier === 5 ? 5 : 0) + (dist.get(s.id) ?? 0) * 0.1; if (v > bv) { bv = v; bi = i; } });
    keep.push(pool.splice(bi, 1)[0]);
  }
  const chosen = new Set(keep.map(s => s.id));
  for (const s of mons) {
    if (chosen.has(s.id)) s.tier = 5;
    else if (s.tier === 5) s.tier = 4;
  }
  map.legendSpaces = [...chosen];
  map.capped = true;
  return map;
}

/** Valida e normaliza um mapa personalizado (painel admin). Lança Error com a explicação. */
export function validateCustomMap(raw) {
  const err = m => { throw new Error(m); };
  if (!raw || typeof raw !== 'object') err('Mapa inválido.');
  const spaces = (Array.isArray(raw.spaces) ? raw.spaces : []).map(r => ({
    id: Math.floor(Number(r.id)), name: String(r.name || '').slice(0, 40) || null, x: Math.max(1, Math.min(99, Number(r.x) || 0)), y: Math.max(2, Math.min(98, Number(r.y) || 0)),
    type: ['pokemon', 'event', 'city'].includes(r.type) ? r.type : 'pokemon', tier: Math.max(1, Math.min(5, Math.floor(Number(r.tier)) || 1)),
    biome: BIOMES[r.biome] ? r.biome : 'grass', gate: GATES[r.gate] ? r.gate : null, links: [...new Set((r.links || []).map(Number))]
  }));
  if (spaces.length < 30) err('O mapa precisa de pelo menos 30 casas.');
  if (spaces.length > 220) err('Máximo de 220 casas.');
  const ids = new Set(spaces.map(s => s.id));
  if (ids.size !== spaces.length || [...ids].some(id => !(id > 0))) err('Ids de casa repetidos ou inválidos.');
  for (const s of spaces) s.links = s.links.filter(n => n !== s.id && ids.has(n));
  for (const s of spaces) for (const n of s.links) { const o = spaces.find(x => x.id === n); if (!o.links.includes(s.id)) o.links.push(s.id); }
  for (const s of spaces) { if (s.type === 'city') { s.biome = 'city'; s.gate = null; } if (!s.name) s.name = s.type === 'city' ? `Cidade ${s.id}` : `Rota ${s.id}`; }
  const city = id => ids.has(Number(id)) && spaces.find(s => s.id === Number(id)).type === 'city';
  const start = Number(raw.start), elite = Number(raw.elite), champion = Number(raw.champion);
  if (!city(start)) err('Escolha uma CIDADE como início.');
  if (!city(elite) || !city(champion) || elite === champion) err('Escolha duas cidades diferentes para a Liga (Elite) e a Arena Final (Campeão).');
  const gyms = {};
  for (const g of ['boulder', 'cascade', 'thunder', 'rainbow', 'volcano', 'soul']) {
    const id = Number(raw.gyms?.[g]);
    if (!city(id)) err('Cada um dos 6 ginásios precisa estar numa cidade.');
    gyms[g] = id;
  }
  if (new Set(Object.values(gyms)).size !== 6) err('Os 6 ginásios precisam estar em cidades diferentes.');
  if ([start, elite, champion].some(id => Object.values(gyms).includes(id))) err('Início, Liga e Arena Final não podem ser ginásios.');
  // tudo alcançável a partir do início (com habilidades)
  const seen = new Set([start]); const q = [start];
  while (q.length) { const id = q.shift(); for (const n of spaces.find(s => s.id === id).links) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  const lost = spaces.filter(s => !seen.has(s.id));
  if (lost.length) err(`Há ${lost.length} casa(s) sem ligação com o início (ex.: ${lost[0].name}).`);
  const gates = (Array.isArray(raw.leagueGates) ? raw.leagueGates.map(Number).filter(city) : []);
  const map = {
    id: `custom:${String(raw.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'mapa'}`,
    name: String(raw.name || 'Mapa').slice(0, 40), desc: String(raw.desc || '').slice(0, 160),
    ratio: Math.max(1.2, Math.min(2.6, Number(raw.ratio) || 2)), custom: true, bg: raw.bg ? String(raw.bg).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) : null,
    start, elite, champion, leagueGates: [...new Set([...gates, elite, champion])], gyms,
    legendSpaces: (raw.legendSpaces || []).map(Number).filter(id => ids.has(id)).slice(0, LEGEND_SPACES_MAX),
    legendMax: Math.max(1, Math.min(LEGEND_SPACES_MAX, Number(raw.legendMax) || LEGEND_SPACES_DEFAULT)),
    // ✏️ v64: versão editada de um mapa do jogo (Kanto ou temático): quando publicada, as salas desse mapa usam esta
    replaces: REPLACEABLE.includes(raw.replaces) ? raw.replaces : null,
    spaces
  };
  capLegendSpaces(map);
  return map;
}

// Os objetos abaixo são preenchidos por useMap() — mesma referência sempre (quem importou continua vendo o mapa ativo).
export const SPACES = {};
export const SPACE_LIST = [];
export let START_SPACE = KANTO.start;
export let CURRENT_MAP = null;

/** Resolve o id do mapa salvo na partida. 'gen' (sem semente) usa a semente da partida. */
const customCache = new Map();
export function mapFor(mapId, seed = 1, mapData = null) {
  if (!mapId || mapId === 'kanto') return capLegendSpaces(KANTO);
  if (mapId === 'arena') return ARENA;
  if (mapId === 'gen') return capLegendSpaces(generateMap(seed));
  const id = String(mapId);
  if (id.startsWith('gen:')) return capLegendSpaces(generateMap(Number(id.slice(4))));
  if (id.startsWith('theme:') && MAP_THEMES[id.slice(6)]) return capLegendSpaces(generateMap(MAP_THEMES[id.slice(6)].seed, id.slice(6)));
  if (id.startsWith('custom:') && mapData) {
    // a partida guarda o mapa inteiro (state.mapData); o cache evita remontar a cada jogada
    const key = `${id}#${mapData.rev || 0}`;
    if (!customCache.has(key)) {
      if (customCache.size > 10) customCache.delete(customCache.keys().next().value);
      customCache.set(key, capLegendSpaces({ ...mapData, spaces: mapData.spaces.map(s => ({ ...s, links: s.links.slice() })) }));
    }
    return customCache.get(key);
  }
  return capLegendSpaces(KANTO);
}

/** Ativa um mapa (objeto ou id). Devolve o mapa ativo. */
export function useMap(mapOrId, seed, mapData = null) {
  const map = typeof mapOrId === 'object' && mapOrId ? mapOrId : mapFor(mapOrId, seed, mapData);
  if (CURRENT_MAP === map) return map;
  for (const k of Object.keys(SPACES)) delete SPACES[k];
  SPACE_LIST.length = 0;
  for (const r of map.spaces) {
    const s = { id: r.id, name: r.name, x: r.x, y: r.y, type: r.type, tier: r.tier, biome: r.biome || 'grass', gate: r.gate || null, requiredType: null, links: r.links.slice() };
    SPACES[s.id] = s;
    SPACE_LIST.push(s);
  }
  START_SPACE = map.start;
  setLeagueSpaces(map);
  CURRENT_MAP = map;
  return map;
}

/** Ativa o mapa de uma partida (estado). */
export function useStateMap(state) {
  return useMap(state?.map || 'kanto', 1, state?.mapData || null);
}

export function getSpace(id) {
  return SPACES[Number(id)] || null;
}

useMap(capLegendSpaces(KANTO));
