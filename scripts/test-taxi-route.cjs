const assert = require('node:assert/strict');
const handler = require('../api/taxi/routes');

function response() {
  return { statusCode: 200, body: null, setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; } };
}

async function main() {
  const previousKey = process.env.TMAP_CAR_API_KEY;
  const previousFetch = global.fetch;
  process.env.TMAP_CAR_API_KEY = 'test-key';
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ features: [
      { properties: { totalTime: 420, totalDistance: 1950, taxiFare: 5600 }, geometry: { type: 'Point', coordinates: [127, 37] } },
      { geometry: { type: 'LineString', coordinates: [[127, 37], [127.001, 37.001], [200, 0]] } }
    ] }) };
  };
  try {
    const res = response();
    await handler({ method: 'POST', body: { startX: 127, startY: 37, endX: 127.01, endY: 37.01 } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.totalTime, 420);
    assert.equal(res.body.totalDistance, 1950);
    assert.equal(res.body.taxiFare, 5600);
    assert.deepEqual(res.body.paths, [[[127, 37], [127.001, 37.001]]]);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /tmap\/routes/);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TMAP_CAR_API_KEY;
    else process.env.TMAP_CAR_API_KEY = previousKey;
  }
  console.log('PASS: taxi time, fare, distance and valid TMAP road geometry');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
