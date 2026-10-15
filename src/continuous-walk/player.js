import { ContinuousWalkEngine } from './engine.mjs';
import { NaverPanoramaAdapter } from './naver-adapter.mjs';

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
  let resizeObserver = null;
  let generation = 0;

  function update(state, run) {
    if (run !== generation) return;
    const frame = state.frame;
    const instruction = state.instruction;
    if (frame && state.index >= 0) {
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
    status.textContent = '경로보기';
    if (state.message) arrival.textContent = state.message;
  }

  function stop() {
    generation += 1;
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

  async function start(route, end, options) {
    stop();
    const run = generation;
    section.hidden = false;
    section.classList.add('is-loading');
    status.textContent = '경로보기';
    arrival.textContent = '첫 실제 로드뷰 촬영 지점을 확인 중입니다.';
    const front = document.createElement('div');
    const back = document.createElement('div');
    const probe = document.createElement('div');
    front.className = 'continuous-walk-layer is-front';
    back.className = 'continuous-walk-layer';
    probe.className = 'continuous-walk-probe';
    probe.setAttribute('aria-hidden', 'true');
    canvas.append(front, back);
    section.querySelector('.walk-panorama-view').append(probe);
    try {
      const adapter = new NaverPanoramaAdapter(maps, {
        probeElement: probe, frontElement: front, backElement: back
      });
      engine = new ContinuousWalkEngine({
        route, adapter, speed: Number(speed.value), onUpdate: (state) => update(state, run)
      });
      const ready = await engine.start();
      if (run !== generation) return false;
      if (!ready) {
        console.warn('2SPEAKER continuous walk initial frame unavailable', engine.state());
        stop();
        return false;
      }
      section.classList.remove('is-loading');
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => adapter.resize());
        resizeObserver.observe(canvas);
      }
      return true;
    } catch (error) {
      if (run !== generation) return false;
      console.warn('2SPEAKER continuous walk panorama failed', error);
      stop();
      return false;
    }
  }

  previous.addEventListener('click', () => { void engine?.previous(); });
  next.addEventListener('click', () => { void engine?.next(); });
  playback.addEventListener('click', () => {
    if (engine?.playing) engine.pause();
    else engine?.play();
  });
  speed.addEventListener('change', () => engine?.setSpeed(Number(speed.value)));

  return { start, stop, pause: () => { engine?.pause(); } };
}
