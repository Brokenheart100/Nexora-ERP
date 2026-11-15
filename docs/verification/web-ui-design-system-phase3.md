# Web 样式分层 Phase 3（列表表格迁 Nuxt UI UTable）

日期：2026-11-14。状态：Phase 3 本地通过（typecheck / lint / 单测 / build、聚焦 e2e、全量 workspace 套件）；Phase 4–7 未开始；远端 CI 与生产验收未执行。

决策与四层分工见 [ADR 0020](../adr/0020-frontend-design-system-layering.md)。Phase 0 基线与 Phase 1–2 见 [基线记录](web-ui-design-system-baseline.md) 与 [Phase 1–2 验证记录](web-ui-design-system-phase1-2.md)。

## 范围

本次只把业务列表从手写 `<table>` 迁到 Nuxt UI `UTable`，不改变 BFF、业务 API、数据模型、可访问名称、`data-testid`、面板顺序与打印隔离结构。财务报表（`WorkspaceFinancialReports.vue`）按 ADR 取舍保留自定义表格。

## 实现摘要

| 文件 | 变更 |
| --- | --- |
| `src/Web/nexora-web/app/components/WorkspaceRecordChanges.vue` | 记录变更表迁 `UTable`（`data-testid="record-change-list"`）；列 = 时间 / 来源 / 实体 / 操作 / 操作者 / 摘要 / 展开；`:get-row-id` 用 `service|id`；展开行显示变更前 / 变更后 JSON；筛选与 CSV 不变 |
| `src/Web/nexora-web/app/components/WorkspaceAudit.vue` | 审计查询表迁 `UTable`（`data-testid="audit-entry-list"`）；展开行显示目标 ID / 版本等明细；保留 `.audit-detail` 文本样式 |
| `src/Web/nexora-web/app/components/WorkspaceCatalog.vue` | 商品目录表迁 `UTable`（`data-testid="catalog-list"`）；列含编码 / 名称 / 类型 / 分类 / 单位 / 状态；`canManage` 时增加操作列「编辑 {code}」 |
| `src/Web/nexora-web/app/components/WorkspacePartners.vue` | 往来单位表迁 `UTable`（`data-testid="partner-list"`）；角色以 ` / ` 连接；操作「查看 {code}」 |
| `src/Web/nexora-web/app/components/WorkspaceAging.vue` | 账龄明细表迁 `UTable`（`data-testid="aging-items"`）；金额列沿用 `money()`；操作「查看未结项凭证」 |
| `src/Web/nexora-web/app/components/WorkspaceChart.vue` | 科目表迁 `UTable`（`data-testid="chart-accounts"`）；父级 / 用途 / 状态列；`canManage` 时操作「编辑科目 {code}」 |
| `src/Web/nexora-web/app/components/WorkspaceBilling.vue` | 账单与收据表迁 `UTable`（`data-testid="billing-invoices"`）；待支付且可管理时行内付款参考号 `UInput` 与「登记付款」按钮 |
| `src/Web/nexora-web/app/components/WorkspaceDashboard.vue` | 三表迁 `UTable`：趋势表（`data-testid="dashboard-trend"`，收入 / 费用列保留 `.bar-track` / `.bar-fill` 进度条 slot）、期间对比表、钻取明细表（`data-testid="dashboard-postings"`，操作「查看凭证」） |
| `src/Web/nexora-web/app/components/WorkspaceFinancialReports.vue` | **保留自定义表格**：报表分节、固定列、打印隔离与高密度布局依赖既有 `.report-screen` 结构与 `@media print` 规则，`UTable` 无法等价替代（ADR 0020「比较与取舍」） |

各组件同时删除了手写的 `.table-scroll` / `table` / `th, td` scoped 规则；仪表盘保留 `.bar-track` / `.bar-fill`，账单保留行内付款输入样式，财务报表保留打印与报表样式。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-web typecheck` | 通过（各组件迁移后逐次检查，均 exit 0） |
| `pnpm --dir src/Web/nexora-web lint` | 0 error；34 条既有 `vue/first-attribute-linebreak` warning（InvoiceSchedules.vue、WorkspaceAssistant.vue） |
| `pnpm --dir src/Web/nexora-web test:unit` | 10 个文件 53 项通过 |
| `pnpm --dir src/Web/nexora-web build` | 通过（23.2s） |
| 聚焦 e2e（Catalog / Partner / Chart / Audit / Dashboard / Billing / Record changes / Journal links / P4 sales） | 9 passed（4.7m） |
| 全量 `workspace.spec.ts` | 26 passed（13.0m）；Playwright JSON：expected 26 / skipped 0 / unexpected 0 / flaky 0 |

Playwright JSON 报告写入本地 `src/Web/nexora-web/artifacts/w4-phase3-workspace-suite.json`（未纳入版本控制）。

## 复现

```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build

$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait gateway --apphost $appHost --timeout 180 --non-interactive

pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line -g "Catalog UI|Partner profiles|Chart hierarchy|Unified audit|Business dashboard|Billing plans|Record changes|Journal links|P4 sales"
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost $appHost --non-interactive
```

## 验收断言

- 商品目录、往来单位、科目、账龄、账单、审计、记录变更、仪表盘列表均以 `UTable` 渲染，行 / 单元格文本与迁移前一致。
- e2e 既有 `getByRole('row', { name: ... })`、`getByRole('cell', { name: ... })`、按钮可访问名称（「编辑 SKU-01」「编辑科目 1101」「登记付款」「查看凭证」等）全部保持，26 项全量套件通过。
- 记录变更与审计的展开行仍显示明细与变更前 / 变更后 JSON；CSV 导出文件名、BOM 与表头不变，toast 提示保留。
- 仪表盘趋势表仍渲染 6 行 `tbody tr`，收入 / 费用进度条宽度随 `trendMax` 变化；钻取明细可打开凭证。
- 账单待支付行仍可填写付款参考号并「登记付款」，重复登记同一付款只记一次（e2e 覆盖）。
- 跨工作区隔离、版本冲突与权限拒绝行为不变；BFF、业务 API 与数据模型零改动。
- 财务报表打印隔离结构未改，`html[data-print-financial]` 打印规则仍生效。

## 边界与后续

- 财务报表保留自定义表格（理由见上）；若后续引入固定列 / 打印方案再评估迁移。
- Phase 4 表单迁移以本阶段结论为前提：先公司设置与初始化向导，再税务 / 商品 / 银行导入，单据头部最后；label 文本、`name`、`id`、`data-testid` 与错误文案保持不变。
- 远端 CI 与生产验收未执行；本地验证依赖 Aspire 与 Keycloak 开发身份。
