// Catálogo de espécies — Pokédex nacional completa (Gen 1–9) + formas regionais e de batalha (v54).
// Os dados vêm de shared/data/dexdata.js, GERADO por scripts/build-dex.mjs (PokeAPI + sprites do Pokémon HOME).
// tier: 1 Rosa (comum) · 2 Verde · 3 Azul · 4 Vermelho · 5 Amarelo (lendários/míticos/ultra-criaturas)
// papel: null (atacante) · healer · buffer · debuffer · drainer — define o 2º golpe (ver shared/data/moves.js)
import { DEX_RAW } from './dexdata.js';

export const SPECIES = {};
export const SPECIES_LIST = DEX_RAW.map(([dex, id, name, types, tier, hp, str, legendary, role, x = {}]) => {
  const evos = x.e || [];
  const lvlEvo = evos.find(e => e.lvl && !e.item);
  const s = {
    dex, id, name, types: types.split('/'), tier, hp, str, legendary: !!legendary, role,
    evos, evolvesTo: (lvlEvo || evos[0])?.to || null, evolutionLevel: lvlEvo ? lvlEvo.lvl : null,
    file: x.f || id.replace(/_/g, ''), gen: x.g || 1
  };
  if (x.d != null) s.def = x.d;
  if (x.a != null) s.ab = x.a;
  if (x.fm) { s.form = x.fm; s.region = x.rg || null; }
  if (x.v) s.variants = x.v;
  if (x.fe) s.fem = true;
  if (x.gx) s.gmax = true;
  if (x.my) s.mythical = true;
  if (x.ub) s.ultra = true;
  if (x.cr) { s.corrupt = true; s.noShiny = true; } // ☠️ lendário corrompido (v58): não existe shiny
  s.genderRate = x.gr ?? 4;
  SPECIES[id] = s;
  return s;
});
// ordem da Pokédex: número nacional, e as formas logo depois da espécie base
SPECIES_LIST.sort((a, b) => a.dex - b.dex || (a.form ? 1 : 0) - (b.form ? 1 : 0));
export const TOTAL_SPECIES = SPECIES_LIST.length;

// 🌟 Categorias especiais (todas continuam "lendárias" nas regras: tier Amarelo, obediência, captura, Coleção protegida).
//  - Míticos: os de evento nos jogos. NÃO aparecem nas casas Amarelas normais (só numa aparição mítica rara),
//    nem em ovos; vêm de Raids, eventos raros e prêmios.
//  - Ultracriaturas: as Ultra Beasts de Alola (só o rótulo muda).
export const MYTHICAL = SPECIES_LIST.filter(s => s.mythical).map(s => s.id);
export const ULTRA_BEASTS = SPECIES_LIST.filter(s => s.ultra).map(s => s.id);
for (const id of MYTHICAL) SPECIES[id].legendary = true;
/** 'mythical' | 'ultra' | 'legendary' | null */
export const categoryOf = sp => (sp?.mythical ? 'mythical' : sp?.ultra ? 'ultra' : sp?.legendary ? 'legendary' : null);
export const CATEGORY_INFO = {
  legendary: { name: 'Lendário', icon: '⚡', chip: 'gold' },
  mythical: { name: 'Mítico', icon: '🌟', chip: 'mythic' },
  ultra: { name: 'Ultracriatura', icon: '🌀', chip: 'ultra' }
};
/** Chance de uma casa Amarela trazer um Mítico em vez de um Lendário comum. */
export const MYTHICAL_WILD_CHANCE = 0.04;

// Quem evolui para quem (para saber o "estágio")
for (const s of SPECIES_LIST) for (const e of s.evos) if (SPECIES[e.to] && !SPECIES[e.to].evolvesFrom) SPECIES[e.to].evolvesFrom = s.id;
/** Número de espécies "base" da Pokédex nacional (sem contar formas). */
export const NATIONAL_DEX = SPECIES_LIST.filter(s => !s.form).length;

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
