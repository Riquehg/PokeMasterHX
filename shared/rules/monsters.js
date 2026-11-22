// Criação de instâncias de Pokémon, status, XP e evolução.
import { getSpecies, speciesByTier, MYTHICAL_WILD_CHANCE } from '../data/pokemon.js';
import { genderFor } from '../data/gender.js';
import { NATURE_NAMES, natureMult } from '../data/natures.js';
import { MOVES, rollMoveIds } from '../data/moves.js';
import { baseDefOfDex } from '../data/basedef.js';

export const MAX_LEVEL = 60;
export const TEAM_SIZE = 6;
export const SHINY_STAT_BONUS = 0.15; // shiny: +15% HP e Ataque, +10% Velocidade

// Faixa de nível dos selvagens por tier de casa
export const WILD_LEVELS = { 1: [3, 7], 2: [7, 13], 3: [12, 19], 4: [18, 26], 5: [26, 34] };

export const BASE_SHINY_RATE = 1 / 450; // shiny é raríssimo (Amuleto Shiny triplica)
export const DAILY_SHINY_RATE = 1 / 64;

/** Status derivados da espécie (HP/força do catálogo original) + nível + shiny + natureza. */
// Potencial individual (IV): 0 a 31 em HP, Ataque e Velocidade. 0 = −8%, 31 = +8% (como nos jogos, cada um é único).
export const IV_MAX = 31;
export const IV_RANGE = 0.08;
export const ivMult = iv => 1 + ((Math.max(0, Math.min(IV_MAX, iv ?? 15.5)) / IV_MAX) * 2 - 1) * IV_RANGE;

// 🛡️ DEF (v42): base oficial (média Defesa + Def. Especial), não sobe com o nível — é a "resistência" da espécie.
// No dano: fator = √(DEF_REF / DEF), limitado entre DEF_MIN_F e DEF_MAX_F (DEF 70 = dano igual ao de antes).
export const DEF_REF = 70, DEF_MIN_F = 0.6, DEF_MAX_F = 1.4, MEGA_DEF_MULT = 1.2;
export const baseDefOf = sp => Math.round(baseDefOfDex(sp?.dex) * (sp?.mega ? MEGA_DEF_MULT : 1));
export const defFactor = def => Math.max(DEF_MIN_F, Math.min(DEF_MAX_F, Math.sqrt(DEF_REF / Math.max(1, def))));
function hashUid(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** IV de DEF: Pokémon antigos (sem iv.def) ganham um valor fixo derivado do uid — não dá para re-sortear. */
export const defIvOf = mon => (mon?.iv && Number.isFinite(mon.iv.def) ? mon.iv.def : mon?.uid ? hashUid('def|' + mon.uid) % (IV_MAX + 1) : 15.5);
const ivFull = mon => (mon?.iv ? { ...mon.iv, def: defIvOf(mon) } : mon?.uid ? { def: defIvOf(mon) } : null);

/** Status derivados da espécie + nível + shiny + natureza + potencial (IV). */
export function computeStats(speciesId, level, shiny = false, nature = null, iv = null) {
  const sp = getSpecies(speciesId);
  if (!sp) throw new Error(`Espécie desconhecida: ${speciesId}`);
  const L = Math.max(1, Math.min(MAX_LEVEL, level | 0));
  const s = shiny ? 1 + SHINY_STAT_BONUS : 1;
  const v = iv || {};
  return {
    maxHp: Math.max(8, Math.round(sp.hp * (1 + 0.07 * (L - 1)) * s * natureMult(nature, 'hp') * ivMult(v.hp))),
    atk: Math.max(2, Math.round(sp.str * (1 + 0.06 * (L - 1)) * s * natureMult(nature, 'atk') * ivMult(v.atk))),
    spe: Math.round(L * 10 * (shiny ? 1.1 : 1) * (sp.speMult || 1) * natureMult(nature, 'spe') * ivMult(v.spe)),
    def: Math.max(5, Math.round(baseDefOf(sp) * (shiny ? 1.05 : 1) * natureMult(nature, 'def') * ivMult(v.def)))
  };
}

/** Maior valor possível de cada status para a espécie/nível (IV 31 + natureza a favor) — base das barrinhas. */
export function maxStats(speciesId, level) {
  const best = { hp: IV_MAX, atk: IV_MAX, spe: IV_MAX, def: IV_MAX };
  const sp = getSpecies(speciesId);
  const L = Math.max(1, Math.min(MAX_LEVEL, level | 0));
  return {
    maxHp: Math.round(sp.hp * (1 + 0.07 * (L - 1)) * 1.1 * ivMult(best.hp)),
    atk: Math.round(sp.str * (1 + 0.06 * (L - 1)) * 1.1 * ivMult(best.atk)),
    spe: Math.round(L * 10 * 1.1 * ivMult(best.spe)),
    def: Math.round(baseDefOf(sp) * 1.1 * ivMult(best.def))
  };
}

/** Potencial total em % (média dos 4 IVs: HP, ATQ, DEF, VEL). */
export function ivPercent(mon) {
  const v = mon?.iv;
  if (!v) return null;
  return Math.round(((v.hp + v.atk + v.spe + defIvOf(mon)) / (4 * IV_MAX)) * 100);
}

function cleanIv(v) {
  const c = x => Math.max(0, Math.min(IV_MAX, Math.round(Number(x) || 0)));
  return { hp: c(v.hp), atk: c(v.atk), spe: c(v.spe), ...(v.def !== undefined && v.def !== null ? { def: c(v.def) } : {}) };
}

export function rollIvs(rng) {
  return { hp: rng.int(0, IV_MAX), atk: rng.int(0, IV_MAX), spe: rng.int(0, IV_MAX) };
}

/** Status de uma instância (inclui natureza e HP extra de chefe de Raid). */
export function statsOf(mon) {
  const st = computeStats(mon.sp, mon.lvl, mon.shiny, mon.nature, ivFull(mon));
  if (mon.bonusHp) st.maxHp += mon.bonusHp;
  if (mon.tf && mon.shiny) st.atk = Math.round(st.atk * TRANSFORM_SHINY_ATK); // Ditto/Mew shiny transformado: cópia mais forte
  return st;
}

// ---------------------------------------------------------------- 🧬 Transformação (Ditto / Mew)
export const TRANSFORM_SHINY_ATK = 1.1;
const baseSp = mon => (mon.tf ? mon.tf.sp : mon.sp);
const baseMoves = mon => (mon.tf ? mon.tf.moves : mon.moves);
/** Pode se transformar? Ditto sempre; Mew se tiver o golpe Transform. */
export function canTransform(mon) {
  if (!mon) return false;
  const sp = baseSp(mon);
  return sp === 'ditto' || (sp === 'mew' && Array.isArray(baseMoves(mon)) && baseMoves(mon).includes('transform'));
}
/** Vira uma cópia de `sp` (com os golpes `moves`). Mantém nível, natureza, potencial e a % de HP. */
export function transformInto(mon, sp, moves) {
  const oldMax = maxHpOf(mon);
  const ratio = oldMax > 0 ? mon.hp / oldMax : 1;
  if (!mon.tf) mon.tf = { sp: mon.sp, moves: Array.isArray(mon.moves) ? [...mon.moves] : null };
  mon.sp = sp;
  mon.moves = Array.isArray(moves) && moves.length === 2 ? [...moves] : null;
  mon.hp = mon.hp <= 0 ? 0 : Math.max(1, Math.round(maxHpOf(mon) * ratio));
}
/** 💎 Mega Evolução: vira a forma Mega (mantém golpes e a % de HP). Volta no fim da batalha (revertForm). */
export function megaEvolveMon(mon, megaSp) {
  transformInto(mon, megaSp, Array.isArray(mon.moves) ? mon.moves : null);
  if (!Array.isArray(mon.tf.moves)) mon.moves = null;
  mon.mega = true;
}
/** Volta à forma original. */
export function revertForm(mon) {
  if (!mon?.tf) return false;
  const oldMax = maxHpOf(mon);
  const ratio = oldMax > 0 ? mon.hp / oldMax : 1;
  mon.sp = mon.tf.sp;
  mon.moves = mon.tf.moves;
  delete mon.tf;
  delete mon.mega;
  mon.hp = mon.hp <= 0 ? 0 : Math.max(1, Math.round(maxHpOf(mon) * ratio));
  return true;
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
  const iv = opts.iv && typeof opts.iv === 'object' ? cleanIv(opts.iv) : rollIvs(rng);
  const moves = Array.isArray(opts.moves) && opts.moves.length === 2 && opts.moves.every(id => MOVES[id]) ? [...opts.moves] : rollMoveIds(rng, speciesId);
  const st = computeStats(speciesId, level, !!opts.shiny, nature, iv);
  const mon = {
    uid: makeUid(rng),
    sp: speciesId,
    lvl: level,
    xp: 0,
    hp: st.maxHp,
    shiny: !!opts.shiny,
    nature,
    iv,
    moves,
    capTier: opts.capTier || getSpecies(speciesId).tier,
    ball: opts.ball || null,
    ot: opts.ot || null // "treinador original" (id do jogador que capturou)
  };
  if (opts.starter) mon.starter = true;
  mon.gender = genderFor(speciesId, mon.uid, getSpecies(speciesId)); // ♂/♀ fixo pelo uid (não gasta RNG)
  return mon;
}

/** Visão completa (para UI e cálculos): junta espécie + status. */
export function monView(mon) {
  const sp = getSpecies(mon.sp);
  const st = statsOf(mon);
  return { ...mon, name: mon.nick || sp.name, species: sp.name, dex: sp.dex, types: sp.types, tier: sp.tier, maxHp: st.maxHp, atk: st.atk, spe: st.spe, def: st.def, potential: ivPercent(mon) };
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
export function setLevel(mon, newLevel) {
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
    if (!mon.tf && sp.evolvesTo && sp.evolutionLevel && mon.lvl >= sp.evolutionLevel) {
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
  // 🌟 Míticos não aparecem soltos: só numa aparição mítica rara (4%) nas casas Amarelas
  const all = speciesByTier(tier);
  const myth = all.filter(s => s.mythical);
  const pool = tier === 5 && myth.length && rng.chance(MYTHICAL_WILD_CHANCE) ? myth : all.filter(s => !s.mythical);
  // ambiente da casa e clima puxam alguns tipos (ex.: mar → Água, caverna → Pedra, chuva → Água)
  const favor = opts.favorTypes?.length && rng.chance(opts.favorChance ?? 0.45) ? pool.filter(s => s.types.some(t => opts.favorTypes.includes(t))) : null;
  let speciesId = rng.pick(favor?.length ? favor : pool).id;

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
  const pool = speciesByTier(tier).filter(s => !s.mythical); // ovo nunca choca Mítico
  const basics = pool.filter(s => !s.evolvesFrom || getSpecies(s.evolvesFrom)?.tier !== tier);
  const sp = rng.pick(basics.length ? basics : pool);
  const lvl = opts.level || { 1: 5, 2: 12, 3: 18, 4: 25, 5: 30 }[tier];
  return createMon(rng, sp.id, lvl, { shiny: rng.chance(BASE_SHINY_RATE), capTier: tier, ot: opts.ot });
}
