// WAR: a war between two realms, fought on a map of provinces and decided in battles of thousands. On the map the
// player moves armies, raises regiments, trains them and nurses the wounded; when two armies meet, the battle is a
// simulation in which every soldier decides for himself, through the action matrix, whether to keep his rank, close
// with the enemy, give ground or run. This file holds the numbers; the battle's own rules are in rules.js and the
// campaign's in modules/campaign.js.
//
// What it is built from:
//   modules/regiments.js   regiments, formations and the slots in them, orders, the standard that moves
//   modules/combat.js      the nearest enemy, blows, charges, arrows, the struck down
//   modules/morale.js      fear and fatigue, and running that spreads
//   modules/general.js     a general who gives the same orders the player does
//   modules/campaign.js    provinces, roads, armies, days, gold and men
//   rules.js               orders and what a man sees as matrix inputs, where each action takes him, who has won
//   ../../modules/mapgen.js  the battlefield's ground

import { createRegiments } from './modules/regiments.js';
import { createCombat } from './modules/combat.js';
import { createMorale } from './modules/morale.js';
import { createGeneral } from './modules/general.js';
import { createBattle } from './rules.js';
import { generateMap } from './shared/modules/mapgen.js';
import { createCampaign } from './modules/campaign.js';

// ───────────────────────── the clock ─────────────────────────
export const TICKS_PER_SECOND = 20;
export const seconds = s => Math.round(s * TICKS_PER_SECOND);
const WALK = 1.6;                                   // cells a second for a man on foot

// ───────────────────────── the two realms ─────────────────────────
// Side 0 is the player's and stands at the bottom of the field (high y); side 1 at the top.
export const SIDES = [
  { id: 'march', name: 'the Ashen March', short: 'March', color: '#3f5f8a', light: '#dfe7f0', dark: '#22344c', trim: '#e8e2d0' },
  { id: 'crown', name: 'the Fennish Crown', short: 'Crown', color: '#a8452c', light: '#f3d9c4', dark: '#5c2214', trim: '#e9c25a' },
];

// ───────────────────────── soldiers ─────────────────────────
// `speed`: times a man's walk. `hp`: what he can lose. `attack`: about what a blow takes off, before armour.
// `every`: ticks between blows. `reach`: cells. `nerve`: how strongly fear takes him (1 = ordinary).
// `charge`: times the damage of a blow struck at a gallop; `braces`: how well he takes a charge in formation.
// `bow`: range in cells, ticks to nock and loose, damage, spread (cells per cell of range), arrow speed, arrows carried.
// Campaign: `cost` in gold to raise a regiment of `men`, `upkeep` gold a day, `label` and `role`.
export const KINDS = {
  levy:    { label: 'levy', plural: 'levies', role: 'foot', speed: 1.0, hp: 8, attack: 0.9, armour: 1.0, every: 22, reach: 0.85, nerve: 1.5, cost: 40, upkeep: 2, text: 'cheap and many, quick to break' },
  spear:   { label: 'spearmen', plural: 'spearmen', role: 'foot', speed: 0.95, hp: 11, attack: 1.2, armour: 1.4, every: 24, reach: 1.25, braces: 2.5, nerve: 1.0, cost: 90, upkeep: 4, text: 'the line; horse break on them' },
  sword:   { label: 'swordsmen', plural: 'swordsmen', role: 'foot', speed: 1.0, hp: 12, attack: 1.8, armour: 1.5, every: 18, reach: 0.85, nerve: 0.85, cost: 130, upkeep: 6, text: 'win the melee, fear a charge' },
  archer:  { label: 'archers', plural: 'archers', role: 'bow', speed: 1.05, hp: 8, attack: 0.7, armour: 1.0, every: 24, reach: 0.8, nerve: 1.2, cost: 100, upkeep: 4, text: 'shoot over friends; run out of arrows',
             bow: { range: 24, reload: seconds(2.5), damage: 2.6, spread: 0.07, speed: 1.6, quiver: 30 } },
  rider:   { label: 'riders', plural: 'riders', role: 'horse', speed: 2.3, hp: 14, attack: 2.0, armour: 1.3, every: 20, reach: 1.05, mounted: true, charge: 3, nerve: 0.9, cost: 190, upkeep: 9, text: 'fast; a charge in the flank decides fights' },
};
export const KIND_NAMES = Object.keys(KINDS);
export const REGIMENT_MEN = 200;                    // a full regiment
export const MAX_REGIMENTS = 20;                    // the most of one side on one field
// The fallen are agents of their own kind that lie where they fell, so the engine draws them under the living. At most
// this many are kept on a field; the oldest go first.
export const FALLEN = { type: 'fallen', most: 2500 };
export const AGENT_TYPES = [...Object.keys(KINDS), FALLEN.type];

// ───────────────────────── needs and actions ─────────────────────────
// The needs are set by the game, not grown by the engine: fear and fatigue by morale.js, the others by rules.js.
export const NEEDS = [
  { name: 'fear', grow: 0 },
  { name: 'fatigue', grow: 0 },
  { name: 'wounds', grow: 0 },
  { name: 'placeOff', grow: 0 },                    // how far he is from his slot: 1 = 8 cells or more
  { name: 'ammo', grow: 0 },                        // arrows spent: 1 = none left
];
// Inputs of the game's own, set for every man every tick by rules.js.
export const FEATURES = ['ordHold', 'ordAdvance', 'ordAttack', 'ordCharge', 'ordFall', 'foeNear', 'foeClose', 'inRange', 'hurt', 'running', 'worn'];
// `worn`: how long a man has been in the fight (in reach of an enemy, or hit), 0 when fresh, 1 after WORN_AFTER. A fresh
// man runs only from overwhelming fear; it takes time in the fight to wear him down to where he breaks.
export const WORN_AFTER = seconds(60);
export const SIGHT = 12;                            // cells: an enemy nearer than this is "near"
// Every action is a point the man walks to (see rules.js), except loosing arrows, which he does where he stands.
export const ACTIONS = [
  { name: 'keep rank', at: '@point', reach: 0.3, color: '#d8d0b8' },
  { name: 'attack', at: '@point', reach: 0.45, color: '#e0402a' },
  { name: 'loose', duration: KINDS.archer.bow.reload, color: '#6aa84f' },
  { name: 'give ground', at: '@point', reach: 0.4, color: '#e0a02a' },
  { name: 'rout', at: '@point', reach: 1, color: '#f0f0f0' },
  { name: 'fall out', at: '@point', reach: 1, color: '#c06090' },
  { name: 'lie', duration: 60000 },                 // the fallen: they lie where they fell
  { name: 'stand' },
];
// The action matrix, by hand: { action: { input: weight } }. Needs count squared. Read a row as "this action is worth
// doing when…". The order inputs are what bend the same man to different behaviour under different orders.
export const WEIGHTS = {
  'keep rank':   { bias: 0.3, placeOff: 2.0, ordHold: 0.15, ordAdvance: 0.2, ordFall: 0.5, foeClose: -0.3, fear: 0.1 },
  attack:        { bias: -0.15, foeNear: 0.3, foeClose: 0.6, ordAttack: 0.4, ordCharge: 0.9, ordAdvance: 0.05, ordFall: -0.9, ordHold: -0.1,
                   fear: -0.6, wounds: -0.4, fatigue: -0.25, placeOff: -0.6, running: -1 },
  loose:         { bias: 0.1, inRange: 0.75, foeClose: -0.9, ordFall: -1, ammo: -1.5, fear: -0.4, placeOff: -0.5 },
  'give ground': { bias: -0.9, fear: 1.0, foeClose: 0.35, wounds: 0.4, running: -1, worn: 0.3 },
  rout:          { bias: -2.2, fear: 2.2, wounds: 0.3, running: 2.2, worn: 1.5 },   // fresh men cannot break; worn men break as fear passes about 0.7
  'fall out':    { bias: -1, hurt: 1.6, foeClose: -0.5 },
  lie:           { bias: -9 },
  stand:         { bias: -3 },
};
// Per kind, changes to that matrix.
const TYPE_WEIGHTS = {
  fallen: { lie: { bias: 5 } },
  archer: { attack: { bias: -0.45 }, loose: { bias: 0.1 } },
  rider: { attack: { bias: -0.05 } },
};
// Formations: the shape, the room between men in cells, a fixed number of files, how fast the regiment marches in it.
export const FORMATIONS = {
  line:   { shape: 'ranks', spacing: 0.75, pace: 1, text: 'wide and thin: the most men fighting' },
  column: { shape: 'ranks', spacing: 0.75, files: 8, pace: 1.25, text: 'narrow and deep: fast on the march' },
  wedge:  { shape: 'wedge', spacing: 0.85, pace: 1.1, text: 'a point: for a charge' },
  square: { shape: 'square', spacing: 0.75, pace: 0.3, text: 'every side faces out: horse cannot break it' },
  loose:  { shape: 'ranks', spacing: 1.5, pace: 1, text: 'spread out: arrows find fewer' },
};
export const ORDERS = {
  hold: 'stand where you are; fight only what comes close',
  advance: 'march to the place shown, in formation',
  attack: 'close with the enemy and fight',
  charge: 'break ranks and run at them',
  'fall back': 'step back, facing the enemy',
};
// A side has lost when fewer than this share of the men it brought are still standing with their regiments.
export const END_BELOW = 0.3;

// ───────────────────────── fear and fatigue ─────────────────────────
export const MORALE = { losses: 0.002, contagion: 0.006, hit: 0.25, friendDown: 0.018 };   // see morale.js for the defaults; changes here

// ───────────────────────── the battlefield ─────────────────────────
export const FIELD = { width: 220, height: 130, front: 24, bows: 10, gap: 3 };   // front: distance of the first line from the edge
// Colours in the Chronicle palette (art/war/sheet.lua); with the drawn sheet the ground is painted from its textures instead.
export const TILES = [
  { name: 'woods', color: '#3c542a', color2: '#344a26', speed: 0.6, cover: 0.5 },
  { name: 'hill', color: '#6a7846', color2: '#606f40', speed: 0.85, rise: 1 },
  { name: 'stream', color: '#2e5262', color2: '#284a58', speed: 0.35 },
  { name: 'ford', color: '#5a7e82', color2: '#527478', speed: 0.85 },
  { name: 'road', color: '#6e6046', color2: '#64563e', speed: 1.1 },
  { name: 'field', color: '#907e4e', color2: '#857446' },
];
export const FLOOR = { color: '#4e6a34', color2: '#445e2e' };
// The ground of a battlefield, by the province's kind of country. Each is a list of mapgen steps.
export function terrainSteps(kind, W, H) {
  const mid = H / 2;
  const fields = [{ layer: 'field', amount: 0.05, scale: 9 }];
  const steps = {
    plain:  [{ layer: 'woods', amount: 0.05, scale: 14, edge: 0.6 }, { layer: 'hill', amount: 0.05, scale: 22 }, ...fields],
    woods:  [{ layer: 'woods', amount: 0.2, scale: 16, edge: 0.4 }, { layer: 'hill', amount: 0.04, scale: 20 }],
    hills:  [{ layer: 'hill', amount: 0.22, scale: 18 }, { layer: 'woods', amount: 0.06, scale: 12, edge: 0.5 }, ...fields],
    river:  [{ river: 'stream', from: [1, Math.round(mid)], to: [W - 2, Math.round(mid + 6)], width: 3, wander: 0.08, ford: 'ford', fordEvery: 38, fordWidth: 7 },
             { layer: 'woods', amount: 0.06, scale: 14, edge: 0.5 }, ...fields],
  }[kind] ?? [];
  return [...steps, { road: 'road', from: [Math.round(W * 0.45), H - 2], to: [Math.round(W * 0.55), 1] }];
}

// ───────────────────────── the modules ─────────────────────────
// One battle at a time: the modules below are made once and cleared for each new battle.
const coverOf = [], riseOf = [];
const LOOSE = ACTIONS.findIndex(a => a.name === 'loose');
export let regiments, combat, morale, battle, generals;

/** The engine config for the battlefield (pass `canvas`, `onFrame` and anything of the page's own in `extra`). */
export function makeConfig(extra = {}) {
  const typeIndex = Object.fromEntries(KIND_NAMES.map((k, t) => [k, t]));
  regiments = createRegiments({
    sides: SIDES.map(s => s.id), formations: FORMATIONS,
    speedOf: t => tuning.speed * KINDS[KIND_NAMES[t]].speed,
    engaged: i => combat.foeD[i] < 1.6,
    away: i => battle.away(i),
  });
  combat = createCombat({
    kinds: KINDS, sight: SIGHT, blowTicks: 10, hitTicks: 8, woundedShare: 0.55, flank: { dot: -0.35, damage: 1.7 },
    sideOf: i => regiments.side[i],
    facing: (i, o) => battle.facing(i, o),
    canStrike: i => !battle.away(i) && regiments.sim.action[i] !== LOOSE,
    braced: i => { const r = regiments.of(i); return !!r && !battle.away(i) && (r.formation === 'square' || r.formation === 'line') && battle.inPlace(i); },
    away: i => battle.away(i),
    cover: c => coverOf[regiments.sim.world.tiles[c]] ?? 0,
    rise: c => riseOf[regiments.sim.world.tiles[c]] ?? 0,
    strength: i => { const r = regiments.of(i); return (1 + (r ? r.exp : 0) * 0.08) * (1 - 0.4 * regiments.sim.needsOf[i * regiments.sim.K + 1]); },
    onHit: (i, dmg, from) => morale.hit(i, dmg / KINDS[KIND_NAMES[regiments.sim.type[i]]].hp, from),
    onDown: i => morale.down(i),
  });
  morale = createMorale({
    fear: 'fear', fatigue: 'fatigue', nerve: Object.fromEntries(KIND_NAMES.map(k => [k, KINDS[k].nerve])), rates: MORALE, combat,
    fighter: i => regiments.reg[i] >= 0,
    steady: i => battle.steady(i), losses: i => battle.losses(i), inPlace: i => battle.inPlace(i), away: i => battle.away(i), sideOf: i => regiments.side[i],
  });
  const order = (r, o, dest, target) => { regiments.order(r, o, dest); r.target = target ? target.id : -1; };
  generals = [0, 1].map(side => createGeneral({ side, regiments, role: r => KINDS[r.kind].role, squares: r => r.kind === 'spear', range: KINDS.archer.bow.range, order }));
  battle = createBattle({ regiments, combat, morale, generals, kinds: KINDS, features: FEATURES, sight: SIGHT, endBelow: END_BELOW, fallen: FALLEN, wornAfter: WORN_AFTER });
  for (const t of TILES) { coverOf.push(0); riseOf.push(0); }
  return {
    map: { width: FIELD.width, height: FIELD.height },
    floor: FLOOR, tiles: TILES, prefabs: [],
    agents: 0, maxAgents: MAX_REGIMENTS * REGIMENT_MEN * 2 + FALLEN.most + 400, spawn: 'anywhere', seed: 7,
    needs: NEEDS, actions: ACTIONS, weights: WEIGHTS, features: FEATURES,
    types: AGENT_TYPES.map(k => ({ name: k, speed: KINDS[k]?.speed ?? 0, weights: { loose: { bias: -9 }, ...TYPE_WEIGHTS[k] }, look: { color: '#888' } })),
    tuning, ticksPerSecond: TICKS_PER_SECOND,
    view: { projection: 'iso', tileW: 16, tileH: 8, background: '#2b2a22', minZoom: 0.15, maxZoom: 6 },
    modules: [regiments.module, combat.module, morale.module, battle.module, generals[0].module, generals[1].module],
    ...extra,
  };
}
const tuning = { speed: WALK / TICKS_PER_SECOND, sepRadius: 0.5, sepPush: 1.1, turn: 0.35, decideEvery: 6, matrixEvery: 20, crowding: 0, pointReach: 0.3, maxNeighbours: 12, speedSpread: 0.06, traitSpread: 0 };

/** Tile ids for cover and higher ground, once the world exists. */
function tileQualities(world) {
  for (const t of TILES) { const id = world.id(t.name); coverOf[id] = t.cover ?? 0; riseOf[id] = t.rise ?? 0; }
}

/**
 * Lay out a new battle on the engine's world: ground from `seed` and `country`, and both sides' regiments in their lines.
 * `sides`: two lists of regiments as the campaign keeps them, { id, kind, men, exp, wounded…, name }.
 */
export function startBattle(sim, { seed, country, sides }) {
  const world = sim.world, W = world.w, H = world.h;
  tileQualities(world);
  sim.setCount(0);
  regiments.clear(); combat.clear(); battle.clearBodies();
  battle.result = null; battle.elapsed = 0;
  for (const g of generals) g.yielded = false;
  world.loadTiles(new Uint8Array(world.cells));
  generateMap(world, { seed, steps: terrainSteps(country, W, H) });
  sides.forEach((list, s) => deploy(sim, s, list.slice(0, MAX_REGIMENTS)));
  sim.assign();
}

// Both lines: foot in front, archers behind them, horse on the wings. A side faces the other across the field.
function deploy(sim, side, list) {
  const W = sim.world.w, H = sim.world.h, face = side === 0 ? -Math.PI / 2 : Math.PI / 2, back = side === 0 ? 1 : -1;
  const front = side === 0 ? H - FIELD.front : FIELD.front;
  const foot = list.filter(r => KINDS[r.kind].role === 'foot'), bows = list.filter(r => KINDS[r.kind].role === 'bow'), horse = list.filter(r => KINDS[r.kind].role === 'horse');
  const width = files => files * FORMATIONS.line.spacing + FIELD.gap;
  const row = (regs, y, files) => {
    const total = regs.reduce((s, r) => s + width(Math.min(files, r.men)), 0);
    let x = W / 2 - total / 2 * (side === 0 ? 1 : -1);
    for (const spec of regs) {
      const w = width(Math.min(files, spec.men));
      place(sim, side, spec, x + w / 2 * (side === 0 ? 1 : -1), y, face, files);
      x += w * (side === 0 ? 1 : -1);
    }
  };
  const perRow = Math.max(1, Math.floor((W - 60) / width(24)));
  for (let k = 0; k < foot.length; k += perRow) row(foot.slice(k, k + perRow), front + back * (k / perRow) * 9, 24);
  if (bows.length) row(bows, front + back * (FIELD.bows + Math.floor((foot.length - 1) / perRow) * 9), 30);
  const lineHalf = Math.min(perRow, foot.length) * width(24) / 2;
  horse.forEach((spec, k) => {
    const wing = k % 2 ? 1 : -1, n = (k / 2) | 0;
    place(sim, side, spec, W / 2 + wing * (lineHalf + 12 + n * 14), front + back * 2, face, 14);
  });
}
function place(sim, side, spec, x, y, face, files) {
  const kind = KINDS[spec.kind], type = KIND_NAMES.indexOf(spec.kind);
  const r = regiments.add({ side, kind: spec.kind, type, name: spec.name, cid: spec.id, exp: spec.exp ?? 0, x: Math.max(4, Math.min(sim.world.w - 5, x)), y, face,
    files, formation: 'line', order: 'hold' });
  const men = Math.min(REGIMENT_MEN, spec.men), pos = [0, 0], H = sim.world.h, W = sim.world.w;
  r.active = men;                                                // so the slots are laid out for all of them
  const [rw, rd] = regiments.size(r);                            // the whole regiment stands on the field
  r.y = Math.max(rd / 2 + 3, Math.min(H - rd / 2 - 3, r.y)); r.x = Math.max(rw / 2 + 3, Math.min(W - rw / 2 - 3, r.x));
  const at = [];
  for (let s = 0; s < men; s++) at.push([...regiments.slotPos(r, s, pos)]);
  r.men = r.active = r.start = 0;
  const clamp = (v, top) => Math.max(1.5, Math.min(top - 1.5, v));
  for (let s = 0; s < men; s++) sim.add(clamp(at[s][0] + (sim.rnd() - 0.5) * 0.2, W), clamp(at[s][1] + (sim.rnd() - 0.5) * 0.2, H), { type, regiment: r, slot: s, fear: spec.fear, fatigue: spec.fatigue });
  return r;
}

/** What the battle cost each regiment, by its campaign id: { killed, wounded, side }. Men who fled come back. */
export function battleLosses(sim) {
  const out = {}, fallingOut = {};
  for (let i = 0; i < sim.count; i++) if (battle.away(i) && sim.action[i] === battle.sim.actionIndex('fall out')) { const r = regiments.of(i); if (r) fallingOut[r.id] = (fallingOut[r.id] ?? 0) + 1; }
  for (const r of regiments.list) if (r && r.cid !== undefined) out[r.cid] = { killed: r.gone.killed ?? 0, wounded: (r.gone.wounded ?? 0) + (fallingOut[r.id] ?? 0), side: r.side };
  return out;
}

// A battle under way is kept as its regiments and, for each, how its men stand on average; loading it puts the men
// back in their slots. Who was where exactly, and the arrows in the air, are not kept.
export function saveBattle(sim, info) {
  const K = sim.K, avg = {};
  for (let i = 0; i < sim.count; i++) {
    const r = regiments.of(i); if (!r) continue;
    const a = avg[r.id] ??= { n: 0, hp: 0, fear: 0, fatigue: 0, ammo: 0 };
    a.n++; a.hp += combat.hp[i]; a.fear += sim.needsOf[i * K]; a.fatigue += sim.needsOf[i * K + 1]; a.ammo += sim.needsOf[i * K + 4];
  }
  for (const a of Object.values(avg)) { a.hp /= a.n; a.fear /= a.n; a.fatigue /= a.n; a.ammo /= a.n; }
  return { ...info, tick: sim.tick, elapsed: battle.elapsed, regiments: regiments.save(), avg, down: combat.down, yielded: generals.map(g => g.yielded) };
}
export function loadBattle(sim, data) {
  startBattle(sim, { seed: data.seed, country: data.country, sides: [[], []] });
  regiments.load(data.regiments);
  for (const r of regiments.list) {
    if (!r) continue;
    const a = data.avg[r.id], n = a ? a.n : 0, start = r.start, pos = [0, 0];
    r.men = r.active = r.start = 0;
    const at = []; r.active = n; for (let s = 0; s < n; s++) at.push([...regiments.slotPos(r, s, pos)]); r.active = 0;
    for (let s = 0; s < n; s++) sim.add(Math.max(1.5, Math.min(sim.world.w - 1.5, at[s][0])), Math.max(1.5, Math.min(sim.world.h - 1.5, at[s][1])),
      { type: r.type, regiment: r, slot: s, hp: a.hp, fear: a.fear, fatigue: a.fatigue, ammo: a.ammo });
    r.start = start;
  }
  battle.elapsed = data.elapsed ?? 0; combat.down = data.down ?? combat.down;
  (data.yielded ?? []).forEach((y, k) => { generals[k].yielded = y; });
  sim.tick = data.tick ?? sim.tick;
}

// ───────────────────────── the campaign ─────────────────────────
// The land between the two capitals. x, y: where it lies on the map (0…1). `country`: the ground its battles are fought
// on. A town yields `income` gold a day and has `men` to raise regiments from; a capital more. `garrison`: the regiments
// that hold a town when no army is there (a town of nobody's has none).
const prov = (id, name, x, y, country, owner, extra = {}) => ({ id, name, x, y, country, owner, income: 8, men: 200, ...extra });
const CAPITAL = { income: 60, men: 1800, garrison: ['spear', 'spear', 'archer', 'levy', 'levy', 'spear', 'archer'] };
const TOWN = { income: 25, men: 800, garrison: ['levy', 'spear', 'levy'] };
export const PROVINCES = [
  prov('greyhold', 'Greyhold', 0.07, 0.5, 'hills', 0, { ...CAPITAL, town: 'Greyhold', capital: 0 }),
  prov('ashford', 'Ashford', 0.17, 0.22, 'plain', 0, { ...TOWN, town: 'Ashford' }),
  prov('wenmoor', 'Wenmoor', 0.18, 0.74, 'woods', 0),
  prov('kestrel', 'Kestrel Fen', 0.28, 0.5, 'river', 0, { ...TOWN, town: 'Kestrel' }),
  prov('barrow', 'Old Barrow', 0.1, 0.9, 'plain', 0),
  prov('hallow', 'Hallow Cross', 0.4, 0.27, 'plain', -1, { ...TOWN, garrison: null, town: 'Hallow Cross' }),
  prov('bright', 'Brightwater', 0.43, 0.66, 'river', -1, { ...TOWN, garrison: null, town: 'Brightwater' }),
  prov('stone', 'Stonebridge', 0.52, 0.46, 'river', -1),
  prov('weald', 'Elder Weald', 0.36, 0.88, 'woods', -1),
  prov('harrow', 'Harrowdale', 0.55, 0.12, 'hills', -1),
  prov('corvane', 'Corvane', 0.93, 0.5, 'plain', 1, { ...CAPITAL, town: 'Corvane', capital: 1 }),
  prov('redmere', 'Redmere', 0.82, 0.22, 'plain', 1, { ...TOWN, town: 'Redmere' }),
  prov('salt', 'Saltreach', 0.83, 0.8, 'river', 1, { ...TOWN, town: 'Saltreach' }),
  prov('thorn', 'Thornwick', 0.69, 0.5, 'woods', 1, { ...TOWN, town: 'Thornwick' }),
  prov('dun', 'Dunhollow', 0.64, 0.84, 'hills', 1),
  prov('gallow', 'Gallowmere', 0.7, 0.14, 'plain', 1),
];
export const ROADS = [
  ['greyhold', 'ashford', 2], ['greyhold', 'kestrel', 2], ['greyhold', 'wenmoor', 2], ['wenmoor', 'barrow', 1], ['ashford', 'kestrel', 2],
  ['ashford', 'hallow', 2], ['kestrel', 'hallow', 2], ['kestrel', 'bright', 2], ['wenmoor', 'bright', 3], ['barrow', 'weald', 2], ['weald', 'bright', 2],
  ['hallow', 'harrow', 2], ['hallow', 'stone', 1], ['bright', 'stone', 1], ['weald', 'dun', 3], ['harrow', 'gallow', 2],
  ['stone', 'thorn', 2], ['bright', 'dun', 2], ['gallow', 'redmere', 1], ['harrow', 'thorn', 3], ['dun', 'salt', 2], ['dun', 'thorn', 2],
  ['thorn', 'corvane', 2], ['redmere', 'corvane', 2], ['salt', 'corvane', 2], ['redmere', 'thorn', 2], ['salt', 'thorn', 2],
];
export const CAMPAIGN_RULES = {
  heal: 0.15, healAway: 0.04, die: 0.02,                  // the wounded: back a day in a town of one's own, elsewhere; dying a day
  train: 0.15, trainTo: 2, trainCost: 2,                  // experience a day in training (to 2 of 5), gold a regiment a day
  menBack: 0.03,                                          // of a town's men, this share comes back each day
  start: {
    gold: [400, 450],
    armies: [
      { side: 0, at: 'greyhold', regiments: ['spear', 'spear', 'spear', 'spear', 'sword', 'sword', 'levy', 'levy', 'archer', 'archer', 'rider', 'rider'] },
      { side: 1, at: 'corvane', regiments: ['spear', 'spear', 'spear', 'sword', 'sword', 'levy', 'levy', 'levy', 'archer', 'archer', 'rider', 'rider'] },
      { side: 1, at: 'thorn', regiments: ['spear', 'levy', 'levy', 'archer', 'spear', 'levy'] },
    ],
  },
};
export const campaign = createCampaign({ provinces: PROVINCES, roads: ROADS, kinds: KINDS, full: REGIMENT_MEN, most: MAX_REGIMENTS, rules: CAMPAIGN_RULES });
