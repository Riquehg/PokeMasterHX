// 🎵 v61 — Música durante o jogo: o jogador cola um link do YouTube (vídeo ou playlist) e um mini player
// fica tocando no canto enquanto ele joga. Links salvos só neste aparelho (localStorage). Sem custo de servidor.
import { esc, toast, openModal, closeModal, bindActions, setModalBody } from './dom.js';

const KEY = 'pmhx_music';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ok */ } };

/** Lê um link do YouTube: { video, list } ou null. */
export function parseYoutube(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  let u;
  try { u = new URL(s.startsWith('http') ? s : 'https://' + s); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return null;
  const list = u.searchParams.get('list') || null;
  let video = u.searchParams.get('v') || null;
  if (host === 'youtu.be') video = u.pathname.slice(1).split('/')[0] || null;
  const m = /\/(embed|shorts|live)\/([\w-]{6,})/.exec(u.pathname);
  if (m && m[2] !== 'videoseries') video = m[2];
  const ok = id => !id || /^[\w-]{6,64}$/.test(id);
  if (!ok(video) || !ok(list) || (!video && !list)) return null;
  return { video, list };
}

function embedUrl({ video, list }) {
  const p = new URLSearchParams({ autoplay: '1', loop: '1', playsinline: '1', rel: '0', modestbranding: '1' });
  if (list) p.set('list', list);
  else p.set('playlist', video); // repetir um vídeo só
  return `https://www.youtube-nocookie.com/embed/${video || 'videoseries'}?${p}`;
}

let dock = null;
function ensureDock() {
  if (dock && document.body.contains(dock)) return dock;
  dock = document.createElement('div');
  dock.className = 'mu-dock';
  document.body.appendChild(dock);
  dock.addEventListener('click', e => {
    const b = e.target.closest('[data-mu]');
    if (!b) return;
    if (b.dataset.mu === 'min') { dock.classList.toggle('min'); const d = load(); d.min = dock.classList.contains('min'); save(d); }
    if (b.dataset.mu === 'stop') stopMusic();
    if (b.dataset.mu === 'open') openMusic();
  });
  return dock;
}

export function playMusic(link) {
  const yt = parseYoutube(link?.url || link);
  if (!yt) { toast('Link inválido. Cole um link do YouTube (vídeo ou playlist).', 'bad'); return false; }
  const d = ensureDock();
  const st = load();
  d.classList.toggle('min', !!st.min);
  d.innerHTML = `<div class="mu-bar"><span class="mu-t">🎵 ${esc(link?.name || 'Tocando')}</span><button data-mu="open" title="Trocar música">🎶</button><button data-mu="min" title="Minimizar / mostrar">▁</button><button data-mu="stop" title="Parar">✖</button></div>
    <iframe class="mu-frame" src="${embedUrl(yt)}" title="Música" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  save({ ...st, playing: { url: link?.url || link, name: link?.name || '' } });
  return true;
}

export function stopMusic() {
  if (dock) { dock.remove(); dock = null; }
  const st = load(); delete st.playing; save(st);
}

export function openMusic() {
  const st = load();
  const render = () => `<p class="small">Cole o link de uma música ou <b>playlist do YouTube</b> e ela toca num mini player no canto enquanto você joga. Os links ficam salvos neste aparelho.</p>
    <div class="row" style="gap:6px"><input class="input grow" id="mu-url" placeholder="https://www.youtube.com/playlist?list=..." maxlength="300"><input class="input" id="mu-name" placeholder="Nome (opcional)" maxlength="40" style="max-width:160px"></div>
    <div class="row" style="gap:6px;margin-top:6px"><button class="btn primary" data-act="mu-add">▶️ Tocar e salvar</button>${st.playing || dock ? '<button class="btn red" data-act="mu-stop">⏹️ Parar música</button>' : ''}</div>
    <h4 style="margin-top:12px">🎶 Minhas músicas</h4>
    <div class="col" style="gap:4px">${(load().links || []).map((l, i) => `<div class="row mu-row"><span class="grow">🎵 ${esc(l.name || l.url)}</span><button class="btn sm" data-act="mu-play" data-i="${i}">▶️</button><button class="btn sm" data-act="mu-del" data-i="${i}">🗑️</button></div>`).join('') || '<span class="tiny muted">Nada salvo ainda.</span>'}</div>
    <p class="tiny muted" style="margin-top:8px">Dica: no celular, deixe o mini player à mostra (▁ minimiza). Alguns vídeos não deixam tocar fora do YouTube — aí é só escolher outro.</p>`;
  const ov = openModal('music', '🎵 Música do jogo', render());
  const redraw = () => setModalBody('music', render());
  bindActions(ov, {
    'mu-add': () => {
      const url = ov.querySelector('#mu-url')?.value.trim(), name = ov.querySelector('#mu-name')?.value.trim();
      if (!parseYoutube(url)) return toast('Link inválido. Use um link do YouTube.', 'bad');
      const d = load(); d.links = [{ url, name }, ...(d.links || []).filter(x => x.url !== url)].slice(0, 20); save(d);
      if (playMusic({ url, name })) closeModal('music');
    },
    'mu-play': x => { const l = (load().links || [])[Number(x.i)]; if (l && playMusic(l)) closeModal('music'); },
    'mu-del': x => { const d = load(); d.links = (d.links || []).filter((_, i) => i !== Number(x.i)); save(d); redraw(); },
    'mu-stop': () => { stopMusic(); redraw(); }
  });
}

/** Ao abrir o jogo: mostra o player minimizado com a última música (o navegador só toca depois de um toque). */
export function restoreMusic() {
  const st = load();
  if (!st.playing) return;
  const once = () => { document.removeEventListener('pointerdown', once, true); if (!dock) playMusic(st.playing); };
  document.addEventListener('pointerdown', once, true);
}
