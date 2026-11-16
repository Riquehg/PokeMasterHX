// Social: online, chat global, amigos e elos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { profileOp } from '../api/_lib/core.js';
import { socialOp } from '../api/_lib/social.js';
import { eloOf, ELO_TIERS } from '../shared/data/elo.js';

async function setup() {
  const db = createMemoryDb();
  const ash = await db.verifyToken('dev:ash@kanto.com');
  const gary = await db.verifyToken('dev:gary@kanto.com');
  await profileOp(db, ash, { op: 'update', trainerName: 'Ash', avatar: 1 });
  await profileOp(db, gary, { op: 'update', trainerName: 'Gary', avatar: 2 });
  return { db, ash, gary };
}

test('ping marca online e o chat global chega para todos', async () => {
  const { db, ash, gary } = await setup();
  await socialOp(db, ash, { op: 'ping' });
  const r = await socialOp(db, gary, { op: 'ping' });
  assert.equal(r.onlineCount, 2);
  await socialOp(db, ash, { op: 'chat_send', text: 'Oi galera 😄' });
  await assert.rejects(socialOp(db, ash, { op: 'chat_send', text: 'spam' }), /Espere/);
  await assert.rejects(socialOp(db, gary, { op: 'chat_send', text: 'veja https://x.com' }), /Links/);
  const r2 = await socialOp(db, gary, { op: 'ping', chatSince: 0 });
  assert.equal(r2.chat.length, 1);
  assert.equal(r2.chat[0].name, 'Ash');
  assert.equal(r2.chat[0].text, 'Oi galera 😄');
  await assert.rejects(socialOp(db, null, { op: 'ping' }), /login/);
});

test('amigos: buscar, pedir, aceitar, listar com online, remover', async () => {
  const { db, ash, gary } = await setup();
  const found = await socialOp(db, ash, { op: 'friend_search', q: 'gar' });
  assert.equal(found.results[0].name, 'Gary');
  await socialOp(db, ash, { op: 'friend_add', userId: gary.id });
  let g = await socialOp(db, gary, { op: 'friends' });
  assert.equal(g.incoming.length, 1);
  assert.equal((await socialOp(db, gary, { op: 'ping' })).friendRequests, 1);
  await socialOp(db, gary, { op: 'friend_accept', userId: ash.id });
  await socialOp(db, gary, { op: 'ping' });
  const a = await socialOp(db, ash, { op: 'friends' });
  assert.equal(a.friends.length, 1);
  assert.equal(a.friends[0].name, 'Gary');
  assert.equal(a.friends[0].online, true);
  await socialOp(db, ash, { op: 'friend_remove', userId: gary.id });
  assert.equal((await socialOp(db, gary, { op: 'friends' })).friends.length, 0);
});

test('elos: faixas de rating', () => {
  assert.equal(eloOf(1000).id, 'prata');
  assert.equal(eloOf(900).id, 'bronze');
  assert.equal(eloOf(1720).id, 'grao_mestre');
  assert.equal(eloOf(1120).toNext, 130);
  assert.equal(ELO_TIERS.length, 7);
});
