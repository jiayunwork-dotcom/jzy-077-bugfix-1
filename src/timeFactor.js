'use strict';

// 排水条件 + 时间因子：全项目唯一的 Hdr / Tv 换算定义。
// 其他模块（深度剖面、平均固结度、沉降、HTTP 层）一律引用这里，
// 不允许各自再维护一份排水路径换算逻辑。

const DRAINAGE = Object.freeze({
  SINGLE: 'single', // 单面排水：排水路径长度 = 土层厚度
  DOUBLE: 'double', // 双面排水：排水路径长度 = 土层厚度 / 2
});

/**
 * 排水路径长度（最长渗径）Hdr。
 * 单面排水: Hdr = H；双面排水: Hdr = H / 2。
 * @param {number} layerThickness 土层厚度 H (>0)
 * @param {string} drainage 'single' | 'double'
 * @returns {number}
 */
function drainagePathLength(layerThickness, drainage) {
  if (!(layerThickness > 0)) {
    throw new Error('layerThickness must be a positive number');
  }
  if (drainage === DRAINAGE.SINGLE) return layerThickness;
  if (drainage === DRAINAGE.DOUBLE) return layerThickness / 2;
  throw new Error(`invalid drainage condition: ${String(drainage)}`);
}

/**
 * 时间因子 Tv = cv * t / Hdr^2（标准太沙基定义，全项目唯一实现）。
 * @param {number} consolidationCoefficient 固结系数 cv (>0)
 * @param {number} time 时间 t (>=0)
 * @param {number} layerThickness 土层厚度 H (>0)
 * @param {string} drainage 'single' | 'double'
 * @returns {number}
 */
function timeFactor(consolidationCoefficient, time, layerThickness, drainage) {
  if (!(consolidationCoefficient > 0)) {
    throw new Error('consolidationCoefficient must be a positive number');
  }
  if (!(typeof time === 'number' && time >= 0)) {
    throw new Error('time must be a non-negative number');
  }
  const hdr = drainagePathLength(layerThickness, drainage);
  return (consolidationCoefficient * time) / (hdr * hdr);
}

module.exports = { DRAINAGE, drainagePathLength, timeFactor };
