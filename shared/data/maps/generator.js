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
export function generateMap(seed) {
  seed = Number(seed) >>> 0;
  if (cache.has(seed)) return cache.get(seed);
  // tenta variações da mesma semente até achar um mapa sem rotas cruzadas e com tamanho bom
  let map = null;
  for (let k = 0; k < 16; k++) {
    const m = build((seed + k * 977) >>> 0);
    if (!map || score(m) > score(map)) map = m;
    if (m.crossings === 0 && m.spaces.length >= 84) break;
  }
  map.id = `gen:${seed}`;
  map.seed = seed;
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  cache.set(seed, map);
  return map;
}

function build(seed) {
  const rng = createRng(seed ^ 0x5bd1e995);
  const spaces = [];
  const edges = []; // [A, B] em coordenadas do palco
  const add = (o) => { const s = { id: spaces.length + 1, links: [], gate: null, ...o }; spaces.push(s); return s; };
  const link = (a, b) => { if (!a.links.includes(b.id)) a.links.push(b.id); if (!b.links.includes(a.id)) b.links.push(a.id); edges.push([P(a), P(b)]); };
  /** Um caminho novo (lista de pontos, ligado em `from` e opcionalmente `to`) cabe sem cruzar nada e sem encostar em casas? */
  const fits = (pts, from, to) => {
    const chain = [P(from), ...pts, ...(to ? [P(to)] : [])];
    for (const p of pts) {
      if (p.X < 4 || p.X > 196 || p.Y < 5 || p.Y > 95) return false;
      for (const s of spaces) { const dx = s.x * RATIO - p.X, dy = s.y - p.Y; if (dx * dx + dy * dy < MIN_GAP * MIN_GAP * 1.1) return false; }
      for (const [a, b] of edges) if (a.id !== from.id && b.id !== from.id && (!to || (a.id !== to.id && b.id !== to.id)) && segDist2(p, a, b) < 9) return false;
    }
    for (let i = 0; i < chain.length - 1; i++) {
      for (const [a, b] of edges) {
        const shares = [a.id, b.id].some(id => id !== undefined && (id === chain[i].id || id === chain[i + 1].id));
        if (!shares && segCross(chain[i], chain[i + 1], a, b)) return false;
      }
      // casas existentes muito perto da linha nova
      for (const s of spaces) {
        if (s.id === chain[i].id || s.id === chain[i + 1].id) continue;
        if (segDist2(P(s), chain[i], chain[i + 1]) < 6.5) return false;
      }
    }
    return true;
  };

  // ---------- 1) cidades do caminho principal (zigue-zague da esquerda para a direita)
  const names = shuffle(rng, TOWN_NAMES);
  const towns = [];
  let lastY = 50;
  for (let i = 0; i < 8; i++) {
    const x = 5 + i * 11.2 + rng.int(-15, 15) / 10;
    let y;
    if (i === 0) y = rng.int(40, 60);
    else {
      // alterna em cima/embaixo para o mapa "serpentear"
      const up = lastY > 50;
      y = up ? rng.int(14, 38) : rng.int(62, 86);
      if (rng.chance(0.25)) y = rng.int(30, 70);
    }
    lastY = y;
    towns.push(add({ name: i === 7 ? 'Planalto Índigo' : names[i], x, y, type: 'city', tier: TOWN_TIERS[i], biome: 'city' }));
  }

  // ---------- 2) rotas entre as cidades
  const routes = []; // { a, b, list:[spaces], biome, tier }
  const biomes = shuffle(rng, ROUTE_BIOMES.filter(b => b !== 'grass'));
  const curve = (a, b, n, bend) => {
    const ax = a.x * RATIO, ay = a.y, bx = b.x * RATIO, by = b.y;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len, py = dx / len; // perpendicular
    const cx = mx + px * bend, cy = my + py * bend;
    const pts = [];
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1), u = 1 - t;
      pts.push({ X: u * u * ax + 2 * u * t * cx + t * t * bx, Y: u * u * ay + 2 * u * t * cy + t * t * by });
    }
    return pts;
  };
  const makeRoute = (a, b, n, bend, biome, tier, routeNo, gate = null, pts = null) => {
    pts ||= curve(a, b, n, bend);
    const list = [];
    let prev = a, evRun = 0;
    for (let k = 1; k <= n; k++) {
      const { X, Y } = pts[k - 1];
      let type = rng.chance(0.56) ? 'pokemon' : 'event';
      if (type === 'event') evRun++; else evRun = 0;
      if (evRun >= 3) { type = 'pokemon'; evRun = 0; }
      const s = add({ name: `Rota ${routeNo}`, x: X / RATIO, y: Y, type, tier, biome, gate: k === 1 ? gate : null });
      link(prev, s);
      list.push(s);
      prev = s;
    }
    link(prev, b);
    return list;
  };
  let routeNo = 1;
  for (let i = 0; i < 7; i++) {
    const a = towns[i], b = towns[i + 1];
    const tier = i === 0 ? 1 : TOWN_TIERS[i + 1] === 5 ? 4 : TOWN_TIERS[i + 1];
    const biome = i === 0 ? 'grass' : biomes[(i - 1) % biomes.length];
    const n = rng.int(5, 7);
    let bend = (rng.chance(0.5) ? 1 : -1) * rng.int(5, 14);
    for (const tryB of [bend, -bend, bend / 2, -bend / 2, 0]) { if (fits(curve(a, b, n, tryB), a, b)) { bend = tryB; break; } }
    const main = makeRoute(a, b, n, bend, biome, tier, routeNo);
    routes.push({ a, b, list: main, biome, tier });
    // caminho alternativo (às vezes exige habilidade e tem tier maior)
    if (i > 0 && rng.chance(0.6)) {
      const gated = rng.chance(0.4);
      const kind = gated ? rng.pick(['cut', 'smash', 'surf', 'climb']) : null;
      const n2 = n + rng.int(0, 2);
      const sign = bend === 0 ? (rng.chance(0.5) ? 1 : -1) : -Math.sign(bend);
      let pts = null;
      for (const mag of [16, 20, 24, 13, 28]) { const c = curve(a, b, n2, sign * mag); if (fits(c, a, b)) { pts = c; break; } }
      if (pts) {
        const alt = makeRoute(a, b, n2, 0, gated ? SECRET[kind].biome : rng.pick(ROUTE_BIOMES), Math.min(5, tier + (gated ? 1 : 0)), routeNo, kind, pts);
        if (gated) alt[0].name = rng.pick(SECRET[kind].names);
        routes.push({ a, b, list: alt, biome: alt[0].biome, tier, alt: true });
      }
    }
    routeNo++;
  }

  // ---------- 3) Estrada da Vitória, Liga e Arena Final
  const plateau = towns[7];
  const liga = add({ name: 'Liga Pokémon (Entrada)', x: 95, y: plateau.y < 50 ? Math.min(88, plateau.y + 38) : Math.max(12, plateau.y - 38), type: 'city', tier: 5, biome: 'city' });
  let vrBend = rng.chance(0.5) ? 8 : -8;
  for (const b of [vrBend, -vrBend, 4, -4, 0, 12, -12]) { if (fits(curve(plateau, liga, 5, b), plateau, liga)) { vrBend = b; break; } }
  const vr = makeRoute(plateau, liga, 5, vrBend, 'cave', 5, routeNo);
  vr[2].name = 'Estrada da Vitória'; vr[2].type = 'city'; vr[2].biome = 'city';
  routes.push({ a: plateau, b: liga, list: vr, biome: 'cave', tier: 5 });
  const arena = add({ name: 'Arena Final', x: 89.5, y: (liga.y + vr[2].y) / 2 + (liga.y > 50 ? 6 : -6), type: 'city', tier: 5, biome: 'city' });
  link(liga, arena);
  link(vr[2], arena);

  // ---------- 4) áreas escondidas (becos sem saída com habilidade e Pokémon melhores)
  const candidates = routes.filter(r => !r.alt).flatMap(r => r.list.slice(1, -1));
  const secrets = shuffle(rng, SECRET_KINDS).slice(0, 8);
  let made = 0;
  for (const kind of secrets) {
    const base = pickFree(rng, candidates, spaces);
    if (!base) break;
    // direção: perpendicular à rota, para fora
    const nb = spaces[base.links[0] - 1];
    const dx = (nb.x - base.x) * RATIO, dy = nb.y - base.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    let px = -dy / len, py = dx / len;
    if ((base.y + py * 10 < 6) || (base.y + py * 10 > 94)) { px = -px; py = -py; }
    const n = rng.int(2, 3);
    const info = SECRET[kind];
    const tier = Math.min(5, base.tier + 1);
    const name = rng.pick(info.names);
    const jit = [rng.int(-20, 20) / 10, rng.int(-20, 20) / 10, rng.int(-20, 20) / 10];
    const ptsFor = sg => Array.from({ length: n }, (_, k) => ({ X: base.x * RATIO + sg * px * 7.5 * (k + 1) + jit[k], Y: base.y + sg * py * 7.5 * (k + 1) - jit[k] }));
    let pts = null;
    for (const sg of [1, -1]) { const c = ptsFor(sg); if (fits(c, base)) { pts = c; break; } }
    if (!pts) continue;
    let prev = base;
    for (let k = 1; k <= n; k++) {
      const s = add({ name, x: pts[k - 1].X / RATIO, y: pts[k - 1].Y,
        type: k === n ? 'event' : 'pokemon', tier: k === n ? Math.min(5, tier + (rng.chance(0.3) ? 1 : 0)) : tier, biome: info.biome, gate: kind });
      link(prev, s);
      prev = s;
    }
    made++;
  }

  // ---------- 5) atalhos entre rotas diferentes (uma casa no meio, com habilidade)
  const mains = routes.filter(r => !r.alt);
  let shortcuts = 0;
  for (let i = 0; i < mains.length && shortcuts < 3; i++) {
    for (let j = i + 2; j < mains.length && shortcuts < 3; j++) {
      let best = null;
      for (const p of mains[i].list) for (const q of mains[j].list) {
        const dx = (p.x - q.x) * RATIO, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 > 110 && d2 < 520 && (!best || d2 < best.d2)) best = { p, q, d2 };
      }
      const mid = best && [{ X: (best.p.x + best.q.x) / 2 * RATIO, Y: (best.p.y + best.q.y) / 2 }];
      if (best && rng.chance(0.75) && fits(mid, best.p, best.q)) {
        const kind = rng.pick(['surf', 'climb', 'flash', 'smash']);
        const s = add({ name: rng.pick(SECRET[kind].names), x: (best.p.x + best.q.x) / 2, y: (best.p.y + best.q.y) / 2, type: 'event',
          tier: Math.max(best.p.tier, best.q.tier), biome: SECRET[kind].biome, gate: kind });
        link(best.p, s); link(s, best.q);
        shortcuts++;
      }
    }
  }

  // ---------- 6) espaça casas que ficaram grudadas e mantém tudo dentro do mapa
  relax(spaces, towns.concat([liga, arena]));
  const crossings = countCrossings(spaces);

  const gyms = {};
  GYM_IDS.forEach((g, i) => { gyms[g] = towns[i + 1].id; });
  return {
    id: `gen:${seed}`,
    seed,
    name: 'Expedição',
    desc: 'Um mapa novo a cada partida, com áreas escondidas para explorar.',
    ratio: RATIO,
    generated: true,
    start: towns[0].id,
    elite: liga.id,
    champion: arena.id,
    leagueGates: [plateau.id, liga.id, arena.id],
    gyms,
    crossings,
    spaces: spaces.map(s => ({ ...s, x: round1(s.x), y: round1(s.y) }))
  };
}

const score = m => (m.crossings === 0 ? 1000 : -m.crossings * 100) + Math.min(m.spaces.length, 110) + m.spaces.filter(x => x.gate).length;

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
