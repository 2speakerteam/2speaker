const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const community = require('../lib/roadview-community');
const { plain } = require('../lib/roadview-source-text');

// Synthetic evidence only. These fixtures do not claim real trail connections.
const topic = '시험산 스카이워크';
const report = {
  title: `${topic} 가는 길 입구별 데크 코스`, link: 'https://blog.naver.com/walker/123456',
  description: `${topic}는 시험공원 입구에서 표지판을 따라 데크길로 접근한 방문 기록입니다.`,
  postdate: '20260112', bloggername: 'Fixture walker'
};
const article = `<div class="se-main-container"><p>${report.description.repeat(3)}</p></div><div>UNRELATED COMMENTS</div>`;
const routePlan = { task: 'route', environment: 'mountain', startQuery: '', destinationQuery: topic, mode: 'walk', searchSubject: topic };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const html = body => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

function harness(options = {}) {
  const subject = options.subject || topic;
  const fixtureReport = { ...report, title: report.title.replace(topic, subject), description: report.description.replace(topic, subject) };
  const requests = [], models = [], routes = [], logs = [];
  const cache = new Map();
  const fakeFetch = async (value, init = {}) => {
    const url = new URL(value);
    requests.push(url.href);
    if (url.hostname === 'aiplatform.googleapis.com') {
      const request = JSON.parse(init.body);
      const data = JSON.parse(request.contents[0].parts[0].text);
      models.push({ request, data });
      const extracting = request.systemInstruction.parts[0].text.startsWith('FIELD_ACCESS_EXTRACTION');
      const text = request.generationConfig.responseMimeType
        ? JSON.stringify(extracting ? options.accessExtraction || { paths: [] } : options.plan || routePlan)
        : options.answer || '방문기에 나온 접근 코스입니다. 근처 입구 이름을 알려 주세요.';
      return json({ candidates: [{ content: { parts: [{ text }] } }] });
    }
    if (url.hostname === 'naverapihub.apigw.ntruss.com') {
      const channel = url.pathname.split('/').pop();
      if (channel === 'webkr') {
        const fallback = /site:(?:blog|cafe)/.test(url.searchParams.get('query'));
        return json({ items: options.noSources ? [] : fallback ? [fixtureReport] : options.official ? [{
          title: `${subject} 공식 찾아가기`, link: options.officialUrl || 'https://fixture.go.kr/trail', description: '공식 접근 안내'
        }] : [] });
      }
      if (options.searchFailure) return json({}, 403);
      return json({ items: options.noSources ? [] : channel === 'blog'
        ? [fixtureReport, { ...fixtureReport, link: 'https://m.blog.naver.com/walker/123457' },
          { ...report, title: '다른산 스카이워크 코스', description: '다른 산', link: 'https://blog.naver.com/other/999' }]
        : [{ ...fixtureReport, link: 'https://cafe.naver.com/walkers/222', cafename: 'Fixture cafe' }] });
    }
    if (url.hostname === 'fixture.go.kr' || (options.officialUrl && url.hostname === new URL(options.officialUrl).hostname)) {
      if (url.pathname === '/route.png') return new Response(Buffer.from('89504e470d0a1a0a00000000', 'hex'), {
        headers: { 'content-type': 'image/png' } });
      return html(`<main>${options.officialBody || `${subject} 공식 안내. 시험공원 입구.`}</main>`);
    }
    if (['m.blog.naver.com', 'm.cafe.naver.com'].includes(url.hostname)) {
      if (options.pageError) throw new Error('page unavailable');
      if (options.redirect) return new Response(null, { status: 302, headers: { location: options.redirect } });
      if (options.privatePage) return html('<main>로그인 후 볼 수 있습니다.</main>');
      return html(options.communityBody || article.replaceAll(topic, subject));
    }
    throw new Error(`Unexpected network request: ${url.hostname}`);
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    const module = { exports: {} };
    const requireMock = name => {
      if (name === './roadview-public-page') return { readPublicPage: async (url, signal) => {
        const response = await fakeFetch(url, { signal, redirect: 'manual' });
        return { status: response.status, location: response.headers.get('location') || '',
          contentType: response.headers.get('content-type') || '', html: await response.text() };
      } };
      if (name.endsWith('/google-cloud')) return { cloudLocation: () => 'global', cloudProjectId: () => 'fixture', getAccessToken: async () => 'fixture-token' };
      if (name.endsWith('/map/place')) return async (req, res) => res.json({ places: options.placeError || options.failOrigin === req.body.query ? [] : [{
        title: options.unrelatedPlace || req.body.query, lat: 37.5, lng: 127, category: options.category || '여행>등산',
        ...(options.places?.[req.body.query] || {})
      }] });
      if (/\/transit\//.test(name)) return async (req, res) => {
        routes.push(req.body);
        if (options.routeError) return res.status(422).json({ error: 'TMAP에서 이 출발지와 목적지 사이의 도보 경로를 찾지 못했습니다.' });
        return res.json({ route: { totalSeconds: 600, distanceMeters: options.routeDistance || 500,
          directions: ['시험 입구로 이동'] }, coordinateMatch: true });
      };
      return load(path.relative(root, path.resolve(path.dirname(filename), name + '.js')));
    };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
      require: requireMock, fetch: fakeFetch, URL, AbortSignal, Buffer, TextDecoder,
      process: { env: { NAVER_API_HUB_CLIENT_ID: 'fixture', NAVER_API_HUB_API_KEY: 'fixture' } },
      console: { info: (...args) => logs.push(args) }
    }, { filename });
    cache.set(filename, module.exports);
    return module.exports;
  }
  return { guide: load('lib/roadview-guide.js'), community: load('lib/roadview-community.js'),
    requests, models, routes, logs };
}

for (const fixture of [
  { subject: '시험산 전망대', entrance: '시험공원 입구', via: '솔바람데크', countryCode: 'KR' },
  { subject: 'River Forest Lookout', entrance: 'North Gate', via: 'Cedar Trail', countryCode: 'US' }
]) {
  test(`published ordered access is grounded and distinguished from provider totals: ${fixture.subject}`, async () => {
    const { subject, entrance, via, countryCode } = fixture;
    const quote1 = `${entrance}에서 ${via}로 이어집니다.`;
    const quote2 = `${via}를 따라 ${subject}에 도착합니다.`;
    const h = harness({ subject, official: true, officialBody: quote1 + ' ' + quote2,
      routeDistance: 5100, plan: { ...routePlan, destinationQuery: subject, searchSubject: subject,
        viaQuery: via, countryCode, accessResearch: true },
      accessExtraction: { paths: [{ sourceId: 'S1', nodes: [entrance, via, subject], entryIndex: 0,
        edges: [{ from: entrance, to: via, quote: quote1 }, { from: via, to: subject, quote: quote2 }] }] },
      answer: 'TMAP 경로는 5.1km이며 약 70분 걸립니다.' });
    const result = await h.guide.answerFieldQuestion({ body: { position: {
      lat: 37.5001, lng: 127, accuracy: 12, timestamp: Date.now()
    } } }, `${via}를 통하는 ${subject} 가는 길을 알려줘`);
    const { evidence } = h.models.at(-1).data;
    assert.equal(evidence.routeStatus, 'published_access_overview');
    assert.equal(evidence.route, null);
    assert.equal(evidence.providerReference.shortestRouteVerified, false);
    assert.equal(evidence.accessResearch.paths.length, 1);
    assert.ok(result.text.indexOf(entrance) < result.text.indexOf(via));
    assert.ok(result.text.indexOf(via) < result.text.indexOf(subject));
    assert.doesNotMatch(result.text, /5\.1|70분/);
    if (countryCode === 'US') assert.equal(h.routes.length, 0);
  });
}

test('coarse GPS never creates an entry connector from mere proximity', async () => {
  const quote = '시험입구에서 시험전망대로 이어지는 탐방로입니다.';
  const h = harness({ official: true, subject: '시험전망대', officialBody: quote,
    plan: { ...routePlan, destinationQuery: '시험전망대', searchSubject: '시험전망대', accessResearch: true },
    accessExtraction: { paths: [{ sourceId: 'S1', nodes: ['시험입구', '시험전망대'], entryIndex: 0,
      edges: [{ from: '시험입구', to: '시험전망대', quote }] }] } });
  await h.guide.answerFieldQuestion({ body: { position: { lat: 37.5, lng: 127, accuracy: 120, timestamp: Date.now() } } }, '여기서 시험전망대 어떻게 가?');
  const access = h.models.at(-1).data.evidence.accessResearch;
  assert.equal(h.routes.length, 0);
  assert.equal(access.alignment.approach, 'not_verified');
  assert.equal(access.alignment.connector, null);
  assert.equal(access.alignment.physicalPositionOnTrailVerified, false);
});

test('a user-mentioned missing connection triggers a bounded focused search without changing their position', async () => {
  const h = harness({ official: true, plan: { ...routePlan, viaQuery: '시험후문', accessResearch: true } });
  await h.guide.answerFieldQuestion({ body: {} }, `${topic}는 시험후문을 통해 가는 길이 있어`);
  const { evidence } = h.models.at(-1).data;
  assert.equal(evidence.requestedStart, '');
  assert.equal(evidence.accessResearch.via, '시험후문');
  assert.equal(evidence.accessResearch.selectedPathId, '');
  assert.ok(h.requests.some(value => new URL(value).searchParams.get('query')?.includes('시험후문')));
  assert.equal(h.routes.length, 0);
});

test('route source images reach the extraction model as historical visual context', async () => {
  const quote = '시험입구에서 시험전망대로 이어지는 탐방로입니다.';
  const h = harness({ official: true, subject: '시험전망대', officialBody: `${quote}<img src="/route.png" alt="탐방로 안내도">`,
    plan: { ...routePlan, destinationQuery: '시험전망대', searchSubject: '시험전망대', accessResearch: true },
    accessExtraction: { paths: [{ sourceId: 'S1', nodes: ['시험입구', '시험전망대'],
      edges: [{ from: '시험입구', to: '시험전망대', quote }] }] } });
  const answer = await h.guide.answerFieldQuestion({ body: {} }, '시험전망대 가는 길 알려줘');
  const extraction = h.models.find(row => row.request.systemInstruction.parts[0].text.startsWith('FIELD_ACCESS_EXTRACTION'));
  assert.ok(extraction.request.contents[0].parts.some(part => part.inlineData?.mimeType === 'image/png'));
  assert.ok(extraction.request.contents[0].parts.some(part => /not the user's live view/.test(part.text || '')));
  assert.equal(answer.usage.accessPaths, 1);
  assert.equal(answer.usage.sourceImagesRead, 1);
});

test('a user-named landmark on a published sequence survives missing GPS and does not request an unrelated approach', async () => {
  const quote = '시험입구에서 시험전망대로 이어지는 탐방로입니다.';
  const h = harness({ official: true, subject: '시험전망대', officialBody: quote,
    plan: { ...routePlan, startQuery: '시험입구', destinationQuery: '시험전망대', searchSubject: '시험전망대', accessResearch: true },
    accessExtraction: { paths: [{ sourceId: 'S1', nodes: ['시험입구', '시험전망대'],
      edges: [{ from: '시험입구', to: '시험전망대', quote }] }] } });
  await h.guide.answerFieldQuestion({ body: {} }, '시험입구에서 시험전망대 어떻게 가?');
  const access = h.models.at(-1).data.evidence.accessResearch;
  assert.equal(access.alignment.namedStartOnPublishedSequence, true);
  assert.equal(access.alignment.approach, 'user_named_start_on_published_sequence');
  assert.equal(access.alignment.connector, null);
  assert.equal(h.routes.length, 1); // Original named journey only; no extra approach.
});

test('public article URLs are normalized; credentials, unrelated hosts and non-articles rejected', () => {
  assert.equal(community.articleUrl('http://blog.naver.com/PostView.naver?blogId=walker&logNo=123'), 'https://m.blog.naver.com/walker/123');
  assert.equal(community.articleUrl('https://blog.naver.com/walker?Redirect=Log&logNo=123'), 'https://m.blog.naver.com/walker/123');
  assert.equal(community.articleUrl('https://cafe.naver.com/ArticleRead.nhn?clubid=12&articleid=34'), 'https://m.cafe.naver.com/ca-fe/web/cafes/12/articles/34');
  assert.equal(community.articleUrl('https://example.tistory.com/entry/trail?x=1'), 'https://example.tistory.com/entry/trail');
  for (const url of ['https://127.0.0.1/123', 'https://blog.naver.com.evil.test/a/1', 'https://user:pass@blog.naver.com/a/1',
    'https://blog.naver.com:8443/a/1', 'https://m.blog.naver.com/', 'javascript:alert(1)', 'https://nid.naver.com/login']) {
    assert.equal(community.articleUrl(url), null);
  }
});

test('extracts nested article only, discards script/style and decodes entities', () => {
  const result = community.articleBody(`<div class="post_ct">header${article}<p>footer</p></div>`);
  assert.equal(result, report.description.repeat(3));
  assert.equal(community.articleBody('<div class="se-main-container"><p>truncated'), '');
  assert.equal(community.articleBody('<main>로그인 필요</main>'), '');
  assert.equal(plain('<script>secret()</script><style>bad</style><p>&#54620;&#xAE00;</p>'), '한글');
  assert.equal(community.dateOnly('20260230'), '');
  assert.equal(community.dateOnly('20990101'), '');
  assert.equal(community.dateOnly('20260112'), '2026-01-12');
});

for (const [state, position] of [
  ['unavailable', null],
  ['approximate', { lat: 37.5, lng: 127, accuracy: 95, timestamp: Date.now() }],
  ['stale', { lat: 37.5, lng: 127, accuracy: 10, timestamp: Date.now() - 180000 }]
]) {
  test(`${state} GPS still researches destination; never fabricates a physical start`, async () => {
    const h = harness({ official: true });
    const result = await h.guide.answerRoadviewQuestion({ body: { position } }, `여기서 ${topic} 어떻게 가나요`);
    const { evidence } = h.models.at(-1).data;
    assert.equal(evidence.locationStatus, state);
    assert.equal(evidence.route, null);
    assert.equal(h.routes.length, 0);
    assert.ok(evidence.sources.some(s => s.kind === 'official'));
    assert.ok(evidence.sources.some(s => s.kind === 'community' && s.readStatus === 'article_read'));
    assert.ok(result.sources.some(s => s.title.startsWith('[방문기 · 2026-01-12]')));
    assert.ok(result.usage.communityPagesRead > 0);
    assert.ok(h.requests.some(url => url.includes('/cafearticle?')));
    assert.equal(evidence.sources.filter(s => s.url.includes('/walker/')).length, 1);
    assert.ok(!JSON.stringify(h.logs).includes('37.5'));
    assert.ok(!JSON.stringify(h.logs).includes(topic));
  });
}

test('precise GPS retains verified route while researching mountain access', async () => {
  const h = harness();
  await h.guide.answerRoadviewQuestion({ body: { position: { lat: 37.6, lng: 127.1, accuracy: 12, timestamp: Date.now() } } }, `여기서 ${topic} 어떻게 가나요`);
  assert.equal(h.routes.length, 1);
  assert.equal(h.routes[0].start.lat, 37.6);
  assert.ok(h.models.at(-1).data.evidence.sources.length);
});

test('named origin overrides GPS; failed origin never falls back to physical coordinates', async () => {
  const h = harness({ plan: { ...routePlan, startQuery: '시험공원' } });
  await h.guide.answerRoadviewQuestion({ body: { position: { lat: 37.6, lng: 127.1, accuracy: 12, timestamp: Date.now() } } }, `시험공원에서 ${topic} 어떻게 가나요`);
  assert.equal(h.routes[0].start.title, '시험공원');
  const failed = harness({ placeError: true, plan: { ...routePlan, startQuery: '시험공원' } });
  await failed.guide.answerRoadviewQuestion({ body: { position: { lat: 37.6, lng: 127.1, accuracy: 12, timestamp: Date.now() } } }, `시험공원에서 ${topic} 어떻게 가나요`);
  assert.equal(failed.routes.length, 0);
  assert.ok(failed.models.at(-1).data.evidence.sources.length);
});

test('unreadable/private articles retain labelled public excerpts, never login or claim full reading', async () => {
  for (const options of [{ privatePage: true }, { pageError: true }, { redirect: 'https://127.0.0.1/private' }]) {
    const h = harness(options);
    const result = await h.guide.answerRoadviewQuestion({ body: {} }, `여기서 ${topic} 어떻게 가나요`);
    assert.ok(result.sources.length > 0);
    assert.equal(h.models.at(-1).data.evidence.sources.every(s => !s.content), true);
    assert.ok(h.models.at(-1).data.evidence.sources.every(s => s.readStatus !== 'article_read'));
    assert.ok(!h.requests.some(url => /127\.0\.0\.1|nid\.naver/.test(url)));
  }
});

test('channel permissions failure falls back to public web excerpts and records failure', async () => {
  const h = harness({ searchFailure: true });
  const result = await h.guide.answerRoadviewQuestion({ body: {} }, `여기서 ${topic} 어떻게 가나요`);
  assert.ok(result.sources.length);
  assert.ok(result.usage.communitySearchFailures > 0);
  assert.ok(h.models.at(-1).data.evidence.lookupErrors.some(s => s.includes('권한')));
});

test('no usable evidence returns honest failure without calling answer model', async () => {
  const h = harness({ noSources: true, placeError: true });
  const result = await h.guide.answerRoadviewQuestion({ body: {} }, `여기서 ${topic} 어떻게 가나요`);
  assert.equal(h.models.length, 1); // Planner only, no unsupported answer synthesis.
  assert.equal(result.sources.length, 0);
  assert.match(result.text, /확인하지 못|정확한 이름/);
});

test('subway procedures do not use visitor reports; trusted instructions remain isolated', async () => {
  const h = harness({ noSources: true, plan: { task: 'information', environment: 'subway_inside', query: '서울역 기후동행카드 충전' } });
  await h.guide.answerRoadviewQuestion({ body: {} }, '서울역에서 기후동행카드 충전 어떻게 해요');
  assert.equal(h.requests.some(url => /\/(?:blog|cafearticle)\?/.test(url)), false);
});

test('foreign-language and fork follow-ups preserve user history for planning', async () => {
  const h = harness({ plan: { task: 'information', environment: 'mountain', query: `${topic} 시험공원 데크 입구`, searchSubject: topic } });
  await h.guide.answerRoadviewQuestion({ body: { history: [{ role: 'user', text: `I am at the deck entrance of ${topic}.` }] } }, 'Which path should I take?');
  assert.equal(h.models[0].data.history.length, 1);
  assert.ok(h.models.at(-1).data.evidence.sources.length);
  const instruction = h.models.at(-1).request.systemInstruction.parts[0].text;
  assert.match(instruction, /UNTRUSTED DATA/);
  assert.match(instruction, /never splice/i);
  assert.match(instruction, /only the snippet was read/);
});

// These are controlled fixtures for the reported questions, NOT real trail data.
const fieldQuestions = [
  { message: '여기서 용마산 스카이워크 어떻게 가?', destination: '용마산 스카이워크' },
  { message: '여기서 망우역사문화공원 어떻게 가?', destination: '망우역사문화공원' },
  { message: '면목동 아토피 체험의 숲에서 용마산 스카이워크 어떻게 가?',
    destination: '용마산 스카이워크', origin: '면목동 아토피 체험의 숲' }
];
for (const question of fieldQuestions) {
  for (const state of ['precise', 'approximate', 'unavailable', 'stale']) {
    test(`field GPS matrix / ${state} / ${question.message}`, async () => {
      const position = state === 'unavailable' ? null : {
        lat: 37.6, lng: 127.1, accuracy: state === 'approximate' ? 95 : 12,
        timestamp: Date.now() - (state === 'stale' ? 180000 : 0),
        areas: ['서울특별시 중랑구 면목동']
      };
      const h = harness({ official: true, subject: question.destination,
        plan: { ...routePlan, destinationQuery: question.destination, searchSubject: question.destination,
          startQuery: question.origin || '' } });
      const result = await h.guide.answerRoadviewQuestion({ body: { position } }, question.message);
      const evidence = h.models.at(-1).data.evidence;
      assert.equal(evidence.locationStatus, state);
      assert.equal(evidence.requestedStart, question.origin || '');
      assert.equal(h.routes.length, Number(Boolean(question.origin) || state === 'precise'));
      if (question.origin) assert.equal(h.routes[0].start.title, question.origin);
      assert.ok(evidence.sources.length > 0);
      assert.ok(result.usage.communitySearchCalls > 0);
      assert.equal(result.usage.destinationLookupSucceeded, 1);
      if (!question.origin && ['precise', 'approximate'].includes(state)) {
        assert.ok(h.requests.some(url => decodeURIComponent(url.replace(/\+/g, ' ')).includes('면목동')));
      } else {
        assert.deepEqual(Array.from(evidence.areaHints), []);
      }
      const logged = JSON.stringify(h.logs);
      for (const privateValue of ['37.6', '127.1', '면목동', question.destination, question.message]) {
        assert.equal(logged.includes(privateValue), false, `logs leaked ${privateValue}`);
      }
    });
  }
}

test('named origin beats a planner omission; failed named origin cannot use precise GPS', async () => {
  const q = fieldQuestions[2];
  const h = harness({ subject: q.destination, failOrigin: q.origin,
    plan: { ...routePlan, startQuery: '', destinationQuery: q.destination } });
  await h.guide.answerRoadviewQuestion({ body: {
    position: { lat: 37.6, lng: 127.1, accuracy: 10, timestamp: Date.now() }
  } }, q.message);
  assert.equal(h.routes.length, 0);
  const evidence = h.models.at(-1).data.evidence;
  assert.equal(evidence.originStatus, 'unresolved');
  assert.equal(evidence.requestedStart, q.origin);
  assert.ok(evidence.sources.length);
});

test('here cannot inherit an old start from the planner/history', async () => {
  const h = harness({ plan: { ...routePlan, startQuery: '이전 출발지' } });
  await h.guide.answerRoadviewQuestion({ body: {} }, `여기서 ${topic} 어떻게 가?`);
  assert.equal(h.routes.length, 0);
  assert.equal(h.models.at(-1).data.evidence.requestedStart, '');
});

test('a lone unrelated convenience store is not accepted as the requested landmark', async () => {
  const h = harness({ unrelatedPlace: 'CU 시험점' });
  const result = await h.guide.answerRoadviewQuestion({ body: {
    position: { lat: 37.6, lng: 127.1, accuracy: 10, timestamp: Date.now() }
  } }, `여기서 ${topic} 어떻게 가?`);
  assert.equal(h.routes.length, 0);
  assert.equal(result.usage.destinationLookupSucceeded, 0);
  assert.equal(h.models.at(-1).data.evidence.placeStatus, 'unresolved');
});

test('route failure still researches access and blocks unsupported distance/time/turns', async () => {
  const h = harness({ routeError: true, official: true,
    answer: '현재 위치에서 5.5km, 70분입니다. 왼쪽으로 가세요.' });
  const result = await h.guide.answerRoadviewQuestion({ body: {
    position: { lat: 37.6, lng: 127.1, accuracy: 10, timestamp: Date.now() },
    history: [{ role: 'assistant', text: '5.5km, 70분입니다.' }]
  } }, `여기서 ${topic} 어떻게 가?`);
  assert.equal(result.usage.routeLookupFailed, 1);
  assert.equal(result.usage.unverifiedAnswerBlocked, 1);
  assert.equal(h.models.at(-1).data.evidence.routeStatus, 'failed');
  assert.ok(result.sources.length);
  assert.doesNotMatch(result.text, /5\.5|70분|왼쪽으로/);
});

test('accuracy boundary: 50m can route; 51m is regional research only; huge/stale fixes supply no area', async () => {
  for (const [accuracy, age, routeCount, areaCount] of [[50, 0, 1, 1], [51, 0, 0, 1],
    [2001, 0, 0, 0], [10, 180000, 0, 0], [-1, 0, 0, 0]]) {
    const h = harness();
    await h.guide.answerRoadviewQuestion({ body: { position: {
      lat: 37.6, lng: 127.1, accuracy, timestamp: Date.now() - age,
      areas: ['서울특별시 중랑구 면목동']
    } } }, `여기서 ${topic} 어떻게 가?`);
    assert.equal(h.routes.length, routeCount);
    assert.equal(h.models.at(-1).data.evidence.areaHints.length, areaCount);
  }
});

test('subway indoor GPS never establishes a floor/platform or outdoor walking route', async () => {
  const h = harness({ noSources: true, plan: { task: 'information', environment: 'subway_inside',
    query: '사가정역 출구 안내', searchSubject: '사가정역' } });
  await h.guide.answerRoadviewQuestion({ body: { position: {
    lat: 37.6, lng: 127.1, accuracy: 10, timestamp: Date.now(),
    areas: ['서울특별시 중랑구 면목동']
  } } }, '사가정역 안인데 출구로 어떻게 가?');
  assert.equal(h.routes.length, 0);
});

test('a clear mountain destination still gets researched when the planner asks only for GPS', async () => {
  const h = harness({ subject: '용마산 스카이워크',
    plan: { task: 'clarify', clarification: '현재 위치를 알려 주세요.', replyLanguage: 'ko' } });
  const result = await h.guide.answerRoadviewQuestion({ body: {} }, '여기서 용마산 스카이워크 어떻게 가?');
  assert.ok(result.sources.length > 0);
  assert.equal(h.routes.length, 0);
  assert.ok(result.usage.webSearchCalls > 0);
});

test('unverified article turns are removed while named access overviews remain', async () => {
  const h = harness({ answer: '방문기에는 시험공원에서 데크길을 잇는 코스가 소개됩니다. 오른쪽 길로 이동하면 됩니다. 표지판 이름을 알려 주세요.' });
  const result = await h.guide.answerRoadviewQuestion({ body: {} }, `여기서 ${topic} 어떻게 가?`);
  assert.match(result.text, /자료에 소개된 접근 경로/);
  assert.match(result.text, /시험공원에서 데크길/);
  assert.doesNotMatch(result.text, /오른쪽/);
});

test('generic city destination uses the common planner and web evidence even when TMAP succeeds', async () => {
  const h = harness({ official: true, category: '교육>도서관', subject: '시험도서관', plan: {
    task: 'route', environment: 'outdoor', startQuery: '', destinationQuery: '시험도서관',
    mode: 'walk', searchSubject: '시험도서관', replyLanguage: 'ko'
  } });
  const result = await h.guide.answerFieldQuestion({ body: { position: {
    lat: 37.6, lng: 127.1, accuracy: 12, timestamp: Date.now()
  } } }, '여기서 시험도서관 어떻게 가?');
  assert.equal(h.routes.length, 1);
  assert.ok(result.usage.webSearchCalls > 0);
  assert.ok(h.models.at(-1).data.evidence.sources.length);
  assert.equal(h.models.length, 2);
});

test('city-route TMAP failure continues official and permitted visitor searches', async () => {
  const h = harness({ official: true, routeError: true, subject: '시험도서관', plan: {
    task: 'route', environment: 'outdoor', destinationQuery: '시험도서관', mode: 'walk'
  } });
  const result = await h.guide.answerFieldQuestion({ body: { position: {
    lat: 37.6, lng: 127.1, accuracy: 12, timestamp: Date.now()
  } } }, '여기서 시험도서관 어떻게 가?');
  assert.equal(h.models.at(-1).data.evidence.routeStatus, 'failed');
  assert.ok(result.sources.length);
  assert.ok(result.usage.communitySearchCalls > 0);
});

test('a failed named-place lookup does not terminate internet research', async () => {
  const h = harness({ official: true, placeError: true, plan: {
    task: 'place', environment: 'outdoor', destinationQuery: topic, searchSubject: topic
  } });
  const result = await h.guide.answerFieldQuestion({ body: {} }, `${topic} 입구 위치를 알려줘`);
  assert.equal(h.models.at(-1).data.evidence.placeStatus, 'unresolved');
  assert.ok(result.sources.length);
});

test('selected route preview reaches both model stages but cannot establish the physical start', async () => {
  const h = harness({ official: true });
  await h.guide.answerFieldQuestion({ body: { position: null, context: {
    start: '이전 출발지', destination: topic, routeVerified: true, routeText: '이전 경로는 7분입니다.',
    panoramaPosition: { lat: 1, lng: 2 }
  } } }, `여기서 ${topic} 어떻게 가?`);
  assert.equal(h.routes.length, 0);
  const evidence = h.models.at(-1).data.evidence;
  assert.equal(evidence.locationStatus, 'unavailable');
  assert.equal(evidence.selectedRoute.start, '이전 출발지');
  assert.equal(evidence.selectedRoute.panoramaPosition, undefined);
  assert.match(evidence.selectedRoute.basis, /not_physical_location/);
  assert.equal(h.models[0].data.selectedRoute.routeText, '이전 경로는 7분입니다.');
});

test('overseas station uses approved local official material without claiming TMAP coverage or indoor floor', async () => {
  const h = harness({ official: true, subject: '試験駅', officialUrl: 'https://www.tokyometro.jp/fixture', plan: {
    task: 'information', environment: 'subway_inside', searchSubject: '試験駅',
    query: '試験駅 案内', countryCode: 'JP', searchLanguage: 'ja', replyLanguage: 'ja'
  } });
  const result = await h.guide.answerFieldQuestion({ body: { position: {
    lat: 35.6, lng: 139.7, accuracy: 120, timestamp: Date.now(),
    areas: ['東京都 千代田区'], countryCode: 'JP'
  } } }, '試験駅の中です。出口はどこですか');
  const evidence = h.models.at(-1).data.evidence;
  assert.equal(evidence.providers.countryCode, 'JP');
  assert.equal(evidence.routeStatus, 'unsupported_region');
  assert.equal(evidence.placeStatus, 'unsupported_region');
  assert.equal(evidence.locationStatus, 'approximate');
  assert.deepEqual(Array.from(evidence.areaHints), ['東京都 千代田区']);
  assert.equal(h.routes.length, 0);
  assert.ok(result.sources.some(source => source.url.includes('tokyometro.jp')));
  assert.match(h.models.at(-1).request.systemInstruction.parts[0].text, /GPS does not prove which floor/);
  assert.ok(!JSON.stringify(h.logs).includes('139.7'));
});

test('general discussion and translation preserve conversation behavior without internet lookup', async () => {
  for (const message of ['오늘 고생했다', '시험공원으로 가세요를 영어로 번역해줘']) {
    const h = harness({ plan: { task: 'conversation', environment: 'general', replyLanguage: 'ko' },
      answer: '대화 또는 번역 답변' });
    const result = await h.guide.answerFieldQuestion({ body: {} }, message);
    assert.equal(result.text, '대화 또는 번역 답변');
    assert.equal(h.routes.length, 0);
    assert.equal(result.usage.webSearchCalls, 0);
    assert.equal(h.requests.some(url => url.includes('naverapihub')), false);
  }
});

test('the old and new exported engine names are the same function', () => {
  const h = harness();
  assert.equal(h.guide.answerFieldQuestion, h.guide.answerRoadviewQuestion);
});
