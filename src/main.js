const root = document.querySelector('#root');
let currentPage = 'home';
let destination = '';
let routeOrigin = '';
let routeLanguage = 'ko';
let nearbyStopRequest = null;
let selectedAppLanguage = '한국어';
let selectedUserLanguage = '한국어';
let voicePaused = false;
let voiceSearchOpen = false;
let voiceSearchState = 'idle';
let voiceSearchMessage = '';
let activeDestinationRecognition = null;
let routeEntryMode = 'dual';
const naverMapClientId = window.__2SPEAKER_CONFIG__?.naverMapClientId?.trim() ?? '';
const googleMapsApiKey = window.__2SPEAKER_CONFIG__?.googleMapsApiKey?.trim() ?? '';
let naverMapsLoadPromise = null;
let googleMapsLoadPromise = null;
let routeMap = null;
let routeMapContainer = null;
let routeMapProvider = null;
let routeMapOverlays = [];
let nearbyInfoWindow = null;
let nearbyPanorama = null;
let routeRequestToken = 0;
let guideTransportRoutes = {};
let guideTransportContext = null;
let walkPreviewState = null;
const sentTextMessages = [];
let textSendNotice = '';
const pageHistory = [];
let faqOpenIndex = 3;

const icons = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  arrow: '<path d="M5 12h14"/><path d="m14 7 5 5-5 5"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pinRoute: '<path d="M12 2.1a5.8 5.8 0 0 0-5.8 5.8c0 3.8 5.8 8.8 5.8 8.8s5.8-5 5.8-8.8A5.8 5.8 0 0 0 12 2.1Z"/><circle cx="12" cy="7.9" r="2"/><path d="M7.2 22c.5-.8 1.2-1.2 2.1-1.2h9.4a2.2 2.2 0 0 0 0-4.4h-3"/>',
  speechLetters: '<path d="M14.2 7.2h6.3a1.5 1.5 0 0 1 1.5 1.5v6.4a1.5 1.5 0 0 1-1.5 1.5h-.3v2.8l-2.5-2.8H15a1.5 1.5 0 0 1-1.5-1.5v-1.4"/><path d="M4 3.2h8.3a1.6 1.6 0 0 1 1.6 1.6v6.8a1.6 1.6 0 0 1-1.6 1.6H8l-3.5 2.9v-2.9H4a1.6 1.6 0 0 1-1.6-1.6V4.8A1.6 1.6 0 0 1 4 3.2Z"/><text x="8.2" y="10.8" fill="#c8efff" stroke="none" font-family="Arial, sans-serif" font-size="6.8" text-anchor="middle">A</text><text x="18" y="14" fill="#21d6ff" stroke="none" font-family="sans-serif" font-size="6" font-weight="500" text-anchor="middle">가</text>',
  back: '<path d="m15 18-6-6 6-6"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  homeActive: '<path fill="currentColor" stroke="none" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  settings: '<path d="M9.74 5.06 L9.86 2.74 L14.14 2.74 L14.26 5.06 L15.31 5.50 L17.03 3.94 L20.06 6.97 L18.50 8.69 L18.94 9.74 L21.26 9.86 L21.26 14.14 L18.94 14.26 L18.50 15.31 L20.06 17.03 L17.03 20.06 L15.31 18.50 L14.26 18.94 L14.14 21.26 L9.86 21.26 L9.74 18.94 L8.69 18.50 L6.97 20.06 L3.94 17.03 L5.50 15.31 L5.06 14.26 L2.74 14.14 L2.74 9.86 L5.06 9.74 L5.50 8.69 L3.94 6.97 L6.97 3.94 L8.69 5.50 Z"/><circle cx="12" cy="12" r="3.2"/>',
  train: '<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M8 7h8v5H8zM8 22l2-3m6 3-2-3M5 15h14M8 16h.01M16 16h.01"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/><path d="M8 21h8"/>',
  translate: '<path d="M4 5h9v8H9l-3 3v-3H4Z"/><path d="M11 9h9v8h-2v3l-3-3h-4Z"/><path d="M7 8h3M8.5 6.5v3"/><path d="m14 14 1.5-3 1.5 3M14.5 13h2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
  message: '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  send: '<path d="m4 4 16 8-16 8 3-8Z"/><path d="M7 12h13"/>',
  walk: '<circle cx="12" cy="4" r="2"/><path d="m10 22 1-7-3-3 2-5 5 3 3 1M11 15l4 3 1 4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15ZM5 2l.7 1.8L7.5 4.5l-1.8.7L5 7l-.7-1.8L2.5 4.5l1.8-.7L5 2Z"/>'
};

function icon(name, size = 28) {
  const featureStroke = name === 'pinRoute' ? '1.05' : name === 'speechLetters' ? '1.08' : '1.8';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${featureStroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function parseNearbyStopRequest(raw) {
  const input = String(raw ?? '').trim().replace(/\s+/g, ' ');
  const taxi = /택시\s*(?:승강장|정류장|타는\s*곳)|taxi\s*(?:stand|rank)/i.test(input);
  const bus = /버스\s*(?:정류장|승강장|정류소|타는\s*곳)|bus\s*stop/i.test(input);
  if (!taxi && !bus) return null;
  let anchor = input.split(/근처|주변|가까운|인근/)[0].trim();
  if (anchor === input) anchor = input.split(/택시|버스|taxi|bus/i)[0].trim();
  anchor = anchor.replace(/^(?:여기|이곳|현재\s*위치|내\s*위치)(?:에서)?$/,'')
    .replace(/(?:에서|의|에|까지)$/,'').trim();
  return { anchor, taxi, bus, raw: input };
}

function normalizeEntranceQuery(value) {
  let name = String(value || '').trim();
  // Colloquial “어린이대공원 1번역” means station exit 1, never station number 1.
  name = name.replace(/^(.+?)\s*(\d{1,2}(?:-\d)?)\s*번\s*역$/, (_, base, n) => `${base.trim().replace(/역$/, '')}역 ${n}번 출구`);
  return name.replace(/역\s*(\d{1,2}(?:-\d)?)\s*번\s*출구/g, '역 $1번 출구');
}

function entranceDescriptor(query) {
  const name = normalizeEntranceQuery(query).replace(/\([^)]*\)/g, '').replace(/\d+호선/g, '').replace(/\s+/g, '');
  const exit = name.match(/^(.+역)(\d{1,2}(?:-\d)?)번출구$/);
  if (exit) return { kind: 'station-exit', name, base: exit[1], number: exit[2] };
  if (/(?:정문|후문|동문|서문|남문|북문|입구)$/.test(name)) return { kind: 'gate', name };
  return null;
}

function entranceNameMatches(query, resultName) {
  const want = entranceDescriptor(query), got = entranceDescriptor(resultName);
  if (!want || !got || want.kind !== got.kind) return false;
  return want.kind === 'station-exit' ? want.base === got.base && want.number === got.number
    : want.name === got.name || '서울' + want.name === got.name || want.name === '서울' + got.name;
}

function parseRouteRequest(raw) {
  const input = String(raw ?? '').trim().replace(/\s+/g, ' ');
  let phrase = input.replace(/[?!.。！？]+$/g, '').trim();
  const language = /[A-Za-z]/.test(phrase) && !/[\uac00-\ud7a3]/.test(phrase) ? 'en' : 'ko';
  let origin = '';
  if (language === 'en') {
    const fromTo = phrase.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/i);
    const toFrom = !fromTo && phrase.match(/\bto\s+(.+?)\s+from\s+(.+)$/i);
    if (fromTo) {
      origin = fromTo[1].trim();
      phrase = fromTo[2].trim();
    } else if (toFrom) {
      origin = toFrom[2].trim();
      phrase = toFrom[1].trim();
    } else {
      const destinationOnly = phrase.match(/\b(?:get|go|travel)\s+to\s+(.+)$/i);
      if (destinationOnly) phrase = destinationOnly[1].trim();
      else {
        const direct = phrase.match(/^(.+?)\s+to\s+(.+)$/i);
        if (direct) {
          origin = direct[1].trim();
          phrase = direct[2].trim();
        }
      }
    }
    if (/^(?:here|my location|current location)$/i.test(origin)) origin = '';
    phrase = phrase.replace(/\s+(?:by\s+(?:bus|subway|train|transit)|please)$/i, '').trim();
  } else {
    const currentLocation = phrase.match(/^(?:여기서|이곳에서|현재\s*위치에서|내\s*위치에서|지금\s*있는\s*곳에서)\s*(.+)$/);
    if (currentLocation) phrase = currentLocation[1].trim();
    else {
      const explicitOrigin = phrase.match(/^(.+?)(?:에서|부터)\s*(.+)$/);
      if (explicitOrigin) {
        origin = explicitOrigin[1].trim();
        phrase = explicitOrigin[2].trim();
      }
    }
    const withQuestion = phrase.match(/^(.+?)(?:까지|으로|로)\s+(?:어떻게|가려면|가는|가나요|가요|갈|길|찾아|안내|알려|추천).*/);
    if (withQuestion) phrase = withQuestion[1];
    else phrase = phrase.replace(/(?:까지|으로)$/, '');
    phrase = phrase.replace(/\s+(?:가는 길|가는 방법|가려면|어떻게 가나요|길찾기).*$/, '').trim();
  }
  return { origin: normalizeEntranceQuery(origin), destination: normalizeEntranceQuery(phrase || input), language };
}

function bottomNav() {
  return `<nav class="bottom-nav" aria-label="하단 메뉴">
    <button class="nav-item ${currentPage === 'home' ? 'active' : ''}" data-page="home">${icon('homeActive')}<span>홈</span></button>
    <button class="nav-item ${currentPage === 'more' ? 'active' : ''}" data-page="more">${icon('more')}<span>더보기</span></button>
  </nav>`;
}

function voiceDestinationDialog() {
  const waiting = voiceSearchState === 'starting' || voiceSearchState === 'listening';
  return `<div class="voice-search-overlay">
    <section class="voice-search-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-search-title">
      <button class="voice-search-close" type="button" data-action="voice-close" aria-label="음성 입력 닫기">×</button>
      <span class="voice-search-mic ${waiting ? 'listening' : ''}">${icon('mic', 52)}</span>
      <h2 id="voice-search-title">어디로 가세요?</h2>
      <p role="status" aria-live="polite">${escapeHtml(voiceSearchMessage)}</p>
      ${waiting ? '' : `<div class="voice-search-actions">
        <button type="button" data-action="voice-retry">다시 말하기</button>
        <button type="button" data-action="voice-text-fallback">문자로 입력</button>
      </div>`}
    </section>
  </div>`;
}

function header(title) {
  return `<header class="page-header">
    <button class="icon-button" data-action="back" aria-label="뒤로 가기">${icon('back', 34)}</button>
    <h1>${title}</h1><span class="header-spacer"></span>
  </header>`;
}

function conversationHeader(title, showBrand = true) {
  return `<header class="conversation-header">
    ${showBrand ? '<div class="conversation-brand-row"><strong>2SPEAKER</strong></div>' : ''}
    <div class="page-header conversation-title">
      <button class="icon-button" data-action="back" aria-label="뒤로 가기">${icon('back', 34)}</button>
      <h1>${title}</h1><span class="header-spacer"></span>
    </div>
  </header>`;
}

function homeScreen() {
  return `<main class="screen home-screen">
    <section class="brand-block" aria-label="2SPEAKER">
      <svg class="brand-mark" viewBox="145 210 540 420" role="img" aria-label="2S 로고" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="neon-only" color-interpolation-filters="sRGB"><feColorMatrix values="0 0 0 0 0  0 0 0 0 .96  0 0 0 0 .98  -1.25 2.5 -1.25 0 -.03"/></filter>
          <clipPath id="logo-two-clip"><rect x="145" y="210" width="272" height="420"/></clipPath>
          <clipPath id="logo-s-clip"><rect x="417" y="210" width="268" height="420"/></clipPath>
        </defs>
        <image clip-path="url(#logo-two-clip)" href="/public/2speaker-logo.png" x="0" y="0" width="823" height="1000" filter="url(#neon-only)"/>
        <image clip-path="url(#logo-s-clip)" href="/public/2speaker-logo.png" x="0" y="0" width="823" height="1000" filter="url(#neon-only)" transform="matrix(.987 0 0 1.041 5.5 -30)"/>
      </svg>
      <h1>2SPEAKER</h1>
    </section>
    <button class="destination-search" id="home-search" type="button" aria-label="목적지 검색 화면 열기">
      ${icon('search', 34)}
      <span class="destination-prompt">어디로 가세요?</span>
      <span class="search-arrow" aria-hidden="true">${icon('arrow', 31)}</span>
    </button>
    <section class="feature-grid" aria-label="주요 기능">
      <button class="feature-card" data-page="route">
        <span class="feature-icon">${icon('pinRoute', 66)}</span><strong>길찾기</strong><span>경로·대중교통</span>
      </button>
      <button class="feature-card" data-page="translation">
        <span class="feature-icon">${icon('speechLetters', 66)}</span><strong>통역</strong><span>실시간 대화번역</span>
      </button>
    </section>
    ${bottomNav()}
  </main>`;
}

function routeScreen() {
  const safeDestination = escapeHtml(destination);
  return `<main class="screen content-screen">
    ${header(routeEntryMode === 'simple' ? '목적지 검색' : '길찾기')}
    <section class="page-body route-entry-body">
      <form class="route-form" id="route-form"><div class="large-input"><label class="sr-only" for="route-destination">목적지</label>
        <input id="route-destination" value="${safeDestination}" placeholder="어디로 가세요?" inputmode="search">
        ${routeEntryMode === 'dual' ? `<button class="route-voice-button" type="button" data-action="route-voice" aria-label="음성으로 목적지 말하기">${icon('mic', 27)}</button>
        <button class="route-text-button" type="button" data-action="route-text" aria-label="문자로 목적지 입력"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.2c-5.1 0-9.2 3.4-9.2 7.8s4.1 7.8 9.2 7.8c.8 0 1.6-.1 2.3-.3l3.7 2.2c.5.3 1.1-.1 1-.7l-.5-3.3a7.2 7.2 0 0 0 3.5-5.7c0-4.4-4.1-7.8-9.2-7.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>` : `<button class="route-submit" type="submit" aria-label="목적지 검색" ${destination.trim() ? '' : 'hidden'}>${icon('arrow', 25)}</button>`}
      </div></form>
    </section>
    ${bottomNav()}
  </main>`;
}

function guideScreen() {
  const rawPlace = destination.trim() || '경복궁';
  const place = escapeHtml(rawPlace);
  const english = routeLanguage === 'en';
  const question = english
    ? (routeOrigin
      ? `How do I get from ${escapeHtml(routeOrigin)} to ${place}?`
      : `How do I get to ${place}?`)
    : (routeOrigin
      ? `${escapeHtml(routeOrigin)}에서 ${place}까지 어떻게 가나요?`
      : `${place}까지 어떻게 가나요?`);
  const loading = english ? 'Finding a route...' : '경로를 확인하고 있어요.';
  return `<main class="screen guide-screen">
    <header class="guide-header">
      <button class="guide-control" data-page="more" aria-label="더보기">${icon('menu', 30)}</button>
      <strong>2SPEAKER</strong>
      <button class="guide-control" data-page="language" aria-label="설정">${icon('settings', 30)}</button>
    </header>
    <section class="route-visual" aria-label="길찾기 안내">
      <div class="route-scene" style="background:#12384d">
        <div class="naver-map" id="naver-map" aria-label="지도"></div>
        <div class="destination-sign"><span>${place}<small>${english ? 'Destination' : '목적지'}</small></span></div>
        <div class="walk-preview-scene" id="walk-preview-scene" role="region" aria-label="${english ? 'Walking street view' : '도보 로드뷰'}" hidden>
          <div class="walk-preview-panorama" id="walk-preview-panorama" aria-label="${english ? 'Street view along the walking route' : '도보 경로의 실제 거리뷰'}"></div>
          <button class="walk-preview-map-button" type="button" id="walk-preview-close">${english ? 'Show map' : '지도보기'}</button>
        </div>
      </div>
      <button class="route-instruction walk-action" type="button" aria-label="${english ? 'Show walking street view' : '도보 로드뷰 보기'}" aria-expanded="false" aria-controls="walk-preview-scene walk-preview" disabled>${icon('walk', 28)}<span>${loading}</span></button>
    </section>
    <section class="walk-preview" id="walk-preview" aria-label="${english ? 'Walking street-view preview' : '도보 로드뷰 미리보기'}" hidden>
      <div class="walk-preview-header">
        <div><small>${english ? 'Street-view route preview' : '도보 로드뷰 미리보기'}</small><h2>${escapeHtml(routeOrigin || (english ? 'Your location' : '현재 위치'))} → ${place}</h2></div>
      </div>
      <p class="walk-preview-message" id="route-endpoints" style="box-sizing:border-box;overflow-anchor:none" hidden></p>
      <p class="walk-preview-message" id="walk-preview-message" role="status" style="display:none"></p>
      <div class="walk-preview-controls">
        <button type="button" id="walk-preview-prev">${english ? 'Previous' : '이전'}</button>
        <button type="button" id="walk-preview-play">${english ? 'Pause' : '일시정지'}</button>
        <button type="button" id="walk-preview-next">${english ? 'Next' : '다음'} →</button>
      </div>
      <div class="walk-preview-progress">
        <span id="walk-preview-progress-text"></span>
        <input class="walk-preview-seek" id="walk-preview-seek" type="range" min="0" max="0" step="1" value="0" disabled aria-label="${english ? 'Seek anywhere along the route' : '전체 경로 앞뒤 이동'}" aria-describedby="walk-preview-seek-help">
        <small id="walk-preview-seek-help">${english ? 'Drag forward or backward anywhere · far left returns to the start' : '앞뒤 원하는 구간으로 이동 · 맨 왼쪽은 처음으로'}</small>
      </div>
    </section>
    <section class="transport-options" aria-label="${english ? 'Compare transport options' : '교통수단 비교'}">
      ${['BUS', 'SUBWAY', 'TAXI'].map((mode) => {
        const label = english ? { BUS: 'Bus', SUBWAY: 'Subway', TAXI: 'Taxi' }[mode] : { BUS: '버스', SUBWAY: '지하철', TAXI: '택시' }[mode];
        return `<button class="transport-option" type="button" data-transport="${mode}" disabled><strong>${label}</strong><small>${english ? 'Checking...' : '확인 중...'}</small></button>`;
      }).join('')}
    </section>
    <section class="guide-dialogue">
      <p class="bubble question">${question}</p>
      <p class="bubble answer">${loading}</p>
    </section>
    ${bottomNav()}
  </main>`;
}

function nearbyScreen() {
  const request = nearbyStopRequest || { anchor: '', taxi: true, bus: true };
  const place = escapeHtml(request.anchor || '현재 위치');
  return `<main class="screen guide-screen nearby-screen">
    <header class="guide-header">
      <button class="guide-control" data-page="more" aria-label="더보기">${icon('menu', 30)}</button>
      <strong>2SPEAKER</strong>
      <button class="guide-control" data-page="language" aria-label="설정">${icon('settings', 30)}</button>
    </header>
    <section class="route-visual" aria-label="주변 승강장 지도">
      <div class="route-scene" style="background:#12384d">
        <div class="naver-map" id="naver-map" aria-label="주변 승강장 지도"></div>
        <div class="destination-sign"><span>${place}<small>기준 위치</small></span></div>
      </div>
      <div class="route-instruction">${icon('pinRoute', 28)}<span>근처 승강장을 찾고 있어요.</span></div>
    </section>
    <section class="nearby-panorama" id="nearby-panorama" aria-label="선택한 승강장 거리뷰" hidden>
      <div class="nearby-panorama-header">
        <div><small>네이버 거리뷰 · 승강장 주변</small><h2 id="nearby-panorama-title"></h2></div>
        <button type="button" id="nearby-panorama-close" aria-label="거리뷰 닫기">닫기</button>
      </div>
      <div class="nearby-panorama-view" id="nearby-panorama-view" aria-label="승강장 주변 거리 사진"></div>
      <p class="nearby-panorama-status" id="nearby-panorama-status" role="status">거리뷰를 불러오는 중이에요.</p>
      <p class="nearby-panorama-note">가까운 도로에서 촬영한 모습이에요. 승강장 표지나 현재 모습과 다를 수 있어요.</p>
    </section>
    <section class="nearby-results" aria-live="polite">
      <p class="nearby-status">지도와 승강장 목록을 불러오는 중이에요.</p>
    </section>
    ${bottomNav()}
  </main>`;
}

function translationScreen() {
  return `<main class="screen content-screen">
    ${header('통역')}
    <section class="page-body translation-body">
      <button class="language-row" data-page="user-language-list" aria-label="내 언어 선택"><strong>내 언어</strong><span>${selectedUserLanguage} ${icon('chevron', 26)}</span></button>
      <p class="supporting-copy">상대 언어는 AI가 자동 인식합니다.</p>
      <h2>대화 방식</h2>
      <button class="mode-card" data-page="voice">
        <span class="mode-icon">${icon('mic', 44)}</span>
        <span class="mode-copy"><strong>음성으로 대화</strong><small>서로 말하면 실시간 통역</small></span>${icon('chevron', 30)}
      </button>
      <button class="mode-card" data-page="text">
        <span class="mode-icon">${icon('message', 42)}</span>
        <span class="mode-copy"><strong>문자로 대화</strong><small>입력한 내용을 바로 번역</small></span>${icon('chevron', 30)}
      </button>
    </section>
  </main>`;
}

function voiceScreen() {
  return `<main class="screen content-screen conversation-screen">
    ${conversationHeader('음성으로 대화')}
    <section class="conversation-body">
      <p class="translating">${voicePaused ? '일시정지' : '통역 중'}</p>
      <article class="speech-block"><span>상대방</span><p>Where is the station?</p><strong>역이 어디예요?</strong></article>
      <article class="speech-block mine"><span>나</span><p>이쪽으로 가세요.</p><strong>Go this way.</strong></article>
    </section>
    <button class="pause-button" data-action="voice-toggle" aria-pressed="${voicePaused}">${icon(voicePaused ? 'play' : 'pause', 30)}<span>${voicePaused ? '계속하기' : '일시정지'}</span></button>
  </main>`;
}

function textScreen() {
  const outgoingMessages = sentTextMessages.map((message, index) => {
    const pendingNotice = index === sentTextMessages.length - 1 && textSendNotice
      ? `<small class="translation-pending" role="status" aria-live="polite">${escapeHtml(textSendNotice)}</small>`
      : '';
    return `<article class="text-bubble me"><span>나</span><p>${escapeHtml(message)}</p>${pendingNotice}</article>`;
  }).join('');
  return `<main class="screen content-screen conversation-screen text-screen">
    ${conversationHeader('문자로 대화', false)}
    <section class="text-dialogue">
      <article class="text-bubble other"><span>상대방</span><p>Where is the station?</p><strong>역이 어디예요?</strong></article>
      <article class="text-bubble me"><span>나</span><p>이쪽으로 가세요.</p><strong>Go this way.</strong></article>
      ${outgoingMessages}
    </section>
    <form class="message-composer"><input required placeholder="메시지를 입력하세요." aria-label="번역할 메시지"><button type="submit" aria-label="메시지 보내기">${icon('send', 28)}</button></form>
  </main>`;
}

function moreScreen() {
  const previousPage = pageHistory[pageHistory.length - 1] || 'home';
  const backgroundScreens = {
    home: homeScreen, route: routeScreen, guide: guideScreen, nearby: nearbyScreen, translation: translationScreen,
    voice: voiceScreen, text: textScreen
  };
  const background = (backgroundScreens[previousPage] || homeScreen)();
  const menuItems = [
    ['user', '로그인 / 회원가입', 'login'],
    ['globe', '언어', 'language'],
    ['help', '도움말', 'help']
  ];
  return `<main class="screen menu-screen">
    <div class="menu-underlay" inert>${background}</div><div class="menu-scrim"></div>
    <section class="menu-panel"><button class="menu-close" data-action="menu-close" aria-label="메뉴 닫기">×</button>
      <div class="menu-list">${menuItems.map(([name, label, page]) => `<button data-page="${page}"><span>${icon(name, 36)}</span><strong>${label}</strong>${icon('chevron', 26)}</button>`).join('')}</div>
    </section>
  </main>`;
}

function loginScreen() {
  return `<main class="screen content-screen">${header('로그인 / 회원가입')}
    <section class="page-body account-body">
      <article class="account-card"><h2>로그인</h2>
        <label class="account-input">${icon('mail', 25)}<input type="email" placeholder="이메일"></label>
        <label class="account-input">${icon('lock', 25)}<input type="password" placeholder="비밀번호"></label>
        <button class="primary-button" data-account-action="로그인">로그인</button>
      </article>
      <article class="account-card"><h2>회원가입</h2><p>간편 회원가입</p>
        <div class="social-grid"><button data-account-action="Google"><b class="google-mark">G</b>Google</button><button data-account-action="Apple"><b>●</b>Apple</button><button data-account-action="Naver"><b class="naver-mark">N</b>Naver</button></div>
        <button class="email-signup" data-account-action="이메일 회원가입">이메일로 회원가입 ${icon('chevron', 22)}</button>
      </article>
      <p class="account-notice" role="status" aria-live="polite"></p>
    </section>
  </main>`;
}

function languageScreen() {
  return `<main class="screen content-screen">${header('앱 언어')}
    <section class="page-body language-body"><button class="setting-row" data-page="language-list"><strong>앱 언어</strong><span>${selectedAppLanguage} ${icon('chevron', 26)}</span></button></section>
  </main>`;
}

function languageListScreen() {
  const languages = ['한국어', 'English', '日本語', '中文', 'Español', 'Français', 'Deutsch'];
  return `<main class="screen content-screen">${header('앱 언어 선택')}
    <section class="page-body language-list">${languages.map((language) => `<button data-language="${language}" aria-pressed="${language === selectedAppLanguage}"><span>${language}</span>${language === selectedAppLanguage ? icon('check', 30) : ''}</button>`).join('')}</section>
  </main>`;
}

function userLanguageListScreen() {
  const languages = ['한국어', 'English', '日本語', '中文', 'Español', 'Français', 'Deutsch'];
  return `<main class="screen content-screen">${header('내 언어 선택')}
    <section class="page-body language-list">${languages.map((language) => `<button data-user-language="${language}" aria-pressed="${language === selectedUserLanguage}"><span>${language}</span>${language === selectedUserLanguage ? icon('check', 30) : ''}</button>`).join('')}</section>
  </main>`;
}

function helpScreen() {
  const items = [['사용 방법', 'howto'], ['문의 / 오류 신고', 'contact'], ['자주 묻는 질문', 'faq'], ['서비스 정보', 'service']];
  return `<main class="screen content-screen">${header('도움말')}
    <section class="page-body list-card">${items.map(([label, page]) => `<button data-page="${page}"><span>${label}</span>${icon('chevron', 27)}</button>`).join('')}</section>
  </main>`;
}

function howtoScreen() {
  return `<main class="screen content-screen">${header('사용 방법')}
    <section class="page-body howto-card">
      <article class="howto-step"><span class="howto-icon">${icon('pin', 46)}</span><div><h2>길찾기</h2><p>목적지를 말하거나 입력하세요.<br>AI가 경로와 다음 행동을 바로 안내합니다.</p></div></article>
      <article class="howto-step"><span class="howto-icon">${icon('translate', 46)}</span><div><h2>통역</h2><p>상대방과 그대로 대화하세요.<br>AI가 언어를 자동 인식해 실시간 통역합니다.</p></div></article>
      <article class="howto-step"><span class="howto-icon">${icon('sparkles', 46)}</span><div><h2>핵심</h2><p>말하면 AI가 알아서 처리합니다.</p></div></article>
    </section>
  </main>`;
}

const faqItems = [
  ['2SPEAKER는 어떻게 사용하나요?', '목적지를 말하거나 입력하고, 통역이 필요하면 바로 대화를 시작하세요. AI가 상황에 맞게 알아서 처리합니다.'],
  ['길찾기는 어떻게 시작하나요?', '가고 싶은 곳을 말하거나 입력하세요. AI가 경로와 다음 행동을 바로 안내합니다.'],
  ['통역은 어떻게 시작하나요?', '상대방과 그대로 대화를 시작하세요. AI가 언어를 자동 인식해 실시간 통역합니다.'],
  ['상대 언어를 설정해야 하나요?', '아니요. AI가 자동으로 인식합니다.'],
  ['로그인 없이 사용할 수 있나요?', '아니요. 회원가입 및 로그인 후 이용할 수 있습니다.']
];

function faqScreen() {
  return `<main class="screen content-screen">${header('자주 묻는 질문')}
    <section class="page-body faq-list" aria-label="자주 묻는 질문 목록">
      ${faqItems.map(([question, answer], index) => `<article class="faq-item ${faqOpenIndex === index ? 'open' : ''}">
        <button class="faq-question" data-faq-index="${index}" aria-expanded="${faqOpenIndex === index}"><span>${question}</span>${icon('chevron', 28)}</button>
        ${faqOpenIndex === index ? `<p class="faq-answer"><strong>A.</strong> ${answer}</p>` : ''}
      </article>`).join('')}
    </section>
  </main>`;
}

function contactScreen() {
  return `<main class="screen content-screen">${header('문의 / 오류 신고')}
    <section class="page-body contact-card">
      <form id="contact-form">
        <label for="contact-type">문의 유형</label>
        <select id="contact-type" aria-label="문의 유형"><option>길찾기 오류</option><option>통역 오류</option><option>이용 문의</option><option>기타</option></select>
        <label for="contact-message">내용</label>
        <textarea id="contact-message" required placeholder="문제가 있었던 내용을 입력하세요"></textarea>
        <button class="contact-submit" type="submit">보내기</button>
        <p class="contact-notice" role="status" aria-live="polite"></p>
      </form>
    </section>
  </main>`;
}

function infoScreen(title, copy) {
  return `<main class="screen content-screen">${header(title)}<section class="page-body info-copy"><p>${copy}</p></section></main>`;
}

function serviceScreen() {
  return `<main class="screen content-screen">${header('서비스 정보')}
    <section class="page-body service-body"><article><h2>2SPEAKER</h2><p>One AI. Two ways to speak.</p></article>
      <div class="list-card"><button data-page="terms"><span>이용약관</span>${icon('chevron', 27)}</button><button data-page="privacy"><span>개인정보처리방침</span>${icon('chevron', 27)}</button><button data-page="version"><span>앱 버전</span><em>1.0.0</em></button></div>
    </section>
  </main>`;
}

function versionScreen() {
  return `<main class="screen content-screen">${header('앱 버전')}
    <section class="page-body version-card"><p>Version 1.0.0</p><hr><p>현재 최신 버전입니다.</p></section>
  </main>`;
}

function legalScreen(title, sections) {
  return `<main class="screen content-screen">${header(title)}
    <section class="page-body legal-body">${sections.map(([heading, copy]) => `<article><h2>${heading}</h2><p>${copy}</p></article>`).join('')}</section>
  </main>`;
}

function render() {
  stopWalkPreview(true);
  const screens = {
    home: homeScreen, route: routeScreen, guide: guideScreen, nearby: nearbyScreen, translation: translationScreen,
    voice: voiceScreen, text: textScreen, more: moreScreen, login: loginScreen,
    language: languageScreen, 'language-list': languageListScreen,
    'user-language-list': userLanguageListScreen, help: helpScreen,
    service: serviceScreen,
    howto: howtoScreen,
    contact: contactScreen,
    faq: faqScreen,
    version: versionScreen,
    terms: () => legalScreen('이용약관', [
      ['제1조 목적', '이 약관은 2SPEAKER 서비스 이용에 필요한 기본 사항을 정합니다.'],
      ['제2조 서비스 제공', '2SPEAKER는 길찾기, 실시간 통역·번역 및 관련 AI 기능을 제공합니다.'],
      ['제3조 계정 및 이용', '계정이 필요한 기능은 가입 후 이용할 수 있습니다.'],
      ['제4조 서비스 이용 시 유의사항', 'AI 안내와 길찾기 정보는 실제 교통·현장 상황과 다를 수 있습니다.<br>사용자는 현장의 표지판, 교통정보 및 안전 상황을 함께 확인해야 합니다.'],
      ['제5조 금지 행위', '서비스 운영을 방해하거나 타인의 권리를 침해하는 방식으로 이용해서는 안 됩니다.'],
      ['제6조 서비스 변경 및 중단', '서비스 개선, 점검 또는 운영상 필요한 경우 일부 기능이 변경되거나 일시 중단될 수 있습니다.'],
      ['제7조 기타', '본 약관에 정하지 않은 사항은 관련 법령과 서비스 운영 정책에 따릅니다.']
    ]),
    privacy: () => legalScreen('개인정보처리방침', [
      ['1. 수집·처리하는 정보', '2SPEAKER는 서비스 제공에 필요한 범위에서 다음 정보를 처리할 수 있습니다.<br>- 계정 정보: 이메일 등<br>- 위치 정보: 길찾기 이용 시<br>- 음성·텍스트 입력 정보: 통역·번역 이용 시<br>- 서비스 이용 및 오류 기록'],
      ['2. 이용 목적', '수집된 정보는 다음 목적으로 이용합니다.<br>- 길찾기 및 현재 위치 기반 안내<br>- 실시간 통역·번역<br>- 계정 관리<br>- 오류 확인 및 서비스 개선'],
      ['3. 보관 및 파기', '개인정보는 서비스 제공에 필요한 기간 동안만 이용하며, 목적이 달성되면 관련 법령에 따라 안전하게 파기합니다.'],
      ['4. 제3자 제공 및 외부 서비스', '이용자의 동의 또는 법적 근거 없이 개인정보를 제3자에게 제공하지 않습니다.<br>지도, 로그인, AI 처리 등 외부 서비스가 필요한 경우 필요한 범위에서만 정보를 처리합니다.'],
      ['5. 이용자의 권리', '이용자는 자신의 개인정보에 대해 열람, 수정, 삭제 및 처리 정지를 요청할 수 있습니다.'],
      ['6. 개인정보 문의', '개인정보와 관련된 문의는 2SPEAKER 문의 / 오류 신고를 통해 접수할 수 있습니다.']
    ])
  };
  root.innerHTML = `<div class="app-shell">${screens[currentPage]()}${voiceSearchOpen ? voiceDestinationDialog() : ''}</div>`;

  if (currentPage === 'guide') initializeNaverMap();
  if (currentPage === 'nearby') initializeNearbyMap();

  if (currentPage === 'text') {
    const dialogue = document.querySelector('.text-dialogue');
    if (dialogue) dialogue.scrollTop = dialogue.scrollHeight;
    document.querySelector('.message-composer input')?.focus({ preventScroll: true });
  }

  document.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.page === 'route') routeEntryMode = 'dual';
      navigate(button.dataset.page);
    });
  });
  document.querySelectorAll('[data-transport]').forEach((button) => {
    button.addEventListener('click', () => selectGuideTransport(button.dataset.transport, true));
  });
  document.querySelector('.walk-action')?.addEventListener('click', () => selectGuideTransport('WALK', true));
  document.querySelectorAll('[data-action="back"]').forEach((button) => {
    button.addEventListener('click', goBack);
  });
  document.querySelectorAll('[data-action="menu-close"]').forEach((button) => {
    button.addEventListener('click', goBack);
  });
  document.querySelector('[data-action="voice-toggle"]')?.addEventListener('click', () => {
    voicePaused = !voicePaused;
    render();
  });
  document.querySelectorAll('[data-faq-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.faqIndex);
      faqOpenIndex = faqOpenIndex === index ? -1 : index;
      render();
    });
  });
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedAppLanguage = button.dataset.language;
      pageHistory.pop();
      currentPage = 'language';
      render();
    });
  });
  document.querySelectorAll('[data-user-language]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedUserLanguage = button.dataset.userLanguage;
      pageHistory.pop();
      currentPage = 'translation';
      render();
    });
  });
  document.querySelectorAll('[data-account-action]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelector('.account-notice').textContent = `${button.dataset.accountAction} 기능은 인증 서버 연결 후 이용할 수 있습니다.`;
    });
  });

  const routeInput = document.querySelector('#route-destination');
  document.querySelector('[data-action="route-voice"]')?.addEventListener('click', startVoiceDestination);
  document.querySelector('[data-action="route-text"]')?.addEventListener('click', () => routeInput?.focus());
  document.querySelector('[data-action="voice-close"]')?.addEventListener('click', closeVoiceDestination);
  document.querySelector('[data-action="voice-retry"]')?.addEventListener('click', startVoiceDestination);
  document.querySelector('[data-action="voice-text-fallback"]')?.addEventListener('click', () => {
    closeVoiceDestination();
    if (currentPage !== 'route') navigate('route');
    document.querySelector('#route-destination')?.focus();
  });

  document.querySelector('#home-search')?.addEventListener('click', () => {
    routeEntryMode = 'simple';
    destination = '';
    routeOrigin = '';
    routeLanguage = 'ko';
    navigate('route');
    document.querySelector('#route-destination')?.focus();
  });
  routeInput?.addEventListener('input', (event) => {
    destination = event.target.value;
    const routeSubmit = document.querySelector('.route-submit');
    if (routeSubmit) routeSubmit.hidden = !destination.trim();
  });
  routeInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      routeInput.form.requestSubmit();
    }
  });
  document.querySelector('#route-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const nearby = parseNearbyStopRequest(routeInput.value);
    if (nearby) {
      nearbyStopRequest = nearby;
      navigate('nearby');
      return;
    }
    const parsed = parseRouteRequest(routeInput.value);
    destination = parsed.destination;
    routeOrigin = parsed.origin;
    routeLanguage = parsed.language;
    if (destination) navigate('guide');
    else routeInput.focus();
  });
  document.querySelector('.message-composer')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input');
    const message = input.value.trim();
    if (!message) return;
    sentTextMessages.push(message);
    textSendNotice = '메시지를 화면에 추가했어요. 실제 번역은 번역 서버 연결 후 제공됩니다.';
    render();
    const dialogue = document.querySelector('.text-dialogue');
    if (dialogue) dialogue.scrollTop = dialogue.scrollHeight;
  });
  document.querySelector('#contact-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    document.querySelector('.contact-notice').textContent = '문의 접수는 서버 연결 후 이용할 수 있습니다.';
  });
}

function loadNaverMaps() {
  if (!naverMapClientId) return Promise.reject(new Error('NAVER_MAP_CLIENT_ID is not configured.'));
  if (window.naver?.maps?.Map && window.naver?.maps?.Service?.geocode) return Promise.resolve(window.naver.maps);
  if (naverMapsLoadPromise) return naverMapsLoadPromise;

  const loadPromise = new Promise((resolve, reject) => {
    const callbackName = `__2speakerNaverMapsLoaded_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let timeoutId;
    const cleanup = () => {
      clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = () => {
      const maps = window.naver?.maps;
      if (!maps?.Map || !maps?.Service?.geocode) {
        cleanup();
        reject(new Error('NAVER Maps loaded without its Geocoder submodule.'));
        return;
      }
      cleanup();
      resolve(maps);
    };

    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(naverMapClientId)}&submodules=geocoder,panorama&callback=${encodeURIComponent(callbackName)}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error('NAVER Maps could not be loaded.'));
    };
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('NAVER Maps took too long to load.'));
    }, 15000);
    document.head.append(script);
  });

  naverMapsLoadPromise = loadPromise.catch((error) => {
    naverMapsLoadPromise = null;
    throw error;
  });
  return naverMapsLoadPromise;
}

function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (!googleMapsApiKey) return Promise.reject(new Error('GOOGLE_MAPS_API_KEY is not configured.'));
  if (googleMapsLoadPromise) return googleMapsLoadPromise;

  const loadPromise = new Promise((resolve, reject) => {
    const callbackName = `__2speakerGoogleMapsLoaded_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let timeoutId;
    const cleanup = (removeScript = false) => {
      clearTimeout(timeoutId);
      delete window[callbackName];
      if (removeScript) script.remove();
    };

    window[callbackName] = () => {
      const maps = window.google?.maps;
      if (!maps?.importLibrary) {
        cleanup(true);
        reject(new Error('Google Maps loaded without its JavaScript API.'));
        return;
      }
      cleanup();
      resolve(maps);
    };

    const params = new URLSearchParams({
      key: googleMapsApiKey,
      v: 'weekly',
      loading: 'async',
      language: 'ko',
      region: 'KR',
      callback: callbackName
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      cleanup(true);
      reject(new Error('Google Maps could not be loaded.'));
    };
    timeoutId = setTimeout(() => {
      cleanup(true);
      reject(new Error('Google Maps took too long to load.'));
    }, 20000);
    document.head.append(script);
  });

  googleMapsLoadPromise = loadPromise.catch((error) => {
    googleMapsLoadPromise = null;
    throw error;
  });
  return googleMapsLoadPromise;
}

function isKoreaCoordinate(point) {
  return Number(point?.latitude) >= 33
    && Number(point?.latitude) <= 39.5
    && Number(point?.longitude) >= 124
    && Number(point?.longitude) <= 132.5;
}

function createNaverMap(maps, container, scene, center) {
  if (routeMapProvider !== 'naver' || routeMapContainer !== container || !routeMap) {
    clearRouteOverlays();
    container.replaceChildren();
    routeMap = new maps.Map(container, {
      center: new maps.LatLng(center.latitude, center.longitude),
      zoom: 15,
      minZoom: 3,
      maxZoom: 20,
      mapTypeControl: false,
      zoomControl: true,
      zoomControlOptions: { position: maps.Position.TOP_RIGHT },
      scaleControl: false,
      logoControl: true,
      mapDataControl: false
    });
  } else {
    routeMap.setCenter(new maps.LatLng(center.latitude, center.longitude));
  }
  routeMapContainer = container;
  routeMapProvider = 'naver';
  container.setAttribute('aria-label', '네이버 지도');
  scene.classList.remove('map-failed');
  scene.classList.add('map-ready');
  return routeMap;
}

function createGoogleMap(maps, container, scene, center) {
  clearRouteOverlays();
  container.replaceChildren();
  routeMap = new maps.Map(container, {
    center: { lat: center.latitude, lng: center.longitude },
    zoom: 14,
    minZoom: 2,
    maxZoom: 21,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    zoomControl: true
  });
  routeMapContainer = container;
  routeMapProvider = 'google';
  container.setAttribute('aria-label', 'Google 지도');
  scene.classList.remove('map-failed');
  scene.classList.add('map-ready');
  return routeMap;
}

function initializeNaverMap() {
  const container = document.querySelector('#naver-map');
  const scene = container?.closest('.route-scene');
  if (!container || !scene) return;
  if (routeMapContainer === container && routeMap) return;

  clearRouteOverlays();
  routeMap = null;
  routeMapProvider = null;
  routeMapContainer = container;
  const requestId = ++routeRequestToken;

  const failMap = () => {
    if (!isCurrent()) return;
    scene.classList.add('map-failed');
  };

  const isCurrent = () => requestId === routeRequestToken
    && currentPage === 'guide'
    && routeMapContainer === container
    && document.querySelector('#naver-map') === container;

  (async () => {
    let naverMaps = null;
    if (naverMapClientId) naverMaps = await loadNaverMaps().catch(() => null);
    if (!isCurrent()) return;
    if (naverMaps) createNaverMap(naverMaps, container, scene, { latitude: 37.5665, longitude: 126.978 });
    requestGuideRoute(naverMaps, container, scene, requestId).catch(failMap);
  })().catch(failMap);
}

function renderNearbyGroup(title, places, error, type) {
  const heading = escapeHtml(title);
  if (error) return `<section class="nearby-group"><h2>${heading}</h2><p class="nearby-empty">${escapeHtml(error)}</p></section>`;
  if (!places.length) return `<section class="nearby-group"><h2>${heading}</h2><p class="nearby-empty">반경 2km 안에서 검색된 승강장이 없어요.</p></section>`;
  return `<section class="nearby-group"><h2>${heading}</h2><ol>${places.map((place, index) =>
    `<li><button class="nearby-place" type="button" data-nearby-type="${type}" data-nearby-index="${index}" aria-pressed="false"><span class="nearby-place-badge ${type}">${index + 1}</span><span><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.address || '주소 정보 없음')} · 약 ${Math.round(place.distanceMeters)}m</small></span></button></li>`
  ).join('')}</ol></section>`;
}

function initializeNearbyMap() {
  const container = document.querySelector('#naver-map');
  const scene = container?.closest('.route-scene');
  const results = document.querySelector('.nearby-results');
  const instruction = document.querySelector('.route-instruction span');
  const panoramaPanel = document.querySelector('#nearby-panorama');
  const panoramaView = document.querySelector('#nearby-panorama-view');
  const panoramaTitle = document.querySelector('#nearby-panorama-title');
  const panoramaStatus = document.querySelector('#nearby-panorama-status');
  const request = nearbyStopRequest;
  if (!container || !scene || !results || !request) return;
  clearRouteOverlays();
  routeMap = null;
  routeMapProvider = null;
  routeMapContainer = container;
  const requestId = ++routeRequestToken;
  const isCurrent = () => requestId === routeRequestToken
    && currentPage === 'nearby'
    && routeMapContainer === container
    && document.querySelector('#naver-map') === container;
  (async () => {
    const params = new URLSearchParams();
    if (request.anchor) params.set('anchor', request.anchor);
    else {
      const position = await getCurrentPosition();
      if (!isCurrent()) return;
      if (!isKoreaCoordinate(position)) throw new Error('국내 위치에서만 주변 승강장을 검색할 수 있어요.');
      params.set('lat', String(position.latitude));
      params.set('lon', String(position.longitude));
    }
    const response = await fetch(`/api/places/nearby?${params}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '근처 승강장을 찾지 못했어요.');
    if (!isCurrent()) return;
    const taxi = request.taxi ? (data.taxi || []) : [];
    const bus = request.bus ? (data.bus || []) : [];
    const count = taxi.length + bus.length;
    instruction.textContent = count
      ? `${data.center.name} 근처 승강장 ${count}곳을 찾았어요.`
      : '근처에서 검색된 승강장이 없어요.';
    results.innerHTML = `${request.taxi ? renderNearbyGroup('택시 승강장', taxi, data.errors?.taxi, 'taxi') : ''}
      ${request.bus ? renderNearbyGroup('버스 정류장', bus, data.errors?.bus, 'bus') : ''}`;
    const maps = await loadNaverMaps().catch(() => null);
    if (!isCurrent()) return;
    if (!maps) {
      results.insertAdjacentHTML('afterbegin', '<p class="nearby-empty">지도 연결을 확인해 주세요. 검색 결과는 아래 목록에서 볼 수 있어요.</p>');
      return;
    }
    const map = createNaverMap(maps, container, scene, data.center);
    const markers = new Map();
    nearbyInfoWindow = new maps.InfoWindow({ disableAutoPan: true, maxWidth: 240 });
    let selectedPoint = null;
    const orientPanorama = () => {
      if (!nearbyPanorama || !selectedPoint || !isCurrent()) return;
      try {
        const pov = nearbyPanorama.getProjection()?.fromCoordToPov(selectedPoint);
        if (pov) nearbyPanorama.setPov({ pan: pov.pan, tilt: 0, fov: 90 });
      } catch {
        // The panorama can still be explored manually if its projection is unavailable.
      }
    };
    const focusPlace = (type, index) => {
      const place = (type === 'taxi' ? taxi : bus)[index];
      if (!place || !isCurrent()) return;
      const point = new maps.LatLng(place.latitude, place.longitude);
      selectedPoint = point;
      map.updateBy(point, 17);
      nearbyInfoWindow.setContent(`<div class="nearby-info"><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.address || '주소 정보 없음')} · 약 ${Math.round(place.distanceMeters)}m</small></div>`);
      nearbyInfoWindow.open(map, point);
      results.querySelectorAll('[data-nearby-type]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.nearbyType === type && Number(button.dataset.nearbyIndex) === index));
      });
      panoramaTitle.textContent = place.name;
      panoramaPanel.hidden = false;
      panoramaView.style.visibility = 'hidden';
      panoramaStatus.textContent = '승강장 주변의 실제 거리뷰를 불러오는 중이에요.';
      panoramaPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!maps.Panorama) {
        panoramaStatus.textContent = '거리뷰 연결을 확인해 주세요. 위치는 위 지도에서 볼 수 있어요.';
        return;
      }
      try {
        if (nearbyPanorama) {
          nearbyPanorama.setVisible(true);
          nearbyPanorama.setPosition(point);
        } else {
          nearbyPanorama = new maps.Panorama(panoramaView, {
            position: point,
            zoomControl: true,
            aroundControl: true
          });
          maps.Event.addListener(nearbyPanorama, 'pano_status', (status) => {
            if (!isCurrent() || panoramaPanel.hidden) return;
            if (status !== 'OK') {
              panoramaView.style.visibility = 'hidden';
              panoramaStatus.textContent = '이 승강장 근처에는 거리뷰가 제공되지 않아요. 위치는 위 지도에서 볼 수 있어요.';
              return;
            }
            orientPanorama();
            panoramaView.style.visibility = 'visible';
            const photoDate = nearbyPanorama.getLocation()?.photodate;
            panoramaStatus.textContent = photoDate
              ? `승강장 방향의 거리뷰예요 · 촬영: ${photoDate}`
              : '승강장 방향의 거리뷰예요. 화면을 움직여 주변을 둘러보세요.';
          });
          maps.Event.addListener(nearbyPanorama, 'pano_changed', orientPanorama);
          maps.Event.addListener(nearbyPanorama, 'init', orientPanorama);
        }
      } catch {
        panoramaView.style.visibility = 'hidden';
        panoramaStatus.textContent = '거리뷰를 열지 못했어요. 위치는 위 지도에서 볼 수 있어요.';
      }
    };
    panoramaPanel.querySelector('#nearby-panorama-close').addEventListener('click', () => {
      panoramaPanel.hidden = true;
      nearbyPanorama?.setVisible(false);
    });
    const bounds = new maps.LatLngBounds();
    const centerPoint = new maps.LatLng(data.center.latitude, data.center.longitude);
    bounds.extend(centerPoint);
    routeMapOverlays.push(new maps.Marker({ map, position: centerPoint, title: data.center.name || '기준 위치' }));
    for (const [type, places] of [['taxi', taxi], ['bus', bus]]) {
      for (const [index, place] of places.entries()) {
        const point = new maps.LatLng(place.latitude, place.longitude);
        bounds.extend(point);
        const marker = new maps.Marker({
          map, position: point, title: place.name,
          icon: {
            content: `<span class="nearby-map-pin ${type}">${type === 'taxi' ? '택시' : '버스'} ${index + 1}</span>`,
            anchor: new maps.Point(30, 20)
          }
        });
        markers.set(`${type}:${index}`, marker);
        routeMapOverlays.push(marker);
        maps.Event.addListener(marker, 'click', () => focusPlace(type, index));
      }
    }
    if (count) map.fitBounds(bounds, 35);
    results.querySelectorAll('[data-nearby-type]').forEach((button) => {
      button.addEventListener('click', () => {
        const type = button.dataset.nearbyType;
        const index = Number(button.dataset.nearbyIndex);
        if (markers.has(`${type}:${index}`)) focusPlace(type, index);
      });
    });
  })().catch((error) => {
    if (!isCurrent()) return;
    instruction.textContent = '주변 승강장을 확인하지 못했어요.';
    results.innerHTML = `<p class="nearby-empty">${escapeHtml(error.message || '잠시 후 다시 시도해 주세요.')}</p>`;
  });
}

// Verified pedestrian entrance for the adjoining Yongmasan forest facilities.
// Place-name geocoding can resolve to a park centroid far from the public entrance.
// Keep this as a small, source-verified exception; do not infer shortcuts elsewhere.
function localPedestrianEntrance(query, nearby) {
  const name = String(query ?? '').replace(/[\s·ㆍ.,]/g, '');
  // User-confirmed blue market arch between 안경나라 and 호호왕만두.
  // Naver map destination at 서울 중랑구 면목로 418, checked 2026-10-10.
  // Scope unqualified aliases to this neighbourhood, not similarly named markets.
  const marketPosition = [127.0876148, 37.5891198];
  if (/^(?:서울(?:특별시)?중랑구)?동원(?:전통)?(?:종합)?시장(?:입구)?$/.test(name)
    && (name.includes('중랑구') || (nearby && walkPreviewDistance(
      [nearby.longitude, nearby.latitude], marketPosition) < 2000))) {
    return { longitude: marketPosition[0], latitude: marketPosition[1],
      landmark: { label: '동원전통시장 면목로 입구', kind: 'gate', position: marketPosition,
        source: 'Naver map / user-confirmed entrance' } };
  }
  if (/^(?:용마산)?(?:아토피)?치유의숲(?:입구)?$/.test(name)
    || /^용마산유아숲체험(?:원|장)(?:입구)?$/.test(name)
    || /^용마산녹색복지숲(?:입구)?$/.test(name)) {
    // Naver address geocode for 서울 중랑구 용마산로94길 64-126 (verified 2026-10-09).
    return { longitude: 127.1010085, latitude: 37.5867885 };
  }
  return null;
}

function geocodeDestination(maps, query) {
  return new Promise((resolve, reject) => {
    maps.Service.geocode({ query }, (status, response) => {
      if (status !== maps.Service.Status.OK) {
        reject(new Error('목적지 위치를 찾지 못했어요. 주소나 장소명을 확인해 주세요.'));
        return;
      }
      const item = response?.v2?.addresses?.[0];
      const longitude = Number(item?.x);
      const latitude = Number(item?.y);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        reject(new Error('목적지 위치를 찾지 못했어요. 주소나 장소명을 확인해 주세요.'));
        return;
      }
      resolve({ longitude, latitude });
    });
  });
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('현재 위치를 확인할 수 없는 기기예요.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ longitude: coords.longitude, latitude: coords.latitude }),
      () => reject(new Error('출발지를 확인하려면 위치 권한을 허용해 주세요.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}

async function resolveRouteStart(naverMaps, originQuery) {
  if (!originQuery) return getCurrentPosition();
  if (entranceDescriptor(originQuery)) return resolvePedestrianLandmark(originQuery);
  const naverResult = naverMaps
    ? await geocodeDestination(naverMaps, originQuery).catch(() => null)
    : null;
  if (naverResult) return naverResult;
  const googleMaps = await loadGoogleMaps();
  return searchGoogleDestination(googleMaps, originQuery);
}

async function resolvePedestrianLandmark(query) {
  const label = normalizeEntranceQuery(query);
  const request = entranceDescriptor(label);
  if (!request) return null;
  try {
    const response = await fetch('/api/places/entrance?q=' + encodeURIComponent(label));
    const place = await response.json();
    if (response.ok && place.matched && entranceNameMatches(label, place.name) && isKoreaCoordinate(place)) {
      return { ...place, landmark: { label, kind: request.kind, position: [place.longitude, place.latitude], source: place.source } };
    }
    if (response.status === 409) throw new Error('AMBIGUOUS_ENTRANCE');
  } catch (error) {
    if (error.message === 'AMBIGUOUS_ENTRANCE') throw new Error('같은 이름의 출입구가 여러 곳이에요. 지역명을 함께 입력해 주세요.');
  }
  // A fallback must still match the exit number/gate; never silently accept the station centre.
  const maps = await loadGoogleMaps();
  const { Place } = await maps.importLibrary('places');
  const { places = [] } = await Place.searchByText({ textQuery: label, fields: ['location', 'displayName'], maxResultCount: 5, language: 'ko' });
  const matched = places.filter(place => entranceNameMatches(label, place.displayName) && place.location);
  const locations = matched.map(place => ({ latitude: Number(place.location.lat()), longitude: Number(place.location.lng()) })).filter(isKoreaCoordinate);
  if (!locations.length || locations.some(place => walkPreviewDistance([place.longitude, place.latitude], [locations[0].longitude, locations[0].latitude]) > 80)) {
    throw new Error('요청한 출구·입구 위치를 정확히 확인하지 못했어요. 지역명과 출구 번호를 확인해 주세요.');
  }
  const place = locations[0];
  return { ...place, landmark: { label, kind: request.kind, position: [place.longitude, place.latitude], source: 'Google Places' } };
}

function automaticEntranceQuery(query) {
  const name = String(query || '').replace(/\s+/g, '');
  // Only verified mountain names opt in; never reinterpret e.g. 부산 or a summit request.
  return !entranceDescriptor(query) && (/(?:역|공원)$/.test(name) || /^(?:서울)?아차산$/.test(name));
}

async function pedestrianCandidates(query, maps, nearby) {
  if (!automaticEntranceQuery(query)) {
    const landmark = await resolvePedestrianLandmark(query);
    if (landmark) return [landmark];
    const local = localPedestrianEntrance(query, nearby);
    if (local) return [local];
    const point = await resolveRouteStart(maps, query);
    return point && isKoreaCoordinate(point) ? [point] : [];
  }
  const response = await fetch('/api/places/entrance?q=' + encodeURIComponent(query));
  const payload = await response.json();
  const candidates = response.ok && Array.isArray(payload.candidates) ? payload.candidates : [];
  const base = query.replace(/\s+/g, '');
  return candidates.filter(place => {
    if (/^(?:서울)?아차산$/.test(base) && String(place.name || '').replace(/\s+/g, '') === '아차산어울림광장') {
      return place.matched && isKoreaCoordinate(place) && place.kind === 'approach'
        && walkPreviewDistance([place.longitude, place.latitude], [127.10378724,37.5716503]) < 6000;
    }
    const desc = entranceDescriptor(place.name);
    if (!place.matched || !isKoreaCoordinate(place) || !desc) return false;
    return /역$/.test(base) ? desc.kind === 'station-exit' && desc.base === base
      : ['정문','후문','동문','서문','남문','북문','입구','등산로입구'].some(gate => entranceNameMatches(query + gate,place.name));
  }).map(place => ({ ...place, landmark: { label: normalizeEntranceQuery(place.name), kind: place.kind,
    position: [place.longitude,place.latitude], source: place.source, automatic: true } }));
}

async function choosePedestrianEndpoints(origin, destinationQuery, isCurrent, maps) {
  const starts = origin ? await pedestrianCandidates(origin, maps) : [await getCurrentPosition()];
  if (!isCurrent()) return null;
  const ends = await pedestrianCandidates(destinationQuery, maps, starts[0]);
  if (!isCurrent()) return null;
  if (!starts.length || !ends.length) throw new Error('역 출구 또는 목적지 입구를 확인하지 못했어요. 출구 번호·입구 이름을 지정해 주세요.');
  const pairs = starts.flatMap(start => ends.map(end => ({ start,end,
    direct: walkPreviewDistance([start.longitude,start.latitude],[end.longitude,end.latitude]) })));
  // Compare every returned exit. A geometrically close exit can require a long
  // detour around a barrier/crossing. Bound concurrency rather than dropping exits.
  const shortlist = pairs.sort((a,b)=>a.direct-b.direct);
  const routes = [];
  for (let offset = 0; offset < shortlist.length; offset += 3) {
    if (!isCurrent()) return null;
    routes.push(...await Promise.all(shortlist.slice(offset, offset + 3).map(async pair => {
    try {
      const response = await fetch('/api/walking/routes', { method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({startX:pair.start.longitude,startY:pair.start.latitude,endX:pair.end.longitude,endY:pair.end.latitude}) });
      const walkingRoute = await response.json();
      if (!response.ok || !(Number(walkingRoute.totalTime)>0) || !walkPreviewFrames(walkingRoute.paths,walkingRoute.maneuvers).length) return null;
      const measured = walkingRoute.paths.reduce((sum,path)=>sum+path.slice(1).reduce((part,p,i)=>part+walkPreviewDistance(path[i],p),0),0);
      return { ...pair,walkingRoute,distance:Number(walkingRoute.totalDistance)>0?Number(walkingRoute.totalDistance):measured };
    } catch { return null; }
    })));
  }
  if (!isCurrent()) return null;
  const best = routes.filter(Boolean).sort((a,b)=>a.distance-b.distance || a.walkingRoute.totalTime-b.walkingRoute.totalTime)[0];
  if (!best) throw new Error('출입구 사이의 도보 경로를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  best.start.walkingRoute = best.walkingRoute;
  best.start.walkingComparison = { candidates: pairs.length, checked: routes.filter(Boolean).length,
    distance: best.distance, entranceConfirmed: !!best.end.landmark };
  return best;
}

function routeErrorMessage(error) {
  const message = error instanceof Error ? error.message : '';
  const english = routeLanguage === 'en';
  if (/ZERO_RESULTS|NOT_FOUND|장소를 찾지 못했/i.test(message)) {
    return english ? 'Place not found. Check the station name or address.' : '장소를 찾지 못했어요. 역 이름이나 주소를 다시 확인해 주세요.';
  }
  if (/REQUEST_DENIED|API_KEY|ApiNotActivated|PERMISSION_DENIED|지도 검색 연결/i.test(message)) {
    return english ? 'Map search is unavailable. Please try again later.' : '지도 검색 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
  if (english) {
    if (/위치 권한/.test(message)) return 'Allow location access to use your current position as the starting point.';
    if (/사용 권한|요청 한도|무료 한도/.test(message)) return 'TMAP access or the daily request limit needs to be checked.';
    if (/경로를 찾지|경로를 받지|대중교통 API/.test(message)) return 'No transit route was returned. Please try again later.';
    return 'Could not load a route. Please try again later.';
  }
  if (/[\uac00-\ud7a3]/.test(message)) return message;
  return '길찾기 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
}

function setGuideAnswer(message) {
  const answer = document.querySelector('.guide-dialogue .answer');
  if (answer) answer.textContent = message;
}

function routeLinePoints(maps, lineString) {
  if (typeof lineString !== 'string') return [];
  return lineString.trim().split(/\s+/).flatMap((coordinatePair) => {
    const match = coordinatePair.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (!match) return [];
    const longitude = Number(match[1]);
    const latitude = Number(match[2]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
      || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return [];
    return [new maps.LatLng(latitude, longitude)];
  });
}

function clearRouteOverlays() {
  nearbyPanorama?.setVisible(false);
  nearbyPanorama = null;
  nearbyInfoWindow?.close();
  nearbyInfoWindow = null;
  routeMapOverlays.forEach((overlay) => overlay.setMap(null));
  routeMapOverlays = [];
}

function drawTransitItinerary(maps, map, itinerary, start, end) {
  clearRouteOverlays();
  const bounds = new maps.LatLngBounds();
  const startPoint = new maps.LatLng(start.latitude, start.longitude);
  const endPoint = new maps.LatLng(end.latitude, end.longitude);
  bounds.extend(startPoint);
  bounds.extend(endPoint);

  for (const leg of itinerary.legs ?? []) {
    const isWalk = leg.mode === 'WALK';
    const lines = isWalk
      ? (leg.steps ?? []).map((step) => step.linestring).filter(Boolean)
      : [leg.passShape?.linestring].filter(Boolean);
    const fallback = [leg.start, leg.end]
      .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon)))
      .map((point) => new maps.LatLng(Number(point.lat), Number(point.lon)));
    const paths = lines.map((line) => routeLinePoints(maps, line)).filter((path) => path.length > 1);
    if (paths.length === 0 && fallback.length > 1) paths.push(fallback);

    for (const path of paths) {
      path.forEach((point) => bounds.extend(point));
      const routeColor = String(leg.routeColor || '').replace(/^#/, '');
      const color = isWalk ? '#20d5ff' : `#${/^[\da-f]{6}$/i.test(routeColor) ? routeColor : '087da7'}`;
      routeMapOverlays.push(new maps.Polyline({
        map,
        path,
        strokeColor: color,
        strokeOpacity: .92,
        strokeWeight: isWalk ? 5 : 6
      }));
    }
  }

  routeMapOverlays.push(new maps.Marker({ map, position: startPoint, title: '출발지' }));
  routeMapOverlays.push(new maps.Marker({ map, position: endPoint, title: destination.trim() }));
  map.fitBounds(bounds, 36);
}

async function searchGoogleDestination(maps, query) {
  let places = [];
  try {
    const { Place } = await maps.importLibrary('places');
    ({ places = [] } = await Place.searchByText({
      textQuery: query,
      fields: ['location'],
      maxResultCount: 1
    }));
  } catch {
    // Address geocoding below remains available if the Places search fails.
  }
  const place = places[0];
  const placeLocation = place?.location;
  if (placeLocation) {
    const result = {
      latitude: Number(placeLocation.lat()),
      longitude: Number(placeLocation.lng()),
      country: ''
    };
    if (Number.isFinite(result.latitude) && Number.isFinite(result.longitude)) return result;
  }

  const { Geocoder } = await maps.importLibrary('geocoding');
  const response = await new Geocoder().geocode({ address: query });
  const result = response.results?.[0];
  const location = result?.geometry?.location;
  if (!location) throw new Error('목적지 위치를 찾지 못했어요. 주소나 장소명을 확인해 주세요.');
  return {
    latitude: Number(location.lat()),
    longitude: Number(location.lng()),
    country: result.address_components?.find((component) => component.types?.includes('country'))?.short_name || ''
  };
}

function transportText(mode, itinerary, english) {
  if (!itinerary) return english ? 'No route found' : '경로 없음';
  const minutes = Math.max(1, Math.round(Number(itinerary.totalTime || 0) / 60));
  const transferCount = Number(itinerary.transferCount || 0);
  const modes = new Set((itinerary.legs ?? []).map((leg) => leg.mode));
  const mixed = modes.has('BUS') && (modes.has('SUBWAY') || modes.has('TRAIN'));
  const prefix = mixed ? (english ? 'Bus + subway · ' : '버스+지하철 · ') : '';
  return english
    ? `${prefix}about ${minutes} min · ${transferCount} transfer${transferCount === 1 ? '' : 's'}`
    : `${prefix}약 ${minutes}분 · 환승 ${transferCount}회`;
}

function updateTransportChoice(mode, description, available) {
  const button = document.querySelector(`[data-transport="${mode}"]`);
  if (!button) return;
  button.disabled = !available;
  button.querySelector('small').textContent = description;
}

function walkPreviewDistance(a, b) {
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function walkPreviewBearing(a, b) {
  const radians = Math.PI / 180;
  const lat1 = a[1] * radians;
  const lat2 = b[1] * radians;
  const lon = (b[0] - a[0]) * radians;
  return (Math.atan2(Math.sin(lon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon)) / radians + 360) % 360;
}

function walkPreviewFrames(paths, maneuvers = []) {
  const validPoint = (p) => Array.isArray(p) && p.length >= 2
    && Number.isFinite(p[0]) && Number.isFinite(p[1])
    && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const points = [];
  // Do not invent a straight-line connection across missing route sections.
  for (const path of Array.isArray(paths) ? paths : []) {
    if (!Array.isArray(path) || path.length < 2 || !path.every(validPoint)) return [];
    if (points.length && walkPreviewDistance(points.at(-1), path[0]) > 3) return [];
    for (const point of path) {
      if (!points.length || walkPreviewDistance(points.at(-1), point) > 0.2) points.push(point.slice(0, 2));
    }
  }
  if (points.length < 2) return [];
  const distances = [0];
  for (let i = 1; i < points.length; i += 1) {
    distances.push(distances[i - 1] + walkPreviewDistance(points[i - 1], points[i]));
  }
  const total = distances.at(-1);
  if (total < 1) return [];
  const pointAt = (meters) => {
    const target = Math.max(0, Math.min(total, meters));
    let lo = 1, hi = distances.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (distances[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const fraction = (target - distances[lo - 1]) / (distances[lo] - distances[lo - 1]);
    return points[lo - 1].map((value, axis) => value + (points[lo][axis] - value) * fraction);
  };
  const deltaAt = (meters) => {
    const here = pointAt(meters);
    const incoming = walkPreviewBearing(pointAt(meters - 12), here);
    const outgoing = walkPreviewBearing(here, pointAt(meters + 12));
    return ((outgoing - incoming + 540) % 360) - 180;
  };
  const direction = (delta) => Math.abs(delta) >= 150 ? 'uturn'
    : delta >= 35 ? 'right' : delta <= -35 ? 'left' : 'straight';
  const geometric = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const meters = distances[i];
    if (meters < 4 || total - meters < 4) continue;
    const delta = deltaAt(meters);
    if (Math.abs(delta) < 35) continue;
    const candidate = { meters, delta, direction: direction(delta), kind: 'turn', description: '' };
    const prior = geometric.at(-1);
    // Collapse nearby vertices of one bend, but preserve consecutive opposite turns.
    if (prior && meters - prior.meters < 18 && Math.sign(delta) === Math.sign(prior.delta)) {
      if (Math.abs(delta) > Math.abs(prior.delta)) geometric[geometric.length - 1] = candidate;
    } else geometric.push(candidate);
  }
  // Snap provider instructions to the route in travel order, not to a nearby parallel street.
  const project = (point, minimum) => {
    let best = null;
    const cos = Math.cos(point[1] * Math.PI / 180);
    for (let i = 1; i < points.length; i += 1) {
      if (distances[i] < minimum) continue;
      const a = points[i - 1], b = points[i];
      const dx = (b[0] - a[0]) * cos, dy = b[1] - a[1];
      const length2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * cos * dx + (point[1] - a[1]) * dy) / length2));
      const meters = distances[i - 1] + t * (distances[i] - distances[i - 1]);
      if (meters < minimum) continue;
      const distance = walkPreviewDistance(point, [a[0] + (b[0] - a[0]) * t, a[1] + dy * t]);
      if (!best || distance < best.distance - 0.1) best = { meters, distance };
    }
    return best;
  };
  const supplied = [];
  let minimum = 0;
  for (const maneuver of Array.isArray(maneuvers) ? maneuvers : []) {
    if (!validPoint(maneuver?.position)) continue;
    const description = typeof maneuver.description === 'string'
      ? maneuver.description.replace(/\s+/g, ' ').trim().slice(0, 180) : '';
    const match = project(maneuver.position, minimum);
    if (!match || match.distance > 20) continue;
    minimum = match.meters;
    if (match.meters < 4 || total - match.meters < 4) continue;
    const explicit = /좌회전|우회전|왼쪽|오른쪽|유턴|교차로|사거리|삼거리|횡단보도|골목|입구|출구|진입|진출|갈림길|갈래길|분기|계단|육교|지하보도/.test(description);
    if (!explicit) continue;
    let delta = deltaAt(match.meters);
    // Some provider instructions sit just before the physical corner (e.g. at
    // the start of a crossing). Keep the early approach, but anchor the turn
    // to the nearby route bend instead of suppressing that bend as a duplicate.
    const intended = /좌회전/.test(description) ? -1 : /우회전/.test(description) ? 1 : 0;
    const corner = Math.abs(delta) < 35 && intended
      ? geometric.find(item => item.meters >= match.meters && item.meters - match.meters <= 15
        && Math.sign(item.delta) === intended) : null;
    const turnMeters = corner?.meters ?? match.meters;
    if (corner) delta = corner.delta;
    // Direction comes from the route shape; a future-turn mention in prose is not a turn at this point.
    supplied.push({ meters: turnMeters, delta, direction: direction(delta),
      approachMeters: corner ? Math.max(0, match.meters - Math.min(10, match.meters / 3)) : null,
      kind: Math.abs(delta) >= 35 ? 'turn' : 'junction', description });
  }
  const decisions = supplied.slice();
  for (const candidate of geometric) {
    if (!supplied.some((event) => Math.abs(event.meters - candidate.meters) < 15)) decisions.push(candidate);
  }
  decisions.sort((a, b) => a.meters - b.meters);
  const unique = decisions.filter((event, i) => !i || event.meters - decisions[i - 1].meters > 2);
  // Straight-through junctions visually confirmed in the user's Achasan route
  // screenshots (2026-10-10). Geographic anchors, never scene indices or a
  // blanket straight-road fallback. Provider instructions cover other junctions.
  const verifiedJunctions = [
    [127.09069731773641, 37.5515729760091],
    [127.09204455377541, 37.5516751937452],
    [127.09526087369866, 37.55257278258103]
  ].map(point => project(point, 0)).filter(match => match && match.distance <= 6);
  const navigationDecisions = [...unique, ...verifiedJunctions.map(junction => ({
    meters: junction.meters, direction: 'straight', kind: 'junction'
  }))].sort((a,b) => a.meters-b.meters);
  const frames = [];
  const add = (meters, phase, event = null) => {
    // Dense samples between the approach and the corner still belong to that
    // approach. Otherwise their generic 12 m look-ahead turns the camera early.
    if (phase === 'straight') {
      const next = unique.find(item => item.meters > meters && (item.meters - meters <= 12
        || (Number.isFinite(item.approachMeters) && meters >= item.approachMeters)));
      if (next) {
        phase = 'approach';
        event = { ...next, nextMeters: unique.find(item => item.meters > next.meters)?.meters ?? total };
      }
    }
    const position = pointAt(meters);
    let ahead = pointAt(Math.min(total, event?.nextMeters ?? total, meters + 20));
    if (phase === 'approach') ahead = pointAt(event.meters);
    if (phase === 'turn') ahead = pointAt(Math.min(total, event.nextMeters ?? total, event.meters + 14));
    // Keep facing forwards on arrival, rather than turning the camera back down the route.
    if (phase === 'arrival') {
      const behind = pointAt(Math.max(0, total - 12));
      ahead = position.map((value, axis) => value + (value - behind[axis]));
    }
    const junctionCue = phase === 'straight' && verifiedJunctions.some(junction => meters >= junction.meters - 8 && meters <= junction.meters + 2);
    frames.push({ position, ahead, meters, total, phase,
      junctionCue,
      nextDecision: navigationDecisions.find(decision => decision.meters > meters + 2) || null,
      cueAhead: phase === 'straight' ? pointAt(Math.min(total, unique.find(item => item.meters > meters)?.meters ?? total, meters + 35)) : null,
      turnPosition: event ? pointAt(event.meters) : null,
      turnAhead: event ? pointAt(Math.min(total, event.nextMeters ?? total, event.meters + 14)) : null,
      direction: event?.direction || 'straight', description: event?.description || '',
      important: Boolean(event) || junctionCue, focusMeters: event?.meters ?? null, turnAngle: Math.abs(event?.delta || 0),
      holdMs: event ? (phase === 'turn' ? 1600 : 850) : junctionCue ? 750 : (phase === 'start' || phase === 'arrival' ? 1800 : 400) });
  };
  add(0, 'start');
  unique.forEach((event, i) => {
    const previous = unique[i - 1]?.meters ?? 0;
    const next = unique[i + 1]?.meters ?? total;
    event = { ...event, nextMeters: next };
    const before = Math.min(10, (event.meters - previous) / 3);
    const after = Math.min(10, (next - event.meters) / 3);
    const approachMeters = Number.isFinite(event.approachMeters)
      ? Math.max(previous + 2, event.approachMeters) : event.meters - before;
    if (event.meters - approachMeters >= 2) add(approachMeters, 'approach', event);
    add(event.meters, 'turn', event);
    if (after >= 2) add(event.meters + after, 'depart', event);
  });
  // Provide connecting street scenes and alternatives when several points share one photograph.
  const spacing = 5;
  for (let meters = spacing; meters < total - 3; meters += spacing) {
    if (!frames.some((frame) => Math.abs(frame.meters - meters) < 3)) add(meters, 'straight');
  }
  add(total, 'arrival');
  return frames.sort((a, b) => a.meters - b.meters);
}

function walkPreviewEndpointFrames(frames, context, paths) {
  if (!frames.length) return frames;
  const result = frames.slice();
  for (const [side, endpoint] of [['start', context.start], ['end', context.end]]) {
    const landmark = endpoint?.landmark;
    if (!landmark) continue;
    const base = side === 'start' ? frames[0] : frames.at(-1);
    // Query the entrance itself so the introduction and onward view share a camera.
    const position = landmark.position;
    const frame = { ...base, position, ahead: landmark.position, onward: base.ahead, landmark, phase: 'landmark-' + side,
      important: true, description: '', holdMs: 3500 };
    const verified = walkPreviewEntranceScenes(landmark, side);
    if (side === 'start') result.unshift({ ...frame, ...(verified[0] || {}) });
    else {
      // Keep the connecting road view before turning to the entrance. A distant
      // road photograph alone must not stand in for the final close-up.
      result[result.length - 1] = frame;
      for (const scene of verified) result.push({ ...frame, ...scene });
    }
  }
  return result;
}

// Visually verified Naver panoramas, 2026-10-10. IDs pin a real photograph;
// the name AND geographic anchor prevent applying them to a namesake elsewhere.
// Unverified entrances continue to use the normal proximity-checked lookup.
function walkPreviewEntranceScenes(landmark, side) {
  const name = landmark.label.replace(/\s/g, '').replace(/^서울/, '');
  const at = (point) => walkPreviewDistance(landmark.position, point) < 80;
  if (side === 'start' && name === '어린이대공원역1번출구'
      && at([127.07548491, 37.54901353])) {
    return [{ verifiedView: { panoId: 'LqZVpRDZplIJ30MsJTVr6w', pan: 85, tilt: 5, fov: 55,
      maxOffset: 60 }, holdMs: 3500 }];
  }
  if (side !== 'end' || name !== '어린이대공원정문'
      || !at([127.07579042, 37.5495968])) return [];
  return [
    ['ct3NsegdSUxHKYfXZXN9sw', 75.35, '입구 광장 · 정문으로 이어지는 길', 'Entrance plaza · path towards the gate'],
    ['fRDkvVNvvbYMDpwPiHrCfA', 75.35, '광장 안쪽 · 정문 방향으로 이동', 'Across the plaza · towards the gate'],
    ['VhfLR75oXVd1NR_rVQCOrg', 100, '정문 앞 · 들어갈 문 확인', 'In front of the gate · entrance ahead'],
    ['6Vu26tJDnRclihsCDB7N1g', 108.09, '정문 바로 앞 · 도착 입구 확인', 'At the gate · destination entrance']
  ].map(([panoId, pan, captionKo, captionEn]) => ({
    verifiedView: { panoId, pan, tilt: 5, fov: 80, maxOffset: 180, captionKo, captionEn },
    holdMs: 2500
  }));
}

// A nearby photograph is context, not proof of the exact turn location.
function walkPreviewPhotoContext(capture, frame, paths) {
  if (!capture || !capture.every(Number.isFinite)) return null;
  if (frame.landmark) {
    const offset = walkPreviewDistance(capture, frame.landmark.position);
    if (frame.verifiedView) {
      if (offset > frame.verifiedView.maxOffset) return null;
      return { offset, meters: frame.meters, lateral: 0, nearby: false,
        heading: frame.verifiedView.pan, landmark: true };
    }
    // Do not label a distant/ambiguous image as the requested entrance.
    if (offset < 2 || offset > 45) return null;
    return { offset, meters: frame.meters, lateral: 0, nearby: false,
      routeHeading: frame.phase === 'landmark-start' && frame.onward ? walkPreviewBearing(capture, frame.onward) : null,
      heading: walkPreviewBearing(capture, frame.landmark.position), landmark: true };
  }
  let closest = null, traveled = 0;
  const segments = [];
  const cos = Math.cos(capture[1] * Math.PI / 180);
  for (const path of paths || []) {
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1], b = path[i];
      const length = walkPreviewDistance(a, b);
      if (!length) continue;
      const dx = (b[0] - a[0]) * cos, dy = b[1] - a[1];
      const length2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1,
        ((capture[0] - a[0]) * cos * dx + (capture[1] - a[1]) * dy) / length2));
      const point = [a[0] + (b[0] - a[0]) * t, a[1] + dy * t];
      const lateral = walkPreviewDistance(capture, point);
      const meters = traveled + length * t;
      segments.push({ a, b, start: traveled, end: traveled + length });
      // Parallel/campus-loop segments can be physically closer but face backwards.
      // Prefer the local section of the requested walking sequence, not lateral distance alone.
      const score = lateral + Math.abs(meters - frame.meters) * 0.35;
      if (lateral <= 25 && (!closest || score < closest.score)) {
        closest = { lateral, meters, point, score, heading: walkPreviewBearing(a, b) };
      }
      traveled += length;
    }
  }
  const offset = walkPreviewDistance(capture, frame.position);
  // A straight walking sequence should not jump sideways into a driveway or parking lot.
  // Allow a little more room at a junction/start where the camera often sits across the road.
  const maxLateral = frame.important || frame.phase === 'start' || frame.phase === 'arrival' ? 18 : 10;
  if (!closest || closest.lateral > maxLateral || offset > 80) return null;
  // Aim from the actual photo's route position, not from a turn that may still be ahead.
  // A snapped approach photo should face the intersection rather than an adjacent wall.
  let lookMeters = Math.min(traveled, closest.meters + 12);
  if (frame.focusMeters !== null && closest.meters < frame.focusMeters - 5) {
    lookMeters = Math.min(lookMeters, frame.focusMeters);
  }
  const segment = segments.find((item) => item.end >= lookMeters);
  if (segment && lookMeters - closest.meters > 1) {
    const fraction = (lookMeters - segment.start) / (segment.end - segment.start);
    const ahead = segment.a.map((value, axis) => value + (segment.b[axis] - value) * fraction);
    closest.heading = walkPreviewBearing(closest.point, ahead);
  }
  const nearTurn = frame.focusMeters !== null && Math.abs(closest.meters - frame.focusMeters) < 5;
  if (nearTurn && frame.phase === 'turn') closest.heading = walkPreviewBearing(frame.position, frame.ahead);
  if (frame.phase === 'approach' && frame.turnPosition) {
    closest.heading = walkPreviewBearing(frame.position, frame.turnPosition);
  }
  return { ...closest, offset, nearby: offset > 20 };
}

function walkPreviewCue(frame, english) {
  if (frame.verifiedView?.captionKo) return (english ? frame.verifiedView.captionEn : frame.verifiedView.captionKo)
    + (english ? ' · Entrance-area preview beyond the route endpoint' : ' · 경로 끝에서 이어지는 입구 광장 미리보기');
  if (frame.landmark) return (frame.phase === 'landmark-start'
    ? (english ? 'Start landmark' : '출발 지점 확인') : (english ? 'Destination entrance' : '도착 입구 확인'))
    + ' · ' + frame.landmark.label + (english ? ' · Facing the entrance; check the sign in the photograph' : ' · 출입구 방향 보기 · 사진 속 표지판을 확인해 주세요');
  const action = english
    ? { left: 'Turn left', right: 'Turn right', uturn: 'Turn back', straight: 'Check the path ahead' }[frame.direction]
    : { left: '왼쪽으로 꺾는 길', right: '오른쪽으로 꺾는 길', uturn: '되돌아가는 지점', straight: '앞쪽 진행 경로 확인' }[frame.direction];
  const phase = english
    ? { start: 'Start · facing the walking route', straight: 'Continue along the route', arrival: 'Destination nearby',
        approach: 'Before the junction', turn: 'Junction · entering the next path', depart: 'After the junction · onward path' }[frame.phase]
    : { start: '출발 · 걸어갈 방향', straight: '다음 구간으로 이동', arrival: '목적지 부근',
        approach: '진입 전 · 갈림 지점 확인', turn: '진입 지점 · 들어갈 길 확인', depart: '진입 후 · 이어지는 길 확인' }[frame.phase];
  return [phase, frame.important ? action : '', !english ? frame.description : ''].filter(Boolean).join(' · ');
}

function walkPreviewStepInstruction(frame, english = false) {
  if (frame.landmark) return frame.phase === 'landmark-start'
    ? (english ? `Start at ${frame.landmark.label}. Check the exit and the road ahead.` : `${frame.landmark.label}에서 출발해요. 출구와 앞으로 걸어갈 길을 확인해 주세요.`)
    : (english ? `${frame.landmark.label}: check the entrance ahead.` : `${frame.landmark.label} 입구를 확인해 주세요.`);
  if (frame.phase === 'arrival') return english
    ? 'Near the destination. Check the actual entrance ahead.' : '목적지 부근이에요. 앞쪽의 실제 입구를 확인해 주세요.';
  const action = direction => english
    ? ({left:'turn left',right:'turn right',uturn:'turn back',straight:'continue straight through the junction'}[direction] || 'continue along the route')
    : ({left:'좌회전',right:'우회전',uturn:'뒤로 돌아 이동',straight:'갈림길에서 직진'}[direction] || '경로를 따라 이동');
  if (frame.junctionCue || frame.phase === 'turn') {
    const direction = frame.junctionCue ? 'straight' : frame.direction;
    if (direction === 'straight') return english ? 'Continue straight through this junction.' : '이 갈림길에서는 앞쪽 길로 직진하세요.';
    return english ? `Here, ${action(direction)}.` : `여기서 ${action(direction)}하세요.`;
  }
  const decision = frame.phase === 'approach' && Number.isFinite(frame.focusMeters)
    ? {meters:frame.focusMeters,direction:frame.direction} : frame.nextDecision;
  const remaining = Math.max(0,(decision?.meters ?? frame.total)-frame.meters);
  const distance = Math.max(1,Math.round(remaining));
  if (decision?.direction === 'straight') return english
    ? `Continue straight through the junction about ${distance} m ahead.` : `약 ${distance}m 앞 갈림길에서도 직진하세요.`;
  if (decision) return english
    ? `Continue about ${distance} m, then ${action(decision.direction)}.`
    : `약 ${distance}m 직진 후 ${action(decision.direction)}하세요.`;
  return english ? `Continue along the route for about ${distance} m to the destination.`
    : `목적지까지 약 ${distance}m, 길을 따라 계속 이동하세요.`;
}

function walkPreviewCameraPov(frame, photoContext, photoDate) {
  if (frame.verifiedView) {
    const { pan, tilt, fov } = frame.verifiedView;
    return { pan, tilt, fov };
  }
  const stationExit = frame.landmark?.kind === 'station-exit';
  let heading = photoContext.heading;
  // Show the exit canopy together with the pavement/road, not only its number.
  let fov = stationExit ? 100 : 75;
  // Center the entrance first. The following departure scene turns towards
  // the walking route; biasing this introduction can push the exit offscreen.
  // Visually checked sign framing for this capture only. The entrance POI points
  // inside the stairwell, while the visible number sign is on the roadside canopy.
  // Do not carry a photograph-specific adjustment to another station or newer image.
  if (stationExit && frame.landmark.label.replace(/\s/g, '') === '어린이대공원역1번출구'
      && photoDate === '2023-10-30 10:52:14') {
    heading += 28;
    fov = 38;
  }
  return { pan: (heading + 180) % 360 - 180, tilt: stationExit ? 4 : 0, fov };
}


// Dense route candidates, with slower approach/turn/departure frames.
// Physical duplicate photographs are removed during playback, not by dropping connecting roads.
function walkPreviewSceneFrames(frames) {
  return frames.map((frame, sceneSlot) => ({ ...frame, sceneSlot }));
}

// A small ground-plane cue, not a screen-fixed direction icon. Use the actual
// camera position and POV, so dragging/zooming cannot leave it pointing elsewhere.
// POV contract: navermaps.github.io/maps.js.ncp/docs/naver.maps.Panorama.html
function walkPreviewTurnArrow(frame, capture, photo, pov, width, height) {
  const approach = frame?.phase === 'approach' && frame.turnPosition && frame.turnAhead;
  // Normal straight roads and post-turn departure scenes stay uncluttered.
  // Only confirmed junction windows may opt into a straight-through cue.
  const connecting = frame?.phase === 'straight' && frame.junctionCue === true;
  const junction = frame?.important && /교차로|사거리|삼거리|갈림길|갈래길|분기|횡단보도/.test(frame.description || '');
  if ((!approach && !connecting && frame?.phase !== 'turn') || (!connecting && frame.turnAngle < 35 && !junction) || frame.landmark || !capture
      || !photo || photo.nearby || photo.offset > (connecting ? 20 : 18) || photo.lateral > 12
      || (!connecting && photo.meters > frame.meters + 5) || !(width > 0 && height > 0)
      || ![pov?.pan, pov?.tilt, pov?.fov].every(Number.isFinite)) return null;
  const radians = Math.PI / 180;
  // Straight scene photographs can be snapped ahead of the requested sample.
  // Start from their actual route projection, never draw backwards to the sample.
  const anchor = approach ? frame.turnPosition : connecting && photo.point ? photo.point : frame.position;
  const target = approach ? frame.turnAhead : connecting && frame.cueAhead ? frame.cueAhead : frame.ahead;
  const heading = walkPreviewBearing(anchor, target) * radians;
  // On connecting scenes indicate the route bearing ahead of the camera.
  // The walking line is often on the sidewalk while the camera is in the road;
  // projecting that lateral offset would put a simple forward cue off-screen.
  // Actual corner cues retain their geographic anchor.
  const east = connecting ? 0 : (anchor[0] - capture[0]) * Math.cos(capture[1] * radians) * 111320;
  const north = connecting ? 0 : (anchor[1] - capture[1]) * 111320;
  if (Math.hypot(east, north) > 25 || walkPreviewDistance(anchor, target) < (approach ? 4 : 13)) return null;
  const pan = pov.pan * radians, tilt = pov.tilt * radians;
  const focal = width / (2 * Math.tan(Math.max(20, Math.min(100, pov.fov)) * radians / 2));
  // Approximate flat pavement at camera height 2.4 m. This is a directional cue,
  // not a surveyed ground anchor; uncertain/off-screen placements are suppressed.
  const at = (side, forward) => [east + Math.sin(heading) * forward + Math.cos(heading) * side,
    north + Math.cos(heading) * forward - Math.sin(heading) * side];
  let polygon = [[-.32,8],[.32,8],[.32,11],[.95,11],[0,13],[-.95,11],[-.32,11]].map(p=>at(...p));
  if (approach) {
    const incoming = walkPreviewBearing(frame.position, anchor) * radians;
    const vi = [Math.sin(incoming),Math.cos(incoming)], vo = [Math.sin(heading),Math.cos(heading)];
    if (1 + vi[0]*vo[0] + vi[1]*vo[1] < .25) return null;
    // Compact rounded elbow: equal-length legs, no long miter or stretched tip.
    const center = [east,north], curveStart = center.map((v,i)=>v-vi[i]*.9);
    const curveEnd = center.map((v,i)=>v+vo[i]*.9);
    const left = [], right = [];
    const edge = (p,tangent) => {
      const length = Math.hypot(...tangent);
      const normal = [tangent[1]/length,-tangent[0]/length];
      left.push(p.map((v,i)=>v-normal[i]*.25));
      right.push(p.map((v,i)=>v+normal[i]*.25));
    };
    edge(center.map((v,i)=>v-vi[i]*2.4),vi);
    for (let step=0;step<=6;step+=1) {
      const t=step/6;
      edge(center.map((_,i)=>(1-t)**2*curveStart[i]+2*(1-t)*t*center[i]+t*t*curveEnd[i]),
        center.map((_,i)=>(1-t)*(center[i]-curveStart[i])+t*(curveEnd[i]-center[i])));
    }
    edge(at(0,1.5),vo);
    polygon = [...right,at(.65,1.5),at(0,2.7),at(-.65,1.5),...left.reverse()];
  }
  const projected = polygon.map(([e, n]) => {
    const right = e * Math.cos(pan) - n * Math.sin(pan);
    const ahead = e * Math.sin(pan) + n * Math.cos(pan);
    const depth = ahead * Math.cos(tilt) - 2.4 * Math.sin(tilt);
    const up = -2.4 * Math.cos(tilt) - ahead * Math.sin(tilt);
    if (depth < 3) return null;
    return [width / 2 + focal * right / depth, height / 2 - focal * up / depth];
  });
  if (projected.some(p => !p || !p.every(Number.isFinite) || p[0] < 14 || p[0] > width-14 || p[1] < 18 || p[1] > height-18)) return null;
  if (approach) {
    // Preserve aspect ratio while limiting a close-up turn's visual footprint.
    const xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const scale=Math.min(1,width*.16/(maxX-minX),height*.2/(maxY-minY));
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    for (const p of projected) { p[0]=cx+(p[0]-cx)*scale; p[1]=cy+(p[1]-cy)*scale; }
  }
  return projected.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
}

function stopWalkPreview(hidePanel = false) {
  const state = walkPreviewState;
  if (!state) return;
  clearTimeout(state.timer);
  clearTimeout(state.seekTimer);
  state.playing = false;
  if (state.instruction) {
    state.instruction.textContent = state.originalInstruction.text;
    state.instruction.hidden = state.originalInstruction.hidden;
    state.instruction.style.minHeight = state.originalInstruction.minHeight;
  }
  for (const layer of state.layers) state.disposeLayer(layer);
  state.viewer.replaceChildren();
  state.scene.hidden = true;
  if (state.transportOptions) state.transportOptions.style.display = state.transportDisplay;
  state.visual.classList.remove('walk-preview-open');
  state.visual.classList.remove('walk-preview-map-fallback');
  state.fallbackMarker?.setMap(null);
  state.mapElement.inert = false;
  state.mapElement.removeAttribute('aria-hidden');
  state.walkButton?.setAttribute('aria-expanded', 'false');
  state.prev.onclick = state.next.onclick = state.play.onclick = state.close.onclick = null;
  state.seek.oninput = state.seek.onchange = state.seek.onpointerdown = state.seek.onpointerup = state.seek.onpointercancel = null;
  state.visual.removeEventListener('keydown', state.onKeyDown);
  state.panel.removeEventListener('keydown', state.onKeyDown);
  if (hidePanel && state.panel.isConnected) state.panel.hidden = true;
  walkPreviewState = null;
}

function startWalkPreview(context, choice) {
  stopWalkPreview(true);
  const panel = document.querySelector('#walk-preview');
  const viewer = document.querySelector('#walk-preview-panorama');
  const scene = document.querySelector('#walk-preview-scene');
  const visual = scene?.closest('.route-visual');
  const mapElement = visual?.querySelector('.naver-map');
  const walkButton = visual?.querySelector('.walk-action');
  if (!panel || !viewer || !scene || !visual || !mapElement) return;
  const frames = walkPreviewSceneFrames(walkPreviewEndpointFrames(walkPreviewFrames(choice.paths, choice.maneuvers), context, choice.paths));
  if (!frames.length) {
    if (panel) {
      panel.hidden = false;
      for (const selector of ['#walk-preview-prev', '#walk-preview-next', '#walk-preview-play', '#walk-preview-seek']) panel.querySelector(selector).disabled = true;
      panel.querySelector('#walk-preview-message').textContent = context.english
        ? 'The route contains a gap. Use the map instead of a street-view preview.'
        : '경로가 이어지지 않는 구간이 있어요. 로드뷰 대신 지도를 확인해 주세요.';
      panel.querySelector('#walk-preview-message').style.display = '';
    }
    return;
  }
  const transportOptions = document.querySelector('.transport-options');
  const transportDisplay = transportOptions?.style.display || '';
  if (transportOptions) transportOptions.style.display = 'none';
  panel.querySelector('#walk-preview-progress-text').textContent = context.english ? 'Loading the walking sequence…' : '걸어갈 길의 거리뷰를 순서대로 준비하고 있어요.';
  const seek = panel.querySelector('#walk-preview-seek');
  seek.value = '0';
  seek.max = '0';
  seek.disabled = true;
  seek.style.setProperty('--seek-fill', '0%');
  panel.hidden = false;
  scene.hidden = false;
  visual.classList.add('walk-preview-open');
  mapElement.inert = true;
  mapElement.setAttribute('aria-hidden', 'true');
  walkButton?.setAttribute('aria-expanded', 'true');
  const state = {
    ...context,
    panel, viewer, scene, visual, mapElement, walkButton, transportOptions, transportDisplay,
    close: scene.querySelector('#walk-preview-close'),
    frames, index: 0, playing: true, loading: false,
    timer: null, panorama: null, fallbackMarker: null, skippedScenes: 0, shownScenes: 0,
    layers: new Set(), activeLayer: null, pendingLayer: null,
    history: [], cursor: -1, finished: false, revisiting: false, duplicateScenes: 0,
    message: panel.querySelector('#walk-preview-message'),
    progress: panel.querySelector('#walk-preview-progress-text'),
    seek, seekTimer: null, scrubbing: false,
    prev: panel.querySelector('#walk-preview-prev'),
    next: panel.querySelector('#walk-preview-next'),
    play: panel.querySelector('#walk-preview-play')
  };
  state.instruction = panel.querySelector('#route-endpoints');
  state.originalInstruction = state.instruction ? { text:state.instruction.textContent,
    hidden:state.instruction.hidden, minHeight:state.instruction.style.minHeight || '' } : null;
  const updateInstruction = (frame, photo = null) => {
    if (!state.instruction) return;
    state.instruction.hidden = false;
    state.instruction.style.minHeight = '3em';
    state.instruction.textContent = walkPreviewStepInstruction(frame,state.english)
      + (photo?.nearby ? (state.english ? ' · Nearby photograph; confirm the junction on the map.' : ' · 주변에서 촬영된 사진이에요. 꺾는 위치는 지도로 확인해 주세요.') : '');
  };
  updateInstruction(frames[0]);
  state.disposeLayer = (layer) => {
    if (!layer) return;
    clearTimeout(layer.retireTimer);
    clearTimeout(layer.settleTimer);
    layer.arrowResize?.disconnect();
    try {
      if (layer.panorama) {
        state.maps.Event.clearInstanceListeners(layer.panorama);
        layer.panorama.setVisible(false);
      }
    } catch { /* Detached viewer. */ }
    layer.element.remove();
    state.layers.delete(layer);
  };
  // Keep the starting view and a small recent-view cache, not every WebGL viewer.
  const retainLayer = (layer) => {
    if (!layer || layer === state.activeLayer) return;
    clearTimeout(layer.retireTimer);
    layer.element.style.opacity = '0';
    layer.element.style.pointerEvents = 'none';
    for (const candidate of state.layers) {
      if (state.layers.size <= 5) break;
      if (candidate !== state.activeLayer && candidate !== state.pendingLayer
          && candidate.sceneCursor !== 0) state.disposeLayer(candidate);
    }
  };
  walkPreviewState = state;
  state.play.disabled = false;
  state.play.textContent = state.english ? 'Pause' : '일시정지';
  const valid = () => walkPreviewState === state
    && currentPage === 'guide'
    && state.requestId === routeRequestToken
    && document.querySelector('#walk-preview') === panel;
  const hideTurnArrows = () => {
    for (const layer of state.layers) if (layer.turnArrow) layer.turnArrow.hidden = true;
  };
  const attachTurnArrow = (layer, frame, capture, photo, panoId) => {
    if (!['approach','turn'].includes(frame.phase) && !(frame.phase === 'straight' && frame.junctionCue)) {
      layer.arrowContext = null;
      if (layer.turnArrow) layer.turnArrow.hidden = true;
      return;
    }
    layer.arrowContext = { frame, capture, photo, panoId };
    if (!layer.turnArrow) {
      const cue = document.createElement('div');
      cue.className = 'walk-turn-ground-arrow';
      cue.setAttribute('aria-hidden', 'true');
      cue.style.cssText = 'position:absolute;inset:0;z-index:3;pointer-events:none';
      cue.innerHTML = '<svg width="100%" height="100%" style="display:block;overflow:hidden" aria-hidden="true"><polygon fill="#16c6f4" fill-opacity=".88" stroke="#e3faff" stroke-width="1.5" stroke-linejoin="round" style="filter:drop-shadow(0 2px 2px #00314d)"/></svg>';
      cue.hidden = true;
      layer.element.append(cue);
      layer.turnArrow = cue;
      layer.updateTurnArrow = () => {
        const context = layer.arrowContext;
        cue.hidden = true;
        if (!context || !valid() || state.activeLayer !== layer || state.visual.classList.contains('walk-preview-map-fallback')
            || layer.panorama.getPanoId?.() !== context.panoId) return;
        const size = layer.element.getBoundingClientRect();
        const points = walkPreviewTurnArrow(context.frame, context.capture, context.photo,
          layer.panorama.getPov?.(), size.width, size.height);
        if (!points) return;
        cue.querySelector('polygon')?.setAttribute('points', points);
        cue.hidden = false;
      };
      state.maps.Event.addListener(layer.panorama, 'pov_changed', layer.updateTurnArrow);
      state.maps.Event.addListener(layer.panorama, 'pano_changed', () => { cue.hidden = true; });
      if (typeof ResizeObserver !== 'undefined') {
        layer.arrowResize = new ResizeObserver(layer.updateTurnArrow);
        layer.arrowResize.observe(layer.element);
      }
    }
    layer.updateTurnArrow();
  };
  const scheduleNext = () => {
    clearTimeout(state.timer);
    if (!valid() || !state.playing || state.scrubbing) return;
    if (state.finished && (state.freeSeek ? state.index === frames.length - 1 : state.cursor === state.history.length - 1)) {
      state.playing = false;
      state.play.textContent = state.english ? 'Replay' : '다시 보기';
      return;
    }
    state.timer = setTimeout(advance, frames[state.index].holdMs);
  };
  const updateButtons = () => {
    // Loading is transient, not a navigation boundary. Base controls on the
    // visible scene so every background panorama request cannot flash them.
    const cursor = state.activeLayer?.sceneCursor ?? state.cursor;
    const index = state.history[cursor]?.index ?? state.index;
    state.prev.disabled = state.scrubbing || !state.history.length || (state.freeSeek ? index === 0 : cursor <= 0);
    state.next.disabled = state.scrubbing || !state.history.length || (state.finished && (state.freeSeek ? index === frames.length - 1 : cursor === state.history.length - 1));
    state.play.disabled = state.scrubbing;
    // The seek control stays usable even while the next photograph is loading.
    state.seek.disabled = !state.history.length || frames.length < 2;
  };

  const updateSeek = (index = state.index) => {
    // A stable full-route timeline allows seeking into uncached sections too.
    const max = Math.max(0, frames.length - 1);
    state.seek.max = String(max);
    state.seek.value = String(Math.max(0, Math.min(max, index)));
    state.seek.style.setProperty('--seek-fill', (max ? 100 * Number(state.seek.value) / max : 0) + '%');
    const frame = frames[index];
    state.seek.setAttribute('aria-valuetext', state.english
      ? `${Math.round(frame.meters)} m of ${Math.round(frame.total)} m`
      : `전체 ${Math.round(frame.total)}m 중 ${Math.round(frame.meters)}m`);
  };

  const updateProgress = () => {
    const frame = frames[state.index];
    // Lookup candidates are not displayed scenes: missing/duplicate photographs
    // must never make the visible scene counter jump from 2 to 30.
    const sceneNumber = Math.max(1, new Set(state.history
      .filter(entry => entry.index <= state.index).map(entry => entry.index)).size);
    const count = '';
    state.progress.textContent = state.english
      ? 'Scene ' + sceneNumber + count + ' · ' + Math.round(frame.meters) + ' m of ' + Math.round(frame.total) + ' m'
      : '장면 ' + sceneNumber + count + ' · 전체 ' + Math.round(frame.total) + 'm 중 ' + Math.round(frame.meters) + 'm';
    if (!state.scrubbing) updateSeek();
  };
  const finishScan = () => {
    hideTurnArrows();
    state.finished = true;
    state.playing = false;
    state.loading = false;
    state.play.textContent = state.english ? 'Replay' : '다시 보기';
    if (state.history.length) {
      // Retain the last real photograph; never call a missing tail "arrival".
      state.cursor = state.activeLayer?.sceneCursor ?? state.history.length - 1;
      state.index = state.history[state.cursor].index;
      state.viewer.style.visibility = 'visible';
      state.visual.classList.remove('walk-preview-map-fallback');
      state.fallbackMarker?.setMap(null);
      updateProgress();
      updateButtons();
      state.message.textContent = (state.activeLayer?.caption || state.message.textContent) + (state.english
        ? ' · Last available scene. Check the map for any remaining section.'
        : ' · 마지막 확인 가능한 장면이에요. 남은 구간은 지도를 확인해 주세요.');
      updateInstruction(frames[state.index]);
      if (state.instruction && state.index < frames.length-1) state.instruction.textContent += state.english
        ? ' · Last available street view; use the map for the remaining route.' : ' · 거리뷰는 여기까지예요. 남은 구간은 지도로 확인해 주세요.';
    } else {
      state.message.textContent = state.english
        ? 'No usable street images were found along this route. Please use the map.'
        : '이 경로에서 사용할 수 있는 거리뷰를 찾지 못했어요. 지도를 확인해 주세요.';
      updateButtons();
    }
  };
  const advance = () => {
    if (!valid()) return;
    if (state.freeSeek) {
      if (state.index < frames.length - 1) seekFrame(state.index + 1, !state.playing);
      else finishScan();
      return;
    }
    if (state.cursor + 1 < state.history.length) {
      state.cursor += 1;
      showFrame(state.history[state.cursor].index, true);
    } else {
      let nextIndex = state.index + 1;
      while (nextIndex < frames.length && frames[nextIndex].sceneSlot === frames[state.index].sceneSlot) nextIndex += 1;
      if (nextIndex < frames.length) showFrame(nextIndex);
      else finishScan();
    }
  };
  const unavailable = (message) => {
    hideTurnArrows();
    clearTimeout(state.timer);
    state.loading = false;
    state.disposeLayer(state.pendingLayer);
    state.pendingLayer = null;
    state.panorama = null;
    const missingLandmark = frames[state.index].landmark;
    if (missingLandmark) {
      if (frames[state.index].phase === 'landmark-start') state.missingStartLandmark = true;
      else state.missingEndLandmark = true;
    }
    // Keep the last confirmed scene while seeking, rather than flashing the map.
    const seeking = !state.revisiting && !state.directSeek && state.playing && state.index < frames.length - 1;
    if (seeking && state.activeLayer && !missingLandmark && !frames[state.index].important) {
      state.loading = true;
      state.skippedScenes += 1;
      updateButtons();
      state.timer = setTimeout(() => showFrame(state.index + 1), 80);
      return;
    }
    state.viewer.style.visibility = 'hidden';
    state.visual.classList.add('walk-preview-map-fallback');
    const point = missingLandmark?.position || frames[state.index].position;
    if (state.maps.Marker) {
      state.fallbackMarker?.setMap(null);
      state.fallbackMarker = new state.maps.Marker({
        map: state.map, position: new state.maps.LatLng(point[1], point[0]),
        title: state.english ? 'Preview point · street image unavailable' : '현재 미리보기 지점 · 거리뷰 없음',
        icon: { content: '<span style="display:block;padding:5px 8px;border:2px solid #fff;border-radius:14px;background:#9b5500;color:#fff;font-size:12px;font-weight:700;white-space:nowrap">' + (state.english ? 'Viewpoint' : '확인 지점') + '</span>' }
      });
    }
    state.message.textContent = missingLandmark
      ? `${missingLandmark.label} · ` + (state.english ? 'No suitable entrance photograph was found. This map marker is the requested entrance, not a confirmed photograph.' : '해당 출입구를 보여줄 적절한 사진을 찾지 못했어요. 지도에 표시한 출입구 위치를 확인해 주세요.')
      : walkPreviewCue(frames[state.index], state.english) + ' · ' + message;
    state.message.style.display = '';
    updateInstruction(frames[state.index]);
    updateButtons();
    // Missing imagery must not strand playback on a map at the first campus/alley point.
    // Keep manual inspection paused, but auto-play scans forward to the next available view.
    state.skippedScenes += 1;
    if (!state.revisiting && !state.directSeek && state.playing && state.index < frames.length - 1) {
      const nextIndex = state.index + 1;
      state.message.textContent += state.english
        ? ' · Looking for the next available street image…' : ' · 다음 거리뷰가 있는 구간으로 이동 중이에요.';
      state.timer = setTimeout(() => showFrame(nextIndex), missingLandmark ? 3000 : frames[state.index].important ? 1400 : 350);
    } else if (!state.directSeek && !state.revisiting && state.index === frames.length - 1) {
      if (missingLandmark) {
        state.finished = true;
        state.playing = false;
        state.play.textContent = state.english ? 'Replay' : '다시 보기';
        updateButtons();
      } else finishScan();
    } else if (state.revisiting) {
      state.playing = false;
      state.play.textContent = state.english ? 'Play' : '자동 재생';
    }
  };
  const showFrame = (index, revisiting = false, directSeek = false) => {
    if (!valid()) return;
    hideTurnArrows();
    clearTimeout(state.timer);
    state.disposeLayer(state.pendingLayer);
    state.pendingLayer = null;
    state.index = Math.max(0, Math.min(frames.length - 1, index));
    const known = state.history.findIndex(entry => entry.index === state.index);
    if (known >= 0) { state.cursor = known; revisiting = true; }
    state.revisiting = revisiting;
    state.directSeek = directSeek;
    state.loading = true;
    state.visual.classList.remove('walk-preview-map-fallback');
    state.fallbackMarker?.setMap(null);
    const frame = frames[state.index];
    updateButtons();
    if (!state.activeLayer) state.message.textContent = walkPreviewCue(frame, state.english) + (state.english ? ' · Loading street view...' : ' · 거리뷰를 불러오는 중이에요.');
    // Keep the previous real panorama on screen until the next view has loaded.
    // Hiding it here made every position change flash the underlying map.
    if (!state.history.length && !revisiting) state.viewer.style.visibility = 'hidden';
    const saved = revisiting ? state.history[state.cursor] : null;
    const retained = saved && [...state.layers].find(layer => layer.sceneCursor === state.cursor);
    if (retained) {
      clearTimeout(retained.retireTimer);
      const outgoing = state.activeLayer;
      state.activeLayer = retained;
      state.panorama = retained.panorama;
      state.loading = false;
      try { retained.panorama.setPov(retained.pov); } catch { /* Keep cached photograph. */ }
      retained.element.style.transition = 'none';
      retained.element.style.opacity = '1';
      retained.element.style.pointerEvents = 'auto';
      state.viewer.style.visibility = 'visible';
      if (outgoing !== retained) retainLayer(outgoing);
      attachTurnArrow(retained, frame, saved.capturePoint, saved.photoContext, saved.panoId);
      state.message.textContent = retained.caption || '';
      state.message.style.display = 'none';
      updateInstruction(frame, saved.photoContext);
      updateProgress();
      updateButtons();
      scheduleNext();
      return;
    }
    const departure = !revisiting && frame.phase === 'start'
      && frames[state.history.at(-1)?.index]?.phase === 'landmark-start' ? state.history.at(-1) : null;
    const selectedPanoId = saved?.panoId || frame.verifiedView?.panoId || departure?.panoId;
    const target = saved?.capturePoint || frame.position;
    const position = new state.maps.LatLng(target[1], target[0]);
    if (!state.maps.Panorama) {
      unavailable(state.english ? 'Street view is unavailable here. Follow the map route.' : '이 구간은 거리뷰를 볼 수 없어요. 지도 경로를 확인해 주세요.');
      return;
    }
    state.timer = setTimeout(() => {
      if (!valid() || !state.loading) return;
      unavailable(state.english ? 'Street view took too long. Check the map.' : '거리뷰 응답이 늦어요. 지도를 확인해 주세요.');
    }, 9000);
    try {
      {
        state.disposeLayer(state.pendingLayer);
        const element = document.createElement('div');
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        element.style.cssText = 'position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity '
          + (reduceMotion ? '0ms' : '450ms') + ' ease-in-out';
        viewer.append(element);
        const layer = { element, panorama: null, retireTimer: null, settleTimer: null, readyStarted: false };
        state.pendingLayer = layer;
        state.layers.add(layer);
        state.panorama = new state.maps.Panorama(element, {
          ...(selectedPanoId ? { panoId: selectedPanoId } : { position }),
          pov: { pan: (walkPreviewBearing(frame.position, frame.ahead) + 180) % 360 - 180, tilt: 0, fov: 75 },
          zoomControl: true, aroundControl: false, flightSpot: false, logoControl: false
        });
        layer.panorama = state.panorama;
        const instance = state.panorama;
        state.maps.Event.addListener(instance, 'pano_status', (status) => {
          if (!valid() || state.panorama !== instance || !state.loading || layer.readyStarted) return;
          if (status !== 'OK') {
            unavailable(state.english ? 'No street image for this section. See the route on the map.' : '이 구간에는 거리뷰가 없어요. 지도 경로를 확인해 주세요.');
          }
          // OK only confirms the lookup; getLocation may still describe the previous image.
        });
        const onPanoramaReady = () => {
          if (!valid() || state.panorama !== instance || !state.loading || layer.readyStarted) return;
          layer.readyStarted = true;
          clearTimeout(state.timer);
          const frameNow = frames[state.index];
          const capture = state.panorama.getLocation()?.coord;
          const capturePoint = capture && [capture.lng(), capture.lat()];
          // The entrance photograph has already passed the landmark proximity check.
          // Reuse it for the first head turn even if its camera is off the route line.
          const photoContext = saved?.photoContext || (departure && capturePoint
            ? { offset: walkPreviewDistance(capturePoint, frameNow.position), meters: frameNow.meters,
                lateral: 0, nearby: false, heading: walkPreviewBearing(capturePoint, frameNow.ahead) }
            : walkPreviewPhotoContext(capturePoint, frameNow, choice.paths));
          if (!photoContext) {
            unavailable(state.english ? 'No close street image for this route point. Check the map.' : '이 지점과 가까운 거리뷰가 없어요. 다른 길 사진 대신 지도를 확인해 주세요.');
            return;
          }
          if (departure && photoContext.lateral > 3) {
            // The camera may stand on the road: look towards the actual footpath,
            // not parallel to it along the centre of the traffic lanes.
            photoContext.heading = walkPreviewBearing(capturePoint, frameNow.ahead);
          }

          const location = state.panorama.getLocation();
          const panoId = state.panorama.getPanoId?.() || location?.panoId || null;
          // The same provider photograph can be returned for many nearby route points.
          // Count physical scenes, not queries or changes to the camera angle.
          // Approach / turn / departure are distinct route instructions even when
          // the provider returns the same camera and a very similar heading.
          const duplicate = !frameNow.important && state.history.some((entry) => {
            const samePlace = panoId && entry.panoId ? entry.panoId === panoId
              : (capturePoint && walkPreviewDistance(entry.capturePoint, capturePoint) < 2);
            // Endpoint views are intentional: an exit-facing view followed by the walking direction.
            // Arrival must not be discarded just because the last road image used the same panorama.
            const endpointTransition = frameNow.landmark || frames[entry.index].landmark;
            const angle = Math.abs(((photoContext.heading - entry.heading + 540) % 360) - 180);
            return samePlace && !frameNow.landmark && !((endpointTransition || frameNow.important) && angle >= 15);
          });
          const previousScene = state.history[state.activeLayer?.sceneCursor] || state.history.at(-1);
          const backwards = !frameNow.landmark && previousScene && photoContext.meters < previousScene.routeMeters - 6;
          if (state.playing && !state.revisiting && !state.directSeek && backwards && frameNow.important) {
            // Never silently discard an intersection, or show a backward camera
            // as though it were the next alley. Keep this decision point on the map.
            unavailable(state.english ? 'The available photo is behind this junction. Check the turn on the map.'
              : '이 갈림길의 사진은 이전 구간으로 잡혀요. 지도에서 꺾는 위치를 확인해 주세요.');
            return;
          }
          if (state.playing && !state.revisiting && !state.directSeek && (duplicate || backwards)) {
            state.duplicateScenes += 1;
            state.disposeLayer(layer);
            state.pendingLayer = null;
            state.panorama = null;
            // Keep navigation locked during the seek even when manually paused.
            state.timer = setTimeout(() => {
              if (!valid()) return;
              if (state.index < frames.length - 1) showFrame(state.index + 1);
              else finishScan();
            }, 80);
            return;
          }
          const cameraPov = saved?.pov || walkPreviewCameraPov(frameNow, photoContext, location?.photodate);
          layer.pov = cameraPov;
          layer.panoId = panoId;
          try {
            // Route-relative heading avoids looking backwards when the photo snaps past the target.
            state.panorama.setPov(cameraPov);
          } catch {
            // If camera control is unavailable, keep the panorama navigable by hand.
          }
          // pano_changed can fire before initialization/rendering is complete. Start from init,
          // settle the corrected camera offscreen, then reveal it without a visible pan/zoom.
          const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!valid() || state.panorama !== instance || state.pendingLayer !== layer) return;
            state.loading = false;
            if (!state.revisiting) {
              state.history.push({ index: state.index, panoId, capturePoint, heading: photoContext.heading,
                focusMeters: frameNow.focusMeters, routeMeters: photoContext.meters,
                photoContext: { ...photoContext }, pov: { ...cameraPov } });
              state.cursor = state.history.length - 1;
              state.shownScenes = state.history.length;
            }
            if (state.index === frames.length - 1) state.finished = true;
            updateProgress();
            state.viewer.style.visibility = 'visible';
            const previousLayer = state.activeLayer;
            state.activeLayer = layer;
            updateInstruction(frameNow, photoContext);
            layer.sceneCursor = state.cursor;
            state.pendingLayer = null;
            hideTurnArrows();
            attachTurnArrow(layer, frameNow, capturePoint, photoContext, panoId);
            updateButtons();
            // Manual navigation is a cut, never a delayed overlap of two locations.
            const instant = !state.playing || state.directSeek;
            if (instant) element.style.transition = 'none';
            element.style.pointerEvents = 'auto';
            requestAnimationFrame(() => {
              if (!valid() || state.activeLayer !== layer) return;
              element.style.opacity = '1';
              if (previousLayer && previousLayer !== layer) {
                previousLayer.element.style.pointerEvents = 'none';
                // Keep the outgoing photograph opaque underneath the incoming fade.
                if (instant || reduceMotion) retainLayer(previousLayer);
                else previousLayer.retireTimer = setTimeout(() => retainLayer(previousLayer), 500);
              }
            });
            const photoDate = state.panorama.getLocation()?.photodate;
            const cue = photoContext.nearby
              ? (state.english ? `Nearby street view · about ${Math.round(photoContext.offset)} m from the preview point; check the map for the turn`
                : `주변 거리뷰 · 안내 지점에서 약 ${Math.round(photoContext.offset)}m 떨어진 촬영 위치예요. 꺾는 위치는 지도를 함께 확인해 주세요.`)
              : walkPreviewCue(frameNow, state.english);
            const skipped = state.missingStartLandmark
              ? (state.english ? ' · The starting entrance photograph was unavailable' : ' · 출발 출입구 사진은 확인하지 못했어요')
              : state.skippedScenes
              ? (state.english ? ' · Sections without street imagery were skipped' : ' · 거리뷰 없는 일부 구간은 건너뛰었어요') : '';
            state.message.textContent = cue + skipped
              + (state.english ? ` · Street image${photoDate ? ` from ${photoDate}` : ''}`
                : ` · 거리뷰${photoDate ? ` 촬영 ${photoDate}` : ''}`);
            layer.caption = state.message.textContent;
            state.message.style.display = 'none';
            if (state.finished && state.cursor === state.history.length - 1 && !frameNow.landmark) {
              state.message.textContent += state.english ? ' · Last available scene; check the map for any remaining section.' : ' · 마지막 확인 가능한 장면이에요. 남은 구간은 지도를 확인해 주세요.';
            }
            scheduleNext();
          }));
          layer.settleTimer = setTimeout(() => {
            const outgoing = state.activeLayer;
            if (!valid() || state.pendingLayer !== layer) return;
            // Show a real turn of the head within the same photograph, not a jump
            // between different years/cameras. Reduced motion and seeking stay instant.
            if (reduceMotion || !state.playing || state.directSeek || state.revisiting || !outgoing || outgoing.panoId !== panoId
                || !outgoing.pov || !(departure || frameNow.important)) { reveal(); return; }
            const from = outgoing.panorama.getPov?.() || outgoing.pov;
            attachTurnArrow(outgoing, frameNow, capturePoint, photoContext, panoId);
            const delta = ((cameraPov.pan - from.pan + 540) % 360) - 180;
            let step = 0;
            const rotate = () => {
              if (!valid() || state.pendingLayer !== layer || state.activeLayer !== outgoing) return;
              const t = Math.min(1, ++step / 36), eased = t * t * (3 - 2 * t);
              try {
                outgoing.panorama.setPov({ pan: ((from.pan + delta * eased + 540) % 360) - 180,
                  tilt: from.tilt + (cameraPov.tilt - from.tilt) * eased,
                  fov: from.fov + (cameraPov.fov - from.fov) * eased });
              } catch { reveal(); return; }
              if (t < 1) layer.settleTimer = setTimeout(rotate, 20);
              else reveal();
            };
            rotate();
          }, !state.playing || state.directSeek ? 0 : 300);
        };
        state.onPanoramaReady = onPanoramaReady;
        state.maps.Event.addListener(instance, 'init', onPanoramaReady);
      }
    } catch {
      unavailable(state.english ? 'Street view could not be opened.' : '거리뷰를 열지 못했어요. 지도 경로를 확인해 주세요.');
    }
  };
  // Freeze autoplay and cancel only the in-flight layer, preserving the visible photograph.
  // This prevents late init/settle callbacks from overriding the user's selected scene.
  const beginScrub = () => {
    if (!valid() || !state.history.length) return;
    clearTimeout(state.timer);
    clearTimeout(state.seekTimer);
    state.playing = false;
    state.scrubbing = true;
    state.play.textContent = state.english ? 'Play' : '자동 재생';
    state.disposeLayer(state.pendingLayer);
    state.pendingLayer = null;
    state.panorama = state.activeLayer?.panorama || null;
    state.loading = false;
    if (Number.isInteger(state.activeLayer?.sceneCursor)) {
      state.cursor = state.activeLayer.sceneCursor;
      state.index = state.history[state.cursor].index;
    }
    updateButtons();
  };
  const commitScrub = () => {
    clearTimeout(state.seekTimer);
    if (!valid() || !state.scrubbing || !state.history.length) return;
    let selected = Math.max(0, Math.min(frames.length - 1, Math.round(Number(state.seek.value) || 0)));
    // The far left means the first available photograph, even if lookup point 0 had none.
    if (selected === 0) selected = Math.min(...state.history.map(entry => entry.index));
    state.scrubbing = false;
    if (state.index === selected) {
      updateProgress();
      updateButtons();
      return;
    }
    state.freeSeek = true;
    seekFrame(selected);
  };
  const seekFrame = (index, directSeek = true) => {
    const cached = state.history.findIndex(entry => entry.index === index);
    state.finished = index === frames.length - 1;
    if (cached >= 0) state.cursor = cached;
    showFrame(index, cached >= 0, directSeek);
  };
  state.seek.onpointerdown = () => { state.pointerSeeking = true; beginScrub(); };
  state.seek.oninput = () => {
    const selected = Math.max(0, Math.min(frames.length - 1, Number(state.seek.value)));
    beginScrub();
    if (!state.scrubbing) return;
    updateSeek(selected);
    state.progress.textContent = state.english
      ? `${Math.round(frames[selected].meters)} m along the route · release to view`
      : `경로 ${Math.round(frames[selected].meters)}m 지점 선택 · 손을 놓으면 이동해요`;
    // Debounce live previews so dragging does not launch a request per pixel.
    if (!state.pointerSeeking) state.seekTimer = setTimeout(commitScrub, 180);
  };
  state.seek.onchange = () => { if (!state.pointerSeeking) commitScrub(); };
  state.seek.onpointerup = state.seek.onpointercancel = () => {
    state.pointerSeeking = false;
    commitScrub();
  };
  state.prev.onclick = () => {
    if (!valid() || state.prev.disabled) return;
    beginScrub();
    state.scrubbing = false;
    if (state.freeSeek) {
      state.playing = false;
      clearTimeout(state.timer);
      state.play.textContent = state.english ? 'Play' : '자동 재생';
      const previous = state.history.filter(entry => entry.index < state.index)
        .reduce((best, entry) => Math.max(best, entry.index), -1);
      seekFrame(previous >= 0 ? previous : Math.max(0, state.index - 1));
      return;
    }
    const previous = state.history[state.cursor]?.index === state.index ? state.cursor - 1 : state.cursor;
    if (previous < 0) return;
    state.playing = false;
    clearTimeout(state.timer);
    state.play.textContent = state.english ? 'Play' : '자동 재생';
    state.cursor = previous;
    showFrame(state.history[state.cursor].index, true);
  };
  state.next.onclick = () => {
    if (!valid() || state.next.disabled) return;
    beginScrub();
    state.scrubbing = false;
    state.playing = false;
    clearTimeout(state.timer);
    state.play.textContent = state.english ? 'Play' : '자동 재생';
    advance();
  };
  state.play.onclick = () => {
    if (!valid()) return;
    if (state.finished && (state.freeSeek ? state.index === frames.length - 1 : state.cursor === state.history.length - 1) && !state.playing && !state.loading) {
      state.playing = true;
      state.finished = false;
      state.index = state.history[0]?.index ?? 0;
      updateProgress();
      state.play.textContent = state.english ? 'Pause' : '일시정지';
      if (state.history.length) {
        state.cursor = 0;
        showFrame(state.history[0].index, true);
      } else {
        state.finished = false;
        showFrame(0);
      }
      return;
    }
    state.playing = !state.playing;
    state.play.textContent = state.playing
      ? (state.english ? 'Pause' : '일시정지')
      : (state.english ? 'Play' : '자동 재생');
    if (state.playing && !state.loading) scheduleNext();
    else if (!state.playing && !state.loading) clearTimeout(state.timer);
  };
  state.close.onclick = () => {
    stopWalkPreview(true);
    walkButton?.focus({ preventScroll: true });
  };
  state.onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      state.close.onclick?.();
    }
  };
  visual.addEventListener('keydown', state.onKeyDown);
  panel.addEventListener('keydown', state.onKeyDown);
  state.index = 0;
  updateProgress();
  showFrame(0);
  state.close.focus({ preventScroll: true });
  // Avoid moving the controls through a smooth page scroll while the first image appears.
  visual.scrollIntoView({ behavior: 'auto', block: 'nearest' });
}

function selectGuideTransport(mode, userInitiated = false) {
  const choice = guideTransportRoutes[mode];
  const context = guideTransportContext;
  if (!choice || !context || context.requestId !== routeRequestToken || currentPage !== 'guide') return;
  const { maps, map, start, end, english } = context;
  if (userInitiated) context.userSelectedMode = mode;
  if (mode !== 'WALK') stopWalkPreview(true);

  let summary;
  if (mode === 'WALK') {
    clearRouteOverlays();
    const bounds = new maps.LatLngBounds();
    const startPoint = new maps.LatLng(start.latitude, start.longitude);
    const endPoint = new maps.LatLng(end.latitude, end.longitude);
    bounds.extend(startPoint);
    bounds.extend(endPoint);
    for (const coordinates of choice.paths) {
      const path = coordinates.map(([longitude, latitude]) => new maps.LatLng(latitude, longitude));
      path.forEach((point) => bounds.extend(point));
      routeMapOverlays.push(new maps.Polyline({
        map, path, strokeColor: '#20d5ff', strokeOpacity: .96, strokeWeight: 6
      }));
    }
    routeMapOverlays.push(new maps.Marker({ map, position: startPoint, title: '출발지' }));
    routeMapOverlays.push(new maps.Marker({ map, position: endPoint, title: destination.trim() }));
    map.fitBounds(bounds, 36);
    summary = english ? `Walk · about ${choice.minutes} min` : `도보 · 약 ${choice.minutes}분`;
    if (choice.distance > 0) summary += ` · ${Math.round(choice.distance)}m`;
    if (userInitiated) startWalkPreview(context, choice);
  } else if (mode === 'TAXI') {
    // A separate car-routing entitlement supplies the taxi estimate. Do not fabricate one.
    clearRouteOverlays();
    const bounds = new maps.LatLngBounds();
    const startPoint = new maps.LatLng(start.latitude, start.longitude);
    const endPoint = new maps.LatLng(end.latitude, end.longitude);
    bounds.extend(startPoint);
    bounds.extend(endPoint);
    routeMapOverlays.push(new maps.Marker({ map, position: startPoint, title: '출발지' }));
    routeMapOverlays.push(new maps.Marker({ map, position: endPoint, title: destination.trim() }));
    map.fitBounds(bounds, 36);
    summary = choice.summary;
  } else {
    drawTransitItinerary(maps, map, choice.itinerary, start, end);
    summary = `${english ? { BUS: 'Bus', SUBWAY: 'Subway' }[mode] : { BUS: '버스', SUBWAY: '지하철' }[mode]} · ${transportText(mode, choice.itinerary, english)}`;
  }
  setGuideAnswer(english
    ? `Route from ${mode === 'WALK' ? (start.landmark?.label || routeOrigin || 'your location') : (routeOrigin || 'your location')} to ${mode === 'WALK' ? (end.landmark?.label || destination) : destination}: ${summary}.`
    : `${mode === 'WALK' ? (start.landmark?.label || routeOrigin || '현재 위치') : (routeOrigin || '현재 위치')}에서 ${mode === 'WALK' ? (end.landmark?.label || destination) : destination}까지 ${summary} 경로를 확인했어요.`);
}

async function requestNaverTransitRoute(maps, map, start, end, isCurrent, instruction) {
  const english = routeLanguage === 'en';
  guideTransportRoutes = {};
  guideTransportContext = { maps, map, start, end, instruction, english, requestId: routeRequestToken };
  const endpointLabel = document.querySelector('#route-endpoints');
  if (endpointLabel && (start.landmark || end.landmark)) {
    const labels = `${start.landmark?.label || routeOrigin || (english ? 'Your location' : '현재 위치')} → ${end.landmark?.label || destination}`;
    endpointLabel.hidden = false;
    endpointLabel.textContent = (english ? 'Walking entrances: ' : '도보 출입구: ') + labels
      + ((start.landmark?.automatic || end.landmark?.automatic) ? (english ? ' · compared nearby entrance routes' : ' · 가까운 출입구 후보의 도보 경로 비교') : '');
    const title = document.querySelector('#walk-preview h2');
    if (title) title.textContent = labels;
  }
  const coordinates = {
    startX: start.longitude,
    startY: start.latitude,
    endX: end.longitude,
    endY: end.latitude
  };
  const walkButton = document.querySelector('.walk-action');
  if (instruction) instruction.textContent = english ? 'Checking walking time...' : '도보 시간을 확인하고 있어요.';
  (start.walkingRoute ? Promise.resolve({ok:true,json:async()=>start.walkingRoute}) : fetch('/api/walking/routes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(coordinates)
  })).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!isCurrent() || !instruction) return;
    const seconds = Number(payload.totalTime);
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const paths = Array.isArray(payload.paths)
      ? payload.paths.filter((path) => Array.isArray(path) && path.length > 1)
      : [];
    if (response.ok && Number.isFinite(seconds) && seconds > 0 && paths.length) {
      const distance = Number(payload.totalDistance) || paths.reduce((sum,path)=>sum+path.slice(1).reduce((n,p,i)=>n+walkPreviewDistance(path[i],p),0),0);
      guideTransportRoutes.WALK = { minutes, distance, paths, maneuvers: Array.isArray(payload.maneuvers) ? payload.maneuvers : [] };
      if (walkButton) walkButton.disabled = false;
      instruction.textContent = english ? `Walk · about ${minutes} min` : `도보 · 약 ${minutes}분`;
      if (endpointLabel) {
        const comparison = start.walkingComparison;
        const from = start.landmark?.label || routeOrigin || (english ? 'Your location' : '현재 위치');
        const to = end.landmark?.label || destination;
        endpointLabel.hidden = false;
        endpointLabel.textContent = english
          ? `${from} → ${to} · ${Math.round(distance)} m · about ${minutes} min`
          : `${from}${start.landmark?.kind === 'station-exit' ? '로 나와서' : ''} → ${to} · 약 ${Math.round(distance)}m · 약 ${minutes}분`;
        if (comparison) endpointLabel.textContent += english
          ? ` · shortest of ${comparison.checked} available routes (${comparison.candidates} requested)`
          : ` · 확인된 ${comparison.checked}개 경로 중 최단 (${comparison.candidates}개 비교 요청)`;
        if (!end.landmark) endpointLabel.textContent += english
          ? ' · Destination representative point; entrance not confirmed'
          : ' · 목적지 대표 위치 기준, 입구 미확인';
        endpointLabel.textContent += english ? ' · Signal waits may add time' : ' · 신호 대기 시간은 달라질 수 있어요';
        if (start.landmark?.kind === 'station-exit') endpointLabel.textContent += english
          ? ' · From outside the exit; indoor station travel excluded'
          : ' · 출구 밖 기준 (역 내부 이동 제외)';
      }
    } else {
      instruction.textContent = english ? 'Walking route unavailable' : '도보 경로 확인 불가';
    }
  }).catch(() => {
    if (isCurrent() && instruction) {
      instruction.textContent = english ? 'Walking time unavailable' : '도보 시간 확인 불가';
    }
  });

  const [transitResult, taxiResult] = await Promise.allSettled([
    fetch('/api/transit/routes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...coordinates, count: 10, lang: english ? 1 : 0, format: 'json' })
    }),
    fetch('/api/taxi/routes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(coordinates)
    })
  ]);
  if (!isCurrent()) return;

  let transitError = '';
  if (transitResult.status === 'fulfilled') {
    const response = transitResult.value;
    const payload = await response.json().catch(() => ({}));
    if (!isCurrent()) return;
    if (response.ok) {
      const itineraries = payload?.metaData?.plan?.itineraries ?? [];
      const modesOf = (itinerary) => new Set((itinerary.legs ?? []).map((leg) => leg.mode));
      // Only place a single-mode itinerary in its matching card.
      // A mixed bus + subway trip must not be advertised as either pure option.
      const bus = itineraries.find((itinerary) => Number(itinerary.pathType) === 2)
        || itineraries.find((itinerary) => {
          const modes = modesOf(itinerary);
          return modes.has('BUS') && !modes.has('SUBWAY') && !modes.has('TRAIN');
        });
      const subway = itineraries.find((itinerary) => Number(itinerary.pathType) === 1)
        || itineraries.find((itinerary) => {
          const modes = modesOf(itinerary);
          return (modes.has('SUBWAY') || modes.has('TRAIN')) && !modes.has('BUS');
        });
      if (bus) {
        guideTransportRoutes.BUS = { itinerary: bus };
        updateTransportChoice('BUS', transportText('BUS', bus, english), true);
      } else updateTransportChoice('BUS', english ? 'No bus route' : '버스 경로 없음', false);
      if (subway) {
        guideTransportRoutes.SUBWAY = { itinerary: subway };
        updateTransportChoice('SUBWAY', transportText('SUBWAY', subway, english), true);
      } else updateTransportChoice('SUBWAY', english ? 'No subway route' : '지하철 경로 없음', false);
    } else {
      transitError = payload.error || (english ? 'Transit route unavailable' : '대중교통 경로를 불러오지 못했어요.');
    }
  } else transitError = english ? 'Transit route unavailable' : '대중교통 경로를 불러오지 못했어요.';

  if (transitError) {
    updateTransportChoice('BUS', english ? 'Unavailable' : '이용 불가', false);
    updateTransportChoice('SUBWAY', english ? 'Unavailable' : '이용 불가', false);
  }

  if (taxiResult.status === 'fulfilled') {
    const response = taxiResult.value;
    const payload = await response.json().catch(() => ({}));
    if (!isCurrent()) return;
    if (response.ok && Number(payload.totalTime) > 0) {
      const minutes = Math.max(1, Math.round(Number(payload.totalTime) / 60));
      const fare = payload.taxiFare === null || payload.taxiFare === undefined ? NaN : Number(payload.taxiFare);
      const fareText = Number.isFinite(fare) && fare >= 0
        ? (english ? ` · est. ₩${fare.toLocaleString()}` : ` · 예상 ${fare.toLocaleString()}원`)
        : '';
      const summary = english ? `Taxi · about ${minutes} min${fareText}` : `택시 · 약 ${minutes}분${fareText}`;
      guideTransportRoutes.TAXI = { summary };
      updateTransportChoice('TAXI', english ? `about ${minutes} min${fareText}` : `약 ${minutes}분${fareText}`, true);
    } else {
      updateTransportChoice('TAXI', response.status === 503
        ? (english ? 'Car API not connected' : '자동차 API 연결 필요')
        : response.status === 401 || response.status === 403
          ? (english ? 'Car API access needed' : '자동차 API 권한 필요')
          : response.status === 429
            ? (english ? 'Request limit reached' : '요청 한도 초과')
            : (english ? 'Taxi route unavailable' : '택시 경로 이용 불가'), false);
    }
  } else updateTransportChoice('TAXI', english ? 'Taxi route unavailable' : '택시 경로 이용 불가', false);

  if (guideTransportContext.userSelectedMode) return;
  if (start.walkingComparison && guideTransportRoutes.WALK) selectGuideTransport('WALK');
  else if (guideTransportRoutes.BUS) selectGuideTransport('BUS');
  else if (guideTransportRoutes.SUBWAY) selectGuideTransport('SUBWAY');
  else if (guideTransportRoutes.TAXI) selectGuideTransport('TAXI');
  else {
    const message = transitError || (english ? 'No route found for this trip.' : '이 구간의 경로를 찾지 못했어요.');
    setGuideAnswer(message);
  }
}

async function requestGoogleTransitRoute(maps, map, start, end, isCurrent, instruction) {
  const options = document.querySelector('.transport-options');
  if (options) options.style.display = 'none';
  const { Route } = await maps.importLibrary('routes');
  const { routes = [] } = await Route.computeRoutes({
    origin: { lat: start.latitude, lng: start.longitude },
    destination: { lat: end.latitude, lng: end.longitude },
    travelMode: 'TRANSIT',
    departureTime: new Date(),
    fields: ['path', 'legs', 'durationMillis']
  });
  const route = routes[0];
  if (!route) throw new Error('이 출발지와 목적지 사이의 대중교통 경로를 찾지 못했어요.');
  if (!isCurrent()) return;

  clearRouteOverlays();
  const polylines = route.createPolylines({
    polylineOptions: { strokeColor: '#20d5ff', strokeOpacity: .92, strokeWeight: 5, zIndex: 10 }
  });
  polylines.forEach((polyline) => {
    polyline.setMap(map);
    routeMapOverlays.push(polyline);
  });
  const startPosition = { lat: start.latitude, lng: start.longitude };
  const endPosition = { lat: end.latitude, lng: end.longitude };
  routeMapOverlays.push(new maps.Marker({ map, position: startPosition, title: '출발지' }));
  routeMapOverlays.push(new maps.Marker({ map, position: endPosition, title: destination.trim() }));
  const bounds = route.viewport || new maps.LatLngBounds();
  if (!route.viewport) {
    bounds.extend(startPosition);
    bounds.extend(endPosition);
  }
  map.fitBounds(bounds, 36);

  const durationMillis = Number(route.durationMillis || route.staticDurationMillis || 0);
  const minutes = Math.max(1, Math.round(durationMillis / 60000));
  const english = routeLanguage === 'en';
  const summary = english ? `Transit · about ${minutes} min` : `대중교통 · 약 ${minutes}분`;
  if (instruction) instruction.textContent = summary;
  setGuideAnswer(english
    ? `Showing a route from ${routeOrigin || 'your location'} to ${destination} on the map. ${summary}.`
    : `${routeOrigin || '현재 위치'}에서 ${destination}까지 ${summary} 경로를 지도에 표시했어요.`);
}

async function requestGuideRoute(naverMaps, container, scene, requestId) {
  const instruction = document.querySelector('.route-instruction span');
  const isCurrent = () => requestId === routeRequestToken
    && currentPage === 'guide'
    && routeMapContainer === container
    && document.querySelector('#naver-map') === container;

  if (instruction) instruction.textContent = routeLanguage === 'en'
    ? 'Checking the starting point and destination...'
    : '출발지와 목적지를 확인하고 있어요.';

  try {
    const query = destination.trim() || '경복궁';
    let end = null;

    if (naverMaps && (automaticEntranceQuery(query) || (routeOrigin && (automaticEntranceQuery(routeOrigin)
      || entranceDescriptor(routeOrigin)?.kind === 'station-exit')))) {
      if (instruction) instruction.textContent = '출구별 실제 도보 거리와 경로를 비교하고 있어요.';
      const pair = await choosePedestrianEndpoints(routeOrigin, query, isCurrent, naverMaps);
      if (!pair || !isCurrent()) return;
      const map = createNaverMap(naverMaps, container, scene, pair.end);
      await requestNaverTransitRoute(naverMaps, map, pair.start, pair.end, isCurrent, instruction);
      return;
    }

    if (naverMaps) {
      end = localPedestrianEntrance(query)
        || (entranceDescriptor(query) ? await resolvePedestrianLandmark(query) : null)
        || await geocodeDestination(naverMaps, query).catch(() => null);
      if (!isCurrent()) return;
    }

    if (end && isKoreaCoordinate(end)) {
      const map = createNaverMap(naverMaps, container, scene, end);
      const start = await resolveRouteStart(naverMaps, routeOrigin);
      if (!isCurrent()) return;
      await requestNaverTransitRoute(naverMaps, map, start, end, isCurrent, instruction);
      return;
    }

    const googleMaps = await loadGoogleMaps();
    const googleDestination = await searchGoogleDestination(googleMaps, query);
    if (!isCurrent()) return;

    const isKorea = googleDestination.country === 'KR' || isKoreaCoordinate(googleDestination);
    if (isKorea) {
      if (!naverMaps) throw new Error('국내 지도에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
      const map = createNaverMap(naverMaps, container, scene, googleDestination);
      const start = await resolveRouteStart(naverMaps, routeOrigin);
      if (!isCurrent()) return;
      await requestNaverTransitRoute(naverMaps, map, start, googleDestination, isCurrent, instruction);
      return;
    }

    const map = createGoogleMap(googleMaps, container, scene, googleDestination);
    const start = await resolveRouteStart(naverMaps, routeOrigin);
    if (!isCurrent()) return;
    await requestGoogleTransitRoute(googleMaps, map, start, googleDestination, isCurrent, instruction);
  } catch (error) {
    if (!isCurrent()) return;
    clearRouteOverlays();
    const message = routeErrorMessage(error);
    if (instruction) instruction.textContent = message;
    setGuideAnswer(message);
    if (!routeMap) scene.classList.add('map-failed');
  }
}

function closeVoiceDestination() {
  const recognition = activeDestinationRecognition;
  activeDestinationRecognition = null;
  if (recognition) recognition.abort();
  voiceSearchOpen = false;
  voiceSearchState = 'idle';
  render();
}

function startVoiceDestination() {
  if (activeDestinationRecognition) {
    activeDestinationRecognition.abort();
    activeDestinationRecognition = null;
  }
  voiceSearchOpen = true;
  voiceSearchState = 'starting';
  voiceSearchMessage = '마이크를 준비하고 있어요.';
  render();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceSearchState = 'error';
    voiceSearchMessage = '이 브라우저는 음성 입력을 지원하지 않아요. 길찾기에서 문자로 입력할 수 있어요.';
    render();
    return;
  }

  const recognition = new SpeechRecognition();
  activeDestinationRecognition = recognition;
  recognition.lang = ({ 한국어: 'ko-KR', English: 'en-US', 日本語: 'ja-JP', 中文: 'zh-CN', Español: 'es-ES', Français: 'fr-FR', Deutsch: 'de-DE' })[selectedAppLanguage] || 'ko-KR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    if (activeDestinationRecognition !== recognition) return;
    voiceSearchState = 'listening';
    voiceSearchMessage = '목적지를 말씀해주세요.';
    render();
  };
  recognition.onresult = (event) => {
    if (activeDestinationRecognition !== recognition) return;
    const spokenDestination = event.results[0]?.[0]?.transcript?.trim();
    if (!spokenDestination) return;
    const nearby = parseNearbyStopRequest(spokenDestination);
    if (nearby) nearbyStopRequest = nearby;
    else {
      const parsed = parseRouteRequest(spokenDestination);
      destination = parsed.destination;
      routeOrigin = parsed.origin;
      routeLanguage = parsed.language;
    }
    activeDestinationRecognition = null;
    recognition.stop();
    voiceSearchOpen = false;
    voiceSearchState = 'idle';
    navigate(nearby ? 'nearby' : 'guide');
  };
  recognition.onerror = (event) => {
    if (activeDestinationRecognition !== recognition || event.error === 'aborted') return;
    voiceSearchState = 'error';
    voiceSearchMessage = event.error === 'not-allowed' || event.error === 'service-not-allowed'
      ? '마이크 사용을 허용하면 목적지를 말할 수 있어요.'
      : event.error === 'no-speech'
        ? '목적지를 듣지 못했어요. 다시 말하기를 눌러주세요.'
        : '음성 입력을 시작하지 못했어요. 다시 시도해주세요.';
    render();
  };
  recognition.onend = () => {
    if (activeDestinationRecognition !== recognition) return;
    activeDestinationRecognition = null;
    if (voiceSearchOpen && voiceSearchState !== 'error') {
      voiceSearchState = 'idle';
      voiceSearchMessage = '듣기가 끝났어요. 다시 말하기를 눌러주세요.';
      render();
    }
  };
  try {
    recognition.start();
  } catch {
    activeDestinationRecognition = null;
    voiceSearchState = 'error';
    voiceSearchMessage = '음성 입력을 시작하지 못했어요. 다시 시도해주세요.';
    render();
  }
}

function navigate(page) {
  if (page !== currentPage) pageHistory.push(currentPage);
  currentPage = page;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function goBack() {
  currentPage = pageHistory.pop() || 'home';
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

render();


