const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const observers = [];
  const node = () => {
    const classes = new Set();
    return {
      children: [], style: {}, events: new Map(), clientWidth: 400, clientHeight: 600,
      classList: { add: n => classes.add(n), remove: n => classes.delete(n), contains: n => classes.has(n) },
      appendChild(child) { this.children.push(child); },
      setAttribute() {}, remove() {},
      addEventListener(n, fn) { this.events.set(n, fn); },
      removeEventListener(n) { this.events.delete(n); }
    };
  };
  const canvas = node(), view = node();
  const face = { style: {} };
  const cube = { style: { perspective: '1000px' }, querySelector: () => face };
  const renderer = { querySelectorAll: () => [cube] };
  const matrix = (pan, tilt, focal = 1000) => {
    cube.style.perspective = `${focal}px`;
    const r = Math.PI / 180;
    const values = [Math.cos(pan * r), 0, 0, 0, 0, Math.cos(tilt * r), Math.sin(tilt * r), 0, Math.sin(pan * r), 0, 1, 0, 0, 0, 0, 1];
    face.style.transform = `matrix3d(${values.join(',')})`;
  };
  matrix(20, 10);
  const source = fs.readFileSync(path.join(__dirname, '../src/walk-route-arrow-layer.js'), 'utf8')
    .replace('export function ', 'function ');
  const module = { exports: {} };
  vm.runInNewContext(`${source}\nmodule.exports = { createWalkRouteArrowLayer };`, {
    module, document: { createElement: node },
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} },
    DOMMatrixReadOnly: class {
      constructor(value) {
        const v = value.slice(9, -1).split(',').map(Number);
        [this.m11, this.m22, this.m23, this.m31] = [v[0], v[5], v[6], v[8]];
      }
    }
  });
  const layer = module.exports.createWalkRouteArrowLayer(canvas, view);
  return { layer, canvas, renderer, matrix, root: view.children[0], graphic: view.children[0].children[0],
    mutate: () => observers.forEach(o => o.callback()) };
}

test('automatic scene setup uses one coherent camera pose despite stale SDK matrices', () => {
  const f = fixture();
  f.layer.show(null, 'straight', false, 'a', 0, { pan: 0, tilt: 0, fov: 95 }, f.renderer);
  assert.equal(parseFloat(f.graphic.style.left), 200);
  assert.ok(Math.abs(parseFloat(f.graphic.style.top) - 432) < .001);
  assert.match(f.graphic.style.transform, /rotate\(0deg\)/);
  f.matrix(-40, -20);
  f.mutate();
  assert.equal(parseFloat(f.graphic.style.left), 200);
  assert.ok(Math.abs(parseFloat(f.graphic.style.top) - 432) < .001);
  f.layer.stop();
});

test('handoff holds the arrow still until the new scene is committed', () => {
  const f = fixture();
  f.layer.show(null, 'straight', false, 'a', 0, { pan: 0, tilt: 0, fov: 95 }, f.renderer);
  const before = { ...f.graphic.style };
  f.layer.hold();
  f.layer.setPov({ pan: 25, tilt: 15, fov: 70 });
  f.matrix(70, 25);
  f.mutate();
  assert.deepEqual(f.graphic.style, before);
  f.layer.show(null, 'straight', false, 'b', 0, { pan: 25, tilt: 0, fov: 95 }, f.renderer);
  assert.equal(f.root.hidden, false);
  assert.equal(parseFloat(f.graphic.style.left), 200);
  assert.ok(Math.abs(parseFloat(f.graphic.style.top) - 432) < .001);
  f.layer.stop();
});

test('manual dragging still follows the calibrated rendered camera', () => {
  const f = fixture();
  f.matrix(20, 0, 275);
  f.layer.show(null, 'straight', false, 'a', 0, { pan: 100, tilt: 0, fov: 95 }, f.renderer);
  f.canvas.events.get('pointerdown')();
  f.matrix(30, 0, 275);
  f.mutate();
  assert.match(f.graphic.style.transform, /rotate\(-10deg\)/);
  assert.ok(parseFloat(f.graphic.style.left) < 200);
  f.layer.stop();
});
