# Dashboard D5 报价与销售订单

2026-11-21。复用 `src/Web/nexora-dashboard` 原销售页面、报价与订单表格、制单抽屉、详情和转单弹窗。D5 的本次范围从报价或订单草稿到独立审批。[D5 接入清单](../ui-dashboard-api-integration-todolist.md#d5-销售到收款)

## 可操作流程

1. 在「销售与应收 → 报价单」新建报价，填写单号、业务日期，选择当前工作区客户及库存商品。可先保存草稿或提交报价，草稿也可在详情点「正式发出」。
2. 打开已发送的报价，点「转为销售订单」，填写订单号。新订单是草稿，报价详情可打开已有转单结果。
3. 在订单详情点「重新提交」进入审批。制单人可撤回，独立审批人可批准或填写原因退回。草稿取消也需要原因。

真实模式和 MSW 使用同一组请求。销售列表按报价或订单从服务端分页，单号、客户、状态及日期筛选作用于当前已读取的页。单价与数量按十进制字符串提交，金额按服务端合计展示。

## 接口与恢复

- 销售列表使用可选的 `isQuote` 查询参数，并返回未税合计。省略该参数仍读取混合列表。已转换报价详情返回可读取的关联订单号及 ID。
- 创建、编辑、发出、转单和审批通过同源 Nitro BFF。更新与状态转换使用读取到的 `ETag` 和版本。旧版本保存会保留输入，用户读取新版本后可再次保存。
- 丢失响应时保留原操作 ID、请求体和版本。用户先核对服务端状态，再明确重放原提交。切换账号、工作区或授权版本会清理打开的详情及表单。

## 本地验收

| 场景 | 验证结果 |
| --- | --- |
| 真实 AppHost | Alice 使用 D0 工作区的真实客户与库存商品创建并发出报价，转单后提交、撤回、重提，由 Bob 独立批准。两件、六位小数单价的报价显示服务端舍入后的未税金额 20.25 元。 |
| 状态、版本与授权 | 转单返回 `201` 和同源详情地址。重放同一请求返回原订单 ID。新操作使用旧版报价的 `If-Match` 时返回 `412`。审批人重新打开报价能回查已生成的订单。查询订单页只返回订单。其他工作区的同 ID 读取返回 `404`。 |
| MSW | 3 项 D5 浏览器用例覆盖报价转单及独立批准、草稿旧版本冲突后的输入保留，以及转单响应丢失后的同键、同版本、同正文重放。D4 原采购列表和审批回归通过。 |
| 工程检查 | Sales API 本地编译、6 项 Sales 相关 .NET 测试、Dashboard 类型检查、169 项前端单测、本次变更文件的 ESLint 检查和 live 模式生产构建通过。 |

## 本地复现

从仓库根目录运行。MSW 手动体验入口可使用 `/sales?tab=quotes&mockCase=d5-maker`。真实用例复用 D0 的开发登录凭据、专用工作区和主数据。[D0 联调基线](dashboard-d0-baseline.md)

```powershell
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard test:unit --maxWorkers 2
pnpm --dir src/Web/nexora-dashboard test:msw e2e/d5-sales.msw.spec.ts e2e/d4.msw.spec.ts --grep 'D5|原采购列表'
dotnet test tests/Nexora.Tests -c Release --no-restore --filter 'FullyQualifiedName~P4SalesTests'
$env:NUXT_PUBLIC_DATA_MODE = 'live'
try { pnpm --dir src/Web/nexora-dashboard build }
finally { Remove-Item Env:NUXT_PUBLIC_DATA_MODE }

$nexoraD5AppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraD5AppHost --non-interactive
try {
  aspire wait gateway --apphost $nexoraD5AppHost --timeout 180 --non-interactive
  $nexoraD5Dashboard = aspire describe dashboard --apphost $nexoraD5AppHost --format Json --non-interactive | ConvertFrom-Json
  $env:NODE_EXTRA_CA_CERTS = $nexoraD5Dashboard.resources[0].environment.NODE_EXTRA_CA_CERTS
  pnpm --dir src/Web/nexora-dashboard test:e2e e2e/d5-sales-ui.spec.ts
} finally {
  aspire stop --apphost $nexoraD5AppHost --non-interactive
}
```

本轮验收截至销售订单独立批准。后续履约许可、仓库发货、开票编号、收款和核销见 [D5 销售到收款](dashboard-d5-sales-to-cash.md)。
