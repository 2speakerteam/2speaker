const RADIANS = Math.PI / 180;
const EARTH_METERS = 6371000;

export function distanceMeters(a, b) {
  const dLat = (b.lat - a.lat) * RADIANS;
  const dLng = (b.lng - a.lng) * RADIANS;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RADIANS)
    * Math.cos(b.lat * RADIANS) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function signedAngle(a, b) {
  return (((b - a) % 360) + 540) % 360 - 180;
}

export function heading(a, b) {
  const east = (b.lng - a.lng) * Math.cos((a.lat + b.lat) * RADIANS / 2);
  return (Math.atan2(east, b.lat - a.lat) / RADIANS + 360) % 360;
}

export function buildRoute(route) {
  if (!route || !Array.isArray(route.segments)) throw new Error('TMAP 보행 경로가 없습니다.');
  const edges = [];
  let previous = null;
  let progress = 0;
  for (const segment of route.segments) {
    if (segment.mode !== 'WALK' || !Array.isArray(segment.coordinates)) continue;
    for (let index = 0; index < segment.coordinates.length; index += 1) {
      const pair = segment.coordinates[index];
      const point = { lat: Number(pair?.[1]), lng: Number(pair?.[0]) };
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)
        || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) {
        throw new Error('TMAP 보행 경로에 잘못된 좌표가 있습니다.');
      }
      if (previous) {
        const length = distanceMeters(previous, point);
        if (index === 0 && length > 3) throw new Error('보행 경로 선이 끊어져 있습니다.');
        if (length >= .1) {
          edges.push({ start: previous, end: point, from: progress, to: progress + length });
          progress += length;
        }
      }
      previous = point;
    }
  }
  if (!edges.length) throw new Error('연속된 보행 경로 좌표가 없습니다.');
  return { edges, length: progress, guidePoints: route.guidePoints || [] };
}

export function pointAt(path, progress) {
  const value = Math.max(0, Math.min(path.length, progress));
  const edge = path.edges.find((item) => item.to >= value) || path.edges.at(-1);
  const fraction = Math.max(0, Math.min(1, (value - edge.from) / (edge.to - edge.from)));
  return {
    lat: edge.start.lat + (edge.end.lat - edge.start.lat) * fraction,
    lng: edge.start.lng + (edge.end.lng - edge.start.lng) * fraction,
    progress: value
  };
}

export function nearestOnRoute(path, camera, requested) {
  const scaleY = EARTH_METERS * RADIANS;
  const scaleX = scaleY * Math.cos(camera.lat * RADIANS);
  let closest = { distance: Infinity, progress: NaN, signedOffset: NaN };
  for (const edge of path.edges) {
    if (edge.to < requested - 22 || edge.from > requested + 22) continue;
    const ax = (edge.start.lng - camera.lng) * scaleX;
    const ay = (edge.start.lat - camera.lat) * scaleY;
    const dx = (edge.end.lng - edge.start.lng) * scaleX;
    const dy = (edge.end.lat - edge.start.lat) * scaleY;
    const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const x = ax + fraction * dx;
    const y = ay + fraction * dy;
    const d = Math.hypot(x, y);
    if (d < closest.distance) {
      closest = {
        distance: d,
        progress: edge.from + fraction * (edge.to - edge.from),
        signedOffset: (dx * y - dy * x) / Math.hypot(dx, dy)
      };
    }
  }
  return closest;
}

export function decisionsFor(path) {
  const found = [];
  const add = (progress, crossing = false) => {
    if (progress < 5 || progress > path.length - 4) return;
    const before = pointAt(path, progress - 6);
    const at = pointAt(path, progress);
    const after = pointAt(path, progress + 7);
    const turn = signedAngle(heading(before, at), heading(at, after));
    if (Math.abs(turn) < 25 && !crossing) return;
    found.push({ progress, direction: turn < -25 ? 'left' : turn > 25 ? 'right' : 'straight', crossing, turn });
  };
  for (const guide of path.guidePoints) {
    if (!Number.isFinite(guide.lat) || !Number.isFinite(guide.lng)) continue;
    const turning = [12, 13, 14, 16, 17, 18, 19].includes(guide.turnType);
    const crossing = guide.turnType >= 211 && guide.turnType <= 217;
    if (!turning && !crossing) continue;
    // Guide points can be anywhere on the route; project them against every edge.
    const exact = nearestOnRouteAnywhere(path, guide);
    if (exact.distance <= 8) add(exact.progress, crossing);
  }
  for (let i = 0; i < path.edges.length - 1; i += 1) {
    const progress = path.edges[i].to;
    const before = pointAt(path, progress - 6);
    const at = pointAt(path, progress);
    const after = pointAt(path, progress + 7);
    if (Math.abs(signedAngle(heading(before, at), heading(at, after))) >= 50) add(progress);
  }
  return found.sort((a, b) => a.progress - b.progress)
    .filter((item, index, all) => index === 0 || item.progress - all[index - 1].progress >= 6);
}

function nearestOnRouteAnywhere(path, point) {
  let best = { distance: Infinity, progress: 0 };
  for (const edge of path.edges) {
    const candidate = nearestOnRoute({ edges: [edge] }, point, (edge.from + edge.to) / 2);
    if (candidate.distance < best.distance) best = candidate;
  }
  return best;
}

export function targetsFor(path, decisions, spacing = 4) {
  const progress = new Set([0, path.length]);
  for (let value = spacing; value < path.length; value += spacing) progress.add(value);
  for (const decision of decisions) {
    for (const offset of [-10, -6, -3, 0, 3, 6, 10]) {
      const value = decision.progress + offset;
      if (value > 0 && value < path.length) progress.add(value);
    }
  }
  return [...progress].sort((a, b) => a - b).map((value) => pointAt(path, value));
}

export function instructionAt(progress, decisions, total) {
  const next = decisions.find((item) => item.progress >= progress - 2);
  if (!next) return total - progress <= 20
    ? { text: '목적지 방향으로 계속 가세요.', direction: 'straight' }
    : { text: '계속 직진하세요.', direction: 'straight' };
  const meters = Math.max(0, Math.round(next.progress - progress));
  if (next.crossing) return {
    text: meters > 20 ? `약 ${meters}m 계속 직진한 뒤 횡단보도로 건너가세요.` : '여기서 횡단보도로 건너가세요.',
    direction: 'straight'
  };
  const side = next.direction === 'left' ? '왼쪽' : '오른쪽';
  return meters > 20
    ? { text: `약 ${meters}m 계속 직진한 뒤 ${side} 길로 가세요.`, direction: 'straight', angle: 0 }
    : { text: `여기서 ${side} 길로 가세요.`, direction: next.direction, angle: next.turn };
}
