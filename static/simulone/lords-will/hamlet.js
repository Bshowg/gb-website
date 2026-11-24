// The Lord's Will: the hamlet, the village, the market town and the chartered town. Five families, a well and a store of grain on a piece of
// farmland; once it is a village, trades (a carpenter, a mill, a bakery), a chapel and the lord's levy; once it
// is a market town, coin: wages, prices and rent, a tavern, a market, and fire; once it is a chartered town,
// guilds, a yearly fair, a great church and a hospital, plague, rivals and the lord's wars.
// This file holds the numbers and the tables; the rules that are this game's own (the farming
// year, the hearth, the woodcutters' reach) are in rules.js. Everything else is generic:
//
//   engine/                 people, needs, decisions, routes, building, the isometric view
//   modules/calendar.js     hours, days, seasons, years
//   modules/mapgen.js       the land, from a seed
//   modules/economy.js      the common store of grain, firewood and timber
//   modules/lives.js        health, mood, births, old age, leaving
//   modules/progress.js     the stage, what is unlocked, goals and achievements
//   modules/events.js       what happens to the settlement from outside
//   modules/policies.js     the dials the steward sets: rations, and wages, prices and rent once there is coin
//   modules/region.js       the other lands: what they hold while nobody is looking, and the carts between them
//
// See docs/GDD.md for what the game is meant to become.

import { createCalendar } from './shared/modules/calendar.js';
import { generateMap } from './shared/modules/mapgen.js';
import { createEconomy } from './shared/modules/economy.js';
import { createLives } from './shared/modules/lives.js';
import { createProgress } from './shared/modules/progress.js';
import { createEvents } from './shared/modules/events.js';
import { createPolicies } from './shared/modules/policies.js';
import { createRegion } from './modules/region.js';
import { createHamletRules } from './rules.js';
import { VIEW, lookOf } from './art.js';

// ───────────────────────── time ─────────────────────────
// A day is one minute of play at 1× speed, a season three days, a year twelve minutes.
export const TICKS_PER_SECOND = 30;
export const DAY = 60 * TICKS_PER_SECOND;
export const HOUR = DAY / 24;
export const SEASONS = [
  { name: 'spring', days: 3 },
  { name: 'summer', days: 3 },
  { name: 'autumn', days: 3 },
  { name: 'winter', days: 3 },
];
const SEASON = 3 * DAY, YEAR = 12 * DAY;
export const hours = h => h * HOUR;
export const days = d => d * DAY;
export const years = y => y * YEAR;

const TYPICAL = 0.6;               // a need is acted on at around this level

// ───────────────────────── people ─────────────────────────
// `fullAfter`: time from satisfied to desperate if ignored. `kills`: how long a person lasts with it desperate.
// `gloom`: how much it weighs on mood. `max`: the need stops building up there, short of desperate: it lowers spirits
// and draws people to what answers it, but nobody drops their work or leaves over it.
export const NEEDS = [
  { name: 'hunger',  fullAfter: hours(14), weight: 1.3, kills: days(5),   gloom: 1.0 },
  { name: 'fatigue', fullAfter: hours(24), weight: 1.2, kills: days(5),   gloom: 0.7 },
  { name: 'thirst',  fullAfter: hours(28), weight: 1.3, kills: days(2),   gloom: 1.0 },   // slow: people walk slowly, and a well can be far
  { name: 'cold',    fullAfter: hours(12), weight: 1.4, kills: days(2.5), gloom: 1.0 },   // only builds up in the cold part of the year
  { name: 'lonely',  fullAfter: hours(48), weight: 0.9, max: 0.85,        gloom: 1.5 },
  { name: 'faith',   fullAfter: hours(60), weight: 0.9, max: 0.85,        gloom: 1.5 },   // only builds up once the hamlet is a village
];
export const FAITH_FROM_STAGE = 2;
// How fast cold builds up in each season, as a share of the rate above.
export const COLD_BY_SEASON = { spring: 0, summer: 0, autumn: 0.1, winter: 1 };
export const RECOVERY = days(2);
export const ROUGH_SLEEP_KILLS = days(4);

// A life is about twelve years. `walk` is cells per second at 1×.
export const LIFESPAN = years(12);
export const LIFESPAN_SPREAD = 0.15;
// Shown ages only: a game year of life is counted as this many years on the cards, so a life of twelve reads as about
// seventy, an elder (from 10.5) as past sixty. The simulation itself keeps game years.
export const SHOWN_YEARS_PER_YEAR = 6;
export const AGES = [
  { age: years(0),    name: 'child', walk: 2.4, works: false, grow: { fatigue: 1.3 }, weight: { lonely: 1.3 }, look: { height: 8 } },
  { age: years(1.5),  name: 'youth', walk: 3.4, works: true,  look: { height: 12 } },
  { age: years(2.5),  name: 'adult', walk: 3.1, works: true,  look: { height: 14 } },
  { age: years(9),    name: 'adult', walk: 2.9, works: true,  look: { height: 14 } },
  { age: years(10.5), name: 'elder', walk: 2.2, works: false, grow: { fatigue: 1.25 }, weight: { lonely: 1.4 }, look: { height: 14, head: '#6f6a4f' } },
  { age: years(14),   name: 'elder', walk: 1.6, works: false, grow: { fatigue: 1.4 }, weight: { lonely: 1.5 }, look: { height: 13, head: '#8f8a74' } },
];
export const FAMILY = { from: years(2.2), to: years(8), chancePerNight: 0.15, moodNeeded: 0.5 };
// Someone with a need left desperate, no roof, or no spirits for this long may walk away. It is set well inside the
// time hunger takes to kill, so a famine empties houses before it fills graves, and the place can recover.
export const EMIGRATION = { moodBelow: 0.3, after: days(1.5), chancePerDay: 0.4 };
export const MOOD_FOLLOWS = hours(10);
export const START_AGES = [years(0.3), years(9.5)];
export const START_PEOPLE = 16;
// Word gets around: each spring, while spirits are high and there are beds to spare, families walk in.
// How many families may come grows with the settlement: two to a hamlet, four to a village, six to a town.
export const ARRIVALS = { season: 'spring', moodAbove: 0.7, families: [2, 4, 6, 6], size: 3,
  resettle: { below: 6, families: 2, grain: 100 } };   // a place left almost empty is taken up again, if its store can feed newcomers
export const NAMES = {
  given: {
    f: ['Agnes', 'Alice', 'Beatrice', 'Cecily', 'Edith', 'Ellen', 'Emma', 'Isolde', 'Joan', 'Juliana', 'Mabel', 'Margery', 'Matilda', 'Maud', 'Rohese', 'Sibyl'],
    m: ['Adam', 'Alan', 'Benet', 'Edmund', 'Geoffrey', 'Gilbert', 'Henry', 'Hugh', 'John', 'Osbert', 'Ralph', 'Richard', 'Robert', 'Simon', 'Walter', 'William'],
  },
  family: ['Thatcher', 'Reeve', 'Miller', 'Carter', 'Hayward', 'Shepherd', 'Fletcher', 'Cooper', 'Wright', 'Ward', 'Baker', 'Fuller', 'Tanner', 'Mason', 'Smith', 'Webb',
           'Atwood', 'Underhill', 'Brook', 'Marsh', 'Ford', 'Heath', 'Dale', 'Green', 'Hill', 'Field', 'Wells', 'Stone', 'Lane', 'Croft'],
};

export const SLEEP_TAKES = hours(7);
export const ROUGH_SLEEP_TAKES = hours(14);
export const ASLEEP_NEEDS_SPEED = 0.2;
export const WORK_SHIFT = hours(2);
export const MEAL_TAKES = hours(1);
// Water is fetched home: a house with a well within this many cells has water in it, and its people drink there.
// Without one they walk to the nearest well every time.
export const WATER = { reach: 12, takes: hours(0.3) };
// Nobody takes work further than this from their door (cells). A field or a lodge beyond it stays unworked
// until houses are built nearer.
export const COMMUTE = 45;
export const ROUGH_MEAL_TAKES = hours(2);
export const WARMING_TAKES = hours(1);
// With no firewood people huddle at home under what they have. It works, slowly, and it is not what anyone would choose.
export const HUDDLING_TAKES = hours(6);
export const HUDDLING_PREFERRED = 0.5;
// What a winter with no firewood in the store takes off everyone's spirits.
export const COLD_HEARTH_GLOOM = 0.2;

// ───────────────────────── the common store ─────────────────────────
// Goods only: everything belongs to the hamlet. `cap` is how much the store holds; a granary adds room for grain, a
// storehouse for everything else that has a limit (firewood and timber are stacked outside and have none).
export const RESOURCES = {
  grain:    { start: { town: 380 }, low: 60, cap: { base: 400, per: { granary: 600 } } },
  firewood: { start: { town: 25 }, low: 15 },
  timber:   { start: { town: 45 } },
  // the village's trades
  planks:   { start: { town: 0 }, cap: { base: 60, per: { storehouse: 60 } } },
  flour:    { start: { town: 0 }, cap: { base: 80, per: { storehouse: 80 } } },
  bread:    { start: { town: 0 }, cap: { base: 80, per: { storehouse: 80 } } },
  // the market town's
  ale:      { start: { town: 0 }, cap: { base: 60, per: { storehouse: 60 } } },
  // food that is not grain: from the gardens, the forest and the hens. Eaten as pottage, preferred to porridge.
  vegetables: { start: { town: 0 }, cap: { base: 160, per: { storehouse: 240 } } },
  forage:     { start: { town: 0 }, cap: { base: 100, per: { storehouse: 150 } } },
  eggs:       { start: { town: 0 }, cap: { base: 60, per: { storehouse: 90 } } },
  coin:     { people: true, pooled: true, start: { town: 0, person: 0 } },   // held by households and by the treasury; nothing before the charter
};
export const MEAL = { grain: 1 };              // porridge
export const BREAD_MEAL = { bread: 1 };        // quicker to eat and preferred; a grain goes half as far again as bread
export const BREAD_MEAL_TAKES = hours(0.5);
export const BREAD_PREFERRED = 1.3;
// Pottage: a meal of whatever there is most of among these (vegetables, nuts and berries, eggs). A change from porridge,
// so a hungry person is a little more drawn to it.
export const POTTAGE = { action: 'eat pottage', from: ['vegetables', 'forage', 'eggs'], amount: 1 };
export const POTTAGE_PREFERRED = 1.15;            // how much more a hungry person is drawn to bread than to porridge
export const HEARTH = { firewood: 1 };            // one sitting by the fire

// ───────────────────────── farming ─────────────────────────
// Fields are sown in spring and reaped in autumn; in between they grow by themselves. What is not sown by
// summer stays bare, and what is not reaped by winter is lost.
export const FARMING = {
  sowPerShift: 16,           // cells one worker sows in a shift
  reapPerShift: 20,          // cells one worker reaps in a shift
  seedPerCell: 0.15,         // grain it takes to sow a cell
  yieldPerCell: 1.1,         // grain a reaped cell gives
  seedKeptPerPerson: 4,      // at most this much seed corn a head is kept back from the table (enough to sow what feeds them)
  colors: { fallow: '#b39a6b', sown: '#a3a45c', growing: '#7dab4c', ripe: '#dcb94a', stubble: '#c8b98c' },
};

// ───────────────────────── buildings ─────────────────────────
// `serves`: what a visit does and how long it takes. `cost`: what building one takes from the store.
// `job`:    what a finished shift there makes.
export const BUILDINGS = [
  { name: 'hut', w: 2, h: 2, beds: 4, color: '#c9b08a', height: 10, cost: { timber: 10 } },
  { name: 'well', w: 2, h: 2, capacity: 10, color: '#9fc3cf', height: 6, cost: { timber: 6 },
    serves: { action: 'drink', need: 'thirst', takes: hours(0.4), color: '#3f7f8c' } },
  { name: 'green', w: 4, h: 4, capacity: 16, color: '#a9c98a', outdoor: true, cost: { timber: 4 },
    serves: { action: 'gather', need: 'lonely', takes: hours(1.5), color: '#6f8a44' } },
  // Dragged out to any size between these. One worker for every 14 cells.
  { name: 'field', resize: { min: [3, 3], max: [14, 14] }, w: 6, h: 6, jobs: 3, perCell: { jobs: 1 / 14 }, outdoor: true, color: FARMING.colors.fallow },
  // Woodcutters need trees: the lodge's yield follows how much forest is within `reach` cells of it.
  { name: 'lodge', w: 3, h: 3, jobs: 4, color: '#a98f6a', height: 12, cost: { timber: 12 },
    job: { makes: { firewood: 2.4, timber: 0.8 }, reach: 12, treesForFull: 70 } },
  { name: 'granary', w: 3, h: 3, color: '#d8c79a', height: 16, cost: { timber: 30 } },
  // room for everything with a limit that is not grain: vegetables, forage, eggs, planks, flour, bread and ale (see RESOURCES)
  { name: 'storehouse', w: 3, h: 2, color: '#cdb994', height: 13, cost: { timber: 20 } },
  // ── other food. `job.seasons`: how much a shift makes in each season, against `makes` (0 = the place is shut then).
  // A garden of peas, beans, cabbages and onions: early greens in spring, most at the end of summer, nothing in winter.
  { name: 'garden', w: 3, h: 3, jobs: 2, color: '#b7c596', outdoor: true, cost: { timber: 3 },
    job: { makes: { vegetables: 3 }, seasons: { spring: 0.4, summer: 1, autumn: 1.3, winter: 0 } } },
  // Gatherers go into the woods for nuts, berries, mushrooms and greens: like the woodcutters, it depends on the trees in reach.
  { name: "forager's hut", w: 2, h: 2, jobs: 2, color: '#b49a72', height: 10, cost: { timber: 6 },
    job: { makes: { forage: 3 }, reach: 10, treesForFull: 50, seasons: { spring: 0.4, summer: 0.8, autumn: 1.6, winter: 0.15 } } },
  // A few hens: they are bought with grain, and eat a little of it every day. They lay least in winter, but they lay.
  { name: 'hen house', w: 2, h: 2, jobs: 1, color: '#d0b48a', height: 10, cost: { timber: 6, grain: 30 },
    job: { uses: { grain: 1 }, reserve: { grain: 40 }, makes: { eggs: 2 }, seasons: { spring: 1.3, summer: 1, autumn: 0.8, winter: 0.5 } } },
  // ── from the village stage. `job.uses` is taken from the store when a shift starts (`reserve`: never below this much);
  // a shift is not started while the store has no room for what it would make.
  { name: 'carpenter', w: 3, h: 2, jobs: 2, color: '#c7a26b', height: 12, cost: { timber: 25 }, stage: 2,
    job: { uses: { timber: 3 }, reserve: { timber: 30 }, makes: { planks: 2 } } },   // leaves timber for building
  { name: 'cottage', w: 3, h: 2, beds: 8, color: '#d9c7a8', height: 13, cost: { timber: 8, planks: 10 }, stage: 2 },
  { name: 'mill', w: 3, h: 3, jobs: 2, color: '#e3dccb', height: 20, cost: { timber: 30, planks: 10 }, stage: 2,
    job: { uses: { grain: 6 }, reserve: { grain: 200 }, makes: { flour: 6 } } },   // seed corn and porridge are left alone
  { name: 'bakery', w: 3, h: 2, jobs: 2, color: '#e0b98a', height: 12, cost: { timber: 15, planks: 12 }, stage: 2,
    job: { uses: { flour: 4, firewood: 1 }, makes: { bread: 6 } } },
  { name: 'chapel', w: 3, h: 4, jobs: 1, capacity: 24, color: '#d6d2c4', height: 18, cost: { timber: 20, planks: 25 }, stage: 2,
    serves: { action: 'pray', need: 'faith', takes: hours(1), color: '#7a6fa8' } },
  // ── from the market town stage. `serves.uses` comes out of the store, `serves.price` out of the visitor's purse.
  { name: 'brewery', w: 3, h: 2, jobs: 2, color: '#b9a06a', height: 12, cost: { timber: 20, planks: 15 }, stage: 3,
    job: { uses: { grain: 4 }, reserve: { grain: 300 }, makes: { ale: 4 } } },
  { name: 'tavern', w: 3, h: 3, jobs: 2, capacity: 16, color: '#c98f5a', height: 14, cost: { timber: 25, planks: 20 }, stage: 3,
    serves: { action: 'drink ale', need: 'lonely', takes: hours(1.5), color: '#a8622c', uses: { ale: 1 }, price: { coin: 2 }, mustPay: true } },
  { name: 'market', w: 4, h: 4, jobs: 1, color: '#d9c9a0', outdoor: true, cost: { timber: 20, planks: 20 }, stage: 3 },   // brings merchants who buy what the store can spare
  { name: 'watch house', w: 2, h: 2, jobs: 2, color: '#b7ab9a', height: 16, cost: { timber: 15, planks: 10 }, stage: 3 },   // its watch gets to a fire in time
  // ── from the chartered town stage. These cost coin as well.
  { name: 'guildhall', w: 4, h: 3, jobs: 2, color: '#b88f6a', height: 20, cost: { timber: 40, planks: 50, coin: 200 }, stage: 4 },   // the trades make more, and are paid more (GUILDS)
  { name: 'fairground', w: 6, h: 6, jobs: 1, color: '#cfd6a0', outdoor: true, cost: { timber: 20, planks: 30, coin: 100 }, stage: 4 },   // the yearly fair is held on it (the event)
  { name: 'great church', w: 5, h: 6, jobs: 2, capacity: 80, color: '#cfcabd', height: 26, cost: { timber: 60, planks: 80, coin: 300 }, stage: 4,
    serves: { action: 'hear mass', need: 'faith', takes: hours(1), color: '#6a5f98' } },
  { name: 'hospital', w: 4, h: 3, jobs: 3, color: '#d9d2c2', height: 16, cost: { timber: 40, planks: 50, coin: 150 }, stage: 4 },   // halves what a plague does (PLAGUE)
];
// The trades a guild speaks for.
export const TRADE_SHOPS = ['carpenter', 'mill', 'bakery', 'brewery'];
// With a guildhall open, a shift in a trade makes this much more, and the treasury pays this much more for it.
export const GUILDS = { hall: 'guildhall', makes: 1.5, wage: 1 };
// What does not burn.
export const FIREPROOF = ['well', 'green', 'field', 'market', 'chapel', 'fairground', 'great church'];

// ───────────────────────── the lord ─────────────────────────
// From the village stage the lord takes a share of the year's harvest when autumn ends. What cannot be paid is
// owed on top of next year's, and costs standing with him.
export const LEVY = { season: 'autumn', share: 0.1, fromStage: 2, standing: { start: 50, paid: 5, short: -15 } };

// ───────────────────────── coin ─────────────────────────
// The market charter brings coin. The treasury (the town's own store of it) pays wages for every finished shift and
// takes rent for every night under a roof and the price of every loaf. Households share one purse. The numbers the
// steward can change are the policies below.
export const COIN = { fromStage: 3, charter: 300, toEachPerson: 8, comfortable: 8, povertyGloom: 0.1 };
// How much a ration above or below a full one lifts or lowers spirits (per whole measure of grain).
export const RATION_MOOD = 0.5;
const policyTable = (stage) => [
  { id: 'rations', title: 'Rations', text: 'how full every bowl is, of porridge (grain) or pottage (vegetables, forage, eggs): short rations stretch the store and sour the mood',
    min: 0.7, max: 1.3, step: 0.1, value: 1, words: v => (v < 1 ? 'short' : v > 1 ? 'generous' : 'full') + ` (${v} a bowl)` },
  { id: 'wage', title: 'Wage', text: 'coin the treasury pays for a finished shift', min: 0, max: 4, step: 1, value: 1, unit: 'coin a shift', when: () => stage() >= COIN.fromStage },
  { id: 'rent', title: 'Rent', text: 'coin a person pays the treasury for a night under a roof', min: 0, max: 3, step: 1, value: 1, unit: 'coin a night', when: () => stage() >= COIN.fromStage },
  { id: 'bread price', title: 'Price of bread', text: 'coin the treasury takes for a loaf', min: 0, max: 3, step: 1, value: 1, unit: 'coin a loaf', when: () => stage() >= COIN.fromStage },
];

// ───────────────────────── fire ─────────────────────────
// A timber building catches. While it burns it is out of use and may set light to its neighbours. When it has
// burnt for `burns`, it is saved if water or the watch was near enough, and lost otherwise.
export const FIRE = { every: HOUR, burns: hours(8), spreadReach: 3, spreadChance: 0.04, wellReach: 10, savedByWell: 0.55, watchReach: 40, savedByWatch: 0.35 };

// ───────────────────────── the chartered town's troubles ─────────────────────────
// Plague: while it lasts, every hour each person may be struck, losing this much health. A second blow within about
// ten hours kills; the struck walk slowly until they mend.
// An open hospital halves the chance.
export const PLAGUE = { chancePerHour: 0.015, strike: 0.6, hospital: 'hospital', withHospital: 0.5 };
// The fair: once a year, on the fairground. Stall fees for the treasury, and spirits lifted while it lasts.
export const FAIR = { coinPerPerson: 1, cheer: 0.1 };
// The lord's war: what he asks for, and what refusing costs in his regard. A low regard raises the levy.
export const WAR = { men: 10, coin: 300, refusing: -25 };
export const RIVAL = { coin: 150 };
export const DISFAVOUR = { below: 30, levyShare: 0.15 };
// Relief: when the store holds less than this many days of food, the lord may send grain. It costs his regard.
export const RELIEF = { foodDaysBelow: 2, grainPerPerson: 8, regard: -10 };
// What a merchant charges for grain, and the days of food under which he offers it.
export const GRAIN_PRICE = { amount: 100, coin: 80 };

// ───────────────────────── events ─────────────────────────
// What comes from outside (modules/events.js). `mods` are numbers the rules multiply by while the event lasts.
// Filled in by makeConfig, where the calendar and the rules exist.
const eventTable = (calendar, rules, progress) => [
  { id: 'hard winter', title: 'A hard winter', text: 'the cold bites deeper and the hearths burn half as much again',
    when: () => calendar.seasonName === 'autumn' && calendar.year >= 3, chance: 0.08, every: DAY,
    warn: () => calendar.until('winter'), lasts: () => calendar.seasonTicks('winter'), rest: years(1), mods: { cold: 1.5 } },
  { id: 'bad harvest', title: 'A bad harvest', text: 'blight in the fields: every cell reaped gives two thirds',
    when: () => calendar.seasonName === 'summer' && calendar.year >= 4, chance: 0.05, every: DAY,
    warn: () => calendar.until('autumn'), lasts: () => calendar.seasonTicks('autumn'), rest: years(1), mods: { yield: 0.67 } },
  { id: 'travellers', title: 'Travellers at the crossroads', text: 'a family asks to settle',
    when: () => (calendar.seasonName === 'summer' || calendar.seasonName === 'autumn') && rules.sim.count > 0, chance: 0.12, every: DAY,
    warn: days(1), rest: days(6), otherwise: 'refuse',
    choices: [
      { id: 'settle', label: 'let them settle', text: 'three more mouths, and hands; without a free bed they sleep rough', run: () => rules.welcome(1) },
      { id: 'refuse', label: 'send them on', run: () => {} },
    ] },
  { id: 'fire', title: 'Fire', text: 'a building has caught',
    when: () => calendar.seasonName === 'summer' && progress.level >= 3 && rules.sim.count > 0, chance: 0.1, every: DAY, rest: days(4), start: () => rules.ignite() },
  { id: 'merchant', title: 'A merchant at the market', text: 'he will buy what the store can spare',
    when: () => progress.level >= 3 && calendar.seasonName !== 'winter' && !events.isActive('merchants away') && rules.sim.world.buildings.some(b => b && b.name === 'market' && b.open), chance: 0.15, every: DAY,
    warn: days(1), rest: days(4), otherwise: 'nothing',
    choices: [
      { id: 'grain', label: 'sell 100 grain', text: '50 coin for the treasury', run: () => rules.sell('grain', 100, 50) },
      { id: 'firewood', label: 'sell 100 firewood', text: '30 coin', run: () => rules.sell('firewood', 100, 30) },
      { id: 'buy', label: `buy ${GRAIN_PRICE.amount} grain`, text: `${GRAIN_PRICE.coin} coin from the treasury`, run: () => rules.buy('grain', GRAIN_PRICE.amount, GRAIN_PRICE.coin) },
      { id: 'nothing', label: 'sell nothing', run: () => {} },
    ] },
  { id: 'relief', title: 'The lord offers grain', text: 'word of empty bowls has reached him',
    when: () => rules.sim.count > 0 && rules.foodDays() < RELIEF.foodDaysBelow, chance: 0.5, every: DAY, warn: days(1), rest: years(1), otherwise: 'accept',
    choices: [
      { id: 'accept', label: 'accept it', text: `${RELIEF.grainPerPerson} grain a head, and ${-RELIEF.regard} off his regard for the steward`, run: () => rules.relief(RELIEF.grainPerPerson, RELIEF.regard) },
      { id: 'refuse', label: 'refuse', text: 'the store must do', run: () => {} },
    ] },
  // ── the chartered town
  { id: 'fair', title: 'The fair', text: 'stalls on the fairground: fees for the treasury, and a day everyone looks forward to', loud: true,
    when: () => progress.level >= 4 && calendar.seasonName === 'summer' && calendar.dayOfSeason === 1 && rules.sim.world.buildings.some(b => b && b.name === 'fairground' && b.open), chance: 1, every: DAY,
    warn: days(1), lasts: days(1), rest: years(0.9), start: () => rules.fair(FAIR.coinPerPerson) },
  { id: 'plague', title: 'Plague', text: 'sickness in the town: anyone may be struck, and two blows close together kill', loud: true,
    when: () => progress.level >= 4 && calendar.seasonName === 'spring' && calendar.year >= 2, chance: 0.04, every: DAY,
    warn: days(2), lasts: () => calendar.seasonTicks('summer'), rest: years(2), mods: { plague: 2 } },
  { id: 'rival', title: 'A rival town', text: 'a town down the river courts your merchants; the lord could be asked to forbid it',
    when: () => progress.level >= 4 && calendar.seasonName === 'autumn', chance: 0.05, every: DAY, warn: days(2), rest: years(2), otherwise: 'refuse',
    choices: [
      { id: 'pay', label: `pay the lord ${RIVAL.coin} coin`, text: 'he forbids the rival\'s market', run: () => rules.spend(RIVAL.coin) || events.trigger('merchants away') },
      { id: 'refuse', label: 'let it be', text: 'no merchants come for a year', run: () => events.trigger('merchants away') },
    ] },
  { id: 'merchants away', title: 'The merchants stay away', text: 'they trade at the rival town', loud: true, chance: 0, every: DAY, lasts: years(1), mods: { boycott: 2 } },
  { id: 'war', title: 'The lord goes to war', text: 'he asks his towns for men or for coin',
    when: () => progress.level >= 4 && calendar.seasonName === 'spring', chance: 0.05, every: DAY, warn: days(2), rest: years(3), otherwise: 'refuse',
    choices: [
      { id: 'men', label: `send ${WAR.men} men`, text: 'they do not come back', run: () => rules.sendMen(WAR.men) },
      { id: 'coin', label: `send ${WAR.coin} coin`, text: 'from the treasury; if it does not hold that much, he is not pleased', run: () => rules.spend(WAR.coin) || rules.regard(WAR.refusing) },
      { id: 'refuse', label: 'send nothing', text: 'the lord will remember it', run: () => rules.regard(WAR.refusing) },
    ] },
];

// ───────────────────────── the lands ─────────────────────────
// The region is the set of lands the steward holds, each a map of its own, each generated from a seed.
//   grant:  the lord gives it when the settlement on land `of` reaches `stage`
//   price:  or it can be bought, from stage `fromStage` of the land the steward is on
//   people, huts: what a new settlement there starts with (the first grant starts with five families)
export const LANDS = [
  { id: 'home',   name: 'the first grant',  kind: 'farmland',  size: [300, 300], seed: 7,  people: 16, huts: 5 },
  { id: 'second', name: 'the second grant', kind: 'woodland',  size: [150, 150], seed: 11, people: 9,  huts: 3, grant: { of: 'home', stage: 3 } },
  { id: 'ford',   name: 'the river meadows', kind: 'riverside', size: [150, 300], seed: 23, people: 9, huts: 3, price: { coin: 400 }, fromStage: 4 },
  { id: 'heath',  name: 'the heath',        kind: 'farmland',  size: [200, 200], seed: 31, people: 9,  huts: 3, price: { coin: 300 }, fromStage: 4 },
];
// What a kind of land is like. `soil`: what its fields give against ordinary farmland.
export const KINDS = {
  farmland:  { soil: 1,    text: 'open farmland with woods towards the edges and a river' },
  woodland:  { soil: 0.75, text: 'forest all around: timber and firewood for the taking, poor soil' },
  riverside: { soil: 1.2,  text: 'rich meadows along a wide river, with few trees' },
};
// A new settlement is sent out from an existing one, with these goods. The people are newcomers who answer the call.
export const SETTLING = { carry: { grain: 200, timber: 100, firewood: 40 } };

export const TILES = [
  // The colours are what shows where the art has no texture (and before it has loaded).
  { name: 'forest', color: '#a9bd8c', walkCost: 2.5, speed: 0.6 },
  { name: 'water',  color: '#b6cfd6', solid: true },
  { name: 'ford',   color: '#cfdfe0', walkCost: 3, speed: 0.5 },
  { name: 'road',   color: '#e8dcc0', walkCost: 0.5, speed: 1.5, street: true },
];
/** The size and middle of the land of the game most recently created with makeConfig. */
export let MAP = { width: 300, height: 300 };
export let CENTRE = [150, 150];
// How each kind of land is laid out (modules/mapgen.js), around the middle where the settlement starts.
function landSteps(kind, w, h) {
  const [cx, cy] = [w >> 1, h >> 1], roads = [{ road: 'road', from: [cx, h - 2], to: [cx, cy] }, { road: 'road', from: [cx - 9, cy], to: [cx + 9, cy] }];
  if (kind === 'woodland') return [
    { layer: 'forest', amount: 0.58, scale: 16, octaves: 3, edge: 0.3 },
    { clearing: [cx, cy], radius: 14 },
    ...roads,
  ];
  if (kind === 'riverside') return [
    { layer: 'forest', amount: 0.12, scale: 18, octaves: 3, edge: 0.6 },
    { river: 'water', from: [cx + 26, 1], to: [cx + 18, h - 2], width: 7, wander: 0.1, ford: 'ford', fordEvery: 40, fordWidth: 5 },
    { clearing: [cx, cy], radius: 16, keep: ['water', 'ford'] },
    { patch: 'forest', at: [cx - 24, cy + 6], radius: 7 },
    ...roads,
  ];
  return [
    { layer: 'forest', amount: 0.3, scale: 20, octaves: 3, edge: 0.5 },
    { river: 'water', from: [1, Math.round(h * 0.307)], to: [w - 2, Math.round(h * 0.36)], width: 4, wander: 0.14, ford: 'ford', fordEvery: 45, fordWidth: 4 },   // north of the settlement
    { clearing: [cx, cy], radius: 18, keep: ['water', 'ford'] },
    { patch: 'forest', at: [cx - 27, cy - 9], radius: 9 },     // two woods within a short walk of the huts
    { patch: 'forest', at: [cx + 25, cy + 21], radius: 8 },
    ...roads,
  ];
}

// A settlement at its start: a few huts and a well by the crossroads.
let firstHuts = [];
function settle(world, huts) {
  const [cx, cy] = CENTRE;
  const near = (name, x, y) => {                             // the closest spot to (x, y) where it fits
    for (let r = 0; r < 12; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      const b = world.place(name, x + i, y + j);
      if (b) return b;
    }
    throw new Error('no room for the first ' + name);
  };
  near('well', cx + 2, cy + 2);
  firstHuts = [[-8, -3], [-4, -3], [3, -3], [7, -3], [-7, 2]].slice(0, huts).map(([dx, dy]) => near('hut', cx + dx, cy + dy));
}

/** Put the first people in the settlement. Call once, right after createGame (or after building the Sim, headless). */
export function populate(sim) {
  // each family in its own hut
  for (const b of firstHuts) b.family = lives.newFamily();
  for (let k = 0; k < current.people; k++) { const b = firstHuts[k % firstHuts.length]; sim.add(b.ex + 0.5, b.ey + 0.5, { home: b, family: b.family }); }
  sim.assign();
}

// ───────────────────────── the region ─────────────────────────
/** The lands, shared by every settlement's game (modules/region.js). A page keeps and saves it. */
export const region = createRegion({ lands: LANDS, first: 'home', storage: { key: 'lords-will-region' } });
// How the region reaches the stores of the settlement being played.
const liveStores = {
  take: (r, n) => { const got = Math.min(n, Math.floor(economy.town[r] ?? 0)); economy.town[r] -= got; return got; },
  give: (r, n) => { const fits = Math.max(0, Math.min(n, economy.capOf(r) - economy.town[r])); economy.town[r] += fits; return fits; },
};
/** Send goods from the settlement being played to another land now: { grain: 50 }. They arrive a season after this one ends. Returns what was sent. */
export const sendGoods = (to, goods) => region.send(current.id, to, goods, liveStores.take);
/** Can the settlement being played send out a party to settle this land? true, or why not. */
export function canSettle(id) {
  const st = region.land(id);
  if (!st.held || st.settled) return st.settled ? 'already settled' : 'not yours to settle';
  const lack = Object.entries(SETTLING.carry).filter(([r, n]) => economy.town[r] < n).map(([r, n]) => `${n} ${r}`);
  return lack.length ? 'the party needs ' + lack.join(', ') + ' from the store' : true;
}
/** Send the party out: the goods leave this store and are the new settlement's to start with. */
export function settleLand(id) {
  if (canSettle(id) !== true) return false;
  for (const [r, n] of Object.entries(SETTLING.carry)) liveStores.take(r, n);
  region.settle(id, SETTLING.carry);
  return true;
}
/** Lands on offer to the settlement being played: [{ land, price, affordable }]. */
export const offers = () => LANDS.filter(l => l.price && !region.isHeld(l.id) && progress.level >= l.fromStage)
  .map(l => ({ land: l, price: l.price, affordable: Object.entries(l.price).every(([r, n]) => economy.town[r] >= n) }));
export function buyLand(id) {
  const o = offers().find(x => x.land.id === id);
  if (!o || !o.affordable) return false;
  for (const [r, n] of Object.entries(o.price)) liveStores.take(r, n);
  return region.hold(id);
}
/** Give the settlement being played these stores (a new settlement's goods, or what an old one holds now that time has passed). */
export function setStores(stores) { for (const r of Object.keys(economy.town)) if (stores[r] !== undefined) economy.town[r] = stores[r]; }
/** A new settlement starts with only what its party carried. */
export function startWith(stores) { for (const r of Object.keys(economy.town)) economy.town[r] = stores[r] ?? 0; }
/** The clock has been moved on while this settlement was not being played: bring everything that follows the clock in line. */
export function catchUp(sim, tick) {
  if (tick > sim.tick) sim.tick = tick;
  sim.blockUntil.fill(0);
  calendar.module.load(null, sim); events.module.load(null); rules.resync();
}

// ───────────────────────── the player's progress ─────────────────────────
// Conditions on stats (modules/progress.js). Stats used here, besides the ones kept automatically:
//   people, grain, firewood, timber     sampled from the hamlet
//   year                                from the calendar
//   sown, harvested                     cells sown and grain reaped, this year (rules.js)
//   winters, kind winters               winters lived through, and those with no death from hunger or cold (rules.js)
//   standing, levies paid, levy streak  the lord's regard (0-100), levies paid in full, and how many of those in a row (rules.js)
//   lands, villages                     lands held in the region, and settlements at village stage or above (shared by all lands)
const built = (name, label) => ({ stat: 'built.' + name, atLeast: 1, label });
export const STAGES = [
  { title: 'village', when: { all: [{ stat: 'people', atLeast: 30, label: 'people' }, built('granary', 'granary built'), { stat: 'kind winters', atLeast: 2, label: 'winters without a death from hunger or cold' }] } },
  { title: 'market town', when: { all: [{ stat: 'people', atLeast: 80, label: 'people' }, built('chapel', 'chapel built'), { stat: 'levy streak', atLeast: 3, label: 'levies paid in full, running' }] } },
  { title: 'chartered town', when: { all: [{ stat: 'people', atLeast: 200, label: 'people' }, built('watch house', 'watch house built'), { stat: 'coin', atLeast: 1000, label: 'coin in the treasury' },
                                        { stat: 'villages', atLeast: 2, label: 'settlements at village stage or above' }] } },
];
// What cannot be built from the start: everything marked with a `stage` above.
export const UNLOCKS = BUILDINGS.filter(b => b.stage).map(b => ({ id: b.name, when: { level: b.stage }, text: 'when the hamlet is a ' + STAGES[b.stage - 2].title }));
export const GOALS = [
  { id: 'field',   title: 'Mark out a field', text: 'in build mode, pick field and drag out a rectangle near the huts', when: built('field', 'field marked') },
  { id: 'green',   title: 'Lay out a green', text: 'people with nowhere to meet grow lonely, and the lonely leave', when: built('green', 'green laid out') },
  { id: 'garden',  title: 'Dig a garden', text: 'peas, beans and cabbages for pottage: a change from porridge that spares the grain', when: built('garden', 'garden dug'), addedLater: true },
  { id: 'lodge',   title: 'Build a woodcutters\' lodge', text: 'close to the forest: its yield follows the trees in reach', when: built('lodge', 'lodge built'), reward: { grant: { timber: 10 } } },
  { id: 'forager', title: 'Build a forager\'s hut', text: 'by the trees: nuts, berries and mushrooms for the pot, most of them in autumn', when: built("forager's hut", "forager's hut built"), addedLater: true },
  { id: 'sow',     title: 'Sow 300 cells before summer', text: 'more fields means more hands sowing at once', when: { stat: 'sown', atLeast: 300, label: 'cells sown' } },
  { id: 'granary', title: 'Build a granary', text: 'the store holds 400 grain without one; the rest of a harvest would rot', when: built('granary', 'granary built') },
  { id: 'wood',    title: 'Lay in 120 firewood', text: 'every hearth burns it through the winter', when: { stat: 'firewood', atLeast: 120, label: 'firewood' } },
  { id: 'harvest', title: 'Bring in 400 grain', text: 'what is still standing when winter comes is lost', when: { stat: 'harvested', atLeast: 400, label: 'grain reaped' } },
  { id: 'hens',    title: 'Keep hens', text: 'a hen house costs 30 grain and eats a little each day, but it lays even in winter', when: built('hen house', 'hen house built'), addedLater: true },
  { id: 'storehouse', title: 'Build a storehouse', text: 'room for more vegetables, forage and eggs, and later planks, flour, bread and ale: what will not fit is lost', when: built('storehouse', 'storehouse built'), addedLater: true },
  { id: 'spring',  title: 'See the spring', text: 'get the hamlet through its first winter', when: { stat: 'year', atLeast: 2, label: 'year' } },
  { id: 'village', title: 'Become a village', text: 'see the bar above: people, a granary and two kind winters', when: { level: 2 } },
  { id: 'well2',   title: 'Dig a second well', text: 'a well gives water to the houses within 12 cells; the rest walk for every drink', when: { stat: 'built.well', atLeast: 1, label: 'well dug' } },
  { id: 'carpenter', title: 'Build a carpenter\'s shop', text: 'planks are what the village\'s buildings are made of', when: built('carpenter', 'carpenter built') },
  { id: 'mill',    title: 'Build a mill', text: 'it grinds grain to flour, and leaves 200 grain alone for seed', when: built('mill', 'mill built') },
  { id: 'bakery',  title: 'Build a bakery', text: 'bread makes the grain go half as far again', when: built('bakery', 'bakery built') },
  { id: 'chapel',  title: 'Build a chapel', text: 'a village wants somewhere to pray; without it spirits sink', when: built('chapel', 'chapel built') },
  { id: 'levy',    title: 'Pay the lord\'s levy in full', text: 'a tenth of the harvest, taken when autumn ends', when: { stat: 'levies paid', atLeast: 1, label: 'levies paid' } },
  { id: 'town',    title: 'Become a market town', text: '80 people, a chapel, and the levy paid in full three years running', when: { level: 3 } },
  { id: 'market',  title: 'Lay out a market', text: 'merchants come to it and buy what the store can spare: coin for the treasury', when: built('market', 'market laid out') },
  { id: 'brewery', title: 'Build a brewery', text: 'it turns grain into ale, and leaves 300 grain alone', when: built('brewery', 'brewery built') },
  { id: 'tavern',  title: 'Open a tavern', text: 'ale for coin: company, and a way for wages to come back to the treasury', when: built('tavern', 'tavern opened') },
  { id: 'watch',   title: 'Build a watch house', text: 'timber burns; the watch gets to a fire in time', when: built('watch house', 'watch house built') },
  { id: 'coin',    title: 'Hold 500 coin', text: 'set wages, rent and the price of bread under Policy so the treasury fills', when: { stat: 'coin', atLeast: 500, label: 'coin in the treasury' } },
  { id: 'second',  title: 'Raise a second village', text: 'settle the second grant under Region and see it to village stage', when: { stat: 'villages', atLeast: 2, label: 'settlements at village stage or above' } },
  { id: 'chartered', title: 'Become a chartered town', text: '200 people, a watch house, 1,000 coin and a second village', when: { level: 4 } },
  { id: 'guildhall', title: 'Build a guildhall', text: 'the trades make half as much again, and want a coin more a shift', when: built('guildhall', 'guildhall built') },
  { id: 'fairground', title: 'Lay out a fairground', text: 'the fair comes on the first day of summer: a coin a head for the treasury', when: built('fairground', 'fairground laid out') },
  { id: 'hospital', title: 'Build a hospital', text: 'plague will come one spring; a hospital halves what it does', when: built('hospital', 'hospital built') },
  { id: 'church',  title: 'Raise a great church', text: 'room for eighty at mass', when: built('great church', 'great church raised') },
  { id: 'land',    title: 'Buy a third land', text: 'the lord sells land to a chartered town: see Region', when: { stat: 'lands', atLeast: 3, label: 'lands held' } },
];
export const ACHIEVEMENTS = [
  { id: 'first winter', title: 'First winter', text: 'live through a winter', when: { stat: 'winters', atLeast: 1 } },
  { id: 'kind winter',  title: 'A kind winter', text: 'a winter with no death from hunger or cold', when: { stat: 'kind winters', atLeast: 1 } },
  { id: 'full granary', title: 'Full granary', text: 'hold 600 grain', when: { stat: 'grain', atLeast: 600, label: 'grain' } },
  { id: 'thirty',       title: 'Thirty souls', text: '30 people in the hamlet', when: { stat: 'people', atLeast: 30, label: 'people' } },
  { id: 'newborn',      title: 'A child is born', text: 'the first birth in the hamlet', when: { stat: 'born', atLeast: 1 } },
  { id: 'village',      title: 'A village', text: 'the hamlet becomes a village', when: { level: 2 } },
  { id: 'daily bread',  title: 'Daily bread', text: 'hold 50 loaves', when: { stat: 'bread', atLeast: 50, label: 'bread' } },
  { id: 'good steward', title: 'A good steward', text: 'pay the levy in full three years running', when: { stat: 'levy streak', atLeast: 3 } },
  { id: 'charter',      title: 'The market charter', text: 'the village becomes a market town', when: { level: 3 } },
  { id: 'chartered',    title: 'A chartered town', text: 'the market town is granted its full charter', when: { level: 4 } },
  // titles: earned by the region, and seen from every land of it
  { id: 'reeve',        title: 'Reeve', text: 'hold two lands', when: { stat: 'lands', atLeast: 2 }, scope: 'game' },
  { id: 'bailiff',      title: 'Bailiff', text: 'two settlements at village stage or above', when: { stat: 'villages', atLeast: 2 }, scope: 'game' },
  { id: 'lord mayor',   title: 'Lord mayor', text: 'hold four lands', when: { stat: 'lands', atLeast: 4 }, scope: 'game' },
];

// ───────────────────────── turned into engine config ─────────────────────────
/** The modules of the game most recently created with makeConfig. */
export let calendar = null, economy = null, lives = null, progress = null, rules = null, events = null, policies = null, land = null;
/** The land (an entry of LANDS) the game most recently created with makeConfig is on. */
export let current = LANDS[0];

// Sleep by night, work by day (the calendar says how much it is night).
const ramp = (h, a, b) => Math.max(0, Math.min(1, (h - a) / (b - a)));
const workday = h => ramp(h, 6, 7.5) * (1 - ramp(h, 17.5, 19));
function dayRhythm(sim) {
  const sleepy = 0.15 + 2.6 * calendar.night, industrious = 0.15 + 1.3 * workday(calendar.hour);
  for (let t = 0; t < sim.T; t++) {
    sim.live[sim.at(t, 'fatigue', 'sleep')] *= sleepy;
    sim.live[sim.at(t, 'fatigue', 'sleep rough')] *= sleepy;
    sim.live[sim.at(t, 'bias', 'work')] *= industrious;
  }
}

/**
 * The engine config for a settlement. Pass the canvas and any overrides, and the land it is on (an entry of LANDS;
 * the first grant by default; a number is taken as another seed for the first grant).
 */
export function makeConfig(overrides = {}, on = LANDS[0]) {
  current = typeof on === 'number' ? { ...LANDS[0], seed: on } : on;
  MAP = { width: current.size[0], height: current.size[1] }; CENTRE = [MAP.width >> 1, MAP.height >> 1];
  const seed = current.seed;
  calendar = createCalendar({ day: DAY, startHour: 6, seasons: SEASONS, startSeason: 0 });
  const lodge = BUILDINGS.find(b => b.name === 'lodge');
  const seasonal = p => p.job?.seasons?.[calendar.seasonName] ?? 1;   // this season's share of what a place makes
  const stage = () => progress.level, coined = () => progress.level >= COIN.fromStage;
  policies = createPolicies({ policies: policyTable(stage) });
  const set = id => () => (coined() ? policies.get(id) : 0);       // a wage, rent or price: nothing before the charter
  economy = createEconomy({
    resources: RESOURCES,
    wealth: { resource: 'coin', comfortable: COIN.comfortable, workPull: 0.15, priceShy: 0.08, active: coined },   // the poor lean towards paid work and away from what costs
    costs: Object.fromEntries(BUILDINGS.filter(b => b.cost).map(b => [b.name, b.cost])),
    flows: [
      // a meal at home, or wherever one is if there is no home, comes out of the common store
      ...Object.entries(MEAL).flatMap(([resource, amount]) => [
        // the seed corn is not eaten: what the fields still need is kept back through winter and spring (rules.js)
        { action: 'eat', when: 'start', resource, amount: () => amount * policies.get('rations'), from: 'town', to: null, required: true, reserve: () => rules.seedReserve() },
        { action: 'eat rough', when: 'start', resource, amount: () => amount * policies.get('rations'), from: 'town', to: null },
      ]),
      ...Object.entries(HEARTH).map(([resource, amount]) => ({ action: 'warm up', when: 'start', resource, amount, from: 'town', to: null, required: true })),
      // places that make without using anything (the lodge, a garden, the foragers): a shift makes so much, times the
      // season's share, times the trees in reach where that matters (rules.js keeps `yield` on such buildings)
      ...BUILDINGS.filter(b => b.job?.makes && !b.job.uses).flatMap(p => Object.entries(p.job.makes).map(([resource, amount]) => ({ action: 'work', at: p.name, when: 'finish', resource, from: null, to: 'town',
        amount: (i, b) => amount * seasonal(p) * (p.job.reach ? b?.yield ?? 0 : 1) }))),
      // the trades: a shift takes its materials when it starts and adds what it makes when it ends
      ...BUILDINGS.filter(b => b.job?.uses).flatMap(b => [
        ...Object.entries(b.job.uses).map(([resource, amount]) => ({ action: 'work', at: b.name, when: 'start', resource, amount, from: 'town', to: null, required: true, reserve: b.job.reserve?.[resource] ?? 0 })),
        // with a guildhall, the trades it speaks for make more
        ...Object.entries(b.job.makes).map(([resource, amount]) => ({ action: 'work', at: b.name, when: 'finish', resource, from: null, to: 'town', needsRoom: true,
          amount: () => amount * seasonal(b) * (TRADE_SHOPS.includes(b.name) && rules.guilded ? GUILDS.makes : 1) })),
      ]),
      // …and are paid more
      ...TRADE_SHOPS.map(shop => ({ action: 'work', at: shop, when: 'finish', resource: 'coin', amount: () => (rules.guilded ? GUILDS.wage : 0), from: 'town', to: 'person' })),
      ...Object.entries(BREAD_MEAL).map(([resource, amount]) => ({ action: 'eat bread', when: 'start', resource, amount, from: 'town', to: null, required: true })),
      { action: POTTAGE.action, when: 'start', resource: POTTAGE.from, amount: () => POTTAGE.amount * policies.get('rations'), from: 'town', to: null, required: true },
      // what a visit takes from the store and from the visitor's purse
      ...BUILDINGS.filter(b => b.serves).flatMap(b => [
        ...Object.entries(b.serves.uses ?? {}).map(([resource, amount]) => ({ action: b.serves.action, at: b.name, when: 'start', resource, amount, from: 'town', to: null, required: true })),
        ...Object.entries(b.serves.price ?? {}).map(([resource, amount]) => ({ action: b.serves.action, at: b.name, when: 'start', resource, amount, from: 'person', to: 'town', required: !!b.serves.mustPay })),
      ]),
      // coin, once there is a charter: a wage for every finished shift, rent for a night, a price on bread. Those who cannot pay still sleep and eat.
      { action: 'work', when: 'finish', resource: 'coin', amount: set('wage'), from: 'town', to: 'person' },
      { action: 'sleep', when: 'start', resource: 'coin', amount: set('rent'), from: 'person', to: 'town' },
      { action: 'eat bread', when: 'start', resource: 'coin', amount: set('bread price'), from: 'person', to: 'town' },
    ],
  });
  lives = createLives({
    needs: NEEDS, desperate: 0.9, recovery: RECOVERY, harmfulActions: { 'sleep rough': ROUGH_SLEEP_KILLS },
    slowestWhenIll: 0.5, moodFollows: MOOD_FOLLOWS, homelessGloom: 0.25, joblessGloom: 0,
    lifespan: LIFESPAN, lifespanSpread: LIFESPAN_SPREAD, startAges: START_AGES,
    family: FAMILY, emigration: EMIGRATION, day: DAY, names: NAMES,
    // short rations and an empty purse weigh on spirits; generous rations lift them
    gloomOf: i => (calendar.seasonName === 'winter' && economy.town.firewood < 1 ? COLD_HEARTH_GLOOM : 0) + (1 - policies.get('rations')) * RATION_MOOD + (coined() ? COIN.povertyGloom * rules.sim.features.poor[i] : 0) - (events.isActive('fair') ? FAIR.cheer : 0),
  });
  progress = createProgress({
    gauges: {
      people: sim => sim.count,
      grain: () => Math.floor(economy.town.grain), firewood: () => Math.floor(economy.town.firewood), timber: () => Math.floor(economy.town.timber),
      year: () => calendar.year,
      bread: () => Math.floor(economy.town.bread), planks: () => Math.floor(economy.town.planks), coin: () => Math.floor(economy.town.coin),
    },
    stats: { 'people.max': { scope: 'profile' }, lands: { scope: 'game' }, villages: { scope: 'game' } },
    game: region.state.shared,
    levels: STAGES, unlocks: UNLOCKS, goals: GOALS, achievements: ACHIEVEMENTS,
    grant: (resource, amount) => economy.give(resource, amount),
    storage: { key: 'lords-will-progress' },
  });
  rules = createHamletRules({
    calendar, economy, farming: FARMING, field: 'field', work: 'work', roughMeal: 'eat rough', meal: MEAL,
    cold: 'cold', coldBySeason: COLD_BY_SEASON, coldDeaths: ['cold', 'hunger'],
    woodcutters: { prefab: 'lodge', tree: 'forest', reach: lodge.job.reach, treesForFull: lodge.job.treesForFull },
    arrivals: { ...ARRIVALS, at: CENTRE }, moodOf: i => lives.mood[i], newFamily: () => lives.newFamily(),
    stage: () => progress.level, mod: name => events.mod(name),
    faith: { need: 'faith', fromStage: FAITH_FROM_STAGE }, bread: { action: 'eat bread', resource: 'bread', amount: BREAD_MEAL.bread }, pottage: POTTAGE,
    levy: LEVY, fieldsFirst: { keep: 1 }, soil: KINDS[current.kind].soil,
    coin: { resource: 'coin', ...COIN }, pay: (i, resource, amount) => economy.pay(i, resource, amount),
    fire: { ...FIRE, fireproof: FIREPROOF, well: 'well', watch: 'watch house' },
    water: { action: 'drink at home', well: 'well', reach: WATER.reach },
    food: { grain: 1, flour: 1.5, bread: 1, vegetables: 1, forage: 1, eggs: 1 }, mealsADay: 2.1,   // how many meals each thing in the store is worth
    guild: GUILDS.hall, plague: PLAGUE, health: () => lives.health, disfavour: DISFAVOUR,
    stat: (name, value) => progress.set(name, value), count: (name, n) => progress.add(name, n),
  });

  events = createEvents({ events: eventTable(calendar, rules, progress) });
  // an event that changes the cold has to reach the rules; the page listens on `events.onNews`
  events.onEvent = (kind, e, detail) => { if (kind === 'started' || kind === 'ended') rules.refresh(); if (events.onNews) events.onNews(kind, e, detail); };
  // The region moves on with this settlement's seasons: its own season goes into its book, the other lands get theirs,
  // carts set out and arrive, and the lord's grants are looked at.
  // Which drawing a person gets (art.js): by sex, and one of a few by who they are. Kept with the person.
  const looks = { name: 'looks',
    setup(sim) { sim.addColumn('look', Uint8Array, 0); },
    onSpawn(i, opts, sim) { const r = lives.person(i); if (r) sim.look[i] = lookOf(r.sex, r.id); } };
  const regionLink = { name: 'region link',
    setup() {
      calendar.on('season', () => {                       // after the rules have closed the season (they listen first)
        const r = rules.lastSeason, net = {};
        for (const k of Object.keys(r.made)) if (k !== 'coin') net[k] = Math.round(r.made[k] - r.used[k]);   // the treasury stands still while nobody is looking
        region.record(current.id, r.season, net);
        const news = region.endSeason(r.season, liveStores);
        if (region.onNews) region.onNews('season', news);
      });
    },
    onTick(sim) {
      if (sim.tick % 64) return;
      for (const l of LANDS) if (l.grant && l.grant.of === current.id && progress.level >= l.grant.stage && region.hold(l.id) && region.onNews) region.onNews('granted', l);
      const held = region.held();
      progress.set('lands', held.length);
      progress.set('villages', held.filter(h => (h.active ? progress.level : h.state.info.stage ?? 0) >= 2).length);
    } };
  const growOf = Object.fromEntries(NEEDS.map(n => [n.name, 1 / n.fullAfter]));
  const clears = (need, takes) => -(TYPICAL / takes + growOf[need]);
  const rest = takes => ({ fatigue: -(0.8 / takes + growOf.fatigue * ASLEEP_NEEDS_SPEED) });
  const serve = b => ({ name: b.serves.action, at: b.name, color: b.serves.color, effects: { [b.serves.need]: clears(b.serves.need, b.serves.takes) }, interruptible: b.serves.takes >= hours(1) });
  return {
    ticksPerSecond: TICKS_PER_SECOND,
    agents: 0,                                   // the first people are put in by populate()
    maxAgents: 1200,
    view: { ...VIEW, doorLinger: HOUR },   // a drink or a quick meal at home is seen at the door, not as a blink
    floor: { color: '#c8d2a8', color2: '#c2cda1' },
    tiles: TILES,
    prefabs: BUILDINGS,
    map: { ...MAP, build: world => { land = generateMap(world, { seed, steps: landSteps(current.kind, MAP.width, MAP.height) }); settle(world, current.huts); } },
    needs: NEEDS.map(n => ({ name: n.name, weight: n.weight, grow: 1 / n.fullAfter, max: n.max })),
    actions: [
      ...BUILDINGS.filter(b => b.serves && !(b.stage >= 3)).map(serve),
      { name: 'eat', at: '@home', color: '#b08a2e', effects: { hunger: clears('hunger', MEAL_TAKES) } },
      { name: 'eat bread', at: '@home', color: '#c9a04a', effects: { hunger: clears('hunger', BREAD_MEAL_TAKES) } },
      { name: 'eat rough', onlyIf: 'homeless', color: '#8a6f3c', effects: { hunger: clears('hunger', ROUGH_MEAL_TAKES) } },
      { name: 'warm up', at: '@home', color: '#b5553a', effects: { cold: clears('cold', WARMING_TAKES) } },
      { name: 'sleep', at: '@home', color: '#1c1f17', needsPace: ASLEEP_NEEDS_SPEED, interruptible: true, effects: rest(SLEEP_TAKES) },
      { name: 'sleep rough', onlyIf: 'homeless', color: '#5a5d50', needsPace: ASLEEP_NEEDS_SPEED, interruptible: true, effects: rest(ROUGH_SLEEP_TAKES) },
      { name: 'work', at: '@job', color: '#5b6bb0', duration: WORK_SHIFT, interruptible: true },
      { name: 'wander', color: '#a9a493' },
      ...BUILDINGS.filter(b => b.serves && b.stage >= 3).map(serve),   // later stages' actions go last, so a hamlet saved before them still loads
      { name: 'huddle', at: '@home', color: '#7a5a50', interruptible: true, effects: { cold: clears('cold', HUDDLING_TAKES) } },
      { name: 'drink at home', at: '@home', color: '#3f7f8c', effects: { thirst: clears('thirst', WATER.takes) } },   // only where a well is near (rules.js)
      { name: POTTAGE.action, at: '@home', color: '#8fa060', effects: { hunger: clears('hunger', MEAL_TAKES) } },   // only while there is something to put in it (rules.js)
    ],
    life: { stages: AGES.map(a => ({ ...a, speed: a.walk })), steps: 24 },
    features: economy.config.features,
    weights: { ...economy.config.weights, huddle: { cold: NEEDS.find(n => n.name === 'cold').weight * HUDDLING_PREFERRED }, 'eat bread': { ...economy.config.weights['eat bread'], hunger: NEEDS.find(n => n.name === 'hunger').weight * BREAD_PREFERRED },
      [POTTAGE.action]: { hunger: NEEDS.find(n => n.name === 'hunger').weight * POTTAGE_PREFERRED } },
    modules: [
      calendar.module,                                      // first: the others see a new day on the tick it begins
      events.module,
      progress.module, policies.module, economy.module, lives.module,
      rules.module,                                         // the farming year, the hearth, the woodcutters' reach
      looks,                                                // after lives: it reads who the newcomer is
      regionLink,
      { name: 'day rhythm', onRebuildMatrix: dayRhythm },
    ],
    tuning: {
      speed: 1 / TICKS_PER_SECOND,
      decideEvery: 10, matrixEvery: 15,
      queuePatience: hours(1.5), giveUpTicks: hours(1.5),
      commute: COMMUTE,
    },
    ...overrides,
  };
}

/** Give everyone their look again (a settlement saved before the art has none stored). */
export function relook(sim) { for (let i = 0; i < sim.count; i++) { const r = lives.person(i); if (r) sim.look[i] = lookOf(r.sex, r.id); } }
