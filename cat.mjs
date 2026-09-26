// Original pixel-art cat, generated on a 32×32 grid from per-stage proportions.
// Same markings and palette at every stage; proportions change, not just scale.
// Roles: b fur, d dark fur, l light fur, o outline, p pink, y iris, e pupil, w shine.

export const STAGES = ['newborn', 'kitten', 'young', 'adolescent', 'youngAdult', 'adult'];

export const PALETTES = {
  ginger: { b: '#e8923a', d: '#b85f1f', l: '#fbe3c0', o: '#4a2a17', p: '#f2a0a8', y: '#8fc93a', e: '#1c1410', w: '#ffffff' },
  cream: { b: '#f0d9a8', d: '#cfae72', l: '#fff6e2', o: '#5a3d26', p: '#f2a0a8', y: '#5fa8c8', e: '#1c1410', w: '#ffffff' },
  gray: { b: '#9aa3ab', d: '#6b737c', l: '#e4e8ea', o: '#33363b', p: '#f2a0a8', y: '#e8c33a', e: '#1c1410', w: '#ffffff' },
  black: { b: '#34303a', d: '#1d1b20', l: '#5a5460', o: '#0f0d10', p: '#d98a95', y: '#e5d23a', e: '#0f0d10', w: '#ffffff' },
  brown: { b: '#8a5a3b', d: '#5e3a24', l: '#d9b48f', o: '#2f1c11', p: '#e79aa3', y: '#9cd04a', e: '#1c1410', w: '#ffffff' },
  white: { b: '#f7f5f0', d: '#d9d4ca', l: '#ffffff', o: '#6b5a4e', p: '#f4a6b0', y: '#5fa8c8', e: '#1c1410', w: '#ffffff' },
};

const SPEC = {
  newborn: { body: [8, 5, 2], head: [9, 8], legH: 1, tail: [[-1, 0], [-2, 0]] },
  kitten: { body: [10, 6, 2], head: [10, 9], legH: 2, tail: [[-1, 0], [-2, -1], [-3, -1]] },
  young: { body: [13, 6, 2], head: [9, 8], legH: 4, tail: [[-1, 0], [-2, -1], [-3, -2], [-4, -3], [-4, -4]] },
  adolescent: {
    body: [17, 6, 2], head: [9, 8], legH: 5,
    tail: [[-1, 0], [-2, 0], [-3, -1], [-4, -2], [-5, -3], [-5, -4], [-5, -5], [-5, -6]],
  },
  youngAdult: {
    body: [17, 8, 3], head: [9, 8], legH: 5,
    tail: [[-1, 0], [-2, -1], [-3, -2], [-4, -3], [-4, -4], [-4, -5], [-4, -6], [-3, -7], [-2, -7]],
  },
  adult: {
    body: [17, 9, 3], head: [10, 9], legH: 5,
    tail: [[-1, 0], [-2, -1], [-3, -2], [-4, -3], [-4, -4], [-4, -5], [-4, -6], [-3, -7], [-2, -7], [-1, -6]],
  },
};

const key = (x, y) => `${x},${y}`;

/** Rounded rectangle of core pixels. */
function roundRect(x0, y0, w, h, r, role) {
  const core = new Map();
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (Math.min(i, w - 1 - i) + Math.min(j, h - 1 - j) >= r) core.set(key(x0 + i, y0 + j), role);
    }
  }
  return core;
}

/** Core pixels plus a one-pixel outline, skipping outline cells in `skip`. */
function withOutline(core, skip = new Map()) {
  const out = [];
  const seen = new Set();
  for (const k of core.keys()) {
    const [x, y] = k.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = key(x + dx, y + dy);
        if (!core.has(n) && !skip.has(n) && !seen.has(n)) {
          seen.add(n);
          out.push({ x: x + dx, y: y + dy, c: 'o' });
        }
      }
    }
  }
  for (const [k, c] of core) {
    const [x, y] = k.split(',').map(Number);
    out.push({ x, y, c });
  }
  return out;
}

/** Returns { tail, legs, body, head, eyes, eyesHappy } as arrays of {x, y, c}. */
export function catPixels(stage) {
  const { body: [bw, bh, br], head: [hw, hh], legH, tail } = SPEC[stage];
  const bx = 8;
  const bodyBottom = 31 - legH;
  const by = bodyBottom - bh + 1;

  const bodyCore = roundRect(bx, by, bw, bh, br, 'b');
  const adult = stage === 'adult' || stage === 'youngAdult'; // full chest marking
  for (const k of bodyCore.keys()) {
    const [x, y] = k.split(',').map(Number);
    const stripe = y - by < 2 && (x - bx) % 4 === 2 && x > bx + 1 && x < bx + bw - 3;
    const chest = x >= bx + bw * (adult ? 0.6 : 0.7) && y >= by + bh * (adult ? 0.4 : 0.5);
    if (stripe) bodyCore.set(k, 'd');
    else if (chest) bodyCore.set(k, 'l');
  }

  const tailCore = new Map(tail.map(([dx, dy], i) => [key(bx + dx, by + 1 + dy), i >= tail.length - 2 ? 'd' : 'b']));

  const legs = [];
  const legXs = [bx + 3, bx + bw - 2, bx + 1, bx + bw - 4]; // far back, far front, near back, near front
  legXs.forEach((lx, leg) => {
    const far = leg < 2;
    const core = new Map();
    for (let y = bodyBottom; y <= 30; y++) {
      for (const x of [lx, lx + 1]) core.set(key(x, y), y === 30 && !far ? 'l' : far ? 'd' : 'b');
    }
    for (const p of withOutline(core, bodyCore)) legs.push({ ...p, leg });
  });

  const hx = bx + bw + 3 - hw;
  const hy = by + 3 - hh;
  const headCore = roundRect(hx, hy, hw, hh, 2, 'b');
  // Ears: far (back) ear left, near ear toward the face.
  for (const [ex, inner] of [[hx, 'd'], [hx + hw - 4, 'p']]) {
    for (const x of [ex, ex + 1, ex + 2]) headCore.set(key(x, hy - 1), 'b');
    headCore.set(key(ex, hy - 2), 'b');
    headCore.set(key(ex + 1, hy - 2), inner);
    headCore.set(key(ex, hy - 3), 'b');
    headCore.set(key(ex + 1, hy - 1), inner);
  }
  const cx = hx + Math.floor(hw / 2) - 1;
  for (const [x, y] of [[cx - 1, hy], [cx + 1, hy], [cx, hy + 1]]) headCore.set(key(x, y), 'd');
  const ey = hy + Math.floor(hh / 2) - 1;
  for (let y = ey + 2; y < hy + hh; y++) {
    for (let x = hx + hw - 6; x < hx + hw; x++) if (headCore.has(key(x, y))) headCore.set(key(x, y), 'l');
  }
  headCore.set(key(hx + hw - 1, ey + 2), 'p');
  headCore.set(key(hx + hw - 2, ey + 3), 'o');

  const eyeXs = [hx + hw - 8, hx + hw - 4];
  const eyes = eyeXs.flatMap((x) => [
    { x, y: ey, c: 'e' }, { x: x + 1, y: ey, c: 'w' },
    { x, y: ey + 1, c: 'y' }, { x: x + 1, y: ey + 1, c: 'e' },
  ]);
  const eyesHappy = eyeXs.flatMap((x) => [
    { x, y: ey + 1, c: 'o' }, { x: x + 1, y: ey, c: 'o' }, { x: x + 2, y: ey + 1, c: 'o' },
  ]);

  const parts = {
    tail: withOutline(tailCore),
    legs,
    body: withOutline(bodyCore),
    head: withOutline(headCore),
    eyes,
    eyesHappy,
  };

  // Center horizontally in the grid.
  const xs = Object.values(parts).flat().map((p) => p.x);
  const shift = Math.round(15.5 - (Math.min(...xs) + Math.max(...xs)) / 2);
  for (const list of Object.values(parts)) for (const p of list) p.x += shift;
  return parts;
}

const SVG = 'http://www.w3.org/2000/svg';

/** Draws pixels as horizontal runs of same-colored rects. */
function group(className, pixels, palette) {
  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('class', className);
  const rows = new Map();
  for (const p of pixels) {
    const row = rows.get(p.y) ?? new Map();
    row.set(p.x, p.c); // later pixels win (core drawn after outline)
    rows.set(p.y, row);
  }
  for (const [y, row] of rows) {
    const xs = [...row.keys()].sort((a, b) => a - b);
    for (let i = 0; i < xs.length;) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1 && row.get(xs[j + 1]) === row.get(xs[i])) j++;
      const r = document.createElementNS(SVG, 'rect');
      r.setAttribute('x', xs[i]);
      r.setAttribute('y', y);
      r.setAttribute('width', xs[j] - xs[i] + 1);
      r.setAttribute('height', 1);
      r.setAttribute('fill', palette[row.get(xs[i])]);
      g.append(r);
      i = j + 1;
    }
  }
  return g;
}

/** Returns a decorative SVG with .tail, .leg-N, .body, .head, .eyes, .eyes-happy groups. */
export function renderCat({ stage, color }) {
  const palette = PALETTES[color];
  const parts = catPixels(stage);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `cat-art stage-${stage}`);
  const leg = (n) => group(`leg leg-${n}`, parts.legs.filter((p) => p.leg === n), palette);
  const head = group('head', parts.head, palette);
  head.append(group('eyes', parts.eyes, palette), group('eyes-happy', parts.eyesHappy, palette));
  svg.append(group('tail', parts.tail, palette), leg(0), leg(1), group('body', parts.body, palette), leg(2), leg(3), head);
  return svg;
}
