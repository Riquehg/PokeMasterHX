// ⚔️ v64 — gera shared/data/movecat.js: ~600 golpes REAIS (PokeAPI moves.csv) na escala do jogo.
// Uso: node scripts/build-moves.mjs
// Categoria pelo poder oficial: ≤50 (ou prioridade) = rápido · 55–75 = preciso · 80–100 = forte · 105+ = pesado.
// Nome oficial: dos ícones enviados (scripts/data/move-icon-names.txt) ou do identificador com as grafias oficiais.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const csv = f => {
  const [head, ...lines] = readFileSync(join(HERE, 'data/pokeapi', f), 'utf8').trim().split('\n');
  const cols = head.split(',');
  return lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
};
const TYPES = [null, 'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy'];
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const ICON = new Map(readFileSync(join(HERE, 'data/move-icon-names.txt'), 'utf8').split('\n').filter(Boolean).map(n => [slug(n), n]));
const FIX = { 'double-edge': 'Double-Edge', 'x-scissor': 'X-Scissor', 'u-turn': 'U-turn', 'mud-slap': 'Mud-Slap', 'self-destruct': 'Self-Destruct', 'wake-up-slap': 'Wake-Up Slap',
  'freeze-dry': 'Freeze-Dry', 'power-up-punch': 'Power-Up Punch', 'lands-wrath': "Land's Wrath", 'natures-madness': "Nature's Madness", 'v-create': 'V-create',
  'will-o-wisp': 'Will-O-Wisp', 'soft-boiled': 'Soft-Boiled', 'baby-doll-eyes': 'Baby-Doll Eyes', 'lock-on': 'Lock-On', 'multi-attack': 'Multi-Attack', 'trick-or-treat': 'Trick-or-Treat',
  'topsy-turvy': 'Topsy-Turvy', 'all-out-pummeling': 'All-Out Pummeling', 'king-s-shield': "King's Shield", 'forests-curse': "Forest's Curse", 'double-iron-bash': 'Double Iron Bash' };
const nameOf = id => FIX[id] || ICON.get(slug(id)) || id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

// golpes exclusivos (assinatura): só a espécie (e a linha/forma) aprende
export const SIGNATURE = {
  psystrike: 'mewtwo', aeroblast: 'lugia', 'sacred-fire': 'ho_oh', 'origin-pulse': 'kyogre', 'precipice-blades': 'groudon', 'dragon-ascent': 'rayquaza',
  'doom-desire': 'jirachi', 'psycho-boost': 'deoxys', 'roar-of-time': 'dialga', 'spacial-rend': 'palkia', 'shadow-force': 'giratina', 'magma-storm': 'heatran',
  'seed-flare': 'shaymin', judgment: 'arceus', 'v-create': 'victini', 'searing-shot': 'victini', 'blue-flare': 'reshiram', 'fusion-flare': 'reshiram', 'bolt-strike': 'zekrom',
  'fusion-bolt': 'zekrom', glaciate: 'kyurem', 'freeze-shock': 'kyurem', 'ice-burn': 'kyurem', 'secret-sword': 'keldeo', 'relic-song': 'meloetta', 'techno-blast': 'genesect',
  'lands-wrath': 'zygarde', 'thousand-arrows': 'zygarde', 'thousand-waves': 'zygarde', 'core-enforcer': 'zygarde', 'oblivion-wing': 'yveltal', 'diamond-storm': 'diancie',
  'hyperspace-hole': 'hoopa', 'hyperspace-fury': 'hoopa', 'steam-eruption': 'volcanion', 'spectral-thief': 'marshadow', 'moongeist-beam': 'lunala', 'sunsteel-strike': 'solgaleo',
  'photon-geyser': 'necrozma', 'prismatic-laser': 'necrozma', 'plasma-fists': 'zeraora', 'double-iron-bash': 'melmetal', 'behemoth-blade': 'zacian', 'behemoth-bash': 'zamazenta',
  'dynamax-cannon': 'eternatus', 'wicked-blow': 'urshifu', 'surging-strikes': 'urshifu', 'thunder-cage': 'regieleki', 'dragon-energy': 'regidrago', 'glacial-lance': 'glastrier',
  'astral-barrage': 'spectrier', 'eerie-spell': 'slowking_galar', 'freezing-glare': 'articuno_galar', 'thunderous-kick': 'zapdos_galar', 'fiery-wrath': 'moltres_galar',
  'springtide-storm': 'enamorus', 'bleakwind-storm': 'tornadus', 'wildbolt-storm': 'thundurus', 'sandsear-storm': 'landorus', 'collision-course': 'koraidon',
  'electro-drift': 'miraidon', 'tera-starstorm': 'terapagos', 'blood-moon': 'ursaluna', 'ivy-cudgel': 'ogerpon', 'matcha-gotcha': 'sinistcha', 'syrup-bomb': 'dipplin',
  'fickle-beam': 'hydrapple', thunderclap: 'raging_bolt', 'hydro-steam': 'walking_wake', psyblade: 'iron_leaves', 'mighty-cleave': 'iron_boulder', 'tachyon-cutter': 'iron_crown',
  'gigaton-hammer': 'tinkaton', 'kowtow-cleave': 'kingambit', 'make-it-rain': 'gholdengo', 'aqua-step': 'quaquaval', 'torch-song': 'skeledirge', 'flower-trick': 'meowscarada',
  'armor-cannon': 'armarouge', 'bitter-blade': 'ceruledge', 'jet-punch': 'palafin', 'double-shock': 'pawmot', 'rage-fist': 'annihilape', 'population-bomb': 'maushold',
  'salt-cure': 'garganacl', 'glaive-rush': 'baxcalibur', 'mountain-gale': 'avalugg_hisui', 'stone-axe': 'kleavor', 'ceaseless-edge': 'samurott_hisui', 'dire-claw': 'sneasler',
  'infernal-parade': 'typhlosion_hisui', 'headlong-rush': 'ursaluna', 'bitter-malice': 'basculegion', 'esper-wing': 'enamorus', 'mystical-power': 'enamorus', 'raging-bull': 'tauros_paldea',
  'bolt-beak': 'dracozolt', 'fishious-rend': 'dracovish', 'snipe-shot': 'inteleon', 'pyro-ball': 'cinderace', 'drum-beating': 'rillaboom', 'spirit-shackle': 'decidueye',
  'darkest-lariat': 'incineroar', 'sparkling-aria': 'primarina', 'clanging-scales': 'kommo_o', 'shell-trap': 'turtonator', 'beak-blast': 'toucannon', 'trop-kick': 'tsareena',
  'anchor-shot': 'dhelmise', 'mind-blown': 'blacephalon', 'luster-purge': 'latios', 'mist-ball': 'latias', 'crush-grip': 'regigigas', 'light-of-ruin': 'floette',
  'volt-tackle': 'pikachu', 'zippy-zap': 'pikachu', 'blast-burn': 'charizard', 'frenzy-plant': 'venusaur', 'sappy-seed': 'venusaur', 'sizzly-slide': 'charizard',
  'bouncy-bubble': 'vaporeon', 'buzzy-buzz': 'jolteon', 'glitzy-glow': 'mew', 'baddy-bad': 'mew', 'freezy-frost': 'mew', 'splishy-splash': 'pikachu', 'floaty-fall': 'pikachu',
  'pika-papow': 'pikachu', 'veevee-volley': 'eevee', 'false-surrender': 'grimmsnarl', 'spirit-break': 'grimmsnarl', 'jaw-lock': 'drednaw', 'apple-acid': 'appletun', 'grav-apple': 'flapple',
  'steel-beam': 'duraludon', 'meteor-beam': 'duraludon', 'expanding-force': 'indeedee', 'shell-side-arm': 'slowbro_galar', 'chloroblast': 'decidueye', 'triple-arrows': 'decidueye_hisui',
  'barb-barrage': 'qwilfish_hisui', 'wave-crash': 'basculegion', 'lunar-blessing': 'cresselia', 'shed-tail': 'cyclizar', 'hyper-drill': 'dudunsparce', 'spin-out': 'revavroom',
  'last-respects': 'houndstone', 'twin-beam': 'farigiraf', 'comeuppance': 'kingambit', 'ruination': 'ting_lu', 'aqua-cutter': 'veluza', 'ice-spinner': 'baxcalibur',
  'electro-shot': 'archaludon', 'burning-bulwark': 'raging_bolt', 'alluring-voice': 'hatterene', 'psychic-noise': 'farigiraf', 'temper-flare': 'raging_bolt', 'supercell-slam': 'raging_bolt',
  'upper-hand': 'iron_boulder', 'dragon-cheer': 'raging_bolt', 'blazing-torque': 'revavroom', 'wicked-torque': 'revavroom', 'noxious-torque': 'revavroom', 'combat-torque': 'revavroom',
  'magical-torque': 'revavroom', 'fleur-cannon': 'magearna', 'shadow-bone': 'marowak_alola', 'sacred-sword': 'cobalion',
  'dragon-darts': 'dragapult', 'malignant-chain': 'pecharunt', 'strange-steam': 'weezing_galar', eternabeam: 'eternatus', 'sparkly-swirl': 'eevee',
  'meteor-assault': 'sirfetchd', 'aura-wheel': 'morpeko', 'obstruct': 'obstagoon', 'stuff-cheeks': 'greedent', 'no-retreat': 'falinks', 'octolock': 'grapploct',
  'snap-trap': 'rillaboom', 'overdrive': 'toxtricity', 'clangorous-soul': 'kommo_o', 'jungle-healing': 'zarude', 'freezy-frost': 'mew', 'zing-zap': 'togedemaru',
  'stomping-tantrum': null, 'lumina-crash': 'glimmora', 'mortal-spin': 'glimmora', 'spicy-extract': 'scovillain', 'trailblaze': null, 'tidy-up': 'maushold',
  'aqua-ring': null, 'fiery-dance': 'volcarona', 'quiver-dance': null, 'sacred-fire': 'ho_oh', 'gear-grind': 'klinklang', 'shift-gear': 'klinklang',
  'leaf-tornado': 'serperior', 'attack-order': 'vespiquen', 'heal-order': 'vespiquen', 'spore': 'breloom', 'crabhammer': 'kingler', 'sky-uppercut': 'hitmonchan'
};
// só ficam de fora golpes que não fazem sentido no jogo (se nocauteiam, aleatórios demais, dependem de item guardado)
const EXCLUDE = new Set(['struggle', 'self-destruct', 'explosion', 'misty-explosion', 'present', 'natural-gift', 'fling', 'hidden-power', 'beat-up', 'bide', 'spit-up', 'final-gambit']);
// perdem metade do HP ao usar (tratados como recuo forte)
const SELF_HURT = new Set(['mind-blown', 'steel-beam', 'chloroblast']);

// efeito do PokeAPI → efeito do jogo
const EFFECT = {
  3: { st: 'poison' }, 5: { st: 'burn' }, 6: { st: 'freeze' }, 7: { st: 'paralysis' }, 126: { st: 'burn' }, 153: { st: 'paralysis' }, 261: { st: 'freeze' },
  210: { st: 'poison', hc: 1 }, 274: { st: 'burn', fl: 10 }, 275: { st: 'freeze', fl: 10 }, 276: { st: 'paralysis', fl: 10 }, 254: { st: 'burn', rc: 3 }, 263: { st: 'paralysis', rc: 3 },
  18: { nm: 1 }, 32: { fl: 1 }, 44: { hc: 1 }, 49: { rc: 4 }, 199: { rc: 3 }, 270: { rc: 2 }, 81: { rch: 1 }, 205: { sd: 1 }, 230: { sd: 1 }, 4: { drain: 1 }, 348: { drain: 1 },
  78: { st: 'poison', ch: 20 }, 203: { st: 'poison' }
};
// golpes de condição (sem dano): aplicam a condição
const STATUS_MOVES = { 'thunder-wave': 'paralysis', 'stun-spore': 'paralysis', glare: 'paralysis', 'will-o-wisp': 'burn', toxic: 'poison', 'poison-powder': 'poison',
  'poison-gas': 'poison', 'toxic-thread': 'poison', hypnosis: 'sleep', 'sleep-powder': 'sleep', spore: 'sleep', 'sing': 'sleep', 'lovely-kiss': 'sleep', 'grass-whistle': 'sleep',
  'dark-void': 'sleep', yawn: 'sleep' };
// golpes de suporte que o jogo já entende
const SUPPORT_MOVES = { recover: 'heal', 'soft-boiled': 'heal', roost: 'heal', synthesis: 'heal', moonlight: 'heal', 'morning-sun': 'heal', 'slack-off': 'heal', 'milk-drink': 'heal',
  'shore-up': 'heal', 'heal-order': 'heal', rest: 'heal', 'swords-dance': 'buff', 'dragon-dance': 'buff', 'nasty-plot': 'buff', 'calm-mind': 'buff', 'bulk-up': 'buff',
  'quiver-dance': 'buff', 'shell-smash': 'buff', 'hone-claws': 'buff', 'work-up': 'buff', growth: 'buff', 'coil': 'buff', 'victory-dance': 'buff', 'tidy-up': 'buff',
  growl: 'debuff', charm: 'debuff', 'feather-dance': 'debuff', 'baby-doll-eyes': 'debuff', 'play-nice': 'debuff', tickle: 'debuff', 'noble-roar': 'debuff', 'parting-shot': 'debuff',
  'scary-face': 'debuff', 'fake-tears': 'debuff', screech: 'debuff', 'metal-sound': 'debuff', 'eerie-impulse': 'debuff', confide: 'debuff', 'captivate': 'debuff' };

const tierOf = (pw, prio) => (prio > 0 || pw <= 50 ? 'q' : pw <= 75 ? 'p' : pw <= 100 ? 's' : 'x');
const out = [];
for (const r of csv('moves.csv')) {
  const id = r.identifier, n = Number(r.id);
  if (n >= 10000 || r.pp === '1' || id.startsWith('max-') || id.startsWith('g-max-')) continue;
  const type = TYPES[Number(r.type_id)];
  if (!type) continue;
  const acc = Number(r.accuracy) || 0, prio = Number(r.priority) || 0;
  if (r.damage_class_id === '1') {
    const k = SUPPORT_MOVES[id] ? 'sup' : STATUS_MOVES[id] ? 'st' : null;
    if (!k) continue;
    out.push([id, nameOf(id), type, k === 'sup' ? SUPPORT_MOVES[id] : 'status', 0, acc, prio, k === 'st' ? { st: STATUS_MOVES[id] } : {}, SIGNATURE[id] || null]);
    continue;
  }
  const pw = Number(r.power) || 0;
  if (!pw || pw < 20 || EXCLUDE.has(id)) continue;
  const ef = { ...(EFFECT[Number(r.effect_id)] || {}) };
  if (SELF_HURT.has(id)) ef.rc = 2;
  if (ef.st) ef.ch = Number(r.effect_chance) || ef.ch || 10;
  if (ef.fl === 1) ef.fl = Number(r.effect_chance) || 30;
  out.push([id, nameOf(id), type, ef.drain ? 'drain' : tierOf(pw, prio), pw, acc, prio, ef, SIGNATURE[id] || null]);
}
for (const r of out) { // os nomes vêm dos ícones; quando o ícone escreve diferente (ex.: "Moon Blast"), usa a grafia oficial
  const off = r[0].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  if (slug(off) === slug(r[1]) && r[1] !== off && !FIX[r[0]] && /\s/.test(r[1]) !== /\s/.test(off)) r[1] = off;
}
const body = out.map(r => JSON.stringify(r)).join(',\n');
writeFileSync(join(HERE, '../shared/data/movecat.js'), `// ⚔️ v64 — catálogo de golpes reais (gerado por scripts/build-moves.mjs a partir do PokeAPI). NÃO editar à mão.
// [identificador, nome oficial, tipo, categoria (q rápido · p preciso · s forte · x pesado · drain · heal/buff/debuff · status), poder oficial,
//  precisão (0 = nunca erra), prioridade, efeitos {st condição, ch chance %, fl hesitar %, hc crítico alto, rc recuo 1/n, rch recarrega, sd cai o próprio ataque, nm nunca erra},
//  espécie dona (golpe exclusivo) ou null]
export const MOVE_CAT = [
${body}
];
`);
console.log('golpes:', out.length, '· com dono:', out.filter(r => r[8]).length, '· com ícone:', out.filter(r => ICON.has(slug(r[0]))).length);
