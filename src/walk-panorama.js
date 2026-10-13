const CAMERA_TO_ROUTE_LIMIT_METERS = 15;
const CAMERA_TO_REQUEST_LIMIT_METERS = 25;
const ROUTE_PROGRESS_LIMIT_METERS = 25;
const MAX_FIRST_STAGE_ROUTE_METERS = 2000;
const MAX_PROBES = 48;
const MAX_FRAMES = 15;
const FRAME_INTERVAL_MS = 1700;
const TURN_FRAME_INTERVAL_MS = 850;
const PANORAMA_TIMEOUT_MS = 6000;
const ARRIVAL_RADIUS_METERS = 30;
const ARRIVAL_MAX_ACCURACY_METERS = 20;
const radians = Math.PI / 180;

function distanceMeters(a, b) {
  const deltaLat = (b.lat - a.lat) * radians;
  const deltaLng = (b.lng - a.lng) * radians;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function walkEdges(segments) {
  const edges = [];
  let progress = 0;
  for (const segment of segments) {
    if (!Array.isArray(segment.coordinates)) continue;
    for (let index = 1; index < segment.coordinates.length; index += 1) {
      const [startLng, startLat] = segment.coordinates[index - 1];
      const [endLng, endLat] = segment.coordinates[index];
      const start = { lat: startLat, lng: startLng };
      const end = { lat: endLat, lng: endLng };
      if (![start.lat, start.lng, end.lat, end.lng].every(Number.isFinite)) continue;
      const length = distanceMeters(start, end);
      if (length < 0.1) continue;
      edges.push({ start, end, from: progress, to: progress + length });
      progress += length;
    }
  }
  return edges;
}

function candidateAt(edges, progress) {
  const target = Math.max(0, Math.min(edges.at(-1).to, progress));
  const edge = edges.find((item) => item.to >= target) || edges.at(-1);
  const fraction = (target - edge.from) / (edge.to - edge.from);
  return {
    lat: edge.start.lat + (edge.end.lat - edge.start.lat) * fraction,
    lng: edge.start.lng + (edge.end.lng - edge.start.lng) * fraction,
    progress: target
  };
}

function closestRoutePosition(camera, edges, requestedProgress = null) {
  let nearest = { distance: Infinity, progress: 0 };
  const latitudeScale = 6371000 * radians;
  const longitudeScale = latitudeScale * Math.cos(camera.lat * radians);
  for (const edge of edges) {
    if (requestedProgress !== null
      && (edge.to < requestedProgress - 35 || edge.from > requestedProgress + 35)) continue;
    const ax = (edge.start.lng - camera.lng) * longitudeScale;
    const ay = (edge.start.lat - camera.lat) * latitudeScale;
    const dx = (edge.end.lng - edge.start.lng) * longitudeScale;
    const dy = (edge.end.lat - edge.start.lat) * latitudeScale;
    const portion = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const distance = Math.hypot(ax + portion * dx, ay + portion * dy);
    if (distance < nearest.distance) {
      nearest = { distance, progress: edge.from + portion * (edge.to - edge.from) };
    }
  }
  return nearest;
}

function headingDegrees(a, b) {
  const east = (b.lng - a.lng) * Math.cos((a.lat + b.lat) * radians / 2);
  return Math.atan2(east, b.lat - a.lat) / radians;
}

function angleDifference(a, b) {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

function signedAngle(a, b) {
  return (((b - a) % 360) + 540) % 360 - 180;
}

function routeCandidates(route, edges) {
  const total = edges.at(-1).to;
  const decisions = [];
  const addDecision = (progress, priority, crossing = false) => {
    if (progress < 10 || progress > total - 6) return;
    const before = candidateAt(edges, progress - 8);
    const at = candidateAt(edges, progress);
    const after = candidateAt(edges, Math.min(total, progress + 10));
    const turn = signedAngle(headingDegrees(before, at), headingDegrees(at, after));
    const action = turn < -25 ? '좌회전' : turn > 25 ? '우회전' : '직진';
    if (action === '직진') return;
    decisions.push({ progress, priority, action, crossing });
  };
  for (const guide of Array.isArray(route.guidePoints) ? route.guidePoints : []) {
    if (![guide.lat, guide.lng].every(Number.isFinite)) continue;
    const crossing = guide.turnType >= 211 && guide.turnType <= 217;
    const turning = [12, 13, 14, 16, 17, 18, 19].includes(guide.turnType);
    if (!crossing && !turning) continue;
    const near = closestRoutePosition(guide, edges);
    if (near.distance > 8) continue;
    addDecision(near.progress, crossing ? 3 : 4, crossing);
  }
  for (let index = 0; index < edges.length - 1; index += 1) {
    const progress = edges[index].to;
    if (progress < 12 || progress > total - 12) continue;
    const before = candidateAt(edges, progress - 8);
    const at = candidateAt(edges, progress);
    const after = candidateAt(edges, progress + 8);
    if (angleDifference(headingDegrees(before, at), headingDegrees(at, after)) >= 50) {
      addDecision(progress, 2);
    }
  }
  const selected = [];
  for (const decision of decisions.sort((a, b) => b.priority - a.priority)) {
    if (selected.some((item) => Math.abs(item.progress - decision.progress) < 6)) continue;
    selected.push(decision);
    if (selected.length >= 7) break;
  }
  const ordered = selected.sort((a, b) => a.progress - b.progress);
  const probes = [];
  const addProbe = (progress, decision = null) => {
    const point = candidateAt(edges, progress);
    probes.push({
      ...point,
      priority: decision?.priority || 0,
      action: decision?.action || '',
      crossing: decision?.crossing || false,
      decisionProgress: decision?.progress ?? null,
      windowEnd: decision && point.progress < decision.progress ? decision.progress : total,
      phase: !decision ? 'route' : point.progress < decision.progress ? 'approach' : 'after'
    });
  };
  // Probe the whole real route before adding denser samples around actual decisions.
  for (let index = 0; index <= 20; index += 1) addProbe(total * index / 20);
  for (const decision of ordered) {
    for (const offset of [-12, -3, 8]) {
      if (decision.progress + offset > 0 && decision.progress + offset < total) {
        addProbe(decision.progress + offset, decision);
      }
    }
  }
  return probes.sort((a, b) => b.priority - a.priority)
    .filter((probe, index, all) => !all.slice(0, index).some((other) =>
      Math.abs(other.progress - probe.progress) < 3))
    .sort((a, b) => a.progress - b.progress)
    .slice(0, MAX_PROBES);
}

function selectFrames(verified, total) {
  if (!verified.length) return [];
  const ordered = [...verified].sort((a, b) => a.progress - b.progress);
  const endpointZone = Math.min(65, Math.max(30, total * .08));
  const first = ordered.find((frame) => frame.progress <= endpointZone);
  const last = [...ordered].reverse().find((frame) => frame.progress >= total - endpointZone);
  // An endpoint scene must really be near that end of the route. Never label
  // a mid-route photograph as departure or arrival to make up the count.
  if (!first || !last || first.panoId === last.panoId) return [];
  const middle = ordered.filter((frame) => frame.progress > endpointZone
    && frame.progress < total - endpointZone);
  const chosen = [first, last];
  const minimumSpacing = Math.min(24, Math.max(8, total / 55));
  const decisionGroups = [...new Set(middle.filter((frame) => frame.decisionProgress !== null
    && frame.action !== '직진' && frame.decisionProgress > endpointZone + 25
    && frame.decisionProgress < total - endpointZone - 25)
    .map((frame) => frame.decisionProgress))].sort((a, b) => a - b)
    .filter((progress, index, all) => index === 0 || progress - all[index - 1] >= 35);
  for (const progress of decisionGroups) {
    for (const phase of ['approach', 'after']) {
      if (chosen.length >= MAX_FRAMES) break;
      const frame = middle.filter((item) => item.decisionProgress === progress
        && item.phase === phase && !chosen.includes(item)
        && chosen.every((other) => Math.abs(other.progress - item.progress) >= 8))
        .sort((a, b) => Math.abs(a.progress - progress) - Math.abs(b.progress - progress))[0];
      if (frame) chosen.push(frame);
    }
  }
  const targetGap = (last.progress - first.progress) / (MAX_FRAMES - 1);
  for (let index = 1; index < MAX_FRAMES - 1 && chosen.length < MAX_FRAMES; index += 1) {
    const target = first.progress + targetGap * index;
    const candidate = middle
      .filter((frame) => !chosen.includes(frame)
        && chosen.every((item) => Math.abs(item.progress - frame.progress) >= minimumSpacing))
      .sort((a, b) => (Math.abs(a.progress - target) - (a.priority ? 6 : 0))
        - (Math.abs(b.progress - target) - (b.priority ? 6 : 0)))[0];
    if (candidate && Math.abs(candidate.progress - target) <= targetGap * .7) chosen.push(candidate);
  }
  // Fill genuine gaps first; do not spend the remaining slots on repeated
  // photographs clustered around either station.
  while (chosen.length < MAX_FRAMES) {
    const candidate = middle.filter((frame) => !chosen.includes(frame)
      && chosen.every((item) => Math.abs(item.progress - frame.progress) >= minimumSpacing))
      .sort((a, b) => Math.min(...chosen.map((item) => Math.abs(b.progress - item.progress)))
        - Math.min(...chosen.map((item) => Math.abs(a.progress - item.progress))))[0];
    if (!candidate) break;
    chosen.push(candidate);
  }
  return chosen.sort((a, b) => a.progress - b.progress).map((frame, index, all) => ({
    ...frame,
    phase: index === 0 ? 'departure' : index === all.length - 1 ? 'arrival' : frame.phase
  }));
}

export function createWalkPanorama(maps, section) {
  const canvas = section?.querySelector('.walk-panorama-canvas');
  const ground = section?.querySelector('.walk-panorama-ground');
  const turn = section?.querySelector('.walk-panorama-turn');
  const status = section?.querySelector('.walk-panorama-status');
  const arrival = section?.querySelector('.walk-panorama-arrival');
  const previous = section?.querySelector('[data-panorama-action="previous"]');
  const playback = section?.querySelector('[data-panorama-action="playback"]');
  const next = section?.querySelector('[data-panorama-action="next"]');
  if (!section || !canvas || !ground || !turn || !status || !arrival || !previous || !playback || !next) {
    return { start() {}, stop() {} };
  }

  let panorama = null;
  let listeners = [];
  let pending = null;
  let frames = [];
  let routeEdges = [];
  let destination = null;
  let selected = -1;
  let playing = false;
  let busy = false;
  let timer = null;
  let generation = 0;
  let arrivalRequest = 0;

  const setStatus = (message) => { status.textContent = message; };
  const updateControls = () => {
    previous.disabled = busy || selected <= 0;
    next.disabled = busy || selected < 0 || selected >= frames.length - 1;
    playback.disabled = busy || selected < 0 || selected >= frames.length - 1;
    playback.textContent = playing ? '일시정지' : '재생';
    playback.setAttribute('aria-label', playing ? '로드뷰 일시정지' : '로드뷰 재생');
  };
  const clearTimer = () => {
    window.clearTimeout(timer);
    timer = null;
  };
  const settlePending = (result) => {
    if (!pending) return;
    const active = pending;
    pending = null;
    window.clearTimeout(active.timeout);
    window.clearTimeout(active.settleTimer);
    active.resolve(result);
  };
  const snapshotIfReady = () => {
    if (!pending || pending.status !== 'OK' || !pending.changed || !panorama) return;
    const location = panorama.getLocation();
    const coordinate = location?.coord;
    settlePending({
      status: 'OK',
      panoId: panorama.getPanoId(),
      camera: coordinate ? { lat: coordinate.lat(), lng: coordinate.lng() } : null,
      title: location?.title || '',
      photodate: location?.photodate || ''
    });
  };
  const attachListeners = () => {
    listeners = [
      maps.Event.addListener(panorama, 'pano_status', (value) => {
        if (!pending) return;
        pending.status = value;
        if (value === 'OK') {
          snapshotIfReady();
          if (pending) {
            const active = pending;
            active.settleTimer = window.setTimeout(() => {
              if (pending === active) {
                active.changed = true;
                snapshotIfReady();
              }
            }, 180);
          }
        }
        else settlePending({ status: value || 'ERROR' });
      }),
      maps.Event.addListener(panorama, 'pano_changed', () => {
        if (!pending) return;
        pending.changed = true;
        snapshotIfReady();
      })
    ];
  };
  const query = (action) => new Promise((resolve) => {
    if (pending) {
      resolve({ status: 'BUSY' });
      return;
    }
    pending = {
      resolve,
      status: null,
      changed: false,
      settleTimer: null,
      timeout: window.setTimeout(() => settlePending({ status: 'TIMEOUT' }), PANORAMA_TIMEOUT_MS)
    };
    try { action(); } catch { settlePending({ status: 'ERROR' }); }
  });
  const pause = () => {
    playing = false;
    clearTimer();
    updateControls();
  };
  const scheduleNext = () => {
    clearTimer();
    if (!playing || selected >= frames.length - 1) {
      if (playing) pause();
      return;
    }
    const current = frames[selected];
    const upcoming = frames[selected + 1];
    const sameTurn = current.decisionProgress !== null && upcoming.decisionProgress !== null
      && current.action !== '직진' && upcoming.action !== '직진'
      && upcoming.progress - current.progress <= 45;
    timer = window.setTimeout(() => { void showFrame(selected + 1); },
      sameTurn ? TURN_FRAME_INTERVAL_MS : FRAME_INTERVAL_MS);
  };
  const fallback = (message) => {
    pause();
    section.classList.remove('is-loading', 'is-switching');
    canvas.hidden = true;
    ground.replaceChildren();
    turn.hidden = true;
    section.hidden = false;
    arrival.textContent = '';
    setStatus(`${message} 기존 지도에서 도보 경로를 확인해 주세요.`);
    selected = -1;
    updateControls();
  };

  const showGroundGuide = (frame) => {
    ground.replaceChildren();
    if (!routeEdges.length || frame.routeOffset > CAMERA_TO_ROUTE_LIMIT_METERS || !panorama) return;
    if (routeEdges.at(-1).to - frame.progress < 8) return;
    const pov = panorama.getPov();
    if (!Number.isFinite(pov?.pan) || !Number.isFinite(pov?.fov)) return;
    const points = [[150, 199]];
    for (const [meters, y] of [[2, 188], [6, 174], [12, 151], [19, 121], [28, 87]]) {
      const point = candidateAt(routeEdges, frame.progress + meters);
      const difference = signedAngle(pov.pan, headingDegrees(frame.camera, point));
      if (Math.abs(difference) > Math.min(100, pov.fov / 2 + 40)) break;
      points.push([Math.max(18, Math.min(282, 150 + difference * 2.1)), y]);
    }
    if (points.length < 2) return;
    const formatPoint = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
    const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const arrows = points.slice(1).map(([x, y], index) => {
      const before = points[index];
      const length = Math.hypot(x - before[0], y - before[1]) || 1;
      if (length < 15 && points.length > 2) return '';
      const tangent = [(x - before[0]) / length, (y - before[1]) / length];
      const normal = [-tangent[1], tangent[0]];
      const center = [(x + before[0]) / 2, (y + before[1]) / 2];
      const tip = [center[0] + tangent[0] * 10, center[1] + tangent[1] * 10];
      const left = [center[0] - tangent[0] * 5 + normal[0] * 8, center[1] - tangent[1] * 5 + normal[1] * 8];
      const right = [center[0] - tangent[0] * 5 - normal[0] * 8, center[1] - tangent[1] * 5 - normal[1] * 8];
      return `<polygon points="${[left, tip, right].map(formatPoint).join(' ')}" fill="#35d477" stroke="rgba(5,55,31,.72)" stroke-width="1.5" stroke-linejoin="round"/>`;
    }).join('');
    ground.innerHTML = `<svg viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true">
      <path d="${path}" fill="none" stroke="rgba(5,55,31,.72)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${path}" fill="none" stroke="#35d477" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      ${arrows}
    </svg>`;
  };

  const verifyArrival = (run) => {
    const check = ++arrivalRequest;
    arrival.textContent = '로드뷰 미리보기 종료 · 실제 도착 여부를 GPS로 확인 중입니다.';
    if (!destination || !navigator.geolocation) {
      arrival.textContent = '로드뷰 미리보기 종료 · 실제 도착은 확인되지 않았습니다.';
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      if (run !== generation || check !== arrivalRequest || selected !== frames.length - 1) return;
      const accuracy = position.coords.accuracy;
      const current = { lat: position.coords.latitude, lng: position.coords.longitude };
      const distance = distanceMeters(current, destination);
      const confirmed = Number.isFinite(accuracy) && accuracy > 0
        && accuracy <= ARRIVAL_MAX_ACCURACY_METERS && distance + accuracy <= ARRIVAL_RADIUS_METERS;
      arrival.textContent = confirmed
        ? 'GPS 정확도와 목적지 좌표로 실제 도착을 확인했습니다.'
        : '로드뷰 미리보기 종료 · 현재 GPS로 실제 도착을 확인하지 못했습니다.';
    }, () => {
      if (run === generation && check === arrivalRequest && selected === frames.length - 1) {
        arrival.textContent = '로드뷰 미리보기 종료 · GPS 확인에 실패해 실제 도착을 판정하지 않았습니다.';
      }
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
  };

  async function showFrame(index) {
    if (busy || index < 0 || index >= frames.length || !panorama) return;
    const run = generation;
    const frame = frames[index];
    busy = true;
    section.classList.add('is-switching');
    updateControls();
    const found = await query(() => panorama.setPanoIdWithPov(frame.panoId, frame.pov));
    if (run !== generation) return;
    busy = false;
    section.classList.remove('is-switching');
    if (found.status !== 'OK' || found.panoId !== frame.panoId || !found.camera
      || distanceMeters(found.camera, frame.camera) > 3) {
      fallback('이 장면의 실제 로드뷰를 다시 확인할 수 없습니다.');
      return;
    }
    panorama.setPov(frame.pov);
    const applied = panorama.getPov();
    if (!Number.isFinite(applied?.pan) || angleDifference(applied.pan, frame.pov.pan) > 5) {
      fallback('실제 도보 진행 방향으로 로드뷰 시야를 맞출 수 없습니다.');
      return;
    }
    selected = index;
    canvas.hidden = false;
    const beforeTurnMeters = frame.decisionProgress === null
      ? 0 : Math.round(Math.max(0, frame.decisionProgress - frame.progress));
    turn.textContent = frame.phase === 'departure' ? '출발 지점 주변'
      : frame.phase === 'arrival' ? '도착 지점 주변'
        : frame.phase === 'route' ? '실제 도보 경로 진행'
          : frame.phase === 'approach'
            ? `${frame.crossing ? '갈림길 · ' : ''}${beforeTurnMeters > 12
              ? `약 ${beforeTurnMeters}m 앞 ${frame.action}` : frame.action}`
            : `${frame.action} 후 진행`;
    turn.hidden = false;
    showGroundGuide(frame);
    setStatus(`실제 도보 경로 로드뷰 ${index + 1}/${frames.length} · ${frame.title || '도보 경로'} · ${frame.photodate.slice(0, 10)} 촬영`);
    section.dataset.panoramaId = frame.panoId;
    section.dataset.cameraLat = frame.camera.lat.toFixed(7);
    section.dataset.cameraLng = frame.camera.lng.toFixed(7);
    section.dataset.routeOffsetMeters = frame.routeOffset.toFixed(1);
    section.dataset.progressMeters = frame.progress.toFixed(1);
    section.dataset.headingDegrees = applied.pan.toFixed(1);
    arrivalRequest += 1;
    if (index === frames.length - 1) verifyArrival(run);
    else {
      const gap = frames[index + 1].progress - frame.progress;
      arrival.textContent = gap > 75
        ? `다음 실제 로드뷰까지 경로 약 ${Math.round(gap)}m · 중간 구간은 지도에서 확인해 주세요.`
        : '경로 미리보기 · 실제 도착 판정과는 별개입니다.';
    }
    updateControls();
    scheduleNext();
  }

  const stop = () => {
    generation += 1;
    arrivalRequest += 1;
    pause();
    settlePending({ status: 'CANCELLED' });
    listeners.forEach((listener) => maps.Event.removeListener(listener));
    listeners = [];
    panorama?.setVisible(false);
    panorama = null;
    canvas.replaceChildren();
    ground.replaceChildren();
    turn.hidden = true;
    canvas.hidden = false;
    section.hidden = true;
    section.classList.remove('is-loading', 'is-switching');
    for (const key of ['panoramaId', 'cameraLat', 'cameraLng', 'routeOffsetMeters', 'progressMeters', 'headingDegrees']) {
      delete section.dataset[key];
    }
    arrival.textContent = '';
    frames = [];
    routeEdges = [];
    destination = null;
    selected = -1;
    busy = false;
  };

  const start = async (route, end) => {
    stop();
    const run = generation;
    destination = end && [end.lat, end.lng].every(Number.isFinite) ? end : null;
    if (!maps.Panorama || !Array.isArray(route?.segments)) {
      fallback('네이버 로드뷰를 불러올 수 없습니다.');
      return;
    }
    if (!Number.isFinite(route.distanceMeters) || route.distanceMeters > MAX_FIRST_STAGE_ROUTE_METERS) {
      fallback('이번 단계에서는 2km 이내 도보 경로만 로드뷰를 확인합니다.');
      return;
    }
    const edges = walkEdges(route.segments);
    if (!edges.length) {
      fallback('로드뷰 위치와 대조할 실제 도보 경로 좌표가 부족합니다.');
      return;
    }
    const candidates = routeCandidates(route, edges);
    if (!candidates.length) {
      fallback('이 도보 경로에는 확인된 회전·갈림길 판단 지점이 없습니다.');
      return;
    }
    routeEdges = edges;
    section.hidden = false;
    canvas.hidden = false;
    section.classList.add('is-loading');
    arrival.textContent = '경로 미리보기 · 실제 도착 판정과는 별개입니다.';
    updateControls();
    const verified = [];
    const ids = new Set();
    for (let index = 0; index < candidates.length; index += 1) {
      if (run !== generation) return;
      const candidate = candidates[index];
      setStatus(`실제 도보 경로의 로드뷰 위치를 확인 중입니다 · ${index + 1}/${candidates.length}`);
      const found = await query(() => {
        if (index === 0) {
          panorama = new maps.Panorama(canvas, {
            position: new maps.LatLng(candidate.lat, candidate.lng),
            pov: { pan: 0, tilt: 0, fov: 95 },
            flightSpot: false
          });
          attachListeners();
        } else panorama.setPosition(new maps.LatLng(candidate.lat, candidate.lng));
      });
      if (run !== generation) return;
      if (found.status !== 'OK' || !found.panoId || !found.camera
        || ![found.camera.lat, found.camera.lng].every(Number.isFinite)
        || ids.has(found.panoId)) continue;
      const routePosition = closestRoutePosition(found.camera, edges, candidate.progress);
      if (distanceMeters(found.camera, candidate) > CAMERA_TO_REQUEST_LIMIT_METERS
        || routePosition.distance > CAMERA_TO_ROUTE_LIMIT_METERS
        || Math.abs(routePosition.progress - candidate.progress) > ROUTE_PROGRESS_LIMIT_METERS) continue;
      const from = candidateAt(edges, Math.max(0, candidate.progress - 2));
      const ahead = candidateAt(edges, candidate.phase === 'approach'
        ? Math.min(candidate.decisionProgress, candidate.progress + 6)
        : Math.min(candidate.windowEnd, candidate.progress + 6));
      if (distanceMeters(from, ahead) < 2) continue;
      const projected = panorama.getProjection()?.fromCoordToPov(new maps.LatLng(ahead.lat, ahead.lng));
      const routeHeading = headingDegrees(from, ahead);
      if (!Number.isFinite(projected?.pan)
        || angleDifference(projected.pan, headingDegrees(found.camera, ahead)) > 25
        || angleDifference(projected.pan, routeHeading) > 80) continue;
      ids.add(found.panoId);
      verified.push({
        ...found,
        progress: routePosition.progress,
        decisionProgress: candidate.decisionProgress,
        routeOffset: routePosition.distance,
        priority: candidate.priority,
        action: candidate.action,
        crossing: candidate.crossing,
        phase: candidate.phase,
        pov: { pan: routeHeading, tilt: 0, fov: 95 }
      });
    }
    if (run !== generation) return;
    section.classList.remove('is-loading');
    frames = selectFrames(verified, edges.at(-1).to);
    if (!frames.length) {
      fallback('출발지와 도착지 주변 모두에서 실제 경로와 방향이 확인된 로드뷰가 부족합니다.');
      return;
    }
    await showFrame(0);
  };

  previous.addEventListener('click', () => { pause(); void showFrame(selected - 1); });
  next.addEventListener('click', () => { pause(); void showFrame(selected + 1); });
  playback.addEventListener('click', () => {
    if (playing) pause();
    else if (selected >= 0 && selected < frames.length - 1) {
      playing = true;
      updateControls();
      scheduleNext();
    }
  });
  updateControls();
  return { start, stop };
}
