# P6-05 期初子账批量导入与总账对账

在「账簿设置 → 会计期间、期初与凭证 → 期初子账批量导入」上传或粘贴 UTF-8 CSV，选择期初权益对方科目。每个账簿可过账一个批次，每批最多 100 行，页面上传文件上限为 256 KiB。

```csv
Kind,Reference,ResourceId,WarehouseId,Quantity,Amount,DueOn
stock,INV-001,<商品 UUID>,<仓库 UUID>,10,120,
receivable,AR-001,<客户 UUID>,,,75,2025-12-15
payable,AP-001,<供应商 UUID>,,,40,2025-12-28
bank,BANK-001,<资金账户 UUID>,,,200,
```

- `Reference` 填原始单号或来源编号。应收应付逐笔填写原到期日，可早于切账日。银行账户和库存现金均使用 `bank` 类型。
- `Amount` 以账簿本位币填写。库存填写总成本，允许零成本数量入库。未结应收、应付和银行现金使用正数余额。
- 开启首个会计期间后，可先完成普通总账期初。批量导入须在日常业务过账前完成，期初库存不得覆盖已有库存流水，资金账户不得已有资金流水。
- 提交时核对预览文件摘要与科目表版本。另一名具备过账权限的成员复核。含库存的批次等待 Inventory 持久化入库回执，Finance 再提交未结款、资金流水与总账凭证。界面按来源编号显示导入额、子账入账额与总账额，可打开对应凭证。

## 2026-11-17 本地验收

```powershell
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
dotnet ef migrations has-pending-model-changes --project src/Services/Finance/Nexora.Finance.Infrastructure --startup-project src/Services/Finance/Nexora.Finance.Api --context FinanceDbContext --configuration Release --no-build
dotnet ef migrations has-pending-model-changes --project src/Services/Inventory/Nexora.Inventory.Infrastructure --startup-project src/Services/Inventory/Nexora.Inventory.Api --context InventoryDbContext --configuration Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
pnpm --dir src/Web/nexora-web test:unit

$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraAppHost --non-interactive
aspire wait gateway --apphost $nexoraAppHost --timeout 120 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e --grep 'P6 opening subledger' --reporter=list
pnpm --dir src/Web/nexora-web test:e2e --grep 'Opening, journal approval|Purchase orders require' --reporter=list
pnpm --dir src/Web/nexora-web test:e2e --grep 'P4 sales.*accrual' --reporter=list
aspire stop --apphost $nexoraAppHost --non-interactive
```

Release 构建通过，62 项 .NET 测试和 90 项前端单元测试通过。前端类型检查与构建通过。Finance 在既有的本地 PostgreSQL 卷上应用迁移 `20261117055707_OpeningSubledgerCutover`，已核对迁移历史。Finance 与 Inventory 的 EF 模型均无待迁移变更。运行中的 Finance OpenAPI 声明了预览、创建、详情和复核的响应，包括 `201` 和 `412`。

本地 Aspire、Keycloak OIDC 与 TOTP、RabbitMQ、PostgreSQL 和 Edge 环境下，1 项 Playwright 通过。通过界面预览、提交和独立复核，7 行期初数据全部对账一致，生成 6 张凭证。零成本库存保留数量流水。覆盖了重复行、引用错误工作区资源、自审、重复批次、相同请求重放和过期 `If-Match`。

过账后核对库存 120、应收 100、应付 40、银行 200、现金 30 元，以及总账借贷平衡。逾期应收仍按原到期日进入账龄。供应商付款 15 元并核销客户收款 25 元后，应付、应收、银行余额分别为 25、75、210 元。现金流将期初资金单列，旧账收付不会形成当期收入和费用。盘点使库存成本从 120 元变为 108 元，期初批次的历史对账结果保持一致。

原有总账期初与凭证审批、采购订单审批和收货、权责发生制下的销售履约与结算三项浏览器回归通过。销售场景在连续运行时遇到一次本地 TOTP 验证失败，单独重跑通过。

生产迁移与镜像回退仍待演练，见 [P6-05 运维演练](p6-05-operations-drill.md)。
