# P0 独立 MFA 本地验证

> 2026-11-06，**22 项本地集成检查全部通过**，固定运行 `2c1f439a1e`。使用 Keycloak 26.8.2 的内置密码、TOTP、恢复码和 step-up；临时容器、网络与秘密文件清理通过。不是复用邮箱六位验证码，也没有实现新的 TOTP 服务端算法。

## 1. 范围与入口

运行入口：[test_mfa.py](../../scripts/p0/test_mfa.py)，镜像构建：[Dockerfile](../../scripts/p0/keycloak-mfa/Dockerfile)，基础镜像 digest 沿用 [P0 镜像 manifest](../../scripts/p0/keycloak-email-otp-images.json)。Python 测试依赖复用 [固定 requirements](../../scripts/p0/keycloak-email-otp-python-requirements.txt)，HTTPS / Docker 公共辅助代码复用邮箱探针，独立场景和资源前缀分开。

使用一个临时 PostgreSQL、两个 Infinispan / JDBC_PING 节点与回环 HTTPS 代理，不调用真实邮箱、Google 或外部认证器云服务。测试中的 TOTP 客户端按 RFC 6238 计算，并先检查公开参考向量；Keycloak 仍独立执行实际验证。TOTP 种子、恢复码与临时密码只在测试进程 / 临时认证数据库中存在，不写入报告、HTML 快照或截图；含密码的 realm 导入文件和 TLS 私钥在结束时删除。

## 2. 认证等级与注册

| 层级 | 本地配置 | 约束 |
| --- | --- | --- |
| LoA 1 | 用户名 / 密码；缓存 36000 秒 | 仅作低等级 SSO 对照，不能作为敏感操作 MFA 证明 |
| LoA 2 | 已绑定 TOTP 或顺序恢复码；max-age=0 | 每次新的高等级授权重新挑战；高等级客户端 Minimum ACR=2 |
| 未绑定 | 条件 2FA 未执行时，强制 Configure OTP，并要求建立恢复码 | 不允许仅因“尚未配置第二因素”就跳过绑定 |

认证器策略为 HmacSHA1、六位数字、30 秒周期、look-ahead=0、`otpPolicyCodeReusable=false`。这是一组固定的本地验证政策，不代表已接受全部真实设备、时钟偏差或未来企业政策。

配置既有可用第二因素时可使用 TOTP / 恢复码；没有可用第二因素时使用官方“未执行 2FA 则强制 OTP 设置”的回退。客户端 Minimum ACR 与服务端已签名结果均需检查，不能只设置可被请求参数覆盖的 Default ACR Values。

首次绑定属于引导 / 凭据注册，不能仅凭“展示并确认了新种子”证明用户此前就持有可信第二因素。正式 BFF / 业务策略需明确初始化资格、可信邀请 / 现有身份及敏感权限开放条件；不把首次引导等同于既有设备的独立认证。

## 3. 验收覆盖与证据

最新 [探针报告](../../artifacts/p0/mfa-probe/result.json) 记录实际结果；未通过的轮次保留在独立运行目录。范围包含：

- 未绑定不能跳过、错误绑定码不落凭据、TOTP 确认与恢复码生成。
- 密码与第二因素分别必需；空 / 非数字 / 窗口外验证码拒绝。
- 跨节点登录、同一时间步重用与并发消费。
- 恢复码登录、重放拒绝、重新生成撤销旧集合。
- 使用恢复码授权绑定新设备，再受控撤销旧设备 / 会话，验证旧设备失效。
- 暴力尝试的跨节点临时锁定。
- 低等级 SSO 进入高等级客户端仍挑战，参数降级拒绝、静默授权不能跳过。
- 通过受信 realm JWKS 验证 RS256 签名、issuer、audience、expiry 和 nonce 后核对 ACR / AMR。

本次 [固定结果](../../artifacts/p0/mfa-probe/2c1f439a1e/result.json)、[脱敏 realm 配置](../../artifacts/p0/mfa-probe/2c1f439a1e/realm-redacted.json)、[镜像构建](../../artifacts/p0/mfa-probe/2c1f439a1e/image-build.log)、[节点 A 日志](../../artifacts/p0/mfa-probe/2c1f439a1e/a.log) 和 [节点 B 日志](../../artifacts/p0/mfa-probe/2c1f439a1e/b.log) 已归档。TOTP 双节点并发得到 302 / 200，一次成功、一次拒绝；正常已绑定用户令牌实测 `acr=2`、`amr=[pwd, otp]`。修改 JWT 的 ACR 而不重签会被验签拒绝。

本次并发单次消费测试针对 TOTP。恢复码已验证顺序使用、跨节点重放拒绝和集合更新；恢复码同时提交、网络分区 / 全缓存丢失、备份恢复仍属于后续故障测试，不将前者证据扩写为后者已通过。

ID Token 的验证用于本地 OIDC / BFF 认证证明，不是把 ID Token 当作业务 API 的 access token。正式 API 的 JwtBearer、受众、业务授权、scope / step-up 策略仍在 P1 验收。

## 4. 恢复与更正边界

Keycloak 本版本生成 12 个按顺序使用的恢复码；每次要求下一个码，不宣称任意一个剩余码都可用。恢复码是另一种持有因素，与密码组合用于设备不可用时登录，不是绕过第一因素的后门。

本地更换设备路径为：密码 → 一个有效恢复码 → Configure OTP 确认新设备 → 明确的管理员操作撤销旧凭据和既有会话 → 新登录核对旧 / 新设备。Keycloak 新增 OTP 设备不会自动撤销旧设备。本次显式管理员操作不代表已实现自助恢复产品，也不代替人工恢复中的身份核验、独立审批和审计。

会话撤销除了调用退出接口，还保留同一会话的 Cookie 再以低等级客户端发起 `prompt=none`；另一节点返回 `login_required`，没有发出新的授权码。此证据针对新的 SSO 授权，不宣称所有已签发 access token 会通过离线验签立即失效。

AMR 可反映会话内认证方法历史，`auth_time` 也不能直接当成每个第二因素的新鲜时间戳。敏感命令仍需由服务端发起并关联特定授权事务 / 操作、检查实际要求和可信结果；本探针不声称已绑定真实付款、过账或审批。

`recovery` 是本地配置的方法引用，不冒充标准 AMR 枚举。是否允许恢复码完成某类敏感操作应由正式业务策略决定；本地 LoA=2 用于检验配置和链路，不声明某个外部认证等级或合规认证。max-age=0 针对新的授权请求，不表示 refresh token 兑换自动进行一次新 MFA。

## 5. 复现与清理

从项目根执行，要求 Docker Linux engine 与 Python 3.14；不修改 ERP solution / AppHost：

```powershell
$mfaVenv = Join-Path $env:TEMP ('nexora-p0-mfa-python-' + [guid]::NewGuid().ToString('N'))
python -m venv $mfaVenv
& (Join-Path $mfaVenv 'Scripts/python.exe') -m pip install -r scripts/p0/keycloak-email-otp-python-requirements.txt
& (Join-Path $mfaVenv 'Scripts/python.exe') scripts/p0/test_mfa.py
```

测试使用受信临时 TLS 证书，保留 Secure Cookie；容器只在专用 bridge 网络和本机回环端口中运行，不把该拓扑当成完整出站网络隔离。结束时核对专属 run label 后删除自己的容器、匿名卷和网络，不全局 prune；删除含密码的 realm 文件、环境文件和 TLS 私钥，保留脱敏配置、日志、镜像与源摘要。

## 6. 后续生产验收

继续验证真实手机认证器 / QR、真实浏览器与 Nuxt / BFF、WebAuthn / Passkey、管理员辅助恢复的身份核验 / 审批、秘密轮换与备份访问控制、时钟偏差、缓存全失 / 网络分区及生产负载。TOTP 种子必须在认证服务中可供验证器使用，不能把它当作只存单向哈希的密码；应保护认证数据库、备份和管理员权限。

F03、P1-05 与 P0-05 父任务分别跟踪，不因本地路径通过而宣称整个平台 MFA 或产品功能已验收。

## 7. 官方依据

- [Keycloak OTP / 认证流程 / Step-up](https://www.keycloak.org/docs/latest/server_admin/index.html)：条件流程、强制绑定、恢复码及 Minimum ACR 的配置。
- [26.8.2 OTP 验证器](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/credential/OTPCredentialProvider.java)：TOTP 校验与不可重用策略。
- [26.8.2 Configure OTP](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/authentication/requiredactions/UpdateTotp.java)：实际注册与恢复码 required action。
- [26.8.2 恢复码凭据](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/credential/RecoveryAuthnCodesCredentialProvider.java)：顺序消费与重新生成。
- [26.8.2 LoA 条件](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/authentication/authenticators/conditional/ConditionalLoaAuthenticator.java)：等级与 max-age 语义。
- [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238)：TOTP 客户端参考向量。
