// Fighting between two sides, for armies of thousands. Every man knows the nearest enemy he can see (looked for a
// quarter of the men each tick, through a grid of blocks so empty ground costs nothing), strikes him when he is in
// reach, and archers loose arrows that fly and land. A man whose health runs out is removed: killed, or carried off
// wounded. Who moves where is not decided here: the men's own decisions, through the action matrix, bring them into
// reach or away.
//
// What a blow does depends on the two men's kinds (attack, armour, reach), on where it comes from (from behind a
// man's regiment it hurts more), on a charge (a mounted man at speed), and on a braced line (spears, a square).
// The game answers those questions through the callbacks it passes in.

/**
 * @param {object} d
 * @param {Record<string, object>} d.kinds     per agent type name: { hp, attack, armour, every (ticks between blows),
 *        reach (cells), mounted?, charge? (×damage of a blow struck at speed), braces? (×damage taken from a mounted
 *        charge while in formation), bow?: { range, reload, damage, spread, speed (cells a tick), quiver } }
 * @param {number} d.sight                     cells within which a man sees an enemy (archers see as far as they shoot)
 * @param {number} [d.block=4]                 the grid's block size in cells
 * @param {number} [d.woundedShare=0.5]        of the men struck down, how many are carried off wounded rather than killed
 * @param {{dot:number, damage:number}} d.flank   a blow from further behind a man than `dot` (of his facing) does ×damage
 * @param {(i:number) => number} d.sideOf      0 or 1
 * @param {(i:number, out:number[]) => void} d.facing   which way man i faces: out = [fx, fy]
 * @param {(i:number) => boolean} d.canStrike  may man i strike now (not running, not busy loosing arrows)
 * @param {(i:number) => boolean} d.braced     is man i in a formation that takes a charge (a square, a spear line)
 * @param {(i:number) => boolean} d.away       is man i running from the field
 * @param {(cell:number) => number} [d.cover]  the chance that an arrow landing on a cell is stopped (trees)
 * @param {(cell:number) => number} [d.rise]   how much higher ground a cell is (0 or 1): reach of bows, weight of blows
 * @param {(i:number, damage:number, from:{flank:boolean, charge:boolean, arrow:boolean}) => void} [d.onHit]   man i was hurt
 * @param {(i:number, cause:string, side:number) => void} [d.onDown]   man i is struck down ('killed' or 'wounded') just before he is removed
 */
export function createCombat(d) {
  const B = d.block ?? 4, sight = d.sight, woundedShare = d.woundedShare ?? 0.5, marks = d.marks ?? 12, BLOW = d.blowTicks ?? 7, HIT = d.hitTicks ?? 6;
  const C = {
    sim: null,
    /** Per man: health, the man he is going for (-1: none), how far that one is, ticks before he can strike again. */
    hp: null, foe: null, foeD: null, cd: null,
    /** Per man, from the last look around (the 3×3 blocks about him): friends, enemies, and friends running. */
    near: null, nearFoe: null, nearAway: null,
    /** Arrows in the air: { x0, y0, x1, y1, t, T, side }. */
    arrows: [],
    /** How many of each side have been killed and wounded. */
    down: { killed: [0, 0], wounded: [0, 0] },
    /** Blows, arrows and men struck down in the last `marks` ticks, for the page to show: { x, y, t (the tick), kind: 'blow' | 'arrow' | 'down' }. */
    hits: [],
    /** Per man: ticks left of the pose of a blow he struck, and of reeling from one he took. */
    blowT: null, hitT: null,
  };
  let types = [], W = 0, H = 0, BW = 0, BH = 0, head = [null, null], next = null, bCount = [null, null], bAway = [null, null];
  let maxRing = 1;
  const face = [0, 0];

  C.clear = () => { C.arrows.length = 0; C.down = { killed: [0, 0], wounded: [0, 0] }; C.hits.length = 0; };
  C.kindOf = i => types[C.sim.type[i]];
  /** The men of one side standing on a cell at the start of this tick: C.first(side, cell), then C.after(i) until -1. */
  C.first = (s, c) => head[s][c];
  C.after = i => next[i];

  function setup(sim) {
    C.sim = sim; W = sim.world.w; H = sim.world.h; BW = Math.ceil(W / B); BH = Math.ceil(H / B);
    types = sim.types.map(t => d.kinds[t.name] ?? null);
    C.hp = sim.addColumn('hp', Float32Array, 1);
    C.foe = sim.addColumn('foe', Int32Array, -1);
    C.foeD = sim.addColumn('foeD', Float32Array, 99);
    C.cd = sim.addColumn('strikeIn', Uint8Array, 0);
    C.near = sim.addColumn('near', Uint16Array, 0);
    C.nearFoe = sim.addColumn('nearFoe', Uint16Array, 0);
    C.nearAway = sim.addColumn('nearAway', Uint16Array, 0);
    C.blowT = sim.addColumn('blowT', Uint8Array, 0);
    C.hitT = sim.addColumn('hitT', Uint8Array, 0);
    for (let s = 0; s < 2; s++) { head[s] = new Int32Array(W * H).fill(-1); bCount[s] = new Uint16Array(BW * BH); bAway[s] = new Uint16Array(BW * BH); }
    next = new Int32Array(sim.capacity);
    let far = sight; for (const k of types) if (k?.bow) far = Math.max(far, k.bow.range * 1.1);
    maxRing = Math.ceil(far / B) + 1;
  }
  function onSpawn(i, opts, sim) {
    const k = types[sim.type[i]];
    C.hp[i] = opts.hp ?? k?.hp ?? 1; C.foe[i] = -1; C.foeD[i] = 99; C.cd[i] = (sim.rnd() * (k?.every ?? 20)) | 0;
  }

  // Everyone onto the grid: per side, a list of men on each cell, and how many (and how many running) in each block.
  const occupied = [];
  function grid(sim) {
    for (const c of occupied) { head[0][c] = -1; head[1][c] = -1; }
    occupied.length = 0;
    for (let s = 0; s < 2; s++) { bCount[s].fill(0); bAway[s].fill(0); }
    const { px, py } = sim;
    for (let i = 0; i < sim.count; i++) {
      if (!types[sim.type[i]]) continue;                         // not a fighter (the fallen)
      const s = d.sideOf(i), x = px[i] | 0, y = py[i] | 0, c = y * W + x, b = ((y / B) | 0) * BW + ((x / B) | 0);
      if (head[0][c] < 0 && head[1][c] < 0) occupied.push(c);
      next[i] = head[s][c]; head[s][c] = i;
      bCount[s][b]++; if (d.away(i)) bAway[s][b]++;
    }
  }
  // The nearest enemy of man i within `range` cells, looked for block ring by block ring from his own outwards.
  function nearest(i, range) {
    const sim = C.sim, s = d.sideOf(i), e = 1 - s, x = sim.px[i], y = sim.py[i], bx = (x / B) | 0, by = (y / B) | 0;
    const H2 = head[e], cnt = bCount[e];
    let best = -1, bd = range * range;
    const rings = Math.min(maxRing, Math.ceil(range / B) + 1);
    for (let k = 0; k <= rings; k++) {
      const lower = (k - 1) * B;                                   // nothing in ring k can be nearer than this
      if (best >= 0 && lower > 0 && lower * lower > bd) break;
      for (let j = by - k; j <= by + k; j++) {
        if (j < 0 || j >= BH) continue;
        const edge = j === by - k || j === by + k;
        for (let ii = bx - k; ii <= bx + k; ii += edge ? 1 : 2 * k || 1) {
          if (ii < 0 || ii >= BW || !cnt[j * BW + ii]) continue;
          const x0 = ii * B, y0 = j * B, x1 = Math.min(W, x0 + B), y1 = Math.min(H, y0 + B);
          for (let cy = y0; cy < y1; cy++) for (let cx = x0; cx < x1; cx++)
            for (let o = H2[cy * W + cx]; o >= 0; o = next[o]) {
              const dx = sim.px[o] - x, dy = sim.py[o] - y, dd = dx * dx + dy * dy;
              if (dd < bd) { bd = dd; best = o; }
            }
          if (k === 0) break;                                      // ring 0 is one block
        }
        if (k === 0) break;
      }
    }
    return best;
  }
  // Friends, enemies and friends running in the 3×3 blocks around man i.
  function around(i) {
    const sim = C.sim, s = d.sideOf(i), bx = (sim.px[i] / B) | 0, by = (sim.py[i] / B) | 0;
    let f = 0, e = 0, a = 0;
    for (let j = Math.max(0, by - 1); j <= Math.min(BH - 1, by + 1); j++) for (let k = Math.max(0, bx - 1); k <= Math.min(BW - 1, bx + 1); k++) {
      const b = j * BW + k; f += bCount[s][b]; e += bCount[1 - s][b]; a += bAway[s][b];
    }
    C.near[i] = f; C.nearFoe[i] = e; C.nearAway[i] = a;
  }

  // One blow of man a on man b.
  function strike(a, b, dist) {
    const sim = C.sim, ka = types[sim.type[a]], kb = types[sim.type[b]];
    let dmg = ka.attack * (0.6 + sim.rnd() * 0.8) / kb.armour;
    if (d.strength) dmg *= d.strength(a);
    let flank = false, charge = false;
    d.facing(b, face);
    const ux = (sim.px[a] - sim.px[b]) / (dist || 1), uy = (sim.py[a] - sim.py[b]) / (dist || 1);
    if (ux * face[0] + uy * face[1] < d.flank.dot) { dmg *= d.flank.damage; flank = true; }
    if (ka.mounted && ka.charge) {
      const v = Math.hypot(sim.vx[a], sim.vy[a]), top = sim.speed[a];
      if (v > top * 0.6) {
        charge = true; dmg *= ka.charge;
        if (kb.braces && d.braced(b) && !flank) { dmg /= ka.charge * kb.braces; hurt(a, kb.attack * kb.braces * 0.5, { flank: false, charge: false, arrow: false }, b); }   // onto the spears
      }
    }
    if (d.away(b)) dmg *= 1.5;                                     // a man running does not defend himself
    if (d.rise) dmg *= 1 + 0.25 * (d.rise(sim.cell[a]) - d.rise(sim.cell[b]));
    hurt(b, dmg, { flank, charge, arrow: false }, a);
    C.cd[a] = Math.max(1, Math.round(ka.every * (0.8 + sim.rnd() * 0.4) * (d.tempo ? d.tempo(a) : 1)));
    C.blowT[a] = BLOW;
    C.hits.push({ x: (sim.px[a] * 2 + sim.px[b] * 3) / 5, y: (sim.py[a] * 2 + sim.py[b] * 3) / 5, t: sim.tick, kind: 'blow' });
  }
  function hurt(b, dmg, from, by) {
    const sim = C.sim;
    if (C.hp[b] <= 0) return;
    C.hp[b] -= dmg;
    C.hitT[b] = HIT;
    if (from.arrow) C.hits.push({ x: sim.px[b], y: sim.py[b], t: sim.tick, kind: 'arrow' });
    if (d.onHit) d.onHit(b, dmg, from);
    if (C.hp[b] > 0) return;
    const s = d.sideOf(b), cause = sim.rnd() < woundedShare ? 'wounded' : 'killed';
    C.down[cause][s]++;
    C.hits.push({ x: sim.px[b], y: sim.py[b], t: sim.tick, kind: 'down' });
    if (d.onDown) d.onDown(b, cause, s);
    C.hp[b] = -1e9;                                                // counted once
    sim.remove(b, cause);
  }

  /** Man i looses an arrow at the man he is going for, if he is in range. Returns true if it was loosed. */
  C.shoot = i => {
    const sim = C.sim, k = types[sim.type[i]], j = C.foe[i];
    if (!k?.bow || j < 0 || j >= sim.count || !types[sim.type[j]] || d.sideOf(j) === d.sideOf(i)) return false;
    const x0 = sim.px[i], y0 = sim.py[i], dist = Math.hypot(sim.px[j] - x0, sim.py[j] - y0);
    const range = k.bow.range * (d.rise ? 1 + 0.25 * d.rise(sim.cell[i]) : 1);
    if (dist > range) return false;
    const spread = k.bow.spread * dist, a = sim.rnd() * 6.2832, r = Math.sqrt(sim.rnd()) * spread;
    const T = Math.max(4, Math.round(dist / k.bow.speed));
    C.blowT[i] = BLOW;
    C.arrows.push({ x0, y0, x1: sim.px[j] + sim.vx[j] * T + Math.cos(a) * r, y1: sim.py[j] + sim.vy[j] * T + Math.sin(a) * r, t: 0, T, side: d.sideOf(i), dmg: k.bow.damage, by: sim.type[i] });
    return true;
  };
  function flyArrows(sim) {
    const A = C.arrows;
    for (let n = A.length - 1; n >= 0; n--) {
      const ar = A[n];
      if (++ar.t < ar.T) continue;
      A[n] = A[A.length - 1]; A.pop();
      const x = ar.x1, y = ar.y1, cx = x | 0, cy = y | 0;
      if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= H - 1) continue;
      if (d.cover && sim.rnd() < d.cover(cy * W + cx)) continue;  // into the trees
      const H2 = head[1 - ar.side];
      let best = -1, bd = 0.36;
      for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++)
        for (let o = H2[j * W + i]; o >= 0; o = next[o]) { const dx = sim.px[o] - x, dy = sim.py[o] - y, dd = dx * dx + dy * dy; if (dd < bd && C.hp[o] > 0) { bd = dd; best = o; } }
      if (best >= 0) hurt(best, ar.dmg * (0.7 + sim.rnd() * 0.6) / types[sim.type[best]].armour * (d.shield ? d.shield(best) : 1), { flank: false, charge: false, arrow: true }, -1);
    }
  }

  function onTick(sim) {
    { let k = 0; const H = C.hits; for (const h of H) if (sim.tick - h.t < marks) H[k++] = h; H.length = k; }   // forget old marks
    grid(sim);
    const N = sim.count, phase = sim.tick % 6, { px, py } = sim;
    for (let i = 0; i < N; i++) {
      const k = types[sim.type[i]];
      if (!k) continue;
      if (C.blowT[i]) C.blowT[i]--;
      if (C.hitT[i]) C.hitT[i]--;
      if (i % 6 === phase) {                                       // a sixth of the men look around each tick
        C.foe[i] = nearest(i, k.bow ? Math.max(sight, k.bow.range * 1.1) : sight);
        around(i);
      }
      const j = C.foe[i];
      if (j < 0 || j >= N || !types[sim.type[j]] || d.sideOf(j) === d.sideOf(i) || C.hp[j] <= 0) { C.foe[i] = -1; C.foeD[i] = 99; continue; }   // gone, or someone else in that slot now
      const dist = Math.hypot(px[j] - px[i], py[j] - py[i]);
      C.foeD[i] = dist;
      if (C.cd[i] > 0) { C.cd[i]--; continue; }
      if (dist <= k.reach && C.hp[i] > 0 && d.canStrike(i)) strike(i, j, dist);
    }
    flyArrows(sim);
  }

  /** Hand this to the engine: `modules: [combat.module, …]`. */
  C.module = { name: 'combat', setup, onSpawn, onTick };
  return C;
}
