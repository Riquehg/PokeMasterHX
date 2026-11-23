// ✨ Evoluções fiéis aos jogos (v54): por nível, por item (pedras, itens de troca, Cabo de Conexão...), por sexo,
// por hora do dia (horário de Brasília) e por forma visual (ex.: Burmy Areia → Wormadam Areia).
// Os dados vêm de sp.evos = [{ to, lvl?, item?, sex?, time?, v? }] (shared/data/dexdata.js).
import { getSpecies } from './pokemon.js';
import { genderOf } from './gender.js';
import { ITEMS } from './items.js';

/** Pedra Evolutiva antiga: evolui qualquer Pokémon que tenha evolução (item raro, compatível com contas antigas). */
export const UNIVERSAL_STONE = 'evolution_stone';

function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Dia (6h–18h) ou noite, no horário de Brasília. */
export function dayTime(now = Date.now()) {
  const h = new Date(Number(now) - 3 * 3600e3).getUTCHours();
  return h >= 6 && h < 18 ? 'day' : 'night';
}
const sexOk = (e, mon) => !e.sex || genderOf(mon, getSpecies(mon?.sp)) === e.sex.toUpperCase();

/** Escolhe entre as opções: a da forma visual do Pokémon vence; depois a hora do dia; empate → sorteio fixo pelo uid. */
function pick(options, mon, now) {
  if (!options.length) return null;
  const withV = options.filter(e => e.v && e.v === mon?.v);
  let c = withV.length ? withV : options.filter(e => !e.v);
  const t = dayTime(now);
  const byTime = c.filter(e => !e.time || e.time === t);
  c = byTime.length ? byTime : c;
  if (!c.length) return null;
  return c.length === 1 ? c[0] : c[hashStr(`evo|${mon?.uid || ''}|${mon?.sp}`) % c.length];
}

/** Para quem evolui ao subir de nível (ou null). */
export function levelEvoTarget(mon, now = Date.now(), level = mon?.lvl) {
  const sp = getSpecies(mon?.sp);
  if (!sp?.evos?.length) return null;
  const e = pick(sp.evos.filter(x => x.lvl && !x.item && (level | 0) >= x.lvl && sexOk(x, mon) && getSpecies(x.to)), mon, now);
  return e ? e.to : null;
}

/** Para quem evolui usando este item (ou null). */
export function itemEvoTarget(mon, itemId, now = Date.now()) {
  const sp = getSpecies(mon?.sp);
  if (!sp?.evos?.length || !itemId) return null;
  const ok = sp.evos.filter(x => getSpecies(x.to) && sexOk(x, mon));
  const list = itemId === UNIVERSAL_STONE ? ok : ok.filter(x => x.item === itemId);
  const e = pick(list, mon, now);
  return e ? e.to : null;
}

/** Itens que fazem este Pokémon evoluir (sem a Pedra Evolutiva universal). */
export function evoItemsFor(mon) {
  const sp = getSpecies(mon?.sp);
  return [...new Set((sp?.evos || []).filter(x => x.item && sexOk(x, mon) && getSpecies(x.to)).map(x => x.item))];
}

/** Variação visual depois de evoluir: continua se a nova espécie também tiver essa variação (ex.: Spewpa Polar → Vivillon Polar). */
export function variantAfter(mon, to) {
  const v = mon?.v;
  return v && (getSpecies(to)?.variants || []).includes(v) ? v : undefined;
}

export const VARIANT_PT = { sandy: 'Areia', trash: 'Lixo', dusk: 'Ritmo Próprio' };
const TIME_PT = { day: 'de dia', night: 'à noite' };
const SEX_PT = { f: '♀', m: '♂' };
/** Texto curto de uma opção de evolução, ex.: "Nv. 36", "🪨 Pedra do Trovão", "Nv. 25 à noite". */
export function evoCondText(e, itemName = id => id) {
  const parts = [];
  if (e.item) parts.push(itemName(e.item)); else if (e.lvl) parts.push(`Nv. ${e.lvl}`);
  if (e.time) parts.push(TIME_PT[e.time]);
  if (e.sex) parts.push(SEX_PT[e.sex]);
  if (e.v) parts.push(`forma ${VARIANT_PT[e.v] || e.v}`);
  return parts.join(' ');
}

const itemLabel = id => (ITEMS[id] ? `${ITEMS[id].emoji ? ITEMS[id].emoji + ' ' : ''}${ITEMS[id].name}` : id);
/** Lista legível: [{ to, name, how }] — ex.: { name: 'Raichu', how: '⚡ Pedra do Trovão' }. */
export function evoList(spId) {
  const sp = getSpecies(spId);
  return (sp?.evos || []).filter(e => getSpecies(e.to)).map(e => ({ to: e.to, name: getSpecies(e.to).name, how: evoCondText(e, itemLabel), item: e.item || null }));
}
/** Frase curta: "Raichu (⚡ Pedra do Trovão)" ou "Vileplume (🍃 Pedra da Folha) ou Bellossom (☀️ Pedra do Sol)". */
export function evoSummary(spId) {
  const l = evoList(spId);
  return l.length ? l.map(x => `${x.name} (${x.how})`).join(' ou ') : '';
}
