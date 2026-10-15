import { ContinuousWalkEngine } from './engine.mjs';
import { NaverPanoramaAdapter } from './naver-adapter.mjs';
import { createWalkPanorama as createLegacyWalkPanorama } from '../walk-panorama.js';

export function createWalkPanorama(maps, section) {
  const canvas = section?.querySelector('.walk-panorama-canvas');
  const turn = section?.querySelector('.walk-panorama-turn');
  const status = section?.querySelector('.walk-panorama-status');
  const arrival = section?.querySelector('.walk-panorama-arrival');
  const previous = section?.querySelector('[data-panorama-action="previous"]');
  const playback = section?.querySelector('[data-panorama-action="playback"]');
  const next = section?.querySelector('[data-panorama-action="next"]');
  const speed = section?.querySelector('.walk-panorama-speed');
  if (!maps?.Panorama || !section || !canvas || !turn || !status || !arrival
    || !previous || !playback || !next || !speed) {
    return { start: async () => false, stop() {}, pause() {} };
  }

  let engine = null;
  let legacy = null;
  let resizeObserver = null;
  let generation = 0;

  function update(state, run) {
    if (run !== generation) return;
    const frame = state.frame;
    const instruction = state.instruction;
    if (frame) {
      section.dataset.panoramaId = frame.panoId;
      section.dataset.progressMeters = String(Math.round(frame.progress));
      section.dataset.cameraLat = String(frame.camera.lat);
      section.dataset.cameraLng = String(frame.camera.lng);
      section.dataset.headingDegrees = String(frame.pov.pan);
      section.classList.remove('is-loading');
    }
    previous.disabled = !frame || state.index <= 0;
    next.disabled = !frame || (state.scanComplete && state.index >= state.discovered - 1);
    playback.disabled = !frame || (state.scanComplete && state.index >= state.discovered - 1);
    playback.textContent = state.playing ? '일시정지' : '재생';
    playback.setAttribute('aria-label', state.playing ? '로드뷰 일시정지' : '로드뷰 재생');
    arrival.textContent = instruction?.text || '실제 로드뷰 촬영 지점을 확인하고 있습니다.';
    turn.hidden = !frame || !instruction || instruction.direction === 'straight';
    turn.textContent = turn.hidden ? '' : instruction.text;
    status.textContent = state.message || (frame
      ? `도보 로드뷰 · 출발 후 약 ${Math.round(frame.progress)}m`
      : '첫 실제 로드뷰 촬영 지점을 확인 중입니다.');
  }

  function stop() {
    generation += 1;
    legacy?.stop();
    engine?.stop();
    engine = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    canvas.replaceChildren();
    section.querySelector('.continuous-walk-probe')?.remove();
    section.hidden = true;
    section.classList.remove('is-loading');
    turn.hidden = true;
    turn.textContent = '';
    arrival.textContent = '';
    status.textContent = '';
    for (const key of ['panoramaId', 'progressMeters', 'cameraLat', 'cameraLng', 'headingDegrees']) {
      delete section.dataset[key];
    }
    previous.disabled = true;
    next.disabled = true;
    playback.disabled = true;
    playback.textContent = '재생';
    speed.value = '1.25';
  }

  async function startLegacy(route, end, options) {
    stop();
    legacy ||= createLegacyWalkPanorama(maps, section);
    return Boolean(await legacy.start(route, end, options));
  }

  async function start(route, end, options) {
    stop();
    const run = generation;
    section.hidden = false;
    section.classList.add('is-loading');
    status.textContent = '첫 실제 로드뷰 촬영 지점을 확인 중입니다.';
    const front = document.createElement('div');
    const back = document.createElement('div');
    const probe = document.createElement('div');
    front.className = 'continuous-walk-layer is-front';
    back.className = 'continuous-walk-layer';
    probe.className = 'continuous-walk-probe';
    probe.setAttribute('aria-hidden', 'true');
    canvas.append(front, back);
    section.append(probe);
    try {
      const adapter = new NaverPanoramaAdapter(maps, {
        probeElement: probe, frontElement: front, backElement: back
      });
      engine = new ContinuousWalkEngine({
        route, adapter, speed: Number(speed.value), onUpdate: (state) => update(state, run)
      });
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => adapter.resize());
        resizeObserver.observe(canvas);
      }
      const ready = await engine.start();
      if (run !== generation) return false;
      if (!ready) return startLegacy(route, end, options);
      section.classList.remove('is-loading');
      return true;
    } catch (error) {
      if (run !== generation) return false;
      console.warn('2SPEAKER continuous walk panorama failed', error);
      return startLegacy(route, end, options);
    }
  }

  previous.addEventListener('click', () => { void engine?.previous(); });
  next.addEventListener('click', () => { void engine?.next(); });
  playback.addEventListener('click', () => {
    if (engine?.playing) engine.pause();
    else engine?.play();
  });
  speed.addEventListener('change', () => engine?.setSpeed(Number(speed.value)));

  return { start, stop, pause: () => { engine?.pause(); legacy?.pause(); } };
}
