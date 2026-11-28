// Lógica do backend, independente de infraestrutura.
// Recebe um "db" (adaptador Supabase em produção, memória no servidor de desenvolvimento/testes).
import { createMatch, applyAction, addLatePlayer, score, MAX_PLAYERS, fillTraits, BRING_GOLD_OPTIONS } from '../../shared/engine.js';
import { isMapId, validateCustomMap } from '../../shared/data/board.js';
import { dailyStatus, loginDay } from '../../shared/data/daily.js';
import { BOX_MAX, BOX_ICONS } from '../../shared/data/boxes.js';
import { randomSeed } from '../../shared/rules/rng.js';
import { ELO_TIERS } from '../../shared/data/elo.js';
import { ensureSeason, applyLeagueResult, leagueSort, seasonId, seasonName, divInfo, LEAGUE_DIVS } from '../../shared/data/league.js';
import { CUP_MAX_PLAYERS, DUEL_LEVEL_CAP } from '../../shared/data/cup.js';
import { serieOp } from './series.js';
import { farmOp } from './farm.js';
import { safariOp } from './safari.js';
import { towerOp } from './tower.js';
import { duelQueue, duelQueueStatus, duelQueueCancel, duelTeam, startCup, duelFinished } from './tournament.js';
import { SPECIES, STARTERS, getSpecies } from '../../shared/data/pokemon.js';
import { dailyPokemon } from '../../shared/daily.js';
import { cleanNick, vaultExtra } from '../../shared/data/cosmetics.js';
import { ITEMS, isKeepable, cleanBring, BAG_MAX_PER_ITEM, STARTING_ITEMS, GENE_ROLLS } from '../../shared/data/items.js';
import { tmMovesFor, defaultMoveIds, MOVES, moveIdsOf, learnMoveIds } from '../../shared/data/moves.js';
import { MEGAS, megaByStone } from '../../shared/data/megas.js';
import { releaseGold } from '../../shared/data/release.js';
import { levelEvoTarget, variantAfter, itemEvoTarget } from '../../shared/data/evolution.js';
import { GMAX } from '../../shared/data/gmax.js';
import { defIvOf, MAX_LEVEL } from '../../shared/rules/monsters.js';
import { isWinner } from '../../shared/rules/teams.js';
import { GUILD_POINTS, addGuildPts } from '../../shared/data/guilds.js';
import { TITLE_BY_ID, unlockedTitles } from '../../shared/data/titles.js';
import { bondLevel, bondGain, BOND_MAX, COMPANIONS } from '../../shared/data/companions.js';
import { equippedCosmetic, equippedSkin, skinFor, publishCaptures, getAnnouncement, getShop, cleanShop, creditPayment, myCosmetics, refreshCosmeticInMatches } from './shop.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const bad = msg => { throw new HttpError(400, msg); };
const forbidden = msg => { throw new HttpError(403, msg || 'Sem permissão.'); };
export const notFound = msg => { throw new HttpError(404, msg || 'Não encontrado.'); };

export const COLLECTION_MAX = 300;
/** Vagas da Coleção desta conta (300, ou 350 com a conveniência da Loja de Diamantes). */
export const collectionMax = prof => COLLECTION_MAX + vaultExtra(prof?.stats); // 📦 v66: +50 por compra na 💎 Loja
export const START_RATING = 1000;
const BOT_NAMES = ['Brendan', 'May', 'Dawn', 'Lucas', 'Hilda', 'Nate', 'Serena', 'Calem', 'Red', 'Leaf'];

/**
 * Modos de sala:
 *  balanced   — todos começam com 1 inicial Nv.5 (justo). Pode ter CPUs.
 *  collection — cada um leva até 6 Pokémon da sua Coleção (com limite de nível opcional).
 *  ranked     — competitivo: balanceado, só humanos, limite de turnos obrigatório, vale rating (Elo).
 *  solo       — partida privada contra CPUs (salva na conta).
 */
export const MODES = ['balanced', 'collection', 'ranked', 'solo', 'duel', 'cup'];
export const TEAM_MODES = ['collection', 'duel', 'cup']; // modos em que se leva o time da Coleção

export function cleanName(s, fallback = 'Treinador') {
  const v = String(s || '').replace(/[<>"'`]/g, '').trim().slice(0, 20);
  return v || fallback;
}

function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)];
  return c;
}

export function publicMatch(row, userId) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    hostId: row.host_id,
    status: row.status,
    isPublic: row.is_public,
    hasPin: !!row.has_pin,
    options: row.options || {},
    lobby: row.lobby || [],
    state: row.state || null,
    chat: row.chat || [],
    version: row.version,
    updatedAt: row.updated_at,
    me: userId || null
  };
}

// ------------------------------------------------------------------ perfil
export async function getOrCreateProfile(db, user) {
  let p = await db.getProfile(user.id);
  if (!p) {
    p = await db.upsertProfile(user.id, {
      trainer_name: cleanName(user.name || (user.email || '').split('@')[0]),
      avatar: 1, pokedex: [], vault: [], stats: {}, points: 0
    });
  }
  return p;
}

/**
 * Lê → altera → grava o perfil só se ninguém mexeu nele no meio (coluna rev). Tenta de novo em caso de conflito.
 * fn(perfil) devolve o patch (ou null para não gravar); pode lançar erro para abortar.
 */
export async function mutateProfile(db, id, fn) {
  for (let i = 0; i < 15; i++) {
    if (i) await new Promise(r => setTimeout(r, Math.random() * 15 * i)); // espera um pouco antes de tentar de novo
    const prof = await db.getProfile(id);
    if (!prof) return null;
    const patch = await fn(prof);
    if (!patch) return prof;
    const r = await db.updateProfileIf(id, prof.rev || 0, patch, prof);
    if (r) return r;
  }
  throw new Error('Muitas alterações ao mesmo tempo na sua conta. Tente de novo.');
}

/** Ouro da conta ganho ao fim de uma partida salva no servidor. */
export function accountGoldReward(state, p) {
  // o ouro trazido da conta volta à parte (refundBrought); só o ouro ganho na partida vira recompensa
  const earned = Math.max(0, p.gold - (p.broughtGold || 0));
  // 🪙 v66: 1/4 do ouro que sobrou na partida vai para a conta (antes 1/10, até 1.200)
  const base = Math.floor(earned * GOLD_KEEP_RATE) + 40 * (p.badges?.length || 0) + (isWinner(state, p) ? 150 : 0) + (p.champion ? 250 : 0);
  return Math.min(GOLD_REWARD_MAX, base);
}
export const GOLD_KEEP_RATE = 0.25;
export const GOLD_REWARD_MAX = 4000;

/** Devolve o que sobrou do ouro trazido da conta (até o valor trazido). */
export const refundBrought = p => Math.max(0, Math.min(p.gold, p.broughtGold || 0));

/** Centro de Treino: custo em ouro da conta para subir 1 nível (cresce com o nível). */
export const TRAIN_MAX_LEVEL = 50;
export const trainCost = lvl => 15 * lvl + 20;

async function withCosmetic(db, prof) {
  let cosmetic = null;
  try { cosmetic = await equippedCosmetic(db, prof); } catch { /* ok */ }
  return { ...prof, cosmetic };
}

export async function profileOp(db, user, body) {
  if (/^(farm|home)_/.test(String(body.op || ''))) return farmOp(db, user, body); // 🌾 Fazenda e 🏡 casa
  if (/^safari_/.test(String(body.op || ''))) return safariOp(db, user, body); // 🌿 Zona Safári
  const p = await getOrCreateProfile(db, user);
  if (body.op === 'get' || !body.op) {
    let cosmetic = null;
    try { cosmetic = await equippedCosmetic(db, p); } catch { /* ok */ }
    let prof = p;
    // Pokémon antigos da Coleção ganham (uma vez) natureza, potencial e golpes fixos
    if ((p.vault || []).some(m => !m.nature || !m.iv || !m.moves || !m.gender)) {
      try {
        prof = (await mutateProfile(db, user.id, cur => {
          const vault = cur.vault || [];
          return vault.some(m => !m.nature || !m.iv || !m.moves || !m.gender) ? { vault: vault.map(fillTraits) } : null;
        })) || p;
      } catch (e) { console.error('[traits]', e.message); prof = { ...p, vault: (p.vault || []).map(fillTraits) }; }
    }
    return { profile: { ...prof, cosmetic } };
  }
  if (body.op === 'update') {
    const patch = {};
    if (body.trainerName !== undefined) patch.trainer_name = cleanName(body.trainerName);
    if (body.avatar !== undefined) patch.avatar = Math.max(1, Math.min(8, Number(body.avatar) || 1));
    return { profile: await withCosmetic(db, await db.upsertProfile(user.id, patch)) };
  }
  if (body.op === 'companion') {
    const id = body.id || null;
    return { profile: await mutateProfile(db, user.id, prof => {
      const st = { ...(prof.stats || {}) };
      if (id && !(st.companions || []).includes(id)) bad('Você ainda não tem esse companheiro. Ganhe completando missões nas partidas.');
      st.companion = id;
      return { stats: st };
    }).then(x => withCosmetic(db, x)) };
  }
  if (body.op === 'train') bad('O Centro de Treino virou a 🌾 Fazenda: coloque o Pokémon lá para ele ganhar XP com o tempo.');
  if (body.op === 'train_old') {
    // (antigo) Centro de Treino por ouro — desativado na v26
    const levels = Math.max(1, Math.min(10, Number(body.levels) || 1));
    const mon = (p.vault || []).find(m => m.uid === body.uid);
    if (!mon) bad('Pokémon não encontrado na Coleção.');
    if (mon.lvl >= TRAIN_MAX_LEVEL) bad(`O Centro de Treino vai até o Nv. ${TRAIN_MAX_LEVEL}. Daqui pra frente, só batalhando!`);
    const target = Math.min(TRAIN_MAX_LEVEL, mon.lvl + levels);
    let cost = 0;
    for (let l = mon.lvl; l < target; l++) cost += trainCost(l);
    const paid = await db.walletAdd(user.id, 0, -cost);
    if (!paid) bad(`Ouro insuficiente: precisa de ${cost}.`);
    let evolved = null;
    const prof = await mutateProfile(db, user.id, cur => {
      const vault = (cur.vault || []).map(m => {
        if (m.uid !== body.uid) return m;
        let sp = m.sp;
        // evolui como numa batalha, se passar do nível de evolução
        let v = m.v;
        for (let k = 0; k < 2; k++) {
          const to = levelEvoTarget({ ...m, sp, v }, Date.now(), target);
          if (to) { v = variantAfter({ v }, to); sp = to; evolved = sp; } else break;
        }
        const out = { ...m, lvl: target, sp };
        if (v) out.v = v; else delete out.v;
        return out;
      });
      const pokedex = evolved && !(cur.pokedex || []).includes(evolved) ? [...(cur.pokedex || []), evolved] : cur.pokedex;
      return { vault, ...(pokedex !== cur.pokedex ? { pokedex } : {}) };
    });
    return { profile: await withCosmetic(db, prof), cost, evolved, gold: paid.gold };
  }
  if (body.op === 'nickname') {
    if (!p.stats?.nicknames) bad('Apelidos são liberados na Loja de Diamantes (Conveniência).');
    const nick = cleanNick(body.nick);
    const prof = await mutateProfile(db, user.id, cur => {
      if (!(cur.vault || []).some(m => m.uid === body.uid)) bad('Pokémon não encontrado na Coleção.');
      return { vault: cur.vault.map(m => (m.uid === body.uid ? { ...m, nick: nick || null } : m)) };
    });
    return { profile: await withCosmetic(db, prof) };
  }
  if (body.op === 'use_tm') { // 💿 TM da Mochila da conta num Pokémon da Coleção
    const mv = String(body.move || '');
    return { profile: await withCosmetic(db, await mutateProfile(db, user.id, cur => {
      const st = { ...(cur.stats || {}) };
      const bag = { ...(st.bag || {}) };
      if (!(bag.tm > 0)) bad('Você não tem TM na Mochila.');
      const m = (cur.vault || []).find(x => x.uid === body.uid);
      if (!m) bad('Pokémon não encontrado na Coleção.');
      if (!tmMovesFor(m.sp).some(x => x.id === mv)) bad('Esse Pokémon não aprende esse golpe.');
      if (moveIdsOf(m).includes(mv)) bad('Ele já sabe esse golpe.');
      bag.tm -= 1; if (!bag.tm) delete bag.tm;
      st.bag = bag;
      return { stats: st, vault: cur.vault.map(x => (x.uid === body.uid ? { ...x, moves: learnMoveIds(m, mv, Number(body.slot) === 1 ? 1 : 2) } : x)) };
    })) };
  }
  if (body.op === 'title_equip') { // 🏅 equipar/tirar um título de conquista
    const id = body.id ? String(body.id) : null;
    if (id && !TITLE_BY_ID[id]) bad('Título inválido.');
    const p0 = await getOrCreateProfile(db, user);
    if (id && !unlockedTitles(p0).includes(id)) bad('Você ainda não conquistou esse título.');
    const p = await mutateProfile(db, user.id, prof => {
      const c = myCosmetics(prof);
      const cur = c.equipped.title;
      if (!id && !String(cur || '').startsWith('ach:')) return null;
      return { cosmetics: { owned: c.owned, equipped: { ...c.equipped, title: id ? `ach:${id}` : null } } };
    });
    await refreshCosmeticInMatches(db, user.id, p);
    return { profile: await withCosmetic(db, p) };
  }
  if (body.op === 'hold_stone') { // 💎 segurar/tirar a Megapedra de um Pokémon da Coleção (a pedra sai/volta da Mochila)
    const item = body.item ? String(body.item) : null;
    return { profile: await withCosmetic(db, await mutateProfile(db, user.id, cur => {
      const st = { ...(cur.stats || {}) };
      const bag = { ...(st.bag || {}) };
      const m = (cur.vault || []).find(x => x.uid === body.uid);
      if (!m) bad('Pokémon não encontrado na Coleção.');
      if (item) {
        if (ITEMS[item]?.kind !== 'gear') { // ⚔️ item de batalha: qualquer Pokémon pode segurar
          const mg = megaByStone(ITEMS[item]?.kind === 'megastone' ? MEGAS[ITEMS[item].mega]?.stone : null);
          if (!mg) bad('Esse item não pode ser segurado.');
          if (mg.base !== m.sp) bad(`A ${ITEMS[item].name} só funciona com ${getSpecies(mg.base)?.name || mg.base}.`);
        }
        if (m.held === item) bad('Ele já está segurando esse item.');
        if (!(bag[item] > 0)) bad(`Você não tem ${ITEMS[item].name} na Mochila.`);
        bag[item] -= 1; if (!bag[item]) delete bag[item];
      } else if (!m.held) bad('Ele não está segurando nada.');
      if (m.held) bag[m.held] = Math.min(BAG_MAX_PER_ITEM, (bag[m.held] || 0) + 1); // a pedra antiga volta para a Mochila
      st.bag = bag;
      return { stats: st, vault: cur.vault.map(x => (x.uid === body.uid ? { ...x, held: item || undefined } : x)) };
    })) };
  }
  if (body.op === 'charm_activate') { // 🏵️ ativar o Amuleto Lendário pela Mochila: +7 dias (soma se já estiver ativo)
    const prof = await mutateProfile(db, user.id, prof => {
      const bag = { ...(prof.stats?.bag || {}) };
      if (!(bag.legend_charm > 0)) bad('Você não tem 🏵️ Amuleto Lendário (Oficina da Fazenda ou Loja PB da Torre).');
      bag.legend_charm -= 1; if (bag.legend_charm <= 0) delete bag.legend_charm;
      const now = Date.now();
      const until = Math.max(now, prof.stats?.legendCharmUntil || 0) + 7 * 86400000;
      return { stats: { ...(prof.stats || {}), bag, legendCharmUntil: until } };
    });
    return { profile: await withCosmetic(db, prof) };
  }
  if (body.op === 'max_soup') { // 🍲 Sopa Max: dá o ✨ Fator Gigantamax a um Pokémon da Coleção (v55)
    const prof = await mutateProfile(db, user.id, prof => {
      const bag = { ...(prof.stats?.bag || {}) };
      if (!(bag.max_soup > 0)) bad('Você não tem 🍲 Sopa Max (cozinhe no 🍳 Fogão da casa com Cogumelos Max).');
      const vault = [...(prof.vault || [])];
      const i = vault.findIndex(m => m.uid === body.uid);
      if (i < 0) bad('Pokémon não encontrado.');
      if (!GMAX[vault[i].sp]) bad(`${getSpecies(vault[i].sp)?.name || 'Esse Pokémon'} não tem forma Gigantamax.`);
      if (vault[i].gx) bad('Ele já tem o Fator Gigantamax.');
      vault[i] = { ...vault[i], gx: true };
      bag.max_soup -= 1; if (bag.max_soup <= 0) delete bag.max_soup;
      return { vault, stats: { ...(prof.stats || {}), bag } };
    });
    return { profile: await withCosmetic(db, prof) };
  }
  if (body.op === 'gene_candy') { // 🧬 v64: Doce Genético — sorteia os IVs de novo (cada um: melhor de 2)
    let res = null;
    const prof = await mutateProfile(db, user.id, prof => {
      const bag = { ...(prof.stats?.bag || {}) };
      if (!(bag.gene_candy > 0)) bad('Você não tem 🧬 Doce Genético na Mochila (Cozinha da Fazenda Nv.2 ou eventos raros).');
      const vault = [...(prof.vault || [])];
      const i = vault.findIndex(m => m.uid === body.uid);
      if (i < 0) bad('Pokémon não encontrado.');
      const m = vault[i];
      const roll = () => { let best = 0; for (let k = 0; k < GENE_ROLLS; k++) best = Math.max(best, Math.floor(Math.random() * 32)); return best; };
      const before = { hp: m.iv?.hp ?? 0, atk: m.iv?.atk ?? 0, def: defIvOf(m), spe: m.iv?.spe ?? 0 };
      const iv = { hp: roll(), atk: roll(), def: roll(), spe: roll() };
      vault[i] = { ...m, iv };
      bag.gene_candy -= 1; if (bag.gene_candy <= 0) delete bag.gene_candy;
      res = { before, after: iv };
      return { vault, stats: { ...(prof.stats || {}), bag } };
    });
    return { profile: await withCosmetic(db, prof), gene: res };
  }
  if (body.op === 'evo_level' || body.op === 'rare_candy') { // ⬆️ v64b: evoluir por nível na Coleção / 🍬 Doce Raro da Mochila (+1 nível)
    let res = null;
    const prof = await mutateProfile(db, user.id, prof => {
      res = null;
      const vault = [...(prof.vault || [])];
      const i = vault.findIndex(m => m.uid === body.uid);
      if (i < 0) bad('Pokémon não encontrado.');
      const m = vault[i];
      const st = { ...(prof.stats || {}) };
      let nm = { ...m };
      if (body.op === 'rare_candy') {
        const bag = { ...(st.bag || {}) };
        if (!(bag.rare_candy > 0)) bad('Você não tem 🍬 Doce Raro na Mochila (sobras das partidas ou Loja PB da Torre).');
        if ((m.lvl || 1) >= MAX_LEVEL) bad(`Já está no nível máximo (${MAX_LEVEL}).`);
        // 🍬 v66: vários de uma vez (até o nível máximo)
        const n = Math.max(1, Math.min(bag.rare_candy, MAX_LEVEL - (m.lvl || 1), Math.floor(Number(body.qty)) || 1));
        nm.lvl = (m.lvl || 1) + n;
        bag.rare_candy -= n; if (bag.rare_candy <= 0) delete bag.rare_candy;
        st.bag = bag;
        res = { lvl: nm.lvl, used: n };
      } else {
        const to = levelEvoTarget(m);
        if (!to) bad(`${getSpecies(m.sp)?.name || 'Esse Pokémon'} ainda não tem nível para evoluir (ou só evolui com item).`);
        const v = variantAfter(m, to);
        nm = { ...m, sp: to }; if (v) nm.v = v; else delete nm.v;
        res = { from: getSpecies(m.sp).name, to: getSpecies(to).name };
        if (m.shiny) { const sd = st.shinyDex || []; if (!sd.includes(to)) st.shinyDex = [...sd, to]; }
      }
      vault[i] = nm;
      const out = { vault, stats: st };
      if (nm.sp !== m.sp && !(prof.pokedex || []).includes(nm.sp)) out.pokedex = [...(prof.pokedex || []), nm.sp];
      return out;
    });
    return { profile: await withCosmetic(db, prof), evolved: res?.to ? res : null, leveled: res?.lvl || null, used: res?.used || 0 };
  }
  if (body.op === 'evo_item') { // ✨ usar pedra / item de evolução da Mochila num Pokémon da Coleção (v54)
    const item = String(body.item || '');
    if (ITEMS[item]?.kind !== 'stone') bad('Item inválido.');
    let res = null;
    const prof = await mutateProfile(db, user.id, prof => {
      res = null;
      const bag = { ...(prof.stats?.bag || {}) };
      if (!(bag[item] > 0)) bad(`Você não tem ${ITEMS[item].name} na Mochila.`);
      const vault = [...(prof.vault || [])];
      const i = vault.findIndex(m => m.uid === body.uid);
      if (i < 0) bad('Pokémon não encontrado.');
      const m = vault[i];
      const to = itemEvoTarget(m, item);
      if (!to) bad(`${ITEMS[item].name} não faz ${getSpecies(m.sp)?.name || 'esse Pokémon'} evoluir.`);
      const v = variantAfter(m, to);
      const nm = { ...m, sp: to };
      if (v) nm.v = v; else delete nm.v;
      vault[i] = nm;
      bag[item] -= 1; if (bag[item] <= 0) delete bag[item];
      res = { from: getSpecies(m.sp).name, to: getSpecies(to).name };
      const st = { ...(prof.stats || {}), bag };
      if (m.shiny) { const sd = st.shinyDex || []; if (!sd.includes(to)) st.shinyDex = [...sd, to]; }
      const out = { vault, stats: st };
      if (!(prof.pokedex || []).includes(to)) out.pokedex = [...(prof.pokedex || []), to];
      return out;
    });
    return { profile: await withCosmetic(db, prof), evolved: res };
  }
  if (body.op === 'restore') { // recuperar um Pokémon que saiu por falta de espaço (ou que foi solto — devolve o ouro recebido)
    const pre = (p.stats?.overflow || []).find(x => x.uid === body.uid);
    if (!pre) bad('Esse Pokémon não está mais na lista.');
    const owe = Math.max(0, Number(pre.paid) || 0);
    if (owe) {
      if ((p.gold || 0) < owe) bad(`Para recuperar, devolva o ouro que o Professor pagou: 🪙 ${owe}.`);
      if (!(await db.walletAdd(user.id, 0, -owe))) bad(`Para recuperar, devolva o ouro que o Professor pagou: 🪙 ${owe}.`);
    }
    try {
      return { profile: await withCosmetic(db, await mutateProfile(db, user.id, prof => {
        const st = { ...(prof.stats || {}) };
        const list = st.overflow || [];
        const m = list.find(x => x.uid === body.uid);
        if (!m || (Number(m.paid) || 0) !== owe) bad('Esse Pokémon não está mais na lista.');
        if ((prof.vault || []).length >= collectionMax(prof)) bad(`Sua Coleção está cheia (${collectionMax(prof)}). Solte alguns Pokémon antes de recuperar.`);
        const { outAt, why, paid, ...mon } = m;
        st.overflow = list.filter(x => x.uid !== body.uid);
        return { vault: [...(prof.vault || []), mon], stats: st };
      })), paidBack: owe };
    } catch (e) { if (owe) await db.walletAdd(user.id, 0, owe); throw e; }
  }
  if (body.op === 'release' || body.op === 'release_many') {
    // Soltar Pokémon da Coleção (um ou vários — v59). Vão para "Saíram da Coleção" (dá para recuperar devolvendo o ouro).
    // 🪙 o Professor paga ouro pela raridade (v52). v59: quem está no time da Liga, na Fazenda/Creche ou é ⭐ favorito não sai;
    // o item segurado volta para a Mochila.
    const want = body.op === 'release' ? [String(body.uid || '')] : [...new Set((Array.isArray(body.uids) ? body.uids : []).map(String))].slice(0, 120);
    let gold = 0, done = 0, skipped = [];
    const prof1 = await mutateProfile(db, user.id, prof => {
      gold = 0; done = 0; skipped = [];
      const st = { ...(prof.stats || {}) };
      const locked = releaseLocks(st);
      const out = new Set();
      let bag = st.bag || {};
      const gone = [];
      for (const uid of want) {
        const m = (prof.vault || []).find(x => x.uid === uid);
        if (!m) continue;
        const why = locked.get(uid) || (body.op === 'release_many' && m.fav ? 'favorito' : null);
        if (why) { skipped.push({ uid, why }); continue; }
        const g = releaseGold(m);
        gold += g; done++; out.add(uid);
        if (m.held) { bag = addToBag(bag, { [m.held]: 1 }); }
        const { held, ...rest } = m;
        gone.push({ ...rest, outAt: new Date().toISOString(), why: 'solto', paid: g || undefined });
      }
      if (!done) return null;
      st.bag = bag;
      st.overflow = [...gone, ...(st.overflow || [])].slice(0, OVERFLOW_MAX);
      return { vault: (prof.vault || []).filter(x => !out.has(x.uid)), stats: st };
    });
    if (!done && skipped.length) bad(`Não dá para soltar: ${skipped[0].why === 'favorito' ? 'é ⭐ favorito' : `está ${skipped[0].why}`}. Tire de lá primeiro.`);
    if (gold) await db.walletAdd(user.id, 0, gold);
    return { profile: await withCosmetic(db, gold ? (await db.getProfile(user.id) || prof1) : prof1), gold, released: done, skipped: skipped.length };
  }
  if (body.op === 'discard_items') { // 🗑️ v59: jogar fora vários itens da Mochila de uma vez
    const want = body.items && typeof body.items === 'object' ? body.items : {};
    let n = 0;
    const prof = await mutateProfile(db, user.id, cur => {
      n = 0;
      const bag = { ...(cur.stats?.bag || {}) };
      for (const [id, q0] of Object.entries(want)) {
        const q = Math.min(bag[id] || 0, Math.max(0, Math.floor(Number(q0) || 0)));
        if (q > 0) { bag[id] -= q; n += q; if (bag[id] <= 0) delete bag[id]; }
      }
      return n ? { stats: { ...(cur.stats || {}), bag } } : null;
    });
    if (!n) bad('Escolha pelo menos 1 item.');
    return { profile: await withCosmetic(db, prof), discarded: n };
  }
  if (body.op === 'daily_claim') { // 🎁 prêmio diário com sequência
    const now = new Date();
    const stt = dailyStatus(p.stats?.login, now);
    if (!stt.canClaim) bad('Você já pegou o prêmio de hoje. Volte amanhã!');
    const items = { ...(stt.reward.items || {}) };
    if (stt.bonus) for (const [k, q] of Object.entries(stt.bonus)) items[k] = (items[k] || 0) + q;
    let ok = false;
    const prof = await mutateProfile(db, user.id, cur => {
      const s2 = dailyStatus(cur.stats?.login, now);
      if (!s2.canClaim) return null; // dois cliques ao mesmo tempo
      ok = true;
      const login = { last: loginDay(now), streak: s2.nextStreak, best: Math.max(cur.stats?.login?.best || 0, s2.nextStreak), total: (cur.stats?.login?.total || 0) + 1 };
      return { stats: { ...(cur.stats || {}), login, bag: Object.keys(items).length ? addToBag(cur.stats?.bag, items) : cur.stats?.bag } };
    });
    if (!ok) bad('Você já pegou o prêmio de hoje.');
    if (stt.reward.gold) await db.walletAdd(user.id, 0, stt.reward.gold);
    return { profile: await withCosmetic(db, await db.getProfile(user.id) || prof), claimed: { day: stt.cycleDay, streak: stt.nextStreak, gold: stt.reward.gold || 0, items } };
  }
  if (body.op === 'boxes_set') { // 📦 boxes da Coleção (organização: cada Pokémon fica em no máximo uma box)
    const vaultIds = new Set((p.vault || []).map(m => m.uid));
    const used = new Set();
    const boxes = (Array.isArray(body.boxes) ? body.boxes : []).slice(0, BOX_MAX).map((b, i) => ({
      id: String(b?.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 12) || `b${i + 1}`,
      name: String(b?.name || '').replace(/[<>"'`&\\]/g, '').trim().slice(0, 16) || `Box ${i + 1}`,
      icon: BOX_ICONS.includes(b?.icon) ? b.icon : BOX_ICONS[0],
      uids: (Array.isArray(b?.uids) ? b.uids : []).map(String).filter(u => vaultIds.has(u) && !used.has(u) && used.add(u))
    }));
    if (new Set(boxes.map(b => b.id)).size !== boxes.length) bad('Boxes repetidas.');
    return { profile: await withCosmetic(db, await mutateProfile(db, user.id, cur => ({ stats: { ...(cur.stats || {}), boxes } }))) };
  }
  if (body.op === 'favorite') {
    return { profile: await withCosmetic(db, await mutateProfile(db, user.id, prof => ({ vault: (prof.vault || []).map(m => (m.uid === body.uid ? { ...m, fav: !m.fav } : m)) }))) };
  }
  bad('Operação inválida.');
}

export const MAX_SAVED_TURNS = 60;

export async function leaderboard(db) {
  const rows = await db.listProfiles(500, { stats: ['ranked', 'rankedWins', 'wins', 'champion', 'shinies', 'league'], pokedex: true });
  let shopItems = [];
  try { shopItems = (await getShop(db)).items || []; } catch { /* sem loja */ }
  const map = r => ({
    id: r.id, name: r.trainer_name, avatar: r.avatar, skin: equippedSkin(r, shopItems), points: r.points || 0, rating: r.rating ?? START_RATING,
    ranked: r.stats?.ranked || 0, rankedWins: r.stats?.rankedWins || 0,
    pokedex: (r.pokedex || []).length, wins: r.stats?.wins || 0, champion: r.stats?.champion || 0,
    shinies: r.stats?.shinies || 0
  });
  const all = rows.map(map);
  const ranked = all.filter(r => r.ranked > 0).sort((a, b) => b.rating - a.rating);
  const elos = ELO_TIERS.map((t, i) => {
    const max = ELO_TIERS[i + 1]?.min ?? null;
    const people = ranked.filter(r => r.rating >= t.min && (max === null || r.rating < max));
    return { ...t, max, count: people.length, top: people.slice(0, 5).map(r => ({ id: r.id, name: r.name, avatar: r.avatar, skin: r.skin, rating: r.rating })) };
  });
  // 🏆 Liga: tabela da temporada atual (quem tem liga de outra temporada aparece já "virado")
  const season = seasonId();
  const league = rows.filter(r => r.stats?.league).map(r => {
    const L = ensureSeason(r.stats.league, season).league;
    return { id: r.id, name: r.trainer_name, avatar: r.avatar, skin: equippedSkin(r, shopItems), div: L.div, lp: L.lp, wins: L.wins, losses: L.losses, games: L.games, streak: L.streak, last: L.last || [], shield: L.shield || 0 };
  }).sort(leagueSort);
  const divisions = LEAGUE_DIVS.map(d => ({ ...d, players: league.filter(x => x.div === d.idx).slice(0, 30) })).filter(d => d.players.length);
  return {
    league: { season, seasonName: seasonName(season), table: league.slice(0, 100), divisions, total: league.length },
    ranking: [...all].sort((a, b) => b.points - a.points).slice(0, 50),
    competitive: ranked.slice(0, 50),
    elos, rankedPlayers: ranked.length
  };
}

// ------------------------------------------------------------------ Coleção
function collectionEntry(mon, matchId) {
  const sp = mon.tf ? mon.tf.sp : mon.sp; // 🧬 transformado: salva a forma original
  const moves = mon.tf ? mon.tf.moves : mon.moves;
  return { uid: mon.uid, sp, lvl: mon.lvl, forms: Array.isArray(mon.forms) && mon.forms.length ? mon.forms : undefined, shiny: !!mon.shiny, aura: mon.aura || null, nature: mon.nature || null, iv: mon.iv || null, moves: moves || null, capTier: mon.capTier || null, nick: mon.nick || null, trust: !!mon.trust || undefined, v: mon.v || null, gx: !!mon.gx || undefined, from: matchId, at: new Date().toISOString() };
}

/**
 * Copia equipe + PC dos jogadores humanos para a Coleção da conta (e a Pokédex).
 * Chamado durante a partida (capturas, fim de batalha, PC, saída) e no final.
 */
export async function syncCollection(db, state, pids) {
  for (const p of state.players) {
    if (p.id.startsWith('cpu_') || p.left || p.hardcoreLost || (pids && !pids.includes(p.id))) continue; // quem saiu não recebe o que a CPU fizer; no Hardcore, quem caiu perde tudo
    await mutateProfile(db, p.id, prof => collectionPatch(prof, p, state));
  }
}

/** Hardcore: tira da Coleção os Pokémon que entraram por ESTA partida (capturas dela). */
export async function purgeMatchCaptures(db, pid, matchId) {
  await mutateProfile(db, pid, prof => {
    const vault = prof.vault || [];
    const keep = vault.filter(m => m.from !== matchId);
    return keep.length === vault.length ? null : { vault: keep };
  });
}

/** 💎 junta a Pokédex Mega da partida (p.megaDex) na da conta (stats.megaDex). Devolve o objeto novo ou null se nada mudou. */
export function mergeMegaDex(cur, add) {
  if (!add) return null;
  const base = cur || {};
  const out = {};
  let changed = false;
  for (const k of ['seen', 'used', 'shinySeen', 'shinyUsed']) {
    const set = [...new Set([...(base[k] || []), ...(add[k] || [])])];
    if (set.length !== (base[k] || []).length) changed = true;
    out[k] = set;
  }
  return changed ? out : null;
}

function collectionPatch(prof, p, state) {
  {
    const away = new Set(p.tradedAway || []);
    const released = new Set(p.releasedUids || []);
    const vault = [...(prof.vault || [])].filter(m => !away.has(m.uid) && !(released.has(m.uid) && m.from === state.id)); // trocados (e soltos na partida) saem da Coleção
    const idx = new Map(vault.map((m, i) => [m.uid, i]));
    // Conquista: quem está defendendo cidades também é seu
    const garrison = state.conquest ? Object.entries(state.conquest.garrison || {}).filter(([g]) => state.conquest.owners?.[g] === p.id).flatMap(([, l]) => l) : [];
    for (const mon of [...p.team, ...p.box, ...garrison]) {
      const e = collectionEntry(mon, state.id);
      if (idx.has(mon.uid)) {
        const old = vault[idx.get(mon.uid)];
        vault[idx.get(mon.uid)] = { ...old, sp: e.sp, lvl: Math.max(old.lvl || 1, e.lvl), shiny: e.shiny, aura: e.aura || old.aura || null, nature: old.nature || e.nature || null, iv: old.iv || e.iv || null, moves: e.moves || old.moves || null, ...(e.forms ? { forms: e.forms } : {}), capTier: old.capTier || e.capTier || null, nick: old.nick || null, ...(old.trust || e.trust ? { trust: true } : {}), v: e.v, ...(old.gx || e.gx ? { gx: true } : {}) };
      } else {
        idx.set(mon.uid, vault.length);
        vault.push(e);
      }
    }
    // Limite: só "comuns" saem (nunca shiny, favorito, lendário, tier 4+, Confiança ou com apelido),
    // e quem sai vai para a lista "Saíram por falta de espaço" (dá para recuperar depois).
    const cap = collectionMax(prof);
    let overflow = null;
    if (vault.length > cap) {
      // v59: nunca tira quem está no time da Liga, na Fazenda/Creche ou segurando item; tira primeiro as capturas novas desta partida
      const keep = new Set([...p.team.filter(m => !isNewHere(m, prof)), ...garrison].map(m => m.uid));
      const st0 = prof.stats || {};
      for (const u of [...(st0.serie?.defense || []), ...(st0.farm?.slots || []).map(s => s.uid), st0.farm?.daycare?.a, st0.farm?.daycare?.b]) if (u) keep.add(u);
      const isNew = m => m.from === state.id && !(prof.vault || []).some(v => v.uid === m.uid);
      const removable = vault.filter(m => isExpendable(m) && !m.held && !keep.has(m.uid)).sort((a, b) => (isNew(b) - isNew(a)) || a.lvl - b.lvl);
      const dropped = removable.slice(0, vault.length - cap);
      const drop = new Set(dropped.map(m => m.uid));
      for (let i = vault.length - 1; i >= 0; i--) if (drop.has(vault[i].uid)) vault.splice(i, 1);
      if (dropped.length) overflow = [...dropped.map(m => ({ ...m, outAt: new Date().toISOString() })), ...((prof.stats || {}).overflow || [])].slice(0, OVERFLOW_MAX);
    }
    const pokedex = [...new Set([...(prof.pokedex || []), ...p.caught])];
    const seen = [...new Set([...(prof.pokedex_seen || []), ...(p.seen || []), ...p.caught])];
    // Pokédex shiny (vistos e capturados) fica em stats — sem mudar o schema
    const st = prof.stats || {};
    const shinyDex = [...new Set([...(st.shinyDex || []), ...(p.shinyCaught || [])])];
    const shinySeen = [...new Set([...(st.shinySeen || []), ...(p.shinySeen || []), ...shinyDex])];
    const megaDex = mergeMegaDex(st.megaDex, p.megaDex);
    const changed = overflow || megaDex || shinyDex.length !== (st.shinyDex || []).length || shinySeen.length !== (st.shinySeen || []).length;
    return { vault, pokedex, pokedex_seen: seen, points: calcPoints(pokedex, st), ...(changed ? { stats: { ...st, shinyDex, shinySeen, ...(megaDex ? { megaDex } : {}), ...(overflow ? { overflow } : {}) } } : {}) };
  }
}

/** Itens da partida que ficam na Mochila da conta (tira as 5 Poké Balls de graça do começo). */
export function bagFromMatch(p) {
  const out = {};
  for (const [id, q] of Object.entries(p.items || {})) {
    if (!isKeepable(id) || !(q > 0)) continue;
    const n = q - ((p.kit || STARTING_ITEMS)[id] || 0) - (p.shopBought?.[id] || 0); // v65b: na Raid em Grupo o kit (p.kit) é o que não volta · v66: nem o Doce comprado na loja
    if (n > 0) out[id] = n;
  }
  return out;
}
export function addToBag(bag, add) {
  const out = { ...(bag || {}) };
  for (const [id, q] of Object.entries(add || {})) if (isKeepable(id)) out[id] = Math.min(BAG_MAX_PER_ITEM, (out[id] || 0) + q);
  if (out.shiny_charm > 1) out.shiny_charm = 1;
  if (out.legend_charm > 3) out.legend_charm = 3; // 🏵️ no máximo 3 cargas guardadas
  return out;
}

/** Pokémon "comum" que pode sair sozinho quando a Coleção lota. */
export const OVERFLOW_MAX = 120;
const isNewHere = (m, prof) => !(prof.vault || []).some(v => v.uid === m.uid);
export function isExpendable(m) {
  const sp = SPECIES[m.sp];
  return !m.shiny && !m.fav && !m.trust && !m.nick && !(sp?.legendary) && (sp?.tier || 1) <= 3;
}

function calcPoints(pokedex, st) {
  return pokedex.length * 10 + (st.wins || 0) * 300 + (st.champion || 0) * 500 + (st.shinies || 0) * 50 + (st.pvpWins || 0) * 25;
}

/** Quais jogadores precisam ter a Coleção sincronizada depois desta jogada? */
function playersToSync(action, prev, next) {
  if (next.status === 'finished') return null; // todos (o fim chama recordResults)
  const ids = new Set();
  for (const f of next.fx || []) {
    if ((f.k === 'capture' && f.ok) || f.k === 'placed') ids.add(f.pid);
    if (f.k === 'battle_end') (f.pids || []).forEach(id => ids.add(id));
    if (f.k === 'trade_done' && f.ok) { ids.add(f.from); ids.add(f.to); }
  }
  if (['pc', 'use_item', 'leave', 'reorder', 'release'].includes(action?.type)) ids.add('__actor__');
  return ids;
}

// ------------------------------------------------------------------ salas
async function currentDaily(db) {
  const cfg = await db.getConfig('daily_pokemon');
  return dailyPokemon(cfg);
}

export async function configInfo(db) {
  let announcement = null, maps = [];
  try { announcement = await getAnnouncement(db); } catch { /* sem aviso */ }
  try { maps = (await customMaps(db)).filter(m => m.published); } catch { /* sem mapas */ }
  return { dailyPokemon: await currentDaily(db), announcement, maps };
}

// ------------------------------------------------------------------ 🛠️ mapas do painel admin (game_config 'custom_maps')
export async function customMaps(db) {
  const cfg = await db.getConfig('custom_maps');
  return Array.isArray(cfg?.maps) ? cfg.maps : [];
}
/** Dados do mapa para a partida (só publicado; sem ele a sala cai para Kanto). */
/** ✏️ v64: se o admin publicou uma versão editada de Kanto/temático, a sala usa a versão editada. */
async function resolveMapId(db, mapId) {
  const id = String(mapId || 'kanto');
  if (id.startsWith('custom:') || id === 'gen' || id.startsWith('gen:')) return mapId;
  try { const o = (await customMaps(db)).find(x => x.published && x.replaces === id); return o ? o.id : mapId; } catch { return mapId; }
}
async function mapDataFor(db, mapId) {
  if (!String(mapId || '').startsWith('custom:')) return null;
  const m = (await customMaps(db)).find(x => x.id === mapId && x.published);
  if (!m) return null;
  const { published, updatedAt, by, ...data } = m;
  return data;
}

// Salas "no limbo": lobby sem ninguém olhando some da lista em 15 min e é encerrado em 2 h;
// partida em andamento sem jogadas há 30 min some da lista (e é encerrada em 6 h se só sobrou CPU ou ninguém joga).
export const LOBBY_HIDE_MIN = 15, LOBBY_CLOSE_MIN = 120, PLAYING_HIDE_MIN = 30, PLAYING_CLOSE_MIN = 360;
const ageMin = r => (Date.now() - new Date(r.updated_at || r.updatedAt || 0).getTime()) / 60000;

async function closeStale(db, rows) {
  for (const r of rows) {
    const old = r.status === 'lobby' ? ageMin(r) > LOBBY_CLOSE_MIN : r.status === 'playing' && ageMin(r) > PLAYING_CLOSE_MIN && !['duel', 'cup'].includes(r.options?.mode);
    if (!old) continue;
    try {
      const full = await db.getMatch(r.id);
      if (full && full.status === r.status && await db.updateMatch(full.id, full.version, { status: 'abandoned', version: full.version + 1 }) && r.status === 'playing') await refundAbandoned(db, full.state);
    } catch { /* tenta de novo na próxima */ }
  }
}

export async function listRooms(db, user) {
  const all = await db.listOpenMatches();
  const mineAll = user ? await db.myMatches(user.id) : [];
  try { await closeStale(db, [...all, ...mineAll]); } catch { /* limpeza é opcional */ }
  const alive = r => (r.status === 'lobby' ? ageMin(r) <= LOBBY_HIDE_MIN : ageMin(r) <= PLAYING_HIDE_MIN);
  const rows = all.filter(alive);
  const mine = mineAll.filter(r => (r.status === 'lobby' ? ageMin(r) <= LOBBY_CLOSE_MIN : ageMin(r) <= PLAYING_CLOSE_MIN || ['duel', 'cup'].includes(r.options?.mode)));
  const brief = r => ({
    id: r.id, code: r.code, name: r.name, status: r.status, hasPin: !!r.has_pin,
    mode: r.options?.mode || 'balanced', levelCap: r.options?.levelCap || 0, turnLimit: r.options?.turnLimit || 0, rules: r.options?.rules || 'classic', map: r.options?.map || 'kanto', hardcore: !!r.options?.hardcore, megas: !!r.options?.megas,
    players: (r.lobby || []).filter(e => !e.left).length, maxPlayers: r.options?.maxPlayers || 4,
    host: (r.lobby || []).find(e => e.id === r.host_id)?.name || '?', updatedAt: r.updated_at
  });
  return { rooms: rows.filter(r => !['solo', 'duel_queue'].includes(r.options?.mode)).map(brief), mine: mine.filter(r => r.options?.mode !== 'duel_queue').map(brief) };
}

/** Quem cria uma sala nova sai das salas de espera antigas dele (evita salas duplicadas no limbo). */
async function leaveOldLobbies(db, user) {
  for (const b of await db.myMatches(user.id)) {
    if (b.status !== 'lobby' || ['duel_queue'].includes(b.options?.mode)) continue;
    try { const row = await db.getMatch(b.id); if (row?.status === 'lobby') await leaveRoom(db, user, row); } catch { /* ok */ }
  }
}

function lobbyEntry(profile, body, skin = null) {
  const starter = SPECIES[body.starter] && STARTERS.includes(body.starter) ? body.starter : 'bulbasaur';
  return { id: profile.id, name: cleanName(profile.trainer_name), avatar: profile.avatar || 1, skin, starter, teamUids: [], isBot: false, ready: false };
}

function botEntry(n) {
  return {
    id: 'cpu_' + Math.random().toString(36).slice(2, 8), name: `${BOT_NAMES[n % BOT_NAMES.length]} (CPU)`, avatar: ((n + 3) % 8) + 1,
    starter: STARTERS[Math.floor(Math.random() * STARTERS.length)], teamUids: [], isBot: true, ready: true
  };
}

function normalizeOptions(body, prev = {}) {
  const o = { ...prev };
  if (body.mode !== undefined) o.mode = MODES.includes(body.mode) ? body.mode : 'balanced';
  o.mode = o.mode || 'balanced';
  const cap = o.mode === 'cup' ? CUP_MAX_PLAYERS : o.mode === 'duel' ? 2 : MAX_PLAYERS;
  if (body.maxPlayers !== undefined) o.maxPlayers = Math.max(2, Math.min(cap, Number(body.maxPlayers) || 4));
  o.maxPlayers = Math.min(cap, o.maxPlayers || (o.mode === 'cup' ? 8 : 4));
  if (o.mode === 'duel') o.maxPlayers = 2;
  if (body.turnLimit !== undefined) o.turnLimit = Number(body.turnLimit) || 0;
  // partidas que salvam na conta sempre terminam: 20 a 60 turnos ("até o Campeão" saiu — virava farm de lendário)
  o.turnLimit = Math.max(20, Math.min(MAX_SAVED_TURNS, o.turnLimit || (o.mode === 'ranked' ? 40 : MAX_SAVED_TURNS)));
  if (body.levelCap !== undefined) o.levelCap = Math.max(0, Math.min(60, Number(body.levelCap) || 0));
  if (body.map !== undefined) o.map = isMapId(String(body.map)) && !String(body.map).startsWith('gen:') ? String(body.map) : 'kanto'; // Kanto, Expedição, temas ou mapa do painel
  o.map = o.map || 'kanto';
  // tipo de partida: Clássico, Battle Royale ou Conquista (funciona no Balanceado e no Coleção)
  if (body.rules !== undefined) o.rules = ['royale', 'conquest', 'bossraid'].includes(body.rules) ? body.rules : 'classic';
  // 🤝 v65: Duplas/Trios (não vale na Raid em Grupo, que já é cooperativa)
  if (body.teams !== undefined) o.teams = [2, 3].includes(Number(body.teams)) ? Number(body.teams) : 0;
  if (!['balanced', 'collection', 'solo'].includes(o.mode) || o.rules === 'bossraid') o.teams = 0;
  o.teams = o.teams || 0;
  if (!['balanced', 'collection', 'solo'].includes(o.mode)) o.rules = 'classic';
  o.rules = o.rules || 'classic';
  o.levelCap = o.levelCap || 0;
  // ☠️ Hardcore: vale em todos os modos de tabuleiro (não no duelo/copa)
  if (body.hardcore !== undefined) o.hardcore = !!body.hardcore;
  if (['duel', 'cup', 'duel_queue'].includes(o.mode)) o.hardcore = false;
  o.hardcore = !!o.hardcore;
  // 💎 Megas: só no modo personalizado (Coleção, onde os Pokémon seguram Megapedras)
  if (body.megas !== undefined) o.megas = !!body.megas;
  o.megas = !!o.megas && ['collection', 'cup', 'duel'].includes(o.mode); // 💎🔴 v67: também na Copa e no Duelo
  // entrar no meio da partida (online): ligado por padrão, menos no Battle Royale e no competitivo
  if (body.lateJoin !== undefined) o.allowLate = !!body.lateJoin;
  o.allowLate = o.allowLate !== false;
  o.lateJoin = o.allowLate && o.rules !== 'royale' && !['ranked', 'duel', 'cup'].includes(o.mode);
  if (o.mode === 'ranked' && !o.turnLimit) o.turnLimit = 40; // competitivo sempre termina
  if ((o.mode === 'duel' || o.mode === 'cup') && !o.levelCap) o.levelCap = DUEL_LEVEL_CAP;
  if (o.mode === 'solo') o.maxPlayers = Math.max(2, o.maxPlayers);
  return o;
}

export async function matchOp(db, user, body) {
  const op = body.op;
  if (op === 'create') return createRoom(db, user, body);
  if (op === 'solo') return createSolo(db, user, body);
  if (op === 'join') return joinRoom(db, user, body);
  if (op === 'serie_get' || op === 'serie_defense' || op === 'serie_challenge' || op === 'serie_team' || op === 'serie_seen' || op === 'serie_def_seen') return serieOp(db, user, body);
  if (/^tower_/.test(String(op || ''))) return towerOp(db, user, body); // 🗼 Torre de Batalha
  if (op === 'duel_queue') return duelQueue(db, user, body, await getOrCreateProfile(db, user));
  if (op === 'duel_status') return duelQueueStatus(db, user);
  if (op === 'duel_cancel') return duelQueueCancel(db, user);
  if (op === 'get') {
    // 💸 v55: o cliente diz qual versão já tem; se nada mudou, responde só "igual" (sem baixar o estado inteiro do Supabase)
    if (Number.isFinite(Number(body.since)) && db.getMatchVersion) {
      const v = await db.getMatchVersion(body.matchId);
      if (!v) notFound('Sala não encontrada.');
      if (v.version === Number(body.since) && v.status !== 'lobby') {
        const members = await db.listMembers(v.id);
        if (!members.includes(user.id)) forbidden();
        return { same: true, version: v.version };
      }
    }
    const row = await db.getMatch(body.matchId);
    if (!row) notFound('Sala não encontrada.');
    const members = await db.listMembers(row.id);
    if (!members.includes(user.id) && !(row.status === 'lobby' && row.is_public)) forbidden();
    // 💓 quem está com a sala aberta mantém ela "viva" (a tela da sala consulta a cada 5 s)
    if (row.status === 'lobby' && members.includes(user.id) && ageMin(row) > 3) { try { await db.updateMatch(row.id, row.version, {}); } catch { /* ok */ } }
    return { match: publicMatch(row, user.id) };
  }

  const row = await db.getMatch(body.matchId);
  if (!row) notFound('Sala não encontrada.');
  const members = await db.listMembers(row.id);
  if (!members.includes(user.id)) forbidden('Você não está nesta sala.');
  const isHost = row.host_id === user.id;

  if (op === 'leave') return leaveRoom(db, user, row);
  if (op === 'kick') return kickPlayer(db, user, row, body);
  if (op === 'chat') {
    const text = String(body.text || '').replace(/[<>]/g, '').trim().slice(0, 200);
    if (!text) bad('Mensagem vazia.');
    const prof = await getOrCreateProfile(db, user);
    const chat = [...(row.chat || []), { from: user.id, name: cleanName(prof.trainer_name), text, at: Date.now() }].slice(-60);
    return save(db, row, { chat }, user.id);
  }
  if (row.status !== 'lobby') bad('A partida já começou.');

  const lobby = [...(row.lobby || [])];
  const me = lobby.find(e => e.id === user.id);
  const mode = row.options?.mode || 'balanced';

  switch (op) {
    case 'update': {
      if (!me) bad('Você não está no lobby.');
      if (body.starter !== undefined) {
        if (!STARTERS.includes(body.starter)) bad('Inicial inválido.');
        me.starter = body.starter;
      }
      if (body.teamUids !== undefined) {
        if (!TEAM_MODES.includes(mode)) bad('Esta sala é balanceada: todos começam com um inicial.');
        const prof = await getOrCreateProfile(db, user);
        const owned = new Set((prof.vault || []).map(v => v.uid));
        const uids = [...new Set((Array.isArray(body.teamUids) ? body.teamUids : []).map(String))].slice(0, 6);
        if (uids.some(u => !owned.has(u))) bad('Algum Pokémon não está na sua Coleção.');
        me.teamUids = uids;
      }
      if (body.bringGold !== undefined) {
        if (mode !== 'collection') bad('Só dá para levar ouro em partidas do modo Coleção.');
        const v = Number(body.bringGold) || 0;
        if (!BRING_GOLD_OPTIONS.includes(v)) bad('Valor inválido.');
        const prof = await getOrCreateProfile(db, user);
        if ((prof.gold || 0) < v) bad(`Você tem só ${prof.gold || 0} de ouro na conta.`);
        me.bringGold = v;
      }
      if (body.bringItems !== undefined) {
        if (mode !== 'collection') bad('Só dá para levar itens da Mochila em partidas do modo Coleção.');
        const prof = await getOrCreateProfile(db, user);
        me.bringItems = cleanBring(body.bringItems, prof.stats?.bag || {});
      }
      if (body.ready !== undefined) me.ready = !!body.ready;
      return save(db, row, { lobby }, user.id);
    }
    case 'squad': { // 🤝 v65: escolher o time (você mesmo; o anfitrião escolhe o das CPUs)
      if (!(row.options?.teams >= 2)) bad('Esta sala não é em times.');
      const target = lobby.find(e => e.id === (body.target || user.id));
      if (!target) bad('Jogador inválido.');
      if (target.id !== user.id && !(isHost && target.isBot)) forbidden('Só o anfitrião escolhe o time das CPUs.');
      const sq = Number(body.squad);
      target.squad = [0, 1, 2].includes(sq) ? sq : null;
      return save(db, row, { lobby }, user.id);
    }
    case 'add_bot': {
      if (!isHost) forbidden('Só o anfitrião adiciona CPUs.');
      if (mode === 'ranked' || mode === 'duel') bad('Partidas competitivas são só entre humanos.');
      if (lobby.length >= (row.options?.maxPlayers || 4)) bad('Sala cheia.');
      lobby.push(botEntry(lobby.filter(e => e.isBot).length));
      return save(db, row, { lobby }, user.id);
    }
    case 'remove': {
      if (!isHost) forbidden('Só o anfitrião remove jogadores.');
      const target = lobby.find(e => e.id === body.target);
      if (!target || target.id === user.id) bad('Jogador inválido.');
      const next = lobby.filter(e => e.id !== body.target);
      if (!target.isBot) await db.removeMember(row.id, target.id);
      return save(db, row, { lobby: next }, user.id);
    }
    case 'options': {
      if (!isHost) forbidden();
      const options = normalizeOptions(body, row.options || {});
      let nextLobby = lobby;
      if (options.mode === 'ranked' || options.mode === 'duel') nextLobby = lobby.filter(e => !e.isBot);
      if (!TEAM_MODES.includes(options.mode)) nextLobby = nextLobby.map(e => ({ ...e, teamUids: [] }));
      nextLobby = nextLobby.map(e => (e.isBot ? e : { ...e, ready: false }));
      return save(db, row, { options, lobby: nextLobby }, user.id);
    }
    case 'start':
      if (!isHost) forbidden('Só o anfitrião inicia a partida.');
      return startRoom(db, row, lobby, user.id);
    default:
      bad('Operação inválida.');
  }
}

async function playerCfg(db, e, options) {
  const mode = options.mode;
  const p = { id: e.id, name: e.name, avatar: e.avatar, isBot: e.isBot, starter: e.starter };
  if (Number.isInteger(e.squad)) p.squad = e.squad; // 🤝 time escolhido na sala
  const prof = e.isBot ? null : await db.getProfile(e.id);
  if (prof) { try { p.cosmetic = await equippedCosmetic(db, prof); } catch { /* sem cosmético */ } }
  if (prof?.stats?.megaBracelet) p.megaKey = true; // 🔗 Bracelete Mega (ícone no peão; Mega só se a sala permitir)
  if (prof?.stats?.dynamaxBand) p.dynaKey = true;
  if ((prof?.stats?.legendCharmUntil || 0) > Date.now()) { p.legendCharmUntil = prof.stats.legendCharmUntil; p.legendCharmOn = true; } // 🏵️ Amuleto ativo (1 semana) // 🔴 Pulseira Dynamax (Gigantamax, mesmas regras da Mega)
  if (prof) { // companheiros da conta + nível de laço de cada um
    p.companions = prof.stats?.companions || []; p.companion = prof.stats?.companion || null;
    p.companionBond = Object.fromEntries(Object.entries(prof.stats?.companionBond || {}).map(([id, pts]) => [id, bondLevel(pts)]));
  }
  if (mode === 'collection' && !e.isBot && e.teamUids?.length) {
    const vault = prof?.vault || [];
    p.teamMons = e.teamUids.map(u => vault.find(v => v.uid === u)).filter(Boolean)
      .map(v => ({ ...v, lvl: options.levelCap ? Math.min(options.levelCap, v.lvl) : v.lvl }));
  }
  if (mode === 'collection' && !e.isBot && e.bringGold > 0) {
    // tira o ouro da conta agora; o que sobrar volta no fim da partida
    const paid = db.walletAdd ? await db.walletAdd(e.id, 0, -e.bringGold).catch(() => null) : null;
    if (paid) p.bringGold = e.bringGold;
  }
  if (mode === 'collection' && !e.isBot && e.bringItems && Object.keys(e.bringItems).length) {
    // 🎒 tira os itens da Mochila da conta agora; o que sobrar volta no fim da partida
    let taken = {};
    await mutateProfile(db, e.id, cur => {
      const st = { ...(cur.stats || {}) };
      const bag = { ...(st.bag || {}) };
      taken = cleanBring(e.bringItems, bag);
      for (const [id, q] of Object.entries(taken)) { bag[id] -= q; if (bag[id] <= 0) delete bag[id]; }
      st.bag = bag;
      return Object.keys(taken).length ? { stats: st } : null;
    });
    p.bringItems = taken;
  }
  if (mode === 'collection' && !e.isBot) {
    // PC da partida = Coleção inteira (o que não está no time), com o mesmo limite de nível
    const team = new Set(e.teamUids || []);
    p.boxMons = (prof?.vault || []).filter(v => !team.has(v.uid))
      .map(v => ({ ...v, lvl: options.levelCap ? Math.min(options.levelCap, v.lvl) : v.lvl }));
  }
  return p;
}

async function startRoom(db, row, lobby, userId) {
  const options = normalizeOptions({}, row.options || {});
  const mode = options.mode;
  if (lobby.length < 2) bad('Precisa de pelo menos 2 participantes (adicione uma CPU se quiser).');
  if (mode === 'cup' || mode === 'duel') {
    const notReady = lobby.filter(e => !e.isBot && e.id !== row.host_id && !e.ready);
    if (notReady.length) bad(`Aguardando: ${notReady.map(e => e.name).join(', ')} marcar "Pronto".`);
  }
  if (mode === 'cup') return startCup(db, row, lobby, userId);
  if (mode === 'duel') {
    if (lobby.length !== 2 || lobby.some(e => e.isBot)) bad('O duelo é entre 2 treinadores humanos.');
    const [a, b] = await Promise.all(lobby.map(async e => ({ ...e, teamMons: await duelTeam(db, e, options.levelCap) })));
    if (!a.teamMons || !b.teamMons) bad('Os dois precisam ter Pokémon na Coleção.');
    const keys = await Promise.all([a, b].map(e => db.getProfile(e.id).then(pr => ({ megaKey: !!pr?.stats?.megaBracelet, dynaKey: !!pr?.stats?.dynamaxBand })).catch(() => ({}))));
    const state = createMatch({ kind: 'duel', id: row.id, mode: 'online', seed: randomSeed(), now: Date.now(), options: { megas: !!options.megas },
      players: [a, b].map((e, i) => ({ id: e.id, name: e.name, avatar: e.avatar, teamMons: e.teamMons, ...keys[i] })) });
    return save(db, row, { status: 'playing', state, options: { ...options, ranked: true } }, userId);
  }
  if (mode === 'ranked' && lobby.filter(e => !e.isBot).length < 2) bad('O competitivo precisa de pelo menos 2 treinadores humanos.');
  const notReady = lobby.filter(e => !e.isBot && e.id !== row.host_id && !e.ready);
  if (notReady.length) bad(`Aguardando: ${notReady.map(e => e.name).join(', ')} marcar "Pronto".`);
  if (options.rules === 'bossraid') { // 🐉 v65
    if (mode !== 'collection') bad('🐉 A Raid em Grupo é no modo 📦 Coleção (cada um luta com um Pokémon do próprio time).');
    if (lobby.length > 4) bad('🐉 A Raid em Grupo é para até 4 treinadores.');
  }
  const players = [];
  for (const e of lobby) players.push(await playerCfg(db, e, options));
  // Coleção: CPUs ficam no nível médio das equipes humanas, para não serem atropeladas
  if (mode === 'collection') {
    const lv = players.filter(p => p.teamMons?.length).flatMap(p => p.teamMons.map(m => m.lvl));
    if (lv.length) {
      const avg = Math.round(lv.reduce((a, b) => a + b, 0) / lv.length);
      players.filter(p => p.isBot).forEach(p => { p.starterLevel = Math.max(5, Math.round(avg * 0.85)); });
    }
  }
  const mapId = await resolveMapId(db, options.map); // ✏️ v64: Kanto/temático editado no painel admin
  const state = createMatch({
    id: row.id, mode: 'online', seed: randomSeed(), now: Date.now(), players, map: mapId, mapData: await mapDataFor(db, mapId), rules: options.rules,
    options: { dailyPokemon: await currentDaily(db), turnLimit: options.turnLimit || 0, trades: mode !== 'ranked', hardcore: !!options.hardcore, megas: !!options.megas, teams: options.teams || 0 }
  });
  state.roomMode = mode;
  const res = await save(db, row, { status: state.status === 'finished' ? 'finished' : 'playing', state, options }, userId);
  if (state.status === 'finished') await recordResults(db, state, options);
  return res;
}

async function createRoom(db, user, body) {
  const profile = await getOrCreateProfile(db, user);
  await leaveOldLobbies(db, user);
  const name = cleanName(body.name, `Sala de ${profile.trainer_name}`).slice(0, 30);
  const options = normalizeOptions({ mode: body.mode, maxPlayers: body.maxPlayers, turnLimit: body.turnLimit ?? 60, levelCap: body.levelCap, map: body.map, rules: body.rules, hardcore: !!body.hardcore, megas: !!body.megas, teams: body.teams });
  if (options.mode === 'solo') options.mode = 'balanced';
  const pin = String(body.pin || '').replace(/\D/g, '').slice(0, 6);
  const row = await insertRoom(db, user, { name, options, isPublic: body.isPublic !== false, pin, lobby: [lobbyEntry(profile, body, await skinFor(db, profile))] });
  return { match: publicMatch(row, user.id) };
}

async function insertRoom(db, user, { name, options, isPublic, pin, lobby }) {
  let row = null;
  for (let i = 0; i < 5 && !row; i++) {
    try {
      row = await db.insertMatch({
        code: roomCode(), name, host_id: user.id, status: 'lobby', is_public: isPublic,
        has_pin: !!pin, options, lobby, state: null, version: 1
      });
    } catch (e) {
      if (!String(e.message).includes('duplicate')) throw e;
    }
  }
  if (!row) throw new Error('Não foi possível gerar o código da sala.');
  if (pin) await db.setSecret(row.id, pin);
  await db.addMember(row.id, user.id);
  return row;
}

/** Partida contra CPUs que roda no servidor e salva na conta (Coleção, Pokédex). */
async function createSolo(db, user, body) {
  const profile = await getOrCreateProfile(db, user);
  await leaveOldLobbies(db, user);
  const bots = Math.max(1, Math.min(5, Number(body.bots) || 1));
  const useCollection = Array.isArray(body.teamUids) && body.teamUids.length > 0;
  const options = normalizeOptions({ mode: useCollection ? 'collection' : 'balanced', maxPlayers: bots + 1, turnLimit: body.turnLimit ?? 60, levelCap: body.levelCap || 0, map: body.map, rules: body.rules, hardcore: !!body.hardcore, megas: !!body.megas, teams: body.teams });
  if (options.rules === 'bossraid' && !useCollection) bad('🐉 Na Raid em Grupo escolha seu time da Coleção (o Pokémon que vai lutar sai dele).');
  const entry = lobbyEntry(profile, body, await skinFor(db, profile));
  if (useCollection) {
    const owned = new Set((profile.vault || []).map(v => v.uid));
    entry.teamUids = [...new Set(body.teamUids.map(String))].filter(u => owned.has(u)).slice(0, 6);
  }
  if (useCollection && BRING_GOLD_OPTIONS.includes(Number(body.bringGold)) && Number(body.bringGold) > 0) {
    if ((profile.gold || 0) < Number(body.bringGold)) bad(`Você tem só ${profile.gold || 0} de ouro na conta.`);
    entry.bringGold = Number(body.bringGold);
  }
  if (useCollection && body.bringItems) entry.bringItems = cleanBring(body.bringItems, profile.stats?.bag || {});
  const lobby = [entry];
  for (let i = 0; i < bots; i++) lobby.push(botEntry(i));
  const row = await insertRoom(db, user, { name: `Treino de ${profile.trainer_name}`, options: { ...options, solo: true }, isPublic: false, pin: '', lobby });
  return startRoom(db, row, lobby, user.id);
}

async function joinRoom(db, user, body) {
  const row = body.code ? await db.getMatchByCode(String(body.code).toUpperCase().trim()) : await db.getMatch(body.matchId);
  if (!row) notFound('Sala não encontrada. Confira o código.');
  const members = await db.listMembers(row.id);
  if (members.includes(user.id)) return { match: publicMatch(row, user.id) }; // reconectar
  if (row.options?.solo) forbidden('Esta é uma partida de treino privada.');
  if (row.status === 'playing') return joinLate(db, user, row, body);
  if (row.status !== 'lobby') bad('A partida já terminou.');
  if (row.has_pin) {
    const pin = await db.getSecret(row.id);
    if (String(body.pin || '') !== pin) forbidden('PIN incorreto.');
  }
  const lobby = [...(row.lobby || [])];
  if (lobby.length >= (row.options?.maxPlayers || 4)) bad('Sala cheia.');
  const profile = await getOrCreateProfile(db, user);
  lobby.push(lobbyEntry(profile, body, await skinFor(db, profile)));
  await db.addMember(row.id, user.id);
  return save(db, row, { lobby }, user.id);
}

/** Entrar numa partida já em andamento (se a sala permitir). */
async function joinLate(db, user, row, body) {
  const options = normalizeOptions({}, row.options || {});
  if (!options.lateJoin || !row.state) bad('Esta partida não aceita entrar no meio (Battle Royale, competitivo ou desligado pelo anfitrião).');
  if (row.has_pin) {
    const pin = await db.getSecret(row.id);
    if (String(body.pin || '') !== pin) forbidden('PIN incorreto.');
  }
  const profile = await getOrCreateProfile(db, user);
  const e = lobbyEntry(profile, body, await skinFor(db, profile));
  if (options.mode === 'collection') {
    const owned = new Map((profile.vault || []).map(v => [v.uid, v]));
    let uids = [...new Set((Array.isArray(body.teamUids) ? body.teamUids : []).map(String))].filter(u => owned.has(u)).slice(0, 6);
    if (!uids.length) uids = [...(profile.vault || [])].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || b.lvl - a.lvl).slice(0, 6).map(v => v.uid);
    e.teamUids = uids;
  }
  const cfg = await playerCfg(db, e, options);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = attempt ? await db.getMatch(row.id) : row;
    if (cur.status !== 'playing') bad('A partida já terminou.');
    const { state, error } = addLatePlayer(cur.state, cfg, { maxPlayers: options.maxPlayers });
    if (error) bad(error);
    const lobby = [...(cur.lobby || []).filter(x => x.id !== user.id), { ...e, ready: true, late: true }];
    const ok = await db.updateMatch(cur.id, cur.version, { state, lobby, version: cur.version + 1 });
    if (!ok) continue;
    await db.addMember(cur.id, user.id);
    return { match: publicMatch({ ...cur, state, lobby, version: cur.version + 1 }, user.id) };
  }
  throw new HttpError(409, 'A partida mudou enquanto você entrava. Tente de novo.');
}

/** Anfitrião remove um jogador no meio da partida (sem esperar a CPU assumir). */
async function kickPlayer(db, user, row, body) {
  if (row.host_id !== user.id) forbidden('Só o anfitrião pode remover jogadores.');
  const target = String(body.target || '');
  if (!target || target === user.id) bad('Jogador inválido.');
  if (row.status !== 'playing') bad('A partida não está em andamento.');
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = attempt ? await db.getMatch(row.id) : row;
    const tp = cur.state?.players.find(p => p.id === target);
    if (!tp || target.startsWith('cpu_')) bad('Jogador inválido.');
    const { state, error } = applyAction(cur.state, target, { type: 'kicked' }, { now: Date.now() });
    if (error) bad(error);
    const finished = state.status === 'finished';
    const patch = { state, version: cur.version + 1, status: finished ? 'finished' : 'playing' };
    const ok = await db.updateMatch(cur.id, cur.version, patch);
    if (!ok) continue;
    await db.removeMember(cur.id, target);
    await creditLeavers(db, cur.state, state);
    if (state.options?.hardcore) { try { await purgeMatchCaptures(db, target, state.id); } catch (e) { console.error('[hardcore]', e.message); } }
    if (finished) await recordResults(db, state, cur.options || {});
    return { match: publicMatch({ ...cur, ...patch }, user.id) };
  }
  throw new HttpError(409, 'Muitas jogadas ao mesmo tempo. Tente de novo.');
}

async function leaveRoom(db, user, row) {
  if (row.status === 'playing') {
    const r = await actionOp(db, user, { matchId: row.id, action: { type: 'leave' } });
    await db.removeMember(row.id, user.id); // some da lista "Minhas partidas" e para de receber as jogadas
    // saiu o último treinador de verdade e só sobraram CPUs: encerra (não fica "em andamento" no limbo)
    try {
      const cur = await db.getMatch(row.id);
      const humans = (cur?.state?.players || []).filter(p => !p.isBot && !String(p.id).startsWith('cpu_') && !p.left && !p.kicked);
      if (cur?.status === 'playing' && !humans.length) await db.updateMatch(cur.id, cur.version, { status: 'abandoned', version: cur.version + 1 });
    } catch { /* ok */ }
    return r;
  }
  await db.removeMember(row.id, user.id);
  if (row.status !== 'lobby') return { left: true };
  const lobby = (row.lobby || []).filter(e => e.id !== user.id);
  const humans = lobby.filter(e => !e.isBot);
  if (!humans.length) {
    await db.updateMatch(row.id, row.version, { status: 'abandoned', lobby: [], version: row.version + 1 });
    return { left: true };
  }
  const patch = { lobby };
  if (row.host_id === user.id) patch.host_id = humans[0].id;
  await save(db, row, patch, user.id);
  return { left: true };
}

async function save(db, row, patch, userId) {
  const next = { ...patch, version: row.version + 1 };
  const ok = await db.updateMatch(row.id, row.version, next);
  if (!ok) throw new HttpError(409, 'A sala mudou enquanto você agia. Tente de novo.');
  return { match: publicMatch({ ...row, ...next }, userId) };
}

// ------------------------------------------------------------------ jogadas
export async function actionOp(db, user, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await db.getMatch(body.matchId);
    if (!row) notFound('Partida não encontrada.');
    if (row.status !== 'playing' || !row.state) bad('A partida não está em andamento.');
    const members = await db.listMembers(row.id);
    if (!members.includes(user.id)) forbidden('Você não está nesta partida.');

    const { state, error } = applyAction(row.state, user.id, body.action, { now: Date.now() });
    if (error) return { error, match: publicMatch(row, user.id) };

    const finished = state.status === 'finished';
    if (finished && row.options?.mode === 'duel' && row.options?.ranked) {
      const humans = state.players.filter(p => !p.id.startsWith('cpu_'));
      if (humans.length === 2) state.ratingChanges = await eloDeltas(db, state, humans);
    }
    if (finished && row.options?.mode === 'ranked') {
      const humans = state.players.filter(p => !p.id.startsWith('cpu_'));
      if (humans.length >= 2) state.ratingChanges = await eloDeltas(db, state, humans);
    }
    const patch = { state, version: row.version + 1, status: finished ? 'finished' : 'playing' };
    const ok = await db.updateMatch(row.id, row.version, patch);
    if (!ok) continue; // conflito de versão: outra jogada entrou antes — recalcula
    try { await publishCaptures(db, state, state.fx); } catch (e) { console.error('[feed]', e.message); }
    await creditLeavers(db, row.state, state);
    // companheiros ganhos em missões ficam na conta
    for (const f of state.fx || []) {
      if (f.k !== 'mission_done' || !f.companion || String(f.pid).startsWith('cpu_') || row.options?.mode === 'solo_local') continue;
      try {
        await mutateProfile(db, f.pid, prof => {
          const st = { ...(prof.stats || {}) };
          const list = st.companions || [];
          if (list.includes(f.companion)) return null;
          st.companions = [...list, f.companion];
          if (!st.companion) st.companion = f.companion;
          return { stats: st };
        });
      } catch (e) { console.error('[companion]', e.message); }
    }
    if (finished && row.options?.mode === 'duel') {
      // 💎 Pokédex Mega também vale nos duelos (Liga/Torneio)
      for (const pl of state.players) {
        if (pl.id.startsWith('cpu_') || !pl.megaDex) continue;
        try { await mutateProfile(db, pl.id, prof => { const md = mergeMegaDex(prof.stats?.megaDex, pl.megaDex); return md ? { stats: { ...(prof.stats || {}), megaDex: md } } : null; }); } catch (e) { console.error('[megadex]', e.message); }
      }
      await duelFinished(db, { ...row, ...patch });
    }
    else if (finished) {
      await recordResults(db, state, row.options || {});
      if (state.leagueChanges || state.bondChanges || state.bagChanges) {
        try { // mostra +PL / subiu de divisão / laço do companheiro na tela de fim de jogo
          const cur = await db.getMatch(row.id);
          if (cur?.state) await db.updateMatch(cur.id, cur.version, { state: { ...cur.state, leagueChanges: state.leagueChanges || null, bondChanges: state.bondChanges || null, bagChanges: state.bagChanges || null }, version: cur.version + 1 });
        } catch { /* só visual */ }
      }
    }
    else {
      const ids = playersToSync(body.action, row.state, state);
      if (ids && ids.size) {
        const list = [...ids].map(id => (id === '__actor__' ? user.id : id));
        try { await syncCollection(db, state, list); } catch (e) { console.error('[sync]', e.message); }
      }
      // ☠️ Hardcore: quem acabou de cair perde as capturas desta partida (o que já era da Coleção continua)
      if (state.options?.hardcore) {
        for (const pl of state.players) {
          if (pl.hardcoreLost && !row.state.players.find(x => x.id === pl.id)?.hardcoreLost && !pl.id.startsWith('cpu_')) {
            try { await purgeMatchCaptures(db, pl.id, state.id); } catch (e) { console.error('[hardcore]', e.message); }
          }
        }
      }
    }
    return { match: publicMatch({ ...row, ...patch }, user.id) };
  }
  throw new HttpError(409, 'Muitas jogadas ao mesmo tempo. Tente de novo.');
}

/** v59: Pokémon que não podem sair da Coleção agora (uid → onde está). */
export function releaseLocks(st) {
  const m = new Map();
  for (const u of st?.serie?.defense || []) m.set(u, 'no time da Liga das Séries');
  for (const s of st?.farm?.slots || []) if (s?.uid) m.set(s.uid, 'na Fazenda');
  for (const u of [st?.farm?.daycare?.a, st?.farm?.daycare?.b]) if (u) m.set(u, 'na Creche');
  return m;
}

/** 🎒 v59: devolve à conta o que quem acabou de sair trouxe e não gastou (state.players[].leaveRefund). */
export async function creditLeavers(db, prev, state) {
  for (const p of state?.players || []) {
    if (!p.leaveRefund || String(p.id).startsWith('cpu_') || prev?.players?.find(x => x.id === p.id)?.leaveRefund) continue;
    const { items = {}, gold = 0 } = p.leaveRefund;
    try {
      if (Object.keys(items).length) await mutateProfile(db, p.id, cur => ({ stats: { ...(cur.stats || {}), bag: addToBag(cur.stats?.bag, items) } }));
      if (gold > 0 && db.walletAdd) await db.walletAdd(p.id, 0, gold);
    } catch (e) { console.error('[leave refund]', e.message); }
  }
}

/** 🎒 v59: partida encerrada sem fim (abandonada): quem ainda estava nela recebe de volta o que trouxe e não gastou. */
export async function refundAbandoned(db, state) {
  if (!state?.players || state.options?.hardcore) return;
  for (const p of state.players) {
    if (String(p.id).startsWith('cpu_') || p.left || p.hardcoreLost) continue;
    // 🪙🎒 v66: partida encerrada (pelo admin ou parada): leva também o ouro ganho (mesma conta do fim normal, sem
    // bônus de vitória) e os itens que sobraram — antes só voltava o que tinha trazido
    const items = bagFromMatch(p);
    const gold = refundBrought(p) + accountGoldReward(state, p);
    (state.goldChanges ||= {})[p.id] = gold;
    try {
      if (Object.keys(items).length) await mutateProfile(db, p.id, cur => ({ stats: { ...(cur.stats || {}), bag: addToBag(cur.stats?.bag, items) } }));
      if (gold > 0 && db.walletAdd) await db.walletAdd(p.id, 0, gold);
    } catch (e) { console.error('[abandon refund]', e.message); }
  }
}

/** Fim de partida online: Coleção + Pokédex + estatísticas + pontos + rating (competitivo). */
export async function recordResults(db, state, options = {}) {
  await syncCollection(db, state, null);
  if (state.options?.hardcore) {
    for (const p of state.players) if (p.hardcoreLost && !p.id.startsWith('cpu_')) { try { await purgeMatchCaptures(db, p.id, state.id); } catch (e) { console.error('[hardcore]', e.message); } }
  }
  const humans = state.players.filter(p => !p.id.startsWith('cpu_'));
  const ranked = options.mode === 'ranked' && humans.length >= 2;
  const deltas = ranked ? (state.ratingChanges || await eloDeltas(db, state, humans)) : {};
  const places = ranked ? placements(state, humans) : {};
  for (const p of humans) {
    if (p.champion && db.insertFeed) {
      try { await db.insertFeed({ kind: 'champion', text: `👑 ${p.name} venceu a Liga e se tornou Campeão!`, data: { name: p.name, avatar: p.avatar, skin: p.cosmetic?.skin || null } }); } catch { /* ok */ }
    }
    // 🎒 itens que sobraram (só os que podem ficar: Pokébolas, Amuleto, TM) vão para a Mochila da conta
    // (quem saiu já recebeu de volta o que trouxe na hora em que saiu — v59)
    const keep = (p.hardcoreLost || p.left) ? {} : bagFromMatch(p);
    if (Object.keys(keep).length) (state.bagChanges ||= {})[p.id] = keep;
    let leagueReward = 0;
    // v59: tudo é calculado em cima do perfil MAIS NOVO dentro da gravação — nada de cópia antiga apagando
    // o que outra parte (Fazenda, Mochila, Liga...) salvou durante o fim da partida.
    const saved = await mutateProfile(db, p.id, cur => {
      const st = { ...(cur.stats || {}) };
      st.matches = (st.matches || 0) + 1;
      st.wins = (st.wins || 0) + (isWinner(state, p) ? 1 : 0);
      st.champion = (st.champion || 0) + (p.champion ? 1 : 0);
      st.captures = (st.captures || 0) + p.stats.captures;
      st.shinies = (st.shinies || 0) + p.stats.shinies;
      st.pvpWins = (st.pvpWins || 0) + p.stats.pvpWins;
      st.bestScore = Math.max(st.bestScore || 0, score(p));
      // 💞 Laço: o companheiro que terminou a partida com você ganha pontos
      if (p.companion && COMPANIONS[p.companion] && !p.hardcoreLost) {
        const bond = { ...(st.companionBond || {}) };
        const before = bond[p.companion] || 0;
        const gain = (p.meal?.id === 'bond_pudding' ? 2 : 1) * bondGain({ won: isWinner(state, p), badges: p.badges.length, captures: p.stats.captures, battlesWon: p.stats.wins, missions: p.missionsDone || 0, turns: state.turn }); // 🍮 Pudim da Amizade: laço em dobro
        bond[p.companion] = Math.min(5000, before + gain);
        st.companionBond = bond;
        const lb = bondLevel(before), la = bondLevel(bond[p.companion]);
        (state.bondChanges ||= {})[p.id] = { comp: p.companion, gain, lvl: la, up: la > lb, intimate: la >= BOND_MAX && lb < BOND_MAX, points: bond[p.companion] };
      }
      const patch = {};
      if (ranked) {
        st.ranked = (st.ranked || 0) + 1;
        st.rankedWins = (st.rankedWins || 0) + (isWinner(state, p) ? 1 : 0);
        patch.rating = Math.max(100, (cur.rating ?? START_RATING) + (deltas[p.id] || 0));
        // 🏆 Liga: Pontos de Liga pela colocação (sobe/cai de divisão)
        const lg = leagueStats(st, places[p.id], humans.length);
        Object.assign(st, lg.stats);
        (state.leagueChanges ||= {})[p.id] = { delta: lg.result.delta, change: lg.result.change, div: lg.result.to, lp: lg.result.league.lp };
        leagueReward = lg.reward || 0;
      }
      if (state.options?.hardcore) st.hardcore = (st.hardcore || 0) + (p.hardcoreLost ? 0 : 1);
      st.bag = addToBag(st.bag, keep);
      if (p.items?.mega_bracelet > 0 && !p.hardcoreLost) st.megaBracelet = true; // 🔗 Bracelete Mega (só cai em Mega Raid)
      if (p.items?.dynamax_band > 0 && !p.hardcoreLost) st.dynamaxBand = true; // 🔴 Pulseira Dynamax (só cai em Raid Gigantamax)
      if ((p.legendCharmUntil || 0) > (st.legendCharmUntil || 0)) st.legendCharmUntil = p.legendCharmUntil; // 🏵️ Amuleto ativado na partida
      // 🏟️ v65: Pontos de Guilda da semana
      const G = GUILD_POINTS;
      const gp = p.hardcoreLost || p.left ? 0 : G.match + G.badge * p.badges.length + G.capture * Math.min(20, p.stats.captures || 0) + (isWinner(state, p) ? G.win : 0) + (state.rules === 'bossraid' && state.lastRaid?.won ? G.raid : 0);
      Object.assign(st, addGuildPts(st, gp));
      return { ...patch, stats: st, points: calcPoints(cur.pokedex || [], st) };
    });
    if (!saved) continue;
    if (leagueReward && db.walletAdd) { try { await db.walletAdd(p.id, leagueReward, 0); } catch (e) { console.error('[season]', e.message); } }
    // Hardcore: quem caiu não leva nada (nem o ouro trazido); quem sobreviveu ganha o dobro de ouro da conta
    const coins = p.hardcoreLost ? 0 : (state.options?.hardcore ? Math.min(GOLD_REWARD_MAX * 2, accountGoldReward(state, p) * 2) : accountGoldReward(state, p)) + refundBrought(p);
    (state.goldChanges ||= {})[p.id] = coins; // mostrado no resultado
    if (coins > 0 && db.walletAdd) {
      try { await db.walletAdd(p.id, 0, coins); } catch (e) { console.error('[gold]', e.message); }
    }
  }
}

/**
 * Liga Ranqueada: aplica a colocação numa cópia de stats. Devolve { stats, reward (💎 da temporada anterior), result }.
 * place 1 = vencedor; players = quantos humanos disputaram.
 */
export function leagueStats(stats, place, players, now = new Date()) {
  const st = { ...(stats || {}) };
  const { league, reward } = ensureSeason(st.league, seasonId(now));
  const result = applyLeagueResult(league, { place, players });
  st.league = result.league;
  return { stats: st, reward, result };
}

/** Colocação final dos humanos (vencedor primeiro, depois pontos). */
export function placements(state, humans) {
  const order = [...humans].sort((a, b) => isWinner(state, b) - isWinner(state, a) || score(b) - score(a));
  return Object.fromEntries(order.map((p, i) => [p.id, i + 1]));
}

/** Elo multijogador: cada par de jogadores é um "duelo" decidido pela colocação final. */
export async function eloDeltas(db, state, humans) {
  const ratings = {};
  for (const p of humans) ratings[p.id] = (await db.getProfile(p.id))?.rating ?? START_RATING;
  const order = [...humans].sort((a, b) => isWinner(state, b) - isWinner(state, a) || score(b) - score(a));
  const place = Object.fromEntries(order.map((p, i) => [p.id, i]));
  const K = 32 / Math.max(1, humans.length - 1);
  const d = {};
  for (const a of humans) {
    let sum = 0;
    for (const b of humans) {
      if (a.id === b.id) continue;
      const exp = 1 / (1 + 10 ** ((ratings[b.id] - ratings[a.id]) / 400));
      const res = place[a.id] < place[b.id] ? 1 : place[a.id] > place[b.id] ? 0 : 0.5;
      sum += K * (res - exp);
    }
    d[a.id] = Math.round(sum);
  }
  return d;
}

// ------------------------------------------------------------------ admin
export async function adminOp(db, user, body) {
  const me = await getOrCreateProfile(db, user);
  if (!me.is_admin) forbidden('Apenas administradores.');
  switch (body.op) {
    case 'set_daily': {
      if (body.species && !SPECIES[body.species]) bad('Espécie inválida.');
      await db.setConfig('daily_pokemon', body.species ? { species: body.species, date: body.date || null } : null);
      return { ok: true, dailyPokemon: await currentDaily(db) };
    }
    case 'list_maps': return { maps: await customMaps(db) };
    case 'save_map': { // 🛠️ editor de mapas: valida, guarda e (opcional) publica para todas as salas
      let map;
      try { map = validateCustomMap({ ...(body.map || {}), id: body.map?.id || body.id }); } catch (e) { bad(e.message); }
      const list = await customMaps(db);
      const old = list.find(m => m.id === map.id);
      if (!old && list.length >= 20) bad('Máximo de 20 mapas. Apague algum antes.');
      const row = { ...map, rev: (old?.rev || 0) + 1, published: !!body.published, updatedAt: new Date().toISOString(), by: me.trainer_name };
      await db.setConfig('custom_maps', { maps: [...list.filter(m => m.id !== map.id), row] });
      return { ok: true, map: row, maps: await customMaps(db) };
    }
    case 'delete_map': {
      const list = await customMaps(db);
      await db.setConfig('custom_maps', { maps: list.filter(m => m.id !== body.id) });
      return { ok: true, maps: await customMaps(db) };
    }
    case 'list_users': {
      const rows = await db.listProfiles(200);
      return { users: rows.map(r => ({ id: r.id, name: r.trainer_name, points: r.points, rating: r.rating ?? START_RATING, diamonds: r.diamonds || 0, isAdmin: r.is_admin, pokedex: (r.pokedex || []).length, vault: (r.vault || []).length })) };
    }
    case 'grant_mon': {
      if (!SPECIES[body.species] || SPECIES[body.species].mega) bad('Espécie inválida.');
      const ok = await mutateProfile(db, body.userId, prof => {
        const vault = [...(prof.vault || [])];
        vault.unshift({ uid: 'adm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), sp: body.species, lvl: Math.max(1, Math.min(60, Number(body.level) || 5)), shiny: !!body.shiny, aura: null, from: 'admin', at: new Date().toISOString() });
        return { vault }; // presente do admin nunca apaga nada (pode passar do limite)
      });
      if (!ok) notFound('Usuário não encontrado.');
      return { ok: true };
    }
    case 'grant_item': { // 🎒 prêmio de evento: item na Mochila da conta
      if (body.item === 'mega_bracelet' || body.item === 'dynamax_band') { // 🔗 Bracelete Mega / 🔴 Pulseira Dynamax (prêmio de evento do admin)
        const key = body.item === 'mega_bracelet' ? 'megaBracelet' : 'dynamaxBand';
        const ok = await mutateProfile(db, body.userId, prof => ({ stats: { ...(prof.stats || {}), [key]: true } }));
        if (!ok) notFound('Usuário não encontrado.');
        return { ok: true };
      }
      if (!isKeepable(body.item)) bad('Só dá para dar Pokébolas, Amuleto Shiny e TM.');
      const qty = Math.max(1, Math.min(99, Math.floor(Number(body.qty) || 1)));
      const ok = await mutateProfile(db, body.userId, prof => ({ stats: { ...(prof.stats || {}), bag: addToBag(prof.stats?.bag, { [body.item]: qty }) } }));
      if (!ok) notFound('Usuário não encontrado.');
      return { ok: true };
    }
    // ---- 🔐 suporte a contas (o admin nunca vê a senha; só define uma nova)
    case 'account_info': {
      const info = await db.authInfo(String(body.userId || ''));
      if (!info) notFound('Conta não encontrada.');
      const p = await db.getProfile(info.id);
      return { account: { ...info, trainer: p?.trainer_name || null, megaBracelet: !!p?.stats?.megaBracelet, dynamaxBand: !!p?.stats?.dynamaxBand } };
    }
    case 'account_find': { // procurar pelo e-mail (para quem não lembra o nome de treinador)
      const q = String(body.q || '').trim();
      if (q.length < 3) bad('Digite pelo menos 3 letras do e-mail.');
      const found = await db.authFindEmail(q);
      const out = [];
      for (const a of found) { const p = await db.getProfile(a.id); out.push({ ...a, trainer: p?.trainer_name || null }); }
      return { accounts: out };
    }
    case 'account_confirm':
      await db.authConfirm(String(body.userId || ''));
      return { ok: true };
    case 'account_password': {
      const pw = String(body.password || '');
      if (pw.length < 6) bad('A senha precisa ter pelo menos 6 caracteres.');
      await db.authSetPassword(String(body.userId || ''), pw);
      return { ok: true };
    }
    case 'account_mail': { // 📧 reenviar ativação ou link de recuperar senha
      const info = await db.authInfo(String(body.userId || ''));
      if (!info?.email) notFound('Conta não encontrada.');
      const origin = /^https?:\/\/[\w.-]+(:\d+)?$/.test(String(body.origin || '')) ? body.origin : (process.env.PUBLIC_URL || undefined);
      if (body.kind === 'signup') await db.authResendSignup(info.email, origin);
      else await db.authSendRecovery(info.email, origin);
      return { ok: true, email: info.email };
    }
    case 'remove_bracelet': {
      const ok = await mutateProfile(db, body.userId, prof => {
        const st = { ...(prof.stats || {}) };
        if (body.item === 'dynamax_band') delete st.dynamaxBand; else delete st.megaBracelet;
        return { stats: st };
      });
      if (!ok) notFound('Usuário não encontrado.');
      return { ok: true };
    }
    case 'clear_farm_art': { // 🖌️ moderação: apaga os desenhos da Fazenda de um jogador (e tira da decoração)
      const ok = await mutateProfile(db, body.userId, prof => {
        const st = { ...(prof.stats || {}) };
        if (st.farm) st.farm = { ...st.farm, art: [], decor: (st.farm.decor || []).filter(d => !/^art\d$/.test(d.k)) };
        return { stats: st };
      });
      if (!ok) notFound('Usuário não encontrado.');
      return { ok: true };
    }
    case 'set_admin': {
      await db.upsertProfile(body.userId, { is_admin: !!body.value });
      return { ok: true };
    }
    case 'set_announcement': {
      const a = body.announcement || {};
      const value = {
        id: 'a' + Date.now().toString(36),
        title: String(a.title || '').replace(/[<>]/g, '').slice(0, 80),
        text: String(a.text || '').replace(/[<>]/g, '').slice(0, 600),
        kind: ['info', 'warn', 'event', 'update'].includes(a.kind) ? a.kind : 'info',
        active: !!a.active
      };
      await db.setConfig('announcement', value);
      if (value.active && db.insertFeed) await db.insertFeed({ kind: 'announcement', text: value.title, data: value });
      return { ok: true, announcement: value };
    }
    case 'get_admin_data': {
      const [shop, announcement, payments] = [await getShop(db), await db.getConfig('announcement'), await db.listPayments(100)];
      const profiles = await db.listProfiles(500, { stats: [] });
      const names = Object.fromEntries(profiles.map(p => [p.id, p.trainer_name]));
      return { shop, announcement, payments: payments.map(p => ({ ...p, user: names[p.user_id] || p.user_id })) };
    }
    case 'save_shop': {
      const shop = cleanShop(body.shop || {});
      await db.setConfig('shop', shop);
      return { ok: true, shop };
    }
    case 'give_gold': {
      const amount = Math.trunc(Number(body.amount) || 0);
      const r = await db.walletAdd(body.userId, 0, amount);
      if (!r) bad('Usuário não encontrado ou saldo ficaria negativo.');
      return { ok: true, gold: r.gold };
    }
    case 'give_diamonds': {
      const n = Math.round(Number(body.amount) || 0);
      if (!n) bad('Quantidade inválida.');
      const left = await db.addDiamonds(body.userId, n);
      if (left === null) bad('O saldo ficaria negativo.');
      return { ok: true, diamonds: left };
    }
    case 'credit_payment': {
      const ok = await creditPayment(db, body.paymentId);
      return { ok };
    }
    case 'close_match': {
      const row = await db.getMatch(body.matchId);
      if (!row) notFound();
      const ok = await db.updateMatch(row.id, row.version, { status: 'abandoned', version: row.version + 1 });
      if (ok && row.status === 'playing') await refundAbandoned(db, row.state);
      return { ok: true };
    }
    default:
      bad('Operação inválida.');
  }
}
