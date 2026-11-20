# Nexora Dashboard

Nuxt 4、Vue 3、Nuxt UI 与 Carbon 主题。保留用户已有的原型界面；另写的替代 UI 已删除。源码入口恢复为 `app.vue → NuxtLayout → NuxtPage`，布局位于 `app/layouts/default.vue`。

## 当前页面与服务

| 入口 | 当前用途 |
| --- | --- |
| `http://localhost:3001` | 原有完整 UI、原型交互与模拟数据 |
| `http://localhost:3003` | 相同原型 UI，加上保留的 MSW 网络拦截基础；页面尚未通过 handlers 取数 |
| `https://localhost:7444` | Aspire 承载的原型页面及独立 Nitro BFF 基础；原页面尚未接入真实业务数据 |

原型的模拟说明和演示身份保留。运行时 BFF 配置为 live 不代表页面已完成真实数据接入。当前不再提供另一套 Live 业务界面，下一步按原页面进行数据适配。

```powershell
pnpm --dir src/Web/nexora-dashboard install --frozen-lockfile
pnpm --dir src/Web/nexora-dashboard dev
# 可选：验证 MSW 网络拦截基础
pnpm --dir src/Web/nexora-dashboard dev:msw
```

## 保留的接入基础

`server/` 中的 OIDC、服务端 Redis 会话、CSRF、MFA 与固定 Gateway 转发保留。API 客户端、响应类型、版本及幂等处理、未知写入恢复、MSW handlers 和网络测试继续保留，等待接入原有页面。

BFF 私有配置为 `NUXT_BFF_ISSUER`、`NUXT_BFF_CLIENT_SECRET`、`NUXT_BFF_SESSION_KEY`、`NUXT_BFF_REDIS_URL`、`NUXT_BFF_GATEWAY_URL`。`NUXT_PUBLIC_DATA_MODE=live` 与 `NUXT_PUBLIC_BFF_ORIGIN` 用于已有独立 BFF 运行环境；缺少私有配置时仍拒绝启动。令牌保存在服务端加密会话，业务调用使用同源 `/bff/api/*`。

```powershell
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
```

## 构建与验证

```powershell
pnpm --dir src/Web/nexora-dashboard lint
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard test:msw
pnpm --dir src/Web/nexora-dashboard test:e2e --grep '原有 UI'
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
try { pnpm --dir src/Web/nexora-dashboard build }
finally { Remove-Item Env:NUXT_PUBLIC_DATA_MODE }
```

默认构建输出 `.output/`，BFF live 配置构建输出 `.output-live/`；开发输出独立，分别为 `.output-dev/` 与 `.output-live-dev/`。MSW 仅允许显式 mock 开发环境，未知 BFF 模拟请求返回 501。

其余 `test:e2e` 保留独立 BFF、会话与 API 契约检查，需要指定 AppHost、D0 本地开发样例、Mailpit 和受保护的开发凭据。它们不再依赖已删除界面的用户标签与工作区菜单。专属替代 UI 的浏览器测试已删除，原界面的真实业务验收需重新完成。

本轮临时启动的验证 AppHost 在结束后正常停止，保留数据卷。详细状态见 [替代 UI 删除记录](../../../docs/verification/dashboard-replacement-ui-removal.md)；[接入 TODO](../../../docs/ui-dashboard-api-integration-todolist.md) 以原有界面接入为验收依据，旧报告仅为历史证据。
