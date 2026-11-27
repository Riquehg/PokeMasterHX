// 🗼 v51 — Torre de Batalha (servidor). stats.tower = { pb, streak, best, set: { n, team, wins } | null, matchId }.
// Cada duelo é criado com createDuelMatch (a CPU joga com o time da Torre); o fim chega em towerFinished.
import { TOWER_PRICE, TOWER_TEAM, TOWER_LEVEL, TOWER_SET, pbForWin, SET_CLEAR_BONUS, TOWER_POOLS, BOSS_LEGENDS, BOSS_NAME, TOWER_NAMES, tierOfStreak, TOWER_SHOP } from '../../shared/data/tower.js';
import { GEAR } from '../../shared/data/battlegear.js';
import { MEGAS, stoneItemId } from '../../shared/data/megas.js';
import { GMAX } from '../../shared/data/gmax.js';
import { ITEMS } from '../../shared/data/items.js';
import { TYPES } from '../../shared/rules/types.js';
import { createRng, randomSeed } from '../../shared/rules/rng.js';
import { mutateProfile, getOrCreateProfile, publicMatch, addToBag } from './core.js';
import { createDuelMatch } from './tournament.js';
import { equippedCosmetic } from './shop.js';

const bad = msg => { const e = new Error(msg); e.status = 400; throw e; };
const CPU = 'cpu_t_';
const TW = st => ({ pb: 0, streak: 0, best: 0, set: null, ...(st?.tower || {}) });
const pub = t => ({ pb: t.pb, streak: t.streak, best: t.best, set: t.set ? { n: t.set.n, team: t.set.team, wins: t.set.wins } : null, matchId: t.matchId || null, price: TOWER_PRICE, shop: TOWER_SHOP });
const GEAR_IDS = ['leftovers', 'focus_sash', 'quick_claw', 'choice_band'];

/** Time da CPU para o duelo n (1..7) com a sequência atual. */
function foeTeam(streak, n, seed) {
  const rng = createRng(seed);
  const tier = tierOfStreak(streak);
  const boss = n === TOWER_SET;
  const pool = TOWER_POOLS[Math.min(2, tier + (boss ? 1 : 0))];
  const picks = new Set();
  while (picks.size < TOWER_TEAM - (boss && tier >= 1 ? 1 : 0)) picks.add(rng.pick(pool));
  const team = [...picks].map((sp, i) => ({ uid: `tw${seed}_${i}`, sp, lvl: TOWER_LEVEL }));
  if (boss && tier >= 1) team.push({ uid: `tw${seed}_L`, sp: rng.pick(BOSS_LEGENDS), lvl: TOWER_LEVEL }); // 👑 o Mestre leva um lendário
  // itens: mais itens quanto maior a sequência; Mega no Mestre e na fase 3
  for (const m of team) if (rng.chance(tier === 0 ? 0.15 : tier === 1 ? 0.45 : 0.8)) m.held = rng.chance(0.3) ? `plate_${rng.pick(TYPES)}` : rng.pick(GEAR_IDS);
  let megaKey = false;
  if (boss || tier >= 2) {
    const megaAble = team.map(m => Object.values(MEGAS).find(x => x.base === m.sp)).filter(Boolean);
    if (megaAble.length) { const mg = rng.pick(megaAble); const mon = team.find(m => m.sp === mg.base); mon.held = stoneItemId(mg); megaKey = true; }
  }
  // 🔴 sem Mega: quem tem forma Gigantamax pode vir com o Fator (o Mestre e a fase 3)
  let dynaKey = false;
  if ((boss || tier >= 2) && !megaKey) { const g = team.find(m => GMAX[m.sp]); if (g) { g.gx = true; dynaKey = true; } }
  return { team, megaKey, dynaKey, boss };
}

export async function towerOp(db, user, body) {
  const op = body.op;
  const prof = await getOrCreateProfile(db, user);
  const t = TW(prof.stats);
  if (op === 'tower_get') return { tower: pub(t), gold: prof.gold };

  if (op === 'tower_start') { // paga a entrada e escolhe o time de 3 (continua a sequência se houver)
    if (t.set) bad('Você já está numa série da Torre.');
    const uids = (body.teamUids || []).map(String).slice(0, TOWER_TEAM);
    const vault = prof.vault || [];
    if (new Set(uids).size !== TOWER_TEAM || uids.some(u => !vault.find(v => v.uid === u))) bad(`Escolha ${TOWER_TEAM} Pokémon diferentes da Coleção.`);
    if ((prof.gold || 0) < TOWER_PRICE) bad(`A entrada custa 🪙 ${TOWER_PRICE}.`);
    const paid = await db.walletAdd(user.id, 0, -TOWER_PRICE);
    if (paid === null) bad('Ouro insuficiente.');
    try {
      const p2 = await mutateProfile(db, user.id, cur => {
        const tw = TW(cur.stats);
        if (tw.set) bad('Você já está numa série da Torre.');
        return { stats: { ...(cur.stats || {}), tower: { ...tw, set: { n: 1, team: uids, wins: 0 }, matchId: null } } };
      });
      return { tower: pub(TW(p2.stats)), gold: p2.gold };
    } catch (e) { await db.walletAdd(user.id, 0, TOWER_PRICE); throw e; }
  }

  if (op === 'tower_battle') { // cria o próximo duelo da série
    if (!t.set) bad('Comece uma série primeiro.');
    if (t.matchId) { const live = await db.getMatch(t.matchId); if (live && live.status === 'playing') return { match: publicMatch(live, user.id) }; }
    const vault = prof.vault || [];
    const mine = t.set.team.map(u => vault.find(v => v.uid === u)).filter(Boolean).map(v => ({ ...v, lvl: Math.min(TOWER_LEVEL, v.lvl), tf: undefined }));
    if (mine.length < TOWER_TEAM) bad('Um Pokémon do seu time saiu da Coleção — desista desta série e monte outro time.');
    const seed = randomSeed();
    const f = foeTeam(t.streak, t.set.n, seed);
    const foeName = f.boss ? BOSS_NAME : TOWER_NAMES[seed % TOWER_NAMES.length];
    const me = { id: user.id, name: prof.trainer_name, avatar: prof.avatar || 1, cosmetic: await equippedCosmetic(db, prof).catch(() => null), teamMons: mine, megaKey: !!prof.stats?.megaBracelet, dynaKey: !!prof.stats?.dynamaxBand };
    const foe = { id: `${CPU}${seed}`, name: foeName, avatar: f.boss ? 8 : 1 + (seed % 7), isBot: true, teamMons: f.team, megaKey: f.megaKey, dynaKey: f.dynaKey, cosmetic: f.boss ? { frame: 'royal', title: 'Mestre da Torre' } : null };
    const row = await createDuelMatch(db, { megas: true, name: `🗼 Torre — duelo ${t.set.n}/${TOWER_SET}${f.boss ? ' (👑 Mestre)' : ''}: ${me.name} x ${foe.name}`, a: me, b: foe, hostId: user.id,
      options: { mode: 'duel', tower: { player: user.id, n: t.set.n, boss: f.boss } } });
    await mutateProfile(db, user.id, cur => ({ stats: { ...(cur.stats || {}), tower: { ...TW(cur.stats), matchId: row.id } } }));
    return { match: publicMatch(row, user.id) };
  }

  if (op === 'tower_quit') { // desiste: a sequência acaba
    const p2 = await mutateProfile(db, user.id, cur => { const tw = TW(cur.stats); return { stats: { ...(cur.stats || {}), tower: { ...tw, best: Math.max(tw.best, tw.streak), streak: 0, set: null, matchId: null } } }; });
    return { tower: pub(TW(p2.stats)), gold: p2.gold };
  }

  if (op === 'tower_buy') { // 🛒 loja da Torre (PB)
    const id = String(body.item || '');
    const S = TOWER_SHOP[id];
    if (!S) bad('Item inválido.');
    const item = S.plate ? `plate_${String(body.ptype || '')}` : id;
    if (!ITEMS[item]) bad('Escolha o tipo da Placa.');
    const p2 = await mutateProfile(db, user.id, cur => {
      const tw = TW(cur.stats);
      if (tw.pb < S.pb) bad(`Precisa de ${S.pb} PB.`);
      if (S.key) { // 🔗🔴 Bracelete Mega / Pulseira Dynamax: vira chave da conta
        if (cur.stats?.[S.key]) bad(`Você já tem ${ITEMS[item].name}.`);
        return { stats: { ...(cur.stats || {}), tower: { ...tw, pb: tw.pb - S.pb }, [S.key]: true } };
      }
      const bag = addToBag(cur.stats?.bag, { [item]: S.qty });
      if (item === 'rare_candy') bag.rare_candy = Math.min(99, (cur.stats?.bag?.rare_candy || 0) + S.qty); // 🍬 fica na Mochila para usar na Coleção
      return { stats: { ...(cur.stats || {}), tower: { ...tw, pb: tw.pb - S.pb }, bag } };
    });
    return { tower: pub(TW(p2.stats)), gold: p2.gold, profile: p2, message: S.key ? `${item === 'mega_bracelet' ? '🔗' : '🔴'} ${ITEMS[item].name} liberado na sua conta! Agora pode ${item === 'mega_bracelet' ? 'Mega Evoluir' : 'dar Gigantamax'} nas partidas que permitirem.` : `🛒 ${S.qty > 1 ? S.qty + '× ' : ''}${ITEMS[item].name} foi para a 🎒 Mochila!` };
  }
  bad('Operação da Torre inválida.');
}

/** Fim de um duelo da Torre: sequência, PB e próximo duelo (ou fim da série). */
export async function towerFinished(db, row) {
  const o = row.options?.tower;
  const st = row.state;
  if (!o || !st) return;
  const win = st.winner === o.player;
  let result = null;
  await mutateProfile(db, o.player, prof => {
    const tw = TW(prof.stats);
    if (!tw.set || tw.matchId !== row.id) return null; // já contado
    if (win) {
      const streak = tw.streak + 1;
      let pb = pbForWin(tw.streak, o.boss);
      const cleared = tw.set.n >= TOWER_SET;
      if (cleared) pb += SET_CLEAR_BONUS;
      result = { win, streak, pb, cleared, n: tw.set.n, boss: !!o.boss };
      return { stats: { ...(prof.stats || {}), tower: { ...tw, pb: tw.pb + pb, streak, best: Math.max(tw.best, streak), matchId: null, set: cleared ? null : { ...tw.set, n: tw.set.n + 1, wins: tw.set.wins + 1 } } } };
    }
    result = { win, streak: tw.streak, pb: 0, n: tw.set.n, ended: true };
    return { stats: { ...(prof.stats || {}), tower: { ...tw, best: Math.max(tw.best, tw.streak), streak: 0, set: null, matchId: null } } };
  });
  try { // mostra o resultado na tela do fim do duelo
    const cur = await db.getMatch(row.id);
    if (cur?.state && result) await db.updateMatch(cur.id, cur.version, { state: { ...cur.state, towerResult: result }, version: cur.version + 1 });
  } catch { /* só visual */ }
}
