'use strict';

// 早期（小时间因子）行为钉死：
// 旧实现用条件收敛的傅里叶级数硬算小 Tv，m 截断在 20000 项，
// 截尾约 1e-5 量级且随 Tv 非单调，表现为“极早期沉降停在底数、剖面假消散
// 且随时间倒退”。现在小 Tv 改走镜像法补误差函数解，这些用例钉住修复结果。

const test = require('node:test');
const assert = require('node:assert/strict');

const { DRAINAGE, timeFactor } = require('../src/timeFactor');
const {
  residualPorePressureRatio,
  dissipationRatio,
  averageConsolidation,
  SWITCH_TV,
} = require('../src/series');
const { evaluateConsolidation } = require('../src/service');

// 用户核对时所用的一组参数
const params = {
  consolidationCoefficient: 1e-8, // cv = 1e-8 m²/s
  layerThickness: 20, // H = 20 m
  drainage: DRAINAGE.SINGLE,
  initialExcessPorePressure: 100, // u0 = 100 kPa
  compressionCoefficient: 5e-4, // mv = 5e-4 1/kPa
  additionalStress: 100, // Δσ = 100 kPa → S∞ = 1 m
};

const SINGLE_TV1 = timeFactor(1e-8, 1, 20, DRAINAGE.SINGLE); // 2.5e-11
const DOUBLE_TV1 = timeFactor(1e-8, 1, 20, DRAINAGE.DOUBLE); // 1e-10

function settlement(result) {
  return result.settlementAtTime;
}

test('早期沉降守平方根规律：t=1s 单面 0.00564mm（偏差千分之一内），双面约为两倍', () => {
  const single = evaluateConsolidation({ ...params, time: 1 });
  const double = evaluateConsolidation({ ...params, drainage: DRAINAGE.DOUBLE, time: 1 });

  // 期望 2√(Tv/π)·S∞：0.0056419 mm
  assert.ok(Math.abs(settlement(single) - 0.0056419e-3) / 0.0056419e-3 < 1e-3);
  // 半无限体早期近似下双面（Tv×4）恰为单面两倍，误差远小于 1e-6
  assert.ok(Math.abs(settlement(double) / settlement(single) - 2) < 1e-6);
});

test('t=0.1s、0.01s 沉降按 √10 比例缩小，不停在任何底数上', () => {
  // 期望：0.001784mm、0.000564mm
  const r01 = evaluateConsolidation({ ...params, time: 0.1 });
  const r001 = evaluateConsolidation({ ...params, time: 0.01 });
  assert.ok(Math.abs(settlement(r01) - 0.001784e-3) / (0.001784e-3) < 1e-3);
  assert.ok(Math.abs(settlement(r001) - 0.000564e-3) / (0.000564e-3) < 1e-3);
  // 两档之比 ≈ √10，与 t=1s 档之比 ≈ √10
  const r1 = evaluateConsolidation({ ...params, time: 1 });
  assert.ok(Math.abs(settlement(r01) / settlement(r001) - Math.sqrt(10)) < 1e-9);
  assert.ok(Math.abs(settlement(r1) / settlement(r01) - Math.sqrt(10)) < 1e-9);

  // 一直小到 1e-12 s 都必须随 √t 线性变化（Tv=2.5e-23，旧实现会停在 1e-5 底数）
  const scaled = (t) =>
    settlement(evaluateConsolidation({ ...params, time: t })) / Math.sqrt(t);
  const base = scaled(1);
  for (const t of [1e-12, 1e-9, 1e-6, 1e-3]) {
    assert.ok(Math.abs(scaled(t) / base - 1) < 1e-9, `t=${t} 未按 √t 缩放`);
  }
});

test('任意正时间的早期平均固结度都服从 U ≈ 2√(Tv/π)', () => {
  for (const tv of [1e-30, 1e-20, 1e-12, 1e-8, SINGLE_TV1, 1e-5, 1e-3]) {
    const expected = 2 * Math.sqrt(tv / Math.PI);
    assert.ok(Math.abs(averageConsolidation(tv) / expected - 1) < 1e-9,
      `Tv=${tv}: U=${averageConsolidation(tv)}, expected≈${expected}`);
  }
});

test('同一深度点消散比例随时间单调不减（跨 1e-20…10、并细粒度跨过切换阈值）', () => {
  const xs = [0, 0.05, 0.1, 0.5, 0.9, 1];
  const tvs = [];
  for (let e = -20; e <= 1; e += 0.5) tvs.push(Math.pow(10, e));
  // 在镜像级数/傅里叶级数切换阈值附近加密，任何分支跳变都会破坏单调性
  for (let f = 1 - 5e-4; f <= 1 + 5e-4; f += 1e-4) {
    tvs.push(SWITCH_TV * f);
  }
  tvs.sort((a, b) => a - b);
  for (const x of xs) {
    let prev = 0;
    for (const tv of tvs) {
      const v = dissipationRatio(x, tv);
      assert.ok(v >= prev - 1e-12,
        `x=${x} Tv=${tv}: 消散比例倒退 ${v} < ${prev}`);
      prev = v;
    }
  }
});

test('恒载下 u/u0 随时间单调不增，且与消散比例严格互补', () => {
  for (const x of [0.05, 0.5, 1]) {
    let prev = 1;
    for (let e = -20; e <= 1; e += 0.25) {
      const tv = Math.pow(10, e);
      const u = residualPorePressureRatio(x, tv);
      assert.ok(u <= prev + 1e-12, `x=${x} Tv=${tv}: 残余孔压回升 ${u} > ${prev}`);
      assert.equal(u + dissipationRatio(x, tv), 1);
      prev = u;
    }
  }
});

test('头一秒内，距最近排水面 1m 以外各点消散比例不超过 1e-9（单面与双面）', () => {
  for (const drainage of [DRAINAGE.SINGLE, DRAINAGE.DOUBLE]) {
    for (const time of [0.01, 0.1, 1]) {
      const r = evaluateConsolidation({
        ...params,
        drainage,
        time,
        nodeCount: 201,
      });
      for (const p of r.profile) {
        if (p.distanceToDrain >= 1) {
          assert.ok(p.dissipationRatio <= 1e-9,
            `${drainage} t=${time} depth=${p.depth}: ${p.dissipationRatio}`);
        }
      }
    }
  }
  // 级数直算复核：x=0.5（单面 10m 深）、x=0.05（1m）在 t=1s 恒为零
  assert.equal(dissipationRatio(0.5, SINGLE_TV1), 0);
  assert.equal(dissipationRatio(0.05, SINGLE_TV1), 0);
});

test('极早期双面排水严格快于单面（同一物理时刻）', () => {
  for (const time of [1e-6, 0.01, 1]) {
    const s = evaluateConsolidation({ ...params, time });
    const d = evaluateConsolidation({ ...params, drainage: DRAINAGE.DOUBLE, time });
    assert.ok(d.averageConsolidation > s.averageConsolidation);
    assert.equal(d.timeFactor, 4 * s.timeFactor);
  }
  // 直算级数：Tv×4 对应四倍物理时间，U 严格增大
  assert.ok(averageConsolidation(DOUBLE_TV1) > averageConsolidation(SINGLE_TV1));
});

test('镜像级数与傅里叶级数在切换阈值处一致（衔接无跳变）', () => {
  const tv = SWITCH_TV;
  const tvLo = SWITCH_TV * (1 - 1e-6);
  const tvHi = SWITCH_TV * (1 + 1e-6);
  for (const x of [0, 0.01, 0.1, 0.5, 0.9, 1]) {
    // 阈值两侧相邻点的物理增量远大于任何公式差（1e-16 量级），
    // 用宽松但远小于物理增量的界钉住衔接
    assert.ok(Math.abs(dissipationRatio(x, tvLo) - dissipationRatio(x, tvHi)) < 1e-5);
  }
  assert.ok(Math.abs(averageConsolidation(tvLo) - averageConsolidation(tvHi)) < 1e-4);
});

test('性能：默认网格与 201 深度点、任意小的时间都在 1s 内返回', () => {
  for (const time of [0, 1e-20, 1e-10, 1e-3, 1]) {
    for (const drainage of [DRAINAGE.SINGLE, DRAINAGE.DOUBLE]) {
      const t0 = process.hrtime.bigint();
      evaluateConsolidation({ ...params, drainage, time }); // 默认 21 点
      const t1 = process.hrtime.bigint();
      evaluateConsolidation({ ...params, drainage, time, nodeCount: 201 });
      const t2 = process.hrtime.bigint();
      assert.ok(Number(t1 - t0) < 1e9, `默认网格超时 t=${time}`);
      assert.ok(Number(t2 - t1) < 1e9, `201 点超时 t=${time}`);
    }
  }
});
