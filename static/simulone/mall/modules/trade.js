// Trade, as an engine module: a building sells to whoever is served there. Optional: the engine does not know it exists.
//
// The game says which actions are sales and what each costs the buyer. The module takes the money from the buyer's
// purse when they go in, refuses those who cannot pay, and keeps an account for every building: sales, takings,
// people turned away. With `stock`, a building also holds goods: each sale uses some, an empty shelf closes the
// building, and a delivery fills the shelves for a price.
//
// Where the money goes is the game's business (`income`), and so is what a price depends on (`price` is a function).
// Purses are a per-person column some other module keeps (visitors.js, beside this file, has one called `purse`).

/**
 * @param {object} def
 * @param {string[]} def.sells   names of the actions that are sales
 * @param {(i:number, action:string, building:object, sim) => number} def.price   what person i pays for that action there
 * @param {string} [def.purse='purse']   the per-person column the money comes from
 * @param {(i:number, sim) => boolean} [def.buyer]   does person i pay at all? (default: everyone)
 * @param {(amount:number, building:object) => void} [def.income]   where takings go
 * @param {(i:number, action:string, building:object, why:'price'|'stock') => void} [def.onRefuse]
 * @param {(i:number, action:string, building:object, amount:number) => void} [def.onSale]
 * @param {object} [def.stock]   leave out for buildings that never run out
 *        { room: (building) => number        how much it can hold (0: it holds none and never runs out)
 *          uses: (action, building) => number  goods one sale takes (default 1)
 *          cost: (building) => number        what one unit of goods costs when delivered
 *          start?: (building) => number      what a new building opens with (default: full)
 *          least?: (building) => number      with less than this on the shelf the building shuts (default 1): the goods its smallest sale takes }
 */
export function createTrade(def) {
  const purseName = def.purse ?? 'purse';
  let sim = null, sold = new Uint8Array(0), names = [];
  const fresh = () => ({ sales: 0, takings: 0, turned: 0, goods: 0, short: 0 });
  const T = { sim: null };

  /** A building's account: { day: { sales, takings, turned, goods (cost of what was sold), short (turned away for want of stock) }, all: the same since it was built }. */
  T.books = b => (b.books ??= { day: fresh(), all: fresh() });
  /** Is this action a sale? (name or index) */
  T.sells = a => !!sold[typeof a === 'number' ? a : sim.actionIndex(a)];
  /** What person i would pay for an action at a building (i may be -1: nobody in particular). */
  T.priceOf = (i, a, b) => def.price(i, typeof a === 'number' ? names[a] : a, b, sim);
  /** How much a building can hold, and holds: 0 room means it keeps no stock. */
  T.room = b => (def.stock ? Math.max(0, def.stock.room(b)) : 0);
  T.stockOf = b => b.stock ?? 0;
  const usesOf = (a, b) => (def.stock?.uses ? def.stock.uses(names[a], b) : 1);
  const shut = b => { const room = T.room(b); sim.world.setBlocked(b, room > 0 && (b.stock ?? 0) < (def.stock.least ? def.stock.least(b) : 1), 'stock'); };

  /**
   * Fill every building's shelves. `pay(cost, building)` is asked for each one: it may answer false to skip it (no money),
   * or a share between 0 and 1 to take only that much of the delivery. Returns { cost, units, skipped }.
   */
  T.deliver = (pay = () => true) => {
    const out = { cost: 0, units: 0, skipped: 0 };
    if (!def.stock) return out;
    for (const b of sim.world.buildings) {
      if (!b) continue;
      const room = T.room(b), want = Math.floor(room - (b.stock ?? 0));
      if (room <= 0 || want <= 0) continue;
      const answer = pay(want * def.stock.cost(b), b), share = answer === false ? 0 : typeof answer === 'number' ? Math.max(0, Math.min(1, answer)) : 1;
      const got = Math.floor(want * share);
      if (got <= 0) { out.skipped++; shut(b); continue; }
      b.stock = (b.stock ?? 0) + got; out.cost += got * def.stock.cost(b); out.units += got; shut(b);
    }
    return out;
  };
  /** Close the day's books: returns [{ building, sales, takings, turned, goods, short }] for every building that has an account, and starts a new day. */
  T.endDay = () => {
    const out = [];
    for (const b of sim.world.buildings) if (b && b.books) { out.push({ building: b, ...b.books.day }); b.books.day = fresh(); }
    return out;
  };
  /** Today's takings so far, over all buildings. */
  T.takings = () => { let v = 0; for (const b of sim.world.buildings) if (b && b.books) v += b.books.day.takings; return v; };

  function setup(s) {
    sim = T.sim = s; names = s.actions.map(a => a.name);
    sold = new Uint8Array(s.A); for (const n of def.sells) sold[s.actionIndex(n)] = 1;
  }
  const pays = i => !def.buyer || def.buyer(i, sim);
  function canStart(i, a, b) {
    if (!sold[a] || !pays(i)) return true;
    const books = T.books(b);
    if (T.room(b) > 0 && (b.stock ?? 0) < usesOf(a, b)) { books.day.short++; books.all.short++; if (def.onRefuse) def.onRefuse(i, names[a], b, 'stock'); return false; }
    const price = def.price(i, names[a], b, sim), purse = sim[purseName];
    if (purse && purse[i] < price) { books.day.turned++; books.all.turned++; if (def.onRefuse) def.onRefuse(i, names[a], b, 'price'); return false; }
    return true;
  }
  function onStart(i, a) {
    if (!sold[a] || sim.inside[i] < 0 || !pays(i)) return;
    const b = sim.world.buildings[sim.inside[i]], purse = sim[purseName];
    if (!b) return;
    const price = def.price(i, names[a], b, sim), amount = purse ? Math.min(price, purse[i]) : price, books = T.books(b);
    if (purse) purse[i] -= amount;
    let goods = 0;
    if (T.room(b) > 0) { const n = Math.min(b.stock ?? 0, usesOf(a, b)); b.stock = (b.stock ?? 0) - n; goods = n * def.stock.cost(b); shut(b); }
    for (const acct of [books.day, books.all]) { acct.sales++; acct.takings += amount; acct.goods += goods; }
    if (def.income) def.income(amount, b);
    if (def.onSale) def.onSale(i, names[a], b, amount);
  }
  function onPlace(b) { if (def.stock && T.room(b) > 0) { b.stock = def.stock.start ? def.stock.start(b) : T.room(b); shut(b); } }

  /** Hand this to the engine: `modules: [trade.module, …]`. Accounts and stock are kept on the buildings, so they are saved with them. */
  T.module = { name: 'trade', setup, canStart, onStart, onPlace };
  return T;
}
