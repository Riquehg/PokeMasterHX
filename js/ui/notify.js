// Avisos para todos: banner quando alguém captura lendário/shiny ou vira Campeão, e pop-up de anúncio do admin.
import { esc } from './dom.js';
import { monSprite, avatarUrl } from '../config.js';
import { net, api } from '../api.js';
import { confetti } from './fx.js';

let lastId = null;
let started = false;

const KIND_STYLE = {
  info: { icon: '📢', color: '#4c8ff0', label: 'Aviso' },
  warn: { icon: '⚠️', color: '#e5484d', label: 'Atenção' },
  event: { icon: '🎉', color: '#f4c25b', label: 'Evento' },
  update: { icon: '🆕', color: '#3fbf7f', label: 'Novidade' }
};

/** Pop-up do anúncio do admin (aparece uma vez por anúncio, até o jogador fechar). */
export function showAnnouncement(a, force = false) {
  if (!a || !a.active) return;
  const key = 'pmhx_ann_' + a.id;
  if (!force && localStorage.getItem(key)) return;
  document.getElementById('announce')?.remove();
  const st = KIND_STYLE[a.kind] || KIND_STYLE.info;
  const el = document.createElement('div');
  el.className = 'overlay';
  el.id = 'announce';
  el.innerHTML = `<div class="card modal announce" style="--ac:${st.color};max-width:460px">
      <div class="ann-kicker">${st.icon} ${st.label}</div>
      <h2 class="ann-title">${esc(a.title)}</h2>
      <p class="ann-text">${esc(a.text).replace(/\n/g, '<br>')}</p>
      <button class="btn primary block" data-ok>Entendi!</button></div>`;
  el.querySelector('[data-ok]').onclick = () => { localStorage.setItem(key, '1'); el.remove(); };
  document.body.appendChild(el);
}

/** Banner no topo da tela (some sozinho). */
export function showFeedBanner(ev) {
  let box = document.getElementById('feed-banners');
  if (!box) { box = document.createElement('div'); box.id = 'feed-banners'; document.body.appendChild(box); }
  const d = ev.data || {};
  const el = document.createElement('div');
  el.className = `feed-banner ${ev.kind}`;
  const pic = d.sp ? `<img src="${monSprite(d.sp, d.shiny)}" alt="">` : d.avatar ? `<img src="${avatarUrl(d.avatar)}" alt="">` : '<span style="font-size:30px">👑</span>';
  el.innerHTML = `${pic}<div><div class="fb-kick">${ev.kind === 'legendary' ? '⚡ CAPTURA LENDÁRIA' : ev.kind === 'shiny' ? '✨ CAPTURA SHINY' : ev.kind === 'champion' ? '👑 NOVO CAMPEÃO' : '📢'}</div><div class="fb-text">${esc(ev.text)}</div></div>`;
  box.appendChild(el);
  if (ev.kind === 'legendary' || ev.kind === 'champion') confetti(60);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 6000);
}

async function poll() {
  try {
    const { events } = await api('feed', { since: lastId ?? 0 }, 'GET');
    const list = [...events].sort((a, b) => a.id - b.id);
    if (lastId === null) { // primeira leitura: só marca até onde já foi
      lastId = list.length ? list[list.length - 1].id : 0;
      return;
    }
    for (const ev of list) {
      lastId = Math.max(lastId, ev.id);
      if (ev.kind === 'announcement') showAnnouncement(ev.data);
      else showFeedBanner(ev);
    }
  } catch { /* sem rede: tenta depois */ }
}

export function startNotifications(config) {
  if (started || net.mode === 'offline') return;
  started = true;
  if (config?.announcement) showAnnouncement(config.announcement);
  poll();
  setInterval(poll, net.mode === 'dev' ? 4000 : 20000);
  if (net.mode === 'prod' && net.sb) {
    net.sb.channel('global-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_feed' }, () => poll())
      .subscribe();
  }
}
