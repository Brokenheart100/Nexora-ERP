# P5 权责发生制财务报表验收

## 取数口径

- 在企业或个人工作区选择「打开财务报表」。Finance 以当前成员的总账读权限校验工作区和租户，只汇总已过账凭证。查询直接读取 Finance 账簿。
- 试算平衡表的期初是开始日前余额，本期借方与贷方分别汇总所选日期，期末采用借方为正的余额。利润表仅统计本期收入及费用。资产负债表取截止日累计余额，尚未结转的损益汇入独立的权益行。
- 上期为紧邻本期、天数相同的日期区间。上期若超出账簿启用日期，页面省略上期与变动列。两期查询和后续钻取共用同一过账水位。试算平衡表与资产负债表的钻取覆盖账簿启用日至相应截止日，利润表的钻取限定本期或上期。
- 报表使用现行科目名称，凭证详情保留原过账快照。CSV 和打印使用页面已加载的结果，前端金额沿用十进制字符串。打印样式只保留当前报表。CSV 的用户可控文字列会转义公式前缀。

## 复现

从仓库根目录运行，使用现有本地开发身份及已登记的 TOTP。

```powershell
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait bff --apphost $appHost --timeout 150 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e --grep 'P5 accrual reports'
aspire stop --apphost $appHost --non-interactive
dotnet test tests/Nexora.Tests -c Release --no-build
```

Finance 查询地址为 `GET /api/finance/workspaces/{workspaceId}/reports/{kind}`。浏览器经 BFF 时加 `/bff` 前缀。报表类型为 `trial-balance`、`profit-and-loss`、`balance-sheet`。查询参数 `from`、`through` 为含首尾的日期范围，`compare=true` 打开上期对比。可传入已返回的 `watermark` 复用过账水位。钻取使用 `GET …/reports/{kind}/rows/{row}`，传入对应期间和水位，`row` 为科目 ID 或资产负债表的 `earnings` 行。

## 对账样例

期初现金 1,000 元，随后确认收入 150 元，再全额冲销。选择 1 月 16 日至 25 日，上期为 1 月 6 日至 15 日。

| 指标 | 本期（CNY） | 上期（CNY） | 变动（CNY） |
| --- | ---: | ---: | ---: |
| 试算平衡表现金期末余额 | 1,000 | 1,150 | -150 |
| 利润表净利润 | -150 | 150 | -300 |
| 资产负债表资产合计 | 1,000 | 1,150 | -150 |
| 资产负债表未结转损益 | 0 | 150 | -150 |
| 资产负债表平衡差 | 0 | 0 | 0 |

## 本地结果

2026-11-08，基于实际 Keycloak OIDC / TOTP、BFF 和 Finance PostgreSQL 运行 `P5 accrual reports` 用例，复测通过。用例覆盖期初、销售入账、期间关账竞争及冲销，核对三张报表、上一等长期间、固定水位、科目及未结转损益钻取。它也验证跨工作区请求被拒绝、CSV 实际下载的内容与页面一致，以及浏览器打印媒体样式只显示当前报表。

锁定依赖还原、.NET Release 构建、31 个 .NET 测试、Nuxt 类型检查和生产构建均通过。Finance EF 模型与现有迁移一致。浏览器验收结束后正常停止本次启动的 AppHost。

现金流量表与管理用收付实现制利润表的后续验收见 [P5 财务报表、资金与库存验收](p5-finance-operations.md)。
