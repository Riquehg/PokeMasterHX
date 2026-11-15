// Treinadores NPC: Líderes de Ginásio, Elite dos Quatro, Campeão e treinadores de rota.
// team: [especie, nivel]. sprite: arquivo em "sprites/leaders/" do Supabase (opcional).

export const BADGES_TO_LEAGUE = 6;

export const GYMS = [
  { id: 'boulder', space: 39, city: 'Pewter City',     leader: 'Brock',    type: 'rock',     badge: 'Insígnia Rocha',    sprite: 'brock.png',   prize: 400,
    team: [['geodude', 11], ['onix', 13]] },
  { id: 'cascade', space: 20, city: 'Cerulean City',   leader: 'Misty',    type: 'water',    badge: 'Insígnia Cascata',  sprite: 'misty.png',   prize: 450,
    team: [['staryu', 12], ['starmie', 14]] },
  { id: 'thunder', space: 60, city: 'Vermilion City',  leader: 'Lt. Surge',type: 'electric', badge: 'Insígnia Trovão',   sprite: 'ltsurge.png', prize: 650,
    team: [['voltorb', 17], ['magnemite', 18], ['raichu', 20]] },
  { id: 'rainbow', space: 70, city: 'Celadon City',    leader: 'Erika',    type: 'grass',    badge: 'Insígnia Arco-íris',sprite: 'erika.png',   prize: 750,
    team: [['tangela', 20], ['weepinbell', 21], ['vileplume', 23]] },
  { id: 'volcano', space: 91, city: 'Cinnabar Island', leader: 'Blaine',   type: 'fire',     badge: 'Insígnia Vulcão',   sprite: 'blaine.png',  prize: 950,
    team: [['ponyta', 25], ['magmar', 26], ['arcanine', 28]] },
  { id: 'soul',    space: 95, city: 'Fuchsia City',    leader: 'Koga',     type: 'poison',   badge: 'Insígnia Alma',     sprite: 'koga.png',    prize: 950,
    team: [['koffing', 25], ['muk', 27], ['weezing', 29]] }
];

export const ELITE_SPACE = 114;
export const CHAMPION_SPACE = 124;
export const LEAGUE_GATE_SPACES = [107, 114, 124]; // exigem 6 insígnias

export const ELITE_FOUR = [
  { name: 'Lorelei', title: 'Elite dos Quatro', sprite: 'lorelei.png', team: [['dewgong', 30], ['cloyster', 31], ['lapras', 32]] },
  { name: 'Bruno',   title: 'Elite dos Quatro', sprite: 'bruno.png',   team: [['hitmonchan', 31], ['hitmonlee', 32], ['machamp', 33]] },
  { name: 'Agatha',  title: 'Elite dos Quatro', sprite: 'agatha.png',  team: [['golbat', 32], ['haunter', 33], ['gengar', 34]] },
  { name: 'Lance',   title: 'Elite dos Quatro', sprite: 'lance.png',   team: [['gyarados', 33], ['dragonair', 33], ['dragonite', 35]] }
];

export const CHAMPION = {
  name: 'Blue', title: 'Campeão da Liga', sprite: 'blue.png', prize: 5000,
  team: [['pidgeot', 35], ['alakazam', 36], ['rhydon', 36], ['gyarados', 37], ['arcanine', 37], ['venusaur', 38]]
};

// Treinadores de rota, sorteados em casas de evento. Os Pokémon são sorteados do tier da casa.
export const ROUTE_TRAINERS = [
  { name: 'Jovem Joey',         sprite: 'youngster.png', favorite: ['normal'] },
  { name: 'Caçador de Insetos', sprite: 'bugcatcher.png', favorite: ['bug'] },
  { name: 'Montanhista',        sprite: 'hiker.png',      favorite: ['rock', 'ground'] },
  { name: 'Nadadora',           sprite: 'swimmer.png',    favorite: ['water'] },
  { name: 'Mística',            sprite: 'psychic.png',    favorite: ['psychic', 'fairy'] },
  { name: 'Faixa-Preta',        sprite: 'blackbelt.png',  favorite: ['fighting'] },
  { name: 'Ornitólogo',         sprite: 'birdkeeper.png', favorite: ['flying'] },
  { name: 'Cientista',          sprite: 'scientist.png',  favorite: ['electric', 'steel', 'poison'] },
  { name: 'Domadora de Dragões',sprite: 'dragontamer.png',favorite: ['dragon'] },
  { name: 'Médium',             sprite: 'channeler.png',  favorite: ['ghost', 'dark'] }
];

export const ROCKET = { name: 'Equipe Rocket', sprite: 'rocket.png', favorite: ['poison', 'dark', 'normal'] };

export function gymAt(spaceId) {
  return GYMS.find(g => g.space === Number(spaceId)) || null;
}
