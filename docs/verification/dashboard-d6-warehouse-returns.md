# Dashboard D6 仓库、调拨与退货验收

2026-11-21，在原 `nexora-dashboard` 的库存管理、采购应付和销售应收入口验证。开发环境使用 Aspire、Keycloak、PostgreSQL 和 RabbitMQ，测试在 D0 专用工作区及新建的联调工作区执行。

## 界面入口

- 「库存管理 → 仓网与调拨」可新增仓库、指定执行人，查看盘点和调拨。调拨由源仓执行人制单，独立复核后进入在途，目标仓执行人确认入库。
- 「库存管理 → 库存流水」可从原实收或实发流转至退货申请、仓库确认及已执行流水。采购单和销售单详情的「查看流水与退货」打开相关仓库流水。
- 退货详情可转至财务。「财务 → 采购应付」处理暂估冲回、供应商贷项与退款，「销售与应收 → 应收」处理客户贷项与退款。需要复核的单据显示状态并可打开过账凭证。

## 真实 AppHost

| 场景 | 结果 |
| --- | --- |
| 仓库与在途调拨 | 新建目标仓并指定 Alice。源仓有 8 件，调拨 3 件后进入在途，源、目标仓分别记录数量 −3、+3 和成本 −18、+18。目标仓未授权用户收到 403，已签收的调拨再次签收收到 409，目标仓无新增流水。 |
| 盘点确认与取消 | 源仓执行人制单时读取当前库存序号，取消待复核盘点后显示「已取消」。另建一张盘点，由独立复核人确认盘亏 1 件，库存流水记录成本 −6 元，Finance 回读过账凭证。 |
| 未开票采购退货 | 原收货 8 件，界面拦截申请退 9 件。采购审批人申请退 1 件，独立仓库执行人确认后，财务读取退货成本入账状态。 |
| 已付款采购退货 | 实收并结清 2 件共 12 元的账单，退 1 件后关联原账单创建供应商贷项。独立复核后可退款 6 元。已关闭期间的退款过账收到 409，账簿没有产生凭证。开放期间的退款经独立复核后，银行流水增加 6 元，可退款额归零，可回查贷项和退款凭证。 |
| 销售退货、贷项和退款 | 原发货 2 件，退 1 件，回仓成本 6 元。已结清发票对应的贷项可退款 11.30 元，经独立复核过账后登记退款并再次复核。过账后可退款额为 0，可打开退款凭证。重复确认收到 409，未开放期间的退款过账收到 409 且没有凭证。 |

## MSW 浏览器验证

3 项通过，覆盖仓库两段式调拨、重复签收、未开票退货成本回读，以及采购和销售贷项、退款的独立复核。用例通过原有界面发出操作，并跨模拟身份和刷新回读状态。

## 已知接口范围

`GET I/warehouses/{id}/movements` 返回流水 ID、许可或库存单据 ID、商品 ID、顺序、日期、数量、成本和被冲回的流水 ID。服务端分页；响应没有原采购或销售订单 ID、交易类型及退货后的剩余量。页面使用已读取的许可和退货记录关联来源；缺少已加载的引用时保留 ID。`GET I/warehouses/{id}/returns` 与 `GET I/warehouses/{id}/sales-returns` 只返回最近 100 条。达到上限时界面将推算剩余量标为上限，提交时由服务按完整历史校验。

## 复现

```powershell
$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraAppHost --non-interactive
aspire wait gateway --apphost $nexoraAppHost --timeout 120 --non-interactive
$dashboardInfo = aspire describe dashboard --apphost $nexoraAppHost --non-interactive --format Json | ConvertFrom-Json
$env:NODE_EXTRA_CA_CERTS = $dashboardInfo.resources[0].environment.NODE_EXTRA_CA_CERTS
pnpm --dir src/Web/nexora-dashboard test:e2e e2e/d6-warehouse-ui.spec.ts e2e/d7-ledger-ui.spec.ts
aspire stop --apphost $nexoraAppHost --non-interactive
pnpm --dir src/Web/nexora-dashboard test:msw e2e/d6-warehouse.msw.spec.ts
```

[Dashboard 接入清单](../ui-dashboard-api-integration-todolist.md#d6-退货仓库和在途调拨) · [D0 联调基线](dashboard-d0-baseline.md) · [库存 API](../../src/Services/Inventory/Nexora.Inventory.Api/Endpoints)
