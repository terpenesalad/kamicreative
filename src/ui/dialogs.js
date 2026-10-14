// Menus, modals and notifications.

import { h, icon } from './dom.js';

let openMenu = null;

export function closeMenu() {
  if (openMenu) { openMenu.remove(); openMenu = null; }
}

/**
 * Show a context / popup menu at screen coords.
 * items: [{ label, shortcut, icon, disabled, checked, danger, action, submenu }] or '-' separators.
 */
export function showMenu(x, y, items, { minWidth = 180 } = {}) {
  closeMenu();
  const menu = h('div.menu', { role: 'menu', style: { minWidth: minWidth + 'px' } });
  let active = -1;
  const buttons = [];
  for (const it of items) {
    if (it === '-') { menu.appendChild(h('div.menu-sep')); continue; }
    if (it.header) { menu.appendChild(h('div.menu-header', null, it.header)); continue; }
    const b = h('button.menu-item', {
      role: 'menuitem', disabled: !!it.disabled, class: (it.danger ? 'danger ' : '') + (it.checked ? 'checked' : ''),
      onclick: (e) => { e.stopPropagation(); closeMenu(); it.action?.(); },
    },
    h('span.menu-check', null, it.checked ? '✓' : ''),
    it.swatch ? h('span.menu-swatch', { style: { background: it.swatch } }) : null,
    h('span.menu-label', null, it.label),
    it.shortcut ? h('span.menu-shortcut', null, it.shortcut) : null);
    menu.appendChild(b);
    if (!it.disabled) buttons.push(b);
  }
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  openMenu = menu;
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[active].focus();
    } else if (e.key === 'Escape') closeMenu();
  });
  setTimeout(() => buttons[0]?.focus({ preventScroll: true }), 0);
  return menu;
}

document.addEventListener('pointerdown', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }, true);
window.addEventListener('blur', closeMenu);

// ------------------------------------------------------------------ modals

export function modal({ title, body, actions = [], width = 460, onClose, className = '' }) {
  const backdrop = h('div.modal-backdrop');
  const close = (v) => { backdrop.remove(); document.removeEventListener('keydown', onKey, true); onClose?.(v); };
  const buttons = actions.map((a) => h('button.btn', {
    class: (a.primary ? 'primary ' : '') + (a.danger ? 'danger' : ''),
    onclick: () => { const r = a.action?.(); if (r !== false) close(a.value); },
  }, a.label));
  const box = h('div.modal', { role: 'dialog', 'aria-modal': 'true', class: className, style: { width: typeof width === 'number' ? width + 'px' : width } },
    h('div.modal-head', null, h('h2', null, title), h('button.icon-btn', { title: 'Close', onclick: () => close(null) }, icon('close'))),
    h('div.modal-body', null, body),
    buttons.length ? h('div.modal-foot', null, buttons) : null);
  backdrop.appendChild(box);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(null); });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      const p = actions.findIndex((a) => a.primary);
      if (p >= 0) { e.preventDefault(); buttons[p].click(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(backdrop);
  setTimeout(() => (box.querySelector('input,textarea,select') || buttons.find((b) => b.classList.contains('primary')))?.focus(), 0);
  return { close, box };
}

export function confirmDialog(title, message, { ok = 'OK', cancel = 'Cancel', danger = false, extra } = {}) {
  return new Promise((resolve) => {
    const actions = [];
    if (extra) actions.push({ label: extra, value: 'extra' });
    actions.push({ label: cancel, value: false }, { label: ok, value: true, primary: !danger, danger });
    modal({ title, body: h('p.modal-text', null, message), actions, onClose: (v) => resolve(v ?? false) });
  });
}

export function promptDialog(title, label, value = '') {
  return new Promise((resolve) => {
    const input = h('input.field', { value, spellcheck: false });
    let result = null;
    modal({
      title,
      body: h('label.form-row', null, h('span', null, label), input),
      actions: [{ label: 'Cancel' }, { label: 'OK', primary: true, action: () => { result = input.value; } }],
      onClose: () => resolve(result),
    });
    setTimeout(() => input.select(), 0);
  });
}

export function alertDialog(title, message) {
  return new Promise((resolve) => modal({ title, body: h('p.modal-text', null, message), actions: [{ label: 'OK', primary: true }], onClose: resolve }));
}

// ------------------------------------------------------------------ toasts

let toastHost = null;
export function toast(message, { kind = 'info', timeout = 3200 } = {}) {
  if (!toastHost) { toastHost = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastHost); }
  const t = h('div.toast', { class: kind }, icon(kind === 'error' ? 'warn' : 'info', 14), h('span', null, message));
  toastHost.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, timeout);
}
