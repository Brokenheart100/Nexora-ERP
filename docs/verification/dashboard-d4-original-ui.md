# Dashboard D4 原有界面的采购到付款

2026-11-20，完成本地验收。承接 [原 UI 的 D3](dashboard-d3-original-ui.md)，覆盖 [D4 五项 TODO](../ui-dashboard-api-integration-todolist.md#d4-采购到付款)。

## 实施范围与顺序

1. 在原采购列表、详情和表单接通按工作区分页、版本化保存、提交、撤回、独立审批、退回和取消，保留原页面与抽屉。
2. 原采购收货抽屉改为签发许可；仓库从自己的任务和修订号执行。区分 `202` 同步中、取消确认中和已执行事实，核对并发、超量和失败恢复。
3. 原财务「采购应付」接通实收暂估、账单逐行税额评估、独立复核付款、应付明细 / 账龄及凭证 / 银行流水。通过真实入口核对 1130 账单、600 付款和 530 未结。
4. 在本次专用启动的本地栈中演练 Finance 消费延迟和传输恢复；资源停启放入恢复保护，不删除卷或修改生产环境。

MSW 验证页面交互与可重复的请求分支。真实后端验证权限、事务、版本、幂等和消息恢复。金额和数量沿用十进制字符串，逐行税额由服务端评估和过账。

采购列表与仓库流水按后端分页，采购列表的筛选、CSV 和打印从当前授权的列表或详情取数。订单批准依据部门范围与制单人，收货依据仓库接收人和任务修订。账单匹配使用当前工作区的已暂估正向采购实收，跨页保留已选行，过账时由 Finance 重新校验额度、成本和税额。付款使用已过账未结账单，资金发生记录和付款凭证从服务端读回。请求结果未知时保存原路径、请求体和操作 ID，先成功读回业务记录，再在同一身份和工作区明确重试。

## 本地复现

依赖 D0 本地联调样例、开发证书、Mailpit 和本地 Aspire 实例。浏览器套件串行执行。故障用例短暂停启专用验证实例的 Finance 和 RabbitMQ，在 `finally` 中恢复并等待服务健康。

```powershell
pnpm --dir src/Web/nexora-dashboard test:unit --maxWorkers 2
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard lint
$env:NUXT_PUBLIC_DATA_MODE = 'mock'
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
pnpm --dir src/Web/nexora-dashboard build
Remove-Item Env:NUXT_PUBLIC_DATA_MODE
pnpm --dir src/Web/nexora-dashboard test:msw

$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraAppHost --non-interactive
try {
  aspire wait gateway --apphost $nexoraAppHost --timeout 180 --non-interactive
  $d4Dashboard = aspire describe dashboard --apphost $nexoraAppHost --format Json --non-interactive | ConvertFrom-Json
  $env:NODE_EXTRA_CA_CERTS = $d4Dashboard.resources[0].environment.NODE_EXTRA_CA_CERTS
  $env:NEXORA_D4_FAULTS = '1'
  pnpm --dir src/Web/nexora-dashboard test:e2e e2e/d4-ui.spec.ts
} finally {
  Remove-Item Env:NEXORA_D4_FAULTS -ErrorAction SilentlyContinue
  aspire stop --apphost $nexoraAppHost --non-interactive
}
```

用 `pnpm --dir src/Web/nexora-dashboard dev:msw` 启动后，打开 `/purchase-orders?mockCase=d4` 体验原页面。`d4-reviewer` 提供独立复核身份，`d4-receiver` 提供仓库收货身份。真实入口 `https://localhost:7444` 通过当前授权的工作区进入采购、仓库和财务。

## 保留与证据

对照开始实施时的 SHA-256，112 个 Vue / CSS 路径和 14 个文件路由均保留，91 个文件字节相同。此前删除的 38 个替代 UI 路径仍未出现。运行环境、身份凭据、原始故障日志留在忽略的 `artifacts/p1/runtime/`。本地 D0 联调工作区保留本轮专用样例及其业务审计。[界面文件核对](../../artifacts/dashboard-d4-original-ui/ui-preservation.json)

## 本地验收结果

| 场景 | 实际核对 |
| --- | --- |
| 采购与审批 | 创建、旧版本保存冲突、回读后保存、提交、撤回、退回、独立批准、取消草稿。部门复核人可批准本部门订单，读取公司范围订单返回 404。打印预览显示服务端单号、批准版本和金额。 |
| 许可与仓库 | 超量签发返回 409，同版本并发签发得到一个 202 和一个 409。取消与仓库实收交错后，许可确认的实收量等于库存流水，剩余额度按回执释放，关闭余量后订单显示已关闭。 |
| 账单与付款 | 各收 40 和 60 件，收到两条库存流水和两份暂估，库存总成本 1,000.00 元。按两行税额评估得到 130.00 元税额和 1,130.00 元账单。提交并由另一身份复核付款 600.00 元，供应商明细、账龄及账单均剩 530.00 元。复核请求重放后凭证只贷记一次 600.00 元，测试银行流水只扣 600.00 元，余额为 1,400.00 元。 |
| Finance 消费恢复 | Finance 停止后在原仓库页面完成单行实收，执行按钮禁用。恢复后重放原收货操作并回读同一结果，库存流水、暂估事实和账簿凭证各一条。 |
| RabbitMQ 与暂估门禁 | 消息代理断连时库存先记录实收，采购回执待确认，财务暂无该笔事实。恢复后采购回到终态。新期间开放前按原页面重试暂估返回 409，开放专用测试期间后重试成功。各笔库存、财务事实和暂估凭证均核对唯一。 |

[采购与批准](../../artifacts/dashboard-d4-original-ui/live-purchase.png) · [仓库流水](../../artifacts/dashboard-d4-original-ui/live-inventory.png) · [关闭余量](../../artifacts/dashboard-d4-original-ui/live-closed-purchase.png) · [付款与银行流水](../../artifacts/dashboard-d4-original-ui/live-payment.png) · [应付明细与账龄](../../artifacts/dashboard-d4-original-ui/live-payables.png) · [暂估等待](../../artifacts/dashboard-d4-original-ui/live-accrual-pending.png) · [暂估恢复](../../artifacts/dashboard-d4-original-ui/live-accrual-recovered.png)

本轮真实 D4 的三条浏览器用例分别通过。由于本机并行运行时出现内存不足，真实检验复用已运行的 AppHost，并省去原型预览服务。RabbitMQ 恢复后的诊断 Ping 成功，Aspire 仍显示 `Starting`，后续启动 Finance 一度停在 `Waiting`。正常重启本轮专用实例后，故障用例通过。恢复判定使用网关健康、采购回执、实收事实和凭证核对。

本轮共通过 169 项单测和 24 项 MSW 浏览器用例。MSW 验证原页面上的分批收货、期间门禁、税额评估、独立付款，以及丢失响应后以同一操作 ID 和同一请求体重放。严格类型检查通过，mock 和 live 构建均生成 Nitro Node 产物。Lint 检查排除了工作区的临时登录脚本 `e2e/tmp-keycloak-login.mjs`，其余文件通过。

真实验证结束后，指定 AppHost 已正常停止。`aspire ps --format Json` 返回空列表，PostgreSQL、Redis、Keycloak 和 RabbitMQ 四个持久卷仍在。D4 的验收范围是本地真实栈和 MSW 回归。

## 采购页权限提示补充验收

2026-11-21。请求模式的采购权限拦截曾显示原型的 `?state=forbidden` 文案。现根据登录、工作区访问、采购模块和读取权限显示对应提示。「刷新权限」重新读取当前工作区的授权与订单状态。MSW 浏览器回归先复现了旧文案，再验证新提示、新建按钮禁用、重新读取授权及保留当前页面。

```powershell
pnpm --dir src/Web/nexora-dashboard test:msw e2e/d4.msw.spec.ts
```

## 采购单价补充验收

2026-11-21。原采购明细默认填入零单价，保存时未校验正数、上限和小数位数。新行改为留空，保存草稿和提交前都校验单价大于零、最多六位小数且不超过 10,000,000。验证失败时显示对应明细行并保留输入。

MSW 浏览器用例先复现零单价提交，修复后确认 `0`、`0.0000001` 和 `10000000.000001` 都未发出建单请求。改填 `10.123456` 后，原值作为十进制字符串提交，返回 `201`。

```powershell
pnpm --dir src/Web/nexora-dashboard test:msw e2e/d4.msw.spec.ts --grep '采购单价校验'
```
