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

const CATEGORY_PATTERNS = Object.freeze([
  ['lodging', /숙소|호텔|모텔|게스트하우스|민박|여관|호텔/i],
  ['cafe', /카페|커피숍|커피\s*전문점|cafe|coffee\s*shop/i],
  ['restaurant', /식당|맛집|음식점|레스토랑|restaurant/i],
  ['pharmacy', /약국|pharmacy/i],
  ['hospital', /병원|의원|hospital/i],
  ['convenience_store', /편의점|convenience\s*store/i],
  ['attraction', /관광지|명소|볼거리|attraction/i],
  ['parking', /주차장|주차|parking/i],
  ['restroom', /화장실|restroom|toilet/i],
  ['park', /공원|park/i],
  ['station', /지하철역|기차역|(?:^|\s)역\s*(?:찾아|검색|추천|보여|알려|근처|주변)|station/i]
]);

const PLACE_WORDS = /숙소|호텔|모텔|게스트하우스|민박|여관|카페|커피숍|커피\s*전문점|식당|맛집|음식점|레스토랑|약국|병원|의원|편의점|관광지|명소|볼거리|주차장|주차|화장실|공원|지하철역|기차역|장소|공간|accommodation|hotel|motel|cafe|coffee\s*shop|restaurant|pharmacy|hospital|convenience\s*store|attraction|parking|restroom|toilet|park|station/ig;
const REQUEST_WORDS = /찾아\s*주세요|찾아\s*줘|검색\s*해\s*주세요|검색\s*해\s*줘|추천\s*해\s*주세요|추천\s*해\s*줘|알려\s*주세요|알려\s*줘|보여\s*주세요|보여\s*줘|있을까요|있나요|있어요|있습니까|근처(?:에서|에|의)?|주변(?:에서|에|의)?|부근(?:에서|에|의)?|인근(?:에서|에|의)?|주위(?:에서|에|의)?|기준으로|기준|도보로|걸어서|도보|가장|제일|가까운\s*순|가까운\s*곳|가까운|가까이|최단|거리순|순으로|이내까지|이내|안쪽|안으로|내로|분|조용하고|조용한|조용|저렴하고|저렴한|저렴|싼|가성비\s*좋은|가성비|영업\s*중|문\s*연|열린|평점\s*높은|에서|으로|find|search|recommend|show\s+me|nearby|near\s+me|around|closest|nearest/ig;

function interpretPlaceQuery(query) {
  const text = String(query || '').trim();
  const categoryEntry = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(text));
  const category = categoryEntry?.[0] || 'other';
  const currentLocationRequested = /현재\s*위치|내\s*위치|여기\s*근처|이곳\s*근처|near\s+me/i.test(text);
  const walkingMatch = text.match(/(?:(?:도보(?:로)?|걸어서)\s*)?(\d{1,2})\s*분\s*(?:이내|안(?:쪽)?|내로|안으로|이내까지)/i);
  const sortBy = /가장\s*가까운|제일\s*가까운|가까운\s*순|가까운\s*곳|최단|거리순|closest|nearest/i.test(text)
    ? 'walking_time' : 'relevance';
  const preferences = [];
  if (/조용/i.test(text)) preferences.push('조용한');
  if (/저렴|싼|가성비/i.test(text)) preferences.push('저렴한');
  if (/영업\s*중|문\s*연|열린/i.test(text)) preferences.push('영업 중');
  if (/평점\s*높/i.test(text)) preferences.push('평점 높은');

  let originName = text
    .replace(/현재\s*위치|내\s*위치|여기|이곳|지금\s*위치/ig, ' ')
    .replace(/\d{1,2}\s*분\s*(?:이내|안(?:쪽)?|내로|안으로|이내까지|정도)?/ig, ' ')
    .replace(PLACE_WORDS, ' ')
    .replace(/(^|\s)역(?=\s|$)/ig, ' ')
    .replace(REQUEST_WORDS, ' ')
    .replace(/조용(?:하고|한)?|저렴(?:하고|한)?|싼|가성비\s*좋은|가성비|영업\s*중|문\s*연|열린|평점\s*높은/ig, ' ')
    .replace(/[.,!?·~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove particles left around a location name without altering the name itself.
  originName = originName.replace(/(^|\s)(?:의|에|은|는|을|를|좀)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 100);
  if (currentLocationRequested || !originName) originName = '';

  return validateCriteria({
    category,
    originName,
    useCurrentLocation: currentLocationRequested || !originName,
    walkingLimitMinutes: walkingMatch ? Number(walkingMatch[1]) : null,
    preference: preferences.join(' '),
    sortBy
  });
}

async function interpretRequest(req, res) {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  if (!query || query.length > 500) return res.status(400).json({ error: '장소 검색 문장을 확인해 주세요. 500자까지 입력할 수 있어요.' });
  const criteria = interpretPlaceQuery(query);
  if (!criteria) return res.status(502).json({ error: '장소 종류와 검색 조건을 이해하지 못했어요. 장소 종류를 조금 더 구체적으로 말해 주세요.' });
  const { categoryLabel, ...publicCriteria } = criteria;
  return res.status(200).json({ criteria: publicCriteria });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }
  if (req.body?.action === 'interpret') return interpretRequest(req, res);
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
