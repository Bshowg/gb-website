// Staff, as an engine module: people who come in for a shift, work it in the building that hired them, and go home.
// Optional: the engine does not know it exists.
//
// The game says how many posts a building has and when a shift runs. The player (or the game) hires up to that many.
// While a shift runs the module keeps that many staff at each building: they appear at a gate, walk to their building
// and work there (the engine's own jobs: a building with posts is shut with nobody, and holds fewer customers when
// short-handed). When the shift ends they finish what they are doing, walk to the way out and are gone.
// It counts the time each building's staff were on shift, so the game can pay them.
// The work action may be as long as a shift: when the shift ends, whoever is at work is made to finish at once.
//
// Some staff do not work inside the building that hired them: they walk the place (cleaners, guards). The game names
// a type for those (`roam`); they are the building's staff in every other way, and what they do out there is up to the
// game's actions and that type's weights.

/**
 * @param {object} def
 * @param {string} def.type        the engine type staff are while on shift (it must have `works: true`)
 * @param {string} def.offType     the type they become when the shift is over (`works: false`)
 * @param {string|string[]} def.leave   the action(s) that take them out
 * @param {(sim) => Array<[number, number]>} def.gates   the cells they appear on
 * @param {(building) => number} def.posts      how many staff a building wants (0: it needs none)
 * @param {(sim) => boolean} def.onDuty         is a shift running now?
 * @param {(building, sim) => number} [def.turnOut]   how many of a building's hired staff come in today (asked once, when
 *        the shift starts or the building is first staffed that shift; default: all of them)
 * @param {(building) => string|null} [def.roam]   the engine type of a building's staff if they walk the place instead of
 *        working inside it (a type with `works: false`), or null. Their building is kept in `sim.target`.
 * @param {number} [def.start]     how many a new building has hired (default: all its posts)
 * @param {number} [def.every=16]  ticks between looks
 */
export function createStaff(def) {
  const every = def.every ?? 16, leaveNames = [].concat(def.leave);
  let sim = null, world = null, flag = null, leaveMask = 0, onType = 0, offType = 0, duty = false;
  const roamOf = b => (def.roam ? def.roam(b) : null);
  const ROAM = 3, LEAVING = 5;                                // 5 = let go in the middle of their work: home as soon as they are out                                            // flag: 1 = on shift inside a building, 3 = on shift walking the place, 2 = going home
  const S = {
    sim: null,
    /** How many staff are in (on shift, or on their way out). */
    count: 0,
  };
  const postsOf = b => Math.max(0, def.posts(b) | 0);
  /** How many staff a building has hired (never more than its posts). */
  S.hired = b => Math.min(postsOf(b), b.hired ?? def.start ?? postsOf(b));
  /** Hire or let go: set how many staff a building has. Returns the number it now has. */
  S.hire = (b, n) => { b.hired = Math.max(0, Math.min(postsOf(b), n | 0)); delete b.turnOut; world.version++; look(true); return b.hired; };
  /** How many of a building's staff are in today (hired, less those who did not come). */
  S.today = b => (duty ? Math.min(S.hired(b), b.turnOut ?? S.hired(b)) : 0);
  /** How many are at work inside a building right now. */
  S.present = b => { let n = 0; for (let i = 0; i < sim.count; i++) if ((flag[i] === 1 && sim.inside[i] === b.id && sim.using[i]) || (flag[i] === ROAM && sim.target[i] === b.id)) n++; return n; };
  /** Is person i on shift (inside a building or walking the place)? */
  S.is = i => flag[i] === 1 || flag[i] === ROAM;
  /** Is a shift running? */
  S.onDuty = () => duty;
  /** Close the books: [{ building, ticks }] of time on shift since the last call, for every building that had any. */
  S.endDay = () => {
    const out = [];
    for (const b of world.buildings) if (b && b.shiftTicks > 0) { out.push({ building: b, ticks: b.shiftTicks }); b.shiftTicks = 0; }
    return out;
  };
  /** Time on shift so far today at one building, in ticks. */
  S.ticksToday = b => b.shiftTicks ?? 0;

  const goHome = i => { flag[i] = 2; sim.setType(i, offType); sim.job[i] = -1; sim.target[i] = -1; sim.deny[i] = ~leaveMask; };
  // Bring every building's staff in line with what it should have right now.
  function look(now) {
    const B = world.buildings, have = new Map();
    const was = duty;
    duty = !!def.onDuty(sim);
    for (let i = 0; i < sim.count; i++) {
      if (flag[i] !== 1 && flag[i] !== ROAM) continue;
      const post = flag[i] === ROAM ? sim.target[i] : sim.job[i], b = post >= 0 ? B[post] : null;
      // shift over, or the place is gone: home, once out of the door (someone at work is made to finish now, however long the work action is)
      if (!duty || !b) { if (!sim.using[i] || sim.inside[i] < 0) goHome(i); else sim.timer[i] = 65534; continue; }
      const n = (have.get(b.id) ?? 0) + 1;
      if (n > S.today(b)) { if (!sim.using[i]) goHome(i); else { flag[i] = LEAVING; sim.timer[i] = 65534; } continue; }   // one too many (someone was let go)
      have.set(b.id, n);
      b.shiftTicks = (b.shiftTicks ?? 0) + (now ? 0 : every);
    }
    let changed = was !== duty;
    const gates = duty ? def.gates(sim) : [];
    for (const b of B) {
      if (!b) continue;
      const posts = postsOf(b);
      if (!posts) continue;
      if (duty && b.turnOut === undefined) b.turnOut = def.turnOut ? Math.max(0, Math.min(S.hired(b), def.turnOut(b, sim) | 0)) : S.hired(b);
      if (!duty) delete b.turnOut;
      const want = S.today(b), roam = roamOf(b), jobs = want > 0 && !roam ? posts : 0;
      if (b.jobs !== jobs) { b.jobs = jobs; changed = true; }
      if (!roam) world.setBlocked(b, want === 0, 'staff');  // nobody to open it
      for (let k = have.get(b.id) ?? 0; k < want && gates.length; k++) {
        const g = gates[(sim.rnd() * gates.length) | 0];
        if (sim.add(g[0] + 0.3 + sim.rnd() * 0.4, g[1] + 0.3 + sim.rnd() * 0.4, { type: roam ?? onType, staff: b.id, roams: !!roam }) < 0) break;
      }
    }
    if (changed) world.version++;
  }

  function setup(s) {
    sim = S.sim = s; world = s.world; duty = false; S.count = 0;
    flag = s.addColumn('staff', Uint8Array, 0);              // 1 = on shift, 2 = going home
    onType = s.typeIndex(def.type); offType = s.typeIndex(def.offType);
    leaveMask = 0; for (const n of leaveNames) leaveMask |= 1 << s.actionIndex(n);
  }
  function onSpawn(i, opts) {
    flag[i] = 0;
    if (opts.staff === undefined) return;
    flag[i] = opts.roams ? ROAM : 1; S.count++;
    if (opts.roams) sim.target[i] = opts.staff; else sim.job[i] = opts.staff;
    sim.deny[i] = leaveMask;
    sim.needsOf.fill(0, i * sim.K, (i + 1) * sim.K);
  }
  function onTick(s) { if (s.tick % every === 0) look(false); }
  function onStart(i, a) { if (flag[i] === 2 && (leaveMask >> a) & 1) { flag[i] = 0; S.count--; sim.remove(i, 'home'); } }
  function onFinish(i) { if (flag[i] === LEAVING || (flag[i] === 1 && (!duty || sim.job[i] < 0)) || (flag[i] === ROAM && !duty)) goHome(i); }
  function onGone(i) { if (flag[i]) { flag[i] = 0; S.count--; } }
  function onPlace(b) { if (postsOf(b)) { b.hired = def.start ?? postsOf(b); look(true); } }

  /** Hand this to the engine: `modules: [staff.module, …]`. What a building has hired is kept on it, so it is saved with the map. */
  S.module = { name: 'staff', setup, onSpawn, onTick, onStart, onFinish, onGone, onPlace,
    save: () => ({ duty }),
    load(d, s) { duty = !!d?.duty; S.count = 0; for (let i = 0; i < s.count; i++) if (flag[i]) S.count++; } };
  return S;
}
