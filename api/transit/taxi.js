const TMAP_DRIVE_URL = 'https://apis.openapi.sk.com/tmap/routes?version=1';

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
  if (!start || !end || (Math.abs(start.lat - end.lat) < 0.00001
    && Math.abs(start.lng - end.lng) < 0.00001)) {
    return res.status(400).json({ error: '출발지와 목적지 좌표를 확인해 주세요.' });
  }
  const appKey = process.env.TMAP_TRANSIT_API_KEY?.trim();
  if (!appKey) return res.status(503).json({ error: 'TMAP 자동차 경로 인증 정보가 설정되지 않았습니다.' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(TMAP_DRIVE_URL, {
      method: 'POST',
      headers: { appKey, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startX: start.lng, startY: start.lat, endX: end.lng, endY: end.lat,
        startName: encodeURIComponent('출발지'), endName: encodeURIComponent('목적지'),
        reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
        searchOption: 0, carType: 1, totalValue: 1, sort: 'index', trafficInfo: 'Y'
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = response.status === 401 || response.status === 403
        ? 'TMAP 자동차 경로 API 이용 권한을 확인해 주세요.'
        : response.status === 429
          ? 'TMAP 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
          : response.status >= 400 && response.status < 500
            ? 'TMAP에서 이 출발지와 목적지 사이의 자동차 경로를 찾지 못했습니다.'
            : 'TMAP 자동차 경로 요청에 실패했습니다.';
      return res.status(response.status >= 400 && response.status < 500
        && ![401, 403, 429].includes(response.status) ? 422 : 502)
        .json({ error, upstreamStatus: response.status });
    }
    const features = Array.isArray(payload.features) ? payload.features : [];
    const summary = features.find((feature) => feature.geometry?.type === 'Point'
      && Number.isFinite(Number(feature.properties?.totalTime))
      && Number.isFinite(Number(feature.properties?.totalDistance)))?.properties;
    const totalSeconds = Number(summary?.totalTime);
    const distanceMeters = Number(summary?.totalDistance);
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0
      || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
      return res.status(502).json({ error: 'TMAP 자동차 경로의 실제 거리 또는 소요시간이 없습니다.' });
    }
    const lineFeatures = features.filter((feature) => feature.geometry?.type === 'LineString');
    const segments = lineFeatures.map((feature) => {
      const coordinates = lineCoordinates(feature.geometry.coordinates);
      return coordinates ? { mode: 'TAXI', color: '#29d5e6', coordinates } : null;
    });
    if (!segments.length || segments.some((segment) => !segment)) {
      return res.status(502).json({ error: 'TMAP 자동차 경로의 실제 지도 좌표가 부족합니다.' });
    }
    const taxiFare = Number(summary.taxiFare);
    return res.status(200).json({ route: {
      totalSeconds, distanceMeters,
      taxiFare: Number.isFinite(taxiFare) && taxiFare > 0 ? taxiFare : null,
      segments
    }, requestedStart: start, requestedEnd: end });
  } catch {
    return res.status(502).json({ error: controller.signal.aborted
      ? 'TMAP 응답 시간이 초과됐습니다. 다시 시도해 주세요.'
      : 'TMAP 자동차 경로 서비스에 연결하지 못했습니다.' });
  } finally {
    clearTimeout(timeout);
  }
};
