// 📖 v45 — ficha completa da Pokédex: arte normal/shiny, status base, habilidade (passiva), fraquezas,
// linha evolutiva clicável, golpes com efeitos reais, Megas e o que você tem na Coleção.
import { SPECIES_LIST, getSpecies } from '../../shared/data/pokemon.js';
import { megaBySpecies } from '../../shared/data/megas.js';
import { movesOf, possibleSecondMoves, ROLE_LABELS } from '../../shared/data/moves.js';
import { ABILITIES, abilityOf } from '../../shared/data/battlegear.js';
import { baseDefOf, defFactor } from '../../shared/rules/monsters.js';
import { against, TYPES, TYPE_COLORS } from '../../shared/rules/types.js';
import { STATUS } from '../../shared/rules/battle.js';
import { esc } from './dom.js';
import { monSprite, typeLabel } from '../config.js';
import { typeChips, moveFxChips } from './common.js';

let REF = null;
const refs = () => (REF ||= {
  hp: Math.max(...SPECIES_LIST.map(s => s.hp || 0)),
  str: Math.max(...SPECIES_LIST.map(s => s.str || 0)),
  spe: Math.max(...SPECIES_LIST.map(s => s.speMult || 1))
});

const bar = (label, val, pct, color, tip = '') => `<div class="dx-stat" title="${esc(tip)}"><span class="dx-sl">${label}</span>
  <span class="dx-bar"><i style="width:${Math.max(4, Math.min(100, pct))}%;background:${color}"></i></span><b>${val}</b></div>`;

/** Fraquezas e resistências (com imunidade por habilidade). */
function matchups(sp) {
  const ab = ABILITIES[abilityOf(sp.id)];
  const g = { 4: [], 2: [], 0.5: [], 0.25: [], 0: [] };
  for (const t of TYPES) {
    let m = against(t, sp.types);
    let viaAb = false;
    if (ab && (ab.immune === t || ab.absorb === t) && m !== 0) { m = 0; viaAb = true; }
    if (m in g) g[m].push({ t, viaAb });
  }
  const row = (label, list, cls) => list.length ? `<div class="dx-mu ${cls}"><span class="dx-mul">${label}</span>${list.map(({ t, viaAb }) => `<span class="dx-ty" style="background:${TYPE_COLORS[t]}" title="${viaAb ? `Imune por ${esc(ab.name)}` : ''}">${esc(typeLabel(t))}${viaAb ? ` ${ab.icon}` : ''}</span>`).join('')}</div>` : '';
  return row('×4', g[4], 'bad4') + row('×2', g[2], 'bad') + row('×½', g[0.5], 'good') + row('×¼', g[0.25], 'good4') + row('×0', g[0], 'imm') || '<div class="tiny muted">Sem fraquezas nem resistências especiais.</div>';
}

/** Linha evolutiva (do primeiro ao último), clicável. */
function evoChain(sp, seen) {
  let root = sp, guard = 0;
  while (root.evolvesFrom && getSpecies(root.evolvesFrom) && guard++ < 5) root = getSpecies(root.evolvesFrom);
  const chain = [];
  for (let s = root, i = 0; s && i < 5; s = s.evolvesTo ? getSpecies(s.evolvesTo) : null, i++) chain.push(s);
  if (chain.length < 2) return '<div class="tiny muted">Não evolui.</div>';
  return `<div class="dx-evo">${chain.map((s, i) => {
    const v = seen.has(s.id);
    const how = i ? `<span class="dx-arrow">→<small>${s === chain[i] && chain[i - 1].evolutionLevel ? `Nv. ${chain[i - 1].evolutionLevel}` : 'Pedra'}</small></span>` : '';
    return `${how}<button class="dx-evo-mon ${s.id === sp.id ? 'on' : ''} ${v ? '' : 'unseen'}" data-act="dx-go" data-id="${s.id}" ${v ? '' : 'disabled'}>
      <img src="${monSprite(s.id)}" alt="" loading="lazy"><span>${v ? esc(s.name) : '???'}</span></button>`;
  }).join('')}</div>`;
}

const moveRow = m => `<div class="dx-move" style="--tc:${TYPE_COLORS[m.type]}"><span class="dx-ty" style="background:${TYPE_COLORS[m.type]}">${esc(typeLabel(m.type))}</span>
  <b>${esc(m.name)}</b><span class="tiny muted">${m.kind === 'dmg' || m.kind === 'drain' ? `${Math.round((m.power || 1) * 100)}%` : 'suporte'}${m.miss ? ` · erra no 🎲${m.miss === 1 ? '1' : `1–${m.miss}`}` : ''}</span>${moveFxChips(m)}</div>`;

/**
 * HTML da ficha. ctx = { seen:Set, caught:Set, shinySeen:Set, shinyCaught:Set, vault:[], where:{tier:texto}, badges:{tier:n}, tierNames:{} }
 */
export function dexEntryHtml(spId, ctx) {
  const sp = getSpecies(spId);
  const R = refs();
  const ss = ctx.shinySeen.has(sp.id), sc = ctx.shinyCaught.has(sp.id), c = ctx.caught.has(sp.id);
  const mine = (ctx.vault || []).filter(m => m.sp === sp.id);
  const best = mine.reduce((a, m) => (!a || (m.lvl || 0) > (a.lvl || 0) ? m : a), null);
  const ab = ABILITIES[abilityOf(sp.id)];
  const def = baseDefOf(sp);
  const conds = [...new Set([...movesOf(sp.id), ...possibleSecondMoves(sp.id)].map(m => m?.st).filter(Boolean))];
  const megas = megaBySpecies(sp.id);
  const badges = ctx.badges?.[sp.tier] || 0;
  const first = movesOf(sp.id)[0];
  return `<div class="dx">
    <div class="dx-head" style="--t1:${TYPE_COLORS[sp.types[0]]};--t2:${TYPE_COLORS[sp.types[1] || sp.types[0]]}">
      <div class="dx-arts">
        <div class="dx-art"><img src="${monSprite(sp.id)}" alt=""><span>Normal</span></div>
        <div class="dx-art ${ss ? 'shiny' : 'locked'}"><img src="${monSprite(sp.id, true)}" alt=""><span>${sc ? '✨ capturado' : ss ? '✧ visto' : '✨ ???'}</span></div>
      </div>
      <div class="dx-id"><span class="dx-num">#${String(sp.dex).padStart(3, '0')}</span><h3>${esc(sp.name)}</h3>
        <div>${typeChips(sp.types)}</div>
        <div class="dx-tags"><span class="chip">Tier ${sp.tier}${ctx.tierNames?.[sp.tier] ? ' · ' + esc(ctx.tierNames[sp.tier]) : ''}</span>${sp.mythical ? '<span class="chip mythic">🌟 Mítico</span>' : sp.ultra ? '<span class="chip ultra">🌀 Ultracriatura</span>' : sp.legendary ? '<span class="chip gold">⚡ Lendário</span>' : ''}${sp.role ? `<span class="chip">🛡️ ${esc(ROLE_LABELS[sp.role])}</span>` : ''}</div>
        <div class="tiny">${c ? '🔴 Capturado' : '👁️ Só visto'}${mine.length ? ` · 📦 ${mine.length} na Coleção${mine.some(m => m.shiny) ? ' ✨' : ''}${best ? ` (melhor: Nv. ${best.lvl})` : ''}` : ''}</div></div>
    </div>

    <div class="dx-sec"><h4>📊 Status base</h4>
      ${bar('HP', sp.hp, (sp.hp / R.hp) * 100, '#ff6b6b', 'HP base da espécie (cresce com o nível)')}
      ${bar('ATQ', sp.str, (sp.str / R.str) * 100, '#5aa9ff', 'Força base da espécie (cresce com o nível)')}
      ${bar('DEF', def, (def / 150) * 100, '#c86bff', `Defesa oficial (média Def/Def. Esp.): recebe ${Math.round(defFactor(def) * 100)}% do dano`)}
      ${bar('VEL', `×${sp.speMult || 1}`, ((sp.speMult || 1) / R.spe) * 100, '#ffb84d', 'Multiplicador de velocidade da espécie')}
    </div>

    <div class="dx-sec"><h4>✨ Habilidade (passiva)</h4>
      ${ab ? `<div class="dx-abil"><span class="dx-abil-ic">${ab.icon}</span><div><b>${esc(ab.name)}</b><div class="small">${esc(ab.desc)}</div></div></div>`
        : '<div class="small muted">Nenhuma habilidade que funcione no jogo (a habilidade real dele não tem efeito no tabuleiro).</div>'}
    </div>

    <div class="dx-sec"><h4>🛡️ Dano recebido por tipo</h4>${matchups(sp)}</div>

    <div class="dx-sec"><h4>🧬 Evolução</h4>${evoChain(sp, ctx.seen)}</div>

    <div class="dx-sec"><h4>⚔️ Golpes</h4>
      <div class="tiny muted">1º golpe (sempre):</div>${first ? moveRow(first) : ''}
      <div class="tiny muted" style="margin-top:6px">2º golpe — cada um nasce com uma destas variações (troque com 💿 TM):</div>
      <div class="dx-moves">${possibleSecondMoves(sp.id).filter(Boolean).map(moveRow).join('')}</div>
      ${conds.length ? `<div class="small" style="margin-top:6px">Pode causar: ${conds.map(k => `<span class="st-chip" style="--sc:${STATUS[k].color}">${STATUS[k].icon} ${esc(STATUS[k].name)}</span>`).join(' ')}</div>` : ''}
    </div>

    ${megas.length ? `<div class="dx-sec"><h4>💎 Mega Evolução</h4><div class="dx-megas">${megas.map(m => `<div class="dx-mega"><img src="${monSprite(m.sp)}" alt="" loading="lazy"><div><b>${esc(m.name)}</b><div class="tiny">${typeChips(m.types)} · HP ×${m.mult.hp} · ATQ ×${m.mult.str} · VEL ×${m.mult.spe}</div><div class="tiny muted">Pedra: ${esc(m.stoneName)}</div></div></div>`).join('')}</div></div>` : ''}

    <div class="dx-sec dx-info small">
      <div>📍 Onde aparece: ${esc(ctx.where?.[sp.tier] || '—')}</div>
      <div>🎖️ Obedece: ${badges ? `com ${badges} insígnias (se capturado neste tier)` : 'sempre'}</div>
      <div class="tiny muted">Cada um nasce com natureza e potencial (IV) próprios — capture de novo para achar um melhor.</div>
    </div>
  </div>`;
}
