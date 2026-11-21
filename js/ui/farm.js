// 🌾 Fazenda Pokémon: cena com biomas, Pokémon andando soltos, coleta, carinho, Frutinhas, decoração e visitas.
import { getSpecies } from '../../shared/data/pokemon.js';
import { FARM_BIOMES, BIOME_IDS, RESOURCES, FARM_DECOR, DECOR_MAX, FARM_MAX_LEVEL, bestBiome, decorItemId } from '../../shared/data/farm.js';
import { genderHtml } from '../../shared/data/gender.js';
import { api } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { monSprite, avatarUrl, leaderUrl } from '../config.js';
import { canBreed, EGGS_PER_DAY, INCUBATOR_MAX, NATURE_COST, EGG_EVERY_H } from '../../shared/data/daycare.js';
import { statCard } from './common.js';
import { RECIPES, FARM_ITEMS, ARTISAN_LEVELS } from '../../shared/data/workshop.js';
import { natureLabel } from '../../shared/data/natures.js';

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
  let me = profile;
  const ov = openModal('farm', '🌾 Fazenda', '<span class="spinner"></span>', { wide: true });
  ov.querySelector('.modal').classList.add('fm-modal');

  const load = async (uid = userId) => { farm = (await api('profile', uid ? { op: 'farm_get', userId: uid } : { op: 'farm_get' })).farm; userId = farm.mine ? null : farm.owner.id; render(); };
  const ownedDecor = () => Object.entries(FARM_DECOR).filter(([k, d]) => d.price === 0 || (farm.ownedDecor || []).includes(k));

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
      ${decor.map((d, i) => { const v = toView(d.x, d.y); return `<span class="fm-decor" data-di="${i}" style="left:${v.x}%;top:${v.y}%;z-index:${Math.round(v.y)}">${FARM_DECOR[d.k]?.icon || ''}</span>`; }).join('')}
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
      ${farm.mine ? '<div class="row" style="gap:4px;margin-top:6px"><button class="btn sm" data-act="house">↔️ Mover</button><button class="btn sm red" data-act="house-del">Tirar casinha</button></div>' : ''}</div></div>`;
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
      <img class="avatar sm" src="${avatarUrl(farm.owner.avatar)}" alt=""><div class="grow"><b>${farm.mine ? 'Minha Fazenda' : `Fazenda de ${esc(farm.owner.name)}`}</b>
        <div class="tiny muted">Nv. ${farm.lvl} · ${farm.slots.length}/${farm.slotsMax} vagas · ❤️ ${farm.likes}</div>
        <div class="fm-bar small"><i style="width:${Math.min(100, (farm.xp / farm.xpNext) * 100)}%"></i></div></div>
      ${farm.mine ? `<div class="fm-res">${Object.entries(RESOURCES).map(([k, r]) => `<span title="${r.name}">${r.icon}${farm.res?.[k] || 0}</span>`).join('')}</div>` : ''}</div>`;

  const actions = () => {
    if (decorMode) {
      const list = ownedDecor();
      return `<div class="fm-decorbar"><span class="tiny muted">Escolha e toque na Fazenda para colocar (${decorDraft.length}/${DECOR_MAX}). Toque numa decoração para tirar.</span>
        <div class="fm-palette">${list.map(([k, d]) => `<button class="fm-dbtn ${decorPick === k ? 'on' : ''}" data-act="dpick" data-k="${k}" title="${esc(d.name)}">${d.icon}</button>`).join('')}</div>
        <div class="row" style="gap:6px"><button class="btn sm" data-act="dcancel">Cancelar</button><button class="btn sm primary" data-act="dsave">💾 Salvar decoração</button>
        <span class="tiny muted">Mais decorações na 💎 Loja (só visual).</span></div></div>`;
    }
    if (!farm.mine) return `<div class="row fm-actions"><button class="btn ${farm.likedToday ? '' : 'primary'}" data-act="like" ${farm.likedToday ? 'disabled' : ''}>❤️ ${farm.likedToday ? 'Curtido hoje' : 'Curtir'}</button>
        <button class="btn ${farm.helpedToday ? '' : 'green'}" data-act="help" ${farm.helpedToday ? 'disabled' : ''}>🤝 ${farm.helpedToday ? 'Já cuidou hoje' : 'Cuidar dos Pokémon (+2 🍓)'}</button>
        <button class="btn" data-act="home">🏠 Voltar para a minha</button></div>`;
    const p = farm.pending || { xp: 0, res: {} };
    const pend = [p.xp ? `+${p.xp} XP` : '', ...Object.entries(p.res).map(([k, n]) => `${RESOURCES[k].icon}${n}`)].filter(Boolean).join(' · ');
    return `<div class="row fm-actions">
      <button class="btn ${pend ? 'primary' : ''}" data-act="collect" ${pend ? '' : 'disabled'}>✨ Coletar${pend ? ` <span class="tiny">(${pend})</span>` : ''}</button>
      <button class="btn green" data-act="care">❤️ Carinho em todos</button>
      <button class="btn" data-act="add" ${farm.slots.length >= farm.slotsMax ? 'disabled' : ''}>➕ Colocar Pokémon</button>
      <button class="btn" data-act="decor">🎨 Decorar</button>
      <button class="btn" data-act="house">🏡 ${farm.house ? 'Mover casinha' : 'Casinha'}</button>
      <button class="btn ${(farm.eggs || []).some(e => e.ready) ? 'primary' : ''}" data-act="tab" data-t="creche">🥚 Creche${(farm.eggs || []).length ? ` (${farm.eggs.length})` : ''}</button>
      <button class="btn ${(farm.workshop?.jobs || []).some(j => j.ready) ? 'primary' : ''}" data-act="tab" data-t="oficina">🔨 Oficina</button>
      <button class="btn" data-act="tab" data-t="res">📦 Recursos</button>
      <button class="btn" data-act="tab" data-t="visit">👥 Visitar</button></div>`;
  };

  const resView = () => `<p class="small muted">Recursos que seus Pokémon produziram. Venda por ouro da conta (na próxima fase viram itens na Oficina).</p>
    <div class="fm-reslist">${Object.entries(RESOURCES).map(([k, r]) => `<div class="fm-resrow"><span class="fm-ri">${r.icon}</span><b>${r.name}</b><span class="grow tiny muted">${(farm.res?.[k] || 0)} guardados · 🪙 ${r.gold} cada</span>
      <button class="btn sm" data-act="sell" data-k="${k}" data-q="1" ${farm.res?.[k] ? '' : 'disabled'}>Vender 1</button><button class="btn sm" data-act="sell" data-k="${k}" data-q="999" ${farm.res?.[k] ? '' : 'disabled'}>Vender tudo</button></div>`).join('')}</div>
    <h3 style="margin-top:10px">📜 Visitas</h3><div class="list">${(farm.visits || []).map(v => `<div class="list-item small">${v.kind === 'like' ? '❤️' : '🤝'} <b>${esc(v.name)}</b> ${v.kind === 'like' ? 'curtiu sua Fazenda' : 'cuidou dos seus Pokémon'} <span class="tiny muted">${new Date(v.at).toLocaleString('pt-BR')}</span></div>`).join('') || '<p class="tiny muted">Ninguém visitou ainda. Chame os amigos!</p>'}</div>
    <button class="btn" data-act="tab" data-t="farm" style="margin-top:8px">← Voltar</button>`;

  const visitView = () => {
    if (!visitList) return '<span class="spinner"></span>';
    const row = f => `<div class="list-item row" style="gap:8px"><img class="avatar sm" src="${avatarUrl(f.avatar)}" alt=""><div class="grow"><b>${esc(f.name)}</b>${f.likes !== undefined ? `<div class="tiny muted">❤️ ${f.likes} · Nv. ${f.lvl} · ${f.mons} Pokémon</div>` : ''}</div><button class="btn sm primary" data-act="visit" data-id="${esc(f.id)}">Visitar</button></div>`;
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
      <span class="tiny">HP ${m.iv?.hp ?? '?'} · ATQ ${m.iv?.atk ?? '?'} · VEL ${m.iv?.spe ?? '?'}</span>${m.nature ? `<span class="tiny muted">${esc(natureLabel(m.nature))}</span>` : ''}</div>`
    : `<div class="dc-parent empty">❔<span class="tiny muted">${label}</span></div>`;
  const crecheView = () => {
    const dc = farm.daycare;
    const eggs = farm.eggs || [];
    const chk = dc ? canBreed(dc.a, dc.b) : null;
    return `<p class="small muted">Coloque um <b>macho ♂ e uma fêmea ♀</b> da mesma família ou com um tipo em comum (ou um <b>Ditto</b> com qualquer um). A cada ${EGG_EVERY_H} h sai um ovo (até ${EGGS_PER_DAY} por dia). O filhote nasce na forma básica da mãe, herda 2 dos 3 potenciais dos pais e pode vir com <b>mutação</b> rara: ✨ shiny, 🌈 aura ou 💯 potencial máximo. Lendários e Míticos não fazem ovos.</p>
      <div class="dc-pair">${parentCard(chk?.mother || dc?.a, chk?.ditto ? 'Parceiro' : 'Mãe ♀')}<span class="dc-heart">💞</span>${parentCard(chk?.father || dc?.b, chk?.ditto ? 'Ditto' : 'Pai ♂')}</div>
      ${dc ? `<div class="center small">🥚 Próximo ovo em <b>${fmtT(dc.nextEggIn)}</b> · hoje ${farm.eggsToday}/${EGGS_PER_DAY}</div>
        <div class="row" style="gap:6px;justify-content:center;margin-top:6px;flex-wrap:wrap"><label class="tiny">Herdar natureza:</label>
          <select class="input sm" data-fm="nature"><option value="">Não herdar</option><option value="mother" ${dc.natureFrom === 'mother' ? 'selected' : ''}>da mãe/parceiro</option><option value="father" ${dc.natureFrom === 'father' ? 'selected' : ''}>do pai/Ditto</option></select>
          <span class="tiny muted">custa ${NATURE_COST.crystal} 💠 por ovo (você tem ${farm.res?.crystal || 0})</span></div>` : ''}
      <div class="row" style="gap:6px;justify-content:center;margin:8px 0"><button class="btn primary" data-act="dc-pick">💞 ${dc ? 'Trocar casal' : 'Escolher casal'}</button>${dc ? '<button class="btn" data-act="dc-clear">Separar</button>' : ''}</div>
      <h3>🐣 Incubadora (${eggs.length}/${INCUBATOR_MAX})</h3>
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
      <div class="trade-mons" style="max-height:380px">${list.map(m => `<button type="button" class="trade-mon ${pair.includes(m.uid) ? 'on' : ''}" data-act="dc-sel" data-uid="${esc(m.uid)}"><img src="${monSprite(m)}" alt=""><span>${esc(m.nick || getSpecies(m.sp)?.name)}${genderHtml(m.gender)}</span><span class="tiny">Nv.${m.lvl} · ${m.iv ? Math.round(((m.iv.hp + m.iv.atk + m.iv.spe) / 93) * 100) + '%' : ''}</span></button>`).join('')}</div>
      <div class="row" style="gap:6px;margin-top:8px"><button class="btn" data-act="tab" data-t="creche">← Voltar</button><button class="btn primary grow" data-act="dc-ok" ${chk?.ok ? '' : 'disabled'}>💞 Colocar na Creche</button></div>`;
  };

  const costChips = (cost, mult = 1) => Object.entries(cost).map(([k, q]) => {
    if (k === 'gold') return `<span class="ws-c ${(me?.gold || 0) >= q ? '' : 'miss'}">🪙${q}</span>`;
    const have = farm.res?.[k] || 0;
    return `<span class="ws-c ${have >= q * mult ? '' : 'miss'}" title="${RESOURCES[k].name}: você tem ${have}">${RESOURCES[k].icon}${q * mult}</span>`;
  }).join('');
  const outTxt = R => R.out.bag ? Object.entries(R.out.bag).map(([, q]) => q > 1 ? `${q}×` : '').join('') + ' → 🎒 Mochila' : R.out.farm ? '→ itens da Fazenda' : '→ decoração exclusiva';
  let candyPick = false;
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
      <div class="ws-jobs">${W.jobs.map(j => { const R = RECIPES[j.recipe]; return `<div class="ws-job ${j.ready ? 'ready' : ''}"><span class="ws-ic">${R.icon}</span><b>${esc(R.name)}</b>
          ${j.ready ? `<button class="btn sm primary" data-act="claim" data-id="${j.id}">✨ Pegar</button>` : `<span class="tiny">⏳ ${fmtT(j.done - Date.now())}</span><div class="fm-bar small"><i style="width:${Math.min(100, ((Date.now() - j.start) / (j.done - j.start)) * 100)}%"></i></div>`}</div>`; }).join('')}
        ${Array.from({ length: Math.max(0, free) }, () => '<div class="ws-job empty"><span class="tiny muted">Bancada livre</span></div>').join('')}</div>
      <p class="tiny muted">Mais bancadas no Nv. 4 e no Nv. 7 da Fazenda.</p>
      ${items.length || W.fert || W.incense ? `<h3>🎒 Itens da Fazenda</h3><div class="ws-items">${items.map(([k, n]) => `<div class="ws-item"><span class="ws-ic">${FARM_ITEMS[k].icon}</span><b>${esc(FARM_ITEMS[k].name)} ×${n}</b><span class="tiny muted">${esc(FARM_ITEMS[k].desc)}</span><button class="btn sm green" data-act="use" data-k="${k}">Usar</button></div>`).join('')}
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
          return `<div class="ws-rec"><span class="ws-ic">${R.icon}</span><div class="grow"><b>${esc(R.name)}</b> <span class="tiny muted">${outTxt(R)}</span>
            ${R.desc ? `<div class="tiny muted">${esc(R.desc)}</div>` : ''}<div class="ws-cost">${costChips(R.cost)}<span class="ws-c t">⏱️${R.hours}h</span>${R.week ? '<span class="ws-c t">1×/semana</span>' : ''}</div></div>
            <button class="btn sm ${lv.lvl >= R.lvl && free > 0 && !weekDone ? 'primary' : ''}" data-act="craft" data-id="${id}" ${lv.lvl >= R.lvl && free > 0 && !weekDone ? '' : 'disabled'}>${weekDone ? 'Feita esta semana' : 'Fabricar'}</button></div>`;
        }).join('')}</div></div>`).join('')}
      <button class="btn" data-act="tab" data-t="farm" style="margin-top:8px">← Voltar</button>`;
  };

  function render() {
    if (!farm) return;
    const bodyHtml = head() + (tab === 'res' ? resView() : tab === 'visit' ? visitView() : tab === 'add' ? addView() : tab === 'creche' ? crecheView() : tab === 'pair' ? pairView() : tab === 'oficina' ? oficinaView() : scene() + actions() + monPanel());
    setModalBody('farm', bodyHtml);
  }

  const run = async (fn, okMsg) => { try { const r = await fn(); if (r?.farm) farm = r.farm; if (r?.profile) { me = r.profile; ctx?.onProfile?.(me); } render(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'good'); return r; } catch (e) { toast(e.message, 'bad'); } };

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
    if (!decorMode) return;
    const d = e.target.closest('.fm-decor');
    if (d) { decorDraft.splice(Number(d.dataset.di), 1); render(); return; }
    const sc = e.target.closest('.fm-scene');
    if (!sc || !decorPick) return;
    if (decorDraft.length >= DECOR_MAX) return toast(`Máximo de ${DECOR_MAX} decorações.`, 'bad');
    const r = sc.getBoundingClientRect();
    const pos = toStore(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
    decorDraft.push({ k: decorPick, x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10 });
    render();
  });
  ov.addEventListener('change', e => {
    if (e.target.dataset.fm === 'nature' && farm.daycare) return run(() => api('profile', { op: 'farm_daycare', a: farm.daycare.a.uid, b: farm.daycare.b.uid, natureFrom: e.target.value || null }));
    if (e.target.dataset.fm === 'biome' && sel) run(() => api('profile', { op: 'farm_place', uid: sel, biome: e.target.value }));
  });

  bindActions(ov, {
    pick: d => { if (decorMode || houseMode) return; houseSel = false; sel = sel === d.uid ? null : d.uid; render(); },
    house: () => { if (!farm.mine) return; houseMode = true; houseSel = false; sel = null; render(); },
    'house-info': () => { if (houseMode || decorMode) return; houseSel = !houseSel; sel = null; render(); },
    'house-del': () => run(async () => { const r = await api('profile', { op: 'farm_house', remove: true }); houseSel = false; return r; }),
    tab: async d => {
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
    care: async () => { const r = await run(() => api('profile', { op: 'farm_care' }), r => `❤️ Carinho em ${r.cared} Pokémon!${r.bond ? ` ${r.companion} ajudou: +${r.bond} de laço 💞` : ''}`); if (r) burst(['💖', '💕', '💗']); },
    sell: d => run(() => api('profile', { op: 'farm_sell', res: d.k, qty: Number(d.q) }), r => `🪙 +${r.gold} ouro`),
    decor: () => { decorMode = true; decorDraft = (farm.decor || []).map(x => ({ ...x })); decorPick = ownedDecor()[0]?.[0] || null; sel = null; render(); },
    dpick: d => { decorPick = d.k; render(); },
    dcancel: () => { decorMode = false; render(); },
    dsave: () => run(async () => { const r = await api('profile', { op: 'farm_decor', decor: decorDraft }); decorMode = false; return r; }, '🎨 Fazenda decorada!'),
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
        ${mut.length ? `<div class="dc-mut">${mut.map(x => ({ shiny: '✨ SHINY!', aura: '🌈 Mutação: aura ' + esc(b.aura || ''), perfect: '💯 Potencial máximo!' })[x]).join('<br>')}</div>` : ''}
        <p class="small muted">Foi para a sua Coleção.</p></div>`);
      return r;
    }),
    craft: d => run(() => api('profile', { op: 'farm_craft', recipe: d.id }), `🔨 ${RECIPES[d.id].name} na bancada!`),
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
