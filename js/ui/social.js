// 💬 Painel social (em todas as telas): chat global com emojis, quem está online e amigos.
import { esc, toast } from './dom.js';
import { avatarUrl } from '../config.js';
import { net, api } from '../api.js';
import { eloOf } from '../../shared/data/elo.js';

const EMOJIS = ['😄', '😂', '😍', '😎', '🤔', '😭', '😡', '👍', '👏', '🙏', '🔥', '⚡', '✨', '💎', '🎉', '🏆', '👑', '🤝', 'GG', '❤️'];
const st = { open: false, tab: 'chat', chat: [], lastId: 0, online: [], onlineCount: 0, friendReq: 0, friends: null, unread: 0, search: [], started: false, myId: null, ctx: null };
let root = null;

function ensureRoot() {
  if (root?.isConnected) return root;
  root = document.createElement('div');
  root.id = 'social';
  document.body.appendChild(root);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'soc-input') send();
    if (e.key === 'Enter' && e.target.id === 'soc-search') search();
  });
  return root;
}

const eloChip = r => { const e = eloOf(r); return `<span class="elo-chip" style="--ec:${e.color}" title="${e.name} (${r})">${e.icon}</span>`; };

function chatHtml() {
  return `<div class="soc-msgs" id="soc-msgs">${st.chat.map(m => `<div class="soc-msg ${m.userId === st.myId ? 'me' : ''}">
      <img src="${avatarUrl(m.avatar)}" alt=""><div><b>${esc(m.name)}</b> <span class="tiny muted">${new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      <div class="soc-text">${esc(m.text)}</div></div></div>`).join('') || '<p class="muted small center">Ninguém falou nada ainda. Diga oi! 👋</p>'}</div>
    <div class="soc-emojis">${EMOJIS.map(e => `<button data-emoji="${e}">${e}</button>`).join('')}</div>
    <div class="soc-send"><input class="input" id="soc-input" maxlength="240" placeholder="Mensagem para todos online..."><button class="btn primary sm" data-soc="send">Enviar</button></div>`;
}

function personRow(p, extra = '') {
  return `<div class="soc-person"><img src="${avatarUrl(p.avatar)}" alt=""><span class="dot ${p.online ? 'on' : ''}"></span>
    <div class="grow"><b>${esc(p.name)}</b> ${eloChip(p.rating)}<div class="tiny muted">${p.online ? 'online' : 'offline'} · ${p.points} pts</div></div>${extra}</div>`;
}

function onlineHtml() {
  const friendIds = new Set((st.friends?.friends || []).map(f => f.id));
  return `<p class="small muted">${st.onlineCount} treinador(es) online agora</p>
    ${st.online.map(p => personRow(p, p.id === st.myId ? '<span class="chip">você</span>' : friendIds.has(p.id) ? '<span class="chip green">amigo</span>' : `<button class="btn sm" data-soc="add" data-id="${p.id}">➕ Amigo</button>`)).join('')}`;
}

function friendsHtml() {
  const f = st.friends;
  if (!f) return '<p class="muted"><span class="spinner"></span></p>';
  return `<div class="soc-send"><input class="input" id="soc-search" placeholder="Buscar treinador pelo nome"><button class="btn sm" data-soc="search">🔎</button></div>
    ${st.search.map(p => personRow(p, `<button class="btn sm" data-soc="add" data-id="${p.id}">➕ Adicionar</button>`)).join('')}
    ${f.incoming.length ? `<h4>📥 Pedidos de amizade</h4>${f.incoming.map(p => personRow(p, `<button class="btn sm green" data-soc="accept" data-id="${p.id}">Aceitar</button><button class="btn sm" data-soc="remove" data-id="${p.id}">✕</button>`)).join('')}` : ''}
    <h4>👥 Amigos (${f.friends.length})</h4>
    ${f.friends.map(p => personRow(p, `${p.room && p.room.status === 'lobby' ? `<button class="btn sm green" data-soc="join" data-id="${p.room.id}" title="Sala ${esc(p.room.name)}">Entrar na sala</button>` : p.room ? '<span class="chip">em partida</span>' : ''}
      <button class="btn sm" data-soc="remove" data-id="${p.id}" title="Desfazer amizade">✕</button>`)).join('') || '<p class="muted small">Adicione amigos pela busca ou pela aba Online.</p>'}
    ${f.outgoing.length ? `<h4>📤 Pedidos enviados</h4>${f.outgoing.map(p => personRow(p, `<button class="btn sm" data-soc="remove" data-id="${p.id}">Cancelar</button>`)).join('')}` : ''}`;
}

function draw() {
  const r = ensureRoot();
  const badge = st.unread + st.friendReq;
  if (!st.open) {
    r.innerHTML = `<button class="soc-fab" data-soc="open" title="Chat global e amigos">💬 <span class="soc-count">${st.onlineCount} online</span>${badge ? `<span class="badge-dot">${badge}</span>` : ''}</button>`;
    return;
  }
  const keep = r.querySelector('#soc-input')?.value || '';
  r.innerHTML = `<div class="soc-panel">
      <div class="soc-head"><b>🌎 Comunidade</b><span class="tiny muted">${st.onlineCount} online</span><button class="btn sm" data-soc="close">✕</button></div>
      <div class="soc-tabs">${[['chat', '💬 Chat global'], ['online', '🟢 Online'], ['friends', `👥 Amigos${st.friendReq ? ` <span class="badge-dot">${st.friendReq}</span>` : ''}`]].map(([k, l]) =>
        `<button class="btn sm ${st.tab === k ? 'primary' : ''}" data-soc="tab" data-t="${k}">${l}</button>`).join('')}</div>
      <div class="soc-body">${st.tab === 'chat' ? chatHtml() : st.tab === 'online' ? onlineHtml() : friendsHtml()}</div></div>`;
  const inp = r.querySelector('#soc-input');
  if (inp) { inp.value = keep; }
  const msgs = r.querySelector('#soc-msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

async function ping() {
  if (!net.user) return;
  try {
    const r = await api('feed', { op: 'ping', chatSince: st.lastId });
    st.myId = net.user.id;
    st.online = r.online; st.onlineCount = r.onlineCount; st.friendReq = r.friendRequests;
    if (r.chat.length) {
      const fresh = r.chat.filter(m => m.id > st.lastId);
      if (st.lastId && !(st.open && st.tab === 'chat')) st.unread += fresh.filter(m => m.userId !== st.myId).length;
      st.chat = [...st.chat, ...fresh].slice(-80);
      st.lastId = Math.max(st.lastId, ...r.chat.map(m => m.id));
    }
    const typing = document.activeElement?.id === 'soc-input' || document.activeElement?.id === 'soc-search';
    if (!typing || !st.open) draw();
    else if (st.tab === 'chat') { // está digitando: atualiza só as mensagens
      const msgs = root.querySelector('#soc-msgs');
      const tmp = document.createElement('div');
      tmp.innerHTML = chatHtml();
      if (msgs) { msgs.innerHTML = tmp.querySelector('#soc-msgs').innerHTML; msgs.scrollTop = msgs.scrollHeight; }
    }
  } catch { /* sem rede: tenta depois */ }
}

async function loadFriends() {
  try { st.friends = await api('feed', { op: 'friends' }); } catch (e) { toast(e.message, 'bad'); }
  draw();
}

async function send() {
  const inp = root.querySelector('#soc-input');
  const text = inp?.value.trim();
  if (!text) return;
  inp.value = '';
  try { await api('feed', { op: 'chat_send', text }); await ping(); draw(); } catch (e) { toast(e.message, 'bad'); inp.value = text; }
}

async function search() {
  const q = root.querySelector('#soc-search')?.value.trim();
  try { st.search = (await api('feed', { op: 'friend_search', q })).results; } catch (e) { toast(e.message, 'bad'); }
  draw();
}

async function friendOp(op, userId) {
  try {
    const r = await api('feed', { op, userId });
    if (r.message) toast(r.message, 'good');
    st.search = st.search.filter(p => p.id !== userId);
    await loadFriends();
    ping();
  } catch (e) { toast(e.message, 'bad'); }
}

async function joinRoom(matchId) {
  let pin;
  for (let i = 0; i < 2; i++) {
    try {
      await api('match', { op: 'join', matchId, pin });
      st.open = false; draw();
      st.ctx?.go('room', matchId);
      return;
    } catch (e) {
      if (/PIN/i.test(e.message) && pin === undefined) { pin = prompt('Essa sala tem PIN. Digite o PIN:') || ''; continue; }
      toast(e.message, 'bad');
      return;
    }
  }
}

function onClick(e) {
  const em = e.target.closest('[data-emoji]');
  if (em) {
    const inp = root.querySelector('#soc-input');
    if (inp) { inp.value = (inp.value + ' ' + em.dataset.emoji).trimStart(); inp.focus(); }
    return;
  }
  const b = e.target.closest('[data-soc]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.soc) {
    case 'open': st.open = true; if (st.tab === 'chat') st.unread = 0; draw(); if (st.tab === 'friends') loadFriends(); break;
    case 'close': st.open = false; draw(); break;
    case 'tab': st.tab = b.dataset.t; if (st.tab === 'chat') st.unread = 0; draw(); if (st.tab !== 'chat') loadFriends(); break;
    case 'send': send(); break;
    case 'search': search(); break;
    case 'add': friendOp('friend_add', id); break;
    case 'accept': friendOp('friend_accept', id); break;
    case 'remove': friendOp('friend_remove', id); break;
    case 'join': joinRoom(id); break;
  }
}

/** Liga o painel (depois do login). ctx: o roteador (para "Entrar na sala"). */
export function startSocial(ctx) {
  st.ctx = ctx;
  if (st.started || net.mode === 'offline' || !net.user) return;
  st.started = true;
  draw();
  ping();
  setInterval(ping, net.mode === 'dev' ? 4000 : 25000);
  if (net.mode === 'prod' && net.sb) {
    net.sb.channel('global-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat' }, () => ping())
      .subscribe();
  }
}
