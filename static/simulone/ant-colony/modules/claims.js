// A map as plots, held or not. The whole map exists from the start; the player holds some rectangles of
// it and may claim more, one that touches what is already held at a time. The module keeps which plots
// are held, says which can be claimed next and at what price, carries out a claim, and reports the
// bounds of what is held. What a plot contains, what a claim is paid with and what holding a plot allows
// are the game's business: it asks `held(x, y)` wherever that matters.

/**
 * @param {object} d
 * @param {number} d.size                      a plot is this many cells on a side
 * @param {number} d.cols, d.rows              how many plots the map is across and down
 * @param {Array<[number, number]>} d.held     the plots held at the start, as [col, row]
 * @param {(col:number, row:number) => object} [d.describe]   whatever the game wants kept with a plot (its kind, a hint…): `plot.info`
 * @param {(bought:number, plot:object) => number} d.price    what the next claim costs, given how many were bought so far
 * @param {(plot:object) => (true|string)} [d.allowed]        may this plot be claimed at all? true, or the reason it may not
 * @param {(amount:number, plot:object) => boolean} d.pay     take the price; false if it cannot be paid (nothing is then taken)
 * @param {(plot:object) => void} [d.onClaim]                 a plot has just been claimed
 */
export function createClaims(d) {
  const C = {
    /** Every plot: { col, row, x0, y0, x1, y1 (cells, inclusive), held, info }. */
    plots: [],
    /** How many plots have been bought. */
    bought: 0,
    size: d.size, cols: d.cols, rows: d.rows,
  };
  for (let row = 0; row < d.rows; row++) for (let col = 0; col < d.cols; col++)
    C.plots.push({ col, row, x0: col * d.size, y0: row * d.size, x1: (col + 1) * d.size - 1, y1: (row + 1) * d.size - 1,
                   held: d.held.some(h => h[0] === col && h[1] === row), info: d.describe ? d.describe(col, row) : {} });

  /** The plot at [col, row], or undefined outside the map. */
  C.plot = (col, row) => (col >= 0 && row >= 0 && col < d.cols && row < d.rows ? C.plots[row * d.cols + col] : undefined);
  /** The plot a cell is in. */
  C.at = (x, y) => C.plot(Math.floor(x / d.size), Math.floor(y / d.size));
  /** Is this cell in a held plot? */
  C.held = (x, y) => C.at(x, y)?.held === true;
  /** Does this plot touch a held one along a side? */
  C.touches = p => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => C.plot(p.col + i, p.row + j)?.held);
  /** The plots that could be claimed next: not held, touching one that is. */
  C.claimable = () => C.plots.filter(p => !p.held && C.touches(p));
  /** What claiming this plot costs now. */
  C.priceOf = p => Math.round(d.price(C.bought, p));
  /** Why this plot cannot be claimed right now (a sentence), or null if it can be tried. Paying is only checked by `claim`. */
  C.why = p => {
    if (p.held) return 'already held';
    if (!C.touches(p)) return 'it does not touch ground the colony holds';
    const ok = d.allowed ? d.allowed(p) : true;
    return ok === true ? null : ok || 'not allowed';
  };
  /** Claim a plot. Returns true, or a sentence saying why not. */
  C.claim = p => {
    const why = C.why(p);
    if (why) return why;
    if (!d.pay(C.priceOf(p), p)) return 'it cannot be paid for';
    p.held = true; C.bought++;
    if (d.onClaim) d.onClaim(p);
    return true;
  };
  /** The rectangle around everything held, in cells: { x0, y0, x1, y1 } (inclusive). */
  C.bounds = () => {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const p of C.plots) if (p.held) { b.x0 = Math.min(b.x0, p.x0); b.y0 = Math.min(b.y0, p.y0); b.x1 = Math.max(b.x1, p.x1); b.y1 = Math.max(b.y1, p.y1); }
    return b;
  };

  C.save = () => ({ bought: C.bought, held: C.plots.filter(p => p.held).map(p => [p.col, p.row]) });
  /** Put saved claims back. `onClaim` is not called: the map that was saved already shows what the claims did. */
  C.load = data => {
    if (!data) return;
    C.bought = data.bought ?? 0;
    for (const p of C.plots) p.held = data.held.some(h => h[0] === p.col && h[1] === p.row);
  };

  /** Hand this to the engine: `modules: [claims.module, …]` (it has no hooks; this is for saving). */
  C.module = { name: 'claims', save: () => C.save(), load: data => C.load(data) };
  return C;
}
