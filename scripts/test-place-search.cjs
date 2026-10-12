const assert = require('node:assert/strict');
const fs = require('node:fs');

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

async function call(handler, body, method = 'POST') {
  const res = responseRecorder();
  await handler({ method, body }, res);
  return res;
}

async function main() {
  const mainSource = fs.readFileSync(require.resolve('../src/main.js'), 'utf8');
  const styleSource = fs.readFileSync(require.resolve('../src/styles.css'), 'utf8');
  const placesScreenStart = mainSource.indexOf('function nearbyPlacesScreen()');
  const placesScreenEnd = mainSource.indexOf('\nfunction guideScreen()', placesScreenStart);
  const placesScreen = mainSource.slice(placesScreenStart, placesScreenEnd);
  assert.ok(placesScreenStart >= 0 && placesScreenEnd > placesScreenStart, 'nearby place screen source is present');
  assert.ok(placesScreen.includes('class="bubble question">${escapeHtml(query || \'\')}</p>'), 'the original place-search request appears in a conversation bubble');
  assert.ok(placesScreen.includes('class="bubble answer">${escapeHtml(originName)} 주변 ${places.length}개의 ${escapeHtml(categoryLabel)}${categoryParticle} 찾았습니다.</p>'), 'the conversation reply reports the dynamic result count and category');
  assert.ok(placesScreen.indexOf('class="place-results"') < placesScreen.indexOf('class="guide-dialogue places-dialogue"'), 'the conversation bubbles follow the place cards at the bottom');
  assert.ok(styleSource.includes('.places-dialogue .bubble { width: min(92%, 540px); padding: 18px 24px; border-radius: 30px; font-size: clamp(19px, 4.4vw, 23px); line-height: 1.45; }'), 'place-search bubbles are larger and more prominent than regular guide bubbles');
  assert.match(placesScreen, /\$\{escapeHtml\(originName\)\} 주변 \$\{places\.length\}개의 \$\{escapeHtml\(categoryLabel\)\}\$\{categoryParticle\} 찾았습니다\./, 'the result count, place category, and Korean particle are dynamic');
  assert.match(mainSource, /function koreanObjectParticle\(word\)/, 'the result sentence uses a Korean object particle appropriate to the category');
  assert.ok(placesScreen.indexOf('class="places-map"') < placesScreen.indexOf('class="places-result-summary"'), 'the result summary is directly under the map');
  assert.ok(placesScreen.indexOf('class="places-result-summary"') < placesScreen.indexOf('class="place-results"'), 'the map summary is shown before the place list');
  assert.match(placesScreen, /id="places-roadview"[\s\S]*data-action="place-roadview-map"[\s\S]*data-action="place-roadview-route"/, 'the place roadview has map and route actions');
  assert.match(mainSource, /maps\.Event\.addListener\(marker, 'click', \(\) => showPlaceRoadview\(index\)\)/, 'map markers open the matching place roadview');
  assert.match(mainSource, /button\.addEventListener\('click', \(\) => showPlaceRoadview\(Number\(button\.dataset\.placeIndex\)\)\)/, 'place cards open the matching place roadview');
  const guideScreenStart = mainSource.indexOf('function guideScreen()');
  const guideScreenEnd = mainSource.indexOf('\nfunction nearbyScreen()', guideScreenStart);
  const guideScreen = mainSource.slice(guideScreenStart, guideScreenEnd);
  assert.match(guideScreen, /data-action="back" aria-label="뒤로 가기"/, 'the guide screen has a back button');

  const modelProviderPath = require.resolve('../api/lib/model-provider');
  const modelProvider = require(modelProviderPath);
  const originalGenerate = modelProvider.generateAssistantText;
  let modelCalls = 0;
  modelProvider.generateAssistantText = async () => { modelCalls += 1; throw new Error('place search must not call Gemini'); };
  const search = require('../api/places/search');

  const interpretation = await call(search, { action: 'interpret', query: '안국역에서 조용하고 도보 10분 안쪽 숙소 찾아줘' });
  assert.equal(interpretation.statusCode, 200);
  assert.deepEqual(interpretation.body.criteria, {
    category: 'lodging', originName: '안국역', useCurrentLocation: false,
    walkingLimitMinutes: 10, preference: '조용한', sortBy: 'relevance'
  });
  const simpleSearch = await call(search, { action: 'interpret', query: '안국역 근처 숙소 찾아줘' });
  assert.equal(simpleSearch.statusCode, 200);
  assert.deepEqual(simpleSearch.body.criteria, {
    category: 'lodging', originName: '안국역', useCurrentLocation: false,
    walkingLimitMinutes: null, preference: '', sortBy: 'relevance'
  });
  const nearbyCafe = await call(search, { action: 'interpret', query: '현재 위치 근처 카페 찾아줘' });
  assert.equal(nearbyCafe.statusCode, 200);
  assert.equal(nearbyCafe.body.criteria.category, 'cafe');
  assert.equal(nearbyCafe.body.criteria.useCurrentLocation, true);
  const closestCafe = await call(search, { action: 'interpret', query: '안국역 근처 가장 가까운 카페 찾아줘' });
  assert.equal(closestCafe.body.criteria.originName, '안국역');
  assert.equal(closestCafe.body.criteria.sortBy, 'walking_time');
  assert.equal(modelCalls, 0, 'place-query interpretation must not call the AI provider');
  modelProvider.generateAssistantText = originalGenerate;
  assert.equal((await call(search, { action: 'interpret', query: '' })).statusCode, 400);
  assert.equal((await call(search, {}, 'GET')).statusCode, 405);

  const previousEnv = {
    clientId: process.env.NAVER_API_HUB_CLIENT_ID,
    apiKey: process.env.NAVER_API_HUB_API_KEY,
    tmapKey: process.env.TMAP_TRANSIT_API_KEY
  };
  process.env.NAVER_API_HUB_CLIENT_ID = 'mock-client-id';
  process.env.NAVER_API_HUB_API_KEY = 'mock-api-key';
  process.env.TMAP_TRANSIT_API_KEY = 'mock-tmap-key';
  const requests = [];
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.hostname === 'naverapihub.apigw.ntruss.com') {
      assert.equal(init.headers['X-NCP-APIGW-API-KEY-ID'], 'mock-client-id');
      assert.equal(init.headers['X-NCP-APIGW-API-KEY'], 'mock-api-key');
      const query = url.searchParams.get('query');
      const anchor = query === '안국역';
      return {
        ok: true, status: 200,
        json: async () => ({ items: anchor ? [{
          title: '안국역', mapx: '1270010000', mapy: '375700000', address: '서울 종로구'
        }] : [
          { title: '<b>조용한</b> 숙소 A', category: '숙박', mapx: '1270020000', mapy: '375710000', address: '서울 종로구 1' },
          { title: '숙소 B', category: '숙박', mapx: '1270030000', mapy: '375720000', address: '서울 종로구 2' }
        ] })
      };
    }
    assert.equal(url.hostname, 'apis.openapi.sk.com');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.appKey, 'mock-tmap-key');
    const request = JSON.parse(init.body);
    assert.equal(request.searchOption, '10');
    const isSecondCandidate = request.endX > 127.0025;
    const totalTime = isSecondCandidate ? 660 : 420;
    return {
      ok: true, status: 200,
      json: async () => ({ features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [request.startX, request.startY] }, properties: { totalTime, totalDistance: 310 } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [
          [request.startX, request.startY], [request.endX, request.endY]
        ] }, properties: {} }
      ] })
    };
  };

  const criteria = {
    category: 'lodging', categoryLabel: '숙소', originName: '안국역', useCurrentLocation: false,
    walkingLimitMinutes: 10, preference: '조용한', sortBy: 'walking_time'
  };
  const result = await call(search, { criteria });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.origin.name, '안국역');
  assert.equal(result.body.origin.resolvedName, '안국역', 'retain the actual Naver starting point');
  assert.equal(result.body.checkedCandidates, 2);
  assert.equal(result.body.places.length, 1, 'places over the requested walk-time limit are filtered out');
  assert.equal(result.body.places[0].name, '조용한 숙소 A', 'NAVER HTML markup is removed');
  assert.equal(result.body.places[0].walkingMinutes, 7);
  assert.deepEqual(result.body.places[0].route.paths[0], [[127.001, 37.57], [127.002, 37.571]]);
  assert.equal(requests.filter(({ url }) => url.hostname === 'apis.openapi.sk.com').length, 2);

  const callsBeforeCachedRequest = requests.length;
  const cachedResult = await call(search, { criteria });
  assert.deepEqual(cachedResult.body, result.body);
  assert.equal(requests.length, callsBeforeCachedRequest, 'a repeated query uses the short in-memory cache');
  assert.equal((await call(search, {}, 'GET')).statusCode, 405);

  const oldFetch = global.fetch;
  delete require.cache[require.resolve('../api/places/search')];
  delete process.env.NAVER_API_HUB_CLIENT_ID;
  delete process.env.NAVER_API_HUB_API_KEY;
  delete process.env.TMAP_TRANSIT_API_KEY;
  const noCredentials = await call(require('../api/places/search'), { criteria });
  assert.equal(noCredentials.statusCode, 503);
  global.fetch = oldFetch;
  for (const [key, value] of Object.entries({
    NAVER_API_HUB_CLIENT_ID: previousEnv.clientId,
    NAVER_API_HUB_API_KEY: previousEnv.apiKey,
    TMAP_TRANSIT_API_KEY: previousEnv.tmapKey
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  console.log('PASS: rule-based place parsing (no Gemini), NAVER local search (mocked), TMAP walking-time filtering (mocked), route payload, caching, and validation');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
