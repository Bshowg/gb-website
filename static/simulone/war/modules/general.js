// A general for one side: every so often he looks at the field and gives each of his regiments an order, the same
// orders the player gives. Foot advance in line and close with the nearest enemy; archers keep at bow range and step
// back from foot that come close; horse wait on the flank until the enemy is busy, then ride round to strike archers
// or a regiment from behind. Spears form a square when horse come near. When his army has wasted away he calls it off.
//
// He moves nobody himself: he only sets orders, formations and destinations, which the regiments and the men carry out.

import { angle } from '../modules/regiments.js';

/**
 * @param {object} d
 * @param {number} d.side                       the side he commands (0 or 1)
 * @param {object} d.regiments                  the regiments module
 * @param {(r:object) => 'foot'|'bow'|'horse'} d.role   what a regiment is for
 * @param {(r:object) => boolean} [d.squares]   may this regiment form a square against horse
 * @param {number} d.range                      how far bows carry
 * @param {number} [d.every=40]                 ticks between looks at the field
 * @param {number} [d.yieldBelow=0.3]           his strength against the enemy's under which he falls back
 * @param {(r:object, order:string, dest:object|null, target:object|null) => void} d.order   give a regiment an order
 */
export function createGeneral(d) {
  const G = { side: d.side, yielded: false, on: true, every: d.every ?? 40 };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const nearest = (r, list) => { let best = null, bd = Infinity; for (const e of list) { const k = dist(r, e); if (k < bd) { bd = k; best = e; } } return [best, bd]; };
  const toward = (r, e, keep) => { const k = dist(r, e) || 1, f = Math.atan2(e.y - r.y, e.x - r.x); return { x: e.x - (e.x - r.x) / k * keep, y: e.y - (e.y - r.y) / k * keep, face: f }; };

  /** Look at the field and give orders. Called by onTick; call it yourself to have him act at once. */
  G.think = () => {
    const R = d.regiments, mine = R.all(d.side).filter(r => !r.broken), theirs = R.all(1 - d.side).filter(r => !r.broken);
    if (!mine.length || !theirs.length) return;
    const strength = list => list.reduce((s, r) => s + r.active, 0);
    if (strength(mine) < strength(theirs) * (d.yieldBelow ?? 0.3)) G.yielded = true;
    const horse = theirs.filter(r => d.role(r) === 'horse'), bows = theirs.filter(r => d.role(r) === 'bow');
    const busy = theirs.filter(r => r.engagedShare > 0.25);
    for (const r of mine) {
      if (G.yielded) { const back = d.side === 0 ? 1 : -1; d.order(r, 'fall back', { x: r.x, y: r.y + back * 30, face: r.face }, null); continue; }
      const [e, de] = nearest(r, theirs), role = d.role(r) === 'bow' && (r.ammo ?? 0) > 0.9 ? 'foot' : d.role(r);   // archers with no arrows left fight on foot
      if (role === 'bow') {
        if (de < 9) d.order(r, 'fall back', toward(r, e, 16), null);
        else if (de > d.range * 0.95 || ((r.loosing ?? 1) < 0.1 && de > 12)) d.order(r, 'advance', toward(r, e, d.range * 0.6), null);
        else if (r.order !== 'hold' || Math.abs(angle(Math.atan2(e.y - r.y, e.x - r.x) - r.face)) > 0.6) d.order(r, 'hold', { x: r.x, y: r.y, face: Math.atan2(e.y - r.y, e.x - r.x) }, null);
        continue;
      }
      if (role === 'horse') {
        const prey = bows.length ? nearest(r, bows)[0] : busy.length ? nearest(r, busy)[0] : null;
        if (!prey) { if (de < 12) d.order(r, 'charge', null, e); else if (r.order !== 'hold') d.order(r, 'hold', null, null); continue; }
        const behind = { x: prey.x - prey.cos * 10, y: prey.y - prey.sin * 10 };
        if (dist(r, prey) < 14 || dist(r, behind) < 5) { R.setFormation(r, 'wedge'); d.order(r, 'charge', null, prey); }
        else d.order(r, 'advance', { x: behind.x, y: behind.y, face: Math.atan2(prey.y - behind.y, prey.x - behind.x) }, null);
        continue;
      }
      // foot
      const [h, dh] = horse.length ? nearest(r, horse) : [null, Infinity];
      if (d.squares && d.squares(r) && h && dh < 14 && h.order === 'charge') { if (r.formation !== 'square') { R.setFormation(r, 'square'); d.order(r, 'hold', null, null); } continue; }
      if (r.formation === 'square' && dh > 22) R.setFormation(r, 'line');
      if (de > 20) d.order(r, 'advance', toward(r, e, 12), null);
      else d.order(r, 'attack', null, e);
    }
  };
  function onTick(sim) { if (G.on && sim.tick % G.every === (d.side * 17) % G.every) G.think(); }
  G.module = { name: 'general ' + d.side, onTick };
  return G;
}
