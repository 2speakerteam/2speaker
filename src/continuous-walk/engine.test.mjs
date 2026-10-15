import assert from 'node:assert/strict';
import test from 'node:test';
import { ContinuousWalkEngine } from './engine.mjs';
import { buildRoute, decisionsFor, instructionAt, pointAt, targetsFor } from './route.mjs';

const start = { lat: 37.58878, lng: 127.0875 };
function routeWithLength(meters = 350) {
  return {
    segments: [{ mode: 'WALK', coordinates: [
      [start.lng, start.lat],
      [start.lng, start.lat + meters / 111194.9]
    ] }], guidePoints: []
  };
}

function adapterFor(route, { missingFrom = Infinity, missingTo = Infinity } = {}) {
  const path = buildRoute(route);
  const seen = [];
  return {
    seen, prepared: [], revealed: [],
    async probe(target) {
      seen.push(target.progress);
      if (target.progress >= missingFrom && target.progress <= missingTo) return null;
      // Each 5m query resolves to its own real-camera shaped result.
      const camera = pointAt(path, target.progress);
      return { panoId: `pano-${Math.round(target.progress)}`, camera, projectedPan: 0 };
    },
    async prepare(frame, slot) { this.prepared.push([frame.panoId, slot]); return true; },
    async reveal(slot, frame, instruction) { this.revealed.push([slot, frame.progress, instruction]); }
  };
}

test('long route reaches the destination without a scene-count limit and shows the start first', async () => {
  const route = routeWithLength(2500);
  const adapter = adapterFor(route);
  const engine = new ContinuousWalkEngine({ route, adapter });
  assert.equal(await engine.start({ autoplay: false }), true);
  assert.equal(engine.index, 0);
  assert.ok(engine.metrics.firstFrameMs !== null);
  assert.ok(engine.scanned < engine.targets.length, 'first frame must arrive before the full scan');
  await engine.scanPromise;
  assert.ok(engine.frames.at(-1).progress >= engine.path.length - 8);
  assert.equal(engine.coverage().complete, true);
  assert.equal(engine.coverage().gaps, 0);
  engine.stop();
});

test('missing capture span is reported while playback can continue to the destination', async () => {
  const route = routeWithLength(80);
  const adapter = adapterFor(route, { missingFrom: 20, missingTo: 44 });
  const engine = new ContinuousWalkEngine({ route, adapter });
  await engine.start({ autoplay: false });
  await engine.scanPromise;
  assert.equal(engine.coverage().complete, false);
  assert.ok(engine.coverage().gaps > 0);
  assert.ok(engine.coverage().missingSpans.some((span) => span.meters >= 20));
  while (engine.frames[engine.index + 1]) {
    assert.equal(await engine.show(engine.index + 1, { automatic: true }), true);
  }
  assert.ok(engine.frames[engine.index].progress >= engine.path.length - 8);
  engine.stop();
});

test('previous, next, pause, speed and guidance preserve frame selection', async () => {
  const route = routeWithLength(60);
  const adapter = adapterFor(route);
  const engine = new ContinuousWalkEngine({ route, adapter });
  await engine.start({ autoplay: false });
  await engine.scanPromise;
  assert.equal(await engine.next(), true);
  assert.equal(engine.index, 1);
  assert.equal(await engine.previous(), true);
  assert.equal(engine.index, 0);
  engine.setSpeed(2);
  assert.equal(engine.speed, 2);
  engine.play();
  assert.equal(engine.playing, true);
  engine.pause();
  assert.equal(engine.playing, false);
  assert.equal(adapter.revealed[0][2].direction, 'straight');
  engine.stop();
});

test('turn targets and instruction change at a real route corner', () => {
  const route = {
    segments: [{ mode: 'WALK', coordinates: [
      [127.0875, 37.58878], [127.0875, 37.58932], [127.0881, 37.58932]
    ] }],
    guidePoints: [{ lat: 37.58932, lng: 127.0875, turnType: 12 }]
  };
  const path = buildRoute(route);
  const decisions = decisionsFor(path);
  assert.ok(decisions.some((item) => item.direction === 'right'));
  assert.ok(targetsFor(path, decisions).some((item) => Math.abs(item.progress - decisions[0].progress) < .1));
  assert.equal(instructionAt(decisions[0].progress - 5, decisions, path.length).direction, 'right');
});
