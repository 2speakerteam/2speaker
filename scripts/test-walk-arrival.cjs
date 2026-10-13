// Run: node scripts/test-walk-arrival.cjs
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const source = await readFile(path.join(__dirname, '../src/main.js'), 'utf8');
  const { walkPreviewFrames, walkPreviewInstruction } = await import('../src/walking-preview.mjs');
  const routeEnd = [127.001, 37.001];
  const frames = walkPreviewFrames([[[127, 37], [127, 37.0005], routeEnd]]);

  assert.equal(frames.at(-1).phase, 'arrival');
  assert.deepEqual(frames.at(-1).position, routeEnd, 'Arrival stays at the exact TMAP endpoint');
  assert.equal(walkPreviewInstruction(frames.at(-1)), '목적지에 도착했어요.');
  assert.doesNotMatch(source, /prepareLodgingArrival|routeToLodgingFront|arrivalAtFront/,
    'Lodging must not replace or extend the requested route endpoint');
  assert.match(source, /fetch\('\/api\/walking\/routes'/,
    'Walking directions continue to use the TMAP walking route endpoint');
  assert.doesNotMatch(source, /id="walk-preview-close"|walk-preview-map-button/,
    'The walking preview does not add a map-view button over the panorama');

  console.log('Walking route endpoint tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
