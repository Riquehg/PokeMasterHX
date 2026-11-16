// Golpes — cada Pokémon tem 2 golpes. Cada INDIVÍDUO sorteia a sua variação ao nascer/ser capturado:
//  1º golpe: golpe rápido do 1º tipo (100%, nunca erra).
//  2º golpe: varia! Golpe forte (140%, erra no 🎲1) ou golpe pesado (170%, erra no 🎲1–2),
//            do 2º tipo, do 1º tipo ou de um tipo de "cobertura" (ex.: Pikachu com Iron Tail).
//            Pokémon de suporte podem vir com o golpe de suporte (cura, fortalecer, intimidar, dreno) ou com um ataque.
// Ex.: dois Pikachu: um com Thunder Shock + Thunderbolt, outro com Thunder Shock + Thunder, outro com Iron Tail.
// Nomes oficiais em inglês (como aparecem nos jogos).
import { getSpecies } from './pokemon.js';

export const QUICK_POWER = 1.0;
export const STRONG_POWER = 1.4;
export const HEAVY_POWER = 1.7;
export const STAB = 1.2; // golpe do mesmo tipo do Pokémon

// [rápido, forte, pesado] por tipo
const BY_TYPE = {
  normal:   ['Tackle', 'Body Slam', 'Double-Edge'],
  fire:     ['Ember', 'Flamethrower', 'Fire Blast'],
  water:    ['Water Gun', 'Surf', 'Hydro Pump'],
  grass:    ['Razor Leaf', 'Energy Ball', 'Solar Beam'],
  electric: ['Thunder Shock', 'Thunderbolt', 'Thunder'],
  ice:      ['Powder Snow', 'Ice Beam', 'Blizzard'],
  fighting: ['Karate Chop', 'Close Combat', 'Focus Blast'],
  poison:   ['Poison Sting', 'Sludge Bomb', 'Gunk Shot'],
  ground:   ['Mud-Slap', 'Earthquake', 'Drill Run'],
  flying:   ['Gust', 'Air Slash', 'Hurricane'],
  psychic:  ['Confusion', 'Psychic', 'Future Sight'],
  bug:      ['Bug Bite', 'X-Scissor', 'Megahorn'],
  rock:     ['Rock Throw', 'Rock Slide', 'Stone Edge'],
  ghost:    ['Lick', 'Shadow Ball', 'Shadow Force'],
  dragon:   ['Dragon Breath', 'Dragon Pulse', 'Draco Meteor'],
  dark:     ['Bite', 'Crunch', 'Night Daze'],
  steel:    ['Metal Claw', 'Iron Head', 'Iron Tail'],
  fairy:    ['Fairy Wind', 'Moonblast', 'Play Rough']
};

// Tipos de cobertura que cada tipo pode aprender (variação rara)
const COVERAGE = {
  normal: ['fighting', 'dark'], fire: ['dragon', 'normal'], water: ['ice'], grass: ['poison', 'normal'], electric: ['steel', 'normal'],
  ice: ['water'], fighting: ['rock', 'dark'], poison: ['dark'], ground: ['rock'], flying: ['steel', 'normal'], psychic: ['fairy', 'ghost'],
  bug: ['poison', 'fighting'], rock: ['ground'], ghost: ['dark'], dragon: ['fire', 'flying'], dark: ['ghost', 'fighting'],
  steel: ['rock'], fairy: ['psychic']
};

// Golpes de suporte (por papel)
export const SUPPORT = {
  healer:   { id: 'recover',      name: 'Recover',      kind: 'heal',   type: 'normal', desc: 'Recupera 40% do HP' },
  buffer:   { id: 'swords_dance', name: 'Swords Dance', kind: 'buff',   type: 'normal', desc: 'Ataque +40% (acumula até 2x)' },
  debuffer: { id: 'intimidate',   name: 'Intimidate',   kind: 'debuff', type: 'dark',   desc: 'Ataque do rival −30% (acumula até 2x)' },
  drainer:  { id: 'giga_drain',   name: 'Giga Drain',   kind: 'drain',  type: 'grass',  desc: 'Dano e recupera metade do dano', power: 1.0 }
};
export const ROLE_LABELS = { healer: 'Curandeiro', buffer: 'Fortalecedor', debuffer: 'Intimidador', drainer: 'Drenador' };

// ---------------------------------------------------------------- registro de todos os golpes (id → golpe)
export const MOVES = {};
for (const [type, [q, s, x]] of Object.entries(BY_TYPE)) {
  MOVES[`${type}_q`] = { id: `${type}_q`, name: q, kind: 'dmg', type, power: QUICK_POWER, miss: 0, desc: 'Rápido: nunca erra' };
  MOVES[`${type}_s`] = { id: `${type}_s`, name: s, kind: 'dmg', type, power: STRONG_POWER, miss: 1, risky: true, desc: 'Forte: erra no 🎲1' };
  MOVES[`${type}_x`] = { id: `${type}_x`, name: x, kind: 'dmg', type, power: HEAVY_POWER, miss: 2, risky: true, desc: 'Pesado: erra no 🎲1–2' };
}
for (const m of Object.values(SUPPORT)) MOVES[m.id] = { ...m, miss: 0 };
MOVES.leech_life = { id: 'leech_life', name: 'Leech Life', kind: 'drain', type: 'bug', power: 1.0, miss: 0, desc: 'Dano e recupera metade do dano' };
MOVES.drain_punch = { id: 'drain_punch', name: 'Drain Punch', kind: 'drain', type: 'fighting', power: 1.0, miss: 0, desc: 'Dano e recupera metade do dano' };

function drainFor(sp) {
  return sp.types.includes('grass') ? 'giga_drain' : sp.types.includes('bug') ? 'leech_life' : 'drain_punch';
}
function supportFor(sp) {
  return sp.role === 'drainer' ? drainFor(sp) : SUPPORT[sp.role]?.id;
}

/** Variação padrão da espécie (usada na Pokédex e para Pokémon antigos sem variação salva). */
export function defaultMoveIds(speciesId) {
  const sp = getSpecies(speciesId);
  if (!sp) return [];
  const [t1, t2] = sp.types;
  return [`${t1}_q`, sp.role ? supportFor(sp) : `${t2 || t1}_s`];
}

/** Sorteia a variação de golpes de um indivíduo. */
export function rollMoveIds(rng, speciesId) {
  const sp = getSpecies(speciesId);
  if (!sp) return [];
  const [t1, t2] = sp.types;
  if (sp.role && rng.chance(0.6)) return [`${t1}_q`, supportFor(sp)];
  let type = t2 && rng.chance(0.7) ? t2 : t1;
  if (rng.chance(0.15)) type = rng.pick(COVERAGE[t1] || [t1]);
  const power = rng.chance(0.35) ? 'x' : 's';
  return [`${t1}_q`, `${type}_${power}`];
}

/** Todas as variações possíveis do 2º golpe (para a Pokédex). */
export function possibleSecondMoves(speciesId) {
  const sp = getSpecies(speciesId);
  if (!sp) return [];
  const [t1, t2] = sp.types;
  const types = [...new Set([t2, t1, ...(COVERAGE[t1] || [])].filter(Boolean))];
  const ids = types.flatMap(t => [`${t}_s`, `${t}_x`]);
  if (sp.role) ids.unshift(supportFor(sp));
  return ids.map(id => MOVES[id]);
}

const cache = {};
/** Golpes padrão da espécie. */
export function movesOf(speciesId) {
  return (cache[speciesId] ||= defaultMoveIds(speciesId).map(id => MOVES[id]));
}

/** Golpes de um Pokémon específico (a variação dele; se não tiver, a padrão da espécie). */
export function monMoves(mon) {
  if (!mon) return [];
  if (Array.isArray(mon.moves) && mon.moves.length === 2 && mon.moves.every(id => MOVES[id])) {
    // o 1º golpe acompanha o tipo da espécie atual (muda se evoluir para outro tipo)
    const t1 = getSpecies(mon.sp)?.types[0];
    return [MOVES[`${t1}_q`] || MOVES[mon.moves[0]], MOVES[mon.moves[1]]];
  }
  return movesOf(mon.sp);
}
