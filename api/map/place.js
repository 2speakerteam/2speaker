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

  const clientId = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_API_HUB_API_KEY?.trim();
  if (!clientId || !clientSecret) {
    return res.status(503).json({ error: '네이버 장소 검색 인증 정보가 설정되지 않았습니다.' });
  }

  const endpoint = new URL('https://naverapihub.apigw.ntruss.com/search/v1/local');
  endpoint.searchParams.set('query', query);
  endpoint.searchParams.set('display', '1');
  endpoint.searchParams.set('start', '1');
  endpoint.searchParams.set('sort', 'random');
  endpoint.searchParams.set('format', 'json');

  try {
    const response = await fetch(endpoint, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
        Accept: 'application/json'
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? '네이버 장소 검색 인증 설정을 확인해 주세요.'
        : response.status === 429
          ? '네이버 장소 검색 사용 한도에 도달했습니다.'
          : '네이버 장소 검색에 연결하지 못했습니다.';
      return res.status(502).json({ error: message });
    }

    const item = payload.items?.[0];
    if (!item) return res.status(200).json({ place: null });

    const lng = coordinate(item.mapx, 180);
    const lat = coordinate(item.mapy, 90);
    if (lat === null || lng === null) {
      return res.status(200).json({ place: null });
    }

    return res.status(200).json({
      place: {
        title: plainText(item.title, query),
        lat,
        lng
      }
    });
  } catch {
    return res.status(502).json({ error: '네이버 장소 검색에 연결하지 못했습니다.' });
  }
};

