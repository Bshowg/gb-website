// The page kit: the phone screen every game here shares. Page code, not simulation code: it knows
// nothing about any game, and a game's page fills it in.
//
//   top strip     the moment, a few key numbers, a control or two, one line of what is coming
//   the map       the canvas fills everything in between; toasts, a card and a question float over it
//   a sheet       slides up from the bottom when a bar button is picked; the map shrinks, it is never covered whole
//   the goal      one line above the bar
//   bottom bar    the game's sections
//   full screen   one overlay for the rare moment that should stop play (a season's report, a welcome)
//
// Layout: one flex column filling the viewport inside the host's safe areas. Colours are tokens with a
// light and a dark set; a game may restyle by redefining the --k-* tokens on :root.

const CSS = `
:root { --k-bg: #f4f2ea; --k-panel: #ebe8dc; --k-ink: #1c1f17; --k-dim: #6f6a4f; --k-line: #cfcab6; --k-warn: #a8321c; --k-on-ink: #f4f2ea;
        --k-font: ui-monospace, 'Cascadia Mono', Consolas, 'DejaVu Sans Mono', monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --k-bg: #1b1d17; --k-panel: #25281f; --k-ink: #ecead8; --k-dim: #a39e85; --k-line: #4d5042; --k-warn: #ff8a6b; --k-on-ink: #1b1d17; color-scheme: dark } }
:root[data-theme="dark"] { --k-bg: #1b1d17; --k-panel: #25281f; --k-ink: #ecead8; --k-dim: #a39e85; --k-line: #4d5042; --k-warn: #ff8a6b; --k-on-ink: #1b1d17; color-scheme: dark }
html, body { height: 100%; }
body { margin: 0; background: var(--k-bg); color: var(--k-ink); font: 13px/1.4 var(--k-font); overflow: hidden; }
.k-app { height: 100%; display: flex; flex-direction: column; position: relative; }
.k-app [hidden] { display: none !important; }
.k-app button { font: inherit; color: var(--k-ink); background: transparent; border: 1px solid var(--k-ink); padding: 7px 10px; cursor: pointer; border-radius: 0; }
.k-app button.on { background: var(--k-ink); color: var(--k-on-ink); }
.k-app button:disabled { opacity: .45; cursor: default; }
.k-app button:focus-visible { outline: 2px solid var(--k-warn); outline-offset: 1px; }
.k-app b { font-weight: normal; background: var(--k-ink); color: var(--k-on-ink); padding: 0 4px; }
.k-app small, .k-dim { color: var(--k-dim); }
.k-app b.warn, .k-warn { background: var(--k-warn); color: var(--k-on-ink); padding: 0 4px; }
.k-pad { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.k-top { padding-block: 6px; display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; border-bottom: 1px solid var(--k-ink); font-variant-numeric: tabular-nums; }
.k-when { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.k-ctl { display: flex; gap: 4px; }
.k-ctl button { padding: 5px 8px; min-width: 3.2em; }
.k-ctl .k-exit { order: 9; }
.k-nums { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 2px 14px; }
.k-nums span { white-space: nowrap; }
.k-sub { grid-column: 1 / -1; color: var(--k-dim); min-height: 1.4em; }
.k-stage { flex: 1 1 0; min-height: 80px; position: relative; overflow: hidden; background: var(--k-panel); }
.k-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; image-rendering: pixelated; touch-action: none; }
.k-toasts { position: absolute; left: 0; right: 0; top: 40px; display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none; }
.k-toast { background: var(--k-ink); color: var(--k-on-ink); padding: 5px 10px; max-width: 92%; animation: k-in .18s ease-out; }
.k-toast b { background: var(--k-on-ink); color: var(--k-ink); }
.k-corner { position: absolute; top: 6px; left: max(6px, env(safe-area-inset-left, 0px)); display: flex; gap: 4px; }
.k-corner button { background: var(--k-bg); padding: 4px 8px; }
.k-float { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; gap: 6px; padding-block: 6px; pointer-events: none; }
.k-float > * { pointer-events: auto; }
.k-card { background: var(--k-bg); border: 1px solid var(--k-ink); padding: 6px 10px; max-height: 40vh; overflow-y: auto; }
.k-card button { padding: 2px 6px; margin: 2px 2px 2px 0; }
.k-card .x { float: right; margin: 0 0 4px 8px; }
.k-ask { background: var(--k-ink); color: var(--k-on-ink); padding: 10px; }
.k-app .k-ask button { border-color: var(--k-on-ink); color: var(--k-on-ink); margin: 8px 6px 0 0; }
.k-ask small { color: var(--k-on-ink); opacity: .75; }
.k-sheet { flex: 0 1 auto; max-height: 46%; display: flex; flex-direction: column; border-top: 1px solid var(--k-ink); background: var(--k-bg); min-height: 0; }
.k-sheet-head { display: flex; justify-content: space-between; align-items: center; padding-block: 4px; border-bottom: 1px solid var(--k-line); }
.k-sheet-head span { text-transform: uppercase; letter-spacing: .05em; font-size: 12px; color: var(--k-dim); }
.k-sheet-head button { padding: 3px 8px; }
.k-sheet-body { overflow-y: auto; padding-block: 8px; min-height: 0; -webkit-overflow-scrolling: touch; }
.k-sheet-body p { margin: 0 0 6px; }
.k-sheet-body h3 { font: inherit; font-size: 12px; color: var(--k-dim); text-transform: uppercase; letter-spacing: .05em; margin: 10px 0 4px; }
.k-sheet-body table { border-collapse: collapse; font: inherit; font-variant-numeric: tabular-nums; }
.k-sheet-body td, .k-sheet-body th { text-align: right; padding: 1px 10px 1px 0; font-weight: normal; white-space: nowrap; }
.k-sheet-body th { color: var(--k-dim); border-bottom: 1px solid var(--k-line); }
.k-sheet-body td:first-child, .k-sheet-body th:first-child { text-align: left; }
.k-sheet-body ul { list-style: none; margin: 0; padding: 0; }
.k-scroll { overflow-x: auto; }
.k-tray { display: flex; flex-direction: column; gap: 6px; padding-block: 7px; }
.k-tray-text { min-width: 0; }
.k-tray-btns { display: flex; gap: 6px; }
.k-tray-btns button { flex: 1 1 0; min-width: 0; padding: 10px 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-tray-btns button.strong { flex-grow: 1.25; background: var(--k-ink); color: var(--k-on-ink); }
.k-tray-btns button[disabled] { opacity: .4; }
.k-app.k-focus .k-when, .k-app.k-focus .k-ctl, .k-app.k-focus .k-sub, .k-app.k-focus .k-goal, .k-app.k-focus .k-bar,
.k-app.k-focus .k-sheet-head, .k-app.k-focus .k-sheet-body { display: none; }
.k-app.k-focus .k-top { padding-block: 4px; }
.k-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.k-chips button { padding: 5px 8px; }
.k-rows button { display: block; width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--k-line); padding: 6px 0; }
.k-goal { display: block; width: 100%; text-align: left; border: 0 !important; border-top: 1px solid var(--k-line) !important; padding-block: 5px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-bar { display: flex; border-top: 1px solid var(--k-ink); padding: 0 env(safe-area-inset-right, 0px) 2px env(safe-area-inset-left, 0px); }
.k-bar button { flex: 1 1 0; min-width: 0; border: 0; border-right: 1px solid var(--k-line); padding: 11px 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-bar button:last-child { border-right: 0; }
.k-bar.many button { font-size: 12px; padding-left: 0; padding-right: 0; }
.k-bar button.hint { animation: k-hint 1.2s ease-in-out infinite; }
.k-meter { display: inline-block; width: 70px; height: 7px; border: 1px solid var(--k-ink); vertical-align: middle; margin: 0 6px; }
.k-meter i { display: block; height: 100%; background: var(--k-ink); }
.k-need { display: inline-block; white-space: nowrap; margin-right: 10px; }
.k-need .k-meter { width: 40px; margin: 0 0 0 4px; }
.k-full { position: absolute; inset: 0; background: var(--k-bg); z-index: 5; display: flex; flex-direction: column; justify-content: center; padding-block: 20px; overflow-y: auto; }
.k-full-in { max-width: 520px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.k-full h1 { font: inherit; font-size: 20px; margin: 0 0 10px; text-wrap: balance; }
.k-full p { margin: 0 0 8px; }
.k-full button { margin-top: 10px; padding: 10px 16px; }
@keyframes k-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
@keyframes k-hint { 0%, 100% { background: transparent; } 50% { background: var(--k-line); } }
@media (prefers-reduced-motion: reduce) { .k-toast, .k-bar button.hint { animation: none; } .k-bar button.hint { background: var(--k-line); } }
`;

/** A progress bar as HTML, for 0..1. */
export const meter = v => `<span class="k-meter"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span>`;

/**
 * Build the screen inside `root` (usually document.body). Returns the pieces a page fills in.
 * Nothing here runs a game loop: call `refresh()` from the game's own frame callback to redraw an open sheet.
 */
export function createScreen(root = document.body) {
  if (!document.getElementById('k-style')) { const st = document.createElement('style'); st.id = 'k-style'; st.textContent = CSS; document.head.append(st); }
  root.insertAdjacentHTML('beforeend', `
    <div class="k-app">
      <header class="k-top k-pad"><div class="k-when"></div><div class="k-ctl"></div><div class="k-nums"></div><div class="k-sub"></div></header>
      <div class="k-stage"><canvas></canvas><div class="k-toasts"></div><div class="k-corner"></div>
        <div class="k-float k-pad"><div class="k-ask" hidden></div><div class="k-card" hidden></div></div></div>
      <section class="k-sheet" hidden><div class="k-sheet-head k-pad"><span></span><button type="button">close</button></div><div class="k-sheet-body k-pad"></div><div class="k-tray k-pad" hidden></div></section>
      <button type="button" class="k-goal k-pad" hidden></button>
      <nav class="k-bar"></nav>
      <div class="k-full k-pad" hidden><div class="k-full-in"></div></div>
    </div>`);
  const app = root.querySelector('.k-app'), q = s => app.querySelector(s);
  const el = { when: q('.k-when'), ctl: q('.k-ctl'), nums: q('.k-nums'), sub: q('.k-sub'), stage: q('.k-stage'), toasts: q('.k-toasts'), corner: q('.k-corner'),
               ask: q('.k-ask'), card: q('.k-card'), sheet: q('.k-sheet'), sheetTitle: q('.k-sheet-head span'), sheetBody: q('.k-sheet-body'), tray: q('.k-tray'), goal: q('.k-goal'), bar: q('.k-bar'), full: q('.k-full'), fullIn: q('.k-full-in') };
  const sections = new Map();                              // id -> { button, title, render, onOpen, onClose }
  let asked = null;

  /** Set an element's HTML only if it changed, so buttons inside keep their state between refreshes. */
  const html = (node, text) => { if (node._html !== text) { node.innerHTML = text; node._html = text; } };

  const S = {
    canvas: q('canvas'), el, html,
    /** The id of the open sheet, or null. */
    open: null,
    /** Called just before the page is left through the exit button (see KIT_EXIT below): save here. */
    onExit: null,
    /** Called with the canvas size in CSS pixels whenever the map area changes size. */
    onResize: null,

    /** The moment (top left) and the line under the numbers (what is coming). */
    when(text) { html(el.when, text); },
    sub(text) { html(el.sub, text); },
    /** The key numbers: [{ label, value, warn }]. */
    numbers(list) { html(el.nums, list.map(n => `<span>${n.label} ${n.warn ? `<b class="warn">${n.value}</b>` : n.value}</span>`).join('')); },
    /** A control at the top right. Returns the button: set its text or class as the game's state changes. */
    control(label, onTap) { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = label; b.onclick = () => onTap(b); el.ctl.append(b); return b; },
    /** A small button over the map's top left corner. */
    corner(label, onTap) { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = label; b.onclick = () => onTap(b); el.corner.append(b); return b; },

    /**
     * The bottom bar: [{ id, label, title?, render(body), onOpen?, onClose? }]. Picking one opens its sheet; picking it again closes it.
     * `render` fills the sheet's body and is called again on every refresh() while it is open.
     */
    bar(items) {
      el.bar.textContent = ''; sections.clear(); el.bar.classList.toggle('many', items.length > 6);
      for (const it of items) {
        const b = document.createElement('button'); b.type = 'button'; b.innerHTML = it.label;
        b.onclick = () => (S.open === it.id ? S.close() : S.show(it.id));
        el.bar.append(b); sections.set(it.id, { ...it, button: b });
      }
    },
    show(id) {
      if (S.open === id) return;
      S.close();
      const s = sections.get(id);
      if (!s) return;
      S.open = id; s.button.classList.add('on'); s.button.classList.remove('hint');
      el.sheetTitle.textContent = s.title ?? s.button.textContent; el.sheetBody._html = null; el.sheetBody.textContent = ''; el.sheet.hidden = false; el.sheetBody.scrollTop = 0;
      if (s.onOpen) s.onOpen();
      s.render(el.sheetBody);
    },
    close() {
      const s = sections.get(S.open);
      if (!s) return;
      S.open = null; s.button.classList.remove('on'); el.sheet.hidden = true; S.tray(null);
      if (s.onClose) s.onClose();
    },
    /**
     * Fold the open sheet down to one strip, so the map has the screen: { html, buttons: [{ id, label, strong?, disabled? }],
     * onTap(id) }. While it is up, everything not needed for the job is put away too: the clock, the controls, the line of
     * what is coming, the goal and the bar; the key numbers stay. Pass null to unfold the sheet again. Calling it again
     * with the same buttons only changes the text, so the buttons stay put under the player's finger.
     */
    tray(t) {
      app.classList.toggle('k-focus', !!t); el.tray.hidden = !t; S.trayOpen = !!t;
      if (!t) { el.tray._html = null; return; }
      html(el.tray, `<div class="k-tray-text"></div><div class="k-tray-btns">` + t.buttons.map(b => `<button type="button" data-id="${b.id}" class="${b.strong ? 'strong' : ''}">${b.label}</button>`).join('') + `</div>`);
      html(el.tray.firstChild, t.html);
      t.buttons.forEach((b, i) => { el.tray.lastChild.children[i].disabled = !!b.disabled; });
      el.tray.onclick = e => { const b = e.target.closest('button'); if (b && !b.disabled) t.onTap(b.dataset.id); };
    },
    trayOpen: false,
    /** Redraw the open sheet (cheap when nothing changed, if its render uses html()). */
    refresh() { const s = sections.get(S.open); if (s) s.render(el.sheetBody); },
    /** Draw the eye to one bar button (the tutorial's next step), or to none. */
    hint(id) { for (const [k, s] of sections) s.button.classList.toggle('hint', k === id && S.open !== k); },

    /** The one-line goal above the bar; tapping it calls onTap. Pass null to hide it. */
    goal(text, onTap) { el.goal.hidden = text === null; if (text !== null) { html(el.goal, text); el.goal.onclick = onTap ?? null; } },

    /** A card over the bottom of the map (who or what was tapped). Pass null to put it away. Clicks inside reach `onCard`. */
    card(text) { el.card.hidden = text === null; if (text !== null) html(el.card, text); },
    onCard: null,
    /**
     * A question over the map: { id, html, choices: [{ id, label }], onChoose(choiceId), note? }. Pass null to take it down.
     * Asking the same id again only updates the note, so the buttons stay put under the player's finger.
     */
    ask(a) {
      if (!a) { asked = null; el.ask.hidden = true; return; }
      if (asked !== a.id) {
        asked = a.id; el.ask.hidden = false;
        el.ask.innerHTML = `${a.html}<br>${a.choices.map(c => `<button type="button" data-choice="${c.id}">${c.label}</button>`).join('')}<br><small></small>`;
        for (const b of el.ask.querySelectorAll('button')) b.onclick = () => a.onChoose(b.dataset.choice);
      }
      el.ask.querySelector('small').textContent = a.note ?? '';
    },
    /** A line that appears over the top of the map and goes away by itself. */
    toast(text, ms = 4500) {
      const t = document.createElement('div'); t.className = 'k-toast'; t.innerHTML = text;
      el.toasts.append(t);
      while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
      setTimeout(() => t.remove(), ms);
    },
    /** The full-screen moment: { title, html, button, onClose }. Only one at a time; a second replaces the first. */
    full(f) {
      if (!f) { el.full.hidden = true; return; }
      el.fullIn.innerHTML = `<h1>${f.title}</h1>${f.html}<button type="button">${f.button ?? 'carry on'}</button>`;
      el.full.hidden = false; el.full.scrollTop = 0;
      el.fullIn.lastElementChild.onclick = () => { el.full.hidden = true; if (f.onClose) f.onClose(); };
    },
    get fullOpen() { return !el.full.hidden; },

    /** Another canvas over the map, the same size, that takes no touches: for a page's own drawing on top of the game's. */
    layer() { const c = document.createElement('canvas'); c.style.pointerEvents = 'none'; S.canvas.after(c); return c; },
    /** The map area's size in CSS pixels right now. */
    size() { const r = el.stage.getBoundingClientRect(); return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))]; },
  };
  el.sheet.querySelector('button').onclick = () => S.close();
  // A way out, when the page was opened from somewhere that wants it back (a menu of games sets
  // globalThis.KIT_EXIT = { href, label } before the game starts). The game is told first (onExit), so it can save.
  const way = globalThis.KIT_EXIT;
  if (way?.href) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'k-exit'; b.textContent = way.label ?? 'exit';
    b.onclick = () => { try { if (S.onExit) S.onExit(); } catch (e) { console.error(e); } dispatchEvent(new Event('pagehide')); location.href = way.href; };
    el.ctl.append(b);
  }
  el.card.onclick = e => { if (S.onCard) S.onCard(e); };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (S.onResize) S.onResize(...S.size()); }).observe(el.stage);
  return S;
}
