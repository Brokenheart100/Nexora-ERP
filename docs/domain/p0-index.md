# P0 领域定稿与可行性工作包

> 2026-11-06。总体：进行中，设计基线已形成，P0-03 / P0-05 尚未全部关闭。  
> 用户已确认首个验证地区 / 币种：中国大陆 / CNY。外部渠道选型尚未收到补充。  
> 所有 F01–F42 功能仍未实现 / 验收；本文不是 P1 或生产完成声明。

## 1. 交付与状态

| TODO | 本次结果 | 状态 / 证据 |
| --- | --- | --- |
| P0-01 | 42 个功能特定用例：页面 / API、前置授权、主路径、异常 / 竞态与最低验收 | 设计规格完成：[用例目录](p0-use-cases.md) |
| P0-02 | 七上下文、聚合 / 事务边界、状态机、消息契约与恢复协议 | 设计基线完成：[上下文及契约](p0-contexts-contracts.md) |
| P0-03 | CN / CNY、政策台账及 C01–C07 算例；真实税务主体 / 模板 / 捐赠票据条件尚待核定 | 部分完成：[业务政策](p0-policies.md)、[算术输入](p0-accounting-fixtures.json) |
| P0-04 | 治理 / 业务角色、权限目录、范围组合、独立审批、三类调用者及撤销语义 | 设计基线完成：[授权矩阵](p0-authorization.md) |
| P0-05 | 候选依赖 / Windows 中文 PDF 已实测；Keycloak 26.8.2 邮箱 OTP 17 项、独立 MFA 22 项本地验证通过 | 部分完成：[可行性记录](p0-feasibility.md)、[OTP](p0-email-otp.md)、[MFA](p0-mfa.md)；Google 及外部渠道条件未关闭，生产接入后续验收 |
| P0-06 | ADR 0001–0016 已形成，明确技术决定、取舍和验证条件，主文档同步 | 设计基线完成：[ADR 索引](../adr/README.md) |

“设计基线完成”表示可作为实施输入，不表示已验证应用功能。P0-03 与 P0-05 保持未勾选；其余四项完成设计交付并关联证据。

## 2. 验证方法

```powershell
python scripts/p0/validate_p0.py
pwsh -File scripts/p0/Test-DependencyBaseline.ps1
python scripts/p0/test_pdf_baseline.py
```

从项目根执行。第一项检查 F / 用例 / ADR 覆盖、本地链接与 Decimal 样例；第二项在系统临时目录构建候选包探针，不修改 ERP solution。报告位于 [规格检查](../../artifacts/p0/spec-validation.json) 与 [依赖探针](../../artifacts/p0/dependency-probe/result.json)。

第三项需要 .NET 10、PowerShell、Python pypdf / fonttools 与 PATH 上的 Poppler（也可用 `--pdftoppm` 指定可执行文件）；独立生成并渲染 PDF，自动检查后仍需逐页可视检查。当前 [PDF 探针报告](../../artifacts/p0/pdf-probe/result.json) 与 [样例](../../artifacts/p0/pdf-probe/sample.pdf) 已留存检查结果。复现会重置可视检查为 pending，不能把上次可视结果套用到新文件。

邮箱 OTP 使用独立 Python 环境与 Docker 复现，见 [命令与依赖](p0-email-otp.md)；当前 [17 项固定报告](../../artifacts/p0/email-otp-probe/240daa2bae/result.json) 记录双节点认证、拒绝、限流、SMTP 故障及清理结果。没有对真实邮箱发送消息，没有把本地探针登记为 F01 / P1 已完成。

独立 MFA 复用已固定的 Python / Docker 依赖，见 [MFA 复现说明](p0-mfa.md) 与 [22 项固定报告](../../artifacts/p0/mfa-probe/2c1f439a1e/result.json)。验证密码 + TOTP、恢复、重绑、跨节点消费 / 锁定与 SSO 提级，未把 F03 / BFF 或真实设备验收勾选完成。

## 3. 条件跟踪

| 编号 | 内容 | 后续动作 |
| --- | --- | --- |
| OPEN-01 | 首个真实企业的纳税人类别、税目 / 舍入与会计政策未提供 | 保留研发算例；真实开票 / 抵扣 / 收入模板在业务核定后启用 |
| OPEN-02 | 大陆捐赠票据主体资格与财政票据渠道未核定 | 普通业务收据与法定类型分离；选择可验证渠道，不自造法定号码 |
| OPEN-03 | 本地项已关闭：固定版本编译、认证、重放、到期、双节点竞争及邮件失败均通过 | 2026-11-06 完成 [OTP 本地验证](p0-email-otp.md)；生产 provider / SMTP / 浏览器 / BFF 与故障恢复留至 P1 |
| OPEN-04 | 中文 PDF 的 Windows 技术探针已通过；Linux 容器、生产模板 / 容量与实机打印未验 | 使用 Playwright / Chromium 候选继续验证；保留 PDFsharp 6.5 许可与运行失败记录，不自动引入生产 |
| OPEN-05 | Google、邮件、计费、AI provider 偏好与沙箱条件未提供 | 形成测试账号 / 回调 / 秘密配置清单；本地测试替身和真实联调分别登记 |
| OPEN-06 | 独立 MFA 本地项已关闭：22 项通过，含注册、挑战、恢复、受控重绑与提级 | 2026-11-06 完成 [MFA 本地验证](p0-mfa.md)；真实设备 / BFF、敏感命令绑定、恢复审批与故障恢复留至 P1 |

不因需要后续配置而删除功能；不将不可用占位返回算作启用功能完成。P0 总体继续进行，尚不能按计划宣布 P1 阶段验收已进入。

## 4. 维护入口

- 任务与功能状态：[计划.md](../计划.md)。
- 最终架构约束：[架构.md](../架构.md)。
- 当前声明、候选与运行依赖：[依赖.md](../依赖.md)。
- 新决策修改对应 ADR，并同步主文档；真实测试、人工复核与生产验证分别留存证据。
