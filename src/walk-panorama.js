const CAMERA_TO_ROUTE_LIMIT_METERS = 15;
const CAMERA_TO_REQUEST_LIMIT_METERS = 25;
const ROUTE_PROGRESS_LIMIT_METERS = 25;
const MAX_FIRST_STAGE_ROUTE_METERS = 2000;
const FRAME_INTERVAL_MS = 5500;
const PANORAMA_TIMEOUT_MS = 12000;
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

function candidateAt(edges, fraction) {
  const target = edges.at(-1).to * fraction;
  const edge = edges.find((item) => item.to >= target) || edges.at(-1);
  return { ...edge.end, progress: edge.to };
}

function closestRoutePosition(camera, edges) {
  let nearest = { distance: Infinity, progress: 0 };
  const latitudeScale = 6371000 * radians;
  const longitudeScale = latitudeScale * Math.cos(camera.lat * radians);
  for (const edge of edges) {
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

function nextRouteCoordinate(camera, progress, edges) {
  const next = edges.find((edge) => edge.to >= progress + 10) || edges.at(-1);
  return next && distanceMeters(camera, next.end) >= 3 ? next.end : null;
}

export function createWalkPanorama(maps, section) {
  const canvas = section?.querySelector('.walk-panorama-canvas');
  const status = section?.querySelector('.walk-panorama-status');
  const previous = section?.querySelector('[data-panorama-action="previous"]');
  const playback = section?.querySelector('[data-panorama-action="playback"]');
  const next = section?.querySelector('[data-panorama-action="next"]');
  if (!section || !canvas || !status || !previous || !playback || !next) {
    return { start() {}, stop() {} };
  }

  let panorama = null;
  let listeners = [];
  let pending = null;
  let frames = [];
  let selected = -1;
  let playing = false;
  let busy = false;
  let timer = null;
  let generation = 0;

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
        if (value === 'OK') snapshotIfReady();
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
    timer = window.setTimeout(() => { void showFrame(selected + 1); }, FRAME_INTERVAL_MS);
  };
  const fallback = (message) => {
    pause();
    canvas.hidden = true;
    section.hidden = false;
    setStatus(`${message} 기존 지도에서 도보 경로를 확인해 주세요.`);
    selected = -1;
    updateControls();
  };

  async function showFrame(index) {
    if (busy || index < 0 || index >= frames.length || !panorama) return;
    const run = generation;
    const frame = frames[index];
    busy = true;
    updateControls();
    const found = await query(() => panorama.setPanoIdWithPov(frame.panoId, frame.pov));
    if (run !== generation) return;
    busy = false;
    if (found.status !== 'OK' || found.panoId !== frame.panoId || !found.camera
      || distanceMeters(found.camera, frame.camera) > 3) {
      fallback('이 장면의 실제 로드뷰를 다시 확인할 수 없습니다.');
      return;
    }
    panorama.setPov(frame.pov);
    selected = index;
    canvas.hidden = false;
    setStatus(`실제 로드뷰 ${index + 1}/${frames.length} · ${frame.title || '도보 경로'} · ${frame.photodate.slice(0, 10)} 촬영`);
    updateControls();
    scheduleNext();
  }

  const stop = () => {
    generation += 1;
    pause();
    settlePending({ status: 'CANCELLED' });
    listeners.forEach((listener) => maps.Event.removeListener(listener));
    listeners = [];
    panorama?.setVisible(false);
    panorama = null;
    canvas.replaceChildren();
    canvas.hidden = false;
    section.hidden = true;
    frames = [];
    selected = -1;
    busy = false;
  };

  const start = async (route) => {
    stop();
    const run = generation;
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
    const candidates = [0.1, 0.5, 0.9].map((fraction) => candidateAt(edges, fraction));
    if (new Set(candidates.map((candidate) => candidate.progress)).size !== 3) {
      fallback('서로 다른 로드뷰 지점 3곳을 확인할 수 없습니다.');
      return;
    }
    section.hidden = false;
    canvas.hidden = false;
    section.classList.add('is-loading');
    setStatus('실제 경로 위의 네이버 로드뷰 3곳을 확인하고 있습니다.');
    updateControls();
    const verified = [];
    for (let index = 0; index < candidates.length; index += 1) {
      if (run !== generation) return;
      const candidate = candidates[index];
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
      if (found.status === 'TIMEOUT') break;
      if (found.status !== 'OK' || !found.panoId || !found.camera
        || ![found.camera.lat, found.camera.lng].every(Number.isFinite)) continue;
      const routePosition = closestRoutePosition(found.camera, edges);
      if (distanceMeters(found.camera, candidate) > CAMERA_TO_REQUEST_LIMIT_METERS
        || routePosition.distance > CAMERA_TO_ROUTE_LIMIT_METERS
        || Math.abs(routePosition.progress - candidate.progress) > ROUTE_PROGRESS_LIMIT_METERS
        || verified.some((frame) => frame.panoId === found.panoId)
        || (verified.length && routePosition.progress <= verified.at(-1).progress + 20)) continue;
      const ahead = nextRouteCoordinate(found.camera, routePosition.progress, edges);
      const direction = ahead && panorama.getProjection()?.fromCoordToPov(
        new maps.LatLng(ahead.lat, ahead.lng)
      );
      if (!direction || !Number.isFinite(direction.pan)) continue;
      verified.push({
        ...found,
        progress: routePosition.progress,
        pov: { pan: direction.pan, tilt: 0, fov: 95 }
      });
    }
    if (run !== generation) return;
    section.classList.remove('is-loading');
    if (verified.length !== 3) {
      fallback(`실제 경로와 방향이 확인된 로드뷰가 ${verified.length}곳뿐입니다.`);
      return;
    }
    frames = verified;
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
