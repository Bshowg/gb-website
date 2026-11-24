// The Colony: dig and haul, rooms and brood, scent, the growing map, water and weather, enemies, the long game. An ant nest seen from the side. The player marks
// earth and the ants dig it out; the player names rooms and the ants use them. The queen lays, the brood is
// carried, fed and raised, and an ant's age decides what work it listens to. This file holds the numbers; the
// colony's own rules are in rules.js.
//
// What it is built from:
//   modules/ground.js   earth that can be marked and dug, a load at a time
//   modules/items.js    soil, crumbs and brood as things on the map, in piles, in stores, or carried
//   modules/zones.js    rooms: open cells the player has given a purpose
//   modules/scent.js    fading fields: the food trail, the player's marks, where ants have walked
//   modules/weather.js  day and night, calm, rain and heat
//   modules/water.js    water that falls, pools and soaks away
//   modules/progress.js goals, achievements and the score kept from one colony to the next
//   modules/foes.js     sides, and fights where enemies meet
//   modules/claims.js   the map as chunks the colony holds or may claim
//   modules/tasks.js    work posted by the world: nobody has a job, every ant takes what calls loudest
//   modules/mapgen.js   the kinds of ground

import { createItems } from './modules/items.js';
import { createGround } from './modules/ground.js';
import { createZones } from './modules/zones.js';
import { createScent } from './modules/scent.js';
import { createWeather } from './modules/weather.js';
import { createWater } from './modules/water.js';
import { createFoes } from './modules/foes.js';
import { createProgress } from './shared/modules/progress.js';
import { createClaims } from './modules/claims.js';
import { createTasks } from './modules/tasks.js';
import { generateMap, seeded } from './shared/modules/mapgen.js';
import { createColony } from './rules.js';

// ───────────────────────── the clock ─────────────────────────
export const TICKS_PER_SECOND = 30;
/** Real seconds at 1× speed → ticks. */
export const seconds = s => Math.round(s * TICKS_PER_SECOND);
export const minutes = m => seconds(m * 60);

const TYPICAL = 0.6;               // a need is acted on at around this level

// ───────────────────────── ants ─────────────────────────
// `fullAfter`: time for the need to go from satisfied to desperate if ignored.
export const NEEDS = [
  { name: 'hunger', fullAfter: seconds(240), weight: 1.3 },
  { name: 'tired',  fullAfter: seconds(300), weight: 1.0 },
];
export const STARVES_AFTER = seconds(150);         // how long an ant lasts once it is desperately hungry
export const EAT_TAKES = seconds(4);               // one crumb
export const EAT_ABOVE = 0.5;                      // an ant does not spend a crumb while it is less hungry than this
export const REST_TAKES = seconds(8);              // a rest in a resting room
export const NAP_TAKES = seconds(20);              // a rest taken wherever the ant is: slower, and in everyone's way
export const NAP_PULL = 0.6;                       // how much less an ant wants a nap than a proper rest

// An ant's age decides what it is, and so what work it listens to: the young stay deep with the brood, the grown
// dig and haul, the old go outside. `until`: the age this lasts to. `walk` is cells per second.
// `listens`: how loudly each task calls it (see WORK.bias for the others); -100 = never.
export const AGES = [
  { type: 'young', until: minutes(4), walk: 3.6, look: { color: '#8a5a34', size: 0.85 },
    listens: { 'pick up eggs': 0.5, 'fetch a meal': 0.5, 'tend garden': 0.4, dig: 0.14, 'clear soil': 0.14, 'fetch food': -100, scout: -100 } },
  { type: 'grown', until: minutes(13), walk: 4.2, look: { color: '#3d2a1c', size: 1.0 },
    listens: { dig: 0.35, 'clear soil': 0.3, 'pick up eggs': 0.2, 'fetch a meal': 0.2, 'fetch food': 0.28, scout: 0.26 } },
  { type: 'old', until: Infinity, walk: 4.0, look: { color: '#1c130c', size: 1.0 },
    // The old still dig, and will nurse or garden if nobody younger does: each of those calls them just loudly enough to act on.
    listens: { 'fetch food': 0.4, scout: 0.3, dig: 0.25, 'clear soil': 0.25, 'pick up eggs': 0.23, 'fetch a meal': 0.23, 'tend garden': 0.23 } },
];
export const LIFESPAN = minutes(20), LIFESPAN_SPREAD = 0.2;
// Shown ages only: a real minute of an ant's life is counted as this many days on the cards and in the help, so a
// worker's twenty minutes read as about two months. The simulation itself keeps ticks.
export const SHOWN_DAYS_PER_MINUTE = 3;
export const shownDays = t => Math.max(0, Math.floor(t / minutes(1) * SHOWN_DAYS_PER_MINUTE));
export const QUEEN = { type: 'queen', walk: 0.5, look: { color: '#4a2a5a', size: 1.5 } };

// ───────────────────────── fighting ─────────────────────────
// A major is the colony's fighter: big, slow to starve no slower than anyone, and no use for work. The colony keeps one
// for every `perMajor` cells of guard room. `strength` is about what one blow takes off; `health` what an ant can lose.
export const MAJOR = { type: 'major', walk: 3.4, look: { color: '#7a2a1c', size: 1.4 }, hungrier: 1.6 };
export const RAIDER = { type: 'raider', walk: 4.4, look: { color: '#c8382c', size: 1.0 } };
export const RIVAL_QUEEN = { type: 'rival queen', walk: 0.3, look: { color: '#8a1c5a', size: 1.5 } };
export const GUARD = { perMajor: 3, stand: seconds(6) };
export const FIGHT = { reach: 0.9, every: 10, heal: 0.05, fighters: {
  young: { strength: 0.6, health: 3 }, grown: { strength: 1, health: 4.5 }, old: { strength: 1, health: 4.5 },
  major: { strength: 5, health: 14 },                         // the colony's queen is not listed: raiders are after food, and pass her by
  raider: { strength: 1.1, health: 4 }, 'rival queen': { strength: 0, health: 25 },
} };
// Alarm: an ant that sees an enemy within `sight` cells leaves `seen` where the enemy stands; a blow leaves `blow`.
export const ALARM = { layer: 'alarm', sight: 4, seen: 0.5, blow: 0.5, above: 0.1 };
// Raids come while a rival nest lies in the earth and the colony has `fromAnts` ants: one every `every` (from-to), of one
// raider for every `perAnts` ants (at least `least`, at most `most`), announced `warn` ahead. A raider gives up after `stay`.
export const RAIDS = { fromAnts: 55, every: [minutes(4), minutes(7)], perAnts: 14, least: 4, most: 14, warn: seconds(25), stay: seconds(90), gap: 12 };
export const RIVAL = { guards: 12, crumbs: 80 };

// ───────────────────────── the long game ─────────────────────────
// A colony of `fromAnts` raises a princess for every `perPrincess` cells of flight room. On a calm morning with no enemy
// about, those at least `ripe` old walk out and fly, for `window`. Each has `founds` chance of founding a colony
// somewhere else. A princess in the nest when the queen dies takes her place.
export const PRINCESS = { type: 'princess', walk: 3.2, look: { color: '#b08ad0', size: 1.25 }, hungrier: 1.5 };
export const FLIGHT = { fromAnts: 100, perPrincess: 4, ripe: minutes(2), window: seconds(50), founds: 0.5, wait: seconds(6) };
export const QUEEN_STARVES = minutes(3);            // how long the queen lasts once she is desperately hungry
// One at a time, in this order: they walk a new player through the game.
const goal = (id, title, text, stat, atLeast, label) => ({ id, title, text, when: { stat, atLeast, label } });
export const GOALS = [
  goal('dig', 'Dig a tunnel', 'open Dig and drag from open ground into the earth', 'dug', 5, 'cells dug'),
  goal('brood', 'Name a brood room', 'dig a room, then paint it brood in Rooms: the eggs by the queen are waiting', 'rooms.brood', 6, 'cells of brood room'),
  goal('hatch', 'Raise ten ants', 'eggs become larvae, larvae are fed, pupae hatch', 'hatched', 10, 'ants hatched'),
  goal('store', 'Make room for 150 crumbs', 'larvae are fed from surplus: a bigger food room is how the colony grows', 'space', 150, 'crumbs of room'),
  goal('claim', 'Claim a chunk', 'tap the dark ground beside the nest, or open Claim', 'held', 7, 'chunks held'),
  goal('rain', 'See the third day', 'by then it will have rained: a pit below the shaft, or a plug in the entrance', 'day', 3, 'days'),
  goal('fungus', 'Find fungus', 'claim a chunk with pale threads in the soil and dig to the ?', 'fungus', 1, 'fungus found'),
  goal('garden', 'Keep 20 cells of garden', 'paint dug-out ground garden in Rooms', 'rooms.garden', 20, 'cells of garden'),
  goal('majors', 'Raise three majors', 'name a guard room: one major for every 3 cells', 'majors', 3, 'majors'),
  goal('hundred', 'Grow to 100 ants', 'more surface, more garden, a bigger store', 'ants', 100, 'ants'),
  goal('raid', 'Kill ten raiders', 'majors near the way in, or a plug', 'raidersKilled', 10, 'raiders killed'),
  goal('rival', 'Take a rival nest', 'claim a chunk with movement in the soil, dig to the ?, and kill its queen', 'rivalsDead', 1, 'rival queens dead'),
  goal('flight', 'Send a princess on the flight', 'name a flight room once the colony has 100 ants', 'flown', 1, 'princesses flown'),
  goal('deep', 'Hold ground in the bottom row', 'the deepest chunks need 140 ants', 'depth', 6, 'rows deep'),
];
// Earned once and kept from one colony to the next (stored on the device).
const feat = (id, title, text, stat, atLeast) => ({ id, title, text, when: { stat, atLeast } });
export const ACHIEVEMENTS = [
  feat('daughter', 'A daughter colony', 'a princess founds a colony', 'daughters', 1),
  feat('dynasty', 'A dynasty', 'five daughter colonies, over all your colonies', 'daughters', 5),
  feat('great', 'A great colony', '150 ants at once', 'ants', 150),
  feat('gardener', 'Gardener', 'grow 500 crumbs in one colony', 'grown', 500),
  feat('alone', 'No rivals left', 'all three rival queens dead', 'rivalsDead', 3),
  feat('half', 'Half the world', 'hold 21 chunks', 'held', 21),
  feat('deep', 'The deep', 'hold ground in the bottom row', 'depth', 6),
];

// ───────────────────────── the brood ─────────────────────────
// The queen lays one egg per spell of laying, while she is fed and fewer than `waiting` eggs lie about outside a
// brood room. Each egg makes her hungrier by `eggCost`; she stops above `layBelow` and is brought a crumb above
// QUEEN_HUNGRY. An egg in a brood room becomes a larva after about `eggAfter`; a larva becomes a pupa when fed one
// crumb; a pupa becomes an ant after about `pupaAfter`. She also stops while `unfed` larvae are waiting, and larvae are
// fed only from what the store holds beyond `reserve` crumbs for every ant. While the colony saves for a claim, the price
// is kept back too, but one larva is still fed every `whileSaving`.
export const BROOD = { lay: seconds(10), waiting: 6, eggCost: 0.2, layBelow: 0.85, eggAfter: seconds(40), pupaAfter: seconds(60), unfed: 8, reserve: 0.8, whileSaving: seconds(15) };
export const QUEEN_HUNGRY = 0.4;

// ───────────────────────── the ground ─────────────────────────
// `loads`: how many bites it takes to dig a cell out (and how many loads of soil come out of it). None: cannot be dug.
// `span`: the widest room this ground will stand over as a roof; wider, and it falls in. `soak`: the chance, five times a
// second, how much water (in cells) a flooded cell touching it loses.
export const GROUND = {
  loam:  { loads: 3, soak: 0.002, color: '#8a6844', color2: '#836240' },
  sand:  { loads: 2, soak: 0.008, span: 3, color: '#b39664', color2: '#a98c5c' },
  clay:  { loads: 6, soak: 0, color: '#7c4f3a', color2: '#744a36' },
  stone: { soak: 0, color: '#77726c', color2: '#6c6761' },
  plug:  { loads: 1, soak: 0, color: '#5e452c', color2: '#574028' },   // soil packed into a tunnel by the player: a way shut, opened again by digging
};
// ───────────────────────── weather and water ─────────────────────────
// A day is `day` long and its last `night` share is night. Each kind of weather comes by `weight` and lasts between the two
// times; what comes next is announced `warn` ahead. The first `quiet` of the game is calm.
export const WEATHER = { day: minutes(4), night: 0.25, warn: seconds(45), quiet: minutes(6), start: 'calm', kinds: {
  calm: { weight: 5, lasts: [seconds(60), seconds(150)] },
  rain: { weight: 2, lasts: [seconds(40), seconds(80)] },
  heat: { weight: 1.5, lasts: [seconds(60), seconds(120)] },
} };
export const PERISHABLE = ['egg', 'larva', 'pupa'];               // what is lost when its cell floods or is buried; food under water is only out of reach
export const RAIN = { perSecond: 0.25, after: 3 };               // water (in cells) coming in by each open way out; finds that turn up when the rain stops
export const WATER = { every: 6, dry: 0.0003, puddle: 0.01, color: '#4f86b8' };   // the level is worked out five times a second; a little dries up anyway
export const HEAT = { finds: 0.4, spoilEvery: seconds(10) };     // in heat finds turn up this much less often, and each surface pile loses a crumb this often
export const CAVE = { every: seconds(5), chance: 0.15, rain: 4 };   // a roof too wide is tried this often, with this chance of losing a cell, more in rain
// How much of the map each kind takes, and how big its patches are, in cells. The rest is loam.
export const LAYERS = [
  { layer: 'stone', amount: 0.05, scale: 7 },
  { layer: 'clay', amount: 0.16, scale: 16 },
  { layer: 'sand', amount: 0.12, scale: 12 },
];

// ───────────────────────── things ─────────────────────────
// `slow`: how much slower an ant walks with one in its jaws.
export const ITEMS = {
  soil:  { slow: 0.8, color: '#5e452c' },
  crumb: { slow: 0.9, color: '#f2d15c' },
  egg:   { slow: 1, color: '#fbf7ea' },
  larva: { slow: 0.9, color: '#f0dcae' },
  pupa:  { slow: 0.9, color: '#c9a070' },
};

// ───────────────────────── scent ─────────────────────────
// Each layer halves every `halfLife`; `max` is the most a cell can hold.
export const SCENT = {
  trail:   { halfLife: seconds(40), max: 3, color: '#2f6fd0', text: 'food this way: makes a find known at once' },
  gather:  { halfLife: seconds(60), max: 1, color: '#d08a2f', text: 'ants with nothing to do collect here' },
  keepout: { halfLife: seconds(120), max: 1, color: '#c8382c', text: 'ants go round, unless there is no other way' },
  traffic: { halfLife: seconds(15), max: 1, color: '#7a3fb0' },
  alarm:   { halfLife: seconds(10), max: 3, color: '#e0261a', text: 'majors come here' },
};
// A pile is known while its spot smells of trail more than `known`. An ant carrying food home leaves `carried` on each
// cell (five times a second); taking a crumb marks the spot with `atFind`; an ant within `sniff` cells of an unknown pile
// finds it. `painted` is what the player's trail mark lays, and `mark` what the other marks lay.
export const TRAIL = { layer: 'trail', known: 0.1, carried: 0.12, atFind: 1, sniff: 3.5, painted: 3, mark: 1 };
export const TRAFFIC = { layer: 'traffic', drop: 0.06 };
export const SCOUTS = { spots: 3, every: seconds(6), ants: 4 };   // scouts walk to this many random spots on the surface, this many ants at most
export const KEEP_OUT = { above: 0.1, cost: 160 };              // a marked cell counts as 40 cells of walking
export const GATHER = { above: 0.1, stay: seconds(4), perCell: 3 };
// A cell holds `room` ants at full speed. Each one more slows everyone on it: a busy tunnel one cell wide jams.
export const CROWD = { room: 2, slow: 0.35 };

// ───────────────────────── rooms ─────────────────────────
// A room is open ground the player has given a purpose. `holds`: what may be stored on one cell of its floor, and how
// many. Things lie on a floor: the cells of a room that have open ground under them hold nothing.
export const ROOMS = {
  // `one`: the colony has a single room of this kind. To name another, the player first takes the purpose off the old one.
  queen: { holds: {}, color: '#c05a8a', one: true, text: 'the queen sits here and lays; there is only one, so clear it before naming another' },
  food:  { holds: { crumb: 16 }, color: '#d9a441', text: 'crumbs are stored here, on the floor' },
  brood: { holds: { egg: 3, larva: 3, pupa: 3 }, color: '#e8d8f0', text: 'eggs are brought here and raised' },
  rest:  { holds: {}, color: '#6fa3b0', text: 'ants rest here, faster than in a tunnel' },
  // `needs`: something the colony must have found in the earth before it can name this kind of room.
  flight: { holds: {}, color: '#b08ad0', text: 'princesses are raised here once the colony has 100 ants, one for every 4 cells; they fly on a calm morning' },
  guard:  { holds: {}, color: '#b5553a', text: 'majors stand here: the colony raises one for every 3 cells' },
  garden: { holds: { crumb: 2 }, color: '#7fa66a', text: 'fungus grows here: each cell gives a crumb when it is tended', needs: 'fungus' },
};
// A garden cell is ready `every` after it was last tended (or planted); tending takes `tend`.
export const GARDEN = { every: seconds(45), tend: seconds(5) };

// ───────────────────────── work ─────────────────────────
// `bias` is how loudly a task calls an idle ant, unless its age says otherwise (AGES). An ant that is wandering stays
// wandering unless something calls louder than about 0.22 (idling's own pull plus the pull of what it is already doing). A carried load calls loudest,
// so what is picked up gets delivered; a crumb in the jaws goes to a hungry mouth before it goes to the store.
export const WORK = {
  bite: seconds(1.5),              // one load out of a marked cell
  handle: seconds(0.3),            // picking a thing up or putting it down
  feed: seconds(1),                // feeding a larva or the queen
  perFace: 2,                      // ants that can work at one marked cell at a time
  perCrumb: 0.5,                   // ants sent for each crumb lying about
  bias: { dig: 0.3, 'clear soil': 0.3, 'fetch food': 0.3, scout: 0.26, gather: 0.27, 'tend garden': 0.3, 'pick up eggs': 0.3, 'pick up larvae': 0.3, 'pick up pupae': 0.3, 'fetch a meal': 0.3,
          deliver: 0.8, 'store food': 0.7, 'feed brood': 0.95, 'feed the queen': 0.95 },
};

// ───────────────────────── the surface ─────────────────────────
// Soil is dropped around each way out: none within `clear` cells of the hole, `height` loads on the next cell,
// `slope` fewer on each cell further off. A full mound grows by one load of height at a time.
export const MOUND = { clear: 1, height: 4, slope: 1 };
// Food turns up on the surface: every so often, a pile of so many crumbs, not within `clear` cells of a way out,
// and not while more than `atMost` crumbs already lie about.
// Both go by the width of surface the colony holds: one find every `every` for each `per` cells of it.
export const FINDS = { every: seconds(18), per: 40, size: [14, 30], atMost: 60, clear: 4 };

// ───────────────────────── the nest at the start ─────────────────────────
// ───────────────────────── the world ─────────────────────────
// The whole world is there from the start, as chunks. The colony holds a few and claims the rest one at a time.
export const CHUNK = 20;                           // cells on a side
export const WORLD = { cols: 7, rows: 6, held: [[2, 0], [3, 0], [2, 1], [3, 1], [2, 2], [3, 2]] };
export const MAP = { width: WORLD.cols * CHUNK, height: WORLD.rows * CHUNK, seed: 11 };
// What a chunk is made of. `text` is how it reads before it is claimed; `layers`: how much of each kind of ground, the rest loam.
export const CHUNKS = {
  mixed: { text: 'mixed ground', layers: LAYERS },
  loam:  { text: 'loam, quick to dig', layers: [{ layer: 'stone', amount: 0.03, scale: 7 }, { layer: 'clay', amount: 0.06, scale: 14 }] },
  sand:  { text: 'sand, quickest to dig', layers: [{ layer: 'sand', amount: 0.6, scale: 14 }, { layer: 'stone', amount: 0.03, scale: 7 }] },
  clay:  { text: 'clay, slow to dig', layers: [{ layer: 'clay', amount: 0.6, scale: 16 }, { layer: 'stone', amount: 0.04, scale: 7 }] },
  stony: { text: 'stones to dig round', layers: [{ layer: 'stone', amount: 0.3, scale: 6 }, { layer: 'clay', amount: 0.1, scale: 14 }] },
};
// What the earth can hide in a chunk. `sign` is all the colony knows before it digs there; `chunks`: how many chunks have one.
export const HIDDEN = {
  cache:  { sign: 'a sweet smell', chunks: 7, crumbs: 60, text: 'a cache of food' },
  hollow: { sign: 'a hollow sound', chunks: 5, w: 7, h: 3, text: 'the empty rooms of an old nest' },
  fungus: { sign: 'pale threads in the soil', chunks: 3, text: 'fungus: the colony can now keep gardens' },
  rival:  { sign: 'movement in the soil', chunks: 3, w: 7, h: 3, text: 'a rival nest: its queen and her guard are awake' },
};
// A claim is paid in crumbs from the store: `base` for the first, `grow` times more for each one after, and `deeper`
// more for each row down. `ants`: the colony must be this big to claim in a row that deep, or in the outermost columns.
export const CLAIM = { base: 24, grow: 1.3, deeper: 0.15, ants: { rows: [0, 0, 0, 60, 100, 140], outer: 100 }, rim: 5, keep: 1 };   // `keep`: crumbs for every ant a claim must leave in the store (a night indoors)

export const SURFACE = 7;                          // the row ants walk on above ground; sky above it, earth below
export const SHAFT_X = 2 * CHUNK + 20;
// The nest at the start: the shaft comes down into a central room with no purpose, the lowest place in the nest.
// From the top of its right wall a tunnel climbs to the food room, and from the top of its left wall one climbs to
// the queen's room; both rooms' floors are above the central room's roof. Rain fills the lowest place first, so the
// central room takes it and the two rooms stay dry in an ordinary shower, and the ways to them stay open longest.
export const CHAMBER = { x: SHAFT_X - 3, y: 15, w: 7, h: 3 };    // the central room, at the foot of the shaft
export const FOOD_ROOM = { x: SHAFT_X + 6, y: 12, w: 8, h: 3 };  // to the right: crumbs are stored on its floor
export const QUEEN_ROOM = { x: SHAFT_X - 9, y: 13, w: 4, h: 2 }; // to the left: the queen's own
export const START = { workers: 40, crumbs: 48, oldest: minutes(12) };

// What every chunk is, decided from the seed before anything is laid: its ground, and what it hides.
function planWorld(seed) {
  const rnd = seeded(seed * 7919 + 1), plan = [], startsHeld = (c, r) => WORLD.held.some(h => h[0] === c && h[1] === r);
  for (let row = 0; row < WORLD.rows; row++) for (let col = 0; col < WORLD.cols; col++) {
    const r = rnd();
    const kind = startsHeld(col, row) ? 'mixed' : row === 0 ? (r < 0.5 ? 'sand' : 'loam') : row >= 4 ? (r < 0.4 ? 'clay' : r < 0.7 ? 'stony' : 'loam') : (r < 0.35 ? 'loam' : r < 0.6 ? 'clay' : r < 0.8 ? 'sand' : 'stony');
    plan.push({ col, row, kind, hides: null });
  }
  // Something hidden in some of the chunks under the surface row. One fungus is always in a chunk beside the first nest.
  const free = plan.filter(p => p.row > 0 && !startsHeld(p.col, p.row));
  const take = ok => { const list = free.filter(p => !p.hides && ok(p)); return list.length ? list[(rnd() * list.length) | 0] : null; };
  const beside = p => p.row <= 2 && (p.col === 1 || p.col === 4);
  const far = p => !beside(p);
  const hide = (p, kind) => { if (!p) return; const H = HIDDEN[kind], x0 = p.col * CHUNK, y0 = p.row * CHUNK, w = H.w ?? 1, h = H.h ?? 1;
    const x = x0 + 3 + ((rnd() * (CHUNK - 6 - w)) | 0), y = y0 + 3 + ((rnd() * (CHUNK - 6 - h)) | 0);
    p.hides = { kind, x, y, cell: y * MAP.width + x, rect: H.w ? [x, y, x + w - 1, y + h - 1] : undefined, crumbs: H.crumbs, found: false }; };
  hide(take(beside), 'fungus');
  for (let n = 0; n < HIDDEN.rival.chunks; n++) hide(take(p => (p.col <= 1 || p.col >= WORLD.cols - 2) && far(p)), 'rival');   // rivals keep to the outer chunks, not right beside the first nest
  for (const kind of Object.keys(HIDDEN)) if (kind !== 'rival') for (let n = kind === 'fungus' ? 1 : 0; n < HIDDEN[kind].chunks; n++) hide(take(() => true), kind);
  return plan;
}
let plan = planWorld(MAP.seed);

function layNest(w) {
  for (let x = 1; x < w.w - 1; x++) for (let y = 1; y <= SURFACE; y++) w.set(x, y, 'sky');
  for (const [col, row] of WORLD.held) if (row === 0) for (let x = Math.max(1, col * CHUNK); x < Math.min(w.w - 1, (col + 1) * CHUNK); x++) w.set(x, SURFACE, 'air');
  for (let y = SURFACE + 1; y < CHAMBER.y; y++) w.set(SHAFT_X, y, 'tunnel');
  w.rect(CHAMBER.x, CHAMBER.y, CHAMBER.w, CHAMBER.h, 'tunnel');
  w.rect(FOOD_ROOM.x, FOOD_ROOM.y, FOOD_ROOM.w, FOOD_ROOM.h, 'tunnel');
  // Each side tunnel leaves the central room by its top row, runs two cells out and steps up to the side room's floor.
  const right = CHAMBER.x + CHAMBER.w, left = CHAMBER.x - 1;
  for (let x = right; x < FOOD_ROOM.x; x++) w.set(x, CHAMBER.y, 'tunnel');
  w.set(FOOD_ROOM.x - 1, FOOD_ROOM.y + FOOD_ROOM.h - 1, 'tunnel');
  for (let x = left; x >= QUEEN_ROOM.x + QUEEN_ROOM.w; x--) w.set(x, CHAMBER.y, 'tunnel');
  w.set(QUEEN_ROOM.x + QUEEN_ROOM.w, QUEEN_ROOM.y + QUEEN_ROOM.h - 1, 'tunnel');
  w.rect(QUEEN_ROOM.x, QUEEN_ROOM.y, QUEEN_ROOM.w, QUEEN_ROOM.h, 'tunnel');
  for (const p of plan) {                                       // each chunk its own ground; only untouched earth is changed
    generateMap(w, { seed: MAP.seed + 31 * (p.row * WORLD.cols + p.col), steps: CHUNKS[p.kind].layers, rect: [p.col * CHUNK, p.row * CHUNK, (p.col + 1) * CHUNK - 1, (p.row + 1) * CHUNK - 1] });
    if (p.hides?.rect) w.rect(p.hides.rect[0], p.hides.rect[1], p.hides.rect[2] - p.hides.rect[0] + 1, p.hides.rect[3] - p.hides.rect[1] + 1, 'tunnel');   // an old nest: rooms already dug, sealed in
  }
}

/** The view when the ground is painted from the drawn soil: full size, hard pixels, only the changed part sent again. */
export const ART_VIEW = { projection: 'flat', cell: 12, background: '#1a120c', ink: '#140a07', maxGroundSize: 4096, groundSharp: true, groundMipmaps: false, maxZoom: 8 };
/** What the painted ground needs to know of the map: see view.js. */
export const ART_GROUND = { surface: SURFACE, wall: 0.6, open: 'tunnel', wet: 'flooded' };

/** The shared modules and the colony rules of the game most recently created with makeConfig. */
export let items = null;
export let ground = null;
export let zones = null;
export let scent = null;
export let claims = null;
export let weather = null;
export let water = null;
export let foes = null;
export let progress = null;
/** May the colony dig, name rooms or lay scent on this cell? Only on ground it holds. */
export const holds = (x, y) => claims.held(x, y);
export let tasks = null;
export let colony = null;

/** Put the queen, the first workers and the first food in the nest. Call once, right after createGame (or after building the Sim, headless). */
export function populate(sim) {
  const W = sim.world.w, floor = FOOD_ROOM.y + FOOD_ROOM.h - 1;
  for (let x = FOOD_ROOM.x; x < FOOD_ROOM.x + FOOD_ROOM.w; x++) zones.set(x, floor, 'food');   // the chamber's floor starts as the food store
  for (let n = 0; n < START.crumbs; n++) items.put('crumb', floor * W + FOOD_ROOM.x + n % FOOD_ROOM.w, 1);
  colony.layMound();
  progress.add('colonies');
  for (let y = QUEEN_ROOM.y; y < QUEEN_ROOM.y + QUEEN_ROOM.h; y++) for (let x = QUEEN_ROOM.x; x < QUEEN_ROOM.x + QUEEN_ROOM.w; x++) zones.set(x, y, 'queen');
  sim.add(QUEEN_ROOM.x + QUEEN_ROOM.w / 2 + 0.5, QUEEN_ROOM.y + QUEEN_ROOM.h - 0.5, { type: 'queen' });
  for (let k = 0; k < START.workers; k++) {
    const age = Math.floor((k + 0.5) / START.workers * START.oldest), type = AGES.find(a => age < a.until).type;
    const i = sim.add(CHAMBER.x + 0.5 + (k * 3) % CHAMBER.w, CHAMBER.y + 0.5 + (k % CHAMBER.h), { type, age });
    for (let n = 0; n < sim.K; n++) sim.needsOf[i * sim.K + n] *= 0.6;
  }
}

// ───────────────────────── turned into engine config ─────────────────────────
export function makeConfig(overrides = {}) {
  items = createItems({ kinds: ITEMS, dropAfter: seconds(5) });
  ground = createGround({ kinds: Object.fromEntries(Object.entries(GROUND).filter(([, g]) => g.loads)), open: 'tunnel', perFace: WORK.perFace });
  weather = createWeather(WEATHER);
  foes = createFoes({ sides: { colony: [...AGES.map(a => a.type), MAJOR.type, QUEEN.type, PRINCESS.type], rivals: [RAIDER.type, RIVAL_QUEEN.type] }, ...FIGHT });
  water = createWater({ wet: 'flooded', into: ['tunnel'], every: WATER.every, dry: WATER.dry, puddle: WATER.puddle,
    sources: () => colony.entrances().map(x => (SURFACE + 1) * MAP.width + x),   // rain comes in by every way out that is open
    soak: Object.fromEntries(Object.entries(GROUND).map(([n, g]) => [n, g.soak ?? 0])) });
  // A cell's purpose decides what may be stored on it.
  plan = planWorld(MAP.seed);
  // Claiming a chunk: paid in crumbs out of the food stores; a chunk on the surface row opens that much more surface.
  claims = createClaims({
    size: CHUNK, cols: WORLD.cols, rows: WORLD.rows, held: WORLD.held,
    describe: (col, row) => { const p = plan[row * WORLD.cols + col]; return { kind: p.kind, hides: p.hides }; },
    price: (bought, p) => CLAIM.base * Math.pow(CLAIM.grow, bought) * (1 + CLAIM.deeper * p.row),
    allowed: p => { const need = Math.max(CLAIM.ants.rows[p.row], p.col === 0 || p.col === WORLD.cols - 1 ? CLAIM.ants.outer : 0); return colony.population() >= need ? true : `the colony must have ${need} ants`; },
    pay: amount => {
      if (items.inStores('crumb') < amount) return false;
      let left = amount;
      items.each('crumb', (c, n, store) => { if (store && left > 0 && n > 0) left -= items.take('crumb', c, Math.min(n, left)); });
      return true;
    },
    onClaim: p => {
      const w = items.world;
      if (p.row === 0) { for (let x = Math.max(1, p.x0); x <= Math.min(w.w - 2, p.x1); x++) w.set(x, SURFACE, 'air'); colony.surfaceChanged(); }
    },
  });
  zones = createZones({ kinds: ROOMS, onChange: (cell, kind, was) => {
    if (kind === 'garden') colony.planted(cell);
    for (const k of Object.keys(ROOMS[was]?.holds ?? {})) items.setStore(k, cell, 0);
    if (isFloor(cell)) for (const [k, n] of Object.entries(ROOMS[kind]?.holds ?? {})) items.setStore(k, cell, n);
  } });
  // Is there solid ground right under this cell?
  const isFloor = cell => { const w = items.world; return w.solid[w.tiles[cell + w.w]] === 1; };
  scent = createScent({ layers: SCENT });
  // A keep-out mark makes its cell dear to walk through, so routes go round it.
  scent.watch('keepout', KEEP_OUT.above, (cell, on) => { const w = scent.world; w.setExtra(cell % w.w, (cell / w.w) | 0, on ? KEEP_OUT.cost : 0); });
  progress = createProgress({
    gauges: {
      ants: () => colony.population(), dug: () => ground.dug, hatched: () => colony.stats.hatched, space: () => items.space[items.kinds.indexOf('crumb')],
      held: () => claims.plots.filter(p => p.held).length, depth: () => 1 + Math.max(...claims.plots.filter(p => p.held).map(p => p.row)),
      day: () => weather.dayNo, fungus: () => (colony.unlocked.fungus ? 1 : 0), 'rooms.brood': () => zones.count('brood'), 'rooms.garden': () => zones.count('garden'),
      majors: () => colony.majors(), raidersKilled: () => foes.killed.rivals ?? 0, rivalsDead: () => HIDDEN.rival.chunks - colony.rivals,
      flown: () => colony.stats.flown, grown: () => colony.stats.grown,
    },
    // kept from one colony to the next: the score, how many colonies were founded, and the most ants any of them had
    stats: { daughters: { scope: 'profile' }, colonies: { scope: 'profile' }, 'ants.max': { scope: 'profile' } },
    goals: GOALS, achievements: ACHIEVEMENTS, count: false, storage: { key: 'ant-colony-profile' },
  });
  colony = createColony({
    items, ground, scent, trail: TRAIL, traffic: TRAFFIC, scouts: SCOUTS, storeFood: 'store food', soil: 'soil', food: 'crumb', egg: 'egg', larva: 'larva', pupa: 'pupa', dig: 'dig', eat: 'eat', lay: 'lay', hunger: 'hunger', queenCells: () => zones.cells('queen'),
    queen: QUEEN.type, ages: AGES, lifespan: LIFESPAN, lifespanSpread: LIFESPAN_SPREAD,
    broodCells: () => zones.cells('brood'), brood: BROOD, queenHungry: QUEEN_HUNGRY,
    foes, major: MAJOR.type, raider: RAIDER.type, rivalQueen: RIVAL_QUEEN.type, guardCells: () => zones.count('guard'), guard: GUARD, alarm: ALARM, raids: RAIDS, rival: RIVAL,
    weather, water, rainKind: 'rain', heatKind: 'heat', rain: RAIN, second: TICKS_PER_SECOND, heat: HEAT, cave: CAVE, holds: (x, y) => claims.held(x, y),
    ruined: cell => zones.set(cell % MAP.width, (cell / MAP.width) | 0, null), perishable: PERISHABLE,
    princess: PRINCESS.type, flightCells: () => zones.count('flight'), flight: FLIGHT, queenStarves: QUEEN_STARVES, daughter: () => progress.add('daughters'),
    // the cell under a room's floor has been dug out: that part of the floor holds nothing any more
    undermined: cell => { const k = zones.at(cell); if (k) for (const item of Object.keys(ROOMS[k].holds)) items.setStore(item, cell, 0); },
    keepPerAnt: CLAIM.keep, priceOf: p => claims.priceOf(p), buy: p => claims.claim(p),
    features: plan.map(p => p.hides).filter(Boolean), open: 'tunnel', gardenCells: () => zones.cells('garden'), garden: GARDEN,
    surface: SURFACE, mound: MOUND, finds: FINDS, starvesAfter: STARVES_AFTER, eatAbove: EAT_ABOVE, changed: i => tasks.refresh(i),
  });
  const held = i => items.carrying(i);
  // Moving a kind of thing is two tasks: go and pick a loose one up (only if there is somewhere to take it), and take it there.
  const haul = (kind, fetch, deliver, colors, per = 1) => [
    { name: fetch, at: items.route('loose', kind), takes: WORK.handle, color: colors[0], bias: WORK.bias[fetch],
      open: i => !held(i) && items.spare(kind) > 0, can: (i, cell) => items.at(kind, cell) > 0,     // no more are fetched than there is room for
      done: (i, cell) => items.pick(i, kind, cell), slots: () => Math.min(items.loose(kind) * per, Math.max(0, items.spare(kind))) },
    { name: deliver, at: items.route('room', kind), takes: WORK.handle, color: colors[1], bias: WORK.bias[deliver] ?? WORK.bias.deliver,
      open: i => held(i) === kind, can: (i, cell) => items.at(kind, cell) < items.limit(kind, cell),
      done: (i, cell) => items.drop(i, cell) },
  ];
  const list = [
    { name: 'dig', at: ground.route, takes: WORK.bite, color: '#b5553a', bias: WORK.bias.dig,
      open: i => !held(i) && items.room('soil') > 0,           // no digging with nowhere to put the soil
      can: (i, cell) => colony.chooseFace(i, cell), done: i => colony.bite(i),
      slots: () => ground.faces() * WORK.perFace },
    ...haul('soil', 'clear soil', 'carry soil out', ['#8a6f3c', '#5e452c']),
    // Food is fetched only from piles the colony knows of: ones an ant has smelt, or the player has laid a trail to.
    { name: 'fetch food', at: '#known food', takes: WORK.handle, color: '#6f8a44', bias: WORK.bias['fetch food'],
      open: i => !held(i) && items.spare('crumb') > 0 && colony.mayGoOut(), can: (i, cell) => items.at('crumb', cell) > 0,
      done: (i, cell) => { if (items.pick(i, 'crumb', cell)) colony.tookFrom(cell); }, slots: () => Math.min(colony.knownCrumbs * WORK.perCrumb, Math.max(0, items.spare('crumb'))) },
    haul('crumb', 'fetch food', 'store food', ['#6f8a44', '#d9a441'])[1],
    { name: 'tend garden', at: '#garden ripe', takes: GARDEN.tend, color: '#7fa66a', bias: WORK.bias['tend garden'], open: i => !held(i),
      can: (i, cell) => colony.ripe(cell), done: (i, cell) => colony.harvest(cell), slots: () => colony.ripeCells },
    { name: 'scout', at: '#scout', takes: seconds(1), color: '#4f8f6a', bias: WORK.bias.scout, open: i => !held(i) && colony.mayGoOut(), done: () => {}, slots: () => SCOUTS.ants },
    { name: 'gather', at: scent.route('gather', GATHER.above), takes: GATHER.stay, color: '#d08a2f', bias: WORK.bias.gather, open: i => !held(i), done: () => {},
      slots: () => gatherCells() * GATHER.perCell },
    ...haul('egg', 'pick up eggs', 'carry eggs in', ['#b9a6c9', '#e8d8f0']),
    ...haul('larva', 'pick up larvae', 'carry larvae in', ['#b9a6c9', '#e8d8f0']),
    ...haul('pupa', 'pick up pupae', 'carry pupae in', ['#b9a6c9', '#e8d8f0']),
    // A crumb is taken out of the store only for a mouth that is waiting: a larva, or the queen.
    { name: 'fetch a meal', at: items.route('stock', 'crumb'), takes: WORK.handle, color: '#c98a3c', bias: WORK.bias['fetch a meal'],
      open: i => !held(i), can: (i, cell) => items.at('crumb', cell) > 0, done: (i, cell) => items.pick(i, 'crumb', cell),
      slots: () => colony.mealsWanted() - tasks.heading[FEED] - tasks.heading[FEED + 1] },
    { name: 'feed brood', at: items.route('stock', 'larva'), takes: WORK.feed, color: '#e0b060', bias: WORK.bias['feed brood'],
      open: i => held(i) === 'crumb' && colony.mayFeedBrood(), can: (i, cell) => items.at('larva', cell) > 0, done: (i, cell) => colony.feedLarva(i, cell),
      slots: () => items.inStores('larva') },
    { name: 'feed the queen', at: '#queen', takes: WORK.feed, color: '#9a5c7c', bias: WORK.bias['feed the queen'],
      open: i => held(i) === 'crumb' && colony.queenHungry(), done: i => colony.feedQueen(i), slots: () => 2 },
  ];
  const gatherCells = () => { const a = scent.data('gather'); let n = 0; for (let c = 0; c < a.length; c++) if (a[c] > GATHER.above) n++; return n; };
  // Work is the workers'. A major only guards and answers alarm. An enemy only raids.
  for (const t of list) { const open = t.open; t.open = (i, s) => colony.worker(i) && (!open || open(i, s)); }
  list.push(
    { name: 'answer alarm', at: scent.route('alarm', ALARM.above), takes: seconds(1), color: '#e0261a', bias: 1.2, open: i => colony.isMajor(i), done: () => {} },
    { name: 'stand guard', at: zones.route('guard'), takes: GUARD.stand, color: '#b5553a', bias: 0.3, open: i => colony.isMajor(i), done: () => {} },
    { name: 'wait for the flight', at: zones.route('flight'), takes: FLIGHT.wait, color: '#b08ad0', bias: 0.3, open: i => colony.isPrincess(i), done: () => {} },
    { name: 'take flight', at: '#exit', takes: 1, color: '#d8c0f0', bias: 1.5, open: i => colony.isPrincess(i) && colony.mayFly(i), done: i => colony.flew(i) },
    { name: 'raid', at: items.route('stock', 'crumb'), takes: WORK.handle, color: '#c8382c', bias: 0.9, open: i => colony.isRaider(i) && colony.raiding(i),
      can: (i, cell) => items.at('crumb', cell) > 0, done: (i, cell) => colony.steal(i, cell) },
    { name: 'make off', at: '#exit', takes: 1, color: '#8a1c14', bias: 0.9, open: i => colony.isRaider(i) && !colony.raiding(i), done: i => colony.escape(i) },
  );
  const FEED = list.findIndex(t => t.name === 'feed brood');   // the two feeding tasks follow each other in the list
  tasks = createTasks({ tasks: list });

  const growOf = Object.fromEntries(NEEDS.map(n => [n.name, 1 / n.fullAfter]));
  const clears = (need, takes) => -(TYPICAL / takes + growOf[need]);   // "takes 4 seconds" means 4 seconds to clear a typical need
  const never = Object.fromEntries([...list.map(t => t.name), 'eat', 'rest', 'nap'].map(n => [n, { bias: -100 }]));
  return {
    ticksPerSecond: TICKS_PER_SECOND,
    agents: 0,                                   // the first ants are put in by populate()
    maxAgents: 600,
    // Without art the ground is flat colours: painted at a third of its size and shown with hard edges, so repainting it after
    // every dug cell is cheap. With art the page passes ART_VIEW and its own view class instead (view.js).
    view: { projection: 'flat', cell: 12, background: '#2a1f16', ink: '#1c130c', maxGroundSize: Math.max(MAP.width, MAP.height) * 4, groundSharp: true },
    tiles: [
      { name: 'sky', solid: true, color: '#bfe0ee' },
      { name: 'air', color: '#bfe0ee' },                       // the one row above ground that can be walked
      ...Object.entries(GROUND).map(([name, g]) => ({ name, solid: true, color: g.color, color2: g.color2 })),
      { name: 'tunnel', color: '#e0cda6', street: true },
      { name: 'flooded', solid: true, color: WATER.color },      // a dug-out cell full of water
    ],
    map: { ...MAP, fill: 'loam', build: layNest },
    needs: NEEDS.map(n => ({ name: n.name, weight: n.weight, grow: 1 / n.fullAfter })),
    actions: [
      ...tasks.actions,
      { name: 'eat', at: items.route('any', 'crumb'), color: '#b08a2e', effects: { hunger: clears('hunger', EAT_TAKES) } },
      { name: 'rest', at: zones.route('rest'), color: '#3f7f8c', effects: { tired: clears('tired', REST_TAKES) } },
      { name: 'nap', color: '#5f8f9c', effects: { tired: clears('tired', NAP_TAKES) } },
      { name: 'lay', at: '#seat', color: '#9a5c7c', duration: BROOD.lay },      // the queen lays at her seat: a floor in the queen room
      { name: 'sit', color: '#9a5c7c', duration: BROOD.lay },                   // a rival queen stays where she is
      { name: 'wander', color: '#8a8474' },
    ],
    types: [
      ...AGES.map(a => ({ name: a.type, share: 0, speed: a.walk, look: a.look, weights: Object.fromEntries(Object.entries(a.listens).map(([n, v]) => [n, { bias: v }])) })),
      // The queen does nothing but lay. Her hunger grows like anyone's, but she cannot feed herself.
      { name: QUEEN.type, share: 0, speed: QUEEN.walk, look: QUEEN.look, grow: { tired: 0 }, weights: { ...never, lay: { bias: 1 } } },
      { name: MAJOR.type, share: 0, speed: MAJOR.walk, look: MAJOR.look, grow: { hunger: MAJOR.hungrier } },
      { name: PRINCESS.type, share: 0, speed: PRINCESS.walk, look: PRINCESS.look, grow: { hunger: PRINCESS.hungrier } },
      { name: RAIDER.type, share: 0, speed: RAIDER.walk, look: RAIDER.look, grow: { hunger: 0, tired: 0 } },
      { name: RIVAL_QUEEN.type, share: 0, speed: RIVAL_QUEEN.walk, look: RIVAL_QUEEN.look, grow: { hunger: 0, tired: 0 }, weights: { ...never, sit: { bias: 1 } } },
    ],
    weights: { ...tasks.weights, lay: { bias: -100 }, nap: { tired: NEEDS[1].weight * NAP_PULL } },
    modules: [progress.module, items.module, ground.module, zones.module, scent.module, claims.module, weather.module, water.module, foes.module, tasks.module, colony.module],
    tuning: {
      speed: 1 / TICKS_PER_SECOND,
      decideEvery: 15, matrixEvery: 15,
      retryTicks: 20,
      distScale: 2048,                           // the world is 140 cells wide: work far off must still be worth walking to
      cellRoom: CROWD.room, crowdSlow: CROWD.slow,
      sepRadius: 0.45, sepPush: 0.8,             // ants squeeze past each other in a tunnel one cell wide
      leash: 30,
    },
    ...overrides,
  };
}
