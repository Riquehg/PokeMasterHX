// Golpes — cada Pokémon tem 2 golpes definidos pela tipagem e pelo papel:
//  1º golpe: golpe rápido do 1º tipo (nunca erra).
//  2º golpe: golpe forte do 2º tipo (ou do 1º, se tiver um tipo só) — erra no 🎲1.
//            Pokémon de suporte trocam o golpe forte por um golpe de suporte (cura, fortalecer, intimidar, dreno).
// Nomes oficiais em inglês (como aparecem nos jogos).
import { getSpecies } from './pokemon.js';

// [rápido, forte] por tipo
const BY_TYPE = {
  normal:   ['Tackle', 'Body Slam'],
  fire:     ['Ember', 'Flamethrower'],
  water:    ['Water Gun', 'Surf'],
  grass:    ['Razor Leaf', 'Energy Ball'],
  electric: ['Thunder Shock', 'Thunderbolt'],
  ice:      ['Powder Snow', 'Ice Beam'],
  fighting: ['Karate Chop', 'Close Combat'],
  poison:   ['Poison Sting', 'Sludge Bomb'],
  ground:   ['Mud-Slap', 'Earthquake'],
  flying:   ['Gust', 'Air Slash'],
  psychic:  ['Confusion', 'Psychic'],
  bug:      ['Bug Bite', 'X-Scissor'],
  rock:     ['Rock Throw', 'Stone Edge'],
  ghost:    ['Lick', 'Shadow Ball'],
  dragon:   ['Dragon Breath', 'Dragon Pulse'],
  dark:     ['Bite', 'Crunch'],
  steel:    ['Metal Claw', 'Iron Head'],
  fairy:    ['Fairy Wind', 'Moonblast']
};

export const QUICK_POWER = 1.0;
export const STRONG_POWER = 1.4;
export const STAB = 1.2; // golpe do mesmo tipo do Pokémon

// Golpes de suporte (por papel)
export const SUPPORT = {
  healer:   { name: 'Recover',      kind: 'heal',   type: 'normal', desc: 'Recupera 40% do HP' },
  buffer:   { name: 'Swords Dance', kind: 'buff',   type: 'normal', desc: 'Ataque +40% (acumula até 2x)' },
  debuffer: { name: 'Intimidate',   kind: 'debuff', type: 'dark',   desc: 'Ataque do rival −30% (acumula até 2x)' },
  drainer:  { name: 'Giga Drain',   kind: 'drain',  type: 'grass',  desc: 'Dano e recupera metade do dano', power: 1.0 }
};

export const ROLE_LABELS = { healer: 'Curandeiro', buffer: 'Fortalecedor', debuffer: 'Intimidador', drainer: 'Drenador' };

const cache = {};

/** Os 2 golpes de uma espécie. */
export function movesOf(speciesId) {
  if (cache[speciesId]) return cache[speciesId];
  const sp = getSpecies(speciesId);
  if (!sp) return [];
  const [t1, t2] = sp.types;
  const quick = { name: BY_TYPE[t1][0], kind: 'dmg', type: t1, power: QUICK_POWER, desc: 'Golpe rápido, nunca erra' };
  let second;
  if (sp.role && SUPPORT[sp.role]) {
    second = { ...SUPPORT[sp.role] };
    if (sp.role === 'drainer') {
      const ty = sp.types.includes('grass') ? 'grass' : sp.types.includes('bug') ? 'bug' : t1;
      second = { ...second, type: ty, name: ty === 'grass' ? 'Giga Drain' : ty === 'bug' ? 'Leech Life' : 'Drain Punch' };
    }
  } else {
    const ty = t2 || t1;
    second = { name: BY_TYPE[ty][1], kind: 'dmg', type: ty, power: STRONG_POWER, risky: true, desc: 'Golpe forte, erra no 🎲1' };
  }
  return (cache[speciesId] = [quick, second]);
}
