'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  residualPorePressureRatio,
  dissipationRatio,
  averageConsolidation,
} = require('../src/series');

test('Tv=0：平均固结度精确为 0，各深度消散比例全为 0', () => {
  assert.equal(averageConsolidation(0), 0);
  for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    assert.equal(dissipationRatio(x, 0), 0);
    assert.equal(residualPorePressureRatio(x, 0), 1);
  }
});

test('Tv 足够大：平均固结度收敛到 1，消散比例整体逼近 100%', () => {
  // Tv=3 时残余首项 (2/M1²)e^(-M1²·3) ≈ 5.1e-4；Tv=5 时 ≈ 3.5e-7
  assert.ok(Math.abs(averageConsolidation(3) - 1) < 1e-3);
  assert.ok(Math.abs(averageConsolidation(5) - 1) < 1e-5);
  assert.ok(Math.abs(averageConsolidation(8) - 1) < 1e-8);
  for (const x of [0, 0.2, 0.5, 0.8, 1]) {
    assert.ok(dissipationRatio(x, 3) > 0.99);
  }
});

test('与太沙基标准固结度表一致（Tv=0.1→U≈0.357，Tv=0.5→U≈0.764）', () => {
  assert.ok(Math.abs(averageConsolidation(0.1) - 0.357) < 1e-3);
  assert.ok(Math.abs(averageConsolidation(0.5) - 0.764) < 1e-3);
  assert.ok(Math.abs(averageConsolidation(1.0) - 0.931) < 1e-3);
});

test('平均固结度随 Tv 单调不减', () => {
  let prev = 0;
  for (let tv = 0; tv <= 2.5; tv += 0.05) {
    const u = averageConsolidation(tv);
    assert.ok(u >= prev - 1e-12, `U(${tv})=${u} < U(prev)=${prev}`);
    prev = u;
  }
});

test('排水面 x=0 处任意正时刻立即消散完毕', () => {
  for (const tv of [1e-6, 0.01, 0.5, 2]) {
    assert.ok(dissipationRatio(0, tv) > 1 - 1e-9);
  }
});

test('小时间因子：级数取足项数，排水面附近消散比例与半无限体解析解一致', () => {
  // 半无限体解析解：消散比例 = 1 - erf(x/(2√Tv))
  // Tv=1e-4, x=0.01 → 1 - erf(0.5) ≈ 0.4795001222
  const tv = 1e-4;
  const x = 0.01;
  const got = dissipationRatio(x, tv);
  const expected = 1 - 0.5204998778130465;
  assert.ok(Math.abs(got - expected) < 1e-6, `got ${got}, expected ${expected}`);
});
