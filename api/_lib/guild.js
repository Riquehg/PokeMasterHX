// 🏟️ v65 — Guildas (servidor). Registro em game_config 'guilds' = { g: { [id]: { id, name, tag, emblem, owner, members: [uid], at } } }.
// O membro guarda stats.guild = id e stats.gw = pontos da semana (shared/data/guilds.js). O ranking é calculado quando
// alguém abre a tela, com uma consulta pequena (só as colunas guild e gw de cada perfil) — sem cron, para poupar a cota.
import { bad, mutateProfile, getOrCreateProfile } from './core.js';
import { GUILD_MAX, GUILD_PRICE, GUILD_PRIZE, GUILD_EMBLEMS, weekKey, memberPts, cleanGuildName, cleanTag } from '../../shared/data/guilds.js';

const KEY = 'guilds';
const load = async db => { const c = await db.getConfig(KEY); return c && typeof c === 'object' && c.g ? c : { g: {} }; };
const saveReg = (db, reg) => db.setConfig(KEY, reg);
const newId = () => Math.random().toString(36).slice(2, 9);
const ONLINE_MS = 150_000;

async function ranking(db, reg, now) {
  const wk = weekKey(now);
  const rows = await db.listProfiles(400, { stats: ['guild', 'gw'] });
  const byGuild = {};
  for (const r of rows) {
    const gid = r.stats?.guild;
    if (!gid || !reg.g[gid]?.members.includes(r.id)) continue;
    (byGuild[gid] ||= []).push(r);
  }
  const list = Object.values(reg.g).map(g => {
    const ms = byGuild[g.id] || [];
    return { id: g.id, name: g.name, tag: g.tag, emblem: g.emblem, members: g.members.length,
      pts: ms.reduce((a, r) => a + memberPts(r.stats, wk), 0), last: ms.reduce((a, r) => a + memberPts(r.stats, wk - 1), 0) };
  });
  const rank = [...list].sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  const champ = [...list].filter(g => g.last > 0).sort((a, b) => b.last - a.last)[0] || null;
  return { wk, rank, champ, byGuild };
}

export async function guildOp(db, user, body) {
  const now = Date.now();
  const op = body.op;
  const reg = await load(db);
  const prof = await getOrCreateProfile(db, user);
  const myGid = prof.stats?.guild && reg.g[prof.stats.guild]?.members.includes(user.id) ? prof.stats.guild : null;

  if (op === 'guild_get') {
    const { wk, rank, champ, byGuild } = await ranking(db, reg, now);
    let mine = null;
    if (myGid) {
      const g = reg.g[myGid];
      const rows = byGuild[myGid] || [];
      const missing = g.members.filter(id => !rows.some(r => r.id === id));
      const extra = missing.length ? await db.getProfilesByIds(missing) : [];
      const all = [...rows, ...extra];
      mine = { ...g, members: g.members.map(id => { const r = all.find(x => x.id === id); return r ? { id, name: r.trainer_name || 'Treinador', avatar: r.avatar || 1,
        online: !!r.last_seen && now - new Date(r.last_seen).getTime() < ONLINE_MS, pts: memberPts(r.stats, wk), last: memberPts(r.stats, wk - 1), owner: id === g.owner } : { id, name: '?', pts: 0, last: 0 }; })
        .sort((a, b) => b.pts - a.pts), pos: rank.findIndex(x => x.id === myGid) + 1 };
    }
    const canClaim = !!(champ && myGid === champ.id && prof.stats?.gwClaim !== wk - 1);
    return { guild: mine, rank: rank.slice(0, 30), champ, canClaim, wk, price: GUILD_PRICE, prize: GUILD_PRIZE, max: GUILD_MAX, emblems: GUILD_EMBLEMS, gold: prof.gold || 0 };
  }

  if (op === 'guild_create') {
    if (myGid) bad('Você já está numa guilda. Saia dela antes.');
    const name = cleanGuildName(body.name), tag = cleanTag(body.tag);
    if (name.length < 3) bad('O nome da guilda precisa de pelo menos 3 letras.');
    if (tag.length < 2) bad('A sigla precisa de 2 a 4 letras/números.');
    if (Object.values(reg.g).some(g => g.name.toLowerCase() === name.toLowerCase() || g.tag === tag)) bad('Já existe uma guilda com esse nome ou sigla.');
    if (Object.keys(reg.g).length >= 200) bad('Limite de guildas atingido.');
    const emblem = GUILD_EMBLEMS.includes(body.emblem) ? body.emblem : GUILD_EMBLEMS[0];
    const paid = await db.walletAdd(user.id, 0, -GUILD_PRICE);
    if (paid === null) bad(`Fundar uma guilda custa 🪙 ${GUILD_PRICE}.`);
    const id = newId();
    reg.g[id] = { id, name, tag, emblem, owner: user.id, members: [user.id], at: now };
    await saveReg(db, reg);
    await mutateProfile(db, user.id, cur => ({ stats: { ...(cur.stats || {}), guild: id } }));
    return { ok: true, message: `🏟️ Guilda ${emblem} ${name} [${tag}] fundada!` };
  }

  if (op === 'guild_join') {
    if (myGid) bad('Você já está numa guilda.');
    const g = reg.g[String(body.id || '')];
    if (!g) bad('Guilda não encontrada.');
    if (g.members.length >= GUILD_MAX) bad(`A guilda está cheia (${GUILD_MAX}).`);
    g.members.push(user.id);
    await saveReg(db, reg);
    await mutateProfile(db, user.id, cur => ({ stats: { ...(cur.stats || {}), guild: g.id } }));
    return { ok: true, message: `${g.emblem} Você entrou na guilda ${g.name}!` };
  }

  if (op === 'guild_leave' || op === 'guild_kick') {
    if (!myGid) bad('Você não está numa guilda.');
    const g = reg.g[myGid];
    const target = op === 'guild_kick' ? String(body.userId || '') : user.id;
    if (op === 'guild_kick' && g.owner !== user.id) bad('Só o líder da guilda pode remover membros.');
    if (op === 'guild_kick' && target === user.id) bad('Use "Sair da guilda".');
    if (!g.members.includes(target)) bad('Esse treinador não está na guilda.');
    g.members = g.members.filter(id => id !== target);
    if (!g.members.length) delete reg.g[myGid];
    else if (g.owner === target) g.owner = g.members[0];
    await saveReg(db, reg);
    await mutateProfile(db, target, cur => { const st = { ...(cur.stats || {}) }; delete st.guild; return { stats: st }; });
    return { ok: true, message: op === 'guild_kick' ? 'Membro removido.' : 'Você saiu da guilda.' };
  }

  if (op === 'guild_claim') {
    const { wk, champ } = await ranking(db, reg, now);
    if (!champ || champ.id !== myGid) bad('Só a guilda campeã da semana passada resgata o prêmio.');
    let ok = false;
    await mutateProfile(db, user.id, cur => {
      if (cur.stats?.gwClaim === wk - 1) bad('Você já resgatou o prêmio desta semana.');
      ok = true;
      return { stats: { ...(cur.stats || {}), gwClaim: wk - 1 } };
    });
    if (ok) await db.walletAdd(user.id, GUILD_PRIZE, 0);
    return { ok: true, message: `👑 Guilda campeã! +${GUILD_PRIZE} 💎` };
  }
  bad('Operação de guilda inválida.');
}
