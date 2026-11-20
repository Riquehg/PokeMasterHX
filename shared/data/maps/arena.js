// Arena do Battle Royale: mapa simétrico em 6 setores (como uma pizza).
// Cada jogador começa numa Base na borda, todas à mesma distância do Coliseu Central,
// com as mesmas cores de casa no caminho (Rosa na borda → Verde → Azul → Vermelha → Amarela perto do centro).
// Assim ninguém começa perto de lendário: os Pokémon fortes ficam no meio, onde a tempestade empurra todos.
// As posições só servem para desenhar (o motor usa só as ligações), arredondadas em 2 casas.

const RATIO = 1.5;
const CX = 50, CY = 50;
const cs = deg => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const at = (deg, r) => { const [c, s] = cs(deg - 90); return { x: +(CX + (c * r) / RATIO).toFixed(2), y: +(CY + s * r).toFixed(2) }; };

const SECTORS = [
  { base: 'Base Aurora', post: 'Posto Coral', biome: 'grass' },
  { base: 'Base Brasa', post: 'Posto Cinza', biome: 'volcano' },
  { base: 'Base Maré', post: 'Posto Recife', biome: 'coast' },
  { base: 'Base Geada', post: 'Posto Nevado', biome: 'snow' },
  { base: 'Base Duna', post: 'Posto Miragem', biome: 'desert' },
  { base: 'Base Musgo', post: 'Posto Bosque', biome: 'forest' }
];
const GYM_IDS = ['boulder', 'cascade', 'thunder', 'rainbow', 'volcano', 'soul'];

function build() {
  const S = new Map();
  const add = (id, name, p, type, tier, biome) => S.set(id, { id, name, x: p.x, y: p.y, type, tier, biome, gate: null, links: [] });
  const link = (a, b) => { S.get(a).links.push(b); S.get(b).links.push(a); };
  add(1, 'Coliseu Central', { x: CX, y: CY }, 'city', 5, 'city');
  for (let k = 0; k < 6; k++) {
    const A = k * 60, bio = SECTORS[k].biome;
    add(10 + k, SECTORS[k].base, at(A, 44), 'city', 1, 'city');
    // anel externo até a próxima base: Rosa · evento · Rosa
    add(20 + k * 3, null, at(A + 15, 44), 'pokemon', 1, bio);
    add(21 + k * 3, null, at(A + 30, 44), 'event', 1, bio);
    add(22 + k * 3, null, at(A + 45, 44), 'pokemon', 1, 'grass');
    // raio para dentro: Verde · evento · Posto (cidade) · evento Vermelha · Vermelha · centro
    add(40 + k, null, at(A, 36), 'pokemon', 2, bio);
    add(50 + k, null, at(A, 28.5), 'event', 2, bio);
    add(60 + k, SECTORS[k].post, at(A, 22), 'city', 3, 'city');
    add(70 + k * 2, null, at(A + 20, 22), 'pokemon', 3, bio);
    add(71 + k * 2, null, at(A + 40, 22), 'event', 3, 'grass');
    add(90 + k, null, at(A, 14.5), 'event', 4, 'cave');
    add(100 + k, 'Santuário', at(A + 30, 13), 'pokemon', 5, 'darkcave');
    add(110 + k, null, at(A, 7.5), 'pokemon', 4, 'mountain');
  }
  for (let k = 0; k < 6; k++) {
    const n = (k + 1) % 6;
    link(10 + k, 20 + k * 3); link(20 + k * 3, 21 + k * 3); link(21 + k * 3, 22 + k * 3); link(22 + k * 3, 10 + n);
    link(10 + k, 40 + k); link(40 + k, 50 + k); link(50 + k, 60 + k); link(60 + k, 90 + k); link(90 + k, 110 + k); link(110 + k, 1);
    link(60 + k, 70 + k * 2); link(70 + k * 2, 71 + k * 2); link(71 + k * 2, 60 + n);
    link(90 + k, 100 + k); link(100 + k, 90 + n);
  }
  const spaces = [...S.values()].sort((a, b) => a.id - b.id);
  for (const s of spaces) if (!s.name) s.name = `Trilha ${s.id}`;
  return {
    id: 'arena',
    name: 'Arena Royale',
    desc: 'Mapa simétrico do Battle Royale: todos começam na borda, à mesma distância do Coliseu.',
    ratio: RATIO,
    start: 10,
    bases: SECTORS.map((_, k) => 10 + k),
    elite: 1,
    champion: 1,
    leagueGates: [1],
    gyms: Object.fromEntries(GYM_IDS.map((g, k) => [g, 60 + k])),
    spaces
  };
}

export const ARENA = build();
