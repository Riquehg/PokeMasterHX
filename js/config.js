// Configuração do front. O endereço dos sprites é o Storage público do seu Supabase (mesmo do projeto original).
import { getSpecies } from '../shared/data/pokemon.js';
import { ITEMS } from '../shared/data/items.js';
import { TYPE_LABELS, TYPE_COLORS } from '../shared/rules/types.js';

export const CFG = {
  sprites: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/',
  mapImage: 'board/full_map_01.png'
};

export function setSpritesUrl(url) {
  if (url) CFG.sprites = url.endsWith('/') ? url : url + '/';
}

const pad = n => String(n).padStart(3, '0');

export function monSprite(spOrMon, shiny) {
  const id = typeof spOrMon === 'string' ? spOrMon : spOrMon.sp;
  const isShiny = typeof spOrMon === 'string' ? shiny : spOrMon.shiny;
  const s = getSpecies(id);
  if (!s) return '';
  return `${CFG.sprites}monsters/${isShiny ? 'shiny/' : ''}${pad(s.dex)}.png`;
}
export const avatarUrl = n => `${CFG.sprites}player_${String(Math.max(1, Math.min(8, Number(n) || 1))).padStart(2, '0')}.png`;
export const itemUrl = id => `${CFG.sprites}items/${ITEMS[id]?.image || id + '.png'}`;
export const leaderUrl = file => (file ? `${CFG.sprites}leaders/${file}` : '');
export const badgeUrl = id => `${CFG.sprites}badges/${id}.png`;
export const mapUrl = () => CFG.sprites + CFG.mapImage;

export const typeLabel = t => TYPE_LABELS[t] || t;
export const typeColor = t => TYPE_COLORS[t] || '#888';

export const PLAYER_COLORS = ['#f4c25b', '#4c8ff0', '#e5484d', '#3fbf7f', '#c779f0', '#40d4d9'];

// Imagem que falhou vira um "placeholder" desenhado (útil enquanto um sprite não existe no Storage)
export function placeholder(text, color = '#3b2b1d') {
  const t = String(text || '?').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect rx='12' width='64' height='64' fill='${color}'/><text x='32' y='41' font-family='Arial' font-weight='700' font-size='24' text-anchor='middle' fill='white'>${t}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', e => {
    const el = e.target;
    if (el && el.tagName === 'IMG' && !el.dataset.fallback) {
      el.dataset.fallback = '1';
      el.src = placeholder(el.alt || '?', el.dataset.color || '#3b2b1d');
    }
  }, true);
}
