// The isometric view. Buildings, tall tiles and agents are all instances of the same quad, drawn in a
// single call by the shared core (quads.js); the depth buffer does the back-to-front ordering.
//
// Projection of a grid position (x, y) to view pixels:
//   wx = (x - y) * tileW/2 + originX        wy = (x + y) * tileH/2
//
// A building is one image for its whole footprint, chosen by how full the building is. It is drawn as
// vertical strips half a tile wide, each with its own depth, so agents walking past any side of it
// are hidden or shown correctly. Agents inside a building are not drawn at all, except in an `outdoor`
// one (a field, a yard), where they are shown spread over its footprint, and for a moment at its door
// as they go in and come out (`view.doorLinger`).

import { View, INST } from '../../shared/engine/view.js';
import { mixHex as mix } from '../../shared/engine/quads.js';
import { placeholderSprites } from '../../shared/engine/placeholder.js';

const MAX_PREVIEW = 4096;

export class Renderer extends View {
  /**
   * @param {HTMLCanvasElement} canvas  its width/height attributes set the render resolution
   * @param {import('../../shared/engine/world.js').World} world
   * @param {import('../../shared/engine/sim.js').Sim} sim
   * @param {{tileW?:number, tileH?:number, background?:string, ink?:string, minZoom?:number, maxZoom?:number, maxGroundSize?:number}} [view]
   */
  constructor(canvas, world, sim, view = {}) {
    const tw = view.tileW ?? 16, th = view.tileH ?? 8;
    super(canvas, world, sim, view, (world.w + world.h) * tw / 2, (world.w + world.h) * th / 2);
    this.tw = tw; this.th = th; this.hw = tw / 2; this.hh = th / 2;
    this.isoW = this.mapW; this.isoH = this.mapH;
    this.originX = world.h * this.hw;
    this.sortByDepth = true; this.zmax = this.isoH + th;
    this.staticData = new Float32Array(0); this.staticCount = 0;   // tall plain tiles, rebuilt when the map changes
    this._stripTotal = 0;
    /** The part of the grid that is drawn, in cells { x0, y0, x1, y1 } (inclusive), or null for all of it (see setRegion). */
    this.region = null;
  }

  /**
   * Draw only one part of the grid: a rectangle of cells { x0, y0, x1, y1 }, inclusive (null: all of it again). The ground
   * outside it is left as background, and buildings, tall tiles and agents outside it are not drawn. The camera is kept to
   * it (see setBounds), with `pad` view pixels of room around. For a map that holds several places side by side and
   * shows one at a time.
   */
  setRegion(r, pad = 0) {
    this.region = r;
    this._worldVersion = -1;                                     // the ground is repainted
    const { hw, hh, originX } = this;
    this.setBounds(r ? { x0: (r.x0 - r.y1 - 1) * hw + originX - pad, x1: (r.x1 + 1 - r.y0) * hw + originX + pad,
                         y0: (r.x0 + r.y0) * hh - pad, y1: (r.x1 + r.y1 + 2) * hh + pad } : null);
  }

  /** A generated sprite sheet for this view, for games that have no art yet. */
  placeholders() { return placeholderSprites({ world: this.world, sim: this.sim, tileW: this.tw, tileH: this.th, ink: this.outline }); }

  /** Canvas pixel → position on the grid, in cells with fractions. */
  screenToGrid(sx, sy) {
    const [vx, vy] = this._unproject(sx, sy);
    const a = (vx - this.originX) / this.hw, b = vy / this.hh;
    return [(a + b) / 2, (b - a) / 2];
  }
  /** Canvas pixel → grid cell [x, y] (may be outside the map). */
  screenToCell(sx, sy) { const [x, y] = this.screenToGrid(sx, sy); return [Math.floor(x), Math.floor(y)]; }
  /** How far up the screen a standing figure's middle is from its feet, as a shift on the grid (for picking people). */
  get figureLift() { return this.agentH / 2 / this.th; }

  // ── ground texture + tall plain tiles, redone when the map changes
  _rebuildStatic() {
    const { world, hw, hh, th, originX } = this;
    const g = this.ground.getContext('2d', { alpha: false });
    g.setTransform(this.groundScale, 0, 0, this.groundScale, 0, 0);
    const quad = (x, y, w, h) => {
      g.beginPath();
      g.moveTo((x - y) * hw + originX, (x + y) * hh); g.lineTo((x + w - y) * hw + originX, (x + w + y) * hh);
      g.lineTo((x + w - y - h) * hw + originX, (x + w + y + h) * hh); g.lineTo((x - y - h) * hw + originX, (x + y + h) * hh);
      g.closePath(); g.fill();
    };
    const floor = world.defs[0], fill = (key, color) => this._groundFill(g, key, color);
    const textured = !!this.groundRects?.floor;
    g.fillStyle = this.background; g.fillRect(0, 0, this.isoW, this.isoH);
    g.fillStyle = fill('floor', floor.color); quad(0, 0, world.w, world.h);       // the solid edge cells are painted as floor: the map just ends
    if (floor.color2 && !textured) {
      g.fillStyle = floor.color2;
      for (let y = 0; y < world.h; y += 4) for (let x = 0; x < world.w; x += 4) if (((x + y) >> 2) & 1) quad(x, y, 4, 4);
    }
    // Plain tiles: a sprite if the tile has one, else its colour on the ground. Neighbours of the same kind along a
    // row are painted as one strip, so a forest or a lake costs a few fills, not one per cell.
    const tall = [], W = world.w, reg = this.region;
    for (let y = 0; y < world.h; y++) {
      let from = 0, kind = 0;
      for (let x = 0; x <= W; x++) {
        const c = y * W + x, t = x < W && world.bldAt[c] < 0 ? world.tiles[c] : 0;
        let sp = t ? this.tileSprite[t] : null;
        let jx = 0, jy = 0;
        if (sp && (sp.length || sp.jitter)) {                      // a cell's own number: which of several sprites, and how far off-centre
          let n = Math.imul(x, 73856093) ^ Math.imul(y, 19349663); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n = (n ^ (n >>> 15)) >>> 0;
          if (sp.length) sp = sp[n % sp.length];
          if (sp.jitter) { jx = ((n >>> 8) % 1024 / 1024 - 0.5) * sp.jitter; jy = ((n >>> 18) % 1024 / 1024 - 0.5) * sp.jitter * 0.5; }
        }
        if (sp && (!reg || (x >= reg.x0 && x <= reg.x1 && y >= reg.y0 && y <= reg.y1))) tall.push((x - y) * hw + originX - sp.w / 2 + jx, (x + y) * hh + th - sp.h + jy, sp.w, sp.h, sp.x, sp.y, (x + y + 1) * hh + jy, 0);   // its base diamond sits on the cell
        const paint = t && (this.groundRects?.[world.defs[t].name] || (!sp && world.defs[t].color)) ? t : 0;
        if (paint !== kind) {
          if (kind) { g.fillStyle = fill(world.defs[kind].name, world.defs[kind].color); quad(from, y, x - from, 1); }
          from = x; kind = paint;
        }
      }
    }
    this.staticData = Float32Array.from(tall); this.staticCount = tall.length / INST;
    // Buildings: a doormat on the entry (and exit) cell, and a base under the footprint. A building with no
    // sprite is painted flat in its colour, faded while closed.
    this._stripTotal = 0;
    g.lineWidth = 1; g.strokeStyle = this.outline;
    for (const b of world.buildings) {
      if (!b) continue;
      const col = b.color ?? world.defs[b.tile].color ?? '#b0aea4';   // a building may carry a colour of its own
      const R = this.groundRects, own = R && (R[b.ground] ? b.ground : R[b.name] ? b.name : null);   // a texture for this building's ground
      if (b.xx !== b.ex || b.xy !== b.ey) { g.fillStyle = fill('entry', mix(col, floor.color, 0.6)); quad(b.xx, b.xy, 1, 1); }
      g.fillStyle = fill('entry', col); quad(b.ex, b.ey, 1, 1);
      if (this.bSprite[b.tile]) {
        this._stripTotal += b.w + b.h;
        g.fillStyle = own ? fill(own) : fill('base', mix(col, this.outline, 0.45)); quad(b.x, b.y, b.w, b.h);
        continue;
      }
      if (own) { g.fillStyle = fill(own); if (!b.open) g.globalAlpha = 0.5; quad(b.x, b.y, b.w, b.h); g.globalAlpha = 1; continue; }
      g.fillStyle = b.open ? col : mix(col, floor.color, 0.7);
      quad(b.x, b.y, b.w, b.h);
      g.globalAlpha = b.open ? 0.55 : 0.25; g.stroke(); g.globalAlpha = 1;
    }
    if (reg) {                                                   // only a part of the grid is shown: the rest goes back to background
      const x = reg.x0, y = reg.y0, w = reg.x1 - reg.x0 + 1, h = reg.y1 - reg.y0 + 1;
      g.fillStyle = this.background; g.beginPath(); g.rect(0, 0, this.isoW, this.isoH);
      g.moveTo((x - y) * hw + originX, (x + y) * hh); g.lineTo((x + w - y) * hw + originX, (x + w + y) * hh);
      g.lineTo((x + w - y - h) * hw + originX, (x + w + y + h) * hh); g.lineTo((x - y - h) * hw + originX, (x + y + h) * hh);
      g.closePath(); g.fill('evenodd');
    }
  }

  _fill(alpha) {
    const { sim, world, hw, hh, originX } = this;
    const N = sim.count, nPreview = this.marker ? Math.min(this.preview.length, MAX_PREVIEW) : 0;
    let stripMax = this._stripTotal;
    if (this._worldVersion !== world.version) { stripMax = 0; for (const b of world.buildings) if (b) stripMax += b.w + b.h; }   // repaint was postponed
    let partMax = 0;                                              // buildings shown as a room: each thing in it is a quad of its own
    for (const b of world.buildings) if (b) { const sp = this.bSprite[b.tile]; if (sp && sp.parts) partMax += sp.parts(b.rot).length; }
    const gh = this.ghost, ghSp = gh ? this.bSprite[gh.tile] : null;
    const inst = this.batch.ensure(1 + this.staticCount + stripMax + partMax + N + nPreview + (ghSp ? gh.w + gh.h : 0));
    inst.set(this.staticData, INST);
    let o = (1 + this.staticCount) * INST;

    // Buildings: pick the image for the current crowd level, then cut it into depth-sorted strips.
    const tick = sim.tick, reg = this.region;
    for (const b of world.buildings) {
      if (!b || (reg && (b.x > reg.x1 || b.x + b.w <= reg.x0 || b.y > reg.y1 || b.y + b.h <= reg.y0))) continue;   // gone, or outside the part shown
      const sp = this.bSprite[b.tile];
      if (!sp) continue;
      const at = this._buildingImage(b, sp, tick);
      const n = b.w + b.h, u0 = b.x - b.y - b.h, left = u0 * hw + originX, top = (b.x + b.w + b.y + b.h) * hh - sp.h;
      for (let j = 0; j < n; j++) {
        // Along this strip the footprint spans a range of depths; agents are either wholly behind it or wholly in front.
        const u = u0 + j + 0.5;
        const sMin = Math.max(2 * b.x - u, 2 * b.y + u), sMax = Math.min(2 * (b.x + b.w) - u, 2 * (b.y + b.h) + u);
        inst[o] = left + j * hw; inst[o + 1] = top; inst[o + 2] = hw; inst[o + 3] = sp.h;
        // A room seen from inside (`open`) lies behind everything that stands in it: its strips take the depth of its back edge.
        inst[o + 4] = at[0] + j * hw; inst[o + 5] = at[1]; inst[o + 6] = (sp.open ? sMin : (sMin + sMax) * 0.5) * hh; inst[o + 7] = 0;
        o += INST;
      }
      if (sp.parts) {                                              // what stands in the room, each at its own depth
        const parts = sp.parts(b.rot), base = b.x + b.y;
        for (let k = 0; k < parts.length; k++) {
          const p = parts[k];
          inst[o] = left + p.ox; inst[o + 1] = top + p.oy; inst[o + 2] = p.w; inst[o + 3] = p.h;
          inst[o + 4] = p.x + (p.frames > 1 ? ((p.frameMs ? (this.clockMs ?? performance.now()) / p.frameMs : tick / (p.frameTicks ?? 8)) | 0) % p.frames * p.w : 0);   // `frameMs`: by the clock, whatever the game's speed
          inst[o + 5] = p.y + (!b.open && p.shut ? p.h : 0);
          inst[o + 6] = (base + p.key) * hh; inst[o + 7] = 0;
          o += INST;
        }
      }
    }

    if (ghSp) {                                                   // a building being placed: its image where it would stand
      const at = ghSp.rect(0, 0, gh.rot), n = gh.w + gh.h, u0 = gh.x - gh.y - gh.h, left = u0 * hw + originX, top = (gh.x + gh.w + gh.y + gh.h) * hh - ghSp.h;
      for (let j = 0; j < n; j++) {
        const u = u0 + j + 0.5, sMin = Math.max(2 * gh.x - u, 2 * gh.y + u), sMax = Math.min(2 * (gh.x + gh.w) - u, 2 * (gh.y + gh.h) + u);
        inst[o] = left + j * hw; inst[o + 1] = top; inst[o + 2] = hw; inst[o + 3] = ghSp.h;
        inst[o + 4] = at[0] + j * hw; inst[o + 5] = at[1]; inst[o + 6] = (ghSp.open ? sMin : (sMin + sMax) * 0.5) * hh; inst[o + 7] = 0;
        o += INST;
      }
    }

    const { px, py, vx, vy, type, action, using, inside } = sim, A = sim.A, fr = this.frames, uv = this.agentUV;
    const back = 1 - Math.max(0, Math.min(1, alpha));           // how much of the last step is still to be shown
    const aw = this.agentW, ah = this.agentH, walk = tick >> 2;
    const B = world.buildings, slow = tick >> 4;
    for (let i = 0; i < N; i++) {
      let x, y, f, still;
      if (inside[i] >= 0) {
        const b = B[inside[i]];
        if (!b) continue;
        const sp = this.bSprite[b.tile], at = sp && sp.stand ? sp.stand(b, i, tick) : null;   // the art may say where someone inside is seen
        if (at) {
          x = at[0]; y = at[1]; still = at[2] ?? 1; f = still ? 0 : at[3] !== undefined ? at[3] % fr : (walk + i) % fr;   // the art may name the frame itself
          if (reg && (x < reg.x0 || x >= reg.x1 + 1 || y < reg.y0 || y >= reg.y1 + 1)) continue;
          const ay = (x + y) * hh, u = this._agentUV(i, f, still);
          inst[o] = (x - y) * hw + originX - aw / 2; inst[o + 1] = ay - ah; inst[o + 2] = aw; inst[o + 3] = ah;
          inst[o + 4] = uv[u]; inst[o + 5] = uv[u + 1]; inst[o + 6] = ay; inst[o + 7] = 0;
          o += INST;
          continue;
        }
        if (!b.prefab.outdoor) {                                  // inside a building: the building's own image shows the crowd
          const d = this._atDoor(b, i);                           // unless they have only just gone in, or are about to come out
          if (!d) continue;
          x = d[0]; y = d[1]; f = 0; still = 1;
        } else {
          // out in the open: each person keeps a spot of their own on the footprint and shuffles about it
          x = b.x + 0.4 + ((i * 0.6180339887) % 1) * (b.w - 0.8) + Math.sin(tick * 0.02 + i) * 0.25;
          y = b.y + 0.4 + ((i * 0.7548776662) % 1) * (b.h - 0.8) + Math.cos(tick * 0.017 + i * 1.7) * 0.25;
          f = (slow + i) % fr; still = 1;
        }
      } else { x = px[i] - vx[i] * back; y = py[i] - vy[i] * back; still = using[i]; f = still ? 0 : (walk + i) % fr; }
      if (reg && (x < reg.x0 || x >= reg.x1 + 1 || y < reg.y0 || y >= reg.y1 + 1)) continue;   // outside the part shown
      const ay = (x + y) * hh;
      const u = this._agentUV(i, f, still);
      inst[o] = (x - y) * hw + originX - aw / 2; inst[o + 1] = ay - ah; inst[o + 2] = aw; inst[o + 3] = ah;
      inst[o + 4] = uv[u]; inst[o + 5] = uv[u + 1];
      inst[o + 6] = ay; inst[o + 7] = 0;                          // feet lower on screen = closer to the camera
      o += INST;
    }
    if (nPreview) {                                               // build preview: one ground marker per cell
      const m = this.previewBad && this.markerBad ? this.markerBad : this.marker;
      for (let k = 0; k < nPreview; k++) {
        const x = this.preview[k][0], y = this.preview[k][1];
        inst[o] = (x - y) * hw + originX - m.w / 2; inst[o + 1] = (x + y) * hh + this.th - m.h; inst[o + 2] = m.w; inst[o + 3] = m.h;
        inst[o + 4] = m.x; inst[o + 5] = m.y; inst[o + 6] = (x + y) * hh; inst[o + 7] = 0;   // on the ground: agents and buildings draw over it
        o += INST;
      }
    }
    return o;
  }
}
