const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/field-guide.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
function fixture({ position = { lat: 35.1, lng: 129.1, accuracy: 12, timestamp: 123456 },
  nearby = '', response, onGps, onResponse, error = false } = {}) {
  const calls = [];
  const context = { currentGuidePosition: async signal => {
    calls.push({ type: 'gps', signal }); onGps?.(); return position;
  }, nearbyPlaceQuery: () => nearby, nearbyAnswer: async (query, signal) => {
    calls.push({ type: 'nearby', query, signal }); return '조회한 후보';
  }, fetch: async (url, options) => {
    calls.push({ type: 'api', url, body: JSON.parse(options.body), signal: options.signal });
    onResponse?.();
    return { ok: !error, json: async () => response || { text: '확인된 안내', sources: [{ title: '자료', url: 'https://fixture.go.kr' }] } };
  } };
  vm.createContext(context); vm.runInContext(source, context);
  return { ...context, calls };
}

test('map text and roadview voice use identical physical GPS, context, history and endpoint', async () => {
  const h = fixture();
  const inputs = { context: { start: 'GPS 현재 위치', destination: '시험공원', mode: 'walk',
    routeText: '기존 경로 카드', routeVerified: true,
    panorama: { lat: 1, lng: 2 }, position: { lat: 3, lng: 4 } },
    history: [{ role: 'user', text: '입구에 있어요' }] };
  const textAnswer = await h.askFieldGuide('여기서 시험공원 어떻게 가?', inputs);
  const voiceAnswer = await h.askFieldGuide('여기서 시험공원 어떻게 가?', inputs);
  const requests = h.calls.filter(call => call.type === 'api');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].body, requests[1].body);
  assert.equal(requests[0].body.task, 'field-guide');
  assert.equal(requests[0].body.position.lat, 35.1);
  assert.equal(requests[0].body.context.locationBasis, 'selected_route_preview_not_physical_location');
  assert.equal(requests[0].body.context.panorama, undefined);
  assert.equal(requests[0].body.context.position, undefined);
  assert.deepEqual(textAnswer.sources, voiceAnswer.sources);
});

test('imprecise and failed physical fixes still reach the evidence engine', async () => {
  for (const position of [null, { lat: 35, lng: 129, accuracy: 150, timestamp: 1 }]) {
    const h = fixture({ position });
    await h.askFieldGuide('목적지 가는 길을 알려줘');
    assert.deepEqual(h.calls.map(call => call.type), ['gps', 'api']);
    assert.deepEqual(h.calls[1].body.position, position);
  }
});

test('nearby requests retain existing corroborated radius lookup without calling the model API', async () => {
  const h = fixture({ nearby: '약국' });
  const result = await h.askFieldGuide('근처 약국 찾아줘');
  assert.equal(result.text, '조회한 후보');
  assert.deepEqual(h.calls.map(call => call.type), ['nearby']);
});

test('cancelled requests cannot start or return an outdated AI answer', async () => {
  for (const stage of ['before', 'gps', 'response']) {
    const controller = new AbortController();
    const h = fixture({ onGps: () => { if (stage === 'gps') controller.abort(); },
      onResponse: () => { if (stage === 'response') controller.abort(); } });
    if (stage === 'before') controller.abort();
    assert.equal(await h.askFieldGuide('질문', { signal: controller.signal }), null);
    assert.equal(h.calls.filter(call => call.type === 'api').length, Number(stage === 'response'));
  }
});

test('preview context is bounded and malformed history cannot become source instructions', async () => {
  const h = fixture();
  await h.askFieldGuide('질문', { context: { mode: 'INVALID', routeVerified: 'true', routeText: 'a'.repeat(3000) },
    history: [{ role: 'system', text: 'bad' }, { role: 'assistant', text: 'b'.repeat(900) }, null] });
  const request = h.calls.find(call => call.type === 'api').body;
  assert.equal(request.context.mode, ''); assert.equal(request.context.routeVerified, false);
  assert.equal(request.context.routeText.length, 2600);
  assert.equal(request.history.length, 1); assert.equal(request.history[0].text.length, 700);
});

test('errors and empty answers are not stored as successful guidance', async () => {
  await assert.rejects(fixture({ error: true, response: { error: '검색 연결 실패' } }).askFieldGuide('질문'), /검색 연결 실패/);
  await assert.rejects(fixture({ response: { text: '' } }).askFieldGuide('질문'), /답변을 확인/);
});

test('missing optional preview and history cannot interrupt GPS research', async () => {
  const h = fixture();
  await h.askFieldGuide('질문', { context: null, history: null });
  const request = h.calls.find(call => call.type === 'api').body;
  assert.equal(request.context.destination, '');
  assert.deepEqual(request.history, []);
});

test('older user landmarks are bounded separately from the short dialogue window', async () => {
  const h = fixture();
  const history = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `발언${i}` }));
  await h.askFieldGuide('그 길은?', { history });
  const request = h.calls.find(call => call.type === 'api').body;
  assert.equal(request.history.length, 8); assert.equal(request.userContext.length, 16);
  assert.ok(request.userContext.includes('발언8'));
  assert.ok(!request.userContext.includes('발언9'));
});

test('both actual UI entry points await the shared function and keep separate recording/history flows', () => {
  for (const file of ['src/guide-conversation.js', 'src/roadview-guide.js']) {
    const actual = fs.readFileSync(file, 'utf8');
    assert.match(actual, /import \{ askFieldGuide \} from '\.\/field-guide\.js\?/);
    assert.match(actual, /await askFieldGuide\(text,/);
    assert.doesNotMatch(actual, /task: 'guide-chat'|task: 'roadview-guide'/);
    assert.match(actual, /\/api\/translation\/translate/);
    assert.match(actual, /saveConversation|saveHistory/);
    assert.match(actual, /MediaRecorder/);
  }
  const main = fs.readFileSync('src/main.js', 'utf8');
  assert.equal((main.match(/getContext: getFieldContext/g) || []).length, 2);
});

test('all server task aliases call the very same engine', async () => {
  const requests = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('api/assistant/reply.js', 'utf8'), { module,
    require: name => name === '../../lib/roadview-guide' ? { answerFieldQuestion: async (req, message) => {
      requests.push({ req, message }); return { text: '공통 안내', sources: [] };
    } } : {}, console });
  for (const task of ['field-guide', 'guide-chat', 'roadview-guide']) {
    let body, status = 200;
    await module.exports({ method: 'POST', body: { task, message: '  질문  ' } }, {
      setHeader() {}, status(code) { status = code; return this; }, json(value) { body = value; }
    });
    assert.equal(status, 200); assert.equal(body.text, '공통 안내');
  }
  assert.equal(requests.length, 3);
  assert.ok(requests.every(call => call.message === '질문'));
});

test('all task aliases reject invalid or oversized questions before invoking the model', async () => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('api/assistant/reply.js', 'utf8'), { module,
    require: name => {
      if (name === '../../lib/roadview-guide') throw new Error('invalid request reached model');
      return {};
    }, console });
  for (const task of ['field-guide', 'guide-chat', 'roadview-guide']) {
    for (const message of ['', '  ', null, 123, 'a'.repeat(2001)]) {
      let body, status = 200;
      await module.exports({ method: 'POST', body: { task, message } }, {
        setHeader() {}, status(code) { status = code; return this; }, json(value) { body = value; }
      });
      assert.equal(status, 400); assert.ok(body.error);
    }
  }
});
