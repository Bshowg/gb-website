// Pointer input for the canvas: drag to pan, pinch or wheel to zoom.
// If a tool is active, a single pointer calls it with the grid cell under the pointer instead of panning.
// With no tool, a touch that lifts without having moved is a tap.
// A tool may decline a touch by returning false from its 'down' call: that touch then pans the map as if there were no
// tool, and if it lifts without having moved the tool is called once more with the phase 'tap'.

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('../../shared/engine/renderer.js').Renderer} renderer
 * @param {() => (null | ((x:number, y:number, phase:'down'|'drag'|'up'|'cancel'|'tap') => void | false))} getTool
 * @param {(sx:number, sy:number) => void} [onTap]  called with the canvas pixel of a tap made while no tool is active
 * @returns {() => void} detach function
 */
export function attachInput(canvas, renderer, getTool, onTap) {
  const pointers = new Map();
  let pinch = 0, toolPointer = null, lastTool = null, declined = false;   // declined: the tool left this touch to the map
  let tapFrom = null, tapMoved = 0;                  // where a possible tap went down, and how far it has strayed
  const xy = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * canvas.width, (e.clientY - r.top) / r.height * canvas.height];
  };
  const pinchDist = () => { const [p, q] = [...pointers.values()]; return Math.hypot(p[0] - q[0], p[1] - q[1]) || 1; };
  // phase: 'down' on first contact, 'drag' while the pointer moves, 'up' when it lifts, and
  // 'cancel' if a second finger turns the gesture into a pinch. So a tool can act continuously
  // (demolish), once per tap, or on lift (a line from where the finger went down to where it came up).
  const useTool = (p, phase) => { const [x, y] = renderer.screenToCell(p[0], p[1]); lastTool = getTool(); return lastTool(x, y, phase); };

  const down = e => {
    const p = xy(e);
    pointers.set(e.pointerId, p);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer: carry on */ }
    if (pointers.size === 2) {
      pinch = pinchDist();
      if (toolPointer !== null) { toolPointer = null; lastTool(0, 0, 'cancel'); }
      tapFrom = null;
    } else if (pointers.size === 1 && getTool()) {
      declined = useTool(p, 'down') === false;
      if (declined) { tapFrom = p; tapMoved = 0; } else toolPointer = e.pointerId;
    }
    else if (pointers.size === 1) { declined = false; tapFrom = p; tapMoved = 0; }
  };
  const move = e => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = xy(e), dx = p[0] - prev[0], dy = p[1] - prev[1];
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {                       // two fingers: pinch-zoom and pan together
      const [q, r] = [...pointers.values()], d = pinchDist();
      renderer.pan(dx / 2, dy / 2);
      renderer.zoomAt((q[0] + r[0]) / 2, (q[1] + r[1]) / 2, d / pinch); pinch = d;
    } else if (pointers.size === 1) {
      if (toolPointer === e.pointerId && getTool()) useTool(p, 'drag');
      else if (toolPointer === null && (declined || !getTool())) {
        renderer.pan(dx, dy);
        const r = canvas.getBoundingClientRect();                   // a tap may stray a few pixels of the page, however finely the canvas is drawn
        tapMoved += (Math.abs(dx) + Math.abs(dy)) * (r.width ? r.width / canvas.width : 1);
      }
    }
  };
  const up = e => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (toolPointer === e.pointerId) {
      toolPointer = null;
      if (e.type === 'pointerup' && p) { const [x, y] = renderer.screenToCell(p[0], p[1]); lastTool(x, y, 'up'); }
      else lastTool(0, 0, 'cancel');
    }
    else if (tapFrom && p && e.type === 'pointerup' && pointers.size === 0 && tapMoved < 8) {
      if (declined && getTool()) useTool(p, 'tap'); else if (!declined && onTap) onTap(p[0], p[1]);
    }
    if (pointers.size === 0) { tapFrom = null; declined = false; }
  };
  const wheel = e => { e.preventDefault(); const p = xy(e); renderer.zoomAt(p[0], p[1], e.deltaY < 0 ? 1.15 : 1 / 1.15); };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => {
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('wheel', wheel);
  };
}
