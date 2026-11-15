# P0 邮箱 OTP provider 本地验证

> 2026-11-06。固定 Keycloak 26.8.2 / Java 21，Nexora 自有 Authenticator SPI 候选 0.1.0。**17 项本地集成检查全部通过**，运行编号 `240daa2bae`；测试容器 / 网络与临时秘密已清理。该候选不是生产认证发布，也不是独立 MFA。

## 1. 范围与资源

代码位于 [provider 源目录入口](../../scripts/p0/keycloak-email-otp/pom.xml)，运行入口为 [test_email_otp.py](../../scripts/p0/test_email_otp.py)。探针与 ERP solution / AppHost 分开，不新增业务服务，不改变 Keycloak 认证、Organization 业务授权的边界。

本地临时环境包含 PostgreSQL 18.3、两个 Keycloak 节点、SMTP 捕获器和回环 HTTPS 代理。节点使用 Infinispan 与 JDBC_PING 共享状态，不能用两个 `start-dev` 的本地缓存冒充集群。官方基础镜像、Maven / Java 构建镜像和辅助镜像按 [镜像 manifest](../../scripts/p0/keycloak-email-otp-images.json) 的 digest 固定；结果另外记录 provider JAR 和源文件 SHA-256。

仅 HTTPS 代理和测试所需端口绑定 `127.0.0.1`；数据库不发布宿主机端口。各容器在独立命名的 bridge 网络中，**这不是完整出站网络隔离**。SMTP 捕获器只有内存收件功能，不转发邮件；全部测试地址属于 `example.invalid`，不向真实邮箱发信。

## 2. 挑战与失败规则

1. 输入邮箱后，已存在可用账号、未知账号、停用账号、限流与邮件失败均返回相同验证码页面、提示和 HTTP 状态。没有自动注册或按邮箱自动链接第三方账号；没有证明所有时间侧信道均已消除。
2. `SecureRandom` 生成六位数字，服务端存储 HMAC-SHA256 摘要及邮箱 / 用户 / 到期信息，HMAC 密钥由两个节点共享的临时秘密注入。原验证码仅在发送期间和本地捕获器内存中出现，不写入领域表、报告或自定义日志。
3. 挑战绑定 realm、根认证会话与 tab；使用 Keycloak `SingleUseObjectProvider.remove` 的单次消费语义，先消费再判定。错误或格式非法的提交也消耗该挑战；用户需重新发起，并受发件冷却限制。不能在同一挑战无限试码。
4. 显式检查到期时间，不仅依赖缓存清理。默认有效期 300 秒；本地用 10 秒覆盖过期测试。默认 / 本地发件冷却均为每邮箱 60 秒，并有每 IP 每分钟 30 个发送请求槽位；固定窗口允许边界突发，不宣称是完整风控系统。
5. SMTP 结果确定后对挑战键仅写入一次；失败记录不可登录。发送成功后如事务回滚 / 节点崩溃，已收到的码可能不可用，必须重新发起；不能为此放宽认证条件。邮件发送不是跨 SMTP 与缓存的原子事务。
6. 验证时重新核对用户仍启用且邮箱未变；成功后才设置用户上下文 / 邮箱验证状态。邮箱 OTP 是邮箱控制权的单因素证明，不用它替代 TOTP / WebAuthn 的独立 MFA。
7. 本地 OIDC 客户端用于探针的 Code + S256 PKCE；关闭 Direct Access Grant 与 Full Scope Allowed。P1 的 confidential BFF、会话刷新 / 注销、CSRF 和 ERP 授权仍需单独实施。

## 3. 验证用例与证据

完整清单与逐项结果由 [本地探针报告](../../artifacts/p0/email-otp-probe/result.json) 记录。覆盖固定版本编译 / 装载、双节点组群、A 节点发码 / B 节点认证、Code + PKCE / UserInfo、OTP 与表单重放、授权码重放、错误 PKCE、错误 / 非数字 / 过期码、跨会话、双节点同时消费、分布式发件冷却、SMTP 451、未知 / 停用账号、发码后邮箱变更 / 停用、IP 额度。

本次双节点并发返回一份成功授权结果和一份拒绝响应，测试还对成功授权码执行了 PKCE 交换、UserInfo 身份核对与二次交换拒绝。错误 / 非数字验证码之后使用服务端返回的新表单再提交正确码，仍被拒绝，排除了仅因重用旧表单而失败的误判。

固定运行证据：[结果快照](../../artifacts/p0/email-otp-probe/240daa2bae/result.json)、[Maven 构建](../../artifacts/p0/email-otp-probe/240daa2bae/maven-build.log)、[镜像装载构建](../../artifacts/p0/email-otp-probe/240daa2bae/image-build.log)、[节点 A 日志](../../artifacts/p0/email-otp-probe/240daa2bae/a.log)、[节点 B 日志](../../artifacts/p0/email-otp-probe/240daa2bae/b.log)。最新报告入口重跑时会变化，固定快照用于本轮验收追溯。

失败轮次保留在报告中的运行目录旁，最新结果不覆盖历史目录。构建日志显示 Maven 单元测试未运行；验收证据来自脚本对真实 Keycloak、PostgreSQL、SMTP 和 HTTPS 的集成请求，不能称为已跑 Java 单元测试。

## 4. 复现

从项目根执行，要求 Docker Linux engine、Python 3.14 与网络可下载固定镜像和 Maven 依赖；Java / Maven 在容器内运行。Python 使用独立虚拟环境，避免修改全局包：

```powershell
$otpVenv = Join-Path $env:TEMP ('nexora-p0-otp-python-' + [guid]::NewGuid().ToString('N'))
python -m venv $otpVenv
& (Join-Path $otpVenv 'Scripts/python.exe') -m pip install -r scripts/p0/keycloak-email-otp-python-requirements.txt
& (Join-Path $otpVenv 'Scripts/python.exe') scripts/p0/test_email_otp.py
```

完整命令构建新临时项目 / 镜像，创建独立带本次 run label 的资源；结束时仅清理自己创建的容器、匿名卷和网络，删除临时环境文件 / TLS 私钥。源码快照、Maven 缓存、构建镜像及 Python 虚拟环境保留用于复核，不执行全局 prune，也不修改已存在的其他应用容器。临时 HTTPS 证书被测试客户端显式信任，没有禁用 TLS 证书校验或去掉 Secure Cookie。

报告不包含验证码、access token、管理员密码、HMAC 密钥或 TLS 私钥。SMTP 消息只在捕获器内存中保存，容器清理后消失。重跑会生成新的 run 目录与真实测试结果。

## 5. 已发现的问题与处理

- Docker Desktop 的 internal 网络未提供探针所需的宿主机端口绑定；使用独立 bridge 和回环端口，不把这种本地拓扑登记为生产网络隔离。
- 纯 HTTP 的脚本客户端没有回送 Secure 认证 Cookie，得到 `cookie_not_found`；改用带受信临时证书的本地 HTTPS，保留 Cookie 的安全属性。
- SMTP 451 分支发现 Keycloak 同一事务二次 `put` 抛出 `Can't add session: task in progress for session`；改为发送结果确定后单次写入，失败分支仍返回通用页面，并写入不可认证的挑战。这也是本次必须真实故障注入的原因。

## 6. 后续生产门槛

P0 只确定可执行的本地技术路径。上线前仍需正式 provider 维护 / 许可与升级策略、Keycloak SPI 版本兼容审查、真实 SMTP 的 TLS / 超时 / 配额 / 邮件可达性、受信代理与分布式风控、秘密轮换、审计 / 告警、账号恢复和真实浏览器可用性测试。需另验节点故障、缓存全失 / 网络分区、限流状态丢失后的策略和多站点；本次双节点正常网络的并发成功不等于这些情况已通过。

Google、独立 MFA、Nuxt / BFF、邀请 / 注册和业务权限不在该探针内，继续按 P1 / 既有功能验收项实施。P0-05 的其他外部渠道条件仍单独跟踪。

## 7. 官方依据

- [Keycloak Authentication SPI](https://www.keycloak.org/docs/latest/server_development/)：实现 / 注册 Authenticator 和部署 provider JAR。
- [26.8.2 SingleUseObjectProvider](https://github.com/keycloak/keycloak/blob/26.8.2/server-spi/src/main/java/org/keycloak/models/SingleUseObjectProvider.java)：单次消费接口的并发约束。
- [26.8.2 Infinispan 实现](https://github.com/keycloak/keycloak/blob/26.8.2/model/infinispan/src/main/java/org/keycloak/models/sessions/infinispan/InfinispanSingleUseObjectProvider.java)：实际 `remove` 与事务化 `put` 路径。
- [26.8.2 邮件发送端口](https://github.com/keycloak/keycloak/blob/26.8.2/server-spi-private/src/main/java/org/keycloak/email/EmailSenderProvider.java)：邮件 provider 调用，不复用 TOTP 凭据。
- [集群缓存](https://www.keycloak.org/server/caching)、[容器部署](https://www.keycloak.org/server/containers)：共享缓存与 JAR 在 build 前装载。
