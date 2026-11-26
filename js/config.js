// Configuração do front. O endereço dos sprites é o Storage público do seu Supabase (mesmo do projeto original).
import { regionBadge, REGION_BADGES } from '../shared/data/regions.js';
import { getSpecies } from '../shared/data/pokemon.js';
import { ITEMS } from '../shared/data/items.js';
import { MEGAS } from '../shared/data/megas.js';
import '../shared/data/gmax.js'; // registra as formas Gigantamax (gmax_<espécie>)
import { variantFor } from '../shared/rules/monsters.js';
import { genderFor } from '../shared/data/gender.js';
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
// 🆕 v54: sprites do Pokémon HOME em pokemon/<arquivo>.png e pokemon/shiny/<arquivo>.png (arquivo = sp.file, ex.: vulpix-alola,
// charizard-megax). Variação visual (m.v) → <arquivo>-<v>.png; fêmea com sprite própria → <arquivo>-f.png.
// Os 2 primeiros endereços são sempre do HOME (o específico e o normal); depois vêm os formatos antigos, como reserva.
const HOME_DIR = shiny => (shiny ? 'pokemon/shiny/' : 'pokemon/');
/** Lista de endereços possíveis (em ordem) para a espécie. `look` = { v, sex } do Pokémon (variação visual / fêmea). */
export function spriteCandidates(spId, shiny, look = null) {
  const s = getSpecies(spId);
  if (!s) return [];
  // 💎 forma Mega: pokemon/<arquivo>.png → megas/<arquivo>.png (shiny: megas/shiny/) → sprite da forma base
  if (s.mega) {
    const file = MEGAS[s.mega]?.file;
    return [`${HOME_DIR(shiny)}${file}.png`, `${HOME_DIR(shiny)}${file}.png`, ...(shiny ? [`megas/shiny/${file}.png`] : []), `megas/${file}.png`, ...spriteCandidates(s.megaBase, shiny)];
  }
  const v = look?.v && (s.variants || []).includes(look.v) ? `${s.file}-${look.v}` : look?.sex === 'f' && s.fem ? `${s.file}-f` : s.file;
  const out = [`${HOME_DIR(shiny)}${v}.png`, `${HOME_DIR(shiny)}${s.file}.png`];
  if (s.form || s.gmaxOf) return [...out, ...spriteCandidates(s.form || s.gmaxOf, shiny)]; // forma/Gigantamax sem sprite → a da espécie base
  const dirs = shiny ? SHINY_DIRS : NORMAL_DIRS;
  for (const d of dirs) out.push(`${d}${pad(s.dex)}.png`);
  for (const d of dirs) for (const n of nameVariants(s)) out.push(`${d}${n}.png`);
  return out;
}
const PREF_KEY = 'pmhx_sprite_fmt3';
const pref = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } })();
/** Formato que já funcionou (índice na lista de candidatos), para ir direto nele nas próximas. */
// Padrão: normais pelo número (monsters/063.png) e shinies pelo nome (shinys/abra.png = índice 10 da lista)
const DEFAULT_FMT = { n: 0, s: 0 };
function preferred(shiny) { const k = shiny ? 's' : 'n'; return pref[k] !== undefined ? Number(pref[k]) || 0 : DEFAULT_FMT[k]; }
function rememberFormat(shiny, idx) {
  pref[shiny ? 's' : 'n'] = idx;
  try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch { /* sem storage */ }
}

export function monSprite(spOrMon, shiny) {
  const id = typeof spOrMon === 'string' ? spOrMon : spOrMon.sp;
  const isShiny = !!(typeof spOrMon === 'string' ? shiny : spOrMon.shiny);
  const look = typeof spOrMon === 'string' ? null : { v: spOrMon.v !== undefined ? spOrMon.v : spOrMon.uid ? variantFor(id, spOrMon.uid) : undefined, sex: (spOrMon.gender || (spOrMon.uid ? genderFor(id, spOrMon.uid, getSpecies(id)) : null)) === 'F' ? 'f' : undefined };
  const list = spriteCandidates(id, isShiny, look);
  if (!list.length) return '';
  // v57: sempre começa pelo arquivo do HOME (pokemon/<arquivo>.png). O "formato lembrado" antigo podia pular direto
  // para a sprite da espécie base — por isso Gigantamax/formas apareciam com a cara do Pokémon normal.
  const i = 0;
  const lk = look && (look.v || look.sex === 'f') ? `:${look.v || ''}${look.sex === 'f' ? '.f' : ''}` : '';
  return `${CFG.sprites}${list[i]}#${isShiny ? 's' : 'n'}:${id}:${i}${lk}`;
}

/** "Plano B" dos sprites: quando um <img> de Pokémon falha, tenta o próximo formato. Devolve true se tentou outro. */
function trySpriteFallback(img) {
  const m = /#([sn]):([a-z0-9_]+):(\d+)(:[a-z0-9]*(?:\.f)?)?$/.exec(img.src);
  if (!m) return false;
  const shiny = m[1] === 's', id = m[2], start = Number(m[3]), lk = m[4] || '';
  const look = lk ? { v: lk.slice(1).replace('.f', '') || undefined, sex: lk.endsWith('.f') ? 'f' : undefined } : null;
  const list = spriteCandidates(id, shiny, look);
  const tries = Number(img.dataset.spTries || 0) + 1;
  if (tries >= list.length) { // nenhum formato achado
    if (shiny && !img.dataset.spNormal) { img.dataset.spNormal = '1'; img.dataset.spTries = 0; delete img.dataset.spTry; img.src = monSprite(id, false); return true; } // mostra o normal
    return false;
  }
  const next = (Number(img.dataset.spTry ?? start) + 1) % list.length;
  img.dataset.spTry = next;
  img.dataset.spTries = tries;
  img.src = `${CFG.sprites}${list[next]}#${m[1]}:${id}:${next}${lk}`;
  return true;
}

/** Lembra o formato de arquivo que funcionou (para ir direto nele nas próximas imagens). */
export function installSpriteFallback() {
  document.addEventListener('load', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.spTry === undefined) return;
    const m = /#([sn]):([a-z0-9_]+):(\d+)/.exec(img.src);
    // v57: não lembra mais formato (todas as sprites estão em pokemon/); fica só o "plano B" quando um arquivo falta // nomes comuns definem o formato padrão // este formato funcionou: usa direto daqui pra frente
  }, true);
}
/** Avatar do treinador. Com skin (Loja de Diamantes) usa sprites/skins/<skin>.png. */
export const avatarUrl = (n, skin) => (skin && /^[a-z0-9-]+$/.test(skin) ? `${CFG.sprites}skins/${skin}.png` : `${CFG.sprites}player_${String(Math.max(1, Math.min(8, Number(n) || 1))).padStart(2, '0')}.png`);
/** Avatar de um jogador/perfil (respeita a skin equipada). */
export const trainerUrl = p => avatarUrl(p?.avatar, p?.cosmetic?.skin);
const emojiImg = e => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="50" font-size="46" text-anchor="middle">${e}</text></svg>`)}`;
// v59: o arquivo do item pode estar como fire_stone.png, fire-stone.png ou firestone.png; o que funcionar fica lembrado
const ITEM_ALT = (() => { try { return JSON.parse(localStorage.getItem('pmhx_item_alt') || '{}'); } catch { return {}; } })();
const itemFile = id => ITEM_ALT[id] || ITEMS[id]?.image || id + '.png';
const ITEM_VARIANTS = f => { const b = f.replace(/\.png$/i, ''); return [...new Set([b, b.replace(/_/g, '-'), b.replace(/[_-]/g, ''), b.replace(/_/g, ' ')])].map(x => x + '.png'); };
/** URL da sprite de um item (pasta items/ do bucket). Itens sem `image` tentam items/<id>.png. */
export const itemSpriteUrl = id => `${CFG.sprites}items/${itemFile(id)}`;
/** Tenta o próximo nome de arquivo do item (fire_stone → fire-stone → firestone). true se trocou. */
function tryItemAlt(el) {
  const m = /\/items\/([^/?#]+)$/.exec(el.src || '');
  if (!m || m[1].includes('%2F')) return false;
  const file = decodeURIComponent(m[1]);
  const base = el.dataset.itemBase || file;
  const list = ITEM_VARIANTS(base);
  const i = Number(el.dataset.itemTry || 0) + 1;
  if (i >= list.length) return false;
  el.dataset.itemBase = base; el.dataset.itemTry = String(i);
  el.dataset.itemOk = Object.keys(ITEMS).find(id => (ITEMS[id].image || id + '.png') === base) || '';
  el.src = el.src.slice(0, el.src.length - m[1].length) + encodeURIComponent(list[i]);
  return true;
}
const ITEM_MISS = new Set(); // sprites que não existem: mostra o emoji direto nas próximas vezes
/** Ícone de item: a sprite se existir na pasta, senão o emoji (fb). */
export const itemIcon = (id, fb = '', cls = 'itm-ic') => {
  if (!id) return `<span class="${cls} itm-emo">${fb}</span>`;
  const url = itemSpriteUrl(id);
  return ITEM_MISS.has(url) ? `<span class="${cls} itm-emo">${fb}</span>` : `<img class="${cls}" src="${url}" alt="" data-fb="${fb}">`;
};
/** 🖼️ v60: sprite qualquer da pasta (ex.: "furniture/sofa.png", "ui/bag.png"); sem o arquivo, mostra o emoji. */
export const spriteIcon = (path, fb = '', cls = 'itm-ic') => {
  const url = `${CFG.sprites}${path}`;
  return ITEM_MISS.has(url) ? `<span class="${cls} itm-emo">${fb}</span>` : `<img class="${cls}" src="${url}" alt="" data-fb="${fb}">`;
};
// 🥊 v61: ícone do golpe (moves/<nome>.png, ex.: thunderbolt.png); sem arquivo → ícone do tipo (types/<tipo>.png)
export const moveSlug = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const typeIconUrl = t => `${CFG.sprites}types/${t}.png`;
export const moveIcon = m => {
  if (!m) return '';
  const u = `${CFG.sprites}moves/${moveSlug(m.name)}.png`, t = typeIconUrl(m.type);
  if (ITEM_MISS.has(u)) return ITEM_MISS.has(t) ? '' : `<img class="mv-ic" src="${t}" data-fb="" alt="">`;
  return `<img class="mv-ic" src="${u}" data-alt="${t}" data-fb="" alt="">`;
};
export const typeIcon = t => (ITEM_MISS.has(typeIconUrl(t)) ? '' : `<img class="ty-ic" src="${typeIconUrl(t)}" data-fb="" alt="">`);
export const furnIcon = (id, fb) => spriteIcon(`furniture/${id}.png`, fb, 'furn-ic');
export const uiIcon = (id, fb) => spriteIcon(`ui/${id}.png`, fb, 'ui-ic');
export const itemUrl = id => (ITEMS[id]?.emoji && !ITEMS[id]?.image ? emojiImg(ITEMS[id].emoji) : `${CFG.sprites}items/${itemFile(id)}`);
// Sprite de treinador/líder: aceita "pasta/arquivo.png" (ex.: "leaders/Lt. Surge.png") ou só o arquivo (vai para leaders/)
export const leaderUrl = file => {
  if (!file) return '';
  const path = file.includes('/') ? file : `leaders/${file}`;
  return CFG.sprites + path.split('/').map(encodeURIComponent).join('/');
};
// 🏅 v60: cada mapa tem as suas insígnias (sem o arquivo, volta para a de Kanto)
export const badgeUrl = id => `${CFG.sprites}badges/${regionBadge(id)?.file || id}.png`;
const BADGE_KANTO = {};
for (const k of Object.keys(REGION_BADGES)) REGION_BADGES[k].forEach((b, i) => { BADGE_KANTO[b.file] = ['boulder', 'cascade', 'thunder', 'rainbow', 'volcano', 'soul'][i]; });
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
  document.addEventListener('load', e => { // lembra o nome de arquivo alternativo que funcionou
    const el = e.target;
    if (el instanceof HTMLImageElement && el.classList.contains('furn-ic')) { el.style.setProperty('--nw', el.naturalWidth); el.parentElement?.classList.add('has-img'); } // v61: móvel no tamanho real da sprite
    if (!(el instanceof HTMLImageElement) || !el.dataset.itemOk || !el.dataset.itemTry) return;
    const m = /\/items\/([^/?#]+)$/.exec(el.src || '');
    if (m) { ITEM_ALT[el.dataset.itemOk] = decodeURIComponent(m[1]); try { localStorage.setItem('pmhx_item_alt', JSON.stringify(ITEM_ALT)); } catch { /* ok */ } }
  }, true);
  window.addEventListener('error', e => {
    const el = e.target;
    if (el && el.tagName === 'IMG' && tryItemAlt(el)) return; // v59: outro nome de arquivo do item
    if (el && el.tagName === 'IMG') { const bm = /\/badges\/([^/?#]+)\.png$/.exec(el.src || ''); if (bm && BADGE_KANTO[bm[1]]) { el.src = el.src.replace(/[^/]+\.png$/, BADGE_KANTO[bm[1]] + '.png'); return; } }
    if (el && el.tagName === 'IMG' && el.dataset.alt) { const a = el.dataset.alt; delete el.dataset.alt; ITEM_MISS.add(el.src); if (!ITEM_MISS.has(a)) { el.src = a; return; } } // v61: 2ª opção (ex.: golpe → tipo)
    if (el && el.tagName === 'IMG' && el.dataset.fb !== undefined) { // ícone de item sem sprite → emoji
      ITEM_MISS.add(el.src);
      const s = document.createElement('span'); s.className = `${el.className} itm-emo`; s.textContent = el.dataset.fb; el.replaceWith(s); return;
    }
    if (el && el.tagName === 'IMG' && !el.dataset.emojiFb) { // item com emoji (ex.: pedras novas da v54) sem arquivo na pasta → emoji
      const m = /\/items\/([^/?#]+)$/.exec(el.src || '');
      const it = m && Object.values(ITEMS).find(x => x.emoji && x.image === decodeURIComponent(m[1]));
      if (it) { el.dataset.emojiFb = '1'; el.src = emojiImg(it.emoji); return; }
    }
    if (el && el.tagName === 'IMG' && trySpriteFallback(el)) return; // sprite de Pokémon: tenta outro formato antes
    if (el && el.tagName === 'IMG' && !el.dataset.fallback) {
      el.dataset.fallback = '1';
      el.src = placeholder(el.alt || '?', el.dataset.color || '#3b2b1d');
    }
  }, true);
}
