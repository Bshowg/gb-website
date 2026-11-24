// Regiments: soldiers grouped under one order and one formation. A regiment is a point on the map (its standard) that
// faces a way and moves; its formation gives every man a slot around that point, and the slots move with it. The men
// are ordinary agents: whether a man stands in his slot, goes for an enemy or runs is his own decision, made by the
// action matrix. This module keeps the regiments, works out where each slot is, moves each standard towards where it
// was ordered, and counts how each regiment stands (men, how many are in their places, fighting, running).
//
// It knows nothing about what an order means to a man: the game reads `regimentOf(i).order` and turns it into matrix
// inputs. It knows nothing about fighting either: `engaged(i)` is asked of the game.

/** Slot shapes, in cells, around the standard: u to the right, v forward (the way the regiment faces). */
const SHAPES = {
  // ranks of `files` men, front rank first, the last rank centred
  ranks(s, n, files, sp, o) {
    const F = Math.max(1, Math.min(files, n)), rank = (s / F) | 0, Rn = Math.ceil(n / F);
    const m = rank === Rn - 1 ? n - rank * F : F, f = s - rank * F;
    o[0] = (f - (m - 1) / 2) * sp; o[1] = ((Rn - 1) / 2 - rank) * sp;
  },
  // a point forward: rank k has 2k + 1 men
  wedge(s, n, files, sp, o) {
    const k = Math.floor(Math.sqrt(s)), f = s - k * k, K = Math.ceil(Math.sqrt(n));
    o[0] = (f - k) * sp; o[1] = ((K - 1) / 2 - k) * sp;
  },
  // a hollow square three deep, every side facing out
  square(s, n, files, sp, o) {
    let S = 3, rings = 1;
    for (;;) { rings = Math.min(3, Math.floor((S - 1) / 2)); let t = 0; for (let j = 0; j < rings; j++) t += 4 * (S - 2 * j - 1); if (t >= n || S > 60) break; S++; }
    let j = 0, p = s;
    while (j < rings - 1 && p >= 4 * (S - 2 * j - 1)) { p -= 4 * (S - 2 * j - 1); j++; }
    const L = S - 2 * j - 1, side = Math.min(3, (p / L) | 0), t = p - side * L, h = L / 2;
    o[0] = (side === 0 ? -h + t : side === 1 ? h : side === 2 ? h - t : -h) * sp;
    o[1] = (side === 0 ? h : side === 1 ? h - t : side === 2 ? -h : -h + t) * sp;
  },
};

/**
 * @param {object} d
 * @param {string[]} d.sides                      the two sides, by name
 * @param {Record<string, {shape:'ranks'|'wedge'|'square', spacing:number, files?:number, pace?:number}>} d.formations
 *        each formation's shape, the room between men in cells, a fixed number of files (else the regiment's own width),
 *        and how fast a regiment marches in it (1 = its men's walking speed)
 * @param {(type:number) => number} d.speedOf     cells per tick a man of that type walks
 * @param {(i:number) => boolean} d.engaged       is man i in a fight right now
 * @param {(i:number) => boolean} d.away          is man i running or leaving the field (not counted as standing with his regiment)
 * @param {number} [d.turn=0.03]                  radians a regiment can wheel per tick
 * @param {number} [d.every=8]                    ticks between counts of how each regiment stands
 * @param {number} [d.reform=60]                  ticks between closing up the ranks (slots handed out again, front first)
 * @param {number} [d.margin=4]                   cells a standard keeps from the edge of the map
 * @param {number} [d.room=0.7]                   how close two standards of one side may come, as a share of their widths
 */
export function createRegiments(d) {
  const turn = d.turn ?? 0.03, every = d.every ?? 8, reform = d.reform ?? 60, margin = d.margin ?? 4, room = d.room ?? 0.7;
  const R = {
    sim: null,
    /** Every regiment, by id (null once it is gone from the field). */
    list: [],
    /** Per man: his regiment's id (-1: none), his slot in it, and his side (0 or 1). */
    reg: null, slot: null, side: null,
  };
  let nextId = 0;
  const uv = [0, 0];

  /**
   * Put a regiment on the field. `spec`: { side (name or index), kind, name, x, y, face (radians), files, formation,
   * order, exp, …anything of the game's own }. Its men are added afterwards with sim.add(x, y, { type, regiment }).
   */
  R.add = spec => {
    const side = typeof spec.side === 'number' ? spec.side : d.sides.indexOf(spec.side);
    const r = { formation: 'line', order: 'hold', files: 24, face: 0, exp: 0, ...spec, id: nextId++, side, dest: null,
      men: 0, active: 0, start: 0, cohesion: 1, engagedShare: 0, fear: 0, fatigue: 0, broken: false, gone: { killed: 0, wounded: 0, fled: 0 } };
    r.cos = Math.cos(r.face); r.sin = Math.sin(r.face);
    R.list[r.id] = r;
    return r;
  };
  R.get = id => (id >= 0 ? R.list[id] ?? null : null);
  R.of = i => R.get(R.reg[i]);
  /** The regiments still on the field, of one side or of both. */
  R.all = side => R.list.filter(r => r && r.men > 0 && (side === undefined || r.side === side));
  /** Forget every regiment (a new battle). */
  R.clear = () => { R.list = []; nextId = 0; };

  /** Where slot s of regiment r is now, in cells: written into out[0], out[1]. */
  R.slotPos = (r, s, out) => {
    const f = d.formations[r.formation], files = f.files ?? r.files;
    SHAPES[f.shape](s, Math.max(1, r.active), files, f.spacing, uv);
    const u = uv[0], v = uv[1];
    // forward is (cos, sin); right is forward turned a quarter clockwise on the map: (-sin, cos)
    out[0] = r.x + v * r.cos - u * r.sin; out[1] = r.y + v * r.sin + u * r.cos;
    return out;
  };
  /** How deep and how wide a regiment stands now, in cells: [width, depth]. */
  R.size = r => {
    const f = d.formations[r.formation], files = Math.min(f.files ?? r.files, Math.max(1, r.active));
    if (f.shape === 'ranks') return [files * f.spacing, Math.ceil(Math.max(1, r.active) / files) * f.spacing];
    const k = Math.sqrt(Math.max(1, r.active)) * f.spacing * (f.shape === 'square' ? 0.6 : 1);
    return [k * (f.shape === 'wedge' ? 2 : 1), k];
  };

  /**
   * Give a regiment an order. `dest`: { x, y, face? } for where to go and which way to face there (face kept as it is if
   * left out), or null to stay where it is. The order is a name of the game's; the module only moves the standard.
   */
  R.order = (r, order, dest = undefined) => {
    r.order = order;
    if (dest !== undefined) r.dest = dest ? { x: keepX(dest.x), y: keepY(dest.y), face: dest.face } : null;
  };
  const keepX = x => Math.max(margin, Math.min(R.sim.world.w - margin, x)), keepY = y => Math.max(margin, Math.min(R.sim.world.h - margin, y));
  R.setFormation = (r, formation, files) => { r.formation = formation; if (files) r.files = Math.max(4, Math.round(files)); };

  function setup(sim) {
    R.sim = sim;
    R.reg = sim.addColumn('regiment', Int16Array, -1);
    R.slot = sim.addColumn('slot', Int16Array, 0);
    R.side = sim.addColumn('side', Uint8Array, 0);
  }
  function onSpawn(i, opts) {
    const r = opts.regiment;
    if (!r) return;
    R.reg[i] = r.id; R.side[i] = r.side; R.slot[i] = opts.slot ?? r.men;
    r.men++; r.active++; r.start++;
  }
  function onGone(i, cause) {
    const r = R.of(i);
    if (!r) return;
    r.men--; if (!d.away(i)) r.active--;
    r.gone[cause] = (r.gone[cause] ?? 0) + 1;
  }

  // Count how each regiment stands: men, men standing with it, in their places, fighting; how afraid and tired.
  const pos = [0, 0];
  function count(sim) {
    const L = R.list;
    for (const r of L) if (r) { r.men = 0; r.active = 0; r._in = 0; r._eng = 0; r._fear = 0; r._fat = 0; }
    const K = sim.K, fearK = sim.needIndex('fear'), fatK = sim.needIndex('fatigue'), offK = sim.needIndex('placeOff');
    for (let i = 0; i < sim.count; i++) {
      const r = L[R.reg[i]];
      if (!r) continue;
      r.men++;
      if (d.away(i)) continue;
      r.active++;
      const n = i * K;
      if (sim.needsOf[n + offK] < 0.25) r._in++;
      if (d.engaged(i)) r._eng++;
      r._fear += sim.needsOf[n + fearK]; r._fat += sim.needsOf[n + fatK];
    }
    for (const r of L) if (r) {
      const a = Math.max(1, r.active);
      r.cohesion = r._in / a; r.engagedShare = r._eng / a; r.fear = r._fear / a; r.fatigue = r._fat / a;
      r.broken = r.men > 0 && r.active < Math.max(3, r.men * 0.3);
    }
  }
  // Close up the ranks: the men standing with each regiment get slots 0, 1, 2… in the order of the slots they had,
  // so the front fills from behind; the men who are running get the slots after.
  function closeUp(sim) {
    const lists = new Map();
    for (let i = 0; i < sim.count; i++) { const id = R.reg[i]; if (id < 0) continue; let l = lists.get(id); if (!l) lists.set(id, l = []); l.push(i); }
    for (const l of lists.values()) {
      l.sort((a, b) => (d.away(a) - d.away(b)) || R.slot[a] - R.slot[b]);
      l.forEach((i, k) => { R.slot[i] = k; });
    }
  }
  // Move each standard towards where it was ordered: at its men's pace, slower while they are out of their places,
  // not at all while many of them are fighting; it wheels before it marches off at an angle.
  function march(sim) {
    for (const r of R.list) {
      if (!r || r.men <= 0) continue;
      let want = r.face;
      if (r.dest) {
        const dx = r.dest.x - r.x, dy = r.dest.y - r.y, dist = Math.hypot(dx, dy);
        if (dist < 0.3) { r.x = r.dest.x; r.y = r.dest.y; if (r.dest.face !== undefined) want = r.dest.face; r.dest = r.dest.face !== undefined && Math.abs(angle(r.dest.face - r.face)) > 0.02 ? r.dest : null; if (r.onArrive && !r.dest) r.onArrive(r); }
        else {
          const ahead = Math.atan2(dy, dx);
          want = r.dest.face !== undefined && dist < 6 ? r.dest.face : Math.abs(angle(ahead - r.face)) > 2.2 ? r.face : ahead;   // far back over its shoulder: step back facing the same way
          const f = d.formations[r.formation];
          let pace = (r.pace ?? 1) * d.speedOf(r.type) * (f.pace ?? 1) * 0.85;
          if (r.cohesion < 0.7) pace *= Math.max(0.4, (r.cohesion - 0.2) / 0.5);   // wait for the men
          if (r.engagedShare > 0.2) pace = 0;                                     // a fight holds it where it is
          if (Math.abs(angle(want - r.face)) > 0.5) pace *= 0.2;                  // wheel first
          const k = Math.min(1, pace / dist);
          r.x += dx * k; r.y += dy * k;
        }
      }
      if (r.dest) { r.dest.x = keepX(r.dest.x); r.dest.y = keepY(r.dest.y); }
      r.x = keepX(r.x); r.y = keepY(r.y);
      const da = angle(want - r.face);
      if (Math.abs(da) > 1e-4) { r.face += Math.max(-turn, Math.min(turn, da)); r.cos = Math.cos(r.face); r.sin = Math.sin(r.face); }
    }
  }
  // Two standards of one side do not stand on each other: each is pushed a little away from the other.
  function spread() {
    const L = R.list.filter(r => r && r.men > 0 && !r.broken);
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
      const p = L[a], q = L[b];
      if (p.side !== q.side) continue;
      const dx = q.x - p.x, dy = q.y - p.y, dd = Math.hypot(dx, dy), want = (R.size(p)[0] + R.size(q)[0]) / 2 * room;
      if (dd >= want) continue;
      const k = Math.min(0.08, (want - dd) * 0.05) / (dd || 1), ux = dd ? dx : 1, uy = dd ? dy : 0;
      p.x -= ux * k; p.y -= uy * k; q.x += ux * k; q.y += uy * k;
    }
  }
  function onTick(sim) {
    march(sim);
    if (sim.tick % 2 === 0) spread();
    if (sim.tick % every === 0) count(sim);
    if (sim.tick % reform === 0) closeUp(sim);
  }

  /** The regiments as plain data, for a saved battle. */
  R.save = () => ({ next: nextId, list: R.list.map(r => (r ? { ...r, _in: undefined, _eng: undefined, _fear: undefined, _fat: undefined } : null)) });
  R.load = data => { R.list = (data?.list ?? []).map(r => (r ? { ...r } : null)); nextId = data?.next ?? R.list.length; };

  R.slotOf = (i, out = pos) => R.slotPos(R.of(i), R.slot[i], out);
  /** Hand this to the engine: `modules: [regiments.module, …]`. */
  R.module = { name: 'regiments', setup, onSpawn, onGone, onTick };
  return R;
}

/** An angle brought into -π…π. */
export function angle(a) { a %= 2 * Math.PI; return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a; }
