// Sides, and fights between them. Every agent type may belong to a side; agents of different sides that
// come within reach of each other fight where they stand. A fight is blows: every so often each fighter
// hits the nearest enemy in reach for about its strength, and a fighter whose health runs out is gone.
// Nothing is steered. How many can reach one enemy at once is decided by the room there is to stand in,
// so a narrow passage is a place a few can hold against many.
//
// The module keeps sides, health and who is fighting, holds fighters where they stand, and lets a game
// send in a wave of agents a few at a time. What the sides want (where they walk, what they take) is the
// game's business: that is ordinary actions and tasks.

/**
 * @param {object} d
 * @param {Record<string, string[]>} d.sides          side name → the agent types on it
 * @param {Record<string, {strength:number, health:number}>} d.fighters   per type; a type not listed cannot be hit and does not hit
 * @param {number} [d.reach=0.9]     how near, in cells, two enemies must be to fight
 * @param {number} [d.every=10]      ticks between blows
 * @param {number} [d.heal=0.05]     health a fighter out of any fight gets back each time blows are dealt (never above its type's)
 */
export function createFoes(d) {
  const F = {
    sim: null,
    /** Each agent's health, and 1 while it is in a fight. */
    health: null, engaged: null,
    /** Called with ('blow', cell) where a blow lands, and ('killed', agent, killer) just before a fighter is removed. */
    onEvent: null,
    /** How many of each side have been killed. */
    killed: {},
  };
  const sideNames = Object.keys(d.sides), reach = d.reach ?? 0.9, every = d.every ?? 10;
  let side = null, str = null, hp = null, pinX = null, pinY = null, waves = [], spots = {};

  /** The side agent i is on (a name), or null. */
  F.sideOf = i => (side[F.sim.type[i]] ? sideNames[side[F.sim.type[i]] - 1] : null);
  /** How many agents a side has right now. */
  F.count = name => { const s = sideNames.indexOf(name) + 1, sim = F.sim; let n = 0; for (let i = 0; i < sim.count; i++) if (side[sim.type[i]] === s) n++; return n; };
  /** The route to the nearest agent of a side, for an action's `at`. Ask before the simulation is built. */
  F.route = name => { if (!sideNames.includes(name)) throw new Error(`Unknown side "${name}"`); spots[name] ??= []; return '#side:' + name; };
  /**
   * Send in `count` agents of a type, one every `gap` ticks, at the cells given in turn. `init(i)` is called for each as it
   * arrives. They come in even if the game is busy; none comes once the simulation is full.
   */
  F.wave = ({ type, count, cells, gap = 15, init = null }) => { waves.push({ type, left: count, cells, gap, init, next: F.sim.tick, k: 0 }); };

  function setup(sim) {
    F.sim = sim; waves = []; F.killed = Object.fromEntries(sideNames.map(n => [n, 0]));
    side = new Uint8Array(sim.T); str = new Float32Array(sim.T); hp = new Float32Array(sim.T);
    sideNames.forEach((n, k) => { for (const t of d.sides[n]) side[sim.typeIndex(t)] = k + 1; });
    for (const [t, f] of Object.entries(d.fighters)) { str[sim.typeIndex(t)] = f.strength; hp[sim.typeIndex(t)] = f.health; }
    F.health = sim.addColumn('health', Float32Array, 0); F.engaged = sim.addColumn('engaged', Uint8Array, 0);
    pinX = sim.addColumn('pinX', Float32Array, 0); pinY = sim.addColumn('pinY', Float32Array, 0);
    for (const name of Object.keys(spots)) sim.world.addField('side:' + name, push => { for (const c of spots[name]) push(c); });
  }
  function onSpawn(i, opts, sim) { F.health[i] = hp[sim.type[i]]; F.engaged[i] = 0; }

  function blows(sim) {
    const N = sim.count, r2 = reach * reach, { px, py, type } = sim, health = F.health, engaged = F.engaged;
    const list = [];                                         // everyone who can fight
    for (let i = 0; i < N; i++) if (side[type[i]] && hp[type[i]] > 0 && sim.inside[i] < 0) list.push(i);
    const target = new Int32Array(N).fill(-1);
    // Only sides that are few need looking at closely: for each of them, who is in reach.
    for (const a of list) {
      let best = -1, bd = r2;
      for (const b of list) {
        if (side[type[b]] === side[type[a]]) continue;
        const dx = px[a] - px[b], dy = py[a] - py[b], dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = b; }
      }
      target[a] = best;
    }
    for (const a of list) {
      const was = engaged[a], now = target[a] >= 0 ? 1 : 0;
      if (now && !was) { pinX[a] = px[a]; pinY[a] = py[a]; }
      engaged[a] = now;
      if (!now) { if (health[a] < hp[type[a]]) health[a] = Math.min(hp[type[a]], health[a] + (d.heal ?? 0.05)); continue; }
      if (str[type[a]] <= 0) continue;
      health[target[a]] -= str[type[a]] * (0.6 + sim.rnd() * 0.8);
      if (F.onEvent) F.onEvent('blow', sim.cell[target[a]]);
    }
    for (const a of list) if (health[a] <= 0 && health[a] > -1e8) {
      health[a] = -1e9;                                      // counted once
      F.killed[sideNames[side[type[a]] - 1]]++;
      let by = -1; for (const b of list) if (target[b] === a) { by = b; break; }
      if (F.onEvent) F.onEvent('killed', a, by);
      sim.remove(a, 'a fight');
    }
    // where each side stands, for those who are sent to meet it
    for (const name of Object.keys(spots)) {
      const s = sideNames.indexOf(name) + 1, cells = new Set();
      for (const a of list) if (side[type[a]] === s) cells.add(sim.cell[a]);
      const now = [...cells].sort((x, y) => x - y), old = spots[name];
      if (now.length !== old.length || now.some((c, k) => c !== old[k])) { spots[name] = now; sim.world.fieldChanged('side:' + name); }
    }
  }
  function onTick(sim) {
    for (const w of waves) {
      if (sim.tick < w.next || w.left <= 0) continue;
      const c = w.cells[w.k++ % w.cells.length], i = sim.add((c % sim.world.w) + 0.5, ((c / sim.world.w) | 0) + 0.5, { type: w.type });
      w.left = i < 0 ? 0 : w.left - 1; w.next = sim.tick + w.gap;
      if (i >= 0 && w.init) w.init(i);
    }
    if (waves.length && waves.every(w => w.left <= 0)) waves = [];
    const { px, py, vx, vy } = sim, engaged = F.engaged;
    for (let i = 0; i < sim.count; i++) if (engaged[i]) { px[i] = pinX[i]; py[i] = pinY[i]; vx[i] = vy[i] = 0; }   // a fighter stands its ground
    if (sim.tick % every === 0) blows(sim);
  }

  /** Hand this to the engine: `modules: [foes.module, …]`. Health and who is fighting are columns of the simulation and are saved with it. */
  F.module = { name: 'foes', setup, onSpawn, onTick };
  return F;
}
