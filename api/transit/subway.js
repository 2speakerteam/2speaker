const TMAP_ROUTES_URL = 'https://apis.openapi.sk.com/transit/routes';
const TMAP_WALK_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
const NAVER_PLACE_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/local';

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

function distanceMeters(a, b) {
  const latRadians = Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * latRadians;
  const deltaLng = (b.lng - a.lng) * latRadians;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(a.lat * latRadians) * Math.cos(b.lat * latRadians) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function naverCoordinate(value, limit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return coordinate(Math.abs(number) <= limit ? number : number / 10000000, limit);
}

function subwayItineraries(itineraries) {
  return itineraries.filter((itinerary) => Array.isArray(itinerary.legs)
    && itinerary.legs.some((leg) => leg.mode === 'SUBWAY')
    && itinerary.legs.every((leg) => leg.mode === 'WALK' || leg.mode === 'SUBWAY'));
}

function validRoutes(itineraries) {
  return subwayItineraries(itineraries).map(parseItinerary).filter((route) =>
    route && !route.incompleteShape && !route.incompleteDetails).sort((a, b) =>
    a.priorityScore - b.priorityScore || a.totalSeconds - b.totalSeconds);
}

async function findNearbyStations(itineraries, start, signal) {
  const clientId = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_API_HUB_API_KEY?.trim();
  if (!clientId || !clientSecret) return [];
  const names = [...new Set(itineraries.flatMap((itinerary) => {
    const firstSubway = itinerary.legs?.find((leg) => leg.mode === 'SUBWAY');
    const name = text(firstSubway?.start?.name).replace(/역$/, '');
    return name && name.length <= 30 ? [{ name, location: point({
      lat: firstSubway.start.lat, lng: firstSubway.start.lon
    }) }] : [];
  }).filter((candidate) => candidate.location
    && distanceMeters(start, candidate.location) <= 2500).map((candidate) => candidate.name))].slice(0, 3);
  const candidates = [];
  for (const name of names) {
    const reference = itineraries.map((itinerary) => itinerary.legs?.find((leg) =>
      leg.mode === 'SUBWAY' && text(leg.start?.name).replace(/역$/, '') === name
    )).find(Boolean);
    const stationPoint = point({ lat: reference?.start?.lat, lng: reference?.start?.lon });
    if (!stationPoint) continue;
    const endpoint = new URL(NAVER_PLACE_URL);
    endpoint.searchParams.set('query', `${name}역`);
    endpoint.searchParams.set('display', '5');
    endpoint.searchParams.set('start', '1');
    endpoint.searchParams.set('sort', 'random');
    endpoint.searchParams.set('format', 'json');
    const response = await fetch(endpoint, { headers: {
      'X-NCP-APIGW-API-KEY-ID': clientId,
      'X-NCP-APIGW-API-KEY': clientSecret,
      Accept: 'application/json'
    }, signal });
    if (!response.ok) continue;
    const payload = await response.json().catch(() => ({}));
    for (const item of Array.isArray(payload.items) ? payload.items : []) {
      const title = text(item.title).replace(/<[^>]*>/g, '');
      const lat = naverCoordinate(item.mapy, 90);
      const lng = naverCoordinate(item.mapx, 180);
      if (!title.startsWith(`${name}역`) || !String(item.category).includes('지하철,전철')
        || lat === null || lng === null) continue;
      const location = { lat, lng };
      if (distanceMeters(location, stationPoint) > 300 || distanceMeters(location, start) > 2500) continue;
      candidates.push({ title, location, distance: distanceMeters(start, location) });
    }
  }
  return candidates.sort((a, b) => a.distance - b.distance).slice(0, 3);
}

async function pedestrianAccess(start, station, appKey, signal) {
  const response = await fetch(TMAP_WALK_URL, {
    method: 'POST',
    headers: { appKey, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startX: start.lng, startY: start.lat, endX: station.location.lng, endY: station.location.lat,
      startName: encodeURIComponent('현재 위치'), endName: encodeURIComponent(station.title),
      reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: '0', sort: 'index'
    }),
    signal
  });
  if (!response.ok) return { error: response.status === 401 || response.status === 403
    ? 'TMAP 보행 경로 API 이용 권한을 확인해야 합니다.' : 'TMAP에서 지하철역까지 도보 경로를 확인하지 못했습니다.' };
  const payload = await response.json().catch(() => ({}));
  const features = Array.isArray(payload.features) ? payload.features : [];
  const startFeature = features.find((feature) => feature.properties?.pointType === 'SP');
  const seconds = Number(startFeature?.properties?.totalTime);
  const distance = Number(startFeature?.properties?.totalDistance);
  const segments = features.filter((feature) => feature.geometry?.type === 'LineString').map((feature) => {
    const coordinates = feature.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every((pair) =>
      Array.isArray(pair) && pair.length === 2 && coordinate(pair[0], 180) !== null
      && coordinate(pair[1], 90) !== null)) return null;
    return { mode: 'WALK', color: '#d4e9f1', coordinates };
  });
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(distance) || distance <= 0
    || distance > 5000 || !segments.length || segments.some((segment) => !segment)) {
    return { error: 'TMAP 도보 접근 경로의 시간·거리·좌표가 부족합니다.' };
  }
  const first = segments[0].coordinates[0];
  const last = segments[segments.length - 1].coordinates.at(-1);
  if (distanceMeters(start, { lat: first[1], lng: first[0] }) > 150
    || distanceMeters(station.location, { lat: last[1], lng: last[0] }) > 150) {
    return { error: 'TMAP 도보 경로의 출발지 또는 지하철역 좌표가 일치하지 않습니다.' };
  }
  return { seconds, distance, segments };
}

async function stationSubwayRoute(station, end, appKey, signal) {
  const response = await fetch(TMAP_ROUTES_URL, {
    method: 'POST',
    headers: { appKey, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startX: String(station.location.lng), startY: String(station.location.lat),
      endX: String(end.lng), endY: String(end.lat), count: 10, lang: 0, format: 'json'
    }),
    signal
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  if (!matchRequestEcho(payload.metaData?.requestParameters, station.location, end)) return null;
  const itineraries = Array.isArray(payload.metaData?.plan?.itineraries)
    ? payload.metaData.plan.itineraries : [];
  const stationName = station.title.replace(/역(?:\s.*)?$/, '');
  return validRoutes(itineraries).find((route) =>
    route.subwayLegs[0]?.board?.replace(/역$/, '') === stationName) || null;
}

function parseItinerary(itinerary) {
  if (!itinerary || !Array.isArray(itinerary.legs) || itinerary.legs.length === 0) return null;
  const legs = itinerary.legs;
  if (!legs.some((leg) => leg.mode === 'SUBWAY')) return null;
  if (!legs.every((leg) => ['WALK', 'BUS', 'SUBWAY'].includes(leg.mode))) return null;
  if (legs.some((leg) => leg.mode !== 'WALK' && Number(leg.service) === 0)) return null;

  const subwayLegs = [];
  const transportLegs = [];
  const segments = [];
  const missingGeometryModes = new Set();
  let subwaySeconds = 0;
  let busSeconds = 0;
  for (const leg of legs) {
    if (leg.mode === 'SUBWAY' || leg.mode === 'BUS') {
      const coordinates = linePoints(leg.passShape?.linestring);
      if (!coordinates && leg.mode === 'SUBWAY') return { incompleteShape: 'subway' };
      if (!coordinates) missingGeometryModes.add('BUS');
      const stations = Array.isArray(leg.passStopList?.stationList)
        ? leg.passStopList.stationList.map((station) => text(station.stationName)).filter(Boolean)
        : [];
      const seconds = leg.sectionTime === null || leg.sectionTime === undefined
        ? NaN : Number(leg.sectionTime);
      const detail = {
        mode: leg.mode,
        route: text(leg.route || leg.Lane?.[0]?.route || leg.lane?.[0]?.route),
        board: text(leg.start?.name),
        alight: text(leg.end?.name),
        seconds,
        stations
      };
      if (!detail.route || !detail.board || !detail.alight || !Number.isFinite(seconds) || seconds < 0) {
        return { incompleteDetails: true };
      }
      transportLegs.push(detail);
      if (leg.mode === 'SUBWAY') {
        subwayLegs.push(detail);
        subwaySeconds += seconds;
      } else busSeconds += seconds;
      const routeColor = /^[0-9a-fA-F]{6}$/.test(leg.routeColor || '')
        ? `#${leg.routeColor}` : leg.mode === 'BUS' ? '#f3a35e' : '#20c8e7';
      if (coordinates) segments.push({ mode: leg.mode, route: detail.route, color: routeColor, coordinates });
    } else if (Number(leg.distance) > 0) {
      if (!Array.isArray(leg.steps) || leg.steps.length === 0) {
        missingGeometryModes.add('WALK');
        continue;
      }
      for (const step of leg.steps) {
        const coordinates = linePoints(step.linestring);
        if (!coordinates) {
          missingGeometryModes.add('WALK');
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
  if (subwaySeconds <= 0) return { incompleteDetails: true };
  const firstSubwayIndex = legs.findIndex((leg) => leg.mode === 'SUBWAY');
  const approachLegs = legs.slice(0, firstSubwayIndex).filter((leg) => leg.mode === 'WALK');
  const approachSeconds = approachLegs.reduce((sum, leg) => sum + Number(leg.sectionTime), 0);
  const approachDistance = approachLegs.reduce((sum, leg) => sum + Number(leg.distance), 0);
  const accessWalk = approachLegs.length && Number.isFinite(approachSeconds)
    && Number.isFinite(approachDistance) && approachSeconds > 0 && approachDistance > 0
    ? { station: subwayLegs[0].board, seconds: approachSeconds, distanceMeters: approachDistance }
    : null;
  const transfers = transportLegs.slice(1).map((leg, index) => ({
    from: transportLegs[index].alight,
    to: leg.board
  }));
  const busBoardings = transportLegs.filter((leg) => leg.mode === 'BUS').length;
  const busTransfers = Math.max(0, busBoardings - 1);
  const subwayShare = subwaySeconds / (subwaySeconds + busSeconds);
  // Compare time in minutes, favoring more subway travel and fewer bus boardings/transfers.
  const priorityScore = totalSeconds / 60 - subwayShare * 40 + busBoardings * 8 + busTransfers * 5;
  return {
    totalSeconds, transferCount, subwayLegs, transportLegs, transfers, segments,
    missingGeometryModes: [...missingGeometryModes], accessWalk,
    subwayShare, busBoardings, busTransfers, priorityScore
  };
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
    if (!matchRequestEcho(metadata?.requestParameters, start, end)) {
      return res.status(502).json({ error: 'TMAP 응답의 출발지·목적지 좌표가 요청과 일치하지 않습니다.' });
    }
    const itineraries = Array.isArray(metadata?.plan?.itineraries) ? metadata.plan.itineraries : [];
    let missingShape = false;
    let missingDetails = false;
    const shapeIssues = new Set();
    const subwayItineraries = itineraries.filter((itinerary) =>
      itinerary.legs?.some((leg) => leg.mode === 'SUBWAY')
      && itinerary.legs.every((leg) => leg.mode === 'WALK' || leg.mode === 'SUBWAY'));
    const routes = subwayItineraries.flatMap((itinerary) => {
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
      let fallbackError = '';
      const stations = await findNearbyStations(itineraries, start, controller.signal);
      for (const station of stations) {
        try {
          const [walk, stationRoute] = await Promise.all([
            pedestrianAccess(start, station, appKey, controller.signal),
            stationSubwayRoute(station, end, appKey, controller.signal)
          ]);
          if (walk.error) {
            fallbackError = walk.error;
            continue;
          }
          if (!stationRoute) {
            fallbackError = '확인된 역에서 목적지까지 버스 없는 지하철 경로를 찾지 못했습니다.';
            continue;
          }
          const innerWalk = stationRoute.accessWalk;
          stationRoute.accessWalk = {
            station: station.title,
            seconds: walk.seconds + (innerWalk?.seconds || 0),
            distanceMeters: walk.distance + (innerWalk?.distanceMeters || 0)
          };
          stationRoute.totalSeconds += walk.seconds;
          stationRoute.segments = [...walk.segments, ...stationRoute.segments];
          return res.status(200).json({ route: stationRoute, coordinateMatch: true });
        } catch {
          if (controller.signal.aborted) throw new Error('timeout');
          fallbackError = '지하철역 도보 접근 또는 지하철 경로 조회에 실패했습니다.';
        }
      }
      if (!stations.length) fallbackError = '네이버에서 현재 위치 근처의 실제 지하철역을 확인하지 못했습니다.';
      if (fallbackError) return res.status(422).json({ error: fallbackError });
    }
    if (!routes.length) {
      const error = missingShape
        ? 'TMAP 지하철 경로에 지도 표시용 실제 형상 좌표가 부족합니다.'
        : missingDetails
          ? 'TMAP 지하철 경로의 노선·역·시간 정보가 부족합니다.'
          : subwayItineraries.length && subwayItineraries.every((itinerary) => itinerary.legs.some(
            (leg) => leg.mode === 'SUBWAY' && Number(leg.service) === 0
          ))
            ? 'TMAP이 반환한 지하철 구간의 운행이 종료됐습니다.'
            : '이 출발지와 목적지 사이에 버스 탑승이 없는 지하철 경로가 없습니다.';
      return res.status(422).json({ error, shapeIssues: [...shapeIssues],
        availablePathTypes: [...new Set(itineraries.map((itinerary) => Number(itinerary.pathType)))] });
    }
    routes.sort((a, b) => a.priorityScore - b.priorityScore
      || b.subwayShare - a.subwayShare
      || a.busTransfers - b.busTransfers
      || a.totalSeconds - b.totalSeconds);
    return res.status(200).json({ route: routes[0], coordinateMatch: true });
  } catch {
    return res.status(502).json({ error: controller.signal.aborted
      ? 'TMAP 응답 시간이 초과됐습니다. 다시 시도해 주세요.'
      : 'TMAP 대중교통 서비스에 연결하지 못했습니다.' });
  } finally {
    clearTimeout(timeout);
  }
};
