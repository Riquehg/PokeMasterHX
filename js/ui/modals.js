import { COMPANIONS } from '../../shared/data/companions.js';
// Janelas da partida: loja, PC, mochila, voo, Pokédex, ficha do treinador, detalhes do Pokémon e regras.
import { SPECIES_LIST, getSpecies } from '../../shared/data/pokemon.js';
import { getSpace } from '../../shared/data/board.js';
import { ITEMS, shopFor } from '../../shared/data/items.js';
import { GYMS } from '../../shared/data/trainers.js';
import { natureLabel } from '../../shared/data/natures.js';
import { movesOf, ROLE_LABELS, possibleSecondMoves } from '../../shared/data/moves.js';
import { TYPE_COLORS } from '../../shared/rules/types.js';
import { canUse, badgesNeeded, BADGES_TO_USE } from '../../shared/rules/helpers.js';
import { STATUS, TYPE_STATUS } from '../../shared/rules/battle.js';
import { monView, xpToNext } from '../../shared/rules/monsters.js';
import { against, TYPES } from '../../shared/rules/types.js';
import { score } from '../../shared/engine.js';
import { esc, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { monSprite, itemUrl, badgeUrl, typeLabel, leaderUrl } from '../config.js';
import { monCard, statCard, typeChips, avatarImg, playerColor, hpBar } from './common.js';
import { openTradeBuilder } from './trade.js';

const me = session => session.state.players.find(p => p.id === session.viewerId());

function refreshOnChange(session, id, render) {
  const off = session.on(() => { if (document.getElementById(id)) setModalBody(id, render()); else off(); });
}

// ---------------------------------------------------------------- loja
export function openShop(session, act) {
  const render = () => {
    const p = me(session);
    const sp = getSpace(p.pos);
    const offers = shopFor(sp.tier);
    return `<p class="small muted">Itens disponíveis numa cidade de tier ${sp.tier}. Cidades mais avançadas vendem itens melhores.</p>
      <div class="spread"><b>🪙 ${p.gold} de ouro</b></div>
      <div class="col" style="margin-top:8px">${offers.map(o => `
        <div class="shop-item"><img src="${itemUrl(o.id)}" alt="${esc(o.name)}">
          <div><b>${esc(o.name)}</b> <span class="chip gold">${o.price} 🪙</span> ${p.items[o.id] ? `<span class="chip">tem ${p.items[o.id]}</span>` : ''}<div class="tiny muted">${esc(o.desc)}</div></div>
          <div class="row">${o.kind === 'charm' ? '' : `<button class="btn sm" data-act="buy" data-item="${o.id}" data-qty="5" ${p.gold < o.price * 5 ? 'disabled' : ''}>×5</button>`}
            <button class="btn sm primary" data-act="buy" data-item="${o.id}" data-qty="1" ${p.gold < o.price ? 'disabled' : ''}>Comprar</button></div>
        </div>`).join('')}</div>`;
  };
  const ov = openModal('shop', '🛒 Poké Mart', render(), { wide: true });
  bindActions(ov, { buy: d => act({ type: 'city', op: 'buy', item: d.item, qty: Number(d.qty) }) });
  refreshOnChange(session, 'shop', render);
}

// ---------------------------------------------------------------- PC
export function openPC(session, act) {
  let sel = null; // { from: 'team'|'box', index }
  const render = () => {
    const p = me(session);
    return `<p class="small muted">Clique em um Pokémon da equipe e depois em um do PC para trocar. Ou use os botões para guardar/retirar.</p>
      <b>Equipe (${p.team.length}/6)</b>
      <div class="pk-grid" style="margin:6px 0 10px">${p.team.map((m, i) => statCard(m, { index: i, act: 'pick-team', owner: p, lead: i === 0, extra: `<button class="btn sm" data-act="deposit" data-index="${i}" ${p.team.length <= 1 ? 'disabled' : ''}>Guardar</button>` })).join('')}</div>
      <b>PC (${p.box.length})</b>
      <div class="pk-grid" style="margin-top:6px">${p.box.map((m, i) => statCard(m, { index: i, act: 'pick-box', owner: p, extra: `<div class="row" style="justify-content:center;gap:3px"><button class="btn sm" data-act="withdraw" data-index="${i}" ${p.team.length >= 6 ? 'disabled' : ''}>Retirar</button><button class="btn sm red" data-act="release" data-index="${i}" title="Soltar">✕</button></div>` })).join('') || '<p class="muted small">Vazio. Pokémon capturados com a equipe cheia vêm para cá.</p>'}</div>
      ${sel ? `<p class="small" style="margin-top:8px">Selecionado: <b>${esc(getSpecies((sel.from === 'team' ? p.team : p.box)[sel.index].sp).name)}</b> — agora clique no outro lado para trocar.</p>` : ''}`;
  };
  const ov = openModal('pc', '💻 PC de Armazenamento', render(), { wide: true });
  const trySwap = () => {
    if (sel?.team !== undefined && sel?.box !== undefined) {
      const { team, box } = sel; sel = null;
      act({ type: 'pc', op: 'swap', team, box });
    } else setModalBody('pc', render());
  };
  bindActions(ov, {
    'pick-team': d => { sel = { ...(sel || {}), from: 'team', index: Number(d.index), team: Number(d.index) }; trySwap(); },
    'pick-box': d => { sel = { ...(sel || {}), from: 'box', index: Number(d.index), box: Number(d.index) }; trySwap(); },
    deposit: d => act({ type: 'pc', op: 'deposit', team: Number(d.index) }),
    withdraw: d => act({ type: 'pc', op: 'withdraw', box: Number(d.index) }),
    release: d => { if (confirm('Soltar este Pokémon na natureza? (o Professor te dá um pouco de ouro)')) act({ type: 'pc', op: 'release', box: Number(d.index) }); }
  });
  refreshOnChange(session, 'pc', render);
}

// ---------------------------------------------------------------- mochila
const USABLE = ['heal', 'revive', 'candy', 'stone', 'move_bonus', 'escape', 'fly'];
export function openBag(session, act) {
  let pending = null; // item aguardando escolha de alvo
  const render = () => {
    const p = me(session);
    const entries = Object.entries(p.items).filter(([, n]) => n > 0);
    const list = entries.map(([id, n]) => {
      const it = ITEMS[id];
      if (!it) return '';
      const canUse = USABLE.includes(it.kind);
      return `<div class="shop-item"><img src="${itemUrl(id)}" alt="${esc(it.name)}">
        <div><b>${esc(it.name)}</b> <span class="chip">×${n}</span><div class="tiny muted">${esc(it.desc)}</div></div>
        <div>${canUse ? `<button class="btn sm primary" data-act="use" data-item="${id}">Usar</button>` : it.kind === 'ball' ? '<span class="tiny muted">em batalha</span>' : it.kind === 'boost' ? '<span class="tiny muted">em batalha</span>' : '<span class="tiny muted">passivo</span>'}</div></div>`;
    }).join('');
    const target = pending ? `<div class="divider"></div><b>Usar ${esc(ITEMS[pending].name)} em:</b>
      <div class="team" style="grid-template-columns:repeat(6,1fr);margin-top:6px">${p.team.map((m, i) => monCard(m, { index: i, act: 'target' })).join('')}</div>` : '';
    return `<p class="small muted">Itens fora de batalha só podem ser usados na sua vez.</p><div class="col">${list || '<p class="muted">Mochila vazia.</p>'}</div>${target}`;
  };
  const ov = openModal('bag', '🎒 Mochila', render(), { wide: true });
  bindActions(ov, {
    use: d => {
      const it = ITEMS[d.item];
      if (['heal', 'revive', 'candy', 'stone'].includes(it.kind)) { pending = d.item; setModalBody('bag', render()); return; }
      if (it.kind === 'fly') { closeModal('bag'); openFly(session, act); return; }
      act({ type: 'use_item', item: d.item });
    },
    target: d => { const item = pending; pending = null; act({ type: 'use_item', item, index: Number(d.index) }); }
  });
  refreshOnChange(session, 'bag', render);
}

export function openFly(session, act) {
  const p = me(session);
  const cities = p.visited.filter(id => id !== p.pos).map(getSpace).filter(s => s && s.type === 'city');
  const ov = openModal('fly', '🕊️ Voar para...', cities.length
    ? `<div class="col">${cities.map(c => `<button class="btn" data-act="go" data-to="${c.id}">${esc(c.name)}</button>`).join('')}</div>`
    : '<p class="muted">Você ainda não visitou outras cidades.</p>');
  bindActions(ov, { go: d => { closeModal('fly'); act({ type: 'use_item', item: 'fly', to: Number(d.to) }); } });
}

// ---------------------------------------------------------------- Pokédex
const TIER_NAMES = { 1: 'Rosa', 2: 'Verde', 3: 'Azul', 4: 'Vermelho', 5: 'Lendário' };

/**
 * Pokédex: capturados (cor), apenas vistos (cinza, com "visto") e desconhecidos (silhueta ???), mais a Pokédex ✨ shiny.
 * session: partida (usa seen/caught do jogador); extraCaught/extraSeen: Pokédex da conta.
 * extra: { shinyCaught, shinySeen, vault } da conta (opcional).
 */
const WHERE_TIER = { 1: 'Casas Rosa (começo do mapa)', 2: 'Casas Verdes', 3: 'Casas Azuis', 4: 'Casas Vermelhas', 5: 'Casas Amarelas (Santuário), Raids e Ovo Ancestral' };
export function openDex(session, extraCaught = [], extraSeen = [], extra = {}) {
  const p = session ? me(session) : null;
  const caught = new Set([...(p?.caught || []), ...extraCaught]);
  const seen = new Set([...(p?.seen || []), ...extraSeen, ...caught]);
  const vault = extra.vault || [];
  const shinyCaught = new Set([...(p?.shinyCaught || []), ...(extra.shinyCaught || []), ...vault.filter(m => m.shiny).map(m => m.sp),
    ...(p ? [...p.team, ...p.box].filter(m => m.shiny).map(m => m.sp) : [])]);
  const shinySeen = new Set([...(p?.shinySeen || []), ...(extra.shinySeen || []), ...shinyCaught]);
  shinyCaught.forEach(id => caught.add(id)); shinySeen.forEach(id => seen.add(id));
  const f = { show: 'all', q: '', tier: 0, type: '', shinyArt: false };
  const pct = (a, b) => Math.round((a / b) * 100);
  const counts = `<div class="dex-stats">
      <span class="chip green">🔴 Capturados <b>${caught.size}</b></span>
      <span class="chip">👁️ Só vistos <b>${seen.size - caught.size}</b></span>
      <span class="chip">❔ Desconhecidos <b>${SPECIES_LIST.length - seen.size}</b></span>
      <span class="chip gold">${pct(caught.size, SPECIES_LIST.length)}% de ${SPECIES_LIST.length}</span>
      <span class="chip shiny-chip">✨ Shiny: <b>${shinyCaught.size}</b> capturados · <b>${shinySeen.size - shinyCaught.size}</b> só vistos</span></div>
    <div class="dex-tiers">${[1, 2, 3, 4, 5].map(t => { const all = SPECIES_LIST.filter(s => s.tier === t); const c = all.filter(s => caught.has(s.id)).length;
      return `<div class="dex-tier t${t}" title="Tier ${t} · ${TIER_NAMES[t]}"><b>T${t}</b> ${c}/${all.length}<i style="width:${pct(c, all.length)}%"></i></div>`; }).join('')}</div>`;
  const controls = `<div class="dex-controls">
      <div class="seg">${[['all', 'Todos'], ['caught', 'Capturados'], ['seen', 'Só vistos'], ['unseen', 'Desconhecidos'], ['shiny', '✨ Shiny']].map(([k, l]) => `<button class="btn sm ${k === 'all' ? 'on' : ''}" data-act="dex-show" data-v="${k}">${l}</button>`).join('')}</div>
      <input class="input" id="dex-q" placeholder="Buscar nome ou nº" style="flex:1;min-width:120px">
      <select class="input" id="dex-tier"><option value="0">Todos os tiers</option>${[1, 2, 3, 4, 5].map(t => `<option value="${t}">Tier ${t} · ${TIER_NAMES[t]}</option>`).join('')}</select>
      <select class="input" id="dex-type"><option value="">Todos os tipos</option>${TYPES.map(t => `<option value="${t}">${esc(typeLabel(t))}</option>`).join('')}</select>
      <button class="btn sm" data-act="dex-art" title="Mostrar a forma shiny de quem você já viu shiny">✨ Arte shiny</button></div>`;

  const grid = () => SPECIES_LIST.filter(s => {
    const c = caught.has(s.id), v = seen.has(s.id);
    if (f.show === 'caught' && !c) return false;
    if (f.show === 'seen' && (c || !v)) return false;
    if (f.show === 'unseen' && v) return false;
    if (f.show === 'shiny' && !shinySeen.has(s.id)) return false;
    if (f.tier && s.tier !== f.tier) return false;
    if (f.type && (!v || !s.types.includes(f.type))) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (!(String(s.dex) === q.replace(/^#?0*/, '') || (v && s.name.toLowerCase().includes(q)))) return false;
    }
    return true;
  }).map(s => {
    const c = caught.has(s.id), v = seen.has(s.id), sc = shinyCaught.has(s.id), ss = shinySeen.has(s.id);
    const art = f.shinyArt && ss;
    return `<div class="e ${c ? 'caught' : v ? 'seen' : 'unseen'} t${s.tier} ${sc ? 'shiny-c' : ss ? 'shiny-s' : ''}" data-act="dex-open" data-id="${s.id}" title="${v ? esc(s.name) : '???'}">
      ${c ? '<span class="dex-ball" title="Capturado">●</span>' : v ? '<span class="dex-eye" title="Visto">👁️</span>' : ''}
      ${sc ? '<span class="dex-shiny" title="Shiny capturado">✨</span>' : ss ? '<span class="dex-shiny seen" title="Shiny visto">✧</span>' : ''}
      <img src="${monSprite(s.id, art)}" alt="${v ? esc(s.name) : '?'}" loading="lazy">
      <div>#${String(s.dex).padStart(3, '0')}</div><div><b>${v ? esc(s.name) : '???'}</b></div>${v ? `<div>${typeChips(s.types)}</div>` : ''}</div>`;
  }).join('') || '<p class="muted">Nada encontrado com esses filtros.</p>';

  const ov = openModal('dex', '📖 Pokédex', `${counts}${controls}<div class="dex" id="dex-grid">${grid()}</div>`, { wide: true });
  const redraw = () => { ov.querySelector('#dex-grid').innerHTML = grid(); };
  ov.querySelector('#dex-q').addEventListener('input', e => { f.q = e.target.value.trim(); redraw(); });
  ov.querySelector('#dex-tier').addEventListener('change', e => { f.tier = Number(e.target.value); redraw(); });
  ov.querySelector('#dex-type').addEventListener('change', e => { f.type = e.target.value; redraw(); });
  bindActions(ov, {
    'dex-show': d => { f.show = d.v; ov.querySelectorAll('[data-act="dex-show"]').forEach(b => b.classList.toggle('on', b.dataset.v === d.v)); redraw(); },
    'dex-art': (d, el) => { f.shinyArt = !f.shinyArt; ov.querySelector('[data-act="dex-art"]').classList.toggle('on', f.shinyArt); redraw(); },
    'dex-open': d => {
      const sp = getSpecies(d.id);
      if (!seen.has(sp.id)) return;
      const evo = sp.evolvesTo ? `${getSpecies(sp.evolvesTo).name} (${sp.evolutionLevel ? 'Nv. ' + sp.evolutionLevel : 'Pedra Evolutiva'})` : 'não evolui';
      const from = sp.evolvesFrom ? getSpecies(sp.evolvesFrom).name : null;
      const ss = shinySeen.has(sp.id), sc = shinyCaught.has(sp.id);
      const mine = vault.filter(m => m.sp === sp.id);
      const conds = [...new Set(movesOf(sp.id).map(m => TYPE_STATUS[m.type]).filter(Boolean))];
      const badges = BADGES_TO_USE[sp.tier] || 0;
      openModal('dex-entry', `#${String(sp.dex).padStart(3, '0')} ${esc(sp.name)}`, `<div class="row" style="align-items:flex-start">
          <div class="dex-arts"><div><img src="${monSprite(sp.id)}" alt=""><span class="tiny">Normal</span></div>
            <div class="${ss ? '' : 'locked'}"><img src="${monSprite(sp.id, true)}" alt=""><span class="tiny">${sc ? '✨ Shiny capturado' : ss ? '✧ Shiny visto' : '✨ Shiny: ainda não viu'}</span></div></div>
          <div class="grow"><div>${typeChips(sp.types)} <span class="chip">Tier ${sp.tier} · ${TIER_NAMES[sp.tier]}</span> ${sp.legendary ? '<span class="chip gold">Lendário</span>' : ''}</div>
          <div class="small" style="margin-top:6px">${caught.has(sp.id) ? '🔴 Capturado' : '👁️ Só visto'} · HP base ${sp.hp} · Força ${sp.str}${mine.length ? ` · 📦 ${mine.length} na Coleção${mine.some(m => m.shiny) ? ' (✨)' : ''}` : ''}</div>
          <div class="small">📍 Onde aparece: ${esc(WHERE_TIER[sp.tier])}</div>
          <div class="small">🎖️ Obedece: ${badges ? `com ${badges} insígnias (se capturado neste tier)` : 'sempre'}</div>
          <div class="small">Evolução: ${from ? esc(from) + ' → ' : ''}<b>${esc(sp.name)}</b> → ${esc(evo)}</div>
          ${conds.length ? `<div class="small">Pode causar: ${conds.map(c => `<span class="st-chip" style="--sc:${STATUS[c].color}">${STATUS[c].icon} ${esc(STATUS[c].name)}</span>`).join(' ')}</div>` : ''}
          ${movesHtml(sp.id)}<div class="tiny muted">Variações do 2º golpe: ${possibleSecondMoves(sp.id).map(m => esc(m.name)).join(', ')}</div>
          <div class="tiny muted">Cada um nasce com natureza e potencial (IV) próprios — capture de novo para achar um melhor.</div></div></div>`);
    }
  });
}

export function movesHtml(spId) {
  const sp = getSpecies(spId);
  return `<div class="moves-list">${movesOf(spId).map(m => `<span class="move-chip" style="--tc:${TYPE_COLORS[m.type]}" title="${esc(m.desc)}"><b>${esc(m.name)}</b> <span class="tiny">${esc(m.desc)}</span></span>`).join('')}
    ${sp?.role ? `<span class="chip">🛡️ Suporte: ${esc(ROLE_LABELS[sp.role])}</span>` : ''}</div>`;
}

// ---------------------------------------------------------------- treinador
export function openTrainer(session, pid) {
  const s = session.state;
  const p = s.players.find(x => x.id === pid);
  if (!p) return;
  const canTrade = session.act && pid !== session.viewerId() && s.options.trades !== false && s.status === 'playing' && !p.left
    && s.players.some(x => x.id === session.viewerId());
  const html = `<div class="trainer ${p.cosmetic?.card ? 'tcard tcard-' + esc(p.cosmetic.card) : ''}">${avatarImg(p, 'avatar', playerColor(s, p.id))}
      <div><h3 style="color:${playerColor(s, p.id)}">${esc(p.name)} ${p.isBot ? '<span class="chip">CPU</span>' : ''}</h3>${p.cosmetic?.title ? `<div class="player-title">“${esc(p.cosmetic.title)}”</div>` : ''}
      <div class="small">🪙 ${p.gold} · 📖 ${p.caught.length} capturados · ✨ ${p.stats.shinies} shiny · ⭐ ${score(p)} pts</div>
      <div class="small muted">📍 ${esc(getSpace(p.pos).name)} · vitórias ${p.stats.wins} · PvP ${p.stats.pvpWins}</div></div></div>
    <div class="row" style="margin:10px 0">${GYMS.map(g => `<img src="${badgeUrl(g.id)}" alt="${esc(g.badge)}" title="${esc(g.badge)} (${esc(g.leader)})" style="width:34px;height:34px;object-fit:contain;${p.badges.includes(g.id) ? '' : 'filter:grayscale(1) brightness(.4)'}">`).join('')}
      ${p.eliteStage ? `<span class="chip gold">👑 Elite ${p.eliteStage}/4</span>` : ''}</div>
    <b>Equipe</b><div class="pk-grid" style="margin-top:6px">${p.team.map((m, i) => statCard(m, { owner: p, lead: i === 0 })).join('')}</div>
    ${p.box.length ? `<details style="margin-top:8px"><summary class="small"><b>💻 Banco / PC (${p.box.length})</b> — toque para ver</summary><div class="pk-grid" style="margin-top:6px">${p.box.map(m => statCard(m, { owner: p })).join('')}</div></details>` : ''}
    ${p.companion && COMPANIONS[p.companion] ? `<div class="comp-box" style="margin-top:8px"><img class="comp-img" src="${leaderUrl(COMPANIONS[p.companion].sprite)}" alt=""><div><b>${COMPANIONS[p.companion].icon} ${esc(COMPANIONS[p.companion].name)}</b><div class="tiny muted">${esc(COMPANIONS[p.companion].desc)}</div></div></div>` : ''}
    ${(p.captureLog || []).length ? `<div class="small" style="margin-top:8px"><b>🔴 Últimas capturas</b><div class="row" style="gap:4px;margin-top:4px">${p.captureLog.slice(-12).reverse().map(c => `<img src="${monSprite({ sp: c.sp, shiny: c.shiny })}" title="${esc(getSpecies(c.sp).name)}${c.shiny ? ' ✨' : ''}" style="width:34px;height:34px;object-fit:contain">`).join('')}</div></div>` : ''}
    ${canTrade ? `<button class="btn primary block" data-act="trade-with" style="margin-top:10px">🤝 Propor troca (Pokémon, itens, ouro)</button>` : ''}`;
  const ov = openModal('trainer', '🪪 Ficha do Treinador', html, { wide: true });
  bindActions(ov, { 'trade-with': () => { closeModal('trainer'); openTradeBuilder(session, pid); } });
}

// ---------------------------------------------------------------- Pokémon
export function openMon(session, act, index) {
  const p = me(session);
  const mon = p.team[index];
  if (!mon) return;
  const v = monView(mon);
  const sp = getSpecies(mon.sp);
  const weak = TYPES.map(t => [t, against(t, sp.types)]).filter(([, m]) => m !== 1).sort((a, b) => b[1] - a[1]);
  const evo = sp.evolvesTo ? `${getSpecies(sp.evolvesTo).name}${sp.evolutionLevel ? ` no Nv. ${sp.evolutionLevel}` : ' (Pedra Evolutiva)'}` : 'não evolui';
  const myTurn = session.state.players[session.state.current].id === p.id && !session.state.battle;
  const html = `<div class="mon-detail">
      ${statCard(mon, { owner: p, lead: index === 0 })}
      <div class="col grow small">
        <div>${typeChips(v.types)} <span class="chip">#${String(sp.dex).padStart(3, '0')}</span>${mon.aura ? ` <span class="chip gold">aura ${esc(mon.aura)}</span>` : ''}</div>
        <div>Natureza: <b>${esc(natureLabel(mon.nature))}</b></div>
        <div>Potencial (IV): HP <b>${mon.iv?.hp ?? '?'}</b> · ATQ <b>${mon.iv?.atk ?? '?'}</b> · VEL <b>${mon.iv?.spe ?? '?'}</b> <span class="muted">(0 a 31 — cada Pokémon nasce com os seus)</span></div>
        <div>Golpes: o 1º é sempre o rápido do tipo; o 2º é a variação deste indivíduo. Outros ${esc(v.name)} podem vir com: ${possibleSecondMoves(mon.sp).map(m => esc(m.name)).join(', ')}.</div>
        ${badgesNeeded(mon) ? `<div>${canUse(p, mon) ? '✅' : '🔒'} Obedece com ${badgesNeeded(mon)} insígnia${badgesNeeded(mon) > 1 ? 's' : ''} (você tem ${p.badges.length})</div>` : ''}
        <div>Evolução: ${esc(evo)}</div>
      </div></div>
    <div class="divider"></div>
    <b class="small">Efetividade contra ${esc(v.name)}</b>
    <div class="row" style="margin-top:6px">${weak.map(([t, m]) => `<span class="chip ${m > 1 ? 'red' : 'green'}">${esc(typeLabel(t))} x${m}</span>`).join('')}</div>
    ${myTurn && index > 0 ? `<div class="divider"></div><button class="btn primary" data-act="lead">⬆️ Colocar na frente (entra primeiro nas batalhas)</button>` : ''}`;
  const ov = openModal('mon', 'Pokémon', html);
  bindActions(ov, { lead: () => { closeModal('mon'); act({ type: 'reorder', index }); } });
}

// ---------------------------------------------------------------- regras
export function openHelp() {
  openModal('help', '❔ Como jogar', `
    <div class="small col">
      <p><b>Objetivo:</b> conquistar as 6 insígnias, vencer a Elite dos Quatro (Liga Pokémon) e derrotar o Campeão na Arena Final. Com limite de turnos, vence quem tiver mais pontos.</p>
      <p><b>Turno:</b> role o dado e escolha uma das casas piscando. Casas <b>coloridas</b> têm Pokémon do tier da cor (Rosa → Verde → Azul → Vermelha → Amarela). Casas <b>?</b> são eventos (ouro, itens, treinadores, Equipe Rocket, atalhos...). Nas casas de evento <b>Azuis e Vermelhas</b> pode surgir uma <b>RAID</b> contra um lendário: <b>solo</b> ou <b>em grupo</b> (todos escolhem 1 Pokémon e lutam juntos; o HP do lendário cresce com o grupo). Durante a luta em grupo dá para usar Potion/Super Potion ou X Attack no lugar do golpe. Pokébolas só depois de vencer: aí cada um escolhe a bola e tenta capturar, na ordem de quem causou mais dano. As casas de evento <b>Amarelas</b> só têm <b>eventos especiais</b>: Santuário Lendário, Ás da Liga, Chuva de Estrelas (shiny garantido), Tesouro da Liga, Bênção de Mew e Ovo Ancestral. <b>Cidades</b> têm Centro Pokémon (cura grátis), Loja, PC e ginásio.</p>
      <p><b>Batalha:</b> cada rodada os dois lados agem. Dano = ataque × 0,7 + 🎲, multiplicado pela vantagem de tipo (tabela oficial de 18 tipos; tipo duplo multiplica: x4, x2, x0,5, x0,25 ou x0). 🎲6 = crítico (x1,5); 🎲1 = golpe fraco (x0,5). Quem tem mais <b>Velocidade</b> (nível × natureza) ataca primeiro.</p>
      <p><b>Golpes:</b> cada Pokémon tem 2 golpes. O 1º é um golpe rápido do 1º tipo (nunca erra). O 2º é um golpe forte do 2º tipo (ou do mesmo tipo) com 140% de poder, mas erra no 🎲1. Golpe do mesmo tipo do Pokémon ganha +20%. Pokémon de suporte trocam o golpe forte por <b>Recover</b> (cura 40%), <b>Swords Dance</b> (+40% de ataque), <b>Intimidate</b> (−30% no ataque do rival) ou <b>Giga Drain</b> (dano que cura). Escolher o golpe certo para o tipo do rival faz toda a diferença.</p>
      <p><b>Condições:</b> golpes podem deixar o rival 🔥 <b>Queimado</b> (Fogo: perde HP e ataca mais fraco), ☠️ <b>Envenenado</b> (Veneno: perde 1/8 do HP por rodada), ⚡ <b>Paralisado</b> (Elétrico: 25% de não agir, mais lento), 💤 <b>Dormindo</b> (Planta/Fantasma: perde 1–3 rodadas) ou 🧊 <b>Congelado</b> (Gelo: não age até descongelar). Golpes fortes e pesados têm mais chance. Pokémon do mesmo tipo são imunes. <b>Full Heal</b> (loja) cura qualquer condição durante a luta; ao fim da batalha as condições somem.</p>
      <p><b>🎯 Missões e 🤝 Companheiros:</b> na aba Metas ficam 3 missões fixas (capturar tipos, derrotar tipos, vencer treinadores, Raids...). Ao completar você ganha ouro, itens ou um <b>companheiro</b> (fica na sua conta). O companheiro anda ao lado do seu peão e dá um bônus (Misty em golpes de Água, Blaine chance de queimar, Prof. Oak XP, Enfermeira Joy poções, Jessie &amp; James ouro...). Troque na aba Metas ou no 🤝 do início.</p>
      <p><b>💞 Laço:</b> cada partida salva na conta com o mesmo companheiro dá pontos de laço (mais se você vencer, capturar, ganhar insígnias e completar missões). O bônus cresce do Nv. 1 (ex.: +4% de dano) ao Nv. 10 (+13%). No Nv. 10 vocês ficam <b>❤️ Íntimos</b>: aparece um coração no seu peão e, de vez em quando (12% por rodada, até 2 vezes por batalha), ele entra na batalha com o Pokémon dele e usa um golpe especial — ataque, cura, aumento de Ataque, queda de Ataque do adversário ou uma condição. Não vale no Duelo, Copa e Competitivo.</p>
      <p><b>🏅 Insígnias no mapa:</b> as cidades mostram a insígnia do ginásio — colorida se você já tem, apagada se falta, e a <b>próxima mais perto</b> brilha com a distância. Toque numa insígnia da aba Metas para centralizar o mapa.</p>
      <p><b>🎮 Tipos de partida</b> (todos com versão Balanceada — todos começam com inicial — e versão Coleção — cada um leva seu time):</p>
      <p>🗺️ <b>Clássico:</b> insígnias, Liga e Campeão.</p>
      <p>⚔️ <b>Battle Royale:</b> sempre na <b>Arena Royale</b>, um mapa simétrico: cada um começa numa Base na borda, todos à mesma distância do Coliseu Central (Rosa na borda, Amarelo/lendários só perto do centro), com inicial no Nv. 12 e todos os Pokémon obedecendo. A partir da rodada 3 uma <b>tempestade</b> fecha o mapa em direção ao centro (🎯); quem fica dentro dela perde 20% do HP de cada Pokémon por rodada. Parar na casa de outro treinador = batalha obrigatória, e <b>perder o PvP elimina</b>. Perder para selvagem só volta para a cidade. Cada Centro Pokémon cura você uma vez, e não funciona dentro da tempestade. Ginásios fechados. Último de pé vence. Baús aparecem mais.</p>
      <p>🏰 <b>Conquista:</b> as 6 cidades de ginásio começam neutras. Vença o líder para dominar e escolha até 3 Pokémon (da equipe ou do PC) para ficar defendendo — eles saem do seu time. Outro jogador que atacar luta contra a guarnição (CPU); se vencer, toma a cidade e os seus defensores voltam para o seu PC machucados. Cada cidade rende ouro por rodada (50 × tier) e dá +10% nos golpes do tipo dela. A guarnição se recupera um pouco a cada rodada e cura quando você visita. Vence quem dominar todas — ou quem tiver mais cidades no turno 40.</p>
      <p><b>🗺️ Mapas:</b> <b>Kanto</b> (o clássico) ou <b>Expedição</b> (um mapa novo a cada partida). As rotas desenhadas são exatamente por onde dá para andar. Cada região tem um ambiente — mar, floresta, deserto, caverna, neve, vulcão — e os Pokémon de lá aparecem mais (ex.: mar → Água, caverna → Pedra).</p>
      <p><b>🧭 Caminhos escondidos:</b> casas com ícone exigem uma habilidade: 🌊 Surf (Água), 🌿 Cortar (Planta/Inseto), 🪨 Quebra-Pedra (Lutador/Pedra), 💡 Flash (Elétrico/Psíquico), ⛰️ Escalada (Terra/Dragão), 🔥 Queimar (Fogo), 🪶 Voar (Voador). Vale ter um Pokémon de pé desse tipo <b>ou</b> com um golpe desse tipo. Lá dentro os Pokémon são de tier maior.</p>
      <p><b>☁️ Clima:</b> muda a cada 3–5 rodadas. ☀️ Sol: Fogo +30%, Água −30%. 🌧️ Chuva: Água +30%, Fogo −30%. ⛈️ Tempestade: Elétrico +30%, paralisia 2×. 🌨️ Nevasca: Gelo +30%, quem não é Gelo perde HP. 🏜️ Areia: Pedra/Terra +20%, quem não é Pedra/Terra/Aço perde HP. 🌫️ Neblina: Fantasma/Psíquico/Sombrio +20% e Pokémon mais raros. O clima também muda quem aparece.</p>
      <p><b>🪙 Ouro da conta:</b> no modo Coleção você pode levar ouro da conta para a partida (o que sobrar volta no fim). Na Coleção, o 🏋️ Centro de Treino sobe níveis dos seus Pokémon (até o Nv. 50, evoluem no caminho). Também serve no Mercado.</p>
      <p><b>⚡ Eventos relâmpago:</b> de vez em quando surge um ícone numa casa de evento — 🎁 <b>Baú do Tesouro</b> (ouro e itens), 🔥 <b>Raid Relâmpago</b> ou ❔ <b>Pokémon Misterioso</b> (silhueta de um Pokémon mais forte, com mais chance de shiny). O ⏳ mostra quantas rodadas faltam para sumir; quem parar na casa primeiro ativa.</p>
      <p><b>📖 Pokédex:</b> mostra as 806 espécies com tier (cor da casa onde aparece), insígnias para obedecer, condições que os golpes causam e variações de golpe. Registra também os <b>shinies</b>: ✧ visto e ✨ capturado (filtro “✨ Shiny” e botão “Arte shiny”).</p>
      <p><b>💎 Loja de Diamantes:</b> só visual e conveniência — dado personalizado, cenário de batalha, cartão de treinador, efeito de vitória, +50 vagas na Coleção e apelidos para Pokémon. Ninguém fica mais forte por comprar.</p>
      <p><b>👀 Assistir:</b> durante a batalha de outro jogador, toque em “Assistir a batalha” (ou marque “Abrir sempre”) para ver os golpes, o banco de cada lado e a captura com a animação da Pokébola. Sem assistir, as capturas dos outros aparecem num cartãozinho no canto. Na ficha do treinador aparecem o PC e as últimas capturas.</p>
      <p><b>Trocas:</b> toque no peão ou no nome de outro treinador → 🤝 Propor troca. Dá para trocar Pokémon, itens e ouro (não vale no modo Competitivo). Pokémon recebido em troca precisa das insígnias para lutar.</p>
      <p><b>Raridade:</b> shiny é raríssimo (1 em 450) e lendários só são capturados com 10+ na rolagem (e costumam fugir depois de escapar da bola).</p>
      <p><b>Cada Pokémon é único:</b> além da natureza, nasce com <b>potencial (IV)</b> de 0 a 31 em HP, Ataque e Velocidade (até ±8%) — veja as estrelas ★ no card — e com uma <b>variação de golpes</b>: o 2º golpe pode ser forte (140%, erra no 🎲1), pesado (170%, erra no 🎲1–2), de outro tipo (cobertura, ex.: Pikachu com Iron Tail) ou de suporte. Vale a pena capturar de novo atrás de um melhor!</p>
      <p><b>Natureza:</b> cada Pokémon nasce com uma das 25 naturezas dos jogos: +10% em um atributo (Ataque, HP ou Velocidade) e −10% em outro. 5 são neutras.</p>
      <p><b>Obediência:</b> Pokémon de casas 🌸 Rosa e 🟢 Verde obedecem sempre. 🔵 Azul precisa de 1 insígnia, 🔴 Vermelho de 2 e 🟡 Amarelo (lendários) de 3. O inicial e os capturados na <b>🤝 Bola da Confiança</b> obedecem sempre. Os que não obedecem aparecem com 🔒.</p>
      <p><b>🤝 Bola da Confiança:</b> raríssima (baús, eventos de casas altas, Raids e convites de viagem — não é vendida), com chance normal de captura. Quem for capturado nela confia em você e luta sem precisar de insígnias, até lendários — e continua assim na sua Coleção.</p>
      <p><b>✨ Shiny:</b> além da cor rara, é mais forte: +15% de HP e Ataque e +10% de Velocidade.</p>
      <p><b>👴 Ajuda do Professor:</b> a cada 4 rodadas, quem tem menos Pokémon (pelo menos 2 a menos que o líder) ganha um Pokémon da região, Great Balls e Potions. Se também estiver 2+ insígnias atrás, ganha uma <b>Insígnia de Incentivo</b> (uma vez por partida).</p>
      <p><b>☠️ Hardcore</b> (opção em qualquer modo): se toda a sua equipe for derrotada, você está fora da partida e perde tudo o que ganhou nela — capturas, níveis, ouro e até o ouro que trouxe da conta. Quem sobrevive até o fim ganha o dobro de ouro da conta. Sair da partida também conta como cair.</p>
      <p><b>🙋 Entrar no meio / 🚫 Remover:</b> nas salas online (menos Battle Royale e Competitivo) dá para entrar numa partida em andamento pela lista de salas: o novato começa na cidade inicial com o inicial perto do nível da mesa e uma ajuda de ouro. O anfitrião pode remover um jogador na hora pela aba Jogadores (🚫), sem esperar a CPU.</p>
      <p><b>🏆 Liga Ranqueada:</b> Competitivo e Duelo ranqueado valem Pontos de Liga (PL). Bronze, Prata, Ouro, Platina e Diamante têm as divisões III, II e I; depois vêm Mestre e Grão-Mestre. 100 PL sobe de divisão; abaixo de 0 cai (depois de subir você tem 3 partidas de proteção). Temporada nova todo mês, com 💎 pela melhor divisão.</p>
      <p><b>🗺️ Convite de viagem:</b> carta de evento que pede para visitar uma cidade onde você ainda não foi em até 6 rodadas. Chegando lá: ouro, Ultra Balls e Rare Candy (ou, com muita sorte, uma Bola da Confiança).</p>
      <p><b>Prêmios de insígnia:</b> 1ª kit de bolas e poções · 2ª ovo tier 2 · 3ª ovo tier 3 + Ultra Balls · 4ª ovo tier 4 + Rare Candy · 5ª kit de elite · 6ª ovo lendário + Master Ball.</p>
      <p><b>Equipe cheia:</b> com 6 Pokémon na equipe, novas capturas e ovos vão direto para o PC (abra o PC numa cidade para trocar).</p>
      <p><b>Captura:</b> jogue a Pokébola no selvagem. Precisa tirar no dado: Rosa 3+, Verde 4+, Azul 5+, Vermelho 6+, Lendário 7+ (shiny +1). Bônus: bola (+1 a +3), HP do selvagem abaixo de 50% (+1) ou 25% (+2), seu Pokémon 5+ níveis acima (+1). 🎲1 sempre falha e ele pode fugir. Derrotar (desmaiar) não captura!</p>
      <p><b>Shiny:</b> 1 em 40 (1 em 8 para o Pokémon do Dia; Amuleto Shiny triplica). Shinies têm +10% de status, valem mais XP e pontos.</p>
      <p><b>XP:</b> quem derrota ganha tudo, quem participou 60% e o resto da equipe 40%. Vencer Pokémon muito mais fracos rende pouco. Evolução acontece no nível do catálogo (ou com Pedra Evolutiva).</p>
      <p><b>PvP:</b> parou na mesma casa de outro treinador? Desafie! Quem perde paga 15% do ouro.</p>
      <p><b>Derrota:</b> se a equipe inteira desmaiar, você volta à última cidade, perde 10% do ouro e a equipe é curada.</p>
      <p><b>Online:</b> todos os dados são rolados no servidor. Se alguém sumir por 90s, os outros podem deixar uma CPU jogar a vez dele.</p>
    </div>`, { wide: true });
}
