// ⚔️ Torneio (fila de duelos ranqueados) e 🏟️ Copa (chaveamento).
import { getSpecies } from '../../shared/data/pokemon.js';
import { ivPercent } from '../../shared/rules/monsters.js';
import { DUEL_LEVEL_CAP, CUP_PRIZE, CUP_MIN_HUMANS_FOR_PRIZE, nextPow2 } from '../../shared/data/cup.js';
import { api, watchMatch } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { monSprite, avatarUrl } from '../config.js';
import { potentialStars } from './common.js';

/** Escolher time e entrar na fila do Torneio. */
export function openDuelQueue(ctx, profile) {
  const vault = [...(profile?.vault || [])].sort((a, b) => b.lvl - a.lvl);
  const picks = [];
  let timer = null, searching = false;
  const pickView = () => `<p class="small muted">Duelo 1 contra 1 com o seu time da Coleção. Sem tabuleiro, sem insígnias (todos obedecem), nível limitado a ${DUEL_LEVEL_CAP} e kit igual para os dois. Vitória e derrota mudam o seu <b>Elo</b>.</p>
    <div class="small"><b>Escolha até 6</b> (ou deixe vazio para levar os 6 mais fortes) — ${picks.length}/6</div>
    <div class="trade-mons" style="max-height:340px">${vault.map(m => `<button type="button" class="trade-mon ${picks.includes(m.uid) ? 'on' : ''}" data-act="pick" data-uid="${esc(m.uid)}">
      <img src="${monSprite(m)}" alt=""><span>${esc(getSpecies(m.sp)?.name)}${m.shiny ? ' ✨' : ''}</span>
      <span class="tiny">Nv.${Math.min(m.lvl, DUEL_LEVEL_CAP)}${m.lvl > DUEL_LEVEL_CAP ? ` (${m.lvl})` : ''} ${picks.includes(m.uid) ? `#${picks.indexOf(m.uid) + 1}` : ''}</span>
      ${ivPercent(m) !== null ? `<span class="pk-stars-mini tiny">${potentialStars(ivPercent(m))}</span>` : ''}</button>`).join('') || '<p class="muted">Sua Coleção está vazia. Capture Pokémon no Treino ou no Online primeiro.</p>'}</div>
    <button class="btn primary block" data-act="go" ${vault.length ? '' : 'disabled'} style="margin-top:10px">⚔️ Procurar oponente</button>`;
  const searchView = () => `<div class="center" style="padding:24px 0">
      <div class="queue-pulse">⚔️</div><h3>Procurando um oponente...</h3>
      <p class="small muted">Assim que outro treinador entrar na fila, o duelo começa sozinho. Você pode continuar nesta tela.</p>
      <button class="btn" data-act="cancel">Cancelar</button></div>`;
  const ov = openModal('duelq', '⚔️ Torneio — duelo ranqueado', pickView(), { wide: true, onClose: () => { clearInterval(timer); if (searching) api('match', { op: 'duel_cancel' }).catch(() => {}); } });
  const enter = m => { searching = false; clearInterval(timer); closeModal('duelq'); ctx.openOnline(m.id); };
  const poll = async () => {
    try {
      const r = await api('match', { op: 'duel_status' });
      if (r.match && r.match.status === 'playing') enter(r.match);
    } catch { /* tenta de novo */ }
  };
  bindActions(ov, {
    pick: d => {
      const i = picks.indexOf(d.uid);
      if (i >= 0) picks.splice(i, 1); else if (picks.length < 6) picks.push(d.uid);
      setModalBody('duelq', pickView());
    },
    go: async () => {
      try {
        const r = await api('match', { op: 'duel_queue', teamUids: picks });
        if (r.match?.status === 'playing') return enter(r.match);
        searching = true;
        setModalBody('duelq', searchView());
        timer = setInterval(poll, 2500);
      } catch (e) { toast(e.message, 'bad'); }
    },
    cancel: async () => {
      searching = false; clearInterval(timer);
      try { await api('match', { op: 'duel_cancel' }); } catch { /* ok */ }
      setModalBody('duelq', pickView());
    }
  });
}

const roundName = (r, total) => (r === total - 1 ? '🏆 Final' : r === total - 2 ? 'Semifinal' : r === total - 3 ? 'Quartas' : `Rodada ${r + 1}`);

/** Tela da Copa: chaveamento ao vivo. */
export function cupScreen(el, ctx, match) {
  let m = match, alive = true;
  const meId = match.me;
  const draw = () => {
    const cup = m.state;
    const total = Math.log2(nextPow2(cup.players.length));
    const pl = id => cup.players.find(p => p.id === id);
    const slot = (id, win) => {
      if (!id) return '<div class="cup-slot bye">— passe direto —</div>';
      const p = pl(id);
      return `<div class="cup-slot ${win === id ? 'win' : win ? 'lose' : ''} ${id === meId ? 'me' : ''}"><img src="${avatarUrl(p.avatar, p.skin)}" alt=""><span>${esc(p.name)}</span>${win === id ? '<b>✔</b>' : ''}</div>`;
    };
    const rounds = [];
    for (let r = 0; r < total; r++) {
      const list = cup.rounds[r] || Array.from({ length: nextPow2(cup.players.length) / 2 ** (r + 1) }, () => ({}));
      rounds.push(`<div class="cup-round"><h4>${roundName(r, total)}</h4>${list.map(x => {
        const mine = x.matchId && !x.winner && (x.a === meId || x.b === meId);
        return `<div class="cup-match ${mine ? 'mine' : ''}">${x.a !== undefined ? slot(x.a, x.winner) + slot(x.b, x.winner) : '<div class="cup-slot tbd">a definir</div><div class="cup-slot tbd">a definir</div>'}
          ${mine ? `<button class="btn sm green block" data-act="play" data-id="${x.matchId}">⚔️ Jogar meu duelo</button>` : x.matchId && !x.winner ? '<div class="tiny muted center">em batalha…</div>' : ''}</div>`;
      }).join('')}</div>`);
    }
    const champ = cup.champion ? pl(cup.champion) : null;
    const prizeTxt = cup.humans >= CUP_MIN_HUMANS_FOR_PRIZE
      ? `Campeão: ${CUP_PRIZE.champion * cup.humans} 💎 · Vice: ${CUP_PRIZE.runnerUp * cup.humans} 💎 · +Elo nos duelos entre humanos`
      : `Prêmio em 💎 a partir de ${CUP_MIN_HUMANS_FOR_PRIZE} treinadores humanos (esta Copa tem ${cup.humans}). Duelos entre humanos ainda valem Elo.`;
    el.innerHTML = `<div class="screen cup-screen"><div class="card">
      <div class="row" style="justify-content:space-between"><h2>🏟️ ${esc(m.name)}</h2><button class="btn" data-act="back">← Menu</button></div>
      <p class="small muted">${prizeTxt} · Nível máx ${cup.levelCap}</p>
      ${champ ? `<div class="banner-win"><img src="${avatarUrl(champ.avatar, champ.skin)}" class="avatar" alt=""><h2>👑 ${esc(champ.name)} é o campeão!</h2>
        ${cup.prize?.champion ? `<p>Prêmio: ${cup.prize.champion} 💎${cup.prize.runnerUp ? ` · vice: ${cup.prize.runnerUp} 💎` : ''}${cup.prize.elo ? ` · +${cup.prize.elo} Elo` : ''}</p>` : ''}</div>` : ''}
      <div class="cup-bracket">${rounds.join('')}</div>
      <div class="cup-log">${(cup.log || []).slice(-8).reverse().map(l => `<div class="small">${esc(l)}</div>`).join('')}</div>
    </div></div>`;
  };
  const refresh = async () => {
    try { const r = await api('match', { op: 'get', matchId: m.id }); if (alive) { m = r.match; draw(); } } catch { /* ok */ }
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'play') ctx.openOnline(b.dataset.id);
    if (b.dataset.act === 'back') ctx.go('hub');
  });
  draw();
  const unwatch = watchMatch(m.id, refresh);
  const t = setInterval(refresh, 5000);
  return () => { alive = false; clearInterval(t); unwatch?.(); };
}
