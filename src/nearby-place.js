// Recognize current-location requests before the route parser can lose "nearby".
export function nearbyPlaceQuery(message) {
  const text = String(message || '').trim().replace(/[.!?？。]+$/, '').trim();
  if (/(?:번역|통역|translate)/i.test(text)) return '';
  if (/(?:에서.+까지|지하철로|버스로|택시로|도보로)/.test(text)) return '';
  const match = text.match(/^(?:(?:지금|여기서|여기|현재\s*위치에서)\s*)*(?:(?:이\s*)?(?:근처|주변)(?:에|의)?|(?:제일|가장)\s*가까운)\s*(.+)$/);
  if (!match) return '';
  const query = match[1].replace(/^(?:제일|가장)\s*가까운\s*/, '')
    .replace(/\s*(?:좀\s*)?(?:찾아\s*(?:줘|주세요|줄래)|알려\s*(?:줘|주세요)|검색해\s*(?:줘|주세요)|있어|있나요|어디야|어딨어)\s*$/, '')
    .replace(/(?:을|를)\s*$/, '').trim();
  return query.length > 0 && query.length <= 80 ? query : '';
}

export async function fetchNearbyPlaces(query, origin, isActive = () => true, signal) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)
    || Math.abs(origin.lat) > 90 || Math.abs(origin.lng) > 180
    || !Number.isFinite(origin.accuracy) || origin.accuracy < 0 || origin.accuracy > 2000
    || !Number.isFinite(origin.timestamp) || Math.abs(Date.now() - origin.timestamp) > 120000) {
    throw new Error('주변 검색에 사용할 현재 위치를 확인하지 못했습니다. 위치 권한을 확인하고 다시 검색해 주세요.');
  }
  if (!isActive() || signal?.aborted) return [];
  const timeout = AbortSignal.timeout(30000);
  const response = await fetch('/api/map/place', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, nearby: {
      lat: origin.lat, lng: origin.lng, accuracy: origin.accuracy, timestamp: origin.timestamp
    } }),
    signal: signal && AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout
  });
  const payload = await response.json().catch(() => ({}));
  if (!isActive() || signal?.aborted) return [];
  if (!response.ok) throw new Error(payload.error || '주변 장소 검색에 연결하지 못했습니다.');
  return Array.isArray(payload.places) ? payload.places : [];
}

export function nearbyDistanceLabel(place, accuracy = 0) {
  if (!Number.isFinite(place.distanceMeters) || place.distanceMeters < 0) return '';
  const rounded = Math.round(place.distanceMeters / 10) * 10;
  const distance = rounded < 1000 ? `${Math.max(10, rounded)}m` : `${(rounded / 1000).toFixed(1)}km`;
  return `직선거리 약 ${distance}${accuracy > 50 ? ' · 대략적인 GPS 기준' : ''}`;
}
