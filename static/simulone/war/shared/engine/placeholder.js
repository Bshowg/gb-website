// Generates a sprite sheet with no art, so a test can start before any real sprites exist:
//   - thin figures coloured by action
//   - a box for every building prefab, in each rotation, whose windows light up as it fills
//   - a block for every plain tile that declares `block: <height in px>`
// The returned object has the same shape real art must have (see Renderer.setSprites).

const DEFAULT_ACTION_COLORS = ['#b08a2e', '#1c1f17', '#6f8a44', '#3f7f8c', '#9a5c7c', '#b5553a', '#5b6bb0', '#8a6f3c', '#4f8f6a', '#a04a4a'];
const LEVELS = 4;                 // empty, quiet, busy, full
const LIT = '#ffe08a', GREY = '#b9b6aa';

function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function hex(c) { return '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
function shade(h, f) { return hex(rgb(h).map(v => v * f)); }
function mix(a, b, t) { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); }

/**
 * Optional looks, all read from the game config:
 *   action.color            body colour while doing that action (idle actions default to grey)
 *   type.look.height        figure height in px (default 14, the cell height)
 *   type.look.head          head colour (default ink)
 *   prefab.color            building colour (its roof); prefab.height = wall height in px (default 14)
 *   tile.block              height in px of the block drawn for a plain tile; tile.color is its top face
 * @param {{world: import('../../shared/engine/world.js').World, sim: import('../../shared/engine/sim.js').Sim, tileW?:number, tileH?:number, ink?:string}} o
 */
export function placeholderSprites({ world, sim, tileW = 16, tileH = 8, ink = '#1c1f17' }) {
  const AW = 6, AH = 14, FR = 2, stepX = AW + 1, stepY = AH + 1;
  const hw = tileW / 2, hh = tileH / 2;
  const agentsW = sim.A * FR * stepX;
  const blocks = world.defs.filter(d => d.block && !d.building);
  const blockH = Math.max(0, ...blocks.map(d => tileH + d.block));
  const markerX = agentsW + blocks.length * (tileW + 1) + 1;
  const topH = Math.max(sim.T * stepY, blockH, tileH) + 1;

  // Lay the building images out in rows below the figures: prefab × rotation × (crowd levels + closed).
  const MAXW = 2048, place = [];
  let cx = 0, cy = topH, rowH = 0, width = markerX + tileW + 1;
  for (const p of world.prefabs) {
    if (p.flat || p.outdoor || p.resize) continue;            // drawn on the ground, in its colour: no image
    const sw = (p.w + p.h) * hw, lift = p.height ?? 14, shh = (p.w + p.h) * hh + lift;
    for (let rot = 0; rot < 4; rot++) for (let state = 0; state <= LEVELS; state++) {
      if (cx + sw > MAXW) { cx = 0; cy += rowH + 1; rowH = 0; }
      place.push({ p, rot, state, x: cx, y: cy, sw, sh: shh, lift });
      cx += sw + 1; rowH = Math.max(rowH, shh); width = Math.max(width, cx);
    }
  }
  const image = document.createElement('canvas');
  image.width = width; image.height = cy + rowH + 1;
  const g = image.getContext('2d');
  const poly = pts => {
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
    g.closePath(); g.fill();
  };

  // ── figures
  sim.types.forEach((ty, t) => sim.actions.forEach((a, ai) => {
    const body = a.color ?? (a.at || sim.inPlace[ai] ? DEFAULT_ACTION_COLORS[ai % DEFAULT_ACTION_COLORS.length] : '#a9a493');
    const height = Math.max(8, Math.min(AH, ty.look?.height ?? AH)), top = AH - height;
    const legH = Math.max(2, Math.round(height * 0.36)), bodyH = height - 3 - legH;
    for (let f = 0; f < FR; f++) {
      const x = (ai * FR + f) * stepX, y = t * stepY, ly = y + top + 3 + bodyH;
      g.fillStyle = ty.look?.head ?? ink; g.fillRect(x + 2, y + top, 2, 2);        // head
      g.fillStyle = body; g.fillRect(x + 1, y + top + 3, 4, bodyH);                // body = current action
      g.fillStyle = ink;                                                            // legs, two walk frames
      if (f === 1) { g.fillRect(x + 2, ly, 1, legH); g.fillRect(x + 3, ly, 1, legH - 1); }
      else { g.fillRect(x + 1, ly, 1, legH); g.fillRect(x + 4, ly, 1, legH); }
    }
  }));

  // ── blocks for plain tall tiles
  const tiles = {};
  blocks.forEach((d, n) => {
    const x = agentsW + 1 + n * (tileW + 1), lift = d.block, top = d.color ?? '#3a3d30';
    g.fillStyle = shade(top, 0.72); poly([x, hh, x + hw, tileH, x + hw, tileH + lift, x, hh + lift]);              // left face
    g.fillStyle = shade(top, 0.5); poly([x + hw, tileH, x + tileW, hh, x + tileW, hh + lift, x + hw, tileH + lift]); // right face
    g.fillStyle = top; poly([x + hw, 0, x + tileW, hh, x + hw, tileH, x, hh]);                                       // top face
    tiles[d.name] = { x, y: 0, w: tileW, h: tileH + lift };
  });

  // ── build-preview marker: one tile, filled with a pixel checker. Sprites have no partial transparency,
  // so every other pixel stands in for "see-through".
  g.fillStyle = ink;
  for (let py = 0; py < tileH; py++) for (let px = 0; px < tileW; px++)
    if ((px + py) % 2 === 0 && Math.abs(px + 0.5 - hw) / hw + Math.abs(py + 0.5 - hh) / hh <= 1) g.fillRect(markerX + px, py, 1, 1);

  // ── buildings: a box on the footprint; windows light up with the crowd level; the door shows on the two visible faces
  const table = {};
  for (const q of place) {
    const { p, rot, state, lift } = q, L = world.layout(p.name, 0, 0, rot), fw = L.w, fh = L.h;
    const closed = state === LEVELS, base = p.color ?? '#b0aea4', roof = closed ? mix(base, GREY, 0.65) : base;
    const X = (x, y) => q.x + (x - y) * hw + fh * hw, Y = (x, y) => q.y + (x + y) * hh;   // roof level; add lift for the ground
    g.fillStyle = shade(roof, 0.72); poly([X(0, fh), Y(0, fh), X(fw, fh), Y(fw, fh), X(fw, fh), Y(fw, fh) + lift, X(0, fh), Y(0, fh) + lift]);   // south wall
    g.fillStyle = shade(roof, 0.5); poly([X(fw, fh), Y(fw, fh), X(fw, 0), Y(fw, 0), X(fw, 0), Y(fw, 0) + lift, X(fw, fh), Y(fw, fh) + lift]);    // east wall
    g.fillStyle = roof; poly([X(0, 0), Y(0, 0), X(fw, 0), Y(fw, 0), X(fw, fh), Y(fw, fh), X(0, fh), Y(0, fh)]);                                  // roof
    const spots = [];                                                // window positions along both visible walls
    for (let i = 0; i < fw; i++) spots.push([X(i + 0.5, fh), Y(i + 0.5, fh), i, 'S']);
    for (let j = 0; j < fh; j++) spots.push([X(fw, j + 0.5), Y(fw, j + 0.5), j, 'E']);
    const lit = closed ? 0 : Math.round(state / (LEVELS - 1) * spots.length);
    const doorSide = L.ey === fh ? 'S' : L.ex === fw ? 'E' : null, doorAt = doorSide === 'S' ? L.ex : L.ey;
    spots.forEach(([wx, wy, at, side], k) => {
      if (side === doorSide && at === doorAt) { g.fillStyle = ink; g.fillRect(Math.round(wx) - 1, Math.round(wy) + lift - 6, 3, 6); return; }   // the door
      g.fillStyle = (k * 7 + 3) % spots.length < lit ? LIT : shade(roof, 0.32);
      g.fillRect(Math.round(wx) - 1, Math.round(wy) + Math.round(lift * 0.3), 2, 3);
    });
    ((table[p.name] ??= [])[rot] ??= [])[state] = [q.x, q.y];
  }
  const buildings = {};
  for (const p of world.prefabs) {
    if (p.flat || p.outdoor || p.resize) continue;            // drawn on the ground, in its colour: no image
    const t = table[p.name];
    buildings[p.name] = {
      w: (p.w + p.h) * hw, h: (p.w + p.h) * hh + (p.height ?? 14), levels: LEVELS, frames: 1,
      rect: (level, frame, rot) => t[rot][level], closed: rot => t[rot][LEVELS],
    };
  }

  return { image, agent: { w: AW, h: AH, frames: FR, rect: (t, a, f) => [(a * FR + f) * stepX, t * stepY] }, tiles, buildings,
           marker: { x: markerX, y: 0, w: tileW, h: tileH } };
}
