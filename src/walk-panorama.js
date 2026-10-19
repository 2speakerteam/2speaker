import { createPanoramaProbe } from './panorama-probe.js?v=20261017-panorama-isolation-2';
import { createWalkPanoramaBuffer } from './walk-panorama-buffer.js?v=20261019-walk-flow-1';
import { walkingViewPov, walkingPlaybackTiming } from './walk-panorama-motion.js?v=20261019-walk-flow-1';
import { createWalkMiniMap } from './walk-mini-map.js?v=20261016-route-arrow-sync-1';
import { bindBoardingPanoramaGestures } from './boarding-panorama-gestures.js?v=20261019-boarding-direction-hold-1';
import { createBoardingPanoramaTravel } from './boarding-panorama-travel.js?v=20261019-boarding-direction-hold-1';
import { createWalkRouteArrowLayer } from './walk-route-arrow-layer.js?v=20261018-arrow-rendered-ground-2';

const CAMERA_TO_ROUTE_LIMIT_METERS = 15;
const CAMERA_TO_REQUEST_LIMIT_METERS = 25;
const ROUTE_PROGRESS_LIMIT_METERS = 25;
const PROBE_SPACING_METERS = 5;
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
  let segmentIndex = 0;
  let previousEnd = null;
  for (const segment of segments) {
    if (!Array.isArray(segment.coordinates)) continue;
    const [firstLng, firstLat] = segment.coordinates[0] || [];
    const first = { lat: firstLat, lng: firstLng };
    if (previousEnd && Number.isFinite(first.lat) && Number.isFinite(first.lng)
      && distanceMeters(previousEnd, first) > 1) segmentIndex += 1;
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
    const [lastLng, lastLat] = segment.coordinates.at(-1) || [];
    if (Number.isFinite(lastLat) && Number.isFinite(lastLng)) {
      previousEnd = { lat: lastLat, lng: lastLng };
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

function routeCandidates(route, edges) {
  const total = edges.at(-1).to;
  const decisions = [];
  const junctions = [];
  const addDecision = (progress, priority, crossing = false) => {
    if (progress < 10 || progress > total - 6) return;
    const before = candidateAt(edges, progress - 8);
    const at = candidateAt(edges, progress);
    const after = candidateAt(edges, Math.min(total, progress + 10));
    const turn = signedAngle(headingDegrees(before, at), headingDegrees(at, after));
    const action = turn < -25 ? '좌회전' : turn > 25 ? '우회전' : '직진';
    if (action === '직진') return;
    decisions.push({ progress, priority, action, crossing, turn });
  };
  for (const guide of Array.isArray(route.guidePoints) ? route.guidePoints : []) {
    if (![guide.lat, guide.lng].every(Number.isFinite)) continue;
    const crossing = guide.turnType >= 211 && guide.turnType <= 217;
    const turning = [12, 13, 14, 16, 17, 18, 19].includes(guide.turnType);
    const straight = guide.turnType === 11;
    if (!crossing && !turning && !straight) continue;
    const near = closestRoutePosition(guide, edges);
    if (near.distance > 8) continue;
    junctions.push(near.progress);
    if (!straight) addDecision(near.progress, crossing ? 3 : 4, crossing);
  }
  for (let index = 0; index < edges.length - 1; index += 1) {
    const progress = edges[index].to;
    if (progress < 12 || progress > total - 12) continue;
    const before = candidateAt(edges, progress - 8);
    const at = candidateAt(edges, progress);
    const after = candidateAt(edges, progress + 8);
    if (angleDifference(headingDegrees(before, at), headingDegrees(at, after)) >= 50) {
      addDecision(progress, 2);
      junctions.push(progress);
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
  for (let progress = 0; progress < total; progress += PROBE_SPACING_METERS) addProbe(progress);
  addProbe(total);
  for (const decision of ordered) {
    for (const offset of [-18, -10, -4, 6, 12, 20]) {
      if (decision.progress + offset > 0 && decision.progress + offset < total) {
        addProbe(decision.progress + offset, decision);
      }
    }
  }
  const candidates = probes.sort((a, b) => b.priority - a.priority)
    .filter((probe, index, all) => !all.slice(0, index).some((other) =>
      Math.abs(other.progress - probe.progress) < 3))
    .sort((a, b) => a.progress - b.progress);
  return { candidates, decisions: ordered, junctions };
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

function arrowTargetForFrame(frame, decisions, edges) {
  if (frame.phase === 'arrival') return null;
  const next = decisions.find((decision) => decision.priority >= 3
    && decision.progress >= frame.progress - 2);
  const afterTurn = next && !next.crossing && next.progress - frame.progress <= 20;
  const fromProgress = afterTurn ? next.progress : frame.progress;
  const toProgress = Math.min(edges.at(-1).to, fromProgress + 8);
  if (toProgress - fromProgress < 2) return null;
  return headingDegrees(candidateAt(edges, fromProgress), candidateAt(edges, toProgress));
}

function nativeArrowAngle(image) {
  const transform = image.parentElement?.style.transform || '';
  const match = /^matrix3d\(([^)]+)\)$/.exec(transform);
  if (!match) return null;
  const values = match[1].split(',').map(Number);
  if (values.length !== 16 || !Number.isFinite(values[0]) || !Number.isFinite(values[2])) {
    return null;
  }
  return Math.atan2(values[2], values[0]) / radians;
}

const stationExitRequests = new Map();
export async function findStationExit(stationName, routePoint, stationPoint) {
  let cached = stationExitRequests.get(stationName);
  if (!cached || Date.now() - cached.createdAt > 60000) {
    const request = fetch('/api/map/place', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `${stationName} 출구` })
    }).then(async (response) => {
      if (!response.ok) throw new Error('Station lookup failed');
      const payload = await response.json();
      return Array.isArray(payload.places) ? payload.places : [];
    });
    cached = { request, createdAt: Date.now() };
    if (stationExitRequests.size >= 32) stationExitRequests.delete(stationExitRequests.keys().next().value);
    stationExitRequests.set(stationName, cached);
  }
  let places;
  try { places = await cached.request; }
  catch {
    if (stationExitRequests.get(stationName) === cached) stationExitRequests.delete(stationName);
    return null;
  }
  return places
    .filter((place) => place.category === '교통시설>지하철출구번호'
      && place.title?.startsWith(stationName)
      && Number.isFinite(place.lat) && Number.isFinite(place.lng)
      && distanceMeters(place, stationPoint) <= 160
      && distanceMeters(place, routePoint) <= 120)
    .sort((a, b) => distanceMeters(a, routePoint) - distanceMeters(b, routePoint))[0] || null;
}

export function createWalkPanorama(maps, section) {
  const canvas = section?.querySelector('.walk-panorama-canvas');
  const view = section?.querySelector('.walk-panorama-view');
  const turn = section?.querySelector('.walk-panorama-turn');
  const status = section?.querySelector('.walk-panorama-status');
  const arrival = section?.querySelector('.walk-panorama-arrival');
  const previous = section?.querySelector('[data-panorama-action="previous"]');
  const playback = section?.querySelector('[data-panorama-action="playback"]');
  const next = section?.querySelector('[data-panorama-action="next"]');
  if (!section || !canvas || !view || !turn || !status || !arrival || !previous || !playback || !next) {
    return { start() {}, stop() {} };
  }
  const miniMap = createWalkMiniMap(maps, section);

  let panorama = null;
  let walkBuffer = null;
  let routeArrowLayer = null;
  let arrowPoseRefresh = null;
  let arrowPoseRefreshUntil = 0;
  let listeners = [];
  let pending = null;
  let frames = [];
  let routeEdges = [];
  let routeDecisions = [];
  let routeJunctions = [];
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
  let destinationMarker = null;
  let startStationMarker = null;
  let markerRefreshTimer = null;
  let sizeObserver = null;
  let nativeArrowObserver = null;
  let nativeArrowTarget = null;
  let nativeArrowContainer = null;
  let arrowFrame = null;
  let switchingFrame = null;
  let probe = null;
  let preparing = false;
  let preparationDone = true;
  let prepareAhead = () => {};
  let boardingBaseFov = 95;
  const createViewer = (options) => {
    const width = view.clientWidth;
    const height = view.clientHeight;
    if (width <= 0 || height <= 0) throw new Error('Roadview viewport has no size.');
    // The SDK hides its mount and leaves its own input listeners on that mount.
    // Retire the mount with the viewer instead of reusing it for another mode.
    const host = document.createElement('div');
    host.className = 'walk-panorama-renderer';
    host.style.cssText = 'position:absolute;inset:0;';
    canvas.replaceChildren(host);
    section.dataset.sdkInitialWidth = String(width);
    section.dataset.sdkInitialHeight = String(height);
    return new maps.Panorama(host, { ...options, size: new maps.Size(width, height) });
  };
  const resize = () => {
    if (!panorama) return;
    const width = view.clientWidth;
    const height = view.clientHeight;
    if (width <= 0 || height <= 0) return;
    if (walkBuffer) walkBuffer.resize(width, height);
    else panorama.setSize(new maps.Size(width, height));
    section.dataset.sdkWidth = String(width);
    section.dataset.sdkHeight = String(height);
    scheduleMarkerRefresh();
  };
  const nativeArrowStyle = document.createElement('style');
  section.appendChild(nativeArrowStyle);
  const clearNativeArrow = (preserveArrowLayer = false) => {
    if (!preserveArrowLayer) routeArrowLayer?.clear();
    nativeArrowTarget = null;
    arrowFrame = null;
    nativeArrowContainer = null;
    nativeArrowStyle.textContent = '';
    canvas.querySelectorAll('img.arrow_image.walk-panorama-native-active')
      .forEach((image) => image.classList.remove('walk-panorama-native-active'));
  };
  const paintNativeArrow = (refreshPose = false) => {
    if (!Number.isFinite(nativeArrowTarget) || !panorama || !arrowFrame
      || panorama.getPanoId() !== arrowFrame.panoId) return;
    const cameraPov = panorama.getPov();
    const cameraBearing = cameraPov?.pan;
    if (!Number.isFinite(cameraBearing)) return;
    const targetAngle = signedAngle(cameraBearing, nativeArrowTarget);
    const arrows = [...panorama.getElement().querySelectorAll('img.arrow_image')];
    const bounds = canvas.getBoundingClientRect();
    const candidates = arrows.map((image) => ({ image, angle: nativeArrowAngle(image) }))
      .filter(({ image, angle }) => {
        const rect = image.getBoundingClientRect();
        return angle !== null && angleDifference(angle, targetAngle) <= 15
          && rect.width > 0 && rect.height > 0 && rect.right > bounds.left
          && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom;
      })
      .sort((a, b) => angleDifference(a.angle, targetAngle)
        - angleDifference(b.angle, targetAngle));
    const chosen = candidates[0] || null;
    const container = chosen?.image.parentElement && [...chosen.image.parentElement.classList]
      .find((name) => /^arrow_container_#\d+$/.test(name)) || null;
    if (container !== nativeArrowContainer) {
      nativeArrowContainer = container;
      nativeArrowStyle.textContent = container
        ? `.walk-panorama-canvas [class~="${container}"] img.arrow_image { filter: var(--walk-arrow-color) !important; }`
        : '';
    }
    arrows.forEach((image) => {
      const active = image.classList.contains('walk-panorama-native-active');
      if (image === chosen?.image && !active) image.classList.add('walk-panorama-native-active');
      else if (image !== chosen?.image && active) image.classList.remove('walk-panorama-native-active');
    });
    if (routeArrowLayer) {
      const decision = routeDecisions.find((item) => item.priority >= 3 && !item.crossing
        && item.progress >= arrowFrame.progress - 2 && item.progress <= arrowFrame.progress + 20);
      const followCamera = refreshPose || performance.now() < arrowPoseRefreshUntil;
      routeArrowLayer.show(chosen?.image, decision?.progress ?? 'straight', followCamera && !busy && !switchingFrame, arrowFrame.panoId, targetAngle, cameraPov, panorama.getElement());
    }
    if (routeEdges.length) {
      const position = candidateAt(routeEdges, arrowFrame.progress);
      const bearing = chosen ? cameraBearing + chosen.angle : nativeArrowTarget;
      miniMap.update(position, bearing, !chosen);
    }
  };
  const showNativeArrow = (frame) => {
    canvas.classList.toggle('is-arrival', frame.phase === 'arrival');
    arrowFrame = frame;
    nativeArrowTarget = arrowTargetForFrame(frame, routeDecisions, routeEdges);
    if (Number.isFinite(nativeArrowTarget)) paintNativeArrow();
    else {
      clearNativeArrow();
      const position = candidateAt(routeEdges, frame.progress);
      miniMap.update(position, frame.pov.pan, true);
    }
  };
  const scheduleMarkerRefresh = () => {
    window.clearTimeout(markerRefreshTimer);
    markerRefreshTimer = window.setTimeout(() => {
      if (destinationMarker?.getMap()) {
        destinationMarker.setMap(null);
        destinationMarker.setMap(panorama);
      }
      if (startStationMarker?.getMap()) {
        startStationMarker.setMap(null);
        startStationMarker.setMap(panorama);
      }
    }, 70);
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
          content: '<span class="walk-panorama-pin" role="img" aria-label="목적지"><svg viewBox="0 0 34 44" aria-hidden="true"><path d="M17 42C12 35 3 25 3 17a14 14 0 0 1 28 0c0 8-9 18-14 25Z" fill="#080b10" stroke="white" stroke-width="2"/><circle cx="17" cy="17" r="5" fill="white"/></svg></span>',
          size: new maps.Size(34, 44), anchor: new maps.Point(17, 44)
        },
        zIndex: 500
      });
    }
    destinationMarker.setMap(null);
    destinationMarker.setMap(panorama);
  };

  const setStatus = (message) => { status.textContent = message; };
  const updateControls = () => {
    const atEnd = preparationDone && selected >= 0 && selected >= frames.length - 1;
    previous.disabled = busy || selected <= 0;
    next.disabled = busy || selected < 0 || selected >= frames.length - 1;
    playback.disabled = (busy && !playing) || selected < 0 || (atEnd && frames.length < 2);
    playback.classList.toggle('is-replay', atEnd && frames.length >= 2);
    playback.textContent = playing ? '일시정지' : atEnd ? '다시 재생' : '재생';
    playback.setAttribute('aria-label', playing ? '로드뷰 일시정지' : atEnd ? '로드뷰 다시 재생' : '로드뷰 재생');
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
      maps.Event.addListener(panorama, 'pov_changed', () => {
        if (busy && switchingFrame) return;
        scheduleMarkerRefresh();
        if (routeArrowLayer && !busy && !switchingFrame) routeArrowLayer.setPov(panorama.getPov());
        if (routeArrowLayer && !busy && !switchingFrame) arrowPoseRefreshUntil = performance.now() + 80;
        paintNativeArrow();
        if (routeArrowLayer && !busy && !switchingFrame) {
          const run = generation;
          if (arrowPoseRefresh !== null) cancelAnimationFrame(arrowPoseRefresh);
          arrowPoseRefresh = requestAnimationFrame(() => {
            arrowPoseRefresh = null;
            if (run === generation && routeArrowLayer && !busy && !switchingFrame) paintNativeArrow(true);
          });
        }
      }),
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
        if (!pending) {
          if (section.classList.contains('is-boarding')) {
            const coordinate = panorama.getLocation()?.coord;
            section.dataset.panoramaId = panorama.getPanoId();
            if (coordinate) {
              section.dataset.cameraLat = coordinate.lat().toFixed(7);
              section.dataset.cameraLng = coordinate.lng().toFixed(7);
            }
            return;
          }
          if (!switchingFrame && selected >= 0 && panorama.getPanoId() !== frames[selected]?.panoId) {
            miniMap.suspend();
            clearNativeArrow();
          }
          return;
        }
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
    walkBuffer?.stopGlide();
    clearTimer();
    updateControls();
  };
  const scheduleNext = () => {
    clearTimer();
    if (!playing || selected >= frames.length - 1) {
      if (playing && preparationDone) pause();
      else if (playing) void prepareAhead();
      return;
    }
    const current = frames[selected];
    const upcoming = frames[selected + 1];
    const timing = walkingPlaybackTiming(current, upcoming);
    const nearJunction = routeJunctions.some((progress) =>
      upcoming.progress >= progress - 18 && current.progress <= progress + 8);
    walkBuffer?.glide(timing.holdMs + (nearJunction ? 300 : 0), pov => routeArrowLayer?.setPov(pov));
    timer = window.setTimeout(() => { timer = null; void showFrame(selected + 1); },
      timing.holdMs + (nearJunction ? 300 : 0));
  };
  const fallback = (message) => {
    pause();
    miniMap.stop();
    canvas.classList.remove('is-arrival');
    section.classList.remove('is-loading', 'is-switching');
    canvas.hidden = true;
    clearNativeArrow();
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
    const previousFrame = Math.abs(index - selected) === 1 ? frames[selected] : null;
    const viewPov = walkingViewPov(previousFrame, frame, walkBuffer?.viewPov() || panorama.getPov());
    const displayFrame = { ...frame, pov: viewPov };
    const timing = walkingPlaybackTiming(previousFrame, frame, !playing);
    let buffered = false;
    const matchesFrame = (found, expected) => found.status === 'OK'
      && found.panoId === expected.panoId;
    busy = true;
    arrowPoseRefreshUntil = 0;
    switchingFrame = frame;
    if (!walkBuffer || selected < 0) miniMap.suspend();
    clearNativeArrow(true);
    updateControls();
    const currentCoord = panorama.getLocation()?.coord;
    if (walkBuffer && selected >= 0 && panorama.getPanoId() !== frame.panoId) {
      const preparedViewer = await walkBuffer.show(displayFrame, {
        durationMs: timing.transitionMs, fromPov: panorama.getPov(),
        onPov: pov => routeArrowLayer?.setPov(pov)
      });
      if (run !== generation) return;
      if (!preparedViewer) {
        busy = false;
        switchingFrame = null;
        pause();
        showNativeArrow(frames[selected]);
        arrival.textContent = '다음 로드뷰 장면을 불러오지 못했습니다. 다음을 눌러 다시 시도해 주세요.';
        return;
      }
      listeners.forEach(listener => maps.Event.removeListener(listener));
      panorama = preparedViewer;
      buffered = true;
      attachListeners();
    }
    const displayedCoord = panorama.getLocation()?.coord || currentCoord;
    let found = panorama.getPanoId() === frame.panoId && displayedCoord
      ? { status: 'OK', panoId: frame.panoId, camera: { lat: displayedCoord.lat(), lng: displayedCoord.lng() } }
      : await query(() => panorama.setPanoIdWithPov(frame.panoId, viewPov));
    if (run !== generation) return;
    if (!matchesFrame(found, frame)) {
      found = await query(() => panorama.setPanoIdWithPov(frame.panoId, viewPov));
      if (run !== generation) return;
    }
    if (!matchesFrame(found, frame) && selected >= 0) {
      const previousFrame = frames[selected];
      switchingFrame = previousFrame;
      const restored = await query(() => panorama.setPanoIdWithPov(previousFrame.panoId, previousFrame.pov));
      if (run !== generation) return;
      busy = false;
      switchingFrame = null;
      pause();
      section.classList.remove('is-switching');
      canvas.hidden = false;
      if (matchesFrame(restored, previousFrame)) {
        panorama.setPov(previousFrame.pov);
        showNativeArrow(previousFrame);
      }
      setStatus('경로보기');
      arrival.textContent = '다음 로드뷰 장면을 불러오지 못했습니다. 다음을 눌러 다시 시도해 주세요.';
      updateControls();
      return;
    }
    busy = false;
    switchingFrame = null;
    if (!matchesFrame(found, frame)) {
      fallback('첫 로드뷰 장면을 확인할 수 없습니다.');
      return;
    }
    let applied = panorama.getPov();
    if (!Number.isFinite(applied?.pan) || (!buffered && angleDifference(applied.pan, viewPov.pan) > 5)) {
      panorama.setPov(viewPov);
      applied = panorama.getPov();
    }
    if (!Number.isFinite(applied?.pan)) {
      fallback('실제 도보 진행 방향으로 로드뷰 시야를 맞출 수 없습니다.');
      return;
    }
    selected = index;
    canvas.hidden = false;
    turn.textContent = '';
    turn.hidden = true;
    showStartStation(frame);
    showDestination(frame);
    setStatus('경로보기');
    section.dataset.panoramaId = frame.panoId;
    section.dataset.cameraLat = frame.camera.lat.toFixed(7);
    section.dataset.cameraLng = frame.camera.lng.toFixed(7);
    section.dataset.routeOffsetMeters = frame.routeOffset.toFixed(1);
    section.dataset.progressMeters = frame.progress.toFixed(1);
    section.dataset.headingDegrees = applied.pan.toFixed(1);
    arrivalRequest += 1;
    if (preparationDone && index === frames.length - 1 && frame.phase === 'arrival') verifyArrival(run);
    else if (preparationDone && index === frames.length - 1) {
      arrival.textContent = '확인된 로드뷰 구간의 끝입니다. 남은 도보 경로는 지도에서 확인하세요.';
    }
    else if (index === 0 && frame.phase !== 'departure') {
      arrival.textContent = `출발 후 약 ${Math.round(frame.progress)}m 지점부터 로드뷰가 있습니다. 처음 구간은 지도에서 확인하세요. ${instructionForFrame(frame, routeDecisions, routeEdges.at(-1).to)}`;
    } else {
      arrival.textContent = instructionForFrame(frame, routeDecisions, routeEdges.at(-1).to);
    }
    showNativeArrow(frame);
    section.classList.remove('is-switching');
    updateControls();
    scheduleNext();
    if (frames[selected + 1]) walkBuffer?.prefetch({ ...frames[selected + 1],
      pov: walkingViewPov(frame, frames[selected + 1], walkBuffer?.viewPov() || panorama.getPov()) });
    void prepareAhead();
  }

  const stop = () => {
    generation += 1;
    miniMap.stop();
    probe?.stop();
    probe = null;
    preparing = false;
    preparationDone = true;
    prepareAhead = () => {};
    switchingFrame = null;
    arrivalRequest += 1;
    pause();
    sizeObserver?.disconnect();
    sizeObserver = null;
    nativeArrowObserver?.disconnect();
    nativeArrowObserver = null;
    clearNativeArrow();
    if (arrowPoseRefresh !== null) cancelAnimationFrame(arrowPoseRefresh);
    arrowPoseRefresh = null;
    arrowPoseRefreshUntil = 0;
    routeArrowLayer?.stop();
    routeArrowLayer = null;
    canvas.classList.remove('is-arrival');
    settlePending({ status: 'CANCELLED' });
    listeners.forEach((listener) => maps.Event.removeListener(listener));
    listeners = [];
    window.clearTimeout(markerRefreshTimer);
    markerRefreshTimer = null;
    destinationMarker?.setMap(null);
    destinationMarker = null;
    startStationMarker?.setMap(null);
    startStationMarker = null;
    if (walkBuffer) walkBuffer.stop();
    else {
      panorama?.setVisible(false);
      panorama?.destroy?.();
    }
    walkBuffer = null;
    panorama = null;
    canvas.replaceChildren();
    canvas.removeAttribute('style');
    turn.hidden = true;
    canvas.hidden = false;
    section.hidden = true;
    section.classList.remove('is-loading', 'is-switching', 'is-preloading', 'is-boarding');
    boardingGestures.reset();
    boardingTravel.reset();
    boardingBaseFov = 95;
    delete section.dataset.entryReady;
    delete section.dataset.boardingMode;
    for (const key of ['panoramaId', 'cameraLat', 'cameraLng', 'routeOffsetMeters', 'progressMeters', 'headingDegrees', 'firstFrameMs', 'sdkInitialWidth', 'sdkInitialHeight', 'sdkWidth', 'sdkHeight']) {
      delete section.dataset[key];
    }
    arrival.textContent = '';
    frames = [];
    routeEdges = [];
    routeDecisions = [];
    routeJunctions = [];
    destination = null;
    destinationPinLocation = null;
    destinationPinTitle = '';
    startStationLocation = null;
    startStationTitle = '';
    selected = -1;
    busy = false;
  };

  const startPoint = async ({ point, title, mode }) => {
    stop();
    const run = generation;
    if (!maps.Panorama || !point || ![point.lat, point.lng].every(Number.isFinite)) return false;
    section.hidden = false;
    section.classList.add('is-preloading', 'is-boarding');
    section.dataset.boardingMode = mode;
    arrival.textContent = `${title} · 확인된 탑승 지점 주변 로드뷰`;
    setStatus('탑승 위치 보기');
    try {
      panorama = createViewer({
        pov: { pan: 0, tilt: 0, fov: 95 }, flightSpot: false, logoControl: false,
        minZoom: 0, maxZoom: 4, zoomControl: false
      });
      attachListeners();
      const found = await query(() => panorama.setPosition(new maps.LatLng(point.lat, point.lng)));
      if (run !== generation) return false;
      if (found.status !== 'OK' || !found.panoId || !found.camera
        || distanceMeters(found.camera, point) > 80) {
        stop();
        return false;
      }
      const lookingAt = panorama.getProjection()?.fromCoordToPov(new maps.LatLng(point.lat, point.lng));
      const pan = Number.isFinite(lookingAt?.pan)
        ? lookingAt.pan : headingDegrees(found.camera, point);
      panorama.setPov({ pan, tilt: 0, fov: 95 });
      boardingBaseFov = panorama.getPov().fov;
      const safeTitle = String(title || '탑승 위치').replace(/[<>&"']/g, '').slice(0, 70);
      destinationMarker = new maps.Marker({
        position: new maps.LatLng(point.lat, point.lng), title: safeTitle,
        icon: {
          content: `<span class="walk-panorama-station" role="img" aria-label="탑승 위치">${safeTitle}</span>`,
          size: new maps.Size(140, 34), anchor: new maps.Point(70, 34)
        },
        zIndex: 500
      });
      destinationMarker.setMap(panorama);
      if (window.ResizeObserver) {
        sizeObserver = new ResizeObserver(resize);
        sizeObserver.observe(view);
      }
      section.dataset.panoramaId = found.panoId;
      section.dataset.cameraLat = found.camera.lat.toFixed(7);
      section.dataset.cameraLng = found.camera.lng.toFixed(7);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (run !== generation) return false;
      section.dataset.entryReady = 'true';
      return true;
    } catch {
      if (run === generation) stop();
      return false;
    }
  };

  const start = async (route, end, options = {}) => {
    stop();
    if (options.preload) section.classList.add('is-preloading');
    const run = generation;
    destination = end && [end.lat, end.lng].every(Number.isFinite) ? end : null;
    destinationPinLocation = destination;
    destinationPinTitle = options.destinationTitle || '목적지';
    if (!maps.Panorama || !Array.isArray(route?.segments)) {
      fallback('네이버 로드뷰를 불러올 수 없습니다.');
      return;
    }
    if (!Number.isFinite(route.distanceMeters) || route.distanceMeters <= 0) {
      fallback('실제 도보 경로의 거리를 확인할 수 없습니다.');
      return;
    }
    const edges = walkEdges(route.segments);
    if (!edges.length) {
      fallback('로드뷰 위치와 대조할 실제 도보 경로 좌표가 부족합니다.');
      return;
    }
    const { candidates, decisions, junctions } = routeCandidates(route, edges);
    if (!candidates.length) {
      fallback('이 도보 경로에는 확인된 회전·갈림길 판단 지점이 없습니다.');
      return;
    }
    routeEdges = edges;
    routeDecisions = decisions;
    routeJunctions = junctions;
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
    if (startStationName && options.startStationLocation
      && [options.startStationLocation.lat, options.startStationLocation.lng].every(Number.isFinite)) {
      startStationLocation = options.startStationLocation;
      startStationTitle = startStationName;
    }
    // Station markers must not hold up the first Roadview frame.
    void Promise.all([
      startStationName && !startStationLocation
        ? findStationExit(startStationName, routeStart, routeStart).catch(() => null) : null,
      destinationStationName && destination
        ? findStationExit(destinationStationName, routeEnd, destination).catch(() => null) : null
    ]).then(([startExit, destinationExit]) => {
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
      if (selected >= 0) {
        showStartStation(frames[selected]);
        showDestination(frames[selected]);
      }
    });
    if (window.ResizeObserver) {
      sizeObserver = new ResizeObserver(resize);
      sizeObserver.observe(view);
    }
    arrival.textContent = '실제 도착 판정과는 별개입니다.';
    updateControls();
    const ids = new Set();
    let cursor = 0;
    const startedAt = performance.now();
    const endpointZone = Math.min(65, Math.max(30, edges.at(-1).to * .08));
    preparationDone = false;
    const readCandidate = async (useProbe) => {
      const candidate = candidates[cursor++];
      const from = candidateAt(edges, Math.max(0, candidate.progress - 2));
      const ahead = candidateAt(edges, candidate.phase === 'approach'
        ? Math.min(candidate.decisionProgress, candidate.progress + 6)
        : Math.min(candidate.windowEnd, candidate.progress + 6));
      if (distanceMeters(from, ahead) < 2) return null;
      let found;
      if (useProbe) {
        if (!probe) probe = createPanoramaProbe(maps, PANORAMA_TIMEOUT_MS);
        found = await probe.lookup(candidate, ahead);
      } else {
        found = await query(() => {
          if (!panorama) {
            panorama = createViewer({
              pov: { pan: 0, tilt: 0, fov: 95 }, flightSpot: false, logoControl: false,
              minZoom: 0, maxZoom: 2, zoomControl: false,
              zoomControlOptions: { position: maps.Position.TOP_RIGHT, style: maps.ZoomControlStyle.SMALL }
            });
            attachListeners();
          }
          panorama.setPosition(new maps.LatLng(candidate.lat, candidate.lng));
        });
      }
      if (run !== generation) return null;
      if (found.status !== 'OK' || !found.panoId || !found.camera
        || ![found.camera.lat, found.camera.lng].every(Number.isFinite) || ids.has(found.panoId)) return null;
      const routePosition = closestRoutePosition(found.camera, edges, candidate.progress);
      if (distanceMeters(found.camera, candidate) > CAMERA_TO_REQUEST_LIMIT_METERS
        || routePosition.distance > CAMERA_TO_ROUTE_LIMIT_METERS
        || Math.abs(routePosition.progress - candidate.progress) > ROUTE_PROGRESS_LIMIT_METERS
        || (frames.length && routePosition.progress <= frames.at(-1).progress + 1)) return null;
      const projectedPan = useProbe ? found.projectedPan
        : panorama.getProjection()?.fromCoordToPov(new maps.LatLng(ahead.lat, ahead.lng))?.pan;
      const routeHeading = headingDegrees(from, ahead);
      if (!Number.isFinite(projectedPan)
        || angleDifference(projectedPan, headingDegrees(found.camera, ahead)) > 25
        || angleDifference(projectedPan, routeHeading) > 80) return null;
      ids.add(found.panoId);
      return {
        ...found, progress: routePosition.progress, decisionProgress: candidate.decisionProgress,
        routeOffset: routePosition.distance, priority: candidate.priority, action: candidate.action,
        crossing: candidate.crossing, phase: candidate.phase,
        pov: { pan: routeHeading, tilt: 0, fov: 95 }
      };
    };
    // Only the first valid scene is required before opening Roadview.
    while (cursor < candidates.length && !frames.length) {
      const frame = await readCandidate(false);
      if (run !== generation) return false;
      if (frame) frames.push({ ...frame, phase: frame.progress <= endpointZone ? 'departure' : frame.phase });
    }
    if (!frames.length) {
      preparationDone = true;
      fallback('실제 도보 경로와 방향이 확인된 로드뷰 장면이 부족합니다.');
      return false;
    }
    prepareAhead = async () => {
      if (run !== generation || preparing || preparationDone) return;
      preparing = true;
      try {
        // This is a look-ahead buffer, not a route/scene limit. Continue as the viewer advances.
        while (run === generation && cursor < candidates.length && frames.length - selected - 1 < 8) {
          const frame = await readCandidate(true);
          if (run !== generation) return;
          if (frame) {
            frames.push(frame);
            if (!busy && frames.length === selected + 2) walkBuffer?.prefetch({ ...frame,
              pov: walkingViewPov(frames[selected], frame, walkBuffer?.viewPov() || panorama?.getPov()) });
            updateControls();
            if (playing && !busy && timer === null) scheduleNext();
          }
        }
        if (run !== generation) return;
        if (cursor >= candidates.length) {
          preparationDone = true;
          probe?.stop();
          probe = null;
          if (edges.at(-1).to - frames.at(-1).progress <= endpointZone) frames.at(-1).phase = 'arrival';
          if (selected === frames.length - 1 && !busy) {
            pause();
            showDestination(frames[selected]);
            showNativeArrow(frames[selected]);
            if (frames[selected].phase === 'arrival') verifyArrival(run);
            else arrival.textContent = '확인된 로드뷰 구간의 끝입니다. 남은 도보 경로는 지도에서 확인하세요.';
          }
          updateControls();
        }
      } catch {
        if (run === generation) {
          preparationDone = true;
          probe?.stop();
          probe = null;
          pause();
          arrival.textContent = '다음 로드뷰 준비에 실패했습니다. 지도에서 남은 경로를 확인해 주세요.';
        }
      } finally {
        if (run === generation) preparing = false;
      }
    };
    nativeArrowObserver = new MutationObserver((changes) => {
      if (changes.some((change) => change.type === 'attributes'
        ? change.target.matches?.('img.arrow_image, [class*="arrow_container_#"]')
        : [...change.addedNodes, ...change.removedNodes].some((node) => node.nodeType === 1
          && (node.matches?.('img.arrow_image, [class*="arrow_container_#"]')
            || node.querySelector?.('img.arrow_image'))))) {
        paintNativeArrow();
      }
    });
    nativeArrowObserver.observe(canvas, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['style', 'class', 'src']
    });
    section.classList.remove('is-loading');
    setStatus('경로보기');
    routeArrowLayer = createWalkRouteArrowLayer(canvas, view);
    walkBuffer = createWalkPanoramaBuffer(maps, canvas, view, panorama);
    await showFrame(0);
    if (run !== generation) return false;
    // Let the SDK paint the first scene before the page reveals this viewer.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (run !== generation) return false;
    section.dataset.firstFrameMs = String(Math.round(performance.now() - startedAt));
    if (selected === 0) {
      window.setTimeout(() => {
        if (run !== generation || selected < 0) return;
        try { miniMap.start(route.segments); }
        catch { miniMap.stop(); }
      }, 0);
    }
    return selected === 0;
  };

  // Native Roadview arrows can leave the verified walking route. Keep arrow taps
  // on the same validated frame sequence used by the mini map and Next button.
  let lastArrowTap = 0;
  const handleRouteArrow = (event) => {
    if (section.classList.contains('is-boarding')) return;
    const arrow = event.target.closest?.('img.arrow_image, [class*="arrow_container_#"]');
    if (!arrow) return;
    const image = arrow.matches('img.arrow_image') ? arrow : arrow.querySelector('img.arrow_image');
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!image?.classList.contains('walk-panorama-native-active') || busy) return;
    if (event.type === 'click' && event.detail !== 0) return;
    if (Date.now() - lastArrowTap < 500) return;
    lastArrowTap = Date.now();
    pause();
    void showFrame(selected + 1);
  };
  view.addEventListener('pointerdown', handleRouteArrow, true);
  view.addEventListener('click', handleRouteArrow, true);

  const boardingTravel = createBoardingPanoramaTravel({
    maps,
    isActive: () => section.classList.contains('is-boarding') && panorama
      && ['subway', 'bus', 'taxi'].includes(section.dataset.boardingMode)
      && section.dataset.entryReady === 'true' && !section.classList.contains('is-preloading'),
    getPanorama: () => panorama
  });

  const boardingGestures = bindBoardingPanoramaGestures({
    canvas,
    isActive: () => section.classList.contains('is-boarding') && panorama
      && section.dataset.entryReady === 'true' && !section.classList.contains('is-preloading'),
    getPanorama: () => panorama,
    getBaseFov: () => boardingBaseFov,
    onSingleTap: (tap) => boardingTravel.move(tap),
    allowNativeClick: () => boardingTravel.isDispatchingLink()
  });

  previous.addEventListener('click', () => { pause(); void showFrame(selected - 1); });
  next.addEventListener('click', () => { pause(); void showFrame(selected + 1); });
  playback.addEventListener('click', async () => {
    if (playing) pause();
    else if (preparationDone && selected >= 0 && selected >= frames.length - 1 && frames.length > 1) {
      await showFrame(0);
      if (selected !== 0 || busy) return;
      playing = true;
      updateControls();
      scheduleNext();
    }
    else if (selected >= 0 && (!preparationDone || selected < frames.length - 1)) {
      playing = true;
      updateControls();
      scheduleNext();
    }
  });
  updateControls();
  return { start, startPoint, stop, pause, resize };
}
