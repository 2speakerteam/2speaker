// Arrival data is separate from TMAP journey duration. No AI or estimated
// headway is used to manufacture a train/bus arrival or a taxi dispatch time.
const cache = new Map();
const text = value => typeof value === 'string' ? value.trim().slice(0, 100) : '';
const normal = value => text(value).replace(/<[^>]*>|\([^)]*\)|\s|[.·,]/g, '').replace(/^지하철\d+호선/, '').replace(/역$/, '');
const point = value => value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))
  && Number(value.lat) >= 33 && Number(value.lat) <= 39 && Number(value.lng) >= 124 && Number(value.lng) <= 132
  ? { lat: Number(value.lat), lng: Number(value.lng) } : null;
const unavailable = (status, message) => ({ status, message, arrivals: [], checkedAt: new Date().toISOString() });

function timestamp(value) {
  const match = String(value || '').match(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)/);
  return match ? Date.parse(`${match[1]}T${match[2]}+09:00`) : NaN;
}

async function cached(key, load) {
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.value;
  const value = await load();
  if (cache.size >= 128) cache.delete(cache.keys().next().value);
  if (value && (!Array.isArray(value) || value.length)) cache.set(key, { value, expires: Date.now() + 6 * 60 * 60 * 1000 });
  return value;
}

// Compare provider-verified stop/station coordinates against the ordered TMAP
// leg geometry. This distinguishes opposite platforms/curbside stops and loops.
function alongPath(target, path) {
  let progress = 0, best = { distance: Infinity, progress: Infinity };
  const factor = Math.cos(target.lat * Math.PI / 180);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const ax = (a.lng - target.lng) * 111320 * factor, ay = (a.lat - target.lat) * 111320;
    const bx = (b.lng - target.lng) * 111320 * factor, by = (b.lat - target.lat) * 111320;
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    const fraction = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (length * length))) : 0;
    const distance = Math.hypot(ax + fraction * dx, ay + fraction * dy);
    if (distance < best.distance) best = { distance, progress: progress + fraction * length };
    progress += length;
  }
  return best;
}

function meters(a, b) {
  return Math.hypot((a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180), (a.lat - b.lat) * 111320);
}

async function stationPlace(name, line) {
  return cached(`station:${name}:${line}`, async () => {
    const id = process.env.NAVER_API_HUB_CLIENT_ID?.trim(), secret = process.env.NAVER_API_HUB_API_KEY?.trim();
    if (!id || !secret) return null;
    const url = new URL('https://naverapihub.apigw.ntruss.com/search/v1/local');
    url.search = new URLSearchParams({ query: `${name.replace(/역$/, '')}역 ${line}`, display: '5', format: 'json' });
    const response = await fetch(url, { headers: { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret }, signal: AbortSignal.timeout(6500) });
    if (!response.ok) return null;
    const body = await response.json();
    const candidates = (Array.isArray(body.items) ? body.items : []).filter(item => {
      const title = String(item.title || '').replace(/<[^>]*>/g, '');
      return /지하철|전철/.test(item.category || '') && normal(title.replace(/\s*\d+호선$/, '')) === normal(name);
    }).map(item => {
      const lat = Number(item.mapy), lng = Number(item.mapx);
      return point({ lat: Math.abs(lat) > 90 ? lat / 1e7 : lat, lng: Math.abs(lng) > 180 ? lng / 1e7 : lng });
    }).filter(Boolean);
    return candidates.length === 1 ? candidates[0] : null;
  });
}

function subwayId(route) {
  const number = route.match(/(?:수도권|서울)?\s*([1-9])호선/);
  if (number) return String(1000 + Number(number[1]));
  return Object.entries({ 경의중앙: '1063', 공항철도: '1065', 경춘: '1067', 수인분당: '1075',
    신분당: '1077', 우이신설: '1092', 서해: '1093', 경강: '1081', 'GTX-A': '1032' })
    .find(([name]) => route.includes(name))?.[1] || '';
}

async function subwayArrival(input) {
  const key = process.env.SEOUL_SUBWAY_API_KEY?.trim();
  if (!key) return unavailable('not_configured', '실시간 도착정보 연동 대기');
  const line = subwayId(input.route);
  if (!line) return unavailable('unsupported', '해당 노선의 도착정보 미지원');
  const station = input.board.replace(/역$/, '');
  // This provider documents an HTTP-only service. It is called by the server;
  // the browser uses only our HTTPS API and never receives this URL or key.
  const url = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(key)}/json/realtimeStationArrival/0/100/${encodeURIComponent(station)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(6500) });
  if (!response.ok) return unavailable('error', '실시간 도착정보 확인 불가');
  const body = await response.json();
  const code = body.errorMessage?.code || body.RESULT?.CODE;
  if (code && !['INFO-000', 'INFO-200'].includes(code)) {
    return unavailable(/100|330/.test(code) ? 'auth_error' : 'error', '실시간 도착정보 확인 불가');
  }
  let rows = (Array.isArray(body.realtimeArrivalList) ? body.realtimeArrivalList : [])
    .filter(row => String(row.subwayId) === line && normal(row.statnNm) === normal(station));
  if (!rows.length) return unavailable('empty', '현재 도착정보 없음');
  const nextName = row => text(row.trainLineNm).split(/\s+-\s+/).at(-1).replace(/방면.*$/, '').trim();
  const directions = [...new Set(rows.map(nextName).filter(Boolean))];
  let direction = directions.find(name => normal(name) === normal(input.nextStation));
  if (!direction && directions.length) {
    const aligned = (await Promise.all(directions.map(async name => {
      if (normal(name) === normal(input.alight)) return { name, distance: 0, progress: 1 };
      const coordinate = await stationPlace(name, input.route);
      return coordinate ? { name, ...alongPath(coordinate, input.path) } : null;
    }))).filter(item => item && item.distance <= 150 && item.progress >= 1)
      .sort((a, b) => a.progress - b.progress);
    if (aligned.length === 1 || (aligned[1] && aligned[1].progress - aligned[0].progress > 200)) direction = aligned[0]?.name;
  }
  if (!direction) return unavailable('unmatched', '탑승 방면 도착정보 확인 불가');
  rows = rows.filter(row => nextName(row) === direction);
  const now = Date.now(), trains = new Set();
  const arrivals = rows.flatMap(row => {
    const received = timestamp(row.recptnDt), age = (now - received) / 1000;
    if (!Number.isFinite(age) || age < -30 || age > 120 || String(row.arvlCd) === '2') return [];
    const train = text(row.btrainNo);
    if (!train || trains.has(train)) return [];
    const seconds = String(row.barvlDt ?? '').trim() ? Number(row.barvlDt) - Math.max(0, age) : NaN;
    if ((!Number.isFinite(seconds) || seconds <= 0) && !['0', '1'].includes(String(row.arvlCd))) return [];
    trains.add(train);
    return [{ seconds: seconds > 0 ? Math.ceil(seconds) : null,
      message: seconds > 0 ? '' : String(row.arvlCd) === '1' ? '도착' : '진입 중',
      destination: text(row.bstatnNm), train }];
  }).sort((a, b) => (a.seconds || 0) - (b.seconds || 0)).slice(0, 2);
  return arrivals.length ? { status: 'ok', arrivals, direction: `${direction} 방면`, checkedAt: new Date(now).toISOString() }
    : unavailable('empty', '현재 유효한 도착정보 없음');
}

function xmlValue(xml, name) {
  const raw = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] || '';
  return raw.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
}

async function busXml(method, parameters, key) {
  const url = new URL(`http://ws.bus.go.kr/api/rest/${method}`);
  // Accept the portal's decoding key or its percent-encoded display form.
  let decoded = key; try { if (/%[\da-f]{2}/i.test(key)) decoded = decodeURIComponent(key); } catch { /* Leave invalid keys for provider validation. */ }
  url.search = new URLSearchParams({ serviceKey: decoded, ...parameters });
  const response = await fetch(url, { signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error('bus-provider');
  const xml = await response.text();
  if (xml.length > 1500000 || /<!DOCTYPE/i.test(xml) || xmlValue(xml, 'headerCd') !== '0') throw new Error('bus-provider');
  return Array.from(xml.matchAll(/<itemList>([\s\S]*?)<\/itemList>/g), match => match[1]);
}

async function busArrival(input) {
  const key = process.env.SEOUL_BUS_API_KEY?.trim();
  if (!key) return unavailable('not_configured', '실시간 도착정보 연동 대기');
  const number = input.route.split(':').at(-1).trim();
  const routeId = await cached(`bus-id:${number}`, async () => {
    const rows = await busXml('busRouteInfo/getBusRouteList', { strSrch: number }, key);
    const exact = rows.filter(row => xmlValue(row, 'busRouteNm') === number);
    return exact.length === 1 ? xmlValue(exact[0], 'busRouteId') : '';
  });
  if (!/^\d{9}$/.test(routeId)) return unavailable('unsupported', '해당 노선의 실시간 도착정보 미지원');
  const stops = await cached(`bus-stops:${routeId}`, async () => {
    const rows = await busXml('busRouteInfo/getStaionByRoute', { busRouteId: routeId }, key);
    return rows.map(row => ({ id: xmlValue(row, 'station'), name: xmlValue(row, 'stationNm'),
      order: Number(xmlValue(row, 'seq')), coordinate: point({ lat: xmlValue(row, 'gpsY'), lng: xmlValue(row, 'gpsX') }) }))
      .filter(row => row.coordinate && row.id && Number.isFinite(row.order)).sort((a, b) => a.order - b.order);
  });
  const candidates = stops.flatMap((stop, index) => {
    if (normal(stop.name) !== normal(input.board) || meters(stop.coordinate, input.boardPoint) > 80) return [];
    const next = stops[index + 1];
    if (!next) return [];
    const alignment = alongPath(next.coordinate, input.path);
    return alignment.distance <= 120 && alignment.progress > 20 ? [{ ...stop, alignment }] : [];
  }).sort((a, b) => a.alignment.progress - b.alignment.progress);
  if (!candidates.length || (candidates[1] && Math.abs(candidates[1].alignment.progress - candidates[0].alignment.progress) < 80)) {
    return unavailable('unmatched', '탑승 정류장·방향 도착정보 확인 불가');
  }
  const stop = candidates[0];
  const rows = await busXml('arrive/getArrInfoByRouteAll', { busRouteId: routeId }, key);
  const row = rows.find(item => xmlValue(item, 'stId') === stop.id && Number(xmlValue(item, 'staOrd')) === stop.order);
  if (!row) return unavailable('empty', '현재 도착정보 없음');
  const now = Date.now(), age = (now - timestamp(xmlValue(row, 'mkTm'))) / 1000;
  if (!Number.isFinite(age) || age < -30 || age > 120) return unavailable('empty', '최신 도착정보 확인 불가');
  const arrivals = [1, 2].flatMap(index => {
    const message = xmlValue(row, `arrmsg${index}`).replace(/\[[^\]]*\]/g, '').trim();
    const raw = xmlValue(row, `exps${index}`), seconds = raw ? Number(raw) - Math.max(0, age) : NaN;
    const vehicle = xmlValue(row, `vehId${index}`);
    if (!vehicle || /^0+$/.test(vehicle) || /종료|대기|없음|회차/.test(message)) return message ? [{ seconds: null, message }] : [];
    return Number.isFinite(seconds) && seconds > 0 ? [{ seconds: Math.ceil(seconds), message: '' }]
      : message ? [{ seconds: null, message }] : [];
  });
  return arrivals.length ? { status: 'ok', arrivals, direction: stop.name, checkedAt: new Date(now).toISOString() }
    : unavailable('empty', '현재 도착정보 없음');
}

async function handleTransitArrivals(req, res, mode) {
  const body = req.body || {};
  const input = { route: text(body.route), board: text(body.board), alight: text(body.alight),
    nextStation: text(body.nextStation), boardPoint: point(body.boardPoint),
    path: (Array.isArray(body.path) ? body.path.slice(0, 600) : []).map(pair =>
      Array.isArray(pair) ? point({ lat: pair[1], lng: pair[0] }) : null).filter(Boolean) };
  if (!input.route || !input.board || !input.alight || !input.boardPoint || input.path.length < 2) {
    return res.status(400).json(unavailable('unmatched', '노선·탑승 위치 확인 필요'));
  }
  if (body.departureBasis) return res.status(200).json(unavailable('scheduled', '예약 출발 경로 · 실시간 도착 미적용'));
  try {
    return res.status(200).json(await (mode === 'subway' ? subwayArrival(input) : busArrival(input)));
  } catch {
    // Provider errors can embed an authentication key in a URL; never return
    // the raw error or upstream payload to a browser or log.
    return res.status(200).json(unavailable('error', '실시간 도착정보 확인 불가'));
  }
}

module.exports = { handleTransitArrivals };
