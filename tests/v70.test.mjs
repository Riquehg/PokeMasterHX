// v70: modo equipe — insígnia do time, Pulso de Cura, batalha em dupla, CPU aliado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction } from '../shared/engine.js';
import { createMon } from '../shared/rules/monsters.js';
import { createRng } from '../shared/rules/rng.js';
import { shareBadge, squadScore, duoPartner } from '../shared/rules/teams.js';
import { startBattle, submitChoice, partnerMon } from '../shared/rules/battle.js';
import { fieldOptions, FIELD_SKILLS } from '../shared/data/fieldskills.js';
import { score } from '../shared/engine.js';
import { maxHpOf } from '../shared/rules/monsters.js';

const match = () => {
  const s = createMatch({ seed: 7, players: ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() })), options: { teams: 2 } });
  s.players.forEach((p, i) => { p.squad = i % 2; p.team = [createMon(createRng(i + 1), 'chansey', 30), createMon(createRng(i + 9), 'charmander', 30)]; p.pos = s.players[0].pos; });
  s.status = 'playing'; s.current = 0; s.phase = 'roll'; s.pending = null; s.battle = null; s.turnFlags = {};
  return s;
};

test('🎖️ v70: insígnia vale para o time e conta uma vez no placar', () => {
  const s = match();
  const [a, b, c] = s.players; // a e c no time 0
  a.badges.push('boulder');
  const got = shareBadge(s, a, 'boulder');
  assert.deepEqual(got.map(q => q.id), ['c']);
  assert.ok(c.badges.includes('boulder') && !b.badges.includes('boulder'));
  assert.equal(squadScore(s, 0, score), score(a) + score(c) - 100);
});

test('💗 v70: Pulso de Cura só no modo equipe e cura o aliado a até 3 casas', () => {
  const s = match();
  const [a, , c] = s.players;
  assert.ok(fieldOptions(s, a).some(o => o.id === 'healpulse'));
  c.team.forEach(m => { m.hp = 1; });
  const r = applyAction(s, 'a', { type: 'field', id: 'healpulse' }, { now: 1 });
  assert.ok(!r.error, r.error);
  const c2 = (r.state || r).players[2];
  assert.ok(c2.team.every(m => m.hp > 1 && m.hp <= maxHpOf(m)));
  // fora do modo equipe a habilidade não aparece
  s.options.teams = 0;
  assert.ok(!fieldOptions(s, a).some(o => o.id === 'healpulse'));
  assert.ok(FIELD_SKILLS.healpulse.teams);
});

test('🤝 v70: batalha em dupla — aliado na mesma casa entra no Ginásio e ataca toda rodada', () => {
  const s = match();
  const [a, , c] = s.players;
  assert.equal(duoPartner(s, a).id, 'c');
  const leader = [createMon(createRng(3), 'onix', 40)];
  startBattle(s, { kind: 'gym', pid: 'a', ref: 'boulder', foe: { kind: 'npc', name: 'Brock', team: leader, prize: 100 } });
  assert.equal(s.battle.partner.pid, 'c');
  assert.ok(partnerMon(s));
  const hp0 = leader[0].hp;
  submitChoice(s, createRng(5), 'a', { move: 'attack', slot: 0 });
  assert.ok(s.battle.log.some(l => /atacou junto/.test(l)) || leader[0].hp < hp0);
  // sem aliado na casa: sem dupla
  const s2 = match(); s2.players[2].pos = -999;
  startBattle(s2, { kind: 'gym', pid: 'a', ref: 'boulder', foe: { kind: 'npc', name: 'Brock', team: [createMon(createRng(3), 'onix', 40)], prize: 100 } });
  assert.ok(!s2.battle.partner);
});
