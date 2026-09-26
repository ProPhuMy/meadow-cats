import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutScene, TEXTURES } from '../scene.mjs';

const DESKTOP = { width: 1280, height: 800, block: 48, railWidth: 292, seed: 7 };
const PHONE = { width: 320, height: 640, block: 32, railWidth: 0, minGround: 184, seed: 7 };

const grassIn = (L, from, to) => L.blocks.filter((b) => b.type === 'grass' && b.x >= from && b.x < to);

test('textures are 16×16 and cover every block type used', () => {
  for (const [type, grid] of Object.entries(TEXTURES)) {
    assert.equal(grid.length, 16, type);
    assert.ok(grid.every((row) => row.length === 16), type);
  }
  for (const L of [layoutScene(DESKTOP), layoutScene(PHONE)]) {
    for (const b of L.blocks) assert.ok(TEXTURES[b.type], `missing texture ${b.type}`);
  }
});

test('layout is deterministic for the same inputs', () => {
  assert.deepEqual(layoutScene(DESKTOP), layoutScene(DESKTOP));
  assert.notDeepEqual(layoutScene(DESKTOP), layoutScene({ ...DESKTOP, seed: 8 }));
});

test('walk range is flat grass at groundTop', () => {
  for (const opts of [DESKTOP, PHONE]) {
    const L = layoutScene(opts);
    const cells = grassIn(L, L.walk.from, L.walk.to);
    assert.equal(cells.length, (L.walk.to - L.walk.from) / L.block, 'one grass block per walk column');
    assert.ok(cells.every((b) => b.y === L.groundTop), 'flat');
    assert.ok(L.walk.to - L.walk.from >= 3 * L.block, 'at least 3 blocks wide');
  }
});

test('walk range and trees stay clear of the rail', () => {
  const L = layoutScene(DESKTOP);
  const limit = DESKTOP.width - DESKTOP.railWidth;
  assert.ok(L.walk.to <= limit, `walk.to ${L.walk.to} <= ${limit}`);
  assert.ok(L.treeBoxes.length >= 1);
  for (const t of L.treeBoxes) assert.ok(t.x + t.width <= limit, `tree ends ${t.x + t.width}`);
});

test('minGround keeps the grass above a phone bottom bar', () => {
  const L = layoutScene(PHONE);
  assert.ok(L.height - L.groundTop >= PHONE.minGround);
  const short = layoutScene({ ...PHONE, width: 640, height: 360 });
  assert.ok(short.height - short.groundTop >= PHONE.minGround);
});

test('sky has 40 stars, 14 fireflies, 2 hill layers, and a moon', () => {
  const L = layoutScene(DESKTOP);
  assert.equal(L.stars.length, 40);
  assert.equal(L.fireflies.length, 14);
  assert.equal(L.hills.length, 2);
  assert.ok(L.moon.size > 0);
  assert.ok(L.stars.every((s) => s.y < L.groundTop));
});
