export function createWalkMiniMap(maps, section) {
  const panel = section?.querySelector('.walk-mini-map');
  const canvas = panel?.querySelector('.walk-mini-map-canvas');
  let map = null;
  let marker = null;
  let lines = [];
  let observer = null;
  let current = null;
  let lastSize = '';
  let suspended = false;

  const paint = () => {
    if (suspended || !map || !marker || !current) return;
    const position = new maps.LatLng(current.position.lat, current.position.lng);
    marker.setPosition(position);
    map.setCenter(position);
    panel.style.setProperty('--walk-mini-bearing', `${current.bearing}deg`);
    panel.classList.toggle('is-point-only', current.pointOnly);
  };

  const stop = () => {
    observer?.disconnect();
    observer = null;
    marker?.setMap(null);
    marker = null;
    lines.forEach((line) => line.setMap(null));
    lines = [];
    map?.destroy?.();
    map = null;
    lastSize = '';
    suspended = false;
    canvas?.replaceChildren();
    if (panel) {
      panel.hidden = true;
      panel.classList.remove('is-point-only');
    }
    current = null;
  };

  const start = (segments) => {
    if (!panel || !canvas || !Array.isArray(segments)) return;
    const pending = current;
    stop();
    current = pending;
    const paths = segments.map((segment) => (Array.isArray(segment.coordinates)
      ? segment.coordinates.filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
        .map(([lng, lat]) => new maps.LatLng(lat, lng))
      : [])).filter((path) => path.length > 1);
    if (!paths.length) return;
    panel.hidden = false;
    const first = paths[0][0];
    map = new maps.Map(canvas, {
      center: first,
      zoom: 17,
      draggable: false,
      pinchZoom: false,
      scrollWheel: false,
      zoomControl: false,
      scaleControl: false
    });
    lines = paths.flatMap((path) => [
      new maps.Polyline({ map, path, strokeColor: '#07334d', strokeWeight: 7,
        strokeOpacity: 1, strokeLineCap: 'round', strokeLineJoin: 'round' }),
      new maps.Polyline({ map, path, strokeColor: '#26e7ed', strokeWeight: 4,
        strokeOpacity: 1, strokeLineCap: 'round', strokeLineJoin: 'round' })
    ]);
    marker = new maps.Marker({
      map,
      position: first,
      clickable: false,
      zIndex: 100,
      icon: {
        content: '<span class="walk-mini-map-pointer" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2 21 20l-9-4-9 4Z"/></svg></span>',
        size: new maps.Size(28, 28),
        anchor: new maps.Point(14, 14)
      }
    });
    if (window.ResizeObserver) {
      observer = new ResizeObserver(() => {
        if (map && canvas.clientWidth && canvas.clientHeight) {
          const size = `${canvas.clientWidth}x${canvas.clientHeight}`;
          if (size !== lastSize) {
            lastSize = size;
            map.setSize(new maps.Size(canvas.clientWidth, canvas.clientHeight));
          }
        }
      });
      observer.observe(canvas);
    }
    paint();
  };

  const update = (position, bearing, pointOnly = false) => {
    if (!position || ![position.lat, position.lng, bearing].every(Number.isFinite)) return;
    current = { position, bearing, pointOnly };
    suspended = false;
    if (map) panel.hidden = false;
    paint();
  };

  const suspend = () => {
    suspended = true;
    if (panel) panel.hidden = true;
  };

  return { start, update, suspend, stop };
}
