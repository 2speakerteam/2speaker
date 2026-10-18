import { createPanoramaProbe } from './panorama-probe.js?v=20261017-panorama-isolation-2';

const RAD = Math.PI / 180;
const MAX_TAP_DIRECTION_ERROR = 60;
const LOAD_TIMEOUT_MS = 6000;

const angleDifference = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function tapDirection(viewer, tap) {
  const host = viewer.getElement();
  const bounds = host.getBoundingClientRect();
  const pov = viewer.getPov();
  const coordinate = viewer.getLocation()?.coord;
  if (!coordinate || !bounds.width || !bounds.height || !pov
    || ![pov.pan, pov.tilt, pov.fov].every(Number.isFinite)
    || tap.x < bounds.left || tap.x > bounds.right || tap.y < bounds.top || tap.y > bounds.bottom) return null;
  const cube = [...host.querySelectorAll('.cube')].find((node) => node.style.display !== 'none');
  const renderedFocalLength = Number.parseFloat(cube?.style.perspective || cube?.style.webkitPerspective);
  const focalLength = renderedFocalLength > 0 ? renderedFocalLength
    : Math.max(bounds.width, bounds.height) / (2 * Math.tan(pov.fov * RAD / 2));
  const rayX = (tap.x - bounds.left - bounds.width / 2) / focalLength;
  const rayY = (tap.y - bounds.top - bounds.height / 2) / focalLength;
  const tilt = pov.tilt * RAD;
  const forward = Math.cos(tilt) + rayY * Math.sin(tilt);
  const down = rayY * Math.cos(tilt) - Math.sin(tilt);
  const horizontal = Math.hypot(rayX, forward);
  if (horizontal < 0.01) return null;
  // A photo does not supply landmark depth. Use a bounded look-ahead distance,
  // then accept only a real camera returned by the public position lookup.
  const groundDistance = down > 0.04 ? 2.8 * horizontal / down : 55;
  const distance = Math.max(12, Math.min(90, groundDistance));
  return {
    origin: { lat: coordinate.lat(), lng: coordinate.lng() },
    bearing: (pov.pan + Math.atan2(rayX, forward) / RAD + 360) % 360,
    distance: tap.holding ? Math.max(40, Math.min(90, distance * 1.4)) : distance
  };
}

function aheadOf(origin, bearing, distance) {
  return {
    lat: origin.lat + Math.cos(bearing * RAD) * distance / 6371000 / RAD,
    lng: origin.lng + Math.sin(bearing * RAD) * distance / 6371000 / RAD / Math.cos(origin.lat * RAD)
  };
}

function cameraOffset(origin, camera) {
  const north = (camera.lat - origin.lat) * RAD * 6371000;
  const east = (camera.lng - origin.lng) * RAD * 6371000 * Math.cos(origin.lat * RAD);
  return { distance: Math.hypot(north, east), bearing: Math.atan2(east, north) / RAD };
}

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
  const direction = tapDirection(viewer, tap);
  if (!direction) return null;
  const pov = viewer.getPov();
  const tilt = pov.tilt * RAD;
  const candidates = [...host.querySelectorAll('img.arrow_image')].flatMap((image) => {
    const parent = image.parentElement?.parentElement;
    if (!parent || getComputedStyle(parent).display === 'none') return [];
    const bearing = roadLinkDirection(image, tilt);
    if (bearing === null) return [];
    return [{ image, error: angleDifference(direction.bearing - pov.pan, bearing) }];
  }).sort((a, b) => a.error - b.error);
  const best = candidates[0];
  // Compare actual road bearings, not the screen positions of floor arrows:
  // side-road arrows can be clipped below a tall mobile viewport.
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
  let probe = null;
  const releaseFrame = () => {
    active?.frame?.remove();
    if (active) active.frame = null;
  };
  const finish = () => {
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
  const reset = () => {
    probe?.stop();
    probe = null;
    finish();
  };
  const frameReady = (run) => {
    const id = requestAnimationFrame(() => {
      run.rafIds.delete(id);
      if (active !== run) return;
      if (!isActive() || getPanorama() !== run.viewer) { finish(); return; }
      const urls = previewUrls(run.host);
      if (!urls.length) { finish(); return; }
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
            if (active === run) finish();
          });
          run.rafIds.add(paint);
        });
        run.rafIds.add(reveal);
      });
    });
    run.rafIds.add(id);
  };
  const findCamera = async (run, tap, direction) => {
    probe ||= createPanoramaProbe(maps, LOAD_TIMEOUT_MS);
    const lookup = probe;
    const distances = [...new Set([
      direction.distance,
      Math.min(120, direction.distance * 1.7),
      Math.max(12, direction.distance * 0.5)
    ])];
    for (const distance of distances) {
      if (active !== run || !isActive() || (tap.isCurrent && !tap.isCurrent())) return null;
      const target = aheadOf(direction.origin, direction.bearing, distance);
      const result = await lookup.lookup(target, aheadOf(target, direction.bearing, 5));
      if (active !== run || probe !== lookup) return null;
      if (result.status !== 'OK' || !result.camera || !result.panoId
        || result.panoId === run.panoId || tap.visited?.has(result.panoId)) continue;
      const offset = cameraOffset(direction.origin, result.camera);
      const targetOffset = cameraOffset(target, result.camera);
      // setPosition can snap up to 300 m away. Reject that broad fallback,
      // cameras behind the tap, and cameras far from the requested direction.
      if (offset.distance < 3 || offset.distance > distance + 25
        || targetOffset.distance > Math.max(18, distance * 0.6)
        || angleDifference(offset.bearing, direction.bearing) > 50) continue;
      return result;
    }
    return null;
  };
  const move = (tap) => {
    if (active || !isActive()) return Promise.resolve(false);
    const viewer = getPanorama();
    if (!viewer || viewer.getPanoId() !== tap.panoId) return Promise.resolve(false);
    const pov = viewer.getPov();
    if (angleDifference(pov.pan, tap.pov.pan) > 0.5
      || Math.abs(pov.tilt - tap.pov.tilt) > 0.5 || Math.abs(pov.fov - tap.pov.fov) > 0.5) return Promise.resolve(false);
    const direction = tapDirection(viewer, tap);
    if (!direction) return Promise.resolve(false);
    const host = viewer.getElement();
    const bounds = host.getBoundingClientRect();
    let resolve;
    const completed = new Promise((done) => { resolve = done; });
    const run = {
      viewer, host, panoId: tap.panoId, pov: { ...pov }, frame: null,
      listeners: [], cancelImages: new Set(), rafIds: new Set(), timeout: null, resizeObserver: null,
      resolve, moved: false
    };
    active = run;
    // Several bounded lookups may be needed when a diagonal point falls
    // between camera positions. The visible viewer stays still until found.
    run.timeout = window.setTimeout(() => { if (active === run) finish(); }, LOAD_TIMEOUT_MS * 3);
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
        if (active === run && status !== 'OK') finish();
      }),
      maps.Event.addListener(viewer, 'pano_changed', () => {
        if (active !== run) return;
        if (!isActive() || getPanorama() !== viewer || viewer.getPanoId() === run.panoId) {
          finish();
          return;
        }
        // A native road link preserves absolute POV. Also retain any drag or
        // double-tap zoom performed while its metadata was being requested.
        run.moved = true;
        tap.visited?.add(viewer.getPanoId());
        viewer.setPov(run.pov);
        window.clearTimeout(run.timeout);
        run.timeout = window.setTimeout(() => { if (active === run) finish(); }, 1500);
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
    void findCamera(run, tap, direction).then((camera) => {
      if (active !== run) return;
      if (!isActive() || getPanorama() !== viewer || viewer.getPanoId() !== run.panoId
        || (tap.isCurrent && !tap.isCurrent())) { finish(); return; }
      const current = viewer.getPov();
      if (angleDifference(current.pan, pov.pan) > 0.5
        || Math.abs(current.tilt - pov.tilt) > 0.5 || Math.abs(current.fov - pov.fov) > 0.5) {
        finish();
        return;
      }
      run.frame = copyCurrentFrame(host);
      window.clearTimeout(run.timeout);
      run.timeout = window.setTimeout(() => { if (active === run) finish(); }, LOAD_TIMEOUT_MS);
      if (camera) {
        viewer.setPanoIdWithPov(camera.panoId, run.pov);
        return;
      }
      // Retain the existing connected-link step when the position lookup has
      // no camera in that direction. It also covers sparse camera spacing.
      const link = selectBoardingRoadLink(viewer, tap);
      if (!link) { finish(); return; }
      dispatchingLink = true;
      try { link.click(); }
      finally { dispatchingLink = false; }
    }).catch(() => { if (active === run) finish(); });
    return completed;
  };
  return { move, reset, releaseFrame, isDispatchingLink: () => dispatchingLink };
}
