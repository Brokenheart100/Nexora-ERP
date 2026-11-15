# W3 F39 CLI 登录授权、同意 / 拒绝与令牌撤销验收记录

## 范围

- 对应条目：`docs/accountgo-gap-todo.md` F39 CLI 登录授权、同意 / 拒绝与令牌撤销（`docs/计划.md` 2.2 与 10.8 F39）。
- 目标：命令行工具通过 Keycloak 标准 device authorization grant（含 PKCE）登录，浏览器完成同意或拒绝；CLI 令牌只能调用受限只读 API，Web 会话令牌不能调用 CLI API；撤销后令牌立即失效。

## 实现摘要

- Keycloak 客户端与 scope：`nexora-cli` 为公共客户端，启用 device grant（`oauth2.device.authorization.grant.enabled`）与 PKCE S256，`consentRequired=true`、`fullScopeAllowed=false`，默认客户端 scope 为 `basic / profile / email`（提供 `sub` 等身份声明），可选 scope `nexora.cli` 携带同意页文案「读取当前用户可访问的工作区（只读）」、硬编码声明映射器 `nexora.purpose=cli`（Keycloak 输出为嵌套声明 `nexora.purpose`）与 `nexora-api` 受众映射器。首启用 `src/Hosting/Nexora.AppHost/AppHost.cs` 的 realm JSON 生成，既有库由 `scripts/p1/Configure-EmailOnboarding.ps1` 幂等补齐。
- BFF：`server/utils/bff-cli.ts` 实现 device 授权、令牌交换与撤销；`/bff/auth/cli`（配置）、`/bff/auth/cli/device`、`/bff/auth/cli/token`、`/bff/auth/cli/revoke`、`/bff/auth/cli/verification` 由 Nitro 服务端代理 Keycloak，CLI 只访问 BFF，不处理自签证书。
- 网关受众区分：`src/Gateway/Nexora.ApiGateway/Infrastructure/Authorization/CliAuthorization.cs` 定义 `CliOnly` / `WebOnly` 策略；`/api/cli/{**rest}` 以 order 0 转发 Organization 并要求 CLI 令牌，其余 `/api/**` 仅接受 Web 令牌。CLI 令牌每次请求经 Keycloak userinfo 在线校验，撤销后立即 401；声明既支持扁平 `nexora.purpose` 也支持 Keycloak 输出的嵌套 `nexora.purpose`。
- Organization：新增 `GET /api/cli/workspaces`（策略 `cli`，要求 `nexora.purpose=cli`），复用 `WorkspaceQueries.ListAsync` 返回当前用户可访问工作区，只读。
- 前端：新增 `app/pages/cli/authorize.vue`（`/cli/authorize?user_code=...`），展示用户码并跳转身份服务设备验证页；同意 / 拒绝使用 Keycloak 标准 consent 页。
- 示例 CLI：`scripts/p5/nexora-cli.mjs`（零依赖 ESM），`login` 生成 48 字节 verifier 与 S256 challenge、轮询令牌并写入 `$NEXORA_CLI_HOME/tokens.json`；`call --path` 携带令牌调用 API；`logout` 同时撤销 refresh 与 access 令牌并删除本地令牌文件。输出 JSON 行供测试与脚本解析。
- 测试：`src/Web/nexora-web/test/cli.test.ts` 覆盖 verifier / challenge 校验、scope 与 URL 构造、device 视图；`e2e/workspace.spec.ts` 新增 CLI 授权用例（同意、受限调用、双向受众隔离、撤销立即失效、拒绝路径）。

## 环境与复现

- 修改 C# 后先停止 AppHost 并 `touch` 改动文件再构建（`ops_edit_file` 保留时间戳会让增量构建跳过编译；运行中的进程会锁定输出文件）：

```powershell
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
touch src/Gateway/Nexora.ApiGateway/Infrastructure/Authorization/CliAuthorization.cs
dotnet build Nexora.slnx -c Release
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g "CLI device authorization" --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

- 修改前端源码后必须重启 AppHost（Nuxt dev 不热更新 `app/` 源码）；浏览器完成 Keycloak 同意后页面停留在身份服务源，验证 Web 令牌需先回到应用源再发起同源请求。

## 验收断言

| 断言 | 结果 |
| --- | --- |
| Keycloak 标准 device authorization grant + PKCE：缺少 challenge 拒绝，verifier 长度受限 | 通过 |
| 同意页展示只读 scope 文案，同意后 CLI 获得令牌 | 通过 |
| 拒绝路径：点击取消后 CLI 收到 `access_denied` | 通过 |
| CLI 令牌调用 `GET /api/cli/workspaces` 返回 200 且包含本工作区 | 通过 |
| Web 会话令牌调用 `/bff/api/cli/workspaces` 返回 403（受众隔离） | 通过 |
| CLI 令牌调用普通 `GET /api/workspaces` 返回 403（受众隔离） | 通过 |
| 撤销后同一 access token 立即失效（403） | 通过（网关 userinfo 在线校验） |
| 聚焦 e2e `CLI device authorization …` | 1 passed（30.2s，[日志](../../artifacts/w3/f39-cli-e2e.log)） |
| 完整 workspace 回归套件 | 21 passed（11.1m，[日志](../../artifacts/w3/f39-workspace-suite.log)） |
| 静态验证 | `dotnet build` 0 警告 0 错误；`dotnet test` 31 通过；typecheck / lint 0 error；unit 7 文件 36 测试通过；`pnpm build` 成功（[typecheck](../../artifacts/w3/f39-typecheck.log) / [lint](../../artifacts/w3/f39-lint.log) / [unit](../../artifacts/w3/f39-unit.log) / [build](../../artifacts/w3/f39-build.log) / [Debug 构建](../../artifacts/w3/f39-dotnet-debug.log)） |

## 边界与后续增强

- CLI 令牌通过 userinfo 在线校验换取立即撤销语义，每次 CLI 请求增加一次身份服务调用；高并发场景应加入短 TTL 缓存与失败降级策略。
- 当前只读 scope 固定为工作区列表；后续按用途拆分 scope（如报表只读、MCP 工具调用）并复用同一受众区分机制。
- CLI 尚未签名分发与自动更新，也未实现 device flow 客户端侧限流；生产发布需补充分发渠道与升级检查。
- 撤销语义依赖 Keycloak 会话与令牌撤销端点；离线校验模式（仅 JWT 验签）不具备立即失效能力，不在本验收范围。
