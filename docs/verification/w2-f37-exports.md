# W2 F37 科目 / 经营 / 财务数据导出与打印验收记录

日期：2026-11-13。范围：F37 科目 / 经营 / 财务数据导出与打印（[accountgo-gap-todo.md](../accountgo-gap-todo.md) W2 第 5 项；[计划.md](../计划.md) 第 2.2 节 F37）。

## 实现摘要

- 后端（Finance，无 schema 变更）：
  - `IReportExportStore` 新增 `CountPendingAsync` 与 `PruneAsync`；`ReportExportStore` 按 `RequestedAtUtc` 倒序取超出保留数的任务并用 EF Core `ExecuteDeleteAsync` 删除。
  - `src/Services/Finance/Nexora.Finance.Application/UseCases/Reporting/ReportExports.cs`：`PendingLimit = 3`（同一申请人排队任务上限，超限返回 409 `BusinessConflictException`）、`RetainedLimit = 20`（新增任务后保留最近 20 个）；`QueueAsync` / `RebuildAsync` 入队前校验容量，`AddAsync` 入队后清理过期任务。
  - 既有能力保持不变：按原快照重建（`POST /report-exports/{id}/rebuild`）、申请人下载隔离（`FileAsync` 校验 Issuer / Subject，他人 404）、CSV 防公式注入、UTF-8 BOM。
- 前端：
  - 新增 `src/Web/nexora-web/app/utils/export.ts`：`csvText`（双引号转义、公式前缀单引号）、`toCsv`（UTF-8 BOM + CRLF）、`exportFileName`（`<前缀>-yyyyMMdd-HHmm.csv`）、`downloadCsv`、`printSection`（`data-print-target` 打印隔离）。
  - 新增 `src/Web/nexora-web/app/composables/useCsvExport.ts`：按页拉取（每页 50 行，最多 60 页）生成 CSV，含导出中、成功与失败提示。
  - 四个列表面板新增「导出…CSV」与「打印当前视图」：销售订单（`WorkspaceSales.vue`）、采购订单（`WorkspacePurchasing.vue`）、客户单据（`WorkspaceReceivables.vue`）、库存余额（`WorkspaceInventory.vue`）。
  - `WorkspaceFinancialReports.vue`：导出任务按钮始终可见（已完成显示「重建文件」、排队中显示「重新生成」），并说明任务按申请人隔离、最多保留最近 20 个。
  - `src/Web/nexora-web/app/assets/css/main.css`：打印样式新增 `html[data-print-section]` 隔离（隐藏侧栏、页头、控制条、非目标面板与表单控件；目标区域去边框阴影、全宽、表格滚动展开），既有 `@media print` 报表打印保留。
- 测试：新增 `src/Web/nexora-web/test/export.test.ts`（5 个用例：csvText 转义与公式防护、toCsv BOM / CRLF / 空列表、exportFileName）；`src/Web/nexora-web/e2e/workspace.spec.ts:2203` 新增导出与打印用例（授权后四个面板下载 CSV 并断言文件名 / BOM / 中文表头、打印调用一次、21 次入队后保留 20 个）。

## 环境与复现

- 注意：`ops_edit_file` 会保留文件时间戳，修改 C# 源码后需 `touch` 相关文件再 `dotnet build`，否则增量构建可能跳过编译。本次容量与保留逻辑因此一度未被运行中的服务加载（e2e 首次断言 21 条任务未裁剪），`touch` 并重建后通过。
- 修改前端源码后必须重启 AppHost（Nuxt dev 不热更新 app 源码），再执行浏览器验证。

```powershell
dotnet build Nexora.slnx -c Release
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g "Business data exports" --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

## 验收断言

| 断言 | 结果 |
| --- | --- |
| 销售订单面板导出 CSV：文件名匹配 `销售订单-yyyyMMdd-HHmm.csv`、UTF-8 BOM、含中文表头 | 通过 |
| 采购订单面板导出 CSV：文件名与表头正确 | 通过 |
| 客户单据面板导出 CSV：文件名与表头正确 | 通过 |
| 库存面板导出 CSV：文件名与表头正确（仓库编码 / 名称 / 商品 / 数量） | 通过 |
| 打印当前视图调用浏览器打印，并设置 `data-print-target` 打印隔离 | 通过 |
| 导出任务容量：同一申请人最多 3 个排队任务，超限 409 且可重试 | 通过 |
| 导出任务保留：21 次入队后列表保留最近 20 个，数据库实际裁剪 | 通过 |
| 申请人下载隔离与按原快照重建（既有 P4 用例，`workspace.spec.ts:1968-1982`） | 通过 |
| 聚焦用例：`pnpm exec playwright test e2e/workspace.spec.ts -g "Business data exports"` → 1 passed (33.9s) | 通过（日志 [f37-export-e2e.log](../../artifacts/w2/f37-export-e2e.log)） |
| 完整 workspace 回归套件：19 用例通过（9.3m） | 通过（日志 [f37-workspace-suite.log](../../artifacts/w2/f37-workspace-suite.log)） |
| 静态验证：typecheck / lint（0 error，18 既有 warning）/ 单测 27 通过 / build 成功 / `dotnet build -c Release` 0 警告 0 错误 | 通过（日志 [f37-static.log](../../artifacts/w2/f37-static.log)、[f37-dotnet-build.log](../../artifacts/w2/f37-dotnet-build.log)） |

## 边界与后续增强

- 前端导出按页拉取（每页 50 行、最多 60 页）生成快照；超大数据量应使用财务报表导出任务或后续后台批量导出。
- 库存导出只汇总当前用户可读仓库的库存池，是否可读由仓库的 `canReadStock` / `canReceive` / `canManage` 决定。
- 打印依赖浏览器打印对话框；打印样式由 `@media print` 与 `html[data-print-section]` 共同隔离。
- 后续增强：订单 / 库存后台批量导出任务、xlsx / pdf 格式、导出审计与容量告警、失败自动重试。
