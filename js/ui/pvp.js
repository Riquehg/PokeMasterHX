// ⚔️ v69: Duelo PVP — chamar todos os online para um duelo 1x1 (aviso no canto da tela) ou aceitar o chamado de alguém.
// O time é escolhido sozinho: o salvo neste aparelho (pmhx_pvp_team) ou os 6 mais fortes da Coleção.
// Ao terminar o duelo, os dois voltam para onde estavam (partida, sala ou menu).
import { getSpecies } from '../../shared/data/pokemon.js';
import { DUEL_LEVEL_CAP } from '../../shared/data/cup.js';
import { api, net } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { monSprite, avatarUrl } from '../config.js';

let ctx = null;
let calling = null; // { until }
let pollT = null, tickT = null;

const store = {
  get team() { try { return JSON.parse(localStorage.getItem('pmhx_pvp_team') || '[]'); } catch { return []; } },
  set team(v) { try { localStorage.setItem('pmhx_pvp_team', JSON.stringify(v)); } catch { /* ok */ } },
  get megas() { try { return localStorage.getItem('pmhx_duel_megas') === '1'; } catch { return false; } },
  set megas(v) { try { localStorage.setItem('pmhx_duel_megas', v ? '1' : '0'); } catch { /* ok */ } }
};
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function initPvp(c) {
  ctx = c;
  window.addEventListener('pmhx-duel-accept', e => acceptCall(e.detail));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && calling) poll(); });
}

/** Entrar no duelo guardando onde o jogador estava. */
function enterDuel(match) {
  stopCalling();
  closeModal('pvp');
  document.querySelectorAll('.feed-banner.duel_call').forEach(b => b.remove());
  if (!ctx.where?.duel) ctx.returnTo = { ...ctx.where };
  toast('⚔️ Duelo começando!', 'good');
  ctx.openOnline(match.id);
}

export async function acceptCall(matchId) {
  if (!ctx || !net.user) return;
  const why = ctx.busy();
  if (why) return toast(why, 'bad');
  try {
    const r = await api('match', { op: 'duel_accept', matchId, teamUids: store.team });
    enterDuel(r.match);
  } catch (e) { toast(e.message, 'bad'); }
}

// ---------------------------------------------------------------- chamando (o chip fica no canto, em qualquer tela)
function chip() {
  let el = document.getElementById('pvp-chip');
  if (!calling) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'pvp-chip';
    el.innerHTML = '<span class="pc-ic">⚔️</span><span class="pc-t"></span><button class="btn sm" data-x>Cancelar</button>';
    el.querySelector('[data-x]').onclick = cancelCall;
    document.body.appendChild(el);
  }
  el.querySelector('.pc-t').textContent = `Procurando duelo… ${mmss(calling.until - Date.now())}`;
}
async function poll() {
  if (!calling || document.hidden) return;
  try {
    const r = await api('match', { op: 'duel_status' });
    if (r.match?.status === 'playing') return enterDuel(r.match);
    if (!r.calling) { stopCalling(); toast('⌛ Ninguém aceitou o duelo a tempo. Tente de novo mais tarde.', ''); }
  } catch { /* tenta de novo */ }
}
function startCalling(until) {
  stopCalling();
  calling = { until };
  chip();
  pollT = setInterval(poll, 4000); // 💸 só com a aba à vista (poll confere)
  tickT = setInterval(() => { if (calling && Date.now() > calling.until + 5000) { poll(); } chip(); }, 1000);
}
function stopCalling() { calling = null; clearInterval(pollT); clearInterval(tickT); pollT = tickT = null; chip(); }
async function cancelCall() {
  stopCalling();
  try { await api('match', { op: 'duel_cancel' }); } catch { /* ok */ }
}

// ---------------------------------------------------------------- tela do Duelo PVP
export function openPvp(c, profile) {
  ctx = ctx || c;
  const vault = [...(profile?.vault || [])].sort((a, b) => b.lvl - a.lvl);
  let picks = store.team.filter(u => vault.some(v => v.uid === u));
  let megas = store.megas, calls = null, picking = false;
  const auto = () => (picks.length ? picks : vault.slice(0, 6).map(v => v.uid));
  const teamRow = () => auto().map(u => vault.find(v => v.uid === u)).filter(Boolean)
    .map(m => `<span class="pvp-mon"><img src="${monSprite(m)}" alt=""><span class="tiny">${esc(getSpecies(m.sp)?.name || '')} ${Math.min(m.lvl, DUEL_LEVEL_CAP)}${megas && String(m.held || '').startsWith('ms_') ? ' 💎' : ''}${megas && m.gx ? ' 🔴' : ''}</span></span>`).join('');
  const view = () => {
    if (picking) return `<div class="small"><b>Escolha até 6</b> — ${picks.length}/6 · vazio = os 6 mais fortes</div>
      <div class="trade-mons" style="max-height:340px">${vault.map(m => `<button type="button" class="trade-mon ${picks.includes(m.uid) ? 'on' : ''}" data-act="pick" data-uid="${esc(m.uid)}">
        <img src="${monSprite(m)}" alt=""><span>${esc(getSpecies(m.sp)?.name)}${m.shiny ? ' ✨' : ''}</span><span class="tiny">Nv.${Math.min(m.lvl, DUEL_LEVEL_CAP)} ${picks.includes(m.uid) ? `#${picks.indexOf(m.uid) + 1}` : ''}</span></button>`).join('')}</div>
      <button class="btn primary block" data-act="pick-ok" style="margin-top:8px">✔️ Salvar time</button>`;
    const others = calls === null ? '<p class="tiny muted"><span class="spinner"></span> Procurando desafios…</p>'
      : calls.length ? calls.map(c => `<div class="pvp-call"><img src="${avatarUrl(c.avatar, c.skin)}" alt=""><div class="grow"><b>${esc(c.name)}</b> <span class="tiny muted">Elo ${c.rating}</span>
          <div class="tiny">${c.megas ? '💎🔴 Com Mega/Gigantamax' : 'Sem Mega/Gigantamax'} · expira em ${mmss(c.until - Date.now())}</div></div>
          <button class="btn sm green" data-act="acc" data-id="${esc(c.matchId)}">⚔️ Aceitar</button></div>`).join('')
        : '<p class="tiny muted">Ninguém chamando agora. Chame você!</p>';
    return `<p class="small muted">Duelo 1 contra 1 com o time da Coleção (Nv. máx ${DUEL_LEVEL_CAP}). Todo mundo online recebe um aviso no canto da tela; o primeiro que aceitar duela com você. Vale <b>Elo</b>. Ao terminar, os dois voltam para onde estavam.</p>
      <h4 style="margin:8px 0 4px">🧑‍🤝‍🧑 Seu time ${picks.length ? '' : '<span class="tiny muted">(os 6 mais fortes)</span>'}</h4>
      <div class="pvp-team">${teamRow() || '<span class="muted small">Coleção vazia.</span>'}</div>
      <button class="btn sm" data-act="team">✏️ Escolher o time</button>
      <div class="row wrap" style="gap:6px;margin-top:8px;align-items:center"><span class="small"><b>Regra:</b></span>
        <button class="btn sm ${megas ? '' : 'primary'}" data-act="mg" data-v="0">Sem Mega/Gigantamax</button><button class="btn sm ${megas ? 'primary' : ''}" data-act="mg" data-v="1">💎🔴 Com Mega e Gigantamax</button></div>
      ${calling ? `<div class="pvp-wait"><span class="queue-pulse" style="font-size:28px">⚔️</span><div class="grow"><b>Chamando todos…</b><div class="tiny muted">Pode fechar esta janela e continuar jogando — quando alguém aceitar, o duelo abre sozinho.</div></div><button class="btn sm" data-act="cancel">Cancelar</button></div>`
        : `<button class="btn primary block" data-act="call" ${vault.length ? '' : 'disabled'} style="margin-top:10px">📣 Chamar todos para um duelo</button>`}
      <h4 style="margin:12px 0 4px">📨 Desafios abertos</h4>${others}`;
  };
  const ov = openModal('pvp', '⚔️ Duelo PVP', view(), { wide: true });
  const redraw = () => setModalBody('pvp', view());
  const load = async () => { try { calls = (await api('match', { op: 'duel_calls' })).calls; } catch { calls = []; } if (document.getElementById('pvp')) redraw(); };
  load();
  bindActions(ov, {
    team: () => { picking = true; redraw(); },
    pick: d => { const i = picks.indexOf(d.uid); if (i >= 0) picks.splice(i, 1); else if (picks.length < 6) picks.push(d.uid); redraw(); },
    'pick-ok': () => { store.team = picks; picking = false; redraw(); },
    mg: d => { megas = d.v === '1'; store.megas = megas; redraw(); },
    call: async () => {
      try {
        const r = await api('match', { op: 'duel_call', megas, teamUids: picks });
        startCalling(r.until);
        toast('📣 Chamado enviado para todos os online!', 'good');
        redraw();
      } catch (e) { toast(e.message, 'bad'); }
    },
    cancel: async () => { await cancelCall(); redraw(); },
    acc: d => acceptCall(d.id)
  });
}

/** Aviso no canto (vem do feed em tempo real). */
export function duelCallBanner(ev, box) {
  const d = ev.data || {};
  if (!net.user || d.uid === net.user.id || !(d.until > Date.now()) || document.body.classList.contains('in-duel')) return null;
  const el = document.createElement('div');
  el.className = 'feed-banner duel_call';
  el.innerHTML = `<img src="${avatarUrl(d.avatar, d.skin)}" alt=""><div class="grow"><div class="fb-kick">⚔️ DUELO PVP</div><div class="fb-text"><b>${esc(d.name)}</b> está procurando duelo${d.megas ? ' (💎🔴 Mega/Gigantamax)' : ''}. Aceita?</div>
    <div class="row" style="gap:6px;margin-top:4px"><button class="btn sm green" data-y>⚔️ Aceitar</button><button class="btn sm" data-n>Agora não</button></div></div>`;
  el.querySelector('[data-y]').onclick = () => { el.remove(); window.dispatchEvent(new CustomEvent('pmhx-duel-accept', { detail: d.matchId })); };
  el.querySelector('[data-n]').onclick = () => el.remove();
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, Math.min(30000, d.until - Date.now()));
  return el;
}
