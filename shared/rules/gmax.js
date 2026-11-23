// 🔴 Raids Gigantamax (v55): o chefe vem Gigantamax; vencer dá 🍄 Cogumelos Max (Sopa Max) e, raríssimo, a 🔴 Pulseira Dynamax.
// Quem captura o chefe leva o Pokémon com o ✨ Fator Gigantamax.
import { GMAX, GMAX_BASES, GMAX_RAID_CHANCE, BAND_ID, BAND_DROP, MUSHROOM_ID, MUSHROOM_RAID } from '../data/gmax.js';
import { getSpecies } from '../data/pokemon.js';
import { addItem, log, fx } from './helpers.js';
import { transformInto } from './monsters.js';
export { GMAX_RAID_CHANCE };

/** Chefe Gigantamax para a Raid (lendários com Gigantamax só no Santuário). */
export function pickRaidGmax(rng, shrine) {
  const list = GMAX_BASES.filter(id => !getSpecies(id)?.form && (shrine || !getSpecies(id)?.legendary));
  return list.length ? GMAX[rng.pick(list)] : null;
}
/** Deixa o chefe Gigantamax (fica assim a luta inteira). */
export function makeGmaxBoss(mon, g) {
  transformInto(mon, g.sp, Array.isArray(mon.moves) ? mon.moves : null);
  mon.gmaxBoss = g.base;
  return mon;
}
/** Prêmios de Raid Gigantamax para um jogador. Devolve linhas para o log da raid. */
export function grantGmaxRewards(state, rng, p) {
  const out = [];
  const n = rng.int(MUSHROOM_RAID[0], MUSHROOM_RAID[1]);
  addItem(p, MUSHROOM_ID, n);
  out.push(`🍄 ${p.name} ganhou ${n}x Cogumelo Max!`);
  log(state, `🍄 ${p.name} ganhou ${n}x Cogumelo Max (ingrediente da 🍲 Sopa Max).`, 'good');
  if (!p.dynaKey && !p.items[BAND_ID] && rng.chance(BAND_DROP)) {
    addItem(p, BAND_ID, 1);
    p.dynaKey = true;
    out.push(`🔴 ${p.name} encontrou a PULSEIRA DYNAMAX!`);
    log(state, `🔴 ${p.name} encontrou a raríssima PULSEIRA DYNAMAX na Raid Gigantamax! Agora pode dar Gigantamax.`, 'shiny');
    fx(state, { k: 'bracelet', pid: p.id, band: true });
  }
  return out;
}
