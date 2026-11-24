// WAR's art. The battle view draws from art.png, the sheet made in Aseprite by art/war/sheet.lua in the Chronicle style
// (its layout is in art-atlas.js). If the sheet cannot be loaded, the same figures are drawn here by code instead
// (makeArt), simpler, so the game still opens.
//
// The game picks a man's realm, facing and pose through the engine's `look` column:
//   look = side × 28 + facing × 7 + pose
// facing: 0 front-right, 1 back-right, 2 back-left, 3 front-left. pose: 0 as he is (walking, or standing when the engine
// says he is still), 1-4 the four frames of a blow (wind-up, strike, follow-through, recovery; for an archer: nock,
// draw, loose, lower), 5-6 the two frames of being struck. A blow and being struck show whether he is moving or not.
// The fallen: look = side × 28 + one of four bodies. Trees for the woods, and the ground's textures, are on the sheet.

import { ATLAS } from './art-atlas.js';

export const LOOKS_PER_SIDE = 28;

/** The drawn sheet: resolves to an image, or null if it could not be loaded. */
export function loadSheet(url) {
  return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
}
/** The engine's sprites object for the drawn sheet. `kinds`: the agent types in the game's order (their names). */
export function sheetSprites(image, kinds) {
  const A = ATLAS, P = A.poses.length, S = A.sides, L = LOOKS_PER_SIDE, FW = A.frame.w, FH = A.frame.h;
  const row = kinds.map(k => A.types.indexOf(k)), DEAD = kinds.indexOf('fallen');
  return {
    image,
    agent: {
      w: FW, h: FH, frames: 4, variants: L * S, still: true,
      rect: (type, action, frame, variant, still) => {
        const side = Math.min(S - 1, (variant / L) | 0), v = variant % L, y = (row[type] * S + side) * FH;
        if (type === DEAD) return [(v & 3) * FW, y];
        const dir = (v / 7) | 0, pose = v % 7;
        return [(dir * P + (pose ? 4 + pose : still ? 4 : frame)) * FW, y];   // poses on the sheet: walk 0-3, stand 4, blow 5-8, struck 9-10
      },
    },
    tiles: { woods: A.trees.map(t => ({ ...t, jitter: 10 })) },
    ground: { ...A.ground },
  };
}

export const FRAME = { w: 16, h: 20 };
const POSES = 7;                                   // 4 walking frames, standing, striking, struck
const SKIN = '#e2b48c', SKIN2 = '#c99470', IRON = '#9aa1a8', IRON2 = '#6c737a', WOOD = '#7a5432', WOOD2 = '#5a3c22', INK = '#1d1c18';
const HORSE = ['#7b4a2a', '#5e3a22', '#3e2616'];

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/**
 * Draw a simpler sheet by code, for when art.png cannot be loaded. `kinds`: the agent types in order (their names; 'fallen' for the dead); `sides`: [{ color, light, dark, trim }].
 * Returns the engine's sprites object (see engine/README.md, Sprites).
 */
export function makeArt(kinds, sides) {
  const cols = 4 * POSES, rows = kinds.length * sides.length;
  const TREE_Y = rows * FRAME.h;
  const sheet = canvas(Math.max(cols * FRAME.w, 6 * 18), TREE_Y + 26);
  const g = sheet.getContext('2d');
  g.imageSmoothingEnabled = false;
  kinds.forEach((kind, t) => sides.forEach((side, s) => {
    const row = (t * sides.length + s) * FRAME.h;
    if (kind === 'fallen') { for (let k = 0; k < 4; k++) fallen(g, k * FRAME.w, row + FRAME.h - 12, side, k); return; }
    for (const dir of [0, 1]) for (let pose = 0; pose < POSES; pose++) {
      const f = canvas(FRAME.w, FRAME.h), fg = f.getContext('2d');
      if (pose === 6) struck(fg, kind, side, dir === 1); else figure(fg, kind, side, dir === 1, pose);
      g.drawImage(f, (dir * POSES + pose) * FRAME.w, row);
      // the same figure facing left: mirrored
      g.save(); g.translate(((3 - dir) * POSES + pose) * FRAME.w + FRAME.w, row); g.scale(-1, 1); g.drawImage(f, 0, 0); g.restore();
    }
  }));
  const trees = [0, 1, 2].map(k => { tree(g, k * 18, TREE_Y, k); return { x: k * 18, y: TREE_Y, w: 18, h: 26, jitter: 10 }; });
  const S = sides.length, DEAD = kinds.indexOf('fallen'), L = LOOKS_PER_SIDE, SHOWN = [0, 5, 5, 5, 5, 6, 6];   // look pose -> this sheet's pose
  return {
    image: sheet,
    agent: {
      w: FRAME.w, h: FRAME.h, frames: 4, variants: L * S, still: true,
      rect: (type, action, frame, variant, still) => {
        const side = Math.min(S - 1, (variant / L) | 0), v = variant % L;
        if (type === DEAD) return [(v & 3) * FRAME.w, (type * S + side) * FRAME.h];
        const dir = (v / 7) | 0, pose = SHOWN[v % 7];
        return [(dir * POSES + (pose || (still ? 4 : frame))) * FRAME.w, (type * S + side) * FRAME.h];
      },
    },
    tiles: { woods: trees },
  };
}

// Reeling from a blow: the figure standing, knocked a pixel back and up, with the blow's flash on him.
function struck(g, kind, side, back) {
  const f = canvas(FRAME.w, FRAME.h);
  figure(f.getContext('2d'), kind, side, back, 4);
  g.drawImage(f, -1, -1);
  const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const cx = kind === 'rider' ? 9 : 10, cy = kind === 'rider' ? 6 : 10;
  P(cx, cy, 2, 2, '#fff4d0'); P(cx + 2, cy - 1, 1, 1, '#fff4d0'); P(cx + 2, cy + 2, 1, 1, '#fff4d0'); P(cx - 1, cy + 1, 1, 1, '#c8281c'); P(cx + 1, cy + 2, 1, 1, '#c8281c');
}

// One figure in a 16 × 20 frame, facing right; `back`: seen from behind (facing away from the viewer).
function figure(g, kind, side, back, pose) {
  const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const walking = pose < 4, blow = pose === 5, step = walking ? [1, 0, -1, 0][pose] : 0;
  if (kind === 'rider') return rider(P, side, back, pose);
  // legs
  const legY = 15;
  P(6, legY, 2, 4 + (step > 0 ? -1 : 0), side.dark); P(9, legY, 2, 4 + (step < 0 ? -1 : 0), side.dark);
  P(6 + (step > 0 ? 1 : 0), 18 + (step > 0 ? -1 : 0), 2, 1, INK); P(9 - (step < 0 ? 1 : 0), 18 + (step < 0 ? -1 : 0), 2, 1, INK);
  // body
  const tunic = kind === 'levy' ? mix(side.color, '#8a7a5a', 0.55) : side.color;
  P(5, 9, 6, 6, tunic); P(5, 13, 6, 1, side.dark);
  if (kind === 'sword' || kind === 'spear') P(5, 9, 6, 2, IRON2);                 // mail on the shoulders
  // head and helmet
  P(6, 4, 4, 4, back ? (kind === 'levy' ? '#5a4632' : SKIN2) : SKIN);
  if (!back) { P(8, 5, 1, 1, INK); P(9, 6, 1, 1, SKIN2); }
  if (kind === 'spear') { P(6, 3, 4, 2, IRON); P(5, 4, 6, 1, IRON2); }
  else if (kind === 'sword') { P(6, 2, 4, 3, IRON); P(5, 4, 6, 1, IRON2); if (!back) P(8, 5, 1, 2, IRON2); P(7, 1, 2, 1, side.trim); }
  else if (kind === 'archer') { P(6, 3, 4, 2, side.light); P(9, 3, 2, 1, side.light); }
  else { P(6, 3, 4, 2, '#6a5236'); }                                                // a hood
  // weapon and shield
  if (kind === 'spear') {
    if (blow) { P(7, 10, 9, 1, WOOD); P(14, 9, 2, 3, IRON); }                    // levelled and thrust
    else { P(12, 0, 1, 18, WOOD); P(11, 0, 3, 2, IRON); }
    shield(P, side, back);
  } else if (kind === 'sword') {
    if (blow) { P(10, 9, 6, 1, IRON); P(10, 10, 5, 1, IRON2); }                  // a cut across
    else { P(11, 6, 1, 7, IRON); P(10, 12, 3, 1, WOOD2); }
    shield(P, side, back);
  } else if (kind === 'archer') {
    if (blow) { P(13, 4, 1, 12, WOOD); P(12, 3, 1, 1, WOOD); P(12, 16, 1, 1, WOOD); P(9, 9, 4, 1, '#ddd'); }   // drawn: arrow on the string
    else { P(12, 5, 1, 10, WOOD); P(11, 4, 1, 1, WOOD); P(11, 15, 1, 1, WOOD); }
    P(4, 8, 2, 6, WOOD2);                                                          // the quiver
  } else {                                                                          // levy: a pitchfork or a bill
    if (blow) { P(7, 9, 8, 1, WOOD); P(14, 8, 1, 3, IRON); }
    else { P(12, 2, 1, 16, WOOD); P(11, 1, 1, 2, IRON); P(13, 1, 1, 2, IRON); }
  }
  // arms
  P(back ? 5 : 10, 10, 1, 4, back ? mix(tunic, '#000', 0.25) : SKIN);
}
function shield(P, side, back) {
  if (back) { P(10, 9, 3, 5, mix(side.dark, '#000', 0.2)); return; }
  P(3, 9, 4, 6, side.light); P(3, 9, 4, 1, side.trim); P(3, 14, 4, 1, side.trim); P(4, 11, 2, 2, side.color);
}
function rider(P, side, back, pose) {
  const walking = pose < 4, blow = pose === 5, gait = walking ? pose : 1;
  const legs = [[0, 2, 0, 2], [1, 1, 1, 1], [2, 0, 2, 0], [1, 1, 1, 1]][gait];
  // the horse: body, legs, neck and head facing right
  P(2, 10, 11, 5, HORSE[0]); P(2, 14, 11, 1, HORSE[1]);
  [3, 5, 9, 11].forEach((x, k) => P(x, 15, 1, 4 - (legs[k] ? 1 : 0), HORSE[1]));
  [3, 5, 9, 11].forEach((x, k) => P(x, 19 - (legs[k] ? 1 : 0), 1, 1, INK));
  if (!back) { P(12, 6, 2, 5, HORSE[0]); P(13, 5, 3, 3, HORSE[0]); P(15, 6, 1, 1, INK); P(12, 5, 1, 3, HORSE[2]); }
  else { P(12, 7, 2, 4, HORSE[1]); P(12, 6, 2, 1, HORSE[2]); }
  P(1, 10, 1, 4, HORSE[2]);                                                         // the tail
  P(4, 9, 7, 2, side.color); P(4, 11, 7, 1, side.trim);                             // the saddle cloth
  // the rider
  P(6, 3, 4, 6, side.color); P(6, 8, 4, 1, side.dark);
  P(7, 0, 3, 3, back ? SKIN2 : SKIN); P(7, 0, 3, 1, IRON); if (!back) P(9, 1, 1, 1, INK);
  if (blow) { P(8, 5, 8, 1, WOOD); P(14, 4, 2, 3, IRON); }                          // the lance levelled
  else { P(11, 0, 1, 11, WOOD); P(10, 0, 3, 1, IRON); }
  P(5, 4, 2, 4, side.light);                                                         // a small shield
}
function tree(g, x0, y0, k) {
  const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x0 + x, y0 + y, w, h); };
  const greens = [['#3f5a2a', '#4f6e34', '#62843f'], ['#36502a', '#46642f', '#58783a'], ['#425f2e', '#557539', '#6b8c45']][k];
  P(8, 17, 2, 8, WOOD2);
  const blob = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); P(cx - w, cy + y, w * 2, 1, c); } };
  if (k === 1) { for (let j = 0; j < 4; j++) blob(9, 5 + j * 4, 2 + j, greens[j % 2]); blob(8, 16, 4, greens[0]); }   // a fir
  else { blob(9, 11, 7, greens[0]); blob(8, 9, 5, greens[1]); blob(7, 7, 3, greens[2]); }
}
function fallen(g, x0, y0, side, k) {
  const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x0 + x, y0 + y, w, h); };
  const flip = k & 1;
  const X = (x, w) => (flip ? 16 - x - w : x);
  P(X(3, 9), 6, 9, 3, side.color); P(X(3, 9), 8, 9, 1, side.dark);
  P(X(12, 3), 5, 3, 3, k & 2 ? IRON : SKIN);
  P(X(1, 3), 7, 3, 2, side.dark);
  if (k & 2) P(X(2, 12), 4, 12, 1, WOOD);
}
function mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
