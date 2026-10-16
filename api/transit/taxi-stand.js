const POI_URL = 'https://apis.openapi.sk.com/tmap/pois';
const MAX_BOARDING_DISTANCE_METERS = 500;

function point(value) {
  if (value?.lat === null || value?.lat === undefined || String(value.lat).trim() === ''
    || value?.lng === null || value?.lng === undefined || String(value.lng).trim() === '') return null;
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Math.abs(lat) <= 90
    && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function distanceMeters(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const arc = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(arc)));
}

function naverPoint(item) {
  const lat = Number(item?.mapy);
  const lng = Number(item?.mapx);
  return point({
    lat: Math.abs(lat) <= 90 ? lat : lat / 10000000,
    lng: Math.abs(lng) <= 180 ? lng : lng / 10000000
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }
  const start = point(req.body?.start);
  if (!start) return res.status(400).json({ error: '출발지 좌표를 확인해 주세요.' });
  const appKey = process.env.TMAP_TRANSIT_API_KEY?.trim();
  const hint = typeof req.body?.hint === 'string'
    ? req.body.hint.trim().replace(/\s+\d+호선$/, '').slice(0, 60) : '';
  const naverId = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const naverKey = process.env.NAVER_API_HUB_API_KEY?.trim();
  if (!appKey && !(hint && naverId && naverKey)) {
    return res.status(503).json({ error: '택시 승강장 검색 인증 정보가 설정되지 않았습니다.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const search = async (keyword) => {
      const url = new URL(POI_URL);
      Object.entries({
        version: '1', searchKeyword: keyword, searchtypCd: 'R',
        centerLon: String(start.lng), centerLat: String(start.lat), radius: '2',
        page: '1', count: '20', reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO'
      }).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await fetch(url, {
        headers: { appKey, Accept: 'application/json' }, signal: controller.signal
      });
      if (!response.ok) throw new Error('TMAP 택시 승강장 검색에 실패했습니다.');
      const payload = await response.json().catch(() => ({}));
      const items = payload.searchPoiInfo?.pois?.poi;
      return (Array.isArray(items) ? items : items ? [items] : []).flatMap((item) => {
        const name = typeof item.name === 'string' ? item.name.trim().slice(0, 100) : '';
        if (!/택시.*(?:승강장|승차대|정류장|타는\s*곳)|(?:승강장|승차대).*택시/.test(name)) return [];
        const location = [
          point({ lat: item.frontLat, lng: item.frontLon }),
          point({ lat: item.noorLat, lng: item.noorLon })
        ].filter(Boolean).sort((a, b) => distanceMeters(start, a) - distanceMeters(start, b))[0];
        if (!location) return [];
        const distance = distanceMeters(start, location);
        return distance <= MAX_BOARDING_DISTANCE_METERS
          ? [{ name, location, distanceMeters: Math.round(distance) }] : [];
      });
    };
    const tmapResults = appKey
      ? await Promise.allSettled(['택시승강장', '택시승차대'].map(search)) : [];
    let results = tmapResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    if (!results.length && hint && naverId && naverKey) {
      const naverSearch = async (keyword) => {
        const url = new URL('https://naverapihub.apigw.ntruss.com/search/v1/local');
        url.searchParams.set('query', `${hint} ${keyword}`);
        url.searchParams.set('display', '5');
        url.searchParams.set('sort', 'random');
        const response = await fetch(url, { headers: {
          'X-NCP-APIGW-API-KEY-ID': naverId,
          'X-NCP-APIGW-API-KEY': naverKey,
          Accept: 'application/json'
        }, signal: controller.signal });
        if (!response.ok) return [];
        const payload = await response.json().catch(() => ({}));
        return (Array.isArray(payload.items) ? payload.items : []).flatMap((item) => {
          const name = String(item.title || '').replace(/<[^>]*>/g, '').trim().slice(0, 100);
          if (!/택시.*(?:승강장|승차대|정류장|타는\s*곳)|(?:승강장|승차대).*택시/.test(name)) return [];
          const location = naverPoint(item);
          if (!location) return [];
          const distance = distanceMeters(start, location);
          return distance <= MAX_BOARDING_DISTANCE_METERS
            ? [{ name, location, distanceMeters: Math.round(distance) }] : [];
        });
      };
      const naverResults = await Promise.allSettled(['택시승강장', '택시승차대'].map(naverSearch));
      results = naverResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    }
    results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return res.status(200).json({ stand: results[0] || null });
  } catch (error) {
    return res.status(error.name === 'AbortError' ? 504 : 502).json({
      error: error.name === 'AbortError'
        ? '택시 승강장 검색 시간이 초과되었습니다.'
        : error.message || '택시 승강장을 검색하지 못했습니다.'
    });
  } finally {
    clearTimeout(timeout);
  }
};
