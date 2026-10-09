const TMAP_POIS_URL = 'https://apis.openapi.sk.com/tmap/pois';

function coordinate(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function toList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizePoi(poi) {
  const latitude = coordinate(poi?.frontLat || poi?.noorLat, 33, 40);
  const longitude = coordinate(poi?.frontLon || poi?.noorLon, 124, 133);
  if (latitude === null || longitude === null) return null;
  const address = [
    poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName,
    poi.detailAddrName || poi.detailAddrname
  ].filter(Boolean).join(' ');
  return {
    id: String(poi.id || poi.pkey || ''),
    name: String(poi.name || '').trim(),
    latitude,
    longitude,
    address
  };
}

function distanceMeters(from, to) {
  const radians = Math.PI / 180;
  const deltaLat = (to.latitude - from.latitude) * radians;
  const deltaLon = (to.longitude - from.longitude) * radians;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians)
    * Math.sin(deltaLon / 2) ** 2;
  return Math.round(12742000 * Math.asin(Math.min(1, Math.sqrt(a))));
}

async function searchPois(appKey, keyword, center) {
  const url = new URL(TMAP_POIS_URL);
  url.searchParams.set('version', '1');
  url.searchParams.set('searchKeyword', keyword);
  url.searchParams.set('searchType', 'all');
  url.searchParams.set('searchtypCd', center ? 'R' : 'A');
  url.searchParams.set('count', center ? '40' : '10');
  url.searchParams.set('resCoordType', 'WGS84GEO');
  if (center) {
    url.searchParams.set('radius', '2');
    url.searchParams.set('centerLat', String(center.latitude));
    url.searchParams.set('centerLon', String(center.longitude));
    url.searchParams.set('reqCoordType', 'WGS84GEO');
  }
  const upstream = await fetch(url, {
    headers: { accept: 'application/json', appKey }
  });
  if (!upstream.ok) {
    const error = new Error(upstream.status === 401 || upstream.status === 403
      ? 'TMAP 장소 검색 API 사용 권한을 확인해 주세요.'
      : upstream.status === 429
        ? 'TMAP 장소 검색 요청 한도에 도달했어요.'
        : '주변 승강장 검색에 연결하지 못했어요.');
    error.status = upstream.status;
    throw error;
  }
  const payload = await upstream.json();
  return toList(payload?.searchPoiInfo?.pois?.poi)
    .map(normalizePoi).filter((place) => place?.name);
}

async function nearbyCategory(appKey, keywords, center, category) {
  const found = new Map();
  for (const keyword of keywords) {
    const places = await searchPois(appKey, keyword, center);
    for (const place of places) {
      const distance = distanceMeters(center, place);
      if (distance > 2000) continue;
      if (category === 'taxi' && !/택시|taxi/i.test(place.name)) continue;
      if (category === 'bus' && !/버스|정류장|정류소|bus/i.test(place.name)) continue;
      const key = place.id || String(place.latitude) + ':' + String(place.longitude);
      found.set(key, { ...place, distanceMeters: distance });
    }
    if (found.size >= 5) break;
  }
  return [...found.values()].sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 5);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET 요청만 사용할 수 있어요.' });
  }
  const appKey = process.env.TMAP_POI_API_KEY
    || process.env.TMAP_CAR_API_KEY
    || process.env.TMAP_TRANSIT_API_KEY;
  if (!appKey) return res.status(503).json({ error: 'TMAP API 키가 서버에 설정되지 않았어요.' });

  const anchor = String(req.query?.anchor || '').trim();
  const lat = req.query?.lat == null ? null : coordinate(req.query.lat, 33, 40);
  const lon = req.query?.lon == null ? null : coordinate(req.query.lon, 124, 133);
  if (anchor.length > 80 || (!anchor && (lat === null || lon === null))) {
    return res.status(400).json({ error: '국내 기준 장소나 현재 위치를 확인해 주세요.' });
  }
  try {
    let center;
    if (anchor) {
      const anchors = await searchPois(appKey, anchor, null);
      const normalized = anchor.replace(/\s/g, '');
      center = anchors.find((place) => place.name.replace(/\s/g, '') === normalized)
        || anchors.find((place) => place.name.includes(anchor))
        || anchors[0];
      if (!center) return res.status(404).json({ error: '기준 장소를 찾지 못했어요. 역 이름이나 주소를 확인해 주세요.' });
    } else {
      center = { name: '현재 위치', latitude: lat, longitude: lon };
    }
    const [taxi, bus] = await Promise.allSettled([
      nearbyCategory(appKey, ['택시승강장', '택시정류장'], center, 'taxi'),
      nearbyCategory(appKey, ['버스정류장', '버스정류소'], center, 'bus')
    ]);
    if (taxi.status === 'rejected' && bus.status === 'rejected') throw taxi.reason;
    return res.status(200).json({
      center,
      taxi: taxi.status === 'fulfilled' ? taxi.value : [],
      bus: bus.status === 'fulfilled' ? bus.value : [],
      errors: {
        taxi: taxi.status === 'rejected' ? taxi.reason.message : null,
        bus: bus.status === 'rejected' ? bus.reason.message : null
      }
    });
  } catch (error) {
    const status = Number(error?.status);
    return res.status([401, 403, 429].includes(status) ? status : 502)
      .json({ error: error?.message || '주변 승강장을 찾지 못했어요.' });
  }
};
