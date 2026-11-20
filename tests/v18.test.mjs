// v18: correções — Coleção nunca perde Pokémon valioso, recuperar, Hardcore, soltar na partida, captura de lendário.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { matchOp, actionOp, profileOp, syncCollection, recordResults, isExpendable, collectionMax } from '../api/_lib/core.js';
import { CAPTURE_TARGET } from '../shared/rules/battle.js';

async function setup() {
  const db = createMemoryDb();
  const ash = await db.verifyToken('dev:ash@kanto.com');
  await profileOp(db, ash, { op: 'get' });
  return { db, ash };
}
const mk = (i, sp = 'rattata', extra = {}) => ({ uid: 'v' + i, sp, lvl: 5 + (i % 30), shiny: false, ...extra });

test('Coleção cheia: lendário/shiny/apelido nunca saem; comuns saem e dá para recuperar', async () => {
  const { db, ash } = await setup();
  const vault = [mk(0, 'suicune', { lvl: 3 }), mk(1, 'pidgey', { lvl: 1, nick: 'Bob' }), ...Array.from({ length: 298 }, (_, i) => mk(i + 2))];
  await db.upsertProfile(ash.id, { vault });
  const st = { id: 'mX', players: [{ id: ash.id, team: [{ uid: 'new1', sp: 'pikachu', lvl: 9 }, { uid: 'new2', sp: 'eevee', lvl: 9 }], box: [], caught: [], tradedAway: [] }] };
  await syncCollection(db, st, null);
  let prof = await db.getProfile(ash.id);
  assert.equal(prof.vault.length, collectionMax(prof));
  assert.ok(prof.vault.some(m => m.sp === 'suicune'), 'lendário ficou');
  assert.ok(prof.vault.some(m => m.nick === 'Bob'), 'com apelido ficou');
  assert.equal(prof.stats.overflow.length, 2);
  assert.ok(!isExpendable({ sp: 'suicune' }) && isExpendable({ sp: 'rattata' }));
  // soltar e recuperar
  await profileOp(db, ash, { op: 'release', uid: 'v5' });
  prof = await db.getProfile(ash.id);
  assert.ok(prof.stats.overflow.some(m => m.uid === 'v5' && m.why === 'solto'));
  const r = await profileOp(db, ash, { op: 'restore', uid: 'v5' });
  assert.ok(r.profile.vault.some(m => m.uid === 'v5'));
});

test('admin dar Pokémon não apaga os mais novos da Coleção', async () => {
  const { db, ash } = await setup();
  await db.upsertProfile(ash.id, { is_admin: true, vault: Array.from({ length: 300 }, (_, i) => mk(i)) });
  const { adminOp } = await import('../api/_lib/core.js');
  await adminOp(db, ash, { op: 'grant_mon', userId: ash.id, species: 'suicune', level: 40 });
  const prof = await db.getProfile(ash.id);
  assert.equal(prof.vault.length, 301);
  assert.ok(prof.vault.some(m => m.uid === 'v299'));
});

test('lendário: dá para capturar com HP cheio usando Ultra Ball (alvo 8)', () => {
  assert.equal(CAPTURE_TARGET[5], 8);
  assert.ok(6 + 2 >= CAPTURE_TARGET[5]);
});

test('Hardcore: capturas salvam durante a partida; quem cai perde só as da partida', async () => {
  const { db, ash } = await setup();
  const gary = await db.verifyToken('dev:gary@kanto.com');
  await db.upsertProfile(ash.id, { vault: [mk(1, 'mew', { lvl: 30 })] });
  const st = { id: 'mH', options: { hardcore: true }, players: [{ id: ash.id, team: [{ uid: 'cap1', sp: 'suicune', lvl: 40 }], box: [], caught: ['suicune'], tradedAway: [] }] };
  await syncCollection(db, st, null);
  let prof = await db.getProfile(ash.id);
  assert.ok(prof.vault.some(m => m.uid === 'cap1'));
  const { purgeMatchCaptures } = await import('../api/_lib/core.js');
  await purgeMatchCaptures(db, ash.id, 'mH');
  prof = await db.getProfile(ash.id);
  assert.ok(!prof.vault.some(m => m.uid === 'cap1'));
  assert.ok(prof.vault.some(m => m.sp === 'mew'), 'o que já era da Coleção continua');
});

test('soltar na partida: Pokémon da Coleção não pode; capturado na partida sai da Coleção também', async () => {
  const { createMatch, applyAction } = await import('../shared/engine.js');
  const s = createMatch({ seed: 2, mode: 'online', now: 0, players: [{ id: 'ash', name: 'Ash', boxMons: [{ uid: 'old', sp: 'mew', lvl: 30 }] }, { id: 'g', name: 'G' }] });
  const p = s.players[0];
  p.box.push({ ...p.box[0], uid: 'fresh', brought: false });
  const r1 = applyAction(s, 'ash', { type: 'pc', op: 'release', box: 0 }, { now: 0 });
  assert.match(r1.error || '', /Coleção/);
  const r2 = applyAction(s, 'ash', { type: 'pc', op: 'release', box: 1 }, { now: 0 });
  assert.ok(!r2.error, r2.error);
  assert.deepEqual(r2.state.players[0].releasedUids, ['fresh']);
});
