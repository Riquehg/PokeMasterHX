// Tela de batalha (arena estilo jogos de Pokémon) + animações de golpe, dano, cura, troca e desmaio.
import { getSpecies } from '../../shared/data/pokemon.js';
import { ITEMS, ballBonusAgainst } from '../../shared/data/items.js';
import { monView, maxHpOf } from '../../shared/rules/monsters.js';
import { canUse, badgesNeeded } from '../../shared/rules/helpers.js';
import { monMoves } from '../../shared/data/moves.js';
import { STATUS, CAPTURE_TARGET } from '../../shared/rules/battle.js';
import { bestAttack, against, effectivenessLabel, TYPE_COLORS } from '../../shared/rules/types.js';
import { whoMustAct } from '../../shared/engine.js';
import { esc, hpClass } from './dom.js';
import { monSprite, itemUrl, leaderUrl, typeLabel } from '../config.js';
import { typeChips, edgeBadge, foeIntelHtml } from './common.js';
import { COMPANIONS } from '../../shared/data/companions.js';
import { wait } from './fx.js';

const KIND_TITLE = {
  wild: '🌿 Pokémon Selvagem', trainer: '⚔️ Treinador', rocket: '🦹 Equipe Rocket', gym: '🏟️ Batalha de Ginásio',
  elite: '👑 Elite dos Quatro', champion: '🏆 Campeão da Liga', pvp: '🤺 Batalha PvP', raid: '🔥 RAID Lendária', ace: '🎖️ Ás da Liga'
};

function sideTeam(state, side) {
  return side.kind === 'player' ? state.players.find(p => p.id === side.pid).team : side.team;
}

export function captureChance(state, ballId) {
  const b = state.battle;
  const wild = b.sides[1].team[0];
  const me = sideTeam(state, b.sides[0])[b.sides[0].active];
  const sp = getSpecies(wild.sp);
  if (ITEMS[ballId]?.bonus >= 99) return 1;
  const max = maxHpOf(wild);
  const hpBonus = wild.hp <= max * 0.25 ? 2 : wild.hp <= max * 0.5 ? 1 : 0;
  const lvlBonus = me && me.lvl >= wild.lvl + 5 ? 1 : 0;
  const target = CAPTURE_TARGET[sp.tier] + (wild.shiny ? 1 : 0);
  const st = b.sides[1].status?.[wild.uid];
  const stBonus = st ? (st.id === 'sleep' || st.id === 'freeze' ? 2 : 1) : 0;
  const bonus = ballBonusAgainst(ballId, sp.types) + hpBonus + lvlBonus + stBonus;
  let ok = 0;
  for (let r = 2; r <= 6; r++) if (r + bonus >= target) ok++;
  return ok / 6;
}

function hpBox(state, side, mon, cls, vs = null) {
  const v = monView(mon);
  const owner = side.kind === 'player' ? state.players.find(p => p.id === side.pid)?.name : side.kind === 'wild' ? 'Selvagem' : side.name;
  const team = sideTeam(state, side);
  const r = Math.max(0, v.hp) / v.maxHp;
  return `<div class="hpbox ${cls}" data-uid="${esc(mon.uid)}">
    <div class="owner">${esc(owner || '')}</div>
    <div class="nm"><span>${vs ? edgeBadge(mon, vs, true) : ''}${esc(v.name)}${v.shiny ? ' ✨' : ''}${mon.raid ? ' <span class="chip red">CHEFE</span>' : ''}</span><span class="lv">Nv.${v.lvl}</span></div>
    <div class="types">${typeChips(v.types)}${side.boost?.[mon.uid] ? ` <span class="chip green">ATQ +${side.boost[mon.uid]}</span>` : ''}${statusChip(side, mon)}${stageChip(side, mon)}</div>
    <div class="hp ${hpClass(r)}"><i style="width:${(r * 100).toFixed(1)}%"></i></div>
    <div class="hpnum"><b class="cur">${Math.max(0, v.hp)}</b> / ${v.maxHp}</div>
    ${team.length > 1 ? `<div class="balls">${team.map(m => `<i class="${m.hp > 0 ? '' : 'off'}"></i>`).join('')}</div>` : ''}
  </div>`;
}

function statusChip(side, mon) {
  const st = side.status?.[mon.uid];
  if (!st) return '';
  const S = STATUS[st.id];
  return ` <span class="st-chip" style="--sc:${S.color}" title="${esc(S.name)}: ${esc(S.desc)}">${S.icon} ${S.short}</span>`;
}
function stageChip(side, mon) {
  const st = side.stage?.[mon.uid] || 0;
  return st ? ` <span class="chip ${st > 0 ? 'green' : 'red'}">ATQ ${st > 0 ? '▲' : '▼'}${Math.abs(st)}</span>` : '';
}

/** Painel do espectador: golpes e banco dos dois lados. */
function spectatorHtml(state, b) {
  const sideInfo = side => {
    const team = sideTeam(state, side);
    const act = team[side.active];
    const owner = side.kind === 'player' ? state.players.find(p => p.id === side.pid)?.name : side.kind === 'wild' ? 'Selvagem' : side.name;
    return `<div class="spec-side"><b>${esc(owner || '')}</b>
      <div class="spec-moves">${act ? monMoves(act).map(m => `<span class="move-chip" style="--tc:${TYPE_COLORS[m.type]}"><b>${esc(m.name)}</b> <span class="tiny">${m.kind === 'dmg' || m.kind === 'drain' ? Math.round((m.power || 1) * 100) + '%' : 'suporte'}</span></span>`).join('') : ''}</div>
      <div class="spec-bench">${team.map((m, i) => `<span class="spec-mon ${i === side.active ? 'on' : ''} ${m.hp <= 0 ? 'ko' : ''}" title="${esc(getSpecies(m.sp).name)} Nv.${m.lvl} — ${Math.max(0, m.hp)}/${maxHpOf(m)} HP">
        <img src="${monSprite(m)}" alt=""><i style="width:${Math.max(0, (m.hp / maxHpOf(m)) * 100).toFixed(0)}%"></i></span>`).join('')}</div></div>`;
  };
  return `<div class="spectator"><div class="tiny muted center">👀 Assistindo — golpes em campo e banco de cada lado</div>
    <div class="spec-grid">${sideInfo(b.sides[0])}${sideInfo(b.sides[1])}</div></div>`;
}

/** HTML completo. ui.sub = submenu ('switch'|'item'|'ball'). */
export function battleHtml(state, vid, ui = {}, canAct = true) {
  const b = state.battle;
  if (!b) return '';
  let mySi = b.sides.findIndex(s => s.kind === 'player' && s.pid === vid);
  const participant = mySi >= 0;
  if (!participant) mySi = 0;
  const me = b.sides[mySi], foe = b.sides[1 - mySi];
  const myMon = sideTeam(state, me)[me.active], foeMon = sideTeam(state, foe)[foe.active];
  const must = whoMustAct(state);
  const myTurn = participant && canAct && must.includes(vid) && !ui.busy;
  const mustSwitch = participant && b.mustSwitch[mySi];
  const tier = b.kind === 'wild' || b.kind === 'raid' ? getSpecies(foeMon.sp).tier : 1;
  const official = ['gym', 'elite', 'champion'].includes(b.kind);
  const vp = state.players.find(x => x.id === vid);

  const foeMoves = monMoves(foeMon);
  const matchup = `Golpes do adversário: ${foeMoves.map(m => {
    const mult = m.kind === 'dmg' || m.kind === 'drain' ? against(m.type, getSpecies(myMon.sp).types) : 1;
    return `<b style="color:${TYPE_COLORS[m.type]}">${esc(m.name)}</b>${mult !== 1 ? ` <b>x${mult}</b>` : ''}`;
  }).join(' · ')}`;

  // cenário comprado na Loja: vale o de quem começou a batalha (ou do outro treinador)
  const skinOf = side => side?.kind === 'player' ? state.players.find(x => x.id === side.pid)?.cosmetic?.arena : null;
  const arenaSkin = skinOf(b.sides[0]) || skinOf(b.sides[1]);
  const arena = `<div class="arena t${tier} ${official ? 'official' : ''} ${arenaSkin && !official ? 'arena-' + esc(arenaSkin) : ''}" id="arena">
      ${foe.kind === 'npc' && foe.sprite ? `<img class="foe-trainer" src="${leaderUrl(foe.sprite)}" alt="${esc(foe.name)}">` : ''}
      <div class="platform foe"></div><div class="platform me"></div>
      ${foeMon.aura ? `<div class="aura-fx foe aura-${esc(foeMon.aura)}"></div>` : ''}${myMon.aura ? `<div class="aura-fx me aura-${esc(myMon.aura)}"></div>` : ''}
      <img class="mon-sprite foe ${foeMon.shiny ? 'shiny' : ''} ${foeMon.raid ? 'raid-boss' : ''} ${foeMon.aura ? 'aura-' + esc(foeMon.aura) : ''}" data-uid="${esc(foeMon.uid)}" src="${monSprite(foeMon)}" alt="${esc(getSpecies(foeMon.sp).name)}">
      <img class="mon-sprite me ${myMon.shiny ? 'shiny' : ''} ${myMon.aura ? 'aura-' + esc(myMon.aura) : ''}" data-uid="${esc(myMon.uid)}" src="${monSprite(myMon)}" alt="${esc(getSpecies(myMon.sp).name)}">
      ${hpBox(state, foe, foeMon, 'foe')}
      ${hpBox(state, me, myMon, 'me', participant ? foeMon : null)}
    </div>`;

  let controls = '';
  if (ui.busy) controls = `<p class="muted center" style="margin-top:10px">⚔️ ...</p>`;
  else if (!participant) controls = spectatorHtml(state, b);
  else if (!myTurn) controls = `<p class="muted center" style="margin-top:10px"><span class="spinner"></span> ${b.kind === 'pvp' ? 'Aguardando o adversário escolher...' : 'Aguarde...'}</p>`;
  else if (mustSwitch) controls = `<p class="center" style="margin-top:10px"><b>${esc(getSpecies(myMon.sp).name)} desmaiou!</b> Escolha quem entra:</p>${switchList(sideTeam(state, me), me.active, vp, foeMon)}`;
  else {
    const p = state.players.find(x => x.id === vid);
    const myTeam = sideTeam(state, me);
    const balls = Object.entries(p.items).filter(([id, n]) => ITEMS[id]?.kind === 'ball' && n > 0);
    const items = Object.entries(p.items).filter(([id, n]) => ['heal', 'revive', 'boost', 'cure'].includes(ITEMS[id]?.kind) && n > 0);
    const moveBtns = monMoves(myMon).map((m, i) => {
      const dmg = m.kind === 'dmg' || m.kind === 'drain';
      const mult = dmg ? against(m.type, getSpecies(foeMon.sp).types) : 1;
      const stab = dmg && getSpecies(myMon.sp).types.includes(m.type);
      const tag = !dmg ? `<span class="mv-tag sup">${esc(m.desc)}</span>`
        : mult === 0 ? '<span class="mv-tag bad">Não afeta</span>' : mult >= 2 ? `<span class="mv-tag good">Super efetivo x${mult}</span>` : mult < 1 ? `<span class="mv-tag bad">Pouco efetivo x${mult}</span>` : '<span class="mv-tag">Normal</span>';
      return `<button class="btn move-btn" style="--tc:${TYPE_COLORS[m.type]}" data-act="b-attack" data-slot="${i}" title="${esc(m.desc)}">
        <span class="mv-name">${esc(m.name)}</span>
        <span class="mv-meta">${esc(typeLabel(m.type))}${dmg ? ` · poder ${Math.round((m.power || 1) * (stab ? 1.2 : 1) * 100)}%` : ''}${m.miss ? ` · erra no 🎲${m.miss === 1 ? '1' : '1–2'}` : ''}</span>${tag}</button>`;
    }).join('');
    controls = `<div class="move-grid">${moveBtns}</div><div class="battle-actions">
        <button class="btn blue" data-act="b-sub" data-sub="switch" ${myTeam.filter(m => m.hp > 0 && canUse(p, m)).length < 2 ? 'disabled' : ''}>🔄 Trocar</button>
        <button class="btn purple" data-act="b-sub" data-sub="item" ${items.length ? '' : 'disabled'}>🎒 Itens</button>
        <button class="btn green" data-act="b-sub" data-sub="ball" ${b.kind === 'wild' && balls.length ? '' : 'disabled'} ${b.kind === 'raid' ? 'title="Na Raid, vença primeiro: a captura é automática no fim"' : ''}>🔴 Capturar</button>
        <button class="btn" data-act="b-flee" ${official ? 'disabled' : ''}>${b.kind === 'wild' ? '🏃 Fugir' : '🏳️ Desistir'}</button>
      </div>${b.kind === 'raid' ? '<p class="tiny muted center">🔥 Raid: pokébolas bloqueadas durante a luta. Vença o chefe e depois escolha a Pokébola para tentar capturar.</p>' : ''}`;
    if (ui.sub === 'switch') controls += switchList(myTeam, me.active, p, foeMon);
    if (ui.sub === 'item') controls += `<div class="subpick">${items.map(([id, n]) => `<button class="btn sm pickbtn" data-act="b-item" data-item="${id}"><img src="${itemUrl(id)}" alt="${esc(ITEMS[id].name)}">${esc(ITEMS[id].name)} ×${n}</button>`).join('')}</div>`;
    if (ui.sub === 'ball') {
      controls += `<div class="subpick">${balls.map(([id, n]) => {
        const c = Math.round(captureChance(state, id) * 100);
        return `<button class="btn sm pickbtn" data-act="b-ball" data-item="${id}"><img src="${itemUrl(id)}" alt="${esc(ITEMS[id].name)}">${esc(ITEMS[id].name)} ×${n} <span class="chip ${c >= 60 ? 'green' : c >= 34 ? 'gold' : 'red'}">${c}%</span></button>`;
      }).join('')}</div><p class="tiny muted">Dica: HP abaixo de 50% dá +1 e abaixo de 25% dá +2. 🎲1 sempre falha e cada erro pode fazê-lo fugir.</p>`;
    }
  }

  return `<div class="battle-head"><b>${state.kind === 'duel' ? '⚔️ Duelo' : KIND_TITLE[b.kind] || 'Batalha'}${foe.kind === 'npc' ? ` · ${esc(foe.title ? foe.title + ' ' : '')}${esc(foe.name)}` : ''}</b><span class="chip">Rodada ${b.round + 1}</span></div>
    ${arena}
    ${(b.kind === 'wild' || b.kind === 'raid') && foe.kind === 'wild' ? foeIntelHtml(foeMon) : ''}
    <div class="matchup">${matchup}</div>
    ${controls}
    <div class="battle-log" id="battle-log">${b.log.slice(-14).map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
}

function switchList(team, active, player, foe) {
  return `<div class="subpick">${team.map((m, i) => {
    const v = monView(m);
    const locked = player && !canUse(player, m);
    return `<button class="btn sm pickbtn ${locked ? 'locked-mon' : ''}" data-act="b-switch" data-index="${i}" ${m.hp <= 0 || i === active || locked ? 'disabled' : ''}>
      <img src="${monSprite(m)}" alt="${esc(v.name)}">${foe ? edgeBadge(m, foe) : ''}${esc(v.name)} Nv.${v.lvl} <span class="tiny muted">${Math.max(0, m.hp)}/${v.maxHp}</span>${locked ? `<span class="lock-tag">🔒 ${badgesNeeded(m)} insígnias</span>` : ''}</button>`;
  }).join('')}</div>`;
}

// ------------------------------------------------ animações dentro da arena
const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
/** Dado 3D girando e parando no valor tirado (6 = crítico dourado, 1 = fraco vermelho). */
async function rollBattleDie(arena, atk, f) {
  const d = document.createElement('div');
  d.className = 'bdie';
  d.innerHTML = '<div class="bdie-cube"><span>⚄</span></div><div class="bdie-lbl"></div>';
  if (atk) {
    const r = atk.getBoundingClientRect(), a = arena.getBoundingClientRect();
    d.style.left = (r.left - a.left + r.width * (atk.classList.contains('me') ? 0.75 : 0.1)) + 'px';
    d.style.top = (r.top - a.top + r.height * 0.15) + 'px';
  }
  arena.appendChild(d);
  const face = d.querySelector('span');
  const steps = 7;
  for (let i = 0; i < steps; i++) { face.textContent = DIE_FACES[(f.roll + i * 2 + 3) % 6]; await wait(55); }
  face.textContent = DIE_FACES[f.roll - 1] || '⚄';
  d.classList.add('landed', f.roll === 6 ? 'crit' : f.roll === 1 ? 'weak' : 'ok');
  d.querySelector('.bdie-lbl').textContent = f.miss ? `${f.roll} · errou!` : f.roll === 6 ? '6 · crítico!' : f.roll === 1 ? '1 · fraco' : String(f.roll);
  setTimeout(() => d.classList.add('out'), 700);
  setTimeout(() => d.remove(), 1100);
  await wait(220);
}

// ------------------------------------------------ efeitos por tipo de golpe
const TYPE_FX = {
  fire: { ico: '🔥', shape: 'orb', burst: '🔥' }, water: { ico: '💧', shape: 'beam', burst: '💦' }, electric: { ico: '⚡', shape: 'zap', burst: '⚡' },
  grass: { ico: '🍃', shape: 'spray', burst: '🍃' }, ice: { ico: '❄️', shape: 'spray', burst: '❄️' }, fighting: { ico: '👊', shape: 'melee', burst: '💥' },
  poison: { ico: '☠️', shape: 'orb', burst: '🟣' }, ground: { ico: '🪨', shape: 'quake', burst: '🟤' }, flying: { ico: '🌪️', shape: 'spray', burst: '🪶' },
  psychic: { ico: '🔮', shape: 'ring', burst: '✨' }, bug: { ico: '🐛', shape: 'spray', burst: '🟢' }, rock: { ico: '🪨', shape: 'orb', burst: '🪨' },
  ghost: { ico: '👻', shape: 'ring', burst: '👻' }, dragon: { ico: '🐉', shape: 'beam', burst: '💜' }, dark: { ico: '🌑', shape: 'melee', burst: '🌑' },
  steel: { ico: '⚙️', shape: 'melee', burst: '✴️' }, fairy: { ico: '🌸', shape: 'spray', burst: '💖' }, normal: { ico: '💫', shape: 'melee', burst: '💥' }
};

function center(arena, el) {
  const r = el.getBoundingClientRect(), a = arena.getBoundingClientRect();
  return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
}

/** Golpe "viaja" do atacante ao alvo (bola, raio, faísca, rajada...) e explode em partículas. */
async function moveProjectile(arena, atk, def, type, speed = 1) {
  if (!atk || !def) return;
  const T = TYPE_FX[type] || TYPE_FX.normal;
  const color = TYPE_COLORS[type] || '#fff';
  const A = center(arena, atk), B = center(arena, def);
  const dur = Math.round(380 / speed);
  if (T.shape === 'melee') return; // golpe físico: o avanço do Pokémon já é a animação
  if (T.shape === 'quake') {
    arena.classList.remove('quake'); void arena.offsetWidth; arena.classList.add('quake');
    await wait(dur);
    return;
  }
  if (T.shape === 'beam' || T.shape === 'zap') {
    const beam = document.createElement('div');
    beam.className = 'fx-beam ' + T.shape;
    const dx = B.x - A.x, dy = B.y - A.y;
    beam.style.cssText = `left:${A.x}px;top:${A.y}px;width:${Math.hypot(dx, dy)}px;--tc:${color};transform:rotate(${Math.atan2(dy, dx)}rad);animation-duration:${dur}ms`;
    arena.appendChild(beam);
    setTimeout(() => beam.remove(), dur + 120);
    await wait(dur * 0.8);
    return;
  }
  if (T.shape === 'ring') {
    const ring = document.createElement('div');
    ring.className = 'fx-ring';
    ring.style.cssText = `left:${B.x}px;top:${B.y}px;--tc:${color};animation-duration:${dur + 200}ms`;
    arena.appendChild(ring);
    setTimeout(() => ring.remove(), dur + 300);
    await wait(dur * 0.7);
    return;
  }
  // orb / spray: 1 bola grande ou 5 partículas
  const n = T.shape === 'spray' ? 5 : 1;
  for (let i = 0; i < n; i++) {
    const o = document.createElement('div');
    o.className = 'fx-orb ' + T.shape;
    o.textContent = T.ico;
    const jitter = n > 1 ? (i - 2) * 14 : 0;
    o.style.cssText = `left:${A.x}px;top:${A.y}px;--tc:${color};--dx:${B.x - A.x}px;--dy:${B.y - A.y + jitter}px;animation-duration:${dur}ms;animation-delay:${i * 45}ms`;
    arena.appendChild(o);
    setTimeout(() => o.remove(), dur + i * 45 + 80);
  }
  await wait(dur + (n - 1) * 45);
}

/** Explosão de partículas no alvo (mais forte em super efetivo / crítico). */
function impactBurst(arena, def, type, strong) {
  if (!def) return;
  const T = TYPE_FX[type] || TYPE_FX.normal;
  const C = center(arena, def);
  const n = strong ? 10 : 6;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'fx-spark';
    p.textContent = T.burst;
    const ang = (i / n) * Math.PI * 2, dist = (strong ? 70 : 48) + (i % 3) * 10;
    p.style.cssText = `left:${C.x}px;top:${C.y}px;--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist}px;font-size:${strong ? 22 : 16}px`;
    arena.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
  const wave = document.createElement('div');
  wave.className = 'fx-wave';
  wave.style.cssText = `left:${C.x}px;top:${C.y}px;--tc:${TYPE_COLORS[type] || '#fff'}`;
  arena.appendChild(wave);
  setTimeout(() => wave.remove(), 600);
}

function float(arena, target, text, cls) {
  const r = target.getBoundingClientRect(), a = arena.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'dmg-float ' + cls;
  d.textContent = text;
  d.style.left = (r.left - a.left + r.width / 2) + 'px';
  d.style.top = (r.top - a.top + r.height * 0.25) + 'px';
  arena.appendChild(d);
  setTimeout(() => d.remove(), 1100);
}

function setHp(box, hp, max) {
  if (!box) return;
  const r = Math.max(0, hp) / max;
  const bar = box.querySelector('.hp');
  bar.className = 'hp ' + hpClass(r);
  bar.querySelector('i').style.width = (r * 100).toFixed(1) + '%';
  const cur = box.querySelector('.cur');
  const from = Number(cur.textContent) || 0;
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / 500);
    cur.textContent = Math.round(from + (Math.max(0, hp) - from) * k);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function moveBanner(arena, sprite, name, type) {
  const el = document.createElement('div');
  el.className = 'move-banner';
  el.style.setProperty('--tc', TYPE_COLORS[type] || '#888');
  el.textContent = name;
  if (sprite) el.classList.add(sprite.classList.contains('me') ? 'me' : 'foe');
  arena.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

/** Toca, em ordem, os efeitos de uma rodada na arena aberta (#arena). */
export async function playBattleFx(fxList) {
  const arena = document.getElementById('arena');
  if (!arena) return;
  for (const f of fxList) {
    if (!arena.isConnected) return;
    const sprite = uid => arena.querySelector(`.mon-sprite[data-uid="${uid}"]`);
    const box = uid => arena.querySelector(`.hpbox[data-uid="${uid}"]`);
    const box2 = box;
    if (f.k === 'assist') {
      // ❤️ companheiro íntimo entra na arena com o Pokémon dele e usa o golpe especial
      const c = COMPANIONS[f.comp];
      const mine = arena.querySelector('.mon-sprite.me');
      const sideCls = mine && f.side === 0 ? 'me' : (f.side === 0 ? 'me' : 'foe');
      const box = document.createElement('div');
      box.className = `assist-cut ${sideCls}`;
      box.style.setProperty('--tc', TYPE_COLORS[f.type] || '#ff9ccf');
      box.innerHTML = `<img class="as-trainer" src="${leaderUrl(c?.sprite || '')}" alt=""><img class="as-mon" src="${monSprite({ sp: f.sp })}" alt="">
        <div class="as-banner"><span>❤️ ${esc(c?.name || '')}</span><b>${esc(f.move)}!</b></div>`;
      arena.appendChild(box);
      await wait(900);
      const target = sprite(f.uid);
      const asMon = box.querySelector('.as-mon');
      if (f.kind === 'dmg') {
        await moveProjectile(arena, asMon, target, f.type === 'normal' || TYPE_FX[f.type]?.shape === 'melee' ? 'psychic' : f.type);
        if (target) { target.classList.remove('hurt'); void target.offsetWidth; target.classList.add('hurt'); impactBurst(arena, target, f.type, true); float(arena, target, `-${f.dmg}`, 'crit'); }
        arena.classList.remove('punch'); void arena.offsetWidth; arena.classList.add('punch');
        setHp(box2(f.uid), f.hpAfter, f.maxHp);
      } else if (f.kind === 'heal') {
        if (target) { float(arena, target, `+${f.amount}`, 'heal'); target.classList.remove('buffed'); void target.offsetWidth; target.classList.add('buffed'); }
        setHp(box2(f.uid), f.hpAfter, f.maxHp);
      } else if (f.kind === 'buff' || f.kind === 'debuff') {
        if (target) { target.classList.remove('buffed', 'debuffed'); void target.offsetWidth; target.classList.add(f.kind === 'buff' ? 'buffed' : 'debuffed'); float(arena, target, f.kind === 'buff' ? 'ATQ ▲' : 'ATQ ▼', f.kind === 'buff' ? 'heal' : 'crit'); }
      } else if (f.kind === 'status' && target) {
        const S = STATUS[f.status] || { icon: '✨', name: '' };
        float(arena, target, `${S.icon} ${S.name}!`, 'crit');
      }
      await wait(700);
      box.classList.add('out');
      setTimeout(() => box.remove(), 450);
      await wait(300);
    } else if (f.k === 'hit') {
      const atk = sprite(f.atkUid), def = sprite(f.defUid);
      if (atk) { const c = atk.classList.contains('me') ? 'lunge-me' : 'lunge-foe'; atk.classList.remove(c); void atk.offsetWidth; atk.classList.add(c); }
      if (f.move) moveBanner(arena, atk, f.move, f.type);
      // 🎲 dado rolando ao lado de quem ataca, parando no resultado
      await rollBattleDie(arena, atk, f);
      if (!f.miss && f.mult !== 0) await moveProjectile(arena, atk, def, f.type);
      if (def && f.dmg > 0) impactBurst(arena, def, f.type, f.crit || f.mult >= 2);
      if (f.mult >= 2 || f.crit) { arena.classList.remove('punch'); void arena.offsetWidth; arena.classList.add('punch'); }
      if (def) {
        if (f.dmg > 0) { def.classList.remove('hurt'); void def.offsetWidth; def.classList.add('hurt'); }
        const flash = document.createElement('div');
        flash.className = 'hit-flash';
        flash.style.background = (TYPE_COLORS[f.type] || '#fff') + '88';
        arena.appendChild(flash); setTimeout(() => flash.remove(), 260);
        if (f.crit) { arena.classList.remove('shake'); void arena.offsetWidth; arena.classList.add('shake'); }
        float(arena, def, f.mult === 0 ? 'Imune!' : `-${f.dmg}${f.crit ? '!' : ''}`, f.crit ? 'crit' : '');
        setHp(box(f.defUid), f.hpAfter, f.maxHp);
      }
      const eff = f.mult === 0 ? 'Não afeta...' : effectivenessLabel(f.mult) || (f.crit ? 'Golpe crítico!' : '');
      if (eff) {
        const e = document.createElement('div');
        e.className = 'eff-banner' + (f.mult < 1 ? ' bad' : '');
        e.textContent = eff;
        arena.appendChild(e); setTimeout(() => e.remove(), 950);
      }
      await wait(650);
    } else if (f.k === 'weather_dmg') {
      const s = sprite(f.uid);
      const icon = { snow: '🌨️', sand: '🏜️' }[f.weather] || '☁️';
      if (s) float(arena, s, `${icon} -${f.dmg}`, 'crit');
      const box = arena.querySelector(`.hpbox[data-uid="${f.uid}"]`); if (box) setHp(box, f.hpAfter, f.maxHp);
      await wait(550);
    } else if (f.k === 'status' || f.k === 'status_dmg' || f.k === 'status_skip' || f.k === 'status_cure') {
      const s = sprite(f.uid);
      const S = STATUS[f.status] || { icon: '✨', name: 'Curado', color: '#3fd46b' };
      if (s) {
        float(arena, s, f.k === 'status_dmg' ? `${S.icon} -${f.dmg}` : f.k === 'status_cure' ? '✨ Curado' : f.k === 'status_skip' ? `${S.icon} ${S.name}` : `${S.icon} ${S.name}!`, f.k === 'status_cure' ? 'heal' : 'crit');
        s.classList.remove('st-' + (f.status || 'x')); void s.offsetWidth; s.classList.add('st-anim', 'st-' + (f.status || 'cure'));
      }
      if (f.k === 'status_dmg') { const box = arena.querySelector(`.hpbox[data-uid="${f.uid}"]`); if (box) setHp(box, f.hpAfter, f.maxHp); }
      await wait(650);
    } else if (f.k === 'buff' || f.k === 'debuff') {
      const s = sprite(f.uid);
      if (f.move) moveBanner(arena, f.k === 'buff' ? s : arena.querySelector('.mon-sprite:not([data-uid="' + f.uid + '"])'), f.move, f.k === 'buff' ? 'fighting' : 'dark');
      if (s) { s.classList.remove('buffed', 'debuffed'); void s.offsetWidth; s.classList.add(f.k === 'buff' ? 'buffed' : 'debuffed'); float(arena, s, f.k === 'buff' ? 'ATQ ▲' : 'ATQ ▼', f.k === 'buff' ? 'heal' : 'crit'); }
      await wait(800);
    } else if (f.k === 'heal') {
      const s = sprite(f.uid);
      if (f.move) moveBanner(arena, s, f.move, 'grass');
      if (s) float(arena, s, `+${f.amount}`, 'heal');
      setHp(box(f.uid), f.hpAfter, f.maxHp);
      await wait(600);
    } else if (f.k === 'faint') {
      const s = sprite(f.uid);
      if (s) s.classList.add('faint');
      await wait(700);
    } else if (f.k === 'switch') {
      // entrada com a Pokébola abrindo (o sprite novo aparece no próximo desenho)
      const side = f.side === 0 ? 'me' : f.side === 1 ? 'foe' : null;
      const spot = side && arena.querySelector(`.platform.${side}`);
      if (spot) {
        const pop = document.createElement('div');
        pop.className = 'fx-ballpop';
        const C = center(arena, spot);
        pop.style.cssText = `left:${C.x}px;top:${C.y - 30}px`;
        arena.appendChild(pop);
        setTimeout(() => pop.remove(), 700);
      }
      await wait(350);
    }
  }
}

export function outcomeText(state, lb, vid) {
  if (!lb) return '';
  const o = lb.outcome || {};
  const mySi = lb.sides.findIndex(s => s.kind === 'player' && s.pid === vid);
  switch (o.result) {
    case 'captured': return mySi === 0 ? '🎉 Captura realizada!' : 'Captura realizada.';
    case 'escaped': return '💨 O Pokémon fugiu.';
    case 'fled': return '🏃 Você fugiu da batalha.';
    case 'draw': return '⌛ Empate.';
    case 'win': return mySi < 0 ? 'Batalha encerrada.' : o.winner === mySi ? '🏆 Vitória!' : '💫 Derrota...';
    default: return 'Batalha encerrada.';
  }
}
