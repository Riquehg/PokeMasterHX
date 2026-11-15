// Pokémon do Dia: o admin pode fixar um; senão, é sorteado de forma determinística pela data
// (todo mundo vê o mesmo, no cliente e no servidor, sem precisar de banco).
import { SPECIES_LIST, SPECIES } from './data/pokemon.js';

export function todayKey(date = new Date(), tz = 'America/Sao_Paulo') {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function dailyPokemon(override, date = new Date()) {
  const key = todayKey(date);
  if (override && override.species && SPECIES[override.species] && (!override.date || override.date === key)) {
    return override.species;
  }
  const pool = SPECIES_LIST.filter(s => s.tier <= 3);
  return pool[hash('pmhx-' + key) % pool.length].id;
}
