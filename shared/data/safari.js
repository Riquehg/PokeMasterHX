// 🌿 v50 — Zona Safári: modo de captura pago com ouro (sem batalha). Andar → encontro → 🥎 Safari Ball / 🍓 Isca / 🪨 Pedra / 🏃 Fugir.
// Termina quando acabam as bolas ou os passos. Pokémon raros e regionais por zona; shiny ×2.
export const SAFARI_PRICE = 3000;      // 🪙 por entrada
export const SAFARI_DAILY = 3;         // entradas por dia (horário de Brasília)
export const SAFARI_BALLS = 30, SAFARI_STEPS = 25;
export const SAFARI_ENCOUNTER = 0.65;  // chance de achar um Pokémon a cada passo
export const SAFARI_SHINY_MULT = 2;
export const SAFARI_LEVELS = [15, 38];

// raridade → [chance base de captura, chance base de fugir]
export const RARITY = {
  c: { name: 'Comum', catch: 0.45, flee: 0.12 },
  u: { name: 'Incomum', catch: 0.3, flee: 0.22 },
  r: { name: 'Raro', catch: 0.15, flee: 0.33 },
  v: { name: 'Muito raro', catch: 0.07, flee: 0.45 }
};
export const ROCK = { catch: 1.6, flee: 1.6 }, BAIT = { catch: 0.75, flee: 0.5 }, MOOD_TURNS = 2;

// zona → [espécie, raridade, peso]
export const SAFARI_ZONES = {
  planicie: { name: 'Planície', icon: '🌾', bg: 'linear-gradient(#bfe6ff, #e8f6d0 45%, #8fcf6a 46%, #6db04c)', pool: [
    ['doduo', 'c', 10], ['nidoran_f', 'c', 8], ['nidoran_m', 'c', 8], ['ponyta', 'c', 8], ['mareep', 'c', 8], ['exeggcute', 'u', 6], ['rhyhorn', 'u', 6],
    ['girafarig', 'u', 5], ['stantler', 'u', 5], ['miltank', 'u', 4], ['tauros', 'r', 3], ['kangaskhan', 'r', 2], ['lickitung', 'r', 2], ['skiddo', 'u', 4],
    ['eevee', 'r', 1.5], ['chansey', 'v', 0.6], ['mudbray', 'u', 4], ['tropius', 'r', 1.2]] },
  lago: { name: 'Lago', icon: '🌊', bg: 'linear-gradient(#c9ecff, #a6dcff 40%, #3fa2e0 41%, #2479b8)', pool: [
    ['magikarp', 'c', 12], ['psyduck', 'c', 9], ['goldeen', 'c', 9], ['poliwag', 'c', 8], ['wooper', 'c', 8], ['lotad', 'c', 7], ['slowpoke', 'u', 6],
    ['marill', 'u', 6], ['corphish', 'u', 5], ['feebas', 'r', 2], ['dratini', 'r', 1.6], ['goomy', 'r', 1.2], ['lapras', 'v', 0.5]] },
  floresta: { name: 'Floresta', icon: '🌲', bg: 'linear-gradient(#9fd6a0, #5ea860 45%, #3e7d3f 46%, #2c5e2d)', pool: [
    ['paras', 'c', 10], ['venonat', 'c', 9], ['oddish', 'c', 9], ['bellsprout', 'c', 9], ['shroomish', 'c', 7], ['nincada', 'c', 7], ['aipom', 'u', 6],
    ['teddiursa', 'u', 6], ['combee', 'u', 5], ['cutiefly', 'u', 5], ['kecleon', 'r', 2], ['scyther', 'r', 2], ['pinsir', 'r', 2], ['heracross', 'r', 2], ['riolu', 'v', 0.6]] },
  montanha: { name: 'Montanha', icon: '⛰️', bg: 'linear-gradient(#d6e4f0, #b9a48a 45%, #8a7355 46%, #6b573f)', pool: [
    ['geodude', 'c', 12], ['sandshrew', 'c', 9], ['aron', 'c', 8], ['numel', 'c', 8], ['roggenrola', 'c', 7], ['phanpy', 'u', 6], ['drilbur', 'u', 6],
    ['onix', 'u', 5], ['rockruff', 'u', 4], ['axew', 'r', 1.6], ['larvitar', 'r', 1.2], ['bagon', 'r', 1.2], ['gible', 'r', 1], ['deino', 'v', 0.5], ['jangmo_o', 'v', 0.5]] }
};
export const brtDaySafari = (ms = Date.now()) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
