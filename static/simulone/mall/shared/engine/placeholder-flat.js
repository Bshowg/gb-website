// Generated sprites for the flat view, so a test can start before any real art exists:
//   - a small three-part creature seen from the side, facing right (the view turns it to face its heading)
//   - a rounded chamber for every building prefab, in each rotation, with more dots inside as it fills
// The returned object has the same shape real art must have (see View.setSprites).

const DEFAULT_ACTION_COLORS = ['#b08a2e', '#1c1f17', '#6f8a44', '#3f7f8c', '#9a5c7c', '#b5553a', '#5b6bb0', '#8a6f3c', '#4f8f6a', '#a04a4a'];
const LEVELS = 4;                 // empty, quiet, busy, full
const GREY = '#8d897d';

function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function hex(c) { return '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
function shade(h, f) { return hex(rgb(h).map(v => v * f)); }
function mix(a, b, t) { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); }

/**
 * Optional looks, all read from the game config:
 *   action.color        colour of the creature's abdomen while doing that action (idle actions default to grey)
 *   type.look.color     colour of its head, thorax and legs (default ink)
 *   type.look.size      relative size, 0.6 to 1.5 (default 1)
 *   prefab.color        colour of the chamber's inside
 * @param {{world: import('../../shared/engine/world.js').World, sim: import('../../shared/engine/sim.js').Sim, cell?:number, ink?:string}} o
 */
export function flatPlaceholderSprites({ world, sim, cell = 16, ink = '#1c1f17' }) {
  const AW = 20, AH = 12, FR = 2, stepX = AW + 2, stepY = AH + 2;   // room to turn without touching a neighbour
  const agentsW = sim.A * FR * stepX;
  const markerX = agentsW + 1;
  const topH = Math.max(sim.T * stepY, cell) + 1;

  const MAXW = 2048, place = [];
  let cx = 0, cy = topH, rowH = 0, width = markerX + cell + 1;
  for (const p of world.prefabs) for (let rot = 0; rot < 4; rot++) {
    if (p.flat || p.outdoor || p.resize) continue;            // drawn on the ground, in its colour: no image
    const L = world.layout(p.name, 0, 0, rot), sw = L.w * cell, sh = L.h * cell;
    for (let state = 0; state <= LEVELS; state++) {
      if (cx + sw > MAXW) { cx = 0; cy += rowH + 1; rowH = 0; }
      place.push({ p, rot, state, L, x: cx, y: cy, sw, sh });
      cx += sw + 1; rowH = Math.max(rowH, sh); width = Math.max(width, cx);
    }
  }
  const image = document.createElement('canvas');
  image.width = width; image.height = cy + rowH + 1;
  const g = image.getContext('2d');

  // ── creatures: abdomen, thorax, head from left to right; three legs a side, two walk frames
  sim.types.forEach((ty, t) => sim.actions.forEach((a, ai) => {
    const belly = a.color ?? (a.at || sim.inPlace[ai] ? DEFAULT_ACTION_COLORS[ai % DEFAULT_ACTION_COLORS.length] : '#8a8474');
    const body = ty.look?.color ?? ink, size = Math.max(0.6, Math.min(1.5, ty.look?.size ?? 1));
    const len = Math.round(12 * size), th = Math.max(2, Math.round(4 * size));
    const abd = Math.round(len * 0.45), tho = Math.max(2, Math.round(len * 0.25)), head = Math.max(2, len - abd - tho);
    for (let f = 0; f < FR; f++) {
      const x0 = (ai * FR + f) * stepX + ((AW - len) >> 1), ym = t * stepY + (AH >> 1);
      g.fillStyle = belly; g.fillRect(x0, ym - (th >> 1), abd, th);
      g.fillStyle = body;
      const t2 = Math.max(2, th - 1);
      g.fillRect(x0 + abd, ym - (t2 >> 1), tho, t2);
      g.fillRect(x0 + abd + tho, ym - (th >> 1), head, th);
      for (let k = 0; k < 3; k++) {                               // legs: alternate ones swing forward on the second frame
        const lx = x0 + abd - 1 + k * Math.max(1, Math.round(tho / 2)) + ((k + f) & 1);
        g.fillRect(lx, ym - (th >> 1) - 2, 1, 2); g.fillRect(lx, ym - (th >> 1) + th, 1, 2);
      }
      g.fillRect(x0 + len, ym - (th >> 1) - 1, 1, 1); g.fillRect(x0 + len, ym - (th >> 1) + th, 1, 1);   // antennae
    }
  }));

  // ── build-preview marker: one cell of pixel checker (sprites have no partial transparency)
  g.fillStyle = ink;
  for (let py = 0; py < cell; py++) for (let px = 0; px < cell; px++) if ((px + py) % 2 === 0) g.fillRect(markerX + px, py, 1, 1);

  // ── chambers
  const table = {};
  for (const q of place) {
    const { p, rot, state, L, sw, sh } = q, closed = state === LEVELS;
    const base = p.color ?? '#b0aea4', inner = closed ? mix(base, GREY, 0.7) : base, r = Math.min(cell * 0.45, sw / 2, sh / 2);
    g.fillStyle = shade(inner, 0.55);
    g.beginPath(); g.roundRect(q.x, q.y, sw, sh, r); g.fill();                         // the wall
    g.fillStyle = inner;
    g.beginPath(); g.roundRect(q.x + 2, q.y + 2, sw - 4, sh - 4, Math.max(1, r - 2)); g.fill();   // the hollow
    // the opening: a gap in the wall on the side the entry cell is on
    const gap = Math.max(4, cell - 6), off = (cell - gap) >> 1;
    if (L.ey === L.h) g.fillRect(q.x + L.ex * cell + off, q.y + sh - 3, gap, 3);
    else if (L.ey === -1) g.fillRect(q.x + L.ex * cell + off, q.y, gap, 3);
    else if (L.ex === L.w) g.fillRect(q.x + sw - 3, q.y + L.ey * cell + off, 3, gap);
    else if (L.ex === -1) g.fillRect(q.x, q.y + L.ey * cell + off, 3, gap);
    // who is inside: more dots as it fills
    const spots = L.w * L.h * 3, lit = closed ? 0 : Math.round(state / (LEVELS - 1) * spots);
    g.fillStyle = closed ? shade(inner, 0.7) : ink;
    let seed = (p.name.length * 2654435761 + rot * 97) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let k = 0; k < spots; k++) {
      const dx = 5 + rnd() * (sw - 13), dy = 5 + rnd() * (sh - 12);
      if (k < lit) g.fillRect(q.x + Math.round(dx), q.y + Math.round(dy), 3, 2);
    }
    ((table[p.name] ??= [])[rot] ??= [])[state] = [q.x, q.y];
  }
  const buildings = {};
  for (const p of world.prefabs) {
    if (p.flat || p.outdoor || p.resize) continue;            // drawn on the ground, in its colour: no image
    const t = table[p.name];
    buildings[p.name] = { w: p.w * cell, h: p.h * cell, levels: LEVELS, frames: 1, rect: (level, frame, rot) => t[rot][level], closed: rot => t[rot][LEVELS] };
  }
  return { image, agent: { w: AW, h: AH, frames: FR, rect: (t, a, f) => [(a * FR + f) * stepX, t * stepY] }, tiles: {}, buildings,
           marker: { x: markerX, y: 0, w: cell, h: cell } };
}
