// Componentes visuais reaproveitados (cartas de Pokémon, chips de tipo, etc.).
import { getSpecies } from '../../shared/data/pokemon.js';
import { monView, xpToNext, MAX_LEVEL } from '../../shared/rules/monsters.js';
import { esc, hpClass } from './dom.js';
import { monSprite, typeLabel, typeColor, avatarUrl, PLAYER_COLORS } from '../config.js';

export function typeChips(types) {
  return types.map(t => `<span class="chip type" style="background:${typeColor(t)}">${esc(typeLabel(t))}</span>`).join(' ');
}

export function hpBar(hp, max, cls = '') {
  const r = max > 0 ? Math.max(0, hp) / max : 0;
  return `<div class="hp ${hpClass(r)} ${cls}"><i style="width:${(r * 100).toFixed(1)}%"></i></div>`;
}

export function monCard(mon, { index, lead = false, act = 'mon', extra = '' } = {}) {
  const v = monView(mon);
  const xpPct = v.lvl >= MAX_LEVEL ? 100 : Math.min(100, (mon.xp / xpToNext(v.lvl)) * 100);
  const cls = ['mon', v.hp <= 0 ? 'fainted' : '', v.shiny ? 'shiny' : '', lead ? 'lead' : '', mon.aura ? 'aura-' + mon.aura : ''].join(' ');
  return `<div class="${cls}" data-act="${act}" data-index="${index ?? ''}" data-uid="${esc(mon.uid)}" title="${esc(v.name)} — ${v.types.map(typeLabel).join('/')}">
    <span class="lv">Nv.${v.lvl}</span>${v.shiny ? '<span style="position:absolute;top:3px;right:6px">✨</span>' : ''}
    <img src="${monSprite(mon)}" alt="${esc(v.name)}" loading="lazy">
    <div class="nm">${esc(v.name)}</div>
    ${hpBar(v.hp, v.maxHp)}
    <div class="xp"><i style="width:${xpPct}%"></i></div>
    <div class="tiny muted">${Math.max(0, v.hp)}/${v.maxHp} HP</div>
    ${extra}
  </div>`;
}

export function speciesName(id) {
  return getSpecies(id)?.name || id;
}

export function playerColor(state, pid) {
  const i = state.players.findIndex(p => p.id === pid);
  return PLAYER_COLORS[(i < 0 ? 0 : i) % PLAYER_COLORS.length];
}

export function avatarImg(p, cls = 'avatar sm', color) {
  if (p?.cosmetic?.frame) cls += ' frame-' + p.cosmetic.frame;
  return `<img class="${cls}" src="${avatarUrl(p.avatar)}" alt="${esc(p.name)}" data-color="${color || '#3b2b1d'}" style="${color ? `border-color:${color}` : ''}">`;
}
