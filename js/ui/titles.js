// 🏅 Títulos de conquista: lista com progresso, equipar/tirar e aviso quando ganha um novo.
import { esc, openModal, setModalBody, bindActions, toast } from './dom.js';
import { api } from '../api.js';
import { ACH_TITLES, titleProgress, unlockedTitles } from '../../shared/data/titles.js';
import { titleHtml } from './common.js';

const equippedAch = p => (String(p?.cosmetics?.equipped?.title || '').startsWith('ach:') ? p.cosmetics.equipped.title.slice(4) : null);

export function openTitles(profile, onChange) {
  const body = () => {
    const got = new Set(unlockedTitles(profile));
    const cur = equippedAch(profile);
    const row = t => {
      const pr = titleProgress(t, profile);
      const on = cur === t.id;
      return `<div class="ttl-row ${pr.done ? 'done' : 'locked'} ${on ? 'on' : ''}">
        <span class="ttl-ic">${t.icon}</span>
        <div class="grow">${pr.done ? titleHtml({ title: t.text, titleFx: t.fx, titleColor: t.color }, false) : `<b class="ttl-locked">🔒 ${esc(t.text)}</b>`}
          <div class="tiny muted">${esc(t.desc)}</div>
          ${pr.done ? '' : `<div class="ttl-bar"><i style="width:${Math.round((pr.cur / pr.need) * 100)}%"></i></div><div class="tiny muted">${pr.cur}/${pr.need}</div>`}</div>
        ${pr.done ? (on ? '<button class="btn sm" data-act="t-off">Tirar</button>' : `<button class="btn sm primary" data-act="t-on" data-id="${t.id}">Usar</button>`) : ''}</div>`;
    };
    const main = ACH_TITLES.filter(t => !t.companion), bond = ACH_TITLES.filter(t => t.companion);
    return `<p class="small muted">Títulos de conquista não se compram: se ganham. Cada um tem um efeito animado e aparece no seu cartão, no peão do tabuleiro e no cartão que os outros veem. Você usa 1 título por vez (o de conquista substitui o da Loja).</p>
      <div class="tiny muted" style="margin-bottom:6px">🏅 ${got.size}/${ACH_TITLES.length} conquistados</div>
      <div class="ttl-list">${main.map(row).join('')}</div>
      <h4 style="margin:12px 0 6px">🤝 Exclusivos dos companheiros (laço máximo)</h4>
      <div class="ttl-list">${bond.map(row).join('')}</div>`;
  };
  const ov = openModal('titles', '🏅 Títulos', body(), { wide: true });
  const set = async id => {
    try {
      profile = (await api('profile', { op: 'title_equip', id })).profile;
      setModalBody('titles', body());
      onChange && onChange(profile);
      toast(id ? '🏅 Título equipado!' : 'Título removido.', 'good');
    } catch (e) { toast(e.message, 'bad'); }
  };
  bindActions(ov, { 't-on': d => set(d.id), 't-off': () => set(null) });
}

/** Aviso de título novo (uma vez por título, por aparelho). */
export function checkNewTitles(profile) {
  if (!profile?.id) return;
  const key = `pmhx_titles_${profile.id}`;
  const now = unlockedTitles(profile);
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(key) || 'null'); } catch { seen = null; }
  try { localStorage.setItem(key, JSON.stringify(now)); } catch { /* sem storage */ }
  if (!seen) return; // primeira vez neste aparelho: só registra
  const fresh = now.filter(id => !seen.includes(id));
  for (const id of fresh) {
    const t = ACH_TITLES.find(x => x.id === id);
    if (t) toast(`🏅 Título novo: ${t.icon} ${t.text}! Equipe em Minha conta → Títulos.`, 'good');
  }
}
