# P3 采购、库存与资金端到端验收

## 本地入口

- 在企业工作区初始化账簿，配置采购制单、采购审批、财务制单和财务复核角色。工作区所有者通过「仓库、收货与库存」建立仓库并指定收货成员。
- 在「采购订单」批准具体订单版本，再按订单行与仓库签发许可。在库存工作台确认实际到货。需要取消余量时，采购端等待库存终态回执后再释放额度。收货许可全部执行或取消后可关单。
- 在「账簿设置 → 采购应付、银行与捐赠」配置库存、暂估应付、应付账款、示例进项税、采购价差、捐赠收入与应收供应商退款科目。资金账户各自绑定专用资产统驭科目。财务复核人先开放业务月份。
- 收货事实由 Inventory 经 RabbitMQ 交给 Finance。期间未开放、缺少映射或成本序列有缺口时，保留待过账事实及原因。满足条件后，复核人从工作台重试。账单可匹配同一供应商的多个已计价收货事实，并逐行保留数量、未税金额、税额、价差和来源。
- 采购审批人从原收货授权退货，仓库收货人独立确认。未开票部分冲回暂估。已开票部分使用供应商贷项冲减未结应付。已支付部分登记为应收供应商退款，实际到账后核销。
- 对账单采用 UTF-8 CSV，映射流水标识、日期、带符号金额和摘要。预览绑定文件摘要、目标账户、操作者和解析结果。提交生成待审核行。审核可部分匹配已过账流水，或经财务制单与复核登记收付款、费用、其他收入或捐赠。

## 复现

从仓库根目录启动 AppHost。既有开发卷首次增加库存库时，在启动后执行以下初始化命令。

```powershell
pwsh scripts/p2/Initialize-DevelopmentDatabase.ps1 -Database inventorydb
aspire wait bff --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 150 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e --grep 'Purchase orders require'
```

使用本地开发栈执行消息恢复场景。测试会短暂停止并恢复该 AppHost 的 RabbitMQ，在断连期间确认实收，再核对后续回执、库存与暂估。

```powershell
$env:NEXORA_TEST_P3_RECOVERY = 'broker'
try {
    pnpm --dir src/Web/nexora-web test:e2e --grep 'Purchase orders require'
} finally {
    Remove-Item Env:NEXORA_TEST_P3_RECOVERY
}
```

采购收货流程状态与采购额度由 Purchasing 持有。Inventory 保留终态栅栏、库存流水与成本池序列，Finance 用已计价事实与独立复核结果过账。三者使用各自的 PostgreSQL 库和 RabbitMQ 服务凭据。RabbitMQ 开发配置由 Aspire 注入容器文件，沿用现有持久卷。[Wolverine Saga 存储](https://wolverinefx.net/guide/durability/efcore/sagas.html) · [Aspire 容器文件](https://aspire.dev/app-host/container-files/)

账单差异需要显式复核。确认价差后按原收货可归属的现存数量调整成本池，未归入在库成本的差额保留在价差科目。阶段验收使用配置的 CNY 样例，正式税务票据、报表及期末银行调节继续按后续阶段验收。[P0 业务样例](../domain/p0-policies.md)

## 验收结果

2026-11-08 在既有 Aspire 开发数据卷通过专项 Playwright 验收。RabbitMQ 断连期间的实收在恢复后收到采购回执及财务成本事实。重复提交仅保留一笔实收。也验证了并发签发、部分实收、取消余量、关单、价差回写、未开票退货、供应商贷项、已付款退货及退款核销。

专项验证另用 `NEXORA_TEST_P3_RECOVERY=consumer` 停启 Finance 消费者，验证已在 RabbitMQ 排队的成本事实恢复投递。领域测试单独覆盖重复和乱序回执、先取消后到达的许可，以及只将现存份额分入库存的价差计算。

一张账单匹配两笔收货后，库存子账和库存统驭科目均为 CNY 10.03，账单未结额和应付统驭科目均为 CNY 4.54，银行账户和银行统驭科目均为 CNY 1,496.31。试算借贷相等，供应商退款核销后余额为零。CSV 重复导入新增零行，匹配超额被拒绝，关联作废及捐赠凭证保留原来源。

账单可匹配多个收货事实。退货贷项关联一张原账单，涉及多张账单的退货按账单拆分授权。

锁定依赖还原、.NET Release 构建、25 项后端测试、9 项全量 Playwright 回归、Nuxt 类型检查及生产构建均通过。Purchasing、Inventory 和 Finance 的 EF 模型均无待生成迁移。另有两次专项浏览器验收，分别覆盖 RabbitMQ 断连和 Finance 消费者停启。
