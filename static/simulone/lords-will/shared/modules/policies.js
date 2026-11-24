// Policies, as an engine module: the handful of settlement-wide dials a player sets.
// Optional: the engine does not know it exists.
//
// A policy is a named number with a range. The module keeps the values, clamps what the player asks
// for, tells the game when one changes, and saves them. It decides nothing about what a policy means:
// the game reads policies.get('wage') wherever that number matters (a flow's amount, a mood, a rate).

/**
 * @param {object} def
 * @param {Array<object>} def.policies   each:
 *   { id, title, text?, min, max, step?: 1, value (the default), unit?: 'coin a shift',
 *     when?: () => boolean      is it the player's to set yet? (default: always)
 *     words?: (value) => string how to say the value, instead of the number and the unit
 *     apply?: (value) => void   called when it changes, and once at the start and after a load }
 */
export function createPolicies(def) {
  const table = def.policies ?? [], byId = new Map(table.map(p => [p.id, p]));
  const fresh = () => Object.fromEntries(table.map(p => [p.id, p.value]));
  const P = {
    /** Called with (policy, value) after the player changes one. */
    onChange: null,
    values: fresh(),
  };
  const clamp = (p, v) => { const s = p.step ?? 1, r = Math.round((Math.max(p.min, Math.min(p.max, v)) - p.min) / s) * s + p.min; return +r.toFixed(6); };

  /** The value of a policy right now. */
  P.get = id => P.values[id];
  /** Set a policy; the value is brought into its range and onto its steps. Returns what it was set to. */
  P.set = (id, value) => {
    const p = byId.get(id);
    if (!p) throw new Error(`Unknown policy "${id}"`);
    const v = clamp(p, value);
    if (v === P.values[id]) return v;
    P.values[id] = v;
    if (p.apply) p.apply(v);
    if (P.onChange) P.onChange(p, v);
    return v;
  };
  /** One step up or down. */
  P.nudge = (id, steps) => P.set(id, P.values[id] + steps * (byId.get(id).step ?? 1));
  /** The policies that are the player's to set now: [{ id, title, text, value, min, max, step, words }]. */
  P.list = () => table.filter(p => !p.when || p.when()).map(p => {
    const v = P.values[p.id];
    return { id: p.id, title: p.title ?? p.id, text: p.text ?? '', value: v, min: p.min, max: p.max, step: p.step ?? 1, isDefault: v === p.value,
             words: p.words ? p.words(v) : `${v}${p.unit ? ' ' + p.unit : ''}` };
  });
  const applyAll = () => { for (const p of table) if (p.apply) p.apply(P.values[p.id]); };

  /** Hand this to the engine: `modules: [policies.module, …]`. It has no hooks of its own beyond being saved with the game. */
  P.module = { name: 'policies',
    setup() { P.values = fresh(); applyAll(); },
    save: () => ({ ...P.values }),
    load(d) { P.values = fresh(); for (const p of table) if (d?.[p.id] !== undefined) P.values[p.id] = clamp(p, d[p.id]); applyAll(); } };
  return P;
}
