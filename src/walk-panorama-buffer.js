import { interpolateWalkingPov } from './walk-panorama-motion.js?v=20261019-walk-flow-4';

// Two actual SDK panoramas, prepared before revealing. Keep photo geometry intact.
export function createWalkPanoramaBuffer(maps, canvas, view, initialViewer, { transitionMs = 1200 } = {}) {
  let stopped = false;
  let front = { viewer: initialViewer, host: initialViewer.getElement() };
  let back = null;
  let loading = null;
  let transition = null;
  const viewPov = () => front.viewer.getPov();

  function layer(channel, visible) {
    channel.host.style.setProperty('position', 'absolute', 'important');
    channel.host.style.setProperty('inset', '0');
    channel.host.style.opacity = visible ? '1' : '0';
    channel.host.style.zIndex = visible ? '2' : '1';
    channel.host.style.pointerEvents = visible ? '' : 'none';
    channel.host.setAttribute('aria-hidden', String(!visible));
    channel.host.inert = !visible;
  }
  layer(front, true);

  function ensureBack(frame) {
    if (back) return false;
    const width = view.clientWidth;
    const height = view.clientHeight;
    if (width <= 0 || height <= 0) throw new Error('Roadview viewport has no size.');
    const host = document.createElement('div');
    host.className = 'walk-panorama-renderer';
    host.style.cssText = 'position:absolute;inset:0;opacity:0;pointer-events:none;';
    canvas.appendChild(host);
    try {
      back = { host, viewer: new maps.Panorama(host, {
        size: new maps.Size(width, height), panoId: frame.panoId, pov: frame.pov,
        flightSpot: false, logoControl: false, minZoom: 0, maxZoom: 2, zoomControl: false
      }) };
      layer(back, false);
      return true;
    } catch (error) { host.remove(); throw error; }
  }

  function ready(channel, frame) {
    const coordinate = channel.viewer.getLocation()?.coord;
    const pov = channel.viewer.getPov();
    const pan = pov?.pan;
    const delta = Math.abs(((pan - frame.pov.pan + 540) % 360) - 180);
    if (channel.viewer.getPanoId() !== frame.panoId || !coordinate
      || Math.abs(coordinate.lat() - frame.camera.lat) > 0.00002
      || Math.abs(coordinate.lng() - frame.camera.lng) > 0.00002
      || !Number.isFinite(pan) || delta > 0.1
      || !Number.isFinite(pov?.tilt) || Math.abs(pov.tilt - frame.pov.tilt) > 0.1
      || !Number.isFinite(pov?.fov) || Math.abs(pov.fov - frame.pov.fov) > 0.1) return false;
    const tiles = [...channel.host.querySelectorAll('img')]
      .filter(image => (image.currentSrc || image.src).includes(`/image/${frame.panoId}/`));
    return tiles.length >= 4 && tiles.every(image => image.complete && image.naturalWidth > 0);
  }

  async function prepare(frame) {
    if (!frame || stopped) return null;
    // The outgoing SDK viewer must remain unchanged until its short reveal ends.
    while (transition) await transition.done;
    // A request for Previous may arrive while Next is being prefetched.
    // Serialize SDK requests; never let an older request replace a newer one.
    while (loading) await loading;
    if (stopped) return null;
    const created = ensureBack(frame);
    const target = back;
    if (ready(target, frame)) return target;
    const task = (async () => {
      if (!created) target.viewer.setPanoIdWithPov(frame.panoId, frame.pov);
      const started = performance.now();
      let stable = 0;
      while (!stopped && performance.now() - started < 6000) {
        await new Promise(resolve => window.setTimeout(resolve, 30));
        if (stopped) return null;
        // Two loaded observations allow the SDK to paint before revealing it.
        stable = ready(target, frame) ? stable + 1 : 0;
        if (stable >= 2) return target;
      }
      return null;
    })();
    loading = task;
    try { return await task; }
    finally { if (loading === task) loading = null; }
  }

  async function show(frame, { durationMs = transitionMs, fromPov = null, onPov = null } = {}) {
    try {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const smooth = durationMs > 0 && !reduced && typeof front.host.animate === 'function';
      const startPov = fromPov || front.viewer.getPov();
      const preparedFrame = { ...frame, pov: smooth ? { ...startPov } : frame.pov };
      const needsTurn = Math.abs(((frame.pov.pan - startPov.pan + 540) % 360) - 180) > .01
        || Math.abs(frame.pov.tilt - startPov.tilt) > .01 || Math.abs(frame.pov.fov - startPov.fov) > .01;
      const target = await prepare(preparedFrame);
      if (stopped || !target || target !== back || !ready(target, preparedFrame)) return null;
      const previous = front;
      layer(target, true);
      const animate = durationMs > 0 && typeof target.host.animate === 'function' && !reduced;
      back = previous;
      front = target;
      if (animate) {
        previous.host.style.zIndex = '1';
        previous.host.style.pointerEvents = 'none';
        previous.host.inert = true;
        previous.host.setAttribute('aria-hidden', 'true');
        // Keep the gentle camera turn, but limit double-exposed photos to 100ms.
        const blendFraction = Math.min(1, 100 / durationMs);
        const animation = target.host.animate([
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: (1 - blendFraction) / 2 },
          { opacity: 1, offset: (1 + blendFraction) / 2 },
          { opacity: 1, offset: 1 }
        ], {
          duration: durationMs, easing: 'linear'
        });
        const run = { animation, done: null, raf: null, steering: false, cancel: null };
        const steer = () => { run.steering = true; animation.finish(); };
        for (const name of ['pointerdown', 'wheel', 'keydown']) target.host.addEventListener(name, steer, true);
        let settle;
        run.done = new Promise(resolve => { settle = resolve; });
        const finish = cancelled => {
          if (transition !== run) return;
          cancelAnimationFrame(run.raf);
          for (const name of ['pointerdown', 'wheel', 'keydown']) target.host.removeEventListener(name, steer, true);
          if (!stopped && !cancelled) {
            if (!run.steering && needsTurn) target.viewer.setPov(frame.pov);
            layer(previous, false);
          }
          transition = null;
          settle(cancelled ? null : target.viewer);
        };
        run.cancel = () => { animation.cancel(); finish(true); };
        const started = performance.now();
        let lastPaint = -Infinity;
        const turn = now => {
          if (stopped || transition !== run) return;
          if (!run.steering && now - lastPaint >= 30) {
            const pov = interpolateWalkingPov(preparedFrame.pov, frame.pov, (now - started) / durationMs);
            previous.viewer.setPov({ ...pov, fov: startPov.fov });
            target.viewer.setPov(pov);
            onPov?.(pov);
            lastPaint = now;
          }
          run.raf = requestAnimationFrame(turn);
        };
        transition = run;
        if (needsTurn) run.raf = requestAnimationFrame(turn);
        animation.finished.then(() => finish(false), () => finish(true));
        const viewer = await run.done;
        if (stopped) return null;
        return viewer;
      } else {
        target.viewer.setPov(frame.pov);
        layer(previous, false);
        return front.viewer;
      }
    } catch { return null; }
  }

  return {
    show,
    viewPov,
    prefetch(frame) { void prepare(frame).catch(() => {}); },
    resize(width, height) {
      if (stopped || width <= 0 || height <= 0) return;
      for (const channel of [front, back]) {
        if (channel) channel.viewer.setSize(new maps.Size(width, height));
      }
    },
    stop() {
      stopped = true;
      const active = transition;
      active?.cancel();
      for (const channel of [front, back]) {
        if (!channel) continue;
        channel.viewer.setVisible(false);
        channel.viewer.destroy?.();
        channel.host.remove();
      }
    }
  };
}
