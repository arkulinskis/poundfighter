// Small shared UI helpers: escaping, formatting, icons, toasts, modals.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (id) => document.getElementById(id);
export const fmtNum = (n) => Math.round(n).toLocaleString();
export const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, '0')}`;
};
export const timeAgo = (ms) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

const svgI = (body) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const I = {
  mic: svgI('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/>'),
  micOff: svgI('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/><path d="M3 3l18 18"/>'),
  flame: svgI('<path d="M12 22c4 0 7-3 7-7 0-5-4-7-5-12-2 2-3 4-3 6-1-1-2-2-2-4-2 2-4 5-4 10 0 4 3 7 7 7z"/>'),
  zap: svgI('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  grid: svgI('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  bag: svgI('<path d="M6 7h12l1 14H5z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>'),
  user: svgI('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  x: svgI('<path d="M6 6l12 12M18 6L6 18"/>'),
  bed: svgI('<path d="M3 18V6"/><path d="M3 14h18v4"/><path d="M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>'),
  desk: svgI('<rect x="4" y="5" width="16" height="10" rx="1"/><path d="M2 19h20"/>'),
  stand: svgI('<circle cx="12" cy="4" r="2"/><path d="M12 7v7"/><path d="M7 10l5-2 5 2"/><path d="M9 22l3-8 3 8"/>'),
  gift: svgI('<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8"/><path d="M12 8v13"/><path d="M12 8C10 4 6 4 6 6.5S12 8 12 8zm0 0c2-4 6-4 6-1.5S12 8 12 8z"/>'),
  check: svgI('<path d="M5 12l5 5 9-10"/>'),
  lock: svgI('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  magnet: svgI('<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/>'),
  medal: svgI('<circle cx="12" cy="15" r="6"/><path d="M8 3l2.5 6.5M16 3l-2.5 6.5"/><path d="M12 12.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" fill="currentColor" stroke="none"/>'),
  skip: svgI('<path d="M5 4l10 8-10 8z"/><path d="M19 5v14"/>'),
  cloud: svgI('<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.5 4.5 0 0 0 7 18z"/>'),
  cloudCheck: svgI('<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.5 4.5 0 0 0 7 18z"/><path d="M9.5 13.5l2 2 3.5-4"/>'),
  key: svgI('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>'),
  logout: svgI('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
  bug: svgI('<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M12 6V4M9 3l1.5 2M15 3l-1.5 2M8 11H4M20 11h-4M8 16H5M19 16h-3M12 10v10"/>'),
  bell: svgI('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  download: svgI('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  shield: svgI('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  share: svgI('<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  inbox: svgI('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7z"/>'),
  trash: svgI('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/>'),
  crown: svgI('<path d="M3 18h18L19 7l-4 4-3-6-3 6-4-4z"/>'),
};

// Shiny gold coin + amount
export const coin = (n) => `<span class="coin"><i class="coin-ic" aria-hidden="true">£</i>${fmtNum(n)}</span>`;

let toastRoot, modalRoot;

export function toast(html, kind = '') {
  toastRoot = toastRoot || $('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  toastRoot.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

export function openModal(html, { onClose, wide } = {}) {
  modalRoot = modalRoot || $('modal');
  modalRoot.innerHTML = `<div class="modal-back" data-action="close-modal"></div><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  modalRoot.classList.add('open');
  modalRoot._onClose = onClose;
  const first = modalRoot.querySelector('input, textarea, select');
  if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
}

export function closeModal() {
  modalRoot = modalRoot || $('modal');
  const cb = modalRoot._onClose;
  modalRoot._onClose = null;
  modalRoot.classList.remove('open');
  modalRoot.innerHTML = '';
  if (cb) cb();
}

export const modalOpen = () => ($('modal') || {}).classList?.contains('open');
