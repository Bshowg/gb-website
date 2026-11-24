// Reputation, as an engine module: one slow-moving rating made from many scores, and what it is worth.
// Optional: the engine does not know it exists.
//
// Scores come in one at a time (a visit, a delivery, a match: whatever the game scores). They are gathered for a
// day; when the game closes the day, the rating moves part of the way from where it was to the day's average. A
// day with few scores moves it less. The rating is then worth a factor the game reads off a curve it gives
// (tomorrow's visitors, a price people will pay): the module decides nothing about what the factor is used for.

/**
 * @param {object} def
 * @param {number} [def.start=3]      the rating a new game opens with
 * @param {number} [def.min=0], [def.max=5]
 * @param {number} [def.follow=0.3]   how far the rating moves towards a day's average at the end of that day (0..1)
 * @param {number} [def.enough=20]    scores in a day for the full move; with fewer it moves in proportion
 * @param {Array<[number, number]>} [def.worth]   points [rating, factor], rising in rating: `factor()` reads between them
 *        (default: always 1)
 * @param {number} [def.keep=30]      how many days of history are kept
 */
export function createReputation(def = {}) {
  const lo = def.min ?? 0, hi = def.max ?? 5, follow = def.follow ?? 0.3, enough = def.enough ?? 20, keep = def.keep ?? 30;
  const worth = def.worth ?? [[lo, 1], [hi, 1]];
  const R = {
    /** The rating now. It only changes when a day is closed. */
    rating: def.start ?? 3,
    /** Today so far: { n, sum }. */
    today: { n: 0, sum: 0 },
    /** Closed days, newest first: [{ n, average, rating (after that day) }]. */
    days: [],
  };
  /** One more score. */
  R.add = score => { R.today.n++; R.today.sum += Math.max(lo, Math.min(hi, score)); };
  /** The average of today's scores so far (the rating itself if there are none). */
  R.average = () => (R.today.n ? R.today.sum / R.today.n : R.rating);
  /** What a rating is worth, read off the `worth` curve (the rating now, if none is given). */
  R.factor = (rating = R.rating) => {
    if (rating <= worth[0][0]) return worth[0][1];
    for (let k = 1; k < worth.length; k++) if (rating <= worth[k][0]) { const [a, fa] = worth[k - 1], [b, fb] = worth[k]; return fa + (fb - fa) * (rating - a) / (b - a); }
    return worth[worth.length - 1][1];
  };
  /** Close the day: the rating moves towards the day's average. Returns { n, average, before, rating }. */
  R.endDay = () => {
    const n = R.today.n, average = R.average(), before = R.rating;
    R.rating = Math.max(lo, Math.min(hi, before + (average - before) * follow * Math.min(1, n / enough)));
    R.today = { n: 0, sum: 0 };
    R.days.unshift({ n, average, rating: R.rating }); if (R.days.length > keep) R.days.pop();
    return { n, average, before, rating: R.rating };
  };
  /** Move the rating by `delta` now, for a reason of the game's own (a fine, a prize). */
  R.shift = delta => { R.rating = Math.max(lo, Math.min(hi, R.rating + delta)); return R.rating; };
  /** How many of the latest closed days in a row ended with the rating at `mark` or better. */
  R.held = mark => { let k = 0; while (k < R.days.length && R.days[k].rating >= mark) k++; return k; };

  /** Hand this to the engine: `modules: [reputation.module, …]`. It has no hooks beyond being saved with the game. */
  R.module = { name: 'reputation',
    setup() { R.rating = def.start ?? 3; R.today = { n: 0, sum: 0 }; R.days = []; },
    save: () => ({ rating: R.rating, today: { ...R.today }, days: R.days.slice() }),
    load(d) { if (!d) return; R.rating = d.rating ?? R.rating; R.today = { n: 0, sum: 0, ...(d.today ?? {}) }; R.days = d.days ?? []; } };
  return R;
}
