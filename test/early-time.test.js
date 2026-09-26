'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { DRAINAGE } = require('../src/timeFactor');
const { evaluateConsolidation } = require('../src/service');

const params = {
  consolidationCoefficient: 1e-8,
  layerThickness: 20,
  drainage: DRAINAGE.SINGLE,
  initialExcessPorePressure: 100,
  compressionCoefficient: 5e-4,
  additionalStress: 100,
};

function settlementMillimeters(time, drainage) {
  const result = evaluateConsolidation({ ...params, time, drainage });
  return result.settlementAtTime * 1000;
}

test('早期沉降严格遵循平方根规律：t=1s 单面约 0.00564 mm', () => {
  const s1 = settlementMillimeters(1, DRAINAGE.SINGLE);
  assert.ok(Math.abs(s1 - 0.00564189584) < 1e-6, `got ${s1} mm`);

  assert.equal(
    evaluateConsolidation({ ...params, time: 1 }).finalSettlement,
    1,
  );

  // 时间放大 10 倍，沉降放大 √10 倍；不允许停在固定“底数”上。
  const s01 = settlementMillimeters(0.1, DRAINAGE.SINGLE);
  const s001 = settlementMillimeters(0.01, DRAINAGE.SINGLE);
  assert.ok(Math.abs(s01 - 0.00178412412) < 1e-6, `got ${s01} mm`);
  assert.ok(Math.abs(s001 - 0.000564189584) < 1e-6, `got ${s001} mm`);
  assert.ok(Math.abs(s1 / s01 - Math.sqrt(10)) < 1e-12);
  assert.ok(Math.abs(s01 / s001 - Math.sqrt(10)) < 1e-12);

  const sTiny = settlementMillimeters(1e-100, DRAINAGE.SINGLE);
  const sLater = settlementMillimeters(1e-98, DRAINAGE.SINGLE);
  assert.ok(sTiny > 0);
  assert.ok(Math.abs(sLater / sTiny - 10) < 1e-12);
});

test('极早期双面排水沉降为单面的两倍', () => {
  for (const time of [0.01, 0.1, 1]) {
    const single = settlementMillimeters(time, DRAINAGE.SINGLE);
    const double = settlementMillimeters(time, DRAINAGE.DOUBLE);
    assert.ok(Math.abs(double / single - 2) < 1e-12,
      `t=${time}: double/single=${double / single}`);
  }
});

test('同一深度点的消散比例随时间单调不减（单面/双面）', () => {
  for (const drainage of [DRAINAGE.SINGLE, DRAINAGE.DOUBLE]) {
    const depthGrid = drainage === DRAINAGE.SINGLE
      ? [1, 5, 10, 19]
      : [1, 5, 10, 19]; // 19 m 距底面排水面 1 m，与 1 m 点对称
    let previous = new Map(depthGrid.map((depth) => [depth, 0]));

    for (let exponent = -30; exponent <= 9; exponent += 0.5) {
      const time = 10 ** exponent;
      const result = evaluateConsolidation({
        ...params,
        drainage,
        time,
        depthGrid,
      });
      for (const point of result.profile) {
        const prev = previous.get(point.depth);
        assert.ok(
          point.dissipationRatio >= prev - 1e-12,
          `${drainage} depth=${point.depth} t=${time}: ` +
          `${point.dissipationRatio} < ${prev}`,
        );
        previous.set(point.depth, point.dissipationRatio);
      }
    }
  }
});

test('加荷头一秒，距最近排水面 1 m 以外的点消散比例不超过 1e-9', () => {
  const single = evaluateConsolidation({
    ...params,
    drainage: DRAINAGE.SINGLE,
    time: 1,
    depthGrid: [1.1, 5, 10, 19],
  });
  for (const point of single.profile) {
    assert.ok(point.dissipationRatio <= 1e-9,
      `single depth=${point.depth}: ${point.dissipationRatio}`);
  }

  const double = evaluateConsolidation({
    ...params,
    drainage: DRAINAGE.DOUBLE,
    time: 1,
    depthGrid: [1.1, 5, 10, 18.9],
  });
  for (const point of double.profile) {
    assert.ok(point.dissipationRatio <= 1e-9,
      `double depth=${point.depth}: ${point.dissipationRatio}`);
  }
});

test('默认 201 个深度点、任意小时间均在 1 秒内返回', () => {
  for (const time of [1e-300, 1e-100, 0.01, 1]) {
    const started = performance.now();
    const result = evaluateConsolidation({
      ...params,
      time,
      nodeCount: 201,
    });
    assert.equal(result.profile.length, 201);
    assert.ok(performance.now() - started < 1000, `t=${time} 超时`);
  }
});
