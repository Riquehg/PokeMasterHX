// Tela da partida: tabuleiro com zoom, painel de ações, equipe, jogadores, log/chat, batalha e fila de animações.
import { getSpace } from '../../shared/data/board.js';
import { GYMS, gymAt, ELITE_SPACE, CHAMPION_SPACE, ELITE_FOUR, BADGES_TO_LEAGUE } from '../../shared/data/trainers.js';
import { ITEMS } from '../../shared/data/items.js';
import { whoMustAct, score, AFK_SECONDS } from '../../shared/engine.js';
import { esc, toast, bindActions, openModal, closeModal } from './dom.js';
import { monSprite } from '../config.js';
import { monCard, playerColor, avatarImg, speciesName } from './common.js';
import { battleHtml, outcomeText, playBattleFx } from './battle.js';
import { BoardView } from './board.js';
import { anim, rollDice, turnBanner, eventCard, battleIntro, captureAnim, confetti } from './fx.js';
import * as M from './modals.js';

const BATTLE_FX = new Set(['hit', 'heal', 'faint', 'switch']);
const SPEEDS = [[1, '🎬 Animações: normal'], [2, '⚡ Animações: rápidas'], [0, '⏭️ Animações: desligadas']];

export function mountGame(root, session, { onExit }) {
  const ui = {
    tab: 'log', mtab: 'team', battleSub: null, spectate: false, afkTimer: null, overShown: false,
    shown: session.state, queue: [], playing: false, listeners: new Set(), lastBattleSeen: session.state?.lastBattle?.fxSeq ?? 0
  };

  root.innerHTML = `
    <div id="game" data-mtab="team">
      <header class="topbar">
        <div class="row"><h1>Pokémon Master Trainer HEX</h1><span class="chip" id="g-mode"></span><span class="chip gold" id="g-turn"></span></div>
        <div class="stats" id="g-stats"></div>
        <div class="row tb-btns">
          <button class="btn sm" data-act="open-bag" title="Mochila">🎒<span class="lbl-txt"> Mochila</span></button>
          <button class="btn sm" data-act="open-dex" title="Pokédex">📖<span class="lbl-txt"> Pokédex</span></button>
          <button class="btn sm" data-act="speed" id="g-speed" title="Velocidade das animações">🎬</button>
          <button class="btn sm" data-act="open-help" title="Regras">❔</button>
          <button class="btn sm red" data-act="exit" title="Sair">🚪<span class="lbl-txt"> Sair</span></button>
        </div>
      </header>
      <div class="layout">
        <section class="left">
          <div class="board-viewport" id="g-board"></div>
          <div class="panel panel-team">
            <div class="spread" style="margin-bottom:6px"><b>🛡️ Sua equipe</b><span class="tiny muted g-who"></span></div>
            <div class="team" id="g-team"></div>
          </div>
        </section>
        <aside class="right">
          <div class="panel actions dock" id="g-actions"></div>
          <div class="panel" id="g-battle-mini" style="display:none"></div>
          <div class="mtabs">
            <button class="btn sm" data-act="mtab" data-t="team">🛡️ Equipe</button>
            <button class="btn sm" data-act="mtab" data-t="players">👥 Jogadores</button>
            <button class="btn sm" data-act="mtab" data-t="log">📜 Log/Chat</button>
          </div>
          <div class="panel panel-team-m" data-mtab="team"><div class="spread" style="margin-bottom:6px"><b>🛡️ Sua equipe</b><span class="tiny muted g-who"></span></div><div class="team" id="g-team-m"></div></div>
          <div class="panel" data-mtab="players"><b>👥 Jogadores</b><div class="list" id="g-players" style="margin-top:6px;max-height:none"></div></div>
          <div class="panel" data-mtab="log">
            <div class="tabs"><button class="btn sm" data-act="tab" data-tab="log">📜 Log</button><button class="btn sm" data-act="tab" data-tab="chat">💬 Chat</button></div>
            <div class="log" id="g-log" style="margin-top:6px"></div>
            <form id="g-chat" class="row hidden" style="margin-top:6px"><input class="input grow" maxlength="200" placeholder="Mensagem..." id="g-chat-input"><button class="btn sm primary">Enviar</button></form>
          </div>
        </aside>
      </div>
    </div>`;

  const S = () => ui.shown;
  const vid = () => session.viewerId();
  const me = () => S().players.find(p => p.id === vid());
  const nameOf = pid => S().players.find(p => p.id === pid)?.name || '?';

  const board = new BoardView(root.querySelector('#g-board'), {
    onMove: to => act({ type: 'move', to }),
    onToken: pid => M.openTrainer(viewSession(), pid)
  });
  // os modais leem o estado "mostrado" (sincronizado com as animações)
  const viewSession = () => ({
    get state() { return S(); },
    viewerId: () => vid(),
    on: fn => { ui.listeners.add(fn); return () => ui.listeners.delete(fn); },
    canAct: id => session.canAct(id),
    kind: session.kind
  });

  async function act(action) {
    const r = await session.act(action);
    if (r.error) toast(r.error, 'bad');
    return r;
  }

  // ================================================================ fila de animações
  function enqueue(next) {
    if (!next) return;
    ui.queue.push(next);
    if (!ui.playing) drain();
  }

  async function drain() {
    ui.playing = true;
    document.body.classList.add('anim-busy');
    while (ui.queue.length) {
      const next = ui.queue.shift();
      const prev = ui.shown;
      try { await playFx(prev, next); } catch (e) { console.error('animação', e); }
      ui.shown = next;
      render();
    }
    ui.playing = false;
    document.body.classList.remove('anim-busy');
    render();
  }

  async function playFx(prev, next) {
    if (!prev || next.fxSeq === prev.fxSeq || !anim.speed) return;
    const fxs = next.fx || [];
    const v = vid();
    const battleOpen = !!document.getElementById('battle') && prev.battle && !prev.battle.over;
    let round = [];
    const flushRound = async () => { if (round.length && battleOpen) await playBattleFx(round); round = []; };

    for (let i = 0; i < fxs.length; i++) {
      const f = fxs[i];
      if (BATTLE_FX.has(f.k)) { round.push(f); continue; }
      await flushRound();
      switch (f.k) {
        case 'dice': {
          const p = next.players.find(x => x.id === f.pid);
          await rollDice({ value: f.value, bonus: f.bonus, name: p?.name, color: playerColor(next, f.pid), mine: f.pid === v && session.canAct(v) });
          break;
        }
        case 'move':
          if (f.path) await board.animateMove(f.pid, f.path, anim.speed || 1);
          break;
        case 'event':
          await eventCard(f, { name: nameOf(f.pid), mine: f.pid === v && session.canAct(v) });
          break;
        case 'battle': {
          const involved = f.pid === v || f.foe?.pid === v;
          if (involved) {
            const meP = next.players.find(x => x.id === v);
            const foeP = f.foe?.kind === 'player' ? next.players.find(x => x.id === (f.pid === v ? f.foe.pid : f.pid)) : null;
            closeModal('battle');
            await battleIntro(f, { me: meP, foePlayer: foeP });
          } else {
            const foe = f.foe.kind === 'player' ? nameOf(f.foe.pid) : f.foe.kind === 'wild' ? `${speciesName(f.foe.sp)} selvagem${f.foe.shiny ? ' ✨' : ''}` : f.foe.name;
            toast(`⚔️ ${nameOf(f.pid)} entrou em batalha contra ${foe}`);
          }
          break;
        }
        case 'capture':
          if (f.pid === v) {
            const escaped = fxs.slice(i + 1).some(x => x.k === 'battle_end' && x.result === 'escaped');
            closeModal('battle');
            await captureAnim(f, { escaped });
          } else if (f.ok) toast(`🔴 ${nameOf(f.pid)} capturou ${speciesName(f.sp)}${f.shiny ? ' ✨' : ''}!`, 'good');
          break;
        case 'turn':
          await turnBanner({ player: next.players.find(x => x.id === f.pid), color: playerColor(next, f.pid), mine: f.pid === v && session.canAct(f.pid), turn: f.turn });
          break;
        case 'badge': {
          const g = GYMS.find(x => x.id === f.badge);
          toast(`🎖️ ${nameOf(f.pid)} conquistou a ${g?.badge}!`, 'good');
          if (f.pid === v) confetti(90);
          break;
        }
        case 'placed':
          if (f.pid === v && f.where === 'box') toast(`💻 ${speciesName(f.sp)}${f.shiny ? ' ✨' : ''} foi para o PC — sua equipe já tem 6.`, 'info');
          break;
        case 'win':
          confetti(140);
          break;
      }
    }
    await flushRound();
  }

  // ================================================================ render
  function render() {
    const s = S();
    if (!s) return;
    const p = me();
    const must = whoMustAct(s);
    const cur = s.players[s.current];
    root.querySelector('#game').dataset.mtab = ui.mtab;
    root.querySelectorAll('[data-act="mtab"]').forEach(b => b.classList.toggle('primary', b.dataset.t === ui.mtab));
    const mo = session.match?.options || {};
    root.querySelector('#g-mode').textContent = session.kind !== 'online' ? '📱 Offline' : mo.solo ? '🤖 Treino (salva na conta)' : `🌐 Sala ${session.match?.code || ''} · ${{ balanced: '⚖️ Balanceado', collection: '📦 Coleção', ranked: '🏆 Competitivo' }[mo.mode] || ''}`;
    root.querySelector('#g-turn').textContent = `Turno ${s.turn}${s.options.turnLimit ? '/' + s.options.turnLimit : ''}`;
    root.querySelector('#g-speed').textContent = SPEEDS.find(x => x[0] === anim.speed)?.[1].split(' ')[0] || '🎬';
    root.querySelector('#g-stats').innerHTML = p ? `
      <span class="stat stat-name">${avatarImg(p, 'avatar sm', playerColor(s, p.id))} ${esc(p.name)}</span>
      <span class="stat">🪙 ${p.gold}</span><span class="stat">🎖️ ${p.badges.length}/${GYMS.length}</span><span class="stat stat-dex">📖 ${p.caught.length}</span>` : '';
    const hot = session.kind === 'local' && s.players.filter(x => !x.isBot).length > 1;
    root.querySelectorAll('.g-who').forEach(e => (e.textContent = hot ? `Mostrando: ${p?.name}` : ''));

    const myMove = s.pending?.kind === 'move' && p && cur.id === p.id && must.includes(p.id) && !ui.playing;
    board.render(s, { viewerId: p?.id, options: myMove ? s.pending.options : [], hint: myMove ? `🎲 ${s.pending.roll}${s.pending.bonus ? '+' + s.pending.bonus : ''} — toque numa casa brilhando` : '' });
    renderTeam(p);
    renderActions(s, p, must, cur);
    renderPlayers(s);
    renderLog(s);
    if (!ui.playing) {
      renderBattle(s);
      renderInvite(s);
      renderGameOver(s);
    }
    ui.listeners.forEach(fn => { try { fn(s); } catch (e) { console.error(e); } });
  }

  function renderTeam(p) {
    const html = p ? p.team.map((m, i) => monCard(m, { index: i, lead: i === 0, owner: p })).join('') + '<div class="mon empty">vaga</div>'.repeat(Math.max(0, 6 - p.team.length)) : '';
    root.querySelector('#g-team').innerHTML = html;
    root.querySelector('#g-team-m').innerHTML = html;
  }

  function renderActions(s, p, must, cur) {
    const box = root.querySelector('#g-actions');
    clearTimeout(ui.afkTimer);
    if (s.status !== 'playing') {
      box.innerHTML = `<div class="turn-banner">🏁 Partida encerrada.</div><button class="btn primary" data-act="show-over">Ver resultado</button>`;
      return;
    }
    const myTurn = p && cur.id === p.id && session.canAct(p.id);
    const banner = myTurn
      ? `<div class="turn-banner me">${avatarImg(p, 'avatar sm', playerColor(s, p.id))} Sua vez, ${esc(p.name)}!</div>`
      : `<div class="turn-banner">${avatarImg(cur, 'avatar sm', playerColor(s, cur.id))}<span>Vez de <b style="color:${playerColor(s, cur.id)}">${esc(cur.name)}</b>${cur.isBot ? ' (CPU)' : ''}</span></div>`;
    if (ui.playing) { box.innerHTML = banner + `<p class="small muted"><span class="spinner"></span> ...</p>`; return; }

    if (s.battle) {
      const inIt = s.battle.sides.some(x => x.pid === p?.id);
      box.innerHTML = banner + (inIt
        ? `<button class="btn primary block" data-act="open-battle">⚔️ Voltar para a batalha</button>`
        : `<p class="small muted">${esc(cur.name)} está batalhando.</p><button class="btn block" data-act="spectate">👀 Assistir</button>`) + afkButton(s, p, must);
      return;
    }
    if (s.pending?.kind === 'pvp_invite') {
      box.innerHTML = banner + `<p class="small">🤺 ${esc(nameOf(s.pending.from))} desafiou ${esc(nameOf(s.pending.to))} — aguardando resposta.</p>` + afkButton(s, p, must);
      return;
    }
    if (!myTurn) {
      box.innerHTML = banner + `<p class="small muted">${phaseText(s, cur)}</p>` + afkButton(s, p, must);
      return;
    }

    const sp = getSpace(p.pos);
    let html = banner + `<div class="small">📍 ${esc(sp.name)} <span class="muted">(${tierName(sp.tier)})</span></div>`;
    if (s.phase === 'roll') {
      html += `<button class="btn primary pulse block" data-act="roll" style="min-height:52px;font-size:16px">🎲 Rolar dado</button>`;
      if (p.items.bicycle) html += `<button class="btn sm" data-act="use" data-item="bicycle">🚲 Usar Bicicleta (+2) ×${p.items.bicycle}</button>`;
    } else if (s.phase === 'move') {
      html += `<p class="small">🎲 Você tirou <b>${s.pending.roll}</b>${s.pending.bonus ? ` +${s.pending.bonus}` : ''}. Toque numa casa brilhando no mapa ou escolha:</p>
        <div class="row">${s.pending.options.map(id => `<button class="btn sm" data-act="move" data-to="${id}">${esc(getSpace(id).name)}${spaceHint(s, id)}</button>`).join('')}</div>`;
    }
    if (sp.type === 'city' && s.phase !== 'move') html += cityPanel(s, p, sp);
    if (s.phase === 'action') {
      const rivals = s.players.filter(q => q.id !== p.id && q.pos === p.pos);
      if (rivals.length && !s.turnFlags.pvp) {
        html += `<div class="small">Treinadores aqui:</div><div class="row">${rivals.map(q =>
          `<button class="btn sm red" data-act="challenge" data-pid="${esc(q.id)}">🤺 Desafiar ${esc(q.name)}</button>`).join('')}</div>`;
      }
      html += `<button class="btn green block" data-act="end" style="min-height:48px">✔️ Encerrar turno</button>`;
    }
    box.innerHTML = html;
  }

  function afkButton(s, p, must) {
    if (session.kind !== 'online' || !p) return '';
    const waiting = must.filter(id => id !== p.id);
    if (!waiting.length || must.includes(p.id)) return '';
    const left = AFK_SECONDS * 1000 - (Date.now() - (s.turnStartedAt || 0));
    if (left > 0) {
      ui.afkTimer = setTimeout(render, Math.min(left + 500, 15000));
      return `<p class="tiny muted">Se ninguém jogar em ${Math.ceil(left / 1000)}s, você poderá pular a vez.</p>`;
    }
    return `<button class="btn sm" data-act="afk">⏰ Jogador inativo — deixar a CPU jogar</button>`;
  }

  function phaseText(s, cur) {
    if (s.phase === 'roll') return `${esc(cur.name)} vai rolar o dado.`;
    if (s.phase === 'move') return `${esc(cur.name)} está escolhendo para onde ir.`;
    return `${esc(cur.name)} está em ${esc(getSpace(cur.pos).name)}.`;
  }

  function cityPanel(s, p, sp) {
    const gym = gymAt(sp.id);
    let h = `<b>🏙️ ${esc(sp.name)}</b><div class="grid2">
      <button class="btn sm" data-act="heal">🏥 Centro Pokémon</button>
      <button class="btn sm" data-act="shop">🛒 Loja</button>
      <button class="btn sm" data-act="pc">💻 PC (${p.box.length})</button>
      ${p.items.fly ? `<button class="btn sm" data-act="fly">🕊️ Voar</button>` : ''}</div>`;
    if (gym) {
      const lv = gym.team.map(t => t[1]);
      h += p.badges.includes(gym.id) ? `<p class="small">🎖️ Você já tem a ${esc(gym.badge)}.</p>`
        : `<button class="btn primary block" data-act="gym" ${s.turnFlags.gym ? 'disabled' : ''}>🏟️ Desafiar ${esc(gym.leader)} (Nv. ${Math.min(...lv)}–${Math.max(...lv)})</button>`;
    }
    if (sp.id === ELITE_SPACE) {
      h += p.badges.length >= BADGES_TO_LEAGUE && p.eliteStage < ELITE_FOUR.length
        ? `<button class="btn purple block" data-act="league" ${s.turnFlags.gym ? 'disabled' : ''}>👑 Enfrentar a Elite dos Quatro (${p.eliteStage}/4)</button><p class="tiny muted">4 batalhas seguidas, sem cura. Perder reinicia o desafio.</p>`
        : p.eliteStage >= ELITE_FOUR.length ? `<p class="small">👑 Elite vencida! Vá à Arena Final.</p>` : '';
    }
    if (sp.id === CHAMPION_SPACE) {
      h += p.eliteStage >= ELITE_FOUR.length
        ? `<button class="btn red block pulse" data-act="league" ${s.turnFlags.gym ? 'disabled' : ''}>🏆 Desafiar o Campeão</button>`
        : `<p class="small muted">Vença a Elite dos Quatro na Liga Pokémon primeiro.</p>`;
    }
    return h;
  }

  function spaceHint(s, id) {
    const sp = getSpace(id);
    const w = s.board[id];
    return (sp.type === 'city' ? ' 🏙' : sp.type === 'event' ? ' ❓' : ' 🌿') + (w ? ` (${esc(speciesName(w.sp))}${w.shiny ? '✨' : ''})` : '');
  }

  function renderPlayers(s) {
    root.querySelector('#g-players').innerHTML = s.players.map((pl, i) => `
      <div class="list-item" data-act="trainer" data-pid="${esc(pl.id)}" style="cursor:pointer;${s.current === i ? 'border-color:' + playerColor(s, pl.id) : ''}">
        ${avatarImg(pl, 'avatar sm', playerColor(s, pl.id))}
        <div class="grow"><b style="color:${playerColor(s, pl.id)}">${esc(pl.name)}</b>${pl.isBot ? ' <span class="chip">CPU</span>' : ''}${pl.left ? ' <span class="chip red">saiu</span>' : ''}${pl.cosmetic?.title ? `<div class="player-title">${esc(pl.cosmetic.title)}</div>` : ''}
          <div class="tiny muted">📍 ${esc(getSpace(pl.pos).name)} · 🪙 ${pl.gold} · 🎖️ ${pl.badges.length} · 📖 ${pl.caught.length}${pl.eliteStage ? ` · 👑 ${pl.eliteStage}/4` : ''}${pl.skip ? ' · ⏸️' : ''}</div></div>
        <div class="row" style="gap:2px">${pl.team.slice(0, 6).map(m => `<img src="${monSprite(m)}" alt="${esc(speciesName(m.sp))}" style="width:24px;height:24px;object-fit:contain;${m.hp <= 0 ? 'filter:grayscale(1);opacity:.5' : ''}">`).join('')}</div>
      </div>`).join('');
  }

  function renderLog(s) {
    const box = root.querySelector('#g-log');
    const chatForm = root.querySelector('#g-chat');
    root.querySelectorAll('[data-act="tab"]').forEach(b => b.classList.toggle('primary', b.dataset.tab === ui.tab));
    if (ui.tab === 'log') {
      chatForm.classList.add('hidden');
      box.innerHTML = s.log.slice(-80).map(l => `<p class="${l.kind}"><span class="muted">[${l.t}]</span> ${esc(l.msg)}</p>`).join('');
    } else {
      chatForm.classList.remove('hidden');
      const chat = session.chat || [];
      box.innerHTML = chat.length ? chat.map(c => `<p class="chat"><b>${esc(c.name)}:</b> ${esc(c.text)}</p>`).join('') : '<p class="muted">Sem mensagens ainda.</p>';
    }
    box.scrollTop = box.scrollHeight;
  }

  // ================================================================ batalha
  function renderBattle(s) {
    const mini = root.querySelector('#g-battle-mini');
    const b = s.battle;
    const p = me();
    if (!b) {
      closeModal('battle');
      mini.style.display = 'none';
      ui.battleSub = null;
      const lb = s.lastBattle;
      if (lb && lb.fxSeq !== ui.lastBattleSeen) {
        ui.lastBattleSeen = lb.fxSeq;
        if (lb.sides.some(x => x.pid === p?.id) && lb.outcome?.result !== 'captured') {
          const txt = outcomeText(s, lb, p.id);
          if (/Vitória/.test(txt)) confetti(50);
          openModal('battle-end', 'Fim da batalha', `<h3 class="center" style="font-size:22px;margin:6px 0 10px">${esc(txt)}</h3>
            <div class="battle-log">${lb.log.map(l => `<p>${esc(l)}</p>`).join('')}</div>
            <button class="btn primary block" data-close="battle-end" style="margin-top:10px">Continuar</button>`);
        }
      }
      return;
    }
    const inIt = b.sides.some(x => x.pid === p?.id);
    if (inIt || ui.spectate) {
      mini.style.display = 'none';
      const html = battleHtml(s, p?.id, { sub: ui.battleSub }, !!p && session.canAct(p.id));
      const open = document.getElementById('battle');
      if (open) open.querySelector('.body').innerHTML = html;
      else {
        const ov = openModal('battle', '⚔️ Batalha', html, { wide: true, closable: !inIt, onClose: () => { ui.spectate = false; render(); } });
        ov.querySelector('.modal').classList.add('battle');
        bindActions(ov, battleHandlers);
      }
      const lg = document.getElementById('battle-log');
      if (lg) lg.scrollTop = lg.scrollHeight;
    } else {
      closeModal('battle');
      mini.style.display = '';
      const foe = b.sides[1];
      mini.innerHTML = `<b>⚔️ Batalha em andamento</b><div class="small muted">${esc(nameOf(b.sides[0].pid))} vs ${esc(foe.kind === 'player' ? nameOf(foe.pid) : foe.kind === 'wild' ? speciesName(foe.team[0].sp) + ' selvagem' : foe.name)}</div>
        <div class="tiny" style="margin-top:4px">${b.log.slice(-3).map(esc).join('<br>')}</div>`;
    }
  }

  const battleHandlers = {
    'b-attack': () => { ui.battleSub = null; act({ type: 'battle', move: 'attack' }); },
    'b-sub': d => { ui.battleSub = ui.battleSub === d.sub ? null : d.sub; renderBattle(S()); },
    'b-switch': d => { ui.battleSub = null; act({ type: 'battle', move: 'switch', index: Number(d.index) }); },
    'b-ball': d => { ui.battleSub = null; act({ type: 'battle', move: 'ball', item: d.item }); },
    'b-item': d => {
      const p = me();
      const b = S().battle;
      const si = b.sides.findIndex(x => x.pid === p.id);
      let index = b.sides[si].active;
      if (ITEMS[d.item].kind === 'revive') index = p.team.findIndex(m => m.hp <= 0);
      if (index < 0) return toast('Ninguém desmaiado para reviver.', 'bad');
      ui.battleSub = null;
      act({ type: 'battle', move: 'item', item: d.item, index });
    },
    'b-flee': () => {
      if (S().battle.kind !== 'wild' && !confirm('Desistir conta como derrota. Tem certeza?')) return;
      act({ type: 'battle', move: 'flee' });
    }
  };

  function renderInvite(s) {
    const p = me();
    const inv = s.pending?.kind === 'pvp_invite' ? s.pending : null;
    if (!inv || !p || inv.to !== p.id || !session.canAct(p.id)) { closeModal('invite'); return; }
    if (document.getElementById('invite')) return;
    const ov = openModal('invite', '🤺 Desafio PvP!', `
      <p><b>${esc(nameOf(inv.from))}</b> desafiou ${session.kind === 'local' ? `<b>${esc(p.name)}</b>` : 'você'} para uma batalha Pokémon!</p>
      <p class="small muted">Quem perder paga 15% do ouro para o vencedor.</p>
      <div class="grid2"><button class="btn" data-act="decline">Recusar</button><button class="btn red" data-act="accept">Aceitar!</button></div>`, { closable: false });
    bindActions(ov, {
      accept: () => { closeModal('invite'); act({ type: 'respond', accept: true }); },
      decline: () => { closeModal('invite'); act({ type: 'respond', accept: false }); }
    });
  }

  function renderGameOver(s) {
    if (s.status !== 'finished' || ui.overShown) return;
    ui.overShown = true;
    showOver(s);
  }

  function showOver(s) {
    const w = s.players.find(p => p.id === s.winner);
    const ranked = [...s.players].sort((a, b) => score(b) - score(a));
    confetti(150);
    const ov = openModal('over', '🏆 Fim de jogo', `
      <div class="banner-win">${w ? avatarImg(w, 'avatar') : ''}<h2>${esc(w ? w.name : '—')} venceu!</h2>
      <p class="muted">${esc(s.log.filter(l => l.kind === 'win').slice(-1)[0]?.msg || '')}</p></div>
      <table class="score"><tr><th>Treinador</th><th>Insígnias</th><th>Pokédex</th><th>Shinies</th><th>Pontos</th>${s.ratingChanges ? '<th>Rating</th>' : ''}</tr>
      ${ranked.map(p => { const d = s.ratingChanges?.[p.id]; return `<tr><td>${esc(p.name)}</td><td>${p.badges.length}</td><td>${p.caught.length}</td><td>${p.stats.shinies}</td><td><b>${score(p)}</b></td>${s.ratingChanges ? `<td style="color:${d >= 0 ? '#8ff0bd' : '#ff9b9e'}"><b>${d >= 0 ? '+' : ''}${d ?? 0}</b></td>` : ''}</tr>`; }).join('')}</table>
      ${session.kind === 'online' ? '<p class="small muted">Seus Pokémon (equipe e PC), Pokédex e estatísticas foram salvos na sua conta — veja em 📦 Coleção.</p>' : '<p class="small muted">Modo offline: o progresso não vai para a conta.</p>'}
      <button class="btn primary block" data-act="exit" style="margin-top:10px">Voltar ao menu</button>`);
    bindActions(ov, { exit: () => { closeModal('over'); onExit(); } });
  }

  // ================================================================ ações
  bindActions(root, {
    roll: () => act({ type: 'roll' }),
    move: d => act({ type: 'move', to: Number(d.to) }),
    end: () => act({ type: 'end_turn' }),
    heal: () => act({ type: 'city', op: 'heal' }),
    gym: () => act({ type: 'city', op: 'gym' }),
    league: () => act({ type: 'city', op: 'league' }),
    challenge: d => act({ type: 'challenge', target: d.pid }),
    use: d => act({ type: 'use_item', item: d.item }),
    afk: () => act({ type: 'skip_afk' }),
    shop: () => M.openShop(viewSession(), act),
    pc: () => M.openPC(viewSession(), act),
    fly: () => M.openFly(viewSession(), act),
    'open-bag': () => M.openBag(viewSession(), act),
    'open-dex': () => M.openDex(viewSession()),
    'open-help': () => M.openHelp(),
    'open-battle': () => render(),
    spectate: () => { ui.spectate = true; render(); },
    'show-over': () => showOver(S()),
    trainer: d => M.openTrainer(viewSession(), d.pid),
    mon: d => M.openMon(viewSession(), act, Number(d.index)),
    tab: d => { ui.tab = d.tab; render(); },
    mtab: d => { ui.mtab = d.t; render(); },
    speed: () => {
      const i = SPEEDS.findIndex(x => x[0] === anim.speed);
      const nx = SPEEDS[(i + 1) % SPEEDS.length];
      anim.speed = nx[0];
      toast(nx[1]);
      render();
    },
    exit: () => {
      if (session.kind !== 'online' || S().status !== 'playing') return onExit();
      const ov = openModal('exit', '🚪 Sair', `
        <p>A partida online continua sem você. Se demorar, os outros podem deixar uma CPU jogar a sua vez.</p>
        <div class="col"><button class="btn primary" data-act="menu">Ir ao menu (volto depois por "Minhas partidas")</button>
        <button class="btn red" data-act="abandon">Abandonar de vez (uma CPU assume o meu lugar)</button>
        <button class="btn" data-close="exit">Continuar jogando</button></div>`);
      bindActions(ov, {
        menu: () => { closeModal('exit'); onExit(); },
        abandon: async () => { closeModal('exit'); await act({ type: 'leave' }); onExit(); }
      });
    }
  });

  root.querySelector('#g-chat').addEventListener('submit', async e => {
    e.preventDefault();
    const inp = root.querySelector('#g-chat-input');
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    try { await session.sendChat(text); } catch (err) { toast(err.message, 'bad'); }
    render();
  });

  const off = session.on(state => {
    if (!state) return;
    if (state === ui.shown) { render(); return; }
    // estado novo: anima a diferença; mudanças sem efeitos (ex.: chat) só re-renderizam
    if (state.fxSeq === ui.shown?.fxSeq && !ui.playing) { ui.shown = state; render(); return; }
    enqueue(state);
  });
  render();
  if (S().players.find(p => p.id === vid())) setTimeout(() => board.centerOn && board.ensureVisible(me()?.pos), 300);
  return () => { off(); board.destroy(); clearTimeout(ui.afkTimer); document.body.classList.remove('anim-busy'); ['battle', 'battle-end', 'invite', 'over'].forEach(closeModal); };
}

function tierName(t) {
  return ['', 'Rosa', 'Verde', 'Azul', 'Vermelha', 'Amarela'][t] || '';
}
