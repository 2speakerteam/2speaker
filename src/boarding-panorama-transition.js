export function travelTransform(transform, offset) {
  const match = /^matrix3d\(([^)]+)\)$/.exec(transform);
  const values = match?.[1].split(',').map(Number);
  if (!values || values.length !== 16 || !values.every(Number.isFinite)) return null;
  values[12] += offset.x;
  values[13] += offset.y;
  values[14] += offset.z;
  return `matrix3d(${values.join(',')})`;
}

export function createBoardingPanoramaTransition({ canvas, view, getPanorama }) {
  let active = null;
  const stop = () => {
    if (!active) return;
    const previous = active;
    active = null;
    previous.animations.forEach((animation) => animation.cancel());
    previous.overlay.remove();
  };
  const waitForScene = (run, viewer, panoId, timeoutMs = 6000) => new Promise((resolve) => {
    const started = performance.now();
    let readyFrames = 0;
    const check = () => {
      if (active !== run || getPanorama() !== viewer) { resolve(false); return; }
      const currentId = viewer.getPanoId();
      if (currentId === panoId) {
        const images = [...canvas.querySelectorAll('.cube img')]
          .filter((image) => image.src.includes(`/${panoId}/`));
        if (images.length && images.every((image) => image.complete && image.naturalWidth > 0)) {
          readyFrames += 1;
          if (readyFrames >= 2) { resolve(true); return; }
        } else readyFrames = 0;
      }
      if (performance.now() - started >= timeoutMs) { resolve(false); return; }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  const move = async (action, tap) => {
    const viewer = getPanorama();
    if (active || !viewer) return false;
    const originalId = viewer.getPanoId();
    const originalPov = { ...viewer.getPov() };
    const bounds = canvas.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'boarding-panorama-transition';
    overlay.style.visibility = 'hidden';
    overlay.setAttribute('aria-hidden', 'true');
    const snapshot = canvas.cloneNode(true);
    snapshot.removeAttribute('id');
    snapshot.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    snapshot.classList.add('boarding-panorama-snapshot');
    overlay.appendChild(snapshot);
    view.appendChild(overlay);
    const run = { overlay, animations: [] };
    active = run;
    try {
      let decodeTimeout;
      await Promise.race([
        Promise.allSettled([...snapshot.querySelectorAll('img')].map((image) => image.decode())),
        new Promise((resolve) => { decodeTimeout = setTimeout(resolve, 750); })
      ]);
      clearTimeout(decodeTimeout);
      if (active !== run) return false;
      overlay.style.visibility = 'visible';
      await new Promise(requestAnimationFrame);
      if (active !== run) return false;
      action();
      // Keep the old, fully painted scene above the SDK until the new tiles exist.
      const started = performance.now();
      while (active === run && viewer.getPanoId() === originalId
        && performance.now() - started < 6000) {
        await new Promise(requestAnimationFrame);
      }
      if (active !== run) return false;
      const targetId = viewer.getPanoId();
      if (targetId === originalId) { stop(); return false; }
      // Native link navigation changes the camera bearing. Preserve the user's
      // view so the travel does not finish with an unrelated, abrupt turn.
      viewer.setPov(originalPov);
      if (!await waitForScene(run, viewer, targetId)) {
        if (active === run) {
          viewer.setPanoIdWithPov(originalId, originalPov);
          await waitForScene(run, viewer, originalId, 3000);
          if (active === run) stop();
        }
        return false;
      }
      if (active !== run) return false;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const duration = reduceMotion ? 120 : 520;
      const offset = {
        x: -(tap.x - bounds.left - bounds.width / 2) * 0.35,
        y: -(tap.y - bounds.top - bounds.height / 2) * 0.2,
        z: 180
      };
      const timing = { duration, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' };
      if (!reduceMotion) {
        snapshot.querySelectorAll('.cube').forEach((cube) => {
          if (cube.style.display === 'none') return;
          [...cube.children].forEach((face) => {
            const from = face.style.transform;
            const to = travelTransform(from, offset);
            if (to) run.animations.push(face.animate([{ transform: from }, { transform: to }], timing));
          });
        });
        run.animations.push(canvas.animate([
          { transform: 'scale(.985)' }, { transform: 'scale(1)' }
        ], timing));
      }
      const blend = overlay.animate([
        { opacity: 1, offset: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0, offset: 1 }
      ], timing);
      run.animations.push(blend);
      await blend.finished;
      if (active !== run) return false;
      stop();
      return true;
    } catch {
      if (active === run) stop();
      return false;
    }
  };
  return { move, stop, isMoving: () => Boolean(active) };
}
