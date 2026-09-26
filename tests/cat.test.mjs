import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catPixels, PALETTES, STAGES } from '../cat.mjs';
import { COLORS } from '../game.mjs';

const silhouette = (stage) => {
  const set = new Set();
  for (const part of Object.values(catPixels(stage))) for (const p of part) set.add(`${p.x},${p.y}`);
  return set;
};

test('every color has a palette with all roles', () => {
  for (const c of COLORS) for (const role of 'bdlopye') assert.ok(PALETTES[c][role], `${c}.${role}`);
});

test('six stages have distinct silhouettes that grow', () => {
  assert.deepEqual(STAGES, ['newborn', 'kitten', 'young', 'adolescent', 'youngAdult', 'adult']);
  const sizes = STAGES.map((s) => silhouette(s).size);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] > sizes[i - 1], `sizes ${sizes}`);
});

test('paws share one baseline and stay inside the 32×32 grid', () => {
  for (const s of STAGES) {
    const parts = catPixels(s);
    const all = Object.values(parts).flat();
    assert.ok(all.every((p) => p.x >= 0 && p.x < 32 && p.y >= 0 && p.y < 32), s);
    assert.equal(Math.max(...all.map((p) => p.y)), 31, s);
    assert.equal(parts.legs.length > 0 && parts.head.length > 0 && parts.tail.length > 0 && parts.body.length > 0, true);
  }
});
