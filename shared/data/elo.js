// Elos do modo Competitivo (rating Elo começa em 1000).
export const ELO_TIERS = [
  { id: 'bronze',      name: 'Bronze',      icon: '🥉', min: 0,    color: '#b07a4a' },
  { id: 'prata',       name: 'Prata',       icon: '🥈', min: 950,  color: '#c0c7d1' },
  { id: 'ouro',        name: 'Ouro',        icon: '🥇', min: 1100, color: '#f2c14e' },
  { id: 'platina',     name: 'Platina',     icon: '💠', min: 1250, color: '#5fd3c4' },
  { id: 'diamante',    name: 'Diamante',    icon: '💎', min: 1400, color: '#6fb6ff' },
  { id: 'mestre',      name: 'Mestre',      icon: '🔮', min: 1550, color: '#b07cff' },
  { id: 'grao_mestre', name: 'Grão-Mestre', icon: '👑', min: 1700, color: '#ff5a5a' }
];

export function eloOf(rating = 1000) {
  let t = ELO_TIERS[0];
  for (const x of ELO_TIERS) if (rating >= x.min) t = x;
  const i = ELO_TIERS.indexOf(t);
  const next = ELO_TIERS[i + 1] || null;
  return { ...t, next, toNext: next ? next.min - rating : 0 };
}
