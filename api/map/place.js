const { nearbyInput, nearbyPlaces } = require('../../lib/nearby-places');

function plainText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
  return text.slice(0, 160) || fallback;
}

function coordinate(value, limit) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  // NAVER local search returns WGS84 longitude/latitude as integers scaled by 10^7.
  const normalized = Math.abs(parsed) <= limit ? parsed : parsed / 10_000_000;
  return Math.abs(normalized) <= limit ? normalized : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }

  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  if (!query || query.length > 200) {
    return res.status(400).json({ error: '목적지 이름을 확인해 주세요.' });
  }

  const origin = req.body?.nearby ? nearbyInput(req.body.nearby) : null;
  if (req.body?.nearby && !origin) {
    return res.status(400).json({ error: '주변 검색을 위한 현재 GPS와 지역 정보를 확인해 주세요.' });
  }

  const clientId = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_API_HUB_API_KEY?.trim();
  if (!clientId || !clientSecret) {
    return res.status(503).json({ error: '네이버 장소 검색 인증 정보가 설정되지 않았습니다.' });
  }

  try {
    const search = async (term) => {
      const endpoint = new URL('https://naverapihub.apigw.ntruss.com/search/v1/local');
      endpoint.searchParams.set('query', term);
      endpoint.searchParams.set('display', '5'); // NAVER local-search maximum.
      endpoint.searchParams.set('start', '1');
      endpoint.searchParams.set('sort', 'random'); // NAVER documents this value as accuracy order.
      endpoint.searchParams.set('format', 'json');
      const response = await fetch(endpoint, {
        ...(origin ? { signal: AbortSignal.timeout(10000) } : {}),
        headers: {
          'X-NCP-APIGW-API-KEY-ID': clientId,
          'X-NCP-APIGW-API-KEY': clientSecret,
          Accept: 'application/json'
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(response.status === 401 || response.status === 403
          ? '네이버 장소 검색 인증 설정을 확인해 주세요.'
          : response.status === 429
            ? '네이버 장소 검색 사용 한도에 도달했습니다.'
            : '네이버 장소 검색에 연결하지 못했습니다.');
        error.statusCode = response.status === 401 || response.status === 403 ? 503 : 502;
        throw error;
      }
      const items = Array.isArray(payload.items) ? payload.items : [];
      const places = items.flatMap((item) => {
        const lng = coordinate(item.mapx, 180);
        const lat = coordinate(item.mapy, 90);
        if (lat === null || lng === null) return [];
        return [{
          title: plainText(item.title, term),
          category: plainText(item.category, ''),
          address: plainText(item.address, ''),
          roadAddress: plainText(item.roadAddress, ''),
          lat,
          lng
        }];
      });
      if (items.length && !places.length) {
        const error = new Error('네이버 장소 좌표를 확인할 수 없습니다.');
        error.statusCode = 502;
        throw error;
      }
      return places;
    };

    if (origin) {
      const result = await nearbyPlaces(query, origin, search);
      return res.status(200).json(result);
    }

    const normalized = (value) => String(value || '').toLowerCase().replace(/\s+/g, '');
    let places = await search(query);
    const stationExitName = query.match(/^(.+?역)\s*출구$/)?.[1];
    const hasStationExit = stationExitName && places.some((place) =>
      place.category === '교통시설>지하철출구번호'
      && normalized(place.title).startsWith(normalized(stationExitName)));
    if (!hasStationExit && !places.some((place) => normalized(place.title).startsWith(normalized(query)))) {
      // The first five accuracy results can all be businesses inside a landmark.
      const landmarkPlaces = await search(`${query} 명소`);
      const namedLandmarks = landmarkPlaces.filter((place) =>
        normalized(place.title).startsWith(normalized(query)));
      if (namedLandmarks.length) places = namedLandmarks;
    }
    return res.status(200).json({ places, place: places[0] || null });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || '네이버 장소 검색에 연결하지 못했습니다.' });
  }
};

