// 📲 App instalável (PWA): registra o service worker e oferece "Instalar app".
import { openModal } from './dom.js';

let deferred = null;
const listeners = new Set();

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initInstall() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    listeners.forEach(f => f());
  });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()); });
}

export function onInstallChange(f) { listeners.add(f); return () => listeners.delete(f); }

export async function promptInstall() {
  if (deferred) {
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    return;
  }
  const ios = isIOS();
  openModal('install', '📲 Instalar o app', ios
    ? `<ol class="install-steps"><li>Abra este site no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b> (o quadrado com a seta ⬆️).</li>
        <li>Escolha <b>Adicionar à Tela de Início</b> e confirme.</li></ol><p class="small muted">O jogo abre em tela cheia, como um app, com o ícone na tela inicial.</p>`
    : `<ol class="install-steps"><li>No <b>Chrome</b> (Android ou computador), toque no menu <b>⋮</b>.</li><li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
        <li>Confirme. O ícone aparece na tela inicial e o jogo abre em tela cheia.</li></ol>
        <p class="small muted">Se a opção não aparecer, recarregue a página uma vez e tente de novo (o navegador precisa terminar de carregar o app).</p>`);
}
