// Stage monitors, stage settings and the projection mapping editor.

import { h, svg, icon, clear } from './dom.js';
import { modal, showMenu, confirmDialog } from './dialogs.js';
import { surfaceOutline, resampleGrid, defaultGrid } from '../gl/warp.js';
import { cloneJSON, uid } from '../core/project.js';
import { getNodeType, portsOf } from '../core/registry.js';

const SIDEBAR_W = 300;
const PRESETS = [[1920, 1080], [1280, 720], [3840, 2160], [2560, 1440], [1920, 1200], [1024, 768], [1400, 1050], [1080, 1920], [2048, 2048], [5760, 1080]];

export class StageStrip {
  constructor(root, app) {
    this.app = app;
    this.doc = app.doc;
    this.root = root;
    this.detach = [];
    this.list = h('div.stage-list');
    root.appendChild(this.list);
    this.doc.on('load', () => this.render());
    this.doc.on('change', (e) => { if (e?.scope === 'project') this.render(); });
    this.doc.on('stage', () => this.paintButtons());
    app.on('stages', () => this.paintButtons());
    this.doc.on('change', () => this.updateHint());
    app.engine.on('scene', () => this.updateHint());
    this.render();
  }

  /** Explain, in plain words, why nothing reaches the stage — with a one-click fix. */
  updateHint() {
    this.hint?.remove();
    this.hint = null;
    const sc = this.doc.scene;
    if (!sc || !this.list) return;
    const defs = sc.nodes.map((n) => [n, getNodeType(n.type)]).filter(([, d]) => d);
    const projectors = defs.filter(([, d]) => d.projector).map(([n]) => n);
    const video = defs.filter(([n, d]) => !d.projector && portsOf(d, n).outputs.some((p) => p.type === 'video'));
    let msg = null, btn = null;
    if (video.length && !projectors.length) {
      msg = 'Nothing reaches the stage yet. Pictures only appear once they go into a Projector.';
      btn = h('button.btn.small.primary', { onclick: () => this.app.command('addProjector') }, icon('plus', 12), 'Add a Projector');
    } else if (projectors.length && !projectors.some((p) => sc.links.some((l) => l.to[0] === p.id && l.to[1] === 'video'))) {
      msg = 'The Projector has nothing plugged into its Video In.';
      btn = h('button.btn.small', { onclick: () => { this.app.patch.select([projectors[0].id]); this.app.patch.frameAll(true); } }, 'Show me');
    }
    if (!msg) return;
    this.hint = h('div.stage-hint', null, icon('warn', 16), h('p', null, msg), btn);
    this.list.appendChild(this.hint);
  }

  render() {
    for (const d of this.detach) d();
    this.detach = [];
    clear(this.list);
    const stages = this.doc.project?.stages || [];
    this.app.stageWindows.sync(stages);
    this.cards = new Map();
    stages.forEach((st, i) => {
      const canvas = h('canvas.stage-mon', { width: 256, height: 144 });
      this.detach.push(this.app.stageRenderer.addSink(st.id, canvas));
      const eye = h('button.icon-btn', { title: 'Show / hide output window', onclick: () => this.app.stageWindows.toggle(this.stage(st.id)) }, icon('eye', 14));
      const pat = h('button.icon-btn', { title: 'Test pattern', onclick: () => this.doc.updateStage(st.id, (s) => { s.testPattern = !s.testPattern; }, { label: 'Test pattern' }) }, icon('pattern', 14));
      const map = h('button.icon-btn', { title: 'Projection mapping', onclick: () => openMapper(this.app, st.id) }, icon('map', 14));
      const gear = h('button.icon-btn', { title: 'Stage settings', onclick: () => openStageSettings(this.app, st.id) }, icon('gear', 14));
      const label = h('div.stage-meta', null, h('span.stage-num', null, String(i + 1)), h('span.stage-name', null, st.name), h('span.stage-res', null, `${st.width}×${st.height}`));
      const card = h('div.stage-card', { dataset: { id: st.id } }, canvas, label, h('div.stage-btns', null, eye, map, pat, gear));
      canvas.addEventListener('dblclick', () => openMapper(this.app, st.id));
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY, [
          { header: st.name },
          { label: 'Show output window', action: () => this.app.stageWindows.open(this.stage(st.id)) },
          { label: 'Projection mapping…', action: () => openMapper(this.app, st.id) },
          { label: 'Settings…', action: () => openStageSettings(this.app, st.id) },
          '-',
          { label: 'Remove stage', danger: true, disabled: stages.length <= 1, action: () => this.doc.removeStage(st.id) },
        ]);
      });
      this.cards.set(st.id, { eye, pat });
      this.list.appendChild(card);
    });
    this.list.appendChild(h('button.stage-add', { title: 'Add stage', onclick: () => this.doc.addStage() }, icon('plus', 16), h('span', null, 'Stage')));
    this.paintButtons();
    this.updateHint();
  }

  stage(id) { return this.doc.project.stages.find((s) => s.id === id); }

  paintButtons() {
    if (!this.cards) return;
    for (const [id, c] of this.cards) {
      const st = this.stage(id);
      c.eye.classList.toggle('on', this.app.stageWindows.isOpen(id));
      c.pat.classList.toggle('on', !!st?.testPattern);
    }
  }
}

// ---------------------------------------------------------------- settings

export async function openStageSettings(app, stageId) {
  const doc = app.doc;
  const st = doc.project.stages.find((s) => s.id === stageId);
  if (!st) return;
  const displays = (await app.host.bridge.getDisplays()) || [];
  const name = h('input.field', { value: st.name });
  const w = h('input.field.num', { type: 'number', min: 16, max: 16384, value: st.width });
  const hh = h('input.field.num', { type: 'number', min: 16, max: 16384, value: st.height });
  const preset = h('select.field', null, h('option', { value: '' }, 'Presets…'), ...PRESETS.map(([a, b]) => h('option', { value: `${a}x${b}` }, `${a} × ${b}`)));
  preset.addEventListener('change', () => { if (preset.value) { const [a, b] = preset.value.split('x'); w.value = a; hh.value = b; } });
  const disp = h('select.field', null, h('option', { value: '' }, 'Window (no display)'),
    ...displays.map((d, i) => h('option', { value: String(d.id), selected: d.id === st.display }, `Display ${i + 1}: ${d.label || ''} ${d.bounds.width}×${d.bounds.height}${d.primary ? ' (primary)' : ''}`)));
  disp.addEventListener('change', () => {
    const d = displays.find((x) => String(x.id) === disp.value);
    if (d) { w.value = Math.round(d.bounds.width * (d.scaleFactor || 1)); hh.value = Math.round(d.bounds.height * (d.scaleFactor || 1)); }
  });
  const fs = h('input', { type: 'checkbox', checked: st.fullscreen });
  const bg = h('input', { type: 'color', value: st.background || '#000000' });
  modal({
    title: 'Stage settings',
    body: h('div.form', null,
      h('label.form-row', null, h('span', null, 'Name'), name),
      h('div.form-row', null, h('span', null, 'Resolution'), h('div.res-row', null, w, h('span.x', null, '×'), hh, preset)),
      h('label.form-row', null, h('span', null, 'Output display'), disp),
      h('label.check-row', null, fs, h('span', null, 'Full screen on that display')),
      h('label.form-row', null, h('span', null, 'Background'), bg),
      h('p.hint', null, 'Tip: set the resolution to the projector\'s native resolution for pixel-accurate mapping. Double-click a stage window to toggle full screen; Shift+Esc closes it.')),
    actions: [
      { label: 'Cancel' },
      {
        label: 'Apply', primary: true, action: () => {
          doc.updateStage(st.id, (s) => {
            s.name = name.value.trim() || s.name;
            s.width = Math.max(16, Math.min(16384, +w.value || s.width));
            s.height = Math.max(16, Math.min(16384, +hh.value || s.height));
            s.display = disp.value ? Number(disp.value) : null;
            s.fullscreen = fs.checked;
            s.background = bg.value;
          }, { label: 'Stage settings' });
          doc.emit('change', { scope: 'project' });
          if (app.stageWindows.isOpen(st.id)) app.stageWindows.place(st);
        },
      },
    ],
  });
}

// ----------------------------------------------------------------- mapper

export function openMapper(app, stageId) {
  const doc = app.doc;
  const getStage = () => doc.project.stages.find((s) => s.id === stageId);
  let stage = getStage();
  if (!stage) return;
  let selId = stage.mapping.surfaces[0]?.id || null;
  let selPoint = null;
  let tab = 'output';

  const canvas = h('canvas.mapper-canvas', { width: 1280, height: 720 });
  const overlay = svg('svg', { class: 'mapper-overlay', viewBox: '0 0 1 1', preserveAspectRatio: 'none' });
  const stageBox = h('div.mapper-stage', null, canvas, overlay);
  const sidebar = h('div.mapper-side');
  const tabs = h('div.seg', { role: 'tablist' });
  const patternBtn = h('button.btn.small', { onclick: () => { doc.updateStage(stageId, (s) => { s.testPattern = !s.testPattern; }, { label: 'Test pattern' }); paintHeader(); } }, icon('pattern', 13), 'Test pattern');
  const outlineBtn = h('button.btn.small', { onclick: () => { outlines = !outlines; paintHeader(); } }, icon('grid', 13), 'Outline on output');
  const enabledBox = h('input', { type: 'checkbox' });
  enabledBox.addEventListener('change', () => doc.updateStage(stageId, (s) => { s.mapping.enabled = enabledBox.checked; }, { label: 'Toggle mapping' }));
  const header = h('div.mapper-head', null, tabs, h('label.check-row.inline', null, enabledBox, h('span', null, 'Mapping on')), patternBtn, outlineBtn,
    h('button.btn.small', { onclick: () => app.stageWindows.open(getStage()) }, icon('monitor', 13), 'Show output'));
  const body = h('div.mapper', null, header, h('div.mapper-main', null, stageBox, sidebar));
  let outlines = false;

  const m = modal({ title: `Projection mapping — ${stage.name}`, body, width: 'min(1400px, 96vw)', className: 'mapper-modal', onClose: () => {
    detach();
    app.stageRenderer.highlightSurface = null;
    app.mapperOutline = null;
    window.removeEventListener('keydown', onKey, true);
    ro.disconnect();
  } });
  let detach = app.stageRenderer.addSink(stageId, canvas, { fit: 'stretch', source: 'out' });

  const setTab = (t) => {
    tab = t;
    detach();
    detach = app.stageRenderer.addSink(stageId, canvas, { fit: 'stretch', source: t === 'output' ? 'out' : 'comp' });
    paintHeader();
    drawOverlay();
  };

  function paintHeader() {
    stage = getStage();
    clear(tabs);
    for (const [id, label] of [['output', 'Output warp'], ['input', 'Input region']]) {
      tabs.appendChild(h('button', { role: 'tab', 'aria-selected': String(tab === id), class: tab === id ? 'on' : '', onclick: () => setTab(id) }, label));
    }
    patternBtn.classList.toggle('on', !!stage.testPattern);
    outlineBtn.classList.toggle('on', outlines);
    enabledBox.checked = stage.mapping.enabled !== false;
    app.stageRenderer.highlightSurface = outlines ? selId : null;
    app.mapperOutline = outlines ? stageId : null;
  }

  // Keep the canvas at the stage aspect ratio inside the available area.
  const fit = () => {
    const main = stageBox.parentElement;
    const area = main.getBoundingClientRect();
    const cs = getComputedStyle(main);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = Math.max(200, area.width - padX - SIDEBAR_W - parseFloat(cs.columnGap || cs.gap || 16));
    const availH = Math.max(160, area.height - padY);
    const a = stage.width / stage.height;
    let cw = availW, ch = availW / a;
    if (ch > availH) { ch = availH; cw = ch * a; }
    stageBox.style.width = cw + 'px';
    stageBox.style.height = ch + 'px';
    canvas.width = Math.round(cw * devicePixelRatio);
    canvas.height = Math.round(ch * devicePixelRatio);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(body);

  const surf = () => getStage().mapping.surfaces.find((s) => s.id === selId);
  const update = (fn, label, coalesce) => {
    doc.updateStage(stageId, (s) => { const sf = s.mapping.surfaces.find((x) => x.id === selId); if (sf) fn(sf, s); }, { label, coalesce });
    drawOverlay();
  };

  // ------------------------------------------------------------ overlay
  function drawOverlay() {
    clear(overlay);
    stage = getStage();
    const surfaces = stage.mapping.surfaces;
    if (tab === 'output') {
      for (const s of surfaces) {
        const pts = surfaceOutline(s.grid, 32);
        const poly = svg('polygon', { points: pts.map((p) => p.join(',')).join(' '), class: `sf-outline ${s.id === selId ? 'sel' : ''} ${s.enabled ? '' : 'off'}`, 'data-id': s.id });
        overlay.appendChild(poly);
      }
      const s = surf();
      if (s) {
        const { cols, rows, points } = s.grid;
        // grid lines between control points
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) overlay.appendChild(svg('line', { x1: points[r * cols + c][0], y1: points[r * cols + c][1], x2: points[r * cols + c + 1][0], y2: points[r * cols + c + 1][1], class: 'sf-grid' }));
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows - 1; r++) overlay.appendChild(svg('line', { x1: points[r * cols + c][0], y1: points[r * cols + c][1], x2: points[(r + 1) * cols + c][0], y2: points[(r + 1) * cols + c][1], class: 'sf-grid' }));
        points.forEach((p, i) => {
          const g = svg('g', { class: `sf-point ${selPoint === i ? 'sel' : ''}`, 'data-pt': i, transform: `translate(${p[0]},${p[1]})` });
          g.appendChild(svg('circle', { r: 1, class: 'hit' }));
          g.appendChild(svg('circle', { r: 1, class: 'dot' }));
          overlay.appendChild(g);
        });
      }
    } else {
      for (const s of surfaces) {
        const [x, y, w, hh] = s.source;
        overlay.appendChild(svg('rect', { x, y, width: w, height: hh, class: `src-rect ${s.id === selId ? 'sel' : ''}`, 'data-id': s.id }));
      }
      const s = surf();
      if (s) {
        const [x, y, w, hh] = s.source;
        [[x, y], [x + w, y], [x, y + hh], [x + w, y + hh]].forEach((p, i) => {
          const g = svg('g', { class: 'sf-point', 'data-corner': i, transform: `translate(${p[0]},${p[1]})` });
          g.appendChild(svg('circle', { r: 1, class: 'hit' }));
          g.appendChild(svg('circle', { r: 1, class: 'dot' }));
          overlay.appendChild(g);
        });
      }
    }
    // Keep handle size constant in screen pixels despite the 0..1 viewBox.
    const r = overlay.getBoundingClientRect();
    if (r.width) {
      overlay.style.setProperty('--sx', String(1 / r.width));
      for (const g of overlay.querySelectorAll('.sf-point')) {
        const [hit, dot] = g.children;
        hit.setAttribute('r', String(12 / r.width));
        dot.setAttribute('r', String(5 / r.width));
        g.setAttribute('transform', g.getAttribute('transform').replace(/ scale\(.*\)$/, '') + ` scale(1, ${r.width / r.height})`);
      }
    }
    renderSide();
  }

  const toNorm = (e) => {
    const r = overlay.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const clampN = (v) => Math.max(-0.5, Math.min(1.5, v));

  overlay.addEventListener('pointerdown', (e) => {
    const t = e.target;
    const g = t.closest('.sf-point');
    const p0 = toNorm(e);
    overlay.setPointerCapture(e.pointerId);
    const co = `map${Date.now()}`;
    if (g && g.dataset.pt !== undefined) {
      selPoint = +g.dataset.pt;
      const start = cloneJSON(surf().grid.points[selPoint]);
      drag((p, ev) => {
        const k = ev.shiftKey ? 0.1 : 1;
        update((sf) => { sf.grid.points[selPoint] = [clampN(start[0] + (p[0] - p0[0]) * k), clampN(start[1] + (p[1] - p0[1]) * k)]; }, 'Move warp point', co);
      });
      return;
    }
    if (g && g.dataset.corner !== undefined) {
      const ci = +g.dataset.corner;
      const start = [...surf().source];
      drag((p) => update((sf) => {
        let [x, y, w, hh] = start;
        const x2 = x + w, y2 = y + hh;
        const nx = Math.max(0, Math.min(1, p[0])), ny = Math.max(0, Math.min(1, p[1]));
        const L = ci % 2 === 0 ? nx : x, R = ci % 2 === 1 ? nx : x2, T = ci < 2 ? ny : y, B = ci >= 2 ? ny : y2;
        sf.source = [Math.min(L, R), Math.min(T, B), Math.max(0.01, Math.abs(R - L)), Math.max(0.01, Math.abs(B - T))];
      }, 'Edit input region', co));
      return;
    }
    const hit = t.closest('[data-id]');
    if (hit) {
      selId = hit.dataset.id;
      selPoint = null;
      paintHeader();
      drawOverlay();
      if (tab === 'output') {
        const start = cloneJSON(surf().grid.points);
        drag((p) => update((sf) => { sf.grid.points = start.map(([x, y]) => [clampN(x + p[0] - p0[0]), clampN(y + p[1] - p0[1])]); }, 'Move surface', co));
      } else {
        const start = [...surf().source];
        drag((p) => update((sf) => {
          const [x, y, w, hh] = start;
          sf.source = [Math.max(0, Math.min(1 - w, x + p[0] - p0[0])), Math.max(0, Math.min(1 - hh, y + p[1] - p0[1])), w, hh];
        }, 'Move input region', co));
      }
      return;
    }
    selPoint = null;
    drawOverlay();
  });

  function drag(fn) {
    const move = (ev) => fn(toNorm(ev), ev);
    const up = () => { overlay.removeEventListener('pointermove', move); overlay.removeEventListener('pointerup', up); };
    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('pointerup', up);
  }

  const onKey = (e) => {
    if (!document.body.contains(body)) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    const s = surf();
    if (!s) return;
    const step = (e.shiftKey ? 10 : 1);
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d && tab === 'output') {
      e.preventDefault(); e.stopPropagation();
      const dx = d[0] / stage.width, dy = d[1] / stage.height;
      update((sf) => {
        if (selPoint === null) sf.grid.points = sf.grid.points.map(([x, y]) => [x + dx, y + dy]);
        else { const p = sf.grid.points[selPoint]; sf.grid.points[selPoint] = [p[0] + dx, p[1] + dy]; }
      }, 'Nudge', `nudge${selId}${selPoint}`);
    } else if (e.key === 'Tab' && tab === 'output') {
      e.preventDefault(); e.stopPropagation();
      const n = s.grid.points.length;
      selPoint = selPoint === null ? 0 : (selPoint + (e.shiftKey ? n - 1 : 1)) % n;
      drawOverlay();
    }
  };
  window.addEventListener('keydown', onKey, true);

  // ------------------------------------------------------------ sidebar
  function renderSide() {
    clear(sidebar);
    stage = getStage();
    const list = h('ul.sf-list');
    for (const s of stage.mapping.surfaces) {
      const en = h('input', { type: 'checkbox', checked: s.enabled, title: 'Enabled', onclick: (e) => e.stopPropagation() });
      en.addEventListener('change', () => { const keep = selId; selId = s.id; update((sf) => { sf.enabled = en.checked; }, 'Toggle surface'); selId = keep; drawOverlay(); });
      list.appendChild(h('li', { class: s.id === selId ? 'sel' : '', onclick: () => { selId = s.id; selPoint = null; paintHeader(); drawOverlay(); } }, en, h('span', null, s.name)));
    }
    const addBtn = h('button.btn.small', { onclick: () => { const sf = doc.addSurface(stageId); selId = sf.id; drawOverlay(); } }, icon('plus', 12), 'Add surface');
    sidebar.append(h('div.side-head', null, h('h3', null, 'Surfaces'), addBtn), list);
    const s = surf();
    if (!s) { sidebar.append(h('p.panel-empty', null, 'Add a surface to start mapping.')); return; }

    const num = (label, get, set, { min = 0, max = 100, step = 0.1, unit = '%' } = {}) => {
      const val = +get().toFixed(3);
      const i = h('input.field.num', { type: 'number', min, max, step, value: val });
      const r = h('input.range', { type: 'range', min, max, step, value: val });
      const apply = (v, co) => { update((sf) => set(sf, Math.max(min, Math.min(max, v))), label, co); };
      i.addEventListener('change', () => apply(+i.value));
      r.addEventListener('input', () => { i.value = r.value; apply(+r.value, `${label}${selId}`); });
      return h('label.form-row', null, h('span', null, `${label}${unit ? ` (${unit})` : ''}`), h('div.num-pair', null, r, i));
    };
    const name = h('input.field', { value: s.name });
    name.addEventListener('change', () => update((sf) => { sf.name = name.value || sf.name; }, 'Rename surface'));
    const gridSel = h('select.field', null, ...[[2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [8, 8], [3, 2], [4, 3], [2, 3]].map(([c, r]) => h('option', { value: `${c}x${r}`, selected: c === s.grid.cols && r === s.grid.rows }, c === 2 && r === 2 ? 'Corner pin (2×2)' : `Mesh ${c}×${r}`)));
    gridSel.addEventListener('change', () => { const [c, r] = gridSel.value.split('x').map(Number); selPoint = null; update((sf) => { sf.grid = resampleGrid(sf.grid, c, r); }, 'Change warp grid'); });

    const act = (label, ic, fn) => h('button.btn.small', { onclick: fn }, icon(ic, 12), label);
    sidebar.append(
      h('div.side-section', null,
        h('label.form-row', null, h('span', null, 'Name'), name),
        h('label.form-row', null, h('span', null, 'Warp'), gridSel),
        h('div.btn-row.wrap', null,
          act('Reset', 'reset', () => update((sf) => { const [x, y, w, hh] = sf.source; sf.grid = defaultGrid(sf.grid.cols, sf.grid.rows, [x, y, w, hh]); }, 'Reset warp')),
          act('Flip H', 'flipH', () => update((sf) => { const { cols, rows, points } = sf.grid; sf.grid.points = points.map((_, i) => { const r = Math.floor(i / cols), c = i % cols; return [...points[r * cols + (cols - 1 - c)]]; }); }, 'Flip warp')),
          act('Flip V', 'flipV', () => update((sf) => { const { cols, rows, points } = sf.grid; sf.grid.points = points.map((_, i) => { const r = Math.floor(i / cols), c = i % cols; return [...points[(rows - 1 - r) * cols + c]]; }); }, 'Flip warp')),
          act('Duplicate', 'copy', () => doc.updateStage(stageId, (st) => { const c = cloneJSON(s); c.id = uid('s'); c.name = `${s.name} copy`; c.grid.points = c.grid.points.map(([x, y]) => [x + 0.03, y + 0.03]); st.mapping.surfaces.push(c); selId = c.id; }, { label: 'Duplicate surface' }) || drawOverlay()),
          act('Delete', 'trash', async () => { if (await confirmDialog('Delete surface?', `Remove "${s.name}"?`, { ok: 'Delete', danger: true })) { doc.updateStage(stageId, (st) => { st.mapping.surfaces = st.mapping.surfaces.filter((x) => x.id !== s.id); }, { label: 'Delete surface' }); selId = getStage().mapping.surfaces[0]?.id || null; drawOverlay(); } }))),
      h('details.side-section', { open: true }, h('summary', null, 'Input region'),
        num('X', () => s.source[0] * 100, (sf, v) => { sf.source[0] = v / 100; }),
        num('Y', () => s.source[1] * 100, (sf, v) => { sf.source[1] = v / 100; }),
        num('Width', () => s.source[2] * 100, (sf, v) => { sf.source[2] = Math.max(0.01, v / 100); }, { min: 1 }),
        num('Height', () => s.source[3] * 100, (sf, v) => { sf.source[3] = Math.max(0.01, v / 100); }, { min: 1 })),
      h('details.side-section', { open: true }, h('summary', null, 'Edge blend'),
        num('Left', () => s.blend.left * 100, (sf, v) => { sf.blend.left = v / 100; }, { max: 50 }),
        num('Right', () => s.blend.right * 100, (sf, v) => { sf.blend.right = v / 100; }, { max: 50 }),
        num('Top', () => s.blend.top * 100, (sf, v) => { sf.blend.top = v / 100; }, { max: 50 }),
        num('Bottom', () => s.blend.bottom * 100, (sf, v) => { sf.blend.bottom = v / 100; }, { max: 50 }),
        num('Gamma', () => s.blend.gamma, (sf, v) => { sf.blend.gamma = v; }, { min: 0.5, max: 3, step: 0.01, unit: '' }),
        num('Curve', () => s.blend.curve, (sf, v) => { sf.blend.curve = v; }, { min: 1, max: 5, step: 0.01, unit: '' })),
      h('details.side-section', null, h('summary', null, 'Colour trim'),
        num('Opacity', () => s.opacity * 100, (sf, v) => { sf.opacity = v / 100; }),
        num('Brightness', () => s.color.brightness * 100, (sf, v) => { sf.color.brightness = v / 100; }, { max: 200 }),
        num('Contrast', () => s.color.contrast * 100, (sf, v) => { sf.color.contrast = v / 100; }, { max: 200 }),
        num('Gamma', () => s.color.gamma, (sf, v) => { sf.color.gamma = v; }, { min: 0.2, max: 3, step: 0.01, unit: '' })),
      h('p.hint', null, tab === 'output'
        ? 'Drag corners or mesh points to warp. Drag inside a surface to move it. Arrow keys nudge by one pixel (Shift ×10); Tab steps through points.'
        : 'Choose which part of the stage picture this surface shows. Drag the rectangle or its corners.'),
    );
  }

  paintHeader();
  requestAnimationFrame(() => { fit(); drawOverlay(); });
  return m;
}
