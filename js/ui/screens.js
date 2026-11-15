// Telas fora da partida: login, hub do treinador, lobby online, sala de espera, partida local, cofre, ranking e admin.
import { STARTERS, getSpecies, SPECIES_LIST } from '../../shared/data/pokemon.js';
import { dailyPokemon } from '../../shared/daily.js';
import { esc, toast, bindActions, openModal, closeModal, setModalBody } from './dom.js';
import { monSprite, avatarUrl } from '../config.js';
import { net, api, signIn, signUp, signOut, resetPassword, watchMatch } from '../api.js';
import { LocalSession } from '../session.js';
import { openDex } from './modals.js';
import { typeChips } from './common.js';

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
    local: () => onLocal()
  });
  root.querySelector('#l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') root.querySelector('[data-act="login"]').click(); });
}

// ================================================================ hub
export async function hubScreen(root, ctx) {
  let profile = null;
  try { profile = (await api('profile', { op: 'get' })).profile; } catch (e) { toast(e.message, 'bad'); }
  const daily = ctx.daily || dailyPokemon(null);
  const dsp = getSpecies(daily);
  const localSave = LocalSession.hasSave();
  let mine = [];
  try { mine = (await api('rooms', null, 'GET')).mine || []; } catch { /* sem salas */ }

  const render = () => `<div class="screen"><div class="panel-wide">${LOGO}
    <div class="hub-grid">
      <div class="col">
        <div class="trainer">
          <img class="avatar" src="${avatarUrl(profile?.avatar)}" alt="avatar">
          <div class="grow"><h3 style="color:var(--gold)">${esc(profile?.trainer_name || 'Treinador')}</h3>
            <div class="small">⭐ ${profile?.points || 0} pts · 📖 ${(profile?.pokedex || []).length} · 🏆 ${profile?.stats?.wins || 0} vitórias · ✨ ${profile?.stats?.shinies || 0}</div>
            <div class="tiny muted">${esc(net.user?.email || '')}</div></div>
          <button class="btn sm" data-act="edit">✏️</button>
        </div>
        <div class="daily"><img src="${monSprite(daily)}" alt="${esc(dsp?.name)}"><div><div class="tiny" style="color:var(--gold)">⭐ POKÉMON DO DIA</div><b>${esc(dsp?.name)}</b> ${typeChips(dsp?.types || [])}
          <div class="tiny muted">Aparece mais, dá XP em dobro e tem chance de shiny 1/8.</div></div></div>
        <div class="card col">
          <h3>🌐 Online</h3>
          <button class="btn blue" data-act="online">Salas online (criar / entrar)</button>
          ${mine.length ? `<div class="small muted">Minhas partidas:</div>${mine.map(m => `<button class="btn sm" data-act="resume-online" data-id="${m.id}">▶ ${esc(m.name)} · ${m.status === 'playing' ? 'em jogo' : 'no lobby'} · ${m.players} jog.</button>`).join('')}` : ''}
        </div>
      </div>
      <div class="col">
        <div class="card col">
          <h3>🏠 Local</h3>
          ${localSave ? `<button class="btn green" data-act="resume-local">▶ Continuar partida local</button>` : ''}
          <button class="btn" data-act="new-local">✨ Nova partida local</button>
        </div>
        <div class="card col">
          <h3>📦 Coleção</h3>
          <div class="grid2"><button class="btn purple" data-act="vault">📦 Cofre (${(profile?.vault || []).length})</button><button class="btn" data-act="dex">📖 Pokédex</button></div>
          <button class="btn" data-act="ranking">🏆 Ranking</button>
          ${profile?.is_admin ? `<button class="btn red" data-act="admin">🛡️ Painel do admin</button>` : ''}
        </div>
        <button class="btn ghost" data-act="logout">Sair da conta</button>
      </div>
    </div></div></div>`;

  root.innerHTML = render();
  bindActions(root, {
    online: () => ctx.go('lobby'),
    'resume-online': d => ctx.openOnline(d.id),
    'resume-local': () => ctx.openLocal(LocalSession.load()),
    'new-local': () => ctx.go('local-setup'),
    vault: () => vaultModal(profile),
    dex: () => openDex(null, profile?.pokedex || []),
    ranking: () => rankingModal(),
    admin: () => adminModal(),
    logout: async () => { await signOut(); ctx.go('login'); },
    edit: () => editProfile(profile, async p => { profile = p; root.innerHTML = render(); })
  });
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

function vaultModal(profile) {
  const v = profile?.vault || [];
  openModal('vault', '📦 Cofre de Pokémon', `<p class="small muted">Ao fim de cada partida online, o seu melhor Pokémon (shinies primeiro) vem para o Cofre. No lobby de uma sala você pode levar 1 deles como segundo Pokémon (entra no nível 10, no máximo).</p>
    <div class="dex">${v.map(m => `<div class="e caught"><img src="${monSprite(m)}" alt="${esc(getSpecies(m.sp)?.name)}"><div><b>${esc(getSpecies(m.sp)?.name)}</b>${m.shiny ? ' ✨' : ''}</div><div>Nv. ${m.lvl}</div></div>`).join('') || '<p class="muted">Vazio por enquanto — termine uma partida online!</p>'}</div>`, { wide: true });
}

async function rankingModal() {
  openModal('rank', '🏆 Ranking', '<span class="spinner"></span>');
  try {
    const { ranking } = await api('leaderboard', null, 'GET');
    setModalBody('rank', `<table class="score"><tr><th>#</th><th>Treinador</th><th>Pontos</th><th>Pokédex</th><th>Vitórias</th><th>Campeão</th><th>✨</th></tr>
      ${ranking.map((r, i) => `<tr><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td>${esc(r.name)}</td><td><b>${r.points}</b></td><td>${r.pokedex}</td><td>${r.wins}</td><td>${r.champion}</td><td>${r.shinies}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Ninguém pontuou ainda.</td></tr>'}</table>
      <p class="tiny muted">Pontos: 10 por espécie na Pokédex, 300 por vitória, 500 por título de Campeão, 50 por shiny, 25 por vitória PvP. Só partidas online contam.</p>`);
  } catch (e) { setModalBody('rank', `<p class="muted">${esc(e.message)}</p>`); }
}

async function adminModal() {
  openModal('admin', '🛡️ Admin', '<span class="spinner"></span>', { wide: true });
  const load = async () => {
    try {
      const { users } = await api('admin', { op: 'list_users' });
      setModalBody('admin', `
        <div class="card col"><h3>⭐ Pokémon do Dia</h3>
          <div class="row"><select class="input grow" id="a-daily"><option value="">(automático pela data)</option>${SPECIES_LIST.map(s => `<option value="${s.id}">${s.dex} · ${esc(s.name)}</option>`).join('')}</select>
          <button class="btn primary" data-act="daily">Definir</button></div>
          <p class="tiny muted">Vale para as próximas partidas iniciadas.</p></div>
        <div class="card col" style="margin-top:10px"><h3>🎁 Dar Pokémon (vai para o Cofre)</h3>
          <div class="row"><select class="input grow" id="a-user">${users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
          <select class="input grow" id="a-sp">${SPECIES_LIST.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
          <input class="input" id="a-lv" type="number" min="1" max="60" value="5" style="width:80px"><label class="small"><input type="checkbox" id="a-shiny"> shiny</label>
          <button class="btn" data-act="grant">Dar</button></div></div>
        <div class="card" style="margin-top:10px"><h3>👥 Usuários (${users.length})</h3>
          <table class="score"><tr><th>Nome</th><th>Pontos</th><th>Pokédex</th><th>Cofre</th><th>Admin</th></tr>
          ${users.map(u => `<tr><td>${esc(u.name)}</td><td>${u.points}</td><td>${u.pokedex}</td><td>${u.vault}</td><td><button class="btn sm ${u.isAdmin ? 'red' : ''}" data-act="toggle" data-id="${u.id}" data-v="${u.isAdmin ? '0' : '1'}">${u.isAdmin ? 'remover' : 'tornar admin'}</button></td></tr>`).join('')}</table>
          <p class="tiny muted">Senhas e exclusão de contas ficam no painel do Supabase (Authentication), com segurança.</p></div>`);
    } catch (e) { setModalBody('admin', `<p class="muted">${esc(e.message)}</p>`); }
  };
  const ov = document.getElementById('admin');
  bindActions(ov, {
    daily: async () => { try { const r = await api('admin', { op: 'set_daily', species: ov.querySelector('#a-daily').value || null }); toast(`Pokémon do Dia: ${getSpecies(r.dailyPokemon).name}`, 'good'); } catch (e) { toast(e.message, 'bad'); } },
    grant: async () => {
      try {
        await api('admin', { op: 'grant_mon', userId: ov.querySelector('#a-user').value, species: ov.querySelector('#a-sp').value, level: ov.querySelector('#a-lv').value, shiny: ov.querySelector('#a-shiny').checked });
        toast('Enviado para o Cofre!', 'good'); load();
      } catch (e) { toast(e.message, 'bad'); }
    },
    toggle: async d => { try { await api('admin', { op: 'set_admin', userId: d.id, value: d.v === '1' }); load(); } catch (e) { toast(e.message, 'bad'); } }
  });
  load();
}

// ================================================================ lobby online
export async function lobbyScreen(root, ctx) {
  root.innerHTML = `<div class="screen"><div class="panel-wide">${LOGO}
    <div class="hub-grid">
      <div class="card col"><h3>🛠️ Criar sala</h3>
        <div class="field"><label>Nome</label><input class="input" id="c-name" maxlength="30" placeholder="Sala de Kanto"></div>
        <div class="grid2">
          <div class="field"><label>Jogadores</label><select class="input" id="c-max">${[2, 3, 4, 5, 6].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="field"><label>Duração</label><select class="input" id="c-turns"><option value="30">Rápida (30 turnos)</option><option value="60" selected>Normal (60 turnos)</option><option value="0">Completa (até o Campeão)</option></select></div>
        </div>
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
  const load = async () => {
    try {
      const { rooms } = await api('rooms', null, 'GET');
      root.querySelector('#rooms').innerHTML = rooms.length ? rooms.map(r => `
        <div class="list-item"><div class="grow"><b>${esc(r.name)}</b> ${r.hasPin ? '🔒' : ''}<div class="tiny muted">Anfitrião: ${esc(r.host)} · ${r.players}/${r.maxPlayers} · código ${esc(r.code)}</div></div>
        <button class="btn sm blue" data-act="join" data-id="${r.id}" data-pin="${r.hasPin ? '1' : ''}" ${r.players >= r.maxPlayers ? 'disabled' : ''}>Entrar</button></div>`).join('')
        : '<p class="muted small">Nenhuma sala aberta. Crie uma!</p>';
    } catch (e) { root.querySelector('#rooms').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
  const go = async p => { try { const { match } = await p; ctx.openRoom(match.id); } catch (e) { toast(e.message, 'bad'); } };
  bindActions(root, {
    create: () => go(api('match', { op: 'create', name: v('#c-name'), maxPlayers: Number(v('#c-max')), turnLimit: Number(v('#c-turns')), pin: v('#c-pin'), isPublic: v('#c-pub') === '1' })),
    'join-code': () => go(api('match', { op: 'join', code: v('#j-code'), pin: v('#j-pin') })),
    join: d => go(api('match', { op: 'join', matchId: d.id, pin: d.pin ? prompt('PIN da sala:') || '' : '' })),
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
    const vault = profile?.vault || [];
    root.innerHTML = `<div class="screen"><div class="panel-wide">${LOGO}
      <div class="hub-grid">
        <div class="card col">
          <div class="spread"><h3>🏟️ ${esc(match.name)}</h3><span class="chip gold" style="font-size:14px">Código: ${esc(match.code)}</span></div>
          <div class="small muted">${match.options.maxPlayers} jogadores · ${match.options.turnLimit ? match.options.turnLimit + ' turnos' : 'até o Campeão'} ${match.hasPin ? '· 🔒 PIN' : ''}</div>
          <div class="list" style="max-height:none">${match.lobby.map(e => `
            <div class="list-item"><img class="avatar sm" src="${avatarUrl(e.avatar)}" alt="${esc(e.name)}">
              <div class="grow"><b>${esc(e.name)}</b> ${e.id === match.hostId ? '<span class="chip gold">anfitrião</span>' : ''} ${e.isBot ? '<span class="chip">CPU</span>' : e.ready || e.id === match.hostId ? '<span class="chip green">pronto</span>' : '<span class="chip">aguardando</span>'}
                <div class="tiny muted">Inicial: ${esc(getSpecies(e.starter)?.name)}${e.vaultUid ? ' + 1 do Cofre' : ''}</div></div>
              <img src="${monSprite(e.starter)}" alt="${esc(getSpecies(e.starter)?.name)}" style="width:36px;height:36px;object-fit:contain">
              ${isHost && e.id !== meId ? `<button class="btn sm red" data-act="kick" data-id="${esc(e.id)}">✕</button>` : ''}
            </div>`).join('')}</div>
          ${isHost ? `<div class="row"><button class="btn sm" data-act="bot" ${match.lobby.length >= match.options.maxPlayers ? 'disabled' : ''}>🤖 Adicionar CPU</button>
              <button class="btn primary grow" data-act="start">▶ Iniciar partida</button></div>`
            : `<button class="btn ${mine?.ready ? '' : 'green'}" data-act="ready">${mine?.ready ? 'Cancelar pronto' : '✅ Estou pronto'}</button>`}
          <button class="btn ghost" data-act="leave">← Sair da sala</button>
        </div>
        <div class="card col">
          <h3>Seu inicial</h3>${starterPicker(mine?.starter)}
          ${vault.length ? `<h3 style="margin-top:8px">Levar do Cofre (opcional)</h3>
            <div class="pick-grid"><div class="pick ${!mine?.vaultUid ? 'on' : ''}" data-act="vault" data-uid="">Nenhum</div>${vault.map(m => `<div class="pick ${mine?.vaultUid === m.uid ? 'on' : ''}" data-act="vault" data-uid="${esc(m.uid)}"><img src="${monSprite(m)}" alt="">${esc(getSpecies(m.sp)?.name)}${m.shiny ? '✨' : ''}<br>Nv.${Math.min(10, m.lvl)}</div>`).join('')}</div>` : ''}
          <h3 style="margin-top:8px">💬 Chat</h3>
          <div class="log" id="r-chat" style="height:140px">${(match.chat || []).map(c => `<p class="chat"><b>${esc(c.name)}:</b> ${esc(c.text)}</p>`).join('') || '<p class="muted">Diga olá!</p>'}</div>
          <form class="row" id="r-form"><input class="input grow" id="r-msg" maxlength="200" placeholder="Mensagem..."><button class="btn sm primary">Enviar</button></form>
        </div>
      </div></div></div>`;
    const chat = root.querySelector('#r-chat');
    chat.scrollTop = chat.scrollHeight;
    root.querySelector('#r-form').addEventListener('submit', async e => {
      e.preventDefault();
      const text = root.querySelector('#r-msg').value.trim();
      if (!text) return;
      await op({ op: 'chat', text });
    });
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
    vault: d => op({ op: 'update', vaultUid: d.uid || null }),
    ready: () => op({ op: 'update', ready: !match.lobby.find(e => e.id === meId)?.ready }),
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

// ================================================================ partida local
export function localSetupScreen(root, ctx) {
  const players = [
    { name: 'Jogador 1', avatar: 1, starter: 'charmander', isBot: false },
    { name: 'CPU Gary', avatar: 4, starter: 'squirtle', isBot: true }
  ];
  let turnLimit = 60;
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
        players: players.map((p, i) => ({ id: 'p' + (i + 1), name: p.name, avatar: p.avatar, starter: p.starter, isBot: p.isBot })),
        options: { dailyPokemon: ctx.daily, turnLimit }
      });
      ctx.openLocal(s);
    },
    back: () => ctx.go(net.user ? 'hub' : 'login')
  });
  render();
}
