// A loading screen for a game's world: it covers the page while the art arrives and the world is laid out, so the
// player never sees half a world or the engine's stand-in shapes. Generic: it knows nothing about what is loaded.
//
//   const loader = createLoader({ title: 'The Colony' });           // covers the page at once
//   const url = await loader.fetch('./art.png', 'the drawings');     // downloaded with a progress bar, as a local URL
//   loader.track(somePromise, 'the sounds');                         // anything else to wait for
//   ...make the game, give it its sprites...
//   await loader.ready();                                           // waits for all of it, lets one frame draw, uncovers
//
//   await loader.run('a new colony', () => startOver());             // cover, let the cover show, do the work, uncover
//
// The cover takes its colours from the kit's tokens (--k-bg, --k-ink, --k-dim, --k-line) unless `colors` says otherwise.

const CSS = `
.w-load { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  padding: 24px max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px));
  background: var(--w-bg); color: var(--w-ink); font-family: var(--k-font, system-ui, -apple-system, 'Segoe UI', sans-serif); text-align: center;
  opacity: 1; transition: opacity .25s ease; touch-action: none; user-select: none; -webkit-user-select: none; }
.w-load.out { opacity: 0; pointer-events: none; }
.w-load[hidden] { display: none; }
.w-load h1 { margin: 0; font-size: clamp(24px, 6vw, 34px); font-weight: 600; line-height: 1.15; letter-spacing: -0.01em; }
.w-load p { margin: 0; font-size: 14px; color: var(--w-dim); min-height: 1.4em; }
.w-load .w-bar { width: min(240px, 70vw); height: 4px; border-radius: 99px; background: var(--w-line); overflow: hidden; position: relative; }
.w-load .w-bar i { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--w-ink); border-radius: 99px; transition: width .2s ease; }
.w-load.wait .w-bar i { width: 30%; transition: none; animation: w-slide 1.1s ease-in-out infinite; }
@keyframes w-slide { from { left: -30%; } to { left: 100%; } }
@media (prefers-reduced-motion: reduce) { .w-load, .w-load .w-bar i { transition: none; } .w-load.wait .w-bar i { animation: none; width: 100%; opacity: .4; } }`;

// The next drawn frame; a page that is out of sight draws none, so not longer than a moment.
const frame = () => new Promise(r => { requestAnimationFrame(() => r()); setTimeout(r, 150); });

/**
 * @param {object}  [o]
 * @param {string}  [o.title]   shown large on the cover (the game's name)
 * @param {string}  [o.text]    the first line under it
 * @param {Element} [o.parent]  where the cover goes (document.body)
 * @param {object}  [o.colors]  { bg, ink, dim, line } to use instead of the kit's tokens
 * @param {boolean} [o.shown]   false: make it hidden, to show later with show() or run()
 */
export function createLoader({ title = '', text = 'loading', parent = document.body, colors = {}, shown = true } = {}) {
  if (!document.getElementById('w-load-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'w-load-css', textContent: CSS }));
  const el = document.createElement('div');
  el.className = 'w-load wait';
  el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<h1></h1><p></p><div class="w-bar"><i></i></div>';
  const [h1, line, bar] = [el.querySelector('h1'), el.querySelector('p'), el.querySelector('i')];
  h1.textContent = title;
  const tone = (k, token, fallback) => el.style.setProperty('--w-' + k, colors[k] ?? `var(${token}, ${fallback})`);
  tone('bg', '--k-bg', '#f3efe6'); tone('ink', '--k-ink', '#22201c'); tone('dim', '--k-dim', '#6c665b'); tone('line', '--k-line', '#dcd4c4');
  el.addEventListener('pointerdown', e => e.stopPropagation(), true);   // a touch on the cover reaches nothing under it
  parent.append(el);

  let tasks = [], isShown = false, hideTimer = 0;
  function paint() {
    const known = tasks.filter(t => t.part !== null);
    if (!tasks.length || !known.length) { el.classList.add('wait'); return; }
    el.classList.remove('wait');
    bar.style.width = Math.round(100 * tasks.reduce((s, t) => s + (t.done ? 1 : t.part ?? 0), 0) / tasks.length) + '%';
  }
  function say(t) { if (t) line.textContent = t; }

  const loader = {
    el,
    get shown() { return isShown; },
    /** Cover the page now, with this line under the title. Starts a fresh count of things to wait for. */
    show(t = text) {
      clearTimeout(hideTimer);
      tasks = []; say(t); paint();
      el.hidden = false; el.classList.remove('out'); isShown = true;
      return loader;
    },
    /** Change the line under the title. */
    say(t) { say(t); return loader; },
    /** Wait for this too. `part` (0..1) may be updated through the returned task while it runs, for a bar that moves. */
    track(promise, label) {
      const t = { done: false, part: null, label };
      tasks.push(t); say(label); paint();
      const end = () => { t.done = true; paint(); const next = tasks.find(x => !x.done); if (next) say(next.label); };
      t.promise = Promise.resolve(promise).then(v => { end(); return v; }, e => { end(); throw e; });
      return t.promise;
    },
    /**
     * Download a file with the bar following the bytes. Resolves to a URL for it (a blob: URL, or the URL itself where
     * the download could not be read that way: the browser then fetches it as usual).
     */
    fetch(url, label) {
      const t = { done: false, part: 0, label };
      tasks.push(t); say(label); paint();
      const work = (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) return url;
          const size = +res.headers.get('content-length') || 0;
          if (!res.body || !size) { const b = await res.blob(); return URL.createObjectURL(b); }
          const reader = res.body.getReader(), parts = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(value); got += value.length; t.part = Math.min(0.99, got / size); paint();
          }
          return URL.createObjectURL(new Blob(parts, { type: res.headers.get('content-type') || '' }));
        } catch (e) { return url; }
      })();
      t.promise = work.then(v => { t.done = true; paint(); const next = tasks.find(x => !x.done); if (next) say(next.label); return v; });
      return t.promise;
    },
    /** Wait for everything tracked, let the game draw a frame or two with it, then uncover the page. */
    async ready(t) {
      say(t);
      await Promise.allSettled(tasks.map(x => x.promise));
      await frame(); await frame();
      loader.hide();
    },
    /** Cover the page, let the cover show, do the work (it may return a promise), then ready(). Returns what the work returned. */
    async run(t, work) {
      loader.show(t);
      await frame(); await frame();                 // the cover is on screen before the work holds the page up
      let out;
      try { out = await work(); } finally { await loader.ready(); }
      return out;
    },
    /** Uncover the page now. */
    hide() {
      if (!isShown) return;
      isShown = false; el.classList.add('out');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { if (!isShown) el.hidden = true; }, 300);
    },
  };
  if (shown) loader.show(text); else el.hidden = true;
  return loader;
}
