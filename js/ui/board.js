// Tabuleiro com zoom (roda do mouse / pinça / botões), arrastar para mover e animação dos peões.
import { SPACE_LIST, getSpace } from '../../shared/data/board.js';
import { gymAt, ELITE_SPACE, CHAMPION_SPACE } from '../../shared/data/trainers.js';
import { maxHpOf } from '../../shared/rules/monsters.js';
import { esc } from './dom.js';
import { monSprite, avatarUrl, mapUrl } from '../config.js';
import { speciesName, playerColor } from './common.js';

const RATIO = 2618 / 1226; // proporção real da imagem do mapa (corrigida pelo tamanho natural quando carrega)
const TIER_COLORS = { 1: '#f39ac2', 2: '#5fd36a', 3: '#4c8ff0', 4: '#ef5050', 5: '#f6d34c' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class BoardView {
  constructor(viewport, { onMove, onToken }) {
    this.vp = viewport;
    this.onMove = onMove;
    this.onToken = onToken;
    this.ratio = RATIO;
    this.scale = 1; this.x = 0; this.y = 0; this.min = 1; this.fitted = false;
    viewport.innerHTML = `
      <div class="board-stage stage-noimg" id="stage">
        <div class="board-fallback"></div>
        <img class="board-img" alt="" draggable="false">
        <div class="layer-spaces"></div><div class="layer-wild"></div><div class="layer-tokens"></div>
      </div>
      <div class="zoom-ctrl">
        <button data-z="in" title="Aproximar">+</button><button data-z="out" title="Afastar">−</button>
        <button data-z="me" title="Centralizar no meu peão">◎</button><button data-z="fit" title="Ver o mapa inteiro">⤢</button>
      </div>
      <div class="board-hint hidden" id="board-hint"></div>`;
    this.stage = viewport.querySelector('#stage');
    this.hint = viewport.querySelector('#board-hint');
    const img = this.stage.querySelector('.board-img');
    img.onload = () => {
      if (img.naturalWidth > 200 && img.naturalHeight > 100) this.ratio = img.naturalWidth / img.naturalHeight;
      this.stage.classList.remove('stage-noimg');
      this.stage.querySelector('.board-fallback').remove();
      this.layout();
    };
    img.dataset.fallback = '1'; // sem placeholder: se o mapa não carregar, ficam os pontos coloridos
    img.onerror = () => img.remove();
    img.src = mapUrl();
    this.bindGestures();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(viewport);
    viewport.querySelector('.zoom-ctrl').addEventListener('click', e => {
      const z = e.target.closest('[data-z]')?.dataset.z;
      if (z === 'in') this.zoomAt(1.4);
      if (z === 'out') this.zoomAt(1 / 1.4);
      if (z === 'fit') this.fit(true);
      if (z === 'me' && this.meSpace) this.centerOn(this.meSpace, Math.max(this.scale, this.min * 2.2), true);
    });
  }

  destroy() { this.ro.disconnect(); }

  // ------------------------------------------------ tamanho e câmera
  layout() {
    const w = this.vp.clientWidth, h = this.vp.clientHeight;
    if (!w || !h) return;
    // o "palco" tem a largura do viewport; a escala mínima faz o mapa inteiro caber
    this.baseW = w;
    this.baseH = w / this.ratio;
    this.stage.style.width = this.baseW + 'px';
    this.stage.style.height = this.baseH + 'px';
    this.min = Math.min(1, h / this.baseH);
    if (!this.fitted) {
      this.fitted = true;
      // celular: começa aproximado no jogador; computador: mapa inteiro
      if (w < 700 && this.meSpace) this.centerOn(this.meSpace, this.min * 2.4, false);
      else this.fit(false);
    } else this.apply(false);
  }

  fit(smooth) {
    this.scale = this.min;
    const w = this.vp.clientWidth, h = this.vp.clientHeight;
    this.x = (w - this.baseW * this.scale) / 2;
    this.y = (h - this.baseH * this.scale) / 2;
    this.apply(smooth);
  }

  clamp() {
    const w = this.vp.clientWidth, h = this.vp.clientHeight;
    const sw = this.baseW * this.scale, sh = this.baseH * this.scale;
    this.x = sw <= w ? (w - sw) / 2 : Math.min(0, Math.max(w - sw, this.x));
    this.y = sh <= h ? (h - sh) / 2 : Math.min(0, Math.max(h - sh, this.y));
  }

  apply(smooth) {
    this.scale = Math.max(this.min, Math.min(this.min * 6, this.scale));
    this.clamp();
    this.stage.classList.toggle('smooth', !!smooth);
    this.stage.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
    // peões e Pokémon ficam com tamanho constante na tela, qualquer que seja o zoom
    this.stage.style.setProperty('--ms', (1 / this.scale).toFixed(4));
  }

  zoomAt(factor, cx, cy) {
    const w = this.vp.clientWidth, h = this.vp.clientHeight;
    cx = cx ?? w / 2; cy = cy ?? h / 2;
    const ns = Math.max(this.min, Math.min(this.min * 6, this.scale * factor));
    const k = ns / this.scale;
    this.x = cx - (cx - this.x) * k;
    this.y = cy - (cy - this.y) * k;
    this.scale = ns;
    this.apply(true);
  }

  centerOn(spaceId, scale, smooth = true) {
    const sp = getSpace(spaceId);
    if (!sp || !this.baseW) return;
    if (scale) this.scale = Math.max(this.min, Math.min(this.min * 6, scale));
    const w = this.vp.clientWidth, h = this.vp.clientHeight;
    this.x = w / 2 - (sp.x / 100) * this.baseW * this.scale;
    this.y = h / 2 - (sp.y / 100) * this.baseH * this.scale;
    this.apply(smooth);
  }

  /** Garante que a casa está visível (sem mudar o zoom se já estiver). */
  ensureVisible(spaceId) {
    const sp = getSpace(spaceId);
    if (!sp || !this.baseW) return;
    const px = this.x + (sp.x / 100) * this.baseW * this.scale;
    const py = this.y + (sp.y / 100) * this.baseH * this.scale;
    const w = this.vp.clientWidth, h = this.vp.clientHeight, m = 60;
    if (px < m || py < m || px > w - m || py > h - m) this.centerOn(spaceId, null, true);
  }

  bindGestures() {
    const vp = this.vp;
    const pts = new Map();
    let last = null, moved = 0, pinch = null;
    vp.addEventListener('wheel', e => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    vp.addEventListener('pointerdown', e => {
      if (e.target.closest('.zoom-ctrl')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { last = { x: e.clientX, y: e.clientY }; moved = 0; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.scale };
      }
    });
    vp.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = vp.getBoundingClientRect();
        const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
        const target = pinch.s * (d / pinch.d);
        const k = Math.max(this.min, Math.min(this.min * 6, target)) / this.scale;
        this.x = cx - (cx - this.x) * k; this.y = cy - (cy - this.y) * k; this.scale *= k;
        this.apply(false);
        moved = 99;
        return;
      }
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) {
        vp.classList.add('dragging');
        if (!vp.hasPointerCapture(e.pointerId)) vp.setPointerCapture(e.pointerId);
        this.x += dx; this.y += dy;
        this.apply(false);
      }
      last = { x: e.clientX, y: e.clientY };
    });
    const end = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) { last = null; vp.classList.remove('dragging'); }
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    // clique só conta se não arrastou
    vp.addEventListener('click', e => {
      if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0; return; }
      const opt = e.target.closest('.space.opt');
      if (opt) return this.onMove(Number(opt.dataset.to));
      const tok = e.target.closest('.token');
      if (tok) return this.onToken(tok.dataset.pid);
    }, true);
  }

  // ------------------------------------------------ desenho
  render(state, { viewerId, options = [], hint = '' }) {
    this.state = state;
    const me = state.players.find(p => p.id === viewerId);
    this.meSpace = me ? me.pos : null;
    const opts = new Set(options);
    let spaces = '';
    for (const sp of SPACE_LIST) {
      const isOpt = opts.has(sp.id);
      const icon = sp.type === 'city' ? (gymAt(sp.id) ? '🏟' : sp.id === ELITE_SPACE || sp.id === CHAMPION_SPACE ? '👑' : '') : '';
      const extra = sp.requiredType ? ` · exige tipo ${sp.requiredType}` : '';
      spaces += `<div class="space t${sp.tier} ${sp.type} ${isOpt ? 'opt' : ''}" style="left:${sp.x}%;top:${sp.y}%" ${isOpt ? `data-to="${sp.id}"` : ''} title="${esc(sp.name)}${extra}">${icon}<span class="lbl">${esc(sp.name)}</span></div>`;
    }
    this.stage.querySelector('.layer-spaces').innerHTML = spaces;

    let wild = '';
    for (const [id, mon] of Object.entries(state.board || {})) {
      const sp = getSpace(id);
      if (!sp) continue;
      wild += `<div class="wild ${mon.shiny ? 'shiny' : ''}" style="left:${sp.x}%;top:${sp.y}%;--tc:${TIER_COLORS[sp.tier]}" title="${esc(speciesName(mon.sp))} Nv.${mon.lvl} — ${mon.hp}/${maxHpOf(mon)} HP">
        <div class="disc"></div><img src="${monSprite(mon)}" alt="${esc(speciesName(mon.sp))}" draggable="false"><span class="tag">${mon.shiny ? '✨' : ''}Nv.${mon.lvl}</span></div>`;
    }
    this.stage.querySelector('.layer-wild').innerHTML = wild;

    this.renderTokens(state, viewerId);
    this.vp.classList.toggle('moving', options.length > 0);
    this.hint.textContent = hint;
    this.hint.classList.toggle('hidden', !hint);
    if (this.baseW && !this.fitted) this.layout();
  }

  renderTokens(state, viewerId, override = {}) {
    const byPos = {};
    state.players.forEach((pl, i) => {
      const pos = override[pl.id] ?? pl.pos;
      (byPos[pos] ||= []).push([pl, i]);
    });
    let html = '';
    for (const [pos, list] of Object.entries(byPos)) {
      list.forEach(([pl, i], k) => html += this.tokenHtml(state, pl, i, pos, k, list.length, viewerId));
    }
    this.stage.querySelector('.layer-tokens').innerHTML = html;
  }

  tokenHtml(state, pl, i, pos, k, n, viewerId) {
    const sp = getSpace(pos);
    const off = (k - (n - 1) / 2) * 38; // px na tela (multiplicado por 1/zoom)
    return `<div class="token ${state.current === i ? 'active' : ''}" data-pid="${esc(pl.id)}" style="left:${sp.x}%;top:${sp.y}%;margin-left:calc(${off}px * var(--ms, 1));--pc:${playerColor(state, pl.id)}" title="${esc(pl.name)}">
      <div class="pin"><img src="${avatarUrl(pl.avatar)}" alt="${esc(pl.name)}" data-color="${playerColor(state, pl.id)}" draggable="false"></div>
      <span class="name">${pl.id === viewerId ? 'Você' : esc(pl.name.split(' ')[0])}</span></div>`;
  }

  /** Anima o peão casa a casa pelo caminho. */
  async animateMove(pid, path, speed = 1) {
    const el = [...this.stage.querySelectorAll('.token')].find(t => t.dataset.pid === pid);
    if (!el || !path || path.length < 2) return;
    this.vp.classList.add('moving');
    el.style.marginLeft = '0px';
    for (let i = 1; i < path.length; i++) {
      const sp = getSpace(path[i]);
      el.style.left = sp.x + '%';
      el.style.top = sp.y + '%';
      el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
      if (i === 1 || i === path.length - 1) this.ensureVisible(sp.id);
      await sleep(240 / speed);
    }
    await sleep(120 / speed);
  }
}

export { TIER_COLORS };
