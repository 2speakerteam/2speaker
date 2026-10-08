const root = document.querySelector('#root');
let currentPage = 'home';
let destination = '';
const pageHistory = [];

const icons = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  arrow: '<path d="M5 12h14"/><path d="m14 7 5 5-5 5"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
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
  check: '<path d="m5 12 4 4L19 6"/>'
};

function icon(name, size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function bottomNav() {
  return `<nav class="bottom-nav" aria-label="하단 메뉴">
    <button class="nav-item ${currentPage === 'home' ? 'active' : ''}" data-page="home">${icon('home')}<span>홈</span></button>
    <button class="nav-item ${currentPage === 'more' ? 'active' : ''}" data-page="more">${icon('more')}<span>더보기</span></button>
  </nav>`;
}

function header(title) {
  return `<header class="page-header">
    <button class="icon-button" data-action="back" aria-label="뒤로 가기">${icon('back', 34)}</button>
    <h1>${title}</h1><span class="header-spacer"></span>
  </header>`;
}

function homeScreen() {
  return `<main class="screen home-screen">
    <section class="brand-block" aria-label="2SPEAKER">
      <svg class="brand-mark" viewBox="145 210 540 420" role="img" aria-label="2S 로고" xmlns="http://www.w3.org/2000/svg">
        <defs><filter id="neon-only" color-interpolation-filters="sRGB"><feColorMatrix values="0 0 0 0 0  0 0 0 0 .88  0 0 0 0 1  -1 2 -1 0 -.03"/></filter></defs>
        <image href="/public/2speaker-logo.png" x="0" y="0" width="823" height="1000" filter="url(#neon-only)"/>
      </svg>
      <h1>2SPEAKER</h1>
    </section>
    <form class="destination-search" id="destination-form">
      ${icon('search', 34)}
      <input value="${destination}" placeholder="어디로 가세요?" aria-label="목적지">
      <button type="submit" aria-label="길찾기 시작">${icon('arrow', 31)}</button>
    </form>
    <section class="feature-grid" aria-label="주요 기능">
      <button class="feature-card" data-page="route">
        <span class="feature-icon">${icon('pin', 66)}</span><strong>길찾기</strong><span>경로·대중교통</span>
      </button>
      <button class="feature-card" data-page="translation">
        <span class="feature-icon">${icon('translate', 66)}</span><strong>통역</strong><span>실시간 대화번역</span>
      </button>
    </section>
    ${bottomNav()}
  </main>`;
}

function routeScreen() {
  return `<main class="screen content-screen">
    ${header('길찾기')}
    <section class="page-body">
      <form class="route-form" id="route-form"><label class="large-input"><span class="sr-only">목적지</span>
        <input id="route-destination" value="${destination}" placeholder="어디로 가세요?" inputmode="search">
      </label><button class="route-start" type="submit">안내 시작 ${icon('arrow', 24)}</button></form>
    </section>
    ${bottomNav()}
  </main>`;
}

function guideScreen() {
  const place = destination.trim() || '경복궁';
  return `<main class="screen guide-screen">
    <header class="guide-header"><button class="icon-button" data-action="back" aria-label="뒤로 가기">${icon('back', 34)}</button><strong>2SPEAKER</strong><span></span></header>
    <section class="route-visual" aria-label="실시간 길찾기 안내">
      <div class="route-road"><span class="road-line"></span><span class="direction-arrow">↑</span><span class="destination-pin">${icon('pin', 34)} ${place}</span></div>
      <div class="route-instruction">${icon('walk', 28)}<span>도보 → ${place} 방향 직진 · 약 12분</span></div>
    </section>
    <section class="guide-dialogue">
      <p class="bubble question">${place} 가려면<br>어디로 가요?</p>
      <p class="bubble answer">Go straight toward ${place}. It is about a 12-minute walk.</p>
    </section>
    ${bottomNav()}
  </main>`;
}

function translationScreen() {
  return `<main class="screen content-screen">
    ${header('통역')}
    <section class="page-body translation-body">
      <button class="language-row"><strong>내 언어</strong><span>한국어 ${icon('chevron', 26)}</span></button>
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
    ${header('음성으로 대화')}
    <section class="conversation-body">
      <p class="translating">통역 중</p>
      <article class="speech-block"><span>상대방</span><p>Where is the station?</p><strong>역이 어디예요?</strong></article>
      <article class="speech-block mine"><span>나</span><p>이쪽으로 가세요.</p><strong>Go this way.</strong></article>
    </section>
    <button class="pause-button">${icon('pause', 30)}<span>일시정지</span></button>
  </main>`;
}

function textScreen() {
  return `<main class="screen content-screen conversation-screen text-screen">
    ${header('문자로 대화')}
    <section class="text-dialogue">
      <article class="text-bubble other"><span>상대방</span><p>Where is the station?</p><strong>역이 어디예요?</strong></article>
      <article class="text-bubble me"><span>나</span><p>이쪽으로 가세요.</p><strong>Go this way.</strong></article>
    </section>
    <form class="message-composer"><input placeholder="메시지를 입력하세요." aria-label="번역할 메시지"><button type="submit" aria-label="메시지 보내기">${icon('send', 28)}</button></form>
  </main>`;
}

function moreScreen() {
  const menuItems = [
    ['user', '로그인 / 회원가입', 'login'],
    ['globe', '언어', 'language'],
    ['help', '도움말', 'help']
  ];
  return `<main class="screen menu-screen">
    <section class="menu-panel"><button class="menu-close" data-page="home" aria-label="메뉴 닫기">×</button>
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
        <button class="primary-button">로그인</button>
      </article>
      <article class="account-card"><h2>회원가입</h2><p>간편 회원가입</p>
        <div class="social-grid"><button><b class="google-mark">G</b>Google</button><button><b>●</b>Apple</button><button><b class="naver-mark">N</b>Naver</button></div>
        <button class="email-signup">이메일로 회원가입 ${icon('chevron', 22)}</button>
      </article>
    </section>
  </main>`;
}

function languageScreen() {
  return `<main class="screen content-screen">${header('앱 언어')}
    <section class="page-body language-body"><button class="setting-row" data-page="language-list"><strong>앱 언어</strong><span>한국어 ${icon('chevron', 26)}</span></button></section>
  </main>`;
}

function languageListScreen() {
  const languages = ['한국어', 'English', '日本語', '中文', 'Español', 'Français', 'Deutsch'];
  return `<main class="screen content-screen">${header('앱 언어 선택')}
    <section class="page-body language-list">${languages.map((language, index) => `<button><span>${language}</span>${index === 0 ? icon('check', 30) : ''}</button>`).join('')}</section>
  </main>`;
}

function helpScreen() {
  const items = [['사용 방법', 'howto'], ['문의 / 오류 신고', 'contact'], ['자주 묻는 질문', 'faq'], ['서비스 정보', 'service']];
  return `<main class="screen content-screen">${header('도움말')}
    <section class="page-body list-card">${items.map(([label, page]) => `<button data-page="${page}"><span>${label}</span>${icon('chevron', 27)}</button>`).join('')}</section>
  </main>`;
}

function infoScreen(title, copy) {
  return `<main class="screen content-screen">${header(title)}<section class="page-body info-copy"><p>${copy}</p></section></main>`;
}

function serviceScreen() {
  return `<main class="screen content-screen">${header('서비스 정보')}
    <section class="page-body service-body"><article><h2>2SPEAKER</h2><p>One AI. Two ways to speak.</p></article>
      <div class="list-card"><button data-page="terms"><span>이용약관</span>${icon('chevron', 27)}</button><button data-page="privacy"><span>개인정보처리방침</span>${icon('chevron', 27)}</button><button><span>앱 버전</span><em>1.0.0</em></button></div>
    </section>
  </main>`;
}

function render() {
  const screens = {
    home: homeScreen, route: routeScreen, guide: guideScreen, translation: translationScreen,
    voice: voiceScreen, text: textScreen, more: moreScreen, login: loginScreen,
    language: languageScreen, 'language-list': languageListScreen, help: helpScreen,
    service: serviceScreen,
    howto: () => infoScreen('사용 방법', '길찾기에서는 목적지를 입력한 뒤 안내를 따라 이동합니다.<br><br>통역에서는 음성 또는 문자를 선택해 대화를 시작합니다.'),
    contact: () => infoScreen('문의 / 오류 신고', '이용 중 불편한 점이나 오류 내용을 남길 수 있는 화면입니다.'),
    faq: () => infoScreen('자주 묻는 질문', '2SPEAKER 사용법과 길찾기·통역 기능에 대한 자주 묻는 질문을 확인합니다.'),
    terms: () => infoScreen('이용약관', '2SPEAKER 이용약관은 서비스 공개 전 최종 내용을 반영합니다.'),
    privacy: () => infoScreen('개인정보처리방침', '2SPEAKER 개인정보처리방침은 서비스 공개 전 최종 내용을 반영합니다.')
  };
  root.innerHTML = `<div class="app-shell">${screens[currentPage]()}</div>`;

  document.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.page));
  });
  document.querySelectorAll('[data-action="back"]').forEach((button) => {
    button.addEventListener('click', goBack);
  });

  const homeInput = document.querySelector('.destination-search input');
  homeInput?.addEventListener('input', (event) => { destination = event.target.value; });
  document.querySelector('#destination-form')?.addEventListener('submit', (event) => {
    event.preventDefault(); navigate('route');
  });

  const routeInput = document.querySelector('#route-destination');
  routeInput?.addEventListener('input', (event) => { destination = event.target.value; });
  if (currentPage === 'route') routeInput?.focus();
  document.querySelector('#route-form')?.addEventListener('submit', (event) => {
    event.preventDefault(); navigate('guide');
  });
  document.querySelector('.message-composer')?.addEventListener('submit', (event) => event.preventDefault());
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

