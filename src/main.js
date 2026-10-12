const root = document.querySelector('#root');
// Fail-safe for a panorama request that emits neither init nor an error status.
const WALK_PANORAMA_TIMEOUT_MS = 2500;
let currentPage = 'home';
let destination = '';
let routeOrigin = '';
let routeLanguage = 'ko';
let nearbyStopRequest = null;
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
let activePlaceSelection = null;
let placeSearchState = { status: 'idle', query: '', criteria: null, origin: null, places: [], error: '' };
const placeSearchCache = new Map();
const placeInterpretCache = new Map();
let placesMap = null;
let placesMapContainer = null;
let placesMapOverlays = [];
let placesPanorama = null;
let placesPanoramaMaps = null;
let placesPanoramaRequestId = 0;
let guideTransportRoutes = {};
let guideTransportContext = null;
let transportDetailReturnScrollY = 0;
let walkPreviewState = null;
const sentTextMessages = [];
let activeRouteContext = null;
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

function koreanObjectParticle(word) {
  const lastCode = String(word || '').trim().slice(-1).charCodeAt(0);
  const hasFinalConsonant = lastCode >= 0xac00 && lastCode <= 0xd7a3 && (lastCode - 0xac00) % 28 !== 0;
  return hasFinalConsonant ? '을' : '를';
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

function isExplicitRouteRequest(text) {
  const query = String(text || '').trim();
  if (/(길찾기|경로|가는\s*(?:길|방법)|어떻게\s*(?:가|찾아)|가려면|도보(?:로|시간)?|대중교통|(?:버스|지하철)\s*타고|어디로\s*가|\b(?:directions?|route|how\s+to\s+get|walk(?:ing)?|by\s+(?:bus|subway|transit))\b)/i.test(query)) return true;
  const parsed = parseRouteRequest(query);
  const fromCurrentLocation = /^(?:여기서|이곳에서|현재\s*위치에서|내\s*위치에서|지금\s*있는\s*곳에서)\s*/.test(query);
  const englishFromTo = /\bfrom\s+.+?\s+to\s+.+|\bto\s+.+?\s+from\s+.+/i.test(query);
  const placeSearchIntent = /(근처|주변|가까운|장소|공간|어디|어떤\s*곳|조용한\s*곳|찾아|검색|추천|알려\s*줘|보여\s*줘|있(?:을까요?|나요?|어요?|습니까\??)|nearby|near\s+me|around|place|find|search|recommend|show\s+me|is\s+there)/i;
  // Place names can contain category words like "공원". A clear route must not
  // be diverted into Naver's nearby-place search just because of that word.
  return Boolean(parsed.origin || fromCurrentLocation || englishFromTo) && !placeSearchIntent.test(query);
}

function isPlaceSearchRequest(text) {
  const query = String(text || '').trim();
  if (isExplicitRouteRequest(query)) return false;
  // A named hotel is a destination, not a request for nearby hotels.
  const genericLodgingRequest = /(?:근처|주변|가까운|추천|몇\s*곳|nearby|near\s+me|around)/i.test(query)
    || /역\s*(?:숙소|호텔|모텔|호스텔|게스트하우스)/.test(query)
    || /^(?:숙소|호텔|모텔|호스텔|게스트하우스|민박|여관)\s*(?:찾아|검색|보여|알려)/.test(query);
  if (/숙소|호텔|모텔|호스텔|게스트하우스|민박|여관|hotel|hostel|motel/i.test(query)
      && !genericLodgingRequest
      && !/^(숙소|호텔|모텔|호스텔|게스트하우스|민박|여관|hotel|hostel|motel)$/i.test(query)) return false;
  if (/(숙소|호텔|모텔|호스텔|게스트하우스|민박|여관|카페|식당|맛집|음식점|약국|병원|편의점|관광지|명소|주차장|화장실|공원|지하철역|기차역|accommodation|hotel|hostel|motel|cafe|coffee|restaurant|pharmacy|hospital|convenience store|attraction|parking|restroom|park)/i.test(query)) return true;
  const asksToSearch = /(찾아|검색|추천|알려\s*줘|보여\s*줘|있(?:을까요?|나요?|어요?|습니까\??)|find|search|recommend|show\s+me|is\s+there)/i.test(query);
  const mentionsNearbyPlace = /(근처|주변|가까운|장소|공간|어디|어떤\s*곳|조용한\s*곳|현재\s*위치|nearby|near\s+me|around|place)/i.test(query);
  return asksToSearch && mentionsNearbyPlace;
}

function openNearbyPlaceSearch(query) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return;
  destination = normalizedQuery;
  activePlaceSelection = null;
  placeSearchState = { status: 'loading', query: normalizedQuery, criteria: null, origin: null, places: [], error: '' };
  navigate('places');
  void runNearbyPlaceSearch(normalizedQuery);
}

async function reverseGeocodeArea(point) {
  try {
    const maps = await loadNaverMaps();
    return await new Promise((resolve) => {
      maps.Service.reverseGeocode({ coords: new maps.LatLng(point.latitude, point.longitude) }, (status, response) => {
        if (status !== maps.Service.Status.OK) return resolve('');
        const region = response?.v2?.results?.[0]?.region;
        resolve([region?.area1?.name, region?.area2?.name, region?.area3?.name].filter(Boolean).join(' ').slice(0, 100));
      });
    });
  } catch {
    return '';
  }
}

async function reverseGeocodeStart(maps, point) {
  if (!maps?.Service?.reverseGeocode) return '';
  return new Promise(resolve => {
    let settled = false;
    let timeout;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    timeout = setTimeout(() => finish(''), 2500);
    maps.Service.reverseGeocode({ coords: new maps.LatLng(point.latitude, point.longitude), orders: 'roadaddr,addr' }, (status, response) => {
      if (status !== maps.Service.Status.OK) return finish('');
      const results = response?.v2?.results || [];
      const road = results.find(result => result.name === 'roadaddr');
      const area = road || results.find(result => result.name === 'addr');
      const region = area?.region || {};
      const district = [region.area2?.name, region.area3?.name].filter(Boolean).join(' ');
      const street = [road?.land?.name, road?.land?.number1].filter(Boolean).join(' ');
      finish([district, street].filter(Boolean).join(' ').slice(0, 100));
    });
  });
}

function isLodgingPlace(place) {
  return /숙박|호텔|호스텔|모텔|게스트하우스|펜션|리조트|민박|여관|hotel|hostel|motel/i.test(String(place?.category || ''));
}

async function ensureLodgingArrivalView(maps, place, routeEnd) {
  if (!isLodgingPlace(place)) return null;
  const placePoint = [place.longitude,place.latitude];
  const pathFront = Array.isArray(routeEnd) && routeEnd.every(Number.isFinite)
    && walkPreviewDistance(routeEnd,placePoint) <= 60 ? routeEnd : null;
  const previous = place.arrivalView?.panoId && Array.isArray(place.arrivalView.position)
    && walkPreviewDistance(place.arrivalView.position,placePoint) <= 120 ? place.arrivalView : null;
  if (previous && (!pathFront || walkPreviewDistance(previous.position,pathFront) <= 45)) return previous;
  if (!maps?.Panorama) return previous;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;pointer-events:none';
  document.body.append(host);
  try {
    return await new Promise(resolve => {
      let done = false;
      let timeout;
      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        maps.Event.clearInstanceListeners(panorama);
        resolve(value);
      };
      const target = pathFront || placePoint;
      const panorama = new maps.Panorama(host, {
        position: new maps.LatLng(target[1], target[0]), zoomControl: false, aroundControl: false
      });
      const capture = () => {
        const coord = panorama.getLocation()?.coord;
        const panoId = panorama.getPanoId?.();
        if (!panoId || !coord || !Number.isFinite(coord.lng()) || !Number.isFinite(coord.lat())) return;
        const position = [coord.lng(), coord.lat()];
        if (walkPreviewDistance(position,placePoint) > 120
            || (pathFront && walkPreviewDistance(position,pathFront) > 55)) return finish(null);
        place.arrivalView = { panoId, position };
        finish(place.arrivalView);
      };
      maps.Event.addListener(panorama, 'init', capture);
      maps.Event.addListener(panorama, 'pano_status', status => status === 'OK' ? capture() : finish(null));
      timeout = setTimeout(() => finish(null), WALK_PANORAMA_TIMEOUT_MS);
    });
  } catch { return previous; }
  finally { host.remove(); }
}

async function routeToLodgingFront(start, place, isCurrent) {
  const view = place.arrivalView;
  if (!isLodgingPlace(place) || !view?.panoId || !Array.isArray(view.position)) return null;
  const response = await fetch('/api/walking/routes', {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({startX:start.longitude,startY:start.latitude,endX:view.position[0],endY:view.position[1]})
  }).catch(() => null);
  if (!response || !isCurrent()) return null;
  const route = await response.json().catch(() => null);
  const endpoint = route?.paths?.at(-1)?.at(-1);
  if (!response.ok || !(Number(route?.totalTime) > 0) || !Array.isArray(endpoint)
      || walkPreviewDistance(endpoint,view.position) > 45) return null;
  return route;
}

function trimWalkingRouteAtFront(route, place) {
  if (!route?.paths?.length || !place?.arrivalView) return null;
  const preview = walkPreviewFrames(route.paths,route.maneuvers);
  const front = walkPreviewLodgingFrontFrames(preview,place,route.paths).at(-1);
  const routeTotal = preview.at(-1)?.meters;
  if (!front?.lodgingFront || !(front.meters >= 2) || !(front.meters < routeTotal - 5)
      || walkPreviewDistance(front.position,place.arrivalView.position) > 55) return null;
  let traveled = 0;
  const paths = [];
  for (const path of route.paths) {
    const kept = [path[0]];
    for (let i = 1; i < path.length; i += 1) {
      const length = walkPreviewDistance(path[i-1],path[i]);
      if (traveled + length >= front.meters) {
        const fraction = length ? Math.max(0,Math.min(1,(front.meters-traveled)/length)) : 0;
        const point = path[i-1].map((value,axis) => value + (path[i][axis]-value)*fraction);
        if (walkPreviewDistance(kept.at(-1),point) > 0.2) kept.push(point);
        if (kept.length > 1) paths.push(kept);
        const trimmed = {...route,paths,totalDistance:Math.round(front.meters),
          totalTime:Math.max(1,Math.round(Number(route.totalTime)*front.meters/routeTotal))};
        return walkPreviewFrames(trimmed.paths,trimmed.maneuvers).length ? trimmed : null;
      }
      kept.push(path[i]);
      traveled += length;
    }
    if (kept.length > 1) paths.push(kept);
  }
  return null;
}

async function prepareLodgingArrival(maps, start, place, isCurrent) {
  if (!isLodgingPlace(place)) return;
  const originalEnd = start.walkingRoute?.paths?.at(-1)?.at(-1);
  await ensureLodgingArrivalView(maps, place, originalEnd);
  if (!isCurrent()) return;
  const existingFrontRoute = trimWalkingRouteAtFront(start.walkingRoute,place);
  if (existingFrontRoute) {
    start.walkingRoute = existingFrontRoute;
    place.arrivalAtFront = true;
    return;
  }
  // A TMAP walking route that already ends beside the lodging should not grow
  // into a detour just because the nearest panorama camera is on another road.
  // The terminal scene can use the map when no close street photo exists.
  if (Array.isArray(originalEnd)
      && walkPreviewDistance(originalEnd,[place.longitude,place.latitude]) <= 45) {
    place.arrivalAtFront = true;
    return;
  }
  const frontRoute = await routeToLodgingFront(start, place, isCurrent);
  if (frontRoute && isCurrent()) {
    start.walkingRoute = frontRoute;
    place.arrivalAtFront = true;
  }
}

async function findNamedLodging(query) {
  try {
    const response = await fetch('/api/places/search', {
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({action:'resolve-lodging',query})
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return isLodgingPlace(payload.place) ? payload.place : null;
  } catch { return null; }
}

async function runNearbyPlaceSearch(query) {
  try {
    let criteria = placeInterpretCache.get(query);
    if (!criteria) {
      const parseResponse = await fetch('/api/places/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'interpret', query })
      });
      const parsed = await parseResponse.json().catch(() => ({}));
      if (!parseResponse.ok || !parsed.criteria) throw new Error(parsed.error || '검색 조건을 이해하지 못했어요.');
      criteria = parsed.criteria;
      if (placeInterpretCache.size >= 64) placeInterpretCache.delete(placeInterpretCache.keys().next().value);
      placeInterpretCache.set(query, criteria);
    }
    if (placeSearchState.query !== query) return;
    placeSearchState.criteria = criteria;
    render();

    let currentLocation = null;
    let regionName = '';
    if (criteria.useCurrentLocation) {
      currentLocation = await getCurrentPosition();
      if (placeSearchState.query !== query) return;
      regionName = await reverseGeocodeArea(currentLocation);
      if (!regionName) throw new Error('현재 위치 주변 지역을 확인하지 못했어요. 역이나 동네 이름을 함께 입력해 주세요.');
    }
    const cacheKey = `${query.toLocaleLowerCase()}|${criteria.originName || `${Number(currentLocation?.latitude || 0).toFixed(5)},${Number(currentLocation?.longitude || 0).toFixed(5)}`}`;
    const cached = placeSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < 5 * 60 * 1000) {
      placeSearchState = { status: 'done', query, ...cached.response, error: '' };
      render();
      return;
    }

    const response = await fetch('/api/places/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ criteria, currentLocation, regionName })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '주변 장소를 찾지 못했어요.');
    if (placeSearchState.query !== query) return;
    const result = { criteria: payload.criteria, origin: payload.origin, places: payload.places || [] };
    if (placeSearchCache.size >= 32) placeSearchCache.delete(placeSearchCache.keys().next().value);
    placeSearchCache.set(cacheKey, { savedAt: Date.now(), response: result });
    placeSearchState = { status: 'done', query, ...result, error: '' };
    render();
  } catch (error) {
    if (placeSearchState.query !== query) return;
    placeSearchState = { ...placeSearchState, status: 'error', error: error instanceof Error ? error.message : '주변 장소를 찾지 못했어요.' };
    render();
  }
}

function initializePlacesMap() {
  const container = document.querySelector('#places-map');
  const origin = placeSearchState.origin;
  if (!container || !origin) return;
  if (placesMapContainer === container && placesMap) return;

  placesMapContainer = container;
  placesMap = null;
  placesMapOverlays.forEach((overlay) => overlay.setMap(null));
  placesMapOverlays = [];
  void loadNaverMaps().then((maps) => {
    if (currentPage !== 'places' || document.querySelector('#places-map') !== container) return;
    const map = new maps.Map(container, {
      center: new maps.LatLng(origin.latitude, origin.longitude), zoom: 15, minZoom: 3, maxZoom: 20,
      mapTypeControl: false, zoomControl: true, zoomControlOptions: { position: maps.Position.TOP_RIGHT },
      scaleControl: false, logoControl: true, logoControlOptions: { position: maps.Position.TOP_LEFT }, mapDataControl: false
    });
    placesMap = map;
    const bounds = new maps.LatLngBounds();
    const originPoint = new maps.LatLng(origin.latitude, origin.longitude);
    bounds.extend(originPoint);
    placesMapOverlays.push(new maps.Marker({ map, position: originPoint, title: origin.name || '기준 위치' }));
    placeSearchState.places.forEach((place, index) => {
      const point = new maps.LatLng(place.latitude, place.longitude);
      bounds.extend(point);
      const marker = new maps.Marker({ map, position: point, title: `${index + 1}. ${place.name}` });
      maps.Event.addListener(marker, 'click', () => showPlaceRoadview(index));
      placesMapOverlays.push(marker);
    });
    map.fitBounds(bounds, 42);
  }).catch(() => {
    if (document.querySelector('#places-map') === container) container.setAttribute('aria-label', '네이버 지도를 불러오지 못했어요. 아래 장소 목록을 확인해 주세요.');
  });
}


function disposePlacesPanorama() {
  placesPanoramaRequestId += 1;
  if (placesPanorama && placesPanoramaMaps) {
    try {
      placesPanoramaMaps.Event.clearInstanceListeners(placesPanorama);
      placesPanorama.setVisible(false);
    } catch { /* The panorama may already be detached. */ }
  }
  placesPanorama = null;
  placesPanoramaMaps = null;
}

async function showPlaceRoadview(index) {
  const place = placeSearchState.places[index];
  const origin = placeSearchState.origin;
  const panel = document.querySelector('#places-roadview');
  const viewer = document.querySelector('#places-roadview-view');
  const title = document.querySelector('#places-roadview-title');
  const status = document.querySelector('#places-roadview-status');
  if (!place || !origin || !panel || !viewer || !title || !status) return;

  disposePlacesPanorama();
  const requestId = placesPanoramaRequestId;
  const point = { latitude: Number(place.latitude), longitude: Number(place.longitude) };
  panel.dataset.placeIndex = String(index);
  title.textContent = place.name;
  status.textContent = '선택한 장소 주변의 네이버 로드뷰를 불러오는 중이에요.';
  viewer.style.visibility = 'hidden';
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const maps = await loadNaverMaps();
    if (requestId !== placesPanoramaRequestId || currentPage !== 'places'
      || document.querySelector('#places-roadview') !== panel || panel.hidden) return;
    if (placesMap) {
      placesMap.setCenter(new maps.LatLng(point.latitude, point.longitude));
      placesMap.setZoom(17);
    }
    if (!maps.Panorama) {
      status.textContent = '로드뷰 연결을 확인해 주세요. 위치는 위 지도에서 볼 수 있어요.';
      return;
    }
    const latLng = new maps.LatLng(point.latitude, point.longitude);
    const panorama = new maps.Panorama(viewer, {
      position: latLng,
      zoomControl: true,
      aroundControl: true
    });
    placesPanorama = panorama;
    placesPanoramaMaps = maps;
    const rememberPlaceFront = () => {
      if (requestId !== placesPanoramaRequestId || placesPanorama !== panorama) return;
      const capture = panorama.getLocation()?.coord;
      const panoId = panorama.getPanoId?.();
      if (panoId && capture && Number.isFinite(capture.lng()) && Number.isFinite(capture.lat())) {
        place.arrivalView = { panoId, position: [capture.lng(), capture.lat()] };
      }
    };
    maps.Event.addListener(panorama, 'init', rememberPlaceFront);
    maps.Event.addListener(panorama, 'pano_status', (panoStatus) => {
      if (requestId !== placesPanoramaRequestId || currentPage !== 'places' || panel.hidden) return;
      if (panoStatus !== 'OK') {
        viewer.style.visibility = 'hidden';
        status.textContent = '이 장소 주변에는 로드뷰가 제공되지 않아요. 위치는 위 지도에서 볼 수 있어요.';
        return;
      }
      viewer.style.visibility = 'visible';
      rememberPlaceFront();
      const photoDate = panorama.getLocation()?.photodate;
      status.textContent = photoDate
        ? `선택한 장소 주변의 로드뷰예요 · 촬영: ${photoDate}`
        : '선택한 장소 주변의 로드뷰예요. 화면을 움직여 둘러보세요.';
    });
  } catch {
    if (requestId !== placesPanoramaRequestId || panel.hidden) return;
    viewer.style.visibility = 'hidden';
    status.textContent = '로드뷰를 열지 못했어요. 위치는 위 지도에서 볼 수 있어요.';
  }
}

function selectNearbyPlace(index) {
  const place = placeSearchState.places[index];
  if (!place?.route || !placeSearchState.origin) return;
  if (placesPanorama && Number(document.querySelector('#places-roadview')?.dataset.placeIndex) === index) {
    const capture = placesPanorama.getLocation()?.coord;
    const panoId = placesPanorama.getPanoId?.();
    if (panoId && capture && Number.isFinite(capture.lng()) && Number.isFinite(capture.lat())) {
      place.arrivalView = { panoId, position: [capture.lng(), capture.lat()] };
    }
  }
  activePlaceSelection = { origin: placeSearchState.origin, place, route: place.route };
  destination = place.name;
  routeOrigin = placeSearchState.origin.name || '';
  routeLanguage = 'ko';
  navigate('guide');
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
        <input id="route-destination" name="destination-query" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" value="${safeDestination}" placeholder="어디로 가세요?" inputmode="search">
        ${routeEntryMode === 'dual' ? `<button class="route-voice-button" type="button" data-action="route-voice" aria-label="음성으로 목적지 말하기">${icon('mic', 27)}</button>
        <button class="route-text-button" type="button" data-action="route-text" aria-label="문자로 목적지 입력"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.2c-5.1 0-9.2 3.4-9.2 7.8s4.1 7.8 9.2 7.8c.8 0 1.6-.1 2.3-.3l3.7 2.2c.5.3 1.1-.1 1-.7l-.5-3.3a7.2 7.2 0 0 0 3.5-5.7c0-4.4-4.1-7.8-9.2-7.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>` : `<button class="route-submit" type="submit" aria-label="목적지 검색" ${destination.trim() ? '' : 'hidden'}>${icon('arrow', 25)}</button>`}
      </div></form>
    </section>
    ${bottomNav()}
  </main>`;
}

function nearbyPlacesScreen() {
  const { status, criteria, origin, places, error, query } = placeSearchState;
  const statusCopy = status === 'loading'
    ? '주변 장소를 찾고 있어요.'
    : status === 'error'
      ? escapeHtml(error || '주변 장소를 찾지 못했어요.')
      : '';
  const placeCards = places.map((place, index) => `<button class="place-result" type="button" data-place-index="${index}">
    <span class="place-result-main"><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.category || criteria?.categoryLabel || '')}</small><span>${escapeHtml(place.address || '주소 정보 없음')}</span></span>
    <span class="place-result-distance"><strong>${place.walkingMinutes}분</strong><small>${Number(place.walkingDistanceMeters || 0).toLocaleString()}m</small></span>
  </button>`).join('');
  const originName = origin?.name || criteria?.originName || '주변';
  const categoryLabel = criteria?.categoryLabel || criteria?.category || '장소';
  const categoryParticle = koreanObjectParticle(categoryLabel);
  return `<main class="screen content-screen places-screen">
    ${header('주변 장소 찾기')}
    <section class="page-body places-body">
      ${status === 'loading' || status === 'error' ? `<p class="places-status" role="status" aria-live="polite">${statusCopy}</p>` : ''}
      ${status === 'done' && places.length ? `<div class="places-map" id="places-map" aria-label="네이버 장소 지도"></div>
        <p class="places-result-summary" role="status">${escapeHtml(originName)} 주변 ${places.length}개의 ${escapeHtml(categoryLabel)}${categoryParticle} 찾았습니다.</p>
        <section class="places-roadview" id="places-roadview" aria-label="선택한 장소 로드뷰" hidden>
          <div class="places-roadview-view" id="places-roadview-view" aria-label="선택한 장소 주변의 실제 거리 모습"></div>
          <div class="places-roadview-controls">
            <p class="places-roadview-heading"><strong id="places-roadview-title"></strong><span id="places-roadview-status" role="status" aria-live="polite"></span></p>
            <div><button type="button" data-action="place-roadview-map">지도보기</button><button type="button" data-action="place-roadview-route">길찾기</button></div>
          </div>
        </section>
        <div class="place-results" aria-label="장소 검색 결과">${placeCards}</div>
        <section class="guide-dialogue places-dialogue" aria-label="검색 대화">
          <p class="bubble question">${escapeHtml(query || '')}</p>
          <p class="bubble answer">${escapeHtml(originName)} 주변 ${places.length}개의 ${escapeHtml(categoryLabel)}${categoryParticle} 찾았습니다.</p>
        </section>` : ''}
      ${status === 'done' && !places.length ? '<div class="places-empty">다른 기준 장소나 더 긴 도보시간으로 다시 검색해 보세요.</div>' : ''}
      ${status === 'error' ? '<button class="places-retry" type="button" data-action="places-retry">다시 검색</button>' : ''}
    </section>
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
      <button class="guide-control" data-action="back" aria-label="뒤로 가기">${icon('back', 34)}</button>
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
        <div><small>${english ? 'Street-view route preview' : '도보 로드뷰 미리보기'}</small><h2>${escapeHtml(routeOrigin || (english ? 'Your location' : '현재 위치'))} → ${place}</h2><p class="walk-preview-origin" id="walk-preview-origin" hidden></p></div>
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
    <section class="transport-detail-page" id="transport-detail-page" aria-label="${english ? 'Transport route details' : '교통 경로 상세'}" hidden></section>
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
    home: homeScreen, route: routeScreen, guide: guideScreen, nearby: nearbyScreen, places: nearbyPlacesScreen, translation: translationScreen,
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
  disposePlacesPanorama();
  const screens = {
    home: homeScreen, route: routeScreen, guide: guideScreen, nearby: nearbyScreen, places: nearbyPlacesScreen, translation: translationScreen,
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
  if (currentPage === 'places' && placeSearchState.status === 'done' && placeSearchState.places.length) initializePlacesMap();

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
    button.addEventListener('click', () => {
      selectGuideTransport(button.dataset.transport, true);
      openTransportDetail(button.dataset.transport);
    });
  });
  document.querySelector('#transport-detail-page')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="transport-detail-back"]')) closeTransportDetail();
  });
  document.querySelector('.walk-action')?.addEventListener('click', () => selectGuideTransport('WALK', true));
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
    if (isPlaceSearchRequest(routeInput.value)) {
      openNearbyPlaceSearch(routeInput.value);
      return;
    }
    const parsed = parseRouteRequest(routeInput.value);
    destination = parsed.destination;
    routeOrigin = parsed.origin;
    routeLanguage = parsed.language;
    activePlaceSelection = null;
    if (destination) navigate('guide');
    else routeInput.focus();
  });
  document.querySelectorAll('[data-place-index]').forEach((button) => {
    button.addEventListener('click', () => showPlaceRoadview(Number(button.dataset.placeIndex)));
  });
  document.querySelector('[data-action="place-roadview-map"]')?.addEventListener('click', () => {
    const panel = document.querySelector('#places-roadview');
    if (panel) panel.hidden = true;
    disposePlacesPanorama();
    document.querySelector('#places-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.querySelector('[data-action="place-roadview-route"]')?.addEventListener('click', () => {
    const index = Number(document.querySelector('#places-roadview')?.dataset.placeIndex);
    selectNearbyPlace(index);
  });
  document.querySelector('[data-action="places-retry"]')?.addEventListener('click', () => openNearbyPlaceSearch(placeSearchState.query));
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
    const routeResponse = await fetch('/api/assistant/reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message,
        userLanguage: selectedUserLanguageCode,
        counterpartLanguage: activeCounterpartLanguageCode,
        routeContext: activeRouteContext,
        history: getAssistantHistory()
      })
    });
    const routeResult = await routeResponse.json().catch(() => ({}));
    if (!routeResponse.ok) throw new Error(routeResult.error || '응답을 불러오지 못했어요.');

    entry.intent = routeResult.intent || '';
    if (routeResult.useTranslationApi) {
      entry.status = 'Google Translation으로 번역하고 있어요.';
      refreshConversationView();
      const translationResponse = await fetch('/api/translation/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: message,
          userLanguage: selectedUserLanguageCode,
          counterpartLanguage: activeCounterpartLanguageCode,
          sourceLanguage: routeResult.sourceLanguage,
          englishText: routeResult.englishText
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
      entry.response = routeResult.text || '';
      entry.sourceLanguageCode = routeResult.sourceLanguage || '';
      entry.targetLanguageCode = entry.sourceLanguageCode;
      if (routeResult.sourceLanguage && routeResult.sourceLanguage.toLowerCase() !== selectedUserLanguageCode.toLowerCase()) {
        activeCounterpartLanguageCode = routeResult.sourceLanguage;
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
      logoControlOptions: { position: maps.Position.TOP_LEFT },
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
  if (!originQuery) {
    const point = await getCurrentPosition();
    const location = await reverseGeocodeStart(naverMaps, point).catch(() => '');
    return {...point, name: location ? `현재 위치 · ${location}` : '현재 위치', originKind:'gps'};
  }
  if (entranceDescriptor(originQuery)) return {...await resolvePedestrianLandmark(originQuery), originKind:'manual'};
  const naverResult = naverMaps
    ? await geocodeDestination(naverMaps, originQuery).catch(() => null)
    : null;
  if (naverResult) return {...naverResult,name:originQuery,originKind:'manual'};
  const googleMaps = await loadGoogleMaps();
  return {...await searchGoogleDestination(googleMaps, originQuery),name:originQuery,originKind:'manual'};
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

function explicitBusStopLandmark(query) {
  const label = String(query || '').trim();
  // A generic place name is not evidence of a bus platform. Only preserve an
  // explicitly named bus stop; never invent one from a nearby search origin.
  if (!label || /택시\s*(?:승강장|정류장|타는\s*곳)/.test(label)) return null;
  return /버스\s*(?:정류장|정류소|승강장|타는\s*곳)|(?:정류장|정류소)(?:\s*\([^)]*\))?$/i.test(label)
    ? { kind:'bus-stop',label } : null;
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
  const starts = origin ? await pedestrianCandidates(origin, maps) : [await resolveRouteStart(maps, '')];
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

async function choosePedestrianStartForPlace(originName, place, isCurrent, maps) {
  // The selected result already has exact Naver coordinates. Compare real
  // walking routes from the station exits without geocoding its name again.
  const starts = await pedestrianCandidates(originName, maps);
  if (!isCurrent()) return null;
  if (!starts.length) throw new Error('출발할 역 출구를 확인하지 못했어요. 출구 번호를 지정해 주세요.');
  const routes = [];
  for (let offset = 0; offset < starts.length; offset += 3) {
    if (!isCurrent()) return null;
    routes.push(...await Promise.all(starts.slice(offset, offset + 3).map(async start => {
      try {
        const response = await fetch('/api/walking/routes', { method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({startX:start.longitude,startY:start.latitude,
            endX:place.longitude,endY:place.latitude}) });
        const walkingRoute = await response.json();
        if (!response.ok || !(Number(walkingRoute.totalTime)>0)
            || !walkPreviewFrames(walkingRoute.paths,walkingRoute.maneuvers).length) return null;
        const measured = walkingRoute.paths.reduce((sum,path)=>sum
          + path.slice(1).reduce((part,point,i)=>part+walkPreviewDistance(path[i],point),0),0);
        return { start,walkingRoute,distance:Number(walkingRoute.totalDistance)>0
          ? Number(walkingRoute.totalDistance):measured };
      } catch { return null; }
    })));
  }
  if (!isCurrent()) return null;
  const checked = routes.filter(Boolean);
  const best = checked.sort((a,b)=>a.distance-b.distance || a.walkingRoute.totalTime-b.walkingRoute.totalTime)[0];
  if (!best) throw new Error('역 출구에서 선택한 장소까지 도보 경로를 확인하지 못했어요.');
  return { ...best.start,walkingRoute:best.walkingRoute,
    walkingComparison:{candidates:starts.length,checked:checked.length,
      distance:best.distance,entranceConfirmed:false} };
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

function fastestTransitItinerary(itineraries, mode) {
  const wanted = mode === 'BUS' ? ['BUS'] : mode === 'SUBWAY' ? ['SUBWAY', 'TRAIN'] : [];
  if (!wanted.length || !Array.isArray(itineraries)) return null;
  return itineraries.filter((itinerary) => {
    const modes = new Set((itinerary.legs ?? []).map((leg) => leg.mode));
    return Number(itinerary.totalTime) > 0
      && wanted.some((value) => modes.has(value))
      && [...modes].every((value) => value === 'WALK' || wanted.includes(value));
  }).sort((a, b) => Number(a.totalTime) - Number(b.totalTime)
    || Number(a.transferCount || 0) - Number(b.transferCount || 0))[0] || null;
}

function transportDetailMarkup(mode, choice, context) {
  const english = context.english;
  const labels = english
    ? { BUS: 'Bus', SUBWAY: 'Subway', TAXI: 'Taxi' }
    : { BUS: '버스', SUBWAY: '지하철', TAXI: '택시' };
  const origin = context.start.landmark?.label || routeOrigin?.trim() || (english ? 'Your location' : '현재 위치');
  const target = destination.trim() || context.end.landmark?.label || (english ? 'Destination' : '목적지');
  const itinerary = choice.itinerary;
  const minutes = mode === 'TAXI' ? choice.minutes : Math.max(1, Math.ceil(Number(itinerary.totalTime) / 60));
  const fare = mode === 'TAXI' ? choice.fare : Number(itinerary?.fare?.regular?.totalFare);
  const fareLabel = Number.isFinite(fare) && fare >= 0
    ? (english ? `₩${fare.toLocaleString()}` : `${fare.toLocaleString()}원`)
    : (english ? 'Fare unavailable' : '요금 정보 없음');
  const transferCount = Number(itinerary?.transferCount || 0);
  const legs = (itinerary?.legs ?? []).map((leg, index) => {
    const legMode = leg.mode === 'WALK' ? (english ? 'Walk' : '도보')
      : leg.mode === 'BUS' ? labels.BUS : labels.SUBWAY;
    const route = String(leg.route || leg.lane?.[0]?.route || '').split(':').at(-1).trim();
    const routeLabel = route ? ` · ${escapeHtml(route)}` : '';
    const start = leg.start?.name || (index === 0 ? origin : '');
    const end = leg.end?.name || (index === itinerary.legs.length - 1 ? target : '');
    const legMinutes = Math.max(1, Math.ceil(Number(leg.sectionTime || 0) / 60));
    return `<li class="transport-leg"><span class="transport-leg-number">${index + 1}</span><div><strong>${legMode}${routeLabel}</strong><p>${escapeHtml(start)} → ${escapeHtml(end)}</p><small>${english ? `about ${legMinutes} min` : `약 ${legMinutes}분`}</small></div></li>`;
  }).join('');
  const taxiLeg = `<li class="transport-leg"><span class="transport-leg-number">1</span><div><strong>${english ? 'Taxi ride' : '택시 이동'}</strong><p>${escapeHtml(origin)} → ${escapeHtml(target)}</p><small>${english ? `about ${minutes} min` : `약 ${minutes}분`}</small></div></li>`;
  const transferText = mode === 'TAXI' ? (english ? 'Estimated by TMAP' : 'TMAP 예상 경로')
    : (english ? `${transferCount} transfers` : `환승 ${transferCount}회`);
  return `<header class="transport-detail-header">
    <button class="guide-control" type="button" data-action="transport-detail-back" aria-label="${english ? 'Back to route guide' : '길찾기 안내로 돌아가기'}">${icon('back', 34)}</button>
    <strong>${labels[mode]} ${english ? 'route' : '경로'}</strong>
    <span aria-hidden="true"></span>
  </header>
  <div class="transport-detail-content">
    <p class="transport-detail-eyebrow">${english ? 'Fastest available route' : '가장 빠른 경로'}</p>
    <h2>${escapeHtml(origin)} → ${escapeHtml(target)}</h2>
    <div class="transport-detail-summary">
      <div><small>${english ? 'Estimated time' : '예상 시간'}</small><strong>${english ? `about ${minutes} min` : `약 ${minutes}분`}</strong></div>
      <div><small>${mode === 'TAXI' ? (english ? 'Estimated fare' : '예상 요금') : (english ? 'Fare' : '요금')}</small><strong>${fareLabel}</strong></div>
    </div>
    <p class="transport-detail-meta">${transferText}</p>
    <ol class="transport-legs">${mode === 'TAXI' ? taxiLeg : legs}</ol>
    <p class="transport-detail-note">${english
      ? 'Times and fares may change with traffic and service conditions. Check signs and live service information before traveling.'
      : '시간·요금은 교통 및 운행 상황에 따라 달라질 수 있어요. 출발 전 현장 안내와 실시간 운행 정보를 확인해 주세요.'}</p>
  </div>`;
}

function openTransportDetail(mode) {
  const choice = guideTransportRoutes[mode];
  const context = guideTransportContext;
  const panel = document.querySelector('#transport-detail-page');
  const screen = document.querySelector('.guide-screen');
  const visual = screen?.querySelector('.route-visual');
  if (!choice || !context || !panel || !screen || !visual || context.requestId !== routeRequestToken || currentPage !== 'guide') return;
  transportDetailReturnScrollY = window.scrollY;
  panel.innerHTML = transportDetailMarkup(mode, choice, context);
  panel.querySelector('.transport-detail-header').after(visual);
  panel.hidden = false;
  screen.classList.add('transport-detail-open');
  context.maps?.Event?.trigger(context.map, 'resize');
  window.scrollTo({ top: 0, behavior: 'instant' });
  panel.querySelector('[data-action="transport-detail-back"]')?.focus({ preventScroll: true });
}

function closeTransportDetail() {
  const screen = document.querySelector('.guide-screen');
  const panel = document.querySelector('#transport-detail-page');
  if (!screen || !panel || panel.hidden) return;
  const mode = guideTransportContext?.userSelectedMode;
  const visual = panel.querySelector('.route-visual');
  if (visual) screen.querySelector('.guide-header')?.after(visual);
  panel.hidden = true;
  panel.replaceChildren();
  screen.classList.remove('transport-detail-open');
  guideTransportContext?.maps?.Event?.trigger(guideTransportContext.map, 'resize');
  window.scrollTo({ top: transportDetailReturnScrollY, behavior: 'instant' });
  document.querySelector(`[data-transport="${mode}"]`)?.focus({ preventScroll: true });
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
      // Preserve the actual walking path through this bend; a generic elbow can
      // point across a block when the footpath curves instead of making a sharp turn.
      turnPath: event ? Array.from({ length: 11 }, (_, i) => {
        const start = Math.max(0, event.meters - 5);
        const end = Math.min(total, event.meters + 5);
        return pointAt(start + (end - start) * i / 10);
      }) : null,
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
  if (!context.start?.landmark && context.start?.name) {
    const name = String(context.start.name).trim();
    const resolved = String(context.start.resolvedName || '').trim();
    const location = resolved && resolved !== name ? `${name} (${resolved})` : name;
    result[0] = { ...result[0],startLabel: context.start.originKind === 'gps' ? location
      : `입력한 출발지 · ${location} 앞` };
  }
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

function walkPreviewArrivalEndpoint(frame, context, paths) {
  if (frame?.lodgingFront && frame.landmark?.kind === 'lodging-front'
      && frame.verifiedView?.panoId
      && frame.verifiedView.panoId === context?.end?.arrivalView?.panoId
      && walkPreviewDistance(frame.landmark.position,context.end.arrivalView.position) <= 90) return true;
  if (!['arrival','landmark-end'].includes(frame?.phase)) return false;
  const endpoint = context?.end?.landmark?.position
    || [Number(context?.end?.longitude),Number(context?.end?.latitude)];
  const routeEnd = paths?.at(-1)?.at(-1);
  return Array.isArray(routeEnd) && routeEnd.every(Number.isFinite)
    && Array.isArray(endpoint) && endpoint.every(Number.isFinite)
    && walkPreviewDistance(routeEnd,endpoint) <= 35;
}

// Naver can return the same confirmed lodging-front panorama for a route point
// just before the provider's final coordinate. That photograph is the outside
// stopping point; do not request later indoor/imagery-free route slides.
function walkPreviewLodgingArrivalPhoto(frame, panoId, capturePoint, context, paths) {
  const view = context?.end?.arrivalView;
  const routeEnd = paths?.at(-1)?.at(-1);
  return isLodgingPlace(context?.end) && context.end.arrivalAtFront
    && Boolean(view?.panoId && panoId === view.panoId)
    && Array.isArray(capturePoint) && Array.isArray(view.position)
    && Array.isArray(routeEnd) && routeEnd.every(Number.isFinite)
    && walkPreviewDistance(capturePoint,view.position) <= 15
    && walkPreviewDistance(routeEnd,view.position) <= 45
    && Number.isFinite(frame?.meters) && Number.isFinite(frame?.total)
    && frame.meters >= frame.total - 35
    && frame.phase !== 'landmark-start';
}

// A selected lodging's road-view camera is a street-side stopping point. The
// provider's place coordinate may be inside the building or beyond its front.
// Only use this camera when it is actually near both the walking path and place.
function walkPreviewLodgingFrontFrames(frames, end, paths) {
  const view = end?.arrivalView;
  const place = [Number(end?.longitude),Number(end?.latitude)];
  const capture = view?.position;
  if (!isLodgingPlace(end)
      || !view?.panoId || !Array.isArray(capture) || !capture.every(Number.isFinite)
      || !place.every(Number.isFinite) || walkPreviewDistance(capture,place) > 120) return frames;
  const routeEnd = paths?.at(-1)?.at(-1);
  if (end.arrivalAtFront && Array.isArray(routeEnd)
      && walkPreviewDistance(routeEnd,capture) <= 45) {
    const last = frames.at(-1);
    const front = {...last,phase:'landmark-end',position:routeEnd,ahead:place,
      landmark:{kind:'lodging-front',label:end.name,position:capture},lodgingFront:true,
      verifiedView:{panoId:view.panoId,pan:walkPreviewBearing(capture,place),tilt:0,fov:75,maxOffset:90},
      nextDecision:null,focusMeters:null,turnPath:null,turnPosition:null,turnAhead:null,
      direction:'straight',description:'',important:true,holdMs:1800};
    return [...frames.slice(0,-1),front];
  }
  let traveled = 0, closest = null;
  const cos = Math.cos(capture[1] * Math.PI / 180);
  for (const path of paths || []) for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1], b = path[i];
    const length = walkPreviewDistance(a,b);
    if (!length) continue;
    const dx = (b[0]-a[0])*cos, dy = b[1]-a[1];
    const t = Math.max(0,Math.min(1,((capture[0]-a[0])*cos*dx+(capture[1]-a[1])*dy)/(dx*dx+dy*dy)));
    const point = [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    const candidate = { meters:traveled+length*t,lateral:walkPreviewDistance(capture,point),point };
    if (!closest || candidate.lateral < closest.lateral - 0.5
        || (Math.abs(candidate.lateral-closest.lateral) <= 0.5 && candidate.meters < closest.meters)) closest = candidate;
    traveled += length;
  }
  if (!closest || closest.lateral > 55 || closest.meters < 2) return frames;
  const meters = closest.meters;
  const kept = frames.filter(frame => frame.meters < meters - 2 && frame.phase !== 'arrival' && frame.phase !== 'landmark-end');
  const base = kept.at(-1) || frames[0];
  if (!base) return frames;
  const front = { ...base, position:closest.point, ahead:place, meters, total:meters,
    phase:'landmark-end', landmark:{kind:'lodging-front',label:end.name,position:place},
    lodgingFront:true, verifiedView:{panoId:view.panoId,pan:walkPreviewBearing(capture,place),tilt:0,fov:75,maxOffset:90},
    nextDecision:null, focusMeters:null, turnPath:null, turnPosition:null,turnAhead:null,
    direction:'straight',description:'',important:true,holdMs:1800 };
  return [...kept.map(frame => ({...frame,total:meters})),front];
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
  // Keep a short, exact path trace in front of this panorama. It lets the
  // preview draw a forward cue on the visible pavement while the next
  // instruction is still tens of metres away from this camera.
  const pointAtRouteMeter = (meters) => {
    const segment = segments.find((item) => item.end >= meters - 1e-6);
    if (!segment) return null;
    const fraction = Math.max(0, Math.min(1, (meters - segment.start) / (segment.end - segment.start)));
    return segment.a.map((value, axis) => value + (segment.b[axis] - value) * fraction);
  };
  const routeTrace = [];
  const traceStart = closest.meters + 10;
  const traceEnd = Math.min(traveled, closest.meters + 21);
  if (traceEnd - traceStart >= 8) {
    for (let i = 0; i <= 10; i += 1) {
      const point = pointAtRouteMeter(traceStart + (traceEnd - traceStart) * i / 10);
      if (point && (!routeTrace.length || walkPreviewDistance(routeTrace.at(-1), point) > 0.2)) routeTrace.push(point);
    }
  }
  return { ...closest, offset, nearby: offset > 20, routeTrace };
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
  if (frame.landmark) {
    if (frame.phase === 'landmark-start') {
      if (frame.landmark.kind === 'station-exit') return english
        ? `Start at ${frame.landmark.label}. Exit the station and follow the walking route.`
        : `${frame.landmark.label}에서 출발해요. 출구 밖으로 나와 도보 경로를 따라가세요.`;
      if (frame.landmark.kind === 'bus-stop') return english
        ? `Start at ${frame.landmark.label}. Follow the walking route from the bus stop.`
        : `${frame.landmark.label}에서 출발해요. 승강장에서 나와 도보 경로를 따라가세요.`;
      return english ? `Start at ${frame.landmark.label}. Follow the route on the map.`
        : `${frame.landmark.label}에서 출발해요. 지도 경로를 따라 이동해 주세요.`;
    }
    return english ? `${frame.landmark.label}: check the entrance ahead.` : `${frame.landmark.label} 입구를 확인해 주세요.`;
  }
  if (frame.phase === 'start' && frame.startLabel) return english
    ? `Start at ${frame.startLabel}. Follow the walking route.`
    : `${frame.startLabel}에서 출발해요. 도보 경로를 따라가세요.`;
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
  const candidate = frame.phase === 'approach' && Number.isFinite(frame.focusMeters)
    ? {meters:frame.focusMeters,direction:frame.direction} : frame.nextDecision;
  const decision = Number.isFinite(candidate?.meters) && candidate.meters < frame.meters - 3
    ? null : candidate;
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

function walkPreviewPhotoFrame(frame, photo) {
  if (!Number.isFinite(photo?.meters) || frame.landmark) return frame;
  const photographedFrame = { ...frame, meters: photo.meters };
  if (['approach', 'turn'].includes(frame.phase) && Number.isFinite(frame.focusMeters)) {
    if (photo.meters < frame.focusMeters - 3) photographedFrame.phase = 'approach';
    else if (photo.meters > frame.focusMeters + 3) photographedFrame.phase = 'depart';
  }
  return photographedFrame;
}

function walkPreviewStepInstructionForPhoto(frame, photo, english = false) {
  return walkPreviewStepInstruction(walkPreviewPhotoFrame(frame, photo), english);
}

function walkPreviewArrowDirection(frame, photo) {
  const viewed = walkPreviewPhotoFrame(frame, photo);
  if (viewed.landmark || viewed.phase === 'arrival') return null;
  if (viewed.junctionCue) return 'straight';
  if (viewed.phase === 'turn') return ['left', 'right', 'uturn'].includes(viewed.direction)
    ? viewed.direction : 'straight';
  const candidate = viewed.phase === 'approach' && Number.isFinite(viewed.focusMeters)
    ? { meters: viewed.focusMeters, direction: viewed.direction } : viewed.nextDecision;
  const decision = Number.isFinite(candidate?.meters) && candidate.meters < viewed.meters - 3
    ? null : candidate;
  const remaining = (decision?.meters ?? Infinity) - viewed.meters;
  // A nearby bend is drawn as a bend. A distant decision still means walk
  // straight now, exactly as the spoken/written instruction says.
  return remaining <= 20 && ['left', 'right', 'uturn'].includes(decision?.direction)
    ? decision.direction : 'straight';
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
  const showArrow = new Set();
  const approachMeters = [];
  const turnMeters = [];
  frames.forEach((frame, index) => {
    const turnApproach = frame.phase === 'approach' && frame.turnAngle >= 35;
    const verifiedTurn = frame.phase === 'turn' && frame.turnAngle >= 35;
    const straightDecision = frame.phase === 'turn' && frame.direction === 'straight' && frame.important;
    if ((!turnApproach && !verifiedTurn && !straightDecision) || !Number.isFinite(frame.focusMeters)) return;
    // Show one forward pavement cue for the approach instruction and one
    // turning cue at the decision itself. Dense samples must not repeat either.
    const seenMeters = turnApproach ? approachMeters : turnMeters;
    if (seenMeters.some(meters => Math.abs(meters - frame.focusMeters) < 1)) return;
    seenMeters.push(frame.focusMeters);
    showArrow.add(index);
  });
  let junctionGroup = [];
  const flushJunctionGroup = () => {
    if (!junctionGroup.length) return;
    showArrow.add(junctionGroup[Math.floor((junctionGroup.length - 1) / 2)]);
    junctionGroup = [];
  };
  frames.forEach((frame, index) => {
    const nearTurn = turnMeters.some(meters => Math.abs(frame.meters - meters) < 18);
    if (frame.junctionCue && !nearTurn) junctionGroup.push(index);
    else flushJunctionGroup();
  });
  flushJunctionGroup();
  return frames.map((frame, sceneSlot) => ({
    ...frame, sceneSlot, showTurnArrow: showArrow.has(sceneSlot)
  }));
}
function walkPreviewHoldBeforeNext(frame, nextFrame) {
  // Establish the exit/junction for one second before its next orientation.
  // Ordinary slides retain their original hold instead of advancing immediately.
  const departure = frame.phase === 'landmark-start' && nextFrame?.phase === 'start';
  return departure || nextFrame?.important ? 1000 : frame.holdMs;
}

// Project a compact cue onto the photographed pavement, aligned to the route
// direction visible in that same panorama instead of pinning it to screen center.
// POV contract: navermaps.github.io/maps.js.ncp/docs/naver.maps.Panorama.html
function walkPreviewTurnArrow(frame, capture, photo, pov, width, height) {
  const viewedFrame = walkPreviewPhotoFrame(frame, photo);
  const turnApproach = viewedFrame?.phase === 'approach' && viewedFrame.turnAngle >= 35;
  const verifiedTurn = viewedFrame?.phase === 'turn' && viewedFrame.turnAngle >= 35;
  const straightDecision = viewedFrame?.phase === 'turn' && viewedFrame.direction === 'straight' && viewedFrame.important;
  const straightJunction = viewedFrame?.junctionCue && viewedFrame.direction === 'straight';
  if ((!turnApproach && !verifiedTurn && !straightDecision && !straightJunction)
      || viewedFrame.landmark || !capture || !photo || photo.lateral > 12
      || !(width > 0 && height > 0)
      || ![pov?.pan, pov?.tilt, pov?.fov].every(Number.isFinite)) return null;
  const radians = Math.PI / 180;
  const heading = (Number.isFinite(photo.heading)
    ? photo.heading : walkPreviewBearing(viewedFrame.position, viewedFrame.ahead)) * radians;
  // Anchor on the actual camera capture, not a route sample it may be tens of
  // metres away from along the same street. This keeps the arrow on the visible road.
  const east = 0, north = 0;
  if (!turnApproach && walkPreviewDistance(viewedFrame.position, viewedFrame.ahead) < 13) return null;
  const pan = pov.pan * radians, tilt = pov.tilt * radians;
  const focal = width / (2 * Math.tan(Math.max(20, Math.min(100, pov.fov)) * radians / 2));
  // Approximate flat pavement at camera height 2.4 m; reject only genuinely offscreen projections.
  const polygon = [[-.32,8],[.32,8],[.32,11],[.95,11],[0,13],[-.95,11],[-.32,11]];
  const projected = polygon.map(([side, forward]) => {
    const e = east + Math.sin(heading) * forward + Math.cos(heading) * side;
    const n = north + Math.cos(heading) * forward - Math.sin(heading) * side;
    const right = e * Math.cos(pan) - n * Math.sin(pan);
    const ahead = e * Math.sin(pan) + n * Math.cos(pan);
    const depth = ahead * Math.cos(tilt) - 2.4 * Math.sin(tilt);
    const up = -2.4 * Math.cos(tilt) - ahead * Math.sin(tilt);
    if (depth < 3) return null;
    return [width / 2 + focal * right / depth, height / 2 - focal * up / depth];
  });
  if (projected.some(p => !p || !p.every(Number.isFinite) || p[0] < 14 || p[0] > width-14 || p[1] < 18 || p[1] > height-18)) return null;
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
  const frames = walkPreviewSceneFrames(walkPreviewLodgingFrontFrames(
    walkPreviewEndpointFrames(walkPreviewFrames(choice.paths, choice.maneuvers), context, choice.paths),
    context.end, choice.paths));
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
    frames, index: 0, playing: true, loading: false, arrivalComplete: false, previewEnded: false,
    timer: null, panorama: null, fallbackMarker: null, skippedScenes: 0, shownScenes: 0,
    layers: new Set(), activeLayer: null, pendingLayer: null,
    history: [], cursor: -1, finished: false, revisiting: false, duplicateScenes: 0,
    consecutiveTimeouts: 0, finishMessage: '',
    message: panel.querySelector('#walk-preview-message'),
    progress: panel.querySelector('#walk-preview-progress-text'),
    seek, seekTimer: null, scrubbing: false,
    prev: panel.querySelector('#walk-preview-prev'),
    next: panel.querySelector('#walk-preview-next'),
    play: panel.querySelector('#walk-preview-play')
  };
  state.instruction = panel.querySelector('#route-endpoints');
  const originLabel = panel.querySelector('#walk-preview-origin');
  if (originLabel) {
    const start = context.start || {};
    const location = start.landmark?.label || frames[0]?.startLabel || start.name || '';
    const compactLocation = String(location)
      .replace(/^(?:(?:출발 위치|입력한 출발지)\s*·\s*)+/, '')
      .replace(/\s*\(\s*/g, '(')
      .replace(/\s*\)/g, ')')
      .replace(/\s+(앞|뒤|옆)$/, '$1')
      .trim();
    originLabel.hidden = !compactLocation;
    originLabel.textContent = compactLocation ? (context.english ? `Start: ${compactLocation}` : compactLocation) : '';
  }
  state.close.hidden = false;
  state.originalInstruction = state.instruction ? { text:state.instruction.textContent,
    hidden:state.instruction.hidden, minHeight:state.instruction.style.minHeight || '' } : null;
  const updateInstruction = (frame, photo = null) => {
    if (!state.instruction) return;
    state.instruction.hidden = false;
    state.instruction.style.minHeight = '3em';
    state.instruction.textContent = walkPreviewStepInstructionForPhoto(frame,photo,state.english)
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
    if (!frame.showTurnArrow
        || !((frame.phase === 'approach' && frame.turnAngle >= 35)
          || (frame.phase === 'turn' && (frame.turnAngle >= 35
            || (frame.direction === 'straight' && frame.important)))
          || (frame.junctionCue && frame.direction === 'straight'))) {
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
      // A delayed readiness event for the same photograph must not erase the cue.
      // updateTurnArrow still hides it if the actual panorama ID has changed.
      state.maps.Event.addListener(layer.panorama, 'pano_changed', layer.updateTurnArrow);
      if (typeof ResizeObserver !== 'undefined') {
        layer.arrowResize = new ResizeObserver(layer.updateTurnArrow);
        layer.arrowResize.observe(layer.element);
      }
    }
    layer.updateTurnArrow();
  };
  const scheduleNext = () => {
    clearTimeout(state.timer);
    if (!valid() || state.arrivalComplete || !state.playing || state.scrubbing) return;
    if (state.finished && (state.freeSeek ? state.index === frames.length - 1 : state.cursor === state.history.length - 1)) {
      if (!state.arrivalComplete) finishScan();
      else {
        state.playing = false;
        state.play.textContent = state.english ? 'Replay' : '다시 보기';
      }
      return;
    }
    const nextIndex = !state.freeSeek && state.cursor + 1 < state.history.length
      ? state.history[state.cursor + 1].index : state.index + 1;
    state.timer = setTimeout(advance, walkPreviewHoldBeforeNext(frames[state.index], frames[nextIndex]));
  };
  const updateButtons = () => {
    if (state.arrivalComplete) {
      const cursor = state.activeLayer?.sceneCursor ?? state.cursor;
      const index = state.history[cursor]?.index ?? state.index;
      state.prev.disabled = !state.history.length || (state.freeSeek ? index === 0 : cursor <= 0);
      state.next.disabled = true;
      state.play.disabled = !state.history.length;
      state.seek.disabled = !state.history.length || frames.length < 2;
      return;
    }
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

  const completeArrival = (frame) => {
    if (state.arrivalComplete) return;
    clearTimeout(state.timer);
    state.arrivalComplete = true;
    state.finished = true;
    state.playing = false;
    state.loading = false;
    state.play.textContent = state.english ? 'Arrived' : '도착 완료';
    state.close.hidden = false;
    state.message.textContent = '';
    state.message.style.display = 'none';
    if (state.instruction) {
      const label = frame.landmark?.label || state.end?.name || '';
      state.instruction.hidden = false;
      state.instruction.style.minHeight = '3em';
      state.instruction.textContent = label
        ? (state.english ? `Arrived at ${label}.` : `${label}에 도착했어요.`)
        : (state.english ? 'You have arrived at the destination.' : '목적지에 도착했어요.');
    }
    hideTurnArrows();
    updateProgress();
    state.progress.textContent = state.english ? 'Arrived at the destination' : '목적지 도착 완료';
    updateButtons();
  };

  const leaveArrivalForReview = () => {
    if (!state.arrivalComplete) return;
    state.arrivalComplete = false;
    state.finished = false;
    state.close.hidden = false;
    state.message.textContent = '';
    state.message.style.display = 'none';
  };

  const updateSeek = (index = state.index) => {
    // A stable full-route timeline allows seeking into uncached sections too.
    const max = Math.max(0, frames.length - 1);
    const atTerminal = state.arrivalComplete || state.previewEnded;
    const selected = atTerminal ? max : Math.max(0, Math.min(max, index));
    state.seek.max = String(max);
    state.seek.value = String(selected);
    state.seek.style.setProperty('--seek-fill', (max ? 100 * selected / max : 0) + '%');
    const frame = frames[selected];
    state.seek.setAttribute('aria-valuetext', state.english
      ? `${Math.round(frame.meters)} m of ${Math.round(frame.total)} m`
      : `전체 ${Math.round(frame.total)}m 중 ${Math.round(frame.meters)}m`);
  };

  const updateProgress = () => {
    const frame = frames[state.index];
    const atTerminal = state.previewEnded;
    if (state.arrivalComplete) {
      state.progress.textContent = state.english ? 'Arrived at the destination' : '목적지 도착 완료';
      if (!state.scrubbing) updateSeek();
      return;
    }
    if (atTerminal) {
      state.progress.textContent = state.english
        ? 'Street-view preview ended · destination not confirmed'
        : '로드뷰 미리보기 종료 · 목적지 도착은 확인되지 않았어요.';
      if (!state.scrubbing) updateSeek();
      return;
    }
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
    if (state.arrivalComplete) return;
    const autoplayFinished = state.playing && !state.directSeek;
    clearTimeout(state.timer);
    hideTurnArrows();
    state.finished = true;
    state.previewEnded = autoplayFinished;
    state.playing = false;
    state.loading = false;
    state.play.textContent = state.english ? 'Replay' : '다시 보기';
    if (state.history.length) {
      // Keep the last real photograph, but do not leave its old turn instruction
      // active after the street-view sequence has ended short of the destination.
      state.cursor = state.activeLayer?.sceneCursor ?? state.history.length - 1;
      state.index = state.history[state.cursor].index;
      state.viewer.style.visibility = 'visible';
      state.visual.classList.remove('walk-preview-map-fallback');
      state.fallbackMarker?.setMap(null);
      state.fallbackMarker = null;
      updateProgress();
      updateButtons();
      state.message.textContent = state.finishMessage || (state.english
        ? 'Street-view preview has ended. Select "Map view" to see the remaining route.'
        : '로드뷰 미리보기가 끝났어요. 남은 경로는 지도보기 버튼을 눌러 확인하세요.');
      state.message.style.display = '';
      if (state.instruction) {
        state.instruction.hidden = false;
        state.instruction.style.minHeight = '3em';
        state.instruction.textContent = state.english
          ? 'Street-view preview ended. The destination has not been confirmed.'
          : '로드뷰 미리보기가 끝났어요. 목적지 도착은 확인되지 않았어요.';
      }
    } else {
      state.message.textContent = state.finishMessage || (state.english
        ? 'No usable street images were found along this route. Select "Map view" to see the route.'
        : '이 경로에서 사용할 수 있는 거리뷰를 찾지 못했어요. 지도보기 버튼으로 경로를 확인해 주세요.');
      state.message.style.display = '';
      if (state.instruction) {
        state.instruction.hidden = false;
        state.instruction.style.minHeight = '3em';
        state.instruction.textContent = state.message.textContent;
      }
      updateProgress();
      updateButtons();
    }
  };
  const advance = () => {
    if (!valid() || state.arrivalComplete) return;
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
  const unavailable = (message, timedOut = false) => {
    if (state.arrivalComplete) return;
    clearTimeout(state.timer);
    state.loading = false;
    state.disposeLayer(state.pendingLayer);
    state.pendingLayer = null;
    state.panorama = null;
    const frame = frames[state.index];
    const missingLandmark = frame.landmark;
    if (missingLandmark) {
      if (frame.phase === 'landmark-start') state.missingStartLandmark = true;
      else state.missingEndLandmark = true;
    }

    // A verified route endpoint completes the instruction, but never changes
    // the view to a map automatically. The user can still choose Map view.
    if (state.index === frames.length - 1 && walkPreviewArrivalEndpoint(frame,state,choice.paths)) {
      state.visual.classList.remove('walk-preview-map-fallback');
      state.mapElement.style.visibility = 'hidden';
      state.mapElement.inert = true;
      state.mapElement.setAttribute('aria-hidden', 'true');
      state.fallbackMarker?.setMap(null);
      state.fallbackMarker = null;
      state.viewer.style.visibility = state.activeLayer ? 'visible' : 'hidden';
      hideTurnArrows();
      completeArrival(frame);
      return;
    }

    const autoScanning = !state.directSeek && state.playing;
    state.consecutiveTimeouts = timedOut && autoScanning ? state.consecutiveTimeouts + 1 : 0;
    if (autoScanning && state.consecutiveTimeouts >= 2) {
      state.finishMessage = state.english
        ? 'Street-view responses kept timing out, so the remaining sections were skipped. The preview has ended; the destination is not confirmed. Select "Map view" to check the remaining route.'
        : '거리뷰 응답이 계속 늦어 남은 구간을 건너뛰고 미리보기를 마쳤어요. 목적지 도착은 확인되지 않았어요. 남은 경로는 지도보기로 확인해 주세요.';
      finishScan();
      return;
    }

    state.visual.classList.remove('walk-preview-map-fallback');
    state.mapElement.style.visibility = 'hidden';
    state.mapElement.inert = true;
    state.mapElement.setAttribute('aria-hidden', 'true');
    state.fallbackMarker?.setMap(null);
    state.fallbackMarker = null;

    const gapMessage = missingLandmark
      ? missingLandmark.label + ' · ' + (state.english
        ? 'No entrance street image was found. Select "Map view" to check its location.'
        : '출입구 거리뷰를 찾지 못했어요. 지도보기 버튼으로 위치를 확인해 주세요.')
      : message + (state.english ? ' Select "Map view" to check the route.' : ' 지도는 지도보기 버튼을 눌러 확인할 수 있어요.');
    const seeking = !state.directSeek && state.playing && state.index < frames.length - 1;
    if (seeking) {
      if (state.activeLayer && !missingLandmark) {
        state.viewer.style.visibility = 'visible';
        state.loading = true;
        state.skippedScenes += 1;
        state.message.textContent = state.english
          ? 'Skipping a section without a usable street view…'
          : '거리뷰가 없는 구간을 건너뛰는 중이에요.';
        state.message.style.display = '';
        if (state.instruction) {
          state.instruction.hidden = false;
          state.instruction.style.minHeight = '3em';
          state.instruction.textContent = state.message.textContent;
        }
        updateProgress();
        updateButtons();
        state.timer = setTimeout(() => showFrame(state.index + 1), 80);
        return;
      }
      state.viewer.style.visibility = state.activeLayer ? 'visible' : 'hidden';
      if (!state.activeLayer) {
        hideTurnArrows();
        if (state.instruction) state.instruction.textContent = gapMessage;
      }
      state.message.textContent = gapMessage;
      state.message.style.display = '';
      updateProgress();
      updateButtons();
      state.skippedScenes += 1;
      state.timer = setTimeout(() => showFrame(state.index + 1),
        missingLandmark ? 3000 : frame.important ? 1400 : 350);
      return;
    }

    state.viewer.style.visibility = state.activeLayer ? 'visible' : 'hidden';
    if (!state.activeLayer) {
      hideTurnArrows();
      if (state.instruction) state.instruction.textContent = gapMessage;
    }
    state.message.textContent = gapMessage;
    state.message.style.display = '';
    updateProgress();
    updateButtons();
    state.skippedScenes += 1;
    if (!state.directSeek && state.playing && state.index === frames.length - 1) {
      finishScan();
    } else if (state.revisiting) {
      state.playing = false;
      state.play.textContent = state.english ? 'Play' : '자동 재생';
    }
  };
  const showFrame = (index, revisiting = false, directSeek = false) => {
    if (!valid() || state.arrivalComplete) return;
    // Keep the visible photo's cue during background loading. Replace it only
    // when the new scene is revealed, not when its network request begins.
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
    state.mapElement.style.visibility = '';
    state.mapElement.inert = true;
    state.mapElement.setAttribute('aria-hidden','true');
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
      unavailable(state.english ? 'Street view took too long. Check the map.' : '거리뷰 응답이 늦어요. 지도를 확인해 주세요.', true);
    }, WALK_PANORAMA_TIMEOUT_MS);
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
          if (!valid() || state.arrivalComplete || state.panorama !== instance || !state.loading || layer.readyStarted) return;
          if (status !== 'OK') {
            unavailable(state.english ? 'No street image for this section. See the route on the map.' : '이 구간에는 거리뷰가 없어요. 지도 경로를 확인해 주세요.');
          }
          // OK only confirms the lookup; getLocation may still describe the previous image.
        });
        const onPanoramaReady = () => {
          if (!valid() || state.arrivalComplete || state.panorama !== instance || !state.loading || layer.readyStarted) return;
          layer.readyStarted = true;
          clearTimeout(state.timer);
          state.consecutiveTimeouts = 0;
          const frameNow = frames[state.index];
          const capture = state.panorama.getLocation()?.coord;
          const capturePoint = capture && [capture.lng(), capture.lat()];
          const location = state.panorama.getLocation();
          const panoId = state.panorama.getPanoId?.() || location?.panoId || null;
          const arrivedOnFrontPhoto = state.playing && !state.revisiting && !state.directSeek
            && walkPreviewLodgingArrivalPhoto(frameNow,panoId,capturePoint,state,choice.paths);
          // The entrance photograph has already passed the landmark proximity check.
          // Reuse it for the first head turn even if its camera is off the route line.
          const photoContext = saved?.photoContext || (arrivedOnFrontPhoto && capturePoint
            ? {offset:walkPreviewDistance(capturePoint,frameNow.position),meters:frames.at(-1).meters,
                lateral:0,nearby:false,heading:walkPreviewBearing(capturePoint,
                  [state.end.longitude,state.end.latitude])}
            : frameNow.lodgingFront && capturePoint
            ? {offset:walkPreviewDistance(capturePoint,frameNow.position),meters:frameNow.meters,
                lateral:0,nearby:false,heading:walkPreviewBearing(capturePoint,frameNow.ahead)}
            : departure && capturePoint
            ? { offset: walkPreviewDistance(capturePoint, frameNow.position), meters: frameNow.meters,
                lateral: 0, nearby: false, heading: walkPreviewBearing(capturePoint, frameNow.ahead) }
            : walkPreviewPhotoContext(capturePoint, frameNow, choice.paths));
          if (!photoContext) {
            unavailable(state.english ? 'No close street image for this route point. Check the map.' : '이 지점과 가까운 거리뷰가 없어요. 다른 길 사진 대신 지도를 확인해 주세요.');
            return;
          }
          if (state.index === frames.length - 1 && !frameNow.landmark
              && walkPreviewArrivalEndpoint(frameNow,state,choice.paths)
              && walkPreviewDistance(capturePoint,[state.end.longitude,state.end.latitude]) > 35) {
            // A photo snapped to an earlier street can look like the building,
            // but it is not proof that the final entrance has been reached.
            unavailable(state.english ? 'The final street photo is not at the destination.'
              : '마지막 거리뷰가 목적지와 떨어져 있어요.');
            return;
          }
          if (departure && photoContext.lateral > 3) {
            // The camera may stand on the road: look towards the actual footpath,
            // not parallel to it along the centre of the traffic lanes.
            photoContext.heading = walkPreviewBearing(capturePoint, frameNow.ahead);
          }

          if (frameNow.lodgingFront && panoId !== frameNow.verifiedView?.panoId) {
            unavailable(state.english ? 'The selected lodging-front photo is no longer available.'
              : '선택한 숙소 앞 사진을 다시 확인할 수 없어요.');
            return;
          }
          // The same provider photograph can be returned for many nearby route points.
          // Count physical scenes, not queries or changes to the camera angle.
          // Approach / turn / departure are distinct route instructions even when
          // the provider returns the same camera and a very similar heading.
          const duplicate = !frameNow.important && !arrivedOnFrontPhoto && state.history.some((entry) => {
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
          if (state.playing && !state.revisiting && !state.directSeek && backwards && frameNow.important
              && !arrivedOnFrontPhoto) {
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
              if (!valid() || state.arrivalComplete) return;
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
            if (!valid() || state.arrivalComplete || state.panorama !== instance || state.pendingLayer !== layer) return;
            state.loading = false;
            if (!state.revisiting) {
              state.history.push({ index: arrivedOnFrontPhoto ? frames.length - 1 : state.index,
                panoId, capturePoint, heading: photoContext.heading,
                focusMeters: frameNow.focusMeters,
                routeMeters: arrivedOnFrontPhoto ? frames.at(-1).meters : photoContext.meters,
                photoContext: { ...photoContext }, pov: { ...cameraPov } });
              state.cursor = state.history.length - 1;
              state.shownScenes = state.history.length;
            }
            if (arrivedOnFrontPhoto) state.index = frames.length - 1;
            if (state.index === frames.length - 1) state.finished = true;
            updateProgress();
            state.viewer.style.visibility = 'visible';
            const previousLayer = state.activeLayer;
            state.activeLayer = layer;
            updateInstruction(arrivedOnFrontPhoto ? frames.at(-1) : frameNow, photoContext);
            layer.sceneCursor = state.cursor;
            state.pendingLayer = null;
            hideTurnArrows();
            if (!arrivedOnFrontPhoto) attachTurnArrow(layer, frameNow, capturePoint, photoContext, panoId);
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
            if (state.index === frames.length - 1
                && walkPreviewArrivalEndpoint(frames.at(-1),state,choice.paths)) {
              completeArrival(frames.at(-1));
            } else if (state.index === frames.length - 1) {
              finishScan();
            }
            scheduleNext();
          }));
          const rotatingLayer = state.activeLayer;
          // Rotate only for the first departure from a verified station/entrance view.
          const rotationTransition = Boolean(departure);
          const canRotate = !reduceMotion && state.playing && !state.directSeek && !state.revisiting
            && rotatingLayer?.panoId === panoId && rotatingLayer.pov && rotationTransition;
          layer.settleTimer = setTimeout(() => {
            const outgoing = state.activeLayer;
            if (!valid() || state.arrivalComplete || state.pendingLayer !== layer) return;
            // Show a real turn of the head within the same photograph, not a jump
            // between different years/cameras. Reduced motion and seeking stay instant.
            if (reduceMotion || !state.playing || state.directSeek || state.revisiting
                || !outgoing || outgoing.panoId !== panoId || !outgoing.pov || !rotationTransition) { reveal(); return; }
            const from = outgoing.panorama.getPov?.() || outgoing.pov;
            const delta = ((cameraPov.pan - from.pan + 540) % 360) - 180;
            let step = 0;
            const rotate = () => {
              if (!valid() || state.arrivalComplete || state.pendingLayer !== layer || state.activeLayer !== outgoing) return;
              const t = Math.min(1, ++step / 36), eased = t * t * (3 - 2 * t);
              try {
                outgoing.panorama.setPov({ pan: ((from.pan + delta * eased + 540) % 360) - 180,
                  tilt: from.tilt + (cameraPov.tilt - from.tilt) * eased,
                  fov: from.fov + (cameraPov.fov - from.fov) * eased });
              } catch { reveal(); return; }
              if (t < 1) layer.settleTimer = setTimeout(rotate, 24);
              else reveal();
            };
            rotate();
          }, !state.playing || state.directSeek || canRotate ? 0 : 300);
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
    leaveArrivalForReview();
    state.previewEnded = false;
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
    if (!valid() || state.arrivalComplete || !state.scrubbing || !state.history.length) return;
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
    if (state.arrivalComplete) return;
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
    if (state.arrivalComplete) {
      leaveArrivalForReview();
      state.finishMessage = '';
      state.previewEnded = false;
      state.playing = true;
      state.index = state.history[0]?.index ?? 0;
      state.cursor = 0;
      updateProgress();
      state.play.textContent = state.english ? 'Pause' : '일시정지';
      showFrame(state.index,true);
      return;
    }
    if (state.finished && (state.freeSeek ? state.index === frames.length - 1 : state.cursor === state.history.length - 1) && !state.playing && !state.loading) {
      state.finishMessage = '';
      state.previewEnded = false;
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

function walkPreviewRouteSummary(context, choice) {
  const { start, end, english } = context;
  const from = start.landmark?.label || start.name || routeOrigin || (english ? 'Your location' : '현재 위치');
  const to = end.landmark?.label || destination;
  let text = english
    ? `${from} → ${to} · ${Math.round(choice.distance)} m · about ${choice.minutes} min`
    : `${from}${start.landmark?.kind === 'station-exit' ? '로 나와서' : ''} → ${to} · 약 ${Math.round(choice.distance)}m · 약 ${choice.minutes}분`;
  const comparison = start.walkingComparison;
  if (comparison) text += english
    ? ` · shortest of ${comparison.checked} available routes (${comparison.candidates} requested)`
    : ` · 확인된 ${comparison.checked}개 경로 중 최단 (${comparison.candidates}개 비교 요청)`;
  return text;
}

function describeRouteLeg(leg) {
  const mode = leg?.mode || leg?.travelMode || leg?.transitDetails?.transitLine?.vehicle?.type || '';
  const line = leg?.routeName || (typeof leg?.route === 'string' ? leg.route : leg?.route?.name)
    || leg?.transitDetails?.transitLine?.nameShort || leg?.transitDetails?.transitLine?.name || '';
  const departure = leg?.start?.name || leg?.transitDetails?.stopDetails?.departureStop?.name || '';
  const arrival = leg?.end?.name || leg?.transitDetails?.stopDetails?.arrivalStop?.name || '';
  return [mode, line, departure && arrival ? `${departure} → ${arrival}` : departure || arrival].filter(Boolean).join(' · ').slice(0, 180);
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
    const walkingEnd = end.arrivalAtFront ? choice.paths.at(-1)?.at(-1) : null;
    const endPoint = walkingEnd
      ? new maps.LatLng(walkingEnd[1],walkingEnd[0])
      : new maps.LatLng(end.latitude, end.longitude);
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
    // Draw only the road geometry returned by the entitled TMAP car-routing API.
    clearRouteOverlays();
    const bounds = new maps.LatLngBounds();
    const startPoint = new maps.LatLng(start.latitude, start.longitude);
    const endPoint = new maps.LatLng(end.latitude, end.longitude);
    bounds.extend(startPoint);
    bounds.extend(endPoint);
    for (const coordinates of choice.paths ?? []) {
      const path = coordinates.map(([longitude, latitude]) => new maps.LatLng(latitude, longitude));
      if (path.length < 2) continue;
      path.forEach((point) => bounds.extend(point));
      routeMapOverlays.push(new maps.Polyline({
        map, path, strokeColor: '#20d5ff', strokeOpacity: .96, strokeWeight: 6
      }));
    }
    routeMapOverlays.push(new maps.Marker({ map, position: startPoint, title: '출발지' }));
    routeMapOverlays.push(new maps.Marker({ map, position: endPoint, title: destination.trim() }));
    map.fitBounds(bounds, 36);
    summary = choice.summary;
  } else {
    drawTransitItinerary(maps, map, choice.itinerary, start, end);
    summary = `${english ? { BUS: 'Bus', SUBWAY: 'Subway' }[mode] : { BUS: '버스', SUBWAY: '지하철' }[mode]} · ${transportText(mode, choice.itinerary, english)}`;
  }
  const routeLegs = Array.isArray(choice.itinerary?.legs) ? choice.itinerary.legs : [];
  activeRouteContext = {
    destination: destination.trim(),
    summary: mode === 'WALK' ? walkPreviewRouteSummary(context, choice) : summary,
    steps: routeLegs.map(describeRouteLeg).filter(Boolean).slice(0, 12)
  };
  setGuideAnswer(mode === 'WALK' ? walkPreviewRouteSummary(context, choice) : english
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
        endpointLabel.hidden = false;
        endpointLabel.textContent = walkPreviewRouteSummary(guideTransportContext, guideTransportRoutes.WALK);
        if (end.arrivalAtFront) endpointLabel.textContent += english
          ? ' · Stops near the lodging' : ' · 숙소 근처 도보 경로 종점에서 종료';
        else if (!end.landmark) endpointLabel.textContent += english
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
      // Compare real single-mode itineraries by travel time; a mixed route is not a bus-only or rail-only route.
      const bus = fastestTransitItinerary(itineraries, 'BUS');
      const subway = fastestTransitItinerary(itineraries, 'SUBWAY');
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
      guideTransportRoutes.TAXI = { summary, minutes, fare, paths: Array.isArray(payload.paths) ? payload.paths : [] };
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
  activeRouteContext = {
    destination: destination.trim(),
    summary,
    steps: (Array.isArray(route.legs) ? route.legs : []).map(describeRouteLeg).filter(Boolean).slice(0, 12)
  };
  if (instruction) instruction.textContent = summary;
  setGuideAnswer(english
    ? `Showing a route from ${routeOrigin || 'your location'} to ${destination} on the map. ${summary}.`
    : `${routeOrigin || '현재 위치'}에서 ${destination}까지 ${summary} 경로를 지도에 표시했어요.`);
}

async function requestGuideRoute(naverMaps, container, scene, requestId) {
  const instruction = document.querySelector('.route-instruction span');
  activeRouteContext = null;
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

    if (activePlaceSelection?.place?.name === query) {
      if (!naverMaps) throw new Error('국내 장소 지도에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
      const { origin, place, route } = activePlaceSelection;
      let start = { ...origin,walkingRoute:route };
      if (automaticEntranceQuery(origin.name) && /역\s*$/.test(origin.name)) {
        if (instruction) instruction.textContent = '출발할 역 출구별 실제 도보 경로를 비교하고 있어요.';
        start = await choosePedestrianStartForPlace(origin.name,place,isCurrent,naverMaps);
        if (!start || !isCurrent()) return;
      } else {
        const busStop = explicitBusStopLandmark(origin.name);
        if (busStop) start.landmark = { ...busStop,
          position:[origin.longitude,origin.latitude],source:'Naver place-search origin' };
      }
      if (start.originKind === 'gps') {
        const location = await reverseGeocodeStart(naverMaps, start).catch(() => '');
        start.name = location ? `현재 위치 · ${location}` : '현재 위치';
      }
      await prepareLodgingArrival(naverMaps, start, place, isCurrent);
      if (!isCurrent()) return;
      end = place;
      const map = createNaverMap(naverMaps, container, scene, end);
      await requestNaverTransitRoute(naverMaps, map, start, end, isCurrent, instruction);
      return;
    }

    if (naverMaps && !entranceDescriptor(query)) {
      const namedLodging = await findNamedLodging(query);
      if (!isCurrent()) return;
      if (namedLodging) {
        const start = await resolveRouteStart(naverMaps, routeOrigin);
        if (!isCurrent()) return;
        await prepareLodgingArrival(naverMaps, start, namedLodging, isCurrent);
        if (!isCurrent()) return;
        const map = createNaverMap(naverMaps, container, scene, namedLodging);
        await requestNaverTransitRoute(naverMaps, map, start, namedLodging, isCurrent, instruction);
        return;
      }
    }

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
    if (nearby) {
      nearbyStopRequest = nearby;
      activePlaceSelection = null;
    } else if (isPlaceSearchRequest(spokenDestination)) {
      activeDestinationRecognition = null;
      recognition.stop();
      voiceSearchOpen = false;
      voiceSearchState = 'idle';
      openNearbyPlaceSearch(spokenDestination);
      return;
    } else {
      const parsed = parseRouteRequest(spokenDestination);
      destination = parsed.destination;
      routeOrigin = parsed.origin;
      routeLanguage = parsed.language;
      activePlaceSelection = null;
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




