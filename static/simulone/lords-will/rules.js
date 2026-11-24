// The rules that are this game's own, as an engine module. The numbers come from hamlet.js.
//
//   - The farming year. A field is sown in spring, one shift at a time, and each cell sown takes seed
//     from the store. It grows through the summer with nobody working it. In autumn it is reaped, one
//     shift at a time, and each cell reaped adds grain. What is still standing when winter comes is lost.
//     A field only has work to offer while there is something to do on it, so farmers are free for other
//     jobs the rest of the year. While any field does have work, every other workplace keeps only one
//     pair of hands: at sowing and at harvest the whole settlement goes to the fields.
//   - Water. A house with a well near enough has water in it: its people drink at home. The rest walk to a well.
//   - Seed corn. Through winter and spring, the grain the fields still need to be sown is kept back from the table,
//     so a hungry winter cannot also cost the next harvest.
//   - The cold. The need for warmth only builds up in the cold part of the year.
//   - Woodcutters need trees. A lodge's yield follows how much forest is within its reach.
//   - Someone with no home eats from the store where they stand, while there is anything in it.
//   - Newcomers. At the start of the arrival season, while spirits are high and beds stand empty, families walk in.
//   - The levy. From the village stage, when autumn ends the lord takes a share of the year's harvest from the store.
//     What cannot be paid is owed next year on top, and his regard for the steward falls.
//   - Faith. The need for it only builds up from the village stage.
//   - Coin. When the settlement reaches the charter's stage, the treasury and every person are given their first coin.
//     From then on what is owed on the levy and cannot be paid in grain is taken in coin.
//   - Fire. A burning building is out of use, may set light to its neighbours, and after a while is either saved
//     (water or the watch was near) or lost.
//   - The chartered town: whether a guildhall is open (the trades then make and are paid more), the fair's fees,
//     plague (while it lasts anyone may be struck; two blows close together kill; a hospital halves the chance),
//     men sent to the lord's war, and the lord's regard, which raises the levy when it is low.
//   - Events from outside change some of these numbers while they last (a hard winter, a bad harvest).
//   - The season's report: what was made and used, who was born, who died and of what.

/**
 * @param {object} d
 * @param {object} d.calendar, d.economy       the modules of this game
 * @param {{sowPerShift, reapPerShift, seedPerCell, yieldPerCell, colors}} d.farming
 * @param {string} d.field, d.work, d.roughMeal   names from the game's definitions
 * @param {Record<string, number>} d.meal      what a meal takes (its first resource is the grain that is sown and reaped)
 * @param {string} d.cold                      the need
 * @param {Record<string, number>} d.coldBySeason   how fast it builds up in each season, as a share of its rate
 * @param {string[]} d.coldDeaths              causes of death that make a winter unkind
 * @param {{prefab, tree, reach, treesForFull}} d.woodcutters
 * @param {{season, moodAbove, families, size, at:[number, number]}} [d.arrivals]   who walks in, when, and where they appear;
 *        `families` may be a list by stage (the first entry for stage 1)
 * @param {Record<string, number>} d.food      what counts as food, and how many meals a measure of each is worth
 * @param {{action, from: string[], amount}} [d.pottage]  a meal of any of these: denied while the store has none of them
 * @param {number} d.mealsADay                 meals a person eats in a day (for counting days of food)
 * @param {(i:number) => number} [d.moodOf]    a person's mood, 0..1 (for arrivals)
 * @param {() => string} [d.newFamily]         a family name for a household that arrives
 * @param {() => number} d.stage               the settlement's stage (1 = hamlet, 2 = village…)
 * @param {(name:string) => number} d.mod      the factor events put on 'cold' and 'yield' right now
 * @param {{need, fromStage}} d.faith
 * @param {{action, resource, amount}} d.bread   the better meal: not on offer while there is none
 * @param {{season, share, fromStage, standing:{start, paid, short}}} d.levy
 * @param {{resource, fromStage, charter, toEachPerson}} d.coin
 * @param {(i:number, resource:string, amount:number) => void} d.pay   put coin in a person's hands
 * @param {{every, burns, spreadReach, spreadChance, wellReach, savedByWell, watchReach, savedByWatch, fireproof:string[], well, watch}} d.fire
 * @param {string} d.guild                     the prefab whose being open means the trades are guilded
 * @param {{chancePerHour, strike, hospital, withHospital}} d.plague
 * @param {() => Float32Array} d.health        each person's health, 0..1 (for plague)
 * @param {{below, levyShare}} d.disfavour     under this regard the lord takes this share instead
 * @param {{action, well, reach}} d.water      the drink-at-home action, and how near a well must be to a house
 * @param {number} [d.soil=1]                  how much this land's fields give, against ordinary farmland
 * @param {(name:string, value:number) => void} d.stat    set a stat (progress)
 * @param {(name:string, n:number) => void} d.count       add to a stat
 */
export function createHamletRules(d) {
  const { calendar, economy, farming: F } = d, grain = Object.keys(d.meal)[0];
  const R = {
    sim: null,
    /** Called with ('season', report) when a season ends, ('field', building) when a field is fully sown or reaped, ('arrived', n) for newcomers. */
    onEvent: null,
    /** What has happened so far this season: { season, year, born, arrived, left, deaths: { cause: n }, sown, reaped, lost }. */
    season: null,
    /** The report of the season that last ended (what onEvent('season') was given). */
    lastSeason: null,
    /** This year's farming so far. */
    year: { sown: 0, harvested: 0 },
    winters: 0, kindWinters: 0,
    /** The lord: his regard for the steward (0-100), grain still owed from earlier years, levies paid in full and how many running. */
    standing: d.levy.standing.start, debt: 0, leviesPaid: 0, levyStreak: 0,
    /** True once the charter's coin has been handed out. */
    chartered: false,
    /** True while a guildhall is open. */
    guilded: false,
  };
  let HOMEWATER = -1;
  let POTTAGE = -1;
  let BREAD = -1, FAITH = -1, faithRate = 0, lastStage = 1;
  let WORK = -1, ROUGH = -1, COLD = -1, fieldTile = -1, lodgeTile = -1, treeTile = -1, coldRate = 0, totalsAtStart = null, hardDeaths = 0;

  const bump = () => { R.sim.world.version++; };          // jobs or colours changed: reassign work and repaint
  const setCrop = (b, crop) => { b.crop = crop; b.color = F.colors[crop]; b.ground = 'field_' + crop; };   // `ground`: the texture the art has for it
  const offerWork = (b, yes) => { b.jobs = yes ? b.maxJobs : 0; };
  // Everyone to the fields: while a field has work, the other workplaces are cut down to `keep` jobs each.
  function callToFields() {
    const B = R.sim.world.buildings, busy = B.some(b => b && b.tile === fieldTile && b.jobs > 0);
    for (const b of B) if (b && b.tile !== fieldTile && b.prefab.jobs > 0) b.jobs = busy ? Math.min(b.prefab.jobs, d.fieldsFirst?.keep ?? b.prefab.jobs) : b.prefab.jobs;
    R.fieldWork = busy;
  }

  // ── fields
  function initField(b) {
    b.maxJobs = b.jobs; b.sown = 0; b.reaped = 0;
    setCrop(b, 'fallow');
    offerWork(b, calendar.seasonName === 'spring');       // marked out after spring: it waits for the next one
  }
  /** Every field, with its state: { building, crop, area, sown, reaped }. */
  R.fields = () => R.sim.world.buildings.filter(b => b && b.tile === fieldTile).map(b => ({ building: b, crop: b.crop, area: b.area, sown: b.sown, reaped: b.reaped }));
  /** Cells of field in all, sown, and reaped. */
  R.farmland = () => { const t = { fields: 0, area: 0, sown: 0, reaped: 0 }; for (const f of R.fields()) { t.fields++; t.area += f.area; t.sown += f.sown; t.reaped += f.reaped; } return t; };

  // ── woodcutters
  /** How much of a full shift's yield a lodge centred on this cell would make (0..1), from the forest in reach. */
  R.woodYield = (x, y, r = d.woodcutters.reach, full = d.woodcutters.treesForFull) => {
    const w = R.sim.world;
    let trees = 0;
    for (let j = Math.max(1, Math.floor(y - r)); j <= Math.min(w.h - 2, Math.ceil(y + r)); j++)
      for (let i = Math.max(1, Math.floor(x - r)); i <= Math.min(w.w - 2, Math.ceil(x + r)); i++)
        if (w.tiles[j * w.w + i] === treeTile && (i - x) * (i - x) + (j - y) * (j - y) <= r * r) trees++;
    return Math.min(1, trees / full);
  };

  // Buildings that were there before this module saw them placed (the starting map) are picked up here.
  function adopt() {
    let changed = false;
    const wells = R.sim.world.buildings.filter(b => b && b.name === d.water.well);
    for (const b of R.sim.world.buildings) {
      if (!b) continue;
      if (b.beds) b.water = wells.some(w => Math.hypot(w.cx - b.cx, w.cy - b.cy) <= d.water.reach);
      if (b.tile === fieldTile && b.crop === undefined) { initField(b); changed = true; }
      else if (b.prefab.job?.reach && b.yield === undefined) b.yield = R.woodYield(b.cx, b.cy, b.prefab.job.reach, b.prefab.job.treesForFull);
      if (b.prefab.job?.seasons) R.sim.world.setBlocked(b, b.prefab.job.seasons[calendar.seasonName] === 0, 'season');   // a garden in winter
    }
    if (changed) { callToFields(); bump(); }
  }

  // ── the seasons
  function setCold(sim) {
    lastStage = d.stage();
    sim.needs[COLD].grow = coldRate * (d.coldBySeason[calendar.seasonName] ?? 0) * d.mod('cold');
    sim.needs[FAITH].grow = lastStage >= d.faith.fromStage ? faithRate : 0;
    if (lastStage >= d.coin.fromStage && !R.chartered) {               // the charter: the first coin there has ever been here
      R.chartered = true;
      economy.give(d.coin.resource, d.coin.charter);
      for (let i = 0; i < sim.count; i++) d.pay(i, d.coin.resource, d.coin.toEachPerson);
    }
    for (let i = 0; i < sim.count; i++) sim.setType(i, sim.type[i]);      // a person's rates are worked out from the need's
  }
  const snapshot = () => JSON.parse(JSON.stringify(economy.totals));
  function newSeason() {
    totalsAtStart = snapshot();
    R.season = { season: calendar.seasonName, year: calendar.year, born: 0, arrived: 0, left: 0, deaths: {}, sown: 0, reaped: 0, lost: 0, levy: null };
  }
  function onSeason() {
    const sim = R.sim, ending = R.season, now = economy.totals;
    // close the season that just ended
    if (ending.season === 'autumn') {                       // winter is here: what was not reaped is lost
      for (const b of sim.world.buildings) if (b && b.tile === fieldTile) { ending.lost += Math.round((b.sown - b.reaped) * F.yieldPerCell); b.sown = 0; b.reaped = 0; setCrop(b, 'fallow'); offerWork(b, false); }
    }
    ending.made = {}; ending.used = {}; ending.wasted = {};
    for (const r of Object.keys(now)) { const was = totalsAtStart[r] ?? {};   // a resource newer than the save has no earlier total
      ending.made[r] = now[r].made - (was.made ?? 0); ending.used[r] = now[r].used - (was.used ?? 0); ending.wasted[r] = now[r].wasted - (was.wasted ?? 0); }
    ending.people = sim.count;
    if (ending.season === d.levy.season && d.stage() >= d.levy.fromStage) {   // the lord's reeve comes for his share
      const due = R.levyDue(), paid = Math.min(due, Math.floor(economy.town[grain]));
      if (due > 0) {                                        // no harvest and nothing owed: the reeve does not come
        economy.give(grain, -paid);
        R.debt = due - paid;
        let inCoin = 0;                                     // with a charter, what the granary cannot cover is taken from the treasury, a coin a measure
        if (R.debt > 0 && R.chartered) { inCoin = Math.min(R.debt, Math.floor(economy.town[d.coin.resource])); economy.give(d.coin.resource, -inCoin); R.debt -= inCoin; }
        if (R.debt === 0) { R.leviesPaid++; R.levyStreak++; } else R.levyStreak = 0;
        R.standing = Math.max(0, Math.min(100, R.standing + (R.debt === 0 ? d.levy.standing.paid : d.levy.standing.short)));
        ending.levy = { due, paid, coin: inCoin, owed: R.debt };
        d.stat('levies paid', R.leviesPaid); d.stat('levy streak', R.levyStreak); d.stat('standing', R.standing);
        if (R.onEvent) R.onEvent('levy', ending.levy);
      }
    }
    if (ending.season === 'winter') {
      R.winters++; d.stat('winters', R.winters);
      if (hardDeaths === 0 && sim.count > 0) { R.kindWinters++; d.stat('kind winters', R.kindWinters); }
    }
    R.lastSeason = ending;
    if (R.onEvent) R.onEvent('season', ending);
    // open the new one
    newSeason();
    const name = calendar.seasonName;
    if (name === 'winter') hardDeaths = 0;
    for (const b of sim.world.buildings) {
      if (!b || b.tile !== fieldTile) continue;
      if (name === 'spring') { b.sown = 0; b.reaped = 0; setCrop(b, 'fallow'); offerWork(b, true); }
      else if (name === 'summer') { if (b.sown > 0) setCrop(b, 'growing'); offerWork(b, false); }
      else if (name === 'autumn') { if (b.sown > 0) setCrop(b, 'ripe'); offerWork(b, b.sown > 0); }
    }
    if (name === 'spring') { R.year = { sown: 0, harvested: 0 }; d.stat('sown', 0); d.stat('harvested', 0); }
    callToFields();
    setCold(sim);
    bump();
    // newcomers
    const A = d.arrivals;
    if (A && name === A.season && A.resettle && sim.count < A.resettle.below) {      // nearly empty houses and grain in the store: new settlers take the place up
      if (economy.town[grain] >= A.resettle.grain && sim.beds - sim.housed >= A.size) R.welcome(Math.min(A.resettle.families, Math.floor((sim.beds - sim.housed) / A.size)));
    } else if (A && name === A.season && sim.count > 0) {
      let mood = 0; for (let i = 0; i < sim.count; i++) mood += d.moodOf(i);
      const may = Array.isArray(A.families) ? A.families[Math.min(A.families.length, d.stage()) - 1] : A.families;
      const families = Math.min(may, Math.floor((sim.beds - sim.housed) / A.size));
      if (mood / sim.count >= A.moodAbove && families > 0) R.welcome(families);
    }
  }
  /** That many families walk in at the crossroads, each under a name of its own. Returns how many people came. */
  R.welcome = families => {
    const A = d.arrivals, sim = R.sim;
    let n = 0;
    for (let f = 0; f < families; f++) {
      const family = d.newFamily ? d.newFamily() : undefined;
      for (let k = 0; k < A.size; k++) if (sim.add(A.at[0] + 0.5 + k - 1, A.at[1] + 0.5 + f, { family }) >= 0) n++;
    }
    R.season.arrived += n;
    if (R.onEvent && n) R.onEvent('arrived', n);
    return n;
  };
  /** What the lord will ask for when the levy season ends, as things stand: his share of this year's harvest plus what is owed. */
  R.levyDue = () => (d.stage() >= d.levy.fromStage ? Math.round(R.year.harvested * (R.standing < d.disfavour.below ? d.disfavour.levyShare : d.levy.share)) + R.debt : 0);
  /** How far the nearest house is from a building, in cells (Infinity if there is none). */
  R.nearestHouse = b => { let best = Infinity; for (const o of R.sim.world.buildings) if (o && o.beds) best = Math.min(best, Math.hypot(o.cx - b.cx, o.cy - b.cy)); return best; };
  /** How far the nearest well is from a building, in cells. */
  R.nearestWell = b => { let best = Infinity; for (const o of R.sim.world.buildings) if (o && o.name === d.water.well) best = Math.min(best, Math.hypot(o.cx - b.cx, o.cy - b.cy)); return best; };
  /** Grain kept back for sowing: in winter and spring, what the cells not yet sown will take. */
  R.seedReserve = () => {
    const name = calendar.seasonName;
    if (name !== 'winter' && name !== 'spring') return 0;
    let cells = 0; for (const b of R.sim.world.buildings) if (b && b.tile === fieldTile) cells += b.area - (name === 'spring' ? b.sown ?? 0 : 0);
    return Math.ceil(Math.min(cells * F.seedPerCell, R.sim.count * (F.seedKeptPerPerson ?? Infinity)));   // never more than the people left could sow and live on
  };
  /** How many days the food in the store would last, as people eat now (the seed corn is not food). */
  R.foodDays = () => { let meals = -R.seedReserve() * (d.food[grain] ?? 1); for (const [r, worth] of Object.entries(d.food)) meals += (economy.town[r] ?? 0) * worth; meals = Math.max(0, meals); return R.sim.count ? meals / (R.sim.count * d.mealsADay) : Infinity; };
  /** The lord sends grain: so much a head. It costs his regard. */
  R.relief = (perPerson, regard) => { const got = Math.round(R.sim.count * perPerson); economy.give(grain, got); if (R.onEvent) R.onEvent('relief', { grain: got }); R.regard(regard); return got; };
  /** Buy from a merchant: `amount` of a resource for `price` coin. Returns false, buying nothing, if the treasury cannot pay. */
  R.buy = (resource, amount, price) => { if (!R.spend(price)) return false; economy.give(resource, amount); if (R.onEvent) R.onEvent('bought', { resource, amount, coin: price }); return true; };
  /** The lord thinks better or worse of the steward. */
  R.regard = delta => { R.standing = Math.max(0, Math.min(100, R.standing + delta)); d.stat('standing', R.standing); if (R.onEvent) R.onEvent('regard', { delta, standing: R.standing }); return true; };
  /** Pay coin out of the treasury. Returns false, paying nothing, if it does not hold that much. */
  R.spend = coin => { if (economy.town[d.coin.resource] < coin) return false; economy.give(d.coin.resource, -coin); return true; };
  /** The fair: a fee a head for the treasury. Returns the coin made. */
  R.fair = perPerson => { const got = Math.round(R.sim.count * perPerson); economy.give(d.coin.resource, got); if (R.onEvent) R.onEvent('fair', { coin: got }); return got; };
  /** Men go to the lord's war and do not come back: up to `n` of those of working age. Returns how many went. */
  R.sendMen = n => {
    const sim = R.sim; let sent = 0;
    for (let i = sim.count - 1; i >= 0 && sent < n; i--) if (sim.types[sim.type[i]].works) { sim.remove(i, 'war'); sent++; }
    if (R.onEvent) R.onEvent('war', { men: sent });
    return sent;
  };
  // Plague: every hour, anyone may be struck.
  function sicken(sim) {
    if (d.mod('plague') <= 1) return;
    const P2 = d.plague, health = d.health();
    const chance = P2.chancePerHour * (sim.world.buildings.some(b => b && b.name === P2.hospital && b.open) ? P2.withHospital : 1);
    for (let i = 0; i < sim.count; i++) if (sim.rnd() < chance) { health[i] -= P2.strike; if (health[i] <= 0) sim.remove(i, 'plague'); }
  }
  /** Sell from the store to a merchant: up to `amount` of a resource, for `price` coin for the lot (less if there is less to sell). Returns the coin made. */
  R.sell = (resource, amount, price) => {
    const sold = Math.min(amount, Math.floor(economy.town[resource])), got = Math.round(price * sold / amount);
    economy.give(resource, -sold); economy.give(d.coin.resource, got);
    if (R.onEvent) R.onEvent('sold', { resource, sold, coin: got });
    return got;
  };

  // ── fire
  const near = (b, name, reach) => R.sim.world.buildings.some(o => o && o.name === name && o.open && Math.hypot(o.cx - b.cx, o.cy - b.cy) <= reach);
  const burns = b => b && b.fire === undefined && !d.fire.fireproof.includes(b.name);
  function light(b) {
    b.fire = R.sim.tick + d.fire.burns;
    R.sim.world.setBlocked(b, true, 'fire');
    if (R.onEvent) R.onEvent('fire', { building: b, what: 'caught' });
  }
  /** A building catches fire: one picked by chance among those that can burn. Returns it, or null if nothing can. */
  R.ignite = () => {
    const can = R.sim.world.buildings.filter(burns);
    if (!can.length) return null;
    const b = can[(R.sim.rnd() * can.length) | 0];
    light(b);
    return b;
  };
  /** The buildings burning now. */
  R.fires = () => R.sim.world.buildings.filter(b => b && b.fire !== undefined);
  function burn(sim) {
    const F2 = d.fire, w = sim.world;
    for (const b of R.fires()) {
      if (sim.tick >= b.fire) {                             // burnt long enough: was help near?
        const chance = (near(b, F2.well, F2.wellReach) ? F2.savedByWell : 0) + (near(b, F2.watch, F2.watchReach) ? F2.savedByWatch : 0);
        if (sim.rnd() < chance) { delete b.fire; delete b.state; w.setBlocked(b, false, 'fire'); if (R.onEvent) R.onEvent('fire', { building: b, what: 'saved' }); }
        else { if (R.onEvent) R.onEvent('fire', { building: b, what: 'lost' }); w.demolish(b.x, b.y); callToFields(); }
        continue;
      }
      for (const o of w.buildings) if (burns(o) && Math.max(Math.abs(o.cx - b.cx) - (o.w + b.w) / 2, Math.abs(o.cy - b.cy) - (o.h + b.h) / 2) <= F2.spreadReach && sim.rnd() < F2.spreadChance) light(o);
    }
  }

  /**
   * Time has passed while nobody was looking (the clock was moved on): bring the fields and the tallies in line with
   * the season it now is. What the settlement made and used meanwhile is the region's business, not this module's.
   */
  R.resync = () => {
    const sim = R.sim, name = calendar.seasonName;
    for (const b of sim.world.buildings) {
      if (!b || b.tile !== fieldTile) continue;
      if (b.crop === undefined) { initField(b); continue; }
      b.reaped = 0;
      if (name === 'spring') { b.sown = 0; setCrop(b, 'fallow'); offerWork(b, true); }
      else if (name === 'summer') { b.sown = b.area; setCrop(b, 'growing'); offerWork(b, false); }
      else if (name === 'autumn') { b.sown = b.area; setCrop(b, 'ripe'); offerWork(b, true); }
      else { b.sown = 0; setCrop(b, 'fallow'); offerWork(b, false); }
    }
    R.year = { sown: 0, harvested: 0 }; hardDeaths = 0;
    newSeason(); callToFields(); setCold(sim); bump();
  };

  /** Work the rates out again: call when an event that changes the cold starts or ends. */
  R.refresh = () => setCold(R.sim);

  // ── the module
  function setup(sim) {
    R.sim = sim; R.winters = 0; R.kindWinters = 0; R.year = { sown: 0, harvested: 0 }; hardDeaths = 0;
    R.standing = d.levy.standing.start; R.debt = 0; R.leviesPaid = 0; R.levyStreak = 0; R.chartered = false;
    HOMEWATER = sim.actionIndex(d.water.action);
    POTTAGE = d.pottage ? sim.actionIndex(d.pottage.action) : -1;
    BREAD = sim.actionIndex(d.bread.action); FAITH = sim.needIndex(d.faith.need); faithRate = sim.needs[FAITH].grow;
    WORK = sim.actionIndex(d.work); ROUGH = sim.actionIndex(d.roughMeal); COLD = sim.needIndex(d.cold);
    fieldTile = sim.world.id(d.field); lodgeTile = sim.world.id(d.woodcutters.prefab); treeTile = sim.world.id(d.woodcutters.tree);
    coldRate = sim.needs[COLD].grow;
    calendar.on('season', onSeason);
    newSeason();
    setCold(sim);
  }

  function onPlace(b) {
    adopt();                                               // a new well, or a new house: who has water now
    if (b.tile === fieldTile && b.crop === undefined) initField(b);
    else if (b.prefab.job?.reach) b.yield = R.woodYield(b.cx, b.cy, b.prefab.job.reach, b.prefab.job.treesForFull);
    callToFields(); bump();
  }

  function onFinish(i, a, sim) {
    if (a !== WORK) return;
    const b = sim.world.buildings[sim.inside[i]];
    if (!b || b.tile !== fieldTile) return;
    const season = calendar.seasonName;
    if (season === 'spring' && b.sown < b.area) {
      const cells = Math.min(F.sowPerShift, b.area - b.sown, Math.floor(economy.town[grain] / F.seedPerCell));
      if (cells <= 0) return;                               // no seed left in the store
      b.sown += cells; economy.give(grain, -cells * F.seedPerCell);
      R.season.sown += cells; R.year.sown += cells; d.stat('sown', R.year.sown);
      if (b.sown >= b.area) { setCrop(b, 'sown'); offerWork(b, false); callToFields(); bump(); if (R.onEvent) R.onEvent('field', b); }
    } else if (season === 'autumn' && b.reaped < b.sown) {
      const cells = Math.min(F.reapPerShift, b.sown - b.reaped), got = cells * F.yieldPerCell * (d.soil ?? 1) * d.mod('yield');
      b.reaped += cells; economy.give(grain, got);
      R.season.reaped += got; R.year.harvested += got; d.stat('harvested', Math.floor(R.year.harvested));
      if (b.reaped >= b.sown) { setCrop(b, 'stubble'); offerWork(b, false); callToFields(); bump(); if (R.onEvent) R.onEvent('field', b); }
    }
  }

  function onTick(sim) {
    if (sim.tick % 64 === 0) adopt();
    // nothing in the store: nothing to eat where one stands either
    const empty = economy.town[grain] < d.meal[grain], bit = 1 << ROUGH;
    const noBread = economy.town[d.bread.resource] < d.bread.amount, loaf = 1 << BREAD;
    const noPottage = !d.pottage || !d.pottage.from.some(r => (economy.town[r] ?? 0) >= d.pottage.amount);
    for (let i = sim.tick % 16; i < sim.count; i += 16) {
      let deny = empty ? sim.deny[i] | bit : sim.deny[i] & ~bit;
      deny = noBread ? deny | loaf : deny & ~loaf;
      if (POTTAGE >= 0) deny = noPottage ? deny | (1 << POTTAGE) : deny & ~(1 << POTTAGE);   // nothing in the store to make pottage of
      const home = sim.home[i] >= 0 ? sim.world.buildings[sim.home[i]] : null;
      sim.deny[i] = home && home.water ? deny & ~(1 << HOMEWATER) : deny | (1 << HOMEWATER);   // no well near the house: no water in it
    }
    if (sim.tick % 64 === 0 && d.stage() !== lastStage) setCold(sim);      // a new stage: faith begins to matter, or coin arrives
    if (sim.tick % d.fire.every === 0) { burn(sim); sicken(sim); R.guilded = sim.world.buildings.some(b => b && b.name === d.guild && b.open); }
  }

  function onSpawn(i, opts) { if (opts?.newborn && R.season) R.season.born++; }
  function onGone(i, cause) {
    if (cause === 'left') { R.season.left++; return; }
    R.season.deaths[cause] = (R.season.deaths[cause] ?? 0) + 1;
    if (calendar.seasonName === 'winter' && d.coldDeaths.includes(cause)) hardDeaths++;
  }

  // A saved game keeps the season's tally so far and the count of winters. What is on each field (crop, cells sown
  // and reaped) and each lodge's yield are written on the buildings, which are saved with the map.
  const save = () => ({ season: R.season, year: R.year, winters: R.winters, kindWinters: R.kindWinters, hardDeaths, totalsAtStart,
                        standing: R.standing, debt: R.debt, leviesPaid: R.leviesPaid, levyStreak: R.levyStreak, chartered: R.chartered });
  function load(d, sim) {
    if (d) {
      R.season = d.season; R.year = d.year; R.winters = d.winters; R.kindWinters = d.kindWinters; hardDeaths = d.hardDeaths; totalsAtStart = d.totalsAtStart;
      R.standing = d.standing ?? R.standing; R.debt = d.debt ?? 0; R.leviesPaid = d.leviesPaid ?? 0; R.levyStreak = d.levyStreak ?? 0; R.chartered = !!d.chartered;
    }
    else newSeason();
    setCold(sim);
  }

  /** Hand this to the engine after the calendar and the economy. */
  R.module = { name: 'hamlet rules', save, load, setup, onPlace, onFinish, onTick, onSpawn, onGone };
  return R;
}
