const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePaths, comparePaths, selectPath, providerAssessment, focusFromUser } = require('../lib/field-access');
const { answerEvidence, retainPublishedSequence } = require('../lib/field-access-research');
const { articleImages, imageUrl, sourceImageParts } = require('../lib/field-source-media');
const { accessExcerpt } = require('../lib/roadview-source-text');

const content = '시험입구에서 솔바람데크로 이어집니다. 솔바람데크를 따라 시험전망대에 도착합니다.';
const path = { sourceId: 'S1', nodes: ['시험입구', '솔바람데크', '시험전망대'], entryIndex: 0,
  edges: [{ from: '시험입구', to: '솔바람데크', quote: '시험입구에서 솔바람데크로 이어집니다.' },
    { from: '솔바람데크', to: '시험전망대', quote: '솔바람데크를 따라 시험전망대에 도착합니다.' }] };
const source = { id: 'S1', kind: 'official', url: 'https://fixture.go.kr/a', content };

test('every published edge needs a literal connecting quote from one read source', () => {
  const good = validatePaths({ paths: [path] }, [source], '시험전망대');
  assert.equal(good.length, 1); assert.equal(good[0].geometry, 'not_available');
  for (const invalid of [
    { ...path, sourceId: 'missing' }, { ...path, nodes: ['가짜입구', '솔바람데크', '시험전망대'] },
    { ...path, edges: path.edges.slice(0, 1) },
    { ...path, edges: [{ ...path.edges[0], quote: '시험입구에서 솔바람데크로 가는 지름길입니다.' }, path.edges[1]] }
  ]) assert.equal(validatePaths({ paths: [invalid] }, [source], '시험전망대').length, 0);
  assert.equal(validatePaths({ paths: [path] }, [{ ...source, kind: 'community', readStatus: 'excerpt_only' }], '시험전망대').length, 0);
  assert.equal(validatePaths({ paths: [path] }, [source], '다른목적지').length, 0);
});

test('adjacent paragraph references are grounded in bounded contiguous source spans, never across omitted text', () => {
  const body = '시험입구에 도착합니다. 이후 숲길을 따라 올라갑니다. 시험전망대가 나타납니다.';
  const raw = { paths: [{ sourceId: 'S1', nodes: ['시험입구', '시험전망대'], edges: [{ from: '시험입구', to: '시험전망대',
    fromQuote: '시험입구에 도착합니다.', toQuote: '시험전망대가 나타납니다.', connectionQuote: '이후 숲길을 따라 올라갑니다.' }] }] };
  assert.equal(validatePaths(raw, [{ ...source, content: body }], '시험전망대').length, 1);
  assert.equal(validatePaths(raw, [{ ...source, content: body.replace('이후', '[중략] 이후') }], '시험전망대').length, 0);
  const diagnostics = {};
  assert.equal(validatePaths(raw, [{ ...source, content: body.replace('올라갑니다', '내려갑니다') }], '시험전망대', diagnostics).length, 0);
  assert.equal(diagnostics.edgeGrounding, 1);
  const overlapping = structuredClone(raw);
  overlapping.paths[0].edges[0] = { from: '시험입구', to: '시험전망대',
    fromQuote: '시험입구에서 시험전망대로', toQuote: '시험전망대로', connectionQuote: '이어집니다.' };
  assert.equal(validatePaths(overlapping, [{ ...source, content: '시험입구에서 시험전망대로 이어집니다.' }], '시험전망대').length, 1);
});

test('numbered source blocks generate the actual quotation server-side and reject invented or blocked references', () => {
  const raw = { paths: [{ sourceId: 'S1', nodes: ['시험입구', '시험전망대'], entryIndex: 0,
    edges: [{ from: '시험입구', to: '시험전망대', fromBlock: 'B1', toBlock: 'B1', connectionBlock: 'B1' }] }] };
  const body = '시험입구에서 숲길을 따라 시험전망대로 이어집니다.';
  const [actual] = validatePaths(raw, [{ ...source, content: body }], '시험전망대');
  assert.equal(actual.edges[0].quote, body);
  assert.equal(actual.edges[0].grounding, 'numbered_contiguous_source_blocks');
  const invalid = structuredClone(raw); invalid.paths[0].edges[0].toBlock = 'B99';
  assert.equal(validatePaths(invalid, [{ ...source, content: body }], '시험전망대').length, 0);
  assert.equal(validatePaths(raw, [{ ...source, content: body + ' 현재 출입 금지입니다.' }], '시험전망대').length, 0);
});

test('a sign naming a future junction is not treated as an arrival before intervening landmarks', () => {
  const body = '시험입구에서 순환삼거리 방향으로 갑니다. 명상쉼터를 지나면 순환삼거리와 연결됩니다. 이후 시험전망대에 도착합니다.';
  const make = nodes => ({ paths: [{ sourceId: 'S1', nodes,
    edges: nodes.slice(0, -1).map((from, i) => ({ from, to: nodes[i + 1], fromBlock: 'B1', toBlock: 'B1', connectionBlock: 'B1' })) }] });
  assert.equal(validatePaths(make(['시험입구', '명상쉼터', '순환삼거리', '시험전망대']), [{ ...source, content: body }], '시험전망대').length, 1);
  assert.equal(validatePaths(make(['시험입구', '순환삼거리', '명상쉼터', '시험전망대']), [{ ...source, content: body }], '시험전망대').length, 0);
});

test('agreements and conflicts stay separate; same author cannot corroborate themselves', () => {
  const [a] = validatePaths({ paths: [path] }, [source], '시험전망대');
  const b = { ...a, id: 'P2', sourceId: 'S2', sourceUrl: 'https://m.blog.naver.com/other/100', sourceKind: 'community' };
  assert.equal(comparePaths([a, b]).agreements.length, 2);
  assert.equal(comparePaths([b, { ...b, id: 'P3', sourceId: 'S3', sourceUrl: 'https://m.blog.naver.com/other/101' }]).agreements.length, 0);
  const reversed = { ...b, edges: [{ from: '솔바람데크', to: '시험입구' }] };
  const comparison = comparePaths([a, reversed]);
  assert.equal(comparison.conflicts.length, 1);
  assert.equal(selectPath([a, reversed], { comparison }), null);
});

test('user via is only a search preference and must occur in user turns', () => {
  assert.equal(focusFromUser({ viaQuery: '솔바람데크' }, '그 길로 알려줘', [{ role: 'assistant', text: '솔바람데크' }]), '');
  assert.equal(focusFromUser({ viaQuery: '솔바람데크' }, '그 길로 알려줘', [{ role: 'user', text: '솔바람데크로 가고 싶어' }]), '솔바람데크');
});

test('provider distance ratio is a research signal, never proof of a shorter connection', () => {
  const assessment = providerAssessment({ start: { lat: 35, lng: 129 }, destination: { lat: 35.005, lng: 129 }, distanceMeters: 5100 },
    [{ coordinates: Array.from({ length: 800 }, (_, i) => [129, 35 + i / 100000]) }]);
  assert.equal(assessment.investigateAlternatives, true);
  assert.equal(assessment.shortestRouteVerified, false);
  assert.equal(assessment.alternativeConnectionsVerified, false);
  assert.ok(assessment.sourceGeometry.length <= 180);
});

test('published access answer input excludes unrelated TMAP totals, turns and old preview text', () => {
  const actual = answerEvidence({ route: { mode: 'walk', distanceMeters: 5100, totalSeconds: 4000, directions: ['우회도로'] },
    routeStatus: 'verified', selectedRoute: { routeText: '5.1km 우회', basis: 'preview' },
    accessResearch: { selectedPathId: 'P1', alignment: { remainingNodes: ['시험입구', '시험전망대'],
      connector: { from: 'GPS', to: '시험입구', distanceMeters: 200, route: { directions: ['우회'] } } } } });
  assert.equal(actual.route, null); assert.equal(actual.routeStatus, 'published_access_overview');
  assert.ok(!JSON.stringify(actual).includes('5100')); assert.ok(!JSON.stringify(actual).includes('우회'));
  assert.equal(actual.providerReference.shortestRouteVerified, false);
});

test('access excerpts merge overlapping route paragraphs and prioritize the user landmark', () => {
  const text = '소개 '.repeat(2500) + '솔바람데크 ' + content + ' 후기'.repeat(1000);
  const excerpt = accessExcerpt(text, '시험전망대', '솔바람데크');
  assert.ok(excerpt.includes(content)); assert.ok(excerpt.length < 7100);
});

test('missing or conflicting source connections never fall back to an unrelated provider answer', () => {
  const missing = { accessResearch: { via: '시험후문', comparison: { conflicts: [] } } };
  assert.match(retainPublishedSequence('5.1km를 걸으세요', missing, 'ko'), /연속된 접근 구간을 확인하지 못했습니다/);
  assert.doesNotMatch(retainPublishedSequence('5.1km', missing, 'ko'), /5\.1/);
  const conflicts = { accessResearch: { comparison: { conflicts: [{}] } } };
  assert.match(retainPublishedSequence('우회 경로입니다', conflicts, 'ko'), /연결 순서가 달라/);
});

test('published guidance renders only the checked sequence even when prose inserts an extra landmark', () => {
  const evidence = { accessResearch: { selectedPathId: 'P1', alignment: {
    remainingNodes: ['시험입구', '명상쉼터', '시험전망대'], namedStartOnPublishedSequence: true } } };
  const actual = retainPublishedSequence('시험입구에서 순환삼거리를 먼저 거쳐 명상쉼터에서 시험전망대로 가세요.', evidence, 'ko');
  assert.match(actual, /시험입구 → 명상쉼터 → 시험전망대/);
  assert.doesNotMatch(actual, /순환삼거리/);
  assert.match(actual, /말씀하신 출발 지점 기준/);
});

test('public source images restrict hosts, relevant captions and valid binary content', async () => {
  assert.equal(imageUrl('http://fixture.go.kr/map.jpg', source.url), null);
  assert.equal(imageUrl('https://127.0.0.1/map.jpg', source.url), null);
  assert.equal(imageUrl('https://fixture.go.kr.evil.test/map.jpg', source.url), null);
  const images = articleImages('<img src="/map.jpg" alt="탐방로 안내도"><img src="/ad.jpg" alt="advertisement">', source.url);
  assert.equal(images.length, 1); assert.equal(images[0].url, 'https://fixture.go.kr/map.jpg');
  const before = global.fetch;
  try {
    global.fetch = async () => new Response('<html>not image</html>', { headers: { 'content-type': 'image/png' } });
    const stats = {};
    assert.deepEqual(await sourceImageParts([{ ...source, images }], stats), []);
    assert.equal(stats.sourceImageFailures, 1);
  } finally { global.fetch = before; }
});
