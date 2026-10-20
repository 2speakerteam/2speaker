import { interpolateWalkingPov } from './walk-panorama-motion.js?v=20261019-walk-flow-10';

// Inspect the SDK's active image surface, not its discarded/hidden cube.
// Tile count varies with viewport and zoom; it is not a completeness signal.
export function inspectWalkPanoramaFrame(channel, frame) {
  const waiting = reason => ({ ready: false, reason });
  try {
    if (channel.viewer.getPanoId() !== frame.panoId) return waiting('scene');
    const coordinate = channel.viewer.getLocation()?.coord;
    const lat = coordinate?.lat(), lng = coordinate?.lng();
    if (![lat, lng, frame.camera?.lat, frame.camera?.lng].every(Number.isFinite)
      || Math.abs(lat - frame.camera.lat) > 0.00002
      || Math.abs(lng - frame.camera.lng) > 0.00002) return waiting('position');
    const pov = channel.viewer.getPov();
    const delta = Math.abs(((pov?.pan - frame.pov.pan + 540) % 360 + 360) % 360 - 180);
    if (!Number.isFinite(pov?.pan) || delta > 0.1) return waiting('pan');
    if (!Number.isFinite(pov?.tilt) || Math.abs(pov.tilt - frame.pov.tilt) > 0.1) return waiting('tilt');
    if (!Number.isFinite(pov?.fov) || Math.abs(pov.fov - frame.pov.fov) > 0.1) return waiting('fov');
    const cubes = [...channel.host.querySelectorAll('.cube')];
    const surfaces = cubes.length ? cubes.filter(cube => cube.style.display !== 'none') : [channel.host];
    if (!surfaces.length) return waiting('surface');
    const tiles = surfaces.flatMap(surface => [...surface.querySelectorAll('img')])
      .filter(image => (image.currentSrc || image.src).includes('/image/'));
    if (!tiles.length) return waiting('images-empty');
    if (tiles.some(image => !(image.currentSrc || image.src).includes(`/image/${frame.panoId}/`))) {
      return waiting('scene-images');
    }
    const loaded = tiles.filter(image => image.complete && image.naturalWidth > 0).length;
    const failed = tiles.filter(image => image.complete && !image.naturalWidth).length;
    return {
      ready: loaded === tiles.length,
      reason: failed ? 'images-failed' : loaded < tiles.length ? 'images-loading' : 'ready',
      tiles: tiles.length, loaded, failed,
      // Used only to wait for a stable image set; never sent to diagnostics.
      signature: tiles.map(image => image.currentSrc || image.src).sort().join('\n')
    };
  } catch { return waiting('sdk'); }
}

// Two actual SDK panoramas, prepared before revealing. Keep photo geometry intact.
export function createWalkPanoramaBuffer(maps, canvas, view, initialViewer, {
  transitionMs = 1200, onPreparationState = null
} = {}) {
  let stopped = false;
  let front = { viewer: initialViewer, host: initialViewer.getElement() };
  let back = null;
  let loading = null;
  let transition = null;
  let preparationState = null;
  const viewPov = () => front.viewer.getPov();
  const report = (state, timedOut = false) => {
    const { signature, ...safeState } = state;
    const next = { ...safeState, timedOut };
    if (JSON.stringify(next) === JSON.stringify(preparationState)) return;
    preparationState = next;
    onPreparationState?.({ ...next });
  };

  function layer(channel, visible) {
    channel.host.style.setProperty('position', 'absolute', 'important');
    channel.host.style.setProperty('inset', '0');
    // Inherit the section's hidden preload state until the user opens roadview.
    channel.host.style.visibility = visible ? 'inherit' : 'hidden';
    channel.host.style.zIndex = visible ? '2' : '1';
    channel.host.style.pointerEvents = visible ? '' : 'none';
    channel.host.setAttribute('aria-hidden', String(!visible));
    channel.host.inert = !visible;
  }
  layer(front, true);

  function release(channel) {
    if (!channel) return;
    try { channel.viewer.setVisible(false); } catch {}
    try { channel.viewer.destroy?.(); } catch {}
    channel.host.remove();
  }

  function ensureBack(frame) {
    if (back) return false;
    const width = view.clientWidth;
    const height = view.clientHeight;
    if (width <= 0 || height <= 0) throw new Error('Roadview viewport has no size.');
    const host = document.createElement('div');
    host.className = 'walk-panorama-renderer';
    host.style.cssText = 'position:absolute;inset:0;visibility:hidden;pointer-events:none;';
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

  async function prepare(frame, reload = false, reporting = false) {
    if (!frame || stopped) return null;
    // The outgoing SDK viewer must remain unchanged until its short reveal ends.
    while (transition) await transition.done;
    // A request for Previous may arrive while Next is being prefetched.
    // Serialize SDK requests; never let an older request replace a newer one.
    while (loading) await loading;
    if (stopped) return null;
    if (reload) {
      // A stalled SDK instance may retain a failed tile or an unfinished scene.
      // Rebuild only the hidden viewer; keep the last verified photo on screen.
      const retired = back;
      back = null;
      release(retired);
    }
    const created = ensureBack(frame);
    const target = back;
    const cached = inspectWalkPanoramaFrame(target, frame);
    if (!created && !reload && cached.ready && target.readySignature === cached.signature) {
      if (reporting) report(cached);
      return target;
    }
    const task = (async () => {
      if (!created) {
        // Reuse the prefetched photo when only the viewing direction changed.
        // Reopening the same panorama can restart its SDK scene preparation.
        if (!reload && target.viewer.getPanoId() === frame.panoId) target.viewer.setPov(frame.pov);
        else target.viewer.setPanoIdWithPov(frame.panoId, frame.pov);
      }
      const started = performance.now();
      let stable = 0;
      let signature = null;
      let state = { ready: false, reason: 'scene' };
      const timeoutMs = reload ? 10000 : 6000;
      while (!stopped && performance.now() - started < timeoutMs) {
        await new Promise(resolve => window.setTimeout(resolve, 30));
        if (stopped) return null;
        state = inspectWalkPanoramaFrame(target, frame);
        if (reporting) report(state);
        // A newly added tile resets the paint window, even if it is cached.
        stable = state.ready ? state.signature === signature ? stable + 1 : 1 : 0;
        signature = state.signature;
        if (stable >= 3) {
          target.readySignature = state.signature;
          return target;
        }
      }
      if (reporting && !stopped) report(state, true);
      return null;
    })();
    loading = task;
    try { return await task; }
    finally { if (loading === task) loading = null; }
  }

  async function show(frame, { durationMs = transitionMs, fromPov = null, onPov = null, reload = false } = {}) {
    try {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const smooth = durationMs > 0 && !reduced && typeof front.host.animate === 'function';
      const startPov = fromPov || front.viewer.getPov();
      const preparedFrame = { ...frame, pov: smooth ? { ...startPov } : frame.pov };
      const needsTurn = Math.abs(((frame.pov.pan - startPov.pan + 540) % 360) - 180) > .01
        || Math.abs(frame.pov.tilt - startPov.tilt) > .01 || Math.abs(frame.pov.fov - startPov.fov) > .01;
      const target = await prepare(preparedFrame, reload, true);
      if (stopped || !target) return null;
      if (target !== back) {
        report({ ready: false, reason: 'replaced' });
        return null;
      }
      const confirmed = inspectWalkPanoramaFrame(target, preparedFrame);
      report(confirmed);
      if (!confirmed.ready) return null;
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
        // Hold the loaded original until the midpoint, then switch in one paint.
        // Discrete visibility never blends or distorts the two photographs.
        const animation = target.host.animate([
          { visibility: 'hidden', offset: 0, easing: 'steps(1, end)' },
          { visibility: 'inherit', offset: .5 },
          { visibility: 'inherit', offset: 1 }
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
            const fraction = Math.min(1, (now - started) / durationMs);
            const pov = interpolateWalkingPov(preparedFrame.pov, frame.pov, fraction);
            previous.viewer.setPov({ ...pov, fov: startPov.fov });
            target.viewer.setPov(pov);
            onPov?.(pov, fraction);
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
    } catch {
      if (!stopped) report({ ready: false, reason: 'sdk' });
      return null;
    }
  }

  return {
    show,
    viewPov,
    getPreparationState: () => preparationState && { ...preparationState },
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
        release(channel);
      }
    }
  };
}
