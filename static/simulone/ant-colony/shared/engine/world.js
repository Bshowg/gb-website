// Grid world: tile map, placed buildings (prefab instances) with doors, and distance fields.
// No DOM here, so it also runs headless (Node) for tests and benchmarks.
//
// Buildings are solid. Agents reach a building's ENTRY cell (the ground cell in front of its door),
// go inside, and later reappear on its EXIT cell. Routes therefore lead to entry cells.
//
// Four kinds of distance field:
//   - a game's own ("nearest cell asking to be dug"): full-map like the per-kind ones, but the game says which cells
//     it leads to and when that changed (addField, fieldChanged)
//   - per tile kind ("nearest open canteen"): one full-map array each, shared by every agent
//   - per building ("my home", "my job"): a small window around the entry, built on demand and grown
//     when an agent further away needs it, so memory follows actual travel, not map size
//   - per sector ("any door in that neighbourhood"): full-map, built on demand, for agents too far
//     from their building to be inside its window
//
// All field work is done by work(budgetMs), a little at a time. Until a new field is finished the
// previous one stays in use, so edits never stall the simulation.

export const INF = 65535;
/** Field cost of one straight step across ordinary ground (a diagonal step costs 1.5× as much). */
export const STEP_COST = 4;
/** A building's window never reaches further than this many cells from its entry. */
export const WINDOW_REACH = 56;
/** Side of a routing sector, in cells. */
export const SECTOR = 32;

const now = () => performance.now();
const WINDOW_MARGIN = 8;
const SIDES = { N: 0, E: 1, S: 2, W: 3 };

export class World {
  /**
   * @param {object} o
   * @param {number} o.width   map width in cells
   * @param {number} o.height  map height in cells
   * @param {Array<{name:string, solid?:boolean, color?:string, block?:number, walkCost?:number, speed?:number, street?:boolean}>} [o.tiles]
   *        plain tile kinds (streets, fences…)
   * @param {Array<object>} [o.prefabs]  buildings the player can place: { name, w, h, beds, jobs, staff, capacity, door, exit, color, height }
   *        `resize: { min: [w, h], max: [w, h] }` lets the player drag out its footprint; `perCell: { jobs, beds }` then sets those by area.
   *        `flat: true` draws it on the ground with no sprite; `outdoor: true` (implies flat) also shows the people in it.
   * @param {{color?:string, color2?:string}} [o.floor]  tile 0, always walkable
   * @param {string} [o.fill]  the tile the map starts as (default: floor). It is what buildings and line-laid tiles may be put on,
   *        and what demolishing leaves behind. Name a solid tile for a map that is dug out rather than built on (earth, rock).
   * @param {number} [o.maxWindowCells]  memory cap for per-building windows, in cells (2 bytes each; default 40 million)
   * @param {number} [o.maxSectorCells]  memory cap for per-sector fields, in cells (default 4 million)
   */
  constructor({ width, height, tiles = [], prefabs = [], floor = {}, fill = null, maxWindowCells = 40e6, maxSectorCells = 4e6 }) {
    this.w = width; this.h = height; this.cells = width * height;
    // Tile 1 is the map edge: solid and never drawn, so the ground simply ends there.
    this.defs = [{ name: 'floor', color: '#ffffff', ...floor }, { name: '#edge', solid: true }, ...tiles.map(t => ({ ...t }))];
    for (const p of prefabs) if (!this.defs.some(d => d.name === p.name)) this.defs.push({ name: p.name, color: p.color, solid: true, building: true });
    if (this.defs.length > 255) throw new Error('At most 253 tile kinds');
    this.ids = new Map(this.defs.map((d, i) => [d.name, i]));
    this.solid = Uint8Array.from(this.defs, d => (d.solid ? 1 : 0));
    // Routing cost and walking speed per tile kind. A street is cheap to cross and fast to walk on,
    // so every route bends towards streets without the steering code knowing about them.
    this.stepCost = Uint16Array.from(this.defs, d => Math.max(1, Math.round(STEP_COST * (d.walkCost ?? 1))));
    this.speedOf = Float32Array.from(this.defs, d => d.speed ?? 1);
    this.isStreet = Uint8Array.from(this.defs, d => (d.street ? 1 : 0));
    this.tiles = new Uint8Array(this.cells);
    /** Extra routing cost per cell, on top of its tile's (see setExtra): 4 = as bad as one more step. Routes go round where they can. */
    this.extra = new Uint8Array(this.cells);
    this.fill = fill == null ? 0 : this.id(fill);     // what the map is made of before anything is built or dug
    if (this.defs[this.fill].building || this.fill === 1) throw new Error('fill must be a plain tile');
    if (this.fill) this.tiles.fill(this.fill);

    this.prefabs = prefabs.map(p => {
      const q = { w: 1, h: 1, beds: 0, jobs: 0, capacity: 0, ...p, tile: this.ids.get(p.name) };
      q.doorAt = this._doorCell(q, p.door);                  // entry cell for rotation 0, relative to the footprint's corner
      q.exitAt = p.exit ? this._doorCell(q, p.exit) : q.doorAt;
      return q;
    });
    this.buildings = [];                               // by id; null once demolished (ids are never reused)
    this.bldAt = new Int32Array(this.cells).fill(-1);  // building id covering each cell, or -1
    this.entryAt = new Int32Array(this.cells).fill(-1);// building id whose entry is this cell, or -1
    this.reserved = new Uint8Array(this.cells);        // how many entries/exits use this cell: it must stay walkable

    this.fields = new Map();                           // tile id -> full-map field to the nearest OPEN entry of that kind
    this.streetField = this.isStreet.some(v => v) ? new Uint16Array(this.cells).fill(INF) : null;
    /** By name: { data, seeds }. A game's own fields: `seeds(push)` names the cells each one leads to. */
    this.custom = new Map();
    /** By building id: { x0, y0, w, h, data, full, maxed, stale, used } or null. `data[(y - y0) * w + (x - x0)]`. */
    this.bwin = [];
    this.windowCells = 0; this.maxWindowCells = maxWindowCells;
    /** By sector key: { data, ready, stale, queued, used }. Full-map field to the nearest entry of any home/workplace in that sector. */
    this.sectors = new Map();
    this.sectorsWide = Math.ceil(width / SECTOR);
    this.maxSectors = Math.max(2, Math.min(64, Math.floor(maxSectorCells / this.cells)));

    /**
     * Links: from a cell with one, a person can step straight to another cell far away (see addLink). Per cell: the cell
     * its link leads to (-1: none), the ticks the step takes, and what it costs a route.
     */
    this.linkTo = new Int32Array(this.cells).fill(-1);
    this.linkTicks = new Uint16Array(this.cells);
    this.linkCost = new Uint16Array(this.cells);
    this.links = 0;                                    // how many there are
    this._linkFrom = new Map();                        // cell -> the cells whose link leads to it

    this.version = 0;                                  // bumps on every edit; sim and renderer watch this
    this.fieldsDirty = true;                           // true while background field work is outstanding
    this.clock = 0;                                    // advanced by the simulation; used to age windows
    this._restart = true;                              // shared fields must be recomputed from the start
    this._dirtyRects = []; this._allDirty = false;     // where walkability changed: windows overlapping these are stale
    this._jobs = []; this._job = null;                 // resumable full-map floods, one at a time: 'k<tile>', 'street', 's<sector>'
    this._scratch = null;                              // the field being computed; copied over the live one when done
    this._queue = new Int32Array(this.cells); this._inQueue = new Uint8Array(this.cells);
    this._head = 0; this._tail = 0; this._size = 0;
    this._requests = new Map();                        // building id -> { x0, y0, x1, y1, grow }: windows agents are waiting for
    this._refresh = [];                                // building ids whose window is stale
    this._wq = null; this._win = null; this._wtmp = null;   // queue, flags and scratch for window floods (allocated on first use)
    this._lastEvict = -1000;

    // The edge is always solid: movement code relies on agents never standing on an edge cell.
    for (let x = 0; x < width; x++) { this.tiles[x] = 1; this.tiles[(height - 1) * width + x] = 1; }
    for (let y = 0; y < height; y++) { this.tiles[y * width] = 1; this.tiles[y * width + width - 1] = 1; }
  }

  // A door is given as a side and a position along it: 'S', or { side: 'S', at: 1 }.
  // Returned as the cell just outside that side, relative to the footprint's corner (rotation 0).
  _doorCell(p, door) {
    const side = SIDES[typeof door === 'string' ? door : door?.side ?? 'S'];
    if (side === undefined) throw new Error(`Prefab "${p.name}": door side must be N, E, S or W`);
    const len = side === 0 || side === 2 ? p.w : p.h;
    const at = Math.max(0, Math.min(len - 1, (typeof door === 'object' && door?.at !== undefined) ? door.at : len >> 1));
    return side === 0 ? [at, -1] : side === 2 ? [at, p.h] : side === 3 ? [-1, at] : [p.w, at];
  }

  /** Tile id from a name (ids pass through). */
  id(tile) {
    if (typeof tile === 'number') return tile;
    const i = this.ids.get(tile);
    if (i === undefined) throw new Error(`Unknown tile "${tile}"`);
    return i;
  }
  prefab(name) {
    const p = this.prefabs.find(x => x.name === name);
    if (!p) throw new Error(`Unknown prefab "${name}"`);
    return p;
  }
  inside(x, y) { return x >= 1 && y >= 1 && x < this.w - 1 && y < this.h - 1; }
  get(x, y) { return this.tiles[y * this.w + x]; }
  sectorOf(x, y) { return ((y / SECTOR) | 0) * this.sectorsWide + ((x / SECTOR) | 0); }

  _edited(from, to, x0, y0, x1, y1) {
    // Everyone's routes change only where a cell's walkability or walking cost changed.
    if (this.solid[from] !== this.solid[to] || this.stepCost[from] !== this.stepCost[to]) {
      if (this._dirtyRects.length < 64) this._dirtyRects.push([x0 - 1, y0 - 1, x1 + 1, y1 + 1]); else this._allDirty = true;
    }
    this.version++; this.kindsChanged();
  }
  /** Which cells count as an open destination changed (an edit, or a building opened/closed): recompute the shared fields. */
  kindsChanged() { this._restart = true; this.fieldsDirty = true; }

  /** Set one plain tile. Edge cells, building cells, and door cells (for solid tiles) cannot be changed. Returns true if the map changed. */
  set(x, y, tile) {
    if (!this.inside(x, y)) return false;
    const c = y * this.w + x, id = this.id(tile), old = this.tiles[c];
    if (old === id || this.bldAt[c] >= 0 || (this.solid[id] && this.reserved[c])) return false;
    this.tiles[c] = id; this._edited(old, id, x, y, x, y);
    return true;
  }
  /**
   * Replace every plain tile at once (loading a saved map). `tiles` is one id per cell; cells under a building keep
   * that building, and the edge stays the edge. Routes are recomputed from scratch.
   */
  loadTiles(tiles) {
    const W = this.w, H = this.h;
    for (let c = 0; c < this.cells; c++) if (this.bldAt[c] < 0) this.tiles[c] = tiles[c];
    for (let x = 0; x < W; x++) { this.tiles[x] = 1; this.tiles[(H - 1) * W + x] = 1; }
    for (let y = 0; y < H; y++) { this.tiles[y * W] = 1; this.tiles[y * W + W - 1] = 1; }
    this._allDirty = true; this.version++; this.kindsChanged();
  }
  /**
   * Make one cell dearer to route through, whatever its tile (a place to avoid: danger, a mark the player drew), or
   * 0 to make it ordinary again. It stays walkable: a route still crosses it when there is no other way.
   */
  setExtra(x, y, cost) {
    if (!this.inside(x, y)) return false;
    const c = y * this.w + x, v = Math.max(0, Math.min(255, cost | 0));
    if (this.extra[c] === v) return false;
    this.extra[c] = v;
    if (this._dirtyRects.length < 64) this._dirtyRects.push([x - 1, y - 1, x + 1, y + 1]); else this._allDirty = true;
    this.kindsChanged();
    return true;
  }
  /**
   * Join cell (x0, y0) to cell (x1, y1), one way: someone standing on the first can step to the second, however far it is,
   * taking `ticks`. Routes are found through links: `cost` is what the step counts for in a route (default: as much as
   * walking for that long at an ordinary pace, 4 a cell). A cell has at most one link out; add a second one the other way
   * for a link that works both ways. Shared fields, a game's own fields and sector fields follow links; a building's own
   * window does not (it is a small rectangle around the door). Returns true if the link was made.
   */
  addLink(x0, y0, x1, y1, { ticks = 30, cost } = {}) {
    if (!this.inside(x0, y0) || !this.inside(x1, y1)) return false;
    const a = y0 * this.w + x0, b = y1 * this.w + x1;
    if (a === b || this.linkTo[a] >= 0) return false;
    this.linkTo[a] = b; this.linkTicks[a] = Math.max(1, Math.min(65535, ticks | 0));
    this.linkCost[a] = Math.max(1, Math.min(60000, Math.round(cost ?? ticks * 0.6)));
    const from = this._linkFrom.get(b);
    if (from) from.push(a); else this._linkFrom.set(b, [a]);
    this.links++; this._allDirty = true; this.version++; this.kindsChanged();
    return true;
  }
  /** Take away the link out of cell (x, y). Returns true if there was one. */
  removeLink(x, y) {
    if (!this.inside(x, y)) return false;
    const a = y * this.w + x, b = this.linkTo[a];
    if (b < 0) return false;
    this.linkTo[a] = -1;
    const from = this._linkFrom.get(b).filter(c => c !== a);
    if (from.length) this._linkFrom.set(b, from); else this._linkFrom.delete(b);
    this.links--; this._allDirty = true; this.version++; this.kindsChanged();
    return true;
  }

  rect(x0, y0, w, h, tile) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, tile);
  }

  /** Cells of a straight line between two cells, each touching the next along an edge (no diagonal gaps). */
  lineCells(x0, y0, x1, y1) {
    const out = [[x0, y0]];
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x1 > x0 ? 1 : -1, sy = y1 > y0 ? 1 : -1;
    let x = x0, y = y0, ix = 0, iy = 0;
    while (ix < dx || iy < dy) {
      if ((0.5 + ix) / dx < (0.5 + iy) / dy) { x += sx; ix++; } else { y += sy; iy++; }
      out.push([x, y]);
    }
    return out;
  }
  /** Lay a plain tile along a straight line, on untouched ground only (buildings and the edge are skipped). Returns cells changed. */
  line(tile, x0, y0, x1, y1) {
    let n = 0;
    for (const [x, y] of this.lineCells(x0, y0, x1, y1))
      if (this.inside(x, y) && this.tiles[y * this.w + x] === this.fill && this.set(x, y, tile)) n++;
    return n;
  }

  /**
   * Where a prefab would sit with its corner at (x, y) and the given rotation (0-3, quarter turns clockwise):
   * footprint size, entry cell (ex, ey) and exit cell (xx, xy).
   */
  layout(name, x, y, rot, size) {
    const p = this.prefab(name);
    let w = p.w, h = p.h, [ex, ey] = p.doorAt, [xx, xy] = p.exitAt;
    if (size && p.resize) {                            // a dragged footprint: `size` is what it covers once turned
      const base = rot & 1 ? { name, w: size[1], h: size[0] } : { name, w: size[0], h: size[1] };
      w = base.w; h = base.h;
      [ex, ey] = this._doorCell(base, p.door); [xx, xy] = p.exit ? this._doorCell(base, p.exit) : [ex, ey];
    }
    for (let k = 0; k < rot; k++) {                    // quarter turn: (i, j) in a w×h footprint → (h - 1 - j, i) in h×w
      [ex, ey] = [h - 1 - ey, ex]; [xx, xy] = [h - 1 - xy, xx];
      [w, h] = [h, w];
    }
    return { rot, w, h, ex: x + ex, ey: y + ey, xx: x + xx, xy: y + xy };
  }
  _fits(L, x, y) {
    for (let j = y; j < y + L.h; j++) for (let i = x; i < x + L.w; i++) {
      if (!this.inside(i, j)) return false;
      const c = j * this.w + i;
      if (this.tiles[c] !== this.fill || this.reserved[c]) return false;   // untouched ground only, and never on someone's doorstep
    }
    for (const [i, j] of [[L.ex, L.ey], [L.xx, L.xy]]) {               // the door cells must be open ground
      if (!this.inside(i, j) || this.solid[this.tiles[j * this.w + i]]) return false;
    }
    return this.entryAt[L.ey * this.w + L.ex] < 0;                     // one building per entry cell
  }
  /**
   * Pick a rotation for a prefab at (x, y): the one that fits and whose door is closest to a street
   * (else the first that fits). Returns the layout, or null if no rotation fits.
   */
  orient(name, x, y, rot = 'auto', size) {
    if (rot !== 'auto') { const L = this.layout(name, x, y, rot & 3, size); return this._fits(L, x, y) ? L : null; }
    let best = null, bd = Infinity;
    for (let r = 0; r < 4; r++) {
      const L = this.layout(name, x, y, r, size);
      if (!this._fits(L, x, y)) continue;
      let d = 1e6 + r;                                                   // no street nearby: keep the first rotation that fits
      for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++) {
        const cx = L.ex + i, cy = L.ey + j;
        if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h || !this.isStreet[this.tiles[cy * this.w + cx]]) continue;
        const m = Math.abs(i) + Math.abs(j) + r * 0.01;
        if (m < d) d = m;
      }
      if (d < bd) { bd = d; best = L; }
    }
    return best;
  }
  /** True if the prefab fits with its corner at (x, y) (in the given rotation, or in any). */
  canPlace(name, x, y, rot = 'auto', size) { return this.orient(name, x, y, rot, size) !== null; }
  /**
   * The footprint a resizable prefab takes for a dragged w × h: cut down to its `max`, or null if smaller than its `min`
   * (or the prefab cannot be resized).
   */
  sizeFor(name, w, h) {
    const r = this.prefab(name).resize;
    if (!r || w < (r.min?.[0] ?? 1) || h < (r.min?.[1] ?? 1)) return null;
    return [Math.min(w, r.max?.[0] ?? w), Math.min(h, r.max?.[1] ?? h)];
  }

  /** Place a building with its corner at (x, y). rot: 0-3, or 'auto' to face the nearest street. Returns it, or null if it does not fit. */
  place(name, x, y, rot = 'auto', size) {
    const L = this.orient(name, x, y, rot, size);
    if (!L) return null;
    const p = this.prefab(name), id = this.buildings.length, W = this.w;
    const area = L.w * L.h, per = size && p.resize ? p.perCell : null;   // a dragged building's beds and jobs follow its area
    const beds = per?.beds ? Math.round(area * per.beds) : p.beds, jobs = per?.jobs ? Math.max(1, Math.round(area * per.jobs)) : p.jobs;
    const b = {
      id, name: p.name, prefab: p, tile: p.tile, x, y, w: L.w, h: L.h, rot: L.rot, cx: x + L.w / 2, cy: y + L.h / 2,
      ex: L.ex, ey: L.ey, xx: L.xx, xy: L.xy,   // entry and exit cells
      sector: this.sectorOf(L.ex, L.ey),
      beds, jobs, area,
      residents: 0, workers: 0,                 // assigned to it (by the simulation's assignment pass)
      open: jobs === 0,                         // buildings with jobs open once someone works there
      staff: jobs === 0 ? 1 : 0,                // workers / jobs
      cap: 0,                                   // customers it can hold right now (capacity × staff)
      inside: 0, customers: 0,                  // agents inside right now, and how many of them are customers
      load: 0,                                  // smoothed fullness 0..1, for crowd animations
      blocked: false,                           // closed by a game module (out of stock, on strike, burnt down…)
    };
    for (let j = y; j < y + L.h; j++) for (let i = x; i < x + L.w; i++) { const c = j * W + i; this.tiles[c] = p.tile; this.bldAt[c] = id; }
    this.entryAt[L.ey * W + L.ex] = id;
    this.reserved[L.ey * W + L.ex]++; this.reserved[L.xy * W + L.xx]++;
    this.buildings.push(b);
    this.bwin.push(null);
    this._edited(this.fill, p.tile, x, y, x + L.w - 1, y + L.h - 1);
    return b;
  }

  /** Remove the building (or plain tile) on this cell. Returns true if something was removed. */
  demolish(x, y) {
    if (!this.inside(x, y)) return false;
    const W = this.w, c = y * W + x, id = this.bldAt[c], old = this.tiles[c], fill = this.fill;
    if (id >= 0) {
      const b = this.buildings[id];
      for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) { const k = j * W + i; this.tiles[k] = fill; this.bldAt[k] = -1; }
      this.entryAt[b.ey * W + b.ex] = -1;
      this.reserved[b.ey * W + b.ex]--; this.reserved[b.xy * W + b.xx]--;
      this.buildings[id] = null; this._dropWindow(id); this._requests.delete(id);
      this._edited(old, fill, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1);
    } else if (old !== fill && !(this.solid[fill] && this.reserved[c])) { this.tiles[c] = fill; this._edited(old, fill, x, y, x, y); }   // a doorstep cannot be filled in
    else return false;
    return true;
  }

  /** Close a building for the game's own reasons, or reopen it. It stops being a destination; people inside finish what they are doing. */
  setBlocked(b, on, why = 'rule') {
    if (!b) return;
    // Several rules may each have a reason (out of stock, on fire…): it reopens when the last one is gone.
    const reasons = (b.blockedBy ??= {});
    if (on) reasons[why] = true; else delete reasons[why];
    const now = Object.keys(reasons).length > 0;
    if (b.blocked === now) return;
    b.blocked = now; this.version++; this.kindsChanged();
  }

  /** Ask for a full-map field towards the nearest open entry of this tile kind. Returns the live array. */
  trackField(tile) {
    const id = this.id(tile);
    if (!this.fields.has(id)) { this.fields.set(id, new Uint16Array(this.cells).fill(INF)); this.kindsChanged(); }
    return this.fields.get(id);
  }

  /** The live array of a game's own field (made empty if it does not exist yet). An action goes there with `at: '#name'`. */
  customField(name) {
    let f = this.custom.get(name);
    if (!f) { f = { data: new Uint16Array(this.cells).fill(INF), seeds: null }; this.custom.set(name, f); }
    return f.data;
  }
  /**
   * A field of the game's own: `seeds(push)` is called whenever the field is recomputed and calls `push(cell)` for every
   * cell the field leads to (solid cells are skipped: nobody can stand there). Call fieldChanged(name) when the set of
   * cells changed; edits to the map recompute it anyway. Returns the live array.
   */
  addField(name, seeds) { const d = this.customField(name); this.custom.get(name).seeds = seeds; this.fieldChanged(name); return d; }
  /** The cells one of the game's own fields leads to have changed: recompute that field (and no other). */
  fieldChanged(name) {
    this.fieldsDirty = true;
    if (this._restart) return;                         // everything is about to be redone anyway
    const j = 'c' + name;
    if (this._job === j) this._job = null;             // being computed right now, from seeds that are out of date: start over
    if (!this._jobs.includes(j)) this._jobs.push(j);
  }

  /**
   * An agent at cell (x, y) needs the route to building `id` and its window does not cover that cell
   * (or shows it as unreachable: pass grow = true to widen the search). Cheap to call every tick.
   */
  requestWindow(id, x, y, grow = false) {
    const r = this._requests.get(id);
    if (r) { if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x; if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y; if (grow) r.grow = true; }
    else if (this.buildings[id]) { this._requests.set(id, { x0: x, y0: y, x1: x, y1: y, grow }); this.fieldsDirty = true; }
  }

  /** An agent far from its building needs the field for that building's sector. Cheap to call every tick. */
  requestSector(key) {
    const have = this.sectors.get(key);
    if (have) {                                       // exists: refresh it if an edit made it stale (once)
      if (have.stale && !have.queued) { have.queued = true; this._jobs.push('s' + key); this.fieldsDirty = true; }
      return;
    }
    if (this.sectors.size >= this.maxSectors) {        // over the cap: drop the one unused for longest
      let oldest = -1, t = Infinity;
      for (const [k, s] of this.sectors) if (s.used < t && this._job !== 's' + k) { t = s.used; oldest = k; }
      if (oldest < 0 || this.clock - t < 300) return;  // everything is in use: this agent walks straight for now
      this.sectors.delete(oldest);
      this._jobs = this._jobs.filter(j => j !== 's' + oldest);
    }
    this.sectors.set(key, { data: new Uint16Array(this.cells).fill(INF), ready: false, stale: false, queued: true, used: this.clock });
    this._jobs.push('s' + key); this.fieldsDirty = true;
  }

  /** True while work caused by an edit is outstanding (shared fields being recomputed, stale windows being redone). */
  get updating() { return this._restart || this._job !== null || this._jobs.length > 0 || this._refresh.length > 0 || this._dirtyRects.length > 0 || this._allDirty; }

  /** Bytes held by all distance fields. */
  fieldBytes() { return (this.fields.size + this.custom.size + (this.streetField ? 1 : 0) + this.sectors.size) * this.cells * 2 + this.windowCells * 2; }

  /** Do everything outstanding now. Blocks until all fields are current. */
  rebuildFields() { this.work(Infinity); }

  /**
   * Background field work, at most about `budgetMs` milliseconds of it. Call it regularly (createGame does, once per frame).
   * Returns true while more remains. Fields in use are only replaced by finished ones.
   */
  work(budgetMs) {
    if (!this.fieldsDirty) return false;
    const deadline = budgetMs === Infinity ? Infinity : now() + budgetMs;
    if (this._allDirty || this._dirtyRects.length) {    // walkability changed somewhere: windows overlapping it need redoing
      const rects = this._dirtyRects, all = this._allDirty;
      for (let id = 0; id < this.bwin.length; id++) {
        const w = this.bwin[id];
        if (!w || w.stale) continue;
        let hit = all;
        for (let k = 0; k < rects.length && !hit; k++) { const r = rects[k]; hit = r[0] < w.x0 + w.w && r[2] >= w.x0 && r[1] < w.y0 + w.h && r[3] >= w.y0; }
        if (hit) { w.stale = true; this._refresh.push(id); }
      }
      this._dirtyRects = []; this._allDirty = false;
    }
    if (this._restart) {
      // Every field is to be redone, but the ones already waiting keep their place in the queue and the rest join
      // behind them. A map that is edited again and again (running water, a crowd of diggers) then still gets every
      // field refreshed in turn, where starting the list afresh at each edit would only ever finish its first few.
      this._restart = false;
      const q = this._jobs, queued = new Set(q), add = j => { if (!queued.has(j)) { queued.add(j); q.push(j); } };
      if (this._job !== null && !queued.has(this._job)) { queued.add(this._job); q.unshift(this._job); }   // the one under way was reading the old map: it starts over, first
      this._job = null;
      for (const k of this.fields.keys()) add('k' + k);
      for (const name of this.custom.keys()) add('c' + name);
      if (this.streetField) add('street');
      // Sector fields are not redone here: each is marked stale and refreshed only when an agent next needs it.
      for (const [k, sec] of this.sectors) { if (sec.ready) { sec.stale = true; sec.queued = false; } else { sec.queued = true; add('s' + k); } }
    }
    // Windows agents are waiting for come first, but may only use half the budget so the shared fields keep moving.
    const half = budgetMs === Infinity ? Infinity : now() + budgetMs / 2;
    this._serveRequests(half);
    while (this._job !== null || this._jobs.length) {
      if (this._job === null) this._startJob(this._jobs.shift());
      if (this._job === null) continue;                              // that job's target no longer exists
      if (!this._floodSlice(this._scratch, deadline)) break;         // out of time, resume next call
      const j = this._job;                                            // finished: swap the new field in
      if (j === 'street') this.streetField.set(this._scratch);
      else if (j[0] === 'k') this.fields.get(+j.slice(1)).set(this._scratch);
      else if (j[0] === 'c') this.custom.get(j.slice(1)).data.set(this._scratch);
      else { const s = this.sectors.get(+j.slice(1)); if (s) { s.data.set(this._scratch); s.ready = true; s.stale = false; s.queued = false; } }
      this._job = null;
      if (now() > deadline) break;
    }
    this._serveRequests(deadline);
    while (this._refresh.length && now() <= deadline) {              // lowest priority: redo stale windows in place
      const id = this._refresh.pop(), w = this.bwin[id];
      if (w && w.stale) this._buildWindow(id, w.x0, w.y0, w.x0 + w.w - 1, w.y0 + w.h - 1);
    }
    this.fieldsDirty = this._job !== null || this._jobs.length > 0 || this._requests.size > 0 || this._refresh.length > 0 || this._restart;
    return this.fieldsDirty;
  }

  _startJob(j) {
    if (j[0] === 's' && j !== 'street' && !this.sectors.has(+j.slice(1))) return;
    if (!this._scratch) this._scratch = new Uint16Array(this.cells);
    const d = this._scratch, { tiles, bldAt, buildings, cells, isStreet, solid, w: W } = this;
    this._job = j;
    d.fill(INF); this._head = 0; this._tail = 0; this._size = 0; this._inQueue.fill(0);
    const seed = c => { if (d[c] === 0) return; d[c] = 0; this._queue[this._tail] = c; this._tail = (this._tail + 1) % cells; this._inQueue[c] = 1; this._size++; };
    if (j === 'street') { for (let c = 0; c < cells; c++) if (isStreet[tiles[c]]) seed(c); }
    else if (j[0] === 'c') { const f = this.custom.get(j.slice(1)); if (f.seeds) f.seeds(c => { if (!solid[tiles[c]]) seed(c); }); }
    else if (j[0] === 'k') {
      const id = +j.slice(1);
      if (this.defs[id].building) { for (const b of buildings) if (b && b.tile === id && b.open) seed(b.ey * W + b.ex); }   // open buildings' entries
      else for (let c = 0; c < cells; c++) if (tiles[c] === id && bldAt[c] < 0) seed(c);                                    // a plain tile kind
    } else {
      const key = +j.slice(1);
      for (const b of buildings) if (b && b.sector === key && (b.beds || b.jobs)) seed(b.ey * W + b.ex);
    }
  }

  // A step costs the average walking cost of the two cells it joins (ordinary ground: 4 straight, 6 diagonal),
  // so the field is travel effort, not just distance. Diagonals may not cut a solid corner.
  // A cell is re-queued whenever a cheaper route to it is found. Returns true when finished, false if it ran out of time.
  _floodSlice(d, deadline) {
    const { w: W, cells, tiles, solid, stepCost, extra, _queue: queue, _inQueue: inQueue } = this;
    const linkFrom = this.links > 0 ? this._linkFrom : null, linkCost = this.linkCost;
    const OFF = [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1];
    let head = this._head, tail = this._tail, size = this._size, pops = 0;
    while (size > 0) {
      if ((++pops & 4095) === 0 && now() > deadline) { this._head = head; this._tail = tail; this._size = size; return false; }
      const c = queue[head]; head = (head + 1) % cells; size--; inQueue[c] = 0;
      const here = d[c], costHere = stepCost[tiles[c]];
      for (let s = 0; s < 8; s++) {
        const off = OFF[s], nc = c + off;
        if (nc < 0 || nc >= cells) continue;
        const tn = tiles[nc];
        if (solid[tn]) continue;
        let step = (costHere + stepCost[tn]) >> 1;
        if (step < 1) step = 1;
        if (s >= 4) {
          const ox = (s === 4 || s === 6) ? -1 : 1, oy = s < 6 ? -W : W;
          if (solid[tiles[c + ox]] || solid[tiles[c + oy]]) continue;
          step = (step * 3 + 1) >> 1;
        }
        const nd = here + step + extra[nc];
        if (nd < d[nc]) {
          d[nc] = nd;
          if (!inQueue[nc]) { inQueue[nc] = 1; queue[tail] = nc; tail = (tail + 1) % cells; size++; }
        }
      }
      const into = linkFrom ? linkFrom.get(c) : undefined;   // cells whose link leads here are one step away, at the link's cost
      if (into) for (let k = 0; k < into.length; k++) {
        const nc = into[k];
        if (solid[tiles[nc]]) continue;
        const nd = here + linkCost[nc];
        if (nd < d[nc]) {
          d[nc] = nd;
          if (!inQueue[nc]) { inQueue[nc] = 1; queue[tail] = nc; tail = (tail + 1) % cells; size++; }
        }
      }
    }
    this._head = head; this._tail = tail; this._size = 0;
    return true;
  }

  _serveRequests(deadline) {
    for (const [id, r] of this._requests) {
      if (now() > deadline) return;
      this._requests.delete(id);
      const b = this.buildings[id];
      if (!b) continue;
      const w = this.bwin[id];
      let x0 = Math.min(b.ex, r.x0), y0 = Math.min(b.ey, r.y0), x1 = Math.max(b.ex, r.x1), y1 = Math.max(b.ey, r.y1);
      let margin = WINDOW_MARGIN;
      if (w) {
        x0 = Math.min(x0, w.x0); y0 = Math.min(y0, w.y0); x1 = Math.max(x1, w.x0 + w.w - 1); y1 = Math.max(y1, w.y0 + w.h - 1);
        if (r.grow) margin = Math.max(w.w, w.h);        // the route leaves the window: double it until it fits (up to its reach)
      }
      // Clip to the map and to the window's maximum reach, so one far-away agent cannot make a window (and its cost) huge.
      const lx0 = Math.max(0, b.ex - WINDOW_REACH), ly0 = Math.max(0, b.ey - WINDOW_REACH);
      const lx1 = Math.min(this.w - 1, b.ex + WINDOW_REACH), ly1 = Math.min(this.h - 1, b.ey + WINDOW_REACH);
      x0 = Math.max(lx0, x0 - margin); y0 = Math.max(ly0, y0 - margin); x1 = Math.min(lx1, x1 + margin); y1 = Math.min(ly1, y1 + margin);
      if (w && !w.stale && x0 === w.x0 && y0 === w.y0 && x1 === w.x0 + w.w - 1 && y1 === w.y0 + w.h - 1) { w.maxed = w.maxed || r.grow; continue; }   // nothing to add
      this._buildWindow(id, x0, y0, x1, y1);
      this.bwin[id].maxed = x0 === lx0 && y0 === ly0 && x1 === lx1 && y1 === ly1;
    }
  }

  _dropWindow(id) { const w = this.bwin[id]; if (w) { this.windowCells -= w.data.length; this.bwin[id] = null; } }

  // Flood from one building's entry cell, confined to the rectangle (x0, y0)-(x1, y1). Replaces the building's window when done.
  _buildWindow(id, x0, y0, x1, y1) {
    const b = this.buildings[id], { w: W, tiles, solid, stepCost, extra } = this;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, n = w * h;
    if (!this._wq || this._wq.length < n) { this._wq = new Int32Array(Math.min(this.cells, Math.max(n, 4096))); this._win = new Uint8Array(this._wq.length); }
    if (!this._wtmp || this._wtmp.length < n) this._wtmp = new Uint16Array(Math.max(n, 4096));
    const queue = this._wq, inQueue = this._win, data = this._wtmp;       // flood into a scratch buffer first
    data.fill(INF, 0, n);
    let head = 0, tail = 0, size = 0;
    { const lc = (b.ey - y0) * w + (b.ex - x0); data[lc] = 0; queue[tail] = lc; tail = (tail + 1) % n; inQueue[lc] = 1; size++; }
    while (size > 0) {
      const lc = queue[head]; head = (head + 1) % n; size--; inQueue[lc] = 0;
      const lx = lc % w, ly = (lc / w) | 0, gc = (y0 + ly) * W + x0 + lx;
      const here = data[lc], costHere = stepCost[tiles[gc]];
      for (let s = 0; s < 8; s++) {
        const ox = s === 0 || s === 4 || s === 6 ? -1 : s === 1 || s === 5 || s === 7 ? 1 : 0;
        const oy = s === 2 || s === 4 || s === 5 ? -1 : s === 3 || s === 6 || s === 7 ? 1 : 0;
        const nx = lx + ox, ny = ly + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const tn = tiles[gc + ox + oy * W];
        if (solid[tn]) continue;
        let step = (costHere + stepCost[tn]) >> 1;
        if (step < 1) step = 1;
        if (s >= 4) {
          if (solid[tiles[gc + ox]] || solid[tiles[gc + oy * W]]) continue;
          step = (step * 3 + 1) >> 1;
        }
        const nd = here + step + extra[gc + ox + oy * W], nl = ny * w + nx;
        if (nd < data[nl]) {
          data[nl] = nd;
          if (!inQueue[nl]) { inQueue[nl] = 1; queue[tail] = nl; tail = (tail + 1) % n; size++; }
        }
      }
    }
    const old = this.bwin[id];
    if (old && old.x0 === x0 && old.y0 === y0 && old.w === w && old.h === h) {   // same rectangle (a stale window redone): overwrite in place, no new memory
      old.data.set(data.subarray(0, n)); old.stale = false; old.used = this.clock;
      return;
    }
    this._dropWindow(id);
    this.bwin[id] = { x0, y0, w, h, data: data.slice(0, n), full: x0 === 0 && y0 === 0 && w === this.w && h === this.h, maxed: old ? old.maxed : false, stale: false, used: this.clock };
    this.windowCells += n;
    if (this.windowCells > this.maxWindowCells && this.clock - this._lastEvict > 120) { this._lastEvict = this.clock; this._evict(id); }
  }

  // Over the memory cap: drop the windows nobody has walked through for longest. They come back on demand.
  _evict(keep) {
    const ids = [];
    for (let id = 0; id < this.bwin.length; id++) if (this.bwin[id] && id !== keep) ids.push(id);
    ids.sort((a, b) => this.bwin[a].used - this.bwin[b].used);
    for (const id of ids) { if (this.windowCells <= this.maxWindowCells * 0.8) break; this._dropWindow(id); }
  }
}
