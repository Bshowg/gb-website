// WAR's battle rules, as an engine module. Game code: the engine and the regiment, combat and morale modules know
// nothing about orders, edges of the field or who has won. All numbers come from war.js.
//
//   - Orders reach the men as matrix inputs. Each man's regiment has an order (hold, advance, attack, charge, fall back),
//     and the man has a 1 on that order's input, so the same man weighs the same fear differently under each order.
//   - What a man sees reaches him as inputs too: an enemy near, an enemy in reach, an enemy in bow range, being badly
//     hurt, already running, and how worn he is by time in the fight (so men break after a while, not at first contact).
//   - His needs are fear and fatigue (kept by the morale module), wounds (the health he has lost), being out of his
//     place in the ranks, and arrows spent (archers).
//   - Each action is a point he walks to: his slot, the enemy he goes for, a step back, the edge of the field behind
//     him. Archers loose where they stand. A man who reaches the edge behind him is off the field: fled, or carried
//     off wounded.
//   - Attack and charge orders keep their regiment's standard moving onto the enemy regiment they were given.
//   - The fallen. A man struck down leaves a body (an agent of the 'fallen' kind) that lies where he fell, under the
//     living; the oldest go when there are too many.
//   - What a man is seen doing: striking (for a moment after each blow, or loosing), reeling (after a blow he took).
//   - A side has lost when what is left of it standing is a small share of what it brought, when every regiment of it
//     has broken, or when its general calls it off.

import { angle } from './modules/regiments.js';

export function createBattle(d) {
  const { regiments: R, combat: C, morale: M, generals } = d;
  const B = {
    sim: null,
    /** null while the battle goes on; then { winner (0 or 1), why }. */
    result: null,
    /** Ticks since the battle began. */
    elapsed: 0,
    /** Set by the page: the side the player commands (its general is then not giving orders). */
    player: 0,
    onEvent: null,
  };
  const LOOKS = 28;                                                // looks per side (see art.js)
  let deadType = -1;
  let A = {}, F = {}, N = {}, K = 0, range = null, reach = null, fought = null, maxHp = null, quiver = null, isBow = null, look = null, prevAct = null, sight = d.sight;
  const out = [0, 0];

  function setup(sim) {
    B.sim = sim; K = sim.K;
    for (const a of sim.actions) A[a.name] = sim.actionIndex(a.name);
    for (const n of sim.needs) N[n.name] = sim.needIndex(n.name);
    for (const f of d.features) F[f] = sim.features[f];
    maxHp = Float32Array.from(sim.types, t => d.kinds[t.name]?.hp ?? 1);
    quiver = Float32Array.from(sim.types, t => d.kinds[t.name]?.bow?.quiver ?? 1);
    isBow = Uint8Array.from(sim.types, t => (d.kinds[t.name]?.bow ? 1 : 0));
    range = Float32Array.from(sim.types, t => d.kinds[t.name]?.bow?.range ?? 0);
    reach = Float32Array.from(sim.types, t => d.kinds[t.name]?.reach ?? 0);
    look = sim.addColumn('look', Uint8Array, 0);
    deadType = sim.typeIndex(d.fallen.type);
    prevAct = sim.addColumn('prevAct', Uint8Array, 255);
    fought = sim.addColumn('fought', Uint16Array, 0);
  }
  B.away = i => { const a = B.sim.action[i]; return a === A.rout || a === A['fall out']; };
  B.inPlace = i => B.sim.needsOf[i * K + N.placeOff] < 0.25;

  function onSpawn(i, opts, sim) {
    if (opts.fallen) {                                             // a body: it lies, and does nothing else ever again
      sim.action[i] = A.lie; sim.deny[i] = ~(1 << A.lie) >>> 0; look[i] = opts.look; bodies++;
      return;
    }
    const n = i * K;
    sim.needsOf[n + N.fear] = opts.fear ?? sim.rnd() * 0.08;
    sim.needsOf[n + N.fatigue] = opts.fatigue ?? 0;
    sim.needsOf[n + N.placeOff] = 0;
    sim.needsOf[n + N.ammo] = opts.ammo ?? 0;
    sim.needsOf[n + N.wounds] = 1 - C.hp[i] / maxHp[sim.type[i]];
    sim.action[i] = A['keep rank'];
    sim.goalX[i] = sim.px[i]; sim.goalY[i] = sim.py[i];          // he starts in his slot
    prevAct[i] = 255;
  }

  // Attack and charge: the standard goes onto the regiment it was given (or the nearest, once that one is gone or broken).
  function retarget() {
    for (const r of R.list) {
      if (!r || r.men <= 0 || (r.order !== 'attack' && r.order !== 'charge')) continue;
      let t = R.get(r.target);
      if (!t || t.men <= 0 || t.broken) {
        t = null; let bd = Infinity;
        for (const e of R.all(1 - r.side)) if (!e.broken) { const k = Math.hypot(e.x - r.x, e.y - r.y); if (k < bd) { bd = k; t = e; } }
        r.target = t ? t.id : -1;
      }
      if (t) {                                                   // stop face to face with it, not on top of it
        const dx = r.x - t.x, dy = r.y - t.y, k = Math.hypot(dx, dy) || 1, gap = (R.size(r)[1] + R.size(t)[1]) / 2 + 0.35;  // the front ranks close to within reach of each other
        r.dest = k > gap ? { x: t.x + dx / k * gap, y: t.y + dy / k * gap, face: Math.atan2(-dy, -dx) } : null;
        if (!r.dest) { const f = Math.atan2(-dy, -dx); if (Math.abs(angle(f - r.face)) > 0.3) r.dest = { x: r.x, y: r.y, face: f }; }
      }
      else { r.order = 'hold'; r.dest = null; }
    }
  }

  // Bodies: those struck down last tick are laid where they fell; past the most kept, the oldest are taken away.
  let bodies = 0, toLay = [];
  function onGone(i, cause, sim) {
    if (sim.type[i] === deadType) { bodies--; return; }
    if ((cause === 'killed' || cause === 'wounded') && R.reg[i] >= 0) toLay.push(sim.px[i], sim.py[i], R.side[i] * LOOKS + ((i * 7 + sim.tick) & 3));
  }
  function layBodies(sim) {
    for (let k = 0; k < toLay.length; k += 3) sim.add(toLay[k], toLay[k + 1], { type: deadType, fallen: true, look: toLay[k + 2] });
    toLay = [];
    if (bodies > d.fallen.most && sim.tick % 40 === 0) {
      const list = [];
      for (let i = 0; i < sim.count; i++) if (sim.type[i] === deadType) list.push(i);
      list.sort((a, b) => sim.age[b] - sim.age[a]);
      for (let k = 0; k < list.length - d.fallen.most * 0.9; k++) sim.remove(list[k], 'buried');
    }
  }
  /** How many bodies lie on the field. */
  B.bodies = () => bodies;
  B.clearBodies = () => { bodies = 0; toLay = []; };

  function onTick(sim) {
    B.elapsed++;
    if (toLay.length || bodies > d.fallen.most) layBodies(sim);
    if (sim.tick % 10 === 0) retarget();
    const n0 = sim.count, H = sim.world.h, Wd = sim.world.w, { px, py, vx, vy, needsOf, goalX, goalY, action, using, deny, speedScale, type } = sim;
    const ord = { hold: F.ordHold, advance: F.ordAdvance, attack: F.ordAttack, charge: F.ordCharge, 'fall back': F.ordFall };
    const ordList = [F.ordHold, F.ordAdvance, F.ordAttack, F.ordCharge, F.ordFall];
    const denyMask = (1 << A.attack) | (1 << A.loose) | (1 << A['give ground']) | (1 << A['fall out']);
    const half = sim.tick & 1;
    for (let i = 0; i < n0; i++) {
      const r = R.list[R.reg[i]];
      if (!r) continue;
      if ((i & 1) !== half) {                                      // the other half: only follow a point that moves
        const a = action[i];
        if (a === A['keep rank']) { R.slotOf(i, out); goalX[i] = out[0] < 1.3 ? 1.3 : out[0] > Wd - 1.3 ? Wd - 1.3 : out[0]; goalY[i] = out[1] < 1.3 ? 1.3 : out[1] > H - 1.3 ? H - 1.3 : out[1]; }
        else if (a === A.attack && C.foe[i] >= 0) { goalX[i] = px[C.foe[i]]; goalY[i] = py[C.foe[i]]; }
        continue;
      }
      const n = i * K, a = action[i], s = R.side[i], t = type[i];
      const foe = C.foe[i], fd = C.foeD[i], bow = isBow[t];
      // what he knows: his order, what he sees, how he is
      for (const f of ordList) f[i] = 0;
      ord[r.order][i] = 1;
      F.foeNear[i] = fd < sight ? 1 - fd / sight : 0;
      F.foeClose[i] = fd < 2.2 ? 1 : 0;
      F.inRange[i] = bow && fd <= range[t] && fd > 3 ? 1 : 0;
      const wounds = 1 - C.hp[i] / maxHp[t];
      needsOf[n + N.wounds] = wounds < 0 ? 0 : wounds;
      F.hurt[i] = wounds > 0.7 ? 1 : 0;
      F.running[i] = a === A.rout ? 1 : 0;
      if ((fd < 2.5 || C.hitT[i]) && fought[i] < 65000) fought[i] += 2;   // every other tick for each man: two ticks' worth
      F.worn[i] = Math.min(1, fought[i] / d.wornAfter);
      R.slotOf(i, out);
      out[0] = out[0] < 1.3 ? 1.3 : out[0] > Wd - 1.3 ? Wd - 1.3 : out[0]; out[1] = out[1] < 1.3 ? 1.3 : out[1] > H - 1.3 ? H - 1.3 : out[1];
      const off = Math.hypot(out[0] - px[i], out[1] - py[i]) / 8;
      needsOf[n + N.placeOff] = off > 1 ? 1 : off;
      // what he may do now
      let dn = deny[i] & ~denyMask;
      if (fd > sight || foe < 0) dn |= 1 << A.attack;
      if (!F.inRange[i] || needsOf[n + N.ammo] >= 0.99) dn |= 1 << A.loose;
      if (fd > 5) dn |= 1 << A['give ground'];
      if (!F.hurt[i]) dn |= 1 << A['fall out'];
      deny[i] = dn >>> 0;
      // where his action takes him
      const fresh = a !== prevAct[i];
      prevAct[i] = a;
      if (a === A['keep rank']) { goalX[i] = out[0]; goalY[i] = out[1]; }
      else if (a === A.attack) { if (foe >= 0) { goalX[i] = px[foe]; goalY[i] = py[foe]; } else { goalX[i] = out[0]; goalY[i] = out[1]; } }
      else if (a === A['give ground']) { if (fresh) { goalX[i] = px[i] - r.cos * 2.5; goalY[i] = py[i] - r.sin * 2.5; } }
      else if (a === A.rout || a === A['fall out']) {
        if (fresh || goalX[i] !== goalX[i]) { goalX[i] = Math.max(2, Math.min(sim.world.w - 3, px[i] + (sim.rnd() - 0.5) * 20)); goalY[i] = s === 0 ? H - 1.5 : 1.5; }
        if (s === 0 ? py[i] > H - 3 : py[i] < 3) { sim.remove(i, a === A.rout ? 'fled' : 'wounded'); continue; }
      } else { goalX[i] = out[0]; goalY[i] = out[1]; }
      // how fast: tired men are slow, a charge is fast, running men find their legs
      speedScale[i] = (1 - 0.35 * needsOf[n + N.fatigue]) * (a === A.attack && r.order === 'charge' ? 1.35 : 1) * (a === A.rout ? 1.15 : 1);
      // which way he is seen to face, and whether he is in the middle of a blow
      let fx = vx[i], fy = vy[i];
      if (using[i] || fx * fx + fy * fy < 1e-5) {
        if (foe >= 0 && fd < (bow ? 30 : 3)) { fx = px[foe] - px[i]; fy = py[foe] - py[i]; } else { fx = r.cos; fy = r.sin; }
      }
      const sx = fx - fy, sy = fx + fy, dir = sx >= 0 ? (sy >= 0 ? 0 : 1) : (sy >= 0 ? 3 : 2);
      look[i] = s * LOOKS + dir * 7 + poseOf(i, t, a, foe, fd, bow);
    }
    if (sim.tick % 20 === 0 && !B.result) judge(sim);
  }
  // Which frame of a fight he is seen in (see art.js): struck (5, 6) wins over a blow; a blow is its wind-up while his
  // next one is a few ticks off and an enemy is in reach (1), then strike, follow-through, recovery as it plays out (2-4).
  // An archer nocks and draws while loosing (1, 2), then looses and lowers (3, 4).
  function poseOf(i, t, a, foe, fd, bow) {
    const sim = B.sim, h = C.hitT[i], b = C.blowT[i];
    if (h) return h > 4 ? 5 : 6;
    if (bow) {
      if (b) return b > 5 ? 3 : 4;
      if (a === A.loose && sim.using[i]) return sim.timer[i] < 20 ? 1 : 2;
      return 0;
    }
    if (b) return b > 7 ? 2 : b > 4 ? 3 : 4;
    if (foe >= 0 && fd <= reach[t] + 0.3 && C.cd[i] > 0 && C.cd[i] <= 6 && a !== A.rout && a !== A['fall out']) return 1;
    return 0;
  }
  function onFinish(i, a, sim) {
    if (a === A.loose && C.shoot(i)) { const n = i * K + N.ammo; sim.needsOf[n] = Math.min(1, sim.needsOf[n] + 1 / quiver[sim.type[i]]); }
  }

  // Has a side lost?
  function judge(sim) {
    // what each regiment's men are doing: how many loose arrows, and how many arrows they have left
    for (const r of R.list) if (r) { r.loosing = 0; r._ammo = 0; }
    for (let i = 0; i < sim.count; i++) { const r = R.list[R.reg[i]]; if (!r) continue; if (sim.action[i] === A.loose) r.loosing++; r._ammo += sim.needsOf[i * K + N.ammo]; }
    for (const r of R.list) if (r) { r.ammo = r.men ? r._ammo / r.men : 0; r.loosing /= Math.max(1, r.active); }
    const standing = [0, 0], brought = [0, 0], whole = [0, 0];
    for (const r of R.list) if (r) { brought[r.side] += r.start; standing[r.side] += r.active; if (r.men > 0 && !r.broken) whole[r.side]++; }
    for (let s = 0; s < 2; s++) {
      const why = !whole[s] ? 'every regiment broke' : standing[s] < brought[s] * d.endBelow ? 'too few were left standing' : generals[s]?.yielded && s !== B.player ? 'its general called the retreat' : null;
      if (why && brought[s] > 0) { B.result = { winner: 1 - s, why }; if (B.onEvent) B.onEvent('over', B.result); return; }
    }
  }
  /** The player gives up the field: his side has lost. */
  B.retreat = () => { if (!B.result) { B.result = { winner: 1 - B.player, why: 'you called the retreat' }; if (B.onEvent) B.onEvent('over', B.result); } };

  /** Facing of man i (his regiment's), for the combat module. */
  B.facing = (i, o) => { const r = R.list[R.reg[i]]; o[0] = r ? r.cos : 1; o[1] = r ? r.sin : 0; };
  /** How steady man i's regiment holds him: experience, the standard near, the ranks kept. */
  B.steady = i => {
    const r = R.list[R.reg[i]];
    if (!r) return 0;
    const sim = B.sim, near = Math.hypot(sim.px[i] - r.x, sim.py[i] - r.y) < 9 && !r.broken;
    return Math.min(1, r.exp / 5 * 0.6 + (near ? 0.25 : 0) + r.cohesion * 0.15);
  };
  B.losses = i => { const r = R.list[R.reg[i]]; return r && r.start ? 1 - r.active / r.start : 0; };

  B.module = { name: 'battle', setup, onSpawn, onGone, onTick, onFinish };
  return B;
}
