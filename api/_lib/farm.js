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
import { CROPS, GOODS, GOODS_CAP, plotsFor, WATER_MULT, GRASS_MULT, WORKER_MULT, HARVEST_XP, BUILDINGS, BUILD_MAX, queueFor, POFFIN_ITEMS, POFFIN_HAPPY, POFFIN_XP, POFFIN_BOND, TORTA_FARM_XP, farmHasType } from '../../shared/data/garden.js';
import { cleanArt, isArtKey, artIndex, ART_MAX } from '../../shared/data/farmart.js';
import { myCosmetics, getShop, equippedSkin } from './shop.js';

let shopItems = []; // vitrine (para a skin do treinador nas listas), recarregada a cada chamada
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
    owner: { id: prof.id, name: prof.trainer_name, avatar: prof.avatar, skin: equippedSkin(prof, shopItems) },
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
    art: farm.art || [],
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
    // 🌱 Horta (visitante também vê, para regar)
    garden: (() => {
      const n = plotsFor(farm.lvl);
      const plots = Array.from({ length: n }, (_, i) => { const pl = (farm.plots || [])[i]; return pl ? { ...pl, ready: pl.readyAt <= Date.now() } : null; });
      return { plots, goods: mine ? farm.goods || {} : undefined, waterAuto: farmHasType(farm, uid => typesOf(vm.get(uid) || { sp: 'x' }), ['water']), grassBoost: farmHasType(farm, uid => typesOf(vm.get(uid) || { sp: 'x' }), ['grass']) };
    })(),
    buildings: mine ? Object.fromEntries(Object.entries(BUILDINGS).map(([id, B]) => {
      const b = farm.buildings?.[id];
      return [id, { lvl: b?.lvl || 0, jobs: (b?.jobs || []).map(j => ({ ...j, ready: j.done <= Date.now() })), worker: farmHasType(farm, uid => typesOf(vm.get(uid) || { sp: 'x' }), B.worker) }];
    })) : undefined,
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

/** 💧 rega os canteiros ainda não regados (−25% no tempo que falta). Devolve quantos. */
function waterAll(farm, now) {
  let n = 0;
  for (const pl of farm.plots || []) {
    if (!pl || pl.watered || pl.readyAt <= now) continue;
    pl.readyAt = now + Math.round((pl.readyAt - now) * WATER_MULT);
    pl.watered = true;
    n++;
  }
  return n;
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
  try { shopItems = (await getShop(db)).items || []; } catch { shopItems = []; }
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
    const top = rows.filter(r => r.stats?.farm?.slots?.length).map(r => ({ id: r.id, name: r.trainer_name, avatar: r.avatar, skin: equippedSkin(r, shopItems), likes: r.stats.farm.likes || 0, lvl: r.stats.farm.lvl || 1, mons: r.stats.farm.slots.length }))
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
      else {
        for (const s of farm.slots) s.happy = Math.min(100, (s.happy ?? 70) + HELP_HAPPY);
        waterAll(farm, now); // 💧 quem ajuda também rega a horta
      }
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
      k: String(d?.k || ''), x: Math.max(2, Math.min(98, Number(d?.x) || 50)), y: Math.max(4, Math.min(96, Number(d?.y) || 50)),
      ...(d?.f ? { f: 1 } : {}), ...(Number(d?.s) && Number(d.s) !== 1 ? { s: Math.max(0.6, Math.min(1.8, Math.round(Number(d.s) * 10) / 10)) } : {})
    })).filter(d => (isArtKey(d.k) ? !!(p.stats?.farm?.art || [])[artIndex(d.k)] : FARM_DECOR[d.k] && (FARM_DECOR[d.k].price === 0 || owned.has(decorItemId(d.k)) || (p.stats?.farm?.craftedDecor || []).includes(d.k))));
    const { prof } = await save(db, user.id, farm => { farm.decor = list; return {}; });
    return { farm: view(prof, current(prof, now), user.id) };
  }

  if (body.op === 'farm_art_save') { // 🖌️ salvar um desenho (pixel art 16×16) num dos 8 espaços
    const i = Number(body.i);
    if (!Number.isInteger(i) || i < 0 || i >= ART_MAX) bad('Espaço inválido.');
    const art = cleanArt(body.art);
    if (!art) bad('Desenho vazio ou inválido.');
    const { prof } = await save(db, user.id, farm => {
      const list = [...(farm.art || [])];
      if (i > list.length) bad('Use o próximo espaço livre.');
      list[i] = art;
      farm.art = list.slice(0, ART_MAX);
      return {};
    });
    return { farm: view(prof, current(prof, now), user.id), message: `🖌️ "${art.n}" salvo! Use em 🎨 Decorar.` };
  }
  if (body.op === 'farm_art_del') { // apaga um desenho (e tira da decoração; os seguintes sobem uma posição)
    const i = Number(body.i);
    const { prof } = await save(db, user.id, farm => {
      const list = [...(farm.art || [])];
      if (!list[i]) bad('Desenho não encontrado.');
      list.splice(i, 1);
      farm.art = list;
      farm.decor = (farm.decor || []).filter(d => d.k !== `art${i}`).map(d => (isArtKey(d.k) && artIndex(d.k) > i ? { ...d, k: `art${artIndex(d.k) - 1}` } : d));
      return {};
    });
    return { farm: view(prof, current(prof, now), user.id), message: '🗑️ Desenho apagado.' };
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
    const ptype = R.out.plate ? String(body.ptype || '') : null; // 🔷 Placa: qual tipo
    if (R.out.plate && !ITEMS[`plate_${ptype}`]) bad('Escolha o tipo da Placa.');
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
        farm.jobs.push({ id: 'j' + now.toString(36) + Math.floor(Math.random() * 1e4).toString(36), recipe: id, start: now, done: now + R.hours * 3600000, ...(mg ? { mega: mg.key } : {}), ...(ptype ? { ptype } : {}) });
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
      got = { recipe: j.recipe, out: R.out.mega ? { bag: { [`ms_${j.mega}`]: 1 } } : R.out.plate ? { bag: { [`plate_${j.ptype}`]: 1 } } : R.out };
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
  // ---------------------------------------------------------------- 🌱 Horta
  if (body.op === 'farm_plant') {
    const crop = String(body.crop || ''), C = CROPS[crop];
    if (!C) bad('Semente inválida.');
    const i = Math.floor(Number(body.plot));
    const vm = vaultMap(p);
    const tOf = uid => typesOf(vm.get(uid) || { sp: 'x' });
    const f0 = current(p, now);
    if (!(i >= 0 && i < plotsFor(f0.lvl))) bad('Canteiro inválido.');
    if ((f0.plots || [])[i]) bad('Esse canteiro já está plantado.');
    if (f0.lvl < C.lvl) bad(`${C.name} libera no Nv. ${C.lvl} da Fazenda.`);
    if ((p.gold || 0) < C.cost) bad(`Precisa de ${C.cost} de ouro para as sementes.`);
    const paid = await db.walletAdd(user.id, 0, -C.cost);
    if (paid === null) bad('Ouro insuficiente.');
    try {
      const { prof } = await save(db, user.id, farm => {
        farm.plots = farm.plots || [];
        if (farm.plots[i]) bad('Esse canteiro já está plantado.');
        let ms = C.hours * 3600000 * (farmHasType(farm, tOf, ['grass']) ? GRASS_MULT : 1);
        const auto = farmHasType(farm, tOf, ['water']);
        if (auto) ms *= WATER_MULT;
        farm.plots[i] = { crop, at: now, readyAt: now + Math.round(ms), watered: auto };
        return {};
      });
      return { farm: view(prof, current(prof, now), user.id), profile: prof, message: `${C.icon} ${C.name} plantado!` };
    } catch (e) { await db.walletAdd(user.id, 0, C.cost); throw e; }
  }
  if (body.op === 'farm_water') {
    let n = 0;
    const { prof } = await save(db, user.id, farm => { n = waterAll(farm, now); if (!n) bad('Nada para regar agora.'); return {}; });
    return { farm: view(prof, current(prof, now), user.id), message: `💧 ${n} canteiro(s) regado(s): crescem 25% mais rápido.` };
  }
  if (body.op === 'farm_harvest') {
    const got = {};
    const rng = createRng(randomSeed());
    const { prof } = await save(db, user.id, farm => {
      farm.goods = farm.goods || {};
      (farm.plots || []).forEach((pl, i) => {
        if (!pl || pl.readyAt > now) return;
        const C = CROPS[pl.crop];
        const q = rng.int(C.yield[0], C.yield[1]);
        farm.goods[pl.crop] = Math.min(GOODS_CAP, (farm.goods[pl.crop] || 0) + q);
        got[pl.crop] = (got[pl.crop] || 0) + q;
        farm.plots[i] = null;
        addFarmXp(farm, HARVEST_XP);
      });
      if (!Object.keys(got).length) bad('Nada pronto para colher.');
      return {};
    });
    return { farm: view(prof, current(prof, now), user.id), message: `🧺 Colheu ${Object.entries(got).map(([k, q]) => `${q}x ${CROPS[k].icon}`).join(' ')}` };
  }
  // ---------------------------------------------------------------- 🏭 Construções
  if (body.op === 'farm_build') { // construir ou melhorar
    const id = String(body.b || ''), B = BUILDINGS[id];
    if (!B) bad('Construção inválida.');
    const f0 = current(p, now);
    const lvl = f0.buildings?.[id]?.lvl || 0;
    if (lvl >= BUILD_MAX) bad('Já está no nível máximo.');
    if (f0.lvl < B.lvl) bad(`${B.name} libera no Nv. ${B.lvl} da Fazenda.`);
    const cost = B.cost[lvl];
    for (const [r, q] of Object.entries(cost)) if (r !== 'gold' && (f0.res[r] || 0) < q) bad(`Faltam recursos: ${q} ${RESOURCES[r]?.icon || r}.`);
    if ((p.gold || 0) < (cost.gold || 0)) bad(`Precisa de ${cost.gold} de ouro.`);
    if (cost.gold && (await db.walletAdd(user.id, 0, -cost.gold)) === null) bad('Ouro insuficiente.');
    try {
      const { prof } = await save(db, user.id, farm => {
        for (const [r, q] of Object.entries(cost)) if (r !== 'gold') { if ((farm.res[r] || 0) < q) bad('Faltam recursos.'); farm.res[r] -= q; }
        farm.buildings = { ...(farm.buildings || {}), [id]: { ...(farm.buildings?.[id] || { jobs: [] }), lvl: lvl + 1 } };
        addFarmXp(farm, 40);
        return {};
      });
      return { farm: view(prof, current(prof, now), user.id), profile: prof, message: lvl ? `${B.icon} ${B.name} subiu para o Nv. ${lvl + 1}!` : `${B.icon} ${B.name} construído!` };
    } catch (e) { if (cost.gold) await db.walletAdd(user.id, 0, cost.gold); throw e; }
  }
  if (body.op === 'farm_bjob') { // começar produção
    const id = String(body.b || ''), B = BUILDINGS[id], R = B?.recipes[String(body.recipe || '')];
    if (!R) bad('Receita inválida.');
    const vm = vaultMap(p);
    const tOf = uid => typesOf(vm.get(uid) || { sp: 'x' });
    const { prof } = await save(db, user.id, farm => {
      const b = farm.buildings?.[id];
      if (!b?.lvl) bad(`Construa o ${B.name} primeiro.`);
      if ((b.jobs || []).length >= queueFor(b.lvl)) bad(`Fila cheia (${queueFor(b.lvl)}). Melhore o ${B.name} para produzir mais de uma vez.`);
      farm.goods = farm.goods || {};
      for (const [g, q] of Object.entries(R.in)) if ((farm.goods[g] || 0) < q) bad(`Faltam ingredientes: ${q}x ${GOODS[g].icon} ${GOODS[g].name}.`);
      for (const [g, q] of Object.entries(R.in)) farm.goods[g] -= q;
      const ms = R.hours * 3600000 * (farmHasType(farm, tOf, B.worker) ? WORKER_MULT : 1);
      b.jobs = [...(b.jobs || []), { id: 'b' + now.toString(36) + Math.floor(Math.random() * 1e4).toString(36), recipe: body.recipe, start: now, done: now + Math.round(ms) }];
      return {};
    });
    return { farm: view(prof, current(prof, now), user.id), message: `${R.icon} ${R.name} em produção!` };
  }
  if (body.op === 'farm_bclaim') { // pegar o que ficou pronto
    const id = String(body.b || ''), B = BUILDINGS[id];
    if (!B) bad('Construção inválida.');
    const got = [];
    const { prof } = await save(db, user.id, farm => {
      const b = farm.buildings?.[id];
      const ready = (b?.jobs || []).filter(j => j.done <= now);
      if (!ready.length) bad('Nada pronto ainda.');
      b.jobs = b.jobs.filter(j => j.done > now);
      farm.goods = farm.goods || {}; farm.items = farm.items || {};
      for (const j of ready) {
        const R = B.recipes[j.recipe];
        if (R.out.goods) for (const [g, q] of Object.entries(R.out.goods)) farm.goods[g] = Math.min(GOODS_CAP, (farm.goods[g] || 0) + q);
        if (R.out.item) farm.items[R.out.item] = (farm.items[R.out.item] || 0) + 1;
        got.push(R.icon);
        addFarmXp(farm, 15);
      }
      return {};
    });
    return { farm: view(prof, current(prof, now), user.id), message: `✅ Pronto: ${got.join(' ')}` };
  }

  if (body.op === 'farm_use') { // usar item da Fazenda
    const it = String(body.item || '');
    if (!FARM_ITEMS[it] && !POFFIN_ITEMS[it]) bad('Item inválido.');
    let msg = '', bondOut = null;
    const { prof } = await save(db, user.id, (farm, cur) => {
      if (!((farm.items || {})[it] > 0)) bad(`Você não tem ${(FARM_ITEMS[it] || POFFIN_ITEMS[it]).name}.`);
      farm.items[it]--;
      if (it === 'ration') { for (const s of farm.slots) s.happy = Math.min(100, (s.happy ?? 70) + RATION_HAPPY); msg = '🥣 Todo mundo feliz!'; }
      if (it === 'fert') { const from = Math.max(now, farm.fert?.until || 0); farm.fert = { from: farm.fert?.until > now ? farm.fert.from : now, until: from + FERT_HOURS * 3600000 }; msg = `🧪 Recursos em dobro por ${FERT_HOURS} h!`; }
      // 🧁 Poffins e Torta (da Cozinha)
      if (it === 'poffin_oran') { for (const s of farm.slots) s.happy = Math.min(100, (s.happy ?? 70) + POFFIN_HAPPY); msg = '🧁 Todo mundo muito feliz!'; }
      if (it === 'poffin_pecha') {
        if (!farm.slots.length) bad('Coloque Pokémon na Fazenda primeiro.');
        const vault = (cur.vault || []).map(m => ({ ...m }));
        const ids = new Set(farm.slots.map(s => s.uid));
        let n = 0;
        for (const mon of vault) {
          if (!ids.has(mon.uid) || mon.lvl >= FARM_MAX_LEVEL) continue;
          const hadHp = mon.hp !== undefined; if (!hadHp) mon.hp = 1;
          mon.xp = Number(mon.xp) || 0;
          gainXp(mon, POFFIN_XP);
          if (mon.lvl > FARM_MAX_LEVEL) mon.lvl = FARM_MAX_LEVEL;
          if (!hadHp) delete mon.hp;
          n++;
        }
        msg = `🍩 +${POFFIN_XP} XP para ${n} Pokémon da Fazenda!`;
        return { vault };
      }
      if (it === 'poffin_razz') {
        const comp = cur.stats?.companion;
        if (!comp || !farm.house) bad('Precisa ter um companheiro morando na 🏡 Casinha.');
        bondOut = comp;
        msg = `🍪 +${POFFIN_BOND} de laço com ${COMPANIONS[comp]?.name || 'o companheiro'}!`;
      }
      if (it === 'torta') { addFarmXp(farm, TORTA_FARM_XP); msg = `🥧 +${TORTA_FARM_XP} de XP da Fazenda!`; }
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
    let prof2 = prof;
    if (bondOut) prof2 = await mutateProfile(db, user.id, cur => ({ stats: { ...(cur.stats || {}), companionBond: { ...(cur.stats?.companionBond || {}), [bondOut]: (cur.stats?.companionBond?.[bondOut] || 0) + POFFIN_BOND } } }));
    return { farm: view(prof2, current(prof2, now), user.id), profile: prof2, message: msg };
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
