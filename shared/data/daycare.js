// 🥚 Creche da Fazenda (fase 2): um casal (♂ + ♀ compatíveis, ou Ditto com qualquer um) faz ovos com o tempo.
// O filhote nasce da forma básica da mãe (ou do parceiro do Ditto), herda 3 dos 4 potenciais (HP/ATQ/DEF/VEL) dos pais
// e pode herdar a natureza (gastando 💠 Cristais). Mutações raras: ✨ shiny, 🌈 aura, 💯 potencial máximo.
// Lendários e Míticos não fazem ovos. Tudo calculado pelo tempo (como o resto da Fazenda).
import { getSpecies } from './pokemon.js';
import { genderOf } from './gender.js';
import { createMon, IV_MAX, defIvOf } from '../rules/monsters.js';
import { tmMovesFor } from './moves.js';

export const EGG_EVERY_H = 6;           // um ovo a cada 6 h com o casal na Creche
export const EGGS_PER_DAY = 4;          // por conta, por dia (horário de Brasília)
export const INCUBATOR_MAX = 3;         // ovos esperando para chocar
export const HATCH_HOURS = { 1: 2, 2: 3, 3: 5, 4: 8, 5: 12 };
export const NATURE_COST = { crystal: 3 }; // herdar natureza (por ovo)
export const HATCH_LEVEL = 5;
export const MUTATION = { shiny: 1 / 150, shinyBothShiny: 1 / 40, aura: 1 / 40, perfect: 1 / 80 };
export const EGG_AURAS = ['galaxy', 'gold', 'sakura', 'neon', 'frost', 'inferno', 'flame', 'aqua', 'volt', 'shadow', 'mystic', 'rainbow'];

const brtDay = (ms = Date.now()) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);

/** Primeira forma da linha evolutiva. */
export function baseForm(spId) {
  let id = spId;
  for (let i = 0; i < 4; i++) { const f = getSpecies(id)?.evolvesFrom; if (!f || !getSpecies(f)) break; id = f; }
  return id;
}

/** Pode cruzar? → { ok, why, mother, father } */
export function canBreed(a, b) {
  if (!a || !b) return { ok: false, why: 'Escolha dois Pokémon.' };
  if (a.uid === b.uid) return { ok: false, why: 'Precisa de dois Pokémon diferentes.' };
  const sa = getSpecies(a.sp), sb = getSpecies(b.sp);
  if (sa?.legendary || sb?.legendary) return { ok: false, why: 'Lendários e Míticos não fazem ovos.' };
  const ga = genderOf(a, sa), gb = genderOf(b, sb);
  const dA = a.sp === 'ditto', dB = b.sp === 'ditto';
  if (dA && dB) return { ok: false, why: 'Dois Ditto não fazem ovo.' };
  if (dA || dB) {
    const other = dA ? b : a;
    return { ok: true, mother: other, father: dA ? a : b, ditto: true };
  }
  if (ga === 'N' || gb === 'N') return { ok: false, why: 'Pokémon sem sexo só cruzam com Ditto.' };
  if (ga === gb) return { ok: false, why: `Precisa de um macho ♂ e uma fêmea ♀ (os dois são ${ga === 'M' ? 'machos' : 'fêmeas'}).` };
  const sameLine = baseForm(a.sp) === baseForm(b.sp);
  const shareType = sa.types.some(t => sb.types.includes(t));
  if (!sameLine && !shareType) return { ok: false, why: 'Não combinam: precisam ser da mesma família ou ter um tipo em comum.' };
  return { ok: true, mother: ga === 'F' ? a : b, father: ga === 'F' ? b : a, sameLine };
}

/** Quantos ovos o casal já fez desde `since` (respeita incubadora e limite do dia). */
export function eggsDue(dc, now, eggsToday, incubatorCount, incubMax = INCUBATOR_MAX) {
  if (!dc?.a || !dc?.b || !dc.since) return 0;
  const n = Math.floor((now - dc.since) / (EGG_EVERY_H * 3600000));
  return Math.max(0, Math.min(n, EGGS_PER_DAY - eggsToday, incubMax - incubatorCount));
}

/** Monta um ovo (o filhote já é decidido aqui; só aparece ao chocar). */
export function makeEgg(rng, mother, father, { natureFrom = null, now = Date.now(), shinyMult = 1 } = {}) {
  const sp = baseForm(mother.sp === 'ditto' ? father.sp : mother.sp);
  const tier = getSpecies(sp)?.tier || 1;
  const parents = [mother, father];
  // 3 dos 4 potenciais vêm dos pais; o outro é sorteado (DEF dos pais antigos vem do valor fixo deles)
  const keys = ['hp', 'atk', 'spe', 'def'];
  const skip = keys[rng.int(0, 3)];
  const inherit = new Set(keys.filter(k => k !== skip));
  const iv = {};
  const ivK = (m, k) => (k === 'def' ? defIvOf(m) : m.iv?.[k]);
  for (const k of keys) iv[k] = inherit.has(k) ? (ivK(rng.pick(parents), k) ?? rng.int(0, IV_MAX)) : rng.int(0, IV_MAX);
  const mut = [];
  const bothShiny = mother.shiny && father.shiny;
  const shiny = rng.chance((bothShiny ? MUTATION.shinyBothShiny : MUTATION.shiny) * shinyMult);
  if (shiny) mut.push('shiny');
  if (rng.chance(MUTATION.perfect)) { iv.hp = iv.atk = iv.spe = iv.def = IV_MAX; mut.push('perfect'); }
  const aura = rng.chance(MUTATION.aura) ? rng.pick(EGG_AURAS) : null;
  if (aura) mut.push('aura');
  const natureParent = natureFrom === 'mother' ? mother : natureFrom === 'father' ? father : null;
  // golpe herdado: 40% de pegar o 2º golpe do pai, se o filhote puder aprender
  const fm = father.moves?.[1];
  const move2 = fm && rng.chance(0.4) && tmMovesFor(sp).some(m => m.id === fm) ? fm : null;
  return {
    id: 'e' + Math.floor(rng.next() * 1e9).toString(36),
    sp, tier, iv, shiny, aura, mutations: mut,
    nature: natureParent?.nature || null, move2,
    parents: [mother.uid, father.uid], parentSp: [mother.sp, father.sp],
    laid: now, readyAt: now + (HATCH_HOURS[tier] || 4) * 3600000
  };
}

/** Choca: cria o Pokémon (Nv. 5). */
export function hatchFromEgg(rng, egg, ot = null) {
  const mon = createMon(rng, egg.sp, HATCH_LEVEL, { shiny: egg.shiny, iv: egg.iv, nature: egg.nature || undefined, ot });
  if (egg.move2) mon.moves = [mon.moves[0], egg.move2];
  if (egg.aura) mon.aura = egg.aura;
  mon.bred = true;
  if (egg.mutations?.length) mon.mutations = egg.mutations;
  mon.parents = egg.parentSp;
  mon.from = 'creche';
  mon.at = new Date().toISOString();
  return mon;
}

export { brtDay as daycareDay };
