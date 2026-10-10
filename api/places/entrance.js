// Explicit pedestrian landmarks only. Never substitute a station/park centre for a requested exit.
const cache = new Map();
const compact = (value) => String(value || '').normalize('NFKC').replace(/\([^)]*\)/g, '').replace(/\d+호선/g, '').replace(/[\s·ㆍ.,'’()-]/g, '').toLowerCase();
function descriptor(query) {
  const name = compact(query);
  const exit = name.match(/^(.+역)(\d{1,2}(?:-\d)?)번출구$/);
  if (exit) return { kind: 'station-exit', base: exit[1], number: exit[2], name };
  if (/(?:정문|후문|동문|서문|남문|북문|입구)$/.test(name)) return { kind: 'gate', name };
  return null;
}
function matches(query, name) {
  const want = descriptor(query), got = descriptor(name);
  if (!want || !got || want.kind !== got.kind) return false;
  if (want.kind === 'station-exit') return want.base === got.base && want.number === got.number;
  return got.name === want.name || got.name === '서울' + want.name || want.name === '서울' + got.name;
}
function point(lat, lon) {
  const latitude = Number(lat), longitude = Number(lon);
  return latitude >= 33 && latitude <= 40 && longitude >= 124 && longitude <= 133 ? { latitude, longitude } : null;
}
function distance(a, b) {
  return Math.hypot((a.longitude - b.longitude) * Math.cos(a.latitude * Math.PI / 180), a.latitude - b.latitude) * 111320;
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'GET only' }); }
  const query = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  const automatic = !descriptor(query) && /(?:역|공원)$/.test(compact(query));
  if (query.length < 2 || query.length > 120 || (!descriptor(query) && !automatic)) return res.status(400).json({ error: '역·공원 또는 출입구 이름을 지정해 주세요.' });
  const key = compact(query), cached = cache.get(key);
  if (cached && Date.now() - cached.time < 6 * 60 * 60 * 1000) return res.status(200).json(cached.value);
  const appKey = process.env.TMAP_CAR_API_KEY || process.env.TMAP_TRANSIT_API_KEY;
  if (!appKey) return res.status(503).json({ error: '장소 검색을 사용할 수 없어요.' });
  try {
    const station = automatic && /역$/.test(compact(query));
    const queries = !automatic ? [query] : station ? [query + ' 출구'] : [query + ' 정문', query + ' 후문', query + ' 입구'];
    const responses = await Promise.all(queries.map(async searchKeyword => {
      const url = new URL('https://apis.openapi.sk.com/tmap/pois');
      url.search = new URLSearchParams({ version: '1', searchKeyword, searchType: 'all', searchtypCd: 'A',
        page: '1', count: '100', reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', multiPoint: 'N', poiGroupYn: 'N' });
      const response = await fetch(url, { headers: { accept: 'application/json', appKey }, signal: AbortSignal.timeout(6500) });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.searchPoiInfo?.pois?.poi) ? data.searchPoiInfo.pois.poi : [];
    }));
    const pois = responses.flat();
    const candidates = pois.filter(poi => {
      if (!automatic) return matches(query, poi.name);
      const got = descriptor(poi.name);
      if (station) return got?.kind === 'station-exit' && got.base === compact(query);
      // Only exterior park gates, not zoo/playground/toilet entrances inside the park.
      return ['정문','후문','동문','서문','남문','북문','입구'].some(gate => matches(query + gate, poi.name));
    }).map(poi => {
      // For a named EXIT/GATE POI, its centre is the landmark itself. A vehicle front point may be on another road.
      const location = point(poi.noorLat, poi.noorLon) || point(poi.pnsLat, poi.pnsLon) || point(poi.frontLat, poi.frontLon);
      return location && { ...location, name: String(poi.name).slice(0, 120), kind: descriptor(poi.name).kind, source: 'TMAP POI', matched: true };
    }).filter(Boolean).filter((candidate,i,all) => !all.slice(0,i).some(prior => compact(prior.name) === compact(candidate.name) && distance(prior,candidate)<10));
    if (!candidates.length) return res.status(404).json({ error: '번호와 이름이 일치하는 출입구 위치를 찾지 못했어요.' });
    if (candidates.some(candidate => distance(candidate, candidates[0]) > (automatic ? 4000 : 80))) return res.status(409).json({ error: '같은 이름의 출입구가 여러 곳이에요. 지역명을 함께 입력해 주세요.' });
    const value = automatic ? { candidates } : candidates[0];
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, { time: Date.now(), value });
    return res.status(200).json(value);
  } catch { return res.status(502).json({ error: '출입구 위치 검색에 연결하지 못했어요.' }); }
};
