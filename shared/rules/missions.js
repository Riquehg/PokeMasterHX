// Missões e companheiros dentro da partida.
import { MISSION_TEMPLATES, MISSION_TYPES, ACTIVE_MISSIONS, MAX_MISSIONS_PER_MATCH } from '../data/missions.js';
import { COMPANIONS, COMPANION_BY_TYPE, getCompanion, scaledBonus } from '../data/companions.js';
import { getSpecies } from '../data/pokemon.js';
import { ITEMS } from '../data/items.js';
import { createRng } from './rng.js';
import { getPlayer, log, fx, addItem } from './helpers.js';
import { TYPE_LABELS } from './types.js';

function seedFor(state, p) {
  let h = 2166136261;
  const str = `${state.id || ''}|${p.id}|${p.missionSeq || 0}|${state.turn}`;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function newMission(state, p) {
  const rng = createRng(seedFor(state, p));
  p.missionSeq = (p.missionSeq || 0) + 1;
  const active = new Set(p.missions.map(m => m.tpl + (m.type || '')));
  for (let tries = 0; tries < 12; tries++) {
    const tpl = rng.weighted(MISSION_TEMPLATES.map(t => [t, t.weight]));
    const type = tpl.typed ? rng.pick(MISSION_TYPES) : null;
    if (active.has(tpl.id + (type || ''))) continue;
    const n = rng.int(tpl.n[0], tpl.n[1]);
    const text = tpl.text.replace('{n}', n).replace('{T}', TYPE_LABELS[type] || type || '');
    let reward = tpl.reward === 'companion' ? { companion: COMPANION_BY_TYPE[type] } : { ...tpl.reward };
    return { id: `m${p.missionSeq}`, tpl: tpl.id, type, n, done: 0, text, reward };
  }
  return null;
}

/** Missões iniciais de um treinador. */
export function initMissions(state, p) {
  p.missions = [];
  p.missionsDone = 0;
  for (let i = 0; i < ACTIVE_MISSIONS; i++) { const m = newMission(state, p); if (m) p.missions.push(m); }
}

function matches(m, ev) {
  const sp = ev.sp ? getSpecies(ev.sp) : null;
  switch (m.tpl) {
    case 'catch_type': return ev.k === 'capture' && sp?.types.includes(m.type);
    case 'ko_type': return ev.k === 'ko' && sp?.types.includes(m.type);
    case 'catch_any': return ev.k === 'capture';
    case 'catch_tier': return ev.k === 'capture' && sp?.tier >= 3;
    case 'trainer_win': return ev.k === 'trainer_win';
    case 'badge': return ev.k === 'badge';
    case 'evolve': return ev.k === 'evolve';
    case 'raid': return ev.k === 'raid_win';
    default: return false;
  }
}

/** Registra um acontecimento para as missões do jogador. */
export function progressMission(state, pid, ev) {
  const p = getPlayer(state, pid);
  if (!p || !p.missions || state.options?.duel) return;
  for (const m of [...p.missions]) {
    if (!matches(m, ev)) continue;
    m.done += 1;
    if (m.done < m.n) continue;
    completeMission(state, p, m);
  }
}

function completeMission(state, p, m) {
  p.missions = p.missions.filter(x => x !== m);
  p.missionsDone = (p.missionsDone || 0) + 1;
  const got = [];
  const r = m.reward || {};
  if (r.companion && COMPANIONS[r.companion]) {
    p.companions ||= [];
    if (p.companions.includes(r.companion)) {
      p.gold += 400;
      got.push(`400 de ouro (você já tem ${COMPANIONS[r.companion].name})`);
    } else {
      p.companions.push(r.companion);
      if (!p.companion) p.companion = r.companion;
      got.push(`companheiro ${COMPANIONS[r.companion].name} ${COMPANIONS[r.companion].icon}`);
    }
  }
  if (r.gold) { p.gold += r.gold; got.push(`${r.gold} de ouro`); }
  for (const [id, q] of Object.entries(r.items || {})) if (ITEMS[id]) { addItem(p, id, q); got.push(`${q}x ${ITEMS[id].name}`); }
  log(state, `🎯 ${p.name} completou a missão "${m.text}" e ganhou ${got.join(', ')}!`, 'win');
  fx(state, { k: 'mission_done', pid: p.id, text: m.text, rewards: got, companion: r.companion && p.companions.includes(r.companion) ? r.companion : null });
  if (p.missionsDone + p.missions.length < MAX_MISSIONS_PER_MATCH) {
    const nm = newMission(state, p);
    if (nm) p.missions.push(nm);
  }
}

/** Bônus do companheiro do lado si da batalha (null para selvagens/NPCs). */
export function companionBonus(state, si) {
  const side = state.battle?.sides[si];
  if (!side || side.kind !== 'player') return null;
  const p = getPlayer(state, side.pid);
  return playerCompanionBonus(p);
}

/** Nível de laço do companheiro que está com o jogador (1 a 10; vem da conta no início da partida). */
export const companionLevel = p => Math.max(1, Math.min(10, Number(p?.bond?.[p?.companion]) || 1));

export function playerCompanionBonus(p) {
  return p?.companion ? scaledBonus(p.companion, companionLevel(p)) : null;
}
