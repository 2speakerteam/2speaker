// Follow the camera matrix actually rendered by the panorama, so the ground
// anchor and the photograph move in the same frame, including inertial drags.
const WALK_ROUTE_ARROW_IMAGE = '/public/walk-guide-arrow.png';
const WALK_ROUTE_ARROW_MASK = '/public/walk-guide-arrow-mask.svg';
const WALK_ROUTE_ARROW_SCALE = 1.09;
const RADIANS = Math.PI / 180;
// At the normal 95-degree forward view, anchor above the AI chat button (72% height).
const GROUND_DROP = .44 * Math.tan(95 * RADIANS / 2);

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
  let renderer = null;
  let scene = null;
  let headingOffset = null;
  let displayedRotation = null;
  let transitioning = false;
  let stopped = false;

  const renderedCamera = () => {
    const cube = [...(renderer?.querySelectorAll('.cube') || [])]
      .find(element => element.style.display !== 'none');
    const face = cube?.querySelector('[class^="cube_face_0_"]');
    const focal = Number.parseFloat(cube?.style.perspective);
    if (!face?.style.transform?.startsWith('matrix3d(') || !(focal > 0)) return null;
    const matrix = new DOMMatrixReadOnly(face.style.transform);
    return {
      pan: Math.atan2(matrix.m31, matrix.m11) / RADIANS,
      tilt: Math.atan2(matrix.m23, matrix.m22) / RADIANS,
      focal
    };
  };
  const paint = () => {
    if (stopped || !Number.isFinite(bearing) || !pov) return;
    const width = view.clientWidth, height = view.clientHeight;
    // Only mix in the rendered matrix after a touch has calibrated its heading.
    // During scene setup it may still describe the outgoing photograph.
    const camera = transitioning || headingOffset === null ? null : renderedCamera();
    const cameraPan = camera && headingOffset !== null ? camera.pan + headingOffset : pov.pan;
    const relative = ((bearing - cameraPan + 540) % 360) - 180;
    const pan = relative * RADIANS, tilt = (camera?.tilt ?? pov.tilt) * RADIANS;
    const forward = Math.cos(pan);
    const depth = forward * Math.cos(tilt) - GROUND_DROP * Math.sin(tilt);
    const up = -GROUND_DROP * Math.cos(tilt) - forward * Math.sin(tilt);
    const focal = camera?.focal ?? height / (2 * Math.tan(pov.fov * RADIANS / 2));
    if (width <= 0 || height <= 0 || !Number.isFinite(focal + depth + up + relative)) {
      root.hidden = true;
      return;
    }
    // A turn can point outside the photograph before the camera turns.
    // Keep the direction indicator within the screen instead of hiding it or
    // letting perspective division near 90 degrees send it far off screen.
    const projectionDepth = Math.max(.35, depth);
    const projectedX = width / 2 + focal * Math.sin(pan) / projectionDepth;
    const projectedY = height / 2 - focal * up / projectionDepth;
    // Measure the graphic even on the first frame after clear(); all placement
    // writes below finish synchronously before the browser can paint.
    root.hidden = false;
    const graphicWidth = graphic.offsetWidth * WALK_ROUTE_ARROW_SCALE;
    const graphicHeight = (graphic.offsetHeight || graphic.offsetWidth) * WALK_ROUTE_ARROW_SCALE;
    const halfWidth = (graphicWidth * Math.abs(Math.cos(pan)) + graphicHeight * Math.abs(Math.sin(pan))) / 2;
    const halfHeight = (graphicHeight * Math.abs(Math.cos(pan)) + graphicWidth * Math.abs(Math.sin(pan))) / 2;
    const marginX = Math.min(width / 2, Math.max(width * .2, halfWidth + 8));
    const marginY = Math.min(height / 2, halfHeight + 8);
    const x = Math.max(marginX, Math.min(width - marginX, projectedX));
    const y = Math.max(marginY, Math.min(height - marginY, Math.max(height * .56, Math.min(height * .72, projectedY))));
    // Preserve the short rotation across -180/180 degrees.
    displayedRotation = displayedRotation === null ? relative
      : displayedRotation + ((relative - displayedRotation + 540) % 360 + 360) % 360 - 180;
    graphic.style.left = `${x}px`;
    graphic.style.top = `${y}px`;
    graphic.style.transform = `translate(-50%,-50%) rotate(${displayedRotation}deg) scale(${WALK_ROUTE_ARROW_SCALE})`;
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
  const cameraObserver = new MutationObserver(paint);
  // Calibrate after the new photo has appeared, immediately before a drag.
  // The SDK may still contain the outgoing photo's matrix during scene setup.
  const anchorCamera = () => {
    const camera = renderedCamera();
    if (camera && pov) headingOffset = pov.pan - camera.pan;
  };
  canvas.addEventListener('pointerdown', anchorCamera, { capture: true, passive: true });

  const clear = () => {
    cameraObserver.disconnect();
    root.hidden = true;
    bearing = null;
    pov = null;
    renderer = null;
    scene = null;
    headingOffset = null;
    displayedRotation = null;
    transitioning = false;
    canvas.classList.remove('has-retained-route-arrow');
  };
  const show = (source, directionKey, refreshPose = false, sceneKey = null, targetAngle = null, cameraPov = null, cameraElement = null) => {
    if (stopped) return;
    if (canvas.classList.contains('is-arrival')) { clear(); return; }
    if (!Number.isFinite(targetAngle) || !Number.isFinite(cameraPov?.pan)) { clear(); return; }
    transitioning = false;
    if (renderer !== cameraElement || scene !== sceneKey) {
      cameraObserver.disconnect();
      renderer = cameraElement;
      scene = sceneKey;
      headingOffset = null;
      if (renderer) cameraObserver.observe(renderer, { subtree: true, childList: true,
        attributes: true, attributeFilter: ['style'] });
    }
    bearing = cameraPov.pan + targetAngle;
    setPov(cameraPov);
  };
  const setTransitionPov = (value, routeBearing) => {
    if (!Number.isFinite(routeBearing)) return;
    // During a buffered turn, the observed DOM still belongs to the old photo.
    // Use the same interpolated camera and route bearing until the scene settles.
    transitioning = true;
    bearing = routeBearing;
    setPov(value);
  };
  const stop = () => {
    stopped = true;
    canvas.removeEventListener('pointerdown', anchorCamera, true);
    observer.disconnect();
    clear();
    root.remove();
    style.remove();
  };
  return { show, setPov, setTransitionPov, clear, stop };
}
