const NAVER_LOCAL_SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/local';
const TMAP_PEDESTRIAN_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
const MAX_CANDIDATES = 5;
const responseCache = new Map();
const CATEGORY_LABELS = Object.freeze({
  lodging: '숙소', cafe: '카페', restaurant: '식당', pharmacy: '약국', hospital: '병원',
  convenience_store: '편의점', attraction: '관광지', parking: '주차장', restroom: '화장실',
  park: '공원', station: '역', other: '장소'
});

function coordinate(value, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function naverCoordinate(value, minimum, maximum) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const parsed = Math.abs(raw) > maximum ? raw / 10_000_000 : raw;
  return coordinate(parsed, minimum, maximum);
}

function cleanText(value, limit = 300) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim().slice(0, limit);
}

function normalizePlace(item, index) {
  const latitude = naverCoordinate(item?.mapy, -90, 90);
  const longitude = naverCoordinate(item?.mapx, -180, 180);
  if (latitude === null || longitude === null) return null;
  return {
    id: `${index}-${longitude.toFixed(7)}-${latitude.toFixed(7)}`,
    name: cleanText(item?.title, 120) || '이름 없는 장소',
    category: cleanText(item?.category, 100),
    description: cleanText(item?.description, 220),
    address: cleanText(item?.roadAddress || item?.address, 220),
    link: typeof item?.link === 'string' ? item.link.slice(0, 500) : '',
    latitude,
    longitude
  };
}

async function searchNaver(query, clientId, clientSecret) {
  const url = new URL(NAVER_LOCAL_SEARCH_URL);
  url.search = new URLSearchParams({ query, display: String(MAX_CANDIDATES), start: '1', sort: 'random', format: 'json' });
  const response = await fetch(url, {
    headers: { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret, accept: 'application/json' },
    signal: AbortSignal.timeout(7000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.items)) {
    const statusCode = response.ok ? 502 : response.status || 502;
    const error = new Error(statusCode === 401 || statusCode === 403
      ? '네이버 API HUB 인증 정보와 지역 검색 권한을 확인해 주세요.'
      : statusCode === 429
        ? '네이버 지역 검색 일일 호출 한도에 도달했어요. 나중에 다시 시도해 주세요.'
        : '네이버에서 장소 검색 결과를 받지 못했어요.');
    error.statusCode = statusCode >= 500 ? 502 : statusCode;
    throw error;
  }
  return payload.items.map(normalizePlace).filter(Boolean).slice(0, MAX_CANDIDATES);
}

function compactPedestrianRoute(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const summary = features.find((feature) => Number(feature?.properties?.totalTime) > 0)?.properties || {};
  const totalTime = Number(summary.totalTime);
  if (!Number.isFinite(totalTime) || totalTime <= 0) return null;
  const inKorea = (point) => Array.isArray(point) && point.length >= 2
    && coordinate(point[0], 124, 133) !== null && coordinate(point[1], 33, 40) !== null;
  const paths = features.filter((feature) => feature?.geometry?.type === 'LineString')
    .map((feature) => (feature.geometry.coordinates || []).filter(inKorea).map(([longitude, latitude]) => [Number(longitude), Number(latitude)]))
    .filter((path) => path.length > 1);
  const maneuvers = features.filter((feature) => feature?.geometry?.type === 'Point' && inKorea(feature.geometry.coordinates))
    .map((feature) => ({
      position: feature.geometry.coordinates.slice(0, 2).map(Number),
      description: typeof feature.properties?.description === 'string' ? feature.properties.description.slice(0, 300) : '',
      turnType: Number.isFinite(Number(feature.properties?.turnType)) ? Number(feature.properties.turnType) : null
    }));
  if (!paths.length) return null;
  return {
    totalTime: Math.max(1, Math.round(totalTime)),
    totalDistance: Math.max(0, Math.round(Number(summary.totalDistance) || 0)),
    paths,
    maneuvers
  };
}

async function requestPedestrianRoute(start, end, startName, endName, appKey) {
  const response = await fetch(TMAP_PEDESTRIAN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'Content-Type': 'application/json', appKey },
    body: JSON.stringify({
      startX: start.longitude, startY: start.latitude, endX: end.longitude, endY: end.latitude,
      startName: encodeURIComponent(startName), endName: encodeURIComponent(endName),
      reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: '10', sort: 'index'
    }),
    signal: AbortSignal.timeout(8000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 429
      ? 'TMAP 도보 경로 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.'
      : response.status === 401 || response.status === 403
        ? 'TMAP 도보 경로 API 키나 권한을 확인해 주세요.'
        : 'TMAP에서 도보 경로를 받지 못했어요.');
    error.statusCode = response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 503 : 502;
    throw error;
  }
  return compactPedestrianRoute(payload);
}

function validateCriteria(value) {
  if (!value || typeof value !== 'object') return null;
  const category = typeof value.category === 'string' ? value.category : '';
  if (!CATEGORY_LABELS[category]) return null;
  const originName = typeof value.originName === 'string' ? value.originName.trim().slice(0, 100) : '';
  const preference = typeof value.preference === 'string' ? value.preference.trim().slice(0, 120) : '';
  const minutes = Number(value.walkingLimitMinutes);
  return {
    category, categoryLabel: CATEGORY_LABELS[category], originName,
    useCurrentLocation: Boolean(value.useCurrentLocation),
    walkingLimitMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(60, Math.max(1, Math.round(minutes))) : null,
    preference, sortBy: value.sortBy === 'walking_time' ? 'walking_time' : 'relevance'
  };
}

function cacheResponse(key, value) {
  if (responseCache.size >= 32) responseCache.delete(responseCache.keys().next().value);
  responseCache.set(key, { savedAt: Date.now(), value });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }
  const clientId = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_API_HUB_API_KEY?.trim();
  const tmapAppKey = process.env.TMAP_CAR_API_KEY?.trim() || process.env.TMAP_TRANSIT_API_KEY?.trim();
  if (!clientId || !clientSecret) return res.status(503).json({ error: '네이버 API HUB 인증 정보(NAVER_API_HUB_CLIENT_ID/API_KEY)를 확인해 주세요.' });
  if (!tmapAppKey) return res.status(503).json({ error: 'TMAP 도보 경로 키를 서버에서 찾지 못했어요.' });

  const criteria = validateCriteria(req.body?.criteria);
  if (!criteria) return res.status(400).json({ error: '검색 조건을 확인하지 못했어요. 다시 말하거나 입력해 주세요.' });
  const currentLocation = req.body?.currentLocation || {};
  const regionName = typeof req.body?.regionName === 'string' ? req.body.regionName.trim().slice(0, 100) : '';
  const cacheKey = JSON.stringify({ criteria, lat: criteria.useCurrentLocation ? currentLocation.latitude : null,
    lon: criteria.useCurrentLocation ? currentLocation.longitude : null, regionName });
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < 5 * 60 * 1000) return res.status(200).json(cached.value);

  let origin;
  if (criteria.useCurrentLocation) {
    const latitude = coordinate(currentLocation.latitude, 33, 39.5);
    const longitude = coordinate(currentLocation.longitude, 124, 132.5);
    if (latitude === null || longitude === null) return res.status(400).json({ error: '현재 위치를 확인할 수 없어요. 역이나 동네 이름을 함께 말해 주세요.' });
    origin = { name: regionName || '현재 위치', latitude, longitude };
  } else {
    if (!criteria.originName) return res.status(400).json({ error: '어디를 기준으로 찾을지 역이나 동네 이름을 말해 주세요.' });
    try {
      const anchors = await searchNaver(criteria.originName, clientId, clientSecret);
      if (!anchors.length) return res.status(404).json({ error: '출발 기준 장소를 네이버에서 찾지 못했어요. 역이나 동네 이름을 확인해 주세요.' });
      origin = { name: criteria.originName, latitude: anchors[0].latitude, longitude: anchors[0].longitude };
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message });
    }
  }

  const categoryTerm = criteria.category === 'other' ? '' : criteria.categoryLabel;
  const query = [criteria.originName || regionName, categoryTerm, criteria.preference].filter(Boolean).join(' ').slice(0, 180) || criteria.categoryLabel;
  let candidates;
  try {
    candidates = await searchNaver(query, clientId, clientSecret);
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message });
  }

  const places = [];
  let routeFailure = null;
  // Fixed, sequential cap: at most five TMAP pedestrian requests per uncached search.
  for (const candidate of candidates) {
    try {
      const route = await requestPedestrianRoute(origin, candidate, origin.name, candidate.name, tmapAppKey);
      if (!route) continue;
      const walkingMinutes = Math.max(1, Math.ceil(route.totalTime / 60));
      if (criteria.walkingLimitMinutes && walkingMinutes > criteria.walkingLimitMinutes) continue;
      places.push({ ...candidate, walkingMinutes, walkingDistanceMeters: route.totalDistance, route });
    } catch (error) {
      routeFailure = error;
      if (error.statusCode === 429 || error.statusCode === 503) break;
    }
  }
  if (!places.length && routeFailure) return res.status(routeFailure.statusCode || 502).json({ error: routeFailure.message });
  if (criteria.sortBy === 'walking_time') places.sort((a, b) => a.walkingMinutes - b.walkingMinutes || a.walkingDistanceMeters - b.walkingDistanceMeters);
  const result = { origin, criteria, query, checkedCandidates: candidates.length, routeFailures: routeFailure ? 1 : 0, places };
  cacheResponse(cacheKey, result);
  return res.status(200).json(result);
};
