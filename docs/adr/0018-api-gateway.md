# ADR 0018 — 独立 API Gateway

日期 2026-11-12。状态 已实施。

`Nexora.ApiGateway` 是独立 ASP.NET Core 项目，使用 YARP 提供应用的 HTTPS 入口。网关持有业务 API 的路由表，按路径将请求转发至业务服务或 Nuxt。Keycloak 登录、注销及回调沿用同一入口地址。

| 入口 | 处理方式 |
| --- | --- |
| `/bff/*` 与 OIDC 回调 | 转发到 Nuxt Nitro，传递浏览器 Cookie，由 Nitro 处理 OIDC、会话、注销和 CSRF |
| `/bff/api/*` | Nitro 校验会话及适用的 CSRF，使用服务端 Bearer 令牌调用网关的 `/api/*` |
| `/api/*` | 网关校验 Keycloak 签发的 `nexora-api` 受众 Bearer 令牌，再按路径转发。服务继续执行资源和工作区授权 |
| `POST /public/invoice-pdf` | 转发到 Finance，由 Finance 验证分享凭据 |
| 页面和静态资源 | 转发到 Nuxt |

网关在浏览器会话路由上移除客户端提交的 `Authorization`，在业务 API 路由上移除 Cookie 与 CSRF 请求头。Nitro 从 Redis 服务端会话取访问令牌。网关就绪检查 Nuxt 和业务服务，Nuxt 就绪检查 Redis 与 Keycloak。Aspire 将网关标为应用外部入口，向 Nitro 注入固定的网关地址与会话配置。

架构变更增加一次 BFF 回到网关的请求，使业务路由和 Bearer 入口策略集中维护。生产入口部署与容量验收继续由发布计划跟踪。[网关验收](../verification/p1-api-gateway.md) · [Nitro BFF 迁移验收](../verification/p1-nitro-bff.md)
