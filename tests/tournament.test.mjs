// Torneio (fila de duelos ranqueados) e Copa (chaveamento).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { profileOp, adminOp, matchOp, actionOp } from '../api/_lib/core.js';
import { whoMustAct } from '../shared/engine.js';

async function users(n) {
  const db = createMemoryDb();
  const admin = await db.verifyToken('dev:admin@kanto.com');
  await profileOp(db, admin, { op: 'get' });
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = await db.verifyToken(`dev:t${i}@kanto.com`);
    await profileOp(db, u, { op: 'update', trainerName: `T${i}`, avatar: 1 });
    for (const sp of ['charizard', 'blastoise', 'pikachu']) await adminOp(db, admin, { op: 'grant_mon', userId: u.id, species: sp, level: 60 });
    out.push(u);
  }
  return { db, admin, us: out };
}

async function playOut(db, matchId, us) {
  for (let i = 0; i < 400; i++) {
    const row = await db.getMatch(matchId);
    if (row.status !== 'playing') return row;
    const ids = whoMustAct(row.state);
    for (const id of ids) {
      const u = us.find(x => x.id === id);
      if (!u) continue;
      const b = row.state.battle;
      const si = b.sides.findIndex(s => s.pid === id);
      const team = row.state.players.find(p => p.id === id).team;
      const action = b.mustSwitch[si] ? { type: 'battle', move: 'switch', index: team.findIndex((m, k) => m.hp > 0 && k !== b.sides[si].active) } : { type: 'battle', move: 'attack', slot: 0 };
      await actionOp(db, u, { matchId, action });
    }
  }
  return db.getMatch(matchId);
}

test('Torneio: dois na fila viram um duelo ranqueado; Elo muda e nível é limitado a 50', async () => {
  const { db, us: [a, b] } = await users(2);
  const q1 = await matchOp(db, a, { op: 'duel_queue' });
  assert.equal(q1.queued, true);
  const q2 = await matchOp(db, b, { op: 'duel_queue' });
  assert.equal(q2.match.status, 'playing');
  assert.equal(q2.match.state.kind, 'duel');
  assert.ok(q2.match.state.players.every(p => p.team.every(m => m.lvl <= 50)));
  assert.equal((await matchOp(db, a, { op: 'duel_status' })).match.id, q2.match.id);
  const done = await playOut(db, q2.match.id, [a, b]);
  assert.equal(done.status, 'finished');
  const ra = (await db.getProfile(a.id)).rating, rb = (await db.getProfile(b.id)).rating;
  assert.notEqual(ra, 1000);
  assert.equal(ra + rb, 2000);
  // duelo não muda a Coleção (sem XP)
  assert.ok((await db.getProfile(a.id)).vault.every(m => m.lvl === 60));
});

test('Torneio: sair da fila e abandonar um duelo (perde por W.O.)', async () => {
  const { db, us: [a, b] } = await users(2);
  await matchOp(db, a, { op: 'duel_queue' });
  await matchOp(db, a, { op: 'duel_cancel' });
  const q = await matchOp(db, b, { op: 'duel_queue' });
  assert.equal(q.queued, true, 'a fila de A foi cancelada, então B espera');
  const d = await matchOp(db, a, { op: 'duel_queue' });
  await matchOp(db, a, { op: 'leave', matchId: d.match.id });
  const row = await db.getMatch(d.match.id);
  assert.equal(row.status, 'finished');
  assert.equal(row.state.winner, b.id);
});

test('Copa: 4 humanos + 2 CPUs, chaveamento até o campeão, prêmio em diamantes e Elo', async () => {
  const { db, us } = await users(4);
  const { match } = await matchOp(db, us[0], { op: 'create', name: 'Copa Kanto', mode: 'cup', maxPlayers: 8 });
  for (const u of us.slice(1)) {
    await matchOp(db, u, { op: 'join', matchId: match.id });
    await matchOp(db, u, { op: 'update', matchId: match.id, ready: true });
  }
  await matchOp(db, us[0], { op: 'add_bot', matchId: match.id });
  await matchOp(db, us[0], { op: 'add_bot', matchId: match.id });
  const started = await matchOp(db, us[0], { op: 'start', matchId: match.id });
  assert.equal(started.match.state.kind, 'cup');
  assert.equal(started.match.state.rounds[0].length, 4);
  for (let guard = 0; guard < 10; guard++) {
    const cup = (await db.getMatch(match.id)).state;
    if (cup.status === 'finished') break;
    const r = cup.rounds[cup.rounds.length - 1];
    for (const m of r) if (m.matchId && !m.winner) await playOut(db, m.matchId, us);
  }
  const cup = (await db.getMatch(match.id)).state;
  assert.equal(cup.status, 'finished');
  assert.ok(cup.champion);
  assert.ok(cup.rounds.length >= 3);
  if (!cup.champion.startsWith('cpu_')) {
    assert.equal(cup.prize.champion, 5 * 4);
    assert.equal((await db.getProfile(cup.champion)).diamonds, 20);
  }
});

test('Copa só com 1 humano não dá diamantes', async () => {
  const { db, us: [a] } = await users(1);
  const { match } = await matchOp(db, a, { op: 'create', name: 'Copa CPU', mode: 'cup' });
  for (let i = 0; i < 3; i++) await matchOp(db, a, { op: 'add_bot', matchId: match.id });
  await matchOp(db, a, { op: 'start', matchId: match.id });
  for (let guard = 0; guard < 10; guard++) {
    const cup = (await db.getMatch(match.id)).state;
    if (cup.status === 'finished') break;
    for (const m of cup.rounds[cup.rounds.length - 1]) if (m.matchId && !m.winner) await playOut(db, m.matchId, [a]);
  }
  const cup = (await db.getMatch(match.id)).state;
  assert.equal(cup.status, 'finished');
  assert.equal(cup.prize.champion, 0);
});

test('modo Coleção: o PC da partida tem a Coleção inteira (menos o time)', async () => {
  const { db, us: [a] } = await users(1);
  const vault = (await db.getProfile(a.id)).vault;
  const r = await matchOp(db, a, { op: 'solo', bots: 1, teamUids: [vault[0].uid] });
  const me = r.match.state.players.find(p => p.id === a.id);
  assert.ok(me.team.some(m => m.uid === vault[0].uid));
  assert.equal(me.box.length, vault.length - 1);
  assert.ok(me.box.every(m => vault.some(v => v.uid === m.uid)));
});

test('💎🔴 v67: Copa, Duelo e Torneio com opção de Mega/Gigantamax', async () => {
  const { db, admin, us: [a, b, c, d] } = await users(4);
  for (const u of [a, b, c, d]) { const p = await db.getProfile(u.id); await db.upsertProfile(u.id, { stats: { ...p.stats, megaBracelet: true } }); }
  // Copa com Megas + CPU com Megapedra
  const { match } = await matchOp(db, a, { op: 'create', name: 'Copa Mega', mode: 'cup', megas: true });
  assert.equal(match.options.megas, true);
  await matchOp(db, a, { op: 'add_bot', matchId: match.id });
  await matchOp(db, a, { op: 'start', matchId: match.id });
  const cup = (await db.getMatch(match.id)).state;
  assert.equal(cup.megas, true);
  const duel = await db.getMatch(cup.rounds[0][0].matchId);
  assert.equal(duel.state.options.megas, true);
  const me = duel.state.players.find(p => p.id === a.id), cpu = duel.state.players.find(p => p.id !== a.id);
  assert.equal(me.megaKey, true);
  assert.ok(cpu.megaKey || cpu.dynaKey);
  // Copa sem Megas continua sem
  const { match: m2 } = await matchOp(db, b, { op: 'create', name: 'Copa', mode: 'cup' });
  assert.ok(!m2.options.megas);
  // Torneio: fila com Megas só encontra quem escolheu Megas
  const q1 = await matchOp(db, c, { op: 'duel_queue', megas: true });
  assert.ok(q1.queued);
  const q2 = await matchOp(db, d, { op: 'duel_queue', megas: false });
  assert.ok(q2.queued); // não pareou com a fila de Megas
  await matchOp(db, d, { op: 'duel_cancel' });
  const q3 = await matchOp(db, d, { op: 'duel_queue', megas: true });
  assert.equal(q3.match.status, 'playing');
  const row = await db.getMatch(q3.match.id);
  assert.equal(row.state.options.megas, true);
  assert.ok(row.state.players.every(p => p.megaKey));
  // Duelo de sala com Megas
  const { match: dm } = await matchOp(db, a, { op: 'create', name: 'Duelo', mode: 'duel', megas: true });
  await matchOp(db, b, { op: 'join', matchId: dm.id });
  await matchOp(db, b, { op: 'update', matchId: dm.id, ready: true });
  await matchOp(db, a, { op: 'start', matchId: dm.id });
  const dr = await db.getMatch(dm.id);
  assert.equal(dr.state.options.megas, true);
  assert.ok(dr.state.players.every(p => p.megaKey));
});

test('⚔️ v69: Duelo PVP — chamar todos, aviso no feed, aceitar e duelar', async () => {
  const { db, us: [a, b, c] } = await users(3);
  const r = await matchOp(db, a, { op: 'duel_call', megas: false });
  assert.ok(r.calling && r.until > Date.now());
  await assert.rejects(matchOp(db, a, { op: 'duel_call' }), /Espere/); // não dá para chamar de novo logo em seguida
  const ev = (await db.listFeed(0, 20)).find(e => e.kind === 'duel_call');
  assert.ok(ev && ev.data.matchId === r.match.id);
  // a sala do chamado não aparece na lista de salas
  const { listRooms } = await import('../api/_lib/core.js');
  const rooms = await listRooms(db, b);
  assert.ok(!(rooms.rooms || []).some(x => x.id === r.match.id));
  const calls = (await matchOp(db, b, { op: 'duel_calls' })).calls;
  assert.equal(calls.length, 1); assert.equal(calls[0].name, 'T0');
  assert.equal((await matchOp(db, a, { op: 'duel_calls' })).calls.length, 0); // o meu não aparece para mim
  await assert.rejects(matchOp(db, a, { op: 'duel_accept', matchId: r.match.id }), /seu/);
  const acc = await matchOp(db, b, { op: 'duel_accept', matchId: r.match.id });
  assert.equal(acc.match.status, 'playing');
  assert.equal(acc.match.options.pvp, true);
  await assert.rejects(matchOp(db, c, { op: 'duel_accept', matchId: r.match.id }), /aceitou|expirou/);
  // quem chamou descobre o duelo pelo duel_status
  const st = await matchOp(db, a, { op: 'duel_status' });
  assert.equal(st.match.id, acc.match.id);
  // cancelar
  const { db: db2, us: [x] } = await users(1);
  await matchOp(db2, x, { op: 'duel_call' });
  await matchOp(db2, x, { op: 'duel_cancel' });
  assert.ok(!(await matchOp(db2, x, { op: 'duel_status' })).calling);
});
