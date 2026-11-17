// 🎯 Missões fixadas e 🤝 companheiro (painel lateral da partida) + escolha de companheiro.
import { COMPANIONS, getCompanion } from '../../shared/data/companions.js';
import { esc, openModal, closeModal, bindActions } from './dom.js';
import { leaderUrl } from '../config.js';

export function companionImg(id, cls = 'comp-img') {
  const c = getCompanion(id);
  return c ? `<img class="${cls}" src="${leaderUrl(c.sprite)}" alt="${esc(c.name)}" title="${esc(c.name)} — ${esc(c.desc)}">` : '';
}

export function missionsHtml(s, p) {
  if (!p?.missions) return '';
  return `<div class="spread" style="margin-bottom:6px"><b>🎯 Missões</b><span class="tiny muted">${p.missionsDone || 0} completas</span></div>
    <div class="missions">${p.missions.map(m => {
      const pct = Math.min(100, (m.done / m.n) * 100);
      const comp = m.reward?.companion ? getCompanion(m.reward.companion) : null;
      const owned = comp && (p.companions || []).includes(m.reward.companion);
      return `<div class="mission"><div class="m-text">${esc(m.text)}</div>
        <div class="m-bar"><i style="width:${pct.toFixed(0)}%"></i><span>${m.done}/${m.n}</span></div>
        <div class="m-reward tiny">🎁 ${comp ? `${owned ? '400 de ouro' : `Companheiro ${esc(comp.name)} ${comp.icon}`}` : ''}${m.reward?.gold ? ` ${m.reward.gold} de ouro` : ''}${m.reward?.items ? ' itens' : ''}</div></div>`;
    }).join('') || '<p class="tiny muted">Todas as missões desta partida foram concluídas! 🏆</p>'}</div>`;
}

export function companionHtml(s, p, mine) {
  if (!p) return '';
  const c = getCompanion(p.companion);
  return `<div class="comp-box">${c ? `${companionImg(p.companion)}<div class="grow"><b>${c.icon} ${esc(c.name)}</b><div class="tiny muted">${esc(c.desc)}</div></div>`
    : '<div class="grow"><b>🤝 Sem companheiro</b><div class="tiny muted">Complete missões para ganhar companheiros com bônus.</div></div>'}
    ${mine && (p.companions || []).length ? '<button class="btn sm" data-act="comp-open">Trocar</button>' : ''}</div>`;
}

/** Modal para escolher o companheiro. owned: ids que a pessoa tem; current: equipado; onPick(id|null). */
export function openCompanionPicker({ owned = [], current = null, onPick, title = '🤝 Companheiros' }) {
  const html = `<p class="small muted">Ganhe companheiros completando missões nas partidas (eles ficam na sua conta). O companheiro anda ao lado do seu treinador e dá um bônus.</p>
    <div class="comp-grid">${Object.entries(COMPANIONS).map(([id, c]) => {
      const has = owned.includes(id);
      return `<div class="comp-card ${has ? '' : 'locked'} ${current === id ? 'on' : ''}">
        <img src="${leaderUrl(c.sprite)}" alt=""><b>${c.icon} ${esc(c.name)}</b><span class="tiny">${esc(c.desc)}</span>
        ${has ? `<button class="btn sm ${current === id ? '' : 'primary'}" data-act="pick-comp" data-id="${id}" ${current === id ? 'disabled' : ''}>${current === id ? 'Com você' : 'Levar'}</button>` : '<span class="tiny muted">🔒 ganhe em missões</span>'}</div>`;
    }).join('')}</div>
    ${current ? '<button class="btn ghost block" data-act="pick-comp" data-id="" style="margin-top:8px">Andar sem companheiro</button>' : ''}`;
  const ov = openModal('companions', title, html, { wide: true });
  bindActions(ov, { 'pick-comp': d => { closeModal('companions'); onPick(d.id || null); } });
}
