const test = require('node:test');
const assert = require('node:assert/strict');
const { selectPath, focusFromUser, landmarkName } = require('../lib/field-access');
const { researchAccess, retainPublishedSequence } = require('../lib/field-access-research');
const { fieldAction } = require('../lib/field-access-action');

const nodes = ['시험입구', '솔바람데크', '시험전망대'];
const candidate = (id, sequence = nodes) => ({ id, nodes: sequence, sourceId: 'S1', sourceKind: 'official',
  sourceUrl: 'https://fixture.go.kr/trail', entryIndex: 0, edges: sequence.slice(0, -1).map((from, i) => ({ from, to: sequence[i + 1] })) });
const evidence = () => ({ environment: 'mountain', requestedStart: '', accessResearch: {
  paths: [candidate('P1')], comparison: { conflicts: [] }, selectedPathId: 'P1', via: '',
  alignment: { remainingNodes: nodes, approach: 'not_verified', namedStartOnPublishedSequence: false } } });

test('an explicit waypoint or origin cannot be replaced by another official entrance', () => {
  const other = candidate('P1', ['다른공원', '시험전망대']);
  assert.equal(selectPath([other], { via: '솔바람데크' }), null);
  assert.equal(selectPath([other], { origin: '시험입구' }), null);
  assert.equal(selectPath([other, candidate('P2')], { via: '솔바람데크' }).id, 'P2');
  assert.equal(selectPath([candidate('P2')], { origin: '솔바람데크', via: '시험입구' }), null);
});

test('a fastest follow-up keeps the user waypoint; a new trip or cancellation clears it', () => {
  const history = [{ role: 'user', text: '여기서 시험전망대 어떻게 가?' },
    { role: 'user', text: '솔바람데크를 통해 가는 길로 알려줘' },
    { role: 'assistant', text: '다른공원으로 가세요.' }];
  assert.equal(focusFromUser({ destinationQuery: '시험전망대' }, '여기서 시험전망대 가는 제일 빠른 길 추천해줘', history), '솔바람데크');
  assert.equal(focusFromUser({ destinationQuery: '시험도서관' }, '여기서 시험도서관 어떻게 가?', history), '');
  assert.equal(focusFromUser({ viaQuery: '솔바람데크' }, '경유 없이 알려줘', history), '');
  assert.equal(focusFromUser({}, '그 다음은?', [{ role: 'assistant', text: '가짜입구를 통해 가세요' }]), '');
  assert.equal(landmarkName('시험대학교 뒤에 있는 솔바람공원'), '솔바람공원');
});

test('verified road approach is the first action, with metrics restricted to the entrance', () => {
  const e = evidence();
  Object.assign(e.accessResearch.alignment, { approach: 'provider_approach_to_entry_found',
    connector: { endpointMatch: true, scope: 'origin_to_entry_only_not_entire_trail', distanceMeters: 180, totalSeconds: 150 } });
  const reply = retainPublishedSequence('5.1km 70분 우회. 시험입구 → 솔바람데크 → 시험전망대', e, 'ko');
  assert.match(reply, /^먼저 ‘시험입구’ 입구까지 도보 약 3분, 180m/);
  assert.match(reply, /입구까지만/);
  assert.doesNotMatch(reply, /5\.1|70분|→|우회/);
  assert.equal(fieldAction(e).kind, 'approach_verified_entrance');
});

test('unmatched endpoints cannot produce road distance or time in the action answer', () => {
  const e = evidence();
  Object.assign(e.accessResearch.alignment, { approach: 'provider_approach_to_entry_found',
    connector: { endpointMatch: false, scope: 'origin_to_entry_only_not_entire_trail', distanceMeters: 180, totalSeconds: 150 } });
  const reply = retainPublishedSequence('약 3분 180m입니다', e, 'ko');
  assert.doesNotMatch(reply, /180|3분/);
  assert.match(reply, /이정표에 적힌 지명/);
});

test('fastest-route request compares only eligible candidates and does not declare an unmeasured winner', () => {
  const e = evidence();
  e.accessResearch.via = '솔바람데크';
  e.accessResearch.paths.push(candidate('P2', ['시험입구', '솔바람데크', '참나무쉼터', '시험전망대']),
    candidate('P3', ['다른공원', '시험전망대']));
  const request = { question: '여기서 제일 빠른 길 추천해줘', history: [{ role: 'assistant', text: nodes.join(' → ') }] };
  const state = fieldAction(e, request);
  assert.equal(state.candidateCount, 2); assert.equal(state.fastestVerified, false);
  const reply = retainPublishedSequence(nodes.join(' → '), e, 'ko', request);
  assert.match(reply, /후보 2개를 대조했지만/);
  assert.match(reply, /가장 빠른 경로는 확정할 수 없습니다/);
  assert.doesNotMatch(reply, /→|다른공원/);
});

test('next step advances from a user-confirmed intermediate point without replaying the origin', () => {
  const e = evidence();
  e.requestedStart = '솔바람데크';
  e.accessResearch.alignment = { remainingNodes: ['솔바람데크', '시험전망대'],
    namedStartOnPublishedSequence: true, approach: 'user_named_start_on_published_sequence' };
  const reply = retainPublishedSequence(nodes.join(' → '), e, 'ko', { question: '솔바람데크에 도착했어. 다음은?',
    history: [{ role: 'assistant', text: '시험입구에서 시작하세요.' }] });
  assert.match(reply, /다음.*시험전망대/); assert.doesNotMatch(reply, /시험입구|→/);
  assert.equal((reply.match(/\?/g) || []).length, 1);
});

test('full sequence is shown only when an overview is explicitly requested', () => {
  const e = evidence();
  assert.doesNotMatch(retainPublishedSequence('', e, 'ko', { question: '어떻게 가?' }), /→/);
  assert.match(retainPublishedSequence('', e, 'ko', { question: '전체 경로 순서를 알려줘' }), /시험입구 → 솔바람데크 → 시험전망대/);
});

test('targeted new sources survive the source cap and become eligible after a constrained re-search', async () => {
  const body = '지정입구에서 시험전망대로 이어집니다.';
  const e = { environment: 'mountain', requestedDestination: '시험전망대', requestedStart: '', lookupErrors: [],
    sources: Array.from({ length: 11 }, (_, i) => ({ kind: 'official', url: `https://fixture.go.kr/old${i}`, content: '다른공원에서 시험전망대로 이어집니다.' })) };
  const stats = {};
  await researchAccess({ req: {}, message: '지정입구를 통해 가줘', history: [], plan: {}, via: '지정입구',
    location: {}, evidence: e, stats,
    model: async (_req, _instruction, input) => {
      const target = input.sources.find(source => source.url.endsWith('/target'));
      return { paths: target ? [{ sourceId: target.id, nodes: ['지정입구', '시험전망대'],
        edges: [{ from: '지정입구', to: '시험전망대', quote: body }] }] : [] };
    }, moreSources: async () => ({ sources: [{ kind: 'official', url: 'https://fixture.go.kr/target', content: body }], errors: [] }),
    resolvePlace: async () => ({}), walkRoute: async () => { throw new Error('unverified origin must not route'); } });
  assert.equal(stats.accessFocusedSearches, 1); assert.equal(stats.accessSelected, 1);
  assert.equal(e.sources[0].url, 'https://fixture.go.kr/target');
  assert.deepEqual(e.accessResearch.alignment.remainingNodes, ['지정입구', '시험전망대']);
});
