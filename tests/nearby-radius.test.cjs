const test = require('node:test');
const assert = require('node:assert/strict');
const { radiusInput, poiPlace, searchRadiusPlaces, corroboratedPlace, corroborateNearby } = require('../lib/nearby-radius');
const origin = () => ({ lat: 37.588, lng: 127.096, accuracy: 10, timestamp: Date.now() });
const row = (id, name, lat = 37.5881, extra = {}) => ({
  id, name, noorLat: String(lat), noorLon: '127.096',
  upperBizName: '생활편의', lowerBizName: '미용실', ...extra
});
const response = rows => ({ ok: true, json: async () => ({
  searchPoiInfo: { totalCount: String(rows.length), pois: { poi: rows } }
}) });

test('coordinate lookup requires fresh valid GPS, not district names', () => {
  assert.ok(radiusInput(origin()));
  for (const item of [null, { ...origin(), lat: null }, { ...origin(), lng: 181 },
    { ...origin(), timestamp: 0 }, { ...origin(), accuracy: 2001 }]) assert.equal(radiusInput(item), null);
});

test('POI coordinates reject empty/zero values and retain provider addresses', () => {
  assert.equal(poiPlace(row('a', '', 37)), null);
  assert.equal(poiPlace(row('a', 'A', 0, { noorLon: '0' })), null);
  assert.equal(poiPlace(row('a', 'A', 37, { noorLat: '', noorLon: '' })), null);
  const place = poiPlace(row('a', 'A', 37, {
    upperAddrName: '서울', middleAddrName: '중랑구', lowerAddrName: '면목동',
    firstNo: '20', secondNo: '51', newAddressList: { newAddress: [{ fullAddressRoad: '서울 중랑구 용마산로 409' }] }
  }));
  assert.equal(place.address, '서울 중랑구 면목동 20-51');
  assert.equal(place.roadAddress, '서울 중랑구 용마산로 409');
});

for (const query of ['미용실', '편의점', '약국']) {
  test(`${query}: sends GPS and category to provider, sorts actual coordinates without name matching`, async () => {
    const calls = [];
    const result = await searchRadiusPlaces(query, origin(), {
      appKey: 'fixture', fetchImpl: async (url, options) => {
        calls.push(url);
        assert.equal(options.headers.appKey, 'fixture');
        return response([row('far', '먼 업체', 37.589), row('near', '이유', 37.58801),
          row('near', '이유', 37.58801), row('outside', '범위 밖', 38)]);
      }
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].pathname, '/tmap/pois/search/around');
    assert.equal(calls[0].searchParams.get('categories'), query);
    assert.equal(calls[0].searchParams.get('centerLat'), String(origin().lat));
    assert.equal(calls[0].searchParams.get('centerLon'), String(origin().lng));
    assert.equal(calls[0].searchParams.get('sort'), 'distance');
    assert.equal(calls[0].searchParams.get('radius'), '1');
    assert.equal(calls[0].searchParams.get('count'), '200');
    assert.deepEqual(result.places.map(p => p.title), ['이유', '먼 업체']);
    assert.equal(result.places[0].distanceMeters, 1);
    assert.equal(result.coverage, 'coordinate-radius');
  });
}

test('unknown category uses coordinate-constrained keyword lookup', async () => {
  const result = await searchRadiusPlaces('세탁소', origin(), {
    appKey: 'fixture', fetchImpl: async url => {
      assert.equal(url.pathname, '/tmap/pois');
      assert.equal(url.searchParams.get('searchtypCd'), 'R');
      assert.equal(url.searchParams.get('searchKeyword'), '세탁소');
      return response([row('a', '깨끗한집')]);
    }
  });
  assert.equal(result.places.length, 1);
});

test('only an empty local result expands to 3km, errors never become nationwide fallback', async () => {
  const radii = [];
  await searchRadiusPlaces('약국', origin(), { appKey: 'fixture', fetchImpl: async url => {
    radii.push(url.searchParams.get('radius'));
    return response([]);
  } });
  assert.deepEqual(radii, ['1', '3']);
  let calls = 0;
  await assert.rejects(searchRadiusPlaces('약국', origin(), { appKey: 'fixture', fetchImpl: async () => {
    calls++;
    return { ok: false, status: 403, json: async () => ({}) };
  } }), /권한/);
  assert.equal(calls, 1);
});

test('malformed responses and missing authentication are explicit failures', async () => {
  await assert.rejects(searchRadiusPlaces('약국', origin(), {}), /인증/);
  await assert.rejects(searchRadiusPlaces('약국', origin(), { appKey: 'fixture',
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  }), /응답/);
});

test('cross-check requires the same business, category and nearby coordinates, not an industry word in its name', () => {
  const candidate = { id: 'a', title: '살롱이유', lat: 37.588, lng: 127.096 };
  const good = { ...candidate, category: '미용>미용실', roadAddress: '검증된 주소' };
  assert.equal(corroboratedPlace(candidate, [good], '미용실').roadAddress, '검증된 주소');
  for (const items of [
    [], [{ ...good, title: '다른 미용실' }], [{ ...good, category: '교육>학원' }],
    [{ ...good, lat: 38 }], [{ ...good, lat: null }], [good, { ...good }]
  ]) assert.equal(corroboratedPlace(candidate, items, '미용실'), null);
});

test('narrow salon suffix aliases need matching close coordinates', () => {
  const candidate = { title: '뭉크', lat: 37.588, lng: 127.096 };
  const other = { ...candidate, title: '뭉크미용실', category: '미용>미용실' };
  assert.ok(corroboratedPlace(candidate, [other], '미용실'));
  assert.equal(corroboratedPlace(candidate, [{ ...other, lat: 37.5884 }], '미용실'), null);
  assert.equal(corroboratedPlace({ ...candidate, title: '봄' }, [{ ...other, title: '봄미용실' }], '미용실'), null);
});

test('cross-check uses returned coordinates for distance and does not pad unconfirmed candidates', async () => {
  const p = origin();
  const candidates = [
    { id: 'a', title: '살롱이유', address: '서울 중랑구 면목동 1', lat: p.lat + 0.0001, lng: p.lng },
    { id: 'b', title: '확인안됨', address: '서울 중랑구 면목동 2', lat: p.lat + 0.0002, lng: p.lng }
  ];
  const queries = [];
  const result = await corroborateNearby({ places: candidates, radiusMeters: 1000 }, '미용실', p, async term => {
    queries.push(term);
    return term.includes('살롱이유') ? [{ ...candidates[0], lat: p.lat, category: '미용실' }] : [];
  });
  assert.equal(result.places.length, 1);
  assert.equal(result.places[0].distanceMeters, 0);
  assert.equal(result.coverage, 'corroborated-radius-candidates');
  assert.deepEqual(queries, ['서울 중랑구 면목동 살롱이유', '서울 중랑구 면목동 확인안됨']);
});

test('cross-check preserves partial successes; all request failures remain failures', async () => {
  const p = origin();
  const candidates = [{ ...p, title: 'A', address: '서울 중랑구 면목동' }, { ...p, title: 'B', address: '서울 중랑구 면목동' }];
  const data = { places: candidates, radiusMeters: 1000 };
  const result = await corroborateNearby(data, '약국', p, async term => {
    if (term.endsWith('B')) throw Error('provider failed');
    return [{ ...candidates[0], category: '약국' }];
  });
  assert.equal(result.partial, true);
  assert.equal(result.places.length, 1);
  await assert.rejects(corroborateNearby(data, '약국', p, async () => { throw Error('provider failed'); }), /provider failed/);
});
