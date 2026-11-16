// Regras do Torneio (duelos) e da Copa (chaveamento eliminatório).
export const DUEL_LEVEL_CAP = 50;                  // nível máximo nos duelos (justo para todos)
export const CUP_MAX_PLAYERS = 8;
export const CUP_PRIZE = { champion: 5, runnerUp: 2 }; // 💎 por treinador HUMANO participante
export const CUP_MIN_HUMANS_FOR_PRIZE = 4;         // evita "farmar" diamantes contra CPUs
export const CUP_ELO_BONUS = 15;                   // bônus de Elo para o campeão (com prêmio)

export function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(2, p);
}
