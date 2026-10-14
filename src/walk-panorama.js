const CAMERA_TO_ROUTE_LIMIT_METERS = 15;
const CAMERA_TO_REQUEST_LIMIT_METERS = 25;
const ROUTE_PROGRESS_LIMIT_METERS = 25;
const MAX_FIRST_STAGE_ROUTE_METERS = 2000;
const MAX_PROBES = 460;
const MAX_FRAMES = 25;
const PANORAMA_TIMEOUT_MS = 6000;
const ARRIVAL_RADIUS_METERS = 30;
const ARRIVAL_MAX_ACCURACY_METERS = 20;
const PANORAMA_CAMERA_HEIGHT_METERS = 2.5;
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
  for (const [segmentIndex, segment] of segments.entries()) {
    if (!Array.isArray(segment.coordinates)) continue;
    for (let index = 1; index < segment.coordinates.length; index += 1) {
      const [startLng, startLat] = segment.coordinates[index - 1];
      const [endLng, endLat] = segment.coordinates[index];
      const start = { lat: startLat, lng: startLng };
      const end = { lat: endLat, lng: endLng };
      if (![start.lat, start.lng, end.lat, end.lng].every(Number.isFinite)) continue;
      const length = distanceMeters(start, end);
      if (length < 0.1) continue;
      edges.push({ start, end, from: progress, to: progress + length, segmentIndex });
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
    progress: target,
    segmentIndex: edge.segmentIndex
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

function projectOnPanoramaGround(camera, point, pov, width, height) {
  const north = (point.lat - camera.lat) * 6371000 * radians;
  const east = (point.lng - camera.lng) * 6371000 * radians
    * Math.cos(camera.lat * radians);
  const pan = pov.pan * radians;
  const tilt = (pov.tilt || 0) * radians;
  const forward = north * Math.cos(pan) + east * Math.sin(pan);
  const right = east * Math.cos(pan) - north * Math.sin(pan);
  const depth = forward * Math.cos(tilt) - PANORAMA_CAMERA_HEIGHT_METERS * Math.sin(tilt);
  if (depth < 2) return null;
  const up = -PANORAMA_CAMERA_HEIGHT_METERS * Math.cos(tilt) - forward * Math.sin(tilt);
  const focal = width / (2 * Math.tan((pov.fov || 90) * radians / 2));
  const x = width / 2 + focal * right / depth;
  const y = height / 2 - focal * up / depth;
  if (x < -width * .08 || x > width * 1.08 || y < -height * .08 || y > height * 1.08) {
    return null;
  }
  return { x, y, radius: Math.min(11, Math.max(1.3, focal * .16 / depth)) };
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
  // The preview shows at most 25 scenes. Spread panorama checks over the
  // route, while retaining 7 m checks on short routes and extra turn probes.
  const probeSpacing = Math.max(7, total / (MAX_FRAMES + 10));
  for (let progress = 0; progress < total; progress += probeSpacing) addProbe(progress);
  addProbe(total);
  for (const decision of ordered.slice(0, 7)) {
    for (const offset of [-18, -10, -4, 6, 12, 20]) {
      if (decision.progress + offset > 0 && decision.progress + offset < total) {
        addProbe(decision.progress + offset, decision);
      }
    }
  }
  const candidates = probes.sort((a, b) => b.priority - a.priority)
    .filter((probe, index, all) => !all.slice(0, index).some((other) =>
      Math.abs(other.progress - probe.progress) < 3))
    .sort((a, b) => a.progress - b.progress)
    .slice(0, MAX_PROBES);
  return { candidates, decisions: ordered };
}

function instructionForFrame(frame, decisions, routeLength) {
  if (frame.phase === 'arrival') return '목적지 주변입니다. 지도에서 위치를 확인하세요.';
  const next = decisions.find((decision) => decision.priority >= 3
    && decision.progress >= frame.progress - 2);
  if (next) {
    const meters = Math.max(0, Math.round(next.progress - frame.progress));
    if (next.crossing) return meters > 20
      ? `약 ${meters}m 계속 직진한 뒤 횡단보도로 건너가세요.`
      : '여기서 횡단보도로 건너가세요.';
    const direction = next.action === '좌회전' ? '왼쪽' : '오른쪽';
    return meters > 20
      ? `약 ${meters}m 계속 직진한 뒤 ${direction} 길로 가세요.`
      : `여기서 ${direction} 길로 가세요.`;
  }
  return routeLength - frame.progress <= 20
    ? '목적지 방향으로 계속 가세요.' : '계속 직진하세요.';
}

export async function findStationExit(stationName, routePoint, stationPoint) {
  const response = await fetch('/api/map/place', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `${stationName} 출구` })
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return (Array.isArray(payload.places) ? payload.places : [])
    .filter((place) => place.category === '교통시설>지하철출구번호'
      && place.title?.startsWith(stationName)
      && Number.isFinite(place.lat) && Number.isFinite(place.lng)
      && distanceMeters(place, stationPoint) <= 160
      && distanceMeters(place, routePoint) <= 120)
    .sort((a, b) => distanceMeters(a, routePoint) - distanceMeters(b, routePoint))[0] || null;
}

function selectFrames(verified, total, startStationLocation = null) {
  if (!verified.length) return [];
  const ordered = [...verified].sort((a, b) => a.progress - b.progress);
  const endpointZone = Math.min(65, Math.max(30, total * .08));
  const departureOptions = ordered.filter((frame) => frame.progress <= endpointZone);
  const stationViews = startStationLocation ? departureOptions.filter((frame) => {
    const stationHeading = headingDegrees(frame.camera, startStationLocation);
    return distanceMeters(frame.camera, startStationLocation) <= 45
      && angleDifference(frame.pov.pan, stationHeading) <= 115;
  }) : [];
  const first = stationViews.sort((a, b) => distanceMeters(a.camera, startStationLocation)
    - distanceMeters(b.camera, startStationLocation))[0] || departureOptions[0];
  // Keep the destination in front of the final camera. A panorama almost on
  // top of the destination can face beyond it and project its marker offscreen.
  const arrivalOptions = ordered.filter((frame) => frame.progress >= total - endpointZone
    && frame.progress <= total - 5);
  const last = arrivalOptions.sort((a, b) => Math.abs(total - 25 - a.progress)
    - Math.abs(total - 25 - b.progress))[0]
    || [...ordered].reverse().find((frame) => frame.progress >= total - endpointZone);
  // An endpoint scene must really be near that end of the route. Never label
  // a mid-route photograph as departure or arrival to make up the count.
  if (!first || !last || first.panoId === last.panoId) return [];
  // A station is one departure landmark. Use the remaining scenes for the
  // journey beyond its immediate surroundings instead of repeating it.
  const departureZone = startStationLocation ? Math.min(45, total * .08) : 0;
  const middle = ordered.filter((frame) => frame !== first && frame !== last
    && frame.progress >= Math.max(first.progress + 4.5, departureZone)
    && frame.progress <= last.progress - 4.5);
  const chosen = [first, last];
  const targetGap = 7;
  const targetCount = Math.min(MAX_FRAMES, Math.ceil(total / targetGap) + 1);
  const canAdd = (frame) => !chosen.includes(frame)
    && chosen.every((item) => Math.abs(item.progress - frame.progress) >= 4.5);
  // Retain at most one real scene on each side of a turn. Reserving every
  // turn probe would exhaust a 25-scene preview and leave long straight gaps.
  const decisionGroups = new Map();
  for (const frame of middle.filter((item) => item.priority > 0
    && Number.isFinite(item.decisionProgress))) {
    const group = decisionGroups.get(frame.decisionProgress) || [];
    group.push(frame);
    decisionGroups.set(frame.decisionProgress, group);
  }
  for (const [progress, group] of decisionGroups) {
    const before = group.filter((frame) => frame.progress <= progress)
      .sort((a, b) => b.progress - a.progress)[0];
    const after = group.filter((frame) => frame.progress > progress)
      .sort((a, b) => a.progress - b.progress)[0];
    for (const frame of [before, after]) {
      if (chosen.length >= targetCount) break;
      if (frame && canAdd(frame)) chosen.push(frame);
    }
  }
  while (chosen.length < targetCount) {
    const candidate = middle.filter(canAdd)
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
  let routeDecisions = [];
  let destination = null;
  let destinationPinLocation = null;
  let destinationPinTitle = '';
  let startStationLocation = null;
  let startStationTitle = '';
  let selected = -1;
  let playing = false;
  let busy = false;
  let timer = null;
  let generation = 0;
  let arrivalRequest = 0;
  let groundPoints = [];
  let destinationMarker = null;
  let startStationMarker = null;
  let groundFrame = null;
  let groundRequest = 0;
  let projectionTimer = null;
  let sizeObserver = null;

  const clearGround = () => {
    window.clearTimeout(projectionTimer);
    projectionTimer = null;
    window.cancelAnimationFrame(groundRequest);
    groundRequest = 0;
    groundFrame = null;
    groundPoints = [];
    ground.replaceChildren();
  };
  const drawGround = () => {
    if (!groundFrame || !panorama || !groundPoints.length || canvas.hidden) return;
    const pov = panorama.getPov();
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height || !Number.isFinite(pov?.pan)) return;
    const points = groundPoints.map((point) => {
      const projected = projectOnPanoramaGround(groundFrame.camera, point, pov, box.width, box.height);
      return projected ? { ...projected, segmentIndex: point.segmentIndex } : null;
    });
    const runs = [];
    let current = [];
    for (const point of points) {
      if (!point || current.length && (point.segmentIndex !== current.at(-1).segmentIndex
        || Math.hypot(point.x - current.at(-1).x,
          point.y - current.at(-1).y) > Math.max(100, box.width * .26))) {
        if (current.length > 1) runs.push(current);
        current = [];
      }
      if (point) current.push(point);
    }
    if (current.length > 1) runs.push(current);
    const ribbons = runs.map((run) => {
      const sides = run.map((point, index) => {
        const before = run[Math.max(0, index - 1)];
        const after = run[Math.min(run.length - 1, index + 1)];
        const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
        const normalX = -(after.y - before.y) / length;
        const normalY = (after.x - before.x) / length;
        const radius = point.radius;
        return {
          left: [point.x + normalX * radius, point.y + normalY * radius],
          right: [point.x - normalX * radius, point.y - normalY * radius]
        };
      });
      const shape = [...sides.map((side) => side.left),
        ...sides.map((side) => side.right).reverse()];
      const coords = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
      let path = `M${coords(shape[0])}`;
      for (let index = 1; index < shape.length - 1; index += 1) {
        const current = shape[index];
        const next = shape[index + 1];
        path += ` Q${coords(current)} ${coords([(current[0] + next[0]) / 2,
          (current[1] + next[1]) / 2])}`;
      }
      return `${path} L${coords(shape.at(-1))} Z`;
    });
    ground.innerHTML = ribbons.length
      ? `<svg viewBox="0 0 ${box.width} ${box.height}" preserveAspectRatio="none" aria-hidden="true">${ribbons.map((path) =>
        `<path d="${path}" fill="#1685d3" fill-opacity=".8" stroke="#e9faff" stroke-opacity=".9" stroke-width="1.4" stroke-linejoin="round"/>`).join('')}</svg>`
      : '';
  };
  const scheduleGround = () => {
    window.clearTimeout(projectionTimer);
    projectionTimer = window.setTimeout(() => {
      if (!panorama || !groundFrame) return;
      if (destinationMarker?.getMap()) {
        destinationMarker.setMap(null);
        destinationMarker.setMap(panorama);
      }
      if (startStationMarker?.getMap()) {
        startStationMarker.setMap(null);
        startStationMarker.setMap(panorama);
      }
      window.cancelAnimationFrame(groundRequest);
      groundRequest = window.requestAnimationFrame(() => {
        groundRequest = window.requestAnimationFrame(drawGround);
      });
    }, 70);
  };
  const showGround = (frame) => {
    clearGround();
    if (!panorama || frame.routeOffset > CAMERA_TO_ROUTE_LIMIT_METERS) return;
    groundFrame = frame;
    const total = routeEdges.at(-1)?.to || 0;
    const start = Math.max(0, frame.progress - 18);
    const end = Math.min(total, frame.progress + 85);
    for (let progress = start; progress < end; progress += 2.5) {
      const point = candidateAt(routeEdges, progress);
      groundPoints.push(point);
    }
    scheduleGround();
  };
  const showStartStation = (frame) => {
    if (frame.phase !== 'departure' || !startStationLocation || !panorama
      || distanceMeters(frame.camera, startStationLocation) > 50) {
      startStationMarker?.setMap(null);
      return;
    }
    if (!startStationMarker) {
      startStationMarker = new maps.Marker({
        position: new maps.LatLng(startStationLocation.lat, startStationLocation.lng),
        title: startStationTitle,
        icon: {
          content: `<span class="walk-panorama-station" role="img" aria-label="출발역 출구">${startStationTitle.replace(/[<>&"']/g, '')} 출발</span>`,
          size: new maps.Size(112, 34), anchor: new maps.Point(56, 34)
        },
        zIndex: 490
      });
    }
    startStationMarker.setMap(null);
    startStationMarker.setMap(panorama);
  };
  const showDestination = (frame) => {
    if (frame.phase !== 'arrival' || !destinationPinLocation || !panorama
      || distanceMeters(frame.camera, destinationPinLocation) > 120) {
      destinationMarker?.setMap(null);
      return;
    }
    if (!destinationMarker) {
      destinationMarker = new maps.Marker({
        position: new maps.LatLng(destinationPinLocation.lat, destinationPinLocation.lng),
        title: destinationPinTitle || '목적지',
        icon: {
          content: '<span class="walk-panorama-arrival-arrow" role="img" aria-label="도보 경로 도착점"><svg viewBox="0 0 36 48" aria-hidden="true"><path d="M18 2 33 17v25a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V17L18 2Z" fill="#0868b7" stroke="white" stroke-width="3" stroke-linejoin="round"/></svg></span>',
          size: new maps.Size(36, 48), anchor: new maps.Point(18, 46)
        },
        zIndex: 500
      });
    }
    destinationMarker.setMap(null);
    destinationMarker.setMap(panorama);
  };

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
      maps.Event.addListener(panorama, 'pov_changed', scheduleGround),
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
    const gap = upcoming.progress - current.progress;
    const previewDelay = Math.max(1100, Math.min(3500, Math.round(gap * 260)));
    timer = window.setTimeout(() => { void showFrame(selected + 1); },
      sameTurn ? Math.min(previewDelay, 1400) : previewDelay);
  };
  const fallback = (message) => {
    pause();
    section.classList.remove('is-loading', 'is-switching');
    canvas.hidden = true;
    clearGround();
    destinationMarker?.setMap(null);
    startStationMarker?.setMap(null);
    turn.hidden = true;
    section.hidden = false;
    arrival.textContent = '';
    setStatus(`${message} 기존 지도에서 도보 경로를 확인해 주세요.`);
    selected = -1;
    updateControls();
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
    clearGround();
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
    turn.textContent = frame.phase === 'approach'
      ? `${frame.crossing ? '갈림길 · ' : ''}${beforeTurnMeters > 12
        ? `약 ${beforeTurnMeters}m 앞 ${frame.action}` : frame.action}`
      : frame.action === '좌회전' || frame.action === '우회전'
        ? `${frame.action} 후 진행` : '';
    turn.hidden = !['approach', 'after'].includes(frame.phase) || !turn.textContent;
    showGround(frame);
    showStartStation(frame);
    showDestination(frame);
    setStatus(`경로 미리보기 ${index + 1}/${frames.length}`);
    section.dataset.panoramaId = frame.panoId;
    section.dataset.cameraLat = frame.camera.lat.toFixed(7);
    section.dataset.cameraLng = frame.camera.lng.toFixed(7);
    section.dataset.routeOffsetMeters = frame.routeOffset.toFixed(1);
    section.dataset.progressMeters = frame.progress.toFixed(1);
    section.dataset.headingDegrees = applied.pan.toFixed(1);
    arrivalRequest += 1;
    if (index === frames.length - 1) verifyArrival(run);
    else {
      arrival.textContent = instructionForFrame(frame, routeDecisions, routeEdges.at(-1).to);
    }
    updateControls();
    scheduleNext();
  }

  const stop = () => {
    generation += 1;
    arrivalRequest += 1;
    pause();
    sizeObserver?.disconnect();
    sizeObserver = null;
    settlePending({ status: 'CANCELLED' });
    listeners.forEach((listener) => maps.Event.removeListener(listener));
    listeners = [];
    clearGround();
    destinationMarker?.setMap(null);
    destinationMarker = null;
    startStationMarker?.setMap(null);
    startStationMarker = null;
    panorama?.setVisible(false);
    panorama = null;
    canvas.replaceChildren();
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
    routeDecisions = [];
    destination = null;
    destinationPinLocation = null;
    destinationPinTitle = '';
    startStationLocation = null;
    startStationTitle = '';
    selected = -1;
    busy = false;
  };

  const start = async (route, end, options = {}) => {
    stop();
    const run = generation;
    destination = end && [end.lat, end.lng].every(Number.isFinite) ? end : null;
    destinationPinLocation = destination;
    destinationPinTitle = options.destinationTitle || '목적지';
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
    const { candidates, decisions } = routeCandidates(route, edges);
    if (!candidates.length) {
      fallback('이 도보 경로에는 확인된 회전·갈림길 판단 지점이 없습니다.');
      return;
    }
    routeEdges = edges;
    routeDecisions = decisions;
    const routeStart = edges[0].start;
    const routeEnd = edges.at(-1).end;
    destinationPinLocation = routeEnd;
    destinationPinTitle = '도보 경로 도착점';
    section.hidden = false;
    canvas.hidden = false;
    section.classList.add('is-loading');
    const startStationName = options.startIsStation
      ? options.startTitle?.match(/^(.+?역)(?:\s|\(|$)/)?.[1] : null;
    const destinationStationName = options.destinationTitle?.match(/^(.+?역)(?:\s|\(|$)/)?.[1];
    const [startExit, destinationExit] = await Promise.all([
      startStationName ? findStationExit(startStationName, routeStart, routeStart).catch(() => null) : null,
      destinationStationName && destination
        ? findStationExit(destinationStationName, routeEnd, destination).catch(() => null) : null
    ]);
    if (run !== generation) return;
    if (startExit) {
      startStationLocation = { lat: startExit.lat, lng: startExit.lng };
      startStationTitle = startStationName;
    }
    if (destinationExit && distanceMeters(destinationExit, routeEnd) <= 30) {
      destinationPinLocation = { lat: destinationExit.lat, lng: destinationExit.lng };
      destinationPinTitle = destinationExit.title;
    } else if (!destinationStationName && destination
      && distanceMeters(destination, routeEnd) <= 30) {
      destinationPinLocation = destination;
      destinationPinTitle = options.destinationTitle || '목적지';
    }
    if (window.ResizeObserver) {
      sizeObserver = new ResizeObserver(() => {
        if (!panorama) return;
        const bounds = canvas.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          panorama.setSize(new maps.Size(bounds.width, bounds.height));
          scheduleGround();
        }
      });
      sizeObserver.observe(canvas);
    }
    arrival.textContent = '경로 미리보기 · 실제 도착 판정과는 별개입니다.';
    updateControls();
    const verified = [];
    const ids = new Set();
    for (let index = 0; index < candidates.length; index += 1) {
      if (run !== generation) return;
      const candidate = candidates[index];
      setStatus('경로 미리보기 준비 중');
      const found = await query(() => {
        if (index === 0) {
          panorama = new maps.Panorama(canvas, {
            position: new maps.LatLng(candidate.lat, candidate.lng),
            pov: { pan: 0, tilt: 0, fov: 95 },
            flightSpot: false,
            logoControl: false
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
    frames = selectFrames(verified, edges.at(-1).to, startStationLocation);
    if (!frames.length) {
      fallback('출발지와 도착지 주변 모두에서 실제 경로와 방향이 확인된 로드뷰가 부족합니다.');
      return;
    }
    if (startStationLocation && distanceMeters(frames[0].camera, startStationLocation) <= 45) {
      const routePan = frames[0].pov.pan;
      const exitPan = headingDegrees(frames[0].camera, startStationLocation);
      if (angleDifference(routePan, exitPan) <= 115) {
        frames[0].pov = { ...frames[0].pov, pan: routePan + signedAngle(routePan, exitPan) * .7, fov: 120 };
      }
    }
    await showFrame(0);
    return selected === 0;
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
  return { start, stop, pause };
}
