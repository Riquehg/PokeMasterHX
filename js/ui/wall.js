// ✨ Mural de capturas raras (tela inicial, do lado oposto ao chat): últimos lendários e shinies capturados por todos.
import { api } from '../api.js';
import { esc } from './dom.js';
import { monSprite, avatarUrl } from '../config.js';
import { getSpecies } from '../../shared/data/pokemon.js';

const st = { open: window.innerWidth >= 1500, items: [], timer: null, visible: false, filter: 'all' };

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

function root() {
  let r = document.getElementById('wall');
  if (!r) {
    r = document.createElement('div');
    r.id = 'wall';
    document.body.appendChild(r);
    r.addEventListener('click', e => {
      const b = e.target.closest('[data-wall]');
      if (!b) return;
      if (b.dataset.wall === 'toggle') st.open = !st.open;
      if (b.dataset.wall === 'filter') st.filter = b.dataset.v;
      draw();
    });
  }
  return r;
}

function draw() {
  const r = root();
  r.classList.toggle('hidden', !st.visible);
  if (!st.visible) return;
  const list = st.items.filter(x => st.filter === 'all' || (st.filter === 'shiny' ? x.shiny : x.kind === 'legendary' || getSpecies(x.sp)?.tier >= 5));
  if (!st.open) {
    const n = st.items.length;
    r.innerHTML = `<button class="wall-fab" data-wall="toggle" title="Últimos lendários e shinies capturados">✨ Capturas raras${n ? ` <b>${n}</b>` : ''}</button>`;
    return;
  }
  r.innerHTML = `<div class="wall-panel">
    <div class="wall-head"><b>✨ Mural de capturas</b><button class="btn sm" data-wall="toggle">✕</button></div>
    <div class="wall-tabs">${[['all', 'Todas'], ['legend', '👑 Lendários'], ['shiny', '✨ Shinies']].map(([k, l]) => `<button class="btn sm ${st.filter === k ? 'primary' : ''}" data-wall="filter" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="wall-list">${list.map(x => {
      const sp = getSpecies(x.sp);
      return `<div class="wall-item ${x.shiny ? 'shiny' : ''} ${sp?.tier >= 5 ? 'legend' : ''}">
        <img class="wi-mon" src="${monSprite(x.sp, x.shiny)}" alt="" loading="lazy">
        <div class="grow"><b>${esc(sp?.name || x.sp)}${x.shiny ? ' ✨' : ''}</b>${sp?.tier >= 5 ? ' <span class="chip gold">Lendário</span>' : ''}
          <div class="tiny"><img class="wi-av" src="${avatarUrl(x.avatar)}" alt=""> ${esc(x.name || '?')} · <span class="muted">${ago(x.at)}</span></div></div></div>`;
    }).join('') || '<p class="tiny muted center">Ninguém capturou um lendário ou shiny ainda. Seja o primeiro!</p>'}</div></div>`;
}

async function load() {
  try {
    const r = await api('feed', { kinds: 'captures' }, 'GET');
    st.items = r.captures || [];
    draw();
  } catch { /* sem rede: mantém o que tinha */ }
}

/** Mostra (na tela inicial) ou esconde (nas outras telas) o mural. */
export function showWall(on) {
  st.visible = !!on;
  clearInterval(st.timer);
  if (on) { load(); st.timer = setInterval(load, 30000); }
  draw();
}
