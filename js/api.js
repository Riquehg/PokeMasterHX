// Comunicação com o backend: autenticação (Supabase Auth ou login de dev), chamadas /api e tempo real.
import { setSpritesUrl } from './config.js';

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const net = {
  mode: 'offline', // 'prod' | 'dev' | 'offline'
  config: null,
  sb: null,
  user: null, // { id, email }
  devToken: null
};

export async function initNet() {
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (!r.ok) throw new Error('sem /api');
    net.config = await r.json();
  } catch {
    net.mode = 'offline';
    return net;
  }
  if (net.config.storageUrl) setSpritesUrl(net.config.storageUrl);
  if (net.config.dev) {
    net.mode = 'dev';
    net.devToken = localStorage.getItem('pmhx_dev_token');
    if (net.devToken) net.user = { id: null, email: net.devToken.slice(4) };
    return net;
  }
  if (!net.config.supabaseUrl || !net.config.supabaseAnonKey) {
    console.warn('Backend sem SUPABASE_URL/SUPABASE_ANON_KEY — só o modo local está disponível.');
    net.mode = 'offline';
    return net;
  }
  try {
    // 🔑 veio pelo link "recuperar senha" do e-mail? (o Supabase limpa o endereço ao abrir)
    net.recovery = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);
    const { createClient } = await import(SUPABASE_ESM);
    net.sb = createClient(net.config.supabaseUrl, net.config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    net.sb.auth.onAuthStateChange(ev => {
      if (ev === 'PASSWORD_RECOVERY') { net.recovery = true; window.dispatchEvent(new Event('pmhx-recovery')); }
    });
    const { data } = await net.sb.auth.getSession();
    if (data.session) net.user = { id: data.session.user.id, email: data.session.user.email };
    net.mode = 'prod';
  } catch (e) {
    console.error('Falha ao carregar o Supabase:', e);
    net.mode = 'offline';
  }
  return net;
}

async function token() {
  if (net.mode === 'dev') return net.devToken;
  if (net.mode === 'prod') {
    const { data } = await net.sb.auth.getSession();
    return data.session?.access_token || null;
  }
  return null;
}

export async function signIn(email, password) {
  email = String(email || '').trim().toLowerCase();
  if (!email.includes('@')) throw new Error('Informe um e-mail válido.');
  if (net.mode === 'dev') {
    net.devToken = 'dev:' + email;
    localStorage.setItem('pmhx_dev_token', net.devToken);
    net.user = { id: null, email };
    return net.user;
  }
  if (net.mode !== 'prod') throw new Error('Servidor indisponível. Use o modo local.');
  const { data, error } = await net.sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateAuth(error.message));
  net.user = { id: data.user.id, email: data.user.email };
  return net.user;
}

export async function signUp(email, password, trainerName) {
  email = String(email || '').trim().toLowerCase();
  if (net.mode === 'dev') return signIn(email, password);
  if (net.mode !== 'prod') throw new Error('Servidor indisponível. Use o modo local.');
  if (String(password).length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  const { data, error } = await net.sb.auth.signUp({
    email, password, options: { data: { trainer_name: trainerName || email.split('@')[0] } }
  });
  if (error) throw new Error(translateAuth(error.message));
  if (!data.session) return { needsConfirmation: true };
  net.user = { id: data.user.id, email: data.user.email };
  return net.user;
}

export async function resetPassword(email) {
  if (net.mode !== 'prod') throw new Error('Disponível apenas online.');
  const { error } = await net.sb.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: location.origin });
  if (error) throw new Error(translateAuth(error.message));
}

/** 🔑 Troca a senha de quem está logado (usado depois do link de recuperação). */
export async function setNewPassword(password) {
  if (net.mode !== 'prod') throw new Error('Disponível apenas online.');
  if (String(password).length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  const { error } = await net.sb.auth.updateUser({ password: String(password) });
  if (error) throw new Error(translateAuth(error.message));
  net.recovery = false;
}

export async function signOut() {
  if (net.mode === 'prod') await net.sb.auth.signOut();
  localStorage.removeItem('pmhx_dev_token');
  net.devToken = null;
  net.user = null;
}

function translateAuth(msg) {
  const m = String(msg).toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered')) return 'Este e-mail já tem conta. Use "Entrar".';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail (veja a caixa de entrada) antes de entrar.';
  if (m.includes('password')) return 'Senha inválida (mínimo 6 caracteres).';
  if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde um pouco.';
  return msg;
}

export async function api(path, body, method = 'POST') {
  const t = await token();
  const headers = { 'Content-Type': 'application/json' };
  if (t) headers.Authorization = 'Bearer ' + t;
  let url = '/api/' + path;
  const init = { method, headers };
  if (method === 'GET') {
    if (body) url += '?' + new URLSearchParams(body).toString();
  } else init.body = JSON.stringify(body || {});
  let r;
  try {
    r = await fetch(url, init);
  } catch {
    throw new Error('Sem conexão com o servidor.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `Erro ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

/**
 * Escuta mudanças de uma partida. Em produção usa o Supabase Realtime (postgres_changes);
 * no servidor de dev usa Server-Sent Events. Em ambos, só serve de "aviso" — o cliente busca o estado
 * pela API, que é sempre consistente. Retorna função para cancelar.
 */
export function watchMatch(matchId, onPing) {
  if (net.mode === 'dev') {
    const es = new EventSource('/api/_events?matchId=' + encodeURIComponent(matchId));
    es.onmessage = () => onPing();
    return () => es.close();
  }
  if (net.mode === 'prod') {
    const ch = net.sb.channel('match-' + matchId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, () => onPing())
      .subscribe();
    return () => net.sb.removeChannel(ch);
  }
  return () => {};
}
