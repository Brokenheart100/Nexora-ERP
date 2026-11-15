# P1 Nitro BFF 迁移验收

2026-11-13。BFF 随 Nuxt 的 `web` 资源运行。`server/routes/` 保留 `/bff/*` 及 OIDC 回调，`server/middleware/` 管理响应保护，`server/utils/` 管理登录、Redis 会话与 CSRF，`server/plugins/` 管理 Redis 连接的关闭。[Nuxt 4 server 目录](https://nuxt.com/docs/4.x/directory-structure/server)

YARP API Gateway 继续提供 `https://localhost:7443` 入口。Nitro 校验浏览器会话和写请求的 CSRF，取出 Redis 会话中的访问令牌，再调用网关的 `/api/*`。网关校验 Bearer 令牌，各业务服务执行公司和资源授权。

```powershell
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web exec eslint server e2e/workspace.spec.ts nuxt.config.ts
aspire start --apphost $appHost --non-interactive
aspire wait gateway --apphost $appHost --timeout 180 --non-interactive
pwsh -NoProfile -File scripts/p1/Test-Platform.ps1
pnpm --dir src/Web/nexora-web test:e2e --grep 'direct frontend URL|unexpected antiforgery|OIDC \+ TOTP|after the BFF session is gone|Email registration, company creation|incorrect email registration code|Custom roles keep department|P4 sales, inventory, invoicing'
pnpm --dir src/Web/nexora-web test:e2e --grep 'OIDC \+ TOTP|after the BFF session is gone|unexpected antiforgery|incorrect email registration code'
aspire stop --apphost $appHost --non-interactive
```

- 锁定还原、Release 构建、.NET 31 项测试、前端 4 项单测和改动文件的 ESLint 通过。
- Nuxt 类型检查和 Node 生产构建通过。类型检查输出已有的 Vue Router Volar 插件导出警告。启动 `.output/server/index.mjs` 后检查 `/alive`、匿名 `/bff/me` 和缺少状态的 `/signin-oidc`，分别返回 200、401 和 400。
- 平台检查通过。网关和 Nuxt 的 `/health`、`/alive` 返回 200，网关的匿名 `/bff/me` 返回 401，直接请求 Nuxt 开发端口的 `/bff/me` 返回 404。Aspire 将开发证书配置给 Node，保留 Keycloak 和内部网关连接的 TLS 验证。
- 首轮 9 个浏览器用例通过，覆盖邮箱验证码注册和登录、创建公司、邀请新旧账号、角色范围与越权拦截、OIDC + TOTP、CSRF、两种失效会话下的退出，以及销售、库存、开票、结算和公开发票下载。
- 最后复跑 5 个认证用例，验证错误验证码、异常防伪响应、OIDC + TOTP 和两种失效会话退出。OIDC 用例同时验证缺失状态的回调返回 400，以及退出后重新提交旧会话 Cookie 返回 401。

迁移前的浏览器需要重新登录一次，以建立 Nitro 会话。此次验收使用本地 Aspire 和 Mailpit。生产部署、协调刷新和跨设备撤销由发布计划及 P1-05b 跟踪。
