// A region: several maps under one game. Not a hook module: the simulation runs one map at a time,
// and this keeps the others.
//
// For every land it holds what is needed to come back to it (a saved game) and what is needed to let it
// carry on while nobody is looking: its stores, and a "book" of what each season of the year has lately
// added to or taken from them. Once a season the whole region moves on together:
//   - every settled land that is not being played gets that season's entry from its book
//   - standing orders take goods from their source and put them on the road
//   - what was on the road long enough arrives
// The land being played is reached through two functions the game gives (take from / add to its live
// stores), so the same bookkeeping covers it.
//
// It knows nothing about what the stores hold or what a land is like: a land's definition is the game's.

const FORMAT = 1;

/**
 * @param {object} def
 * @param {Array<{id:string}>} def.lands     every land there is, held or not; anything else on them is the game's
 * @param {string} def.first                 the land the game starts on
 * @param {number} [def.seasonsOnTheRoad=1]  how long goods take between two lands
 * @param {number} [def.maxOrders=3]         standing orders one land can send
 * @param {{key:string}} [def.storage]       keep the region in the browser's storage under this key
 */
export function createRegion(def) {
  const byId = new Map(def.lands.map(l => [l.id, l]));
  const fresh = () => ({ season: 0, tick: 0, active: def.first, orders: [], road: [], nextOrder: 1, shared: {},
    lands: Object.fromEntries(def.lands.map(l => [l.id, { held: l.id === def.first, settled: l.id === def.first, stores: {}, caps: {}, book: {}, people: 0, info: {}, snapshot: null }])) });
  const R = {
    /** Called with (kind, detail): 'arrived' { to, goods }, 'short' { land, resource, wanted, sent } (an order its source could not fill). */
    onEvent: null,
    state: fresh(),
  };
  const emit = (kind, detail) => { if (R.onEvent) R.onEvent(kind, detail); };
  const land = id => { const s = R.state.lands[id]; if (!s) throw new Error(`Unknown land "${id}"`); return s; };

  /** A land's definition, and its state: { held, settled, stores, caps, book, people, info, snapshot }. */
  R.def = id => byId.get(id);
  R.land = land;
  Object.defineProperty(R, 'active', { get: () => R.state.active });
  /** The lands the player holds, as [{ def, state, active }]. */
  R.held = () => def.lands.filter(l => R.state.lands[l.id].held).map(l => ({ def: l, state: R.state.lands[l.id], active: l.id === R.state.active }));
  R.isHeld = id => land(id).held;
  /** The player now holds this land (granted, or bought). Returns false if they already did. */
  R.hold = id => { const s = land(id); if (s.held) return false; s.held = true; return true; };
  /** A held land gets its first settlement, with these stores to start from. */
  R.settle = (id, stores = {}) => { const s = land(id); s.held = true; s.settled = true; s.stores = { ...stores }; };

  /**
   * Keep the land being played as it is now, before leaving it (and whenever the game is saved):
   * its saved game, its stores and their limits, how many live there, and anything else worth showing in a list.
   */
  R.keep = (id, { snapshot, stores, caps = {}, people = 0, info = {}, tick }) => {
    const s = land(id);
    s.snapshot = snapshot; s.stores = { ...stores }; s.caps = { ...caps }; s.people = people; s.info = { ...info };
    if (tick !== undefined) R.state.tick = tick;
  };
  /** Go to another land. Returns its state: load `snapshot` (if it has one) and then set its stores to `stores`, which have moved on since. */
  R.enter = id => { const s = land(id); if (!s.held) throw new Error(`Land "${id}" is not held`); R.state.active = id; return s; };

  /** What one season did to the stores of the land being played: { resource: net change }. It is what that land will do by itself when left. */
  R.record = (id, season, net) => { land(id).book[season] = { ...net }; };

  // ── goods between lands
  const clampInto = (s, r, n) => { const room = (s.caps[r] ?? Infinity) - (s.stores[r] ?? 0), fits = Math.max(0, Math.min(n, room)); s.stores[r] = (s.stores[r] ?? 0) + fits; return fits; };
  /**
   * Put goods on the road now. `take(resource, amount)` removes them from where they are and returns what it got
   * (the game's own function for the land being played). Returns the goods actually sent.
   */
  R.send = (from, to, goods, take, atSeasonEnd = false) => {
    const sent = {};
    for (const [r, n] of Object.entries(goods)) { const got = take(r, n); if (got > 0) sent[r] = got; }
    // sent in the middle of a season, it sets out when that season ends
    if (Object.keys(sent).length) R.state.road.push({ from, to, goods: sent, arrives: R.state.season + (def.seasonsOnTheRoad ?? 1) + (atSeasonEnd ? 0 : 1) });
    return sent;
  };
  /** A standing order: every season, send these goods from one land to another. Returns its id, or null if the land already sends as many as it may. */
  R.order = (from, to, goods) => {
    if (R.state.orders.filter(o => o.from === from).length >= (def.maxOrders ?? 3)) return null;
    const id = R.state.nextOrder++;
    R.state.orders.push({ id, from, to, goods: { ...goods } });
    return id;
  };
  R.cancel = id => { R.state.orders = R.state.orders.filter(o => o.id !== id); };
  /** What is on the road to a land: [{ from, goods, seasons (until it arrives) }]. */
  R.coming = to => R.state.road.filter(x => x.to === to).map(x => ({ from: x.from, goods: x.goods, seasons: Math.max(1, x.arrives - R.state.season) }));

  /**
   * A season has ended, everywhere. `ended` is its name; `live` reaches the land being played:
   * { take(resource, amount) => taken, give(resource, amount) => taken in }.
   * Returns what happened: { arrived: [{ to, goods }], short: [{ land, resource, wanted, sent }], lean: [{ land, resource }] }.
   */
  R.endSeason = (ended, live) => {
    const S = R.state, out = { arrived: [], short: [], lean: [] };
    S.season++;
    // lands nobody is looking at: the season's entry in their book
    for (const l of def.lands) {
      const s = S.lands[l.id];
      if (!s.settled || l.id === S.active) continue;
      for (const [r, n] of Object.entries(s.book[ended] ?? {})) {
        if (n >= 0) clampInto(s, r, n);
        else { const had = s.stores[r] ?? 0; s.stores[r] = Math.max(0, had + n); if (had + n < 0) out.lean.push({ land: l.id, resource: r }); }
      }
    }
    // what arrives
    const still = [];
    for (const x of S.road) {
      if (x.arrives > S.season) { still.push(x); continue; }
      const got = {};
      for (const [r, n] of Object.entries(x.goods)) { const fits = x.to === S.active ? live.give(r, n) : clampInto(S.lands[x.to], r, n); if (fits > 0) got[r] = fits; }
      out.arrived.push({ to: x.to, from: x.from, goods: got }); emit('arrived', { to: x.to, from: x.from, goods: got });
    }
    S.road = still;
    // standing orders set out
    for (const o of S.orders) {
      const src = S.lands[o.from];
      if (!src?.settled || !S.lands[o.to]?.settled) continue;
      const take = o.from === S.active ? live.take : (r, n) => { const got = Math.min(n, Math.floor(src.stores[r] ?? 0)); src.stores[r] = (src.stores[r] ?? 0) - got; return got; };
      const sent = R.send(o.from, o.to, o.goods, take, true);
      for (const [r, n] of Object.entries(o.goods)) if ((sent[r] ?? 0) < n) { const miss = { land: o.from, resource: r, wanted: n, sent: sent[r] ?? 0 }; out.short.push(miss); emit('short', miss); }
    }
    return out;
  };

  // ── keeping it
  /** The whole region as plain data, saved games of every land included. */
  R.save = () => ({ format: FORMAT, ...JSON.parse(JSON.stringify(R.state)) });
  /** Take it back. Lands the data does not know (added to the game since) start as new. Returns false if it is not a region save. */
  R.load = data => {
    if (!data || data.format !== FORMAT) return false;
    const base = fresh();
    R.state = { ...base, ...data, lands: { ...base.lands } };
    delete R.state.format;
    for (const l of def.lands) if (data.lands?.[l.id]) R.state.lands[l.id] = { ...base.lands[l.id], ...data.lands[l.id] };
    if (!R.state.lands[R.state.active]?.held) R.state.active = def.first;
    return true;
  };
  /** Start the region over: only the first land, nothing saved. */
  R.reset = () => { R.state = fresh(); };
  R.write = () => { if (!def.storage?.key) return false; try { localStorage.setItem(def.storage.key, JSON.stringify(R.save())); return true; } catch { return false; } };
  R.read = () => { if (!def.storage?.key) return false; try { const s = localStorage.getItem(def.storage.key); return s ? R.load(JSON.parse(s)) : false; } catch { return false; } };
  R.clear = () => { try { if (def.storage?.key) localStorage.removeItem(def.storage.key); } catch { /* nothing to forget */ } };
  return R;
}
