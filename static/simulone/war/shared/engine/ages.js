// Age-blended types. No DOM.
//
// Instead of a few fixed agent types, a game can give a handful of points along a life ("stages")
// and the engine blends between them into many small steps, so a person's weights, need rates,
// walking speed and look drift continuously as they get older. Internally each step is one "type",
// which is why every type-based feature (matrices, hooks, sprites) keeps working.
//
// This is all the engine knows about lives. What ageing means for a game (who dies, who is born,
// who can work at what) is for the game to decide, using Sim.add / remove / setAge and the hooks.

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Turn `life.stages` into one type per age step.
 * A stage: { age, name?, speed?, works?, grow?: {need: ×}, weight?: {need: ×}, weights?, look?: { height?, head? } }, age in ticks.
 * Numbers are blended between neighbouring stages; `name`, `works`, `weights` and `look.head` switch at the stage's age.
 * @returns {{types: object[], steps: number, maxAge: number}}
 */
export function ageTypes(life, needs) {
  const stages = [...life.stages].sort((a, b) => a.age - b.age);
  if (!stages.length) throw new Error('life.stages needs at least one stage');
  const steps = life.steps ?? 24, maxAge = life.maxAge ?? stages[stages.length - 1].age;
  const num = (s, group, key, fallback) => (group ? s[group]?.[key] : s[key]) ?? fallback;
  const types = [];
  for (let k = 0; k < steps; k++) {
    const age = (k + 0.5) / steps * maxAge;
    let j = 0;
    while (j + 1 < stages.length && stages[j + 1].age <= age) j++;
    const a = stages[j], b = stages[Math.min(j + 1, stages.length - 1)];
    const t = b.age > a.age ? Math.max(0, Math.min(1, (age - a.age) / (b.age - a.age))) : 0;
    const blend = (group, key, fallback) => lerp(num(a, group, key, fallback), num(b, group, key, fallback), t);
    const grow = {}, weight = {};
    for (const n of needs) { grow[n.name] = blend('grow', n.name, 1); weight[n.name] = blend('weight', n.name, 1); }
    types.push({
      name: `${a.name ?? 'age'} ${k}`, stage: a.name ?? 'age', share: 0,
      speed: blend(null, 'speed', 1), works: a.works ?? true, grow, weight, weights: a.weights,
      look: { height: Math.round(blend('look', 'height', 14)), head: a.look?.head },
    });
  }
  return { types, steps, maxAge };
}
