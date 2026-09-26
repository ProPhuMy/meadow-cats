// Test-only helpers: evaluate the bank's displayed Unicode math text so the
// oracle checks what players actually see, not a parallel data field.

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', 'ˣ': 'x' };
const FRAC = { '½': '(1/2)', '⅓': '(1/3)', '¼': '(1/4)', '⅔': '(2/3)', '¾': '(3/4)', '⅖': '(2/5)' };
const FUNCS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, abs: Math.abs, sqrt: Math.sqrt };

/** Parses expression text like "x²eˣ/2 − ½ ln|x| + C" into x => number. */
export function parseExpr(text) {
  let s = text.replace(/\s*\+\s*C$/, '').replace(/−/g, '-').replace(/·/g, '*');
  s = s.replace(/[½⅓¼⅔¾⅖]/g, (m) => FRAC[m]);
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ˣ]+/g, (m) => `^(${[...m].map((c) => SUP[c]).join('')})`);
  s = s.replace(/\|([^|]+)\|/g, 'abs($1)');

  const tokens = [];
  const re = /\s*(\d+(?:\.\d+)?|sin|cos|tan|ln|abs|sqrt|[xeπ]|[-+*/^()])/y;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) tokens.push(m[1]);
  if (s.slice(re.lastIndex).trim()) throw new Error(`Cannot parse "${text}" at "${s.slice(re.lastIndex)}"`);

  let i = 0;
  const peek = () => tokens[i];
  const eat = (t) => {
    if (tokens[i] !== t) throw new Error(`Expected ${t} in "${text}"`);
    i++;
  };
  const startsAtom = (t) => t !== undefined && (/^\d/.test(t) || t in FUNCS || 'xeπ('.includes(t));

  function expr() {
    let left = term();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[i++];
      const a = left, b = term();
      left = op === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return left;
  }
  function term() {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t === '*' || t === '/') {
        i++;
        const a = left, b = unary();
        left = t === '*' ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
      } else if (startsAtom(t)) {
        const a = left, b = power();
        left = (x) => a(x) * b(x);
      } else return left;
    }
  }
  function unary() {
    if (peek() === '-') {
      i++;
      const a = power();
      return (x) => -a(x);
    }
    return power();
  }
  function power() {
    const base = atom();
    if (peek() !== '^') return base;
    i++;
    const exp = unary();
    return (x) => base(x) ** exp(x);
  }
  function atom() {
    const t = tokens[i++];
    if (t === undefined) throw new Error(`Unexpected end in "${text}"`);
    if (/^\d/.test(t)) { const v = Number(t); return () => v; }
    if (t === 'x') return (x) => x;
    if (t === 'e') return () => Math.E;
    if (t === 'π') return () => Math.PI;
    if (t in FUNCS) { const f = FUNCS[t], a = atom(); return (x) => f(a(x)); }
    if (t === '(') { const e = expr(); eat(')'); return e; }
    throw new Error(`Unexpected ${t} in "${text}"`);
  }

  const fn = expr();
  if (i !== tokens.length) throw new Error(`Trailing tokens in "${text}"`);
  return fn;
}

/** All numbers in a numeric answer, e.g. "x = 4 or x = −2/3" -> [4, -0.666…]. */
export function nums(text) {
  return [...text.replace(/−/g, '-').matchAll(/-?\d+(?:\.\d+)?(?:\/\d+)?/g)]
    .map(([t]) => t.split('/').map(Number).reduce((a, b) => a / b));
}

export const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

export const derivative = (f) => (x) => {
  const h = 1e-4 * Math.max(1, Math.abs(x));
  return (f(x + h) - f(x - h)) / (2 * h);
};

/** Composite Simpson's rule; handles reversed bounds via negative step. */
export function integral(f, a, b, n = 2000) {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * f(a + k * h);
  return (s * h) / 3;
}

/** Dense grid search including both endpoints: returns { x, y } of the extreme. */
export function extreme(f, a, b, sign = 1, n = 200000) {
  let best = { x: a, y: f(a) };
  for (let k = 1; k <= n; k++) {
    const x = a + ((b - a) * k) / n, y = f(x);
    if (sign * y > sign * best.y) best = { x, y };
  }
  return best;
}

/** Real roots of ax² + bx + c = 0 by the quadratic formula, deduplicated, ascending. */
export function quadRoots(a, b, c) {
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  const r = [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)];
  return d === 0 ? [r[0]] : r;
}
