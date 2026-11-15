# W4 LNK 关联分录与完整性扫描验收记录

## 范围

W4 参考项目增量首项 LNK：Finance 服务新增凭证关联（相关 / 调整 / 结算）、创建 / 解除 / 查询 / 完整性扫描端点，前端总账「关联分录与完整性扫描」入口，以及领域单测与端到端用例。关联仅限同一工作区内两张已过账凭证；解除为物理删除但保留变更审计。

## 实现摘要

- 领域：`src/Services/Finance/Nexora.Finance.Domain/Aggregates/Accounting/JournalLink.cs` 新增 `JournalLink` 与 `JournalLinkKinds`（related / adjustment / settlement）。创建时校验凭证不同、类型合法、备注不超过 300 字。
- 应用：`src/Services/Finance/Nexora.Finance.Application/UseCases/Accounting/Ledger/LedgerUseCases.Links.cs` 提供查询、创建、解除与扫描；创建要求 `finance.journal.create`，查询与扫描要求 `finance.ledger.read`；创建 / 解除经 `FinanceMutation` 幂等回放并写入审计动作 `journal.link.created` / `journal.link.deleted`。
- 完整性扫描异常码：`link.from_missing`、`link.from_not_posted`、`link.to_missing`、`link.to_not_posted`、`link.duplicate_pair`、`journal.reversal_missing_original`。
- 基础设施：`LedgerStore` 关联查询（连接凭证投影来源 / 目标编号与日期，按创建时间倒序分页 50）；`journal_links` 表与唯一索引 `(TenantId, WorkspaceId, FromJournalId, ToJournalId, Kind)`；迁移 `20261114041658_AddJournalLinks`。
- API（`src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/LedgerEndpoints.cs`）：`GET /api/finance/workspaces/{id}/ledger/links`、`GET .../links/scan`、`POST .../links`、`POST .../links/{linkId}/delete`。
- 前端：`src/Web/nexora-web/app/components/WorkspaceLedger.vue` 新增「关联分录与完整性扫描」卡片，可选择已过账凭证、关联类型与说明，列出关联、解除关联并展示扫描异常清单。
- 测试：`tests/Nexora.Tests/JournalLinkTests.cs` 2 项领域测试；`src/Web/nexora-web/e2e/workspace.spec.ts` 新增用例 `Journal links connect posted entries, scan integrity and isolate workspaces`。

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
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g "Journal links" --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

注意：`pnpm test:e2e -- --grep ...` 会把 `--` 传给 Playwright 退化为全量运行；聚焦必须使用上面的 `exec playwright test` 形式。修改 `app/` 源码后需重启 AppHost，Nuxt 开发服务器不会热更新应用源码。

## 验收断言

| 断言 | 结果 |
| --- | --- |
| 两张已过账凭证建立调整关联成功，列表返回来源 / 目标编号、类型与说明 | 通过（e2e 列表 1 条且字段匹配） |
| 重复关联返回 409 | 通过 |
| 关联未过账凭证返回 409；自链返回 409；未知关联类型返回 400 | 通过 |
| 完整性扫描返回关联数、凭证数与异常清单；正常数据无异常 | 通过（linkCount=1、journalCount=3、issues=[]） |
| 前端建立关联提示、列表展示、扫描无异常、解除后回到空态 | 通过 |
| 跨工作区隔离：其他工作区关联列表为空；非成员创建关联返回 404 | 通过 |
| 领域单测覆盖自链、未知类型、备注长度与字段快照 | 通过（2/2） |
| `dotnet test` 全量 | 通过（36/36） |
| 前端 typecheck / lint / 单测 / 构建 | 通过（单测 9 文件 47 项） |
| 全量 workspace e2e 回归 | 通过（25 passed） |

## 边界与后续增强

- 关联对象仅限同工作区的手工总账凭证；采购 / 销售 / 发票等业务单据的自动分录关联未纳入，待业务单据与总账补记链路（RDY）落地后扩展。
- 关联与解除不进入审批流；解除保留 `journal.link.deleted` 审计但物理删除行，历史查询需结合 F38 审计口径。
- 扫描按工作区全量加载后判定，当前数据规模可接受；后续可改为 SQL 投影并分页，同时把异常报告接入 RCD 记录变更链。
- 前端关联选择器只列出当前分页内的已过账凭证；凭证量增大后需要按编号 / 日期检索的选择器。
