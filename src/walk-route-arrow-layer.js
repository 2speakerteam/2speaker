// Project a ground-level bearing through the current camera. Keep the supplied
// image's shape, but let its anchor leave the screen when the ground is out of view.
const WALK_ROUTE_ARROW_IMAGE = '/public/walk-guide-arrow.png';
const WALK_ROUTE_ARROW_MASK = '/public/walk-guide-arrow-mask.svg';
const WALK_ROUTE_ARROW_SCALE = 1.09;
const RADIANS = Math.PI / 180;
// Preserve the original near-ground placement at the normal 95-degree view.
const GROUND_DROP = .62 * Math.tan(95 * RADIANS / 2);

export function createWalkRouteArrowLayer(canvas, view) {
  const root = document.createElement('div');
  root.className = 'walk-route-arrow-layer';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:absolute;inset:0;z-index:7;pointer-events:none;';
  root.hidden = true;

  const graphic = document.createElement('img');
  graphic.src = WALK_ROUTE_ARROW_IMAGE;
  graphic.alt = '';
  graphic.className = 'arrow_image walk-panorama-native-active';
  graphic.style.cssText = 'position:absolute;width:clamp(110px,32vw,140px);height:auto;filter:none;pointer-events:auto;transform-origin:50% 50%;';
  graphic.style.maskImage = graphic.style.webkitMaskImage = `url("${WALK_ROUTE_ARROW_MASK}")`;
  graphic.style.maskSize = graphic.style.webkitMaskSize = '100% 100%';
  graphic.style.maskRepeat = graphic.style.webkitMaskRepeat = 'no-repeat';
  root.appendChild(graphic);
  view.appendChild(root);

  const style = document.createElement('style');
  style.textContent = '.walk-panorama-canvas.has-retained-route-arrow img.arrow_image { visibility:hidden !important; pointer-events:none !important; }';
  view.appendChild(style);
  let bearing = null;
  let pov = null;
  let stopped = false;

  const paint = () => {
    if (stopped || !Number.isFinite(bearing) || !pov) return;
    const width = view.clientWidth, height = view.clientHeight;
    const relative = ((bearing - pov.pan + 540) % 360) - 180;
    const pan = relative * RADIANS, tilt = pov.tilt * RADIANS;
    const forward = Math.cos(pan);
    const depth = forward * Math.cos(tilt) - GROUND_DROP * Math.sin(tilt);
    const up = -GROUND_DROP * Math.cos(tilt) - forward * Math.sin(tilt);
    const focal = height / (2 * Math.tan(pov.fov * RADIANS / 2));
    const x = width / 2 + focal * Math.sin(pan) / depth;
    const y = height / 2 - focal * up / depth;
    if (width <= 0 || height <= 0 || depth <= .01 || !Number.isFinite(x + y)
      || x < 0 || x > width || y < 0 || y > height) {
      root.hidden = true;
      return;
    }
    graphic.style.left = `${x}px`;
    graphic.style.top = `${y}px`;
    graphic.style.transform = `translate(-50%,-50%) rotate(${relative}deg) scale(${WALK_ROUTE_ARROW_SCALE})`;
    canvas.classList.add('has-retained-route-arrow');
    root.hidden = false;
  };
  const setPov = value => {
    if (![value?.pan, value?.tilt, value?.fov].every(Number.isFinite)) return;
    pov = { pan: value.pan, tilt: value.tilt, fov: Math.max(20, Math.min(100, value.fov)) };
    paint();
  };
  const observer = new ResizeObserver(paint);
  observer.observe(view);

  const clear = () => {
    root.hidden = true;
    bearing = null;
    pov = null;
    canvas.classList.remove('has-retained-route-arrow');
  };
  const show = (source, directionKey, refreshPose = false, sceneKey = null, targetAngle = null, cameraPov = null) => {
    if (stopped) return;
    if (canvas.classList.contains('is-arrival')) { clear(); return; }
    if (!Number.isFinite(targetAngle) || !Number.isFinite(cameraPov?.pan)) { clear(); return; }
    bearing = cameraPov.pan + targetAngle;
    setPov(cameraPov);
  };
  const stop = () => {
    stopped = true;
    observer.disconnect();
    clear();
    root.remove();
    style.remove();
  };
  return { show, setPov, clear, stop };
}
