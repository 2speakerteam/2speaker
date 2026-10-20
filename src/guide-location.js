// Physical location is collected for this question; a route preview is never a GPS fix.
export function regionFor(position, signal) {
  return new Promise(resolve => {
    let timer;
    const finish = value => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve(value);
    };
    const abort = () => finish(null);
    if (signal?.aborted) return finish(null);
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(null), 4500);
    const maps = window.naver?.maps;
    if (!maps?.Service?.reverseGeocode) return finish(null);
    try {
      maps.Service.reverseGeocode({
        coords: new maps.LatLng(position.lat, position.lng),
        orders: 'legalcode,admcode'
      }, (status, response) => {
        if (status !== maps.Service.Status.OK) return finish(null);
        const regions = (response?.v2?.results || []).map(item => item.region);
        const areas = regions.map(region => ['area1', 'area2', 'area3', 'area4']
          .map(key => String(region?.[key]?.name || '').trim()).filter(Boolean).join(' '))
          .filter(Boolean);
        finish([...new Set(areas)].slice(0, 2));
      });
    } catch { finish(null); }
  });
}

export async function currentGuidePosition(signal) {
  if (signal?.aborted || !navigator.geolocation) return null;
  const position = await new Promise(resolve => {
    const finish = value => {
      signal?.removeEventListener('abort', abort);
      resolve(value);
    };
    const abort = () => finish(null);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      navigator.geolocation.getCurrentPosition(p => finish({
        lat: p.coords.latitude, lng: p.coords.longitude,
        accuracy: p.coords.accuracy, timestamp: p.timestamp
      }), () => finish(null),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
    } catch { finish(null); }
  });
  if (!position || signal?.aborted) return null;
  // A very broad or expired fix must not label a particular district as current.
  if (!Number.isFinite(position.accuracy) || position.accuracy < 0 || position.accuracy > 2000
    || Math.abs(Date.now() - position.timestamp) > 120000) return position;
  const areas = await regionFor(position, signal);
  return { ...position, ...(areas?.length ? { areas } : {}) };
}
