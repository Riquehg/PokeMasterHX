// 🔥 Tela da Raid em grupo (entrar, lutar, capturar) e da fase de captura da Raid solo.
import { getSpecies } from '../../shared/data/pokemon.js';
import { ITEMS } from '../../shared/data/items.js';
import { monMoves } from '../../shared/data/moves.js';
import { maxHpOf } from '../../shared/rules/monsters.js';
import { canUse } from '../../shared/rules/helpers.js';
import { against, TYPE_COLORS } from '../../shared/rules/types.js';
import { raidWaiting, raidBallChance } from '../../shared/rules/raid.js';
import { esc, openModal, closeModal, bindActions } from './dom.js';
import { monSprite, itemUrl, typeLabel } from '../config.js';

function bossBar(r) {
  const max = maxHpOf(r.boss);
  const pct = Math.max(0, (r.boss.hp / max) * 100);
  return `<div class="raid-boss"><img src="${monSprite(r.boss)}" alt="" class="${r.stage === 'catch' ? 'tired' : ''}">
    <div class="grow"><b>${esc(getSpecies(r.boss.sp).name)}${r.boss.shiny ? ' ✨' : ''}</b> <span class="tiny">Nv.${r.boss.lvl}</span>
      <div class="raid-hp"><i style="width:${pct.toFixed(1)}%"></i></div><div class="tiny">${Math.max(0, r.boss.hp)}/${max} HP${r.bossStage < 0 ? ` · ATQ ▼${-r.bossStage}` : ''}</div></div></div>`;
}

export function raidHtml(s, vid) {
  const r = s.raid;
  const me = s.players.find(p => p.id === vid);
  const waiting = raidWaiting(s);
  const myTurn = me && waiting.includes(vid);
  const name = id => s.players.find(p => p.id === id)?.name || '?';
  const party = r.party.length ? `<div class="raid-party">${r.party.map(x => {
    const p = s.players.find(y => y.id === x.pid);
    const m = x.uid ? p?.team.find(t => t.uid === x.uid) : null;
    return `<div class="raid-member ${m && m.hp <= 0 ? 'ko' : ''} ${waiting.includes(x.pid) ? 'wait' : ''}">${m ? `<img src="${monSprite(m)}" alt="">` : ''}
      <div><b>${esc(p?.name || '?')}</b>${m ? `<div class="tiny">${esc(getSpecies(m.sp).name)} ${Math.max(0, m.hp)}/${maxHpOf(m)}</div>` : ''}<div class="tiny muted">dano: ${x.dmg}</div></div></div>`;
  }).join('')}</div>` : '';
  let controls = '';
  if (r.stage === 'join') {
    if (myTurn) {
      const opts = me.team.filter(m => m.hp > 0 && canUse(me, m));
      controls = `<p class="small"><b>Escolha 1 Pokémon para entrar na Raid</b> (o HP do lendário cresce com o grupo):</p>
        <div class="subpick">${opts.map(m => `<button class="btn sm pickbtn" data-act="raid-join" data-uid="${esc(m.uid)}"><img src="${monSprite(m)}" alt="">${esc(getSpecies(m.sp).name)} Nv.${m.lvl}
          <span class="tiny">${monMoves(m).map(mv => esc(mv.name)).join(' / ')}</span></button>`).join('')}</div>
        <button class="btn ghost sm" data-act="raid-decline">Ficar de fora</button>`;
    } else controls = `<p class="muted center"><span class="spinner"></span> Aguardando: ${waiting.map(name).map(esc).join(', ') || '—'}</p>`;
  } else if (r.stage === 'fight') {
    const x = r.party.find(y => y.pid === vid);
    const m = x && me.team.find(t => t.uid === x.uid);
    if (myTurn && m) {
      const bossTypes = getSpecies(r.boss.sp).types;
      controls = `<div class="move-grid">${monMoves(m).map((mv, i) => {
        const dmg = mv.kind === 'dmg' || mv.kind === 'drain';
        const mult = dmg ? against(mv.type, bossTypes) : 1;
        return `<button class="btn move-btn" style="--tc:${TYPE_COLORS[mv.type]}" data-act="raid-attack" data-slot="${i}"><span class="mv-name">${esc(mv.name)}</span>
          <span class="mv-meta">${esc(typeLabel(mv.type))}${dmg ? ` · ${Math.round((mv.power || 1) * 100)}%` : ''}</span>${dmg ? `<span class="mv-tag ${mult >= 2 ? 'good' : mult < 1 ? 'bad' : ''}">${mult >= 2 ? 'Super efetivo' : mult < 1 ? 'Pouco efetivo' : 'Normal'}</span>` : `<span class="mv-tag sup">${esc(mv.desc)}</span>`}</button>`;
      }).join('')}</div>`;
    } else controls = `<p class="muted center"><span class="spinner"></span> ${x && m?.hp <= 0 ? 'Seu Pokémon desmaiou — torça pelo grupo!' : `Aguardando: ${waiting.map(name).map(esc).join(', ')}`}</p>`;
  } else if (r.stage === 'catch') {
    if (myTurn) {
      const balls = Object.entries(me.items).filter(([id, n]) => ITEMS[id]?.kind === 'ball' && n > 0);
      controls = `<p class="small"><b>Sua vez de tentar capturar!</b> Escolha a Pokébola:</p>
        <div class="subpick">${balls.map(([id, n]) => `<button class="btn sm pickbtn" data-act="raid-catch" data-ball="${id}"><img src="${itemUrl(id)}" alt="">${esc(ITEMS[id].name)} ×${n}
          <span class="tiny">${Math.round(raidBallChance(me, id) * 100)}%</span></button>`).join('') || '<p class="muted small">Você não tem Pokébolas.</p>'}</div>
        <button class="btn ghost sm" data-act="raid-skip">Passar a vez</button>`;
    } else controls = `<p class="muted center"><span class="spinner"></span> ${esc(name(waiting[0]))} está tentando capturar...</p>`;
  }
  return `${bossBar(r)}${party}${controls}<div class="battle-log" id="raid-log">${r.log.slice(-8).map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
}

/** Abre/atualiza a janela da Raid. act(action). */
export function renderRaid(s, vid, act) {
  const r = s.raid;
  if (!r) { closeModal('raid'); return; }
  const title = r.group ? '🔥 RAID EM GRUPO' : '🔥 Raid — captura';
  const html = raidHtml(s, vid);
  const open = document.getElementById('raid');
  if (open) open.querySelector('.body').innerHTML = html;
  else {
    const ov = openModal('raid', title, html, { wide: true, closable: false });
    ov.querySelector('.modal').classList.add('raid-modal');
    bindActions(ov, {
      'raid-join': d => act({ type: 'raid', op: 'join', uid: d.uid }),
      'raid-decline': () => act({ type: 'raid', op: 'decline' }),
      'raid-attack': d => act({ type: 'raid', op: 'attack', slot: Number(d.slot) }),
      'raid-catch': d => act({ type: 'raid', op: 'catch', ball: d.ball }),
      'raid-skip': () => act({ type: 'raid', op: 'skip' })
    });
  }
  const lg = document.getElementById('raid-log');
  if (lg) lg.scrollTop = lg.scrollHeight;
}
