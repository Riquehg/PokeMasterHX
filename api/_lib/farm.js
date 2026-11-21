// 🌾 Fazenda Pokémon no servidor (ops de /api/profile que começam com "farm_"). Dados em profiles.stats.farm.
import { getSpecies } from '../../shared/data/pokemon.js';
import { gainXp, xpToNext } from '../../shared/rules/monsters.js';
import {
  FARM_BIOMES, RESOURCES, FARM_DECOR, DECOR_MAX, FARM_MAX_LEVEL, CARE_COOLDOWN_H, CARE_HAPPY, FEED_HAPPY, FEED_XP, HELP_HAPPY, RES_CAP,
  newFarm, tickFarm, pendingOf, slotsFor, addFarmXp, bestBiome, brtDay, decorItemId, farmLevelXp
} from '../../shared/data/farm.js';
import { bad, notFound, mutateProfile, getOrCreateProfile } from './core.js';
import { myCosmetics } from './shop.js';

const typesOf = mon => getSpecies(mon.sp)?.types || ['normal'];
const vaultMap = prof => new Map((prof.vault || []).map(m => [m.uid, m]));
const clone = o => JSON.parse(JSON.stringify(o));

/** Fazenda atualizada até agora (sem gravar). */
function current(prof, now = Date.now()) {
  const farm = clone(prof.stats?.farm || newFarm(now));
  tickFarm(farm, vaultMap(prof), typesOf, now);
  return farm;
}

/** O que o cliente precisa para desenhar (dono ou visitante). */
function view(prof, farm, viewerId) {
  const vm = vaultMap(prof);
  const mine = prof.id === viewerId;
  const day = brtDay();
  return {
    owner: { id: prof.id, name: prof.trainer_name, avatar: prof.avatar },
    mine,
    lvl: farm.lvl, xp: farm.xp, xpNext: farmLevelXp(farm.lvl), slotsMax: slotsFor(farm.lvl),
    slots: farm.slots.map(s => {
      const m = vm.get(s.uid);
      return { uid: s.uid, biome: s.biome, happy: Math.round(s.happy ?? 70), sp: m.sp, lvl: m.lvl, shiny: !!m.shiny, gender: m.gender || null, nick: m.nick || null,
        pxp: Math.floor(s.pxp || 0), pres: Math.floor(s.pres || 0), res: s.res, careIn: Math.max(0, (s.cared || 0) + CARE_COOLDOWN_H * 3600000 - Date.now()) };
    }),
    res: mine ? farm.res || {} : undefined,
    pending: mine ? pendingOf(farm) : undefined,
    decor: farm.decor || [],
    likes: farm.likes || 0,
    likedToday: !mine && farm.likesBy?.[viewerId] === day,
    helpedToday: !mine && farm.helpsBy?.[viewerId] === day,
    visits: mine ? (farm.visits || []).slice(0, 20) : undefined,
    ownedDecor: mine ? Object.keys(FARM_DECOR).filter(k => FARM_DECOR[k].price === 0 || myCosmetics(prof).owned.includes(decorItemId(k))) : undefined
  };
}

async function save(db, userId, fn) {
  let out = null;
  const prof = await mutateProfile(db, userId, cur => {
    const farm = current(cur);
    const r = fn(farm, cur);
    if (r === null) return null;
    out = r;
    const st = { ...(cur.stats || {}), farm };
    return r?.vault ? { stats: st, vault: r.vault } : { stats: st };
  });
  return { prof, out };
}

export async function farmOp(db, user, body) {
  const p = await getOrCreateProfile(db, user);
  const now = Date.now();

  if (body.op === 'farm_get') {
    if (body.userId && body.userId !== user.id) {
      const other = await db.getProfile(body.userId);
      if (!other) notFound('Treinador não encontrado.');
      return { farm: view(other, current(other, now), user.id) };
    }
    return { farm: view(p, current(p, now), user.id) };
  }

  if (body.op === 'farm_top') { // ❤️ Fazendas mais curtidas
    const rows = await db.listProfiles(2000);
    const top = rows.filter(r => r.stats?.farm?.slots?.length).map(r => ({ id: r.id, name: r.trainer_name, avatar: r.avatar, likes: r.stats.farm.likes || 0, lvl: r.stats.farm.lvl || 1, mons: r.stats.farm.slots.length }))
      .sort((a, b) => b.likes - a.likes || b.lvl - a.lvl).slice(0, 30);
    return { top };
  }

  if (body.op === 'farm_like' || body.op === 'farm_help') { // visita: curtir (1/dia) ou cuidar (1/dia)
    const target = String(body.userId || '');
    if (!target || target === user.id) bad('Escolha a Fazenda de outro treinador.');
    const day = brtDay(now);
    let did = false;
    await mutateProfile(db, target, cur => {
      const farm = current(cur, now);
      if (!farm.slots.length) return null;
      const key = body.op === 'farm_like' ? 'likesBy' : 'helpsBy';
      farm[key] = Object.fromEntries(Object.entries(farm[key] || {}).filter(([, d]) => d === day)); // só o dia de hoje
      if (farm[key][user.id] === day) return null;
      farm[key][user.id] = day;
      if (body.op === 'farm_like') farm.likes = (farm.likes || 0) + 1;
      else for (const s of farm.slots) s.happy = Math.min(100, (s.happy ?? 70) + HELP_HAPPY);
      farm.visits = [{ at: now, name: p.trainer_name, kind: body.op === 'farm_like' ? 'like' : 'help' }, ...(farm.visits || [])].slice(0, 30);
      did = true;
      return { stats: { ...(cur.stats || {}), farm } };
    });
    if (!did) bad(body.op === 'farm_like' ? 'Você já curtiu esta Fazenda hoje.' : 'Você já cuidou desta Fazenda hoje (ou ela está vazia).');
    if (body.op === 'farm_help') { // quem ajuda ganha um agrado
      await save(db, user.id, farm => { farm.res.berry = Math.min(RES_CAP, (farm.res.berry || 0) + 2); addFarmXp(farm, 5); return {}; });
    }
    const other = await db.getProfile(target);
    return { farm: view(other, current(other, now), user.id), message: body.op === 'farm_like' ? '❤️ Curtido!' : '🤝 Você cuidou dos Pokémon! +2 🍓' };
  }

  // ---- daqui pra baixo: só na própria Fazenda
  if (body.op === 'farm_place') {
    const uid = String(body.uid || '');
    const mon = (p.vault || []).find(m => m.uid === uid);
    if (!mon) bad('Pokémon não está na sua Coleção.');
    const biome = FARM_BIOMES[body.biome] ? body.biome : bestBiome(typesOf(mon));
    const { prof } = await save(db, user.id, farm => {
      const s = farm.slots.find(x => x.uid === uid);
      if (s) { s.biome = biome; return {}; }
      if (farm.slots.length >= slotsFor(farm.lvl)) bad(`A Fazenda está cheia (${slotsFor(farm.lvl)} vagas). Suba o nível da Fazenda para liberar mais.`);
      farm.slots.push({ uid, biome, happy: 70, t: now, pxp: 0, pres: 0 });
      return {};
    });
    return { farm: view(prof, current(prof, now), user.id) };
  }

  if (body.op === 'farm_remove') {
    let pend = null;
    const { prof } = await save(db, user.id, (farm, cur) => {
      const s = farm.slots.find(x => x.uid === body.uid);
      if (!s) return null;
      pend = s;
      farm.slots = farm.slots.filter(x => x.uid !== body.uid);
      return applyCollect(farm, cur, [s]); // leva o que juntou
    });
    return { farm: view(prof, current(prof, now), user.id), profile: prof, collected: pend ? true : false };
  }

  if (body.op === 'farm_collect') {
    let msgs = [], got = null;
    const { prof } = await save(db, user.id, (farm, cur) => {
      const r = applyCollect(farm, cur, farm.slots);
      msgs = r.msgs; got = r.got;
      return r;
    });
    return { farm: view(prof, current(prof, now), user.id), profile: prof, collected: got, msgs };
  }

  if (body.op === 'farm_care') { // ❤️ carinho em todos (a cada 4 h por Pokémon)
    let n = 0;
    const { prof } = await save(db, user.id, farm => {
      for (const s of farm.slots) {
        if ((s.cared || 0) + CARE_COOLDOWN_H * 3600000 > now) continue;
        s.happy = Math.min(100, (s.happy ?? 70) + CARE_HAPPY); s.cared = now; n++;
      }
      if (!n) return null;
      addFarmXp(farm, 2 * n);
      return {};
    });
    if (!n) bad(`Todos já receberam carinho. Volte em até ${CARE_COOLDOWN_H} h.`);
    return { farm: view(prof, current(prof, now), user.id), cared: n };
  }

  if (body.op === 'farm_feed') { // 🍓 dar Frutinha: felicidade + XP
    const { prof } = await save(db, user.id, farm => {
      const s = farm.slots.find(x => x.uid === body.uid);
      if (!s) bad('Esse Pokémon não está na Fazenda.');
      if ((farm.res.berry || 0) < 1) bad('Sem 🍓 Frutinhas. Pokémon de Planta/Inseto na Floresta produzem.');
      farm.res.berry--;
      s.happy = Math.min(100, (s.happy ?? 70) + FEED_HAPPY);
      s.pxp = (s.pxp || 0) + FEED_XP;
      addFarmXp(farm, 1);
      return {};
    });
    return { farm: view(prof, current(prof, now), user.id) };
  }

  if (body.op === 'farm_sell') { // vender recursos por ouro
    const id = String(body.res || '');
    if (!RESOURCES[id]) bad('Recurso inválido.');
    let qty = 0;
    await save(db, user.id, farm => {
      qty = Math.max(1, Math.min(Number(body.qty) || 1, farm.res[id] || 0));
      if (!(farm.res[id] > 0)) bad('Você não tem esse recurso.');
      farm.res[id] -= qty;
      return {};
    });
    const gold = qty * RESOURCES[id].gold;
    await db.walletAdd(user.id, 0, gold);
    const prof = await db.getProfile(user.id);
    return { farm: view(prof, current(prof, now), user.id), profile: prof, gold };
  }

  if (body.op === 'farm_decor') { // 🎨 decoração (só visual): grátis + compradas na 💎 Loja
    const owned = new Set(myCosmetics(p).owned);
    const list = (Array.isArray(body.decor) ? body.decor : []).slice(0, DECOR_MAX).map(d => ({
      k: String(d?.k || ''), x: Math.max(2, Math.min(98, Number(d?.x) || 50)), y: Math.max(4, Math.min(96, Number(d?.y) || 50))
    })).filter(d => FARM_DECOR[d.k] && (FARM_DECOR[d.k].price === 0 || owned.has(decorItemId(d.k))));
    const { prof } = await save(db, user.id, farm => { farm.decor = list; return {}; });
    return { farm: view(prof, current(prof, now), user.id) };
  }

  bad('Operação da Fazenda inválida.');
}

/** Aplica o XP juntado nos Pokémon da Coleção (pode evoluir) e guarda os recursos. */
function applyCollect(farm, cur, slots) {
  const vault = (cur.vault || []).map(m => ({ ...m }));
  const byId = new Map(vault.map(m => [m.uid, m]));
  const msgs = [];
  const got = { xp: 0, res: {}, levels: 0 };
  for (const s of slots) {
    const mon = byId.get(s.uid);
    if (!mon) continue;
    const xp = Math.floor(s.pxp || 0);
    if (xp > 0 && mon.lvl < FARM_MAX_LEVEL) {
      const before = mon.lvl;
      const hadHp = mon.hp !== undefined;
      mon.xp = Number(mon.xp) || 0;
      if (!hadHp) mon.hp = 1;
      let left = xp;
      while (left > 0 && mon.lvl < FARM_MAX_LEVEL) { // não passa do Nv. 60
        const step = Math.min(left, Math.max(1, xpToNext(mon.lvl) - (mon.xp || 0)));
        msgs.push(...gainXp(mon, step).filter(x => x.includes('evoluiu')));
        left -= step;
      }
      if (!hadHp) delete mon.hp;
      got.levels += mon.lvl - before;
      got.xp += xp;
    }
    s.pxp = (s.pxp || 0) - xp;
    const n = Math.floor(s.pres || 0);
    if (n) {
      const r = s.res || 'berry';
      const room = RES_CAP - (farm.res[r] || 0);
      const add = Math.max(0, Math.min(n, room));
      farm.res[r] = (farm.res[r] || 0) + add;
      got.res[r] = (got.res[r] || 0) + add;
      s.pres -= n; // o que passou do teto se perde (incentivo a coletar)
      addFarmXp(farm, add);
    }
  }
  if (!got.xp && !Object.keys(got.res).length) return { got, msgs };
  return { vault, got, msgs };
}
