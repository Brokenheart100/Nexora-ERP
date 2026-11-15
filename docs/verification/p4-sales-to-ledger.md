# P4 销售、库存履约、应收和通信验收

## 流程与数据边界

- Sales 通过 `salesdb` 保存报价、订单、行许可和履约 Saga。报价签发后可转换一次。工作区销售制单与审批角色分别授权。订单审批绑定版本，库存许可按批签发。
- Inventory 在同一工作区库存事务中预留批次的全部商品，发货、到期释放、取消和退货共用该事务锁。发货只允许指定仓库成员执行。每行许可独立记录已发数量，库存拒绝或释放经持久回执归还未执行的订单额度。
- Finance 通过 RabbitMQ 接收已计价事实。销售出库和退货与采购事实共用仓库成本序列。发票提交占用来源行的数量与未税金额，撤销或修改释放对应额度。发票审批、客户预收、核销、贷项和退款在账簿事务内记账。
- 开票采用工作区客户优先、商品其次的税组策略。批准后的发票保留客户、销售价格、税率及公司品牌快照。PDF 分享绑定过账凭证，服务端保存随机令牌的哈希。明文链接首次返回，使用 URL 片段传递令牌，下载接口从请求体验证。支持到期和撤销。
- Finance 的邮件 Worker 先提交投递租约，再渲染并向 SMTP 发送。服务端收到接受响应后记录 `sent`。明确拒绝记录 `failed`，回执丢失或租约到期记录 `unknown`。只有明确失败可直接重试。重新发送创建关联的新意图，已发送或结果未知的历史仍可查。
- 周期计划采用公司时区每天 09:00 的到期判定，按配置月份间隔及锚点日生成日期，短月份采用月末。计划版本和日期共同限制定时消息。工作区、计划与业务日期组成 occurrence 唯一键。周期模板选用非库存服务，并生成待独立审批的发票。

## 本地复现

从仓库根目录运行。保留已信任的 ASP.NET 开发证书和两名已登记 TOTP 的本地身份。

```powershell
dotnet tool restore
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
python -m pip install fonttools==4.62.1
pwsh scripts/p4/Initialize-InvoiceFont.ps1
pwsh src/Services/Finance/Nexora.Finance.Api/bin/Release/net10.0/playwright.ps1 install chromium --only-shell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
```

AppHost 默认启动 Mailpit 作为本机 SMTP 捕获器（SMTP 容器端口 `1025`，收件箱 UI `http://localhost:8025`），验证码、邀请邮件以及未配置 `InvoiceMail:Host` 时的发票邮件都会进入这里。下面的同仓库捕获器只为 SMTP 故障注入保留；需要验证 failed / unknown / retry / resend / abandon 时按本节启动，并用 `InvoiceMail__*` 覆盖默认渠道。保持以下 PowerShell 终端运行。

```powershell
$env:NEXORA_SMTP_SINK_HOST = '127.0.0.1'
$env:NEXORA_SMTP_SINK_PORT = '2526'
$env:NEXORA_SMTP_SINK_API_PORT = '8026'
python scripts/p0/keycloak-email-otp/smtp_sink.py
```

在另一终端启动 AppHost。现有数据卷首次启用 Sales 时运行初始化脚本。

```powershell
$env:InvoiceMail__Host = '127.0.0.1'
$env:InvoiceMail__Port = '2526'
$env:InvoiceMail__StartTls = 'false'
$env:InvoiceMail__From = 'nexora@example.test'
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
pwsh scripts/p2/Initialize-DevelopmentDatabase.ps1 -Database salesdb
aspire wait bff --apphost $appHost --timeout 150 --non-interactive
$env:NEXORA_TEST_P4_SMTP_SINK = 'http://127.0.0.1:8026'
pnpm --dir src/Web/nexora-web test:e2e --grep 'P4 sales'
aspire stop --apphost $appHost --non-interactive
dotnet test tests/Nexora.Tests -c Release --no-build
```

未配置 `InvoiceMail:Host` 时，AppHost 默认把发票邮件投递到 Mailpit（`http://localhost:8025`），因此不会走上面的故障注入通道。实际渠道通过 AppHost 配置 `InvoiceMail:Host`、`Port`、`From`、`StartTls` 和可选的 `Username`。带账号的 SMTP 密码来自 AppHost 的 secret 参数 `Parameters:invoice-smtp-password`。应用独立运行时使用 `InvoiceMail:Password`。明文 SMTP 仅允许回环地址。Chromium 与静态字体分别通过包版本和 SHA-256 固定。字体准备脚本同时保存 OFL 许可。 [Playwright PDF 接口](https://playwright.dev/dotnet/docs/api/class-page#page-pdf) · [Noto Sans SC 固定源](https://github.com/google/fonts/tree/a85815a42757630ce188fdad368c2dfc444d4773/ofl/notosanssc)

## 对账场景

以 CNY 账簿和研发用 13% 税率验收。先采购实收 10 件，成本合计 600。发货分为 6 件和 4 件，销售发票未税 1000、销项税 130、含税应收 1130。收款核销 500 后，应收余额为 630。两次退货各 1 件，第一次贷项 113 冲减未结应收，第二次在应收结清后生成可退客户款 113。退款后净资金 904，应收及客户预收均为 0。

| 科目 | 预期借方为正余额（CNY） |
| --- | ---: |
| 库存 | 120 |
| 采购暂估 | -600 |
| 应收 / 客户预收 | 0 / 0 |
| 销售收入 | -800 |
| 销项税 | -104 |
| 销售成本 | 480 |
| 银行 | 904 |

## 验收证据

2026-11-08 在 Windows、Linux Docker 引擎及本地 Aspire 环境验收。锁定依赖还原、.NET Release 构建、31 个 .NET 测试、Nuxt 类型检查和生产构建均通过。Organization、Sales、Inventory、Finance 均无待生成迁移。已有 PostgreSQL 卷成功启用 `salesdb`，Finance 迁移保留已提交发票的数量和金额占用。

浏览器套件覆盖 10 个用例。首轮 9 个通过，P3 的旧库存文本断言受字段顺序变更影响。恢复原字段顺序后，采购和 P4 销售复测均通过。原始报告和复测报告分别保存在本地 `artifacts/p4/runtime/full-regression.json` 和 `artifacts/p4/runtime/targeted-regression.json`。验收结束后正常停止 AppHost 和本机 SMTP 捕获器。

- P4 浏览器用例经 Keycloak OIDC / TOTP、BFF、RabbitMQ 和各服务的 PostgreSQL 数据库执行。覆盖整批预留失败、两个订单竞争库存、分批出库和重放、同源开票互斥、待审发票改版、并发核销、销售退货、贷项、退款及银行和试算平衡。
- 同一用例覆盖发货与到期竞争、过期余量释放、周期日期预览、暂停后拒绝、恢复与三期积压补跑、定时和手动重复触发。金额尾差、到期前一毫秒与截止瞬间、同事务乱序回执以及投递租约失效由 .NET 用例补充覆盖。
- 匿名浏览器实际下载了授权 PDF。缺少令牌、撤销、到期、跨工作区及未授权邮件均验证。用 `pypdf==6.21.2` 读取实测样本 `artifacts/p4/runtime/sample-invoice.pdf`，确认一页、两个内嵌 TrueType 字体描述及一个 Logo，中文公司名、客户名和项目名可正确提取，日期为 `08/01/2026`，金额为 `CNY 1130.00`。
- 本机 SMTP 实际捕获 PDF 附件，验证 451 拒绝、同意图重试、服务端接收后丢失应答、结果未知、关联重发和放弃。样例邮箱采用 `example.test`，捕获器仅在本机监听且无邮件转发。

外部 SMTP 测试邮箱、实际送达与供应商回执待验证。周期计划已验证积压补跑，实际停机跨越到期时间的恢复演练仍待执行。P4 品牌 PDF 为系统商业发票。辖区电子税票及 P5 账龄另行验收。
