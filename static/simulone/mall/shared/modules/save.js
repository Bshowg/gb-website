// Saving a game: taking a running simulation apart into plain data and putting it back.
// Not a hook module: a helper a page calls. It saves three things:
//   - the map: every plain tile, and every building with whatever a game has written on it
//   - the people: all of the simulation's per-person values, the game's own columns included
//   - each module's own part: a module that has `save()` and `load(data, sim)` on its hook object is asked
//     for its data and given it back (the calendar, the economy, the progress and a game's rules do this)
//
// A save goes back into a simulation built from the same config: same tiles, prefabs, needs, actions and
// types. `version` is the game's own number for that; a save with another version is refused.

const FORMAT = 1;
// What the world works out for itself when a building is placed: not saved.
const DERIVED = new Set(['id', 'name', 'prefab', 'tile', 'x', 'y', 'w', 'h', 'rot', 'cx', 'cy', 'ex', 'ey', 'xx', 'xy', 'sector', 'area',
  'residents', 'workers', 'open', 'staff', 'cap', 'inside', 'customers', 'load']);
const plain = v => v === null || ['number', 'string', 'boolean'].includes(typeof v) || (typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype));

/**
 * @param {object} [def]
 * @param {string} [def.key]        keep the save in the browser's storage under this key (for write / read / clear)
 * @param {number} [def.version=1]  the game's own save version: raise it when a config change makes old saves unusable
 */
export function createSave(def = {}) {
  const version = def.version ?? 1;
  const S = {};

  /** The whole game as plain data (JSON-safe). `extra` is anything of the page's own to keep with it (camera, speed). */
  S.snapshot = (sim, extra = null) => {
    const w = sim.world, tiles = [];
    let last = -1, run = 0;
    for (let c = 0; c < w.cells; c++) {                            // run-length: [tile, count, tile, count…]
      const t = w.bldAt[c] >= 0 ? w.fill : w.tiles[c];            // under a building is the ground it was put on
      if (t === last) run++; else { if (run) tiles.push(last, run); last = t; run = 1; }
    }
    tiles.push(last, run);
    const buildings = w.buildings.map(b => {
      if (!b) return null;
      const own = {};
      for (const [k, v] of Object.entries(b)) if (!DERIVED.has(k) && k[0] !== '_' && plain(v)) own[k] = v;   // jobs, beds, blocked, and what a game wrote on it
      return { name: b.name, x: b.x, y: b.y, rot: b.rot, size: b.prefab.resize ? [b.w, b.h] : undefined, own };
    });
    const modules = {};
    for (const m of sim.modules) if (typeof m.save === 'function') modules[m.name] = m.save(sim);
    return { format: FORMAT, version, width: w.w, height: w.h, tileNames: w.defs.map(d => d.name), tiles, buildings, people: sim.snapshot(), modules, extra };
  };

  /**
   * Put a snapshot back into a simulation built from the same config, replacing its map and its people.
   * Returns true, or false if the data is not a save this game can read (nothing is changed then).
   */
  S.restore = (sim, data) => {
    const w = sim.world;
    if (!data || data.format !== FORMAT || data.version !== version || data.width !== w.w || data.height !== w.h) return false;
    // the map: clear what is there, lay the saved tiles, put the buildings back in the order they were built
    for (const b of w.buildings) if (b) w.demolish(b.x, b.y);
    const idOf = data.tileNames.map(n => w.ids.get(n) ?? w.fill), tiles = new Uint8Array(w.cells);
    for (let k = 0, c = 0; k < data.tiles.length; k += 2) { tiles.fill(idOf[data.tiles[k]], c, c + data.tiles[k + 1]); c += data.tiles[k + 1]; }
    w.loadTiles(tiles);
    const newId = new Int32Array(data.buildings.length).fill(-1);
    data.buildings.forEach((s, old) => {
      if (!s || !w.ids.has(s.name)) return;
      const b = w.place(s.name, s.x, s.y, s.rot, s.size ?? undefined);
      if (b) { Object.assign(b, s.own); newId[old] = b.id; }
    });
    // the people, with their homes and jobs pointed at the buildings' new ids
    sim.restore(data.people, id => (id < newId.length ? newId[id] : -1));
    // each module's own part
    for (const m of sim.modules) if (typeof m.load === 'function') m.load(data.modules?.[m.name], sim);
    sim.assign();
    return true;
  };

  // ── on the device
  /** Save to the browser's storage. Returns false if there is no key or storage is not available. */
  S.write = (sim, extra) => {
    if (!def.key) return false;
    try { localStorage.setItem(def.key, JSON.stringify(S.snapshot(sim, extra))); return true; } catch { return false; }
  };
  /** The stored save as data, or null. */
  S.read = () => {
    if (!def.key) return null;
    try { const s = localStorage.getItem(def.key); return s ? JSON.parse(s) : null; } catch { return null; }
  };
  /** Forget the stored save. */
  S.clear = () => { try { if (def.key) localStorage.removeItem(def.key); } catch { /* nothing to forget */ } };
  return S;
}
