// Tiny DOM helpers.

export function h(tag, props, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv === undefined || sv === null) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
        }
      }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function svg(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function setText(el, text) {
  text = String(text);
  if (el.textContent !== text) el.textContent = text;
}

/** Inline SVG icons (stroke style, 16px grid). */
const ICONS = {
  play: 'M5 3l8 5-8 5z',
  stop: 'M4 4h8v8H4z',
  plus: 'M8 3v10M3 8h10',
  minus: 'M3 8h10',
  trash: 'M3 4h10M6 4V2.5h4V4M4.5 4l.7 9h5.6l.7-9',
  eye: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 100 4 2 2 0 000-4z',
  gear: 'M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  grid: 'M2 2h12v12H2zM2 6h12M2 10h12M6 2v12M10 2v12',
  map: 'M2 3l4 1.5 4-1.5 4 1.5v9l-4-1.5-4 1.5-4-1.5zM6 4.5v9M10 3v9',
  folder: 'M1.5 4h5l1.5 1.5h6.5v7.5H1.5z',
  film: 'M2 3h12v10H2zM5 3v10M11 3v10M2 6h3M2 10h3M11 6h3M11 10h3',
  image: 'M2 3h12v10H2zM2 11l4-4 3 3 2-2 3 3M10.5 6a1 1 0 100-.01',
  sound: 'M2 6h3l3-3v10l-3-3H2zM11 5.5a3.5 3.5 0 010 5M12.5 3.5a6 6 0 010 9',
  bolt: 'M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z',
  next: 'M3 3l7 5-7 5zM12 3v10',
  prev: 'M13 3L6 8l7 5zM4 3v10',
  monitor: 'M1.5 2.5h13v9h-13zM5.5 14h5M8 11.5V14',
  close: 'M4 4l8 8M12 4l-8 8',
  search: 'M7 2.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM10.5 10.5L14 14',
  undo: 'M5 3L2 6l3 3M2 6h7a4 4 0 010 8H6',
  redo: 'M11 3l3 3-3 3M14 6H7a4 4 0 000 8h3',
  copy: 'M5 5h8v9H5zM3 11V2h8',
  link: 'M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1',
  pattern: 'M2 2h12v12H2zM2 2l12 12M14 2L2 14M8 2v12M2 8h12',
  sliders: 'M3 2v12M8 2v12M13 2v12M1.5 10h3M6.5 5h3M11.5 8h3',
  layers: 'M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3',
  info: 'M8 1.5a6.5 6.5 0 110 13 6.5 6.5 0 010-13zM8 7v4.5M8 4.5v.5',
  warn: 'M8 2l6.5 11.5h-13zM8 6.5v3.5M8 11.5v.5',
  drag: 'M6 3v.01M10 3v.01M6 8v.01M10 8v.01M6 13v.01M10 13v.01',
  fullscreen: 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4',
  power: 'M8 1.5v6M4.5 3.8a5.5 5.5 0 107 0',
  reset: 'M2.5 8a5.5 5.5 0 101.6-3.9M2.5 2.5v3h3',
  flipH: 'M8 1.5v13M6 4L2 8l4 4zM10 4l4 4-4 4z',
  flipV: 'M1.5 8h13M4 6l4-4 4 4zM4 10l4 4 4-4z',
  dot: 'M8 6a2 2 0 100 4 2 2 0 000-4z',
};

export function icon(name, size = 16) {
  const s = svg('svg', { viewBox: '0 0 16 16', width: size, height: size, class: 'icon', 'aria-hidden': 'true' });
  const p = svg('path', { d: ICONS[name] || ICONS.dot });
  s.appendChild(p);
  return s;
}

export function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
