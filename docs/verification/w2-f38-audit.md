# W2 F38 业务与安全审计查询验收记录

## 范围

- 对应条目：`docs/accountgo-gap-todo.md` F38 业务与安全审计查询（`docs/计划.md` 2.2 与 10.8 F38）。
- 目标：组织与安全、财务、销售、采购四类审计记录可按工作区统一查询，支持时间、操作者、操作、目标与分页过滤；提供列表 / 详情 UI、CSV 导出与读侧保留策略；跨工作区不可见。

## 实现摘要

- 共享契约：`src/BuildingBlocks/Nexora.BuildingBlocks.Application/Audit/AuditTrail.cs` 定义 `AuditQuery`（From / Through / Actor / Action / TargetId / Page / PageSize）、`AuditEntry`、`AuditPage` 与 `AuditSources`；`AuditQuery.Normalize` 校正分页并默认只读取最近 730 天。
- Organization：`GET /api/workspaces/{id}/audit`，权限 `organization.audit.read`（Owner / Administrator 可读），读取 `WorkspaceAudit` 表。
- Finance：`GET /api/finance/workspaces/{id}/audit`，先经账簿访问校验再要求 `organization.audit.read`，读取 `FinanceAudit` 表。
- Sales / Purchasing：`GET /api/sales/workspaces/{id}/audit`、`GET /api/purchasing/workspaces/{id}/audit`，经各自权限适配器要求 `organization.audit.read`，读取 `SalesAudit` / `PurchaseAudit` 表。
- 四个读取器统一按 `TenantId + WorkspaceId` 限定范围，时间倒序、按 `(OccurredAtUtc, Id)` 稳定排序，`PageSize + 1` 判定 `HasMore`。
- 前端：新增 `app/utils/audit.ts`（日期边界、查询参数、跨来源去重合并）、`app/components/WorkspaceAudit.vue`（筛选表单、来源选择、合并列表、详情展开、空态与无权限提示、加载更多、CSV 导出）与工作台「审计查询」模块（`app/pages/index.vue`、中英文文案）。
- CSV 导出列：时间、来源、操作、操作者颁发方、操作者主体、目标、版本、操作 ID；文件名 `审计记录-yyyyMMdd-HHmm.csv`，UTF-8 BOM，防公式注入。

## 环境与复现

- 修改 C# 后先 `touch` 改动文件再构建（`ops_edit_file` 保留时间戳会让增量构建跳过编译）：

```powershell
dotnet build Nexora.slnx -c Release
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g "Unified audit trail" --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

- 修改前端源码后必须重启 AppHost（Nuxt dev 不热更新 `app/` 源码）。

## 验收断言

| 断言 | 结果 |
| --- | --- |
| 四源统一查询端点按工作区返回共享 `AuditPage`，时间倒序且分页稳定 | 通过 |
| 时间 / 操作者 / 操作 / 目标 / 来源过滤与分页参数生效 | 通过（e2e 以 `workspace.settings.revised` 过滤） |
| 工作台「审计查询」合并四源记录、来源标签、详情展开与空态 | 通过 |
| CSV 导出文件名、BOM 与中文表头正确 | 通过（`审计记录-yyyyMMdd-HHmm.csv`） |
| 跨工作区隔离：另一工作区查询不到本工作区的设置变更记录 | 通过 |
| 读侧保留策略默认 730 天，UI 展示保留天数 | 通过 |
| 聚焦 e2e `Unified audit trail …` | 1 passed（30.7s，[日志](../../artifacts/w2/f38-audit-e2e.log)） |
| 完整 workspace 回归套件 | 20 passed（10.6m，[日志](../../artifacts/w2/f38-workspace-suite.log)） |
| 静态验证 | `dotnet build` 0 警告 0 错误；typecheck / lint 0 error；unit 6 文件 32 测试通过；`pnpm build` 成功（[typecheck](../../artifacts/w2/f38-typecheck.log) / [lint](../../artifacts/w2/f38-lint.log) / [unit](../../artifacts/w2/f38-unit.log) / [build](../../artifacts/w2/f38-build.log)） |

## 边界与后续增强

- 读侧保留策略只限制默认查询窗口，尚未实现按时间的物理清理任务；需要时增加后台归档任务与保留告警。
- RCD 变更审计链不在本仓库范围；统一查询口径已通过共享 `AuditQuery` / `AuditEntry` 预留，接入时只需新增来源适配器。
- 尚未提供审计记录导出为持久化任务；当前 CSV 为前端按已加载页生成。
