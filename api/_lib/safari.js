// 🌿 v50 — Zona Safári (servidor). Sessão guardada em profile.stats.safari; tudo sorteado aqui (RNG com semente + contador).
import { SAFARI_PRICE, SAFARI_DAILY, SAFARI_BALLS, SAFARI_STEPS, SAFARI_ENCOUNTER, SAFARI_SHINY_MULT, SAFARI_LEVELS, RARITY, ROCK, BAIT, MOOD_TURNS, SAFARI_ZONES, brtDaySafari } from '../../shared/data/safari.js';
import { createRng, randomSeed } from '../../shared/rules/rng.js';
import { createMon, BASE_SHINY_RATE } from '../../shared/rules/monsters.js';
import { getSpecies } from '../../shared/data/pokemon.js';
import { mutateProfile, getOrCreateProfile, collectionMax } from './core.js';

const bad = msg => { const e = new Error(msg); e.status = 400; throw e; };

/** Visão da sessão para o cliente (sem a semente). */
function view(st, prof) {
  const s = st?.safari;
  const day = brtDaySafari();
  const used = st?.safariDay === day ? st?.safariCount || 0 : 0;
  return {
    price: SAFARI_PRICE, daily: SAFARI_DAILY, usedToday: used, gold: prof?.gold ?? null,
    session: s ? { zone: s.zone, balls: s.balls, steps: s.steps, caught: s.caught || [], log: (s.log || []).slice(-6), over: !!s.over,
      enc: s.enc ? { sp: s.enc.mon.sp, shiny: !!s.enc.mon.shiny, lvl: s.enc.mon.lvl, rarity: s.enc.rarity, mood: s.enc.mood || null, moodLeft: s.enc.moodLeft || 0,
        catchPct: Math.round(catchChance(s.enc) * 100), fleePct: Math.round(fleeChance(s.enc) * 100) } : null } : null
  };
}
const catchChance = e => Math.min(0.95, RARITY[e.rarity].catch * (e.mood === 'rock' ? ROCK.catch : e.mood === 'bait' ? BAIT.catch : 1));
const fleeChance = e => Math.min(0.95, RARITY[e.rarity].flee * (e.mood === 'rock' ? ROCK.flee : e.mood === 'bait' ? BAIT.flee : 1));
const rngOf = s => { s.n = (s.n || 0) + 1; return createRng((s.seed + s.n * 7919) >>> 0); };
const name = e => `${getSpecies(e.mon.sp).name}${e.mon.shiny ? ' ✨' : ''}`;

function pickEncounter(rng, zone) {
  const pool = SAFARI_ZONES[zone].pool.filter(([sp]) => getSpecies(sp));
  const [sp, rarity] = rng.weighted(pool.map(e => [e, e[2]]));
  const lvl = rng.int(SAFARI_LEVELS[0], SAFARI_LEVELS[1]);
  const mon = createMon(rng, sp, lvl, { shiny: rng.chance(BASE_SHINY_RATE * SAFARI_SHINY_MULT) });
  return { mon, rarity };
}

/** Depois de uma ação sem captura: o humor passa e o Pokémon pode fugir. */
function afterTurn(rng, s) {
  const e = s.enc;
  if (!e) return;
  if (rng.chance(fleeChance(e))) { s.log.push(`💨 ${name(e)} fugiu!`); s.enc = null; }
  else if (e.mood && --e.moodLeft <= 0) { e.mood = null; e.moodLeft = 0; }
}
function checkOver(s) {
  if (s.balls <= 0 || (s.steps <= 0 && !s.enc)) { s.over = true; s.enc = null; s.log.push(s.balls <= 0 ? '🥎 Acabaram as Safari Balls — fim do passeio!' : '👣 Acabaram os passos — fim do passeio!'); }
}

export async function safariOp(db, user, body) {
  const op = String(body.op || '');
  const p = await getOrCreateProfile(db, user);
  if (op === 'safari_get') return view(p.stats, p);

  if (op === 'safari_enter') {
    const zone = String(body.zone || '');
    if (!SAFARI_ZONES[zone]) bad('Zona inválida.');
    if (p.stats?.safari && !p.stats.safari.over) bad('Você já está na Zona Safári — termine o passeio atual.');
    const day = brtDaySafari();
    const used = p.stats?.safariDay === day ? p.stats?.safariCount || 0 : 0;
    if (used >= SAFARI_DAILY) bad(`Você já entrou ${SAFARI_DAILY}× hoje. Volte amanhã!`);
    if ((p.gold || 0) < SAFARI_PRICE) bad(`A entrada custa 🪙 ${SAFARI_PRICE}.`);
    const paid = await db.walletAdd(user.id, 0, -SAFARI_PRICE);
    if (paid === null) bad('Ouro insuficiente.');
    try {
      const prof = await mutateProfile(db, user.id, cur => {
        const st = { ...(cur.stats || {}) };
        const u = st.safariDay === day ? st.safariCount || 0 : 0;
        if (u >= SAFARI_DAILY) bad('Limite de entradas de hoje.');
        st.safariDay = day; st.safariCount = u + 1;
        st.safari = { zone, balls: SAFARI_BALLS, steps: SAFARI_STEPS, seed: randomSeed(), n: 0, enc: null, caught: [], log: [`${SAFARI_ZONES[zone].icon} Bem-vindo à Zona Safári — ${SAFARI_ZONES[zone].name}! Você tem ${SAFARI_BALLS} Safari Balls e ${SAFARI_STEPS} passos.`] };
        return { stats: st };
      });
      return view(prof.stats, prof);
    } catch (e) { await db.walletAdd(user.id, 0, SAFARI_PRICE); throw e; }
  }

  if (!['safari_step', 'safari_ball', 'safari_bait', 'safari_rock', 'safari_run', 'safari_leave'].includes(op)) bad('Operação da Safári inválida.');
  let caughtMon = null;
  const prof = await mutateProfile(db, user.id, cur => {
    const st = { ...(cur.stats || {}) };
    const s = st.safari ? { ...st.safari, log: [...(st.safari.log || [])], caught: [...(st.safari.caught || [])], enc: st.safari.enc ? { ...st.safari.enc } : null } : null;
    if (!s) bad('Entre na Zona Safári primeiro.');
    if (op === 'safari_leave') { delete st.safari; return { stats: st }; }
    if (s.over) bad('O passeio acabou. Saia e entre de novo para outro.');
    const rng = rngOf(s);
    const out = { stats: st };
    if (op === 'safari_step') {
      if (s.enc) bad('Tem um Pokémon na sua frente!');
      if (s.steps <= 0) bad('Acabaram os passos.');
      s.steps--;
      if (rng.chance(SAFARI_ENCOUNTER)) { s.enc = pickEncounter(rng, s.zone); s.log.push(`🌿 Um ${name(s.enc)} (Nv. ${s.enc.mon.lvl}) apareceu! — ${RARITY[s.enc.rarity].name}`); }
      else s.log.push(rng.pick(['👣 Nada por aqui...', '👣 Só o vento na grama.', '👣 Pegadas... mas nada.', '👣 Um barulho longe.']));
    } else {
      const e = s.enc;
      if (!e) bad('Nenhum Pokémon na frente.');
      if (op === 'safari_run') { s.log.push(`🏃 Você deixou ${name(e)} para trás.`); s.enc = null; }
      if (op === 'safari_rock') { e.mood = 'rock'; e.moodLeft = MOOD_TURNS; s.log.push(`🪨 ${name(e)} ficou bravo! (mais fácil de capturar, mas pode fugir)`); afterTurn(rng, s); }
      if (op === 'safari_bait') { e.mood = 'bait'; e.moodLeft = MOOD_TURNS; s.log.push(`🍓 ${name(e)} está comendo a isca... (fica mais tempo, mas é mais difícil de capturar)`); afterTurn(rng, s); }
      if (op === 'safari_ball') {
        if (s.balls <= 0) bad('Sem Safari Balls.');
        s.balls--;
        if (rng.chance(catchChance(e))) {
          const cap = collectionMax(cur);
          if ((cur.vault || []).length >= cap) bad('Sua Coleção está cheia — solte alguns Pokémon antes de capturar.');
          caughtMon = { ...e.mon, ot: cur.trainer_name, caughtAt: Date.now(), safari: true };
          delete caughtMon.hp;
          s.caught.push({ sp: e.mon.sp, shiny: !!e.mon.shiny, lvl: e.mon.lvl, rarity: e.rarity });
          s.log.push(`🎉 Pegou! ${name(e)} foi para a sua Coleção.`);
          s.enc = null;
          out.vault = [...(cur.vault || []), caughtMon];
          out.pokedex = [...new Set([...(cur.pokedex || []), e.mon.sp])];
          out.pokedex_seen = [...new Set([...(cur.pokedex_seen || []), e.mon.sp])];
          if (e.mon.shiny) st.shinyDex = [...new Set([...(st.shinyDex || []), e.mon.sp])];
        } else { s.log.push(`🥎 Quase! ${name(e)} escapou da bola.`); afterTurn(rng, s); }
      }
    }
    if (s.enc) out.pokedex_seen = [...new Set([...(out.pokedex_seen || cur.pokedex_seen || []), s.enc.mon.sp])];
    checkOver(s);
    s.log = s.log.slice(-30);
    st.safari = s;
    return out;
  });
  return { ...view(prof.stats, prof), caught: caughtMon ? { sp: caughtMon.sp, shiny: !!caughtMon.shiny, lvl: caughtMon.lvl } : null, profile: prof };
}
