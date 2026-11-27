// Gerador de mapas ("Expedição"): cria um tabuleiro novo a partir de uma semente.
// O mesmo número gera sempre o mesmo mapa — no servidor e no navegador — então só a semente vai no estado da partida.
// Regras de desenho:
//  - 8 cidades no caminho principal (início, 6 ginásios, Planalto) + Estrada da Vitória + Liga e Arena Final;
//  - rotas curvas entre as cidades, algumas com caminho alternativo;
//  - áreas escondidas que exigem uma habilidade (Surf, Cortar, Quebra-Pedra, Flash, Escalada, Queimar, Voar);
//  - atalhos entre rotas também com habilidade;
//  - tier sobe com o progresso; áreas escondidas têm tier maior (Pokémon mais raros).
// Só usa contas exatas (+, −, ×, ÷, raiz) para dar o mesmo resultado em qualquer navegador.
import { createRng } from '../../rules/rng.js';

const RATIO = 2;            // largura = 2 × altura
const MIN_GAP = 5.2;        // distância mínima entre casas (unidades do palco, x em escala RATIO)

const TOWN_NAMES = ['Vila Aurora', 'Porto Coral', 'Cidade Granito', 'Vale Esmeralda', 'Monte Brasa', 'Lagoa Serena', 'Cidade Neblina',
  'Recanto do Vento', 'Baía Dourada', 'Cidade Lunar', 'Vila Musgo', 'Pico Âmbar', 'Porto Safira', 'Cidade Trovão', 'Vale das Flores', 'Cidade Areia'];
const ROUTE_BIOMES = ['grass', 'forest', 'coast', 'desert', 'snow', 'mountain', 'cave', 'jungle', 'volcano'];
const SECRET = {
  surf:  { biome: 'sea',      names: ['Mar Aberto', 'Ilha Coral', 'Recife Azul', 'Ilha Perdida'] },
  cut:   { biome: 'forest',   names: ['Bosque Fechado', 'Mata Antiga', 'Trilha Verde'] },
  smash: { biome: 'cave',     names: ['Gruta das Pedras', 'Mina Abandonada', 'Caverna Rachada'] },
  flash: { biome: 'darkcave', names: ['Gruta Escura', 'Túnel Sombrio', 'Caverna Sem Luz'] },
  climb: { biome: 'mountain', names: ['Penhasco Alto', 'Pico Gelado', 'Escarpa do Dragão'] },
  burn:  { biome: 'forest',   names: ['Espinheiro', 'Mata de Espinhos'] },
  fly:   { biome: 'mountain', names: ['Ninho das Nuvens', 'Platô do Vento'] }
};
const SECRET_KINDS = ['surf', 'cut', 'smash', 'flash', 'climb', 'burn', 'fly', 'surf', 'smash', 'flash'];
const TOWN_TIERS = [1, 2, 2, 3, 3, 4, 4, 5];
const GYM_IDS = ['boulder', 'cascade', 'thunder', 'rainbow', 'volcano', 'soul'];

/** Temas de mapa gerado. weights = ambientes (o primeiro domina); backdrop = o que fica entre as rotas;
 *  holes = quantos "buracos" (mar, lava, picos, mata fechada) recortam a malha e viram áreas escondidas. */
export const MAP_THEMES = {
  expedicao: { name: 'Expedição', desc: 'Um mapa novo a cada partida: malha de rotas grande, ilhas e áreas escondidas diferentes.',
    weights: [['grass', 22], ['forest', 14], ['coast', 14], ['mountain', 10], ['cave', 10], ['desert', 8], ['jungle', 8], ['snow', 7], ['volcano', 7]],
    backdrop: 'sea', holes: [5, 7], holeR: [9, 13], secrets: ['surf', 'cut', 'smash', 'flash', 'climb', 'burn', 'fly', 'surf', 'smash', 'flash'],
    layout: { sr: 4, pr: 4, loops: 0.3, W: { h: 1, v: 1.25, d: 1.7 }, legends: 3 } },
  arquipelago: { name: 'Arquipélago Coral', seed: 4242, desc: 'Ilhas grandes ligadas por praias, com mar aberto por todo lado: muito Surf, Água e Voadores.',
    first: 'coast', weights: [['coast', 46], ['jungle', 16], ['grass', 12], ['forest', 8], ['cave', 7], ['mountain', 6], ['volcano', 5]],
    // 🗺️ v64: começa embaixo à esquerda e sobe em diagonal até a Liga; muitas ilhas e laços curtos entre praias
    layout: { sr: 7, pr: 1, loops: 0.38, W: { h: 1, v: 1.1, d: 1.3 }, edge: 0.55, legends: 4 },
    backdrop: 'sea', holes: [8, 10], holeR: [10, 15], holeBiome: 'sea', secrets: ['surf', 'surf', 'surf', 'fly', 'surf', 'cut', 'surf', 'flash', 'surf', 'climb'],
    towns: ['Porto Coral', 'Ilha Concha', 'Recife Azul', 'Vila Maré', 'Baía Dourada', 'Ilha Farol', 'Porto Safira', 'Atol Celeste', 'Praia Lunar', 'Ilha Palmeira'],
    places: { coast: ['Praia do Sol', 'Costa das Conchas', 'Enseada Azul', 'Praia dos Corais', 'Litoral Dourado'], jungle: ['Selva da Ilha', 'Mata Tropical'], grass: ['Campo das Palmeiras'], forest: ['Bosque Salgado'], cave: ['Gruta Marinha'], mountain: ['Morro do Farol'], volcano: ['Ilha Fumegante'], sea: ['Mar Aberto', 'Recife Perdido', 'Ilhota Secreta'] } },
  vulcanica: { name: 'Terras de Fogo', seed: 1717, desc: 'Desertos, vulcões e cânions cercados de lava: Fogo, Pedra, Terra e Dragão.',
    first: 'desert', weights: [['volcano', 38], ['desert', 30], ['mountain', 14], ['cave', 13], ['darkcave', 5]],
    // 🗺️ v64: começa no alto e desce em zigue-zague (trilhas verticais, poucos atalhos) entre rios de lava
    layout: { sr: 1, pr: 7, loops: 0.14, W: { h: 1.7, v: 0.7, d: 1.4 }, edge: 0.2, legends: 3 },
    backdrop: 'lava', holes: [6, 8], holeR: [9, 13], holeBiome: 'volcano', secrets: ['burn', 'climb', 'smash', 'burn', 'flash', 'climb', 'fly', 'smash', 'burn', 'climb'],
    towns: ['Vila Cinza', 'Cidade Brasa', 'Oásis Rubro', 'Monte Magma', 'Cânion Seco', 'Forja Antiga', 'Cidade Areia', 'Pico Âmbar', 'Vale Fumegante', 'Dunas Altas'],
    places: { volcano: ['Encosta de Magma', 'Cratera Viva', 'Campo de Cinzas', 'Rio de Lava'], desert: ['Dunas Vermelhas', 'Deserto Escaldante', 'Cânion do Sol'], mountain: ['Penhasco Rubro'], cave: ['Túnel de Basalto'], darkcave: ['Fenda Sombria'] } },
  glacial: { name: 'Picos Gelados', seed: 9090, desc: 'Montanhas nevadas, lagos congelados e cavernas escuras: Gelo, Pedra, Fantasma e Psíquico.',
    first: 'snow', weights: [['snow', 48], ['mountain', 20], ['cave', 13], ['darkcave', 10], ['coast', 9]],
    // 🗺️ v64: começa no meio-baixo, encostas em diagonal e longas subidas até o pico da Liga (no alto)
    layout: { sr: 6, pr: 2, loops: 0.18, W: { h: 1.3, v: 1.5, d: 0.8 }, edge: 0.45, jitter: 1.5, legends: 4 },
    backdrop: 'snow', holes: [6, 8], holeR: [9, 13], holeBiome: 'mountain', secrets: ['climb', 'flash', 'surf', 'climb', 'smash', 'flash', 'fly', 'climb', 'surf', 'flash'],
    towns: ['Vila Geada', 'Cidade Neblina', 'Pico Branco', 'Lago Cristal', 'Cidade Lunar', 'Gruta Azul', 'Vale do Eco', 'Forte Nevado', 'Aldeia Aurora', 'Monte Silêncio'],
    places: { snow: ['Campo Nevado', 'Trilha da Nevasca', 'Vale Congelado', 'Planície Branca'], mountain: ['Encosta Gelada', 'Pico do Vento'], cave: ['Caverna de Gelo'], darkcave: ['Gruta do Silêncio'], coast: ['Lago Congelado'] } },
  floresta: { name: 'Mata Profunda', seed: 3131, desc: 'Florestas e selvas fechadas, trilhas entrelaçadas: Planta, Inseto, Veneno e muito Cortar.',
    first: 'forest', weights: [['forest', 42], ['jungle', 30], ['grass', 14], ['coast', 5], ['cave', 5], ['mountain', 4]],
    // 🗺️ v64: trilhas entrelaçadas (muitos laços e bifurcações), começa no alto e termina embaixo
    layout: { sr: 2, pr: 6, loops: 0.55, W: { h: 1, v: 1, d: 1 }, edge: 0.3, legends: 3 },
    backdrop: 'forest', holes: [6, 8], holeR: [9, 13], holeBiome: 'forest', secrets: ['cut', 'cut', 'burn', 'cut', 'fly', 'surf', 'cut', 'flash', 'burn', 'smash'],
    towns: ['Vila Musgo', 'Vale Esmeralda', 'Cidade Raiz', 'Recanto do Vento', 'Clareira Sol', 'Vale das Flores', 'Aldeia Cipó', 'Bosque Antigo', 'Cidade Orvalho', 'Lagoa Serena'],
    places: { forest: ['Bosque Antigo', 'Trilha dos Carvalhos', 'Floresta Sombria', 'Mata dos Cogumelos'], jungle: ['Selva Úmida', 'Cipoal', 'Selva dos Ecos'], grass: ['Clareira Florida', 'Prado Verde'], coast: ['Margem do Rio'], cave: ['Toca das Raízes'], mountain: ['Morro Musgoso'] } }
};
const PLACE_DEFAULT = { grass: ['Campos Verdes', 'Pradaria'], forest: ['Floresta Densa', 'Bosque'], coast: ['Litoral', 'Praia'], desert: ['Deserto', 'Dunas'], mountain: ['Montanha', 'Serra'],
  cave: ['Caverna', 'Túnel'], darkcave: ['Gruta Escura'], jungle: ['Selva'], snow: ['Campo Nevado'], volcano: ['Vulcão', 'Cratera'], sea: ['Mar Aberto', 'Ilha Perdida'] };
export const THEME_IDS = Object.keys(MAP_THEMES).filter(k => k !== 'expedicao');

const cache = new Map();

// ---------- geometria (só + − × ÷)
const orient = (a, b, c) => (b.X - a.X) * (c.Y - a.Y) - (b.Y - a.Y) * (c.X - a.X);
function segCross(a, b, c, d) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}
const P = s => ({ X: s.x * RATIO, Y: s.y, id: s.id });
/** Distância² de um ponto a um segmento. */
function segDist2(p, a, b) {
  const vx = b.X - a.X, vy = b.Y - a.Y, wx = p.X - a.X, wy = p.Y - a.Y;
  const l2 = vx * vx + vy * vy || 1;
  let t = (wx * vx + wy * vy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.X + vx * t - p.X, dy = a.Y + vy * t - p.Y;
  return dx * dx + dy * dy;
}

/** Mapa gerado pela semente (guardado em memória). */
export function generateMap(seed, themeId = 'expedicao') {
  seed = Number(seed) >>> 0;
  const theme = MAP_THEMES[themeId] ? themeId : 'expedicao';
  const key = `${theme}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  // tenta variações da mesma semente até achar um mapa sem cruzamentos e grande (malha no estilo de Kanto)
  let map = null;
  for (let k = 0; k < 12; k++) {
    const m = build((seed + k * 977) >>> 0, theme);
    if (!m) continue;
    if (!map || score(m) > score(map)) map = m;
    if (m.crossings === 0 && m.spaces.length >= 125 && m.branches >= 30) break;
  }
  map.id = theme === 'expedicao' ? `gen:${seed}` : `theme:${theme}`;
  map.seed = seed;
  map.theme = theme;
  map.name = MAP_THEMES[theme].name;
  map.desc = MAP_THEMES[theme].desc;
  map.backdrop = MAP_THEMES[theme].backdrop || 'sea';
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  cache.set(key, map);
  return map;
}

// Malha: grade com tremido → árvore aleatória + laços (como Kanto, cheio de bifurcações e voltas) → "buracos" (mar, lava,
// picos, mata) recortam a malha e viram as áreas escondidas com habilidade. Só arestas da grade = nunca cruzam.
const COLS = 22, ROWS = 9, MESH_X0 = 4, MESH_X1 = 83, MESH_Y0 = 8, MESH_Y1 = 92;

function build(seed, themeId = 'expedicao') {
  const T = MAP_THEMES[themeId] || MAP_THEMES.expedicao;
  const L = { sr: 4, pr: 4, loops: 0.3, W: { h: 1, v: 1.25, d: 1.7 }, edge: 0.35, jitter: 1, ...(T.layout || {}) };
  const rng = createRng(seed ^ 0x5bd1e995);
  const dxp = (MESH_X1 - MESH_X0) / (COLS - 1), dyp = (MESH_Y1 - MESH_Y0) / (ROWS - 1);

  // ---------- 1) grade com tremido
  const grid = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    grid.push({ c, r, x: MESH_X0 + c * dxp + rng.int(-6, 6) / 10 * dxp * 0.3 * L.jitter, y: MESH_Y0 + r * dyp + (r % 2 ? 0.35 : -0.35) * dyp * 0.25 + rng.int(-6, 6) / 10 * dyp * 0.25 * L.jitter });
  }
  const at = (c, r) => (c >= 0 && r >= 0 && c < COLS && r < ROWS ? grid[r * COLS + c] : null);
  const gi = g => g.r * COLS + g.c;
  // arestas da grade: direita, baixo e UMA diagonal por célula (assim nada cruza)
  const gEdges = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (c < COLS - 1) gEdges.push([gi(at(c, r)), gi(at(c + 1, r)), 'h']);
    if (r < ROWS - 1) gEdges.push([gi(at(c, r)), gi(at(c, r + 1)), 'v']);
    if (c < COLS - 1 && r < ROWS - 1) gEdges.push(rng.chance(0.5) ? [gi(at(c, r)), gi(at(c + 1, r + 1)), 'd'] : [gi(at(c + 1, r)), gi(at(c, r + 1)), 'd']);
  }

  // ---------- 2) buracos (mar / lava / picos / mata fechada) — não encostam no início nem no Planalto
  const hole = new Set();
  const nHoles = rng.int(T.holes[0], T.holes[1]);
  for (let h = 0; h < nHoles; h++) {
    const cx = MESH_X0 + 10 + rng.next() * (MESH_X1 - MESH_X0 - 18), cy = MESH_Y0 + rng.next() * (MESH_Y1 - MESH_Y0);
    const R = rng.int(T.holeR[0], T.holeR[1]);
    const sx = 1 + rng.int(-3, 3) / 10, sy = 1 + rng.int(-3, 3) / 10;
    for (const g of grid) { const dx = (g.x - cx) * RATIO / sx, dy = (g.y - cy) / sy; if (dx * dx + dy * dy < R * R) hole.add(gi(g)); }
  }
  // bordas comidas aqui e ali (o contorno não fica um retângulo)
  for (const g of grid) if ((g.r === 0 || g.r === ROWS - 1) && rng.chance(L.edge)) hole.add(gi(g));
  const startG = at(0, L.sr), plateauG = at(COLS - 1, L.pr);
  // a última coluna fica livre (só o Planalto) para a Estrada da Vitória passar
  for (let r = 0; r < ROWS; r++) if (r !== L.pr) hole.add(gi(at(COLS - 1, r)));
  for (const g of [startG, at(1, L.sr), at(0, L.sr - 1), at(0, L.sr + 1), at(1, L.sr - 1), at(1, L.sr + 1), plateauG, at(COLS - 2, L.pr), at(COLS - 2, L.pr - 1), at(COLS - 2, L.pr + 1)]) if (g) hole.delete(gi(g));

  // ---------- 3) árvore aleatória + laços, só nas casas de terra
  const alive = i => !hole.has(i);
  const parent = grid.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const W = L.W;
  const cand = gEdges.filter(([a, b]) => alive(a) && alive(b)).map(e => ({ e, w: rng.next() * W[e[2]] })).sort((p, q) => p.w - q.w).map(p => p.e);
  const adj = grid.map(() => new Set());
  const use = (a, b) => { adj[a].add(b); adj[b].add(a); };
  const rest = [];
  for (const [a, b, k] of cand) {
    if (find(a) !== find(b)) { parent[find(a)] = find(b); use(a, b); } else rest.push([a, b, k]);
  }
  // laços: Kanto tem muitas bifurcações (≈ 4 em cada 10 casas) e quase nunca 4 saídas
  for (const [a, b, k] of rest) {
    if (adj[a].size >= 3 || adj[b].size >= 3) continue;
    if (rng.chance(k === 'd' ? L.loops * 0.4 : L.loops)) use(a, b);
  }
  // só fica o pedaço ligado ao início, e precisa chegar no Planalto
  const comp = new Set([gi(startG)]); const q0 = [gi(startG)];
  while (q0.length) { const a = q0.shift(); for (const b of adj[a]) if (!comp.has(b)) { comp.add(b); q0.push(b); } }
  if (!comp.has(gi(plateauG))) { build.why = "plateau"; return null; }
  // corta becos sem saída (fica só o "miolo" com voltas), menos o início e o Planalto
  const keep = new Set(comp);
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const a of [...keep]) {
      if (a === gi(startG) || a === gi(plateauG)) continue;
      const deg = [...adj[a]].filter(b => keep.has(b)).length;
      if (deg <= 1) { keep.delete(a); pruned = true; }
    }
  }
  // o Planalto tem que ficar ligado (se ficou como ponta, tudo bem)
  if (![...adj[gi(plateauG)]].some(b => keep.has(b))) return null;

  // ---------- 4) progresso (distância do início × distância do Planalto) → tier
  const bfs = src => { const d = new Map([[src, 0]]); const q = [src]; while (q.length) { const a = q.shift(); for (const b of adj[a]) if (keep.has(b) && !d.has(b)) { d.set(b, d.get(a) + 1); q.push(b); } } return d; };
  const dS = bfs(gi(startG)), dP = bfs(gi(plateauG));
  const prog = i => dS.get(i) / Math.max(1, dS.get(i) + dP.get(i));
  const tierOf = p => (p < 0.15 ? 1 : p < 0.37 ? 2 : p < 0.61 ? 3 : p < 0.88 ? 4 : 5);

  // ---------- 5) cidades: início, 6 ginásios em ordem, 2 vilas de descanso e o Planalto
  const cityIdx = new Set([gi(startG), gi(plateauG)]);
  const farFromCities = (i, min) => [...cityIdx].every(c => { const d = bfs(c).get(i); return d === undefined || d >= min; });
  const pickCity = target => {
    const opts = [...keep].filter(i => !cityIdx.has(i) && adj[i].size >= 2).sort((a, b) => Math.abs(prog(a) - target) - Math.abs(prog(b) - target));
    for (const min of [5, 4, 3]) { const i = opts.find(o => farFromCities(o, min)); if (i !== undefined) { cityIdx.add(i); return i; } }
    return null;
  };
  const gymIdx = [0.13, 0.27, 0.42, 0.56, 0.7, 0.83].map(pickCity);
  if (gymIdx.some(i => i === null)) { build.why = "gym"; return null; }
  const restIdx = [0.35, 0.63].map(pickCity).filter(i => i !== null);

  // ---------- 6) ambientes por regiões (o do tema domina)
  const seeds = [];
  const nSeeds = rng.int(9, 12);
  for (let k = 0; k < nSeeds; k++) {
    const x = MESH_X0 + rng.next() * (MESH_X1 - MESH_X0), y = MESH_Y0 + rng.next() * (MESH_Y1 - MESH_Y0);
    seeds.push({ x, y, biome: k === 0 && T.first ? T.first : rng.weighted(T.weights) });
  }
  seeds[0].x = startG.x + 6; seeds[0].y = startG.y; // a região do início é a do tema
  const places = {};
  const regionOf = g => { let best = 0, bd = Infinity; seeds.forEach((sd, k) => { const dx = (g.x - sd.x) * RATIO, dy = g.y - sd.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = k; } }); return best; };
  const placeName = (k, biome) => {
    if (!places[k]) { const list = T.places?.[biome] || PLACE_DEFAULT[biome] || ['Rota']; places[k] = list[(k + seed) % list.length]; }
    return places[k];
  };

  // ---------- 7) monta as casas
  const spaces = [];
  const edges = [];
  const add = o => { const s = { id: spaces.length + 1, links: [], gate: null, ...o }; spaces.push(s); return s; };
  const link = (a, b) => { if (a === b) return; if (!a.links.includes(b.id)) a.links.push(b.id); if (!b.links.includes(a.id)) b.links.push(a.id); edges.push([P(a), P(b)]); };
  const names = shuffle(rng, T.towns || TOWN_NAMES);
  const sOf = new Map();
  const order = [...keep].sort((a, b) => dS.get(a) - dS.get(b) || a - b);
  let evRun = 0;
  for (const i of order) {
    const g = grid[i];
    const isCity = cityIdx.has(i);
    let o;
    if (isCity) {
      const gym = gymIdx.indexOf(i);
      const name = i === gi(startG) ? names[0] : i === gi(plateauG) ? 'Planalto Índigo' : gym >= 0 ? names[gym + 1] : names[7 + restIdx.indexOf(i)] || `Vila ${i}`;
      o = { name, type: 'city', biome: 'city', tier: i === gi(plateauG) ? 5 : Math.min(4, tierOf(prog(i))) };
    } else {
      const k = regionOf(g);
      const biome = seeds[k].biome;
      let type = rng.chance(0.56) ? 'pokemon' : 'event';
      evRun = type === 'event' ? evRun + 1 : 0;
      if (evRun >= 3) { type = 'pokemon'; evRun = 0; }
      o = { name: placeName(k, biome), type, biome, tier: tierOf(prog(i)) };
    }
    sOf.set(i, add({ ...o, x: g.x, y: g.y }));
  }
  for (const a of keep) for (const b of adj[a]) if (keep.has(b) && a < b) link(sOf.get(a), sOf.get(b));

  // ---------- 8) áreas escondidas: casas dos buracos coladas na malha (becos com habilidade e atalhos)
  const holeKinds = shuffle(rng, T.secrets);
  const holeNodes = [...grid.keys()].filter(i => !keep.has(i) && grid[i].c < COLS - 1);
  const gridNb = i => { const g = grid[i]; return gEdges.filter(e => e[0] === i || e[1] === i).map(e => (e[0] === i ? e[1] : e[0])); };
  const used = new Set();
  let made = 0;
  for (const i of shuffle(rng, holeNodes)) {
    if (made >= 11) break;
    if (used.has(i)) continue;
    const mesh = gridNb(i).filter(n => keep.has(n) && !cityIdx.has(n));
    if (!mesh.length) continue;
    // não grudar duas áreas na mesma casa da rota
    if (mesh.some(n => [...used].some(u => gridNb(u).includes(n)))) continue;
    const kind = holeKinds[made % holeKinds.length];
    const info = SECRET[kind];
    const biome = T.holeBiome && (kind === 'surf' ? 'sea' : kind === 'climb' || kind === 'fly' ? (T.holeBiome === 'volcano' ? 'volcano' : 'mountain') : info.biome) || info.biome;
    const base = sOf.get(mesh[0]);
    const tier = Math.min(5, base.tier + 1);
    const name = (T.places?.sea && kind === 'surf' ? rng.pick(T.places.sea) : rng.pick(info.names));
    const chain = [i];
    // às vezes a área continua para dentro do buraco (2–3 casas)
    let cur = i;
    for (let k = 0; k < 2 && rng.chance(0.6); k++) {
      const nx = gridNb(cur).find(n => !keep.has(n) && !used.has(n) && !chain.includes(n) && !gridNb(n).some(m => keep.has(m) && m !== mesh[0]));
      if (nx === undefined) break;
      chain.push(nx); cur = nx;
    }
    let prev = base;
    chain.forEach((ci, k) => {
      const last = k === chain.length - 1;
      const s = add({ name, x: grid[ci].x, y: grid[ci].y, type: last && chain.length > 1 ? 'event' : 'pokemon', tier: last ? Math.min(5, tier + (rng.chance(0.3) ? 1 : 0)) : tier, biome, gate: kind });
      link(prev, s); prev = s; used.add(ci); sOf.set(ci, s);
    });
    // atalho: se a casa do buraco encosta em outra rota, liga também (vira passagem com habilidade)
    if (chain.length === 1 && mesh.length > 1 && rng.chance(0.55)) { link(sOf.get(i), sOf.get(mesh[1])); }
    made++;
  }

  // ---------- 9) Estrada da Vitória, Liga e Arena Final (à direita da malha)
  const plateau = sOf.get(gi(plateauG));
  const fits = (pts, from, to) => {
    const chain = [P(from), ...pts, ...(to ? [P(to)] : [])];
    for (const p of pts) {
      if (p.X < 4 || p.X > 197 || p.Y < 5 || p.Y > 95) return false;
      for (const s of spaces) { const dx = s.x * RATIO - p.X, dy = s.y - p.Y; if (dx * dx + dy * dy < MIN_GAP * MIN_GAP * 1.1) return false; }
    }
    for (let k = 0; k < chain.length - 1; k++) for (const [a, b] of edges) {
      const shares = [a.id, b.id].some(id => id === chain[k].id || id === chain[k + 1].id);
      if (!shares && segCross(chain[k], chain[k + 1], a, b)) return false;
    }
    return true;
  };
  const up = plateau.y >= 50;
  const ligaY = up ? 14 : 86;
  const vrPts = [];
  for (let k = 1; k <= 5; k++) { const t = k / 6; vrPts.push({ X: (plateau.x + 4.5 + (91 - plateau.x - 4.5) * t + (k % 2 ? 1 : -1)) * RATIO, Y: plateau.y + (ligaY - plateau.y) * t }); }
  if (!fits(vrPts, plateau)) { build.why = "vr"; return null; }
  let prev = plateau;
  const vr = vrPts.map((p, k) => { const s = add({ name: 'Estrada da Vitória', x: p.X / RATIO, y: p.Y, type: k % 2 ? 'event' : 'pokemon', tier: 5, biome: 'cave' }); link(prev, s); prev = s; return s; });
  vr[2].type = 'city'; vr[2].biome = 'city'; vr[2].name = 'Estrada da Vitória';
  const liga = add({ name: 'Liga Pokémon (Entrada)', x: 95.5, y: ligaY + (up ? -2 : 2), type: 'city', tier: 5, biome: 'city' });
  link(vr[4], liga);
  const arena = add({ name: 'Arena Final', x: 96, y: (vr[2].y + liga.y) / 2, type: 'city', tier: 5, biome: 'city' });
  link(liga, arena); link(vr[2], arena);
  // um trecho extra de rota alta (neve/caverna) que volta do Planalto para a Estrada — mais caminhos no fim, como Kanto
  const loopPts = [];
  for (let k = 1; k <= 3; k++) loopPts.push({ X: (plateau.x + 3 + k * 1.6) * RATIO, Y: plateau.y + (up ? 1 : -1) * (6 + k * 2.2) });
  if (fits(loopPts, plateau, vr[2])) {
    let pv = plateau;
    loopPts.forEach((p, k) => { const s = add({ name: 'Picos da Liga', x: p.X / RATIO, y: p.Y, type: k === 1 ? 'event' : 'pokemon', tier: 5, biome: T.first === 'snow' || themeId === 'glacial' ? 'snow' : 'mountain' }); link(pv, s); pv = s; });
    link(pv, vr[2]);
  }

  const crossings = countCrossings(spaces);
  const gyms = {};
  GYM_IDS.forEach((g, k) => { gyms[g] = sOf.get(gymIdx[k]).id; });
  const deg = spaces.map(s => s.links.length);
  return {
    id: `gen:${seed}`, seed, name: 'Expedição', desc: MAP_THEMES.expedicao.desc, ratio: RATIO, generated: true, legendMax: L.legends,
    start: sOf.get(gi(startG)).id, elite: liga.id, champion: arena.id,
    leagueGates: [plateau.id, liga.id, arena.id], gyms, crossings,
    branches: deg.filter(d => d >= 3).length,
    spaces: spaces.map(s => ({ ...s, x: round1(s.x), y: round1(s.y) }))
  };
}

const score = m => (m.crossings === 0 ? 1000 : -m.crossings * 100) + Math.min(m.spaces.length, 150) + m.branches * 2 + m.spaces.filter(x => x.gate).length;

function relax(spaces, fixed) {
  const pinned = new Set(fixed.map(s => s.id));
  const g2 = MIN_GAP * MIN_GAP;
  for (let it = 0; it < 70; it++) {
    let moved = false;
    for (let i = 0; i < spaces.length; i++) {
      for (let j = i + 1; j < spaces.length; j++) {
        const a = spaces[i], b = spaces[j];
        const dx = (b.x - a.x) * RATIO, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= g2) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (MIN_GAP - d) / 2;
        const ux = d2 ? dx / d : 1, uy = d2 ? dy / d : 0;
        const wa = pinned.has(a.id) ? 0 : pinned.has(b.id) ? 2 : 1;
        const wb = pinned.has(b.id) ? 0 : pinned.has(a.id) ? 2 : 1;
        a.x -= (ux * push * wa) / RATIO; a.y -= uy * push * wa;
        b.x += (ux * push * wb) / RATIO; b.y += uy * push * wb;
        moved = true;
      }
    }
    for (const s of spaces) { s.x = Math.max(2.5, Math.min(97.5, s.x)); s.y = Math.max(5, Math.min(95, s.y)); }
    if (!moved) break;
  }
}

function pickFree(rng, cands, spaces) {
  const pool = cands.filter(c => c.links.length <= 2 && !c.gate && c.type !== 'city');
  for (let t = 0; t < 12 && pool.length; t++) {
    const i = rng.int(0, pool.length - 1);
    const c = pool[i];
    pool.splice(i, 1);
    // não usar casas vizinhas de outra área escondida
    if (c.links.some(id => spaces[id - 1].gate)) continue;
    return c;
  }
  return null;
}

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const round1 = v => Math.round(v * 10) / 10;

function countCrossings(spaces) {
  const S = Object.fromEntries(spaces.map(s => [s.id, s]));
  const es = [];
  for (const s of spaces) for (const n of s.links) if (s.id < n) es.push([P(s), P(S[n])]);
  let c = 0;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const [a, b] = es[i], [d, e] = es[j];
    if (a.id === d.id || a.id === e.id || b.id === d.id || b.id === e.id) continue;
    if (segCross(a, b, d, e)) c++;
  }
  return c;
}
