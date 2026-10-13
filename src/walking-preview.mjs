const EARTH_RADIUS_METERS = 6371000;
const SCENE_SPACING_METERS = 32;
const PANORAMA_TIMEOUT_MS = 4200;
const NORMAL_HOLD_MS = 1050;
const TURN_HOLD_MS = 1450;

let activePreview = null;

export function walkPreviewDistance(a, b) {
  if (!validPoint(a) || !validPoint(b)) return Infinity;
  const radians = Math.PI / 180;
  const lat1 = a[1] * radians;
  const lat2 = b[1] * radians;
  const dLat = lat2 - lat1;
  const dLon = (b[0] - a[0]) * radians;
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function walkPreviewBearing(a, b) {
  if (!validPoint(a) || !validPoint(b)) return 0;
  const radians = Math.PI / 180;
  const lat1 = a[1] * radians;
  const lat2 = b[1] * radians;
  const lon = (b[0] - a[0]) * radians;
  return (Math.atan2(Math.sin(lon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon))
    / radians + 360) % 360;
}

function validPoint(point) {
  return Array.isArray(point) && point.length >= 2
    && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
    && Math.abs(Number(point[0])) <= 180 && Math.abs(Number(point[1])) <= 90;
}

function flattenRoute(paths) {
  const points = [];
  for (const path of Array.isArray(paths) ? paths : []) {
    if (!Array.isArray(path) || path.length < 2 || !path.every(validPoint)) return null;
    if (points.length && walkPreviewDistance(points.at(-1), path[0]) > 3) return null;
    for (const point of path) {
      const normalized = [Number(point[0]), Number(point[1])];
      if (!points.length || walkPreviewDistance(points.at(-1), normalized) > 0.25) points.push(normalized);
    }
  }
  if (points.length < 2) return null;
  const distances = [0];
  for (let i = 1; i < points.length; i += 1) {
    distances.push(distances[i - 1] + walkPreviewDistance(points[i - 1], points[i]));
  }
  return distances.at(-1) >= 1 ? { points, distances, total: distances.at(-1) } : null;
}

function pointAt(route, meters) {
  const target = Math.max(0, Math.min(route.total, meters));
  let low = 1;
  let high = route.distances.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (route.distances[middle] < target) low = middle + 1;
    else high = middle;
  }
  const span = route.distances[low] - route.distances[low - 1];
  const fraction = span ? (target - route.distances[low - 1]) / span : 0;
  return route.points[low - 1].map((value, axis) => value + (route.points[low][axis] - value) * fraction);
}

function projectToRoute(route, point, minimumMeters = 0) {
  if (!validPoint(point)) return null;
  let best = null;
  const latitudeScale = Math.cos(Number(point[1]) * Math.PI / 180);
  for (let index = 1; index < route.points.length; index += 1) {
    const a = route.points[index - 1];
    const b = route.points[index];
    const dx = (b[0] - a[0]) * latitudeScale;
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0) continue;
    const t = Math.max(0, Math.min(1,
      ((point[0] - a[0]) * latitudeScale * dx + (point[1] - a[1]) * dy) / lengthSquared));
    const meters = route.distances[index - 1] + t * (route.distances[index] - route.distances[index - 1]);
    if (meters < minimumMeters) continue;
    const projected = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const distance = walkPreviewDistance(point, projected);
    if (!best || distance < best.distance) best = { meters, distance, point: projected };
  }
  return best;
}

function turnDirection(delta) {
  if (Math.abs(delta) >= 145) return 'uturn';
  if (delta >= 32) return 'right';
  if (delta <= -32) return 'left';
  return 'straight';
}

function directionFromText(text) {
  if (/유턴|되돌아/.test(text)) return 'uturn';
  if (/좌회전|왼쪽/.test(text)) return 'left';
  if (/우회전|오른쪽/.test(text)) return 'right';
  if (/직진|횡단보도|건너/.test(text)) return 'straight';
  return null;
}

function routeTurns(route) {
  const turns = [];
  for (let index = 1; index < route.points.length - 1; index += 1) {
    const meters = route.distances[index];
    if (meters < 5 || route.total - meters < 5) continue;
    const incoming = walkPreviewBearing(pointAt(route, meters - 9), pointAt(route, meters));
    const outgoing = walkPreviewBearing(pointAt(route, meters), pointAt(route, meters + 9));
    const delta = ((outgoing - incoming + 540) % 360) - 180;
    if (Math.abs(delta) < 32) continue;
    const prior = turns.at(-1);
    if (prior && meters - prior.meters < 14 && Math.sign(delta) === Math.sign(prior.delta)) {
      if (Math.abs(delta) > Math.abs(prior.delta)) turns[turns.length - 1] = { meters, delta };
    } else turns.push({ meters, delta });
  }
  return turns;
}

function routeManeuvers(route, maneuvers, turns) {
  const result = [];
  let minimum = 2;
  for (const maneuver of Array.isArray(maneuvers) ? maneuvers : []) {
    const description = typeof maneuver?.description === 'string'
      ? maneuver.description.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
    if (!description) continue;
    const explicitDirection = directionFromText(description);
    const hasDecision = explicitDirection || /교차로|사거리|삼거리|갈림길|분기|골목|입구|출구|진입|진출|계단|육교|지하보도/.test(description);
    if (!hasDecision) continue;
    const projected = projectToRoute(route, maneuver.position, minimum);
    if (!projected || projected.distance > 22 || projected.meters > route.total - 4) continue;
    minimum = projected.meters + 1;
    const nearbyTurn = turns.find(turn => Math.abs(turn.meters - projected.meters) <= 18);
    const direction = nearbyTurn ? turnDirection(nearbyTurn.delta) : explicitDirection;
    if (!direction) continue;
    result.push({ meters: nearbyTurn?.meters ?? projected.meters,
      delta: nearbyTurn?.delta ?? 0, direction, description });
  }
  for (const turn of turns) {
    if (result.some(item => Math.abs(item.meters - turn.meters) <= 14)) continue;
    result.push({ meters: turn.meters, delta: turn.delta,
      direction: turnDirection(turn.delta), description: '' });
  }
  return result.sort((a, b) => a.meters - b.meters);
}

export function walkPreviewFrames(paths, maneuvers = []) {
  const route = flattenRoute(paths);
  if (!route) return [];
  const turns = routeTurns(route);
  const decisions = routeManeuvers(route, maneuvers, turns);
  const marks = [{ meters: 0, phase: 'start', event: null }];
  for (let meters = SCENE_SPACING_METERS; meters < route.total - 8; meters += SCENE_SPACING_METERS) {
    marks.push({ meters, phase: 'straight', event: null });
  }
  decisions.forEach((event, index) => {
    const previous = decisions[index - 1]?.meters ?? 0;
    const next = decisions[index + 1]?.meters ?? route.total;
    const approach = Math.max(previous + Math.min(2, (event.meters - previous) / 3),
      event.meters - Math.min(9, (event.meters - previous) / 3));
    if (event.meters - approach >= 2) marks.push({ meters: approach, phase: 'approach', event });
    marks.push({ meters: event.meters, phase: 'turn', event });
    const depart = event.meters + Math.min(6, (next - event.meters) / 3);
    if (depart - event.meters >= 2 && depart < route.total - 4) {
      marks.push({ meters: depart, phase: 'depart', event });
    }
  });
  marks.push({ meters: route.total, phase: 'arrival', event: null });
  marks.sort((a, b) => a.meters - b.meters);

  const unique = [];
  for (const mark of marks) {
    const previous = unique.at(-1);
    if (previous && Math.abs(previous.meters - mark.meters) < 2) {
      if (mark.phase === 'turn' || mark.phase === 'arrival') unique[unique.length - 1] = mark;
      continue;
    }
    unique.push(mark);
  }

  return unique.map((mark, index) => {
    const previousDecision = [...decisions].reverse().find(event => event.meters <= mark.meters + 1);
    const nextDecision = decisions.find(event => event.meters > mark.meters + 1) || null;
    let headingFrom = pointAt(route, Math.max(0, mark.meters - 5));
    let headingTo = pointAt(route, Math.min(route.total, mark.meters + 14));
    if (mark.phase === 'approach' && mark.event) {
      headingFrom = pointAt(route, Math.max(0, mark.meters - 2));
      headingTo = pointAt(route, mark.event.meters);
    } else if (mark.phase === 'turn') {
      headingFrom = pointAt(route, Math.min(route.total, mark.meters + 2));
      headingTo = pointAt(route, Math.min(route.total, mark.meters + 18));
    }
    const event = mark.event;
    return {
      index, position: pointAt(route, mark.meters), meters: mark.meters, total: route.total,
      heading: walkPreviewBearing(headingFrom, headingTo),
      ahead: headingTo, phase: mark.phase,
      direction: event?.direction || 'straight',
      description: event?.description || '',
      turnMeters: event?.meters ?? null,
      turnAngle: Math.abs(event?.delta || 0),
      nextDecision,
      showArrow: mark.phase !== 'arrival',
      holdMs: mark.phase === 'turn' ? TURN_HOLD_MS : NORMAL_HOLD_MS
    };
  });
}

function directionLabel(direction, english) {
  const labels = english
    ? { left: 'left', right: 'right', uturn: 'make a U-turn', straight: 'straight' }
    : { left: '좌회전', right: '우회전', uturn: '유턴', straight: '직진' };
  return labels[direction] || labels.straight;
}

export function walkPreviewInstruction(frame, english = false, arrived = false) {
  if (arrived || frame.phase === 'arrival') return english ? 'You have arrived.' : '목적지에 도착했어요.';
  if (frame.phase === 'start') return english ? 'Start walking along the route.' : '경로를 따라 출발하세요.';
  if (frame.phase === 'approach' && frame.turnMeters != null) {
    const distance = Math.max(1, Math.round(frame.turnMeters - frame.meters));
    const direction = directionLabel(frame.direction, english);
    if (!english && frame.direction === 'straight' && /횡단보도|건너/.test(frame.description)) {
      return `약 ${distance}m 직진 후 횡단보도를 건너세요.`;
    }
    if (frame.direction === 'straight') return english
      ? `Continue straight for about ${distance} m.` : `약 ${distance}m 직진하세요.`;
    return english ? `Continue for about ${distance} m, then turn ${direction}.`
      : `약 ${distance}m 직진 후 ${direction}하세요.`;
  }
  if (frame.phase === 'turn') {
    const direction = directionLabel(frame.direction, english);
    if (!english && frame.direction === 'straight' && /횡단보도|건너/.test(frame.description)) {
      return '여기서 횡단보도를 건너세요.';
    }
    if (frame.direction === 'straight') return english ? 'Continue straight here.' : '여기서 직진하세요.';
    return english ? `Turn ${direction} here.`
      : `여기서 ${direction}하세요.`;
  }
  if (frame.phase === 'depart') return english ? 'Continue along the route.' : '이 길을 따라 계속 걸어가세요.';
  if (frame.nextDecision) {
    const distance = Math.max(1, Math.round(frame.nextDecision.meters - frame.meters));
    const direction = directionLabel(frame.nextDecision.direction, english);
    if (frame.nextDecision.direction === 'straight') return english
      ? `Continue straight for about ${distance} m.` : `약 ${distance}m 직진하세요.`;
    return english ? `Continue for about ${distance} m, then turn ${direction}.`
      : `약 ${distance}m 직진 후 ${direction}하세요.`;
  }
  return english ? 'Continue straight along the route.' : '경로를 따라 계속 직진하세요.';
}

function routeProjection(route, point) {
  return projectToRoute(route, point, 0);
}

function makeGroundArrow(container, heading, capturePoint, routePoint, pov, english) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!(width > 0 && height > 0)) return;
  const radians = Math.PI / 180;
  const pan = (Number(pov?.pan) || 0) * radians;
  const tilt = (Number(pov?.tilt) || 0) * radians;
  const fov = (Number(pov?.fov) || 75) * radians;
  const focal = width / (2 * Math.tan(fov / 2));
  const localHeading = heading * radians;
  const east = (routePoint[0] - capturePoint[0]) * Math.cos(capturePoint[1] * radians) * 111320;
  const north = (routePoint[1] - capturePoint[1]) * 111320;
  const points = [[-.42, 6], [.42, 6], [.42, 10], [1.05, 10], [0, 13], [-1.05, 10], [-.42, 10]];
  const projected = points.map(([x, y]) => {
    const e = east + Math.sin(localHeading) * y + Math.cos(localHeading) * x;
    const n = north + Math.cos(localHeading) * y - Math.sin(localHeading) * x;
    const right = e * Math.cos(pan) - n * Math.sin(pan);
    const ahead = e * Math.sin(pan) + n * Math.cos(pan);
    const depth = ahead * Math.cos(tilt) - 2.3 * Math.sin(tilt);
    const up = -2.3 * Math.cos(tilt) - ahead * Math.sin(tilt);
    if (depth < 2) return null;
    return [width / 2 + focal * right / depth, height / 2 - focal * up / depth];
  });
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', projected.every(Boolean)
    && projected.every(point => point[0] >= 8 && point[0] <= width - 8 && point[1] >= 8 && point[1] <= height - 8)
    ? projected.map(point => point.map(value => value.toFixed(1)).join(',')).join(' ')
    : `${Math.round(width * .5)},${Math.round(height * .7)} ${Math.round(width * .76)},${Math.round(height * .84)} ${Math.round(width * .58)},${Math.round(height * .84)} ${Math.round(width * .58)},${Math.round(height * .96)} ${Math.round(width * .42)},${Math.round(height * .96)} ${Math.round(width * .42)},${Math.round(height * .84)} ${Math.round(width * .24)},${Math.round(height * .84)}`);
  polygon.setAttribute('fill', '#16c6f4');
  polygon.setAttribute('fill-opacity', '.9');
  polygon.setAttribute('stroke', '#e3faff');
  polygon.setAttribute('stroke-width', '2');
  polygon.setAttribute('stroke-linejoin', 'round');
  polygon.style.filter = 'drop-shadow(0 2px 3px rgba(0, 25, 42, .85))';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  svg.append(polygon);
  const overlay = document.createElement('div');
  overlay.className = 'walk-route-ground-arrow';
  overlay.setAttribute('aria-label', english ? 'Route direction arrow' : '보행 방향 화살표');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:3;pointer-events:none';
  overlay.append(svg);
  container.append(overlay);
}

function setMessage(state, text = '') {
  state.message.textContent = text;
  state.message.style.display = text ? '' : 'none';
}

function showMap(state) {
  state.scene.hidden = true;
  state.mapElement.inert = false;
  state.mapElement.removeAttribute('aria-hidden');
  state.mapElement.style.visibility = '';
  state.visual.classList.remove('walk-preview-open');
  state.walkButton?.setAttribute('aria-expanded', 'false');
  state.walkButton?.focus?.({ preventScroll: true });
}

export function stopWalkPreview(hidePanel = false) {
  const state = activePreview;
  if (!state) return;
  clearTimeout(state.timer);
  clearTimeout(state.timeout);
  clearTimeout(state.seekTimer);
  state.playing = false;
  for (const panorama of state.panoramaInstances.values()) {
    state.maps?.Event?.clearInstanceListeners(panorama);
    try { panorama.setVisible(false); } catch { /* The view may be detached. */ }
  }
  state.viewer.replaceChildren();
  state.instruction.textContent = state.originalInstruction.text;
  state.instruction.hidden = state.originalInstruction.hidden;
  state.instruction.style.minHeight = state.originalInstruction.minHeight;
  if (state.transportOptions) state.transportOptions.style.display = state.transportDisplay;
  showMap(state);
  state.panel.hidden = hidePanel;
  state.walkButton?.setAttribute('aria-expanded', 'false');
  state.seek.oninput = state.seek.onchange = state.seek.onpointerdown = state.seek.onpointerup = null;
  state.prev.onclick = state.next.onclick = state.play.onclick = null;
  state.visual.removeEventListener('keydown', state.onKeyDown);
  state.panel.removeEventListener('keydown', state.onKeyDown);
  if (activePreview === state) activePreview = null;
}

export function startWalkPreview(context, choice, isCurrent = () => true) {
  stopWalkPreview(true);
  const panel = document.querySelector('#walk-preview');
  const viewer = document.querySelector('#walk-preview-panorama');
  const scene = document.querySelector('#walk-preview-scene');
  const visual = scene?.closest('.route-visual');
  const mapElement = visual?.querySelector('.naver-map');
  const walkButton = visual?.querySelector('.walk-action');
  if (!panel || !viewer || !scene || !visual || !mapElement) return;

  const route = flattenRoute(choice.paths);
  const frames = walkPreviewFrames(choice.paths, choice.maneuvers);
  const controls = {
    message: panel.querySelector('#walk-preview-message'),
    instruction: panel.querySelector('#route-endpoints'),
    progress: panel.querySelector('#walk-preview-progress-text'),
    seek: panel.querySelector('#walk-preview-seek'),
    prev: panel.querySelector('#walk-preview-prev'),
    next: panel.querySelector('#walk-preview-next'),
    play: panel.querySelector('#walk-preview-play')
  };
  if (!route || !frames.length || Object.values(controls).some(item => !item)) {
    panel.hidden = false;
    controls.message.textContent = context.english
      ? 'The walking route could not be connected. The map remains available.'
      : '도보 경로가 이어지지 않아 재생할 수 없어요. 지도로 경로를 확인해 주세요.';
    controls.message.style.display = '';
    return;
  }

  const transportOptions = document.querySelector('.transport-options');
  const state = {
    ...context, route, frames, ...controls,
    panel, viewer, scene, visual, mapElement, walkButton, transportOptions,
    transportDisplay: transportOptions?.style.display || '',
    originalInstruction: { text: controls.instruction.textContent,
      hidden: controls.instruction.hidden, minHeight: controls.instruction.style.minHeight || '' },
    index: 0, shownIndex: -1, requestedIndex: 0, playing: true,
    loading: false, finished: false, timer: null, timeout: null,
    panorama: null, activeElement: null, generation: 0,
    panoramaInstances: new Map(), pendingPanorama: null,
    pendingElement: null, failed: false, seekTimer: null, onKeyDown: null
  };
  activePreview = state;
  if (transportOptions) transportOptions.style.display = 'none';
  const compactLabel = value => String(value || '').replace(/^(?:(?:출발 위치|입력한 출발지)\s*[·:]\s*)+/, '')
    .replace(/\s*\(\s*/g, '(').replace(/\s*\)/g, ')').replace(/\s+(앞|뒤|옆)$/, '$1').trim();
  const origin = compactLabel(context.start?.landmark?.label || context.start?.name || '');
  const subtitle = panel.querySelector('.walk-preview-header small');
  const routeTitle = panel.querySelector('.walk-preview-header h2');
  if (subtitle) subtitle.textContent = origin || (context.english ? 'Walking route' : '도보 경로');
  if (routeTitle) {
    const destination = context.end?.landmark?.label || context.end?.name || '';
    routeTitle.textContent = [origin, destination].filter(Boolean).join(' → ');
  }
  panel.hidden = false;
  scene.hidden = false;
  visual.classList.add('walk-preview-open');
  mapElement.inert = true;
  mapElement.setAttribute('aria-hidden', 'true');
  walkButton?.setAttribute('aria-expanded', 'true');
  state.seek.disabled = frames.length < 2;
  state.seek.min = '0';
  state.seek.max = String(frames.length - 1);
  state.seek.value = '0';
  state.seek.style.setProperty('--seek-fill', '0%');
  state.play.disabled = false;
  state.play.textContent = context.english ? 'Pause' : '일시정지';
  state.prev.disabled = true;
  state.next.disabled = frames.length < 2;
  setMessage(state);

  const valid = generation => activePreview === state && generation === state.generation
    && isCurrent() && document.querySelector('#walk-preview') === panel;
  const updateProgress = (index = state.shownIndex) => {
    const safeIndex = Math.max(0, Math.min(frames.length - 1, index < 0 ? 0 : index));
    const frame = frames[safeIndex];
    state.seek.value = String(safeIndex);
    state.seek.style.setProperty('--seek-fill', `${frames.length > 1 ? 100 * safeIndex / (frames.length - 1) : 100}%`);
    state.seek.setAttribute('aria-valuetext', context.english
      ? `${Math.round(frame.meters)} m of ${Math.round(frame.total)} m`
      : `전체 ${Math.round(frame.total)}m 중 ${Math.round(frame.meters)}m`);
    state.progress.textContent = context.english
      ? `Scene ${safeIndex + 1} of ${frames.length} · ${Math.round(frame.meters)} m of ${Math.round(frame.total)} m`
      : `장면 ${safeIndex + 1} / ${frames.length} · 전체 ${Math.round(frame.total)}m 중 ${Math.round(frame.meters)}m`;
  };
  const updateButtons = () => {
    const index = state.failed || state.shownIndex < 0 ? state.requestedIndex : state.shownIndex;
    state.prev.disabled = state.loading || index <= 0;
    state.next.disabled = state.loading || state.finished || index >= frames.length - 1;
    state.play.disabled = state.loading;
  };
  const finish = () => {
    if (!valid(state.generation) || state.finished) return;
    clearTimeout(state.timer);
    clearTimeout(state.timeout);
    state.finished = true;
    state.playing = false;
    state.loading = false;
    state.shownIndex = frames.length - 1;
    state.index = state.shownIndex;
    state.play.textContent = context.english ? 'Replay' : '다시 보기';
    state.instruction.hidden = false;
    state.instruction.style.minHeight = '3em';
    state.instruction.textContent = walkPreviewInstruction(frames.at(-1), context.english, true);
    updateProgress(state.shownIndex);
    updateButtons();
    setMessage(state);
  };
  const fail = (generation, text) => {
    if (!valid(generation) || !state.loading) return;
    clearTimeout(state.timeout);
    state.loading = false;
    state.failed = true;
    if (state.pendingPanorama) {
      state.maps.Event.clearInstanceListeners(state.pendingPanorama);
      try { state.pendingPanorama.setVisible(false); } catch { /* The view may be detached. */ }
      state.panoramaInstances.delete(state.pendingElement);
      state.pendingPanorama = null;
    }
    state.pendingElement?.remove();
    state.pendingElement = null;
    state.playing = false;
    state.play.textContent = context.english ? 'Play' : '자동 재생';
    if (state.requestedIndex === frames.length - 1 && state.shownIndex >= 0) {
      state.finished = true;
      state.play.textContent = context.english ? 'Replay' : '다시 보기';
      state.instruction.textContent = context.english
        ? 'The street-view sequence ended before the destination.'
        : '거리뷰가 목적지 전에 끝났어요.';
      state.progress.textContent = context.english
        ? 'Preview ended · destination not confirmed'
        : '미리보기 종료 · 목적지는 확인되지 않았어요.';
    }
    setMessage(state, text);
    updateButtons();
  };

  const renderFrame = (index) => {
    if (activePreview !== state || state.finished && index !== 0) return;
    clearTimeout(state.timer);
    clearTimeout(state.timeout);
    state.requestedIndex = Math.max(0, Math.min(frames.length - 1, index));
    state.index = state.requestedIndex;
    state.loading = true;
    state.failed = false;
    const generation = ++state.generation;
    updateButtons();
    setMessage(state, context.english ? 'Loading the next street scene…' : '다음 거리 장면을 불러오고 있어요.');
    if (!context.maps?.Panorama || !context.maps?.Event) {
      fail(generation, context.english ? 'Street view is unavailable.' : '거리뷰를 열 수 없어요.');
      return;
    }

    const frame = frames[index];
    const layer = document.createElement('div');
    layer.className = 'walk-preview-frame';
    layer.style.cssText = 'position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity 320ms ease';
    viewer.append(layer);
    state.pendingElement = layer;
    const position = new context.maps.LatLng(frame.position[1], frame.position[0]);
    const pan = ((frame.heading + 540) % 360) - 180;
    let instance;
    let ready = false;
    state.timeout = setTimeout(() => fail(generation,
      context.english ? 'No street view is available at this route point. Playback paused here.'
        : '이 구간의 거리뷰가 없어 재생을 멈췄어요. 다음 버튼으로 확인할 수 있어요.'), PANORAMA_TIMEOUT_MS);
    try {
      instance = new context.maps.Panorama(layer, {
        position,
        pov: { pan, tilt: 0, fov: 75 },
        zoomControl: false, aroundControl: false, flightSpot: false, logoControl: false
      });
      state.panorama = instance;
      state.pendingPanorama = instance;
      state.panoramaInstances.set(layer, instance);
      context.maps.Event.addListener(instance, 'pano_status', status => {
        if (status !== 'OK' && !ready) fail(generation,
          context.english ? 'No street view is available at this route point. Playback paused here.'
            : '이 구간의 거리뷰가 없어 재생을 멈췄어요. 다음 버튼으로 확인할 수 있어요.');
      });
      context.maps.Event.addListener(instance, 'init', () => {
        if (!valid(generation) || ready || !state.loading) return;
        ready = true;
        clearTimeout(state.timeout);
        const location = instance.getLocation?.();
        const coord = location?.coord;
        const capturePoint = coord && [Number(coord.lng()), Number(coord.lat())];
        const nearest = capturePoint && routeProjection(route, capturePoint);
        if (nearest && nearest.distance > 38) {
          fail(generation, context.english
            ? 'The available photo is too far from this route. Playback paused to avoid a jump.'
            : '이 사진은 실제 경로에서 너무 멀어 재생을 멈췄어요. 장면을 건너뛰지 않았어요.');
          return;
        }
        try { instance.setPov({ pan, tilt: 0, fov: 75 }); } catch { /* Keep the provider's view. */ }
        if (frame.showArrow) {
          const arrowOrigin = capturePoint || frame.position;
          const routeAhead = pointAt(route, Math.min(route.total, (nearest?.meters ?? frame.meters) + 2));
          makeGroundArrow(layer, frame.heading, arrowOrigin, routeAhead,
            { pan, tilt: 0, fov: 75 }, context.english);
        }
        const previous = state.activeElement;
        state.activeElement = layer;
        state.pendingPanorama = null;
        state.pendingElement = null;
        previous?.querySelector('.walk-route-ground-arrow')?.remove();
        state.shownIndex = index;
        state.loading = false;
        state.instruction.hidden = false;
        state.instruction.style.minHeight = '3em';
        state.instruction.textContent = walkPreviewInstruction(frame, context.english);
        setMessage(state);
        updateProgress(index);
        updateButtons();
        requestAnimationFrame(() => {
          if (!valid(generation)) return;
          layer.style.opacity = '1';
          if (previous && previous !== layer) {
            previous.style.opacity = '0';
            setTimeout(() => {
              previous.remove();
              const oldPanorama = state.panoramaInstances.get(previous);
              if (oldPanorama) {
                context.maps.Event.clearInstanceListeners(oldPanorama);
                try { oldPanorama.setVisible(false); } catch { /* The view is detached. */ }
                state.panoramaInstances.delete(previous);
              }
            }, 360);
          }
        });
        if (index === frames.length - 1) {
          finish();
        } else if (state.playing) {
          state.timer = setTimeout(() => renderFrame(index + 1), frame.holdMs);
        }
      });
    } catch {
      fail(generation, context.english ? 'Street view could not be opened. Playback paused here.'
        : '거리뷰를 열지 못해 재생을 멈췄어요.');
    }
  };

  const pause = () => {
    state.playing = false;
    clearTimeout(state.timer);
    state.play.textContent = context.english ? 'Play' : '자동 재생';
  };
  const play = () => {
    if (state.loading) return;
    if (state.finished) {
      state.finished = false;
      for (const panorama of state.panoramaInstances.values()) {
        context.maps.Event.clearInstanceListeners(panorama);
        try { panorama.setVisible(false); } catch { /* The view may be detached. */ }
      }
      state.panoramaInstances.clear();
      state.panorama = null;
      state.pendingPanorama = null;
      state.pendingElement = null;
      state.shownIndex = -1;
      state.requestedIndex = 0;
      state.index = 0;
      state.viewer.replaceChildren();
      state.activeElement = null;
      state.playing = true;
      state.play.textContent = context.english ? 'Pause' : '일시정지';
      renderFrame(0);
      return;
    }
    if (state.failed) {
      state.playing = true;
      state.play.textContent = context.english ? 'Pause' : '일시정지';
      renderFrame(state.requestedIndex);
      return;
    }
    state.playing = !state.playing;
    state.play.textContent = state.playing ? (context.english ? 'Pause' : '일시정지')
      : (context.english ? 'Play' : '자동 재생');
    if (state.playing && state.shownIndex >= 0) {
      state.timer = setTimeout(() => renderFrame(state.shownIndex + 1), frames[state.shownIndex].holdMs);
    }
  };
  state.prev.onclick = () => {
    if (state.loading) return;
    pause();
    state.finished = false;
    renderFrame(Math.max(0, (state.failed || state.shownIndex < 0 ? state.requestedIndex : state.shownIndex) - 1));
  };
  state.next.onclick = () => {
    if (state.loading) return;
    pause();
    state.finished = false;
    renderFrame(Math.min(frames.length - 1,
      (state.failed || state.shownIndex < 0 ? state.requestedIndex : state.shownIndex) + 1));
  };
  state.play.onclick = play;
  state.seek.oninput = () => {
    if (state.loading) return;
    pause();
    const selected = Number(state.seek.value);
    clearTimeout(state.seekTimer);
    state.seekTimer = setTimeout(() => {
      state.finished = false;
      renderFrame(selected);
    }, 160);
  };
  state.seek.onchange = () => {
    if (state.loading) return;
    clearTimeout(state.seekTimer);
    state.finished = false;
    renderFrame(Number(state.seek.value));
  };
  state.onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      stopWalkPreview(true);
    }
  };
  visual.addEventListener('keydown', state.onKeyDown);
  panel.addEventListener('keydown', state.onKeyDown);
  state.progress.textContent = context.english ? 'Preparing the walking route…' : '도보 경로를 준비하고 있어요.';
  renderFrame(0);
  visual.scrollIntoView({ behavior: 'auto', block: 'nearest' });
}
