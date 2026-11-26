// 🗺️ v59 — cada mapa tem a sua Liga (Elite dos Quatro + Campeão) e os seus Pokémon em destaque.
// Pokémon "da região" (gerações) aparecem 3× mais nas casas daquele mapa; os lendários em destaque aparecem
// bem mais nas casas Amarelas e nas Raids daquele mapa — e bem menos nos outros (não somem: só ficam raros).
// Sprites dos treinadores: caminho dentro da pasta de sprites (leaders/, skins/ ou trainers/).
import { getSpecies } from './pokemon.js';

const T = (name, sprite, team, title = 'Elite dos Quatro') => ({ name, title, sprite, team });

export const REGIONS = {
  kanto: {
    name: 'Kanto', gens: [1], legends: ['articuno', 'zapdos', 'moltres', 'mewtwo', 'mewtwo_armor', 'mewtwo_shadow'],
    elite: [
      T('Lorelei', 'leaders/lorelei.png', [['dewgong', 30], ['cloyster', 31], ['lapras', 32]]),
      T('Bruno', 'leaders/bruno.png', [['hitmonchan', 31], ['hitmonlee', 32], ['machamp', 33]]),
      T('Agatha', 'leaders/agatha.png', [['golbat', 32], ['haunter', 33], ['gengar', 34]]),
      T('Lance', 'leaders/lance.png', [['gyarados', 33], ['dragonair', 33], ['dragonite', 35]])
    ],
    champion: { name: 'Blue', title: 'Campeão de Kanto', sprite: 'leaders/blue.png', prize: 5000,
      team: [['pidgeot', 35], ['alakazam', 36], ['rhydon', 36], ['gyarados', 37], ['arcanine', 37], ['venusaur', 38]] }
  },
  expedicao: {
    name: 'Expedição', gens: [8], legends: ['zacian', 'zamazenta', 'eternatus', 'calyrex', 'glastrier', 'spectrier', 'regieleki', 'regidrago', 'kubfu'],
    elite: [
      T('Elaine', 'skins/elaine.png', [['eevee', 30], ['sylveon', 31], ['vaporeon', 32]]),
      T('Faixa-Preta', 'trainers/blackbelt.png', [['hitmontop', 31], ['grapploct', 32], ['sirfetchd', 33]]),
      T('Médium', 'trainers/channeler.png', [['polteageist', 32], ['cursola', 33], ['dragapult', 34]]),
      T('Domadora de Dragões', 'trainers/dragontamer.png', [['flapple', 33], ['appletun', 33], ['duraludon', 35]])
    ],
    champion: { name: 'Leon', title: 'Campeão de Galar', sprite: 'skins/leon.png', prize: 5000,
      team: [['aegislash', 35], ['dragapult', 36], ['haxorus', 36], ['rhyperior', 37], ['seismitoad', 37], ['charizard', 38]] }
  },
  arquipelago: {
    name: 'Arquipélago Coral', gens: [3, 7], legends: ['kyogre', 'rayquaza', 'lugia', 'lugia_shadow', 'latias', 'latios', 'tapu_koko', 'tapu_lele', 'tapu_bulu', 'tapu_fini'],
    elite: [
      T('Nadadora', 'trainers/swimmer.png', [['lanturn', 30], ['wailord', 31], ['starmie', 32]]),
      T('Ornitólogo', 'trainers/birdkeeper.png', [['pelipper', 31], ['toucannon', 32], ['skarmory', 33]]),
      T('Acerola', 'skins/acerola-masters.png', [['sableye', 32], ['dhelmise', 33], ['palossand', 34]]),
      T('Zinnia', 'skins/zinnia.png', [['altaria', 33], ['kingdra', 33], ['salamence', 35]])
    ],
    champion: { name: 'Brendan', title: 'Campeão do Arquipélago', sprite: 'skins/brendan-masters2.png', prize: 5000,
      team: [['swampert', 35], ['milotic', 36], ['primarina', 36], ['gyarados', 37], ['kingdra', 37], ['tapu_fini', 38]] }
  },
  vulcanica: {
    name: 'Terras de Fogo', gens: [4, 9], legends: ['groudon', 'heatran', 'entei', 'ho_oh', 'koraidon', 'chi_yu', 'ting_lu', 'gouging_fire', 'raging_bolt'],
    elite: [
      T('Montanhista', 'trainers/hiker.png', [['golem', 30], ['rhyperior', 31], ['garchomp', 32]]),
      T('Adaman', 'skins/adaman.png', [['leafeon', 31], ['ursaluna', 32], ['magmortar', 33]]),
      T('Faixa-Preta', 'trainers/blackbelt.png', [['infernape', 32], ['lucario', 33], ['annihilape', 34]]),
      T('Giovanni', 'skins/giovanni-gen3.png', [['nidoking', 33], ['hippowdon', 33], ['excadrill', 35]])
    ],
    champion: { name: 'Turo', title: 'Campeão das Terras de Fogo', sprite: 'skins/turo.png', prize: 5000,
      team: [['arcanine', 35], ['camerupt', 36], ['torkoal', 36], ['skeledirge', 37], ['volcarona', 37], ['iron_moth', 38]] }
  },
  glacial: {
    name: 'Picos Gelados', gens: [4, 5], legends: ['kyurem', 'regice', 'regirock', 'registeel', 'regigigas', 'dialga', 'palkia', 'giratina', 'suicune', 'cresselia', 'uxie', 'mesprit', 'azelf', 'chien_pao'],
    elite: [
      T('Mística', 'trainers/psychic.png', [['gardevoir', 30], ['gallade', 31], ['bronzong', 32]]),
      T('Médium', 'trainers/channeler.png', [['froslass', 31], ['dusknoir', 32], ['chandelure', 33]]),
      T('Yancy', 'skins/yancy.png', [['glaceon', 32], ['mamoswine', 33], ['abomasnow', 34]]),
      T('Domadora de Dragões', 'trainers/dragontamer.png', [['haxorus', 33], ['hydreigon', 33], ['garchomp', 35]])
    ],
    champion: { name: 'Cynthia', title: 'Campeã dos Picos Gelados', sprite: 'skins/cynthia-masters.png', prize: 5000,
      team: [['spiritomb', 35], ['roserade', 36], ['togekiss', 36], ['lucario', 37], ['milotic', 37], ['garchomp', 38]] }
  },
  floresta: {
    name: 'Mata Profunda', gens: [2, 6], legends: ['raikou', 'cobalion', 'terrakion', 'virizion', 'xerneas', 'yveltal', 'zygarde', 'ogerpon', 'wo_chien', 'iron_leaves', 'walking_wake'],
    elite: [
      T('Caçador de Insetos', 'trainers/bugcatcher.png', [['scizor', 30], ['heracross', 31], ['vikavolt', 32]]),
      T('Pokémon Ranger', 'skins/pokemonranger-gen6.png', [['decidueye', 31], ['chesnaught', 32], ['trevenant', 33]]),
      T('Cientista', 'trainers/scientist.png', [['toxicroak', 32], ['venusaur', 33], ['amoonguss', 34]]),
      T('Mística', 'trainers/psychic.png', [['espeon', 33], ['florges', 33], ['xatu', 35]])
    ],
    champion: { name: 'Calem', title: 'Campeão da Mata Profunda', sprite: 'skins/calem-masters.png', prize: 5000,
      team: [['meganium', 35], ['ampharos', 36], ['tyranitar', 36], ['goodra', 37], ['noivern', 37], ['greninja', 38]] }
  }
};

// 🏅 v60: insígnias exclusivas de cada mapa (mesmos ginásios, outra insígnia). Ordem: boulder, cascade, thunder, rainbow, volcano, soul.
// Arquivo em badges/<arquivo>.png — enquanto não existir, mostra a de Kanto.
const B = (file, name) => ({ file, name });
export const REGION_BADGES = {
  expedicao: [B('galar_rock', 'Insígnia Rocha de Galar'), B('galar_water', 'Insígnia Água de Galar'), B('galar_dragon', 'Insígnia Dragão de Galar'), B('galar_grass', 'Insígnia Grama de Galar'), B('galar_fire', 'Insígnia Fogo de Galar'), B('galar_dark', 'Insígnia Sombria de Galar')],
  arquipelago: [B('hoenn_stone', 'Insígnia Pedra'), B('hoenn_rain', 'Insígnia Chuva'), B('hoenn_dynamo', 'Insígnia Dínamo'), B('hoenn_feather', 'Insígnia Pena'), B('hoenn_heat', 'Insígnia Calor'), B('hoenn_mind', 'Insígnia Mente')],
  vulcanica: [B('sinnoh_coal', 'Insígnia Carvão'), B('sinnoh_fen', 'Insígnia Pântano'), B('sinnoh_beacon', 'Insígnia Farol'), B('sinnoh_forest', 'Insígnia Floresta'), B('sinnoh_cobble', 'Insígnia Calçada'), B('sinnoh_relic', 'Insígnia Relíquia')],
  glacial: [B('unova_quake', 'Insígnia Tremor'), B('unova_icicle', 'Insígnia Pingente'), B('unova_bolt', 'Insígnia Raio'), B('unova_trio', 'Insígnia Trio'), B('unova_basic', 'Insígnia Básica'), B('unova_toxic', 'Insígnia Tóxica')],
  floresta: [B('kalos_cliff', 'Insígnia Penhasco'), B('kalos_fairy', 'Insígnia Fada'), B('kalos_voltage', 'Insígnia Voltagem'), B('kalos_plant', 'Insígnia Planta'), B('kalos_rumble', 'Insígnia Estrondo'), B('kalos_psychic', 'Insígnia Psíquica')]
};
const GYM_ORDER = ['boulder', 'cascade', 'thunder', 'rainbow', 'volcano', 'soul'];
/** Insígnia do mapa ativo para o ginásio (ou null = a de Kanto). */
export function regionBadge(gymId, key = ACTIVE) {
  const i = GYM_ORDER.indexOf(gymId);
  return (key && REGION_BADGES[key]?.[i]) || null;
}

/** Região de um mapa: Kanto, a do tema (mapas gerados) ou nenhuma (mapas personalizados usam Kanto sem destaque). */
export function regionKey(map) {
  if (!map || map.id === 'kanto') return 'kanto';
  if (map.theme && REGIONS[map.theme]) return map.theme;
  return null;
}

// região ativa (muda junto com o mapa em useMap)
let ACTIVE = null;
export const activeRegion = () => ACTIVE;
export function setActiveRegion(key) { ACTIVE = key && REGIONS[key] ? key : null; }

const SIGNATURE = new Map(); // lendário → região
for (const [k, r] of Object.entries(REGIONS)) for (const id of r.legends) SIGNATURE.set(id, k);
export const signatureRegion = id => SIGNATURE.get(id) || null;

export const REGION_GEN_MULT = 3;     // Pokémon da geração da região
export const REGION_LEGEND_MULT = 8;  // lendário em destaque no próprio mapa
export const OTHER_LEGEND_MULT = 0.25; // lendário em destaque de OUTRO mapa

/** Peso de sorteio de uma espécie no mapa ativo (1 = normal). */
export function regionWeight(sp, key = ACTIVE) {
  if (!key || !sp) return 1;
  const R = REGIONS[key];
  const sig = SIGNATURE.get(sp.id) || SIGNATURE.get(sp.form);
  if (sig) return sig === key ? REGION_LEGEND_MULT : OTHER_LEGEND_MULT;
  return R.gens.includes(sp.gen) ? REGION_GEN_MULT : 1;
}

/** Sorteia uma espécie da lista com os pesos do mapa ativo. */
export function pickRegional(rng, list) {
  if (!ACTIVE || list.length < 2) return rng.pick(list);
  return rng.weighted(list.map(s => [s, regionWeight(s)]));
}

/** Texto curto para a escolha do mapa. */
export function regionBlurb(key) {
  const R = REGIONS[key];
  if (!R) return '';
  const leg = R.legends.map(id => getSpecies(id)?.name).filter(Boolean);
  return `👑 ${R.champion.name} · Pokémon da Gen ${R.gens.join(' e ')} aparecem mais · ⚡ Lendários em destaque: ${leg.join(', ')}`;
}
