// 🌾 Fazenda Pokémon (fase 1): os Pokémon da Coleção ficam soltos nos biomas, ganham XP com o tempo
// (substitui o Centro de Treino por ouro), produzem recursos e ficam felizes com cuidado.
// Tudo calculado "na hora que abre" pelo tempo que passou (não precisa de servidor rodando).
// Diamantes: SÓ decoração (regra: nada pago dá força). Vagas sobem com o nível da Fazenda.

export const FARM_BIOMES = {
  pasto: { name: 'Pasto', icon: '🌾', types: ['normal', 'flying', 'fairy', 'fighting'] },
  floresta: { name: 'Floresta', icon: '🌳', types: ['grass', 'bug', 'poison'] },
  lago: { name: 'Lago', icon: '💧', types: ['water', 'ice'] },
  caverna: { name: 'Caverna', icon: '🪨', types: ['rock', 'ground', 'steel', 'ghost', 'dark'] },
  vulcao: { name: 'Vulcão', icon: '🌋', types: ['fire', 'dragon'] },
  campo: { name: 'Campo Elétrico', icon: '⚡', types: ['electric', 'psychic'] }
};
export const BIOME_IDS = Object.keys(FARM_BIOMES);

export const RESOURCES = {
  berry: { name: 'Frutinha', icon: '🍓', gold: 10 },
  pearl: { name: 'Pérola', icon: '🫧', gold: 14 },
  ember: { name: 'Brasa', icon: '🔥', gold: 14 },
  ore: { name: 'Minério', icon: '⛏️', gold: 14 },
  crystal: { name: 'Cristal', icon: '💠', gold: 20 },
  essence: { name: 'Essência', icon: '🌑', gold: 20 },
  feather: { name: 'Pena', icon: '🪶', gold: 12 }
};
const TYPE_RES = {
  grass: 'berry', bug: 'berry', normal: 'feather', flying: 'feather', fighting: 'feather', water: 'pearl', ice: 'pearl',
  fire: 'ember', dragon: 'ember', rock: 'ore', ground: 'ore', steel: 'ore', electric: 'crystal', psychic: 'crystal', fairy: 'crystal',
  ghost: 'essence', dark: 'essence', poison: 'essence'
};
export const resourceOf = types => TYPE_RES[types?.[0]] || 'berry';
export const bestBiome = types => BIOME_IDS.find(b => FARM_BIOMES[b].types.includes(types?.[0])) || BIOME_IDS.find(b => FARM_BIOMES[b].types.some(t => types?.includes(t))) || 'pasto';
export const biomeMatch = (biome, types) => !!FARM_BIOMES[biome]?.types.some(t => types?.includes(t));

// ---- ritmo
export const XP_PER_HOUR = 30;          // por Pokémon (×1,5 no bioma certo, ×0,5–1,5 pela felicidade)
export const XP_DAY_CAP = 600;          // por Pokémon por dia
export const FARM_MAX_LEVEL = 50;       // a Fazenda leva até o Nv. 50; depois, só batalhando ou com 🍬 Doce Raro
export const RES_PER_HOUR = 0.5;        // 1 recurso a cada 2 h (×1,5 no bioma certo)
export const RES_CAP = 99;              // por recurso guardado
export const HAPPY_DECAY_PER_HOUR = 3;
export const CARE_COOLDOWN_H = 4;       // carinho: a cada 4 h por Pokémon
export const CARE_HAPPY = 30;
export const FEED_HAPPY = 15, FEED_XP = 60; // dar 1 Frutinha
export const SLOTS_BASE = 6, SLOTS_PER_LEVEL = 2, SLOTS_MAX = 20;
export const farmLevelXp = lvl => 100 * lvl; // XP da Fazenda para passar do nível lvl
export const slotsFor = lvl => Math.min(SLOTS_MAX, SLOTS_BASE + SLOTS_PER_LEVEL * (Math.max(1, lvl) - 1));
export const HELP_HAPPY = 15;           // visita de amigo (cuidar) dá felicidade a todos
export const DECOR_MAX = 40;

const brtDay = (ms = Date.now()) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
export { brtDay };

export function newFarm(now = Date.now()) {
  return { lvl: 1, xp: 0, slots: [], res: {}, decor: [], likes: 0, likesBy: {}, helpsBy: {}, visits: [], created: now };
}

/** Ganha XP da Fazenda (sobe de nível = mais vagas). */
export function addFarmXp(farm, n) {
  farm.xp = (farm.xp || 0) + n;
  while (farm.xp >= farmLevelXp(farm.lvl)) { farm.xp -= farmLevelXp(farm.lvl); farm.lvl++; }
  return farm;
}

/**
 * Avança o tempo de cada vaga: felicidade cai, XP pendente e recursos acumulam (com teto diário de XP).
 * vaultById: Map uid → mon (precisa de types/lvl). Vagas de Pokémon que saíram da Coleção somem.
 */
export function tickFarm(farm, vaultById, typesOf, now = Date.now()) {
  farm.slots = (farm.slots || []).filter(s => vaultById.has(s.uid));
  for (const s of farm.slots) {
    const t0 = s.t ?? now;
    const hours = Math.max(0, (now - t0) / 3600000);
    if (!hours) continue;
    const mon = vaultById.get(s.uid);
    const types = typesOf(mon);
    const h0 = s.happy ?? 70;
    const h1 = Math.max(0, h0 - HAPPY_DECAY_PER_HOUR * hours);
    const avgHappy = hours > 0 ? (h0 + h1) / 2 : h0;
    const fit = biomeMatch(s.biome, types) ? 1.5 : 1;
    const day = brtDay(now);
    if (s.day !== day) { s.day = day; s.dayXp = 0; }
    if (mon.lvl < FARM_MAX_LEVEL) {
      const want = XP_PER_HOUR * fit * (0.5 + avgHappy / 100) * hours;
      const room = Math.max(0, XP_DAY_CAP - (s.dayXp || 0));
      const got = Math.min(want, room);
      s.pxp = (s.pxp || 0) + got;
      s.dayXp = (s.dayXp || 0) + got;
    }
    const r = resourceOf(types);
    // 🧪 Fertilizante: recursos em dobro dentro da janela
    const f = farm.fert;
    const boostH = f ? Math.max(0, (Math.min(now, f.until) - Math.max(t0, f.from)) / 3600000) : 0;
    s.pres = (s.pres || 0) + RES_PER_HOUR * fit * (hours + boostH);
    s.res = r;
    s.happy = Math.round(h1 * 10) / 10;
    s.t = now;
  }
  return farm;
}

/** O que dá para coletar agora (para mostrar na tela). */
export function pendingOf(farm) {
  const res = {};
  let xp = 0;
  for (const s of farm.slots || []) {
    xp += Math.floor(s.pxp || 0);
    const n = Math.floor(s.pres || 0);
    if (n) res[s.res || 'berry'] = (res[s.res || 'berry'] || 0) + n;
  }
  return { xp, res };
}

/** 🎨 Decorações (só visual). price 0 = grátis para todos; as outras são da 💎 Loja (kind 'decor', id 'decor_<chave>'). */
export const FARM_DECOR = {
  tree: { name: 'Árvore', icon: '🌳', price: 0 },
  pine: { name: 'Pinheiro', icon: '🌲', price: 0 },
  flower: { name: 'Flores', icon: '🌼', price: 0 },
  rock: { name: 'Pedra', icon: '🪨', price: 0 },
  mushroom: { name: 'Cogumelo', icon: '🍄', price: 0 },
  sakura: { name: 'Cerejeira', icon: '🌸', price: 40 },
  palm: { name: 'Coqueiro', icon: '🌴', price: 40 },
  tulip: { name: 'Canteiro de tulipas', icon: '🌷', price: 30 },
  sunflower: { name: 'Girassóis', icon: '🌻', price: 30 },
  fence: { name: 'Cerca de madeira', icon: '🪵', price: 30 },
  house: { name: 'Casinha', icon: '🏡', price: 120 },
  barn: { name: 'Celeiro', icon: '🛖', price: 100 },
  windmill: { name: 'Moinho', icon: '🌬️', price: 90 },
  fountain: { name: 'Fonte', icon: '⛲', price: 110 },
  well: { name: 'Poço', icon: '🪣', price: 50 },
  tent: { name: 'Barraca', icon: '⛺', price: 60 },
  campfire: { name: 'Fogueira', icon: '🔥', price: 50 },
  lantern: { name: 'Lanterna', icon: '🏮', price: 40 },
  bench: { name: 'Banco de praça', icon: '🪑', price: 35 },
  mailbox: { name: 'Caixa de correio', icon: '📮', price: 35 },
  pokeball: { name: 'Estátua Pokébola', icon: '🔴', price: 80 },
  trophy: { name: 'Estátua de troféu', icon: '🏆', price: 150 },
  rainbow: { name: 'Arco-íris', icon: '🌈', price: 150 },
  moon: { name: 'Lua mágica', icon: '🌙', price: 90 },
  star: { name: 'Estrela brilhante', icon: '⭐', price: 90 },
  ferris: { name: 'Roda-gigante', icon: '🎡', price: 200 },
  castle: { name: 'Castelinho', icon: '🏰', price: 250 },
  // só fabricando na 🔨 Oficina (price −1)
  statue: { name: 'Estátua de Pedra', icon: '🗿', price: -1 },
  goldstatue: { name: 'Estátua Dourada', icon: '🏅', price: -1 },
  crown: { name: 'Coroa do Campeão', icon: '👑', price: -1 }
};
export const DECOR_IDS = Object.keys(FARM_DECOR);
export const decorItemId = k => `decor_${k}`;
