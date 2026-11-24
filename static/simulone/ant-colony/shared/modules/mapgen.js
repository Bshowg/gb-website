// A map generator. Not an engine module with hooks: one function that lays plain tiles on a world,
// to call from a game's `map.build`. The same seed always gives the same map.
//
// A map is described in steps, applied in order, each only touching ground that is still untouched
// (the world's fill tile) unless it says otherwise:
//   { layer: 'forest', amount: 0.3, scale: 30 }             patches of a tile, from smooth noise
//   { patch: 'forest', at: [120, 140], radius: 9 }          one uneven blob of a tile, where you want it
//   { river: 'water', from: 'N', to: 'S', width: 3 }        a wandering band from one edge to another
//   { road: 'road', from: 'S', to: [150, 150] }             a path from an edge (or a cell) to a cell (or an edge)
//   { clearing: [150, 150], radius: 20 }                    put the fill tile back in a circle (a place to start)
// It knows nothing about what the tiles mean.

/** A small seeded random generator: () => 0..1. */
export function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Smooth noise in 0..1: random values on a coarse grid, blended, a few octaves.
function noiseField(w, h, scale, octaves, rnd) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++, scale /= 2, amp /= 2) {
    const s = Math.max(2, scale), gw = Math.ceil(w / s) + 2, gh = Math.ceil(h / s) + 2;
    const grid = new Float32Array(gw * gh);
    for (let k = 0; k < grid.length; k++) grid[k] = rnd();
    for (let y = 0; y < h; y++) {
      const fy = y / s, y0 = fy | 0, ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = x / s, x0 = fx | 0, tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1], c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
        out[y * w + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    total += amp;
  }
  for (let k = 0; k < out.length; k++) out[k] /= total;
  return out;
}

/**
 * @param {import('../../shared/engine/world.js').World} world   the map to fill; only its untouched ground is changed
 * @param {object} o
 * @param {number} o.seed
 * @param {[number, number, number, number]} [o.rect]   only touch cells inside this rectangle [x0, y0, x1, y1] (a part of a larger map)
 * @param {Array<object>} o.steps   applied in order:
 *   { layer: tile, amount: 0..1 (share of the map), scale?: 24 (size of the patches in cells), octaves?: 3,
 *     edge?: 0 (0..1: pull towards the map's edges; negative: towards the middle), over?: [tiles] (may also replace these) }
 *   { patch: tile, at: [x, y], radius, rough?: 0.45 (how uneven its outline is), over?: [tiles] }
 *   { river: tile, from: 'N'|'E'|'S'|'W' | [x, y], to: side | [x, y], width?: 3, wander?: 0.25, ford?: tile, fordEvery?: 60, fordWidth?: 3 }
 *   { road: tile, from: side | [x, y], to: side | [x, y], over?: [tiles] (default: everything but buildings; a river needs a ford or a bridge tile here) }
 *   { clearing: [x, y], radius, keep?: [tiles] (tiles left as they are) }
 * @returns {{ seed:number, counts: Record<string, number>, fords: Array<[number, number]>, roads: Array<Array<[number, number]>> }}
 */
export function generateMap(world, { seed = 1, steps = [], rect = null }) {
  const W = world.w, H = world.h, fill = world.fill, rnd = seeded(seed);
  const info = { seed, counts: {}, fords: [], roads: [] };
  const put = (x, y, tile, over) => {                      // lay a tile if the ground there may be replaced
    if (!world.inside(x, y) || (rect && (x < rect[0] || y < rect[1] || x > rect[2] || y > rect[3]))) return false;
    const c = y * W + x, old = world.tiles[c];
    if (world.bldAt[c] >= 0 || (old !== fill && !(over && over.includes(old)))) return false;
    return world.set(x, y, tile);
  };
  const ids = list => list?.map(t => world.id(t));
  const edgePoint = side => {                              // somewhere along the middle half of a side
    const along = 0.25 + rnd() * 0.5;
    return side === 'N' ? [Math.round(along * W), 1] : side === 'S' ? [Math.round(along * W), H - 2]
         : side === 'W' ? [1, Math.round(along * H)] : [W - 2, Math.round(along * H)];
  };
  const point = p => (typeof p === 'string' ? edgePoint(p) : p);

  for (const st of steps) {
    if (st.layer !== undefined) {
      const tile = world.id(st.layer), over = ids(st.over);
      const n = noiseField(W, H, st.scale ?? 24, st.octaves ?? 3, rnd), edge = st.edge ?? 0;
      if (edge) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.min(1, Math.hypot(x / W - 0.5, y / H - 0.5) * 2);   // 0 in the middle, 1 at the corners
        n[y * W + x] += edge * (d - 0.5);
      }
      const sorted = Float32Array.from(n).sort(), cut = sorted[Math.min(sorted.length - 1, Math.floor((1 - (st.amount ?? 0.2)) * sorted.length))];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (n[y * W + x] >= cut) put(x, y, tile, over);
    } else if (st.patch !== undefined) {
      const tile = world.id(st.patch), over = ids(st.over), [cx, cy] = st.at, r = st.radius ?? 8, rough = st.rough ?? 0.45;
      const rim = noiseField(64, 1, 8, 2, rnd);             // the outline: a radius that varies with the direction
      for (let j = Math.floor(cy - r * 1.5); j <= Math.ceil(cy + r * 1.5); j++) for (let i = Math.floor(cx - r * 1.5); i <= Math.ceil(cx + r * 1.5); i++) {
        const a = (Math.atan2(j - cy, i - cx) / (2 * Math.PI) + 0.5) * 63, k = a | 0, edge = rim[k] + (rim[(k + 1) % 64] - rim[k]) * (a - k);
        if (Math.hypot(i - cx, j - cy) <= r * (1 + rough * (edge - 0.5) * 2)) put(i, j, tile, over);
      }
    } else if (st.river !== undefined) {
      const tile = world.id(st.river), ford = st.ford !== undefined ? world.id(st.ford) : -1, width = st.width ?? 3;
      const [x0, y0] = point(st.from), [x1, y1] = point(st.to);
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(len * 1.5), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      const bend = noiseField(n + 1, 1, n / 3, 2, rnd), reach = (st.wander ?? 0.25) * len * 0.5;   // a few slow bends, not a zigzag
      const every = st.fordEvery ?? 60, fw = st.fordWidth ?? 3;
      let nextFord = every * (0.4 + rnd() * 0.4), walked = 0, px = x0, py = y0;
      for (let k = 0; k <= n; k++) {
        const t = k / n, off = (bend[k] - 0.5) * 2 * reach * Math.sin(Math.PI * t);   // the ends stay on their edge points
        const cx = x0 + (x1 - x0) * t + nx * off, cy = y0 + (y1 - y0) * t + ny * off;
        walked += Math.hypot(cx - px, cy - py); px = cx; py = cy;
        const isFord = ford >= 0 && walked >= nextFord && walked < nextFord + fw;
        if (ford >= 0 && walked >= nextFord + fw) { info.fords.push([Math.round(cx), Math.round(cy)]); nextFord += every; }
        const r = width / 2;
        for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
          if (!world.inside(i, j) || Math.hypot(i + 0.5 - cx, j + 0.5 - cy) > r + 0.5 || world.bldAt[j * W + i] >= 0) continue;
          const old = world.tiles[j * W + i];
          if (isFord) { if (old !== ford) world.set(i, j, ford); } else if (old !== tile && old !== ford) world.set(i, j, tile);
        }
      }
    } else if (st.road !== undefined) {
      const tile = world.id(st.road), over = ids(st.over);
      const [x0, y0] = point(st.from), [x1, y1] = point(st.to), cells = world.lineCells(x0, y0, x1, y1);
      for (const [x, y] of cells) {
        if (!world.inside(x, y) || world.bldAt[y * W + x] >= 0) continue;
        const old = world.tiles[y * W + x];
        if (old === tile || (over && old !== fill && !over.includes(old))) continue;
        world.set(x, y, tile);
      }
      info.roads.push(cells);
    } else if (st.clearing !== undefined) {
      const [cx, cy] = st.clearing, r = st.radius ?? 12, keep = ids(st.keep) ?? [];
      for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
        if (!world.inside(i, j) || Math.hypot(i - cx, j - cy) > r || world.bldAt[j * W + i] >= 0) continue;
        const old = world.tiles[j * W + i];
        if (old !== fill && !keep.includes(old)) world.set(i, j, fill);
      }
    }
  }
  for (let c = 0; c < world.cells; c++) { const name = world.defs[world.tiles[c]].name; info.counts[name] = (info.counts[name] ?? 0) + 1; }
  return info;
}
