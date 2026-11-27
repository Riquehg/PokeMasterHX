// 🔴 Raids Gigantamax (v55): o chefe vem Gigantamax; vencer dá 🍄 Cogumelos Max (Sopa Max) e, raríssimo, a 🔴 Pulseira Dynamax.
// Quem captura o chefe leva o Pokémon com o ✨ Fator Gigantamax.
import { GMAX, GMAX_BASES, GMAX_RAID_CHANCE, GMAX_WILD_CHANCE, GMAX_WILD_DROPS, BAND_ID, BAND_DROP, MUSHROOM_ID, MUSHROOM_RAID, SOUP_ID } from '../data/gmax.js';
import { getSpecies } from '../data/pokemon.js';
import { addItem, log, fx } from './helpers.js';
import { transformInto } from './monsters.js';
export { GMAX_RAID_CHANCE, GMAX_WILD_CHANCE };
/** 🔴 v64: Gigantamax selvagem (não lendário, tier até o da casa). */
export function pickWildGmax(rng, tier) {
  const list = GMAX_BASES.filter(id => { const s = getSpecies(id); return s && !s.form && !s.legendary && !s.mythical && s.tier <= Math.max(3, tier); });
  return list.length ? GMAX[rng.pick(list)] : null;
}
/** 🔴 v64: prêmios do Gigantamax selvagem pela raridade. */
export function grantWildGmaxRewards(state, rng, p, base) {
  const d = GMAX_WILD_DROPS[Math.min(5, Math.max(1, getSpecies(base)?.tier || 1))];
  const n = rng.int(d.mu[0], d.mu[1]);
  addItem(p, MUSHROOM_ID, n);
  log(state, `🍄 ${p.name} ganhou ${n}x Cogumelo Max do ${getSpecies(base)?.name} Gigantamax.`, 'good');
  if (rng.chance(d.soup)) { addItem(p, SOUP_ID, 1); log(state, `🍲 Sobrou uma Sopa Max! ${p.name} pegou.`, 'shiny'); }
  if (d.band && !p.dynaKey && !p.items[BAND_ID] && rng.chance(d.band)) {
    addItem(p, BAND_ID, 1); p.dynaKey = true;
    log(state, `🔴 ${p.name} encontrou a raríssima PULSEIRA DYNAMAX! Agora pode dar Gigantamax.`, 'shiny');
    fx(state, { k: 'bracelet', pid: p.id, band: true });
  }
}

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
