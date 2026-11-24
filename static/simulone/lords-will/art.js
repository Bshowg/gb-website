// The Lord's Will: the drawn art, and how the game's things map onto it.
//
// The drawings are made by the scripts in art/ and packed into art.png by tools/pack-art.py, which also writes
// art-atlas.js (where each drawing is). This file turns that into the sprite sheet the engine asks for, for a season.
// Anything not drawn yet is simply left out: the engine paints it flat, as it does with no art at all.

import { ATLAS } from './art-atlas.js';

/** What the view needs to match the art: cell size, paper and ink. */
export const VIEW = { tileW: 32, tileH: 16, background: '#eadfc6', ink: '#4a382c', minZoom: 0.25, maxZoom: 4 };

/** The hour, as the art needs it: `night` runs 0 (day) to 1 (deep night). The page keeps it up to date. */
export const sky = { night: 0 };
/** What the whole picture is multiplied by at that hour: day as drawn, night a dim blue. Lit windows and flames keep their colour. */
export const tintOf = night => [1 - 0.5 * night, 1 - 0.42 * night, 1 - 0.2 * night];

const STAGE_ROW = { child: 0, youth: 1, adult: 2, elder: 3 };
/** Looks per stage of life: three men, then three women. */
export const LOOKS = 6;
/** The look of a person: by sex, then one of three by their id. */
export const lookOf = (sex, id) => (sex === 'f' ? 3 : 0) + id % 3;

/** Load the sheet. Resolves to the image, or null if there is none (the game then runs on generated placeholders). */
export function loadArt(url = './art.png') {
  return new Promise(done => {
    const img = new Image();
    img.onload = () => done(img); img.onerror = () => done(null);
    img.src = url;
  });
}

// Which texture each kind of ground takes in each season.
function ground(season) {
  const G = ATLAS.ground, winter = season === 'winter', out = {};
  const use = (key, ...names) => { for (const n of names) if (G[n]) { out[key] = G[n]; return; } };
  use('floor', 'grass_' + season, 'grass_summer');
  use('forest', 'forest_' + season, 'forest_summer');
  use('water', winter ? 'water_winter' : 'water', 'water');
  use('ford', 'ford');
  use('road', winter ? 'road_winter' : 'road', 'road');
  use('entry', 'earth'); use('base', 'earth');
  for (const crop of ['fallow', 'sown', 'growing', 'ripe', 'stubble']) use('field_' + crop, 'field_' + crop);
  use('field', 'field_fallow');
  use('market', 'market');
  use('garden', winter ? 'field_fallow' : 'garden', 'field_fallow');   // dug over and bare in winter
  if (season === 'spring' || season === 'summer') { use('green', 'green'); use('fairground', 'fairground'); }   // drawn for green grass
  else { use('green', 'grass_' + season); use('fairground', 'grass_' + season); }
  return out;
}

/**
 * The sprite sheet for the engine (see engine README, Sprites).
 * @param {CanvasImageSource} image   from loadArt
 * @param {import('./shared/engine/sim.js').Sim} sim
 * @param {string} season             'spring' | 'summer' | 'autumn' | 'winter'
 * @param {object} fallback           the engine's placeholders, for whatever has no drawing yet
 */
export function makeSprites(image, sim, season, fallback) {
  const P = ATLAS.people, work = sim.actionIndex('work');
  const rows = sim.types.map(t => STAGE_ROW[t.name] ?? 2);
  const buildings = {};
  for (const [name, b] of Object.entries(ATLAS.buildings))
    buildings[name] = { w: b.w, h: b.h, levels: 1, frames: 1,
      rect: (level, frame, rot) => (sky.night > 0.5 && b.night ? b.night : b.open)[rot],      // after dark, the windows are lit
      closed: rot => b.closed[rot],
      states: b.fire0 ? { fire: { frames: 3, frameTicks: 6, rect: (frame, rot) => b['fire' + frame][rot] } } : undefined };
  const trees = ATLAS.trees[season] ?? ATLAS.trees.summer;
  return {
    image,
    // Walking to something shows the walk; once there, working the land has its own movement, and anything else is standing about.
    agent: P ? { w: P.cw, h: P.ch, frames: 4, variants: LOOKS, still: true,
                 rect: (t, a, f, v, still) => [P.x + ((still ? (a === work ? 1 : 2) : 0) * 4 + f) * P.cw, P.y + (rows[t] * LOOKS + v) * P.ch] }
             : fallback.agent,
    buildings,
    tiles: trees?.length ? { forest: trees.map(t => ({ ...t, jitter: 14 })) } : {},
    ground: ground(season),
    marker: ATLAS.marker, markerBad: ATLAS.markerBad,
  };
}
/** True if the sheet can stand in for the placeholders: it needs at least the people (they share one image with everything else). */
export const usable = () => !!ATLAS.people;

// ── the same sheet, used by the page itself: small icons in the text, and pictures in the build menu.
const pic = (r, kind, label) => r ? `<i class="art ${kind}"${label ? ` role="img" aria-label="${label}" title="${label}"` : ''} style="width:${r.w}px;height:${r.h}px;background-position:-${r.x}px -${r.y}px"></i>` : '';
/** An icon for a resource (or 'people', 'food', 'regard') as HTML; '' if there is none, so the caller can fall back to the word. */
export const icon = name => pic(ATLAS.icons?.[name], 'ic', name);
/** A small picture of a building (or 'road', 'field') for a menu; '' if there is none. */
export const thumb = name => pic(ATLAS.thumbs?.[name], 'th');
/** The styles those need. Add once to the page. */
export const ART_CSS = `.art { display: inline-block; flex: none; background: url(art.png) no-repeat; vertical-align: -3px; }
.art.ic { image-rendering: pixelated; }
.art.th { vertical-align: middle; }`;
