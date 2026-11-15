# W2 F21 经营仪表盘验收记录

日期：2026-11-13。范围：F21 财务 / 经营仪表盘、收入支出与现金概览（[accountgo-gap-todo.md](../accountgo-gap-todo.md) W2 第 4 项；[计划.md](../计划.md) 第 2.2 节 F21）。

## 实现摘要

- 新增 `src/Web/nexora-web/app/utils/dashboard.ts`：`monthWindows`（近 6 个月窗口并按账簿起始日裁剪）、`previousWindow`（等长上期区间）、`topPartners`（按往来单位汇总未结金额取 Top）、`delta`、`barWidth`、`statementCheck`（概览与利润表合计口径校验）。
- 新增 `src/Web/nexora-web/app/components/WorkspaceDashboard.vue`：并行读取 Finance 概览、上期概览、应收 / 应付账龄、利润表（含上期对比）、库存仓库与库存池、Reporting 经营投影；展示 KPI（收入 / 费用 / 净利润 / 现金 / 应收 / 应付 / 库存估值 / 投影状态）、6 个月收入支出趋势与条形、期间对比、账龄桶与 Top 客户 / 供应商、损益明细钻取（行 → 过账明细 → 凭证）；口径不一致时提示；空数据时显示可操作空态。
- `src/Web/nexora-web/app/pages/index.vue`：模块导航新增 `dashboard`（经营仪表盘），面板接入 `WorkspaceDashboard`，账龄 / 报表按钮通过 `@open` 切换模块。
- `src/Web/nexora-web/i18n/locales/zh-CN.json`、`en.json`：新增 `workspaces.console.dashboard` 文案。
- 数据口径：卡片取 Finance `/reporting/overview`（与利润表同一过账水位）；趋势按月逐窗读取同一端点；账龄取 `/reporting/aging/{kind}`；钻取复用 `/reports/profit-and-loss/rows/{key}` 与 `/ledger/journals/{id}`；库存取 Inventory 仓库与库存池，估值汇总 `value` 字段；经营投影取 Reporting `/api/reports/workspaces/{id}`，未生成时显示待同步。
- 无后端契约变更。

## 环境与复现

- 修改前端源码后必须重启 AppHost（Nuxt dev 不热更新 app 源码），再执行浏览器验证。

```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g "Business dashboard" --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

## 验收断言

| 断言 | 结果 |
| --- | --- |
| 模块导航出现“经营仪表盘”，面板标题可见 | 通过 |
| 新建工作区初始化账簿后，本期收入 / 费用 / 净利润 / 现金 / 应收 / 应付卡片与 `/reporting/overview` 返回值逐项一致 | 通过 |
| 库存估值卡片在无库存时显示 0.00 | 通过 |
| 近 6 个月收入与费用趋势固定 6 行（账簿起始日为 5 个月前） | 通过 |
| 口径校验显示“利润表一致”（概览与利润表合计同水位） | 通过 |
| 空数据时显示“本期暂无损益发生额”与应收 / 应付空态 | 通过 |
| 经营投影显示已同步版本或待同步，不阻塞其他卡片 | 通过 |
| “查看账龄明细”切换到账龄模块（tab aria-selected） | 通过 |
| 聚焦用例：`pnpm exec playwright test e2e/workspace.spec.ts -g "Business dashboard"` → 1 passed (9.2s) | 通过（日志 [f21-dashboard-e2e.log](../../artifacts/w2/f21-dashboard-e2e.log)） |
| 完整 workspace 回归套件：18 用例通过（9.6m） | 通过（日志 [f21-workspace-suite.log](../../artifacts/w2/f21-workspace-suite.log)） |
| 静态验证：typecheck / lint（0 error）/ 单测 22 通过 / build 成功 | 通过 |

## 边界与后续增强

- e2e 使用“新建工作区 + 初始化账簿”的零数据场景：Finance 手工凭证受 maker / reviewer 职责分离限制，单用户浏览器用例无法直接造过账数据；钻取链路复用已有财务报表 e2e 的过账与凭证断言，本记录不重复造数。
- Reporting 经营投影在新建工作区通常尚未生成，卡片显示“待同步”；投影到达后显示版本与更新时间，延迟口径以 Finance 过账水位为准。
- 后续增强：按日 / 自定义区间与多币种换算、图表交互与导出、Top 商品与区域维度、告警阈值。
