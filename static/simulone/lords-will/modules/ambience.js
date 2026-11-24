// Ambience: a soundscape made in the browser, with no recordings. Browser only (Web Audio); nothing to do with the
// engine, so it works with any game or page.
//
// A soundscape is a list of layers. Each layer is one kind of sound and has a `level` function that says, from 0 to 1,
// how much of it should be heard right now. What that depends on (the hour, the season, what the camera is looking at)
// is the game's business: this module only makes the sound and fades it smoothly to the level asked for.
//
// Kinds of layer:
//   noise   a steady rushing sound shaped by a filter: wind, water, a crowd, a fire. Options:
//             filter 'lowpass' | 'bandpass' | 'highpass', freq (Hz), q, gain (loudness at level 1),
//             sway { rate (Hz), depth (0..1) }: slow swelling, like gusts;  wobble { rate, cents }: the pitch drifts
//   chirps  short sliding tones at random moments: birds, crickets, an owl. Options:
//             rate (per second at level 1), freq [low, high] (Hz), slide (how far each note slides, as a ratio: 1.3 up,
//             0.8 down), length (seconds a note lasts), notes [min, max] in one call, gap (seconds between them),
//             gain, tremolo (Hz: a fast flutter, for crickets)
//   ticks   short knocks at random moments: an axe, a hammer, a crackle. Options:
//             rate, freq [low, high], q, length, gain
// A one-off sound is played with `strike(name)` from the `strikes` given: a bell, so far ({ freq, partials, length, gain }).
//
// Browsers only let sound start after the person has touched the page: call `start()` from a tap or a click.

const clamp = v => Math.max(0, Math.min(1, v));
const between = ([a, b]) => a + Math.random() * (b - a);

/**
 * @param {object} def
 * @param {Array<object>} def.layers     [{ id, kind, level: () => number, ...options }]
 * @param {Record<string, object>} [def.strikes]   one-off sounds by name
 * @param {number} [def.volume=0.6]      overall loudness, 0..1
 * @param {number} [def.fade=1.5]        seconds a layer takes to follow its level
 */
export function createAmbience(def) {
  const A = { on: false, volume: def.volume ?? 0.6, levels: {} };
  let ctx = null, master = null, noise = null, voices = [], last = 0;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    const squash = ctx.createDynamicsCompressor();             // many small sounds at once must not clip
    master.connect(squash); squash.connect(ctx.destination);
    // two seconds of hiss, shared by every noise layer and every tick
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    voices = def.layers.map(l => {
      const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
      const v = { def: l, out, due: 0 };
      if (l.kind === 'noise') {
        const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
        const f = ctx.createBiquadFilter(); f.type = l.filter ?? 'lowpass'; f.frequency.value = l.freq ?? 600; f.Q.value = l.q ?? 0.7;
        const swell = ctx.createGain(); swell.gain.value = 1;
        src.connect(f); f.connect(swell); swell.connect(out);
        if (l.sway) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = l.sway.rate; g.gain.value = l.sway.depth / 2; swell.gain.value = 1 - l.sway.depth / 2; o.connect(g); g.connect(swell.gain); o.start(); }
        if (l.wobble) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = l.wobble.rate; g.gain.value = l.wobble.cents; o.connect(g); g.connect(f.detune); o.start(); }
        src.start();
      }
      return v;
    });
  }

  // one sliding note (or a few) of a chirps layer
  function chirp(v, level) {
    const l = v.def, n = Math.round(between(l.notes ?? [1, 1])), base = between(l.freq), len = l.length ?? 0.08, gap = l.gap ?? len * 1.4;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(v.out); }
    for (let k = 0; k < n; k++) {
      const t = ctx.currentTime + 0.02 + k * gap, o = ctx.createOscillator(), g = ctx.createGain();
      const f0 = base * (1 + (Math.random() - 0.5) * 0.08);
      o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (l.slide ?? 1.2), t + len);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((l.gain ?? 0.2) * (0.5 + level * 0.5), t + len * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g);
      if (l.tremolo) { const m = ctx.createOscillator(), mg = ctx.createGain(), am = ctx.createGain(); m.frequency.value = l.tremolo; mg.gain.value = 0.5; am.gain.value = 0.5; m.connect(mg); mg.connect(am.gain); g.connect(am); am.connect(pan ?? v.out); m.start(t); m.stop(t + len + 0.05); }
      else g.connect(pan ?? v.out);
      o.start(t); o.stop(t + len + 0.05);
    }
  }
  // one knock of a ticks layer
  function tick(v, level) {
    const l = v.def, t = ctx.currentTime + 0.02, len = l.length ?? 0.06;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = between(l.freq); f.Q.value = l.q ?? 4;
    const g = ctx.createGain(); g.gain.setValueAtTime((l.gain ?? 0.4) * (0.5 + level * 0.5) * (0.6 + Math.random() * 0.4), t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f); f.connect(g); g.connect(v.out);
    src.start(t, Math.random() * 1.5, len + 0.05);
  }

  /** Begin (call from a tap or a click). Safe to call again. Returns false if this browser has no sound. */
  A.start = () => {
    try {
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
      A.on = true; master.gain.setTargetAtTime(A.volume, ctx.currentTime, 0.5);
      return true;
    } catch (e) { return false; }
  };
  /** Fall silent (the sound can be started again). */
  A.stop = () => { A.on = false; if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.2); };
  /** Hold everything while the page is out of sight, and pick it up after. */
  A.sleep = asleep => { if (!ctx) return; if (asleep) ctx.suspend(); else if (A.on) ctx.resume(); };
  /** Overall loudness, 0..1. */
  A.setVolume = v => { A.volume = clamp(v); if (ctx && A.on) master.gain.setTargetAtTime(A.volume, ctx.currentTime, 0.2); };

  /**
   * Follow the levels. Call it often (every frame is fine): it asks each layer's `level`, fades towards it, and
   * decides when the next chirp or knock falls.
   */
  A.update = () => {
    if (!ctx || !A.on || ctx.state !== 'running') return;
    const now = ctx.currentTime, dt = Math.min(0.5, now - last); last = now;
    for (const v of voices) {
      const level = clamp(v.def.level());
      A.levels[v.def.id] = level;
      if (v.def.kind === 'noise') { v.out.gain.setTargetAtTime(level * (v.def.gain ?? 0.3), now, (def.fade ?? 1.5) / 3); continue; }
      v.out.gain.setTargetAtTime(level > 0.01 ? 1 : 0, now, 0.3);
      if (level <= 0.01) { v.due = 0; continue; }
      v.due -= dt;
      if (v.due <= 0) {
        (v.def.kind === 'chirps' ? chirp : tick)(v, level);
        v.due = -Math.log(1 - Math.random() * 0.999) / ((v.def.rate ?? 1) * level);   // random gaps, on average 1 / rate apart
      }
    }
  };

  /** Play a one-off sound by name, `times` times `every` seconds apart. */
  A.strike = (name, times = 1, every = 1.4) => {
    const s = def.strikes?.[name];
    if (!s || !ctx || !A.on) return;
    for (let k = 0; k < times; k++) {
      const t = ctx.currentTime + 0.05 + k * every;
      (s.partials ?? [[1, 1], [2, 0.6], [2.4, 0.4], [3, 0.3], [4.2, 0.2]]).forEach(([mult, amp], i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), len = (s.length ?? 3) / (1 + i * 0.5);
        o.frequency.value = s.freq * mult;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((s.gain ?? 0.25) * amp, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + len + 0.1);
      });
    }
  };

  return A;
}
