// Tela principal da partida: tabuleiro, painel de ações, equipe, jogadores, log/chat e batalha.
import { SPACE_LIST, getSpace } from '../../shared/data/board.js';
import { GYMS, gymAt, ELITE_SPACE, CHAMPION_SPACE, ELITE_FOUR, BADGES_TO_LEAGUE } from '../../shared/data/trainers.js';
import { ITEMS } from '../../shared/data/items.js';
import { whoMustAct, score, AFK_SECONDS } from '../../shared/engine.js';
import { maxHpOf } from '../../shared/rules/monsters.js';
import { esc, toast, bindActions, openModal, closeModal } from './dom.js';
import { monSprite, avatarUrl, mapUrl } from '../config.js';
import { monCard, playerColor, avatarImg, speciesName } from './common.js';
import { battleHtml, outcomeText } from './battle.js';
import * as M from './modals.js';

export function mountGame(root, session, { onExit }) {
  const ui = { tab: 'log', battleSub: null, lastFx: session.state?.fxSeq ?? 0, lastBattleSeen: session.state?.lastBattle?.fxSeq ?? 0, mapOk: null, spectate: false, afkTimer: null };

  root.innerHTML = `
    <div id="game">
      <header class="topbar">
        <div class="row"><h1>Pokémon Master Trainer HEX</h1><span class="chip" id="g-mode"></span><span class="chip gold" id="g-turn"></span></div>
        <div class="stats" id="g-stats"></div>
        <div class="row">
          <button class="btn sm" data-act="open-bag">🎒 Mochila</button>
          <button class="btn sm" data-act="open-dex">📖 Pokédex</button>
          <button class="btn sm" data-act="open-help">❔ Regras</button>
          <button class="btn sm red" data-act="exit">🚪 Sair</button>
        </div>
      </header>
      <div class="layout">
        <section class="left">
          <div class="board-wrap"><div class="board" id="board"></div></div>
          <div class="card" style="padding:10px">
            <div class="spread" style="margin-bottom:6px"><b>🛡️ Sua equipe</b><span class="tiny muted" id="g-who"></span></div>
            <div class="team" id="g-team"></div>
          </div>
        </section>
        <aside class="right">
          <div class="card actions" id="g-actions"></div>
          <div class="card" id="g-battle-mini" style="display:none"></div>
          <div class="card" style="padding:10px">
            <b>👥 Jogadores</b>
            <div class="list" id="g-players" style="margin-top:6px;max-height:none"></div>
          </div>
          <div class="card" style="padding:10px">
            <div class="tabs"><button class="btn sm" data-act="tab" data-tab="log">📜 Log</button><button class="btn sm" data-act="tab" data-tab="chat">💬 Chat</button></div>
            <div class="log" id="g-log" style="margin-top:6px"></div>
            <form id="g-chat" class="row hidden" style="margin-top:6px"><input class="input grow" maxlength="200" placeholder="Mensagem..." id="g-chat-input"><button class="btn sm primary">Enviar</button></form>
          </div>
        </aside>
      </div>
    </div>`;

  // Imagem do mapa: só usa se carregar (offline fica o fundo verde com as casas)
  const img = new Image();
  img.onload = () => { ui.mapOk = true; const b = root.querySelector('#board'); b.style.setProperty('--map', `url("${mapUrl()}")`); b.classList.add('has-map'); };
  img.onerror = () => { ui.mapOk = false; };
  img.src = mapUrl();

  const st = () => session.state;
  const vid = () => session.viewerId();
  const me = () => st().players.find(p => p.id === vid());

  async function act(action) {
    const r = await session.act(action);
    if (r.error) toast(r.error, 'bad');
    return r;
  }

  // ---------------------------------------------------------------- render
  function render() {
    const s = st();
    if (!s) return;
    const p = me();
    const must = whoMustAct(s);
    const cur = s.players[s.current];

    root.querySelector('#g-mode').textContent = session.kind === 'online' ? `🌐 Online · sala ${session.match?.code || ''}` : '🏠 Local';
    root.querySelector('#g-turn').textContent = `Turno ${s.turn}${s.options.turnLimit ? '/' + s.options.turnLimit : ''}`;
    root.querySelector('#g-stats').innerHTML = p ? `
      <span>${avatarImg(p, 'avatar sm', playerColor(s, p.id))}</span><span>${esc(p.name)}</span>
      <span>🪙 ${p.gold}</span><span>🎖️ ${p.badges.length}/${GYMS.length}</span><span>📖 ${p.caught.length}</span>` : '';
    root.querySelector('#g-who').textContent = session.kind === 'local' && s.players.filter(x => !x.isBot).length > 1 ? `Mostrando: ${p?.name}` : '';

    renderBoard(s, p, must);
    renderTeam(s, p, must);
    renderActions(s, p, must, cur);
    renderPlayers(s);
    renderLog(s);
    renderBattle(s);
    handleFx(s);
    renderInvite(s);
    renderGameOver(s);
  }

  function renderBoard(s, p, must) {
    const board = root.querySelector('#board');
    const opts = s.pending?.kind === 'move' && p && s.players[s.current].id === p.id && must.includes(p.id) ? s.pending.options : [];
    let html = '';
    for (const sp of SPACE_LIST) {
      const isOpt = opts.includes(sp.id);
      const cls = `space t${sp.tier} ${sp.type} ${isOpt ? 'opt' : ''}`;
      const label = sp.type === 'city' ? `<span class="lbl">${esc(sp.name)}</span>` : '';
      const icon = sp.type === 'city' ? (gymAt(sp.id) ? '🏟' : sp.id === ELITE_SPACE || sp.id === CHAMPION_SPACE ? '👑' : '🏙') : sp.type === 'event' ? '?' : '';
      const req = sp.requiredType ? ` · exige tipo ${sp.requiredType}` : '';
      html += `<div class="${cls}" style="left:${sp.x}%;top:${sp.y}%" ${isOpt ? `data-act="move" data-to="${sp.id}"` : ''} title="${esc(sp.name)} (#${sp.id})${req}">${icon}${label}</div>`;
      const wild = s.board[sp.id];
      if (wild) html += `<img class="wildmark ${wild.shiny ? 'shiny' : ''}" style="left:${sp.x}%;top:${sp.y}%" src="${monSprite(wild)}" alt="${esc(speciesName(wild.sp))}" title="${esc(speciesName(wild.sp))} Nv.${wild.lvl} (${wild.hp}/${maxHpOf(wild)} HP)">`;
    }
    // tokens: jogadores na mesma casa ficam lado a lado
    const byPos = {};
    s.players.forEach((pl, i) => { (byPos[pl.pos] ||= []).push([pl, i]); });
    for (const [pos, list] of Object.entries(byPos)) {
      const sp = getSpace(pos);
      list.forEach(([pl, i], k) => {
        const off = (k - (list.length - 1) / 2) * 1.6;
        html += `<div class="token ${s.current === i ? 'active' : ''}" style="left:calc(${sp.x}% + ${off}%);top:${sp.y}%;--pc:${playerColor(s, pl.id)}" data-act="trainer" data-pid="${esc(pl.id)}" title="${esc(pl.name)}">
          <img src="${avatarUrl(pl.avatar)}" alt="${esc(pl.name)}" data-color="${playerColor(s, pl.id)}"></div>`;
      });
    }
    board.innerHTML = html;
    board.classList.toggle('moving', opts.length > 0);
  }

  function renderTeam(s, p, must) {
    const box = root.querySelector('#g-team');
    if (!p) { box.innerHTML = ''; return; }
    box.innerHTML = p.team.map((m, i) => monCard(m, { index: i, lead: i === 0 })).join('') +
      (p.team.length < 6 ? `<div class="mon" style="display:flex;align-items:center;justify-content:center;opacity:.4;cursor:default">vaga</div>`.repeat(6 - p.team.length) : '');
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
      ? `<div class="turn-banner me">✅ Sua vez, ${esc(p.name)}!</div>`
      : `<div class="turn-banner">⏳ Vez de <b style="color:${playerColor(s, cur.id)}">${esc(cur.name)}</b>${cur.isBot ? ' (CPU)' : ''}</div>`;

    if (s.battle) {
      const inIt = s.battle.sides.some(x => x.pid === p?.id);
      box.innerHTML = banner + (inIt
        ? `<p class="small">Você está em batalha.</p><button class="btn primary" data-act="open-battle">⚔️ Abrir batalha</button>`
        : `<p class="small muted">${esc(cur.name)} está batalhando.</p><button class="btn" data-act="spectate">👀 Assistir</button>`) + afkButton(s, p, must);
      return;
    }
    if (s.pending?.kind === 'pvp_invite') {
      const from = s.players.find(x => x.id === s.pending.from), to = s.players.find(x => x.id === s.pending.to);
      box.innerHTML = banner + `<p class="small">🤺 ${esc(from.name)} desafiou ${esc(to.name)} — aguardando resposta.</p>` + afkButton(s, p, must);
      return;
    }
    if (!myTurn) {
      box.innerHTML = banner + `<p class="small muted">${phaseText(s, cur)}</p>` + afkButton(s, p, must);
      return;
    }

    const sp = getSpace(p.pos);
    let html = banner + `<div class="small">📍 ${esc(sp.name)} <span class="muted">(${tierName(sp.tier)})</span></div>`;
    if (s.phase === 'roll') {
      html += `<button class="btn primary pulse block" data-act="roll">🎲 Rolar dado</button>`;
      if (p.items.bicycle) html += `<button class="btn sm" data-act="use" data-item="bicycle">🚲 Usar Bicicleta (+2) ×${p.items.bicycle}</button>`;
    } else if (s.phase === 'move') {
      html += `<p class="small">🎲 Você tirou <b>${s.pending.roll}</b>${s.pending.bonus ? ` +${s.pending.bonus}` : ''}. Clique numa casa piscando no mapa:</p>
        <div class="row">${s.pending.options.map(id => `<button class="btn sm" data-act="move" data-to="${id}">${esc(getSpace(id).name)}${spaceHint(s, id)}</button>`).join('')}</div>`;
    }
    if (sp.type === 'city' && s.phase !== 'move') html += cityPanel(s, p, sp);
    if (s.phase === 'action') {
      const rivals = s.players.filter(q => q.id !== p.id && q.pos === p.pos);
      if (rivals.length && !s.turnFlags.pvp) {
        html += `<div class="divider"></div><div class="small">Treinadores aqui:</div><div class="row">${rivals.map(q =>
          `<button class="btn sm red" data-act="challenge" data-pid="${esc(q.id)}">🤺 Desafiar ${esc(q.name)}</button>`).join('')}</div>`;
      }
      html += `<button class="btn green block" data-act="end">✔️ Encerrar turno</button>`;
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
    return `${esc(cur.name)} está agindo em ${esc(getSpace(cur.pos).name)}.`;
  }

  function cityPanel(s, p, sp) {
    const gym = gymAt(sp.id);
    let h = `<div class="divider"></div><b>🏙️ ${esc(sp.name)}</b><div class="grid2" style="margin-top:6px">
      <button class="btn sm" data-act="heal">🏥 Centro Pokémon</button>
      <button class="btn sm" data-act="shop">🛒 Loja</button>
      <button class="btn sm" data-act="pc">💻 PC (${p.box.length})</button>`;
    if (p.items.fly) h += `<button class="btn sm" data-act="fly">🕊️ Voar</button>`;
    h += `</div>`;
    if (gym) {
      const done = p.badges.includes(gym.id);
      const lv = gym.team.map(t => t[1]);
      h += done ? `<p class="small">🎖️ Você já tem a ${esc(gym.badge)}.</p>`
        : `<button class="btn primary block" data-act="gym" ${s.turnFlags.gym ? 'disabled' : ''}>🏟️ Desafiar ${esc(gym.leader)} (Nv. ${Math.min(...lv)}–${Math.max(...lv)})</button>`;
    }
    if (sp.id === ELITE_SPACE) {
      h += p.badges.length >= BADGES_TO_LEAGUE && p.eliteStage < ELITE_FOUR.length
        ? `<button class="btn purple block" data-act="league" ${s.turnFlags.gym ? 'disabled' : ''}>👑 Enfrentar a Elite dos Quatro (${p.eliteStage}/4)</button>
           <p class="tiny muted">4 batalhas seguidas, sem cura entre elas. Perder reinicia o desafio.</p>`
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
    const icon = sp.type === 'city' ? ' 🏙' : sp.type === 'event' ? ' ❓' : ' 🌿';
    const w = s.board[id];
    return icon + (w ? ` (${esc(speciesName(w.sp))}${w.shiny ? '✨' : ''})` : '');
  }

  function renderPlayers(s) {
    root.querySelector('#g-players').innerHTML = s.players.map((pl, i) => `
      <div class="list-item" data-act="trainer" data-pid="${esc(pl.id)}" style="cursor:pointer;${s.current === i ? 'border-color:' + playerColor(s, pl.id) : ''}">
        ${avatarImg(pl, 'avatar sm', playerColor(s, pl.id))}
        <div class="grow"><b style="color:${playerColor(s, pl.id)}">${esc(pl.name)}</b>${pl.isBot ? ' <span class="chip">CPU</span>' : ''}${pl.left ? ' <span class="chip red">saiu</span>' : ''}
          <div class="tiny muted">📍 ${esc(getSpace(pl.pos).name)} · 🪙 ${pl.gold} · 🎖️ ${pl.badges.length} · 📖 ${pl.caught.length}${pl.eliteStage ? ` · 👑 ${pl.eliteStage}/4` : ''}${pl.skip ? ' · ⏸️' : ''}</div></div>
        <div class="row" style="gap:2px">${pl.team.slice(0, 6).map(m => `<img src="${monSprite(m)}" alt="${esc(speciesName(m.sp))}" style="width:22px;height:22px;object-fit:contain;${m.hp <= 0 ? 'filter:grayscale(1);opacity:.5' : ''}">`).join('')}</div>
      </div>`).join('');
  }

  function renderLog(s) {
    const box = root.querySelector('#g-log');
    const chatForm = root.querySelector('#g-chat');
    root.querySelectorAll('[data-act="tab"]').forEach(b => b.classList.toggle('primary', b.dataset.tab === ui.tab));
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
    if (ui.tab === 'log') {
      chatForm.classList.add('hidden');
      box.innerHTML = s.log.slice(-80).map(l => `<p class="${l.kind}"><span class="muted">[${l.t}]</span> ${esc(l.msg)}</p>`).join('');
    } else {
      chatForm.classList.remove('hidden');
      const chat = session.chat || [];
      box.innerHTML = chat.length ? chat.map(c => `<p class="chat"><b>${esc(c.name)}:</b> ${esc(c.text)}</p>`).join('') : '<p class="muted">Sem mensagens ainda.</p>';
    }
    if (atBottom || true) box.scrollTop = box.scrollHeight;
  }

  // ---------------------------------------------------------------- batalha
  function renderBattle(s) {
    const mini = root.querySelector('#g-battle-mini');
    const b = s.battle;
    const p = me();
    if (!b) {
      closeModal('battle');
      mini.style.display = 'none';
      ui.battleSub = null;
      // mostra o resultado de uma batalha que acabou de terminar (minha)
      const lb = s.lastBattle;
      if (lb && lb.fxSeq !== ui.lastBattleSeen) {
        ui.lastBattleSeen = lb.fxSeq;
        if (lb.sides.some(x => x.pid === p?.id)) {
          openModal('battle-end', 'Fim da batalha', `<h3 class="center" style="font-size:20px;margin:6px 0 10px">${esc(outcomeText(s, lb, p.id))}</h3>
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
      if (open) {
        open.querySelector('.body').innerHTML = html;
      } else {
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
      mini.innerHTML = `<b>⚔️ Batalha em andamento</b><div class="small muted">${esc(s.players.find(x => x.id === b.sides[0].pid)?.name)} vs ${esc(foe.kind === 'player' ? s.players.find(x => x.id === foe.pid)?.name : foe.kind === 'wild' ? speciesName(foe.team[0].sp) + ' selvagem' : foe.name)}</div>
        <div class="tiny" style="margin-top:4px">${b.log.slice(-3).map(esc).join('<br>')}</div>`;
    }
  }

  const battleHandlers = {
    'b-attack': () => { ui.battleSub = null; act({ type: 'battle', move: 'attack' }); },
    'b-sub': d => { ui.battleSub = ui.battleSub === d.sub ? null : d.sub; render(); },
    'b-switch': d => { ui.battleSub = null; act({ type: 'battle', move: 'switch', index: Number(d.index) }); },
    'b-ball': d => { ui.battleSub = null; act({ type: 'battle', move: 'ball', item: d.item }); },
    'b-item': d => {
      const p = me();
      const b = st().battle;
      const si = b.sides.findIndex(x => x.pid === p.id);
      let index = b.sides[si].active;
      if (ITEMS[d.item].kind === 'revive') index = p.team.findIndex(m => m.hp <= 0);
      if (index < 0) return toast('Ninguém desmaiado para reviver.', 'bad');
      ui.battleSub = null;
      act({ type: 'battle', move: 'item', item: d.item, index });
    },
    'b-flee': () => {
      const b = st().battle;
      if (b.kind !== 'wild' && !confirm('Desistir conta como derrota. Tem certeza?')) return;
      act({ type: 'battle', move: 'flee' });
    }
  };

  // ---------------------------------------------------------------- efeitos
  function handleFx(s) {
    if (s.fxSeq === ui.lastFx) return;
    ui.lastFx = s.fxSeq;
    for (const f of s.fx || []) {
      if (f.k === 'dice') showDie(f.value, f.bonus);
      if (f.k === 'shiny') toast('✨ Um Pokémon SHINY apareceu!', 'good');
      if (f.k === 'badge') { const g = GYMS.find(x => x.id === f.badge); toast(`🎖️ ${s.players.find(x => x.id === f.pid)?.name} ganhou a ${g?.badge}!`, 'good'); }
      if (f.k === 'hit') {
        const p = me();
        const b = s.battle;
        if (b) {
          const mySi = b.sides.findIndex(x => x.pid === p?.id);
          const defSi = 1 - f.side;
          const sel = defSi === (mySi < 0 ? 0 : mySi) ? 'me' : 'foe';
          const el = document.querySelector(`#battle .fighter[data-side="${sel}"]`);
          if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
        }
      }
    }
  }

  function showDie(value, bonus) {
    const d = document.createElement('div');
    d.className = 'dice-overlay';
    d.innerHTML = `<div class="die">${value}${bonus ? `<small>+${bonus}</small>` : ''}</div>`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }

  function renderInvite(s) {
    const p = me();
    const inv = s.pending?.kind === 'pvp_invite' ? s.pending : null;
    if (!inv || !p || inv.to !== p.id || !session.canAct(p.id)) { closeModal('invite'); return; }
    if (document.getElementById('invite')) return;
    const from = s.players.find(x => x.id === inv.from);
    const ov = openModal('invite', '🤺 Desafio PvP!', `
      <p><b>${esc(from.name)}</b> desafiou ${session.kind === 'local' ? `<b>${esc(p.name)}</b>` : 'você'} para uma batalha Pokémon!</p>
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
    openModal('over', '🏆 Fim de jogo', `
      <div class="banner-win">${w ? avatarImg(w, 'avatar') : ''}<h2>${esc(w ? w.name : '—')} venceu!</h2>
      <p class="muted">${esc(s.log.filter(l => l.kind === 'win').slice(-1)[0]?.msg || '')}</p></div>
      <table class="score"><tr><th>Treinador</th><th>Insígnias</th><th>Pokédex</th><th>Shinies</th><th>Pontos</th></tr>
      ${ranked.map(p => `<tr><td>${esc(p.name)}</td><td>${p.badges.length}</td><td>${p.caught.length}</td><td>${p.stats.shinies}</td><td><b>${score(p)}</b></td></tr>`).join('')}</table>
      ${session.kind === 'online' ? '<p class="small muted">A sua Pokédex, estatísticas e o seu melhor Pokémon foram salvos no seu perfil (Cofre).</p>' : ''}
      <button class="btn primary block" data-act="exit" style="margin-top:10px">Voltar ao menu</button>`, { wide: false });
    bindActions(document.getElementById('over'), { exit: () => { closeModal('over'); onExit(); } });
  }

  // ---------------------------------------------------------------- ações
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
    shop: () => M.openShop(session, act),
    pc: () => M.openPC(session, act),
    fly: () => M.openFly(session, act),
    'open-bag': () => M.openBag(session, act),
    'open-dex': () => M.openDex(session),
    'open-help': () => M.openHelp(),
    'open-battle': () => render(),
    spectate: () => { ui.spectate = true; render(); },
    'show-over': () => showOver(st()),
    trainer: d => M.openTrainer(session, d.pid),
    mon: d => M.openMon(session, act, Number(d.index)),
    tab: d => { ui.tab = d.tab; render(); },
    exit: () => {
      if (session.kind !== 'online' || st().status !== 'playing') return onExit();
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

  const off = session.on(() => render());
  render();
  return () => { off(); clearTimeout(ui.afkTimer); ['battle', 'battle-end', 'invite', 'over'].forEach(closeModal); };
}

function tierName(t) {
  return ['', 'Rosa', 'Verde', 'Azul', 'Vermelha', 'Amarela'][t] || '';
}

export { tierName };
