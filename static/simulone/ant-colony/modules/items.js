// Things that exist on the map. An item has a kind and lies on a cell, in a pile with others of its kind,
// or is in the hands of an agent, who carries one thing at a time. Some cells are stores for a kind: they
// take that kind up to a limit, and what lies anywhere else is "loose", waiting to be fetched.
//
// The module keeps the piles and the hands, and four routes per kind for agents to follow:
//   any:<kind>     to the nearest pile of it, wherever it lies
//   loose:<kind>   to the nearest loose pile of it
//   room:<kind>    to the nearest store of it with room left
//   stock:<kind>   to the nearest store of it that holds some
// It moves nothing by itself: a game's tasks (tasks.js, beside this file) or rules call pick, give and drop.
// It knows nothing about what the kinds are.

/**
 * @param {object} d
 * @param {Record<string, {slow?:number}>} d.kinds   the kinds of item; `slow` multiplies the walking speed of whoever carries one
 * @param {number} [d.dropAfter=0]   ticks after which someone carrying a thing with no store to reach puts it down where they
 *                                   stand (0 = never)
 */
export function createItems(d) {
  const names = Object.keys(d.kinds);
  const I = {
    kinds: names, sim: null, world: null,
    /** Per kind: how many lie on the map, how many of those are in stores, and the room all its stores have together. */
    total: names.map(() => 0), stored: names.map(() => 0), space: names.map(() => 0),
    /** Called with (kind name, cell, change) whenever a pile grows or shrinks. */
    onChange: null,
  };
  let count = [], cap = [], carry = null, stuck = null, W = 0;
  const wanted = new Set();                                  // the routes the game asked for, as 'loose:crumb'
  const k_ = kind => { const k = typeof kind === 'number' ? kind : names.indexOf(kind); if (k < 0 || k >= names.length) throw new Error(`Unknown item kind "${kind}"`); return k; };
  const IS = {
    any: (k, c) => count[k][c] > 0,
    loose: (k, c) => count[k][c] > 0 && cap[k][c] === 0,
    room: (k, c) => count[k][c] < cap[k][c],
    stock: (k, c) => cap[k][c] > 0 && count[k][c] > 0,
  };

  /**
   * The name of a route, to use as an action's `at`: I.route('loose', 'crumb') → '#loose:crumb'.
   * Ask for the routes a game needs before the simulation is built; only those are kept up to date.
   */
  I.route = (what, kind) => { if (!IS[what]) throw new Error(`Unknown route "${what}"`); k_(kind); wanted.add(what + ':' + kind); return '#' + what + ':' + kind; };

  // A pile or a store changed on cell c: tell the routes whose set of cells that changed.
  function touch(k, c, change) {
    const was = {};
    for (const w of Object.keys(IS)) was[w] = IS[w](k, c);
    change();
    for (const w of Object.keys(IS)) if (was[w] !== IS[w](k, c) && wanted.has(w + ':' + names[k])) I.world.fieldChanged(w + ':' + names[k]);
  }
  function add(k, c, n) {
    touch(k, c, () => { count[k][c] += n; });
    I.total[k] += n; if (cap[k][c] > 0) I.stored[k] += n;
    if (I.onChange) I.onChange(names[k], c, n);
  }

  /** How many of a kind lie on a cell. */
  I.at = (kind, cell) => count[k_(kind)][cell];
  /** What lies on a cell: { kind: count } for the kinds that do. */
  I.on = cell => { const o = {}; names.forEach((n, k) => { if (count[k][cell]) o[n] = count[k][cell]; }); return o; };
  /** Every pile of a kind: calls f(cell, count, isStore). */
  I.each = (kind, f) => { const k = k_(kind), n = count[k], cp = cap[k]; for (let c = 0; c < n.length; c++) if (n[c] || cp[c]) f(c, n[c], cp[c]); };
  /** How many of a kind lie on the map, and how many of those are in stores. */
  I.count = kind => I.total[k_(kind)];
  I.inStores = kind => I.stored[k_(kind)];
  /** How many of a kind lie loose (outside stores). */
  I.loose = kind => { const k = k_(kind); return I.total[k] - I.stored[k]; };
  /** How much room the stores of a kind have left. */
  I.room = kind => { const k = k_(kind); return I.space[k] - I.stored[k]; };

  /** Put n of a kind on a cell (a find, a delivery from outside the map). */
  I.put = (kind, cell, n = 1) => { add(k_(kind), cell, n); };
  /** Take up to n of a kind from a cell, out of the game. Returns how many were there to take. */
  I.take = (kind, cell, n = 1) => { const k = k_(kind), got = Math.min(n, count[k][cell]); if (got) add(k, cell, -got); return got; };
  /** Make a cell a store for a kind holding up to `limit` (0: no longer a store; what lies there becomes loose). */
  I.setStore = (kind, cell, limit) => {
    const k = k_(kind), old = cap[k][cell];
    if (old === limit) return;
    touch(k, cell, () => { cap[k][cell] = limit; });
    I.space[k] += limit - old;
    if (old === 0) I.stored[k] += count[k][cell]; else if (limit === 0) I.stored[k] -= count[k][cell];
  };
  /** The limit of a store cell for a kind (0 if it is not one). */
  I.limit = (kind, cell) => cap[k_(kind)][cell];

  /** How many of a kind are being carried right now. */
  let heldAt = -1; const heldNow = names.map(() => 0);
  I.carried = kind => {
    const sim = I.sim;
    if (heldAt !== sim.tick) { heldAt = sim.tick; heldNow.fill(0); for (let i = 0; i < sim.count; i++) if (carry[i]) heldNow[carry[i] - 1]++; }
    return heldNow[k_(kind)];
  };
  /** Room in the stores of a kind for more than is already on its way there in someone's jaws. */
  I.spare = kind => I.room(kind) - I.carried(kind);
  /** What agent i carries: a kind's name, or null. */
  I.carrying = i => (carry[i] ? names[carry[i] - 1] : null);
  function hold(i, k) { carry[i] = k + 1; stuck[i] = 0; I.sim.speedScale[i] = d.kinds[names[k]].slow ?? 1; }
  /** Put one of a kind in agent i's empty hands, from nowhere (dug out, cut off, made). False if the hands are full. */
  I.give = (i, kind) => { if (carry[i]) return false; hold(i, k_(kind)); return true; };
  /** Agent i picks one of a kind up from a cell. False if its hands are full or there is none. */
  I.pick = (i, kind, cell) => { const k = k_(kind); if (carry[i] || !count[k][cell]) return false; add(k, cell, -1); hold(i, k); return true; };
  /** Agent i puts down what it carries on a cell. False if it carries nothing, or the cell is a store of that kind and full. */
  I.drop = (i, cell) => {
    if (!carry[i]) return false;
    const k = carry[i] - 1;
    if (cap[k][cell] > 0 && count[k][cell] >= cap[k][cell]) return false;
    carry[i] = 0; I.sim.speedScale[i] = 1; add(k, cell, 1);
    return true;
  };
  /** What agent i carries leaves the game (eaten, used up). Returns its kind's name, or null. */
  I.use = i => { if (!carry[i]) return null; const k = carry[i] - 1; carry[i] = 0; I.sim.speedScale[i] = 1; return names[k]; };

  function setup(sim) {
    I.sim = sim; I.world = sim.world; W = sim.world.w;
    count = names.map(() => new Uint16Array(sim.world.cells)); cap = names.map(() => new Uint16Array(sim.world.cells));
    I.total.fill(0); I.stored.fill(0); I.space.fill(0);
    carry = sim.addColumn('carry', Uint8Array, 0); stuck = sim.addColumn('carryStuck', Uint16Array, 0);
    for (const w of wanted) {
      const [what, kind] = w.split(':'), k = k_(kind), is = IS[what];
      sim.world.addField(w, push => { for (let c = 0; c < sim.world.cells; c++) if (is(k, c)) push(c); });
    }
  }
  const CHECK = 30;
  function onTick(sim) {
    if (!d.dropAfter || sim.tick % CHECK) return;
    for (let i = 0; i < sim.count; i++) {
      if (!carry[i]) continue;
      const name = 'room:' + names[carry[i] - 1], f = wanted.has(name) ? sim.world.customField(name) : null;
      if (f && f[sim.cell[i]] !== 65535) { stuck[i] = 0; continue; }      // there is somewhere to take it
      const k = carry[i] - 1, c = sim.cell[i];
      if (cap[k][c] > 0 && count[k][c] >= cap[k][c]) continue;          // standing on a full store of it: not here
      if ((stuck[i] += CHECK) >= d.dropAfter) { carry[i] = 0; sim.speedScale[i] = 1; add(k, c, 1); }
    }
  }
  // Someone leaving the game puts down what they carried.
  function onGone(i, cause, sim) { if (carry[i]) { const k = carry[i] - 1; carry[i] = 0; add(k, sim.cell[i], 1); } }

  /** Piles and stores as plain data. What agents carry is one of the simulation's own columns and is saved with them. */
  I.save = () => ({ kinds: names.map((n, k) => { const piles = []; for (let c = 0; c < count[k].length; c++) if (count[k][c] || cap[k][c]) piles.push(c, count[k][c], cap[k][c]); return { name: n, piles }; }) });
  I.load = data => {
    for (const s of data?.kinds ?? []) {
      const k = names.indexOf(s.name);
      if (k < 0) continue;
      count[k].fill(0); cap[k].fill(0); I.total[k] = I.stored[k] = I.space[k] = 0;
      for (let p = 0; p < s.piles.length; p += 3) {
        const c = s.piles[p], n = s.piles[p + 1], lim = s.piles[p + 2];
        count[k][c] = n; cap[k][c] = lim; I.total[k] += n; I.space[k] += lim; if (lim) I.stored[k] += n;
      }
    }
    for (const w of wanted) I.world.fieldChanged(w);
  };

  /** Hand this to the engine: `modules: [items.module, …]`. */
  I.module = { name: 'items', setup, onTick, onGone, save: () => I.save(), load: data => I.load(data) };
  return I;
}
