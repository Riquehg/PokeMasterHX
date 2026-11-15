// Utilitários de interface: escape, toasts, modais e delegação de cliques.

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, kind = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 5000 : 3500);
}

/** Abre um modal. content é HTML; retorna o elemento overlay (fecha com close()). */
export function openModal(id, title, content, { wide = false, onClose = null, closable = true } = {}) {
  closeModal(id);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = id;
  ov.innerHTML = `
    <div class="card modal ${wide ? 'wide' : ''}">
      <div class="head"><h2>${title}</h2>${closable ? `<button class="x" data-close="${id}" aria-label="Fechar">✕</button>` : ''}</div>
      <div class="body">${content}</div>
    </div>`;
  ov.addEventListener('click', e => {
    if (closable && (e.target === ov || e.target.closest('[data-close]'))) { closeModal(id); onClose && onClose(); }
  });
  document.body.appendChild(ov);
  return ov;
}

export function closeModal(id) {
  document.getElementById(id)?.remove();
}

export function setModalBody(id, html) {
  const b = document.querySelector(`#${id} .body`);
  if (b) b.innerHTML = html;
}

/** Delegação: qualquer elemento com data-act="nome" chama handlers[nome](dataset, elemento). */
export function bindActions(root, handlers) {
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el) || el.disabled) return;
    const fn = handlers[el.dataset.act];
    if (fn) { e.preventDefault(); fn({ ...el.dataset }, el); }
  });
}

export function hpClass(ratio) {
  return ratio <= 0.25 ? 'low' : ratio <= 0.5 ? 'mid' : '';
}

export function confirmBox(msg) {
  return window.confirm(msg);
}
