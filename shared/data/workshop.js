// 🔨 Oficina da Fazenda (fase 3): recursos dos Pokémon viram itens. Feita para ser um farm LONGO:
//  - cada receita leva horas numa bancada (1 bancada; +1 no Nv. 4 e no Nv. 7 da Fazenda);
//  - receitas boas pedem recursos de VÁRIOS biomas (precisa de Pokémon de tipos diferentes na Fazenda);
//  - Nível de Artesão (XP por fabricar e por entregar pedidos) libera as receitas raras;
//  - itens fortíssimos têm limite por semana. Nada disso se compra com diamantes.
export const ARTISAN_LEVELS = [
  { lvl: 1, name: 'Aprendiz', xp: 0 },
  { lvl: 2, name: 'Artesão', xp: 300 },
  { lvl: 3, name: 'Mestre Artesão', xp: 1200 },
  { lvl: 4, name: 'Grão-Mestre', xp: 3500 }
];
export const artisanOf = xp => [...ARTISAN_LEVELS].reverse().find(l => (xp || 0) >= l.xp) || ARTISAN_LEVELS[0];
export const benchesFor = farmLvl => Math.min(3, 1 + Math.floor((Math.max(1, farmLvl) - 1) / 3));
export const CANDY_MAX_LEVEL = 60; // Doce Raro leva até o Nv. 60 (máximo do jogo); a Fazenda sozinha só até o 50

/**
 * out.bag → Mochila da conta · out.farm → itens da Fazenda · out.decor → decoração exclusiva da Oficina.
 * cost: recursos + gold. hours: tempo na bancada. lvl: Nível de Artesão. week: máximo por semana.
 */
export const RECIPES = {
  // 🪵 Aprendiz
  poke5: { name: '5 Poké Balls', icon: '🔴', lvl: 1, hours: 1, xp: 15, cost: { berry: 3, ore: 2 }, out: { bag: { poke_ball: 5 } } },
  ration: { name: 'Ração Premium', icon: '🥣', lvl: 1, hours: 1, xp: 15, cost: { berry: 4, pearl: 2 }, out: { farm: { ration: 1 } }, desc: '+40 de felicidade em todos da Fazenda.' },
  fert: { name: 'Fertilizante', icon: '🧪', lvl: 1, hours: 2, xp: 25, cost: { berry: 3, ore: 3, essence: 2 }, out: { farm: { fert: 1 } }, desc: 'Recursos em dobro na Fazenda por 4 h.' },
  great3: { name: '3 Great Balls', icon: '🔵', lvl: 1, hours: 2, xp: 25, cost: { ore: 4, feather: 3, gold: 200 }, out: { bag: { great_ball: 3 } } },
  // 🔧 Artesão
  ultra3: { name: '3 Ultra Balls', icon: '🟡', lvl: 2, hours: 4, xp: 50, cost: { ore: 6, crystal: 3, ember: 3, gold: 500 }, out: { bag: { ultra_ball: 3 } } },
  candy: { name: 'Doce Raro', icon: '🍬', lvl: 2, hours: 6, xp: 60, cost: { berry: 4, pearl: 4, ember: 4, ore: 4, feather: 4 }, out: { farm: { candy: 1 } }, desc: '+1 nível num Pokémon da Coleção (até o Nv. 60).' },
  hatcher: { name: 'Amuleto de Incubação', icon: '🧿', lvl: 2, hours: 6, xp: 60, cost: { ember: 6, crystal: 4, essence: 4, gold: 800 }, out: { farm: { hatcher: 1 } }, desc: 'Choca um ovo na hora.' },
  // ⚔️ itens de batalha (segurados) — v41
  quick_claw: { name: 'Garra Rápida', icon: '🐾', lvl: 2, hours: 8, xp: 70, cost: { feather: 10, ore: 8, gold: 1500 }, out: { bag: { quick_claw: 1 } }, desc: 'Item de batalha: 20% de chance de agir primeiro.' },
  focus_sash: { name: 'Faixa de Foco', icon: '🎗️', lvl: 2, hours: 8, xp: 70, cost: { pearl: 8, essence: 8, gold: 1500 }, out: { bag: { focus_sash: 1 } }, desc: 'Item de batalha: com HP cheio, aguenta um golpe fatal com 1 HP.' },
  plate: { name: 'Placa de Tipo', icon: '🔷', lvl: 2, hours: 12, xp: 90, cost: { crystal: 8, ore: 8, gold: 2000 }, out: { plate: true }, desc: 'Item de batalha: escolha o tipo — +20% de dano nos golpes dele.' },
  statue: { name: 'Estátua de Pedra', icon: '🗿', lvl: 2, hours: 8, xp: 70, cost: { ore: 15, essence: 5 }, out: { decor: 'statue' }, desc: 'Decoração exclusiva da Oficina.' },
  // ⚒️ Mestre
  gene_candy: { name: 'Doce Genético', icon: '🧬', lvl: 2, hours: 12, xp: 90, cost: { crystal: 8, essence: 8, pearl: 6, gold: 2000 }, out: { bag: { gene_candy: 1 } }, desc: 'Dê a um Pokémon da Coleção: sorteia de novo os IVs (cada um: melhor de 2).' },
  tm: { name: 'TM', icon: '💿', lvl: 3, hours: 12, xp: 150, cost: { crystal: 10, essence: 10, feather: 10, gold: 2000 }, out: { bag: { tm: 1 } } },
  rainbow: { name: 'Rainbow Ball', icon: '🌈', lvl: 3, hours: 12, xp: 150, cost: { pearl: 8, ember: 8, crystal: 8, feather: 8, gold: 1500 }, out: { bag: { rainbow_ball: 1 } } },
  incense: { name: 'Incenso Brilhante', icon: '🕯️', lvl: 3, hours: 24, xp: 250, cost: { crystal: 15, essence: 15, pearl: 10, gold: 3000 }, out: { farm: { incense: 1 } }, desc: 'Os próximos 3 ovos têm chance de shiny ×3.' },
  goldstatue: { name: 'Estátua Dourada', icon: '🏅', lvl: 3, hours: 24, xp: 200, cost: { ore: 30, crystal: 10, gold: 5000 }, out: { decor: 'goldstatue' }, desc: 'Decoração exclusiva da Oficina.' },
  leftovers: { name: 'Restos', icon: '🍎', lvl: 3, hours: 24, xp: 220, week: 1, cost: { berry: 20, pearl: 10, essence: 10, gold: 4000 }, out: { bag: { leftovers: 1 } }, desc: 'Item de batalha: recupera 1/12 do HP por rodada. 1 por semana.' },
  choice_band: { name: 'Faixa Escolhida', icon: '🎀', lvl: 3, hours: 24, xp: 220, week: 1, cost: { ember: 15, feather: 10, crystal: 10, gold: 4000 }, out: { bag: { choice_band: 1 } }, desc: 'Item de batalha: +25% de dano, só golpes de ataque. 1 por semana.' },
  // 👑 Grão-Mestre (limite por semana)
  trust: { name: 'Bola da Confiança', icon: '🤝', lvl: 4, hours: 24, xp: 400, week: 1, cost: { berry: 20, pearl: 20, ember: 20, ore: 20, crystal: 20, gold: 6000 }, out: { bag: { trust_ball: 1 } } },
  master: { name: 'Master Ball', icon: '🟣', lvl: 4, hours: 48, xp: 600, week: 1, cost: { berry: 30, pearl: 30, ember: 30, ore: 30, crystal: 30, essence: 30, feather: 30, gold: 12000 }, out: { bag: { master_ball: 1 } } },
  // 💎 Megapedra: escolha qual (precisa de 10 Fragmentos dela, que vêm de Mega Raids/energia Mega)
  legend_charm: { name: 'Amuleto Lendário', icon: '🏵️', lvl: 4, hours: 72, xp: 700, week: 1, cost: { crystal: 25, essence: 25, feather: 20, pearl: 20, ember: 20, gold: 15000 }, out: { bag: { legend_charm: 1 } }, desc: 'Ative na 🎒 Mochila (ou leve na partida): por 7 dias, sem limite de lendários das casas Amarelas em todas as partidas. 1 por semana.' },
  megastone: { name: 'Megapedra', icon: '💎', lvl: 4, hours: 48, xp: 500, week: 1, frags: 10, cost: { crystal: 20, essence: 20, gold: 5000 }, out: { mega: true }, desc: 'Escolha a Mega: gasta 10 Fragmentos dela (da Mochila). 1 por semana.' },
  crown: { name: 'Coroa do Campeão', icon: '👑', lvl: 4, hours: 48, xp: 500, cost: { crystal: 40, essence: 40, gold: 10000 }, out: { decor: 'crown' }, desc: 'Decoração exclusiva e lendária.' }
};
export const RECIPE_IDS = Object.keys(RECIPES);

/** Itens da Fazenda (consumíveis). */
export const FARM_ITEMS = {
  ration: { name: 'Ração Premium', icon: '🥣', desc: '+40 de felicidade em todos da Fazenda.' },
  fert: { name: 'Fertilizante', icon: '🧪', desc: 'Recursos em dobro por 4 h.' },
  candy: { name: 'Doce Raro', icon: '🍬', desc: '+1 nível num Pokémon da Coleção (até o Nv. 60).', target: 'mon' },
  hatcher: { name: 'Amuleto de Incubação', icon: '🧿', desc: 'Choca um ovo na hora.', target: 'egg' },
  incense: { name: 'Incenso Brilhante', icon: '🕯️', desc: 'Próximos 3 ovos: chance de shiny ×3.' }
};
export const FERT_HOURS = 4, RATION_HAPPY = 40, INCENSE_EGGS = 3, INCENSE_MULT = 3;

// 📋 Pedidos do dia: 3 encomendas sorteadas por jogador/dia. Entregar dá ouro + XP de Artesão (+ chance de prêmio raro).
const ORDER_RES = ['berry', 'pearl', 'ember', 'ore', 'crystal', 'essence', 'feather'];
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function dailyOrders(userId, day) {
  const r = rngOf(hash(`orders|${userId}|${day}`));
  return [0, 1, 2].map(i => {
    const kinds = 2 + (i === 2 ? 1 : 0);
    const need = {};
    while (Object.keys(need).length < kinds) { const k = ORDER_RES[Math.floor(r() * ORDER_RES.length)]; need[k] = (i + 1) * 3 + Math.floor(r() * 4); }
    const total = Object.values(need).reduce((a, b) => a + b, 0);
    const bonus = i === 2 && r() < 0.35 ? { tm: 1 } : i === 2 && r() < 0.5 ? { ultra_ball: 3 } : null;
    return { idx: i, need, gold: total * 25, xp: total * 3, bonus };
  });
}
export const weekId = (ms = Date.now()) => { const d = new Date(ms - 3 * 3600000); const onejan = Date.UTC(d.getUTCFullYear(), 0, 1); return `${d.getUTCFullYear()}-w${Math.ceil(((d - onejan) / 86400000 + new Date(onejan).getUTCDay() + 1) / 7)}`; };
