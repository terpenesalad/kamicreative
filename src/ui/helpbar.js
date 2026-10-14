// Hover help: the status bar explains whatever is under the pointer, in plain words.

import { getNodeType, PORT_TYPES } from '../core/registry.js';
import { icon, setText } from './dom.js';

const IDLE = 'Hover over anything to see what it does. New here? Help → Interactive tutorial.';

const VALUE_HELP = {
  number: 'Drag left or right to change this number (hold Shift for fine steps). Click it to type a value.',
  bool: 'Click to switch this on or off.',
  enum: 'Click to choose from a list.',
  media: 'Click to choose a file from the Media bin.',
  trigger: 'Click to fire this trigger now.',
  color: 'Click to pick a colour.',
  text: 'Click to type text.',
  any: 'Click to type a value.',
};

function moduleOf(el) {
  const id = el.closest('.node')?.dataset.id;
  return id ? window.kamiApp?.doc.node(id) : null;
}

export function describe(el) {
  if (!el || !el.closest) return null;
  const port = el.closest('.port');
  if (port) {
    const name = port.closest('.cell')?.querySelector('.pname')?.textContent || port.dataset.port;
    const type = PORT_TYPES[port.dataset.type]?.label || '';
    return port.dataset.dir === 'out'
      ? `Output "${name}" (${type}). Drag from here onto another module's input to connect them.`
      : `Input "${name}" (${type}). Drop a wire here. Drag from a connected input to unplug or move its wire.`;
  }
  const val = el.closest('.val');
  if (val && !val.classList.contains('out')) {
    if (val.closest('.cell')?.classList.contains('linked')) return 'This setting is controlled by the wire plugged into it. Unplug the wire to edit it by hand.';
    return VALUE_HELP[val.dataset.type] || VALUE_HELP.any;
  }
  if (el.closest('.val.out')) return 'The live value this module is sending out right now.';
  if (el.closest('.node-preview')) return 'Live preview of this module\'s picture. Turn previews off from the right-click menu.';
  if (el.closest('.widget')) return 'A control you can use while the show runs. It also appears in Live view.';
  const head = el.closest('.node-head');
  if (head) {
    const m = moduleOf(head);
    const d = m && getNodeType(m.type);
    if (d) return `${m.title || d.name}: ${d.description} Drag to move · double-click the name to rename · right-click for more.`;
  }
  if (el.closest('.wire-hit')) return 'A connection. Click to select it, then press Delete to remove it.';
  const lib = el.closest('.lib-item');
  if (lib) { const d = getNodeType(lib.dataset.type); if (d) return `${d.name}: ${d.description} Double-click to add it, or drag it into the patch.`; }
  if (el.closest('.lib-cat')) return 'Click to show or hide this group of modules.';
  if (el.closest('.scene')) return 'A scene (cue). Click to go to it, double-click to rename, drag to reorder, right-click for more.';
  if (el.closest('.stage-mon')) return 'What the audience sees on this stage, live. Double-click to open projection mapping.';
  if (el.closest('.stage-hint')) return 'KamiCreative noticed something that will stop your picture from showing. Click the button to fix it.';
  if (el.closest('.media-item')) return 'A media file. Drag it into the patch to make a player for it, or right-click for more.';
  if (el.closest('.patch-viewport') && !el.closest('.node')) return 'The patch. Double-click (or press Tab) to add a module · Space+drag to move around · scroll to zoom · F fits everything on screen.';
  const titled = el.closest('[title]');
  if (titled && titled.title) return titled.title;
  return null;
}

export function installHelpBar(app, target) {
  const text = document.createElement('span');
  target.append(icon('info', 12), text);
  setText(text, IDLE);
  let last = null;
  document.addEventListener('pointerover', (e) => {
    if (e.target === last) return;
    last = e.target;
    const msg = describe(e.target);
    setText(text, msg || IDLE);
    target.classList.toggle('active', !!msg);
  });
  document.addEventListener('pointerleave', () => { setText(text, IDLE); target.classList.remove('active'); });
}
