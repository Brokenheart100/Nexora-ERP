# Dashboard D8 资金与捐赠本地验收

2026-11-21。在原 `nexora-dashboard` 内接通资金账户、付款作废、银行对账和捐赠收据。验收使用 D0 专用联调工作区及独立的 Alice、Bob 和仓库收货身份。测试账户、供应商、采购单与捐赠人使用每次运行的专用编号。

## 页面入口

| 要操作的功能 | 原 Dashboard 入口 |
| --- | --- |
| 资金账户、收入、费用、划转、业主投入与提款 | 财务 → 资金管理 |
| 导入 CSV、拆分匹配、解除、排除与恢复、对账复核及报告 PDF | 财务 → 银行对账。资金管理页复用同一组对账控件 |
| 作废已过账的供应商付款 | 财务 → 采购应付 → 账单详情 → 付款记录 → 详情 → 提交作废复核 |
| 捐赠复核、普通收据 PDF、关联财政票据及邮件 | 财务 → 捐赠管理 → 捐赠详情 |

## Aspire 本地端到端

Playwright 真实入口 1 项通过，覆盖下列业务步骤。

| 场景 | 验收结果 |
| --- | --- |
| 资金账户与业务单据 | 从原界面建立一个银行账户和一个现金账户，读取科目、余额和默认账户版本。资金单据由 Alice 提交，Bob 独立过账。20 元划转分别产生 −20 元和 +20 元流水，随后核对业主投入 100 元、提款 30 元及余额 1,350 元。 |
| 付款作废 | 收货 100 件后，按未税 1,000 元、税 130 元建立账单，付款 600 元后未结 530 元。Alice 提交作废时未结仍为 530 元，Bob 复核过账后恢复至 1,130 元。原付款与冲销单互相引用，冲销凭证借记资金科目 600 元，对应资金流水入账 600 元并指向原流水。 |
| 导入与匹配 | 校验问题返回 200，可提交预览返回 201。Wise 示例显示待完成、内部换汇及其他币种三类跳过行。复载按预览 ID 回读已导入行数，重复导入提交为 0 行。500 元对账单行分别分配给 300 元和 200 元资金流水。相同幂等键重放返回原回执。解除恢复余量，旧版本、超额与再次分配由服务端拒绝。待匹配行能带入收入、费用及供应商付款表单，费用复核过账时自动完成匹配。 |
| 对账截止日与快照 | 2026-01-08 和 2026-01-09 的对账分别独立复核。账面与调整后对账单余额均为 1,300 元，两种差额均为 0。预览有 1 元差额时服务端拒绝复核，制单人可取消申请。已完成截止日的对账行受到保护，较早记录在较新记录完成时不能撤销。撤销最新记录需要理由，撤销后仍能获取原快照和 PDF。 |
| 捐赠与投递 | 200 元捐赠经独立复核后生成普通收据和凭证，PDF 通过 BFF 读取。外部财政票据代码和号码保留前导零且可从捐赠详情回读。财务能力显示本地邮件渠道，外部票据登记可用。隔离 Mailpit 捕获初发、补发与重试成功共三封含 PDF 的邮件。临时让 SMTP 拒绝收件人获得明确失败，再验证重试沿用原投递 ID、补发使用新记录、放弃保留原记录。 |

## MSW 与构建

| 检查 | 结果 |
| --- | --- |
| D8 浏览器模拟 | 4 项通过。覆盖 CSV 行校验、过期重做、提交响应丢失后回读结果、拆分匹配、两期对账撤销、付款作废以及投递失败与结果未知的恢复分支。 |
| D4 浏览器回归 | 5 项通过。覆盖采购单价和权限、审批、回读重放、实收暂估与供应商付款。 |
| 静态与单元检查 | Nuxt 类型检查通过，169 项单测通过。 |
| 生产构建 | mock 和 live 均通过。 |

## 复现命令

在仓库根目录运行。联调用例复用 [D0 本地环境](dashboard-d0-baseline.md) 的工作区和浏览器登录准备。

```powershell
$nexoraD8Host = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraD8Host --non-interactive
aspire wait gateway --apphost $nexoraD8Host --timeout 120 --non-interactive
$nexoraD8Dashboard = aspire describe dashboard --apphost $nexoraD8Host --non-interactive --format Json | ConvertFrom-Json
$env:NODE_EXTRA_CA_CERTS = $nexoraD8Dashboard.resources[0].environment.NODE_EXTRA_CA_CERTS
pnpm --dir src/Web/nexora-dashboard test:e2e e2e/d8-treasury-ui.spec.ts
pnpm --dir src/Web/nexora-dashboard test:msw e2e/d8-treasury.msw.spec.ts e2e/d4.msw.spec.ts
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard typecheck
$env:NUXT_PUBLIC_DATA_MODE = 'mock'
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
pnpm --dir src/Web/nexora-dashboard build
```

复测 SMTP 拒绝时，另起一个仅绑定回环地址的 Mailpit 测试实例，沿用 AppHost 的 Mailpit 镜像并设置 `MP_ENABLE_CHAOS=true`。启动本次验证的 AppHost 前设置 `InvoiceMail__Host=127.0.0.1`、`InvoiceMail__Port` 为该实例的 SMTP 映射端口及 `InvoiceMail__StartTls=false`。运行 Playwright 前将 `NEXORA_D8_MAILPIT_URL` 指向该实例的 HTTP 地址。用例在读取到 `local-only` 能力后才使用专用 `example.invalid` 收件地址，运行结束恢复原 SMTP 响应设置。 [Mailpit 故障模拟](https://mailpit.axllent.org/docs/integration/chaos/)

测试按现有 Playwright 配置保存到 `artifacts/p1/runtime/dashboard-browser-results.json`、`artifacts/p1/runtime/dashboard-msw-results.json`。远程 CI 和真实邮件渠道属于单独的验收环境。
