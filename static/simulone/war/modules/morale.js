// Fear and fatigue on a battlefield, as two needs of every man. Nothing here makes anyone run: a man runs when his
// action matrix says that running scores higher than standing, and fear is what pushes it there.
//
// Fear rises with what a man suffers and sees: a blow (more from behind), a friend struck down beside him, enemies
// outnumbering the friends around him, friends running past him, his regiment wasting away. It falls when he is among
// friends, in his place, near his regiment's standard, and faster when no enemy is near. Each kind of man has a
// nerve, and experience steadies him. Running is catching: that is how a flank gives way all at once.
//
// Fatigue rises while a man hurries and while he fights, and falls while he stands.

/**
 * @param {object} d
 * @param {string} d.fear, d.fatigue                     the needs' names
 * @param {Record<string, number>} d.nerve               per agent type name: how strongly fear takes him (1 = ordinary)
 * @param {object} d.rates                               per tick, see the defaults below
 * @param {object} d.combat                              the combat module (for who is near)
 * @param {(i:number) => number} d.steady                0…1: how steady man i's regiment is (experience, a standard near)
 * @param {(i:number) => number} d.losses                0…1: how much of man i's regiment is gone
 * @param {(i:number) => boolean} d.inPlace              is man i in his place in the ranks
 * @param {(i:number) => boolean} d.away                 is man i running
 * @param {(i:number) => number} d.sideOf               0 or 1
 * @param {(i:number) => boolean} [d.fighter]           is agent i a fighter at all (others are left alone)
 */
export function createMorale(d) {
  const r = {
    hit: 0.35,          // fear from a blow, times the share of his health it took
    flank: 0.06,        // more, for a blow from behind
    arrow: 0.04,        // more, for an arrow
    friendDown: 0.025,  // fear to each friend near a man struck down (within `downRange` cells)
    downRange: 2.5,
    outnumbered: 0.0012,// a tick, for each enemy too many around him (beyond as many as his friends)
    contagion: 0.004,   // a tick, times the share of the friends around him who are running
    losses: 0.0008,     // a tick, times how much of his regiment is gone beyond a third
    calm: 0.0012,       // a tick, fear lost among friends
    calmFar: 0.004,     // a tick, more, with no enemy around
    tire: 0.0005,       // fatigue a tick while hurrying
    tireFight: 0.0012,  // fatigue a tick while an enemy is in reach
    rest: 0.0009,       // fatigue lost a tick while standing
    ...d.rates,
  };
  const M = { sim: null, rates: r };
  let fearK = 0, fatK = 0, nerve = null, K = 0;

  /** Man i was hurt: how much of his health it took, and how (from combat). */
  M.hit = (i, share, from) => {
    const sim = M.sim, n = i * K + fearK;
    const add = (r.hit * share + (from.flank ? r.flank : 0) + (from.arrow ? r.arrow : 0)) * nerve[sim.type[i]] * (1 - 0.5 * d.steady(i));
    sim.needsOf[n] = Math.min(1, sim.needsOf[n] + add);
  };
  /** Man i is struck down: his friends close by take fright. */
  M.down = i => {
    const sim = M.sim, s = d.sideOf(i), x = sim.px[i], y = sim.py[i], R2 = r.downRange * r.downRange;
    const W = sim.world.w, cx = x | 0, cy = y | 0, rr = Math.ceil(r.downRange);
    const C = d.combat;
    for (let yy = cy - rr; yy <= cy + rr; yy++) for (let xx = cx - rr; xx <= cx + rr; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= sim.world.h) continue;
      for (let o = C.first(s, yy * W + xx); o >= 0; o = C.after(o)) {
        if (o === i || (d.fighter && !d.fighter(o))) continue;
        const dx = sim.px[o] - x, dy = sim.py[o] - y;
        if (dx * dx + dy * dy > R2) continue;
        const n = o * K + fearK;
        sim.needsOf[n] = Math.min(1, sim.needsOf[n] + r.friendDown * nerve[sim.type[o]] * (1 - 0.5 * d.steady(o)));
      }
    }
  };

  function setup(sim) {
    M.sim = sim; K = sim.K; fearK = sim.needIndex(d.fear); fatK = sim.needIndex(d.fatigue);
    nerve = Float32Array.from(sim.types, t => d.nerve[t.name] ?? 1);
  }
  function onTick(sim) {
    const C = d.combat, N = sim.count, step = 4, phase = (sim.tick + 2) & 3;   // a quarter of the men a tick, four ticks' worth each
    for (let i = phase; i < N; i += step) {
      if (d.fighter && !d.fighter(i)) continue;
      const n = i * K, f = C.near[i], e = C.nearFoe[i], away = C.nearAway[i], steady = d.steady(i), nv = nerve[sim.type[i]];
      let fear = sim.needsOf[n + fearK];
      let up = 0;
      if (e > f) up += r.outnumbered * Math.min(20, e - f);
      if (f > 1) up += r.contagion * (away / f) * (d.away(i) ? 0.3 : 1);
      const lost = d.losses(i);
      if (lost > 0.33) up += r.losses * (lost - 0.33) * 3;
      let down = r.calm * (1 + steady) * (d.inPlace(i) ? 1.4 : 0.7) * Math.min(1.5, f / 12);
      if (C.foeD[i] > 12) down += r.calmFar * (1 + steady);
      fear += (up * nv * (1 - 0.5 * steady) - down) * step;
      sim.needsOf[n + fearK] = fear < 0 ? 0 : fear > 1 ? 1 : fear;

      let tired = sim.needsOf[n + fatK];
      const v = Math.hypot(sim.vx[i], sim.vy[i]), top = sim.speed[i];
      if (C.foeD[i] < 1.3) tired += r.tireFight * step;
      else if (v > top * 0.55) tired += r.tire * step * (v / top);
      else if (v < top * 0.2) tired -= r.rest * step;
      sim.needsOf[n + fatK] = tired < 0 ? 0 : tired > 1 ? 1 : tired;
    }
  }
  M.module = { name: 'morale', setup, onTick };
  return M;
}
