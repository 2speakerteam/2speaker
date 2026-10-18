// Keep one screen-space graphic so SDK perspective cannot flatten the arrow.
// The supplied image and existing route angle are preserved across scene changes.
const WALK_ROUTE_ARROW_IMAGE = '/public/walk-guide-arrow.png';
const WALK_ROUTE_ARROW_MASK = '/public/walk-guide-arrow-mask.svg';
const WALK_ROUTE_ARROW_SCALE = 1.09;

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
  graphic.style.cssText = 'position:absolute;left:50%;top:81%;width:clamp(110px,32vw,140px);height:auto;filter:none;pointer-events:auto;transform-origin:50% 50%;';
  graphic.style.maskImage = graphic.style.webkitMaskImage = `url("${WALK_ROUTE_ARROW_MASK}")`;
  graphic.style.maskSize = graphic.style.webkitMaskSize = '100% 100%';
  graphic.style.maskRepeat = graphic.style.webkitMaskRepeat = 'no-repeat';
  root.appendChild(graphic);
  view.appendChild(root);

  const style = document.createElement('style');
  style.textContent = '.walk-panorama-canvas.has-retained-route-arrow img.arrow_image { visibility:hidden !important; pointer-events:none !important; }';
  view.appendChild(style);
  let angle = null;
  let stopped = false;

  const clear = () => {
    root.hidden = true;
    angle = null;
    canvas.classList.remove('has-retained-route-arrow');
  };
  const show = (source, directionKey, refreshPose = false, sceneKey = null, targetAngle = null) => {
    if (stopped) return;
    if (canvas.classList.contains('is-arrival')) { clear(); return; }
    if (Number.isFinite(targetAngle)) angle = targetAngle;
    if (!Number.isFinite(angle)) { clear(); return; }
    graphic.style.transform = `translate(-50%,-50%) rotate(${angle}deg) scale(${WALK_ROUTE_ARROW_SCALE})`;
    canvas.classList.add('has-retained-route-arrow');
    root.hidden = false;
  };
  const stop = () => {
    stopped = true;
    clear();
    root.remove();
    style.remove();
  };
  return { show, clear, stop };
}
