// The Colony: drawing what moves and what lies about, from the art sheet, on the page's layer over the map.
// The ground itself is painted by view.js. Page code: it reads the game's state and draws; it changes nothing.
//
// Ants are drawn from the side. An ant walking along a floor stands on it and faces the way it goes; one going up
// or down a shaft is turned a quarter, its feet to the nearer wall. Each kind of ant is a row of seven frames:
// four of walking, two of working, one standing still.
//
// An ant on its way somewhere below ground may instead cross the back wall of the tunnel: it is then seen from above
// (a second row per kind, four frames of walking and one still), turned to the way it is heading and drawn where it
// really is, not down on the floor. Each ant changes its mind between the two every so often, on its own. Only an ant
// that is going somewhere does this: one that is idling about a room stays on its floor.
//
// Nothing an ant does may look like a jump or a blink. Where it is drawn follows where it should be drawn over a few
// frames (so a change of view, or stepping into a shaft, is a short slide), it only changes its mind about the back wall
// where that hardly moves it (a low tunnel, not the middle of a hall), pale ants carry a thin dark outline so they do
// not melt into the earth, and an ant that dies lies where it fell for a moment, fading, instead of vanishing.

const T = 12;
const hash = n => { let x = Math.imul(n | 0, 374761393) >>> 0; x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0; return ((x ^ (x >>> 16)) >>> 0) % 1000 / 1000; };

/**
 * @param {CanvasRenderingContext2D} g   the layer's context, already set to map pixels (a cell is 12)
 * @param {object} art                   from art.js
 * @param {object} d                     { nest, sim, world, roomsOpen: () => boolean }
 */
export function createPainter(g, art, d) {
  const { nest, sim, world } = d, { items, zones, ground, colony, weather, water, foes } = nest;
  const W = world.w, SURF = nest.SURFACE, img = art.image;
  const draw = (name, x, y) => { const r = art.at(name); if (r) g.drawImage(img, r[0], r[1], r[2], r[3], x, y, r[2], r[3]); return !!r; };
  const part = (name, sx, sy, w, h, x, y) => { const r = art.at(name); if (r && w > 0 && h > 0) g.drawImage(img, r[0] + sx, r[1] + sy, w, h, x, y, w, h); };
  const solidAt = c => world.solid[world.tiles[c]] === 1;
  const AIR = world.id('air'), WET = world.id('flooded');
  const earthAt = c => solidAt(c) && world.tiles[c] !== WET;
  const facing = new Int8Array(sim.capacity).fill(1), upward = new Int8Array(sim.capacity);
  const WORK = new Set(['dig', 'clear soil', 'fetch food', 'pick up eggs', 'pick up larvae', 'pick up pupae', 'fetch a meal', 'feed brood', 'feed the queen', 'tend garden', 'eat', 'lay', 'raid']);
  const working = sim.actions.map(a => WORK.has(a.name));
  const idle = sim.actions.map(a => a.name === 'wander');
  const SHEET = sim.types.map(t => 'ants/' + t.name.replace(' ', '_'));
  const TOP = SHEET.map(n => n + '_top');
  const sx = new Float32Array(sim.capacity), sy = new Float32Array(sim.capacity);   // where an ant on the back wall is drawn
  const lift = new Float32Array(sim.capacity), heading = new Float32Array(sim.capacity);   // 0 on the floor .. 1 on the back wall; where it points there
  const onWall = i => hash(i * 7919 + ((sim.tick + i * 173) >> 8)) < 0.45;                  // its mind for the next eight seconds or so
  // Where each ant was drawn last frame (map pixels, the middle of its body), eased towards where it should be.
  const dX = new Float32Array(sim.capacity), dY = new Float32Array(sim.capacity), drawn = new Uint8Array(sim.capacity);
  // The back wall is always somewhere an ant can be, so leaving it is never urgent: it waits for two seconds of firm footing.
  const footFor = new Uint8Array(sim.capacity), HOLD = 120, upSign = new Int8Array(sim.capacity);
  const lostFor = new Uint8Array(sim.capacity), LOST = 12;       // frames in a row with nothing under it, before it is shown on the back wall       // frames in a row it has had something under its feet
  const EASE = 0.35, SNAP = 6 * T;                               // a gap wider than six cells is a real move (or another ant in the slot): no slide
  const ease = (i, tx, ty) => {
    if (!drawn[i] || Math.abs(tx - dX[i]) + Math.abs(ty - dY[i]) > SNAP) { dX[i] = tx; dY[i] = ty; drawn[i] = 1; }
    else { dX[i] += (tx - dX[i]) * EASE; dY[i] += (ty - dY[i]) * EASE; }
  };
  // A dark outline for the pale kinds (the young are nearly the colour of the earth): the sprite's edge, one pixel out.
  const outlines = new Map();
  function outlineOf(name) {
    if (outlines.has(name)) return outlines.get(name);
    const r = art.at(name);
    let out = null;
    if (r) {
      const c = document.createElement('canvas'); c.width = r[2]; c.height = r[3];
      const cg = c.getContext('2d'); cg.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
      const src = cg.getImageData(0, 0, r[2], r[3]), dst = cg.createImageData(r[2], r[3]), a = (x, y) => (x < 0 || y < 0 || x >= r[2] || y >= r[3] ? 0 : src.data[(y * r[2] + x) * 4 + 3]);
      let lum = 0, n = 0;
      for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) {
        const k = (y * r[2] + x) * 4;
        if (src.data[k + 3]) { lum += src.data[k] * 0.3 + src.data[k + 1] * 0.59 + src.data[k + 2] * 0.11; n++; continue; }
        if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) { dst.data[k] = 26; dst.data[k + 1] = 16; dst.data[k + 2] = 10; dst.data[k + 3] = 200; }
      }
      if (n && lum / n > 90) { cg.clearRect(0, 0, r[2], r[3]); cg.putImageData(dst, 0, 0); out = c; }   // only the pale ones need it
    }
    outlines.set(name, out);
    return out;
  }
  // Ants that have just died: { x, y, sheet, face, t } (map pixels of the feet), drawn still and fading.
  const fallen = [], FADE = 150;                                 // frames: about two and a half seconds
  const P = {};
  /** For looking at from the console: where ant i was last drawn ([x, y] in map pixels) and whether it is on the back wall. */
  P.where = i => [dX[i], dY[i], lift[i] > 0.5];
  P.fallen = () => fallen.length;
  /** Ant i is about to be taken out of the game (call from the simulation's onGone): if it died, it is seen lying there a moment. */
  P.gone = (i, cause) => {
    if (cause === 'flew' || cause === 'left' || !drawn[i]) return;   // a princess on her flight, a raider gone home: nothing is left behind
    fallen.push({ x: dX[i], y: dY[i], sheet: SHEET[sim.type[i]], face: facing[i], t: 0 });
    drawn[i] = 0; drawn[sim.count - 1] = 0;                      // the last ant moves into its slot, and that slot is free for a newcomer
  };

  /** Call first each frame: pixels stay hard however the layer is scaled. */
  P.begin = () => { g.imageSmoothingEnabled = false; };

  /** The sky as it is now (the ground is painted with the day's), then the grass along the colony's surface. */
  P.sky = (x0, x1) => {
    const dusk = !weather.isNight && weather.hour > 1 - nest.WEATHER.night - 0.07;
    const name = weather.now === 'rain' ? 'sky_rain' : weather.isNight ? 'sky_night' : weather.now === 'heat' ? 'sky_heat' : dusk ? 'sky_dusk' : null;
    const r = name && art.at('ground/' + name);
    if (r) for (let x = x0; x <= x1; x++) {                       // drawn a hair wider and taller than its cells, so no line of the day's sky shows at their edges
      const h = Math.min(r[3], (SURF + 1) * T);
      g.drawImage(img, r[0] + (x * T) % r[2], r[1], T, h, x * T, 0, T + 0.5, h + 0.75);
    }
    for (let x = x0; x <= x1; x++) {
      const c = SURF * W + x;
      if (world.tiles[c] === AIR && solidAt(c + W)) draw('ground/grass_' + (1 + ((hash(x * 7 + 3) * 6) | 0)), x * T, SURF * T);
    }
  };

  /** What lies on one cell: its room, what is stored or dropped there, a mark, the top of standing water. */
  P.cell = (x, y, c) => {
    const X = x * T, Y = y * T;
    if (ground.marked[c]) {
      const p = ground.progress(c);
      if (p > 0) { g.fillStyle = `rgba(20,12,8,${p * 0.5})`; g.fillRect(X, Y, T, T); }
      draw('things/mark', X, Y);
    }
    if (world.tiles[c] === WET) { if (world.tiles[c - W] !== WET && !water.filling(c - W)) draw('ground/water_top_' + (1 + ((sim.tick >> 4) + x) % 4), X, Y); return; }
    const deep = water.filling(c);                               // the row the water's surface is in: shallow water over the floor, rising
    if (deep > 0) {
      const h = Math.max(1, Math.round(deep * T));
      g.fillStyle = nest.WATER.color; g.globalAlpha = 0.8; g.fillRect(X, Y + T - h, T, h); g.globalAlpha = 1;
      g.fillStyle = '#a9cde8'; g.fillRect(X + ((sim.tick >> 4) + x) % 3, Y + T - h, T - 3, 1);
    }
    const zone = zones.at(c);
    if (zone) {                                                  // a room is known by what is in it; its colour shows only as a line along its floor
      const col = nest.ROOMS[zone].color;
      if (d.roomsOpen()) { g.globalAlpha = 0.35; g.fillStyle = col; g.fillRect(X, Y, T, T); g.globalAlpha = 1; }
      if (solidAt(c + W)) { g.globalAlpha = 0.8; g.fillStyle = col; g.fillRect(X, Y + T - 1, T, 1); g.globalAlpha = 1; }
      if (zone === 'garden' && solidAt(c + W)) draw('things/fungus_' + colony.ripeness(c), X, Y);   // fungus grows on a floor
    }
    const soil = items.at('soil', c), crumbs = items.at('crumb', c);
    if (soil) {
      if (y === SURF) {                                          // the mound: one heap, its top running smoothly from each cell's height to the next
        const H = n => Math.min(n * 2, SURF * T - 6), h0 = H(soil), hl = H(items.at('soil', c - 1)), hr = H(items.at('soil', c + 1));
        for (let lx = 0; lx < T; lx++) {
          const t = (lx + 0.5) / T, far = Math.abs(t - 0.5) * 2;                      // 0 at the cell's middle, 1 at its edge
          const side = t < 0.5 ? hl : hr, edge = side > 0 ? (h0 + side) / 2 : 0;       // meets its neighbour half way; falls to the ground where there is none
          const h = Math.max(1, Math.round(h0 + (edge - h0) * far * far + (hash(x * 131 + lx) - 0.5) * 2));
          let top = Y + T - h;                                                        // the texture is taken where the pixel is on the map, so the heap is one piece
          while (top < Y + T + 1) { const sy = ((top % 48) + 48) % 48, n = Math.min(48 - sy, Y + T + 1 - top); part('ground/mound', (X + lx) % 48, sy, 1, n, X + lx, top); top += n; }   // one pixel into the ground, so no sky shows under it
        }
      } else draw('things/soil_' + Math.min(4, Math.ceil(soil / 2)), X, Y);
    }
    if (crumbs) {
      if (y === SURF) draw('things/find_' + (crumbs <= 4 ? 1 : crumbs <= 10 ? 2 : crumbs <= 18 ? 3 : 4), X, Y);
      else draw('things/crumbs_' + Math.min(8, Math.ceil(crumbs * 8 / Math.max(8, items.limit('crumb', c)))), X, Y);   // how full the cell is
    }
    const e = items.at('egg', c), l = items.at('larva', c), p = items.at('pupa', c);
    if (e) draw('things/eggs_' + Math.min(3, e), X, Y);
    if (l) draw('things/larvae_' + Math.min(3, l), X + 4, Y);
    if (p) draw('things/pupae_' + Math.min(3, p), X + 8, Y);
  };

  /** Every ant, and what it carries. */
  P.ants = () => {
    const { px, py, vx, vy, type, using, action, count } = sim, walk = sim.tick >> 2;
    for (let k = fallen.length - 1; k >= 0; k--) {               // the dead: on their backs where they fell, fading out
      const f = fallen[k], r = art.at(f.sheet);
      if (++f.t > FADE || !r) { fallen.splice(k, 1); continue; }
      const fw = r[2] / 7, fh = r[3];
      g.save(); g.globalAlpha = 1 - f.t / FADE;
      g.translate(Math.round(f.x), Math.round(f.y)); g.scale(f.face < 0 ? -1 : 1, -1);   // turned over where its body was: legs up
      g.drawImage(img, r[0] + 6 * fw, r[1], fw, fh, -fw / 2, -fh / 2, fw, fh);
      g.restore();
    }
    for (let i = 0; i < count; i++) {
      const r = art.at(SHEET[type[i]]);
      const x = px[i], y = py[i], cx = x | 0, cy = y | 0, c = cy * W + cx;
      const ax = Math.abs(vx[i]), ay = Math.abs(vy[i]);
      if (ax + ay > 0.004) {                                     // it is moving: which way it faces, and which way it would climb
        if (ax >= ay * 0.8) facing[i] = vx[i] < 0 ? -1 : 1;
        if (ay > ax * 0.8) upSign[i] = vy[i] < 0 ? -1 : 1;
      }
      if (!r) { g.fillStyle = '#140a07'; g.fillRect(x * T - 3, y * T - 2, 7, 4); continue; }
      const fw = r[2] / 7, fh = r[3];
      // on the back wall or on the floor: only one that is walking, below ground, has the choice
      const rt = art.at(TOP[type[i]]);
      let fy = cy;                                               // the floor of the room it is in: the first solid ground under it, if that is near
      while (fy < cy + 4 && !solidAt((fy + 1) * W + cx)) fy++;
      const floored = earthAt((fy + 1) * W + cx), walled = earthAt(c + 1) || earthAt(c - 1);   // water is nothing to stand on
      const hangs = using[i] && !floored && walled;              // at rest over a drop: it holds on to the wall, never stands on air
      // Climbing is where it is, not which way it happens to be moving: a wall beside it and no floor in its own cell.
      // (Taken from its steps, an ant jostled sideways in a shaft would lose its grip a few times a second.)
      const onFloor = floored && fy + 1 - y < 1.3;                // the floor is right under it (a little leeway for jostling), not somewhere below
      upward[i] = walled && !onFloor ? (upSign[i] || -1) : 0;
      // Seen from the side an ant must have something under its feet: a floor to walk along, a wall to climb. With
      // neither (the middle of a wide shaft, high in a hall, along a ceiling) it can only be on the back wall, where it
      // really is: drawn down on a floor cells below, it would pop between the two.
      const footing = upward[i] && (!using[i] || hangs) ? walled : using[i] ? floored : onFloor;
      const choice = !using[i] && !idle[action[i]] && onWall(i);  // one with nothing to do keeps to the floor: milling about on the wall, it looks lost
      const want = rt && cy > SURF && (choice || !footing) ? 1 : 0;
      // An ant seen from the side is never off its floor, so a change of view moves it from the floor to where it really
      // is. It may change only where that is a small step (a low tunnel), unless it must: nothing under its feet, or at work.
      // Footing flickers as an ant climbs (a wall beside one cell and not the next), so it goes back to its floor only after
      // it has had footing for a while; onto the back wall it goes at once when it has none.
      const floorMid = onFloor || (using[i] && floored) ? (fy + 1) * T - fh / 2 : y * T, small = Math.abs(floorMid - y * T) < 5;
      footFor[i] = footing ? Math.min(255, footFor[i] + 1) : 0;
      lostFor[i] = footing ? 0 : Math.min(255, lostFor[i] + 1);
      if (!drawn[i]) lift[i] = want;
      else if (want && !lift[i]) { if (lostFor[i] >= LOST || (footing && small)) lift[i] = 1; }
      else if (!want && lift[i]) { if (footFor[i] >= HOLD && (small || using[i])) lift[i] = 0; }
      if (lift[i] && !rt) lift[i] = 0;
      if (lift[i] > 0.5) {
        const tw = rt[2] / 5, th = rt[3];
        // It is drawn on a path that follows its place smoothly (the steps from cell to cell rounded off), and it
        // points along that path: where it is drawn going is always where it faces, never sideways.
        if (Math.abs(x - sx[i]) + Math.abs(y - sy[i]) > 3) { sx[i] = x; sy[i] = y; }
        const mx = (x - sx[i]) * 0.2, my = (y - sy[i]) * 0.2;
        sx[i] += mx; sy[i] += my;
        if (Math.abs(mx) + Math.abs(my) > 0.0015) {
          let da = Math.atan2(my, mx) - heading[i];
          da -= Math.round(da / 6.2832) * 6.2832; heading[i] += da * 0.5;
        }
        const side = (hash(i * 31 + 7) - 0.5) * 5;               // each keeps its own line, a little off the middle (a fixed shift: one that turned with it would slide it sideways)
        ease(i, sx[i] * T + side, sy[i] * T + (hash(i * 57 + 11) - 0.5) * 5);
        const line = outlineOf(TOP[type[i]]), f = ax + ay > 0.004 ? (walk + i) % 4 : 4;
        g.save();
        g.translate(Math.round(dX[i]), Math.round(dY[i]));
        g.rotate(heading[i]);
        if (line) g.drawImage(line, f * tw, 0, tw, th, -tw / 2, -th / 2, tw, th);
        g.drawImage(img, rt[0] + f * tw, rt[1], tw, th, -tw / 2, -th / 2, tw, th);
        const held = items.carrying(i);
        if (held) draw('things/carry_' + held, tw / 2 - 5, -2);
        g.restore();
        if (foes.engaged[i]) { g.fillStyle = '#e0261a'; g.fillRect(dX[i] - 3, dY[i] - th / 2 - 4, 7, 1); g.fillRect(dX[i], dY[i] - th / 2 - 7, 1, 7); }
        continue;
      }
      heading[i] = facing[i] < 0 ? Math.PI : 0; sx[i] = x; sy[i] = y;
      const frame = using[i] ? (working[action[i]] ? 4 + ((walk >> 1) + i) % 2 : 6) : ax + ay > 0.004 ? (walk + i) % 4 : 6;
      const line = outlineOf(SHEET[type[i]]);
      g.save();
      if (upward[i] && (!using[i] || hangs)) {                   // in a shaft: turned a quarter, feet to a wall
        const wallRight = earthAt(c + 1), wallLeft = earthAt(c - 1);
        const right = wallRight || !wallLeft;
        ease(i, wallRight ? (cx + 1) * T : wallLeft ? cx * T : x * T, y * T);
        g.translate(dX[i], dY[i]);
        g.rotate(upward[i] < 0 ? -Math.PI / 2 : Math.PI / 2);
        if ((upward[i] < 0) !== right) g.scale(1, -1);
      } else {
        ease(i, x * T, floorMid);                                // it stands on that floor
        g.translate(dX[i], dY[i] + fh / 2);
        if (facing[i] < 0) g.scale(-1, 1);
      }
      if (line) g.drawImage(line, frame * fw, 0, fw, fh, -fw / 2, -fh, fw, fh);
      g.drawImage(img, r[0] + frame * fw, r[1], fw, fh, -fw / 2, -fh, fw, fh);
      const load = items.carrying(i);
      if (load) draw('things/carry_' + load, fw / 2 - 8, -fh * 0.62);          // in its jaws, just ahead of its head
      if (foes.engaged[i]) { g.fillStyle = '#e0261a'; g.fillRect(-3, -fh - 4, 7, 1); g.fillRect(0, -fh - 7, 1, 7); }   // in a fight
      g.restore();
    }
  };

  /** Rain falling over the colony's surface. */
  P.rain = (x0, x1) => {
    if (weather.now !== 'rain') return;
    for (let x = x0; x <= x1; x++) for (let yy = 0; yy < SURF * T; yy += 24) draw('things/rain_' + (1 + ((sim.tick >> 3) + x + (yy >> 3)) % 2), x * T, yy + ((sim.tick * 2 + x * 5) % 12));
  };
  void water;
  return P;
}
