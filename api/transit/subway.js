const TMAP_ROUTES_URL = 'https://apis.openapi.sk.com/transit/routes';

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

function text(value) {
  return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

function linePoints(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const tokens = value.trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 15000) return null;
  const points = tokens.map((token) => {
    const parts = token.split(',');
    if (parts.length !== 2) return null;
    const lng = coordinate(parts[0], 180);
    const lat = coordinate(parts[1], 90);
    return lat === null || lng === null ? null : [lng, lat];
  });
  return points.every(Boolean) ? points : null;
}

function samePoint(a, b) {
  return Math.abs(a.lat - b.lat) < 0.00001 && Math.abs(a.lng - b.lng) < 0.00001;
}

function matchRequestEcho(parameters, start, end) {
  if (!parameters || typeof parameters !== 'object') return false;
  const echoedStart = point({ lat: parameters.startY, lng: parameters.startX });
  const echoedEnd = point({ lat: parameters.endY, lng: parameters.endX });
  return Boolean(echoedStart && echoedEnd && samePoint(echoedStart, start) && samePoint(echoedEnd, end));
}

function parseItinerary(itinerary) {
  if (!itinerary || !Array.isArray(itinerary.legs) || itinerary.legs.length === 0) return null;
  const legs = itinerary.legs;
  if (Number(itinerary.pathType) !== 1 || !legs.some((leg) => leg.mode === 'SUBWAY')) return null;
  if (!legs.every((leg) => leg.mode === 'WALK' || leg.mode === 'SUBWAY')) return null;
  if (legs.some((leg) => leg.mode === 'SUBWAY' && Number(leg.service) === 0)) return null;

  const subwayLegs = [];
  const segments = [];
  let walkingGeometryIncomplete = false;
  for (const leg of legs) {
    if (leg.mode === 'SUBWAY') {
      const coordinates = linePoints(leg.passShape?.linestring);
      if (!coordinates) return { incompleteShape: 'subway' };
      const stations = Array.isArray(leg.passStopList?.stationList)
        ? leg.passStopList.stationList.map((station) => text(station.stationName)).filter(Boolean)
        : [];
      const detail = {
        route: text(leg.route),
        board: text(leg.start?.name),
        alight: text(leg.end?.name),
        seconds: Number.isFinite(Number(leg.sectionTime)) ? Number(leg.sectionTime) : null,
        stations
      };
      if (!detail.route || !detail.board || !detail.alight || detail.seconds === null || detail.seconds < 0) {
        return { incompleteDetails: true };
      }
      subwayLegs.push(detail);
      const routeColor = /^[0-9a-fA-F]{6}$/.test(leg.routeColor || '')
        ? `#${leg.routeColor}` : '#20c8e7';
      segments.push({ mode: 'SUBWAY', route: detail.route, color: routeColor, coordinates });
    } else if (Number(leg.distance) > 0) {
      if (!Array.isArray(leg.steps) || leg.steps.length === 0) {
        walkingGeometryIncomplete = true;
        continue;
      }
      for (const step of leg.steps) {
        const coordinates = linePoints(step.linestring);
        if (!coordinates) {
          walkingGeometryIncomplete = true;
          continue;
        }
        segments.push({ mode: 'WALK', color: '#d4e9f1', coordinates });
      }
    }
  }

  const totalSeconds = Number(itinerary.totalTime);
  const transferCount = Number(itinerary.transferCount);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0 || !Number.isInteger(transferCount) || transferCount < 0) {
    return { incompleteDetails: true };
  }
  const transfers = subwayLegs.slice(1).map((leg, index) => ({
    from: subwayLegs[index].alight,
    to: leg.board
  }));
  return { totalSeconds, transferCount, subwayLegs, transfers, segments, walkingGeometryIncomplete };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }
  const start = point(req.body?.start);
  const end = point(req.body?.end);
  if (!start || !end || samePoint(start, end)) {
    return res.status(400).json({ error: '출발지와 목적지 좌표를 확인해 주세요.' });
  }
  const appKey = process.env.TMAP_TRANSIT_API_KEY?.trim();
  if (!appKey) return res.status(503).json({ error: 'TMAP 대중교통 인증 정보가 설정되지 않았습니다.' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(TMAP_ROUTES_URL, {
      method: 'POST',
      headers: { appKey, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startX: String(start.lng), startY: String(start.lat),
        endX: String(end.lng), endY: String(end.lat),
        count: 10, lang: 0, format: 'json'
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? 'TMAP 인증 또는 대중교통 API 이용 권한을 확인해 주세요.'
        : response.status === 429
          ? 'TMAP 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
          : 'TMAP 대중교통 경로 요청에 실패했습니다.';
      return res.status(502).json({ error: message, upstreamStatus: response.status });
    }

    const metadata = payload.metaData;
    if (!metadata) {
      const code = Number(payload.error?.code ?? payload.errorCode ?? payload.code ?? payload.result?.code);
      return res.status(code >= 11 && code <= 14 ? 422 : 502).json({
        error: code >= 11 && code <= 14
          ? 'TMAP에서 이 출발지와 목적지 사이의 대중교통 경로를 찾지 못했습니다.'
          : 'TMAP 대중교통 응답 형식을 확인할 수 없습니다.'
      });
    }
    if (!matchRequestEcho(metadata?.requestParameters, start, end)) {
      return res.status(502).json({ error: 'TMAP 응답의 출발지·목적지 좌표가 요청과 일치하지 않습니다.' });
    }
    const itineraries = Array.isArray(metadata?.plan?.itineraries) ? metadata.plan.itineraries : [];
    let missingShape = false;
    let missingDetails = false;
    const shapeIssues = new Set();
    const routes = itineraries.flatMap((itinerary) => {
      const parsed = parseItinerary(itinerary);
      if (!parsed) return [];
      if (parsed.incompleteShape) {
        missingShape = true;
        shapeIssues.add(parsed.incompleteShape);
      }
      else if (parsed.incompleteDetails) missingDetails = true;
      else return [parsed];
      return [];
    });
    if (!routes.length) {
      const error = missingShape
        ? 'TMAP 지하철 경로에 지도 표시용 실제 형상 좌표가 부족합니다.'
        : missingDetails
          ? 'TMAP 지하철 경로의 노선·역·시간 정보가 부족합니다.'
          : '이 출발지와 목적지 사이에 지하철 경로가 없습니다.';
      return res.status(422).json({ error, shapeIssues: [...shapeIssues] });
    }
    routes.sort((a, b) => a.totalSeconds - b.totalSeconds);
    return res.status(200).json({ route: routes[0], coordinateMatch: true });
  } catch {
    return res.status(502).json({ error: controller.signal.aborted
      ? 'TMAP 응답 시간이 초과됐습니다. 다시 시도해 주세요.'
      : 'TMAP 대중교통 서비스에 연결하지 못했습니다.' });
  } finally {
    clearTimeout(timeout);
  }
};
