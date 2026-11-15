# W3 F09 / F10 计划、订阅、配额与手工计费验收记录

日期：2026-11-14。范围：[accountgo-gap-todo.md](../accountgo-gap-todo.md) 中 W3 的 F09「计划、订阅、模块开关、配额和权益查询」与 F10「计费状态与客户门户」。

## 范围

- F09：Plan / Subscription / Entitlement / Quota 领域模型；工作区订阅状态；模块门禁接入各服务入口；配额执行与超额提示；权益查询 API 与计费管理页；计划切换。
- F10：按本项目「手工 / 自托管状态准确」口径实现订阅生命周期（试用、活跃、逾期、取消）、账单 / 收据登记与查询、幂等与取消降级链路；外部计费 provider、客户门户与 webhook 列后续增强（见文末边界）。

## 实现摘要

- 计费账户：Organization 的工作区创建会为每个工作区生成独立 `TenantId`，因此订阅不以 `TenantId` 为键，而以工作区所有者账号（`Issuer` + `Subject`）作为计费账户；同一账户拥有的全部企业工作区共享一份订阅与配额，个人工作区不计入工作区配额。
- 领域模型（`src/Services/Organization/Nexora.Organization.Domain/Aggregates/Billing/`）：
  - `BillingPlans`：免费版（0 分 / 1 工作区 / 3 席位 / 每月 500 单据）、标准版（9900 分 / 10 / 50 / 20000）、专业版（29900 分 / 1000 / 500 / 1000000），模块矩阵为 company、book、reports、aging、partners、catalog → +inventory、purchasing、sales → +receivables、audit、assistant。
  - `WorkspaceSubscription`：状态 active / trial / past_due / canceled；试用 14 天、付费期 30 天；`Refresh` 在读取时把到期订阅转为 past_due；取消后 `EffectivePlan` 回落到免费版。
  - `BillingInvoice`：pending / paid / void，开立即绑定套餐、金额与付款参考号。
  - `BillingUsage`：按计费账户 + 月份记录单据用量，`BillingUsageReservation` 以 `operationId` 为主键做幂等预留。
- 应用层（`Application/UseCases/Billing/`）：`BillingEntitlements` 负责权益、用量、超额校验与警告；`BillingUseCases` 提供账单视图、计划选择（带付款参考号即激活付费期，否则进入试用并生成待支付账单）、登记付款、取消订阅与单据配额预留；`BillingQueries` 提供工作区权益查询。
- 配额执行：创建工作区前校验非个人工作区数量；发出邀请前校验「活跃成员 + 待兑换邀请」席位；单据创建前经 BFF 预留 1 张月度额度。并发预留走数据库级幂等写入与原子增量，同一 `operationId` 重放不会重复计数。
- 模块门禁：网关 `ModuleEntitlementMiddleware` 按请求路径解析工作区与模块，调用 Organization 权益接口（透传调用者 Bearer），套餐未包含时返回 403 `{"code":"module.not_in_plan"}`；Organization 不可达时放行以免误伤既有流量。
- API（Organization）：`GET /api/workspaces/{id}/billing`（`organization.billing.read`）、`GET .../billing/entitlements`（`organization.read`）、`POST .../billing/subscription`（`organization.billing.manage`）、`POST .../billing/invoices/{invoiceId}/pay`、`POST .../billing/subscription/cancel`、`POST .../billing/usage/documents`。
- 权限：新增 `organization.billing.read`（Owner 与 Administrator）与 `organization.billing.manage`（仅 Owner）；既有 `organization.audit.read` 不变。
- 配置：`Billing:DefaultPlan` 决定无订阅行时的默认套餐。本地 AppHost 设为 `pro`（既有租户祖父化为专业版，避免历史数据与既有 e2e 被免费版配额卡住），生产默认 `free`。
- 前端：`app/utils/billing.ts` 提供标签、金额、用量比例、模块判定与计划切换判定；`WorkspaceBilling.vue` 展示当前套餐 / 状态 / 生效套餐 / 用量进度与账单表，支持切换免费版、登记付款激活与取消订阅；`/companies/{workspaceId}/billing` 页面与侧栏「计费与套餐」入口；工作台按权益过滤模块并显示套餐徽标。
- BFF：`POST /api/(sales|purchasing)/workspaces/{id}/orders` 在转发前用会话令牌预留 1 张单据额度，额度不足直接返回 409，避免超额写入业务库。
- 迁移：`20261113145503_AddBilling` 新增 `billing_subscriptions`、`billing_invoices`、`billing_document_usage`、`billing_usage_reservations`；`dotnet ef migrations has-pending-model-changes` 无差异。

## 环境与复现

```powershell
# 后端构建与测试（改动的 .cs 需 touch 后再增量构建）
dotnet build Nexora.slnx -c Release
dotnet test tests/Nexora.Tests -c Release --no-build

# 前端静态检查
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build

# 本地集成
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g "Billing plans" --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

注意事项：

- Playwright 追加参数必须用 `pnpm --dir src/Web/nexora-web exec playwright test ... -g "..."`；写成 `pnpm test:e2e -- --grep ...` 会把 `--` 透传并退化为全量运行。
- 修改前端 `app/` 源码后需要重启 AppHost，Nuxt dev 不会把改动热更新到已运行的浏览器页面。
- 本地 e2e 依赖 `Billing__DefaultPlan=pro`；若把本地默认改为 free，既有历史租户会立即触发免费版配额。
- 完整 `workspace.spec.ts` 套件约 12 分钟，串行运行。

## 验收断言

| 断言 | 结果 |
| --- | --- |
| 三档计划矩阵与模块差异可查询：免费版含 book、不含 sales；标准版含 sales；专业版含 assistant | 通过（e2e `readEntitlements`） |
| 计费页展示当前套餐（专业版）、用量与账单，界面可切换到免费版并显示「已取消」 | 通过（`billing-plan` / `billing-status` / `billing-usage-documents`） |
| 免费版模块门禁：AI 助手、库存入口返回 403 且含 `module.not_in_plan` | 通过（网关中间件） |
| 免费版控制台隐藏未包含模块（sales 不存在、book 可见）并显示套餐徽标 | 通过（`module-sales` 计数 0、`workspace-plan` 文本） |
| 免费版工作区配额 1：已有一个工作区时新建第二个返回 409 | 通过 |
| 免费版席位配额 3：所有者 + 2 个待兑换邀请后，第三个邀请返回 409 | 通过 |
| 免费版每月 500 张单据：预留到上限后 API 预留返回 409，BFF 订单入口同样 409 | 通过（`usage/documents` 与 `sales/orders`） |
| 登记线下付款升级标准版：订阅 active、生成 paid 账单、inventory 入口 200、assistant 仍 403 | 通过 |
| 取消后选择专业版进入试用并生成 pending 账单 | 通过（status=trial、invoices 含 pending pro） |
| 同一 `operationId` 重复登记付款：两次均 200，账单数量不变，权益只生效一次 | 通过（幂等） |
| 同一计费账户的第二个工作区共享权益；取消后同步降级为 403，恢复专业版后 200 | 通过（跨工作区） |
| 配额并发预留不产生 409 冲突（并发同 `operationId` 重放返回同一结果） | 通过（数据库级幂等，回归 `Purchase orders` 用例） |
| .NET 测试：计划矩阵、配额边界、订阅生命周期 | 34/34 通过（`tests/Nexora.Tests`，含 `BillingPlanTests` 3 项） |
| 前端静态检查与单测 | typecheck 0 错误；lint 0 error（30 既有 warning）；9 文件 47 测试通过；`pnpm build` 成功 |
| 完整本地回归 | `workspace.spec.ts` 24 passed（11.9m） |

产物日志：`artifacts/w3/f09-f10-dotnet-build.log`、`f09-f10-dotnet-test.log`、`f09-f10-typecheck.log`、`f09-f10-lint.log`、`f09-f10-unit.log`、`f09-f10-build.log`、`f09-f10-billing-e2e.log`、`f09-f10-assistant-rerun.log`、`f09-f10-workspace-suite.log`。

## 边界与后续增强

- 计费 provider：本期为自托管手工计费（工作区 Owner 自助登记线下付款参考号），未接入外部 provider、支付方式管理、客户门户、webhook 验签 / 重试 / 退款与对账；F10 按「手工 / 自托管状态准确」口径验收，provider 接入后补齐门户与回调验证。当前无平台管理员角色，Owner 自助登记存在自证付款的治理边界。
- 单据配额在 BFF 入口预留，绕过 BFF 直连服务 API 不受该预留约束；订单业务校验失败也会消耗 1 张额度（后续可改为成功确认 + 失败补偿）。
- 订阅以所有者身份为键：工作区转移所有权后订阅不随工作区迁移，需要后续提供账户合并 / 转移流程。
- 试用到期与逾期转 past_due 在读取权益时惰性触发，尚无后台定时作业；到期提醒仅以警告形式返回。
- 免费版默认值仅本地配置为 pro 以便回归，生产部署需显式确认 `Billing__DefaultPlan`。
