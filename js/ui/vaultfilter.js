// 🔎 Filtros da Coleção (busca por nome/apelido, tipo, tier, categoria e ordem).
// Filtra escondendo itens já desenhados (não redesenha: o campo de busca não perde o foco).
import { getSpecies } from '../../shared/data/pokemon.js';
import { TYPES, TYPE_LABELS } from '../../shared/rules/types.js';
import { ivPercent } from '../../shared/rules/monsters.js';
import { esc } from './dom.js';

const TIERS = [[1, '🌸 Rosa'], [2, '🟢 Verde'], [3, '🔵 Azul'], [4, '🔴 Vermelho'], [5, '🟡 Amarelo']];
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const state = new Map(); // lembra o filtro por lista enquanto a página estiver aberta

/** Atributos data-* para um item filtrável. */
export function vfAttrs(m, idx = 0) {
  const sp = getSpecies(m.sp) || { name: m.sp, types: [], tier: 1, dex: 0 };
  return `data-vf-item data-name="${esc(norm(`${sp.name} ${m.nick || ''} ${m.sp}`))}" data-types="${sp.types.join(' ')}" data-tier="${sp.legendary ? 5 : sp.tier}"
    data-legend="${sp.legendary && !sp.mythical ? 1 : 0}" data-myth="${sp.mythical ? 1 : 0}" data-ultra="${sp.ultra ? 1 : 0}" data-shiny="${m.shiny ? 1 : 0}" data-fav="${m.fav ? 1 : 0}" data-trust="${m.trust ? 1 : 0}"
    data-lvl="${m.lvl || 1}" data-pot="${ivPercent(m) ?? 0}" data-dex="${sp.dex || 0}" data-recent="${idx}" data-sname="${esc(norm(m.nick || sp.name))}"`;
}

/** Barra de filtros. key: identifica a lista (para lembrar o filtro). compact: versão menor (seleção de time). */
export function vfBar(key, { compact = false } = {}) {
  const f = state.get(key) || {};
  const opt = (v, l, cur) => `<option value="${v}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${l}</option>`;
  return `<div class="vf-bar ${compact ? 'compact' : ''}" data-vf-key="${esc(key)}">
    <input class="input" data-vf="q" placeholder="🔎 Buscar por nome ou apelido" value="${esc(f.q || '')}" autocomplete="off">
    <select class="input" data-vf="type">${opt('', 'Todos os tipos', f.type)}${TYPES.map(t => opt(t, TYPE_LABELS[t], f.type)).join('')}</select>
    <select class="input" data-vf="tier">${opt('', 'Todos os tiers', f.tier)}${TIERS.map(([v, l]) => opt(v, l, f.tier)).join('')}</select>
    <select class="input" data-vf="cat">${opt('', 'Tudo', f.cat)}${opt('legend', '⚡ Lendários', f.cat)}${opt('myth', '🌟 Míticos', f.cat)}${opt('ultra', '🌀 Ultracriaturas', f.cat)}${opt('shiny', '✨ Shinies', f.cat)}${opt('fav', '⭐ Favoritos', f.cat)}${opt('trust', '🤝 Confiança', f.cat)}</select>
    ${compact ? '' : `<select class="input" data-vf="sort">${opt('', 'Ordem: padrão', f.sort)}${opt('lvl', 'Maior nível', f.sort)}${opt('pot', 'Maior potencial', f.sort)}${opt('dex', 'Nº da Pokédex', f.sort)}${opt('name', 'Nome (A–Z)', f.sort)}${opt('recent', 'Mais recentes', f.sort)}</select>`}
    <span class="vf-count tiny muted"></span>
  </div>`;
}

/** Liga a barra dentro de `root` (aplica o filtro salvo e escuta mudanças). */
export function vfBind(root) {
  root.querySelectorAll('.vf-bar').forEach(bar => {
    if (bar.dataset.bound) { apply(bar); return; }
    bar.dataset.bound = '1';
    const on = () => {
      const f = {};
      bar.querySelectorAll('[data-vf]').forEach(el => { f[el.dataset.vf] = el.value; });
      state.set(bar.dataset.vfKey, f);
      apply(bar);
    };
    bar.addEventListener('input', on);
    bar.addEventListener('change', on);
    apply(bar);
  });
}

function apply(bar) {
  const f = state.get(bar.dataset.vfKey) || {};
  const scope = bar.parentElement;
  const items = [...scope.querySelectorAll('[data-vf-item]')];
  const q = norm(f.q).trim();
  let shown = 0;
  const keyOf = { lvl: el => -Number(el.dataset.lvl), pot: el => -Number(el.dataset.pot), dex: el => Number(el.dataset.dex), recent: el => -Number(el.dataset.recent) };
  const sorted = f.sort === 'name' ? [...items].sort((a, b) => a.dataset.sname.localeCompare(b.dataset.sname)) : keyOf[f.sort] ? [...items].sort((a, b) => keyOf[f.sort](a) - keyOf[f.sort](b)) : items;
  sorted.forEach((el, i) => { el.style.order = f.sort ? String(i) : ''; });
  for (const el of items) {
    const ok = (!q || el.dataset.name.includes(q))
      && (!f.type || el.dataset.types.split(' ').includes(f.type))
      && (!f.tier || el.dataset.tier === String(f.tier))
      && (!f.cat || el.dataset[f.cat] === '1');
    el.classList.toggle('vf-hide', !ok);
    if (ok) shown++;
  }
  const c = bar.querySelector('.vf-count');
  if (c) c.textContent = `${shown} de ${items.length}`;
}
