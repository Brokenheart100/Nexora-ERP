# P1 独立 API Gateway 本地验收

2026-11-12。`Nexora.ApiGateway` 是独立的 Aspire 项目资源 `gateway`。网关使用 YARP 在 `https://localhost:7443` 统一接入 Nuxt、浏览器会话和业务 API。BFF 的开发端口由 Aspire 分配。

下文记录独立 ASP.NET Core BFF 时的验收。当前结构和运行命令见 [Nitro BFF 迁移验收](p1-nitro-bff.md)。

浏览器请求 `/bff/api/*` 时，网关将请求交给 BFF。BFF 校验浏览器会话及写请求的 CSRF，再用服务端访问令牌调用网关的 `/api/*`。网关使用 Keycloak JWT Bearer 校验签发方、受众和时效，再将请求交给相应的业务服务。工作区权限由业务服务校验。公开发票下载转发至 Finance，由其校验分享凭据。[架构决策](../adr/0018-api-gateway.md) · [YARP 路由授权](https://learn.microsoft.com/aspnet/core/fundamentals/servers/yarp/authn-authz)

```powershell
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
aspire start --apphost $appHost --non-interactive
aspire wait gateway --apphost $appHost --timeout 180 --non-interactive
pwsh scripts/p1/Test-Platform.ps1
pnpm --dir src/Web/nexora-web test:e2e --grep 'BFF entry|OIDC \+ TOTP|after the BFF session is gone|P4 sales|Email registration|incorrect email'
aspire stop --apphost $appHost --non-interactive
```

AppHost 配置网关和 BFF 的 `/health` 探测。网关检查 BFF 和上游服务就绪，BFF 只检查网关的 `/alive`。网关启动后 BFF 可以启动，避免等待双方就绪形成循环。

- 锁定还原与 Release 构建通过，零警告、零错误。Aspire 冷启动期间观察到网关已运行、BFF 等待身份初始化时网关尚未就绪。BFF 启动后，两个资源都达到健康状态。
- 平台基线通过。网关和 BFF 的 `/health`、`/alive` 返回 200，匿名访问 `/api/workspaces` 和 `/bff/api/workspaces` 返回 401，七个服务的独立连接引用与四项 AMQP 权限检查通过。
- 七个浏览器场景通过，覆盖邮箱注册、邮件邀请、错误验证码、前端入口、密码加 TOTP、CSRF、工作区隔离、两种失效会话下的退出，以及销售、库存、开票、结算和公开发票下载。首轮有六个用例通过，登录用例发现浏览器 API 响应存在重复的 `no-store`。修正 BFF 响应头写入时机后，重启并复跑该用例通过。登录会话访问直接 `/api/workspaces` 返回 401，访问 `/bff/api/workspaces` 时客户端提交的 Bearer 值被移除，业务响应带单个 `no-store`。
- 主动停止 BFF 的组合命令被本机执行工具策略拒绝。本次通过冷启动状态转换和平台健康探测核对就绪行为。生产部署及故障演练继续跟踪。
