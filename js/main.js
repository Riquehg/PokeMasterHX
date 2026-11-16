// Ponto de entrada: inicializa a rede e navega entre as telas.
import { initNet, net, api } from './api.js';
import { dailyPokemon } from '../shared/daily.js';
import { OnlineSession } from './session.js';
import { mountGame } from './ui/game.js';
import { loginScreen, hubScreen, lobbyScreen, roomScreen, localSetupScreen } from './ui/screens.js';
import { toast } from './ui/dom.js';
import { startNotifications } from './ui/notify.js';
import { startSocial } from './ui/social.js';

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
        const me = match.me;
        session = new OnlineSession(match, me);
        session.on((state, m, err) => { if (err) { toast('Você não faz mais parte desta partida.', 'bad'); go('hub'); } });
        cleanup = mountGame(el, session, { onExit: () => go('hub') });
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
  app.innerHTML = '<div class="screen"><span class="spinner"></span></div>';
  await initNet();
  if (net.config?.dailyPokemon) ctx.daily = net.config.dailyPokemon;
  startNotifications(net.config);
  go(net.user ? 'hub' : 'login');
})();
