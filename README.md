# 太沙基一维固结评估服务（Terzaghi 1D Consolidation Service）

常驻 HTTP 服务：输入固结系数、层厚、排水条件、初始超静孔压（均匀分布）、
单位体积压缩系数与附加应力，返回指定时刻：

- 沿深度网格逐点的孔压消散比例、残余孔压比与当前超静孔压；
- 平均固结度 U；
- 最终沉降量 S∞、该时刻沉降量 S(t)、沉降完成比例。

Node.js 20 + Express，级数求和全部自行实现，无第三方数值库。

## 理论与换算关系（只在一处定义）

- 排水路径长度：单面排水 `Hdr = H`，双面排水 `Hdr = H/2`
  —— 仅定义在 `src/timeFactor.js`，其余模块一律引用，不另立换算。
- 时间因子：`Tv = cv·t / Hdr²` —— 仅 `timeFactor()` 一个实现，
  在 `src/service.js` 中计算一次后同时传给深度剖面与平均固结度，
  两条链路共用同一个 Tv、同一套边界。
- 坐标统一为 `x = 距排水面距离 / Hdr ∈ [0,1]`（排水面 0，最远点 1；
  双面排水时两面对称，中点为最远点）。
- 初始孔压均匀分布时的解析解（小 Tv 用镜像法补误差函数解，Tv>0.025 用傅里叶级数）：
  - 孔压比（大 Tv）`u/u0 = Σ_m (2/M)·sin(M·x)·exp(-M²·Tv)`，`M=(2m-1)π/2`
  - 小 Tv：`u/u0 = erf(x/(2√Tv)) + Σ_j (-1)^j[erfc((2j-x)/(2√Tv)) - erfc((2j+x)/(2√Tv))]`，
    各项按 e^{-j²/Tv} 双指数衰减，Tv 再小也只需个位数项。
    傅里叶级数条件收敛，固定项数截断会在极早期留下约 1e-5 量级、
    随时间非单调的假消散，故极小 Tv 必须走镜像级数，不能靠加项数硬算。
  - erf/erfc 由正则化不完全伽马函数自行实现（幂级数 + Lentz 连分式），无第三方数值库。
  - 消散比例 `= 1 - u/u0`
  - 平均固结度（大 Tv）`U = 1 - Σ_m (2/M²)·exp(-M²·Tv)`；
    小 Tv 直接用镜像级数的闭式积分，写成消散量之和以免 1-remain 相消。
  - 傅里叶级数最多取 20000 项并按幅值容差截断（大 Tv 几项即收敛）；
    两套解在 Tv=0.025 处一致到机器精度（差约 1e-16）。
- 沉降：`S∞ = mv·Δσ·H`，`S(t) = S∞·U`，沉降比例 = U。

## 模块职责

| 文件 | 职责 |
|---|---|
| `src/timeFactor.js` | 排水条件、`Hdr` 换算、`Tv` 计算（唯一实现） |
| `src/series.js` | 深度剖面与平均固结度：傅里叶级数（大 Tv）/ 镜像法 erfc 解（小 Tv）、自带 erf/erfc |
| `src/profile.js` | 深度→距排水面几何映射、深度网格剖面 |
| `src/consolidation.js` | 平均固结度汇总与沉降计算 |
| `src/validate.js` | 输入校验，结构化错误 |
| `src/service.js` | 编排：Tv 只算一次，喂给剖面与固结度 |
| `src/routes.js` / `src/app.js` / `src/server.js` | HTTP 层 |

## 运行

```bash
npm install
npm start            # 默认 :3000，可用 PORT 覆盖
npm test             # node:test 自动化测试（38 项）
```

Docker：

```bash
docker build -t consolidation-service .
docker run -p 3000:3000 consolidation-service
```

## 接口

`GET /health` → `{"status":"ok"}`

`POST /consolidation/evaluate`（JSON）：

| 字段 | 含义 | 约束 |
|---|---|---|
| `consolidationCoefficient` | 固结系数 cv | > 0 |
| `layerThickness` | 土层厚度 H | > 0 |
| `time` | 时间 t（与 cv 单位制一致） | ≥ 0（t=0 合法） |
| `drainage` | `"single"` / `"double"` | 必填 |
| `initialExcessPorePressure` | 初始超静孔压 u0（均匀分布） | ≥ 0 |
| `compressionCoefficient` | 单位体积压缩系数 mv | ≥ 0 |
| `additionalStress` | 附加应力 Δσ | ≥ 0 |
| `depthGrid` | 可选，自定义深度数组 | 各点 ∈ [0,H] |
| `nodeCount` | 可选，等距节点数（默认 21） | ≥ 2 整数 |

响应（节选）：`timeFactor`、`drainagePathLength`、`averageConsolidation`、
`settlementFraction`、`finalSettlement`、`settlementAtTime`、
`profile[]`（每点含 `depth`、`distanceToDrain`、`normalizedDistance`、
`dissipationRatio`、`residualPorePressureRatio`、`excessPorePressure`）。

非法输入返回 `400 {"error":"invalid_input","details":[...]}`，
不会产出任何看似合理的计算结果。

## 测试钉死的物理关系

- Tv=0：U 精确为 0，全剖面消散比例为 0；
- Tv 充分大：U→1，剖面消散比例整体逼近 100%（并对照标准表 Tv=0.1/0.5/1.0）；
- 同 H、同 cv、同 t：双面排水 U 严格高于单面（Tv 恰为 4 倍），多组参数验证；
- 深度单调性：离排水面越远消散比例越低；双面剖面关于中面对称；
- cv 翻倍与 t 翻倍：Tv、U 与全剖面数值完全等价；
- 零/负的 cv/H/t、负的 mv/Δσ、非法排水条件、越界网格：结构化拒绝；
- 小 Tv（1e-4）镜像解与半无限体解析解 `1-erf(x/2√Tv)` 的对照；
- 早期（小 Tv，新加钉死）：
  - 任意正时间 U 与沉降服从 √t 规律，小到 1e-12s 也不停在底数上；
    cv=1e-8、H=20、S∞=1m 时 t=1s 沉降 0.00564mm（千分之一内），
    t=0.1/0.01s 依次为 0.00178/0.000564mm，双面约为单面两倍；
  - 同一深度点消散比例随时间单调不减（1e-12 容差，含切换阈值附近细粒度扫描）；
  - 头一秒内距最近排水面 1m 以外各点消散比例 ≤ 1e-9；
  - 默认网格与 201 深度点、时间取多小都在 1s 内返回。
