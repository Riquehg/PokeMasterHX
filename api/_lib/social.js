// Social: quem está online, chat global e amigos. Tudo pelo endpoint /api/feed (POST) — a Vercel grátis só aceita 12 funções.
import { bad, notFound, cleanName } from './core.js';
import { eloOf } from '../../shared/data/elo.js';

export const ONLINE_WINDOW_MS = 90_000; // visto nos últimos 90 s = online
const CHAT_COOLDOWN_MS = 2_000;
const MAX_FRIENDS = 100;

const pub = p => ({ id: p.id, name: p.trainer_name || 'Treinador', avatar: p.avatar || 1, rating: p.rating ?? 1000, elo: eloOf(p.rating ?? 1000).id,
  points: p.points || 0, online: !!p.last_seen && Date.now() - new Date(p.last_seen).getTime() < ONLINE_WINDOW_MS,
  title: p.cosmetics?.equipped?.title ? true : false });
const pubChat = c => ({ id: c.id, userId: c.user_id, name: c.name, avatar: c.avatar, text: c.text, at: c.created_at });

// filtro simples de palavrões/links (o admin pode apagar mensagens)
const BLOCK = /(https?:\/\/|www\.)/i;
function cleanText(t) {
  return String(t || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

async function friendsView(db, userId) {
  const rows = await db.listFriendships(userId);
  const other = r => (r.user_id === userId ? r.friend_id : r.user_id);
  const profs = await db.getProfilesByIds([...new Set(rows.map(other))]);
  const byId = Object.fromEntries(profs.map(p => [p.id, p]));
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const p = byId[other(r)];
    if (!p) continue;
    const v = pub(p);
    if (r.status === 'accepted') {
      // em qual sala o amigo está (para entrar junto)
      const mine = await db.myMatches(p.id);
      const room = mine.find(m => m.status === 'lobby') || mine.find(m => m.status === 'playing');
      out.friends.push({ ...v, room: room ? { id: room.id, code: room.code, name: room.name, status: room.status } : null });
    } else if (r.friend_id === userId) out.incoming.push(v);
    else out.outgoing.push(v);
  }
  out.friends.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return out;
}

export async function socialOp(db, user, body) {
  if (!user) bad('Faça login para usar o chat e os amigos.');
  const now = Date.now();
  const since = new Date(now - ONLINE_WINDOW_MS).toISOString();

  switch (body.op) {
    case 'ping': { // batimento: marca online e devolve o resumo
      await db.touchSeen(user.id);
      const [online, chat, f] = await Promise.all([
        db.listOnline(since, 60),
        db.listChat(Math.max(0, Number(body.chatSince) || 0), 50),
        db.listFriendships(user.id)
      ]);
      return {
        online: online.map(pub), onlineCount: online.length,
        chat: chat.reverse().map(pubChat),
        friendRequests: f.filter(r => r.friend_id === user.id && r.status === 'pending').length
      };
    }

    case 'chat_send': {
      const text = cleanText(body.text);
      if (!text) bad('Mensagem vazia.');
      if (BLOCK.test(text)) bad('Links não são permitidos no chat global.');
      const last = await db.lastChatOf(user.id);
      if (last && now - new Date(last.created_at).getTime() < CHAT_COOLDOWN_MS) bad('Calma! Espere um pouquinho entre as mensagens.');
      const me = await db.getProfile(user.id);
      if (me?.stats?.muted) bad('Você está silenciado no chat global.');
      const row = await db.insertChat({ user_id: user.id, name: cleanName(me?.trainer_name), avatar: me?.avatar || 1, text });
      await db.touchSeen(user.id);
      return { message: pubChat(row) };
    }

    case 'chat_delete': { // só admin
      const me = await db.getProfile(user.id);
      if (!me?.is_admin) bad('Só o admin pode apagar mensagens.');
      await db.deleteChat(Number(body.id));
      return { ok: true };
    }

    case 'friends':
      return friendsView(db, user.id);

    case 'friend_search': {
      const q = String(body.q || '').trim();
      if (q.length < 2) return { results: [] };
      const rows = await db.searchProfiles(q, 12);
      return { results: rows.filter(p => p.id !== user.id).map(pub) };
    }

    case 'friend_add': {
      const id = String(body.userId || '');
      if (!id || id === user.id) bad('Escolha outro treinador.');
      const target = await db.getProfile(id);
      if (!target) notFound('Treinador não encontrado.');
      const rows = await db.listFriendships(user.id);
      if (rows.filter(r => r.status === 'accepted').length >= MAX_FRIENDS) bad(`Limite de ${MAX_FRIENDS} amigos.`);
      const existing = rows.find(r => (r.user_id === id && r.friend_id === user.id) || (r.user_id === user.id && r.friend_id === id));
      if (existing?.status === 'accepted') return { ok: true, message: 'Vocês já são amigos.' };
      if (existing && existing.user_id === id) { // ele já tinha pedido: aceita direto
        await db.updateFriendship(id, user.id, { status: 'accepted' });
        return { ok: true, message: `Agora você e ${target.trainer_name} são amigos!` };
      }
      await db.insertFriendship({ user_id: user.id, friend_id: id, status: 'pending' });
      return { ok: true, message: `Pedido de amizade enviado para ${target.trainer_name}.` };
    }

    case 'friend_accept': {
      const id = String(body.userId || '');
      const rows = await db.listFriendships(user.id);
      if (!rows.some(r => r.user_id === id && r.friend_id === user.id)) notFound('Pedido não encontrado.');
      await db.updateFriendship(id, user.id, { status: 'accepted' });
      return { ok: true, message: 'Amizade aceita!' };
    }

    case 'friend_remove':
      await db.deleteFriendship(user.id, String(body.userId || ''));
      return { ok: true };

    default:
      bad('Operação inválida.');
  }
}
