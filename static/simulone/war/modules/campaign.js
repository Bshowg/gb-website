// A war on a map of provinces, a day at a time. Provinces are joined by roads that take some days to march; each is
// held by a side or by nobody, and some have a town that yields gold and men and keeps a garrison. Armies are lists of
// regiments (kind, men, wounded, experience) that stand in a province or march along a road. When armies of the two
// sides end a day in one province, or an army comes to an enemy town, there is a battle, which the game fights and
// then reports back. Between battles: raising regiments, filling them up, training, and nursing the wounded.
//
// Not an engine module: the battle is one, this is the war around it. Its state is plain data (`C.state`), saved by
// the game as it is. The other side is played by `aiTurn`, which uses the same calls the player does.

/**
 * @param {object} d
 * @param {Array<object>} d.provinces    { id, name, x, y (0…1 on the map), country, town?, income, men, capital?: side, owner: side|-1, garrison?: [kinds] }
 * @param {Array<[string, string, number]>} d.roads   [a, b, days]
 * @param {Record<string, {cost:number, upkeep:number, role:string}>} d.kinds
 * @param {number} d.full                 men in a full regiment
 * @param {number} d.most                 most regiments in one army
 * @param {object} d.rules                { heal: share of the wounded back each day in a town of one's own, healAway: elsewhere,
 *        die: share of the wounded who die each day, train: experience a day in training, trainTo: the most training gives,
 *        trainCost: gold a regiment a day, menBack: share of a town's men that comes back each day, start: { gold, armies } }
 */
export function createCampaign(d) {
  const P = Object.fromEntries(d.provinces.map(p => [p.id, p]));
  const roads = {};
  for (const [a, b, days] of d.roads) { (roads[a] ??= []).push({ to: b, days }); (roads[b] ??= []).push({ to: a, days }); }
  const C = { state: null, onEvent: null };
  const say = (kind, a, b) => { if (C.onEvent) C.onEvent(kind, a, b); };

  C.province = id => P[id];
  C.provinces = () => d.provinces;
  C.roads = id => roads[id] ?? [];
  C.owner = id => C.state.owner[id];
  C.armies = side => C.state.armies.filter(a => side === undefined || a.side === side);
  C.army = id => C.state.armies.find(a => a.id === id) ?? null;
  C.armiesAt = (id, side) => C.state.armies.filter(a => a.at === id && !a.path.length && (side === undefined || a.side === side));
  C.men = a => a.regiments.reduce((s, r) => s + r.men, 0);
  C.wounded = a => a.regiments.reduce((s, r) => s + r.wounded, 0);
  C.upkeep = side => C.armies(side).reduce((s, a) => s + a.regiments.reduce((t, r) => t + d.kinds[r.kind].upkeep * r.men / d.full, 0), 0);
  C.income = side => d.provinces.reduce((s, p) => s + (C.state.owner[p.id] === side ? p.income : 0), 0);
  const regiment = (kind, men, exp = 0) => ({ id: C.state.next++, kind, men, wounded: 0, exp, name: '' });

  /** A new war. */
  C.newWar = () => {
    C.state = { day: 1, next: 1, gold: [...d.rules.start.gold], owner: {}, pool: {}, garrison: {}, armies: [], over: null, pending: null, battles: [0, 0] };
    for (const p of d.provinces) { C.state.owner[p.id] = p.owner; C.state.pool[p.id] = p.men; C.state.garrison[p.id] = p.garrison ? p.garrison.map(k => regiment(k, Math.round(d.full * 0.8))) : []; }
    d.rules.start.armies.forEach(spec => {
      const a = { id: C.state.next++, side: spec.side, at: spec.at, path: [], walked: 0, train: false, regiments: spec.regiments.map(k => regiment(k, d.full, spec.exp ?? 0)) };
      C.state.armies.push(a);
    });
    nameAll();
  };
  C.load = state => { C.state = state; };
  // Regiments are known by a number within their kind and side: "3rd spearmen".
  function nameAll() {
    for (const a of C.state.armies) for (const r of a.regiments) if (!r.name) r.name = ordinal(r.id);
  }

  /** The quickest way by road from one province to another: a list of province ids after the first, or null. */
  C.route = (from, to) => {
    const dist = { [from]: 0 }, prev = {}, todo = new Set([from]);
    while (todo.size) {
      let u = null; for (const k of todo) if (u === null || dist[k] < dist[u]) u = k;
      todo.delete(u);
      if (u === to) break;
      for (const r of C.roads(u)) { const nd = dist[u] + r.days; if (dist[r.to] === undefined || nd < dist[r.to]) { dist[r.to] = nd; prev[r.to] = u; todo.add(r.to); } }
    }
    if (dist[to] === undefined) return null;
    const path = []; for (let k = to; k !== from; k = prev[k]) path.unshift(k);
    return path;
  };
  const daysOf = (a, b) => C.roads(a).find(r => r.to === b)?.days ?? 1;
  /** Days an army takes to get somewhere. */
  C.daysTo = (a, to) => { const path = C.route(a.at, to); if (!path) return Infinity; let n = 0, at = a.at; for (const p of path) { n += daysOf(at, p); at = p; } return n - (a.walked ?? 0); };
  /** Send an army off (or stop it, with its own province). */
  C.march = (a, to) => {
    if (to === a.at && !a.path.length) return true;
    const path = C.route(a.path.length ? a.at : a.at, to);
    if (!path) return false;
    if (a.path[0] !== path[0]) a.walked = 0;
    a.path = path; a.train = false;
    return true;
  };

  /** Can a regiment of this kind be raised for this army now? true, or why not. */
  C.canRaise = (a, kind) => {
    const p = P[a.at], need = d.kinds[kind].cost;
    if (a.path.length) return 'it is on the march';
    if (!p.town || C.state.owner[p.id] !== a.side) return 'only in a town of your own';
    if (a.regiments.length >= d.most) return `an army holds ${d.most} regiments at most`;
    if (C.state.gold[a.side] < need) return `it costs ${need} gold`;
    if (C.state.pool[p.id] < d.full / 2) return `${p.town} has too few men left`;
    return true;
  };
  C.raise = (a, kind) => {
    if (C.canRaise(a, kind) !== true) return null;
    const p = P[a.at], men = Math.min(d.full, Math.floor(C.state.pool[p.id]));
    C.state.pool[p.id] -= men; C.state.gold[a.side] -= d.kinds[kind].cost;
    const r = regiment(kind, men); r.name = ordinal(r.id);
    a.regiments.push(r);
    return r;
  };
  /** Bring a regiment up to full strength from the town it stands in: what it costs, or why it cannot be. */
  C.fillCost = (a, r) => {
    const p = P[a.at];
    if (a.path.length || !p.town || C.state.owner[p.id] !== a.side) return 'only in a town of your own';
    const men = Math.min(d.full - r.men - r.wounded, Math.floor(C.state.pool[p.id]));
    if (men <= 0) return r.men + r.wounded >= d.full ? 'it is full' : `${p.town} has no men left`;
    return { men, gold: Math.ceil(d.kinds[r.kind].cost * men / d.full) };
  };
  C.fill = (a, r) => {
    const c = C.fillCost(a, r);
    if (typeof c === 'string' || C.state.gold[a.side] < c.gold) return false;
    C.state.gold[a.side] -= c.gold; C.state.pool[a.at] -= c.men;
    r.exp = (r.exp * r.men) / (r.men + c.men); r.men += c.men;                 // new men water down the experience
    return true;
  };
  C.canTrain = a => (a.path.length ? 'it is on the march' : !P[a.at].town || C.state.owner[a.at] !== a.side ? 'only in a town of your own' : true);

  /** Is there a battle to fight before the war goes on? { at, sides: [armies of side 0, armies of side 1], garrison } or null. */
  C.pending = () => C.state.pending;

  /** One day: marches, battles, towns taken, gold, men, healing, training. Stops at a battle (see C.pending). */
  C.endDay = () => {
    const S = C.state;
    if (S.over || S.pending) return;
    for (const side of [0, 1]) if (side !== C.player) C.aiTurn(side);
    for (const a of S.armies) {
      if (!a.path.length) continue;
      a.walked++;
      if (a.walked >= daysOf(a.at, a.path[0])) { a.at = a.path.shift(); a.walked = 0; if (findBattle(a.at)) break; }
    }
    S.day++;
    for (const side of [0, 1]) S.gold[side] = Math.round((S.gold[side] + C.income(side) - C.upkeep(side)) * 10) / 10;
    for (const a of S.armies) {
      const home = P[a.at].town && S.owner[a.at] === a.side && !a.path.length;
      for (const r of a.regiments) {
        const back = Math.round(r.wounded * (home ? d.rules.heal : d.rules.healAway)), dead = Math.round(r.wounded * d.rules.die);
        r.wounded -= back + dead; r.men += back;
        if (a.train && home && r.exp < d.rules.trainTo && S.gold[a.side] >= d.rules.trainCost) { r.exp = Math.min(d.rules.trainTo, r.exp + d.rules.train); S.gold[a.side] -= d.rules.trainCost; }
      }
      if (S.gold[a.side] < 0) for (const r of a.regiments) r.men = Math.max(0, r.men - Math.ceil(r.men * 0.02));   // unpaid men go home
      a.regiments = a.regiments.filter(r => r.men + r.wounded > 0);
    }
    for (const p of d.provinces) S.pool[p.id] = Math.min(p.men, S.pool[p.id] + p.men * d.rules.menBack);
    S.armies = S.armies.filter(a => a.regiments.length);
    merge();
    if (!S.pending) for (const p of d.provinces) findBattle(p.id);
    takeTowns();
  };
  // Two armies of one side standing still in one province become one.
  function merge() {
    const S = C.state;
    for (const a of S.armies) for (const b of S.armies) {
      if (a === b || a.side !== b.side || a.at !== b.at || a.path.length || b.path.length || !a.regiments.length) continue;
      const room = d.most - a.regiments.length;
      if (room <= 0) continue;
      a.regiments.push(...b.regiments.splice(0, room));
    }
    S.armies = S.armies.filter(a => a.regiments.length);
  }
  // Armies of both sides in one province, or an army at an enemy town with a garrison: a battle.
  function findBattle(id) {
    const S = C.state;
    if (S.pending) return true;
    const here = S.armies.filter(a => a.at === id);
    const sides = [here.filter(a => a.side === 0), here.filter(a => a.side === 1)];
    const owner = S.owner[id], garrison = S.garrison[id] ?? [];
    if (sides[0].length && sides[1].length) { S.pending = { at: id, sides: sides.map(l => l.map(a => a.id)), garrison: false }; say('battle', S.pending); return true; }
    for (const s of [0, 1]) if (sides[s].length && owner === 1 - s && garrison.length && !sides[1 - s].length) {
      S.pending = { at: id, sides: s === 0 ? [sides[0].map(a => a.id), []] : [[], sides[1].map(a => a.id)], garrison: true, defender: 1 - s };
      say('siege', S.pending); return true;
    }
    return false;
  }
  // An army standing in a province of the other side (or nobody's) with no garrison left takes it.
  function takeTowns() {
    const S = C.state;
    for (const a of S.armies) {
      if (a.path.length || S.owner[a.at] === a.side || S.pending) continue;
      if ((S.garrison[a.at] ?? []).length && S.owner[a.at] !== -1) continue;
      const was = S.owner[a.at];
      S.owner[a.at] = a.side; S.garrison[a.at] = [];
      say('taken', P[a.at], a.side);
      if (P[a.at].capital === was && was >= 0) { S.over = { winner: a.side, why: `${P[a.at].name} has fallen` }; say('over', S.over); }
    }
    for (const s of [0, 1]) if (!S.over && !C.armies(s).length && S.gold[s] < Math.min(...Object.values(d.kinds).map(k => k.cost))) {
      S.over = { winner: 1 - s, why: 'no army is left, and no gold to raise one' }; say('over', S.over);
    }
  }

  /** The regiments each side brings to the pending battle (at most `most` each), with the garrison if it is a siege. */
  C.battleSides = () => {
    const S = C.state, pe = S.pending;
    return [0, 1].map(s => {
      let list = pe.sides[s].flatMap(id => C.army(id)?.regiments ?? []);
      if (pe.garrison && pe.defender === s) list = S.garrison[pe.at];
      return list.filter(r => r.men > 0).slice(0, d.most);
    });
  };
  /**
   * The battle is over: `byRegiment` maps a regiment's id to { killed, wounded } it lost there; `winner` is 0 or 1.
   * Men who fled come back. The losers fall back a province (or give up, with nowhere to go); experience for all.
   */
  C.afterBattle = (winner, byRegiment) => {
    const S = C.state, pe = S.pending;
    if (!pe) return;
    const all = [...S.armies.flatMap(a => a.regiments), ...(S.garrison[pe.at] ?? [])];
    for (const r of all) {
      const lost = byRegiment[r.id];
      if (!lost) continue;
      r.men = Math.max(0, r.men - lost.killed - lost.wounded); r.wounded += lost.wounded;
      r.exp = Math.min(5, r.exp + (lost.side === winner ? 0.5 : 0.25));
    }
    S.battles[winner]++;
    if (pe.garrison) {
      if (winner !== pe.defender) S.garrison[pe.at] = [];
      else S.garrison[pe.at] = S.garrison[pe.at].filter(r => r.men > 0);
    }
    const losers = pe.sides[1 - winner].map(id => C.army(id)).filter(Boolean);
    for (const a of losers) {
      a.regiments = a.regiments.filter(r => r.men + r.wounded > 0);
      a.path = []; a.walked = 0;
      const back = C.roads(a.at).map(r => r.to).filter(id => S.owner[id] === a.side && !S.armies.some(b => b.side !== a.side && b.at === id));
      if (back.length && a.regiments.some(r => r.men > 0)) { a.at = back.sort((x, y) => (P[y].town ? 1 : 0) - (P[x].town ? 1 : 0))[0]; say('fell back', a, P[a.at]); }
      else { a.regiments = []; say('surrendered', a); }
    }
    S.armies = S.armies.filter(a => a.regiments.length);
    S.pending = null;
    takeTowns();
  };

  /** The other side's turn: raise regiments where it can, then send each army against what it can beat, or home. */
  C.aiTurn = side => {
    const S = C.state, foe = 1 - side;
    const strength = list => list.reduce((s, a) => s + C.men(a) * (1 + 0.1 * avgExp(a)), 0);
    for (const a of C.armies(side)) {
      if (a.path.length) continue;
      const kinds = ['spear', 'spear', 'archer', 'sword', 'levy', 'rider', 'spear', 'archer'];
      for (let k = 0; k < 3; k++) { const kind = kinds[(S.day + a.regiments.length) % kinds.length]; if (S.gold[side] > d.kinds[kind].cost + 60) C.raise(a, kind); }
      for (const r of a.regiments) if (C.fillCost(a, r)?.gold && S.gold[side] > 200) C.fill(a, r);
    }
    const capital = d.provinces.find(p => p.capital === side)?.id;
    for (const a of C.armies(side)) {
      if (a.path.length) continue;
      const mine = strength([a]);
      // a threat to the capital: go home
      const threat = C.armies(foe).find(e => (C.daysTo(e, capital) ?? 99) <= 3 && strength([e]) > mine * 0.5);
      if (threat && a.at !== capital && C.armiesAt(capital, side).length === 0) { C.march(a, capital); continue; }
      // the weakest enemy army or town within reach that it can beat
      let best = null, bestScore = -Infinity;
      for (const e of C.armies(foe)) { const sc = mine / Math.max(1, strength([e])) - C.daysTo(a, e.at) * 0.08; if (mine > strength([e]) * 1.15 && sc > bestScore) { bestScore = sc; best = e.at; } }
      for (const p of d.provinces) if (S.owner[p.id] !== side) { const g = (S.garrison[p.id] ?? []).reduce((s, r) => s + r.men, 0), defended = S.armies.some(e => e.side === foe && e.at === p.id); if (defended) continue; const sc = (p.town ? 1.2 : 0.6) + (p.capital === foe ? 1 : 0) - C.daysTo(a, p.id) * 0.1 - g / Math.max(1, mine); if (mine > g * 1.3 && sc > bestScore) { bestScore = sc; best = p.id; } }
      if (best && best !== a.at) C.march(a, best);
      else if (C.canTrain(a) === true) a.train = true;
    }
  };
  const avgExp = a => (a.regiments.length ? a.regiments.reduce((s, r) => s + r.exp, 0) / a.regiments.length : 0);
  /** The side the player commands (the AI plays the others). */
  C.player = 0;
  return C;
}

/** 1st, 2nd, 3rd, 4th… */
export function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
