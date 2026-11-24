// Whole lives, as an engine module. Optional: the engine only lets a game keep its own values per
// person, add and remove people, move them between homes, and run code every tick. What health is,
// what kills, who has children and who leaves is decided here, from the numbers a game passes in.
//
//   - health: needs left desperate (and harmful activities) wear it down; at nothing the person dies
//   - mood: how well needs have been met lately, lower without a home or a job
//   - old age: each person has a lifespan of their own
//   - names and kin: everyone has a record that outlives them (name, parents, partner, children, when and how
//     they died), so a game can show a family tree
//   - once a day: the long unhappy may leave, a household with two adults and a free bed may have a
//     child, and people move house so that households keep forming

const EVERY = 8;                 // each person's health and mood are updated every this many ticks (spread over ticks)

/**
 * @param {object} d  the numbers (all durations in ticks):
 *   needs:      [{ name, kills?, gloom }]     how long a desperate need takes to kill, and how much it weighs on mood
 *   desperate:  need level that counts as desperate
 *   recovery:   time to regain full health once nothing is hurting
 *   harmfulActions: { 'action name': timeToKill }   activities that wear health down while performed
 *   slowestWhenIll: walking speed at zero health, as a fraction of normal
 *   moodFollows: how quickly mood catches up with circumstances
 *   homelessGloom, joblessGloom: mood lost for having no home / being able to work and having no job
 *   lifespan, lifespanSpread, startAges: [from, to]
 *   family:     { from, to, chancePerNight, moodNeeded }
 *   emigration: { moodBelow, after, chancePerDay }
 *   day:        ticks in a day (births, departures and house moves are decided once a day)
 *   gloomOf:    (person) => number   optional: mood taken off for the game's own reasons (poverty, short rations); negative lifts it
 *   names:      { given: [...] or { f: [...], m: [...] }, family: [...] }   optional; without it people are numbered
 * People added with sim.add may carry `family: 'Name'` (a household arriving together); otherwise a person takes the
 * family name of the house they first live in.
 * @returns {{ module: object, stats: object, onEvent: Function|null, health, mood, unhappy, lifespan }}
 */
export function createLives(d) {
  const L = {
    /** Running totals. */
    stats: { births: 0, left: 0, moves: 0, deaths: {} },
    /** Set to (kind, person, detail) => … to hear about 'born' (detail = the house) and 'gone' (detail = the cause). */
    onEvent: null,
    sim: null, health: null, mood: null, unhappy: null, lifespan: null,
    /** Everyone who has ever lived here, by person id: { id, given, family, sex, born (tick), died (tick or null), cause, parents: [ids], partner: id or null, children: [ids] }. */
    records: [],
    /** Per person: their id in `records` (a person's slot in the simulation changes; this does not). */
    pid: null,
  };
  let familiesUsed = 0;
  const given = d.names?.given, families = d.names?.family ?? [];
  /** A family name nobody has yet (they repeat with a number once the list runs out). */
  L.newFamily = () => { const k = familiesUsed++; return families.length ? families[k % families.length] + (k >= families.length ? ' ' + (1 + Math.floor(k / families.length)) : '') : 'family ' + (k + 1); };
  /** The record of the person in slot i. */
  L.person = i => { const r = L.records[L.pid[i]]; if (r && r.family === null) settleName(i, r); return r; };
  /** The slot of a living person by id, or -1. */
  L.slotOf = id => { for (let i = 0; i < L.sim.count; i++) if (L.pid[i] === id) return i; return -1; };
  /** "Given Family". */
  L.nameOf = r => (r ? `${r.given} ${r.family ?? ''}`.trim() : '');
  /** A person's kin as records: { partner, parents, children, siblings }. */
  L.kin = r => ({
    partner: r.partner !== null ? L.records[r.partner] : null, parents: r.parents.map(id => L.records[id]), children: r.children.map(id => L.records[id]),
    siblings: [...new Set(r.parents.flatMap(id => L.records[id].children))].filter(id => id !== r.id).map(id => L.records[id]),
  });
  // Someone who came without a family name takes that of the house they live in.
  function settleName(i, r) {
    const h = L.sim.home[i], b = h >= 0 ? L.sim.world.buildings[h] : null;
    if (b) r.family = b.family ??= L.newFamily();
  }
  let harm, gloom, gloomSum, actionHarm;

  // Plugged into a simulation: add this game's per-person values to it.
  function setup(sim) {
    L.sim = sim;
    L.stats = { births: 0, left: 0, moves: 0, deaths: {} };
    L.records = []; familiesUsed = 0;
    L.pid = sim.addColumn('pid', Int32Array, -1);
    L.health = sim.addColumn('health', Float32Array, 1);            // 1 = well, 0 = dead
    L.mood = sim.addColumn('mood', Float32Array, 0.8);              // 1 = content, 0 = miserable
    L.unhappy = sim.addColumn('unhappy', Float32Array, 0);          // ticks spent with something badly wrong
    L.lifespan = sim.addColumn('lifespan', Float32Array, Infinity); // the age at which this person dies of old age
    harm = new Float32Array(sim.K); gloom = new Float32Array(sim.K).fill(1);
    for (const n of d.needs) { const k = sim.needIndex(n.name); harm[k] = n.kills ? 1 / n.kills : 0; gloom[k] = n.gloom ?? 1; }
    gloomSum = gloom.reduce((x, y) => x + y, 0);
    actionHarm = new Float32Array(sim.A);
    for (const [name, kills] of Object.entries(d.harmfulActions ?? {})) actionHarm[sim.actionIndex(name)] = 1 / kills;
  }

  // ── a person appears
  function onSpawn(i, opts, sim) {
    L.lifespan[i] = d.lifespan * (1 + (sim.rnd() * 2 - 1) * d.lifespanSpread);
    const sex = sim.rnd() < 0.5 ? 'f' : 'm', list = Array.isArray(given) ? given : given?.[sex];
    const r = { id: L.records.length, given: list?.length ? list[(sim.rnd() * list.length) | 0] : '#' + (L.records.length + 1), family: opts.family ?? null, sex,
                born: sim.tick, died: null, cause: null, parents: opts.parents ?? [], partner: null, children: [] };
    L.records.push(r); L.pid[i] = r.id;
    for (const id of r.parents) L.records[id].children.push(r.id);
    if (opts.newborn) { for (let k = 0; k < sim.K; k++) sim.needsOf[i * sim.K + k] = 0.2; return; }   // born fed and rested
    // the town opens with people of all ages
    sim.setAge(i, Math.min(L.lifespan[i] * 0.95, d.startAges[0] + sim.rnd() * (d.startAges[1] - d.startAges[0])));
    r.born = sim.tick - Math.round(sim.age[i]);
  }

  // ── every tick: health, mood, old age
  function onTick(sim) {
    const N = sim.count, K = sim.K, { needsOf, age, home, job, type, using, action } = sim;
    const { health, mood, unhappy, lifespan } = L;
    for (let i = sim.tick % EVERY; i < N; i += EVERY) {
      const n = i * K;
      // health: desperate needs (and harmful activities such as sleeping in the open) wear it down; otherwise it mends
      let hurt = using[i] ? actionHarm[action[i]] : 0, worst = -1, worstLevel = 0, sad = 0, unmet = false;
      for (let k = 0; k < K; k++) {
        const v = needsOf[n + k];
        if (v >= d.desperate) {
          unmet = true;
          if (harm[k] > 0) { hurt += harm[k]; if (v * harm[k] > worstLevel) { worstLevel = v * harm[k]; worst = k; } }
        }
        sad += gloom[k] * v * v;
      }
      if (hurt > 0) {
        health[i] -= hurt * EVERY;
        if (health[i] <= 0) { sim.remove(i, worst >= 0 ? sim.needs[worst].name : 'exposure'); continue; }
      } else if (health[i] < 1) health[i] = Math.min(1, health[i] + EVERY / d.recovery);
      sim.speedScale[i] = d.slowestWhenIll + (1 - d.slowestWhenIll) * health[i];     // the ill walk slowly
      // mood: how well life is going, smoothed
      let target = 1 - sad / gloomSum;
      if (home[i] < 0) target -= d.homelessGloom;
      if (job[i] < 0 && sim.types[type[i]].works) target -= d.joblessGloom;
      if (d.gloomOf) target -= d.gloomOf(i);
      mood[i] += (Math.max(0, Math.min(1, target)) - mood[i]) * Math.min(1, EVERY / d.moodFollows);
      // time spent with something badly wrong: a desperate need, no home, or plain misery. It drains away when life is in order.
      if (unmet || home[i] < 0 || mood[i] < d.emigration.moodBelow) unhappy[i] += EVERY;
      else if (unhappy[i] > 0) unhappy[i] = Math.max(0, unhappy[i] - EVERY);
      // old age
      if (age[i] >= lifespan[i]) sim.remove(i, 'old age');
    }
    if (sim.tick % d.day === d.day - 1) daily(sim);
  }

  // ── once a day: the miserable may leave, households may have a child, and people move house
  function daily(sim) {
    const N = sim.count, B = sim.world.buildings, F = d.family;
    for (let i = 0; i < N; i++) {
      if (L.unhappy[i] > d.emigration.after && sim.rnd() < d.emigration.chancePerDay) sim.remove(i, 'left');
    }
    // A house with at least two residents of child-bearing age, a free bed and good enough spirits may have a child.
    const fertile = new Int32Array(B.length), spirits = new Float32Array(B.length);
    const ofAge = i => sim.age[i] >= F.from && sim.age[i] < F.to;
    for (let i = 0; i < N; i++) { const h = sim.home[i]; if (h >= 0 && ofAge(i)) { fertile[h]++; spirits[h] += L.mood[i]; } }
    for (const b of B) {
      if (!b || b.beds === 0 || fertile[b.id] < 2 || b.residents >= b.beds) continue;
      if (spirits[b.id] / fertile[b.id] < F.moodNeeded || sim.rnd() >= F.chancePerNight) continue;
      // the parents: two of the household of that age, a couple already if there is one
      const adults = []; for (let k = 0; k < N; k++) if (sim.home[k] === b.id && ofAge(k)) adults.push(L.person(k));
      const one = adults.find(r => r.partner !== null && adults.some(o => o.id === r.partner)) ?? adults.find(r => r.partner === null) ?? adults[0];
      const other = adults.find(r => r.id === one.partner) ?? adults.find(r => r !== one && r.partner === null) ?? adults.find(r => r !== one);
      if (one.partner === null && other.partner === null) { one.partner = other.id; other.partner = one.id; }
      const i = sim.add(b.ex + 0.5, b.ey + 0.5, { age: 0, home: b, newborn: true, family: one.family, parents: [one.id, other.id] });   // born on the doorstep, living there
      if (i < 0) break;
      L.stats.births++; fertile[b.id] = -99;                    // one child per house per night; not a place to move into today
      if (L.onEvent) L.onEvent('born', i, b);
    }
    // Households re-form, or the town would slowly stop having children:
    //   - someone of child-bearing age living with no one else of that age moves in with another such person
    //   - when a house is full and holds three or more of them (children who have grown up), one moves out
    const free = b => b && b.beds > 0 && b.residents < b.beds;
    const nearest = (i, ok) => {
      let best = null, bd = Infinity;
      for (const b of B) if (free(b) && b.id !== sim.home[i] && ok(b)) { const dx = sim.px[i] - b.cx, dy = sim.py[i] - b.cy, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = b; } }
      return best;
    };
    const move = (i, to) => { fertile[sim.home[i]]--; fertile[to.id]++; sim.moveHome(i, to); L.stats.moves++; };
    for (let i = 0; i < N; i++) {
      const h = sim.home[i];
      if (h < 0 || !ofAge(i)) continue;
      if (fertile[h] === 1) { const to = nearest(i, b => fertile[b.id] === 1); if (to) move(i, to); }
      else if (fertile[h] >= 3 && B[h].residents >= B[h].beds) {
        const to = nearest(i, b => fertile[b.id] === 1) ?? nearest(i, b => fertile[b.id] === 0 && b.residents === 0);
        if (to) move(i, to);
      }
    }
  }

  // ── a person is about to disappear
  function onGone(i, cause, sim) {
    if (cause === 'left') L.stats.left++; else L.stats.deaths[cause] = (L.stats.deaths[cause] ?? 0) + 1;
    const r = L.records[L.pid[i]]; if (r) { r.died = sim.tick; r.cause = cause; }
    if (L.onEvent) L.onEvent('gone', i, cause);
  }

  /** Hand this to the engine: `modules: [lives.module, …]`. */
  // Health, mood and the rest are per-person values, saved with the people; only the running totals are this module's own.
  L.module = { name: 'lives', setup, onSpawn, onTick, onGone,
    save: () => JSON.parse(JSON.stringify({ stats: L.stats, records: L.records, familiesUsed })),
    load: s => { if (s?.stats) L.stats = { ...L.stats, ...s.stats }; if (s?.records) { L.records = s.records; familiesUsed = s.familiesUsed ?? 0; } } };
  return L;
}
