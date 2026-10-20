const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { nearbyInput, nearbyPlaces, distanceMeters } = require('../lib/nearby-places');
const origin = () => ({ lat: 37.58, lng: 127.08, accuracy: 15, timestamp: Date.now(), areas: ['서울특별시 중랑구 면목동', '서울특별시 중랑구 면목제3.8동'] });
const place = (title, category, lat = 37.581, lng = 127.08) => ({ title, category, lat, lng });
const source = fs.readFileSync(path.join(__dirname, '../src/nearby-place.js'), 'utf8');
function client(options = {}) {
  const requests = [];
  const context = {
    Date, Number, AbortSignal,
    regionFor: async () => options.areas === null ? null : origin().areas,
    fetch: async (url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: !options.error, json: async () => options.error ? { error: options.error } : { places: [place('조회된 업체', '미용실')] } };
    }
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import .*;\r?\n/m, '').replace(/export /g, ''), context);
  return { ...context, requests };
}
for (const [question, category] of [
  ['근처 미용실', '미용실'], ['이 근처 미용실 찾아줘', '미용실'],
  ['여기 근처 미용실 찾아줘', '미용실'], ['여기서 이 근처 미용실 찾아줘', '미용실'],
  ['이 근처 제일 가까운 미용실 찾아줘', '미용실'],
  ['근처 편의점', '편의점'], ['근처 약국', '약국'],
  ['주변 약국을 찾아주세요', '약국'], ['여기근처미용실찾아줘', '미용실']
]) test(`nearby intent: ${question}`, () => assert.equal(client().nearbyPlaceQuery(question), category));

test('named destinations and station routes keep their original parser behavior', () => {
  const c = client();
  for (const text of ['사가정역에서 면목역까지', '용마산 스카이워크', '서울역', '근처 미용실에서 강남역까지']) {
    assert.equal(c.nearbyPlaceQuery(text), '');
  }
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  vm.runInContext(main.slice(main.indexOf('function directRouteIntent('), main.indexOf('const icons =')), vm.createContext(c));
  assert.equal(c.directRouteIntent('사가정역에서 면목역까지', 'dual').destination, '면목역');
  assert.equal(c.directRouteIntent('서울역', 'dual').searchMode, undefined);
});
test('GPS goes unchanged directly to radius search; no district or preview origin', async () => {
  const c = client(), p = origin();
  await c.fetchNearbyPlaces('미용실', p);
  assert.equal(c.requests[0].nearby.lat, p.lat);
  assert.equal(c.requests[0].nearby.lng, p.lng);
  assert.equal(c.requests[0].query, '미용실');
  assert.equal(c.requests[0].nearby.areas, undefined);
});
test('missing, stale or very inaccurate GPS never triggers global search; reverse lookup is unnecessary', async () => {
  for (const p of [null, { ...origin(), accuracy: 2001 }, { ...origin(), timestamp: Date.now() - 130000 }]) {
    const c = client();
    await assert.rejects(c.fetchNearbyPlaces('약국', p));
    assert.equal(c.requests.length, 0);
  }
  const c = client({ areas: null });
  await c.fetchNearbyPlaces('약국', origin());
  assert.equal(c.requests.length, 1);
});
test('approximate GPS remains usable for candidates; labels qualify uncertainty', async () => {
  const c = client();
  await c.fetchNearbyPlaces('미용실', { ...origin(), accuracy: 95 });
  assert.equal(c.requests.length, 1);
  assert.match(c.nearbyDistanceLabel({ distanceMeters: 122 }, 95), /직선거리 약 120m.*대략적인 GPS/);
  assert.equal(c.nearbyDistanceLabel({}), '');
});
test('leaving the route prevents search', async () => {
  const c = client();
  assert.equal((await c.fetchNearbyPlaces('미용실', origin(), () => false)).length, 0);
  assert.equal(c.requests.length, 0);
});
test('server rejects missing areas, invalid coordinates and expired GPS', () => {
  assert.ok(nearbyInput(origin()));
  for (const p of [null, { ...origin(), areas: [] }, { ...origin(), lat: null }, { ...origin(), lng: 181 }, { ...origin(), accuracy: -1 }, { ...origin(), timestamp: 0 }]) assert.equal(nearbyInput(p), null);
});
test('distance calculation uses Earth radius 6371000m and both WGS84 points', () => {
  assert.equal(distanceMeters(origin(), origin()), 0);
  assert.ok(Math.abs(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111194.9266) < 0.01);
  assert.ok(Math.abs(distanceMeters(origin(), { ...origin(), lat: 37.581 }) - 111.1949266) < 0.01);
});
for (const [query, category, title] of [['미용실', '미용>미용실', '리안헤어'], ['편의점', '생활,편의>편의점', 'CU 시험점'], ['약국', '건강,의료>약국', '건강약국']]) {
  test(`${query}: retains category matches with unrelated brand names, removes far/wrong candidates, deduplicates and sorts`, async () => {
    const terms = [];
    const result = await nearbyPlaces(query, nearbyInput(origin()), async term => {
      terms.push(term);
      return [place(title, category), place('먼 업체', category, 37.63),
        place('다른 업종', '교육>학원'), place('가까운 업체', category, 37.5805)];
    });
    assert.equal(result.places.length, 2);
    assert.equal(result.places[0].title, '가까운 업체');
    assert.equal(result.places[1].title, title);
    assert.equal(result.places[1].distanceMeters, 111);
    assert.equal(terms.length, 3);
    assert.ok(terms.every(term => term.startsWith('서울특별시 중랑구')));
    assert.equal(result.distanceBasis, 'straight-line');
  });
}
test('partial provider failures retain only successful candidates; total failure propagates', async () => {
  let calls = 0;
  const result = await nearbyPlaces('약국', nearbyInput(origin()), async () => {
    if (++calls > 1) throw new Error('provider failed');
    return [place('건강약국', '약국')];
  });
  assert.equal(result.partial, true);
  assert.equal(result.places.length, 1);
  await assert.rejects(nearbyPlaces('약국', nearbyInput(origin()), async () => { throw new Error('provider failed'); }), /provider failed/);
});
test('no hits returns empty candidates, never invented names or distances', async () => {
  const result = await nearbyPlaces('약국', nearbyInput(origin()), async () => []);
  assert.deepEqual(result.places, []);
});
test('place endpoint: nearby bypasses exact title/landmark fallback; named flow retained', async () => {
  const queries = [];
  const radius = require('../lib/nearby-radius');
  const context = { module: { exports: {} }, require: name => name.endsWith('nearby-radius') ? {
    ...radius, searchRadiusPlaces: (query, point, options) => radius.searchRadiusPlaces(query, point, { ...options, fetchImpl: context.fetch })
  } : require(path.join(__dirname, '../api/map', name)), URL, AbortSignal, process: { env: { TMAP_TRANSIT_API_KEY: 'fixture', NAVER_API_HUB_CLIENT_ID: 'fixture', NAVER_API_HUB_API_KEY: 'fixture' } },
    fetch: async url => {
      if (url.hostname === 'apis.openapi.sk.com') return { ok: true, json: async () => ({
        searchPoiInfo: { totalCount: '1', pois: { poi: [{ id: '1', name: '리안헤어', noorLat: '37.581', noorLon: '127.08',
          upperAddrName: '서울', middleAddrName: '중랑구', lowerAddrName: '면목동' }] } }
      }) };
      queries.push(url.searchParams.get('query'));
      return { ok: true, json: async () => ({ items: [{ title: '리안헤어', category: '미용>미용실', mapx: '1270800000', mapy: '375810000' }] }) };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/map/place.js'), 'utf8'), context);
  const invoke = async body => {
    let output, status;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(o) { output = o; } };
    await context.module.exports({ method: 'POST', body }, res);
    return { output, status };
  };
  const nearby = await invoke({ query: '미용실', nearby: origin() });
  assert.equal(nearby.status, 200);
  assert.equal(nearby.output.places[0].title, '리안헤어');
  assert.ok(queries.every(q => !q.endsWith('명소')));
  queries.length = 0;
  const named = await invoke({ query: '리안헤어' });
  assert.equal(named.output.place.title, '리안헤어');
  assert.deepEqual(queries, ['리안헤어']);
});
