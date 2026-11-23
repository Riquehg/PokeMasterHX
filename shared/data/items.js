import { MEGAS } from './megas.js';
import { SPECIES } from './pokemon.js';
import { GEAR } from './battlegear.js';
import { MEAL_ITEMS } from './home.js';
import { BAND_ID, SOUP_ID, MUSHROOM_ID } from './gmax.js';
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
  evolution_stone: { name: 'Pedra Evolutiva', kind: 'stone', price: 0, minTier: 0, image: 'evolution_stone.png', desc: 'Raríssima: evolui na hora QUALQUER Pokémon que tenha evolução (até os que precisam de pedra ou item especial).' },
  legend_charm:    { name: 'Amuleto Lendário', kind: 'charm', price: 0, minTier: 0, emoji: '🏵️', desc: 'Vale 1 SEMANA: ative na 🎒 Mochila da conta (ou leve na partida — ativa sozinho quando você passa do limite). Enquanto estiver ativo, não há limite de lendários das casas Amarelas em nenhuma partida. Ativar outro soma +7 dias. Feito na 🔨 Oficina ou na Loja PB da Torre.' },
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

// 🔴 Gigantamax (v55)
ITEMS[BAND_ID] = { name: 'Pulseira Dynamax', kind: 'key', price: 0, minTier: 0, image: 'dynamax_band.png', emoji: '🔴', desc: 'Permite Gigantamax (no lugar da Mega, 1 vez por batalha). Só cai em Raids Gigantamax (raríssimo) e não pode ser trocada.' };
ITEMS[MUSHROOM_ID] = { name: 'Cogumelo Max', kind: 'ingredient', price: 0, minTier: 0, image: 'max_mushroom.png', emoji: '🍄', desc: 'Ingrediente da 🍲 Sopa Max (🍳 cozinha da casa). Vem de Raids Gigantamax.' };
ITEMS[SOUP_ID] = { name: 'Sopa Max', kind: 'soup', price: 0, minTier: 0, image: 'max_soup.png', emoji: '🍲', desc: 'Dê a um Pokémon da Coleção que tenha forma Gigantamax: ele ganha o ✨ Fator Gigantamax para sempre.' };

// ⚔️ Itens de batalha (segurados): vêm da 🔨 Oficina, ficam na Mochila da conta e vão para o Pokémon pelo botão 🎒 da Coleção.
for (const [id, g] of Object.entries(GEAR)) ITEMS[id] = { name: g.name, kind: 'gear', price: 0, minTier: 0, emoji: g.emoji, plate: g.plate || null, desc: `Item de batalha (segurado): ${g.desc}` };

// 🍽️ comidas da casa (v49): levar 1 por partida; o efeito vale a partida inteira
for (const [id, m] of Object.entries(MEAL_ITEMS)) if (!m.soup) ITEMS[id] = { name: m.name, kind: 'meal', price: 0, minTier: 0, emoji: m.emoji, meal: m.meal, mealType: m.type || null, desc: `Comida (leve 1 por partida): ${m.desc}` };

// ✨ Itens de evolução (v54) — cada um evolui só os Pokémon certos, como nos jogos. image = items/<id>.png
// grupo: 'stone' (pedras elementais, lojas Azuis+), 'trade' (itens de troca e Cabo de Conexão, lojas Vermelhas+), 'rare' (Gen 8–9, lojas Amarelas)
export const EVO_ITEMS = {
  fire_stone: ['Pedra do Fogo', 'stone', '🔥'], water_stone: ['Pedra da Água', 'stone', '💧'], thunder_stone: ['Pedra do Trovão', 'stone', '⚡'],
  leaf_stone: ['Pedra da Folha', 'stone', '🍃'], moon_stone: ['Pedra da Lua', 'stone', '🌙'], sun_stone: ['Pedra do Sol', 'stone', '☀️'],
  ice_stone: ['Pedra do Gelo', 'stone', '❄️'], shiny_stone: ['Pedra Brilhante', 'stone', '✨'], dusk_stone: ['Pedra do Crepúsculo', 'stone', '🌆'],
  dawn_stone: ['Pedra da Alvorada', 'stone', '🌅'],
  linking_cord: ['Cabo de Conexão', 'trade', '🔗', 'Faz evoluir quem nos jogos evolui por troca (Kadabra, Machoke, Graveler, Haunter, Boldore, Gurdurr, Phantump, Pumpkaboo, Karrablast, Shelmet).'],
  kings_rock: ['Pedra do Rei', 'trade', '👑'], metal_coat: ['Revestimento Metálico', 'trade', '🔩'], dragon_scale: ['Escama de Dragão', 'trade', '🐉'],
  up_grade: ['Melhoria', 'trade', '💾'], protector: ['Protetor', 'trade', '🛡️'], electirizer: ['Eletrizador', 'trade', '🔌'], magmarizer: ['Magmatizador', 'trade', '🌋'],
  dubious_disc: ['Disco Duvidoso', 'trade', '💿'], reaper_cloth: ['Pano Ceifador', 'trade', '🧣'], deep_sea_tooth: ['Dente do Mar Profundo', 'trade', '🦷'],
  deep_sea_scale: ['Escama do Mar Profundo', 'trade', '🐚'], prism_scale: ['Escama Prisma', 'trade', '🌈'], whipped_dream: ['Chantili', 'trade', '🍦'],
  sachet: ['Sachê', 'trade', '🌸'], razor_claw: ['Garra Afiada', 'trade', '🗡️'], razor_fang: ['Presa Afiada', 'trade', '🦴'], oval_stone: ['Pedra Oval', 'trade', '🥚'],
  tart_apple: ['Maçã Azeda', 'rare', '🍏'], sweet_apple: ['Maçã Doce', 'rare', '🍎'], syrupy_apple: ['Maçã Melada', 'rare', '🍯'],
  strawberry_sweet: ['Doce de Morango', 'rare', '🍓'], cracked_pot: ['Bule Rachado', 'rare', '🫖'], unremarkable_teacup: ['Xícara Comum', 'rare', '🍵'],
  galarica_cuff: ['Bracelete Galárico', 'rare', '📿'], galarica_wreath: ['Coroa Galárica', 'rare', '🌿'],
  scroll_of_darkness: ['Pergaminho das Trevas', 'rare', '📜'], scroll_of_waters: ['Pergaminho das Águas', 'rare', '📜'],
  auspicious_armor: ['Armadura Auspiciosa', 'rare', '🛡️'], malicious_armor: ['Armadura Maliciosa', 'rare', '🗡️'],
  black_augurite: ['Augurita Negra', 'rare', '🪨'], peat_block: ['Bloco de Turfa', 'rare', '🟫'], metal_alloy: ['Liga Metálica', 'rare', '⚙️']
};
export const EVO_GROUP = { stone: { price: 1500, minTier: 3 }, trade: { price: 2500, minTier: 4 }, rare: { price: 3500, minTier: 5 } };
// quem cada item evolui (para a descrição)
const evoUsers = {};
for (const s of Object.values(SPECIES)) for (const e of s.evos || []) if (e.item) (evoUsers[e.item] ||= []).push(s.name);
for (const [id, [name, group, emoji, extra]] of Object.entries(EVO_ITEMS)) {
  const who = [...new Set(evoUsers[id] || [])];
  ITEMS[id] = { name, kind: 'stone', evo: group, emoji, price: EVO_GROUP[group].price, minTier: EVO_GROUP[group].minTier, image: `${id}.png`,
    desc: extra || `Item de evolução. Evolui: ${who.slice(0, 12).join(', ')}${who.length > 12 ? '…' : ''}.` };
}
/** Sorteia um item de evolução (pedras mais comuns); se `useful` tiver itens que o time usa, eles pesam 4×. */
export function pickEvoItem(rng, useful = []) {
  const w = { stone: 6, trade: 3, rare: 1 };
  return rng.weighted(Object.entries(EVO_ITEMS).map(([id, [, g]]) => [id, w[g] * (useful.includes(id) ? 4 : 1)]));
}

export const KEEP_KINDS = ['ball', 'charm', 'tm', 'megastone', 'fragment', 'gear', 'meal', 'stone', 'ingredient', 'soup'];
export const isKeepable = id => !!ITEMS[id] && KEEP_KINDS.includes(ITEMS[id].kind);
export const BAG_MAX_PER_ITEM = 99;
/** Quanto de cada item dá para levar para uma partida (modo Coleção). */
export function bringLimit(id) {
  const it = ITEMS[id];
  if (!it || !isKeepable(id) || ['megastone', 'fragment', 'gear', 'ingredient', 'soup'].includes(it.kind)) return 0;
  if (id === 'master_ball') return 1;
  if (it.kind === 'charm') return 1;
  if (it.kind === 'meal') return 1;
  if (it.kind === 'tm') return 3;
  if (it.kind === 'stone') return 3;  // ✨ itens de evolução (v54)
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
    if (ITEMS[id]?.kind === 'meal') { if (Object.keys(out).some(k => ITEMS[k]?.kind === 'meal')) q = 0; else q = Math.min(q, 1); } // 🍽️ só 1 comida por partida
    if (q > 0) out[id] = q;
  }
  return out;
}
export const STARTING_GOLD = 500;
