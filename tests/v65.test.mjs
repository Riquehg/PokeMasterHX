// 🤝 v65 — modos em equipe: Duplas/Trios, Guerra de Regiões, Raid em Grupo, Guildas e Torre em Dupla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction } from '../shared/engine.js';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { profileOp, adminOp, matchOp } from '../api/_lib/core.js';
import { socialOp } from '../api/_lib/social.js';
import { towerOp } from '../api/_lib/tower.js';
import { allies, isWinner, squadOf, assignSquads } from '../shared/rules/teams.js';
import { addGuildPts, weekKey, memberPts } from '../shared/data/guilds.js';
import { GYMS } from '../shared/data/trainers.js';

const T0 = 1_700_000_000_000;
const four = (opts = {}, rules) => createMatch({ seed: 5, now: T0, rules, options: { teams: 2, ...opts }, players: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id.toUpperCase(), squad: i === 0 ? 1 : undefined })) });

test('🤝 times: separa equilibrado, respeita a escolha e aliados não se desafiam', () => {
  const s = four();
  assert.equal(s.options.teams, 2);
  const a = s.players[0];
  assert.equal(squadOf(a), 1);
  const counts = [0, 0];
  s.players.forEach(p => counts[p.squad]++);
  assert.deepEqual(counts, [2, 2]);
  const ally = s.players.find(p => p.id !== 'a' && p.squad === 1);
  assert.ok(allies(s, a, ally));
  // desafiar o aliado na mesma casa
  s.current = 0; s.phase = 'action'; ally.pos = a.pos;
  const r = applyAction(s, 'a', { type: 'challenge', target: ally.id }, { now: T0 });
  assert.match(r.error, /time/);
  // 2 jogadores: sem times
  assert.equal(createMatch({ seed: 1, options: { teams: 2 }, players: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }] }).options.teams, 0);
  const ps = [{ squad: 2 }, {}, {}, {}, {}, {}];
  assignSquads(ps, 3);
  assert.deepEqual(ps.map(p => p.squad).sort(), [0, 0, 0, 1, 1, 1]);
});

test('🤝 passar item para aliado perto e Dado de Apoio (1× por partida)', () => {
  let s = four();
  const a = s.players[0];
  const ally = s.players.find(p => p.id !== 'a' && p.squad === a.squad);
  s.current = 0; s.phase = 'roll';
  let r = applyAction(s, 'a', { type: 'team', op: 'support' }, { now: T0 });
  assert.equal(r.error, undefined, r.error);
  s = r.state;
  assert.ok(s.turnFlags.supportDie);
  assert.ok(s.players[0].supportUsed);
  r = applyAction(s, 'a', { type: 'roll' }, { now: T0 });
  assert.ok(r.state.log.some(l => /Dado de Apoio: \d e \d/.test(l.msg)));
  s = four(); s.current = 0; s.phase = 'action';
  const me = s.players[0], al = s.players.find(p => p.id !== 'a' && p.squad === me.squad);
  al.pos = me.pos; me.items.potion = 3;
  const before = al.items.potion || 0;
  r = applyAction(s, 'a', { type: 'team', op: 'give', to: al.id, item: 'potion' }, { now: T0 });
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.state.players.find(p => p.id === al.id).items.potion, before + 1);
  const rival = s.players.find(p => p.squad !== me.squad);
  rival.pos = me.pos;
  r = applyAction(s, 'a', { type: 'team', op: 'give', to: rival.id, item: 'potion' }, { now: T0 });
  assert.match(r.error, /time/);
});

test('🤝 limite de turnos: vence o time com mais pontos e todos do time contam como vencedores', () => {
  const s = four({ turnLimit: 1 });
  const a = s.players[0];
  a.badges.push('boulder', 'cascade');
  s.turn = 99;
  s.current = 0; s.phase = 'action';
  const r = applyAction(s, 'a', { type: 'end_turn' }, { now: T0 });
  const st = r.state;
  assert.equal(st.status, 'finished');
  assert.equal(st.winnerSquad, a.squad);
  for (const p of st.players) assert.equal(isWinner(st, p), p.squad === a.squad);
});

test('🏰 Guerra de Regiões: não dá para atacar cidade do aliado', () => {
  const s = four({}, 'conquest');
  const a = s.players[0];
  const ally = s.players.find(p => p.id !== 'a' && p.squad === a.squad);
  const g = GYMS[0];
  s.conquest.owners[g.id] = ally.id;
  a.pos = g.space; s.current = 0; s.phase = 'action';
  const r = applyAction(s, 'a', { type: 'city', op: 'gym' }, { now: T0 });
  assert.match(r.error, /seu time/);
});

test('🐉 Raid em Grupo: começa direto na Raid, com papéis, e termina a partida', () => {
  let s = createMatch({ seed: 9, now: T0, rules: 'bossraid', players: [{ id: 'a', name: 'A', teamMons: [{ uid: 'm1', sp: 'dragonite', lvl: 50 }] }, { id: 'b', name: 'B', isBot: true, teamMons: [{ uid: 'm2', sp: 'tyranitar', lvl: 50 }] }] });
  assert.equal(s.rules, 'bossraid');
  assert.equal(s.raid.stage, 'join');
  assert.ok(s.raid.coop);
  let r = applyAction(s, 'a', { type: 'raid', op: 'join', uid: 'm1', role: 'ctl' }, { now: T0 });
  assert.equal(r.error, undefined, r.error);
  s = r.state;
  assert.equal(s.raid.party.find(x => x.pid === 'a').role, 'ctl');
  for (let i = 0; i < 80 && s.status === 'playing'; i++) {
    const a = s.raid?.stage === 'catch' ? { type: 'raid', op: s.players[0].items.ultra_ball ? 'catch' : 'skip', ball: 'ultra_ball' } : { type: 'raid', op: 'attack', slot: 0 };
    r = applyAction(s, 'a', a, { now: T0 });
    if (r.error) break;
    s = r.state;
  }
  assert.equal(s.status, 'finished');
});

async function setup(n) {
  const db = createMemoryDb();
  const admin = await db.verifyToken('dev:admin@kanto.com');
  await profileOp(db, admin, { op: 'get' });
  const us = [];
  for (let i = 0; i < n; i++) {
    const u = await db.verifyToken(`dev:g${i}@kanto.com`);
    await profileOp(db, u, { op: 'update', trainerName: `G${i}`, avatar: 1 });
    for (const sp of ['charizard', 'blastoise', 'venusaur', 'gengar']) await adminOp(db, admin, { op: 'grant_mon', userId: u.id, species: sp, level: 55 });
    await adminOp(db, admin, { op: 'give_gold', userId: u.id, amount: 20000 });
    us.push(u);
  }
  return { db, admin, us };
}

test('🛡️ guildas: fundar, entrar, pontos da semana no ranking, sair', async () => {
  const { db, us: [a, b] } = await setup(2);
  let r = await socialOp(db, a, { op: 'guild_create', name: 'Mestres de Kanto', tag: 'mk', emblem: '🐉' });
  assert.match(r.message, /fundada/);
  r = await socialOp(db, a, { op: 'guild_get' });
  assert.equal(r.guild.tag, 'MK');
  const gid = r.guild.id;
  await socialOp(db, b, { op: 'guild_join', id: gid });
  await assert.rejects(socialOp(db, b, { op: 'guild_create', name: 'Outra', tag: 'OT' }), /já está/);
  // pontos chegam pelas partidas
  const prof = await db.getProfile(a.id);
  await db.upsertProfile(a.id, { stats: addGuildPts(prof.stats, 40) });
  r = await socialOp(db, b, { op: 'guild_get' });
  assert.equal(r.guild.members.length, 2);
  assert.equal(r.rank[0].pts, 40);
  await socialOp(db, b, { op: 'guild_leave' });
  r = await socialOp(db, a, { op: 'guild_get' });
  assert.equal(r.guild.members.length, 1);
  // semana vira: guarda a anterior
  const wk = weekKey(T0);
  const st = addGuildPts(addGuildPts({ guild: 'x' }, 10, T0), 5, T0 + 7 * 86400e3);
  assert.equal(memberPts(st, wk + 1), 5);
  assert.equal(memberPts(st, wk), 10);
});

test('🤝 Torre em Dupla: precisa ser amigo; junta os 3 do amigo (6 contra 6)', async () => {
  const { db, us: [a, b, c] } = await setup(3);
  const va = (await db.getProfile(a.id)).vault.slice(0, 3).map(m => m.uid);
  await assert.rejects(towerOp(db, a, { op: 'tower_start', teamUids: va, partner: c.id }), /amigo/);
  await socialOp(db, a, { op: 'friend_add', userId: b.id });
  await socialOp(db, b, { op: 'friend_accept', userId: a.id });
  const r = await towerOp(db, a, { op: 'tower_start', teamUids: va, partner: b.id });
  assert.equal(r.tower.set.duo, b.id);
  assert.equal(r.tower.set.ally.length, 3);
  const bt = await towerOp(db, a, { op: 'tower_battle' });
  const m = await db.getMatch(bt.match.id);
  assert.equal(m.state.players[0].team.length + m.state.players[0].box.length >= 6 || m.state.players[0].team.length === 6, true);
  assert.equal(m.state.players[1].team.length, 6);
});

test('🤝 sala online em Duplas: escolher time e iniciar', async () => {
  const { db, us: [a, b] } = await setup(2);
  const { match } = await matchOp(db, a, { op: 'create', name: 'Duplas', mode: 'balanced', maxPlayers: 4, teams: 2 });
  assert.equal(match.options.teams, 2);
  await matchOp(db, b, { op: 'join', matchId: match.id });
  await matchOp(db, a, { op: 'squad', matchId: match.id, squad: 1 });
  await matchOp(db, a, { op: 'add_bot', matchId: match.id });
  await matchOp(db, a, { op: 'add_bot', matchId: match.id });
  await matchOp(db, b, { op: 'update', matchId: match.id, ready: true });
  const r = await matchOp(db, a, { op: 'start', matchId: match.id });
  const st = (await db.getMatch(match.id)).state;
  assert.equal(st.options.teams, 2);
  assert.equal(st.players.find(p => p.id === a.id).squad, 1);
  assert.ok(r.match);
});
