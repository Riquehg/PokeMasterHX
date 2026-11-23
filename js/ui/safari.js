// 🌿 v50 — Zona Safári (cliente). Entrada com ouro; andar, encontrar, 🥎 Safari Ball / 🪨 Pedra / 🍓 Isca / 🏃 Fugir.
import { api } from '../api.js';
import { esc, toast, openModal, setModalBody, bindActions } from './dom.js';
import { monSprite, itemUrl } from '../config.js';
import { caughtBall } from '../owned.js';
import { getSpecies } from '../../shared/data/pokemon.js';
import { SAFARI_ZONES, RARITY, SAFARI_BALLS, SAFARI_STEPS } from '../../shared/data/safari.js';
import { confetti } from './fx.js';

export async function openSafari(profile, onProfile) {
  let data = null, busy = false, anim = '';
  const ov = openModal('safari', '🌿 Zona Safári', '<p class="muted">Carregando...</p>', { wide: true });
  const rarityCls = r => ({ c: 'gray', u: 'green', r: 'blue', v: 'gold' })[r] || '';
  const render = () => {
    const s = data?.session;
    if (!s) {
      const left = data.daily - data.usedToday;
      return `<p class="small muted">Pague a entrada com ouro e passeie pela Zona Safári: sem batalha — só você, ${SAFARI_BALLS} Safari Balls e ${SAFARI_STEPS} passos. Jogue 🪨 pedra (mais fácil de capturar, mas ele pode fugir) ou 🍓 isca (ele fica mais, mas é mais difícil). Pokémon raros de cada zona, shiny ×2. O que pegar vai direto para a 📦 Coleção.</p>
        <div class="row" style="gap:8px;flex-wrap:wrap"><span class="chip">🪙 Entrada: <b>${data.price}</b></span><span class="chip">🎟️ Hoje: ${data.usedToday}/${data.daily}</span><span class="chip">Você tem 🪙 <b>${data.gold ?? '?'}</b></span></div>
        <div class="sf-zones">${Object.entries(SAFARI_ZONES).map(([id, z]) => `<button class="sf-zone" data-act="enter" data-z="${id}" style="--bg:${z.bg}" ${left > 0 && (data.gold ?? 0) >= data.price ? '' : 'disabled'}>
          <span class="sf-zic">${z.icon}</span><b>${esc(z.name)}</b><span class="sf-stars">${z.pool.filter(([sp, r]) => (r === 'r' || r === 'v') && getSpecies(sp)).slice(0, 6).map(([sp]) => `<img src="${monSprite(sp)}" alt="" title="${esc(getSpecies(sp).name)}" loading="lazy">`).join('')}</span><span class="tiny">raros que podem aparecer</span></button>`).join('')}</div>
        ${left <= 0 ? '<p class="small">Você já usou as entradas de hoje. Volte amanhã! 🌙</p>' : ''}`;
    }
    const z = SAFARI_ZONES[s.zone];
    const e = s.enc;
    return `<div class="sf-scene ${anim}" style="--bg:${z.bg}">
        <div class="sf-hud"><span>${z.icon} ${esc(z.name)}</span><span>🥎 <b>${s.balls}</b></span><span>👣 <b>${s.steps}</b></span><span>📦 <b>${s.caught.length}</b></span></div>
        ${e ? `<div class="sf-enc"><img class="sf-mon ${e.shiny ? 'shiny' : ''} ${e.mood ? 'mood-' + e.mood : ''}" src="${monSprite({ sp: e.sp, shiny: e.shiny })}" alt="">
            <div class="sf-tag"><b>${caughtBall(e.sp, null, itemUrl('poke_ball'))}${esc(getSpecies(e.sp).name)}${e.shiny ? ' ✨' : ''}</b> <span class="tiny">Nv. ${e.lvl}</span> <span class="chip ${rarityCls(e.rarity)}">${RARITY[e.rarity].name}</span>${e.mood ? `<span class="chip">${e.mood === 'rock' ? '😠 bravo' : '😋 comendo'} (${e.moodLeft})</span>` : ''}</div>
            <div class="sf-meters"><div><span class="tiny">🥎 Captura</span><div class="sf-bar"><i style="width:${e.catchPct}%;background:#5cc96b"></i></div><b class="tiny">${e.catchPct}%</b></div>
              <div><span class="tiny">💨 Fuga</span><div class="sf-bar"><i style="width:${e.fleePct}%;background:#ff7a5a"></i></div><b class="tiny">${e.fleePct}%</b></div></div></div>`
          : s.over ? `<div class="sf-end"><h3>🏁 Fim do passeio!</h3><p>Você capturou <b>${s.caught.length}</b> Pokémon.</p></div>`
          : `<div class="sf-grass"><span>🌿</span><span>🌿</span><span>🌿</span></div>`}
      </div>
      <div class="sf-actions">${s.over ? '<button class="btn primary" data-act="leave">🚪 Sair da Zona Safári</button>'
        : e ? `<button class="btn primary" data-act="act" data-o="safari_ball" ${s.balls ? '' : 'disabled'}>🥎 Safari Ball</button><button class="btn" data-act="act" data-o="safari_rock">🪨 Pedra</button><button class="btn" data-act="act" data-o="safari_bait">🍓 Isca</button><button class="btn" data-act="act" data-o="safari_run">🏃 Fugir</button>`
        : `<button class="btn primary big" data-act="act" data-o="safari_step">👣 Andar pela grama</button><button class="btn sm" data-act="leave" title="Sai e perde o resto do passeio">🚪 Sair</button>`}</div>
      <div class="sf-log">${s.log.slice().reverse().map(l => `<div class="small">${esc(l)}</div>`).join('')}</div>
      ${s.caught.length ? `<div class="sf-caught"><span class="tiny muted">Capturados:</span>${s.caught.map(c => `<img src="${monSprite({ sp: c.sp, shiny: c.shiny })}" alt="" title="${esc(getSpecies(c.sp).name)} Nv. ${c.lvl}${c.shiny ? ' ✨' : ''}">`).join('')}</div>` : ''}`;
  };
  const draw = () => setModalBody('safari', render());
  const call = async body => {
    if (busy) return; busy = true;
    try {
      const r = await api('profile', body);
      data = r;
      if (r.profile) onProfile?.(r.profile);
      anim = r.caught ? 'caught' : body.op === 'safari_step' && r.session?.enc ? 'appear' : body.op === 'safari_rock' ? 'rock' : body.op === 'safari_bait' ? 'bait' : '';
      draw();
      if (r.caught) { confetti?.(); toast(`🎉 ${getSpecies(r.caught.sp).name}${r.caught.shiny ? ' ✨' : ''} capturado!`, 'good'); }
    } catch (e) { toast(e.message, 'bad'); }
    busy = false;
  };
  bindActions(ov, {
    enter: d => call({ op: 'safari_enter', zone: d.z }),
    act: d => call({ op: d.o }),
    leave: () => { if (data?.session && !data.session.over && !confirm('Sair agora? O resto do passeio é perdido.')) return; call({ op: 'safari_leave' }); }
  });
  try { data = await api('profile', { op: 'safari_get' }); draw(); } catch (e) { setModalBody('safari', `<p class="bad">${esc(e.message)}</p>`); }
}
