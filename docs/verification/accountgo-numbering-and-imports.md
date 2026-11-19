# AccountGo 增量对齐 · 财年发票编号与外部凭证

本地验收日期为 2026-11-16。运行入口为 Aspire 网关，浏览器使用 Edge，财务服务加载 PostgreSQL 持久卷。

- **AG-02** 在「客户开票与应收」配置财年编号模板和单向提升的起始号。未填手工号的发票在独立审批和过账时占号。测试验证每财年从起始号分配，两个待审批发票确认同一预览号时只有一张成功，另一张重新确认新号才过账。旧手工编号的销售至总账链路也通过。
- **AG-03** 通过 `POST /ledger/journals/imported` 接收导入来源和源记录 ID，形成不可编辑的凭证草稿。凭证列表提供批量提交、过账与作废。测试验证幂等重放、不同操作键的来源去重、作废后继续去重、权限拒绝、带过时版本的批处理中途失败时整批回滚，以及获授权后的批量过账和精确重放。

增量迁移为 `20261116062811_FiscalInvoiceNumbering` 和 `20261116063139_ExternalJournalImports`。两项功能通过真实财务数据库持久化后读回验证。Release 构建与以下 Playwright 用例通过。

```powershell
dotnet build Nexora.slnx -c Release --no-restore
$accountGoAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $accountGoAppHost --non-interactive
aspire wait gateway --apphost $accountGoAppHost --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e --grep 'P4 sales, inventory.*\(accrual\)' --reporter=list --output=../../../artifacts/p1/runtime/accountgo-ag02-03-e2e-final
aspire stop --apphost $accountGoAppHost --non-interactive
```
