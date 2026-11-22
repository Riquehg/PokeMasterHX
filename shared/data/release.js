// 🕊️ Soltar Pokémon da Coleção: o Professor paga ouro conforme a raridade (v52).
// Valores modestos de propósito (ouro já sobra no jogo); recuperar o Pokémon devolve o ouro.
import { getSpecies, categoryOf } from './pokemon.js';

export const RELEASE_BY_TIER = { 1: 15, 2: 30, 3: 60, 4: 120, 5: 200 };
export const RELEASE_BY_CATEGORY = { legendary: 600, ultra: 800, mythical: 900 };
export const RELEASE_SHINY_MULT = 4;

/** Ouro que o jogador recebe ao soltar este Pokémon. */
export function releaseGold(mon) {
  const sp = getSpecies(mon?.sp);
  if (!sp) return 0;
  const base = RELEASE_BY_CATEGORY[categoryOf(sp)] || RELEASE_BY_TIER[sp.tier] || 15;
  const lvl = Math.max(1, Math.min(60, Number(mon.lvl) || 1));
  const g = base * (mon.shiny ? RELEASE_SHINY_MULT : 1) * (1 + lvl / 100);
  return Math.round(g / 5) * 5;
}

/** Rótulo curto da raridade (para a confirmação na tela). */
export function releaseLabel(mon) {
  const sp = getSpecies(mon?.sp);
  const cat = categoryOf(sp);
  const r = cat === 'mythical' ? 'Mítico' : cat === 'ultra' ? 'Ultra Criatura' : cat === 'legendary' ? 'Lendário' : ['Comum', 'Comum', 'Incomum', 'Raro', 'Muito raro', 'Raríssimo'][sp?.tier || 1];
  return mon?.shiny ? `${r} ✨ shiny` : r;
}
