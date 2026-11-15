// Janelas da partida: loja, PC, mochila, voo, Pokédex, ficha do treinador, detalhes do Pokémon e regras.
import { SPECIES_LIST, getSpecies } from '../../shared/data/pokemon.js';
import { getSpace } from '../../shared/data/board.js';
import { ITEMS, shopFor } from '../../shared/data/items.js';
import { GYMS } from '../../shared/data/trainers.js';
import { monView, xpToNext } from '../../shared/rules/monsters.js';
import { against, TYPES } from '../../shared/rules/types.js';
import { score } from '../../shared/engine.js';
import { esc, openModal, closeModal, setModalBody, bindActions } from './dom.js';
import { monSprite, itemUrl, badgeUrl, typeLabel } from '../config.js';
import { monCard, typeChips, avatarImg, playerColor, hpBar } from './common.js';

const me = session => session.state.players.find(p => p.id === session.viewerId());

function refreshOnChange(session, id, render) {
  const off = session.on(() => { if (document.getElementById(id)) setModalBody(id, render()); else off(); });
}

// ---------------------------------------------------------------- loja
export function openShop(session, act) {
  const render = () => {
    const p = me(session);
    const sp = getSpace(p.pos);
    const offers = shopFor(sp.tier);
    return `<p class="small muted">Itens disponíveis numa cidade de tier ${sp.tier}. Cidades mais avançadas vendem itens melhores.</p>
      <div class="spread"><b>🪙 ${p.gold} de ouro</b></div>
      <div class="col" style="margin-top:8px">${offers.map(o => `
        <div class="shop-item"><img src="${itemUrl(o.id)}" alt="${esc(o.name)}">
          <div><b>${esc(o.name)}</b> <span class="chip gold">${o.price} 🪙</span> ${p.items[o.id] ? `<span class="chip">tem ${p.items[o.id]}</span>` : ''}<div class="tiny muted">${esc(o.desc)}</div></div>
          <div class="row">${o.kind === 'charm' ? '' : `<button class="btn sm" data-act="buy" data-item="${o.id}" data-qty="5" ${p.gold < o.price * 5 ? 'disabled' : ''}>×5</button>`}
            <button class="btn sm primary" data-act="buy" data-item="${o.id}" data-qty="1" ${p.gold < o.price ? 'disabled' : ''}>Comprar</button></div>
        </div>`).join('')}</div>`;
  };
  const ov = openModal('shop', '🛒 Poké Mart', render(), { wide: true });
  bindActions(ov, { buy: d => act({ type: 'city', op: 'buy', item: d.item, qty: Number(d.qty) }) });
  refreshOnChange(session, 'shop', render);
}

// ---------------------------------------------------------------- PC
export function openPC(session, act) {
  let sel = null; // { from: 'team'|'box', index }
  const render = () => {
    const p = me(session);
    return `<p class="small muted">Clique em um Pokémon da equipe e depois em um do PC para trocar. Ou use os botões para guardar/retirar.</p>
      <b>Equipe (${p.team.length}/6)</b>
      <div class="team" style="grid-template-columns:repeat(6,1fr);margin:6px 0 10px">${p.team.map((m, i) => monCard(m, { index: i, act: 'pick-team', extra: `<button class="btn sm" data-act="deposit" data-index="${i}" ${p.team.length <= 1 ? 'disabled' : ''}>Guardar</button>` })).join('')}</div>
      <b>PC (${p.box.length})</b>
      <div class="team" style="grid-template-columns:repeat(auto-fill,minmax(96px,1fr));margin-top:6px">${p.box.map((m, i) => monCard(m, { index: i, act: 'pick-box', extra: `<div class="row" style="justify-content:center;gap:3px"><button class="btn sm" data-act="withdraw" data-index="${i}" ${p.team.length >= 6 ? 'disabled' : ''}>Retirar</button><button class="btn sm red" data-act="release" data-index="${i}" title="Soltar">✕</button></div>` })).join('') || '<p class="muted small">Vazio. Pokémon capturados com a equipe cheia vêm para cá.</p>'}</div>
      ${sel ? `<p class="small" style="margin-top:8px">Selecionado: <b>${esc(getSpecies((sel.from === 'team' ? p.team : p.box)[sel.index].sp).name)}</b> — agora clique no outro lado para trocar.</p>` : ''}`;
  };
  const ov = openModal('pc', '💻 PC de Armazenamento', render(), { wide: true });
  const trySwap = () => {
    if (sel?.team !== undefined && sel?.box !== undefined) {
      const { team, box } = sel; sel = null;
      act({ type: 'pc', op: 'swap', team, box });
    } else setModalBody('pc', render());
  };
  bindActions(ov, {
    'pick-team': d => { sel = { ...(sel || {}), from: 'team', index: Number(d.index), team: Number(d.index) }; trySwap(); },
    'pick-box': d => { sel = { ...(sel || {}), from: 'box', index: Number(d.index), box: Number(d.index) }; trySwap(); },
    deposit: d => act({ type: 'pc', op: 'deposit', team: Number(d.index) }),
    withdraw: d => act({ type: 'pc', op: 'withdraw', box: Number(d.index) }),
    release: d => { if (confirm('Soltar este Pokémon na natureza? (o Professor te dá um pouco de ouro)')) act({ type: 'pc', op: 'release', box: Number(d.index) }); }
  });
  refreshOnChange(session, 'pc', render);
}

// ---------------------------------------------------------------- mochila
const USABLE = ['heal', 'revive', 'candy', 'stone', 'move_bonus', 'escape', 'fly'];
export function openBag(session, act) {
  let pending = null; // item aguardando escolha de alvo
  const render = () => {
    const p = me(session);
    const entries = Object.entries(p.items).filter(([, n]) => n > 0);
    const list = entries.map(([id, n]) => {
      const it = ITEMS[id];
      if (!it) return '';
      const canUse = USABLE.includes(it.kind);
      return `<div class="shop-item"><img src="${itemUrl(id)}" alt="${esc(it.name)}">
        <div><b>${esc(it.name)}</b> <span class="chip">×${n}</span><div class="tiny muted">${esc(it.desc)}</div></div>
        <div>${canUse ? `<button class="btn sm primary" data-act="use" data-item="${id}">Usar</button>` : it.kind === 'ball' ? '<span class="tiny muted">em batalha</span>' : it.kind === 'boost' ? '<span class="tiny muted">em batalha</span>' : '<span class="tiny muted">passivo</span>'}</div></div>`;
    }).join('');
    const target = pending ? `<div class="divider"></div><b>Usar ${esc(ITEMS[pending].name)} em:</b>
      <div class="team" style="grid-template-columns:repeat(6,1fr);margin-top:6px">${p.team.map((m, i) => monCard(m, { index: i, act: 'target' })).join('')}</div>` : '';
    return `<p class="small muted">Itens fora de batalha só podem ser usados na sua vez.</p><div class="col">${list || '<p class="muted">Mochila vazia.</p>'}</div>${target}`;
  };
  const ov = openModal('bag', '🎒 Mochila', render(), { wide: true });
  bindActions(ov, {
    use: d => {
      const it = ITEMS[d.item];
      if (['heal', 'revive', 'candy', 'stone'].includes(it.kind)) { pending = d.item; setModalBody('bag', render()); return; }
      if (it.kind === 'fly') { closeModal('bag'); openFly(session, act); return; }
      act({ type: 'use_item', item: d.item });
    },
    target: d => { const item = pending; pending = null; act({ type: 'use_item', item, index: Number(d.index) }); }
  });
  refreshOnChange(session, 'bag', render);
}

export function openFly(session, act) {
  const p = me(session);
  const cities = p.visited.filter(id => id !== p.pos).map(getSpace).filter(s => s && s.type === 'city');
  const ov = openModal('fly', '🕊️ Voar para...', cities.length
    ? `<div class="col">${cities.map(c => `<button class="btn" data-act="go" data-to="${c.id}">${esc(c.name)}</button>`).join('')}</div>`
    : '<p class="muted">Você ainda não visitou outras cidades.</p>');
  bindActions(ov, { go: d => { closeModal('fly'); act({ type: 'use_item', item: 'fly', to: Number(d.to) }); } });
}

// ---------------------------------------------------------------- Pokédex
export function openDex(session, extraCaught = []) {
  const p = session ? me(session) : null;
  const seen = new Set(p?.seen || []);
  const caught = new Set([...(p?.caught || []), ...extraCaught]);
  const html = `<p class="small">Capturados: <b>${caught.size}</b> · Vistos: <b>${new Set([...seen, ...caught]).size}</b> de ${SPECIES_LIST.length}</p>
    <div class="dex">${SPECIES_LIST.map(s => {
      const c = caught.has(s.id), v = c || seen.has(s.id);
      return `<div class="e ${c ? 'caught' : v ? 'seen' : 'unseen'}" title="${v ? esc(s.name) : '???'}">
        <img src="${monSprite(s.id)}" alt="${v ? esc(s.name) : '?'}" loading="lazy">
        <div>#${String(s.dex).padStart(3, '0')}</div><div><b>${v ? esc(s.name) : '???'}</b></div>${v ? `<div>${typeChips(s.types)}</div>` : ''}</div>`;
    }).join('')}</div>`;
  openModal('dex', '📖 Pokédex', html, { wide: true });
}

// ---------------------------------------------------------------- treinador
export function openTrainer(session, pid) {
  const s = session.state;
  const p = s.players.find(x => x.id === pid);
  if (!p) return;
  const html = `<div class="trainer">${avatarImg(p, 'avatar', playerColor(s, p.id))}
      <div><h3 style="color:${playerColor(s, p.id)}">${esc(p.name)} ${p.isBot ? '<span class="chip">CPU</span>' : ''}</h3>
      <div class="small">🪙 ${p.gold} · 📖 ${p.caught.length} capturados · ✨ ${p.stats.shinies} shiny · ⭐ ${score(p)} pts</div>
      <div class="small muted">📍 ${esc(getSpace(p.pos).name)} · vitórias ${p.stats.wins} · PvP ${p.stats.pvpWins}</div></div></div>
    <div class="row" style="margin:10px 0">${GYMS.map(g => `<img src="${badgeUrl(g.id)}" alt="${esc(g.badge)}" title="${esc(g.badge)} (${esc(g.leader)})" style="width:34px;height:34px;object-fit:contain;${p.badges.includes(g.id) ? '' : 'filter:grayscale(1) brightness(.4)'}">`).join('')}
      ${p.eliteStage ? `<span class="chip gold">👑 Elite ${p.eliteStage}/4</span>` : ''}</div>
    <b>Equipe</b><div class="team" style="grid-template-columns:repeat(6,1fr);margin-top:6px">${p.team.map((m, i) => monCard(m, { index: i, act: 'noop' })).join('')}</div>
    ${p.box.length ? `<p class="small muted">+ ${p.box.length} no PC</p>` : ''}`;
  openModal('trainer', '🪪 Ficha do Treinador', html, { wide: true });
}

// ---------------------------------------------------------------- Pokémon
export function openMon(session, act, index) {
  const p = me(session);
  const mon = p.team[index];
  if (!mon) return;
  const v = monView(mon);
  const sp = getSpecies(mon.sp);
  const weak = TYPES.map(t => [t, against(t, sp.types)]).filter(([, m]) => m !== 1).sort((a, b) => b[1] - a[1]);
  const evo = sp.evolvesTo ? `${getSpecies(sp.evolvesTo).name}${sp.evolutionLevel ? ` no Nv. ${sp.evolutionLevel}` : ' (Pedra Evolutiva)'}` : 'não evolui';
  const myTurn = session.state.players[session.state.current].id === p.id && !session.state.battle;
  const html = `<div class="row" style="align-items:flex-start">
      <img src="${monSprite(mon)}" alt="${esc(v.name)}" style="width:140px;height:140px;object-fit:contain">
      <div class="col grow">
        <h3 style="font-size:20px">${esc(v.name)} ${v.shiny ? '✨' : ''} <span class="chip gold">Nv. ${v.lvl}</span></h3>
        <div>${typeChips(v.types)} <span class="chip">#${String(sp.dex).padStart(3, '0')}</span> <span class="chip">Tier ${sp.tier}</span>${mon.aura ? ` <span class="chip gold">aura ${esc(mon.aura)}</span>` : ''}</div>
        ${hpBar(v.hp, v.maxHp)}<div class="small">HP ${Math.max(0, v.hp)}/${v.maxHp} · Ataque ${v.atk} · XP ${mon.xp}/${xpToNext(v.lvl)}</div>
        <div class="small">Evolução: ${esc(evo)}</div>
      </div></div>
    <div class="divider"></div>
    <b class="small">Efetividade contra ${esc(v.name)}</b>
    <div class="row" style="margin-top:6px">${weak.map(([t, m]) => `<span class="chip ${m > 1 ? 'red' : 'green'}">${esc(typeLabel(t))} x${m}</span>`).join('')}</div>
    ${myTurn && index > 0 ? `<div class="divider"></div><button class="btn primary" data-act="lead">⬆️ Colocar na frente (entra primeiro nas batalhas)</button>` : ''}`;
  const ov = openModal('mon', 'Pokémon', html);
  bindActions(ov, { lead: () => { closeModal('mon'); act({ type: 'reorder', index }); } });
}

// ---------------------------------------------------------------- regras
export function openHelp() {
  openModal('help', '❔ Como jogar', `
    <div class="small col">
      <p><b>Objetivo:</b> conquistar as 6 insígnias, vencer a Elite dos Quatro (Liga Pokémon) e derrotar o Campeão na Arena Final. Com limite de turnos, vence quem tiver mais pontos.</p>
      <p><b>Turno:</b> role o dado e escolha uma das casas piscando. Casas <b>coloridas</b> têm Pokémon do tier da cor (Rosa → Verde → Azul → Vermelha → Amarela). Casas <b>?</b> são eventos (ouro, itens, treinadores, Equipe Rocket, atalhos...). <b>Cidades</b> têm Centro Pokémon (cura grátis), Loja, PC e ginásio.</p>
      <p><b>Batalha:</b> cada rodada os dois lados agem. Dano = ataque × 0,7 + 🎲, multiplicado pela vantagem de tipo (tabela oficial de 18 tipos; tipo duplo multiplica: x4, x2, x0,5, x0,25 ou x0). 🎲6 = crítico (x1,5); 🎲1 = golpe fraco (x0,5). Quem tem nível maior ataca primeiro.</p>
      <p><b>Captura:</b> jogue a Pokébola no selvagem. Precisa tirar no dado: Rosa 3+, Verde 4+, Azul 5+, Vermelho 6+, Lendário 7+ (shiny +1). Bônus: bola (+1 a +3), HP do selvagem abaixo de 50% (+1) ou 25% (+2), seu Pokémon 5+ níveis acima (+1). 🎲1 sempre falha e ele pode fugir. Derrotar (desmaiar) não captura!</p>
      <p><b>Shiny:</b> 1 em 40 (1 em 8 para o Pokémon do Dia; Amuleto Shiny triplica). Shinies têm +10% de status, valem mais XP e pontos.</p>
      <p><b>XP:</b> quem derrota ganha tudo, quem participou 60% e o resto da equipe 40%. Vencer Pokémon muito mais fracos rende pouco. Evolução acontece no nível do catálogo (ou com Pedra Evolutiva).</p>
      <p><b>PvP:</b> parou na mesma casa de outro treinador? Desafie! Quem perde paga 15% do ouro.</p>
      <p><b>Derrota:</b> se a equipe inteira desmaiar, você volta à última cidade, perde 10% do ouro e a equipe é curada.</p>
      <p><b>Online:</b> todos os dados são rolados no servidor. Se alguém sumir por 90s, os outros podem deixar uma CPU jogar a vez dele.</p>
    </div>`, { wide: true });
}
