// v66: Coleção maior várias vezes, 🍬 Rare Candy (mais raro, vai para a Mochila, vários de uma vez), 🪙 ouro da partida, lendários repetidos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction } from '../shared/engine.js';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { profileOp, adminOp, bagFromMatch, accountGoldReward, collectionMax, refundAbandoned } from '../api/_lib/core.js';
import { shopOp } from '../api/_lib/shop.js';
import { isKeepable, bringLimit } from '../shared/data/items.js';
import { createMon } from '../shared/rules/monsters.js';
import { createRng } from '../shared/rules/rng.js';

async function user() {
  const db = createMemoryDb();
  const admin = await db.verifyToken('dev:admin@kanto.com');
  await profileOp(db, admin, { op: 'get' });
  const u = await db.verifyToken('dev:z@kanto.com');
  await profileOp(db, u, { op: 'update', trainerName: 'Z', avatar: 1 });
  await adminOp(db, admin, { op: 'grant_mon', userId: u.id, species: 'charmander', level: 10 });
  return { db, admin, u };
}

test('📦 v66: +50 vagas na Coleção dá para comprar várias vezes (até +1000)', async () => {
  const { db, admin, u } = await user();
  await adminOp(db, admin, { op: 'give_diamonds', userId: u.id, amount: 5000 });
  for (let i = 1; i <= 3; i++) {
    const r = await shopOp(db, u, { op: 'buy', itemId: 'svc_vault50' });
    assert.equal(r.me.vaultBonus, 50 * i);
  }
  assert.equal(collectionMax(await db.getProfile(u.id)), 450);
  await db.upsertProfile(u.id, { stats: { ...(await db.getProfile(u.id)).stats, vaultBonus: 1000 } });
  await assert.rejects(shopOp(db, u, { op: 'buy', itemId: 'svc_vault50' }), /máximo/);
});

test('🍬 v66: Rare Candy sobra para a Mochila (menos o comprado), não é levado para a partida e vários de uma vez', async () => {
  assert.ok(isKeepable('rare_candy'));
  assert.equal(bringLimit('rare_candy'), 0);
  assert.deepEqual(bagFromMatch({ items: { rare_candy: 5 }, shopBought: { rare_candy: 2 } }), { rare_candy: 3 });
  // na partida: 4 de uma vez
  const s = createMatch({ seed: 5, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  const p = s.players[0];
  p.team = [createMon(createRng(1), 'charmander', 10)];
  s.status = 'playing'; s.current = 0; s.phase = 'roll';
  p.items.rare_candy = 6; p.shopBought = { rare_candy: 1 };
  const lvl = p.team[0].lvl;
  const res = applyAction(s, 'a', { type: 'use_item', item: 'rare_candy', index: 0, qty: 4 }, { now: 1 });
  assert.ok(!res.error, res.error);
  const p2 = (res.state || res).players[0];
  assert.equal(p2.team[0].lvl, lvl + 4);
  assert.equal(p2.items.rare_candy, 2);
  assert.ok(!p2.shopBought?.rare_candy); // os comprados saem primeiro
  // na Coleção: vários de uma vez
  const { db, u } = await user();
  const prof = await db.getProfile(u.id);
  await db.upsertProfile(u.id, { stats: { ...prof.stats, bag: { rare_candy: 80 } } });
  const m = prof.vault.find(x => x.sp === 'charmander');
  const r = await profileOp(db, u, { op: 'rare_candy', uid: m.uid, qty: 7 });
  assert.equal(r.leveled, m.lvl + 7); assert.equal(r.used, 7);
  assert.equal(r.profile.stats.bag.rare_candy, 73);
  const r2 = await profileOp(db, u, { op: 'rare_candy', uid: m.uid, qty: 99 }); // para no Nv.60
  assert.equal(r2.leveled, 60); assert.equal(r2.profile.stats.bag.rare_candy, 73 - (60 - m.lvl - 7));
});

test('🪙 v66: 1/4 do ouro que sobrou vai para a conta; partida encerrada também paga', async () => {
  assert.equal(accountGoldReward({ winner: null }, { gold: 8000, broughtGold: 0, badges: [] }), 2000);
  assert.equal(accountGoldReward({ winner: null }, { gold: 90000, broughtGold: 0, badges: [] }), 4000);
  const { db, u } = await user();
  const before = (await db.getProfile(u.id)).gold || 0;
  const st = { options: {}, players: [{ id: u.id, items: { rare_candy: 2, ultra_ball: 3 }, gold: 4200, broughtGold: 200, badges: [1, 2] }] };
  await refundAbandoned(db, st);
  const after = await db.getProfile(u.id);
  assert.equal(after.gold - before, 200 + 1000 + 80);
  assert.deepEqual(after.stats.bag, { rare_candy: 2, ultra_ball: 3 });
});

test('⭐ v66: lendário da mesma espécie pode aparecer de novo (a exclusão da v65c saiu)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../shared/engine.js', import.meta.url), 'utf8');
  assert.ok(!/exclude: p\.legendSp/.test(src));
});
