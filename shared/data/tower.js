// 🗼 v51 — Torre de Batalha: entrada com ouro, time de 3 da Coleção no Nv. 50, sequência de 7 duelos contra CPUs
// cada vez mais fortes (o 7º é o 👑 Mestre da Torre). A sequência continua de série em série até perder.
// Vitórias dão PB (Pontos de Batalha) para trocar na loja da Torre. Megas liberadas (precisa do 🔗 Bracelete).
export const TOWER_PRICE = 2000;   // 🪙 por série de 7
export const TOWER_TEAM = 3, TOWER_LEVEL = 50, TOWER_SET = 7;
export const pbForWin = (streak, boss) => (boss ? 10 : 1 + Math.min(4, Math.floor(streak / 7)));
export const SET_CLEAR_BONUS = 5;

// times da CPU por fase (quanto maior a sequência, mais fortes)
export const TOWER_POOLS = [
  // fase 1 (sequência 0–6)
  ['raichu', 'sandslash', 'nidoking', 'nidoqueen', 'golduck', 'primeape', 'poliwrath', 'rapidash', 'dodrio', 'electrode', 'hitmonlee', 'hitmonchan', 'kingler', 'scyther',
    'ampharos', 'azumarill', 'quagsire', 'magcargo', 'mightyena', 'breloom', 'manectric', 'camerupt', 'crawdaunt', 'luxray', 'roserade', 'lopunny', 'zebstrika', 'krookodile'],
  // fase 2 (7–20)
  ['arcanine', 'alakazam', 'machamp', 'gengar', 'gyarados', 'lapras', 'jolteon', 'vaporeon', 'snorlax', 'scizor', 'heracross', 'houndoom', 'kingdra', 'blaziken',
    'swampert', 'sceptile', 'gardevoir', 'milotic', 'lucario', 'togekiss', 'weavile', 'mamoswine', 'excadrill', 'chandelure', 'aegislash', 'greninja', 'talonflame', 'mimikyu'],
  // fase 3 (21+)
  ['dragonite', 'tyranitar', 'salamence', 'metagross', 'garchomp', 'hydreigon', 'goodra', 'kommo_o', 'volcarona', 'gyarados', 'scizor', 'gengar', 'lucario', 'gardevoir',
    'aerodactyl', 'heracross', 'mawile', 'medicham', 'aggron', 'blaziken', 'swampert', 'sceptile']
];
export const BOSS_LEGENDS = ['zapdos', 'moltres', 'articuno', 'raikou', 'entei', 'suicune', 'latios', 'latias', 'heatran', 'cobalion', 'terrakion', 'virizion', 'tapu_koko', 'tapu_lele'];
export const BOSS_NAME = 'Mestre da Torre Aurélio';
export const TOWER_NAMES = ['Ás Treinadora Lívia', 'Veterano Caio', 'Ás Treinador Davi', 'Domadora Íris', 'Cientista Bento', 'Faixa-Preta Rui', 'Ninja Kenji',
  'Nadadora Mel', 'Montanhista Otto', 'Psíquica Sofia', 'Mergulhador Téo', 'Pescador Zeca', 'Dama Beatriz', 'Cavalheiro Hugo', 'Criadora Nina', 'Dragoeiro Igor'];
export const tierOfStreak = s => (s >= 21 ? 2 : s >= 7 ? 1 : 0);

// 🛒 loja da Torre (PB)
export const TOWER_SHOP = {
  rare_candy: { pb: 8, qty: 1 }, tm: { pb: 12, qty: 1 },
  quick_claw: { pb: 20, qty: 1 }, focus_sash: { pb: 20, qty: 1 }, leftovers: { pb: 48, qty: 1 }, choice_band: { pb: 48, qty: 1 },
  plate: { pb: 25, qty: 1, plate: true },
  ultra_ball: { pb: 4, qty: 5 }, master_ball: { pb: 160, qty: 1 }, legend_charm: { pb: 140, qty: 3 }
};
