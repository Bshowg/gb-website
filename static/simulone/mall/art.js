// Atrium's art, drawn by code onto one sheet when the page starts (no image files).
//
// Every unit is a room seen from inside: its floor and the two walls at the back are one picture (the shell), and each
// thing in it (a shelf, a counter, a table, a seat) is a small picture of its own with its own depth. It has no roof,
// and the two walls that face the screen are left out. The people in a room are the real ones: the visitors and staff
// who went in are drawn at places in it (browsing along a shelf, sitting at a table, running on a treadmill), so a
// room is as full as the unit is and moves as they do. Screens, lamps and candles have frames of their own.
//
// The sheet has the shape the engine's views take (engine/README.md, Sprites). Everything here is the mall's own.

export const TILE = { w: 64, h: 32 };
const HW = TILE.w / 2, HH = TILE.h / 2, WALL = 46;
export const WALL_HEIGHT = WALL;
/** The time that movement inside the rooms goes by, in milliseconds. The page moves it on: not while the game is paused. */
export const clock = { ms: 0 };
const SHEET = 4096, INK = '#23252d', DARK = 'rgba(22, 24, 38, 0.6)';

const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const shade = (h, f) => hex(rgb(h).map(v => v * f));
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

// ── drawing in the three planes of the picture: the floor, a face running along x, a face running along y
function Pen(g, ox, oy) {
  const X = (x, y) => ox + (x - y) * HW, Y = (x, y, z = 0) => oy + (x + y) * HH - z;
  return { g, X, Y,
    /** Draw flat, at height z, in cells. */
    floor(z, fn) { g.save(); g.setTransform(HW, HH, -HW, HH, ox, oy - z); fn(g); g.restore(); },
    /** Draw on a face running from (x, y) along +x: across in pixels, up is negative. */
    alongX(x, y, z, fn) { g.save(); g.setTransform(1, 0.5, 0, 1, X(x, y), Y(x, y, z)); fn(g); g.restore(); },
    /** Draw on a face running from (x, y) towards smaller y. */
    alongY(x, y, z, fn) { g.save(); g.setTransform(1, -0.5, 0, 1, X(x, y), Y(x, y, z)); fn(g); g.restore(); },
  };
}
// A box: its top and the two sides that face the screen, shaded and edged. o.south / o.east / o.top draw on a face.
function drawBox(pen, x, y, w, d, h, color, o = {}, z0 = 0) {
  const edge = shade(color, 0.45);
  pen.alongX(x, y + d, z0, g => { g.fillStyle = shade(color, 0.82); g.fillRect(0, -h, w * HW, h); if (o.south) o.south(g, w * HW, h); g.strokeStyle = edge; g.lineWidth = 1; g.strokeRect(0.5, -h + 0.5, w * HW - 1, h - 1); });
  pen.alongY(x + w, y + d, z0, g => { g.fillStyle = shade(color, 0.62); g.fillRect(0, -h, d * HW, h); if (o.east) o.east(g, d * HW, h); g.strokeStyle = edge; g.lineWidth = 1; g.strokeRect(0.5, -h + 0.5, d * HW - 1, h - 1); });
  pen.floor(z0 + h, g => { g.fillStyle = color; g.fillRect(x, y, w, d); if (o.top) o.top(g, x, y, w, d); g.strokeStyle = edge; g.lineWidth = 0.035; g.strokeRect(x, y, w, d);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.03; g.beginPath(); g.moveTo(x + 0.03, y + d - 0.03); g.lineTo(x + 0.03, y + 0.03); g.lineTo(x + w - 0.03, y + 0.03); g.stroke(); });
}
// Rows of things on a face (goods on a shelf): boards, and on each a line of small items in the unit's colours.
const goodsOn = (palette, r, rows = 3) => (g, w, h) => {
  const step = (h - 3) / rows;
  for (let k = 0; k < rows; k++) {
    const base = -3 - k * step;
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(1, base - step + 1, w - 2, step - 1);
    for (let x = 2; x < w - 4;) { const iw = 3 + ((r() * 4) | 0), ih = Math.min(step - 3, 4 + ((r() * 6) | 0)); g.fillStyle = palette[(r() * palette.length) | 0]; g.fillRect(x, base - ih, iw, ih); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, base - ih, 1, ih); x += iw + 1; }
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, base, w, 1);
  }
};
const itemsOn = (palette, r, n) => (g, x, y, w, d) => { for (let k = 0; k < n; k++) { const s = 0.1 + r() * 0.08, px = x + 0.05 + r() * (w - s - 0.1), py = y + 0.05 + r() * (d - s - 0.1); g.fillStyle = palette[(r() * palette.length) | 0]; g.fillRect(px, py, s, s); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + s * 0.6, py + s * 0.6, s * 0.4, s * 0.4); } };

// ── a room being drawn: the shell's canvas, the things standing in it, and where people can be
let partCache = new Map();
function Room(fw, fh, seed) {
  const W = (fw + fh) * HW, H = (fw + fh) * HH + WALL, OX = fh * HW, OY = WALL;
  const cv = canvas(W, H), g = cv.getContext('2d'), pen = Pen(g, OX, OY);
  const R = { fw, fh, W, H, cv, g, pen, parts: [], spots: [], staff: [], solid: [], r: rng(seed), seed };
  /** A thing standing in the room, drawn by `draw(pen, frame)` within the box (x, y, w, d, h). o: { rise, key, frames, ticks, cache }. */
  R.part = (x, y, w, d, h, draw, o = {}) => {
    const x0 = Math.floor(pen.X(x, y + d)) - 2, y0 = Math.floor(pen.Y(x, y, h + (o.rise ?? 0))) - 2;
    const pw = Math.ceil(pen.X(x + w, y) - x0) + 2, ph = Math.ceil(pen.Y(x + w, y + d) - y0) + 2, frames = o.frames ?? 1;
    const name = o.cache ? `${o.cache}|${pw}|${ph}` : null;
    let made = name ? partCache.get(name) : null;
    if (!made) {
      const c = canvas(pw * frames, ph * 2), cg = c.getContext('2d');
      for (let f = 0; f < frames; f++) { cg.save(); cg.beginPath(); cg.rect(f * pw, 0, pw, ph); cg.clip(); draw(Pen(cg, OX - x0 + f * pw, OY - y0), f); cg.restore(); }
      cg.setTransform(1, 0, 0, 1, 0, 0); cg.drawImage(c, 0, 0, pw * frames, ph, 0, ph, pw * frames, ph);       // the same with the lights out, below
      cg.globalCompositeOperation = 'source-atop'; cg.fillStyle = DARK; cg.fillRect(0, ph, pw * frames, ph); cg.globalCompositeOperation = 'source-over';
      made = { cv: c, job: null };
      if (name) partCache.set(name, made);
    }
    R.parts.push({ made, ox: x0, oy: y0, w: pw, h: ph, key: o.key ?? x + w / 2 + y + d / 2, frames, frameTicks: o.ticks ?? 10 });
  };
  /** A box-shaped thing: a part with a shadow, which people cannot stand in. */
  R.box = (x, y, w, d, h, color, o = {}) => {
    pen.floor(0, g2 => { g2.fillStyle = 'rgba(20, 22, 34, 0.17)'; g2.fillRect(x + 0.04, y + 0.06, w + 0.06, d + 0.05); });
    R.solid.push([x, y, w, d]);
    R.part(x, y, w, d, h, p => { drawBox(p, x, y, w, d, h, color, o); if (o.more) o.more(p); }, o);
  };
  /** Somewhere a customer can be: { x, y, sit, run, to: [x, y] (they walk between the two) }. */
  R.spot = (x, y, o = {}) => R.spots.push({ x, y, ...o });
  R.post = (x, y) => R.staff.push({ x, y });
  return R;
}

// The shell every unit shares: the floor, the two back walls with the unit's colour and name, the door, the cut edges.
function shell(R, u, door, look = {}) {
  const { fw, fh, pen } = R, color = u.color;
  const floor = look.floor ?? mix(color, '#f4efe4', 0.84), wall = look.wall ?? mix(color, '#fbf9f3', 0.66), wide = fw * HW, deep = fh * HW;
  pen.floor(0, g => {
    g.fillStyle = floor; g.fillRect(0, 0, fw, fh);
    if (look.planks) { g.fillStyle = shade(floor, 0.9); for (let y = 0; y < fh; y += 0.5) g.fillRect(0, y, fw, 0.03); for (let y = 0, k = 0; y < fh; y += 0.5, k++) for (let x = (k % 2) * 0.6; x < fw; x += 1.2) g.fillRect(x, y, 0.03, 0.5); }
    else if (look.plain !== true) { for (let y = 0; y < fh * 2; y++) for (let x = 0; x < fw * 2; x++) if ((x + y) & 1) { g.fillStyle = shade(floor, 0.95); g.fillRect(x / 2, y / 2, 0.5, 0.5); } g.fillStyle = shade(floor, 0.86); for (let k = 0; k <= fw * 2; k++) g.fillRect(k / 2 - 0.012, 0, 0.024, fh); for (let k = 0; k <= fh * 2; k++) g.fillRect(0, k / 2 - 0.012, fw, 0.024); }
    const dim = (x, y, w, d, x1, y1) => { const s = g.createLinearGradient(x, y, x1, y1); s.addColorStop(0, 'rgba(30,26,40,0.3)'); s.addColorStop(1, 'rgba(30,26,40,0)'); g.fillStyle = s; g.fillRect(x, y, w, d); };
    dim(0, 0, fw, 0.5, 0, 0.5); dim(0, 0, 0.5, fh, 0.5, 0);          // the walls' shade on the floor
    g.fillStyle = shade(wall, 0.55); g.fillRect(0, fh - 0.07, fw, 0.07); g.fillRect(fw - 0.07, 0, 0.07, fh);   // where the two front walls are cut away
    g.fillStyle = shade(floor, 0.78);
    if (door.side === 'S') g.fillRect(door.at + 0.08, fh - 0.42, 0.84, 0.42); else if (door.side === 'E') g.fillRect(fw - 0.42, door.at + 0.08, 0.42, 0.84);
  });
  const face = (g, len, tone, text, doorAt) => {
    const s = g.createLinearGradient(0, -WALL, 0, 0); s.addColorStop(0, mix(tone, '#ffffff', 0.12)); s.addColorStop(1, shade(tone, 0.86));
    g.fillStyle = s; g.fillRect(0, -WALL, len, WALL);
    g.fillStyle = shade(tone, 0.62); g.fillRect(0, -5, len, 5);                                               // skirting
    g.fillStyle = color; g.fillRect(0, -WALL, len, 11);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, -WALL, len, 2); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, -WALL + 10, len, 1);
    if (text) { g.font = '700 9px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; if (g.measureText(text).width < len - 10) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillText(text, len / 2 + 1, -WALL + 6.5); g.fillStyle = '#ffffff'; g.fillText(text, len / 2, -WALL + 5.5); } }
    if (doorAt !== null) { g.fillStyle = shade(tone, 0.5); g.fillRect(doorAt + 4, -35, HW - 8, 35); g.fillStyle = '#1d1f27'; g.fillRect(doorAt + 6, -33, HW - 12, 33); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(doorAt + 6, -33, 3, 33); }
  };
  const name = (look.sign ?? u.name).toUpperCase(), north = wide >= deep;
  pen.alongX(0, 0, 0, g => face(g, wide, wall, north ? name : '', door.side === 'N' ? door.at * HW : null));
  pen.alongY(0, fh, 0, g => face(g, deep, shade(wall, 0.84), north ? '' : name, door.side === 'W' ? (fh - door.at - 1) * HW : null));
  const g = R.g;                                                    // the walls' outline
  g.strokeStyle = 'rgba(20,20,30,0.6)'; g.lineWidth = 1; g.beginPath();
  g.moveTo(pen.X(0, fh) + 0.5, pen.Y(0, fh)); g.lineTo(pen.X(0, fh) + 0.5, pen.Y(0, fh, WALL)); g.lineTo(pen.X(0, 0), pen.Y(0, 0, WALL) + 0.5); g.lineTo(pen.X(fw, 0) - 0.5, pen.Y(fw, 0, WALL)); g.lineTo(pen.X(fw, 0) - 0.5, pen.Y(fw, 0));
  g.moveTo(pen.X(0, 0), pen.Y(0, 0, WALL)); g.lineTo(pen.X(0, 0), pen.Y(0, 0)); g.stroke();
}
const clear = (door, side, at, span) => !(door.side === side && at < door.at + 1 && at + span > door.at);   // not across the doorway
// On the back walls: a rectangle of the wall as a thing of its own (a screen, a lamp), so it can have frames.
const onNorth = (R, x0, x1, z0, z1, draw, o = {}) => R.part(x0, 0, x1 - x0, 0, z1, (p, f) => p.alongX(x0, 0, z0, g => draw(g, (x1 - x0) * HW, z1 - z0, f)), { key: x1 + 0.02, ...o });
const onWest = (R, y0, y1, z0, z1, draw, o = {}) => R.part(0, y0, 0, y1 - y0, z1, (p, f) => p.alongY(0, y1, z0, g => draw(g, (y1 - y0) * HW, z1 - z0, f)), { key: y1 + 0.02, ...o });

// ── what each unit is like inside
const WOOD = '#b99668', STEEL = '#8d96a3';
const INSIDE = {
  kiosk: { room: 'shop', goods: ['#e04f4f', '#f2c744', '#4f8fe0', '#58b06c', '#ffffff', '#e0739a'] },
  'clothes shop': { room: 'shop', racks: true, goods: ['#e0739a', '#5b8fd0', '#f2f2f2', '#3c4250', '#d9a23a', '#7fc0a8'], sign: 'clothes' },
  grocer: { room: 'shop', crates: true, goods: ['#58b06c', '#e04f4f', '#f2c744', '#e08a3c', '#8fd06a', '#b03a3a'] },
  bookshop: { room: 'shop', goods: ['#8a4f3c', '#b03a3a', '#3f5f8a', '#d9c79a', '#4f7f5a', '#2f3a55'], look: { planks: true }, sign: 'books' },
  electronics: { room: 'shop', screens: true, goods: ['#2b2f3a', '#59d0e0', '#3c4250', '#9ad0ff', '#1c1f27', '#e8e8e8'] },
  pharmacy: { room: 'shop', goods: ['#ffffff', '#58c08a', '#d6f0e2', '#58a0c0', '#f2f2f2', '#e06a6a'] },
  'department store': { room: 'shop', racks: true, goods: ['#e0739a', '#59d0e0', '#f2c744', '#f2f2f2', '#8a55b5', '#3c4250'] },
  'café': { room: 'eatery', counter: '#6b4530', table: '#c79a6a', look: { planks: true } },
  restaurant: { room: 'eatery', counter: '#4a2a2a', table: '#f6f2ea', candles: true, look: { planks: true } },
  'food court': { room: 'eatery', counter: '#d9582b', table: '#e8e2d2', stalls: ['#d9582b', '#3f9a62', '#d9a23a', '#3f78c4'] },
  'fast food': { room: 'eatery', counter: '#c9402b', table: '#f2c744', boards: true },
  toilets: { room: 'toilets', look: { floor: '#dcecf2', wall: '#e8f3f6' }, sign: 'WC' },
  gym: { room: 'gym', look: { floor: '#d6c4a0', planks: true } },
  'games arcade': { room: 'arcade', look: { floor: '#3a3350', wall: '#5a4f7a', plain: true }, sign: 'arcade' },
  cinema: { room: 'cinema', look: { floor: '#3a3340', wall: '#5b4650', plain: true } },
  'events space': { room: 'stage', look: { floor: '#4a3f4f', wall: '#6a5566', plain: true }, sign: 'events' },
  'staff room': { room: 'staffroom', sign: 'staff' },
  'store room': { room: 'store', look: { floor: '#c9c2b2', plain: true }, sign: 'stores' },
  'cleaner\'s cupboard': { room: 'cupboard', sign: '' },
  'security office': { room: 'security', sign: 'security' },
  entrance: { room: 'gate', sign: 'ENTRANCE', band: '#e8b93a' },
  'car park entrance': { room: 'gate', sign: 'CAR PARK', band: '#3f78c4' },
};

const ROOMS = {
  shop(R, s, door) {
    const { fw, fh, r } = R, P = s.goods;
    for (let x = 0; x < fw; x++) if (clear(door, 'N', x, 1)) { R.box(x + 0.05, 0.05, 0.9, 0.4, 32, WOOD, { south: goodsOn(P, r), top: itemsOn(P, r, 3), rise: 5 }); R.spot(x + 0.5, 0.78, { to: [x + 0.5 + (r() < 0.5 ? 0.45 : -0.3), 0.86] }); }
    for (let y = 1; y < fh; y++) if (clear(door, 'W', y, 1)) { R.box(0.05, y + 0.05, 0.4, 0.9, 32, WOOD, { east: goodsOn(P, r), top: itemsOn(P, r, 3), rise: 5 }); R.spot(0.78, y + 0.5, { to: [0.86, y + 0.5 + (r() < 0.5 ? 0.4 : -0.3)] }); }
    const tx = Math.max(1.15, fw - 1.5), ty = Math.max(1.15, fh - 1.05);
    for (let y = 1.55; y + 0.7 <= fh - 0.2; y += 1.6) for (let x = 1.6; x + 1.1 <= fw - 0.2; x += 2) {
      if (x + 1.1 > tx - 0.3 && y + 0.6 > ty - 0.5) continue;       // leave the till its corner
      const kind = s.racks && ((x + y) | 0) % 2 === 0 ? 'rack' : s.crates ? 'crate' : s.screens ? 'screen' : 'island';
      if (kind === 'rack') R.box(x, y + 0.2, 1.1, 0.14, 27, STEEL, { south: (g, w, h) => { g.clearRect(0, -h + 3, w, h - 3); for (let px = 2; px < w - 5; px += 5) { g.fillStyle = P[(r() * P.length) | 0]; g.fillRect(px, -h + 3, 4, 13 + ((r() * 5) | 0)); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 3, -h + 3, 1, 14); } g.fillStyle = shade(STEEL, 0.6); g.fillRect(0, -h, 2, h); g.fillRect(w - 2, -h, 2, h); }, east: (g, w, h) => g.clearRect(0, -h + 3, w, h - 3) });
      else if (kind === 'crate') R.box(x, y, 1.05, 0.62, 11, '#a87a48', { top: (g, bx, by, w, d) => { for (let k = 0; k < 3; k++) { g.fillStyle = P[k % P.length]; g.fillRect(bx + 0.05 + k * w / 3, by + 0.05, w / 3 - 0.08, d - 0.1); g.fillStyle = 'rgba(255,255,255,0.3)'; for (let q = 0; q < 6; q++) g.fillRect(bx + 0.08 + k * w / 3 + r() * (w / 3 - 0.2), by + 0.08 + r() * (d - 0.25), 0.06, 0.06); } } });
      else if (kind === 'screen') R.box(x, y, 1.05, 0.5, 13, '#e6e9ee', { more: p => { for (let k = 0; k < 2; k++) drawBox(p, x + 0.12 + k * 0.5, y + 0.1, 0.34, 0.08, 9, '#1c1f27', { south: (g, w, h) => { g.fillStyle = ['#59d0e0', '#9ad0ff', '#8fe0b0'][(r() * 3) | 0]; g.fillRect(1, -h + 1, w - 2, h - 2); } }, 13); }, rise: 10 });
      else R.box(x, y, 1.05, 0.6, 13, mix(WOOD, '#ffffff', 0.35), { top: itemsOn(P, r, 9), south: (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(2, -h + 4, w - 4, 2); } });
      R.spot(x + 0.3, y + 1.0, { to: [x + 0.85, y + 1.0] }); R.spot(x + 0.75, y - 0.2);
    }
    R.box(tx, ty, 1.05, 0.44, 17, '#4a4f5c', { top: (g, bx, by, w, d) => { g.fillStyle = '#6a7080'; g.fillRect(bx + 0.03, by + 0.03, w - 0.06, d - 0.06); }, more: p => drawBox(p, tx + 0.55, ty + 0.08, 0.3, 0.24, 8, '#22242b', { south: (g, w, h) => { g.fillStyle = '#9ad0ff'; g.fillRect(1, -h + 1, w - 2, h - 3); } }, 17), rise: 9 });
    R.post(tx + 0.6, ty - 0.22); R.spot(tx + 0.3, ty + 0.72); R.spot(tx - 0.3, ty + 0.6);
  },
  eatery(R, s, door) {
    const { fw, fh, r } = R, stalls = s.stalls ?? [s.counter];
    for (let k = 0; k < stalls.length; k++) {
      const x0 = 0.25 + k * (fw - 0.5) / stalls.length, w = (fw - 0.5) / stalls.length - 0.12, c = stalls[k];
      if (!clear(door, 'N', x0, w)) continue;
      R.box(x0, 0.5, w, 0.4, 18, c, { top: (g, bx, by, bw, d) => { g.fillStyle = mix(c, '#ffffff', 0.55); g.fillRect(bx + 0.03, by + 0.03, bw - 0.06, d - 0.06); for (let q = 0; q < Math.max(1, bw * 2 - 1); q++) { g.fillStyle = ['#f2c744', '#e8e8e8', '#8a5a3c', '#e06a4a'][(r() * 4) | 0]; g.beginPath(); g.arc(bx + 0.3 + q * 0.5, by + d / 2, 0.09, 0, 6.3); g.fill(); } },
        more: p => drawBox(p, x0 + w - 0.42, 0.56, 0.3, 0.26, 11, s.stalls ? '#d8dce2' : '#2b2f3a', { south: (g, bw, h) => { g.fillStyle = '#e04f4f'; g.fillRect(2, -h + 2, 2, 2); g.fillStyle = '#9ad0ff'; g.fillRect(bw - 5, -h + 2, 3, 3); } }, 18), rise: 12 });
      onNorth(R, x0 + 0.08, x0 + w - 0.08, 20, 33, (g, bw, h) => { g.fillStyle = s.boards || s.stalls ? '#22242b' : shade(c, 0.6); g.fillRect(0, -h, bw, h); g.fillStyle = s.boards ? '#f2c744' : '#f4f0e8'; for (let q = 3; q < bw - 8; q += 11) { g.fillRect(q, -h + 3, 7, 2); g.fillRect(q, -h + 7, 5, 1); g.fillRect(q, -h + 10, 6, 1); } });
      R.post(x0 + w * 0.35, 0.3); R.spot(x0 + w * 0.5, 1.18); if (w > 1.4) R.spot(x0 + w * 0.2, 1.22);
    }
    const chair = (x, y) => R.box(x, y, 0.22, 0.22, 9, '#6f5a48', { cache: 'chair' });
    for (let y = 1.75; y + 0.7 <= fh - 0.1; y += 1.3) for (let x = 0.7; x + 1.25 <= fw - 0.1; x += 1.55) {
      chair(x - 0.3, y + 0.17); chair(x + 0.64, y + 0.17);
      R.box(x, y, 0.56, 0.56, 13, s.table, { top: (g, bx, by) => { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(bx + 0.17, by + 0.2, 0.08, 0, 6.3); g.arc(bx + 0.4, by + 0.36, 0.08, 0, 6.3); g.fill(); g.fillStyle = '#c9a26a'; g.beginPath(); g.arc(bx + 0.17, by + 0.2, 0.045, 0, 6.3); g.fill(); }, south: (g, w, h) => { g.clearRect(0, -h + 3, w, h - 3); g.fillStyle = shade(s.table, 0.5); g.fillRect(w / 2 - 2, -h + 3, 4, h - 3); }, east: (g, w, h) => g.clearRect(0, -h + 3, w, h - 3) });
      if (s.candles) R.part(x + 0.22, y + 0.22, 0.1, 0.1, 22, (p, f) => { const cx = Math.round(p.X(x + 0.28, y + 0.28)), cy = Math.round(p.Y(x + 0.28, y + 0.28, 13)); p.g.fillStyle = '#f4f0e0'; p.g.fillRect(cx - 1, cy - 5, 2, 5); p.g.fillStyle = f ? '#ffd24a' : '#ff9a3a'; p.g.fillRect(cx - 1, cy - 8 - f, 2, 3 + f); }, { frames: 2, ticks: 7, key: x + y + 0.57, cache: 'candle' });
      R.spot(x - 0.19, y + 0.3, { sit: true }); R.spot(x + 0.75, y + 0.3, { sit: true });
    }
  },
  toilets(R, s, door) {
    const { fw, fh } = R;
    for (let x = 0; x < fw; x++) if (clear(door, 'N', x, 1)) { R.box(x + 0.06, 0.05, 0.88, 0.75, 38, '#f1f4f6', { south: (g, w, h) => { g.fillStyle = '#7fb6c9'; g.fillRect(5, -h + 5, w - 10, h - 8); g.fillStyle = '#5d95a8'; g.fillRect(5, -h + 5, 2, h - 8); g.fillStyle = '#e8c24a'; g.fillRect(w - 10, -h / 2, 2, 3); }, cache: 'cubicle' }); R.spot(x + 0.5, 1.1); }
    for (let y = 1; y < fh; y++) if (clear(door, 'W', y, 1)) { R.box(0.05, y + 0.18, 0.36, 0.64, 16, '#ffffff', { top: (g, bx, by, w, d) => { g.fillStyle = '#bfe3f2'; g.fillRect(bx + 0.08, by + 0.12, w - 0.16, d - 0.24); }, cache: 'basin' }); onWest(R, y + 0.2, y + 0.8, 22, 38, (g, w, h) => { g.fillStyle = '#9fb8c4'; g.fillRect(0, -h, w, h); g.fillStyle = '#d4eef7'; g.fillRect(1, -h + 1, w - 2, h - 2); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(3, -h + 2, 2, h - 5); }, { cache: 'mirror' }); R.spot(0.78, y + 0.5); }
  },
  gym(R, s, door) {
    const { fw, fh } = R;
    onNorth(R, 0.3, fw - 0.3, 12, 36, (g, w, h) => { g.fillStyle = '#9fb8c4'; g.fillRect(0, -h, w, h); g.fillStyle = '#cfe8f2'; g.fillRect(1, -h + 1, w - 2, h - 2); g.fillStyle = 'rgba(255,255,255,0.5)'; for (let q = 6; q < w; q += 26) { g.fillRect(q, -h + 2, 3, h - 4); g.fillRect(q + 5, -h + 2, 1, h - 4); } });
    for (let x = 0.4; x + 0.7 <= fw; x += 1.05) if (clear(door, 'N', x, 1)) { R.box(x, 0.75, 0.6, 1.0, 5, '#2b2f38', { top: (g, bx, by, w, d) => { g.fillStyle = '#454b58'; g.fillRect(bx + 0.06, by + 0.06, w - 0.12, d - 0.12); }, more: p => { drawBox(p, x + 0.04, 0.72, 0.06, 0.06, 22, STEEL, {}, 5); drawBox(p, x + 0.5, 0.72, 0.06, 0.06, 22, STEEL, {}, 5); drawBox(p, x + 0.04, 0.7, 0.52, 0.1, 6, '#22242b', { south: (g, w, h) => { g.fillStyle = '#59d08a'; g.fillRect(3, -h + 1, w - 6, h - 3); } }, 24); }, rise: 30, key: x + 0.3 + 0.9, cache: 'treadmill' }); R.spot(x + 0.3, 1.35, { run: true }); }
    for (let y = 2.3; y + 0.8 <= fh; y += 1.25) for (let x = 0.9; x + 1.1 <= fw; x += 1.5) { const c = ['#4fb3b8', '#e0739a', '#8a55b5'][((x * 2 + y) | 0) % 3]; R.pen.floor(0, g => { g.fillStyle = shade(c, 0.7); g.fillRect(x, y, 1, 0.66); g.fillStyle = c; g.fillRect(x + 0.03, y + 0.03, 0.94, 0.6); }); R.spot(x + 0.3, y + 0.33, { to: [x + 0.7, y + 0.33] }); }
    for (let y = 1; y + 0.8 <= fh; y += 1) if (clear(door, 'W', y, 1)) R.box(0.06, y + 0.1, 0.34, 0.8, 20, '#3c4250', { east: (g, w, h) => { for (let k = 0; k < 3; k++) { g.fillStyle = '#c9ced6'; g.fillRect(3, -h + 3 + k * 6, w - 6, 3); g.fillStyle = '#22242b'; g.fillRect(2, -h + 2 + k * 6, 3, 5); g.fillRect(w - 5, -h + 2 + k * 6, 3, 5); } }, cache: 'weights' });
    R.post(fw - 0.5, fh - 0.5);
  },
  arcade(R, s, door) {
    const { fw, fh } = R, lit = ['#59d0e0', '#f2c744', '#e0739a', '#8fd06a', '#ff8a5b'];
    const front = (g, bw, h) => { g.fillStyle = '#f2c744'; g.fillRect(2, -h + 2, bw - 4, 5); g.fillStyle = '#11131a'; g.fillRect(3, -h + 9, bw - 6, 11); g.fillStyle = '#c9ced6'; g.fillRect(3, -h + 22, bw - 6, 3); g.fillStyle = '#e04f4f'; g.fillRect(6, -h + 21, 3, 3); };
    const glow = (k, f) => (g, w) => { g.fillStyle = lit[(k + f * 2) % lit.length]; g.fillRect(4, -24, w - 8, 9); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(6 + f * 6, -22 + f * 3, 4, 3); g.fillRect(w - 12 - f * 5, -19 - f * 2, 3, 3); };
    for (let x = 0; x < fw; x++) if (clear(door, 'N', x, 1)) {
      R.box(x + 0.15, 0.08, 0.7, 0.5, 34, ['#3a2f6a', '#2f4a7a', '#6a2f5a'][x % 3], { south: front });
      R.part(x + 0.15, 0.58, 0.7, 0, 26, (p, f) => p.alongX(x + 0.15, 0.58, 0, g => glow(x, f)(g, 0.7 * HW)), { frames: 2, ticks: 8 + (x % 3) * 4, key: x + 0.5 + 0.34 });
      R.spot(x + 0.5, 0.98);
    }
    for (let y = 1; y < fh; y++) if (clear(door, 'W', y, 1)) {
      R.box(0.08, y + 0.15, 0.5, 0.7, 34, ['#2f4a7a', '#6a2f5a', '#3a2f6a'][y % 3], { east: front });
      R.part(0.58, y + 0.15, 0, 0.7, 26, (p, f) => p.alongY(0.58, y + 0.85, 0, g => glow(y + 2, f)(g, 0.7 * HW)), { frames: 2, ticks: 9 + (y % 3) * 4, key: y + 0.5 + 0.34 });
      R.spot(0.98, y + 0.5);
    }
    for (let x = 1.9; x + 1.3 <= fw - 0.2; x += 2.3) for (let y = 1.8; y + 0.8 <= fh - 0.2; y += 1.6) { R.box(x, y, 1.15, 0.62, 15, '#2a2f3a', { top: (g, bx, by, w, d) => { g.fillStyle = '#2f8f5a'; g.fillRect(bx + 0.06, by + 0.06, w - 0.12, d - 0.12); g.strokeStyle = '#ffffff'; g.lineWidth = 0.02; g.strokeRect(bx + 0.12, by + 0.12, w - 0.24, d - 0.24); g.beginPath(); g.moveTo(bx + w / 2, by + 0.12); g.lineTo(bx + w / 2, by + d - 0.12); g.stroke(); } }); R.spot(x - 0.25, y + 0.3); R.spot(x + 1.42, y + 0.3); R.spot(x + 0.55, y + 0.95); }
    R.post(fw - 0.5, fh - 0.45);
  },
  cinema(R, s, door) {
    const { fw, fh } = R;
    onNorth(R, 0.4, fw - 0.4, 9, 40, (g, w, h, f) => { g.fillStyle = '#17181f'; g.fillRect(0, -h, w, h); const sky = ['#9fc4f2', '#f2c79f', '#b8a0e0', '#9fe0c4'][f]; g.fillStyle = sky; g.fillRect(2, -h + 2, w - 4, h - 4); g.fillStyle = shade(sky, 0.6); g.beginPath(); g.moveTo(2, -2); g.lineTo(w * (0.25 + f * 0.1), -h * 0.6); g.lineTo(w * 0.55, -2); g.fill(); g.fillStyle = shade(sky, 0.45); g.fillRect(w * (0.6 - f * 0.08), -h * 0.55, 6, h * 0.55 - 2); g.fillRect(w * (0.6 - f * 0.08) - 2, -h * 0.55 - 5, 10, 6); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(w * (0.15 + f * 0.2), -h + 5, 5, 3); }, { frames: 4, ticks: 45 });
    for (let y = 1.7; y + 0.5 <= fh - 0.05; y += 0.72) for (let x = 0.5; x + 0.45 <= fw - 0.35; x += 0.52) { R.box(x, y + 0.2, 0.44, 0.14, 15, '#8a2f3f', { cache: 'cinema-seat', south: (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(2, -h + 3, w - 4, h - 6); } }); R.spot(x + 0.22, y + 0.12, { sit: true }); }
    R.post(fw - 0.45, 1.0);
  },
  stage(R, s, door) {
    const { fw, fh } = R, lamps = ['#ffd24a', '#ff6fa8', '#6fd0ff', '#9aff8a'];
    R.box(0.4, 0.12, fw - 0.8, 1.05, 10, '#7a5c40', { top: (g, bx, by, w, d) => { g.fillStyle = '#8f6e4e'; for (let q = 0; q < w; q += 0.25) g.fillRect(bx + q, by, 0.02, d); }, more: p => { drawBox(p, fw / 2 - 0.5, 0.3, 0.5, 0.4, 12, '#c44b4b', { south: (g, w, h) => { g.fillStyle = '#f2f2f2'; g.beginPath(); g.arc(w / 2, -h / 2, 4, 0, 6.3); g.fill(); } }, 10); drawBox(p, 0.6, 0.3, 0.35, 0.35, 20, '#22242b', { south: (g, w, h) => { g.fillStyle = '#555b68'; g.beginPath(); g.arc(w / 2, -h * 0.7, 3, 0, 6.3); g.arc(w / 2, -h * 0.3, 4, 0, 6.3); g.fill(); } }, 10); drawBox(p, fw - 1, 0.3, 0.35, 0.35, 20, '#22242b', {}, 10); }, rise: 22, key: fw / 2 + 1.1 });
    for (let k = 0; k < fw; k++) onNorth(R, k + 0.25, k + 0.75, 26, 34, (g, w, h, f) => { g.fillStyle = '#22242b'; g.fillRect(0, -h, w, h); g.fillStyle = lamps[(k + f) % lamps.length]; g.fillRect(2, -h + 2, w - 4, h - 3); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(3, -h + 3, 3, 2); }, { frames: 4, ticks: 12 });
    for (let k = 0; k < 3; k++) R.post(fw * (0.3 + k * 0.2), 1.42);
    for (let y = 2.1; y + 0.3 <= fh; y += 0.62) for (let x = 0.6; x + 0.3 <= fw; x += 0.66) { const sx = x + (((y * 10) | 0) % 2 ? 0.3 : 0); R.spot(sx, y, { to: [sx + 0.12, y + 0.05] }); }
  },
  staffroom(R, s, door) {
    const { fw, fh } = R;
    for (let x = 0; x < fw; x++) if (clear(door, 'N', x, 1)) R.box(x + 0.06, 0.05, 0.88, 0.38, 36, '#6f86a8', { south: (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(w / 2, -h + 2, 1, h - 4); g.fillRect(4, -h + 6, 6, 2); g.fillRect(w / 2 + 4, -h + 6, 6, 2); }, cache: 'locker' });
    R.box(Math.max(0.6, fw / 2 - 0.45), Math.max(1.15, fh / 2), 0.9, 0.6, 13, '#c79a6a', { top: (g, bx, by) => { g.fillStyle = '#ffffff'; g.fillRect(bx + 0.15, by + 0.15, 0.2, 0.14); g.fillStyle = '#e04f4f'; g.beginPath(); g.arc(bx + 0.65, by + 0.35, 0.07, 0, 6.3); g.fill(); } });
    const sy = Math.max(1.05, fh - 1.15);
    R.box(0.08, sy, 0.5, 1.0, 11, '#b05a5a', { more: p => drawBox(p, 0.08, sy, 0.16, 1.0, 9, '#9a4a4a', {}, 11), rise: 10 });
  },
  store(R, s, door) {
    const { fw, fh, r } = R;
    for (let y = 0.12; y + 0.8 <= fh; y += 0.92) for (let x = 0.12; x + 0.8 <= fw; x += 0.92) if (r() < 0.75 && !(x > fw - 1.3 && y > fh - 1.3)) { const n = 1 + ((r() * 3) | 0), c = ['#b88a55', '#a87a48', '#c79a66'][(r() * 3) | 0]; R.box(x, y, 0.76, 0.76, n * 13, c, { south: (g, w, h) => { for (let k = 1; k < n; k++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, -k * 13, w, 1); } g.fillStyle = '#f2ecd8'; g.fillRect(4, -9, 9, 5); }, east: (g, w, h) => { for (let k = 1; k < n; k++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, -k * 13, w, 1); } }, top: (g, bx, by, w, d) => { g.fillStyle = '#d9c79a'; g.fillRect(bx + w / 2 - 0.04, by, 0.08, d); }, cache: `crate${n}${c}` }); }
  },
  cupboard(R, s, door) {
    const { fw, fh, r } = R;
    for (let x = 0; x < fw; x++) if (clear(door, 'N', x, 1)) R.box(x + 0.06, 0.05, 0.88, 0.34, 34, '#9aa7a8', { south: goodsOn(['#4fd0c0', '#f2c744', '#e0739a', '#ffffff', '#4f8fe0'], r) });
    R.box(fw - 0.8, fh - 0.8, 0.4, 0.4, 11, '#e0c23a', { more: p => { const x = Math.round(p.X(fw - 0.6, fh - 0.6)), y = Math.round(p.Y(fw - 0.6, fh - 0.6, 11)); p.g.fillStyle = '#8a6a4a'; p.g.fillRect(x, y - 24, 2, 24); p.g.fillStyle = '#d6d6d6'; p.g.fillRect(x - 3, y - 3, 8, 4); }, rise: 26 });
  },
  security(R, s, door) {
    const { fw, fh } = R;
    for (let k = 0; k < fw * 2; k++) onNorth(R, k / 2 + 0.07, k / 2 + 0.43, 20, 32, (g, w, h, f) => { g.fillStyle = '#17181f'; g.fillRect(0, -h, w, h); g.fillStyle = (k + f) % 3 ? '#2f6f52' : '#59d08a'; g.fillRect(1, -h + 1, w - 2, h - 2); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(3 + ((k * 5 + f * 4) % 7), -h + 3 + ((k + f) % 4), 2, 3); }, { frames: 3, ticks: 16 });
    R.box(0.3, 0.62, Math.max(0.8, fw - 0.7), 0.42, 15, '#4a5266', { top: (g, bx, by, w) => { g.fillStyle = '#22242b'; g.fillRect(bx + 0.1, by + 0.1, 0.3, 0.2); g.fillStyle = '#e8e8e8'; g.fillRect(bx + w - 0.4, by + 0.12, 0.22, 0.16); } });
  },
  gate(R, s, door) {
    const { fw, fh, pen } = R, long = fw >= fh;
    pen.floor(0, g => { g.fillStyle = '#4b4f58'; g.fillRect(0, 0, fw, fh); g.fillStyle = '#353941'; g.fillRect(0.1, 0.1, fw - 0.2, fh - 0.2); g.fillStyle = '#5a5f69'; for (let q = 0.2; q < (long ? fw : fh) - 0.2; q += 0.16) { if (long) g.fillRect(q, 0.16, 0.06, fh - 0.32); else g.fillRect(0.16, q, fw - 0.32, 0.06); } g.fillStyle = s.band; if (long) { g.fillRect(0, 0, fw, 0.07); g.fillRect(0, fh - 0.07, fw, 0.07); } else { g.fillRect(0, 0, 0.07, fh); g.fillRect(fw - 0.07, 0, 0.07, fh); } });
    const post = (x, y) => R.box(x, y, 0.13, 0.13, WALL - 6, '#b4bcc8', { cache: 'gatepost' });
    post(0, 0); post(fw - 0.13, 0); post(0, fh - 0.13); post(fw - 0.13, fh - 0.13);
    // the sign hangs over the side away from the door
    const text = (g, w) => { g.fillStyle = s.band; g.fillRect(0, -11, w, 11); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, -11, w, 2); g.strokeStyle = shade(s.band, 0.5); g.lineWidth = 1; g.strokeRect(0.5, -10.5, w - 1, 10); g.font = '700 8px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; if (g.measureText(s.sign).width < w - 4) g.fillText(s.sign, w / 2, -5); };
    if (long) { const y = door.side === 'N' ? fh - 0.06 : 0.06; R.part(0.13, y - 0.05, fw - 0.26, 0.05, WALL - 6, p => p.alongX(0.13, y, WALL - 6, g => text(g, (fw - 0.26) * HW)), { key: door.side === 'N' ? fw / 2 + fh : fw + 0.03 }); }
    else { const x = door.side === 'W' ? fw - 0.06 : 0.06; R.part(x - 0.05, 0.13, 0.05, fh - 0.26, WALL - 6, p => p.alongY(x, fh - 0.13, WALL - 6, g => text(g, (fh - 0.26) * HW)), { key: door.side === 'W' ? fw + fh / 2 : fh + 0.03 }); }
  },
};

// Places for whoever does not find one of the room's own: on the open floor, clear of the furniture.
function fill(R, want) {
  const free = (x, y) => !R.solid.some(([bx, by, w, d]) => x > bx - 0.22 && x < bx + w + 0.22 && y > by - 0.22 && y < by + d + 0.3) && !R.spots.some(s => Math.abs(s.x - x) + Math.abs(s.y - y) < 0.4);
  for (let y = R.fh - 0.35; y > 0.9 && R.spots.length < want; y -= 0.45) for (let x = R.fw - 0.35; x > 0.9 && R.spots.length < want; x -= 0.45) if (free(x, y)) R.spot(x, y);
}

// ── people: a figure for each type and each of a few looks, in six poses (four steps, standing, sitting)
export const LOOKS = 8;
const AW = 26, AH = 44, POSES = 6, SIT = 5, STAND = 4;
const SKINS = ['#f0c8a0', '#d9a577', '#b97d52', '#8d5a3b', '#f4d6b8', '#c98d62'], HAIRS = ['#2b2118', '#5b3a22', '#c9a45a', '#8f8f8f', '#151515', '#a8502a', '#e8e0d0'];
const SHIRTS = ['#c44b4b', '#3f78c4', '#3f9a62', '#d9a23a', '#8a55b5', '#e8e8e8', '#e0739a', '#4fb3b8', '#a8672f', '#5a6fa8'], TROUSERS = ['#3c4250', '#2f3a55', '#5a5f69', '#6b5a48', '#22242b', '#4a6a8a'];
function drawPerson(g, x0, y0, type, look, pose0) {
  const r = rng(hash(type) + look * 977), pick = a => a[(r() * a.length) | 0];
  const skin = pick(SKINS); let hair = pick(HAIRS), shirt = pick(SHIRTS), legs = pick(TROUSERS), tall = 34, hat = null, extra = null;
  const style = (r() * 4) | 0;
  if (type === 'teenager') { tall = 29; hat = pick(['#e04f4f', '#3f78c4', '#22242b', '#f2c744']); extra = 'pack'; }
  else if (type === 'pensioner') { tall = 31; hair = pick(['#d6d6d6', '#bfbfbf', '#efefef']); shirt = pick(['#8a7a9a', '#7a8a6a', '#9a7a6a', '#6a7a8a']); extra = 'stick'; }
  else if (type === 'office worker') { shirt = pick(['#2f3a55', '#3c4250', '#4a4f5c']); legs = shade(shirt, 0.8); extra = 'case'; }
  else if (type === 'family') extra = 'child';
  else if (type === 'shopper') extra = 'bag';
  else if (type === 'staff') { shirt = '#f6f6f6'; legs = '#2b2f3a'; extra = 'apron'; }
  else if (type === 'cleaner') { shirt = '#3fb8a8'; legs = '#2f9a8c'; extra = 'mop'; }
  else if (type === 'guard') { shirt = '#30406a'; legs = '#22304f'; hat = '#22304f'; extra = 'badge'; }
  else if (type === 'off duty') shirt = pick(['#7a7f8a', '#8a7a6a', '#5a6a7a']);
  const rects = [], put = (x, y, w, h, c) => rects.push([x0 + x, y0 + y, w, h, c]);
  const figure = (cx, feet, h, o, pose) => {
    const step = pose < 4 ? pose : -1, sit = pose === SIT, bob = step === 1 || step === 3 ? 1 : 0;
    const head = Math.round(h * 0.25), legH = sit ? 4 : Math.round(h * 0.36), body = h - head - Math.round(h * 0.36) - 1, w = o.w ?? 8, half = w / 2;
    if (sit) { put(cx - half, feet - 4, w + 3, 3, o.legs); put(cx + half + 1, feet - 2, 3, 2, INK); }
    else if (step === 0) { put(cx - half - 1, feet - legH, 3, legH - 1, o.legs); put(cx + 1, feet - legH, 3, legH - 3, o.legs); put(cx - half - 2, feet - 2, 4, 2, INK); put(cx + 1, feet - 4, 4, 2, INK); }
    else if (step === 2) { put(cx - half, feet - legH, 3, legH - 3, o.legs); put(cx + 2, feet - legH, 3, legH - 1, o.legs); put(cx - half, feet - 4, 4, 2, INK); put(cx + 1, feet - 2, 4, 2, INK); }
    else { put(cx - half, feet - legH - bob, 3, legH - 1, o.legs); put(cx + 1, feet - legH - bob, 3, legH - 1, o.legs); put(cx - half, feet - 2 - bob, 3, 2, INK); put(cx + 1, feet - 2 - bob, 3, 2, INK); }
    const by = feet - legH - body - bob;
    put(cx - half, by, w, body, o.shirt); put(cx + half - 2, by + 1, 2, body - 1, shade(o.shirt, 0.8));
    const swing = step === 0 ? 1 : step === 2 ? -1 : 0, arm = Math.max(4, body - 3);
    put(cx - half - 2, by + 1 + (swing > 0 ? 1 : 0), 2, arm, shade(o.shirt, 0.88)); put(cx - half - 2, by + 1 + arm + (swing > 0 ? 1 : 0), 2, 2, o.skin);
    put(cx + half, by + 1 + (swing < 0 ? 1 : 0), 2, arm, shade(o.shirt, 0.7)); put(cx + half, by + 1 + arm + (swing < 0 ? 1 : 0), 2, 2, o.skin);
    const hy = by - head, hx = cx - half + (o.bent ? 1 : 0);
    put(hx, hy, w, head, o.skin); put(hx + w - 2, hy + 1, 2, head - 1, shade(o.skin, 0.88));
    if (o.hat) { put(hx - 1, hy - 2, w + 2, 4, o.hat); put(hx + w - 2, hy + 1, 5, 2, shade(o.hat, 0.8)); }
    else if (o.style !== 3) { put(hx - 1, hy - 2, w + 2, 4, o.hair); put(hx - 1, hy + 1, 2, o.style === 1 ? head + 2 : 3, o.hair); if (o.style === 2) put(hx + 1, hy - 4, 4, 3, o.hair); }
    put(hx + w - 4, hy + Math.round(head / 2), 1, 2, INK); put(hx + w - 1, hy + Math.round(head / 2), 1, 2, INK);
    return { by, body, hand: [cx + half, by + 1 + arm + (swing < 0 ? 1 : 0)], back: cx - half - 2, top: hy };
  };
  const cx = extra === 'child' ? 8 : 11, feet = AH - 2, sitting = pose0 === SIT;
  const f = figure(cx, feet, tall, { skin, hair, shirt, legs, hat, style, bent: type === 'pensioner' }, pose0);
  if (extra === 'apron') { put(cx - 3, f.by + 3, 6, f.body - 3, '#3c4250'); put(cx - 1, f.by + 1, 2, 2, '#3c4250'); }
  else if (extra === 'badge') { put(cx + 1, f.by + 2, 2, 2, '#f2c744'); put(cx - 4, f.by + f.body - 2, 8, 2, '#17181f'); }
  else if (extra === 'case') { put(cx - 1, f.by + 1, 2, 5, '#f2f2f2'); put(cx - 1, f.by + 3, 1, 4, '#c44b4b'); if (!sitting) put(f.hand[0] - 1, f.hand[1] + 2, 6, 5, '#5a3a22'); }
  else if (extra === 'bag' && !sitting) { const c = pick(['#f2c744', '#e0739a', '#59b0d0', '#f2f2f2', '#8fd06a']); put(f.hand[0] - 1, f.hand[1] + 3, 6, 7, c); put(f.hand[0], f.hand[1] + 1, 1, 2, INK); put(f.hand[0] + 3, f.hand[1] + 1, 1, 2, INK); }
  else if (extra === 'pack') put(f.back - 2, f.by + 1, 3, f.body - 2, pick(['#3f9a62', '#8a55b5', '#d9582b', '#3c4250']));
  else if (extra === 'stick' && !sitting) put(f.hand[0] + 2, f.hand[1], 1, feet - f.hand[1], '#6b4a2b');
  else if (extra === 'mop' && !sitting) { put(f.hand[0] + 2, f.top - 2, 1, feet - f.top, '#8a6a4a'); put(f.hand[0], feet - 3, 6, 3, '#e8e8e8'); }
  else if (extra === 'child') { const r2 = rng(hash(type) + look * 31 + 5), p2 = a => a[(r2() * a.length) | 0]; figure(20, feet, 21, { skin, hair: p2(HAIRS), shirt: p2(SHIRTS), legs: p2(TROUSERS), style: (r2() * 3) | 0, w: 6 }, pose0 < 4 ? (pose0 + 1) % 4 : pose0); }
  g.fillStyle = INK; for (const [x, y, w, h] of rects) g.fillRect(x - 1, y - 1, w + 2, h + 2);                 // the outline first
  for (const [x, y, w, h, c] of rects) { g.fillStyle = c; g.fillRect(x, y, w, h); }
}

// ── things on the floor: one cell wide, standing on the cell's diamond; and the floor's own textures
const diamond = (g, x, y, color) => { g.fillStyle = color; g.beginPath(); g.moveTo(x + HW, y); g.lineTo(x + TILE.w, y + HH); g.lineTo(x + HW, y + TILE.h); g.lineTo(x, y + HH); g.closePath(); g.fill(); };
const thing = (h, draw) => ({ h, draw(g, x, y) { draw(Pen(g, x + HW, y + h - TILE.h), g, x, y + h - TILE.h); } });
const arrow = (p, up) => { const g = p.g, cx = Math.round(p.X(0.5, 0.2)), cy = Math.round(p.Y(0.5, 0.2, 24)); g.fillStyle = INK; g.fillRect(cx - 6, cy - 12, 13, 13); g.fillStyle = up ? '#58b06c' : '#c8704f'; g.fillRect(cx - 5, cy - 11, 11, 11); g.fillStyle = '#ffffff'; g.fillRect(cx - 1, cy - 9, 3, 7); if (up) { g.fillRect(cx - 3, cy - 8, 7, 2); g.fillRect(cx - 2, cy - 10, 5, 2); } else { g.fillRect(cx - 3, cy - 5, 7, 2); g.fillRect(cx - 2, cy - 3, 5, 2); } };
const steps = (p, rail) => { for (let k = 0; k < 5; k++) drawBox(p, 0.14, 0.72 - k * 0.15, 0.72, 0.15, 3 + k * 4, k % 2 ? '#9aa2ae' : '#b4bcc8'); if (rail) { drawBox(p, 0.06, 0.06, 0.07, 0.82, 24, rail); drawBox(p, 0.87, 0.06, 0.07, 0.82, 24, rail); } };
const FLOOR_THINGS = {
  plant: thing(72, p => { drawBox(p, 0.3, 0.3, 0.4, 0.4, 14, '#a8623c', { top: (g, x, y, w, d) => { g.fillStyle = '#4a3324'; g.fillRect(x + 0.05, y + 0.05, w - 0.1, d - 0.1); } }); const cx = Math.round(p.X(0.5, 0.5)), cy = Math.round(p.Y(0.5, 0.5, 14)); for (const [dx, dy, s, c] of [[-13, -20, 16, '#3f7f35'], [-3, -28, 18, '#4f8f3f'], [4, -18, 15, '#5c9a4a'], [-8, -38, 14, '#6fb05a'], [2, -44, 11, '#7fc06a'], [-15, -30, 10, '#4f8f3f']]) { p.g.fillStyle = INK; p.g.fillRect(cx + dx - 1, cy + dy - 1, s + 2, s); p.g.fillStyle = c; p.g.fillRect(cx + dx, cy + dy, s, s - 2); p.g.fillStyle = 'rgba(255,255,255,0.28)'; p.g.fillRect(cx + dx + 1, cy + dy + 1, 4, 2); p.g.fillStyle = 'rgba(0,0,0,0.18)'; p.g.fillRect(cx + dx, cy + dy + s - 5, s, 3); } }),
  bench: thing(52, p => { drawBox(p, 0.12, 0.3, 0.08, 0.34, 9, '#4a4f58'); drawBox(p, 0.8, 0.3, 0.08, 0.34, 9, '#4a4f58'); drawBox(p, 0.08, 0.28, 0.84, 0.4, 3, '#c79a5a', { top: (g, x, y, w, d) => { g.fillStyle = '#a87a40'; for (let q = 0.1; q < d; q += 0.1) g.fillRect(x, y + q, w, 0.015); } }, 9); drawBox(p, 0.08, 0.24, 0.84, 0.06, 11, '#b98a4a', {}, 12); }),
  bin: thing(54, p => { drawBox(p, 0.32, 0.32, 0.36, 0.36, 20, '#5a6068', { south: (g, w, h) => { g.fillStyle = '#58b06c'; g.fillRect(3, -h + 6, w - 6, 5); } }); drawBox(p, 0.29, 0.29, 0.42, 0.42, 3, '#7a8088', { top: (g, x, y, w, d) => { g.fillStyle = '#22242b'; g.fillRect(x + 0.1, y + 0.1, w - 0.2, d - 0.2); } }, 20); }),
  'escalator up': thing(66, (p, g, x, y) => { diamond(g, x, y, '#3c4250'); steps(p, '#58b06c'); arrow(p, true); }),
  'escalator down': thing(66, (p, g, x, y) => { diamond(g, x, y, '#3c4250'); steps(p, '#c8704f'); arrow(p, false); }),
  stairs: thing(56, (p, g, x, y) => { diamond(g, x, y, '#6f737c'); steps(p, null); }),
  lift: thing(88, (p, g, x, y) => { diamond(g, x, y, '#3c4250'); p.floor(0, g2 => { g2.fillStyle = '#6f86a8'; g2.fillRect(0.1, 0.1, 0.8, 0.8); }); p.alongX(0.06, 0.06, 0, g2 => { g2.fillStyle = '#aab8d6'; g2.fillRect(0, -52, 0.88 * HW, 52); g2.fillStyle = '#d6def2'; g2.fillRect(2, -44, 0.88 * HW - 4, 30); g2.fillStyle = '#4f7fd8'; g2.fillRect(0, -52, 0.88 * HW, 7); g2.strokeStyle = INK; g2.lineWidth = 1; g2.strokeRect(0.5, -51.5, 0.88 * HW - 1, 51); }); p.alongY(0.06, 0.94, 0, g2 => { g2.fillStyle = '#8f9cc0'; g2.fillRect(0, -52, 0.88 * HW, 52); g2.fillStyle = '#b8c4e0'; g2.fillRect(2, -44, 0.88 * HW - 4, 30); g2.fillStyle = '#3f6fc8'; g2.fillRect(0, -52, 0.88 * HW, 7); g2.strokeStyle = INK; g2.lineWidth = 1; g2.strokeRect(0.5, -51.5, 0.88 * HW - 1, 51); }); drawBox(p, 0.88, 0.88, 0.06, 0.06, 52, '#c9d2e6'); }),
};
// Textures the engine lays over the ground: a cell-sized piece that repeats (two diamonds, as the cells lie).
const GROUND = {
  floor: (g, x, y) => { g.fillStyle = '#c6c3b8'; g.fillRect(x, y, 64, 32); const r = rng(77); for (let k = 0; k < 90; k++) { g.fillStyle = r() < 0.5 ? '#bcb9ad' : '#d0cdc2'; g.fillRect(x + ((r() * 64) | 0), y + ((r() * 32) | 0), 1 + ((r() * 2) | 0), 1); } g.save(); g.beginPath(); g.rect(x, y, 64, 32); g.clip(); g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + 16); g.lineTo(x + 32, y); g.lineTo(x + 64, y + 16); g.lineTo(x + 32, y + 32); g.closePath(); g.stroke(); g.restore(); },
  walkway: (g, x, y) => { g.fillStyle = '#efe7d2'; g.fillRect(x, y, 64, 32); g.save(); g.beginPath(); g.rect(x, y, 64, 32); g.clip(); g.fillStyle = '#f6f0df'; g.beginPath(); g.moveTo(x + 32, y + 1); g.lineTo(x + 62, y + 16); g.lineTo(x + 32, y + 31); g.lineTo(x + 2, y + 16); g.fill(); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x + 22, y + 9, 9, 1); g.fillRect(x + 54, y + 25, 7, 1); g.fillRect(x + 3, y + 25, 5, 1); g.strokeStyle = '#d2c7a6'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + 16); g.lineTo(x + 32, y); g.lineTo(x + 64, y + 16); g.lineTo(x + 32, y + 32); g.closePath(); g.stroke(); g.restore(); },
};

/**
 * The whole sheet for a game: { image, agent, buildings, tiles, ground, marker }, ready for game.setSprites(). Returns
 * null where the device cannot take a sheet this size (the engine's own placeholders then stay).
 * @param {object} o  { world, sim, units (by name, from mall.js), seated (names of the actions done sitting), maxSize }
 */
export function makeSprites({ world, sim, units, seated = [], pace = () => 30, maxSize = SHEET }) {
  if (maxSize < SHEET) return null;
  partCache = new Map();
  const jobs = [];                                                 // { w, h, paint(g, x, y) }, placed on shelves across the sheet
  const put = (w, h, paint) => { const j = { w: Math.ceil(w), h: Math.ceil(h), paint, x: 0, y: 0 }; jobs.push(j); return j; };

  const typeNames = sim.types.map(t => t.name);
  const agentJob = put(LOOKS * POSES * (AW + 1), sim.T * (AH + 1), (g, x0, y0) => { for (let t = 0; t < sim.T; t++) for (let v = 0; v < LOOKS; v++) for (let p = 0; p < POSES; p++) drawPerson(g, x0 + (v * POSES + p) * (AW + 1), y0 + t * (AH + 1), typeNames[t], v, p); });
  const sits = new Uint8Array(sim.A); for (const n of seated) sits[sim.actionIndex(n)] = 1;
  const thingJobs = Object.entries(FLOOR_THINGS).filter(([name]) => world.ids.has(name)).map(([name, t]) => [name, put(TILE.w, t.h, (g, x, y) => t.draw(g, x, y))]);
  const groundJobs = Object.entries(GROUND).map(([name, draw]) => [name, put(TILE.w, TILE.h, draw)]);
  const badJob = put(TILE.w, TILE.h, (g, x, y) => { g.fillStyle = '#c0432e'; for (let py = 0; py < TILE.h; py++) for (let px = 0; px < TILE.w; px++) if (((px >> 1) + (py >> 1)) % 2 === 0 && Math.abs(px + 0.5 - HW) / HW + Math.abs(py + 0.5 - HH) / HH <= 1) g.fillRect(x + px, y + py, 1, 1); });   // the same in red: "not here"
  const markerJob = put(TILE.w, TILE.h, (g, x, y) => { g.fillStyle = INK; for (let py = 0; py < TILE.h; py++) for (let px = 0; px < TILE.w; px++) if (((px >> 1) + (py >> 1)) % 2 === 0 && Math.abs(px + 0.5 - HW) / HW + Math.abs(py + 0.5 - HH) / HH <= 1) g.fillRect(x + px, y + py, 1, 1); });

  // rooms: for every unit and every way it can be turned, the shell and what stands in it
  const rooms = {};
  for (const p of world.prefabs) {
    const u = units[p.name], style = INSIDE[p.name];
    if (!u || !style || p.outdoor || p.flat || p.resize) continue;
    rooms[p.name] = [];
    for (let rot = 0; rot < 4; rot++) {
      const L = world.layout(p.name, 0, 0, rot), door = L.ey < 0 ? { side: 'N', at: L.ex } : L.ex < 0 ? { side: 'W', at: L.ey } : L.ey >= L.h ? { side: 'S', at: L.ex } : { side: 'E', at: L.ey };
      const R = Room(L.w, L.h, hash(p.name) + rot * 101);
      if (style.room !== 'gate') shell(R, u, door, { ...style.look, sign: style.sign });
      ROOMS[style.room](R, style, door);
      fill(R, (u.capacity ?? 0) + 2);
      const both = canvas(R.W, R.H * 2), bg = both.getContext('2d');   // the shell, and below it the shell with the lights out
      bg.drawImage(R.cv, 0, 0); bg.drawImage(R.cv, 0, R.H); bg.globalCompositeOperation = 'source-atop'; bg.fillStyle = DARK; bg.fillRect(0, R.H, R.W, R.H);
      const shellJob = put(R.W, R.H * 2, (g, x, y) => g.drawImage(both, x, y));
      for (const part of R.parts) part.made.job ??= put(part.made.cv.width, part.made.cv.height, (g, x, y) => g.drawImage(part.made.cv, x, y));
      // just inside the door: where someone coming in is first seen, and where they are last seen going out
      const inDoor = door.side === 'N' ? [door.at + 0.5, 0.3] : door.side === 'W' ? [0.3, door.at + 0.5] : door.side === 'S' ? [door.at + 0.5, L.h - 0.3] : [L.w - 0.3, door.at + 0.5];
      rooms[p.name][rot] = { R, shellJob, parts: null, door: inDoor };
    }
  }
  // shelves: tallest first, left to right
  let x = 0, y = 0, rowH = 0;
  for (const j of [...jobs].sort((a, b) => b.h - a.h)) { if (x + j.w > SHEET) { x = 0; y += rowH + 1; rowH = 0; } j.x = x; j.y = y; x += j.w + 1; rowH = Math.max(rowH, j.h); }
  const height = y + rowH + 1;
  if (height > maxSize) return null;
  const image = canvas(SHEET, height), g = image.getContext('2d');
  for (const j of jobs) j.paint(g, j.x, j.y);

  const tiles = {}, ground = {};
  for (const [name, j] of thingJobs) tiles[name] = { x: j.x, y: j.y, w: j.w, h: j.h };
  for (const [name, j] of groundJobs) ground[name] = { x: j.x, y: j.y, w: j.w, h: j.h };
  for (const rots of Object.values(rooms)) for (const room of rots) room.parts = room.R.parts.map(p => ({ x: p.made.job.x, y: p.made.job.y, w: p.w, h: p.h, ox: p.ox, oy: p.oy, key: p.key, frames: p.frames, frameMs: p.frameTicks * 33, shut: true }));

  // Where someone inside a unit is seen: staff at their posts, customers each at a place of their own while they are in.
  const at = [0, 0, 1, 0], isStaff = i => !!sim.staff && sim.staff[i] === 1, idOf = i => (sim.pid ? sim.pid[i] : i);
  const WALK = 1.7;                                                // cells a second, by the clock on the wall
  // How long, in real time, until person i finishes what they are doing (as the game is running now).
  const leftMs = i => {
    const rate = pace();
    return rate <= 0 ? Infinity : sim.ticksLeft(i) / rate * 1000;
  };
  function stand(b, i, tick) {
    const room = rooms[b.name]?.[b.rot];
    if (!room) return null;
    const seats = (b._seats ??= { staff: new Map(), spots: new Map(), swept: tick }), id = idOf(i);
    const staff = isStaff(i) && (seats.staff.has(id) || seats.staff.size < room.R.staff.length);   // staff beyond the posts drawn stand among the customers
    const list = staff ? room.R.staff : room.R.spots, m = staff ? seats.staff : seats.spots;
    if (!list.length) return null;
    let e = m.get(id);
    if (!e) {                                                      // a free place, starting from one that is theirs by number
      const taken = new Set(); for (const v of m.values()) taken.add(v.k);
      let k = (Math.imul(id + 1, 2654435761) >>> 0) % list.length;
      for (let n = 0; n < list.length && taken.has(k); n++) k = (k + 1) % list.length;
      e = { k, seen: tick, t0: clock.ms }; m.set(id, e);
    }
    if (!staff && tick - e.seen > 3) e.t0 = clock.ms;              // they went out and have come straight back in: from the door again
    e.seen = tick;
    if (tick - seats.swept > 60 || tick < seats.swept) { seats.swept = tick; for (const mm of [seats.staff, seats.spots]) for (const [p, v] of mm) if (tick - v.seen > 60 || v.seen > tick) mm.delete(p); }
    const s = list[e.k], now = clock.ms * 0.03;         // what people do inside goes by the clock on the wall, not by the game's speed: at 8× they do not blur
    let px = s.x, py = s.y, pose = 1;
    if (s.sit) pose = 2;
    else if (s.run) pose = 0;
    else if (s.to) {                                               // to and fro between two places, with a pause at each
      const P = 420 + (id % 5) * 60, ph = ((now + id * 53) % P) / P, t = ph < 0.38 ? 0 : ph < 0.5 ? (ph - 0.38) / 0.12 : ph < 0.88 ? 1 : 1 - (ph - 0.88) / 0.12;
      px += (s.to[0] - s.x) * t; py += (s.to[1] - s.y) * t; pose = t > 0 && t < 1 ? 0 : 1;
    } else if (staff) { const P = 600, ph = ((now + id * 97) % P) / P; if (ph > 0.8) { px += Math.sin((ph - 0.8) * 5 * Math.PI) * 0.22; pose = 0; } }   // staff move along their counter now and then
    // Nobody appears at their place or vanishes from it: they walk there from the door, and back to it in time to leave.
    const dx = s.x - room.door[0], dy = s.y - room.door[1], walkMs = Math.hypot(dx, dy) / WALK * 1000;
    if (walkMs > 50) {
      let p = (clock.ms - e.t0) / walkMs;
      if (!staff) { const left = leftMs(i); if (left < walkMs) p = Math.min(p, left / walkMs); }
      if (p < 1) { p = Math.max(0, p); px = room.door[0] + (px - room.door[0]) * p; py = room.door[1] + (py - room.door[1]) * p; pose = 0; }   // towards wherever they would be standing, so nothing jumps
    }
    at[0] = b.x + px; at[1] = b.y + py; at[2] = pose; at[3] = ((now / 6) | 0) + id;   // steps are paced like the movement
    return at;
  }

  const buildings = {};
  for (const [name, rots] of Object.entries(rooms)) buildings[name] = {
    w: rots[0].R.W, h: rots[0].R.H, levels: 1, frames: 1, open: true,
    rect: (level, frame, rot) => [rots[rot].shellJob.x, rots[rot].shellJob.y],
    closed: rot => [rots[rot].shellJob.x, rots[rot].shellJob.y + rots[rot].R.H],
    parts: rot => rots[rot].parts, stand,
  };
  return { image, buildings, tiles, ground, thumbs: makeThumbs(rooms, typeNames),
    agent: { w: AW, h: AH, frames: 4, variants: LOOKS, stills: 2,
      rect: (t, a, f, v, pose) => [agentJob.x + (v * POSES + (pose === 0 ? f : pose === 2 || sits[a] ? SIT : STAND)) * (AW + 1), agentJob.y + t * (AH + 1)] },
    marker: { x: markerJob.x, y: markerJob.y, w: TILE.w, h: TILE.h }, markerBad: { x: badJob.x, y: badJob.y, w: TILE.w, h: TILE.h } };
}

// ── small pictures for the page: every unit as its room, the things that go on the floor, a figure for each kind of person
const fit = (src, maxW, maxH) => { const k = Math.min(1, maxW / src.width, maxH / src.height), c = canvas(src.width * k, src.height * k), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/png'); };
function makeThumbs(rooms, typeNames) {
  const out = {};
  for (const [name, rots] of Object.entries(rooms)) {
    const R = rots[0].R, c = canvas(R.W, R.H), g = c.getContext('2d');
    g.drawImage(R.cv, 0, 0);
    for (const p of [...R.parts].sort((a, b) => a.key - b.key)) g.drawImage(p.made.cv, 0, 0, p.w, p.h, p.ox, p.oy, p.w, p.h);
    out[name] = fit(c, 132, 100);
  }
  const floorThing = names => { const h = Math.max(...names.map(n => FLOOR_THINGS[n].h)), c = canvas(names.length * 44 + 20, h + (names.length - 1) * 22), g = c.getContext('2d'); names.forEach((n, k) => FLOOR_THINGS[n].draw(g, k * 44, h - FLOOR_THINGS[n].h + k * 22)); return fit(c, 132, 100); };
  for (const n of Object.keys(FLOOR_THINGS)) out[n] = floorThing([n]);
  out.escalator = floorThing(['escalator up', 'escalator down']);
  { const c = canvas(128, 64), g = c.getContext('2d'); for (const [dx, dy] of [[32, 0], [0, 16], [64, 16], [32, 32]]) { g.save(); g.beginPath(); g.moveTo(dx + 32, dy); g.lineTo(dx + 64, dy + 16); g.lineTo(dx + 32, dy + 32); g.lineTo(dx, dy + 16); g.closePath(); g.clip(); GROUND.walkway(g, dx, dy); g.restore(); } out.walkway = fit(c, 132, 100); }
  { const c = canvas(150, 124), g = c.getContext('2d'), pen = Pen(g, 75, 78); for (let k = 0; k < 3; k++) drawBox(pen, 0, 0, 2, 2, 6, k === 2 ? '#e8a323' : '#c6c3b8', k === 2 ? { top: (g2, x, y, w, d) => { g2.fillStyle = '#f6f0df'; g2.fillRect(x + 0.9, y, 0.3, d); g2.fillRect(x, y + 0.9, w, 0.3); } } : {}, k * 22); out.floor = fit(c, 132, 100); }
  typeNames.forEach(t => { const c = canvas(AW + 2, AH + 2), g = c.getContext('2d'); drawPerson(g, 1, 1, t, 1, STAND); out['person:' + t] = c.toDataURL('image/png'); });
  return out;
}

/** Small signs for the things the page counts (money, rating, people…) and for its sections, as images. No game is needed. */
export function makeIcons() {
  const S = 32, out = {}, INK = '#5f6a88';       // a line that reads on a light page and on a dark one
  const icon = (name, draw) => { const c = canvas(S, S), g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g); out[name] = c.toDataURL('image/png'); };
  const disc = (g, x, y, r, fill, rim) => { g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fillStyle = fill; g.fill(); if (rim) { g.lineWidth = 2.5; g.strokeStyle = rim; g.stroke(); } };
  const person = (g, x, y, k, body, skin = '#f0c8a0') => { g.beginPath(); g.moveTo(x - 8 * k, y + 12 * k); g.quadraticCurveTo(x - 8 * k, y - 2 * k, x, y - 2 * k); g.quadraticCurveTo(x + 8 * k, y - 2 * k, x + 8 * k, y + 12 * k); g.closePath(); g.fillStyle = body; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke(); disc(g, x, y - 8 * k, 5 * k, skin, INK); };
  icon('money', g => { disc(g, 16, 16, 12, '#f2c744', '#a8780f'); disc(g, 16, 16, 8.5, '#f7d86a'); g.strokeStyle = '#a8780f'; g.lineWidth = 2.6; g.beginPath(); g.arc(17.5, 16, 5, 0.9, 5.4); g.stroke(); g.beginPath(); g.moveTo(10.5, 14.5); g.lineTo(17, 14.5); g.moveTo(10.5, 17.8); g.lineTo(16.5, 17.8); g.stroke(); });
  icon('star', g => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 6 : 13.5; g.lineTo(16 + Math.cos(a) * r, 17 + Math.sin(a) * r); } g.closePath(); g.fillStyle = '#f7c948'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#a8780f'; g.stroke(); });
  icon('people', g => { person(g, 10, 17, 0.85, '#e0739a'); person(g, 21, 17, 1, '#3f78c4'); });
  icon('staff', g => { person(g, 16, 17, 1.05, '#f6f6f6'); g.fillStyle = '#3c4250'; g.fillRect(12, 21, 8, 8); });
  icon('till', g => { g.fillStyle = '#e0739a'; g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(6, 12); g.lineTo(26, 12); g.lineTo(24, 28); g.lineTo(8, 28); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(11, 14); g.quadraticCurveTo(11, 4, 16, 4); g.quadraticCurveTo(21, 4, 21, 14); g.stroke(); });
  icon('stock', g => { g.fillStyle = '#c79a66'; g.strokeStyle = INK; g.lineWidth = 2.5; g.fillRect(5, 9, 22, 18); g.strokeRect(5, 9, 22, 18); g.fillStyle = '#e8d2a8'; g.fillRect(14, 9, 4, 18); g.beginPath(); g.moveTo(5, 15); g.lineTo(27, 15); g.stroke(); });
  icon('clock', g => { disc(g, 16, 16, 12, '#ffffff', INK); g.strokeStyle = INK; g.lineWidth = 2.6; g.beginPath(); g.moveTo(16, 9); g.lineTo(16, 16); g.lineTo(21, 19); g.stroke(); });
  icon('lock', g => { g.strokeStyle = '#6a7187'; g.lineWidth = 3; g.beginPath(); g.arc(16, 13, 6, Math.PI, 0); g.stroke(); g.fillStyle = '#aab2c0'; g.fillRect(8, 13, 16, 14); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(8, 13, 16, 14); g.fillStyle = INK; g.fillRect(15, 18, 2, 5); });
  icon('build', g => { g.strokeStyle = INK; g.lineWidth = 2.5; g.save(); g.translate(16, 16); g.rotate(-0.75); g.fillStyle = '#b99668'; g.fillRect(-2.5, -4, 5, 18); g.strokeRect(-2.5, -4, 5, 18); g.fillStyle = '#aab2c0'; g.fillRect(-10, -11, 20, 8); g.strokeRect(-10, -11, 20, 8); g.restore(); });
  icon('units', g => { g.strokeStyle = INK; g.lineWidth = 2.5; g.fillStyle = '#fbf9f3'; g.fillRect(5, 13, 22, 15); g.strokeRect(5, 13, 22, 15); for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#ffffff' : '#e0739a'; g.fillRect(4 + k * 6, 5, 6, 9); } g.strokeRect(4, 5, 24, 9); g.fillStyle = '#1f8a84'; g.fillRect(9, 18, 6, 10); g.fillStyle = '#9ad0ff'; g.fillRect(18, 18, 6, 5); });
  icon('policy', g => { g.strokeStyle = INK; g.lineWidth = 2.5; for (const [y, x] of [[8, 20], [16, 11], [24, 17]]) { g.beginPath(); g.moveTo(5, y); g.lineTo(27, y); g.stroke(); disc(g, x, y, 3.6, '#e8a323', INK); } });
  icon('goals', g => { g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(8, 4); g.lineTo(8, 28); g.stroke(); g.fillStyle = '#1f8a84'; g.beginPath(); g.moveTo(9, 5); g.lineTo(26, 9); g.lineTo(9, 16); g.closePath(); g.fill(); g.stroke(); });
  icon('more', g => { for (const x of [8, 16, 24]) disc(g, x, 16, 3, '#aab2c0', INK); });
  icon('move', g => { g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(16, 16); g.lineTo(16 + dx * 11, 16 + dy * 11); g.lineTo(16 + dx * 7 + dy * 3.5, 16 + dy * 7 + dx * 3.5); g.moveTo(16 + dx * 11, 16 + dy * 11); g.lineTo(16 + dx * 7 - dy * 3.5, 16 + dy * 7 - dx * 3.5); } g.stroke(); });
  icon('remove', g => { g.strokeStyle = '#c8402f'; g.lineWidth = 4; g.beginPath(); g.moveTo(8, 8); g.lineTo(24, 24); g.moveTo(24, 8); g.lineTo(8, 24); g.stroke(); });
  icon('door', g => { g.strokeStyle = INK; g.lineWidth = 2.5; g.fillStyle = '#b99668'; g.fillRect(9, 4, 14, 24); g.strokeRect(9, 4, 14, 24); disc(g, 19, 17, 1.6, '#f2c744', INK); });
  return out;
}
