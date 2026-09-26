import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, getQuestions } from '../questions.mjs';
import { parseExpr, nums, close, derivative, integral, extreme, quadRoots } from './math.mjs';

// ---- Oracle: independent checks written from each prompt's math. ----
// "values" checks receive the numbers in a choice; "fn" checks receive the
// choice parsed as a function of x. Exactly one choice must pass.
const MIXED = [-1.7, -0.6, 0.3, 1.3, 2.6];
const POS = [0.3, 0.7, 1.3, 1.9, 2.6];

const values = (check) => ({ kind: 'values', check });
const fn = (check, anti = false) => ({ kind: 'fn', check, anti });

const lin = (f) => values((v) => v.length === 1 && close(f(v[0]), 0));
const bothRoots = (a, b, c) => values((v) => {
  const r = quadRoots(a, b, c);
  const s = [...v].sort((p, q) => p - q);
  return s.length === r.length && s.every((x, k) => close(x, r[k]));
});
const pickRoot = (a, b, c, sel) => values((v) => v.length === 1 && close(v[0], sel(quadRoots(a, b, c))));
const num = (expected, tol) => values((v) => v.length === 1 && close(v[0], expected, tol));
const same = (p, pts = MIXED) => fn((g) => pts.every((x) => close(g(x), p(x))));
const deriv = (f, pts = MIXED) => fn((g) => pts.every((x) => close(g(x), derivative(f)(x), 1e-5)));
const anti = (f, pts = MIXED) => fn((g) => pts.every((x) => close(derivative(g)(x), f(x), 1e-5)), true);
const argMax = (f, a, b) => num(extreme(f, a, b, 1).x, 1e-3);
const argMin = (f, a, b) => num(extreme(f, a, b, -1).x, 1e-3);
const maxVal = (f, a, b) => num(extreme(f, a, b, 1).y, 1e-6);
const minVal = (f, a, b) => num(extreme(f, a, b, -1).y, 1e-6);

const ORACLE = {
  // Linear equations: the solution satisfies lhs − rhs = 0.
  k01: lin((x) => 3 * x + 7 - 22),
  k02: lin((x) => 5 * x - 4 - (2 * x + 14)),
  k03: lin((x) => 4 * (x - 3) - (2 * x + 6)),
  k04: lin((x) => x / 3 + 2 - 7),
  k05: lin((x) => 7 - 2 * x - (3 * x - 8)),
  k06: lin((x) => 2 * (x + 5) - 3 - (4 * x - 1)),
  k07: lin((x) => (2 * x - 1) / 5 - 3),
  k08: lin((x) => 0.5 * x + 3 - (1.5 * x - 5)),
  k09: lin((x) => 3 * (2 * x - 4) - 2 * (x + 6)),
  k10: lin((x) => 5 * x + 2 - 3 * (x - 4)),
  // Factoring: the factored form equals the original polynomial everywhere.
  k11: same((x) => x ** 2 + 5 * x + 6),
  k12: same((x) => x ** 2 - 9),
  k13: same((x) => x ** 2 - 7 * x + 12),
  k14: same((x) => x ** 2 + 2 * x - 15),
  k15: same((x) => 2 * x ** 2 + 7 * x + 3),
  k16: same((x) => 3 * x ** 2 - 12),
  k17: same((x) => x ** 2 - 10 * x + 25),
  k18: same((x) => 6 * x ** 2 - x - 2),
  k19: same((x) => x ** 3 - 4 * x),
  k20: same((x) => 4 * x ** 2 - 25),
  // Quadratic roots via the quadratic formula.
  k21: bothRoots(1, -5, 6),
  k22: bothRoots(1, -1, -12),
  k23: bothRoots(2, 0, -8),
  k24: bothRoots(1, 6, 9),
  k25: pickRoot(1, 2, -8, (r) => r.find((x) => x > 0)),
  k26: bothRoots(3, -10, -8),
  k27: bothRoots(1, -7, 0),
  k28: pickRoot(1, -3, -10, (r) => r.find((x) => x < 0)),
  k29: bothRoots(2, 1, -6),
  k30: pickRoot(1, -11, 28, (r) => Math.max(...r)),
  // Derivatives: compare against a numerical derivative of f.
  f01: deriv((x) => x ** 3 + 2 * x),
  f02: deriv((x) => 5 * x ** 4 - 3 * x ** 2 + 7),
  f03: deriv((x) => -4 * x ** 3 + x),
  f04: deriv((x) => 2 * x ** 5 - x ** 3 + 4 * x - 9),
  f05: deriv((x) => (x + 1) ** 2),
  f06: deriv((x) => x * (x - 3)),
  f07: num(derivative((x) => 6 * x ** 2 - 5 * x + 1)(2), 1e-5),
  f08: deriv((x) => x ** 4 / 4 - x ** 2 / 2),
  f09: deriv((x) => -(x ** 2) + 8 * x - 3),
  f10: num(derivative((x) => 3 * x ** 4 - 2 * x ** 3)(1), 1e-5),
  f11: deriv(() => 7),
  f12: deriv((x) => (2 * x - 1) * (x + 4)),
  f13: num(derivative((x) => x ** 3 - 3 * x ** 2)(3), 1e-5),
  f14: deriv((x) => x ** 6 - 6 * x + 1),
  f15: num(derivative((x) => -2 * x ** 4 + 3 * x ** 3 - x)(-1), 1e-5),
  // Definite integrals via Simpson's rule.
  f16: num(integral((x) => 3 * x ** 2, 0, 2)),
  f17: num(integral((x) => 2 * x, 1, 3)),
  f18: num(integral((x) => x ** 2 + x, 0, 1)),
  f19: num(integral((x) => 4 * x ** 3 - 1, 1, 2)),
  f20: num(integral((x) => x ** 2, 3, 1)),
  f21: num(integral((x) => 2 * x + 1, 0, 3)),
  f22: num(integral((x) => x ** 3, -1, 1)),
  f23: num(integral((x) => x ** 2 - 2 * x, 1, 4)),
  f24: num(integral((x) => x ** 3 + 1, 0, 2)),
  f25: num(integral(() => 6, 2, 5)),
  f26: num(integral((x) => 5 * x ** 4 - 3 * x ** 2, 0, 2)),
  f27: num(integral((x) => x ** 2 + 2 * x + 1, 1, 2)),
  f28: num(integral((x) => 4 * x, 2, 0)),
  f29: num(integral((x) => 3 * x ** 2 + 1, -2, 2)),
  f30: num(integral((x) => 9 - x ** 2, 0, 3)),
  // Substitution and integration by parts: d/dx(choice) equals the integrand.
  d01: anti((x) => 2 * x * (x ** 2 + 1) ** 3),
  d02: anti((x) => 3 * x ** 2 * Math.cos(x ** 3)),
  d03: anti((x) => Math.exp(5 * x)),
  d04: anti((x) => x / (x ** 2 + 4)),
  d05: anti((x) => (2 * x + 3) ** 5),
  d06: anti((x) => Math.cos(3 * x)),
  d07: anti((x) => 6 * x ** 2 * (x ** 3 - 2) ** 4),
  d08: anti(Math.tan, [-1.2, -0.4, 0.3, 0.9, 1.4]),
  d09: anti((x) => Math.log(x) / x, POS),
  d10: anti((x) => (4 * x ** 3) / (x ** 4 + 1)),
  d11: anti((x) => x * Math.exp(x)),
  d12: anti((x) => x * Math.cos(x)),
  d13: anti(Math.log, POS),
  d14: anti((x) => x * Math.sin(x)),
  d15: anti((x) => x ** 2 * Math.exp(x)),
  d16: anti((x) => x * Math.log(x), POS),
  d17: anti((x) => x * Math.exp(-x)),
  d18: anti((x) => x * Math.cos(2 * x)),
  d19: anti((x) => x ** 3 * Math.log(x), POS),
  d20: anti((x) => (x + 1) * Math.exp(x)),
  // Optimization: dense grid search over the stated domain, endpoints included.
  d21: argMax((x) => x * (20 - x), 0, 20),
  d22: maxVal((x) => -(x ** 2) + 6 * x + 1, 0, 5),
  d23: minVal((x) => x ** 2 - 8 * x + 20, 0, 10),
  d24: maxVal((x) => x ** 3 - 3 * x, -2, 3),
  d25: argMax((x) => x * (12 - 2 * x) ** 2, 0, 6),
  d26: argMax((x) => x ** 2 * (20 - x), 0, 20),
  d27: argMin((x) => x + 9 / x, 0.5, 50),
  d28: minVal((x) => 2 * x ** 3 - 3 * x ** 2 - 12 * x, 0, 4),
  d29: minVal((x) => x ** 2 - 4 * x + 7, 3, 6),
  d30: maxVal((x) => x * (60 - 2 * x), 0, 30),
};

const byId = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// ---- Parser self-checks, so a parser bug cannot silently pass the bank. ----
test('parser evaluates representative notation', () => {
  assert.equal(parseExpr('3x² − 2x + 1')(2), 9);
  assert.equal(parseExpr('(x + 2)(x − 3)')(4), 6);
  assert.equal(parseExpr('−x²')(3), -9);
  assert.equal(parseExpr('2(x³ − 2)⁵/5 + C')(1), -2 / 5);
  assert.ok(close(parseExpr('xeˣ − eˣ + C')(1), 0));
  assert.ok(close(parseExpr('−(x + 1)e⁻ˣ')(0), -1));
  assert.ok(close(parseExpr('½ ln(x² + 4)')(0), Math.log(4) / 2));
  assert.ok(close(parseExpr('−ln|cos(x)|')(0.5), -Math.log(Math.cos(0.5))));
  assert.ok(close(parseExpr('(ln(x))²/2')(Math.E), 0.5));
  assert.deepEqual(nums('x = 4 or x = −2/3'), [4, -2 / 3]);
  assert.deepEqual(nums('450 m²'), [450]);
  assert.throws(() => parseExpr('x ? 2'));
});

// ---- Structure ----
test('exactly 90 unique ids, 30 per tier', () => {
  assert.equal(QUESTIONS.length, 90);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 90);
  for (const tier of ['kibble', 'fish', 'deluxe']) {
    assert.equal(getQuestions(tier).length, 30, tier);
    assert.ok(getQuestions(tier).every((q) => q.tier === tier));
  }
});

test('four distinct choices, correct id present once, nonempty text', () => {
  for (const q of QUESTIONS) {
    assert.equal(q.choices.length, 4, q.id);
    assert.equal(new Set(q.choices.map((c) => c.id)).size, 4, q.id);
    assert.equal(new Set(q.choices.map((c) => c.text)).size, 4, q.id);
    assert.equal(q.choices.filter((c) => c.id === q.correctChoiceId).length, 1, q.id);
    for (const key of ['prompt', 'hint', 'solution']) assert.ok(q[key].trim(), `${q.id} ${key}`);
  }
});

test('every question has an oracle entry', () => {
  assert.deepEqual(Object.keys(ORACLE).sort(), QUESTIONS.map((q) => q.id).sort());
});

// ---- Mathematics ----
for (const [id, oracle] of Object.entries(ORACLE)) {
  test(`math: ${id} — exactly one choice is correct and it is the marked one`, () => {
    const q = byId[id];
    assert.ok(q, `missing question ${id}`);
    const passing = q.choices.filter((c) => {
      if (oracle.kind === 'values') return oracle.check(nums(c.text));
      if (oracle.anti) assert.match(c.text, /\+ C$/, `${id} "${c.text}" needs + C`);
      return oracle.check(parseExpr(c.text));
    });
    assert.deepEqual(passing.map((c) => c.id), [q.correctChoiceId], `${id} passing: ${passing.map((c) => c.text)}`);
  });
}

// ---- Named edge cases from the plan ----
const correctText = (id) => byId[id].choices.find((c) => c.id === byId[id].correctChoiceId).text;

test('edge: two quadratic roots are both required', () => {
  assert.deepEqual(nums(correctText('k21')).sort(), [2, 3]);
});
test('edge: negative derivative coefficient', () => {
  assert.equal(correctText('f03'), '−12x² + 1');
});
test('edge: reversed integral bounds give a negative value', () => {
  assert.equal(correctText('f20'), '−26/3');
});
test('edge: endpoint beats interior critical point', () => {
  assert.equal(correctText('d24'), '18');
});
