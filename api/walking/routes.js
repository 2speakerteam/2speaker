const TMAP_WALKING_ROUTES_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';

function coordinate(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }

  const appKey = process.env.TMAP_CAR_API_KEY || process.env.TMAP_TRANSIT_API_KEY;
  if (!appKey) {
    return res.status(503).json({ error: 'TMAP API 키가 서버에 설정되지 않았어요.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const startX = coordinate(body.startX, 124, 133);
  const startY = coordinate(body.startY, 33, 40);
  const endX = coordinate(body.endX, 124, 133);
  const endY = coordinate(body.endY, 33, 40);
  if ([startX, startY, endX, endY].some((value) => value === null)) {
    return res.status(400).json({ error: '국내 출발지와 목적지 좌표가 올바르지 않아요.' });
  }

  try {
    const upstream = await fetch(TMAP_WALKING_ROUTES_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        appKey
      },
      body: JSON.stringify({
        startX,
        startY,
        endX,
        endY,
        startName: encodeURIComponent('출발지'),
        endName: encodeURIComponent('목적지'),
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: '0'
      })
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !payload) {
      const error = upstream.status === 401 || upstream.status === 403
        ? '보행 경로 API 사용 권한을 확인해 주세요.'
        : upstream.status === 429
          ? '보행 경로 API 요청 한도에 도달했어요.'
          : '도보 경로를 불러오지 못했어요.';
      return res.status(upstream.ok ? 502 : upstream.status).json({ error });
    }

    const properties = payload.features?.find((feature) => Number(feature?.properties?.totalTime) > 0)?.properties;
    const totalTime = Number(properties?.totalTime);
    const totalDistance = Number(properties?.totalDistance);
    if (!Number.isFinite(totalTime) || totalTime <= 0) {
      return res.status(404).json({ error: '이 구간의 도보 경로를 찾지 못했어요.' });
    }
    return res.status(200).json({
      totalTime,
      totalDistance: Number.isFinite(totalDistance) && totalDistance >= 0 ? totalDistance : null
    });
  } catch {
    return res.status(502).json({ error: '보행 경로 API에 연결하지 못했어요.' });
  }
};
