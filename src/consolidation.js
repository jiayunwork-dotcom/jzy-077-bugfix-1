'use strict';

// 平均固结度与沉降计算。
// 平均固结度由 series 模块的级数给出；该级数与深度剖面共用同一时间因子，
// 编排层（service）保证两边传入的是同一个 Tv 数值。

const { averageConsolidation } = require('./series');

/**
 * 最终沉降量 S∞ = mv · Δσ · H
 * （单位体积压缩系数 × 附加应力 × 层厚）。
 */
function finalSettlement(compressionCoefficient, additionalStress, layerThickness) {
  return compressionCoefficient * additionalStress * layerThickness;
}

/**
 * 汇总某一时刻的固结与沉降指标。
 * @param {object} p
 * @param {number} p.tv 时间因子（编排层用唯一的 timeFactor() 算好后传入）
 * @param {number} p.compressionCoefficient 单位体积压缩系数 mv
 * @param {number} p.additionalStress 附加应力 Δσ
 * @param {number} p.layerThickness 土层厚度 H
 */
function consolidationState({
  tv,
  compressionCoefficient,
  additionalStress,
  layerThickness,
}) {
  const u = averageConsolidation(tv);
  const sFinal = finalSettlement(
    compressionCoefficient,
    additionalStress,
    layerThickness,
  );
  return {
    averageConsolidation: u, // 平均固结度 U
    finalSettlement: sFinal, // 最终沉降量 S∞
    settlementAtTime: sFinal * u, // 该时刻沉降量 S(t) = S∞·U
    settlementFraction: u, // 沉降完成比例 = U
  };
}

module.exports = { finalSettlement, consolidationState };
