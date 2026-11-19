// ☁️ Clima do tabuleiro: muda a cada poucas rodadas e mexe nas batalhas e nos Pokémon que aparecem.
import { createRng } from './rng.js';
import { getSpecies } from '../data/pokemon.js';

export const WEATHERS = {
  clear: { name: 'Céu limpo', icon: '⛅', desc: 'Sem efeitos.' },
  sun:   { name: 'Sol forte', icon: '☀️', boost: { fire: 1.3, water: 0.7 }, spawn: ['fire', 'grass', 'ground'], inflict: { burn: 1.5 },
           desc: 'Fogo +30%, Água −30%. Mais Fogo e Planta aparecem. Queimaduras mais frequentes.' },
  rain:  { name: 'Chuva', icon: '🌧️', boost: { water: 1.3, fire: 0.7 }, spawn: ['water', 'bug', 'grass'],
           desc: 'Água +30%, Fogo −30%. Mais Água e Inseto aparecem.' },
  storm: { name: 'Tempestade', icon: '⛈️', boost: { electric: 1.3, water: 1.15, flying: 0.85 }, spawn: ['electric', 'water', 'flying'], inflict: { paralysis: 2 },
           desc: 'Elétrico +30%, Água +15%, Voador −15%. Paralisia 2× mais comum.' },
  snow:  { name: 'Nevasca', icon: '🌨️', boost: { ice: 1.3, fire: 0.85 }, spawn: ['ice', 'water'], chip: ['ice'], inflict: { freeze: 2 },
           desc: 'Gelo +30%. Quem não é Gelo perde um pouco de HP por rodada. Congelar 2× mais comum.' },
  sand:  { name: 'Tempestade de areia', icon: '🏜️', boost: { rock: 1.2, ground: 1.2 }, spawn: ['rock', 'ground', 'steel'], chip: ['rock', 'ground', 'steel'],
           desc: 'Pedra e Terra +20%. Quem não é Pedra/Terra/Aço perde HP por rodada.' },
  fog:   { name: 'Neblina', icon: '🌫️', boost: { ghost: 1.2, psychic: 1.2, dark: 1.2 }, spawn: ['ghost', 'psychic', 'dark'], rare: 0.2,
           desc: 'Fantasma, Psíquico e Sombrio +20%. Pokémon mais raros aparecem.' }
};
const WEIGHTS = [['clear', 32], ['sun', 13], ['rain', 15], ['storm', 8], ['snow', 8], ['sand', 9], ['fog', 12]];

export const weatherOf = state => WEATHERS[state?.weather?.id] || WEATHERS.clear;

/** Início de cada rodada: troca o clima quando o atual acaba. Devolve true se mudou. */
export function tickWeather(state, fx, log) {
  if (state.kind === 'duel') return false;
  const w = (state.weather ||= { id: 'clear', until: 3 });
  if (state.turn < w.until) return false;
  const rng = createRng((state.seed ^ (state.turn * 0x9e3779b1) ^ 0x7f4a7c15) >>> 0);
  let id = rng.weighted(WEIGHTS);
  if (id === w.id) id = rng.weighted(WEIGHTS);
  state.weather = { id, until: state.turn + rng.int(3, 5) };
  if (id !== w.id) {
    const W = WEATHERS[id];
    fx?.(state, { k: 'weather', id, rounds: state.weather.until - state.turn });
    log?.(state, `${W.icon} O clima mudou: ${W.name}! ${W.desc}`, 'event');
    return true;
  }
  return false;
}

/** Multiplicador de dano do clima para um golpe. */
export const weatherMult = (state, moveType) => weatherOf(state).boost?.[moveType] || 1;

/** Multiplicador da chance de causar uma condição. */
export const weatherInflict = (state, statusId) => weatherOf(state).inflict?.[statusId] || 1;

/** Dano de clima no fim da rodada (Nevasca/Areia). Devolve 0 se o Pokémon é imune. */
export function weatherChip(state, mon, maxHp) {
  const w = weatherOf(state);
  if (!w.chip) return 0;
  if (getSpecies(mon.sp).types.some(t => w.chip.includes(t))) return 0;
  return Math.max(1, Math.round(maxHp / 16));
}

/** Tipos favorecidos ao sortear selvagens. */
export const weatherSpawn = state => weatherOf(state).spawn || [];
export const weatherRare = state => weatherOf(state).rare || 0;
