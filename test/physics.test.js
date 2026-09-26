'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { DRAINAGE, timeFactor } = require('../src/timeFactor');
const { buildDepthProfile } = require('../src/profile');
const { evaluateConsolidation } = require('../src/service');

const base = {
  consolidationCoefficient: 1e-7,
  layerThickness: 10,
  drainage: DRAINAGE.SINGLE,
  initialExcessPorePressure: 80,
  compressionCoefficient: 2.5e-4, // mv, 单位 1/kPa
  additionalStress: 120, // kPa
  nodeCount: 51,
};

test('深度单调性：离排水面越远，消散比例越低（单面，多组 Tv）', () => {
  for (const time of [1e6, 5e6, 2e7, 1e8]) {
    const tv = timeFactor(base.consolidationCoefficient, time, 10, DRAINAGE.SINGLE);
    const profile = buildDepthProfile({
      layerThickness: 10,
      drainage: DRAINAGE.SINGLE,
      tv,
      initialExcessPorePressure: 80,
      nodeCount: 101,
    });
    let prev = Infinity;
    for (const p of profile) {
      // 自排水面向下，depth 增大、距离排水面更远，消散比例不得升高
      assert.ok(p.dissipationRatio <= prev + 1e-12,
        `t=${time} depth=${p.depth} ratio=${p.dissipationRatio} > prev=${prev}`);
      prev = p.dissipationRatio;
    }
  }
});

test('双面排水剖面关于中面对称，且中点消散最慢', () => {
  const tv = timeFactor(1e-7, 5e7, 10, DRAINAGE.DOUBLE);
  const profile = buildDepthProfile({
    layerThickness: 10,
    drainage: DRAINAGE.DOUBLE,
    tv,
    initialExcessPorePressure: 80,
    nodeCount: 51,
  });
  const n = profile.length;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    assert.ok(Math.abs(
      profile[i].dissipationRatio - profile[n - 1 - i].dissipationRatio,
    ) < 1e-12);
  }
  const mid = profile[Math.floor(n / 2)];
  for (const p of profile) {
    assert.ok(mid.dissipationRatio <= p.dissipationRatio + 1e-12);
  }
});

test('双面排水平均固结度高于单面：多组 cv/t/H 下逐一验证', () => {
  const cases = [
    { consolidationCoefficient: 1e-7, layerThickness: 10, time: 1e7 },
    { consolidationCoefficient: 5e-8, layerThickness: 6, time: 4e7 },
    { consolidationCoefficient: 2e-7, layerThickness: 15, time: 8e6 },
    { consolidationCoefficient: 3.2e-8, layerThickness: 4.5, time: 9e7 },
    { consolidationCoefficient: 1e-6, layerThickness: 20, time: 5e5 },
  ];
  for (const c of cases) {
    const s = evaluateConsolidation({ ...base, ...c, drainage: DRAINAGE.SINGLE });
    const d = evaluateConsolidation({ ...base, ...c, drainage: DRAINAGE.DOUBLE });
    assert.ok(d.averageConsolidation > s.averageConsolidation,
      `case ${JSON.stringify(c)}: double=${d.averageConsolidation} <= single=${s.averageConsolidation}`);
    assert.equal(d.timeFactor, 4 * s.timeFactor);
  }
});

test('cv 翻倍与 t 翻倍：Tv、平均固结度、全剖面消散比例完全等价', () => {
  for (const drainage of [DRAINAGE.SINGLE, DRAINAGE.DOUBLE]) {
    const a = evaluateConsolidation({ ...base, drainage, time: 2e7, consolidationCoefficient: 1e-7 });
    const b = evaluateConsolidation({ ...base, drainage, time: 1e7, consolidationCoefficient: 2e-7 });
    assert.equal(a.timeFactor, b.timeFactor);
    assert.equal(a.averageConsolidation, b.averageConsolidation);
    assert.equal(a.profile.length, b.profile.length);
    for (let i = 0; i < a.profile.length; i++) {
      assert.equal(a.profile[i].dissipationRatio, b.profile[i].dissipationRatio);
    }
  }
});

test('沉降：S∞=mv·Δσ·H，S(t)=S∞·U，沉降比例=U；Tv=0 时沉降为零', () => {
  const r = evaluateConsolidation({ ...base, time: 2e7 });
  const sInf = 2.5e-4 * 120 * 10; // 0.30 m
  assert.ok(Math.abs(r.finalSettlement - 0.3) < 1e-12);
  assert.ok(Math.abs(r.settlementAtTime - sInf * r.averageConsolidation) < 1e-12);
  assert.equal(r.settlementFraction, r.averageConsolidation);

  const r0 = evaluateConsolidation({ ...base, time: 0 });
  assert.equal(r0.timeFactor, 0);
  assert.equal(r0.averageConsolidation, 0);
  assert.equal(r0.settlementAtTime, 0);
  for (const p of r0.profile) assert.equal(p.dissipationRatio, 0);
});

test('输出剖面孔压满足 u/u0 与消散比例互补，且 u = u0·(u/u0)', () => {
  const r = evaluateConsolidation({ ...base, time: 3e7 });
  for (const p of r.profile) {
    assert.ok(Math.abs(p.residualPorePressureRatio + p.dissipationRatio - 1) < 1e-12);
    assert.ok(Math.abs(p.excessPorePressure - 80 * p.residualPorePressureRatio) < 1e-10);
  }
});
