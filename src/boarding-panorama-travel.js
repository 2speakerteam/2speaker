const RAD = Math.PI / 180;
const MAX_TAP_DIRECTION_ERROR = 60;
const LOAD_TIMEOUT_MS = 6000;

const angleDifference = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// These are the SDK's real, connected road links. Their orientation is not
// necessarily their on-screen location, especially for side roads and forks.
function roadLinkDirection(image, tilt) {
  const container = image.parentElement;
  if (!container || ![...container.classList].some((name) => /^arrow_container_#\d+$/.test(name))) {
    return null;
  }
  const match = /^matrix3d\(([^)]+)\)$/.exec(container.style.transform || container.style.webkitTransform || '');
  if (!match) return null;
  const matrix = match[1].split(',').map(Number);
  if (matrix.length !== 16 || !matrix.every(Number.isFinite)) return null;
  // Undo camera tilt on the rendered transverse axis before deriving bearing.
  const x = matrix[0];
  const z = matrix[2] * Math.cos(tilt) - matrix[1] * Math.sin(tilt);
  if (Math.hypot(x, z) < 0.00001) return null;
  return Math.atan2(z, x) / RAD;
}

export function selectBoardingRoadLink(viewer, tap) {
  const host = viewer.getElement();
  const bounds = host.getBoundingClientRect();
  const pov = viewer.getPov();
  if (!bounds.width || !bounds.height || !pov
    || ![pov.pan, pov.tilt, pov.fov].every(Number.isFinite)
    || tap.x < bounds.left || tap.x > bounds.right || tap.y < bounds.top || tap.y > bounds.bottom) {
    return null;
  }
  const tilt = pov.tilt * RAD;
  const cube = [...host.querySelectorAll('.cube')].find((node) => node.style.display !== 'none');
  const renderedFocalLength = Number.parseFloat(cube?.style.perspective || cube?.style.webkitPerspective);
  const focalLength = renderedFocalLength > 0 ? renderedFocalLength
    : Math.max(bounds.width, bounds.height) / (2 * Math.tan(pov.fov * RAD / 2));
  const rayX = (tap.x - bounds.left - bounds.width / 2) / focalLength;
  const rayY = (tap.y - bounds.top - bounds.height / 2) / focalLength;
  const forward = Math.cos(tilt) + rayY * Math.sin(tilt);
  if (forward <= 0) return null;
  // A distant landmark can be above the horizon. Use its horizontal direction;
  // its height in a photograph is not a ground coordinate or a travel distance.
  const direction = Math.atan2(rayX, forward) / RAD;
  const candidates = [...host.querySelectorAll('img.arrow_image')].flatMap((image) => {
    const parent = image.parentElement?.parentElement;
    if (!parent || getComputedStyle(parent).display === 'none') return [];
    if (roadLinkDirection(image, tilt) === null) return [];
    const rect = image.getBoundingClientRect();
    if (![rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0) return [];
    const left = Math.max(bounds.left, rect.left);
    const right = Math.min(bounds.right, rect.right);
    const top = Math.max(bounds.top, rect.top);
    const bottom = Math.min(bounds.bottom, rect.bottom);
    if (right <= left || bottom <= top) return [];
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const linkRayX = (x - bounds.left - bounds.width / 2) / focalLength;
    const linkRayY = (y - bounds.top - bounds.height / 2) / focalLength;
    const linkForward = Math.cos(tilt) + linkRayY * Math.sin(tilt);
    if (linkForward <= 0) return [];
    const bearing = Math.atan2(linkRayX, linkForward) / RAD;
    return [{ image, error: angleDifference(direction, bearing) }];
  }).sort((a, b) => a.error - b.error);
  const best = candidates[0];
  // A tap must identify a visible connected link. Keep genuinely equidistant
  // branches still so a tap between two roads does not choose one arbitrarily.
  if (!best || best.error > MAX_TAP_DIRECTION_ERROR
    || (candidates[1] && candidates[1].error - best.error < 3)) return null;
  return best.image;
}

function copyCurrentFrame(host) {
  if (!host.querySelector('.cube')) return null;
  const copy = host.cloneNode(true);
  copy.classList.add('boarding-panorama-held-frame');
  copy.setAttribute('aria-hidden', 'true');
  copy.style.pointerEvents = 'none';
  copy.style.zIndex = '2';
  copy.removeAttribute('id');
  copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  const originals = host.querySelectorAll('canvas');
  copy.querySelectorAll('canvas').forEach((canvas, index) => {
    try { canvas.getContext('2d')?.drawImage(originals[index], 0, 0); }
    catch { /* The SDK's preview image remains available if a canvas is unavailable. */ }
  });
  host.parentElement.appendChild(copy);
  return copy;
}

function previewUrls(host) {
  const cube = [...host.querySelectorAll('.cube')].find((node) => node.style.display !== 'none');
  if (!cube) return [];
  const urls = new Set();
  cube.querySelectorAll('[style]').forEach((node) => {
    const match = /^url\(["']?(.*?)["']?\)$/.exec(node.style.backgroundImage);
    if (match?.[1]?.trim()) urls.add(match[1].trim());
  });
  return [...urls];
}

export function createBoardingPanoramaTravel({ maps, isActive, getPanorama }) {
  let active = null;
  let dispatchingLink = false;
  const releaseFrame = () => {
    active?.frame?.remove();
    if (active) active.frame = null;
  };
  const reset = () => {
    if (!active) return;
    const run = active;
    active = null;
    run.frame?.remove();
    window.clearTimeout(run.timeout);
    run.listeners.forEach((listener) => maps.Event.removeListener(listener));
    run.resizeObserver?.disconnect();
    run.cancelImages.forEach((cancel) => cancel());
    run.rafIds.forEach((id) => cancelAnimationFrame(id));
    run.resolve(run.moved);
  };
  const frameReady = (run) => {
    const id = requestAnimationFrame(() => {
      run.rafIds.delete(id);
      if (active !== run) return;
      if (!isActive() || getPanorama() !== run.viewer) { reset(); return; }
      const urls = previewUrls(run.host);
      if (!urls.length) { reset(); return; }
      Promise.all(urls.map((url) => new Promise((resolve) => {
        const image = new Image();
        const finish = () => {
          image.onload = null;
          image.onerror = null;
          run.cancelImages.delete(finish);
          resolve();
        };
        run.cancelImages.add(finish);
        image.onload = finish;
        image.onerror = finish;
        // Only warm the exact preview URL already rendered by the Naver SDK.
        image.src = url;
        if (image.complete) finish();
      }))).then(() => {
        if (active !== run) return;
        const reveal = requestAnimationFrame(() => {
          run.rafIds.delete(reveal);
          if (active !== run) return;
          const paint = requestAnimationFrame(() => {
            run.rafIds.delete(paint);
            if (active === run) reset();
          });
          run.rafIds.add(paint);
        });
        run.rafIds.add(reveal);
      });
    });
    run.rafIds.add(id);
  };
  const move = (tap) => {
    if (active || !isActive()) return Promise.resolve(false);
    const viewer = getPanorama();
    if (!viewer || viewer.getPanoId() !== tap.panoId) return Promise.resolve(false);
    const pov = viewer.getPov();
    if (angleDifference(pov.pan, tap.pov.pan) > 0.5
      || Math.abs(pov.tilt - tap.pov.tilt) > 0.5 || Math.abs(pov.fov - tap.pov.fov) > 0.5) return Promise.resolve(false);
    const link = selectBoardingRoadLink(viewer, tap);
    if (!link) return Promise.resolve(false);
    const host = viewer.getElement();
    const bounds = host.getBoundingClientRect();
    let resolve;
    const completed = new Promise((done) => { resolve = done; });
    const run = {
      viewer, host, panoId: tap.panoId, pov: { ...pov }, frame: copyCurrentFrame(host),
      listeners: [], cancelImages: new Set(), rafIds: new Set(), timeout: null, resizeObserver: null,
      resolve, moved: false
    };
    active = run;
    run.timeout = window.setTimeout(() => { if (active === run) reset(); }, LOAD_TIMEOUT_MS);
    run.listeners.push(
      maps.Event.addListener(viewer, 'pov_changed', () => {
        if (active !== run || viewer.getPanoId() !== run.panoId) return;
        const current = viewer.getPov();
        if (angleDifference(current.pan, run.pov.pan) > 0.01
          || Math.abs(current.tilt - run.pov.tilt) > 0.01 || Math.abs(current.fov - run.pov.fov) > 0.01) {
          run.pov = { ...current };
          releaseFrame();
        }
      }),
      maps.Event.addListener(viewer, 'pano_status', (status) => {
        if (active === run && status !== 'OK') reset();
      }),
      maps.Event.addListener(viewer, 'pano_changed', () => {
        if (active !== run) return;
        if (!isActive() || getPanorama() !== viewer || viewer.getPanoId() === run.panoId) {
          reset();
          return;
        }
        // A native road link preserves absolute POV. Also retain any drag or
        // double-tap zoom performed while its metadata was being requested.
        run.moved = true;
        viewer.setPov(run.pov);
        frameReady(run);
      })
    );
    if (window.ResizeObserver) {
      run.resizeObserver = new ResizeObserver(() => {
        const current = host.getBoundingClientRect();
        if (active === run && (current.width !== bounds.width || current.height !== bounds.height)) releaseFrame();
      });
      run.resizeObserver.observe(host);
    }
    // Activate the existing SDK link and its actual target ID; do not access
    // private model state or fabricate a panorama ID/latitude/longitude.
    dispatchingLink = true;
    try { link.click(); }
    catch { reset(); }
    finally { dispatchingLink = false; }
    return completed;
  };
  return { move, reset, releaseFrame, isDispatchingLink: () => dispatchingLink };
}
