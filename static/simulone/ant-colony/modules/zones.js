// Areas named by the player. A zone is not a building: it has no fixed shape and no door. It is whatever
// open cells the player has painted with a purpose ("food", "brood", "rest"), in any shape. Cells of one
// purpose that touch form a room.
//
// The module keeps which cell has which purpose, a route to the nearest cell of each purpose a game asks
// for, and tells the game when a cell's purpose changes. What a purpose means (what may be stored there,
// what an agent does there) is the game's business.

const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * @param {object} d
 * @param {Record<string, object>} d.kinds   the purposes a cell can have; whatever a game puts in each is its own
 * @param {(cell:number, kind:string|null, was:string|null) => void} [d.onChange]   a cell's purpose changed
 */
export function createZones(d) {
  const names = Object.keys(d.kinds);
  const Z = { kinds: names, sim: null, world: null };
  let at = null, W = 0, lists = null;
  const wanted = new Set();
  const k_ = kind => { const k = names.indexOf(kind); if (k < 0) throw new Error(`Unknown zone kind "${kind}"`); return k; };

  /** The name of the route to the nearest cell of a purpose, for an action's `at`. Ask before the simulation is built. */
  Z.route = kind => { k_(kind); wanted.add(kind); return '#zone:' + kind; };
  /** The purpose of a cell, or null. */
  Z.at = cell => (at[cell] ? names[at[cell] - 1] : null);
  /** May this cell be given a purpose? Open ground inside the map that is not part of a building. */
  Z.open = (x, y) => Z.world.inside(x, y) && !Z.world.solid[Z.world.tiles[y * W + x]] && Z.world.bldAt[y * W + x] < 0;
  /** Give a cell a purpose, or none (null). Returns true if that changed anything. `force` skips the check that the cell is open ground. */
  Z.set = (x, y, kind, force = false) => {
    if (!Z.world.inside(x, y)) return false;
    const c = y * W + x, now = kind == null ? 0 : k_(kind) + 1, was = at[c];
    if (now === was || (now && !force && !Z.open(x, y))) return false;
    at[c] = now; lists = null;
    for (const k of [was, now]) if (k && wanted.has(names[k - 1])) Z.world.fieldChanged('zone:' + names[k - 1]);
    if (d.onChange) d.onChange(c, now ? names[now - 1] : null, was ? names[was - 1] : null);
    return true;
  };
  /** Every cell of a purpose, as a list of cell indexes (do not change it). */
  Z.cells = kind => {
    if (!lists) { lists = names.map(() => []); for (let c = 0; c < at.length; c++) if (at[c]) lists[at[c] - 1].push(c); }
    return lists[k_(kind)];
  };
  /** How many cells have a purpose. */
  Z.count = kind => Z.cells(kind).length;
  /** The rooms: cells of one purpose that touch. [{ kind, cells: [cell…] }] */
  Z.rooms = () => {
    const seen = new Uint8Array(at.length), out = [];
    for (let c = 0; c < at.length; c++) {
      if (!at[c] || seen[c]) continue;
      const room = { kind: names[at[c] - 1], cells: [] }, stack = [c];
      seen[c] = 1;
      while (stack.length) {
        const n = stack.pop(); room.cells.push(n);
        for (const [dx, dy] of SIDES) { const m = n + dx + dy * W; if (m >= 0 && m < at.length && !seen[m] && at[m] === at[c]) { seen[m] = 1; stack.push(m); } }
      }
      out.push(room);
    }
    return out;
  };

  function setup(sim) {
    Z.sim = sim; Z.world = sim.world; W = sim.world.w; at = new Uint8Array(sim.world.cells); lists = null;
    for (const kind of wanted) { const k = k_(kind) + 1; sim.world.addField('zone:' + kind, push => { for (let c = 0; c < at.length; c++) if (at[c] === k) push(c); }); }
  }

  Z.save = () => { const cells = []; for (let c = 0; c < at.length; c++) if (at[c]) cells.push(c, names[at[c] - 1]); return { cells }; };
  /** Put saved zones back. `onChange` is called for each cell, so whatever follows from a purpose is set up again. */
  Z.load = data => {
    for (let c = 0; c < at.length; c++) if (at[c]) Z.set(c % W, (c / W) | 0, null);
    const s = data?.cells ?? [];
    for (let k = 0; k < s.length; k += 2) if (names.includes(s[k + 1])) Z.set(s[k] % W, (s[k] / W) | 0, s[k + 1], true);   // as saved, even a cell that is under water just now
  };

  /** Hand this to the engine: `modules: [zones.module, …]`. */
  Z.module = { name: 'zones', setup, save: () => Z.save(), load: data => Z.load(data) };
  return Z;
}
