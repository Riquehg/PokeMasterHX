// 🏪 Mercado Global — comprar, anunciar e negociar Pokémon da Coleção (ouro da conta e diamantes).
import { getSpecies } from '../../shared/data/pokemon.js';
import { natureLabel } from '../../shared/data/natures.js';
import { api } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { monSprite } from '../config.js';
import { typeChips } from './common.js';

const TIER = { 1: 'Rosa', 2: 'Verde', 3: 'Azul', 4: 'Vermelho', 5: 'Lendário' };
const price = (g, d) => [d ? `<b class="diamonds">💎 ${d}</b>` : '', g ? `<b style="color:var(--gold)">🪙 ${g}</b>` : ''].filter(Boolean).join(' + ') || '<span class="muted">só ofertas</span>';

function monBlock(m, extra = '') {
  const sp = getSpecies(m.sp);
  return `<div class="mk-mon"><img src="${monSprite(m)}" alt="${esc(sp?.name)}" loading="lazy">
    <div class="grow"><b>${esc(sp?.name || m.sp)}</b>${m.shiny ? ' ✨' : ''} <span class="tiny muted">Nv.${m.lvl}</span>
      <div>${typeChips(sp?.types || [])} <span class="chip">T${sp?.tier} · ${TIER[sp?.tier] || ''}</span></div>
      ${m.nature ? `<div class="tiny muted">${esc(natureLabel(m.nature))}</div>` : ''}${extra}</div></div>`;
}

/**
 * Abre o Mercado. profile: perfil (para a lista da Coleção ao anunciar/ofertar). onChange(): recarrega o hub.
 */
export async function openMarket(profile, onChange) {
  const st = { tab: 'buy', q: '', tier: 0, shiny: false, sort: 'new', data: null, mine: null, busy: false };
  const ov = openModal('market', '🏪 Mercado Global', '<p class="muted"><span class="spinner"></span> Carregando...</p>', { wide: true, onClose: () => onChange && onChange() });

  const wallet = () => {
    const w = (st.tab === 'buy' ? st.data?.wallet : st.mine?.wallet) || { gold: profile?.gold || 0, diamonds: profile?.diamonds || 0 };
    return `<div class="mk-wallet"><span>Seu saldo:</span> <span class="chip gold">🪙 ${w.gold} ouro</span> <span class="chip diamonds">💎 ${w.diamonds}</span>
      <span class="tiny muted">Ouro da conta: ganho no fim de cada partida (Treino e Online). Taxa do mercado: ${Math.round((st.data?.fee ?? 0.05) * 100)}% para o vendedor.</span></div>`;
  };
  const tabs = () => `<div class="row mk-tabs">${[['buy', '🛒 Comprar'], ['sell', '🏷️ Vender'], ['deals', '🤝 Minhas negociações']].map(([k, l]) =>
    `<button class="btn sm ${st.tab === k ? 'primary' : ''}" data-act="tab" data-t="${k}">${l}${k === 'deals' && st.mine?.received?.length ? ` <span class="badge-dot">${st.mine.received.length}</span>` : ''}</button>`).join('')}</div>`;

  const buyView = () => {
    const d = st.data;
    if (!d) return '<p class="muted"><span class="spinner"></span></p>';
    return `<div class="dex-controls">
        <input class="input" id="mk-q" placeholder="Buscar Pokémon ou vendedor" value="${esc(st.q)}" style="flex:1;min-width:140px">
        <select class="input" id="mk-tier"><option value="0">Todos os tiers</option>${[1, 2, 3, 4, 5].map(t => `<option value="${t}" ${st.tier === t ? 'selected' : ''}>Tier ${t} · ${TIER[t]}</option>`).join('')}</select>
        <select class="input" id="mk-sort"><option value="new">Mais recentes</option><option value="price" ${st.sort === 'price' ? 'selected' : ''}>Menor preço</option><option value="level" ${st.sort === 'level' ? 'selected' : ''}>Maior nível</option></select>
        <label class="small"><input type="checkbox" id="mk-shiny" ${st.shiny ? 'checked' : ''}> só ✨</label>
        <button class="btn sm" data-act="search">🔎</button></div>
      <div class="mk-grid">${d.listings.map(l => `<div class="mk-card ${l.shiny ? 'shiny' : ''} ${l.tier >= 5 ? 'legend' : ''}">
          ${monBlock({ ...l.mon, sp: l.sp, lvl: l.lvl, shiny: l.shiny })}
          <div class="small">Vendedor: <b>${esc(l.sellerName)}</b></div>
          <div class="mk-price">${price(l.priceGold, l.priceDiamonds)}</div>
          <div class="row">${l.priceGold || l.priceDiamonds ? `<button class="btn sm green grow" data-act="buy" data-id="${l.id}">Comprar</button>` : ''}
            ${l.acceptOffers ? `<button class="btn sm blue grow" data-act="offer" data-id="${l.id}">Fazer oferta</button>` : ''}</div></div>`).join('') || '<p class="muted">Nenhum anúncio com esses filtros. Que tal anunciar o primeiro?</p>'}</div>
      ${d.recent?.length ? `<h3 style="margin-top:14px">💰 Vendas recentes</h3><div class="mk-recent">${d.recent.map(l => `<span class="chip">${esc(getSpecies(l.sp)?.name)}${l.shiny ? ' ✨' : ''} → ${esc(l.buyerName || '?')} · ${price(l.soldGold, l.soldDiamonds)}</span>`).join('')}</div>` : ''}`;
  };

  const sellView = () => {
    const vault = (profile?.vault || []).filter(m => !m.fav);
    return `<p class="small muted">Escolha um Pokémon da sua Coleção. Ele sai da Coleção enquanto estiver anunciado (cancelando, ele volta). ⭐ Favoritos não aparecem aqui.</p>
      <div class="trade-mons" style="max-height:300px">${vault.map(m => `<button type="button" class="trade-mon ${st.pick === m.uid ? 'on' : ''}" data-act="pick" data-uid="${esc(m.uid)}">
        <img src="${monSprite(m)}" alt=""><span>${esc(getSpecies(m.sp)?.name)}${m.shiny ? ' ✨' : ''}</span><span class="tiny">Nv.${m.lvl} · T${getSpecies(m.sp)?.tier}</span></button>`).join('') || '<p class="muted">Sua Coleção está vazia (ou só tem favoritos).</p>'}</div>
      <div class="grid2" style="margin-top:10px">
        <label class="small">🪙 Preço em ouro <input class="input" type="number" min="0" id="mk-pg" value="0"></label>
        <label class="small">💎 Preço em diamantes <input class="input" type="number" min="0" id="mk-pd" value="0"></label></div>
      <label class="small" style="display:block;margin:8px 0"><input type="checkbox" id="mk-ao" checked> Aceitar ofertas (Pokémon + ouro + diamantes)</label>
      <button class="btn primary block" data-act="list" ${st.pick ? '' : 'disabled'}>🏷️ Anunciar</button>`;
  };

  const dealsView = () => {
    const m = st.mine;
    if (!m) return '<p class="muted"><span class="spinner"></span></p>';
    const offerBody = o => `${o.gold ? `<span class="chip gold">🪙 ${o.gold}</span>` : ''}${o.diamonds ? `<span class="chip diamonds">💎 ${o.diamonds}</span>` : ''}
      ${(o.mons || []).map(x => `<span class="chip"><img src="${monSprite(x)}" style="width:22px;height:22px;vertical-align:middle"> ${esc(getSpecies(x.sp)?.name)}${x.shiny ? ' ✨' : ''} Nv.${x.lvl}</span>`).join('')}`;
    const status = { open: '🟢 aberto', locked: '⏳ processando', sold: '✅ vendido', cancelled: '⚪ cancelado', pending: '⏳ aguardando', accepted: '✅ aceita', declined: '❌ recusada' };
    return `<h3>📥 Ofertas recebidas</h3>${m.received.map(o => `<div class="mk-deal">
        <div>${o.listing ? monBlock({ ...o.listing.mon, sp: o.listing.sp, lvl: o.listing.lvl, shiny: o.listing.shiny }) : ''}</div>
        <div class="grow"><div class="small"><b>${esc(o.buyerName)}</b> oferece:</div>${offerBody(o)}</div>
        <div class="col" style="gap:4px"><button class="btn sm green" data-act="accept" data-id="${o.id}">Aceitar</button><button class="btn sm red" data-act="decline" data-id="${o.id}">Recusar</button></div></div>`).join('') || '<p class="muted small">Nenhuma oferta aguardando.</p>'}
      <h3 style="margin-top:12px">🏷️ Meus anúncios</h3>${m.listings.map(l => `<div class="mk-deal">
        ${monBlock({ ...l.mon, sp: l.sp, lvl: l.lvl, shiny: l.shiny })}
        <div class="grow small">${price(l.priceGold, l.priceDiamonds)} · ${status[l.status] || l.status}${l.status === 'sold' ? ` para <b>${esc(l.buyerName || '')}</b> por ${price(l.soldGold, l.soldDiamonds)}` : ''}</div>
        ${l.status === 'open' ? `<button class="btn sm" data-act="cancel" data-id="${l.id}">Cancelar</button>` : ''}</div>`).join('') || '<p class="muted small">Você ainda não anunciou nada.</p>'}
      <h3 style="margin-top:12px">📤 Ofertas que fiz</h3>${m.sent.map(o => `<div class="mk-deal">
        ${o.listing ? monBlock({ ...o.listing.mon, sp: o.listing.sp, lvl: o.listing.lvl, shiny: o.listing.shiny }) : ''}
        <div class="grow"><div class="small">${status[o.status] || o.status}</div>${offerBody(o)}</div>
        ${o.status === 'pending' ? `<button class="btn sm" data-act="ocancel" data-id="${o.id}">Cancelar</button>` : ''}</div>`).join('') || '<p class="muted small">Nenhuma oferta enviada.</p>'}`;
  };

  const draw = () => setModalBody('market', `${wallet()}${tabs()}<div class="mk-body">${st.tab === 'buy' ? buyView() : st.tab === 'sell' ? sellView() : dealsView()}</div>`);

  async function refresh() {
    try {
      const [d, mine, prof] = await Promise.all([
        api('market', { op: 'browse', q: st.q, tier: st.tier, shiny: st.shiny, sort: st.sort }),
        api('market', { op: 'mine' }),
        api('profile', { op: 'get' })
      ]);
      st.data = d; st.mine = mine; profile = prof.profile;
    } catch (e) { toast(e.message, 'bad'); }
    draw();
  }

  async function run(body, ok) {
    if (st.busy) return;
    st.busy = true;
    try {
      const r = await api('market', body);
      toast(r.message || ok || 'Feito!', 'good');
      st.pick = null;
      await refresh();
    } catch (e) { toast(e.message, 'bad'); }
    st.busy = false;
  }

  function offerModal(listingId) {
    const l = st.data?.listings.find(x => x.id === listingId);
    if (!l) return;
    const sel = new Set();
    const vault = (profile?.vault || []).filter(m => !m.fav);
    const body = () => `${monBlock({ ...l.mon, sp: l.sp, lvl: l.lvl, shiny: l.shiny })}
      <p class="small muted">O que você oferecer fica reservado até o vendedor responder (cancelando, volta tudo).</p>
      <div class="grid2"><label class="small">🪙 Ouro <input class="input" type="number" min="0" id="of-g" value="0"></label>
        <label class="small">💎 Diamantes <input class="input" type="number" min="0" id="of-d" value="0"></label></div>
      <div class="small" style="margin-top:8px">Pokémon da sua Coleção (até 6):</div>
      <div class="trade-mons">${vault.map(m => `<button type="button" class="trade-mon ${sel.has(m.uid) ? 'on' : ''}" data-act="of-pick" data-uid="${esc(m.uid)}">
        <img src="${monSprite(m)}" alt=""><span>${esc(getSpecies(m.sp)?.name)}${m.shiny ? ' ✨' : ''}</span><span class="tiny">Nv.${m.lvl}</span></button>`).join('') || '<p class="muted tiny">Coleção vazia.</p>'}</div>
      <button class="btn primary block" data-act="of-send">📨 Enviar oferta</button>`;
    const o = openModal('mk-offer', '📨 Fazer oferta', body());
    const keep = () => ({ g: o.querySelector('#of-g')?.value, d: o.querySelector('#of-d')?.value });
    bindActions(o, {
      'of-pick': d => {
        const v = keep();
        if (sel.has(d.uid)) sel.delete(d.uid); else if (sel.size < 6) sel.add(d.uid);
        setModalBody('mk-offer', body());
        o.querySelector('#of-g').value = v.g; o.querySelector('#of-d').value = v.d;
      },
      'of-send': async () => {
        const v = keep();
        closeModal('mk-offer');
        await run({ op: 'offer', listingId, gold: Number(v.g) || 0, diamonds: Number(v.d) || 0, uids: [...sel] });
      }
    });
  }

  const readFilters = () => {
    st.q = ov.querySelector('#mk-q')?.value.trim() || '';
    st.tier = Number(ov.querySelector('#mk-tier')?.value || 0);
    st.sort = ov.querySelector('#mk-sort')?.value || 'new';
    st.shiny = !!ov.querySelector('#mk-shiny')?.checked;
  };

  bindActions(ov, {
    tab: d => { st.tab = d.t; draw(); },
    search: async () => { readFilters(); await refresh(); },
    pick: d => {
      const pg = ov.querySelector('#mk-pg')?.value, pd = ov.querySelector('#mk-pd')?.value, ao = ov.querySelector('#mk-ao')?.checked;
      st.pick = st.pick === d.uid ? null : d.uid; draw();
      ov.querySelector('#mk-pg').value = pg; ov.querySelector('#mk-pd').value = pd; ov.querySelector('#mk-ao').checked = ao;
    },
    list: () => run({ op: 'create', uid: st.pick, priceGold: Number(ov.querySelector('#mk-pg').value) || 0, priceDiamonds: Number(ov.querySelector('#mk-pd').value) || 0, acceptOffers: ov.querySelector('#mk-ao').checked }),
    buy: d => {
      const l = st.data?.listings.find(x => x.id === d.id);
      if (l && confirm(`Comprar ${getSpecies(l.sp)?.name} por ${[l.priceDiamonds ? l.priceDiamonds + ' 💎' : '', l.priceGold ? l.priceGold + ' 🪙' : ''].filter(Boolean).join(' + ')}?`)) run({ op: 'buy', listingId: d.id });
    },
    offer: d => offerModal(d.id),
    cancel: d => { if (confirm('Cancelar este anúncio? O Pokémon volta para a sua Coleção.')) run({ op: 'cancel', listingId: d.id }); },
    accept: d => { if (confirm('Aceitar esta oferta? O Pokémon vai para quem ofertou.')) run({ op: 'offer_respond', offerId: d.id, accept: true }); },
    decline: d => run({ op: 'offer_respond', offerId: d.id, accept: false }),
    ocancel: d => run({ op: 'offer_cancel', offerId: d.id })
  });
  ov.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'mk-q') { readFilters(); refresh(); } });
  await refresh();
}
