# P0 技术可行性与联调条件

> 2026-11-06。状态：部分实测，部分官方资料核对，外部能力待联调。不会把包存在、接口存在或测试替身当作真实能力完成。

## 1. 实测证据

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| 本机 .NET | SDK 10.0.402；运行时 10.0.13 | 未改根目录 SDK 配置 |
| 容器引擎 | Docker Linux Engine 29.8.2 可达；独立 OTP 测试资源已启动并清理 | 未接入 AppHost；已有其他项目容器不在清理范围 |
| NuGet 候选存在 | Wolverine 套件 6.61.0、EF Core / 认证包 10.0.14、Npgsql EF 10.0.3、Alba 8.5.3 | 仅选择 P0 验证候选，不称为全局最新保证 |
| 候选组合兼容 | restore、locked restore、build、核心类型加载均成功 | 未执行 DbContext 事务、Outbox、broker 或登录链路 |
| 中文 PDF | Microsoft.Playwright 1.64.1 / Chromium 156.0.8078.4；Noto Sans SC 固定来源、静态字符子集；两页 A4、原字文本提取、字体嵌入和逐页可视检查通过 | Windows 技术探针；未验 Linux 容器、生产模板 / 分享权限与实机打印 |
| PDFsharp 候选排除 | 6.5.0 实测构建成功，创建 PdfDocument 因未加载许可失败；NuGet 构建另有 Pkcs 8.0.1 漏洞告警 | 官方已改 AGPL / 商业双许可；未设置 AGPL、未购买许可，不选为默认渲染依赖 |
| 邮箱 OTP provider | Keycloak 26.8.2 / Java 21，自有 SPI 候选 0.1.0；17 项真实本地集成检查通过 | 双节点正常网络 + 本地 SMTP；不含真实邮件、MFA、BFF 或生产 provider 验收 |
| 独立 MFA | Keycloak 26.8.2 内置密码 + TOTP、恢复码与 step-up，22 项双节点集成检查通过 | 独立于邮箱探针；真实手机、浏览器 / BFF、受控恢复产品与故障验收未完成 |

版本输入：[p0-dependency-baseline.json](p0-dependency-baseline.json)。复现命令：

```powershell
pwsh -File scripts/p0/Test-DependencyBaseline.ps1
```

从项目根运行。输出：[验证结果](../../artifacts/p0/dependency-probe/result.json)、[构建日志](../../artifacts/p0/dependency-probe/build.log)、[加载日志](../../artifacts/p0/dependency-probe/load.log)、[解析依赖锁](../../artifacts/p0/dependency-probe/packages.lock.json)。临时项目在系统临时目录中，不加入 ERP solution。

## 2. 能力评估与后续验证

| 能力 | 已有依据 / 设计 | 尚需验证与联调条件 | 当前结论 |
| --- | --- | --- | --- |
| 邮箱六位 OTP | Keycloak 26.8.2 的独立 Authenticator SPI 已编译 / 装载；双节点认证、单次消费、到期、限流、SMTP 失败等 17 项通过 | 正式维护 / 升级策略、真实 SMTP TLS / 超时 / 配额、受信代理、风控 / 时间侧信道、浏览器 / BFF 及故障恢复 | P0 本地验证通过，生产启用仍待验；不是内置 TOTP / 独立 MFA |
| Google 登录 | Keycloak identity brokering / OIDC 接入 | 实际 OAuth client、回调域名、测试账号、可信邮箱 / 身份链接策略；中国大陆目标网络环境可达性 | 官方接入路径已核对，真实回调待验证 |
| MFA | 独立密码 + TOTP 注册 / 挑战、顺序恢复码、受控重绑、双节点消费 / 锁定及 SSO 提级 22 项通过；签名 ACR / AMR 核对通过 | 真实设备与浏览器 / BFF、初始化治理、受控恢复审批、敏感命令绑定、恢复码并发 / 网络分区与备份恢复 | P0 本地验证通过；P1 / F03 保持未验收，邮箱 OTP 不等于独立 MFA |
| PDF / 中文字体 | Playwright / Chromium 已生成两页中文 / CNY 样例；字体来源固定并保留 OFL；嵌入、原字提取、换行、分页与可视检查通过 | Linux 镜像 / 沙箱、生产模板、品牌资产、输出并发 / 内存、打印及分享授权；浏览器和字体资产随发布固定 | Windows 技术路径通过，生产接入仍待验；PDFsharp 6.5 不作为默认选型 |
| 平台 / 自定义发件 | 业务侧 Dispatch 记录 + Wolverine Worker + Provider 适配 | 用户未提供渠道偏好；本地捕获与真实测试收件分开；域验证、配额、幂等、未知结果查询、回执验签 | 未进行真实发送 |
| 计费门户 | Organization Billing 适配、已验证 provider webhook 更新权益 | 用户未提供渠道；币种 / 产品支持、测试商户、门户会话、签名、重放、乱序、退款 / 降级策略 | 先保留手工 / 自托管策略，外部功能不可宣称完成 |
| AI / MCP | 外部 agent / 模型端口、流式请求；每次工具调用进入应用授权 | 用户未提供渠道；测试项目、执行 / 取消 / 恢复协议、会话隔离、scope、审批和错误契约 | 不发送真实财务数据、不建立无限权 agent |
| Wolverine 事务 / 调度 | 各服务消息库、durable 端点、明确写上下文；官方支持 EF 事务抽象映射 | 真实 PostgreSQL / RabbitMQ、处理链发现与状态 / Outbox 回滚，Cron / Saga 并发恢复 | 包组合验证通过；运行时接入属于 P1 |

## 3. 源码 / 官方资料核对

- Keycloak 内置 [OTPFormAuthenticator](https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/authentication/authenticators/browser/OTPFormAuthenticator.java) 与 [OTP 凭据](https://github.com/keycloak/keycloak/blob/main/server-spi/src/main/java/org/keycloak/models/credential/OTPCredentialModel.java) 展示 TOTP / HOTP 路径；邮箱代码应作为单独 provider 接入，不能混称同一能力。
- [Keycloak Authentication SPI](https://www.keycloak.org/docs/latest/server_development/) 明确 Authenticator / Factory 及 META-INF/services 注册；本次核对扩展路径，尚未证明任何第三方邮箱 provider 的版本兼容和安全性。
- [Wolverine EF 事务中间件](https://wolverinefx.net/guide/durability/efcore/transactional-middleware.html) 支持显式 DbContext / 抽象映射；仓储 / 用例隐藏依赖时必须显式配置，并保持同 scoped 实例。
- [PDFsharp 字体解析](https://docs.pdfsharp.net/PDFsharp/Topics/Fonts/Font-Resolving.html)、[Noto Sans SC 官方元数据](https://github.com/google/fonts/blob/main/ofl/notosanssc/METADATA.pb) 用于确定可复现字体策略。发布字体前保留对应具体版本许可，不以操作系统自带字体代替分发授权记录。
- [PDFsharp 6.5 官方许可说明](https://docs.pdfsharp.net/General/License/License.html) 与本地包 nuspec 确认 AGPL / 商业双许可；[失败报告](../../artifacts/p0/pdf-probe/pdfsharp-6.5-rejected/result.json)、[构建告警](../../artifacts/p0/pdf-probe/pdfsharp-6.5-rejected/build.log) 和 [创建失败](../../artifacts/p0/pdf-probe/pdfsharp-6.5-rejected/generate.log) 保留，不将候选存在当作可直接使用。
- [Playwright .NET PDF API](https://playwright.dev/dotnet/docs/api/class-page#page-pdf) 和 [1.64.1 包元数据](https://www.nuget.org/packages/Microsoft.Playwright/1.64.1) 用于替代探针；本地包声明 MIT，浏览器及其第三方许可仍须随镜像归档。
- NuGet 版本检查来自各包的 `https://api.nuget.org/v3-flatcontainer/{package}/index.json`；完整依赖实际解析以结果文件的锁为准。

## 4. P0-05 的关闭条件

OTP provider 的固定版本构建和本地认证 / 重放验证、独立 MFA 的本地注册 / 挑战 / 恢复 / 提级，以及 PDF 中文样例渲染与可视检查已通过；Google 的方案及邮件、计费、AI 的提供方与测试环境条件仍要形成可执行清单。真实企业的对外联调可以在 P1 / 对应业务阶段继续，但不能在其他接入条件尚未关闭时把 P0-05 勾选完成。

外部渠道问题已向用户询问，暂未收到选型信息；本次不默认购买、注册、申请凭据或向外发送邮件。可继续完成不依赖这些选择的领域设计和本地兼容验证。

## 5. PDF 探针复现与发现

运行 [test_pdf_baseline.py](../../scripts/p0/test_pdf_baseline.py)，按需用 `--pdftoppm` 指定 Poppler。Python 包版本本次为 pypdf 6.21.2 / fonttools 4.62.1。脚本创建独立临时 .NET 项目，固定 Microsoft.Playwright 1.64.1，并安装其匹配的 Chromium headless shell；不会修改 ERP solution。

字体固定在 Google Fonts 提交 `a85815a42757630ce188fdad368c2dfc444d4773`，源字体和许可均校验 SHA-256。原始可变字体直接打印时发现 Type 3 渲染告警及汉字提取成康熙部首的现象；改为 wght=400 的静态实例，并仅保留样例实际 Unicode 字符，重新生成后原字文本提取和渲染均通过。生产必须根据实际单据字符生成子集或采用经验证的静态字体，不能直接复用仅覆盖样例字符的字体。FontTools 是探针准备工具，尚未决定作为业务运行依赖。

样例仅使用可信的固定 HTML、内嵌字体，关闭页面 JavaScript 并中止外部资源请求；生产 Worker 还需限制模板 / 品牌资源、禁用任意 HTML 与脚本、实施容器网络隔离和渲染资源上限。浏览器拦截本身不视为完整安全隔离。

证据：[PDF](../../artifacts/p0/pdf-probe/sample.pdf)、[第 1 页](../../artifacts/p0/pdf-probe/page-1.png)、[第 2 页](../../artifacts/p0/pdf-probe/page-2.png)、[原字提取文本](../../artifacts/p0/pdf-probe/extracted.txt)、[字体许可](../../artifacts/p0/pdf-probe/OFL.txt)、[依赖锁](../../artifacts/p0/pdf-probe/packages.lock.json)、[自动与可视检查报告](../../artifacts/p0/pdf-probe/result.json)。PDF 只表示技术样例，不是税务发票或公益捐赠财政票据。

## 6. 邮箱 OTP 双节点本地验证

已完成 [OTP provider 本地验证](p0-email-otp.md)：固定 Keycloak 26.8.2 / Java 21 和镜像 digest，在两个共享 Infinispan / JDBC_PING 的节点、PostgreSQL、本地 SMTP 捕获器与受信 HTTPS 代理上运行 17 项集成检查，全部通过。报告：[固定结果](../../artifacts/p0/email-otp-probe/240daa2bae/result.json)。

本轮实际修复了 SMTP 失败分支在同一 Keycloak 事务对挑战键二次 `put` 导致的异常，改为结果确定后单次写入；失败码不可认证。验证码摘要使用共享 HMAC 密钥，挑战绑定认证会话，错误提交也单次消费。测试明确覆盖账号发码后邮箱变化 / 停用、跨节点并发、发件冷却与 IP 额度；时序侧信道、网络分区 / 缓存全失、真实邮件可达性和独立 MFA 不在通过范围内。

## 7. 独立 MFA 本地验证

已完成 [22 项独立 MFA 检查](p0-mfa.md)，固定 Keycloak 26.8.2 / `recovery-codes:v1` / `step-up-authentication:v1`，使用内置 TOTP 与恢复码，不修改之前的邮箱 provider。证据：[固定报告](../../artifacts/p0/mfa-probe/2c1f439a1e/result.json)、[实际脱敏配置](../../artifacts/p0/mfa-probe/2c1f439a1e/realm-redacted.json)。

配置显式阻止未绑定用户跳过高等级认证；高等级客户端设置 Minimum ACR=2，LoA2 max-age=0。实测低等级 SSO、`acr_values=1` 与 `prompt=none` 不能跳过所需挑战；正常已绑定登录的令牌在 RS256 / issuer / audience / expiry / nonce 检查后确认 `acr=2` 和 `amr=[pwd, otp]`，篡改等级被验签拒绝。

恢复路径验证 12 个按顺序使用的恢复码、消费后重放拒绝、重新生成使旧集合失效。设备重绑先证明密码与已有第二因素，确认新设备后再显式由管理员撤销旧设备和会话；这不是已完成的自助恢复系统。MFA 真机 / BFF、业务敏感命令关联与其他故障边界仍在 P1 验收，不能把本地协议证明当作完整 F03 完成。
