// Visitors, as an engine module: people who come, stay a while and go. Optional: the engine does not know it exists.
//
// A visitor is an ordinary agent with a few extra values. They arrive at a gate, at a rate the game gives, as one of
// the kinds the game lists. Each brings:
//   - wishes: a few of the game's needs, picked by the kind's weights. A wish is a need the visitor has on arrival;
//     it is met by finishing an action that clears that need, or given up for a reason ('none', 'price', 'queue'…)
//   - a purse, a time to go home by, and a patience for queueing
// They leave when their wishes are settled and no lasting need that somewhere open could settle is pressing, or when
// their time is up or their patience has run out, by walking to the action
// the game names as the way out. On leaving the visit gets a score, from numbers the game gives.
//
// The module decides nothing about what a wish is, what anything costs or what a score does: it keeps the people,
// counts what happened to them, and reports each departure.

const INF = 65535;

/**
 * @param {object} def
 * @param {Array<object>} def.kinds   each: { name, type (an engine type name), share?: 1,
 *        wishes: { count: [min, max], of: { need: weight } }   how many wishes, and how likely each is
 *        purse: [lo, hi], stay: [lo, hi] (ticks), patience: ticks of queueing they will bear,
 *        start?: { need: [lo, hi] }  how high a lasting need stands on arrival (overrides the need's own) }
 * @param {Record<string, object>} def.needs   by need name; a need not listed is left alone.
 *        { wish?: true          it can be a wish
 *          lasting?: true       it keeps building up after it is met (hunger); without it a need exists only as a wish
 *          level?: [lo, hi]     how high it stands when it is a wish (default [0.5, 0.8])
 *          start?: [lo, hi]     how high a lasting need stands on arrival when it is not a wish (default [0, 0])
 *          comfort?: number     score lost for leaving with it at 1; nothing at `from` (default 0.6) or under, in proportion
 *                               between. From `settle` (default 0.15 under `from`) they see to it before they go, if they can;
 *                               at 0.15 over `from` it is a complaint
 *          urgent?: true        at its top with nowhere to settle it, the visitor leaves }
 * @param {string|string[]} def.leave   the action(s) that take a visitor out (the game defines them, at its exits)
 * @param {(sim) => Array<[number, number]>} def.gates   the cells visitors appear on
 * @param {(sim) => number} def.rate    arrivals per tick right now (0 while shut)
 * @param {(sim) => Record<string, number>} [def.mix]   weight of each kind right now (default: each kind's `share`)
 * @param {(need:string, kind:object, sim) => number} [def.wishWeight]   a factor on a wish's weight right now (default 1)
 * @param {number} [def.lookFor=120]   ticks a wish may have nowhere open to go before it is given up as 'none'
 * @param {object} [def.score]   { base, met, missed, queued (per tick), walked (per tick), min, max, queueGripe (ticks) }:
 *        base + met × (share of wishes met) − missed × (share missed) − queued × ticks queued − walked × ticks walked
 *        + whatever was added with nudge() − the comfort of each lasting need, kept between min and max
 * @param {number} [def.keep=40]   how many departures `recent` remembers
 */
export function createVisitors(def) {
  const kinds = def.kinds, S = { base: 2.5, met: 2.5, missed: 1.5, queued: 0, walked: 0, min: 0, max: 5, queueGripe: Infinity, ...def.score };
  const leaveNames = [].concat(def.leave), lookFor = def.lookFor ?? 120, keep = def.keep ?? 40;
  const freshTally = () => ({ arrived: 0, gone: 0, byKind: {}, left: {}, met: {}, missed: {}, gripes: {}, scoreSum: 0, spent: 0 });
  const reasons = [''];                                   // reason words, by the code kept per person
  const code = r => { let c = reasons.indexOf(r); if (c < 0) { c = reasons.length; reasons.push(r); } return c; };
  let sim = null, K = 0, info = [], serves = [], leaveMask = 0, acc = 0, serial = 0, c = {};

  const V = {
    /** Called with each departure: { kind, reason, score, spent, met: [need…], missed: [[need, why]…], stayed, queued }. */
    onLeft: null,
    /** The latest departures, newest first. */
    recent: [],
    /** What has happened since the last endDay(): { arrived, gone, byKind, left: { reason: n }, met: { need: n },
     *  missed: { need: { why: n } }, gripes: { key: n }, scoreSum, spent }. */
    tally: freshTally(),
    /** How many visitors are in right now. */
    count: 0,
    kinds,
  };
  const rnd = () => sim.rnd(), between = r => r[0] + rnd() * (r[1] - r[0]);
  const bump = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };

  /** Is person i a visitor? */
  V.is = i => c.visitor[i] > 0;
  /** A number that stays with visitor i for the whole visit (their slot does not), and the slot of the visitor with that number, or -1. */
  V.idOf = i => c.serial[i];
  V.slotOf = id => { for (let i = 0; i < sim.count; i++) if (c.visitor[i] && c.serial[i] === id) return i; return -1; };
  /** The kind of visitor i (an entry of `kinds`), or null. */
  V.kindOf = i => (c.visitor[i] > 0 ? kinds[c.visitor[i] - 1] : null);
  /** Add to (or take from) what visitor i will think of the visit; `gripe` names a complaint to count with it. */
  V.nudge = (i, delta, gripe) => { if (!c.visitor[i]) return; c.mood[i] += delta; if (gripe) bump(V.tally.gripes, gripe); };
  /** Say why visitor i has not had a wish so far (it is still wanted). The first reason given stays. */
  V.note = (i, need, why) => { const k = typeof need === 'number' ? need : sim.needIndex(need); if (c.visitor[i] && !c.why[i * K + k]) c.why[i * K + k] = code(why); };
  /** Visitor i gives up a wish for good, for this reason. */
  V.drop = (i, need, why) => {
    const k = typeof need === 'number' ? need : sim.needIndex(need), bit = 1 << k;
    if (!c.visitor[i] || !(c.wants[i] & bit)) return;
    c.wants[i] &= ~bit; c.why[i * K + k] = code(why);
    if (!info[k].lasting) { sim.needsOf[i * K + k] = 0; sim.rate[i * K + k] = 0; }
  };
  /** Send visitor i home now, for this reason. They finish what they are doing first. */
  V.send = (i, reason) => { if (c.visitor[i] && !c.going[i]) { c.going[i] = code(reason); sim.deny[i] = ~leaveMask; } };
  /** Send everyone home (closing time). */
  V.sendAll = reason => { for (let i = 0; i < sim.count; i++) V.send(i, reason); };
  /** Take out, at once, every visitor still in (they count as leaving for this reason). Returns how many. */
  V.clear = reason => { let n = 0; for (let i = 0; i < sim.count; i++) if (c.visitor[i]) { c.going[i] = code(reason); depart(i); n++; } return n; };

  /** What visitor i came for and how it stands: { kind, wishes: [{ need, state: 'wanted' | 'met' | 'missed', why }], purse, spent,
   *  leavesIn (ticks), queued, going (the reason, or '') }. */
  V.info = i => {
    const k = V.kindOf(i);
    if (!k) return null;
    const wishes = [];
    for (let j = 0; j < K; j++) if (c.had[i] & (1 << j)) wishes.push({ need: sim.needs[j].name, state: c.got[i] & (1 << j) ? 'met' : c.wants[i] & (1 << j) ? 'wanted' : 'missed', why: reasons[c.why[i * K + j]] });
    return { kind: k, wishes, purse: c.purse[i], spent: c.purseStart[i] - c.purse[i], leavesIn: c.leaveAt[i] - sim.tick, queued: c.queued[i], going: reasons[c.going[i]] };
  };
  /** How many visitors of each kind are in: { kindName: n }. */
  V.byKind = () => { const o = {}; for (let i = 0; i < sim.count; i++) if (c.visitor[i]) bump(o, kinds[c.visitor[i] - 1].name); return o; };
  /** The score visitor i would give if they left now. */
  V.scoreOf = i => judge(i, false).score;
  /** Close the books: returns the tally since the last call and starts a new one. */
  V.endDay = () => { const t = V.tally; V.tally = freshTally(); return t; };

  // What a visit came to. With `count`, complaints are added to the tally.
  function judge(i, count) {
    const n = i * K, met = [], missed = [];
    let s = S.base + c.mood[i];
    for (let j = 0; j < K; j++) {
      const bit = 1 << j, name = sim.needs[j].name;
      if (c.had[i] & bit) {
        if (c.got[i] & bit) met.push(name);
        else missed.push([name, reasons[c.why[n + j]] || reasons[c.going[i]] || 'time']);
      }
      const f = info[j];
      const from = f.from ?? 0.6, level = sim.needsOf[n + j];
      if (f.comfort && level > from) { s -= f.comfort * (level - from) / (1 - from); if (count && level >= from + 0.15) bump(V.tally.gripes, name + ':unmet'); }
    }
    const had = met.length + missed.length;
    if (had) s += S.met * met.length / had - S.missed * missed.length / had;
    s -= S.queued * c.queued[i] + S.walked * c.walked[i];
    if (count && c.queued[i] > S.queueGripe) bump(V.tally.gripes, 'queue');
    return { score: Math.max(S.min, Math.min(S.max, s)), met, missed };
  }
  // Visitor i is at the way out (or is being taken out): score the visit, count it, remove them.
  function depart(i) {
    const k = kinds[c.visitor[i] - 1], j = judge(i, true), t = V.tally, reason = reasons[c.going[i]] || 'left';
    const rec = { kind: k.name, reason, score: +j.score.toFixed(2), spent: +(c.purseStart[i] - c.purse[i]).toFixed(2), met: j.met, missed: j.missed,
                  stayed: sim.tick - c.cameAt[i], queued: c.queued[i], at: sim.tick };
    t.gone++; bump(t.left, reason); t.scoreSum += rec.score; t.spent += rec.spent;
    for (const m of j.missed) { bump(t.missed[m[0]] ??= {}, m[1]); bump(t.gripes, m[0] + ':' + m[1]); }
    V.recent.unshift(rec); if (V.recent.length > keep) V.recent.pop();
    c.visitor[i] = 0; V.count--;
    sim.remove(i, 'left');
    if (V.onLeft) V.onLeft(rec);
  }

  function arrive() {
    const gates = def.gates(sim);
    if (!gates.length) return;
    const mix = def.mix ? def.mix(sim) : null;
    let total = 0, pick = -1;
    for (let k = 0; k < kinds.length; k++) { const w = Math.max(0, mix ? mix[kinds[k].name] ?? 0 : kinds[k].share ?? 1); total += w; if (w > 0 && rnd() * total < w) pick = k; }
    if (pick < 0) return;
    const g = gates[(rnd() * gates.length) | 0];
    sim.add(g[0] + 0.3 + rnd() * 0.4, g[1] + 0.3 + rnd() * 0.4, { type: kinds[pick].type, visitor: pick });
  }

  function setup(s) {
    sim = V.sim = s; K = s.K; acc = 0; serial = 0; V.count = 0; V.recent = []; V.tally = freshTally(); reasons.length = 1;
    if (K > 31) throw new Error('visitors: at most 31 needs');
    info = s.needs.map(n => def.needs[n.name] ?? {});
    // the actions that settle each need: those that end when it reaches nothing
    serves = s.needs.map((n, k) => s.actions.map((a, ai) => ai).filter(ai => s.until[ai] === k && s.effects[ai * K + k] < 0));
    leaveMask = 0; for (const n of leaveNames) leaveMask |= 1 << s.actionIndex(n);
    c = { visitor: s.addColumn('visitor', Uint8Array, 0), purse: s.addColumn('purse', Float32Array, 0), purseStart: s.addColumn('purseStart', Float32Array, 0),
          leaveAt: s.addColumn('leaveAt', Int32Array, 0), cameAt: s.addColumn('cameAt', Int32Array, 0), queued: s.addColumn('queued', Float32Array, 0),
          walked: s.addColumn('walked', Float32Array, 0), mood: s.addColumn('mood', Float32Array, 0), going: s.addColumn('going', Uint8Array, 0),
          wants: s.addColumn('wants', Uint32Array, 0), had: s.addColumn('had', Uint32Array, 0), got: s.addColumn('got', Uint32Array, 0),
          why: s.addColumn('why', Uint8Array, 0, K), seek: s.addColumn('seek', Uint8Array, 0, K), serial: s.addColumn('visitorId', Int32Array, 0) };
  }

  function onSpawn(i, opts) {
    c.visitor[i] = 0;
    if (opts.visitor === undefined) return;
    const k = kinds[opts.visitor], n = i * K;
    c.visitor[i] = opts.visitor + 1; c.serial[i] = ++serial; V.count++; V.tally.arrived++; bump(V.tally.byKind, k.name);
    c.purse[i] = c.purseStart[i] = Math.round(between(k.purse));
    c.cameAt[i] = sim.tick; c.leaveAt[i] = sim.tick + Math.round(between(k.stay));
    sim.deny[i] = leaveMask;                               // the way out is not for those who are staying
    // needs: a lasting one starts wherever the kind says; one that only exists as a wish starts as nothing
    for (let j = 0; j < K; j++) {
      const f = info[j];
      if (f.lasting) sim.needsOf[n + j] = between(k.start?.[sim.needs[j].name] ?? f.start ?? [0, 0]);
      else if (f.wish) { sim.needsOf[n + j] = 0; sim.rate[n + j] = 0; }
    }
    // wishes: so many of them, each picked by weight, none twice
    const want = Math.round(between(k.wishes.count)), w = new Float32Array(K);
    let total = 0;
    for (let j = 0; j < K; j++) if (info[j].wish) { w[j] = Math.max(0, (k.wishes.of[sim.needs[j].name] ?? 0) * (def.wishWeight ? def.wishWeight(sim.needs[j].name, k, sim) : 1)); total += w[j]; }
    let mask = 0;
    for (let q = 0; q < want && total > 1e-9; q++) {
      let r = rnd() * total, j = 0;
      while (j < K - 1 && (w[j] <= 0 || r >= w[j])) { r -= w[j]; j++; }
      if (w[j] <= 0) break;
      mask |= 1 << j; total -= w[j]; w[j] = 0;
      sim.needsOf[n + j] = between(info[j].level ?? [0.5, 0.8]);
      if (!info[j].lasting) sim.rate[n + j] = sim.tuning.pace * sim.needs[j].grow * sim.trait[n + j];
    }
    c.wants[i] = c.had[i] = mask;
  }

  function onTick(s) {
    acc += Math.max(0, def.rate(s));
    while (acc >= 1) { acc -= 1; arrive(); }
    const N = s.count, tick = s.tick;
    for (let i = tick % 8; i < N; i += 8) {
      if (!c.visitor[i]) continue;
      if (s.wait[i] > 0) c.queued[i] += 8; else if (!s.using[i]) c.walked[i] += 8;
      if (c.going[i] || s.using[i]) continue;
      const n = i * K, cell = s.cell[i];
      // someone who gave up at a full door says so
      if (s.blockAct[i] !== 255 && tick < s.blockUntil[i] && s.wait[i] === 0) { const u = s.until[s.blockAct[i]]; if (u >= 0 && (c.wants[i] >> u) & 1 && !c.why[n + u]) c.why[n + u] = code('queue'); }
      let urgent = false, unsettled = false;
      for (let j = 0; j < K; j++) {
        const wanted = (c.wants[i] >> j) & 1, f = info[j], level = s.needsOf[n + j];
        const sore = !wanted && f.comfort > 0 && level >= (f.settle ?? (f.from ?? 0.6) - 0.15);   // not a wish, but it would spoil the visit to leave with it
        if (!wanted && !sore) continue;
        let open = false;                                  // is there anywhere to go for it from here?
        for (const a of serves[j]) { const fd = s.field[a]; if (!fd || fd[cell] !== INF) { open = true; break; } }
        if (open) { c.seek[n + j] = 0; if (sore) unsettled = true; continue; }
        if (!wanted) { if (f.urgent && level >= s.needMax[j] - 0.001) urgent = true; continue; }
        if (c.seek[n + j] < 255) c.seek[n + j]++;
        if (c.seek[n + j] * 8 >= lookFor) V.drop(i, j, 'none');
      }
      if (!c.wants[i] && !unsettled) V.send(i, c.got[i] ? 'done' : 'nothing');
      else if (tick >= c.leaveAt[i]) V.send(i, 'time');
      else if (c.queued[i] >= kinds[c.visitor[i] - 1].patience) V.send(i, 'patience');
      else if (urgent) V.send(i, 'urgent');
    }
  }

  function onStart(i, a) { if (c.visitor[i] && (leaveMask >> a) & 1) depart(i); }
  function onFinish(i, a) {
    if (!c.visitor[i]) return;
    const k = sim.until[a];
    if (k < 0 || !info[k].wish) return;
    const bit = 1 << k;
    if (c.wants[i] & bit) { c.wants[i] &= ~bit; c.got[i] |= bit; bump(V.tally.met, sim.needs[k].name); }
    if (!info[k].lasting) { sim.needsOf[i * K + k] = 0; sim.rate[i * K + k] = 0; }
  }
  function onGone(i) { if (c.visitor[i]) { c.visitor[i] = 0; V.count--; } }   // removed by someone else

  /** Hand this to the engine: `modules: [visitors.module, …]`. */
  V.module = { name: 'visitors', setup, onSpawn, onTick, onStart, onFinish, onGone,
    save: () => ({ acc, serial, reasons: [...reasons], tally: JSON.parse(JSON.stringify(V.tally)), recent: V.recent.slice() }),
    load(d, s) {
      acc = d?.acc ?? 0; serial = d?.serial ?? 0; reasons.length = 0; reasons.push(...(d?.reasons ?? ['']));
      V.tally = { ...freshTally(), ...(d?.tally ?? {}) }; V.recent = d?.recent ?? [];
      V.count = 0; for (let i = 0; i < s.count; i++) if (c.visitor[i]) V.count++;
    } };
  return V;
}
