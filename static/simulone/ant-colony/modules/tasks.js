// Work posted by the world. A task is a kind of work that is done at places the game names (a route, see
// world.addField): cells asking to be dug, piles asking to be moved. Nobody holds a task as a job. Every
// agent, each time it decides, weighs each task it is able to do against its needs and against the other
// tasks, takes the one that calls loudest, walks to the nearest place for it, does it, and decides again.
//
// The module turns a table of tasks into actions for the engine, keeps each agent from choosing tasks it
// cannot do right now, closes a task to newcomers once enough agents are on their way to it (those already
// on it carry on), and calls the game back when a task is done. It knows nothing about what the tasks are.

/**
 * @param {object} d
 * @param {Array<object>} d.tasks  each:
 *   { name, at: '#route', takes: ticks, color?,
 *     bias?: 0.3            how loudly it calls when nobody is on it (the matrix's bias for its action); a type may
 *                           have its own in its `weights: { [name]: { bias } }`
 *     open?(i, sim)         may agent i choose it at all right now? (hands free, carrying the right thing…)
 *     can?(i, cell, sim)    asked when i arrives at a place for it: false sends it away to try again shortly
 *     done(i, cell, sim)    i has finished it on that cell
 *     slots?(sim)           how many agents it has work for right now; with that many heading for it, nobody else may choose it }
 */
export function createTasks(d) {
  const tasks = d.tasks;
  let every = 8;
  const T = {
    sim: null,
    /** The engine actions for these tasks: spread them into the config's `actions`. */
    actions: tasks.map(t => ({ name: t.name, at: t.at, duration: Math.max(1, t.takes | 0), color: t.color })),
    /** Their default loudness, for the config's `weights`. */
    weights: Object.fromEntries(tasks.map(t => [t.name, { bias: t.bias ?? 0.3 }])),
    /** Per task, how many agents are heading for it or doing it (counted every few ticks). */
    heading: tasks.map(() => 0),
  };
  let byAction = [], index = [], mask = 0;
  const full = tasks.map(() => false), room = tasks.map(() => 0);

  /** Work out again which tasks agent i may choose. Call it when something about i changed that `open` depends on. */
  T.refresh = (i, leaving = false) => {
    const sim = T.sim; let deny = sim.deny[i] & ~mask;                 // only this module's bits are touched
    for (let k = 0; k < tasks.length; k++)
      if ((full[k] && (leaving || sim.action[i] !== index[k])) || (tasks[k].open && !tasks[k].open(i, sim))) deny |= 1 << index[k];
    sim.deny[i] = deny >>> 0;
  };
  /** { task name: agents heading for it or doing it }. */
  T.doing = () => Object.fromEntries(tasks.map((t, k) => [t.name, T.heading[k]]));

  function setup(sim) {
    T.sim = sim; byAction = new Array(sim.A).fill(null); mask = 0; every = sim.tuning.decideEvery;
    index = tasks.map(t => sim.actionIndex(t.name));
    tasks.forEach((t, k) => { byAction[index[k]] = t; mask |= 1 << index[k]; });
    at.length = 0; for (let a = 0; a < sim.A; a++) at.push(index.indexOf(a));
    mask >>>= 0;
  }
  function onSpawn(i) { T.refresh(i); }
  const at = [];                                             // action index → task index, or -1
  // Who is heading where is counted every tick, and each agent's choices are worked out on the tick before it next
  // decides: a task must close before the whole crowd has set off for it.
  function count(sim) {
    T.heading.fill(0);
    for (let i = 0; i < sim.count; i++) { const k = at[sim.action[i]]; if (k >= 0) T.heading[k]++; }
    if (sim.tick % 8 === 0) for (let k = 0; k < tasks.length; k++) if (tasks[k].slots) room[k] = tasks[k].slots(sim);   // how much work there is changes slowly
    for (let k = 0; k < tasks.length; k++) full[k] = tasks[k].slots ? T.heading[k] >= room[k] : false;
  }
  function onTick(sim) {
    count(sim);
    for (let i = (sim.tick + 1) % every; i < sim.count; i += every) T.refresh(i);
  }
  function canUse(i, a, cell, sim) {
    const t = byAction[a];
    if (!t) return true;
    return (!t.open || t.open(i, sim)) && (!t.can || t.can(i, cell, sim));
  }
  function onFinish(i, a, sim) {
    const t = byAction[a];
    if (!t) return;
    t.done(i, sim.cell[i], sim);
    T.refresh(i, true);                                       // it has left the task: a full one does not take it straight back
  }
  /** Hand this to the engine: `modules: [tasks.module, …]`. */
  T.module = { name: 'tasks', setup, onSpawn, onTick, canUse, onFinish };
  return T;
}
