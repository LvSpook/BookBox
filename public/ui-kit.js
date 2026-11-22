// Tiny DOM + UI utilities shared by the app modules.
// Keeps markup building and modal plumbing in one place instead of copy-pasted per panel.

export const el = (id) => document.getElementById(id);

export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Escapes a value for use inside a double-quoted HTML attribute.
export function attr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

export function debounce(fn, wait = 120) {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  wrapped.flush = (...args) => {
    if (timer) clearTimeout(timer);
    timer = null;
    fn(...args);
  };
  return wrapped;
}

/* ---------- modal plumbing ---------- */

// Every dialog shares: backdrop click closes, Escape closes, focus is trapped,
// and focus returns to whatever opened it.
const modalStack = [];
let focusTrapHandler = null;

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function trapFocus(container, event) {
  if (event.key !== 'Tab') return;
  const items = [...container.querySelectorAll(FOCUSABLE)].filter(
    (node) => node.offsetParent !== null || node === document.activeElement
  );
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// onClose: optional callback invoked for backdrop/Escape dismissal.
export function openModal(node, { onClose, initialFocus } = {}) {
  if (!node) return;
  const previous = document.activeElement;
  node.hidden = false;
  modalStack.push({ node, onClose, previous });

  if (!focusTrapHandler) {
    focusTrapHandler = (event) => {
      const top = modalStack[modalStack.length - 1];
      if (!top) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal(top.node, { dismissed: true });
        return;
      }
      trapFocus(top.node, event);
    };
    document.addEventListener('keydown', focusTrapHandler, true);
  }

  const target =
    (initialFocus && node.querySelector(initialFocus)) ||
    node.querySelector('input, textarea, button');
  if (target) setTimeout(() => target.focus(), 0);
}

export function closeModal(node, { dismissed = false } = {}) {
  const index = modalStack.findIndex((entry) => entry.node === node);
  if (index === -1) {
    if (node) node.hidden = true;
    return;
  }
  const [entry] = modalStack.splice(index, 1);
  if (node) node.hidden = true;
  if (entry.previous && typeof entry.previous.focus === 'function' && entry.previous.isConnected) {
    entry.previous.focus();
  }
  if (dismissed && entry.onClose) entry.onClose();
  if (modalStack.length === 0 && focusTrapHandler) {
    document.removeEventListener('keydown', focusTrapHandler, true);
    focusTrapHandler = null;
  }
}

export function topModal() {
  const top = modalStack[modalStack.length - 1];
  return top ? top.node : null;
}

export function anyModalOpen() {
  return modalStack.length > 0;
}

/* ---------- focus helpers ---------- */

// Roving focus for list-style widgets (palette rows, result rows).
export function moveFocus(container, selector, delta) {
  if (!container) return;
  const items = [...container.querySelectorAll(selector)];
  if (items.length === 0) return;
  const current = items.indexOf(document.activeElement);
  const next = current === -1 ? 0 : Math.min(items.length - 1, Math.max(0, current + delta));
  items[next].focus();
}

/* ---------- clipboard ---------- */

export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/* ---------- misc ---------- */

export function plural(count, singular, pluralForm) {
  if (count === 1) return singular;
  if (pluralForm) return pluralForm;
  if (/(s|x|ch|sh)$/.test(singular)) return `${singular}es`;
  if (/[^aeiou]y$/.test(singular)) return `${singular.slice(0, -1)}ies`;
  return `${singular}s`;
}

export function relTime(timestamp) {
  if (!timestamp) return 'never';
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, 'hour')} ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} ${plural(days, 'day')} ago`;
  const months = Math.round(days / 30.4);
  if (months < 13) return `${months} ${plural(months, 'month')} ago`;
  const years = Math.round(months / 12);
  return `${years} ${plural(years, 'year')} ago`;
}
