// Tela de batalha (selvagem, treinador, ginásio, Liga e PvP). Também serve de "modo espectador".
import { getSpecies } from '../../shared/data/pokemon.js';
import { ITEMS, ballBonusAgainst } from '../../shared/data/items.js';
import { monView, maxHpOf } from '../../shared/rules/monsters.js';
import { bestAttack, effectivenessLabel } from '../../shared/rules/types.js';
import { whoMustAct } from '../../shared/engine.js';
import { esc } from './dom.js';
import { monSprite, itemUrl, leaderUrl, typeLabel } from '../config.js';
import { typeChips, hpBar } from './common.js';

const CAPTURE_TARGET = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 };
const KIND_TITLE = {
  wild: '🌿 Pokémon Selvagem', trainer: '⚔️ Treinador', rocket: '🦹 Equipe Rocket', gym: '🏟️ Batalha de Ginásio',
  elite: '👑 Elite dos Quatro', champion: '🏆 Campeão da Liga', pvp: '🤺 Batalha PvP'
};

function sideTeam(state, side) {
  return side.kind === 'player' ? state.players.find(p => p.id === side.pid).team : side.team;
}

/** Chance (0..1) de captura com uma bola, pela mesma regra do motor. */
export function captureChance(state, ballId) {
  const b = state.battle;
  const wild = b.sides[1].team[0];
  const me = sideTeam(state, b.sides[0])[b.sides[0].active];
  const sp = getSpecies(wild.sp);
  if (ITEMS[ballId]?.bonus >= 99) return 1;
  const max = maxHpOf(wild);
  const hpBonus = wild.hp <= max * 0.25 ? 2 : wild.hp <= max * 0.5 ? 1 : 0;
  const lvlBonus = me && me.lvl >= wild.lvl + 5 ? 1 : 0;
  const target = CAPTURE_TARGET[sp.tier] + (wild.shiny ? 1 : 0);
  const bonus = ballBonusAgainst(ballId, sp.types) + hpBonus + lvlBonus;
  let ok = 0;
  for (let r = 2; r <= 6; r++) if (r + bonus >= target) ok++;
  return ok / 6;
}

function fighter(state, side, mon, isMe, opp) {
  const v = monView(mon);
  const owner = side.kind === 'player' ? state.players.find(p => p.id === side.pid)?.name : side.kind === 'wild' ? 'Selvagem' : side.name;
  let hint = '';
  if (opp) {
    const m = bestAttack(v.types, getSpecies(opp.sp).types);
    const lbl = effectivenessLabel(m.mult);
    hint = `<div class="tiny" style="margin-top:4px">Golpe de ${esc(typeLabel(m.type))} ${m.mult !== 1 ? `<b>x${m.mult}</b>` : ''} ${lbl ? '· ' + esc(lbl) : ''}</div>`;
  }
  const team = sideTeam(state, side);
  const balls = team.length > 1 || side.kind !== 'wild'
    ? `<div class="balls">${team.map(m => `<i class="${m.hp > 0 ? '' : 'off'}"></i>`).join('')}</div>` : '';
  return `<div class="fighter ${isMe ? 'me' : 'foe'} ${v.shiny ? 'shiny' : ''}" data-side="${isMe ? 'me' : 'foe'}">
    <div class="tiny muted">${esc(owner || '')}</div>
    <img class="sprite" src="${monSprite(mon)}" alt="${esc(v.name)}">
    <div class="name">${esc(v.name)} ${v.shiny ? '✨' : ''} <span class="chip gold">Nv. ${v.lvl}</span></div>
    <div class="row" style="justify-content:center;margin:4px 0">${typeChips(v.types)}</div>
    ${hpBar(v.hp, v.maxHp)}
    <div class="small"><b>${Math.max(0, v.hp)}</b> / ${v.maxHp} HP · ATQ ${v.atk}${side.boost?.[mon.uid] ? ` <span class="chip green">+${side.boost[mon.uid]}</span>` : ''}</div>
    ${hint}${balls}
  </div>`;
}

/**
 * HTML do conteúdo da batalha para o espectador/participante `vid`.
 * ui.sub = submenu aberto ('switch' | 'item' | 'ball' | null)
 */
export function battleHtml(state, vid, ui = {}, canAct = true) {
  const b = state.battle;
  if (!b) return '';
  let mySi = b.sides.findIndex(s => s.kind === 'player' && s.pid === vid);
  const participant = mySi >= 0;
  if (!participant) mySi = 0;
  const me = b.sides[mySi], foe = b.sides[1 - mySi];
  const myTeam = sideTeam(state, me), foeTeam = sideTeam(state, foe);
  const myMon = myTeam[me.active], foeMon = foeTeam[foe.active];
  const must = whoMustAct(state);
  const myTurn = participant && canAct && must.includes(vid);
  const mustSwitch = participant && b.mustSwitch[mySi];

  const foeHeader = foe.kind === 'npc'
    ? `<div class="foe-trainer">${foe.sprite ? `<img src="${leaderUrl(foe.sprite)}" alt="${esc(foe.name)}">` : ''}<span>${esc(foe.title ? foe.title + ' ' : '')}${esc(foe.name)}</span></div>` : '';

  let controls = '';
  if (!participant) {
    controls = `<p class="muted center">Você está assistindo esta batalha.</p>`;
  } else if (!myTurn) {
    controls = `<p class="muted center"><span class="spinner"></span> Aguardando ${b.kind === 'pvp' ? 'o adversário escolher' : '...'}</p>`;
  } else if (mustSwitch) {
    controls = `<p class="center"><b>Seu Pokémon desmaiou!</b> Escolha quem entra:</p>${switchList(myTeam, me.active, true)}`;
  } else {
    const p = state.players.find(x => x.id === vid);
    const ballCount = Object.entries(p.items).filter(([id, n]) => ITEMS[id]?.kind === 'ball' && n > 0).reduce((a, [, n]) => a + n, 0);
    const battleItems = Object.entries(p.items).filter(([id, n]) => ['heal', 'revive', 'boost'].includes(ITEMS[id]?.kind) && n > 0);
    const official = ['gym', 'elite', 'champion'].includes(b.kind);
    controls = `
      <div class="battle-actions">
        <button class="btn red" data-act="b-attack">⚔️ Atacar</button>
        <button class="btn blue" data-act="b-sub" data-sub="switch" ${myTeam.filter(m => m.hp > 0).length < 2 ? 'disabled' : ''}>🔄 Trocar</button>
        <button class="btn purple" data-act="b-sub" data-sub="item" ${battleItems.length ? '' : 'disabled'}>🎒 Itens</button>
        <button class="btn green" data-act="b-sub" data-sub="ball" ${b.kind === 'wild' && ballCount ? '' : 'disabled'}>🔴 Capturar</button>
        <button class="btn" data-act="b-flee" ${official ? 'disabled' : ''}>${b.kind === 'wild' ? '🏃 Fugir' : '🏳️ Desistir'}</button>
      </div>`;
    if (ui.sub === 'switch') controls += switchList(myTeam, me.active, false);
    if (ui.sub === 'item') {
      controls += `<div class="subpick">${battleItems.map(([id, n]) => `
        <button class="btn sm pickbtn" data-act="b-item" data-item="${id}"><img src="${itemUrl(id)}" alt="${esc(ITEMS[id].name)}">${esc(ITEMS[id].name)} ×${n}</button>`).join('')}</div>
        <p class="tiny muted">Poções e Revive pedem o alvo: o ativo é usado por padrão; para curar outro, troque antes.</p>`;
    }
    if (ui.sub === 'ball') {
      const balls = Object.entries(p.items).filter(([id, n]) => ITEMS[id]?.kind === 'ball' && n > 0);
      controls += `<div class="subpick">${balls.map(([id, n]) => {
        const c = Math.round(captureChance(state, id) * 100);
        return `<button class="btn sm pickbtn" data-act="b-ball" data-item="${id}"><img src="${itemUrl(id)}" alt="${esc(ITEMS[id].name)}">${esc(ITEMS[id].name)} ×${n} <span class="chip ${c >= 60 ? 'green' : c >= 34 ? 'gold' : 'red'}">${c}%</span></button>`;
      }).join('')}</div>
      <p class="tiny muted">Dica: HP do selvagem abaixo de 50% dá +1 e abaixo de 25% dá +2. Rolar 1 sempre falha. Cada erro pode fazê-lo fugir.</p>`;
    }
  }

  const logLines = b.log.slice(-14).map(l => `<p>${esc(l)}</p>`).join('');
  return `
    <div class="spread" style="margin-bottom:8px"><b>${KIND_TITLE[b.kind] || 'Batalha'}</b><span class="chip">Rodada ${b.round + 1}</span></div>
    ${foeHeader}
    <div class="arena">
      ${fighter(state, me, myMon, true, foeMon)}
      <div class="vs">VS</div>
      ${fighter(state, foe, foeMon, false, myMon)}
    </div>
    ${controls}
    <div class="battle-log" id="battle-log">${logLines}</div>`;
}

function switchList(team, active, forced) {
  return `<div class="subpick">${team.map((m, i) => {
    const v = monView(m);
    const dis = m.hp <= 0 || i === active;
    return `<button class="btn sm pickbtn" data-act="b-switch" data-index="${i}" ${dis ? 'disabled' : ''}>
      <img src="${monSprite(m)}" alt="${esc(v.name)}">${esc(v.name)} Nv.${v.lvl} <span class="tiny muted">${Math.max(0, m.hp)}/${v.maxHp}</span></button>`;
  }).join('')}</div>${forced ? '' : ''}`;
}

export function outcomeText(state, lb, vid) {
  if (!lb) return '';
  const o = lb.outcome || {};
  const mySi = lb.sides.findIndex(s => s.kind === 'player' && s.pid === vid);
  const r = o.result;
  if (r === 'captured') return mySi === 0 ? '🎉 Captura realizada!' : 'Captura realizada.';
  if (r === 'escaped') return '💨 O Pokémon fugiu.';
  if (r === 'fled') return '🏃 Fugiu da batalha.';
  if (r === 'draw') return '⌛ Empate.';
  if (r === 'win') {
    if (mySi < 0) return 'Batalha encerrada.';
    return o.winner === mySi ? '🏆 Vitória!' : '💫 Derrota...';
  }
  return 'Batalha encerrada.';
}
