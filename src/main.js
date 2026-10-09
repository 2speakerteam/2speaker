const root = document.querySelector('#root');
let currentPage = 'home';
let destination = '';
let routeOrigin = '';
let routeLanguage = 'ko';
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
let routeRequestToken = 0;
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
      const explicitOrigin = phrase.match(/^(.+?)(?:에서|부터)\s+(.+)$/);
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
  return { origin, destination: phrase || input, language };
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
      </div>
      <div class="route-instruction">${icon('walk', 28)}<span>${loading}</span></div>
    </section>
    <section class="guide-dialogue">
      <p class="bubble question">${question}</p>
      <p class="bubble answer">${loading}</p>
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

    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(naverMapClientId)}&submodules=geocoder&callback=${encodeURIComponent(callbackName)}`;
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
  const naverResult = naverMaps
    ? await geocodeDestination(naverMaps, originQuery).catch(() => null)
    : null;
  if (naverResult) return naverResult;
  const googleMaps = await loadGoogleMaps();
  return searchGoogleDestination(googleMaps, originQuery);
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

async function requestNaverTransitRoute(maps, map, start, end, isCurrent, instruction) {
  const response = await fetch('/api/transit/routes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      startX: start.longitude,
      startY: start.latitude,
      endX: end.longitude,
      endY: end.latitude,
      count: 3,
      lang: routeLanguage === 'en' ? 1 : 0,
      format: 'json'
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '대중교통 경로를 불러오지 못했어요.');
  const itinerary = payload?.metaData?.plan?.itineraries?.[0];
  if (!itinerary) throw new Error('이 출발지와 목적지 사이의 경로를 찾지 못했어요.');
  if (!isCurrent()) return;

  drawTransitItinerary(maps, map, itinerary, start, end);
  const english = routeLanguage === 'en';
  const modeNames = english
    ? { BUS: 'Bus', SUBWAY: 'Subway', TRAIN: 'Train', EXPRESSBUS: 'Express bus' }
    : { BUS: '버스', SUBWAY: '지하철', TRAIN: '기차', EXPRESSBUS: '시외버스' };
  const modes = [...new Set((itinerary.legs ?? []).map((leg) => leg.mode).filter((mode) => mode !== 'WALK'))]
    .map((mode) => modeNames[mode] || mode);
  const minutes = Math.max(1, Math.round(Number(itinerary.totalTime || 0) / 60));
  const transferCount = Number(itinerary.transferCount || 0);
  const summary = english
    ? `${modes.join(' · ') || 'Walking'} · about ${minutes} min · ${transferCount} transfer${transferCount === 1 ? '' : 's'}`
    : `${modes.join('·') || '도보'} · 약 ${minutes}분 · 환승 ${transferCount}회`;
  if (instruction) instruction.textContent = summary;
  setGuideAnswer(english
    ? `Route from ${routeOrigin || 'your location'} to ${destination}: ${summary}. Shown on the map.`
    : `${routeOrigin || '현재 위치'}에서 ${destination}까지 ${summary} 경로를 지도에 표시했어요.`);
}

async function requestGoogleTransitRoute(maps, map, start, end, isCurrent, instruction) {
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

    if (naverMaps) {
      end = await geocodeDestination(naverMaps, query).catch(() => null);
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
    const parsed = parseRouteRequest(spokenDestination);
    destination = parsed.destination;
    routeOrigin = parsed.origin;
    routeLanguage = parsed.language;
    activeDestinationRecognition = null;
    recognition.stop();
    voiceSearchOpen = false;
    voiceSearchState = 'idle';
    navigate('guide');
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



