// Desenho do mapa feito por código: terreno (canvas) + rotas (SVG) a partir das casas e ligações do mapa ativo.
// Nada de rota "pintada" numa imagem: o que aparece é exatamente por onde dá para andar.
import { createRng } from '../../shared/rules/rng.js';

export const BIOME_COLORS = {
  city: '#c9b48a', grass: '#7cc35a', forest: '#3e8b3c', jungle: '#2c7a47', coast: '#e8d49a', sea: '#3f8fd0',
  desert: '#e3bf73', mountain: '#9c8b72', cave: '#857565', darkcave: '#4d4560', snow: '#eef3f8', volcano: '#7a3a2a'
};
const ROAD = {
  dirt:   { out: '#5b3d22', fill: '#d8b67a', mid: '#f1d9a6' },
  sea:    { out: '#1d5f96', fill: '#9fd6ff', mid: '#e6f6ff', dash: true },
  cave:   { out: '#2e2823', fill: '#8b8075', mid: '#b3a89b' },
  dark:   { out: '#1a1524', fill: '#5d5374', mid: '#9a8fc0' },
  snow:   { out: '#6f87a0', fill: '#f5f8fc', mid: '#ffffff' },
  lava:   { out: '#261009', fill: '#5a3a30', mid: '#ff8a3d' },
  sand:   { out: '#8a6a32', fill: '#f0d79a', mid: '#fff0c8' }
};
const roadStyle = (a, b) => {
  const bs = [a.biome, b.biome];
  if (bs.includes('sea')) return ROAD.sea;
  if (bs.includes('darkcave')) return ROAD.dark;
  if (bs.every(x => x === 'cave' || x === 'city') && bs.includes('cave')) return ROAD.cave;
  if (bs.includes('snow')) return ROAD.snow;
  if (bs.includes('volcano')) return ROAD.lava;
  if (bs.includes('desert') || bs.includes('coast')) return ROAD.sand;
  return ROAD.dirt;
};

/** Curvinha suave e estável para cada ligação (mesma curva sempre). */
function bend(a, b) {
  const h = ((a.id * 73856093) ^ (b.id * 19349663)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 0.35;
}

/** SVG das rotas. viewBox = 100·ratio × 100 (x% · ratio, y%). */
export function roadsSvg(map, spaces) {
  const R = map.ratio;
  const byId = Object.fromEntries(spaces.map(s => [s.id, s]));
  const seen = new Set();
  const layers = { out: '', fill: '', mid: '', gate: '' };
  for (const a of spaces) {
    for (const id of a.links) {
      const b = byId[id];
      if (!b) continue;
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const x1 = a.x * R, y1 = a.y, x2 = b.x * R, y2 = b.y;
      const k = bend(a, b);
      const cx = (x1 + x2) / 2 - (y2 - y1) * k, cy = (y1 + y2) / 2 + (x2 - x1) * k;
      const d = `M${x1.toFixed(2)} ${y1.toFixed(2)}Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
      const st = roadStyle(a, b);
      const gated = a.gate || b.gate;
      layers.out += `<path d="${d}" stroke="${st.out}" stroke-width="1.75"${gated ? ' stroke-dasharray="1.2 .7"' : ''}/>`;
      layers.fill += `<path d="${d}" stroke="${st.fill}" stroke-width="1.1"${gated ? ' stroke-dasharray="1.2 .7" opacity=".85"' : ''}/>`;
      if (!gated) layers.mid += `<path d="${d}" stroke="${st.mid}" stroke-width=".22" stroke-dasharray="${st.dash ? '.8 .8' : '.5 .9'}" opacity=".8"/>`;
    }
  }
  return `<svg class="board-roads" viewBox="0 0 ${(100 * R).toFixed(2)} 100" preserveAspectRatio="none" aria-hidden="true">
    <g fill="none" stroke-linecap="round">${layers.out}${layers.fill}${layers.mid}</g></svg>`;
}

/** Terreno: mar, ilhas seguindo as rotas, ambientes e enfeites (árvores, montanhas, ondas...). */
export function drawTerrain(canvas, map, spaces) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const X = s => (s.x / 100) * W, Y = s => (s.y / 100) * H;
  const U = H / 100; // 1% da altura
  const rng = createRng((map.seed || 7) ^ 0x9e3779b1);
  const byId = Object.fromEntries(spaces.map(s => [s.id, s]));
  const land = spaces.filter(s => s.biome !== 'sea');

  // 1) mar
  const sea = ctx.createLinearGradient(0, 0, W, H);
  sea.addColorStop(0, '#1d5d99'); sea.addColorStop(1, '#2b7bbb');
  ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = U * 0.25;
  for (let i = 0; i < 260; i++) { // ondinhas
    const x = rng.next() * W, y = rng.next() * H, r = U * (0.8 + rng.next());
    ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }

  // 2) água rasa perto das rotas de Surf
  ctx.save();
  ctx.filter = `blur(${(U * 1.6).toFixed(1)}px)`;
  ctx.fillStyle = 'rgba(120,200,255,.55)';
  for (const s of spaces.filter(s => s.biome === 'sea')) { ctx.beginPath(); ctx.arc(X(s), Y(s), U * 7, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();

  // 3) terra: praia (maior) e depois o chão do ambiente
  const blob = (r, colorOf, blur) => {
    ctx.save();
    if (blur) ctx.filter = `blur(${blur.toFixed(1)}px)`;
    ctx.lineCap = 'round';
    for (const a of land) for (const id of a.links) {
      const b = byId[id];
      if (!b || b.biome === 'sea' || a.id > b.id) continue;
      ctx.strokeStyle = colorOf(a); ctx.lineWidth = r * 1.7;
      ctx.beginPath(); ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); ctx.stroke();
    }
    for (const s of land) { ctx.fillStyle = colorOf(s); ctx.beginPath(); ctx.arc(X(s), Y(s), r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  };
  blob(U * 9.5, () => '#e7d39b', U * 0.8);                      // areia da costa
  blob(U * 8.2, s => BIOME_COLORS[s.biome] || BIOME_COLORS.grass, U * 2.2); // ambiente
  blob(U * 5.5, s => shade(BIOME_COLORS[s.biome] || BIOME_COLORS.grass, 0.06), U * 3);

  // 4) enfeites ao redor das casas (sem cobrir as rotas)
  const segs = [];
  for (const a of spaces) for (const id of a.links) { const b = byId[id]; if (b && a.id < b.id) segs.push([X(a), Y(a), X(b), Y(b)]); }
  const nearRoad = (x, y, m) => segs.some(([x1, y1, x2, y2]) => distSeg(x, y, x1, y1, x2, y2) < m) || spaces.some(s => Math.hypot(X(s) - x, Y(s) - y) < m * 1.4);
  for (const s of spaces) {
    if (s.biome === 'city') { drawTown(ctx, X(s), Y(s), U, rng); continue; }
    const n = s.biome === 'sea' ? 3 : 7;
    for (let i = 0; i < n; i++) {
      const ang = rng.next() * Math.PI * 2, dist = U * (3.2 + rng.next() * 5.5);
      const x = X(s) + Math.cos(ang) * dist * 1.25, y = Y(s) + Math.sin(ang) * dist;
      if (x < 0 || y < 0 || x > W || y > H || nearRoad(x, y, U * 2.4)) continue;
      deco(ctx, s.biome, x, y, U * (0.9 + rng.next() * 0.6), rng);
    }
  }

  // 5) moldura escura nas bordas
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function deco(ctx, biome, x, y, u, rng) {
  switch (biome) {
    case 'forest': case 'jungle': return tree(ctx, x, y, u * 1.5, biome === 'jungle' ? '#1f6b3a' : '#2f7a30', rng);
    case 'grass': return rng.chance(0.5) ? tree(ctx, x, y, u * 1.2, '#4f9e3e', rng) : flowers(ctx, x, y, u, rng);
    case 'mountain': return peak(ctx, x, y, u * 2.2, '#8a7a62', '#6c5d48', rng.chance(0.4) ? '#f4f4f4' : null);
    case 'snow': return rng.chance(0.5) ? peak(ctx, x, y, u * 2.2, '#c9d6e3', '#9fb2c6', '#ffffff') : pine(ctx, x, y, u * 1.6, '#e8f1f8');
    case 'desert': return rng.chance(0.5) ? cactus(ctx, x, y, u * 1.4) : dune(ctx, x, y, u * 2.4);
    case 'volcano': return peak(ctx, x, y, u * 2.4, '#4a2a22', '#331a14', '#ff6a2a');
    case 'cave': return rock(ctx, x, y, u * 1.4, '#6e6155');
    case 'darkcave': return crystal(ctx, x, y, u * 1.4);
    case 'coast': return rng.chance(0.6) ? palm(ctx, x, y, u * 1.6) : rock(ctx, x, y, u, '#b8a27a');
    case 'sea': return wave(ctx, x, y, u * 1.6);
    default: return null;
  }
}
function tree(ctx, x, y, r, c, rng) {
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.8, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(c, -0.15); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.75, 0, Math.PI * 2); ctx.fill();
  if (rng.chance(0.5)) { ctx.fillStyle = shade(c, -0.1); ctx.beginPath(); ctx.arc(x + r * 0.9, y + r * 0.2, r * 0.7, 0, Math.PI * 2); ctx.fill(); }
}
function pine(ctx, x, y, r, c) {
  ctx.fillStyle = '#2f5d3a'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x + r, y + r * 0.6); ctx.lineTo(x - r, y + r * 0.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x + r * 0.5, y - r * 0.4); ctx.lineTo(x - r * 0.5, y - r * 0.4); ctx.closePath(); ctx.fill();
}
function flowers(ctx, x, y, u, rng) {
  const cs = ['#ffe36b', '#ff8fb3', '#ffffff', '#b98cff'];
  for (let i = 0; i < 4; i++) { ctx.fillStyle = cs[(i + Math.floor(rng.next() * 4)) % 4]; ctx.beginPath(); ctx.arc(x + (rng.next() - 0.5) * u * 2.4, y + (rng.next() - 0.5) * u * 1.6, u * 0.32, 0, Math.PI * 2); ctx.fill(); }
}
function peak(ctx, x, y, r, c, side, cap) {
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x + r * 0.2, y + r * 0.55, r * 1.1, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.5); ctx.lineTo(x, y - r); ctx.lineTo(x + r, y + r * 0.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = side; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.5); ctx.lineTo(x + r * 0.15, y + r * 0.5); ctx.closePath(); ctx.fill();
  if (cap) { ctx.fillStyle = cap; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.38, y - r * 0.42); ctx.lineTo(x - r * 0.38, y - r * 0.42); ctx.closePath(); ctx.fill(); }
}
function rock(ctx, x, y, r, c) {
  ctx.fillStyle = shade(c, -0.25); ctx.beginPath(); ctx.ellipse(x + r * 0.15, y + r * 0.2, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
}
function crystal(ctx, x, y, r) {
  ctx.fillStyle = '#8e6cff'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.5); ctx.lineTo(x + r * 0.5, y); ctx.lineTo(x, y + r * 0.4); ctx.lineTo(x - r * 0.5, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9b6ff'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.5); ctx.lineTo(x + r * 0.5, y); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
}
function cactus(ctx, x, y, r) {
  ctx.fillStyle = '#3f8a4a'; ctx.fillRect(x - r * 0.22, y - r, r * 0.44, r * 1.6);
  ctx.fillRect(x - r * 0.75, y - r * 0.4, r * 0.3, r * 0.6); ctx.fillRect(x + r * 0.45, y - r * 0.6, r * 0.3, r * 0.6);
}
function dune(ctx, x, y, r) { ctx.strokeStyle = 'rgba(160,110,40,.45)'; ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.arc(x, y + r, r, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); }
function palm(ctx, x, y, r) {
  ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.quadraticCurveTo(x + r * 0.3, y, x, y - r * 0.6); ctx.stroke();
  ctx.fillStyle = '#2f8a3a';
  for (const a of [-2.6, -1.9, -1.2, -0.5]) { ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.6, y - r * 0.6 + Math.sin(a) * r * 0.3, r * 0.6, r * 0.18, a, 0, Math.PI * 2); ctx.fill(); }
}
function wave(ctx, x, y, r) { ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
function drawTown(ctx, x, y, U, rng) {
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y + U * 0.8, U * 5.2, U * 3.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8c7a0'; ctx.beginPath(); ctx.ellipse(x, y, U * 5, U * 3.1, 0, 0, Math.PI * 2); ctx.fill();
  const roofs = ['#d9534f', '#4c8ff0', '#e0a03a', '#5fae5f', '#a46ad8'];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.next() * 0.4, hx = x + Math.cos(a) * U * 3.6, hy = y + Math.sin(a) * U * 2.1;
    ctx.fillStyle = '#f4ecd8'; ctx.fillRect(hx - U * 0.8, hy - U * 0.4, U * 1.6, U * 1.1);
    ctx.fillStyle = roofs[i % roofs.length]; ctx.beginPath(); ctx.moveTo(hx - U * 1, hy - U * 0.35); ctx.lineTo(hx, hy - U * 1.2); ctx.lineTo(hx + U * 1, hy - U * 0.35); ctx.closePath(); ctx.fill();
  }
}
function distSeg(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / l2));
  return Math.hypot(x1 + vx * t - px, y1 + vy * t - py);
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
