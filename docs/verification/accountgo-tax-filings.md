# AccountGo 增量对齐：纳税期间与申报

验证环境为本地 Aspire、PostgreSQL、Keycloak 和 Edge。验收日期为 2026-11-16。浏览器经 Nitro BFF、YARP 网关和财务服务访问数据库。前端入口为「账簿设置」中的「纳税期间与申报」。

## 验收范围

- 纳税期间默认按月，可在首次申报前改为自然季度。纳税期间独立于会计年度。首次申报后固定周期，以保留历史期间边界。
- 汇总按已过账单据确认。客户发票及供应商账单增加销项及进项，销售与供应商贷项扣减对应税额。供应商贷项按已过账进项冲减金额及原账单税项分配，可追溯到单据与凭证。财务页面提供来源明细 CSV。汇总范围为带税项的交易单据，收付实现制核销归 AG-01D。
- 初次申报保存当时的汇总、税项和来源单据。新增过账单据后，当前汇总标记差异。更正记录原因并追加版本，可按申报 ID 查看历史快照。过期汇总指纹返回 `409`，同一版本的两个并发更正只有一个成功，另一请求返回 `412`。同一成功请求用原幂等键重放时返回原快照。
- 有纳税权限的成员可记录申报。申报锁账同时要求全账簿的会计期间管理权限。锁账截至纳税期间的最后一天（含），也约束此前日期的凭证，已提交的旧凭证同样受限。下一会计期间打开后可继续过账，跨工作区读取申报返回 `404`。

## 复现命令

从仓库根目录执行，开发账户和基础资源准备方式见 [README](../../README.md)。

```powershell
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
dotnet ef migrations has-pending-model-changes --project src/Services/Finance/Nexora.Finance.Infrastructure --startup-project src/Services/Finance/Nexora.Finance.Api --context FinanceDbContext --configuration Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
pnpm --dir src/Web/nexora-web exec eslint app/components/finance/accounting/TaxFilingPanel.vue e2e/workspace.spec.ts
$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraAppHost --non-interactive
aspire wait gateway --apphost $nexoraAppHost --timeout 150 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e --grep 'Purchase orders require|P4 sales, inventory|Effective tax rates' --reporter=list --output=../../../artifacts/p1/runtime/tax-filings-e2e/playwright
aspire stop --apphost $nexoraAppHost --non-interactive
```

## 验证结果

- .NET Release 构建零警告、零错误，60 项测试通过。Nuxt 类型检查、生产构建和变更文件 ESLint 通过。类型检查仍输出既有的 `vue-router` Volar 插件解析提示，退出码为 `0`。
- EF Core 无待迁移模型变更。Aspire 启动日志确认现有财务 PostgreSQL 库已应用 `20261116053127_TaxPeriodsAndFilings`，重启后复用同一持久卷运行浏览器回归。
- Playwright 3 项通过。税率变更保留已计算快照。采购账单与贷项回归的净进项 `0.51 CNY` 与总账相符。销售回归中的原申报销项为 `130 CNY`，更正汇总进项 `7.80 CNY`、销项 `104 CNY`、净额 `96.20 CNY`。验证了并发提交、幂等重放、另一已初始化账簿的访问隔离、锁账后历史凭证拦截、下一期过账，以及页面读取原快照。
