// 🌾 Fazenda Pokémon no servidor (ops de /api/profile que começam com "farm_"). Dados em profiles.stats.farm.
import { getSpecies } from '../../shared/data/pokemon.js';
import { gainXp, xpToNext } from '../../shared/rules/monsters.js';
import {
  FARM_BIOMES, RESOURCES, FARM_DECOR, DECOR_MAX, FARM_MAX_LEVEL, CARE_COOLDOWN_H, CARE_HAPPY, FEED_HAPPY, FEED_XP, HELP_HAPPY, RES_CAP,
  newFarm, tickFarm, pendingOf, slotsFor, addFarmXp, bestBiome, brtDay, decorItemId, farmLevelXp
} from '../../shared/data/farm.js';
import { bad, notFound, mutateProfile, getOrCreateProfile } from './core.js';
import { canBreed, makeEgg, hatchFromEgg, eggsDue, EGG_EVERY_H, EGGS_PER_DAY, INCUBATOR_MAX, NATURE_COST, daycareDay } from '../../shared/data/daycare.js';
import { createRng, randomSeed } from '../../shared/rules/rng.js';
import { COMPANIONS, bondLevel } from '../../shared/data/companions.js';
import { COMPANION_DECAY_MULT, COMPANION_CARE_BOND } from '../../shared/data/farm.js';
import { RECIPES, FARM_ITEMS, ARTISAN_LEVELS, artisanOf, benchesFor, CANDY_MAX_LEVEL, FERT_HOURS, RATION_HAPPY, INCENSE_EGGS, INCENSE_MULT, dailyOrders, weekId } from '../../shared/data/workshop.js';
import { addToBag } from './core.js';
import { myCosmetics } from './shop.js';
import { MEGAS, fragItemId } from '../../shared/data/megas.js';
import { ITEMS } from '../../shared/data/items.js';

const typesOf = mon => getSpecies(mon.sp)?.types || ['normal'];
const vaultMap = prof => new Map((prof.vault || []).map(m => [m.uid, m]));
const clone = o => JSON.parse(JSON.stringify(o));

const hashStr = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** 🥚 Creche: põe os ovos que o casal fez desde a última vez (sorteio fixo por casal+hora → igual em toda leitura). */
function tickDaycare(farm, vm, now) {
  const dc = farm.daycare;
  if (!dc?.a || !dc?.b) return;
  const a = vm.get(dc.a), b = vm.get(dc.b);
  const chk = canBreed(a, b);
  if (!chk.ok) { farm.daycare = null; return; } // um dos pais saiu da Coleção
  farm.eggs ||= [];
  for (let guard = 0; guard < 8; guard++) {
    const due = eggsDue(dc, now, 0, farm.eggs.length);
    if (!due) break;
    const laid = dc.since + EGG_EVERY_H * 3600000;
    const day = daycareDay(laid);
    if (farm.eggDay !== day) { farm.eggDay = day; farm.eggCount = 0; }
    dc.since = laid;
    if (farm.eggCount >= EGGS_PER_DAY) continue; // limite do dia: esse ovo não vem
    let natureFrom = dc.natureFrom || null;
    if (natureFrom && (farm.res.crystal || 0) >= NATURE_COST.crystal) farm.res.crystal -= NATURE_COST.crystal; else natureFrom = null;
    const rng = createRng(hashStr(`${dc.a}|${dc.b}|${laid}`));
    const shinyMult = farm.incense > 0 ? INCENSE_MULT : 1;
    if (farm.incense > 0) farm.incense--;
    farm.eggs.push(makeEgg(rng, chk.mother, chk.father, { natureFrom: natureFrom === 'mother' || natureFrom === 'father' ? natureFrom : null, now: laid, shinyMult }));
    farm.eggCount++;
  }
  // incubadora cheia: o relógio do próximo ovo espera (não acumula)
  if (farm.eggs.length >= INCUBATOR_MAX && now - dc.since > EGG_EVERY_H * 3600000) dc.since = now - EGG_EVERY_H * 3600000 + 60000;
}

/** Fazenda atualizada até agora (sem gravar). */
function companionOf(prof, farm) {
  const id = prof.stats?.companion;
  return farm?.house && id && COMPANIONS[id] ? { id, ...COMPANIONS[id] } : null;
}
function current(prof, now = Date.now()) {
  const farm = clone(prof.stats?.farm || newFarm(now));
  const vm = vaultMap(prof);
  const comp = companionOf(prof, farm);
  tickFarm(farm, vm, typesOf, now, comp ? { decayMult: COMPANION_DECAY_MULT, boostTypes: comp.bonus?.types || [] } : {});
  tickDaycare(farm, vm, now);
  return farm;
}

const monBrief = m => m && { uid: m.uid, sp: m.sp, lvl: m.lvl, shiny: !!m.shiny, gender: m.gender || null, nick: m.nick || null, iv: m.iv || null, nature: m.nature || null };

/** O que o cliente precisa para desenhar (dono ou visitante). */
function view(prof, farm, viewerId) {
  const vm = vaultMap(prof);
  void vm;
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
    house: farm.house || null,
    companion: (() => { const c = companionOf(prof, farm); return c ? { id: c.id, name: c.name, sprite: c.sprite, icon: c.icon, types: c.bonus?.types || [], bond: bondLevel(prof.stats?.companionBond?.[c.id] || 0) } : null; })(),
    hasCompanion: mine ? !!(prof.stats?.companion && COMPANIONS[prof.stats.companion]) : undefined,
    daycare: mine && farm.daycare ? (() => {
      const dc = farm.daycare, a = vm.get(dc.a), b = vm.get(dc.b);
      return { a: monBrief(a), b: monBrief(b), natureFrom: dc.natureFrom || null, nextEggIn: Math.max(0, dc.since + EGG_EVERY_H * 3600000 - Date.now()) };
    })() : null,
    eggs: mine ? (farm.eggs || []).map(e => ({ id: e.id, tier: e.tier, readyAt: e.readyAt, ready: e.readyAt <= Date.now(), parentSp: e.parentSp, laid: e.laid })) : undefined,
    eggsToday: mine ? (farm.eggDay === daycareDay() ? farm.eggCount || 0 : 0) : undefined,
    ownedDecor: mine ? Object.keys(FARM_DECOR).filter(k => FARM_DECOR[k].price === 0 || myCosmetics(prof).owned.includes(decorItemId(k)) || (farm.craftedDecor || []).includes(k)) : undefined,
    workshop: mine ? (() => {
      const day = brtDay();
      const art = artisanOf(farm.axp);
      const next = ARTISAN_LEVELS.find(l => l.lvl === art.lvl + 1);
      return {
        axp: farm.axp || 0, level: art, next: next || null, benches: benchesFor(farm.lvl),
        jobs: (farm.jobs || []).map(j => ({ ...j, ready: j.done <= Date.now() })),
        items: farm.items || {}, incense: farm.incense || 0, fert: farm.fert && farm.fert.until > Date.now() ? farm.fert.until : 0,
        orders: dailyOrders(prof.id, day).map(o => ({ ...o, done: (farm.ordersDone?.[day] || []).includes(o.idx) })),
        weekly: Object.fromEntries(Object.entries(farm.weekly || {}).filter(([, w]) => w === weekId()).map(([k]) => [k, true]))
      };
    })() : undefined
  };
}

async function save(db, userId, fn) {
  let out = null;
  const prof = await mutateProfile(db, userId, cur => {
    const farm = current(cur);
    const r = fn(farm, cur);
    if (r === null) return null;
    out = r;
    const st = { ...(cur.stats || {}), farm, ...(r?.bag ? { bag: r.bag } : {}) };
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
    // 🏡 cuidar junto com o companheiro dá laço
    let final = prof, bond = 0;
    const c = companionOf(prof, prof.stats?.farm);
    if (c) {
      bond = COMPANION_CARE_BOND;
      final = await mutateProfile(db, user.id, cur => ({ stats: { ...(cur.stats || {}), companionBond: { ...(cur.stats?.companionBond || {}), [c.id]: (cur.stats?.companionBond?.[c.id] || 0) + bond } } })) || prof;
    }
    return { farm: view(final, current(final, now), user.id), cared: n, bond, companion: c?.name || null };
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
    })).filter(d => FARM_DECOR[d.k] && (FARM_DECOR[d.k].price === 0 || owned.has(decorItemId(d.k)) || (p.stats?.farm?.craftedDecor || []).includes(d.k)));
    const { prof } = await save(db, user.id, farm => { farm.decor = list; return {}; });
    return { farm: view(prof, current(prof, now), user.id) };
  }

  if (body.op === 'farm_daycare') { // 🥚 montar o casal da Creche
    const vm = vaultMap(p);
    const a = vm.get(String(body.a || '')), b = vm.get(String(body.b || ''));
    const chk = canBreed(a, b);
    if (!chk.ok) bad(chk.why);
    const natureFrom = ['mother', 'father'].includes(body.natureFrom) ? body.natureFrom : null;
    const { prof } = await save(db, user.id, farm => {
      const same = farm.daycare && ((farm.daycare.a === a.uid && farm.daycare.b === b.uid) || (farm.daycare.a === b.uid && farm.daycare.b === a.uid));
      farm.daycare = { a: a.uid, b: b.uid, natureFrom, since: same ? farm.daycare.since : now };
      return {};
    });
    return { farm: view(prof, current(prof, now), user.id) };
  }
  if (body.op === 'farm_daycare_clear') {
    const { prof } = await save(db, user.id, farm => { farm.daycare = null; return {}; });
    return { farm: view(prof, current(prof, now), user.id) };
  }
  if (body.op === 'farm_hatch') { // 🐣 chocar um ovo pronto → vai para a Coleção
    let baby = null;
    const prof = await mutateProfile(db, user.id, cur => {
      const farm = current(cur, now);
      const egg = (farm.eggs || []).find(e => e.id === body.id);
      if (!egg) bad('Ovo não encontrado.');
      if (egg.readyAt > now) bad('Esse ovo ainda não está pronto.');
      const cap = 300 + (cur.stats?.vaultBonus || 0);
      if ((cur.vault || []).length >= cap) bad('Sua Coleção está cheia. Solte alguns Pokémon antes de chocar.');
      baby = hatchFromEgg(createRng(randomSeed()), egg, cur.trainer_name);
      farm.eggs = farm.eggs.filter(e => e.id !== egg.id);
      addFarmXp(farm, 10);
      const pd = new Set(cur.pokedex || []);
      pd.add(baby.sp);
      return { vault: [...(cur.vault || []), baby], pokedex: [...pd], stats: { ...(cur.stats || {}), farm } };
    });
    return { farm: view(prof, current(prof, now), user.id), profile: prof, baby };
  }

  if (body.op === 'farm_house') { // 🏡 casinha do companheiro (grátis): colocar/mover/tirar
    const { prof } = await save(db, user.id, farm => {
      farm.house = body.remove ? null : { x: Math.max(8, Math.min(92, Number(body.x) || 50)), y: Math.max(14, Math.min(94, Number(body.y) || 50)) };
      return {};
    });
    return { farm: view(prof, current(prof, now), user.id) };
  }

  // ---------------------------------------------------------------- 🔨 Oficina
  if (body.op === 'farm_craft') {
    const id = String(body.recipe || '');
    const R = RECIPES[id];
    if (!R) bad('Receita inválida.');
    const gold = R.cost.gold || 0;
    // 💎 Megapedra: qual Mega + 10 fragmentos dela na Mochila
    const mg = R.out.mega ? MEGAS[String(body.mega || '')] : null;
    if (R.out.mega && !mg) bad('Escolha qual Megapedra fabricar.');
    const fragId = mg ? fragItemId(mg) : null;
    const checkFrags = bag => { if (mg && ((bag || {})[fragId] || 0) < R.frags) bad(`Faltam fragmentos: precisa de ${R.frags}x ${ITEMS[fragId].name} (você tem ${(bag || {})[fragId] || 0}).`); };
    checkFrags(p.stats?.bag);
    const check = farm => {
      if (artisanOf(farm.axp).lvl < R.lvl) bad(`Precisa ser ${ARTISAN_LEVELS[R.lvl - 1].name} (Nível de Artesão ${R.lvl}).`);
      if ((farm.jobs || []).length >= benchesFor(farm.lvl)) bad(`Todas as bancadas estão ocupadas (${benchesFor(farm.lvl)}). Suba o nível da Fazenda para ter mais.`);
      if (R.week && farm.weekly?.[id] === weekId(now)) bad('Essa receita só pode ser feita 1 vez por semana.');
      for (const [k, q] of Object.entries(R.cost)) if (k !== 'gold' && (farm.res[k] || 0) < q) bad(`Faltam recursos: ${q} ${RESOURCES[k].icon} ${RESOURCES[k].name} (você tem ${farm.res[k] || 0}).`);
    };
    check(current(p, now)); // avisa antes de cobrar o ouro
    if (gold) { const ok = await db.walletAdd(user.id, 0, -gold); if (!ok) bad(`Ouro insuficiente: precisa de 🪙 ${gold}.`); }
    try {
      const { prof } = await save(db, user.id, (farm, cur) => {
        check(farm);
        if (artisanOf(farm.axp).lvl < R.lvl) bad(`Precisa ser ${ARTISAN_LEVELS[R.lvl - 1].name} (Nível de Artesão ${R.lvl}).`);
        farm.jobs ||= [];
        if (farm.jobs.length >= benchesFor(farm.lvl)) bad(`Todas as bancadas estão ocupadas (${benchesFor(farm.lvl)}). Suba o nível da Fazenda para ter mais.`);
        if (R.week && farm.weekly?.[id] === weekId(now)) bad('Essa receita só pode ser feita 1 vez por semana.');
        for (const [k, q] of Object.entries(R.cost)) if (k !== 'gold' && (farm.res[k] || 0) < q) bad(`Faltam recursos: ${q} ${RESOURCES[k].icon} ${RESOURCES[k].name} (você tem ${farm.res[k] || 0}).`);
        for (const [k, q] of Object.entries(R.cost)) if (k !== 'gold') farm.res[k] -= q;
        if (R.week) farm.weekly = { ...(farm.weekly || {}), [id]: weekId(now) };
        farm.jobs.push({ id: 'j' + now.toString(36) + Math.floor(Math.random() * 1e4).toString(36), recipe: id, start: now, done: now + R.hours * 3600000, ...(mg ? { mega: mg.key } : {}) });
        if (mg) { // gasta os fragmentos da Mochila
          const bag = { ...(cur.stats?.bag || {}) };
          checkFrags(bag);
          bag[fragId] -= R.frags; if (!bag[fragId]) delete bag[fragId];
          return { bag };
        }
        return {};
      });
      const fresh = (await db.getProfile(user.id)) || prof;
      return { farm: view(fresh, current(fresh, now), user.id), profile: fresh };
    } catch (e) {
      if (gold) await db.walletAdd(user.id, 0, gold); // devolve o ouro se não deu para fabricar
      throw e;
    }
  }
  if (body.op === 'farm_claim') { // pegar da bancada
    let got = null;
    const { prof } = await save(db, user.id, farm => {
      const j = (farm.jobs || []).find(x => x.id === body.id);
      if (!j) bad('Bancada vazia.');
      if (j.done > now) bad('Ainda fabricando.');
      const R = RECIPES[j.recipe];
      farm.jobs = farm.jobs.filter(x => x.id !== j.id);
      farm.axp = (farm.axp || 0) + R.xp;
      got = { recipe: j.recipe, out: R.out.mega ? { bag: { [`ms_${j.mega}`]: 1 } } : R.out };
      if (R.out.farm) for (const [k, q] of Object.entries(R.out.farm)) farm.items = { ...(farm.items || {}), [k]: ((farm.items || {})[k] || 0) + q };
      if (R.out.decor) farm.craftedDecor = [...new Set([...(farm.craftedDecor || []), R.out.decor])];
      return {};
    });
    let final = prof;
    if (got?.out.bag) final = await mutateProfile(db, user.id, cur => ({ stats: { ...(cur.stats || {}), bag: addToBag(cur.stats?.bag, got.out.bag) } }));
    return { farm: view(final, current(final, now), user.id), profile: final, got };
  }
  if (body.op === 'farm_order') { // 📋 entregar pedido do dia
    const day = brtDay(now);
    const o = dailyOrders(user.id, day)[Number(body.idx)];
    if (!o) bad('Pedido inválido.');
    const { prof } = await save(db, user.id, farm => {
      const done = farm.ordersDone?.[day] || [];
      if (done.includes(o.idx)) bad('Pedido já entregue hoje.');
      for (const [k, q] of Object.entries(o.need)) if ((farm.res[k] || 0) < q) bad(`Faltam ${q} ${RESOURCES[k].icon} ${RESOURCES[k].name}.`);
      for (const [k, q] of Object.entries(o.need)) farm.res[k] -= q;
      farm.ordersDone = { [day]: [...done, o.idx] };
      farm.axp = (farm.axp || 0) + o.xp;
      addFarmXp(farm, 10);
      return {};
    });
    await db.walletAdd(user.id, 0, o.gold);
    let final = prof;
    if (o.bonus) final = await mutateProfile(db, user.id, cur => ({ stats: { ...(cur.stats || {}), bag: addToBag(cur.stats?.bag, o.bonus) } }));
    final = await db.getProfile(user.id) || final;
    return { farm: view(final, current(final, now), user.id), profile: final, reward: { gold: o.gold, xp: o.xp, bonus: o.bonus } };
  }
  if (body.op === 'farm_use') { // usar item da Fazenda
    const it = String(body.item || '');
    if (!FARM_ITEMS[it]) bad('Item inválido.');
    let msg = '';
    const { prof } = await save(db, user.id, (farm, cur) => {
      if (!((farm.items || {})[it] > 0)) bad(`Você não tem ${FARM_ITEMS[it].name}.`);
      farm.items[it]--;
      if (it === 'ration') { for (const s of farm.slots) s.happy = Math.min(100, (s.happy ?? 70) + RATION_HAPPY); msg = '🥣 Todo mundo feliz!'; }
      if (it === 'fert') { const from = Math.max(now, farm.fert?.until || 0); farm.fert = { from: farm.fert?.until > now ? farm.fert.from : now, until: from + FERT_HOURS * 3600000 }; msg = `🧪 Recursos em dobro por ${FERT_HOURS} h!`; }
      if (it === 'incense') { farm.incense = (farm.incense || 0) + INCENSE_EGGS; msg = `🕯️ Próximos ${INCENSE_EGGS} ovos com chance de shiny ×3!`; }
      if (it === 'hatcher') {
        const egg = (farm.eggs || []).find(e => e.id === body.egg) || (farm.eggs || []).find(e => e.readyAt > now);
        if (!egg) bad('Nenhum ovo esperando para chocar.');
        egg.readyAt = now; msg = '🧿 Ovo pronto para chocar!';
      }
      if (it === 'candy') {
        const vault = (cur.vault || []).map(m => ({ ...m }));
        const mon = vault.find(m => m.uid === body.uid);
        if (!mon) bad('Escolha um Pokémon da Coleção.');
        if (mon.lvl >= CANDY_MAX_LEVEL) bad(`O Doce Raro leva até o Nv. ${CANDY_MAX_LEVEL}.`);
        const hadHp = mon.hp !== undefined; if (!hadHp) mon.hp = 1;
        mon.xp = 0;
        const msgs = gainXp(mon, xpToNext(mon.lvl));
        if (!hadHp) delete mon.hp;
        msg = `🍬 ${getSpecies(mon.sp).name} subiu para o Nv. ${mon.lvl}!${msgs.filter(x => x.includes('evoluiu')).map(x => ' ' + x).join('')}`;
        return { vault };
      }
      return {};
    });
    return { farm: view(prof, current(prof, now), user.id), profile: prof, message: msg };
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
