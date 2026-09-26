'use strict';

// 太沙基一维固结（初始超静孔压均匀分布）的解析解。
// 统一取“距排水面的无量纲距离” x = 距排水面距离 / Hdr，x ∈ [0,1]：
//   排水面 x=0（孔压恒为 0），最远点 x=1（单面为不透水面，双面为对称面）。
// 单面排水: 不透水面 x=1，排水面 x=0；
// 双面排水: 两面对称，中点 x=1，任一面 x=0。
// 两种边界共用同一套公式与同一个时间因子，差异只体现在 x 的几何映射上。
//
// 常规时间因子下使用分离变量（傅里叶级数）解：
//   u/u0 = Σ_{m=1}∞ (2/M)·sin(M·x)·exp(-M²·Tv),  M=(2m-1)π/2
// 深度平均：∫0^1 (2/M)sin(Mx)dx = 2/M²，故
//   U = 1 - Σ_{m=1}∞ (2/M²)·exp(-M²·Tv)
//
// 注意：Tv 很小时傅里叶级数需要约 1/Tv 项才能收敛，固定项数截断会留下
// 约 1/(π²·m_max) 的残余“底数”，使早期 U 偏大、剖面出现非物理纹波。
// 因此 Tv < EARLY_TV_MAX 时改用镜像法（erfc 互补级数），两种形式在
// Tv=0.1 处一致到机器精度。

const PI = Math.PI;
const SQRT_PI = Math.sqrt(PI);
const MAX_TERMS = 20000;
const TERM_TOL = 1e-14;
const MAX_IMAGES = 1000;
const IMAGE_TOL = 1e-17;
const EARLY_TV_MAX = 0.1;

/**
 * 互补误差函数 erfc(x)，x >= 0。
 * 小参数用 erf 的幂级数，大参数用 Γ(1/2,z)=√z·e^-z·F(z) 的 Lentz 连分式，
 * 两段都收敛到双精度机器精度，避免小 Tv 时 exp(-x²) 渐近展开截断误差。
 */
function complementaryErrorFunction(x) {
  if (x < 0) return 2 - complementaryErrorFunction(-x);
  // erfc 在 x≈27.3 处已低于双精度最小正数，直接下溢为 0；
  // 否则 x² 会先溢出成 Infinity，连分式里出现 NaN。
  if (x > 27.3) return 0;
  if (x < 1.5) {
    let term = x;
    let sum = term;
    for (let n = 1; n < 200; n++) {
      term *= -x * x / n;
      const increment = term / (2 * n + 1);
      sum += increment;
      if (Math.abs(increment) < 1e-18 * Math.abs(sum)) break;
    }
    return 1 - (2 / SQRT_PI) * sum;
  }

  // erfc(x) = Γ(1/2, x²)/√π，上不完全伽马函数的连分式在 z=x² 上求值。
  const z = x * x;
  const fpMin = Number.MIN_VALUE;
  let denominator = z + 0.5;
  let c = 1 / fpMin;
  let d = 1 / denominator;
  let h = d;
  for (let i = 1; i <= 10000; i++) {
    const an = -i * (i - 0.5);
    denominator += 2;
    d = an * d + denominator;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = denominator + an / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-z) * x * h / SQRT_PI;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * 小时间因子镜像解（Dirichlet x=0 + Neumann x=1 周期延拓）：
 *   d = Σ_{k=0}∞ (-1)^k [erfc((2k+x)/(2√Tv)) + erfc((2k+2-x)/(2√Tv))]
 * d 即孔压消散比例 (u0-u)/u0。Tv 越小镜像项衰减越快。
 */
function earlyDissipationRatio(x, Tv) {
  const scale = 2 * Math.sqrt(Tv);
  let d = 0;
  for (let k = 0; k < MAX_IMAGES; k++) {
    const term = complementaryErrorFunction((2 * k + x) / scale)
      + complementaryErrorFunction((2 * k + 2 - x) / scale);
    d += (k % 2 === 0 ? 1 : -1) * term;
    if (k >= 1 && term < IMAGE_TOL) break;
  }
  return clamp01(d);
}

/**
 * 早期平均固结度，由早期深度消散比例在 x∈[0,1] 上积分得到：
 *   U = 2√(Tv/π) + 4√Tv·Σ_{j=1}∞ (-1)^(j+1)·F(j/√Tv)，
 *   F(v) = v·erfc(v) - e^-v²/√π。
 * 首项即半无限体平方根规律 U=2√(Tv/π)，其余镜像项给出不透水边界修正。
 */
function earlyAverageConsolidation(Tv) {
  const s = Math.sqrt(Tv);
  let u = 2 * s / SQRT_PI;
  for (let j = 1; j < MAX_IMAGES; j++) {
    const v = j / s;
    const f = v * complementaryErrorFunction(v) - Math.exp(-v * v) / SQRT_PI;
    u += 4 * s * (j % 2 === 1 ? 1 : -1) * f;
    if (Math.abs(f) < IMAGE_TOL) break;
  }
  return clamp01(u);
}

/**
 * 级数余项 u/u0 = Σ (2/M) sin(Mx) exp(-M²Tv)。
 * 孔压消散比例 = 1 - 该余项。
 */
function residualPorePressureRatio(x, Tv) {
  if (Tv === 0) return 1; // 初始时刻（边界点除外）孔压完全未消散
  if (Tv < EARLY_TV_MAX) return 1 - earlyDissipationRatio(x, Tv);
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
  if (Tv < EARLY_TV_MAX) return earlyDissipationRatio(x, Tv);
  const ratio = 1 - residualPorePressureRatio(x, Tv);
  return clamp01(ratio);
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
  if (Tv < EARLY_TV_MAX) return earlyAverageConsolidation(Tv);
  let remain = 0;
  for (let m = 1; m <= MAX_TERMS; m++) {
    const M = ((2 * m - 1) * PI) / 2;
    const amplitude = (2 / (M * M)) * Math.exp(-M * M * Tv);
    if (amplitude < TERM_TOL) break;
    remain += amplitude;
  }
  const u = 1 - remain;
  return clamp01(u);
}

module.exports = {
  residualPorePressureRatio,
  dissipationRatio,
  averageConsolidation,
  complementaryErrorFunction,
  EARLY_TV_MAX,
  MAX_TERMS,
};
