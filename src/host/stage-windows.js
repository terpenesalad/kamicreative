// KamiCreative — stage output windows.
// Windows are opened with window.open so they share this renderer process; the
// compositor then copies each stage's GPU output straight into the window's canvas.

export class StageWindows {
  constructor(app) {
    this.app = app;
    this.wins = new Map(); // stage id -> { win, canvas, detach }
  }

  isOpen(id) { const w = this.wins.get(id); return !!(w && !w.win.closed); }

  toggle(stage) { if (this.isOpen(stage.id)) this.close(stage.id); else this.open(stage); }

  open(stage) {
    if (this.isOpen(stage.id)) { this.place(stage); this.wins.get(stage.id).win.focus(); return; }
    const name = `kami-stage-${stage.id}`;
    const win = window.open('stage.html', name, 'width=960,height=540,menubar=no,toolbar=no,location=no');
    if (!win) { this.app.toast('The stage window could not be opened.', { kind: 'error' }); return; }
    const entry = { win, canvas: null, detach: null };
    this.wins.set(stage.id, entry);
    const setup = () => {
      if (entry.canvas) return;
      const doc = win.document;
      doc.title = `${stage.name} — KamiCreative`;
      let canvas = doc.getElementById('out');
      if (!canvas) {
        canvas = doc.createElement('canvas');
        canvas.id = 'out';
        doc.body.style.cssText = 'margin:0;background:#000;overflow:hidden;cursor:none';
        canvas.style.cssText = 'display:block;width:100vw;height:100vh';
        doc.body.appendChild(canvas);
      }
      entry.canvas = canvas;
      const size = () => {
        const dpr = win.devicePixelRatio || 1;
        canvas.width = Math.max(2, Math.round(win.innerWidth * dpr));
        canvas.height = Math.max(2, Math.round(win.innerHeight * dpr));
      };
      size();
      win.addEventListener('resize', size);
      entry.detach = this.app.stageRenderer.addSink(stage.id, canvas, { fit: 'stretch' });
      const idx = () => this.app.doc.project.stages.findIndex((s) => s.id === stage.id) + 1;
      const mouse = (type) => (e) => {
        const r = canvas.getBoundingClientRect();
        this.app.engine.dispatch('Mouse', { type, stage: idx(), x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, buttons: e.buttons });
      };
      canvas.addEventListener('pointermove', mouse('move'));
      canvas.addEventListener('pointerdown', mouse('down'));
      canvas.addEventListener('pointerup', mouse('up'));
      win.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && e.shiftKey) { this.close(stage.id); return; }
        this.app.handleGlobalKey(e, true);
      });
      win.addEventListener('keyup', (e) => this.app.engine.dispatch('Key', { key: e.key, down: false }));
      win.addEventListener('dblclick', () => this.app.host.bridge.placeStage(name, { toggleFullscreen: true }));
      win.addEventListener('beforeunload', () => this._cleanup(stage.id));
      this.app.emit('stages');
    };
    if (win.document.readyState === 'complete' && win.location.href !== 'about:blank') setup();
    else win.addEventListener('load', setup);
    this.place(stage);
    this.app.emit('stages');
  }

  place(stage) {
    this.app.host.bridge.placeStage(`kami-stage-${stage.id}`, {
      displayId: stage.display, fullscreen: stage.fullscreen && stage.display !== null, title: stage.name,
    });
  }

  _cleanup(id) {
    const e = this.wins.get(id);
    if (!e) return;
    e.detach?.();
    this.wins.delete(id);
    this.app.emit('stages');
  }

  close(id) {
    const e = this.wins.get(id);
    if (!e) return;
    e.detach?.();
    try { e.win.close(); } catch { /* already closed */ }
    this.wins.delete(id);
    this.app.emit('stages');
  }

  closeAll() { for (const id of [...this.wins.keys()]) this.close(id); }

  /** Drop windows whose stage no longer exists, re-title the rest. */
  sync(stages) {
    for (const id of [...this.wins.keys()]) {
      const st = stages.find((s) => s.id === id);
      if (!st) this.close(id);
      else if (this.wins.get(id).win.closed) this._cleanup(id);
    }
  }
}
