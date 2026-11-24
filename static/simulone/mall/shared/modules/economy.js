// A generic economy, as an engine module. Optional: the engine does not know it exists.
//
// It is built on a game's existing needs, actions and buildings. You list the resources that exist and
// say what each action moves: "a meal uses 1 food and costs 1 coin", "a shift at a farm makes 8 food
// and pays 4 coins". From that the module keeps the books, refuses what cannot be paid for, closes
// what has run out, and lets wealth and scarcity steer decisions through the action matrix.
//
// There is no built-in notion of money. A resource that people can hold behaves as money; a resource
// held only by the town behaves as goods. List only the first kind for a money economy, only the
// second for a goods economy, or both.
//
// Accounts: the town has one store per resource. People have a pocket for each resource marked
// `people: true`; if it is also `pooled`, housed people share one purse per household.

/**
 * @param {object} def
 * @param {Record<string, {people?:boolean, pooled?:boolean, start?:{town?:number, person?:number}, low?:number, cap?:number|{base:number, per:Record<string, number>}}>} def.resources
 *        `low`: town stock under which the things that use it lose their pull (see `scarcity`)
 *        `cap`: the most the town store can hold: a number, or { base, per: { granary: 300 } } to add room for each such building.
 *        What is made beyond it is lost (counted in totals as `wasted`).
 * @param {Array<object>} def.flows  what actions move:
 *        { action, at?, when: 'start'|'finish', resource, amount, from, to, required? }
 *        `resource` may be a list: the flow then moves whichever of them `from` holds most of (a meal of what there is).
 *        from / to: 'person', 'town', or null (null = created from / used up into nothing)
 *        `at`: only when the action happens at this kind of building. `required` (start flows only): the action is
 *        refused if `from` cannot cover it; otherwise whatever is available moves.
 *        `reserve` (required flows from the town): leave this much in the store; the action is refused below amount + reserve.
 *        It may be a function () => number, for a reserve that changes (seed corn kept back until it is sown).
 *        `needsRoom` (flows into a capped town store): refuse the action, and close the place, while the store has no room for it.
 *        `amount` may be a function (person, building, sim) => number, for amounts that depend on the place or the
 *        moment (a field's harvest, a wage that follows a policy). Where there is no person or place to ask about
 *        (checking whether a building has run out), it is called with -1 and null.
 * @param {Record<string, Record<string, number>>} [def.costs]  what the town pays to build each prefab
 * @param {{resource:string, comfortable:number, feature?:string, workPull?:number, priceShy?:number, active?:() => boolean}} [def.wealth]
 *        makes a person-held resource an input to the matrix: `feature` (default 'poor') is 1 with nothing, 0 at `comfortable`.
 *        `active`: while it answers false nobody counts as poor (a settlement that does not use money yet).
 * @param {number} [def.scarcity=0.65]  how much an empty store lowers the pull of actions that use it (0 = off)
 */
export function createEconomy(def) {
  const names = Object.keys(def.resources);
  const R = def.resources;
  const E = {
    /** Town stores: `economy.town.food`. */
    town: {},
    /** Running totals per resource: made, used, and moved between accounts. */
    totals: Object.fromEntries(names.map(n => [n, { made: 0, used: 0, moved: 0, refused: 0, wasted: 0 }])),
    sim: null,
    pockets: {},            // resource -> Float32Array per person, for resources people hold
  };
  // flows that mention a resource this economy does not have are simply ignored, so one set of
  // definitions can drive a goods-only, a money-only or a full economy
  const flowDefs = (def.flows ?? []).map(f => Array.isArray(f.resource) ? { ...f, options: f.resource.filter(r => R[r]) } : f)
    .filter(f => f.options ? f.options.length : R[f.resource]);
  const wealth = def.wealth && R[def.wealth.resource]?.people ? { feature: 'poor', workPull: 0.25, priceShy: 0.08, ...def.wealth } : null;
  let flows = [];            // resolved against a simulation: action and place as indexes
  let startFlows = [], finishFlows = [], roomFlows = [], denyMask = 0;

  // ── accounts
  const purseOf = i => { const h = E.sim.home[i]; if (h < 0) return null; const b = E.sim.world.buildings[h]; return b ? (b.purse ??= {}) : null; };
  /** What person i can spend of a resource: their pocket plus, if pooled, their household's purse. */
  E.balance = (i, r) => {
    if (!R[r]?.people) return 0;
    let v = E.pockets[r][i];
    if (R[r].pooled) { const p = purseOf(i); if (p) v += p[r] ?? 0; }
    return v;
  };
  const takeFromPerson = (i, r, amount) => {            // pocket first, then the household purse; returns what was taken
    const pocket = E.pockets[r];
    let got = Math.min(pocket[i], amount);
    pocket[i] -= got;
    if (got < amount && R[r].pooled) { const p = purseOf(i); if (p && p[r] > 0) { const more = Math.min(p[r], amount - got); p[r] -= more; got += more; } }
    return got;
  };
  const giveToPerson = (i, r, amount) => {              // into the household purse if there is one, else the pocket
    const p = R[r].pooled ? purseOf(i) : null;
    if (p) p[r] = (p[r] ?? 0) + amount; else E.pockets[r][i] += amount;
  };
  const available = (who, i, r) => (who === 'town' ? E.town[r] : who === 'person' ? E.balance(i, r) : Infinity);

  // ── store limits
  const caps = {};
  /** The most the town store can hold of a resource right now (Infinity if it has no `cap`). */
  E.capOf = r => caps[r] ?? Infinity;
  function refreshCaps() {
    for (const n of names) {
      const c = R[n].cap;
      if (c === undefined) continue;
      if (typeof c === 'number') { caps[n] = c; continue; }
      let v = c.base ?? 0;
      for (const b of E.sim.world.buildings) if (b && c.per?.[b.name]) v += c.per[b.name];
      caps[n] = v;
    }
  }
  const intoStore = (r, amount) => {                    // returns what fitted; the rest is lost
    const fits = Math.max(0, Math.min(amount, E.capOf(r) - E.town[r]));
    E.town[r] += fits;
    if (fits < amount) E.totals[r].wasted += amount - fits;
    return fits;
  };

  // Which resource a flow moves this time: its own, or, for a list, the one `from` holds most of.
  const pick = (f, i) => {
    if (!f.options) return f.resource;
    let best = f.options[0], most = -Infinity;
    for (const r of f.options) { const v = available(f.from, i, r); if (v > most) { most = v; best = r; } }
    return best;
  };
  function apply(f0, i) {
    const f = f0.options ? { ...f0, resource: pick(f0, i) } : f0;
    let amount = amountOf(f, i, E.sim.inside[i] >= 0 ? E.sim.world.buildings[E.sim.inside[i]] : null);
    if (f.from === 'town') { amount = Math.min(amount, E.town[f.resource]); E.town[f.resource] -= amount; }
    else if (f.from === 'person') amount = takeFromPerson(i, f.resource, amount);
    if (!(amount > 0)) return;
    if (f.to === 'town') { if (f.from === null) amount = intoStore(f.resource, amount); else E.town[f.resource] += amount; }
    else if (f.to === 'person') giveToPerson(i, f.resource, amount);
    if (!(amount > 0)) return;
    const t = E.totals[f.resource];
    if (f.from === null) t.made += amount; else if (f.to === null) t.used += amount; else t.moved += amount;
  }
  const reserveOf = f => (typeof f.reserve === 'function' ? f.reserve() : f.reserve ?? 0);
  const amountOf = (f, i, b) => (typeof f.amount === 'function' ? f.amount(i, b ?? null, E.sim) : f.amount);
  const placeOf = i => { const b = E.sim.inside[i] >= 0 ? E.sim.world.buildings[E.sim.inside[i]] : null; return b ? b.tile : -1; };
  const applies = (f, a, place) => f.action === a && (f.place < 0 || f.place === place);

  // ── build costs
  /** What building this prefab costs the town: { resource: amount }. */
  E.costOf = prefab => Object.fromEntries(Object.entries(def.costs?.[prefab] ?? {}).filter(([r]) => R[r]));
  /** Can the town pay for this prefab? */
  E.canAfford = prefab => Object.entries(E.costOf(prefab)).every(([r, n]) => E.town[r] >= n);
  /** Take a prefab's cost from the town stores. Returns false (and takes nothing) if it cannot be covered. */
  E.charge = prefab => {
    if (!E.canAfford(prefab)) return false;
    for (const [r, n] of Object.entries(E.costOf(prefab))) { E.town[r] -= n; E.totals[r].used += n; }
    return true;
  };
  /** Total of a resource held by all people and households. */
  E.held = r => {
    if (!R[r]?.people) return 0;
    let v = 0;
    for (let i = 0; i < E.sim.count; i++) v += E.pockets[r][i];
    if (R[r].pooled) for (const b of E.sim.world.buildings) if (b && b.purse) v += b.purse[r] ?? 0;
    return v;
  };

  // ── what the engine config needs to know (merge these into the game's config)
  /** `features` and `weights` to merge into the engine config, so wealth is an input to the matrix. */
  E.config = { features: [], weights: {} };
  if (wealth) {
    E.config.features.push(wealth.feature);
    for (const f of flowDefs) {
      const w = (E.config.weights[f.action] ??= {});
      if (f.to === 'person' && f.resource === wealth.resource) w[wealth.feature] = wealth.workPull;            // being poor makes paid work attractive
      else if (f.from === 'person' && f.resource === wealth.resource && w[wealth.feature] === undefined) w[wealth.feature] = -wealth.priceShy;   // …and paid-for things less so
    }
  }

  // ── the module
  function setup(sim) {
    E.sim = sim;
    for (const n of names) {
      E.town[n] = R[n].start?.town ?? 0;
      E.totals[n] = { made: 0, used: 0, moved: 0, refused: 0, wasted: 0 };
      if (R[n].people) E.pockets[n] = sim.addColumn('pocket_' + n, Float32Array, 0);
    }
    flows = flowDefs.map(f => ({ ...f, action: sim.actionIndex(f.action), place: f.at ? sim.world.id(f.at) : -1, required: !!f.required && f.when === 'start' }));
    startFlows = flows.filter(f => f.when === 'start'); finishFlows = flows.filter(f => f.when === 'finish');
    roomFlows = flows.filter(f => f.needsRoom && f.to === 'town');
    denyMask = 0; for (const f of startFlows) if (f.required && f.from === 'person') denyMask |= 1 << f.action;
    refreshCaps();
  }

  function onSpawn(i, opts) {
    for (const n of names) if (R[n].people) E.pockets[n][i] = opts.newborn ? 0 : R[n].start?.person ?? 0;   // newborns own nothing
  }

  // Refuse entry when a required payment or supply cannot be covered.
  function canStart(i, a, b) {
    for (const f of startFlows) {
      if (!f.required || !applies(f, a, b.tile)) continue;
      const r = pick(f, i);
      if (available(f.from, i, r) < amountOf(f, i, b) + reserveOf(f)) { E.totals[r].refused++; return false; }
    }
    for (const f of roomFlows) if (applies(f, a, b.tile) && E.town[f.resource] + amountOf(f, i, b) > E.capOf(f.resource)) return false;   // nowhere to put what it would make
    return true;
  }
  function onStart(i, a) { const place = placeOf(i); for (const f of startFlows) if (applies(f, a, place)) apply(f, i); }
  function onFinish(i, a) { const place = placeOf(i); for (const f of finishFlows) if (applies(f, a, place)) apply(f, i); }

  function onTick(sim) {
    // Each person, a few at a time: what can they not afford, and how poor are they?
    const N = sim.count, poor = wealth ? sim.features[wealth.feature] : null;
    for (let i = sim.tick % 16; i < N; i += 16) {
      let deny = 0;
      for (const f of startFlows) if (f.required && f.from === 'person' && E.balance(i, pick(f, i)) < amountOf(f, i, null)) deny |= 1 << f.action;
      sim.deny[i] = (sim.deny[i] & ~denyMask) | deny;       // only the bits that are this module's: others may deny things too
      if (poor) poor[i] = wealth.active && !wealth.active() ? 0 : Math.max(0, Math.min(1, 1 - E.balance(i, wealth.resource) / wealth.comfortable));
    }
    // Buildings whose required supply has run out close until it is back.
    if (sim.tick % 32 === 0) {
      refreshCaps();
      for (const b of sim.world.buildings) {
        if (!b) continue;
        let out = false;
        for (const f of startFlows) if (f.required && f.from === 'town' && (f.place < 0 ? sim.kind[f.action] === b.tile : f.place === b.tile) && E.town[pick(f, -1)] < amountOf(f, -1, b) + reserveOf(f)) out = true;
        for (const f of roomFlows) if (f.place === b.tile && E.town[f.resource] + amountOf(f, -1, b) > E.capOf(f.resource)) out = true;
        sim.world.setBlocked(b, out, 'economy');
      }
    }
  }

  // Scarcity in the matrix: as a town store runs low, whatever draws on it pulls less, for everyone at once.
  function onRebuildMatrix(sim) {
    const k = def.scarcity ?? 0.65;
    if (!k) return;
    for (const f of startFlows) {
      const low = !f.options && R[f.resource].low;
      if (f.from !== 'town' || !low) continue;
      const factor = 1 - k * (1 - Math.min(1, E.town[f.resource] / low));
      if (factor >= 1) continue;
      for (let need = 0; need < sim.K; need++) if (sim.effects[f.action * sim.K + need] < 0)
        for (let t = 0; t < sim.T; t++) sim.live[t * sim.MA + need * sim.A + f.action] *= factor;
    }
  }

  /** Add to (or, with a negative amount, take from) a town store from outside any action: a reward, a gift, a fine. */
  E.give = (r, amount) => {
    if (!R[r]) return;
    if (amount > 0) { E.totals[r].made += intoStore(r, amount); return; }
    const v = Math.min(E.town[r], -amount);
    E.town[r] -= v; E.totals[r].used += v;
  };

  /** Put a resource people can hold into one person's hands (their household's purse if it is pooled). */
  E.pay = (i, r, amount) => { if (R[r]?.people && amount > 0) { giveToPerson(i, r, amount); E.totals[r].made += amount; } };

  // Building through the game: refused when the town cannot pay, charged when it is placed.
  const costWords = prefab => Object.entries(E.costOf(prefab)).map(([r, n]) => `${n} ${r}`).join(', ');
  function canBuild(prefab) { return E.canAfford(prefab) || `it takes ${costWords(prefab)}`; }
  function onPlace(b) { E.charge(b.name); refreshCaps(); }
  function onDemolish() { refreshCaps(); }

  // What a saved game keeps of the economy: the town stores and the running totals. People's pockets are per-person
  // values and household purses sit on the buildings, so both are saved with those.
  const save = () => ({ town: { ...E.town }, totals: JSON.parse(JSON.stringify(E.totals)) });
  function load(d) {
    if (d) { for (const n of names) { if (d.town?.[n] !== undefined) E.town[n] = d.town[n]; if (d.totals?.[n]) E.totals[n] = { ...E.totals[n], ...d.totals[n] }; } }
    refreshCaps();
  }

  /** Hand this to the engine: `modules: [economy.module, …]`. */
  E.module = { name: 'economy', save, load, setup, onSpawn, canStart, onStart, onFinish, onTick, onRebuildMatrix, canBuild, onPlace, onDemolish };
  return E;
}

/**
 * Read flows and build costs off a game's own definitions, so the economy is written where the buildings are.
 * On a building:
 *   serves: { action, uses: { food: 1 }, price: { money: 1 }, mustPay: true }   a visit uses town stock and costs the visitor
 *   makes:  { food: 8 }                    a finished work shift there adds to the town store
 *   wage:   { money: 4 }                   …and the town pays the worker (overrides the default wage)
 *   cost:   { materials: 20 }              what it costs the town to build
 * @param {{buildings: object[], work: string, wage?: Record<string, number>}} d  `work` is the name of the at-the-job action
 * @returns {{flows: object[], costs: object}}
 */
export function flowsFromDefinitions({ buildings, work, wage = {} }) {
  const flows = [], costs = {};
  for (const b of buildings) {
    if (b.cost) costs[b.name] = b.cost;
    if (b.serves) {
      // a visit cannot happen without its supplies; whether it can happen without payment is the building's choice
      for (const [r, n] of Object.entries(b.serves.uses ?? {})) flows.push({ action: b.serves.action, at: b.name, when: 'start', resource: r, amount: n, from: 'town', to: null, required: true });
      for (const [r, n] of Object.entries(b.serves.price ?? {})) flows.push({ action: b.serves.action, at: b.name, when: 'start', resource: r, amount: n, from: 'person', to: 'town', required: !!b.serves.mustPay });
    }
    if (b.jobs) {
      for (const [r, n] of Object.entries(b.makes ?? {})) flows.push({ action: work, at: b.name, when: 'finish', resource: r, amount: n, from: null, to: 'town' });
      for (const [r, n] of Object.entries(b.wage ?? wage)) flows.push({ action: work, at: b.name, when: 'finish', resource: r, amount: n, from: 'town', to: 'person' });
    }
  }
  return { flows, costs };
}
