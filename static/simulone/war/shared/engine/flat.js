// The flat view: the grid seen straight on, one square per cell. Use it for a side-on cut through the
// ground (an ant nest, a mine, a tower) or for a plain top-down map. The simulation is the same in both
// views; only the picture differs.
//
//   view pixel = cell × cellSize
//
// Nothing overlaps here, so there is no depth sorting: the ground first, then buildings, agents and
// build previews in that order. Agents are turned to face the way they are walking, which is what
// makes a climb up a shaft read as a climb. Agents inside a building are not drawn (but for a moment
// at its door as they go in and come out, with `view.doorLinger`); the building's image shows how full it is.

import { View, INST } from '../../shared/engine/view.js';
import { mixHex as mix } from '../../shared/engine/quads.js';
import { flatPlaceholderSprites } from '../../shared/engine/placeholder-flat.js';

const MAX_PREVIEW = 4096;

export class FlatRenderer extends View {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../../shared/engine/world.js').World} world
   * @param {import('../../shared/engine/sim.js').Sim} sim
   * @param {{cell?:number, turn?:boolean, background?:string, ink?:string, minZoom?:number, maxZoom?:number, maxGroundSize?:number, groundSharp?:boolean}} [view]
   *        cell: pixels per cell (default 16). turn: rotate agents to face their heading (default true).
   */
  constructor(canvas, world, sim, view = {}) {
    const ts = view.cell ?? 16;
    super(canvas, world, sim, view, world.w * ts, world.h * ts);
    this.ts = ts; this.tw = ts; this.th = ts;
    this.turn = view.turn !== false;
    this.sortByDepth = false;
    this._ang = new Float32Array(sim.capacity);                  // each agent's drawn heading, eased towards where it is going
    this._bCount = 0;
  }

  /** A generated sprite sheet for this view, for games that have no art yet. */
  placeholders() { return flatPlaceholderSprites({ world: this.world, sim: this.sim, cell: this.ts, ink: this.outline }); }

  /** Canvas pixel → grid cell [x, y] (may be outside the map). */
  screenToCell(sx, sy) { const [x, y] = this.screenToGrid(sx, sy); return [Math.floor(x), Math.floor(y)]; }
  /** Canvas pixel → position on the grid, in cells with fractions. */
  screenToGrid(sx, sy) { const [vx, vy] = this._unproject(sx, sy); return [vx / this.ts, vy / this.ts]; }
  get figureLift() { return 0; }

  // ── the ground: every cell in its tile's colour. Redone when the map changes.
  _rebuildStatic() {
    const { world, ts } = this, W = world.w, H = world.h, defs = world.defs;
    const g = this.ground.getContext('2d', { alpha: false });
    g.setTransform(this.groundScale, 0, 0, this.groundScale, 0, 0);
    g.fillStyle = this.background; g.fillRect(0, 0, this.mapW, this.mapH);
    const floor = defs[0].color ?? '#ffffff';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      // The solid edge is never shown as such: an edge cell looks like the cell next to it, so the map just ends.
      const ix = x < 1 ? 1 : x > W - 2 ? W - 2 : x, iy = y < 1 ? 1 : y > H - 2 ? H - 2 : y, c = iy * W + ix;
      if (world.bldAt[c] >= 0 && (ix !== x || iy !== y)) { g.fillStyle = defs[world.fill].color ?? floor; g.fillRect(x * ts, y * ts, ts, ts); continue; }
      const d = defs[world.bldAt[c] >= 0 ? world.fill : world.tiles[c]];
      let col = d.color ?? floor;
      if (d.color2 && (((x * 73856093) ^ (y * 19349663)) >>> 3) % 5 === 0) col = d.color2;   // a scatter of the second colour, so large areas are not flat
      g.fillStyle = col; g.fillRect(x * ts, y * ts, ts, ts);
    }
    // A building with no sprite is painted flat in its colour, faded while closed.
    this._bCount = 0;
    g.lineWidth = 1; g.strokeStyle = this.outline;
    for (const b of world.buildings) {
      if (!b) continue;
      if (this.bSprite[b.tile]) { this._bCount++; continue; }
      const col = b.color ?? defs[b.tile].color ?? '#b0aea4';
      g.fillStyle = b.open ? col : mix(col, defs[world.fill].color ?? floor, 0.6);
      g.fillRect(b.x * ts, b.y * ts, b.w * ts, b.h * ts);
      g.globalAlpha = 0.5; g.strokeRect(b.x * ts + 0.5, b.y * ts + 0.5, b.w * ts - 1, b.h * ts - 1); g.globalAlpha = 1;
    }
  }

  _fill(alpha) {
    const { sim, world, ts } = this;
    const N = sim.count, nPreview = this.marker ? Math.min(this.preview.length, MAX_PREVIEW) : 0;
    let nB = this._bCount;
    if (this._worldVersion !== world.version) { nB = 0; for (const b of world.buildings) if (b) nB++; }   // repaint was postponed
    const inst = this.batch.ensure(1 + nB + N + nPreview);
    let o = INST;
    const tick = sim.tick;
    for (const b of world.buildings) {                            // one image per building, for its current crowd level
      if (!b) continue;
      const sp = this.bSprite[b.tile];
      if (!sp) continue;
      const at = this._buildingImage(b, sp, tick);
      inst[o] = b.x * ts; inst[o + 1] = b.y * ts; inst[o + 2] = b.w * ts; inst[o + 3] = b.h * ts;
      inst[o + 4] = at[0]; inst[o + 5] = at[1]; inst[o + 6] = 0; inst[o + 7] = 0;
      o += INST;
    }

    const { px, py, vx, vy, type, action, using, inside } = sim, A = sim.A, fr = this.frames, uv = this.agentUV;
    const back = 1 - Math.max(0, Math.min(1, alpha));           // how much of the last step is still to be shown
    const aw = this.agentW, ah = this.agentH, walk = tick >> 2, ang = this._ang, turn = this.turn;
    const B = world.buildings;
    for (let i = 0; i < N; i++) {
      let dx = vx[i], dy = vy[i];
      let x = (px[i] - dx * back) * ts, y = (py[i] - dy * back) * ts;
      if (inside[i] >= 0) {
        const b = B[inside[i]];
        if (!b) continue;
        if (!b.prefab.outdoor) {                                  // inside: not drawn, unless just gone in or about to come out
          const d = this._atDoor(b, i);
          if (!d) continue;
          dx = dy = 0; x = d[0] * ts; y = d[1] * ts;
        } else {
          // out in the open (a field, a yard): each person keeps a spot of their own on the footprint and shuffles about it
          dx = Math.cos(tick * 0.02 + i) * 0.25; dy = -Math.sin(tick * 0.017 + i * 1.7) * 0.25;
          x = (b.x + 0.4 + ((i * 0.6180339887) % 1) * (b.w - 0.8) + Math.sin(tick * 0.02 + i) * 0.25) * ts;
          y = (b.y + 0.4 + ((i * 0.7548776662) % 1) * (b.h - 0.8) + Math.cos(tick * 0.017 + i * 1.7) * 0.25) * ts;
        }
      }
      let a = 0;
      if (turn) {
        a = ang[i];
        if (dx * dx + dy * dy > 1e-6) {                           // ease towards the heading, the short way round
          let d = Math.atan2(dy, dx) - a;
          if (d > Math.PI) d -= 6.2832; else if (d < -Math.PI) d += 6.2832;
          a += d * 0.25;
          if (a > Math.PI) a -= 6.2832; else if (a < -Math.PI) a += 6.2832;
          ang[i] = a;
        }
        if (a === 0) a = 1e-4;                                    // 0 means "pixel-snapped" to the shader; agents are never snapped
      }
      const u = this._agentUV(i, using[i] ? 0 : (walk + i) % fr, using[i]);
      inst[o] = x - aw / 2; inst[o + 1] = y - ah / 2; inst[o + 2] = aw; inst[o + 3] = ah;
      inst[o + 4] = uv[u]; inst[o + 5] = uv[u + 1]; inst[o + 6] = 0; inst[o + 7] = a;
      o += INST;
    }
    if (nPreview) {                                               // build preview: one marker per cell, over everything
      const m = this.previewBad && this.markerBad ? this.markerBad : this.marker;
      for (let k = 0; k < nPreview; k++) {
        inst[o] = this.preview[k][0] * ts; inst[o + 1] = this.preview[k][1] * ts; inst[o + 2] = m.w; inst[o + 3] = m.h;
        inst[o + 4] = m.x; inst[o + 5] = m.y; inst[o + 6] = 0; inst[o + 7] = 0;
        o += INST;
      }
    }
    return o;
  }
}
