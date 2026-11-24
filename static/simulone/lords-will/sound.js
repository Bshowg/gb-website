// The Lord's Will: what the place sounds like. Ambient only: no music, no sound for buttons.
//
// The sound itself is made by modules/ambience.js. This file says which sounds there are and how much of each is
// heard, from three things: the season, the hour, and what the camera is looking at (how close it is, how much forest
// and water is in view, how many people, which buildings, whether anything burns).

import { createAmbience } from './modules/ambience.js';

const clamp = v => Math.max(0, Math.min(1, v));
const BY_SEASON = {
  birds:    { spring: 1,   summer: 0.8, autumn: 0.4, winter: 0.12 },
  crickets: { spring: 0.3, summer: 1,   autumn: 0.5, winter: 0 },
  leaves:   { spring: 0.7, summer: 1,   autumn: 0.8, winter: 0.1 },
  wind:     { spring: 0.2, summer: 0.12, autumn: 0.35, winter: 0.6 },
  water:    { spring: 1,   summer: 0.8, autumn: 0.9, winter: 0.25 },     // in winter the river is mostly ice
};
const KEY = 'lords-will-sound';

/**
 * @param {() => object} live   gives { game, calendar, rules } as they are now (they change when the player travels)
 */
export function createSound(live) {
  // What is in view, looked at a few times a second.
  const seen = { close: 0, forest: 0, water: 0, people: 0, has: {}, fire: false, houses: 0, at: 0 };
  function look() {
    const now = performance.now();
    if (now - seen.at < 300) return seen;
    seen.at = now;
    const { game, rules } = live(), r = game.renderer, w = game.world, sim = game.sim, cv = r.canvas;
    seen.close = clamp((game.camera.zoom - 0.35) / 1.1);
    let n = 0, forest = 0, water = 0;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) {      // a grid of points over the screen: what ground is under each
      const [x, y] = r.screenToCell((i + 0.5) / 5 * cv.width, (j + 0.5) / 7 * cv.height);
      if (!w.inside(x, y)) continue;
      n++;
      const name = w.defs[w.get(x, y)].name;
      if (name === 'forest') forest++; else if (name === 'water' || name === 'ford') water++;
    }
    seen.forest = n ? forest / n : 0; seen.water = n ? water / n : 0;
    const [cx, cy] = r.screenToGrid(cv.width / 2, cv.height / 2), reach = (cv.width + cv.height * 2) / game.camera.zoom / (r.tw * 2);
    const near = (x, y) => Math.abs(x - cx) + Math.abs(y - cy) < reach;
    let people = 0;
    for (let i = 0; i < sim.count; i++) if (sim.inside[i] < 0 && near(sim.px[i], sim.py[i])) people++;
    seen.people = people;
    const has = {}; let houses = 0, fire = false;
    for (const b of w.buildings) if (b && near(b.cx, b.cy)) {
      if (b.open && b.workers > 0) has[b.name] = true;
      if (b.beds) houses++;
      if (b.fire !== undefined) fire = true;
    }
    seen.has = has; seen.houses = houses; seen.fire = fire || (rules.fires().length > 0 && seen.close < 0.2);
    return seen;
  }
  const season = () => live().calendar.seasonName, of = kind => BY_SEASON[kind][season()] ?? 0.5;
  const day = () => 1 - (live().calendar.night ?? 0), hour = () => live().calendar.hour;
  const working = () => hour() > 7 && hour() < 18 ? 1 : 0;

  const A = createAmbience({
    volume: 0.7,
    layers: [
      // the air: always a little, more from far up and in the cold months
      { id: 'wind', kind: 'noise', filter: 'lowpass', freq: 420, q: 0.6, gain: 0.5, sway: { rate: 0.07, depth: 0.7 }, wobble: { rate: 0.05, cents: 500 },
        level: () => of('wind') + (1 - look().close) * 0.35 },
      { id: 'leaves', kind: 'noise', filter: 'highpass', freq: 2600, q: 0.4, gain: 0.12, sway: { rate: 0.11, depth: 0.8 },
        level: () => look().forest * of('leaves') * (0.4 + 0.6 * look().close) },
      { id: 'water', kind: 'noise', filter: 'bandpass', freq: 1300, q: 0.5, gain: 0.3, sway: { rate: 0.6, depth: 0.25 }, wobble: { rate: 0.23, cents: 300 },
        level: () => Math.sqrt(look().water) * of('water') * (0.3 + 0.7 * look().close) },
      // living things
      { id: 'birds', kind: 'chirps', rate: 1.6, freq: [2200, 4200], slide: 1.25, length: 0.09, notes: [1, 4], gap: 0.12, gain: 0.07,
        level: () => day() * of('birds') * (0.3 + 0.7 * look().forest) * (0.5 + 0.5 * look().close) },
      { id: 'songbird', kind: 'chirps', rate: 0.25, freq: [1500, 2400], slide: 0.8, length: 0.22, notes: [2, 3], gap: 0.3, gain: 0.06,
        level: () => day() * of('birds') * (0.5 + 0.5 * look().close) },
      { id: 'crickets', kind: 'chirps', rate: 2.2, freq: [4300, 4900], slide: 1.0, length: 0.22, notes: [1, 2], gap: 0.3, gain: 0.03, tremolo: 28,
        level: () => (1 - day()) * of('crickets') * (0.5 + 0.5 * look().close) },
      { id: 'owl', kind: 'chirps', rate: 0.05, freq: [330, 400], slide: 0.9, length: 0.5, notes: [2, 2], gap: 0.7, gain: 0.08,
        level: () => (1 - day()) * (0.3 + look().forest) * (season() === 'winter' ? 0.5 : 1) },
      // people
      { id: 'voices', kind: 'noise', filter: 'bandpass', freq: 520, q: 1.4, gain: 0.22, sway: { rate: 1.7, depth: 0.6 }, wobble: { rate: 0.9, cents: 700 },
        level: () => clamp(look().people / 25) * look().close * (0.25 + 0.75 * day()) },
      { id: 'axe', kind: 'ticks', rate: 0.9, freq: [500, 800], q: 3, length: 0.09, gain: 0.5,
        level: () => look().has.lodge ? working() * look().close : 0 },
      { id: 'hammer', kind: 'ticks', rate: 1.4, freq: [1500, 2200], q: 6, length: 0.05, gain: 0.3,
        level: () => look().has.carpenter ? working() * look().close : 0 },
      // fire: a house burning is loud; in winter the hearths of a village can just be heard
      { id: 'fire', kind: 'noise', filter: 'lowpass', freq: 900, q: 0.8, gain: 0.5, sway: { rate: 3.1, depth: 0.5 },
        level: () => look().fire ? 0.5 + 0.5 * look().close : 0 },
      { id: 'crackle', kind: 'ticks', rate: 9, freq: [2500, 6000], q: 2, length: 0.02, gain: 0.35,
        level: () => look().fire ? 0.5 + 0.5 * look().close : season() === 'winter' && look().houses ? 0.12 * look().close : 0 },
    ],
    strikes: {
      bell: { freq: 392, length: 3.5, gain: 0.16 },                       // the chapel's bell
      alarm: { freq: 587, length: 1.2, gain: 0.2 },                      // the same bell, rung fast
    },
  });

  let wanted = true;
  try { wanted = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* no storage: sound stays on for this visit */ }
  return {
    /** Is sound switched on (the player's choice, kept on this device)? */
    get wanted() { return wanted; },
    get playing() { return A.on; },
    /** Switch it on or off. Must be called from a tap. */
    set(on) { wanted = on; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* not kept */ } if (on) A.start(); else A.stop(); },
    /** The first tap anywhere starts the sound, if it is wanted (browsers allow no sound before that). */
    wake() { if (wanted && !A.on) A.start(); },
    update() { A.update(); },
    sleep(asleep) { A.sleep(asleep); },
    /** Listen to a settlement's calendar: the bell rings the day in and out where there is a chapel or a church. */
    follow(calendar) {
      calendar.on('hour', c => {
        const h = Math.floor(c.hour);
        if (h !== 6 && h !== 18) return;
        const bs = live().game.world.buildings;
        if (bs.some(b => b && (b.name === 'chapel' || b.name === 'great church') && b.open)) A.strike('bell', h === 6 ? 3 : 2);
      });
    },
    /** A building has caught fire. */
    alarm() { A.strike('alarm', 6, 0.45); },
    levels: A.levels,
  };
}
