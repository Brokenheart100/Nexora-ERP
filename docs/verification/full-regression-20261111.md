# 2026-11-11 本地全量回归

在 Windows 上以本地 Aspire、Keycloak、Linux Docker、Edge 和本机 SMTP 捕获器验证当前 ERP。浏览器套件串行执行，用例通过正常 HTTP 入口访问七个业务服务。

下文 `NU1903` 和临时告警参数记录了 Aspire 13.6.4 时的回归。当前版本使用默认严格还原。[Aspire 13.6.5 安全补丁验证](p1-platform-readiness.md#aspire-1365-安全补丁验证)

## 业务回归

完整套件首轮执行 11 条，5 条通过、6 条失败。首轮运行期间，Windows 提交内存达到 99%，Reporting 首次动态编译 HTTP 处理器时记录 `OutOfMemoryException` 并返回 500。关闭本轮积累的 .NET 构建服务器并重启本次 AppHost 后，原来失败的六条用例全部通过。按两个原始报告核对，共 11 条不同用例有通过记录。

| 用例覆盖 | 最终结果 |
| --- | --- |
| OIDC、TOTP、CSRF、跨工作区隔离和正常退出 | 通过 |
| 会话失效后退出、成员邀请、权限变更和即时停用 | 通过 |
| 商品目录、分类、单位、往来单位与联系人 | 通过 |
| 企业与个人工作区、公司偏好、品牌、账簿和科目导入 | 通过 |
| 税项税组、期初、期间、凭证审批冲销及权责报表 | 通过 |
| 采购、收货、成本、价差、退货、应付、银行导入与捐赠 | 通过 |
| 销售、预留发货、退货、开票、应收、退款、PDF、匿名分享、周期计划及本机邮件 | 通过 |
| 财务报表、现金流、账龄、导出、银行对账、盘点、调拨和年度关账 | 通过 |

浏览器原始报告存于 `artifacts/p1/runtime/full-regression-20261111/browser-results.json` 和 `browser-retest-results.json`，分别保留首轮和复测结果。

## 构建和自动化检查

- 解决方案 Release 构建通过。31 项 .NET 测试通过，包括使用独立 PostgreSQL 和 RabbitMQ 的集成测试。
- Nuxt 锁定安装、类型检查、lint、生产构建及 4 项 Vitest 单测通过。类型检查仍输出 Vue Router 的 Volar 扩展加载告警，命令退出码为 0。
- 七个 DbContext 均与最后一份迁移模型一致。
- 平台基线通过。七个服务引用各自的数据库和 RabbitMQ 连接串，四个运行容器镜像符合固定摘要，三项服务的 readiness 与 liveness 均为 200，四项 RabbitMQ 权限探针通过。
- 四类依赖故障恢复通过。依次中断并恢复 RabbitMQ、PostgreSQL、Redis 和 Keycloak。36 次 HTTP 探测符合预期，包括依赖中断时 readiness 503、liveness 200，以及恢复后 readiness 200。
- 独立 MFA 探针 22 项通过，运行记录为 `artifacts/p0/mfa-probe/66503e3b00/result.json`。
- 独立邮箱 OTP 探针 17 项通过，运行记录为 `artifacts/p0/email-otp-probe/9be0b556b9/result.json`。补齐固定摘要的 SMTP 镜像后复跑，使用与当前 Java 源码和 Maven 项目匹配的已编译 provider JAR，并核对了 JAR 的 SHA-256。

## 发现的问题

- 严格锁定还原复现 `NU1903`。项目的 Aspire Hosting 13.6.4 命中微软安全公告，公告的修复版为 13.6.5。本轮只在验证命令中将 `NU1903` 保留为警告，锁定还原和 Release 构建因此可以继续。[微软安全公告](https://github.com/advisories/GHSA-f7vh-h5g3-7jrh)
- `scripts/p0/validate_p0.py` 仍要求 F 编号列使用固定空格，并要求 ADR 列表严格止于 0016。当前表格列对齐及新增 ADR 0017 会触发误报。仅在内存中调整这两个识别条件后，42 项规格、377 个本地链接和 7 组分录样例通过。
- 邮箱 OTP 探针的全新 Maven 构建受 Maven Central TLS 握手失败阻塞。首轮日志保存在 `artifacts/p0/email-otp-probe/cf929617e7/maven-build.log`。

## 复现

按 [README](../../README.md) 准备运行时，当前 AppHost 默认启动 Mailpit 捕获本机邮件；发票邮件故障注入按 [P4 验收记录](p4-sales-to-ledger.md) 另行启动捕获器并设置 `InvoiceMail__*`。EF 模型核验命令见 [目录整理验证](service-layout.md)。

```powershell
dotnet restore Nexora.slnx --locked-mode --no-cache
dotnet restore Nexora.slnx --locked-mode -p:WarningsNotAsErrors=NU1903
dotnet build Nexora.slnx -c Release --no-restore -p:WarningsNotAsErrors=NU1903
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web install --frozen-lockfile
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build

$env:WarningsNotAsErrors = 'NU1903'
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait bff --apphost $appHost --timeout 180 --non-interactive
pwsh scripts/p1/Test-Platform.ps1
$env:NEXORA_TEST_P4_SMTP_SINK = 'http://127.0.0.1:8026'
pnpm --dir src/Web/nexora-web test:e2e
pwsh scripts/p1/Test-Platform.ps1 -Faults
aspire stop --apphost $appHost --non-interactive
```

本轮邮件仅发送给本机捕获器。外部 SMTP、Google 登录、法定票据和生产环境仍按计划单独验收。
