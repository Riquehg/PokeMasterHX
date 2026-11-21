// 🎁 Prêmio diário com sequência + fila de janelas do menu (diário → resultado da temporada → relatório da defesa).
import { DAILY_REWARDS, STREAK_BONUS_EVERY, dailyStatus } from '../../shared/data/daily.js';
import { ITEMS } from '../../shared/data/items.js';
import { api } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { itemUrl } from '../config.js';
const itemIcon = id => `<img class="dl-item" src="${itemUrl(id)}" alt="">`;

const rewardTxt = r => [r.gold ? `🪙 ${r.gold} ouro` : '', ...Object.entries(r.items || {}).map(([id, q]) => `${q}x ${ITEMS[id]?.name || id}`)].filter(Boolean).join(' + ');
const rewardIcon = r => r.gold ? '<span class="dl-ic">🪙</span>' : Object.keys(r.items || {}).map(id => itemIcon(id)).join('');

/** Espera uma janela fechar (para mostrar uma de cada vez). */
export const waitClosed = id => new Promise(res => { const t = setInterval(() => { if (!document.getElementById(id)) { clearInterval(t); res(); } }, 250); });

export function openDaily(profile, onChange) {
  let st = dailyStatus(profile?.stats?.login);
  const body = (claimed = null) => {
    const cur = claimed ? claimed.day : st.cycleDay;
    const streak = claimed ? claimed.streak : st.claimedToday ? st.streak : st.nextStreak - 1;
    return `<div class="dl-top"><span class="dl-fire">🔥</span><div><b>${streak} dia${streak === 1 ? '' : 's'} seguido${streak === 1 ? '' : 's'}</b>
        <div class="tiny muted">${st.broke && !claimed ? 'A sequência quebrou — recomeçando do dia 1.' : 'Entre todo dia: perdeu um dia, volta para o dia 1.'} Recorde: ${Math.max(profile?.stats?.login?.best || 0, streak)}.</div></div></div>
      <div class="dl-grid">${DAILY_REWARDS.map((r, i) => {
        const d = i + 1, done = d < cur || (d === cur && (claimed || st.claimedToday)), today = d === cur && !claimed && !st.claimedToday;
        return `<div class="dl-day ${done ? 'done' : ''} ${today ? 'today' : ''} ${d === 7 ? 'big' : ''}"><span class="tiny">Dia ${d}</span><div class="dl-icons">${rewardIcon(r)}</div><span class="tiny">${esc(rewardTxt(r))}</span>${done ? '<i class="dl-ok">✔</i>' : ''}</div>`;
      }).join('')}</div>
      <p class="tiny muted">A cada ${STREAK_BONUS_EVERY} dias seguidos: <b>Master Ball</b> de bônus. Itens vão para a 🎒 Mochila da conta.</p>
      ${claimed ? `<div class="dl-got">🎁 Você ganhou: <b>${esc(rewardTxt({ gold: claimed.gold, items: claimed.items }))}</b></div>`
        : st.canClaim ? '<button class="btn primary block" data-act="claim">🎁 Pegar prêmio de hoje</button>' : '<p class="center small muted">Prêmio de hoje já pego. Volte amanhã! ⏰</p>'}`;
  };
  const ov = openModal('daily', '🎁 Prêmio diário', body());
  bindActions(ov, {
    claim: async (d, el) => {
      el.disabled = true;
      try {
        const r = await api('profile', { op: 'daily_claim' });
        st = dailyStatus(r.profile?.stats?.login);
        setModalBody('daily', body(r.claimed));
        onChange && onChange(r.profile);
      } catch (e) { toast(e.message, 'bad'); el.disabled = false; }
    }
  });
  return ov;
}

/** Abre o diário sozinho uma vez por dia, se ainda não pegou. */
export async function autoDaily(profile, onChange) {
  if (!profile || !dailyStatus(profile.stats?.login).canClaim) return;
  openDaily(profile, onChange);
  await waitClosed('daily');
}

/** 🛡️ "Enquanto você estava fora": ataques recebidos pela defesa da Liga das Séries. */
export async function defenseReport(profile) {
  const S = profile?.stats?.serie;
  const since = S?.defSeen || 0;
  const list = (S?.log || []).filter(l => l.kind === 'def' && l.at > since);
  if (!list.length) return;
  const held = list.filter(l => l.win).length;
  openModal('defrep', '🛡️ Enquanto você estava fora', `<div class="center"><div class="dl-fire">🛡️</div>
      <b>${list.length} ataque${list.length > 1 ? 's' : ''} na sua defesa</b><div class="small">${held} segurado${held === 1 ? '' : 's'} (<b style="color:#8ff0bd">+${held} pts</b>) · ${list.length - held} perdido${list.length - held === 1 ? '' : 's'}</div></div>
    <div class="list" style="margin-top:8px">${list.slice(0, 10).map(l => `<div class="list-item small">${l.win ? '✅' : '❌'} <b>${esc(l.foe)}</b> — ${l.win ? 'sua defesa segurou' : 'venceu sua defesa'} <span class="tiny muted">${l.kos}x${l.lost} · ${new Date(l.at).toLocaleString('pt-BR')}</span></div>`).join('')}</div>
    <p class="tiny muted">Dá o troco na ⚽ Liga das Séries!</p>`);
  api('match', { op: 'serie_def_seen' }).catch(() => {});
  await waitClosed('defrep');
}
