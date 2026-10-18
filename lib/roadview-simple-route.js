const tidy = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
const travel = '(?:(도보(?:로)?|걸어서|걸어|지하철(?:로| 타고)?|버스(?:로| 타고)?|택시(?:로| 타고)?)\\s*)?';
const request = '(?:어떻게\\s*가(?:나요|요|야\\s*(?:하나요|해요|해|돼요|돼|되나요)|면\\s*(?:되나요|돼요|돼))?|가는\\s*(?:길|법|방법)(?:\\s*(?:좀\\s*)?(?:알려\\s*(?:주세요|줘요|줘)|안내해\\s*(?:주세요|줘)))?|(?:길찾기|길|경로)(?:\\s*(?:좀\\s*)?(?:알려\\s*(?:주세요|줘요|줘)|안내해\\s*(?:주세요|줘)))?|안내해\\s*(?:주세요|줘)|얼마나\\s*걸(?:려요|려|리나요|립니까)|몇\\s*분\\s*걸(?:려요|려|리나요)|소요\\s*시간|거리(?:가\\s*얼마(?:인가요|예요|야))?)';
const pair = new RegExp(`^(.{1,80}?)(?:에서|부터)\\s*(.{1,80}?)(?:까지|으로|로)\\s*${travel}(?:${request})?$`);
const destinationOnly = new RegExp(`^(.{1,80}?)(?:까지|으로|로)\\s*${travel}(?:${request})?$`);
// Spoken questions often omit the destination particle: "사가정역에서 용마산 스카이워크 어떻게 가나요".
const spokenPair = new RegExp(`^(.{1,80}?)(?:에서|부터)\\s*(.{1,80}?)\\s+${travel}${request}$`);

// Deliberately narrow: uncertain/conditional/follow-up questions keep the
// existing Flash path. No language model is called to classify a clear match.
function simpleRouteQuestion(message, context = {}) {
  const text = tidy(message).replace(/[.!?？]+$/g, '').trim()
    .replace(/^(?:지금\s*)?여기서\s*/, '현재 위치에서 ');
  if (!text || /(?:만약|대신|말고|아니라|아니고|추천|안전|편한|쉬운|왜|비가|비오|비 오|유모차|휠체어|통제|막혔|경유|들러|거쳐|먼저|등산|탐방로|정상|능선|갈림길|산장|승강장|플랫폼|환승|지하\s*\d|역\s*(?:안|내부)|지하철\s*안)/.test(text)) return null;
  const match = text.match(pair) || text.match(spokenPair);
  const single = match ? null : text.match(destinationOnly);
  if (!match && !single) return null;
  let start = tidy(match?.[1] || '');
  let destination = tidy(match ? match[2] : single[1]);
  const modeText = match ? match[3] : single[2];
  if (/^(?:여기|현재\s*위치|지금\s*위치|내\s*위치)$/.test(start)) start = '';
  if (/^(?:목적지|선택한\s*목적지|거기|그곳)$/.test(destination)) destination = tidy(context.destination);
  if (!destination || [start, destination].some(name => /(?:그리고|어떻게|어디|누구|하는데|인데|할까|궁금|설명)/.test(name))) return null;
  const mode = /^지하철/.test(modeText || '') ? 'subway' : /^버스/.test(modeText || '') ? 'bus'
    : /^택시/.test(modeText || '') ? 'taxi' : 'walk';
  const environment = /스카이워크|둘레길|자락길/.test(destination) ? 'mountain' : 'outdoor';
  return { task: 'route', environment, startQuery: start, destinationQuery: destination, mode, query: '' };
}

function simpleRouteAnswer(route) {
  if (!route || !Number.isFinite(route.totalSeconds) || route.totalSeconds <= 0) {
    return 'TMAP 경로를 확인하지 못했습니다. 출발지와 목적지를 다시 알려 주세요.';
  }
  const modes = { walk: '도보', subway: '지하철', bus: '버스', taxi: '택시' };
  const mode = modes[route.mode] || '이동';
  const minutes = Math.max(1, Math.ceil(route.totalSeconds / 60));
  const distance = Number.isFinite(route.distanceMeters) && route.distanceMeters > 0
    ? `약 ${route.distanceMeters >= 1000 ? `${(route.distanceMeters / 1000).toFixed(1)}킬로미터` : `${Math.round(route.distanceMeters)}미터`}, ` : '';
  const destination = tidy(route.destination?.title) || '목적지';
  const scheduled = tidy(route.departureBasis);
  const parts = [scheduled
    ? `TMAP ${scheduled} 출발 기준의 ${mode} 경로입니다. 지금 출발 가능한 경로는 아닙니다.`
    : `TMAP ${mode} 경로를 확인했습니다.`,
  `${destination}까지 ${distance}약 ${minutes}분입니다.`];
  if (route.mode === 'walk') {
    const directions = (Array.isArray(route.directions) ? route.directions : [])
      .filter(value => typeof value === 'string').map(tidy).filter(Boolean);
    if (directions.length) parts.push(`처음에는 ${directions.slice(0, 3).map(value => value.slice(0, 160)).join('. ')}.`);
  } else if (['subway', 'bus'].includes(route.mode)) {
    const legs = Array.isArray(route.transportLegs) ? route.transportLegs : route.subwayLegs || [];
    const first = legs[0];
    if (first?.route && first?.board && first?.alight) {
      parts.push(`${tidy(first.board)}에서 ${tidy(first.route)}${first.mode === 'BUS' ? ' 버스' : ''}를 타고 ${tidy(first.alight)}에서 내리세요.`);
      if (legs.length > 1) parts.push(`이후 ${legs.slice(1).map(leg => `${tidy(leg.board)}에서 ${tidy(leg.route)}로 갈아타 ${tidy(leg.alight)}에서 하차`).join(', ')}하세요.`);
    }
    if (Number.isInteger(route.transferCount)) parts.push(`환승은 ${route.transferCount}회입니다.`);
  } else if (route.mode === 'taxi' && Number.isFinite(route.taxiFare) && route.taxiFare > 0) {
    parts.push(`예상 택시 요금은 ${Math.round(route.taxiFare).toLocaleString('ko-KR')}원이며 실제 요금과 다를 수 있습니다.`);
  }
  return parts.join(' ');
}

module.exports = { simpleRouteQuestion, simpleRouteAnswer };
