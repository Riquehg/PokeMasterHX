// Trocas dentro da partida: montar proposta, responder proposta recebida e acompanhar a enviada.
import { getSpecies } from '../../shared/data/pokemon.js';
import { ITEMS } from '../../shared/data/items.js';
import { canUse, badgesNeeded } from '../../shared/rules/helpers.js';
import { describeSide } from '../../shared/rules/trade.js';
import { esc, openModal, closeModal, bindActions } from './dom.js';
import { monSprite, itemUrl } from '../config.js';

function monPick(p, side, key) {
  const all = [...p.team.map(m => ({ m, w: 'Equipe' })), ...p.box.map(m => ({ m, w: 'PC' }))];
  return `<div class="trade-mons">${all.map(({ m, w }) => {
    const sp = getSpecies(m.sp);
    const on = side.mon === m.uid;
    return `<button type="button" class="trade-mon ${on ? 'on' : ''}" data-act="t-mon" data-k="${key}" data-uid="${esc(m.uid)}" title="${esc(sp.name)} · ${w}">
      <img src="${monSprite(m)}" alt=""><span>${esc(sp.name)}${m.shiny ? ' ✨' : ''}</span><span class="tiny">Nv.${m.lvl} · T${sp.tier} · ${w}</span></button>`;
  }).join('') || '<p class="muted tiny">Nenhum Pokémon.</p>'}</div>`;
}

function itemPick(p, side, key) {
  const items = Object.entries(p.items).filter(([id, n]) => ITEMS[id] && n > 0);
  return `<div class="trade-items">${items.map(([id, n]) => `<label class="trade-item" title="${esc(ITEMS[id].name)}">
      <img src="${itemUrl(id)}" alt=""><span class="tiny">${esc(ITEMS[id].name)} (${n})</span>
      <input type="number" class="input" min="0" max="${n}" value="${side.items[id] || 0}" data-k="${key}" data-item="${id}"></label>`).join('') || '<p class="muted tiny">Sem itens.</p>'}</div>`;
}

/** Monta e envia uma proposta de troca para outro jogador. */
export function openTradeBuilder(session, pid) {
  const s = session.state;
  const me = s.players.find(p => p.id === session.viewerId());
  const them = s.players.find(p => p.id === pid);
  if (!me || !them) return;
  const draft = { give: { mon: null, items: {}, gold: 0 }, want: { mon: null, items: {}, gold: 0 } };

  const html = () => `<p class="small muted">Os dois lados precisam oferecer algo. Pokémon trocados precisam das insígnias do novo dono para lutar (🔒).</p>
    <div class="trade-cols">
      <div class="trade-col"><h3>Você dá</h3>${monPick(me, draft.give, 'give')}${itemPick(me, draft.give, 'give')}
        <label class="small">🪙 Ouro <input type="number" class="input" min="0" max="${me.gold}" value="${draft.give.gold}" data-gold="give"></label></div>
      <div class="trade-col"><h3>Você quer de ${esc(them.name)}</h3>${monPick(them, draft.want, 'want')}${itemPick(them, draft.want, 'want')}
        <label class="small">🪙 Ouro <input type="number" class="input" min="0" max="${them.gold}" value="${draft.want.gold}" data-gold="want"></label></div>
    </div>
    <button class="btn primary block" data-act="t-send" style="margin-top:10px">🤝 Enviar proposta</button>`;

  const ov = openModal('trade-build', `🤝 Troca com ${esc(them.name)}`, html(), { wide: true });
  const body = ov.querySelector('.body');
  const redraw = () => { body.innerHTML = html(); };
  body.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.item) draft[t.dataset.k].items[t.dataset.item] = Math.max(0, Number(t.value) || 0);
    if (t.dataset.gold) draft[t.dataset.gold].gold = Math.max(0, Number(t.value) || 0);
  });
  bindActions(ov, {
    't-mon': d => { const side = draft[d.k]; side.mon = side.mon === d.uid ? null : d.uid; redraw(); },
    't-send': async () => {
      const r = await session.act({ type: 'trade_offer', to: pid, give: draft.give, want: draft.want });
      if (!r?.error) closeModal('trade-build');
    }
  });
}

function sideHtml(p, side) {
  const parts = [];
  if (side.mon) {
    const m = [...p.team, ...p.box].find(x => x.uid === side.mon);
    if (m) {
      const sp = getSpecies(m.sp);
      parts.push(`<div class="trade-mon on"><img src="${monSprite(m)}" alt=""><span>${esc(sp.name)}${m.shiny ? ' ✨' : ''}</span><span class="tiny">Nv.${m.lvl} · Tier ${sp.tier}${m.nature ? ' · ' + esc(m.nature) : ''}</span></div>`);
    }
  }
  for (const [id, n] of Object.entries(side.items || {})) parts.push(`<div class="chip"><img src="${itemUrl(id)}" alt="" style="width:18px;height:18px;vertical-align:middle"> ${n}x ${esc(ITEMS[id]?.name || id)}</div>`);
  if (side.gold) parts.push(`<div class="chip gold">🪙 ${side.gold}</div>`);
  return parts.join('') || '<span class="muted">nada</span>';
}

/** Mostra a proposta recebida (pop-up) e a barra da proposta enviada. Chamada a cada render. */
export function renderTrades(root, s, vid, session) {
  const bar = root.querySelector('#g-trades');
  const trades = s.trades || [];
  const mine = trades.find(t => t.from === vid);
  const incoming = trades.find(t => t.to === vid);
  const name = id => s.players.find(p => p.id === id)?.name || '?';
  if (bar) {
    bar.innerHTML = mine ? `<div class="trade-bar">🤝 Proposta para <b>${esc(name(mine.to))}</b> aguardando resposta
      <button class="btn sm" data-act="trade-cancel" data-id="${esc(mine.id)}">Cancelar</button></div>` : '';
    bar.style.display = mine ? '' : 'none';
  }
  const open = document.getElementById('trade-in');
  if (!incoming) { if (open) closeModal('trade-in'); return; }
  if (open && open.dataset.tid === incoming.id) return;
  const from = s.players.find(p => p.id === incoming.from);
  const me = s.players.find(p => p.id === vid);
  const ov = openModal('trade-in', `🤝 ${esc(from.name)} quer trocar com você`, `
    <div class="trade-cols">
      <div class="trade-col"><h3>Você recebe</h3>${sideHtml(from, incoming.give)}</div>
      <div class="trade-col"><h3>Você entrega</h3>${sideHtml(me, incoming.want)}</div>
    </div>
    <div class="grid2" style="margin-top:12px"><button class="btn green" data-act="t-accept">✅ Aceitar</button><button class="btn red" data-act="t-decline">❌ Recusar</button></div>`, { closable: false });
  ov.dataset.tid = incoming.id;
  bindActions(ov, {
    't-accept': async () => { closeModal('trade-in'); await session.act({ type: 'trade_respond', id: incoming.id, accept: true }); },
    't-decline': async () => { closeModal('trade-in'); await session.act({ type: 'trade_respond', id: incoming.id, accept: false }); }
  });
}

export { describeSide, canUse, badgesNeeded };
