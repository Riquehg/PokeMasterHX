// 🧭 v60 — Habilidades de campo: Pokémon da equipe ajudam no tabuleiro (fora da batalha), com recarga.
// Para usar: ter na equipe um Pokémon do tipo, de pé (HP > 0), que obedeça e com nível mínimo. Uma por turno,
// antes de rolar o dado. Pensadas para ajudar sem quebrar o jogo: recarga longa e efeitos modestos.
import { getSpecies } from './pokemon.js';
import { canUse } from '../rules/helpers.js';

export const FIELD_SKILLS = {
  teleport: { name: 'Teletransporte', who: 'Psíquico', icon: '🌀', types: ['psychic'], minLvl: 18, cd: 8, replacesRoll: true,
    desc: 'Um Pokémon Psíquico leva você até uma cidade que você já visitou (no lugar de rolar o dado).' },
  aroma: { name: 'Aroma Doce', who: 'Grama ou Fada', icon: '🌸', types: ['grass', 'fairy'], minLvl: 12, cd: 5, replacesRoll: true,
    desc: 'Um Pokémon Grama ou Fada atrai um Pokémon selvagem para a casa 🌿 onde você está (no lugar de rolar). 25% de vir de um tier acima.' },
  tailwind: { name: 'Vento a Favor', who: 'Voador', icon: '💨', types: ['flying'], minLvl: 12, cd: 4, replacesRoll: false,
    desc: 'Um Pokémon Voador sopra a seu favor: +2 casas na próxima rolagem.' },
  dig: { name: 'Escavar', who: 'Terra ou Pedra', icon: '⛏️', types: ['ground', 'rock'], minLvl: 15, cd: 7, replacesRoll: false,
    desc: 'Um Pokémon Terra ou Pedra cava e acha um item (Poção, Pokébola, Great Ball, Reviver ou, raramente, um item de evolução).' },
  surf: { name: 'Surfar', who: 'Água', icon: '🌊', types: ['water'], minLvl: 15, cd: 5, replacesRoll: true,
    desc: 'Um Pokémon Água surfa com você: rola o dado duas vezes e fica com o maior.' }
};

/** Pokémon da equipe que pode usar a habilidade (o de maior nível), ou null. */
export function fieldUser(p, id) {
  const sk = FIELD_SKILLS[id];
  if (!sk || !p) return null;
  return [...(p.team || [])].filter(m => m.hp > 0 && m.lvl >= sk.minLvl && canUse(p, m) && (getSpecies(m.sp)?.types || []).some(t => sk.types.includes(t)))
    .sort((a, b) => b.lvl - a.lvl)[0] || null;
}

/** Turnos que faltam para usar de novo (0 = pronto). */
export const fieldCooldown = (state, p, id) => Math.max(0, (p.fieldCd?.[id] || 0) - (state.turn || 0));

/** Lista para a interface: { id, ...skill, mon, wait }. */
export function fieldOptions(state, p) {
  return Object.entries(FIELD_SKILLS).map(([id, sk]) => ({ id, ...sk, mon: fieldUser(p, id), wait: fieldCooldown(state, p, id) })).filter(o => o.mon);
}
