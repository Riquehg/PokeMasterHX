// 🗼 v51 — Torre de Batalha (cliente): entrada com ouro, time de 3 (Nv. 50), 7 duelos por série, PB e loja.
import { api } from '../api.js';
import { esc, toast, openModal, setModalBody, bindActions, closeModal } from './dom.js';
import { miniMon } from './common.js';
import { ITEMS } from '../../shared/data/items.js';
import { itemIcon } from '../config.js';
import { TOWER_TEAM, TOWER_SET, TOWER_LEVEL } from '../../shared/data/tower.js';
import { TYPES, TYPE_LABELS } from '../../shared/rules/types.js';

export async function openTower(ctx, profile, onProfile) {
  let data = null, picks = [], tab = 'tower';
  let duoMode = false, friends = null, partner = ''; // 🤝 v65: Torre em Dupla
  const ov = openModal('tower', '🗼 Torre de Batalha', '<p class="muted">Carregando...</p>', { wide: true });
  const render = () => {
    const t = data.tower;
    const head = `<div class="tw-head"><span class="chip purple">🏅 <b>${t.pb}</b> PB</span><span class="chip">🔥 Sequência: <b>${t.streak}</b></span><span class="chip">🏆 Recorde: <b>${t.best}</b></span><span class="chip" title="Torre em Dupla">🤝 ${t.duoStreak || 0} · recorde ${t.duoBest || 0}</span>
      <span class="chip ${profile?.stats?.megaBracelet ? 'gold' : ''}">${profile?.stats?.megaBracelet ? '🔗 Megas liberadas' : '🔗 Sem Bracelete: sem Mega'}</span>
      <div class="row" style="gap:4px;margin-left:auto"><button class="btn sm ${tab === 'tower' ? 'primary' : ''}" data-act="tab" data-t="tower">🗼 Torre</button><button class="btn sm ${tab === 'shop' ? 'primary' : ''}" data-act="tab" data-t="shop">🛒 Loja PB</button></div></div>`;
    if (tab === 'shop') {
      return head + `<p class="small muted">Troque os Pontos de Batalha (PB) por itens. Tudo vai para a 🎒 Mochila da conta — o 🔗 Bracelete Mega e a 🔴 Pulseira Dynamax ficam liberados direto na conta.</p>
        <div class="hm-shop">${Object.entries(t.shop).map(([id, S]) => { const it = ITEMS[id] || (S.plate ? { name: 'Placa de Tipo', desc: '+20% nos golpes do tipo escolhido.' } : null); if (!it) return '';
          return `<div class="hm-shop-it">${itemIcon(S.plate ? 'plate' : id, S.plate ? '🔷' : (it.emoji || '🎁'), 'tw-shop-ic')}<b class="small">${S.qty > 1 ? S.qty + '× ' : ''}${esc(it.name)}</b>
            <span class="tiny muted">${esc((it.desc || '').slice(0, 90))}</span>${S.plate ? `<select class="input sm" id="tw-ptype">${TYPES.map(x => `<option value="${x}">${esc(TYPE_LABELS[x])}</option>`).join('')}</select>` : ''}
            ${S.key && profile?.stats?.[S.key] ? '<span class="chip green">✅ Você já tem</span>' : `<button class="btn sm ${t.pb >= S.pb ? 'primary' : ''}" data-act="buy" data-i="${id}" ${t.pb >= S.pb ? '' : 'disabled'}>🏅 ${S.pb} PB</button>`}</div>`; }).join('')}</div>`;
    }
    if (t.set) {
      const vault = profile?.vault || [];
      const team = t.set.team.map(u => vault.find(v => v.uid === u)).filter(Boolean);
      return head + `<div class="tw-prog">${Array.from({ length: TOWER_SET }, (_, i) => `<span class="tw-dot ${i + 1 < t.set.n ? 'done' : i + 1 === t.set.n ? 'now' : ''}">${i + 1 === TOWER_SET ? '👑' : i + 1}</span>`).join('')}</div>
        ${t.set.duo ? `<p class="center small">🤝 <b>Torre em Dupla</b> com <b>${esc(t.set.duoName)}</b> — o time dele luta junto com o seu (6 Pokémon contra 6).</p>` : ''}
        <p class="center">Próximo: <b>duelo ${t.set.n}/${TOWER_SET}</b>${t.set.n === TOWER_SET ? ' contra o <b>👑 Mestre da Torre</b> (com lendário e Mega)!' : ''}</p>
        <div class="mini-grid" style="justify-content:center">${team.map(m => miniMon({ ...m, lvl: Math.min(TOWER_LEVEL, m.lvl) })).join('')}${(t.set.ally || []).map(m => miniMon({ ...m, uid: 'a' + m.sp })).join('')}</div>
        <div class="row" style="gap:8px;justify-content:center;margin-top:10px"><button class="btn primary big" data-act="battle">⚔️ ${t.matchId ? 'Voltar ao duelo' : 'Lutar'}</button><button class="btn red" data-act="quit">🏳️ Desistir</button></div>
        <p class="tiny muted center">Perder um duelo acaba a sequência. Ganhar os 7 completa a série (+5 PB) — entre de novo para continuar a sequência com adversários mais fortes.</p>`;
    }
    const vault = (profile?.vault || []).slice().sort((a, b) => (b.lvl || 0) - (a.lvl || 0));
    const duoBox = `<div class="row" style="gap:6px;justify-content:center;margin:6px 0"><button class="btn sm ${!duoMode ? 'primary' : ''}" data-act="duo" data-on="0">🗼 Sozinho</button><button class="btn sm ${duoMode ? 'primary' : ''}" data-act="duo" data-on="1">🤝 Em Dupla</button></div>
      ${duoMode ? `<div class="bring-gold"><b>🤝 Torre em Dupla</b> — escolha um amigo: o time de defesa dele na Liga das Séries (ou os ${TOWER_TEAM} mais fortes) luta junto com o seu, 6 contra 6. PB ×1,5 e sequência/recorde próprios; seu amigo ganha 1 PB por vitória.
        ${friends === null ? '<p class="tiny muted">Carregando amigos…</p>' : friends.length ? `<select class="input" id="tw-partner">${friends.map(f => `<option value="${esc(f.id)}" ${f.id === partner ? 'selected' : ''}>${f.online ? '🟢' : '⚪'} ${esc(f.name)}</option>`).join('')}</select>` : '<p class="tiny muted">Você ainda não tem amigos aceitos (👥 no menu).</p>'}</div>` : ''}`;
    return head + duoBox + `<p class="small muted">Escolha ${TOWER_TEAM} Pokémon da Coleção (todos lutam no Nv. ${TOWER_LEVEL}; itens segurados valem; com o 🔗 Bracelete Mega, a Megapedra funciona). Pague 🪙 ${t.price} e enfrente ${TOWER_SET} treinadores seguidos — o 7º é o 👑 Mestre da Torre. Cada vitória dá PB (mais PB quanto maior a sequência).</p>
      <div class="tw-picks">${Array.from({ length: TOWER_TEAM }, (_, i) => { const m = vault.find(v => v.uid === picks[i]); return m ? miniMon(m, { act: 'unpick', index: m.uid }) : '<div class="tw-slot">?</div>'; }).join('')}</div>
      <button class="btn primary big" data-act="start" ${picks.length === TOWER_TEAM && (data.gold ?? 0) >= t.price && (!duoMode || friends?.length) ? '' : 'disabled'} style="display:block;margin:8px auto">${duoMode ? '🤝 Entrar em Dupla' : '🗼 Entrar na Torre'} (🪙 ${t.price})</button>
      <div class="mini-grid">${vault.map(m => miniMon(m, { act: 'pick', index: m.uid, sel: picks.includes(m.uid) })).join('')}</div>`;
  };
  const draw = () => setModalBody('tower', render());
  const call = async body => { try { const r = await api('match', body); if (r.tower) data = { ...data, ...r }; if (r.profile) { profile = r.profile; onProfile?.(r.profile); } if (r.message) toast(r.message, 'good'); draw(); return r; } catch (e) { toast(e.message, 'bad'); } };
  bindActions(ov, {
    tab: d => { tab = d.t; draw(); },
    pick: d => { if (picks.includes(d.index)) picks = picks.filter(u => u !== d.index); else if (picks.length < TOWER_TEAM) picks.push(d.index); draw(); },
    unpick: d => { picks = picks.filter(u => u !== d.index); draw(); },
    start: () => call({ op: 'tower_start', teamUids: picks, partner: duoMode ? ov.querySelector('#tw-partner')?.value || partner : undefined }),
    duo: async d => {
      duoMode = d.on === '1'; draw();
      if (duoMode && friends === null) { try { friends = (await api('feed', { op: 'friends' })).friends || []; partner = friends[0]?.id || ''; } catch { friends = []; } draw(); }
    },
    battle: async () => { const r = await call({ op: 'tower_battle' }); if (r?.match) { closeModal('tower'); ctx.openOnline(r.match.id); } },
    quit: () => { if (confirm('Desistir? A sequência acaba.')) call({ op: 'tower_quit' }); },
    buy: d => call({ op: 'tower_buy', item: d.i, ptype: ov.querySelector('#tw-ptype')?.value })
  });
  ov.addEventListener('change', e => { if (e.target.id === 'tw-partner') partner = e.target.value; });
  try { data = await api('match', { op: 'tower_get' }); draw(); } catch (e) { setModalBody('tower', `<p class="bad">${esc(e.message)}</p>`); }
}
