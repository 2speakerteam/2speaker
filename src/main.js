const root = document.querySelector('#root');
let currentPage = 'home';
let routeEntryMode = 'dual';
let routeDestinationQuery = '';
let routeMapLoaderPromise = null;
let routeMapSession = 0;
let routeMapAuthError = '';
let routeMapAuthFailureInstalled = false;
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
        ${routeEntryMode === 'dual' ? `<button class="route-voice-button" type="button" aria-label="음성으로 목적지 말하기" disabled>${icon('mic', 27)}</button>
        <button class="route-text-button" type="button" data-action="route-text" aria-label="문자로 목적지 입력">${icon('message', 27)}</button>` : `<button class="route-submit" type="submit" aria-label="목적지 검색" hidden>${icon('arrow', 25)}</button>`}
      </div></form>
    </section>
    ${bottomNav()}
  </main>`;
}

function guideScreen() {
  return `<main class="screen guide-screen">
    <header class="guide-header">
      <button class="guide-control" data-action="back" aria-label="뒤로 가기">${icon('back', 34)}</button>
      <strong>2SPEAKER</strong>
      <button class="guide-control" data-page="language" aria-label="설정">${icon('settings', 30)}</button>
    </header>
    <section class="route-visual" aria-label="네이버 지도">
      <div class="route-scene route-map-scene">
        <div id="route-map" class="route-map-canvas" role="application" aria-label="확대·축소 및 이동할 수 있는 지도"></div>
        <p id="route-map-status" class="route-map-status" role="status" aria-live="polite">네이버 지도를 불러오는 중입니다.</p>
      </div>
    </section>
    <section class="transport-options" role="group" aria-label="이동 수단">
      <button class="transport-option" type="button" aria-pressed="false"><strong>도보</strong></button>
      <button class="transport-option" type="button" aria-pressed="true"><strong>지하철</strong></button>
      <button class="transport-option" type="button" aria-pressed="false"><strong>버스</strong></button>
      <button class="transport-option" type="button" aria-pressed="false"><strong>택시</strong></button>
    </section>
    <section class="guide-dialogue" aria-label="길찾기 내용"></section>
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
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder&callback=${callbackName}`;
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

  const setStatus = (message, state = 'info') => {
    if (session !== routeMapSession || currentPage !== 'guide') return;
    statusElement.textContent = routeMapAuthError || message;
    statusElement.classList.toggle('is-quiet', state === 'success');
    statusElement.classList.toggle('is-error', state === 'error' || Boolean(routeMapAuthError));
  };

  loadNaverMaps().then((maps) => {
    if (session !== routeMapSession || currentPage !== 'guide' || !mapElement.isConnected) return;

    const map = new maps.Map(mapElement, {
      center: new maps.LatLng(36.5, 127.8),
      zoom: 7,
      draggable: true,
      pinchZoom: true,
      scrollWheel: true,
      zoomControl: true,
      zoomControlOptions: { position: maps.Position.TOP_RIGHT }
    });
    let currentLocation = null;
    let destinationLocation = null;
    let destinationMarker = null;
    let locationStatus = '현재 위치를 확인하고 있습니다.';
    let locationState = 'pending';
    let destinationTitle = '';
    let destinationStatus = routeDestinationQuery ? '목적지를 검색하고 있습니다.' : '목적지를 입력해 주세요.';
    let destinationState = routeDestinationQuery ? 'pending' : 'info';

    const shortPlaceName = (name) => String(name || '').replace(/\s*\([^)]*\)\s*$/, '').slice(0, 12);
    const updateStatus = () => {
      const locationSummary = locationState === 'success' ? 'GPS 확인' : locationStatus;
      const destinationSummary = destinationState === 'success'
        ? shortPlaceName(destinationTitle)
        : destinationStatus;
      const message = [locationSummary, destinationSummary].filter(Boolean).join(' · ');
      const hasError = locationState === 'error' || destinationState === 'error';
      const bothReady = locationState === 'success' && destinationState === 'success';
      setStatus(message, hasError ? 'error' : bothReady ? 'success' : 'info');
    };
    const currentLocationIcon = {
      content: '<div style="width:24px;height:24px;display:grid;place-items:center;border:2px solid #fff;border-radius:50%;background:rgba(36,166,255,.24);box-shadow:0 1px 8px rgba(0,26,52,.72);"><span style="width:12px;height:12px;border:1px solid #fff;border-radius:50%;background:#168cff;"></span></div>',
      size: new maps.Size(28, 28),
      anchor: new maps.Point(14, 14)
    };
    const destinationPinIcon = {
      content: '<svg width="36" height="44" viewBox="0 0 36 44" aria-hidden="true" style="display:block;filter:drop-shadow(0 2px 4px rgba(0,20,38,.7))"><path d="M18 2C9.72 2 3 8.72 3 17c0 10.6 15 25 15 25s15-14.4 15-25C33 8.72 26.28 2 18 2Z" fill="#ffc36d" stroke="#fff" stroke-width="2"/><circle cx="18" cy="17" r="6" fill="#07334d" stroke="#fff" stroke-width="2"/></svg>',
      size: new maps.Size(36, 44),
      anchor: new maps.Point(18, 42)
    };
    const clearDestinationChoices = () => {
      if (destinationChoicesElement) destinationChoicesElement.replaceChildren();
    };
    const renderDestinationChoices = (places) => {
      if (!destinationChoicesElement) return;
      destinationChoicesElement.innerHTML = `<div class="place-choice-list" role="group" aria-label="네이버 장소 검색 결과">
        <p class="place-choice-heading">검색 결과 ${places.length}곳 · 목적지를 선택해 주세요</p>
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
          markDestination(place.lat, place.lng, place.title);
        });
      });
    };
    const updateMapView = () => {
      if (currentLocation && destinationLocation) {
        const bounds = maps.LatLngBounds.bounds(currentLocation, destinationLocation);
        map.fitBounds(bounds, { top: 28, right: 42, bottom: 48, left: 42, maxZoom: 13 });
      } else if (destinationLocation) {
        map.setCenter(destinationLocation);
        map.setZoom(15);
      } else if (currentLocation) {
        map.setCenter(currentLocation);
        map.setZoom(15);
      }
    };
    const markDestination = (latitude, longitude, title) => {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
      destinationLocation = new maps.LatLng(latitude, longitude);
      destinationMarker?.setMap(null);
      destinationMarker = new maps.Marker({
        map,
        position: destinationLocation,
        title,
        icon: destinationPinIcon,
        zIndex: 130
      });
      destinationTitle = title;
      destinationStatus = `${shortPlaceName(title)} 선택됨`;
      destinationState = 'success';
      updateMapView();
      updateStatus();
      return true;
    };
    const searchNaverPlace = () => {
      fetch('/api/map/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: routeDestinationQuery })
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || '네이버 장소 검색에 연결하지 못했습니다.');
        return payload.places;
      }).then((places) => {
        if (session !== routeMapSession || currentPage !== 'guide') return;
        const validPlaces = Array.isArray(places) ? places.filter((place) => (
          place && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng))
        )).map((place) => ({ ...place, lat: Number(place.lat), lng: Number(place.lng) })) : [];
        if (validPlaces.length === 1) {
          markDestination(validPlaces[0].lat, validPlaces[0].lng, validPlaces[0].title || routeDestinationQuery);
        } else if (validPlaces.length > 1) {
          destinationStatus = `검색 결과 ${validPlaces.length}곳 · 선택해 주세요`;
          destinationState = 'info';
          renderDestinationChoices(validPlaces);
          updateStatus();
        } else {
          destinationStatus = '네이버 장소 검색 결과가 없습니다.';
          destinationState = 'error';
          updateStatus();
        }
      }).catch((error) => {
        if (session !== routeMapSession || currentPage !== 'guide') return;
        destinationStatus = error instanceof Error ? error.message : '네이버 장소 검색에 실패했습니다.';
        destinationState = 'error';
        updateStatus();
      });
    };

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
    }).catch((error) => {
      if (session !== routeMapSession || currentPage !== 'guide') return;
      locationStatus = error?.code === 1
        ? '위치 권한이 없어 현재 위치를 표시하지 않습니다.'
        : '현재 위치를 확인하지 못했습니다.';
      locationState = 'error';
      updateStatus();
    });

    if (routeDestinationQuery) {
      searchNaverPlace();
    }
    updateStatus();
  }).catch((error) => {
    const message = error instanceof Error ? error.message : '네이버 지도를 불러오지 못했습니다.';
    setStatus(message);
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

function render() {
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
  root.innerHTML = `<div class="app-shell">${screens[currentPage]()}</div>`;
  if (currentPage === 'guide') initializeNaverRouteMap();
  else routeMapSession += 1;

  document.querySelectorAll('.transport-option').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.transport-option').forEach((option) => {
        option.setAttribute('aria-pressed', String(option === button));
      });
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
  document.querySelector('[data-action="route-text"]')?.addEventListener('click', () => routeInput?.focus());

  document.querySelector('#home-search')?.addEventListener('click', () => {
    routeEntryMode = 'simple';
    navigate('route');
    document.querySelector('#route-destination')?.focus();
  });
  routeInput?.addEventListener('input', (event) => {
    const routeSubmit = document.querySelector('.route-submit');
    if (routeSubmit) routeSubmit.hidden = !event.target.value.trim();
  });
  routeInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      routeInput.form.requestSubmit();
    }
  });
  document.querySelector('#route-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const destination = routeInput?.value.trim();
    if (destination) {
      routeDestinationQuery = destination;
      navigate('guide');
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

function navigate(page) {
  if (currentPage === 'voice' && page !== 'voice') stopVoiceConversation();
  if (page !== currentPage) pageHistory.push(currentPage);
  currentPage = page;
  if (page === 'voice') {
    voicePaused = false;
    voiceConversationError = '';
    voiceConversationState = 'idle';
    voiceListenLanguageCode ||= selectedUserLanguageCode;
  }
  render();
  if (page === 'voice') startVoiceConversation();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function goBack() {
  if (currentPage === 'voice') stopVoiceConversation();
  currentPage = pageHistory.pop() || 'home';
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

render();





