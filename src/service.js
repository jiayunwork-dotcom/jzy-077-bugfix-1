'use strict';

// 编排层：时间因子在这里用唯一的 timeFactor() 计算一次，
// 然后同时喂给深度剖面与平均固结度计算，保证两条链路绝无两套换算。

const { timeFactor, drainagePathLength } = require('./timeFactor');
const { buildDepthProfile } = require('./profile');
const { consolidationState } = require('./consolidation');

/**
 * 执行一次固结评估。入参须先经 validateInput 通过。
 */
function evaluateConsolidation(params) {
  const {
    consolidationCoefficient,
    layerThickness,
    time,
    drainage,
    initialExcessPorePressure,
    compressionCoefficient,
    additionalStress,
    depthGrid,
    nodeCount,
  } = params;

  // 唯一的时间因子计算点
  const tv = timeFactor(
    consolidationCoefficient,
    time,
    layerThickness,
    drainage,
  );

  const profile = buildDepthProfile({
    layerThickness,
    drainage,
    tv,
    initialExcessPorePressure,
    depthGrid,
    nodeCount,
  });

  const state = consolidationState({
    tv,
    compressionCoefficient,
    additionalStress,
    layerThickness,
  });

  return {
    input: {
      consolidationCoefficient,
      layerThickness,
      time,
      drainage,
      initialExcessPorePressure,
      compressionCoefficient,
      additionalStress,
    },
    drainagePathLength: drainagePathLength(layerThickness, drainage),
    timeFactor: tv,
    averageConsolidation: state.averageConsolidation,
    settlementFraction: state.settlementFraction,
    finalSettlement: state.finalSettlement,
    settlementAtTime: state.settlementAtTime,
    profile,
  };
}

module.exports = { evaluateConsolidation };
