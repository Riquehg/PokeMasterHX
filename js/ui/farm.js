// 🌾 Fazenda Pokémon: cena com biomas, Pokémon andando soltos, coleta, carinho, Frutinhas, decoração e visitas.
import { getSpecies } from '../../shared/data/pokemon.js';
import { FARM_BIOMES, BIOME_IDS, RESOURCES, FARM_DECOR, DECOR_MAX, FARM_MAX_LEVEL, bestBiome, decorItemId } from '../../shared/data/farm.js';
import { genderHtml } from '../../shared/data/gender.js';
import { api } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { monSprite, avatarUrl } from '../config.js';

const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
// zonas da cena (3 × 2), em %
const ZONES = { pasto: [0, 0], floresta: [1, 0], lago: [2, 0], caverna: [0, 1], vulcao: [1, 1], campo: [2, 1] };
const zoneBox = b => { const [c, r] = ZONES[b] || [0, 0]; return { x: c * 33.333, y: r * 50, w: 33.333, h: 50 }; };
const heart = h => (h >= 75 ? '💖' : h >= 45 ? '💛' : h >= 20 ? '🧡' : '💔');
const nameOf = s => s.nick || getSpecies(s.sp)?.name || s.sp;

export async function openFarm(ctx, profile, userId = null) {
  let farm = null, tab = 'farm', sel = null, decorMode = false, decorPick = null, decorDraft = null, visitList = null;
  let me = profile;
  const ov = openModal('farm', '🌾 Fazenda', '<span class="spinner"></span>', { wide: true });
  ov.querySelector('.modal').classList.add('fm-modal');

  const load = async (uid = userId) => { farm = (await api('profile', uid ? { op: 'farm_get', userId: uid } : { op: 'farm_get' })).farm; userId = farm.mine ? null : farm.owner.id; render(); };
  const ownedDecor = () => Object.entries(FARM_DECOR).filter(([k, d]) => d.price === 0 || (farm.ownedDecor || []).includes(k));

  const scene = () => {
    const decor = decorMode ? decorDraft : farm.decor;
    return `<div class="fm-scene ${decorMode ? 'decorating' : ''}">
      ${BIOME_IDS.map(b => { const z = zoneBox(b); return `<div class="fm-zone fm-${b}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%"><span class="fm-zlabel">${FARM_BIOMES[b].icon} ${FARM_BIOMES[b].name}</span></div>`; }).join('')}
      ${decor.map((d, i) => `<span class="fm-decor" data-di="${i}" style="left:${d.x}%;top:${d.y}%">${FARM_DECOR[d.k]?.icon || ''}</span>`).join('')}
      ${farm.slots.map(s => {
        const z = zoneBox(s.biome), h = hash(s.uid);
        const x = z.x + 5 + (h % 1000) / 1000 * (z.w - 10), y = z.y + 18 + ((h >> 10) % 1000) / 1000 * (z.h - 28);
        return `<button class="fm-mon ${sel === s.uid ? 'on' : ''}" data-act="pick" data-uid="${s.uid}" style="left:${x}%;top:${y}%;--d:${(h % 7) + 6}s;--dl:-${h % 5}s">
          <img src="${monSprite({ sp: s.sp, shiny: s.shiny })}" alt=""><span class="fm-h">${heart(s.happy)}</span>${farm.mine && s.pxp ? `<span class="fm-xp">+${s.pxp}</span>` : ''}</button>`;
      }).join('')}
      ${!farm.slots.length ? `<div class="fm-empty">${farm.mine ? 'Sua Fazenda está vazia. Toque em <b>➕ Colocar Pokémon</b>.' : 'Esta Fazenda ainda está vazia.'}</div>` : ''}
    </div>`;
  };

  const monPanel = () => {
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

  function render() {
    if (!farm) return;
    const bodyHtml = head() + (tab === 'res' ? resView() : tab === 'visit' ? visitView() : tab === 'add' ? addView() : scene() + actions() + monPanel());
    setModalBody('farm', bodyHtml);
  }

  const run = async (fn, okMsg) => { try { const r = await fn(); if (r?.farm) farm = r.farm; if (r?.profile) { me = r.profile; ctx?.onProfile?.(me); } render(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'good'); return r; } catch (e) { toast(e.message, 'bad'); } };

  // colocar/remover decoração tocando na cena
  ov.addEventListener('click', e => {
    if (!decorMode) return;
    const d = e.target.closest('.fm-decor');
    if (d) { decorDraft.splice(Number(d.dataset.di), 1); render(); return; }
    const sc = e.target.closest('.fm-scene');
    if (!sc || !decorPick) return;
    if (decorDraft.length >= DECOR_MAX) return toast(`Máximo de ${DECOR_MAX} decorações.`, 'bad');
    const r = sc.getBoundingClientRect();
    decorDraft.push({ k: decorPick, x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10 });
    render();
  });
  ov.addEventListener('change', e => {
    if (e.target.dataset.fm === 'biome' && sel) run(() => api('profile', { op: 'farm_place', uid: sel, biome: e.target.value }));
  });

  bindActions(ov, {
    pick: d => { if (decorMode) return; sel = sel === d.uid ? null : d.uid; render(); },
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
    feed: () => run(() => api('profile', { op: 'farm_feed', uid: sel }), '🍓 Nhac! +felicidade +XP'),
    collect: () => run(() => api('profile', { op: 'farm_collect' }), r => {
      const res = Object.entries(r.collected?.res || {}).map(([k, n]) => `${RESOURCES[k].icon}${n}`).join(' ');
      return `✨ Coletado: +${r.collected?.xp || 0} XP${r.collected?.levels ? ` (${r.collected.levels} nível${r.collected.levels > 1 ? 'eis' : ''})` : ''} ${res}${(r.msgs || []).length ? ' · ' + r.msgs.join(' ') : ''}`;
    }),
    care: () => run(() => api('profile', { op: 'farm_care' }), r => `❤️ Carinho em ${r.cared} Pokémon!`),
    sell: d => run(() => api('profile', { op: 'farm_sell', res: d.k, qty: Number(d.q) }), r => `🪙 +${r.gold} ouro`),
    decor: () => { decorMode = true; decorDraft = (farm.decor || []).map(x => ({ ...x })); decorPick = ownedDecor()[0]?.[0] || null; sel = null; render(); },
    dpick: d => { decorPick = d.k; render(); },
    dcancel: () => { decorMode = false; render(); },
    dsave: () => run(async () => { const r = await api('profile', { op: 'farm_decor', decor: decorDraft }); decorMode = false; return r; }, '🎨 Fazenda decorada!'),
    visit: d => { tab = 'farm'; sel = null; load(d.id).catch(e => toast(e.message, 'bad')); },
    home: () => { sel = null; load(null).catch(e => toast(e.message, 'bad')); },
    like: () => run(() => api('profile', { op: 'farm_like', userId: farm.owner.id }), '❤️ Curtido!'),
    help: () => run(() => api('profile', { op: 'farm_help', userId: farm.owner.id }), '🤝 Você cuidou dos Pokémon! +2 🍓')
  });

  try { await load(); } catch (e) { setModalBody('farm', `<p class="muted">${esc(e.message)}</p>`); }
}
