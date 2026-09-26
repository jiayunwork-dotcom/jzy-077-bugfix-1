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
- 初始孔压均匀分布时的级数解：
  - 孔压比 `u/u0 = Σ_m (2/M)·sin(M·x)·exp(-M²·Tv)`，`M=(2m-1)π/2`
  - 消散比例 `= 1 - u/u0`
  - 平均固结度 `U = 1 - Σ_m (2/M²)·exp(-M²·Tv)`
  - 级数最多取 20000 项并按幅值容差截断，小 Tv 下不会过早截断。
- 沉降：`S∞ = mv·Δσ·H`，`S(t) = S∞·U`，沉降比例 = U。

## 模块职责

| 文件 | 职责 |
|---|---|
| `src/timeFactor.js` | 排水条件、`Hdr` 换算、`Tv` 计算（唯一实现） |
| `src/series.js` | 深度剖面级数解与平均固结度级数 |
| `src/profile.js` | 深度→距排水面几何映射、深度网格剖面 |
| `src/consolidation.js` | 平均固结度汇总与沉降计算 |
| `src/validate.js` | 输入校验，结构化错误 |
| `src/service.js` | 编排：Tv 只算一次，喂给剖面与固结度 |
| `src/routes.js` / `src/app.js` / `src/server.js` | HTTP 层 |

## 运行

```bash
npm install
npm start            # 默认 :3000，可用 PORT 覆盖
npm test             # node:test 自动化测试（29 项）
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
- 另含小 Tv（1e-4）级数精度与半无限体解析解 `1-erf(x/2√Tv)` 的对照。
