# F07 资源范围、职责分离与审批政策验收记录

日期：2026-11-15。范围：F07「业务角色、权限、数据范围、职责分离与审批政策」的最小验收切片：财务期间数据范围、审批人数策略（1 / 2 位所有者）与双人复核、跨范围与越权矩阵。验收环境：本地 Aspire AppHost + PostgreSQL 持久卷 + RabbitMQ，Release 后端构建；前端 Nuxt 4 / TypeScript strict / Vitest / Playwright（Edge，workers=1）。

## 1. 实现摘要

### 1.1 财务期间数据范围

- `src/Services/Organization/Nexora.Organization.Domain/Aggregates/Governance/WorkspaceRoleGrant.cs`：授权增加 `DateOnly? StartsOn`、`DateOnly? EndsOn`、`int RequiredApprovals`（1..2）、`int ApprovalCount`、`Guid? FirstApprovedBy`；`Approve` 对单审批直接激活，对双审批先记录首位批准人，同一位批准人二次批准抛 `GovernanceAccessException`。
- `src/Services/Organization/Nexora.Organization.Domain/Services/Governance/CustomRolePolicy.cs`：新增 `period` 范围；`finance.ledger.read`、`finance.journal.create`、`journal.post`、`journal.reverse` 支持 `company` 与 `period`。期间范围必须提供起止日期，起止合法且跨度不超过 60 个月；非期间范围拒绝日期。
- `src/Services/Organization/Nexora.Organization.Api/Grpc/OrganizationGrpcHandler.cs` 与 `Nexora.Organization.Contracts/Grpc/OrganizationGrpcContracts.cs`：`ScopedPermissionData` 增加 `StartsOn` / `EndsOn` 字符串字段，按 `yyyy-MM-dd` 传递。
- `src/Services/Finance/Nexora.Finance.Application/Authorization/Accounting/Books/BookAccess.cs`：`AllowsOn` / `DemandOn` 按日期判定期间范围；`MonthKeys` 返回期间覆盖的 `yyyyMM` 集合，供账簿首页、日记账列表、余额与期间查询过滤。
- `src/Services/Finance/Nexora.Finance.Application/UseCases/Accounting/Ledger/*`：起草、编辑、提交 / 过账 / 冲销、期间查询、账簿首页、日记账列表与试算平衡在加载资源后按业务日期调用 `DemandOn`；公司级读取仍调用 `Demand`。
- `src/Services/Organization/Nexora.Organization.Api/Grpc/OrganizationGrpcHandler.cs` 的期间权限只把日期放入 `ScopedPermission`，不进入公司级 `Permissions`，避免范围权限被放大为公司级权限。

### 1.2 审批人数策略与双人复核

- `src/Services/Organization/Nexora.Organization.Domain/Aggregates/Workspaces/WorkspacePreferences.cs`：新增 `RoleGrantApprovals`（默认 1，范围 1..2），随公司设置修订并持久化。
- `src/Services/Organization/Nexora.Organization.Domain/Aggregates/Workspaces/Workspace.CustomRoles.cs`：申请授权时读取策略传递 `RequiredApprovals`；审批时拒绝被授权人自批、申请人自批、已过期申请及旧授权版本；双审批只有第二位不同所有者批准后才激活，并撤销相同成员 / 角色 / 范围的旧有效授权。
- `src/Services/Organization/Nexora.Organization.Application/UseCases/Governance/CustomRoleUseCases.cs`：`RequestAsync` 从 `RoleGrantApprovals` 取审批人数；`DecideAsync` 校验 `organization.business-roles.manage` 后调用聚合。
- `src/Services/Organization/Nexora.Organization.Api/Endpoints/Governance/CustomRoleEndpoints.cs` 与请求模型：角色授权申请接收 `startsOn` / `endsOn`；公司设置接收 `roleGrantApprovals`。
- 既有职责分离保持：财务凭证 `Journal.Post` 校验制单人不能过账；采购 / 销售订单与财务应收应付单据均校验制单人不能批准；本切片补充自定义角色授权的申请人 / 被授权人隔离与双人复核。

### 1.3 前端

- `src/Web/nexora-web/app/utils/workspaceGovernance.ts`：授权类型增加期间日期、审批人数与审批进度；新增 `roleGrantScopeName`、`roleGrantApprovalName`，展示「2026-01-01 至 2026-12-31」「待审批（1/2）」等状态。
- `src/Web/nexora-web/app/components/WorkspaceScopedRoleGrants.vue`：新增「指定财务期间」范围与起止日期输入；期间缺失时禁止提交；列表显示期间名称与审批进度；双审批首次批准提示仍需 N 位所有者。
- `src/Web/nexora-web/app/components/WorkspaceCompanySettings.vue`：新增「自定义角色授权审批」选择（1 / 2 位所有者批准）并随公司设置保存。

### 1.4 数据迁移

- `src/Services/Organization/Nexora.Organization.Infrastructure/Persistence/Migrations/20261115062311_AddRoleGrantPeriodsAndApprovals.cs`：`workspace_role_grants` 增加 `StartsOn`、`EndsOn`、`RequiredApprovals`、`ApprovalCount`、`FirstApprovedBy`；`workspace_preferences` 增加 `RoleGrantApprovals`。`Down` 对应删除。

## 2. 环境与复现

命令从仓库根执行。

```powershell
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
dotnet ef migrations has-pending-model-changes --project src/Services/Organization/Nexora.Organization.Infrastructure --startup-project src/Services/Organization/Nexora.Organization.Api --context OrganizationDbContext --configuration Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
```

浏览器用例需要本地 AppHost，并由 AppHost 提供 Mailpit、PostgreSQL、RabbitMQ、Keycloak 与网关：

```powershell
aspire run --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/email-onboarding.spec.ts e2e/workspace.spec.ts --grep "Custom roles|Company presentation" --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

## 3. 验证结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 后端构建 | `dotnet build Nexora.slnx -c Release --no-restore` | 通过，0 警告 0 错误 |
| .NET 测试 | `dotnet test tests/Nexora.Tests -c Release --no-build` | 55 / 55 通过（含 `CustomRolePolicyTests` 4 项、`ScopedPermissionWireTests` 1 项，56 秒） |
| EF 模型一致性 | `dotnet ef migrations has-pending-model-changes ... --no-build` | `No changes have been made to the model since the last migration.`（退出码 0） |
| 类型检查 | `pnpm --dir src/Web/nexora-web typecheck` | 退出码 0（仅既存 vue-router / volar 插件路径提示） |
| 静态检查 | `pnpm --dir src/Web/nexora-web lint` | 0 错误，61 条既存 `vue/first-attribute-linebreak` 告警 |
| 前端单测 | `pnpm --dir src/Web/nexora-web test:unit` | 16 个文件 89 项通过（含 `governance.test.ts` 3 项） |
| 前端构建 | `pnpm --dir src/Web/nexora-web build` | 通过 |
| 聚焦 e2e：自定义角色 | `pnpm exec playwright test e2e/email-onboarding.spec.ts --grep "Custom roles"` | 1 / 1 通过；覆盖部门 / 仓库 / 财务期间范围、审批策略、越权拒绝、旧版本 409、跨工作区隔离 |
| 聚焦 e2e：公司设置 | `pnpm exec playwright test e2e/workspace.spec.ts --grep "Company presentation"` | 通过；实际选择「2 位所有者批准」并断言 `roleGrantApprovals = 2` |
| 全量 e2e | `pnpm --dir src/Web/nexora-web test:e2e` | 45 / 45 通过（16.5 分钟），含本项聚焦用例与全部既有套件 |

## 4. 验收断言

| 验收点 | 断言与证据 | 结果 |
| --- | --- | --- |
| 财务期间范围 | 员工获得 `2026-01-01..2026-12-31` 的 `finance.ledger.read` 后，查询 2026-01-01 期间返回 200；查询 2027-02-01（范围外）返回 403；`/access` 返回的 `scopedPermissions` 带 `startsOn` / `endsOn`。 | 通过（自定义角色 e2e） |
| 期间权限不放大 | Organization 的期间范围权限不进入公司级权限集合；Finance 的期间查询、账簿首页与日记账列表按 `MonthKeys` 过滤。 | 通过（代码路径 + e2e 期间访问） |
| 采购 / 销售部门范围 | 员工只能列出获准部门的采购单；其他部门与无部门历史单据详情返回 404；向未授权销售部门制单返回 403；获准部门制单 / 提交成功。 | 通过（自定义角色 e2e，沿用 P1 范围验收） |
| 库存仓库范围 | 仓库列表只返回获准仓库；其他仓库库存查询返回 404；创建仓库返回 403；撤销授权后下一次查询返回 404。 | 通过（自定义角色 e2e） |
| 审批人 ≠ 创建人 | 采购 / 销售订单、财务凭证、应收应付单据由领域校验制单人不能批准 / 过账；自定义角色授权由申请人或被授权人自批返回 403。 | 通过（领域测试 + e2e 自批 403） |
| 关键操作双人复核 | 公司设置审批人数为 2 后，新授权申请 `requiredApprovals = 2`；第一位所有者批准后仍为 `Pending` 且 `approvalCount = 1`；同一批准人再次批准返回 403；申请人批准返回 403。 | 通过（自定义角色 e2e + `CustomRolePolicyTests`） |
| 审批策略配置与生效 | 公司设置可选择 1 / 2 位所有者批准，值持久化并在下一次授权申请中生效。 | 通过（公司设置 e2e + 自定义角色 e2e） |
| 越权矩阵（允许 / 拒绝） | 允许：获准部门制单、获准仓库查询、期间内总账读取；拒绝：未授权部门写 / 读、未授权仓库读 / 写、期间外读取、自批、跨工作区仓库 404、旧角色版本申请 409。 | 通过（自定义角色 e2e） |
| 审批链可追溯 | 授权视图返回 `requestedBy`、`firstApprovedBy`、`approvedBy`、`requiredApprovals`、`approvalCount` 与状态；UI 展示审批进度。 | 通过（e2e 读取授权列表与 UI 状态） |

## 5. 边界与后续增强

- 本切片把「审批政策」限定为自定义角色授权的 1 / 2 位所有者批准；业务单据的审批人数 / 阈值目前沿用各模块既有制单人 ≠ 复核人规则，尚未提供可配置的通用审批流引擎。
- 财务期间按 `DateOnly` 的起止日校验，Finance 按业务日期判断；跨时区展示仍沿用公司时区设置。
- 财务期间范围仅覆盖总账读取、制单、过账、冲销与期间查询；科目、税、银行、报表等公司级权限仍在公司范围分配。其他业务模块的细分范围沿用 P1 既有结果。
- 角色授权目前由申请人发起、所有者审批；双审批需要至少两位非申请人所有者。若工作区只有一位所有者，无法完成双人复核，这是有意的最小权限设计。
- P1-07e 中与 F07 最小验收无关的敏感策略扩展、审计查询属 F38、跨节点缓存与机器身份等仍在后续波次跟踪。
- 未新增外部渠道依赖；本轮未执行生产发布验收。
