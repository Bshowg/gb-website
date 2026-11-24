// Save slots: the player keeps copies of a game by hand and puts one back by hand.
// Not a hook module: a helper a page calls. It knows nothing of the game itself: a game keeps itself on the device
// under a few storage keys (its map and people, its progress, its region…), and a slot is a copy of all of those keys
// at one moment. Putting a slot back writes the keys back and reloads the page, which then starts from them exactly as
// it does from its own save. So whatever a game saves, a slot saves too, and nothing else has to know.
//
// Besides the slots on this device, a game can be turned into a save code: text to copy, keep anywhere and paste back,
// on this device or another. And a game can be shipped with a ready-made one (a "showcase"): see takeShowcase().
//
// Everything is kept compressed (gzip, then base64) where the browser can, so a few slots fit beside the live game.
// Before anything is put back, the game as it was is kept in an "undo" slot, so a load is never a loss.

const FORMAT = 1;
const CODE_PREFIX = 'SIMULONE1';

// gzip + base64 where the browser has CompressionStream; plain JSON (marked 'J') where it has not.
async function pack(obj) {
  const json = JSON.stringify(obj);
  if (typeof CompressionStream === 'undefined') return 'J' + json;
  const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return 'G' + btoa(s);
}
async function unpack(text) {
  if (!text) return null;
  if (text[0] === 'J') return JSON.parse(text.slice(1));
  if (text[0] !== 'G' || typeof DecompressionStream === 'undefined') return null;
  const bin = atob(text.slice(1)), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(json);
}
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch { return false; } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dateText = t => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * @param {object} def
 * @param {string} def.game          the game's id, used in the storage keys of its slots and in its save codes
 * @param {string[]} def.keys        every storage key the game keeps itself under
 * @param {number} [def.slots=3]     how many slots the player gets
 * @param {() => void} [def.flush]   write the game to its keys now (called before a copy is taken)
 * @param {() => string} [def.describe]  a few words on the game as it is now, kept with a slot ("year 3, 42 people")
 */
export function createSlots(def) {
  const N = def.slots ?? 3, slotKey = n => `simulone-slot:${def.game}:${n}`;
  const S = {
    /** True once the page is being replaced by a load: from then on the game must not save itself over what was loaded. */
    leaving: false,
  };

  // The game as it is on the device now: { v, game, keys: { key: text | null } }.
  const current = () => { def.flush?.(); return { v: FORMAT, game: def.game, keys: Object.fromEntries(def.keys.map(k => [k, get(k)])) }; };
  async function store(n, label) {
    const data = await pack(current());
    return set(slotKey(n), JSON.stringify({ v: FORMAT, label, when: Date.now(), size: data.length, data }));
  }
  const meta = n => { try { const m = JSON.parse(get(slotKey(n)) ?? 'null'); return m && m.v === FORMAT ? m : null; } catch { return null; } };
  // Write a bundle's keys over the game's and start the page again from them. The game before it goes to the undo slot.
  async function apply(bundle) {
    if (!bundle || bundle.game !== def.game || !bundle.keys) return false;
    await store('undo', 'before the last load: ' + (def.describe?.() ?? 'the game as it was'));
    put(bundle);
    return true;
  }
  // Write the keys and reload. Written again as the page goes, after anything of the game's own that still saves on its way out.
  function put(bundle) {
    S.leaving = true;
    const write = () => { for (const k of def.keys) set(k, bundle.keys[k] ?? null); };
    write();
    addEventListener('pagehide', write);
    location.reload();
  }

  /** The slots: [{ n, label, when, size } or null], then the undo slot (or null). */
  S.list = () => ({ slots: Array.from({ length: N }, (_, n) => meta(n + 1)), undo: meta('undo') });
  /** Keep the game in slot n (1…). Resolves to true, or false if the device would not take it (full, or no storage). */
  S.save = n => store(n, def.describe?.() ?? 'saved game');
  /** Put slot n (1… or 'undo') back: the page reloads into it. Resolves to false if there is nothing there to load. */
  S.load = async n => { const m = meta(n); return m ? apply(await unpack(m.data)) : false; };
  /** Forget slot n. */
  S.remove = n => set(slotKey(n), null);
  /** The game now as a save code: text to copy and paste back with fromCode(). */
  S.code = async () => `${CODE_PREFIX}:${def.game}:${await pack(current())}`;
  /** Load a save code. Resolves to false, with S.why set, if it is not a code for this game. */
  S.fromCode = async text => {
    const m = String(text).trim().match(/^([A-Z0-9]+):([\w-]+):(.+)$/s);
    if (!m || m[1] !== CODE_PREFIX) { S.why = 'that is not a save code'; return false; }
    if (m[2] !== def.game) { S.why = `that code is a save of another game (${m[2]})`; return false; }
    let bundle = null;
    try { bundle = await unpack(m[3].replace(/\s+/g, '')); } catch { bundle = null; }
    if (!bundle) { S.why = 'the code is damaged or cut short'; return false; }
    return apply(bundle);
  };

  /**
   * Call first thing on the page, before the game reads its keys. If the address ends in #showcase, the ready-made
   * game at `url` (a save code, as code() gives) is put in place of the player's (theirs goes to the undo slot) and the
   * page starts again without the #showcase. Resolves to true when that is happening: the page should then do nothing more.
   */
  S.takeShowcase = async url => {
    if (location.hash !== '#showcase') return false;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const text = await (await fetch(url)).text(), m = text.trim().match(/^[A-Z0-9]+:[\w-]+:(.+)$/s), bundle = m && await unpack(m[1]);
      if (!bundle || bundle.game !== def.game) return false;
      const had = def.keys.some(k => get(k) !== null);
      if (had) {                                                   // the player's own game is kept, to come back to
        const data = await pack({ v: FORMAT, game: def.game, keys: Object.fromEntries(def.keys.map(k => [k, get(k)])) });
        set(slotKey('undo'), JSON.stringify({ v: FORMAT, label: 'your game from before the showcase', when: Date.now(), size: data.length, data }));
      }
      put(bundle);
      return true;
    } catch (e) { console.error(e); return false; }
  };

  // ── the panel: a page's full-screen overlay shows panel(), then calls wire() once it is on screen.
  let armed = null, codeText = '', note = '', pasting = false;
  const row = (title, m, n) => `<div class="s-row"><div><b>${title}</b><br><small>${m ? `${esc(m.label)} · ${dateText(m.when)} · ${Math.ceil(m.size / 1024)} KB` : 'empty'}</small></div><div class="s-btns">` +
    (n !== 'undo' ? `<button type="button" data-save="${n}">${armed === 's' + n ? 'tap again to replace' : 'save here'}</button>` : '') +
    (m ? `<button type="button" data-load="${n}">${armed === 'l' + n ? 'tap again to load' : 'load'}</button>` : '') + `</div></div>`;
  function inner() {
    const { slots, undo } = S.list();
    return `<p class="s-dim">Kept on this device. Loading one replaces the game you are playing; that game is kept as "undo" first.</p>` +
      slots.map((m, k) => row(`Slot ${k + 1}`, m, k + 1)).join('') + (undo ? row('Undo', undo, 'undo') : '') +
      `<h3>Save code</h3><p class="s-dim">The game as text: copy it somewhere safe, or paste it on another device.</p>` +
      `<div class="s-btns"><button type="button" data-code="copy">copy save code</button><button type="button" data-code="paste">${pasting ? 'cancel' : 'load from a code'}</button></div>` +
      (pasting ? `<textarea class="s-code" rows="4" placeholder="paste a save code here" spellcheck="false"></textarea><div class="s-btns"><button type="button" data-code="go">load this code</button></div>` : '') +
      (codeText ? `<textarea class="s-code" rows="4" readonly>${esc(codeText)}</textarea>` : '') +
      (note ? `<p class="s-note">${esc(note)}</p>` : '');
  }
  /** { title, html } for a full-screen panel. */
  S.panel = () => { armed = null; codeText = ''; note = ''; pasting = false; return { title: 'Saved games', html: `<style>${CSS}</style><div class="s-slots">${inner()}</div>`, button: 'close' }; };
  /** Make the panel's buttons work. Call right after the panel is shown. */
  S.wire = () => {
    const el = document.querySelector('.s-slots');
    if (!el) return;
    const redraw = () => { el.innerHTML = inner(); };
    el.addEventListener('click', async e => {
      const b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      const d = b.dataset;
      if (d.save) {
        const n = +d.save;
        if (meta(n) && armed !== 's' + n) { armed = 's' + n; redraw(); return; }
        armed = null; note = (await S.save(n)) ? `kept in slot ${n}` : 'this device would not keep it (storage full or blocked)';
      } else if (d.load) {
        const n = d.load === 'undo' ? 'undo' : +d.load;
        if (armed !== 'l' + n) { armed = 'l' + n; redraw(); return; }
        note = 'loading…'; redraw();
        if (!(await S.load(n))) note = 'that slot could not be read';
      } else if (d.code === 'copy') {
        codeText = await S.code(); pasting = false;
        try { await navigator.clipboard.writeText(codeText); note = 'copied: paste it somewhere safe'; } catch { note = 'select the code below and copy it'; }
      } else if (d.code === 'paste') { pasting = !pasting; codeText = ''; note = ''; }
      else if (d.code === 'go') {
        const t = el.querySelector('textarea.s-code')?.value ?? '';
        note = 'loading…'; redraw();
        if (!(await S.fromCode(t))) { note = S.why; pasting = true; }
      }
      redraw();
      if (codeText) el.querySelector('textarea[readonly]')?.select();
    });
  };
  return S;
}

const CSS = `.s-slots .s-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 0; border-bottom: 1px solid var(--k-line, #ccc); }
.s-slots .s-row > div:first-child { min-width: 0; flex: 1 1 180px; }
.s-slots .s-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.s-slots .s-btns button { margin-top: 0; padding: 6px 10px; }
.s-slots .s-dim, .s-slots small { color: var(--k-dim, #777); }
.s-slots h3 { font: inherit; font-weight: bold; margin: 16px 0 4px; }
.s-slots textarea { width: 100%; box-sizing: border-box; margin-top: 8px; font: 11px/1.3 var(--k-font, monospace); background: var(--k-panel, #eee); color: var(--k-ink, #222); border: 1px solid var(--k-line, #ccc); word-break: break-all; }
.s-slots .s-note { margin-top: 8px; font-weight: bold; }`;
