const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function load(name, extra = {}) {
  const source = fs.readFileSync(path.join(root, 'src', name), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/export function /g, 'function ');
  const names = [...source.matchAll(/^function (\w+)/gm)].map(match => match[1]);
  const module = { exports: {} };
  vm.runInNewContext(`${source}\nmodule.exports = { ${names.join(',')} };`, { module, ...extra });
  return module.exports;
}
const motion = load('walk-panorama-motion.js');
const frame = (id, progress, pan) => ({ panoId: id, progress, camera: { lat: 37.5, lng: 127 },
  pov: { pan, tilt: 0, fov: 95 }, photodate: '2026-05-08' });

test('sideward view and zoom survive a bend and the north wrap', () => {
  const pov = motion.walkingViewPov(frame('a', 0, 170), frame('b', 5, -175), { pan: -100, tilt: 8, fov: 70 });
  assert.equal(pov.pan, -85);
  assert.equal(pov.tilt, 8);
  assert.equal(pov.fov, 70);
  assert.equal(motion.walkingViewPov(null, frame('a', 0, 170), null).pan, 170);
});

test('turns use the short arc; movement is slower, bounded and date-aware', () => {
  const middle = motion.interpolateWalkingPov({ pan: 179, tilt: 0, fov: 95 }, { pan: -179, tilt: 6, fov: 85 }, .5);
  assert.equal(Math.abs(middle.pan), 180);
  assert.equal(middle.tilt, 3);
  const a = frame('a', 0, 0), b = frame('b', 5, 0), far = frame('c', 40, 80);
  assert.ok(motion.walkingPlaybackTiming(a, b).totalMs >= 1900);
  assert.ok(motion.walkingPlaybackTiming(a, b).transitionMs >= 380);
  assert.ok(motion.walkingPlaybackTiming(a, far).totalMs <= 4800);
  assert.ok(motion.walkingPlaybackTiming(a, b, true).transitionMs <= 700);
  assert.ok(motion.walkingPlaybackTiming(a, { ...b, photodate: '2025-01-01' }).transitionMs <= 1000);
});

function fixture({ reduced = false } = {}) {
  let time = 0, nextRaf = 0, ready = true;
  const rafs = new Map(), animations = [], viewers = [], requests = [];
  class Host {
    constructor() {
      this.style = { setProperty: (name, value) => { this.style[name] = value; } };
      this.events = new Map();
    }
    setAttribute() {}
    remove() { this.removed = true; }
    addEventListener(name, fn) { this.events.set(name, fn); }
    removeEventListener(name) { this.events.delete(name); }
    querySelectorAll() { return Array.from({ length: 4 }, () => ({ src: `/image/${this.viewer.id}/0`, complete: ready, naturalWidth: ready ? 512 : 0 })); }
    animate(keys, options) {
      let resolve, reject;
      const animation = { keys, options, finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        finish: () => resolve(), cancel: () => reject(new Error('cancelled')) };
      animations.push(animation);
      return animation;
    }
  }
  class Panorama {
    constructor(host, options) {
      this.host = host; host.viewer = this; this.id = options.panoId; this.pov = options.pov;
      this.poses = []; viewers.push(this);
    }
    getElement() { return this.host; }
    getLocation() { return { coord: { lat: () => 37.5, lng: () => 127 } }; }
    getPanoId() { return this.id; }
    getPov() { return { ...this.pov }; }
    setPov(pov) { this.pov = { ...pov }; this.poses.push(this.pov); }
    setPanoIdWithPov(id, pov) { this.id = id; this.pov = pov; requests.push(id); }
    setSize() {}
    setVisible() {}
    destroy() { this.destroyed = true; }
  }
  const maps = { Panorama, Size: class {} };
  const canvas = { appendChild() {} }, view = { clientWidth: 390, clientHeight: 600 };
  const initial = new Panorama(new Host(), { panoId: 'a', pov: frame('a', 0, 179).pov });
  const { createWalkPanoramaBuffer } = load('walk-panorama-buffer.js', {
    interpolateWalkingPov: motion.interpolateWalkingPov,
    document: { createElement: () => new Host() },
    window: { matchMedia: () => ({ matches: reduced }), setTimeout: fn => setTimeout(() => { time += 30; fn(); }, 0) },
    performance: { now: () => time },
    requestAnimationFrame: fn => { rafs.set(++nextRaf, fn); return nextRaf; },
    cancelAnimationFrame: id => rafs.delete(id)
  });
  const buffer = createWalkPanoramaBuffer(maps, canvas, view, initial);
  return { buffer, viewers, initial, animations, requests, rafs,
    setReady: value => { ready = value; },
    tick: ms => { time += ms; const callbacks = [...rafs.values()]; rafs.clear(); callbacks.forEach(fn => fn(time)); } };
}

async function until(predicate) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.fail('Asynchronous panorama did not settle');
}

test('keeps the current photo until ready, then blends and turns without a north spin', async () => {
  const f = fixture();
  f.setReady(false);
  let resolved = false;
  const task = f.buffer.show(frame('b', 5, -179), { durationMs: 1200 }).then(value => { resolved = true; return value; });
  await until(() => f.viewers.length === 2);
  assert.equal(f.initial.host.style.opacity, '1');
  assert.equal(f.animations.length, 0);
  f.setReady(true);
  await until(() => f.animations.length === 1);
  assert.equal(resolved, false);
  f.tick(600);
  assert.ok(Math.abs(f.viewers[1].pov.pan) >= 179);
  assert.equal(f.animations[0].options.duration, 1200);
  f.animations[0].finish();
  assert.equal(await task, f.viewers[1]);
  assert.equal(f.initial.host.style.opacity, '0');
  assert.equal(f.viewers[1].pov.pan, -179);
  assert.equal(f.rafs.size, 0);
  f.buffer.stop();
});

test('does not reuse the outgoing photo for prefetch during a blend', async () => {
  const f = fixture();
  const task = f.buffer.show(frame('b', 5, -179));
  await until(() => f.animations.length === 1);
  f.buffer.prefetch(frame('c', 10, -175));
  await new Promise(resolve => setTimeout(resolve, 3));
  assert.equal(f.initial.id, 'a');
  f.animations[0].finish();
  await task;
  await until(() => f.requests.includes('c'));
  assert.equal(f.initial.id, 'c');
  f.buffer.stop();
});

test('steering ends the automatic turn and keeps the view chosen by the user', async () => {
  const f = fixture();
  const task = f.buffer.show(frame('b', 5, -170));
  await until(() => f.animations.length === 1);
  f.viewers[1].host.events.get('pointerdown')();
  f.viewers[1].setPov({ pan: 80, tilt: 10, fov: 75 });
  const viewer = await task;
  assert.equal(viewer.pov.pan, 80);
  assert.equal(viewer.host.events.size, 0);
  f.buffer.stop();
});

test('stopping during a blend settles the pending request and cleans up both viewers', async () => {
  const f = fixture();
  const task = f.buffer.show(frame('b', 5, -179));
  await until(() => f.animations.length === 1);
  f.buffer.stop();
  assert.equal(await task, null);
  assert.equal(f.rafs.size, 0);
  assert.ok(f.viewers.every(viewer => viewer.destroyed && viewer.host.removed));
});

test('reduced motion reveals only a loaded photo and creates no transition', async () => {
  const f = fixture({ reduced: true });
  const viewer = await f.buffer.show(frame('b', 5, -179));
  assert.equal(viewer.pov.pan, -179);
  assert.equal(f.animations.length, 0);
  f.buffer.stop();
});

test('gentle preview zoom freezes on pause and never becomes cumulative user zoom', async () => {
  const f = fixture();
  f.buffer.glide(1500);
  f.tick(750);
  assert.ok(f.initial.pov.fov < 95 && f.initial.pov.fov > 92);
  assert.equal(f.buffer.viewPov().fov, 95);
  f.buffer.stopGlide();
  const frozen = f.initial.pov.fov;
  f.tick(1000);
  assert.equal(f.initial.pov.fov, frozen);
  f.buffer.glide(1500);
  f.tick(1500);
  assert.ok(f.initial.pov.fov >= 92.8);
  assert.equal(f.buffer.viewPov().fov, 95);
  f.buffer.stop();
});

test('manual zoom interrupts preview motion and is preserved for following photos', async () => {
  const f = fixture();
  f.buffer.glide(1500);
  f.tick(500);
  f.initial.host.events.get('wheel')();
  f.initial.setPov({ pan: 100, tilt: 5, fov: 70 });
  f.tick(1500);
  assert.equal(f.buffer.viewPov().fov, 70);
  assert.equal(f.buffer.viewPov().pan, 100);
  assert.equal(f.rafs.size, 0);
  f.buffer.stop();
});

test('changing photo stops the idle glide before starting the transition', async () => {
  const f = fixture();
  f.buffer.glide(1500);
  f.tick(750);
  const task = f.buffer.show(frame('b', 5, -179), { durationMs: 420 });
  await until(() => f.animations.length === 1);
  assert.equal(f.rafs.size, 1);
  f.animations[0].finish();
  const viewer = await task;
  assert.equal(viewer.pov.fov, 95);
  assert.equal(f.buffer.viewPov().fov, 95);
  f.buffer.stop();
});
