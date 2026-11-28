// 🏟️ v65 — Guildas (cliente): fundar, entrar, membros, ranking semanal e prêmio da guilda campeã.
import { api } from '../api.js';
import { esc, toast, openModal, setModalBody, bindActions } from './dom.js';
import { avatarUrl } from '../config.js';
import { GUILD_POINTS } from '../../shared/data/guilds.js';

export async function openGuild(profile, onProfile) {
  let data = null, emblem = null;
  const ov = openModal('guild', '🛡️ Guildas', '<p class="muted"><span class="spinner"></span> Carregando…</p>', { wide: true });
  const P = GUILD_POINTS;
  const how = `<details class="hub-info"><summary>ℹ️ Como ganhar Pontos de Guilda</summary><div class="tiny muted">
    Cada partida salva: ${P.match} · cada insígnia: ${P.badge} · cada captura: ${P.capture} (até 20) · vitória (sozinho ou em time): ${P.win} · 🐉 Raid em Grupo vencida: ${P.raid} · vitória na 🗼 Torre: ${P.tower}.
    O ranking vira toda segunda-feira. Os membros da guilda campeã da semana passada resgatam ${data?.prize || 20} 💎 (só cosmético).</div></details>`;
  const rankHtml = () => `<h4 style="margin:10px 0 4px">🏆 Ranking da semana</h4>
    ${data.champ ? `<p class="small">👑 Campeã da semana passada: <b>${esc(data.champ.emblem)} ${esc(data.champ.name)} [${esc(data.champ.tag)}]</b> (${data.champ.last} pts)</p>` : ''}
    <div class="list" style="max-height:320px">${data.rank.length ? data.rank.map((g, i) => `<div class="list-item"><b style="width:26px;text-align:center">${i + 1}º</b>
      <span style="font-size:22px">${esc(g.emblem)}</span><div class="grow"><b>${esc(g.name)}</b> <span class="chip">${esc(g.tag)}</span><div class="tiny muted">${g.members}/${data.max} membros</div></div>
      <b>${g.pts} pts</b>${!data.guild && g.members < data.max ? ` <button class="btn sm green" data-act="join" data-id="${esc(g.id)}">Entrar</button>` : ''}</div>`).join('') : '<p class="muted small">Nenhuma guilda ainda. Funde a primeira!</p>'}</div>`;
  const render = () => {
    if (data.guild) {
      const g = data.guild;
      const me = g.members.find(m => m.id === profile?.id);
      const total = g.members.reduce((a, m) => a + m.pts, 0);
      return `<div class="gd-head"><span class="gd-emb">${esc(g.emblem)}</span><div class="grow"><h3 style="margin:0">${esc(g.name)} <span class="chip gold">${esc(g.tag)}</span></h3>
        <div class="small">${g.pos ? `${g.pos}º no ranking` : 'sem posição'} · <b>${total}</b> pts nesta semana · ${g.members.length}/${data.max} membros</div></div></div>
        ${data.canClaim ? `<button class="btn primary block" data-act="claim">👑 Resgatar prêmio da guilda campeã (+${data.prize} 💎)</button>` : ''}
        <h4 style="margin:10px 0 4px">👥 Membros</h4>
        <div class="list">${g.members.map(m => `<div class="list-item"><img class="avatar sm" src="${avatarUrl(m.avatar)}" alt=""><div class="grow"><b>${esc(m.name)}</b>${m.owner ? ' <span class="chip gold">líder</span>' : ''}${m.online ? ' <span class="chip green">online</span>' : ''}
          <div class="tiny muted">semana passada: ${m.last} pts</div></div><b>${m.pts} pts</b>${g.owner === profile?.id && m.id !== profile?.id ? ` <button class="btn sm red" data-act="kick" data-id="${esc(m.id)}" title="Remover">✕</button>` : ''}</div>`).join('')}</div>
        ${how}${rankHtml()}
        <button class="btn ghost" data-act="leave" style="margin-top:8px">🚪 Sair da guilda${me?.owner && g.members.length > 1 ? ' (a liderança passa para outro membro)' : ''}</button>`;
    }
    const em = emblem || data.emblems[0];
    return `<p class="small muted">Guildas reúnem até ${data.max} treinadores. Tudo o que vocês jogam na semana soma pontos para o ranking — a guilda campeã ganha 💎 para cada membro.</p>
      <div class="card col" style="margin:8px 0"><b>🛠️ Fundar uma guilda (🪙 ${data.price})</b>
        <div class="grid2"><div class="field"><label>Nome</label><input class="input" id="gd-name" maxlength="24" placeholder="Os Mestres de Kanto"></div>
        <div class="field"><label>Sigla (2–4)</label><input class="input" id="gd-tag" maxlength="4" placeholder="MK" style="text-transform:uppercase"></div></div>
        <div class="row wrap" style="gap:4px">${data.emblems.map(e => `<button class="btn sm ${e === em ? 'primary' : ''}" data-act="emb" data-e="${esc(e)}">${esc(e)}</button>`).join('')}</div>
        <button class="btn primary" data-act="create" ${(data.gold || 0) >= data.price ? '' : 'disabled'} style="margin-top:6px">🏟️ Fundar por 🪙 ${data.price}</button></div>
      ${how}${rankHtml()}`;
  };
  const load = async () => { try { data = await api('feed', { op: 'guild_get' }); setModalBody('guild', render()); } catch (e) { setModalBody('guild', `<p class="bad">${esc(e.message)}</p>`); } };
  const run = async body => {
    try { const r = await api('feed', body); if (r.message) toast(r.message, 'good'); if (r.profile) onProfile?.(r.profile); await load(); }
    catch (e) { toast(e.message, 'bad'); }
  };
  bindActions(ov, {
    emb: d => { emblem = d.e; setModalBody('guild', render()); },
    create: () => run({ op: 'guild_create', name: ov.querySelector('#gd-name').value, tag: ov.querySelector('#gd-tag').value, emblem: emblem || data.emblems[0] }),
    join: d => run({ op: 'guild_join', id: d.id }),
    leave: () => { if (confirm('Sair da guilda?')) run({ op: 'guild_leave' }); },
    kick: d => { if (confirm('Remover este membro da guilda?')) run({ op: 'guild_kick', userId: d.id }); },
    claim: () => run({ op: 'guild_claim' })
  });
  await load();
}
