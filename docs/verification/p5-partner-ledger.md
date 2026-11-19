# P5-02 往来台账本地验收

「财务概览与账龄 → 往来台账」支持选择客户或供应商和业务日期区间。列表按业务日期及过账序号排列，显示期初、变动、期末及逐笔余额，可查来源凭证。客户预收及贷项、应收供应商退款分别展示。翻页沿用同一过账水位，逐笔余额累计前页变动。

```powershell
pnpm --dir src/Web/nexora-web test:e2e --grep 'Purchase orders require|P4 sales, inventory.*accrual' --reporter=list
```

2026-11-17 在本地 Aspire、Keycloak OIDC / TOTP、PostgreSQL 和 Edge 上通过。销售路径验证发票、预收、核销、贷项、退款与历史水位。采购路径验证账单、付款、贷项关联、分期余额、翻页、水位与跨工作区拒绝。台账期末应收应付与相应账龄余额核对一致，销售工作台可打开原凭证。

同轮销售回归通过了现有财务 CSV 投递和下载。导出处理器对 PostgreSQL 异常配置了有界调度重试，容量拒绝计数接入 OpenTelemetry。重试故障注入、告警规则与独立财务投影待验收。
