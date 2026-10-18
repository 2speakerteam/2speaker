const lookups = new Map();
const stationKey = value => String(value || '').replace(/\([^)]*\)|\s/g, '');
const stationTitle = value => String(value || '').match(/^(.+?역)(?:\s|\(|$)/)?.[1] || '';
const railStation = value => stationTitle(value) || `${String(value || '').replace(/\([^)]*\)/g, '').trim()}역`;
const validPoint = value => value && Number.isFinite(value.lat) && Number.isFinite(value.lng);

function distance(a, b) {
  const scale = Math.PI / 180 * 6371000;
  return Math.hypot((a.lat - b.lat) * scale,
    (a.lng - b.lng) * scale * Math.cos((a.lat + b.lat) * Math.PI / 360));
}

function traceDistance(place, segments) {
  const scale = Math.PI / 180 * 6371000;
  const lngScale = scale * Math.cos(place.lat * Math.PI / 180);
  let closest = Infinity;
  for (const segment of segments) {
    const path = segment.coordinates || [];
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1], b = path[i];
      if (![...a, ...b].every(Number.isFinite)) continue;
      const x = (a[0] - place.lng) * lngScale, y = (a[1] - place.lat) * scale;
      const dx = (b[0] - a[0]) * lngScale, dy = (b[1] - a[1]) * scale;
      const t = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)));
      closest = Math.min(closest, Math.hypot(x + t * dx, y + t * dy));
    }
  }
  return closest;
}

async function exitsFor(station) {
  const old = lookups.get(station);
  if (old && Date.now() - old.createdAt < 600000) return old.request.catch(() => []);
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/map/place', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: `${station} 출구` }), signal: controller.signal
      });
      if (!response.ok) throw new Error('Station exits unavailable');
      const payload = await response.json();
      return (Array.isArray(payload.places) ? payload.places : []).filter(place =>
        place.category === '교통시설>지하철출구번호' && validPoint(place)
        && stationKey(place.title).match(/^(.+?역)\d+번출구$/)?.[1] === stationKey(station));
    } finally { clearTimeout(timeout); }
  })();
  if (lookups.size >= 32) lookups.delete(lookups.keys().next().value);
  lookups.set(station, { request, createdAt: Date.now() });
  try { return await request; }
  catch {
    if (lookups.get(station)?.request === request) lookups.delete(station);
    return [];
  }
}

// Match real NAVER entrances against the existing TMAP walk trace. An exit is
// labelled as near that trace, never claimed to be a TMAP-supplied exit number.
async function exitNearWalk(target) {
  if (!validPoint(target.point) || !target.walk.length) return null;
  const places = await exitsFor(target.station);
  const candidates = places.filter(place => distance(place, target.point) <= 350)
    .map(place => ({ place, gap: traceDistance(place, target.walk) }))
    .filter(candidate => candidate.gap <= 25).sort((a, b) => a.gap - b.gap);
  if (!candidates.length || candidates[1] && candidates[1].gap - candidates[0].gap < 8) return null;
  const place = candidates[0].place;
  return { title: `${target.station} ${place.title.match(/(\d+)번\s*출구/)?.[1]}번 출구`,
    lat: place.lat, lng: place.lng };
}

export function hasTransitStationExits(mode, startTitle, endTitle) {
  return mode === 'subway' || Boolean(stationTitle(startTitle) || stationTitle(endTitle));
}

export async function showTransitStationExits({ mode, route, panel, start, end, onBoardExit }) {
  const node = panel?.querySelector('[data-transit-station-exits]');
  if (!node) return;
  const segments = route.segments || [];
  const vehicle = mode === 'subway' ? 'SUBWAY' : 'BUS';
  const first = segments.findIndex(segment => segment.mode === vehicle);
  const last = segments.findLastIndex(segment => segment.mode === vehicle);
  const access = first < 0 ? [] : segments.slice(0, first).filter(segment => segment.mode === 'WALK');
  const egress = last < 0 ? [] : segments.slice(last + 1).filter(segment => segment.mode === 'WALK');
  const legs = route.transportLegs || [];
  const coordinate = pair => pair ? { lat: pair[1], lng: pair[0] } : null;
  const targets = mode === 'subway' ? [
    { station: railStation(legs[0]?.board), point: legs[0]?.boardPoint,
      walk: access, label: '승차 접근', boarding: true },
    { station: railStation(legs.at(-1)?.alight), point: coordinate(segments[last]?.coordinates?.at(-1)),
      walk: egress, label: '하차 후 접근' }
  ] : [
    { station: stationTitle(start.title), point: start.point, walk: access, label: '출발역 접근' },
    { station: stationTitle(end.title), point: end.point, walk: egress, label: '도착역 접근' }
  ];
  const results = await Promise.all(targets.filter(target => target.station).map(async target => {
    const exit = await exitNearWalk(target);
    return { ...target, exit };
  }));
  if (!node.isConnected) return;
  node.replaceChildren();
  results.forEach((result, index) => {
    if (index) node.append(document.createElement('br'));
    node.append(document.createTextNode(result.exit
      ? `${result.label} · ${result.exit.title} (경로 인근)`
      : `${result.label} · ${result.station} 출구 정보 확인 불가`));
    if (result.boarding && result.exit) onBoardExit?.(result.exit);
  });
}
