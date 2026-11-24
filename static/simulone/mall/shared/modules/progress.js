// The player's progress, as an engine module. Optional: the engine does not know it exists.
//
// Everything here is a condition on a stat. A stat is a named number about the whole game ("population",
// "built.nursery", "xp"). A condition is data: { stat: 'population', atLeast: 100 }. Levels, unlocks,
// achievements and goals are the same thing with different consequences, and a game supplies them as tables.
//
// Stats come from three places:
//   counters  added to by events. Most are kept for you (see `count` below); a game adds its own with progress.add().
//   gauges    functions the game gives, sampled about once a second: sim => sim.count.
//   peaks     every gauge `g` also has `g.max`, the highest it has been.
//
// Three lifetimes. A stat, achievement or unlock belongs to the run (this map: gone when a new game is made), to the
// game (shared by every map of one game: a region's lands), or to the profile (kept from one game to the next, and
// stored on the device if `storage` is given). Conditions can read any of them.
//
// The module draws nothing. It answers questions (isUnlocked, levelInfo, achievements, goal) and calls
// onEvent when something is earned; the page shows it however it likes.

const SAVE_VERSION = 1;

/**
 * @param {object} def
 * @param {Record<string, (sim) => number>} [def.gauges]   sampled stats; each also gets a `.max`
 * @param {Record<string, {scope?: 'run'|'game'|'profile', start?: number}>} [def.stats]   only for stats that need a scope or a start value
 * @param {object} [def.game]   where 'game' scope lives: a plain object the game keeps and saves itself (a region's `shared`),
 *        handed to the progress of every map so they all see the same values. Without it, 'game' means the run.
 * @param {object|false} [def.count]   counters kept from engine events; all on by default, set one to false to drop it:
 *        { actions: 'done.<action>', born: 'born' and 'born.<type>' (newborns only), died: 'died' and 'died.<cause>',
 *          built: 'built' and 'built.<prefab>', removed: 'removed' and 'removed.<prefab>', laid: 'laid.<tile>' (cells) }
 * @param {Array<{title?:string, when:object, reward?:object}> | {stat:string, at:number[]}} [def.levels]
 *        a list: the player starts at level 1 and each entry is the step to the next level, taken in order.
 *        or { stat: 'xp', at: [100, 250, 600] }: level 2 at 100, level 3 at 250…
 * @param {Record<string, number>} [def.xp]   experience paid per unit a counter grows: { born: 5, built: 20 } (into the stat 'xp')
 * @param {Array<{id:string, when?:object, text?:string, scope?:string}>} [def.unlocks]
 *        the things that start locked. Anything not listed is unlocked. Without `when`, only a reward unlocks it.
 * @param {Array<{id:string, title?:string, text?:string, when:object, reward?:object, scope?:string}>} [def.achievements]
 *        earned once; scope 'profile' by default
 * @param {Array<{id:string, title?:string, text?:string, when:object, reward?:object, addedLater?:boolean}>} [def.goals]
 *        one at a time, in order: the goal shown is the first one not yet met. A save keeps the met ones by id, so goals
 *        can be put anywhere in the list later. Mark a goal put in after games were already saved with `addedLater: true`:
 *        saves from before 0.3.1, which only kept how many goals were met, then still come back to the right goal.
 * @param {(resource:string, amount:number) => void} [def.grant]   how a reward's `grant` reaches the game (e.g. economy.give)
 * @param {boolean} [def.lockBuilds=true]   refuse building a prefab whose name is a locked id
 * @param {number} [def.every=30]           ticks between samples and checks
 * @param {{key:string}} [def.storage]      keep the profile in the browser's storage under this key
 *
 * Conditions: { stat, atLeast } · { stat, atMost } · { level: n } · { achieved: id } · { unlocked: id } · { all: [...] } · { any: [...] }
 * Rewards:    { xp: 50, grant: { twigs: 30 }, unlock: 'guard post' | [...], add: { stat: n } }
 */
export function createProgress(def = {}) {
  const count = def.count === false ? {} : { actions: true, born: true, died: true, built: true, removed: true, laid: true, ...def.count };
  const every = def.every ?? 30;
  const declared = def.stats ?? {};
  const levelSteps = Array.isArray(def.levels) ? def.levels : null;
  const levelCurve = def.levels && !levelSteps ? def.levels : null;
  const unlockDefs = def.unlocks ?? [], achDefs = def.achievements ?? [], goalDefs = def.goals ?? [];
  const lockOf = new Map(unlockDefs.map(u => [u.id, u]));
  const scopeOfItem = (d, fallback) => d.scope ?? fallback;

  const fresh = () => ({ stats: {}, unlocked: {}, achieved: {}, goals: {} });
  const P = {
    /** Called with (kind, item): 'level' { level, title }, 'unlocked' { id }, 'achieved' (the achievement), 'goal' (the goal just met). */
    onEvent: null,
    /** The player's level in this run, from 1. */
    level: 1,
    sim: null,
  };
  let run = fresh(), profile = fresh(), goalIndex = 0, dirty = true, profileDirty = false, actionStat = [];

  // ── stats
  const shared = def.game ? Object.assign(def.game, { stats: def.game.stats ?? {}, unlocked: def.game.unlocked ?? {}, achieved: def.game.achieved ?? {} }) : null;
  const bagFor = scope => (scope === 'profile' ? profile : scope === 'game' && shared ? shared : run);
  const bagOf = name => bagFor(declared[name]?.scope);
  /** The value of a stat (0 if it has never been touched). */
  P.get = name => name === 'level' ? P.level : bagOf(name).stats[name] ?? declared[name]?.start ?? 0;
  /** Set a stat. */
  P.set = (name, v) => {
    const bag = bagOf(name), old = P.get(name);
    if (v === old) return;
    bag.stats[name] = v; dirty = true;
    if (bag === profile) profileDirty = true;
    if (def.xp?.[name] && v > old) P.add('xp', (v - old) * def.xp[name]);
  };
  /** Add to a counter. */
  P.add = (name, n = 1) => P.set(name, P.get(name) + n);
  /** Every stat that has a value, as { name: value }. */
  P.all = () => ({ ...Object.fromEntries(Object.keys(declared).map(n => [n, P.get(n)])), ...run.stats, ...(shared?.stats ?? {}), ...profile.stats, level: P.level });

  // ── conditions
  /** Is the condition met right now? */
  P.met = c => {
    if (!c) return true;
    if (c.all) return c.all.every(P.met);
    if (c.any) return c.any.some(P.met);
    if (c.level !== undefined) return P.level >= c.level;
    if (c.achieved !== undefined) return P.hasAchieved(c.achieved);
    if (c.unlocked !== undefined) return P.isUnlocked(c.unlocked);
    const v = P.get(c.stat);
    return (c.atLeast === undefined || v >= c.atLeast) && (c.atMost === undefined || v <= c.atMost);
  };
  /**
   * How far along a condition is: { done, ratio (0..1), parts: [{ label, value, target, done }] }.
   * `parts` lists the simple conditions inside it, for showing "63 / 100".
   */
  P.progress = c => {
    const parts = [];
    const walk = c => {
      if (!c) return 1;
      if (c.all) { const r = c.all.map(walk); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 1; }
      if (c.any) return Math.max(0, ...c.any.map(walk));
      let label, value, target, flag = false;
      if (c.level !== undefined) { label = 'level'; value = P.level; target = c.level; }
      else if (c.achieved !== undefined) { label = c.achieved; value = P.hasAchieved(c.achieved) ? 1 : 0; target = 1; flag = true; }
      else if (c.unlocked !== undefined) { label = c.unlocked; value = P.isUnlocked(c.unlocked) ? 1 : 0; target = 1; flag = true; }
      else { label = c.label ?? c.stat; value = P.get(c.stat); target = c.atLeast ?? c.atMost; }
      const done = P.met(c);
      parts.push({ label, value, target, done, flag, atMost: c.atLeast === undefined && c.atMost !== undefined });
      return done ? 1 : c.atLeast ? Math.max(0, Math.min(1, value / c.atLeast)) : 0;
    };
    const ratio = walk(c);
    return { done: P.met(c), ratio, parts };
  };
  /** A condition in words: "population 63/100, built.nursery 0/1". A part's `label` replaces the stat name. */
  P.describe = c => P.progress(c).parts.map(p => p.atMost ? `${p.label} at most ${p.target}` : p.flag ? p.label
    : `${p.label} ${Math.min(p.target, Math.floor(p.value))}/${p.target}`).join(', ');

  // ── unlocks, achievements, goals, levels
  /** Is this thing available to the player? Anything not listed in `unlocks` always is. */
  P.isUnlocked = id => !lockOf.has(id) || !!run.unlocked[id] || !!profile.unlocked[id] || !!shared?.unlocked[id];
  P.hasAchieved = id => !!run.achieved[id] || !!profile.achieved[id] || !!shared?.achieved[id];
  const emit = (kind, item) => { if (P.onEvent) P.onEvent(kind, item); };

  /** Unlock something now, whatever its condition. */
  P.unlock = id => {
    const u = lockOf.get(id);
    if (!u || P.isUnlocked(id)) return;
    const bag = bagFor(scopeOfItem(u, 'run'));
    bag.unlocked[id] = true; dirty = true; if (bag === profile) profileDirty = true;
    emit('unlocked', u);
  };
  /** Hand out a reward: { xp, grant: { resource: n }, unlock: id | [ids], add: { stat: n } }. */
  P.reward = r => {
    if (!r) return;
    if (r.xp) P.add('xp', r.xp);
    if (r.add) for (const [s, n] of Object.entries(r.add)) P.add(s, n);
    if (r.grant && def.grant) for (const [res, n] of Object.entries(r.grant)) def.grant(res, n);
    if (r.unlock) for (const id of [].concat(r.unlock)) P.unlock(id);
  };

  /** Look at everything that could have been earned. Runs by itself about once a second and after each build. */
  P.check = () => {
    // one thing earned can complete another (a level unlocks, an unlock is a goal), so go round until nothing moves
    for (let pass = 0; pass < 8 && dirty; pass++) {
      dirty = false;
      if (levelCurve) {
        const xp = P.get(levelCurve.stat ?? 'xp');
        while (P.level - 1 < levelCurve.at.length && xp >= levelCurve.at[P.level - 1]) { P.level++; dirty = true; emit('level', { level: P.level }); }
      } else if (levelSteps) {
        while (P.level - 1 < levelSteps.length && P.met(levelSteps[P.level - 1].when)) {
          const step = levelSteps[P.level - 1];
          P.level++; dirty = true;
          emit('level', { level: P.level, title: step.title, reward: step.reward });
          P.reward(step.reward);
        }
      }
      for (const u of unlockDefs) if (u.when && !P.isUnlocked(u.id) && P.met(u.when)) P.unlock(u.id);
      for (const a of achDefs) if (!P.hasAchieved(a.id) && P.met(a.when)) {
        const bag = bagFor(scopeOfItem(a, 'profile'));
        bag.achieved[a.id] = true; dirty = true; if (bag === profile) profileDirty = true;
        emit('achieved', a); P.reward(a.reward);
      }
      for (seekGoal(); goalIndex < goalDefs.length && P.met(goalDefs[goalIndex].when); seekGoal()) {
        const g = goalDefs[goalIndex]; run.goals[g.id] = true; dirty = true;
        emit('goal', g); P.reward(g.reward);
      }
    }
    if (profileDirty) { profileDirty = false; store(); }
  };

  /** Raise the level to `n` now, whatever the conditions say, with each step's reward on the way (a game's own trigger, or a test). */
  P.setLevel = n => {
    while (levelSteps && P.level < n && P.level - 1 < levelSteps.length) {
      const step = levelSteps[P.level - 1];
      P.level++;
      emit('level', { level: P.level, title: step.title, reward: step.reward });
      P.reward(step.reward);
    }
    if (levelCurve) P.level = Math.max(P.level, Math.min(n, levelCurve.at.length + 1));
    dirty = true; P.check();
  };

  /** Where the player stands: { level, max, title, next: { title, when, progress, text } | null }. */
  P.levelInfo = () => {
    if (levelCurve) {
      const at = levelCurve.at, stat = levelCurve.stat ?? 'xp', from = P.level >= 2 ? at[P.level - 2] : 0, to = at[P.level - 1];
      const when = to === undefined ? null : { stat, atLeast: to }, v = P.get(stat);
      return { level: P.level, max: at.length + 1, title: null,
        next: when && { when, text: `${stat} ${Math.floor(v)}/${to}`, progress: { done: false, ratio: Math.max(0, Math.min(1, (v - from) / (to - from))), parts: P.progress(when).parts } } };
    }
    const steps = levelSteps ?? [], step = steps[P.level - 1];
    return { level: P.level, max: steps.length + 1, title: P.level >= 2 ? steps[P.level - 2].title ?? null : null,
      next: step ? { title: step.title ?? null, when: step.when, reward: step.reward, progress: P.progress(step.when), text: P.describe(step.when) } : null };
  };
  /** The locked things: [{ id, unlocked, text, progress }], in the order given. */
  P.unlocks = () => unlockDefs.map(u => ({ id: u.id, unlocked: P.isUnlocked(u.id), text: u.text ?? (u.when ? P.describe(u.when) : ''), progress: u.when ? P.progress(u.when) : null }));
  /** All achievements: [{ id, title, text, done, progress }]. */
  P.achievements = () => achDefs.map(a => ({ id: a.id, title: a.title ?? a.id, text: a.text ?? P.describe(a.when), reward: a.reward, done: P.hasAchieved(a.id), progress: P.progress(a.when) }));
  // The goal the player is on: the first in the list not yet met.
  function seekGoal() { goalIndex = 0; while (goalIndex < goalDefs.length && run.goals[goalDefs[goalIndex].id]) goalIndex++; }
  /** The goal the player is on, with its progress, or null when all are met. `n` of `of`. */
  P.goal = () => {
    seekGoal();
    const g = goalDefs[goalIndex];
    return g ? { ...g, title: g.title ?? g.id, n: goalIndex + 1, of: goalDefs.length, progress: P.progress(g.when), text: g.text ?? P.describe(g.when) } : null;
  };

  // ── keeping it
  /** The player's progress as plain data: { v, profile, run }. `run` only makes sense together with a saved game. */
  P.save = () => ({ v: SAVE_VERSION, profile: structuredCloneSafe(profile), run: { ...structuredCloneSafe(run), level: P.level } });
  /**
   * Take progress back from save(). By default only the profile part; pass { run: true } when the game itself is restored
   * too, and { profile: false } to leave the profile as it is (a saved game should not undo what was earned since).
   */
  P.load = (data, opts = {}) => {
    if (!data || data.v !== SAVE_VERSION) return false;
    if (opts.profile !== false) profile = { ...fresh(), ...structuredCloneSafe(data.profile ?? {}) };
    if (opts.run && data.run) {
      run = { ...fresh(), ...structuredCloneSafe(data.run) }; P.level = data.run.level ?? 1;
      if (!data.run.goals) {          // a save from before 0.3.1 kept only how many goals were met, counted in the list as it was then
        run.goals = {};
        goalDefs.filter(g => !g.addedLater).slice(0, data.run.goal ?? 0).forEach(g => { run.goals[g.id] = true; });
      }
      delete run.level; delete run.goal; seekGoal();
    }
    dirty = true;
    return true;
  };
  /** Forget the profile too (and what is stored on the device). */
  P.resetProfile = () => { profile = fresh(); dirty = true; store(); };
  function store() {
    if (!def.storage?.key) return;
    try { localStorage.setItem(def.storage.key, JSON.stringify({ v: SAVE_VERSION, profile })); } catch { /* private window, storage blocked: play on without it */ }
  }
  function restore() {
    if (!def.storage?.key) return;
    try { const s = localStorage.getItem(def.storage.key); if (s) P.load(JSON.parse(s)); } catch { /* nothing stored, or not readable */ }
  }

  // ── the module
  function sample(sim) {
    for (const [name, fn] of Object.entries(def.gauges ?? {})) {
      const v = fn(sim);
      P.set(name, v);
      if (v > P.get(name + '.max')) P.set(name + '.max', v);
    }
  }
  function setup(sim) {
    P.sim = sim;
    run = fresh(); P.level = 1; goalIndex = 0; dirty = true;      // a new game is a new run; the profile carries on
    restore();
    actionStat = sim.actions.map(a => 'done.' + a.name);
  }
  function onTick(sim) {
    if (sim.tick % every) return;
    sample(sim);
    if (dirty) P.check();
  }
  function onFinish(i, a) { P.add(actionStat[a]); }
  function onSpawn(i, opts, sim) { if (opts?.newborn) { P.add('born'); P.add('born.' + sim.types[sim.type[i]].name); } }
  function onGone(i, cause) { P.add('died'); P.add('died.' + cause); }
  // Building happens while the simulation is stopped, so these check at once instead of waiting for a tick.
  function onPlace(b, sim) { P.add('built'); P.add('built.' + b.name); sample(sim); P.check(); }
  function onDemolish(b, sim) { P.add('removed'); if (b) P.add('removed.' + b.name); sample(sim); P.check(); }
  function onLine(tile, n, sim) { P.add('laid.' + tile, n); sample(sim); P.check(); }
  function canBuild(prefab) {
    if (P.isUnlocked(prefab)) return true;
    const u = lockOf.get(prefab);
    return 'locked' + (u.text ? `: ${u.text}` : u.when ? `: needs ${P.describe(u.when)}` : '');
  }

  /** Hand this to the engine: `modules: [progress.module, …]`. Put it before an economy, so "locked" is the answer before "cannot pay". */
  P.module = { name: 'progress', setup, onTick, save: () => P.save(), load: d => { P.load(d, { run: true, profile: false }); },
    ...(count.actions && { onFinish }), ...(count.born && { onSpawn }), ...(count.died && { onGone }),
    ...(count.built && { onPlace }), ...(count.removed && { onDemolish }), ...(count.laid && { onLine }),
    ...(def.lockBuilds !== false && { canBuild }) };
  return P;
}

const structuredCloneSafe = o => JSON.parse(JSON.stringify(o));
