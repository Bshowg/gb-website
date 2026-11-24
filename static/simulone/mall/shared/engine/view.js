// What every view has in common: the camera, the sprite sheet bookkeeping, the ground canvas and the
// frame routine. A view turns grid positions into "view pixels" its own way (isometric in renderer.js,
// straight-on in flat.js) by implementing:
//   screenToCell(sx, sy)   canvas pixel → grid cell
//   _rebuildStatic()       repaint the ground canvas and anything else that only changes with the map
//   _fill(alpha)           write this frame's instances after the ground quad; return the float count
//   placeholders()         a generated sprite sheet in this view's shape
// and setting `sortByDepth`. Everything is drawn by the shared QuadBatch (quads.js).

import { QuadBatch, INST } from '../../shared/engine/quads.js';

export class View {
  /**
   * Where agent i, inside building b, is seen while it lingers at the door: [x, y] in cells, or null when it is out of
   * sight. Just after going in it stands on the building's entry cell, just before coming out on its exit cell, each
   * agent a little to one side so a queue does not stack on one spot.
   */
  _atDoor(b, i) {
    const L = this.doorLinger;
    if (!L) return null;
    const sim = this.sim, ox = ((i * 0.6180339887) % 1) * 0.5 + 0.25, oy = ((i * 0.7548776662) % 1) * 0.5 + 0.25;
    if (sim.inFor[i] < L) return [b.ex + ox, b.ey + oy];
    if (sim.ticksLeft(i) < L && !this._staysOn(i)) return [b.xx + ox, b.xy + oy];   // on the way out, unless the next thing is done in here too
    return null;
  }
  // sim.staysAfter(i), asked once per action rather than every frame, so the answer does not flicker as needs move.
  _staysOn(i) {
    const sim = this.sim;
    if (!this._stayKey || this._stayKey.length < sim.capacity) { this._stayKey = new Int32Array(sim.capacity).fill(-1); this._stayAns = new Uint8Array(sim.capacity); }
    const key = (sim.action[i] << 16) | ((sim.inFor[i] - sim.timer[i]) & 0xffff);   // the same for the whole of one action
    if (this._stayKey[i] !== key) { this._stayKey[i] = key; this._stayAns[i] = sim.staysAfter(i) ? 1 : 0; }
    return this._stayAns[i] === 1;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../../shared/engine/world.js').World} world
   * @param {import('../../shared/engine/sim.js').Sim} sim
   * @param {object} view     the game's `view` config
   * @param {number} mapW     size of the whole map in view pixels
   * @param {number} mapH
   */
  constructor(canvas, world, sim, view, mapW, mapH) {
    this.canvas = canvas; this.world = world; this.sim = sim;
    this.mapW = mapW; this.mapH = mapH;
    this.background = view.background ?? '#f4f2ea';
    this.outline = view.ink ?? '#1c1f17';
    this.maxZoom = view.maxZoom ?? 6;
    // Ticks someone is still seen at the door of a building they went into, and is seen there again before they come out.
    // A visit shorter than twice this never takes them out of sight. 0: they vanish as they go in (see _atDoor).
    this.doorLinger = view.doorLinger ?? 0;
    this.camera = { x: 0, y: 0, zoom: 1 };
    // Big maps must still fit on screen, so the zoom-out limit follows the map size.
    this._minZoomWanted = view.minZoom ?? 0.5;
    this.minZoom = Math.min(this._minZoomWanted, canvas.width / mapW, canvas.height / mapH);
    this.fit();

    /** Cells [[x, y], …] to mark on the ground, for build previews. Needs a `marker` sprite. */
    this.preview = [];
    /** True to mark the previewed cells as refused: they are drawn with the sheet's `markerBad`, if it has one. */
    this.previewBad = false;
    /** A building not yet built, shown where it would stand: { tile, x, y, w, h, rot } (corner and size as placed), or null. */
    this.ghost = null;
    this.sortByDepth = true; this.zmax = 1;
    this._worldVersion = -1; this._atlasDirty = true; this._nextRepaint = 0;
    this.sprites = null;
    /** The light of the hour: [r, g, b] the whole picture is multiplied by (1, 1, 1 = as drawn). Pixels of the sprite
     *  sheet whose alpha is between 0.5 and 0.9 are lights (a lit window, a flame): they keep their colour. */
    this.tint = [1, 1, 1];
    /** Set true to accumulate timings in `prof` (ms; divide by prof.frames): filling the instance list, and handing it to the GPU. */
    this.profile = false;
    this.prof = { fill: 0, submit: 0, frames: 0 };

    this.batch = new QuadBatch(canvas);
    this.gl = this.batch.gl;
    // The ground is one texture. If the map is larger than the GPU allows, paint it at reduced resolution.
    const maxTex = Math.min(this.batch.maxTextureSize, view.maxGroundSize ?? 4096);
    this.groundScale = Math.min(1, maxTex / mapW, maxTex / mapH);
    this.ground = document.createElement('canvas');
    this.ground.width = Math.ceil(mapW * this.groundScale); this.ground.height = Math.ceil(mapH * this.groundScale);
    // A ground of flat colours can be painted small and shown with hard edges: `view.groundSharp` with a small
    // `view.maxGroundSize`. Repainting and re-sending it after every change to the map then costs next to nothing.
    if (view.groundSharp) this.batch.sharpGround();
    // `view.groundMipmaps: false` lets a view repaint and re-send only the part of the ground that changed: its
    // _rebuildStatic() then returns the rectangles it repainted, as [[x, y, w, h], …] in ground pixels.
    if (view.groundMipmaps === false) this.batch.plainGround();
    /** The part of the map the camera may look at, in view pixels { x0, y0, x1, y1 }, or null for all of it (see setBounds). */
    this.bounds = null;
  }

  /**
   * Keep the camera to a part of the map, given in view pixels (null: the whole map). The zoom-out limit follows it, so that
   * part always fills the screen. Call it again whenever the part changes.
   */
  setBounds(b) {
    this.bounds = b;
    this._limitZoom();
    this.pan(0, 0);
  }
  _limitZoom() {
    const b = this.bounds, w = b ? b.x1 - b.x0 : this.mapW, h = b ? b.y1 - b.y0 : this.mapH;
    this.minZoom = Math.min(this._minZoomWanted, this.canvas.width / w, this.canvas.height / h);
    this.camera.zoom = Math.max(this.minZoom, this.camera.zoom);
  }

  /**
   * Set the sprite sheet.
   * @param {object} s
   * @param {CanvasImageSource} s.image   the atlas (canvas, <img>, ImageBitmap)
   * @param {{w:number, h:number, frames:number, variants?:number, still?:boolean, rect:(type:number, action:number, frame:number, variant:number, still:number)=>[number,number]}} s.agent
   *        agent cell size, frames per cycle, and where each (type, action, frame) sits in the atlas. With `variants`,
   *        each person shows one of that many looks: the one in the simulation's `look` column (a game adds it with
   *        sim.addColumn('look', Uint8Array, 0) and fills it). With `still: true`, rect is also asked for the frames of
   *        someone who has arrived and is doing the action (still = 1), as against walking to it (still = 0).
   * @param {Record<string,{w:number,h:number,levels:number,frames:number,frameTicks?:number,rect:Function,closed:Function}>} [s.buildings]
   *        per prefab name: one image per crowd level, animation frame and rotation (see README). `states` adds images
   *        for states of the game's own: { fire: { frames, frameTicks, rect: (frame, rot) => [x, y] } } is shown while
   *        the building's `state` property is 'fire'.
   * @param {Record<string,{x:number,y:number,w:number,h:number}|Array>} [s.tiles]  sprites per plain tile name; a list
   *        of them gives each cell one of the list, always the same one for the same cell. `jitter: px` on a sprite
   *        moves it up to half that far off its cell's centre, so a forest does not stand in rows.
   * @param {Record<string,{x:number,y:number,w:number,h:number}>} [s.ground]  textures painted on the ground instead of
   *        flat colour, each a rectangle of the atlas that repeats seamlessly. Keys: 'floor', a plain tile's name, a
   *        prefab's name (or a building's own `ground` key, which wins), 'entry' (the cell at a door) and 'base'
   *        (under a building that has an image and no texture of its own).
   * @param {{x:number,y:number,w:number,h:number}} [s.marker]  tile-sized sprite used for build previews
   * @param {{x:number,y:number,w:number,h:number}} [s.markerBad]  the same for cells where building is refused
   */
  setSprites(s) {
    const { sim, world } = this;
    if (this.sprites?.image !== s.image) this._atlasDirty = true;   // the same sheet with other choices needs no new upload
    this.sprites = s;
    const fr = this.frames = s.agent.frames;
    this.agentW = s.agent.w; this.agentH = s.agent.h;
    // One atlas position per (type, action, look, walking or still, frame).
    // `stills`: how many poses there are besides walking (default 1 with `still: true`): rect's last argument is then 0 for walking, 1, 2… for those
    const V = this.variants = Math.max(1, s.agent.variants ?? 1), ST = this.stills = s.agent.stills ? s.agent.stills + 1 : s.agent.still ? 2 : 1;
    this.agentUV = new Float32Array(sim.T * sim.A * V * ST * fr * 2);
    for (let t = 0; t < sim.T; t++) for (let a = 0; a < sim.A; a++) for (let v = 0; v < V; v++) for (let st = 0; st < ST; st++) for (let f = 0; f < fr; f++) {
      const [x, y] = s.agent.rect(t, a, f, v, st);
      const o = ((((t * sim.A + a) * V + v) * ST + st) * fr + f) * 2;
      this.agentUV[o] = x; this.agentUV[o + 1] = y;
    }
    this.groundRects = s.ground ?? null; this._patterns = null;
    this.tileSprite = world.defs.map(d => s.tiles?.[d.name] ?? null);
    this.bSprite = world.defs.map(d => s.buildings?.[d.name] ?? null);
    this.marker = s.marker ?? null; this.markerBad = s.markerBad ?? null;
    this._worldVersion = -1;
  }

  /** Change the drawing resolution (the canvas's width and height attributes). The camera keeps looking at the same spot. */
  resize(w, h) {
    this.canvas.width = Math.max(1, Math.round(w)); this.canvas.height = Math.max(1, Math.round(h));
    this._limitZoom();
  }

  // ── camera (in view pixels)
  fit() {
    const c = this.camera;
    c.x = this.mapW / 2; c.y = this.mapH / 2;
    c.zoom = Math.max(this.minZoom, Math.min(this.canvas.width / this.mapW, this.canvas.height / this.mapH));
  }
  pan(dx, dy) {
    const c = this.camera, b = this.bounds;
    c.x = Math.min(b ? b.x1 : this.mapW, Math.max(b ? b.x0 : 0, c.x - dx / c.zoom)); c.y = Math.min(b ? b.y1 : this.mapH, Math.max(b ? b.y0 : 0, c.y - dy / c.zoom));
  }
  /** Zoom by `factor`, keeping the point under canvas pixel (sx, sy) fixed. */
  zoomAt(sx, sy, factor) {
    const c = this.camera, z0 = c.zoom, z1 = Math.min(this.maxZoom, Math.max(this.minZoom, z0 * factor));
    c.x += (sx - this.canvas.width / 2) * (1 / z0 - 1 / z1); c.y += (sy - this.canvas.height / 2) * (1 / z0 - 1 / z1);
    c.zoom = z1; this.pan(0, 0);
  }
  /** Canvas pixel → view pixel. */
  _unproject(sx, sy) {
    const c = this.camera;
    return [(sx - this.canvas.width / 2) / c.zoom + c.x, (sy - this.canvas.height / 2) / c.zoom + c.y];
  }

  /** What to fill the ground with for `key`: its texture if the sprite sheet has one, else `color`. */
  _groundFill(g, key, color) {
    const r = this.groundRects?.[key];
    if (!r) return color;
    const P = this._patterns ??= new Map();
    let p = P.get(key);
    if (!p) {
      const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
      c.getContext('2d').drawImage(this.sprites.image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      p = g.createPattern(c, 'repeat'); P.set(key, p);
    }
    return p;
  }
  /** Where person i's image is in the atlas table, for frame f; `still` = arrived and doing it, not walking. */
  _agentUV(i, f, still) {
    const sim = this.sim, look = sim.look;
    return ((((sim.type[i] * sim.A + sim.action[i]) * this.variants + (look ? look[i] % this.variants : 0)) * this.stills + (still && this.stills > 1 ? Math.min(still | 0, this.stills - 1) : 0)) * this.frames + f) * 2;
  }

  /** The building image to show right now: by crowd level (with some stickiness, so it does not flicker), or the closed one. */
  _buildingImage(b, sp, tick) {
    const st = b.state !== undefined && sp.states?.[b.state];   // a state of the game's own (on fire, under snow…) with images for it
    if (st) return st.rect(st.frames > 1 ? ((tick / (st.frameTicks ?? 8)) | 0) % st.frames : 0, b.rot);
    if (!b.open) return sp.closed(b.rot);
    const f = b.load * (sp.levels - 1);
    let lvl = b._lvl ?? 0;
    if (sp.level) lvl = Math.max(0, Math.min(sp.levels - 1, sp.level(b) | 0));        // the art's own reading of how full it is
    else if (f > lvl + 0.6 || f < lvl - 0.6) lvl = Math.max(0, Math.min(sp.levels - 1, Math.round(f)));
    b._lvl = lvl;
    return sp.rect(lvl, sp.frames > 1 ? ((tick / (sp.frameTicks ?? 8)) | 0) % sp.frames : 0, b.rot);
  }

  /** Free GPU resources. Call before creating another view on the same canvas. */
  dispose() { this.batch.dispose(); }

  /**
   * Draw one frame. `alpha` (0..1) is how far real time has moved from the last simulation tick towards the next:
   * agents are drawn that far along their last step, so motion stays smooth when ticks are rarer than frames.
   */
  render(alpha = 1) {
    const P = this.profile ? this.prof : null, t0 = P ? performance.now() : 0;
    if (!this.sprites) throw new Error('setSprites() was not called');
    if (this._atlasDirty) { this.batch.setAtlas(this.sprites.image); this._atlasDirty = false; }
    if (this._worldVersion !== this.world.version) {
      const t = performance.now();
      if (t >= this._nextRepaint) {                               // on huge maps repainting the ground is slow: do it at most 4× a second
        const parts = this._rebuildStatic();
        if (Array.isArray(parts) && this.batch._plainGround) {     // only what changed is sent again
          for (const [x, y, w, h, pixels] of parts) {
            if (pixels) { this.batch.setGroundPart(pixels, x, y); continue; }   // the part came with its pixels (an ImageData): sent as they are
            const c = this._partCanvas ??= document.createElement('canvas');
            if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
            c.getContext('2d').drawImage(this.ground, x, y, w, h, 0, 0, w, h);
            this.batch.setGroundPart(c, x, y);
          }
        } else this.batch.setGround(this.ground);
        this._worldVersion = this.world.version;
        this._nextRepaint = performance.now() - t > 30 ? t + 250 : 0;
      }
    }
    const floats = this._fill(alpha);
    const inst = this.batch.inst;
    inst[0] = 0; inst[1] = 0; inst[2] = this.mapW; inst[3] = this.mapH; inst[4] = 0; inst[5] = 0; inst[6] = 0; inst[7] = 0;   // instance 0 is the ground quad
    const t1 = P ? performance.now() : 0;
    this.batch.draw({ floats, camera: this.camera, background: this.background, groundW: this.mapW, groundH: this.mapH, zmax: this.zmax, depth: this.sortByDepth, tint: this.tint });
    if (P) { const t2 = performance.now(); P.fill += t1 - t0; P.submit += t2 - t1; P.frames++; }
  }
}

export { INST };
