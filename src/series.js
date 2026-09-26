'use strict';

// 太沙基一维固结（初始超静孔压均匀分布）的傅里叶级数解。
// 统一取“距排水面的无量纲距离” x = 距排水面距离 / Hdr，x ∈ [0,1]：
//   排水面 x=0（孔压恒为 0），最远点 x=1（单面为不透水面，双面为对称面）。
// 单面排水: 不透水面 x=1，排水面 x=0；
// 双面排水: 两面对称，中点 x=1，任一面 x=0。
// 两种边界共用同一套级数与同一个时间因子，差异只体现在 x 的几何映射上。
//
// 由分离变量（排水面处 Dirichlet u=0、最远点处 Neumann ∂u/∂z=0）得：
//   u/u0 = Σ_{m=1}∞ (2/M)·sin(M·x)·exp(-M²·Tv),  M=(2m-1)π/2
// 深度平均：∫0^1 (2/M)sin(Mx)dx = 2/M²，故
//   U = 1 - Σ_{m=1}∞ (2/M²)·exp(-M²·Tv)

const PI = Math.PI;
const MAX_TERMS = 20000; // 小时间因子下需要较多项，避免过早截断
const TERM_TOL = 1e-14;

/**
 * 级数余项 u/u0 = Σ (2/M) sin(Mx) exp(-M²Tv)。
 * 孔压消散比例 = 1 - 该余项。
 */
function residualPorePressureRatio(x, Tv) {
  if (Tv === 0) return 1; // 初始时刻（边界点除外）孔压完全未消散
  let sum = 0;
  for (let m = 1; m <= MAX_TERMS; m++) {
    const M = ((2 * m - 1) * PI) / 2;
    const amplitude = (2 / M) * Math.exp(-M * M * Tv);
    if (amplitude < TERM_TOL) break; // |sin|≤1，此后每一项贡献都不会更大
    sum += amplitude * Math.sin(M * x);
  }
  return sum;
}

/**
 * 指定无量纲深度处的孔压消散比例 (u0 - u)/u0 ∈ [0,1]。
 * @param {number} x 距排水面的无量纲距离 [0,1]
 * @param {number} Tv 时间因子
 * @returns {number}
 */
function dissipationRatio(x, Tv) {
  if (!(x >= 0 && x <= 1)) {
    throw new Error('normalized distance x must be within [0,1]');
  }
  if (Tv === 0) return 0;
  const ratio = 1 - residualPorePressureRatio(x, Tv);
  return Math.min(1, Math.max(0, ratio));
}

/**
 * 平均固结度 U = 1 - Σ (2/M²) exp(-M²Tv)
 *  即 1 - Σ (4/π²)·(1/(2m-1)²)·exp(-M²Tv)。
 * 与深度剖面共用同一 Tv（编排层保证）。
 * @param {number} Tv 时间因子
 * @returns {number}
 */
function averageConsolidation(Tv) {
  if (Tv === 0) return 0;
  let remain = 0;
  for (let m = 1; m <= MAX_TERMS; m++) {
    const M = ((2 * m - 1) * PI) / 2;
    const amplitude = (2 / (M * M)) * Math.exp(-M * M * Tv);
    if (amplitude < TERM_TOL) break;
    remain += amplitude;
  }
  const u = 1 - remain;
  return Math.min(1, Math.max(0, u));
}

module.exports = {
  residualPorePressureRatio,
  dissipationRatio,
  averageConsolidation,
  MAX_TERMS,
};
