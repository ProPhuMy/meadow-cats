// Deterministic Minecraft-style twilight scene. layoutScene() is pure and tested;
// buildScene() turns a layout into decorative, aria-hidden DOM.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 16×16 pixel textures (colors dimmed for dusk) ----------
function texture(seed, fn) {
  const rng = mulberry32(seed);
  return Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => fn(x, y, rng)));
}
const speckle = (rng, base, dark, light) => { const r = rng(); return r < 0.12 ? dark : r < 0.22 ? light : base; };
const dirtPixel = (x, y, rng) => speckle(rng, '#5b3d2a', '#46301f', '#6e4b33');
const grassDepth = (() => { const r = mulberry32(5); return Array.from({ length: 16 }, () => 3 + Math.floor(r() * 4)); })();
const flower = (petal, center) => (x, y) => {
  if (y >= 9 && (x === 7 || x === 8)) return '#3e7a2f';
  if (y === 11 && (x === 6 || x === 9)) return '#3e7a2f';
  const d = (x - 7.5) ** 2 + (y - 6) ** 2;
  return d <= 2.5 ? center : d <= 8 ? petal : null;
};

export const TEXTURES = {
  grass: texture(12, (x, y, rng) => (y < grassDepth[x] ? speckle(rng, '#44803a', '#356a2e', '#55944a') : dirtPixel(x, y, rng))),
  dirt: texture(11, dirtPixel),
  stone: texture(13, (x, y, rng) => ((x + 2 * y) % 11 === 0 && y % 5 < 3 ? '#4b4d55' : speckle(rng, '#696b74', '#575962', '#7c7e87'))),
  log: texture(14, (x, y, rng) => ['#5a4128', '#4a3420', '#6a4d31'][(x + (rng() < 0.2 ? 1 : 0)) % 3]),
  leaves: texture(15, (x, y, rng) => { const r = rng(); return r < 0.12 ? null : r < 0.4 ? '#255826' : r < 0.7 ? '#2f6b2e' : '#3b7d38'; }),
  poppy: texture(16, flower('#c8322b', '#2b1a12')),
  dandelion: texture(17, flower('#e8c62e', '#b58a16')),
  torch: texture(18, (x, y) => (x === 7 || x === 8 ? (y >= 7 ? '#6a4d31' : y >= 5 ? '#ffb13b' : y >= 3 ? '#ffe27a' : null) : null)),
};

// ---------- Layout ----------
export function layoutScene({ width, height, block, railWidth = 0, minGround = 0, seed = 1 }) {
  const rng = mulberry32(seed);
  const cols = Math.ceil(width / block) + 1;
  const base = Math.max(3, Math.round((height * 0.28) / block), Math.ceil(minGround / block));
  const usable = Math.floor((width - railWidth) / block); // columns fully left of the rail
  const walkFrom = Math.max(1, Math.floor(cols * 0.15));
  const walkTo = Math.max(walkFrom + 3, Math.floor(usable * 0.85)); // exclusive

  // Surface height per column in blocks: flat across the walk range (plus one column each side).
  const surface = Array.from({ length: cols }, (_, c) => {
    const bump = rng() < 0.35 ? (rng() < 0.5 ? -1 : 1) : 0;
    return c >= walkFrom - 1 && c <= walkTo ? base : base + bump;
  });
  const top = (c) => height - surface[c] * block;

  const blocks = [];
  surface.forEach((s, c) => {
    for (let r = 0; r < s; r++) {
      blocks.push({ x: c * block, y: top(c) + r * block, type: r === 0 ? 'grass' : r === s - 1 ? 'stone' : 'dirt' });
    }
  });

  // Oak trees: 4 logs, leaves 5-wide on logs 4–5 and 3-wide on top.
  const treeBoxes = [];
  const trunks = [];
  const tree = (tc) => {
    if (tc < 0 || tc + 3 > usable || trunks.includes(tc)) return;
    trunks.push(tc);
    const t = top(tc);
    for (let k = 1; k <= 4; k++) blocks.push({ x: tc * block, y: t - k * block, type: 'log' });
    for (const [k, span] of [[4, 2], [5, 2], [6, 1]]) {
      for (let dc = -span; dc <= span; dc++) {
        if (!(k === 4 && dc === 0)) blocks.push({ x: (tc + dc) * block, y: t - k * block, type: 'leaves' });
      }
    }
    treeBoxes.push({ x: (tc - 2) * block, width: 5 * block });
  };
  tree(Math.max(0, walkFrom - 3));
  tree(Math.min(walkTo + 2, usable - 3));

  const torchCols = [walkFrom, walkTo - 1].filter((c) => !trunks.includes(c));
  const torches = torchCols.map((c) => ({ x: c * block, y: top(c) - block }));
  for (const t of torches) blocks.push({ ...t, type: 'torch' });

  for (let c = 0; c < cols; c++) {
    const roll = rng();
    const kind = rng() < 0.5 ? 'poppy' : 'dandelion';
    const underTree = treeBoxes.some((b) => c * block >= b.x && c * block < b.x + b.width);
    if (roll < 0.22 && !underTree && !torchCols.includes(c)) blocks.push({ x: c * block, y: top(c) - block, type: kind });
  }

  const groundTop = height - base * block;
  const stars = Array.from({ length: 40 }, () => ({
    x: Math.round(rng() * width),
    y: Math.round(rng() * groundTop * 0.6),
    size: rng() < 0.2 ? 3 : 2,
    delay: +(rng() * 4).toFixed(2),
  }));
  const moon = { x: Math.round(width * 0.58), y: Math.round(height * 0.2), size: Math.round(block * 1.5) }; // clear of HUD and rail
  const hills = [[0.55, 6, 2], [0.75, 4, 1]].map(([depth, maxH, minH], layer) => {
    let h = minH + Math.floor(rng() * (maxH - minH + 1));
    let d = `M0 ${groundTop + block}`;
    for (let x = 0; x < width + block * 2; x += block * 2) {
      h = Math.max(minH, Math.min(maxH, h + Math.floor(rng() * 3) - 1));
      d += ` V${Math.round(groundTop - h * block * depth)} H${x + block * 2}`;
    }
    return { layer, d: `${d} V${groundTop + block} Z` };
  });
  const fireflies = Array.from({ length: 14 }, () => ({
    x: Math.round(rng() * width),
    y: Math.round(groundTop - 20 - rng() * height * 0.35),
    dx: Math.round((rng() - 0.5) * 160),
    dy: Math.round((rng() - 0.5) * 90),
    dur: +(6 + rng() * 6).toFixed(2),
    delay: +(-rng() * 10).toFixed(2),
  }));

  return {
    width, height, block, groundTop,
    walk: { from: walkFrom * block, to: walkTo * block },
    blocks, torches, treeBoxes, stars, moon, hills, fireflies,
  };
}

// ---------- DOM ----------
const SVG = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function symbol(id, grid) {
  const s = el('symbol', { id, viewBox: '0 0 16 16' });
  grid.forEach((row, y) => {
    for (let x = 0; x < 16;) {
      let run = 1;
      while (x + run < 16 && row[x + run] === row[x]) run++;
      if (row[x]) s.append(el('rect', { x, y, width: run, height: 1, fill: row[x] }));
      x += run;
    }
  });
  return s;
}

export function buildScene(root, L) {
  const svg = el('svg', {
    class: 'world', width: L.width, height: L.height, viewBox: `0 0 ${L.width} ${L.height}`,
    'shape-rendering': 'crispEdges', 'aria-hidden': 'true', focusable: 'false',
  });
  const defs = el('defs');
  for (const [id, grid] of Object.entries(TEXTURES)) defs.append(symbol(`tex-${id}`, grid));
  const glow = el('radialGradient', { id: 'torch-glow' });
  glow.append(
    el('stop', { offset: '0', 'stop-color': '#ffb13b', 'stop-opacity': '0.55' }),
    el('stop', { offset: '1', 'stop-color': '#ffb13b', 'stop-opacity': '0' }),
  );
  defs.append(glow);
  svg.append(defs);

  for (const s of L.stars) svg.append(el('rect', { class: 'star', x: s.x, y: s.y, width: s.size, height: s.size, style: `animation-delay:${s.delay}s` }));

  const moon = el('g', { class: 'moon' });
  moon.append(el('rect', { x: L.moon.x, y: L.moon.y, width: L.moon.size, height: L.moon.size, fill: '#f4eed2' }));
  const q = L.moon.size / 6;
  for (const [cx, cy] of [[1, 1], [3.5, 3], [1.5, 4]]) {
    moon.append(el('rect', { x: L.moon.x + cx * q, y: L.moon.y + cy * q, width: q, height: q, fill: '#d8d0ae' }));
  }
  svg.append(moon);

  for (const h of L.hills) svg.append(el('path', { class: `hill hill-${h.layer}`, d: h.d }));
  for (const t of L.torches) {
    svg.append(el('circle', { class: 'torch-glow', cx: t.x + L.block / 2, cy: t.y + L.block * 0.3, r: L.block * 1.6, fill: 'url(#torch-glow)' }));
  }
  for (const b of L.blocks) svg.append(el('use', { href: `#tex-${b.type}`, x: b.x, y: b.y, width: L.block, height: L.block }));

  const flies = document.createElement('div');
  flies.className = 'fireflies';
  for (const f of L.fireflies) {
    const d = document.createElement('span');
    d.className = 'firefly';
    d.style.cssText = `left:${f.x}px;top:${f.y}px;--dx:${f.dx}px;--dy:${f.dy}px;`
      + `animation-duration:${f.dur}s,${(f.dur / 3).toFixed(2)}s;animation-delay:${f.delay}s,${f.delay}s`;
    flies.append(d);
  }
  root.replaceChildren(svg, flies);
}
