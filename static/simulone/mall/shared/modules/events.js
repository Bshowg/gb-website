// Events, as an engine module: a director that decides when things happen to the whole game.
// Optional: the engine does not know it exists.
//
// A game gives a table. Each event says when it may come up, how likely it is, how much warning there
// is, how long it lasts, and what it does. What it "does" is one of two things:
//   - modifiers: named numbers that are in force while the event is active ({ yield: 0.5 }). The game
//     reads them with events.mod('yield') wherever that number matters. Several events multiply.
//   - choices: the player is asked, and each answer runs a function of the game's.
// plus optional start / end functions for anything else. The module itself changes nothing in the game.
//
// An event's life: idle → announced (the warning runs) → active (its modifiers are in force) → idle.
// An event with choices waits in "asking" until the player answers or the warning runs out.

/**
 * @param {object} def
 * @param {Array<object>} def.events   each:
 *   { id, title, text?,
 *     when?: () => boolean            may it come up now? (the season, the stage, a stock level…)
 *     chance: 0..1                    the odds each time it is looked at
 *     every: ticks                    how often it is looked at (a day, usually)
 *     warn?: ticks | () => ticks      time between the announcement and the start (default 0)
 *     lasts?: ticks | () => ticks     how long it is active (default 0: over at once)
 *     rest?: ticks                    time after it ends before it may come up again (default 0)
 *     mods?: { name: factor }         in force while active
 *     start?: (event) => void, end?: (event) => void
 *     choices?: [{ id, label, text?, run: (event) => void }], otherwise?: choice id taken if the player does not answer }
 * @param {() => number} [def.random]  0..1 (default: the simulation's own generator, so runs repeat)
 */
export function createEvents(def) {
  const table = def.events ?? [], byId = new Map(table.map(e => [e.id, e]));
  const ticksOf = v => Math.max(0, Math.round(typeof v === 'function' ? v() : v ?? 0));
  const fresh = () => Object.fromEntries(table.map(e => [e.id, { status: 'idle', at: 0, until: 0, restUntil: 0, times: 0 }]));
  const E = {
    sim: null,
    /** Called with (kind, event, detail): 'announced', 'asking', 'chosen' (detail = the choice), 'started', 'ended'. */
    onEvent: null,
    /** By event id: { status: 'idle' | 'announced' | 'asking' | 'active', at (tick it starts), until (tick it ends), times }. */
    state: fresh(),
  };
  const emit = (kind, e, detail) => { if (E.onEvent) E.onEvent(kind, e, detail); };
  const rnd = () => (def.random ? def.random() : E.sim.rnd());

  /** The product of every active event's factor for this name (1 if none). */
  E.mod = name => { let v = 1; for (const e of table) if (E.state[e.id].status === 'active' && e.mods?.[name] !== undefined) v *= e.mods[name]; return v; };
  /** Events that are announced, asking or active, each as { event, status, startsIn, endsIn } (ticks). */
  E.current = () => table.filter(e => E.state[e.id].status !== 'idle').map(e => {
    const s = E.state[e.id];
    return { event: e, status: s.status, startsIn: Math.max(0, s.at - E.sim.tick), endsIn: Math.max(0, s.until - E.sim.tick) };
  });
  E.isActive = id => E.state[id]?.status === 'active';

  function begin(e, s) {
    s.status = 'active'; s.until = E.sim.tick + ticksOf(e.lasts); s.times++;
    if (e.start) e.start(e);
    emit('started', e);
    if (s.until <= E.sim.tick) finish(e, s);
  }
  function finish(e, s) {
    s.status = 'idle'; s.restUntil = E.sim.tick + (e.rest ?? 0);
    if (e.end) e.end(e);
    emit('ended', e);
  }
  /** Bring an event up now, whatever its odds (for a game's own triggers, and for testing). */
  E.trigger = id => {
    const e = byId.get(id), s = E.state[id];
    if (!e || s.status !== 'idle') return false;
    s.at = E.sim.tick + ticksOf(e.warn);
    if (e.choices?.length) { s.status = 'asking'; emit('asking', e); }
    else if (s.at > E.sim.tick) { s.status = 'announced'; emit('announced', e); }
    else begin(e, s);
    return true;
  };
  /** The player's answer to an event that is asking. */
  E.choose = (id, choiceId) => {
    const e = byId.get(id), s = E.state[id], c = e?.choices?.find(x => x.id === choiceId);
    if (!c || s.status !== 'asking') return false;
    s.status = 'idle'; s.restUntil = E.sim.tick + (e.rest ?? 0); s.times++;
    c.run(e);
    emit('chosen', e, c);
    return true;
  };

  function setup(sim) { E.sim = sim; E.state = fresh(); }
  function onTick(sim) {
    const t = sim.tick;
    for (const e of table) {
      const s = E.state[e.id];
      if (s.status === 'idle') {
        if (t % e.every === 0 && t >= s.restUntil && (!e.when || e.when()) && rnd() < e.chance) E.trigger(e.id);
      } else if (s.status === 'announced') { if (t >= s.at) begin(e, s); }
      else if (s.status === 'asking') { if (t >= s.at) { if (!E.choose(e.id, e.otherwise ?? e.choices[e.choices.length - 1].id)) s.status = 'idle'; } }
      else if (t >= s.until) finish(e, s);
    }
  }

  /** Hand this to the engine: `modules: [events.module, …]`. */
  E.module = { name: 'events', setup, onTick,
    save: () => JSON.parse(JSON.stringify(E.state)),
    load: d => { E.state = { ...fresh(), ...(d ?? {}) }; } };
  return E;
}
