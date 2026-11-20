// 🎒 Mochila da conta: itens que sobraram das partidas (Pokébolas, Amuleto Shiny e TM).
// Dá para usar TM num Pokémon da Coleção, levar itens para partidas do modo Coleção e vender no Mercado.
import { ITEMS, bringLimit, BRING_BALLS_MAX, KEEP_KINDS } from '../../shared/data/items.js';
import { getSpecies } from '../../shared/data/pokemon.js';
import { api } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { itemUrl, monSprite } from '../config.js';
import { tmPickerHtml } from './common.js';
import { vfAttrs, vfBar, vfBind } from './vaultfilter.js';

const bagOf = profile => Object.entries(profile?.stats?.bag || {}).filter(([id, n]) => ITEMS[id] && n > 0);

export function openAccountBag(profile, onChange, openMarket) {
  let tmFor = null; // uid do Pokémon escolhido para o TM
  let picking = false;
  const render = () => {
    const items = bagOf(profile);
    const list = items.map(([id, n]) => `<div class="shop-item"><img src="${itemUrl(id)}" alt="${esc(ITEMS[id].name)}">
      <div><b>${esc(ITEMS[id].name)}</b> <span class="chip">×${n}</span><div class="tiny muted">${esc(ITEMS[id].desc)}</div></div>
      <div class="col" style="gap:4px">${id === 'tm' ? '<button class="btn sm primary" data-act="tm">💿 Usar</button>' : ''}
        <button class="btn sm" data-act="sell" data-item="${id}">🏷️ Vender</button></div></div>`).join('');
    let extra = '';
    if (picking && !tmFor) {
      const vault = profile?.vault || [];
      extra = `<div class="divider"></div><b>💿 Usar TM em qual Pokémon da Coleção?</b>
        <div class="vf-scope">${vfBar('tm-pick', { compact: true })}<div class="pick-grid" style="max-height:300px;overflow:auto">${vault.map((m, i) => `<div class="pick" ${vfAttrs(m, i)} data-act="tm-mon" data-uid="${esc(m.uid)}"><img src="${monSprite(m)}" alt=""><b>${esc(m.nick || getSpecies(m.sp)?.name)}</b><br><span class="tiny">Nv.${m.lvl}</span></div>`).join('')}</div></div>`;
    } else if (tmFor) {
      const m = (profile?.vault || []).find(x => x.uid === tmFor);
      extra = m ? `<div class="divider"></div>${tmPickerHtml(m)}<button class="btn sm" data-act="tm-back">← Outro Pokémon</button>` : '';
    }
    return `<p class="small muted">No fim de cada partida salva (Treino e Online), as <b>Pokébolas</b>, o <b>Amuleto Shiny</b> e os <b>TM</b> que sobraram vêm para cá.
      Poções, Revive, X Attack, doces, pedras e itens de tabuleiro são só da partida. Leve itens para partidas do modo 📦 Coleção (até ${BRING_BALLS_MAX} Pokébolas, 1 Amuleto e 3 TM) ou venda no 🏪 Mercado.</p>
      <div class="col">${list || '<p class="muted">Mochila vazia. Jogue partidas salvas para juntar itens!</p>'}</div>${extra}`;
  };
  const ov = openModal('abag', '🎒 Mochila da conta', render(), { wide: true, onClose: () => onChange && onChange(profile) });
  const redraw = () => { setModalBody('abag', render()); vfBind(document.getElementById('abag')); };
  bindActions(ov, {
    tm: () => { picking = true; tmFor = null; redraw(); },
    'tm-mon': d => { tmFor = d.uid; redraw(); },
    'tm-back': () => { tmFor = null; redraw(); },
    'tm-move': async d => {
      try {
        const m = (profile.vault || []).find(x => x.uid === tmFor);
        profile = (await api('profile', { op: 'use_tm', uid: tmFor, move: d.move })).profile;
        toast(`💿 ${getSpecies(m?.sp)?.name || 'Pokémon'} aprendeu o golpe novo!`, 'good');
        tmFor = null; picking = false; redraw(); onChange && onChange(profile);
      } catch (e) { toast(e.message, 'bad'); }
    },
    sell: d => { closeModal('abag'); openMarket && openMarket({ tab: 'sell', sellKind: 'items', item: d.item }); }
  });
}

/** Escolher os itens para levar (modo Coleção). onSave(bring). */
export function bringItemsPicker(profile, current, onSave) {
  const bag = Object.fromEntries(bagOf(profile));
  const sel = { ...(current || {}) };
  const balls = () => Object.entries(sel).reduce((a, [id, q]) => a + (ITEMS[id]?.kind === 'ball' ? q : 0), 0);
  const render = () => {
    const rows = Object.entries(bag).filter(([id]) => KEEP_KINDS.includes(ITEMS[id]?.kind)).map(([id, n]) => {
      const max = Math.min(n, bringLimit(id));
      const q = sel[id] || 0;
      const full = ITEMS[id].kind === 'ball' && balls() >= BRING_BALLS_MAX;
      return `<div class="shop-item"><img src="${itemUrl(id)}" alt=""><div><b>${esc(ITEMS[id].name)}</b> <span class="tiny muted">tem ${n} · leva até ${max}</span></div>
        <div class="row" style="gap:4px"><button class="btn sm" data-act="dec" data-item="${id}" ${q ? '' : 'disabled'}>−</button><b style="min-width:22px;text-align:center">${q}</b>
        <button class="btn sm" data-act="inc" data-item="${id}" ${q >= max || full ? 'disabled' : ''}>+</button></div></div>`;
    }).join('');
    return `<p class="small muted">Os itens saem da Mochila da conta quando a partida começa. O que sobrar volta no fim (no ☠️ Hardcore, quem cai perde).</p>
      <div class="col">${rows || '<p class="muted">Sua Mochila está vazia.</p>'}</div>
      <p class="tiny muted">Pokébolas: ${balls()}/${BRING_BALLS_MAX}</p>
      <div class="grid2"><button class="btn" data-act="clear">Não levar nada</button><button class="btn primary" data-act="ok">✅ Levar estes</button></div>`;
  };
  const ov = openModal('bring', '🎒 Levar itens da Mochila', render());
  bindActions(ov, {
    inc: d => { sel[d.item] = (sel[d.item] || 0) + 1; setModalBody('bring', render()); },
    dec: d => { sel[d.item] = Math.max(0, (sel[d.item] || 0) - 1); if (!sel[d.item]) delete sel[d.item]; setModalBody('bring', render()); },
    clear: () => { closeModal('bring'); onSave({}); },
    ok: () => { closeModal('bring'); onSave(sel); }
  });
}

export const bringSummary = b => {
  const e = Object.entries(b || {}).filter(([, q]) => q > 0);
  return e.length ? e.map(([id, q]) => `${q}x ${ITEMS[id]?.name || id}`).join(', ') : 'nada';
};
