// Scene list (cue list).

import { h, icon, clear } from './dom.js';
import { showMenu, promptDialog, confirmDialog } from './dialogs.js';

export class ScenesPanel {
  constructor(root, app) {
    this.app = app;
    this.doc = app.doc;
    this.list = h('ol.scene-list', { role: 'listbox', 'aria-label': 'Scenes' });
    const add = h('button.icon-btn', { title: 'Add scene (Ctrl+Shift+N)', onclick: () => this.addScene() }, icon('plus', 14));
    root.querySelector('.panel-actions')?.append(add);
    root.appendChild(this.list);
    this.doc.on('load', () => this.render());
    this.doc.on('change', () => this.render());
    app.engine.on('scene', () => this.render());
    this.render();
  }

  addScene() {
    const i = this.doc.project.scenes.findIndex((s) => s.id === this.doc.project.activeScene);
    const sc = this.doc.addScene(i);
    this.doc.goScene(sc.id, 0);
  }

  render() {
    clear(this.list);
    const p = this.doc.project;
    if (!p) return;
    const live = new Set(this.app.engine.runtimes.map((r) => r.id));
    p.scenes.forEach((sc, i) => {
      const active = sc.id === p.activeScene;
      const item = h('li.scene', {
        role: 'option', 'aria-selected': String(active), tabindex: 0, draggable: true,
        class: `${active ? 'active' : ''} ${live.has(sc.id) && !active ? 'fading' : ''}`,
        dataset: { id: sc.id },
      },
      h('span.scene-num', null, String(i + 1)),
      h('span.scene-name', null, sc.name),
      sc.fadeIn ? h('span.scene-fade', { title: 'Cross-fade in' }, `${sc.fadeIn}s`) : null,
      h('span.scene-count', { title: 'Modules' }, String(sc.nodes.length)));
      item.addEventListener('click', () => { if (!active) this.doc.goScene(sc.id); });
      item.addEventListener('dblclick', () => this.rename(sc));
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.doc.goScene(sc.id); if (e.key === 'F2') this.rename(sc); });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY, [
          { header: sc.name },
          { label: 'Go to scene', action: () => this.doc.goScene(sc.id) },
          { label: 'Rename…', shortcut: 'F2', action: () => this.rename(sc) },
          { label: 'Duplicate', action: () => this.doc.duplicateScene(sc.id) },
          { label: 'Insert scene after', action: () => { const s = this.doc.addScene(i); this.doc.goScene(s.id, 0); } },
          '-',
          { label: 'Delete scene', danger: true, disabled: p.scenes.length <= 1, action: () => this.remove(sc) },
        ]);
      });
      item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-kami-scene', sc.id); e.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('application/x-kami-scene')) { e.preventDefault(); item.classList.add('drop'); } });
      item.addEventListener('dragleave', () => item.classList.remove('drop'));
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drop');
        const id = e.dataTransfer.getData('application/x-kami-scene');
        if (id && id !== sc.id) this.doc.moveScene(id, i);
      });
      this.list.appendChild(item);
    });
  }

  async rename(sc) {
    const name = await promptDialog('Rename scene', 'Scene name', sc.name);
    if (name && name.trim()) this.doc.updateScene(sc.id, { name: name.trim() }, `rn${Date.now()}`);
  }

  async remove(sc) {
    const ok = sc.nodes.length === 0 || await confirmDialog('Delete scene?', `"${sc.name}" and its ${sc.nodes.length} modules will be removed. You can undo this.`, { ok: 'Delete', danger: true });
    if (ok) this.doc.deleteScene(sc.id);
  }
}
