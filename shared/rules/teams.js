// 🤝 v65 — Partidas em TIME (Duplas / Trios) no tabuleiro, e 🏰 Guerra de Regiões (Conquista por times).
// O time vence junto: a vitória de um membro vale para todos (state.winners). Aliados não se desafiam,
// podem passar itens, se curam juntos no Centro Pokémon, ajudam nas batalhas quando estão perto e,
// uma vez por partida, cada um pode pedir o 🎲 Dado de Apoio (rola 2 dados e fica com o maior).
import { getSpace } from '../data/board.js';
import { ITEMS } from '../data/items.js';
import { fail, getPlayer, log, fx, addItem, takeItem } from './helpers.js';

export const TEAM_SIZES = [0, 2, 3];
export const SQUADS = [
  { name: 'Time Vermelho', short: 'Vermelho', icon: '🔴', color: '#e2463f' },
  { name: 'Time Azul', short: 'Azul', icon: '🔵', color: '#3d7fe0' },
  { name: 'Time Verde', short: 'Verde', icon: '🟢', color: '#2fae63' }
];
/** Itens que dá para passar para um aliado. */
export const GIVE_KINDS = ['heal', 'revive', 'ball', 'boost', 'candy', 'stone', 'tm', 'status_heal'];
export const ALLY_ASSIST_CHANCE = 0.35; // por rodada, 1× por batalha
export const ALLY_ASSIST_PCT = 0.14;    // dano: % do HP máx. do alvo × efetividade
export const REGION_BONUS = 0.15;       // 🏰 Guerra de Regiões: +15% de renda por cidade extra do time

export const teamSize = state => (TEAM_SIZES.includes(Number(state?.options?.teams)) ? Number(state.options.teams) : 0);
export const teamsOn = state => teamSize(state) >= 2 && state?.kind !== 'duel';
export const squadOf = p => (Number.isInteger(p?.squad) ? p.squad : null);
export const allies = (state, a, b) => teamsOn(state) && !!a && !!b && a.id !== b.id && squadOf(a) !== null && squadOf(a) === squadOf(b);
export const squadMembers = (state, sq) => state.players.filter(p => squadOf(p) === sq);
export const squadIds = state => [...new Set(state.players.map(squadOf).filter(x => x !== null))].sort((a, b) => a - b);
export const squadName = sq => SQUADS[sq]?.name || `Time ${sq + 1}`;

/** Separa os jogadores em times. Quem escolheu (cfg.squad) fica; o resto preenche o time com menos gente. */
export function assignSquads(players, size) {
  if (!TEAM_SIZES.includes(size) || size < 2) return;
  const n = Math.max(2, Math.ceil(players.length / size));
  const count = Array(n).fill(0);
  for (const p of players) {
    const want = Number.isInteger(p.squad) && p.squad >= 0 && p.squad < n && count[p.squad] < size ? p.squad : null;
    if (want !== null) count[want]++;
    p.squad = want;
  }
  for (const p of players) {
    if (p.squad !== null) continue;
    const i = count.indexOf(Math.min(...count));
    p.squad = i; count[i]++;
  }
}

/** Pontos do time (soma dos membros). */
export const squadScore = (state, sq, score) => squadMembers(state, sq).reduce((a, p) => a + score(p), 0);

/** Na vitória, todo o time vence junto. */
export function markTeamWin(state, winner) {
  if (!teamsOn(state) || !winner || squadOf(winner) === null) return;
  state.winnerSquad = squadOf(winner);
  state.winners = squadMembers(state, state.winnerSquad).map(p => p.id);
}
export const isWinner = (state, p) => !!p && (state.winner === p.id || (Array.isArray(state.winners) && state.winners.includes(p.id)));

/** Aliado perto (mesma casa ou vizinha) e com Pokémon de pé. */
export function nearAlly(state, p) {
  if (!teamsOn(state)) return null;
  const sp = getSpace(p.pos);
  const near = new Set([p.pos, ...(sp?.links || [])]);
  return state.players.find(q => allies(state, p, q) && !q.out && !q.left && near.has(q.pos) && q.team.some(m => m.hp > 0)) || null;
}

/** Ações de time: passar item e pedir o Dado de Apoio. */
export function teamAction(state, p, a) {
  if (!teamsOn(state)) fail('Esta partida não é em times.');
  if (a.op === 'give') {
    const q = getPlayer(state, String(a.to || ''));
    if (!allies(state, p, q)) fail('Só dá para passar itens para alguém do seu time.');
    const sp = getSpace(p.pos);
    if (q.pos !== p.pos && !(sp?.links || []).includes(q.pos)) fail(`${q.name} precisa estar na mesma casa ou numa casa vizinha.`);
    const item = String(a.item || '');
    const it = ITEMS[item];
    if (!it || !(p.items[item] > 0)) fail('Você não tem esse item.');
    if (!GIVE_KINDS.includes(it.kind)) fail('Esse item não pode ser passado.');
    if ((state.turnFlags.gives || 0) >= 2) fail('Dá para passar no máximo 2 itens por turno.');
    const qty = Math.max(1, Math.min(p.items[item], Number(a.qty) || 1, 5));
    takeItem(p, item, qty);
    addItem(q, item, qty);
    state.turnFlags.gives = (state.turnFlags.gives || 0) + 1;
    log(state, `🤝 ${p.name} passou ${qty}× ${it.name} para ${q.name}.`, 'good');
    fx(state, { k: 'team_give', pid: p.id, to: q.id, item, qty });
    return;
  }
  if (a.op === 'support') {
    if (state.phase !== 'roll') fail('O Dado de Apoio é pedido antes de rolar o dado.');
    if (p.supportUsed) fail('Você já usou o Dado de Apoio nesta partida.');
    if (!squadMembers(state, squadOf(p)).some(q => q.id !== p.id && !q.out && !q.left)) fail('Seu time não tem ninguém para ajudar.');
    p.supportUsed = true;
    state.turnFlags.supportDie = true;
    log(state, `🎲 ${p.name} pediu o Dado de Apoio do time: vai rolar 2 dados e ficar com o maior.`, 'good');
    fx(state, { k: 'team_support', pid: p.id });
    return;
  }
  fail('Ação de time desconhecida.');
}
