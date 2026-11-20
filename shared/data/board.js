// Tabuleiro: o mapa ATIVO da partida. O resto do jogo lê SPACES / SPACE_LIST / START_SPACE daqui.
// Cada partida guarda `state.map` ('kanto' ou 'gen:<semente>'); o motor chama useMap() antes de calcular qualquer coisa.
// Como o motor é síncrono, trocar o mapa ativo no começo de cada chamada é seguro mesmo com várias partidas no servidor.
import { KANTO } from './maps/kanto.js';
import { generateMap } from './maps/generator.js';
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

/** Mapas escolhíveis na criação da sala. */
export const MAP_CHOICES = [
  { id: 'kanto', name: 'Kanto', desc: KANTO.desc },
  { id: 'gen', name: 'Expedição', desc: 'Mapa novo a cada partida: rotas, ilhas e áreas escondidas diferentes.' }
];

// Os objetos abaixo são preenchidos por useMap() — mesma referência sempre (quem importou continua vendo o mapa ativo).
export const SPACES = {};
export const SPACE_LIST = [];
export let START_SPACE = KANTO.start;
export let CURRENT_MAP = null;

/** Resolve o id do mapa salvo na partida. 'gen' (sem semente) usa a semente da partida. */
export function mapFor(mapId, seed = 1) {
  if (!mapId || mapId === 'kanto') return KANTO;
  if (mapId === 'arena') return ARENA;
  if (mapId === 'gen') return generateMap(seed);
  if (String(mapId).startsWith('gen:')) return generateMap(Number(String(mapId).slice(4)));
  return KANTO;
}

/** Ativa um mapa (objeto ou id). Devolve o mapa ativo. */
export function useMap(mapOrId, seed) {
  const map = typeof mapOrId === 'object' && mapOrId ? mapOrId : mapFor(mapOrId, seed);
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
  return useMap(state?.map || 'kanto');
}

export function getSpace(id) {
  return SPACES[Number(id)] || null;
}

useMap(KANTO);
