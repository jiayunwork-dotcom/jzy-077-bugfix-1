'use strict';

// 深度剖面：把物理深度 z（自土层顶面起，0..H）映射到级数解使用的
// 无量纲距离 x = 距排水面距离 / Hdr，再求各点孔压消散比例。
// Hdr 只从 timeFactor 模块取，排水换算不在此另立一份。

const { drainagePathLength, DRAINAGE } = require('./timeFactor');
const { dissipationRatio, residualPorePressureRatio } = require('./series');

/**
 * 该深度到最近排水面的物理距离。
 * 单面排水（顶面排水、底面不透水）：距离 = z；
 * 双面排水（顶底均排水，孔压分布关于中面对称）：距离 = min(z, H-z)。
 */
function distanceToDrain(depth, layerThickness, drainage) {
  if (drainage === DRAINAGE.SINGLE) return depth;
  if (drainage === DRAINAGE.DOUBLE) return Math.min(depth, layerThickness - depth);
  throw new Error(`invalid drainage condition: ${String(drainage)}`);
}

/** 距排水面的无量纲距离 x ∈ [0,1]，排水面 x=0，最远点 x=1。 */
function normalizedDistance(depth, layerThickness, drainage) {
  const hdr = drainagePathLength(layerThickness, drainage);
  return distanceToDrain(depth, layerThickness, drainage) / hdr;
}

function defaultDepthGrid(layerThickness, nodeCount) {
  const n = Math.max(2, Math.floor(nodeCount));
  const points = [];
  for (let i = 0; i < n; i++) {
    points.push((layerThickness * i) / (n - 1));
  }
  return points;
}

/**
 * 沿深度网格逐点计算孔压消散。
 * @param {object} p
 * @param {number} p.layerThickness 土层厚度 H
 * @param {string} p.drainage 'single' | 'double'
 * @param {number} p.tv 时间因子（由编排层用唯一的 timeFactor() 算好后传入）
 * @param {number} p.initialExcessPorePressure 初始超静孔压 u0（均匀分布）
 * @param {number[]} [p.depthGrid] 自定义深度网格（位于 [0,H]）
 * @param {number} [p.nodeCount=21] 无自定义网格时的等距节点数（含上下边界）
 */
function buildDepthProfile({
  layerThickness,
  drainage,
  tv,
  initialExcessPorePressure,
  depthGrid = null,
  nodeCount = 21,
}) {
  const depths = depthGrid || defaultDepthGrid(layerThickness, nodeCount);
  return depths.map((depth) => {
    const x = normalizedDistance(depth, layerThickness, drainage);
    const dissipated = dissipationRatio(x, tv);
    const residualRatio = residualPorePressureRatio(x, tv);
    return {
      depth,
      distanceToDrain: distanceToDrain(depth, layerThickness, drainage),
      normalizedDistance: x,
      dissipationRatio: dissipated, // 孔压消散比例 (u0-u)/u0
      residualPorePressureRatio: Math.min(1, Math.max(0, residualRatio)), // u/u0
      excessPorePressure: initialExcessPorePressure * residualRatio, // 当前超静孔压 u
    };
  });
}

module.exports = {
  distanceToDrain,
  normalizedDistance,
  buildDepthProfile,
};
