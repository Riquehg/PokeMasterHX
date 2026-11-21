import { MEGAS } from './megas.js';
import { SPECIES } from './pokemon.js';
// Itens. Só entra aqui o que tem efeito implementado no motor (shared/engine.js).
// minTier: a partir de que tier de cidade o item aparece na loja (0 = não vende).
// image: arquivo dentro do bucket "sprites/items/" do Supabase (fallback no front se não existir).

export const ITEMS = {
  // --- Pokébolas ---
  poke_ball:    { name: 'Poké Ball',    kind: 'ball', bonus: 0, price: 100,  minTier: 1, image: 'poke_ball.png',    desc: 'Pokébola padrão. Sem bônus.' },
  great_ball:   { name: 'Great Ball',   kind: 'ball', bonus: 1, price: 300,  minTier: 2, image: 'great_ball.png',   desc: '+1 na rolagem de captura.' },
  ultra_ball:   { name: 'Ultra Ball',   kind: 'ball', bonus: 2, price: 600,  minTier: 3, image: 'ultra_ball.png',   desc: '+2 na rolagem de captura.' },
  trust_ball:   { name: 'Bola da Confiança', kind: 'ball', bonus: 0, trust: true, price: 0, minTier: 0, image: 'trust_ball.png', desc: 'Raríssima, com chance normal de captura. Quem for capturado nela confia em você e obedece sem precisar de insígnias — inclusive lendários.' },
  master_ball:  { name: 'Master Ball',  kind: 'ball', bonus: 99, price: 0,   minTier: 0, image: 'master_ball.png',  desc: 'Captura garantida. Só aparece em eventos raros.' },
  // Bolas temáticas do projeto original — agora com efeito real por tipo, e dão "aura" visual ao Pokémon capturado.
  flame_ball:   { name: 'Flame Ball',   kind: 'ball', bonus: 1, typeBonus: { types: ['fire', 'grass', 'bug', 'ice'], bonus: 3 },        price: 450, minTier: 3, aura: 'flame',   image: 'flame_ball.png',   desc: '+3 contra Fogo, Grama, Inseto e Gelo. +1 nos demais.' },
  aqua_ball:    { name: 'Aqua Ball',    kind: 'ball', bonus: 1, typeBonus: { types: ['water', 'ice', 'ground', 'rock'], bonus: 3 },     price: 450, minTier: 3, aura: 'aqua',    image: 'aqua_ball.png',    desc: '+3 contra Água, Gelo, Terra e Pedra. +1 nos demais.' },
  volt_ball:    { name: 'Volt Ball',    kind: 'ball', bonus: 1, typeBonus: { types: ['electric', 'steel', 'flying'], bonus: 3 },        price: 450, minTier: 3, aura: 'volt',    image: 'electric_ball.png',desc: '+3 contra Elétrico, Aço e Voador. +1 nos demais.' },
  shadow_ball:  { name: 'Shadow Ball',  kind: 'ball', bonus: 1, typeBonus: { types: ['ghost', 'dark', 'poison'], bonus: 3 },            price: 450, minTier: 3, aura: 'shadow',  image: 'shadow_ball.png',  desc: '+3 contra Fantasma, Sombrio e Veneno. +1 nos demais.' },
  mystic_ball:  { name: 'Mystic Ball',  kind: 'ball', bonus: 1, typeBonus: { types: ['psychic', 'fairy', 'dragon'], bonus: 3 },         price: 450, minTier: 3, aura: 'mystic',  image: 'mystic_ball.png',  desc: '+3 contra Psíquico, Fada e Dragão. +1 nos demais.' },
  rainbow_ball: { name: 'Rainbow Ball', kind: 'ball', bonus: 3, price: 1500, minTier: 4, aura: 'rainbow', image: 'rainbow_ball.png', desc: '+3 em qualquer captura e aura prismática.' },

  // --- Cura e batalha ---
  potion:       { name: 'Potion',       kind: 'heal', healPct: 0.4, price: 80,   minTier: 1, image: 'potion.png',       desc: 'Recupera 40% do HP de um Pokémon.' },
  full_heal:    { name: 'Full Heal',    kind: 'cure', price: 150,  minTier: 1, image: 'full_heal.png',    desc: 'Cura queimadura, veneno, paralisia, sono e congelamento (em batalha).' },
  super_potion: { name: 'Super Potion', kind: 'heal', healPct: 0.75, price: 220, minTier: 2, image: 'potion.png', desc: 'Recupera 75% do HP de um Pokémon.' },
  revive:       { name: 'Revive',       kind: 'revive', healPct: 0.5, price: 450, minTier: 2, image: 'revive.png',      desc: 'Revive um Pokémon desmaiado com 50% do HP.' },
  x_attack:     { name: 'X Attack',     kind: 'boost', atk: 3, price: 250,   minTier: 2, image: 'x_attack.png',     desc: '+3 de ataque para o Pokémon ativo até o fim da batalha.' },

  // --- Progressão ---
  rare_candy:      { name: 'Rare Candy',      kind: 'candy', price: 900,  minTier: 4, image: 'rare_candy.png',      desc: 'Sobe 1 nível (pode evoluir).' },
  evolution_stone: { name: 'Pedra Evolutiva', kind: 'stone', price: 1200, minTier: 3, image: 'evolution_stone.png', desc: 'Evolui na hora um Pokémon que tenha evolução.' },
  shiny_charm:     { name: 'Amuleto Shiny',   kind: 'charm', price: 0, minTier: 0, image: 'shiny_charm.png',     desc: 'Passivo: triplica a chance de encontrar shinies. Não acumula. Não é vendido nas cidades: vem de Raids lendárias e eventos raros (e fica na Mochila da conta).' },
  tm:              { name: 'TM',              kind: 'tm', price: 0, minTier: 0, image: 'tm.png',                   desc: 'Ensina um novo 2º golpe a um Pokémon (escolha entre os golpes dos tipos dele). Raro: Raids e eventos. Fica na Mochila da conta e pode ser vendido no Mercado.' },

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

// ---------------------------------------------------------------- 🎒 Mochila da conta
// O que sobra na mochila no fim de uma partida salva vai para a Mochila da conta — mas só itens que não
// desequilibram o começo de uma partida (Pokébolas, Amuleto Shiny e TM). Poções, Revive, X Attack, doces,
// pedras e itens de tabuleiro são da partida e somem no fim.
// 💎 Megapedras e Fragmentos (geradas da lista de Megas). Ficam na Mochila da conta e podem ir ao Mercado; não vão para a partida.
for (const m of Object.values(MEGAS)) {
  ITEMS[`ms_${m.key}`] = { name: m.stoneName, kind: 'megastone', price: 0, minTier: 0, image: `megastones/${m.stone}.png`, mega: m.key, desc: `Megapedra: segurada por ${SPECIES[m.base]?.name || m.base}, deixa virar ${m.name} na batalha (precisa do 🔗 Bracelete Mega).` };
  ITEMS[`mf_${m.key}`] = { name: `Fragmento de ${m.stoneName}`, kind: 'fragment', price: 0, minTier: 0, image: `megastones/${m.stone}.png`, mega: m.key, desc: `10 fragmentos + recursos na 🔨 Oficina viram a ${m.stoneName}. Vêm de Mega Raids e de encontros com energia Mega.` };
}
ITEMS.mega_bracelet = { name: 'Bracelete Mega', kind: 'key', price: 0, minTier: 0, image: 'mega-bracelet.png', desc: 'Permite Mega Evoluir. Só cai em Mega Raids (raríssimo) e não pode ser trocado.' };

export const KEEP_KINDS = ['ball', 'charm', 'tm', 'megastone', 'fragment'];
export const isKeepable = id => !!ITEMS[id] && KEEP_KINDS.includes(ITEMS[id].kind);
export const BAG_MAX_PER_ITEM = 99;
/** Quanto de cada item dá para levar para uma partida (modo Coleção). */
export function bringLimit(id) {
  const it = ITEMS[id];
  if (!it || !isKeepable(id) || it.kind === 'megastone' || it.kind === 'fragment') return 0;
  if (id === 'master_ball') return 1;
  if (it.kind === 'charm') return 1;
  if (it.kind === 'tm') return 3;
  return 10; // Pokébolas
}
export const BRING_BALLS_MAX = 20; // total de Pokébolas levadas
/** Limpa e limita a lista de itens levados { id: qtd }. */
export function cleanBring(bring, bag = null) {
  const out = {};
  let balls = 0;
  for (const [id, q0] of Object.entries(bring && typeof bring === 'object' ? bring : {})) {
    let q = Math.max(0, Math.min(bringLimit(id), Math.floor(Number(q0) || 0)));
    if (bag) q = Math.min(q, bag[id] || 0);
    if (ITEMS[id]?.kind === 'ball') { q = Math.min(q, BRING_BALLS_MAX - balls); balls += q; }
    if (q > 0) out[id] = q;
  }
  return out;
}
export const STARTING_GOLD = 500;
