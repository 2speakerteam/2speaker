const DOUBLE_TAP_MS = 350;
const TAP_SLOP_PX = 12;

// Select an existing photographed link by its projected position in the scene.
export function nearestPanoramaLink(tap, bounds, links) {
  const candidates = links.flatMap((link) => {
    const rect = link.bounds;
    const left = Math.max(bounds.left, rect.left);
    const right = Math.min(bounds.right, rect.right);
    const top = Math.max(bounds.top, rect.top);
    const bottom = Math.min(bounds.bottom, rect.bottom);
    if (right <= left || bottom <= top) return [];
    const distance = Math.hypot(tap.x - (left + right) / 2, tap.y - (top + bottom) / 2);
    return [{ link, distance }];
  }).sort((a, b) => a.distance - b.distance);
  const closest = candidates[0];
  return closest && closest.distance <= Math.hypot(bounds.width, bounds.height) * 0.45
    ? closest.link : null;
}

export function bindBoardingPanoramaGestures({
  canvas, isActive, getPanorama, getBaseZoom, onSingleTap, allowNativeClick
}) {
  const pointers = new Map();
  let lastTap = null;
  let tapTimer = null;

  const cancelTap = () => {
    clearTimeout(tapTimer);
    tapTimer = null;
    lastTap = null;
  };
  const reset = () => { cancelTap(); pointers.clear(); };
  const blockNativeClick = (event) => {
    if (!isActive() || allowNativeClick()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  canvas.addEventListener('click', blockNativeClick, true);
  canvas.addEventListener('dblclick', blockNativeClick, true);
  canvas.addEventListener('pointerdown', (event) => {
    if (!isActive() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (pointers.size) {
      pointers.forEach((pointer) => { pointer.moved = true; });
      cancelTap();
    }
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY, time: Date.now(), moved: pointers.size > 0
    });
  }, true);
  canvas.addEventListener('pointermove', (event) => {
    const pointer = pointers.get(event.pointerId);
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > TAP_SLOP_PX) {
      pointer.moved = true;
      cancelTap();
    }
  }, true);
  canvas.addEventListener('pointerup', (event) => {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (!isActive() || !pointer || pointer.moved || pointers.size
      || Date.now() - pointer.time > 500
      || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > TAP_SLOP_PX) return;
    const viewer = getPanorama();
    const tap = { x: event.clientX, y: event.clientY, time: Date.now(), panoId: viewer.getPanoId() };
    if (lastTap && tap.time - lastTap.time < DOUBLE_TAP_MS
      && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 30) {
      cancelTap();
      const baseZoom = getBaseZoom();
      viewer.setZoom(viewer.getZoom() > baseZoom + 0.01 ? baseZoom : baseZoom + 1);
      return;
    }
    cancelTap();
    lastTap = tap;
    tapTimer = setTimeout(() => {
      cancelTap();
      if (isActive() && getPanorama() === viewer && viewer.getPanoId() === tap.panoId) {
        onSingleTap(tap);
      }
    }, DOUBLE_TAP_MS);
  }, true);
  canvas.addEventListener('pointercancel', reset, true);
  return { reset };
}
