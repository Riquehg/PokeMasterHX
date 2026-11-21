import { GAME_RULES } from '../../shared/rules/modes.js';
import { vfAttrs, vfBar, vfBind } from './vaultfilter.js';
import { bondLevel } from '../../shared/data/companions.js';
import { ensureSeason, divInfo, LEAGUE_DIVS, TOP_DIV, LP_PER_DIV } from '../../shared/data/league.js';
const HARDCORE_TXT = 'Hardcore: se toda a sua equipe for derrotada você sai da partida e perde tudo o que ganhou nela (capturas, níveis e ouro). Quem sobrevive ganha o dobro de ouro da conta.';
import { MAP_CHOICES, mapChoiceName, BUILTIN_MAPS, setCustomMaps } from '../../shared/data/board.js';
import { openMapEditor, templateMap } from './mapeditor.js';
import { openSeries, openTrophies, checkSeasonResult } from './series.js';
import { openDaily, autoDaily, defenseReport } from './daily.js';
import { BOX_MAX, BOX_ICONS } from '../../shared/data/boxes.js';
import { dailyStatus } from '../../shared/data/daily.js';
import { COMPANIONS } from '../../shared/data/companions.js';
import { openCompanionPicker } from './missions.js';
// Telas fora da partida: login, hub do treinador, lobby online, sala de espera, partida local, coleção, ranking e admin.
import { STARTERS, getSpecies, SPECIES_LIST } from '../../shared/data/pokemon.js';
import { dailyPokemon } from '../../shared/daily.js';
import { esc, toast, bindActions, openModal, closeModal, setModalBody } from './dom.js';
import { monSprite, avatarUrl } from '../config.js';
import { net, api, signIn, signUp, signOut, resetPassword, watchMatch } from '../api.js';
import { LocalSession } from '../session.js';
import { openDex } from './modals.js';
import { openMarket } from './market.js';
import { openAccountBag, bringItemsPicker, bringSummary } from './bag.js';
import { ITEMS as ALL_ITEMS, isKeepable } from '../../shared/data/items.js';
import { openDuelQueue } from './tournament.js';
import { promptInstall, isStandalone } from './install.js';
import { BADGES_TO_USE } from '../../shared/rules/helpers.js';
import { eloOf } from '../../shared/data/elo.js';
import { statCard } from './common.js';
import { ivPercent } from '../../shared/rules/monsters.js';
import { typeChips } from './common.js';
import { openShop as openDiamondShop } from './shop.js';
import { showAnnouncement } from './notify.js';
import { AURA_PRESETS, FRAME_PRESETS, SHOP_KINDS } from '../../shared/data/cosmetics.js';

const LOGO = `<div class="logo"><h1>Pokémon Master Trainer</h1><p>HEX Edition · v2</p></div>`;

function starterPicker(selected, act = 'starter') {
  return `<div class="pick-grid">${STARTERS.map(id => `<div class="pick ${id === selected ? 'on' : ''}" data-act="${act}" data-id="${id}">
    <img src="${monSprite(id)}" alt="${esc(getSpecies(id).name)}">${esc(getSpecies(id).name)}</div>`).join('')}</div>`;
}
function avatarPicker(selected, act = 'avatar') {
  return `<div class="pick-grid">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<div class="pick ${n === selected ? 'on' : ''}" data-act="${act}" data-n="${n}">
    <img src="${avatarUrl(n)}" alt="T${n}" style="height:58px">#${n}</div>`).join('')}</div>`;
}

// ================================================================ login
export function loginScreen(root, { onDone, onLocal }) {
  const offline = net.mode === 'offline';
  root.innerHTML = `<div class="screen"><div class="panel-narrow">${LOGO}
    <div class="card col">
      ${offline ? `<p class="small" style="color:#ffb3b3">⚠️ Servidor online não configurado ou fora do ar. Você ainda pode jogar no modo local.</p>` : ''}
      ${net.mode === 'dev' ? `<p class="small chip gold">Modo desenvolvimento: qualquer e-mail/senha funciona.</p>` : ''}
      <div class="field"><label>E-mail</label><input class="input" id="l-email" type="email" autocomplete="email" placeholder="treinador@kanto.com" ${offline ? 'disabled' : ''}></div>
      <div class="field"><label>Senha</label><input class="input" id="l-pass" type="password" autocomplete="current-password" placeholder="mínimo 6 caracteres" ${offline ? 'disabled' : ''}></div>
      <div class="field hidden" id="l-name-f"><label>Nome de treinador</label><input class="input" id="l-name" maxlength="20" placeholder="Ash"></div>
      <div class="grid2"><button class="btn primary" data-act="login" ${offline ? 'disabled' : ''}>Entrar</button><button class="btn" data-act="signup" ${offline ? 'disabled' : ''}>Criar conta</button></div>
      <button class="btn ghost sm" data-act="forgot" ${net.mode !== 'prod' ? 'disabled' : ''}>Esqueci a senha</button>
      <div class="divider"></div>
      <button class="btn green" data-act="local">🏠 Jogar no modo local (sem conta)</button>
      <p class="tiny muted center">Local = mesmo aparelho, com amigos se revezando e/ou CPUs.</p>
      ${isStandalone() ? '' : '<button class="btn install-btn" data-act="install">📲 Instalar o app no celular / PC</button>'}
    </div></div></div>`;
  const v = id => root.querySelector(id).value;
  let signupMode = false;
  const busy = async fn => {
    root.querySelectorAll('.btn').forEach(b => (b.disabled = true));
    try { await fn(); } catch (e) { toast(e.message, 'bad'); } finally { root.querySelectorAll('.btn').forEach(b => (b.disabled = offline && !b.dataset.act?.includes('local'))); }
  };
  bindActions(root, {
    login: () => busy(async () => { await signIn(v('#l-email'), v('#l-pass')); onDone(); }),
    signup: () => {
      if (!signupMode) { signupMode = true; root.querySelector('#l-name-f').classList.remove('hidden'); root.querySelector('[data-act="signup"]').textContent = 'Confirmar cadastro'; return; }
      busy(async () => {
        const r = await signUp(v('#l-email'), v('#l-pass'), v('#l-name'));
        if (r?.needsConfirmation) { toast('Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.', 'good'); return; }
        onDone();
      });
    },
    forgot: () => busy(async () => { await resetPassword(v('#l-email')); toast('Enviamos um link de redefinição para o seu e-mail.', 'good'); }),
    local: () => onLocal(),
    install: () => promptInstall()
  });
  root.querySelector('#l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') root.querySelector('[data-act="login"]').click(); });
}

// ================================================================ hub

// ================================================================ componentes de modo/coleção
export const MODE_INFO = {
  balanced: { icon: '⚖️', name: 'Balanceado', desc: 'Todos começam com 1 inicial Nv.5. Justo para todo mundo.' },
  collection: { icon: '📦', name: 'Coleção', desc: 'Cada um leva até 6 Pokémon da sua Coleção (times já evoluídos).' },
  ranked: { icon: '🏆', name: 'Competitivo', desc: 'Balanceado, só humanos, com limite de turnos. Vale rating no ranking.' },
  duel: { icon: '⚔️', name: 'Duelo (Torneio)', desc: '1 contra 1, só batalha, com o time da Coleção (Nv. máx 50). Vale Elo.' },
  cup: { icon: '🏟️', name: 'Copa', desc: 'Até 8 treinadores em chaveamento eliminatório até sobrar o campeão. Vale Elo e 💎.' }
};
const TEAM_MODES = ['collection', 'duel', 'cup'];

function modeChip(mode, levelCap) {
  const m = MODE_INFO[mode] || MODE_INFO.balanced;
  return `<span class="chip ${mode === 'ranked' || mode === 'duel' ? 'red' : mode === 'collection' || mode === 'cup' ? 'gold' : 'green'}">${m.icon} ${m.name}${TEAM_MODES.includes(mode) && levelCap ? ` · Nv. máx ${levelCap}` : ''}</span>`;
}

function sortCollection(vault) {
  return [...(vault || [])].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0) || b.lvl - a.lvl);
}

/** Grade de seleção de até 6 Pokémon da Coleção. */
function teamPicker(vault, selected, levelCap, act = 'pick') {
  const list = sortCollection(vault);
  if (!list.length) return '<p class="small muted">Sua Coleção está vazia. Jogue um Treino contra CPUs ou uma partida online — tudo que você capturar vem para cá.</p>';
  setTimeout(() => vfBind(document), 0); // liga a busca depois de desenhar
  return `<p class="small">Escolhidos: <b>${selected.length}/6</b> ${selected.length ? '' : '<span class="muted">(sem escolher = começa com o inicial)</span>'}</p>
    <div class="vf-scope">${vfBar('team', { compact: true })}
    <div class="pick-grid" style="max-height:300px;overflow:auto">${list.map((m, i) => {
      const on = selected.includes(m.uid);
      const lv = levelCap ? Math.min(levelCap, m.lvl) : m.lvl;
      return `<div class="pick ${on ? 'on' : ''}" ${vfAttrs(m, i)} data-act="${act}" data-uid="${esc(m.uid)}" title="${esc(getSpecies(m.sp)?.name)}">
        <img src="${monSprite(m)}" alt="${esc(getSpecies(m.sp)?.name)}">${esc(getSpecies(m.sp)?.name)}${m.shiny ? ' ✨' : ''}<br>Nv.${lv}${levelCap && m.lvl > levelCap ? ` <span class="muted">(${m.lvl})</span>` : ''}${on ? ` <b>#${selected.indexOf(m.uid) + 1}</b>` : ''}${BADGES_TO_USE[getSpecies(m.sp)?.tier] && !m.trust ? `<br><span class="lock-tag">🔒 ${BADGES_TO_USE[getSpecies(m.sp).tier]} insígnias</span>` : ''}</div>`;
    }).join('')}</div></div>`;
}

function togglePick(selected, uid) {
  const i = selected.indexOf(uid);
  if (i >= 0) selected.splice(i, 1);
  else if (selected.length < 6) selected.push(uid);
  else toast('Máximo de 6 Pokémon.', 'bad');
  return selected;
}

// ================================================================ hub
export async function hubScreen(root, ctx) {
  let profile = null;
  let profileError = '';
  try { profile = (await api('profile', { op: 'get' })).profile; } catch (e) { profileError = e.message; }
  ctx.myCosmetic = profile?.cosmetic || null;
  const daily = ctx.daily || dailyPokemon(null);
  const dsp = getSpecies(daily);
  const localSave = LocalSession.hasSave();
  let mine = [];
  if (!profileError) { try { mine = (await api('rooms', null, 'GET')).mine || []; } catch { /* sem salas */ } }

  const render = () => `<div class="screen"><div class="panel-wide">${LOGO}
    ${profileError ? `<div class="card" style="border-color:var(--red);margin-bottom:12px"><b style="color:#ff9b9e">⚠️ Problema no servidor</b>
      <p class="small">${esc(profileError)}</p><p class="small muted">Abra <a href="/api/health" target="_blank" style="color:var(--gold)">/api/health</a> para ver o diagnóstico. Enquanto isso, o modo offline funciona.</p></div>` : ''}
    <div class="hub2">
      <div class="hub-top">
        <div class="trainer ${profile?.cosmetic?.card ? 'tcard-' + esc(profile.cosmetic.card) : ''}">
          <img class="avatar ${profile?.cosmetic?.frame ? 'frame-' + esc(profile.cosmetic.frame) : ''}" src="${avatarUrl(profile?.avatar, profile?.cosmetic?.skin)}" alt="avatar">
          <div class="grow"><h3 style="color:var(--gold)">${esc(profile?.trainer_name || 'Treinador')}</h3>
            ${profile?.cosmetic?.title ? `<div class="player-title">“${esc(profile.cosmetic.title)}”</div>` : ''}
            <div class="small">⭐ ${profile?.points || 0} pts · ${eloOf(profile?.rating ?? 1000).icon} ${eloOf(profile?.rating ?? 1000).name} (${profile?.rating ?? 1000}) · 📖 ${(profile?.pokedex || []).length} · 📦 ${(profile?.vault || []).length}</div></div>
          <div class="col" style="gap:6px;align-items:flex-end">
            <button class="btn sm" data-act="edit" ${profile ? '' : 'disabled'} title="Editar nome e avatar">✏️</button>
            <span class="chip gold" title="Ouro da conta: ganho no fim de cada partida salva. Use no Mercado, no Centro de Treino (🏋️ na Coleção) ou leve para partidas do modo Coleção.">🪙 ${profile?.gold || 0}</span>
            <span class="chip" title="Diamantes"><span class="diamonds">💎 ${profile?.diamonds || 0}</span></span>
          </div>
        </div>
        <div class="daily"><img src="${monSprite(daily)}" alt="${esc(dsp?.name)}"><div><div class="tiny" style="color:var(--gold)">⭐ POKÉMON DO DIA</div><b>${esc(dsp?.name)}</b> ${typeChips(dsp?.types || [])}
          <div class="tiny muted">Aparece mais, dá XP em dobro e tem chance de shiny 1/64.</div></div></div>
      </div>

      ${mine.length || localSave ? `<div class="hub-continue"><b>▶ Continuar</b>
        ${mine.map(m => `<button class="btn sm green" data-act="resume-online" data-id="${m.id}">${esc(m.name)} · ${m.status === 'playing' ? 'em jogo' : 'no lobby'} · ${m.players} jog.</button>`).join('')}
        ${localSave ? '<button class="btn sm" data-act="resume-local">📱 Partida offline</button>' : ''}</div>` : ''}

      <h2 class="hub-h">🎮 Jogar</h2>
      <div class="mode-tiles">
        <button class="mode-tile t-green" data-act="solo" ${profile ? '' : 'disabled'}><span class="mt-ic">🤖</span><b>Treino contra CPUs</b><small>Salva na conta: capturas e níveis vão para a Coleção. O jeito de farmar.</small></button>
        <button class="mode-tile t-blue" data-act="online" ${profile ? '' : 'disabled'}><span class="mt-ic">🌐</span><b>Online</b><small>Crie ou entre em salas: Balanceado, Coleção, Competitivo (Liga), Battle Royale, Conquista.</small></button>
        <button class="mode-tile t-red" data-act="duel" ${profile ? '' : 'disabled'}><span class="mt-ic">⚔️</span><b>Torneio</b><small>Fila de duelo ranqueado 1x1 com o time da Coleção. Vale Elo e Liga.</small></button>
 <button class="mode-tile t-green" data-act="series" ${profile ? '' : 'disabled'}><span class="mt-ic">⚽</span><b>Liga das Séries</b><small>Série D → A no estilo Brasileirão. Seu time de defesa joga por você offline.${profile?.stats?.serie?.season ? ` · ${['🟤 D', '⚪ C', '🟡 B', '🏆 A'][profile.stats.serie.div | 0]} · ${profile.stats.serie.pts | 0} pts` : ''}</small></button>
        <button class="mode-tile t-gold" data-act="cup" ${profile ? '' : 'disabled'}><span class="mt-ic">🏟️</span><b>Copa</b><small>Chaveamento de até 8 treinadores. O campeão ganha 💎.</small></button>
        <button class="mode-tile t-gray" data-act="new-local"><span class="mt-ic">📱</span><b>Offline</b><small>Mesmo aparelho, com amigos e/ou CPUs. Não salva na conta.</small></button>
      </div>
      <details class="hub-info"><summary>ℹ️ Como funcionam os modos de sala</summary>
        <div class="tiny muted">${Object.values(MODE_INFO).map(m => `${m.icon} <b>${m.name}</b>: ${m.desc}`).join('<br>')}<br>Todo modo de tabuleiro aceita Clássico, ⚔️ Battle Royale e 🏰 Conquista, e a opção ☠️ Hardcore.</div></details>

      <h2 class="hub-h">🎒 Minha conta</h2>
      <div class="acct-tiles">
        <button class="acct-tile" data-act="vault" ${profile ? '' : 'disabled'}><span>📦</span><b>Coleção</b><small>${(profile?.vault || []).length} Pokémon</small></button>
        <button class="acct-tile" data-act="dex"><span>📖</span><b>Pokédex</b><small>${(profile?.pokedex || []).length} capturados</small></button>
        <button class="acct-tile" data-act="companions" ${profile ? '' : 'disabled'}><span>🤝</span><b>Companheiros</b><small>${(profile?.stats?.companions || []).length}/${Object.keys(COMPANIONS).length}${profile?.stats?.companion && COMPANIONS[profile.stats.companion] ? ` · ${esc(COMPANIONS[profile.stats.companion].name)}${bondLevel(profile?.stats?.companionBond?.[profile.stats.companion] || 0) >= 10 ? ' ❤️' : ''}` : ''}</small></button>
        <button class="acct-tile" data-act="abag" ${profile ? '' : 'disabled'}><span>🎒</span><b>Mochila</b><small>${Object.values(profile?.stats?.bag || {}).reduce((a, b) => a + b, 0)} itens · levar e vender</small></button>
        <button class="acct-tile" data-act="market" ${profile ? '' : 'disabled'}><span>🏪</span><b>Mercado</b><small>Pokémon e itens</small></button>
        <button class="acct-tile" data-act="daily" ${profile ? '' : 'disabled'}><span>🎁</span><b>Prêmio diário</b><small>${profile ? (dailyStatus(profile.stats?.login).canClaim ? '🔴 Disponível agora!' : `🔥 ${profile.stats?.login?.streak || 0} dias seguidos`) : ''}</small></button>
        <button class="acct-tile" data-act="trophies" ${profile ? '' : 'disabled'}><span>🏆</span><b>Sala de Troféus</b><small>${(profile?.stats?.trophies || []).length} troféus da Liga das Séries</small></button>
        <button class="acct-tile" data-act="ranking"><span>🏆</span><b>Ranking</b><small>Liga, Elos e pontos</small></button>
        <button class="acct-tile" data-act="dshop" ${profile ? '' : 'disabled'}><span>💎</span><b>Loja de cosméticos</b><small>${profile?.diamonds || 0} 💎 · só visual</small></button>
        <button class="acct-tile donate" data-act="donate" ${profile ? '' : 'disabled'}><span>💖</span><b>Apoiar o projeto</b><small>Doe e ganhe 💎 de agradecimento</small></button>
        ${isStandalone() ? '' : '<button class="acct-tile install-btn" data-act="install"><span>📲</span><b>Instalar app</b><small>Celular ou PC</small></button>'}
        ${profile?.is_admin ? '<button class="acct-tile admin" data-act="admin"><span>🛡️</span><b>Admin</b><small>Painel</small></button>' : ''}
      </div>
      <button class="btn ghost hub-logout" data-act="logout">Sair da conta</button>
    </div></div></div>`;

  root.innerHTML = render();
  const rerender = p => { if (p) profile = p; root.innerHTML = render(); };
  bindActions(root, {
    online: () => ctx.go('lobby'),
    'resume-online': d => ctx.openOnline(d.id),
    'resume-local': () => ctx.openLocal(LocalSession.load()),
    'new-local': () => ctx.go('local-setup'),
    solo: () => soloModal(profile, ctx),
    vault: () => collectionModal(profile, rerender),
    companions: () => openCompanionPicker({ owned: profile?.stats?.companions || [], current: profile?.stats?.companion || null, bond: profile?.stats?.companionBond || {},
      onPick: async id => { try { profile = (await api('profile', { op: 'companion', id })).profile; toast(id ? `🤝 ${COMPANIONS[id].name} vai com você nas próximas partidas!` : 'Sem companheiro.', 'good'); rerender(profile); } catch (e) { toast(e.message, 'bad'); } } }),
    dex: () => openDex(null, profile?.pokedex || [], profile?.pokedex_seen || [], { shinyCaught: profile?.stats?.shinyDex || [], shinySeen: profile?.stats?.shinySeen || [], vault: profile?.vault || [] }),
    duel: () => openDuelQueue(ctx, profile),
    series: () => openSeries(ctx, profile),
    trophies: () => openTrophies(profile),
    daily: () => openDaily(profile, p => rerender(p)),
    install: () => promptInstall(),
    cup: async () => {
      try {
        const r = await api('match', { op: 'create', name: `Copa de ${profile?.trainer_name || 'Treinador'}`, mode: 'cup', maxPlayers: 8, isPublic: true });
        ctx.go('room', r.match.id);
      } catch (e) { toast(e.message, 'bad'); }
    },
    ranking: () => rankingModal(profile ? (profile.rating ?? 1000) : null, profile?.stats?.league || null, profile?.trainer_name),
    market: () => openMarket(profile, () => ctx.go('hub')),
    abag: () => openAccountBag(profile, rerender, opts => openMarket(profile, () => ctx.go('hub'), opts)),
    admin: () => adminModal(),
    dshop: () => openDiamondShop(profile, null, () => ctx.go('hub')),
    donate: () => openDiamondShop(profile, null, () => ctx.go('hub'), 'buy'),
    logout: async () => { await signOut(); ctx.go('login'); },
    edit: () => editProfile(profile, async p => rerender(p))
  });
  // janelas do menu, uma de cada vez: 🎁 diário → 🏁 resultado da temporada → 🛡️ relatório da defesa
  if (profile) setTimeout(async () => {
    try { await autoDaily(profile, p => rerender(p)); await checkSeasonResult(profile); await defenseReport(profile); } catch { /* só aviso */ }
  }, 600);
}

function soloModal(profile, ctx) {
  const st = { bots: 2, turnLimit: 60, useTeam: false, starter: 'charmander', team: [], map: 'kanto', bring: 0, rules: 'classic', hardcore: false, items: {} };
  const body = () => `
    <div class="grid2">
      <div class="field"><label>Adversários (CPU)</label><select class="input" id="s-bots">${[1, 2, 3, 4, 5].map(n => `<option ${n === st.bots ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label>Duração</label><select class="input" id="s-turns"><option value="30" ${st.turnLimit === 30 ? 'selected' : ''}>Rápida (30 turnos)</option><option value="60" ${st.turnLimit === 60 ? 'selected' : ''}>Normal (60 turnos)</option><option value="0" ${st.turnLimit === 0 ? 'selected' : ''}>Completa (até o Campeão)</option></select></div>
<div class="field"><label>Tipo de partida</label><select class="input" id="s-rules">${Object.entries(GAME_RULES).map(([k, g]) => `<option value="${k}" ${k === (st.rules) ? 'selected' : ''} title="${esc(g.desc)}">${g.icon} ${g.name}</option>`).join('')}</select></div>
      <div class="field"><label>Mapa</label><select class="input" id="s-map">${MAP_CHOICES.map(m => `<option value="${m.id}" ${m.id === (st.map) ? 'selected' : ''} title="${esc(m.desc)}">${m.icon || '🗺️'} ${esc(m.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Dificuldade</label><select class="input" id="s-hc"><option value="0" ${!st.hardcore ? 'selected' : ''}>Normal</option><option value="1" ${st.hardcore ? 'selected' : ''}>☠️ Hardcore</option></select><div class="tiny muted">${HARDCORE_TXT}</div></div>
    </div>
    <div class="tabs" style="margin:10px 0"><button class="btn sm ${!st.useTeam ? 'primary' : ''}" data-act="use-starter">🌱 Começar com inicial</button><button class="btn sm ${st.useTeam ? 'primary' : ''}" data-act="use-team">📦 Levar time da Coleção</button></div>
    ${st.useTeam ? teamPicker(profile?.vault, st.team, 0) + `
      <div class="bring-gold"><b>🪙 Levar ouro da conta</b> <span class="tiny muted">(você tem ${profile?.gold || 0}; o que sobrar volta no fim)</span>
                <div class="row" style="gap:4px;margin-top:4px">${[0, 300, 600, 1000, 2000].map(v => `<button class="btn sm ${(st.bring) === v ? 'primary' : ''}" data-act="s-bring" data-v="${v}" ${v > (profile?.gold || 0) ? 'disabled' : ''}>${v ? v : 'Nada'}</button>`).join('')}</div></div>
      <div class="bring-gold"><b>🎒 Levar itens da Mochila</b> <span class="tiny muted">${esc(bringSummary(st.items))}</span> <button class="btn sm" data-act="s-items">Escolher</button></div>` : starterPicker(st.starter)}
    <button class="btn primary block" data-act="go" style="margin-top:10px">▶ Começar treino</button>`;
  const ov = openModal('solo', '🤖 Treino contra CPUs', body(), { wide: true });
  const keep = () => { st.bots = Number(ov.querySelector('#s-bots').value); st.turnLimit = Number(ov.querySelector('#s-turns').value); st.map = ov.querySelector('#s-map').value; st.rules = ov.querySelector('#s-rules').value; st.hardcore = ov.querySelector('#s-hc').value === '1'; };
  const re = () => { keep(); setModalBody('solo', body()); };
  bindActions(ov, {
    'use-starter': () => { st.useTeam = false; re(); },
    'use-team': () => { st.useTeam = true; re(); },
    starter: d => { st.starter = d.id; re(); },
    pick: d => { togglePick(st.team, d.uid); re(); },
    's-bring': d => { st.bring = Number(d.v); re(); },
    's-items': () => bringItemsPicker(profile, st.items, sel => { st.items = sel; re(); }),
    go: async () => {
      keep();
      try {
        const { match } = await api('match', { op: 'solo', bots: st.bots, turnLimit: st.turnLimit, map: st.map, rules: st.rules, hardcore: st.hardcore, bringGold: st.useTeam ? st.bring : 0, bringItems: st.useTeam ? st.items : {}, starter: st.starter, teamUids: st.useTeam ? st.team : [] });
        closeModal('solo');
        ctx.openOnline(match.id);
      } catch (e) { toast(e.message, 'bad'); }
    }
  });
}

function collectionModal(profile, onChange) {
  const cap = () => 300 + (profile?.stats?.vaultBonus ? 50 : 0);
  // 📦 boxes (organização): view = 'all' | id da box; picking = escolhendo Pokémon para a box
  let view = 'all', picking = null;
  const boxes = () => profile?.stats?.boxes || [];
  const boxOf = uid => boxes().find(b => b.uids.includes(uid));
  const QUICK = [['shiny', '✨', 'Shinies', m => m.shiny], ['legend', '⚡', 'Lendários', m => getSpecies(m.sp)?.legendary && !getSpecies(m.sp)?.mythical],
    ['myth', '🌟', 'Míticos', m => getSpecies(m.sp)?.mythical], ['fav', '⭐', 'Favoritos', m => m.fav], ['trust', '🤝', 'Confiança', m => m.trust]];
  const boxBar = () => {
    const vault = profile?.vault || [];
    const cur = boxes().find(b => b.id === view);
    const free = vault.filter(m => !boxOf(m.uid)).length;
    return `<div class="bx-bar">
      <button class="bx-chip ${view === 'all' ? 'on' : ''}" data-act="bx-view" data-id="all">🗂️ Todos <small>${vault.length}</small></button>
      <button class="bx-chip ${view === 'none' ? 'on' : ''}" data-act="bx-view" data-id="none">📭 Sem box <small>${free}</small></button>
      ${boxes().map(b => `<button class="bx-chip ${view === b.id ? 'on' : ''}" data-act="bx-view" data-id="${esc(b.id)}">${b.icon} ${esc(b.name)} <small>${b.uids.length}</small></button>`).join('')}
      ${boxes().length < BOX_MAX ? '<button class="bx-chip add" data-act="bx-new">➕ Nova box</button>' : ''}
    </div>
    ${picking ? `<div class="bx-pick">Toque nos Pokémon para colocar em <b>${esc(boxes().find(b => b.id === picking.box)?.name || '')}</b> · <b>${picking.sel.size}</b> escolhido(s)
        <button class="btn sm primary" data-act="bx-pick-ok" ${picking.sel.size ? '' : 'disabled'}>📥 Colocar na box</button><button class="btn sm" data-act="bx-pick-cancel">Cancelar</button></div>`
      : cur ? `<div class="bx-head">${cur.icon} <b>${esc(cur.name)}</b> <span class="tiny muted">${cur.uids.length} Pokémon</span>
        <button class="btn sm primary" data-act="bx-add">➕ Adicionar Pokémon</button><button class="btn sm" data-act="bx-rename">✏️ Nome</button>
        <select class="input sm" data-act-change="bx-icon">${BOX_ICONS.map(i => `<option ${i === cur.icon ? 'selected' : ''}>${i}</option>`).join('')}</select>
        <button class="btn sm red" data-act="bx-del">🗑️ Apagar box</button></div>`
      : view === 'all' ? `<div class="bx-quick tiny muted">Box automática: ${QUICK.map(([k, i, n]) => `<button class="btn sm" data-act="bx-quick" data-k="${k}">${i} ${n}</button>`).join('')}</div>` : ''}`;
  };
  const body = () => {
    const vault = profile?.vault || [];
    const all = sortCollection(vault);
    const recent = new Map(vault.map((m, i) => [m.uid, i]));
    const n = k => all.filter(m => k(m)).length;
    return `<p class="small muted">Tudo que você captura em partidas salvas na conta (Treino contra CPUs e Online) fica aqui, com o nível atualizado. Use no modo <b>📦 Coleção</b> para levar seu time. Limite: ${cap()}. Se lotar, só os comuns mais fracos saem e ficam em "↩️ Saíram da Coleção" para recuperar (⭐ favoritos, shinies, lendários, Vermelhos/Amarelos, Confiança e com apelido nunca saem).${profile?.stats?.vaultBonus ? '' : ' Dá para ampliar para 350 na 💎 Loja.'}</p>
      ${(profile?.stats?.overflow || []).length ? `<details class="vf-out"><summary>↩️ Saíram da Coleção (${profile.stats.overflow.length}) — toque para ver e recuperar</summary>
        <p class="tiny muted">Pokémon que você soltou ou que saíram sozinhos quando a Coleção lotou (só saem os comuns, tier até Azul). Ficam aqui por um tempo (últimos ${40}).</p>
        <div class="pk-grid">${profile.stats.overflow.map(m => statCard(m, { extra: `<div class="tiny muted">${m.why === 'solto' ? 'Solto por você' : 'Coleção cheia'} · ${new Date(m.outAt).toLocaleDateString('pt-BR')}</div><button class="btn sm green" data-act="restore" data-uid="${esc(m.uid)}">↩️ Recuperar</button>` })).join('')}</div></details>` : ''}
      ${(profile?.vault || []).length > cap() ? `<p class="small" style="color:#ffb35c">⚠️ Sua Coleção passou do limite (${(profile.vault || []).length}/${cap()}). Nada some sozinho além dos comuns; solte alguns para liberar espaço.</p>` : ''}
      <div class="vf-sum tiny muted">⚡ ${n(m => getSpecies(m.sp)?.legendary && !getSpecies(m.sp)?.mythical)} lendários · 🌟 ${n(m => getSpecies(m.sp)?.mythical)} míticos · ✨ ${n(m => m.shiny)} shinies · ⭐ ${n(m => m.fav)} favoritos · 🤝 ${n(m => m.trust)} da Confiança</div>
      ${boxBar()}
      <div class="vf-scope">${vfBar('vault')}
      <div class="pk-grid ${picking ? 'bx-picking' : ''}">${all.map(m => { const bx = boxOf(m.uid); const hide = picking ? !!bx && bx.id === picking.box : view === 'none' ? !!bx : view !== 'all' && bx?.id !== view;
        return `<div class="vf-cell ${hide ? 'bx-hide' : ''} ${picking?.sel.has(m.uid) ? 'bx-sel' : ''}" data-uid="${esc(m.uid)}" ${vfAttrs(m, recent.get(m.uid) || 0)}>${bx && view === 'all' ? `<span class="bx-tag" title="${esc(bx.name)}">${bx.icon}</span>` : ''}${statCard(m, { extra: `<div class="row" style="justify-content:center;gap:4px;margin-top:4px">${bx && view === bx.id ? `<button class="btn sm" data-act="bx-out" data-uid="${esc(m.uid)}" title="Tirar da box">↩️</button>` : ''}<button class="btn sm" data-act="fav" data-uid="${esc(m.uid)}" title="Favorito">${m.fav ? '⭐' : '☆'}</button><button class="btn sm" data-act="train" data-uid="${esc(m.uid)}" title="Centro de Treino: subir nível com ouro da conta">🏋️</button><button class="btn sm" data-act="nick" data-uid="${esc(m.uid)}" title="${profile?.stats?.nicknames ? 'Dar apelido' : 'Apelidos: libere na 💎 Loja'}">✏️</button><button class="btn sm red" data-act="rel" data-uid="${esc(m.uid)}" title="Soltar">✕</button></div>` })}</div>`; }).join('') || '<p class="muted">Nada aqui ainda.</p>'}</div></div>`;
  };
  const ov = openModal('vault', `📦 Coleção (${(profile?.vault || []).length}/${cap()})`, body(), { wide: true });
  const redraw = () => { setModalBody('vault', body()); vfBind(document.getElementById('vault')); };
  vfBind(ov);
  const saveBoxes = async list => {
    try { profile = (await api('profile', { op: 'boxes_set', boxes: list })).profile; picking = null; redraw(); onChange(profile); }
    catch (e) { toast(e.message, 'bad'); }
  };
  const newId = () => { let i = 1; while (boxes().some(b => b.id === `b${i}`)) i++; return `b${i}`; };
  // escolhendo Pokémon: toque no card (fora dos botões)
  ov.addEventListener('click', e => {
    if (!picking || e.target.closest('button,select,input')) return;
    const cell = e.target.closest('.vf-cell[data-uid]');
    if (!cell) return;
    const u = cell.dataset.uid;
    picking.sel.has(u) ? picking.sel.delete(u) : picking.sel.add(u);
    cell.classList.toggle('bx-sel', picking.sel.has(u));
    const bar = ov.querySelector('.bx-pick b:nth-of-type(2)'); if (bar) bar.textContent = picking.sel.size;
    const okBtn = ov.querySelector('[data-act=bx-pick-ok]'); if (okBtn) okBtn.disabled = !picking.sel.size;
  });
  ov.addEventListener('change', e => {
    if (e.target.dataset.actChange !== 'bx-icon') return;
    saveBoxes(boxes().map(b => (b.id === view ? { ...b, icon: e.target.value } : b)));
  });
  const op = async (o, uid) => {
    try { profile = (await api('profile', { op: o, uid })).profile; redraw(); onChange(profile); }
    catch (e) { toast(e.message, 'bad'); }
  };
  bindActions(ov, {
    fav: d => op('favorite', d.uid),
    train: d => trainModal(profile, d.uid, np => { profile = np; redraw(); onChange(profile); }),
    nick: async d => {
      if (!profile?.stats?.nicknames) return toast('Apelidos são liberados na 💎 Loja de Diamantes → Conveniência.', 'info');
      const m = (profile.vault || []).find(x => x.uid === d.uid);
      const nick = prompt(`Apelido para ${getSpecies(m.sp).name} (até 12 letras; vazio tira o apelido):`, m.nick || '');
      if (nick === null) return;
      try { profile = (await api('profile', { op: 'nickname', uid: d.uid, nick })).profile; redraw(); onChange(profile); toast(nick.trim() ? `✏️ Agora é ${nick.trim().slice(0, 12)}!` : 'Apelido removido.', 'good'); }
      catch (e) { toast(e.message, 'bad'); }
    },
    rel: d => { if (confirm('Soltar este Pokémon da sua Coleção? Ele fica na lista "Saíram da Coleção" e dá para recuperar depois.')) op('release', d.uid); },
    restore: d => op('restore', d.uid),
    'bx-view': d => { view = d.id; picking = null; redraw(); },
    'bx-new': () => {
      const name = prompt('Nome da box (até 16 letras):', `Box ${boxes().length + 1}`);
      if (name === null) return;
      const id = newId();
      view = id;
      saveBoxes([...boxes(), { id, name: name.trim() || `Box ${boxes().length + 1}`, icon: '📦', uids: [] }]);
    },
    'bx-quick': d => {
      const q = QUICK.find(x => x[0] === d.k);
      const uids = (profile?.vault || []).filter(q[3]).map(m => m.uid);
      if (!uids.length) return toast(`Você não tem ${q[2].toLowerCase()} ainda.`, 'info');
      const id = newId();
      view = id;
      saveBoxes([...boxes().map(b => ({ ...b, uids: b.uids.filter(u => !uids.includes(u)) })), { id, name: q[2], icon: q[1], uids }]);
      toast(`${q[1]} Box "${q[2]}" criada com ${uids.length} Pokémon.`, 'good');
    },
    'bx-add': () => { picking = { box: view, sel: new Set() }; redraw(); },
    'bx-pick-cancel': () => { picking = null; redraw(); },
    'bx-pick-ok': () => {
      const add = [...picking.sel], target = picking.box;
      saveBoxes(boxes().map(b => (b.id === target ? { ...b, uids: [...b.uids.filter(u => !add.includes(u)), ...add] } : { ...b, uids: b.uids.filter(u => !add.includes(u)) })));
    },
    'bx-out': d => saveBoxes(boxes().map(b => ({ ...b, uids: b.uids.filter(u => u !== d.uid) }))),
    'bx-rename': () => {
      const cur = boxes().find(b => b.id === view); if (!cur) return;
      const name = prompt('Novo nome da box:', cur.name);
      if (name !== null) saveBoxes(boxes().map(b => (b.id === view ? { ...b, name: name.trim() || b.name } : b)));
    },
    'bx-del': () => {
      if (!confirm('Apagar esta box? Os Pokémon continuam na Coleção (só saem da box).')) return;
      const id = view; view = 'all';
      saveBoxes(boxes().filter(b => b.id !== id));
    }
  });
}

async function rankingModal(myRating = null, myLeagueRaw = null, myName = '') {
  openModal('rank', '🏆 Ranking', '<span class="spinner"></span>', { wide: true });
  let tab = 'elos', data = null;
  const leagueView = () => {
    const lg = data.league || { table: [], divisions: [] };
    const mine = myLeagueRaw ? ensureSeason(myLeagueRaw, lg.season).league : null;
    const d = mine ? divInfo(mine.div) : null;
    const nextD = mine && mine.div < TOP_DIV ? divInfo(mine.div + 1) : null;
    const myCard = mine ? `<div class="lg-me" style="--ec:${d.color}"><span class="elo-big">${d.icon}</span>
        <div class="grow"><div class="small muted">Sua divisão · ${esc(lg.seasonName)}</div><b style="color:${d.color};font-size:20px">${esc(d.name)}</b>
          <div class="lg-bar"><i style="width:${mine.div === TOP_DIV ? 100 : Math.min(100, mine.lp)}%"></i></div>
          <div class="tiny muted">${mine.lp} PL${nextD ? ` · faltam ${LP_PER_DIV - mine.lp} para ${nextD.icon} ${esc(nextD.name)}` : ' · topo da Liga 👑'} · ${mine.wins}V ${mine.losses}D${mine.streak >= 2 ? ` · 🔥 ${mine.streak} seguidas` : ''}${mine.shield ? ` · 🛡️ proteção (${mine.shield})` : ''}</div>
          <div class="lg-last">${(mine.last || []).map(x => `<i class="${x === 'V' ? 'w' : x === 'D' ? 'l' : 'm'}">${x}</i>`).join('')}</div></div></div>`
      : '<p class="small muted">Jogue um 🏆 Competitivo ou um ⚔️ Duelo ranqueado (Torneio) para entrar na Liga.</p>';
    const ladder = `<div class="lg-ladder">${[...LEAGUE_DIVS].reverse().map(x => `<span class="lg-step ${mine && mine.div === x.idx ? 'on' : ''}" style="--ec:${x.color}" title="${esc(x.name)}">${x.icon}<small>${esc(x.name.replace(/^(\S+) /, ''))}</small></span>`).join('')}</div>`;
    const table = `<table class="score lg-table"><tr><th>#</th><th>Treinador</th><th>Divisão</th><th>PL</th><th>V</th><th>D</th><th>Últimas</th></tr>
      ${lg.table.map((r, i) => { const x = divInfo(r.div); return `<tr class="${r.name === myName ? 'me' : ''}"><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td>${esc(r.name)}</td><td style="color:${x.color}"><b>${x.icon} ${esc(x.name)}</b></td><td><b>${r.lp}</b></td><td>${r.wins}</td><td>${r.losses}</td><td class="lg-last">${(r.last || []).slice(-5).map(y => `<i class="${y === 'V' ? 'w' : y === 'D' ? 'l' : 'm'}">${y}</i>`).join('')}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Ninguém jogou ranqueado nesta temporada ainda.</td></tr>'}</table>`;
    return `${myCard}${ladder}${table}
      <p class="tiny muted">Cada divisão tem ${LP_PER_DIV} PL. Vitória no duelo +22 PL, derrota −18. No Competitivo do tabuleiro: 1º +28, 2º +12, 3º −4, último −16. 3+ vitórias seguidas dão +5. Chegou a ${LP_PER_DIV} sobe; abaixo de 0 cai (quem acabou de subir tem 3 partidas de proteção). Todo mês começa uma nova temporada: todos descem 3 divisões e ganham 💎 pela melhor divisão alcançada.</p>`;
  };
  const eloTag = r => { const e = eloOf(r); return `<span class="elo-chip" style="--ec:${e.color}">${e.icon}</span> <span class="tiny" style="color:${e.color}">${e.name}</span>`; };
  const elosView = () => {
    const mine = myRating !== null ? eloOf(myRating) : null;
    return `${mine ? `<div class="elo-me" style="--ec:${mine.color}"><span class="elo-big">${mine.icon}</span><div><div class="small muted">Seu elo</div><b style="color:${mine.color};font-size:20px">${mine.name}</b> · rating <b>${myRating}</b>
        <div class="tiny muted">${mine.next ? `Faltam ${mine.toNext} pontos para ${mine.next.icon} ${mine.next.name}` : 'Você está no topo! 👑'}</div></div></div>` : ''}
      <div class="elo-grid">${[...data.elos].reverse().map(t => `<div class="elo-card ${mine?.id === t.id ? 'mine' : ''}" style="--ec:${t.color}">
          <div class="elo-big">${t.icon}</div><b style="color:${t.color}">${t.name}</b>
          <div class="tiny muted">${t.max ? `${t.min} – ${t.max - 1}` : `${t.min}+`} de rating</div>
          <div class="small"><b>${t.count}</b> treinador(es)</div>
          <div class="elo-top">${t.top.map(p => `<span title="${esc(p.name)} · ${p.rating}"><img src="${avatarUrl(p.avatar)}" alt="">${esc(p.name)}</span>`).join('') || '<span class="tiny muted">ninguém ainda</span>'}</div></div>`).join('')}</div>
      <p class="tiny muted">Todo mundo começa em 1000 (Prata). Partidas 🏆 Competitivas mudam o rating: terminar à frente de quem tem rating igual ou maior dá mais pontos. ${data.rankedPlayers} treinador(es) já jogaram o Competitivo.</p>`;
  };
  const body = () => {
    const tabs = `<div class="tabs" style="margin-bottom:8px">${[['elos', '🎖️ Elos'], ['competitive', '🏆 Competitivo (rating)'], ['general', '⭐ Geral (pontos)']].map(([k, l]) => `<button class="btn sm ${tab === k ? 'primary' : ''}" data-act="t" data-t="${k}">${l}</button>`).join('')}</div>`;
    if (tab === 'elos') return tabs + elosView();
    if (tab === 'league') return tabs + leagueView();
    const comp = tab === 'competitive';
    const rows = comp ? data.competitive : data.ranking;
    return `${tabs}
      <table class="score"><tr><th>#</th><th>Treinador</th>${comp ? '<th>Elo</th><th>Rating</th><th>Partidas</th><th>Vitórias</th>' : '<th>Pontos</th><th>Pokédex</th><th>Vitórias</th><th>Campeão</th><th>✨</th>'}</tr>
      ${rows.map((r, i) => `<tr><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td>${esc(r.name)}</td>${comp
        ? `<td>${eloTag(r.rating)}</td><td><b>${r.rating}</b></td><td>${r.ranked}</td><td>${r.rankedWins}</td>`
        : `<td><b>${r.points}</b></td><td>${r.pokedex}</td><td>${r.wins}</td><td>${r.champion}</td><td>${r.shinies}</td>`}</tr>`).join('') || `<tr><td colspan="7" class="muted">${comp ? 'Ninguém jogou uma partida competitiva ainda.' : 'Ninguém pontuou ainda.'}</td></tr>`}</table>
      <p class="tiny muted">${comp ? 'Rating Elo (começa em 1000): sobe ao terminar à frente de quem tem rating igual ou maior. Só partidas 🏆 Competitivas contam.' : 'Pontos: 10 por espécie na Pokédex, 300 por vitória, 500 por título de Campeão, 50 por shiny, 25 por vitória PvP.'}</p>`;
  };
  try {
    data = await api('leaderboard', null, 'GET');
    setModalBody('rank', body());
    bindActions(document.getElementById('rank'), { t: d => { tab = d.t; setModalBody('rank', body()); } });
  } catch (e) { setModalBody('rank', `<p class="muted">${esc(e.message)}</p>`); }
}

// ================================================================ lobby online
export async function lobbyScreen(root, ctx) {
  root.innerHTML = `<div class="screen"><div class="panel-wide">${LOGO}
    <div class="hub-grid">
      <div class="card col"><h3>🛠️ Criar sala</h3>
        <div class="field"><label>Nome</label><input class="input" id="c-name" maxlength="30" placeholder="Sala de Kanto"></div>
        <div class="field"><label>Modo</label><select class="input" id="c-mode">${Object.entries(MODE_INFO).map(([k, m]) => `<option value="${k}">${m.icon} ${m.name} — ${m.desc}</option>`).join('')}</select></div>
        <div class="grid2">
          <div class="field"><label>Jogadores</label><select class="input" id="c-max">${[2, 3, 4, 5, 6, 8].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select><div class="tiny muted">8 só na Copa · Duelo é sempre 2</div></div>
          <div class="field"><label>Duração</label><select class="input" id="c-turns"><option value="30">Rápida (30 turnos)</option><option value="40">Competitiva (40 turnos)</option><option value="60" selected>Normal (60 turnos)</option><option value="0">Completa (até o Campeão)</option></select></div>
<div class="field"><label>Tipo de partida</label><select class="input" id="c-rules">${Object.entries(GAME_RULES).map(([k, g]) => `<option value="${k}" ${k === ('classic') ? 'selected' : ''} title="${esc(g.desc)}">${g.icon} ${g.name}</option>`).join('')}</select></div>
          <div class="field"><label>Mapa</label><select class="input" id="c-map">${MAP_CHOICES.map(m => `<option value="${m.id}" ${m.id === ('kanto') ? 'selected' : ''} title="${esc(m.desc)}">${m.icon || '🗺️'} ${esc(m.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Dificuldade</label><select class="input" id="c-hc"><option value="0">Normal</option><option value="1">☠️ Hardcore — perdeu a equipe, está fora e perde tudo</option></select></div>
        <div class="field hidden" id="c-cap-f"><label>Nível máximo dos Pokémon levados</label><select class="input" id="c-cap"><option value="0">Sem limite</option><option value="15">15</option><option value="25">25</option><option value="35">35</option><option value="45">45</option></select></div>
        <div class="grid2">
          <div class="field"><label>PIN (opcional)</label><input class="input" id="c-pin" inputmode="numeric" maxlength="6" placeholder="só números"></div>
          <div class="field"><label>Visibilidade</label><select class="input" id="c-pub"><option value="1">Pública (aparece na lista)</option><option value="0">Privada (só por código)</option></select></div>
        </div>
        <button class="btn primary" data-act="create">Criar sala</button>
        <div class="divider"></div>
        <h3>🔑 Entrar por código</h3>
        <div class="row"><input class="input grow" id="j-code" maxlength="5" placeholder="ABCDE" style="text-transform:uppercase"><input class="input" id="j-pin" maxlength="6" placeholder="PIN" style="width:90px"><button class="btn blue" data-act="join-code">Entrar</button></div>
      </div>
      <div class="card col"><div class="spread"><h3>🌐 Salas abertas</h3><button class="btn sm" data-act="refresh">↻</button></div>
        <div class="list" id="rooms"><span class="spinner"></span></div>
        <button class="btn ghost" data-act="back">← Voltar</button>
      </div>
    </div></div></div>`;
  const v = id => root.querySelector(id).value;
  root.querySelector('#c-mode').addEventListener('change', e => {
    root.querySelector('#c-cap-f').classList.toggle('hidden', !TEAM_MODES.includes(e.target.value));
    if (e.target.value === 'ranked') { root.querySelector('#c-turns').value = '40'; }
  });
  const load = async () => {
    try {
      const { rooms } = await api('rooms', null, 'GET');
      root.querySelector('#rooms').innerHTML = rooms.length ? rooms.map(r => `
        <div class="list-item"><div class="grow"><b>${esc(r.name)}</b> ${r.hasPin ? '🔒' : ''} ${modeChip(r.mode, r.levelCap)}${r.rules && r.rules !== 'classic' ? ` <span class="chip">${GAME_RULES[r.rules].icon} ${GAME_RULES[r.rules].name}</span>` : ''}${r.hardcore ? ' <span class="chip red">☠️ Hardcore</span>' : ''}${r.status === 'playing' ? ' <span class="chip green">▶ em andamento</span>' : ''}<div class="tiny muted">Anfitrião: ${esc(r.host)} · ${r.players}/${r.maxPlayers} · ${r.turnLimit ? r.turnLimit + ' turnos' : 'completa'} · código ${esc(r.code)}</div></div>
        <button class="btn sm ${r.status === 'playing' ? 'green' : 'blue'}" data-act="join" data-id="${r.id}" data-pin="${r.hasPin ? '1' : ''}" data-late="${r.status === 'playing' ? '1' : ''}" ${r.players >= r.maxPlayers ? 'disabled' : ''}>${r.status === 'playing' ? 'Entrar no meio' : 'Entrar'}</button></div>`).join('')
        : '<p class="muted small">Nenhuma sala aberta. Crie uma!</p>';
    } catch (e) { root.querySelector('#rooms').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
  const go = async p => { try { const { match } = await p; ctx.openRoom(match.id); } catch (e) { toast(e.message, 'bad'); } };
  bindActions(root, {
    create: () => go(api('match', { op: 'create', name: v('#c-name'), mode: v('#c-mode'), maxPlayers: Number(v('#c-max')), turnLimit: Number(v('#c-turns')), levelCap: Number(v('#c-cap')), map: v('#c-map'), rules: v('#c-rules'), hardcore: v('#c-hc') === '1', pin: v('#c-pin'), isPublic: v('#c-pub') === '1' })),
    'join-code': async () => {
      try { const { match } = await api('match', { op: 'join', code: v('#j-code'), pin: v('#j-pin') }); if (match.status === 'playing') ctx.openOnline(match.id); else ctx.openRoom(match.id); } catch (e) { toast(e.message, 'bad'); }
    },
    join: async d => {
      const pin = d.pin ? prompt('PIN da sala:') || '' : '';
      if (!d.late) return go(api('match', { op: 'join', matchId: d.id, pin }));
      try { const { match } = await api('match', { op: 'join', matchId: d.id, pin }); ctx.openOnline(match.id); } catch (e) { toast(e.message, 'bad'); }
    },
    refresh: load,
    back: () => ctx.go('hub')
  });
  load();
  const t = setInterval(load, 6000);
  return () => clearInterval(t);
}

// ================================================================ sala de espera
export async function roomScreen(root, ctx, matchId) {
  let match = null;
  let profile = null;
  try { profile = (await api('profile', { op: 'get' })).profile; } catch { /* ok */ }
  const meId = profile?.id;

  const render = () => {
    if (!match) return;
    const isHost = match.hostId === meId;
    const mine = match.lobby.find(e => e.id === meId);
    const o = match.options || {};
    const mode = o.mode || 'balanced';
    const picks = mine?.teamUids || [];
    const teamTxt = e => {
      if (TEAM_MODES.includes(mode) && e.teamUids?.length) return `Time da Coleção (${e.teamUids.length})`;
      return `Inicial: ${esc(getSpecies(e.starter)?.name)}`;
    };
    root.innerHTML = `<div class="screen"><div class="panel-wide">${LOGO}
      <div class="hub-grid">
        <div class="card col">
          <div class="spread"><h3>🏟️ ${esc(match.name)}</h3><span class="chip gold" style="font-size:14px">Código: ${esc(match.code)}</span></div>
          <div class="row">${modeChip(mode, o.levelCap)}${o.hardcore ? '<span class="chip red">☠️ Hardcore</span>' : ''}<span class="small muted">${o.maxPlayers} jogadores · ${o.turnLimit ? o.turnLimit + ' turnos' : 'até o Campeão'} · ${o.rules === 'royale' ? '⚔️ Arena Royale' : mapChoiceName(o.map || 'kanto')} · ${GAME_RULES[o.rules || 'classic'].icon} ${GAME_RULES[o.rules || 'classic'].name} ${match.hasPin ? '· 🔒 PIN' : ''}</span></div>
          <div class="tiny muted">${esc(MODE_INFO[mode]?.desc || '')}${o.rules && o.rules !== 'classic' ? ' · ' + esc(GAME_RULES[o.rules].desc) : ''}</div>
          ${isHost ? `<div class="grid2">
            <select class="input" id="o-mode">${Object.entries(MODE_INFO).map(([k, m]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${m.icon} ${m.name}</option>`).join('')}</select>
            ${['balanced', 'collection'].includes(mode) ? `<select class="input" id="o-rules">${Object.entries(GAME_RULES).map(([k, g]) => `<option value="${k}" ${k === (o.rules || 'classic') ? 'selected' : ''}>${g.icon} ${g.name}</option>`).join('')}</select>` : ''}
            <select class="input" id="o-map">${MAP_CHOICES.map(m => `<option value="${m.id}" ${m.id === (o.map || 'kanto') ? 'selected' : ''}>${m.icon || '🗺️'} ${esc(m.name)}</option>`).join('')}</select>
            <select class="input" id="o-turns">${[[30, 'Rápida (30)'], [40, 'Competitiva (40)'], [60, 'Normal (60)'], [0, 'Completa']].map(([v, l]) => `<option value="${v}" ${v === (o.turnLimit || 0) ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <select class="input" id="o-hc" title="${esc(HARDCORE_TXT)}"><option value="0" ${!o.hardcore ? 'selected' : ''}>Dificuldade normal</option><option value="1" ${o.hardcore ? 'selected' : ''}>☠️ Hardcore</option></select>
            ${o.rules !== 'royale' && !['ranked', 'duel', 'cup'].includes(mode) ? `<select class="input" id="o-late"><option value="1" ${o.allowLate !== false ? 'selected' : ''}>🙋 Pode entrar no meio</option><option value="0" ${o.allowLate === false ? 'selected' : ''}>🔒 Sem entrar no meio</option></select>` : ''}
            ${TEAM_MODES.includes(mode) ? `<select class="input" id="o-cap">${[[0, 'Sem limite de nível'], [15, 'Nível máx 15'], [25, 'Nível máx 25'], [35, 'Nível máx 35'], [45, 'Nível máx 45'], [50, 'Nível máx 50']].map(([v, l]) => `<option value="${v}" ${v === (o.levelCap || 0) ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
          </div>` : ''}
          <div class="list" style="max-height:none">${match.lobby.map(e => `
            <div class="list-item"><img class="avatar sm" src="${avatarUrl(e.avatar)}" alt="${esc(e.name)}">
              <div class="grow"><b>${esc(e.name)}</b> ${e.id === match.hostId ? '<span class="chip gold">anfitrião</span>' : ''} ${e.isBot ? '<span class="chip">CPU</span>' : e.ready || e.id === match.hostId ? '<span class="chip green">pronto</span>' : '<span class="chip">aguardando</span>'}
                <div class="tiny muted">${teamTxt(e)}</div></div>
              ${isHost && e.id !== meId ? `<button class="btn sm red" data-act="kick" data-id="${esc(e.id)}">✕</button>` : ''}
            </div>`).join('')}</div>
          ${isHost ? `<div class="row"><button class="btn sm" data-act="bot" ${match.lobby.length >= o.maxPlayers || mode === 'ranked' || mode === 'duel' ? 'disabled' : ''} title="${mode === 'ranked' || mode === 'duel' ? 'Só entre humanos' : ''}">🤖 Adicionar CPU</button>
              <button class="btn primary grow" data-act="start">▶ Iniciar partida</button></div>`
            : `<button class="btn ${mine?.ready ? '' : 'green'}" data-act="ready">${mine?.ready ? 'Cancelar pronto' : '✅ Estou pronto'}</button>`}
          <button class="btn ghost" data-act="leave">← Sair da sala</button>
        </div>
        <div class="card col">
          ${TEAM_MODES.includes(mode)
            ? mode === 'collection' ? `<h3>📦 Seu time (até 6 da Coleção)</h3>
              <p class="tiny muted">O resto da sua Coleção vai para o PC da partida (troque numa cidade). Regra das insígnias vale para todos: Azul precisa de 1, Vermelho de 2 e Amarelo (lendários) de 3 para lutar (Bola da Confiança e inicial obedecem sempre). Se nenhum do seu time obedecer sem insígnias, o inicial escolhido abaixo entra junto.</p>
              ${teamPicker(profile?.vault, picks, o.levelCap || 0)}
              <div class="bring-gold"><b>🪙 Levar ouro da conta</b> <span class="tiny muted">(você tem ${profile?.gold || 0}; o que sobrar volta no fim)</span>
                <div class="row" style="gap:4px;margin-top:4px">${[0, 300, 600, 1000, 2000].map(v => `<button class="btn sm ${(mine?.bringGold || 0) === v ? 'primary' : ''}" data-act="bring" data-v="${v}" ${v > (profile?.gold || 0) ? 'disabled' : ''}>${v ? v : 'Nada'}</button>`).join('')}</div></div>
              <div class="bring-gold"><b>🎒 Levar itens da Mochila</b> <span class="tiny muted">${esc(bringSummary(mine?.bringItems))}</span> <button class="btn sm" data-act="bring-items">Escolher</button></div>
              <h3 style="margin-top:8px">${picks.length ? 'Inicial (entra se precisar)' : 'ou um inicial'}</h3>${starterPicker(mine?.starter)}`
              : `<h3>⚔️ Seu time de batalha (até 6)</h3>
              <p class="tiny muted">Duelos não têm tabuleiro nem insígnias: todos obedecem. Nível limitado a ${o.levelCap || 50}. Se não escolher, vão os 6 mais fortes da Coleção. Kit igual para todos: 2 Poções, 1 Super Poção e 1 Revive.</p>
              ${teamPicker(profile?.vault, picks, o.levelCap || 0)}`
            : `<h3>🌱 Seu inicial</h3>${starterPicker(mine?.starter)}`}
          <h3 style="margin-top:8px">💬 Chat</h3>
          <div class="log" id="r-chat" style="height:130px">${(match.chat || []).map(c => `<p class="chat"><b>${esc(c.name)}:</b> ${esc(c.text)}</p>`).join('') || '<p class="muted">Diga olá!</p>'}</div>
          <form class="row" id="r-form"><input class="input grow" id="r-msg" maxlength="200" placeholder="Mensagem..."><button class="btn sm primary">Enviar</button></form>
        </div>
      </div></div></div>`;
    const chat = root.querySelector('#r-chat');
    chat.scrollTop = chat.scrollHeight;
    root.querySelector('#r-form').addEventListener('submit', async e => {
      e.preventDefault();
      const text = root.querySelector('#r-msg').value.trim();
      if (text) await op({ op: 'chat', text });
    });
    const sendOpts = () => op({ op: 'options', mode: root.querySelector('#o-mode').value, map: root.querySelector('#o-map')?.value, rules: root.querySelector('#o-rules')?.value, turnLimit: Number(root.querySelector('#o-turns').value), levelCap: Number(root.querySelector('#o-cap')?.value || 0), hardcore: root.querySelector('#o-hc')?.value === '1', ...(root.querySelector('#o-late') ? { lateJoin: root.querySelector('#o-late').value === '1' } : {}) });
    root.querySelectorAll('#o-mode, #o-rules, #o-map, #o-turns, #o-cap, #o-hc, #o-late').forEach(el => el.addEventListener('change', sendOpts));
  };

  const op = async body => {
    try { const r = await api('match', { matchId, ...body }); if (r.match) { match = r.match; check(); } }
    catch (e) { toast(e.message, 'bad'); }
  };
  const check = () => {
    if (match.status === 'playing' || match.status === 'finished') { cleanup(); ctx.openOnline(match.id); return; }
    if (match.status === 'abandoned') { cleanup(); toast('A sala foi encerrada.'); ctx.go('lobby'); return; }
    if (!match.lobby.some(e => e.id === meId)) { cleanup(); toast('Você saiu da sala.'); ctx.go('lobby'); return; }
    render();
  };
  const refresh = async () => {
    try { const r = await api('match', { op: 'get', matchId }); if (!match || r.match.version !== match.version) { match = r.match; check(); } }
    catch (e) { if (e.status === 403 || e.status === 404) { cleanup(); ctx.go('lobby'); } }
  };

  bindActions(root, {
    starter: d => op({ op: 'update', starter: d.id }),
    pick: d => {
      const mine = match.lobby.find(e => e.id === meId);
      op({ op: 'update', teamUids: togglePick([...(mine?.teamUids || [])], d.uid) });
    },
    ready: () => op({ op: 'update', ready: !match.lobby.find(e => e.id === meId)?.ready }),
    bring: d => op({ op: 'update', bringGold: Number(d.v) }),
    'bring-items': () => { const mine = match.lobby.find(e => e.id === meId); bringItemsPicker(profile, mine?.bringItems, sel => op({ op: 'update', bringItems: sel })); },
    bot: () => op({ op: 'add_bot' }),
    kick: d => op({ op: 'remove', target: d.id }),
    start: () => op({ op: 'start' }),
    leave: async () => { await op({ op: 'leave' }); cleanup(); ctx.go('lobby'); }
  });

  const unwatch = watchMatch(matchId, refresh);
  const poll = setInterval(refresh, 5000);
  let cleaned = false;
  function cleanup() { if (cleaned) return; cleaned = true; unwatch(); clearInterval(poll); }
  await refresh();
  return cleanup;
}

function editProfile(profile, onSaved) {
  let avatar = profile?.avatar || 1;
  const body = () => `<div class="field"><label>Nome de treinador</label><input class="input" id="e-name" maxlength="20" value="${esc(profile?.trainer_name || '')}"></div>
    <div class="field" style="margin-top:8px"><label>Avatar</label>${avatarPicker(avatar)}</div>
    <button class="btn primary block" data-act="save" style="margin-top:10px">Salvar</button>`;
  const ov = openModal('edit', '✏️ Editar treinador', body());
  bindActions(ov, {
    avatar: d => { avatar = Number(d.n); const name = ov.querySelector('#e-name').value; setModalBody('edit', body()); ov.querySelector('#e-name').value = name; },
    save: async () => {
      try {
        const r = await api('profile', { op: 'update', trainerName: ov.querySelector('#e-name').value, avatar });
        closeModal('edit'); onSaved(r.profile); toast('Perfil salvo!', 'good');
      } catch (e) { toast(e.message, 'bad'); }
    }
  });
}


async function adminModal() {
  let tab = 'avisos', users = [], data = null;
  openModal('admin', '🛡️ Painel do administrador', '<span class="spinner"></span>', { wide: true });
  const ov = document.getElementById('admin');
  const money = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const TABS = [['avisos', '📢 Avisos'], ['loja', '💎 Loja'], ['pacotes', '💖 Doações (Pix)'], ['vendas', '🧾 Doações recebidas'], ['jogo', '⭐ Pokémon do Dia'], ['mapas', '🗺️ Mapas'], ['usuarios', '👥 Usuários']];

  const body = () => {
    const tabs = `<div class="row" style="margin-bottom:10px">${TABS.map(([k, l]) => `<button class="btn sm ${tab === k ? 'primary' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div>`;
    if (tab === 'avisos') {
      const a = data.announcement || {};
      return tabs + `<div class="card col">
        <p class="small muted">O aviso aparece como pop-up para todo mundo (na hora para quem está online e ao abrir o jogo para os outros). Cada jogador vê uma vez.</p>
        <div class="field"><label>Tipo</label><select class="input" id="an-kind">${[['info', '📢 Aviso'], ['warn', '⚠️ Atenção'], ['event', '🎉 Evento'], ['update', '🆕 Novidade']].map(([v, l]) => `<option value="${v}" ${a.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Título</label><input class="input" id="an-title" maxlength="80" value="${esc(a.title || '')}"></div>
        <div class="field"><label>Mensagem</label><textarea class="input" id="an-text" rows="5" maxlength="600">${esc(a.text || '')}</textarea></div>
        <div class="row"><button class="btn primary" data-act="an-save" data-on="1">📢 Publicar aviso</button><button class="btn" data-act="an-preview">👀 Pré-visualizar</button><button class="btn red" data-act="an-save" data-on="0">Desativar aviso</button></div>
        <p class="small">Status: ${a.active ? '<span class="chip green">ativo</span>' : '<span class="chip">desativado</span>'}</p></div>`;
    }
    if (tab === 'loja') {
      return tabs + `<p class="small muted">Itens cosméticos vendidos por diamantes. <b>Valor</b>: para "Estilo de captura" use um destes: ${Object.keys(AURA_PRESETS).join(', ')}. Para "Moldura": ${Object.keys(FRAME_PRESETS).join(', ')}. Para "Título": o texto do título.</p>
        <div class="col">${data.shop.items.map((it, i) => `<div class="shop-item" style="grid-template-columns:1fr;gap:6px">
          <div class="grid3"><input class="input" data-f="items.${i}.name" value="${esc(it.name)}" placeholder="Nome">
            <select class="input" data-f="items.${i}.kind">${Object.entries(SHOP_KINDS).map(([k, l]) => `<option value="${k}" ${it.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <input class="input" data-f="items.${i}.value" value="${esc(it.value)}" placeholder="Valor"></div>
          <div class="grid3"><input class="input" data-f="items.${i}.price" type="number" min="0" value="${it.price}" placeholder="Preço 💎">
            <input class="input" data-f="items.${i}.desc" value="${esc(it.desc || '')}" placeholder="Descrição">
            <div class="row"><label class="small"><input type="checkbox" data-f="items.${i}.active" ${it.active ? 'checked' : ''}> à venda</label><button class="btn sm red" data-act="del-item" data-i="${i}">Remover</button></div></div>
          <div class="tiny muted">ID: ${esc(it.id)}</div></div>`).join('')}</div>
        <div class="row" style="margin-top:8px"><button class="btn" data-act="add-item">+ Novo item</button><button class="btn primary" data-act="save-shop">💾 Salvar loja</button></div>`;
    }
    if (tab === 'pacotes') {
      return tabs + `<p class="small muted">Opções de doação por Pix (Mercado Pago): valor da doação e diamantes de agradecimento. O valor é cobrado exatamente como está aqui. ${data.pixReady ? '' : '<b style="color:#ff9b9e">Falta configurar MP_ACCESS_TOKEN na Vercel — veja o README.</b>'}</p>
        <div class="col">${data.shop.packages.map((p, i) => `<div class="shop-item" style="grid-template-columns:repeat(5,1fr) auto;gap:6px">
          <input class="input" data-f="packages.${i}.name" value="${esc(p.name)}" placeholder="Nome">
          <input class="input" data-f="packages.${i}.diamonds" type="number" min="1" value="${p.diamonds}" title="Diamantes">
          <input class="input" data-f="packages.${i}.bonus" type="number" min="0" value="${p.bonus}" title="Bônus">
          <input class="input" data-f="packages.${i}.price" value="${String(p.price).replace('.', ',')}" title="Preço R$">
          <label class="small"><input type="checkbox" data-f="packages.${i}.active" ${p.active ? 'checked' : ''}> ativo</label>
          <button class="btn sm red" data-act="del-pkg" data-i="${i}">✕</button></div>`).join('')}</div>
        <p class="tiny muted">Colunas: nome · diamantes · bônus · preço (R$) · ativo</p>
        <div class="row"><button class="btn" data-act="add-pkg">+ Nova opção de doação</button><button class="btn primary" data-act="save-shop">💾 Salvar doações</button></div>`;
    }
    if (tab === 'vendas') {
      const paid = data.payments.filter(p => p.status === 'credited');
      const total = paid.reduce((a, p) => a + Number(p.amount), 0);
      return tabs + `<div class="row" style="margin-bottom:8px"><span class="chip gold" style="font-size:14px">Total recebido: ${money(total)}</span><span class="chip">${paid.length} vendas</span></div>
        <table class="score"><tr><th>Data</th><th>Jogador</th><th>💎</th><th>Valor</th><th>Status</th><th></th></tr>
        ${data.payments.map(p => `<tr><td>${new Date(p.created_at).toLocaleString('pt-BR')}</td><td>${esc(p.user)}</td><td>${p.diamonds}</td><td>${money(p.amount)}</td><td>${esc(p.status)}</td>
          <td>${p.status === 'pending' ? `<button class="btn sm" data-act="credit" data-id="${p.id}" title="Use só se o Pix caiu na sua conta e não foi creditado">Creditar manual</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma venda ainda.</td></tr>'}</table>`;
    }
    if (tab === 'jogo') {
      return tabs + `<div class="card col"><h3>⭐ Pokémon do Dia</h3>
          <div class="row"><select class="input grow" id="a-daily"><option value="">(automático pela data)</option>${SPECIES_LIST.map(s => `<option value="${s.id}">${s.dex} · ${esc(s.name)}</option>`).join('')}</select>
          <button class="btn primary" data-act="daily">Definir</button></div>
          <p class="tiny muted">Vale para as próximas partidas iniciadas: aparece mais, XP em dobro e shiny 1/64.</p></div>`;
    }
    if (tab === 'mapas') {
      const maps = data.maps || [];
      return tabs + `<div class="card col"><h3>🗺️ Mapas personalizados</h3>
        <p class="small muted">Monte mapas novos para o modo normal. Publicado = aparece para todos na escolha de mapa (Treino, salas online e offline). Só ${2} casas de Pokémon podem ser Amarelas (lendárias).</p>
        <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn primary" data-act="map-new" data-from="blank">➕ Mapa em branco</button>
          <select class="input" id="a-mapfrom">${BUILTIN_MAPS.map(m => `<option value="${m.id === 'gen' ? 'gen:' + (Date.now() % 100000) : m.id}">${m.icon} ${esc(m.name)}</option>`).join('')}</select>
          <button class="btn" data-act="map-new" data-from="copy">📋 Começar de uma cópia</button></div>
        <table class="score" style="margin-top:8px"><tr><th>Mapa</th><th>Casas</th><th>Status</th><th>Atualizado</th><th></th></tr>
        ${maps.map(m => `<tr><td><b>${esc(m.name)}</b><div class="tiny muted">${esc(m.id)} · v${m.rev || 1}</div></td><td>${m.spaces.length}</td>
          <td>${m.published ? '<span class="chip green">publicado</span>' : '<span class="chip">rascunho</span>'}</td><td class="tiny">${m.updatedAt ? new Date(m.updatedAt).toLocaleString('pt-BR') : ''}</td>
          <td class="row" style="gap:4px"><button class="btn sm" data-act="map-edit" data-id="${esc(m.id)}">✏️ Editar</button>
            <button class="btn sm" data-act="map-pub" data-id="${esc(m.id)}" data-v="${m.published ? '0' : '1'}">${m.published ? 'Despublicar' : '🚀 Publicar'}</button>
            <button class="btn sm red" data-act="map-del" data-id="${esc(m.id)}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhum mapa ainda.</td></tr>'}</table>
        <p class="tiny muted">Fundo opcional: suba <code>board/bg_custom_&lt;código&gt;.png</code> no Storage (ex.: bg_custom_ilhas2.png).</p></div>`;
    }
    return tabs + `<div class="card col"><h3>🎁 Dar presente</h3>
        <div class="row"><select class="input grow" id="a-user">${users.map(u => `<option value="${u.id}">${esc(u.name)} (💎${u.diamonds})</option>`).join('')}</select></div>
        <div class="row"><input class="input" id="a-dm" type="number" value="100" style="width:110px"><button class="btn blue" data-act="give-dm">💎 Dar diamantes</button><span class="tiny muted">(use número negativo para remover)</span></div>
        <div class="row"><input class="input" id="a-gd" type="number" value="500" style="width:110px"><button class="btn" data-act="give-gd">🪙 Dar ouro da conta</button></div>
        <div class="row"><select class="input grow" id="a-sp">${SPECIES_LIST.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
          <input class="input" id="a-lv" type="number" min="1" max="60" value="5" style="width:80px"><label class="small"><input type="checkbox" id="a-shiny"> shiny</label>
          <button class="btn" data-act="grant">🎁 Dar Pokémon (vai para a Coleção)</button></div>
        <div class="row"><select class="input grow" id="a-item">${Object.entries(ALL_ITEMS).filter(([id]) => isKeepable(id)).map(([id, it]) => `<option value="${id}">${esc(it.name)}</option>`).join('')}</select>
          <input class="input" id="a-iq" type="number" min="1" max="99" value="1" style="width:80px">
          <button class="btn" data-act="grant-item">🎒 Dar item (vai para a Mochila)</button></div></div>
      <div class="card" style="margin-top:10px"><h3>👥 Usuários (${users.length})</h3>
        <table class="score"><tr><th>Nome</th><th>Pontos</th><th>Rating</th><th>💎</th><th>Coleção</th><th>Admin</th></tr>
        ${users.map(u => `<tr><td>${esc(u.name)}</td><td>${u.points}</td><td>${u.rating}</td><td>${u.diamonds}</td><td>${u.vault}</td><td><button class="btn sm ${u.isAdmin ? 'red' : ''}" data-act="toggle" data-id="${u.id}" data-v="${u.isAdmin ? '0' : '1'}">${u.isAdmin ? 'remover' : 'tornar admin'}</button></td></tr>`).join('')}</table>
        <p class="tiny muted">Senhas e exclusão de contas ficam no Supabase (Authentication → Users).</p></div>`;
  };

  // lê os campos editáveis (data-f="items.0.name") de volta para data.shop
  const collect = () => {
    ov.querySelectorAll('[data-f]').forEach(el => {
      const [list, i, key] = el.dataset.f.split('.');
      data.shop[list][Number(i)][key] = el.type === 'checkbox' ? el.checked : el.value;
    });
  };
  const render = () => setModalBody('admin', body());
  const load = async () => {
    const [u, d] = await Promise.all([api('admin', { op: 'list_users' }), api('admin', { op: 'get_admin_data' })]);
    users = u.users; data = d;
    try { data.pixReady = (await api('shop', { op: 'catalog' })).pixEnabled; } catch { data.pixReady = false; }
    try { data.maps = (await api('admin', { op: 'list_maps' })).maps; } catch { data.maps = []; }
    render();
  };
  const mapsSaved = maps => { data.maps = maps || data.maps; setCustomMaps((data.maps || []).filter(m => m.published)); if (tab === 'mapas') render(); };
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok, 'good'); await load(); } catch (e) { toast(e.message, 'bad'); } };

  bindActions(ov, {
    tab: d => { if (data && (tab === 'loja' || tab === 'pacotes')) collect(); tab = d.t; render(); },
    'an-preview': () => showAnnouncement({ id: 'preview', active: true, kind: ov.querySelector('#an-kind').value, title: ov.querySelector('#an-title').value, text: ov.querySelector('#an-text').value }, true),
    'an-save': d => run(() => api('admin', { op: 'set_announcement', announcement: { kind: ov.querySelector('#an-kind').value, title: ov.querySelector('#an-title').value, text: ov.querySelector('#an-text').value, active: d.on === '1' } }), d.on === '1' ? 'Aviso publicado!' : 'Aviso desativado.'),
    'add-item': () => { collect(); data.shop.items.push({ id: '', kind: 'title', value: '', name: 'Novo item', desc: '', price: 50, active: false }); render(); },
    'del-item': d => { collect(); data.shop.items.splice(Number(d.i), 1); render(); },
    'add-pkg': () => { collect(); data.shop.packages.push({ id: '', name: 'Novo pacote', diamonds: 100, bonus: 0, price: 5, active: false }); render(); },
    'del-pkg': d => { collect(); data.shop.packages.splice(Number(d.i), 1); render(); },
    'save-shop': () => { collect(); run(() => api('admin', { op: 'save_shop', shop: data.shop }), 'Loja salva!'); },
    credit: d => { if (confirm('Creditar manualmente? Use só se o Pix foi pago e não caiu sozinho.')) run(() => api('admin', { op: 'credit_payment', paymentId: d.id }), 'Creditado.'); },
    daily: () => run(async () => { const r = await api('admin', { op: 'set_daily', species: ov.querySelector('#a-daily').value || null }); toast(`Pokémon do Dia: ${getSpecies(r.dailyPokemon).name}`, 'good'); }),
    'give-gd': () => run(() => api('admin', { op: 'give_gold', userId: ov.querySelector('#a-user').value, amount: Number(ov.querySelector('#a-gd').value) }), 'Ouro enviado!'),
    'give-dm': () => run(() => api('admin', { op: 'give_diamonds', userId: ov.querySelector('#a-user').value, amount: Number(ov.querySelector('#a-dm').value) }), 'Diamantes enviados!'),
    'grant-item': () => run(() => api('admin', { op: 'grant_item', userId: ov.querySelector('#a-user').value, item: ov.querySelector('#a-item').value, qty: ov.querySelector('#a-iq').value }), 'Enviado para a Mochila!'),
    grant: () => run(() => api('admin', { op: 'grant_mon', userId: ov.querySelector('#a-user').value, species: ov.querySelector('#a-sp').value, level: ov.querySelector('#a-lv').value, shiny: ov.querySelector('#a-shiny').checked }), 'Enviado para a Coleção!'),
    toggle: d => run(() => api('admin', { op: 'set_admin', userId: d.id, value: d.v === '1' })),
    'map-new': d => openMapEditor(templateMap(d.from === 'blank' ? 'blank' : ov.querySelector('#a-mapfrom').value), mapsSaved),
    'map-edit': d => { const m = (data.maps || []).find(x => x.id === d.id); if (m) openMapEditor({ ...structuredClone(m), id: m.id.replace(/^custom:/, '') }, mapsSaved); },
    'map-pub': d => { const m = (data.maps || []).find(x => x.id === d.id); if (m) run(async () => { const r = await api('admin', { op: 'save_map', map: { ...m, id: m.id.replace(/^custom:/, '') }, published: d.v === '1' }); mapsSaved(r.maps); }, d.v === '1' ? 'Mapa publicado!' : 'Mapa virou rascunho.'); },
    'map-del': d => { if (confirm('Apagar este mapa? Partidas já começadas nele continuam funcionando.')) run(async () => { const r = await api('admin', { op: 'delete_map', id: d.id }); mapsSaved(r.maps); }, 'Mapa apagado.'); }
  });
  try { await load(); } catch (e) { setModalBody('admin', `<p class="muted">${esc(e.message)}</p>`); }
}

export function localSetupScreen(root, ctx) {
  const players = [
    { name: 'Jogador 1', avatar: 1, starter: 'charmander', isBot: false },
    { name: 'CPU Gary', avatar: 4, starter: 'squirtle', isBot: true }
  ];
  let turnLimit = 60, mapId = 'kanto', rulesId = 'classic', hardcore = false;
  let editing = 0;
  const render = () => {
    const e = players[editing];
    root.innerHTML = `<div class="screen"><div class="panel-wide">${LOGO}
      <div class="hub-grid">
        <div class="card col"><h3>👥 Participantes (${players.length}/6)</h3>
          <div class="list" style="max-height:none">${players.map((p, i) => `
            <div class="list-item" style="cursor:pointer;${i === editing ? 'border-color:var(--gold)' : ''}" data-act="edit" data-i="${i}">
              <img class="avatar sm" src="${avatarUrl(p.avatar)}" alt=""><div class="grow"><b>${esc(p.name)}</b> ${p.isBot ? '<span class="chip">CPU</span>' : '<span class="chip green">Humano</span>'}<div class="tiny muted">${esc(getSpecies(p.starter).name)}</div></div>
              ${players.length > 1 ? `<button class="btn sm red" data-act="del" data-i="${i}">✕</button>` : ''}</div>`).join('')}</div>
          <div class="grid2"><button class="btn sm" data-act="add-human" ${players.length >= 6 ? 'disabled' : ''}>+ Humano</button><button class="btn sm" data-act="add-bot" ${players.length >= 6 ? 'disabled' : ''}>+ CPU</button></div>
          <div class="field"><label>Duração</label><select class="input" id="ls-turns"><option value="30" ${turnLimit === 30 ? 'selected' : ''}>Rápida (30 turnos)</option><option value="60" ${turnLimit === 60 ? 'selected' : ''}>Normal (60 turnos)</option><option value="0" ${turnLimit === 0 ? 'selected' : ''}>Completa (até o Campeão)</option></select></div>
<div class="field"><label>Tipo de partida</label><select class="input" id="ls-rules">${Object.entries(GAME_RULES).map(([k, g]) => `<option value="${k}" ${k === (rulesId) ? 'selected' : ''} title="${esc(g.desc)}">${g.icon} ${g.name}</option>`).join('')}</select></div>
          <div class="field"><label>Mapa</label><select class="input" id="ls-map">${MAP_CHOICES.map(m => `<option value="${m.id}" ${m.id === (mapId) ? 'selected' : ''} title="${esc(m.desc)}">${m.icon || '🗺️'} ${esc(m.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Dificuldade</label><select class="input" id="ls-hc" title="${esc(HARDCORE_TXT)}"><option value="0" ${!hardcore ? 'selected' : ''}>Normal</option><option value="1" ${hardcore ? 'selected' : ''}>☠️ Hardcore</option></select></div>
          <button class="btn primary" data-act="start">▶ Começar</button>
          <button class="btn ghost" data-act="back">← Voltar</button>
        </div>
        <div class="card col"><h3>✏️ ${esc(e.name)}</h3>
          <div class="field"><label>Nome</label><input class="input" id="ls-name" maxlength="20" value="${esc(e.name)}"></div>
          <label class="small"><input type="checkbox" id="ls-bot" ${e.isBot ? 'checked' : ''}> Controlado pela CPU</label>
          <div class="field"><label>Inicial</label>${starterPicker(e.starter)}</div>
          <div class="field"><label>Avatar</label>${avatarPicker(e.avatar)}</div>
        </div>
      </div></div></div>`;
    root.querySelector('#ls-name').addEventListener('input', ev => { players[editing].name = ev.target.value.slice(0, 20) || 'Treinador'; });
    root.querySelector('#ls-name').addEventListener('change', render);
    root.querySelector('#ls-bot').addEventListener('change', ev => { players[editing].isBot = ev.target.checked; render(); });
    root.querySelector('#ls-turns').addEventListener('change', ev => { turnLimit = Number(ev.target.value); });
    root.querySelector('#ls-map').addEventListener('change', ev => { mapId = ev.target.value; });
    root.querySelector('#ls-rules').addEventListener('change', ev => { rulesId = ev.target.value; });
    root.querySelector('#ls-hc').addEventListener('change', ev => { hardcore = ev.target.value === '1'; });
  };
  bindActions(root, {
    edit: d => { editing = Number(d.i); render(); },
    del: d => { players.splice(Number(d.i), 1); editing = 0; render(); },
    'add-human': () => { players.push({ name: `Jogador ${players.filter(p => !p.isBot).length + 1}`, avatar: (players.length % 8) + 1, starter: STARTERS[players.length % STARTERS.length], isBot: false }); editing = players.length - 1; render(); },
    'add-bot': () => { players.push({ name: `CPU ${['Misty', 'Brock', 'May', 'Dawn', 'Red'][players.length % 5]}`, avatar: (players.length % 8) + 1, starter: STARTERS[(players.length + 3) % STARTERS.length], isBot: true }); editing = players.length - 1; render(); },
    starter: d => { players[editing].starter = d.id; render(); },
    avatar: d => { players[editing].avatar = Number(d.n); render(); },
    start: () => {
      if (!players.some(p => !p.isBot)) return toast('Precisa de pelo menos 1 humano.', 'bad');
      LocalSession.clear();
      const s = LocalSession.create({
        players: players.map((p, i) => ({ id: 'p' + (i + 1), name: p.name, avatar: p.avatar, starter: p.starter, isBot: p.isBot,
          cosmetic: !p.isBot && i === players.findIndex(q => !q.isBot) ? ctx.myCosmetic : null })),
        options: { dailyPokemon: ctx.daily, turnLimit, map: mapId, rules: rulesId, hardcore }
      });
      ctx.openLocal(s);
    },
    back: () => ctx.go(net.user ? 'hub' : 'login')
  });
  render();
}


/** 🏋️ Centro de Treino: sobe níveis de um Pokémon da Coleção gastando ouro da conta (até o Nv. 50). */
const TRAIN_MAX = 50;
const trainCost = lvl => 15 * lvl + 20;
function trainModal(profile, uid, onDone) {
  const m = (profile.vault || []).find(x => x.uid === uid);
  if (!m) return;
  const sp = getSpecies(m.sp);
  const costTo = n => { let c = 0; for (let l = m.lvl; l < Math.min(TRAIN_MAX, m.lvl + n); l++) c += trainCost(l); return c; };
  const gold = profile.gold || 0;
  const opts = [1, 3, 5, 10].filter(n => m.lvl + 1 <= TRAIN_MAX);
  const evo = sp.evolvesTo && sp.evolutionLevel ? `<p class="small">✨ Evolui para <b>${esc(getSpecies(sp.evolvesTo).name)}</b> no Nv. ${sp.evolutionLevel}.</p>` : '';
  const html = m.lvl >= TRAIN_MAX ? `<p>${esc(sp.name)} já está no Nv. ${m.lvl}. O Centro de Treino vai até o Nv. ${TRAIN_MAX} — daqui pra frente, só batalhando nas partidas!</p>`
    : `<div class="row"><img src="${monSprite(m)}" style="width:80px;height:80px;object-fit:contain"><div><b>${esc(m.nick || sp.name)}</b> · Nv. ${m.lvl}<div class="small muted">Ouro da conta: 🪙 ${gold}</div></div></div>${evo}
      <p class="small muted">Treinar não muda o potencial (IV) nem a natureza — só o nível. Vai até o Nv. ${TRAIN_MAX}.</p>
      <div class="grid2">${opts.map(n => { const to = Math.min(TRAIN_MAX, m.lvl + n), c = costTo(n); return `<button class="btn ${c <= gold ? 'primary' : ''}" data-act="do-train" data-n="${n}" ${c > gold ? 'disabled' : ''}>+${to - m.lvl} nível${to - m.lvl > 1 ? 'is' : ''} → Nv. ${to}<br><span class="tiny">🪙 ${c}</span></button>`; }).join('')}</div>`;
  const ov = openModal('train', '🏋️ Centro de Treino', html);
  bindActions(ov, {
    'do-train': async d => {
      try {
        const r = await api('profile', { op: 'train', uid, levels: Number(d.n) });
        closeModal('train');
        toast(r.evolved ? `✨ ${sp.name} evoluiu para ${getSpecies(r.evolved).name}! (−🪙${r.cost})` : `🏋️ Treino concluído! (−🪙${r.cost})`, 'good');
        onDone({ ...r.profile, gold: r.gold });
      } catch (e) { toast(e.message, 'bad'); }
    }
  });
}
