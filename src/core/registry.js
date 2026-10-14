// KamiCreative — node type registry and port type system.

export const PORT_TYPES = {
  number: { color: '#5cc8ff', label: 'Number' },
  bool: { color: '#7be38a', label: 'On/Off' },
  enum: { color: '#c9a2ff', label: 'Choice' },
  text: { color: '#ffd36b', label: 'Text' },
  color: { color: '#ff9fd0', label: 'Colour' },
  trigger: { color: '#ff7a59', label: 'Trigger' },
  video: { color: '#3ce0c4', label: 'Video' },
  media: { color: '#e0b05c', label: 'Media' },
  any: { color: '#b8c0cc', label: 'Any' },
};

export const CATEGORIES = [
  { id: 'Video Sources', color: '#1fb79e' },
  { id: 'Video FX', color: '#2aa7c9' },
  { id: 'Compositing', color: '#3b82c4' },
  { id: 'Output', color: '#e05a6a' },
  { id: 'Generators', color: '#d38a2b' },
  { id: 'Math', color: '#8f7ad8' },
  { id: 'Logic', color: '#a865c9' },
  { id: 'Control', color: '#4fae5c' },
  { id: 'Input / Output', color: '#c95f9a' },
  { id: 'Audio', color: '#c9a03b' },
  { id: 'Scene', color: '#d0563b' },
  { id: 'Utility', color: '#6b7685' },
];

const categoryColor = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]));

const types = new Map();

export function defineNode(def) {
  if (!def.type || !def.name || !def.category) throw new Error('defineNode: type, name and category are required');
  if (types.has(def.type)) throw new Error(`defineNode: duplicate type ${def.type}`);
  def.inputs = (def.inputs || []).map(normalisePort);
  def.outputs = (def.outputs || []).map(normalisePort);
  def.color = def.color || categoryColor[def.category] || '#6b7685';
  def.keywords = def.keywords || [];
  types.set(def.type, def);
  return def;
}

function normalisePort(p) {
  const port = { ...p };
  port.name = port.name || port.id;
  port.type = port.type || 'number';
  if (port.default === undefined) {
    port.default = {
      number: 0, bool: 0, enum: port.options ? port.options[0] : '', text: '', color: '#ffffff',
      trigger: 0, video: null, media: '', any: 0,
    }[port.type];
  }
  return port;
}

export function getNodeType(type) { return types.get(type); }
export function allNodeTypes() { return [...types.values()]; }

/** Ports of a node instance — supports definitions with dynamic port lists. */
export function portsOf(def, model) {
  if (def.ports) {
    const p = def.ports(model);
    return { inputs: p.inputs.map(normalisePort), outputs: p.outputs.map(normalisePort) };
  }
  return { inputs: def.inputs, outputs: def.outputs };
}

/** Can an output of type `from` connect to an input of type `to`? */
export function compatible(from, to) {
  if (from === 'video' || to === 'video') return from === to;
  return true;
}

/** Convert a value travelling along a link into the input's type. */
export function convertValue(value, port) {
  const t = port.type;
  switch (t) {
    case 'number': {
      let n = typeof value === 'string' ? parseFloat(value) : +value;
      if (!Number.isFinite(n)) n = 0;
      return clampPort(n, port);
    }
    case 'bool': {
      if (typeof value === 'string') return /^(1|true|on|yes)$/i.test(value.trim()) ? 1 : 0;
      return +value > 0.5 ? 1 : 0;
    }
    case 'enum': {
      if (typeof value === 'number' && port.options) {
        const i = Math.max(0, Math.min(port.options.length - 1, Math.round(value)));
        return port.options[i];
      }
      return port.options && port.options.includes(String(value)) ? String(value) : port.options ? port.options[0] : String(value);
    }
    case 'text': return typeof value === 'number' ? formatNumber(value) : String(value ?? '');
    case 'color': return typeof value === 'string' ? value : port.default;
    case 'media': return String(value ?? '');
    default: return value;
  }
}

export function clampPort(n, port) {
  if (port.min !== undefined && n < port.min) n = port.min;
  if (port.max !== undefined && n > port.max) n = port.max;
  if (port.int) n = Math.round(n);
  return n;
}

export function formatNumber(n) {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  const a = Math.abs(n);
  return a >= 1000 ? n.toFixed(1) : a >= 1 ? n.toFixed(3).replace(/\.?0+$/, '') : n.toFixed(4).replace(/\.?0+$/, '');
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(hex || '').trim());
  if (!m) return [1, 1, 1, 1];
  const v = parseInt(m[1], 16);
  const a = m[2] ? parseInt(m[2], 16) / 255 : 1;
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, a];
}
