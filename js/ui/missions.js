// 🎯 Missões fixadas e 🤝 companheiro (painel lateral da partida) + escolha de companheiro.
import { COMPANIONS, getCompanion, bonusText, assistText, bondProgress, bondLevel, BOND_MAX, BOND_XP } from '../../shared/data/companions.js';
import { esc, openModal, closeModal, bindActions } from './dom.js';
import { leaderUrl } from '../config.js';

export function companionImg(id, cls = 'comp-img') {
  const c = getCompanion(id);
  return c ? `<img class="${cls}" src="${leaderUrl(c.sprite)}" alt="${esc(c.name)}" title="${esc(c.name)}">` : '';
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

/** Selo do nível de laço (❤️ quando íntimo). */
export function bondBadge(lvl) {
  return lvl >= BOND_MAX ? '<span class="bond-chip intimate" title="Íntimo: laço máximo">❤️ Íntimo</span>' : `<span class="bond-chip" title="Nível de laço">💞 Nv.${lvl}</span>`;
}

export function companionHtml(s, p, mine) {
  if (!p) return '';
  const c = getCompanion(p.companion);
  const lvl = Math.max(1, p.bond?.[p.companion] || 1);
  return `<div class="comp-box ${lvl >= BOND_MAX ? 'intimate' : ''}">${c ? `${companionImg(p.companion)}<div class="grow"><b>${c.icon} ${esc(c.name)}</b> ${bondBadge(lvl)}<div class="tiny muted">${esc(bonusText(p.companion, lvl))}</div>${lvl >= BOND_MAX ? `<div class="tiny" style="color:#ff9ccf">${esc(assistText(p.companion))}</div>` : ''}</div>`
    : '<div class="grow"><b>🤝 Sem companheiro</b><div class="tiny muted">Complete missões para ganhar companheiros com bônus.</div></div>'}
    ${mine && (p.companions || []).length ? '<button class="btn sm" data-act="comp-open">Trocar</button>' : ''}</div>`;
}

/** Modal para escolher o companheiro. owned: ids que a pessoa tem; current: equipado; onPick(id|null). */
/** bond: pontos de laço por companheiro (da conta) — ou levels: nível por companheiro (dentro da partida). */
export function openCompanionPicker({ owned = [], current = null, onPick, title = '🤝 Companheiros', bond = null, levels = null }) {
  const html = `<p class="small muted">Ganhe companheiros completando missões nas partidas (eles ficam na sua conta). O companheiro anda ao lado do seu treinador e dá um bônus.
      <b>💞 Laço:</b> cada partida salva com ele dá pontos de laço (mais se você vencer, capturar, ganhar insígnias e completar missões). O bônus cresce até o Nv. ${BOND_MAX}; no máximo ele fica <b>❤️ Íntimo</b> e às vezes entra na batalha com o Pokémon dele.</p>
    <div class="comp-grid">${Object.entries(COMPANIONS).map(([id, c]) => {
      const has = owned.includes(id);
      const pts = bond?.[id] || 0;
      const pr = bond ? bondProgress(pts) : { lvl: Math.max(1, levels?.[id] || 1), pct: 0, cur: 0, need: 0, max: (levels?.[id] || 1) >= BOND_MAX };
      return `<div class="comp-card ${has ? '' : 'locked'} ${current === id ? 'on' : ''} ${pr.lvl >= BOND_MAX ? 'intimate' : ''}">
        <img src="${leaderUrl(c.sprite)}" alt=""><b>${c.icon} ${esc(c.name)}</b>${has ? bondBadge(pr.lvl) : ''}
        ${has && bond && !pr.max ? `<div class="bond-bar" title="${pr.cur}/${pr.need} pontos de laço"><i style="width:${pr.pct}%"></i></div><span class="tiny muted">${pr.cur}/${pr.need} para o Nv.${pr.lvl + 1}</span>` : ''}
        <span class="tiny">${esc(bonusText(id, has ? pr.lvl : 1))}</span>
        <span class="tiny muted">No Nv.${BOND_MAX}: ${esc(bonusText(id, BOND_MAX))}</span>
        ${pr.lvl >= BOND_MAX ? `<span class="tiny" style="color:#ff9ccf">${esc(assistText(id))}</span>` : `<span class="tiny muted">❤️ Íntimo: ${esc(c.assist.move)} com ${esc(c.mon[0].toUpperCase() + c.mon.slice(1))}</span>`}
        ${has ? `<button class="btn sm ${current === id ? '' : 'primary'}" data-act="pick-comp" data-id="${id}" ${current === id ? 'disabled' : ''}>${current === id ? 'Com você' : 'Levar'}</button>` : '<span class="tiny muted">🔒 ganhe em missões</span>'}</div>`;
    }).join('')}</div>
    ${current ? '<button class="btn ghost block" data-act="pick-comp" data-id="" style="margin-top:8px">Andar sem companheiro</button>' : ''}`;
  const ov = openModal('companions', title, html, { wide: true });
  bindActions(ov, { 'pick-comp': d => { closeModal('companions'); onPick(d.id || null); } });
}
