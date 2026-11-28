// 🌾 Fazenda Pokémon: cena com biomas, Pokémon andando soltos, coleta, carinho, Frutinhas, decoração e visitas.
import { MUTATION_LABEL } from '../../shared/data/daycare.js';
import { getSpecies } from '../../shared/data/pokemon.js';
import { FARM_BIOMES, BIOME_IDS, RESOURCES, FARM_DECOR, DECOR_MAX, FARM_MAX_LEVEL, bestBiome, decorItemId } from '../../shared/data/farm.js';
import { genderHtml } from '../../shared/data/gender.js';
import { api } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { monSprite, avatarUrl, leaderUrl, itemIcon, furnIcon } from '../config.js';
import { canBreed, EGGS_PER_DAY, INCUBATOR_MAX, NATURE_COST, EGG_EVERY_H } from '../../shared/data/daycare.js';
import { statCard, miniMon } from './common.js';
import { RECIPES, FARM_ITEMS as FARM_ITEMS0, ARTISAN_LEVELS } from '../../shared/data/workshop.js';
import { CROPS, GOODS, BUILDINGS, BUILD_MAX, queueFor, POFFIN_ITEMS, plotsFor, CROP_SHEET } from '../../shared/data/garden.js';
/** 🌱 sprite da planta: stage 0 semente, 1 muda, 2 pronta (quadro de 144×96; mostra a faixa central 64×88). */
const cropSprite = (k, stage, cls = '') => {
  const s = CROP_SHEET[k];
  if (!s) return '';
  return `<i class="crop-spr ${cls}" style="background-image:url(/img/farm/crops${s[0]}.png);background-position:-${stage * 144 + 40}px -${s[1] * 96}px" aria-hidden="true"></i>`;
};
const FARM_ITEMS = { ...FARM_ITEMS0, ...POFFIN_ITEMS };
import { MEGAS, MEGA_KEYS, fragItemId } from '../../shared/data/megas.js';
import { TYPES, TYPE_LABELS } from '../../shared/rules/types.js';
import { defIvOf, ivPercent } from '../../shared/rules/monsters.js';
import { natureLabel } from '../../shared/data/natures.js';
import { ART_PALETTE, ART_SIZE, ART_MAX, artSvg, isArtKey, artIndex } from '../../shared/data/farmart.js';
import { EXPANSIONS } from '../../shared/data/expansions.js';
import { FURNITURE, WALLS, FLOORS, ROOM_W, ROOM_H, HOME_MAX, PART_MAX, furnMax, furnW, MEALS, MEAL_ITEMS, TALK_BOND, PLAY_XP } from '../../shared/data/home.js';
import { ITEMS as ALL_ITEMS } from '../../shared/data/items.js';

// ✨ v47 — decoração viva: animação por enfeite + o que acontece ao tocar
const DECOR_FX = {
  tree: 'sway', pine: 'sway', flower: 'sway', sakura: 'sway petals', palm: 'sway', tulip: 'sway', sunflower: 'sway', mushroom: 'bob',
  windmill: 'spin', ferris: 'spin', fountain: 'water', campfire: 'fire', lantern: 'glow', house: 'smoke', barn: 'smoke', well: 'bob',
  tent: 'breeze', bench: '', mailbox: 'hop', pokeball: 'shake', trophy: 'shine', rainbow: 'shine', moon: 'shine', star: 'shine twinkle',
  castle: 'shine', statue: '', goldstatue: 'shine', crown: 'shine twinkle', rock: '', fence: ''
};
const TAP_FX = {
  tree: ['🍃', '🍎'], pine: ['🍃', '🌰'], flower: ['🌼', '🐝'], sakura: ['🌸', '🌸'], palm: ['🥥', '🍃'], tulip: ['🌷', '🦋'], sunflower: ['🌻', '🐝'],
  mushroom: ['✨', '🍄'], windmill: ['💨', '🌾'], ferris: ['🎵', '✨'], fountain: ['💧', '🪙'], campfire: ['🔥', '✨'], lantern: ['✨', '🏮'],
  house: ['💨', '🏡'], barn: ['🐮', '💨'], well: ['💧', '🪣'], tent: ['💤', '⛺'], mailbox: ['✉️', '💌'], pokeball: ['✨', '⭐'], trophy: ['🏆', '✨'],
  rainbow: ['🌈', '✨'], moon: ['🌙', '✨'], star: ['⭐', '🌟'], castle: ['🏰', '🎺'], crown: ['👑', '✨'], goldstatue: ['🏅', '✨'], statue: ['🗿', '💤'],
  bench: ['☕', '📖'], rock: ['🪨', '🐛'], fence: ['🪵', '🐦']
};

const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
// zonas da cena (3 × 2), em %
const ZONES = { pasto: [0, 0], floresta: [1, 0], lago: [2, 0], caverna: [0, 1], vulcao: [1, 1], campo: [2, 1] };
const ZONES_M = { pasto: [0, 0], floresta: [1, 0], lago: [0, 1], caverna: [1, 1], vulcao: [0, 2], campo: [1, 2] }; // celular: 2 × 3
const narrow = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 600px)').matches;
const zoneBox = b => {
  if (narrow()) { const [c, r] = ZONES_M[b] || [0, 0]; return { x: c * 50, y: r * 33.333, w: 50, h: 33.333 }; }
  const [c, r] = ZONES[b] || [0, 0]; return { x: c * 33.333, y: r * 50, w: 33.333, h: 50 };
};
// decoração/casinha são salvas na grade do PC (3 × 2); no celular (2 × 3) cada ponto vai para o mesmo lugar dentro do seu bioma
const byCell = (map, c, r) => Object.keys(map).find(k => map[k][0] === c && map[k][1] === r);
const toView = (x, y) => {
  if (!narrow()) return { x, y };
  const c = Math.min(2, Math.floor(x / 33.334)), r = Math.min(1, Math.floor(y / 50));
  const b = byCell(ZONES, c, r), lx = (x - c * 33.333) / 33.333, ly = (y - r * 50) / 50;
  const z = zoneBox(b);
  return { x: z.x + lx * z.w, y: z.y + ly * z.h };
};
const toStore = (x, y) => {
  if (!narrow()) return { x, y };
  const c = Math.min(1, Math.floor(x / 50)), r = Math.min(2, Math.floor(y / 33.334));
  const b = byCell(ZONES_M, c, r), lx = (x - c * 50) / 50, ly = (y - r * 33.333) / 33.333;
  const [pc, pr] = ZONES[b];
  return { x: Math.round((pc * 33.333 + lx * 33.333) * 10) / 10, y: Math.round((pr * 50 + ly * 50) * 10) / 10 };
};
const heart = h => (h >= 75 ? '💖' : h >= 45 ? '💛' : h >= 20 ? '🧡' : '💔');
const nameOf = s => s.nick || getSpecies(s.sp)?.name || s.sp;

export async function openFarm(ctx, profile, userId = null) {
  let pair = [];
  let houseMode = false;
  let farm = null, tab = 'farm', sel = null, decorMode = false, decorPick = null, decorDraft = null, visitList = null;
  let decorSel = null, decorHist = [], dragMoved = false; // ✏️ edição: selecionado, desfazer, arrasto
  const snap = () => { decorHist.push(decorDraft.map(x => ({ ...x }))); if (decorHist.length > 30) decorHist.shift(); };
  let me = profile;
  const ov = openModal('farm', '🌾 Fazenda', '<span class="spinner"></span>', { wide: true });
  ov.querySelector('.modal').classList.add('fm-modal');

  const load = async (uid = userId) => { farm = (await api('profile', uid ? { op: 'farm_get', userId: uid } : { op: 'farm_get' })).farm; userId = farm.mine ? null : farm.owner.id; render(); };
  const ownedDecor = () => [
    ...Object.entries(FARM_DECOR).filter(([k, d]) => d.price === 0 || (farm.ownedDecor || []).includes(k)),
    ...(farm.art || []).map((a, i) => [`art${i}`, { name: a.n, art: a.p }]) // 🖌️ desenhos do jogador
  ];
  /** Ícone de um enfeite: emoji ou o desenho do Ateliê. */
  const decorIcon = k => {
    if (isArtKey(k)) { const a = (farm.art || [])[artIndex(k)]; return a ? `<img class="fm-art" src="${artSvg(a.p)}" alt="${esc(a.n)}" draggable="false">` : ''; }
    return FARM_DECOR[k]?.icon || '';
  };

  // posições fixas por bioma (grade 3×2 dentro de uma área segura → ninguém sai do campo nem fica em cima do outro)
  const SPOTS = [[0.28, 0.55], [0.72, 0.58], [0.5, 0.82], [0.22, 0.86], [0.78, 0.88], [0.5, 0.5]];
  const placeMons = () => {
    const byZone = {};
    for (const s of [...farm.slots].sort((a, b) => hash(a.uid) - hash(b.uid))) (byZone[s.biome] ||= []).push(s);
    const out = [];
    for (const [b, list] of Object.entries(byZone)) {
      const z = zoneBox(b);
      list.forEach((s, k) => {
        const [fx, fy] = SPOTS[k % SPOTS.length];
        const h = hash(s.uid), jx = ((h % 100) / 100 - 0.5) * 0.08, jy = (((h >> 8) % 100) / 100 - 0.5) * 0.06;
        const ring = Math.floor(k / SPOTS.length) * 0.05;
        out.push({ s, x: z.x + z.w * Math.min(0.86, Math.max(0.14, fx + jx + ring)), y: z.y + z.h * Math.min(0.93, Math.max(0.45, fy + jy - ring)) });
      });
    }
    return out;
  };
  const daypart = () => { const h = new Date().getHours(); return h >= 19 || h < 5 ? 'night' : h < 7 ? 'dawn' : h >= 17 ? 'dusk' : 'day'; };
  const AMBIENT = {
    pasto: '<i class="amb bfly" style="left:30%;top:40%">🦋</i><i class="amb bfly b2" style="left:65%;top:55%">🦋</i>',
    floresta: Array.from({ length: 7 }, (_, i) => `<i class="amb ffly" style="left:${12 + i * 12}%;top:${30 + ((i * 37) % 55)}%;--fd:${2 + (i % 3)}s;--fl:-${i * 0.7}s"></i>`).join('') + '<i class="amb leaf" style="left:20%">🍃</i><i class="amb leaf l2" style="left:70%">🍂</i>',
    lago: '<i class="amb ripple" style="left:45%;top:62%"></i><i class="amb ripple r2" style="left:60%;top:72%"></i><i class="amb glint" style="left:38%;top:55%"></i><i class="amb glint g2" style="left:62%;top:66%"></i>',
    caverna: '<i class="amb crys" style="left:18%;top:72%">💎</i><i class="amb crys c2" style="left:80%;top:62%">💎</i>',
    vulcao: Array.from({ length: 6 }, (_, i) => `<i class="amb ember" style="left:${38 + i * 5}%;--ed:${2 + (i % 3) * 0.7}s;--el:-${i * 0.5}s"></i>`).join(''),
    campo: '<i class="amb spark" style="left:25%;top:45%">⚡</i><i class="amb spark s2" style="left:70%;top:70%">⚡</i><i class="amb spark s3" style="left:50%;top:30%">✦</i>'
  };
  const emote = s => (s.happy < 25 ? '💤' : s.happy >= 85 ? '♪' : '');
  const scene = () => {
    const decor = decorMode ? decorDraft : farm.decor;
    const comp = farm.companion, hs = farm.house;
    return `<div class="fm-scene dp-${daypart()} ${decorMode || houseMode ? 'decorating' : ''}">
      ${BIOME_IDS.map(b => { const z = zoneBox(b); return `<div class="fm-zone fm-${b}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%"><div class="fm-amb">${AMBIENT[b] || ''}</div><span class="fm-zlabel">${FARM_BIOMES[b].icon} ${FARM_BIOMES[b].name}</span></div>`; }).join('')}
      <div class="fm-cloud c1"></div><div class="fm-cloud c2"></div>
      ${decor.map((d, i) => { const v = toView(d.x, d.y); const fx = (DECOR_FX[d.k] || (isArtKey(d.k) ? 'bob' : '')).split(' ').filter(Boolean); const h = (i * 37) % 10;
        return `<span class="fm-decor ${fx.map(c => 'dfx-' + c).join(' ')} ${decorMode && decorSel === i ? 'dsel' : ''}" data-di="${i}" data-k="${esc(d.k)}" style="left:${v.x}%;top:${v.y}%;z-index:${Math.round(v.y)};--ds:${d.s || 1};--df:${d.f ? -1 : 1};--dd:-${h * 0.37}s"><span class="fm-dk">${decorIcon(d.k)}</span>${fx.includes('water') ? '<i class="dw"></i><i class="dw w2"></i><i class="dw w3"></i>' : fx.includes('fire') ? '<i class="df"></i><i class="df f2"></i>' : fx.includes('smoke') ? '<i class="ds"></i><i class="ds s2"></i>' : fx.includes('petals') ? '<i class="dp"></i><i class="dp p2"></i>' : ''}</span>`; }).join('')}
      ${daypart() === 'night' ? Array.from({ length: 7 }, (_, i) => `<i class="fm-fly" style="left:${8 + i * 13}%;top:${30 + ((i * 29) % 55)}%;--fd:${6 + (i % 4)}s;--fl:-${i * 1.3}s"></i>`).join('') : Array.from({ length: 3 }, (_, i) => `<i class="fm-bfly" style="top:${25 + i * 22}%;--bd:${16 + i * 5}s;--bl:-${i * 6}s">${['🦋', '🦋', '🐝'][i]}</i>`).join('')}
      ${hs ? (() => { const v = toView(hs.x, hs.y); return `<div class="fm-house" style="left:${v.x}%;top:${v.y}%;z-index:${Math.round(v.y)}" data-act="house-info">`; })() + `<span class="fm-house-ic">🏡</span>
        ${comp ? `<img class="fm-comp" src="${leaderUrl(comp.sprite)}" alt="${esc(comp.name)}" title="${esc(comp.name)} cuidando da Fazenda">` : '<span class="fm-house-tag">vazia</span>'}</div>` : ''}
      ${placeMons().map(({ s, x, y }) => { const h = hash(s.uid); const swim = s.biome === 'lago' && ['water', 'ice'].includes(getSpecies(s.sp)?.types?.[0]);
        return `<button class="fm-mon ${sel === s.uid ? 'on' : ''} ${swim ? 'swim' : ''} ${s.shiny ? 'shiny' : ''}" data-act="pick" data-uid="${s.uid}" style="left:${x}%;top:${y}%;z-index:${Math.round(y) + 1};--d:${(h % 5) + 5}s;--dl:-${h % 5}s">
          <span class="fm-walk"><span class="fm-shadow"></span><img src="${monSprite({ sp: s.sp, shiny: s.shiny })}" alt="">${s.shiny ? '<i class="fm-sparkle">✨</i>' : ''}</span>
          <span class="fm-h">${heart(s.happy)}</span>${emote(s) ? `<span class="fm-emote">${emote(s)}</span>` : ''}${farm.mine && s.pxp ? `<span class="fm-xp">+${s.pxp}</span>` : ''}</button>`;
      }).join('')}
      ${daypart() === 'night' ? '<div class="fm-stars"></div>' : ''}
      <div class="fm-fx"></div>
      ${!farm.slots.length ? `<div class="fm-empty">${farm.mine ? 'Sua Fazenda está vazia. Toque em <b>➕ Colocar Pokémon</b>.' : 'Esta Fazenda ainda está vazia.'}</div>` : ''}
      ${houseMode ? '<div class="fm-tip">🏡 Toque onde quer a casinha</div>' : ''}
    </div>`;
  };
  /** Efeitinhos por cima dos Pokémon (corações, recursos voando). */
  const burst = (icons, uids = null) => {
    const sc = ov.querySelector('.fm-scene'), fx = sc?.querySelector('.fm-fx');
    if (!fx) return;
    const targets = [...sc.querySelectorAll('.fm-mon')].filter(b => !uids || uids.includes(b.dataset.uid));
    targets.forEach((b, i) => {
      for (let k = 0; k < 3; k++) {
        const e = document.createElement('i');
        e.className = 'fm-pop';
        e.textContent = Array.isArray(icons) ? icons[(i + k) % icons.length] : icons;
        e.style.left = b.style.left; e.style.top = b.style.top;
        e.style.setProperty('--dx', `${(k - 1) * 18}px`); e.style.animationDelay = `${k * 0.12 + i * 0.05}s`;
        fx.appendChild(e);
        setTimeout(() => e.remove(), 1800);
      }
    });
  };

  let houseSel = false;
  const housePanel = () => {
    const c = farm.companion;
    return `<div class="fm-panel card"><span style="font-size:48px">🏡</span><div class="grow"><b>Casinha do Companheiro</b>
      ${c ? `<div class="small">${esc(c.icon)} <b>${esc(c.name)}</b> mora aqui e cuida da Fazenda:</div><div class="tiny">• felicidade cai 40% mais devagar<br>• +20% de XP nos Pokémon ${c.types.length ? 'do tipo ' + c.types.join('/') : 'do tipo dele'}<br>• cada "❤️ Carinho em todos" dá +3 de laço 💞 (Nv. ${c.bond})</div>`
        : `<div class="small muted">${farm.hasCompanion === false ? 'Você ainda não tem um companheiro equipado. Ganhe um nas missões das partidas e equipe em 🎒 Minha conta → Companheiros.' : 'Equipe um companheiro para ele morar aqui.'}</div>`}
      <div class="row" style="gap:4px;margin-top:6px"><button class="btn sm primary" data-act="tab" data-t="home">🚪 Entrar na casa</button>${farm.mine ? '<button class="btn sm" data-act="house">↔️ Mover</button><button class="btn sm red" data-act="house-del">Tirar casinha</button>' : ''}</div></div></div>`;
  };
  const monPanel = () => {
    if (houseSel && farm.house) return housePanel();
    const s = farm.slots.find(x => x.uid === sel);
    if (!s) return '';
    const sp = getSpecies(s.sp);
    return `<div class="fm-panel card"><img src="${monSprite({ sp: s.sp, shiny: s.shiny })}" alt="">
      <div class="grow"><b>${esc(nameOf(s))}</b>${genderHtml(s.gender)}${s.shiny ? ' ✨' : ''} <span class="tiny muted">Nv.${s.lvl}${s.lvl >= FARM_MAX_LEVEL ? ' (máx. da Fazenda)' : ''}</span>
        <div class="fm-bar"><i style="width:${s.happy}%"></i></div><div class="tiny muted">${heart(s.happy)} Felicidade ${s.happy}% · produz ${RESOURCES[s.res]?.icon || ''} ${RESOURCES[s.res]?.name || ''}${farm.mine && s.pxp ? ` · +${s.pxp} XP para coletar` : ''}</div>
        ${farm.mine ? `<div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap">
          <select class="input sm" data-fm="biome">${BIOME_IDS.map(b => `<option value="${b}" ${b === s.biome ? 'selected' : ''}>${FARM_BIOMES[b].icon} ${FARM_BIOMES[b].name}${b === bestBiome(sp?.types) ? ' ★' : ''}</option>`).join('')}</select>
          <button class="btn sm" data-act="feed">🍓 Dar Frutinha (${farm.res?.berry || 0})</button>
          <button class="btn sm red" data-act="remove">↩️ Tirar da Fazenda</button></div>` : ''}</div></div>`;
  };

  const head = () => `<div class="fm-head">
      <img class="avatar sm" src="${avatarUrl(farm.owner.avatar, farm.owner.skin)}" alt=""><div class="grow"><b>${farm.mine ? 'Minha Fazenda' : `Fazenda de ${esc(farm.owner.name)}`}</b>
        <div class="tiny muted">Nv. ${farm.lvl} · ${farm.slots.length}/${farm.slotsMax} vagas · ❤️ ${farm.likes}</div>
        <div class="fm-bar small"><i style="width:${Math.min(100, (farm.xp / farm.xpNext) * 100)}%"></i></div></div>
      ${farm.mine ? `<div class="fm-res">${Object.entries(RESOURCES).map(([k, r]) => `<span title="${r.name}">${r.icon}${farm.res?.[k] || 0}</span>`).join('')}</div>` : ''}</div>`;

  const actions = () => {
    if (decorMode) {
      const list = ownedDecor();
      const cur = decorSel !== null ? decorDraft[decorSel] : null;
      return `<div class="fm-decorbar"><span class="tiny muted">✏️ <b>Modo edição</b> (${decorDraft.length}/${farm.decorMax || DECOR_MAX}): escolha um enfeite e toque na Fazenda para colocar. Toque num enfeite para selecionar e <b>arraste</b> para mover.</span>
        ${cur ? `<div class="fm-dtools"><span class="fm-dsel-ic">${decorIcon(cur.k)}</span>
          <button class="btn sm" data-act="dflip" title="Espelhar">↔️ Virar</button>
          <button class="btn sm" data-act="dsize" data-v="-1" title="Menor">➖</button><span class="tiny">${Math.round((cur.s || 1) * 100)}%</span><button class="btn sm" data-act="dsize" data-v="1" title="Maior">➕</button>
          <button class="btn sm" data-act="ddup" title="Duplicar">📄 Copiar</button>
          <button class="btn sm red" data-act="ddel" title="Guardar (tirar da Fazenda)">📦 Guardar</button>
          <button class="btn sm" data-act="dunsel">OK</button></div>` : ''}
        <div class="fm-palette">${list.map(([k, d]) => `<button class="fm-dbtn ${decorPick === k ? 'on' : ''} ${d.art ? 'art' : ''}" data-act="dpick" data-k="${k}" title="${esc(d.name)}">${decorIcon(k)}</button>`).join('')}
          <button class="fm-dbtn new-art" data-act="tab" data-t="art" title="Desenhar um enfeite seu">🖌️</button></div>
        <div class="row" style="gap:6px"><button class="btn sm" data-act="dcancel">Cancelar</button><button class="btn sm" data-act="dundo" ${decorHist.length ? '' : 'disabled'}>↩️ Desfazer</button><button class="btn sm" data-act="dclear" ${decorDraft.length ? '' : 'disabled'}>🧹 Guardar tudo</button><button class="btn sm primary" data-act="dsave">💾 Salvar decoração</button>
        <span class="tiny muted">Mais decorações na 💎 Loja (só visual).</span></div></div>`;
    }
    if (!farm.mine) return `<div class="row fm-actions"><button class="btn ${farm.likedToday ? '' : 'primary'}" data-act="like" ${farm.likedToday ? 'disabled' : ''}>❤️ ${farm.likedToday ? 'Curtido hoje' : 'Curtir'}</button>
        <button class="btn ${farm.helpedToday ? '' : 'green'}" data-act="help" ${farm.helpedToday ? 'disabled' : ''}>🤝 ${farm.helpedToday ? 'Já cuidou hoje' : 'Cuidar dos Pokémon e regar a horta (+2 🍓)'}</button>
        <button class="btn" data-act="home">🏠 Voltar para a minha</button></div>`;
    const p = farm.pending || { xp: 0, res: {} };
    const pend = [p.xp ? `+${p.xp} XP` : '', ...Object.entries(p.res).map(([k, n]) => `${RESOURCES[k].icon}${n}`)].filter(Boolean).join(' · ');
    return `<div class="row fm-actions">
      <button class="btn ${pend ? 'primary' : ''}" data-act="collect" ${pend ? '' : 'disabled'}>✨ Coletar${pend ? ` <span class="tiny">(${pend})</span>` : ''}</button>
      <button class="btn green" data-act="care">❤️ Carinho em todos</button>
      <button class="btn" data-act="add" ${farm.slots.length >= farm.slotsMax ? 'disabled' : ''}>➕ Colocar Pokémon</button>
      <button class="btn" data-act="decor">🎨 Decorar</button>
      <button class="btn" data-act="tab" data-t="art">🖌️ Ateliê</button>
      ${farm.house ? '<button class="btn primary" data-act="tab" data-t="home">🚪 Entrar na casa</button>' : '<button class="btn" data-act="house">🏡 Casinha</button>'}
      <button class="btn ${(farm.eggs || []).some(e => e.ready) ? 'primary' : ''}" data-act="tab" data-t="creche">🥚 Creche${(farm.eggs || []).length ? ` (${farm.eggs.length})` : ''}</button>
      <button class="btn ${hortaReady() ? 'primary' : ''}" data-act="tab" data-t="horta">🌱 Horta${hortaReady() ? ' ✨' : ''}</button>
      <button class="btn ${(farm.workshop?.jobs || []).some(j => j.ready) ? 'primary' : ''}" data-act="tab" data-t="oficina">🔨 Oficina</button>
      <button class="btn" data-act="tab" data-t="res">📦 Recursos</button>
      <button class="btn" data-act="tab" data-t="exp">🏗️ Expansões</button>
      <button class="btn" data-act="tab" data-t="visit">👥 Visitar</button></div>`;
  };

  /** ✨ efeitinho ao tocar num enfeite */
  const tapDecor = el => {
    const fx = el.closest('.fm-scene')?.querySelector('.fm-fx');
    if (!fx) return;
    el.classList.remove('tapped'); void el.offsetWidth; el.classList.add('tapped');
    const k = el.dataset.k;
    const set = TAP_FX[k] || (isArtKey(k) ? ['✨', '💖'] : ['✨']);
    for (let i = 0; i < 6; i++) {
      const p = document.createElement('i');
      p.className = 'fm-pop tap';
      p.textContent = set[i % set.length];
      p.style.left = el.style.left; p.style.top = el.style.top;
      p.style.setProperty('--dx', `${(i - 2.5) * 14}px`); p.style.animationDelay = `${i * 0.07}s`;
      fx.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
  };

  // ---------------------------------------------------------------- 🏡 casa por dentro (v49)
  let homeSub = 'room', homeEdit = false, homeDraft = null, homePick = null, homeSel = null;
  // ✋ v64d: no ✏️ Arrumar, arrastar móveis e personagens com o mouse ou o dedo (solta na casa mais perto)
  let dragEndAt = 0;
  const dragJustEnded = () => Date.now() - dragEndAt < 350;
  const bindHomeDrag = () => {
    const room = ov.querySelector('.hm-room.editing');
    if (!room || room._drag) return;
    room._drag = true;
    let g = null;
    const toCell = (cx, cy) => {
      const r = room.getBoundingClientRect();
      const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
      return { x: Math.max(0, Math.min(ROOM_W - 1, Math.floor(fx * ROOM_W))), y: Math.max(0, Math.min(ROOM_H - 1, Math.floor(((fy - 0.32) / 0.68) * ROOM_H))), fx, fy };
    };
    room.addEventListener('pointerdown', e => {
      const el = e.target.closest('.hm-f, .hm-pal');
      if (!el || !room.contains(el)) return;
      g = { el, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    });
    room.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 8) return;
      if (!g.moved) { g.moved = true; g.el.classList.add('dragging'); try { room.setPointerCapture(e.pointerId); } catch { /* ok */ } }
      e.preventDefault();
      const c = toCell(e.clientX, e.clientY);
      g.el.style.left = `${Math.max(0, Math.min(1, c.fx)) * 100}%`;
      if (!g.el.classList.contains('onwall')) { g.el.style.top = `${Math.max(0.32, Math.min(1, c.fy)) * 100}%`; g.el.style.bottom = 'auto'; }
      g.el.style.zIndex = 90;
    });
    const up = e => {
      if (!g || e.pointerId !== g.id) return;
      const gg = g; g = null;
      if (!gg.moved) return;
      dragEndAt = Date.now();
      const c = toCell(e.clientX, e.clientY);
      if (gg.el.dataset.pal) (homeDraft.pals ||= {})[gg.el.dataset.pal] = { x: c.x, y: c.y };
      else { const i = Number(gg.el.dataset.i); if (homeDraft[i]) homeDraft[i] = { ...homeDraft[i], x: c.x, y: FURNITURE[homeDraft[i].f]?.wall ? homeDraft[i].y : c.y }; homeSel = i; }
      render();
    };
    room.addEventListener('pointerup', up);
    room.addEventListener('pointercancel', up);
  };
  const H = () => farm.home || { placed: [], wall: 'plain', floor: 'wood' };
  const homeOwnedLeft = f => ((H().owned || {})[f] || 0) - (homeDraft || []).filter(x => x.f === f).length;
  const roomHtml = () => {
    const h = H();
    const placed = homeEdit ? homeDraft : h.placed;
    const wall = WALLS[homeEdit ? homeDraft.wall || h.wall : h.wall] || WALLS.plain, floor = FLOORS[homeEdit ? homeDraft.floor || h.floor : h.floor] || FLOORS.wood;
    const comp = farm.companion, fav = h.fav;
    const palAt = k => (homeEdit ? homeDraft.pals?.[k] : h.pals?.[k]) || null;
    const cell = (x, y) => `left:${((x + 0.5) / ROOM_W) * 100}%;top:${32 + ((y + 0.5) / ROOM_H) * 68}%;z-index:${10 + y}`;
    return `<div class="hm-room ${homeEdit ? 'editing' : ''}" style="--wall:${wall.css};--floor:${floor.css};--hm-k:${hmK()}">
      <div class="hm-wall"></div><div class="hm-floor"></div>
      ${homeEdit ? Array.from({ length: ROOM_W * ROOM_H }, (_, i) => `<i class="hm-cell" data-act="hm-cell" data-x="${i % ROOM_W}" data-y="${Math.floor(i / ROOM_W)}" style="${cell(i % ROOM_W, Math.floor(i / ROOM_W))};z-index:5"></i>`).join('') : ''}
      ${placed.map((p, i) => { const F = FURNITURE[p.f]; if (!F) return '';
        const pos = F.wall ? `left:${((p.x + 0.5) / ROOM_W) * 100}%;top:${17 + (p.y % 2) * 6}%;z-index:3` : cell(p.x, p.y); // móveis de parede ficam na parede
        return `<span class="hm-f ${F.part ? 'part' : ''} ${F.glow ? 'glow' : ''} ${F.floor ? 'flat' : ''} ${F.wall ? 'onwall' : ''} hmf-${p.f} ${homeEdit && homeSel === i ? 'sel' : ''}" data-act="hm-f" data-i="${i}" data-f="${p.f}" style="${pos};--fl:${p.fl ? -1 : 1};--fw:${furnW(p.f) * (p.s || 1)}">${F.part ? '' : furnIcon(p.f, F.icon)}</span>`; }).join('')}
      ${comp ? `<button class="hm-pal hm-comp ${palAt('comp') ? 'placed' : ''}" data-act="hm-talk" data-pal="comp" style="${palAt('comp') ? cell(palAt('comp').x, palAt('comp').y) : ''}" title="${esc(comp.name)}"><img src="${leaderUrl(comp.sprite)}" alt=""><span class="hm-bubble">${farm.mine && !h.talked ? '💬' : '💞'}</span></button>` : ''}
      ${fav ? `<button class="hm-pal hm-fav ${palAt('fav') ? 'placed' : ''}" data-act="hm-play" data-pal="fav" style="${palAt('fav') ? cell(palAt('fav').x, palAt('fav').y) : ''}" title="${esc(fav.nick || getSpecies(fav.sp).name)}"><img src="${monSprite({ sp: fav.sp, shiny: fav.shiny })}" alt=""><span class="hm-bubble">${farm.mine && !h.played ? '🎾' : '♪'}</span></button>` : ''}
    </div>`;
  };
  const homeView = () => {
    const h = H();
    const back = `<button class="btn" data-act="${homeSub === 'room' ? 'tab' : 'hm-sub'}" data-t="farm" data-s="room" style="margin-top:8px">← ${homeSub === 'room' ? 'Sair da casa' : 'Voltar para a sala'}</button>`;
    if (!farm.mine) return `<p class="small muted">🏡 Casa de ${esc(farm.owner?.name || 'um treinador')}.</p>${roomHtml()}${back}`;
    if (homeSub === 'shop') {
      const card = (kind, id, it) => { const own = kind === 'furniture' ? (h.owned || {})[id] || 0 : (h[kind + 's'] || []).includes(id) || !it.price;
        return `<div class="hm-shop-it"><span class="hm-shop-ic" ${kind !== 'furniture' ? `style="background:${it.css}"` : ''}>${kind === 'furniture' ? furnIcon(id, it.icon) : ''}</span><b class="small">${esc(it.name)}</b>
          ${it.desc ? `<span class="tiny muted">${esc(it.desc)}</span>` : ''}<span class="tiny">${kind === 'furniture' ? `tem ${own}/${furnMax(id)}` : own ? '✔ seu' : ''}</span>
          ${(kind === 'furniture' ? own + (it.pack || 1) <= furnMax(id) : !own) ? `<button class="btn sm ${(me?.gold || 0) >= it.price ? 'primary' : ''}" data-act="hm-buy" data-k="${kind}" data-id="${id}" ${(me?.gold || 0) >= it.price ? '' : 'disabled'}>🪙 ${it.price}</button>` : ''}</div>`; };
      return `<p class="small muted">🛒 Móveis e estilos — tudo com ouro. Você tem 🪙 <b>${me?.gold ?? 0}</b>. Móveis especiais: 🍳 Fogão libera a cozinha, 🧊 Geladeira +1 prato ao mesmo tempo, 🔥 Lareira dobra o laço da conversa, 🧸 Baú dobra o XP da brincadeira.</p>
        <h4>🛋️ Móveis</h4><div class="hm-shop">${Object.entries(FURNITURE).map(([id, it]) => card('furniture', id, it)).join('')}</div>
        <h4>🧱 Papel de parede</h4><div class="hm-shop">${Object.entries(WALLS).map(([id, it]) => card('wall', id, it)).join('')}</div>
        <h4>🟫 Piso</h4><div class="hm-shop">${Object.entries(FLOORS).map(([id, it]) => card('floor', id, it)).join('')}</div>${back}`;
    }
    if (homeSub === 'fav') {
      const vault = (me?.vault || []).slice().sort((a, b) => (b.lvl || 0) - (a.lvl || 0));
      return `<p class="small muted">⭐ Escolha o Pokémon favorito que mora na casa com você. Brinque com ele 1× por dia: +${PLAY_XP} XP (dobro com o 🧸 Baú de brinquedos).</p>
        <div class="mini-grid">${vault.map(m => miniMon(m, { act: 'hm-favset', index: m.uid, sel: h.fav?.uid === m.uid })).join('')}</div>
        ${h.fav ? '<button class="btn sm red" data-act="hm-favset" data-i="">Tirar favorito</button>' : ''}${back}`;
    }
    if (homeSub === 'cook') {
      const goods = farm.garden?.goods || {};
      const jobs = h.cook || [];
      return `<p class="small muted">🍳 Cozinhe com o que a Fazenda produz: frutas da 🌱 Horta (Sitrus, Lum e Starf são novas) e 🥛 leite, 🥚 ovo e 🍯 mel que alguns Pokémon dão no ❤️ Carinho (Miltank, Chansey, Combee... e às vezes os de tipo Normal, Voador, Inseto e Fada). O prato vai para a 🎒 Mochila: leve 1 por partida e o efeito dura a partida inteira.</p>
        <div class="hp-goods">${Object.entries(GOODS).map(([k, g]) => `<span class="chip">${g.icon} ${esc(g.name)} <b>${goods[k] || 0}</b></span>`).join('')}</div>
        <h4>🔥 No fogão (${jobs.length}/${h.cookMax || 1})</h4>
        <div class="hb-jobs">${jobs.map(j => `<div class="hb-job ${j.ready ? 'ready' : ''}">${MEAL_ITEMS[j.item]?.emoji} <b class="tiny">${esc(MEAL_ITEMS[j.item]?.name || '')}</b> ${j.ready ? '<span class="tiny hp-ok">pronto</span>' : `<span class="tiny">⏳ ${fmtT(j.done - Date.now())}</span>`}</div>`).join('') || '<span class="tiny muted">vazio</span>'}</div>
        ${jobs.some(j => j.ready) ? '<button class="btn sm primary" data-act="hm-claim">🍽️ Pegar pratos</button>' : ''}
        <div class="hb-recipes" style="margin-top:8px">${Object.entries(MEALS).map(([id, M]) => { const bag = me?.stats?.bag || {};
          const ok = Object.entries(M.in).every(([g, n]) => (goods[g] || 0) >= n) && Object.entries(M.bagIn || {}).every(([g, n]) => (bag[g] || 0) >= n) && jobs.length < (h.cookMax || 1);
          return `<div class="hb-rec ${ok ? '' : 'dim'}"><span>${M.emoji} <b>${esc(M.name)}</b> <span class="tiny">· ${M.hours}h</span></span><span class="tiny">${Object.entries(M.in).map(([g, n]) => `<span class="${(goods[g] || 0) >= n ? '' : 'miss'}">${n}× ${GOODS[g].icon}</span>`).join(' + ')}${Object.entries(M.bagIn || {}).map(([g, n]) => ` + <span class="${(bag[g] || 0) >= n ? '' : 'miss'}" title="${esc(ALL_ITEMS[g]?.name || g)} (Mochila)">${n}× ${ALL_ITEMS[g]?.emoji || '🎒'}</span>`).join('')}</span><span class="tiny muted">${esc(M.desc)}</span>
            <div class="row" style="gap:4px">${M.type ? `<select class="input sm" id="hm-ctype">${TYPES.map(t => `<option value="${t}">${esc(TYPE_LABELS[t])}</option>`).join('')}</select>` : ''}<button class="btn sm ${ok ? 'primary' : ''}" data-act="hm-cook" data-m="${id}" ${ok ? '' : 'disabled'}>🍳 Cozinhar</button></div></div>`; }).join('')}</div>${back}`;
    }
    // sala
    const stove = (h.placed || []).some(p => p.f === 'stove');
    const tools = homeEdit ? `<div class="fm-decorbar"><span class="tiny muted">✏️ <b>Arrumando</b> (${homeDraft.filter(x => !FURNITURE[x.f]?.part).length}/${HOME_MAX} móveis · ${homeDraft.filter(x => FURNITURE[x.f]?.part).length}/${PART_MAX} 🧱): escolha um móvel e toque num quadradinho. Toque num móvel para selecionar.</span> <label class="tiny hm-k">📏 Tamanho de todos <input type="range" min="0.5" max="2" step="0.1" value="${hmK()}" data-hmk></label><span></span>
        ${homeSel !== null && homeDraft[homeSel] ? `<div class="fm-dtools"><span class="fm-dsel-ic">${furnIcon(homeDraft[homeSel].f, FURNITURE[homeDraft[homeSel].f].icon)}</span><button class="btn sm" data-act="hm-flip">↔️ Virar</button>${FURNITURE[homeDraft[homeSel].f]?.part ? '' : `<span class="hm-size"><button class="btn sm" data-act="hm-size" data-d="-1" title="Diminuir este móvel">➖</button><b>${Math.round((homeDraft[homeSel].s || 1) * 100)}%</b><button class="btn sm" data-act="hm-size" data-d="1" title="Aumentar este móvel">➕</button></span>`}<button class="btn sm red" data-act="hm-del">📦 Guardar</button><button class="btn sm" data-act="hm-unsel">OK</button></div>` : ''}
        <div class="fm-palette">${Object.keys(h.owned || {}).filter(f => FURNITURE[f]).map(f => `<button class="fm-dbtn ${homePick === f ? 'on' : ''}" data-act="hm-pick" data-f="${f}" title="${esc(FURNITURE[f].name)}" ${homeOwnedLeft(f) > 0 ? '' : 'disabled'}>${furnIcon(f, FURNITURE[f].icon)}<small>${homeOwnedLeft(f)}</small></button>`).join('') || '<span class="tiny muted">Compre móveis na 🛒 Loja de móveis.</span>'}</div>
        <div class="row" style="gap:6px;flex-wrap:wrap"><select class="input sm" id="hm-wall">${Object.entries(WALLS).filter(([id, w]) => !w.price || (h.walls || []).includes(id)).map(([id, w]) => `<option value="${id}" ${(homeDraft.wall || h.wall) === id ? 'selected' : ''}>🧱 ${esc(w.name)}</option>`).join('')}</select>
          <select class="input sm" id="hm-floor">${Object.entries(FLOORS).filter(([id, f]) => !f.price || (h.floors || []).includes(id)).map(([id, f]) => `<option value="${id}" ${(homeDraft.floor || h.floor) === id ? 'selected' : ''}>🟫 ${esc(f.name)}</option>`).join('')}</select>
          <button class="btn sm" data-act="hm-cancel">Cancelar</button><button class="btn sm primary" data-act="hm-save">💾 Salvar</button></div></div>`
      : `<div class="row fm-actions">
        <button class="btn" data-act="hm-edit">✏️ Arrumar</button><button class="btn" data-act="hm-sub" data-s="shop">🛒 Loja de móveis</button>
        <button class="btn" data-act="hm-sub" data-s="fav">⭐ Favorito</button>
        <button class="btn ${farm.companion && !h.talked ? 'green' : ''}" data-act="hm-talk" ${farm.companion && !h.talked ? '' : 'disabled'}>💬 ${h.talked ? 'Já conversaram hoje' : 'Conversar'}</button>
        <button class="btn ${h.fav && !h.played ? 'green' : ''}" data-act="hm-play" ${h.fav && !h.played ? '' : 'disabled'}>🎾 ${h.played ? 'Já brincaram hoje' : 'Brincar'}</button>
        <button class="btn ${(h.cook || []).some(j => j.ready) ? 'primary' : ''}" data-act="hm-sub" data-s="cook" ${stove ? '' : 'disabled title="Coloque um 🍳 Fogão na casa"'}>🍳 Cozinha${(h.cook || []).some(j => j.ready) ? ' ✨' : ''}</button></div>`;
    return `${roomHtml()}${tools}${!homeEdit ? back : ''}`;
  };

  // ---------------------------------------------------------------- 🏗️ Expansões (ouro)
  const expView = () => `<p class="small muted">Gaste o ouro que sobra para deixar a Fazenda maior. Cada expansão fica mais cara a cada compra. Você tem 🪙 <b>${me?.gold ?? 0}</b>.</p>
    <div class="hb-list">${Object.entries(EXPANSIONS).map(([k, E]) => { const x = farm.exp?.[k] || { lvl: 0, next: E.prices[0] }; const max = E.prices.length;
      return `<div class="hb-card"><div class="hb-head"><span class="hb-ic">${E.icon}</span><b>${esc(E.name)}</b><span class="tiny muted">${x.lvl}/${max}</span></div>
        <span class="small">${esc(E.desc)}</span><div class="fm-bar small"><i style="width:${(x.lvl / max) * 100}%"></i></div>
        ${x.next === null ? '<span class="tiny hp-ok">✔ Tudo comprado</span>' : `<button class="btn sm ${(me?.gold || 0) >= x.next ? 'primary' : ''}" data-act="expand" data-k="${k}" ${(me?.gold || 0) >= x.next ? '' : 'disabled'}>🪙 ${x.next} — comprar</button>`}</div>`; }).join('')}</div>
    <button class="btn" data-act="tab" data-t="farm" style="margin-top:8px">← Voltar</button>`;

  // ---------------------------------------------------------------- 🖌️ Ateliê (pixel art 16×16)
  let artSlot = null, artPx = null, artColor = 0, artTool = 'pen', artMirror = false, artHist = [], artName = '';
  const blankArt = () => '.'.repeat(ART_SIZE * ART_SIZE);
  const artOpen = i => { const a = (farm.art || [])[i]; artSlot = i; artPx = a ? a.p : blankArt(); artName = a ? a.n : `Enfeite ${i + 1}`; artHist = []; };
  const artView = () => {
    const list = farm.art || [];
    if (artSlot === null) {
      return `<p class="small muted">Desenhe seus próprios enfeites em pixel art (16×16) e coloque na Fazenda pelo 🎨 Decorar. Até ${ART_MAX} desenhos. Quem visita a sua Fazenda vê — capriche! (Desenhos impróprios podem ser apagados pela moderação.)</p>
        <div class="art-slots">${Array.from({ length: ART_MAX }, (_, i) => {
          const a = list[i];
          if (a) return `<div class="art-slot"><img src="${artSvg(a.p)}" alt=""><b class="tiny">${esc(a.n)}</b><div class="row" style="gap:4px"><button class="btn sm" data-act="art-edit" data-i="${i}">✏️ Editar</button><button class="btn sm red" data-act="art-del" data-i="${i}">🗑️</button></div></div>`;
          return i === list.length ? `<button class="art-slot new" data-act="art-edit" data-i="${i}"><span>➕</span><b class="tiny">Novo desenho</b></button>` : `<div class="art-slot empty"><span class="tiny muted">vazio</span></div>`;
        }).join('')}</div>
        <button class="btn" data-act="tab" data-t="farm" style="margin-top:8px">← Voltar</button>`;
    }
    const cells = Array.from({ length: ART_SIZE * ART_SIZE }, (_, i) => { const c = artPx[i]; return `<i data-px="${i}" style="${c === '.' ? '' : `background:${ART_PALETTE[parseInt(c, 16)]}`}"></i>`; }).join('');
    return `<div class="art-editor">
      <div class="art-left"><div class="art-grid" id="art-grid">${cells}</div>
        <div class="art-prev"><span class="tiny muted">Na Fazenda:</span><img id="art-prev" src="${artSvg(artPx) || ''}" alt=""><img class="big" id="art-prev2" src="${artSvg(artPx) || ''}" alt=""></div></div>
      <div class="art-side">
        <input class="input" id="art-name" maxlength="18" value="${esc(artName)}" placeholder="Nome do enfeite">
        <div class="art-pal">${ART_PALETTE.map((c, i) => `<button class="art-sw ${artColor === i && artTool !== 'erase' ? 'on' : ''}" data-act="art-color" data-c="${i}" style="background:${c}" title="${c}"></button>`).join('')}</div>
        <div class="art-tools">
          <button class="btn sm ${artTool === 'pen' ? 'primary' : ''}" data-act="art-tool" data-t="pen">✏️ Lápis</button>
          <button class="btn sm ${artTool === 'fill' ? 'primary' : ''}" data-act="art-tool" data-t="fill">🪣 Balde</button>
          <button class="btn sm ${artTool === 'erase' ? 'primary' : ''}" data-act="art-tool" data-t="erase">🧽 Borracha</button>
          <button class="btn sm ${artTool === 'pick' ? 'primary' : ''}" data-act="art-tool" data-t="pick">💉 Conta-gotas</button>
          <button class="btn sm ${artMirror ? 'primary' : ''}" data-act="art-mirror" title="Desenha dos dois lados ao mesmo tempo">🪞 Espelho</button>
          <button class="btn sm" data-act="art-undo" ${artHist.length ? '' : 'disabled'}>↩️ Desfazer</button>
          <button class="btn sm" data-act="art-flip">↔️ Virar</button>
          <button class="btn sm red" data-act="art-clear">🧹 Limpar</button>
        </div>
        <div class="row" style="gap:6px;margin-top:8px"><button class="btn" data-act="art-cancel">Cancelar</button><button class="btn primary" data-act="art-save">💾 Salvar desenho</button></div>
        <p class="tiny muted">Dica: arraste o dedo para pintar. O fundo transparente deixa o enfeite "recortado" na Fazenda.</p>
      </div></div>`;
  };
  const artSnap = () => { artHist.push(artPx); if (artHist.length > 40) artHist.shift(); };
  const artPaintCell = (i, grid) => {
    const ch = artTool === 'erase' ? '.' : artColor.toString(16);
    const put = j => { if (artPx[j] === ch) return; artPx = artPx.slice(0, j) + ch + artPx.slice(j + 1); const cell = grid?.children[j]; if (cell) cell.style.background = ch === '.' ? '' : ART_PALETTE[parseInt(ch, 16)]; };
    put(i);
    if (artMirror) { const x = i % ART_SIZE, y = Math.floor(i / ART_SIZE); put(y * ART_SIZE + (ART_SIZE - 1 - x)); }
  };
  const artFill = i => {
    const target = artPx[i], ch = artColor.toString(16);
    if (target === ch) return;
    const a = artPx.split(''), st = [i];
    while (st.length) { const j = st.pop(); if (a[j] !== target) continue; a[j] = ch; const x = j % ART_SIZE, y = Math.floor(j / ART_SIZE);
      if (x > 0) st.push(j - 1); if (x < ART_SIZE - 1) st.push(j + 1); if (y > 0) st.push(j - ART_SIZE); if (y < ART_SIZE - 1) st.push(j + ART_SIZE); }
    artPx = a.join('');
  };
  const artRefreshPrev = () => { const u = artSvg(artPx); ['art-prev', 'art-prev2'].forEach(id => { const im = ov.querySelector('#' + id); if (im) im.src = u; }); };

  // ---------------------------------------------------------------- 🌱 Horta e 🏭 Construções
  const hortaReady = () => (farm.garden?.plots || []).some(p => p?.ready) || Object.values(farm.buildings || {}).some(b => b.jobs.some(j => j.ready));
  let plantAt = null; // canteiro escolhido para plantar
  const hortaView = () => {
    const G = farm.garden || { plots: [] };
    const goods = G.goods || {};
    const plot = (pl, i) => {
      if (!pl) return `<div class="hp-plot empty ${plantAt === i ? 'sel' : ''}" data-act="plot" data-i="${i}"><span class="hp-soil">🟫</span><span class="tiny">Plantar</span></div>`;
      const C = CROPS[pl.crop];
      const pct = Math.min(100, ((Date.now() - pl.at) / Math.max(1, pl.readyAt - pl.at)) * 100);
      const st = pl.ready ? 2 : pct < 40 ? 0 : 1;
      const stage = CROP_SHEET[pl.crop] ? cropSprite(pl.crop, st) : pl.ready ? C.icon : pct < 35 ? '🌱' : pct < 75 ? '🌿' : '🪴';
      return `<div class="hp-plot ${pl.ready ? 'ready' : ''} ${pl.watered ? 'wet' : ''}"><span class="hp-crop ${CROP_SHEET[pl.crop] ? 'spr' : ''}">${stage}</span><b class="tiny">${esc(C.name)}</b>
        ${pl.ready ? '<span class="tiny hp-ok">Pronto!</span>' : `<span class="tiny">⏳ ${fmtT(pl.readyAt - Date.now())}</span><div class="fm-bar small"><i style="width:${pct}%"></i></div>`}${pl.watered ? '<span class="hp-drop" title="Regado">💧</span>' : ''}</div>`;
    };
    const picker = plantAt === null ? '' : `<div class="hp-picker"><b>Plantar no canteiro ${plantAt + 1}:</b><div class="hp-seeds">${Object.entries(CROPS).map(([k, C]) => {
      const lock = farm.lvl < C.lvl;
      return `<button class="hp-seed" data-act="plant" data-k="${k}" ${lock || (me?.gold || 0) < C.cost ? 'disabled' : ''} title="${lock ? `Libera no Nv. ${C.lvl}` : ''}"><span>${CROP_SHEET[k] ? cropSprite(k, 2, 'mini') : C.icon}</span><b>${esc(C.name)}</b><span class="tiny">${C.hours}h · 🪙 ${C.cost}</span>${lock ? `<span class="tiny">🔒 Nv. ${C.lvl}</span>` : `<span class="tiny muted">colhe ${C.yield[0]}–${C.yield[1]}</span>`}</button>`;
    }).join('')}</div><button class="btn sm" data-act="plot-x">Cancelar</button></div>`;
    const anyReady = G.plots.some(p => p?.ready), anyDry = G.plots.some(p => p && !p.watered && !p.ready);
    const B = farm.buildings || {};
    const bcard = (id, Bd) => {
      const b = B[id] || { lvl: 0, jobs: [] };
      const cost = Bd.cost[b.lvl];
      const costTxt = cost ? Object.entries(cost).map(([k, q]) => (k === 'gold' ? `🪙 ${q}` : `${RESOURCES[k].icon} ${q}`)).join(' · ') : '';
      if (!b.lvl) {
        return `<div class="hb-card locked"><div class="hb-head"><span class="hb-ic">${Bd.icon}</span><b>${esc(Bd.name)}</b></div>
          <span class="tiny muted">${farm.lvl < Bd.lvl ? `🔒 Libera no Nv. ${Bd.lvl} da Fazenda` : `Construir: ${costTxt}`}</span>
          ${farm.lvl >= Bd.lvl ? `<button class="btn sm primary" data-act="build" data-b="${id}">🔨 Construir</button>` : ''}</div>`;
      }
      const q = queueFor(b.lvl);
      return `<div class="hb-card"><div class="hb-head"><span class="hb-ic">${Bd.icon}</span><b>${esc(Bd.name)} Nv.${b.lvl}</b>
          <span class="tiny ${b.worker ? 'hb-work' : 'muted'}">${b.worker ? `👷 ${Bd.workerName} trabalhando: −25% no tempo` : `Coloque um Pokémon ${Bd.workerName} na Fazenda para ir mais rápido`}</span></div>
        <div class="hb-jobs">${b.jobs.map(j => { const R = Bd.recipes[j.recipe]; return `<div class="hb-job ${j.ready ? 'ready' : ''}">${R.icon} <b class="tiny">${esc(R.name)}</b> ${j.ready ? '<span class="tiny hp-ok">pronto</span>' : `<span class="tiny">⏳ ${fmtT(j.done - Date.now())}</span>`}</div>`; }).join('')}
          ${Array.from({ length: Math.max(0, q - b.jobs.length) }, () => '<div class="hb-job empty tiny muted">livre</div>').join('')}</div>
        ${b.jobs.some(j => j.ready) ? `<button class="btn sm primary" data-act="bclaim" data-b="${id}">✨ Pegar</button>` : ''}
        <div class="hb-recipes">${Object.entries(Bd.recipes).map(([rk, R]) => {
          const ok = Object.entries(R.in).every(([g, n]) => (goods[g] || 0) >= n) && b.jobs.length < q && !(R.lvl && b.lvl < R.lvl);
          return `<button class="hb-rec" data-act="bjob" data-b="${id}" data-r="${rk}" ${ok ? '' : 'disabled'}><span>${R.icon} <b>${esc(R.name)}</b></span><span class="tiny">${Object.entries(R.in).map(([g, n]) => `${n}x ${GOODS[g].icon}`).join(' + ')} · ${R.hours}h</span>${R.out.item ? `<span class="tiny muted">${esc(POFFIN_ITEMS[R.out.item].desc)}</span>` : ''}${R.out.bag?.gene_candy ? `<span class="tiny muted">🎒 Vai para a Mochila: dê a um Pokémon da Coleção para sortear os IVs de novo.${R.lvl && b.lvl < R.lvl ? ` <b>Precisa da ${esc(Bd.name)} Nv.${R.lvl}.</b>` : ''}</span>` : ''}</button>`;
        }).join('')}</div>
        ${b.lvl < BUILD_MAX ? `<button class="btn sm" data-act="build" data-b="${id}" title="Mais uma vaga na fila de produção">⬆️ Melhorar para Nv.${b.lvl + 1} (${costTxt})</button>` : '<span class="tiny muted">Nível máximo</span>'}</div>`;
    };
    return `<p class="small muted">Plante com ouro, espere e colha. 💧 Pokémon de <b>Água</b> na Fazenda regam sozinhos (−25% no tempo); 🌿 de <b>Planta</b> aceleram a horta (−20%). Amigos que cuidam da sua Fazenda também regam. A colheita vira ingrediente no 🌀 Moinho e na 🍳 Cozinha.</p>
      <div class="hp-tools">${G.waterAuto ? '<span class="chip blue">💧 Rega automática</span>' : ''}${G.grassBoost ? '<span class="chip green">🌿 Planta acelerando</span>' : ''}
        <button class="btn sm ${anyReady ? 'primary' : ''}" data-act="harvest" ${anyReady ? '' : 'disabled'}>🧺 Colher tudo</button>
        <button class="btn sm" data-act="water" ${anyDry ? '' : 'disabled'}>💧 Regar</button></div>
      <div class="hp-grid">${G.plots.map(plot).join('')}</div>
      <p class="tiny muted">Canteiros: ${G.plots.length}/8 — ganha mais a cada 2 níveis da Fazenda.</p>
      ${picker}
      <h3>🧺 Despensa</h3><div class="hp-goods">${Object.entries(GOODS).map(([k, g]) => `<span class="chip">${g.icon} ${esc(g.name)} <b>${goods[k] || 0}</b></span>`).join('')}</div>
      <h3>🏭 Construções</h3><div class="hb-list">${Object.entries(BUILDINGS).map(([id, Bd]) => bcard(id, Bd)).join('')}</div>
      <p class="tiny muted">Poffins e Torta vão para os 🎒 Itens da Fazenda (aba 🔨 Oficina) — use quando quiser.</p>
      <button class="btn" data-act="tab" data-t="farm" style="margin-top:8px">← Voltar</button>`;
  };

  const resView = () => `<p class="small muted">Recursos que seus Pokémon produziram. Venda por ouro da conta (na próxima fase viram itens na Oficina).</p>
    <div class="fm-reslist">${Object.entries(RESOURCES).map(([k, r]) => `<div class="fm-resrow"><span class="fm-ri">${r.icon}</span><b>${r.name}</b><span class="grow tiny muted">${(farm.res?.[k] || 0)} guardados · 🪙 ${r.gold} cada</span>
      <button class="btn sm" data-act="sell" data-k="${k}" data-q="1" ${farm.res?.[k] ? '' : 'disabled'}>Vender 1</button><button class="btn sm" data-act="sell" data-k="${k}" data-q="999" ${farm.res?.[k] ? '' : 'disabled'}>Vender tudo</button></div>`).join('')}</div>
    <h3 style="margin-top:10px">📜 Visitas</h3><div class="list">${(farm.visits || []).map(v => `<div class="list-item small">${v.kind === 'like' ? '❤️' : '🤝'} <b>${esc(v.name)}</b> ${v.kind === 'like' ? 'curtiu sua Fazenda' : 'cuidou dos seus Pokémon'} <span class="tiny muted">${new Date(v.at).toLocaleString('pt-BR')}</span></div>`).join('') || '<p class="tiny muted">Ninguém visitou ainda. Chame os amigos!</p>'}</div>
    <button class="btn" data-act="tab" data-t="farm" style="margin-top:8px">← Voltar</button>`;

  const visitView = () => {
    if (!visitList) return '<span class="spinner"></span>';
    const row = f => `<div class="list-item row" style="gap:8px"><img class="avatar sm" src="${avatarUrl(f.avatar, f.skin)}" alt=""><div class="grow"><b>${esc(f.name)}</b>${f.likes !== undefined ? `<div class="tiny muted">❤️ ${f.likes} · Nv. ${f.lvl} · ${f.mons} Pokémon</div>` : ''}</div><button class="btn sm primary" data-act="visit" data-id="${esc(f.id)}">Visitar</button></div>`;
    return `<h3>👥 Amigos</h3><div class="list">${visitList.friends.map(row).join('') || '<p class="tiny muted">Adicione amigos no 💬 chat para visitar as Fazendas deles.</p>'}</div>
      <h3 style="margin-top:10px">❤️ Fazendas mais curtidas</h3><div class="list">${visitList.top.filter(f => f.id !== me?.id).map(row).join('') || '<p class="tiny muted">Nenhuma ainda.</p>'}</div>
      <button class="btn" data-act="tab" data-t="farm" style="margin-top:8px">← Voltar</button>`;
  };

  const addView = () => {
    const inFarm = new Set(farm.slots.map(s => s.uid));
    const list = (me?.vault || []).filter(m => !inFarm.has(m.uid)).sort((a, b) => a.lvl - b.lvl);
    return `<p class="small muted">Escolha quem vai morar na Fazenda (${farm.slots.length}/${farm.slotsMax}). Eles ganham XP com o tempo até o Nv. ${FARM_MAX_LEVEL} — no bioma certo (★) rendem 50% a mais. Continuam na Coleção e podem jogar normalmente.</p>
      <div class="trade-mons" style="max-height:420px">${list.map(m => `<button type="button" class="trade-mon" data-act="place" data-uid="${esc(m.uid)}"><img src="${monSprite(m)}" alt=""><span>${esc(m.nick || getSpecies(m.sp)?.name)}${genderHtml(m.gender)}</span><span class="tiny">Nv.${m.lvl} · ${FARM_BIOMES[bestBiome(getSpecies(m.sp)?.types)].icon}</span></button>`).join('') || '<p class="muted">Todos já estão na Fazenda.</p>'}</div>
      <button class="btn" data-act="tab" data-t="farm" style="margin-top:8px">← Voltar</button>`;
  };

  const fmtT = ms => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`; };
  const EGG_COLOR = { 1: '#f39ac2', 2: '#5fd36a', 3: '#4c8ff0', 4: '#ef5050', 5: '#f6d34c' };
  const parentCard = (m, label) => m ? `<div class="dc-parent"><img src="${monSprite(m)}" alt=""><b>${esc(m.nick || getSpecies(m.sp)?.name)}${genderHtml(m.gender)}</b><span class="tiny muted">${label} · Nv.${m.lvl}</span>
      <span class="tiny">HP ${m.iv?.hp ?? '?'} · ATQ ${m.iv?.atk ?? '?'} · DEF ${m.iv ? defIvOf(m) : '?'} · VEL ${m.iv?.spe ?? '?'}</span>${m.nature ? `<span class="tiny muted">${esc(natureLabel(m.nature))}</span>` : ''}</div>`
    : `<div class="dc-parent empty">❔<span class="tiny muted">${label}</span></div>`;
  const crecheView = () => {
    const dc = farm.daycare;
    const eggs = farm.eggs || [];
    const chk = dc ? canBreed(dc.a, dc.b) : null;
    return `<p class="small muted">Coloque um <b>macho ♂ e uma fêmea ♀</b> da mesma família ou com um tipo em comum (ou um <b>Ditto</b> com qualquer um). A cada ${EGG_EVERY_H} h sai um ovo (até ${EGGS_PER_DAY} por dia). O filhote nasce na forma básica da mãe, herda 3 dos 4 potenciais dos pais e pode vir com <b>mutação</b> rara: ✨ shiny, 🌈 aura ou 💯 potencial máximo. Lendários e Míticos não fazem ovos.</p>
      <div class="dc-pair">${parentCard(chk?.mother || dc?.a, chk?.ditto ? 'Parceiro' : 'Mãe ♀')}<span class="dc-heart">💞</span>${parentCard(chk?.father || dc?.b, chk?.ditto ? 'Ditto' : 'Pai ♂')}</div>
      ${dc ? `<div class="center small">🥚 Próximo ovo em <b>${fmtT(dc.nextEggIn)}</b> · hoje ${farm.eggsToday}/${EGGS_PER_DAY}</div>
        <div class="row" style="gap:6px;justify-content:center;margin-top:6px;flex-wrap:wrap"><label class="tiny">Herdar natureza:</label>
          <select class="input sm" data-fm="nature"><option value="">Não herdar</option><option value="mother" ${dc.natureFrom === 'mother' ? 'selected' : ''}>da mãe/parceiro</option><option value="father" ${dc.natureFrom === 'father' ? 'selected' : ''}>do pai/Ditto</option></select>
          <span class="tiny muted">custa ${NATURE_COST.crystal} 💠 por ovo (você tem ${farm.res?.crystal || 0})</span></div>` : ''}
      <div class="row" style="gap:6px;justify-content:center;margin:8px 0"><button class="btn primary" data-act="dc-pick">💞 ${dc ? 'Trocar casal' : 'Escolher casal'}</button>${dc ? '<button class="btn" data-act="dc-clear">Separar</button>' : ''}</div>
      <h3>🐣 Incubadora (${eggs.length}/${farm.incubMax || INCUBATOR_MAX})</h3>
      <div class="dc-eggs">${eggs.map(e => `<div class="dc-egg ${e.ready ? 'ready' : ''}" style="--ec:${EGG_COLOR[e.tier] || '#fff'}"><div class="dc-eggic">🥚</div>
          <span class="tiny muted">de ${e.parentSp.map(x => esc(getSpecies(x)?.name || x)).join(' + ')}</span>
          ${e.ready ? `<button class="btn sm primary" data-act="hatch" data-id="${e.id}">🐣 Chocar!</button>` : `<span class="tiny">⏳ ${fmtT(e.readyAt - Date.now())}</span>`}</div>`).join('') || '<p class="tiny muted">Nenhum ovo ainda.</p>'}</div>
      <p class="tiny muted">Com a incubadora cheia, o casal para de botar até você chocar.</p>
      <button class="btn" data-act="tab" data-t="farm" style="margin-top:8px">← Voltar</button>`;
  };
  const pairView = () => {
    const list = (me?.vault || []).filter(m => !getSpecies(m.sp)?.legendary).sort((a, b) => (getSpecies(a.sp)?.name || '').localeCompare(getSpecies(b.sp)?.name || ''));
    const [a, b] = pair.map(u => (me?.vault || []).find(m => m.uid === u));
    const chk = a && b ? canBreed(a, b) : null;
    return `<p class="small">Escolha 2 Pokémon (${pair.length}/2). ${chk ? (chk.ok ? '<b style="color:#8ff0bd">✔ Combinam!</b>' : `<b style="color:#ff9b9e">✖ ${esc(chk.why)}</b>`) : ''}</p>
      <div class="trade-mons" style="max-height:380px">${list.map(m => `<button type="button" class="trade-mon ${pair.includes(m.uid) ? 'on' : ''}" data-act="dc-sel" data-uid="${esc(m.uid)}"><img src="${monSprite(m)}" alt=""><span>${esc(m.nick || getSpecies(m.sp)?.name)}${genderHtml(m.gender)}</span><span class="tiny">Nv.${m.lvl} · ${m.iv ? ivPercent(m) + '%' : ''}</span></button>`).join('')}</div>
      <div class="row" style="gap:6px;margin-top:8px"><button class="btn" data-act="tab" data-t="creche">← Voltar</button><button class="btn primary grow" data-act="dc-ok" ${chk?.ok ? '' : 'disabled'}>💞 Colocar na Creche</button></div>`;
  };

  const costChips = (cost, mult = 1) => Object.entries(cost).map(([k, q]) => {
    if (k === 'gold') return `<span class="ws-c ${(me?.gold || 0) >= q ? '' : 'miss'}">🪙${q}</span>`;
    const have = farm.res?.[k] || 0;
    return `<span class="ws-c ${have >= q * mult ? '' : 'miss'}" title="${RESOURCES[k].name}: você tem ${have}">${RESOURCES[k].icon}${q * mult}</span>`;
  }).join('');
  // 🖼️ ícone da receita/item: sprite da pasta items/ quando existir (Poké Balls, Doce Raro, TM...), senão o emoji
  const FARM_SPRITE = { candy: 'rare_candy' };
  const recipeItem = R => R.out.mega ? null : R.out.plate ? 'plate' : R.out.bag ? (Object.keys(R.out.bag).length === 1 ? Object.keys(R.out.bag)[0] : null) : R.out.farm ? FARM_SPRITE[Object.keys(R.out.farm)[0]] || null : null;
  const rIcon = (R, j) => itemIcon(j?.mega && MEGAS[j.mega] ? `megastones/${MEGAS[j.mega].stone}` : j?.ptype ? `plate_${j.ptype}` : recipeItem(R), R.icon, 'ws-ic');
  const outTxt = R => R.out.mega || R.out.plate ? '→ 🎒 Mochila' : R.out.bag ? Object.entries(R.out.bag).map(([, q]) => q > 1 ? `${q}×` : '').join('') + ' → 🎒 Mochila' : R.out.farm ? '→ itens da Fazenda' : '→ decoração exclusiva';
  let candyPick = false;
  // 💎 qual Megapedra fabricar: lista as Megas com fragmentos na Mochila
  const platePicker = () => `<div class="ws-mega"><select class="input sm" id="ws-plate">${TYPES.map(t => `<option value="${t}">${esc(TYPE_LABELS[t])}</option>`).join('')}</select></div>`;
  const megaPicker = R => {
    const bag = me?.stats?.bag || {};
    const opts = MEGA_KEYS.map(k => MEGAS[k]).map(m => ({ m, n: bag[fragItemId(m)] || 0 })).sort((a, b) => b.n - a.n);
    const have = opts.filter(o => o.n > 0);
    return `<div class="ws-mega"><select class="input sm" id="ws-mega">${(have.length ? have : opts).map(({ m, n }) => `<option value="${m.key}" ${n >= R.frags ? '' : ''}>${esc(m.stoneName)} (${esc(m.name)}) — ${n}/${R.frags} 💠</option>`).join('')}</select>
      ${have.length ? '' : '<div class="tiny muted">Você ainda não tem fragmentos. Eles caem em 💎 Mega Raids e em encontros com energia Mega.</div>'}</div>`;
  };
  const oficinaView = () => {
    const W = farm.workshop;
    const lv = W.level, nx = W.next;
    const free = W.benches - W.jobs.length;
    const items = Object.entries(W.items || {}).filter(([, n]) => n > 0);
    if (candyPick) {
      const list = (me?.vault || []).filter(m => m.lvl < 60).sort((a, b) => b.lvl - a.lvl);
      return `<p class="small">🍬 Escolha quem vai comer o Doce Raro (+1 nível, até o Nv. 60, o máximo):</p>
        <div class="trade-mons" style="max-height:380px">${list.map(m => `<button type="button" class="trade-mon" data-act="candy-go" data-uid="${esc(m.uid)}"><img src="${monSprite(m)}" alt=""><span>${esc(m.nick || getSpecies(m.sp)?.name)}${genderHtml(m.gender)}</span><span class="tiny">Nv.${m.lvl}</span></button>`).join('')}</div>
        <button class="btn" data-act="candy-cancel" style="margin-top:8px">← Voltar</button>`;
    }
    return `<div class="ws-art"><b>🔨 ${esc(lv.name)}</b> <span class="tiny muted">Nível de Artesão ${lv.lvl}${nx ? ` · ${W.axp}/${nx.xp} XP para ${esc(nx.name)}` : ' · máximo!'}</span>
        <div class="fm-bar small"><i style="width:${nx ? Math.min(100, ((W.axp - lv.xp) / (nx.xp - lv.xp)) * 100) : 100}%"></i></div></div>
      <h3>🪚 Bancadas (${W.jobs.length}/${W.benches})</h3>
      <div class="ws-jobs">${W.jobs.map(j => { const R = RECIPES[j.recipe]; return `<div class="ws-job ${j.ready ? 'ready' : ''}">${rIcon(R, j)}<b>${esc(j.mega && MEGAS[j.mega] ? MEGAS[j.mega].stoneName : j.ptype ? `Placa ${TYPE_LABELS[j.ptype] || ''}` : R.name)}</b>
          ${j.ready ? `<button class="btn sm primary" data-act="claim" data-id="${j.id}">✨ Pegar</button>` : `<span class="tiny">⏳ ${fmtT(j.done - Date.now())}</span><div class="fm-bar small"><i style="width:${Math.min(100, ((Date.now() - j.start) / (j.done - j.start)) * 100)}%"></i></div>`}</div>`; }).join('')}
        ${Array.from({ length: Math.max(0, free) }, () => '<div class="ws-job empty"><span class="tiny muted">Bancada livre</span></div>').join('')}</div>
      <p class="tiny muted">Mais bancadas no Nv. 4 e no Nv. 7 da Fazenda.</p>
      ${items.length || W.fert || W.incense ? `<h3>🎒 Itens da Fazenda</h3><div class="ws-items">${items.map(([k, n]) => `<div class="ws-item">${itemIcon(FARM_SPRITE[k], FARM_ITEMS[k].icon, 'ws-ic')}<b>${esc(FARM_ITEMS[k].name)} ×${n}</b><span class="tiny muted">${esc(FARM_ITEMS[k].desc)}</span><button class="btn sm green" data-act="use" data-k="${k}">Usar</button></div>`).join('')}
        ${W.fert ? `<div class="ws-item on"><span class="ws-ic">🧪</span><b>Fertilizante ativo</b><span class="tiny">acaba em ${fmtT(W.fert - Date.now())}</span></div>` : ''}${W.incense ? `<div class="ws-item on"><span class="ws-ic">🕯️</span><b>Incenso ativo</b><span class="tiny">${W.incense} ovo(s) com shiny ×3</span></div>` : ''}</div>` : ''}
      <h3>📋 Pedidos do dia</h3>
      <div class="ws-orders">${W.orders.map(o => `<div class="ws-order ${o.done ? 'done' : ''}"><div class="ws-cost">${costChips(o.need)}</div>
          <span class="tiny">🪙 ${o.gold} · +${o.xp} XP de Artesão${o.bonus ? ` · 🎁 ${Object.entries(o.bonus).map(([k, q]) => `${q}× ${k === 'tm' ? 'TM' : 'Ultra Ball'}`).join('')}` : ''}</span>
          ${o.done ? '<span class="chip green">✔ Entregue</span>' : `<button class="btn sm primary" data-act="order" data-i="${o.idx}">📦 Entregar</button>`}</div>`).join('')}</div>
      <p class="tiny muted">Novos pedidos todo dia à meia-noite.</p>
      <h3>📜 Receitas</h3>
      ${ARTISAN_LEVELS.map(L => `<div class="ws-tier ${lv.lvl >= L.lvl ? '' : 'locked'}"><div class="ws-tier-h">${lv.lvl >= L.lvl ? '' : '🔒 '}${esc(L.name)}${lv.lvl >= L.lvl ? '' : ` <span class="tiny muted">(${L.xp} XP de Artesão)</span>`}</div>
        <div class="ws-recipes">${Object.entries(RECIPES).filter(([, R]) => R.lvl === L.lvl).map(([id, R]) => {
          const weekDone = R.week && W.weekly[id];
          return `<div class="ws-rec">${rIcon(R)}<div class="grow"><b>${esc(R.name)}</b> <span class="tiny muted">${outTxt(R)}</span>
            ${R.desc ? `<div class="tiny muted">${esc(R.desc)}</div>` : ''}<div class="ws-cost">${costChips(R.cost)}<span class="ws-c t">⏱️${R.hours}h</span>${R.week ? '<span class="ws-c t">1×/semana</span>' : ''}</div></div>
            ${R.out.mega ? megaPicker(R) : ''}${R.out.plate ? platePicker() : ''}
            <button class="btn sm ${lv.lvl >= R.lvl && free > 0 && !weekDone ? 'primary' : ''}" data-act="craft" data-id="${id}" ${lv.lvl >= R.lvl && free > 0 && !weekDone ? '' : 'disabled'}>${weekDone ? 'Feita esta semana' : 'Fabricar'}</button></div>`;
        }).join('')}</div></div>`).join('')}
      <button class="btn" data-act="tab" data-t="farm" style="margin-top:8px">← Voltar</button>`;
  };

  function render() {
    if (!farm) return;
    const bodyHtml = head() + (tab === 'res' ? resView() : tab === 'visit' ? visitView() : tab === 'add' ? addView() : tab === 'creche' ? crecheView() : tab === 'pair' ? pairView() : tab === 'oficina' ? oficinaView() : tab === 'horta' ? hortaView() : tab === 'art' ? artView() : tab === 'exp' ? expView() : tab === 'home' ? homeView() : scene() + actions() + monPanel());
    setModalBody('farm', bodyHtml);
    bindHomeDrag();
  }

  const run = async (fn, okMsg) => { try { const r = await fn(); if (r?.farm) farm = r.farm; if (r?.profile) { me = r.profile; ctx?.onProfile?.(me); } render(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'good'); return r; } catch (e) { toast(e.message, 'bad'); } };

  // 🖌️ pintar no Ateliê (clicar e arrastar)
  let painting = false;
  const cellAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); return el?.dataset?.px !== undefined && el.closest('#art-grid') ? Number(el.dataset.px) : null; };
  ov.addEventListener('pointerdown', e => {
    const grid = e.target.closest('#art-grid');
    if (!grid || artSlot === null) return;
    const i = cellAt(e);
    if (i === null) return;
    e.preventDefault();
    artName = ov.querySelector('#art-name')?.value || artName;
    if (artTool === 'pick') { const c = artPx[i]; if (c !== '.') { artColor = parseInt(c, 16); artTool = 'pen'; render(); } return; }
    artSnap();
    if (artTool === 'fill') { artFill(i); render(); return; }
    painting = true;
    artPaintCell(i, grid);
    artRefreshPrev();
  });
  ov.addEventListener('pointermove', e => {
    if (!painting) return;
    const i = cellAt(e);
    if (i !== null) { artPaintCell(i, ov.querySelector('#art-grid')); artRefreshPrev(); }
  });
  const stopPaint = () => { if (painting) { painting = false; const u = ov.querySelector('.art-tools [data-act="art-undo"]'); if (u) u.disabled = false; } };
  ov.addEventListener('pointerup', stopPaint);
  ov.addEventListener('pointerleave', stopPaint);

  // ✏️ arrastar um enfeite (modo edição)
  let drag = null;
  ov.addEventListener('pointerdown', e => {
    if (!decorMode) return;
    const d = e.target.closest('.fm-decor');
    if (!d) return;
    const i = Number(d.dataset.di);
    drag = { i, x0: e.clientX, y0: e.clientY, el: d, sc: d.closest('.fm-scene'), started: false };
    e.preventDefault();
  });
  ov.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.started && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    if (!drag.started) { drag.started = true; snap(); decorSel = drag.i; drag.el.classList.add('dsel', 'dragging'); }
    const r = drag.sc.getBoundingClientRect();
    const vx = Math.max(1, Math.min(99, ((e.clientX - r.left) / r.width) * 100)), vy = Math.max(2, Math.min(98, ((e.clientY - r.top) / r.height) * 100));
    drag.el.style.left = vx + '%'; drag.el.style.top = vy + '%';
    const pos = toStore(vx, vy);
    decorDraft[drag.i].x = Math.round(pos.x * 10) / 10; decorDraft[drag.i].y = Math.round(pos.y * 10) / 10;
  });
  const endDrag = () => { if (!drag) return; if (drag.started) { dragMoved = true; drag = null; render(); } else drag = null; };
  ov.addEventListener('pointerup', endDrag);
  ov.addEventListener('pointercancel', endDrag);

  // colocar/remover decoração tocando na cena
  ov.addEventListener('click', e => {
    if (houseMode) {
      const sc = e.target.closest('.fm-scene');
      if (!sc) return;
      const r = sc.getBoundingClientRect();
      houseMode = false;
      const pos = toStore(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
      run(() => api('profile', { op: 'farm_house', x: pos.x, y: pos.y }), farm.companion || farm.hasCompanion ? '🏡 Casinha no lugar!' : '🏡 Casinha pronta — equipe um companheiro para morar nela.');
      return;
    }
    if (!decorMode) { // ✨ tocar num enfeite: efeitinho (só visual)
      const dd = e.target.closest('.fm-decor');
      if (dd) tapDecor(dd);
      return;
    }
    if (dragMoved) { dragMoved = false; return; }
    const d = e.target.closest('.fm-decor');
    if (d) { decorSel = Number(d.dataset.di); render(); return; }
    const sc = e.target.closest('.fm-scene');
    if (!sc) return;
    if (decorSel !== null) { decorSel = null; render(); return; } // toque fora: tira a seleção
    if (!decorPick) return;
    if (decorDraft.length >= (farm.decorMax || DECOR_MAX)) return toast(`Máximo de ${farm.decorMax || DECOR_MAX} decorações — compre mais espaço em 🏗️ Expansões.`, 'bad');
    const r = sc.getBoundingClientRect();
    const pos = toStore(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
    snap();
    decorDraft.push({ k: decorPick, x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10 });
    decorSel = decorDraft.length - 1;
    render();
  });
  ov.addEventListener('change', e => {
    if (e.target.dataset.fm === 'nature' && farm.daycare) return run(() => api('profile', { op: 'farm_daycare', a: farm.daycare.a.uid, b: farm.daycare.b.uid, natureFrom: e.target.value || null }));
    if (e.target.dataset.fm === 'biome' && sel) run(() => api('profile', { op: 'farm_place', uid: sel, biome: e.target.value }));
  });

  // 📏 v61: tamanho dos móveis (só neste aparelho) — sprites de tamanhos diferentes
  function hmK() { try { return Number(localStorage.getItem('pmhx_hm_k')) || 1; } catch { return 1; } }
  ov.addEventListener('input', e => { if (e.target.matches?.('[data-hmk]')) { try { localStorage.setItem('pmhx_hm_k', e.target.value); } catch { /* ok */ } ov.querySelector('.hm-room')?.style.setProperty('--hm-k', e.target.value); } });
  // 🧊 v61: geladeira — tudo que dá para comer/usar (cozinha, horta, Mochila)
  const openFridge = () => {
    const bag = me?.stats?.bag || {}, goods = farm?.garden?.goods || {};
    const meals = Object.entries(bag).filter(([id, n]) => n > 0 && MEAL_ITEMS[id]);
    const cons = Object.entries(bag).filter(([id, n]) => n > 0 && ['heal', 'revive', 'cure', 'candy', 'boost', 'ingredient', 'soup', 'meal'].includes(ALL_ITEMS[id]?.kind) && !MEAL_ITEMS[id]);
    const gd = Object.entries(goods).filter(([k, n]) => n > 0 && GOODS[k]);
    const row = (ic, name, n, desc = '') => `<div class="fr-it" title="${esc(desc)}"><span class="fr-ic">${ic}</span><b>${esc(name)}</b><span class="fr-n">×${n}</span>${desc ? `<span class="tiny muted">${esc(desc)}</span>` : ''}</div>`;
    openModal('fridge', '🧊 Geladeira', `<div class="fr-wrap">
      <h4>🍽️ Pratos prontos (Cozinha)</h4><div class="fr-grid">${meals.map(([id, n]) => row(MEAL_ITEMS[id].emoji, MEAL_ITEMS[id].name, n, MEAL_ITEMS[id].desc)).join('') || '<span class="tiny muted">Nenhum prato pronto. Cozinhe no 🍳 Fogão.</span>'}</div>
      <h4>🥕 Da horta e dos Pokémon</h4><div class="fr-grid">${gd.map(([k, n]) => row(GOODS[k].icon, GOODS[k].name, n)).join('') || '<span class="tiny muted">Vazio. Colha na horta e faça ❤️ Carinho nos Pokémon.</span>'}</div>
      <h4>🎒 Consumíveis da Mochila</h4><div class="fr-grid">${cons.map(([id, n]) => row(itemIcon(id, ALL_ITEMS[id].emoji || '🎁'), ALL_ITEMS[id].name, n, ALL_ITEMS[id].desc)).join('') || '<span class="tiny muted">Nenhum.</span>'}</div>
      <p class="tiny muted">Os pratos são levados para a partida na 🎒 Mochila (escolha antes de entrar).</p></div>`, { wide: true });
  };
  // 📺 v61: TV — ranking e música
  const openTv = () => {
    const ov2 = openModal('tv', '📺 TV', `<div class="col" style="gap:8px"><button class="btn primary" data-act="tv-rank">🏆 Ver o Ranking (Liga, Elos e pontos)</button>
      <button class="btn" data-act="tv-music">🎵 Escolher música para tocar no jogo</button><p class="tiny muted">A música continua tocando enquanto você joga.</p></div>`);
    bindActions(ov2, {
      'tv-rank': async () => { closeModal('tv'); const m = await import('./screens.js'); m.openRankingModal?.(me); },
      'tv-music': async () => { closeModal('tv'); (await import('./music.js')).openMusic(); }
    });
  };
  bindActions(ov, {
    pick: d => { if (decorMode || houseMode) return; houseSel = false; sel = sel === d.uid ? null : d.uid; render(); },
    house: () => { if (!farm.mine) return; houseMode = true; houseSel = false; sel = null; render(); },
    'house-info': () => { if (houseMode || decorMode) return; houseSel = !houseSel; sel = null; render(); },
    'house-del': () => run(async () => { const r = await api('profile', { op: 'farm_house', remove: true }); houseSel = false; return r; }),
    tab: async d => {
      if (d.t === 'home') { homeSub = 'room'; homeEdit = false; }
      tab = d.t; render();
      if (d.t === 'visit') {
        try {
          const [fr, top] = await Promise.all([api('feed', { op: 'friends' }).catch(() => ({ friends: [] })), api('profile', { op: 'farm_top' })]);
          visitList = { friends: fr.friends || [], top: top.top || [] };
        } catch (e) { visitList = { friends: [], top: [] }; }
        render();
      }
    },
    add: () => { tab = 'add'; render(); },
    place: d => run(async () => { const r = await api('profile', { op: 'farm_place', uid: d.uid }); tab = 'farm'; sel = d.uid; return r; }, '🌾 Chegou na Fazenda!'),
    remove: () => { if (confirm('Tirar da Fazenda? O XP e os recursos que ele juntou são coletados agora.')) run(async () => { const r = await api('profile', { op: 'farm_remove', uid: sel }); sel = null; return r; }); },
    feed: async () => { const u = sel; const r = await run(() => api('profile', { op: 'farm_feed', uid: u }), '🍓 Nhac! +felicidade +XP'); if (r) burst(['🍓', '💖'], [u]); },
    collect: async () => { const res = await run(() => api('profile', { op: 'farm_collect' }), r => {
      const res = Object.entries(r.collected?.res || {}).map(([k, n]) => `${RESOURCES[k].icon}${n}`).join(' ');
      return `✨ Coletado: +${r.collected?.xp || 0} XP${r.collected?.levels ? ` (${r.collected.levels} nível${r.collected.levels > 1 ? 'eis' : ''})` : ''} ${res}${(r.msgs || []).length ? ' · ' + r.msgs.join(' ') : ''}`;
    }); if (res) burst(Object.keys(res.collected?.res || {}).map(k => RESOURCES[k].icon).concat(['✨'])); },
    care: async () => { const r = await run(() => api('profile', { op: 'farm_care' }), r => `❤️ Carinho em ${r.cared} Pokémon!${r.bond ? ` ${r.companion} ajudou: +${r.bond} de laço 💞` : ''}${Object.keys(r.produced || {}).length ? ` Ganhou ${Object.entries(r.produced).map(([g, n]) => `${n}× ${GOODS[g].icon}`).join(' ')} para a cozinha!` : ''}`); if (r) burst(['💖', '💕', '💗']); },
    sell: d => run(() => api('profile', { op: 'farm_sell', res: d.k, qty: Number(d.q) }), r => `🪙 +${r.gold} ouro`),
    decor: () => { decorMode = true; decorDraft = (farm.decor || []).map(x => ({ ...x })); decorHist = []; decorSel = null; decorPick = ownedDecor()[0]?.[0] || null; sel = null; render(); },
    dflip: () => { if (decorSel === null) return; snap(); const d = decorDraft[decorSel]; d.f = d.f ? 0 : 1; render(); },
    dsize: x => { if (decorSel === null) return; snap(); const d = decorDraft[decorSel]; d.s = Math.max(0.6, Math.min(1.8, Math.round(((d.s || 1) + Number(x.v) * 0.2) * 10) / 10)); render(); },
    ddup: () => { if (decorSel === null || decorDraft.length >= (farm.decorMax || DECOR_MAX)) return; snap(); const d = decorDraft[decorSel]; decorDraft.push({ ...d, x: Math.min(97, d.x + 3), y: Math.min(95, d.y + 3) }); decorSel = decorDraft.length - 1; render(); },
    ddel: () => { if (decorSel === null) return; snap(); decorDraft.splice(decorSel, 1); decorSel = null; render(); },
    dunsel: () => { decorSel = null; render(); },
    dundo: () => { if (!decorHist.length) return; decorDraft = decorHist.pop(); decorSel = null; render(); },
    dclear: () => { if (!confirm('Guardar todas as decorações? (você pode colocar de novo depois)')) return; snap(); decorDraft = []; decorSel = null; render(); },
    dpick: d => { decorPick = d.k; render(); },
    expand: d => run(() => api('profile', { op: 'farm_expand', k: d.k }), r => r.message),
    'hm-sub': d => { homeSub = d.s || 'room'; homeEdit = false; render(); },
    'hm-edit': () => { const h = H(); homeDraft = (h.placed || []).map(x => ({ ...x })); homeDraft.wall = h.wall; homeDraft.floor = h.floor; homeDraft.pals = structuredClone(h.pals || {}); homeEdit = true; homeSel = null; homePick = Object.keys(h.owned || {}).find(f => homeOwnedLeft(f) > 0) || null; render(); },
    'hm-pick': d => { homePick = d.f; homeSel = null; render(); },
    'hm-cell': d => { if (!homeEdit || dragJustEnded()) return; if (homeSel !== null) { homeDraft[homeSel] = { ...homeDraft[homeSel], x: Number(d.x), y: Number(d.y) }; homeSel = null; render(); return; }
      if (!homePick || homeOwnedLeft(homePick) <= 0) return toast('Escolha um móvel (ou compre mais na 🛒 Loja).', 'bad');
      const isPart = !!FURNITURE[homePick]?.part, nSame = homeDraft.filter(x => !!FURNITURE[x.f]?.part === isPart).length;
      if (nSame >= (isPart ? PART_MAX : HOME_MAX)) return toast(isPart ? `Máximo de ${PART_MAX} pedaços de parede.` : `Máximo de ${HOME_MAX} móveis.`, 'bad');
      homeDraft.push({ f: homePick, x: Number(d.x), y: Number(d.y) }); if (homeOwnedLeft(homePick) <= 0) homePick = Object.keys(H().owned || {}).find(f => homeOwnedLeft(f) > 0) || null; render(); },
    'hm-f': d => { if (dragJustEnded()) return; if (!homeEdit && d.f === 'fridge') return openFridge(); if (!homeEdit && d.f === 'tv') return openTv();
      if (!homeEdit && FURNITURE[d.f]?.perk === 'cook') { homeSub = 'cook'; return render(); } // 🍳 v64d: tocar no Fogão abre a Cozinha
      if (!homeEdit) { const el = ov.querySelector(`.hm-f[data-i="${d.i}"]`); el?.classList.remove('tapped'); void el?.offsetWidth; el?.classList.add('tapped'); return; } homeSel = Number(d.i); render(); },
    'hm-size': d => { if (homeSel === null) return; const it = homeDraft[homeSel]; it.s = Math.round(Math.max(0.4, Math.min(3, (it.s || 1) + 0.1 * Number(d.d))) * 10) / 10; render(); },
    'hm-flip': () => { if (homeSel === null) return; homeDraft[homeSel].fl = homeDraft[homeSel].fl ? 0 : 1; render(); },
    'hm-del': () => { if (homeSel === null) return; homeDraft.splice(homeSel, 1); homeSel = null; render(); },
    'hm-unsel': () => { homeSel = null; render(); },
    'hm-cancel': () => { homeEdit = false; render(); },
    'hm-save': () => { const wall = ov.querySelector('#hm-wall')?.value, floor = ov.querySelector('#hm-floor')?.value;
      return run(async () => { const r = await api('profile', { op: 'home_place', placed: homeDraft.map(({ f, x, y, fl, s }) => ({ f, x, y, fl, s })), wall, floor, pals: homeDraft.pals || {} }); homeEdit = false; return r; }, r => r.message); },
    'hm-buy': d => run(() => api('profile', { op: 'home_buy', kind: d.k, id: d.id }), r => r.message),
    'hm-favset': d => run(async () => { const r = await api('profile', { op: 'home_fav', uid: d.index || d.i || null }); homeSub = 'room'; return r; }, r => r.message),
    'hm-talk': () => { if (dragJustEnded()) return; if (!farm.mine || H().talked || homeEdit) return; return run(() => api('profile', { op: 'home_talk' }), r => r.message).then(r => r && burst(['💞', '💬', '💖'])); },
    'hm-play': () => { if (dragJustEnded()) return; if (!farm.mine || H().played || homeEdit) return; return run(() => api('profile', { op: 'home_play' }), r => r.message); },
    'hm-cook': d => run(() => api('profile', { op: 'home_cook', meal: d.m, ptype: ov.querySelector('#hm-ctype')?.value }), r => r.message),
    'hm-claim': () => run(() => api('profile', { op: 'home_claim' }), r => r.message),
    'art-edit': d => { artOpen(Number(d.i)); tab = 'art'; render(); },
    'art-del': d => { if (!confirm('Apagar este desenho? Ele sai da decoração também.')) return; return run(() => api('profile', { op: 'farm_art_del', i: Number(d.i) }), r => r.message); },
    'art-color': d => { artColor = Number(d.c); if (artTool === 'erase' || artTool === 'pick') artTool = 'pen'; render(); },
    'art-tool': d => { artTool = d.t; render(); },
    'art-mirror': () => { artMirror = !artMirror; render(); },
    'art-undo': () => { if (artHist.length) { artPx = artHist.pop(); render(); } },
    'art-flip': () => { artSnap(); const rows = []; for (let y = 0; y < ART_SIZE; y++) rows.push(artPx.slice(y * ART_SIZE, (y + 1) * ART_SIZE).split('').reverse().join('')); artPx = rows.join(''); render(); },
    'art-clear': () => { artSnap(); artPx = blankArt(); render(); },
    'art-cancel': () => { artSlot = null; render(); },
    'art-save': () => {
      const n = ov.querySelector('#art-name')?.value || artName;
      if (!/[0-9a-f]/.test(artPx)) return toast('Desenhe alguma coisa primeiro 🙂', 'bad');
      const i = artSlot;
      return run(async () => { const r = await api('profile', { op: 'farm_art_save', i, art: { n, p: artPx } }); artSlot = null; return r; }, r => r.message);
    },
    plot: d => { plantAt = Number(d.i); render(); },
    'plot-x': () => { plantAt = null; render(); },
    plant: d => { const i = plantAt; plantAt = null; return run(() => api('profile', { op: 'farm_plant', plot: i, crop: d.k }), r => r.message); },
    water: () => run(() => api('profile', { op: 'farm_water' }), r => r.message),
    harvest: () => run(() => api('profile', { op: 'farm_harvest' }), r => r.message),
    build: d => run(() => api('profile', { op: 'farm_build', b: d.b }), r => r.message),
    bjob: d => run(() => api('profile', { op: 'farm_bjob', b: d.b, recipe: d.r }), r => r.message),
    bclaim: d => run(() => api('profile', { op: 'farm_bclaim', b: d.b }), r => r.message),
    dcancel: () => { decorMode = false; decorSel = null; render(); },
    dsave: () => run(async () => { const r = await api('profile', { op: 'farm_decor', decor: decorDraft }); decorMode = false; decorSel = null; return r; }, '🎨 Fazenda decorada!'),
    visit: d => { tab = 'farm'; sel = null; load(d.id).catch(e => toast(e.message, 'bad')); },
    home: () => { sel = null; load(null).catch(e => toast(e.message, 'bad')); },
    'dc-pick': () => { pair = farm.daycare ? [farm.daycare.a.uid, farm.daycare.b.uid] : []; tab = 'pair'; render(); },
    'dc-sel': d => { const i = pair.indexOf(d.uid); if (i >= 0) pair.splice(i, 1); else { if (pair.length >= 2) pair.shift(); pair.push(d.uid); } render(); },
    'dc-ok': () => run(async () => { const r = await api('profile', { op: 'farm_daycare', a: pair[0], b: pair[1], natureFrom: farm.daycare?.natureFrom || null }); tab = 'creche'; return r; }, '💞 Casal na Creche! O primeiro ovo sai em algumas horas.'),
    'dc-clear': () => run(() => api('profile', { op: 'farm_daycare_clear' })),
    hatch: d => run(async () => {
      const r = await api('profile', { op: 'farm_hatch', id: d.id });
      const b = r.baby, mut = b.mutations || [];
      openModal('hatch', '🐣 Nasceu!', `<div class="center dc-born">${statCard(b)}
        ${mut.length ? `<div class="dc-mut">🧬 <b>Mutação!</b><br>${mut.map(x => ({ shiny: '✨ SHINY!', aura: '🌈 Aura ' + esc(b.aura || ''), perfect: '💯 Potencial máximo!' })[x] || esc(MUTATION_LABEL[x] || x)).join('<br>')}</div>` : ''}
        <p class="small muted">Foi para a sua Coleção.</p></div>`);
      return r;
    }),
    craft: d => {
      const mega = RECIPES[d.id]?.out.mega ? document.getElementById('ws-mega')?.value : undefined;
      const ptype = RECIPES[d.id]?.out.plate ? document.getElementById('ws-plate')?.value : undefined;
      return run(() => api('profile', { op: 'farm_craft', recipe: d.id, mega, ptype }), `🔨 ${mega && MEGAS[mega] ? MEGAS[mega].stoneName : ptype ? `Placa ${TYPE_LABELS[ptype]}` : RECIPES[d.id].name} na bancada!`);
    },
    claim: d => run(() => api('profile', { op: 'farm_claim', id: d.id }), r => `✨ ${RECIPES[r.got.recipe].icon} ${RECIPES[r.got.recipe].name} pronto! +${RECIPES[r.got.recipe].xp} XP de Artesão`),
    order: d => run(() => api('profile', { op: 'farm_order', idx: Number(d.i) }), r => `📦 Pedido entregue! 🪙 +${r.reward.gold}${r.reward.bonus ? ' + 🎁 prêmio na Mochila' : ''}`),
    use: d => {
      if (d.k === 'candy') { candyPick = true; render(); return; }
      run(() => api('profile', { op: 'farm_use', item: d.k }), r => r.message);
    },
    'candy-go': d => run(async () => { const r = await api('profile', { op: 'farm_use', item: 'candy', uid: d.uid }); candyPick = false; return r; }, r => r.message),
    'candy-cancel': () => { candyPick = false; render(); },
    like: () => run(() => api('profile', { op: 'farm_like', userId: farm.owner.id }), '❤️ Curtido!'),
    help: () => run(() => api('profile', { op: 'farm_help', userId: farm.owner.id }), '🤝 Você cuidou dos Pokémon! +2 🍓')
  });

  try { await load(); } catch (e) { setModalBody('farm', `<p class="muted">${esc(e.message)}</p>`); }
}
