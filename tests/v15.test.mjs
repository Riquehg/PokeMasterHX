// v15: laço dos companheiros (níveis, bônus escalonado, íntimo ajudando na batalha).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../shared/engine.js';
import { startBattle, submitChoice } from '../shared/rules/battle.js';
import { createMon } from '../shared/rules/monsters.js';
import { createRng } from '../shared/rules/rng.js';
import { scaledBonus, bondLevel, bondGain, BOND_XP, BOND_MAX } from '../shared/data/companions.js';
import { createMemoryDb } from '../api/_lib/memory-db.js';
import { matchOp, recordResults } from '../api/_lib/core.js';

test('laço: níveis por pontos e bônus que cresce sem ficar roubado', () => {
  assert.equal(bondLevel(0), 1);
  assert.equal(bondLevel(BOND_XP[5]), 5);
  assert.equal(bondLevel(99999), BOND_MAX);
  assert.ok(scaledBonus('misty', 1).dmg < scaledBonus('misty', 10).dmg);
  assert.ok(scaledBonus('misty', 10).dmg <= 0.13 + 1e-9);
  assert.ok(scaledBonus('oak', 10).xp <= 1.15);
  assert.ok(scaledBonus('joy', 10).potion < 1.5);
  assert.ok(bondGain({ won: true, badges: 6, captures: 20, battlesWon: 30, missions: 5, turns: 80 }) <= 70);
});

test('companheiro íntimo entra na batalha (e o comum não)', () => {
  const run = lvl => {
    let assists = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = createMatch({ seed: 3, mode: 'online', now: 0, players: [{ id: 'ash', name: 'Ash' }, { id: 'gary', name: 'Gary' }] });
      const p = s.players[0];
      p.companion = 'misty'; p.bond = { misty: lvl };
      p.team = [createMon(createRng(seed), 'squirtle', 30, { starter: true })];
      startBattle(s, { kind: 'wild', pid: 'ash', foe: { kind: 'wild', mon: createMon(createRng(9), 'snorlax', 40) } });
      submitChoice(s, createRng(seed * 7), 'ash', { move: 'attack', slot: 0 });
      assists += s.fx.filter(f => f.k === 'assist').length;
    }
    return assists;
  };
  assert.equal(run(4), 0); // v60: ajuda a partir do Laço Nv.5
  assert.ok(run(10) > run(5));
});

test('API: laço sobe no fim da partida e o nível vai para a próxima', async () => {
  const db = createMemoryDb();
  const ash = await db.verifyToken('dev:ash@kanto.com');
  const prof = await db.getProfile(ash.id) || (await matchOp(db, ash, { op: 'create', name: 'x' }), await db.getProfile(ash.id));
  await db.upsertProfile(ash.id, { stats: { ...(prof.stats || {}), companions: ['misty'], companion: 'misty', companionBond: { misty: BOND_XP[10] - 5 } } });
  const { match } = await matchOp(db, ash, { op: 'solo', bots: 1, starter: 'squirtle' });
  const st = match.state;
  assert.equal(st.players[0].bond.misty, 9);
  st.status = 'finished'; st.winner = st.players[0].id;
  await recordResults(db, st, {});
  const after = await db.getProfile(ash.id);
  assert.ok(after.stats.companionBond.misty >= BOND_XP[10]);
  assert.ok(st.bondChanges[st.players[0].id].intimate);
});
