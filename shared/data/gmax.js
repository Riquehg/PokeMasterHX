// 🔴 Gigantamax (v55) — funciona como a Mega, com as mesmas travas:
//  • só nas partidas com "💎 Megas e Gigantamax" liberado (Liga Série B/A, sala personalizada, 🗼 Torre);
//  • o jogador precisa da 🔴 Pulseira Dynamax (cai SÓ em Raids Gigantamax, raríssima — nada pago);
//  • o Pokémon precisa ter o ✨ Fator Gigantamax (capturado numa Raid Gigantamax, raro na natureza, ou 🍲 Sopa Max);
//  • 1 vez por batalha: OU Mega OU Gigantamax; dura 3 rodadas (ou até sair de campo) e depois volta ao normal.
import { SPECIES } from './pokemon.js';

export const GMAX_ROUNDS = 3;
export const GMAX_HP = 1.5;        // HP máximo ×1,5 (a % de HP é mantida)
export const GMAX_STR = 1.2;       // golpes Max: força ×1,2
export const GMAX_RAID_CHANCE = 0.22; // v64: era 0,15 — // Raid comum (sem Mega) vira Raid Gigantamax se o chefe tiver forma Gigantamax
export const BAND_ID = 'dynamax_band';
export const BAND_DROP = 0.01;     // 🔴 Pulseira: 1% por participante de Raid Gigantamax (se ainda não tiver)
export const FACTOR_WILD = 0.01;   // selvagem com forma Gigantamax nasce com o Fator (1%)
export const SOUP_ID = 'max_soup';
export const MUSHROOM_ID = 'max_mushroom';
export const MUSHROOM_RAID = [1, 2];
export const GMAX_WILD_CHANCE = 0.02; // 🔴 v64: encontro com energia Gigantamax nas casas de tier 3+ (não dá para capturar)
/** 🔴 v64: prêmios do Gigantamax selvagem pela raridade: Cogumelos Max, chance de Sopa Max e de Pulseira. */
export const GMAX_WILD_DROPS = { 1: { mu: [1, 1], soup: 0.02, band: 0 }, 2: { mu: [1, 2], soup: 0.03, band: 0 }, 3: { mu: [1, 2], soup: 0.05, band: 0.002 }, 4: { mu: [1, 3], soup: 0.07, band: 0.004 }, 5: { mu: [2, 3], soup: 0.1, band: 0.006 } }; // 🍄 Cogumelos Max por participante de Raid Gigantamax

/** GMAX[base] = { base, sp ('gmax_<base>'), name, file } */
export const GMAX = {};
for (const s of Object.values(SPECIES)) {
  if (!s.gmax || s.mega) continue;
  const sp = `gmax_${s.id}`;
  GMAX[s.id] = { base: s.id, sp, name: `${s.name} Gigantamax`, file: `${s.file}-gmax` };
  // forma Gigantamax como "espécie" (só existe na batalha)
  SPECIES[sp] = {
    ...s, id: sp, name: `${s.name} Gigantamax`, hp: Math.round(s.hp * GMAX_HP), str: Math.round(s.str * GMAX_STR * 10) / 10,
    gmaxOf: s.id, file: `${s.file}-gmax`, evos: [], evolvesTo: null, evolutionLevel: null, evolvesFrom: null, variants: undefined, fem: false, gmax: false
  };
}
export const GMAX_BASES = Object.keys(GMAX);
/** Pode dar Gigantamax agora? (Pokémon com Fator e forma Gigantamax) */
export const gmaxFor = mon => (mon && mon.gx && !mon.tf && GMAX[mon.sp] ? GMAX[mon.sp] : null);
