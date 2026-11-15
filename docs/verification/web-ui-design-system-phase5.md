# Web 样式分层 Phase 5（页签）

日期：2026-11-14。状态：Phase 5 已完成；审计页签经 UTabs 试验后回退为自定义页签并记录原因，控制台页签保留自定义；Phase 6–7 已在本轮后续完成。远端 CI 与生产验收未执行。

决策与四层分工见 [ADR 0020](../adr/0020-frontend-design-system-layering.md)。Phase 0–4 见 [基线记录](web-ui-design-system-baseline.md)、[Phase 1–2](web-ui-design-system-phase1-2.md)、[Phase 3](web-ui-design-system-phase3.md) 与 [Phase 4](web-ui-design-system-phase4.md)。

## 范围

本轮页签只有两处：

- 审计视图页签：`WorkspaceAudit.vue` 内「审计查询 / 记录变更」。
- 控制台页签：`pages/index.vue` 内 8 个业务模块页签（总览 / 经营仪表盘 / 公司设置 / 账簿设置 / 财务报表 / 财务概览 / 往来单位 / 商品目录 / 库存工作台 / 采购订单 / 销售订单 / 应收工作台 / 审计查询 / AI 助手）。

## 决策与结果

1. **审计页签**：按 ADR 先尝试 Nuxt UI `UTabs`（`variant="pill"`、`size="sm"`、`:content="false"`，label 插槽内保留 `data-testid`）。试验发现两个问题：
   - Reka UI 的 `TabsIndicator` 在该组合下未渲染（DOM 中为 `<!--v-if-->`），导致激活项只剩 `data-[state=active]:text-inverted` 的白色文字而没有品牌色指示块，浅色主题下激活项几乎不可见；
   - `UTabs` 水平方向默认 `w-full` 分段条，与 ERP 紧凑页签行不一致，强行覆盖 `ui` 后仍无法恢复原视觉。
   结论：回退为原有自定义 `role="tablist"` 页签按钮（`data-testid="audit-tab-audit" / "audit-tab-changes"`、`aria-selected`、`aria-controls`、`role="tabpanel"` 均保持），并在 ADR 0020「Phase 5 页签」条目记录该取舍。e2e 依赖的 `getByTestId('audit-tab-changes')` 不变。
2. **控制台页签**：保留自定义。它是应用壳层主导航，含 8 个模块图标、横向滚动与套餐 chip，`UTabs` pill 无法等价保持；与 ADR Phase 6「应用壳层保留自定义」一致。无 e2e 依赖 class 选择器。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-web typecheck` | 通过（exit 0） |
| `pnpm --dir src/Web/nexora-web lint` | 0 error；62 条既有 `vue/first-attribute-linebreak` warning |
| `pnpm --dir src/Web/nexora-web test:unit` | 10 个文件 53 项通过 |
| `pnpm --dir src/Web/nexora-web build` | 通过（14.5s） |
| 聚焦 e2e（Record changes / Unified audit 等 9 项，含页签切换） | 9 passed（3.9m） |
| 全量 `workspace.spec.ts` + `email-onboarding.spec.ts` | 30 passed（15.2m；workspace 26 + email-onboarding 4） |

页签切换由 `workspace.spec.ts` 的「Record changes capture cross-service snapshots, filter, export and isolate workspaces」覆盖：点击 `audit-tab-changes` 后断言「记录变更」标题、表格、筛选、展开与 CSV 导出。

## 复现

```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build

$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait gateway --apphost $appHost --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts e2e/email-onboarding.spec.ts --reporter=line
aspire stop --apphost $appHost --non-interactive
```

## 验收断言

- 审计页签仍是两个紧凑按钮，激活项有品牌色背景与深色文字；`data-testid`、`role=tab/tabpanel`、`aria-selected` 保持，`getByTestId('audit-tab-changes')` 可点击并渲染记录变更面板。
- 控制台模块页签的图标、横向滚动、套餐 chip 与激活态不变。
- 未改动 BFF、业务 API、数据模型与面板顺序。

## 边界与后续

- `UTabs` 的 Reka `TabsIndicator` 渲染问题记录在案；若后续 Nuxt UI / Reka 版本修复，可重新评估审计页签迁移。
- 远端 CI 与生产验收未执行。
