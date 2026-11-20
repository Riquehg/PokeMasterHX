// Loja de Diamantes: cosméticos (só visual) e 💖 doações por Pix (o apoiador ganha diamantes de agradecimento).
import { esc, toast, openModal, setModalBody, bindActions } from './dom.js';
import { api } from '../api.js';
import { monSprite, avatarUrl } from '../config.js';
import { SHOP_KINDS } from '../../shared/data/cosmetics.js';
import { confetti, victoryFx } from './fx.js';
const VIC_ICON = { fireworks: '🎆', stars: '⭐', hearts: '💖', pokeballs: '🔴', coins: '🪙', sakura: '🌸' };
const svcOwned = (me, v) => (v === 'vault50' ? me.vaultBonus : v === 'nickname' ? me.nicknames : false);

const money = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function preview(item, avatar) {
  if (item.kind === 'ball_style') return `<div class="cos-prev mon aura-${esc(item.value)}" style="min-height:0;cursor:default"><img src="${monSprite('pikachu')}" alt="Pikachu"></div>`;
  if (item.kind === 'frame') return `<img class="avatar frame-${esc(item.value)}" src="${avatarUrl(avatar)}" alt="moldura">`;
  if (item.kind === 'dice') return `<div class="cos-dice dice-${esc(item.value)}"><div class="face f5"><i></i><i></i><i></i><i></i><i></i></div></div>`;
  if (item.kind === 'arena') return `<div class="cos-arena arena arena-${esc(item.value)}"><img src="${monSprite('pikachu')}" alt=""></div>`;
  if (item.kind === 'card') return `<div class="cos-card tcard-${esc(item.value)}"><img class="avatar" src="${avatarUrl(avatar)}" alt=""><span></span></div>`;
  if (item.kind === 'victory') return `<button class="cos-victory" data-act="vic-try" data-v="${esc(item.value)}" title="Ver o efeito">${VIC_ICON[item.value] || '🎉'}<span class="tiny">ver</span></button>`;
  if (item.kind === 'service') return `<div class="cos-svc">${item.value === 'vault50' ? '📦+50' : '✏️'}</div>`;
  return `<div class="cos-title">“${esc(item.value)}”</div>`;
}

export async function openShop(profile, onChange, onClose, startTab = 'cosmetics') {
  let tab = startTab, data = null, pix = null, timer = null;
  openModal('dshop', startTab === 'buy' ? '💖 Apoie o projeto' : '💎 Loja de Diamantes', '<span class="spinner"></span>', { wide: true, onClose: () => { clearInterval(timer); onClose?.(); } });
  const ov = document.getElementById('dshop');

  const body = () => {
    const me = data.me;
    const tabs = `<div class="spread" style="margin-bottom:10px"><div class="tabs" style="flex:1">
        <button class="btn sm ${tab === 'cosmetics' ? 'primary' : ''}" data-act="tab" data-t="cosmetics">🎨 Cosméticos</button>
        <button class="btn sm ${tab === 'buy' ? 'primary' : ''}" data-act="tab" data-t="buy">💖 Doar (ganhe 💎)</button>
        <button class="btn sm ${tab === 'history' ? 'primary' : ''}" data-act="tab" data-t="history">🧾 Minhas doações</button></div>
      <span class="chip gold" style="font-size:15px;margin-left:8px">💎 ${me.diamonds}</span></div>`;
    if (pix) return tabs + pixView();
    if (tab === 'buy') {
      return tabs + (data.pixEnabled ? `<div class="donate-intro"><span>💖</span><div><b>Apoie o Pokémon Master Trainer HEX!</b>
          <p class="small">O jogo é mantido por fãs. Cada doação ajuda a pagar servidor, sprites e novidades. Como agradecimento, você recebe <b>💎 diamantes</b> para usar nos cosméticos (só visual — ninguém fica mais forte por doar).</p></div></div>
        <div class="pkg-grid">${data.packages.map(p => `<div class="pkg donate">
          <div class="pkg-gem">💖</div><div class="small muted">${esc(p.name)}</div>
          <div class="pkg-n">Doe ${money(p.price)}</div>
          <div class="small">Agradecimento: <b>💎 ${p.diamonds + (p.bonus || 0)}</b>${p.bonus ? ` <span class="chip green">+${p.bonus} extra</span>` : ''}</div>
          <button class="btn primary block" data-act="pix" data-id="${esc(p.id)}">💖 Doar com Pix</button></div>`).join('')}</div>
        <p class="tiny muted">A doação é feita por Pix (Mercado Pago) e os diamantes entram na conta assim que o pagamento é confirmado.</p>`
        : '<p class="muted">As doações por Pix ainda não foram ativadas pelo administrador.</p>');
    }
    if (tab === 'history') {
      return tabs + `<table class="score"><tr><th>Data</th><th>💎 recebidos</th><th>Doação</th><th>Status</th></tr>${(data.purchases || []).map(p => `<tr><td>${new Date(p.at).toLocaleString('pt-BR')}</td><td>${p.diamonds}</td><td>${money(p.amount)}</td><td>${{ credited: '✅ creditado', pending: '⏳ aguardando', rejected: '❌ recusado', cancelled: '❌ cancelado', expired: '⌛ expirado', approved: '✅ aprovado' }[p.status] || p.status}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhuma doação ainda. Obrigado por jogar! 💖</td></tr>'}</table>`;
    }
    const groups = Object.entries(SHOP_KINDS).map(([kind, label]) => {
      const items = data.items.filter(i => i.kind === kind);
      if (!items.length) return '';
      return `<h3 style="margin:10px 0 6px">${esc(label)}</h3><div class="cos-grid">${items.map(i => {
        const svc = kind === 'service';
        const owned = svc ? svcOwned(me, i.value) : me.owned.includes(i.id), on = me.equipped[kind] === i.id;
        return `<div class="cos ${on ? 'on' : ''}">${preview(i, profile?.avatar)}
          <b>${esc(i.name)}</b><div class="tiny muted">${esc(i.desc)}</div>
          ${owned && svc ? '<span class="chip green">✔ Liberado</span>' : owned
            ? `<button class="btn sm ${on ? '' : 'green'}" data-act="equip" data-kind="${kind}" data-id="${on ? '' : esc(i.id)}">${on ? 'Desequipar' : 'Equipar'}</button>`
            : `<button class="btn sm primary" data-act="buy" data-id="${esc(i.id)}" ${me.diamonds < i.price ? 'disabled' : ''}>💎 ${i.price}</button>`}</div>`;
      }).join('')}</div>`;
    }).join('');
    return tabs + `<p class="small muted">Itens só de aparência ou conveniência — não deixam ninguém mais forte. O estilo de captura vale para os Pokémon que você capturar a partir de agora. Dado, cenário, cartão e efeito de vitória aparecem para todos na partida.</p>${groups}`;
  };

  const pixView = () => `<div class="pix">
      <h3>💖 Doação de ${money(pix.amount)} por Pix</h3>
      <p class="small">Obrigado pelo apoio! Como agradecimento você recebe <b>💎 ${pix.diamonds}</b>.</p>
      ${pix.qrBase64 ? `<img class="pix-qr" src="data:image/png;base64,${pix.qrBase64}" alt="QR Code Pix">` : ''}
      ${pix.qrCode ? `<div class="row"><input class="input grow" readonly value="${esc(pix.qrCode)}" id="pix-code"><button class="btn sm" data-act="copy">📋 Copiar</button></div>` : ''}
      ${pix.ticketUrl ? `<a class="btn sm" href="${esc(pix.ticketUrl)}" target="_blank" rel="noopener">Abrir no Mercado Pago</a>` : ''}
      <p class="small muted"><span class="spinner"></span> Aguardando a confirmação da doação... pode deixar esta janela aberta.</p>
      ${pix.dev ? `<button class="btn green" data-act="dev-approve">🧪 Simular doação aprovada (modo dev)</button>` : ''}
      <button class="btn ghost" data-act="cancel-pix">Voltar</button></div>`;

  const render = () => setModalBody('dshop', body());
  const load = async () => { data = await api('shop', { op: 'catalog' }); render(); onChange?.(data.me); };

  const watchPix = () => {
    clearInterval(timer);
    timer = setInterval(async () => {
      if (!document.getElementById('dshop')) return clearInterval(timer);
      try {
        const r = await api('shop', { op: 'pix_status', paymentId: pix.paymentId });
        if (r.status === 'credited') {
          clearInterval(timer);
          toast(`💖 Obrigado pela doação! 💎 ${pix.diamonds} de agradecimento na sua conta.`, 'good');
          confetti(100);
          pix = null; tab = 'cosmetics';
          await load();
        } else if (['rejected', 'cancelled', 'expired'].includes(r.status)) {
          clearInterval(timer); toast('A doação não foi concluída.', 'bad'); pix = null; render();
        }
      } catch { /* tenta de novo */ }
    }, 4000);
  };

  bindActions(ov, {
    tab: d => { tab = d.t; render(); },
    buy: async d => { try { const r = await api('shop', { op: 'buy', itemId: d.id }); toast(r.message, 'good'); confetti(40); await load(); } catch (e) { toast(e.message, 'bad'); } },
    'vic-try': d => victoryFx(d.v, 1),
    equip: async d => { try { await api('shop', { op: 'equip', slot: d.kind, itemId: d.id || null }); await load(); } catch (e) { toast(e.message, 'bad'); } },
    pix: async d => { try { pix = await api('shop', { op: 'pix_create', packageId: d.id }); render(); watchPix(); } catch (e) { toast(e.message, 'bad'); } },
    copy: () => { const i = document.getElementById('pix-code'); i.select(); navigator.clipboard?.writeText(i.value); toast('Código Pix copiado!'); },
    'dev-approve': async () => { await api('shop', { op: 'dev_approve', paymentId: pix.paymentId }); },
    'cancel-pix': () => { clearInterval(timer); pix = null; render(); }
  });
  try { await load(); } catch (e) { setModalBody('dshop', `<p class="muted">${esc(e.message)}</p>`); }
}
