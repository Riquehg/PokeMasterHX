// Criação de instâncias de Pokémon, status, XP e evolução.
import { getSpecies, speciesByTier } from '../data/pokemon.js';
import { NATURE_NAMES, natureMult } from '../data/natures.js';

export const MAX_LEVEL = 60;
export const TEAM_SIZE = 6;
export const SHINY_STAT_BONUS = 0.1;

// Faixa de nível dos selvagens por tier de casa
export const WILD_LEVELS = { 1: [3, 7], 2: [7, 13], 3: [12, 19], 4: [18, 26], 5: [26, 34] };

export const BASE_SHINY_RATE = 1 / 450; // shiny é raríssimo (Amuleto Shiny triplica)
export const DAILY_SHINY_RATE = 1 / 64;

/** Status derivados da espécie (HP/força do catálogo original) + nível + shiny + natureza. */
export function computeStats(speciesId, level, shiny = false, nature = null) {
  const sp = getSpecies(speciesId);
  if (!sp) throw new Error(`Espécie desconhecida: ${speciesId}`);
  const L = Math.max(1, Math.min(MAX_LEVEL, level | 0));
  const s = shiny ? 1 + SHINY_STAT_BONUS : 1;
  return {
    maxHp: Math.max(8, Math.round(sp.hp * (1 + 0.07 * (L - 1)) * s * natureMult(nature, 'hp'))),
    atk: Math.max(2, Math.round(sp.str * (1 + 0.06 * (L - 1)) * s * natureMult(nature, 'atk'))),
    spe: Math.round(L * 10 * natureMult(nature, 'spe'))
  };
}

/** Status de uma instância (inclui natureza e HP extra de chefe de Raid). */
export function statsOf(mon) {
  const st = computeStats(mon.sp, mon.lvl, mon.shiny, mon.nature);
  if (mon.bonusHp) st.maxHp += mon.bonusHp;
  return st;
}

/** Tier usado para a regra de insígnias: o da espécie quando o Pokémon foi obtido. */
export function capTierOf(mon) {
  return mon.capTier || baseTierOf(mon.sp);
}

/** Tier da forma básica da linha evolutiva (para Pokémon antigos da Coleção sem capTier). */
export function baseTierOf(spId) {
  let sp = getSpecies(spId);
  if (!sp) return 1;
  if (sp.legendary) return 5;
  for (let i = 0; i < 4 && sp.evolvesFrom; i++) sp = getSpecies(sp.evolvesFrom);
  return sp.tier;
}

export function xpToNext(level) {
  return level * 8;
}

export function makeUid(rng) {
  return 'm' + Math.floor(rng.next() * 0xffffffff).toString(36) + Math.floor(rng.next() * 0xffffff).toString(36);
}

export function createMon(rng, speciesId, level, opts = {}) {
  const nature = opts.nature !== undefined ? opts.nature : rng.pick(NATURE_NAMES);
  const st = computeStats(speciesId, level, !!opts.shiny, nature);
  const mon = {
    uid: makeUid(rng),
    sp: speciesId,
    lvl: level,
    xp: 0,
    hp: st.maxHp,
    shiny: !!opts.shiny,
    nature,
    capTier: opts.capTier || getSpecies(speciesId).tier,
    ball: opts.ball || null,
    ot: opts.ot || null // "treinador original" (id do jogador que capturou)
  };
  if (opts.starter) mon.starter = true;
  return mon;
}

/** Visão completa (para UI e cálculos): junta espécie + status. */
export function monView(mon) {
  const sp = getSpecies(mon.sp);
  const st = statsOf(mon);
  return { ...mon, name: sp.name, dex: sp.dex, types: sp.types, tier: sp.tier, maxHp: st.maxHp, atk: st.atk, spe: st.spe };
}

export function maxHpOf(mon) {
  return statsOf(mon).maxHp;
}

export function isFainted(mon) {
  return mon.hp <= 0;
}

export function healMon(mon, pct = 1, flat = 0) {
  const max = maxHpOf(mon);
  if (mon.hp <= 0 && pct < 1) return 0; // poção não revive
  const before = mon.hp;
  mon.hp = Math.min(max, mon.hp + Math.ceil(max * pct) + flat);
  return mon.hp - before;
}

export function fullHeal(mon) {
  mon.hp = maxHpOf(mon);
}

/** Muda nível mantendo a proporção de HP. */
function setLevel(mon, newLevel) {
  const oldMax = maxHpOf(mon);
  const ratio = oldMax > 0 ? mon.hp / oldMax : 1;
  mon.lvl = Math.min(MAX_LEVEL, newLevel);
  const newMax = maxHpOf(mon);
  mon.hp = mon.hp <= 0 ? 0 : Math.max(1, Math.round(newMax * ratio));
}

export function evolve(mon) {
  const sp = getSpecies(mon.sp);
  if (!sp || !sp.evolvesTo || !getSpecies(sp.evolvesTo)) return null;
  const oldMax = maxHpOf(mon);
  const ratio = oldMax > 0 ? mon.hp / oldMax : 1;
  const from = sp.name;
  mon.sp = sp.evolvesTo;
  const newMax = maxHpOf(mon);
  mon.hp = mon.hp <= 0 ? 0 : Math.max(1, Math.round(newMax * ratio));
  return { from, to: getSpecies(mon.sp).name };
}

/** Adiciona XP; retorna lista de mensagens (subidas de nível / evoluções). */
export function gainXp(mon, amount) {
  const msgs = [];
  if (mon.lvl >= MAX_LEVEL) return msgs;
  mon.xp += Math.max(0, Math.round(amount));
  while (mon.lvl < MAX_LEVEL && mon.xp >= xpToNext(mon.lvl)) {
    mon.xp -= xpToNext(mon.lvl);
    setLevel(mon, mon.lvl + 1);
    const name = getSpecies(mon.sp).name;
    msgs.push(`${name} subiu para o nível ${mon.lvl}!`);
    const sp = getSpecies(mon.sp);
    if (sp.evolvesTo && sp.evolutionLevel && mon.lvl >= sp.evolutionLevel) {
      const ev = evolve(mon);
      if (ev) msgs.push(`✨ ${ev.from} evoluiu para ${ev.to}!`);
    }
  }
  if (mon.lvl >= MAX_LEVEL) mon.xp = 0;
  return msgs;
}

export function levelUp(mon) {
  if (mon.lvl >= MAX_LEVEL) return [];
  return gainXp(mon, xpToNext(mon.lvl) - mon.xp);
}

/** XP concedido por derrotar um Pokémon. */
export function xpReward(foe, isTrainer) {
  const tier = getSpecies(foe.sp).tier;
  return Math.round(foe.lvl * (4 + tier * 2) * (isTrainer ? 1.5 : 1));
}

/** Sorteia um selvagem para uma casa de tier `tier`. */
export function rollWild(rng, tier, opts = {}) {
  // Tier estável: a cor da casa define o tier (Rosa 1 · Verde 2 · Azul 3 · Vermelha 4 · Amarela 5)
  const pool = speciesByTier(tier);
  let speciesId = rng.pick(pool).id;

  // Pokémon do Dia: 25% de chance de aparecer, mas só nas casas do tier dele
  const daily = opts.dailyPokemon && getSpecies(opts.dailyPokemon);
  const isDaily = !!(daily && daily.tier === tier && rng.chance(0.25));
  if (isDaily) speciesId = daily.id;

  const [lo, hi] = WILD_LEVELS[tier];
  const level = rng.int(lo, hi);
  let shinyRate = BASE_SHINY_RATE * (opts.shinyCharm ? 3 : 1);
  if (isDaily) shinyRate = Math.max(shinyRate, DAILY_SHINY_RATE * (opts.shinyCharm ? 3 : 1));
  if (opts.forceShiny) shinyRate = 1;
  const shiny = rng.chance(shinyRate);
  const mon = createMon(rng, speciesId, level, { shiny });
  mon.wild = true;
  return mon;
}

/** Ovo: choca um Pokémon básico (primeiro estágio) do tier pedido. */
export function hatchEgg(rng, tier, opts = {}) {
  const pool = speciesByTier(tier);
  const basics = pool.filter(s => !s.evolvesFrom || getSpecies(s.evolvesFrom)?.tier !== tier);
  const sp = rng.pick(basics.length ? basics : pool);
  const lvl = opts.level || { 1: 5, 2: 12, 3: 18, 4: 25, 5: 30 }[tier];
  return createMon(rng, sp.id, lvl, { shiny: rng.chance(BASE_SHINY_RATE), capTier: tier, ot: opts.ot });
}
