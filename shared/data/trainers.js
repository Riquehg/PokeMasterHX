// Treinadores NPC: Líderes de Ginásio, Elite dos Quatro, Campeão e treinadores de rota.
import { REGIONS, regionKey, setActiveRegion, regionBadge, regionGym } from './regions.js';
// team: [especie, nivel]. sprite: caminho dentro do bucket "sprites" do Supabase (pasta/arquivo, respeitando maiúsculas e espaços).

export const BADGES_TO_LEAGUE = 6;

export const GYMS = [
  { id: 'boulder', space: 39, city: 'Pewter City',     leader: 'Brock',    type: 'rock',     badge: 'Insígnia Rocha',    sprite: 'leaders/Brock.png',   prize: 400,
    team: [['geodude', 11], ['onix', 13]] },
  { id: 'cascade', space: 20, city: 'Cerulean City',   leader: 'Misty',    type: 'water',    badge: 'Insígnia Cascata',  sprite: 'leaders/misty.png',   prize: 450,
    team: [['staryu', 12], ['starmie', 14]] },
  { id: 'thunder', space: 60, city: 'Vermilion City',  leader: 'Lt. Surge',type: 'electric', badge: 'Insígnia Trovão',   sprite: 'leaders/Lt. Surge.png', prize: 650,
    team: [['voltorb', 17], ['magnemite', 18], ['raichu', 20]] },
  { id: 'rainbow', space: 70, city: 'Celadon City',    leader: 'Erika',    type: 'grass',    badge: 'Insígnia Arco-íris',sprite: 'leaders/Erika.png',   prize: 750,
    team: [['tangela', 20], ['weepinbell', 21], ['vileplume', 23]] },
  { id: 'volcano', space: 91, city: 'Cinnabar Island', leader: 'Blaine',   type: 'fire',     badge: 'Insígnia Vulcão',   sprite: 'leaders/Blaine.png',  prize: 950,
    team: [['ponyta', 25], ['magmar', 26], ['arcanine', 28]] },
  { id: 'soul',    space: 95, city: 'Fuchsia City',    leader: 'Koga',     type: 'poison',   badge: 'Insígnia Alma',     sprite: 'leaders/Koga.png',    prize: 950,
    team: [['koffing', 25], ['muk', 27], ['weezing', 29]] }
];

// Casas da Liga e dos ginásios mudam com o mapa ativo (ver shared/data/board.js → useMap).
export let ELITE_SPACE = 114;
export let CHAMPION_SPACE = 124;
export const LEAGUE_GATE_SPACES = [107, 114, 124]; // exigem 6 insígnias
const KANTO_CITY = Object.fromEntries(GYMS.map(g => [g.id, g.city]));

/** Chamado por useMap(): coloca ginásios, Liga e Campeão nas casas do mapa. */
export function setLeagueSpaces(map) {
  // 🗺️ v59: cada mapa tem a sua Elite dos Quatro e o seu Campeão (personalizados usam os de Kanto)
  const key = regionKey(map);
  setActiveRegion(key);
  const R = REGIONS[key || 'kanto'];
  ELITE_FOUR.splice(0, ELITE_FOUR.length, ...R.elite);
  for (const k of Object.keys(CHAMPION)) delete CHAMPION[k];
  Object.assign(CHAMPION, R.champion);
  // 🏅 v60: nomes das insígnias do mapa
  for (const g of GYMS) { g.kantoBadge ||= g.badge; g.badge = regionBadge(g.id)?.name || g.kantoBadge; }
  // 🏟️ v62: líderes, tipo e time de cada mapa (Kanto e personalizados: os originais)
  for (const g of GYMS) {
    g.kanto ||= { leader: g.leader, type: g.type, sprite: g.sprite, team: g.team };
    Object.assign(g, regionGym(g.id) || g.kanto);
  }
  ELITE_SPACE = map.elite;
  CHAMPION_SPACE = map.champion;
  LEAGUE_GATE_SPACES.length = 0;
  LEAGUE_GATE_SPACES.push(...map.leagueGates);
  for (const g of GYMS) {
    g.space = map.gyms[g.id];
    const sp = map.spaces.find(s => s.id === g.space);
    g.city = map.id === 'kanto' ? KANTO_CITY[g.id] : sp?.name || g.city;
  }
}

export const ELITE_FOUR = [
  { name: 'Lorelei', title: 'Elite dos Quatro', sprite: 'leaders/lorelei.png', team: [['dewgong', 30], ['cloyster', 31], ['lapras', 32]] },
  { name: 'Bruno',   title: 'Elite dos Quatro', sprite: 'leaders/bruno.png',   team: [['hitmonchan', 31], ['hitmonlee', 32], ['machamp', 33]] },
  { name: 'Agatha',  title: 'Elite dos Quatro', sprite: 'leaders/agatha.png',  team: [['golbat', 32], ['haunter', 33], ['gengar', 34]] },
  { name: 'Lance',   title: 'Elite dos Quatro', sprite: 'leaders/lance.png',   team: [['gyarados', 33], ['dragonair', 33], ['dragonite', 35]] }
];

export const CHAMPION = {
  name: 'Blue', title: 'Campeão da Liga', sprite: 'leaders/blue.png', prize: 5000,
  team: [['pidgeot', 35], ['alakazam', 36], ['rhydon', 36], ['gyarados', 37], ['arcanine', 37], ['venusaur', 38]]
};

// Treinadores de rota, sorteados em casas de evento. Os Pokémon são sorteados do tier da casa.
export const ROUTE_TRAINERS = [
  { name: 'Jovem Joey',         sprite: 'trainers/youngster.png', favorite: ['normal'] },
  { name: 'Caçador de Insetos', sprite: 'trainers/bugcatcher.png', favorite: ['bug'] },
  { name: 'Montanhista',        sprite: 'trainers/hiker.png',      favorite: ['rock', 'ground'] },
  { name: 'Nadadora',           sprite: 'trainers/swimmer.png',    favorite: ['water'] },
  { name: 'Mística',            sprite: 'trainers/psychic.png',    favorite: ['psychic', 'fairy'] },
  { name: 'Faixa-Preta',        sprite: 'trainers/blackbelt.png',  favorite: ['fighting'] },
  { name: 'Ornitólogo',         sprite: 'trainers/birdkeeper.png', favorite: ['flying'] },
  { name: 'Cientista',          sprite: 'trainers/scientist.png',  favorite: ['electric', 'steel', 'poison'] },
  { name: 'Domadora de Dragões',sprite: 'trainers/dragontamer.png',favorite: ['dragon'] },
  { name: 'Médium',             sprite: 'trainers/channeler.png',  favorite: ['ghost', 'dark'] }
];

export const ROCKET = { name: 'Equipe Rocket', sprite: 'trainers/rocket.png', favorite: ['poison', 'dark', 'normal'] };

export function gymAt(spaceId) {
  return GYMS.find(g => g.space === Number(spaceId)) || null;
}

// Prêmio por insígnia (a quantidade de insígnias depois da vitória decide o prêmio).
// egg: tier do ovo que choca na hora. items: itens entregues.
export const BADGE_REWARDS = {
  1: { items: { great_ball: 5, super_potion: 3 }, text: 'Kit de iniciante da Liga' },
  2: { egg: 2, text: 'Ovo de tier 2' },
  3: { egg: 3, items: { ultra_ball: 3 }, text: 'Ovo de tier 3 + Ultra Balls' },
  4: { egg: 4, items: { rare_candy: 2 }, text: 'Ovo de tier 4 + Rare Candy' },
  5: { items: { ultra_ball: 5, rare_candy: 3, revive: 2 }, text: 'Kit de elite' },
  6: { egg: 4, items: { ultra_ball: 5, rare_candy: 2 }, text: 'Ovo de tier 4 + Ultra Balls + Rare Candy' }
};

// Ases da Liga (evento especial das casas Amarelas)
export const ACE_TRAINERS = [
  { name: 'Ás Red',     sprite: 'trainers/acetrainer_m.png', favorite: ['fire', 'electric', 'grass'] },
  { name: 'Ás Leaf',    sprite: 'trainers/acetrainer_f.png', favorite: ['water', 'psychic', 'fairy'] },
  { name: 'Veterano',   sprite: 'trainers/veteran.png',      favorite: ['dragon', 'fighting', 'steel'] }
];
