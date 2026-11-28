import { caughtBall } from '../owned.js';
// Tabuleiro com zoom (roda do mouse / pinça / botões), arrastar para mover e animação dos peões.
import { teamsOn, squadOf, SQUADS } from '../../shared/rules/teams.js';
import { SPACE_LIST, getSpace, useStateMap, GATES, BIOMES } from '../../shared/data/board.js';
import { hasGate } from '../../shared/rules/movement.js';
import { drawTerrain, roadsSvg } from './terrain.js';
import { WeatherLayer } from './weather.js';
import { stormAt, ownerOf } from '../../shared/rules/modes.js';
import { gymAt, ELITE_SPACE, CHAMPION_SPACE, GYMS, BADGES_TO_LEAGUE } from '../../shared/data/trainers.js';
import { distancesFrom } from '../../shared/rules/movement.js';
import { badgeUrl, leaderUrl, itemUrl } from '../config.js';
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
      if (z === 'me' && this.meSpace) this.centerOn(this.meSpace, Math.max(this.scale, this.portrait ? this.cover * 1.3 : this.min * 2.2), true);
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
    const bg = map.bg || (map.theme && map.theme !== 'expedicao' ? `theme_${map.theme}` : map.generated ? 'gen' : String(map.id).replace(/[^a-z0-9_-]/gi, '_'));
    img.src = `${CFG.sprites}board/bg_${bg}.png`;
    this.fitted = false;
    this.layout();
  }

  // ------------------------------------------------ tamanho e câmera
  layout() {
    const w = this.vp.clientWidth, h = this.vp.clientHeight;
    if (!w || !h) return;
    // tela deitada (PC): o "palco" tem a largura da tela. Tela em pé (celular): o palco tem a altura da tela
    // (mesmas proporções de casas, bordas e ícones do PC) e dá para arrastar para os lados.
    this.portrait = w / h < this.ratio * 0.9;
    this.baseW = this.portrait ? h * this.ratio : w;
    this.baseH = this.baseW / this.ratio;
    this.stage.style.width = this.baseW + 'px';
    this.stage.style.height = this.baseH + 'px';
    this.min = Math.min(w / this.baseW, h / this.baseH);   // mapa inteiro na tela
    this.cover = Math.max(this.min, h / this.baseH);       // preenche a altura
    if (!this.fitted) {
      this.fitted = true;
      if (this.portrait && this.meSpace) { this.centered = true; this.centerOn(this.meSpace, this.cover * 1.15, false); }
      else if (this.portrait) this.centerOn(SPACE_LIST[0]?.id, this.cover, false);
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
    // 📱 v65d: folga nas bordas — as casas da beirada podiam ficar embaixo dos botões/placar e não dava para vê-las
    const px = this.edgePad(w), py = this.edgePad(h);
    this.x = sw <= w ? (w - sw) / 2 : Math.min(px, Math.max(w - sw - px, this.x));
    this.y = sh <= h ? (h - sh) / 2 : Math.min(py, Math.max(h - sh - py, this.y));
  }

  /** Quanto o mapa pode passar da borda da tela (só quando ele é maior que a tela). */
  edgePad(len) { return Math.round(Math.min(90, len * 0.16)); }

  apply(smooth) {
    this.scale = Math.max(this.min, Math.min(this.min * 6, this.scale));
    this.clamp();
    // 📱 v64: no dedo (arrastar/pinça) junta tudo num quadro só (requestAnimationFrame) — antes cada evento
    // reescrevia o transform e a variável --ms de centenas de casas e o celular travava
    if (!smooth && this.gesturing) { if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this.paint(false); }); return; }
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this.paint(smooth);
  }

  /** Depois do gesto: o navegador redesenha o mapa nítido no zoom novo (com will-change ele só esticava a imagem). */
  settle() {
    clearTimeout(this._settle);
    this._settle = setTimeout(() => {
      if (this.gesturing) return;
      this.stage.style.willChange = 'auto';
      requestAnimationFrame(() => requestAnimationFrame(() => { this.stage.style.willChange = ''; }));
    }, 180);
  }

  paint(smooth) {
    if (this.stage.classList.contains('smooth') !== !!smooth) this.stage.classList.toggle('smooth', !!smooth);
    this.stage.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(this.y)}px, 0) scale(${this.scale})`;
    // peões, Pokémon e nomes: quase o mesmo tamanho na tela em qualquer zoom (crescem um pouco ao aproximar).
    // Só recalcula quando o zoom muda de verdade e nunca no meio da pinça (recalcular estilo de tudo é o que pesa).
    if (this.pinching) return;
    const ms = (Math.min(1.3, Math.max(0.85, Math.pow(this.scale / (this.portrait ? this.cover : this.min), 0.22))) / this.scale).toFixed(4);
    if (ms !== this._ms) { this._ms = ms; this.stage.style.setProperty('--ms', ms); }
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
    clearTimeout(this._zs); this._zs = setTimeout(() => this.settle(), 300); // nítido depois da animação do zoom
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
    // 📱 v64b: inércia (o mapa continua deslizando um pouco ao soltar o dedo) e retângulo da tela guardado na pinça
    let vel = { x: 0, y: 0, t: 0 }, glide = 0, rect = null;
    const stopGlide = () => { if (glide) { cancelAnimationFrame(glide); glide = 0; } };
    const startGlide = () => {
      let vx = vel.x, vy = vel.y, prev = performance.now();
      if (Math.hypot(vx, vy) < 0.25 || prev - vel.t > 80) return; // soltou parado: sem inércia
      const step = now => {
        const dt = Math.min(32, now - prev); prev = now;
        const f = Math.pow(0.92, dt / 16); vx *= f; vy *= f;
        const bx = this.x, by = this.y;
        this.x += vx * dt; this.y += vy * dt;
        this.scale = Math.max(this.min, Math.min(this.min * 6, this.scale)); this.clamp();
        if (this.x === bx) vx = 0; if (this.y === by) vy = 0; // bateu na borda
        this.paint(false);
        glide = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
        if (!glide) this.settle();
      };
      glide = requestAnimationFrame(step);
    };
    let armed = false; // o toque começou de verdade no mapa (não num botão, menu ou janela por cima)
    let ptype = 'mouse';
    const slop = e => ((e?.pointerType || ptype) === 'touch' ? 12 : 6);
    vp.addEventListener('wheel', e => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    // 📱 iOS: a pinça no mapa também dava zoom na página inteira (a tela "bugava") — aqui o zoom é só do mapa
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) vp.addEventListener(ev, e => e.preventDefault(), { passive: false });
    vp.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    vp.addEventListener('pointerdown', e => {
      if (e.target.closest('.zoom-ctrl')) { armed = false; return; }
      stopGlide();
      if (e.isPrimary && pts.size) { pts.clear(); pinch = null; this.pinching = false; } // dedo "perdido" de um gesto anterior travava tudo
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.gesturing = true;
      if (pts.size === 1) { last = { x: e.clientX, y: e.clientY }; moved = 0; armed = true; ptype = e.pointerType || 'mouse'; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), s: this.scale };
        rect = vp.getBoundingClientRect(); // uma vez só (ler o tamanho a cada movimento força o navegador a recalcular a página)
        this.pinching = true;
      }
    });
    vp.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = rect || (rect = vp.getBoundingClientRect());
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
      if (moved > slop(e)) {
        vp.classList.add('dragging');
        if (!vp.hasPointerCapture(e.pointerId)) vp.setPointerCapture(e.pointerId);
        this.x += dx; this.y += dy;
        this.apply(false);
        const now = e.timeStamp || performance.now(), dt = Math.max(1, now - (vel.t || now - 16));
        vel = { x: vel.x * 0.4 + (dx / dt) * 0.6, y: vel.y * 0.4 + (dy / dt) * 0.6, t: now }; // px por ms, suavizado
      }
      last = { x: e.clientX, y: e.clientY };
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return; // já tratado (pointerup e depois lostpointercapture do mesmo dedo)
      pts.delete(e.pointerId);
      if (pts.size < 2 && pinch) {
        pinch = null; this.pinching = false;
        const rest = [...pts.values()][0];
        last = rest ? { x: rest.x, y: rest.y } : null; // continua arrastando com o dedo que ficou, sem pular
      }
      if (pts.size === 0) {
        const wasDrag = vp.classList.contains('dragging') && !this.pinching && last;
        last = null; rect = null; vp.classList.remove('dragging'); this.gesturing = false; this.pinching = false; this.apply(false);
        if (wasDrag && e.type === 'pointerup') startGlide(); else this.settle();
        vel = { x: 0, y: 0, t: 0 };
      }
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    // 📱 v65d: o dedo que começava em cima de uma casa/peão "travava" o arrasto — ao capturar o ponteiro no mapa,
    // o navegador avisa que a casa perdeu a captura (o aviso sobe até o mapa) e isso encerrava o gesto no meio.
    // Agora só conta quando quem perdeu a captura foi o próprio mapa.
    vp.addEventListener('lostpointercapture', e => { if (e.target === vp) end(e); });
    window.addEventListener('blur', () => { pts.clear(); pinch = null; last = null; this.gesturing = this.pinching = false; vp.classList.remove('dragging'); });
    // clique só conta se não arrastou
    vp.addEventListener('click', e => {
      if (e.target.closest('.zoom-ctrl')) return; // botões de zoom nunca movem o peão
      // clique "fantasma" (o toque começou fora do mapa, num menu que sumiu, ou tem janela aberta): ignora
      const modalOpen = !!document.querySelector('.overlay');
      if (!armed || modalOpen || moved > slop()) { e.stopPropagation(); e.preventDefault(); moved = 0; armed = false; return; }
      armed = false;
      // destino: a casa possível mais perto do toque (não depende de qual enfeite ficou por cima)
      if (this.vp.classList.contains('moving')) {
        const to = this.nearestOption(e.clientX, e.clientY);
        if (to) return this.onMove(to);
      }
      const opt = e.target.closest('.space.opt');
      if (opt) return this.onMove(Number(opt.dataset.to));
      const tok = e.target.closest('.token');
      if (tok) return this.onToken(tok.dataset.pid);
    }, true);
  }

  /** Casa possível mais perto de um ponto da tela (dentro de um raio confortável para o dedo). */
  nearestOption(cx, cy) {
    let best = null, bestD = Infinity;
    for (const el of this.stage.querySelectorAll('.space.opt')) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      const reach = Math.max(r.width * 0.9, 26);
      if (d <= reach && d < bestD) { bestD = d; best = Number(el.dataset.to); }
    }
    return best;
  }

  // ------------------------------------------------ desenho
  render(state, { viewerId, options = [], hint = '' }) {
    this.state = state;
    this.setMap(useStateMap(state));
    this.weather.set(state.kind === 'duel' ? 'clear' : state.weather?.id || 'clear');
    const me = state.players.find(p => p.id === viewerId);
    this.meSpace = me ? me.pos : null;
    // celular: na primeira vez que sabe onde você está, aproxima no seu peão
    if (this.portrait && !this.centered && this.meSpace && this.baseW) { this.centered = true; requestAnimationFrame(() => this.centerOn(this.meSpace, this.cover * 1.15, false)); }
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
      spaces += `<div class="space t${sp.tier} ${sp.type} ${isOpt ? 'opt' : ''} ${locked ? 'locked' : ''} ${storm} ${center}" style="left:${sp.x}%;top:${sp.y}%" ${isOpt ? `data-to="${sp.id}"` : ''} title="${esc(sp.name)}${esc(extra)}">${icon || (sp.type === 'event' ? '<i class="sp-ic ev">?</i>' : sp.type === 'pokemon' ? '<i class="sp-ic pk"></i>' : '')}${g ? `<i class="gate-ic" title="${esc(g.name)}">${g.icon}</i>` : ''}<span class="lbl">${esc(sp.name)}</span></div>`;
    }
    this.stage.querySelector('.layer-spaces').innerHTML = spaces;
    this.stage.querySelector('.layer-spaces').classList.toggle('many-opt', options.length > 6); // v58: menos efeito com muitas opções
    this.stage.querySelector('.layer-badges').innerHTML = state.kind === 'duel' || state.rules === 'royale' ? '' : state.rules === 'conquest' ? conquestMarkers(state) : badgeMarkers(state, me);
    this.stage.classList.toggle('royale', !!royale);
    const q = me?.quest && getSpace(me.quest.space);
    this.stage.querySelector('.layer-hotspots').innerHTML = hotspotMarkers(state) + (q ? `<div class="quest-mark" style="left:${q.x}%;top:${q.y}%" title="Convite de viagem">🗺️</div>` : '');

    let wild = '';
    for (const [id, mon] of Object.entries(state.board || {})) {
      const sp = getSpace(id);
      if (!sp) continue;
      wild += `<div class="wild ${mon.shiny ? 'shiny' : ''}" style="left:${sp.x}%;top:${sp.y}%;--tc:${TIER_COLORS[sp.tier]}" title="${esc(speciesName(mon.sp))} Nv.${mon.lvl} — ${mon.hp}/${maxHpOf(mon)} HP">
        <div class="w-shadow"></div><div class="disc"></div><img src="${monSprite(mon)}" alt="${esc(speciesName(mon.sp))}" draggable="false"><span class="tag">${caughtBall(mon.sp, me, itemUrl('poke_ball'))}${mon.shiny ? '✨' : ''}Nv.${mon.lvl}</span></div>`;
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
    const off = (k - (n - 1) / 2) * (this.portrait ? 26 : 32); // px na tela (multiplicado por 1/zoom)
    const c = pl.cosmetic || {};
    const fr = c.frame ? esc(c.frame) : '';
    const au = c.aura ? esc(c.aura) : '';
    const tr = c.trail ? esc(c.trail) : '';
    const cls = ['token', teamsOn(state) && squadOf(pl) !== null ? 'sq sq' + squadOf(pl) : '', state.current === i ? 'active' : '', fr || au || tr ? 'vip' : '', fr ? 'tf-' + fr : '', au ? 'ta-' + au : '', pl.out ? 'out' : '', n > 1 ? 'stacked' : '', pl.id === viewerId ? 'mine' : ''].join(' ');
    const sparks = au ? `<div class="sparks">${'<i></i>'.repeat(7)}</div>` : '';
    return `<div class="${cls}" data-pid="${esc(pl.id)}" style="left:${sp.x}%;top:${sp.y}%;margin-left:calc(${off}px * var(--ms, 1));--pc:${playerColor(state, pl.id)}" title="${esc(pl.name)}${c.title ? ' — ' + esc(c.title) : ''}">
      ${fr ? '<div class="halo"></div><div class="halo h2"></div>' : ''}${sparks}${tr ? `<div class="trail tr-${tr}">${'<i></i>'.repeat(8)}</div>` : ''}
      <div class="tk-shadow"></div><div class="base ${c.card ? 'tcard-' + esc(c.card) : ''}"></div>
      <div class="pin ${fr ? 'frame-' + fr : ''}"><img src="${avatarUrl(pl.avatar, c.skin)}" alt="${esc(pl.name)}" data-color="${playerColor(state, pl.id)}" draggable="false"></div>
      ${pl.companion && COMPANIONS[pl.companion] ? `<img class="tk-comp" src="${leaderUrl(COMPANIONS[pl.companion].sprite)}" alt="" title="${esc(COMPANIONS[pl.companion].name)}" draggable="false">` : ''}
      ${pl.companion && (pl.bond?.[pl.companion] || 0) >= 10 ? `<span class="tk-heart" title="${esc(COMPANIONS[pl.companion]?.name || '')} é íntimo de ${esc(pl.name)}">❤️</span>` : ''}
      ${pl.megaKey ? `<img class="tk-mega" src="${itemUrl('mega_bracelet')}" alt="" title="🔗 Bracelete Mega" draggable="false" data-color="#7b4bd6">` : ''}
      ${teamsOn(state) && squadOf(pl) !== null ? `<span class="tk-sq" title="${esc(SQUADS[squadOf(pl)].name)}">${SQUADS[squadOf(pl)].icon}</span>` : ''}
      <span class="name">${pl.id === viewerId ? 'Você' : esc(pl.name.split(' ')[0])}</span>
      ${c.title ? `<span class="ttitle ${c.titleFx ? 'pfx-' + esc(c.titleFx) : ''}" ${c.titleColor ? `style="--tc:${esc(c.titleColor)}"` : ''}>★ ${esc(c.title)}</span>` : ''}</div>`;
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
