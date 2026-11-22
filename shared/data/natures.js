// Naturezas (Natures) — 25, com os nomes oficiais dos jogos. Como este jogo tem 3 atributos
// (HP, Ataque, Defesa e Velocidade), cada natureza dá +10% em um e −10% em outro (5 são neutras).
// Velocidade decide quem ataca primeiro quando os níveis empatam/estão próximos.

export const NATURES = {
  // neutras
  Hardy: null, Docile: null, Serious: null, Bashful: null, Quirky: null,
  // +Ataque
  Lonely: ['atk', 'def'], Mild: ['atk', 'def'], Naughty: ['atk', 'hp'], Rash: ['atk', 'hp'],
  Brave: ['atk', 'spe'], Adamant: ['atk', 'spe'], Quiet: ['atk', 'spe'],
  // +Defesa (v42 — como nos jogos: Bold, Impish, Relaxed, Lax, Calm, Careful, Sassy)
  Bold: ['def', 'atk'], Impish: ['def', 'atk'], Calm: ['def', 'atk'], Careful: ['def', 'atk'],
  Relaxed: ['def', 'spe'], Sassy: ['def', 'spe'], Lax: ['def', 'hp'],
  // +HP
  Modest: ['hp', 'atk'], Gentle: ['hp', 'def'],
  // +Velocidade
  Timid: ['spe', 'atk'], Jolly: ['spe', 'atk'], Hasty: ['spe', 'def'], Naive: ['spe', 'hp']
};

export const NATURE_NAMES = Object.keys(NATURES);
export const STAT_LABELS = { atk: 'Ataque', hp: 'HP', spe: 'Velocidade', def: 'Defesa' };

/** Multiplicador de um atributo para uma natureza (1.1, 0.9 ou 1). */
export function natureMult(nature, stat) {
  const n = NATURES[nature];
  if (!n) return 1;
  if (n[0] === stat) return 1.1;
  if (n[1] === stat) return 0.9;
  return 1;
}

export function natureLabel(nature) {
  const n = NATURES[nature];
  if (nature === undefined || nature === null) return 'Sem natureza';
  if (!n) return `${nature} (neutra)`;
  return `${nature} (+${STAT_LABELS[n[0]]}, −${STAT_LABELS[n[1]]})`;
}
