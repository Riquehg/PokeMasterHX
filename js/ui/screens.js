import { GAME_RULES } from '../../shared/rules/modes.js';
import { vfAttrs, vfBar, vfBind } from './vaultfilter.js';
import { bondLevel } from '../../shared/data/companions.js';
import { ensureSeason, divInfo, LEAGUE_DIVS, TOP_DIV, LP_PER_DIV } from '../../shared/data/league.js';
const HARDCORE_TXT = 'Hardcore: se toda a sua equipe for derrotada você sai da partida e perde tudo o que ganhou nela (capturas, níveis e ouro). Quem sobrevive ganha o dobro de ouro da conta.';
import { MAP_CHOICES, mapChoiceName, BUILTIN_MAPS, setCustomMaps, REPLACEABLE } from '../../shared/data/board.js';
import { regionBlurb } from '../../shared/data/regions.js';
// 🗺️ v59: Liga e Pokémon em destaque do mapa escolhido (atualiza ao trocar o mapa)
const mapRegion = id => (!id || id === 'kanto' ? 'kanto' : id === 'gen' || String(id).startsWith('gen:') ? 'expedicao' : String(id).startsWith('theme:') ? String(id).slice(6) : null);
const mapInfoText = id => regionBlurb(mapRegion(id)) || 'Mapa personalizado: Liga de Kanto, sem Pokémon em destaque.';
const mapInfo = id => `<div class="tiny muted map-info">${esc(mapInfoText(id))}</div>`;
if (typeof document !== 'undefined') document.addEventListener('change', e => {
  const el = e.target;
  if (!el?.matches?.('#s-map,#c-map,#o-map,#ls-map')) return;
  const info = el.parentElement?.querySelector('.map-info'); if (info) info.textContent = mapInfoText(el.value);
});
import { openMapEditor, templateMap } from './mapeditor.js';
import { openSeries, openTrophies, checkSeasonResult } from './series.js';
import { openTrainerCard } from './trainercard.js';
import { openTitles, checkNewTitles } from './titles.js';
import { ACH_TITLES, unlockedTitles } from '../../shared/data/titles.js';
import { megaBySpecies } from '../../shared/data/megas.js';
import { openDaily, autoDaily, defenseReport } from './daily.js';
import { openFarm } from './farm.js';
import { openSafari } from './safari.js';
import { openTower } from './tower.js';
import { BOX_MAX, BOX_ICONS } from '../../shared/data/boxes.js';
import { dailyStatus } from '../../shared/data/daily.js';
import { COMPANIONS } from '../../shared/data/companions.js';
import { openCompanionPicker } from './missions.js';
// Telas fora da partida: login, hub do treinador, lobby online, sala de espera, partida local, coleção, ranking e admin.
import { STARTERS, getSpecies, SPECIES_LIST } from '../../shared/data/pokemon.js';
import { evoSummary, evoItemsFor, itemEvoTarget, levelEvoTarget } from '../../shared/data/evolution.js';
import { GMAX } from '../../shared/data/gmax.js';
import { releaseGold, releaseLabel } from '../../shared/data/release.js';
import { dailyPokemon } from '../../shared/daily.js';
import { esc, toast, bindActions, openModal, closeModal, setModalBody } from './dom.js';
import { monSprite, avatarUrl, itemUrl, uiIcon, uiBanner, typeIcon, typeLabel, typeColor } from '../config.js';
import { openGuild } from './guild.js';
import { SQUADS } from '../../shared/rules/teams.js';
import { net, api, signIn, signUp, signOut, resetPassword, watchMatch } from '../api.js';
import { LocalSession } from '../session.js';
import { openDex } from './modals.js';
import { openMarket } from './market.js';
import { openAccountBag, bringItemsPicker, bringSummary } from './bag.js';
import { ITEMS as ALL_ITEMS, isKeepable } from '../../shared/data/items.js';
import { openPvp } from './pvp.js';
import { promptInstall, isStandalone } from './install.js';
import { BADGES_TO_USE } from '../../shared/rules/helpers.js';
import { eloOf } from '../../shared/data/elo.js';
import { statCard, titleHtml, tmPickerHtml, setTmSlot } from './common.js';
import { ivPercent } from '../../shared/rules/monsters.js';
import { typeChips } from './common.js';
import { openShop as openDiamondShop } from './shop.js';
import { showAnnouncement, showFeedBanner } from './notify.js';
import { AURA_PRESETS, FRAME_PRESETS, SHOP_KINDS, vaultExtra, VAULT_BONUS_MAX } from '../../shared/data/cosmetics.js';

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
/** 🎮 v65: card de modo. Ícone = ui/mode_<id>.png (reserva: emoji); arte do botão inteiro = ui/btn_<id>.png (opcional). */
const MODE_SPRITE = { solo: 'solo', online: 'online', teams: 'teams', war: 'war', braid: 'raid', duel: 'duel', series: 'series', cup: 'cup', tower: 'tower', guild: 'guild', safari: 'safari', farm: 'farm', 'new-local': 'offline' };
function modeTile(act, color, emoji, name, desc, disabled, extra = '', rawIcon = false) {
  const id = MODE_SPRITE[act] || act;
  return `<button class="mode-tile ${color} ${extra}" data-act="${act}" ${disabled ? 'disabled' : ''}>${uiBanner(id)}<span class="mt-ic">${rawIcon ? spriteIconRaw(id, emoji) : uiIcon(`mode_${id}`, emoji)}</span><b>${name}</b><small>${desc}</small></button>`;
}
const spriteIconRaw = (id, html) => html; // a Liga usa o logo do jogo


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
          <div class="av-wrap"><img class="avatar ${profile?.cosmetic?.frame ? 'frame-' + esc(profile.cosmetic.frame) : ''}" src="${avatarUrl(profile?.avatar, profile?.cosmetic?.skin)}" alt="avatar">${profile?.stats?.megaBracelet ? `<img class="tc-mega" src="${itemUrl('mega_bracelet')}" alt="" title="🔗 Bracelete Mega" data-color="#7b4bd6">` : ''}</div>
          <div class="grow"><h3 style="color:var(--gold)">${esc(profile?.trainer_name || 'Treinador')}${profile?.stats?.megaBracelet ? ' <span class="chip purple tc-mega-chip" title="Tem o Bracelete Mega: pode Mega Evoluir">🔗 Mega</span>' : ''}</h3>
            ${titleHtml(profile?.cosmetic)}
            <div class="small">⭐ ${profile?.points || 0} pts · ${eloOf(profile?.rating ?? 1000).icon} ${eloOf(profile?.rating ?? 1000).name} (${profile?.rating ?? 1000}) · 📖 ${(profile?.pokedex || []).length} · 📦 ${(profile?.vault || []).length}</div></div>
          <div class="col" style="gap:6px;align-items:flex-end">
            <button class="btn sm" data-act="edit" ${profile ? '' : 'disabled'} title="Editar nome e avatar">✏️</button>
            <span class="chip gold" title="Ouro da conta: ganho no fim de cada partida salva. Use no Mercado ou leve para partidas do modo Coleção. Ganhe mais vendendo recursos da 🌾 Fazenda.">🪙 ${profile?.gold || 0}</span>
            <span class="chip" title="Diamantes"><span class="diamonds">💎 ${profile?.diamonds || 0}</span></span>
          </div>
        </div>
        <div class="daily"><img src="${monSprite(daily)}" alt="${esc(dsp?.name)}"><div><div class="tiny" style="color:var(--gold)">⭐ POKÉMON DO DIA</div><b>${esc(dsp?.name)}</b> ${typeChips(dsp?.types || [])}
          <div class="tiny muted">Aparece mais, dá XP em dobro e tem chance de shiny 1/64.</div>
          <button class="wall-inline" data-wall-open title="Últimos lendários e shinies capturados por todos">✨ Capturas raras <b data-wall-count></b></button></div></div>
      </div>

      ${mine.length || localSave ? `<div class="hub-continue"><b>▶ Continuar</b>
        ${mine.map(m => `<button class="btn sm green" data-act="resume-online" data-id="${m.id}">${esc(m.name)} · ${m.status === 'playing' ? 'em jogo' : 'no lobby'} · ${m.players} jog.</button>`).join('')}
        ${localSave ? '<button class="btn sm" data-act="resume-local">📱 Partida offline</button>' : ''}</div>` : ''}

      <h2 class="hub-h">🎮 Jogar</h2>
      <div class="mode-tiles">
        ${modeTile('solo', 't-green', '🤖', 'Treino contra CPUs', 'Salva na conta: capturas e níveis vão para a Coleção. O jeito de farmar.', !profile, 'wide')}
        ${modeTile('online', 't-blue', '🌐', 'Online', 'Crie ou entre em salas: Balanceado, Coleção, Competitivo (Liga), Battle Royale, Conquista.', !profile)}
        ${modeTile('teams', 't-sky', '🤝', 'Duplas e Trios', 'Jogue em time no tabuleiro: passem itens, curem juntos, ajudem nas batalhas. O time vence junto.', !profile)}
        ${modeTile('war', 't-crimson', '🏰', 'Guerra de Regiões', 'Conquista por times: pintem as cidades com a cor do time. Cada cidade a mais rende +15% para todos.', !profile)}
        ${modeTile('braid', 't-dragon', '🐉', 'Raid em Grupo', 'Até 4 treinadores contra um chefe lendário ou Mega em 3 fases. Papéis, MVP e captura.', !profile, 'wide')}
        ${modeTile('duel', 't-red', '⚔️', 'Duelo PVP', 'Chame todos os online para um duelo 1x1 (ou aceite um desafio). Vale Elo. No fim, volta para onde estava.', !profile)}
        ${modeTile('series', 't-green', '<img class="mt-logo" src="/icons/icon-192.png" alt="">', 'Liga das Séries', `Série D → A no estilo Brasileirão. Seu time de defesa joga por você offline.${profile?.stats?.serie?.season ? ` · ${['🟤 D', '⚪ C', '🟡 B', '🏆 A'][profile.stats.serie.div | 0]} · ${profile.stats.serie.pts | 0} pts` : ''}`, !profile, '', true)}
        ${modeTile('cup', 't-gold', '🏟️', 'Copa', 'Chaveamento de até 8 treinadores. O campeão ganha 💎.', !profile)}
        ${modeTile('tower', 't-purple', '🗼', 'Torre de Batalha', profile?.stats?.tower?.set ? `🔥 Sequência ${profile.stats.tower.streak} · duelo ${profile.stats.tower.set.n}/7` : `Sozinho ou 🤝 em dupla com um amigo. 🏅 ${profile?.stats?.tower?.pb || 0} PB · recorde ${profile?.stats?.tower?.best || 0}`, !profile)}
        ${modeTile('guild', 't-indigo', '🛡️', 'Guildas', profile?.stats?.guild ? 'Sua guilda: veja os membros e o ranking da semana.' : 'Junte até 8 treinadores, somem pontos na semana e disputem o ranking.', !profile)}
        ${modeTile('safari', 't-teal', '🌿', 'Zona Safári', profile?.stats?.safari && !profile.stats.safari.over ? '👣 Passeio em andamento!' : 'Capture Pokémon raros pagando a entrada com ouro.', !profile)}
        ${modeTile('farm', 't-orange', '🌾', 'Fazenda', profile?.stats?.farm?.slots?.length ? `${profile.stats.farm.slots.length} Pokémon · Nv. ${profile.stats.farm.lvl || 1} · horta, construções e casa` : 'Solte seus Pokémon para treinar, plante na horta e monte sua casa.', !profile)}
        ${modeTile('new-local', 't-gray', '📱', 'Offline', 'Mesmo aparelho, com amigos e/ou CPUs. Não salva na conta.', false)}
      </div>
      <details class="hub-info"><summary>ℹ️ Como funcionam os modos de sala</summary>
        <div class="tiny muted">${Object.values(MODE_INFO).map(m => `${m.icon} <b>${m.name}</b>: ${m.desc}`).join('<br>')}<br>Todo modo de tabuleiro aceita Clássico, ⚔️ Battle Royale e 🏰 Conquista, e a opção ☠️ Hardcore.</div></details>

      <h2 class="hub-h">🎒 Minha conta</h2>
      <div class="acct-tiles">
        <button class="acct-tile" data-act="titles" ${profile ? '' : 'disabled'}><span>🏅</span><b>Títulos</b><small>${profile ? `${unlockedTitles(profile).length}/${ACH_TITLES.length} conquistados` : 'conquistas com efeito'}</small></button>
        <button class="acct-tile" data-act="vault" ${profile ? '' : 'disabled'}><span>${uiIcon('collection', '📦')}</span><b>Coleção</b><small>${(profile?.vault || []).length} Pokémon</small></button>
        <button class="acct-tile" data-act="dex"><span>${uiIcon('pokedex', '📖')}</span><b>Pokédex</b><small>${(profile?.pokedex || []).length} capturados</small></button>
        <button class="acct-tile" data-act="companions" ${profile ? '' : 'disabled'}><span>🤝</span><b>Companheiros</b><small>${(profile?.stats?.companions || []).length}/${Object.keys(COMPANIONS).length}${profile?.stats?.companion && COMPANIONS[profile.stats.companion] ? ` · ${esc(COMPANIONS[profile.stats.companion].name)}${bondLevel(profile?.stats?.companionBond?.[profile.stats.companion] || 0) >= 10 ? ' ❤️' : ''}` : ''}</small></button>
        <button class="acct-tile" data-act="abag" ${profile ? '' : 'disabled'}><span>${uiIcon('bag', '🎒')}</span><b>Mochila</b><small>${Object.values(profile?.stats?.bag || {}).reduce((a, b) => a + b, 0)} itens · levar e vender</small></button>
        <button class="acct-tile" data-act="market" ${profile ? '' : 'disabled'}><span>🏪</span><b>Mercado</b><small>Pokémon e itens</small></button>
        <button class="acct-tile" data-act="daily" ${profile ? '' : 'disabled'}><span>🎁</span><b>Prêmio diário</b><small>${profile ? (dailyStatus(profile.stats?.login).canClaim ? '🔴 Disponível agora!' : `🔥 ${profile.stats?.login?.streak || 0} dias seguidos`) : ''}</small></button>
        <button class="acct-tile" data-act="trophies" ${profile ? '' : 'disabled'}><span>🏆</span><b>Sala de Troféus</b><small>${(profile?.stats?.trophies || []).length} troféus da Liga das Séries</small></button>
        <button class="acct-tile" data-act="music"><span>🎵</span><b>Música</b><small>YouTube enquanto joga</small></button>
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
    // 🤝🏰🐉🛡️ v65: modos em equipe
    teams: () => teamModeChooser(ctx, profile, { title: '🤝 Duplas e Trios', teams: 2, rules: 'classic' }),
    war: () => teamModeChooser(ctx, profile, { title: '🏰 Guerra de Regiões', teams: 2, rules: 'conquest' }),
    braid: () => teamModeChooser(ctx, profile, { title: '🐉 Raid em Grupo', teams: 0, rules: 'bossraid' }),
    guild: () => openGuild(profile, p => { profile = p; }),
    vault: () => collectionModal(profile, rerender),
    companions: () => openCompanionPicker({ owned: profile?.stats?.companions || [], current: profile?.stats?.companion || null, bond: profile?.stats?.companionBond || {},
      onPick: async id => { try { profile = (await api('profile', { op: 'companion', id })).profile; toast(id ? `🤝 ${COMPANIONS[id].name} vai com você nas próximas partidas!` : 'Sem companheiro.', 'good'); rerender(profile); } catch (e) { toast(e.message, 'bad'); } } }),
    dex: () => openDex(null, profile?.pokedex || [], profile?.pokedex_seen || [], { shinyCaught: profile?.stats?.shinyDex || [], shinySeen: profile?.stats?.shinySeen || [], megaDex: profile?.stats?.megaDex || null, vault: profile?.vault || [] }),
    duel: () => openPvp(ctx, profile), // ⚔️ v69: Duelo PVP (no lugar da fila do Torneio)
    series: () => openSeries(ctx, profile),
    trophies: () => openTrophies(profile),
    titles: () => openTitles(profile, p => { profile = p; rerender(); }),
    daily: () => openDaily(profile, p => rerender(p)),
    farm: () => openFarm({ onProfile: p => { profile = p; } }, profile),
    safari: () => openSafari(profile, p => { profile = p; }),
    tower: () => openTower(ctx, profile, p => { profile = p; }),
    install: () => promptInstall(),
    cup: async () => {
      try {
        const r = await api('match', { op: 'create', name: `Copa de ${profile?.trainer_name || 'Treinador'}`, mode: 'cup', maxPlayers: 8, isPublic: true });
        ctx.go('room', r.match.id);
      } catch (e) { toast(e.message, 'bad'); }
    },
    music: async () => (await import('./music.js')).openMusic(),
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
    checkNewTitles(profile);
    try { await autoDaily(profile, p => rerender(p)); await checkSeasonResult(profile); await defenseReport(profile); } catch { /* só aviso */ }
  }, 600);
}

/** 🤝 v65: escolher entre jogar o modo de time com CPUs (treino) ou criar uma sala online para amigos. */
function teamModeChooser(ctx, profile, o) {
  const raid = o.rules === 'bossraid';
  const ov = openModal('tmode', o.title, `<p class="small muted">${raid ? 'Até 4 treinadores contra um chefe lendário ou Mega em 3 fases (cada um com 1 Pokémon da Coleção e um papel: ⚔️ Atacante, 💚 Suporte ou 🌀 Controle).' : o.rules === 'conquest' ? 'Conquista em times: as cidades são do time, aliados não se atacam e cada cidade a mais rende +15% para o time.' : 'O time vence junto: passem itens, curem juntos no Centro Pokémon, ajudem nas batalhas quando estiverem perto e usem o 🎲 Dado de Apoio (1× por partida).'}</p>
    <div class="grid2" style="margin-top:8px">
      <button class="btn primary big" data-act="cpu">🤖 Com CPUs<br><span class="tiny">salva na conta</span></button>
      <button class="btn blue big" data-act="room">🌐 Sala online<br><span class="tiny">chame seus amigos</span></button>
    </div>
    ${raid ? '' : `<div class="row" style="gap:6px;justify-content:center;margin-top:8px"><span class="small">Tamanho do time:</span><button class="btn sm ${o.teams === 2 ? 'primary' : ''}" data-act="sz" data-n="2">Duplas</button><button class="btn sm ${o.teams === 3 ? 'primary' : ''}" data-act="sz" data-n="3">Trios</button></div>`}`);
  bindActions(ov, {
    sz: d => { o.teams = Number(d.n); ov.querySelectorAll('[data-act="sz"]').forEach(b => b.classList.toggle('primary', b.dataset.n === d.n)); },
    cpu: () => { closeModal('tmode'); soloModal(profile, ctx, raid ? { rules: 'bossraid', useTeam: true, bots: 2 } : { rules: o.rules, teams: o.teams, bots: o.teams * 2 - 1 }); },
    room: async () => {
      try {
        const r = await api('match', { op: 'create', name: `${o.title.replace(/^\S+\s/, '')} de ${profile?.trainer_name || 'Treinador'}`, mode: raid ? 'collection' : 'balanced', maxPlayers: raid ? 4 : o.teams * 2, rules: o.rules, teams: raid ? 0 : o.teams, isPublic: true, turnLimit: 60 });
        closeModal('tmode'); ctx.go('room', r.match.id);
      } catch (e) { toast(e.message, 'bad'); }
    }
  });
}

function soloModal(profile, ctx, preset = {}) {
  const st = { bots: 2, turnLimit: 60, useTeam: false, starter: 'charmander', team: [], map: 'kanto', bring: 0, rules: 'classic', hardcore: false, megas: false, items: {}, teams: 0, ...preset };
  const raidMode = () => st.rules === 'bossraid';
  const body = () => `
    ${raidMode() ? '<p class="small">🐉 <b>Raid em Grupo</b>: escolha seu time da Coleção — na hora da Raid você entra com 1 Pokémon e escolhe o papel. As CPUs entram junto com você.</p>' : ''}
    ${st.teams ? `<p class="small">🤝 <b>${st.teams === 2 ? 'Duplas' : 'Trios'}</b>: CPUs também viram seus parceiros de time. Precisa de pelo menos ${st.teams * 2 - 1} CPUs para formar ${st.teams === 2 ? '2 duplas' : '2 trios'}.</p>` : ''}
    <div class="grid2">
      <div class="field"><label>Times</label><select class="input" id="s-teams" ${raidMode() ? 'disabled' : ''}><option value="0" ${!st.teams ? 'selected' : ''}>Cada um por si</option><option value="2" ${st.teams === 2 ? 'selected' : ''}>🤝 Duplas</option><option value="3" ${st.teams === 3 ? 'selected' : ''}>🤝 Trios</option></select></div>
      <div class="field"><label>${st.teams ? 'CPUs (parceiros + rivais)' : 'Adversários (CPU)'}</label><select class="input" id="s-bots">${[1, 2, 3, 4, 5].map(n => `<option ${n === st.bots ? 'selected' : ''}>${n}</option>`).join('')}</select>
        ${st.teams && !raidMode() ? `<div class="tiny good">🤝 ${(() => { const n = st.bots + 1, k = Math.max(2, Math.ceil(n / st.teams)); return `${k} times de ${st.teams}: você + ${st.teams - 1} CPU parceira${st.teams > 2 ? 's' : ''} contra ${n - st.teams} CPU${n - st.teams > 1 ? 's' : ''}`; })()}</div>` : ''}</div>
      <div class="field"><label>Duração</label><select class="input" id="s-turns"><option value="30" ${st.turnLimit === 30 ? 'selected' : ''}>Rápida (30 turnos)</option><option value="45" ${st.turnLimit === 45 ? 'selected' : ''}>Média (45 turnos)</option><option value="60" ${st.turnLimit === 60 ? 'selected' : ''}>Normal (60 turnos)</option></select></div>
<div class="field"><label>Tipo de partida</label><select class="input" id="s-rules">${Object.entries(GAME_RULES).map(([k, g]) => `<option value="${k}" ${k === (st.rules) ? 'selected' : ''} title="${esc(g.desc)}">${g.icon} ${g.name}</option>`).join('')}</select></div>
      <div class="field"><label>Mapa</label><select class="input" id="s-map">${MAP_CHOICES.map(m => `<option value="${m.id}" ${m.id === (st.map) ? 'selected' : ''} title="${esc(m.desc)}">${m.icon || '🗺️'} ${esc(m.name)}</option>`).join('')}</select>${mapInfo(st.map)}</div>
      <div class="field"><label>Dificuldade</label><select class="input" id="s-hc"><option value="0" ${!st.hardcore ? 'selected' : ''}>Normal</option><option value="1" ${st.hardcore ? 'selected' : ''}>☠️ Hardcore</option></select><div class="tiny muted">${HARDCORE_TXT}</div></div>
    </div>
    <div class="tabs" style="margin:10px 0"><button class="btn sm ${!st.useTeam ? 'primary' : ''}" data-act="use-starter">🌱 Começar com inicial</button><button class="btn sm ${st.useTeam ? 'primary' : ''}" data-act="use-team">📦 Levar time da Coleção</button></div>
    ${st.useTeam ? teamPicker(profile?.vault, st.team, 0) + `
      <div class="bring-gold"><b>🪙 Levar ouro da conta</b> <span class="tiny muted">(você tem ${profile?.gold || 0}; o que sobrar volta no fim)</span>
                <div class="row" style="gap:4px;margin-top:4px">${[0, 300, 600, 1000, 2000].map(v => `<button class="btn sm ${(st.bring) === v ? 'primary' : ''}" data-act="s-bring" data-v="${v}" ${v > (profile?.gold || 0) ? 'disabled' : ''}>${v ? v : 'Nada'}</button>`).join('')}</div></div>
      <div class="bring-gold"><b>🎒 Levar itens da Mochila</b> <span class="tiny muted">${esc(bringSummary(st.items))}</span> <button class="btn sm" data-act="s-items">Escolher</button></div>
      <div class="bring-gold"><b>💎 Mega / 🔴 Gigantamax</b> <select class="input sm" id="s-megas" style="width:auto;display:inline-block"><option value="0" ${!st.megas ? 'selected' : ''}>Desligado</option><option value="1" ${st.megas ? 'selected' : ''}>Megas e Gigantamax liberados</option></select> <span class="tiny muted">${[profile?.stats?.megaBracelet ? '🔗 Bracelete Mega' : '', profile?.stats?.dynamaxBand ? '🔴 Pulseira Dynamax' : ''].filter(Boolean).join(' + ') || 'precisa do 🔗 Bracelete Mega ou da 🔴 Pulseira Dynamax (caem em Raids)'}</span></div>` : starterPicker(st.starter)}
    <button class="btn primary block" data-act="go" style="margin-top:10px">▶ Começar treino</button>`;
  const ov = openModal('solo', raidMode() ? '🐉 Raid em Grupo com CPUs' : st.teams ? '🤝 Treino em time com CPUs' : '🤖 Treino contra CPUs', body(), { wide: true });
  const keep = () => { st.teams = Number(ov.querySelector('#s-teams')?.value || 0); st.bots = Number(ov.querySelector('#s-bots').value); st.turnLimit = Number(ov.querySelector('#s-turns').value); st.map = ov.querySelector('#s-map').value; st.rules = ov.querySelector('#s-rules').value; st.hardcore = ov.querySelector('#s-hc').value === '1'; if (ov.querySelector('#s-megas')) st.megas = ov.querySelector('#s-megas').value === '1'; };
  const re = () => { keep(); setModalBody('solo', body()); };
  // 🤝 v65c: escolher Duplas/Trios já ajusta o número de CPUs (dupla = você + 1 CPU contra 2 CPUs)
  ov.addEventListener('change', e => {
    if (!['s-teams', 's-rules', 's-bots'].includes(e.target.id)) return;
    keep();
    if (st.teams && !raidMode() && st.bots < st.teams * 2 - 1) st.bots = st.teams * 2 - 1;
    if (raidMode()) { st.useTeam = true; st.bots = Math.min(st.bots, 3); }
    setModalBody('solo', body());
  });
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
        if (raidMode() && !st.team.length) return toast('🐉 Escolha seu time da Coleção para a Raid em Grupo.', 'bad');
        if (st.teams && st.bots + 1 < st.teams * 2) return toast(`Para ${st.teams === 2 ? 'Duplas' : 'Trios'} são precisas pelo menos ${st.teams * 2 - 1} CPUs.`, 'bad');
        if (raidMode() && st.bots > 3) return toast('🐉 A Raid em Grupo é para até 4 treinadores (até 3 CPUs).', 'bad');
        const { match } = await api('match', { op: 'solo', teams: raidMode() ? 0 : st.teams, bots: st.bots, turnLimit: st.turnLimit, map: st.map, rules: st.rules, hardcore: st.hardcore, megas: st.useTeam && st.megas, bringGold: st.useTeam ? st.bring : 0, bringItems: st.useTeam ? st.items : {}, starter: st.starter, teamUids: st.useTeam ? st.team : [] });
        closeModal('solo');
        ctx.openOnline(match.id);
      } catch (e) { toast(e.message, 'bad'); }
    }
  });
}

function collectionModal(profile, onChange) {
  const cap = () => 300 + vaultExtra(profile?.stats);
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
    ${picking?.rel ? `<div class="bx-pick rel">🕊️ Toque nos Pokémon para <b>soltar</b> · <b>${picking.sel.size}</b> escolhido(s) · 🪙 <span class="rel-gold">${relGold()}</span>
        <button class="btn sm red" data-act="rel-ok" ${picking.sel.size ? '' : 'disabled'}>🕊️ Soltar escolhidos</button><button class="btn sm" data-act="bx-pick-cancel">Cancelar</button>
        <div class="tiny muted">⭐ Favoritos, time da Liga e Pokémon na Fazenda/Creche não podem ser escolhidos.</div></div>`
      : picking ? `<div class="bx-pick">Toque nos Pokémon para colocar em <b>${esc(boxes().find(b => b.id === picking.box)?.name || '')}</b> · <b>${picking.sel.size}</b> escolhido(s)
        <button class="btn sm primary" data-act="bx-pick-ok" ${picking.sel.size ? '' : 'disabled'}>📥 Colocar na box</button><button class="btn sm" data-act="bx-pick-cancel">Cancelar</button></div>`
      : cur ? `<div class="bx-head">${cur.icon} <b>${esc(cur.name)}</b> <span class="tiny muted">${cur.uids.length} Pokémon</span>
        <button class="btn sm primary" data-act="bx-add">➕ Adicionar Pokémon</button><button class="btn sm" data-act="bx-rename">✏️ Nome</button>
        <select class="input sm" data-act-change="bx-icon">${BOX_ICONS.map(i => `<option ${i === cur.icon ? 'selected' : ''}>${i}</option>`).join('')}</select>
        <button class="btn sm red" data-act="bx-del">🗑️ Apagar box</button></div>`
      : view === 'all' ? `<div class="bx-quick tiny muted">Box automática: ${QUICK.map(([k, i, n]) => `<button class="btn sm" data-act="bx-quick" data-k="${k}">${i} ${n}</button>`).join('')}</div>` : ''}`;
  };
  // 🗂️ v58: Coleção compacta (ícones) — o card completo abre ao tocar. Preferência salva no aparelho.
  let compact = (() => { try { return localStorage.getItem('pmhx_vault_view') !== 'cards'; } catch { return true; } })();
  const actBtns = (m, bx, evoReady) => `<div class="row" style="justify-content:center;gap:4px;margin-top:4px">${bx && view === bx.id ? `<button class="btn sm" data-act="bx-out" data-uid="${esc(m.uid)}" title="Tirar da box">↩️</button>` : ''}<button class="btn sm" data-act="fav" data-uid="${esc(m.uid)}" title="Favorito">${m.fav ? '⭐' : '☆'}</button><button class="btn sm" data-act="farm" data-uid="${esc(m.uid)}" title="Mandar para a 🌾 Fazenda (ganha XP com o tempo)">🌾</button><button class="btn sm ${m.held ? 'purple' : ''} ${evoReady(m) ? 'green' : ''}" data-act="mstone" data-uid="${esc(m.uid)}" title="${evoReady(m) ? '✨ Pode evoluir (por nível ou com item da Mochila)! · ' : ''}🎒 Item segurado (Megapedra ou item de batalha): equipar / trocar / tirar">${evoReady(m) ? '✨' : megaBySpecies(m.sp).length ? '💎' : '🎒'}</button><button class="btn sm" data-act="nick" data-uid="${esc(m.uid)}" title="${profile?.stats?.nicknames ? 'Dar apelido' : 'Apelidos: libere na 💎 Loja'}">✏️</button><button class="btn sm red" data-act="rel" data-uid="${esc(m.uid)}" title="Soltar (o Professor paga 🪙 ${releaseGold(m)})">✕</button></div>` ;
  const miniTile = (m, evo) => { const sp = getSpecies(m.sp);
    return `<button class="vm-tile t${sp?.tier || 1} ${m.shiny ? 'shiny' : ''} ${sp?.legendary ? 'legend' : ''}" data-act="vm-open" data-uid="${esc(m.uid)}" title="${esc(m.nick || sp?.name || '')}">
      <img src="${monSprite(m)}" alt="" loading="lazy" decoding="async"><span class="vm-name">${esc(m.nick || sp?.name || '?')}</span><span class="vm-lv">Nv.${m.lvl}</span>
      <span class="vm-ty">${(sp?.types || []).map(t => `<i style="background:${typeColor(t)}" title="${esc(typeLabel(t))}">${typeIcon(t)}</i>`).join('')}</span>
      <span class="vm-badges">${m.shiny ? '✨' : ''}${m.fav ? '⭐' : ''}${m.gx ? '🔴' : ''}${m.held ? '🎒' : ''}${evo ? '<b class="vm-evo">✨</b>' : ''}</span></button>`; };
  // 🕊️ v59: soltar vários de uma vez
  const relLocked = m => m.fav || (profile?.stats?.serie?.defense || []).includes(m.uid) || (profile?.stats?.farm?.slots || []).some(s => s?.uid === m.uid) || [profile?.stats?.farm?.daycare?.a, profile?.stats?.farm?.daycare?.b].includes(m.uid);
  const relGold = () => [...(picking?.sel || [])].reduce((a, u) => { const m = (profile?.vault || []).find(x => x.uid === u); return a + (m ? releaseGold(m) : 0); }, 0);
  const body = () => {
    const vault = profile?.vault || [];
    const all = sortCollection(vault);
    const recent = new Map(vault.map((m, i) => [m.uid, i]));
    const bagNow = profile?.stats?.bag || {};
    const evoReady = m => !!levelEvoTarget(m) || evoItemsFor(m).some(id => (bagNow[id] || 0) > 0); // ✨ tem nível ou item de evolução que serve
    const n = k => all.filter(m => k(m)).length;
    return `<details class="info-fold"><summary class="small">ℹ️ Como funciona a Coleção</summary><p class="small muted">Tudo que você captura em partidas salvas na conta (Treino contra CPUs e Online) fica aqui, com o nível atualizado. Use no modo <b>📦 Coleção</b> para levar seu time. Limite: ${cap()}. Se lotar, só os comuns mais fracos saem e ficam em "↩️ Saíram da Coleção" para recuperar (⭐ favoritos, shinies, lendários, Vermelhos/Amarelos, Confiança e com apelido nunca saem).${vaultExtra(profile?.stats) >= VAULT_BONUS_MAX ? '' : ' Dá para ampliar +50 vagas por compra na 💎 Loja (várias vezes).'}</p></details>
      ${(profile?.stats?.overflow || []).length ? `<details class="vf-out"><summary>↩️ Saíram da Coleção (${profile.stats.overflow.length}) — toque para ver e recuperar</summary>
        <p class="tiny muted">Pokémon que você soltou ou que saíram sozinhos quando a Coleção lotou (só saem os comuns, tier até Azul). Ficam aqui por um tempo (últimos 120).</p>
        <div class="pk-grid">${profile.stats.overflow.map(m => statCard(m, { extra: `<div class="tiny muted">${m.why === 'solto' ? 'Solto por você' : 'Coleção cheia'} · ${new Date(m.outAt).toLocaleDateString('pt-BR')}</div><button class="btn sm green" data-act="restore" data-uid="${esc(m.uid)}">↩️ Recuperar${m.paid ? ` (devolve 🪙 ${m.paid})` : ''}</button>` })).join('')}</div></details>` : ''}
      ${(profile?.vault || []).length > cap() ? `<p class="small" style="color:#ffb35c">⚠️ Sua Coleção passou do limite (${(profile.vault || []).length}/${cap()}). Nada some sozinho além dos comuns; solte alguns para liberar espaço.</p>` : ''}
      <div class="vf-sum tiny muted">⚡ ${n(m => getSpecies(m.sp)?.legendary && !getSpecies(m.sp)?.mythical)} lendários · 🌟 ${n(m => getSpecies(m.sp)?.mythical)} míticos · ✨ ${n(m => m.shiny)} shinies · ⭐ ${n(m => m.fav)} favoritos · 🤝 ${n(m => m.trust)} da Confiança</div>
      <div class="row" style="justify-content:flex-end;margin:4px 0;gap:6px">${picking ? '' : '<button class="btn sm" data-act="rel-many">🕊️ Soltar vários</button>'}<button class="btn sm" data-act="vm-toggle">${compact ? '🃏 Ver como cartas' : '🔳 Ver compacto'}</button></div>
      ${boxBar()}
      <div class="vf-scope">${vfBar('vault')}
      <div class="pk-grid ${picking ? 'bx-picking' : ''}">${all.map(m => { const bx = boxOf(m.uid); const hide = picking?.rel ? relLocked(m) : picking ? !!bx && bx.id === picking.box : view === 'none' ? !!bx : view !== 'all' && bx?.id !== view;
        return `<div class="vf-cell ${compact ? 'vf-mini' : ''} ${hide ? 'bx-hide' : ''} ${picking?.sel.has(m.uid) ? 'bx-sel' : ''}" data-uid="${esc(m.uid)}" ${vfAttrs(m, recent.get(m.uid) || 0)}>${bx && view === 'all' ? `<span class="bx-tag" title="${esc(bx.name)}">${bx.icon}</span>` : ''}${compact ? miniTile(m, evoReady(m)) : statCard(m, { extra: actBtns(m, bx, evoReady) })}</div>`; }).join('') || '<p class="muted">Nada aqui ainda.</p>'}</div></div>`;
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
    if (!picking || (e.target.closest('button,select,input') && !e.target.closest('.vm-tile'))) return; // v59: o mini-cartão também escolhe
    const cell = e.target.closest('.vf-cell[data-uid]');
    if (!cell) return;
    const u = cell.dataset.uid;
    picking.sel.has(u) ? picking.sel.delete(u) : picking.sel.add(u);
    cell.classList.toggle('bx-sel', picking.sel.has(u));
    const bar = ov.querySelector('.bx-pick b:nth-of-type(2)'); if (bar) bar.textContent = picking.sel.size;
    const okBtn = ov.querySelector('[data-act=bx-pick-ok],[data-act=rel-ok]'); if (okBtn) okBtn.disabled = !picking.sel.size;
    const rg = ov.querySelector('.rel-gold'); if (rg) rg.textContent = relGold();
  });
  ov.addEventListener('change', e => {
    if (e.target.dataset.actChange !== 'bx-icon') return;
    saveBoxes(boxes().map(b => (b.id === view ? { ...b, icon: e.target.value } : b)));
  });
  const op = async (o, uid) => {
    try { profile = (await api('profile', { op: o, uid })).profile; redraw(); onChange(profile); }
    catch (e) { toast(e.message, 'bad'); }
  };
  const acts = {
    fav: d => op('favorite', d.uid),
    farm: async d => {
      try { await api('profile', { op: 'farm_place', uid: d.uid }); toast('🌾 Foi para a Fazenda! Ele ganha XP com o tempo.', 'good'); }
      catch (e) { toast(e.message, 'bad'); }
    },
    nick: async d => {
      if (!profile?.stats?.nicknames) return toast('Apelidos são liberados na 💎 Loja de Diamantes → Conveniência.', 'info');
      const m = (profile.vault || []).find(x => x.uid === d.uid);
      const nick = prompt(`Apelido para ${getSpecies(m.sp).name} (até 12 letras; vazio tira o apelido):`, m.nick || '');
      if (nick === null) return;
      try { profile = (await api('profile', { op: 'nickname', uid: d.uid, nick })).profile; redraw(); onChange(profile); toast(nick.trim() ? `✏️ Agora é ${nick.trim().slice(0, 12)}!` : 'Apelido removido.', 'good'); }
      catch (e) { toast(e.message, 'bad'); }
    },
    mstone: d => { // 💎 equipar a Megapedra direto no Pokémon
      const m = (profile.vault || []).find(x => x.uid === d.uid);
      if (!m) return;
      const bag = profile?.stats?.bag || {};
      const opts = megaBySpecies(m.sp);
      const gear = Object.keys(ALL_ITEMS).filter(id => ALL_ITEMS[id].kind === 'gear' && ((bag[id] || 0) > 0 || m.held === id));
      const ov2 = openModal('mstone', `🎒 Itens — ${esc(m.nick || getSpecies(m.sp).name)}`, `<div class="ms-pick">
          <p class="tiny muted">Cada Pokémon segura <b>1 item</b>: uma Megapedra <i>ou</i> um item de batalha. Trocar devolve o anterior para a Mochila.</p>
          ${opts.map(x => { const id = `ms_${x.key}`, n = bag[id] || 0, on = m.held === id;
            return `<div class="ms-opt ${on ? 'on' : ''}"><img class="ms-st" src="${itemUrl(id)}" alt=""><img class="ms-mon" src="${monSprite({ sp: x.sp, shiny: m.shiny })}" alt="">
              <div class="grow"><b>${esc(ALL_ITEMS[id].name)}</b><div class="tiny muted">vira <b>${esc(x.name)}</b> · você tem ${n} na Mochila</div></div>
              ${on ? '<span class="chip purple">Segurando</span>' : `<button class="btn sm primary" data-act="ms-hold" data-item="${id}" ${n > 0 ? '' : 'disabled'}>Equipar</button>`}</div>`; }).join('')}
          ${gear.length ? '<h4 style="margin:6px 0 2px">⚔️ Itens de batalha</h4>' : ''}
          ${gear.map(id => { const n = bag[id] || 0, on = m.held === id;
            return `<div class="ms-opt ${on ? 'on' : ''}"><img class="ms-st" src="${itemUrl(id)}" alt=""><div class="grow"><b>${esc(ALL_ITEMS[id].name)}</b><div class="tiny muted">${esc(ALL_ITEMS[id].desc.replace(/^Item de batalha \(segurado\): /, ''))} · você tem ${n}</div></div>
              ${on ? '<span class="chip purple">Segurando</span>' : `<button class="btn sm primary" data-act="ms-hold" data-item="${id}" ${n > 0 ? '' : 'disabled'}>Equipar</button>`}</div>`; }).join('')}
          ${!gear.length ? '<p class="tiny muted">⚔️ Itens de batalha (Garra Rápida, Faixa de Foco, Placas, Restos, Faixa Escolhida) são feitos na 🔨 Oficina da Fazenda.</p>' : ''}
          ${m.held ? '<button class="btn sm" data-act="ms-off">↩️ Tirar o item (volta para a Mochila)</button>' : ''}
          ${opts.length ? `<p class="tiny muted">O Pokémon que segura a pedra é quem pode Mega Evoluir (precisa também do 🔗 Bracelete Mega na conta). Pedras vêm da 🔨 Oficina (10 fragmentos), de Mega Raids e do 🏪 Mercado.</p>` : ''}
          ${GMAX[m.sp] ? `<h4 style="margin:6px 0 2px">🔴 Gigantamax</h4><div class="ms-opt ${m.gx ? 'on' : ''}"><img class="ms-st" src="${itemUrl('max_soup')}" alt=""><img class="ms-mon" src="${monSprite({ sp: GMAX[m.sp].sp, shiny: m.shiny })}" alt="">
            <div class="grow"><b>${m.gx ? '✨ Tem o Fator Gigantamax' : 'Sem o Fator Gigantamax'}</b><div class="tiny muted">${m.gx ? `Com a 🔴 Pulseira Dynamax, vira ${esc(GMAX[m.sp].name)} por 3 rodadas (no lugar da Mega).` : `🍲 Sopa Max dá o Fator para sempre · você tem ${bag.max_soup || 0}`}</div></div>
            ${m.gx ? '<span class="chip red">🔴 Fator</span>' : `<button class="btn sm red" data-act="ms-soup" ${(bag.max_soup || 0) > 0 ? '' : 'disabled'}>🍲 Dar Sopa</button>`}</div>` : ''}
          ${(() => { // ⬆️ v64b: evolução por nível na Coleção (+ 🍬 Doce Raro)
            const to = levelEvoTarget(m);
            const nxt = (getSpecies(m.sp).evos || []).filter(e => e.lvl && !e.item && getSpecies(e.to)).sort((a, b) => a.lvl - b.lvl)[0];
            const candy = bag.rare_candy || 0;
            if (!to && !nxt && !candy) return '';
            return `<h4 style="margin:6px 0 2px">⬆️ Evoluir por nível</h4>
              ${to ? `<div class="ms-opt"><img class="ms-mon" src="${monSprite({ sp: to, shiny: m.shiny })}" alt=""><div class="grow"><b>${esc(getSpecies(to).name)}</b><div class="tiny muted">já tem nível para evoluir (Nv.${m.lvl})</div></div>
                <button class="btn sm green" data-act="ms-lvl">✨ Evoluir</button></div>` : nxt ? `<p class="tiny muted">Evolui para <b>${esc(getSpecies(nxt.to).name)}</b> no Nv.${nxt.lvl} (agora Nv.${m.lvl}) — suba de nível nas partidas, na 🌾 Fazenda ou com 🍬 Doce Raro.</p>` : ''}
              ${candy ? (() => { // 🍬 v66: vários de uma vez
                const room = Math.max(0, 60 - (m.lvl || 1)), max = Math.min(candy, room);
                const qs = [...new Set([1, 5, 10].filter(q => q < max).concat(max ? [max] : []))];
                return `<div class="ms-opt ms-candy"><img class="ms-st" src="${itemUrl('rare_candy')}" alt=""><div class="grow"><b>🍬 Doce Raro</b><div class="tiny muted">+1 nível cada · você tem ${candy}${room ? '' : ' · já está no Nv.60'}</div></div>
                <div class="ms-cq">${qs.map(q => `<button class="btn sm ${q === max && q > 1 ? 'green' : ''}" data-act="ms-candy" data-q="${q}" title="Nv.${(m.lvl || 1)} → Nv.${(m.lvl || 1) + q}">${q === max && q > 1 ? `Até Nv.${(m.lvl || 1) + q}` : `+${q}`}</button>`).join('')}</div></div>`; })() : ''}`; })()}
          ${(() => { // ✨ v54: evoluir com pedra / item de evolução da Mochila
            const evoIds = [...new Set([...evoItemsFor(m), ...((bag.evolution_stone || 0) > 0 && getSpecies(m.sp).evos?.length ? ['evolution_stone'] : [])])];
            if (!evoIds.length) return '';
            return `<h4 style="margin:6px 0 2px">✨ Evoluir com item</h4>${evoIds.map(id => { const n = bag[id] || 0, to = itemEvoTarget(m, id);
              return to ? `<div class="ms-opt"><img class="ms-st" src="${itemUrl(id)}" alt=""><img class="ms-mon" src="${monSprite({ sp: to, shiny: m.shiny })}" alt="">
                <div class="grow"><b>${esc(ALL_ITEMS[id].name)}</b><div class="tiny muted">evolui para <b>${esc(getSpecies(to).name)}</b> · você tem ${n} na Mochila</div></div>
                <button class="btn sm green" data-act="ms-evo" data-item="${id}" ${n > 0 ? '' : 'disabled'}>Evoluir</button></div>` : ''; }).join('')}
              <p class="tiny muted">Itens de evolução caem em eventos do tabuleiro e são vendidos nas lojas das cidades (Pedras nas Azuis, itens de troca nas Vermelhas, os da Gen 8–9 nas Amarelas). Sobras ficam na Mochila da conta.</p>`; })()}
          <h4 style="margin:6px 0 2px">🧪 Treino com itens da Mochila</h4>
          <div class="ms-opt"><img class="ms-st" src="${itemUrl('gene_candy')}" alt="">
            <div class="grow"><b>🧬 Doce Genético</b><div class="tiny muted">Sorteia de novo os IVs (HP ${m.iv?.hp ?? '?'} · ATQ ${m.iv?.atk ?? '?'} · DEF ${m.iv?.def ?? '?'} · VEL ${m.iv?.spe ?? '?'}) — cada um tenta 2 vezes e fica o melhor; pode subir ou cair · você tem ${bag.gene_candy || 0}</div></div>
            <button class="btn sm purple" data-act="ms-gene" ${(bag.gene_candy || 0) > 0 ? '' : 'disabled'}>Dar</button></div>
          <div class="ms-opt"><img class="ms-st" src="${itemUrl('tm')}" alt="">
            <div class="grow"><b>💿 TM</b><div class="tiny muted">Ensina um golpe novo no lugar do 2º ou do 3º · você tem ${bag.tm || 0}</div></div>
            <button class="btn sm" data-act="ms-tm" ${(bag.tm || 0) > 0 ? '' : 'disabled'}>Usar</button></div>
          <p class="tiny muted">🧬 O Doce Genético sai da 🍳 Cozinha ou da 🔨 Oficina da Fazenda, ou de eventos raros nas casas Vermelhas/Amarelas. 🍬 Doce Raro: os que sobram nas partidas (menos os comprados na loja), Oficina (Artesão) ou Loja PB da Torre.</p></div>`);
      const hold = async item => {
        try { profile = (await api('profile', { op: 'hold_stone', uid: m.uid, item })).profile; closeModal('mstone'); redraw(); onChange(profile); toast(item ? `${ALL_ITEMS[item]?.kind === 'gear' ? '⚔️' : '💎'} ${ALL_ITEMS[item]?.name} equipado!` : 'O item voltou para a Mochila.', 'good'); }
        catch (e) { toast(e.message, 'bad'); }
      };
      const evoUse = async item => {
        try { const r = await api('profile', { op: 'evo_item', uid: m.uid, item }); profile = r.profile; closeModal('mstone'); redraw(); onChange(profile); toast(`✨ ${r.evolved.from} evoluiu para ${r.evolved.to}!`, 'good'); }
        catch (e) { toast(e.message, 'bad'); }
      };
      const soup = async () => {
        try { profile = (await api('profile', { op: 'max_soup', uid: m.uid })).profile; closeModal('mstone'); redraw(); onChange(profile); toast(`🔴 ${m.nick || getSpecies(m.sp).name} ganhou o Fator Gigantamax!`, 'good'); }
        catch (e) { toast(e.message, 'bad'); }
      };
      const gene = async () => {
        if (!confirm(`Dar o 🧬 Doce Genético para ${m.nick || getSpecies(m.sp).name}? Os IVs atuais serão sorteados de novo (podem cair).`)) return;
        try {
          const r = await api('profile', { op: 'gene_candy', uid: m.uid }); profile = r.profile; closeModal('mstone'); redraw(); onChange(profile);
          const k = ['hp', 'atk', 'def', 'spe'], L = { hp: 'HP', atk: 'ATQ', def: 'DEF', spe: 'VEL' };
          toast(`🧬 ${k.map(x => `${L[x]} ${r.gene.before[x]}→${r.gene.after[x]}`).join(' · ')}`, 'good');
        } catch (e) { toast(e.message, 'bad'); }
      };
      const tmOpen = () => { // 💿 TM direto da ficha
        const draw = () => tmPickerHtml(m, 'mtm-move');
        const ov3 = openModal('mtm', `💿 TM — ${esc(m.nick || getSpecies(m.sp).name)}`, draw(), { wide: true });
        bindActions(ov3, {
          'tm-slot': x => { setTmSlot(x.slot); setModalBody('mtm', draw()); },
          'mtm-move': async x => {
            try { profile = (await api('profile', { op: 'use_tm', uid: m.uid, move: x.move, slot: Number(x.slot) })).profile; closeModal('mtm'); closeModal('mstone'); redraw(); onChange(profile); toast('💿 Golpe novo aprendido!', 'good'); }
            catch (e) { toast(e.message, 'bad'); }
          }
        });
      };
      const lvlOp = async (op, qty) => {
        try {
          const r = await api('profile', { op, uid: m.uid, qty }); profile = r.profile; closeModal('mstone'); redraw(); onChange(profile);
          toast(r.evolved ? `✨ ${r.evolved.from} evoluiu para ${r.evolved.to}!` : `🍬 ${r.used > 1 ? `${r.used} Doces Raros: ` : ''}subiu para o Nv.${r.leveled}!${levelEvoTarget({ ...m, lvl: r.leveled }) ? ' Já pode evoluir (⬆️ Evoluir).' : ''}`, 'good');
        } catch (e) { toast(e.message, 'bad'); }
      };
      bindActions(ov2, { 'ms-hold': x => hold(x.item), 'ms-off': () => hold(null), 'ms-evo': x => evoUse(x.item), 'ms-soup': soup, 'ms-gene': gene, 'ms-tm': tmOpen, 'ms-lvl': () => lvlOp('evo_level'), 'ms-candy': x => lvlOp('rare_candy', Number(x.q) || 1) });
    },
    rel: async d => {
      const m = (profile?.vault || []).find(x => x.uid === d.uid);
      const g = m ? releaseGold(m) : 0;
      if (!confirm(`Soltar ${m ? (m.nick || getSpecies(m.sp)?.name || 'este Pokémon') : 'este Pokémon'} da sua Coleção?\n\n🪙 O Professor paga ${g} de ouro (${m ? releaseLabel(m) : ''}, Nv. ${m?.lvl || 1}).\n\nEle fica em "Saíram da Coleção": dá para recuperar depois devolvendo o ouro.`)) return;
      try { const r = await api('profile', { op: 'release', uid: d.uid }); profile = r.profile; redraw(); onChange(profile); if (r.gold) toast(`🕊️ Solto! O Professor te deu 🪙 ${r.gold}.`, 'good'); }
      catch (e) { toast(e.message, 'bad'); }
    },
    restore: async d => {
      try { const r = await api('profile', { op: 'restore', uid: d.uid }); profile = r.profile; redraw(); onChange(profile); toast(r.paidBack ? `↩️ Recuperado! Devolveu 🪙 ${r.paidBack}.` : '↩️ Recuperado!', 'good'); }
      catch (e) { toast(e.message, 'bad'); }
    },
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
    'rel-many': () => { picking = { rel: true, box: null, sel: new Set() }; redraw(); },
    'rel-ok': async () => {
      const uids = [...picking.sel]; if (!uids.length) return;
      if (!confirm(`Soltar ${uids.length} Pokémon da sua Coleção?\n\n🪙 O Professor paga ${relGold()} de ouro no total.\n\nEles ficam em "Saíram da Coleção": dá para recuperar depois devolvendo o ouro.`)) return;
      try {
        const r = await api('profile', { op: 'release_many', uids });
        profile = r.profile; picking = null; redraw(); onChange(profile);
        toast(`🕊️ ${r.released} solto(s)${r.gold ? ` · 🪙 ${r.gold}` : ''}${r.skipped ? ` · ${r.skipped} não puderam sair` : ''}.`, 'good');
      } catch (e) { toast(e.message, 'bad'); }
    },
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
  };
  // 🔍 ficha completa do Pokémon (abre ao tocar no ícone)
  const openMon = uid => {
    const m = (profile?.vault || []).find(x => x.uid === uid);
    if (!m) return closeModal('vault-mon');
    const bagNow = profile?.stats?.bag || {};
    const evoReady = x => !!levelEvoTarget(x) || evoItemsFor(x).some(id => (bagNow[id] || 0) > 0);
    const bx = boxOf(m.uid);
    const html = `<div class="vm-detail">${statCard(m, { extra: actBtns(m, bx, evoReady) })}</div>`;
    if (document.getElementById('vault-mon')) { setModalBody('vault-mon', html); return; }
    const ov2 = openModal('vault-mon', `${esc(m.nick || getSpecies(m.sp)?.name || '')}`, html);
    const wrapped = {};
    for (const [k, fn] of Object.entries(acts)) wrapped[k] = async d => {
      await fn(d);
      if (document.getElementById('vault-mon')) openMon(d.uid); // some sozinho se o Pokémon saiu da Coleção
    };
    bindActions(ov2, wrapped);
  };
  acts['vm-open'] = d => { if (!picking) openMon(d.uid); };
  acts['vm-toggle'] = () => { compact = !compact; try { localStorage.setItem('pmhx_vault_view', compact ? 'mini' : 'cards'); } catch { /* sem armazenamento */ } redraw(); };
  bindActions(ov, acts);
}

/** v61: abrir o ranking de fora do hub (📺 TV da casa). */
export const openRankingModal = profile => rankingModal(profile ? (profile.rating ?? 1000) : null, profile?.stats?.league || null, profile?.trainer_name);
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
      : '<p class="small muted">Jogue um 🏆 Competitivo ou um ⚔️ Duelo PVP para entrar na Liga.</p>';
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
          <div class="elo-top">${t.top.map(p => `<span title="${esc(p.name)} · ${p.rating}" ${p.id ? `data-act="card" data-id="${esc(p.id)}" style="cursor:pointer"` : ''}><img src="${avatarUrl(p.avatar, p.skin)}" alt="">${esc(p.name)}</span>`).join('') || '<span class="tiny muted">ninguém ainda</span>'}</div></div>`).join('')}</div>
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
      ${rows.map((r, i) => `<tr><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td>${r.id ? `<a class="tc-link" data-act="card" data-id="${esc(r.id)}"><img class="rk-av" src="${avatarUrl(r.avatar, r.skin)}" alt="">${esc(r.name)}</a>` : esc(r.name)}</td>${comp
        ? `<td>${eloTag(r.rating)}</td><td><b>${r.rating}</b></td><td>${r.ranked}</td><td>${r.rankedWins}</td>`
        : `<td><b>${r.points}</b></td><td>${r.pokedex}</td><td>${r.wins}</td><td>${r.champion}</td><td>${r.shinies}</td>`}</tr>`).join('') || `<tr><td colspan="7" class="muted">${comp ? 'Ninguém jogou uma partida competitiva ainda.' : 'Ninguém pontuou ainda.'}</td></tr>`}</table>
      <p class="tiny muted">${comp ? 'Rating Elo (começa em 1000): sobe ao terminar à frente de quem tem rating igual ou maior. Só partidas 🏆 Competitivas contam.' : 'Pontos: 10 por espécie na Pokédex, 300 por vitória, 500 por título de Campeão, 50 por shiny, 25 por vitória PvP.'}</p>`;
  };
  try {
    data = await api('leaderboard', null, 'GET');
    setModalBody('rank', body());
    bindActions(document.getElementById('rank'), { t: d => { tab = d.t; setModalBody('rank', body()); }, card: d => openTrainerCard(d.id) });
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
          <div class="field"><label>Duração</label><select class="input" id="c-turns"><option value="30">Rápida (30 turnos)</option><option value="40">Competitiva (40 turnos)</option><option value="45">Média (45 turnos)</option><option value="60" selected>Normal (60 turnos)</option></select></div>
<div class="field"><label>Tipo de partida</label><select class="input" id="c-rules">${Object.entries(GAME_RULES).map(([k, g]) => `<option value="${k}" ${k === ('classic') ? 'selected' : ''} title="${esc(g.desc)}">${g.icon} ${g.name}</option>`).join('')}</select></div>
          <div class="field"><label>Mapa</label><select class="input" id="c-map">${MAP_CHOICES.map(m => `<option value="${m.id}" ${m.id === ('kanto') ? 'selected' : ''} title="${esc(m.desc)}">${m.icon || '🗺️'} ${esc(m.name)}</option>`).join('')}</select>${mapInfo('kanto')}</div>
        </div>
        <div class="field"><label>Times</label><select class="input" id="c-teams"><option value="0">Cada um por si</option><option value="2">🤝 Duplas (o time vence junto)</option><option value="3">🤝 Trios</option></select></div>
        <div class="field"><label>Dificuldade</label><select class="input" id="c-hc"><option value="0">Normal</option><option value="1">☠️ Hardcore — perdeu a equipe, está fora e perde tudo</option></select></div>
        <div class="field hidden" id="c-megas-f"><label>Mega / Gigantamax</label><select class="input" id="c-megas" title="Mega: 🔗 Bracelete + Megapedra · Gigantamax: 🔴 Pulseira Dynamax + Fator Gigantamax"><option value="0" >💎 Desligado</option><option value="1" >💎🔴 Megas e Gigantamax liberados</option></select><div class="tiny muted">Coleção, 🏟️ Copa e ⚔️ Duelo: 1 Mega Evolução OU 1 Gigantamax por batalha (Mega: 🔗 Bracelete + Megapedra segurada · Gigantamax: 🔴 Pulseira Dynamax + Pokémon com o Fator, dura 3 rodadas).</div></div>
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
    root.querySelector('#c-megas-f').classList.toggle('hidden', !['collection', 'cup', 'duel'].includes(e.target.value));
    if (e.target.value === 'ranked') { root.querySelector('#c-turns').value = '40'; }
  });
  const load = async () => {
    try {
      const { rooms } = await api('rooms', null, 'GET');
      root.querySelector('#rooms').innerHTML = rooms.length ? rooms.map(r => `
        <div class="list-item"><div class="grow"><b>${esc(r.name)}</b> ${r.hasPin ? '🔒' : ''} ${modeChip(r.mode, r.levelCap)}${r.rules && r.rules !== 'classic' ? ` <span class="chip">${GAME_RULES[r.rules].icon} ${GAME_RULES[r.rules].name}</span>` : ''}${r.hardcore ? ' <span class="chip red">☠️ Hardcore</span>' : ''}${r.megas ? ' <span class="chip purple">💎🔴 Mega/Gmax</span>' : ''}${r.status === 'playing' ? ' <span class="chip green">▶ em andamento</span>' : ''}<div class="tiny muted">Anfitrião: ${esc(r.host)} · ${r.players}/${r.maxPlayers} · ${r.turnLimit || 60} turnos · código ${esc(r.code)}</div></div>
        <button class="btn sm ${r.status === 'playing' ? 'green' : 'blue'}" data-act="join" data-id="${r.id}" data-pin="${r.hasPin ? '1' : ''}" data-late="${r.status === 'playing' ? '1' : ''}" ${r.players >= r.maxPlayers ? 'disabled' : ''}>${r.status === 'playing' ? 'Entrar no meio' : 'Entrar'}</button></div>`).join('')
        : '<p class="muted small">Nenhuma sala aberta. Crie uma!</p>';
    } catch (e) { root.querySelector('#rooms').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
  const go = async p => { try { const { match } = await p; ctx.openRoom(match.id); } catch (e) { toast(e.message, 'bad'); } };
  bindActions(root, {
    create: () => go(api('match', { op: 'create', name: v('#c-name'), mode: v('#c-mode'), maxPlayers: Number(v('#c-max')), turnLimit: Number(v('#c-turns')), levelCap: Number(v('#c-cap')), map: v('#c-map'), rules: v('#c-rules'), teams: Number(v('#c-teams')), hardcore: v('#c-hc') === '1', megas: ['collection', 'cup', 'duel'].includes(v('#c-mode')) && v('#c-megas') === '1', pin: v('#c-pin'), isPublic: v('#c-pub') === '1' })),
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

/** 🤝 v65: escolher o time na sala (o seu; o anfitrião escolhe o das CPUs). Sem escolha = o jogo equilibra. */
function squadPicker(e, can, n) {
  const cur = Number.isInteger(e.squad) ? e.squad : null;
  if (!can) return cur === null ? '<span class="chip" title="O jogo escolhe o time">🎲</span> ' : `<span class="sq-chip" title="${esc(SQUADS[cur].name)}">${SQUADS[cur].icon}</span> `;
  return `<span class="row" style="display:inline-flex;gap:2px;margin-right:4px">${SQUADS.slice(0, Math.min(3, n)).map((S, i) => `<button class="btn sm ${cur === i ? 'primary' : ''}" data-act="squad" data-id="${esc(e.id)}" data-sq="${i}" title="${esc(S.name)}">${S.icon}</button>`).join('')}<button class="btn sm ${cur === null ? 'primary' : ''}" data-act="squad" data-id="${esc(e.id)}" data-sq="" title="O jogo escolhe">🎲</button></span> `;
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
          <div class="row">${modeChip(mode, o.levelCap)}${o.hardcore ? '<span class="chip red">☠️ Hardcore</span>' : ''}${o.megas ? '<span class="chip purple">💎🔴 Mega/Gmax</span>' : ''}${o.teams >= 2 ? `<span class="chip blue">🤝 ${o.teams === 2 ? 'Duplas' : 'Trios'}</span>` : ''}${o.rules === 'bossraid' ? '<span class="chip purple">🐉 Raid em Grupo</span>' : ''}<span class="small muted">${o.maxPlayers} jogadores · ${o.turnLimit || 60} turnos · ${o.rules === 'royale' ? '⚔️ Arena Royale' : mapChoiceName(o.map || 'kanto')} · ${GAME_RULES[o.rules || 'classic'].icon} ${GAME_RULES[o.rules || 'classic'].name} ${match.hasPin ? '· 🔒 PIN' : ''}</span></div>
          <div class="tiny muted">${esc(MODE_INFO[mode]?.desc || '')}${o.rules && o.rules !== 'classic' ? ' · ' + esc(GAME_RULES[o.rules].desc) : ''}</div>
          ${isHost ? `<div class="grid2">
            <select class="input" id="o-mode">${Object.entries(MODE_INFO).map(([k, m]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${m.icon} ${m.name}</option>`).join('')}</select>
            ${['balanced', 'collection'].includes(mode) ? `<select class="input" id="o-rules">${Object.entries(GAME_RULES).map(([k, g]) => `<option value="${k}" ${k === (o.rules || 'classic') ? 'selected' : ''}>${g.icon} ${g.name}</option>`).join('')}</select>` : ''}
            <select class="input" id="o-map">${MAP_CHOICES.map(m => `<option value="${m.id}" ${m.id === (o.map || 'kanto') ? 'selected' : ''}>${m.icon || '🗺️'} ${esc(m.name)}</option>`).join('')}</select>${mapInfo(o.map || 'kanto')}
            <select class="input" id="o-turns">${[[30, 'Rápida (30)'], [40, 'Competitiva (40)'], [45, 'Média (45)'], [60, 'Normal (60)']].map(([v, l]) => `<option value="${v}" ${v === (o.turnLimit || 60) ? 'selected' : ''}>${l}</option>`).join('')}</select>
            ${['balanced', 'collection'].includes(mode) && o.rules !== 'bossraid' ? `<select class="input" id="o-teams"><option value="0" ${!o.teams ? 'selected' : ''}>Cada um por si</option><option value="2" ${o.teams === 2 ? 'selected' : ''}>🤝 Duplas</option><option value="3" ${o.teams === 3 ? 'selected' : ''}>🤝 Trios</option></select>` : ''}
            <select class="input" id="o-hc" title="${esc(HARDCORE_TXT)}"><option value="0" ${!o.hardcore ? 'selected' : ''}>Dificuldade normal</option><option value="1" ${o.hardcore ? 'selected' : ''}>☠️ Hardcore</option></select>
            ${['collection', 'cup', 'duel'].includes(mode) ? `<select class="input" id="o-megas" title="Mega (Bracelete + Megapedra) e Gigantamax (Pulseira + Fator)"><option value="0" ${!o.megas ? 'selected' : ''}>💎 Sem Mega/Gigantamax</option><option value="1" ${o.megas ? 'selected' : ''}>💎🔴 Mega e Gigantamax liberados</option></select>` : ''}
            ${o.rules !== 'royale' && !['ranked', 'duel', 'cup'].includes(mode) ? `<select class="input" id="o-late"><option value="1" ${o.allowLate !== false ? 'selected' : ''}>🙋 Pode entrar no meio</option><option value="0" ${o.allowLate === false ? 'selected' : ''}>🔒 Sem entrar no meio</option></select>` : ''}
            ${TEAM_MODES.includes(mode) ? `<select class="input" id="o-cap">${[[0, 'Sem limite de nível'], [15, 'Nível máx 15'], [25, 'Nível máx 25'], [35, 'Nível máx 35'], [45, 'Nível máx 45'], [50, 'Nível máx 50']].map(([v, l]) => `<option value="${v}" ${v === (o.levelCap || 0) ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
          </div>` : ''}
          <div class="list" style="max-height:none">${match.lobby.map(e => `
            <div class="list-item"><img class="avatar sm" src="${avatarUrl(e.avatar, e.skin)}" alt="${esc(e.name)}">
              <div class="grow">${o.teams >= 2 ? squadPicker(e, e.id === meId || (isHost && e.isBot), Math.max(2, Math.ceil((o.maxPlayers || 4) / o.teams))) : ''}<b>${esc(e.name)}</b> ${e.id === match.hostId ? '<span class="chip gold">anfitrião</span>' : ''} ${e.isBot ? '<span class="chip">CPU</span>' : e.ready || e.id === match.hostId ? '<span class="chip green">pronto</span>' : '<span class="chip">aguardando</span>'}
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
    const sendOpts = () => op({ op: 'options', teams: Number(root.querySelector('#o-teams')?.value || 0), mode: root.querySelector('#o-mode').value, map: root.querySelector('#o-map')?.value, rules: root.querySelector('#o-rules')?.value, turnLimit: Number(root.querySelector('#o-turns').value), levelCap: Number(root.querySelector('#o-cap')?.value || 0), hardcore: root.querySelector('#o-hc')?.value === '1', megas: root.querySelector('#o-megas')?.value === '1', ...(root.querySelector('#o-late') ? { lateJoin: root.querySelector('#o-late').value === '1' } : {}) });
    root.querySelectorAll('#o-mode, #o-rules, #o-teams, #o-map, #o-turns, #o-cap, #o-hc, #o-late').forEach(el => el.addEventListener('change', sendOpts));
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
    squad: d => op({ op: 'squad', target: d.id, squad: d.sq === '' ? null : Number(d.sq) }),
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
        <p class="small muted">Monte mapas novos para o modo normal. Publicado = aparece para todos na escolha de mapa (Treino, salas online e offline). Cada mapa tem 3 casas Amarelas (lendárias) por padrão — marque até 4 no editor.</p>
        <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn primary" data-act="map-new" data-from="blank">➕ Mapa em branco</button>
          <select class="input" id="a-mapfrom">${BUILTIN_MAPS.map(m => `<option value="${m.id === 'gen' ? 'gen:' + (Date.now() % 100000) : m.id}">${m.icon} ${esc(m.name)}</option>`).join('')}</select>
          <button class="btn" data-act="map-new" data-from="copy">📋 Começar de uma cópia</button></div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px"><select class="input" id="a-mapovr">${REPLACEABLE.map(id => { const b = BUILTIN_MAPS.find(m => m.id === id); const has = maps.find(m => m.replaces === id); return `<option value="${id}">${b.icon} ${esc(b.name)}${has ? ' (já editado)' : ''}</option>`; }).join('')}</select>
          <button class="btn" data-act="map-ovr">✏️ Editar um mapa do jogo</button></div>
        <p class="tiny muted">✏️ Editar um mapa do jogo cria uma versão editada; quando você <b>publica</b>, as salas novas desse mapa usam a sua versão (despublique para voltar ao original). Partidas em andamento não mudam.</p>
        <table class="score" style="margin-top:8px"><tr><th>Mapa</th><th>Casas</th><th>Status</th><th>Atualizado</th><th></th></tr>
        ${maps.map(m => `<tr><td><b>${esc(m.name)}</b><div class="tiny muted">${esc(m.id)} · v${m.rev || 1}${m.replaces ? ` · ✏️ substitui ${esc(BUILTIN_MAPS.find(b => b.id === m.replaces)?.name || m.replaces)}` : ''}</div></td><td>${m.spaces.length}</td>
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
        <div class="row"><select class="input grow" id="a-item">${Object.entries(ALL_ITEMS).filter(([id]) => isKeepable(id) || id === 'mega_bracelet' || id === 'dynamax_band').map(([id, it]) => `<option value="${id}">${esc(it.name)}</option>`).join('')}</select>
          <input class="input" id="a-iq" type="number" min="1" max="999" value="1" style="width:80px">
          <button class="btn" data-act="grant-item">🎒 Dar item (vai para a Mochila)</button></div></div>
      <div class="card col" style="margin-top:10px"><h3>👀 Testar os avisos (só na sua tela)</h3>
        <p class="tiny muted">Mostra o aviso de captura do jeito que os jogadores veem, usando o Pokémon escolhido em "Dar Pokémon". Não publica nada para ninguém nem vai para o Mural. Para aparecer de verdade no Mural, a captura tem que acontecer numa partida salva.</p>
        <div class="row wrap" style="gap:6px"><button class="btn" data-act="pv-cap" data-k="sl">🌟 Lendário shiny</button><button class="btn" data-act="pv-cap" data-k="legendary">⚡ Lendário</button><button class="btn" data-act="pv-cap" data-k="shiny">✨ Shiny</button><button class="btn" data-act="pv-cap" data-k="duel">⚔️ Chamado de Duelo PVP</button></div></div>
      <div class="card col" style="margin-top:10px"><h3>🔐 Conta do jogador (suporte)</h3>
        <p class="tiny muted">Ninguém vê a senha (nem o admin) — dá para <b>definir uma nova</b>. Use o jogador escolhido em "Dar presente" ou procure pelo e-mail.</p>
        <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn" data-act="acc-info">🔎 Ver conta do jogador escolhido</button>
          <input class="input" id="a-acc-q" placeholder="ou procurar por e-mail…" style="width:200px"><button class="btn" data-act="acc-find">Procurar</button></div>
        <div id="a-acc">${accHtml()}</div></div>
      <div class="card" style="margin-top:10px"><h3>👥 Usuários (${users.length})</h3>
        <table class="score"><tr><th>Nome</th><th>Pontos</th><th>Rating</th><th>💎</th><th>Coleção</th><th>Admin</th></tr>
        ${users.map(u => `<tr><td>${esc(u.name)}</td><td>${u.points}</td><td>${u.rating}</td><td>${u.diamonds}</td><td>${u.vault}</td><td><button class="btn sm ${u.isAdmin ? 'red' : ''}" data-act="toggle" data-id="${u.id}" data-v="${u.isAdmin ? '0' : '1'}">${u.isAdmin ? 'remover' : 'tornar admin'}</button></td></tr>`).join('')}</table>
        <p class="tiny muted">Excluir contas continua no Supabase (Authentication → Users).</p></div>`;
  };
  // 🔐 painel de suporte da conta
  let acc = null, accList = null;
  const fmt = t => (t ? new Date(t).toLocaleString('pt-BR') : '—');
  function accHtml() {
    if (accList) return accList.length ? `<table class="score" style="margin-top:6px"><tr><th>E-mail</th><th>Treinador</th><th>Ativada</th><th></th></tr>${accList.map(a => `<tr><td class="small">${esc(a.email)}</td><td>${esc(a.trainer || '—')}</td><td>${a.confirmedAt ? '✅' : '❌'}</td><td><button class="btn sm" data-act="acc-pick" data-id="${a.id}">Abrir</button></td></tr>`).join('')}</table>` : '<p class="muted small">Nenhum e-mail encontrado.</p>';
    if (!acc) return '';
    return `<div class="acc-box">
      <div><b>${esc(acc.trainer || 'Sem perfil ainda')}</b> · <span class="small">${esc(acc.email || '')}</span></div>
      <div class="small">Conta ativada: ${acc.confirmedAt ? `✅ ${fmt(acc.confirmedAt)}` : '❌ <b>não ativou</b> (não clicou no link do e-mail)'}</div>
      <div class="tiny muted">Criada: ${fmt(acc.createdAt)} · Último login: ${fmt(acc.lastSignIn)}</div>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">
        ${acc.confirmedAt ? '' : '<button class="btn sm green" data-act="acc-confirm">✅ Ativar conta agora</button><button class="btn sm" data-act="acc-mail" data-k="signup">📧 Reenviar e-mail de ativação</button>'}
        <button class="btn sm" data-act="acc-mail" data-k="recovery">📧 Mandar link de nova senha</button>
        <button class="btn sm primary" data-act="acc-pw">🔑 Definir senha nova</button>
        ${acc.megaBracelet ? '<button class="btn sm red" data-act="acc-bracelet">🔗 Tirar Bracelete Mega</button>' : ''}
        ${acc.dynamaxBand ? '<button class="btn sm red" data-act="acc-band">🔴 Tirar Pulseira Dynamax</button>' : ''}
        <button class="btn sm red" data-act="acc-art" title="Se alguém desenhar algo impróprio na Fazenda">🖌️ Apagar desenhos da Fazenda</button>
      </div></div>`;
  }
  const accDraw = () => { const el = ov.querySelector('#a-acc'); if (el) el.innerHTML = accHtml(); };
  const accLoad = async id => { try { acc = (await api('admin', { op: 'account_info', userId: id })).account; accList = null; accDraw(); } catch (e) { toast(e.message, 'bad'); } };
  const accRun = async (fn, ok) => { try { await fn(); toast(ok, 'good'); await accLoad(acc.id); } catch (e) { toast(e.message, 'bad'); } };

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
    'pv-cap': d => { // 👀 v69: pré-visualização local dos avisos
      const sp = ov.querySelector('#a-sp').value, spn = getSpecies(sp)?.name || sp, me = {};
      if (d.k === 'duel') return showFeedBanner({ kind: 'duel_call', text: '', data: { matchId: 'preview', uid: 'preview', name: 'Treinador Teste', avatar: me.avatar || 1, megas: true, until: Date.now() + 20000 } });
      const shiny = d.k !== 'legendary';
      showFeedBanner({ kind: shiny ? 'shiny' : 'legendary', text: `${me.trainer_name || 'Você'} capturou ${d.k === 'shiny' ? '' : 'o lendário '}${spn}${shiny ? ' ✨SHINY✨' : ''}!`, data: { sp, shiny, name: me.trainer_name, avatar: me.avatar } });
    },
    'give-gd': () => run(() => api('admin', { op: 'give_gold', userId: ov.querySelector('#a-user').value, amount: Number(ov.querySelector('#a-gd').value) }), 'Ouro enviado!'),
    'give-dm': () => run(() => api('admin', { op: 'give_diamonds', userId: ov.querySelector('#a-user').value, amount: Number(ov.querySelector('#a-dm').value) }), 'Diamantes enviados!'),
    'grant-item': () => run(() => api('admin', { op: 'grant_item', userId: ov.querySelector('#a-user').value, item: ov.querySelector('#a-item').value, qty: ov.querySelector('#a-iq').value }), 'Enviado para a Mochila!'),
    grant: () => run(() => api('admin', { op: 'grant_mon', userId: ov.querySelector('#a-user').value, species: ov.querySelector('#a-sp').value, level: ov.querySelector('#a-lv').value, shiny: ov.querySelector('#a-shiny').checked }), 'Enviado para a Coleção!'),
    toggle: d => run(() => api('admin', { op: 'set_admin', userId: d.id, value: d.v === '1' })),
    'acc-info': () => accLoad(ov.querySelector('#a-user').value),
    'acc-find': async () => { try { accList = (await api('admin', { op: 'account_find', q: ov.querySelector('#a-acc-q').value })).accounts; acc = null; accDraw(); } catch (e) { toast(e.message, 'bad'); } },
    'acc-pick': d => accLoad(d.id),
    'acc-confirm': () => accRun(() => api('admin', { op: 'account_confirm', userId: acc.id }), '✅ Conta ativada! Ele já pode entrar.'),
    'acc-mail': d => accRun(() => api('admin', { op: 'account_mail', userId: acc.id, kind: d.k, origin: location.origin }), d.k === 'signup' ? '📧 E-mail de ativação enviado.' : '📧 Link de nova senha enviado.'),
    'acc-pw': () => {
      const pw = prompt(`Senha nova para ${acc.trainer || acc.email} (mín. 6). Mande para ele no privado e peça para trocar depois:`);
      if (pw) accRun(() => api('admin', { op: 'account_password', userId: acc.id, password: pw }), '🔑 Senha nova definida.');
    },
    'acc-art': () => { if (confirm(`Apagar todos os desenhos da Fazenda de ${acc.trainer}?`)) accRun(() => api('admin', { op: 'clear_farm_art', userId: acc.id }), '🖌️ Desenhos apagados.'); },
    'acc-band': () => { if (confirm(`Tirar a Pulseira Dynamax de ${acc.trainer}?`)) accRun(() => api('admin', { op: 'remove_bracelet', item: 'dynamax_band', userId: acc.id }), '🔴 Pulseira removida.'); },
    'acc-bracelet': () => { if (confirm(`Tirar o Bracelete Mega de ${acc.trainer}?`)) accRun(() => api('admin', { op: 'remove_bracelet', userId: acc.id }), '🔗 Bracelete removido.'); },
    'map-new': d => openMapEditor(templateMap(d.from === 'blank' ? 'blank' : ov.querySelector('#a-mapfrom').value), mapsSaved),
    'map-ovr': () => { // ✏️ v64: editar Kanto/temático (abre a versão já editada, se houver)
      const id = ov.querySelector('#a-mapovr').value;
      const has = (data.maps || []).find(m => m.replaces === id);
      if (has) return openMapEditor({ ...structuredClone(has), id: has.id.replace(/^custom:/, '') }, mapsSaved);
      const t = templateMap(id);
      const b = BUILTIN_MAPS.find(m => m.id === id);
      t.name = b.name; t.replaces = id; t.id = `ovr_${id.replace(/[^a-z0-9]/gi, '')}`.slice(0, 24);
      t.bg = id === 'kanto' ? 'kanto' : `theme_${id.slice(6)}`;
      openMapEditor(t, mapsSaved);
    },
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
          <div class="field"><label>Mapa</label><select class="input" id="ls-map">${MAP_CHOICES.map(m => `<option value="${m.id}" ${m.id === (mapId) ? 'selected' : ''} title="${esc(m.desc)}">${m.icon || '🗺️'} ${esc(m.name)}</option>`).join('')}</select>${mapInfo(mapId)}</div>
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
  const evo = evoSummary(sp.id) ? `<p class="small">✨ Evolui para <b>${esc(evoSummary(sp.id))}</b>.</p>` : '';
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
