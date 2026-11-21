// 💎 Mega Evolução (48 clássicas + 20 de Legends: Z-A = 68 formas). Precisa do 🔗 Bracelete Mega (conta) + a Megapedra segurada pelo Pokémon.
// Na batalha: 1 Mega por batalha, ação grátis; dura até o fim da batalha (depois volta à forma normal).
// As formas Mega entram em SPECIES como 'mega_<id>' (fora da Pokédex, dos selvagens e dos ovos).
// Imagens (bucket "sprites"): megas/<arquivo>.png, megas/shiny/<arquivo>.png · pedras: items/megastones/<pedra>.png ·
// bracelete: items/mega-bracelet.png (nomes no padrão do Pokémon Showdown). Lista completa: docs/MEGAS-IMAGENS.md
import { SPECIES } from './pokemon.js';

// id: [espécie base, arquivo da imagem, pedra (id = arquivo), nome da pedra, tipos (null = iguais), {hp, str, spe}]
const RAW = [
  ['venusaur', 'venusaur-mega', 'venusaurite', 'Venusaurita', null, { hp: 1.05, str: 1.25, spe: 1 }],
  ['charizard_x', 'charizard-megax', 'charizardite-x', 'Charizardita X', ['fire', 'dragon'], { hp: 1, str: 1.4, spe: 1.05 }, 'charizard'],
  ['charizard_y', 'charizard-megay', 'charizardite-y', 'Charizardita Y', null, { hp: 1, str: 1.4, spe: 1.05 }, 'charizard'],
  ['blastoise', 'blastoise-mega', 'blastoisinite', 'Blastoisinita', null, { hp: 1.05, str: 1.3, spe: 1 }],
  ['beedrill', 'beedrill-mega', 'beedrillite', 'Beedrillita', null, { hp: 1, str: 1.45, spe: 1.25 }],
  ['pidgeot', 'pidgeot-mega', 'pidgeotite', 'Pidgeotita', null, { hp: 1, str: 1.3, spe: 1.12 }],
  ['alakazam', 'alakazam-mega', 'alakazite', 'Alakazita', null, { hp: 1, str: 1.3, spe: 1.12 }],
  ['slowbro', 'slowbro-mega', 'slowbronite', 'Slowbronita', null, { hp: 1.15, str: 1.2, spe: 1 }],
  ['gengar', 'gengar-mega', 'gengarite', 'Gengarita', null, { hp: 1, str: 1.35, spe: 1.1 }],
  ['kangaskhan', 'kangaskhan-mega', 'kangaskhanite', 'Kangaskhanita', null, { hp: 1.05, str: 1.35, spe: 1.05 }],
  ['pinsir', 'pinsir-mega', 'pinsirite', 'Pinsirita', ['bug', 'flying'], { hp: 1, str: 1.35, spe: 1.1 }],
  ['gyarados', 'gyarados-mega', 'gyaradosite', 'Gyaradosita', ['water', 'dark'], { hp: 1.05, str: 1.35, spe: 1 }],
  ['aerodactyl', 'aerodactyl-mega', 'aerodactylite', 'Aerodactylita', null, { hp: 1, str: 1.3, spe: 1.15 }],
  ['mewtwo_x', 'mewtwo-megax', 'mewtwonite-x', 'Mewtwonita X', ['psychic', 'fighting'], { hp: 1, str: 1.4, spe: 1.05 }, 'mewtwo'],
  ['mewtwo_y', 'mewtwo-megay', 'mewtwonite-y', 'Mewtwonita Y', null, { hp: 0.95, str: 1.4, spe: 1.12 }, 'mewtwo'],
  ['ampharos', 'ampharos-mega', 'ampharosite', 'Ampharosita', ['electric', 'dragon'], { hp: 1.05, str: 1.35, spe: 0.95 }],
  ['steelix', 'steelix-mega', 'steelixite', 'Steelixita', null, { hp: 1.15, str: 1.25, spe: 1 }],
  ['scizor', 'scizor-mega', 'scizorite', 'Scizorita', null, { hp: 1.05, str: 1.3, spe: 1.05 }],
  ['heracross', 'heracross-mega', 'heracronite', 'Heracronita', null, { hp: 1, str: 1.45, spe: 0.95 }],
  ['houndoom', 'houndoom-mega', 'houndoominite', 'Houndoominita', null, { hp: 1, str: 1.3, spe: 1.12 }],
  ['tyranitar', 'tyranitar-mega', 'tyranitarite', 'Tyranitarita', null, { hp: 1.1, str: 1.3, spe: 1 }],
  ['sceptile', 'sceptile-mega', 'sceptilite', 'Sceptilita', ['grass', 'dragon'], { hp: 1, str: 1.3, spe: 1.12 }],
  ['blaziken', 'blaziken-mega', 'blazikenite', 'Blazikenita', null, { hp: 1, str: 1.35, spe: 1.1 }],
  ['swampert', 'swampert-mega', 'swampertite', 'Swampertita', null, { hp: 1.05, str: 1.35, spe: 1 }],
  ['gardevoir', 'gardevoir-mega', 'gardevoirite', 'Gardevoirita', null, { hp: 1, str: 1.35, spe: 1.08 }],
  ['sableye', 'sableye-mega', 'sablenite', 'Sablenita', null, { hp: 1.15, str: 1.25, spe: 0.95 }],
  ['mawile', 'mawile-mega', 'mawilite', 'Mawilita', null, { hp: 1.1, str: 1.5, spe: 1 }],
  ['aggron', 'aggron-mega', 'aggronite', 'Aggronita', ['steel'], { hp: 1.15, str: 1.25, spe: 1 }],
  ['medicham', 'medicham-mega', 'medichamite', 'Medichamita', null, { hp: 1, str: 1.45, spe: 1.05 }],
  ['manectric', 'manectric-mega', 'manectite', 'Manectita', null, { hp: 1, str: 1.3, spe: 1.15 }],
  ['sharpedo', 'sharpedo-mega', 'sharpedonite', 'Sharpedonita', null, { hp: 1, str: 1.35, spe: 1.05 }],
  ['camerupt', 'camerupt-mega', 'cameruptite', 'Cameruptita', null, { hp: 1.1, str: 1.35, spe: 0.85 }],
  ['altaria', 'altaria-mega', 'altarianite', 'Altarianita', ['dragon', 'fairy'], { hp: 1.05, str: 1.3, spe: 1 }],
  ['banette', 'banette-mega', 'banettite', 'Banettita', null, { hp: 1, str: 1.4, spe: 1.1 }],
  ['absol', 'absol-mega', 'absolite', 'Absolita', null, { hp: 1, str: 1.35, spe: 1.15 }],
  ['glalie', 'glalie-mega', 'glalitite', 'Glalitita', null, { hp: 1.05, str: 1.4, spe: 1 }],
  ['salamence', 'salamence-mega', 'salamencite', 'Salamencita', null, { hp: 1.05, str: 1.3, spe: 1.05 }],
  ['metagross', 'metagross-mega', 'metagrossite', 'Metagrossita', null, { hp: 1, str: 1.3, spe: 1.15 }],
  ['latias', 'latias-mega', 'latiasite', 'Latiasita', null, { hp: 1.05, str: 1.3, spe: 1.05 }],
  ['latios', 'latios-mega', 'latiosite', 'Latiosita', null, { hp: 1, str: 1.35, spe: 1.05 }],
  ['rayquaza', 'rayquaza-mega', 'meteorite', 'Meteorito', null, { hp: 1, str: 1.35, spe: 1.1 }],
  ['lopunny', 'lopunny-mega', 'lopunnite', 'Lopunnita', ['normal', 'fighting'], { hp: 1, str: 1.4, spe: 1.15 }],
  ['garchomp', 'garchomp-mega', 'garchompite', 'Garchompita', null, { hp: 1, str: 1.35, spe: 0.95 }],
  ['lucario', 'lucario-mega', 'lucarionite', 'Lucarionita', null, { hp: 1, str: 1.35, spe: 1.12 }],
  ['abomasnow', 'abomasnow-mega', 'abomasite', 'Abomasita', null, { hp: 1.05, str: 1.35, spe: 0.95 }],
  ['gallade', 'gallade-mega', 'galladite', 'Galladita', null, { hp: 1, str: 1.4, spe: 1.05 }],
  ['audino', 'audino-mega', 'audinite', 'Audinita', ['normal', 'fairy'], { hp: 1.15, str: 1.2, spe: 1 }],
  ['diancie', 'diancie-mega', 'diancite', 'Diancita', null, { hp: 0.95, str: 1.45, spe: 1.15 }],
  // ---- Megas novas (Pokémon Legends: Z-A)
  ['clefable', 'clefable-mega', 'clefablite', 'Clefablita', ['fairy', 'flying'], { hp: 1.05, str: 1.35, spe: 1 }],
  ['victreebel', 'victreebel-mega', 'victreebelite', 'Victreebelita', null, { hp: 1, str: 1.35, spe: 1 }],
  ['starmie', 'starmie-mega', 'starminite', 'Starminita', null, { hp: 1, str: 1.4, spe: 1.1 }],
  ['dragonite', 'dragonite-mega', 'dragoninite', 'Dragoninita', null, { hp: 1.05, str: 1.3, spe: 1.02 }],
  ['meganium', 'meganium-mega', 'meganiumite', 'Meganiumita', ['grass', 'fairy'], { hp: 1.05, str: 1.35, spe: 1 }],
  ['feraligatr', 'feraligatr-mega', 'feraligite', 'Feraligita', ['water', 'dragon'], { hp: 1.05, str: 1.4, spe: 1 }],
  ['skarmory', 'skarmory-mega', 'skarmorite', 'Skarmorita', null, { hp: 1, str: 1.4, spe: 1.15 }],
  ['chimecho', 'chimecho-mega', 'chimechite', 'Chimechita', ['psychic', 'steel'], { hp: 1.1, str: 1.35, spe: 1 }],
  ['froslass', 'froslass-mega', 'froslassite', 'Froslassita', null, { hp: 1, str: 1.35, spe: 1.12 }],
  ['emboar', 'emboar-mega', 'emboarite', 'Emboarita', null, { hp: 1.1, str: 1.35, spe: 1 }],
  ['excadrill', 'excadrill-mega', 'excadrite', 'Excadrita', null, { hp: 1.1, str: 1.4, spe: 1 }],
  ['chandelure', 'chandelure-mega', 'chandelurite', 'Chandelurita', null, { hp: 1, str: 1.3, spe: 1.05 }],
  ['golurk', 'golurk-mega', 'golurkite', 'Golurkita', null, { hp: 1.05, str: 1.4, spe: 0.9 }],
  ['chesnaught', 'chesnaught-mega', 'chesnaughtite', 'Chesnaughtita', null, { hp: 1.15, str: 1.3, spe: 0.9 }],
  ['delphox', 'delphox-mega', 'delphoxite', 'Delphoxita', null, { hp: 1, str: 1.35, spe: 1.15 }],
  ['greninja', 'greninja-mega', 'greninjite', 'Greninjita', null, { hp: 1, str: 1.35, spe: 1.18 }],
  ['floette', 'floette-mega', 'floettite', 'Floettita', null, { hp: 1.05, str: 1.5, spe: 1.1 }],
  ['hawlucha', 'hawlucha-mega', 'hawluchanite', 'Hawluchanita', null, { hp: 1, str: 1.35, spe: 1.1 }],
  ['crabominable', 'crabominable-mega', 'crabominite', 'Crabominita', null, { hp: 1.1, str: 1.4, spe: 0.85 }],
  ['drampa', 'drampa-mega', 'drampanite', 'Drampanita', null, { hp: 1.05, str: 1.35, spe: 0.9 }]
];

/** MEGAS[megaKey] = { key, base, sp ('mega_<key>'), file, stone, stoneName, name, types, mult } */
export const MEGAS = {};
for (const [key, file, stone, stoneName, types, mult, baseOverride] of RAW) {
  const base = baseOverride || key;
  const bs = SPECIES[base];
  if (!bs) continue;
  const suffix = key.endsWith('_x') ? ' X' : key.endsWith('_y') ? ' Y' : '';
  const sp = `mega_${key}`;
  MEGAS[key] = { key, base, sp, file, stone, stoneName, name: `Mega ${bs.name}${suffix}`, types: types || bs.types.slice(), mult };
  // forma Mega como "espécie" (só existe na batalha)
  SPECIES[sp] = {
    ...bs, id: sp, name: `Mega ${bs.name}${suffix}`, types: types || bs.types.slice(),
    hp: Math.round(bs.hp * mult.hp), str: Math.round(bs.str * mult.str * 10) / 10, speMult: mult.spe,
    mega: key, megaBase: base, evolvesTo: null, evolutionLevel: null, evolvesFrom: null
  };
}
export const MEGA_KEYS = Object.keys(MEGAS);
export const megaBySpecies = sp => MEGA_KEYS.map(k => MEGAS[k]).filter(m => m.base === sp);
export const megaByStone = stone => MEGA_KEYS.map(k => MEGAS[k]).find(m => m.stone === stone) || null;

// ---- itens: Megapedras (seguradas pelo Pokémon) e Fragmentos (para fabricar a pedra na Oficina)
export const stoneItemId = m => `ms_${m.key}`;
export const fragItemId = m => `mf_${m.key}`;
export const BRACELET_ID = 'mega_bracelet';
export const FRAGS_PER_STONE = 10;

// ---- regras
export const MEGA_RAID_CHANCE = 0.25;     // Raid comum/santuário vira Mega Raid
export const MEGA_RAID_FRAGS = [1, 3];    // fragmentos por participante
export const BRACELET_DROP = 0.01;        // 🔗 Bracelete: SÓ em Mega Raid, 1% por participante (se ainda não tiver)
export const MEGA_WILD_CHANCE = 0.015;    // encontro com energia Mega nas casas Vermelhas/Amarelas
export const MEGA_WILD_FRAGS = [1, 2];

/** Pode Mega Evoluir agora? (mon na batalha, jogador) */
export function megaFor(mon) {
  if (!mon || mon.mega || mon.tf || !mon.held) return null;
  const m = MEGA_KEYS.map(k => MEGAS[k]).find(x => stoneItemId(x) === mon.held);
  return m && m.base === mon.sp ? m : null;
}
