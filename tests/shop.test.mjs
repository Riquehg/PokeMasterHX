// Loja de Diamantes, pagamentos (crédito único), cosméticos na partida, feed global e avisos do admin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { matchOp, profileOp, adminOp, configInfo, actionOp } from '../api/_lib/core.js';
import { shopOp, creditPayment, feedOp, publishCaptures } from '../api/_lib/shop.js';

globalThis.__PMHX_DB__ = true; // ativa o Pix de teste
async function setup() {
  const db = createMemoryDb();
  const admin = await db.verifyToken('dev:dono@kanto.com');
  const ash = await db.verifyToken('dev:ash@kanto.com');
  await profileOp(db, admin, { op: 'get' }); // primeiro = admin no banco em memória
  await profileOp(db, ash, { op: 'get' });
  return { db, admin, ash };
}

test('Pix: credita os diamantes do pacote uma única vez', async () => {
  const { db, ash } = await setup();
  const cat = await shopOp(db, ash, { op: 'catalog' });
  assert.equal(cat.me.diamonds, 0);
  const pkg = cat.packages.find(p => p.id === 'p300');
  const pix = await shopOp(db, ash, { op: 'pix_create', packageId: 'p300' });
  assert.equal(pix.diamonds, pkg.diamonds + pkg.bonus);
  assert.equal(pix.amount, pkg.price, 'preço vem do servidor');
  assert.equal(await creditPayment(db, pix.paymentId), true);
  assert.equal(await creditPayment(db, pix.paymentId), false, 'não credita duas vezes');
  const st = await shopOp(db, ash, { op: 'pix_status', paymentId: pix.paymentId });
  assert.equal(st.status, 'credited');
  assert.equal(st.me.diamonds, 330);
});

test('comprar cosmético desconta diamantes, equipa e não deixa saldo negativo', async () => {
  const { db, ash, admin } = await setup();
  await assert.rejects(shopOp(db, ash, { op: 'buy', itemId: 'style_gold' }), /insuficientes/);
  await adminOp(db, admin, { op: 'give_diamonds', userId: ash.id, amount: 200 });
  const r = await shopOp(db, ash, { op: 'buy', itemId: 'style_gold' });
  assert.equal(r.me.diamonds, 50);
  assert.equal(r.me.equipped.ball_style, 'style_gold');
  await assert.rejects(shopOp(db, ash, { op: 'buy', itemId: 'style_gold' }), /já tem/);
  const e = await shopOp(db, ash, { op: 'equip', slot: 'ball_style', itemId: null });
  assert.equal(e.me.equipped.ball_style, null);
  await assert.rejects(adminOp(db, ash, { op: 'give_diamonds', userId: ash.id, amount: 999 }), /administradores/);
});

test('cosmético equipado vai para a partida e vira a aura das capturas', async () => {
  const { db, ash, admin } = await setup();
  await adminOp(db, admin, { op: 'give_diamonds', userId: ash.id, amount: 500 });
  await shopOp(db, ash, { op: 'buy', itemId: 'style_galaxy' });
  await shopOp(db, ash, { op: 'buy', itemId: 'frame_gold' });
  const { match } = await matchOp(db, ash, { op: 'solo', bots: 1 });
  const me = match.state.players.find(p => p.id === ash.id);
  assert.deepEqual(me.cosmetic, { aura: 'galaxy', frame: 'gold' });
});

test('admin edita a vitrine; valores inválidos são recusados', async () => {
  const { db, admin, ash } = await setup();
  const { shop } = await adminOp(db, admin, { op: 'get_admin_data' });
  shop.items.push({ id: 'title_lenda', kind: 'title', value: 'Lenda de Kanto', name: 'Título Lenda', price: 999, active: true });
  shop.packages[0].price = '5,90';
  await adminOp(db, admin, { op: 'save_shop', shop });
  const cat = await shopOp(db, ash, { op: 'catalog' });
  assert.ok(cat.items.some(i => i.id === 'title_lenda'));
  assert.equal(cat.packages[0].price, 5.9);
  shop.items.push({ id: 'x', kind: 'frame', value: 'nao-existe', name: 'X', price: 1 });
  await assert.rejects(adminOp(db, admin, { op: 'save_shop', shop }), /Moldura inválida/);
});

test('aviso do admin aparece na config e no feed', async () => {
  const { db, admin } = await setup();
  await adminOp(db, admin, { op: 'set_announcement', announcement: { title: 'Evento de fim de semana', text: 'Shinies em dobro!', kind: 'event', active: true } });
  const cfg = await configInfo(db);
  assert.equal(cfg.announcement.title, 'Evento de fim de semana');
  const { events } = await feedOp(db, { since: 0 });
  assert.equal(events[0].kind, 'announcement');
  await adminOp(db, admin, { op: 'set_announcement', announcement: { title: 'x', active: false } });
  assert.equal((await configInfo(db)).announcement, null);
});

test('feed: captura de lendário ou shiny vira aviso global; comum não', async () => {
  const { db } = await setup();
  const state = { players: [{ id: 'u1', name: 'Ash', avatar: 1 }] };
  await publishCaptures(db, state, [
    { k: 'capture', ok: true, pid: 'u1', sp: 'mewtwo', shiny: false },
    { k: 'capture', ok: true, pid: 'u1', sp: 'pidgey', shiny: true },
    { k: 'capture', ok: true, pid: 'u1', sp: 'rattata', shiny: false },
    { k: 'capture', ok: false, pid: 'u1', sp: 'zapdos', shiny: false }
  ]);
  const { events } = await feedOp(db, { since: 0 });
  assert.equal(events.length, 2);
  assert.ok(events.some(e => e.kind === 'legendary' && /Mewtwo/.test(e.text)));
  assert.ok(events.some(e => e.kind === 'shiny' && /Pidgey/.test(e.text)));
});

test('comprar/equipar cosmético atualiza na hora as partidas em andamento', async () => {
  const { db, ash, admin } = await setup();
  const { match } = await matchOp(db, ash, { op: 'solo', bots: 1 });
  assert.equal(match.state.players.find(p => p.id === ash.id).cosmetic, null);
  await adminOp(db, admin, { op: 'give_diamonds', userId: ash.id, amount: 500 });
  await shopOp(db, ash, { op: 'buy', itemId: 'frame_rainbow' });
  const live = await matchOp(db, ash, { op: 'get', matchId: match.id });
  assert.deepEqual(live.match.state.players.find(p => p.id === ash.id).cosmetic, { frame: 'rainbow' });
  await shopOp(db, ash, { op: 'equip', slot: 'frame', itemId: null });
  const after = await matchOp(db, ash, { op: 'get', matchId: match.id });
  assert.equal(after.match.state.players.find(p => p.id === ash.id).cosmetic, null);
});
