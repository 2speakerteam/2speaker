const TMAP_TRANSIT_ROUTES_URL = 'https://apis.openapi.sk.com/transit/routes';

function coordinate(value, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? String(parsed) : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }

  const appKey = process.env.TMAP_TRANSIT_API_KEY;
  if (!appKey) {
    return res.status(503).json({ error: 'TMAP 경로 API 키가 서버에 설정되지 않았어요.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const startX = coordinate(body.startX, -180, 180);
  const startY = coordinate(body.startY, -90, 90);
  const endX = coordinate(body.endX, -180, 180);
  const endY = coordinate(body.endY, -90, 90);

  if (!startX || !startY || !endX || !endY) {
    return res.status(400).json({ error: '출발지와 목적지의 좌표가 올바르지 않아요.' });
  }

  try {
    const upstream = await fetch(TMAP_TRANSIT_ROUTES_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        appKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        startX,
        startY,
        endX,
        endY,
        count: Math.min(3, Math.max(1, Number(body.count) || 3)),
        lang: body.lang === 1 ? 1 : 0,
        format: 'json'
      })
    });

    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }

    if (!upstream.ok || !payload || payload.error) {
      return res.status(upstream.ok ? 502 : upstream.status).json({
        error: 'TMAP 대중교통 API에서 경로를 받지 못했어요.'
      });
    }

    return res.status(200).json(payload);
  } catch {
    return res.status(502).json({ error: 'TMAP 대중교통 API에 연결하지 못했어요.' });
  }
};
