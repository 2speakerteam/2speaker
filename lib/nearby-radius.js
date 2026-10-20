const { distanceMeters } = require('./nearby-places');

const categories = {
  미용실: '미용실', 헤어샵: '미용실', 헤어숍: '미용실',
  편의점: '편의점', 약국: '약국', 카페: '카페', 커피: '커피',
  식당: '음식', 음식점: '음식', 화장실: '화장실',
  병원: '병원', 은행: '은행', ATM: 'ATM', 마트: '마트'
};

function radiusInput(value) {
  if (!value || typeof value !== 'object') return null;
  const { lat, lng, accuracy, timestamp } = value;
  if (![lat, lng, accuracy, timestamp].every(Number.isFinite)
    || Math.abs(lat) > 90 || Math.abs(lng) > 180
    || accuracy < 0 || accuracy > 2000
    || Math.abs(Date.now() - timestamp) > 120000) return null;
  return { lat, lng, accuracy, timestamp };
}

function coordinate(value, limit) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && Math.abs(result) <= limit ? result : null;
}

function text(value) {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim().slice(0, 200) : '';
}

function poiPlace(item) {
  const title = text(item?.name);
  // Use the POI location consistently, not whichever entrance looks closest.
  let lat = coordinate(item?.noorLat, 90), lng = coordinate(item?.noorLon, 180);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    lat = coordinate(item?.frontLat, 90);
    lng = coordinate(item?.frontLon, 180);
  }
  if (!title || lat === null || lng === null || (lat === 0 && lng === 0)) return null;
  const category = ['upperBizName', 'middleBizName', 'lowerBizName', 'detailBizName']
    .map(key => text(item[key])).filter(Boolean).join('>');
  const lot = [text(item.firstNo), text(item.secondNo)].filter(v => v && v !== '0').join('-');
  const address = ['upperAddrName', 'middleAddrName', 'lowerAddrName', 'detailAddrName']
    .map(key => text(item[key])).filter(Boolean).concat(lot ? [lot] : []).join(' ');
  const road = item.newAddressList?.newAddress;
  const building = [text(item.buildingNo1), text(item.buildingNo2)].filter(v => v && v !== '0').join('-');
  const roadAddress = text((Array.isArray(road) ? road[0] : road)?.fullAddressRoad)
    || (text(item.roadName) && building
      ? [text(item.upperAddrName), text(item.middleAddrName), text(item.roadName), building].filter(Boolean).join(' ') : '');
  return { id: text(String(item.id || '')), title, category, address, roadAddress, lat, lng, source: 'TMAP' };
}

async function searchRadiusPlaces(query, origin, { appKey, fetchImpl = fetch, signal: deadline } = {}) {
  if (!appKey) {
    const error = new Error('현재 위치 반경 검색 인증 설정을 확인해 주세요.');
    error.statusCode = 503;
    throw error;
  }
  const category = categories[query];
  const signal = deadline ? AbortSignal.any([deadline, AbortSignal.timeout(11000)]) : AbortSignal.timeout(11000);
  const search = async radiusKm => {
    const url = new URL(category
      ? 'https://apis.openapi.sk.com/tmap/pois/search/around'
      : 'https://apis.openapi.sk.com/tmap/pois');
    const params = {
      version: '1', centerLon: String(origin.lng), centerLat: String(origin.lat),
      radius: String(radiusKm), page: '1', count: '200',
      reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
      ...(category ? { categories: category, sort: 'distance' }
        : { searchKeyword: query, searchType: 'all', searchtypCd: 'R' })
    };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetchImpl(url, { headers: { appKey, Accept: 'application/json' }, signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403
        ? '주변 장소 검색 API 이용 권한을 확인해 주세요.'
        : response.status === 429 ? '주변 장소 검색 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
          : '현재 위치 주변 장소를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      error.statusCode = response.status === 401 || response.status === 403 ? 503 : 502;
      throw error;
    }
    const info = payload?.searchPoiInfo;
    if (!info || info.totalCount === null || info.totalCount === ''
      || !Number.isFinite(Number(info.totalCount)) || Number(info.totalCount) < 0) {
      throw new Error('주변 장소 검색 응답을 확인하지 못했습니다.');
    }
    const rows = info.pois?.poi;
    if (Number(info.totalCount) > 0 && !rows) throw new Error('주변 장소 목록을 확인하지 못했습니다.');
    const unique = new Map();
    for (const row of Array.isArray(rows) ? rows : rows ? [rows] : []) {
      const place = poiPlace(row);
      if (!place) continue;
      const distance = distanceMeters(origin, place);
      if (distance > radiusKm * 1000) continue;
      // Category endpoint filters by business type, not spelling in the brand.
      const key = place.id || `${place.title}:${place.lat}:${place.lng}`;
      if (!unique.has(key)) unique.set(key, { ...place, distanceMeters: Math.round(distance) });
    }
    return {
      places: [...unique.values()].sort((a, b) => a.distanceMeters - b.distanceMeters),
      nearby: true, distanceBasis: 'straight-line', radiusMeters: radiusKm * 1000,
      coverage: 'coordinate-radius', source: 'TMAP',
      providerLimitReached: Number(info.totalCount) >= 200
    };
  };
  // Start locally. Expand only when no usable POI was returned, never to pad a list.
  const result = await search(1);
  return result.places.length ? result : search(3);
}

const categoryPatterns = {
  미용실: /미용실|헤어/, 편의점: /편의점/, 약국: /약국/,
  카페: /카페|커피/, 커피: /카페|커피/, 음식: /음식점|식당/,
  화장실: /화장실/, 병원: /병원|의원/, 은행: /은행/, ATM: /ATM|현금/,
  마트: /마트|슈퍼/
};
const normalizedName = value => String(value || '').toLowerCase().replace(/[\s,·._()\-]/g, '');
const hairName = value => normalizedName(value).replace(/(?:미용실|샵|숍)$/, '');

function corroboratedPlace(candidate, items, query) {
  const type = categories[query];
  const pattern = categoryPatterns[type];
  const valid = items.filter(place => {
    if (![place.lat, place.lng].every(Number.isFinite) || Math.abs(place.lat) > 90
      || Math.abs(place.lng) > 180 || distanceMeters(candidate, place) > 75) return false;
    if (pattern && !pattern.test(place.category || '')) return false;
    const sameName = normalizedName(place.title) === normalizedName(candidate.title);
    // A provider may append "미용실"/"샵"; still require close coordinates.
    const sameHairName = type === '미용실' && hairName(place.title).length >= 2
      && hairName(place.title) === hairName(candidate.title)
      && distanceMeters(candidate, place) <= 30;
    return sameName || sameHairName;
  });
  // An ambiguous branch match is not evidence for a particular business.
  if (valid.length !== 1) return null;
  return { ...valid[0], source: 'NAVER+TMAP', sourceId: candidate.id,
    verification: 'name-category-coordinate' };
}

async function corroborateNearby(result, query, origin, search) {
  // Bounded cross-check: do not make hundreds of requests or fill missing slots
  // with distant/unchecked businesses merely to increase the displayed count.
  const candidates = result.places.slice(0, 20);
  const places = [], failed = [];
  for (let i = 0; i < candidates.length; i += 5) {
    const batch = candidates.slice(i, i + 5);
    const checked = await Promise.allSettled(batch.map(async candidate => {
      const area = candidate.address.split(' ').slice(0, 3).join(' ');
      const items = await search(`${area} ${candidate.title}`);
      return corroboratedPlace(candidate, items, query);
    }));
    checked.forEach(item => {
      if (item.status === 'rejected') failed.push(item.reason);
      else if (item.value) {
        const distance = distanceMeters(origin, item.value);
        if (distance <= result.radiusMeters) places.push({ ...item.value, distanceMeters: Math.round(distance) });
      }
    });
  }
  if (candidates.length && failed.length === candidates.length) throw failed[0];
  const unique = new Map();
  for (const place of places) {
    unique.set(`${normalizedName(place.title)}:${place.lat}:${place.lng}`, place);
  }
  return { ...result, places: [...unique.values()].sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 15),
    source: 'NAVER+TMAP', verification: 'name-category-coordinate',
    examinedCount: candidates.length, partial: failed.length > 0,
    coverage: 'corroborated-radius-candidates' };
}

module.exports = { radiusInput, poiPlace, searchRadiusPlaces, corroboratedPlace, corroborateNearby };
