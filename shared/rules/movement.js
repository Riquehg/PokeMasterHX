// Movimento no tabuleiro: destinos a exatamente N casas (sem voltar pelo mesmo caminho),
// respeitando casas que exigem uma habilidade (Surf, Cortar...) na equipe e a entrada da Liga (6 insígnias).
import { SPACES, getSpace, GATES } from '../data/board.js';
import { monMoves } from '../data/moves.js';
import { BADGES_TO_LEAGUE, LEAGUE_GATE_SPACES } from '../data/trainers.js';
import { getSpecies } from '../data/pokemon.js';

export function canEnter(player, spaceId) {
  const sp = getSpace(spaceId);
  if (!sp) return false;
  if (LEAGUE_GATE_SPACES.includes(sp.id) && player.badges.length < BADGES_TO_LEAGUE) return false;
  if (sp.gate && !hasGate(player, sp.gate)) return false;
  return true;
}

/** Tem algum Pokémon de pé com o tipo da habilidade (ou um golpe desse tipo)? */
export function hasGate(player, gateId) {
  const g = GATES[gateId];
  if (!g) return true;
  return player.team.some(m => m.hp > 0 && (getSpecies(m.sp).types.some(t => g.types.includes(t)) || monMoves(m).some(mv => g.types.includes(mv.type))));
}

/** Quem da equipe abre o caminho (para mostrar "Lapras usou Surf!"). */
export function gateUser(player, gateId) {
  const g = GATES[gateId];
  if (!g) return null;
  return player.team.find(m => m.hp > 0 && getSpecies(m.sp).types.some(t => g.types.includes(t)))
    || player.team.find(m => m.hp > 0 && monMoves(m).some(mv => g.types.includes(mv.type))) || null;
}

/** Todas as casas a exatamente `steps` passos. Se nenhuma existir, cai para o maior passo possível. */
export function destinations(player, steps) {
  const start = player.pos;
  for (let n = steps; n >= 1; n--) {
    const found = new Set();
    const walk = (id, left, visited) => {
      if (left === 0) { if (id !== start) found.add(id); return; }
      for (const nb of SPACES[id].links) {
        if (visited.has(nb) || !canEnter(player, nb)) continue;
        visited.add(nb);
        walk(nb, left - 1, visited);
        visited.delete(nb);
      }
    };
    walk(start, n, new Set([start]));
    if (found.size) return { steps: n, options: [...found].sort((a, b) => a - b) };
  }
  return { steps: 0, options: [] };
}

/** Distância (BFS) de uma casa a todas as outras, considerando os bloqueios do jogador. */
export function distancesFrom(player, from) {
  const dist = { [from]: 0 };
  const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const nb of SPACES[c].links) {
      if (dist[nb] !== undefined || !canEnter(player, nb)) continue;
      dist[nb] = dist[c] + 1;
      q.push(nb);
    }
  }
  return dist;
}

/** Um caminho de exatamente `steps` casas até `to` (para animar o peão). */
export function pathTo(player, to, steps) {
  const start = player.pos;
  let found = null;
  const walk = (id, left, path) => {
    if (found) return;
    if (left === 0) { if (id === to) found = [...path]; return; }
    for (const nb of SPACES[id].links) {
      if (path.includes(nb) || !canEnter(player, nb)) continue;
      path.push(nb);
      walk(nb, left - 1, path);
      path.pop();
    }
  };
  walk(start, steps, [start]);
  return found || [start, to];
}
