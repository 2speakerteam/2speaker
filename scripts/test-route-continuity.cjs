// Run: node scripts/test-route-continuity.cjs
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');

(async () => {
  const { walkPreviewFrames } = await import('../src/walking-preview.mjs');
  const points = [[127, 37], [127, 37.0007], [127.0005, 37.0007], [127.0005, 37.0014]];
  const frames = walkPreviewFrames([points]);
  assert.deepEqual(frames.filter(frame => frame.phase === 'turn').map(frame => frame.direction), ['right', 'left']);
  assert.deepEqual(frames[0].position, points[0]);
  assert.ok(Math.hypot(frames.at(-1).position[0] - points.at(-1)[0],
    frames.at(-1).position[1] - points.at(-1)[1]) < 1e-8, 'Last scene remains on the actual route endpoint');
  assert.ok(frames.every((frame, index) => !index || frame.meters > frames[index - 1].meters));
  assert.ok(frames.every((frame, index) => !index || frame.meters - frames[index - 1].meters <= 32.01));

  const source = await readFile(require('node:path').join(__dirname, '../src/walking-preview.mjs'), 'utf8');
  assert.doesNotMatch(source, /Skipping a section|showFrame\(state\.index\s*\+\s*1\)/,
    'Unavailable panoramas must pause instead of silently jumping to a later frame');
  assert.match(source, /PANORAMA_TIMEOUT_MS\s*=\s*4200/,
    'A missing panorama has a bounded wait rather than holding the end indefinitely');
  console.log('Walking route continuity tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
