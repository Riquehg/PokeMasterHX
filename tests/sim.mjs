// Simulação: partidas só com CPUs, para validar que o jogo termina e medir o balanceamento.
import { createMatch, runBots, score } from '../shared/engine.js';
import { createRng } from '../shared/rules/rng.js';

export function simulate(seed, nPlayers = 4, maxTurns = 400) {
  let state = createMatch({
    seed, mode: 'local', now: 0,
    players: Array.from({ length: nPlayers }, (_, i) => ({ id: 'b' + i, name: 'CPU ' + (i + 1), isBot: true })),
    options: { dailyPokemon: 'pikachu' }
  });
  state.logCap = 1e6;
  let loops = 0;
  while (state.status === 'playing' && state.turn <= maxTurns && loops < 100000) {
    const rng = createRng(state.seed);
    const before = JSON.stringify([state.turn, state.current, state.phase, state.log.length]);
    runBots(state, rng, 0);
    state.seed = rng.state;
    loops++;
    if (JSON.stringify([state.turn, state.current, state.phase, state.log.length]) === before) {
      return { seed, stuck: true, state };
    }
  }
  return { seed, stuck: false, state };
}

if ((process.argv[1] || '').endsWith('sim.mjs')) {
  const N = Number(process.argv[2] || 20);
  const results = [];
  for (let s = 1; s <= N; s++) {
    const t0 = Date.now();
    const r = simulate(s * 7919);
    const st = r.state;
    const w = st.players.find(p => p.id === st.winner);
    results.push({
      seed: r.seed, stuck: r.stuck, status: st.status, turns: st.turn, ms: Date.now() - t0,
      winner: w ? w.name : '-',
      badges: st.players.map(p => p.badges.length).join('/'),
      elite: st.players.map(p => p.eliteStage).join('/'),
      lv: st.players.map(p => Math.max(...p.team.map(m => m.lvl))).join('/'),
      caught: st.players.map(p => p.caught.length).join('/'),
      shiny: st.players.map(p => p.stats.shinies).join('/')
    });
    if (r.stuck) { console.log('STUCK', r.seed, st.phase, st.battle && st.battle.kind, st.log.slice(-5)); }
  }
  console.table(results);
  const fin = results.filter(r => r.status === 'finished');
  console.log('finished', fin.length, '/', N, 'avg turns', (fin.reduce((a, r) => a + r.turns, 0) / Math.max(1, fin.length)).toFixed(1));
}
