# W4 RCD 通用记录变更审计链验收记录

## 范围

W4 参考项目增量第二项 RCD：六个业务服务（Finance、Organization、MasterData、Sales、Purchasing、Inventory）统一记录新增 / 修改 / 删除的变更前后快照，提供按权限查询、CSV 导出、审计面板「记录变更」页签与保留策略后台任务，并与 F38 业务审计统一查询口径（权限 `organization.audit.read`、保留 730 天、默认分页 50）。

## 实现摘要

- 共享契约 `src/BuildingBlocks/Nexora.BuildingBlocks.Application/Audit/RecordChanges.cs`：`RecordChangeOperations`（created / updated / deleted）、`RecordChangeQuery`（From / Through / Actor / EntityName / Operation / EntityId / Page / PageSize，`Normalize` 默认最近 730 天并收敛分页）、`RecordChangeView` / `RecordChangePage`、`IRecordChangeReader`。
- 共享基础设施 `src/BuildingBlocks/Nexora.BuildingBlocks.Infrastructure/Audit/`：
  - `RecordChange` 实体与 `record_changes` 表映射，索引 `(TenantId, WorkspaceId, OccurredAtUtc)`、`(TenantId, WorkspaceId, EntityName, EntityId)`、`(TenantId, WorkspaceId, Operation)`。
  - `RecordChangeInterceptor`：在 `SaveChanges` 时物化 `ChangeTracker`，跳过记录变更实体与类型名以 `Audit` 结尾的实体；实体 ID 由主键拼接，Workspace 实体以主键作为工作区；仅记录标量属性，字符串与 JSON 快照分别截断至 1000 / 16000 字符。
  - `RecordChangeContext` 与 `UseRecordChanges` 中间件：从 `iss` / `sub` 声明写入 `AsyncLocal` 操作者，缺省 `system`。
  - `RecordChangeReader<TContext>`：按发生时间倒序分页，CSV 导出（最多 5000 行，转义逗号 / 引号 / 换行）。
  - `RecordChangeRetentionService<TContext>`：启动 1 分钟后、之后每 6 小时按 `RecordChanges:RetentionDays`（默认 730）清理过期记录。
- 六个服务接线：各 `Nexora.*.Infrastructure.csproj` 引用共享项目；DbContext 增加 `DbSet<RecordChange>` 与模型配置；Program / DI 注册 `RecordChangeInterceptor`（服务名 finance / organization / masterdata / sales / purchasing / inventory）、`AddRecordChanges<TContext>` 与 `RecordChangeQueries`；在 `UseAuthentication` 之后启用 `UseRecordChanges`。
- 迁移：`20261114045206_AddRecordChanges`（Finance）、`20261114045210`（Organization）、`20261114045215`（MasterData）、`20261114045219`（Sales）、`20261114045224`（Purchasing）、`20261114045228`（Inventory）；六个服务 `dotnet ef migrations has-pending-model-changes` 均为 `No changes`。
- 查询与端点：每个服务新增 `RecordChangeQueries` 与 `RecordChangeEndpoints`，均要求 `organization.audit.read`（Organization 使用 `WorkspacePermissions.Audit`）：
  - Finance `GET /api/finance/workspaces/{id}/record-changes`、`.../record-changes.csv`。
  - Organization `GET /api/workspaces/{id}/record-changes`、`.../record-changes.csv`。
  - Sales / Purchasing / MasterData / Inventory 同构为 `/api/{service}/workspaces/{id}/record-changes(.csv)`。
  - 查询参数 `from`、`through`、`actor`、`entityName`、`operation`、`entityId`、`page`、`pageSize`；CSV 文件名 `record-changes-{workspaceId}.csv`。
- Inventory 授权访问记录新增 `CanReadAudit`（来自 `organization.audit.read`），查询在缺失时抛 `AccessDeniedException`。
- 前端：
  - `src/Web/nexora-web/app/utils/recordChanges.ts`：筛选参数拼装、操作标签、变更摘要、跨服务合并去重与倒序。
  - `src/Web/nexora-web/app/components/WorkspaceRecordChanges.vue`：并行查询六个服务、筛选、加载更多、展开变更前后 JSON、客户端 CSV 导出、无权限 / 不存在提示。
  - `src/Web/nexora-web/app/components/WorkspaceAudit.vue`：新增「审计查询 / 记录变更」页签，记录变更复用工作区审计入口。
- 测试：`src/Web/nexora-web/test/recordChanges.test.ts` 6 项单测；`src/Web/nexora-web/e2e/workspace.spec.ts` 新增用例 `Record changes capture cross-service snapshots, filter, export and isolate workspaces`。

## 环境与复现

```powershell
dotnet build Nexora.slnx -c Release
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g "Record changes" --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

注意：修改 `app/` 源码后需重启 AppHost，Nuxt 开发服务器不会热更新应用源码；生成迁移后需重新编译再执行 `dotnet test --no-build`。

## 验收断言

| 断言 | 结果 |
| --- | --- |
| 新增记录生成 created 快照，含租户 / 工作区与操作者字段 | 通过（Organization Workspace created） |
| 修改记录生成 updated 快照并记录变更属性 | 通过（WorkspacePreferences 二次 PUT，changedProperties 非空） |
| 跨服务记录进入同一查询口径 | 通过（Finance Book / Tax created，service=finance） |
| 查询返回保留策略 730 天 | 通过 |
| CSV 导出表头与内容 | 通过（occurredAtUtc,service,... 且含 finance 行） |
| 前端「记录变更」页签：来源筛选、列表、展开变更前后、CSV 导出 | 通过 |
| 跨工作区隔离：第二工作区仅返回自身记录 | 通过 |
| 无权限 / 不存在工作区返回拒绝 | 通过（403 / 404） |
| 前端单测 | 通过（6 项） |
| `dotnet test` 全量 | 通过（36/36） |
| 前端 typecheck / lint / 单测 / 构建 | 通过（单测 10 文件 53 项） |
| 全量 workspace e2e 回归 | 通过（26 passed） |

## 边界与后续增强

- 快照仅记录标量属性，导航属性与集合不记录；字符串与 JSON 截断后超大变更需外部存档。
- 变更记录与业务写入同事务提交，保留策略为后台定时清理，未做冷存归档。
- Organization 与 F38 一致使用 `WorkspacePermissions.Audit`，其余服务读取 `organization.audit.read`；跨服务聚合由前端并行查询完成，后续可加 BFF 聚合端点。
- 记录变更不含业务审计动作（如 `journal.posted`），两者通过工作区与时间口径关联；后续可合并为统一时间线。
- CSV 客户端导出为当前已加载数据，服务端单次导出上限 5000 行；后续可加异步导出任务。
