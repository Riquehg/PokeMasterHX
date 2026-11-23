// Ponto de entrada: inicializa a rede e navega entre as telas.
import { initNet, net, api, setNewPassword } from './api.js';
import './ui/fx.js'; // ⚡ aplica o Modo leve (html.lite) logo no início
import { dailyPokemon } from '../shared/daily.js';
import { OnlineSession } from './session.js';
import { mountGame } from './ui/game.js';
import { loginScreen, hubScreen, lobbyScreen, roomScreen, localSetupScreen } from './ui/screens.js';
import { toast, openModal, closeModal, bindActions } from './ui/dom.js';
import { startNotifications } from './ui/notify.js';
import { startSocial } from './ui/social.js';
import { cupScreen } from './ui/tournament.js';
import { initInstall } from './ui/install.js';
import { showWall } from './ui/wall.js';
import { installSpriteFallback } from './config.js';
import { setCustomMaps } from '../shared/data/board.js';

const app = document.getElementById('app');
let cleanup = null;
let session = null;

const ctx = {
  daily: dailyPokemon(null),
  go,
  openRoom: id => go('room', id),
  openOnline: id => go('online', id),
  openLocal: s => go('local', s)
};

function fresh() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  if (session) { session.close(); session = null; }
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  const el = document.createElement('div');
  app.replaceChildren(el);
  window.scrollTo(0, 0);
  return el;
}

async function go(screen, arg) {
  if (net.user) startSocial(ctx);
  document.body.classList.toggle('in-game', screen === 'online' || screen === 'local');
  showWall(screen === 'hub' && !!net.user);
  const el = fresh();
  try {
    switch (screen) {
      case 'login':
        return loginScreen(el, { onDone: () => go('hub'), onLocal: () => go('local-setup') });
      case 'hub':
        if (!net.user) return go('login');
        return hubScreen(el, ctx);
      case 'lobby':
        cleanup = await lobbyScreen(el, ctx);
        return;
      case 'room':
        cleanup = await roomScreen(el, ctx, arg);
        return;
      case 'local-setup':
        return localSetupScreen(el, ctx);
      case 'local':
        session = arg;
        cleanup = mountGame(el, session, { onExit: () => go(net.user ? 'hub' : 'login') });
        return;
      case 'online': {
        const { match } = await api('match', { op: 'get', matchId: arg });
        if (match.status === 'lobby') return go('room', arg);
        if (match.state?.kind === 'cup') { cleanup = cupScreen(el, ctx, match); return; }
        const me = match.me;
        session = new OnlineSession(match, me);
        session.on((state, m, err) => { if (err) { toast('Você não faz mais parte desta partida.', 'bad'); go('hub'); } });
        const cupId = match.options?.cupId;
        cleanup = mountGame(el, session, { onExit: () => (cupId ? go('online', cupId) : go('hub')), backLabel: cupId ? 'Voltar para a Copa' : null });
        return;
      }
    }
  } catch (e) {
    console.error(e);
    toast(e.message || 'Erro', 'bad');
    if (screen !== 'login' && screen !== 'hub') go(net.user ? 'hub' : 'login');
  }
}

(async function boot() {
  initInstall();
  installSpriteFallback();
  app.innerHTML = '<div class="screen"><span class="spinner"></span></div>';
  await initNet();
  if (net.config?.dailyPokemon) ctx.daily = net.config.dailyPokemon;
  if (net.config?.maps) setCustomMaps(net.config.maps);
  startNotifications(net.config);
  go(net.user ? 'hub' : 'login');
  // 🔑 chegou pelo link "Esqueci a senha": pede a senha nova
  const askPw = () => { if (net.recovery && net.user) openNewPassword(); };
  askPw();
  window.addEventListener('pmhx-recovery', () => setTimeout(askPw, 300));
})();

function openNewPassword() {
  if (document.getElementById('newpw')) return;
  const ov = openModal('newpw', '🔑 Criar nova senha', `<p class="small">Você entrou pelo link de recuperação. Escolha a senha nova para os próximos logins.</p>
    <div class="col" style="gap:8px"><input class="input" id="np-1" type="password" placeholder="Nova senha (mín. 6)" autocomplete="new-password">
    <input class="input" id="np-2" type="password" placeholder="Repita a senha" autocomplete="new-password">
    <button class="btn primary" data-act="np-save">Salvar senha</button></div>`);
  bindActions(ov, {
    'np-save': async () => {
      const a = ov.querySelector('#np-1').value, b = ov.querySelector('#np-2').value;
      if (a !== b) return toast('As senhas não são iguais.', 'bad');
      try { await setNewPassword(a); closeModal('newpw'); toast('🔑 Senha nova salva! Use ela no próximo login.', 'good'); }
      catch (e) { toast(e.message, 'bad'); }
    }
  });
}
