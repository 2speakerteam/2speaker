const DOUBLE_TAP_MS = 350;
const TAP_SLOP_PX = 12;

export function bindBoardingPanoramaGestures({
  canvas, isActive, getPanorama, getBaseFov, onSingleTap = () => {}, allowNativeClick = () => false
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
    const tap = { x: event.clientX, y: event.clientY, time: Date.now(), panoId: viewer.getPanoId(), pov: { ...viewer.getPov() } };
    if (lastTap && tap.time - lastTap.time < DOUBLE_TAP_MS
      && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 30) {
      cancelTap();
      const baseFov = getBaseFov();
      const pov = viewer.getPov();
      viewer.setPov({ ...pov, fov: pov.fov < baseFov - 0.01 ? baseFov : Math.max(20, baseFov * 0.6) });
      return;
    }
    cancelTap();
    lastTap = tap;
    tapTimer = setTimeout(() => {
      cancelTap();
      if (!pointers.size && isActive() && getPanorama() === viewer && viewer.getPanoId() === tap.panoId) {
        onSingleTap(tap);
      }
    }, DOUBLE_TAP_MS);
  }, true);
  canvas.addEventListener('pointercancel', reset, true);
  return { reset };
}
