// 🏟️ v65 — Guildas: grupos de até 8 treinadores com nome, sigla e emblema. Cada membro soma Pontos de Guilda na
// semana (partidas salvas, Torre, Raids em Grupo, Liga das Séries). Ranking semanal; a guilda campeã da semana
// passada pode resgatar 💎 (só cosmético). Tudo é calculado na hora de abrir a tela (sem cron, economiza cota).
export const GUILD_MAX = 8;
export const GUILD_PRICE = 5000;       // 🪙 para fundar
export const GUILD_PRIZE = 20;         // 💎 por membro da guilda campeã da semana
export const GUILD_EMBLEMS = ['🛡️', '⚔️', '🐉', '🔥', '💧', '⚡', '🌿', '❄️', '🌙', '☀️', '⭐', '👑', '🦅', '🐺', '🦊', '🐢', '🌀', '💎', '🍀', '🎯'];
export const GUILD_POINTS = { match: 10, badge: 5, capture: 1, win: 30, tower: 8, raid: 25, serie: 6 };

/** Semana (segunda a domingo, horário de Brasília). */
export const weekKey = (now = Date.now()) => Math.floor((now - 3 * 3600e3 + 3 * 86400e3) / 604800e3);

/** Soma pontos de guilda no stats (vira a semana sozinho e guarda a anterior). Devolve o stats novo. */
export function addGuildPts(stats, n, now = Date.now()) {
  if (!stats?.guild || !(n > 0)) return stats;
  const wk = weekKey(now);
  const gw = stats.gw || {};
  const next = gw.w === wk ? { ...gw, p: (gw.p || 0) + n } : { w: wk, p: n, lw: gw.w ?? null, lp: gw.w === wk - 1 ? gw.p || 0 : 0 };
  return { ...stats, gw: next };
}

/** Pontos do membro na semana atual (wk) ou na anterior (wk - 1). */
export function memberPts(stats, wk) {
  const gw = stats?.gw || {};
  if (gw.w === wk) return gw.p || 0;
  if (gw.lw === wk) return gw.lp || 0;
  return 0;
}

export const cleanGuildName = s => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
export const cleanTag = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
