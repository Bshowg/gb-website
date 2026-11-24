// A calendar, as an engine module. Optional: the engine only counts ticks.
//
// It turns ticks into hours, days, seasons and years, tells whoever asks when one of them begins, and
// offers the time of day and year as numbers a game can write into its decision matrix (sleep at night,
// stay warm in winter). It decides nothing itself: what a season does is the game's business.

/**
 * @param {object} def
 * @param {number} def.day                     ticks in a day
 * @param {number} [def.startHour=6]           the hour the game opens at
 * @param {Array<{name:string, days:number}>} [def.seasons]   in order; together they make a year. Omit for a calendar of days only.
 * @param {number} [def.startSeason=0]         index of the season the game opens in
 * @param {{dawn?:[number,number], dusk?:[number,number]}} [def.light]
 *        hours over which night lifts and falls: default dawn [5, 7], dusk [21, 23]
 */
export function createCalendar(def) {
  const DAY = def.day, HOUR = DAY / 24, startHour = def.startHour ?? 6;
  const seasons = def.seasons ?? [], S = seasons.length;
  const yearDays = seasons.reduce((n, s) => n + s.days, 0);
  const firstDay = []; { let d = 0; for (const s of seasons) { firstDay.push(d); d += s.days; } }
  const offsetDays = S ? firstDay[def.startSeason ?? 0] : 0;          // the game opens on the first day of the starting season
  const dawn = def.light?.dawn ?? [5, 7], dusk = def.light?.dusk ?? [21, 23];
  const ramp = (h, a, b) => Math.max(0, Math.min(1, (h - a) / (b - a)));
  const listeners = { hour: [], day: [], season: [], year: [] };

  const C = {
    sim: null,
    /** Lengths in ticks. */
    HOUR, DAY, YEAR: yearDays * DAY,
    seasons,
    /** Game time → ticks. */
    hours: h => h * HOUR, days: d => d * DAY, years: y => y * yearDays * DAY,
    /** The length of a season in ticks (by index or name; default: the current one). */
    seasonTicks: s => seasons[s === undefined ? C.season : typeof s === 'number' ? s : seasons.findIndex(x => x.name === s)].days * DAY,

    /**
     * Everything about a moment: { hour (0-24, fractional), day (1-based, since the start), year (1-based),
     * season (index), seasonName, dayOfSeason (1-based), seasonProgress (0..1), yearProgress (0..1), night (0..1) }.
     */
    at(tick) {
      const t = tick + startHour * HOUR, dayIndex = Math.floor(t / DAY), hour = (t % DAY) / HOUR;
      const out = { hour, day: dayIndex + 1, year: 1, season: -1, seasonName: '', dayOfSeason: dayIndex + 1, seasonProgress: 0, yearProgress: 0,
                    night: 1 - ramp(hour, dawn[0], dawn[1]) * (1 - ramp(hour, dusk[0], dusk[1])) };
      if (!S) return out;
      const abs = dayIndex + offsetDays, inYear = abs % yearDays;
      out.year = Math.floor(abs / yearDays) + 1;
      let s = S - 1; while (firstDay[s] > inYear) s--;
      out.season = s; out.seasonName = seasons[s].name; out.dayOfSeason = inYear - firstDay[s] + 1;
      out.seasonProgress = (inYear - firstDay[s] + (t % DAY) / DAY) / seasons[s].days;
      out.yearProgress = (inYear + (t % DAY) / DAY) / yearDays;
      return out;
    },
    /** Ticks from now until the next start of a season (by name or index). 0 never: on its first tick it is a year away. */
    until(season) {
      const s = typeof season === 'number' ? season : seasons.findIndex(x => x.name === season);
      const now = C.at(C.tick), start = firstDay[s], today = firstDay[now.season] + now.dayOfSeason - 1;
      let days = start - today; if (days <= 0) days += yearDays;
      return days * DAY - Math.round((now.hour / 24) * DAY);
    },
    /** Hear about beginnings: on('hour' | 'day' | 'season' | 'year', (calendar) => …). Returns a function that stops listening. */
    on(kind, fn) { listeners[kind].push(fn); return () => { listeners[kind] = listeners[kind].filter(f => f !== fn); }; },
    /** "09:30" for the current hour. */
    clock() { const m = Math.floor(C.hour * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; },
    /** Stats a progress module can sample: { year, day, season }. */
    gauges: () => ({ year: () => C.year, day: () => C.day, season: () => C.season }),

    // The current moment, kept up to date every tick (the fields of at(), flattened here):
    tick: 0, hour: startHour, day: 1, year: 1, season: S ? def.startSeason ?? 0 : -1, seasonName: S ? seasons[def.startSeason ?? 0].name : '',
    dayOfSeason: 1, seasonProgress: 0, yearProgress: 0, night: 0,
  };

  function refresh(tick) {
    const was = { hour: Math.floor(C.hour), day: C.day, season: C.season, year: C.year };
    Object.assign(C, C.at(tick)); C.tick = tick;
    return was;
  }
  function setup(sim) { C.sim = sim; refresh(sim.tick); }
  function onTick(sim) {
    const was = refresh(sim.tick);
    if (Math.floor(C.hour) === was.hour && C.day === was.day) return;
    for (const f of listeners.hour) f(C);
    if (C.day === was.day) return;
    for (const f of listeners.day) f(C);
    if (C.season !== was.season) for (const f of listeners.season) f(C);
    if (C.year !== was.year) for (const f of listeners.year) f(C);
  }

  /** Hand this to the engine: `modules: [calendar.module, …]`. Put it first, so the others see the new day on the tick it begins. */
  // Nothing of its own to save: the moment follows from the tick. After a load it only has to look at the clock again.
  C.module = { name: 'calendar', setup, onTick, load: (data, sim) => { refresh(sim.tick); } };
  return C;
}
