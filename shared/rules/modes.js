// Tipos de partida: Clássico (padrão), ⚔️ Battle Royale e 🏰 Conquista.
// Cada um funciona com as duas versões de time: Balanceada (inicial) e Coleção (time da conta).
import { SPACE_LIST, SPACES, getSpace, CURRENT_MAP } from '../data/board.js';
import { GYMS } from '../data/trainers.js';
import { createRng } from './rng.js';
import { getPlayer, log, fx, fail, hasUsable, blackout, addItem, speciesName, clone } from './helpers.js';
import { maxHpOf, createMon, fullHeal, levelUp } from './monsters.js';
import { startBattle } from './battle.js';

export const GAME_RULES = {
  classic:  { name: 'Clássico', icon: '🗺️', desc: 'Insígnias, Liga e Campeão. Vence quem derrotar o Campeão (ou tiver mais pontos no limite de turnos).' },
  royale:   { name: 'Battle Royale', icon: '⚔️', desc: 'Joga na Arena Royale (mapa simétrico: todos começam na borda, à mesma distância do centro). Uma tempestade fecha o mapa. Quem cai na casa de outro batalha. Time todo desmaiado = eliminado. Ganha o último de pé.' },
  conquest: { name: 'Conquista', icon: '🏰', desc: 'Domine as cidades de ginásio e deixe Pokémon defendendo. Cidades rendem ouro e bônus. Ganha quem dominar mais.' }
};
export const RULE_IDS = Object.keys(GAME_RULES);

// ---- Battle Royale
export const STORM_START = 3;          // a tempestade começa a fechar na rodada 3
export const STORM_ROUNDS = 10;        // ...e chega ao centro em ~10 rodadas
export const STORM_DAMAGE = 0.2;       // −20% do HP máx. de cada Pokémon da equipe por rodada dentro dela
export const STORM_DAMAGE_FINAL = 0.35;

// ---- Conquista
export const GARRISON_MAX = 3;
export const CONQUEST_TURNS = 40;
export const CITY_INCOME = 50;         // × tier da cidade, por rodada

export const rulesOf = state => state?.rules || 'classic';
export const isOut = p => !!p?.out;
export const alivePlayers = state => state.players.filter(p => !p.out);

/** Prepara a partida conforme o tipo (chamado no createMatch, depois de criar os jogadores). */
export function setupRules(state, rng) {
  const r = rulesOf(state);
  if (r === 'royale') {
    const dist = graphDist(cityCenter());
    const center = Number(Object.keys(dist).find(id => dist[id] === 0));
    const maxD = Math.max(...Object.values(dist).filter(d => d < 99));
    state.royale = { center, ring: maxD, max: maxD, step: Math.max(1, Math.ceil(maxD / STORM_ROUNDS)), placeNext: state.players.length };
    // espalha os jogadores pelas bordas do mapa
    let picks;
    if (CURRENT_MAP?.bases) {
      // Arena Royale: bases espaçadas por igual (2 jogadores = lados opostos, 3 = triângulo, 6 = todas)
      const B = CURRENT_MAP.bases, n = state.players.length, off = rng.int(0, B.length - 1);
      picks = state.players.map((_, i) => getSpace(B[(off + Math.round((i * B.length) / n)) % B.length]));
    } else {
      const far = SPACE_LIST.filter(s => !s.gate && (dist[s.id] ?? 0) >= maxD * 0.65).sort((a, b) => a.id - b.id);
      picks = spread(rng, far, state.players.length);
    }
    state.players.forEach((p, i) => {
      p.pos = picks[i % picks.length].id;
      p.lastCity = p.pos;
      p.visited = [p.pos];
      p.noRules = true;          // no Battle Royale todos os Pokémon obedecem
      p.gold += 400;
      addItem(p, 'potion', 2);
      addItem(p, 'great_ball', 3);
      p.healedAt = [];
      // versão Balanceada: inicial começa no Nv. 12 para as lutas esquentarem logo
      for (const m of p.team) if (m.starter && m.lvl < 12) { while (m.lvl < 12) levelUp(m); fullHeal(m); }
    });
    log(state, `🌀 BATTLE ROYALE! A tempestade começa a fechar na rodada ${STORM_START} em direção a ${getSpace(center).name}. Último treinador de pé vence!`, 'event');
  }
  if (r === 'conquest') {
    state.conquest = { owners: Object.fromEntries(GYMS.map(g => [g.id, null])), garrison: Object.fromEntries(GYMS.map(g => [g.id, []])) };
    if (!state.options.turnLimit) state.options.turnLimit = CONQUEST_TURNS;
    log(state, `🏰 CONQUISTA! Domine as ${GYMS.length} cidades de ginásio: vença quem defende e deixe até ${GARRISON_MAX} Pokémon de guarnição. Vence quem tiver mais cidades no turno ${state.options.turnLimit} (ou todas antes).`, 'event');
  }
}

/** Começo de cada rodada. */
export function onRound(state) {
  const r = rulesOf(state);
  if (r === 'royale') stormTick(state);
  if (r === 'conquest') conquestIncome(state);
}

/** Substitui o "desmaio geral". No Battle Royale, perder PvP elimina; perder para selvagem/NPC volta para a cidade como sempre. */
export function knockOut(state, p, pct = 0.1, cause = 'npc') {
  // ☠️ Hardcore (qualquer tipo de partida): perdeu a equipe = fora da partida, perde tudo o que ganhou
  if (state.options?.hardcore && !state.options.duel) {
    p.hardcoreLost = true;
    return eliminate(state, p, 'perdeu toda a equipe no HARDCORE');
  }
  if (rulesOf(state) !== 'royale' || cause !== 'pvp') return blackout(state, p, pct);
  eliminate(state, p, 'perdeu o duelo');
}

// ------------------------------------------------------------------ Battle Royale
function cityCenter() {
  // a cidade mais "no meio" do mapa (menor distância máxima até as outras casas)
  let best = null, bestEcc = Infinity;
  for (const s of SPACE_LIST.filter(x => x.type === 'city' && !x.gate)) {
    const d = graphDist(s.id);
    const ecc = Math.max(...Object.values(d).filter(x => x < 99)); // casas isoladas (só com habilidade) não contam
    if (ecc < bestEcc || (ecc === bestEcc && s.id < best)) { bestEcc = ecc; best = s.id; }
  }
  return best;
}

/** Distância em casas (casas com habilidade não servem de passagem). */
export function graphDist(from) {
  const dist = { [from]: 0 };
  const q = [from];
  while (q.length) {
    const c = q.shift();
    if (c !== from && SPACES[c].gate) continue;
    for (const n of SPACES[c].links) if (dist[n] === undefined) { dist[n] = dist[c] + 1; q.push(n); }
  }
  for (const s of SPACE_LIST) if (dist[s.id] === undefined) dist[s.id] = 99;
  return dist;
}

const distCache = new Map();
function centerDist(state) {
  const key = `${state.map}:${state.royale.center}`;
  if (!distCache.has(key)) { if (distCache.size > 20) distCache.clear(); distCache.set(key, graphDist(state.royale.center)); }
  return distCache.get(key);
}

/** Situação da casa na tempestade: dentro agora, e se fica dentro na próxima rodada. */
export function stormAt(state, spaceId) {
  const R = state.royale;
  if (!R) return { in: false, soon: false, dist: 0 };
  const d = centerDist(state)[spaceId] ?? 99;
  const nextRing = state.turn + 1 >= STORM_START ? Math.max(0, R.ring - R.step) : R.ring;
  return { in: d > R.ring, soon: d > nextRing, dist: d };
}

function stormTick(state) {
  const R = state.royale;
  if (state.status !== 'playing') return;
  if (state.turn >= STORM_START && R.ring > 0) {
    R.ring = Math.max(0, R.ring - R.step);
    fx(state, { k: 'storm', ring: R.ring });
    log(state, R.ring === 0 ? `🌀 A tempestade cobriu tudo — só ${getSpace(R.center).name} está a salvo!` : `🌀 A tempestade avançou! Área segura: até ${R.ring} casas de ${getSpace(R.center).name}.`, 'event');
  } else if (R.ring === 0) R.finalRounds = (R.finalRounds || 0) + 1;
  for (const p of alivePlayers(state)) {
    if (!stormAt(state, p.pos).in) continue;
    const pct = R.ring === 0 && (R.finalRounds || 0) >= 2 ? STORM_DAMAGE_FINAL : STORM_DAMAGE;
    let total = 0;
    for (const m of p.team) {
      if (m.hp <= 0) continue;
      const d = Math.min(m.hp, Math.max(1, Math.round(maxHpOf(m) * pct)));
      m.hp -= d; total += d;
    }
    fx(state, { k: 'storm_dmg', pid: p.id, dmg: total });
    log(state, `🌀 ${p.name} está na tempestade e a equipe perdeu ${total} de HP!`, 'bad');
    if (!hasUsable(p)) eliminate(state, p, 'foi engolido pela tempestade');
  }
}

export function eliminate(state, p, why) {
  if (p.out) return;
  const alive = alivePlayers(state).length;
  p.out = true;
  p.place = alive;
  fx(state, { k: 'eliminated', pid: p.id, place: alive, why });
  log(state, `💀 ${p.name} ${why} e está ELIMINADO! (${alive}º lugar)`, 'bad');
  checkRoyaleEnd(state);
}

/** Termina quando sobra 1 (ou ninguém). Devolve o vencedor (ou null se ainda não acabou). */
export function checkRoyaleEnd(state) {
  if (rulesOf(state) !== 'royale' || state.status !== 'playing') return null;
  const alive = alivePlayers(state);
  if (alive.length > 1) return null;
  const w = alive[0] || [...state.players].sort((a, b) => (a.place || 99) - (b.place || 99))[0];
  if (w) w.place = 1;
  return { winner: w, reason: alive.length ? 'Último treinador de pé no Battle Royale!' : 'Sobreviveu por mais tempo.' };
}

/** Ao parar numa casa com outro treinador vivo: batalha obrigatória. */
export function royaleClash(state, p, sp) {
  if (rulesOf(state) !== 'royale') return false;
  const q = state.players.find(x => x.id !== p.id && !x.out && x.pos === sp.id && hasUsable(x));
  if (!q || !hasUsable(p)) return false;
  log(state, `⚔️ ${p.name} encontrou ${q.name} em ${sp.name}! No Battle Royale não dá para fugir do duelo.`, 'battle');
  startBattle(state, { kind: 'pvp', pid: p.id, foe: { kind: 'player', pid: q.id } });
  state.phase = 'battle';
  return true;
}

/** Centro Pokémon no Battle Royale: uma vez por cidade e nunca dentro da tempestade. */
export function royaleHealCheck(state, p, sp) {
  if (rulesOf(state) !== 'royale') return;
  if (stormAt(state, sp.id).in) fail('O Centro Pokémon está fechado por causa da tempestade!');
  if ((p.healedAt ||= []).includes(sp.id)) fail('No Battle Royale cada Centro Pokémon só cura você uma vez.');
  p.healedAt.push(sp.id);
}

/** Ranking final do Battle Royale (1º = vencedor). */
export const royaleRank = state => [...state.players].sort((a, b) => (a.place || 1) - (b.place || 1));

// ------------------------------------------------------------------ Conquista
export const ownerOf = (state, gymId) => state.conquest?.owners[gymId] || null;
export const citiesOf = (state, pid) => GYMS.filter(g => state.conquest?.owners[g.id] === pid).length;

/** Desafio na cidade de ginásio: líder (neutra), guarnição de outro jogador, ou gerenciar a própria. */
export function conquestGym(state, rng, p, sp, gym) {
  const owner = ownerOf(state, gym.id);
  if (owner === p.id) {
    if (state.turnFlags.manage) fail('Você já reorganizou a guarnição neste turno.');
    state.turnFlags.manage = true;
    state.pending = { kind: 'garrison', pid: p.id, city: gym.id };
    log(state, `🏰 ${p.name} está reorganizando a guarnição de ${sp.name}.`);
    return;
  }
  if (state.turnFlags.gym) fail('Só um ataque a cidade por turno.');
  state.turnFlags.gym = true;
  if (!owner) {
    startBattle(state, { kind: 'gym', pid: p.id, ref: gym.id,
      foe: { kind: 'npc', name: gym.leader, title: 'Líder', sprite: gym.sprite, prize: gym.prize, team: gym.team.map(([s, l]) => createMon(rng, s, l)) } });
  } else {
    const o = getPlayer(state, owner);
    const defenders = state.conquest.garrison[gym.id].filter(m => m.hp > 0);
    const team = defenders.length ? clone(defenders) : gym.team.slice(0, 1).map(([s, l]) => createMon(rng, s, Math.max(5, l - 3)));
    startBattle(state, { kind: 'siege', pid: p.id, ref: gym.id,
      foe: { kind: 'npc', name: `Guarnição de ${o.name}`, title: defenders.length ? 'Defensores' : 'Guarda da cidade', sprite: 'trainers/acetrainer_m.png', prize: 120 * sp.tier, team } });
  }
  state.phase = 'battle';
}

/** Fim de batalha de ginásio/cerco na Conquista. Devolve true se tratou. */
export function conquestBattleEnd(state, rng, b, outcome, p0, hooks) {
  if (rulesOf(state) !== 'conquest' || (b.kind !== 'gym' && b.kind !== 'siege')) return false;
  const gym = GYMS.find(g => g.id === b.ref);
  const sp = getSpace(gym.space);
  const C = state.conquest;
  const foe = b.sides[1];
  if (outcome.result === 'draw') return true;
  if (b.kind === 'siege') {
    // a guarnição guarda o HP que sobrou (vença ou perca)
    const byUid = Object.fromEntries(foe.team.map(m => [m.uid, m]));
    for (const m of C.garrison[gym.id]) if (byUid[m.uid]) m.hp = Math.max(0, byUid[m.uid].hp);
  }
  if (outcome.winner === 0) {
    const prize = foe.prize || 0;
    p0.gold += prize;
    p0.stats.wins += 1;
    const prev = C.owners[gym.id] ? getPlayer(state, C.owners[gym.id]) : null;
    if (prev) {
      // os defensores derrotados voltam para o PC do dono anterior (machucados)
      for (const m of C.garrison[gym.id]) { m.hp = 0; prev.box.push(m); }
      fx(state, { k: 'city_lost', pid: prev.id, city: gym.id });
    }
    C.garrison[gym.id] = [];
    C.owners[gym.id] = p0.id;
    if (!p0.badges.includes(gym.id)) { p0.badges.push(gym.id); fx(state, { k: 'badge', pid: p0.id, badge: gym.id }); hooks.badge?.(p0); }
    fx(state, { k: 'city_taken', pid: p0.id, city: gym.id, from: prev?.id || null });
    log(state, `🏰 ${p0.name} DOMINOU ${sp.name}${prev ? ` (tomada de ${prev.name})` : ''}! +${prize} de ouro. Agora escolha quem fica defendendo.`, 'win');
    hooks.mission?.(p0);
    state.pending = { kind: 'garrison', pid: p0.id, city: gym.id };
    const all = GYMS.every(g => C.owners[g.id] === p0.id);
    if (all) { state.pending = null; return { finish: p0, reason: `Dominou todas as ${GYMS.length} cidades!` }; }
    return true;
  }
  p0.stats.losses += 1;
  log(state, `🛡️ ${sp.name} resistiu ao ataque de ${p0.name}.`, 'bad');
  if (!hasUsable(p0) && !outcome.surrender) knockOut(state, p0, 0.1);
  return true;
}

/** Escolha da guarnição: 0 a 3 Pokémon (da equipe ou do PC). Quem já estava volta para o PC. */
export function garrisonAction(state, p, a) {
  const pend = state.pending;
  if (pend?.kind !== 'garrison' || pend.pid !== p.id) fail('Nada para decidir agora.');
  const C = state.conquest;
  const uids = [...new Set((Array.isArray(a.uids) ? a.uids : []).map(String))].slice(0, GARRISON_MAX);
  // devolve a guarnição antiga para o PC
  for (const m of C.garrison[pend.city]) p.box.push(m);
  C.garrison[pend.city] = [];
  const picked = [];
  for (const uid of uids) {
    let i = p.team.findIndex(m => m.uid === uid);
    if (i >= 0) {
      if (p.team.filter(m => m.hp > 0).length <= 1 && p.team[i].hp > 0) continue; // a equipe precisa de alguém de pé
      picked.push(p.team.splice(i, 1)[0]);
      continue;
    }
    i = p.box.findIndex(m => m.uid === uid);
    if (i >= 0) picked.push(p.box.splice(i, 1)[0]);
  }
  if (!p.team.length && p.box.length) p.team.push(p.box.shift());
  picked.forEach(fullHeal);
  C.garrison[pend.city] = picked;
  state.pending = null;
  const sp = getSpace(GYMS.find(g => g.id === pend.city).space);
  log(state, picked.length ? `🛡️ ${p.name} deixou ${picked.map(m => speciesName(m.sp)).join(', ')} defendendo ${sp.name}.` : `🛡️ ${p.name} deixou ${sp.name} com a guarda da cidade.`);
  fx(state, { k: 'garrison', pid: p.id, city: pend.city, n: picked.length });
}

function conquestIncome(state) {
  const C = state.conquest;
  const pay = {};
  for (const g of GYMS) {
    const o = C.owners[g.id];
    if (!o) continue;
    const t = getSpace(g.space)?.tier || 1;
    pay[o] = (pay[o] || 0) + CITY_INCOME * t;
    // a guarnição se recupera um pouco a cada rodada
    for (const m of C.garrison[g.id]) m.hp = Math.min(maxHpOf(m), m.hp + Math.ceil(maxHpOf(m) * 0.15));
  }
  for (const [pid, g] of Object.entries(pay)) {
    const p = getPlayer(state, pid);
    if (!p) continue;
    p.gold += g;
    log(state, `💰 ${p.name} recebeu ${g} de ouro das cidades dominadas (${citiesOf(state, pid)}).`);
  }
}

/** Visitar a própria cidade cura a guarnição. */
export function conquestVisit(state, p, sp) {
  const gym = GYMS.find(g => g.space === sp.id);
  if (!gym || ownerOf(state, gym.id) !== p.id) return;
  state.conquest.garrison[gym.id].forEach(fullHeal);
}

/** Vencedor no limite de turnos (Conquista: mais cidades). */
export function conquestRank(state, score) {
  return [...state.players].sort((a, b) => citiesOf(state, b.id) - citiesOf(state, a.id) || score(b) - score(a));
}

function spread(rng, list, n) {
  if (!list.length) return SPACE_LIST.slice(0, 1);
  const out = [];
  const pool = list.slice();
  out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  while (out.length < n && pool.length) {
    // pega a casa mais longe das já escolhidas
    let best = 0, bestD = -1;
    pool.forEach((s, i) => {
      const d = Math.min(...out.map(o => (o.x - s.x) * (o.x - s.x) * 4 + (o.y - s.y) * (o.y - s.y)));
      if (d > bestD) { bestD = d; best = i; }
    });
    out.push(pool.splice(best, 1)[0]);
  }
  while (out.length < n) out.push(out[out.length % Math.max(1, out.length)]);
  return out;
}
