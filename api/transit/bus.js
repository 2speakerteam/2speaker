const TMAP_ROUTES_URL = 'https://apis.openapi.sk.com/transit/routes';
const { requestNextMorning } = require('../../lib/transit-scheduled');

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

function samePoint(a, b) {
  return Math.abs(a.lat - b.lat) < 0.00001 && Math.abs(a.lng - b.lng) < 0.00001;
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

function parseItinerary(itinerary) {
  const legs = itinerary?.legs;
  if (!Array.isArray(legs) || !legs.some((leg) => leg.mode === 'BUS')
    || !legs.every((leg) => leg.mode === 'WALK' || leg.mode === 'BUS')
    || legs.some((leg) => leg.mode === 'BUS' && Number(leg.service) === 0)) return null;

  const totalSeconds = Number(itinerary.totalTime);
  const transferCount = Number(itinerary.transferCount);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0
    || !Number.isInteger(transferCount) || transferCount < 0) return null;

  const transportLegs = [];
  const segments = [];
  const missingGeometryModes = new Set();
  const firstBusIndex = legs.findIndex((leg) => leg.mode === 'BUS');
  const lastBusIndex = legs.findLastIndex((leg) => leg.mode === 'BUS');
  let accessSeconds = 0;
  let accessDistance = 0;
  let arrivalSeconds = 0;
  let arrivalDistance = 0;

  for (const [index, leg] of legs.entries()) {
    if (leg.mode === 'BUS') {
      const seconds = Number(leg.sectionTime);
      const detail = {
        mode: 'BUS',
        route: text(leg.route || leg.Lane?.[0]?.route || leg.lane?.[0]?.route),
        board: text(leg.start?.name),
        boardPoint: point({ lat: leg.start?.lat, lng: leg.start?.lon }),
        alight: text(leg.end?.name),
        seconds
      };
      if (!detail.route || !detail.board || !detail.alight
        || !Number.isFinite(seconds) || seconds <= 0) return null;
      const coordinates = linePoints(leg.passShape?.linestring);
      if (!coordinates) return { incompleteBusGeometry: true };
      const color = /^[0-9a-fA-F]{6}$/.test(leg.routeColor || '')
        ? `#${leg.routeColor}` : '#f3a35e';
      transportLegs.push(detail);
      segments.push({ mode: 'BUS', route: detail.route, color, coordinates });
    } else {
      const seconds = Number(leg.sectionTime);
      const distance = Number(leg.distance);
      if (index < firstBusIndex) {
        if (Number.isFinite(seconds) && seconds >= 0) accessSeconds += seconds;
        if (Number.isFinite(distance) && distance >= 0) accessDistance += distance;
      } else if (index > lastBusIndex) {
        if (Number.isFinite(seconds) && seconds >= 0) arrivalSeconds += seconds;
        if (Number.isFinite(distance) && distance >= 0) arrivalDistance += distance;
      }
      if (distance > 0 && !Array.isArray(leg.steps)) missingGeometryModes.add('WALK');
      for (const step of Array.isArray(leg.steps) ? leg.steps : []) {
        const coordinates = linePoints(step.linestring);
        if (coordinates) segments.push({ mode: 'WALK', color: '#d4e9f1', coordinates });
        else missingGeometryModes.add('WALK');
      }
    }
  }

  return {
    totalSeconds,
    transferCount,
    transportLegs,
    transfers: transportLegs.slice(1).map((leg, index) => ({
      from: transportLegs[index].alight,
      to: leg.board
    })),
    accessWalk: accessSeconds > 0 && accessDistance > 0
      ? { station: transportLegs[0].board, seconds: accessSeconds, distanceMeters: accessDistance }
      : null,
    arrivalWalk: arrivalSeconds > 0 && arrivalDistance > 0
      ? { seconds: arrivalSeconds, distanceMeters: arrivalDistance } : null,
    segments,
    missingGeometryModes: [...missingGeometryModes]
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }
  if (req.body?.task === 'arrivals') {
    return require('../../lib/transit-arrivals').handleTransitArrivals(req, res, 'bus');
  }
  const start = point(req.body?.start);
  const end = point(req.body?.end);
  if (!start || !end || samePoint(start, end)) {
    return res.status(400).json({ error: '출발지와 목적지 좌표를 확인해 주세요.' });
  }
  const appKey = process.env.TMAP_TRANSIT_API_KEY?.trim();
  if (!appKey) return res.status(503).json({ error: 'TMAP 대중교통 인증 정보가 설정되지 않았습니다.' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
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
    const echoedStart = point({ lat: metadata.requestParameters?.startY, lng: metadata.requestParameters?.startX });
    const echoedEnd = point({ lat: metadata.requestParameters?.endY, lng: metadata.requestParameters?.endX });
    if (!echoedStart || !echoedEnd || !samePoint(start, echoedStart) || !samePoint(end, echoedEnd)) {
      return res.status(502).json({ error: 'TMAP 응답의 출발지·목적지 좌표가 요청과 일치하지 않습니다.' });
    }
    const itineraries = Array.isArray(metadata.plan?.itineraries) ? metadata.plan.itineraries : [];
    let incompleteBusGeometry = false;
    const routes = itineraries.flatMap((itinerary) => {
      const parsed = parseItinerary(itinerary);
      if (parsed?.incompleteBusGeometry) incompleteBusGeometry = true;
      return parsed && !parsed.incompleteBusGeometry ? [parsed] : [];
    });
    if (!routes.length) {
      const scheduled = await requestNextMorning(start, end, appKey, controller.signal);
      if (scheduled.response.ok) {
        const scheduledMetadata = scheduled.payload.metaData;
        const scheduledStart = point({ lat: scheduledMetadata?.requestParameters?.startY,
          lng: scheduledMetadata?.requestParameters?.startX });
        const scheduledEnd = point({ lat: scheduledMetadata?.requestParameters?.endY,
          lng: scheduledMetadata?.requestParameters?.endX });
        if (scheduledStart && scheduledEnd && samePoint(start, scheduledStart)
          && samePoint(end, scheduledEnd)) {
          const scheduledItineraries = Array.isArray(scheduledMetadata?.plan?.itineraries)
            ? scheduledMetadata.plan.itineraries : [];
          const scheduledRoutes = scheduledItineraries.map(parseItinerary).filter((route) =>
            route && !route.incompleteBusGeometry).sort((a, b) =>
            a.totalSeconds - b.totalSeconds || a.transferCount - b.transferCount);
          if (scheduledRoutes.length) {
            scheduledRoutes[0].departureBasis = scheduled.departure.label;
            return res.status(200).json({ route: scheduledRoutes[0], coordinateMatch: true });
          }
        }
      }
      const busOnlyItineraries = itineraries.filter((itinerary) =>
        Array.isArray(itinerary.legs) && itinerary.legs.some((leg) => leg.mode === 'BUS')
        && itinerary.legs.every((leg) => leg.mode === 'WALK' || leg.mode === 'BUS'));
      return res.status(422).json({
        error: incompleteBusGeometry
          ? 'TMAP 버스 경로에 지도 표시용 실제 형상 좌표가 부족합니다.'
          : busOnlyItineraries.length && busOnlyItineraries.every((itinerary) => itinerary.legs.some(
            (leg) => leg.mode === 'BUS' && Number(leg.service) === 0
          ))
            ? scheduled.response.ok
              ? '현재 버스 운행이 종료됐고 다음 오전 7시 기준으로도 이용 가능한 버스 경로를 확인하지 못했습니다.'
              : '현재 버스 운행이 종료됐고 다음 운행 시간 조회에도 실패했습니다.'
          : '이 출발지와 목적지 사이에 지하철 탑승이 없는 버스 경로가 없습니다.',
        scheduledStatus: scheduled.response.status,
        availablePathTypes: [...new Set(itineraries.map((itinerary) => Number(itinerary.pathType)))]
      });
    }
    routes.sort((a, b) => a.totalSeconds - b.totalSeconds || a.transferCount - b.transferCount);
    return res.status(200).json({ route: routes[0], coordinateMatch: true });
  } catch {
    return res.status(502).json({ error: controller.signal.aborted
      ? 'TMAP 응답 시간이 초과됐습니다. 다시 시도해 주세요.'
      : 'TMAP 대중교통 서비스에 연결하지 못했습니다.' });
  } finally {
    clearTimeout(timeout);
  }
};
