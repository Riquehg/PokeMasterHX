// Animações: dado 3D, faixa de turno, carta de evento, entrada de batalha, captura e confete.
import { getSpecies } from '../../shared/data/pokemon.js';
import { ITEMS } from '../../shared/data/items.js';
import { esc } from './dom.js';
import { monSprite, avatarUrl, itemUrl, leaderUrl } from '../config.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Velocidade: 1 normal, 2 rápida, 0 sem animações
export const anim = {
  get speed() { const v = Number(localStorage.getItem('pmhx_anim') ?? 1); return Number.isFinite(v) ? v : 1; },
  set speed(v) { localStorage.setItem('pmhx_anim', String(v)); }
};
const wait = ms => (anim.speed ? sleep(ms / anim.speed) : Promise.resolve());

function layer(cls = '') {
  const el = document.createElement('div');
  el.className = 'fx-layer ' + cls;
  document.body.appendChild(el);
  return el;
}
async function removeLayer(el) {
  if (!el.isConnected) return;
  el.classList.add('fx-out');
  await sleep(220);
  el.remove();
}
/** Espera um clique (ou o tempo acabar). */
function clickOrTimeout(el, ms) {
  return new Promise(res => {
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    el.addEventListener('click', fin, { once: true });
    setTimeout(fin, anim.speed ? ms / anim.speed : 0);
  });
}

// ------------------------------------------------ dado 3D
const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 2: [90, 0] };
function faceHtml(n) {
  let cells = '';
  for (let i = 1; i <= 9; i++) cells += PIPS[n].includes(i) ? '<i></i>' : '<span></span>';
  return `<div class="face f${n}">${cells}</div>`;
}

export async function rollDice({ value, bonus = 0, name, color, mine }) {
  if (!anim.speed) return;
  const el = layer('dim');
  el.innerHTML = `<div class="dice-box" style="--pc:${color}">
    <div class="dice-who">🎲 ${mine ? 'Você rolou' : esc(name) + ' rolou'}</div>
    <div class="scene"><div class="cube throw">${[1, 2, 3, 4, 5, 6].map(faceHtml).join('')}</div></div>
    <div class="dice-result hidden"></div></div>`;
  const cube = el.querySelector('.cube');
  const [rx, ry] = FACE_ROT[value];
  // gira bastante e para na face sorteada (o valor veio do servidor)
  requestAnimationFrame(() => {
    cube.style.transition = `transform ${1.1 / anim.speed}s cubic-bezier(.15,.7,.25,1)`;
    cube.style.transform = `rotateX(${rx + 720 + 360}deg) rotateY(${ry + 720}deg) rotateZ(0deg)`;
  });
  await wait(1150);
  const res = el.querySelector('.dice-result');
  res.textContent = bonus ? `${value} + ${bonus} 🚲 = ${value + bonus}` : String(value);
  res.classList.remove('hidden');
  await wait(650);
  await removeLayer(el);
}

// ------------------------------------------------ faixa de turno
export async function turnBanner({ player, color, mine, turn }) {
  if (!anim.speed) return;
  const el = document.createElement('div');
  el.className = 'turn-swipe' + (mine ? ' me' : '');
  el.style.setProperty('--pc', color);
  el.innerHTML = `<img src="${avatarUrl(player.avatar)}" alt="${esc(player.name)}" data-color="${color}">
    <div><div class="t1">Turno ${turn}</div><div class="t2">${mine ? 'Sua vez!' : 'Vez de ' + esc(player.name)}</div></div>`;
  document.body.appendChild(el);
  el.style.animationDuration = `${1.5 / anim.speed}s`;
  await wait(1500);
  el.remove();
}

// ------------------------------------------------ carta de evento
export async function eventCard(f, { name, mine }) {
  if (!anim.speed) return;
  const el = layer('dim');
  const icon = f.mon ? `<img src="${monSprite(f.mon.sp, f.mon.shiny)}" alt="">`
    : f.trainer?.sprite ? `<img class="ev-trainer" src="${leaderUrl(f.trainer.sprite)}" alt="${esc(f.trainer.name)}">` : f.icon;
  const SPECIAL = ['raid', 'legend_shrine', 'master_trainer', 'star_shower', 'league_treasure', 'mew_blessing', 'ancient_egg'];
  const special = SPECIAL.includes(f.id);
  const kicker = f.id === 'raid' ? '🔥 Raid Lendária' : f.id === 'badge_reward' ? '🎁 Recompensa da Liga' : special ? '⭐ Evento Especial' : 'Carta de Evento';
  el.innerHTML = `<div class="ev-card ${special ? 'special' : ''} ${f.id === 'raid' ? 'raid' : ''}" data-tone="${f.tone}"><div class="ev-inner"><div class="ev-face">
      <div class="ev-kicker">${kicker}</div>
      <div class="ev-icon">${icon}</div>
      <div class="ev-title">${esc(f.title)}</div>
      <div class="ev-lore">“${esc(f.lore)}”</div>
      <div class="ev-effects">${f.effects.map((e, i) => `<div class="ev-eff ${e.tone}" style="animation-delay:${0.6 + i * 0.18}s">
        ${e.item ? `<img src="${itemUrl(e.item)}" alt="${esc(ITEMS[e.item]?.name || '')}">` : e.mon ? `<img src="${monSprite(e.mon)}" alt="">` : e.icon || ''}${esc(e.text)}</div>`).join('')}</div>
      <div class="ev-who">${mine ? 'Toque para continuar' : esc(name) + ' tirou esta carta'}</div>
    </div></div></div>`;
  await clickOrTimeout(el, mine ? 6000 : 3200);
  await removeLayer(el);
}

// ------------------------------------------------ entrada de batalha
/** Celebração de shiny: é raríssimo, então a tela inteira comemora. */
export async function shinyCelebration(sp) {
  if (!anim.speed) return;
  const el = layer('dim');
  el.innerHTML = `<div class="shiny-party"><div class="rays"></div><img src="${monSprite(sp, true)}" alt="">
    <div class="sp-title">✨ SHINY! ✨</div><div class="sp-sub">Um ${esc(getSpecies(sp).name)} brilhante apareceu! (chance de 1 em 450)</div><div class="sparkles"></div></div>`;
  sparkle(el.querySelector('.sparkles'), 40);
  confetti(160);
  await wait(3000);
  el.remove();
}

export async function battleIntro(f, { me, foePlayer }) {
  if (!anim.speed) return;
  if (f.foe?.shiny && (f.kind === 'wild' || f.kind === 'raid')) await shinyCelebration(f.foe.sp);
  const el = layer('dim');
  if (f.kind === 'raid') {
    el.innerHTML = `<div class="intro raid ${f.foe.shiny ? 'shiny' : ''}"><div class="grass"><img src="${monSprite(f.foe.sp, f.foe.shiny)}" alt=""><div class="sparkles"></div></div>
      <div class="text">🔥 RAID! ${esc(getSpecies(f.foe.sp).name)}${f.foe.shiny ? ' ✨' : ''} Nv.${f.foe.lvl} 🔥</div></div>`;
    sparkle(el.querySelector('.sparkles'), 22);
    await wait(2400);
  } else if (f.kind === 'wild') {
    el.innerHTML = `<div class="intro ${f.foe.shiny ? 'shiny' : ''}"><div class="grass"><img src="${monSprite(f.foe.sp, f.foe.shiny)}" alt=""><div class="sparkles"></div></div>
      <div class="text">${f.foe.shiny ? '✨ Um ' : 'Um '}${esc(getSpecies(f.foe.sp).name)} selvagem apareceu!${f.foe.shiny ? ' ✨' : ''}</div></div>`;
    if (f.foe.shiny) sparkle(el.querySelector('.sparkles'));
    await wait(2100);
  } else {
    const foeName = foePlayer ? foePlayer.name : `${f.foe.title ? f.foe.title + ' ' : ''}${f.foe.name}`;
    const foeImg = foePlayer ? avatarUrl(foePlayer.avatar) : (f.foe.sprite ? leaderUrl(f.foe.sprite) : monSprite(f.foe.sp));
    el.innerHTML = `<div class="vs-screen">
      <div class="side l"><img src="${avatarUrl(me.avatar)}" alt="${esc(me.name)}"><div class="nm">${esc(me.name)}</div></div>
      <div class="vs">VS</div>
      <div class="side r"><img src="${foeImg}" alt="${esc(foeName)}"><div class="nm">${esc(foeName)}</div></div></div>`;
    await wait(1900);
  }
  await removeLayer(el);
}

function sparkle(box, n = 14) {
  if (!box) return;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.textContent = i % 2 ? '✨' : '⭐';
    s.style.left = 30 + Math.random() * 40 + '%';
    s.style.top = 20 + Math.random() * 50 + '%';
    s.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    s.style.setProperty('--dy', (Math.random() * 160 - 80) + 'px');
    s.style.animationDelay = (0.4 + Math.random() * 0.8) + 's';
    box.appendChild(s);
  }
}

// ------------------------------------------------ captura
const BALL_COLORS = { poke_ball: '#e33', great_ball: '#2f6fe0', ultra_ball: '#222', master_ball: '#8a3ed8', flame_ball: '#ff7a1a',
  aqua_ball: '#29a3e0', volt_ball: '#f0cf1a', shadow_ball: '#5b2b8a', mystic_ball: '#e05bb7', rainbow_ball: '#ff5f5f' };

export async function captureAnim(f, { escaped }) {
  if (!anim.speed) return;
  const el = layer('dim');
  const name = getSpecies(f.sp).name;
  el.innerHTML = `<div class="cap-stage">
      <img class="target ${f.shiny ? 'shiny' : ''}" src="${monSprite(f.sp, f.shiny)}" alt="${esc(name)}">
      <div class="pball throw" style="--ball:${BALL_COLORS[f.ball] || '#e33'}"></div>
      <div class="cap-dots"><i></i><i></i><i></i></div>
      <div class="sparkles"></div></div>`;
  const ball = el.querySelector('.pball'), target = el.querySelector('.target');
  const dots = el.querySelectorAll('.cap-dots i');
  await wait(650);
  target.classList.add('absorb');
  await wait(550);
  for (let i = 0; i < f.shakes; i++) {
    ball.classList.remove('wiggle'); void ball.offsetWidth; ball.classList.add('wiggle');
    await wait(620);
    dots[i].classList.add('on');
    await wait(180);
  }
  const text = document.createElement('div');
  text.className = 'cap-text';
  if (f.ok) {
    ball.classList.add('locked');
    sparkle(el.querySelector('.sparkles'), 18);
    text.textContent = `🎉 ${name} foi capturado!`;
    confetti(60);
  } else {
    ball.classList.add('open');
    target.classList.remove('absorb'); target.classList.add('back');
    text.textContent = f.roll === 1 ? 'Falha crítica! Escapou!' : escaped ? `${name} escapou e fugiu!` : `Ahh! Quase! ${name} escapou!`;
  }
  el.querySelector('.cap-stage').appendChild(text);
  await clickOrTimeout(el, 1800);
  await removeLayer(el);
}

// ------------------------------------------------ confete
export function confetti(n = 80) {
  if (!anim.speed) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#f4c25b', '#e5484d', '#3fbf7f', '#4c8ff0', '#c779f0', '#fff'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 1.6 + Math.random() * 1.8 + 's';
    c.style.animationDelay = Math.random() * 0.6 + 's';
    box.appendChild(c);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

export { sleep, wait };
