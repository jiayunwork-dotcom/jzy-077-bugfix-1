'use strict';

// 输入校验：非法参数一律返回结构化错误，绝不带着脏数据算出“看似合理”的数字。

const { DRAINAGE } = require('./timeFactor');

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @returns {{valid: true, value: object} | {valid: false, details: Array}}
 */
function validateInput(input) {
  const details = [];
  const v = input || {};

  const requirePositive = (field, label) => {
    const x = v[field];
    if (!isFiniteNumber(x) || x <= 0) {
      details.push({
        field,
        constraint: `${label}必须为正数 (> 0)，零值或负值一律拒绝`,
        received: x,
      });
    }
  };

  requirePositive('consolidationCoefficient', '固结系数 cv');
  requirePositive('layerThickness', '土层厚度 H');

  if (!isFiniteNumber(v.time) || v.time < 0) {
    // 允许 t = 0：这是初始时刻，对应“Tv=0 时固结度精确为零”的物理校验。
    details.push({
      field: 'time',
      constraint: '时间 t 必须为非负有限数 (>= 0)，负值拒绝',
      received: v.time,
    });
  }

  if (typeof v.drainage !== 'string' ||
      ![DRAINAGE.SINGLE, DRAINAGE.DOUBLE].includes(v.drainage)) {
    details.push({
      field: 'drainage',
      constraint: `排水条件必须是 '${DRAINAGE.SINGLE}'（单面）或 '${DRAINAGE.DOUBLE}'（双面）`,
      received: v.drainage,
    });
  }

  if (!isFiniteNumber(v.initialExcessPorePressure) ||
      v.initialExcessPorePressure < 0) {
    details.push({
      field: 'initialExcessPorePressure',
      constraint: '初始超静孔压 u0 必须为非负有限数 (>= 0)',
      received: v.initialExcessPorePressure,
    });
  }

  if (!isFiniteNumber(v.compressionCoefficient) ||
      v.compressionCoefficient < 0) {
    details.push({
      field: 'compressionCoefficient',
      constraint: '单位体积压缩系数 mv 不能为负 (>= 0)',
      received: v.compressionCoefficient,
    });
  }

  if (!isFiniteNumber(v.additionalStress) || v.additionalStress < 0) {
    details.push({
      field: 'additionalStress',
      constraint: '附加应力 Δσ 不能为负 (>= 0)',
      received: v.additionalStress,
    });
  }

  let depthGrid = null;
  if (v.depthGrid !== undefined && v.depthGrid !== null) {
    if (!Array.isArray(v.depthGrid) || v.depthGrid.length === 0) {
      details.push({
        field: 'depthGrid',
        constraint: 'depthGrid 必须为非空数值数组',
        received: v.depthGrid,
      });
    } else {
      const outOfRange = v.depthGrid.filter(
        (z) => !isFiniteNumber(z) || z < 0 ||
          (isFiniteNumber(v.layerThickness) && z > v.layerThickness),
      );
      if (outOfRange.length > 0) {
        details.push({
          field: 'depthGrid',
          constraint: 'depthGrid 中每个深度都必须落在 [0, H] 内',
          received: outOfRange,
        });
      } else {
        depthGrid = v.depthGrid.slice();
      }
    }
  }

  let nodeCount = 21;
  if (v.nodeCount !== undefined && v.nodeCount !== null) {
    if (!Number.isInteger(v.nodeCount) || v.nodeCount < 2) {
      details.push({
        field: 'nodeCount',
        constraint: 'nodeCount 必须为不小于 2 的整数',
        received: v.nodeCount,
      });
    } else {
      nodeCount = v.nodeCount;
    }
  }

  if (details.length > 0) return { valid: false, details };
  return {
    valid: true,
    value: {
      consolidationCoefficient: v.consolidationCoefficient,
      layerThickness: v.layerThickness,
      time: v.time,
      drainage: v.drainage,
      initialExcessPorePressure: v.initialExcessPorePressure,
      compressionCoefficient: v.compressionCoefficient,
      additionalStress: v.additionalStress,
      depthGrid,
      nodeCount,
    },
  };
}

module.exports = { validateInput };
