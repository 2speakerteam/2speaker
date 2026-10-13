// Run: node scripts/test-walk-preview.mjs
// Offline unit tests for route geometry and synchronized walking cues.
import assert from 'node:assert/strict';
import {
  walkPreviewBearing,
  walkPreviewDistance,
  walkPreviewFrames,
  walkPreviewInstruction
} from '../src/walking-preview.mjs';

const A = [127, 37];
const north = [127, 37.001];
const east = [127.001, 37.001];
const south = [127.001, 37];
const route = [[A, north, east, south]];
const frames = walkPreviewFrames(route);
const turns = frames.filter(frame => frame.phase === 'turn');

assert.equal(turns.length, 2, 'Both genuine route corners are retained');
assert.ok(turns.every(frame => frame.direction === 'right'), 'Turn direction follows the route geometry');
assert.equal(frames[0].phase, 'start', 'The sequence starts at the TMAP route origin');
assert.equal(frames.at(-1).phase, 'arrival', 'The sequence ends at the TMAP route destination');
assert.match(walkPreviewInstruction(frames.at(-1)), /목적지에 도착/);
assert.match(walkPreviewInstruction(turns[0]), /여기서 우회전/);
assert.ok(frames.filter(frame => frame.phase === 'approach')
  .every(frame => /직진 후 우회전/.test(walkPreviewInstruction(frame))), 'The cue changes with its matching approach scene');
assert.ok(frames.slice(0, -1).every(frame => frame.showArrow), 'Every visible route scene receives one road-plane arrow');
assert.equal(frames.at(-1).showArrow, false, 'Arrival does not retain an obsolete direction arrow');
assert.ok(frames.every((frame, index) => !index || frame.meters >= frames[index - 1].meters), 'Scenes stay in travel order');
assert.ok(frames.every((frame, index) => !index || frame.meters - frames[index - 1].meters <= 32.01), 'Straight sections do not jump over long route gaps');
assert.ok(frames.every(frame => Number.isFinite(frame.heading)), 'Each scene has a route-relative camera heading');

const leftFrames = walkPreviewFrames([[A, [127.001, 37], east]]);
assert.equal(leftFrames.find(frame => frame.phase === 'turn')?.direction, 'left', 'Left turns stay left');

const crossing = walkPreviewFrames([[A, north]], [
  { position: [127, 37.0005], description: '횡단보도를 건너 직진' }
]);
assert.equal(crossing.filter(frame => frame.phase === 'turn').length, 1, 'Provider walking instruction is kept');
assert.match(walkPreviewInstruction(crossing.find(frame => frame.phase === 'turn')), /횡단보도/);

const measured = walkPreviewDistance(A, north);
assert.ok(measured > 110 && measured < 112, 'Distance is measured in meters');
assert.ok(walkPreviewBearing(A, north) < 1 || walkPreviewBearing(A, north) > 359, 'Northbound bearing is stable');

assert.deepEqual(walkPreviewFrames([[A, north], [[127.01, 37.01], east]]), [], 'Disconnected path segments are rejected, never bridged');
assert.deepEqual(walkPreviewFrames([[A, null, north]]), [], 'Invalid route coordinates are rejected');
assert.deepEqual(walkPreviewFrames([[A, A]]), [], 'Zero-length routes have no playback scenes');

const alternateArea = walkPreviewFrames([[[126.9, 37.2], [126.9, 37.201], [126.901, 37.201]]]);
assert.equal(alternateArea.filter(frame => frame.phase === 'turn').length, 1, 'Turn detection is based on any route geometry, not hard-coded places');

console.log('Walking preview geometry tests passed.');
