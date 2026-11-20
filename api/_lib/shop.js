// Loja de Diamantes (cosméticos) + pagamento Pix pelo Mercado Pago + feed global + avisos do admin.
import { createHmac, randomUUID } from 'node:crypto';
import { HttpError, getOrCreateProfile, mutateProfile } from './core.js';
import { DEFAULT_SHOP, SHOP_KINDS, EQUIP_KINDS, PRESETS_BY_KIND, VAULT_BONUS, sanitizeCosmetic } from '../../shared/data/cosmetics.js';
import { getSpecies } from '../../shared/data/pokemon.js';

const bad = m => { throw new HttpError(400, m); };
const MP_API = 'https://api.mercadopago.com';

// ------------------------------------------------------------------ configuração editável
export async function getShop(db) {
  let cfg = null;
  try { cfg = await db.getConfig('shop'); } catch (e) { console.error('[shop]', e.message); }
  return {
    // itens novos do catálogo padrão entram na vitrine salva pelo admin (ele pode desativar depois)
    items: Array.isArray(cfg?.items) ? [...cfg.items, ...DEFAULT_SHOP.items.filter(d => !cfg.items.some(i => i.id === d.id))] : DEFAULT_SHOP.items,
    packages: Array.isArray(cfg?.packages) ? cfg.packages : DEFAULT_SHOP.packages
  };
}

/** Valida a vitrine enviada pelo admin. */
export function cleanShop(input) {
  const str = (v, n) => String(v ?? '').replace(/[<>"`]/g, '').trim().slice(0, n);
  const items = (input.items || []).map(it => {
    const kind = SHOP_KINDS[it.kind] ? it.kind : 'title';
    let value = str(it.value, 30);
    const presets = PRESETS_BY_KIND[kind];
    if (presets && !presets[value]) bad(`Valor inválido em "${it.name}" (${SHOP_KINDS[kind]}). Use: ${Object.keys(presets).join(', ')}`);
    const id = str(it.id, 40).replace(/[^a-z0-9_]/gi, '_') || 'item_' + randomUUID().slice(0, 6);
    return { id, kind, value, name: str(it.name, 40) || id, desc: str(it.desc, 140), price: Math.max(0, Math.round(Number(it.price) || 0)), active: it.active !== false };
  });
  const ids = new Set();
  items.forEach(i => { if (ids.has(i.id)) bad(`ID repetido: ${i.id}`); ids.add(i.id); });
  const packages = (input.packages || []).map(p => ({
    id: str(p.id, 30).replace(/[^a-z0-9_]/gi, '_') || 'p' + randomUUID().slice(0, 6),
    name: str(p.name, 40) || 'Pacote',
    diamonds: Math.max(1, Math.round(Number(p.diamonds) || 0)),
    bonus: Math.max(0, Math.round(Number(p.bonus) || 0)),
    price: Math.max(1, Math.round((Number(String(p.price).replace(',', '.')) || 0) * 100) / 100),
    active: p.active !== false
  }));
  return { items, packages };
}

/** Conveniência já comprada? (guardada em stats para não depender da vitrine) */
export function serviceOwned(profile, value) {
  const st = profile?.stats || {};
  return value === 'vault50' ? !!st.vaultBonus : value === 'nickname' ? !!st.nicknames : false;
}

function myCosmetics(profile) {
  const c = profile.cosmetics || {};
  return { owned: Array.isArray(c.owned) ? c.owned : [], equipped: c.equipped || {} };
}

/** Cosmético equipado no formato que o motor entende ({ aura, frame, title }). */
export async function equippedCosmetic(db, profile) {
  const { equipped } = myCosmetics(profile);
  const { items } = await getShop(db);
  const find = id => items.find(i => i.id === id);
  return sanitizeCosmetic({
    aura: find(equipped.ball_style)?.value,
    frame: find(equipped.frame)?.value,
    title: find(equipped.title)?.value,
    dice: find(equipped.dice)?.value,
    arena: find(equipped.arena)?.value,
    card: find(equipped.card)?.value,
    victory: find(equipped.victory)?.value,
    skin: find(equipped.skin)?.value
  });
}

/** Atualiza o visual do jogador nas partidas em andamento (aparece na hora para todos). */
export async function refreshCosmeticInMatches(db, userId, profile) {
  try {
    const cosmetic = await equippedCosmetic(db, profile);
    const list = (await db.myMatches(userId)).filter(m => m.status === 'playing');
    for (const brief of list) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const row = await db.getMatch(brief.id);
        if (!row?.state?.players) break;
        const pl = row.state.players.find(p => p.id === userId);
        if (!pl || JSON.stringify(pl.cosmetic || null) === JSON.stringify(cosmetic)) break;
        const state = { ...row.state, fx: [], players: row.state.players.map(p => (p.id === userId ? { ...p, cosmetic } : p)) };
        if (await db.updateMatch(row.id, row.version, { state, version: row.version + 1 })) break;
      }
    }
  } catch (e) { console.error('[cosmetic-refresh]', e.message); }
}

// ------------------------------------------------------------------ API da loja
export async function shopOp(db, user, body, req) {
  const profile = await getOrCreateProfile(db, user);
  const shop = await getShop(db);
  const mine = myCosmetics(profile);
  const view = p => ({ diamonds: p.diamonds || 0, ...myCosmetics(p), vaultBonus: !!p.stats?.vaultBonus, nicknames: !!p.stats?.nicknames });

  switch (body.op) {
    case 'catalog':
      return {
        items: shop.items.filter(i => i.active),
        packages: shop.packages.filter(p => p.active),
        pixEnabled: !!process.env.MP_ACCESS_TOKEN || !!globalThis.__PMHX_DB__,
        me: view(profile),
        purchases: (await db.listPayments(10, user.id)).map(p => ({ id: p.id, diamonds: p.diamonds, amount: p.amount, status: p.status, at: p.created_at }))
      };

    case 'buy': {
      const item = shop.items.find(i => i.id === body.itemId && i.active);
      if (!item) bad('Item indisponível.');
      if (mine.owned.includes(item.id)) bad('Você já tem este item.');
      if (item.kind === 'service' && serviceOwned(profile, item.value)) bad('Você já tem esta conveniência.');
      const left = await db.addDiamonds(user.id, -item.price);
      if (left === null) bad('Diamantes insuficientes.');
      if (item.kind === 'service') {
        const p = await mutateProfile(db, user.id, prof => {
          const c = myCosmetics(prof), st = { ...(prof.stats || {}) };
          if (item.value === 'vault50') st.vaultBonus = VAULT_BONUS;
          if (item.value === 'nickname') st.nicknames = true;
          return { stats: st, cosmetics: { owned: [...new Set([...c.owned, item.id])], equipped: c.equipped } };
        });
        return { me: view(p), message: item.value === 'vault50' ? 'Coleção ampliada para 350 vagas!' : 'Apelidos liberados! Abra a Coleção e toque no ✏️ de um Pokémon.' };
      }
      const cosmetics = { owned: [...mine.owned, item.id], equipped: { ...mine.equipped, [item.kind]: item.id } };
      const p = await db.upsertProfile(user.id, { cosmetics });
      await refreshCosmeticInMatches(db, user.id, p);
      return { me: view(p), message: `${item.name} liberado e equipado!` };
    }

    case 'equip': {
      const slot = String(body.slot || '');
      if (!EQUIP_KINDS.includes(slot)) bad('Tipo inválido.');
      if (body.itemId && !mine.owned.includes(body.itemId)) bad('Você não tem este item.');
      const cosmetics = { owned: mine.owned, equipped: { ...mine.equipped, [slot]: body.itemId || null } };
      const p = await db.upsertProfile(user.id, { cosmetics });
      await refreshCosmeticInMatches(db, user.id, p);
      return { me: view(p) };
    }

    case 'pix_create': {
      const pkg = shop.packages.find(p => p.id === body.packageId && p.active);
      if (!pkg) bad('Pacote indisponível.');
      const total = pkg.diamonds + pkg.bonus;
      const pay = await db.insertPayment({ user_id: user.id, package_id: pkg.id, diamonds: total, amount: pkg.price, status: 'pending' });
      if (globalThis.__PMHX_DB__ && !process.env.MP_ACCESS_TOKEN) {
        // Desenvolvimento: Pix de mentira, aprovável pelo botão "simular"
        return { paymentId: pay.id, dev: true, amount: pkg.price, diamonds: total, qrCode: '00020126-PIX-DE-TESTE', qrBase64: null, ticketUrl: null };
      }
      if (!process.env.MP_ACCESS_TOKEN) bad('Pagamentos ainda não configurados (falta MP_ACCESS_TOKEN na Vercel).');
      if (!user.email) bad('Sua conta precisa de e-mail para pagar com Pix.');
      const origin = siteOrigin(req);
      const mp = await mpFetch('/v1/payments', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': pay.id },
        body: {
          transaction_amount: pkg.price,
          description: `Doação ao Pokémon Master Trainer HEX (agradecimento: ${total} diamantes)`,
          payment_method_id: 'pix',
          payer: { email: user.email },
          external_reference: pay.id,
          notification_url: `${origin}/api/mp-webhook`,
          date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString().replace('Z', '-00:00'),
          metadata: { user_id: user.id, package_id: pkg.id }
        }
      });
      await db.updatePaymentIf(pay.id, ['pending'], { mp_payment_id: String(mp.id) });
      const td = mp.point_of_interaction?.transaction_data || {};
      return { paymentId: pay.id, amount: pkg.price, diamonds: total, qrCode: td.qr_code, qrBase64: td.qr_code_base64, ticketUrl: td.ticket_url };
    }

    case 'pix_status': {
      const pay = await db.getPayment(body.paymentId);
      if (!pay || pay.user_id !== user.id) bad('Pagamento não encontrado.');
      if (pay.status === 'pending' && pay.mp_payment_id) await syncMpPayment(db, pay.mp_payment_id);
      const now = await db.getPayment(pay.id);
      const p = await db.getProfile(user.id);
      return { status: now.status, me: view(p) };
    }

    case 'dev_approve': {
      if (!globalThis.__PMHX_DB__) bad('Só no modo de desenvolvimento.');
      const pay = await db.getPayment(body.paymentId);
      if (!pay || pay.user_id !== user.id) bad('Pagamento não encontrado.');
      await creditPayment(db, pay.id);
      return { ok: true };
    }

    default:
      bad('Operação inválida.');
  }
}

function siteOrigin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  return host ? `https://${host}` : 'https://localhost';
}

async function mpFetch(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await fetch(MP_API + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('[mercadopago]', r.status, data);
    throw new HttpError(502, `Mercado Pago recusou: ${data.message || r.status}`);
  }
  return data;
}

/** Consulta o pagamento no Mercado Pago (fonte da verdade) e credita se aprovado. */
export async function syncMpPayment(db, mpId) {
  const mp = await mpFetch(`/v1/payments/${encodeURIComponent(mpId)}`);
  const ref = mp.external_reference;
  if (!ref) return null;
  const pay = await db.getPayment(ref);
  if (!pay) return null;
  if (mp.status === 'approved') {
    if (Math.abs(Number(mp.transaction_amount) - Number(pay.amount)) > 0.01) {
      console.error('[mercadopago] valor diferente', mp.transaction_amount, pay.amount);
      return pay;
    }
    await creditPayment(db, pay.id, String(mp.id));
  } else if (['rejected', 'cancelled'].includes(mp.status)) {
    await db.updatePaymentIf(pay.id, ['pending'], { status: mp.status });
  }
  return db.getPayment(pay.id);
}

/** Credita os diamantes UMA vez (a troca de status é condicional). */
export async function creditPayment(db, paymentId, mpId) {
  const ok = await db.updatePaymentIf(paymentId, ['pending', 'approved'], { status: 'credited', credited_at: new Date().toISOString(), ...(mpId ? { mp_payment_id: mpId } : {}) });
  if (!ok) return false;
  const pay = await db.getPayment(paymentId);
  await db.addDiamonds(pay.user_id, pay.diamonds);
  return true;
}

/** Webhook do Mercado Pago: valida a assinatura (se houver segredo) e consulta o pagamento na API. */
export async function mpWebhook(db, body, req) {
  const url = new URL(req.url, 'http://x');
  const id = body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
  const type = body?.type || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic');
  if (!id || (type && type !== 'payment')) return { ignored: true };
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (secret) {
    const sig = String(req.headers['x-signature'] || '');
    const parts = Object.fromEntries(sig.split(',').map(kv => kv.trim().split('=')));
    const manifest = `id:${String(id).toLowerCase()};request-id:${req.headers['x-request-id'] || ''};ts:${parts.ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');
    if (!parts.v1 || parts.v1 !== expected) throw new HttpError(401, 'Assinatura inválida.');
  }
  await syncMpPayment(db, id);
  return { ok: true };
}

// ------------------------------------------------------------------ feed global e avisos
export async function feedOp(db, body) {
  // mural do início: últimas capturas de lendários e shinies
  if (body.kinds === 'captures') {
    const rows = db.listFeedKinds ? await db.listFeedKinds(['shiny', 'legendary'], 15) : [];
    return { captures: rows.map(r => ({ id: r.id, kind: r.kind, text: r.text, sp: r.data?.sp, shiny: !!r.data?.shiny, name: r.data?.name, avatar: r.data?.avatar, at: r.created_at })) };
  }
  const since = Math.max(0, Number(body.since) || 0);
  const events = await db.listFeed(since, 20);
  return { events };
}

/** Publica no feed as capturas que merecem anúncio para todos (lendários e shinies). */
export async function publishCaptures(db, state, fxList) {
  for (const f of fxList || []) {
    // 'placed' = qualquer Pokémon novo (captura, Raid, ovo, prêmio de insígnia)
    if (f.k !== 'placed') continue;
    const sp = f.sp, shiny = !!f.shiny;
    const species = getSpecies(sp);
    if (!shiny && species.tier < 5) continue;
    const p = state.players.find(x => x.id === f.pid);
    if (!p || p.id.startsWith('cpu_')) continue;
    const what = `${species.name}${shiny ? ' ✨SHINY✨' : ''}`;
    await db.insertFeed({
      kind: shiny ? 'shiny' : 'legendary',
      text: `${p.name} ${f.via === 'egg' ? 'chocou' : 'capturou'} ${species.tier >= 5 ? 'o lendário ' : ''}${what}!`,
      data: { sp, shiny, name: p.name, avatar: p.avatar }
    });
  }
}

export async function getAnnouncement(db) {
  const a = await db.getConfig('announcement');
  return a && a.active ? a : null;
}
