import { createWalkPanorama, findStationExit } from './walk-panorama.js?v=20261017-walk-preview-5';
import { createGuideConversation } from './guide-conversation.js?v=20261016-guide-spoken-reply-1';

const root = document.querySelector('#root');
let currentPage = 'home';
let routeEntryMode = 'dual';
let routeStartQuery = '';
let routeDestinationQuery = '';
let routeTransportMode = '';
let guideView = 'route';
const routeIntentHistory = [];
let routeIntentRequestId = 0;
let routeMapLoaderPromise = null;
let routeMapSession = 0;
let routeMapAuthError = '';
let routeMapAuthFailureInstalled = false;
let activeWalkPanorama = null;
let activeBoardingPanorama = null;
let activeGuideConversation = null;
let activeRouteRecognition = null;
let mapEntryOrigin = null;
function finishMapEntry() {
  mapEntryOrigin?.remove();
  mapEntryOrigin = null;
}
function stopRouteRecognition() {
  const recognition = activeRouteRecognition;
  activeRouteRecognition = null;
  recognition?.abort();
}
let selectedAppLanguage = '한국어';
let selectedUserLanguage = '한국어';
let selectedUserLanguageCode = 'ko';
let activeCounterpartLanguageCode = '';
let supportedUserLanguages = [
  { code: 'ko', name: '한국어' },
  { code: 'en', name: '영어' },
  { code: 'ja', name: '일본어' },
  { code: 'zh-CN', name: '중국어(간체)' },
  { code: 'zh-TW', name: '중국어(번체)' },
  { code: 'es', name: '스페인어' },
  { code: 'fr', name: '프랑스어' },
  { code: 'de', name: '독일어' }
];
let supportedUserLanguagesLoaded = false;
let supportedUserLanguagesLoading = false;
let voicePaused = false;
let voiceConversationState = 'idle';
let voiceConversationError = '';
let voiceListenLanguageCode = '';
let activeVoiceRecognition = null;
const sentTextMessages = [];
const pageHistory = [];
const guideHistoryStateKey = '__2speakerGuideStep';
let faqOpenIndex = 3;

function directRouteIntent(query, entryMode) {
  const text = query.trim().replace(/[.!?。]+$/, '').trim();
  const explicitRoute = text.match(/^(.+?)에서\s*(.+?)까지$/);
  const stationRoute = text.match(/^(\S+역)\s*에서\s*(\S+역)$/);
  const pair = explicitRoute || stationRoute;
  if (pair) {
    const start = pair[1].trim();
    const destination = pair[2].trim();
    if (start && destination && start.length <= 100 && destination.length <= 100) {
      return { start, destination, mode: 'unspecified', useCurrentLocation: false, provider: 'direct' };
    }
    return null;
  }
  const destination = text.match(/^(.+?)까지$/)?.[1]?.trim() || text;
  if (!destination || destination.length > 100 || /[?？]/.test(query)
    || /(?:가자|가줘|가주세요|알려줘|알려주세요|찾아줘|찾아주세요|어디|어떻게|추천|지하철로|버스로|택시로|도보로)/.test(destination)
    || /에서/.test(destination) || (entryMode !== 'simple' && /\s/.test(destination))) return null;
  return { start: '', destination, mode: 'unspecified', useCurrentLocation: true, provider: 'direct' };
}

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
  translate: '<path d="M4 5h9v8H9l-3 3v-3H4Z"/><path d="M11 9h9v8h-2v3l-3-3h-4Z"/><path d="M7 8h3M8.5 6.5v3"/><path d="m14 14 1.5-3 1.5 3M14.5 13h2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
  message: '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  send: '<path d="m4 4 16 8-16 8 3-8Z"/><path d="M7 12h13"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15ZM5 2l.7 1.8L7.5 4.5l-1.8.7L5 7l-.7-1.8L2.5 4.5l1.8-.7L5 2Z"/>',
  walkMode: '<circle cx="12" cy="3.5" r="2" fill="currentColor" stroke="none"/><path d="m11 8-1 5-3 8M10 13l5 3 1 5M11 8l4 3 3 1M11 8l-4 4" stroke-width="2.5"/>',
  subwayMode: '<rect x="5" y="2.5" width="14" height="16" rx="3"/><path d="M5 12h14M8 6h8M8 21l2-2.5M16 18.5l2 2.5"/><circle cx="8.5" cy="15" r=".8" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15" r=".8" fill="currentColor" stroke="none"/>',
  busMode: '<rect x="3.5" y="3" width="17" height="16" rx="2.5"/><path d="M3.5 12h17M7 19v2M17 19v2M7 7h10"/><circle cx="7.5" cy="15.5" r=".8" fill="currentColor" stroke="none"/><circle cx="16.5" cy="15.5" r=".8" fill="currentColor" stroke="none"/>',
  taxiMode: '<path d="M5 10 6.5 6h11L19 10M5 10h14a2 2 0 0 1 2 2v6H3v-6a2 2 0 0 1 2-2ZM8 6V4h8v2M5 18v2M19 18v2"/><path d="M7 14h2m6 0h2"/>'
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

function resolveNaverPlace(query, places, originTitle = '') {
  const name = (value) => String(value || '').toLowerCase().replace(/\s+/g, '');
  const term = name(query);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const scored = places.map((place) => {
    const title = name(place.title);
    const score = title === term ? 100 : title.startsWith(term) ? 80
      : words.length > 1 && words.every((word) => title.includes(name(word))) ? 50 : 0;
    return { place, score };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return { choices: [] };
  const best = scored[0];
  if (best.score === 100 && scored.filter((candidate) => candidate.score === 100).length === 1) {
    return { selected: best.place };
  }
  if (/역$/.test(term)) {
    const stations = scored.filter(({ place }) => /(지하철|전철|정차역)/.test(place.category || ''));
    if (stations.length === 1) return { selected: stations[0].place };
    if (stations.length > 1) {
      const originLine = originTitle.match(/역\s+([^()]+)$/)?.[1]?.trim();
      const sameLine = originLine ? stations.filter(({ place }) =>
        place.title.endsWith(`역 ${originLine}`)) : [];
      if (sameLine.length === 1) return { selected: sameLine[0].place };
      const distanceMeters = (a, b) => {
        const radians = Math.PI / 180;
        const dLat = (a.lat - b.lat) * radians;
        const dLng = (a.lng - b.lng) * radians;
        const arc = Math.sin(dLat / 2) ** 2
          + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
        return 12742000 * Math.asin(Math.min(1, Math.sqrt(arc)));
      };
      if (stations.every(({ place }) => distanceMeters(stations[0].place, place) <= 600)) {
        return { selected: stations[0].place };
      }
      return { choices: stations.map(({ place }) => place) };
    }
  }
  const attractions = scored.filter(({ place }) =>
    place.category?.startsWith('여행,명소>') && name(place.title).startsWith(term));
  if (attractions.length === 1 && best.score === 80) return { selected: attractions[0].place };
  return { choices: scored.map(({ place }) => place) };
}

function bottomNav() {
  return `<nav class="bottom-nav" aria-label="하단 메뉴">
    <button class="nav-item ${currentPage === 'home' ? 'active' : ''}" data-page="home">${icon('homeActive')}<span>홈</span></button>
    <button class="nav-item ${currentPage === 'more' ? 'active' : ''}" data-page="more">${icon('more')}<span>더보기</span></button>
  </nav>`;
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
  return `<main class="screen content-screen">
    ${header(routeEntryMode === 'simple' ? '목적지 검색' : '길찾기')}
    <section class="page-body route-entry-body">
      <form class="route-form" id="route-form"><div class="large-input"><label class="sr-only" for="route-destination">목적지</label>
        <input id="route-destination" name="destination-query" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="어디로 가세요?" inputmode="search">
        ${routeEntryMode === 'dual' ? `<button class="route-voice-button" type="button" aria-label="음성으로 목적지 말하기" aria-pressed="false">${icon('mic', 27)}</button>` : ''}
        ${routeEntryMode === 'dual' ? `<button class="route-text-button" type="button" data-action="route-text" aria-label="문자로 목적지 입력">${icon('message', 27)}</button>` : `<button class="route-submit" type="submit" aria-label="목적지 검색" hidden>${icon('arrow', 25)}</button>`}
      </div><p class="route-search-feedback" role="status" aria-live="polite"></p></form>
    </section>
    ${bottomNav()}
  </main>`;
}

function panoramaSection(kind) {
  return `<section class="walk-panorama" data-panorama-kind="${kind}" aria-label="${kind === 'walk' ? '네이버 도보 로드뷰' : '네이버 탑승 위치 로드뷰'}" hidden>
        <div class="walk-panorama-heading sr-only">
          <p class="walk-panorama-status" role="status" aria-live="polite"></p>
        </div>
        <div class="walk-panorama-view">
          <div class="walk-panorama-canvas" aria-label="네이버 실제 로드뷰"></div>
          <div class="walk-mini-map" role="img" aria-label="도보 경로와 현재 진행 방향을 표시하는 미니 지도" hidden>
            <div class="walk-mini-map-canvas" aria-hidden="true"></div>
          </div>
          <div class="walk-panorama-turn" role="status" aria-live="polite" hidden></div>
          <p class="walk-panorama-arrival" role="status" aria-live="polite"></p>
          <div class="walk-panorama-chat-actions" role="group" aria-label="AI 대화 및 통역">
            <button type="button" class="walk-panorama-chat-button" data-panorama-chat="ai" aria-label="AI 대화 열기" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8.5 8l-5 2 .9-4A8 8 0 1 1 20 11.5Z"/><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"/></svg><span>AI</span>
            </button>
            <button type="button" class="walk-panorama-chat-button" data-panorama-chat="translation" aria-label="실시간 통역 열기" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13v-2a9 9 0 0 1 18 0v2M3 13h3a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6ZM21 13h-3a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-6Z"/></svg><span>통역</span>
            </button>
          </div>
        </div>
        <div class="walk-panorama-controls">
          <button type="button" data-panorama-action="previous">이전</button>
          <button type="button" data-panorama-action="playback">재생</button>
          <button type="button" data-panorama-action="next">다음</button>
        </div>
      </section>`;
}

function guideScreen() {
  return `<main class="screen guide-screen">
    <div class="guide-content" data-guide-view="${guideView}" data-chat-expanded="false">
    <section class="route-visual" aria-label="네이버 지도">
      <div class="route-scene route-map-scene">
        <div id="route-map" class="route-map-canvas is-awaiting-location" role="application" aria-label="확대·축소 및 이동할 수 있는 지도"></div>
        <p id="route-map-status" class="route-map-status" role="status" aria-live="polite">네이버 지도를 불러오는 중입니다.</p>
        <button type="button" class="guide-map-settings guide-control" data-page="language" aria-label="설정">${icon('settings', 30)}</button>
      </div>
      ${panoramaSection('walk')}
      ${panoramaSection('boarding')}
    </section>
    <section class="transport-options" role="group" aria-label="이동 수단">
      <button class="transport-option" type="button" data-mode="walk" aria-pressed="${routeTransportMode === 'walk'}">${icon('walkMode', 24)}<strong>도보</strong></button>
      <button class="transport-option" type="button" data-mode="subway" aria-pressed="${routeTransportMode === 'subway'}">${icon('subwayMode', 24)}<strong>지하철</strong></button>
      <button class="transport-option" type="button" data-mode="bus" aria-pressed="${routeTransportMode === 'bus'}">${icon('busMode', 24)}<strong>버스</strong></button>
      <button class="transport-option" type="button" data-mode="taxi" aria-pressed="${routeTransportMode === 'taxi'}">${icon('taxiMode', 24)}<strong>택시</strong></button>
    </section>
    <section class="guide-dialogue" aria-label="길찾기 내용"></section>
    <section class="guide-conversation" id="guide-chat-area" aria-label="길찾기 대화"></section>
    </div>
    <div class="guide-chat-delete-actions" hidden>
      <span class="guide-chat-selected-count" aria-live="polite">선택 0개</span>
      <button type="button" class="guide-chat-delete-cancel">취소</button>
    </div>
    ${bottomNav()}
  </main>`;
}

function loadNaverMaps() {
  const clientId = window.__2SPEAKER_CONFIG__?.naverMapClientId?.trim();
  if (!clientId) return Promise.reject(new Error('네이버 지도 인증 정보가 설정되지 않았습니다.'));
  if (window.naver?.maps?.Map && window.naver?.maps?.Service?.geocode) return Promise.resolve(window.naver.maps);
  if (routeMapLoaderPromise) return routeMapLoaderPromise;

  routeMapLoaderPromise = new Promise((resolve, reject) => {
    const callbackName = `__2speakerNaverReady_${Date.now()}`;
    const script = document.createElement('script');
    let settled = false;
    let timeoutId;
    const finish = (error, maps) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      if (error) reject(error);
      else resolve(maps);
    };

    if (!routeMapAuthFailureInstalled) {
      const previousAuthFailure = window.navermap_authFailure;
      window.navermap_authFailure = (...args) => {
        try {
          if (typeof previousAuthFailure === 'function') previousAuthFailure(...args);
        } catch {
          // Keep the map's own authentication message visible if another handler fails.
        }
        routeMapAuthError = '네이버 지도 인증에 실패했습니다. Client ID와 웹 서비스 URL 설정을 확인해주세요.';
        const status = document.querySelector('#route-map-status');
        if (currentPage === 'guide' && status) status.textContent = routeMapAuthError;
      };
      routeMapAuthFailureInstalled = true;
    }

    window[callbackName] = () => {
      const maps = window.naver?.maps;
      if (maps?.Map && maps?.Service?.geocode) finish(null, maps);
      else finish(new Error('네이버 지도 구성 요소를 불러오지 못했습니다.'));
    };
    script.async = true;
    script.onerror = () => finish(new Error('네이버 지도 SDK를 불러오지 못했습니다.'));
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder,panorama&callback=${callbackName}`;
    timeoutId = window.setTimeout(() => finish(new Error('네이버 지도 인증을 확인하지 못했습니다.')), 16000);
    document.head.append(script);
  });
  return routeMapLoaderPromise;
}

function currentPositionOnce() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      reject(new Error('이 환경에서는 현재 위치를 확인할 수 없습니다.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000
    });
  });
}

function initializeNaverRouteMap() {
  const session = ++routeMapSession;
  const mapElement = document.querySelector('#route-map');
  const statusElement = document.querySelector('#route-map-status');
  const destinationChoicesElement = document.querySelector('.guide-dialogue');
  if (!mapElement || !statusElement) return;
  const placeRequests = new Map();
  const fetchNaverPlaces = (query) => {
    if (!placeRequests.has(query)) {
      const request = fetch('/api/map/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || '네이버 장소 검색에 연결하지 못했습니다.');
        return Array.isArray(payload.places) ? payload.places : [];
      });
      request.catch(() => {});
      placeRequests.set(query, request);
    }
    return placeRequests.get(query);
  };
  if (routeStartQuery) void fetchNaverPlaces(routeStartQuery);
  if (routeDestinationQuery) void fetchNaverPlaces(routeDestinationQuery);
  let subwayRequested = document.querySelector('.transport-option[data-mode="subway"]')?.getAttribute('aria-pressed') === 'true';
  let busRequested = document.querySelector('.transport-option[data-mode="bus"]')?.getAttribute('aria-pressed') === 'true';
  let walkRequested = document.querySelector('.transport-option[data-mode="walk"]')?.getAttribute('aria-pressed') === 'true';
  let taxiRequested = document.querySelector('.transport-option[data-mode="taxi"]')?.getAttribute('aria-pressed') === 'true';
  let changeSubwayMode = null;
  let changeBusMode = null;
  let changeWalkMode = null;
  let changeTaxiMode = null;
  let changeMapType = null;
  let activeTransportMode = routeTransportMode || 'preview';
  mapElement.addEventListener('transport-mode-change', (event) => {
    const nextMode = event.detail?.mode || 'preview';
    if (activeTransportMode !== nextMode) {
      if (activeTransportMode === 'subway') changeSubwayMode?.(false);
      if (activeTransportMode === 'bus') changeBusMode?.(false);
      if (activeTransportMode === 'taxi') changeTaxiMode?.(false);
      if (activeTransportMode === 'walk'
        || (activeTransportMode === 'preview' && nextMode !== 'walk')) changeWalkMode?.(false);
    }
    activeTransportMode = nextMode;
    changeMapType?.(nextMode === 'subway' ? 'subway' : 'normal');
    subwayRequested = nextMode === 'subway';
    busRequested = nextMode === 'bus';
    walkRequested = nextMode === 'walk';
    taxiRequested = nextMode === 'taxi';
    if (subwayRequested) changeSubwayMode?.(true);
    else if (busRequested) changeBusMode?.(true);
    else if (walkRequested) changeWalkMode?.(true);
    else if (taxiRequested) changeTaxiMode?.(true);
  });

  const setStatus = (message, state = 'info') => {
    if (session !== routeMapSession || currentPage !== 'guide') return;
    if (state === 'error' || routeMapAuthError) {
      finishMapEntry();
      if (walkRequested && guideView === 'panorama') setGuideView('route');
    }
    statusElement.textContent = routeMapAuthError || message;
    statusElement.classList.toggle('is-quiet', state === 'success');
    statusElement.classList.toggle('is-error', state === 'error' || Boolean(routeMapAuthError));
  };

  loadNaverMaps().then((maps) => {
    if (session !== routeMapSession || currentPage !== 'guide' || !mapElement.isConnected) return;

    const mapTypes = new maps.MapTypeRegistry({
      normal: maps.NaverStyleMapTypeOptions.getNormalMap({ overlayType: 'bg.ol.lko' }),
      subway: maps.NaverStyleMapTypeOptions.getNormalMap({ overlayType: 'bg.ol.ts.lko' })
    });
    const map = new maps.Map(mapElement, {
      center: new maps.LatLng(36.5, 127.8),
      zoom: 7,
      mapTypes,
      mapTypeId: subwayRequested ? 'subway' : 'normal',
      draggable: true,
      pinchZoom: true,
      scrollWheel: true,
      zoomControl: false
    });
    changeMapType = (type) => map.setMapTypeId(type);
    mapElement.addEventListener('guide-layout-change', () => {
      window.requestAnimationFrame(() => {
        if (session === routeMapSession && mapElement.isConnected) map.autoResize();
      });
    });
    const walkPanorama = createWalkPanorama(maps, document.querySelector('.walk-panorama[data-panorama-kind="walk"]'));
    activeWalkPanorama = walkPanorama;
    const boardingPanorama = createWalkPanorama(maps, document.querySelector('.walk-panorama[data-panorama-kind="boarding"]'));
    activeBoardingPanorama = boardingPanorama;
    let currentLocation = null;
    let startTitle = '';
    let startIsStation = false;
    let destinationLocation = null;
    let destinationMarker = null;
    let locationStatus = routeStartQuery ? '출발지를 검색하고 있습니다.' : '현재 위치를 확인하고 있습니다.';
    let locationState = 'pending';
    let destinationTitle = '';
    let destinationStatus = routeStartQuery ? '출발지 확인 후 목적지를 검색합니다.'
      : routeDestinationQuery ? '목적지를 검색하고 있습니다.' : '목적지를 입력해 주세요.';
    let destinationState = routeDestinationQuery ? 'pending' : 'info';
    let routeLines = [];
    let routeCoordinates = [];
    let routeController = null;
    let routeRequestId = 0;
    let routeRequestKey = null;
    let boardingTarget = null;
    const boardingButton = `<button type="button" class="boarding-location-button" data-action="show-boarding-location">탑승 위치 보기 <span aria-hidden="true">›</span></button><p class="boarding-location-feedback" role="status" aria-live="polite"></p>`;
    const pointDistanceMeters = (a, b) => {
      const radians = Math.PI / 180;
      const dLat = (b.lat - a.lat) * radians;
      const dLng = (b.lng - a.lng) * radians;
      const arc = Math.sin(dLat / 2) ** 2
        + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
      return 12742000 * Math.asin(Math.min(1, Math.sqrt(arc)));
    };
    let walkRouteReady = null;
    let walkRouteController = null;
    let walkRouteRequestKey = null;
    let walkRouteRequestId = 0;
    let walkPanoramaPreparing = false;
    let walkPreparationId = 0;
    let initialMapRevealScheduled = false;
    let initialMapViewportReady = false;
    let initialWalkMapSettled = false;
    const targetMapViewportReady = () => {
      const bounds = map.getBounds();
      return Boolean(bounds?.hasLatLng(destinationLocation)
        && (!currentLocation || bounds.hasLatLng(currentLocation)));
    };
    const revealMap = () => {
      if (activeTransportMode === 'preview' && !initialWalkMapSettled) return;
      if (session === routeMapSession && currentPage === 'guide'
        && mapElement.isConnected && targetMapViewportReady()) {
        mapElement.classList.remove('is-awaiting-location');
        finishMapEntry();
      }
    };
    maps.Event.addListener(map, 'tilesloaded', () => {
      if (initialMapRevealScheduled && initialMapViewportReady) {
        window.requestAnimationFrame(() => window.requestAnimationFrame(revealMap));
      }
    });

    const shortPlaceName = (name) => String(name || '').replace(/\s*\([^)]*\)\s*$/, '').slice(0, 12);
    const updateStatus = () => {
      const locationSummary = locationState === 'success'
        ? routeStartQuery ? shortPlaceName(startTitle) : 'GPS 확인'
        : locationStatus;
      const destinationSummary = destinationState === 'success'
        ? shortPlaceName(destinationTitle)
        : destinationStatus;
      const message = [locationSummary, destinationSummary].filter(Boolean).join(' · ');
      const hasError = locationState === 'error' || destinationState === 'error';
      const bothReady = locationState === 'success' && destinationState === 'success';
      setStatus(message, hasError ? 'error' : bothReady ? 'success' : 'info');
    };
    const currentLocationIcon = {
      content: '<div role="img" aria-label="현재 위치" style="width:24px;height:24px;display:grid;place-items:center;border:2px solid #fff;border-radius:50%;background:rgba(36,166,255,.24);box-shadow:0 1px 8px rgba(0,26,52,.72);"><span style="width:12px;height:12px;border:1px solid #fff;border-radius:50%;background:#168cff;"></span></div>',
      size: new maps.Size(28, 28),
      anchor: new maps.Point(14, 14)
    };
    const startPinIcon = {
      content: '<div role="img" aria-label="출발지 위치" style="width:25px;height:25px;display:grid;place-items:center;border:2px solid #fff;border-radius:50%;background:#168cff;box-shadow:0 1px 8px rgba(0,26,52,.72);"><span style="width:8px;height:8px;border-radius:50%;background:#fff;"></span></div>',
      size: new maps.Size(29, 29),
      anchor: new maps.Point(14, 14)
    };
    const destinationPinIcon = {
      content: '<svg role="img" aria-label="목적지 위치" width="36" height="44" viewBox="0 0 36 44" style="display:block;filter:drop-shadow(0 2px 4px rgba(0,20,38,.7))"><path d="M18 2C9.72 2 3 8.72 3 17c0 10.6 15 25 15 25s15-14.4 15-25C33 8.72 26.28 2 18 2Z" fill="#ffc36d" stroke="#fff" stroke-width="2"/><circle cx="18" cy="17" r="6" fill="#07334d" stroke="#fff" stroke-width="2"/></svg>',
      size: new maps.Size(36, 44),
      anchor: new maps.Point(18, 42)
    };
    const clearDestinationChoices = () => {
      if (destinationChoicesElement) destinationChoicesElement.replaceChildren();
    };
    const renderPlaceChoices = (places, role, onSelect) => {
      if (!destinationChoicesElement) return;
      finishMapEntry();
      destinationChoicesElement.innerHTML = `<div class="place-choice-list" role="group" aria-label="네이버 장소 검색 결과">
        <p class="place-choice-heading">검색 결과 ${places.length}곳 · ${role}를 선택해 주세요</p>
        ${places.map((place, index) => {
          const detail = [place.roadAddress, place.address, place.category].filter(Boolean).join(' · ');
          return `<button class="place-choice" type="button" data-place-index="${index}" aria-label="${escapeHtml(place.title)}${detail ? `, ${escapeHtml(detail)}` : ''}">
            <strong>${escapeHtml(place.title)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
          </button>`;
        }).join('')}
      </div>`;
      destinationChoicesElement.querySelectorAll('[data-place-index]').forEach((button) => {
        button.addEventListener('click', () => {
          const place = places[Number(button.dataset.placeIndex)];
          if (!place) return;
          clearDestinationChoices();
          onSelect(place);
        });
      });
    };
    const updateMapView = () => {
      if (!initialMapRevealScheduled && destinationLocation && locationState !== 'pending') {
        initialMapRevealScheduled = true;
        const waitForTargetViewport = () => {
          if (targetMapViewportReady()) initialMapViewportReady = true;
          else maps.Event.once(map, 'idle', waitForTargetViewport);
        };
        maps.Event.once(map, 'idle', waitForTargetViewport);
      }
      if (currentLocation && destinationLocation) {
        let bounds = maps.LatLngBounds.bounds(currentLocation, destinationLocation);
        if (routeCoordinates.length) {
          const allPoints = [currentLocation, destinationLocation, ...routeCoordinates];
          let minLat = 90;
          let maxLat = -90;
          let minLng = 180;
          let maxLng = -180;
          for (const point of allPoints) {
            minLat = Math.min(minLat, point.lat());
            maxLat = Math.max(maxLat, point.lat());
            minLng = Math.min(minLng, point.lng());
            maxLng = Math.max(maxLng, point.lng());
          }
          bounds = maps.LatLngBounds.bounds(
            new maps.LatLng(minLat, minLng), new maps.LatLng(maxLat, maxLng)
          );
        }
        map.fitBounds(bounds, { top: 28, right: 42, bottom: 48, left: 42,
          maxZoom: routeTransportMode === '' ? 16 : 13 });
      } else if (destinationLocation) {
        map.setCenter(destinationLocation);
        map.setZoom(15);
      } else if (currentLocation) {
        map.setCenter(currentLocation);
        map.setZoom(15);
      }
    };
    const removeRouteLines = () => {
      routeLines.forEach((line) => line.setMap(null));
      routeLines = [];
      routeCoordinates = [];
    };
    const showSubwayMessage = (message, isError = false) => {
      if (!destinationChoicesElement || destinationState !== 'success') return;
      boardingTarget = null;
      destinationChoicesElement.innerHTML = `<div class="subway-route-panel${isError ? ' is-error' : ''}" role="status">${escapeHtml(message)}</div>`;
    };
    const showSubwayRoute = (route) => {
      if (!destinationChoicesElement) return;
      const firstLeg = route.subwayLegs?.[0] || route.transportLegs?.[0];
      boardingTarget = firstLeg ? { mode: 'subway', title: firstLeg.board, point: firstLeg.boardPoint } : null;
      const minutes = Math.ceil(route.totalSeconds / 60);
      const transportLabel = '지하철';
      const accessWalk = route.accessWalk && Number.isFinite(route.accessWalk.seconds)
        && Number.isFinite(route.accessWalk.distanceMeters)
        ? `<li><strong>도보 접근 · ${escapeHtml(route.accessWalk.station)}</strong><span>${escapeHtml(startTitle || '현재 위치')} → ${escapeHtml(route.accessWalk.station)} · ${Math.ceil(route.accessWalk.seconds / 60)}분 · ${Math.round(route.accessWalk.distanceMeters)}m</span></li>`
        : '';
      const legs = route.transportLegs.map((leg) => `<li><strong>지하철 · ${escapeHtml(leg.route)}</strong><span>${escapeHtml(leg.board)} 탑승 → ${escapeHtml(leg.alight)} 하차 · ${Math.ceil(leg.seconds / 60)}분</span></li>`).join('');
      const transfers = route.transfers.length
        ? `<p class="subway-transfer">환승: ${route.transfers.map((transfer) => escapeHtml(transfer.from === transfer.to ? transfer.from : `${transfer.from} → ${transfer.to}`)).join(' · ')}</p>`
        : '';
      const missingModes = Array.isArray(route.missingGeometryModes) ? route.missingGeometryModes : [];
      const geometryNotice = missingModes.length
        ? '<p class="subway-transfer">TMAP이 일부 도보 접근 구간 좌표를 제공하지 않아 확인된 구간만 지도에 표시했습니다.</p>'
        : '';
      destinationChoicesElement.innerHTML = `<div class="subway-route-panel" role="status" aria-label="TMAP 지하철 경로">
        <strong>${transportLabel} 약 ${minutes}분 · 환승 ${route.transferCount}회</strong>
        ${route.departureBasis ? `<p class="subway-transfer">TMAP ${escapeHtml(route.departureBasis)} 출발 기준 경로입니다. 지금 출발 가능한 경로는 아닙니다.</p>` : ''}
        <ol>${accessWalk}${legs}</ol>${transfers}${geometryNotice}${boardingButton}
      </div>`;
    };
    const requestSubwayRoute = () => {
      if (!subwayRequested || destinationState !== 'success' || !destinationLocation) return;
      if (locationState === 'error') {
        showSubwayMessage(routeStartQuery ? '출발지를 확인할 수 없어 지하철 경로를 요청하지 않았습니다.' : '현재 GPS 위치를 확인할 수 없어 지하철 경로를 요청하지 않았습니다.', true);
        return;
      }
      if (!currentLocation) {
        showSubwayMessage(routeStartQuery ? '출발지 확인 후 지하철 경로를 조회합니다.' : 'GPS 확인 후 지하철 경로를 조회합니다.');
        return;
      }

      const start = { lat: currentLocation.lat(), lng: currentLocation.lng() };
      const end = { lat: destinationLocation.lat(), lng: destinationLocation.lng() };
      const requestKey = `${start.lat},${start.lng}:${end.lat},${end.lng}`;
      if (routeController && routeRequestKey === requestKey) return;
      routeController?.abort();
      const controller = new AbortController();
      routeController = controller;
      routeRequestKey = requestKey;
      const requestId = ++routeRequestId;
      removeRouteLines();
      showSubwayMessage('TMAP에서 실제 지하철 경로를 조회하고 있습니다.');
      fetch('/api/transit/subway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, startIsStation }),
        signal: controller.signal
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'TMAP 지하철 경로 조회에 실패했습니다.');
        return payload;
      }).then((payload) => {
        if (session !== routeMapSession || currentPage !== 'guide' || !subwayRequested || requestId !== routeRequestId) return;
        const route = payload.route;
        if (!payload.coordinateMatch || !route || !Array.isArray(route.segments)
          || !route.segments.some((segment) => segment.mode === 'SUBWAY')
          || route.segments.some((segment) => !['SUBWAY', 'WALK'].includes(segment.mode))
          || !Array.isArray(route.transportLegs) || !route.transportLegs.length
          || route.transportLegs.some((leg) => leg.mode !== 'SUBWAY')) {
          throw new Error('TMAP 경로 데이터와 요청 좌표를 확인할 수 없습니다.');
        }
        const segments = route.segments.map((segment) => {
          if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2) {
            throw new Error('TMAP 경로 형상 좌표가 부족합니다.');
          }
          const points = segment.coordinates.map(([lng, lat]) => {
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('TMAP 경로 좌표가 올바르지 않습니다.');
            return new maps.LatLng(lat, lng);
          });
          return { ...segment, points };
        });
        routeCoordinates = segments.flatMap((segment) => segment.points);
        routeLines = segments.map((segment) => new maps.Polyline({
          map,
          path: segment.points,
          strokeColor: segment.color,
          strokeWeight: segment.mode === 'SUBWAY' ? 5 : 2,
          strokeOpacity: segment.mode === 'SUBWAY' ? 0.95 : 0.75,
          strokeStyle: segment.mode === 'SUBWAY' ? 'solid' : 'shortdash',
          zIndex: 60
        }));
        updateMapView();
        showSubwayRoute(route);
      }).catch((error) => {
        if (controller.signal.aborted || session !== routeMapSession || currentPage !== 'guide'
          || !subwayRequested || requestId !== routeRequestId) return;
        removeRouteLines();
        showSubwayMessage(error instanceof Error ? error.message : 'TMAP 지하철 경로 조회에 실패했습니다.', true);
      }).finally(() => {
        if (routeController === controller) {
          routeController = null;
          routeRequestKey = null;
        }
      });
    };
    changeSubwayMode = (active) => {
      if (active) {
        requestSubwayRoute();
      } else {
        routeController?.abort();
        routeController = null;
        routeRequestKey = null;
        routeRequestId += 1;
        removeRouteLines();
        if (destinationState === 'success') clearDestinationChoices();
        updateMapView();
      }
    };
    const showBusMessage = (message, isError = false) => {
      if (!destinationChoicesElement || destinationState !== 'success') return;
      boardingTarget = null;
      destinationChoicesElement.innerHTML = `<div class="subway-route-panel${isError ? ' is-error' : ''}" role="status">${escapeHtml(message)}</div>`;
    };
    const showBusRoute = (route) => {
      if (!destinationChoicesElement) return;
      const firstLeg = route.transportLegs?.[0];
      boardingTarget = firstLeg ? { mode: 'bus', title: firstLeg.board, point: firstLeg.boardPoint } : null;
      const minutes = Math.ceil(route.totalSeconds / 60);
      const accessWalk = route.accessWalk
        ? `<li><strong>도보 접근 · ${escapeHtml(route.accessWalk.station)}</strong><span>${escapeHtml(startTitle || '현재 위치')} → ${escapeHtml(route.accessWalk.station)} · ${Math.ceil(route.accessWalk.seconds / 60)}분 · ${Math.round(route.accessWalk.distanceMeters)}m</span></li>`
        : '';
      const legs = route.transportLegs.map((leg) => `<li><strong>버스 · ${escapeHtml(leg.route)}</strong><span>${escapeHtml(leg.board)} 탑승 → ${escapeHtml(leg.alight)} 하차 · ${Math.ceil(leg.seconds / 60)}분</span></li>`).join('');
      const arrivalWalk = route.arrivalWalk
        ? `<li><strong>도보 도착</strong><span>하차 정류장 → 목적지 · ${Math.ceil(route.arrivalWalk.seconds / 60)}분 · ${Math.round(route.arrivalWalk.distanceMeters)}m</span></li>`
        : '';
      const transfers = route.transfers.length
        ? `<p class="subway-transfer">버스 환승: ${route.transfers.map((transfer) => escapeHtml(transfer.from === transfer.to ? transfer.from : `${transfer.from} → ${transfer.to}`)).join(' · ')}</p>`
        : '';
      const missingWalk = route.missingGeometryModes?.includes('WALK')
        ? '<p class="subway-transfer">TMAP이 일부 도보 구간 좌표를 제공하지 않아 확인된 구간만 지도에 표시했습니다.</p>'
        : '';
      destinationChoicesElement.innerHTML = `<div class="subway-route-panel" role="status" aria-label="TMAP 버스 경로">
        <strong>버스 약 ${minutes}분 · 환승 ${route.transferCount}회</strong>
        ${route.departureBasis ? `<p class="subway-transfer">TMAP ${escapeHtml(route.departureBasis)} 출발 기준 경로입니다. 지금 출발 가능한 경로는 아닙니다.</p>` : ''}
        <ol>${accessWalk}${legs}${arrivalWalk}</ol>${transfers}${missingWalk}${boardingButton}
      </div>`;
    };
    const requestBusRoute = () => {
      if (!busRequested || destinationState !== 'success' || !destinationLocation) return;
      if (locationState === 'error') {
        showBusMessage(routeStartQuery ? '출발지를 확인할 수 없어 버스 경로를 요청하지 않았습니다.' : '현재 GPS 위치를 확인할 수 없어 버스 경로를 요청하지 않았습니다.', true);
        return;
      }
      if (!currentLocation) {
        showBusMessage(routeStartQuery ? '출발지 확인 후 버스 경로를 조회합니다.' : 'GPS 확인 후 버스 경로를 조회합니다.');
        return;
      }
      const start = { lat: currentLocation.lat(), lng: currentLocation.lng() };
      const end = { lat: destinationLocation.lat(), lng: destinationLocation.lng() };
      const requestKey = `${start.lat},${start.lng}:${end.lat},${end.lng}`;
      if (routeController && routeRequestKey === requestKey) return;
      routeController?.abort();
      const controller = new AbortController();
      routeController = controller;
      routeRequestKey = requestKey;
      const requestId = ++routeRequestId;
      removeRouteLines();
      showBusMessage('TMAP에서 실제 버스 경로를 조회하고 있습니다.');
      fetch('/api/transit/bus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end }),
        signal: controller.signal
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'TMAP 버스 경로 조회에 실패했습니다.');
        return payload;
      }).then((payload) => {
        if (session !== routeMapSession || currentPage !== 'guide' || !busRequested || requestId !== routeRequestId) return;
        const route = payload.route;
        if (!payload.coordinateMatch || !route || !Array.isArray(route.segments)
          || !route.segments.some((segment) => segment.mode === 'BUS')
          || !Array.isArray(route.transportLegs) || !route.transportLegs.length
          || route.transportLegs.some((leg) => leg.mode !== 'BUS')) {
          throw new Error('TMAP 버스 경로와 요청 좌표를 확인할 수 없습니다.');
        }
        const segments = route.segments.map((segment) => {
          if (!['BUS', 'WALK'].includes(segment.mode)
            || !Array.isArray(segment.coordinates) || segment.coordinates.length < 2) {
            throw new Error('TMAP 버스 경로 형상 좌표가 부족합니다.');
          }
          const points = segment.coordinates.map(([lng, lat]) => {
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('TMAP 경로 좌표가 올바르지 않습니다.');
            return new maps.LatLng(lat, lng);
          });
          return { ...segment, points };
        });
        routeCoordinates = segments.flatMap((segment) => segment.points);
        routeLines = segments.map((segment) => new maps.Polyline({
          map,
          path: segment.points,
          strokeColor: segment.color,
          strokeWeight: segment.mode === 'BUS' ? 5 : 2,
          strokeOpacity: segment.mode === 'BUS' ? 0.95 : 0.75,
          strokeStyle: segment.mode === 'BUS' ? 'solid' : 'shortdash',
          zIndex: 60
        }));
        updateMapView();
        showBusRoute(route);
      }).catch((error) => {
        if (controller.signal.aborted || session !== routeMapSession || currentPage !== 'guide'
          || !busRequested || requestId !== routeRequestId) return;
        removeRouteLines();
        showBusMessage(error instanceof Error ? error.message : 'TMAP 버스 경로 조회에 실패했습니다.', true);
      }).finally(() => {
        if (routeController === controller) {
          routeController = null;
          routeRequestKey = null;
        }
      });
    };
    changeBusMode = (active) => {
      if (active) {
        requestBusRoute();
      } else {
        routeController?.abort();
        routeController = null;
        routeRequestKey = null;
        routeRequestId += 1;
        removeRouteLines();
        if (destinationState === 'success') clearDestinationChoices();
        updateMapView();
      }
    };
    const showTaxiMessage = (message, isError = false) => {
      if (!destinationChoicesElement || destinationState !== 'success') return;
      boardingTarget = null;
      destinationChoicesElement.innerHTML = `<div class="subway-route-panel${isError ? ' is-error' : ''}" role="status">${escapeHtml(message)}</div>`;
    };
    const requestTaxiRoute = () => {
      if (!taxiRequested || destinationState !== 'success' || !destinationLocation) return;
      if (locationState === 'error') {
        showTaxiMessage(routeStartQuery ? '출발지를 확인할 수 없어 택시 경로를 요청하지 않았습니다.' : '현재 GPS 위치를 확인할 수 없어 택시 경로를 요청하지 않았습니다.', true);
        return;
      }
      if (!currentLocation) {
        showTaxiMessage(routeStartQuery ? '출발지 확인 후 택시 경로를 조회합니다.' : 'GPS 확인 후 택시 경로를 조회합니다.');
        return;
      }
      const start = { lat: currentLocation.lat(), lng: currentLocation.lng() };
      const end = { lat: destinationLocation.lat(), lng: destinationLocation.lng() };
      const requestKey = `${start.lat},${start.lng}:${end.lat},${end.lng}`;
      if (routeController && routeRequestKey === requestKey) return;
      routeController?.abort();
      const controller = new AbortController();
      routeController = controller;
      routeRequestKey = requestKey;
      const requestId = ++routeRequestId;
      removeRouteLines();
      showTaxiMessage('TMAP에서 실제 자동차 주행 경로를 조회하고 있습니다.');
      fetch('/api/transit/walk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, mode: 'taxi' }),
        signal: controller.signal
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'TMAP 자동차 경로 조회에 실패했습니다.');
        return payload;
      }).then((payload) => {
        if (session !== routeMapSession || currentPage !== 'guide' || !taxiRequested || requestId !== routeRequestId) return;
        const route = payload.route;
        const matches = (actual, expected) => actual && Math.abs(actual.lat - expected.lat) < 0.00001
          && Math.abs(actual.lng - expected.lng) < 0.00001;
        if (!matches(payload.requestedStart, start) || !matches(payload.requestedEnd, end)
          || !route || !Array.isArray(route.segments) || !route.segments.length) {
          throw new Error('TMAP 자동차 경로와 요청 좌표를 확인할 수 없습니다.');
        }
        const segments = route.segments.map((segment) => {
          if (segment.mode !== 'TAXI' || !Array.isArray(segment.coordinates)
            || segment.coordinates.length < 2) throw new Error('TMAP 자동차 경로 형상 좌표가 부족합니다.');
          const points = segment.coordinates.map(([lng, lat]) => {
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('TMAP 경로 좌표가 올바르지 않습니다.');
            return new maps.LatLng(lat, lng);
          });
          return { ...segment, points };
        });
        routeCoordinates = segments.flatMap((segment) => segment.points);
        routeLines = segments.map((segment) => new maps.Polyline({
          map, path: segment.points, strokeColor: segment.color,
          strokeWeight: 5, strokeOpacity: 0.95, zIndex: 60
        }));
        updateMapView();
        const fare = Number.isFinite(route.taxiFare)
          ? `<p class="subway-transfer">TMAP 예상 택시요금 ${Math.round(route.taxiFare).toLocaleString('ko-KR')}원 · 실제 요금과 다를 수 있습니다.</p>` : '';
        const searchedStand = /택시.*(?:승강장|승차대|정류장|타는\s*곳)|(?:승강장|승차대).*택시/
          .test(`${routeDestinationQuery} ${destinationTitle}`);
        boardingTarget = {
          mode: 'taxi', point: searchedStand ? end : start,
          title: searchedStand ? destinationTitle : startTitle || '현재 위치',
          exactStand: searchedStand && /택시.*(?:승강장|승차대|정류장|타는\s*곳)|(?:승강장|승차대).*택시/.test(destinationTitle)
        };
        destinationChoicesElement.innerHTML = `<div class="subway-route-panel" role="status" aria-label="TMAP 택시 경로">
          <strong>택시 주행 약 ${Math.ceil(route.totalSeconds / 60)}분 · ${Math.round(route.distanceMeters).toLocaleString('ko-KR')}m</strong>
          ${fare}${boardingButton}
        </div>`;
      }).catch((error) => {
        if (controller.signal.aborted || session !== routeMapSession || currentPage !== 'guide'
          || !taxiRequested || requestId !== routeRequestId) return;
        removeRouteLines();
        showTaxiMessage(error instanceof Error ? error.message : 'TMAP 자동차 경로 조회에 실패했습니다.', true);
      }).finally(() => {
        if (routeController === controller) {
          routeController = null;
          routeRequestKey = null;
        }
      });
    };
    changeTaxiMode = (active) => {
      if (active) {
        requestTaxiRoute();
      } else {
        routeController?.abort();
        routeController = null;
        routeRequestKey = null;
        routeRequestId += 1;
        removeRouteLines();
        if (destinationState === 'success') clearDestinationChoices();
        updateMapView();
      }
    };
    destinationChoicesElement?.addEventListener('click', async (event) => {
      const button = event.target.closest?.('[data-action="show-boarding-location"]');
      if (!button || button.disabled) return;
      const target = boardingTarget;
      const mode = routeTransportMode;
      const activeRequestId = routeRequestId;
      const feedback = button.parentElement?.querySelector('.boarding-location-feedback');
      if (!target || target.mode !== mode || !target.point
        || ![target.point.lat, target.point.lng].every(Number.isFinite)) {
        if (feedback) feedback.textContent = '탑승 지점 좌표를 확인할 수 없습니다.';
        return;
      }
      button.disabled = true;
      if (feedback) feedback.textContent = '탑승 위치를 확인하고 있습니다.';
      try {
        let location = target.point;
        let title = target.title;
        if (mode === 'subway') {
          const stationName = target.title.match(/^(.+?역)(?:\s|\(|$)/)?.[1] || target.title;
          const start = currentLocation
            ? { lat: currentLocation.lat(), lng: currentLocation.lng() } : location;
          const exit = await findStationExit(stationName, start, location)
            || await findStationExit(stationName, location, location);
          if (exit) {
            location = { lat: exit.lat, lng: exit.lng };
            title = `${exit.title} · 지하철 탑승 접근`;
          } else {
            title = `${stationName} 주변 · 출입구 미확인`;
          }
        } else if (mode === 'bus') {
          title = `${target.title} · 버스 승차 정류장`;
        } else if (mode === 'taxi') {
          if (target.exactStand) {
            title = `${target.title} · 택시 승강장`;
          } else {
            const response = await fetch('/api/transit/taxi-stand', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ start: target.point, hint: target.title })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || '택시 승강장 검색에 실패했습니다.');
            const stand = payload.stand;
            if (!stand?.location || ![stand.location.lat, stand.location.lng].every(Number.isFinite)
              || pointDistanceMeters(target.point, stand.location) > 500) {
              throw new Error('검색한 장소 근처 500m 안에서 확인된 택시 승강장이 없습니다.');
            }
            location = stand.location;
            title = `${stand.name} · 출발지에서 약 ${stand.distanceMeters}m`;
          }
        }
        if (session !== routeMapSession || currentPage !== 'guide'
          || routeTransportMode !== mode || activeRequestId !== routeRequestId) return;
        const ready = await boardingPanorama.startPoint({ point: location, title, mode });
        if (session !== routeMapSession || currentPage !== 'guide'
          || routeTransportMode !== mode || activeRequestId !== routeRequestId) return;
        if (!ready) throw new Error('탑승 지점 근처에서 확인된 로드뷰가 없습니다.');
        if (feedback) feedback.textContent = '';
        setGuideView('panorama', { kind: 'boarding' });
      } catch (error) {
        if (session === routeMapSession && currentPage === 'guide'
          && routeTransportMode === mode && activeRequestId === routeRequestId && feedback) {
          feedback.textContent = error instanceof Error ? error.message : '탑승 위치를 확인하지 못했습니다.';
        }
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
    const showWalkMessage = (message, isError = false) => {
      if ((!walkRequested && activeTransportMode !== 'preview')
        || !destinationChoicesElement || destinationState !== 'success') return;
      destinationChoicesElement.innerHTML = `<div class="subway-route-panel${isError ? ' is-error' : ''}" role="status">${escapeHtml(message)}</div>`;
    };
    const showWalkRoute = (route) => {
      if (!destinationChoicesElement) return;
      const directions = Array.isArray(route.directions)
        ? route.directions.filter((direction) => typeof direction === 'string' && direction.trim()) : [];
      destinationChoicesElement.innerHTML = `<div class="subway-route-panel" role="status" aria-label="TMAP 도보 경로">
        <strong>도보 약 ${Math.ceil(route.totalSeconds / 60)}분 · ${Math.round(route.distanceMeters).toLocaleString('ko-KR')}m</strong>
        ${directions.length ? `<details><summary>TMAP 도보 안내 ${directions.length}개 보기</summary><ol>${directions.map((direction) => `<li>${escapeHtml(direction)}</li>`).join('')}</ol></details>` : ''}
      </div>`;
    };
    const updateWalkMapView = () => {
      const points = [currentLocation, destinationLocation, ...routeCoordinates].filter(Boolean);
      if (!points.length) return;
      let minLat = 90;
      let maxLat = -90;
      let minLng = 180;
      let maxLng = -180;
      for (const point of points) {
        minLat = Math.min(minLat, point.lat());
        maxLat = Math.max(maxLat, point.lat());
        minLng = Math.min(minLng, point.lng());
        maxLng = Math.max(maxLng, point.lng());
      }
      const bounds = maps.LatLngBounds.bounds(
        new maps.LatLng(minLat, minLng), new maps.LatLng(maxLat, maxLng)
      );
      map.fitBounds(bounds, { top: 22, right: 70, bottom: 28, left: 22, maxZoom: 17 });
      const size = map.getSize();
      const projection = map.getProjection();
      if (!size || !projection) return;
      const offsets = points.map((point) => projection.fromCoordToOffset(point));
      const centerX = size.width / 2;
      const centerY = size.height / 2;
      if (offsets.every((offset) => {
        const nextX = centerX + (offset.x - centerX) * 2;
        const nextY = centerY + (offset.y - centerY) * 2;
        return nextX >= 30 && nextX <= size.width - 70
          && nextY >= 36 && nextY <= size.height - 36;
      })) map.setZoom(Math.min(map.getZoom() + 1, 17));
    };
    const paintWalkRoute = () => {
      if ((!walkRequested && activeTransportMode !== 'preview') || !walkRouteReady) return;
      showWalkRoute(walkRouteReady.route);
      routeCoordinates = walkRouteReady.coordinates;
      if (!routeLines.length) {
        routeLines = walkRouteReady.paths.flatMap((path) => [
          new maps.Polyline({
            map, path, strokeColor: '#07334d', strokeWeight: 9,
            strokeOpacity: 0.95, strokeLineCap: 'round', strokeLineJoin: 'round', zIndex: 60
          }),
          new maps.Polyline({
            map, path, strokeColor: '#26e7ed', strokeWeight: 5,
            strokeOpacity: 1, strokeLineCap: 'round', strokeLineJoin: 'round', zIndex: 61
          })
        ]);
        map.autoResize();
        updateWalkMapView();
      }
      if (activeTransportMode === 'preview') {
        document.querySelector('.transport-option[data-mode="walk"]')?.setAttribute('aria-pressed', 'true');
        initialWalkMapSettled = true;
        window.requestAnimationFrame(() => window.requestAnimationFrame(revealMap));
      }
    };
    const beginWalkPanorama = (prepared) => {
      if (walkPanoramaPreparing) return;
      const section = document.querySelector('.walk-panorama[data-panorama-kind="walk"]');
      if (section.dataset.entryReady === 'true') {
        if (walkRequested) {
          setGuideView('panorama', { kind: 'walk' });
          paintWalkRoute();
        }
        return;
      }
      walkPanoramaPreparing = true;
      const preparationId = ++walkPreparationId;
      const requestId = walkRouteRequestId;
      void walkPanorama.start(prepared.route, prepared.end, {
        preload: true,
        startIsStation, startTitle, destinationTitle,
        startStationLocation: prepared.startExit
      }).then((ready) => {
        if (session !== routeMapSession || currentPage !== 'guide'
          || requestId !== walkRouteRequestId || preparationId !== walkPreparationId) return;
        if (ready) {
          section.dataset.entryReady = 'true';
          if (walkRequested) {
            setGuideView('panorama', { kind: 'walk' });
            paintWalkRoute();
          }
        } else if (walkRequested) {
          if (guideView === 'panorama') setGuideView('route');
          paintWalkRoute();
          setStatus('로드뷰 장면을 확인할 수 없어 지도 경로를 표시합니다.', 'error');
        }
      }).catch(() => {
        if (session !== routeMapSession || currentPage !== 'guide'
          || !walkRequested || requestId !== walkRouteRequestId || preparationId !== walkPreparationId) return;
        if (guideView === 'panorama') setGuideView('route');
        paintWalkRoute();
        setStatus('로드뷰를 불러오지 못해 지도 경로를 표시합니다.', 'error');
      }).finally(() => {
        if (preparationId === walkPreparationId) walkPanoramaPreparing = false;
      });
    };
    const requestWalkRoute = () => {
      if (destinationState !== 'success' || !destinationLocation) return;
      if (locationState === 'error') {
        showWalkMessage(routeStartQuery ? '출발지를 확인할 수 없어 도보 경로를 요청하지 않았습니다.' : '현재 GPS 위치를 확인할 수 없어 도보 경로를 요청하지 않았습니다.', true);
        if (walkRequested && guideView === 'panorama') setGuideView('route');
        return;
      }
      if (!currentLocation) {
        showWalkMessage(routeStartQuery ? '출발지 확인 후 도보 경로를 조회합니다.' : 'GPS 확인 후 도보 경로를 조회합니다.');
        return;
      }
      const start = { lat: currentLocation.lat(), lng: currentLocation.lng() };
      const end = { lat: destinationLocation.lat(), lng: destinationLocation.lng() };
      const requestKey = `${start.lat},${start.lng}:${end.lat},${end.lng}`;
      if (walkRouteReady?.key === requestKey) {
        beginWalkPanorama(walkRouteReady);
        return;
      }
      if (walkRouteController && walkRouteRequestKey === requestKey) return;
      walkPanorama.stop();
      if (walkRequested && guideView === 'panorama') {
        const section = document.querySelector('.walk-panorama[data-panorama-kind="walk"]');
        section.hidden = false;
        section.classList.add('is-loading');
      }
      walkRouteController?.abort();
      const controller = new AbortController();
      walkRouteController = controller;
      walkRouteRequestKey = requestKey;
      const requestId = ++walkRouteRequestId;
      if (walkRequested || activeTransportMode === 'preview') removeRouteLines();
      if (walkRequested) showWalkMessage('TMAP에서 실제 도보 경로를 조회하고 있습니다.');
      const startStationName = startIsStation
        ? startTitle.match(/^(.+?역)(?:\s|\(|$)/)?.[1] : null;
      const destinationStationName = destinationTitle.match(/^(.+?역)(?:\s|\(|$)/)?.[1];
      let walkEnd = end;
      let walkStartExit = null;
      Promise.all([
        startStationName ? findStationExit(startStationName, start, start).catch(() => null) : null,
        destinationStationName ? findStationExit(destinationStationName, end, end).catch(() => null) : null
      ]).then(([startExit, destinationExit]) => {
        if (controller.signal.aborted || requestId !== walkRouteRequestId) return null;
        walkStartExit = startExit && Math.hypot(
          (startExit.lat - start.lat) * 111195,
          (startExit.lng - start.lng) * 111195 * Math.cos(start.lat * Math.PI / 180)
        ) <= 120 ? { lat: startExit.lat, lng: startExit.lng } : null;
        const walkStart = walkStartExit || start;
        walkEnd = destinationExit && Math.hypot(
          (destinationExit.lat - end.lat) * 111195,
          (destinationExit.lng - end.lng) * 111195 * Math.cos(end.lat * Math.PI / 180)
        ) <= 80 ? { lat: destinationExit.lat, lng: destinationExit.lng } : end;
        return fetch('/api/transit/walk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: walkStart, end: walkEnd }),
        signal: controller.signal
        });
      }).then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'TMAP 도보 경로 조회에 실패했습니다.');
        return payload;
      }).then((payload) => {
        if (!payload) return;
        if (session !== routeMapSession || currentPage !== 'guide'
          || requestId !== walkRouteRequestId) return;
        const route = payload.route;
        if (!payload.coordinateMatch || !route || !Number.isFinite(route.totalSeconds)
          || !Number.isFinite(route.distanceMeters) || !Array.isArray(route.segments)
          || !route.segments.length || route.segments.some((segment) => segment.mode !== 'WALK')) {
          throw new Error('TMAP 도보 경로와 요청 좌표를 확인할 수 없습니다.');
        }
        const segments = route.segments.map((segment) => {
          if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2) {
            throw new Error('TMAP 도보 경로 형상 좌표가 부족합니다.');
          }
          const points = segment.coordinates.map(([lng, lat]) => {
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('TMAP 도보 경로 좌표가 올바르지 않습니다.');
            return new maps.LatLng(lat, lng);
          });
          return { ...segment, points };
        });
        const coordinates = segments.flatMap((segment) => segment.points);
        const paths = [];
        for (const segment of segments) {
          const path = paths.at(-1);
          const previousEnd = path?.at(-1);
          if (previousEnd && previousEnd.equals(segment.points[0])) {
            path.push(...segment.points.slice(1));
          } else {
            paths.push([...segment.points]);
          }
        }
        walkRouteReady = { key: requestKey, route, end: walkEnd, startExit: walkStartExit, paths, coordinates };
        paintWalkRoute();
        beginWalkPanorama(walkRouteReady);
      }).catch((error) => {
        if (controller.signal.aborted || session !== routeMapSession || currentPage !== 'guide'
          || requestId !== walkRouteRequestId) return;
        if (walkRequested || activeTransportMode === 'preview') removeRouteLines();
        showWalkMessage(error instanceof Error ? error.message : 'TMAP 도보 경로 조회에 실패했습니다.', true);
        if (activeTransportMode === 'preview') {
          initialWalkMapSettled = true;
          revealMap();
          finishMapEntry();
        }
        if (walkRequested && guideView === 'panorama') setGuideView('route');
      }).finally(() => {
        if (walkRouteController === controller) {
          walkRouteController = null;
          walkRouteRequestKey = null;
        }
      });
    };
    changeWalkMode = (active) => {
      if (active) {
        requestWalkRoute();
      } else {
        walkPanorama.pause();
        document.querySelector('.walk-panorama[data-panorama-kind="walk"]')?.classList.add('is-preloading');
        removeRouteLines();
        if (destinationState === 'success') clearDestinationChoices();
        updateMapView();
      }
    };
    const markDestination = (latitude, longitude, title) => {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
      walkPanorama.stop();
      boardingPanorama.stop();
      walkRouteController?.abort();
      walkRouteController = null;
      walkRouteRequestKey = null;
      walkRouteRequestId += 1;
      if (walkRequested && guideView === 'panorama') {
        const section = document.querySelector('.walk-panorama[data-panorama-kind="walk"]');
        section.hidden = false;
        section.classList.add('is-loading');
      }
      routeController?.abort();
      routeController = null;
      routeRequestKey = null;
      routeRequestId += 1;
      walkRouteReady = null;
      walkPanoramaPreparing = false;
      walkPreparationId += 1;
      removeRouteLines();
      clearDestinationChoices();
      destinationLocation = new maps.LatLng(latitude, longitude);
      destinationMarker?.setMap(null);
      destinationMarker = new maps.Marker({
        map,
        position: destinationLocation,
        title,
        icon: {
          ...destinationPinIcon,
          content: destinationPinIcon.content.replace('aria-label="목적지 위치"', `aria-label="목적지: ${escapeHtml(title)}"`)
        },
        zIndex: 130
      });
      destinationTitle = title;
      destinationStatus = `${shortPlaceName(title)} 선택됨`;
      destinationState = 'success';
      updateMapView();
      updateStatus();
      requestSubwayRoute();
      requestBusRoute();
      requestWalkRoute();
      requestTaxiRoute();
      return true;
    };
    const markStart = (place) => {
      currentLocation = new maps.LatLng(place.lat, place.lng);
      startTitle = place.title || routeStartQuery;
      startIsStation = /(지하철|전철)/.test(place.category || '') && /역(?:\s|$)/.test(startTitle);
      new maps.Marker({
        map,
        position: currentLocation,
        title: `출발지: ${startTitle}`,
        icon: {
          ...startPinIcon,
          content: startPinIcon.content.replace('aria-label="출발지 위치"', `aria-label="출발지: ${escapeHtml(startTitle)}"`)
        },
        zIndex: 120
      });
      locationStatus = `${shortPlaceName(startTitle)} 선택됨`;
      locationState = 'success';
      updateMapView();
      updateStatus();
      searchNaverPlace(routeDestinationQuery, '목적지', markSelectedDestination);
    };
    const markSelectedDestination = (place) => {
      markDestination(place.lat, place.lng, place.title || routeDestinationQuery);
    };
    const searchNaverPlace = (query, role, onSelect) => {
      if (role === '목적지') {
        destinationStatus = '목적지를 검색하고 있습니다.';
        destinationState = 'pending';
        updateStatus();
      }
      fetchNaverPlaces(query).then((places) => {
        if (session !== routeMapSession || currentPage !== 'guide') return;
        const validPlaces = Array.isArray(places) ? places.filter((place) => (
          place && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng))
        )).map((place) => ({ ...place, lat: Number(place.lat), lng: Number(place.lng) })) : [];
        const result = resolveNaverPlace(query, validPlaces, role === '목적지' ? startTitle : '');
        if (result.selected) {
          onSelect(result.selected);
        } else if (result.choices.length) {
          if (role === '출발지') {
            locationStatus = `출발지 검색 결과 ${result.choices.length}곳 · 선택해 주세요`;
            locationState = 'info';
          } else {
            destinationStatus = `목적지 검색 결과 ${result.choices.length}곳 · 선택해 주세요`;
            destinationState = 'info';
          }
          renderPlaceChoices(result.choices, role, onSelect);
          updateStatus();
        } else {
          if (role === '출발지') {
            locationStatus = '네이버에서 일치하는 출발지를 확인하지 못했습니다.';
            locationState = 'error';
          } else {
            destinationStatus = '네이버에서 일치하는 목적지를 확인하지 못했습니다.';
            destinationState = 'error';
          }
          updateStatus();
        }
      }).catch((error) => {
        if (session !== routeMapSession || currentPage !== 'guide') return;
        const message = error instanceof Error && error.message
          ? error.message : '네이버 장소 검색에 실패했습니다. 다시 입력해 주세요.';
        if (role === '출발지') {
          locationStatus = message;
          locationState = 'error';
        } else {
          destinationStatus = message;
          destinationState = 'error';
        }
        updateStatus();
      });
    };

    if (routeStartQuery) {
      searchNaverPlace(routeStartQuery, '출발지', markStart);
    } else {
      currentPositionOnce().then((position) => {
        if (session !== routeMapSession || currentPage !== 'guide') return;
        const { latitude, longitude, accuracy } = position.coords;
        currentLocation = new maps.LatLng(latitude, longitude);
        new maps.Marker({
          map,
          position: currentLocation,
          title: '현재 위치',
          icon: currentLocationIcon,
          zIndex: 120
        });
        if (Number.isFinite(accuracy) && accuracy > 0) {
          new maps.Circle({
            map,
            center: currentLocation,
            radius: accuracy,
            fillColor: '#27d5e8',
            fillOpacity: 0.13,
            strokeColor: '#48e3f2',
            strokeOpacity: 0.72,
            strokeWeight: 1
          });
        }
        locationStatus = 'GPS 확인됨';
        locationState = 'success';
        updateMapView();
        updateStatus();
        requestSubwayRoute();
        requestBusRoute();
        requestWalkRoute();
        requestTaxiRoute();
      }).catch((error) => {
        if (session !== routeMapSession || currentPage !== 'guide') return;
        locationStatus = error?.code === 1
          ? '위치 권한이 없어 현재 위치를 표시하지 않습니다.'
          : '현재 위치를 확인하지 못했습니다.';
        locationState = 'error';
        updateMapView();
        updateStatus();
        requestSubwayRoute();
        requestBusRoute();
        requestWalkRoute();
        requestTaxiRoute();
      });

      if (routeDestinationQuery) {
        searchNaverPlace(routeDestinationQuery, '목적지', markSelectedDestination);
      }
    }
    updateStatus();
  }).catch((error) => {
    if (session !== routeMapSession || currentPage !== 'guide') return;
    const message = error instanceof Error ? error.message : '네이버 지도를 불러오지 못했습니다.';
    setStatus(message, 'error');
  });
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
  const messages = sentTextMessages.map((message) => {
    const userSide = !message.sourceLanguageCode || message.sourceLanguageCode.toLowerCase() === selectedUserLanguageCode.toLowerCase();
    const pending = message.status ? `<small class="translation-pending">${escapeHtml(message.status)}</small>` : '';
    return `<article class="speech-block ${userSide ? 'mine' : ''}"><span>${userSide ? '나' : '상대방'}</span><p>${escapeHtml(message.message)}</p>${message.response ? `<strong>${escapeHtml(message.response)}</strong>` : ''}${pending}</article>`;
  }).join('');
  const stateLabel = voiceConversationState === 'listening' ? '듣고 있어요' : voiceConversationState === 'processing' ? '내용을 이해하고 있어요' : voiceConversationState === 'speaking' ? '응답을 말하고 있어요' : voiceConversationState === 'error' ? voiceConversationError : voicePaused ? '일시정지' : '통역 준비 중';
  const controlLabel = voiceConversationState === 'error' ? '다시 듣기' : voicePaused ? '계속하기' : '일시정지';
  return `<main class="screen content-screen conversation-screen voice-screen">
    ${conversationHeader('음성으로 대화')}
    <section class="conversation-body">
      <p class="translating" role="status" aria-live="polite">${escapeHtml(stateLabel)}</p>
      ${messages || '<p class="voice-empty">말씀하시면 언어를 감지해 통역할게요.</p>'}
    </section>
    ${voiceConversationState === 'error' ? '<button class="voice-text-fallback" data-page="text">문자로 대화</button>' : ''}
    <button class="pause-button" data-action="voice-toggle" aria-pressed="${voicePaused}">${icon(voicePaused ? 'play' : 'pause', 30)}<span>${controlLabel}</span></button>
  </main>`;
}

function textScreen() {
  const outgoingMessages = sentTextMessages.map((message) => {
    const pendingNotice = message.status
      ? `<small class="translation-pending" role="status" aria-live="polite">${escapeHtml(message.status)}</small>`
      : '';
    const translatedText = message.intent === 'translation' && message.response
      ? `<strong>${escapeHtml(message.response)}</strong>`
      : '';
    const assistantReply = message.response && message.intent !== 'translation'
      ? `<article class="text-bubble other"><span>2SPEAKER</span><p>${escapeHtml(message.response)}</p></article>`
      : '';
    return `<article class="text-bubble me"><span>나</span><p>${escapeHtml(message.message)}</p>${translatedText}${pendingNotice}</article>${assistantReply}`;
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
    home: homeScreen, route: routeScreen, guide: guideScreen, translation: translationScreen,
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
  const languageOptions = supportedUserLanguages.map((language) => `<button data-user-language="${escapeHtml(language.code)}" data-user-language-name="${escapeHtml(language.name)}" aria-pressed="${language.code === selectedUserLanguageCode}"><span>${escapeHtml(language.name)}</span>${language.code === selectedUserLanguageCode ? icon('check', 30) : ''}</button>`).join('');
  return `<main class="screen content-screen">${header('내 언어 선택')}
    <section class="page-body language-picker-body">
      <label class="language-search"><span class="sr-only">언어 검색</span><input id="language-search" type="search" placeholder="언어 검색" autocomplete="off"></label>
      <p class="language-loading" data-language-status role="status" aria-live="polite">${supportedUserLanguagesLoaded ? '' : '전체 번역 지원 언어를 불러오는 중이에요.'}</p>
      <div class="language-list" id="user-language-options">${languageOptions}</div>
    </section>
  </main>`;
}

function renderUserLanguageOptions(filter = '') {
  const container = document.querySelector('#user-language-options');
  if (!container) return;
  const query = filter.trim().toLocaleLowerCase();
  const matches = supportedUserLanguages.filter((language) =>
    !query || language.name.toLocaleLowerCase().includes(query) || language.code.toLocaleLowerCase().includes(query)
  );
  container.innerHTML = matches.length
    ? matches.map((language) => `<button data-user-language="${escapeHtml(language.code)}" data-user-language-name="${escapeHtml(language.name)}" aria-pressed="${language.code === selectedUserLanguageCode}"><span>${escapeHtml(language.name)}</span>${language.code === selectedUserLanguageCode ? icon('check', 30) : ''}</button>`).join('')
    : '<p class="language-empty">검색 결과가 없어요.</p>';
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
      <article class="howto-step"><span class="howto-icon">${icon('translate', 46)}</span><div><h2>통역</h2><p>상대방과 그대로 대화하세요.<br>AI가 언어를 자동 인식해 실시간 통역합니다.</p></div></article>
      <article class="howto-step"><span class="howto-icon">${icon('sparkles', 46)}</span><div><h2>핵심</h2><p>말하면 AI가 알아서 처리합니다.</p></div></article>
    </section>
  </main>`;
}

const faqItems = [
  ['2SPEAKER는 어떻게 사용하나요?', '통역이 필요하면 음성 또는 문자 대화를 시작하세요. AI가 언어를 자동 인식해 전달합니다.'],
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
        <select id="contact-type" aria-label="문의 유형"><option>통역 오류</option><option>이용 문의</option><option>기타</option></select>
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

function render({ preserveSearch = false } = {}) {
  stopRouteRecognition();
  finishMapEntry();
  const origin = preserveSearch ? root.querySelector('.app-shell')?.cloneNode(true) : null;
  const screens = {
    home: homeScreen, route: routeScreen, guide: guideScreen, translation: translationScreen,
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
      ['제2조 서비스 제공', '2SPEAKER는 실시간 통역·번역 및 관련 AI 기능을 제공합니다.'],
      ['제3조 계정 및 이용', '계정이 필요한 기능은 가입 후 이용할 수 있습니다.'],
      ['제4조 서비스 이용 시 유의사항', 'AI가 제공하는 정보는 실제 상황과 다를 수 있습니다.<br>사용자는 현장 상황과 안전을 함께 확인해야 합니다.'],
      ['제5조 금지 행위', '서비스 운영을 방해하거나 타인의 권리를 침해하는 방식으로 이용해서는 안 됩니다.'],
      ['제6조 서비스 변경 및 중단', '서비스 개선, 점검 또는 운영상 필요한 경우 일부 기능이 변경되거나 일시 중단될 수 있습니다.'],
      ['제7조 기타', '본 약관에 정하지 않은 사항은 관련 법령과 서비스 운영 정책에 따릅니다.']
    ]),
    privacy: () => legalScreen('개인정보처리방침', [
      ['1. 수집·처리하는 정보', '2SPEAKER는 서비스 제공에 필요한 범위에서 다음 정보를 처리할 수 있습니다.<br>- 계정 정보: 이메일 등<br>- 음성·텍스트 입력 정보: 통역·번역 이용 시<br>- 서비스 이용 및 오류 기록'],
      ['2. 이용 목적', '수집된 정보는 다음 목적으로 이용합니다.<br>- 실시간 통역·번역<br>- 계정 관리<br>- 오류 확인 및 서비스 개선'],
      ['3. 보관 및 파기', '개인정보는 서비스 제공에 필요한 기간 동안만 이용하며, 목적이 달성되면 관련 법령에 따라 안전하게 파기합니다.'],
      ['4. 제3자 제공 및 외부 서비스', '이용자의 동의 또는 법적 근거 없이 개인정보를 제3자에게 제공하지 않습니다.<br>로그인, AI 처리 등 외부 서비스가 필요한 경우 필요한 범위에서만 정보를 처리합니다.'],
      ['5. 이용자의 권리', '이용자는 자신의 개인정보에 대해 열람, 수정, 삭제 및 처리 정지를 요청할 수 있습니다.'],
      ['6. 개인정보 문의', '개인정보와 관련된 문의는 2SPEAKER 문의 / 오류 신고를 통해 접수할 수 있습니다.']
    ])
  };
  activeWalkPanorama?.stop();
  activeWalkPanorama = null;
  activeBoardingPanorama?.stop();
  activeBoardingPanorama = null;
  activeGuideConversation?.stop();
  activeGuideConversation = null;
  root.innerHTML = `<div class="app-shell">${screens[currentPage]()}</div>`;
  if (origin) {
    origin.classList.add('map-entry-origin');
    origin.inert = true;
    origin.setAttribute('aria-hidden', 'true');
    origin.querySelector('.route-search-feedback')?.replaceChildren();
    root.append(origin);
    mapEntryOrigin = origin;
  }
  syncGuideChatButtons();
  if (currentPage === 'guide') {
    initializeNaverRouteMap();
    activeGuideConversation = createGuideConversation(document.querySelector('.guide-conversation'), {
      getContext: () => ({
        start: routeStartQuery || 'GPS 현재 위치',
        destination: routeDestinationQuery,
        mode: routeTransportMode,
        routeVerified: Boolean(document.querySelector('.guide-dialogue .subway-route-panel[aria-label^="TMAP"]')),
        routeText: document.querySelector('.guide-dialogue')?.innerText?.slice(0, 2600) || ''
      })
    });
    document.querySelectorAll('[data-panorama-chat]').forEach((button) => {
      button.addEventListener('click', () => toggleGuideChat(
        button.dataset.panoramaChat
      ));
    });
    document.querySelector('.guide-chat-tabs')?.addEventListener('click', syncGuideChatButtons);
  }
  else routeMapSession += 1;
  if (currentPage === 'route') void loadNaverMaps().catch(() => {});

  document.querySelectorAll('.transport-option').forEach((button) => {
    button.addEventListener('click', () => {
      const panorama = document.querySelector('.walk-panorama[data-panorama-kind="walk"]');
      if (routeTransportMode !== button.dataset.mode) activeBoardingPanorama?.stop?.();
      routeTransportMode = button.dataset.mode;
      document.querySelectorAll('.transport-option').forEach((option) => {
        option.setAttribute('aria-pressed', String(option === button));
      });
      if (button.dataset.mode === 'walk' && panorama?.dataset.entryReady === 'true') {
        setGuideView('panorama', { kind: 'walk' });
      }
      document.querySelector('#route-map')?.dispatchEvent(new CustomEvent('transport-mode-change', {
        detail: { mode: button.dataset.mode }
      }));
    });
  });

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
  document.querySelectorAll('[data-action="back"]').forEach((button) => {
    button.addEventListener('click', goBack);
  });
  document.querySelector('[data-action="show-guide-map"]')?.addEventListener('click', () => {
    setGuideView('route');
  });
  document.querySelectorAll('[data-action="menu-close"]').forEach((button) => {
    button.addEventListener('click', goBack);
  });
  document.querySelector('[data-action="voice-toggle"]')?.addEventListener('click', () => {
    if (voiceConversationState === 'error') {
      voicePaused = false;
      voiceConversationError = '';
      voiceConversationState = 'idle';
      startVoiceConversation();
      return;
    }
    voicePaused = !voicePaused;
    if (voicePaused) {
      stopVoiceConversation();
      voiceConversationState = 'paused';
      render();
    } else {
      voiceConversationState = 'idle';
      render();
      startVoiceConversation();
    }
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
  document.querySelector('#user-language-options')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-user-language]');
    if (button) selectUserLanguage(button.dataset.userLanguage, button.dataset.userLanguageName);
  });
  document.querySelector('#language-search')?.addEventListener('input', (event) => renderUserLanguageOptions(event.target.value));
  document.querySelectorAll('[data-account-action]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelector('.account-notice').textContent = `${button.dataset.accountAction} 기능은 인증 서버 연결 후 이용할 수 있습니다.`;
    });
  });

if (currentPage === 'user-language-list' && !supportedUserLanguagesLoaded && !supportedUserLanguagesLoading) {
    supportedUserLanguagesLoading = true;
    fetch('/api/translation/languages')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.languages)) throw new Error(payload.error || '전체 언어 목록을 불러오지 못했어요.');
        supportedUserLanguages = payload.languages;
        supportedUserLanguagesLoaded = true;
        const status = document.querySelector('[data-language-status]');
        if (status) status.textContent = '';
        renderUserLanguageOptions(document.querySelector('#language-search')?.value || '');
      })
      .catch((error) => {
        const status = document.querySelector('[data-language-status]');
        if (status) status.textContent = error instanceof Error ? error.message : '전체 언어 목록을 불러오지 못했어요.';
      })
      .finally(() => { supportedUserLanguagesLoading = false; });
  }

  const routeInput = document.querySelector('#route-destination');
  const routeTextAction = document.querySelector('[data-action="route-text"]');
  routeTextAction?.addEventListener('click', () => {
    if (routeInput?.value.trim()) routeInput.form.requestSubmit();
    else routeInput?.focus();
  });
  const routeVoiceButton = document.querySelector('.route-voice-button');
  routeVoiceButton?.addEventListener('click', () => {
    if (routeInput?.readOnly) return;
    const feedback = document.querySelector('.route-search-feedback');
    if (activeRouteRecognition) {
      stopRouteRecognition();
      routeVoiceButton.setAttribute('aria-pressed', 'false');
      if (feedback) {
        feedback.textContent = '음성 입력을 취소했습니다.';
        feedback.classList.remove('is-error');
      }
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (feedback) {
        feedback.textContent = '이 브라우저에서는 음성 인식을 지원하지 않습니다. 문자로 입력해 주세요.';
        feedback.classList.add('is-error');
      }
      return;
    }
    const recognition = new SpeechRecognition();
    activeRouteRecognition = recognition;
    recognition.lang = ({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' })[selectedUserLanguageCode]
      || selectedUserLanguageCode || 'ko-KR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (activeRouteRecognition !== recognition || !routeInput?.isConnected) return;
      routeVoiceButton.setAttribute('aria-pressed', 'true');
      if (feedback) {
        feedback.textContent = '목적지를 말씀해 주세요.';
        feedback.classList.remove('is-error');
      }
    };
    recognition.onresult = (event) => {
      if (activeRouteRecognition !== recognition || currentPage !== 'route' || !routeInput?.isConnected) return;
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      activeRouteRecognition = null;
      recognition.stop();
      routeVoiceButton.setAttribute('aria-pressed', 'false');
      routeInput.value = transcript;
      routeInput.dispatchEvent(new Event('input', { bubbles: true }));
      routeInput.form.requestSubmit();
    };
    recognition.onerror = (event) => {
      if (activeRouteRecognition !== recognition || event.error === 'aborted') return;
      activeRouteRecognition = null;
      routeVoiceButton.setAttribute('aria-pressed', 'false');
      if (feedback) {
        feedback.textContent = event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? '마이크 권한을 허용한 뒤 다시 말씀해 주세요.'
          : event.error === 'language-not-supported'
            ? '이 브라우저에서 선택한 언어의 음성 인식을 지원하지 않습니다.'
            : '음성을 듣지 못했습니다. 마이크를 다시 눌러주세요.';
        feedback.classList.add('is-error');
      }
    };
    recognition.onend = () => {
      if (activeRouteRecognition !== recognition) return;
      activeRouteRecognition = null;
      routeVoiceButton.setAttribute('aria-pressed', 'false');
      if (feedback) {
        feedback.textContent = '음성이 들리지 않았습니다. 마이크를 다시 눌러주세요.';
        feedback.classList.add('is-error');
      }
    };
    try {
      recognition.start();
    } catch {
      activeRouteRecognition = null;
      routeVoiceButton.setAttribute('aria-pressed', 'false');
      if (feedback) {
        feedback.textContent = '음성 입력을 시작하지 못했습니다. 마이크 설정을 확인해 주세요.';
        feedback.classList.add('is-error');
      }
    }
  });

  document.querySelector('#home-search')?.addEventListener('click', () => {
    routeEntryMode = 'simple';
    navigate('route');
    document.querySelector('#route-destination')?.focus();
  });
  routeInput?.addEventListener('input', (event) => {
    routeInput.setCustomValidity('');
    const feedback = document.querySelector('.route-search-feedback');
    if (feedback) {
      feedback.textContent = '';
      feedback.classList.remove('is-error');
    }
    const routeSubmit = document.querySelector('.route-submit');
    if (routeSubmit) routeSubmit.hidden = !event.target.value.trim();
    routeTextAction?.setAttribute('aria-label', event.target.value.trim() ? '입력한 장소 검색' : '문자로 목적지 입력');
  });
  document.querySelector('#route-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    stopRouteRecognition();
    const query = routeInput?.value.trim();
    if (!query || routeInput.readOnly) return;
    const feedback = document.querySelector('.route-search-feedback');
    const directIntent = directRouteIntent(query, routeEntryMode);
    if (feedback) {
      feedback.textContent = '';
      feedback.classList.remove('is-error');
    }
    const requestId = ++routeIntentRequestId;
    routeInput.readOnly = true;
    routeInput.setAttribute('aria-busy', 'true');
    try {
      let intent = directIntent;
      if (!intent) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 18_000);
        try {
          const response = await fetch('/api/route/interpret', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: query, history: routeIntentHistory }),
            signal: controller.signal
          });
          intent = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(intent.error || '길찾기 요청을 이해하지 못했습니다.');
        } finally {
          window.clearTimeout(timeout);
        }
      }
      if (!['vertex', 'direct'].includes(intent.provider) || typeof intent.start !== 'string'
        || typeof intent.destination !== 'string' || typeof intent.useCurrentLocation !== 'boolean'
        || intent.useCurrentLocation !== !intent.start || !intent.destination.trim()
        || !['walk', 'subway', 'bus', 'taxi', 'unspecified'].includes(intent.mode)) {
        throw new Error('Gemini 길찾기 결과를 확인할 수 없습니다.');
      }
      if (requestId !== routeIntentRequestId || currentPage !== 'route' || !routeInput.isConnected) return;
      routeStartQuery = intent.start.trim();
      routeDestinationQuery = intent.destination.trim();
      routeIntentHistory.push({ start: routeStartQuery, destination: routeDestinationQuery, mode: intent.mode });
      if (routeIntentHistory.length > 4) routeIntentHistory.shift();
      navigate('guide');
    } catch (error) {
      if (requestId !== routeIntentRequestId || currentPage !== 'route' || !routeInput.isConnected) return;
      if (feedback) {
        feedback.textContent = error?.name === 'AbortError'
          ? 'AI 응답이 지연되고 있습니다. 다시 검색해 주세요.'
          : error instanceof Error ? error.message : '길찾기 요청을 처리하지 못했습니다.';
        feedback.classList.add('is-error');
      }
    } finally {
      if (routeInput.isConnected) {
        routeInput.readOnly = false;
        routeInput.removeAttribute('aria-busy');
      }
    }
  });
  document.querySelector('.message-composer')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    sendTextMessage(message);
  });
  document.querySelector('#contact-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    document.querySelector('.contact-notice').textContent = '문의 접수는 서버 연결 후 이용할 수 있습니다.';
  });
}

function selectUserLanguage(code, name) {
  if (!code || !name) return;
  selectedUserLanguageCode = code;
  selectedUserLanguage = name;
  activeCounterpartLanguageCode = '';
  voiceListenLanguageCode = code;
  pageHistory.pop();
  currentPage = 'translation';
  render();
}

function getAssistantHistory() {
  return sentTextMessages
    .filter((message) => message.response)
    .slice(-4)
    .flatMap((message) => [
      { role: 'user', text: message.message, intent: message.intent },
      { role: 'model', text: message.response, intent: message.intent }
    ]);
}

function refreshConversationView() {
  if (!['text', 'voice'].includes(currentPage)) return;
  render();
  const dialogue = document.querySelector('.text-dialogue');
  if (dialogue) dialogue.scrollTop = dialogue.scrollHeight;
}

async function sendTextMessage(message) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    message,
    response: '',
    intent: '',
    status: '요청 내용을 확인하고 있어요.'
  };
  sentTextMessages.push(entry);
  refreshConversationView();

  try {
    const assistantResponse = await fetch('/api/assistant/reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message,
        userLanguage: selectedUserLanguageCode,
        counterpartLanguage: activeCounterpartLanguageCode,
        history: getAssistantHistory()
      })
    });
    const assistantResult = await assistantResponse.json().catch(() => ({}));
    if (!assistantResponse.ok) throw new Error(assistantResult.error || '응답을 불러오지 못했어요.');

    entry.intent = assistantResult.intent || '';
    if (assistantResult.useTranslationApi) {
      entry.status = 'Google Translation으로 번역하고 있어요.';
      refreshConversationView();
      const translationResponse = await fetch('/api/translation/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: message,
          userLanguage: selectedUserLanguageCode,
          counterpartLanguage: activeCounterpartLanguageCode,
          sourceLanguage: assistantResult.sourceLanguage,
          englishText: assistantResult.englishText
        })
      });
      const translationResult = await translationResponse.json().catch(() => ({}));
      if (!translationResponse.ok) throw new Error(translationResult.error || '번역 결과를 불러오지 못했어요.');
      entry.intent = translationResult.intent;
      entry.response = translationResult.text;
      entry.sourceLanguageCode = translationResult.sourceLanguage || '';
      entry.targetLanguageCode = translationResult.targetLanguage || '';
      if (translationResult.sourceLanguage && translationResult.sourceLanguage.toLowerCase() !== selectedUserLanguageCode.toLowerCase()) {
        activeCounterpartLanguageCode = translationResult.sourceLanguage;
      } else if (translationResult.targetLanguage && translationResult.targetLanguage.toLowerCase() !== selectedUserLanguageCode.toLowerCase()) {
        activeCounterpartLanguageCode = translationResult.targetLanguage;
      }
    } else {
      entry.response = assistantResult.text || '';
      entry.sourceLanguageCode = assistantResult.sourceLanguage || '';
      entry.targetLanguageCode = entry.sourceLanguageCode;
      if (assistantResult.sourceLanguage && assistantResult.sourceLanguage.toLowerCase() !== selectedUserLanguageCode.toLowerCase()) {
        activeCounterpartLanguageCode = assistantResult.sourceLanguage;
      }
    }
    entry.status = '';
  } catch (error) {
    entry.status = error instanceof Error ? error.message : '응답을 불러오지 못했어요.';
  }

  refreshConversationView();
  return entry;
}

function stopVoiceConversation() {
  const recognition = activeVoiceRecognition;
  activeVoiceRecognition = null;
  if (recognition) recognition.abort();
  window.speechSynthesis?.cancel();
}

function startVoiceConversation() {
  if (voicePaused || currentPage !== 'voice' || activeVoiceRecognition) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceConversationState = 'error';
    voiceConversationError = '이 브라우저에서 음성 인식을 지원하지 않아요.';
    render();
    return;
  }

  voiceListenLanguageCode ||= selectedUserLanguageCode;
  const recognition = new SpeechRecognition();
  activeVoiceRecognition = recognition;
  recognition.lang = voiceListenLanguageCode;
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    if (activeVoiceRecognition !== recognition) return;
    voiceConversationState = 'listening';
    voiceConversationError = '';
    render();
  };
  recognition.onresult = (event) => {
    if (activeVoiceRecognition !== recognition) return;
    const message = event.results[0]?.[0]?.transcript?.trim();
    if (!message) return;
    activeVoiceRecognition = null;
    recognition.stop();
    voiceConversationState = 'processing';
    render();
    processVoiceTurn(message);
  };
  recognition.onerror = (event) => {
    if (activeVoiceRecognition !== recognition || event.error === 'aborted') return;
    activeVoiceRecognition = null;
    voiceConversationState = 'error';
    voiceConversationError = event.error === 'not-allowed' || event.error === 'service-not-allowed'
      ? '마이크 권한을 허용하면 음성 통역을 시작할 수 있어요.'
      : event.error === 'language-not-supported'
        ? '이 브라우저의 음성 인식에서 선택한 언어를 지원하지 않아요.'
        : '음성을 듣지 못했어요. 다시 듣기를 눌러주세요.';
    render();
  };
  recognition.onend = () => {
    if (activeVoiceRecognition !== recognition) return;
    activeVoiceRecognition = null;
    if (!voicePaused && currentPage === 'voice' && voiceConversationState === 'listening') {
      voiceConversationState = 'error';
      voiceConversationError = '음성이 들리지 않았어요. 다시 듣기를 눌러주세요.';
      render();
    }
  };
  try {
    recognition.start();
  } catch {
    activeVoiceRecognition = null;
    voiceConversationState = 'error';
    voiceConversationError = '음성 인식을 시작하지 못했어요. 마이크 설정을 확인해 주세요.';
    render();
  }
}

async function processVoiceTurn(message) {
  const entry = await sendTextMessage(message);
  if (currentPage !== 'voice' || voicePaused) return;
  if (entry.status || !entry.response) {
    voiceConversationState = 'error';
    voiceConversationError = entry.status || '응답을 만들지 못했어요.';
    render();
    return;
  }

  voiceListenLanguageCode = entry.targetLanguageCode || entry.sourceLanguageCode || selectedUserLanguageCode;
  const SpeechUtterance = window.SpeechSynthesisUtterance;
  if (!SpeechUtterance || !window.speechSynthesis) {
    voiceConversationState = 'error';
    voiceConversationError = '이 브라우저에서 음성 출력을 지원하지 않아요.';
    render();
    return;
  }

  const utterance = new SpeechUtterance(entry.response);
  utterance.lang = voiceListenLanguageCode;
  utterance.onstart = () => {
    if (currentPage !== 'voice' || voicePaused) return;
    voiceConversationState = 'speaking';
    render();
  };
  utterance.onend = () => {
    if (currentPage !== 'voice' || voicePaused) return;
    voiceConversationState = 'idle';
    render();
    startVoiceConversation();
  };
  utterance.onerror = () => {
    if (currentPage !== 'voice' || voicePaused) return;
    voiceConversationState = 'error';
    voiceConversationError = '음성으로 답하지 못했어요. 다시 듣기를 눌러주세요.';
    render();
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function guideHistoryStep() {
  return window.history.state?.[guideHistoryStateKey];
}

function pushGuideHistory(step) {
  const state = window.history.state;
  window.history.pushState({
    ...(state && typeof state === 'object' ? state : {}),
    [guideHistoryStateKey]: step
  }, '', window.location.href);
}

function syncGuideChatButtons() {
  const content = document.querySelector('.guide-content');
  const expanded = content?.dataset.guideView === 'route' && content.dataset.chatExpanded === 'true';
  if (!content) return;
  const activeMode = content.querySelector('.guide-chat-tabs [aria-pressed="true"]')?.dataset.chatMode;
  content.querySelectorAll('[data-panorama-chat]').forEach((button) => {
    const mode = button.dataset.panoramaChat;
    button.setAttribute('aria-expanded', String(expanded && mode === activeMode));
  });
  content.querySelectorAll('.guide-chat-tabs [data-chat-mode]').forEach((button) =>
    button.setAttribute('aria-expanded', String(expanded)));
}

function toggleGuideChat(mode) {
  const returningFromPanorama = guideView === 'panorama';
  if (returningFromPanorama) setGuideView('route');
  const content = document.querySelector('.guide-content');
  const tab = content?.querySelector(`.guide-chat-tabs [data-chat-mode="${mode}"]`);
  if (!content || !tab) return;
  if (content.dataset.chatExpanded === 'true' && tab.getAttribute('aria-pressed') === 'true') {
    activeGuideConversation?.cancelSelection?.();
    content.dataset.chatExpanded = 'false';
  } else {
    tab.click();
  }
  syncGuideChatButtons();
  if (returningFromPanorama) window.requestAnimationFrame(() => window.scrollTo(0, 0));
}

function setGuideView(view, { fromHistory = false, kind = null } = {}) {
  const previousView = guideView;
  if (view === 'route' && previousView === 'panorama') {
    activeWalkPanorama?.pause?.();
    activeBoardingPanorama?.pause?.();
  }
  if (view !== previousView) activeGuideConversation?.cancelSelection?.();
  if (!fromHistory && currentPage === 'guide' && view !== previousView) {
    if (view === 'panorama') pushGuideHistory('panorama');
    else if (previousView === 'panorama' && guideHistoryStep() === 'panorama') window.history.back();
  }
  guideView = view;
  const content = document.querySelector('.guide-content');
  if (!content) return;
  content.dataset.guideView = view;
  if (kind) content.dataset.panoramaKind = kind;
  const visibleKind = content.dataset.panoramaKind || 'walk';
  content.querySelectorAll('.walk-panorama').forEach((section) => {
    if (!section.hidden) section.classList.toggle('is-preloading',
      view !== 'panorama' || section.dataset.panoramaKind !== visibleKind);
  });
  if (view === 'panorama') {
    const viewer = visibleKind === 'boarding' ? activeBoardingPanorama : activeWalkPanorama;
    viewer?.resize?.();
    window.requestAnimationFrame(() => viewer?.resize?.());
  }
  if (view !== previousView) content.dataset.chatExpanded = 'false';
  syncGuideChatButtons();
  content.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function navigate(page) {
  const preserveSearch = currentPage === 'route' && page === 'guide';
  if (currentPage === 'voice' && page !== 'voice') stopVoiceConversation();
  if (page !== currentPage) pageHistory.push(currentPage);
  currentPage = page;
  if (page === 'guide') {
    guideView = 'route';
    routeTransportMode = '';
    pushGuideHistory('route');
  }
  if (page === 'voice') {
    voicePaused = false;
    voiceConversationError = '';
    voiceConversationState = 'idle';
    voiceListenLanguageCode ||= selectedUserLanguageCode;
  }
  render({ preserveSearch });
  if (page === 'voice') startVoiceConversation();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function goBack() {
  if (currentPage === 'guide' && guideView === 'panorama') {
    setGuideView('route');
    return;
  }
  if (currentPage === 'voice') stopVoiceConversation();
  currentPage = pageHistory.pop() || 'home';
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

window.history.scrollRestoration = 'manual';
window.history.replaceState({
  ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}),
  [guideHistoryStateKey]: 'home'
}, '', window.location.href);

window.addEventListener('popstate', (event) => {
  const step = event.state?.[guideHistoryStateKey];
  if (step === 'panorama' || step === 'route') {
    if (currentPage !== 'guide') {
      currentPage = 'guide';
      guideView = step;
      render();
    } else {
      setGuideView(step, { fromHistory: true });
    }
    window.requestAnimationFrame(() => window.scrollTo(0, 0));
    return;
  }
  if (currentPage === 'guide' || step === 'home') {
    activeWalkPanorama?.pause?.();
    activeBoardingPanorama?.pause?.();
    currentPage = 'home';
    guideView = 'route';
    pageHistory.length = 0;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
});

render();
