// 🖌️ v47 — Ateliê da Fazenda: enfeites desenhados pelo jogador em pixel art 16×16.
// Cada desenho é uma string de 256 caracteres: '.' = transparente, '0'..'f' = cor da paleta.
// Fica em stats.farm.art = [{ n: nome, p: pixels }] (até ART_MAX) e entra na decoração como k = 'art0'..'art7'.
export const ART_SIZE = 16;
export const ART_MAX = 8;
export const ART_PALETTE = [
  '#1a1a1a', '#ffffff', '#8a8a8a', '#cfcfcf', // preto, branco, cinzas
  '#e63946', '#ff8c42', '#ffd23f', '#fff3a3', // vermelho, laranja, amarelo, creme
  '#5cc96b', '#1f7a3a', '#3fb7ff', '#2457c5', // verdes, azuis
  '#9b5cff', '#ff70a6', '#8d5524', '#e8b48a'  // roxo, rosa, marrom, pele
];
const PX_RE = /^[.0-9a-f]{256}$/;

export const isArtKey = k => /^art[0-7]$/.test(String(k || ''));
export const artIndex = k => Number(String(k).slice(3));

/** Limpa um desenho vindo do cliente. Devolve null se inválido ou vazio. */
export function cleanArt(input) {
  const p = String(input?.p || '').toLowerCase();
  if (!PX_RE.test(p) || !/[0-9a-f]/.test(p)) return null;
  const n = String(input?.n || '').replace(/[<>"'`&\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'Meu enfeite';
  return { n, p };
}

/** SVG (data URI) nítido do desenho — usado na cena, na paleta e nas visitas. */
export function artSvg(p) {
  if (!p || !PX_RE.test(p)) return '';
  let rects = '';
  for (let y = 0; y < ART_SIZE; y++) {
    let x = 0;
    while (x < ART_SIZE) {
      const c = p[y * ART_SIZE + x];
      if (c === '.') { x++; continue; }
      let w = 1;
      while (x + w < ART_SIZE && p[y * ART_SIZE + x + w] === c) w++; // junta pixels iguais em faixas
      rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${ART_PALETTE[parseInt(c, 16)]}"/>`;
      x += w;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
