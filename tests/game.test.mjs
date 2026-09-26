import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOODS, COLORS, XP_PER_LEVEL, MAX_LEVEL, MAX_XP, IDLE_MS,
  createState, progress, startChallenge, answerQuestion, revealAnswer,
  feed, adopt, drawQuestion, shuffle, idleTick, catScale,
} from '../game.mjs';

const q = {
  id: 'k1', tier: 'kibble', prompt: 'Solve x + 1 = 2',
  choices: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }, { id: 'c', text: '3' }, { id: 'd', text: '0' }],
  correctChoiceId: 'a', hint: 'h', solution: 's',
};

const cat = (xp = 0, inv = {}) => {
  const s = createState({ id: 'c1', name: 'Tom', color: 'ginger' });
  return { ...s, currentCat: { ...s.currentCat, totalXp: xp }, inventory: { ...s.inventory, ...inv } };
};

// Deterministic RNG for shuffle tests.
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('constants', () => {
  assert.deepEqual(Object.keys(FOODS), ['kibble', 'fish', 'deluxe']);
  assert.equal(FOODS.kibble.xp, 10);
  assert.equal(FOODS.fish.xp, 25);
  assert.equal(FOODS.deluxe.xp, 50);
  assert.deepEqual(COLORS, ['ginger', 'cream', 'gray', 'black', 'brown', 'white']);
  assert.equal(XP_PER_LEVEL, 100);
  assert.equal(MAX_LEVEL, 10);
});

test('createState: empty inventory/cycles/collection', () => {
  const s = createState({ id: 'c1', name: '  Tom  ', color: 'gray' });
  assert.deepEqual(s, {
    version: 1,
    currentCat: { id: 'c1', name: 'Tom', color: 'gray', totalXp: 0 },
    inventory: { kibble: 0, fish: 0, deluxe: 0 },
    collection: [],
    cycles: {
      kibble: { remaining: [], lastId: null },
      fish: { remaining: [], lastId: null },
      deluxe: { remaining: [], lastId: null },
    },
  });
});

test('createState: blank name defaults to Mochi', () => {
  assert.equal(createState({ id: 'c1', name: '   ', color: 'gray' }).currentCat.name, 'Mochi');
  assert.equal(createState({ id: 'c1', name: undefined, color: 'gray' }).currentCat.name, 'Mochi');
});

test('createState: 24 code points ok, 25 rejected', () => {
  assert.equal(createState({ id: 'c1', name: '🐱'.repeat(24), color: 'gray' }).currentCat.name, '🐱'.repeat(24));
  assert.throws(() => createState({ id: 'c1', name: 'a'.repeat(25), color: 'gray' }));
});

test('createState: invalid color rejected', () => {
  assert.throws(() => createState({ id: 'c1', name: 'x', color: 'purple' }));
});

test('progress: six stage thresholds', () => {
  const expected = ['newborn', 'newborn', 'kitten', 'kitten', 'young', 'young',
    'adolescent', 'adolescent', 'youngAdult', 'youngAdult', 'adult'];
  expected.forEach((stage, level) => {
    assert.equal(progress(level * 100).stage, stage, `level ${level}`);
    if (level < 10) assert.equal(progress(level * 100 + 99).stage, stage, `level ${level} top`);
  });
});

test('progress: every level boundary', () => {
  for (let l = 0; l <= 10; l++) {
    assert.equal(progress(l * 100).level, l);
    if (l > 0) assert.equal(progress(l * 100 - 1).level, l - 1);
  }
  assert.deepEqual(progress(105), { level: 1, stage: 'newborn', intoLevel: 5, needed: 100, isAdult: false });
  assert.deepEqual(progress(1000), { level: 10, stage: 'adult', intoLevel: 100, needed: 100, isAdult: true });
});

test('progress: rejects negative, nonfinite, over-max', () => {
  assert.throws(() => progress(-1));
  assert.throws(() => progress(NaN));
  assert.throws(() => progress(Infinity));
  assert.throws(() => progress(1001));
});

test('answer: incorrect changes attempts only', () => {
  const s = cat();
  const ch = startChallenge('c1', q);
  const r = answerQuestion(s, ch, q, 'b');
  assert.equal(r.outcome, 'incorrect');
  assert.equal(r.state, s);
  assert.deepEqual(r.challenge.attemptedIds, ['b']);
  assert.equal(r.challenge.status, 'open');
});

test('answer: correct adds exactly one serving; re-answer adds zero', () => {
  const s = cat();
  const ch = startChallenge('c1', q);
  const r = answerQuestion(s, ch, q, 'a');
  assert.equal(r.outcome, 'correct');
  assert.equal(r.state.inventory.kibble, 1);
  assert.equal(r.challenge.status, 'solved');
  const r2 = answerQuestion(r.state, r.challenge, q, 'a');
  assert.equal(r2.outcome, 'ignored');
  assert.equal(r2.state.inventory.kibble, 1);
});

test('answer: repeated incorrect click on same choice is ignored', () => {
  const s = cat();
  const r = answerQuestion(s, startChallenge('c1', q), q, 'b');
  const r2 = answerQuestion(s, r.challenge, q, 'b');
  assert.equal(r2.outcome, 'ignored');
  assert.deepEqual(r2.challenge.attemptedIds, ['b']);
});

test('answer: revealed challenge adds zero', () => {
  const s = cat();
  const ch = revealAnswer(startChallenge('c1', q));
  assert.equal(ch.status, 'revealed');
  const r = answerQuestion(s, ch, q, 'a');
  assert.equal(r.outcome, 'ignored');
  assert.equal(r.state.inventory.kibble, 0);
});

test('revealAnswer: solved stays solved', () => {
  const s = cat();
  const { challenge } = answerQuestion(s, startChallenge('c1', q), q, 'a');
  assert.equal(revealAnswer(challenge).status, 'solved');
});

test('answer: challenge for previous cat adds zero', () => {
  const s = cat();
  const r = answerQuestion(s, startChallenge('old-cat', q), q, 'a');
  assert.equal(r.outcome, 'ignored');
  assert.equal(r.state.inventory.kibble, 0);
});

test('answer: mismatched question adds zero', () => {
  const s = cat();
  const other = { ...q, id: 'k2' };
  const r = answerQuestion(s, startChallenge('c1', q), other, 'a');
  assert.equal(r.outcome, 'ignored');
});

test('answer: adult cannot earn', () => {
  const s = cat(1000);
  const r = answerQuestion(s, startChallenge('c1', q), q, 'a');
  assert.equal(r.outcome, 'ignored');
  assert.equal(r.state.inventory.kibble, 0);
});

test('answer: unknown choice id throws', () => {
  assert.throws(() => answerQuestion(cat(), startChallenge('c1', q), q, 'zz'));
});

test('feed: 95 XP + kibble = 105, level 1, 5/100', () => {
  const s = feed(cat(95, { kibble: 1 }), 'kibble');
  assert.equal(s.currentCat.totalXp, 105);
  assert.equal(s.inventory.kibble, 0);
  const p = progress(s.currentCat.totalXp);
  assert.equal(p.level, 1);
  assert.equal(p.intoLevel, 5);
});

test('feed: 990 XP + deluxe caps at 1000', () => {
  const s = feed(cat(990, { deluxe: 1 }), 'deluxe');
  assert.equal(s.currentCat.totalXp, 1000);
  assert.equal(s.inventory.deluxe, 0);
});

test('feed: empty inventory is no-op', () => {
  const s = cat(50);
  assert.equal(feed(s, 'fish'), s);
});

test('feed: adult is no-op', () => {
  const s = cat(1000, { fish: 2 });
  assert.equal(feed(s, 'fish'), s);
});

test('feed: unknown food throws', () => {
  assert.throws(() => feed(cat(0, { kibble: 1 }), 'cake'));
});

test('feed: does not mutate input', () => {
  const s = cat(0, { kibble: 2 });
  const snapshot = structuredClone(s);
  feed(s, 'kibble');
  assert.deepEqual(s, snapshot);
});

test('adopt: archives exactly once, kitten starts empty', () => {
  const s = cat(1000, { kibble: 3, fish: 1 });
  s.cycles = { ...s.cycles, fish: { remaining: ['f2'], lastId: 'f1' } };
  const a = adopt(s, 'c1', { id: 'c2', name: 'Pip', color: 'cream' });
  assert.equal(a.collection.length, 1);
  assert.deepEqual(a.collection[0], { id: 'c1', name: 'Tom', color: 'ginger', totalXp: 1000 });
  assert.deepEqual(a.currentCat, { id: 'c2', name: 'Pip', color: 'cream', totalXp: 0 });
  assert.deepEqual(a.inventory, { kibble: 0, fish: 0, deluxe: 0 });
  assert.deepEqual(a.cycles.fish, { remaining: ['f2'], lastId: 'f1' });
  const b = adopt(a, 'c1', { id: 'c3', name: 'Dup', color: 'gray' });
  assert.equal(b, a);
  assert.equal(b.collection.length, 1);
});

test('adopt: non-adult is no-op', () => {
  const s = cat(999);
  assert.equal(adopt(s, 'c1', { id: 'c2', name: 'x', color: 'gray' }), s);
});

test('adopt: invalid new cat throws', () => {
  assert.throws(() => adopt(cat(1000), 'c1', { id: 'c2', name: 'x', color: 'nope' }));
  assert.throws(() => adopt(cat(1000), 'c1', { id: 'c1', name: 'x', color: 'gray' }));
});

test('shuffle: Fisher-Yates on a copy, deterministic', () => {
  const src = [1, 2, 3, 4];
  const out = shuffle(src, () => 0);
  assert.deepEqual(src, [1, 2, 3, 4]);
  // rng 0 always swaps i with 0: [1,2,3,4] -> i3:[4,2,3,1] -> i2:[3,2,4,1] -> i1:[2,3,4,1]
  assert.deepEqual(out, [2, 3, 4, 1]);
  assert.deepEqual(shuffle(src, () => 0.999), [1, 2, 3, 4]);
});

test('drawQuestion: no repeat until exhaustion', () => {
  const ids = ['a', 'b', 'c', 'd'];
  let cycle = { remaining: [], lastId: null };
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const r = drawQuestion(cycle, ids, Math.random);
    seen.push(r.id);
    cycle = r.cycle;
  }
  assert.deepEqual([...seen].sort(), ids);
  assert.equal(cycle.remaining.length, 0);
});

test('drawQuestion: no immediate repeat at refill', () => {
  const ids = ['a', 'b', 'c'];
  // rng 0.999 leaves order unchanged => refill would start with 'a'
  const r = drawQuestion({ remaining: [], lastId: 'a' }, ids, () => 0.999);
  assert.notEqual(r.id, 'a');
  assert.equal(r.cycle.lastId, r.id);
  assert.equal(r.cycle.remaining.length, 2);
  assert.ok(r.cycle.remaining.includes('a'));
});

test('drawQuestion: does not mutate input cycle', () => {
  const cycle = { remaining: ['a', 'b'], lastId: null };
  const r = drawQuestion(cycle, ['a', 'b'], Math.random);
  assert.equal(r.id, 'a');
  assert.deepEqual(cycle, { remaining: ['a', 'b'], lastId: null });
});

test('idleTick: +1 XP, caps at max, adult no-op, immutable', () => {
  const s = cat(40, { fish: 1 });
  const snapshot = structuredClone(s);
  const t = idleTick(s);
  assert.equal(t.currentCat.totalXp, 41);
  assert.deepEqual(t.inventory, s.inventory);
  assert.deepEqual(s, snapshot);
  assert.equal(idleTick(cat(999)).currentCat.totalXp, 1000);
  const adult = cat(1000);
  assert.equal(idleTick(adult), adult);
});

test('IDLE_MS makes an idle-only run about one hour', () => {
  assert.equal(IDLE_MS, 3600);
  assert.equal((MAX_XP * IDLE_MS) / 60000, 60);
});

test('catScale: 0.45 at level 0, 1 at level 10, strictly increasing', () => {
  assert.equal(catScale(0), 0.45);
  assert.equal(catScale(10), 1);
  for (let l = 1; l <= 10; l++) assert.ok(catScale(l) > catScale(l - 1), `level ${l}`);
});
