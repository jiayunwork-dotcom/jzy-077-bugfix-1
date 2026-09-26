'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { DRAINAGE, drainagePathLength, timeFactor } = require('../src/timeFactor');

test('排水路径长度：单面=H，双面=H/2，换算只此一处', () => {
  assert.equal(drainagePathLength(10, DRAINAGE.SINGLE), 10);
  assert.equal(drainagePathLength(10, DRAINAGE.DOUBLE), 5);
  assert.equal(drainagePathLength(3.6, DRAINAGE.DOUBLE), 1.8);
});

test('时间因子 Tv = cv·t/Hdr²', () => {
  // 单面 Hdr=10：Tv = 1e-7 * 1e8 / 100 = 0.1
  const tvSingle = timeFactor(1e-7, 1e8, 10, DRAINAGE.SINGLE);
  assert.ok(Math.abs(tvSingle - 0.1) < 1e-12);
  // 双面 Hdr=5：Tv = 1e-7 * 1e8 / 25 = 0.4
  const tvDouble = timeFactor(1e-7, 1e8, 10, DRAINAGE.DOUBLE);
  assert.ok(Math.abs(tvDouble - 0.4) < 1e-12);
});

test('t=0 时 Tv 精确为零（单面/双面）', () => {
  assert.equal(timeFactor(1e-7, 0, 10, DRAINAGE.SINGLE), 0);
  assert.equal(timeFactor(1e-7, 0, 10, DRAINAGE.DOUBLE), 0);
});

test('cv 翻倍与 t 翻倍对 Tv 完全等价（同一层厚、同一排水条件）', () => {
  for (const drainage of [DRAINAGE.SINGLE, DRAINAGE.DOUBLE]) {
    const base = timeFactor(1e-7, 1e7, 8, drainage);
    const cvDoubled = timeFactor(2e-7, 1e7, 8, drainage);
    const timeDoubled = timeFactor(1e-7, 2e7, 8, drainage);
    assert.equal(cvDoubled, timeDoubled);
    assert.ok(Math.abs(cvDoubled - 2 * base) < 1e-15);
  }
});

test('同层厚同时刻，双面 Tv 恒为单面 Tv 的 4 倍', () => {
  const s = timeFactor(3e-8, 5e7, 12, DRAINAGE.SINGLE);
  const d = timeFactor(3e-8, 5e7, 12, DRAINAGE.DOUBLE);
  assert.ok(Math.abs(d / s - 4) < 1e-12);
});

test('非法排水条件与非法物理参数直接抛错', () => {
  assert.throws(() => drainagePathLength(10, 'triple'));
  assert.throws(() => timeFactor(0, 1, 10, DRAINAGE.SINGLE));
  assert.throws(() => timeFactor(1e-7, 1, 0, DRAINAGE.SINGLE));
  assert.throws(() => timeFactor(1e-7, -1, 10, DRAINAGE.SINGLE));
});
