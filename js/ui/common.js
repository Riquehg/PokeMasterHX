import { genderOf, genderHtml } from '../../shared/data/gender.js';
import { MUTATION_LABEL } from '../../shared/data/daycare.js';
import { FIELD_SKILLS, speciesKnows } from '../../shared/data/fieldskills.js';
// Componentes visuais reaproveitados (cartas de Pokémon, chips de tipo, etc.).
import { getSpecies } from '../../shared/data/pokemon.js';
import { monView, statsOf, xpToNext, MAX_LEVEL, maxStats, normalStats, ivPercent, IV_MAX, defIvOf, defFactor } from '../../shared/rules/monsters.js';
import { monMoves, tmMovesFor as _tmMovesFor, moveIdsOf as _moveIds, MOVES as _MOVES } from '../../shared/data/moves.js';
import { NATURES } from '../../shared/data/natures.js';
import { TYPE_COLORS, against } from '../../shared/rules/types.js';
import { esc, hpClass } from './dom.js';
import { canUse, badgesNeeded } from '../../shared/rules/helpers.js';
import { natureLabel } from '../../shared/data/natures.js';
import { monSprite, typeLabel, typeColor, avatarUrl, PLAYER_COLORS, itemUrl, moveIcon, typeIcon } from '../config.js';
import { ITEMS } from '../../shared/data/items.js';
import { MEGAS } from '../../shared/data/megas.js';
import { ABILITIES, abilityOf } from '../../shared/data/battlegear.js';

export function typeChips(types) {
  return types.map(t => `<span class="chip type" style="background:${typeColor(t)}">${typeIcon(t)}${esc(typeLabel(t))}</span>`).join(' ');
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
  return `<div class="${cls}" data-act="${act}" data-index="${index ?? ''}" data-uid="${esc(mon.uid)}" title="${esc(v.name)} — ${v.types.map(typeLabel).join('/')}${mon.nature ? ' · ' + esc(natureLabel(mon.nature)) : ''}${locked ? ` · 🔒 precisa de ${badgesNeeded(mon)} insígnia${badgesNeeded(mon) > 1 ? 's' : ''} para lutar` : ''}">
    <span class="lv">Nv.${v.lvl}</span>${v.shiny ? '<span style="position:absolute;top:3px;right:6px">✨</span>' : ''}
    <img src="${monSprite(mon)}" alt="${esc(v.name)}" loading="lazy">
    <div class="nm">${esc(v.name)}${genderHtml(genderOf(mon, getSpecies(mon.sp)))}</div>
    ${hpBar(v.hp, v.maxHp)}
    <div class="xp"><i style="width:${xpPct}%"></i></div>
    <div class="tiny muted">${Math.max(0, v.hp)}/${v.maxHp} HP${ivPercent(mon) !== null ? ` · <span class="pk-stars-mini">${potentialStars(ivPercent(mon))}</span>` : ''}</div>
    ${locked ? `<div class="lock-tag">🔒 ${badgesNeeded(mon)} insígnia${badgesNeeded(mon) > 1 ? 's' : ''}</div>` : ''}
    ${mon.trust ? '<span class="trust-chip" title="Capturado na Bola da Confiança: obedece sem insígnias">🤝</span>' : ''}
    ${heldBadge(mon)}
    ${extra}
  </div>`;
}

const STAT_ROWS = [['hp', 'maxHp', 'HP'], ['atk', 'atk', 'ATQ'], ['def', 'def', 'DEF'], ['spe', 'spe', 'VEL']];
const TIER_TXT = { 1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4', 5: 'LEND' };

/** Estrelas do potencial (IV): 0–5. */
export function potentialStars(pct) {
  if (pct === null || pct === undefined) return '';
  const n = pct >= 95 ? 5 : pct >= 80 ? 4 : pct >= 60 ? 3 : pct >= 40 ? 2 : pct >= 20 ? 1 : 0;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
export const potentialLabel = pct => (pct >= 95 ? 'Perfeito' : pct >= 80 ? 'Excelente' : pct >= 60 ? 'Muito bom' : pct >= 40 ? 'Bom' : pct >= 20 ? 'Comum' : 'Fraco');

function moveBox(m, foeTypes) {
  const pwr = m.kind === 'dmg' || m.kind === 'drain' ? `${Math.round((m.power || 1) * 100)} PWR` : 'SUPORTE';
  return `<div class="pk-move" style="--tc:${TYPE_COLORS[m.type]}" title="${esc(m.desc)}">
    <div class="pk-move-name">${esc(m.name)}</div>
    <div class="pk-move-meta"><span class="pk-type" style="background:${typeColor(m.type)}">${esc(typeLabel(m.type))}</span><span class="pk-pwr">${pwr}</span>
      ${m.miss ? `<span class="pk-miss" title="Erra no dado ${m.miss === 1 ? '1' : `1 a ${m.miss}`}">🎲${m.miss === 1 ? '1' : `1-${m.miss}`}✗</span>` : ''}</div>
    ${moveFxChips(m)}</div>`;
}
const ST_IC = { burn: '🔥', freeze: '🧊', paralysis: '⚡', poison: '☠️', sleep: '💤' };
/** ⚔️ v44: efeitos reais do golpe em chips pequenos (prioridade, condição, hesitar, crítico alto, recuo, queda, recarga). */
export function moveFxChips(m) {
  const c = [];
  if (m.prio) c.push(['⚡', 'Prioridade: ataca primeiro']);
  if (m.st) c.push([`${ST_IC[m.st] || ''}${Math.round(m.stChance * 100)}%`, `Chance de causar condição`]);
  if (m.flinch) c.push([`😵${Math.round(m.flinch * 100)}%`, 'Chance de fazer o alvo hesitar (se atacar antes)']);
  if (m.highCrit) c.push(['🎯5-6', 'Crítico alto: crítico no dado 5 ou 6']);
  if (m.recoil) c.push([`↩️1/${m.recoil}`, `Recuo: perde 1/${m.recoil} do dano causado`]);
  if (m.selfDrop) c.push(['🔻ATQ', 'Depois do golpe, o próprio ataque cai']);
  if (m.recharge) c.push(['😮‍💨', 'Precisa descansar na rodada seguinte']);
  if (m.real?.pw) c.push([`${m.real.pw}`, `Poder oficial nos jogos: ${m.real.pw}${m.real.acc ? ` · precisão ${m.real.acc}%` : ' · nunca erra'}`]);
  return c.length ? `<div class="pk-move-fx">${c.map(([t, tip]) => `<span title="${tip}">${t}</span>`).join('')}</div>` : '';
}

/**
 * Card completo de status (estilo "card de coleção"): sprite, natureza, barras de HP/ATQ/DEF/VEL, potencial (IV), XP e os 2 golpes.
 * Funciona com Pokémon da partida e com entradas da Coleção.
 */
export function statCard(mon, { owner = null, act = '', index = '', extra = '', lead = false, showHp = true } = {}) {
  const v = monView(mon);
  const sp = getSpecies(mon.sp);
  const max = maxStats(mon.sp, v.lvl);
  const norm = normalStats(mon.sp, v.lvl); // 📊 o "normal" da espécie neste nível
  // a % sai do Nv.60 (números grandes: sem o arredondamento dos status pequenos de nível baixo)
  const big = statsOf({ ...mon, lvl: MAX_LEVEL }), bigN = normalStats(mon.sp, MAX_LEVEL);
  const diffs = [];
  const nat = NATURES[mon.nature];
  const pot = ivPercent(mon);
  const locked = owner && !canUse(owner, mon);
  const hp = mon.hp === undefined ? v.maxHp : Math.max(0, v.hp);
  const xpPct = v.lvl >= MAX_LEVEL ? 100 : Math.min(100, ((mon.xp || 0) / xpToNext(v.lvl)) * 100);
  const cls = ['pk-card', v.shiny ? 'shiny' : '', sp.legendary ? 'legend' : '', sp.mythical ? 'mythic' : '', sp.ultra ? 'ultra' : '', hp <= 0 && mon.hp !== undefined ? 'fainted' : '', lead ? 'lead' : '', locked ? 'locked' : '', mon.aura ? 'aura-' + mon.aura : ''].join(' ');
  const rows = STAT_ROWS.map(([k, key, label]) => {
    const val = v[key];
    // 🛡️ DEF: barra na escala geral (as paredes enchem a barra), as outras pela espécie/nível
    const scale = x => Math.max(4, Math.min(100, k === 'def' ? (x / 150) * 100 : (x / max[key]) * 100));
    const pct = scale(val);
    // 📊 comparativo: risquinho = normal da espécie no nível; número = quanto está acima/abaixo
    const nv = norm[key], d = bigN[key] ? Math.round(((big[key] - bigN[key]) / bigN[key]) * 100) : 0;
    diffs.push(d);
    const dCls = d >= 3 ? 'pos' : d <= -3 ? 'neg' : 'eq';
    const up = nat && nat[0] === k, down = nat && nat[1] === k;
    const iv = k === 'def' ? defIvOf(mon) : mon.iv?.[k];
    const tip = k === 'def' ? ` title="Defesa: recebe ${Math.round(defFactor(val) * 100)}% do dano (DEF 70 = 100%)"` : '';
    return `<div class="pk-stat k-${k} ${up ? 'up' : down ? 'down' : ''}"${tip}><span class="pk-sl">${label}${up ? '▲' : down ? '▼' : ''}</span>
      <span class="pk-bar" title="${label}: ${val} · normal da espécie no Nv.${v.lvl}: ${nv} (${d > 0 ? '+' : ''}${d}%)"><i style="width:${pct.toFixed(0)}%"></i><b class="pk-norm" style="left:${scale(nv).toFixed(1)}%"></b></span><span class="pk-sv">${val}</span>
      <span class="pk-dv ${dCls}" title="Comparado ao normal (${nv})">${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}%</span>
      <span class="pk-iv" title="Potencial (IV) de ${label}: ${iv ?? '?'} de ${IV_MAX}">${iv ?? '–'}</span></div>`;
  }).join('');
  const avgD = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
  const cmp = `<div class="pk-cmp ${avgD >= 3 ? 'pos' : avgD <= -3 ? 'neg' : 'eq'}" title="Média dos 4 status comparada a um ${esc(sp.name)} normal no Nv.${v.lvl} (potencial médio, natureza neutra). O risquinho branco em cada barra é o normal.">📊 ${avgD >= 3 ? `${avgD}% acima do normal` : avgD <= -3 ? `${-avgD}% abaixo do normal` : 'Na média da espécie'} <span class="tiny muted">(┃ = normal)</span></div>`;
  return `<div class="${cls}" style="--tc:${typeColor(v.types[0])}" ${act ? `data-act="${act}" data-index="${index}" data-uid="${esc(mon.uid || '')}"` : ''}>
    ${v.shiny ? '<span class="pk-ribbon">★ Shiny +15%</span>' : ''}<span class="pk-tier t${sp.tier}">${TIER_TXT[sp.tier]}</span>${sp.mythical ? '<span class="pk-cat mythic" title="Mítico: não aparece solto, só em aparições raras, Raids e prêmios">🌟 Mítico</span>' : sp.ultra ? '<span class="pk-cat ultra">🌀 Ultra</span>' : ''}
    <div class="pk-art"><img src="${monSprite(mon)}" alt="${esc(v.name)}" loading="lazy"></div>
    <div class="pk-nature" title="${esc(natureLabel(mon.nature))}">❖ ${esc(mon.nature || 'Sem natureza')}</div>
    <div class="pk-name">${esc(v.name)}${genderHtml(genderOf(mon, getSpecies(mon.sp)))}${mon.gx ? '<span class="gx-chip" title="Fator Gigantamax">🔴</span>' : ''}${getSpecies(mon.sp)?.corrupt ? '<span class="cr-chip" title="Lendário corrompido (não existe shiny)">☠️</span>' : ''}${mon.nick ? `<span class="pk-sp">${esc(v.species)}</span>` : ''}</div>
    <div class="pk-lv">Nv. ${v.lvl}</div>
    <div class="pk-types">${v.types.map(t => `<span class="pk-type" style="background:${typeColor(t)}">${esc(typeLabel(t))}</span>`).join('')}</div>
    ${showHp && mon.hp !== undefined ? `<div class="pk-hpline">${hpBar(hp, v.maxHp)}<span>${hp}/${v.maxHp}</span></div>` : ''}
    <div class="pk-stats">${rows}</div>${cmp}
    <div class="pk-pot" title="Potencial total (média dos IVs)">${pot === null ? '<span class="muted">Potencial desconhecido</span>' : `<span class="pk-stars">${potentialStars(pot)}</span> ${potentialLabel(pot)} · ${pot}%`}</div>
    <div class="pk-xp"><i style="width:${xpPct.toFixed(0)}%"></i><span>${v.lvl >= MAX_LEVEL ? 'MÁX' : `${Math.floor(mon.xp || 0)}/${xpToNext(v.lvl)}`}</span></div>
    <div class="pk-moves">${monMoves(mon).map(m => moveBox(m)).join('')}</div>
    ${locked ? `<div class="lock-tag">🔒 precisa de ${badgesNeeded(mon)} insígnia${badgesNeeded(mon) > 1 ? 's' : ''}</div>` : ''}
    ${mon.trust ? '<div class="tiny"><span class="trust-chip" title="Capturado na Bola da Confiança: obedece sem insígnias">🤝 Confiança</span></div>' : ''}
    ${abilityLine(mon)}
    ${heldLine(mon)}${(() => { const fs = Object.entries(FIELD_SKILLS).filter(([id]) => speciesKnows(mon.sp, id)); return fs.length ? `<div class="pk-field" title="Habilidade de campo: usada no tabuleiro antes de rolar o dado">🧭 ${fs.map(([, f]) => `${f.icon} ${esc(f.name)} <i>Nv.${f.minLvl}+</i>`).join(' · ')}</div>` : ''; })()}${mon.mutations?.length ? `<div class="pk-mut" title="Nasceu de um ovo da Creche com mutação">🧬 ${mon.mutations.map(x => MUTATION_LABEL[x] || x).join(' · ')}</div>` : mon.bred ? '<div class="pk-mut dim">🥚 Nascido na Creche</div>' : ''}
    ${extra}
  </div>`;
}

/** 🏅 Título do treinador (Loja ou conquista com efeito animado). quotes = com aspas. */
export function titleHtml(c, quotes = true, tag = 'div') {
  if (!c?.title) return '';
  const fx = c.titleFx ? ` tfx tfx-${esc(c.titleFx)}` : '';
  const col = c.titleColor ? ` style="--tc:${esc(c.titleColor)}"` : '';
  return `<${tag} class="player-title${fx}"${col}>${quotes && !c.titleFx ? `“${esc(c.title)}”` : esc(c.title)}</${tag}>`;
}

/** Ícone compacto de Pokémon (PC, listas longas): sprite, nome, nível, HP mínimo e selos. */
export function miniMon(mon, { act = '', index = '', sel = false, owner = null, extraCls = '' } = {}) {
  const v = monView(mon);
  const hp = mon.hp === undefined ? v.maxHp : Math.max(0, v.hp);
  const locked = owner && !canUse(owner, mon);
  return `<div class="mini-mon ${v.shiny ? 'shiny' : ''} ${hp <= 0 ? 'fainted' : ''} ${sel ? 'sel' : ''} ${locked ? 'locked' : ''} ${extraCls}" ${act ? `data-act="${act}" data-index="${index}"` : ''} data-uid="${esc(mon.uid || '')}" title="${esc(v.name)} Nv.${v.lvl} — ${v.types.map(typeLabel).join('/')}">
    <span class="mm-lv">${v.lvl}</span>${v.shiny ? '<span class="mm-sh">✨</span>' : ''}${mon.held ? `<img class="mm-held" src="${itemUrl(mon.held)}" alt="">` : ''}${locked ? '<span class="mm-lock">🔒</span>' : ''}
    <img src="${monSprite(mon)}" alt="" loading="lazy">
    <b>${esc(v.name)}</b>${hpBar(hp, v.maxHp, 'mm-hp')}
  </div>`;
}

/** 💎 item segurado (Megapedra): selo no canto + linha no card de status. */
export function heldBadge(mon) {
  const it = mon?.held && ITEMS[mon.held];
  if (!it) return '';
  const m = MEGAS[it.mega];
  return `<span class="held-badge" title="Segurando: ${esc(it.name)}${m ? ` — pode virar ${esc(m.name)}` : ''}"><img src="${itemUrl(mon.held)}" alt="">${m ? '💎' : ''}</span>`;
}
function heldLine(mon) {
  const it = mon?.held && ITEMS[mon.held];
  if (!it) return '';
  const m = MEGAS[it.mega];
  const active = mon.mega;
  return `<div class="pk-held" title="${esc(it.desc || '')}"><img src="${itemUrl(mon.held)}" alt=""><span>Segura <b>${esc(it.name)}</b>${m ? ` · ${active ? '💎 Mega Evoluído' : `pode virar <b>${esc(m.name)}</b>`}` : ''}</span></div>`;
}
/** ✨ Habilidade da espécie (v41). */
export function abilityLine(mon) {
  const A = ABILITIES[abilityOf(mon?.sp)];
  // v45: compacta — toque para ler o que faz (cabe melhor no celular)
  return A ? `<details class="pk-abil" title="${esc(A.desc)}"><summary>${A.icon} <b>${esc(A.name)}</b></summary><span class="tiny">${esc(A.desc)}</span></details>` : '';
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
  return `<img class="${cls}" src="${avatarUrl(p.avatar, p.cosmetic?.skin)}" alt="${esc(p.name)}" data-color="${color || '#3b2b1d'}" style="${color ? `border-color:${color}` : ''}">`;
}

// ------------------------------------------------ vantagem de tipo (batalha/raid)
/** Melhor multiplicador dos golpes de dano de `atk` contra os tipos de `def`. */
export function bestMult(atk, def) {
  const dt = getSpecies(def.sp).types;
  const mults = monMoves(atk).filter(m => m.kind === 'dmg' || m.kind === 'drain').map(m => against(m.type, dt));
  return mults.length ? Math.max(...mults) : 1;
}

/** {mine, theirs, edge}: edge 1 = vantagem, -1 = desvantagem, 0 = neutro. */
export function matchup(mine, foe) {
  const a = bestMult(mine, foe), b = bestMult(foe, mine);
  const edge = a >= 2 && b < 2 ? 1 : b >= 2 && a < 2 ? -1 : a > b ? 1 : b > a ? -1 : 0;
  return { mine: a, theirs: b, edge };
}

/** Selo ▲/▼ mostrado nos nossos Pokémon (equipe, troca, Raid). */
export function edgeBadge(mine, foe, big = false) {
  if (!mine || !foe) return '';
  const m = matchup(mine, foe);
  if (!m.edge) return `<span class="edge eq ${big ? 'big' : ''}" title="Sem vantagem de tipo (seu melhor golpe x${m.mine} · dele x${m.theirs})">＝</span>`;
  return m.edge > 0
    ? `<span class="edge up ${big ? 'big' : ''}" title="Vantagem de tipo: seu melhor golpe x${m.mine} · o dele x${m.theirs}">▲</span>`
    : `<span class="edge down ${big ? 'big' : ''}" title="Desvantagem de tipo: seu melhor golpe x${m.mine} · o dele x${m.theirs}">▼</span>`;
}

/** Ficha do Pokémon adversário selvagem/Raid: natureza, potencial (IV) e os golpes que ele usa. */
export function foeIntelHtml(mon) {
  const pot = ivPercent(mon);
  const moves = monMoves(mon);
  return `<div class="foe-intel">
    <span class="fi-nat" title="${esc(natureLabel(mon.nature))}">❖ ${esc(natureLabel(mon.nature))}</span>
    <span class="fi-pot" title="Potencial (IVs) HP ${mon.iv?.hp ?? '?'} · ATQ ${mon.iv?.atk ?? '?'} · DEF ${mon.iv ? defIvOf(mon) : '?'} · VEL ${mon.iv?.spe ?? '?'} (de ${IV_MAX})">${pot === null ? '?' : `<b class="pk-stars">${potentialStars(pot)}</b> ${potentialLabel(pot)} ${pot}%`}</span>
    <span class="fi-moves">${moves.map(m => `<span class="move-chip" style="--tc:${TYPE_COLORS[m.type]}">${moveIcon(m)}<b>${esc(m.name)}</b> <span class="tiny">${esc(typeLabel(m.type))}</span></span>`).join('')}</span>
  </div>`;
}

// ------------------------------------------------ 💿 TM: escolher o novo 2º golpe
let tmSlot = 2;
/** Qual golpe o TM vai substituir (1 = 2º golpe, 2 = 3º golpe). */
export const setTmSlot = n => { tmSlot = Number(n) === 1 ? 1 : 2; };
export function tmPickerHtml(mon, act = 'tm-move') {
  const ids = _moveIds(mon);
  const list = _tmMovesFor(mon.sp);
  const slot = tmSlot === 1 ? 1 : 2;
  const forget = [1, 2].map(i => `<button class="btn sm ${i === slot ? 'primary' : ''}" data-act="tm-slot" data-slot="${i}">Esquecer ${esc(_MOVES[ids[i]]?.name || '?')}</button>`).join(' ');
  return `<p class="small">⚔️ Cada Pokémon sabe 3 golpes. O 1º (rápido do tipo dele) fica; escolha qual esquecer e o golpe novo de <b>${esc(getSpecies(mon.sp)?.name)}</b>:</p>
    <div class="row wrap" style="gap:6px;margin:6px 0">${forget}</div>
    <div class="tm-grid">${list.map(m => `<button class="btn move-btn tm-opt ${ids.includes(m.id) ? 'on' : ''}" style="--tc:${TYPE_COLORS[m.type]}" data-act="${act}" data-move="${m.id}" data-slot="${slot}" ${ids.includes(m.id) ? 'disabled' : ''}>${m.owner ? '<b class="mv-own">★</b>' : ''}
      <span class="mv-name">${moveIcon(m)}${esc(m.name)}</span><span class="mv-meta">${esc(typeLabel(m.type))}${m.kind === 'dmg' || m.kind === 'drain' ? ` · poder ${Math.round((m.power || 1) * 100)}%` : ''}${m.miss ? ` · erra no 🎲${m.miss === 1 ? '1' : '1–2'}` : ''}</span><span class="mv-tag ${m.kind === 'dmg' ? '' : 'sup'}">${esc(m.desc)}</span></button>`).join('')}</div>`;
}
