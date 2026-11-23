# D13 账户安全、设备授权与助手验收

验证日期为 2026-11-22。入口为新版 Dashboard `https://localhost:7444`。真实浏览器使用本地 Aspire、Nitro、Keycloak、Redis、Gateway 和业务服务。助手使用 Gateway 的本地 Stub 提供方。

## 接入范围

| 入口 | 数据与操作 |
| --- | --- |
| 用户菜单 → 安全设置 → 账户概览 | 读取 MFA 能力与验证时间。可进入 Keycloak 账户管理，或调用 Organization 的删除预检查阅公司所有权、最后管理员、个人工作区与记录保留要求。 |
| 用户菜单 → 安全设置 → 登录会话 | 读取本人会话、最近活动、当前会话与空闲策略来源。明确确认后撤销指定会话或其他全部会话，并重新查询实际状态。 |
| `/cli/authorize` 和 `/mcp/authorize` | Vue 展示设备用户码，Nitro 转至 Keycloak 原生批准或拒绝页面。设备客户端使用各自的公开配置、授权请求、令牌轮询与撤销端点。 |
| `/assistant` | 按账户和工作区读取可用能力、历史列表和会话详情。增量显示 SSE，允许停止、恢复和人工批准或拒绝；断线后重新读取已保存的结果。 |

空闲策略取 Organization 返回的最短值。仅可见页面上的真实点击和键盘事件提交活动，读取、定时确认和令牌刷新均保持原活动时间。写请求经同源 CSRF 校验。Redis 更新同时确认会话和登记记录仍有效。

设备短码和批准由 Keycloak 处理。Nitro 按 CLI 或 MCP 绑定 S256 校验值，并按授权有效期保存绑定。CLI 遇到 `slow_down` 增加轮询间隔。CLI 和 MCP 凭据用途由 Gateway 检查，MCP 工具按调用者和资源工作区读取套餐，再按对应模块决定是否调用下游。 [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628.html) · [Keycloak OIDC 端点](https://www.keycloak.org/securing-apps/oidc-layers)

助手确认操作由 Nitro 转发至 Gateway。并发批准或拒绝竞争同一执行时，只接受一项决定。套餐权益和工作区授权由服务端核对。会话记录和流式回执使用当前账号和工作区。

## 本地复现

从仓库根目录运行。邮箱验证码通过本机 Mailpit 捕获，测试工作区和邮箱与业务样例隔离。

```powershell
$nexoraD13Host = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraD13Host --non-interactive
aspire wait gateway --apphost $nexoraD13Host --timeout 180 --non-interactive
$nexoraD13Resource = aspire describe dashboard --apphost $nexoraD13Host --format json --non-interactive | ConvertFrom-Json
$env:NODE_EXTRA_CA_CERTS = $nexoraD13Resource.resources[0].environment.NODE_EXTRA_CA_CERTS
pnpm --dir src/Web/nexora-dashboard test:e2e e2e/d13-account-ui.spec.ts e2e/d13-device-ui.spec.ts e2e/d13-assistant-ui.spec.ts
aspire stop --apphost $nexoraD13Host --non-interactive
pnpm --dir src/Web/nexora-dashboard test:msw e2e/d13-account.msw.spec.ts
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard typecheck
dotnet build src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj -c Release --no-restore
dotnet test tests/Nexora.Tests/Nexora.Tests.csproj -c Release --no-restore --filter 'FullyQualifiedName~SessionPolicyTests|FullyQualifiedName~BillingProrationTests'
```

设备过期使用真实授权有效期验证。提交 S256 校验值后，先用错误校验器检查 `400 invalid_grant`。保持设备未批准，等待响应中的 `expiresIn` 到期，再用原校验器请求令牌，预期 `400 expired_token`。设备码和令牌留在进程或测试的临时授权目录，结果只记录状态码和错误码。

```powershell
try {
    $env:NUXT_PUBLIC_DATA_MODE = 'mock'
    pnpm --dir src/Web/nexora-dashboard build
    $env:NUXT_PUBLIC_DATA_MODE = 'live'
    pnpm --dir src/Web/nexora-dashboard build
} finally {
    Remove-Item Env:NUXT_PUBLIC_DATA_MODE
}
```

## 本地验收结果

| 检查 | 结果 |
| --- | --- |
| 真实 Edge 账户安全 | 2 项通过。验证 Keycloak 账户跳转、MFA 再验证提示、最后管理员阻断、并发初始化 CSRF、会话策略来源和工作区切换。真实活动更新时间，读取与合成事件保持原值。一分钟空闲策略生效。单独撤销和批量撤销后，目标会话的下一次请求返回 `401`。 |
| CLI 与 MCP | 2 项通过。真实批准、拒绝、撤销和令牌用途隔离通过。MCP 可使用获授权的科目表工具，免费套餐下客户发票工具因缺少模块返回 `isError: true`。另实测未批准 CLI 授权在 600 秒到期，错误校验器和过期请求分别得到 `invalid_grant` 与 `expired_token`。 |
| 工作区助手 | 2 项通过。验证 SSE 增量、停止与恢复、批准与拒绝、重复和并发审批返回 `409`、断线回读、跨工作区访问及套餐降级拒绝。 |
| MSW | 1 项通过。覆盖 MFA 能力关闭、再验证入口、删除阻断、会话列表和空闲策略。 |
| 前端 | 40 个文件共 174 项单测通过。Nuxt 类型检查、变更文件 ESLint，以及 mock 和 live 的 Nitro Node 构建均通过。 |
| 后端 | 8 项空闲策略与计费单测通过。AppHost Release 构建通过，0 警告 0 错误。 |

联调完成后通过 Aspire 正常停止本次启动的 AppHost，保留持久卷。外部模型联调及 D14 发布与回退分别记录验收。
