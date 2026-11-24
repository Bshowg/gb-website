// Atrium: the numbers and tables of the mall game (docs/GDD-mall.md). The game's own rules are in rules.js; everything
// else is the engine and the generic modules. Change the game here.

import { createCalendar } from './shared/modules/calendar.js';
import { createEconomy } from './shared/modules/economy.js';
import { createVisitors } from './modules/visitors.js';
import { createTrade } from './modules/trade.js';
import { createStaff } from './modules/staff.js';
import { createPolicies } from './shared/modules/policies.js';
import { createReputation } from './modules/reputation.js';
import { createProgress } from './shared/modules/progress.js';
import { createFloors } from './modules/floors.js';
import { createUpkeep } from './modules/upkeep.js';
import { createEvents } from './shared/modules/events.js';
import { createMallRules } from './rules.js';

/** Raise this when a change to tiles, units, needs, actions or types makes old saves unreadable. */
export const SAVE_VERSION = 8;

// ───────────────────────── time ─────────────────────────
export const TICKS_PER_SECOND = 30;
export const HOUR = 1200;                      // ticks in a game hour: 40 seconds at 1×, so a trading day is 8 minutes at 1× and 1 at 8×
export const DAY = 24 * HOUR;
export const hours = h => Math.round(h * HOUR);
export const minutes = m => Math.round(m * HOUR / 60);
/** The trading day, in hours. `open` and `close` are the usual hours (a policy moves them between the limits); staff and
 *  deliveries come `prepBefore` opening, nobody is let in for the last `lastIn`, nothing is begun that would run more than
 *  `overrun` past closing, and everyone is out `outAfter` closing. */
export const DAYTIME = { open: 9, close: 21, prepBefore: 1, outAfter: 1, lastIn: 0.5, overrun: 0.5, earliest: 7, latestOpen: 11, earliestClose: 18, latest: 23 };
export const WEEK = [
  { name: 'Mon', factor: 0.8 }, { name: 'Tue', factor: 0.8 }, { name: 'Wed', factor: 0.85 }, { name: 'Thu', factor: 0.9 },
  { name: 'Fri', factor: 1.1 }, { name: 'Sat', factor: 1.5 }, { name: 'Sun', factor: 1.2 },
];
/** How busy each hour of the day is, against the others (only the open hours count). */
export const HOUR_CURVE = [0, 0, 0, 0, 0, 0, 0.2, 0.3, 0.4, 0.5, 0.8, 1.0, 1.5, 1.4, 1.0, 1.0, 1.2, 1.4, 1.3, 1.0, 0.6, 0.4, 0.2, 0];

// ───────────────────────── the building ─────────────────────────
/** Every floor is `w` by `h` cells. Floors lie side by side on one grid, `pitch` cells apart (a routing sector of the engine). */
export const FLOOR = { w: 30, h: 22, pitch: 32, count: 5 };
export const MAP = { width: FLOOR.pitch * FLOOR.count, height: FLOOR.h + 2 };
/** The cells of floor k: [x0, y0, x1, y1], inclusive. */
export const floorRect = k => [k * FLOOR.pitch + 1, 1, k * FLOOR.pitch + FLOOR.w, FLOOR.h];
export const floorOf = x => Math.floor(x / FLOOR.pitch);
export const FLOOR_NAMES = ['ground floor', 'level 1', 'level 2', 'level 3', 'level 4'];
/** What the nth floor costs to build (the first is there from the start). */
export const FLOOR_COST = [0, 0, 15000, 30000, 50000, 70000];
/**
 * Ways between a floor and the one above. cells: where it stands (from the cell tapped) and which way each cell carries
 * people. ticks: how long the ride takes. route: what it counts for when people choose a way (4 is one cell of walking).
 * dislike: stars a kind of visitor takes off the visit for each ride.
 */
export const CONNECTORS = {
  escalator: { stage: 3, cost: 2500, upkeep: 60, ticks: minutes(4), route: 30, text: 'one up and one down, side by side: the quick way',
    cells: [{ dx: 0, dy: 0, tile: 'escalator up', way: 'up' }, { dx: 1, dy: 0, tile: 'escalator down', way: 'down' }] },
  stairs: { stage: 3, cost: 600, upkeep: 5, ticks: minutes(9), route: 90, text: 'cheap and slow; families and pensioners resent them',
    cells: [{ dx: 0, dy: 0, tile: 'stairs', way: 'both' }], dislike: { family: 0.4, pensioner: 0.5 } },
  lift: { stage: 3, cost: 1800, upkeep: 40, ticks: minutes(12), route: 60, text: 'slow, and what families and pensioners look for',
    cells: [{ dx: 0, dy: 0, tile: 'lift', way: 'both' }] },
};
export const VIEW = { tileW: 64, tileH: 32, background: '#e9e6dc', minZoom: 0.2, maxZoom: 5 };   // the size art.js draws at

// ───────────────────────── money ─────────────────────────
export const MONEY = { start: 8000, sign: '€' };
/** Price levels, set per kind of unit. factor: on the fair price. mood: stars a sale adds to the visit. pull: how much it draws people. */
export const PRICE_LEVELS = [
  { name: 'cheap', factor: 0.8, mood: 0.12, pull: 1.15 },
  { name: 'fair', factor: 1, mood: 0, pull: 1 },
  { name: 'dear', factor: 1.25, mood: -0.2, pull: 0.85 },
];
/** Staff are paid by the hour on shift. absent: the chance one of them does not come in. mood: stars each sale adds (good service). */
export const WAGES = { perHour: 7.5, levels: [
  { name: 'low', factor: 0.8, absent: 0.15, mood: 0 },
  { name: 'fair', factor: 1, absent: 0.01, mood: 0 },
  { name: 'generous', factor: 1.25, absent: 0, mood: 0.06 },
] };
/** Each store room lets every shop hold `more` as much again, up to `max` of them. */
export const STORE_ROOM = { unit: 'store room', more: 0.5, max: 2 };
/** With a staff room every sale by staffed units adds this to the visit. */
export const STAFF_ROOM = { unit: 'staff room', mood: 0.05 };
/** Litter: what a visitor out walking drops an hour, and after eating or drinking; what a bin near them keeps off the
 *  floor; what seeing litter takes off a visit each time (to `most`), and from where it is complained of. It is all
 *  cleared overnight. */
export const LITTER = { perHour: 0.2, afterFood: 0.12, binReach: 4, binKeeps: 0.85, seen: 0.02, most: 0.5, gripeAt: 0.2 };
/** Plants: within `reach` cells of one, a visit gains `each` per look, to `most`. */
export const GREEN = { reach: 2, each: 0.004, most: 0.15 };
/** A guard on shift: visitors who are in after `eveningFrom` add `mood` to the visit, and shoplifters keep away. */
export const GUARD = { unit: 'security office', eveningFrom: 18, mood: 0.1 };
/** What happens to the mall from outside. chance: a day, looked at when the staff come in. from: the stage it starts at. */
export const EVENTS = {
  firstDay: 3,
  rain: { chance: 0.10, visitors: 1.25 },
  heat: { chance: 0.05, from: 2, days: 2, cool: { cost: 600, visitors: 1.15 }, hot: { visitors: 0.85, mood: -0.15 }, thirst: 1.6, film: 1.3 },
  power: { chance: 0.04, from: 2, after: hours(5), lasts: hours(2), generator: 600 },
  rival: { chance: 0.06, from: 2, days: 2, sale: { prices: 0.8, visitors: 1.15 }, advert: 800, lost: 0.75 },
  inspector: { chance: 0.07, deepClean: 250, fine: 600, dirtyCells: 12, pass: 0.1, fail: -0.25 },
  premiere: { chance: 0.08, cost: 1000, visitors: 1.3, film: 3 },
  holidays: { chance: 0.03, days: 5, visitors: 1.1, kinds: { teenager: 2, family: 1.8 } },
  way: { chance: 0.06, now: 400, takes: hours(1) },
  breakdown: { chance: 0.08, share: 0.1, takes: hours(1) },
  thieves: { chance: 0.08, from: 3, after: hours(6), share: 0.05, most: 600 },
};
/** The bank's one loan, offered the first time a day's bills cannot be paid. */
export const LOAN = { amount: 6000, daily: 500, days: 15 };

// ───────────────────────── what people want ─────────────────────────
// A wish is a need a visitor arrives with; `lasting` needs also build up while they are in. `fullAfter`: desperate after
// this long from nothing. `comfort`: stars lost for leaving with it at its worst. `longer`: someone who comes for it has
// that much more time.
const wish = (name, words) => ({ name, wish: true, words, fullAfter: hours(6) });
export const NEEDS = [
  wish('clothes', 'clothes'), wish('groceries', 'groceries'), wish('books', 'a book'), wish('electronics', 'electronics'),
  wish('gifts', 'a gift'), wish('remedy', 'something from a chemist'), { ...wish('workout', 'a workout'), longer: hours(1) }, wish('play', 'some fun'), { ...wish('film', 'a film'), longer: hours(2.2) }, { ...wish('dinner', 'a meal out'), longer: hours(1) },
  { name: 'hunger', wish: true, lasting: true, words: 'something to eat', fullAfter: hours(7), start: [0, 0.35], level: [0.6, 0.85], comfort: 0.8 },
  { name: 'thirst', wish: true, lasting: true, words: 'a drink', fullAfter: hours(5), start: [0, 0.35], level: [0.6, 0.85], comfort: 0.6 },
  { name: 'toilet', lasting: true, words: 'a toilet', fullAfter: hours(4.5), start: [0, 0.45], comfort: 1.2, urgent: true },
  { name: 'legs', lasting: true, words: 'a seat', fullAfter: hours(3.5), start: [0, 0.3], comfort: 0.5 },
];

// ───────────────────────── units ─────────────────────────
// stage: when it can be built. serves: what a visit there settles, how long a full visit takes, and its fair price.
// cost: to build. upkeep: a day. posts: staff it wants. shelf: the goods it holds, in money; a sale's goods cost `goods` of its fair price.
const sale = (action, need, takes, price, seated = false) => ({ action, need, takes: minutes(takes), price, seated });
/** How much tired legs draw people to somewhere they would sit down anyway, against a bench (1). */
export const SEATED_PULL = 0.4;
export const UNITS = [
  { name: 'entrance', stage: 1, w: 3, h: 1, door: 'N', capacity: 80, color: '#5d6470', height: 6, cost: 900, upkeep: 20, gate: true, text: 'where visitors come in and go out' },
  { name: 'kiosk', stage: 1, w: 2, h: 2, capacity: 2, color: '#e0b84c', height: 9, cost: 500, upkeep: 20, posts: 1, shelf: 260, goods: 0.4,
    serves: [sale('stop at the kiosk', 'gifts', 8, 9), sale('a drink from the kiosk', 'thirst', 4, 3)] },
  { name: 'clothes shop', stage: 1, w: 4, h: 3, capacity: 6, color: '#c9628a', height: 12, cost: 1800, upkeep: 90, posts: 2, shelf: 1500, goods: 0.45,
    serves: [sale('shop for clothes', 'clothes', 30, 36)] },
  { name: 'café', stage: 1, w: 3, h: 3, capacity: 8, color: '#8a5a3c', height: 10, cost: 1400, upkeep: 70, posts: 2, breaks: true, shelf: 520, goods: 0.35,
    serves: [sale('have a coffee', 'thirst', 15, 5, true), sale('lunch at the café', 'hunger', 30, 12, true)] },
  { name: 'toilets', stage: 1, w: 2, h: 2, capacity: 6, color: '#7fb6c9', height: 8, cost: 700, upkeep: 40, breaks: true,
    serves: [sale('use the toilets', 'toilet', 5, 0)] },

  { name: 'grocer', stage: 2, w: 4, h: 4, capacity: 8, color: '#6f9a44', height: 11, cost: 2600, upkeep: 120, posts: 3, shelf: 2600, goods: 0.6,
    serves: [sale('buy groceries', 'groceries', 20, 28)] },
  { name: 'bookshop', stage: 2, w: 3, h: 3, capacity: 5, color: '#5b6bb0', height: 11, cost: 1600, upkeep: 70, posts: 1, shelf: 700, goods: 0.55,
    serves: [sale('browse the bookshop', 'books', 25, 18)] },
  { name: 'fast food', stage: 2, w: 3, h: 2, capacity: 6, color: '#d9582b', height: 9, cost: 1800, upkeep: 70, posts: 1, breaks: true, shelf: 600, goods: 0.4,
    serves: [sale('grab fast food', 'hunger', 12, 8)] },
  { name: 'staff room', stage: 2, w: 2, h: 3, color: '#9aa0a8', height: 8, cost: 900, upkeep: 30, text: 'staff work a full day without flagging' },
  { name: 'store room', stage: 2, w: 3, h: 3, color: '#8f8a78', height: 9, cost: 1200, upkeep: 30, text: 'every shop holds half as much stock again' },
  { name: 'cleaner\'s cupboard', stage: 2, w: 2, h: 2, color: '#4f8f8a', height: 8, cost: 600, upkeep: 20, posts: 1, roam: 'cleaner', text: 'a cleaner walks the floors from here, picking up litter' },

  { name: 'food court', stage: 3, w: 5, h: 4, capacity: 24, color: '#e08a3c', height: 8, cost: 4200, upkeep: 180, posts: 3, breaks: true, shelf: 1300, goods: 0.45,
    serves: [sale('eat at the food court', 'hunger', 20, 9, true), sale('a drink at the food court', 'thirst', 8, 4, true)] },
  { name: 'gym', stage: 3, w: 5, h: 4, capacity: 14, color: '#3f8f6a', height: 12, cost: 5000, upkeep: 220, posts: 2, breaks: true,
    serves: [sale('work out', 'workout', 60, 12)] },
  { name: 'games arcade', stage: 3, w: 4, h: 3, capacity: 12, color: '#9a4fc0', height: 11, cost: 3800, upkeep: 160, posts: 1, breaks: true,
    serves: [sale('play in the arcade', 'play', 40, 9)] },
  { name: 'electronics', stage: 3, w: 4, h: 3, capacity: 5, color: '#3a6fd0', height: 12, cost: 4500, upkeep: 180, posts: 2, shelf: 3600, goods: 0.7,
    serves: [sale('shop for electronics', 'electronics', 25, 120)] },
  { name: 'pharmacy', stage: 3, w: 3, h: 2, capacity: 4, color: '#4fc08a', height: 10, cost: 2200, upkeep: 90, posts: 1, shelf: 550, goods: 0.55,
    serves: [sale('go to the pharmacy', 'remedy', 10, 14)] },

  { name: 'cinema', stage: 4, w: 7, h: 6, capacity: 60, color: '#7a2f3f', height: 16, cost: 14000, upkeep: 500, posts: 4, breaks: true,
    serves: [sale('watch a film', 'film', 120, 11, true)] },
  { name: 'restaurant', stage: 4, w: 5, h: 4, capacity: 20, color: '#b03a3a', height: 11, cost: 7000, upkeep: 320, posts: 4, breaks: true, shelf: 1400, goods: 0.4,
    serves: [sale('dine at the restaurant', 'dinner', 70, 32, true)], alsoSettles: { hunger: 1 } },
  { name: 'department store', stage: 4, w: 8, h: 6, capacity: 24, color: '#d0a0c0', height: 16, cost: 20000, upkeep: 800, posts: 6, shelf: 6500, goods: 0.55,
    serves: [sale('clothes at the department store', 'clothes', 35, 55), sale('electronics at the department store', 'electronics', 35, 130), sale('gifts at the department store', 'gifts', 25, 25)] },
  { name: 'security office', stage: 4, w: 2, h: 3, color: '#3d4a66', height: 9, cost: 2500, upkeep: 80, posts: 1, roam: 'guard', text: 'a guard walks the floors from here: no shoplifters, and evenings feel safer' },
  { name: 'car park entrance', stage: 4, w: 3, h: 1, door: 'N', capacity: 80, color: '#3c4048', height: 6, cost: 6000, upkeep: 150, gate: true, text: 'visitors who drive: more of them, with fuller purses' },

  { name: 'roof garden', stage: 5, w: 6, h: 6, capacity: 30, color: '#8fc06a', outdoor: true, cost: 9000, upkeep: 250,
    serves: [sale('walk in the garden', 'play', 20, 0, true)], delight: 0.25, text: 'free, and a pleasure: people come up for it and think better of the mall' },
  { name: 'events space', stage: 5, w: 7, h: 5, capacity: 50, color: '#c04f8f', height: 14, cost: 16000, upkeep: 600, posts: 3,
    serves: [sale('see the show', 'play', 60, 15, true)] },
];
/** Plain tiles the player lays. cost: per cell. */
export const TILES = [
  { name: 'void', solid: true, color: VIEW.background },
  { name: 'walkway', stage: 1, color: '#f4eedc', walkCost: 0.6, speed: 1.4, street: true, cost: 4, text: 'people walk faster on it and stroll along it' },
  { name: 'bench', stage: 1, color: '#b98a4a', cost: 80, seats: 2, text: 'tired legs get a rest' },
  { name: 'plant', stage: 1, solid: true, block: 9, color: '#5c9a4a', cost: 50, text: 'makes the walkway around it pleasanter' },
  { name: 'bin', stage: 1, color: '#6a7078', cost: 40, text: 'people near one drop next to no litter' },
  // the cells of the ways between floors (laid by a connector, not one by one)
  { name: 'escalator up', color: '#58b06c' }, { name: 'escalator down', color: '#c8704f' }, { name: 'stairs', color: '#8e8e96' }, { name: 'lift', color: '#4f7fd8' },
];
export const SIT = { action: 'sit down', need: 'legs', takes: minutes(12) };
/** The actions people are seen sitting down for (the art draws them seated). */
export const SEATED_ACTIONS = () => [SIT.action, ...UNITS.flatMap(u => (u.serves ?? []).filter(s => s.seated).map(s => s.action))];

// ───────────────────────── visitors ─────────────────────────
// purse: what they can spend. stay: how long they have. patience: how long they will queue in all.
export const KINDS = [
  { name: 'shopper', speed: 1, look: { height: 14, head: '#1c1f17' }, purse: [40, 170], stay: [hours(1.2), hours(2.6)], patience: minutes(40),
    wishes: { count: [2, 4], of: { clothes: 3, groceries: 3, books: 2, electronics: 1.2, gifts: 2, remedy: 1, hunger: 1.5, thirst: 1.5, workout: 0.8, play: 0.3, film: 0.8, dinner: 0.9 } } },
  { name: 'teenager', speed: 1.15, look: { height: 12, head: '#b5553a' }, purse: [10, 45], stay: [hours(2), hours(4)], patience: minutes(60),
    wishes: { count: [2, 3], of: { play: 4, hunger: 3, thirst: 2.5, clothes: 0.8, film: 2, gifts: 1.2, books: 0.5, workout: 0.6 } } },
  { name: 'family', speed: 0.85, look: { height: 14, head: '#3f7f8c' }, purse: [90, 300], stay: [hours(1.5), hours(3)], patience: minutes(30),
    grow: { toilet: 1.6, legs: 1.4, hunger: 1.2 },
    wishes: { count: [3, 5], of: { groceries: 4, clothes: 3, hunger: 3, gifts: 1.5, film: 1.5, play: 1.5, electronics: 1, remedy: 1, books: 1, thirst: 1, dinner: 1.6, workout: 0.3 } } },
  { name: 'office worker', speed: 1.2, look: { height: 14, head: '#5b6bb0' }, purse: [12, 45], stay: [hours(0.6), hours(1)], patience: minutes(15),
    wishes: { count: [1, 2], of: { hunger: 5, thirst: 3, remedy: 0.5, gifts: 0.5, groceries: 0.5, workout: 2, dinner: 0.8 } } },
  { name: 'pensioner', speed: 0.65, look: { height: 12, head: '#a9a493' }, purse: [20, 80], stay: [hours(1.5), hours(3)], patience: minutes(45),
    grow: { legs: 2.2, toilet: 1.4 },
    wishes: { count: [2, 3], of: { thirst: 3, groceries: 3, books: 2, remedy: 3, clothes: 0.6, hunger: 1.5, gifts: 1, dinner: 1 } } },
];
/** People who work here. They want for nothing while on shift. */
export const STAFF_TYPES = [
  { name: 'staff', speed: 1.1, works: true, look: { height: 14, head: '#f2f2f2' }, weights: { work: { bias: 1, 'dist:work': 0 } } },   // however far the post is, they go to it
  { name: 'cleaner', speed: 1.1, works: false, look: { height: 14, head: '#4fd0c0' }, weights: { clean: { bias: 0.8, 'dist:clean': -0.1 } } },
  { name: 'guard', speed: 1, works: false, look: { height: 14, head: '#30406a' }, weights: { patrol: { bias: 0.8, 'dist:patrol': 0 } } },
  { name: 'off duty', speed: 1.1, works: false, look: { height: 14, head: '#c8c8c8' } },
];
/** Visitors a day at a fair rating and a full variety, by stage. After a new stage the number moves towards the new one
 *  by `FOOTFALL_SPREADS` of the gap each day: word takes a while to get round. */
export const FOOTFALL = [0, 80, 160, 300, 500, 800];
export const FOOTFALL_SPREADS = 0.15;
/** How the kinds of unit open (those visitors come for) multiply the day's visitors: `base` with none, 1 with `full` of them
 *  for the stage, and on to `max`. */
export const VARIETY = { base: 0.35, full: [0, 3, 6, 11, 14, 16], max: 1.25 };
/** A wish for something this mall could have at its stage but does not: how likely against one it has. */
export const WISH_FOR_MISSING = 0.3;
/** What a visit is worth in stars: from `base`, plus `met` for every wish met and minus `missed` for every one missed (as shares). */
export const SCORE = { base: 2.4, met: 2.6, missed: 1.4, queued: 1 / HOUR, walked: 0.25 / HOUR, queueGripe: minutes(20), min: 0, max: 5 };
/** The mall's rating: it opens at `start`; each day it moves `follow` of the way to that day's average visit; `worth` is
 *  what a rating does to the next day's visitors, as points [rating, factor]. */
export const REPUTATION = { start: 3, follow: 0.35, enough: 20, worth: [[0, 0.25], [2, 0.55], [3, 0.85], [3.5, 1], [4.5, 1.35], [5, 1.5]] };
/** Who comes when: a weight for each hour of a weekday, and what the weekend does to the kind (with its own hours, if given).
 *  A kind's share is also scaled by how much of what it wants this mall has (never under `APPEAL_FLOOR`). */
const by = (...spans) => { const a = new Array(24).fill(0); for (const [from, to, w] of spans) for (let h = from; h < to; h++) a[h] = w; return a; };
export const MIX = {
  shopper: { hours: by([6, 24, 1]), weekend: 1.2 },
  pensioner: { hours: by([6, 12, 1.6], [12, 16, 0.8], [16, 24, 0.2]), weekend: 0.6 },
  family: { hours: by([6, 15, 0.4], [15, 19, 0.7], [19, 24, 0.3]), weekend: 3 },
  'office worker': { hours: by([6, 12, 0.1], [12, 14, 2.5], [14, 17, 0.1], [17, 19, 0.8]), weekend: 0 },
  teenager: { hours: by([6, 15, 0.05], [15, 21, 1.4], [21, 24, 0.6]), weekend: 1.5, weekendHours: by([10, 24, 1]) },
};
export const WEEKEND = ['Sat', 'Sun'];
export const APPEAL_FLOOR = 0.1;
/** A way in for those who drive: more visitors in all, and more of some kinds. */
export const CAR_PARK = { unit: 'car park entrance', visitors: 0.25, kinds: { family: 1.5, shopper: 1.2 } };

// ───────────────────────── stages, goals, achievements ─────────────────────────
export const STAGE_NAMES = ['', 'parade of shops', 'arcade', 'mall', 'destination', 'landmark'];
/** How many floors the mall may have at each stage. */
export const FLOORS_AT = [0, 1, 1, 2, 3, 5];
const stage = (title, visitors, mark, days, profit, kinds, floors, grant) => ({ title, reward: { grant: { money: grant } }, when: { all: [
  { stat: 'units.kinds', atLeast: kinds, label: 'kinds of unit built' },
  ...(floors > 1 ? [{ stat: 'floors', atLeast: floors, label: 'floors' }] : []),
  { stat: 'visitors.best', atLeast: visitors, label: 'visitors in one day' },
  { stat: 'rating.held.' + mark, atLeast: days, label: `days in a row rated ★${mark} or better` },
  { stat: 'profit.best', atLeast: profit, label: 'profit in one day' }] } });
export const STAGES = [
  stage('arcade', 60, 3.5, 2, 500, 4, 1, 2000),
  stage('mall', 170, 3.7, 3, 1800, 9, 1, 5000),
  stage('destination', 330, 3.8, 3, 4500, 14, 2, 12000),
  stage('landmark', 520, 3.8, 4, 9000, 19, 3, 25000),   // a big Saturday pulls the rating down every week: four good days in a row is what a week allows
];
export const RATING_MARKS = [3.5, 3.7, 3.8, 3.9];
const has = name => ({ stat: 'built.' + name, atLeast: 1, label: 'a ' + name });
const pay = money => ({ grant: { money } });
export const GOALS = [
  { id: 'first shop', title: 'Build a first shop', text: 'a kiosk, a clothes shop or a café, with its door on the walkway', when: { any: ['kiosk', 'clothes shop', 'café'].map(has) }, reward: pay(300) },
  { id: 'three kinds', title: 'Open three kinds of unit', text: 'the more kinds of unit, the more people come', when: { stat: 'kinds.max', atLeast: 3, label: 'kinds of unit open' }, reward: pay(300) },
  { id: 'first profit', title: 'Close a day in profit', text: 'the report at closing says what each unit earned and cost', when: { stat: 'profit.best', atLeast: 1, label: 'a day in profit' }, reward: pay(400) },
  { id: 'toilets', title: 'Toilets, before the complaints', text: 'visitors who need one and find none think less of the mall', when: has('toilets'), reward: pay(300) },
  { id: 'seats', title: 'Somewhere to sit', text: 'two benches where people walk', when: { stat: 'laid.bench', atLeast: 2, label: 'benches' }, reward: pay(200) },
  { id: 'sixty', title: 'Sixty visitors in a day', text: 'a good rating and more kinds of unit bring more people; Saturday is the big day', when: { stat: 'visitors.best', atLeast: 60, label: 'visitors in one day' }, reward: pay(500) },
  { id: 'arcade', title: 'Become an arcade', text: 'see Goals for what the next stage asks', when: { level: 2 } },
  { id: 'grocer', title: 'A grocer and a bookshop', text: 'new kinds of unit bring the people who want them', when: { all: [has('grocer'), has('bookshop')] }, reward: pay(800) },
  { id: 'store', title: 'A store room, so shelves last the day', text: 'a shop that sells out is shut until the morning', when: has('store room'), reward: pay(500) },
  { id: 'mall', title: 'Become a mall', text: 'a mall may have a floor above the ground floor', when: { level: 3 } },
  { id: 'floor', title: 'Build an upper floor', text: 'under Build: a whole floor of the same size, above this one', when: { stat: 'floors', atLeast: 2, label: 'floors' }, reward: pay(2000) },
  { id: 'way up', title: 'A way up and a way down', text: 'an escalator, stairs or a lift: a floor nobody can reach earns nothing', when: { stat: 'ways', atLeast: 1, label: 'ways between floors' }, reward: pay(1000) },
  { id: 'upstairs pays', title: 'An upper floor that pays for itself', text: 'something up there must pull people: a gym, an arcade, a food court', when: { stat: 'upstairs.best', atLeast: 1, label: 'a day when the upper floors made a profit' }, reward: pay(3000) },
  { id: 'destination', title: 'Become a destination', text: 'a cinema, a restaurant and a department store come with it', when: { level: 4 } },
  { id: 'cinema', title: 'Open a cinema', text: 'it fills the evenings', when: has('cinema'), reward: pay(5000) },
  { id: 'landmark', title: 'Become a landmark', text: 'five floors and a roof garden', when: { level: 5 } },
  { id: 'five floors', title: 'Five floors', text: 'the whole building', when: { stat: 'floors', atLeast: 5, label: 'floors' } },
];
export const ACHIEVEMENTS = [
  { id: 'hundred', title: 'A hundred in a day', when: { stat: 'visitors.best', atLeast: 100, label: 'visitors in one day' } },
  { id: 'five hundred', title: 'Five hundred in a day', when: { stat: 'visitors.best', atLeast: 500, label: 'visitors in one day' } },
  { id: 'stars', title: 'Four and a half stars', when: { stat: 'rating.max', atLeast: 4.5, label: 'the mall\'s rating' } },
  { id: 'banked', title: 'Fifty thousand in the bank', when: { stat: 'bank.max', atLeast: 50000, label: 'in the bank' } },
  { id: 'repaid', title: 'Repaid the bank', when: { stat: 'loan.repaid', atLeast: 1, label: 'the loan repaid' } },
  { id: 'landmark', title: 'A landmark', when: { level: 5 } },
];

// ───────────────────────── turned into engine config ─────────────────────────
const growOf = Object.fromEntries(NEEDS.map(n => [n.name, n.wish && !n.lasting ? 0.4 / n.fullAfter : 1 / n.fullAfter]));
const clears = (need, takes) => -(1 / takes + growOf[need]);
const zeroGrow = Object.fromEntries(NEEDS.map(n => [n.name, 0]));
const cap = s => s[0].toUpperCase() + s.slice(1);

/**
 * The engine config for a mall. Pass the canvas and any overrides. The game's modules come back on `config.mall`:
 * { calendar, economy, visitors, trade, staff, policies, reputation, progress, floors, upkeep, events, rules }.
 */
export function makeConfig(overrides = {}) {
  const calendar = createCalendar({ day: DAY, startHour: DAYTIME.open - DAYTIME.prepBefore });
  const economy = createEconomy({
    resources: { money: { start: { town: MONEY.start } } },
    costs: Object.fromEntries(UNITS.map(u => [u.name, { money: u.cost }])),
  });
  const unit = Object.fromEntries(UNITS.map(u => [u.name, u]));
  const saleOf = {};                                        // by action name: the unit it is sold at, and the sale
  for (const u of UNITS) for (const s of u.serves ?? []) saleOf[s.action] = { unit: u, ...s };
  let rules = null;
  const reputation = createReputation(REPUTATION);
  const floors = createFloors({ count: FLOOR.count, rect: floorRect, closed: 'void',
    connectors: Object.fromEntries(Object.entries(CONNECTORS).map(([name, c]) => [name, { cells: c.cells, ticks: c.ticks, cost: c.route }])) });
  const an = w => (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w;
  const progress = createProgress({
    gauges: { kinds: () => rules.varietyCount(), 'units.kinds': () => rules.kindsBuilt(), bank: () => Math.floor(economy.town.money), rating: () => reputation.rating, floors: () => floors.built, ways: () => floors.list.length },
    levels: STAGES,
    unlocks: [...UNITS, ...TILES, ...Object.entries(CONNECTORS).map(([name, c]) => ({ name, ...c }))].filter(d => d.stage > 1).map(d => ({ id: d.name, when: { level: d.stage }, text: 'when this is ' + an(STAGE_NAMES[d.stage]) })),
    goals: GOALS, achievements: ACHIEVEMENTS,
    count: { actions: false, born: false, died: false },
    grant: (resource, amount) => economy.give(resource, amount),
    storage: { key: 'atrium-progress' },
  });
  const level = (id, title, text, levels, when) => ({ id, title, text, min: 0, max: levels.length - 1, step: 1, value: 1, words: v => levels[v].name, when });
  const policies = createPolicies({ policies: [
    { id: 'open', title: 'Doors open', text: 'staff come in an hour before', min: DAYTIME.earliest, max: DAYTIME.latestOpen, step: 1, value: DAYTIME.open, words: v => `at ${v}:00` },
    { id: 'close', title: 'Doors close', text: 'every hour open is an hour of wages', min: DAYTIME.earliestClose, max: DAYTIME.latest, step: 1, value: DAYTIME.close, words: v => `at ${v}:00` },
    level('wages', 'Wages', 'low wages are cheaper, and some days staff do not come; generous ones buy good service', WAGES.levels),
    ...UNITS.filter(u => u.serves?.some(s => s.price)).map(u => level('price:' + u.name, cap(u.name) + ' prices', 'dear earns more a sale, draws fewer and pleases less', PRICE_LEVELS, () => rules.has(u.name) > 0)),
  ] });
  const upkeep = createUpkeep({ field: 'litter', clean: 'clean', above: 1, max: 4, reach: 1 });
  let events = null;
  const staff = createStaff({
    type: 'staff', offType: 'off duty', leave: ['leave', 'drive home'],
    gates: () => rules.gates(),
    posts: b => unit[b.name].posts ?? 0,
    roam: b => unit[b.name].roam ?? null,
    onDuty: () => rules.phase !== 'closed',
    turnOut: b => rules.turnOut(b),
  });
  const visitors = createVisitors({
    kinds: KINDS.map(k => ({ ...k, type: k.name })),
    needs: Object.fromEntries(NEEDS.map(n => [n.name, n])),
    leave: ['leave', 'drive home'],
    gates: sim => rules.gates(),
    rate: sim => rules.rate(),
    mix: sim => rules.mix(),
    wishWeight: need => rules.wishWeight(need),
    lookFor: minutes(10),
    score: SCORE,
  });
  visitors.onLeft = rec => reputation.add(rec.score);
  const trade = createTrade({
    sells: Object.keys(saleOf),                             // a free visit (the toilets) is a sale of nothing: it is counted too
    price: (i, action, b) => rules.priceOf(action, b),
    buyer: i => visitors.is(i),
    income: amount => economy.give('money', amount),
    onRefuse: (i, action, b, why) => visitors.drop(i, saleOf[action].need, why),
    onSale: (i, action, b) => rules.sold(i, action, b),
    // stock is counted in money's worth of goods; it is paid for at closing, for what was sold
    stock: { room: b => rules.shelfOf(b), uses: action => rules.goodsOf(action), cost: () => 1,
             least: b => Math.min(...unit[b.name].serves.map(s => rules.goodsOf(s.action))) },
  });
  rules = createMallRules({
    calendar, economy, visitors, trade, staff, policies, units: unit, saleOf, tiles: Object.fromEntries(TILES.map(t => [t.name, t])),
    daytime: DAYTIME, week: WEEK, curve: HOUR_CURVE, footfall: FOOTFALL, footfallSpreads: FOOTFALL_SPREADS, variety: VARIETY, wishForMissing: WISH_FOR_MISSING,
    needs: NEEDS, floor: FLOOR, floorRect, sit: SIT, hour: HOUR, sign: MONEY.sign,
    priceLevels: PRICE_LEVELS, wages: WAGES, storeRoom: STORE_ROOM, staffRoom: STAFF_ROOM, loan: LOAN,
    reputation, progress, floors, upkeep, mod: name => events.mod(name), director: () => events, litter: LITTER, green: GREEN, guard: GUARD, eventNumbers: EVENTS, day: DAY, hoursOf: hours,
    connectors: CONNECTORS, floorCost: FLOOR_COST, floorsAt: FLOORS_AT, floorNames: FLOOR_NAMES, kinds: KINDS, mix: MIX, weekend: WEEKEND, appealFloor: APPEAL_FLOOR, carPark: CAR_PARK, ratingMarks: RATING_MARKS,
  });

  events = createEvents({ events: rules.eventTable(() => events) });
  events.onEvent = (kind, e, detail) => { if (events.onNews) events.onNews(kind, e, detail); };

  const g0 = floorRect(0), midX = g0[0] + (FLOOR.w >> 1);
  return {
    ticksPerSecond: TICKS_PER_SECOND,
    agents: 0,
    maxAgents: 900,
    view: { ...VIEW, doorLinger: HOUR / 20 },   // three minutes at the door going in and coming out: a quick visit is not a blink
    floor: { color: '#cbc8be', color2: '#c6c3b8' },
    tiles: TILES.map(({ name, solid, color, block, walkCost, speed, street }) => ({ name, solid, color, block, walkCost, speed, street })),
    prefabs: UNITS.map(u => ({ name: u.name, w: u.w, h: u.h, capacity: u.capacity ?? 0, door: u.door, color: u.color, height: u.height, outdoor: u.outdoor })),
    map: { ...MAP, build: world => {
      for (let k = 1; k < FLOOR.count; k++) { const r = floorRect(k); world.rect(r[0] - 1, 1, FLOOR.pitch, FLOOR.h, 'void'); }   // the floors not built yet
      world.rect(g0[2] + 1, 1, 1, FLOOR.h, 'void');
      world.place('entrance', midX - 1, g0[3], 0);          // the way in, on the south side, with a few steps of walkway
      world.rect(midX - 1, g0[3] - 7, 3, 7, 'walkway');
    } },
    needs: NEEDS.map(n => ({ name: n.name, grow: growOf[n.name] })),
    actions: [
      ...UNITS.flatMap(u => (u.serves ?? []).map(s => ({ name: s.action, at: u.name, color: u.color,
        effects: { [s.need]: clears(s.need, s.takes), ...(s.seated && s.need !== 'legs' ? { legs: -1 / s.takes } : {}),
                   ...Object.fromEntries(Object.entries(u.alsoSettles ?? {}).map(([need, share]) => [need, -share / s.takes])) } }))),
      { name: SIT.action, at: 'bench', color: '#b98a4a', effects: { [SIT.need]: clears(SIT.need, SIT.takes) } },
      { name: 'leave', at: 'entrance', color: '#8d8a80' },
      { name: 'drive home', at: 'car park entrance', color: '#8d8a80' },
      { name: 'wander', color: '#a9a493' },
      { name: 'work', at: '@job', color: '#ffffff', duration: hours(18) },   // the whole shift in one go: the staff module ends it
      { name: 'clean', at: '#litter', color: '#4fd0c0', duration: minutes(2) },
      { name: 'patrol', at: '#beat', color: '#30406a', duration: minutes(3) },
      { name: 'attend', at: '@target', color: '#ffffff', duration: minutes(30) },
    ],
    types: [
      ...KINDS.map(k => ({ name: k.name, speed: k.speed, works: false, grow: k.grow ?? {}, look: k.look })),
      ...STAFF_TYPES.map(t => ({ ...t, grow: zeroGrow })),
    ],
    weights: Object.fromEntries(UNITS.flatMap(u => (u.serves ?? []).filter(s => s.seated && s.need !== 'legs').map(s => [s.action, { legs: SEATED_PULL, ...Object.fromEntries(Object.keys(u.alsoSettles ?? {}).map(n => [n, 0])) }]))),
    modules: [
      calendar.module,                                      // first: the others see the hour on the tick it begins
      progress.module,                                      // before the economy: "not yet" is the answer before "cannot pay"
      events.module, reputation.module, policies.module, floors.module, upkeep.module, economy.module, visitors.module, staff.module, trade.module, rules.module,
    ],
    tuning: {
      // walking: about 1.7 cells a second at 1× (2.3 on a walkway). A cell is large on screen: faster than this looks like running.
      speed: 0.055, decideEvery: 10, matrixEvery: 15,
      queuePatience: minutes(15), giveUpTicks: minutes(40),
      distScale: 280, distWeight: -0.35, strollRange: 30, leash: 1e4, sepRadius: 0.55,
    },
    mall: { calendar, economy, visitors, trade, staff, policies, reputation, progress, floors, upkeep, events, get rules() { return rules; } },
    ...overrides,
  };
}
