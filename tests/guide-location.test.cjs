const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/guide-location.js'), 'utf8');

function client({ accuracy = 95, age = 0, denied = false, missingMaps = false, failRegion = false } = {}) {
  const calls = [];
  const context = {
    Date, setTimeout, clearTimeout, AbortController, navigator: { geolocation: {
      getCurrentPosition(ok, fail, options) {
        calls.push({ kind: 'gps', options });
        if (denied) return fail({ code: 1 });
        ok({ coords: { latitude: 37.6, longitude: 127.1, accuracy }, timestamp: Date.now() - age });
      }
    } },
    window: { naver: missingMaps ? undefined : { maps: {
      LatLng: function(lat, lng) { this.lat = lat; this.lng = lng; },
      Service: { Status: { OK: 200 }, reverseGeocode(request, callback) {
        calls.push({ kind: 'region', request });
        callback(failRegion ? 500 : 200, { v2: { results: [{ region: {
          area1: { name: '서울특별시' }, area2: { name: '중랑구' }, area3: { name: '면목동' }
        } }] } });
      } }
    } } }
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/export /g, ''), context);
  return { get: (signal, options) => context.currentGuidePosition(signal, options), calls };
}
test('nearby questions request fresh GPS directly without reverse-geocoding', async () => {
  const h = client({ missingMaps: true });
  const result = await h.get(undefined, { resolveRegion: false });
  assert.equal(result.lat, 37.6);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.maximumAge, 0);
});
test('GPS coordinates, reported accuracy and timestamp are kept; reverse region is only a hint', async () => {
  const h = client();
  const result = await h.get();
  assert.equal(result.accuracy, 95);
  assert.equal(result.lat, 37.6);
  assert.equal(result.lng, 127.1);
  assert.ok(Math.abs(Date.now() - result.timestamp) < 1000);
  assert.deepEqual(Array.from(result.areas), ['서울특별시 중랑구 면목동']);
  assert.equal(h.calls[0].options.enableHighAccuracy, true);
  assert.equal(h.calls[0].options.maximumAge, 10000);
});
test('GPS permission failure returns no position and never reverse-geocodes a preview position', async () => {
  const h = client({ denied: true });
  assert.equal(await h.get(), null);
  assert.equal(h.calls.length, 1);
});
test('reverse lookup failure or unavailable SDK preserves physical GPS', async () => {
  for (const options of [{ missingMaps: true }, { failRegion: true }]) {
    const result = await client(options).get();
    assert.equal(result.lat, 37.6);
    assert.equal(result.accuracy, 95);
    assert.equal(result.areas, undefined);
  }
});
test('stale or excessively broad fixes never generate a local area hint', async () => {
  for (const options of [{ age: 180000 }, { accuracy: 25000 }]) {
    const h = client(options);
    const result = await h.get();
    assert.equal(result.areas, undefined);
    assert.equal(h.calls.length, 1);
  }
});
test('aborted conversation never starts another GPS request', async () => {
  const h = client();
  const controller = new AbortController();
  controller.abort();
  assert.equal(await h.get(controller.signal), null);
  assert.equal(h.calls.length, 0);
});
test('roadview submission awaits the physical fix and sends it with the question', () => {
  const clientSource = fs.readFileSync(path.join(__dirname, '../src/roadview-guide.js'), 'utf8');
  assert.match(clientSource, /await currentGuidePosition\(signal\)/);
  assert.match(clientSource, /task: 'roadview-guide', message: text, position, context: getContext\(\)/);
  assert.doesNotMatch(clientSource, /position:\s*(?:getContext|context\.|panorama)/);
});
