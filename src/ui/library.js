// Module library panel and the quick-add search popup.

import { h, icon, clear } from './dom.js';
import { allNodeTypes, CATEGORIES, portsOf, compatible } from '../core/registry.js';

export function searchModules(query, filter) {
  const q = query.trim().toLowerCase();
  let list = allNodeTypes();
  if (filter) list = list.filter(filter);
  if (!q) return list.sort((a, b) => CATEGORIES.findIndex((c) => c.id === a.category) - CATEGORIES.findIndex((c) => c.id === b.category) || a.name.localeCompare(b.name));
  const scored = [];
  for (const d of list) {
    const name = d.name.toLowerCase();
    let s = 0;
    if (name === q) s = 100;
    else if (name.startsWith(q)) s = 80;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) s = 60;
    else if (name.includes(q)) s = 40;
    else if (d.keywords.some((k) => k.startsWith(q))) s = 30;
    else if (d.keywords.some((k) => k.includes(q)) || d.category.toLowerCase().includes(q)) s = 15;
    else if (d.description.toLowerCase().includes(q)) s = 5;
    if (s) scored.push([s, d]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).map((x) => x[1]);
}

export class LibraryPanel {
  constructor(root, app) {
    this.app = app;
    this.search = h('input.field.search', { type: 'search', placeholder: 'Search modules', spellcheck: false, 'aria-label': 'Search modules' });
    this.list = h('div.lib-list', { role: 'list' });
    root.append(h('div.lib-search', null, icon('search', 14), this.search), this.list);
    this.collapsed = new Set(['Utility']);
    this.search.addEventListener('input', () => this.render());
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = this.list.querySelector('.lib-item'); if (first) app.addModuleAtCenter(first.dataset.type); }
      if (e.key === 'Escape') { this.search.value = ''; this.render(); }
    });
    this.render();
  }

  render() {
    clear(this.list);
    const q = this.search.value;
    const items = searchModules(q);
    if (!items.length) { this.list.appendChild(h('p.panel-empty', null, `No modules match "${q}".`)); return; }
    if (q) { for (const d of items) this.list.appendChild(this._item(d)); return; }
    for (const cat of CATEGORIES) {
      const defs = items.filter((d) => d.category === cat.id);
      if (!defs.length) continue;
      const open = !this.collapsed.has(cat.id);
      const head = h('button.lib-cat', { 'aria-expanded': String(open), style: { '--cat': cat.color }, onclick: () => { if (open) this.collapsed.add(cat.id); else this.collapsed.delete(cat.id); this.render(); } },
        h('span.chev', null, open ? '▾' : '▸'), h('span.cat-dot'), h('span', null, cat.id), h('span.count', null, String(defs.length)));
      this.list.appendChild(head);
      if (open) for (const d of defs) this.list.appendChild(this._item(d));
    }
  }

  _item(d) {
    const el = h('div.lib-item', { role: 'listitem', draggable: true, tabindex: 0, title: d.description, style: { '--cat': d.color }, dataset: { type: d.type } },
      h('span.cat-dot'), h('span.lib-name', null, d.name));
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-kami-module', d.type); e.dataTransfer.effectAllowed = 'copy'; });
    el.addEventListener('dblclick', () => this.app.addModuleAtCenter(d.type));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.app.addModuleAtCenter(d.type); });
    el.addEventListener('click', () => this.app.inspector.showType(d.type));
    return el;
  }
}

/** Quick-add popup: type to search, Enter to place. Optionally auto-connects a dragged wire. */
export function openQuickAdd(app, sx, sy, world, wire) {
  document.querySelector('.quickadd')?.remove();
  let filter = null;
  if (wire?.from) filter = (d) => d.ports ? true : d.inputs.some((p) => compatible(wire.from.type, p.type));
  if (wire?.to) filter = (d) => d.ports ? true : d.outputs.some((p) => compatible(p.type, wire.to.type));
  const input = h('input.field', { placeholder: wire ? 'Add and connect…' : 'Add module…', spellcheck: false, 'aria-label': 'Search modules' });
  const list = h('div.qa-list', { role: 'listbox' });
  const desc = h('div.qa-desc');
  const box = h('div.quickadd', null, h('div.qa-input', null, icon('search', 14), input), list, desc);
  document.body.appendChild(box);
  const r = box.getBoundingClientRect();
  box.style.left = Math.min(sx, innerWidth - r.width - 8) + 'px';
  box.style.top = Math.min(sy, innerHeight - 380) + 'px';
  let items = [], sel = 0;
  const render = () => {
    items = searchModules(input.value, filter).slice(0, 60);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    clear(list);
    items.forEach((d, i) => {
      const el = h('div.qa-item', { role: 'option', 'aria-selected': String(i === sel), class: i === sel ? 'sel' : '', style: { '--cat': d.color }, onpointerdown: (e) => { e.preventDefault(); choose(d); } },
        h('span.cat-dot'), h('span.qa-name', null, d.name), h('span.qa-cat', null, d.category));
      el.addEventListener('pointerenter', () => { sel = i; paint(); });
      list.appendChild(el);
    });
    paint();
  };
  const paint = () => {
    [...list.children].forEach((c, i) => { c.classList.toggle('sel', i === sel); c.setAttribute('aria-selected', String(i === sel)); });
    list.children[sel]?.scrollIntoView({ block: 'nearest' });
    desc.textContent = items[sel]?.description || 'No module matches.';
  };
  const close = () => { box.remove(); document.removeEventListener('pointerdown', outside, true); };
  const choose = (d) => {
    close();
    let [x, y] = world;
    if (wire?.from) y -= 20;
    if (wire?.to) x -= 240;
    const m = app.patch._addAt(d.type, x, y);
    if (wire?.from) {
      const p = portsOf(d, m).inputs.find((q) => compatible(wire.from.type, q.type) && (wire.from.type !== 'trigger' || q.type === 'trigger')) || portsOf(d, m).inputs.find((q) => compatible(wire.from.type, q.type));
      if (p) app.doc.connect([wire.from.node, wire.from.port], [m.id, p.id]);
    } else if (wire?.to) {
      const p = portsOf(d, m).outputs.find((q) => compatible(q.type, wire.to.type));
      if (p) app.doc.connect([m.id, p.id], [wire.to.node, wire.to.port]);
    }
  };
  const outside = (e) => { if (!box.contains(e.target)) close(); };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) choose(items[sel]); }
    else if (e.key === 'Escape') close();
    e.stopPropagation();
  });
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  render();
  input.focus();
}
