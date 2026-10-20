import { currentGuidePosition } from './guide-location.js?v=20261020-field-1';
import { nearbyPlaceQuery } from './nearby-place.js?v=20261020-radius-2';
import { nearbyAnswer } from './nearby-answer.js?v=20261020-radius-2';

// Both chat surfaces send the same physical-location evidence and search request.
// Route cards are labelled previews; panorama/camera coordinates are never sent.
export function fieldContext(context = {}) {
  context = context && typeof context === 'object' ? context : {};
  const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
  return {
    start: text(context.start, 100), destination: text(context.destination, 100),
    mode: ['walk', 'subway', 'bus', 'taxi'].includes(context.mode) ? context.mode : '',
    routeVerified: context.routeVerified === true,
    routeText: text(context.routeText, 2600),
    locationBasis: 'selected_route_preview_not_physical_location'
  };
}

export async function askFieldGuide(message, { signal, context = {}, history = [] } = {}) {
  if (signal?.aborted) return null;
  const nearby = nearbyPlaceQuery(message);
  // Preserve the existing coordinate-radius/corroborated POI flow on both pages.
  if (nearby) return { text: await nearbyAnswer(nearby, signal), sources: [] };
  const position = await currentGuidePosition(signal);
  if (signal?.aborted) return null;
  const response = await fetch('/api/assistant/reply', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task: 'field-guide', message, position,
      context: fieldContext(context), history: (Array.isArray(history) ? history : []).slice(-8).flatMap(turn =>
        ['user', 'assistant'].includes(turn?.role) && typeof turn.text === 'string'
          ? [{ role: turn.role, text: turn.text.slice(0, 700) }] : []) }),
    signal
  });
  const result = await response.json().catch(() => ({}));
  if (signal?.aborted) return null;
  if (!response.ok) throw new Error(result.error || '현장 안내 자료를 확인하지 못했습니다. 다시 질문해 주세요.');
  if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('AI 안내 답변을 확인하지 못했습니다.');
  return result;
}
