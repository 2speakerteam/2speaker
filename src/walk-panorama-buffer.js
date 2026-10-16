// Walking playback only: keep the current photo visible until the next actual
// SDK panorama and its image tiles are ready. No transformed/synthetic frames.
export function createWalkPanoramaBuffer(maps, canvas, view, initialViewer) {
  let stopped = false;
  let front = { viewer: initialViewer, host: initialViewer.getElement() };
  let back = null;
  let loading = null;

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
    const pan = channel.viewer.getPov()?.pan;
    const delta = Math.abs(((pan - frame.pov.pan + 540) % 360) - 180);
    if (channel.viewer.getPanoId() !== frame.panoId || !coordinate
      || Math.abs(coordinate.lat() - frame.camera.lat) > 0.00002
      || Math.abs(coordinate.lng() - frame.camera.lng) > 0.00002
      || !Number.isFinite(pan) || delta > 5) return false;
    const tiles = [...channel.host.querySelectorAll('img')]
      .filter(image => (image.currentSrc || image.src).includes(`/image/${frame.panoId}/`));
    return tiles.length >= 4 && tiles.every(image => image.complete && image.naturalWidth > 0);
  }

  async function prepare(frame) {
    if (!frame || stopped) return null;
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

  async function show(frame) {
    try {
      const target = await prepare(frame);
      if (stopped || !target || target !== back || !ready(target, frame)) return null;
      layer(target, true);
      layer(front, false);
      back = front;
      front = target;
      return front.viewer;
    } catch { return null; }
  }

  return {
    show,
    prefetch(frame) { void prepare(frame).catch(() => {}); },
    resize(width, height) {
      if (stopped || width <= 0 || height <= 0) return;
      for (const channel of [front, back]) {
        if (channel) channel.viewer.setSize(new maps.Size(width, height));
      }
    },
    stop() {
      stopped = true;
      for (const channel of [front, back]) {
        if (!channel) continue;
        channel.viewer.setVisible(false);
        channel.viewer.destroy?.();
        channel.host.remove();
      }
    }
  };
}
