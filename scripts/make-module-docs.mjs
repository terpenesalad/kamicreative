// Generates docs/MODULES.md from the live module registry.
import fs from 'node:fs';
import '../src/nodes/index.js';
import { allNodeTypes, CATEGORIES, PORT_TYPES, portsOf } from '../src/core/registry.js';

const all = allNodeTypes();
const lines = [
  '# Module reference',
  '',
  `KamiCreative ships with ${all.length} modules. This page is generated from the source (\`npm run docs\`), so it always matches the app.`,
  '',
  'Port types: ' + Object.entries(PORT_TYPES).map(([k, v]) => `**${v.label}**`).join(', ') + '.',
  '',
];
for (const cat of CATEGORIES) {
  const defs = all.filter((d) => d.category === cat.id).sort((a, b) => a.name.localeCompare(b.name));
  if (!defs.length) continue;
  lines.push(`- [${cat.id}](#${cat.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}) (${defs.length})`);
}
lines.push('');
const fmt = (p) => {
  const bits = [];
  if (p.options) bits.push(p.options.join(' / '));
  if (p.min !== undefined || p.max !== undefined) bits.push(`${p.min ?? '−∞'} to ${p.max ?? '∞'}`);
  if (p.default !== undefined && p.default !== null && p.default !== '' && p.type !== 'trigger' && p.type !== 'video') bits.push(`default ${p.type === 'bool' ? (p.default ? 'on' : 'off') : p.default}`);
  return bits.join('; ');
};
for (const cat of CATEGORIES) {
  const defs = all.filter((d) => d.category === cat.id).sort((a, b) => a.name.localeCompare(b.name));
  if (!defs.length) continue;
  lines.push(`## ${cat.id}`, '');
  for (const d of defs) {
    const model = { props: d.props || {} };
    const { inputs, outputs } = portsOf(d, model);
    lines.push(`### ${d.name}`, '', d.description, '');
    if (d.ports) lines.push('_The number of ports can be changed from the module\'s context menu or the Inspector._', '');
    if (inputs.length) {
      lines.push('| Input | Type | Range / default |', '|---|---|---|');
      for (const p of inputs) lines.push(`| ${p.name} | ${PORT_TYPES[p.type].label} | ${fmt(p).replace(/\|/g, '\\|')} |`);
      lines.push('');
    }
    if (outputs.length) {
      lines.push('| Output | Type |', '|---|---|');
      for (const p of outputs) lines.push(`| ${p.name} | ${PORT_TYPES[p.type].label} |`);
      lines.push('');
    }
  }
}
fs.writeFileSync('docs/MODULES.md', lines.join('\n'));
console.log(`docs/MODULES.md: ${all.length} modules`);
