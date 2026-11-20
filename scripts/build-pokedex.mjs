// Gera shared/data/pokemon.js a partir de scripts/data/species.txt (806 espécies).
// As 302 espécies do catálogo original mantêm HP/força/tier/evolução das cartas (lendários vão para o tier 5).
// Uso: node scripts/build-pokedex.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = { no: 'normal', fi: 'fire', wa: 'water', gr: 'grass', el: 'electric', ic: 'ice', fg: 'fighting', po: 'poison', gd: 'ground',
  fl: 'flying', ps: 'psychic', bu: 'bug', ro: 'rock', gh: 'ghost', dr: 'dragon', dk: 'dark', st: 'steel', fa: 'fairy' };

// Papéis de suporte (o 2º golpe vira um golpe de suporte)
const ROLES = {
  healer: 'chansey blissey happiny audino alomomola comfey clefairy clefable cleffa togepi togetic togekiss miltank flabebe floette florges sylveon spritzee aromatisse jigglypuff wigglytuff igglybuff shuckle corsola pyukumuku bellossom celebi cresselia manaphy phione jirachi shaymin xerneas lugia ho_oh mew umbreon espeon vaporeon lanturn wailord wailmer slowking slowbro tapu_fini tapu_lele magearna diancie',
  buffer: 'scyther scizor gyarados dragonite dragonair salamence lucario riolu kingler cloyster azumarill marill medicham meditite volcarona larvesta hawlucha haxorus pinsir heracross kartana gallade ninjask lopunny conkeldurr garchomp tyranitar kommo_o rayquaza dialga zekrom',
  debuffer: 'arcanine growlithe krookodile krokorok sandile mightyena poochyena staraptor staravia hitmontop tauros granbull snubbull incineroar torracat litten landorus scrafty scraggy ekans arbok masquerain stantler qwilfish herdier stoutland mawile luxray luxio shinx gligar gliscor salazzle salandit',
  drainer: 'amoonguss foongus shiinotic morelull parasect paras zubat golbat crobat breloom shroomish ludicolo lombre lotad venusaur ivysaur bulbasaur roserade roselia budew tangela tangrowth sunflora cherrim leavanny swadloon sewaddle cottonee whimsicott gogoat skiddo tsareena steenee bounsweet decidueye dartrix rowlet celebi'
};
const roleOf = {};
for (const [r, list] of Object.entries(ROLES)) for (const id of list.split(/\s+/)) if (!roleOf[id]) roleOf[id] = r;

const slug = name => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(f\)/, 'f').replace(/\(m\)/, 'm').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// catálogo antigo (para preservar o equilíbrio das cartas)
const old = {};
const oldSrc = readFileSync(process.argv[2] || join(root, 'scripts/data/cards-original.json'), 'utf8');
for (const r of JSON.parse(oldSrc)) old[r[0]] = r;

const rows = [];
const byDex = {};
for (const line of readFileSync(join(root, 'scripts/data/species.txt'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [dex, name, types, evoDex, evoLvl, bst, flags = ''] = line.split('|');
  byDex[+dex] = { dex: +dex, name, types: types.split('/').map(t => T[t]), evoDex: evoDex ? +evoDex : null, evoLvl: evoLvl ? +evoLvl : null, bst: +bst, legendary: flags.includes('L') };
}
for (let d = 1; d <= 806; d++) if (!byDex[d]) throw new Error('faltando #' + d);
// descarta entradas antigas com número errado (ex.: Goodra estava no #704, que é o Goomy)
const norm = n => n.toLowerCase().replace(/[^a-z]/g, '');
for (const d of Object.keys(old)) if (!norm(byDex[d].name).startsWith(norm(old[d][2]).slice(0, 4))) delete old[d];

// ids: os do catálogo antigo quando existirem
for (const s of Object.values(byDex)) s.id = old[s.dex] ? old[s.dex][1] : slug(s.name);

// estágio: é básico se ninguém evolui para ele
const evolvesFrom = {};
for (const s of Object.values(byDex)) if (s.evoDex) evolvesFrom[s.evoDex] = s.dex;

for (const s of Object.values(byDex)) {
  const o = old[s.dex];
  let tier, hp, str, evo = s.evoDex ? byDex[s.evoDex].id : null, lvl = s.evoLvl;
  if (s.legendary) {
    tier = 5;
    hp = Math.round((0.065 * s.bst - 4.5) * 1.15);
    str = Math.round(s.bst / 60 - 0.8);
    if (o && o[4] === 5) { hp = o[5]; str = o[6]; }
  } else if (o) {
    tier = o[4]; hp = o[5]; str = o[6];
    if (tier === 3 && !s.evoDex && s.bst >= 540) { tier = 4; hp = Math.max(hp, 33); str = Math.max(str, 9); } // revisão: os mais fortes sobem
  } else {
    const isFinal = !s.evoDex;
    tier = s.bst >= 580 || (isFinal && s.bst >= 515) ? 4 : s.bst >= 450 ? 3 : s.bst >= 330 ? 2 : 1;
    if (!evolvesFrom[s.dex] && tier > 1 && s.evoDex) tier = Math.min(tier, 2); // básicos que ainda evoluem
    hp = Math.max(12, Math.round(0.065 * s.bst - 4.5));
    str = Math.max(3, Math.round(s.bst / 60 - 1.3));
  }
  if (o && o[7]) { evo = o[7]; lvl = o[8]; }
  rows.push([s.dex, s.id, s.name, s.types.join('/'), tier, hp, str, evo, evo ? lvl : null, s.legendary ? 1 : 0, roleOf[s.id] || null]);
}

const header = `// Catálogo de espécies — #001 a #806 (Gen 1–7). GERADO por scripts/build-pokedex.mjs; edite scripts/data/species.txt.
// Formato: [dex, id, nome, tipos, tier, hpBase, forçaBase, evoluiPara, nivelEvolucao, lendario, papel]
// tier: 1 Rosa (comum) · 2 Verde · 3 Azul · 4 Vermelho · 5 Amarelo (lendários/míticos/ultra-criaturas)
// papel: null (atacante) · healer · buffer · debuffer · drainer — define o 2º golpe (ver shared/data/moves.js)
const RAW = [
${rows.map(r => '  ' + JSON.stringify(r)).join(',\n')}
];
`;
const footer = `
export const SPECIES = {};
export const SPECIES_LIST = RAW.map(([dex, id, name, types, tier, hp, str, evolvesTo, evolutionLevel, legendary, role]) => {
  const s = { dex, id, name, types: types.split('/'), tier, hp, str, evolvesTo, evolutionLevel, legendary: !!legendary, role };
  SPECIES[id] = s;
  return s;
});
export const TOTAL_SPECIES = SPECIES_LIST.length;

// Quem evolui para quem (para saber o "estágio")
for (const s of SPECIES_LIST) if (s.evolvesTo && SPECIES[s.evolvesTo]) SPECIES[s.evolvesTo].evolvesFrom = s.id;

export function getSpecies(id) {
  return SPECIES[id] || null;
}

const BY_TIER = {};
for (const s of SPECIES_LIST) (BY_TIER[s.tier] ||= []).push(s);
export function speciesByTier(tier) {
  return BY_TIER[tier] || [];
}

export const STARTERS = [
  'bulbasaur', 'charmander', 'squirtle',      // Gen 1
  'chikorita', 'cyndaquil', 'totodile',       // Gen 2
  'treecko', 'torchic', 'mudkip',             // Gen 3
  'turtwig', 'chimchar', 'piplup',            // Gen 4
  'snivy', 'tepig', 'oshawott',               // Gen 5
  'chespin', 'fennekin', 'froakie',           // Gen 6
  'rowlet', 'litten', 'popplio'               // Gen 7
];
`;
writeFileSync(join(root, 'shared/data/pokemon.js'), header + footer);
const c = {}; rows.forEach(r => (c[r[4]] = (c[r[4]] || 0) + 1));
console.log('espécies:', rows.length, 'por tier:', c);
