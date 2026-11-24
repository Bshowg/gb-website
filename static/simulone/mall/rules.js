// Atrium's own rules, as an engine module: the trading day (prepare, open, close, the report), how many visitors
// come and what they are likely to want, prices, wages and stock, what the player may build where, and what plain
// tiles cost. Every number comes from mall.js.

export function createMallRules(def) {
  const { calendar, economy, visitors, trade, staff, policies, reputation, progress, floors, upkeep: tidy, units, saleOf, tiles, week, curve, footfall, variety, floor, floorRect } = def;
  let sim = null, world = null, lastIn = 0, curveSum = 0;
  const R = {
    sim: null,
    /** 'prep' (staff arrive, shelves are filled), 'open', 'closing' (visitors are leaving), 'closed' (the report is out; the night follows). */
    phase: 'prep',
    /** The trading day, counted from 1. */
    day: 1,
    /** Called with (kind, detail): 'morning', 'opened', 'closing', 'report' (the day's report), 'loan' (the bank's offer). */
    onEvent: null,
    /** The last day's report, and a line for each of the last 14 days. */
    lastReport: null, history: [],
    /** Visitors a day this mall draws at a fair rating and full variety: it follows the stage's number, a little each day. */
    draw: footfall[1],
    /** What could not be paid at closing, carried to the next day. */
    owed: 0,
    /** The bank's one loan: { offered, taken, left (days of repayment still to come) }. */
    loan: { offered: false, taken: false, left: 0 },
    /** What happened this morning: { shut: [names of units kept shut for want of money], absent: staff who did not come }. */
    morning: { shut: [], absent: 0 },
  };
  const emit = (kind, detail) => { if (R.onEvent) R.onEvent(kind, detail); };
  const cash = () => economy.town.money;
  const built = () => world.buildings.filter(Boolean);

  // ── the mall as it stands
  /** The stage of the mall, 1 to 5. */
  R.stage = () => progress.level;
  R.weekday = (day = R.day) => week[(day - 1) % week.length];
  /** The hours of the trading day: { prep, open, close, out }. */
  R.hours = () => { const open = policies.get('open'), close = policies.get('close'); return { prep: open - def.daytime.prepBefore, open, close, out: close + def.daytime.outAfter }; };
  /** How many units of each kind are open: { name: n }. */
  R.openKinds = () => { const o = {}; for (const b of built()) if (b.open && !units[b.name].gate) o[b.name] = (o[b.name] ?? 0) + 1; return o; };
  /** How many units of a kind stand. */
  R.has = name => built().filter(b => b.name === name).length;
  /** Kinds of unit open that a visitor can come for. */
  R.varietyCount = () => Object.keys(R.openKinds()).filter(n => units[n].serves?.some(s => def.needs.find(x => x.name === s.need).wish)).length;
  R.varietyFactor = () => Math.min(variety.max, variety.base + (1 - variety.base) * R.varietyCount() / variety.full[R.stage()]);
  /** Kinds of unit built, the ways in apart (what a stage asks for). */
  R.kindsBuilt = () => new Set(built().filter(b => !units[b.name].gate).map(b => b.name)).size;
  /** The cells people appear on: just inside each way in. */
  R.gates = () => built().filter(b => units[b.name].gate && b.open).map(b => [b.xx, b.xy]);

  // ── arrivals
  /** How many visitors today should bring, as things stand. */
  R.expected = () => {
    const h = R.hours();
    let share = 0; for (let k = h.open; k < h.close; k++) share += curve[k];
    return perDay() * share / curveSum;
  };
  // Visitors a day over the usual hours: the stage's footfall, by the day of the week, the kinds of unit open, the rating,
  // a way in for cars, and whatever is going on.
  const perDay = () => R.draw * R.weekday().factor * R.varietyFactor() * reputation.factor()
    * (1 + (R.has(def.carPark.unit) ? def.carPark.visitors : 0)) * (def.mod ? def.mod('visitors') : 1);
  /** Arrivals per tick right now. Longer hours bring the visitors of those hours: the day's total is for the usual hours. */
  R.rate = () => {
    if (R.phase !== 'open' || calendar.hour >= R.hours().close - def.daytime.lastIn) return 0;
    return perDay() * curve[Math.floor(calendar.hour)] / (curveSum * def.hour);
  };
  /** How much of what a kind of visitor wants this mall has, from `appealFloor` to 1. */
  R.appeal = kind => {
    let all = 0, here = 0;
    for (const [need, w] of Object.entries(kind.wishes.of)) { all += w; if (R.served(need)) here += w; }
    return Math.max(def.appealFloor, all ? here / all : 0);
  };
  /** Which kinds of visitor come now: by the hour, the day of the week, and what the mall has for them. */
  R.mix = () => {
    const h = Math.floor(calendar.hour), weekend = def.weekend.includes(R.weekday().name), cars = R.has(def.carPark.unit) > 0, out = {};
    for (const k of def.kinds) {
      const m = def.mix[k.name];
      out[k.name] = (weekend ? (m.weekendHours ?? m.hours)[h] * m.weekend : Math.max(m.hours[h], def.mod('kind:' + k.name) > 1 ? (m.weekendHours ?? m.hours)[h] : 0) * def.mod('kind:' + k.name))
        * R.appeal(k) * (cars ? def.carPark.kinds[k.name] ?? 1 : 1);
    }
    return out;
  };
  // A wish is likely if the mall has a unit for it, less so if it could have one at this stage, impossible before that.
  const servedBy = need => Object.values(units).filter(u => u.serves?.some(s => s.need === need));
  /** Is anything open here that settles this need? */
  R.served = need => { const open = R.openKinds(); return servedBy(need).some(u => open[u.name]); };
  R.wishWeight = need => (R.served(need) ? 1 : servedBy(need).some(u => u.stage <= R.stage()) ? def.wishForMissing : 0) * (def.mod ? def.mod('wish:' + need) : 1);

  // ── prices, wages, stock
  /** The price level of a kind of unit: an entry of the game's price levels (cheap, fair, dear). */
  R.priceLevel = name => def.priceLevels[policies.get('price:' + name) ?? 1] ?? def.priceLevels[1];
  /** What a sale costs a visitor at this building. */
  R.priceOf = (action, b) => Math.round(saleOf[action].price * R.priceLevel(b.name).factor * (def.mod ? def.mod('prices') : 1));
  R.wageLevel = () => def.wages.levels[policies.get('wages')];
  /** What one member of staff costs an hour. */
  R.wageRate = () => def.wages.perHour * R.wageLevel().factor;
  /** What one member of staff costs a day: the hours from coming in to closing. It is owed for anyone who came in, from the morning. */
  R.dayWage = () => { const h = R.hours(); return Math.round(R.wageRate() * (h.close - h.prep)); };
  const wagesOf = b => (b.staffPeak ?? 0) * R.dayWage();
  /** How much stock a unit holds (in money's worth of goods). */
  R.shelfOf = b => (units[b.name].shelf ?? 0) * (1 + def.storeRoom.more * Math.min(def.storeRoom.max, R.has(def.storeRoom.unit)));
  /** The goods one sale takes. */
  R.goodsOf = action => saleOf[action].unit.goods * saleOf[action].price;
  // A sale leaves an impression: prices, and how the staff are treated.
  R.sold = (i, action, b) => {
    const level = R.priceLevel(b.name);
    let mood = level.mood + R.wageLevel().mood + (R.has(def.staffRoom.unit) && units[b.name].posts ? def.staffRoom.mood : 0);
    if (!saleOf[action].price) mood = 0;
    mood += units[b.name].delight ?? 0;                              // somewhere that is simply a pleasure
    if (mood) visitors.nudge(i, mood, level.mood < 0 ? b.name + ':dear' : undefined);
    const need = saleOf[action].need, door = b.xy * world.w + b.xx;
    if ((need === 'hunger' || need === 'thirst') && sim.rnd() < def.litter.afterFood * (nearBin?.[door] ? 1 - def.litter.binKeeps : 1)) tidy.drop(door);
  };
  // How many of a unit's staff come in today: not all, when wages are low; none, when the unit is kept shut.
  R.turnOut = b => {
    if (b.shutToday) return 0;
    let n = 0;
    for (let k = 0; k < staff.hired(b); k++) if (sim.rnd() >= R.wageLevel().absent) n++; else R.morning.absent++;
    return n;
  };

  // ── building
  /** Which floor a cell is on, or -1 for a cell that belongs to none. */
  R.floorAt = (x, y) => floors.of(x, y);
  /** May this be built at all right now? false, or why not. */
  R.locked = name => (progress.isUnlocked(name) ? false : progress.unlocks().find(u => u.id === name)?.text ?? 'not yet');
  /**
   * May a unit go with its corner at (x, y), turned `rot`? true, or why not. (The engine checks the ground itself.)
   * A way in must stand on the outer edge of the ground floor.
   */
  R.canPlaceAt = (name, x, y, rot) => {
    const u = units[name];
    if (!u.gate) return true;
    const L = world.orient(name, x, y, rot), r = floorRect(0);
    if (!L) return true;
    const onEdge = x === r[0] || y === r[1] || x + L.w - 1 === r[2] || y + L.h - 1 === r[3];
    return R.floorAt(x, y) === 0 && onEdge ? true : 'a way in must stand on the edge of the ground floor';
  };
  /** May this building be taken away? true, or why not. */
  R.canRemove = b => (units[b.name].gate && built().filter(o => units[o.name].gate).length <= 1 ? 'the mall needs a way in' : true);
  // ── floors, and the ways between them
  /** May another floor be built? true, or why not. */
  R.canBuyFloor = () => {
    if (floors.built >= floor.count) return 'the building has all its floors';
    if (floors.built >= def.floorsAt[R.stage()]) return floors.built >= def.floorsAt[def.floorsAt.length - 1] ? 'the building has all its floors' : 'a higher standing allows another floor';
    return cash() >= def.floorCost[floors.built + 1] ? true : `it costs ${def.floorCost[floors.built + 1]}`;
  };
  /** What the next floor costs. */
  R.floorCost = () => def.floorCost[floors.built + 1] ?? 0;
  /** Build the next floor. true, or why not. */
  R.buyFloor = () => {
    const why = R.canBuyFloor();
    if (why !== true) return why;
    economy.give('money', -R.floorCost());
    floors.open(); progress.set('floors', floors.built);
    return true;
  };
  /** Put a way between the floor of cell (x, y) and the one above. true, or why not. */
  R.connect = (kind, x, y) => {
    const c = def.connectors[kind], p = floors.local(x, y), lock = R.locked(kind);
    if (lock) return lock;
    if (!p) return 'it goes on a floor';
    if (cash() < c.cost) return `it costs ${c.cost}`;
    const why = floors.canConnect(kind, p.level, p.x, p.y);
    if (why !== true) return why === 'no level above' ? 'there is no floor above this one yet' : 'it needs free ground here and in the same place on the floor above';
    floors.connect(kind, p.level, p.x, p.y);
    economy.give('money', -c.cost); progress.set('ways', floors.list.length);
    return true;
  };
  /** The cells a way of this kind would take on the floor of cell (x, y). */
  R.connectCells = (kind, x, y) => def.connectors[kind].cells.map(c => [x + c.dx, y + c.dy]);
  /** Take away the way between floors that has a cell at (x, y). */
  R.disconnect = (x, y) => { const n = floors.at(x, y); if (!n) return false; floors.disconnect(n); progress.set('ways', floors.list.length); return n.kind; };
  // Someone has just ridden a way between floors: some kinds of visitor resent some ways.
  function onLink(i, cell) {
    const kind = visitors.is(i) ? floors.kindAt(cell) : null, off = kind ? def.connectors[kind].dislike?.[visitors.kindOf(i).name] : 0;
    if (off) visitors.nudge(i, -off, kind + ':rode');
  }

  // ── litter, plants, bins, guards
  const L = def.litter, G = def.green;
  let nearBin = null, nearPlant = null, marksAt = -1, grime = null, green = null, felt = null, guardsOn = 0, beatAt = 0, patrolA = -1, pid = null, looks = null, born = 0;
  // Which cells are near a bin, and near a plant: redone when the map changes.
  function marks() {
    if (marksAt === world.version) return;
    marksAt = world.version;
    nearBin = new Uint8Array(world.cells); nearPlant = new Uint8Array(world.cells);
    const bin = world.id('bin'), plant = world.id('plant'), W = world.w;
    for (let c = 0; c < world.cells; c++) {
      const t = world.tiles[c];
      if ((t !== bin && t !== plant) || world.bldAt[c] >= 0) continue;
      const r = t === bin ? L.binReach : G.reach, to = t === bin ? nearBin : nearPlant, x0 = c % W, y0 = (c / W) | 0;
      for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) if (world.inside(x, y)) to[y * W + x] = 1;
    }
  }
  /** Guards on shift right now. */
  R.guards = () => guardsOn;
  // What visitors out walking do to the floor, and what the floor does to them.
  function walkers() {
    marks();
    const look = 600 / def.hour;                                    // a look at the floor is counted every 8 ticks: the numbers are for 75 looks a game hour, however long an hour is
    const drop = L.perHour * 8 / def.hour, evening = guardsOn > 0 && calendar.hour >= def.guard.eveningFrom;
    for (let i = sim.tick % 8; i < sim.count; i += 8) {
      if (!visitors.is(i) || sim.inside[i] >= 0) continue;
      const c = sim.cell[i];
      if (!sim.using[i] && sim.rnd() < drop * (nearBin[c] ? 1 - L.binKeeps : 1)) tidy.drop(c);
      if (grime[i] < L.most && tidy.at(c) >= 1) { const was = grime[i]; grime[i] += L.seen * look; visitors.nudge(i, -L.seen * look, was < L.gripeAt && grime[i] >= L.gripeAt ? 'litter' : undefined); }
      if (nearPlant[c] && green[i] < G.most) { green[i] += G.each * look; visitors.nudge(i, G.each * look); }
      if (evening && !(felt[i] & 1)) { felt[i] |= 1; visitors.nudge(i, def.guard.mood); }
    }
  }
  // The guards' round: one cell at a time, from the ways in to the ways between floors.
  const beatCells = () => [...R.gates().map(([x, y]) => y * world.w + x),
    ...floors.list.flatMap(n => [n.level, n.level + 1].map(k => { const [x, y] = floors.cell(k, n.x, n.y); return y * world.w + x; }))];

  // ── money that goes out during the day (an event's cost, a fine): paid at once, and listed in the report
  R.extras = [];
  /** Pay for something now. What the bank cannot cover is owed. */
  R.charge = (amount, what) => {
    const paid = Math.min(cash(), amount);
    economy.give('money', -paid); R.owed += amount - paid;
    R.extras.push({ what, amount });
  };

  // ── power, and things that break
  let powerOff = false;
  /** Switch the power off or on: with it off, staffed units shut and escalators and lifts stop. */
  R.setPower = on => {
    powerOff = !on;
    for (const b of built()) if (units[b.name].posts && !units[b.name].roam) world.setBlocked(b, powerOff, 'power');
    for (const n of floors.list) if (n.kind !== 'stairs') floors.pause(n, powerOff || !!n.broken);
  };
  const mendWay = n => { n.broken = false; delete n.mendAt; floors.pause(n, powerOff && n.kind !== 'stairs'); };
  const unitAt = at => { const id = at ? world.bldAt[at[1] * world.w + at[0]] : -1; return id >= 0 ? world.buildings[id] : null; };
  /** What is broken down right now: [{ what, floor, mendAt (a tick, or undefined: tomorrow) }]. */
  R.broken = () => [...tidy.broken().map(b => ({ what: b.name, floor: floors.of(b.x, b.y), mendAt: b.mendAt })),
                    ...floors.list.filter(n => n.broken).map(n => ({ what: n.kind, floor: n.level, mendAt: n.mendAt }))];

  // ── events: what happens to the mall from outside. The numbers are in mall.js; what each one does is here.
  /** The table for modules/events.js. `director` answers the events module itself (it is made from this table). */
  R.eventTable = director => {
    const N = def.eventNumbers, DAY = def.day, H = def.hoursOf, ev = () => director(), m = n => def.sign + n;
    const from = stage => () => R.day >= N.firstDay && R.stage() >= (stage ?? 1);
    const fixing = { way: null, unit: null, cost: 0 };
    const table = [
      { id: 'rain', title: 'A rainy day', text: 'more people come in out of the rain', when: from(1), chance: N.rain.chance, every: DAY, lasts: H(14), mods: { visitors: N.rain.visitors } },

      { id: 'heatwave', title: 'A heatwave', text: 'two hot days: people want a drink and the cool of a cinema', when: from(N.heat.from), chance: N.heat.chance, every: DAY, warn: H(3), otherwise: 'leave', rest: 6 * DAY,
        choices: [{ id: 'cool', label: 'run the air conditioning hard', text: `costs ${m(N.heat.cool.cost)}; people come in to cool down`, run: () => { R.charge(N.heat.cool.cost, 'air conditioning'); ev().trigger('cool mall'); } },
                  { id: 'leave', label: 'leave it as it is', text: 'fewer come, and they are less pleased', run: () => ev().trigger('hot mall') }] },
      { id: 'cool mall', title: 'Heatwave: the mall is cool', text: 'more visitors, wanting drinks', chance: 0, every: DAY, lasts: N.heat.days * DAY, mods: { visitors: N.heat.cool.visitors, 'wish:thirst': N.heat.thirst, 'wish:film': N.heat.film } },
      { id: 'hot mall', title: 'Heatwave: the mall is hot', text: 'fewer visitors, and less pleased', chance: 0, every: DAY, lasts: N.heat.days * DAY, mood: N.heat.hot.mood, gripe: 'heat', mods: { visitors: N.heat.hot.visitors, 'wish:thirst': N.heat.thirst, 'wish:film': N.heat.film } },

      { id: 'power cut', title: 'A power cut is coming', text: 'the grid warns of a cut of about two hours this afternoon', when: from(N.power.from), chance: N.power.chance, every: DAY, warn: H(3), otherwise: 'sit', rest: 4 * DAY,
        choices: [{ id: 'generator', label: 'hire a generator', text: `costs ${m(N.power.generator)}; nothing stops`, run: () => R.charge(N.power.generator, 'a generator') },
                  { id: 'sit', label: 'sit it out', text: 'staffed units shut, and escalators and lifts stop, while it lasts', run: () => ev().trigger('blackout') }] },
      { id: 'blackout', title: 'The power is off', text: 'staffed units are shut; escalators and lifts have stopped', chance: 0, every: DAY, warn: N.power.after, lasts: N.power.lasts, loud: true, start: () => R.setPower(false), end: () => R.setPower(true) },

      { id: 'rival sale', title: 'The rival mall holds a sale', text: 'two days of cut prices across town', when: from(N.rival.from), chance: N.rival.chance, every: DAY, warn: H(4), otherwise: 'ignore', rest: 5 * DAY,
        choices: [{ id: 'sale', label: 'hold a sale too', text: 'every price a fifth lower for two days; more visitors', run: () => ev().trigger('our sale') },
                  { id: 'advertise', label: 'advertise', text: `costs ${m(N.rival.advert)}; nothing is lost`, run: () => R.charge(N.rival.advert, 'advertising') },
                  { id: 'ignore', label: 'ignore it', text: 'a quarter of the trade goes there', run: () => ev().trigger('trade lost') }] },
      { id: 'our sale', title: 'A sale', text: 'every price a fifth lower', chance: 0, every: DAY, lasts: N.rival.days * DAY, mods: { prices: N.rival.sale.prices, visitors: N.rival.sale.visitors } },
      { id: 'trade lost', title: 'The rival\'s sale', text: 'a quarter of the visitors are there', chance: 0, every: DAY, lasts: N.rival.days * DAY, mods: { visitors: N.rival.lost } },

      { id: 'inspector', title: 'The health inspector is coming', text: 'litter on the floors and toilets out of order are what they look for', when: from(1), chance: N.inspector.chance, every: DAY, warn: H(4), otherwise: 'trust', rest: 4 * DAY,
        choices: [{ id: 'clean', label: 'pay for a deep clean first', text: `costs ${m(N.inspector.deepClean)}`, run: () => { R.charge(N.inspector.deepClean, 'a deep clean'); tidy.clear(); inspect(); } },
                  { id: 'trust', label: 'let them look', text: `a clean mall is commended; a dirty one is fined ${m(N.inspector.fine)}`, run: () => inspect() }] },

      { id: 'première', title: 'A film première', text: 'the distributor offers the cinema a first night', when: () => from(4)() && R.has('cinema') > 0, chance: N.premiere.chance, every: DAY, warn: H(5), otherwise: 'decline', rest: 6 * DAY,
        choices: [{ id: 'host', label: 'host it', text: `costs ${m(N.premiere.cost)}; a big night for the cinema`, run: () => { R.charge(N.premiere.cost, 'the première'); ev().trigger('première night'); } },
                  { id: 'decline', label: 'decline', text: 'nothing changes', run: () => {} }] },
      { id: 'première night', title: 'Première night', text: 'a crowd for the cinema', chance: 0, every: DAY, lasts: H(15), mods: { visitors: N.premiere.visitors, 'wish:film': N.premiere.film } },

      { id: 'school holidays', title: 'School holidays', text: 'five days of teenagers and families, on weekdays too', when: from(1), chance: N.holidays.chance, every: DAY, warn: DAY, lasts: N.holidays.days * DAY, rest: 20 * DAY,
        mods: { visitors: N.holidays.visitors, ...Object.fromEntries(Object.entries(N.holidays.kinds).map(([k, f]) => ['kind:' + k, f])) } },

      // a way between floors breaks: it stops at once, and the player is asked how to have it mended
      { id: 'way broke', title: 'A breakdown', quiet: true, when: () => from(3)() && floors.list.some(n => n.kind !== 'stairs' && !n.broken), chance: N.way.chance, every: DAY, rest: 2 * DAY,
        start: () => {
          const can = floors.list.filter(n => n.kind !== 'stairs' && !n.broken), n = can[(sim.rnd() * can.length) | 0];
          if (!n) return;
          n.broken = true; floors.pause(n, true); fixing.way = n;
          const ask = table.find(e => e.id === 'way repair');
          ask.title = `The ${n.kind} up from ${n.level === 0 ? 'the ground floor' : def.floorNames[n.level]} has broken down`;
          ev().trigger('way repair');
        } },
      { id: 'way repair', title: 'A breakdown', text: 'it carries nobody until it is mended', chance: 0, every: DAY, warn: H(3), otherwise: 'wait',
        choices: [{ id: 'now', label: 'have it mended today', text: `costs ${m(N.way.now)}; an hour's work`, run: () => { R.charge(N.way.now, 'repairs'); if (fixing.way) fixing.way.mendAt = sim.tick + N.way.takes; } },
                  { id: 'wait', label: 'wait for the contractor', text: 'free; it stays out of use until tomorrow', run: () => {} }] },
      // a unit's machines break: the same question
      { id: 'unit broke', title: 'A breakdown', quiet: true, when: () => from(1)() && built().filter(b => units[b.name].breaks && !b.broken).length >= 2, chance: N.breakdown.chance, every: DAY, rest: 2 * DAY,
        start: () => {
          const can = built().filter(b => units[b.name].breaks && !b.broken), b = can[(sim.rnd() * can.length) | 0];
          if (!b) return;
          tidy.break(b); fixing.unit = [b.x, b.y]; fixing.cost = Math.round(units[b.name].cost * N.breakdown.share / 10) * 10;
          const ask = table.find(e => e.id === 'engineer');
          ask.title = `The ${b.name} ${b.name.endsWith('s') ? 'have' : 'has'} broken down`; ask.choices[0].text = `costs ${m(fixing.cost)}; an hour's work`;
          ev().trigger('engineer');
        } },
      { id: 'engineer', title: 'A breakdown', text: 'it is shut until it is mended', chance: 0, every: DAY, warn: H(3), otherwise: 'wait',
        choices: [{ id: 'now', label: 'call the engineer now', text: '', run: () => { R.charge(fixing.cost, 'repairs'); tidy.mend(unitAt(fixing.unit), N.breakdown.takes); } },
                  { id: 'wait', label: 'wait for the contractor', text: 'free; it stays shut until tomorrow', run: () => {} }] },

      { id: 'thieves', title: 'Shoplifters', text: 'a guard would have seen them off', quiet: true, when: () => from(N.thieves.from)() && guardsOn === 0 && R.has(def.guard.unit) === 0, chance: N.thieves.chance, every: DAY, warn: N.thieves.after, rest: 2 * DAY,
        start: () => { const lost = Math.round(Math.min(N.thieves.most, trade.takings() * N.thieves.share)); if (lost > 0) { R.charge(lost, 'shoplifters'); emit('stolen', lost); } } },
    ];
    // The inspector looks at the floors and the toilets.
    function inspect() {
      const dirty = tidy.dirty, toilets = tidy.broken().some(b => b.name === 'toilets'), pass = dirty <= N.inspector.dirtyCells && !toilets;
      if (!pass) R.charge(N.inspector.fine, 'the inspector\'s fine');
      reputation.shift(pass ? N.inspector.pass : N.inspector.fail);
      emit('inspected', { pass, dirty, toilets, fine: N.inspector.fine });
    }
    R.events = table;
    return table;
  };
  // What is going on that weighs on a visit, at the moment someone comes in.
  function onSpawn(i, opts) {
    pid[i] = ++born; looks[i] = (Math.imul(born, 2654435761) >>> 8) & 255;   // a number of their own, and with it a look
    if (opts.visitor === undefined) return;
    grime[i] = 0; green[i] = 0; felt[i] = 0;
    for (const n of def.needs) if (n.longer && (sim.wants[i] >> sim.needIndex(n.name)) & 1) sim.leaveAt[i] += n.longer;   // came for something long: has the time for it
    const E = def.director?.();
    if (E) for (const e of R.events ?? []) if (e.mood && E.isActive(e.id)) visitors.nudge(i, e.mood, e.mood < 0 ? e.gripe : undefined);
  }
  function onFinish(i, a) { if (a === patrolA) { beatAt++; world.fieldChanged('beat'); } }

  /** What a plain tile costs a cell. */
  R.tileCost = name => tiles[name]?.cost ?? 0;
  /** Put one plain tile down, if the ground is free and it can be paid for. true, or why not. */
  R.layTile = (name, x, y) => {
    const why = R.locked(name);
    if (why) return why;
    if (cash() < R.tileCost(name)) return `it costs ${R.tileCost(name)}`;
    if (!world.inside(x, y) || world.get(x, y) !== world.fill || world.reserved[y * world.w + x]) return 'it needs free ground';
    world.set(x, y, name);
    economy.give('money', -R.tileCost(name));
    progress.add('laid.' + name);
    return true;
  };
  /** How many cells of a tile the money covers. */
  R.affordable = name => (R.tileCost(name) > 0 ? Math.floor(cash() / R.tileCost(name)) : Infinity);

  // ── the day
  const upkeepOf = b => units[b.name].upkeep ?? 0;
  const waysUpkeep = () => floors.list.reduce((n, w) => n + def.connectors[w.kind].upkeep, 0);
  /** What is due at closing as things stand: { upkeep, wages, goods, loan, owed, total }. */
  R.due = () => {
    let upkeep = 0, wages = 0, goods = 0;
    for (const b of built()) { upkeep += upkeepOf(b); wages += wagesOf(b); goods += trade.books(b).day.goods; }
    upkeep += waysUpkeep();
    const loan = R.loan.left > 0 ? def.loan.daily : 0;
    return { upkeep, wages, goods, loan, owed: R.owed, total: upkeep + wages + goods + loan + R.owed };
  };
  /** Take the bank's loan (once). */
  R.takeLoan = () => { if (R.loan.taken) return false; R.loan.taken = true; R.loan.left = def.loan.days; economy.give('money', def.loan.amount); return true; };

  // The morning: with money owed, units that lost money yesterday stay shut; the others get their staff and their shelves filled.
  function morning() {
    R.morning = { shut: [], absent: 0 };
    R.draw += (footfall[R.stage()] - R.draw) * def.footfallSpreads;  // word of a new standing gets round
    tidy.clear();                                                  // the night's cleaning
    for (const b of tidy.broken()) tidy.mend(b);                 // …and the contractor's visit
    for (const n of floors.list) if (n.broken) mendWay(n);
    for (const b of built()) { b.shutToday = false; b.staffPeak = 0; }
    if (R.owed > 0 && R.lastReport) for (const u of R.lastReport.units) {
      const id = world.bldAt[u.y * world.w + u.x], b = id >= 0 ? world.buildings[id] : null;
      if (b && b.name === u.name && u.result < 0 && (units[b.name].posts || units[b.name].shelf)) { b.shutToday = true; R.morning.shut.push(b.name); }
    }
    for (const b of built()) world.setBlocked(b, !!b.shutToday, 'unpaid');
    trade.deliver((cost, b) => !b.shutToday);                        // the goods were paid for when they were sold
    emit('morning', { day: R.day, shut: R.morning.shut, owed: R.owed });
  }
  // The day's report: what came in and went out, unit by unit, who came and how they left, and what went wrong.
  function report() {
    const v = visitors.endDay(), sales = new Map(trade.endDay().map(s => [s.building.id, s])), shifts = new Map(staff.endDay().map(s => [s.building.id, s.ticks]));
    const rate = R.wageRate();
    const unitsOut = built().filter(b => !units[b.name].gate).map(b => {
      const s = sales.get(b.id), wages = wagesOf(b), u = units[b.name];
      const o = { x: b.x, y: b.y, floor: floors.of(b.x, b.y), name: b.name, sales: s?.sales ?? 0, takings: s?.takings ?? 0, turned: s?.turned ?? 0, short: s?.short ?? 0, goods: s?.goods ?? 0, wages, upkeep: upkeepOf(b),
                  staff: u.posts ? staff.today(b) : 0, posts: u.posts ?? 0, soldOut: trade.room(b) > 0 && !!b.blockedBy?.stock, shut: !!b.shutToday, hired: u.posts ? staff.hired(b) : 0, shelf: R.shelfOf(b) };
      o.result = o.takings - o.goods - o.wages - o.upkeep;
      return o;
    });
    const gateUpkeep = built().filter(b => units[b.name].gate).reduce((n, b) => n + upkeepOf(b), 0);
    const sum = k => unitsOut.reduce((n, u) => n + u[k], 0);
    const takings = sum('takings'), goods = sum('goods'), wages = sum('wages'), upkeep = sum('upkeep') + gateUpkeep + waysUpkeep();
    const upstairs = unitsOut.filter(u => u.floor >= 1).reduce((n, u) => n + u.result, 0) - waysUpkeep();
    const loan = R.loan.left > 0 ? def.loan.daily : 0;
    if (loan && --R.loan.left === 0) progress.add('loan.repaid');
    const extras = R.extras, other = extras.reduce((n, e) => n + e.amount, 0); R.extras = [];
    const litter = { left: tidy.dirty, cleaned: tidy.endDay() };
    const due = goods + wages + upkeep + loan + R.owed, paid = Math.min(cash(), due);
    economy.give('money', -paid); R.owed = due - paid;
    const gripes = Object.entries(v.gripes).map(([key, n]) => ({ key, n, text: R.gripeText(key, n) })).sort((a, b) => b.n - a.n);
    const stars = reputation.endDay();                              // the day's visits move the mall's rating
    const rep = { day: R.day, weekday: R.weekday().name, arrived: v.arrived, gone: v.gone, byKind: v.byKind, left: v.left, met: v.met, missed: v.missed,
                  gripes, worst: gripes.slice(0, 3), rating: v.gone ? v.scoreSum / v.gone : 0, ratingBefore: stars.before, ratingAfter: stars.rating, spent: v.spent, stage: R.stage(),
                  takings, goods, wages, upkeep, loan, other, extras, litter, upstairs, floors: floors.built, reach: floors.reach(0), profit: takings - goods - wages - upkeep - loan - other, owed: R.owed, cash: cash(), absent: R.morning.absent, units: unitsOut };
    rep.notes = explain(rep);
    R.lastReport = rep;
    R.history.unshift({ day: rep.day, weekday: rep.weekday, arrived: rep.arrived, rating: rep.rating, takings: rep.takings, profit: rep.profit, cash: rep.cash });
    if (R.history.length > 14) R.history.pop();
    if (R.owed > 0 && !R.loan.offered) { R.loan.offered = true; rep.loanOffer = true; }
    // what the stages and goals look at
    progress.set('visitors.day', rep.arrived); progress.set('visitors.best', Math.max(progress.get('visitors.best'), rep.arrived));
    progress.set('profit.day', Math.round(rep.profit)); progress.set('profit.best', Math.max(progress.get('profit.best'), Math.round(rep.profit)));
    for (const mark of def.ratingMarks) progress.set('rating.held.' + mark, reputation.held(mark));
    if (floors.built > 1) progress.set('upstairs.best', Math.max(progress.get('upstairs.best'), Math.round(upstairs)));
    progress.add('days');
    progress.check();
    return rep;
  }
  // Why money was lost, in plain words: the report's teaching.
  function explain(r) {
    const m = n => def.sign + Math.round(n), notes = [];
    for (const u of r.units) {
      const d = units[u.name];
      if (u.shut) notes.push(`The ${u.name} stayed shut: it lost money the day before and there were debts to pay.`);
      else if (d.posts && !u.staff) notes.push(`The ${u.name} stayed shut: nobody ${u.hired ? 'came in to work there' : 'is hired to work there'}.`);
      else if (u.soldOut) notes.push(`The ${u.name} sold out and shut early${u.short ? `, turning ${u.short} away` : ''}: its shelves hold ${m(u.shelf)} of goods.`);
      else if (u.result < 0 && d.serves?.some(s => s.price)) {
        const costs = [u.wages && `${m(u.wages)} wages`, u.goods && `${m(u.goods)} goods`, `${m(u.upkeep)} upkeep`].filter(Boolean).join(', ');
        notes.push(`The ${u.name} lost ${m(-u.result)}: ${u.sales} visit${u.sales === 1 ? '' : 's'} brought ${m(u.takings)}, against ${costs}.` +
          (u.turned > u.sales / 4 ? ` ${u.turned} turned away at the price.` : u.posts && u.staff < u.posts ? ` It was short-handed (${u.staff} of ${u.posts}).` : ''));
      }
    }
    for (const f of r.reach) if (f.level > 0) {
      const name = def.floorNames[f.level], busy = r.units.some(u => u.floor === f.level);
      if (!f.there && busy) notes.push(`Nobody can get to ${name}: what is on it earned nothing. It needs a way up from below.`);
      else if (f.there && !f.back) notes.push(`People can get up to ${name} but not down again: they were shown out at closing. It needs a way down.`);
    }
    const put = r.gripes.find(x => x.key === 'litter')?.n ?? 0;
    if (put >= 5) notes.push(`Litter put ${put} visitors off: ${r.litter.left} cells were dirty at closing${r.litter.cleaned ? `, though ${r.litter.cleaned} were cleaned` : ''}. Bins keep it off the floor${R.stage() >= 2 ? '; a cleaner\'s cupboard brings a cleaner' : ''}.`);
    if (r.extras.length) notes.push('Also paid today: ' + r.extras.map(e => `${m(e.amount)} for ${e.what}`).join(', ') + '.');
    if (r.absent) notes.push(`${r.absent} of the staff did not come in${R.wageLevel().absent >= 0.1 ? '. Low wages do that' : ': it happens now and then'}.`);
    if (r.profit < 0 && !notes.length) notes.push(`The mall as a whole cost more than it took: ${m(r.wages)} wages, ${m(r.goods)} goods and ${m(r.upkeep)} upkeep against ${m(r.takings)} taken.`);
    if (r.owed > 0) notes.push(`${m(r.owed)} could not be paid today and is owed. Units that lose money will stay shut until it is paid.`);
    return notes;
  }
  const wordsOf = need => def.needs.find(n => n.name === need)?.words ?? need;
  /** A complaint in plain words, from its key ('books:none', 'toilet:unmet', 'queue', 'café:dear') and how many made it. */
  R.gripeText = (key, n) => {
    const [need, why] = key.split(':'), w = wordsOf(need), s = n === 1 ? '' : 's';
    if (key === 'queue') return `${n} visitor${s} queued for a long time`;
    if (why === 'dear') return `${n} thought the ${need} dear`;
    if (key === 'litter') return `${n} visitor${s} ${n === 1 ? 'was' : 'were'} put off by litter`;
    if (key === 'heat') return `${n} found the mall too hot`;
    if (why === 'rode') return `${n} time${s} a family or a pensioner had to take the ${need}: they look for a lift`;
    if (why === 'unmet') return need === 'legs' ? `${n} left with tired legs and nowhere to sit` : `${n} left still wanting ${w}`;
    if (why === 'none') return `${n} came for ${w} and found nowhere open that has it`;
    if (why === 'price') return `${n} found ${w} too dear for their purse`;
    if (why === 'stock') return `${n} came for ${w} and the shelves were empty`;
    if (why === 'queue') return `${n} gave up queueing for ${w}`;
    if (why === 'closing' || why === 'shown out') return `${n} had not got ${w} when the mall closed`;
    if (why === 'time' || why === 'patience' || why === 'urgent') return `${n} ran out of time or patience before ${w}`;
    return `${n}: ${w} (${why})`;
  };

  function onTick() {
    walkers();
    if (sim.tick % 16 === 0) {
      guardsOn = 0; for (const b of built()) if (units[b.name].roam === 'guard') guardsOn += staff.today(b);
      for (const b of built()) if (units[b.name].posts) b.staffPeak = Math.max(b.staffPeak ?? 0, staff.today(b));   // a day's pay for whoever came in
      for (const n of floors.list) if (n.broken && n.mendAt !== undefined && sim.tick >= n.mendAt) mendWay(n);
    }
    const h = calendar.hour, t = R.hours();
    if (R.phase === 'closed') {
      if (calendar.day > lastIn && h >= t.prep && h < t.close) { R.phase = 'prep'; R.day++; morning(); }
    } else if (R.phase === 'prep') {
      if (h >= t.open) { R.phase = 'open'; emit('opened', R.day); }
    } else if (R.phase === 'open') {
      if (h >= t.close) { R.phase = 'closing'; visitors.sendAll('closing'); emit('closing', R.day); }
    } else if (visitors.count === 0 || h >= t.out || h < t.prep) {
      visitors.clear('shown out');
      lastIn = calendar.day; R.phase = 'closed';
      const rep = report();
      emit('report', rep);
      if (rep.loanOffer) emit('loan', def.loan);
    }
  }
  // Nobody is let in to something that would run well past closing time: a film at the day's end is a wish missed.
  function canStart(i, a, b) {
    const sale = visitors.is(i) ? saleOf[sim.actions[a].name] : null;
    if (!sale || R.phase !== 'open') return true;
    const k = sim.needIndex(sale.need), left = (R.hours().close + def.daytime.overrun - calendar.hour) * def.hour;
    if (sale.takes * sim.needsOf[i * sim.K + k] <= left) return true;
    visitors.drop(i, k, 'closing');
    return false;
  }
  // Someone sitting on a bench takes a seat: no more than it has.
  function canUse(i, a, cell) {
    const t = world.defs[world.tiles[cell]], seats = tiles[t.name]?.seats;
    return !seats || sim.crowd[cell] <= seats;
  }
  function onLine(tile, n) { economy.give('money', -n * R.tileCost(tile)); }
  // Dear things draw fewer people and cheap ones more.
  function onRebuildMatrix(s) {
    for (const [action, sale] of Object.entries(saleOf)) {
      const pull = R.priceLevel(sale.unit.name).pull;
      if (pull === 1 || !sale.price) continue;
      const a = s.actionIndex(action), k = s.needIndex(sale.need);
      for (let t = 0; t < s.T; t++) s.live[t * s.MA + k * s.A + a] *= pull;
    }
  }

  R.module = { name: 'mall',
    setup(s) {
      sim = R.sim = s; world = s.world; R.phase = 'prep'; R.day = 1; R.draw = footfall[1]; R.lastReport = null; R.history = []; R.owed = 0; lastIn = 0;
      R.loan = { offered: false, taken: false, left: 0 }; R.morning = { shut: [], absent: 0 }; R.extras = []; powerOff = false; marksAt = -1; guardsOn = 0; beatAt = 0;
      grime = s.addColumn('grime', Float32Array, 0); green = s.addColumn('greenery', Float32Array, 0); felt = s.addColumn('felt', Uint8Array, 0);
      patrolA = s.actionIndex('patrol'); born = 0;
      pid = s.addColumn('pid', Int32Array, 0); looks = s.addColumn('look', Uint8Array, 0);   // for the art: who is who, and which of a kind's looks they have
      world.addField('beat', push => { const cells = beatCells(); if (cells.length) push(cells[beatAt % cells.length]); });
      curveSum = 0; for (let h = def.daytime.open; h < def.daytime.close; h++) curveSum += curve[h];
    },
    onTick, canUse, canStart, onLine, onRebuildMatrix, onLink, onSpawn, onFinish,
    save: () => ({ phase: R.phase, day: R.day, lastReport: R.lastReport, history: R.history, owed: R.owed, lastIn, loan: R.loan, morning: R.morning, extras: R.extras, powerOff, draw: R.draw, born }),
    load(d) {
      if (!d) return;
      R.phase = d.phase; R.day = d.day; R.lastReport = d.lastReport ?? null; R.history = d.history ?? []; R.owed = d.owed ?? 0; lastIn = d.lastIn ?? 0;
      R.loan = { offered: false, taken: false, left: 0, ...(d.loan ?? {}) }; R.morning = { shut: [], absent: 0, ...(d.morning ?? {}) };
      R.extras = d.extras ?? []; powerOff = !!d.powerOff; marksAt = -1; R.draw = d.draw ?? footfall[R.stage()]; born = d.born ?? 0;
    } };
  return R;
}
