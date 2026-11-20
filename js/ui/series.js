// ⚽ Liga das Séries: tabela da série, time de defesa e desafios (duelo 1x1 contra a defesa de quem está offline).
import { getSpecies } from '../../shared/data/pokemon.js';
import { api } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { monSprite, avatarUrl } from '../config.js';

const mini = m => `<img class="se-mini" src="${monSprite({ sp: m.sp, shiny: m.shiny })}" alt="" title="${esc(getSpecies(m.sp)?.name || m.sp)} Nv.${m.lvl}">`;

export async function openSeries(ctx, profile) {
  let data = null, tab = 'tabela', picking = null; // picking = { kind: 'defense' | 'attack', target, picks: [] }
  const vault = [...(profile?.vault || [])].sort((a, b) => b.lvl - a.lvl);
  const ov = openModal('series', '⚽ Liga das Séries', '<span class="spinner"></span>', { wide: true });

  const head = () => {
    const S = data.serie, me = data.table.find(r => r.me);
    return `<div class="se-head" style="--sc:${S.info.color}">
      <div class="se-badge">${S.info.icon}</div>
      <div class="grow"><b class="se-title">${esc(S.info.name)}</b> <span class="tiny muted">${esc(S.seasonName)}</span>
        <div class="small">${me ? `<b>${me.pos}º</b> de ${data.table.length} · <b>${me.pts}</b> pts · ${me.v}V ${me.d}D · saldo ${me.sp >= 0 ? '+' : ''}${me.sp} · 🛡️ ${me.dv}/${me.dv + me.dd}` : 'Inscreva o seu time de defesa para entrar na tabela.'}</div></div>
      <div class="se-left" title="Ataques de hoje"><b>${S.left}</b><span class="tiny">ataques hoje</span></div></div>`;
  };

  const tableView = () => {
    const S = data.serie, foes = S.foesToday || [];
    return `<div class="se-legend tiny"><span class="z up"></span> sobe para a ${data.series[Math.min(3, S.div + 1)].name} &nbsp; <span class="z down"></span> cai &nbsp; 🤖 clube CPU (joga todo dia)</div>
      <div class="se-table-wrap"><table class="score se-table"><tr><th>#</th><th>Treinador</th><th title="Pontos">P</th><th title="Ataques">J</th><th>V</th><th>D</th><th title="Saldo de Pokémon">SP</th><th title="Defesas seguradas / ataques recebidos">🛡️</th><th>Defesa</th><th></th></tr>
      ${data.table.map(r => `<tr class="${r.me ? 'me' : ''} ${r.zone ? 'z-' + r.zone : ''}"><td><b>${r.pos}</b></td>
        <td class="se-name">${r.club ? '🤖' : `<img class="avatar xs" src="${avatarUrl(r.avatar || 1)}" alt="">`} ${esc(r.name)}</td>
        <td><b>${r.pts}</b></td><td>${r.j}</td><td>${r.v}</td><td>${r.d}</td><td>${r.sp >= 0 ? '+' : ''}${r.sp}</td><td>${r.dv}/${r.dv + r.dd}</td>
        <td class="se-def">${(r.defense || []).map(mini).join('')}</td>
        <td>${r.me ? '' : `<button class="btn sm ${foes.includes(r.id) ? '' : 'red'}" data-act="atk" data-id="${esc(r.id)}" ${!S.defense.length || S.left <= 0 || foes.includes(r.id) ? 'disabled' : ''}>${foes.includes(r.id) ? '✔ hoje' : '⚔️ Desafiar'}</button>`}</td></tr>`).join('')}</table></div>`;
  };

  const defenseView = () => {
    const S = data.serie;
    return `<p class="small muted">Seu time de defesa joga por você quando alguém te desafia (a CPU controla). Cada defesa segurada vale <b>+1 ponto</b>, mesmo com você offline. Nível limitado a ${data.rules.cap}.</p>
      <div class="row" style="gap:6px;margin:6px 0">${S.defenseMons.length ? S.defenseMons.map(m => `<div class="se-defmon">${mini(m)}<span class="tiny">${esc(getSpecies(m.sp)?.name)} Nv.${m.lvl}</span></div>`).join('') : '<span class="muted">Nenhum ainda.</span>'}</div>
      <button class="btn primary" data-act="pick-def">🛡️ ${S.defense.length ? 'Trocar' : 'Escolher'} time de defesa</button>
      ${(S.log || []).length ? `<h3 style="margin-top:12px">Últimos jogos</h3><div class="list">${S.log.map(l => `<div class="list-item small">${l.kind === 'def' ? '🛡️' : '⚔️'} ${l.kind === 'def' ? `${esc(l.foe)} atacou sua defesa` : `Você x ${esc(l.foe)}`} —
        <b style="color:${l.win ? '#8ff0bd' : '#ff9b9e'}">${l.win ? (l.kind === 'def' ? 'defesa segurou (+1)' : 'vitória (+3)') : (l.kind === 'def' ? 'defesa caiu' : 'derrota')}</b> <span class="tiny muted">${l.kos}x${l.lost} · ${new Date(l.at).toLocaleString('pt-BR')}</span></div>`).join('')}</div>` : ''}`;
  };

  const rulesView = () => `<div class="small" style="line-height:1.6">
      <p>⚽ Como no Brasileirão: <b>Série D → C → B → A</b>, uma temporada por mês. Todo mundo começa na Série D.</p>
      <p>⚔️ <b>Ataque:</b> escolha um adversário da sua série e jogue um duelo 1x1 (até ${data.rules.team} Pokémon, Nv. máx. ${data.rules.cap}) contra o time de defesa dele. Vitória = <b>+3 pontos</b>. Até <b>${data.rules.daily} ataques por dia</b> e 1 contra o mesmo adversário por dia.</p>
      <p>🛡️ <b>Defesa:</b> quando te desafiam, o seu time de defesa joga sozinho. Segurou = <b>+1 ponto</b> (não precisa estar online).</p>
      <p>📊 Desempate: pontos, vitórias, saldo de Pokémon (derrubados − perdidos), menos jogos.</p>
      <p>🤖 <b>Clubes CPU</b> completam a série e somam pontos todo dia — dá para desafiar eles também.</p>
      <p>🏁 <b>Fim do mês:</b> os ${data.rules.up} primeiros sobem e os ${data.rules.down} últimos caem (a Série D não cai, a A não sobe). Pódio da ${esc(data.serie.info.name)}: ${data.rules.prize.map((p, i) => `${i + 1}º ${p} 💎`).join(' · ')}. <b>Campeão da Série A ganha um Pokémon Mítico 🌟</b>.</p>
      ${data.last ? `<p>🏆 ${esc(data.last.seasonName)}: ${data.last.podium.filter(p => p.pos === 1).map(p => `${esc(p.name)} (${data.series[p.div].name})`).join(' · ') || '—'}</p>` : ''}</div>`;

  const pickView = () => {
    const P = picking;
    const foe = P.kind === 'attack' ? data.table.find(r => r.id === P.target) : null;
    return `<p class="small">${P.kind === 'defense' ? `<b>Time de defesa</b>: escolha até ${data.rules.team}.` : `<b>Ataque contra ${esc(foe?.name)}</b> ${(foe?.defense || []).map(mini).join('')} — escolha até ${data.rules.team} (vazio = seu time de defesa).`} ${P.picks.length}/${data.rules.team}</p>
      <div class="trade-mons" style="max-height:340px">${vault.map(m => `<button type="button" class="trade-mon ${P.picks.includes(m.uid) ? 'on' : ''}" data-act="pick" data-uid="${esc(m.uid)}">
        <img src="${monSprite(m)}" alt=""><span>${esc(getSpecies(m.sp)?.name)}${m.shiny ? ' ✨' : ''}</span>
        <span class="tiny">Nv.${Math.min(m.lvl, data.rules.cap)} ${P.picks.includes(m.uid) ? `#${P.picks.indexOf(m.uid) + 1}` : ''}</span></button>`).join('') || '<p class="muted">Sua Coleção está vazia.</p>'}</div>
      <div class="row" style="gap:6px"><button class="btn" data-act="pick-cancel">Voltar</button>
        <button class="btn primary grow" data-act="pick-ok" ${P.kind === 'defense' && !P.picks.length ? 'disabled' : ''}>${P.kind === 'defense' ? '💾 Salvar defesa' : '⚔️ Começar duelo'}</button></div>`;
  };

  const render = () => {
    if (!data) return;
    if (picking) return setModalBody('series', head() + pickView());
    const tabs = `<div class="row" style="gap:4px;margin:8px 0">${[['tabela', '📊 Tabela'], ['defesa', '🛡️ Minha defesa'], ['regras', '📜 Regras']].map(([k, l]) => `<button class="btn sm ${tab === k ? 'primary' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div>`;
    const cta = data.serie.defense.length ? '' : `<div class="se-cta"><b>Comece aqui:</b> escolha 3 Pokémon para o seu time de defesa e entre na tabela da Série D. <button class="btn primary sm" data-act="pick-def">🛡️ Escolher defesa</button></div>`;
    setModalBody('series', head() + cta + tabs + (tab === 'tabela' ? tableView() : tab === 'defesa' ? defenseView() : rulesView()));
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
    'pick-ok': async (d, el) => {
      el.disabled = true;
      try {
        if (picking.kind === 'defense') {
          await load('serie_defense', { uids: picking.picks });
          picking = null; tab = 'tabela'; render();
          toast('🛡️ Defesa inscrita! Agora ela joga por você.', 'good');
        } else {
          const r = await api('match', { op: 'serie_challenge', target: picking.target, teamUids: picking.picks });
          closeModal('series');
          ctx.openOnline(r.match.id);
        }
      } catch (e) { toast(e.message, 'bad'); el.disabled = false; }
    }
  });
  try { await load(); } catch (e) { setModalBody('series', `<p class="muted">${esc(e.message)}</p>`); }
}
