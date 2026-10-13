const TMAP_WALK_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';

function coordinate(value, limit) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const lat = coordinate(value.lat, 90);
  const lng = coordinate(value.lng, 180);
  return lat === null || lng === null ? null : { lat, lng };
}

function distanceMeters(a, b) {
  const radians = Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * radians;
  const deltaLng = (b.lng - a.lng) * radians;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function lineCoordinates(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 15000) return null;
  const coordinates = value.map((pair) => {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const lng = coordinate(pair[0], 180);
    const lat = coordinate(pair[1], 90);
    return lng === null || lat === null ? null : [lng, lat];
  });
  return coordinates.every(Boolean) ? coordinates : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }
  const start = point(req.body?.start);
  const end = point(req.body?.end);
  if (!start || !end || distanceMeters(start, end) < 1) {
    return res.status(400).json({ error: '출발지와 목적지 좌표를 확인해 주세요.' });
  }
  const appKey = process.env.TMAP_TRANSIT_API_KEY?.trim();
  if (!appKey) return res.status(503).json({ error: 'TMAP 보행 경로 인증 정보가 설정되지 않았습니다.' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(TMAP_WALK_URL, {
      method: 'POST',
      headers: { appKey, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startX: start.lng, startY: start.lat, endX: end.lng, endY: end.lat,
        startName: encodeURIComponent('출발지'), endName: encodeURIComponent('목적지'),
        reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
        searchOption: '0', sort: 'index'
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = response.status === 401 || response.status === 403
        ? 'TMAP 보행 경로 API 이용 권한을 확인해 주세요.'
        : response.status === 429
          ? 'TMAP 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
          : response.status >= 400 && response.status < 500
            ? 'TMAP에서 이 출발지와 목적지 사이의 도보 경로를 찾지 못했습니다.'
            : 'TMAP 도보 경로 요청에 실패했습니다.';
      return res.status(response.status >= 400 && response.status < 500
        && ![401, 403, 429].includes(response.status) ? 422 : 502)
        .json({ error, upstreamStatus: response.status });
    }

    const features = Array.isArray(payload.features) ? payload.features : [];
    const startFeature = features.find((feature) => feature.properties?.pointType === 'SP');
    const endFeature = features.find((feature) => feature.properties?.pointType === 'EP');
    const totalSeconds = Number(startFeature?.properties?.totalTime);
    const distance = Number(startFeature?.properties?.totalDistance);
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0
      || !Number.isFinite(distance) || distance <= 0) {
      return res.status(502).json({ error: 'TMAP 도보 경로의 실제 거리 또는 소요시간이 없습니다.' });
    }
    const lineFeatures = features.filter((feature) => feature.geometry?.type === 'LineString');
    const segments = lineFeatures.map((feature) => {
      const coordinates = lineCoordinates(feature.geometry.coordinates);
      return coordinates ? { mode: 'WALK', color: '#29d5e6', coordinates } : null;
    });
    const directions = features.filter((feature) => feature.geometry?.type === 'Point')
      .map((feature) => feature.properties?.description)
      .filter((description) => typeof description === 'string' && description.trim())
      .slice(0, 300)
      .map((description) => description.trim().slice(0, 200));
    const guidePoints = features.filter((feature) => feature.geometry?.type === 'Point')
      .slice(0, 300)
      .map((feature) => {
        const [lng, lat] = feature.geometry.coordinates || [];
        const position = point({ lat, lng });
        const turnType = Number(feature.properties?.turnType);
        return position && Number.isInteger(turnType)
          ? { ...position, turnType } : null;
      }).filter(Boolean);
    if (!segments.length || segments.some((segment) => !segment)) {
      return res.status(502).json({ error: 'TMAP 도보 경로의 실제 지도 좌표가 부족합니다.' });
    }
    const first = segments[0].coordinates[0];
    const last = segments.at(-1).coordinates.at(-1);
    const shapeStart = { lat: first[1], lng: first[0] };
    const shapeEnd = { lat: last[1], lng: last[0] };
    const startCoordinates = startFeature?.geometry?.coordinates;
    const endCoordinates = endFeature?.geometry?.coordinates;
    const reportedStart = point({ lat: startCoordinates?.[1], lng: startCoordinates?.[0] });
    const reportedEnd = point({ lat: endCoordinates?.[1], lng: endCoordinates?.[0] });
    if (!reportedStart || !reportedEnd || distanceMeters(start, reportedStart) > 150
      || distanceMeters(end, reportedEnd) > 150 || distanceMeters(start, shapeStart) > 150
      || distanceMeters(end, shapeEnd) > 150) {
      return res.status(502).json({ error: 'TMAP 도보 경로선의 출발지 또는 목적지 좌표가 요청과 일치하지 않습니다.' });
    }

    return res.status(200).json({
      route: { totalSeconds, distanceMeters: distance, segments, directions, guidePoints },
      coordinateMatch: true
    });
  } catch {
    return res.status(502).json({ error: controller.signal.aborted
      ? 'TMAP 도보 경로 응답 시간이 초과됐습니다. 다시 시도해 주세요.'
      : 'TMAP 보행 경로 서비스에 연결하지 못했습니다.' });
  } finally {
    clearTimeout(timeout);
  }
};
