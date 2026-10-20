// Providers are selected by regional capability, never by a particular facility.
// Web search may still find public information outside a coordinate provider's coverage.
const governmentDomains = ['go.kr', 'go.jp', 'gov', 'gov.uk', 'gov.au', 'govt.nz',
  'gov.sg', 'gov.hk', 'gov.tw', 'gov.in', 'gouv.fr', 'gob.es', 'gc.ca', 'gov.br'];
const operatorDomains = [
  'knps.or.kr', 'kric.go.kr', 'seoulmetro.co.kr', 'korail.com', 'letskorail.com',
  'arex.or.kr', 'metro9.co.kr', 'shinbundang.co.kr', 'humetro.busan.kr',
  'dtro.or.kr', 'dtro.co.kr', 'ictr.or.kr', 'djtc.kr', 'grtc.co.kr',
  'airport.kr', 'gimpoairport.co.kr', 'tokyometro.jp', 'jreast.co.jp',
  'nationalrail.co.uk', 'networkrail.co.uk', 'mta.info', 'wmata.com',
  'ratp.fr', 'sncf.com', 'bahn.de'
];

function countryCode(value) {
  return typeof value === 'string' && /^[a-z]{2}$/i.test(value.trim()) ? value.trim().toUpperCase() : '';
}

function sourcePolicy(value = {}) {
  const country = countryCode(value.countryCode);
  const domesticOrUnknown = !country || country === 'KR';
  return { countryCode: country || 'unknown', countryBasis: 'regional_search_hint_only',
    webProvider: 'naver-web', placeProvider: domesticOrUnknown ? 'naver-local' : 'unavailable',
    routeProvider: domesticOrUnknown ? 'tmap' : 'unavailable',
    searchLanguage: /^[a-z]{2,3}$/i.test(value.searchLanguage || '')
      ? value.searchLanguage.toLowerCase() : domesticOrUnknown ? 'ko' : 'en',
    communityProviders: ['naver-blog', 'naver-cafe', 'tistory-public'],
    geographicCoverageVerified: false };
}

function officialHost(host) {
  const configured = String(process.env.FIELD_GUIDE_OFFICIAL_DOMAINS || '').split(',')
    .map(value => value.trim().toLowerCase()).filter(value =>
      /^(?:[a-z][a-z0-9-]*\.)+[a-z]{2,}$/.test(value)
      && !/(?:^|\.)(?:localhost|local|internal|test|example|invalid)$/.test(value));
  return [...governmentDomains, ...operatorDomains, ...configured]
    .some(domain => host === domain || host.endsWith(`.${domain}`));
}

function accessTerms(language = 'ko') {
  const terms = { ko: { access: '가는 길', directions: '찾아가기', information: '안내', official: '공식', region: '접근 경로' },
    ja: { access: 'アクセス', directions: '行き方', information: '案内', official: '公式', region: 'アクセス' },
    zh: { access: '路线', directions: '怎么去', information: '指南', official: '官方', region: '路线' },
    en: { access: 'access route', directions: 'directions', information: 'information', official: 'official', region: 'access route' } };
  return terms[language] || terms.en;
}

module.exports = { sourcePolicy, officialHost, accessTerms, countryCode };
