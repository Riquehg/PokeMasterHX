// Animação do clima (chuva, tempestade com raios, neve, areia, sol, neblina) num canvas por cima do tabuleiro ou da arena.
import { WEATHERS } from '../../shared/rules/weather.js';
import { anim } from './fx.js';

const TINT = {
  clear: 'transparent',
  sun: 'radial-gradient(ellipse at 85% 0%, rgba(255,214,120,.35), rgba(255,170,60,.10) 45%, transparent 70%)',
  rain: 'linear-gradient(180deg, rgba(30,50,80,.30), rgba(20,40,70,.18))',
  storm: 'linear-gradient(180deg, rgba(15,20,45,.48), rgba(20,25,50,.28))',
  snow: 'linear-gradient(180deg, rgba(220,235,255,.22), rgba(200,220,245,.12))',
  sand: 'linear-gradient(180deg, rgba(200,150,70,.30), rgba(180,130,60,.22))',
  fog: 'linear-gradient(180deg, rgba(200,205,215,.30), rgba(170,180,195,.24))'
};

export class WeatherLayer {
  /** host: elemento com position relativa/absoluta. tintHost (opcional): onde aplicar a cor do céu. */
  constructor(host, { tintHost = null, density = 1 } = {}) {
    this.host = host;
    this.tintHost = tintHost;
    this.density = density;
    this.id = 'clear';
    this.cv = document.createElement('canvas');
    this.cv.className = 'weather-canvas';
    host.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.parts = [];
    this.flash = 0;
    this.t = 0;
    this.loop = this.loop.bind(this);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  destroy() { this.ro.disconnect(); cancelAnimationFrame(this.raf); this.cv.remove(); }

  resize() {
    const r = this.host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seed();
  }

  set(id) {
    id = WEATHERS[id] ? id : 'clear';
    if (this.tintHost) this.tintHost.style.background = TINT[id];
    this.host.dataset.weather = id;
    if (id === this.id && this.raf) return;
    this.id = id;
    this.seed();
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this.ctx.clearRect(0, 0, this.w, this.h);
    if (id !== 'clear' && anim.speed) this.raf = requestAnimationFrame(this.loop);
  }

  seed() {
    const area = (this.w * this.h) / 10000;
    const n = { rain: 5, storm: 8, snow: 2.2, sand: 3.2, fog: 0.08, sun: 0.05 }[this.id] || 0;
    const count = Math.min(900, Math.round(area * n * this.density));
    this.parts = Array.from({ length: count }, () => this.spawn(true));
  }

  spawn(anywhere) {
    const w = this.w, h = this.h;
    switch (this.id) {
      case 'rain': case 'storm':
        return { x: Math.random() * (w + 200) - 100, y: anywhere ? Math.random() * h : -20, v: 9 + Math.random() * 7, l: 10 + Math.random() * 12 };
      case 'snow':
        return { x: Math.random() * w, y: anywhere ? Math.random() * h : -10, v: 0.6 + Math.random() * 1.2, r: 1 + Math.random() * 2.4, ph: Math.random() * 6 };
      case 'sand':
        return { x: anywhere ? Math.random() * w : -20, y: Math.random() * h, v: 4 + Math.random() * 6, r: 0.8 + Math.random() * 1.6, ph: Math.random() * 6 };
      case 'fog':
        return { x: Math.random() * w, y: Math.random() * h, v: 0.15 + Math.random() * 0.35, r: 80 + Math.random() * 140 };
      case 'sun':
        return { x: Math.random() * w, y: Math.random() * h, ph: Math.random() * 6, r: 1 + Math.random() * 2 };
      default: return {};
    }
  }

  loop() {
    if (document.hidden) { this.raf = requestAnimationFrame(this.loop); return; }
    const c = this.ctx, w = this.w, h = this.h;
    this.t += 1;
    c.clearRect(0, 0, w, h);
    const id = this.id;
    if (id === 'rain' || id === 'storm') {
      c.strokeStyle = id === 'storm' ? 'rgba(190,210,255,.55)' : 'rgba(180,210,255,.5)';
      c.lineWidth = 1.2;
      c.beginPath();
      for (const p of this.parts) {
        p.x += p.v * 0.28; p.y += p.v;
        if (p.y > h) Object.assign(p, this.spawn(false));
        c.moveTo(p.x, p.y); c.lineTo(p.x - p.l * 0.28, p.y - p.l);
      }
      c.stroke();
      if (id === 'storm') {
        if (this.flash <= 0 && Math.random() < 0.006) { this.flash = 12; this.bolt = this.makeBolt(); }
        if (this.flash > 0) {
          c.fillStyle = `rgba(230,240,255,${(this.flash / 12) * 0.45})`;
          c.fillRect(0, 0, w, h);
          if (this.flash > 6 && this.bolt) {
            c.strokeStyle = 'rgba(255,255,230,.95)'; c.lineWidth = 2.5; c.shadowColor = '#fff7a0'; c.shadowBlur = 14;
            c.beginPath(); this.bolt.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
            c.shadowBlur = 0;
          }
          this.flash--;
        }
      }
    } else if (id === 'snow') {
      c.fillStyle = 'rgba(255,255,255,.9)';
      for (const p of this.parts) {
        p.y += p.v; p.ph += 0.03; p.x += Math.sin(p.ph) * 0.6;
        if (p.y > h) Object.assign(p, this.spawn(false));
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
      }
    } else if (id === 'sand') {
      c.fillStyle = 'rgba(225,180,105,.75)';
      for (const p of this.parts) {
        p.x += p.v; p.ph += 0.05; p.y += Math.sin(p.ph) * 0.8;
        if (p.x > w + 20) Object.assign(p, this.spawn(false));
        c.fillRect(p.x, p.y, p.r * 3, p.r);
      }
    } else if (id === 'fog') {
      for (const p of this.parts) {
        p.x += p.v; if (p.x - p.r > w) { p.x = -p.r; p.y = Math.random() * h; }
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, 'rgba(235,238,245,.30)'); g.addColorStop(1, 'rgba(235,238,245,0)');
        c.fillStyle = g; c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    } else if (id === 'sun') {
      // raios girando devagar a partir do canto e brilhos no ar
      const cx = w * 0.88, cy = -h * 0.05;
      c.save(); c.translate(cx, cy); c.rotate(this.t * 0.0015);
      for (let i = 0; i < 12; i++) {
        c.rotate(Math.PI / 6);
        const g = c.createLinearGradient(0, 0, 0, Math.max(w, h));
        g.addColorStop(0, 'rgba(255,230,150,.22)'); g.addColorStop(1, 'rgba(255,230,150,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(-40, Math.max(w, h)); c.lineTo(40, Math.max(w, h)); c.closePath(); c.fill();
      }
      c.restore();
      for (const p of this.parts) {
        p.ph += 0.04;
        c.fillStyle = `rgba(255,245,200,${0.25 + Math.sin(p.ph) * 0.25})`;
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  makeBolt() {
    let x = Math.random() * this.w, y = 0;
    const pts = [[x, y]];
    while (y < this.h * (0.4 + Math.random() * 0.4)) { x += (Math.random() - 0.5) * 50; y += 20 + Math.random() * 25; pts.push([x, y]); }
    return pts;
  }
}

/** Chip do clima para a barra da partida. */
export function weatherChipHtml(state) {
  const w = WEATHERS[state?.weather?.id] || WEATHERS.clear;
  const left = state?.weather ? Math.max(1, state.weather.until - state.turn) : 0;
  return `<span class="weather-chip w-${state?.weather?.id || 'clear'}" title="${w.name}: ${w.desc}${state?.weather?.id && state.weather.id !== 'clear' ? ` (mais ${left} rodada${left > 1 ? 's' : ''})` : ''}">${w.icon} ${w.name}${state?.weather?.id && state.weather.id !== 'clear' ? ` · ${left}` : ''}</span>`;
}
