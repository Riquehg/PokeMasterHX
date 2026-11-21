// ⚽ Liga das Séries: tabela da série, time de defesa e desafios (duelo 1x1 contra a defesa de quem está offline).
import { getSpecies } from '../../shared/data/pokemon.js';
import { api } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { monSprite, avatarUrl } from '../config.js';
import { CRESTS, CREST_COLORS, SERIES, trophyLabel, seasonId } from '../../shared/data/series.js';
import { ITEMS } from '../../shared/data/items.js';

export const crest = (t, size = 26) => `<span class="se-crest" style="--cc:${t?.color || '#3d7fe0'};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px">${t?.crest || '⚽'}</span>`;

/** 🏆 Sala de Troféus (Liga das Séries). */
export function trophyRoomHtml(trophies = []) {
  if (!trophies.length) return '<div class="center muted" style="padding:20px">Nenhum troféu ainda. Termine em 1º ou 2º na sua série no fim do mês para ganhar um. 🏆</div>';
  return `<div class="tr-grid">${trophies.map(t => `<div class="tr-card ${t.pos === 1 ? 'gold' : 'silver'}" style="--sc:${SERIES[t.div]?.color || '#c8a24a'}">
    <div class="tr-cup">${t.pos === 1 ? '🏆' : '🥈'}</div><b>${esc(trophyLabel(t))}</b><span class="tiny muted">${esc(t.seasonName || t.season)}</span></div>`).join('')}</div>`;
}
export function openTrophies(profile) {
  const t = profile?.stats?.trophies || [];
  openModal('trophies', `🏆 Sala de Troféus (${t.length})`, trophyRoomHtml(t), { wide: true });
}

/** 🏁 Janela "Resultado da temporada" (uma vez por temporada). */
export function showSeasonResult(prev) {
  if (!prev || prev.seen) return;
  const from = SERIES[prev.div] || SERIES[0], to = SERIES[prev.newDiv] || from;
  const moved = prev.newDiv > prev.div ? 'up' : prev.newDiv < prev.div ? 'down' : 'stay';
  const items = prev.items ? Object.entries(prev.items).map(([id, q]) => `${q}x ${esc(ITEMS[id]?.name || id)}`).join(' · ') : '';
  const body = `<div class="sr-box" style="--sc:${to.color}">
      <div class="sr-pos">${prev.pos ? `${prev.pos}º` : '—'}</div>
      <div class="small muted">${esc(from.name)}${prev.total ? ` · de ${prev.total} times` : ''}</div>
      <div class="sr-line">${prev.pts} pts · ${prev.v}V ${prev.d}D · saldo ${prev.sp >= 0 ? '+' : ''}${prev.sp}</div>
      <div class="sr-move ${moved}">${moved === 'up' ? `⬆️ Subiu para a ${esc(to.name)}!` : moved === 'down' ? `⬇️ Caiu para a ${esc(to.name)}` : `➡️ Continua na ${esc(to.name)}`}</div>
      ${prev.trophy ? `<div class="sr-cup">${prev.trophy === 1 ? '🏆 CAMPEÃO!' : '🥈 VICE-CAMPEÃO!'}<span class="tiny">O troféu foi para a sua Sala de Troféus.</span></div>` : ''}
      ${prev.prize || items || prev.mythical ? `<div class="sr-prizes"><b>Prêmios</b>${prev.prize ? `<span>💎 ${prev.prize}</span>` : ''}${items ? `<span>🎒 ${items}</span>` : ''}${prev.mythical ? `<span>🌟 Pokémon Mítico${typeof prev.mythical === 'string' ? `: ${esc(getSpecies(prev.mythical)?.name || prev.mythical)}` : ''} (na Coleção)</span>` : ''}</div>` : ''}
      <p class="small muted" style="margin-top:8px">Nova temporada já começou — todo mundo zerado. Bora!</p></div>`;
  openModal('season-result', `🏁 ${esc(prev.seasonName || 'Fim de temporada')}`, body);
  api('match', { op: 'serie_seen' }).catch(() => {});
}

/** No menu: se a temporada virou, vira a Série do jogador (fecha a temporada se ninguém fechou ainda) e mostra o resultado. */
export async function checkSeasonResult(profile) {
  const S = profile?.stats?.serie;
  if (!S) return;
  if (S.season === seasonId() && S.prev && !S.prev.seen) return showSeasonResult(S.prev);
  if (S.season !== seasonId()) {
    try { const r = await api('match', { op: 'serie_get' }); showSeasonResult(r.serie?.prev); } catch { /* tenta na próxima */ }
  }
}

const mini = m => `<img class="se-mini" src="${monSprite({ sp: m.sp, shiny: m.shiny })}" alt="" title="${esc(getSpecies(m.sp)?.name || m.sp)} Nv.${m.lvl}">`;

export async function openSeries(ctx, profile) {
  let data = null, tab = 'tabela', picking = null, teamDraft = null; // picking = { kind: 'defense' | 'attack', target, picks: [] }
  const vault = [...(profile?.vault || [])].sort((a, b) => b.lvl - a.lvl);
  const ov = openModal('series', '⚽ Liga das Séries', '<span class="spinner"></span>', { wide: true });

  const head = () => {
    const S = data.serie, me = data.table.find(r => r.me);
    return `<div class="se-head" style="--sc:${S.info.color}">
      <div class="se-badge">${S.team ? crest(S.team, 44) : S.info.icon}</div>
      <div class="grow">${S.team ? `<b>${esc(S.team.name)}</b> · ` : ''}<b class="se-title">${S.info.icon} ${esc(S.info.name)}</b> <span class="tiny muted">${esc(S.seasonName)}</span>
        <div class="small">${me ? `<b>${me.pos}º</b> de ${data.table.length} · <b>${me.pts}</b> pts · ${me.v}V ${me.d}D · saldo ${me.sp >= 0 ? '+' : ''}${me.sp} · 🛡️ ${me.dv}/${me.dv + me.dd}` : 'Inscreva o seu time de defesa para entrar na tabela.'}</div></div>
      <div class="se-left" title="Ataques de hoje"><b>${S.left}</b><span class="tiny">ataques hoje</span></div></div>`;
  };

  const tableView = () => {
    const S = data.serie, foes = S.foesToday || [];
    return `<div class="se-legend tiny">${S.div < 3 ? `<span class="z up"></span> sobe para a ${data.series[S.div + 1].name} &nbsp; ` : '<span class="z up"></span> título &nbsp; '}${S.div > 0 ? '<span class="z down"></span> cai &nbsp; ' : ''}🏆 troféus</div>
      <div class="se-table-wrap"><table class="score se-table"><tr><th>#</th><th>Time</th><th title="Pontos">P</th><th title="Ataques">J</th><th>V</th><th>D</th><th title="Saldo de Pokémon">SP</th><th title="Defesas seguradas / ataques recebidos">🛡️</th><th>Defesa</th><th></th></tr>
      ${data.table.map(r => `<tr class="${r.me ? 'me' : ''} ${r.zone ? 'z-' + r.zone : ''}"><td><b>${r.pos}</b></td>
        <td class="se-name">${crest(r.club)}<span class="se-tn"><b>${esc(r.club?.name || r.name)}</b>${r.me ? ' <span class="se-you">VOCÊ</span>' : ''}${r.trophies ? ` <span class="tiny" title="Troféus">🏆${r.trophies}</span>` : ''}<span class="tiny muted"><img class="avatar xs" src="${avatarUrl(r.avatar || 1, r.skin)}" alt=""> ${esc(r.name)}</span></span></td>
        <td><b>${r.pts}</b></td><td>${r.j}</td><td>${r.v}</td><td>${r.d}</td><td>${r.sp >= 0 ? '+' : ''}${r.sp}</td><td>${r.dv}/${r.dv + r.dd}</td>
        <td class="se-def">${(r.defense || []).map(mini).join('')}</td>
        <td>${r.me ? '' : `<button class="btn sm ${foes.includes(r.id) ? '' : 'red'}" data-act="atk" data-id="${esc(r.id)}" ${!S.defense.length || S.left <= 0 || foes.includes(r.id) ? 'disabled' : ''}>${foes.includes(r.id) ? '✔<span class="se-bt"> hoje</span>' : '⚔️<span class="se-bt"> Desafiar</span>'}</button>`}</td></tr>`).join('')}</table></div>`;
  };

  const teamView = () => {
    const S = data.serie;
    const t = teamDraft || S.team || { name: '', crest: CRESTS[0], color: CREST_COLORS[5] };
    teamDraft = t;
    return `<div class="se-team card"><div class="row" style="gap:10px;align-items:center">${crest(t, 54)}<div class="grow">
        <label class="tiny muted">Nome do time</label><input class="input" id="se-tname" maxlength="22" value="${esc(t.name)}" placeholder="Ex.: Trovão FC"></div></div>
      <div class="tiny muted" style="margin-top:6px">Escudo</div><div class="se-crests">${CRESTS.map(c => `<button class="se-cbtn ${t.crest === c ? 'on' : ''}" data-act="crest" data-v="${c}">${c}</button>`).join('')}</div>
      <div class="tiny muted">Cor</div><div class="se-crests">${CREST_COLORS.map(c => `<button class="se-color ${t.color === c ? 'on' : ''}" style="background:${c}" data-act="ccolor" data-v="${c}"></button>`).join('')}</div>
      <button class="btn primary" data-act="save-team" style="margin-top:8px">💾 Salvar time</button></div>`;
  };

  const defenseView = () => {
    const S = data.serie;
    return teamView() + `<h3 style="margin-top:12px">🛡️ Time de defesa</h3><p class="small muted">Seu time de defesa joga por você quando alguém te desafia (a CPU controla). Cada defesa segurada vale <b>+1 ponto</b>, mesmo com você offline. Nível limitado a ${data.rules.cap}.</p>
      <div class="row" style="gap:6px;margin:6px 0">${S.defenseMons.length ? S.defenseMons.map(m => `<div class="se-defmon">${mini(m)}<span class="tiny">${esc(getSpecies(m.sp)?.name)} Nv.${m.lvl}</span></div>`).join('') : '<span class="muted">Nenhum ainda.</span>'}</div>
      <button class="btn primary" data-act="pick-def">🛡️ ${S.defense.length ? 'Trocar' : 'Escolher'} time de defesa</button>
      ${(S.log || []).length ? `<h3 style="margin-top:12px">Últimos jogos</h3><div class="list">${S.log.map(l => `<div class="list-item small">${l.kind === 'def' ? '🛡️' : '⚔️'} ${l.kind === 'def' ? `${esc(l.foe)} atacou sua defesa` : `Você x ${esc(l.foe)}`} —
        <b style="color:${l.win ? '#8ff0bd' : '#ff9b9e'}">${l.win ? (l.kind === 'def' ? 'defesa segurou (+1)' : 'vitória (+3)') : (l.kind === 'def' ? 'defesa caiu' : 'derrota')}</b> <span class="tiny muted">${l.kos}x${l.lost} · ${new Date(l.at).toLocaleString('pt-BR')}</span></div>`).join('')}</div>` : ''}`;
  };

  const rulesView = () => `<div class="small" style="line-height:1.6">
      <p>⚽ Como no Brasileirão: <b>Série D → C → B → A</b>, uma temporada por mês. Todo mundo começa na Série D.</p>
      <p>⚔️ <b>Ataque:</b> escolha um adversário da sua série e jogue um duelo 1x1 — você contra ele — com times de ${data.rules.team} Pokémon (Nv. máx. ${data.rules.cap}) contra o time de defesa dele. Vitória = <b>+3 pontos</b>. Até <b>${data.rules.daily} ataques por dia</b> e 1 contra o mesmo adversário por dia.</p>
      <p>🛡️ <b>Defesa:</b> quando te desafiam, o seu time de defesa joga sozinho. Segurou = <b>+1 ponto</b> (não precisa estar online).</p>
      <p>📊 Desempate: pontos, vitórias, saldo de Pokémon (derrubados − perdidos), menos jogos.</p>
      <p>🏁 <b>Entrou com a temporada andando?</b> Você começa com os <b>pontos de largada</b> (os pontos do 16º colocado no dia da inscrição), para não entrar dezenas de pontos atrás.${data.serie.start ? ` Você recebeu <b>${data.serie.start}</b>.` : ''}</p>
      <p>🕛 A temporada vira à meia-noite (horário de Brasília) do dia 1, automaticamente. Os ataques do dia renovam à meia-noite.</p>
      <p>👥 Cada série tem ${data.rules.slots} times. Dê nome e escudo ao seu em ⚽ Meu time.</p>
      <p>🏁 <b>Fim do mês:</b> os ${data.rules.up} primeiros sobem e os ${data.rules.down} últimos caem (a Série D não cai, a A não sobe).</p>
      <p>🏆 <b>1º e 2º</b> ganham troféu para a Sala de Troféus e um prêmio especial da ${esc(data.serie.info.name)}: 1º ${esc(data.rules.items[0])} · 2º ${esc(data.rules.items[1])}. Pódio também ganha 💎 (${data.rules.prize.map((p, i) => `${i + 1}º ${p}`).join(' · ')}). <b>Campeão da Série A ganha também um Pokémon Mítico 🌟</b>.</p>
      ${data.last ? `<p>🏆 Campeões de ${esc(data.last.seasonName)}: ${Object.entries(data.last.champions || {}).map(([d, n]) => `${data.series[d].name}: ${esc(n[0] || '—')}`).join(' · ') || '—'}</p>` : ''}</div>`;

  const pickView = () => {
    const P = picking;
    const foe = P.kind === 'attack' ? data.table.find(r => r.id === P.target) : null;
    return `<p class="small">${P.kind === 'defense' ? `<b>Time de defesa</b>: escolha ${data.rules.team} Pokémon.${vault.length < data.rules.team ? ` (sua Coleção tem ${vault.length}: vão todos)` : ''}` : `<b>Ataque contra ${esc(foe?.name)}</b> ${(foe?.defense || []).map(mini).join('')} — escolha ${data.rules.team} Pokémon (já vem com o seu time de defesa).`} ${P.picks.length}/${data.rules.team}</p>
      <div class="trade-mons" style="max-height:340px">${vault.map(m => `<button type="button" class="trade-mon ${P.picks.includes(m.uid) ? 'on' : ''}" data-act="pick" data-uid="${esc(m.uid)}">
        <img src="${monSprite(m)}" alt=""><span>${esc(getSpecies(m.sp)?.name)}${m.shiny ? ' ✨' : ''}</span>
        <span class="tiny">Nv.${Math.min(m.lvl, data.rules.cap)} ${P.picks.includes(m.uid) ? `#${P.picks.indexOf(m.uid) + 1}` : ''}</span></button>`).join('') || '<p class="muted">Sua Coleção está vazia.</p>'}</div>
      <div class="row" style="gap:6px"><button class="btn" data-act="pick-cancel">Voltar</button>
        <button class="btn primary grow" data-act="pick-ok" ${P.picks.length < Math.min(data.rules.team, vault.length) ? 'disabled' : ''}>${P.kind === 'defense' ? '💾 Salvar defesa' : '⚔️ Começar duelo'}</button></div>`;
  };

  const render = () => {
    if (!data) return;
    if (picking) return setModalBody('series', head() + pickView());
    const tabs = `<div class="row" style="gap:4px;margin:8px 0;flex-wrap:wrap">${[['tabela', '📊 Tabela'], ['defesa', '⚽ Meu time'], ['trofeus', `🏆 Troféus (${(data.trophies || []).length})`], ['regras', '📜 Regras']].map(([k, l]) => `<button class="btn sm ${tab === k ? 'primary' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div>`;
    const cta = data.serie.defense.length ? '' : `<div class="se-cta"><b>Comece aqui:</b> escolha 6 Pokémon para o seu time de defesa e entre na tabela da Série D (depois dê nome e escudo ao seu time em ⚽ Meu time). <button class="btn primary sm" data-act="pick-def">🛡️ Escolher defesa</button></div>`;
    setModalBody('series', head() + cta + tabs + (tab === 'tabela' ? tableView() : tab === 'defesa' ? defenseView() : tab === 'trofeus' ? trophyRoomHtml(data.trophies) : rulesView()));
  };
  const load = async (op = 'serie_get', extra = {}) => { data = await api('match', { op, ...extra }); render(); };

  bindActions(ov, {
    tab: d => { tab = d.t; render(); },
    'pick-def': () => { picking = { kind: 'defense', picks: [...(data.serie.defense || [])] }; render(); },
    atk: d => { picking = { kind: 'attack', target: d.id, picks: [...(data.serie.defense || [])] }; render(); },
    pick: d => {
      const P = picking, i = P.picks.indexOf(d.uid);
      if (i >= 0) P.picks.splice(i, 1); else if (P.picks.length < data.rules.team) P.picks.push(d.uid);
      render();
    },
    'pick-cancel': () => { picking = null; render(); },
    crest: d => { teamDraft = { ...teamDraft, name: ov.querySelector('#se-tname')?.value ?? teamDraft.name, crest: d.v }; render(); },
    ccolor: d => { teamDraft = { ...teamDraft, name: ov.querySelector('#se-tname')?.value ?? teamDraft.name, color: d.v }; render(); },
    'save-team': async (d, el) => {
      el.disabled = true;
      try { await load('serie_team', { team: { ...teamDraft, name: ov.querySelector('#se-tname').value } }); teamDraft = null; toast('⚽ Time salvo!', 'good'); }
      catch (e) { toast(e.message, 'bad'); el.disabled = false; }
    },
    'pick-ok': async (d, el) => {
      el.disabled = true;
      try {
        if (picking.kind === 'defense') {
          await load('serie_defense', { uids: picking.picks });
          picking = null; tab = data.serie.team && data.table.find(r => r.me)?.club?.name !== `${profile?.trainer_name} FC` ? 'tabela' : 'defesa'; render();
          toast('🛡️ Defesa inscrita! Agora ela joga por você. Dê um nome ao seu time.', 'good');
        } else {
          const r = await api('match', { op: 'serie_challenge', target: picking.target, teamUids: picking.picks });
          closeModal('series');
          ctx.openOnline(r.match.id);
        }
      } catch (e) { toast(e.message, 'bad'); el.disabled = false; }
    }
  });
  try { await load(); showSeasonResult(data.serie.prev); } catch (e) { setModalBody('series', `<p class="muted">${esc(e.message)}</p>`); }
}
