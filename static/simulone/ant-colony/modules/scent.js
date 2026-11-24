// Fields over the grid that fade. A layer holds one number per cell (how strongly the cell smells of
// something). Agents, rules or the player add to it; it halves every so often by itself. A game can ask
// to be told when a cell goes above or below a strength, and can send agents to the cells above one.
//
// The module keeps the layers and their fading. What a layer means (a food trail, an alarm, a mark the
// player drew, how busy a cell has been) is the game's business.

/**
 * @param {object} d
 * @param {Record<string, {halfLife:number, max?:number}>} d.layers   `halfLife` in ticks (Infinity: never fades); `max`: the
 *                                                                    most a cell can hold (default 1)
 * @param {number} [d.every=15]   the layers are faded this often, in ticks
 */
export function createScent(d) {
  const names = Object.keys(d.layers), every = d.every ?? 15;
  const S = { layers: names, sim: null, world: null };
  let data = [], keep = [], top = [];
  const watches = [];                                        // { k, above, on: Uint8Array, route, fn }
  const k_ = layer => { const k = names.indexOf(layer); if (k < 0) throw new Error(`Unknown scent layer "${layer}"`); return k; };

  // A cell's value changed: tell whoever watches a strength it crossed.
  function crossed(k, c, v) {
    for (const w of watches) {
      if (w.k !== k) continue;
      const on = v > w.above ? 1 : 0;
      if (on === w.on[c]) continue;
      w.on[c] = on;
      if (w.route) S.world.fieldChanged(w.route);
      if (w.fn) w.fn(c, on === 1);
    }
  }
  /** How strong a layer is on a cell. */
  S.at = (layer, cell) => data[k_(layer)][cell];
  /** The whole layer, one number per cell (read it, do not write it). */
  S.data = layer => data[k_(layer)];
  /** Add to a layer on a cell (it never goes above the layer's `max`). */
  S.add = (layer, cell, amount) => { const k = k_(layer), v = Math.min(top[k], data[k][cell] + amount); data[k][cell] = v; crossed(k, cell, v); };
  /** Set a layer on a cell. */
  S.set = (layer, cell, value) => { const k = k_(layer), v = Math.max(0, Math.min(top[k], value)); data[k][cell] = v; crossed(k, cell, v); };
  /**
   * Be told when a cell of a layer goes above `above` or back below it: fn(cell, isAbove). Ask before the simulation is built.
   */
  S.watch = (layer, above, fn) => { watches.push({ k: k_(layer), above, on: null, route: null, fn }); };
  /**
   * The route to the nearest cell where a layer is stronger than `above`, for an action's `at`. Ask before the simulation is built.
   */
  S.route = (layer, above = 0.05) => {
    const route = `scent:${layer}>${above}`;
    if (!watches.some(w => w.route === route)) watches.push({ k: k_(layer), above, on: null, route, fn: null });
    return '#' + route;
  };

  function setup(sim) {
    S.sim = sim; S.world = sim.world;
    data = names.map(() => new Float32Array(sim.world.cells));
    top = names.map(n => d.layers[n].max ?? 1);
    keep = names.map(n => (d.layers[n].halfLife === Infinity ? 1 : Math.pow(0.5, every / d.layers[n].halfLife)));
    for (const w of watches) {
      w.on = new Uint8Array(sim.world.cells);
      if (w.route) sim.world.addField(w.route, push => { for (let c = 0; c < w.on.length; c++) if (w.on[c]) push(c); });
    }
  }
  function onTick(sim) {
    if (sim.tick % every) return;
    for (let k = 0; k < names.length; k++) {
      if (keep[k] === 1) continue;
      const a = data[k], f = keep[k], watched = watches.some(w => w.k === k);
      for (let c = 0; c < a.length; c++) {
        if (a[c] === 0) continue;
        const v = a[c] * f < 0.004 ? 0 : a[c] * f;
        a[c] = v;
        if (watched) crossed(k, c, v);
      }
    }
  }

  S.save = () => ({ layers: names.map((n, k) => { const cells = []; for (let c = 0; c < data[k].length; c++) if (data[k][c] > 0) cells.push(c, +data[k][c].toFixed(3)); return { name: n, cells }; }) });
  S.load = saved => {
    for (let k = 0; k < names.length; k++) for (let c = 0; c < data[k].length; c++) if (data[k][c] > 0) S.set(names[k], c, 0);
    for (const l of saved?.layers ?? []) if (names.includes(l.name)) for (let p = 0; p < l.cells.length; p += 2) S.set(l.name, l.cells[p], l.cells[p + 1]);
  };

  /** Hand this to the engine: `modules: [scent.module, …]`. */
  S.module = { name: 'scent', setup, onTick, save: () => S.save(), load: saved => S.load(saved) };
  return S;
}
