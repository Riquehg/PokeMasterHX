// Missões da partida: cada treinador tem 3 missões fixadas; completou, ganha o prêmio e recebe uma nova.
// Prêmios: companheiros (ficam na conta), itens ou ouro.
export const ACTIVE_MISSIONS = 3;
export const MAX_MISSIONS_PER_MATCH = 12;

// Tipos fáceis de achar no começo (para as missões serem possíveis)
export const MISSION_TYPES = ['water', 'grass', 'fire', 'bug', 'normal', 'flying', 'poison', 'electric', 'ground', 'rock', 'fighting', 'psychic', 'ghost', 'ice', 'dragon', 'dark', 'steel', 'fairy'];

/** Modelos de missão. n = quantidade; reward = prêmio. */
export const MISSION_TEMPLATES = [
  { id: 'catch_type', weight: 5, text: 'Capture {n} Pokémon do tipo {T}', n: [2, 3], typed: true, reward: 'companion' },
  { id: 'ko_type',    weight: 4, text: 'Derrote {n} Pokémon do tipo {T}', n: [3, 4], typed: true, reward: 'companion' },
  { id: 'catch_any',  weight: 3, text: 'Capture {n} Pokémon',             n: [4, 5], reward: { items: { great_ball: 3, potion: 2 } } },
  { id: 'trainer_win',weight: 3, text: 'Vença {n} batalhas contra treinadores', n: [2, 3], reward: { companion: 'rocket', gold: 300 } },
  { id: 'badge',      weight: 2, text: 'Conquiste {n} insígnia(s)',        n: [1, 1], reward: { companion: 'joy', items: { super_potion: 2 } } },
  { id: 'evolve',     weight: 2, text: 'Evolua {n} Pokémon',               n: [1, 2], reward: { companion: 'oak', items: { rare_candy: 1 } } },
  { id: 'catch_tier', weight: 2, text: 'Capture {n} Pokémon de tier 3 ou maior', n: [1, 2], reward: { items: { ultra_ball: 3, full_heal: 2 } } },
  { id: 'raid',       weight: 1, text: 'Derrote {n} lendário(s) numa Raid', n: [1, 1], reward: { companion: 'lance', gold: 800 } }
];
