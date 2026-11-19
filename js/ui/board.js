// Tabuleiro com zoom (roda do mouse / pinça / botões), arrastar para mover e animação dos peões.
import { SPACE_LIST, getSpace, useStateMap, GATES, BIOMES } from '../../shared/data/board.js';
import { hasGate } from '../../shared/rules/movement.js';
import { drawTerrain, roadsSvg } from './terrain.js';
import { WeatherLayer } from './weather.js';
import { stormAt, ownerOf } from '../../shared/rules/modes.js';
import { gymAt, ELITE_SPACE, CHAMPION_SPACE, GYMS, BADGES_TO_LEAGUE } from '../../shared/data/trainers.js';
import { distancesFrom } from '../../shared/rules/movement.js';
import { badgeUrl, leaderUrl } from '../config.js';
import { COMPANIONS } from '../../shared/data/companions.js';
import { maxHpOf } from '../../shared/rules/monsters.js';
import { esc } from './dom.js';
import { monSprite, avatarUrl, CFG } from '../config.js';
import { speciesName, playerColor } from './common.js';
import { TYPE_LABELS as typeNames } from '../../shared/rules/types.js';

const TIER_COLORS = { 1: '#f39ac2', 2: '#5fd36a', 3: '#4c8ff0', 4: '#ef5050', 5: '#f6d34c' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class BoardView {
  constructor(viewport, { onMove, onToken }) {
    this.vp = viewport;
    this.onMove = onMove;
    this.onToken = onToken;
    this.ratio = 2;
    this.map = null;
    this.scale = 1; this.x = 0; this.y = 0; this.min = 1; this.fitted = false;
    viewport.innerHTML = `
      <div class="board-stage stage-noimg" id="stage">
        <canvas class="board-terrain"></canvas>
        <img class="board-img hidden" alt="" draggable="false">
        <div class="layer-roads"></div>
        <div class="layer-weather-tint"></div>
        <div class="layer-spaces"></div><div class="layer-badges"></div><div class="layer-hotspots"></div><div class="layer-wild"></div><div class="layer-tokens"></div>
      </div>
      <div class="zoom-ctrl">
        <button data-z="in" title="Aproximar">+</button><button data-z="out" title="Afastar">−</button>
        <button data-z="me" title="Centralizar no meu peão">◎</button><button data-z="fit" title="Ver o mapa inteiro">⤢</button>
      </div>
      <div class="board-hint hidden" id="board-hint"></div>`;
    this.stage = viewport.querySelector('#stage');
    this.hint = viewport.querySelector('#board-hint');
    this.weather = new WeatherLayer(viewport, { tintHost: this.stage.querySelector('.layer-weather-tint') });
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

  destroy() { this.ro.disconnect(); this.weather?.destroy(); }

  /** Desenha o mapa (terreno + rotas). Imagem de fundo opcional: sprites/board/bg_<mapa>.png (ex.: bg_kanto.png, bg_gen.png). */
  setMap(map) {
    if (this.map === map) return;
    this.map = map;
    this.ratio = map.ratio;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const cv = this.stage.querySelector('.board-terrain');
    cv.width = small ? 1700 : 2600;
    cv.height = Math.round(cv.width / map.ratio);
    drawTerrain(cv, map, SPACE_LIST);
    this.stage.querySelector('.layer-roads').innerHTML = roadsSvg(map, SPACE_LIST);
    const img = this.stage.querySelector('.board-img');
    img.classList.add('hidden');
    img.dataset.fallback = '1';
    img.onload = () => img.classList.remove('hidden');
    img.onerror = () => img.classList.add('hidden');
    img.src = `${CFG.sprites}board/bg_${map.generated ? 'gen' : map.id}.png`;
    this.fitted = false;
    this.layout();
  }

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
    this.setMap(useStateMap(state));
    this.weather.set(state.kind === 'duel' ? 'clear' : state.weather?.id || 'clear');
    const me = state.players.find(p => p.id === viewerId);
    this.meSpace = me ? me.pos : null;
    const opts = new Set(options);
    const royale = state.rules === 'royale' && state.royale;
    let spaces = '';
    for (const sp of SPACE_LIST) {
      const st = royale ? stormAt(state, sp.id) : null;
      const storm = st ? (st.in ? 'storm' : st.soon && state.turn + 1 >= 3 ? 'storm-soon' : '') : '';
      const center = royale && sp.id === state.royale.center ? 'storm-center' : '';
      const isOpt = opts.has(sp.id);
      const icon = sp.type === 'city' ? (gymAt(sp.id) ? '🏟' : sp.id === ELITE_SPACE || sp.id === CHAMPION_SPACE ? '👑' : '') : '';
      const g = sp.gate && GATES[sp.gate];
      const locked = g && me && !hasGate(me, sp.gate);
      const extra = `${BIOMES[sp.biome] ? ' · ' + BIOMES[sp.biome].name : ''}${g ? ` · ${g.icon} ${g.name}: precisa de Pokémon (ou golpe) ${g.types.map(t => typeNames[t] || t).join('/')} para ${g.desc}` : ''}`;
      spaces += `<div class="space t${sp.tier} ${sp.type} ${isOpt ? 'opt' : ''} ${locked ? 'locked' : ''} ${storm} ${center}" style="left:${sp.x}%;top:${sp.y}%" ${isOpt ? `data-to="${sp.id}"` : ''} title="${esc(sp.name)}${esc(extra)}">${icon}${g ? `<i class="gate-ic" title="${esc(g.name)}">${g.icon}</i>` : ''}<span class="lbl">${esc(sp.name)}</span></div>`;
    }
    this.stage.querySelector('.layer-spaces').innerHTML = spaces;
    this.stage.querySelector('.layer-badges').innerHTML = state.kind === 'duel' || state.rules === 'royale' ? '' : state.rules === 'conquest' ? conquestMarkers(state) : badgeMarkers(state, me);
    this.stage.classList.toggle('royale', !!royale);
    this.stage.querySelector('.layer-hotspots').innerHTML = hotspotMarkers(state);

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
    const c = pl.cosmetic || {};
    const fr = c.frame ? esc(c.frame) : '';
    const au = c.aura ? esc(c.aura) : '';
    const cls = ['token', state.current === i ? 'active' : '', fr || au ? 'vip' : '', fr ? 'tf-' + fr : '', au ? 'ta-' + au : '', pl.out ? 'out' : ''].join(' ');
    const sparks = au ? `<div class="sparks">${'<i></i>'.repeat(7)}</div>` : '';
    return `<div class="${cls}" data-pid="${esc(pl.id)}" style="left:${sp.x}%;top:${sp.y}%;margin-left:calc(${off}px * var(--ms, 1));--pc:${playerColor(state, pl.id)}" title="${esc(pl.name)}${c.title ? ' — ' + esc(c.title) : ''}">
      ${fr ? '<div class="halo"></div><div class="halo h2"></div>' : ''}${sparks}
      <div class="pin ${fr ? 'frame-' + fr : ''} ${c.card ? 'tcard-' + esc(c.card) : ''}"><img src="${avatarUrl(pl.avatar)}" alt="${esc(pl.name)}" data-color="${playerColor(state, pl.id)}" draggable="false"></div>
      ${pl.companion && COMPANIONS[pl.companion] ? `<img class="tk-comp" src="${leaderUrl(COMPANIONS[pl.companion].sprite)}" alt="" title="${esc(COMPANIONS[pl.companion].name)}" draggable="false">` : ''}
      <span class="name">${pl.id === viewerId ? 'Você' : esc(pl.name.split(' ')[0])}</span>
      ${c.title ? `<span class="ttitle">★ ${esc(c.title)}</span>` : ''}</div>`;
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

/** Situação das insígnias para um jogador: conquistadas, faltando e a mais próxima (sugestão de caminho). */
export function badgeStatus(state, me) {
  if (!me) return GYMS.map(g => ({ ...g, owned: false, dist: null, next: false }));
  let dist = {};
  try { dist = distancesFrom(me, me.pos); } catch { dist = {}; }
  const list = GYMS.map(g => ({ ...g, owned: me.badges.includes(g.id), dist: dist[g.space] ?? null, next: false }));
  const missing = list.filter(g => !g.owned && g.dist !== null).sort((a, b) => a.dist - b.dist);
  if (missing[0]) missing[0].next = true;
  return list;
}

const HS_NAME = { chest: 'Baú do Tesouro', raid: 'Raid Relâmpago', mystery: 'Pokémon Misterioso' };
/** Eventos relâmpago: ícone na casa com as rodadas que faltam. Quem parar ali ativa. */
function hotspotMarkers(state) {
  return (state.hotspots || []).map(h => {
    const sp = SPACE_LIST.find(x => x.id === h.space);
    if (!sp) return '';
    const left = Math.max(1, h.until - state.turn);
    const art = h.kind === 'chest' ? '<span class="hs-emoji">🎁</span>' : h.kind === 'raid' ? '<span class="hs-emoji">🔥</span>'
      : `<img class="hs-sil" src="${monSprite(h.mon.sp)}" alt="" draggable="false"><span class="hs-q">?</span>`;
    return `<div class="hotspot hs-${h.kind}" style="left:${sp.x}%;top:${sp.y}%" title="${HS_NAME[h.kind]} — pare nesta casa para ativar · some em ${left} rodada(s)">
      ${art}<span class="hs-timer">⏳${left}</span></div>`;
  }).join('');
}

/** Conquista: bandeira com a cor do dono e quantos defendem. */
function conquestMarkers(state) {
  return GYMS.map(g => {
    const sp = getSpace(g.space);
    if (!sp) return '';
    const o = ownerOf(state, g.id);
    const gar = state.conquest.garrison[g.id].filter(m => m.hp > 0).length;
    const col = o ? playerColor(state, o) : '#8a8a8a';
    const name = o ? state.players.find(p => p.id === o)?.name : 'Neutra';
    return `<div class="conq-flag ${o ? '' : 'neutral'}" style="left:${sp.x}%;top:${sp.y}%;--fc:${col}" title="${esc(sp.name)} — ${esc(name)}${o ? ` · ${gar} defensor(es)` : ` · líder ${esc(g.leader)}`}">
      <span class="cf-pole"></span><span class="cf-cloth">${o ? '🏰' : '⚑'}</span>${o ? `<span class="cf-gar">🛡️${gar}</span>` : ''}</div>`;
  }).join('');
}

function badgeMarkers(state, me) {
  return badgeStatus(state, me).map(g => {
    const sp = SPACE_LIST.find(x => x.id === g.space);
    if (!sp) return '';
    const tip = `${g.city} — ${g.leader} (${g.badge})${g.owned ? ' ✔ conquistada' : g.dist !== null ? ` · ${g.dist} casa(s) daqui` : ''}`;
    return `<div class="gym-badge ${g.owned ? 'owned' : 'missing'} ${g.next ? 'next' : ''}" style="left:${sp.x}%;top:${sp.y}%" title="${esc(tip)}">
      <img src="${badgeUrl(g.id)}" alt="" draggable="false"><span class="gb-mark">${g.owned ? '✔' : g.next ? '➜' : ''}</span>
      ${g.next ? `<span class="gb-next">Próxima · ${g.dist} casas</span>` : ''}</div>`;
  }).join('') + (me && me.badges.length >= BADGES_TO_LEAGUE ? (() => {
    const sp = SPACE_LIST.find(x => x.id === ELITE_SPACE);
    return sp ? `<div class="gym-badge next league" style="left:${sp.x}%;top:${sp.y}%" title="Liga liberada!"><span class="gb-league">👑</span><span class="gb-next">Liga liberada!</span></div>` : '';
  })() : '');
}
