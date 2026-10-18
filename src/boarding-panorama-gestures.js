const DOUBLE_TAP_MS = 350;
const TAP_SLOP_PX = 12;
const HOLD_START_MS = 500;
const HOLD_STEP_PAUSE_MS = 120;

export function bindBoardingPanoramaGestures({
  canvas, isActive, getPanorama, getBaseFov, onSingleTap = () => {}, allowNativeClick = () => false
}) {
  const pointers = new Map();
  let lastTap = null;
  let tapTimer = null;
  let holdTimer = null;
  let hold = null;

  const cancelTap = () => {
    clearTimeout(tapTimer);
    tapTimer = null;
    lastTap = null;
  };
  const stopHold = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    if (hold?.captureTarget?.hasPointerCapture(hold.pointerId)) {
      hold.captureTarget.releasePointerCapture(hold.pointerId);
    }
    hold = null;
  };
  const reset = () => { cancelTap(); stopHold(); pointers.clear(); };
  const continueHold = async (run) => {
    if (hold !== run || !isActive() || pointers.size !== 1 || getPanorama() !== run.viewer) return;
    const pov = run.viewer.getPov();
    // Wait for each actual frame to finish; do not queue movements while loading.
    const moved = await onSingleTap({
      x: run.x, y: run.y, panoId: run.viewer.getPanoId(), pov: { ...pov },
      holding: true, visited: run.visited,
      isCurrent: () => hold === run && pointers.size === 1 && isActive()
    });
    if (hold !== run) return;
    if (!moved || !isActive()) { stopHold(); return; }
    holdTimer = setTimeout(() => { void continueHold(run); }, HOLD_STEP_PAUSE_MS);
  };
  const blockNativeClick = (event) => {
    if (!isActive() || allowNativeClick()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  canvas.addEventListener('click', blockNativeClick, true);
  canvas.addEventListener('dblclick', blockNativeClick, true);
  canvas.addEventListener('contextmenu', blockNativeClick, true);
  canvas.addEventListener('pointerdown', (event) => {
    if (!isActive() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (pointers.size) {
      pointers.forEach((pointer) => { pointer.moved = true; });
      cancelTap();
      stopHold();
    }
    const pointer = { x: event.clientX, y: event.clientY, time: Date.now(), moved: pointers.size > 0, held: false };
    pointers.set(event.pointerId, pointer);
    if (pointer.moved) return;
    stopHold();
    holdTimer = setTimeout(() => {
      if (pointers.get(event.pointerId) !== pointer || pointer.moved || pointers.size !== 1 || !isActive()) return;
      cancelTap();
      pointer.held = true;
      const viewer = getPanorama();
      // The SDK replaces scene descendants when travelling. Capture on its
      // stable mount so a finger remains pressed across those replacements.
      const captureTarget = viewer.getElement();
      captureTarget.setPointerCapture?.(event.pointerId);
      hold = {
        x: pointer.x, y: pointer.y, viewer, captureTarget, pointerId: event.pointerId,
        visited: new Set([viewer.getPanoId()])
      };
      void continueHold(hold);
    }, HOLD_START_MS);
  }, true);
  canvas.addEventListener('pointermove', (event) => {
    const pointer = pointers.get(event.pointerId);
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > TAP_SLOP_PX) {
      pointer.moved = true;
      cancelTap();
      stopHold();
    }
  }, true);
  canvas.addEventListener('pointerup', (event) => {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    stopHold();
    if (!isActive() || !pointer || pointer.moved || pointers.size
      || pointer.held
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
  canvas.addEventListener('pointerleave', (event) => {
    // Touch emits pointerleave after pointerup. That completed tap must keep
    // its double-tap delay; only a still-pressed pointer leaving cancels it.
    if (event.target === canvas && pointers.has(event.pointerId)) reset();
  });
  window.addEventListener('pointerup', () => { if (hold || pointers.size) reset(); });
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  return { reset };
}
