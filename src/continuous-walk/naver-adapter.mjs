import { signedAngle } from './route.mjs';

// Same #BEEFC0 filter as the current 25-frame preview; only the SDK's native arrow is tinted.
const ARROW_FILTER = 'brightness(0) saturate(100%) invert(79.854%) sepia(61.364%) saturate(151.287%) hue-rotate(72.319deg) brightness(113.05%) contrast(73.431%)';

function waitForPanorama(maps, panorama, action, timeoutMs = 4500) {
  return new Promise((resolve) => {
    let status = null;
    let changed = false;
    let done = false;
    let fallback;
    const listeners = [
      maps.Event.addListener(panorama, 'pano_status', (value) => {
        status = value;
        if (value !== 'OK') finish(null);
        else {
          // The SDK may retain the same ID and omit pano_changed.
          fallback = setTimeout(() => { changed = true; snapshot(); }, 180);
          snapshot();
        }
      }),
      maps.Event.addListener(panorama, 'pano_changed', () => { changed = true; snapshot(); })
    ];
    const timeout = setTimeout(() => finish(null), timeoutMs);
    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearTimeout(fallback);
      listeners.forEach((listener) => maps.Event.removeListener(listener));
      resolve(result);
    }
    function snapshot() {
      if (status !== 'OK' || !changed) return;
      const location = panorama.getLocation?.();
      const coord = location?.coord;
      if (!coord) return;
      finish({
        panoId: panorama.getPanoId(), camera: { lat: coord.lat(), lng: coord.lng() },
        photodate: location.photodate || ''
      });
    }
    try { action(); } catch { finish(null); }
  });
}

function waitForTiles(element, panoId, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const began = performance.now();
    const inspect = () => {
      const images = [...element.querySelectorAll('img')]
        .filter((image) => image.currentSrc.includes(`/image/${panoId}/`));
      if (images.length >= 4 && images.every((image) => image.complete && image.naturalWidth > 0)) {
        resolve(true);
      } else if (performance.now() - began > timeoutMs) resolve(false);
      else requestAnimationFrame(inspect);
    };
    inspect();
  });
}

function nativeArrowAngle(image) {
  const transform = image.parentElement?.style.transform || '';
  const match = /^matrix3d\(([^)]+)\)$/.exec(transform);
  if (!match) return null;
  const values = match[1].split(',').map(Number);
  return values.length === 16 && Number.isFinite(values[0]) && Number.isFinite(values[2])
    ? Math.atan2(values[2], values[0]) * 180 / Math.PI : null;
}

export class NaverPanoramaAdapter {
  constructor(maps, { probeElement, frontElement, backElement }) {
    this.maps = maps;
    this.probeElement = probeElement;
    this.elements = [frontElement, backElement];
    this.probePanorama = null;
    this.channels = [null, null];
    this.loaded = [null, null];
    this.loading = [null, null];
    this.activeFrame = null;
    this.activeInstruction = null;
    this.front = 0;
    this.disposed = false;
    this.arrowContainer = null;
    this.arrowStyle = document.createElement('style');
    frontElement.parentElement.append(this.arrowStyle);
    this.observer = new MutationObserver(() => this.paintNativeArrow());
    this.observer.observe(frontElement.parentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'src'] });
  }

  async probe(point, ahead) {
    if (this.disposed) return null;
    const position = new this.maps.LatLng(point.lat, point.lng);
    if (!this.probePanorama) {
      const panorama = new this.maps.Panorama(this.probeElement, {
        size: new this.maps.Size(this.probeElement.clientWidth, this.probeElement.clientHeight), flightSpot: false,
        logoControl: false, zoomControl: false, aroundControl: false
      });
      const found = await waitForPanorama(this.maps, panorama, () => panorama.setPosition(position));
      this.probePanorama = panorama;
      if (this.disposed) { panorama.setVisible(false); return null; }
      return this.withProjection(found, ahead);
    }
    const found = await waitForPanorama(this.maps, this.probePanorama,
      () => this.probePanorama.setPosition(position));
    return this.disposed ? null : this.withProjection(found, ahead);
  }

  withProjection(found, ahead) {
    if (!found) return null;
    const pov = this.probePanorama.getProjection()?.fromCoordToPov(
      new this.maps.LatLng(ahead.lat, ahead.lng));
    return { ...found, projectedPan: pov?.pan };
  }

  async prepare(frame, slot) {
    if (this.disposed) return false;
    if (this.loaded[slot] === frame.panoId) {
      this.channels[slot]?.setPov(frame.pov);
      return true;
    }
    if (this.loading[slot]) await this.loading[slot];
    if (this.disposed) return false;
    if (this.loaded[slot] === frame.panoId) {
      this.channels[slot]?.setPov(frame.pov);
      return true;
    }
    this.loading[slot] = (async () => {
      let panorama = this.channels[slot];
      if (!panorama) {
        panorama = new this.maps.Panorama(this.elements[slot], {
          pov: frame.pov, flightSpot: true,
          logoControl: false, zoomControl: false, aroundControl: false,
          size: new this.maps.Size(this.elements[slot].clientWidth, this.elements[slot].clientHeight)
        });
        this.channels[slot] = panorama;
      }
      const found = await waitForPanorama(this.maps, panorama,
        () => panorama.setPanoIdWithPov(frame.panoId, frame.pov));
      if (this.disposed || !found || found.panoId !== frame.panoId) return false;
      const ready = await waitForTiles(this.elements[slot], frame.panoId);
      if (this.disposed || !ready) return false;
      panorama.setPov(frame.pov);
      this.loaded[slot] = frame.panoId;
      return true;
    })();
    try { return await this.loading[slot]; }
    finally { this.loading[slot] = null; }
  }

  async reveal(slot, frame, instruction) {
    const prior = this.channels[this.front];
    if (this.activeFrame && prior && slot !== this.front) {
      const turn = signedAngle(this.activeFrame.pov.pan, frame.pov.pan);
      if (Math.abs(turn) >= 25) {
        const first = prior.getPov();
        for (let i = 1; i <= 4; i += 1) {
          prior.setPov({ ...first, pan: first.pan + turn * i / 4 });
          await new Promise((resolve) => setTimeout(resolve, 70));
        }
      }
    }
    this.elements.forEach((element, index) => {
      element.classList.toggle('is-front', index === slot);
      element.setAttribute('aria-hidden', index === slot ? 'false' : 'true');
    });
    this.front = slot;
    this.activeFrame = frame;
    this.activeInstruction = instruction;
    this.arrowContainer = null;
    this.arrowStyle.textContent = '';
    this.paintNativeArrow();
  }

  paintNativeArrow() {
    const frame = this.activeFrame;
    const instruction = this.activeInstruction;
    const images = this.elements.flatMap((element) => [...element.querySelectorAll('img.arrow_image')]);
    if (!frame || !instruction?.direction) {
      this.arrowContainer = null;
      this.arrowStyle.textContent = '';
      images.forEach((image) => image.classList.remove('walk-panorama-native-active'));
      return;
    }
    const frontImages = [...this.elements[this.front].querySelectorAll('img.arrow_image')];
    let chosen = this.arrowContainer
      ? frontImages.find((image) => image.parentElement?.classList.contains(this.arrowContainer)) : null;
    if (!chosen) {
      const candidates = frontImages.map((image) => ({ image, angle: nativeArrowAngle(image) }))
        .filter(({ angle }) => angle !== null && (instruction.direction === 'left'
          ? angle < -18 && angle > -155 : instruction.direction === 'right'
            ? angle > 18 && angle < 155 : Math.abs(angle) < 55));
      candidates.sort((a, b) => Math.abs(a.angle - (instruction.angle || 0))
        - Math.abs(b.angle - (instruction.angle || 0)));
      chosen = candidates[0]?.image;
      const container = [...(chosen?.parentElement?.classList || [])]
        .find((name) => /^arrow_container_#\d+$/.test(name));
      if (container && container !== this.arrowContainer) {
        this.arrowContainer = container;
        this.arrowStyle.textContent = `.continuous-walk-layer.is-front [class~="${container}"] img.arrow_image { filter: ${ARROW_FILTER} !important; }`;
      }
    }
    images.forEach((image) => {
      image.classList.toggle('walk-panorama-native-active', image === chosen);
    });
  }

  resize() {
    this.channels.forEach((panorama, index) => {
      if (panorama) panorama.setSize(new this.maps.Size(
        this.elements[index].clientWidth, this.elements[index].clientHeight));
    });
  }

  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.arrowStyle.remove();
    this.probePanorama?.setVisible(false);
    this.channels.forEach((panorama) => panorama?.setVisible(false));
    this.probePanorama = null;
    this.channels = [null, null];
    this.activeFrame = null;
    this.activeInstruction = null;
  }
}
