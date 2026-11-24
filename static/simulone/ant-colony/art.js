// The Colony: the drawn art. The drawings are made by the scripts in art/colony/ and packed into art.png by
// tools/pack-colony-art.py, which also writes art-atlas.js (where each drawing is). Anything not drawn is simply
// missing here, and the game draws that thing the plain way.

import { ATLAS } from './art-atlas.js';

/**
 * Load the sheet. Resolves to { image, has(name), at(name), pixels(name) }, or null if there is no sheet or it
 * holds nothing (the game then runs as it did before it had art).
 *   at(name)      [x, y, w, h] on the sheet, or null
 *   pixels(name)  { w, h, data } with data the drawing's RGBA bytes, or null: for painting pixel by pixel
 */
export function loadArt(url = './art.png') {
  if (!Object.keys(ATLAS).length) return Promise.resolve(null);
  return new Promise(done => {
    const image = new Image();
    image.onerror = () => done(null);
    image.onload = () => {
      const c = document.createElement('canvas');
      c.width = image.width; c.height = image.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(image, 0, 0);
      const cache = new Map();
      done({
        image,
        has: name => name in ATLAS,
        at: name => ATLAS[name] ?? null,
        pixels(name) {
          const r = ATLAS[name];
          if (!r) return null;
          if (!cache.has(name)) cache.set(name, { w: r[2], h: r[3], data: g.getImageData(r[0], r[1], r[2], r[3]).data });
          return cache.get(name);
        },
      });
    };
    image.src = url;
  });
}

/** A sprite sheet for the engine that draws nothing for an agent: this game draws its ants itself, from the side. */
export function noAgentSprites() {
  const image = document.createElement('canvas');
  image.width = image.height = 2;
  return { image, agent: { w: 1, h: 1, frames: 1, rect: () => [0, 0] } };
}
