'use strict';

// 太沙基一维固结（初始超静孔压均匀分布）的解析解。
// 统一取“距排水面的无量纲距离” x = 距排水面距离 / Hdr，x ∈ [0,1]：
//   排水面 x=0（孔压恒为 0），最远点 x=1（单面为不透水面，双面为对称面）。
// 单面排水: 不透水面 x=1，排水面 x=0；
// 双面排水: 两面对称，中点 x=1，任一面 x=0。
// 两种边界共用同一套解与同一个时间因子，差异只体现在 x 的几何映射上。
//
// 控制方程：u_Tv = u_xx，边界 u(0,Tv)=0（Dirichlet）、u_x(1,Tv)=0（Neumann），
// 初始 u(x,0)=1。两套等价的解析解，按 Tv 选用收敛更快的一套：
//
// 1) 大 Tv（傅里叶级数，分离变量）：
//   u/u0 = Σ_m (2/M)·sin(M·x)·exp(-M²·Tv),  M=(2m-1)π/2
//   U = 1 - Σ_m (2/M²)·exp(-M²Tv)
//
// 2) 小 Tv（镜像法补误差函数解，对初始方波在全直线做奇/偶延拓后重排，
//    每项都是 (2j±x)/(2√Tv) 处的 erfc，按双指数 e^{-j²/Tv} 衰减，
//    Tv 再小也只需个位数项，且结果随 Tv 光滑、单调）：
//   u/u0 = erf(x/(2√Tv))
//          + Σ_{j=1}∞ (-1)^j [ erfc((2j-x)/(2√Tv)) - erfc((2j+x)/(2√Tv)) ]
//   U = 1 - ∫_0^1 u dx（见 averageConsolidationSmallTv 内闭式积分）。
//
// 不能只靠傅里叶级数硬算小 Tv：该级数条件收敛，取到 m=20000 截断时，
// 截尾约 2/M_max ≈ 1e-5（平均度为 Σ 2/M² 尾项）量级且随 Tv 非单调变化，
// 正是“一秒钟十米深处出现 1e-5 量级假消散、且随时间倒退”的来源。

const PI = Math.PI;
const MAX_TERMS = 20000; // 大 Tv 分支的保护上限（Tv 较大时几项即收敛）
const TERM_TOL = 1e-14;

// 小 Tv 分支切换阈值：
//   傅里叶侧：Tv=SWITCH_TV 时截尾首项 (2/M)e^{-M²Tv} ≈ 4e-40；
//   镜像侧：j=2 项 erfc((4-1)/(2√Tv)) = erfc(9.49) 已是 1e-40 量级。
// 两侧在阈值处的差异远小于 1e-12，跨阈值的时间序列不会出现可感知的跳变。
const SWITCH_TV = 0.025;

// erfc 的参数超过此值即按 0 处理（erfc(6.7)≈2e-20；6.7 以上由 Q 函数直算，
// 此处仅作镜像级数的截断上界：e^{-27.3²} 在双精度下已下溢）。
const ERFC_CUTOFF = 27.3;

// ---------------------------------------------------------------------------
// erf / erfc：不引入第三方数值库，用正则化不完全伽马函数实现（双精度精度）。
//   erf(x) = P(1/2, x²)，erfc(x) = Q(1/2, x²)   （x ≥ 0）
// 小参数走下不完全伽马的幂级数，大参数走上不完全伽马的连分式（Lentz 法），
// 直接求 Q，避免 1 - 接近 1 的数造成有效位损失。
// ---------------------------------------------------------------------------

const LN_SQRT_PI = 0.5 * Math.log(PI); // ln Γ(1/2) = 0.5723649429247001
const EPS = 2.3e-16;

/** 正则化下不完全伽马 P(1/2, x)，x ≥ 0（幂级数）。 */
function gammaPSeries(x) {
  let a = 0.5;
  let term = 1 / a;
  let sum = term;
  for (let n = 1; n < 1000; n++) {
    a += 1;
    term *= x / a;
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + 0.5 * Math.log(x) - LN_SQRT_PI);
}

/** 正则化上不完全伽马 Q(1/2, x)，x > 0（Lentz 连分式）。 */
function gammaQContinuedFraction(x) {
  let b = x + 0.5; // x + 1 - a，a=0.5
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - 0.5); // -i·(i - a)
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return Math.exp(-x + 0.5 * Math.log(x) - LN_SQRT_PI) * h;
}

/** 误差函数 erf(x)（仅处理 x ≥ 0 的调用；内部需要的参数均非负）。 */
function erf(x) {
  if (x <= 0) return x === 0 ? 0 : -erfc(-x);
  const z = x * x;
  return z < 1.5 ? gammaPSeries(z) : 1 - gammaQContinuedFraction(z);
}

/** 补误差函数 erfc(x)（仅处理 x ≥ 0 的调用；内部需要的参数均非负）。 */
function erfc(x) {
  if (x <= 0) return x === 0 ? 1 : 2 - erfc(-x);
  if (x >= ERFC_CUTOFF) return 0;
  const z = x * x;
  return z < 1.5 ? 1 - gammaPSeries(z) : gammaQContinuedFraction(z);
}

// ---------------------------------------------------------------------------
// 小 Tv：镜像法补误差函数解
// ---------------------------------------------------------------------------

/** F(q) = q·erfc(q) - e^{-q²}/√π，即 ∫erfc(q)dq（差常数）。 */
function erfcIntegral(q) {
  if (q >= ERFC_CUTOFF) return 0;
  return q * erfc(q) - Math.exp(-q * q) / Math.sqrt(PI);
}

/**
 * 小 Tv 下的 u/u0（镜像法级数，逐项双指数衰减）。
 */
function residualPorePressureRatioSmallTv(x, tv) {
  const s = 2 * Math.sqrt(tv);
  // 首项 erf(x/s)：半无限体解，小 Tv 时的主导项。
  let u = erf(x / s);
  for (let j = 1; ; j++) {
    const qNear = (2 * j - x) / s;
    const qFar = (2 * j + x) / s;
    const term = erfc(qNear) - erfc(qFar); // ≥ 0
    u += j % 2 === 0 ? term : -term;
    // 此后所有 j 的参数都更大，erfc 恒为 0。
    if (qNear >= ERFC_CUTOFF) break;
  }
  return u;
}

/**
 * 小 Tv 下的平均固结度 U。
 * 由 u = 1 - ∫_0^1 u(x) dx 直接写成“消散量之和”，避免 1 - remain
 * 在 remain≈1（Tv≲1e-28）时的相消：
 *   U = erfc(1/s) + (s/√π)(1 - e^{-1/(4Tv)})
 *       + Σ_j (-1)^{j+1} s·[2F(2j/s) - F((2j-1)/s) - F((2j+1)/s)]，
 * 其中 s = 2√Tv，F(q)=q·erfc(q)-e^{-q²}/√π。
 * 首项主导时 U = s/√π = 2√(Tv/π)，其余各项均按 e^{-j²/Tv} 双指数衰减。
 */
function averageConsolidationSmallTv(tv) {
  const s = 2 * Math.sqrt(tv);
  let u = erfc(1 / s) + (s / Math.sqrt(PI)) * (1 - Math.exp(-1 / (4 * tv)));
  for (let j = 1; ; j++) {
    const integral =
      s *
      (2 * erfcIntegral((2 * j) / s) -
        erfcIntegral((2 * j - 1) / s) -
        erfcIntegral((2 * j + 1) / s));
    u += j % 2 === 1 ? integral : -integral;
    if ((2 * j - 1) / s >= ERFC_CUTOFF) break;
  }
  return Math.min(1, Math.max(0, u));
}

// ---------------------------------------------------------------------------
// 大 Tv：傅里叶级数
// ---------------------------------------------------------------------------

/**
 * 级数余项 u/u0 = Σ (2/M) sin(Mx) exp(-M²Tv)。
 * 孔压消散比例 = 1 - 该余项。
 */
function residualPorePressureRatioSeries(x, tv) {
  let sum = 0;
  for (let m = 1; m <= MAX_TERMS; m++) {
    const M = ((2 * m - 1) * PI) / 2;
    const amplitude = (2 / M) * Math.exp(-M * M * tv);
    if (amplitude < TERM_TOL) break; // |sin|≤1，此后每一项贡献都不会更大
    sum += amplitude * Math.sin(M * x);
  }
  return sum;
}

/**
 * 指定无量纲深度处的孔压残余比 u/u0 ∈ [0,1]。
 * @param {number} x 距排水面的无量纲距离 [0,1]
 * @param {number} tv 时间因子
 * @returns {number}
 */
function residualPorePressureRatio(x, tv) {
  if (tv === 0) return 1; // 初始时刻（边界点除外）孔压完全未消散
  const u =
    tv <= SWITCH_TV
      ? residualPorePressureRatioSmallTv(x, tv)
      : residualPorePressureRatioSeries(x, tv);
  return Math.min(1, Math.max(0, u));
}

/**
 * 指定无量纲深度处的孔压消散比例 (u0 - u)/u0 ∈ [0,1]。
 * 与残余比共用同一个底层值并裁剪，保证两者在任何浮点输入下严格互补。
 * @param {number} x 距排水面的无量纲距离 [0,1]
 * @param {number} tv 时间因子
 * @returns {number}
 */
function dissipationRatio(x, tv) {
  if (!(x >= 0 && x <= 1)) {
    throw new Error('normalized distance x must be within [0,1]');
  }
  if (tv === 0) return 0;
  return 1 - residualPorePressureRatio(x, tv);
}

/**
 * 平均固结度 U = 1 - Σ (2/M²) exp(-M²Tv)（大 Tv 傅里叶级数），
 * 小 Tv 用镜像法闭式积分。与深度剖面共用同一 Tv（编排层保证）。
 * @param {number} tv 时间因子
 * @returns {number}
 */
function averageConsolidation(tv) {
  if (tv === 0) return 0;
  if (tv <= SWITCH_TV) return averageConsolidationSmallTv(tv);
  let remain = 0;
  for (let m = 1; m <= MAX_TERMS; m++) {
    const M = ((2 * m - 1) * PI) / 2;
    const amplitude = (2 / (M * M)) * Math.exp(-M * M * tv);
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
  SWITCH_TV,
};
