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

// ---------------------------------------------------------------- sprites dos Pokémon
// O jogo aceita os arquivos pelo número da Pokédex (monsters/063.png) OU pelo nome (shinys/abra.png).
// Se o primeiro endereço não existir, tenta os próximos da lista e lembra qual formato funcionou.
const nameVariants = s => {
  const id = s.id;                                   // ex.: mr_mime, ho_oh, nidoran_f
  const low = s.name.toLowerCase();                  // ex.: mr. mime, ho-oh
  // tamanho fixo (sem tirar repetidos) para o índice do formato valer para todas as espécies
  return [id, id.replace(/_/g, '-'), low.replace(/[.':]/g, '').replace(/\s+/g, '-'), low.replace(/[^a-z0-9]/g, ''), id.replace(/_/g, ''), s.name];
};
const SHINY_DIRS = ['monsters/shiny/', 'shinys/', 'shiny/', 'monsters/shinys/'];
const NORMAL_DIRS = ['monsters/', 'normal/', 'pokemon/'];
/** Lista de endereços possíveis (em ordem) para a espécie. */
export function spriteCandidates(spId, shiny) {
  const s = getSpecies(spId);
  if (!s) return [];
  const dirs = shiny ? SHINY_DIRS : NORMAL_DIRS;
  const out = [];
  for (const d of dirs) out.push(`${d}${pad(s.dex)}.png`);
  for (const d of dirs) for (const n of nameVariants(s)) out.push(`${d}${n}.png`);
  return out;
}
const PREF_KEY = 'pmhx_sprite_fmt';
const pref = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } })();
/** Formato que já funcionou (índice na lista de candidatos), para ir direto nele nas próximas. */
// Padrão: normais pelo número (monsters/063.png) e shinies pelo nome (shinys/abra.png = índice 10 da lista)
const DEFAULT_FMT = { n: 0, s: 10 };
function preferred(shiny) { const k = shiny ? 's' : 'n'; return pref[k] !== undefined ? Number(pref[k]) || 0 : DEFAULT_FMT[k]; }
function rememberFormat(shiny, idx) {
  pref[shiny ? 's' : 'n'] = idx;
  try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch { /* sem storage */ }
}

export function monSprite(spOrMon, shiny) {
  const id = typeof spOrMon === 'string' ? spOrMon : spOrMon.sp;
  const isShiny = !!(typeof spOrMon === 'string' ? shiny : spOrMon.shiny);
  const list = spriteCandidates(id, isShiny);
  if (!list.length) return '';
  const i = Math.min(preferred(isShiny), list.length - 1);
  return `${CFG.sprites}${list[i]}#${isShiny ? 's' : 'n'}:${id}:${i}`;
}

/** "Plano B" dos sprites: quando um <img> de Pokémon falha, tenta o próximo formato. Devolve true se tentou outro. */
function trySpriteFallback(img) {
  const m = /#([sn]):([a-z0-9_]+):(\d+)$/.exec(img.src);
  if (!m) return false;
  const shiny = m[1] === 's', id = m[2], start = Number(m[3]);
  const list = spriteCandidates(id, shiny);
  const tries = Number(img.dataset.spTries || 0) + 1;
  if (tries >= list.length) { // nenhum formato achado
    if (shiny && !img.dataset.spNormal) { img.dataset.spNormal = '1'; img.dataset.spTries = 0; delete img.dataset.spTry; img.src = monSprite(id, false); return true; } // mostra o normal
    return false;
  }
  const next = (Number(img.dataset.spTry ?? start) + 1) % list.length;
  img.dataset.spTry = next;
  img.dataset.spTries = tries;
  img.src = `${CFG.sprites}${list[next]}#${m[1]}:${id}:${next}`;
  return true;
}

/** Lembra o formato de arquivo que funcionou (para ir direto nele nas próximas imagens). */
export function installSpriteFallback() {
  document.addEventListener('load', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.spTry === undefined) return;
    const m = /#([sn]):([a-z0-9_]+):(\d+)$/.exec(img.src);
    if (m && !m[2].includes('_')) rememberFormat(m[1] === 's', Number(m[3])); // nomes comuns definem o formato padrão // este formato funcionou: usa direto daqui pra frente
  }, true);
}
/** Avatar do treinador. Com skin (Loja de Diamantes) usa sprites/skins/<skin>.png. */
export const avatarUrl = (n, skin) => (skin && /^[a-z0-9-]+$/.test(skin) ? `${CFG.sprites}skins/${skin}.png` : `${CFG.sprites}player_${String(Math.max(1, Math.min(8, Number(n) || 1))).padStart(2, '0')}.png`);
/** Avatar de um jogador/perfil (respeita a skin equipada). */
export const trainerUrl = p => avatarUrl(p?.avatar, p?.cosmetic?.skin);
export const itemUrl = id => `${CFG.sprites}items/${ITEMS[id]?.image || id + '.png'}`;
// Sprite de treinador/líder: aceita "pasta/arquivo.png" (ex.: "leaders/Lt. Surge.png") ou só o arquivo (vai para leaders/)
export const leaderUrl = file => {
  if (!file) return '';
  const path = file.includes('/') ? file : `leaders/${file}`;
  return CFG.sprites + path.split('/').map(encodeURIComponent).join('/');
};
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
    if (el && el.tagName === 'IMG' && trySpriteFallback(el)) return; // sprite de Pokémon: tenta outro formato antes
    if (el && el.tagName === 'IMG' && !el.dataset.fallback) {
      el.dataset.fallback = '1';
      el.src = placeholder(el.alt || '?', el.dataset.color || '#3b2b1d');
    }
  }, true);
}
