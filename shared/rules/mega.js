// 💎 Recompensas Mega dentro da partida (Mega Raids e encontros com energia Mega).
import { MEGAS, MEGA_KEYS, MEGA_RAID_FRAGS, MEGA_WILD_FRAGS, BRACELET_DROP, BRACELET_ID, MEGA_RAID_CHANCE, MEGA_WILD_CHANCE, fragItemId } from '../data/megas.js';
import { getSpecies } from '../data/pokemon.js';
import { addItem, log, fx, speciesName } from './helpers.js';
import { megaEvolveMon } from './monsters.js';

const LEGEND_MEGA = new Set(['mewtwo', 'latias', 'latios', 'rayquaza', 'diancie']);
export { MEGA_RAID_CHANCE, MEGA_WILD_CHANCE };

/** Escolhe uma Mega para o chefe da Raid (lendárias só no Santuário / casa Amarela). */
export function pickRaidMega(rng, shrine) {
  const list = MEGA_KEYS.map(k => MEGAS[k]).filter(m => (shrine ? true : !LEGEND_MEGA.has(m.base)));
  return rng.pick(list);
}
/** Encontro selvagem com energia Mega (não dá para capturar). */
export function pickWildMega(rng, tier) {
  const list = MEGA_KEYS.map(k => MEGAS[k]).filter(m => !LEGEND_MEGA.has(m.base) && getSpecies(m.base).tier <= Math.max(3, tier));
  return rng.pick(list);
}
/** O chefe vira Mega (fica marcado com a chave para dar os fragmentos certos). */
export function makeMegaBoss(mon, m) {
  megaEvolveMon(mon, m.sp);
  mon.megaBoss = m.key;
  return mon;
}

/** Prêmios Mega para um jogador. raid=true: Mega Raid (pode cair o Bracelete). Devolve linhas para o log da raid. */
export function grantMegaRewards(state, rng, p, key, raid) {
  const out = [];
  const m = MEGAS[key];
  if (!m) return out;
  const [a, b] = raid ? MEGA_RAID_FRAGS : MEGA_WILD_FRAGS;
  const n = rng.int(a, b);
  addItem(p, fragItemId(m), n);
  out.push(`💠 ${p.name} ganhou ${n}x Fragmento de ${m.stoneName}!`);
  log(state, `💠 ${p.name} ganhou ${n}x Fragmento de ${m.stoneName} (${m.name}).`, 'good');
  if (raid && !p.megaKey && !p.items[BRACELET_ID] && rng.chance(BRACELET_DROP)) {
    addItem(p, BRACELET_ID, 1);
    p.megaKey = true; // já pode usar nesta partida
    out.push(`🔗 ${p.name} encontrou o BRACELETE MEGA!`);
    log(state, `🔗 ${p.name} encontrou o raríssimo BRACELETE MEGA na Mega Raid! Agora pode Mega Evoluir.`, 'shiny');
    fx(state, { k: 'bracelet', pid: p.id });
  }
  return out;
}
export const megaName = key => (MEGAS[key] ? speciesName(MEGAS[key].sp) : '');
