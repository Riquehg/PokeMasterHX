// 🛠️ Editor de mapas do painel admin.
// Desenha casas e ligações em cima de um terreno gerado (o mesmo do jogo). O servidor valida de novo ao salvar.
//  ➕ Casa: clique no vazio cria uma casa (ligada à casa selecionada → dá para "desenhar" uma rota clicando em sequência).
//  🔗 Ligar: clique em duas casas para ligar/desligar.
//  ✋ Mover: arraste uma casa; clique para selecionar e editar no painel do lado.
import { esc, toast, openModal, closeModal, bindActions } from './dom.js';
import { api } from '../api.js';
import { BIOMES, GATES, validateCustomMap, mapFor, LEGEND_SPACES_MAX } from '../../shared/data/board.js';
import { drawTerrain, roadsSvg, BIOME_COLORS } from './terrain.js';

const TIER_COLORS = { 1: '#f39ac2', 2: '#5fd36a', 3: '#4c8ff0', 4: '#ef5050', 5: '#f6d34c' };
const TIER_NAMES = { 1: 'Rosa', 2: 'Verde', 3: 'Azul', 4: 'Vermelha', 5: 'Amarela' };
const GYM_NAMES = { boulder: 'Rocha', cascade: 'Cascata', thunder: 'Trovão', rainbow: 'Arco-íris', volcano: 'Vulcão', soul: 'Alma' };
const TYPE_ICON = { pokemon: '●', event: '?', city: '■' };

/** Mapa vazio ou cópia de um mapa do jogo (Kanto, Expedição/tema) para começar. */
export function templateMap(from = 'blank') {
  if (from === 'blank') {
    return { id: '', name: 'Meu mapa', desc: '', ratio: 2, start: 1, elite: 0, champion: 0, gyms: {}, legendSpaces: [],
      spaces: [{ id: 1, name: 'Cidade Inicial', x: 6, y: 50, type: 'city', tier: 1, biome: 'city', gate: null, links: [] }] };
  }
  const m = mapFor(from, 77);
  return { id: '', name: `${m.name} (cópia)`, desc: m.desc || '', ratio: m.ratio, start: m.start, elite: m.elite, champion: m.champion, gyms: { ...m.gyms },
    legendSpaces: [...(m.legendSpaces || [])], leagueGates: [...(m.leagueGates || [])],
    spaces: m.spaces.map(s => ({ id: s.id, name: s.name, x: s.x, y: s.y, type: s.type, tier: s.tier, biome: s.biome, gate: s.gate || null, links: s.links.slice() })) };
}

export function openMapEditor(initial, onSaved) {
  const map = structuredClone(initial);
  map.gyms ||= {};
  map.legendSpaces ||= [];
  const st = { tool: 'add', sel: map.spaces[0]?.id || null, linkFrom: null, brush: { type: 'pokemon', tier: 1, biome: 'grass' }, drag: null, dirty: false };
  const R = () => map.ratio || 2;
  const byId = id => map.spaces.find(s => s.id === id);
  const nextId = () => Math.max(0, ...map.spaces.map(s => s.id)) + 1;

  openModal('mapedit', '🛠️ Editor de mapa', '', { wide: true, closable: true, onClose: () => {} });
  const ov = document.getElementById('mapedit');
  ov.querySelector('.modal').classList.add('me-modal');
  const body = ov.querySelector('.body');

  const roleOf = s => {
    const r = [];
    if (map.start === s.id) r.push('🚩 Início');
    for (const [g, id] of Object.entries(map.gyms)) if (id === s.id) r.push(`🏟️ Ginásio ${GYM_NAMES[g]}`);
    if (map.elite === s.id) r.push('🏛️ Liga (Elite)');
    if (map.champion === s.id) r.push('👑 Arena Final');
    if (map.legendSpaces.includes(s.id)) r.push('⭐ Lendária');
    return r;
  };

  const stats = () => {
    const c = { pokemon: 0, event: 0, city: 0 }; const t = {};
    for (const s of map.spaces) { c[s.type]++; if (s.type === 'pokemon') t[s.tier] = (t[s.tier] || 0) + 1; }
    return `${map.spaces.length} casas · ${c.city} cidades · ${c.pokemon} Pokémon · ${c.event} eventos · Pokémon por cor: ${[1, 2, 3, 4, 5].map(k => `<span style="color:${TIER_COLORS[k]}">●${t[k] || 0}</span>`).join(' ')}`;
  };

  const panel = () => {
    const s = byId(st.sel);
    if (!s) return '<p class="small muted">Selecione uma casa (✋) ou crie uma (➕).</p>';
    const gymSel = Object.keys(GYM_NAMES).map(g => `<option value="${g}" ${map.gyms[g] === s.id ? 'selected' : ''}>${GYM_NAMES[g]}</option>`).join('');
    return `<div class="col" style="gap:6px">
      <b>Casa #${s.id}</b> <span class="tiny muted">${roleOf(s).join(' · ') || 'sem papel especial'}</span>
      <input class="input" data-sf="name" value="${esc(s.name || '')}" placeholder="Nome">
      <div class="row" style="gap:4px">${['pokemon', 'event', 'city'].map(t => `<button class="btn sm ${s.type === t ? 'primary' : ''}" data-act="s-type" data-v="${t}">${{ pokemon: '🌿 Pokémon', event: '❔ Evento', city: '🏙️ Cidade' }[t]}</button>`).join('')}</div>
      <div class="row" style="gap:4px">${[1, 2, 3, 4, 5].map(k => `<button class="btn sm me-tier ${s.tier === k ? 'on' : ''}" style="--tc:${TIER_COLORS[k]}" data-act="s-tier" data-v="${k}" title="${TIER_NAMES[k]}">${k}</button>`).join('')}</div>
      ${s.type === 'city' ? '' : `<label class="tiny">Ambiente</label><select class="input" data-sf="biome">${Object.entries(BIOMES).filter(([k]) => k !== 'city').map(([k, b]) => `<option value="${k}" ${s.biome === k ? 'selected' : ''}>${b.name}</option>`).join('')}</select>
      <label class="tiny">Habilidade para entrar</label><select class="input" data-sf="gate"><option value="">— livre —</option>${Object.entries(GATES).map(([k, g]) => `<option value="${k}" ${s.gate === k ? 'selected' : ''}>${g.icon} ${g.name}</option>`).join('')}</select>`}
      ${s.type === 'city' ? `<div class="row" style="gap:4px;flex-wrap:wrap">
        <button class="btn sm" data-act="role" data-r="start">🚩 Início</button>
        <button class="btn sm" data-act="role" data-r="elite">🏛️ Liga</button>
        <button class="btn sm" data-act="role" data-r="champion">👑 Arena Final</button></div>
        <div class="row" style="gap:4px"><select class="input grow" id="me-gym"><option value="">— ginásio —</option>${gymSel}</select><button class="btn sm" data-act="role" data-r="gym">🏟️ Pôr ginásio</button></div>` : ''}
      ${s.type === 'pokemon' ? `<button class="btn sm ${map.legendSpaces.includes(s.id) ? 'primary' : ''}" data-act="legend">⭐ Casa de encontro lendário (${map.legendSpaces.length}/${LEGEND_SPACES_MAX})</button>` : ''}
      <div class="tiny muted">Ligações: ${s.links.map(id => `#${id}`).join(', ') || 'nenhuma'}</div>
      <button class="btn sm red" data-act="del">🗑️ Apagar casa</button></div>`;
  };

  const svg = () => {
    const W = 100 * R();
    const sel = st.sel, lf = st.linkFrom;
    const dots = map.spaces.map(s => {
      const X = s.x * R(), Y = s.y, c = TIER_COLORS[s.tier] || '#fff';
      const ring = s.id === sel ? `<circle cx="${X}" cy="${Y}" r="3.1" fill="none" stroke="#fff" stroke-width=".6"/>` : s.id === lf ? `<circle cx="${X}" cy="${Y}" r="3.1" fill="none" stroke="#7df" stroke-width=".6" stroke-dasharray="1 .6"/>` : '';
      const legend = map.legendSpaces.includes(s.id) ? `<text x="${X}" y="${Y - 2.6}" font-size="2.6" text-anchor="middle">⭐</text>` : '';
      const role = roleOf(s).filter(r => !r.includes('Lendária')).map(r => r.split(' ')[0]).join('');
      const shape = s.type === 'city'
        ? `<rect x="${X - 1.9}" y="${Y - 1.9}" width="3.8" height="3.8" rx=".7" fill="${c}" stroke="#2a1d10" stroke-width=".45"/>`
        : `<circle cx="${X}" cy="${Y}" r="1.8" fill="${c}" stroke="#2a1d10" stroke-width=".45"/>${s.type === 'event' ? `<text x="${X}" y="${Y + .9}" font-size="2.4" text-anchor="middle" font-weight="700" fill="#2a1d10">?</text>` : ''}`;
      const gate = s.gate ? `<text x="${X + 2.2}" y="${Y + 2.8}" font-size="2.2">${GATES[s.gate]?.icon || ''}</text>` : '';
      return `<g class="me-sp" data-id="${s.id}">${ring}${shape}${legend}${gate}${role ? `<text x="${X}" y="${Y + 4.6}" font-size="2.4" text-anchor="middle">${role}</text>` : ''}</g>`;
    }).join('');
    return `<svg class="me-svg" viewBox="0 0 ${W} 100" preserveAspectRatio="none">${dots}</svg>`;
  };

  let terrainTimer = null;
  const paintTerrain = (now = false) => {
    clearTimeout(terrainTimer);
    const go = () => {
      const cv = body.querySelector('.me-terrain');
      if (!cv) return;
      cv.width = 1200; cv.height = Math.round(1200 / R());
      try { drawTerrain(cv, map, map.spaces); } catch { /* terreno é só enfeite */ }
      body.querySelector('.me-roads').innerHTML = roadsSvg(map, map.spaces);
    };
    if (now) go(); else terrainTimer = setTimeout(go, 220);
  };

  const render = () => {
    body.innerHTML = `
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">
        <input class="input" id="me-name" value="${esc(map.name)}" placeholder="Nome do mapa" style="width:200px">
        <input class="input grow" id="me-desc" value="${esc(map.desc || '')}" placeholder="Descrição (aparece na escolha do mapa)">
      </div>
      <div class="row" style="gap:4px;flex-wrap:wrap;margin-bottom:6px">
        ${[['add', '➕ Casa'], ['link', '🔗 Ligar'], ['move', '✋ Mover / editar']].map(([k, l]) => `<button class="btn sm ${st.tool === k ? 'primary' : ''}" data-act="tool" data-t="${k}">${l}</button>`).join('')}
        <span class="tiny muted" style="margin-left:6px">Nova casa:</span>
        <select class="input sm" id="me-btype">${['pokemon', 'event', 'city'].map(t => `<option value="${t}" ${st.brush.type === t ? 'selected' : ''}>${{ pokemon: '🌿 Pokémon', event: '❔ Evento', city: '🏙️ Cidade' }[t]}</option>`).join('')}</select>
        <select class="input sm" id="me-btier">${[1, 2, 3, 4, 5].map(k => `<option value="${k}" ${st.brush.tier === k ? 'selected' : ''}>${TIER_NAMES[k]}</option>`).join('')}</select>
        <select class="input sm" id="me-bbiome">${Object.entries(BIOMES).filter(([k]) => k !== 'city').map(([k, b]) => `<option value="${k}" ${st.brush.biome === k ? 'selected' : ''}>${b.name}</option>`).join('')}</select>
      </div>
      <div class="me-wrap">
        <div class="me-stage" style="aspect-ratio:${R()}">
          <canvas class="me-terrain"></canvas><div class="me-roads"></div>${svg()}
        </div>
        <div class="me-side card">${panel()}</div>
      </div>
      <div class="tiny muted" id="me-stats" style="margin:6px 0">${stats()}</div>
      <div class="tiny muted">Precisa ter: 1 início, 6 ginásios em cidades diferentes, Liga e Arena Final (cidades) e tudo ligado ao início. Só ${LEGEND_SPACES_MAX} casas de Pokémon ficam Amarelas (lendárias): marque com ⭐ ou o jogo escolhe as 2 mais longe do início. A cor da casa define o nível dos Pokémon (Rosa fraco → Vermelha forte).</div>
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn" data-act="check">✅ Verificar</button>
        <button class="btn" data-act="save" data-pub="0">💾 Salvar rascunho</button>
        <button class="btn primary" data-act="save" data-pub="1">🚀 Salvar e publicar</button>
      </div>`;
    paintTerrain(true);
    wireStage();
  };
  const refresh = () => { // redesenha sem perder o foco dos campos de cima
    const stage = body.querySelector('.me-stage');
    stage.querySelector('.me-svg').outerHTML = svg();
    body.querySelector('.me-side').innerHTML = panel();
    body.querySelector('#me-stats').innerHTML = stats();
    paintTerrain();
    wireStage();
  };

  const toPct = e => {
    const r = body.querySelector('.me-stage').getBoundingClientRect();
    return { x: Math.max(1.5, Math.min(98.5, ((e.clientX - r.left) / r.width) * 100)), y: Math.max(3, Math.min(97, ((e.clientY - r.top) / r.height) * 100)) };
  };
  const toggleLink = (a, b) => {
    if (!a || !b || a === b) return;
    const A = byId(a), B = byId(b);
    if (A.links.includes(b)) { A.links = A.links.filter(x => x !== b); B.links = B.links.filter(x => x !== a); }
    else { A.links.push(b); B.links.push(a); }
    st.dirty = true;
  };
  function wireStage() {
    const sv = body.querySelector('.me-svg');
    sv.onpointerdown = e => {
      const g = e.target.closest('.me-sp');
      const id = g ? Number(g.dataset.id) : null;
      if (st.tool === 'add') {
        if (id) { st.sel = id; return refresh(); }
        const p = toPct(e);
        const s = { id: nextId(), name: null, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, type: st.brush.type, tier: st.brush.tier,
          biome: st.brush.type === 'city' ? 'city' : st.brush.biome, gate: null, links: [] };
        if (s.type === 'city') s.name = `Cidade ${s.id}`;
        map.spaces.push(s);
        if (st.sel && byId(st.sel)) toggleLink(st.sel, s.id);
        st.sel = s.id; st.dirty = true;
        return refresh();
      }
      if (st.tool === 'link') {
        if (!id) { st.linkFrom = null; return refresh(); }
        if (!st.linkFrom) { st.linkFrom = id; st.sel = id; return refresh(); }
        toggleLink(st.linkFrom, id);
        st.linkFrom = id; st.sel = id; // continua ligando a partir da última
        return refresh();
      }
      // mover / editar
      if (!id) return;
      st.sel = id;
      st.drag = { id, moved: false };
      sv.setPointerCapture(e.pointerId);
      refresh();
    };
    sv.onpointermove = e => {
      if (!st.drag) return;
      const p = toPct(e), s = byId(st.drag.id);
      s.x = Math.round(p.x * 10) / 10; s.y = Math.round(p.y * 10) / 10;
      st.drag.moved = true; st.dirty = true;
      const g = body.querySelector(`.me-svg`);
      g.outerHTML = svg();
      wireStage();
    };
    sv.onpointerup = () => { if (st.drag?.moved) paintTerrain(); st.drag = null; };
  }

  const sel = () => byId(st.sel);
  body.addEventListener('change', e => {
    const f = e.target.dataset.sf;
    if (e.target.id === 'me-btype') st.brush.type = e.target.value;
    else if (e.target.id === 'me-btier') st.brush.tier = Number(e.target.value);
    else if (e.target.id === 'me-bbiome') st.brush.biome = e.target.value;
    else if (e.target.id === 'me-name') map.name = e.target.value;
    else if (e.target.id === 'me-desc') map.desc = e.target.value;
    else if (f && sel()) { sel()[f] = e.target.value || null; st.dirty = true; refresh(); }
  });
  const unsetRoles = id => {
    for (const g of Object.keys(map.gyms)) if (map.gyms[g] === id) delete map.gyms[g];
    if (map.start === id) map.start = 0;
    if (map.elite === id) map.elite = 0;
    if (map.champion === id) map.champion = 0;
  };
  const collect = () => { map.name = body.querySelector('#me-name').value.trim() || 'Mapa'; map.desc = body.querySelector('#me-desc').value.trim(); };

  bindActions(body, {
    tool: d => { st.tool = d.t; st.linkFrom = null; render(); },
    's-type': d => { const s = sel(); if (!s) return; s.type = d.v; if (d.v === 'city') { s.biome = 'city'; s.gate = null; s.name ||= `Cidade ${s.id}`; map.legendSpaces = map.legendSpaces.filter(x => x !== s.id); } else { if (s.biome === 'city') s.biome = st.brush.biome; unsetRoles(s.id); } st.dirty = true; refresh(); },
    's-tier': d => { const s = sel(); if (s) { s.tier = Number(d.v); st.dirty = true; refresh(); } },
    role: d => {
      const s = sel(); if (!s || s.type !== 'city') return;
      if (d.r === 'gym') {
        const g = body.querySelector('#me-gym').value;
        if (!g) return toast('Escolha qual ginásio.', 'bad');
        unsetRoles(s.id); map.gyms[g] = s.id;
      } else { unsetRoles(s.id); map[d.r] = s.id; }
      st.dirty = true; refresh();
    },
    legend: () => {
      const s = sel(); if (!s) return;
      if (map.legendSpaces.includes(s.id)) map.legendSpaces = map.legendSpaces.filter(x => x !== s.id);
      else { if (map.legendSpaces.length >= LEGEND_SPACES_MAX) return toast(`Só ${LEGEND_SPACES_MAX} casas lendárias por mapa.`, 'bad'); map.legendSpaces.push(s.id); s.tier = 5; }
      st.dirty = true; refresh();
    },
    del: () => {
      const s = sel(); if (!s) return;
      if (map.spaces.length <= 1) return;
      unsetRoles(s.id);
      map.legendSpaces = map.legendSpaces.filter(x => x !== s.id);
      map.spaces = map.spaces.filter(x => x.id !== s.id);
      for (const o of map.spaces) o.links = o.links.filter(x => x !== s.id);
      st.sel = s.links[0] || map.spaces[0].id; st.dirty = true;
      refresh();
    },
    check: () => {
      collect();
      try { const m = validateCustomMap({ ...map, id: map.id || 'teste' }); toast(`Tudo certo! ${m.spaces.length} casas, Amarelas: ${m.legendSpaces.map(id => '#' + id).join(', ')}.`, 'good'); }
      catch (e) { toast(e.message, 'bad'); }
    },
    save: async (d, el) => {
      collect();
      if (!map.id) {
        const id = (prompt('Código do mapa (letras e números, sem espaço). Ex.: ilhas2', map.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 20)) || '').trim();
        if (!id) return;
        map.id = id;
      }
      try { validateCustomMap({ ...map, id: map.id }); } catch (e) { return toast(e.message, 'bad'); }
      el.disabled = true;
      try {
        const r = await api('admin', { op: 'save_map', map: { ...map, id: String(map.id).replace(/^custom:/, '') }, published: d.pub === '1' });
        map.id = r.map.id.replace(/^custom:/, '');
        st.dirty = false;
        toast(d.pub === '1' ? 'Mapa publicado! Já aparece na criação de salas (recarregue o jogo).' : 'Rascunho salvo.', 'good');
        onSaved && onSaved(r.maps);
      } catch (e) { toast(e.message, 'bad'); }
      el.disabled = false;
    }
  });
  window.addEventListener('keydown', function onKey(e) {
    if (!document.getElementById('mapedit')) return window.removeEventListener('keydown', onKey);
    if ((e.key === 'Delete' || e.key === 'Backspace') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); body.querySelector('[data-act=del]')?.click(); }
  });
  render();
}

export { BIOME_COLORS };
export const closeMapEditor = () => closeModal('mapedit');
