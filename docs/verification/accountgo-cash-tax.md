# AccountGo 增量对齐 · AG-01D 收付实现制税额确认

财务入口为「账簿设置 → 纳税期间与申报」。纳税口径在首次申报前配置，既有账簿默认沿用权责发生制。申报快照记录所用口径，既有快照仍可读取。纳税口径独立于会计凭证与现有财务报表的展示口径。

## 确认规则

- 销项在客户款项与发票核销时确认。未核销预收的收款和退回均不计税。已实现部分的贷项退款或抵用冲回对应税项，贷项抵减未收余额时调整原单的待确认税额。
- 进项在供应商账单实际付款时确认。供应商贷项抵减未付余额时调整原账单的剩余计税基础，收回已付款项时冲回税额。付款与退款冲销按冲销日期产生反向确认。
- 税项取自原发票、账单和贷项的已过账快照，按币种精度计算累计分摊差额，结清时保留原税项合计。来源明细同时记录触发确认的凭证与原税务单据。
- 按财务凭证的业务日期归入纳税期间。计算读取截至期末的过账历史与账簿水位，跨期款项归入实际核销或退款期间，申报快照保留当时结果。

## 复现命令

从仓库根目录执行。环境准备见 [README](../../README.md)。

```powershell
dotnet build Nexora.slnx -c Release --no-restore
dotnet ef migrations has-pending-model-changes --project src/Services/Finance/Nexora.Finance.Infrastructure --startup-project src/Services/Finance/Nexora.Finance.Api --context FinanceDbContext --configuration Release --no-build
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
pnpm --dir src/Web/nexora-web exec eslint app/components/finance/accounting/TaxFilingPanel.vue e2e/workspace.spec.ts
$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraAppHost --non-interactive
aspire wait gateway --apphost $nexoraAppHost --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e --grep 'Purchase orders require|P4 sales, inventory' --reporter=list --output=../../../artifacts/p1/runtime/cash-tax-e2e
aspire stop --apphost $nexoraAppHost --non-interactive
```

## 验证结果

2026-11-16，在本地 Aspire、PostgreSQL、Keycloak 和 Edge 验收。

- Release 构建零警告、零错误，62 项 .NET 测试通过，其中两项覆盖混合税项贷项调整和累计舍入。Nuxt 类型检查、生产构建和变更文件 ESLint 通过，类型检查仍有既有的 `vue-router` Volar 提示。
- 既有财务数据库已应用 `20261116061052_CashTaxRecognition`，EF Core 无待迁移模型变更。
- Playwright 3 项通过，覆盖采购以及销售权责、收付两种口径。采购用例部分付款确认进项 `0.23 CNY`，结清并退款后进项为 `0.42 CNY`，退款对应进项冲回 `0.09 CNY`。
- 销售用例在预收与发票核销前销项为 `0 CNY`，核销 `500 CNY` 后为 `57.52 CNY`，贷项退款后第一季度销项合计为 `104 CNY`。第一季度账单在第二季度部分支付时确认进项 `3.45 CNY`，结清后为 `7.80 CNY`，冲销首笔付款后为 `4.35 CNY`。
- 两种口径均验证首次申报后固定口径、读取历史快照、并发更正、幂等重放、锁账和跨工作区隔离。第二季度付款及冲销后，第一季度的申报及汇总保持一致。
