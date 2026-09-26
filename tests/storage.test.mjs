import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, validateState, loadSave, saveState, resetSave } from '../storage.mjs';
import { createState } from '../game.mjs';

const IDS = { kibble: ['k1', 'k2'], fish: ['f1', 'f2'], deluxe: ['d1', 'd2'] };

function fakeStorage(initial = {}, { failGet, failSet, failRemove } = {}) {
  const map = new Map(Object.entries(initial));
  const calls = [];
  return {
    map, calls,
    getItem(k) { calls.push('get'); if (failGet) throw new Error('blocked'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { calls.push('set'); if (failSet) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
    removeItem(k) { calls.push('remove'); if (failRemove) throw new Error('blocked'); map.delete(k); },
  };
}

const valid = () => {
  const s = createState({ id: 'c2', name: 'Pip', color: 'cream' });
  return {
    ...s,
    currentCat: { ...s.currentCat, totalXp: 250 },
    inventory: { kibble: 2, fish: 0, deluxe: 1 },
    collection: [{ id: 'c1', name: 'Tom', color: 'ginger', totalXp: 1000 }],
    cycles: { ...s.cycles, kibble: { remaining: ['k2'], lastId: 'k1' } },
  };
};

const mutate = (fn) => { const s = structuredClone(valid()); fn(s); return s; };

test('valid state passes; fresh createState passes', () => {
  assert.equal(validateState(valid(), IDS), true);
  assert.equal(validateState(createState({ id: 'a', name: '', color: 'gray' }), IDS), true);
});

test('round trip', () => {
  const st = fakeStorage();
  assert.deepEqual(saveState(st, valid()), { ok: true });
  assert.deepEqual(loadSave(st, IDS), { status: 'ok', state: valid() });
});

test('missing save is empty', () => {
  assert.deepEqual(loadSave(fakeStorage(), IDS), { status: 'empty' });
});

test('bad JSON is invalid and preserves raw', () => {
  const st = fakeStorage({ [SAVE_KEY]: '{oops' });
  assert.deepEqual(loadSave(st, IDS), { status: 'invalid', raw: '{oops' });
});

const invalidCases = {
  'not an object': () => null,
  'version mismatch': () => mutate((s) => { s.version = 2; }),
  'noninteger inventory': () => mutate((s) => { s.inventory.kibble = 1.5; }),
  'negative inventory': () => mutate((s) => { s.inventory.fish = -1; }),
  'missing inventory key': () => mutate((s) => { delete s.inventory.deluxe; }),
  'XP over max': () => mutate((s) => { s.currentCat.totalXp = 1001; }),
  'XP negative': () => mutate((s) => { s.currentCat.totalXp = -5; }),
  'XP not a number': () => mutate((s) => { s.currentCat.totalXp = '10'; }),
  'invalid color': () => mutate((s) => { s.currentCat.color = 'purple'; }),
  'blank name': () => mutate((s) => { s.currentCat.name = '  '; }),
  'overlong name': () => mutate((s) => { s.currentCat.name = 'a'.repeat(25); }),
  'empty cat id': () => mutate((s) => { s.currentCat.id = ''; }),
  'duplicate cat ids': () => mutate((s) => { s.collection[0].id = 'c2'; }),
  'duplicate ids within collection': () => mutate((s) => { s.collection.push({ ...s.collection[0] }); }),
  'nonadult archived cat': () => mutate((s) => { s.collection[0].totalXp = 900; }),
  'collection not array': () => mutate((s) => { s.collection = {}; }),
  'invalid cycle id': () => mutate((s) => { s.cycles.kibble.remaining = ['f1']; }),
  'invalid lastId': () => mutate((s) => { s.cycles.fish.lastId = 'nope'; }),
  'duplicate remaining ids': () => mutate((s) => { s.cycles.kibble.remaining = ['k2', 'k2']; }),
  'missing cycle': () => mutate((s) => { delete s.cycles.deluxe; }),
};

for (const [name, make] of Object.entries(invalidCases)) {
  test(`invalid: ${name}`, () => {
    const value = make();
    assert.equal(validateState(value, IDS), false);
    const raw = JSON.stringify(value);
    const st = fakeStorage({ [SAVE_KEY]: raw });
    assert.deepEqual(loadSave(st, IDS), { status: 'invalid', raw });
    assert.deepEqual(st.calls, ['get'], 'load must never write');
    assert.equal(st.map.get(SAVE_KEY), raw);
  });
}

test('unavailable storage: getItem throws', () => {
  const st = fakeStorage({}, { failGet: true });
  assert.deepEqual(loadSave(st, IDS), { status: 'unavailable' });
});

test('unavailable storage: no storage object', () => {
  assert.deepEqual(loadSave(null, IDS), { status: 'unavailable' });
  assert.equal(saveState(null, valid()).ok, false);
  assert.equal(resetSave(null).ok, false);
});

test('quota error returns failure and keeps old value', () => {
  const st = fakeStorage({ [SAVE_KEY]: 'old' }, { failSet: true });
  const r = saveState(st, valid());
  assert.equal(r.ok, false);
  assert.match(r.error, /Quota/);
  assert.equal(st.map.get(SAVE_KEY), 'old');
});

test('reset removes the save', () => {
  const st = fakeStorage({ [SAVE_KEY]: 'x' });
  assert.deepEqual(resetSave(st), { ok: true });
  assert.equal(st.map.has(SAVE_KEY), false);
});

test('failed reset leaves existing value intact', () => {
  const st = fakeStorage({ [SAVE_KEY]: 'x' }, { failRemove: true });
  assert.equal(resetSave(st).ok, false);
  assert.equal(st.map.get(SAVE_KEY), 'x');
});
