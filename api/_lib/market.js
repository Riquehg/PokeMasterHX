// Mercado Global — jogadores anunciam Pokémon da Coleção por ouro da conta e/ou diamantes,
// e recebem ofertas (Pokémon + ouro + diamantes). Tudo em custódia (escrow):
//  - anunciar tira o Pokémon da Coleção do vendedor até vender ou cancelar;
//  - ofertar reserva o ouro/diamantes/Pokémon de quem oferta até a resposta.
// As mudanças em dinheiro usam a função atômica wallet_add; a Coleção usa gravação condicional (rev).
import { bad, notFound, mutateProfile, collectionMax } from './core.js';
import { getSpecies } from '../../shared/data/pokemon.js';
import { ITEMS, isKeepable, BAG_MAX_PER_ITEM } from '../../shared/data/items.js';

export const MARKET_FEE = 0.05;          // taxa do mercado (sai de circulação: ajuda a economia)
export const MAX_OPEN_LISTINGS = 10;
export const MAX_PENDING_OFFERS = 8;
export const MAX_PRICE = 1_000_000;
const MAX_OFFER_MONS = 6;

const int = (v, max = MAX_PRICE) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const fee = v => Math.floor(v * MARKET_FEE);

function pubListing(r) {
  return {
    id: r.id, sellerId: r.seller_id, sellerName: r.seller_name, mon: r.mon, sp: r.sp, tier: r.tier, lvl: r.lvl, shiny: r.shiny,
    priceGold: r.price_gold, priceDiamonds: r.price_diamonds, acceptOffers: r.accept_offers, status: r.status,
    buyerName: r.buyer_name || null, soldGold: r.sold_gold ?? null, soldDiamonds: r.sold_diamonds ?? null, createdAt: r.created_at, updatedAt: r.updated_at
  };
}
function pubOffer(o) {
  return { id: o.id, listingId: o.listing_id, buyerId: o.buyer_id, buyerName: o.buyer_name, gold: o.gold, diamonds: o.diamonds, mons: o.mons || [], status: o.status, createdAt: o.created_at };
}

/** UIDs de Pokémon que o jogador está usando em partidas em andamento (não podem sair da Coleção). */
async function busyUids(db, userId) {
  const set = new Set();
  for (const m of await db.myMatches(userId)) {
    if (m.status !== 'playing') continue;
    const row = m.state ? m : await db.getMatch(m.id);
    const p = row?.state?.players?.find(x => x.id === userId);
    if (p) for (const mon of [...p.team, ...p.box]) set.add(mon.uid);
  }
  return set;
}

/** Tira Pokémon da Coleção (falha se algum não existir). Devolve as entradas removidas. */
async function takeMons(db, userId, uids) {
  let taken = [];
  await mutateProfile(db, userId, prof => {
    const vault = prof.vault || [];
    taken = uids.map(uid => vault.find(m => m.uid === uid));
    if (taken.some(m => !m)) bad('Esse Pokémon não está mais na sua Coleção.');
    if (taken.some(m => m.fav)) bad('Tire a ⭐ de favorito antes de negociar esse Pokémon.');
    return { vault: vault.filter(m => !uids.includes(m.uid)) };
  });
  return taken;
}

// ---------------------------------------------------------------- 🎒 itens (Mochila da conta)
const isItemListing = l => l?.mon?.kind === 'item';
async function takeItems(db, userId, id, qty) {
  await mutateProfile(db, userId, prof => {
    const st = { ...(prof.stats || {}) };
    const bag = { ...(st.bag || {}) };
    if (!((bag[id] || 0) >= qty)) bad(`Você não tem ${qty}x ${ITEMS[id]?.name || id} na Mochila.`);
    bag[id] -= qty; if (!bag[id]) delete bag[id];
    st.bag = bag;
    return { stats: st };
  });
}
async function giveItems(db, userId, id, qty) {
  await mutateProfile(db, userId, prof => {
    const st = { ...(prof.stats || {}) };
    const bag = { ...(st.bag || {}) };
    bag[id] = Math.min(BAG_MAX_PER_ITEM * 2, (bag[id] || 0) + qty); // nunca perde o que comprou
    st.bag = bag;
    return { stats: st };
  });
}
/** Entrega o que estava anunciado (Pokémon ou itens). */
async function deliverListing(db, userId, l) {
  if (isItemListing(l)) return giveItems(db, userId, l.mon.item, l.mon.qty);
  return giveMons(db, userId, [l.mon]);
}

/** Coloca Pokémon na Coleção (e na Pokédex). */
async function giveMons(db, userId, mons) {
  if (!mons.length) return;
  await mutateProfile(db, userId, prof => {
    const vault = [...(prof.vault || [])];
    for (const m of mons) {
      const uid = vault.some(v => v.uid === m.uid) ? `${m.uid}_${Math.random().toString(36).slice(2, 6)}` : m.uid; // nunca perde um Pokémon por uid repetido
      vault.unshift({ ...m, uid, fav: false, from: 'market', at: new Date().toISOString() });
    }
    const pokedex = [...new Set([...(prof.pokedex || []), ...mons.map(m => m.sp)])];
    const seen = [...new Set([...(prof.pokedex_seen || []), ...mons.map(m => m.sp)])];
    return { vault, pokedex, pokedex_seen: seen };
  });
}

async function vaultRoom(db, userId, n) {
  const prof = await db.getProfile(userId);
  const cap = collectionMax(prof);
  if ((prof?.vault || []).length + n > cap) bad(`Sua Coleção está cheia (${cap}). Solte ou venda alguns Pokémon antes.`);
}

async function refundOffer(db, o) {
  if (o.gold || o.diamonds) await db.walletAdd(o.buyer_id, o.diamonds, o.gold);
  await giveMons(db, o.buyer_id, o.mons || []);
}

async function announce(db, listing, buyerName, gold, diamonds) {
  const sp = getSpecies(listing.sp);
  if (!db.insertFeed || !sp || !(sp.tier >= 5 || listing.shiny)) return;
  const price = [diamonds ? `${diamonds} 💎` : '', gold ? `${gold} 🪙` : ''].filter(Boolean).join(' + ') || 'uma troca';
  try {
    await db.insertFeed({ kind: 'market', text: `💰 ${buyerName} comprou ${sp.name}${listing.shiny ? ' ✨' : ''} de ${listing.seller_name} no Mercado por ${price}!`,
      data: { sp: listing.sp, shiny: listing.shiny } });
  } catch { /* ok */ }
}

/** Fecha uma venda já travada (listing em 'locked'): paga o vendedor, entrega o Pokémon, recusa as outras ofertas. */
async function settle(db, listing, buyer, gold, diamonds, offerMons = []) {
  await db.walletAdd(listing.seller_id, diamonds - fee(diamonds), gold - fee(gold));
  await giveMons(db, listing.seller_id, offerMons);
  await deliverListing(db, buyer.id, listing);
  await db.updateListingIf(listing.id, ['locked'], { status: 'sold', buyer_id: buyer.id, buyer_name: buyer.name, sold_gold: gold, sold_diamonds: diamonds });
  for (const o of await db.listOffers({ listingId: listing.id, status: 'pending' })) {
    if (await db.updateOfferIf(o.id, ['pending'], { status: 'declined' })) await refundOffer(db, o);
  }
  await announce(db, listing, buyer.name, gold, diamonds);
}

export async function marketOp(db, user, body) {
  const me = await db.getProfile(user.id);
  if (!me) notFound('Perfil não encontrado.');
  const myName = me.trainer_name || 'Treinador';

  switch (body.op) {
    case 'browse': {
      const tier = int(body.tier, 5) || undefined;
      let rows = await db.listListings({ status: 'open', tier: body.kind === 'items' ? undefined : tier, shiny: !!body.shiny, sp: body.sp || undefined, limit: 160 });
      const q = String(body.q || '').toLowerCase().trim();
      if (body.kind === 'items') rows = rows.filter(r => String(r.sp).startsWith('item:'));
      if (body.kind === 'mons') rows = rows.filter(r => !String(r.sp).startsWith('item:'));
      const label = r => (String(r.sp).startsWith('item:') ? ITEMS[r.mon?.item]?.name || '' : getSpecies(r.sp)?.name || r.sp);
      if (q) rows = rows.filter(r => label(r).toLowerCase().includes(q) || (r.seller_name || '').toLowerCase().includes(q));
      if (body.sort === 'price') rows.sort((a, b) => (a.price_diamonds * 100 + a.price_gold) - (b.price_diamonds * 100 + b.price_gold));
      if (body.sort === 'level') rows.sort((a, b) => b.lvl - a.lvl);
      const recent = await db.listListings({ status: 'sold', limit: 12 });
      return { listings: rows.map(pubListing), recent: recent.map(pubListing), wallet: { gold: me.gold || 0, diamonds: me.diamonds || 0 }, fee: MARKET_FEE };
    }

    case 'mine': {
      const listings = await db.listListings({ sellerId: user.id, status: ['open', 'locked', 'sold', 'cancelled'], limit: 40 });
      const received = await db.listOffers({ sellerId: user.id, status: 'pending' });
      const sent = await db.listOffers({ buyerId: user.id, limit: 40 });
      const lmap = {};
      for (const o of [...received, ...sent]) if (!lmap[o.listing_id]) lmap[o.listing_id] = await db.getListing(o.listing_id);
      return {
        listings: listings.map(pubListing),
        received: received.map(o => ({ ...pubOffer(o), listing: lmap[o.listing_id] ? pubListing(lmap[o.listing_id]) : null })),
        sent: sent.map(o => ({ ...pubOffer(o), listing: lmap[o.listing_id] ? pubListing(lmap[o.listing_id]) : null })),
        wallet: { gold: me.gold || 0, diamonds: me.diamonds || 0 }, fee: MARKET_FEE
      };
    }

    case 'create': {
      const priceGold = int(body.priceGold), priceDiamonds = int(body.priceDiamonds);
      const acceptOffers = body.acceptOffers !== false;
      if (!priceGold && !priceDiamonds && !acceptOffers) bad('Defina um preço ou aceite ofertas.');
      const open = await db.listListings({ sellerId: user.id, status: ['open', 'locked'] });
      if (open.length >= MAX_OPEN_LISTINGS) bad(`Você já tem ${MAX_OPEN_LISTINGS} anúncios abertos.`);
      const uid = String(body.uid || '');
      if ((await busyUids(db, user.id)).has(uid)) bad('Esse Pokémon está em uma partida em andamento. Termine a partida antes de anunciar.');
      const [mon] = await takeMons(db, user.id, [uid]);
      const sp = getSpecies(mon.sp);
      const row = await db.insertListing({
        seller_id: user.id, seller_name: myName, mon, sp: mon.sp, tier: sp?.tier || 1, lvl: mon.lvl || 1, shiny: !!mon.shiny,
        price_gold: priceGold, price_diamonds: priceDiamonds, accept_offers: acceptOffers, status: 'open'
      });
      return { listing: pubListing(row), message: `${sp?.name || mon.sp} anunciado no Mercado!` };
    }

    case 'create_item': { // 🎒 anunciar itens da Mochila da conta
      const id = String(body.item || '');
      const qty = Math.max(1, Math.min(BAG_MAX_PER_ITEM, Math.floor(Number(body.qty) || 1)));
      if (!isKeepable(id)) bad('Esse item não pode ser negociado (só Pokébolas, Amuleto Shiny e TM).');
      const priceGold = int(body.priceGold), priceDiamonds = int(body.priceDiamonds);
      const acceptOffers = body.acceptOffers !== false;
      if (!priceGold && !priceDiamonds && !acceptOffers) bad('Defina um preço ou aceite ofertas.');
      const open = await db.listListings({ sellerId: user.id, status: ['open', 'locked'] });
      if (open.length >= MAX_OPEN_LISTINGS) bad(`Você já tem ${MAX_OPEN_LISTINGS} anúncios abertos.`);
      await takeItems(db, user.id, id, qty);
      let row;
      try {
        row = await db.insertListing({
          seller_id: user.id, seller_name: myName, mon: { kind: 'item', item: id, qty }, sp: 'item:' + id, tier: 0, lvl: qty, shiny: false,
          price_gold: priceGold, price_diamonds: priceDiamonds, accept_offers: acceptOffers, status: 'open'
        });
      } catch (e) { await giveItems(db, user.id, id, qty); throw e; }
      return { listing: pubListing(row), message: `${qty}x ${ITEMS[id].name} anunciado no Mercado!` };
    }

    case 'cancel': {
      const l = await db.getListing(body.listingId);
      if (!l) notFound('Anúncio não encontrado.');
      if (l.seller_id !== user.id && !me.is_admin) bad('Esse anúncio não é seu.');
      const locked = await db.updateListingIf(l.id, ['open'], { status: 'cancelled' });
      if (!locked) bad('Esse anúncio não está mais aberto.');
      await deliverListing(db, l.seller_id, l);
      for (const o of await db.listOffers({ listingId: l.id, status: 'pending' })) {
        if (await db.updateOfferIf(o.id, ['pending'], { status: 'declined' })) await refundOffer(db, o);
      }
      return { ok: true, message: isItemListing(l) ? 'Anúncio cancelado. Os itens voltaram para a sua Mochila.' : 'Anúncio cancelado. O Pokémon voltou para a sua Coleção.' };
    }

    case 'buy': {
      const l = await db.getListing(body.listingId);
      if (!l || l.status !== 'open') bad('Esse anúncio não está mais disponível.');
      if (l.seller_id === user.id) bad('Você não pode comprar o próprio anúncio.');
      if (!l.price_gold && !l.price_diamonds) bad('Esse anúncio só aceita ofertas.');
      if (!isItemListing(l)) await vaultRoom(db, user.id, 1);
      const locked = await db.updateListingIf(l.id, ['open'], { status: 'locked', buyer_id: user.id });
      if (!locked) bad('Alguém foi mais rápido! Esse anúncio não está mais disponível.');
      const paid = await db.walletAdd(user.id, -l.price_diamonds, -l.price_gold);
      if (!paid) {
        await db.updateListingIf(l.id, ['locked'], { status: 'open', buyer_id: null });
        bad(`Saldo insuficiente: precisa de ${l.price_gold} 🪙 e ${l.price_diamonds} 💎.`);
      }
      await settle(db, l, { id: user.id, name: myName }, l.price_gold, l.price_diamonds);
      return { ok: true, wallet: paid, message: isItemListing(l) ? `Você comprou ${l.mon.qty}x ${ITEMS[l.mon.item]?.name}! Já está na sua 🎒 Mochila.` : `Você comprou ${getSpecies(l.sp)?.name || l.sp}! Ele já está na sua Coleção.` };
    }

    case 'offer': {
      const l = await db.getListing(body.listingId);
      if (!l || l.status !== 'open') bad('Esse anúncio não está mais disponível.');
      if (l.seller_id === user.id) bad('Você não pode ofertar no próprio anúncio.');
      if (!l.accept_offers) bad('Esse anúncio não aceita ofertas.');
      const gold = int(body.gold), diamonds = int(body.diamonds);
      const uids = [...new Set((Array.isArray(body.uids) ? body.uids : []).map(String))].slice(0, MAX_OFFER_MONS);
      if (!gold && !diamonds && !uids.length) bad('Ofereça ouro, diamantes ou Pokémon.');
      const pending = await db.listOffers({ buyerId: user.id, status: 'pending' });
      if (pending.length >= MAX_PENDING_OFFERS) bad(`Você já tem ${MAX_PENDING_OFFERS} ofertas aguardando resposta.`);
      if (pending.some(o => o.listing_id === l.id)) bad('Você já tem uma oferta neste anúncio. Cancele antes de fazer outra.');
      const busy = await busyUids(db, user.id);
      if (uids.some(u => busy.has(u))) bad('Um desses Pokémon está em uma partida em andamento.');
      const paid = (gold || diamonds) ? await db.walletAdd(user.id, -diamonds, -gold) : { gold: me.gold, diamonds: me.diamonds };
      if (!paid) bad('Saldo insuficiente para essa oferta.');
      let mons = [];
      try { mons = await takeMons(db, user.id, uids); } catch (e) {
        if (gold || diamonds) await db.walletAdd(user.id, diamonds, gold);
        throw e;
      }
      const o = await db.insertOffer({ listing_id: l.id, seller_id: l.seller_id, buyer_id: user.id, buyer_name: myName, gold, diamonds, mons, status: 'pending' });
      return { offer: pubOffer(o), wallet: paid, message: 'Oferta enviada! O valor fica reservado até o vendedor responder.' };
    }

    case 'offer_cancel': {
      const o = await db.getOffer(body.offerId);
      if (!o || o.buyer_id !== user.id) notFound('Oferta não encontrada.');
      if (!(await db.updateOfferIf(o.id, ['pending'], { status: 'cancelled' }))) bad('Essa oferta já foi respondida.');
      await refundOffer(db, o);
      return { ok: true, message: 'Oferta cancelada. Tudo voltou para você.' };
    }

    case 'offer_respond': {
      const o = await db.getOffer(body.offerId);
      if (!o || o.seller_id !== user.id) notFound('Oferta não encontrada.');
      if (!body.accept) {
        if (!(await db.updateOfferIf(o.id, ['pending'], { status: 'declined' }))) bad('Essa oferta já foi respondida.');
        await refundOffer(db, o);
        return { ok: true, message: 'Oferta recusada.' };
      }
      await vaultRoom(db, user.id, (o.mons || []).length);
      const l = await db.updateListingIf(o.listing_id, ['open'], { status: 'locked', buyer_id: o.buyer_id });
      if (!l) bad('O anúncio não está mais aberto.');
      if (!(await db.updateOfferIf(o.id, ['pending'], { status: 'accepted' }))) {
        await db.updateListingIf(o.listing_id, ['locked'], { status: 'open', buyer_id: null });
        bad('Essa oferta foi cancelada.');
      }
      await settle(db, l, { id: o.buyer_id, name: o.buyer_name }, o.gold, o.diamonds, o.mons || []);
      return { ok: true, message: 'Negócio fechado! Os itens da oferta foram para você.' };
    }

    default:
      bad('Operação inválida.');
  }
}
