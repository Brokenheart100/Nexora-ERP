# P1 邮箱开通与邀请验收

2026-11-12。本轮采用 AccountGo 的邮箱注册、登录后创建公司及受邀员工加入流程。Keycloak 管理身份，Organization 管理工作区和成员。开发版保留原有密码加 TOTP 入口。

## 用户流程

1. 首页点「邮箱注册」，输入邮箱并填写收到的六位验证码。Keycloak 验证成功后创建账号，BFF 通过现有 OIDC 授权码及 PKCE 建立服务端会话。已有邮箱账号从「登录 Nexora」获取验证码。验证码有效期 5 分钟，每个挑战可提交一次，同一邮箱的发码冷却为 60 秒。
2. 登录后在首页输入企业名称创建工作区。创建者成为工作区 Owner。成员管理中选择角色并填写员工邮箱，Organization 先提交邀请、审计和授权版本，再调用 SMTP 发送邀请链接。
3. 员工打开邮件链接，用受邀邮箱登录或注册，返回邀请页并确认。Organization 校验已验证邮箱、签发方、邀请令牌、有效期和邀请人的当前授权。加入成功后在首页显示该公司。邀请保持原有的 24 小时有效期及单次兑换规则。

邀请链接的令牌位于 URL 片段中，打开页面后移除地址栏中的片段。本标签页使用会话存储保留邀请码以跨越 Keycloak 跳转，兑换成功后清除。SMTP 无法确认时页面保留已创建的邀请和手工分享选项。SMTP 接受记录表示邮件服务器已接收请求，最终送达需用实际服务商和邮箱验证。

## 本地验证

- 使用原有 PostgreSQL 卷启动 AppHost。Keycloak 26.8.2 镜像从固定上游摘要构建，初始化脚本通过管理 API 配置现有 realm 和 BFF 客户端。连续执行配置脚本成功，已有开发身份仍能完成密码加 TOTP 登录。
- SMTP 使用 AppHost 的 Mailpit 容器：容器内 SMTP 端口 `1025`，收件箱 UI `http://localhost:8025`，Mailpit API `http://localhost:8025/api/v1`。测试地址为 `example.invalid`。浏览器测试通过 Mailpit API 读取验证码和邀请链接；收件箱仅绑定本机回环，容器随 AppHost 停止。
- 本轮验证需要 PowerShell 7（`pwsh`）：AppHost 的 `identity-onboarding` 以 `pwsh` 运行 Keycloak 管理 API 配置脚本。
- 浏览器覆盖邮箱注册、创建工作区、发送邮件、新员工注册后入组、已有账号通过验证码登录后入组、错误邮箱拒绝、邀请重放拒绝，以及错误验证码消费挑战。既有入口、TOTP、注销和成员停用回归单独执行。
- 新流程 2 项和既有流程 6 项 Edge 用例通过。Release 构建零警告、零错误，后端测试 31/31，平台就绪及 RabbitMQ 权限检查通过。Nuxt 类型检查和生产构建通过，类型检查仍输出既有的 Vue Router 插件解析警告。
- 迁移到 Mailpit 后复跑 `email-onboarding.spec.ts`：2/2 通过（1.5 分钟，含发码冷却等待）。Mailpit 捕获 7 封邮件（4 封验证码、2 封工作区邀请、1 封登录验证码），`GET http://localhost:8025/api/v1/messages` 可核对。本轮 Nuxt 类型检查退出码为 0，仅输出既有 Vue Router 插件解析警告。

```powershell
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
dotnet build Nexora.slnx -c Release --no-restore
aspire start --apphost $appHost --non-interactive
aspire wait bff --apphost $appHost --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e email-onboarding.spec.ts
pnpm --dir src/Web/nexora-web test:e2e workspace.spec.ts --grep 'BFF entry|unexpected antiforgery|OIDC \+ TOTP|after the BFF session is gone|Workspace invitation'
pwsh scripts/p1/Test-Platform.ps1
aspire stop --apphost $appHost --non-interactive
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
```

外部 SMTP 实际收件、生产部署、SPI 升级策略和邮箱账号的独立 MFA 接入仍由 P1 跟踪。

## Aspire Mailpit 集成复测

2026-11-12，AppHost 使用 `CommunityToolkit.Aspire.Hosting.MailPit` 13.6.1 的 `AddMailPit`。收件箱端口为 `8025`，SMTP 容器端口为 `1025`。运行镜像与仓库固定的 `v1.33.1` 摘要一致。Organization 和 Finance 的本机 SMTP 配置解析到同一个 Mailpit 端点，Keycloak 从容器网络连接该资源。 [Aspire Mailpit 文档](https://aspire.dev/integrations/devtools/mailpit/mailpit-host/)

锁定还原和 Release 构建通过。Mailpit 收件箱、`/livez` 和 `/readyz` 均返回 200。复跑 `email-onboarding.spec.ts`，两项 Edge 用例通过，覆盖从 Mailpit 读取验证码、从邀请邮件注册或登录后加入公司，以及错误验证码失效。本轮核对了 Finance 的 SMTP 配置。
