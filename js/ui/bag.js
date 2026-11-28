// 🎒 Mochila da conta: itens que sobraram das partidas (Pokébolas, Amuleto Shiny e TM).
// Dá para usar TM num Pokémon da Coleção, levar itens para partidas do modo Coleção e vender no Mercado.
import { ITEMS, bringLimit, BRING_BALLS_MAX, KEEP_KINDS } from '../../shared/data/items.js';
import { getSpecies } from '../../shared/data/pokemon.js';
import { api } from '../api.js';
import { esc, toast, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { itemUrl, monSprite } from '../config.js';
import { tmPickerHtml, setTmSlot } from './common.js';
import { vfAttrs, vfBar, vfBind } from './vaultfilter.js';
import { MEGAS, BRACELET_ID, FRAGS_PER_STONE } from '../../shared/data/megas.js';
import { EVO_ITEMS } from '../../shared/data/items.js';
import { itemEvoTarget, levelEvoTarget } from '../../shared/data/evolution.js';
import { GMAX } from '../../shared/data/gmax.js';

// ✨ v64d: itens que dá para usar direto da Mochila num Pokémon da Coleção
const USE = {
  evo: { label: '✨ Usar', ok: (m, id) => !!itemEvoTarget(m, id), op: (uid, id) => ({ op: 'evo_item', uid, item: id }), q: id => `Qual Pokémon vai usar ${ITEMS[id].name}?`, none: 'Nenhum Pokémon da sua Coleção evolui com este item.' },
  gene_candy: { label: '🧬 Dar', ok: () => true, op: uid => ({ op: 'gene_candy', uid }), q: () => 'Dar o 🧬 Doce Genético para qual Pokémon? (os IVs são sorteados de novo)', confirm: true },
  rare_candy: { label: '🍬 Dar', ok: m => (m.lvl || 1) < 60, op: uid => ({ op: 'rare_candy', uid }), q: () => 'Dar o 🍬 Doce Raro (+1 nível) para qual Pokémon?' },
  max_soup: { label: '🍲 Dar', ok: m => !!GMAX[m.sp] && !m.gx, op: uid => ({ op: 'max_soup', uid }), q: () => 'Dar a 🍲 Sopa Max para qual Pokémon? (só quem tem forma Gigantamax)', none: 'Nenhum Pokémon da Coleção tem forma Gigantamax sem o Fator.' },
  gear: { label: '⚔️ Equipar', ok: () => true, op: (uid, id) => ({ op: 'hold_stone', uid, item: id }), q: id => `Quem vai segurar ${ITEMS[id].name}?` }
};
const useKind = id => (EVO_ITEMS[id] ? 'evo' : USE[id] ? id : ITEMS[id]?.kind === 'gear' ? 'gear' : null);

const bagOf = profile => Object.entries(profile?.stats?.bag || {}).filter(([id, n]) => ITEMS[id] && n > 0);

export function openAccountBag(profile, onChange, openMarket) {
  let tmFor = null; // uid do Pokémon escolhido para o TM
  let picking = false;
  let stoneFor = null; // 💎 Megapedra escolhida para equipar
  let useFor = null; // ✨ item escolhido para usar num Pokémon
  let trash = null; // 🗑️ v59: { id: qtd } escolhidos para jogar fora
  const trashN = () => Object.values(trash || {}).reduce((a, b) => a + b, 0);
  const render = () => {
    const items = bagOf(profile).sort((a, b) => (ITEMS[a[0]].kind === 'fragment') - (ITEMS[b[0]].kind === 'fragment'));
    const list = items.map(([id, n]) => `<div class="shop-item"><img src="${itemUrl(id)}" alt="${esc(ITEMS[id].name)}">
      <div><b>${esc(ITEMS[id].name)}</b> <span class="chip">×${n}</span><div class="tiny muted">${esc(ITEMS[id].desc)}</div></div>
      <div class="col" style="gap:4px">${id === 'tm' ? '<button class="btn sm primary" data-act="tm">💿 Usar</button>' : ''}${useKind(id) ? `<button class="btn sm green" data-act="use" data-item="${id}">${USE[useKind(id)].label}</button>` : ''}${ITEMS[id].kind === 'megastone' ? `<button class="btn sm purple" data-act="stone" data-item="${id}">💎 Equipar</button>` : ''}${ITEMS[id].kind === 'fragment' ? `<span class="tiny muted">${n}/${FRAGS_PER_STONE} p/ a pedra</span>` : ''}
        ${trash ? `<div class="row" style="gap:4px"><button class="btn sm" data-act="tr-dec" data-item="${id}" ${trash[id] ? '' : 'disabled'}>−</button><b style="min-width:22px;text-align:center">${trash[id] || 0}</b><button class="btn sm" data-act="tr-inc" data-item="${id}" ${(trash[id] || 0) >= n ? 'disabled' : ''}>+</button><button class="btn sm" data-act="tr-all" data-item="${id}">Tudo</button></div>`
          : `<button class="btn sm" data-act="sell" data-item="${id}">🏷️ Vender</button>`}</div></div>`).join('');
    let extra = '';
    // 💎 Megas: Bracelete e quem está segurando Megapedra
    const holders = (profile?.vault || []).filter(m => m.held && ITEMS[m.held]);
    const megaBox = `<div class="mega-box"><div class="row" style="gap:8px;align-items:center"><img class="bracelet-ic ${profile?.stats?.megaBracelet ? '' : 'off'}" src="${itemUrl(BRACELET_ID)}" alt="">
        <div><b>🔗 Bracelete Mega</b> ${profile?.stats?.megaBracelet ? '<span class="chip green">Você tem!</span>' : '<span class="chip">ainda não</span>'}
        <div class="tiny muted">Só cai em 💎 Mega Raids (raríssimo) e não pode ser trocado. Com ele e a Megapedra segurada, o Pokémon Mega Evolui 1 vez por batalha (salas Coleção com Megas e Liga Séries A/B).</div></div></div>
      <div class="row" style="gap:8px;align-items:center;margin-top:6px"><img class="bracelet-ic ${profile?.stats?.dynamaxBand ? '' : 'off'}" src="${itemUrl('dynamax_band')}" alt="">
        <div><b>🔴 Pulseira Dynamax</b> ${profile?.stats?.dynamaxBand ? '<span class="chip green">Você tem!</span>' : '<span class="chip">ainda não</span>'}
        <div class="tiny muted">Só cai em 🔴 Raids Gigantamax (raríssimo). Com ela, um Pokémon com o ✨ Fator Gigantamax fica gigante por 3 rodadas — no lugar da Mega (1 dos dois por batalha). ${(profile?.vault || []).filter(m => m.gx).length} Pokémon seus têm o Fator.</div></div></div>
      ${(() => { const n = profile?.stats?.bag?.legend_charm || 0, until = profile?.stats?.legendCharmUntil || 0, on = until > Date.now();
        return n || on ? `<div class="row" style="gap:8px;align-items:center;margin-top:6px"><span style="font-size:24px">🏵️</span><div class="grow"><b>Amuleto Lendário</b> ${on ? '<span class="chip green">ATIVO</span>' : ''} <span class="tiny muted">tem ${n}</span>
          <div class="tiny muted">${on ? `Sem limite de lendários até ${new Date(until).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.` : 'Ative para ficar 7 dias sem limite de lendários das casas Amarelas.'}${on && n ? ' Ativar outro soma +7 dias.' : ''}</div></div>
          ${n ? `<button class="btn sm green" data-act="charm-on">🏵️ Ativar 7 dias</button>` : ''}</div>` : ''; })()}
      ${holders.length ? `<div class="row wrap" style="gap:6px;margin-top:6px">${holders.map(m => `<span class="chip"><img class="chip-ic" src="${itemUrl(m.held)}" alt="">${esc(m.nick || getSpecies(m.sp)?.name)} <button class="btn sm x" data-act="unhold" data-uid="${esc(m.uid)}" title="Tirar a pedra (volta para a Mochila)">✕</button></span>`).join('')}</div>` : ''}</div>`;
    if (useFor) {
      const U = USE[useKind(useFor)];
      const vault = (profile?.vault || []).filter(m => U.ok(m, useFor));
      extra = `<div class="divider"></div><b>${esc(U.q(useFor))}</b>
        ${vault.length ? `<div class="vf-scope">${vfBar('use-pick', { compact: true })}<div class="pick-grid" style="max-height:300px;overflow:auto">${vault.map((m, i) => {
          const to = useKind(useFor) === 'evo' ? itemEvoTarget(m, useFor) : null;
          return `<div class="pick" ${vfAttrs(m, i)} data-act="use-mon" data-uid="${esc(m.uid)}"><img src="${monSprite(m)}" alt=""><b>${esc(m.nick || getSpecies(m.sp)?.name)}</b><br><span class="tiny">Nv.${m.lvl}${to ? ` → ${esc(getSpecies(to)?.name)}` : ''}${m.held && useKind(useFor) === 'gear' ? ` · segura ${esc(ITEMS[m.held]?.name || '')}` : ''}</span></div>`; }).join('')}</div></div>`
          : `<p class="muted small">${esc(U.none || 'Nenhum Pokémon pode usar agora.')}</p>`}
        <button class="btn sm" data-act="use-back">← Voltar</button>`;
    } else if (stoneFor) {
      const mg = MEGAS[ITEMS[stoneFor]?.mega];
      const vault = (profile?.vault || []).filter(m => m.sp === mg?.base);
      extra = `<div class="divider"></div><b>💎 Quem segura a ${esc(ITEMS[stoneFor]?.name)}?</b> <span class="tiny muted">(só ${esc(getSpecies(mg?.base)?.name || '')})</span>
        <div class="pick-grid" style="max-height:300px;overflow:auto">${vault.map(m => `<div class="pick" data-act="stone-mon" data-uid="${esc(m.uid)}"><img src="${monSprite(m)}" alt=""><b>${esc(m.nick || getSpecies(m.sp)?.name)}</b><br><span class="tiny">Nv.${m.lvl}${m.held ? ' · 💎' : ''}</span></div>`).join('') || `<p class="muted small">Você não tem ${esc(getSpecies(mg?.base)?.name || '')} na Coleção.</p>`}</div>
        <button class="btn sm" data-act="stone-back">← Voltar</button>`;
    } else if (picking && !tmFor) {
      const vault = profile?.vault || [];
      extra = `<div class="divider"></div><b>💿 Usar TM em qual Pokémon da Coleção?</b>
        <div class="vf-scope">${vfBar('tm-pick', { compact: true })}<div class="pick-grid" style="max-height:300px;overflow:auto">${vault.map((m, i) => `<div class="pick" ${vfAttrs(m, i)} data-act="tm-mon" data-uid="${esc(m.uid)}"><img src="${monSprite(m)}" alt=""><b>${esc(m.nick || getSpecies(m.sp)?.name)}</b><br><span class="tiny">Nv.${m.lvl}</span></div>`).join('')}</div></div>`;
    } else if (tmFor) {
      const m = (profile?.vault || []).find(x => x.uid === tmFor);
      extra = m ? `<div class="divider"></div>${tmPickerHtml(m)}<button class="btn sm" data-act="tm-back">← Outro Pokémon</button>` : '';
    }
    return `<p class="small muted">No fim de cada partida salva (Treino e Online), as <b>Pokébolas</b>, o <b>Amuleto Shiny</b>, os <b>TM</b> e os <b>💠 Fragmentos/💎 Megapedras</b> que sobraram vêm para cá.
      ✨ Pedras/itens de evolução, 🧬 Doce Genético, 🍬 Doce Raro, 🍲 Sopa Max e itens de batalha podem ser usados aqui mesmo (botão verde). Poções, Revive, X Attack e itens de tabuleiro são só da partida. Leve itens para partidas do modo 📦 Coleção (até ${BRING_BALLS_MAX} Pokébolas, 1 Amuleto e 3 TM) ou venda no 🏪 Mercado.</p>
      ${megaBox}${items.length ? (trash ? `<div class="bx-pick rel" style="position:sticky;top:0;z-index:2">🗑️ Escolha quanto jogar fora de cada item · <b>${trashN()}</b> item(ns)
        <button class="btn sm red" data-act="tr-ok" ${trashN() ? '' : 'disabled'}>🗑️ Jogar fora</button><button class="btn sm" data-act="tr-cancel">Cancelar</button></div>`
        : '<div class="row" style="justify-content:flex-end;margin:6px 0"><button class="btn sm" data-act="tr-start">🗑️ Jogar fora vários</button></div>') : ''}<div class="col">${list || '<p class="muted">Mochila vazia. Jogue partidas salvas para juntar itens!</p>'}</div>${extra}`;
  };
  const ov = openModal('abag', '🎒 Mochila da conta', render(), { wide: true, onClose: () => onChange && onChange(profile) });
  const redraw = () => { setModalBody('abag', render()); vfBind(document.getElementById('abag')); };
  const bagN = id => profile?.stats?.bag?.[id] || 0;
  bindActions(ov, {
    'tr-start': () => { trash = {}; redraw(); },
    'tr-cancel': () => { trash = null; redraw(); },
    'tr-inc': d => { trash[d.item] = Math.min(bagN(d.item), (trash[d.item] || 0) + 1); redraw(); },
    'tr-dec': d => { trash[d.item] = Math.max(0, (trash[d.item] || 0) - 1); if (!trash[d.item]) delete trash[d.item]; redraw(); },
    'tr-all': d => { trash[d.item] = bagN(d.item); redraw(); },
    'tr-ok': async () => {
      const n = trashN(); if (!n) return;
      if (!confirm(`Jogar fora ${n} item(ns)? Eles somem da Mochila e não voltam.`)) return;
      try { const r = await api('profile', { op: 'discard_items', items: trash }); profile = r.profile; trash = null; redraw(); onChange && onChange(profile); toast(`🗑️ ${r.discarded} item(ns) jogado(s) fora.`, 'good'); }
      catch (e) { toast(e.message, 'bad'); }
    },
    'charm-on': async () => {
      if (!confirm('Ativar 1 Amuleto Lendário? Fica 7 dias sem limite de lendários das casas Amarelas (o tempo corre mesmo sem jogar).')) return;
      try { profile = (await api('profile', { op: 'charm_activate' })).profile; toast('🏵️ Amuleto Lendário ativo por 7 dias!', 'good'); redraw(); onChange && onChange(profile); }
      catch (e) { toast(e.message, 'bad'); }
    },
    tm: () => { picking = true; tmFor = null; redraw(); },
    'tm-mon': d => { tmFor = d.uid; redraw(); },
    'tm-back': () => { tmFor = null; redraw(); },
    'tm-slot': d => { setTmSlot(d.slot); redraw(); },
    'tm-move': async d => {
      try {
        const m = (profile.vault || []).find(x => x.uid === tmFor);
        profile = (await api('profile', { op: 'use_tm', uid: tmFor, move: d.move, slot: Number(d.slot) })).profile;
        toast(`💿 ${getSpecies(m?.sp)?.name || 'Pokémon'} aprendeu o golpe novo!`, 'good');
        tmFor = null; picking = false; redraw(); onChange && onChange(profile);
      } catch (e) { toast(e.message, 'bad'); }
    },
    stone: d => { stoneFor = d.item; picking = false; tmFor = null; useFor = null; redraw(); },
    use: d => { useFor = d.item; stoneFor = null; picking = false; tmFor = null; redraw(); ov.querySelector('.divider')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'use-back': () => { useFor = null; redraw(); },
    'use-mon': async d => {
      const U = USE[useKind(useFor)];
      const m = (profile.vault || []).find(x => x.uid === d.uid);
      if (U.confirm && !confirm(`${U.q(useFor)}\n\n${m?.nick || getSpecies(m?.sp)?.name}: continuar?`)) return;
      try {
        const r = await api('profile', U.op(d.uid, useFor));
        profile = r.profile;
        const nm = m?.nick || getSpecies(m?.sp)?.name || 'Pokémon';
        toast(r.evolved ? `✨ ${r.evolved.from || nm} evoluiu para ${r.evolved.to || getSpecies(r.evolved)?.name || '?'}!` : r.leveled ? `🍬 ${nm} subiu para o Nv.${r.leveled}!` : r.gene ? `🧬 ${nm}: ${['hp', 'atk', 'def', 'spe'].map(k => `${({ hp: 'HP', atk: 'ATQ', def: 'DEF', spe: 'VEL' })[k]} ${r.gene.before[k]}→${r.gene.after[k]}`).join(' · ')}` : `✅ ${ITEMS[useFor]?.name} usado em ${nm}!`, 'good');
        if (!(profile?.stats?.bag?.[useFor] > 0)) useFor = null;
        redraw(); onChange && onChange(profile);
      } catch (e) { toast(e.message, 'bad'); }
    },
    'stone-back': () => { stoneFor = null; redraw(); },
    'stone-mon': async d => {
      try {
        profile = (await api('profile', { op: 'hold_stone', uid: d.uid, item: stoneFor })).profile;
        toast('💎 Megapedra equipada!', 'good');
        stoneFor = null; redraw(); onChange && onChange(profile);
      } catch (e) { toast(e.message, 'bad'); }
    },
    unhold: async d => {
      try {
        profile = (await api('profile', { op: 'hold_stone', uid: d.uid, item: null })).profile;
        toast('A Megapedra voltou para a Mochila.', 'good');
        redraw(); onChange && onChange(profile);
      } catch (e) { toast(e.message, 'bad'); }
    },
    sell: d => { closeModal('abag'); openMarket && openMarket({ tab: 'sell', sellKind: 'items', item: d.item }); }
  });
}

/** 🏵️ v58: situação do Amuleto Lendário (1 semana por ativação). */
function charmLine(profile) {
  const until = profile?.stats?.legendCharmUntil || 0;
  return until > Date.now() ? `<div class="tiny" style="color:#6be38a">🏵️ Ativo até ${new Date(until).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>` : '';
}

/** Escolher os itens para levar (modo Coleção). onSave(bring). */
export function bringItemsPicker(profile, current, onSave) {
  const bag = Object.fromEntries(bagOf(profile));
  const sel = { ...(current || {}) };
  const balls = () => Object.entries(sel).reduce((a, [id, q]) => a + (ITEMS[id]?.kind === 'ball' ? q : 0), 0);
  const render = () => {
    const rows = Object.entries(bag).filter(([id]) => KEEP_KINDS.includes(ITEMS[id]?.kind) && bringLimit(id) > 0).map(([id, n]) => {
      const max = Math.min(n, bringLimit(id));
      const q = sel[id] || 0;
      const full = (ITEMS[id].kind === 'ball' && balls() >= BRING_BALLS_MAX) || (ITEMS[id].kind === 'meal' && Object.keys(sel).some(k => k !== id && ITEMS[k]?.kind === 'meal')); // 🍽️ 1 comida por partida
      return `<div class="shop-item"><img src="${itemUrl(id)}" alt=""><div><b>${esc(ITEMS[id].name)}</b> <span class="tiny muted">tem ${n} · leva até ${max}</span>${ITEMS[id].kind === 'meal' || id === 'legend_charm' ? `<div class="tiny muted">${esc(ITEMS[id].desc)}</div>` : ''}${id === 'legend_charm' ? charmLine(profile) : ''}</div>
        <div class="row" style="gap:4px"><button class="btn sm" data-act="dec" data-item="${id}" ${q ? '' : 'disabled'}>−</button><b style="min-width:22px;text-align:center">${q}</b>
        <button class="btn sm" data-act="inc" data-item="${id}" ${q >= max || full ? 'disabled' : ''}>+</button></div></div>`;
    }).join('');
    return `<p class="small muted">Os itens saem da Mochila da conta quando a partida começa. O que sobrar volta no fim (no ☠️ Hardcore, quem cai perde).</p>
      <div class="col">${rows || '<p class="muted">Sua Mochila está vazia.</p>'}</div>
      <p class="tiny muted">Pokébolas: ${balls()}/${BRING_BALLS_MAX} · 🍽️ comida: 1 por partida (é comida quando a partida começa)</p>
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
