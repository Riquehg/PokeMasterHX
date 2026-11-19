// Bônus de dano dos modos de jogo (sem dependências, para a batalha poder importar sem ciclo).
// Conquista: cada cidade dominada dá +10% nos golpes do tipo do ginásio dela.
export const CONQUEST_TYPE_BONUS = 0.1;

export function conquestMult(state, pid, moveType, gyms) {
  const c = state?.conquest;
  if (!c || !pid) return 1;
  let bonus = 0;
  for (const g of gyms) if (c.owners[g.id] === pid && g.type === moveType) bonus += CONQUEST_TYPE_BONUS;
  return 1 + bonus;
}
