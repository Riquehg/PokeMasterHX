// Mercado Global + ouro da conta (banco em memória).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { profileOp, adminOp, matchOp, recordResults, syncCollection, mutateProfile } from '../api/_lib/core.js';
import { marketOp, MARKET_FEE } from '../api/_lib/market.js';

async function setup() {
  const db = createMemoryDb();
  const admin = await db.verifyToken('dev:admin@kanto.com');
  const ash = await db.verifyToken('dev:ash@kanto.com');
  const gary = await db.verifyToken('dev:gary@kanto.com');
  for (const u of [admin, ash, gary]) await profileOp(db, u, { op: 'get' });
  await adminOp(db, admin, { op: 'grant_mon', userId: ash.id, species: 'mewtwo', level: 50 });
  await adminOp(db, admin, { op: 'grant_mon', userId: gary.id, species: 'pidgey', level: 10 });
  await adminOp(db, admin, { op: 'give_gold', userId: gary.id, amount: 5000 });
  await adminOp(db, admin, { op: 'give_diamonds', userId: gary.id, amount: 100 });
  const vaultOf = async u => (await db.getProfile(u.id)).vault;
  return { db, admin, ash, gary, vaultOf };
}

const rejects = (p, re) => assert.rejects(p, e => re.test(e.message));

test('anunciar tira da Coleção; comprar paga o vendedor (com taxa) e entrega o Pokémon', async () => {
  const { db, ash, gary, vaultOf } = await setup();
  const uid = (await vaultOf(ash))[0].uid;
  const { listing } = await marketOp(db, ash, { op: 'create', uid, priceGold: 1000, priceDiamonds: 20 });
  assert.equal((await vaultOf(ash)).length, 0);
  const b = await marketOp(db, gary, { op: 'browse' });
  assert.equal(b.listings.length, 1);
  await rejects(marketOp(db, ash, { op: 'buy', listingId: listing.id }), /próprio/);
  const r = await marketOp(db, gary, { op: 'buy', listingId: listing.id });
  assert.equal(r.wallet.gold, 4000);
  assert.equal(r.wallet.diamonds, 80);
  assert.ok((await vaultOf(gary)).some(m => m.uid === uid && m.sp === 'mewtwo'));
  const ashP = await db.getProfile(ash.id);
  assert.equal(ashP.gold, 1000 - Math.floor(1000 * MARKET_FEE));
  assert.equal(ashP.diamonds, 20 - Math.floor(20 * MARKET_FEE));
  await rejects(marketOp(db, gary, { op: 'buy', listingId: listing.id }), /não está mais/);
});

test('saldo insuficiente reabre o anúncio; cancelar devolve o Pokémon', async () => {
  const { db, ash, gary, vaultOf } = await setup();
  const uid = (await vaultOf(ash))[0].uid;
  const { listing } = await marketOp(db, ash, { op: 'create', uid, priceGold: 999999 });
  await rejects(marketOp(db, gary, { op: 'buy', listingId: listing.id }), /Saldo insuficiente/);
  assert.equal((await db.getListing(listing.id)).status, 'open');
  await marketOp(db, ash, { op: 'cancel', listingId: listing.id });
  assert.ok((await vaultOf(ash)).some(m => m.uid === uid));
});

test('ofertas: reserva, recusa devolve, aceite troca tudo (Pokémon + ouro + diamantes)', async () => {
  const { db, ash, gary, vaultOf } = await setup();
  const mew = (await vaultOf(ash))[0].uid;
  const pidgey = (await vaultOf(gary))[0].uid;
  const { listing } = await marketOp(db, ash, { op: 'create', uid: mew, acceptOffers: true });
  const o1 = await marketOp(db, gary, { op: 'offer', listingId: listing.id, gold: 300, diamonds: 10, uids: [pidgey] });
  let g = await db.getProfile(gary.id);
  assert.equal(g.gold, 4700); assert.equal(g.diamonds, 90); assert.equal(g.vault.length, 0);
  await marketOp(db, ash, { op: 'offer_respond', offerId: o1.offer.id, accept: false });
  g = await db.getProfile(gary.id);
  assert.equal(g.gold, 5000); assert.equal(g.diamonds, 100); assert.equal(g.vault.length, 1);

  const o2 = await marketOp(db, gary, { op: 'offer', listingId: listing.id, gold: 500, uids: [pidgey] });
  const mine = await marketOp(db, ash, { op: 'mine' });
  assert.equal(mine.received.length, 1);
  await marketOp(db, ash, { op: 'offer_respond', offerId: o2.offer.id, accept: true });
  assert.ok((await vaultOf(gary)).some(m => m.uid === mew));
  assert.ok((await vaultOf(ash)).some(m => m.uid === pidgey));
  assert.equal((await db.getProfile(ash.id)).gold, 500 - Math.floor(500 * MARKET_FEE));
  assert.equal((await db.getListing(listing.id)).status, 'sold');
});

test('Pokémon em partida em andamento não pode ser anunciado; ouro da conta vem das partidas', async () => {
  const { db, ash, vaultOf } = await setup();
  const mon = (await vaultOf(ash))[0];
  const { match } = await matchOp(db, ash, { op: 'solo', bots: 1, teamUids: [mon.uid] });
  const inMatch = match.state.players.find(p => p.id === ash.id).team.some(m => m.uid === mon.uid);
  if (inMatch) await rejects(marketOp(db, ash, { op: 'create', uid: mon.uid, priceGold: 10 }), /partida em andamento/);
  const before = (await db.getProfile(ash.id)).gold || 0;
  const st = structuredClone(match.state);
  st.status = 'finished';
  st.winner = ash.id;
  st.players.find(p => p.id === ash.id).gold = 1500;
  await recordResults(db, st, {});
  assert.ok((await db.getProfile(ash.id)).gold >= before + 150 + 150);
});

test('Coleção não perde dados com gravações concorrentes (rev)', async () => {
  const { db, ash } = await setup();
  await Promise.all(Array.from({ length: 10 }, (_, i) => mutateProfile(db, ash.id, p => ({
    vault: [...(p.vault || []), { uid: 'x' + i, sp: 'pidgey', lvl: 3 }]
  }))));
  assert.equal((await db.getProfile(ash.id)).vault.length, 11);
});

test('troca na partida tira o Pokémon da Coleção de quem deu', async () => {
  const { db, ash } = await setup();
  const prof = await db.getProfile(ash.id);
  const uid = prof.vault[0].uid;
  const state = { id: 'm1', players: [{ id: ash.id, team: [], box: [], caught: [], seen: ['pidgey'], tradedAway: [uid] }] };
  await syncCollection(db, state, null);
  const after = await db.getProfile(ash.id);
  assert.ok(!after.vault.some(m => m.uid === uid));
  assert.ok(after.pokedex_seen.includes('pidgey'));
});
