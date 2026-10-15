// One bounded look-ahead viewer. It never changes the panorama the user is watching.
export function createPanoramaProbe(maps, timeoutMs) {
  let viewer = null;
  let host = null;
  let listeners = [];
  let pending = null;
  let initialized = false;
  let stopped = false;

  const settle = (result) => {
    if (!pending) return;
    const active = pending;
    pending = null;
    clearTimeout(active.timeout);
    clearTimeout(active.settleTimer);
    active.resolve(result);
  };
  const snapshot = () => {
    if (!pending || !initialized || pending.status !== 'OK' || !pending.changed) return;
    try {
      const coordinate = viewer.getLocation()?.coord;
      const projected = viewer.getProjection()?.fromCoordToPov(pending.ahead);
      settle({
        status: 'OK', panoId: viewer.getPanoId(),
        camera: coordinate ? { lat: coordinate.lat(), lng: coordinate.lng() } : null,
        projectedPan: projected?.pan
      });
    } catch { settle({ status: 'ERROR' }); }
  };
  const release = () => {
    listeners.forEach((listener) => maps.Event.removeListener(listener));
    listeners = [];
    viewer?.setVisible(false);
    viewer = null;
    host?.remove();
    host = null;
    initialized = false;
  };
  const lookup = (point, ahead) => new Promise((resolve) => {
    if (stopped || pending) { resolve({ status: stopped ? 'CANCELLED' : 'BUSY' }); return; }
    pending = {
      resolve, status: null, changed: false, settleTimer: null,
      ahead: new maps.LatLng(ahead.lat, ahead.lng),
      timeout: setTimeout(() => {
        settle({ status: 'TIMEOUT' });
        // A timed-out SDK request cannot be cancelled. Retire its instance so
        // its late events cannot satisfy the following coordinate request.
        release();
      }, timeoutMs)
    };
    try {
      const position = new maps.LatLng(point.lat, point.lng);
      if (viewer) { viewer.setPosition(position); return; }
      host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.inert = true;
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:256px;height:200px;opacity:0;pointer-events:none;';
      document.body.appendChild(host);
      viewer = new maps.Panorama(host, {
        position, size: new maps.Size(256, 200),
        pov: { pan: 0, tilt: 0, fov: 95 }, flightSpot: false, logoControl: false
      });
      listeners = [
        maps.Event.addListener(viewer, 'init', () => { initialized = true; snapshot(); }),
        maps.Event.addListener(viewer, 'pano_changed', () => {
          if (pending) { pending.changed = true; snapshot(); }
        }),
        maps.Event.addListener(viewer, 'pano_status', (status) => {
          if (!pending) return;
          pending.status = status;
          if (status !== 'OK') { settle({ status: status || 'ERROR' }); return; }
          snapshot();
          if (pending) {
            const active = pending;
            clearTimeout(active.settleTimer);
            active.settleTimer = setTimeout(() => {
              if (pending === active) { active.changed = true; snapshot(); }
            }, 180);
          }
        })
      ];
    } catch { settle({ status: 'ERROR' }); release(); }
  });
  return { lookup, stop() { stopped = true; settle({ status: 'CANCELLED' }); release(); } };
}
