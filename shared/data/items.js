// Itens. Só entra aqui o que tem efeito implementado no motor (shared/engine.js).
// minTier: a partir de que tier de cidade o item aparece na loja (0 = não vende).
// image: arquivo dentro do bucket "sprites/items/" do Supabase (fallback no front se não existir).

export const ITEMS = {
  // --- Pokébolas ---
  poke_ball:    { name: 'Poké Ball',    kind: 'ball', bonus: 0, price: 100,  minTier: 1, image: 'poke_ball.png',    desc: 'Pokébola padrão. Sem bônus.' },
  great_ball:   { name: 'Great Ball',   kind: 'ball', bonus: 1, price: 300,  minTier: 2, image: 'great_ball.png',   desc: '+1 na rolagem de captura.' },
  ultra_ball:   { name: 'Ultra Ball',   kind: 'ball', bonus: 2, price: 600,  minTier: 3, image: 'ultra_ball.png',   desc: '+2 na rolagem de captura.' },
  master_ball:  { name: 'Master Ball',  kind: 'ball', bonus: 99, price: 0,   minTier: 0, image: 'master_ball.png',  desc: 'Captura garantida. Só aparece em eventos raros.' },
  // Bolas temáticas do projeto original — agora com efeito real por tipo, e dão "aura" visual ao Pokémon capturado.
  flame_ball:   { name: 'Flame Ball',   kind: 'ball', bonus: 1, typeBonus: { types: ['fire', 'grass', 'bug', 'ice'], bonus: 3 },        price: 450, minTier: 3, aura: 'flame',   image: 'ball_flame.png',   desc: '+3 contra Fogo, Grama, Inseto e Gelo. +1 nos demais.' },
  aqua_ball:    { name: 'Aqua Ball',    kind: 'ball', bonus: 1, typeBonus: { types: ['water', 'ice', 'ground', 'rock'], bonus: 3 },     price: 450, minTier: 3, aura: 'aqua',    image: 'ball_aqua.png',    desc: '+3 contra Água, Gelo, Terra e Pedra. +1 nos demais.' },
  volt_ball:    { name: 'Volt Ball',    kind: 'ball', bonus: 1, typeBonus: { types: ['electric', 'steel', 'flying'], bonus: 3 },        price: 450, minTier: 3, aura: 'volt',    image: 'ball_electric.png',desc: '+3 contra Elétrico, Aço e Voador. +1 nos demais.' },
  shadow_ball:  { name: 'Shadow Ball',  kind: 'ball', bonus: 1, typeBonus: { types: ['ghost', 'dark', 'poison'], bonus: 3 },            price: 450, minTier: 3, aura: 'shadow',  image: 'ball_shadow.png',  desc: '+3 contra Fantasma, Sombrio e Veneno. +1 nos demais.' },
  mystic_ball:  { name: 'Mystic Ball',  kind: 'ball', bonus: 1, typeBonus: { types: ['psychic', 'fairy', 'dragon'], bonus: 3 },         price: 450, minTier: 3, aura: 'mystic',  image: 'ball_mystic.png',  desc: '+3 contra Psíquico, Fada e Dragão. +1 nos demais.' },
  rainbow_ball: { name: 'Rainbow Ball', kind: 'ball', bonus: 3, price: 1500, minTier: 4, aura: 'rainbow', image: 'ball_rainbow.png', desc: '+3 em qualquer captura e aura prismática.' },

  // --- Cura e batalha ---
  potion:       { name: 'Potion',       kind: 'heal', healPct: 0.4, price: 80,   minTier: 1, image: 'potion.png',       desc: 'Recupera 40% do HP de um Pokémon.' },
  super_potion: { name: 'Super Potion', kind: 'heal', healPct: 0.75, price: 220, minTier: 2, image: 'super_potion.png', desc: 'Recupera 75% do HP de um Pokémon.' },
  revive:       { name: 'Revive',       kind: 'revive', healPct: 0.5, price: 450, minTier: 2, image: 'revive.png',      desc: 'Revive um Pokémon desmaiado com 50% do HP.' },
  x_attack:     { name: 'X Attack',     kind: 'boost', atk: 3, price: 250,   minTier: 2, image: 'x_attack.png',     desc: '+3 de ataque para o Pokémon ativo até o fim da batalha.' },

  // --- Progressão ---
  rare_candy:      { name: 'Rare Candy',      kind: 'candy', price: 900,  minTier: 4, image: 'rare_candy.png',      desc: 'Sobe 1 nível (pode evoluir).' },
  evolution_stone: { name: 'Pedra Evolutiva', kind: 'stone', price: 1200, minTier: 3, image: 'evolution_stone.png', desc: 'Evolui na hora um Pokémon que tenha evolução.' },
  shiny_charm:     { name: 'Amuleto Shiny',   kind: 'charm', price: 3000, minTier: 4, image: 'shiny_charm.png',     desc: 'Passivo: triplica a chance de encontrar shinies. Não acumula.' },

  // --- Tabuleiro ---
  bicycle:     { name: 'Bicicleta',  kind: 'move_bonus', bonus: 2, price: 200, minTier: 1, image: 'bicycle.png',     desc: 'Use antes de rolar: +2 casas no próximo movimento.' },
  escape_rope: { name: 'Corda de Fuga', kind: 'escape',  price: 150, minTier: 1, image: 'escape_rope.png', desc: 'Volta para a última cidade visitada (fora de batalha).' },
  fly:         { name: 'HM Voar',    kind: 'fly',        price: 500, minTier: 3, image: 'fly.png',         desc: 'Voa para qualquer cidade já visitada.' }
};

export function getItem(id) {
  return ITEMS[id] || null;
}

export function ballBonusAgainst(ballId, targetTypes) {
  const it = ITEMS[ballId];
  if (!it || it.kind !== 'ball') return 0;
  if (it.typeBonus && targetTypes.some(t => it.typeBonus.types.includes(t))) return it.typeBonus.bonus;
  return it.bonus;
}

export function shopFor(cityTier) {
  return Object.entries(ITEMS)
    .filter(([, it]) => it.minTier > 0 && it.minTier <= cityTier && it.price > 0)
    .map(([id, it]) => ({ id, ...it }));
}

export const STARTING_ITEMS = { poke_ball: 5, potion: 2 };
export const STARTING_GOLD = 500;
