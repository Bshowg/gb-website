// Day and night, and a run of weather. The day is a fixed length with night as its last part. The weather
// is one kind at a time (calm, rain, heat…), each lasting a while and followed by another drawn by weight.
// The kind that comes next is known a little ahead, so a game can warn the player.
//
// The module only keeps time and says what it is like out. What night or rain do is the game's business.

/**
 * @param {object} d
 * @param {number} d.day                     ticks in a whole day, night included
 * @param {number} [d.night=0.3]             the share of the day, at its end, that is night
 * @param {Record<string, {weight:number, lasts:[number, number]}>} d.kinds   how likely each kind is to come next, and how
 *                                           long it lasts (ticks, from-to)
 * @param {string} d.start                   the kind the game begins in
 * @param {number} [d.quiet=0]               the first spell lasts at least this long (ticks)
 * @param {number} [d.warn=0]                the next kind is announced this many ticks before it begins
 */
export function createWeather(d) {
  const names = Object.keys(d.kinds), night = d.night ?? 0.3;
  const Wt = {
    /** The kind of weather now, and the kind that follows it. */
    now: d.start, next: d.start,
    /** The tick the next kind begins. */
    until: 0,
    /** Is it night? How far through the day it is (0..1), and which day (from 1). */
    isNight: false, hour: 0, dayNo: 1,
    /** Called with ('warn', next kind) | ('begin', kind) | ('dusk') | ('dawn'). */
    onEvent: null,
    sim: null,
  };
  const pick = (sim, not) => {
    let total = 0;
    for (const n of names) if (n !== not || names.length === 1) total += d.kinds[n].weight;
    let r = sim.rnd() * total;
    for (const n of names) { if (n === not && names.length > 1) continue; r -= d.kinds[n].weight; if (r <= 0) return n; }
    return names[0];
  };
  const spell = (sim, kind) => { const [a, b] = d.kinds[kind].lasts; return Math.round(a + sim.rnd() * (b - a)); };
  /** Ticks until the next kind begins. */
  Wt.left = () => Wt.until - Wt.sim.tick;
  /** Is the next kind already announced? */
  Wt.warned = () => Wt.next !== Wt.now && Wt.left() <= (d.warn ?? 0);

  function setup(sim) {
    Wt.sim = sim; Wt.now = d.start; Wt.isNight = false; Wt.hour = 0; Wt.dayNo = 1;
    Wt.until = Math.max(d.quiet ?? 0, spell(sim, d.start)); Wt.next = pick(sim, d.start);
  }
  function onTick(sim) {
    const t = sim.tick;
    Wt.hour = (t % d.day) / d.day; Wt.dayNo = 1 + ((t / d.day) | 0);
    const dark = Wt.hour >= 1 - night;
    if (dark !== Wt.isNight) { Wt.isNight = dark; if (Wt.onEvent) Wt.onEvent(dark ? 'dusk' : 'dawn'); }
    if (d.warn && Wt.until - t === d.warn && Wt.next !== Wt.now && Wt.onEvent) Wt.onEvent('warn', Wt.next);
    if (t < Wt.until) return;
    Wt.now = Wt.next; Wt.until = t + spell(sim, Wt.now); Wt.next = pick(sim, Wt.now);
    if (Wt.onEvent) Wt.onEvent('begin', Wt.now);
  }

  Wt.save = () => ({ now: Wt.now, next: Wt.next, until: Wt.until });
  Wt.load = s => { if (s && names.includes(s.now) && names.includes(s.next)) { Wt.now = s.now; Wt.next = s.next; Wt.until = s.until; } };

  /** Hand this to the engine: `modules: [weather.module, …]`. */
  Wt.module = { name: 'weather', setup, onTick, save: () => Wt.save(), load: s => Wt.load(s) };
  return Wt;
}
