// Where everything is on art.png. Written by art/war/sheet.lua (run it in Aseprite after changing the art); not by hand.
// A row per agent type and realm (types in this order); in a row four facings (front-right, back-right, back-left,
// front-left), each with these poses. The fallen have four bodies in their row.
export const ATLAS = {
  width: 704, height: 298, frame: { w: 16, h: 20 },
  types: ['levy', 'spear', 'sword', 'archer', 'rider', 'fallen'], sides: 2, dirs: 4,
  poses: ['walk1', 'walk2', 'walk3', 'walk4', 'stand', 'blow1', 'blow2', 'blow3', 'blow4', 'struck1', 'struck2'],
  trees: [{ x: 0, y: 240, w: 18, h: 26 }, { x: 18, y: 240, w: 18, h: 26 }, { x: 36, y: 240, w: 18, h: 26 }],
  ground: { floor: { x: 0, y: 266, w: 32, h: 32 }, woods: { x: 32, y: 266, w: 32, h: 32 }, hill: { x: 64, y: 266, w: 32, h: 32 }, stream: { x: 96, y: 266, w: 32, h: 32 }, ford: { x: 128, y: 266, w: 32, h: 32 }, road: { x: 160, y: 266, w: 32, h: 32 }, field: { x: 192, y: 266, w: 32, h: 32 } },
};
