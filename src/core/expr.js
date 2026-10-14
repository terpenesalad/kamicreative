// KamiCreative — tiny safe math expression compiler (no eval).
// Grammar: ternary ( ?: ), || &&, comparisons, + -, * / %, unary - !, ^ (right assoc), calls, vars.

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  atan2: Math.atan2, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sqrt: Math.sqrt, pow: Math.pow, exp: Math.exp, log: Math.log, log10: Math.log10, log2: Math.log2,
  min: Math.min, max: Math.max, sign: Math.sign, hypot: Math.hypot,
  clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
  lerp: (a, b, t) => a + (b - a) * t,
  fract: (x) => x - Math.floor(x),
  mod: (a, b) => ((a % b) + b) % b,
  step: (e, x) => (x < e ? 0 : 1),
  smoothstep: (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
  rand: () => Math.random(),
  deg: (r) => (r * 180) / Math.PI,
  rad: (d) => (d * Math.PI) / 180,
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at ${i}`);
      toks.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-z_]/i.test(c)) {
      const m = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i));
      toks.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/%^(),<>!?:'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return toks;
}

/** Compile `src` into fn(vars) -> number. Throws Error with a readable message. */
export function compileExpression(src) {
  const toks = tokenize(String(src));
  let p = 0;
  const peek = () => toks[p];
  const eat = (v) => {
    const t = toks[p];
    if (!t || (v !== undefined && t.v !== v)) throw new Error(v ? `Expected "${v}"` : 'Unexpected end');
    p++;
    return t;
  };
  const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;

  function primary() {
    const t = peek();
    if (!t) throw new Error('Unexpected end of expression');
    if (t.t === 'num') { p++; const v = t.v; return () => v; }
    if (t.t === 'id') {
      p++;
      const name = t.v.toLowerCase();
      if (isOp('(')) {
        eat('(');
        const args = [];
        if (!isOp(')')) { args.push(ternary()); while (isOp(',')) { eat(','); args.push(ternary()); } }
        eat(')');
        const f = FUNCS[name];
        if (!f) throw new Error(`Unknown function "${t.v}"`);
        return (vars) => f(...args.map((a) => a(vars)));
      }
      if (name in CONSTS) { const v = CONSTS[name]; return () => v; }
      return (vars) => { const v = vars[name]; return typeof v === 'number' ? v : +v || 0; };
    }
    if (isOp('(')) { eat('('); const e = ternary(); eat(')'); return e; }
    throw new Error(`Unexpected "${t.v}"`);
  }
  function power() {
    const base = primary();
    if (isOp('^')) { eat('^'); const ex = unary(); return (v) => Math.pow(base(v), ex(v)); }
    return base;
  }
  function unary() {
    if (isOp('-')) { eat('-'); const a = unary(); return (v) => -a(v); }
    if (isOp('+')) { eat('+'); return unary(); }
    if (isOp('!')) { eat('!'); const a = unary(); return (v) => (a(v) ? 0 : 1); }
    return power();
  }
  function binary(next, ops) {
    return () => {
      let left = next();
      while (peek() && peek().t === 'op' && ops[peek().v]) {
        const f = ops[eat().v];
        const l = left, r = next();
        left = (v) => f(l(v), r(v));
      }
      return left;
    };
  }
  const mul = binary(unary, { '*': (a, b) => a * b, '/': (a, b) => (b === 0 ? 0 : a / b), '%': (a, b) => (b === 0 ? 0 : a % b) });
  const add = binary(mul, { '+': (a, b) => a + b, '-': (a, b) => a - b });
  const cmp = binary(add, { '<': (a, b) => +(a < b), '>': (a, b) => +(a > b), '<=': (a, b) => +(a <= b), '>=': (a, b) => +(a >= b) });
  const eq = binary(cmp, { '==': (a, b) => +(a === b), '!=': (a, b) => +(a !== b) });
  const and = binary(eq, { '&&': (a, b) => +(!!a && !!b) });
  const or = binary(and, { '||': (a, b) => +(!!a || !!b) });
  function ternary() {
    const c = or();
    if (isOp('?')) {
      eat('?');
      const a = ternary();
      eat(':');
      const b = ternary();
      return (v) => (c(v) ? a(v) : b(v));
    }
    return c;
  }
  if (!toks.length) return () => 0;
  const fn = ternary();
  if (p < toks.length) throw new Error(`Unexpected "${toks[p].v}"`);
  return (vars = {}) => {
    const r = fn(vars);
    return Number.isFinite(r) ? r : 0;
  };
}
