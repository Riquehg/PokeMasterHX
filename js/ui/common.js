// Componentes visuais reaproveitados (cartas de Pokémon, chips de tipo, etc.).
import { getSpecies } from '../../shared/data/pokemon.js';
import { monView, xpToNext, MAX_LEVEL, maxStats, ivPercent, IV_MAX } from '../../shared/rules/monsters.js';
import { monMoves } from '../../shared/data/moves.js';
import { NATURES } from '../../shared/data/natures.js';
import { TYPE_COLORS } from '../../shared/rules/types.js';
import { esc, hpClass } from './dom.js';
import { canUse, badgesNeeded } from '../../shared/rules/helpers.js';
import { natureLabel } from '../../shared/data/natures.js';
import { monSprite, typeLabel, typeColor, avatarUrl, PLAYER_COLORS } from '../config.js';

export function typeChips(types) {
  return types.map(t => `<span class="chip type" style="background:${typeColor(t)}">${esc(typeLabel(t))}</span>`).join(' ');
}

export function hpBar(hp, max, cls = '') {
  const r = max > 0 ? Math.max(0, hp) / max : 0;
  return `<div class="hp ${hpClass(r)} ${cls}"><i style="width:${(r * 100).toFixed(1)}%"></i></div>`;
}

export function monCard(mon, { index, lead = false, act = 'mon', extra = '', owner = null } = {}) {
  const v = monView(mon);
  const locked = owner && !canUse(owner, mon);
  const xpPct = v.lvl >= MAX_LEVEL ? 100 : Math.min(100, (mon.xp / xpToNext(v.lvl)) * 100);
  const cls = ['mon', v.hp <= 0 ? 'fainted' : '', v.shiny ? 'shiny' : '', lead ? 'lead' : '', mon.aura ? 'aura-' + mon.aura : '', locked ? 'locked-mon' : ''].join(' ');
  return `<div class="${cls}" data-act="${act}" data-index="${index ?? ''}" data-uid="${esc(mon.uid)}" title="${esc(v.name)} — ${v.types.map(typeLabel).join('/')}${mon.nature ? ' · ' + esc(natureLabel(mon.nature)) : ''}${locked ? ` · 🔒 precisa de ${badgesNeeded(mon)} insígnias para lutar` : ''}">
    <span class="lv">Nv.${v.lvl}</span>${v.shiny ? '<span style="position:absolute;top:3px;right:6px">✨</span>' : ''}
    <img src="${monSprite(mon)}" alt="${esc(v.name)}" loading="lazy">
    <div class="nm">${esc(v.name)}</div>
    ${hpBar(v.hp, v.maxHp)}
    <div class="xp"><i style="width:${xpPct}%"></i></div>
    <div class="tiny muted">${Math.max(0, v.hp)}/${v.maxHp} HP${ivPercent(mon) !== null ? ` · <span class="pk-stars-mini">${potentialStars(ivPercent(mon))}</span>` : ''}</div>
    ${locked ? `<div class="lock-tag">🔒 ${badgesNeeded(mon)} insígnias</div>` : ''}
    ${extra}
  </div>`;
}

const STAT_ROWS = [['hp', 'maxHp', 'HP'], ['atk', 'atk', 'ATQ'], ['spe', 'spe', 'VEL']];
const TIER_TXT = { 1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4', 5: 'LEND' };

/** Estrelas do potencial (IV): 0–5. */
export function potentialStars(pct) {
  if (pct === null || pct === undefined) return '';
  const n = pct >= 95 ? 5 : pct >= 80 ? 4 : pct >= 60 ? 3 : pct >= 40 ? 2 : pct >= 20 ? 1 : 0;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
const potentialLabel = pct => (pct >= 95 ? 'Perfeito' : pct >= 80 ? 'Excelente' : pct >= 60 ? 'Muito bom' : pct >= 40 ? 'Bom' : pct >= 20 ? 'Comum' : 'Fraco');

function moveBox(m, foeTypes) {
  const pwr = m.kind === 'dmg' || m.kind === 'drain' ? `${Math.round((m.power || 1) * 100)} PWR` : 'SUPORTE';
  return `<div class="pk-move" style="--tc:${TYPE_COLORS[m.type]}" title="${esc(m.desc)}">
    <div class="pk-move-name">${esc(m.name)}</div>
    <div class="pk-move-meta"><span class="pk-type" style="background:${typeColor(m.type)}">${esc(typeLabel(m.type))}</span><span class="pk-pwr">${pwr}</span>
      ${m.miss ? `<span class="pk-miss" title="Erra no dado ${m.miss === 1 ? '1' : '1 ou 2'}">🎲${m.miss === 1 ? '1' : '1-2'}✗</span>` : ''}</div></div>`;
}

/**
 * Card completo de status (estilo "card de coleção"): sprite, natureza, barras de HP/ATQ/VEL, potencial (IV), XP e os 2 golpes.
 * Funciona com Pokémon da partida e com entradas da Coleção.
 */
export function statCard(mon, { owner = null, act = '', index = '', extra = '', lead = false, showHp = true } = {}) {
  const v = monView(mon);
  const sp = getSpecies(mon.sp);
  const max = maxStats(mon.sp, v.lvl);
  const nat = NATURES[mon.nature];
  const pot = ivPercent(mon);
  const locked = owner && !canUse(owner, mon);
  const hp = mon.hp === undefined ? v.maxHp : Math.max(0, v.hp);
  const xpPct = v.lvl >= MAX_LEVEL ? 100 : Math.min(100, ((mon.xp || 0) / xpToNext(v.lvl)) * 100);
  const cls = ['pk-card', v.shiny ? 'shiny' : '', sp.legendary ? 'legend' : '', hp <= 0 && mon.hp !== undefined ? 'fainted' : '', lead ? 'lead' : '', locked ? 'locked' : '', mon.aura ? 'aura-' + mon.aura : ''].join(' ');
  const rows = STAT_ROWS.map(([k, key, label]) => {
    const val = v[key];
    const pct = Math.max(4, Math.min(100, (val / max[key]) * 100));
    const up = nat && nat[0] === k, down = nat && nat[1] === k;
    const iv = mon.iv?.[k];
    return `<div class="pk-stat ${up ? 'up' : down ? 'down' : ''}"><span class="pk-sl">${label}${up ? '▲' : down ? '▼' : ''}</span>
      <span class="pk-bar"><i style="width:${pct.toFixed(0)}%"></i></span><span class="pk-sv">${val}</span>
      <span class="pk-iv" title="Potencial (IV) de ${label}: ${iv ?? '?'} de ${IV_MAX}">${iv ?? '–'}</span></div>`;
  }).join('');
  return `<div class="${cls}" style="--tc:${typeColor(v.types[0])}" ${act ? `data-act="${act}" data-index="${index}" data-uid="${esc(mon.uid || '')}"` : ''}>
    ${v.shiny ? '<span class="pk-ribbon">★ Shiny</span>' : ''}<span class="pk-tier t${sp.tier}">${TIER_TXT[sp.tier]}</span>
    <div class="pk-art"><img src="${monSprite(mon)}" alt="${esc(v.name)}" loading="lazy"></div>
    <div class="pk-nature" title="${esc(natureLabel(mon.nature))}">❖ ${esc(mon.nature || 'Sem natureza')}</div>
    <div class="pk-name">${esc(v.name)}</div>
    <div class="pk-lv">Nv. ${v.lvl}</div>
    <div class="pk-types">${v.types.map(t => `<span class="pk-type" style="background:${typeColor(t)}">${esc(typeLabel(t))}</span>`).join('')}</div>
    ${showHp && mon.hp !== undefined ? `<div class="pk-hpline">${hpBar(hp, v.maxHp)}<span>${hp}/${v.maxHp}</span></div>` : ''}
    <div class="pk-stats">${rows}</div>
    <div class="pk-pot" title="Potencial total (média dos IVs)">${pot === null ? '<span class="muted">Potencial desconhecido</span>' : `<span class="pk-stars">${potentialStars(pot)}</span> ${potentialLabel(pot)} · ${pot}%`}</div>
    <div class="pk-xp"><i style="width:${xpPct.toFixed(0)}%"></i><span>${v.lvl >= MAX_LEVEL ? 'MÁX' : `${Math.floor(mon.xp || 0)}/${xpToNext(v.lvl)}`}</span></div>
    <div class="pk-moves">${monMoves(mon).map(m => moveBox(m)).join('')}</div>
    ${locked ? `<div class="lock-tag">🔒 precisa de ${badgesNeeded(mon)} insígnias</div>` : ''}
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
