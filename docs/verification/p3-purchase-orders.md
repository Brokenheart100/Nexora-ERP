# P3-01a 采购订单与独立审批

2026-11-07 在现有 Aspire 数据卷通过本地浏览器验收。采购库初始化和 Organization 增量迁移均已应用。

## 使用入口

1. 在企业工作区初始化账簿，并建立启用的供应商、商品分类、计量单位和跟踪库存的商品。
2. 在「成员与访问权限」配置采购角色。一位工作区所有者提出授权，另一位批准。采购制单角色只读本人订单，审批角色可以复核该工作区的订单。制单人与审批人按 OIDC 的签发方和主体标识区分。
3. 在「采购订单」保存草稿、编辑和提交审批。制单人可撤回待审批订单或撤销草稿。审批人可退回并记录原因，或批准当前提交版本。

订单使用账簿本位币。首个切片处理库存商品采购，按币种精度对各行未税金额舍入。订单保存供应商、商品、分类与计量单位版本。提交和审批重新检查引用，引用变化后可退回、编辑并重新提交。

## 本地运行

Purchasing 通过 BFF 使用现有登录与防伪令牌，使用同一 PostgreSQL 实例内的独立 `purchasingdb` 和凭据。Organization 增量迁移保留已有财务角色与审批数据。现有开发数据卷首次启动 P3 时，运行以下命令创建采购库账号和所有权。

```powershell
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
pwsh scripts/p2/Initialize-DevelopmentDatabase.ps1 -Database purchasingdb
aspire wait bff --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 120 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e --grep "Purchase orders require"
```

订单写入、操作审计和幂等回执使用同一 Wolverine EF 事务。同一操作者的并发重试按操作号串行，订单变更按订单行锁及版本校验。审批后的供应商、商品及价格快照保留供后续收货许可引用。

Playwright 使用两个真实 OIDC/TOTP 会话验证采购草稿、提交、退回及审批。用例覆盖未初始化账簿、无效供应商类型、非库存商品、跨工作区引用、采购员只能读取本人订单、相同操作号并发重试、审批时引用变更，以及制单人换成审批角色后仍不能自批。样例数量 3.125 × 未税单价 2.12，按 CNY 舍入为 6.63。

锁定依赖还原、.NET Release 构建、22 项后端测试、9 项 Playwright 浏览器回归、Nuxt 类型检查与生产构建均通过。Purchasing 和 Organization 均无待生成的 EF 迁移。

仓库范围、收货许可、部分执行和取消终态栅栏见 [P3 端到端验收](p3-purchase-to-ledger.md)。采购权限目前以工作区与制单人划分，部门范围随对应授权模型推进。
