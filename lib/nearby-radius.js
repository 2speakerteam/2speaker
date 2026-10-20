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
  const roadAddress = text((Array.isArray(road) ? road[0] : road)?.fullAddressRoad);
  return { id: text(String(item.id || '')), title, category, address, roadAddress, lat, lng, source: 'TMAP' };
}

async function searchRadiusPlaces(query, origin, { appKey, fetchImpl = fetch } = {}) {
  if (!appKey) {
    const error = new Error('현재 위치 반경 검색 인증 설정을 확인해 주세요.');
    error.statusCode = 503;
    throw error;
  }
  const category = categories[query];
  const signal = AbortSignal.timeout(11000);
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
    if (!info || !Number.isFinite(Number(info.totalCount))) {
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

module.exports = { radiusInput, poiPlace, searchRadiusPlaces };
