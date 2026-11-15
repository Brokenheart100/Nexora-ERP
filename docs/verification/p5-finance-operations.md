# P5 财务报表、资金与库存验收

## 口径和执行边界

- Finance 从同一租户和账簿已过账的凭证读取四张报表。过账水位固定金额来源。权责利润表和资产负债表分别展示经营损益与结转状态，年结和重开凭证进入试算和资产负债表，损益期间报表排除结转和重开分录。
- 现金流量表以已登记资金账户及初始模板现金科目为范围，按净现金变动汇总。期初导入单列，内部转账相抵。已知业务来源和凭证上明确记录的活动用于分类，旧凭证缺少足够依据时单列待分类。活动划分参考 [IAS 7](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/)。
- 收付实现制利润表用于管理分析。销售按核销确认未税收入，未核销预收留在客户款项中，贷项抵用及退款调整净额。采购按已付净额列支，供应商退款减回相应已付净额。未税分摊按累计比例取整，最后一次核销承接舍入尾差。试算平衡表和资产负债表沿用权责账簿。
- 应收 / 应付账龄按截止日期和同一过账水位重算。无独立到期日的旧账单以单据日期作为到期日。仪表盘汇总现金、权责损益及应收应付。
- 财务 CSV 任务提交时保存报表快照、申请人和水位。Wolverine 持久队列负责生成文件，同一请求重放返回原任务，重建复用快照。读取或下载仍需通过当前账簿授权，文件只向原申请人开放。
- 银行对账同时核对资金流水和总账。独立复核以同一截止日重算，金额、差额、未达项和匹配证据一致且两项差额为零才完成。已完成的 PDF 和 JSON 以冻结快照为来源。跨期匹配从较晚的一侧生效，历史报告保持原样。调节通过现有资金收入、支出或冲销流程留凭证。
- 盘点由仓库收货人提交、独立管理者复核。差异按现有移动加权成本入库存与价差科目。零库存无法从该成本池取得成本时拒绝盘盈。仓间调拨分别在出库和签收事务中写入流水，未签收时显示数量与在途成本。Finance 消费两侧的成本序列标记。同一库存统驭科目下的调拨无需总账分录。
- 年结要求所有月份已经关闭且无待处理的已接收库存成本或财务单据。独立复核人提交结转。重开只针对最新年度，采用关联冲销凭证。
- 捐赠确认单编号稳定，过账时保存捐赠人与收款方名称，关联凭证和后续冲销。早于此实现的捐赠以原捐赠人标识追溯。确认单支持重复下载，属于普通收款凭证。法定公益捐赠票据仍需确认用票主体、申领渠道及开具和更正流程。[P0 业务政策](../domain/p0-policies.md) · [财政部公益事业捐赠票据使用管理办法](https://pjzx.mof.gov.cn/zhengceguiding/202401/t20240118_3926355.htm)
- 账号预检以当前登录主体查询工作区所有者、最后管理员及有效个人关联，展示保留审查提示。凭据和设备入口使用 Keycloak Account Console。BFF 会话的主动撤销传播另行验收。[Keycloak Account Console](https://www.keycloak.org/docs/latest/server_admin/)
- 运营公告由 Organization 的 `Announcements` 配置提供。条目含 `Id`、`Title`、`Message`、`StartsAtUtc`、`EndsAtUtc`，可限定 `Workspaces` 和 `RequiredPermission`。工作区能力显示 SMTP 配置状态，区分本机测试、平台渠道、工作区自定义发件与法定票据能力。配置状态不代表外部邮件投递成功。

## 复现

从仓库根目录运行。用现有开发数据卷和本地 Keycloak OIDC / TOTP。Finance 自动应用 `FinancialClosingControls`、`DurableReportExports`，Inventory 自动应用 `InventoryStockOperations` 与 `InventoryTransferTransit`。

```powershell
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build

dotnet ef migrations has-pending-model-changes --project src/Services/Finance/Nexora.Finance.Infrastructure --startup-project src/Services/Finance/Nexora.Finance.Api --context FinanceDbContext --configuration Release --no-build
dotnet ef migrations has-pending-model-changes --project src/Services/Inventory/Nexora.Inventory.Infrastructure --startup-project src/Services/Inventory/Nexora.Inventory.Api --context InventoryDbContext --configuration Release --no-build
```

按 [P4 本机 SMTP 捕获器配置](p4-sales-to-ledger.md) 启动测试通道后执行以下命令。SMTP 捕获器监听回环地址，收件地址采用保留域名。

```powershell
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait bff --apphost $appHost --timeout 180 --non-interactive
$env:NEXORA_TEST_P4_SMTP_SINK = 'http://127.0.0.1:8026'
pnpm --dir src/Web/nexora-web test:e2e
aspire stop --apphost $appHost --non-interactive
```

## 本地验收记录

2026-11-08，Release 后端构建、Nuxt 类型检查和生产构建通过，31 项 .NET 测试通过。Finance 和 Inventory 的 EF Core 模型与最后迁移一致，已有开发库启动后可以访问新增表和流程。

- 年度样例手工投资净流出 25，现金期末余额 1,015，投资活动可钻取到原凭证。月度全部关闭后年结转入权益 40，利润表净利润仍为 40。年度重开通过关联冲销恢复未结转利润。
- 销售样例 1,130 含税应收部分核销 500 后确认收付未税收入 442.48，账龄显示未结 630。后续核销和退款后，现金净增 904，收付未税销售收入为 800。旧过账水位仍显示未结 630。导出原任务与重建任务生成相同 CSV，其他成员下载被拒绝。
- 采购样例期末应付 4.54。已付采购未税净额减回供应商退款后为 3.27。盘点核减 0.25 件和 0.59 成本，库存统驭科目为 9.44。调拨出库后源仓 7.08、在途 2.36，签收后目标仓 2.36。制单人不能自审，非目标仓收货人不能签收，重复签收意图复用原结果。
- 银行对账截止日账面 904、银行结单 905、银行未达 1，调整后两项差额均为零。差额不为零时拒绝完成。完成后拒绝补录旧期资金分录，次月收款可与旧未达行匹配，历史冻结报告及撤销记录保留原金额。PDF 通过下载检查。
- 捐赠样例过账 200 后生成同编号的普通确认单和 PDF，冲销后沿原编号展示更正关联。发布公告测试覆盖目标工作区、所需权限与到期时间。账号预检覆盖治理阻断、个人关联和跨账号隔离，真实浏览器打开 Keycloak 管理入口。
- 销售回归使用本机 SMTP 捕获实际附件，覆盖明确失败、重试、结果未知及关联重发。本机通道和平台配置状态分别验证，外部邮件渠道未验收。

Playwright 整套运行 10 项，9 项通过，投资现金流样例因测试沿用了已归档科目失败。将样例换成独立设备科目和有效银行科目后，同一应用版本的单项复测通过。整套与复测报告分别保存在本地 `artifacts/p4/runtime/p5-full-regression.json` 和 `artifacts/p4/runtime/p5-targeted-regression.json`。

```powershell
pnpm --dir src/Web/nexora-web test:e2e --grep 'P5 accrual reports'
```

## 仍待验收

- Reporting 独立财务投影、全量事实重建和容量验证。当前 CSV 重建来源是已冻结的 Finance 报表快照。
- 当前库存盘点以单个仓库和商品为操作单位。年结检查已接收的 Finance 成本事实。端到端备份、恢复与跨服务在途事实核对属于 P6 恢复演练。
- 法定捐赠票据资格和接口、收据邮件重发，订阅和配额的全入口门禁、计费门户与验签回调，BFF 刷新和跨设备主动撤销，CLI、AI 会话和财务 MCP，外部渠道及 F01–F42 的最终验收。
