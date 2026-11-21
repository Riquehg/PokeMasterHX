// ♂/♀ Sexo dos Pokémon (para a Creche/ovos). Sorteado de forma fixa pelo uid — não gasta o RNG da partida,
// então nada muda nas partidas antigas. Sem sexo: lendários/míticos e os "objetos" (Magnemite, Staryu, Porygon, Ditto...).
const GENDERLESS = ['magnemite', 'magneton', 'magnezone', 'voltorb', 'electrode', 'staryu', 'starmie', 'ditto', 'porygon', 'porygon2', 'porygon_z',
  'unown', 'shedinja', 'lunatone', 'solrock', 'baltoy', 'claydol', 'beldum', 'metang', 'metagross', 'bronzor', 'bronzong', 'rotom',
  'klink', 'klang', 'klinklang', 'cryogonal', 'golett', 'golurk', 'carbink', 'minior', 'dhelmise', 'type_null', 'silvally'];
const FEMALE_ONLY = ['nidoran_f', 'nidorina', 'nidoqueen', 'chansey', 'blissey', 'happiny', 'kangaskhan', 'jynx', 'smoochum', 'miltank', 'illumise',
  'vespiquen', 'froslass', 'petilil', 'lilligant', 'vullaby', 'mandibuzz', 'flabebe', 'floette', 'florges', 'salazzle', 'bounsweet', 'steenee', 'tsareena',
  'latias', 'cresselia', 'wormadam'];
const MALE_ONLY = ['nidoran_m', 'nidorino', 'nidoking', 'hitmonlee', 'hitmonchan', 'hitmontop', 'tyrogue', 'tauros', 'volbeat', 'gallade', 'throh', 'sawk',
  'rufflet', 'braviary', 'tornadus', 'thundurus', 'landorus', 'latios', 'mothim', 'impidimp'];
// 87,5% machos: iniciais, fósseis, Eevee e afins (como nos jogos)
const MOSTLY_MALE = ['bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard', 'squirtle', 'wartortle', 'blastoise', 'chikorita', 'bayleef', 'meganium',
  'cyndaquil', 'quilava', 'typhlosion', 'totodile', 'croconaw', 'feraligatr', 'treecko', 'grovyle', 'sceptile', 'torchic', 'combusken', 'blaziken', 'mudkip', 'marshtomp', 'swampert',
  'turtwig', 'grotle', 'torterra', 'chimchar', 'monferno', 'infernape', 'piplup', 'prinplup', 'empoleon', 'snivy', 'servine', 'serperior', 'tepig', 'pignite', 'emboar',
  'oshawott', 'dewott', 'samurott', 'chespin', 'quilladin', 'chesnaught', 'fennekin', 'braixen', 'delphox', 'froakie', 'frogadier', 'greninja', 'rowlet', 'dartrix', 'decidueye',
  'litten', 'torracat', 'incineroar', 'popplio', 'brionne', 'primarina', 'eevee', 'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon',
  'omanyte', 'omastar', 'kabuto', 'kabutops', 'aerodactyl', 'snorlax', 'munchlax', 'lucario', 'riolu', 'togepi', 'togetic', 'togekiss', 'electabuzz', 'elekid', 'electivire', 'magmar', 'magby', 'magmortar'];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** 'M' | 'F' | 'N' (sem sexo). */
export function genderFor(speciesId, uid, sp = null) {
  if (sp?.legendary || GENDERLESS.includes(speciesId)) return 'N';
  if (FEMALE_ONLY.includes(speciesId)) return 'F';
  if (MALE_ONLY.includes(speciesId)) return 'M';
  const r = (hash(`g|${uid}`) % 1000) / 1000;
  return r < (MOSTLY_MALE.includes(speciesId) ? 0.875 : 0.5) ? 'M' : 'F';
}
export const genderOf = (mon, sp = null) => mon?.gender || genderFor(mon?.sp, mon?.uid || '', sp);
export const GENDER_ICON = { M: '♂', F: '♀', N: '' };
export const genderHtml = g => (g === 'M' ? '<span class="g-m" title="Macho">♂</span>' : g === 'F' ? '<span class="g-f" title="Fêmea">♀</span>' : '');
