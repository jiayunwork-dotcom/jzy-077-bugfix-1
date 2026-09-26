'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');

const validBody = {
  consolidationCoefficient: 1e-7,
  layerThickness: 10,
  time: 1e7,
  drainage: 'single',
  initialExcessPorePressure: 80,
  compressionCoefficient: 2.5e-4,
  additionalStress: 120,
  nodeCount: 11,
};

async function withServer(fn) {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /health 返回 ok', () => withServer(async (base) => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
}));

test('POST 合法参数返回结构化评估结果', () => withServer(async (base) => {
  const res = await fetch(`${base}/consolidation/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validBody),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.timeFactor > 0 && data.timeFactor < 1);
  assert.ok(data.averageConsolidation > 0 && data.averageConsolidation < 1);
  assert.equal(data.drainagePathLength, 10);
  assert.equal(data.profile.length, 11);
  assert.equal(data.settlementFraction, data.averageConsolidation);
  assert.ok(Math.abs(data.finalSettlement - 0.3) < 1e-12);
  for (const p of data.profile) {
    assert.ok(['depth', 'distanceToDrain', 'normalizedDistance',
      'dissipationRatio', 'residualPorePressureRatio',
      'excessPorePressure'].every((k) => k in p));
  }
}));

test('t=0：Tv 与固结度精确为零，剖面全未消散', () => withServer(async (base) => {
  const res = await fetch(`${base}/consolidation/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...validBody, time: 0 }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.timeFactor, 0);
  assert.equal(data.averageConsolidation, 0);
  assert.ok(data.profile.every((p) => p.dissipationRatio === 0));
}));

test('双面排水响应快于单面（HTTP 层也成立）', () => withServer(async (base) => {
  const ask = (drainage) => fetch(`${base}/consolidation/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...validBody, drainage }),
  }).then((r) => r.json());
  const [s, d] = await Promise.all([ask('single'), ask('double')]);
  assert.equal(d.drainagePathLength, 5);
  assert.equal(d.timeFactor, 4 * s.timeFactor);
  assert.ok(d.averageConsolidation > s.averageConsolidation);
}));

test('非法参数返回 400 与结构化错误，不会给出任何计算数字', () => withServer(async (base) => {
  const res = await fetch(`${base}/consolidation/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...validBody, layerThickness: -10, additionalStress: -1 }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'invalid_input');
  assert.ok(Array.isArray(data.details) && data.details.length === 2);
  assert.ok(data.details.some((d) => d.field === 'layerThickness'));
  assert.ok(data.details.some((d) => d.field === 'additionalStress'));
  assert.equal(data.averageConsolidation, undefined);
}));

test('非法 JSON 返回结构化 400', () => withServer(async (base) => {
  const res = await fetch(`${base}/consolidation/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'invalid_json');
}));
