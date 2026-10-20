const test = require('node:test');
const assert = require('node:assert/strict');
const { sourcePolicy, officialHost, accessTerms, countryCode } = require('../lib/field-source-policy');

test('provider capability varies by region while web research remains available', () => {
  assert.equal(sourcePolicy({ countryCode: 'KR' }).routeProvider, 'tmap');
  const foreign = sourcePolicy({ countryCode: 'JP', searchLanguage: 'ja' });
  assert.equal(foreign.routeProvider, 'unavailable');
  assert.equal(foreign.placeProvider, 'unavailable');
  assert.equal(foreign.webProvider, 'naver-web');
  assert.equal(foreign.searchLanguage, 'ja');
  assert.equal(sourcePolicy().countryCode, 'unknown');
  assert.equal(sourcePolicy().geographicCoverageVerified, false);
  assert.equal(countryCode(' jp '), 'JP'); assert.equal(countryCode('JP<script>'), '');
});

test('official domains allow known public institutions and reject unrelated or forged hosts', () => {
  for (const host of ['mediahub.seoul.go.kr', 'www.nps.gov', 'tfl.gov.uk', 'www.tokyometro.jp']) {
    assert.equal(officialHost(host), true);
  }
  for (const host of ['127.0.0.1', 'localhost', 'evil.go.kr.example.com', 'blog.naver.com', 'tokyometro.jp.evil.com']) {
    assert.equal(officialHost(host), false);
  }
});

test('regional operators can be configured without changing core guide flow', () => {
  const previous = process.env.FIELD_GUIDE_OFFICIAL_DOMAINS;
  try {
    process.env.FIELD_GUIDE_OFFICIAL_DOMAINS = ' transit.example.org,127.0.0.1,localhost,https://evil.test,internal.test';
    assert.equal(officialHost('transit.example.org'), true);
    assert.equal(officialHost('www.transit.example.org'), true);
    assert.equal(officialHost('internal.test'), false);
    assert.equal(officialHost('127.0.0.1'), false);
  } finally {
    if (previous === undefined) delete process.env.FIELD_GUIDE_OFFICIAL_DOMAINS;
    else process.env.FIELD_GUIDE_OFFICIAL_DOMAINS = previous;
  }
});

test('search helpers keep local-language queries separate from the answer language', () => {
  assert.equal(accessTerms('ja').directions, '行き方');
  assert.equal(accessTerms('ko').access, '가는 길');
  assert.equal(accessTerms('zh').official, '官方');
  assert.equal(accessTerms('fr').access, 'access route');
});
