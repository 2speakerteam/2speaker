import {
  buildRoute, decisionsFor, distanceMeters, heading, instructionAt,
  nearestOnRoute, pointAt, targetsFor
} from './route.mjs';

const MAX_REQUEST_OFFSET_METERS = 22;
const MAX_ROUTE_OFFSET_METERS = 13;
const MAX_PROGRESS_ERROR_METERS = 18;
const MAX_CONTINUOUS_GAP_METERS = 12;

export class ContinuousWalkEngine {
  constructor({ route, adapter, onUpdate = () => {}, speed = 1.25, clock = globalThis }) {
    this.path = buildRoute(route);
    this.decisions = decisionsFor(this.path);
    this.targets = targetsFor(this.path, this.decisions);
    this.adapter = adapter;
    this.onUpdate = onUpdate;
    this.clock = clock;
    this.speed = speed;
    this.frames = [];
    this.index = -1;
    this.scanned = 0;
    this.scanComplete = false;
    this.playing = false;
    this.stopped = false;
    this.front = 0;
    this.timer = null;
    this.waiters = [];
    this.metrics = { firstFrameMs: null, scanned: 0, accepted: 0, duplicates: 0, rejected: 0, largestGap: 0, gaps: 0 };
  }

  coverage() {
    const first = this.frames[0]?.progress ?? null;
    const last = this.frames.at(-1)?.progress ?? null;
    return {
      first, last, gaps: this.metrics.gaps,
      complete: this.scanComplete && first !== null && first <= 8
        && last >= this.path.length - 8 && this.metrics.gaps === 0
    };
  }

  state(message = '') {
    const frame = this.frames[this.index];
    return {
      message, index: this.index, discovered: this.frames.length,
      scanned: this.scanned, totalTargets: this.targets.length,
      scanComplete: this.scanComplete, playing: this.playing, speed: this.speed,
      routeMeters: this.path.length, coverage: this.coverage(),
      frame, instruction: frame ? instructionAt(frame.progress, this.decisions, this.path.length) : null,
      metrics: { ...this.metrics }
    };
  }

  emit(message = '') { this.onUpdate(this.state(message)); }

  async start({ autoplay = true } = {}) {
    const started = performance.now();
    this.scanPromise = this.scan();
    const first = await this.waitForFrame(0);
    if (!first || this.stopped) {
      this.emit('출발 지점과 일치하는 실제 로드뷰 촬영 자료를 찾지 못했습니다.');
      this.stop();
      return false;
    }
    const ready = await this.adapter.prepare(first, this.front).catch(() => false);
    if (!ready || this.stopped) {
      this.emit('첫 로드뷰 이미지 준비에 실패했습니다.');
      this.stop();
      return false;
    }
    try {
      await this.adapter.reveal(this.front, first, instructionAt(first.progress, this.decisions, this.path.length));
    } catch {
      this.emit('첫 로드뷰 화면을 표시하지 못했습니다.');
      this.stop();
      return false;
    }
    this.index = 0;
    this.metrics.firstFrameMs = Math.round(performance.now() - started);
    this.emit('첫 장면 표시 · 나머지 경로의 촬영 지점을 확인 중입니다.');
    if (autoplay) this.play();
    return true;
  }

  async scan() {
    const seen = new Set();
    for (const target of this.targets) {
      if (this.stopped) break;
      let found;
      try {
        found = await this.adapter.probe(target, pointAt(this.path, Math.min(this.path.length, target.progress + 8)));
      } catch { found = null; }
      this.scanned += 1;
      this.metrics.scanned = this.scanned;
      if (!found?.panoId || !found.camera
        || !Number.isFinite(found.camera.lat) || !Number.isFinite(found.camera.lng)) {
        this.metrics.rejected += 1;
        this.emit();
        continue;
      }
      if (seen.has(found.panoId)) {
        this.metrics.duplicates += 1;
        this.emit();
        continue;
      }
      const near = nearestOnRoute(this.path, found.camera, target.progress);
      if (distanceMeters(found.camera, target) > MAX_REQUEST_OFFSET_METERS
        || near.distance > MAX_ROUTE_OFFSET_METERS
        || Math.abs(near.progress - target.progress) > MAX_PROGRESS_ERROR_METERS
        || (!this.frames.length && near.progress > 15)
        || (this.frames.length && near.progress <= this.frames.at(-1).progress + 1)) {
        this.metrics.rejected += 1;
        this.emit();
        continue;
      }
      const ahead = pointAt(this.path, Math.min(this.path.length, near.progress + 8));
      const behind = pointAt(this.path, Math.max(0, near.progress - 2));
      const pan = heading(behind, ahead);
      const cameraPan = heading(found.camera, ahead);
      const projected = found.projectedPan;
      if (Number.isFinite(projected)
        && (angleGap(projected, cameraPan) > 30 || angleGap(projected, pan) > 75)) {
        this.metrics.rejected += 1;
        this.emit();
        continue;
      }
      seen.add(found.panoId);
      const frame = {
        panoId: found.panoId, camera: found.camera, progress: near.progress,
        routeOffset: near.distance, signedOffset: near.signedOffset,
        photodate: found.photodate || '', pov: { pan, tilt: 0, fov: 95 }
      };
      const previous = this.frames.at(-1);
      if (previous) {
        this.metrics.largestGap = Math.max(this.metrics.largestGap, frame.progress - previous.progress);
        if (!this.canContinue(previous, frame)) this.metrics.gaps += 1;
      }
      this.frames.push(frame);
      this.metrics.accepted += 1;
      this.wakeWaiters();
      if (this.index >= 0 && this.frames[this.index + 1] === frame) this.preloadNext();
      this.emit();
    }
    this.scanComplete = true;
    this.wakeWaiters();
    const coverage = this.coverage();
    this.emit(this.stopped ? '' : coverage.complete
      ? '출발지부터 목적지까지 촬영 좌표 간격을 확인했습니다. 실제 화면 연결은 재생하며 확인해 주세요.'
      : `출발지부터 목적지까지 촬영 좌표가 이어지지 않습니다. 공백 ${coverage.gaps}곳과 출발·도착 지점을 확인해 주세요.`);
  }

  wakeWaiters() {
    for (const resolve of this.waiters.splice(0)) resolve();
  }

  async waitForFrame(index) {
    while (!this.stopped && !this.frames[index] && !this.scanComplete) {
      await new Promise((resolve) => this.waiters.push(resolve));
    }
    return this.frames[index] || null;
  }

  canContinue(current, next) {
    const progressGap = next.progress - current.progress;
    const cameraGap = distanceMeters(current.camera, next.camera);
    const sideFlip = Math.sign(current.signedOffset) !== Math.sign(next.signedOffset)
      && Math.min(Math.abs(current.signedOffset), Math.abs(next.signedOffset)) > 2;
    return progressGap > 0 && progressGap <= MAX_CONTINUOUS_GAP_METERS
      && cameraGap <= MAX_CONTINUOUS_GAP_METERS && !sideFlip;
  }

  dwellMs(current, next) {
    return Math.round(Math.max(550, Math.min(1600, (next.progress - current.progress) * 230)) / this.speed);
  }

  async show(index, { automatic = false } = {}) {
    if (this.busy || this.stopped || index < 0) return false;
    this.busy = true;
    const frame = await this.waitForFrame(index);
    if (!frame || this.stopped) { this.busy = false; return false; }
    const prior = this.frames[this.index];
    if (automatic && prior && !this.canContinue(prior, frame)) {
      this.busy = false;
      this.pause();
      this.emit(`실제 촬영 장면이 ${Math.round(frame.progress - prior.progress)}m 떨어져 있어 자동재생을 멈췄습니다.`);
      return false;
    }
    const back = 1 - this.front;
    const ready = await this.adapter.prepare(frame, back).catch(() => false);
    if (!ready || this.stopped) {
      this.busy = false;
      this.pause();
      this.emit('다음 실제 로드뷰 이미지가 준비되지 않아 재생을 멈췄습니다.');
      return false;
    }
    try {
      await this.adapter.reveal(back, frame, instructionAt(frame.progress, this.decisions, this.path.length));
    } catch {
      this.busy = false;
      this.pause();
      this.emit('로드뷰 화면 전환에 실패했습니다.');
      return false;
    }
    this.front = back;
    this.index = index;
    this.busy = false;
    this.emit(!automatic && prior && !this.canContinue(prior, frame)
      ? '촬영 자료가 끊긴 구간을 수동으로 이동했습니다. 연속 보행 장면이 아닙니다.' : '');
    this.preloadNext();
    if (this.playing) this.scheduleNext();
    return true;
  }

  preloadNext() {
    const next = this.frames[this.index + 1];
    if (next && !this.stopped) void this.adapter.prepare(next, 1 - this.front).catch(() => {});
  }

  scheduleNext() {
    this.clock.clearTimeout(this.timer);
    if (!this.playing || this.stopped) return;
    const current = this.frames[this.index];
    const next = this.frames[this.index + 1];
    if (!next) {
      if (this.scanComplete) {
        this.pause();
        this.emit(this.coverage().complete
          ? '출발지부터 목적지까지 자동 재생을 마쳤습니다.'
          : '재생 가능한 마지막 촬영 지점입니다. 전체 경로는 이어지지 않습니다.');
      } else {
        this.waitForFrame(this.index + 1).then(() => {
          if (this.playing && !this.stopped) this.scheduleNext();
        });
        this.emit('다음 실제 촬영 장면을 확인 중입니다.');
      }
      return;
    }
    if (!this.canContinue(current, next)) {
      this.pause();
      this.emit(`촬영 지점 사이가 ${Math.round(next.progress - current.progress)}m 떨어져 재생을 멈췄습니다.`);
      return;
    }
    this.timer = this.clock.setTimeout(() => { void this.show(this.index + 1, { automatic: true }); }, this.dwellMs(current, next));
  }

  play() {
    if (this.stopped || this.index < 0) return;
    this.playing = true;
    this.emit();
    this.scheduleNext();
  }

  pause() {
    this.playing = false;
    this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.emit();
  }

  previous() { this.pause(); return this.show(this.index - 1); }
  next() { this.pause(); return this.show(this.index + 1); }

  setSpeed(speed) {
    if (![.75, 1, 1.25, 1.5, 2].includes(speed)) throw new Error('지원하지 않는 재생 속도입니다.');
    this.speed = speed;
    this.emit();
    if (this.playing) this.scheduleNext();
  }

  stop() {
    this.pause();
    this.stopped = true;
    this.wakeWaiters();
    this.adapter.dispose?.();
  }
}

function angleGap(a, b) { return Math.abs((((a - b) % 360) + 540) % 360 - 180); }
