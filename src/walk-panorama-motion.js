const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const delta = (from, to) => ((to - from + 540) % 360 + 360) % 360 - 180;
const angle = value => ((value + 180) % 360 + 360) % 360 - 180;

// Keep the user's view relative to the road, including side/backward views.
export function walkingViewPov(previous, next, current) {
  if (!previous || !Number.isFinite(current?.pan)) return { ...next.pov };
  return {
    pan: angle(next.pov.pan + delta(previous.pov.pan, current.pan)),
    tilt: Number.isFinite(current.tilt) ? current.tilt : next.pov.tilt,
    fov: Number.isFinite(current.fov) ? current.fov : next.pov.fov
  };
}

export function walkingPlaybackTiming(previous, next, manual = false) {
  const gap = Math.abs((next?.progress ?? 0) - (previous?.progress ?? 0));
  const turn = previous && next ? Math.abs(delta(previous.pov.pan, next.pov.pan)) : 0;
  const totalMs = Math.round(clamp(gap * 220 + 700 + turn * 5, 1900, 4800));
  const differentDate = previous?.photodate && next?.photodate
    && previous.photodate.slice(0, 10) !== next.photodate.slice(0, 10);
  // Long blends of different capture dates make moving cars overlap.
  const transitionMs = Math.round(manual ? 420
    : clamp(gap * 30 + 250, 380, differentDate ? 420 : 650));
  return { totalMs, transitionMs, holdMs: Math.max(180, Math.round((totalMs - transitionMs) * 0.9)) };
}

export function interpolateWalkingPov(from, to, fraction) {
  const t = clamp(fraction, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return {
    pan: angle(from.pan + delta(from.pan, to.pan) * eased),
    tilt: from.tilt + (to.tilt - from.tilt) * eased,
    fov: from.fov + (to.fov - from.fov) * eased
  };
}
