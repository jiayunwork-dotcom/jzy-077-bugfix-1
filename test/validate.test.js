'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateInput } = require('../src/validate');

const valid = {
  consolidationCoefficient: 1e-7,
  layerThickness: 10,
  time: 1e7,
  drainage: 'single',
  initialExcessPorePressure: 80,
  compressionCoefficient: 2.5e-4,
  additionalStress: 120,
};

test('合法输入通过校验', () => {
  const r = validateInput(valid);
  assert.equal(r.valid, true);
  assert.equal(r.value.nodeCount, 21);
});

test('t=0 合法（初始时刻）；cv/H 给零值必须拒绝', () => {
  assert.equal(validateInput({ ...valid, time: 0 }).valid, true);
  for (const field of ['consolidationCoefficient', 'layerThickness']) {
    const r = validateInput({ ...valid, [field]: 0 });
    assert.equal(r.valid, false);
    assert.ok(r.details.some((d) => d.field === field));
  }
});

test('cv/H/t 负值、mv/Δσ 负值全部拒绝，并给结构化错误', () => {
  const bad = [
    { consolidationCoefficient: -1e-7 },
    { layerThickness: -10 },
    { time: -1 },
    { compressionCoefficient: -0.0001 },
    { additionalStress: -50 },
  ];
  for (const patch of bad) {
    const r = validateInput({ ...valid, ...patch });
    assert.equal(r.valid, false, `should reject ${JSON.stringify(patch)}`);
    assert.ok(Array.isArray(r.details));
    assert.equal(Object.keys(r.details[0]).sort().join(','), 'constraint,field,received');
  }
});

test('非法排水条件、非数值/NaN、越界深度网格均拒绝', () => {
  assert.equal(validateInput({ ...valid, drainage: 'triple' }).valid, false);
  assert.equal(validateInput({ ...valid, consolidationCoefficient: NaN }).valid, false);
  assert.equal(validateInput({ ...valid, layerThickness: '10' }).valid, false);
  assert.equal(validateInput({ ...valid, depthGrid: [0, 5, 11] }).valid, false);
  assert.equal(validateInput({ ...valid, depthGrid: [0, -1] }).valid, false);
  assert.equal(validateInput({ ...valid, depthGrid: [] }).valid, false);
  assert.equal(validateInput({ ...valid, nodeCount: 1 }).valid, false);
});

test('非法输入不会漏过校验产生任何计算结果', () => {
  const r = validateInput({ ...valid, consolidationCoefficient: 0, time: -3 });
  assert.equal(r.valid, false);
  assert.ok(r.details.length >= 2);
  assert.ok(r.details.every((d) => typeof d.constraint === 'string'));
});
