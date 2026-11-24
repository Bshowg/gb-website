// The colony's own rules, as an engine module. Game code: the engine and the shared modules know nothing
// about ants, mounds, crumbs or brood. All numbers come from nest.js.
//
//   - Digging. An ant arriving beside marked earth picks the marked cell with the fewest ants at it, bites a
//     load out, and has that load of soil in its jaws.
//   - The mound. Soil is taken up and dropped around each way out: more near the hole, less further off. When
//     the mound is full it is allowed to grow taller and wider.
//   - Finds. Now and then food turns up somewhere on the surface, as a pile of crumbs. The colony does not know of it
//     until an ant comes close enough to smell it. That ant marks the spot, and from then on the pile is fetched.
//   - Trails. An ant carrying food home leaves trail scent on every cell it crosses. A pile is known for as long as
//     its spot smells of trail, so a pile being worked stays known and one that is left is forgotten. The player's
//     trail mark is the same scent, laid on thick.
//   - Scouts. Ants with nothing better to do walk to spots on the surface picked at random, and find things on the way.
//   - Traffic. Every ant on the move leaves a little of itself on the cells it crosses, for the player to look at.
//   - The surface. Only the part of the top row the colony holds can be walked. Finds turn up on it, more often the
//     wider it is.
//   - Things in the earth. Some ground hides something: a cache of food, an old nest's empty rooms, fungus. It is
//     found when the ants dig next to it. Fungus, once found, lets the player name garden rooms.
//   - Gardens. A garden cell gives a crumb each time it is tended, and then takes a while to be ready again.
//   - Day and night, and weather. At night and in rain nobody sets out for the surface, and in rain no food turns up.
//     In heat less food turns up and what lies on the surface dries away.
//   - Rain. Water comes in by every way out, a cell at a time, and runs down through whatever is dug. What it floods
//     is lost: brood is gone (food is only out of reach until the water goes), and an ant caught in it gets to the nearest dry ground or drowns.
//   - Cave-ins. A room dug too wide under sand loses cells to its roof, sooner in rain. What is buried is lost like
//     what is flooded.
//   - Majors. The colony raises big-headed fighters for its guard rooms: a new ant hatches as a major while there are
//     fewer of them than the guard rooms call for. A major does no work. It stands guard, and goes where alarm is.
//   - Alarm. A colony ant that sees an enemy, and every blow in a fight, leaves alarm scent. Majors follow it.
//   - Raiders. While a rival nest lies somewhere in the earth, its ants come over the surface now and then, in by a
//     way out, down to the food, and away with a crumb each. They fight whatever they meet.
//   - Rival nests. Digging into one wakes it: its queen and her guard. When that queen is dead the nest is the
//     colony's, with what it had stored, and one source of raids is gone.
//   - Princesses and the flight. A colony big enough raises princesses for its flight rooms. On a calm morning with
//     no enemy about, the grown ones walk out and fly. Each has a chance of founding a colony somewhere else: that is
//     the score.
//   - The queen can die: of hunger left desperate for a long time, or in water with no dry ground near. If a princess is in the nest
//     she takes the queen's place. If none is, no more eggs are laid and the colony is at its end.
//   - Saving. When the player has picked ground to claim that the store cannot pay for yet, what the claim costs is
//     kept back from the larvae, except that one is still fed every so often so the colony replaces its dead. When
//     the store can pay and still leave the ants a crumb each, the claim is made at once.
//   - Eating. An ant that is hungry enough eats one crumb, from the nearest pile of them, stored or not. One carrying a crumb when it gets
//     desperately hungry eats that. One left desperately hungry for too long dies.
//   - The queen. She cannot feed herself: a crumb has to be brought to her. While she is fed she lays an egg at
//     a time where she sits, unless too many eggs already lie about waiting for a brood room.
//     She also stops while many larvae are still waiting to be fed.
//   - Brood. An egg in a brood room becomes a larva after a while. A larva becomes a pupa when it is fed a crumb,
//     and larvae are fed only from what the store holds beyond a reserve kept for the ants themselves.
//     A pupa becomes an ant after a while. Nothing happens to brood lying anywhere else.
//   - Ages. An ant's age decides what it is (young, grown, old) and so what work it listens to. Each has its own
//     lifespan and dies of age at the end of it.

/**
 * @param {object} d
 * @param {object} d.items, d.ground, d.scent the shared modules this game uses
 * @param {{layer:string, known:number, carried:number, atFind:number, sniff:number}} d.trail   the trail layer; the strength
 *        above which a pile is known; what a carrier leaves per cell; what a find is marked with; how near an ant smells one
 * @param {{layer:string, drop:number}} d.traffic   the layer that records where ants walk
 * @param {{spots:number, every:number}} d.scouts   how many spots scouts are sent to at a time, and how often new ones are picked
 * @param {string} d.storeFood                the action of carrying food home
 * @param {string} d.soil, d.food, d.egg, d.larva, d.pupa   item kinds
 * @param {string} d.dig, d.eat, d.lay, d.hunger            names from the game's definitions
 * @param {() => number[]} d.queenCells       the cells of the queen's room: she sits and lays on a floor in it (the action d.lay is `at: '#seat'`)
 * @param {string} d.queen                    the queen's type
 * @param {Array<{type:string, until:number}>} d.ages   worker types by age, youngest first; `until` in ticks (the last: Infinity)
 * @param {number} d.lifespan, d.lifespanSpread         ticks a worker lives, and each one's own share more or less
 * @param {() => number[]} d.broodCells       the cells brood develops on
 * @param {{eggAfter:number, pupaAfter:number, waiting:number, eggCost:number, layBelow:number, unfed:number, reserve:number}} d.brood
 * @param {number} d.surface                  the row ants walk on above ground
 * @param {{clear:number, height:number, slope:number}} d.mound
 * @param {{every:number, per:number, size:[number, number], atMost:number, clear:number}} d.finds   one find every `every` ticks for
 *        each `per` cells of surface held, and no more while `atMost` crumbs (for each `per` cells) lie about
 * @param {Array<{kind:string, cell:number, rect?:[number, number, number, number], crumbs?:number, found:boolean}>} d.features   what the earth hides
 * @param {string} d.open                     the tile of dug-out ground
 * @param {() => number[]} d.gardenCells      the cells of garden rooms
 * @param {{every:number}} d.garden           ticks a garden cell takes to be ready again
 * @param {object} d.weather, d.water         the shared modules for what it is like out, and for water
 * @param {string} d.rainKind, d.heatKind     the kinds of weather that are rain and heat
 * @param {{perSecond:number, after:number}} d.rain   cells of water a second coming in by each open way out while it rains; finds that turn up when it stops
 * @param {number} d.second                   ticks in a second
 * @param {{finds:number, spoilEvery:number}} d.heat   how much less often finds turn up, and how often a surface pile loses a crumb
 * @param {{every:number, chance:number, rain:number}} d.cave   how often roofs are tried, the chance one too wide loses a cell, and how many times likelier in rain
 * @param {(x:number, y:number) => boolean} d.holds   is this cell ground the colony holds?
 * @param {(cell:number) => void} d.ruined    a cell has been buried: whatever purpose it had is gone
 * @param {string[]} d.perishable             item kinds lost when their cell floods or is buried
 * @param {object} d.foes                     the shared module for sides and fights
 * @param {string} d.major, d.raider, d.rivalQueen   types: the colony's fighter, the enemy's ant and the enemy's queen
 * @param {() => number} d.guardCells         how many cells of guard room there are
 * @param {{perMajor:number}} d.guard         cells of guard room for each major the colony keeps
 * @param {{layer:string, sight:number, seen:number, blow:number}} d.alarm   the alarm layer, how far an ant sees an enemy, and what seeing one and a blow leave
 * @param {{fromAnts:number, every:[number, number], perAnts:number, least:number, most:number, warn:number, stay:number, gap:number}} d.raids
 *        no raids below this many ants; ticks between raids (from-to); one raider for every so many ants, within least and
 *        most; ticks of warning; how long a raider stays before giving up; ticks between raiders arriving
 * @param {{guards:number, crumbs:number}} d.rival   what a rival nest holds when it is dug into
 * @param {string} d.princess                 the type raised for the flight
 * @param {() => number} d.flightCells        how many cells of flight room there are
 * @param {{fromAnts:number, perPrincess:number, ripe:number, window:number, founds:number}} d.flight   no princesses below this many
 *        ants; cells of flight room for each; ticks before one can fly; ticks a flight lasts; the chance one founds a colony
 * @param {number} d.queenStarves             ticks the queen survives with hunger desperate
 * @param {() => void} d.daughter             a princess has founded a colony somewhere: keep the score
 * @param {(cell:number) => void} d.undermined   the ground under this cell has just been dug out
 * @param {number} d.keepPerAnt               crumbs for every ant that a claim must leave in the store
 * @param {(target:any) => number} d.priceOf  what the thing the colony is saving for costs now
 * @param {(target:any) => (true|string)} d.buy   try to buy it: true, or why not
 * @param {number} d.starvesAfter             ticks an ant survives with hunger desperate
 * @param {number} d.eatAbove                 an ant does not eat while its hunger is below this: a crumb is a whole meal
 * @param {number} d.queenHungry              the queen is brought food when her hunger is above this
 * @param {(i:number) => void} d.changed      what ant i carries changed outside a task: let the tasks know
 */
export function createColony(d) {
  const { items, ground, scent, weather, water, foes } = d;
  const C = {
    sim: null,
    /** How tall the mound may be at its highest, in loads. */
    moundHeight: d.mound.height,
    stats: { finds: 0, found: 0, died: {}, eaten: 0, laid: 0, hatched: 0, grown: 0, flooded: 0, caved: 0, lost: 0, raids: 0, stolen: 0 },
    /** The tick the flight that is under way ends, or 0. */
    flying: 0,
    /** True once the queen is dead with no princess to take her place. */
    ended: false,
    /** Rival nests still somewhere in the earth, found or not. While there is one, raids come. */
    rivals: 0,
    /** The raid that is coming: { at (tick), side (-1 west, 1 east), size }, or null. */
    raid: null,
    /** Crumbs lying about that the colony knows of, and that it does not. */
    knownCrumbs: 0, unknownCrumbs: 0,
    /** The spots scouts are being sent to, as cell indexes. */
    scoutSpots: [],
    /** What the colony has found in the earth that opens something new: { fungus: true }. */
    unlocked: {},
    /** What the earth hides, found or not (the game's list). */
    features: d.features,
    /** Garden cells ready to be tended right now. */
    ripeCells: 0,
    /** What the colony is saving food for (the game's own thing: a plot to claim), or null. Set it, or clear it. */
    target: null,
    /** Called with ('find', cell, crumbs) | ('found', cell, crumbs) | ('died', agent, cause) | ('hatched', agent) | ('mound', height) | ('dug up', feature) | ('cave-in', cell) | ('lost', cell, things)
     *  | ('raid coming', raid) | ('raid', raid) | ('rival dead', feature) | ('flight', princesses) | ('daughter') | ('heir') | ('ended', cause). */
    onEvent: null,
  };
  let PRINCESS = -1, flightDay = 0, queenStarving = 0;
  let lastFed = 0, MAJOR = -1, RAIDER = -1, RIVAL = -1, isWorker = null, leaveAt = null, nextRaid = 0;
  let STORE = -1, ripeAt = null, surface = null, findDue = 0, wasRaining = false, afterRain = 0;
  let DIG = -1, EAT = -1, LAY = -1, HUNGER = -1, QUEEN = -1, digAt = null, starving = null, span = null, W = 0, queenCell = -1;
  let ageTypes = [];
  const CHECK = 30;

  // A pile is known while its spot smells of trail: tell the route to known food whenever that changes anywhere.
  scent.watch(d.trail.layer, d.trail.known, () => { if (C.sim) C.sim.world.fieldChanged('known food'); });
  /** Does the colony know of the pile on this cell? */
  C.known = cell => scent.at(d.trail.layer, cell) > d.trail.known;
  /** An ant has taken a crumb from a pile: the spot is marked afresh. */
  C.tookFrom = cell => scent.add(d.trail.layer, cell, d.trail.atFind);

  /** Is agent i one of the colony's? A worker (of any age)? A major? */
  C.ours = i => { const t = C.sim.type[i]; return t !== RAIDER && t !== RIVAL; };
  C.worker = i => isWorker[C.sim.type[i]] === 1;
  C.isMajor = i => C.sim.type[i] === MAJOR;
  C.isRaider = i => C.sim.type[i] === RAIDER;
  /** How many ants the colony has, the queen included; how many of them are majors; and how many enemies are on the map. */
  C.population = () => { const sim = C.sim; let n = 0; for (let i = 0; i < sim.count; i++) if (sim.type[i] !== RAIDER && sim.type[i] !== RIVAL) n++; return n; };
  C.majors = () => { const sim = C.sim; let n = 0; for (let i = 0; i < sim.count; i++) if (sim.type[i] === MAJOR) n++; return n; };
  C.enemies = () => C.sim.count - C.population();
  /** How many princesses are in the nest, and how many the flight rooms call for (none until the colony is big enough). */
  C.princesses = () => { const sim = C.sim; let n = 0; for (let i = 0; i < sim.count; i++) if (sim.type[i] === PRINCESS) n++; return n; };
  C.princessesWanted = () => (C.population() >= d.flight.fromAnts ? Math.floor(d.flightCells() / d.flight.perPrincess) : 0);
  C.isPrincess = i => C.sim.type[i] === PRINCESS;
  /** May princess i set out to fly now? */
  C.mayFly = i => C.flying > 0 && C.sim.age[i] >= d.flight.ripe;
  /** Princess i has reached the open and flown. */
  C.flew = i => { const sim = C.sim; C.stats.flown++; sim.remove(i, 'flew'); if (sim.rnd() < d.flight.founds) { C.stats.daughters++; d.daughter(); if (C.onEvent) C.onEvent('daughter'); } };
  /** How many majors the guard rooms call for. */
  C.majorsWanted = () => Math.floor(d.guardCells() / d.guard.perMajor);
  /** May raider i still try for food? Not once it has a crumb, and not after it has stayed too long. */
  C.raiding = i => C.sim.tick < leaveAt[i] && !items.carrying(i);
  /** Raider i takes a crumb from the store it has reached. */
  C.steal = (i, cell) => { if (items.pick(i, d.food, cell)) C.stats.stolen++; else leaveAt[i] = 0; };
  /** Raider i is back at the edge of the surface and gone, with what it carries. */
  C.escape = i => { items.use(i); C.sim.remove(i, 'left'); };

  /** The queen's index right now (it changes as ants come and go), or -1 if she is dead. */
  C.queen = () => { const sim = C.sim; for (let i = 0; i < sim.count; i++) if (sim.type[i] === QUEEN) return i; return -1; };
  /** How hungry the queen is, 0..1 (1 if there is none). */
  C.queenHunger = () => { const q = C.queen(); return q < 0 ? 1 : C.sim.needsOf[q * C.sim.K + HUNGER]; };
  /** Does the queen want a crumb brought? */
  C.queenHungry = () => C.queen() >= 0 && C.queenHunger() > d.queenHungry;
  /** Larvae waiting to be fed, and whether the queen is: how many crumbs are wanted from the store right now. */
  C.mealsWanted = () => (C.mayFeedBrood() ? items.inStores(d.larva) : 0) + (C.queenHungry() ? 1 : 0);
  /** Is there food to spare for larvae? Only what the store holds beyond the ants' own reserve goes to them. */
  C.mayFeedBrood = () => items.inStores(d.food) > Math.max(4, C.population() * d.brood.reserve) + (C.sim.tick - lastFed < d.brood.whileSaving ? C.saving() : 0);
  /** Can the store pay this much and still leave the ants enough to eat through a night indoors? A claim never empties the store. */
  C.canPay = price => items.inStores(d.food) >= price + C.kept();
  C.kept = () => Math.ceil(Math.max(8, C.population() * d.keepPerAnt));
  /** Crumbs being kept back for what the colony is saving for. */
  C.saving = () => (C.target ? d.priceOf(C.target) : 0);
  /** Eggs, larvae and pupae, wherever they are. */
  C.brood = () => ({ eggs: items.count(d.egg), larvae: items.count(d.larva), pupae: items.count(d.pupa) });
  /** Ant i's age in ticks, and the ticks it will live (0: does not die of age). */
  C.lifeOf = i => ({ age: C.sim.age[i], span: span[i] });

  /** The columns of the surface row that can be walked: the part of it the colony holds. */
  C.surface = () => {
    if (!surface) { const w = C.sim.world; surface = []; for (let x = 1; x < W - 1; x++) if (!w.solid[w.tiles[d.surface * W + x]]) surface.push(x); }
    return surface;
  };
  /** The surface the colony holds has changed (a claim): where finds turn up, where scouts go and where soil is dropped follow. */
  C.surfaceChanged = () => { surface = null; C.layMound(); C.sim.world.fieldChanged('exit'); };

  /** May ants set out for the surface now? Not at night, and not in rain. */
  C.mayGoOut = () => !weather.isNight && weather.now !== d.rainKind;

  // A cell has been flooded or buried. What lay there is lost, and an ant standing there gets to the nearest open
  // ground within a few cells, or dies.
  function ruin(c, cause, buried) {
    const sim = C.sim, w = sim.world;
    let lost = 0;
    for (const k of d.perishable) lost += items.take(k, c, 999);
    if (lost) { C.stats.lost += lost; if (C.onEvent) C.onEvent('lost', c, lost); }
    if (buried) d.ruined(c);                                    // a flooded room is still that room when the water goes
    const x = c % W, y = (c / W) | 0;
    for (let i = 0; i < sim.count; i++) {
      if (sim.cell[i] !== c && ((sim.py[i] | 0) * W + (sim.px[i] | 0)) !== c) continue;
      let best = -1, bd = Infinity;
      for (let j = -4; j <= 4; j++) for (let k = -4; k <= 4; k++) {
        const nx = x + k, ny = y + j;
        if (!w.inside(nx, ny) || w.solid[w.tiles[ny * W + nx]]) continue;
        const dd = k * k + j * j + (j > 0 ? 3 : 0);               // up or sideways before down
        if (dd < bd) { bd = dd; best = ny * W + nx; }
      }
      if (best < 0) { sim.remove(i, cause); continue; }
      sim.px[i] = (best % W) + 0.5; sim.py[i] = ((best / W) | 0) + 0.5; sim.vx[i] = sim.vy[i] = 0; sim.using[i] = 0;
    }
  }

  /** Is this garden cell ready to be tended? */
  C.ripe = cell => C.sim.tick >= ripeAt[cell] && items.at(d.food, cell) < items.limit(d.food, cell);
  /** How far along a garden cell is: 0 a bare bed, 1 threads, 2 grown, 3 ready to be tended. */
  C.ripeness = cell => (C.ripe(cell) ? 3 : Math.max(0, Math.min(2, Math.floor((1 - (ripeAt[cell] - C.sim.tick) / d.garden.every) * 3))));
  /** A garden cell has been tended: a crumb, and it starts again. */
  C.harvest = cell => { if (!C.ripe(cell)) return; items.put(d.food, cell, 1); ripeAt[cell] = C.sim.tick + d.garden.every; C.stats.grown++; C.sim.world.fieldChanged('garden ripe'); };
  /** A cell has just been made garden: it is not ready at once. */
  C.planted = cell => { ripeAt[cell] = C.sim.tick + d.garden.every; };

  // The ants have dug a cell out: is it next to something the earth was hiding?
  function dugUp(c) {
    const x = c % W, y = (c / W) | 0, sim = C.sim;
    for (const f of d.features) {
      if (f.found) continue;
      const fx = f.cell % W, fy = (f.cell / W) | 0;
      const near = f.rect ? x >= f.rect[0] - 1 && x <= f.rect[2] + 1 && y >= f.rect[1] - 1 && y <= f.rect[3] + 1 : Math.abs(x - fx) <= 1 && Math.abs(y - fy) <= 1;
      if (!near) continue;
      f.found = true;
      ground.unmark(fx, fy);
      if (f.kind === 'cache') { sim.world.set(fx, fy, d.open); items.put(d.food, f.cell, f.crumbs); C.tookFrom(f.cell); }
      else if (f.kind === 'fungus') { sim.world.set(fx, fy, d.open); C.unlocked.fungus = true; }
      else if (f.kind === 'rival') {                               // the nest wakes: its queen in the middle, her guard around her, their store
        const cx = (f.rect[0] + f.rect[2]) >> 1, cy = (f.rect[1] + f.rect[3]) >> 1, cells = [];
        for (let yy = f.rect[1]; yy <= f.rect[3]; yy++) for (let xx = f.rect[0]; xx <= f.rect[2]; xx++) if (xx !== cx || yy !== cy) cells.push(yy * W + xx);
        const q = sim.add(cx + 0.5, cy + 0.5, { type: d.rivalQueen });
        if (q >= 0) f.queen = true;
        foes.wave({ type: d.raider, count: d.rival.guards, cells, gap: 1, init: i => { leaveAt[i] = sim.tick + d.raids.stay * 4; } });
        items.put(d.food, f.rect[1] * W + f.rect[0], d.rival.crumbs); C.tookFrom(f.rect[1] * W + f.rect[0]);
      }
      if (C.onEvent) C.onEvent('dug up', f);
    }
  }

  /** The columns where a tunnel opens onto the surface. */
  C.entrances = () => {
    const w = C.sim.world, out = [];
    for (let x = 1; x < W - 1; x++) if (!w.solid[w.tiles[(d.surface + 1) * W + x]]) out.push(x);
    return out;
  };
  /** Say where soil may be dropped: around every way out, none in the way of it, less the further off. */
  C.layMound = () => {
    const ways = C.entrances(), M = d.mound;
    for (let x = 1; x < W - 1; x++) {
      let cap = 0;
      for (const e of ways) {
        const far = Math.abs(x - e);
        if (far <= M.clear) { cap = 0; break; }
        cap = Math.max(cap, Math.floor(C.moundHeight - (far - M.clear - 1) * M.slope));
      }
      if (C.sim.world.solid[C.sim.world.tiles[d.surface * W + x]]) cap = 0;   // not the colony's surface
      items.setStore(d.soil, d.surface * W + x, Math.max(0, cap));
    }
  };

  /** Ant i, standing on `cell`, picks the marked cell beside it to work at. False if every one is taken. */
  C.chooseFace = (i, cell) => {
    const sim = C.sim;
    const busy = c => { let n = 0; for (let j = 0; j < sim.count; j++) if (j !== i && sim.using[j] && sim.action[j] === DIG && digAt[j] === c) n++; return n; };
    const f = ground.face(cell, busy);
    digAt[i] = f;
    return f >= 0;
  };
  /** Ant i has finished a bite at the cell it chose: a load comes out, into its jaws. */
  C.bite = i => { const c = digAt[i]; digAt[i] = -1; if (c >= 0 && ground.bite(c)) items.give(i, d.soil); };
  /** Ant i gives the crumb it carries to a larva on `cell`, which becomes a pupa. */
  C.feedLarva = (i, cell) => { if (items.carrying(i) !== d.food || items.take(d.larva, cell, 1) !== 1) return; items.use(i); items.put(d.pupa, cell, 1); lastFed = C.sim.tick; };
  /** Ant i gives the crumb it carries to the queen. */
  C.feedQueen = i => { const q = C.queen(); if (q < 0 || items.carrying(i) !== d.food) return; items.use(i); C.sim.needsOf[q * C.sim.K + HUNGER] = 0; C.stats.eaten++; };

  function setup(sim) {
    C.sim = sim; W = sim.world.w; C.moundHeight = d.mound.height; C.stats = { finds: 0, found: 0, died: {}, eaten: 0, laid: 0, hatched: 0, grown: 0, flooded: 0, caved: 0, lost: 0, raids: 0, stolen: 0, flown: 0, daughters: 0 };
    leaveAt = sim.addColumn('leaveAt', Int32Array, 0);
    C.rivals = d.features.filter(f => f.kind === 'rival' && !f.cleared).length; C.raid = null; nextRaid = 0;
    sim.world.addField('exit', push => { const top = C.surface(); if (top.length) { push(d.surface * W + top[0]); push(d.surface * W + top[top.length - 1]); } });
    foes.onEvent = (kind, a) => { if (kind === 'blow') scent.add(d.alarm.layer, a, d.alarm.blow); };
    water.onFlood = c => { C.stats.flooded++; ruin(c, 'drowning'); };
    ground.onCave = c => { C.stats.caved++; ruin(c, 'a cave-in', true); if (C.onEvent) C.onEvent('cave-in', c); };
    lastFed = 0;
    C.unlocked = {}; C.ripeCells = 0; C.target = null; surface = null; findDue = 0;
    ripeAt = new Int32Array(sim.world.cells);
    sim.world.addField('garden ripe', push => { for (const c of d.gardenCells()) if (C.ripe(c)) push(c); });
    C.knownCrumbs = C.unknownCrumbs = 0; C.scoutSpots = [];
    STORE = sim.actionIndex(d.storeFood);
    sim.world.addField('known food', push => items.each(d.food, (c, n, store) => { if (n && !store && C.known(c)) push(c); }));
    sim.world.addField('scout', push => { for (const c of C.scoutSpots) push(c); });
    items.onChange = kind => { if (kind === d.food) sim.world.fieldChanged('known food'); };
    DIG = sim.actionIndex(d.dig); EAT = sim.actionIndex(d.eat); LAY = sim.actionIndex(d.lay); HUNGER = sim.needIndex(d.hunger);
    QUEEN = sim.typeIndex(d.queen); ageTypes = d.ages.map(a => sim.typeIndex(a.type));
    PRINCESS = sim.typeIndex(d.princess); C.flying = 0; C.ended = false; flightDay = 0; queenStarving = 0;
    MAJOR = sim.typeIndex(d.major); RAIDER = sim.typeIndex(d.raider); RIVAL = sim.typeIndex(d.rivalQueen);
    isWorker = Uint8Array.from(sim.types, (t, k) => (ageTypes.includes(k) ? 1 : 0));
    digAt = sim.addColumn('digAt', Int32Array, -1);
    starving = sim.addColumn('starving', Int32Array, 0);
    span = sim.addColumn('lifespan', Int32Array, 0);
    ground.onDug = c => { if (((c / W) | 0) === d.surface + 1) C.layMound(); d.undermined(c - W); dugUp(c); };   // a new way out: the mound moves with it
    sim.world.addField('queen', push => { const q = C.queen(); if (q >= 0) push(sim.cell[q]); });
    C.seat = -1;
    sim.world.addField('seat', push => { if (C.seat >= 0) push(C.seat); });
  }
  function onSpawn(i, opts, sim) {
    const t = sim.type[i];
    span[i] = t === QUEEN || t === RAIDER || t === RIVAL ? 0 : Math.round(d.lifespan * (1 + (sim.rnd() * 2 - 1) * d.lifespanSpread));
  }

  // The queen's seat is a cell of her room with dry earth under it: the one nearest the middle of those there are.
  // It is kept while it is good. With no room, or none of it dry, she has no seat and lays nothing.
  function seatGood(c) {
    const w = C.sim.world, t = w.tiles;
    return c >= 0 && !w.solid[t[c]] && ((c / W) | 0) > d.surface && w.solid[t[c + W]] && !water.wet[c + W];
  }
  function keepSeat() {
    const room = d.queenCells();
    if (C.seat >= 0 && seatGood(C.seat) && room.includes(C.seat)) return;
    const good = room.filter(seatGood);
    let mx = 0; for (const c of good) mx += c % W; mx /= good.length || 1;
    let best = -1, bd = Infinity;
    for (const c of good) { const dd = Math.abs((c % W) - mx); if (dd < bd) { bd = dd; best = c; } }
    if (best === C.seat) return;
    C.seat = best; C.sim.world.fieldChanged('seat');
  }

  // A meal is one crumb, taken as the ant starts eating, so two ants never eat the same one.
  function canUse(i, a, cell) {
    if (a !== EAT) return true;
    if (items.take(d.food, cell, 1) !== 1) return false;
    C.stats.eaten++;
    return true;
  }
  // The queen finishes a spell of laying: an egg, if she is fed and not too many are waiting to be carried off.
  function onFinish(i, a, sim) {
    if (a !== LAY || sim.type[i] !== QUEEN) return;
    const h = i * sim.K + HUNGER;
    if (sim.needsOf[h] >= d.brood.layBelow || items.loose(d.egg) >= d.brood.waiting || items.count(d.larva) >= d.brood.unfed) return;
    items.put(d.egg, sim.cell[i], 1); C.stats.laid++;
    sim.needsOf[h] = Math.min(1, sim.needsOf[h] + d.brood.eggCost);
  }

  // Scent laid by ants as they walk, and what they smell.
  function scents(sim) {
    if (sim.tick % 5 === 0) for (let i = 0; i < sim.count; i++) {
      if (sim.action[i] === STORE && !sim.using[i] && sim.type[i] !== RAIDER) scent.add(d.trail.layer, sim.cell[i], d.trail.carried);   // food on its way home
      if (sim.tick % 10 === 0 && (sim.vx[i] !== 0 || sim.vy[i] !== 0)) scent.add(d.traffic.layer, sim.cell[i], d.traffic.drop);
    }
    if (sim.tick % 15) return;
    let known = 0, unknown = 0;
    const r2 = d.trail.sniff * d.trail.sniff;
    items.each(d.food, (c, n, store) => {
      if (!n || store) return;
      if (C.known(c)) { known += n; return; }
      const x = (c % W) + 0.5, y = ((c / W) | 0) + 0.5;
      for (let i = 0; i < sim.count; i++) {
        const dx = sim.px[i] - x, dy = sim.py[i] - y;
        if (dx * dx + dy * dy > r2 || sim.type[i] === QUEEN || !C.ours(i)) continue;
        C.tookFrom(c); C.stats.found++; known += n;
        if (C.onEvent) C.onEvent('found', c, n);
        return;
      }
      unknown += n;
    });
    C.knownCrumbs = known; C.unknownCrumbs = unknown;
    const s2 = d.alarm.sight * d.alarm.sight;                     // an enemy seen by any of the colony: alarm where it stands
    for (let e = 0; e < sim.count; e++) {
      if (C.ours(e)) continue;
      for (let i = 0; i < sim.count; i++) {
        if (!C.ours(i)) continue;
        const dx = sim.px[i] - sim.px[e], dy = sim.py[i] - sim.py[e];
        if (dx * dx + dy * dy <= s2) { scent.add(d.alarm.layer, sim.cell[e], d.alarm.seen); break; }
      }
    }
    if (sim.tick % d.scouts.every === 0) {                        // new spots for the scouts: anywhere on the surface
      C.scoutSpots = [];
      const top = C.surface();
      for (let k = 0; k < d.scouts.spots && top.length; k++) C.scoutSpots.push(d.surface * W + top[(sim.rnd() * top.length) | 0]);
      sim.world.fieldChanged('scout');
    }
  }

  // While a rival nest lies in the earth, its ants come: announced, then in over one end of the surface.
  function raids(sim) {
    const R = d.raids;
    if (C.rivals <= 0 || C.population() < R.fromAnts) { C.raid = null; nextRaid = 0; return; }
    if (!nextRaid) nextRaid = sim.tick + R.every[0] + Math.round(sim.rnd() * (R.every[1] - R.every[0]));
    if (!C.raid && sim.tick >= nextRaid - R.warn && C.mayGoOut()) {
      C.raid = { at: Math.max(nextRaid, sim.tick + R.warn), side: sim.rnd() < 0.5 ? -1 : 1, size: Math.max(R.least, Math.min(R.most, Math.round(C.population() / R.perAnts))) };
      if (C.onEvent) C.onEvent('raid coming', C.raid);
    }
    if (C.raid && sim.tick >= C.raid.at) {
      const top = C.surface(), x = C.raid.side < 0 ? top[0] : top[top.length - 1], raid = C.raid;
      foes.wave({ type: d.raider, count: raid.size, cells: [d.surface * W + x], gap: R.gap, init: i => { leaveAt[i] = sim.tick + R.stay; } });
      C.stats.raids++; C.raid = null; nextRaid = 0;
      if (C.onEvent) C.onEvent('raid', raid);
    }
  }

  function onTick(sim) {
    scents(sim);
    if (sim.tick % CHECK) return;
    keepSeat();
    for (let i = 0; i < sim.count; i++) {
      if (sim.type[i] === QUEEN) {                               // she does not age; she starves only after a long time unfed
        if (sim.needsOf[i * sim.K + HUNGER] >= 0.97) { queenStarving += CHECK; if (queenStarving > d.queenStarves) sim.remove(i, 'hunger'); } else queenStarving = 0;
        continue;
      }
      if (!C.ours(i)) continue;                                  // enemies are not the colony's
      const age = sim.age[i];
      if (span[i] && age > span[i]) { sim.remove(i, 'old age'); continue; }
      if (isWorker[sim.type[i]]) {                               // a worker's age decides what it is; a major stays a major
        let t = ageTypes[ageTypes.length - 1];
        for (let k = 0; k < d.ages.length; k++) if (age < d.ages[k].until) { t = ageTypes[k]; break; }
        if (t !== sim.type[i]) { sim.setType(i, t); d.changed(i); }
      }
      const h = i * sim.K + HUNGER;
      sim.deny[i] = (sim.needsOf[h] < d.eatAbove ? sim.deny[i] | (1 << EAT) : sim.deny[i] & ~(1 << EAT)) >>> 0;   // not hungry enough to spend a crumb
      if (sim.needsOf[h] >= 0.9 && items.carrying(i) === d.food) { items.use(i); sim.needsOf[h] = 0; C.stats.eaten++; d.changed(i); }
      if (sim.needsOf[h] >= 0.97) { starving[i] += CHECK; if (starving[i] > d.starvesAfter) sim.remove(i, 'hunger'); }
      else starving[i] = 0;
    }
    if (C.flying && sim.tick > C.flying) C.flying = 0;
    if (!C.flying && flightDay !== weather.dayNo && C.mayGoOut() && weather.now !== d.heatKind && weather.hour > 0.06 && weather.hour < 0.45 && C.enemies() === 0) {
      let ripe = 0; for (let i = 0; i < sim.count; i++) if (sim.type[i] === PRINCESS && sim.age[i] >= d.flight.ripe) ripe++;
      if (ripe) { C.flying = sim.tick + d.flight.window; flightDay = weather.dayNo; if (C.onEvent) C.onEvent('flight', ripe); }
    }
    const q = C.queen(), qc = q >= 0 ? sim.cell[q] : -1;
    if (qc !== queenCell) { queenCell = qc; sim.world.fieldChanged('queen'); }

    // brood: each egg and each pupa in a brood room has the same small chance every second, so they do not all turn at once
    const B = d.brood, pEgg = CHECK / B.eggAfter, pPupa = CHECK / B.pupaAfter;
    for (const c of d.broodCells()) {
      for (let n = items.at(d.egg, c); n > 0; n--) if (sim.rnd() < pEgg) { items.take(d.egg, c, 1); items.put(d.larva, c, 1); }
      for (let n = items.at(d.pupa, c); n > 0; n--) if (sim.rnd() < pPupa) {
        const i = sim.add((c % W) + 0.5, ((c / W) | 0) + 0.5, { type: C.majors() < C.majorsWanted() ? d.major : C.princesses() < C.princessesWanted() ? d.princess : d.ages[0].type });
        if (i < 0) break;
        items.take(d.pupa, c, 1); C.stats.hatched++;
        for (let k = 0; k < sim.K; k++) sim.needsOf[i * sim.K + k] = 0.3;
        if (C.onEvent) C.onEvent('hatched', i);
      }
    }

    if (items.room(d.soil) < 4 && ground.count > 0) {             // the mound is full and there is more to come: let it grow
      C.moundHeight++; C.layMound();
      if (C.onEvent) C.onEvent('mound', C.moundHeight);
    }
    if (C.target && C.canPay(d.priceOf(C.target))) {              // saved enough: buy it
      const t = C.target, ok = d.buy(t);
      C.target = null;
      if (C.onEvent) C.onEvent('bought', t, ok);
    }
    if (sim.tick % 60 === 0) {                                   // gardens ripen with time: say which cells are ready now
      let n = 0; for (const c of d.gardenCells()) if (C.ripe(c)) n++;
      if (n !== C.ripeCells) { C.ripeCells = n; sim.world.fieldChanged('garden ripe'); }
    }
    raids(sim);
    const raining = weather.now === d.rainKind;
    if (raining) water.pour(C.entrances().length * d.rain.perSecond * CHECK / d.second);   // rain comes in by every open way out
    if (raining !== wasRaining) {
      wasRaining = raining;
      if (raining) { for (const x of C.surface()) scent.set(d.trail.layer, d.surface * W + x, 0); }   // the rain washes every trail off the surface: what was known out there must be found again
      else { afterRain = d.rain.after; if (C.onEvent) C.onEvent('after rain', afterRain); }             // and when it stops, worms and drowned insects lie about
    }
    if (sim.tick % d.cave.every < CHECK) ground.settle(() => sim.rnd(), d.cave.chance * (weather.now === d.rainKind ? d.cave.rain : 1), c => d.holds(c % W, (c / W) | 0));
    const F = d.finds, top = C.surface(), share = top.length / F.per;   // a wider surface: more finds, and more may lie about
    if (weather.now === d.heatKind && sim.tick % d.heat.spoilEvery < CHECK) for (const x of top) items.take(d.food, d.surface * W + x, 1);   // heat dries what lies out
    if (weather.now !== d.rainKind) findDue += CHECK / F.every * share * (weather.now === d.heatKind ? d.heat.finds : 1);   // food turns up by night too: it is there at dawn
    const washedUp = afterRain > 0 && !raining && top.length > 0;   // one of the finds the rain left, whatever lies about already
    if (washedUp) afterRain--;
    if (!washedUp && findDue >= 1 && items.loose(d.food) >= F.atMost * share) findDue = 1;   // enough lies about: wait
    else if (washedUp || findDue >= 1) {
      if (!washedUp) findDue -= 1;
      const ways = C.entrances();
      for (let tries = 0; tries < 20; tries++) {
        const x = top[(sim.rnd() * top.length) | 0];
        if (ways.some(e => Math.abs(e - x) < F.clear)) continue;
        const n = F.size[0] + ((sim.rnd() * (F.size[1] - F.size[0] + 1)) | 0), cell = d.surface * W + x;
        items.put(d.food, cell, n); C.stats.finds++;
        if (C.onEvent) C.onEvent('find', cell, n);
        break;
      }
    }
  }
  function onGone(i, cause, sim) {
    if (sim.type[i] === RIVAL) {                                 // a rival queen is dead: her nest is done, and her ants give up
      const x = sim.px[i] | 0, y = sim.py[i] | 0;
      const f = d.features.find(q => q.kind === 'rival' && !q.cleared && q.rect && x >= q.rect[0] - 1 && x <= q.rect[2] + 1 && y >= q.rect[1] - 1 && y <= q.rect[3] + 1) ?? d.features.find(q => q.kind === 'rival' && q.queen && !q.cleared);
      if (f) { f.cleared = true; C.rivals--; }
      for (let k = 0; k < sim.count; k++) if (sim.type[k] === RAIDER) leaveAt[k] = 0;
      if (C.onEvent) C.onEvent('rival dead', f);
      return;
    }
    if (sim.type[i] === RAIDER || cause === 'flew') return;
    if (sim.type[i] === QUEEN) {                                 // the queen is dead: a princess in the nest takes her place, or it is the end
      let heir = -1; for (let k = 0; k < sim.count; k++) if (k !== i && sim.type[k] === PRINCESS) { heir = k; break; }
      if (heir >= 0) { sim.setType(heir, QUEEN); span[heir] = 0; sim.needsOf[heir * sim.K + HUNGER] = 0; queenStarving = 0; if (C.onEvent) C.onEvent('heir', heir); }
      else { C.ended = true; if (C.onEvent) C.onEvent('ended', cause); }
      return;
    }
    C.stats.died[cause] = (C.stats.died[cause] ?? 0) + 1; if (C.onEvent) C.onEvent('died', i, cause);
  }

  /** Hand this to the engine: `modules: [colony.module, …]`. */
  // What a saved game must keep of the colony itself. Everything on the map and every ant is saved by the others.
  C.save = () => ({ moundHeight: C.moundHeight, unlocked: C.unlocked, stats: C.stats, ended: C.ended, flightDay, lastFed, findDue,
                    features: d.features.map(f => [f.found ? 1 : 0, f.cleared ? 1 : 0, f.queen ? 1 : 0]) });
  C.load = s => {
    if (!s) return;
    C.seat = -1; C.sim.world.fieldChanged('seat');
    C.moundHeight = s.moundHeight; C.unlocked = s.unlocked ?? {}; C.stats = { ...C.stats, ...s.stats }; C.ended = !!s.ended;
    flightDay = s.flightDay ?? 0; lastFed = s.lastFed ?? 0; findDue = s.findDue ?? 0; C.target = null; C.raid = null; nextRaid = 0; surface = null;
    (s.features ?? []).forEach((f, k) => { const q = d.features[k]; if (q) { q.found = !!f[0]; q.cleared = !!f[1]; q.queen = !!f[2]; } });
    C.rivals = d.features.filter(f => f.kind === 'rival' && !f.cleared).length;
    for (const c of d.gardenCells()) ripeAt[c] = C.sim.tick + d.garden.every;
    for (const n of ['known food', 'scout', 'garden ripe', 'exit', 'queen']) C.sim.world.fieldChanged(n);
  };

  C.module = { name: 'colony', setup, onSpawn, canUse, onFinish, onTick, onGone, save: () => C.save(), load: s => C.load(s) };
  return C;
}
