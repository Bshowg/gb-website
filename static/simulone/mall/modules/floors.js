// Floors, as an engine module: several levels in one simulation. Optional: the engine does not know it exists.
//
// The levels lie side by side on the one grid, each a rectangle the game gives. A level that is not built yet is
// filled with a solid tile; building it opens the rectangle. Levels are joined by connectors: a few cells at the
// same place on two neighbouring levels, with the engine's links between them (world.addLink), so people step from
// one level to the next and routes are found through them. The view shows one level at a time.
//
// What a connector is (an escalator, a ladder, a lift shaft) is the game's: it gives each kind its cells, which
// way each cell carries people, how long the step takes and what it counts for in a route.

/**
 * @param {object} def
 * @param {number} def.count                      how many levels there can be
 * @param {(k:number) => [number, number, number, number]} def.rect   the cells of level k: [x0, y0, x1, y1], inclusive
 * @param {string} def.closed                     the solid tile an unbuilt level is made of
 * @param {number} [def.start=1]                  levels built at the start
 * @param {Record<string, object>} def.connectors by kind: { cells: [{ dx, dy, tile, way: 'up' | 'down' | 'both' }], ticks, cost? }
 *        `tile` is the plain (walkable) tile laid on that cell on both levels; `ticks` and `cost` go to world.addLink
 */
export function createFloors(def) {
  let sim = null, world = null;
  const F = {
    sim: null,
    /** How many levels are built. */
    built: def.start ?? 1,
    /** The level on screen. */
    shown: 0,
    /** Every connector: { kind, level (the lower of the two), x, y (local to the level), stopped? }. */
    list: [],
    count: def.count, rect: def.rect,
  };
  /** The level a cell is on, or -1. */
  F.of = (x, y) => { for (let k = 0; k < def.count; k++) { const r = def.rect(k); if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) return k; } return -1; };
  /** A cell of a level from its place on that level, and back. */
  F.cell = (k, lx, ly) => { const r = def.rect(k); return [r[0] + lx, r[1] + ly]; };
  F.local = (x, y) => { const k = F.of(x, y); if (k < 0) return null; const r = def.rect(k); return { level: k, x: x - r[0], y: y - r[1] }; };

  /** Build the next level: its rectangle becomes open ground. Returns its number, or -1 if every level is built. */
  F.open = () => {
    if (F.built >= def.count) return -1;
    const k = F.built++, r = def.rect(k);
    for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) if (world.get(x, y) === world.id(def.closed)) world.set(x, y, world.fill);
    return k;
  };

  const free = (x, y) => world.inside(x, y) && world.get(x, y) === world.fill && !world.reserved[y * world.w + x] && world.linkTo[y * world.w + x] < 0;
  /**
   * May a connector of this kind join level `k` to the one above, at local cell (lx, ly)? true, or why not:
   * 'no level above' or 'needs free ground on both levels'.
   */
  F.canConnect = (kind, k, lx, ly) => {
    const c = def.connectors[kind];
    if (!c) throw new Error(`Unknown connector "${kind}"`);
    if (k < 0 || k + 1 >= F.built) return 'no level above';
    for (const cell of c.cells) for (const level of [k, k + 1]) { const r = def.rect(level), x = r[0] + lx + cell.dx, y = r[1] + ly + cell.dy; if (x > r[2] || y > r[3] || !free(x, y)) return 'needs free ground on both levels'; }
    return true;
  };
  const link = (c, k, lx, ly) => {
    for (const cell of c.cells) {
      const [ax, ay] = F.cell(k, lx + cell.dx, ly + cell.dy), [bx, by] = F.cell(k + 1, lx + cell.dx, ly + cell.dy);
      if (cell.way !== 'down') world.addLink(ax, ay, bx, by, { ticks: c.ticks, cost: c.cost });
      if (cell.way !== 'up') world.addLink(bx, by, ax, ay, { ticks: c.ticks, cost: c.cost });
    }
  };
  /** Put a connector in. Returns it ({ kind, level, x, y }), or null if it does not fit (see canConnect). */
  F.connect = (kind, k, lx, ly) => {
    if (F.canConnect(kind, k, lx, ly) !== true) return null;
    const c = def.connectors[kind];
    for (const cell of c.cells) for (const level of [k, k + 1]) { const [x, y] = F.cell(level, lx + cell.dx, ly + cell.dy); world.set(x, y, cell.tile); }
    link(c, k, lx, ly);
    const made = { kind, level: k, x: lx, y: ly };
    F.list.push(made);
    return made;
  };
  /** The connector that has a cell at (x, y), on either of its levels, or null. */
  F.at = (x, y) => {
    const p = F.local(x, y);
    if (!p) return null;
    return F.list.find(n => (p.level === n.level || p.level === n.level + 1) && def.connectors[n.kind].cells.some(cell => n.x + cell.dx === p.x && n.y + cell.dy === p.y)) ?? null;
  };
  /** Take a connector out (as given by `at` or `list`). */
  F.disconnect = n => {
    const at = F.list.indexOf(n);
    if (at < 0) return false;
    F.list.splice(at, 1);
    for (const cell of def.connectors[n.kind].cells) for (const level of [n.level, n.level + 1]) {
      const [x, y] = F.cell(level, n.x + cell.dx, n.y + cell.dy);
      world.removeLink(x, y); world.set(x, y, world.fill);
    }
    return true;
  };
  /** Stop a connector carrying people (a breakdown, a power cut), or start it again. Its cells stay; only the links go. */
  F.pause = (n, stopped = true) => {
    if (!F.list.includes(n) || !!n.stopped === stopped) return false;
    n.stopped = stopped;
    if (stopped) for (const cell of def.connectors[n.kind].cells) for (const level of [n.level, n.level + 1]) { const [x, y] = F.cell(level, n.x + cell.dx, n.y + cell.dy); world.removeLink(x, y); }
    else link(def.connectors[n.kind], n.level, n.x, n.y);
    return true;
  };
  /** The kind of connector a cell belongs to, or null (for telling what someone has just ridden). */
  F.kindAt = cell => F.at(cell % world.w, (cell / world.w) | 0)?.kind ?? null;
  /**
   * Which levels can be reached from level `from` and which lead back to it: [{ level, there, back }] for every built level.
   * A level people can get to but not leave is a trap: `there` without `back`.
   */
  F.reach = (from = 0) => {
    const go = (dir) => {
      const seen = new Set([from]), todo = [from];
      while (todo.length) {
        const k = todo.pop();
        for (const n of F.list) for (const cell of def.connectors[n.kind].cells) {
          if (n.stopped) continue;
          const up = cell.way !== 'down', down = cell.way !== 'up';
          const next = dir > 0 ? (n.level === k && up ? k + 1 : n.level + 1 === k && down ? k - 1 : -1)      // where one can go from k
                               : (n.level === k && down ? k + 1 : n.level + 1 === k && up ? k - 1 : -1);    // where one can come to k from
          if (next >= 0 && !seen.has(next)) { seen.add(next); todo.push(next); }
        }
      }
      return seen;
    };
    const there = go(1), back = go(-1);
    return Array.from({ length: F.built }, (_, k) => ({ level: k, there: there.has(k), back: back.has(k) }));
  };
  /** Show one level: the view draws only its rectangle and keeps the camera to it (a renderer with setRegion). */
  F.show = (k, renderer, pad = 0) => {
    F.shown = Math.max(0, Math.min(F.built - 1, k));
    const r = def.rect(F.shown);
    if (renderer?.setRegion) renderer.setRegion({ x0: r[0], y0: r[1], x1: r[2], y1: r[3] }, pad);
    return F.shown;
  };
  /** How many agents stand on each built level right now (those inside buildings included, by the building's place). */
  F.crowd = () => {
    const out = new Array(F.built).fill(0);
    for (let i = 0; i < sim.count; i++) { const k = F.of(sim.px[i] | 0, sim.py[i] | 0); if (k >= 0 && k < F.built) out[k]++; }
    return out;
  };

  /** Hand this to the engine: `modules: [floors.module, …]`. */
  F.module = { name: 'floors',
    setup(s) { sim = F.sim = s; world = s.world; F.built = def.start ?? 1; F.shown = 0; F.list = []; },
    save: () => ({ built: F.built, shown: F.shown, list: F.list.map(n => ({ ...n })) }),
    // The tiles come back with the map; the links are made again here.
    load(d) {
      for (let c = 0; c < world.cells; c++) if (world.linkTo[c] >= 0) world.removeLink(c % world.w, (c / world.w) | 0);
      F.built = d?.built ?? def.start ?? 1; F.shown = Math.min(d?.shown ?? 0, F.built - 1); F.list = (d?.list ?? []).filter(n => def.connectors[n.kind]).map(n => ({ ...n }));
      for (const n of F.list) if (!n.stopped) link(def.connectors[n.kind], n.level, n.x, n.y);
    } };
  return F;
}
