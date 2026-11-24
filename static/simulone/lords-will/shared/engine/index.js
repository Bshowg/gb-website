// Entry point: createGame(config) wires world + simulation + renderer + input + game loop.
// See README.md for the config reference.

import { World, INF } from '../../shared/engine/world.js';
import { Sim, DEFAULT_TUNING } from '../../shared/engine/sim.js';
import { Renderer } from '../../shared/engine/renderer.js';
import { FlatRenderer } from '../../shared/engine/flat.js';
import { flatPlaceholderSprites } from '../../shared/engine/placeholder-flat.js';
import { attachInput } from '../../shared/engine/input.js';
import { placeholderSprites } from '../../shared/engine/placeholder.js';

export { World, Sim, Renderer, FlatRenderer, attachInput, placeholderSprites, flatPlaceholderSprites, DEFAULT_TUNING, INF };

/**
 * @param {object} cfg
 * @param {HTMLCanvasElement} cfg.canvas
 * @param {{width:number, height:number, border?:string, build?:(world:World)=>void}} cfg.map
 * @param {Array<object>} cfg.tiles     tile kinds (see README)
 * @param {Array<object>} cfg.needs
 * @param {Array<object>} cfg.actions
 * @param {Array<object>} [cfg.types]
 * @param {object} [cfg.sprites]        real art; omit to get generated placeholders
 * @param {number} [cfg.agents=1000]
 */
export function createGame(cfg) {
  const world = new World({ width: cfg.map.width, height: cfg.map.height, tiles: cfg.tiles, prefabs: cfg.prefabs, floor: cfg.floor, fill: cfg.map.fill,
                            maxWindowCells: cfg.maxWindowCells, maxSectorCells: cfg.maxSectorCells });
  // Buildings are placed by the cell under the pointer, which becomes the middle of the footprint.
  // A dragged footprint (`size`) is given by its corner instead.
  const corner = (prefab, x, y, rot, size) => {
    if (size) return [x, y];
    const p = world.prefab(prefab), turned = rot !== 'auto' && (rot & 1);
    return [x - ((turned ? p.h : p.w) >> 1), y - ((turned ? p.w : p.h) >> 1)];
  };
  const sim = new Sim(world, cfg);
  if (cfg.map.build) cfg.map.build(world);
  sim.setCount(cfg.agents ?? 1000);
  sim.assign(); world.work(Infinity);          // start with homes, jobs and the shared fields in place
  // From here on route work is done a little per frame, in the background: the simulation keeps using
  // the fields it has until newer ones are finished, so edits never freeze the game.
  sim.fieldBudgetMs = 0;
  const fieldBudget = cfg.fieldBudgetMs ?? 2;

  // The picture: isometric by default, `view: { projection: 'flat' }` for a straight-on grid (side cut or top-down),
  // or a class of your own in `renderer` (see view.js for what it must provide).
  const ViewClass = cfg.renderer ?? (cfg.view?.projection === 'flat' ? FlatRenderer : Renderer);
  const renderer = new ViewClass(cfg.canvas, world, sim, cfg.view ?? {});
  const makePlaceholders = () => renderer.placeholders();
  renderer.setSprites(cfg.sprites ?? makePlaceholders());

  const stats = { simMs: 0, renderMs: 0, frameMs: 16.7, fps: 60 };
  // Optional frame-by-frame record of the real loop: what each frame spent on routes, simulation, drawing and the
  // onFrame callback, and how long it then stayed on screen. Averages hide stalls; this shows which frames were slow and why.
  const FRAME_LOG = 2048;
  const flog = { n: 0, interval: new Float32Array(FRAME_LOG), routes: new Float32Array(FRAME_LOG), sim: new Float32Array(FRAME_LOG),
                 draw: new Float32Array(FRAME_LOG), ui: new Float32Array(FRAME_LOG) };
  const ema = (k, v) => { stats[k] += (v - stats[k]) * 0.05; };
  let running = false, raf = 0, last = 0, owed = 0;   // owed = simulation ticks due but not yet run (a fraction, between frames)

  const game = {
    world, sim, renderer, camera: renderer.camera, stats,
    /**
     * How many simulation ticks make one second of real time at speed 1. The simulation runs at this rate whatever the
     * display's refresh rate, so the game plays the same on a 60 Hz and a 120 Hz screen. Drawing happens every frame and
     * slides agents smoothly between ticks.
     */
    ticksPerSecond: cfg.ticksPerSecond ?? 60,
    /** Time multiplier: 1 = normal, 2 = double speed, 0 = paused (drawing continues). */
    speed: 1,
    /** At most this many ticks are run in one frame; if the device cannot keep up, the game slows down instead of freezing. */
    maxTicksPerFrame: cfg.maxTicksPerFrame ?? 32,
    /** null = drag pans the camera. A function (cellX, cellY, phase) => void is called instead; phase is 'down', 'drag', 'up' or 'cancel'. */
    tool: null,
    /** Set true to record every frame into `frameLog` (up to 2048 frames; set frameLog.n = 0 to start over). */
    logFrames: false,
    /** { n, interval, routes, sim, draw, ui }: per-frame milliseconds. interval[k] is how long frame k lasted; the last entry's is not known yet. */
    frameLog: flog,
    /**
     * Called when the player taps the map while no tool is active, with what is there (see `pick`) and the canvas pixel.
     */
    onTap: cfg.onTap ?? null,
    /**
     * What is under a canvas pixel: { person: i } for the nearest person within `reach` cells (people out in the open only),
     * else { building } if a building covers the cell, else { cell: [x, y] }. Always carries `cell`.
     */
    pick(sx, sy, reach = 1.1) {
      const [gx, gy] = renderer.screenToGrid(sx, sy), lift = renderer.figureLift, cell = [Math.floor(gx), Math.floor(gy)];
      let best = -1, bd = reach * reach;
      for (let i = 0; i < sim.count; i++) {
        if (sim.inside[i] >= 0) continue;
        const dx = sim.px[i] - lift - gx, dy = sim.py[i] - lift - gy, d = dx * dx + dy * dy;   // aim at the figure's middle, not its feet
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) return { person: best, cell };
      const id = world.inside(cell[0], cell[1]) ? world.bldAt[cell[1] * world.w + cell[0]] : -1;
      return id >= 0 ? { building: world.buildings[id], cell } : { cell };
    },
    /** Called once per rendered frame with the game, for UI updates. */
    onFrame: cfg.onFrame ?? null,

    /** True between beginBuild() and endBuild(): the simulation is frozen while the map is edited. */
    buildMode: false,
    /** Pause the simulation for building. Edits show at once; homes, jobs and routes are updated after endBuild(). */
    beginBuild() { game.buildMode = true; },
    /**
     * Leave build mode. Homes and jobs are reassigned at once (returns the ms that took); routes are then
     * recomputed in the background while the game runs on the old ones. Watch `game.routesBusy` to know when they are done.
     */
    endBuild() {
      const t = performance.now();
      game.withdraw(); game.preview = [];
      sim.refresh();
      game.buildMode = false;
      return performance.now() - t;
    },
    /**
     * Placing in two steps, for touch screens: `offer` a prefab and it is held over the map as a ghost (its image, on
     * marked cells) without being built. The player drags the ghost, or taps where it should go; any other drag pans
     * the map. `accept` builds it there, `turn` turns it, `withdraw` puts it away. While something is offered it is
     * `game.offered`: { prefab, x, y, rot, layout, ok, why }: `ok` says whether accept would build, and `why` is
     * 'build' (canBuild refused: `reason` has its answer), 'space' (it does not fit there) or the string `check` gave.
     * @param {string} prefab
     * @param {object} [o]
     * @param {number|'auto'} [o.rot='auto']
     * @param {[number, number]} [o.at]          cell to start on (default: the middle of the screen)
     * @param {(prefab, cornerX, cornerY, rot, layout) => true|string} [o.check]  the game's own rules for a spot
     * @param {(offered) => void} [o.onChange]   called whenever the ghost moves, turns or changes its answer
     */
    offered: null,
    offer(prefab, o = {}) {
      const p = world.prefab(prefab);
      const [mx, my] = o.at ?? renderer.screenToCell(cfg.canvas.width / 2, cfg.canvas.height / 2);
      const g = game.offered = { prefab, x: mx, y: my, rot: o.rot ?? 'auto', layout: null, ok: false, why: '', reason: null, check: o.check, onChange: o.onChange };
      let grab = null;
      const judge = () => {
        const [cx, cy] = corner(prefab, g.x, g.y, g.rot), L = world.orient(prefab, cx, cy, g.rot), can = game.canBuild(prefab);
        g.layout = L; g.reason = null;
        if (can !== true) { g.ok = false; g.why = 'build'; g.reason = can; }
        else if (!L) { g.ok = false; g.why = 'space'; }
        else { const c = g.check ? g.check(prefab, cx, cy, L.rot, L) : true; g.ok = c === true; g.why = c === true ? '' : c; }
        if (L) { renderer.preview = game.footprint(prefab, g.x, g.y, g.rot); renderer.ghost = g.ok ? { tile: p.tile, x: cx, y: cy, w: L.w, h: L.h, rot: L.rot } : null; }
        else {                                       // it does not fit: show the ground it asks for
          const turned = g.rot !== 'auto' && (g.rot & 1), w = turned ? p.h : p.w, h = turned ? p.w : p.h, cells = [];
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells.push([cx + i, cy + j]);
          renderer.preview = cells; renderer.ghost = null;
        }
        renderer.previewBad = !g.ok;
        if (g.onChange) g.onChange(g);
      };
      g.judge = judge;
      game.tool = (x, y, phase) => {
        if (phase === 'down') {                      // a touch on the ghost (or right beside it) takes hold of it; any other is the map's
          const L = g.layout, [cx, cy] = corner(prefab, g.x, g.y, g.rot), w = L ? L.w : p.w, h = L ? L.h : p.h;
          if (x < cx - 1 || y < cy - 1 || x > cx + w || y > cy + h) return false;
          grab = [x - g.x, y - g.y]; return;
        }
        if (phase === 'tap') { g.x = x; g.y = y; judge(); return; }
        if (phase === 'drag' && grab) { const nx = x - grab[0], ny = y - grab[1]; if (nx !== g.x || ny !== g.y) { g.x = nx; g.y = ny; judge(); } }
        if (phase === 'up' || phase === 'cancel') grab = null;
      };
      judge();
      return g;
    },
    /** Turn what is offered a quarter turn: auto, then each of the four ways. */
    turn() { const g = game.offered; if (!g) return; const R = ['auto', 0, 1, 2, 3]; g.rot = R[(R.indexOf(g.rot) + 1) % R.length]; g.judge(); },
    /** Build what is offered where it stands. Returns the building, or null if it may not be built there. It stays offered, for the next one. */
    accept() {
      const g = game.offered;
      if (!g) return null;
      g.judge();
      const b = g.ok ? game.place(g.prefab, g.x, g.y, g.layout.rot) : null;
      g.judge();
      return b;
    },
    /** Put away what is offered. */
    withdraw() { if (!game.offered) return; game.offered = null; game.tool = null; renderer.preview = []; renderer.ghost = null; renderer.previewBad = false; },
    /** Cells [[x, y], …] to outline on the ground (build previews). */
    get preview() { return renderer.preview; },
    set preview(cells) { renderer.preview = cells; },
    /** Advance the simulation n ticks without drawing. */
    step(n = 1) { for (let k = 0; k < n; k++) { world.work(fieldBudget); sim.step(); } },
    /** True while routes are still being brought up to date after an edit. */
    get routesBusy() { return world.updating; },
    /** Average milliseconds per simulation tick over `ticks` ticks. */
    bench(ticks = 500) {
      const t = performance.now(); game.step(ticks);
      return (performance.now() - t) / ticks;
    },
    setCount(n) { sim.setCount(n); },
    /**
     * Place a prefab with its footprint centred on the cell. rot is 0-3 (quarter turns), or 'auto' to turn the door
     * towards the nearest street. Returns the building, or null if it does not fit.
     * For a prefab with `resize`, pass `size` [w, h] (see world.sizeFor): (x, y) is then the footprint's corner.
     */
    place(prefab, x, y, rot = 'auto', size) {
      if (game.canBuild(prefab) !== true) return null;
      const [cx, cy] = corner(prefab, x, y, rot, size), b = world.place(prefab, cx, cy, rot, size);
      if (b && sim.onPlace) sim.onPlace(b, sim);
      return b;
    },
    canPlace(prefab, x, y, rot = 'auto', size) { const [cx, cy] = corner(prefab, x, y, rot, size); return world.canPlace(prefab, cx, cy, rot, size); },
    /**
     * May the player build this prefab at all, whatever the spot? true, or what a module's `canBuild` answered:
     * false, or a string saying why not (cannot be paid for, not unlocked yet). `place` refuses when this is not true.
     */
    canBuild(prefab) { return sim.canBuild ? sim.canBuild(prefab, sim) : true; },
    /** Remove the building or plain tile on the cell. */
    demolish(x, y) {
      const id = world.inside(x, y) ? world.bldAt[y * world.w + x] : -1, b = id >= 0 ? world.buildings[id] : null;
      const done = world.demolish(x, y);
      if (done && sim.onDemolish) sim.onDemolish(b, sim);
      return done;
    },
    /** Lay a plain tile (a street) along a straight line between two cells, on empty floor only. Returns cells changed. */
    line(tile, x0, y0, x1, y1) {
      const n = world.line(tile, x0, y0, x1, y1);
      if (n && sim.onLine) sim.onLine(tile, n, sim);
      return n;
    },
    /** Cells a prefab would take if placed centred on the cell: its footprint plus its entry and exit cells (for previews). */
    footprint(prefab, x, y, rot = 'auto', size) {
      const [cx, cy] = corner(prefab, x, y, rot, size), L = world.orient(prefab, cx, cy, rot, size), out = [];
      if (!L) return out;                          // does not fit: nothing to show
      for (let j = 0; j < L.h; j++) for (let i = 0; i < L.w; i++) out.push([cx + i, cy + j]);
      out.push([L.ex, L.ey]);                      // the doorstep
      if (L.xx !== L.ex || L.xy !== L.ey) out.push([L.xx, L.xy]);
      return out;
    },
    /** Change one plain map cell (walls and other non-building tiles). */
    paint(x, y, tile) { return world.set(x, y, tile); },
    /** Change the drawing resolution, in pixels, when the canvas's place on the page changes size. */
    resize(w, h) { renderer.resize(w, h); },
    /** Swap the sprite sheet (same shape as cfg.sprites). Call with no argument to regenerate placeholders. */
    setSprites(s) { renderer.setSprites(s ?? makePlaceholders()); },
    start() {
      if (running) return;
      running = true; last = performance.now();
      const frame = now => {
        if (!running) return;
        const log = game.logFrames ? flog : null;
        if (log && log.n > 0 && log.n <= FRAME_LOG) log.interval[log.n - 1] = now - last;   // how long the previous frame lasted on screen
        const dt = Math.min(100, now - last);                      // a long stall is not replayed as a burst of ticks
        ema('frameMs', now - last); last = now; stats.fps = 1000 / stats.frameMs;
        const t0 = performance.now();
        if (!game.buildMode) world.work(fieldBudget);
        const t1 = performance.now();
        const live = !game.buildMode && game.speed > 0;
        if (live) {                                               // fixed timestep: real time decides how many ticks are due
          owed += dt / 1000 * game.ticksPerSecond * game.speed;
          let n = 0;
          while (owed >= 1 && n < game.maxTicksPerFrame) { sim.step(); owed -= 1; n++; }
          if (owed >= 1) owed = 0;                                // could not keep up: drop the backlog
        }
        const t2 = performance.now();
        renderer.render(live ? owed : 1);                         // `owed` is how far we are into the next tick
        const t3 = performance.now();
        if (game.onFrame) game.onFrame(game);
        const t4 = performance.now();
        if (game.speed > 0 && !game.buildMode) ema('simMs', t2 - t0);
        ema('renderMs', t3 - t2);
        if (log && log.n < FRAME_LOG) {
          const k = log.n++;
          log.routes[k] = t1 - t0; log.sim[k] = t2 - t1; log.draw[k] = t3 - t2; log.ui[k] = t4 - t3; log.interval[k] = 0;
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    /** Stop the loop, remove input handlers and free GPU resources. Do this before creating another game on the same canvas. */
    destroy() { game.stop(); detach(); renderer.dispose(); },
  };
  const detach = attachInput(cfg.canvas, renderer, () => game.tool, (sx, sy) => { if (game.onTap) game.onTap(game.pick(sx, sy), sx, sy); });
  if (cfg.autostart !== false) game.start();
  return game;
}
