// The Colony's own view: the engine's flat view, with the ground painted from the drawn soil instead of flat
// colours. Earth is the tiling texture of its kind; a dug-out cell is the earth behind it in shade, darkest under
// its roof and with a lit edge along its floor; the line between earth and hollow is rough, never the straight side
// of a cell. Only the cells that changed (and their neighbours, whose edges depend on them) are painted again, so
// digging and water cost almost nothing to show.

import { FlatRenderer } from './shared/engine/index.js';

const T = 12;                                                    // pixels in a cell: the size the art is drawn at
// Smooth noise 0..1 with features about `size` pixels across.
const smooth = (x, y, size, seed) => {
  const gx = x / size, gy = y / size, x0 = Math.floor(gx), y0 = Math.floor(gy);
  let fx = gx - x0, fy = gy - y0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(x0 + seed, y0), b = hash(x0 + 1 + seed, y0), c = hash(x0 + seed, y0 + 1), d = hash(x0 + 1 + seed, y0 + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
function hash(x, y) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) % 1000 / 1000;
}

/**
 * @param {object} art       from art.js (the sheet, with pixels(name))
 * @param {object} o
 * @param {number} o.surface the row ants walk on above ground
 * @param {number} o.wall    how much darker a tunnel's back wall is than the earth
 * @param {string} o.open, o.wet   the tiles of dug-out ground and of a flooded cell
 * @returns a view class for the engine's `renderer`
 */
export function colonyView(art, o) {
  const tex = Object.fromEntries(['loam', 'humus', 'sand', 'clay', 'plug', 'water'].map(n => [n, art.pixels('ground/' + n)]));
  const stones = [1, 2, 3, 4, 5, 6].map(n => art.pixels('ground/stone_' + n)).filter(Boolean);
  const roots = [1, 2, 3, 4].map(n => art.pixels('ground/root_' + n)).filter(Boolean);
  const sky = art.pixels('ground/sky_day');

  return class ColonyView extends FlatRenderer {
    _rebuildStatic() {
      const { world } = this, W = world.w, H = world.h, tiles = world.tiles;
      const names = world.defs.map(d => d.name);
      const g = this.ground.getContext('2d');
      const first = !this._shown;
      if (first) this._shown = new Uint8Array(tiles.length).fill(255);
      const shown = this._shown, dirty = new Set();
      for (let c = 0; c < tiles.length; c++) if (tiles[c] !== shown[c]) {
        shown[c] = tiles[c];
        if (first) continue;
        const x = c % W, y = (c / W) | 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (x + i >= 0 && y + j >= 0 && x + i < W && y + j < H) dirty.add((y + j) * W + x + i);
      }

      // the edge of the map is never shown as such: an edge cell is the cell next to it
      const kind = (x, y) => names[tiles[Math.min(H - 2, Math.max(1, y)) * W + Math.min(W - 2, Math.max(1, x))]];
      const hollow = (x, y) => { const k = kind(x, y); return k === o.open || k === o.wet; };
      const earth = (x, y) => { const k = kind(x, y); return k !== o.open && k !== o.wet && k !== 'air' && k !== 'sky'; };
      let cell = g.createImageData(T, T), out = cell.data;
      const texel = (t, px, py) => { const i = ((py % t.h) * t.w + (px % t.w)) * 4; return [t.data[i], t.data[i + 1], t.data[i + 2]]; };

      const paint = (cx, cy) => {
        const k = kind(cx, cy), isHollow = k === o.open || k === o.wet, isSky = k === 'sky' || k === 'air';
        const L = hollow(cx - 1, cy), R = hollow(cx + 1, cy), U = hollow(cx, cy - 1), D = hollow(cx, cy + 1);
        const roofed = earth(cx, cy - 1), floored = earth(cx, cy + 1);
        const stone = k === 'stone' && stones.length ? stones[(hash(cx, cy) * stones.length) | 0] : null;
        const root = roots.length && cy > o.surface && cy <= o.surface + 3 && hash(cx, 91) > 0.72 ? roots[(hash(cx, 5) * roots.length) | 0] : null;
        for (let ly = 0; ly < T; ly++) for (let lx = 0; lx < T; lx++) {
          const px = cx * T + lx, py = cy * T + ly, i = (ly * T + lx) * 4;
          let r, gg, b;
          if (isSky) {
            if (sky) [r, gg, b] = texel(sky, px, Math.min(py, sky.h - 1)); else { r = 180; gg = 210; b = 228; }
          } else {
            let open = isHollow, wet = k === o.wet;
            if (!open) {                                           // earth beside a hollow is bitten into, unevenly
              const bite = (hash(px, py) * 3.6) | 0;
              if ((L && lx < bite) || (R && T - 1 - lx < bite) || (U && ly < bite) || (D && T - 1 - ly < bite)) open = true;
            }
            if (open && wet && tex.water) [r, gg, b] = texel(tex.water, px, py);
            else if (open) {                                       // the back wall: the earth, in shade
              [r, gg, b] = texel(tex.loam, px, py);
              let f = o.wall * (0.94 + hash(px >> 2, py >> 2) * 0.12);
              if (isHollow && roofed && ly < 3) f *= 0.72;
              if (isHollow && floored && ly >= T - 2) f *= 1.45;
              r *= f; gg *= f * 0.97; b *= f * 0.94;
            } else {
              // which earth this pixel is: looked up a little to one side, so the border between two kinds wanders
              const k2 = kind(Math.floor((px + (smooth(px, py, 7, 11) - 0.5) * 9) / T), Math.floor((py + (smooth(px, py, 7, 53) - 0.5) * 9) / T));
              let name = tex[k2] && k2 !== 'water' && k2 !== 'plug' && k !== 'plug' ? k2 : k === 'stone' || !tex[k] ? 'loam' : k;
              if (name === 'loam' && (cy <= o.surface + 1 || (cy === o.surface + 2 && ly < 3 + hash(px >> 2, 7) * 7))) name = 'humus';   // dark topsoil
              [r, gg, b] = texel(tex[name] ?? tex.loam, px, py);
              if (stone) { const s = (ly * stone.w + lx) * 4; if (stone.data[s + 3] > 127) { r = stone.data[s]; gg = stone.data[s + 1]; b = stone.data[s + 2]; } }
              if (root && name !== 'clay') {
                const ry = py - (o.surface + 1) * T, s = (ry * root.w + lx) * 4;
                if (ry >= 0 && ry < root.h && root.data[s + 3] > 127) { r = root.data[s]; gg = root.data[s + 1]; b = root.data[s + 2]; }
              }
              const depth = 1 - Math.min(0.22, py / (H * T) * 0.26);
              const lit = U && ly < 2 ? 1.17 : 1;                    // earth just under a hollow catches a little light
              r *= depth * lit; gg *= depth * lit; b *= depth * lit;
            }
          }
          out[i] = r; out[i + 1] = gg; out[i + 2] = b; out[i + 3] = 255;
        }
        g.putImageData(cell, cx * T, cy * T);
      };

      this._bCount = 0;
      if (first || dirty.size > 400) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paint(x, y);
        return undefined;                                        // everything: send the whole ground
      }
      const parts = [];
      for (const c of dirty) {                                   // each repainted cell goes to the screen as the pixels just made, not read back from the canvas
        const x = c % W, y = (c / W) | 0;
        cell = g.createImageData(T, T); out = cell.data;
        paint(x, y); parts.push([x * T, y * T, T, T, cell]);
      }
      return parts;
    }
  };
}
