// Tela da partida: tabuleiro com zoom, painel de ações, equipe, jogadores, log/chat, batalha e fila de animações.
import { getSpace, useStateMap } from '../../shared/data/board.js';
import { GYMS, gymAt, ELITE_SPACE, CHAMPION_SPACE, ELITE_FOUR, BADGES_TO_LEAGUE } from '../../shared/data/trainers.js';
import { ITEMS } from '../../shared/data/items.js';
import { whoMustAct, score, AFK_SECONDS } from '../../shared/engine.js';
import { esc, toast, bindActions, openModal, closeModal, setModalBody } from './dom.js';
import { maxHpOf } from '../../shared/rules/monsters.js';
import { monSprite, typeLabel } from '../config.js';
import { monCard, playerColor, avatarImg, speciesName } from './common.js';
import { battleHtml, outcomeText, playBattleFx } from './battle.js';
import { BoardView } from './board.js';
import { anim, rollDice, turnBanner, eventCard, battleIntro, captureAnim, confetti, evolutionAnim, victoryFx, miniCapture } from './fx.js';
const vicOf = (s, pid) => s?.players?.find(x => x.id === pid)?.cosmetic?.victory || null;
import * as M from './modals.js';
import { renderTrades } from './trade.js';
import { badgeStatus } from './board.js';
import { badgeUrl, itemUrl } from '../config.js';
import { missionsHtml, companionHtml, openCompanionPicker, companionImg, bondBadge } from './missions.js';
import { COMPANIONS } from '../../shared/data/companions.js';
import { renderRaid } from './raid.js';
import { toggleSocial } from './social.js';
import { divInfo } from '../../shared/data/league.js';
import { api } from '../api.js';
import { WeatherLayer, weatherChipHtml } from './weather.js';
import { WEATHERS } from '../../shared/rules/weather.js';
import { GAME_RULES, stormAt, ownerOf, citiesOf, GARRISON_MAX, alivePlayers } from '../../shared/rules/modes.js';

const BATTLE_FX = new Set(['mega', 'transform', 'assist', 'hit', 'heal', 'faint', 'switch', 'status', 'status_dmg', 'status_skip', 'status_cure', 'buff', 'debuff', 'weather_dmg']);
const SPEEDS = [[1, '🎬 Animações: normal'], [2, '⚡ Animações: rápidas'], [0, '⏭️ Animações: desligadas']];

export function mountGame(root, session, opts = {}) {
  const { onExit } = opts;
  const ui = {
    autoWatch: (() => { try { return !!localStorage.getItem('pmhx_autowatch'); } catch { return false; } })(),
    tab: 'log', mtab: 'team', battleSub: null, spectate: false, afkTimer: null, overShown: false,
    shown: session.state, queue: [], playing: false, listeners: new Set(), lastBattleSeen: session.state?.lastBattle?.fxSeq ?? 0
  };

  root.innerHTML = `
    <div id="game" data-mtab="team">
      <header class="topbar">
        <div class="row"><h1>Pokémon Master Trainer HEX</h1><span class="chip" id="g-mode"></span><span class="chip gold" id="g-turn"></span><span id="g-rules"></span><span id="g-weather"></span></div>
        <div class="stats" id="g-stats"></div>
        <div class="row tb-btns">
          <button class="btn sm" data-act="open-bag" title="Mochila">🎒<span class="lbl-txt"> Mochila</span></button>
          <button class="btn sm" data-act="open-dex" title="Pokédex">📖<span class="lbl-txt"> Pokédex</span></button>
          <button class="btn sm soc-tb" data-act="social" title="Chat global e treinadores online">💬<span class="lbl-txt"> <span data-soc-online>0</span> online</span><i data-soc-badge></i></button>
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
          <div id="g-trades" style="display:none"></div>
          <div class="panel actions dock" id="g-actions"></div>
          <div class="panel" id="g-battle-mini" style="display:none"></div>
          <div class="mtabs">
            <button class="btn sm" data-act="mtab" data-t="team">🛡️ Equipe</button>
            <button class="btn sm" data-act="mtab" data-t="goals">🏅 Metas</button>
            <button class="btn sm" data-act="mtab" data-t="players">👥 Jogadores</button>
            <button class="btn sm" data-act="mtab" data-t="log">📜 Log/Chat</button>
          </div>
          <div class="panel panel-team-m" data-mtab="team"><div class="spread" style="margin-bottom:6px"><b>🛡️ Sua equipe</b><span class="tiny muted g-who"></span></div><div class="team" id="g-team-m"></div></div>
          <div class="panel" data-mtab="goals" id="g-goals-panel">
            <div id="g-companion"></div>
            <div id="g-missions"></div>
            <div id="g-modepanel"></div>
            <div class="spread" style="margin:8px 0 6px"><b>🏅 Insígnias</b><span class="tiny muted" id="g-badge-count"></span></div>
            <div class="badge-panel" id="g-badges"></div>
          </div>
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
    act: a => act(a),
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
    while (ui.queue.length && !ui.dead) {
      const next = ui.queue.shift();
      const prev = ui.shown;
      try { await playFx(prev, next); } catch (e) { console.error('animação', e); }
      if (prev && next.fxSeq !== prev.fxSeq && !ui.spectate) { const pl = (next.fx || []).find(f => f.k === 'placed' && f.pid === vid() && f.uid); if (pl) ui.placeAsk = pl.uid; }
      ui.shown = next;
      render();
    }
    ui.playing = false;
    document.body.classList.remove('anim-busy');
    if (!ui.dead) render();
    askPlace();
  }
  // ➕ depois da captura (e da batalha fechar): equipe ou PC?
  function askPlace() {
    if (!ui.placeAsk || ui.dead) return;
    const s = S();
    if (s?.battle && !s.battle.over && s.battle.sides.some(x => x.pid === vid())) return; // espera a batalha acabar
    if (s?.raid) return;
    const uid = ui.placeAsk; ui.placeAsk = null;
    setTimeout(() => { if (!ui.dead) M.openPlaceCaught(viewSession(), act, uid); }, 350);
  }

  async function playFx(prev, next) {
    useStateMap(next);
    if (!prev || next.fxSeq === prev.fxSeq || !anim.speed) return;
    const fxs = next.fx || [];
    const v = vid();
    const battleOpen = !!document.getElementById('battle') && prev.battle && !prev.battle.over;
    let round = [];
    const flushRound = async () => { if (round.length && battleOpen) await playBattleFx(round); round = []; };

    for (let i = 0; i < fxs.length; i++) {
      if (ui.dead) return; // saiu da partida: para as animações na hora
      const f = fxs[i];
      if (BATTLE_FX.has(f.k)) { round.push(f); continue; }
      await flushRound();
      switch (f.k) {
        case 'dice': {
          const p = next.players.find(x => x.id === f.pid);
          await rollDice({ value: f.value, bonus: f.bonus, name: p?.name, color: playerColor(next, f.pid), mine: f.pid === v && session.canAct(v), skin: p?.cosmetic?.dice });
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
          } else if (ui.spectate || f.raid) {
            // assistindo: a mesma animação da Pokébola, com o nome de quem jogou
            const escaped = fxs.slice(i + 1).some(x => x.k === 'battle_end' && x.result === 'escaped');
            await captureAnim(f, { escaped, who: nameOf(f.pid), ballName: ITEMS[f.ball]?.name });
          } else miniCapture(f, nameOf(f.pid), ITEMS[f.ball]?.name);
          break;
        case 'turn':
          await turnBanner({ player: next.players.find(x => x.id === f.pid), color: playerColor(next, f.pid), mine: f.pid === v && session.canAct(f.pid), turn: f.turn });
          break;
        case 'evolve':
          if (f.pid === v) await evolutionAnim(f, {});
          else toast(`✨ O ${speciesName(f.from)} de ${nameOf(f.pid)} evoluiu para ${speciesName(f.to)}!`, 'info');
          break;
        case 'badge': {
          const g = GYMS.find(x => x.id === f.badge);
          toast(`🎖️ ${nameOf(f.pid)} conquistou a ${g?.badge}!`, 'good');
          if (f.pid === v) victoryFx(vicOf(next, v), 0.8);
          break;
        }
        case 'mission_done':
          if (f.pid === v) {
            await eventCard({ k: 'event', pid: f.pid, id: 'mission', title: 'Missão completa!', icon: '🎯', tone: 'good', lore: f.text,
              effects: f.rewards.map(t => ({ text: t, tone: 'good', icon: '🎁' })), trainer: f.companion ? { name: '', sprite: COMPANIONS[f.companion]?.sprite } : undefined }, { name: nameOf(f.pid), mine: true });
          } else toast(`🎯 ${nameOf(f.pid)} completou uma missão!`, 'info');
          break;
        case 'quest':
          if (f.pid === v) toast(`🗺️ Convite: chegue a ${getSpace(f.space)?.name} em até ${f.rounds} rodadas! (veja na aba Metas)`, 'good');
          break;
        case 'quest_expired':
          if (f.pid === v) toast(`⌛ O convite para ${getSpace(f.space)?.name} expirou.`, 'info');
          break;
        case 'storm':
          toast(`🌀 A tempestade avançou! Área segura: ${f.ring} casa${f.ring === 1 ? '' : 's'} do centro.`, 'bad');
          break;
        case 'storm_dmg':
          if (f.pid === v) toast(`🌀 Você está na tempestade! Sua equipe perdeu ${f.dmg} de HP.`, 'bad');
          break;
        case 'eliminated':
          if (f.pid === v) await eventCard({ k: 'event', pid: f.pid, id: 'eliminated', title: 'Você foi eliminado!', icon: '💀', tone: 'bad', lore: `${f.why[0].toUpperCase() + f.why.slice(1)}. Você ficou em ${f.place}º lugar — dá para continuar assistindo.`, effects: [] }, { name: nameOf(f.pid), mine: true });
          else toast(`💀 ${nameOf(f.pid)} ${f.why} e foi eliminado (${f.place}º)!`, 'info');
          break;
        case 'joined':
          if (f.pid !== v) toast(`🙋 ${nameOf(f.pid)} entrou na partida!`, 'good');
          break;
        case 'kicked':
          if (f.pid === v) toast('🚫 O anfitrião removeu você da partida.', 'bad');
          else toast(`🚫 ${nameOf(f.pid)} foi removido da partida.`, 'info');
          break;
        case 'city_taken': {
          const g = GYMS.find(x => x.id === f.city);
          toast(`🏰 ${nameOf(f.pid)} dominou ${g?.city}${f.from ? ` (tomada de ${nameOf(f.from)})` : ''}!`, f.pid === v ? 'good' : 'info');
          if (f.pid === v) victoryFx(vicOf(next, v), 0.6);
          break;
        }
        case 'city_lost':
          if (f.pid === v) toast(`😱 Você perdeu ${GYMS.find(x => x.id === f.city)?.city}! Seus defensores voltaram para o PC.`, 'bad');
          break;
        case 'weather': {
          const W = WEATHERS[f.id];
          toast(`${W.icon} O clima mudou: ${W.name}! ${W.desc}`, 'info');
          break;
        }
        case 'hotspot': {
          const nm = { chest: '🎁 Baú do Tesouro', raid: '🔥 Raid Relâmpago', mystery: '❔ Pokémon Misterioso' }[f.kind];
          toast(`${nm} apareceu em ${getSpace(f.space).name}! Pare lá em até ${f.rounds} rodadas.`, 'good');
          break;
        }
        case 'hotspot_gone':
          toast(`⌛ O evento em ${getSpace(f.space).name} sumiu.`, 'info');
          break;
        case 'raid_start':
          toast('🔥 RAID EM GRUPO! Escolha um Pokémon para lutar juntos.', 'good');
          break;
        case 'raid_end':
          if (f.win && (f.party || []).includes(v)) victoryFx(vicOf(next, v), 0.9); else if (f.win) confetti(60);
          break;
        case 'trade_done':
          if (f.ok && (f.from === v || f.to === v)) { toast('🤝 Troca concluída!', 'good'); confetti(60); }
          else if (!f.ok && f.from === v) toast(`🤝 ${nameOf(f.to)} recusou sua troca.`, 'bad');
          break;
        case 'placed': // ➕ escolher na hora: equipe ou PC
          if (f.pid === v && f.where === 'box' && !f.uid) toast(`💻 ${speciesName(f.sp)}${f.shiny ? ' ✨' : ''} foi para o PC — sua equipe já tem 6.`, 'info');
          break;
        case 'win':
          victoryFx(vicOf(next, f.pid || next.winner), 1);
          break;
      }
    }
    await flushRound();
  }

  // ================================================================ render
  function render() {
    if (ui.dead) return;
    root.querySelector('#game')?.classList.toggle('duel', session.state?.kind === 'duel');
    const s = S();
    if (!s) return;
    useStateMap(s); // mapa da partida (Kanto ou Expedição)
    const p = me();
    const must = whoMustAct(s);
    const cur = s.players[s.current];
    root.querySelector('#game').dataset.mtab = ui.mtab;
    root.querySelectorAll('[data-act="mtab"]').forEach(b => b.classList.toggle('primary', b.dataset.t === ui.mtab));
    const mo = session.match?.options || {};
    root.querySelector('#g-mode').textContent = session.kind !== 'online' ? '📱 Offline' : mo.solo ? '🤖 Treino (salva na conta)' : `🌐 Sala ${session.match?.code || ''} · ${{ balanced: '⚖️ Balanceado', collection: '📦 Coleção', ranked: '🏆 Competitivo' }[mo.mode] || ''}`;
    root.querySelector('#g-turn').textContent = `Turno ${s.turn}${s.options.turnLimit ? '/' + s.options.turnLimit : ''}`;
    const mc = root.querySelector('#g-rules');
    if (mc) mc.innerHTML = (s.rules && s.rules !== 'classic' ? `<span class="chip ${s.rules === 'royale' ? 'red' : 'gold'}">${GAME_RULES[s.rules].icon} ${GAME_RULES[s.rules].name}${s.rules === 'royale' ? ` · 🌀 ${s.royale.ring}` : ''}</span>` : '')
      + (s.options?.hardcore ? ' <span class="chip red" title="Hardcore: perdeu a equipe, está fora e perde tudo da partida">☠️ Hardcore</span>' : '');
    const wc = root.querySelector('#g-weather');
    if (wc) wc.innerHTML = s.kind === 'duel' ? '' : weatherChipHtml(s);
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
    renderGoals(s, p);
    renderLog(s);
    if (!ui.playing) {
      renderBattle(s);
      renderInvite(s);
      renderRaid(s, vid(), act);
      if (s.rules === 'conquest') renderGarrison(s, p);
      if (p) renderTrades(root, s, p.id, viewSession());
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
    if (gym && s.rules === 'conquest') {
      const owner = ownerOf(s, gym.id);
      const gar = s.conquest.garrison[gym.id];
      if (owner === p.id) h += `<p class="small">🏰 Cidade sua · guarnição: ${gar.length ? gar.map(m => esc(speciesName(m.sp))).join(', ') : 'guarda da cidade'}</p>
        <button class="btn block" data-act="gym" ${s.turnFlags.manage ? 'disabled' : ''}>🛡️ Reorganizar a guarnição</button>`;
      else if (!owner) h += `<button class="btn primary block" data-act="gym" ${s.turnFlags.gym ? 'disabled' : ''}>⚔️ Desafiar ${esc(gym.leader)} e dominar a cidade</button>`;
      else h += `<p class="small">🏰 Dominada por <b style="color:${playerColor(s, owner)}">${esc(nameOf(owner))}</b> · ${gar.filter(m => m.hp > 0).length || 'só a guarda'} ${gar.filter(m => m.hp > 0).length ? 'defensor(es)' : ''}</p>
        <button class="btn red block" data-act="gym" ${s.turnFlags.gym ? 'disabled' : ''}>⚔️ Atacar a cidade</button>`;
    } else if (gym && s.rules === 'royale') {
      h += '<p class="small muted">⚔️ Battle Royale: ginásios fechados. Cada Centro Pokémon cura você só uma vez.</p>';
    } else if (gym) {
      const lv = gym.team.map(t => t[1]);
      h += p.badges.includes(gym.id) ? `<p class="small">🎖️ Você já tem a ${esc(gym.badge)}.</p>`
        : `<button class="btn primary block" data-act="gym" ${s.turnFlags.gym ? 'disabled' : ''}>🏟️ Desafiar ${esc(gym.leader)} (Nv. ${Math.min(...lv)}–${Math.max(...lv)})</button>`;
    }
    if (sp.id === ELITE_SPACE && (s.rules || 'classic') === 'classic') {
      h += p.badges.length >= BADGES_TO_LEAGUE && p.eliteStage < ELITE_FOUR.length
        ? `<button class="btn purple block" data-act="league" ${s.turnFlags.gym ? 'disabled' : ''}>👑 Enfrentar a Elite dos Quatro (${p.eliteStage}/4)</button><p class="tiny muted">4 batalhas seguidas, sem cura. Perder reinicia o desafio.</p>`
        : p.eliteStage >= ELITE_FOUR.length ? `<p class="small">👑 Elite vencida! Vá à Arena Final.</p>` : '';
    }
    if (sp.id === CHAMPION_SPACE && (s.rules || 'classic') === 'classic') {
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

  function renderGoals(s, p) {
    const panel = root.querySelector('#g-goals-panel');
    if (!panel) return;
    panel.style.display = s.kind === 'duel' ? 'none' : '';
    if (s.kind === 'duel') return;
    const viewer = p || s.players[s.current];
    const mp = root.querySelector('#g-modepanel');
    if (mp) mp.innerHTML = questHtml(s, viewer) + modePanelHtml(s, viewer);
    const list = badgeStatus(s, viewer);
    root.querySelector('#g-badge-count').textContent = `${viewer.badges.length}/${list.length}${viewer.badges.length >= list.length ? ' · Liga liberada!' : ''}`;
    root.querySelector('#g-badges').innerHTML = list.map(g => `<div class="badge-item ${g.owned ? 'owned' : 'missing'} ${g.next ? 'next' : ''}" data-act="goto-gym" data-space="${g.space}" title="${esc(g.leader)} · ${esc(typeLabel(g.type))}">
      <img src="${badgeUrl(g.id)}" alt=""><b>${esc(g.city.replace(' City', '').replace(' Island', ''))}</b>
      <span class="tiny">${g.owned ? '✔ conquistada' : g.dist !== null ? `${g.next ? '➜ ' : ''}${g.dist} casas` : '—'}</span></div>`).join('');
    renderMissions(s, viewer);
  }

  /** Convite de viagem pendente. */
  function questHtml(s, viewer) {
    const q = viewer?.quest;
    if (!q) return '';
    const left = Math.max(0, q.until - s.turn);
    return `<div class="quest-box" data-act="goto-gym" data-space="${q.space}"><b>🗺️ Convite de viagem</b>
      <div class="small">Chegue a <b>${esc(getSpace(q.space)?.name || '?')}</b> ${left ? `em até ${left} rodada${left > 1 ? 's' : ''}` : 'nesta rodada'} — prêmio: ouro, Ultra Balls e uma surpresa.</div></div>`;
  }

  /** Painel do modo: Battle Royale (vivos e tempestade) ou Conquista (cidades). */
  function modePanelHtml(s, viewer) {
    if (s.rules === 'royale') {
      const R = s.royale;
      const alive = alivePlayers(s);
      const me = stormAt(s, viewer.pos);
      return `<div class="mode-box royale"><div class="spread"><b>⚔️ Battle Royale</b><span class="tiny">${alive.length}/${s.players.length} vivos</span></div>
        <div class="small">🌀 Área segura: até <b>${R.ring}</b> casa${R.ring === 1 ? '' : 's'} de <b class="link" data-act="goto-gym" data-space="${R.center}" style="color:#8ff0bd;cursor:pointer">🎯 ${esc(getSpace(R.center).name)}</b>${s.turn < 3 ? ' · fecha a partir da rodada 3' : ''}</div>
        <div class="small ${me.in ? 'bad' : me.soon ? 'warn' : 'good'}">${me.in ? '⚠️ Você está NA tempestade — a equipe perde HP a cada rodada!' : me.soon ? '⚠️ A tempestade chega aqui na próxima rodada!' : '✅ Você está na área segura.'}</div>
        <div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap">${s.players.map(pl => `<span class="chip ${pl.out ? 'red' : ''}" style="${pl.out ? '' : 'border-color:' + playerColor(s, pl.id)}">${pl.out ? '💀' : '❤️'} ${esc(pl.name)}${pl.out ? ` (${pl.place}º)` : ''}</span>`).join('')}</div></div>`;
    }
    if (s.rules === 'conquest') {
      const rank = [...s.players].sort((a, b) => citiesOf(s, b.id) - citiesOf(s, a.id));
      return `<div class="mode-box conquest"><div class="spread"><b>🏰 Conquista</b><span class="tiny">até o turno ${s.options.turnLimit}</span></div>
        <div class="conq-list">${GYMS.map(g => {
          const o = ownerOf(s, g.id), gar = s.conquest.garrison[g.id];
          return `<div class="conq-city" data-act="goto-gym" data-space="${g.space}" style="--oc:${o ? playerColor(s, o) : '#777'}">
            <b>${esc(g.city.replace(' City', '').replace(' Island', ''))}</b><span class="tiny">${o ? esc(nameOf(o)) : 'neutra'} · ${esc(typeLabel(g.type))} +10%</span>
            <span class="conq-gar">${o ? (gar.length ? gar.map(m => `<img src="${monSprite(m)}" alt="" title="${esc(speciesName(m.sp))} Nv.${m.lvl} ${m.hp}/${maxHpOf(m)}" style="${m.hp <= 0 ? 'filter:grayscale(1);opacity:.4' : ''}">`).join('') : '🛡️') : `👤 ${esc(g.leader)}`}</span></div>`;
        }).join('')}</div>
        <div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap">${rank.map(pl => `<span class="chip" style="border-color:${playerColor(s, pl.id)}">🏰 ${citiesOf(s, pl.id)} · ${esc(pl.name)}</span>`).join('')}</div></div>`;
    }
    return '';
  }

  /** Conquista: escolher até 3 Pokémon (equipe ou PC) para defender a cidade. */
  function renderGarrison(s, p) {
    const pend = s.pending;
    const mine = pend?.kind === 'garrison' && pend.pid === p?.id && session.canAct(p.id);
    if (!mine) { closeModal('garrison'); ui.garrisonPick = null; return; }
    if (document.getElementById('garrison')) return;
    ui.garrisonPick = [];
    const gym = GYMS.find(g => g.id === pend.city);
    const old = s.conquest.garrison[pend.city];
    const all = [...p.team.map(m => ({ m, where: 'Equipe' })), ...old.map(m => ({ m, where: 'Guarnição' })), ...p.box.map(m => ({ m, where: 'PC' }))];
    const body = () => `<p class="small">Escolha até <b>${GARRISON_MAX}</b> Pokémon para defender <b>${esc(gym.city)}</b>. Eles saem da sua equipe/PC e lutam sozinhos (CPU) contra quem atacar. Sem ninguém, fica a guarda da cidade (fraca). A equipe precisa manter pelo menos 1 de pé.</p>
      <div class="gar-grid">${all.map(({ m, where }) => `<div class="gar-card ${ui.garrisonPick.includes(m.uid) ? 'on' : ''}" data-act="gar-pick" data-uid="${esc(m.uid)}">
        <img src="${monSprite(m)}" alt=""><b>${esc(m.nick || speciesName(m.sp))}</b><span class="tiny">Nv.${m.lvl} · ${m.hp}/${maxHpOf(m)} HP · ${where}</span></div>`).join('')}</div>
      <button class="btn primary block" data-act="gar-ok" style="margin-top:8px">🛡️ Confirmar guarnição (${ui.garrisonPick.length}/${GARRISON_MAX})</button>`;
    const ov = openModal('garrison', '🏰 Guarnição da cidade', body(), { wide: true, closable: false });
    bindActions(ov, {
      'gar-pick': d => {
        const i = ui.garrisonPick.indexOf(d.uid);
        if (i >= 0) ui.garrisonPick.splice(i, 1); else if (ui.garrisonPick.length < GARRISON_MAX) ui.garrisonPick.push(d.uid);
        setModalBody('garrison', body());
      },
      'gar-ok': () => { const uids = ui.garrisonPick.slice(); closeModal('garrison'); act({ type: 'garrison', uids }); }
    });
  }

  function renderMissions(s, viewer) {
    const el = root.querySelector('#g-missions'), comp = root.querySelector('#g-companion');
    if (el) el.innerHTML = missionsHtml(s, viewer);
    if (comp) comp.innerHTML = companionHtml(s, viewer, viewer.id === session.viewerId());
  }

  function renderPlayers(s) {
    root.querySelector('#g-players').innerHTML = s.players.map((pl, i) => `
      <div class="list-item" data-act="trainer" data-pid="${esc(pl.id)}" style="cursor:pointer;${s.current === i ? 'border-color:' + playerColor(s, pl.id) : ''}">
        ${avatarImg(pl, 'avatar sm', playerColor(s, pl.id))}
        <div class="grow"><b style="color:${playerColor(s, pl.id)}">${esc(pl.name)}</b>${pl.companion && COMPANIONS[pl.companion] ? ` <span class="chip ${(pl.bond?.[pl.companion] || 1) >= 10 ? 'intimate-chip' : ''}">${COMPANIONS[pl.companion].icon} ${esc(COMPANIONS[pl.companion].name)}${(pl.bond?.[pl.companion] || 1) >= 10 ? ' ❤️' : ` · Nv.${pl.bond?.[pl.companion] || 1}`}</span>` : ''}${pl.megaKey ? ` <span class="chip purple" title="🔗 Bracelete Mega${s.options?.megas ? ' — pode Mega Evoluir nesta partida' : ''}"><img class="chip-ic" src="${itemUrl('mega_bracelet')}" alt="">Mega</span>` : ''}${pl.isBot ? ' <span class="chip">CPU</span>' : ''}${pl.left ? ' <span class="chip red">saiu</span>' : ''}${pl.kicked ? ' <span class="chip red">🚫 removido</span>' : pl.out ? ` <span class="chip red">💀 ${s.rules === 'royale' ? pl.place + 'º' : 'fora'}</span>` : ''}${pl.lateJoin ? ' <span class="chip green" title="Entrou no meio da partida">🙋</span>' : ''}${s.rules === 'conquest' ? ` <span class="chip">🏰 ${citiesOf(s, pl.id)}</span>` : ''}${pl.cosmetic?.title ? `<div class="player-title">${esc(pl.cosmetic.title)}</div>` : ''}
          <div class="tiny muted">📍 ${esc(getSpace(pl.pos).name)} · 🪙 ${pl.gold} · 🎖️ ${pl.badges.length} · 📖 ${pl.caught.length}${pl.eliteStage ? ` · 👑 ${pl.eliteStage}/4` : ''}${pl.skip ? ' · ⏸️' : ''}</div></div>
        <div class="row" style="gap:2px">${pl.team.slice(0, 6).map(m => `<img src="${monSprite(m)}" alt="${esc(speciesName(m.sp))}" style="width:24px;height:24px;object-fit:contain;${m.hp <= 0 ? 'filter:grayscale(1);opacity:.5' : ''}">`).join('')}</div>
        ${canKick(s, pl) ? `<button class="btn sm red kick-btn" data-act="kick" data-pid="${esc(pl.id)}" title="Remover da partida (o anfitrião não precisa esperar a CPU)">🚫</button>` : ''}
      </div>`).join('');
  }

  // anfitrião da sala online pode remover outros humanos no meio da partida
  function canKick(s, pl) {
    const m = session.match;
    return session.kind === 'online' && m && !m.options?.solo && m.hostId === vid() && pl.id !== vid() && !String(pl.id).startsWith('cpu_') && !pl.kicked && s.status === 'playing';
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
          if (/Vitória/.test(txt)) victoryFx(vicOf(s, p.id), 0.6);
          openModal('battle-end', 'Fim da batalha', `<h3 class="center" style="font-size:22px;margin:6px 0 10px">${esc(txt)}</h3>
            <div class="battle-log">${lb.log.map(l => `<p>${esc(l)}</p>`).join('')}</div>
            <button class="btn primary block" data-close="battle-end" style="margin-top:10px">Continuar</button>`);
        }
      }
      return;
    }
    const inIt = b.sides.some(x => x.pid === p?.id);
    // "assistir sempre": abre sozinho cada batalha nova dos outros (até fechar)
    const bKey = `${s.turn}:${b.sides[0].pid}:${b.kind}`;
    if (!inIt && ui.autoWatch && ui.dismissedBattle !== bKey) ui.spectate = true;
    ui.battleKey = bKey;
    if (inIt || ui.spectate) {
      mini.style.display = 'none';
      const html = battleHtml(s, p?.id, { sub: ui.battleSub }, !!p && session.canAct(p.id));
      const open = document.getElementById('battle');
      if (open) open.querySelector('.body').innerHTML = html;
      else {
        const ov = openModal('battle', inIt ? '⚔️ Batalha' : `👀 Assistindo: ${nameOf(b.sides[0].pid)}`, html, { wide: true, closable: !inIt, onClose: () => { ui.spectate = false; ui.dismissedBattle = ui.battleKey; render(); } });
        ov.querySelector('.modal').classList.add('battle');
        bindActions(ov, battleHandlers);
      }
      const lg = document.getElementById('battle-log');
      if (lg) lg.scrollTop = lg.scrollHeight;
      // clima também na arena
      const arena = document.getElementById('arena');
      if (arena && !arena.querySelector('.weather-canvas')) { ui.arenaWeather?.destroy(); ui.arenaWeather = new WeatherLayer(arena, { density: 0.7 }); }
      ui.arenaWeather?.set(s.weather?.id || 'clear');
    } else {
      closeModal('battle');
      mini.style.display = '';
      const foe = b.sides[1];
      mini.innerHTML = `<b>⚔️ Batalha em andamento</b><div class="small muted">${esc(nameOf(b.sides[0].pid))} vs ${esc(foe.kind === 'player' ? nameOf(foe.pid) : foe.kind === 'wild' ? speciesName(foe.team[0].sp) + ' selvagem' : foe.name)}</div>
        <div class="tiny" style="margin-top:4px">${b.log.slice(-3).map(esc).join('<br>')}</div>
        <button class="btn sm blue block" data-act="spectate" style="margin-top:6px">👀 Assistir a batalha</button>
        <label class="tiny row" style="gap:6px;margin-top:6px;cursor:pointer"><input type="checkbox" data-act="auto-watch" ${ui.autoWatch ? 'checked' : ''}> Abrir sempre as batalhas dos outros</label>`;
    }
  }

  const battleHandlers = {
    'b-attack': d => { ui.battleSub = null; act({ type: 'battle', move: 'attack', slot: Number(d.slot || 0) }); },
    'b-mega': () => act({ type: 'battle', move: 'mega' }),
    'b-form': d => { if (d.op === 'forget' && !confirm('Esquecer esta forma guardada?')) return; act({ type: 'battle', move: 'form', op: d.op, i: Number(d.i || 0) }); },
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
    if (s.status === 'finished' && ui.overShown && !ui.leagueShown && (s.leagueChanges?.[vid()] || s.bondChanges?.[vid()] || s.bagChanges?.[vid()] || s.serieResult) && document.getElementById('over')) {
      ui.leagueShown = true; closeModal('over'); showOver(s); return; // o resultado da Liga chega logo depois do fim
    }
    if (s.status !== 'finished' || ui.overShown) return;
    ui.overShown = true;
    showOver(s);
  }

  // 🏆 Liga: +PL / subiu ou caiu de divisão
  function leagueLine(s) {
    const lc = s.leagueChanges?.[session.viewerId()];
    if (!lc) return '';
    const d = divInfo(lc.div);
    return `<div class="lg-me" style="--ec:${d.color};margin-top:8px"><span class="elo-big">${d.icon}</span><div><div class="small muted">Liga Ranqueada</div>
      <b style="color:${d.color}">${esc(d.name)}</b> · ${lc.lp} PL <b class="lg-delta" style="color:${lc.delta >= 0 ? '#8ff0bd' : '#ff9b9e'}">${lc.delta >= 0 ? '+' : ''}${lc.delta} PL</b>
      ${lc.change === 'up' ? '<div class="small" style="color:#8ff0bd">⬆️ Subiu de divisão!</div>' : lc.change === 'down' ? '<div class="small" style="color:#ff9b9e">⬇️ Caiu de divisão.</div>' : ''}</div></div>`;
  }

  // ⚽ Liga das Séries: pontos do ataque
  function serieLine(s) {
    const r = s.serieResult;
    if (!r) return '';
    return `<div class="lg-me" style="--ec:#4ad07a;margin-top:8px"><span class="elo-big">⚽</span><div><div class="small muted">Liga das Séries</div>
      <b>${r.win ? `+${r.pts} pontos` : 'Sem pontos (a defesa segurou)'}</b> · saldo <b style="color:${r.sp >= 0 ? '#8ff0bd' : '#ff9b9e'}">${r.sp >= 0 ? '+' : ''}${r.sp}</b>
      <div class="tiny muted">Derrubou ${r.kos} · perdeu ${r.lost}</div></div></div>`;
  }

  // 💞 laço do companheiro no fim da partida
  function bondLine(s) {
    const bc = s.bondChanges?.[session.viewerId()];
    const c = bc && COMPANIONS[bc.comp];
    if (!c) return '';
    return `<div class="comp-box ${bc.lvl >= 10 ? 'intimate' : ''}" style="margin-top:8px">${companionImg(bc.comp)}<div class="grow"><b>${c.icon} ${esc(c.name)}</b> ${bondBadge(bc.lvl)}
      <div class="small">+${bc.gain} pontos de laço${bc.intimate ? ' · <b style="color:#ff9ccf">❤️ Vocês ficaram ÍNTIMOS!</b>' : bc.up ? ` · <b style="color:#8ff0bd">⬆️ Laço Nv.${bc.lvl}!</b>` : ''}</div></div></div>`;
  }

  // 🎒 itens que foram para a Mochila da conta
  function bagLine(s) {
    const b = s.bagChanges?.[session.viewerId()];
    const e = b ? Object.entries(b) : [];
    return e.length ? `<p class="small" style="margin-top:6px">🎒 Foram para a sua Mochila da conta: <b>${e.map(([id, q]) => `${q}x ${esc(ITEMS[id]?.name || id)}`).join(', ')}</b></p>` : '';
  }

  function showOver(s) {
    const w = s.players.find(p => p.id === s.winner);
    if (s.kind === 'duel') { // duelo: resultado simples (vitória/derrota e Elo)
      const vid = session.viewerId();
      const d = s.ratingChanges?.[vid];
      if (w?.id === vid) victoryFx(vicOf(s, vid), 1); else confetti(40);
      const ov = openModal('over', w?.id === vid ? '🏆 Vitória!' : '⚔️ Fim do duelo', `
        <div class="banner-win">${w ? avatarImg(w, 'avatar') : ''}<h2>${esc(w ? w.name : '—')} venceu o duelo!</h2>
        <p class="muted">${esc(s.log.filter(l => l.kind === 'win').slice(-1)[0]?.msg || '')}</p></div>
        ${d !== undefined ? `<p class="center" style="font-size:18px">Seu Elo: <b style="color:${d >= 0 ? '#8ff0bd' : '#ff9b9e'}">${d >= 0 ? '+' : ''}${d}</b></p>` : ''}${leagueLine(s)}${serieLine(s)}${bondLine(s)}
        <button class="btn primary block" data-act="exit" style="margin-top:10px">${esc(opts.backLabel || 'Voltar ao menu')}</button>`);
      bindActions(ov, { exit: () => { closeModal('over'); onExit(); } });
      return;
    }
    const ranked = s.rules === 'royale' ? [...s.players].sort((a, b) => (a.place || 1) - (b.place || 1))
      : s.rules === 'conquest' ? [...s.players].sort((a, b) => citiesOf(s, b.id) - citiesOf(s, a.id) || score(b) - score(a))
      : [...s.players].sort((a, b) => score(b) - score(a));
    victoryFx(vicOf(s, w?.id), 1);
    const extraTh = s.rules === 'royale' ? '<th>Lugar</th>' : s.rules === 'conquest' ? '<th>Cidades</th>' : '';
    const extraTd = p => s.rules === 'royale' ? `<td><b>${p.place || 1}º</b></td>` : s.rules === 'conquest' ? `<td><b>🏰 ${citiesOf(s, p.id)}</b></td>` : '';
    const ov = openModal('over', '🏆 Fim de jogo', `
      <div class="banner-win">${w ? avatarImg(w, 'avatar') : ''}<h2>${esc(w ? w.name : '—')} venceu!</h2>
      <p class="muted">${esc(s.log.filter(l => l.kind === 'win').slice(-1)[0]?.msg || '')}</p></div>
      <table class="score"><tr><th>Treinador</th>${extraTh}<th>Insígnias</th><th>Pokédex</th><th>Shinies</th><th>Pontos</th>${s.ratingChanges ? '<th>Rating</th>' : ''}</tr>
      ${ranked.map(p => { const d = s.ratingChanges?.[p.id]; return `<tr><td>${esc(p.name)}</td>${extraTd(p)}<td>${p.badges.length}</td><td>${p.caught.length}</td><td>${p.stats.shinies}</td><td><b>${score(p)}</b></td>${s.ratingChanges ? `<td style="color:${d >= 0 ? '#8ff0bd' : '#ff9b9e'}"><b>${d >= 0 ? '+' : ''}${d ?? 0}</b></td>` : ''}</tr>`; }).join('')}</table>
      ${leagueLine(s)}${bondLine(s)}${bagLine(s)}
      ${me()?.hardcoreLost ? '<p class="small" style="color:#ff9b9e">☠️ Hardcore: você caiu e perdeu tudo o que ganhou nesta partida.</p>' : session.kind === 'online' ? '<p class="small muted">Seus Pokémon (equipe e PC), Pokédex e estatísticas foram salvos na sua conta — veja em 📦 Coleção.</p>' : '<p class="small muted">Modo offline: o progresso não vai para a conta.</p>'}
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
    social: () => { if (!toggleSocial()) toast('Entre com sua conta para usar o chat global.', 'info'); },
    kick: d => {
      const pl = S().players.find(x => x.id === d.pid);
      if (!pl) return;
      const ov = openModal('kick', '🚫 Remover jogador', `<p>Remover <b>${esc(pl.name)}</b> da partida agora?</p>
        <p class="small muted">Ele sai na hora (não precisa esperar a CPU). Se estiver numa batalha, a CPU só termina ela.${S().options.hardcore ? ' No Hardcore ele perde tudo o que ganhou.' : ''}</p>
        <div class="grid2"><button class="btn" data-close="kick">Cancelar</button><button class="btn red" data-act="kick-ok">Remover</button></div>`);
      bindActions(ov, {
        'kick-ok': async () => {
          closeModal('kick');
          try { const { match } = await api('match', { op: 'kick', matchId: session.match.id, target: pl.id }); session.apply?.(match); if (!session.apply) session.refresh?.(); toast(`${pl.name} foi removido.`, 'good'); }
          catch (e) { toast(e.message, 'bad'); }
        }
      });
    },
    'open-battle': () => render(),
    spectate: () => { ui.spectate = true; render(); },
    'auto-watch': (d, el) => { ui.autoWatch = !ui.autoWatch; try { localStorage.setItem('pmhx_autowatch', ui.autoWatch ? '1' : ''); } catch { /* ok */ } if (ui.autoWatch) { ui.spectate = true; render(); } },
    'comp-open': () => { const p = me(); if (p) openCompanionPicker({ owned: p.companions || [], current: p.companion, levels: p.bond || {}, onPick: id => act({ type: 'set_companion', id }) }); },
    'show-over': () => showOver(S()),
    trainer: d => M.openTrainer(viewSession(), d.pid),
    spectate: () => { ui.spectate = true; render(); },
    'goto-gym': d => board.centerOn(Number(d.space), undefined, true),
    'trade-cancel': d => act({ type: 'trade_respond', id: d.id, cancel: true }),
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
        abandon: async () => { closeModal('exit'); ui.dead = true; ui.queue.length = 0; await (session.leave ? session.leave() : session.act({ type: 'leave' })); onExit(); }
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
    if (!state || ui.dead) return;
    if (state === ui.shown) { render(); return; }
    // estado novo: anima a diferença; mudanças sem efeitos (ex.: chat) só re-renderizam
    if (state.fxSeq === ui.shown?.fxSeq && !ui.playing) { ui.shown = state; render(); return; }
    enqueue(state);
  });
  render();
  if (S().players.find(p => p.id === vid())) setTimeout(() => board.centerOn && board.ensureVisible(me()?.pos), 300);
  return () => {
    ui.dead = true; ui.queue.length = 0;
    document.querySelectorAll('.fx-layer, .toast-fx').forEach(el => el.remove());
    off(); board.destroy(); clearTimeout(ui.afkTimer); document.body.classList.remove('anim-busy'); ['battle', 'battle-end', 'invite', 'over', 'trade-in', 'trade-build'].forEach(closeModal);
  };
}

function tierName(t) {
  return ['', 'Rosa', 'Verde', 'Azul', 'Vermelha', 'Amarela'][t] || '';
}
