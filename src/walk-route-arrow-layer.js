// Keep only the existing SDK guidance graphic independent of photo opacity.
// No panorama image/canvas is copied, and no SDK node is moved or rewritten.
export function createWalkRouteArrowLayer(canvas, view) {
  const root = document.createElement('div');
  root.className = 'walk-route-arrow-layer';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:absolute;inset:0;z-index:7;pointer-events:none;';
  root.hidden = true;
  view.appendChild(root);
  const style = document.createElement('style');
  style.textContent = '.walk-panorama-canvas.has-retained-route-arrow img.arrow_image { visibility:hidden !important; pointer-events:none !important; }';
  view.appendChild(style);
  let projection = null;
  let plane = null;
  let graphic = null;
  let direction = null;
  let scene = null;
  let poseAdjusted = false;
  let layoutChanged = false;
  let resizeFrame = null;
  let stopped = false;
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      layoutChanged = true;
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        if (stopped) return;
        const current = canvas.querySelector('img.arrow_image.walk-panorama-native-active');
        if (current) show(current, direction, false, scene);
      });
    }) : null;
  observer?.observe(view);

  const clear = () => {
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
    root.hidden = true;
    root.replaceChildren();
    canvas.classList.remove('has-retained-route-arrow');
    projection = plane = graphic = null;
    direction = null;
    scene = null;
    poseAdjusted = false;
  };
  const show = (source, directionKey, refreshPose = false, sceneKey = null) => {
    if (source?.tagName !== 'IMG' || !source.classList.contains('arrow_image')
      || !source.complete || !source.naturalWidth || !source.parentElement?.parentElement) return;
    const nextScene = scene !== sceneKey;
    const restoreRoutePose = nextScene && poseAdjusted;
    if (graphic && direction === directionKey && !layoutChanged && !refreshPose && !restoreRoutePose) {
      scene = sceneKey;
      return;
    }
    const sourcePlane = source.parentElement;
    const sourceProjection = sourcePlane.parentElement;
    root.hidden = false;
    const bounds = root.getBoundingClientRect();
    const origin = sourceProjection.getBoundingClientRect();
    const rootStyle = getComputedStyle(root);
    const width = Number.parseFloat(rootStyle.width) || root.clientWidth;
    const height = Number.parseFloat(rootStyle.height) || root.clientHeight;
    if (bounds.width <= 0 || bounds.height <= 0 || root.clientWidth <= 0 || root.clientHeight <= 0) {
      root.hidden = true;
      return;
    }
    if (!graphic) {
      projection = sourceProjection.cloneNode(false);
      plane = sourcePlane.cloneNode(false);
      graphic = source.cloneNode(false);
      for (const element of [projection, plane, graphic]) element.removeAttribute('id');
      graphic.alt = '';
      plane.appendChild(graphic);
      projection.appendChild(plane);
      root.appendChild(projection);
    }
    projection.style.cssText = sourceProjection.style.cssText;
    projection.style.display = 'block';
    projection.style.left = `${(origin.left - bounds.left) * width / bounds.width}px`;
    projection.style.top = `${(origin.top - bounds.top) * height / bounds.height}px`;
    plane.style.cssText = sourcePlane.style.cssText;
    graphic.style.cssText = source.style.cssText;
    graphic.style.filter = getComputedStyle(source).filter;
    graphic.style.visibility = 'visible';
    graphic.style.opacity = '1';
    graphic.style.pointerEvents = 'auto';
    graphic.className = source.className;
    if (graphic.getAttribute('src') !== source.getAttribute('src')) graphic.src = source.src;
    root.hidden = false;
    canvas.classList.add('has-retained-route-arrow');
    direction = directionKey;
    scene = sceneKey;
    if (restoreRoutePose) poseAdjusted = false;
    if (refreshPose) poseAdjusted = true;
    layoutChanged = false;
  };
  const stop = () => {
    stopped = true;
    observer?.disconnect();
    clear();
    root.remove();
    style.remove();
  };
  return { show, clear, stop };
}
