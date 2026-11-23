// ⚪🔴 v58: "já tenho esse Pokémon?" — guarda a Pokédex da conta (vem em toda resposta da API que traz o perfil)
// e junta com o que foi capturado na partida atual. Usado para o ícone de Pokébola ao lado do nome.
import { getSpecies } from '../shared/data/pokemon.js';

let owned = new Set();
export function setOwnedDex(list) { if (Array.isArray(list)) owned = new Set(list); }
const baseOf = sp => { const s = getSpecies(sp); return s?.megaBase || s?.gmaxOf || sp; };
/** Tem na Pokédex da conta (ou já capturou nesta partida)? */
export function ownsSpecies(sp, player = null) {
  const id = baseOf(sp);
  return owned.has(id) || !!player?.caught?.includes(id);
}
/** Pokébola colorida = já tem · cinza = ainda não. */
export function caughtBall(sp, player = null, ballUrl = '') {
  const has = ownsSpecies(sp, player);
  return `<img class="caught-ball ${has ? 'has' : 'not'}" src="${ballUrl}" alt="${has ? 'capturado' : 'não capturado'}" title="${has ? 'Você já tem esse Pokémon' : 'Você ainda NÃO tem esse Pokémon'}">`;
}
