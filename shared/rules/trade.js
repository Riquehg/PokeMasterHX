// Trocas dentro da partida: Pokémon, itens e ouro entre jogadores.
// Quem propõe monta "dou" e "quero"; o outro aceita ou recusa (a qualquer momento, fora de batalha).
// CPUs respondem na hora, avaliando se a troca é boa para elas.
import { getSpecies } from '../data/pokemon.js';
import { ITEMS } from '../data/items.js';
import { TEAM_SIZE, statsOf } from './monsters.js';
import { fail, getPlayer, log, fx, giveMon, speciesName, markCaught } from './helpers.js';

export const MAX_TRADE_GOLD = 5000;

function findMon(p, uid) {
  if (!uid) return null;
  let i = p.team.findIndex(m => m.uid === uid);
  if (i >= 0) return { where: 'team', i, mon: p.team[i] };
  i = p.box.findIndex(m => m.uid === uid);
  if (i >= 0) return { where: 'box', i, mon: p.box[i] };
  return null;
}

function cleanSide(p, side, label) {
  const out = { mon: side?.mon ? String(side.mon) : null, items: {}, gold: Math.max(0, Math.min(MAX_TRADE_GOLD, Math.floor(Number(side?.gold) || 0))) };
  for (const [id, q] of Object.entries(side?.items || {})) {
    const n = Math.floor(Number(q) || 0);
    if (n <= 0) continue;
    if (!ITEMS[id]) fail('Item inválido na troca.');
    out.items[id] = Math.min(n, 99);
  }
  if (out.mon) {
    const f = findMon(p, out.mon);
    if (!f) fail(`${label} não tem mais esse Pokémon.`);
    if (f.where === 'team' && p.team.length <= 1) fail(`${label} precisa manter pelo menos 1 Pokémon na equipe.`);
  }
  for (const [id, n] of Object.entries(out.items)) if ((p.items[id] || 0) < n) fail(`${label} não tem ${n}x ${ITEMS[id].name}.`);
  if (p.gold < out.gold) fail(`${label} não tem ${out.gold} de ouro.`);
  return out;
}

const isEmpty = s => !s.mon && !s.gold && !Object.keys(s.items).length;

function inBattle(state, pid) {
  const b = state.battle;
  return !!(b && !b.over && b.sides.some(s => s.pid === pid));
}

export function describeSide(p, s) {
  const parts = [];
  if (s.mon) { const f = findMon(p, s.mon); if (f) parts.push(`${speciesName(f.mon.sp)}${f.mon.shiny ? ' ✨' : ''} Nv.${f.mon.lvl}`); }
  for (const [id, n] of Object.entries(s.items)) parts.push(`${n}x ${ITEMS[id]?.name || id}`);
  if (s.gold) parts.push(`${s.gold} de ouro`);
  return parts.join(' + ') || 'nada';
}

/** Valor estimado (usado pelas CPUs para decidir). */
export function tradeValue(p, s) {
  let v = s.gold;
  for (const [id, n] of Object.entries(s.items)) v += (ITEMS[id]?.price || 400) * n * 0.8;
  if (s.mon) {
    const f = findMon(p, s.mon);
    if (f) {
      const m = f.mon, sp = getSpecies(m.sp), st = statsOf(m);
      v += (st.atk * 2 + st.maxHp) * 12 + sp.tier * 250 + (m.shiny ? 4000 : 0) + (sp.legendary ? 6000 : 0) + (sp.mythical ? 4000 : 0);
    }
  }
  return v;
}

export function proposeTrade(state, rng, p, a) {
  if (state.options.trades === false) fail('Trocas estão desativadas nesta partida (modo competitivo).');
  if (state.pending?.kind === 'pvp_invite') fail('Aguarde o desafio PvP terminar.');
  const q = getPlayer(state, String(a.to || ''));
  if (!q || q.id === p.id) fail('Escolha outro treinador para trocar.');
  if (q.left) fail(`${q.name} saiu da partida.`);
  if (inBattle(state, p.id) || inBattle(state, q.id)) fail('Não dá para trocar durante uma batalha.');
  state.trades ||= [];
  if (state.trades.some(t => t.from === p.id)) fail('Você já tem uma proposta aberta. Cancele antes de fazer outra.');
  const give = cleanSide(p, a.give, 'Você');
  const want = cleanSide(q, a.want, q.name);
  if (isEmpty(give) && isEmpty(want)) fail('A troca está vazia.');
  if (isEmpty(give) || isEmpty(want)) fail('Os dois lados precisam oferecer algo.');
  const t = { id: `t${state.turn}_${(rng.int(1, 1e6)).toString(36)}`, from: p.id, to: q.id, give, want, at: state.turn };
  state.trades.push(t);
  log(state, `🤝 ${p.name} propôs uma troca a ${q.name}: dá ${describeSide(p, give)} ⇄ quer ${describeSide(q, want)}.`, 'event');
  fx(state, { k: 'trade_offer', id: t.id, from: p.id, to: q.id });
  if (q.isBot) {
    const fair = tradeValue(p, give) >= tradeValue(q, want) * 1.1;
    respondTrade(state, rng, q, { id: t.id, accept: fair });
  }
}

export function respondTrade(state, rng, q, a) {
  const t = (state.trades || []).find(x => x.id === a.id);
  if (!t) fail('Essa proposta não existe mais.');
  if (a.cancel) {
    if (t.from !== q.id) fail('Só quem propôs pode cancelar.');
    state.trades = state.trades.filter(x => x !== t);
    log(state, `🤝 ${q.name} cancelou a proposta de troca.`);
    return;
  }
  if (t.to !== q.id) fail('Essa proposta não é para você.');
  const p = getPlayer(state, t.from);
  state.trades = state.trades.filter(x => x !== t);
  if (!a.accept) {
    log(state, `🤝 ${q.name} recusou a troca de ${p.name}.`, 'bad');
    fx(state, { k: 'trade_done', id: t.id, from: p.id, to: q.id, ok: false });
    return;
  }
  if (inBattle(state, p.id) || inBattle(state, q.id)) fail('Não dá para trocar durante uma batalha.');
  // revalida (algo pode ter mudado desde a proposta)
  const give = cleanSide(p, t.give, p.name);
  const want = cleanSide(q, t.want, 'Você');
  const pm = give.mon ? findMon(p, give.mon) : null;
  const qm = want.mon ? findMon(q, want.mon) : null;
  const textP = describeSide(p, give), textQ = describeSide(q, want);

  move(p, q, give, pm);
  move(q, p, want, qm);
  log(state, `✅ Troca feita! ${p.name} deu ${textP} e recebeu ${textQ} de ${q.name}.`, 'good');
  fx(state, { k: 'trade_done', id: t.id, from: p.id, to: q.id, ok: true, gave: pm?.mon.sp || null, got: qm?.mon.sp || null });
}

function move(from, to, side, found) {
  from.gold -= side.gold; to.gold += side.gold;
  for (const [id, n] of Object.entries(side.items)) {
    from.items[id] -= n;
    if (from.items[id] <= 0) delete from.items[id];
    to.items[id] = (to.items[id] || 0) + n;
  }
  if (found) {
    const arr = found.where === 'team' ? from.team : from.box;
    const i = arr.findIndex(m => m.uid === found.mon.uid);
    const [mon] = arr.splice(i, 1);
    if (from.team.length === 0 && from.box.length) from.team.push(from.box.shift());
    delete mon.starter; delete mon.brought; // Pokémon trocado precisa das insígnias do novo dono
    mon.traded = true;
    (from.tradedAway ||= []).push(mon.uid);
    to.tradedAway = (to.tradedAway || []).filter(u => u !== mon.uid);
    giveMon(to, mon);
    markCaught(to, mon.sp, !!mon.shiny);
  }
}

export { TEAM_SIZE };
