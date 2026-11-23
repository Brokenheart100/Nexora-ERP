# Dashboard D11 报表、账龄、导出与工作台

2026-11-22。新版 Dashboard 通过同源 Nitro BFF 读取 Finance 和 Reporting；浏览器只使用当前身份与工作区的接口结果。

## 页面入口

| 操作 | Dashboard 入口 |
| --- | --- |
| 试算平衡表、利润表、资产负债表、现金流量表、权益变动表 | 财务 → 报表或报表中心。选择日期区间和适用口径，可查询上期与变动，查看过账明细和凭证。权益变动表在服务提供时显示合伙权益 |
| PDF 预览与 CSV | 在屏幕报表中预览或下载 PDF，在「报表导出」生成 CSV、查看任务或按原快照重建 |
| 应收、应付账龄与往来明细账 | 财务 → 账龄与税务。选择截止日期，在未结单据中打开客户或供应商明细账，按期查看期初、增减及期末 |
| 经营工作台 | 工作台或财务工作台看 Finance 概览。工作台和报表中心看 Reporting 投影；工作台提供审批收件箱和库存预警 |

报表钻取、PDF 和 CSV 使用已展示的区间、口径和过账水位。报表和账龄把当前快照保存到 URL，从凭证或原单返回时可继续查看，账龄分页沿用首读水位。审批收件箱取采购、销售各自可见的最近 20 笔订单，并按审批权限和状态筛选。库存预警只筛选所选仓库当前页中可用量小于或等于零的位置。统一搜索加载各已授权模块的首批商品、伙伴、订单或应收单据。

创建报表导出任务后从 `201 Location` 查询详情，任务完成时间控制下载。刷新后从申请人的任务列表恢复。重建使用旧任务保存的快照。响应丢失时先读取当前任务，再允许用原操作键明确重试。

## Aspire 本地端到端

复用已经运行的本地 AppHost。在独立联调账簿提交并复核发票，通过真实 Nitro BFF、Gateway 和 Finance 查询。D11 真实浏览器用例通过。[用例](../../src/Web/nexora-dashboard/e2e/d11-reporting-ui.spec.ts)

| 场景 | 实测结果 |
| --- | --- |
| 五张报表与钻取 | 五张均可查询。权责发生制利润为 3,150.00 元，新增过账后为 3,300.00 元。旧屏幕报表的钻取和实际下载的 PDF 沿用旧日期、口径及水位，钻取可进入凭证。收付实现制按实际核销确认 50.00 元。 |
| 导出与隔离 | 用 `201 Location` 查询任务，刷新后重新打开。下载的 CSV 有 UTF-8 BOM，包含原区间、上期区间、水位和 3,150.00 元利润。按原快照重建得到新任务，两个 CSV 字节一致。另一账号和另一工作区读取返回 `404`。 |
| 账龄与回跳 | 应收共 22 笔，分页为 20 和 2 笔。两页合计 3,250.00 元，与报告总额及往来账期末余额一致。第二页沿用首读水位，经原单回跳后保持原水位和页码。 |
| 工作台与统一搜索 | Finance 利润为 3,300.00 元，使用同一水位进入利润表后金额一致。Reporting 投影显示已同步、版本及时间。命令面板能返回同工作区的真实商品，并打开详情。 |

## MSW 验收

4 项 D11 用例通过，另有 3 项 D10 回归用例通过。本轮在 MSW 中稳定复现导出排队、未完成时文件请求返回 `409`、三项排队任务的容量门禁，以及任务完成后下载与重建。投影的 `200`、`202`、`404`、`503` 四态分别呈现，Finance 金额独立可读。另验证合伙权益、新旧快照、分页往来账、审批和库存筛选。

Nuxt 类型检查、新增文件 ESLint 和 169 项 Dashboard 单测通过。mock 与 live 的 Nitro Node 生产构建均通过。

## 复现命令

从仓库根目录运行。真实浏览器验收依赖 [D0 联调基线](dashboard-d0-baseline.md) 以及独立 Dashboard 的 HTTPS 入口。若已有健康的 AppHost，可直接从就绪检查开始。

```powershell
$nexoraD11Host = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraD11Host --non-interactive
aspire wait gateway --apphost $nexoraD11Host --timeout 120 --non-interactive
$nexoraD11Resource = aspire describe dashboard --apphost $nexoraD11Host --format json --non-interactive | ConvertFrom-Json
$env:NODE_EXTRA_CA_CERTS = $nexoraD11Resource.resources[0].environment.NODE_EXTRA_CA_CERTS
pnpm --dir src/Web/nexora-dashboard test:e2e e2e/d11-reporting-ui.spec.ts
```

```powershell
pnpm --dir src/Web/nexora-dashboard test:msw e2e/d11-reporting.msw.spec.ts e2e/d10-tax.msw.spec.ts
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard typecheck
$env:NUXT_PUBLIC_DATA_MODE = 'mock'
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
pnpm --dir src/Web/nexora-dashboard build
Remove-Item Env:NUXT_PUBLIC_DATA_MODE
```
