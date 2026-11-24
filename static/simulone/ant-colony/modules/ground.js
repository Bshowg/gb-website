// Ground as material. Some solid tiles can be dug: the player (or a rule) marks cells, and a marked cell is
// removed a load at a time by whoever works at it, from an open cell beside it. When its last load is out
// the cell becomes open ground.
//
// Some ground does not hold a wide roof: a kind may have a `span`, the widest run of open cells it will
// stand over. Over a wider run it falls in, a cell at a time (`settle`).
//
// The module keeps the marks and how much of each marked cell is left, and one route for agents to follow:
// to the nearest open cell that touches a marked one. It does not move anyone and does not know what a
// load becomes: a game's tasks call `face` and `bite`.

const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * @param {object} d
 * @param {Record<string, {loads:number, span?:number}>} d.kinds   tile names that can be dug, and how many loads a cell of each
 *        holds; `span`: the widest run of open cells this ground stands over as a roof (none: any width)
 * @param {string} d.open          the tile a cell becomes when it is dug out
 * @param {number} [d.perFace=2]   how many may work at one marked cell at a time
 */
export function createGround(d) {
  const G = {
    sim: null, world: null,
    /** 1 for every marked cell. */
    marked: null,
    /** Loads still in each marked cell. */
    left: null,
    /** How many cells are marked, and how many have been dug out since the start. */
    count: 0, dug: 0,
    /** The route to follow, for an action's `at`. */
    route: '#dig',
    /** Called with (cell) when a cell has been dug out. */
    onDug: null,
    /** Called with (cell) when a roof has fallen into a cell, which is now solid ground again. */
    onCave: null,
  };
  let loads = null, spans = null, openTile = 0, W = 0;

  /** How many loads a cell of the tile at (x, y) holds, or 0 if it cannot be dug. */
  G.loadsAt = (x, y) => (G.world.inside(x, y) && G.world.bldAt[y * W + x] < 0 ? loads[G.world.tiles[y * W + x]] : 0);
  /** Mark a cell to be dug. Returns true if it is now marked (false: not diggable, or already marked). */
  G.mark = (x, y) => {
    const c = y * W + x, n = G.loadsAt(x, y);
    if (!n || G.marked[c]) return false;
    G.marked[c] = 1; G.left[c] = n; G.count++;
    G.world.fieldChanged('dig');
    return true;
  };
  /** Take a mark away. What was already dug out of the cell is put back. */
  G.unmark = (x, y) => {
    const c = y * W + x;
    if (!G.world.inside(x, y) || !G.marked[c]) return false;
    G.marked[c] = 0; G.left[c] = 0; G.count--;
    G.world.fieldChanged('dig');
    return true;
  };
  /** How much of a marked cell is gone, 0..1. */
  G.progress = c => { const n = loads[G.world.tiles[c]]; return G.marked[c] && n ? 1 - G.left[c] / n : 0; };
  /** Marked cells that can be reached now: they touch open ground. */
  G.faces = () => {
    const { tiles, solid } = G.world; let n = 0;
    for (let c = 0; c < G.marked.length; c++) if (G.marked[c] && (!solid[tiles[c - 1]] || !solid[tiles[c + 1]] || !solid[tiles[c - W]] || !solid[tiles[c + W]])) n++;
    return n;
  };
  /**
   * The marked cell someone standing on `cell` should work at: the one beside it with the fewest already at it,
   * or -1 if there is none with room. `busy(cell)` says how many are working at a marked cell right now.
   */
  G.face = (cell, busy) => {
    let best = -1, least = d.perFace ?? 2;
    for (const [dx, dy] of SIDES) {
      const c = cell + dx + dy * W;
      if (!G.marked[c]) continue;
      const n = busy(c);
      if (n < least) { least = n; best = c; }
    }
    return best;
  };
  /** Take one load out of a marked cell. Returns false if it is not marked (any more). The last load opens the cell. */
  G.bite = c => {
    if (!G.marked[c]) return false;
    if (--G.left[c] > 0) return true;
    G.marked[c] = 0; G.count--; G.dug++;
    G.world.set(c % W, (c / W) | 0, openTile);                 // the map changed: every route is brought up to date
    if (G.onDug) G.onDug(c);
    return true;
  };

  /**
   * Let roofs that are too wide fall in. Each run of open cells under ground with a `span`, wider than that span, has
   * `chance` of losing one cell from its middle: the cell fills with the ground that was above it. `rnd` gives 0..1;
   * `ok(cell)` may rule a run out. Returns the cells that fell in. Call it now and then; more often, or with a higher
   * chance, when the ground is wet.
   */
  G.settle = (rnd, chance, ok) => {
    const w = G.world, { tiles, solid } = w, out = [];
    for (let y = 2; y < w.h - 1; y++) for (let x = 1; x < W - 1; x++) {
      const c = y * W + x, span = spans[tiles[c - W]];
      if (!span || solid[tiles[c]]) continue;
      let x1 = x;
      while (x1 + 1 < W - 1 && !solid[tiles[y * W + x1 + 1]] && spans[tiles[(y - 1) * W + x1 + 1]]) x1++;
      const width = x1 - x + 1;
      if (width > span && (!ok || ok(c)) && rnd() < chance) {
        const fall = c + (width >> 1);
        w.set(fall % W, y, tiles[fall - W]);
        out.push(fall);
        if (G.onCave) G.onCave(fall);
      }
      x = x1;
    }
    return out;
  };

  function setup(sim) {
    G.sim = sim; const w = G.world = sim.world;
    W = w.w; G.marked = new Uint8Array(w.cells); G.left = new Uint8Array(w.cells); G.count = 0; G.dug = 0;
    loads = new Uint8Array(w.defs.length);
    spans = new Uint8Array(w.defs.length);
    for (const [name, k] of Object.entries(d.kinds)) { loads[w.id(name)] = k.loads ?? 0; spans[w.id(name)] = k.span ?? 0; }
    openTile = w.id(d.open);
    w.addField('dig', push => {
      const { tiles, solid } = w;
      for (let c = 0; c < G.marked.length; c++) if (G.marked[c]) for (const [dx, dy] of SIDES) { const n = c + dx + dy * W; if (!solid[tiles[n]]) push(n); }
    });
  }

  G.save = () => { const marks = []; for (let c = 0; c < G.marked.length; c++) if (G.marked[c]) marks.push(c, G.left[c]); return { marks, dug: G.dug }; };
  G.load = data => {
    G.marked.fill(0); G.left.fill(0); G.count = 0; G.dug = data?.dug ?? 0;
    const m = data?.marks ?? [];
    for (let k = 0; k < m.length; k += 2) { G.marked[m[k]] = 1; G.left[m[k]] = m[k + 1]; G.count++; }
    G.world.fieldChanged('dig');
  };

  /** Hand this to the engine: `modules: [ground.module, …]`. */
  G.module = { name: 'ground', setup, save: () => G.save(), load: data => G.load(data) };
  return G;
}
