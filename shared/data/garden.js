// 🌱 Horta e Construções da Fazenda (Fazenda 2.0).
// Planta (ouro) → espera (horas reais) → colhe. Os Pokémon trabalham: Água rega sozinha, Planta acelera a horta,
// Lutador/Normal tocam o Moinho, Fogo cuida da Cozinha. Moinho: trigo → farinha. Cozinha: farinha + baga → Poffins
// (itens da Fazenda). Tudo calculado pelo tempo, sem servidor rodando sozinho.

export const CROPS = {
  trigo:   { name: 'Trigo',      icon: '🌾', hours: 3,  yield: [3, 4], cost: 20,  lvl: 1 },
  oran:    { name: 'Baga Oran',  icon: '🫐', hours: 4,  yield: [2, 3], cost: 40,  lvl: 1 },
  pecha:   { name: 'Baga Pecha', icon: '🍑', hours: 6,  yield: [2, 3], cost: 60,  lvl: 2 },
  razz:    { name: 'Baga Razz',  icon: '🍇', hours: 8,  yield: [2, 3], cost: 90,  lvl: 4 },
  abobora: { name: 'Abóbora',    icon: '🎃', hours: 12, yield: [1, 2], cost: 150, lvl: 6 },
  // v49: frutas para a cozinha da casa
  sitrus:  { name: 'Baga Sitrus', icon: '🍋', hours: 8,  yield: [2, 3], cost: 120, lvl: 3 },
  lum:     { name: 'Baga Lum',    icon: '🍏', hours: 10, yield: [1, 2], cost: 180, lvl: 5 },
  starf:   { name: 'Baga Starf',  icon: '⭐', hours: 24, yield: [1, 1], cost: 400, lvl: 8 }
};
export const CROP_IDS = Object.keys(CROPS);
/** Produtos guardados (colheita + farinha) */
export const GOODS = { ...Object.fromEntries(CROP_IDS.map(k => [k, { name: CROPS[k].name, icon: CROPS[k].icon }])), farinha: { name: 'Farinha', icon: '🥡' },
  // v49: o que alguns Pokémon dão no ❤️ Carinho
  leite: { name: 'Leite Moomoo', icon: '🥛' }, ovo: { name: 'Ovo', icon: '🥚' }, mel: { name: 'Mel', icon: '🍯' } };
export const GOODS_CAP = 99;

/** Canteiros pelo nível da Fazenda: 2 no Nv. 1, +1 a cada 2 níveis, até 8. */
export const plotsFor = lvl => Math.min(8, 2 + Math.floor((Math.max(1, lvl) - 1) / 2));
export const WATER_MULT = 0.75;       // regada: cresce 25% mais rápido
export const GRASS_MULT = 0.8;        // Pokémon de Planta na Fazenda: −20% no tempo
export const WORKER_MULT = 0.75;      // trabalhador do tipo certo na construção: −25% no tempo
export const HARVEST_XP = 8;          // XP da Fazenda por colheita

export const BUILDINGS = {
  moinho: {
    name: 'Moinho', icon: '🌀', lvl: 3, worker: ['fighting', 'normal'], workerName: 'Lutador/Normal',
    cost: [{ ore: 10, gold: 800 }, { ore: 25, feather: 15, gold: 2500 }, { ore: 50, crystal: 20, gold: 6000 }],
    recipes: { farinha: { name: 'Farinha', icon: '🥡', in: { trigo: 3 }, out: { goods: { farinha: 1 } }, hours: 2 } }
  },
  cozinha: {
    name: 'Cozinha', icon: '🍳', lvl: 5, worker: ['fire'], workerName: 'Fogo',
    cost: [{ ember: 12, crystal: 5, gold: 1500 }, { ember: 30, pearl: 15, gold: 4000 }, { ember: 60, essence: 20, gold: 9000 }],
    recipes: {
      poffin_oran: { name: 'Poffin Oran', icon: '🧁', in: { farinha: 1, oran: 2 }, out: { item: 'poffin_oran' }, hours: 3 },
      poffin_pecha: { name: 'Poffin Pecha', icon: '🍩', in: { farinha: 1, pecha: 2 }, out: { item: 'poffin_pecha' }, hours: 3 },
      poffin_razz: { name: 'Poffin Razz', icon: '🍪', in: { farinha: 1, razz: 2 }, out: { item: 'poffin_razz' }, hours: 4 },
      torta: { name: 'Torta de Abóbora', icon: '🥧', in: { farinha: 2, abobora: 1 }, out: { item: 'torta' }, hours: 5 },
      // 🧬 v64: Doce Genético — vai para a Mochila da conta; dado a um Pokémon da Coleção, sorteia o potencial (IVs) de novo
      gene_candy: { name: 'Doce Genético', icon: '🧬', in: { farinha: 4, razz: 3, pecha: 3, abobora: 2 }, out: { bag: { gene_candy: 1 } }, hours: 12 }
    }
  }
};
export const BUILDING_IDS = Object.keys(BUILDINGS);
export const BUILD_MAX = 3;                       // nível máximo da construção (= fila de produção)
export const queueFor = lvl => Math.max(1, Math.min(BUILD_MAX, lvl | 0));

// Poffins e Torta (entram nos itens da Fazenda; efeitos em api/_lib/farm.js → farm_use)
export const POFFIN_ITEMS = {
  poffin_oran: { name: 'Poffin Oran', icon: '🧁', desc: '+50 de felicidade em todos da Fazenda.' },
  poffin_pecha: { name: 'Poffin Pecha', icon: '🍩', desc: '+150 XP para todos os Pokémon da Fazenda.' },
  poffin_razz: { name: 'Poffin Razz', icon: '🍪', desc: '+20 pontos de laço com o companheiro da casinha.' },
  torta: { name: 'Torta de Abóbora', icon: '🥧', desc: '+300 de XP da Fazenda (mais vagas e canteiros).' }
};
export const POFFIN_HAPPY = 50, POFFIN_XP = 150, POFFIN_BOND = 20, TORTA_FARM_XP = 300;

/** Algum Pokémon da Fazenda tem um destes tipos? (typesOf(uid) → tipos) */
export const farmHasType = (farm, typesOf, types) => (farm?.slots || []).some(s => (typesOf(s.uid) || []).some(t => types.includes(t)));
