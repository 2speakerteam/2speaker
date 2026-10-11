const assert = require('node:assert/strict');

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
  const modelProviderPath = require.resolve('../api/lib/model-provider');
  const modelProvider = require(modelProviderPath);
  const originalGenerate = modelProvider.generateAssistantText;
  let interpretedPrompt = '';
  modelProvider.generateAssistantText = async ({ contents }) => {
    interpretedPrompt = contents[0].parts[0].text;
    return {
      text: JSON.stringify({
        category: 'lodging', originName: '안국역', useCurrentLocation: false,
        walkingLimitMinutes: 10, preference: '조용한', sortBy: 'walking_time'
      }),
      provider: 'test', model: 'test-model'
    };
  };
  const search = require('../api/places/search');
  modelProvider.generateAssistantText = originalGenerate;

  const interpretation = await call(search, { action: 'interpret', query: '안국역에서 조용하고 도보 10분 안쪽 숙소 찾아줘' });
  assert.equal(interpretation.statusCode, 200);
  assert.equal(interpretedPrompt, '안국역에서 조용하고 도보 10분 안쪽 숙소 찾아줘');
  assert.deepEqual(interpretation.body.criteria, {
    category: 'lodging', originName: '안국역', useCurrentLocation: false,
    walkingLimitMinutes: 10, preference: '조용한', sortBy: 'walking_time'
  });
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

  console.log('PASS: Gemini intent parsing (mocked), NAVER local search (mocked), TMAP walking-time filtering (mocked), route payload, caching, and validation');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

