// Upkeep, as an engine module: things that wear a place down and the work of putting them right.
// Optional: the engine does not know it exists.
//
// Two things, both plain bookkeeping:
//   - litter: an amount on each cell. The game drops it (`drop`); the module leads whoever does the cleaning action to
//     the nearest cell with enough of it, and clears the cells around them when the action is finished.
//   - breakdowns: a building can break (`break`), which closes it, and is mended at once or after a time (`mend`).
// When litter falls, what breaks and what either costs are the game's.

/**
 * @param {object} def
 * @param {string} [def.field='litter']   the name of the route to litter: the cleaning action's `at` is '#' + this
 * @param {string} [def.clean]            the action that clears litter where it is done (leave out if nothing cleans)
 * @param {number} [def.above=1]          a cell with at least this much counts as dirty, and is somewhere to clean
 * @param {number} [def.max=5]            the most one cell holds
 * @param {number} [def.reach=1]          finishing the cleaning action clears every cell this many cells around
 * @param {(building) => void} [def.onMend]   called when a building is mended
 */
export function createUpkeep(def = {}) {
  const name = def.field ?? 'litter', above = def.above ?? 1, top = def.max ?? 5, reach = def.reach ?? 1;
  let sim = null, world = null, amount = new Float32Array(0), cleanA = -1;
  const U = {
    sim: null,
    /** The route to the nearest dirty cell, for the cleaning action's `at`. */
    route: '#' + name,
    /** How many cells are dirty right now, and how many have been cleaned since the last endDay(). */
    dirty: 0, cleaned: 0,
  };
  const set = (c, v) => {
    const was = amount[c] >= above, now = v >= above;
    amount[c] = v;
    if (was !== now) { U.dirty += now ? 1 : -1; world.fieldChanged(name); }
  };
  /** Drop litter on a cell (solid cells take none). */
  U.drop = (cell, n = 1) => { if (!world.solid[world.tiles[cell]]) set(cell, Math.min(top, amount[cell] + n)); };
  /** How much lies on a cell. */
  U.at = cell => amount[cell];
  /** The most that lies on a cell or the four beside it: what someone standing there sees. */
  U.near = cell => Math.max(amount[cell], amount[cell - 1], amount[cell + 1], amount[cell - world.w], amount[cell + world.w]);
  /** Clear a cell and those `r` around it. Returns how many dirty cells that cleared. */
  U.sweep = (cell, r = reach) => {
    const x0 = cell % world.w, y0 = (cell / world.w) | 0;
    let n = 0;
    for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
      if (!world.inside(x, y)) continue;
      const c = y * world.w + x;
      if (amount[c] > 0) { if (amount[c] >= above) n++; set(c, 0); }
    }
    U.cleaned += n;
    return n;
  };
  /** Clear everything (a night's cleaning). Returns how many dirty cells there were. */
  U.clear = () => { const n = U.dirty; for (let c = 0; c < amount.length; c++) if (amount[c] > 0) set(c, 0); return n; };
  /** The dirty cells, as [x, y] pairs (for drawing them). `inRect` = [x0, y0, x1, y1] keeps to a rectangle. */
  U.cells = inRect => {
    const out = [], W = world.w;
    const [x0, y0, x1, y1] = inRect ?? [0, 0, W - 1, world.h - 1];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (amount[y * W + x] >= above) out.push([x, y]);
    return out;
  };
  /** Start a new day's count of cells cleaned; returns the old one. */
  U.endDay = () => { const n = U.cleaned; U.cleaned = 0; return n; };

  // ── breakdowns
  /** Break a building: it closes (for the reason 'broken') until it is mended. */
  U.break = b => { if (!b || b.broken) return false; b.broken = true; delete b.mendAt; world.setBlocked(b, true, 'broken'); return true; };
  /** Mend a building, now or `after` ticks from now. */
  U.mend = (b, after = 0) => {
    if (!b || !b.broken) return false;
    if (after > 0) { b.mendAt = sim.tick + after; return true; }
    b.broken = false; delete b.mendAt; world.setBlocked(b, false, 'broken');
    if (def.onMend) def.onMend(b);
    return true;
  };
  /** The buildings that are broken. */
  U.broken = () => world.buildings.filter(b => b && b.broken);

  function setup(s) {
    sim = U.sim = s; world = s.world; amount = new Float32Array(world.cells); U.dirty = 0; U.cleaned = 0;
    cleanA = def.clean ? s.actionIndex(def.clean) : -1;
    world.addField(name, push => { for (let c = 0; c < amount.length; c++) if (amount[c] >= above) push(c); });
  }
  function onFinish(i, a) { if (a === cleanA) U.sweep(sim.cell[i]); }
  function onTick(s) { if (s.tick % 16 === 0) for (const b of world.buildings) if (b && b.broken && b.mendAt !== undefined && s.tick >= b.mendAt) U.mend(b); }

  /** Hand this to the engine: `modules: [upkeep.module, …]`. What is broken is kept on the buildings; the litter is saved here. */
  U.module = { name: 'upkeep', setup, onTick, onFinish,
    save: () => { const cells = []; for (let c = 0; c < amount.length; c++) if (amount[c] > 0) cells.push(c, +amount[c].toFixed(2)); return { cells, cleaned: U.cleaned }; },
    load(d) {
      amount.fill(0); U.dirty = 0; U.cleaned = d?.cleaned ?? 0;
      for (let k = 0; k < (d?.cells?.length ?? 0); k += 2) { amount[d.cells[k]] = d.cells[k + 1]; if (d.cells[k + 1] >= above) U.dirty++; }
      world.fieldChanged(name);
    } };
  return U;
}
