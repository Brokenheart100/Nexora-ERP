# W4 RDY 开账就绪检查验收记录

日期：2026-11-14。范围：W4 参考增量 RDY（启用财务过账前的开账就绪检查、缺失分录清单与按业务日期补记）。验收环境：本地 Aspire AppHost + PostgreSQL 持久卷，Release 构建，前端 Nuxt 4 / Vitest / Playwright（Edge）。

## 1. 实现摘要

- 应用层（`src/Services/Finance/Nexora.Finance.Application`）：`ReadinessPolicy` 以纯函数判定 `book.missing`、`book.opening`、`documents.posted_without_journal`、`costs.pending_accrual` 四项检查及就绪状态；`ReadinessUseCases` 读取账簿与期初状态、统计缺失单据与未过账成本，补记时复用 `TradeUseCases.AccrueAsync`，以 `readiness.costs.backfilled` 幂等重放；`IReadinessStore` 定义查询端口。
- 补记门禁：沿用 `TradePosting.GateAsync` 的账簿区间、会计期间开启与「先完成期初」校验，受阻项以 `BlockedCost.Reason` 返回；成功项记录 `JournalId`，与 F18 / F19 的期间锁定和开账顺序一致。
- 基础设施（`src/Services/Finance/Nexora.Finance.Infrastructure`）：`ReadinessStore` 以 EF Core 按 `TenantId` + `WorkspaceId` 投影已过账且 `JournalId` 为空的账单 / 发票，以及未过账 `receipt_accruals`，按业务日期与序号排序后写回；未新增迁移。
- API：`GET /api/finance/workspaces/{workspaceId}/readiness`（`finance.ledger.read`）与 `POST /api/finance/workspaces/{workspaceId}/readiness/backfill`（`finance.journal.post`，请求 `BackfillRequest(OperationId, Through)`）；写操作经 Wolverine 事务处理器。
- 前端：`app/utils/readiness.ts` 集中标签与摘要；`WorkspaceReadiness.vue` 挂入 `WorkspaceBook.vue` 的账簿设置，展示就绪结论、四项检查、缺失单据与待处理成本，补记经 `useWorkspaceMutation` 携带 CSRF 与 `operationId`。

## 2. 环境与复现

命令从仓库根执行。

```powershell
dotnet build Nexora.slnx -c Release
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web build
```

运行入口（e2e 需 gateway）：

```powershell
aspire run --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/readiness.spec.ts --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

## 3. 验证结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 后端构建 | `dotnet build Nexora.slnx -c Release` | 通过，0 警告 0 错误 |
| .NET 测试 | `dotnet test tests/Nexora.Tests -c Release --no-build` | 42 / 42 通过（含 `ReadinessPolicyTests` 6 项，1 分 24 秒） |
| 前端单测（本轮新增） | `pnpm exec vitest run test/readiness.test.ts` | 4 / 4 通过 |
| 前端单测（全量） | `pnpm test:unit` | 13 个文件 71 项通过 |
| 类型检查 | `pnpm --dir src/Web/nexora-web typecheck` | 退出码 0（仅既存 vue-router / volar 警告） |
| 静态检查 | `pnpm --dir src/Web/nexora-web lint` | 0 错误，62 条既存样式告警 |
| 前端构建 | `pnpm --dir src/Web/nexora-web build` | 通过 |
| 面板 e2e | `pnpm exec playwright test e2e/readiness.spec.ts --reporter=line` | 2 / 2 通过（7.0 秒；修复用例时序后重跑） |

## 4. 验收断言

| 验收点 | 断言 | 结果 |
| --- | --- | --- |
| 检查已过账单据是否有分录 | `documents.posted_without_journal` 计数 > 0 时为 `fail` 并阻塞就绪；为 0 时 `pass` | 通过（策略单测 2 项 + e2e 缺失清单区块） |
| 未入账库存成本 | `costs.pending_accrual` 列出业务日期、类型、金额与原因；> 0 时阻塞就绪 | 通过（e2e 展示「采购入库」与期间未开启原因） |
| 就绪结论 | `ready = 无 fail 检查`；期初待过账仅 `warn` | 通过（策略单测覆盖无账簿、期初缺失 / 待过账、完整账簿） |
| 按业务日期补记 | 补记后返回 `posted` 明细并刷新就绪视图 | 通过（e2e 点击补记后摘要转「就绪」并提示补记 1 项） |
| 受阻补记 | 返回 `blocked` 原因，列表保留且摘要仍为未就绪 | 通过（e2e 提示「另有 1 项仍受阻」并显示「补记受阻（1）」） |
| 幂等 | 同一 `operationId` 重放返回既有结果（`replayed = true`），不重复过账 | 通过（`FinanceMutation` 既有机制；面板重试复用操作编号） |
| 权限 | 读取需 `finance.ledger.read`，补记需 `finance.journal.post` | 通过（`ReadinessUseCases` 显式 `Demand` / `LockAsync`） |
| 跨工作区隔离 | 查询按 `TenantId` + `WorkspaceId` 过滤 | 通过（`ReadinessStore` 统一 Scope 过滤） |
| 与 F18 / F19 衔接 | 补记走 `TradePosting.GateAsync`，期间关闭或期初未完成时受阻 | 通过（策略与补记路径复用同一门禁） |

## 5. 边界与后续增强

- 软门禁：面板提示「未就绪」并列出阻塞项，但不阻止进入开账表单；开账本身仍由既有「期初余额先过账」规则约束。后续可把就绪检查前置为开账提交前的硬校验。
- e2e 以 BFF 路由 mock 驱动页面交互（工作区列表、账簿、就绪与补记响应），后端查询与补记逻辑由单元测试与门禁复用覆盖；真实数据库下的补记未在自动化中执行，需已过账单据与未过账成本种子。
- 大工作区需分页与后台补记任务；当前面板最多展示 50 条待处理成本。
- 未新增权益模块映射，readiness 路径不触发套餐门禁；后续可并入 Reports / Books 权益口径。
