// Media bin.

import { h, icon, clear } from './dom.js';
import { showMenu } from './dialogs.js';

const KIND_ICON = { video: 'film', image: 'image', audio: 'sound' };

export class MediaPanel {
  constructor(root, app) {
    this.app = app;
    this.doc = app.doc;
    this.list = h('ul.media-list', { 'aria-label': 'Media bin' });
    root.querySelector('.panel-actions')?.append(h('button.icon-btn', { title: 'Import media (Ctrl+I)', onclick: () => app.importMedia() }, icon('plus', 14)));
    root.appendChild(this.list);
    root.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); root.classList.add('drop'); } });
    root.addEventListener('dragleave', () => root.classList.remove('drop'));
    root.addEventListener('drop', (e) => {
      root.classList.remove('drop');
      const files = [...e.dataTransfer.files];
      if (!files.length) return;
      e.preventDefault();
      app.importFiles(files.map((f) => ({ path: app.host.bridge.pathForFile?.(f) || f.path || f.name, name: f.name, file: f })));
    });
    this.doc.on('load', () => this.render());
    this.doc.on('change', () => this.render());
    this.render();
  }

  render() {
    clear(this.list);
    const media = this.doc.project?.media || [];
    if (!media.length) {
      this.list.appendChild(h('li.panel-empty', null, 'Drop video, image or sound files here, or use Import.'));
      return;
    }
    for (const m of media) {
      const used = this.doc.project.scenes.some((s) => s.nodes.some((n) => Object.values(n.values || {}).includes(m.id)));
      const el = h('li.media-item', { draggable: true, tabindex: 0, title: m.path, class: m.missing ? 'missing' : '' },
        icon(KIND_ICON[m.kind] || 'film', 14), h('span.media-name', null, m.name),
        m.missing ? h('span.badge.err', null, 'missing') : used ? null : h('span.badge', null, 'unused'));
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-kami-media', m.id); e.dataTransfer.effectAllowed = 'copy'; });
      el.addEventListener('dblclick', () => { const [x, y] = this.app.patch.centerWorld(); this.app.addMediaNode(m.id, x, y); });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY, [
          { header: m.name },
          { label: 'Add player to patch', action: () => { const [x, y] = this.app.patch.centerWorld(); this.app.addMediaNode(m.id, x, y); } },
          { label: 'Show in folder', disabled: !this.app.host.bridge.isElectron, action: () => this.app.host.bridge.showItemInFolder(m.path) },
          { label: 'Relink…', action: () => this.app.relinkMedia(m.id) },
          '-',
          { label: 'Remove from project', danger: true, action: () => this.doc.removeMedia(m.id) },
        ]);
      });
      this.list.appendChild(el);
    }
  }
}
