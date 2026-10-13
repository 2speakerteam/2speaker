const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/main.js'), 'utf8');
const styles = fs.readFileSync(require.resolve('../src/styles.css'), 'utf8');
new Function(source.replace(/^import\s+\{[^}]+\}\s+from\s+['"]\.\/walking-preview\.mjs['"];?\s*/m, ''));

const detailsSource = source.slice(source.indexOf('function fastestTransitItinerary'), source.indexOf('function transportText'));
assert.ok(detailsSource.startsWith('function fastestTransitItinerary'));
let visualInPanel = false;
const visual = {};
const detailHeader = { after(node) { assert.equal(node, visual); visualInPanel = true; } };
const guideHeader = { after(node) { assert.equal(node, visual); visualInPanel = false; } };
const panel = { hidden: true, innerHTML: '', replaceChildren() { this.innerHTML = ''; },
  querySelector(selector) { return selector === '.transport-detail-header' ? detailHeader
    : selector === '.route-visual' ? (visualInPanel ? visual : null) : backButton; } };
const classes = new Set();
const screen = { classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
  querySelector(selector) { return selector === '.guide-header' ? guideHeader
    : selector === '.route-visual' ? (visualInPanel ? null : visual) : null; } };
const backButton = { focused: false, focus() { this.focused = true; } };
const card = { focused: false, focus() { this.focused = true; } };
const scrolls = [];
let resizeCount = 0;
const sandbox = {
  console,
  routeOrigin: '안국역',
  destination: '예시 호텔',
  currentPage: 'guide',
  routeRequestToken: 7,
  transportDetailReturnScrollY: 0,
  icon: () => '<svg></svg>',
  escapeHtml: value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]),
  window: { scrollY: 412, scrollTo: options => scrolls.push(options) },
  document: { querySelector: selector => selector === '#transport-detail-page' ? panel
    : selector === '.guide-screen' ? screen : selector === '[data-transport="BUS"]' ? card : null }
};
vm.createContext(sandbox);
vm.runInContext(detailsSource, sandbox);

const walk = { mode: 'WALK', start: { name: '안국역' }, end: { name: '정류장' }, sectionTime: 90 };
const busLeg = { mode: 'BUS', route: '간선:400', start: { name: '정류장' }, end: { name: '호텔 앞' }, sectionTime: 600 };
const railLeg = { mode: 'SUBWAY', route: '2호선', start: { name: '안국역' }, end: { name: '동대문역' }, sectionTime: 700 };
const slowBus = { totalTime: 1200, transferCount: 0, legs: [walk, busLeg] };
const fastBus = { totalTime: 900, transferCount: 0, fare: { regular: { totalFare: 1500 } }, legs: [walk, busLeg] };
const mixed = { totalTime: 500, transferCount: 1, legs: [busLeg, railLeg] };
const subway = { totalTime: 800, transferCount: 0, fare: { regular: { totalFare: 1600 } }, legs: [railLeg] };
assert.equal(sandbox.fastestTransitItinerary([slowBus, mixed, fastBus, subway], 'BUS'), fastBus, 'fastest bus-only route wins');
assert.equal(sandbox.fastestTransitItinerary([mixed, subway], 'SUBWAY'), subway, 'mixed bus+rail route is not labeled subway-only');
assert.equal(sandbox.fastestTransitItinerary([mixed], 'BUS'), null, 'mixed route is not mislabeled bus-only');

sandbox.guideTransportRoutes = { BUS: { itinerary: fastBus } };
sandbox.guideTransportContext = {
  english: false, requestId: 7, userSelectedMode: 'BUS',
  start: { landmark: { label: '안국역 1번 출구' } },
  end: { landmark: { label: '호텔 앞' } },
  maps: { Event: { trigger: () => { resizeCount += 1; } } }, map: {}
};
const markup = sandbox.transportDetailMarkup('BUS', sandbox.guideTransportRoutes.BUS, sandbox.guideTransportContext);
assert.match(markup, /안국역 1번 출구 → 예시 호텔/);
assert.match(markup, /400/);
assert.match(markup, /1,500원/);
assert.match(markup, /환승 0회/);
sandbox.openTransportDetail('BUS');
assert.equal(panel.hidden, false);
assert.equal(classes.has('transport-detail-open'), true);
assert.equal(visualInPanel, true, 'the selected route map is shown on the detail page');
assert.equal(scrolls.at(-1).top, 0);
assert.equal(backButton.focused, true);
sandbox.closeTransportDetail();
assert.equal(panel.hidden, true);
assert.equal(classes.has('transport-detail-open'), false);
assert.equal(visualInPanel, false, 'the map is restored to the guide when going back');
assert.equal(scrolls.at(-1).top, 412);
assert.equal(resizeCount, 2);
assert.equal(card.focused, true);

const taxiMarkup = sandbox.transportDetailMarkup('TAXI', { minutes: 6, fare: 5400 }, sandbox.guideTransportContext);
assert.match(taxiMarkup, /예상 요금/);
assert.match(taxiMarkup, /5,400원/);
assert.match(taxiMarkup, /약 6분/);
const missingFare = sandbox.transportDetailMarkup('BUS', { itinerary: { totalTime: 600, transferCount: 0, legs: [busLeg] } }, sandbox.guideTransportContext);
assert.match(missingFare, /요금 정보 없음/);
sandbox.destination = '<script>alert(1)</script>';
assert.doesNotMatch(sandbox.transportDetailMarkup('TAXI', { minutes: 6, fare: 5400 }, sandbox.guideTransportContext), /<script>/);

assert.match(source, /selectGuideTransport\(button\.dataset\.transport, true\);\s*openTransportDetail\(button\.dataset\.transport\)/);
assert.match(source, /const bus = fastestTransitItinerary\(itineraries, 'BUS'\)/);
assert.match(source, /const subway = fastestTransitItinerary\(itineraries, 'SUBWAY'\)/);
assert.match(source, /guideTransportRoutes\.TAXI = \{ summary, minutes, fare, paths:/);
assert.match(styles, /\.guide-screen\.transport-detail-open > :not\(\.transport-detail-page\) \{ display: none; \}/);
assert.equal((source.match(/logoControlOptions: \{ position: maps\.Position\.TOP_LEFT \}/g) || []).length, 2,
  'NAVER attribution is moved, not hidden, on guide and places maps');
console.log('PASS: fastest single-mode routes, real fares and legs, taxi estimate, detail back navigation, safe text, logo placement');
