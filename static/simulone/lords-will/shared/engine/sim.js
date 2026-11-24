// Agents, needs, action matrices, homes and jobs, and free movement. No DOM: runs headless too.
//
// Every tick, for every agent:   scores = features(agent) × matrix(agent type)   → pick the best action
//   features = [ need² for each need, distance to each action's destination, 1 (bias) ]
// The matrices are rebuilt from design values every few ticks, adjusted for the state of the world.
//
// Buildings are solid: an agent walks to a building's entry cell, goes inside (it is then parked and not
// drawn), and comes out on the exit cell when done. A full building makes arrivals queue at the door.
//
// Besides its type (which picks the matrix), each agent stores a home, a job, a speed and an age.
// What a game does with lives (health, death, births…) is its own business: see addColumn, add, remove,
// moveHome, setAge and the onSpawn / onTick / onGone hooks.
// Homes and jobs are building ids, handed out by assign() whenever the map or the population changes.

import { INF, STEP_COST, WINDOW_REACH } from '../../shared/engine/world.js';
import { ageTypes } from '../../shared/engine/ages.js';

export const DEFAULT_TUNING = {
  speed: 0.18,          // cells per tick for a type with speed 1
  speedSpread: 0.1,     // individual variation of walking speed (±10%)
  pace: 1,              // global multiplier on how fast all needs build up
  traitSpread: 0.3,     // individual variation of each need's growth (±30%)
  sticky: 0.1,          // score bonus for keeping the current action (stops flip-flopping)
  stayForNext: true,    // finishing inside a building, an agent picks its next action there and stays if it is done in the same building
  distWeight: -0.25,    // default matrix weight of "distance to destination" for its action
  distScale: 512,       // field distance that counts as "far" (4 per straight cell of ordinary ground)
  strollRange: 40,      // idle agents within this many cells of a street walk to it and stroll along it
  leash: 40,            // idle agents turn back when this many cells from their home (or job, or where they first appeared)
  idleBias: 0.12,       // default score of idle actions such as wander
  workBias: 0.25,       // default score of actions done at the agent's job (beats idling, loses to urgent needs)
  decideEvery: 16,      // each agent re-decides every N ticks (staggered)
  matrixEvery: 8,       // matrices are rebuilt every N ticks
  slotsPerTile: 3,      // capacity of one plain (non-building) destination tile
  crowding: 0.6,        // how much a full building kind lowers its own pull (0 = off)
  interruptAbove: 0.9,  // a need this high makes a person reconsider even in the middle of an action (above 1 = never)
  queuePatience: 200,   // ticks an agent waits outside a full building before giving up
  giveUpTicks: 600,     // after giving up, it does not try that action again for this long
  sepRadius: 0.7,       // personal space, in cells
  sepPush: 1.2,         // how hard neighbours push, relative to walking speed
  turn: 0.25,           // 1 = instant turns, lower = smoother curves
  maxNeighbours: 24,    // cap per agent so a dense crowd cannot blow up the cost
  commute: 48,          // agents only take a job within this many cells of home (of themselves, if homeless)
  cellRoom: 0,          // agents one cell holds at full walking speed (0 = no limit): above it, everyone on the cell slows down
  crowdSlow: 0.35,      // how much each agent over `cellRoom` slows the cell: speed ÷ (1 + crowdSlow × extra agents)
  retryTicks: 30,       // an agent refused a spot by a module's canUse does not try that action again for this long
  pointReach: 0.25,     // '@point' actions: how near, in cells, an agent must come to its point to be there (an action may set its own `reach`)
};

// Where an action happens.
const NONE = 0, KIND = 1, HOME = 2, JOB = 3, TARGET = 4, POINT = 5;
// Agent situation flags, matched against each action's requirements.
const HOUSED = 1, HOMELESS = 2, EMPLOYED = 4, JOBLESS = 8, SENT = 16, AIMED = 32;
const ONLY_IF = { housed: HOUSED, homeless: HOMELESS, employed: EMPLOYED, jobless: JOBLESS };
const HOOKS = ['onSpawn', 'onTick', 'onStart', 'onFinish', 'onGone', 'onRebuildMatrix', 'onPlace', 'onDemolish', 'onLine', 'onLink'];   // called for every module that has them

export class Sim {
  /**
   * @param {import('../../shared/engine/world.js').World} world
   * @param {object} cfg  see README: needs, actions, types, weights, tuning, maxAgents, seed
   */
  constructor(world, cfg) {
    this.world = world;
    const tu = this.tuning = { ...DEFAULT_TUNING, ...cfg.tuning };
    this.needs = cfg.needs.map(n => ({ grow: 0.0005, weight: 1, ...n }));
    // A need may stop building up short of desperate (`max`, default 1): it then weighs on decisions and mood but never
    // breaks off work or sleep, which a desperate need does.
    this.needMax = Float32Array.from(this.needs, n => n.max ?? 1);
    this.actions = cfg.actions.map(a => ({ effects: {}, ...a }));
    if (!this.actions.some(a => !a.at && !a.duration && !a.onlyIf && !Object.keys(a.effects).length)) this.actions.push({ name: 'wander', effects: {} });
    // With `life`, the types are age steps blended from the stages; a person moves through them as they age.
    this.life = cfg.life ? { ...cfg.life, ...ageTypes(cfg.life, this.needs) } : null;
    this.types = (this.life ? this.life.types : cfg.types?.length ? cfg.types : [{ name: 'agent' }]).map(t => ({ share: 1, speed: 1, works: true, grow: {}, weight: {}, ...t }));
    const K = this.K = this.needs.length, A = this.A = this.actions.length, T = this.T = this.types.length;
    // A prefab may say which types can work there: `staff: ['nurse', 'worker']`. Without it, anyone who works can.
    for (const p of world.prefabs) {
      if (!p.staff) { p.staffTypes = null; continue; }
      for (const n of p.staff) if (!this.types.some(t => t.name === n)) throw new Error(`Prefab "${p.name}": staff type "${n}" does not exist`);
      p.staffTypes = Uint8Array.from(this.types, t => (p.staff.includes(t.name) ? 1 : 0));
    }

    // ── per-action tables
    this.tmode = new Uint8Array(A);                  // NONE / KIND / HOME / JOB / TARGET
    this.field = new Array(A).fill(null);            // KIND: shared field to the nearest open building of that kind
    this.kind = new Int16Array(A).fill(-1);          // KIND: tile id
    this.req = new Uint8Array(A);                    // situation flags the agent must have
    this.inPlace = new Uint8Array(A);                // no destination, but has effects/duration: done on the spot
    this.until = new Int16Array(A).fill(-1);         // need that ends the action when it reaches 0
    this.duration = new Uint16Array(A);              // or a fixed length in ticks
    this.effects = new Float32Array(A * K);          // change per tick to each need while doing the action
    this.distFeature = new Int16Array(A).fill(-1);
    this.ownField = new Uint8Array(A);               // KIND: the destination is a field of the game's own (`at: '#name'`), not a tile kind
    this.reach = new Float32Array(A).fill(tu.pointReach);   // POINT: how near counts as there
    this.held = new Uint8Array(A);                   // POINT with neither `until` nor `duration`: kept up until the agent next decides, or the point moves away
    const names = this.needs.map(n => n.name);
    this.actions.forEach((a, ai) => {
      let strongest = 0;
      for (const [need, delta] of Object.entries(a.effects)) {
        const k = this.needIndex(need);
        this.effects[ai * K + k] = delta;
        if (delta < strongest) { strongest = delta; this.until[ai] = k; }
      }
      if (a.until) this.until[ai] = this.needIndex(a.until);
      this.duration[ai] = a.duration ?? 0;
      if (a.onlyIf) {
        if (!ONLY_IF[a.onlyIf]) throw new Error(`Action "${a.name}": onlyIf must be one of ${Object.keys(ONLY_IF).join(', ')}`);
        this.req[ai] |= ONLY_IF[a.onlyIf];
      }
      if (a.at === '@home') { this.tmode[ai] = HOME; this.req[ai] |= HOUSED; }
      else if (a.at === '@job') { this.tmode[ai] = JOB; this.req[ai] |= EMPLOYED; }
      else if (a.at === '@target') { this.tmode[ai] = TARGET; this.req[ai] |= SENT; }   // the building in sim.target[i], set by a module
      else if (a.at === '@point') {                    // a point of the agent's own, in sim.goalX[i] / goalY[i], set by a module
        this.tmode[ai] = POINT; this.req[ai] |= AIMED; if (a.reach) this.reach[ai] = a.reach;
        if (this.until[ai] < 0 && !this.duration[ai]) this.held[ai] = 1;
      }
      else if (a.at && a.at[0] === '#') { this.tmode[ai] = KIND; this.ownField[ai] = 1; this.field[ai] = world.customField(a.at.slice(1)); }   // cells a module names
      else if (a.at) { this.tmode[ai] = KIND; this.kind[ai] = world.id(a.at); this.field[ai] = world.trackField(a.at); }
      else if (this.until[ai] >= 0 || this.duration[ai]) this.inPlace[ai] = 1;
      if (this.tmode[ai]) { this.distFeature[ai] = names.length; names.push('dist:' + a.name); }
    });
    // Extra inputs to the matrix that a game defines: one value per person, written by its modules (wealth, fear, rank…).
    this._extra = (cfg.features ?? []).map(name => { names.push(name); return { name, f: names.length - 1, arr: null }; });
    this.biasFeature = names.length; names.push('bias');
    this.featureNames = names;
    const F = this.F = names.length, MA = this.MA = F * A;
    this.idle = this.actions.findIndex((a, ai) => !this.tmode[ai] && !this.inPlace[ai] && !this.req[ai]);

    // ── matrices: `base` = design values, `live` = base adjusted for the current world
    this.base = new Float32Array(T * MA);
    this.live = new Float32Array(T * MA);
    this.types.forEach((ty, t) => this.actions.forEach((a, ai) => {
      for (const [need, delta] of Object.entries(a.effects)) if (delta < 0) {
        const k = this.needIndex(need);
        this.base[t * MA + k * A + ai] = this.needs[k].weight * (ty.weight[need] ?? 1);
      }
      if (this.distFeature[ai] >= 0) this.base[t * MA + this.distFeature[ai] * A + ai] = tu.distWeight;
      if (this.tmode[ai] === JOB) this.base[t * MA + this.biasFeature * A + ai] = tu.workBias;
      if (!this.tmode[ai] && !this.inPlace[ai]) this.base[t * MA + this.biasFeature * A + ai] = tu.idleBias;
      for (const src of [cfg.weights, ty.weights])     // explicit overrides: { action: { feature: value } }
        for (const [feat, v] of Object.entries(src?.[a.name] ?? {})) this.base[this.at(t, feat, ai)] = v;
    }));

    // ── agents (struct of arrays)
    const cap = this.capacity = cfg.maxAgents ?? 20000;
    this.count = 0;
    this.px = new Float32Array(cap); this.py = new Float32Array(cap);   // position in cells
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap);   // velocity, cells per tick
    this.cell = new Int32Array(cap);                                     // cell index at the start of the tick
    this.needsOf = new Float32Array(cap * K);                            // 0 = satisfied, 1 = desperate
    this.rate = new Float32Array(cap * K);                               // growth per tick of each need (type × personal trait)
    this.trait = new Float32Array(cap * K);                              // personal trait: this person's multiplier on each need's growth
    this.speed = new Float32Array(cap);                                  // cells per tick (type × personal trait)
    this.speedTrait = new Float32Array(cap);                             // personal trait: multiplier on walking speed
    this.age = new Float32Array(cap);                                    // ticks lived
    this.speedScale = new Float32Array(cap).fill(1);                     // a game may slow or speed a person (illness, a load to carry…)
    this.deny = new Uint32Array(cap);                                    // bit a set = this person may not choose action a right now (a module's call)
    /** Per-person values of the game's own features, by name: `sim.features.poor[i]`. They are inputs to the matrix like the needs are. */
    this.features = {};
    for (const e of this._extra) e.arr = this.features[e.name] = new Float32Array(cap);
    if (A > 32) throw new Error('At most 32 actions');
    this.home = new Int32Array(cap).fill(-1);                            // building id, or -1 = homeless
    this.job = new Int32Array(cap).fill(-1);                             // building id, or -1 = jobless
    this.target = new Int32Array(cap).fill(-1);                          // building id a module is sending this person to ('@target' actions), or -1
    this.goalX = new Float32Array(cap).fill(NaN);                        // a point a module is sending this person to ('@point' actions), in cells; NaN = none
    this.goalY = new Float32Array(cap).fill(NaN);
    this.type = new Uint8Array(cap);
    this.action = new Uint8Array(cap);
    this.using = new Uint8Array(cap);                                    // 1 while performing the action
    this.timer = new Uint16Array(cap);                                   // ticks spent performing it
    this.inside = new Int32Array(cap).fill(-1);                          // building the agent is inside, or -1
    this.inFor = new Uint16Array(cap);                                   // ticks since it went into that building (across actions done there in a row)
    this.wait = new Uint16Array(cap);                                    // ticks spent queueing at a door (0 = not queueing)
    this.queueAt = new Int32Array(cap);                                  // the building it is queueing for
    this.blockAct = new Uint8Array(cap).fill(255);                       // action given up on…
    this.blockUntil = new Int32Array(cap);                               // …until this tick
    this.detour = new Uint8Array(cap);                                   // ticks left walking around an obstacle (straight-line travel only)
    this.detX = new Int8Array(cap); this.detY = new Int8Array(cap);
    this.ride = new Uint16Array(cap);                                    // ticks spent so far on a link (see world.addLink)
    this.anchorX = new Float32Array(cap); this.anchorY = new Float32Array(cap);   // where idle time is spent around: home, else job, else spawn point
    this.spawnNear = cfg.spawn ?? 'buildings';                           // 'buildings' or 'anywhere'
    this.users = new Int32Array(A);                                      // agents currently performing each action
    this.saturation = new Float32Array(A);                               // users / capacity, 0..1
    this.slots = new Float32Array(A);                                    // KIND actions: staffed capacity right now
    this.tick = 0;
    // population summary, refreshed by assign()
    this.housed = 0; this.employed = 0; this.workforce = 0; this.beds = 0; this.jobs = 0;

    this._seed = (cfg.seed ?? 12345) >>> 0;
    this._feat = new Float32Array(F);
    this._typePick = [];
    this.types.forEach((ty, t) => { for (let n = 0; n < ty.share; n++) this._typePick.push(t); });
    this._head = new Int32Array(world.cells).fill(-1);                  // first agent standing on each cell
    /** How many agents stood on each cell at the start of the last tick (those inside buildings not counted). */
    this.crowd = new Uint8Array(world.cells);
    this._next = new Int32Array(cap);                                   // next agent on the same cell
    /** Milliseconds of background route work step() may do itself. Infinity = always finish (deterministic, for headless runs). */
    this.fieldBudgetMs = cfg.fieldBudgetMs ?? Infinity;
    this._assignVersion = -1; this._assignDirty = true;
    this.actionPace = Float32Array.from(this.actions, a => a.needsPace ?? 1);   // how fast needs build up while performing (asleep: slowly)
    this.interruptible = Uint8Array.from(this.actions, a => (a.interruptible ? 1 : 0));   // may be broken off for a desperate need
    this._removals = [];
    // every per-person array with its width, so a person can be moved to another slot in one go
    this._columns = [[this.px, 1], [this.py, 1], [this.vx, 1], [this.vy, 1], [this.cell, 1], [this.needsOf, K], [this.rate, K], [this.trait, K],
      [this.speed, 1], [this.speedTrait, 1], [this.speedScale, 1], [this.age, 1],
      [this.home, 1], [this.job, 1], [this.target, 1], [this.goalX, 1], [this.goalY, 1], [this.type, 1], [this.action, 1], [this.using, 1], [this.timer, 1], [this.inside, 1], [this.inFor, 1], [this.wait, 1],
      [this.queueAt, 1], [this.blockAct, 1], [this.blockUntil, 1], [this.detour, 1], [this.detX, 1], [this.detY, 1], [this.anchorX, 1], [this.anchorY, 1], [this.deny, 1], [this.ride, 1],
      ...this._extra.map(e => [e.arr, 1])];
    // the same list by name, for snapshot() and restore()
    this._columnNames = ['px', 'py', 'vx', 'vy', 'cell', 'needsOf', 'rate', 'trait', 'speed', 'speedTrait', 'speedScale', 'age',
      'home', 'job', 'target', 'goalX', 'goalY', 'type', 'action', 'using', 'timer', 'inside', 'inFor', 'wait', 'queueAt', 'blockAct', 'blockUntil', 'detour', 'detX', 'detY',
      'anchorX', 'anchorY', 'deny', 'ride', ...this._extra.map(e => 'feature:' + e.name)];
    this._custom = [];                                                  // per-person values the game added: { name, arr, fill, width }
    /** Set true to accumulate per-phase timings in `prof` (ms; divide by prof.ticks). */
    this.profile = false;
    this.prof = { upkeep: 0, decide: 0, move: 0, ticks: 0 };
    /** Agents walking to their home or job last tick, by what guided them: [route window, sector field, straight line]. */
    this.routeUse = [0, 0, 0];

    // Hooks. A game's rules come as modules: independent objects that each implement the hooks they care about.
    // Every module's hook is called, in the order the modules were given. Hooks passed directly in cfg form a first module.
    //   onSpawn(agent, opts, sim)    a person was just created (start of game, setCount, or add)
    //   onTick(sim)                  once per tick, after movement: the place for a game's own rules
    //   onStart(agent, action, sim)  an agent starts performing an action
    //   onFinish(agent, action, sim) an agent completes one
    //   onGone(agent, cause, sim)    just before a person removed with remove() disappears
    //   onRebuildMatrix(sim)         after the built-in crowding rule, to adjust the live matrices
    //   canStart(agent, action, building, sim)  return false to refuse an agent entry to a building
    //   canUse(agent, action, cell, sim)        return false to refuse an agent a destination that is not a building
    //                                           (a plain tile, or a cell of one of the game's own fields)
    // Building, through the game (game.place / demolish / line), not while the starting map is laid out:
    //   canBuild(prefabName, sim)    return false, or a string saying why, to refuse the player a building
    //   onPlace(building, sim)       the player placed a building
    //   onDemolish(building, sim)    the player removed a building (null: a plain tile)
    //   onLine(tileName, cells, sim) the player laid that many cells of a plain tile
    //   onLink(agent, fromCell, sim) an agent has just stepped through the link out of that cell (see world.addLink)
    this.modules = [];
    for (const h of HOOKS) this[h] = null;
    this.canStart = null;
    this.canUse = null;
    this.canBuild = null;
    const direct = {};
    for (const h of HOOKS) if (cfg[h]) direct[h] = cfg[h];
    if (Object.keys(direct).length) this.use({ name: 'config', ...direct });
    for (const m of cfg.modules ?? []) this.use(m);
  }

  /**
   * Plug in a module: an object with a `name`, an optional `setup(sim)` (run now, e.g. to add its per-person values),
   * and any of the hooks. Modules do not know about each other; they can read each other's columns on the sim.
   */
  use(m) {
    this.modules.push(m);
    if (m.setup) m.setup(this);
    for (const h of HOOKS) {
      const mods = this.modules.filter(x => typeof x[h] === 'function');
      this[h] = mods.length === 0 ? null : mods.length === 1 ? (a, b, c) => mods[0][h](a, b, c) : (a, b, c) => { for (let k = 0; k < mods.length; k++) mods[k][h](a, b, c); };
    }
    // canStart(agent, action, building, sim) is a question, not a notice: any module answering false refuses the entry.
    const askers = this.modules.filter(x => typeof x.canStart === 'function');
    this.canStart = askers.length ? (i, a, b, s) => { for (let k = 0; k < askers.length; k++) if (askers[k].canStart(i, a, b, s) === false) return false; return true; } : null;
    const users = this.modules.filter(x => typeof x.canUse === 'function');
    this.canUse = users.length ? (i, a, c, s) => { for (let k = 0; k < users.length; k++) if (users[k].canUse(i, a, c, s) === false) return false; return true; } : null;
    // canBuild(prefabName, sim): the first module to answer false or a reason refuses the building.
    const builders = this.modules.filter(x => typeof x.canBuild === 'function');
    this.canBuild = builders.length ? (name, s) => { for (let k = 0; k < builders.length; k++) { const r = builders[k].canBuild(name, s); if (r === false || typeof r === 'string') return r; } return true; } : null;
    return m;
  }
  /** A plugged-in module by name, or undefined. */
  module(name) { return this.modules.find(m => m.name === name); }

  rnd() { this._seed = (this._seed * 1664525 + 1013904223) >>> 0; return this._seed / 4294967296; }
  needIndex(name) { const k = this.needs.findIndex(n => n.name === name); if (k < 0) throw new Error(`Unknown need "${name}"`); return k; }
  actionIndex(name) { const a = this.actions.findIndex(x => x.name === name); if (a < 0) throw new Error(`Unknown action "${name}"`); return a; }
  typeIndex(name) { const t = this.types.findIndex(x => x.name === name); if (t < 0) throw new Error(`Unknown type "${name}"`); return t; }

  /** Index into `base` / `live` for one weight. Names or indexes. Features: a need name, "dist:<action>", "bias". */
  at(type, feature, action) {
    const t = typeof type === 'number' ? type : this.typeIndex(type);
    const a = typeof action === 'number' ? action : this.actionIndex(action);
    let f = feature;
    if (typeof f !== 'number') { f = this.featureNames.indexOf(feature); if (f < 0) throw new Error(`Unknown feature "${feature}"`); }
    return t * this.MA + f * this.A + a;
  }

  /**
   * Add a per-person value of the game's own (health, money, a mood…). It is kept with the person when the
   * engine reshuffles its arrays, and reset to `fill` for each new person. Returns the array: read and write `arr[i]`
   * (or `arr[i * width + k]`). Also available as `sim[name]`.
   */
  addColumn(name, ArrayType = Float32Array, fill = 0, width = 1) {
    if (this[name] !== undefined) throw new Error(`Sim already has "${name}"`);
    const arr = new ArrayType(this.capacity * width).fill(fill);
    this[name] = arr; this._columns.push([arr, width]); this._columnNames.push(name); this._custom.push({ name, arr, fill, width });
    return arr;
  }

  /**
   * Everyone, as plain data: { count, tick, seed, columns: { name: [values…] } }, the game's own columns included.
   * Building ids in it (home, job, inside…) are the world's as they are now.
   */
  snapshot() {
    const n = this.count, columns = {};
    this._columns.forEach(([arr, w], k) => {
      const part = arr.subarray(0, n * w);
      columns[this._columnNames[k]] = arr instanceof Float32Array ? Array.from(part, v => +v.toFixed(6)) : Array.from(part);
    });
    return { count: n, tick: this.tick, seed: this._seed, columns };
  }
  /**
   * Put back what snapshot() gave, replacing everyone. The simulation must be built from the same config (needs,
   * actions, types). `buildingId` maps a building id in the data to the id it has now (or -1 if it is gone).
   * No onSpawn is called: the columns are the people. A column the data does not have keeps its starting value.
   */
  restore(d, buildingId = id => id) {
    const n = Math.min(d.count, this.capacity), B = this.world.buildings;
    this._head.fill(-1); this._removals = [];
    for (const c of this._custom) c.arr.fill(c.fill, 0, n * c.width);
    this._columns.forEach(([arr, w], k) => {
      const saved = d.columns[this._columnNames[k]];
      if (saved && saved.length >= n * w) for (let j = 0; j < n * w; j++) arr[j] = saved[j];
    });
    for (const col of [this.home, this.job, this.target, this.inside, this.queueAt])
      for (let i = 0; i < n; i++) if (col[i] >= 0) { const id = buildingId(col[i]); col[i] = id >= 0 && B[id] ? id : -1; }
    for (const b of B) if (b) { b.inside = 0; b.customers = 0; }
    for (let i = 0; i < n; i++) {
      if (this.inside[i] >= 0) { const b = B[this.inside[i]]; b.inside++; if (this.tmode[this.action[i]] === KIND) b.customers++; }
      else if (this.using[i] && this.tmode[this.action[i]]) this.using[i] = 0;      // was inside something that is gone: decide again
      this.wait[i] = 0;
    }
    this.count = n; this.tick = d.tick; this._seed = d.seed >>> 0;
    this._assignDirty = true;
  }

  /** Which age step a person of this age (in ticks) is in. Only meaningful with `life`. */
  ageStep(age) { const L = this.life; return L ? Math.max(0, Math.min(L.steps - 1, (age / L.maxAge * L.steps) | 0)) : 0; }
  /** Set person i's age in ticks, and with it their age step (matrix, need rates, speed, look). */
  setAge(i, age) { this.age[i] = age; if (this.life) { const t = this.ageStep(age); if (t !== this.type[i]) this.setType(i, t); } }

  /** Grow or shrink the population. New agents are placed on random walkable cells. */
  setCount(n) {
    n = Math.min(n, this.capacity);
    for (let i = this.count; i < n; i++) this.spawn(i);
    for (let i = n; i < this.count; i++) {                               // removed agents free their bed, job and place inside
      this.home[i] = -1; this.job[i] = -1; this.target[i] = -1; this._head[this.cell[i]] = -1;
      const b = this.inside[i] >= 0 ? this.world.buildings[this.inside[i]] : null;
      if (b) { b.inside--; if (this.tmode[this.action[i]] === KIND) b.customers--; }
      this.inside[i] = -1; this.using[i] = 0;
    }
    this.count = n; this._assignDirty = true;
  }

  /** Put a new person in slot i (used by setCount and add). opts: { age (ticks), home (building), type (name or index) } plus anything the game's onSpawn wants. */
  spawn(i, x, y, opts = {}) {
    const { world, K, tuning: tu } = this;
    if (x === undefined && this.spawnNear === 'buildings' && world.buildings.length) {
      for (let tries = 0; tries < 12 && x === undefined; tries++) {        // somewhere in or just around a random building
        const b = world.buildings[(this.rnd() * world.buildings.length) | 0];
        if (!b) continue;
        const sx = b.x - 3 + this.rnd() * (b.w + 6), sy = b.y - 3 + this.rnd() * (b.h + 6);
        if (world.inside(sx | 0, sy | 0) && !world.solid[world.tiles[(sy | 0) * world.w + (sx | 0)]]) { x = sx; y = sy; }
      }
    }
    if (x === undefined) {
      let c;
      do { c = (this.rnd() * world.cells) | 0; } while (world.solid[world.tiles[c]]);
      x = (c % world.w) + 0.5; y = ((c / world.w) | 0) + 0.5;
    }
    this.px[i] = x; this.py[i] = y; this.vx[i] = this.vy[i] = 0;
    this.cell[i] = (y | 0) * world.w + (x | 0);
    this.speedTrait[i] = 1 + (this.rnd() * 2 - 1) * tu.speedSpread; this.speedScale[i] = 1;
    for (let k = 0; k < K; k++) {
      this.needsOf[i * K + k] = this.rnd() * 0.7;
      this.trait[i * K + k] = 1 + (this.rnd() * 2 - 1) * tu.traitSpread;
    }
    this.age[i] = opts.age ?? 0;
    this.setType(i, opts.type !== undefined ? (typeof opts.type === 'number' ? opts.type : this.typeIndex(opts.type))
      : this.life ? this.ageStep(this.age[i]) : this._typePick[i % this._typePick.length]);
    for (const col of this._custom) col.arr.fill(col.fill, i * col.width, (i + 1) * col.width);
    this.home[i] = -1; this.job[i] = -1; this.target[i] = -1; this.goalX[i] = this.goalY[i] = NaN; this.anchorX[i] = x; this.anchorY[i] = y;
    this.action[i] = this.idle; this.using[i] = 0; this.timer[i] = 0;
    this.inside[i] = -1; this.inFor[i] = 0; this.wait[i] = 0; this.blockAct[i] = 255; this.detour[i] = 0; this.ride[i] = 0;
    this.deny[i] = 0; for (const e of this._extra) e.arr[i] = 0;
    if (opts.home) { this.home[i] = opts.home.id; opts.home.residents++; this.anchorX[i] = opts.home.ex + 0.5; this.anchorY[i] = opts.home.ey + 0.5; }
    this._assignDirty = true;
    if (this.onSpawn) this.onSpawn(i, opts, this);
  }

  /** Give person i a type: its matrix, need rates, speed and look. Their personal traits carry over. */
  setType(i, t) {
    const K = this.K, tu = this.tuning, ty = this.types[t], was = this.types[this.type[i]];
    this.type[i] = t;
    this.speed[i] = tu.speed * ty.speed * this.speedTrait[i];
    for (let k = 0; k < K; k++) this.rate[i * K + k] = tu.pace * this.needs[k].grow * (ty.grow[this.needs[k].name] ?? 1) * this.trait[i * K + k];
    if (was && was.works !== ty.works) this._assignDirty = true;        // started or stopped being able to work
  }

  /**
   * Add one person during play, at (x, y) in cells. opts: { age (ticks), home (a building with a free bed) } plus anything
   * the game's onSpawn wants. Returns the new person's index, or -1 if the population is at capacity.
   */
  add(x, y, opts = {}) {
    if (this.count >= this.capacity) return -1;
    this.spawn(this.count, x, y, opts);
    return this.count++;
  }

  /** Give person i a different home (a building with a free bed), or none. */
  moveHome(i, b) {
    const from = this.home[i] >= 0 ? this.world.buildings[this.home[i]] : null;
    if (from) from.residents--;
    this.home[i] = b ? b.id : -1;
    if (b) b.residents++;
    this._assignDirty = true;
  }

  /** Remove person i from the game, for a reason of the game's own (passed to onGone). Takes effect at the end of the tick. */
  remove(i, cause) { this._removals.push(i, cause); }

  _flushRemovals() {
    const list = this._removals, order = [];
    for (let k = 0; k < list.length; k += 2) order.push([list[k], list[k + 1]]);
    this._removals = [];
    order.sort((a, b) => b[0] - a[0]);                                  // highest slot first, so moving the last person down never disturbs one still to go
    let prev = -1;
    for (const [i, cause] of order) {
      if (i === prev || i >= this.count) continue;                      // listed twice
      prev = i;
      if (this.onGone) this.onGone(i, cause, this);
      const b = this.inside[i] >= 0 ? this.world.buildings[this.inside[i]] : null;
      if (b) { b.inside--; if (this.tmode[this.action[i]] === KIND) b.customers--; }
      this._head[this.cell[i]] = -1;
      const last = --this.count;
      if (i !== last) for (const [arr, w] of this._columns) arr.copyWithin(i * w, last * w, last * w + w);   // the last person takes the empty slot
      this.home[last] = -1; this.job[last] = -1; this.target[last] = -1; this.inside[last] = -1; this.using[last] = 0;
    }
    this._assignDirty = true;
  }

  /**
   * Hand out homes and jobs. Runs automatically when the map or population changed.
   *   - agents keep the home/job they have while that building exists
   *   - an agent without a home takes the nearest house with a free bed
   *   - unstaffed buildings recruit their first worker from nearby, then jobless agents take the nearest vacancy
   * Also opens/closes buildings by staffing and works out each service's capacity.
   */
  assign() {
    const { world, home, job, px, py, type } = this;
    const N = this.count, B = world.buildings;
    const fits = (i, b) => { const s = b.prefab.staffTypes; return !s || s[type[i]] === 1; };   // may this person work there?
    for (const b of B) if (b) { b.residents = 0; b.workers = 0; }
    this.workforce = 0;
    for (let i = 0; i < N; i++) {
      const h = home[i], j = job[i], works = this.types[type[i]].works;
      if (h >= 0) { const b = B[h]; if (b && b.residents < b.beds) b.residents++; else home[i] = -1; }
      if (j >= 0) { const b = B[j]; if (b && works && b.workers < b.jobs && fits(i, b)) b.workers++; else job[i] = -1; }
      if (works) this.workforce++;
    }

    // Buildings bucketed by 32-cell sector, so "nearest with room" looks at the neighbourhood, not the whole map.
    const S = 32, gw = Math.ceil(world.w / S), gh = Math.ceil(world.h / S);
    const grid = Array.from({ length: gw * gh }, () => []);
    let freeBeds = 0, vacancies = 0, unstaffed = 0;
    for (const b of B) if (b && (b.beds || b.jobs)) {
      grid[Math.min(gh - 1, (b.cy / S) | 0) * gw + Math.min(gw - 1, (b.cx / S) | 0)].push(b);
      freeBeds += b.beds - b.residents; vacancies += b.jobs - b.workers;
      if (b.jobs > 0 && b.workers === 0) unstaffed++;
    }
    const nearest = (x, y, room, maxDist) => {
      const sx = (x / S) | 0, sy = (y / S) | 0, limit = Math.min(Math.ceil(maxDist / S) + 1, Math.max(gw, gh));
      let best = null, bd = maxDist * maxDist;
      for (let r = 0; r <= limit; r++) {
        if (best && (r - 1) * S > Math.sqrt(bd)) break;                  // nothing in a further ring can be closer
        for (let gy = sy - r; gy <= sy + r; gy++) {
          if (gy < 0 || gy >= gh) continue;
          const stepX = r === 0 || gy === sy - r || gy === sy + r ? 1 : 2 * r;   // full top and bottom rows, edges only in between
          for (let gx = sx - r; gx <= sx + r; gx += stepX) {
            if (gx < 0 || gx >= gw) continue;
            const cell = grid[gy * gw + gx];
            for (let k = 0; k < cell.length; k++) {
              const b = cell[k];
              if (!room(b)) continue;
              const dx = x - b.cx, dy = y - b.cy, d = dx * dx + dy * dy;
              if (d < bd) { bd = d; best = b; }
            }
          }
        }
      }
      return best;
    };
    let who = 0;                                                         // the person a job is being looked for
    const hasBed = b => b.residents < b.beds, hasJob = b => b.workers < b.jobs && fits(who, b), isUnstaffed = b => b.jobs > 0 && b.workers === 0 && fits(who, b);
    for (let i = 0; i < N && freeBeds > 0; i++) if (home[i] < 0) { const b = nearest(px[i], py[i], hasBed, Infinity); if (b) { home[i] = b.id; b.residents++; freeBeds--; } }
    // Jobs are looked for around home, so people work near where they live.
    const commute = this.tuning.commute, hx = i => (home[i] >= 0 ? B[home[i]].cx : px[i]), hy = i => (home[i] >= 0 ? B[home[i]].cy : py[i]);
    for (let i = 0; i < N && unstaffed > 0; i++) if (job[i] < 0 && this.types[type[i]].works) {       // one worker each first, so buildings can open
      who = i; const b = nearest(hx(i), hy(i), isUnstaffed, commute);
      if (b) { job[i] = b.id; b.workers++; unstaffed--; vacancies--; }
    }
    for (let i = 0; i < N && vacancies > 0; i++) if (job[i] < 0 && this.types[type[i]].works) {
      who = i; const b = nearest(hx(i), hy(i), hasJob, commute);
      if (b) { job[i] = b.id; b.workers++; vacancies--; }
    }
    if (unstaffed > 0) {                                                 // still unstaffed and nobody nearby is jobless:
      let moved = 0;                                                     // move one worker over from the best-staffed building
      for (const b of B) if (b && b.jobs > 0 && b.workers === 0 && moved < 64) {
        let donor = null, best = -1, bd = Infinity;
        if (b.prefab.staffTypes) {                                       // only some types may work here: the nearest of them who can be spared
          for (let i = 0; i < N; i++) {
            const j = job[i];
            if (j < 0 || B[j].workers <= 1 || !fits(i, b)) continue;
            const dx = px[i] - b.cx, dy = py[i] - b.cy, d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = i; }
          }
          if (best < 0) continue;
          donor = B[job[best]];
        } else {
          for (const d of B) if (d && d.workers > 1 && (!donor || d.workers > donor.workers)) donor = d;
          if (!donor) break;
          for (let i = 0; i < N; i++) if (job[i] === donor.id) {
            const dx = px[i] - b.cx, dy = py[i] - b.cy, d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = i; }
          }
        }
        job[best] = b.id; donor.workers--; b.workers++; moved++;
      }
    }

    for (let i = 0; i < N; i++) {                                        // idle agents hang around home, or failing that their workplace
      const b = home[i] >= 0 ? B[home[i]] : job[i] >= 0 ? B[job[i]] : null;
      if (b) { this.anchorX[i] = b.ex + 0.5; this.anchorY[i] = b.ey + 0.5; }
    }

    // staffing → open/closed and capacity
    let changed = false;
    this.beds = 0; this.jobs = 0; this.housed = 0; this.employed = 0;
    for (const b of B) if (b) {
      const open = (b.jobs === 0 || b.workers > 0) && !b.blocked;   // staffed, and no module has closed it
      if (open !== b.open) { b.open = open; changed = true; }
      b.staff = b.jobs === 0 ? 1 : b.workers / b.jobs;
      b.cap = open && b.prefab.capacity ? Math.max(1, Math.round(b.prefab.capacity * b.staff)) : 0;   // customers it can hold
      this.beds += b.beds; this.jobs += b.jobs; this.housed += b.residents; this.employed += b.workers;
    }
    this.slots.fill(0);
    const raw = new Int32Array(world.defs.length);                       // cells of a kind that are not part of a building
    for (let c = 0; c < world.cells; c++) if (world.bldAt[c] < 0) raw[world.tiles[c]]++;
    const perKind = new Float32Array(world.defs.length);
    for (const b of B) if (b && b.open) perKind[b.tile] += b.cap;
    for (let a = 0; a < this.A; a++) if (this.tmode[a] === KIND) this.slots[a] = this.ownField[a] ? 1e9 : raw[this.kind[a]] * this.tuning.slotsPerTile + perKind[this.kind[a]];
    if (changed) { world.version++; world.kindsChanged(); }              // closed buildings drop out of the fields
    this._assignVersion = world.version; this._assignDirty = false;
  }

  /** World state → matrices. Built-in rule: crowded services lower their own pull. Then the game's hook. */
  rebuildMatrix() {
    const { live, base, A, K, T, MA, tuning: tu } = this;
    live.set(base);
    for (let a = 0; a < A; a++) {
      if (this.tmode[a] !== KIND) { this.saturation[a] = 0; continue; }
      const cap = this.slots[a];
      const sat = this.saturation[a] = cap > 0 ? Math.min(1, this.users[a] / cap) : 1;
      if (!tu.crowding) continue;
      for (let k = 0; k < K; k++) if (this.effects[a * K + k] < 0)
        for (let t = 0; t < T; t++) live[t * MA + k * A + a] *= 1 - tu.crowding * sat;
    }
    if (this.onRebuildMatrix) this.onRebuildMatrix(this);
  }

  /** Score every available action for agent i and take the best. */
  decide(i) {
    const best = this._pick(i), cur = this.action[i];
    if (best !== cur) { this.wait[i] = 0; this.detour[i] = 0; this.ride[i] = 0; }
    this.action[i] = best;
    return best;
  }

  /**
   * Will agent i, inside a building, go on to something in that same building when what it is doing ends? A guess made
   * with its needs as they are now (a view asks it near the end of a visit, to know whether to show it at the door).
   */
  staysAfter(i) {
    const id = this.inside[i];
    if (id < 0 || !this.tuning.stayForNext) return false;
    const b = this.world.buildings[id], was = this.action[i], now = this._pick(i, true);
    return !!b && now !== was && this._doneIn(i, b, was, now);
  }

  // Can agent i, inside building b after action `was`, do action `now` there too?
  _doneIn(i, b, was, now) {
    const m = this.tmode[now];
    return m === HOME ? this.home[i] === b.id : m === JOB ? this.job[i] === b.id : m === TARGET ? this.target[i] === b.id
      : m === KIND && !this.ownField[now] && b.tile === this.kind[now] && b.open && (this.tmode[was] === KIND || b.customers < b.cap);
  }

  // The best action for agent i right now, changing nothing. `ending`: as if what it is doing were done (no bonus for keeping it, and not it).
  _pick(i, ending = false) {
    const { K, A, F, _feat: feat, live, tuning: tu, req, world, tmode } = this;
    const c = this.cell[i], n = i * K, m = this.type[i] * this.MA;
    const flags = (this.home[i] >= 0 ? HOUSED : HOMELESS) | (this.job[i] >= 0 ? EMPLOYED : JOBLESS)
      | (this.target[i] >= 0 && world.buildings[this.target[i]] ? SENT : 0)   // a target that was demolished no longer counts
      | (this.goalX[i] === this.goalX[i] ? AIMED : 0);
    for (let k = 0; k < K; k++) { const v = this.needsOf[n + k]; feat[k] = v * v; }
    for (let a = 0; a < A; a++) {
      const f = this.distFeature[a];
      if (f < 0) continue;
      let d = INF;
      if (tmode[a] === KIND) d = this.field[a][c];
      else if (tmode[a] === POINT) { const ex = this.goalX[i] - this.px[i], ey = this.goalY[i] - this.py[i]; d = ex === ex ? Math.sqrt(ex * ex + ey * ey) * STEP_COST : INF; }
      else {                                           // own home, job or target: read its window, or estimate while there is none yet
        const id = tmode[a] === HOME ? this.home[i] : tmode[a] === JOB ? this.job[i] : this.target[i], b = id >= 0 ? world.buildings[id] : null;
        if (b) {
          const x = c % world.w, y = (c / world.w) | 0, win = world.bwin[id];
          if (win) { const lx = x - win.x0, ly = y - win.y0; if (lx >= 0 && ly >= 0 && lx < win.w && ly < win.h) d = win.data[ly * win.w + lx]; }
          if (d === INF && !(win && win.full)) d = (Math.abs(x - b.ex) + Math.abs(y - b.ey)) * STEP_COST;
        }
      }
      feat[f] = d === INF ? 8 : Math.min(1, d / tu.distScale);
    }
    for (let e = 0; e < this._extra.length; e++) feat[this._extra[e].f] = this._extra[e].arr[i];
    feat[this.biasFeature] = 1;
    let best = this.idle, bestScore = -Infinity;
    const cur = this.action[i], blocked = this.tick < this.blockUntil[i] ? this.blockAct[i] : 255, denied = this.deny[i];
    for (let a = 0; a < A; a++) {
      if ((req[a] & flags) !== req[a] || a === blocked || (denied >> a) & 1 || (ending && a === cur)) continue;   // lacks a home/job/target for it, just gave up on it, or a module rules it out
      let sc = a === cur ? tu.sticky : 0;
      for (let f = 0; f < F; f++) sc += feat[f] * live[m + f * A + a];
      if (sc > bestScore) { bestScore = sc; best = a; }
    }
    return best;
  }

  /** Bring homes and jobs up to date with the map, and do this tick's share of background route work. */
  refresh() {
    const world = this.world;
    if (this._assignDirty || this._assignVersion !== world.version) this.assign();
    if (this.fieldBudgetMs > 0 && world.fieldsDirty) world.work(this.fieldBudgetMs);
  }

  /** Advance the simulation by one tick. */
  step() {
    const tu = this.tuning, P = this.profile ? this.prof : null, t0 = P ? performance.now() : 0;
    this.refresh();
    if (this.tick % tu.matrixEvery === 0) this.rebuildMatrix();
    if (this.tick % 16 === 0) {                        // smoothed fullness of each building, for crowd animations
      for (const b of this.world.buildings) if (b) {
        const room = b.cap + b.beds + b.jobs, target = room > 0 ? Math.min(1, b.inside / room) : 0;
        b.load += (target - b.load) * 0.25;
      }
    }
    const t1 = P ? performance.now() : 0;
    for (let i = this.tick % tu.decideEvery; i < this.count; i += tu.decideEvery) {
      if (!this.using[i]) this.decide(i); else if (this.held[this.action[i]] || this._urgent(i)) this._interrupt(i);   // one held at a point thinks again as if it were free
    }
    const t2 = P ? performance.now() : 0;
    this._move();
    for (let i = this.tick % 8; i < this.count; i += 8) {              // everyone gets older; with `life`, that moves them through the age steps
      const age = this.age[i] += 8;
      if (this.life) { const t = this.ageStep(age); if (t !== this.type[i]) this.setType(i, t); }
    }
    if (this.onTick) this.onTick(this);                // the game's own rules
    if (this._removals.length) this._flushRemovals();
    if (P) { const t3 = performance.now(); P.upkeep += t1 - t0; P.decide += t2 - t1; P.move += t3 - t2; P.ticks++; }
    this.tick++;
    this.world.clock = this.tick;
  }

  // Is a need desperate that what agent i is doing does nothing for? (Someone asleep who is dying of thirst.)
  _urgent(i) {
    const a = this.action[i];
    if (!this.interruptible[a]) return false;         // a meal or a drink is seen through; sleep, work and leisure can be broken off
    const K = this.K, n = i * K, own = this.until[a], lim = this.tuning.interruptAbove;
    for (let k = 0; k < K; k++) if (k !== own && this.needsOf[n + k] >= lim) return true;
    return false;
  }
  // Let agent i reconsider in the middle of an action. If something else now matters more, it stops and goes to do that.
  _interrupt(i) {
    const was = this.action[i], now = this.decide(i);
    if (now === was) return;
    let stay = 0;
    if (this.inside[i] >= 0) {
      stay = this._carryOn(i, was);
      if (stay > 0) return;                           // the new thing is done in the same building: no need to go out
      this.action[i] = was;                           // leave the building under the action it was performing
      this._leave(i, was);
    }
    this.using[i] = 0; this.action[i] = now;
    if (stay < 0) this.decide(i);                     // the building refused it: think again outside
  }

  // Agent i has just finished (or broken off) action `was` inside a building and chosen sim.action[i] next. If that is
  // done in this same building it starts there without going out: 1. Not here: 0. Here, but a module refused it: -1
  // (that action is then given up on for a while, as at the door).
  _carryOn(i, was) {
    if (!this.tuning.stayForNext) return 0;
    const b = this.world.buildings[this.inside[i]], now = this.action[i], m = this.tmode[now];
    if (!b || !this._doneIn(i, b, was, now)) return 0;
    if (this.canStart && !this.canStart(i, now, b, this)) { this.blockAct[i] = now; this.blockUntil[i] = this.tick + this.tuning.giveUpTicks; return -1; }
    if (this.tmode[was] === KIND) b.customers--;
    if (m === KIND) b.customers++;
    this.using[i] = 1; this.timer[i] = 0; this.wait[i] = 0;
    if (this.onStart) this.onStart(i, now, this);
    return 1;
  }

  /**
   * About how many more ticks agent i will go on with what it is performing: from the need that ends it and how fast the
   * action takes that need down, or from its fixed length. Infinity when nothing says (or while it is not performing).
   */
  ticksLeft(i) {
    if (!this.using[i]) return Infinity;
    const a = this.action[i], u = this.until[a], dur = this.duration[a];
    if (dur) return Math.max(0, dur - this.timer[i]);
    const e = u >= 0 ? this.effects[a * this.K + u] : 0;
    return e < 0 ? this.needsOf[i * this.K + u] / -e : Infinity;
  }

  // Put agent i inside building b (it is then parked: not moved, not pushed, not drawn).
  _enter(i, b, a) {
    this.using[i] = 1; this.inside[i] = b.id; this.inFor[i] = 0; this.timer[i] = 0; this.wait[i] = 0; this.vx[i] = this.vy[i] = 0;
    b.inside++; if (this.tmode[a] === KIND) b.customers++;
    if (this.onStart) this.onStart(i, a, this);
  }
  // Take agent i out of the building it is in, onto that building's exit cell.
  _leave(i, a) {
    const b = this.world.buildings[this.inside[i]];
    this.inside[i] = -1;
    if (!b) return;                                    // demolished while inside: step out where it went in
    b.inside--; if (this.tmode[a] === KIND) b.customers--;
    this.px[i] = b.xx + 0.3 + this.rnd() * 0.4; this.py[i] = b.xy + 0.3 + this.rnd() * 0.4;
  }

  // Free movement: steer downhill on the action's distance field, get pushed apart by neighbours
  // (found through per-cell lists), slide along solid tiles.
  _move() {
    const { world, K, px, py, vx, vy, cell, needsOf, rate, action, using, timer, users, effects, tmode, inside, tuning: tu } = this;
    const N = this.count, W = world.w, H = world.h, tiles = world.tiles, solid = world.solid;
    const head = this._head, next = this._next;
    const sepR = tu.sepRadius, sepR2 = sepR * sepR, maxN = tu.maxNeighbours;
    const speedOf = world.speedOf, street = world.streetField, strollMax = tu.strollRange * STEP_COST;
    const buildings = world.buildings, bwin = world.bwin, entryAt = world.entryAt, sectors = world.sectors, tick = this.tick;
    const anchorX = this.anchorX, anchorY = this.anchorY, leash2 = tu.leash * tu.leash;
    const detour = this.detour, detX = this.detX, detY = this.detY, speedScale = this.speedScale, needMax = this.needMax;

    let nWin = 0, nSec = 0, nDir = 0;
    users.fill(0);
    const crowd = this.crowd, room = tu.cellRoom, slow = tu.crowdSlow;
    for (let i = 0; i < N; i++) { head[cell[i]] = -1; crowd[cell[i]] = 0; }   // clear last tick's lists (touches only occupied cells)
    for (let i = 0; i < N; i++) {
      const c = (py[i] | 0) * W + (px[i] | 0); cell[i] = c;
      if (inside[i] < 0) { next[i] = head[c]; head[c] = i; if (crowd[c] < 255) crowd[c]++; }   // agents inside a building take no space outside
    }

    for (let i = 0; i < N; i++) {
      const n = i * K, c = cell[i], a = action[i], mode = tmode[a];
      const pace = using[i] ? this.actionPace[a] : 1;      // needs build up all the time, more slowly during some actions
      for (let k = 0; k < K; k++) { const v = needsOf[n + k] + rate[n + k] * pace, top = needMax[k]; needsOf[n + k] = v > top ? top : v; }

      if (using[i]) {
        // Performing: inside a building, on a plain destination tile, or on the spot.
        if (inside[i] >= 0 ? !buildings[inside[i]] : (mode === KIND && this.field[a][c] !== 0)) {   // building or tile removed
          this._leave(i, a); using[i] = 0; this.decide(i); continue;
        }
        if (mode === POINT) {                                   // at a point that has moved on (a slot in a marching line): go after it
          const ex = this.goalX[i] - px[i], ey = this.goalY[i] - py[i], r = this.reach[a] * 2 + 0.2;
          if (!(ex * ex + ey * ey <= r * r)) { using[i] = 0; if (this.held[a]) continue; }
        }
        if (using[i]) {
          users[a]++;
          for (let k = 0, e = a * K; k < K; k++, e++) if (effects[e] !== 0) {
            const v = needsOf[n + k] + effects[e];
            needsOf[n + k] = v < 0 ? 0 : v > 1 ? 1 : v;
          }
          const u = this.until[a], dur = this.duration[a];
          if (timer[i] < 65535) timer[i]++;                      // ticks into it, whatever ends it (a view uses it too)
          if ((u >= 0 && needsOf[n + u] <= 0) || (dur && timer[i] >= dur) || (u < 0 && !dur && !this.held[a])) {
            if (this.onFinish) this.onFinish(i, a, this);          // still inside: sim.inside[i] is where it happened
            using[i] = 0;
            this.decide(i);                                         // chosen while still inside, so it can be done here without going out
            if (inside[i] >= 0) {
              const stay = this._carryOn(i, a);
              if (stay > 0) continue;
              this._leave(i, a);
              if (stay < 0) this.decide(i);                         // the building refused the next thing: think again outside
            }
          }
          if (inside[i] >= 0 && this.inFor[i] < 65535) this.inFor[i]++;
          continue;
        }
      }

      const x = px[i], y = py[i];
      let queued = false;
      if (this.wait[i] > 0) {                            // queueing outside a full building
        const b = buildings[this.queueAt[i]];
        if (!b || !b.open || b.tile !== this.kind[a]) { this.wait[i] = 0; this.decide(i); continue; }   // it closed or was removed
        if (b.customers < b.cap) {                       // room now: go in, unless a module refuses
          if (this.canStart && !this.canStart(i, a, b, this)) { this.wait[i] = 0; this.blockAct[i] = a; this.blockUntil[i] = tick + tu.giveUpTicks; this.decide(i); continue; }
          px[i] = b.ex + 0.5; py[i] = b.ey + 0.5; this._enter(i, b, a); continue;
        }
        if (++this.wait[i] > tu.queuePatience) {         // waited long enough: give up on this for a while
          this.blockAct[i] = a; this.blockUntil[i] = tick + tu.giveUpTicks; this.wait[i] = 0;
          this.decide(i); continue;
        }
        // After a few steps aside it simply stands there. A standing agent costs almost nothing:
        // no steering, no pushing, which is what makes a crowd at a door cheap.
        if (this.wait[i] > 12) { vx[i] = vy[i] = 0; continue; }
        queued = true;
      }
      // The field this agent follows: `fd[li]` is the value on its own cell, neighbours are at ±1 and ±fs.
      // `exact` means reaching 0 on it is reaching the agent's own destination (a sector field only leads near it).
      let fd = null, li = 0, fs = W, tx = 0, ty = 0, direct = false, exact = true, own = null;
      if (queued) { /* stepping aside: keeps its heading, no field */ }
      else if (mode === KIND) { fd = this.field[a]; li = c; }
      else if (mode === POINT) {                         // straight at the point, round what is solid; there, it is done on the spot
        tx = this.goalX[i]; ty = this.goalY[i];
        if (tx !== tx) { this.decide(i); continue; }         // the point was taken away
        const ex = tx - x, ey = ty - y, r = this.reach[a];
        if (!(ex * ex + ey * ey > r * r)) {
          if (this.canUse && !this.canUse(i, a, c, this)) { this.blockAct[i] = a; this.blockUntil[i] = tick + tu.retryTicks; this.decide(i); continue; }
          using[i] = 1; timer[i] = 0; vx[i] = vy[i] = 0;
          if (this.onStart) this.onStart(i, a, this);
          continue;
        }
        direct = true;
      }
      else if (mode !== NONE) {
        const id = mode === HOME ? this.home[i] : mode === JOB ? this.job[i] : this.target[i];
        own = id >= 0 ? buildings[id] : null;
        if (own) {
          const win = bwin[id], cx = c % W, cy = (c / W) | 0;
          tx = own.ex + 0.5; ty = own.ey + 0.5;
          const near = Math.abs(cx - own.ex) <= WINDOW_REACH && Math.abs(cy - own.ey) <= WINDOW_REACH;
          let found = false;
          if (win) {
            const lx = cx - win.x0, ly = cy - win.y0;
            if (win.full || (lx >= 1 && ly >= 1 && lx < win.w - 1 && ly < win.h - 1)) {
              const l = ly * win.w + lx;
              if (win.data[l] !== INF) { fd = win.data; li = l; fs = win.w; found = true; win.used = tick; nWin++; }
              else if (!win.full && !win.maxed) world.requestWindow(id, cx, cy, true);   // no route inside the window: widen it
            } else if (near && !win.maxed) world.requestWindow(id, cx, cy);
          } else if (near) world.requestWindow(id, cx, cy);
          if (!found) {                                  // out of the window's reach, or it is not ready: use the neighbourhood's field
            const sec = sectors.get(own.sector);
            if (sec && sec.stale) world.requestSector(own.sector);   // out of date since an edit: refresh it, use the old one meanwhile
            if (sec && sec.ready && sec.data[c] !== INF && sec.data[c] !== 0) { fd = sec.data; li = c; exact = false; sec.used = tick; nSec++; }
            else { if (!sec) world.requestSector(own.sector); direct = true; nDir++; }   // last resort: walk straight at the door
          }
        }
      }

      const inWall = solid[tiles[c]] === 1;
      let sp = this.speed[i] * speedOf[tiles[c]] * speedScale[i];     // streets are faster to walk on; a game may slow a person down
      if (room && crowd[c] > room) sp /= 1 + slow * (crowd[c] - room);   // too many on one cell: they get in each other's way
      let dx = 0, dy = 0, hold = false;
      if (fd) {
        if (!inWall) {
          const here = fd[li];
          if (here === 0 && exact) {                     // on the destination
            const b = mode === KIND ? (!this.ownField[a] && entryAt[c] >= 0 ? buildings[entryAt[c]] : null) : own;
            if (!b) {                                    // a plain destination tile: use it where we stand
              if (this.canUse && !this.canUse(i, a, c, this)) {    // a module refuses (taken, gone since the route was made): try again shortly
                this.blockAct[i] = a; this.blockUntil[i] = tick + tu.retryTicks; this.decide(i); continue;
              }
              using[i] = 1; timer[i] = 0; vx[i] = vy[i] = 0;
              if (this.onStart) this.onStart(i, a, this);
              continue;
            }
            if (mode === KIND && (b.tile !== this.kind[a] || !b.open)) { this.decide(i); continue; }   // the field is out of date
            if (mode !== KIND || b.customers < b.cap) {
              if (this.canStart && !this.canStart(i, a, b, this)) {   // a module refuses (cannot pay, nothing in stock): give up for a while
                this.blockAct[i] = a; this.blockUntil[i] = tick + tu.giveUpTicks; this.decide(i); continue;
              }
              this._enter(i, b, a); continue;
            }
            // Full: join the queue. It steps aside in a random direction so the doorway stays clear,
            // then stands until there is room (handled at the top of the loop).
            this.wait[i] = 1; this.queueAt[i] = b.id;
            const ang = this.rnd() * 6.2832;
            vx[i] = Math.cos(ang) * sp; vy[i] = Math.sin(ang) * sp;
          } else if (here !== INF && here !== 0) {       // downhill direction; solid cells count as uphill
            const to = world.links > 0 && fs === W ? world.linkTo[c] : -1;
            if (to >= 0 && fd[to] < here) {              // a link out of this cell leads nearer: stand on it until the step is made
              if (++this.ride[i] >= world.linkTicks[c]) {
                this.ride[i] = 0;
                px[i] = (to % W) + 0.3 + this.rnd() * 0.4; py[i] = ((to / W) | 0) + 0.3 + this.rnd() * 0.4;
                if (this.onLink) this.onLink(i, c, this);
              }
              vx[i] = vy[i] = 0; continue;
            }
            const up = here + STEP_COST, l = fd[li - 1], r = fd[li + 1], u = fd[li - fs], dn = fd[li + fs];
            dx = (l === INF ? up : l) - (r === INF ? up : r);
            dy = (u === INF ? up : u) - (dn === INF ? up : dn);
          }
        }
      } else if (direct) {                               // no route available: head straight for the door, stepping around obstacles
        if (detour[i] > 0) { detour[i]--; dx = detX[i]; dy = detY[i]; }
        else { dx = tx - x; dy = ty - y; }
      }
      else if (this.inPlace[a]) {                        // done on the spot
        using[i] = 1; timer[i] = 0; vx[i] = vy[i] = 0;
        if (this.onStart) this.onStart(i, a, this);
        continue;
      }
      else if (mode === NONE && street && !inWall) {     // idle: stroll along streets instead of drifting at random
        const here = street[c];
        // Outward offset from the agent's anchor. Past the leash, only moves that bring it back are allowed.
        const ox = x - anchorX[i], oy = y - anchorY[i], far = ox * ox + oy * oy > leash2;
        if (here === 0) {
          let ax = 0, ay = 0;                            // current heading, snapped to the grid
          const hx = vx[i], hy = vy[i];
          if (hx !== 0 || hy !== 0) { if (Math.abs(hx) >= Math.abs(hy)) ax = hx > 0 ? 1 : -1; else ay = hy > 0 ? 1 : -1; }
          const step = ax + ay * W;
          if (step !== 0 && street[c + step] === 0 && this.rnd() > 0.01 && !(far && ax * ox + ay * oy > 0)) { dx = ax; dy = ay; }   // keep going
          else {                                         // end of the street, a whim, or too far out: take another branch
            let px2 = 0, py2 = 0, m = 0;
            for (let k = 0; k < 4; k++) {
              const sdx = k === 0 ? -1 : k === 1 ? 1 : 0, sdy = k === 2 ? -1 : k === 3 ? 1 : 0, st = sdx + sdy * W;
              if (street[c + st] !== 0) continue;
              if (far ? sdx * ox + sdy * oy > 0 : st === -step) continue;        // not outward when far, not straight back otherwise
              if (this.rnd() * ++m < 1) { px2 = sdx; py2 = sdy; }
            }
            if (m > 0) { dx = px2; dy = py2; }
            else if (far) { dx = -ox; dy = -oy; }        // no street leads back: cut across
            else if (step !== 0 && street[c - step] === 0) { dx = -ax; dy = -ay; }   // dead end: turn back
          }
        } else if (far) { dx = -ox; dy = -oy; }          // wandered off: head back towards home
        else if (here < strollMax) {                     // a street is near: walk to it
          const up = here + STEP_COST, l = street[c - 1], r = street[c + 1], u = street[c - W], dn = street[c + W];
          dx = (l === INF ? up : l) - (r === INF ? up : r);
          dy = (u === INF ? up : u) - (dn === INF ? up : dn);
        }
      }

      if (!hold && dx === 0 && dy === 0) {             // idle, or nowhere to go: keep heading, sometimes turn
        dx = vx[i]; dy = vy[i];
        if ((dx === 0 && dy === 0) || this.rnd() < 0.02) { const ang = this.rnd() * 6.2832; dx = Math.cos(ang); dy = Math.sin(ang); }
      }
      if (!hold) { const len = Math.sqrt(dx * dx + dy * dy); dx = dx / len * sp; dy = dy / len * sp; }

      let sx = 0, sy = 0, seen = 0;                    // separation from neighbours in the 3×3 cells around
      if (!inWall) for (let row = -W; row <= W && seen < maxN; row += W) for (let o = -1; o <= 1; o++) {
        for (let j = head[c + row + o]; j >= 0 && seen < maxN; j = next[j]) {
          if (j === i) continue;
          const ex = x - px[j], ey = y - py[j], d2 = ex * ex + ey * ey;
          if (d2 >= sepR2) continue;
          seen++;
          if (d2 > 1e-6) {
            const dd = Math.sqrt(d2), w = (1 - dd / sepR) / dd * (using[j] ? 0.35 : 1);   // busy agents push less
            sx += ex * w; sy += ey * w;
          } else sx += i > j ? 0.3 : -0.3;
        }
      }

      let nvx = vx[i] + (dx + sx * sp * tu.sepPush - vx[i]) * tu.turn, nvy = vy[i] + (dy + sy * sp * tu.sepPush - vy[i]) * tu.turn;
      const sl = nvx * nvx + nvy * nvy, top = sp * 1.3;
      if (sl > top * top) { const k = top / Math.sqrt(sl); nvx *= k; nvy *= k; }

      // Positions are stored as 32-bit floats: round first, so the cell we test is the cell the agent will really be in.
      let nx = Math.fround(Math.min(W - 1.01, Math.max(1, x + nvx))), ny = y;   // one axis at a time = slide along obstacles
      if (!inWall) {
        const cx = x | 0, cy = y | 0;
        let ox = (nx | 0) - cx, hitX = false, hitY = false;
        if (solid[tiles[c + ox]]) { nx = x; nvx = 0; ox = 0; hitX = true; }
        ny = Math.fround(Math.min(H - 1.01, Math.max(1, y + nvy)));
        const oy = (ny | 0) - cy;
        if (solid[tiles[c + ox + oy * W]]) { ny = y; nvy = 0; hitY = true; }
        if (direct && (hitX || hitY)) {                  // walking straight and hit something: go along it for a while
          if (detour[i] > 0) { detX[i] = -detX[i]; detY[i] = -detY[i]; }   // the way round is blocked too: try the other way
          else if (hitX) { detX[i] = 0; detY[i] = ty - y >= 0 ? 1 : -1; }
          else { detX[i] = tx - x >= 0 ? 1 : -1; detY[i] = 0; }
          detour[i] = 20 + ((this.rnd() * 40) | 0);
        }
      } else ny = Math.min(H - 1.01, Math.max(1, y + nvy));             // a building was placed on top of it: walk out freely
      px[i] = nx; py[i] = ny; vx[i] = nvx; vy[i] = nvy;
    }
    this.routeUse[0] = nWin; this.routeUse[1] = nSec; this.routeUse[2] = nDir;
  }
}
