const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/nearby-answer.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const client = fs.readFileSync('src/nearby-place.js', 'utf8').replace(/export /g, '');
function fixture({ places = [], position = { lat: 37.588, lng: 127.096, accuracy: 15, timestamp: Date.now() }, error } = {}) {
  const calls = [];
  const context = { Date, Number, AbortSignal, currentGuidePosition: async (signal, options) => {
    calls.push({ type: 'gps', options }); return position;
  }, fetch: async (url, init) => {
    calls.push({ type: 'search', url, body: JSON.parse(init.body) });
    return { ok: !error, json: async () => error ? { error } : { places } };
  } };
  vm.createContext(context);
  vm.runInContext(client + '\n' + source, context);
  return { ...context, calls };
}
test('AI nearby answer uses fresh physical GPS and only retrieved shops/distances', async () => {
  const h = fixture({ places: [{ title: '살롱이유', roadAddress: '용마산로 409', distanceMeters: 5 }] });
  const answer = await h.nearbyAnswer('미용실');
  assert.equal(h.calls[0].options.resolveRegion, false);
  assert.equal(h.calls[1].body.nearby.lat, 37.588);
  assert.equal(h.calls[1].url, '/api/map/place');
  assert.match(answer, /살롱이유.*직선거리 약 10m.*용마산로 409/);
  assert.doesNotMatch(answer, /분 걸|우회전|좌회전|영업 중/);
});
test('missing GPS or provider failure cannot fall through to invented AI results', async () => {
  const denied = fixture({ position: null });
  await assert.rejects(denied.nearbyAnswer('미용실'), /현재 위치/);
  assert.equal(denied.calls.length, 1);
  await assert.rejects(fixture({ error: '조회 실패' }).nearbyAnswer('약국'), /조회 실패/);
  assert.match(await fixture().nearbyAnswer('편의점'), /업체가 없다는 뜻은 아닙니다/);
});
test('cancelled requests and translation text do not perform nearby lookup', async () => {
  const h = fixture();
  const controller = new AbortController(); controller.abort();
  assert.equal(await h.nearbyAnswer('미용실', controller.signal), '');
  assert.equal(h.calls.filter(c => c.type === 'search').length, 0);
  for (const text of ['근처 미용실 찾아줘를 영어로 번역', '근처 약국 통역해줘', '사가정역에서 면목역까지']) {
    assert.equal(h.nearbyPlaceQuery(text), '');
  }
});
test('both AI surfaces dispatch nearby requests to the shared retrieval answer', () => {
  for (const file of ['src/guide-conversation.js', 'src/roadview-guide.js']) {
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /await askFieldGuide\(text,/);
    assert.match(text, /\/api\/translation\/translate/);
  }
  const shared = fs.readFileSync('src/field-guide.js', 'utf8');
  assert.match(shared, /const nearby = nearbyPlaceQuery\(message\)/);
  assert.match(shared, /await nearbyAnswer\(nearby, signal\)/);
});
