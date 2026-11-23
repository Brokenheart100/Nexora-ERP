# Dashboard D5 销售到收款

2026-11-21。复用 `src/Web/nexora-dashboard` 原销售页、仓库任务、应收工作台及单据抽屉。报价、转单与独立批准见 [D5 报价与订单验收](dashboard-d5-sales-orders.md)。

## 页面操作

1. 在「销售与应收 → 销售订单」打开已批准单据，点「发起履约」，选择发货仓库并填写各行许可数量。销售详情显示预留状态、数量及到期时间。取消许可或关闭履约时填写原因，等待仓库确认后再使用释放的数量。
2. 用该仓库的执行人进入「库存管理 → 盘点与调拨 → 待执行收发货许可」，在出库许可行点「执行」，填写实际业务日期和本批数量。分批发货可继续使用同一许可。销售订单的发货数量、库存流水及财务发货回执从各服务读取。
3. 在「销售与应收 → 应收 → 发货计价与可开票来源」找到已回执的行，点「开票」，选择同一客户的发货行和数量，点「提交发票复核」。制单人可在独立复核前编辑库存发票。发票详情会标明库存出库或服务项目。
4. 独立复核人打开待复核发票。启用自动编号的发票先点「预览发票编号」，核对候选号后点「复核通过并过账」。候选号被占用后，页面会回读新号码供再次确认。
5. 打开已过账的发票，点「登记收款」，填写收款单号、日期、资金账户和金额，提交给独立复核人过账。收款过账后可查看凭证、资金流水和可核销余额。
6. 在发票详情点「核销」，选择该客户已过账的可用款项，填写核销单号、核销日期及金额。独立复核和过账后，重新打开原发票与收款单核对余额。在「财务 → 账龄与税务 → 应收账龄」可按真实发票编号返回详情。

应收写入需要配置应收科目映射。开票使用业务日期上有效的税组及税率，过账日期对应会计期间须开放。仓库执行权与独立财务复核权分别由所属服务核对。[D3 交易前置配置](dashboard-d3-original-ui.md)

## 接口与状态

- 销售从 `202 Location` 回读许可，仓库执行使用许可自己的修订号。处于预留和取消同步中的许可继续占用额度，终态后按实际发货量保留占用。许可取消兼容 PostgreSQL 到期时间微秒精度及先前保存的高精度库存快照。
- 应收按服务端回读的可开票数量选择库存发货行。财务服务分别管理发票、收款和核销的状态与版本，过账后回读服务端余额。用户可通过 `/sales?tab=receivables&workspace=<工作区 ID>&invoice=<发票 ID>` 或 `receipt=<收款 ID>` 重开对应详情。
- 提交结果未知时，原表单保留操作 ID、请求正文和并发条件。用户先读回服务端数据，再明确按原请求重放。

## 真实 AppHost 验收

| 场景 | 实际结果 |
| --- | --- |
| 预留、部分发货与取消 | 对 103 件的订单签发 101 件。仓库按同一许可的修订号先后发出 40 和 60 件，两笔流水合计出库成本 600 元。取消余下 1 件后重新签发并发货，随后关闭仍未签发的 2 件。重新签发的 1 件用于编号并发用例。 |
| 开票来源与版本 | 主发票匹配 40 件和 59 件，复核前将第二笔修订为 60 件。已占用数量的再次开票请求返回 `409`。服务项目发票由财务的定期开票接口生成，原详情标明「服务项目」。 |
| 编号竞争 | 独立复核人预览候选号。另一张发票先过账占号，原确认返回 `409` 与 `finance.invoice_number_changed`。页面回读新候选号，再次明确确认后过账，主发票价税合计 1,130.00 元。 |
| 收款与核销 | 收款 500.00 元独立过账后，可核销余额为 500.00 元。两笔核销同时占用同一收款时，一笔过账，另一笔返回 `409`。收款余额归零，发票详情和财务账龄均显示未结 630.00 元，核对到一笔 500.00 元资金流水和对应收款凭证。 |
| 数据门禁 | 跨客户核销返回 `409`，发票余额保持 630.00 元。未开放期间的收款复核也返回 `409`，收款保留待复核状态且没有凭证。 |

用例结束后恢复联调账簿原有编号配置。测试数据留在专用工作区供回查。

## MSW 与工程检查

| 检查 | 结果 |
| --- | --- |
| 真实入口 | 两项 Playwright D5 用例通过，覆盖从报价转单到收款核销。 |
| MSW | 四项 D5 用例和五项 D4 采购回归通过。D5 模拟仓库已发货而财务回执延迟，页面显示等待成本回执并暂停该行开票。回执就绪后继续开票与核销。 |
| 本地构建与测试 | Dashboard 类型检查、变更范围 ESLint、169 项前端单测、live 模式生产构建和 6 项 `.NET` 销售相关测试通过。 |

真实模式、原型模式和 MSW 使用各自的 Vite 预构建缓存。测试使用本次启动的 AppHost，验收后正常停止。

## 本地复现

从仓库根目录运行。真实用例复用 D0 的专用工作区、开发身份、仓库执行人、资金账户和税组，并生成带独立编号的销售及财务测试单据。MSW 的手动入口为 `/sales?tab=receivables&mockCase=d5-maker`。[D0 联调基线](dashboard-d0-baseline.md)

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard test:unit --maxWorkers 2
pnpm --dir $nexoraDashboard test:msw e2e/d5-fulfillment.msw.spec.ts e2e/d5-sales.msw.spec.ts e2e/d4.msw.spec.ts
dotnet test tests/Nexora.Tests -c Release --no-restore --filter 'FullyQualifiedName~P4SalesTests'

$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraAppHost --non-interactive
try {
  aspire wait gateway --apphost $nexoraAppHost --timeout 180 --non-interactive
  $dashboardResource = aspire describe dashboard --apphost $nexoraAppHost --format Json --non-interactive | ConvertFrom-Json
  $env:NODE_EXTRA_CA_CERTS = $dashboardResource.resources[0].environment.NODE_EXTRA_CA_CERTS
  pnpm --dir $nexoraDashboard test:e2e e2e/d5-fulfillment-ui.spec.ts e2e/d5-sales-ui.spec.ts
} finally {
  aspire stop --apphost $nexoraAppHost --non-interactive
}

$env:NUXT_PUBLIC_DATA_MODE = 'live'
try { pnpm --dir $nexoraDashboard build }
finally { Remove-Item Env:NUXT_PUBLIC_DATA_MODE }
```

定期开票配置、对外发送与发票公共入口按 [D9 接入清单](../ui-dashboard-api-integration-todolist.md#d9-定期开票编号与交付) 验收。
