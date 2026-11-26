// 🏡 v49 — Casa por dentro: móveis (ouro), papel de parede/piso, companheiro + Pokémon favorito, Fogão e comidas com buff.
// Tudo comprado com OURO (ajuda a gastar o ouro que sobra). As comidas são feitas com ingredientes da Fazenda
// (frutas da Horta + leite/ovo/mel que alguns Pokémon dão no ❤️ Carinho) e levadas na partida pela 🎒 Mochila.
import { TYPES, TYPE_LABELS } from '../rules/types.js';

export const ROOM_W = 12, ROOM_H = 7, HOME_MAX = 40, PART_MAX = 80; // v61: paredes internas têm limite próprio
export const furnMax = id => FURNITURE[id]?.max || 5;

export const FURNITURE = {
  chair: { name: 'Cadeira', icon: '🪑', price: 800 },
  plant: { name: 'Vaso de planta', icon: '🪴', price: 600 },
  lamp: { name: 'Abajur', icon: '💡', price: 1000, glow: true },
  rug: { name: 'Tapete', icon: '🟫', price: 1200, floor: true },
  partition: { name: 'Parede (10 pedaços)', icon: '🧱', price: 500, part: true, pack: 10, max: 80, desc: 'Monte cômodos: cada pedaço ocupa 1 quadradinho e usa a cor da parede. Não conta no limite de móveis.' },
  window: { name: 'Janela', icon: '🪟', price: 1500, wall: true },
  table: { name: 'Mesa', icon: '🍽️', price: 1500 },
  bed: { name: 'Cama', icon: '🛏️', price: 2000 },
  toybox: { name: 'Baú de brinquedos', icon: '🧸', price: 2000, perk: 'play', desc: 'Brincar com o favorito dá o dobro de XP.' },
  sofa: { name: 'Sofá', icon: '🛋️', price: 2500 },
  clock: { name: 'Relógio de parede', icon: '🕰️', price: 2500, wall: true },
  painting: { name: 'Quadro', icon: '🖼️', price: 3000, wall: true },
  books: { name: 'Estante de livros', icon: '📚', price: 3000 },
  bath: { name: 'Banheira', icon: '🛁', price: 4000 },
  fridge: { name: 'Geladeira', icon: '🧊', price: 5000, perk: 'queue', desc: '+1 prato cozinhando ao mesmo tempo.' },
  tv: { name: 'TV', icon: '📺', price: 5000, glow: true },
  stove: { name: 'Fogão', icon: '🍳', price: 6000, perk: 'cook', desc: 'Libera a cozinha: pratos com buff para as partidas.' },
  fireplace: { name: 'Lareira', icon: '🔥', price: 7000, glow: true, perk: 'cozy', desc: 'Conversar com o companheiro dá o dobro de laço.' },
  aquarium: { name: 'Aquário', icon: '🐠', price: 8000 },
  trophies: { name: 'Estante de troféus', icon: '🏆', price: 10000 },
  piano: { name: 'Piano', icon: '🎹', price: 12000 },
  arcade: { name: 'Fliperama', icon: '🕹️', price: 15000, glow: true }
};
export const WALLS = {
  plain: { name: 'Bege', price: 0, css: 'linear-gradient(#e9dcc3, #d8c7a6)' },
  wood: { name: 'Madeira', price: 3000, css: 'repeating-linear-gradient(90deg, #8a5a33 0 22px, #7a4e2b 22px 24px)' },
  pastel: { name: 'Listras pastel', price: 3000, css: 'repeating-linear-gradient(90deg, #ffd9e8 0 18px, #e6f3ff 18px 36px)' },
  night: { name: 'Céu estrelado', price: 6000, css: 'radial-gradient(circle at 20% 30%, #fff 1px, transparent 2px) 0 0 / 40px 40px, radial-gradient(circle at 70% 60%, #fff8 1px, transparent 2px) 0 0 / 55px 55px, linear-gradient(#141a3d, #2b2160)' },
  pokeball: { name: 'Pokébolas', price: 8000, css: 'radial-gradient(circle, #fff 18%, #222 19% 23%, transparent 24%) 0 0 / 46px 46px, linear-gradient(#e94b4b, #c73a3a)' }
};
export const FLOORS = {
  wood: { name: 'Taco de madeira', price: 0, css: 'repeating-linear-gradient(0deg, #a8743f 0 28px, #93632f 28px 30px)' },
  tile: { name: 'Azulejo', price: 2500, css: 'repeating-conic-gradient(#e9e9ef 0 25%, #c9cbd6 0 50%) 0 0 / 48px 48px' },
  carpet: { name: 'Carpete', price: 3000, css: 'linear-gradient(#5e7fb8, #4b6aa0)' },
  grass: { name: 'Grama', price: 4000, css: 'repeating-linear-gradient(45deg, #5cb85c 0 10px, #4fa94f 10px 20px)' },
  marble: { name: 'Mármore', price: 8000, css: 'linear-gradient(135deg, #f4f1ea 0%, #ddd6c8 40%, #f4f1ea 60%, #cfc6b4 100%)' }
};

// 🥛🥚🍯 o que alguns Pokémon dão quando recebem ❤️ Carinho (garantido por espécie; por tipo é sorte)
export const PRODUCE_BY_SP = {
  miltank: 'leite', tauros: 'leite', skiddo: 'leite', gogoat: 'leite', bouffalant: 'leite', mareep: 'leite',
  chansey: 'ovo', blissey: 'ovo', happiny: 'ovo', togepi: 'ovo', togetic: 'ovo', exeggcute: 'ovo', torchic: 'ovo',
  combee: 'mel', vespiquen: 'mel', cutiefly: 'mel', ribombee: 'mel', teddiursa: 'mel', ursaring: 'mel', heracross: 'mel', burmy: 'mel'
};
export const PRODUCE_BY_TYPE = { normal: 'leite', flying: 'ovo', bug: 'mel', fairy: 'mel' };
export const PRODUCE_TYPE_CHANCE = 0.25;

// 🍽️ comidas: viram item da Mochila (kind 'meal'); leve 1 por partida (modo Coleção). Gasta ao começar a partida.
export const MEALS = {
  shiny_cake: { name: 'Bolo Brilhante', emoji: '🍰', hours: 12, in: { farinha: 2, ovo: 2, leite: 1, mel: 1, starf: 1 }, desc: 'Nesta partida: chance de shiny ×2 nos Pokémon selvagens.' },
  iv_pancake: { name: 'Panqueca do Potencial', emoji: '🥞', hours: 8, in: { farinha: 2, ovo: 1, leite: 2, lum: 2 }, desc: 'Nesta partida: os selvagens nascem com potencial melhor (cada IV no mínimo 12 de 31).' },
  curry: { name: 'Curry de Tipo', emoji: '🍛', hours: 6, in: { oran: 3, razz: 2, sitrus: 2 }, type: true, desc: 'Escolha o tipo. Nesta partida: golpes desse tipo +15% e mais Pokémon desse tipo aparecem.' },
  bond_pudding: { name: 'Pudim da Amizade', emoji: '🍮', hours: 6, in: { leite: 2, ovo: 2, mel: 1, pecha: 2 }, desc: 'Nesta partida: o laço com o companheiro cresce em dobro.' },
  xp_shake: { name: 'Vitamina Turbo', emoji: '🥤', hours: 4, in: { leite: 2, sitrus: 2, mel: 1 }, desc: 'Nesta partida: +30% de XP nas batalhas.' },
  // 🍲 v55: não é comida de partida — dá o ✨ Fator Gigantamax a um Pokémon da Coleção. Cogumelos Max vêm de Raids Gigantamax.
  max_soup: { name: 'Sopa Max', emoji: '🍲', hours: 24, in: { leite: 2, ovo: 2, mel: 2, lum: 2 }, bagIn: { max_mushroom: 3 }, soup: true, desc: 'Dê a um Pokémon com forma Gigantamax (Coleção → 🎒): ele ganha o ✨ Fator Gigantamax para sempre.' }
};
export const CURRY_MULT = 1.15, XP_SHAKE_MULT = 1.3, IV_PANCAKE_MIN = 12, SHINY_CAKE_MULT = 2;
/** Ids dos itens de comida (curry vira curry_<tipo>). */
export const MEAL_ITEMS = {};
for (const [id, m] of Object.entries(MEALS)) {
  if (m.type) for (const t of TYPES) MEAL_ITEMS[`curry_${t}`] = { meal: id, type: t, name: `Curry ${TYPE_LABELS[t]}`, emoji: m.emoji, desc: `Nesta partida: golpes do tipo ${TYPE_LABELS[t]} +15% e mais Pokémon ${TYPE_LABELS[t]} aparecem.` };
  else MEAL_ITEMS[id] = { meal: id, name: m.name, emoji: m.emoji, desc: m.desc, ...(m.soup ? { soup: true } : {}) };
}
export const TALK_BOND = 5, PLAY_XP = 300;
export const cookQueue = home => 1 + (home?.placed?.some(p => p.f === 'fridge') ? 1 : 0);
export const hasPlaced = (home, f) => !!home?.placed?.some(p => p.f === f);
