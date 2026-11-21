// 🎁 Prêmio diário com sequência (horário de Brasília). Perdeu um dia = volta para o dia 1.
// Ouro vai para a conta; itens vão para a 🎒 Mochila da conta. A cada 28 dias seguidos: Master Ball de bônus.
export const DAILY_REWARDS = [
  { gold: 300 },
  { items: { great_ball: 5 } },
  { gold: 500 },
  { items: { ultra_ball: 5 } },
  { items: { tm: 1 } },
  { gold: 800 },
  { items: { rainbow_ball: 1, tm: 1 } }
];
export const STREAK_BONUS_EVERY = 28;
export const STREAK_BONUS = { master_ball: 1 };

const brt = (now = new Date()) => new Date(now.getTime() - 3 * 3600000);
export const loginDay = (now = new Date()) => brt(now).toISOString().slice(0, 10);

/** Situação do diário: { canClaim, nextStreak, cycleDay (1..7), reward, bonus } */
export function dailyStatus(login, now = new Date()) {
  const today = loginDay(now);
  const yesterday = loginDay(new Date(now.getTime() - 86400000));
  const L = login || {};
  if (L.last === today) {
    const day = ((Math.max(1, L.streak | 0) - 1) % 7) + 1;
    return { canClaim: false, streak: L.streak | 0, nextStreak: L.streak | 0, cycleDay: day, reward: DAILY_REWARDS[day - 1], claimedToday: true };
  }
  const nextStreak = L.last === yesterday ? (L.streak | 0) + 1 : 1;
  const day = ((nextStreak - 1) % 7) + 1;
  return { canClaim: true, streak: L.last === yesterday ? L.streak | 0 : 0, nextStreak, cycleDay: day, reward: DAILY_REWARDS[day - 1], bonus: nextStreak % STREAK_BONUS_EVERY === 0 ? STREAK_BONUS : null, broke: !!L.last && L.last !== yesterday };
}
