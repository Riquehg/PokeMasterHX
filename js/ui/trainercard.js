// 🪪 Cartão do treinador (de outro jogador): abre ao clicar em alguém na lista Online / Amigos / Chat / Ranking.
import { esc, openModal, setModalBody, closeModal, toast } from './dom.js';
import { avatarUrl, monSprite, itemUrl, leaderUrl } from '../config.js';
import { api } from '../api.js';
import { getSpecies } from '../../shared/data/pokemon.js';
import { ITEMS } from '../../shared/data/items.js';
import { SERIES } from '../../shared/data/series.js';
import { COMPANIONS } from '../../shared/data/companions.js';
import { genderHtml, genderOf } from '../../shared/data/gender.js';
import { titleHtml } from './common.js';

const crestHtml = t => `<span class="se-crest" style="--cc:${esc(t?.color || '#3d7fe0')};width:24px;height:24px;font-size:13px">${esc(t?.crest || '⚽')}</span>`;

export function trainerCardHtml(c) {
  const sk = c.cosmetic?.skin;
  const s = c.serie && SERIES[c.serie.div];
  const comp = c.companion && COMPANIONS[c.companion];
  const team = (c.team || []).map(m => {
    const sp = getSpecies(m.sp);
    return `<div class="tcx-mon ${m.shiny ? 'shiny' : ''}" title="${esc(m.nick || sp?.name || '')}${m.held ? ' · segura ' + esc(ITEMS[m.held]?.name || '') : ''}">
      <img src="${monSprite(m)}" alt="" loading="lazy">${m.shiny ? '<i class="tcx-sh">✨</i>' : ''}${m.held ? `<img class="tcx-held" src="${itemUrl(m.held)}" alt="">` : ''}
      <b>${esc(m.nick || sp?.name || '?')}</b>${genderHtml(genderOf(m, sp))}<span>Nv.${m.lvl}</span></div>`;
  }).join('');
  return `<div class="tcx">
    <div class="tcx-head">
      <div class="av-wrap"><img class="avatar ${c.cosmetic?.frame ? 'frame-' + esc(c.cosmetic.frame) : ''}" src="${avatarUrl(c.avatar, sk)}" alt="">${c.megaBracelet ? `<img class="tc-mega" src="${itemUrl('mega_bracelet')}" alt="" title="🔗 Bracelete Mega">` : ''}</div>
      <div class="grow">
        <h3>${esc(c.name)} ${c.megaBracelet ? '<span class="chip purple">🔗 Mega</span>' : ''}</h3>
        ${titleHtml(c.cosmetic)}
        <div class="small"><span class="dot ${c.online ? 'on' : ''}" style="position:static;display:inline-block"></span> ${c.online ? 'online agora' : 'offline'}</div>
        <div class="tcx-chips">
          <span class="chip gold">⭐ ${c.points} pts</span>
          <span class="chip" style="border-color:${esc(c.elo?.color || '#888')}">${esc(c.elo?.icon || '')} ${esc(c.elo?.name || '')} (${c.rating})</span>
        </div>
      </div>
    </div>
    <div class="tcx-stats">
      <div><b>${c.dex}</b><span>📖 Pokédex</span></div>
      <div><b>${c.collection}</b><span>📦 Coleção</span></div>
      <div><b>${c.shinies}</b><span>✨ Shiny</span></div>
      <div><b>${c.megaDex}</b><span>💎 Megas</span></div>
      <div><b>${c.wins}</b><span>🏅 Vitórias</span></div>
      <div><b>${c.trophies}</b><span>🏆 Troféus</span></div>
    </div>
    ${s ? `<div class="tcx-liga" style="--sc:${s.color}">${crestHtml(c.serie.team)} <div class="grow"><b>${esc(c.serie.team?.name || 'Time sem nome')}</b><div class="tiny muted">⚽ Liga das Séries · ${s.icon} ${s.name} · ${c.serie.pts} pts</div></div></div>` : '<div class="tiny muted">⚽ Ainda não entrou na Liga das Séries.</div>'}
    ${comp ? `<div class="tcx-comp"><img src="${leaderUrl(comp.sprite)}" alt=""> <span class="small">Companheiro: <b>${esc(comp.name)}</b></span> <span class="tiny muted">· 🌾 Fazenda Nv. ${c.farmLvl}</span></div>` : ''}
    <h4 style="margin:10px 0 4px">${c.teamFrom === 'liga' ? '⚽ Time da Liga (defesa)' : '⭐ Destaques da Coleção'}</h4>
    <div class="tcx-team">${team || '<p class="muted small">Sem Pokémon ainda.</p>'}</div>
  </div>`;
}

export async function openTrainerCard(userId) {
  openModal('tcard', '🪪 Cartão do treinador', '<p class="muted center"><span class="spinner"></span></p>');
  try {
    const { card } = await api('feed', { op: 'card', userId });
    setModalBody('tcard', trainerCardHtml(card));
  } catch (e) {
    toast(e.message, 'bad');
    closeModal('tcard');
  }
}
