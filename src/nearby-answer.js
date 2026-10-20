import { currentGuidePosition } from './guide-location.js?v=20261020-radius-2';
import { fetchNearbyPlaces, nearbyDistanceLabel } from './nearby-place.js?v=20261020-radius-2';

// Nearby answers use retrieved POIs directly; the language model does not invent
// shops, distances, opening hours, or a route from a panorama preview.
export async function nearbyAnswer(query, signal) {
  const position = await currentGuidePosition(signal, { resolveRegion: false });
  if (signal?.aborted) return '';
  const places = await fetchNearbyPlaces(query, position, () => !signal?.aborted, signal);
  if (signal?.aborted) return '';
  if (!places.length) return '현재 위치 주변에서 상호·업종·좌표를 함께 확인한 후보를 찾지 못했습니다. 주변에 업체가 없다는 뜻은 아닙니다.';
  const entries = places.slice(0, 3).map(place =>
    `${place.title}: ${nearbyDistanceLabel(place, position.accuracy)}. ${place.roadAddress || place.address || ''}`);
  return `현재 GPS를 기준으로 조회하고 네이버 장소 정보와 대조한 주변 후보입니다. ${entries.join(' / ')}. 표시는 직선거리이며, 실제 도보 경로와 영업 여부는 별도 확인이 필요합니다.`;
}
