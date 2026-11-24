// Water in dug-out ground, as one level. Water comes in at a few cells (the game says which: ways in from above)
// and is an amount, not a set of blocks: it lies in the lowest space it can reach, flat, and its surface rises as
// more comes in and falls as it soaks away into the ground it touches.
//
// "Can reach" is what water does: it runs down and sideways freely, and gets up over a rise only once it stands
// that high. So a pit below the way in fills first, a wide room takes long to fill, and a hollow beyond a hump
// stays dry until the water tops the hump.
//
// A cell wholly under water becomes a solid tile of its own, so nothing walks through it and routes go round;
// when the water goes it becomes what it was. The row the surface is in is not yet flooded: `filling(cell)` says how
// deep the water stands in it, for drawing. What water ruins is the game's business (onFlood).

/**
 * @param {object} d
 * @param {string} d.wet                  the tile a flooded cell becomes (solid)
 * @param {string[]} d.into               the tiles water may fill
 * @param {() => number[]} d.sources      the cells water comes in by, now (a blocked one is simply not open ground)
 * @param {Record<string, number>} [d.soak]  per tile name: how much water one flooded cell loses each step to a neighbour
 *                                        of that tile (the most absorbent of its four counts)
 * @param {number} [d.dry=0]              how much every flooded cell loses each step anyway
 * @param {number} [d.puddle=0.03]        how much the shallow water of the surface row loses each step
 * @param {number} [d.every=6]            ticks between steps
 */
export function createWater(d) {
  const Wa = {
    sim: null, world: null,
    /** 1 for every flooded cell. */
    wet: null,
    /** How many cells are flooded, and how much water there is in all (in cells). */
    count: 0, volume: 0,
    /** The row the water's surface is in (not yet flooded), and how full that row is, 0..1. -1 with no water. */
    row: -1, part: 0,
    /** Called with (cell) when a cell floods, and when one dries. */
    onFlood: null, onDry: null,
  };
  let W = 0, H = 0, under = null, wetTile = 0, into = null, soak = null, reach = null, queue = null, hist = null, seenVersion = -1, dirty = false;
  const every = d.every ?? 6, BIG = 1 << 20, SLACK = 0.75;

  function flood(c) { const w = Wa.world; under[c] = w.tiles[c]; Wa.wet[c] = 1; Wa.count++; w.set(c % W, (c / W) | 0, wetTile); if (Wa.onFlood) Wa.onFlood(c); }
  function dry(c) { Wa.wet[c] = 0; Wa.count--; Wa.world.set(c % W, (c / W) | 0, under[c]); if (Wa.onDry) Wa.onDry(c); }

  /** Let `amount` of water in (in cells). It goes where it would run to. */
  Wa.pour = amount => { if (amount > 0) { Wa.volume += amount; dirty = true; } };
  /** How deep the water stands in a cell that is not flooded: 0..1 of its height. */
  Wa.filling = c => (Wa.row >= 0 && reach[c] === Wa.row && !Wa.wet[c] ? Wa.part : 0);
  /** Take all the water away. */
  Wa.clear = () => { Wa.volume = 0; dirty = true; settle(); };

  // reach[c]: the row the water's surface must be above for cell c to be under it. For a cell water simply runs down
  // to, that is its own row; beyond a rise, the row of the top of the rise. -1 where water cannot come at all.
  function settle() {
    const world = Wa.world, tiles = world.tiles, wet = Wa.wet, n = wet.length;
    const open = c => c >= 0 && c < n && (wet[c] === 1 || into[tiles[c]] === 1);
    const best = reach; best.fill(-1);
    let head = 0, tail = 0;
    const seed = c => { if (open(c) && best[c] < BIG) { best[c] = BIG; queue[tail++ % n] = c; } };
    for (const c of d.sources()) seed(c);
    if (tail === 0 && Wa.count) {                              // every way in is shut: the water that is inside finds its own level
      let top = -1; for (let c = 0; c < n && top < 0; c++) if (wet[c]) top = (c / W) | 0;
      for (let c = top * W; c < (top + 1) * W; c++) if (wet[c]) seed(c);
    }
    while (head < tail) {                                     // widest way: each cell keeps the easiest rise by which water gets to it
      const c = queue[head++ % n], v = best[c];
      for (const s of [c + W, c - 1, c + 1, c - W]) {
        if (!open(s)) continue;
        const nv = s === c - W ? Math.min(v, (s / W) | 0) : v;  // going up into a row: only once the surface is above it
        if (nv > best[s]) { best[s] = nv; queue[tail++ % n] = s; }
      }
    }
    hist.fill(0);
    for (let c = 0; c < n; c++) if (best[c] >= 0) { const y = (c / W) | 0; if (best[c] > y) best[c] = y; hist[best[c]]++; }

    // From the bottom up: whole rows while the water lasts, then a part of the next.
    let left = Wa.volume, row = H - 1;
    while (row >= 0 && left >= hist[row]) { left -= hist[row]; row--; }
    if (row < 0) { Wa.volume -= left; left = 0; }             // more than the place holds: the rest runs off
    // A row that has flooded stays so until the water is clearly below it, or a level hovering at a row's brim would
    // flood and dry it over and over.
    let spare = Wa.volume + SLACK, keep = H - 1;
    while (keep >= 0 && spare >= hist[keep]) { spare -= hist[keep]; keep--; }
    Wa.row = Wa.volume > 0 && row >= 0 ? row : -1; Wa.part = row >= 0 && hist[row] ? left / hist[row] : 0;
    for (let c = n - 1; c >= 0; c--) {
      const should = best[c] > row && best[c] >= 0;
      if (should && !wet[c]) flood(c);
      else if (!should && wet[c] && best[c] >= 0 && best[c] <= keep) dry(c);   // a pool cut off from every way in stays as it is, and soaks away
    }
    seenVersion = world.version; dirty = false;
  }

  function setup(sim) {
    Wa.sim = sim; const w = Wa.world = sim.world;
    W = w.w; H = w.h; Wa.wet = new Uint8Array(w.cells); under = new Uint8Array(w.cells); Wa.count = 0; Wa.volume = 0; Wa.row = -1; Wa.part = 0;
    reach = new Int32Array(w.cells).fill(-1); queue = new Int32Array(w.cells); hist = new Int32Array(H);
    wetTile = w.id(d.wet); seenVersion = -1; dirty = false;
    into = new Uint8Array(w.defs.length); for (const n of d.into) into[w.id(n)] = 1;
    soak = new Float32Array(w.defs.length); for (const [n, p] of Object.entries(d.soak ?? {})) soak[w.id(n)] = p;
  }
  function onTick(sim) {
    if (sim.tick % every) return;
    if (Wa.volume <= 0 && Wa.count === 0) return;
    const wet = Wa.wet, tiles = Wa.world.tiles;
    let loss = 0;
    for (let c = 0; c < wet.length; c++) {
      if (!wet[c]) continue;
      const p = Math.max(soak[tiles[c - 1]], soak[tiles[c + 1]], soak[tiles[c - W]], soak[tiles[c + W]]) + (d.dry ?? 0);
      if (reach[c] >= 0) loss += p;
      else if (p > 0 && sim.rnd() < p) dry(c);                 // a pool on its own: gone a cell at a time
    }
    loss += Wa.part > 0 || Wa.count === 0 ? d.puddle ?? 0.03 : 0;   // the shallow water on top soaks into the floor it lies on
    if (loss > 0) { Wa.volume = Math.max(0, Wa.volume - loss); dirty = true; }
    if (dirty || sim.world.version !== seenVersion) settle();  // more water, less water, or the ground has changed
  }

  Wa.save = () => { const cells = []; for (let c = 0; c < Wa.wet.length; c++) if (Wa.wet[c]) cells.push(c, under[c]); return { cells, volume: Wa.volume }; };
  /** Put saved water back. Load it after the map's tiles: the flooded cells are already the wet tile there. */
  Wa.load = s => {
    Wa.wet.fill(0); Wa.count = 0;
    const a = s?.cells ?? [];
    for (let k = 0; k < a.length; k += 2) { Wa.wet[a[k]] = 1; under[a[k]] = a[k + 1]; Wa.count++; }
    Wa.volume = s?.volume ?? Wa.count; dirty = true;
  };

  /** Hand this to the engine: `modules: [water.module, …]`. */
  Wa.module = { name: 'water', setup, onTick, save: () => Wa.save(), load: s => Wa.load(s) };
  return Wa;
}
