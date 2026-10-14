// Interactive tutorial: a spotlight + instruction card that watches the project
// and moves on by itself when the learner has done each step.

import { h, icon, setText } from './dom.js';

const q = (sel) => document.querySelector(sel);

export class Tutorial {
  constructor(app) {
    this.app = app;
    this.i = 0;
    this.state = {};
    this.timer = null;
    this.doneAt = 0;
  }

  // ---------------------------------------------------------------- helpers

  scene() { return this.app.doc.scene; }
  nodeOf(type) { const n = this.scene()?.nodes.filter((x) => x.type === type); return n?.length ? n[n.length - 1] : null; }
  nodeEl(type) { const n = this.nodeOf(type); return n ? this.app.patch.views.get(n.id)?.el : null; }
  portEl(type, dir, port) { const n = this.nodeOf(type); return n ? q(`.port.${dir}[data-node="${n.id}"][data-port="${port}"]`) : null; }
  linked(a, ap, b, bp) {
    const A = this.nodeOf(a), B = this.nodeOf(b);
    return !!(A && B && this.scene().links.some((l) => l.from[0] === A.id && l.from[1] === ap && l.to[0] === B.id && l.to[1] === bp));
  }

  steps() {
    const app = this.app;
    return [
      {
        title: 'Welcome!',
        text: 'In about five minutes you will build a moving visual, send it to a screen, and learn how shows are organised. You can leave at any time with Skip, and restart from Help → Tutorial.',
      },
      {
        target: () => q('#patch'), place: 'center-inside',
        title: 'This is the patch',
        text: 'The big dark area is your canvas. You build things here by adding modules — small boxes that each do one job — and connecting them with wires.',
      },
      {
        target: () => this.nodeEl('src.noise') ? null : q('#patch'), place: 'center-inside',
        title: 'Add your first module',
        text: 'Double-click any empty spot in the patch (or press Tab). A search box appears: type noise and press Enter.',
        tip: 'You can also drag "Noise" from the Modules list on the left.',
        done: () => !!this.nodeOf('src.noise'),
      },
      {
        target: () => this.nodeEl('src.noise'),
        title: 'That is a module',
        text: 'The picture on top is a live preview of what it makes. Its settings (inputs) are listed on the left, and what it sends out (outputs) on the right. The little dots on the edges are where wires plug in.',
      },
      {
        target: () => this.nodeEl('out.projector') || q('#patch'), place: () => (this.nodeEl('out.projector') ? undefined : 'center-inside'),
        title: 'Add a Projector',
        text: 'Nothing reaches the screen until it goes into a Projector. Add one the same way: double-click empty space, type projector, press Enter.',
        done: () => !!this.nodeOf('out.projector'),
      },
      {
        target: () => this.portEl('src.noise', 'out', 'out'),
        title: 'Connect them with a wire',
        text: 'Press on the small square at Noise\'s "Video Out" and drag it onto the square at the Projector\'s "Video In". Let go when it lights up.',
        tip: 'Can\'t see both? Press F to fit everything on screen.',
        done: () => this.linked('src.noise', 'out', 'out.projector', 'video'),
      },
      {
        target: () => q('.stage-card'),
        title: 'It is on the stage',
        text: 'This little monitor shows exactly what your audience will see on Stage 1. Every Projector sends its picture to a stage.',
      },
      {
        enter: () => { const n = this.nodeOf('src.noise'); this.state.scale = n?.values?.scale; },
        target: () => { const n = this.nodeOf('src.noise'); return n ? q(`.node[data-id="${n.id}"] .cell.in[data-port="scale"] .val`) : null; },
        title: 'Change a setting',
        text: 'Press on the Scale number and drag left or right. Watch the preview and the stage change as you drag.',
        tip: 'Click a number without dragging to type an exact value.',
        done: () => { const n = this.nodeOf('src.noise'); return n && n.values?.scale !== undefined && n.values.scale !== this.state.scale; },
      },
      {
        target: () => { const n = this.nodeOf('src.noise'); return n ? q(`.node[data-id="${n.id}"] .node-head`) : null; },
        title: 'Select a module',
        text: 'Click the Noise module\'s title bar to select it. The Inspector on the right then shows all of its settings with sliders and an explanation.',
        done: () => { const n = this.nodeOf('src.noise'); return n && app.doc.selection.has(n.id) && app.doc.selection.size === 1; },
      },
      {
        target: () => q('#inspector'), place: 'left',
        title: 'The Inspector',
        text: 'Everything about the selected module is here. When nothing is selected, it shows the scene\'s settings instead.',
      },
      {
        target: () => this.nodeEl('fx.kaleido') || this.nodeEl('src.noise'),
        title: 'Add an effect in between',
        text: 'With Noise still selected, press Tab, type kaleido and press Enter. Because Noise is selected, the Kaleidoscope is placed right after it and wired in for you.',
        tip: 'Not working? Click the Noise title first so it is the only thing selected.',
        done: () => this.linked('src.noise', 'out', 'fx.kaleido', 'video') && this.linked('fx.kaleido', 'out', 'out.projector', 'video'),
      },
      {
        target: () => q('#scenes'), place: 'right',
        title: 'Scenes are your cues',
        text: 'A show is a list of scenes, played one after another. Click the + next to "Scenes" to add a second scene.',
        done: () => app.doc.project.scenes.length >= 2,
      },
      {
        target: () => q('.scene-list .scene'), place: 'right',
        title: 'Every scene has its own patch',
        text: 'You are now in the new, empty scene. Click "Scene 1" in the list to go back to your visual.',
        done: () => app.doc.project.activeScene === app.doc.project.scenes[0].id,
      },
      {
        target: () => q('.mode-seg [data-mode="live"]'),
        title: 'Live view for the show',
        text: 'When it is show time, switch to Live. Click "Live" at the top.',
        done: () => app.mode === 'live',
      },
      {
        target: () => q('.go-btn'),
        title: 'Press GO',
        text: 'GO moves to the next scene. Click it now. During a show you can also press the space bar or Page Down.',
        done: () => app.doc.project.activeScene === app.doc.project.scenes[1]?.id,
      },
      {
        target: () => q('.mode-seg [data-mode="patch"]'),
        title: 'Back to editing',
        text: 'Click "Patch" to return to the editor. (Page Up takes you back to Scene 1.)',
        done: () => app.mode === 'patch',
      },
      {
        target: () => q('.stage-card .stage-btns'), place: 'top',
        title: 'Show it on a real screen',
        text: 'The eye button opens the stage in its own window. Drag that window to a projector or second screen and double-click it for full screen. The gear chooses resolution and display; the map button bends the picture onto real objects (projection mapping).',
      },
      {
        title: 'You know the basics',
        text: 'Next ideas: try a ready-made recipe, open an example from File → Open Example, or hover over anything — the bar at the bottom explains what it does. Press F1 for keyboard shortcuts.',
        finish: true,
      },
    ];
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    this.teardown();
    document.body.classList.add('tutorial-on');
    this.list = this.steps();
    this.spot = h('div.tut-spot');
    this.card = h('div.tut-card', { role: 'dialog', 'aria-live': 'polite' });
    document.body.append(this.spot, this.card);
    this.onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop, .quickadd, .menu')) this.stop(); };
    document.addEventListener('keydown', this.onKey);
    this.onResize = () => this.position();
    window.addEventListener('resize', this.onResize);
    this.go(0);
    this.timer = setInterval(() => this.tick(), 250);
  }

  stop() {
    this.teardown();
    if (this.app.tutorial === this) this.app.tutorial = null;
  }

  teardown() {
    document.body.classList.remove('tutorial-on');
    clearInterval(this.timer);
    this.timer = null;
    this.spot?.remove();
    this.card?.remove();
    if (this.onKey) document.removeEventListener('keydown', this.onKey);
    if (this.onResize) window.removeEventListener('resize', this.onResize);
  }

  go(i) {
    this.i = Math.max(0, Math.min(this.list.length - 1, i));
    this.doneAt = 0;
    this.changedAt = performance.now();
    const s = this.list[this.i];
    s.enter?.();
    this.renderCard();
    this.position();
  }

  renderCard() {
    const s = this.list[this.i];
    const n = this.list.length;
    this.status = h('div.tut-status');
    // Ignore clicks that land right after the card changed (stray double-clicks).
    const guard = (fn) => () => { if (performance.now() - this.changedAt > 450) fn(); };
    const back = h('button.btn.small', { disabled: this.i === 0, onclick: guard(() => this.go(this.i - 1)) }, 'Back');
    const next = s.finish
      ? h('button.btn.small.primary', { onclick: guard(() => { this.stop(); this.app.toast('Tutorial finished — have fun!'); }) }, 'Finish')
      : s.done
        ? h('button.tut-link', { onclick: guard(() => this.go(this.i + 1)), title: 'Move on without doing this step' }, 'Skip step')
        : h('button.btn.small.primary', { onclick: guard(() => this.go(this.i + 1)) }, 'Next');
    const extra = s.finish ? h('button.btn.small', { onclick: guard(() => { this.stop(); this.app.command('welcome'); }) }, 'Open recipes') : null;
    this.card.replaceChildren(...[
      h('div.tut-top', null,
        h('span.tut-count', null, `Step ${this.i + 1} of ${n}`),
        h('button.tut-skip', { onclick: () => this.stop(), title: 'Leave the tutorial (Esc)' }, 'Skip tutorial')),
      h('div.tut-progress', null, h('span', { style: { width: `${((this.i + 1) / n) * 100}%` } })),
      h('h3', null, s.title),
      h('p', null, s.text),
      s.tip ? h('p.tut-tip', null, icon('info', 13), h('span', null, s.tip)) : null,
      s.done ? this.status : null,
      h('div.tut-actions', null, back, h('span.grow'), extra, next),
    ].filter(Boolean));
    if (s.done) setText(this.status, 'Waiting for you to try it…');
  }

  tick() {
    if (!this.list) return;
    const s = this.list[this.i];
    this.position();
    if (s.done && !this.doneAt) {
      let ok = false;
      try { ok = s.done(); } catch { ok = false; }
      if (ok) {
        this.doneAt = performance.now();
        this.card.classList.add('ok');
        if (this.status) { this.status.classList.add('ok'); this.status.replaceChildren(icon('dot', 12), h('span', null, 'Done — nice!')); }
        setTimeout(() => { this.card.classList.remove('ok'); if (this.list && this.list[this.i] === s) this.go(this.i + 1); }, 900);
      }
    }
  }

  position() {
    const s = this.list?.[this.i];
    if (!s) return;
    let t = null;
    try { t = s.target?.() || null; } catch { t = null; }
    const card = this.card;
    const cw = card.offsetWidth || 360, ch = card.offsetHeight || 200;
    if (!t || !t.getClientRects().length) {
      this.spot.style.display = 'none';
      this.card.classList.add('centered');
      card.style.left = `${(innerWidth - cw) / 2}px`;
      card.style.top = `${(innerHeight - ch) / 2}px`;
      return;
    }
    this.card.classList.remove('centered');
    const r = t.getBoundingClientRect();
    const pad = r.width < 40 ? 10 : 6;
    Object.assign(this.spot.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const m = 16;
    let x, y;
    const wanted = typeof s.place === 'function' ? s.place() : s.place;
    const place = wanted || (r.right + cw + m < innerWidth ? 'right' : r.left - cw - m > 0 ? 'left' : r.bottom + ch + m < innerHeight ? 'bottom' : 'top');
    if (place === 'center-inside') { x = r.right - cw - 20; y = r.top + 20; }
    else if (place === 'right') { x = r.right + m; y = r.top; }
    else if (place === 'left') { x = r.left - cw - m; y = r.top; }
    else if (place === 'bottom') { x = r.left; y = r.bottom + m; }
    else { x = r.left; y = r.top - ch - m; }
    card.style.left = `${Math.max(8, Math.min(innerWidth - cw - 8, x))}px`;
    card.style.top = `${Math.max(54, Math.min(innerHeight - ch - 8, y))}px`;
  }
}
