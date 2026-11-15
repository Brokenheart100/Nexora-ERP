# W3 F41 财务 MCP 查询与调用者权限 / 权益传递验收记录

## 范围

- 对应条目：`docs/accountgo-gap-todo.md` F41 财务 MCP 查询与调用者权限 / 权益传递（`docs/计划.md` 2.2 与 10.8 F41）。
- 目标：网关提供 MCP（JSON-RPC 2.0）只读财务工具集；MCP 客户端通过 Keycloak 标准 device authorization grant（含 PKCE）登录，令牌携带 `nexora.purpose=mcp`；工具调用透传调用者 Bearer 令牌到 Finance，由既有工作区授权链校验权限；Web / CLI 令牌不能调用 MCP，MCP 令牌不能调用 Web / CLI API；撤销后立即失效；提供限流与错误映射。

## 实现摘要

- 工具集：`src/Gateway/Nexora.ApiGateway/Infrastructure/Mcp/McpToolCatalog.cs` 定义四个只读工具——`finance_list_accounts`（科目表）、`finance_trial_balance`（试算平衡）、`finance_financial_report`（四类财务报表）、`finance_list_journals`（总账分录，月份转换为当月 1 日），每个工具带 JSON Schema 参数校验。
- MCP 协议：`McpEndpoints.cs` 在网关暴露 `POST /mcp`，实现 `initialize` / `ping` / `tools/list` / `tools/call`，通知（无 id）返回 202，JSON-RPC 错误码覆盖解析、请求、方法与参数错误；`tools/call` 成功返回 `content` 文本块与 `structuredContent`，失败返回 `isError=true` 与安全化消息（下游错误正文只写日志，截断 300 字符）。
- 调用者身份透传：`McpFinanceTools.cs` 使用 `IHttpClientFactory`（`finance-mcp`，BaseAddress `https+http://finance`）把调用者 Bearer 令牌原样转发给 Finance，Finance 复用现有工作区与财务权限校验；下游 401/403 映射 `Denied`、404 `NotFound`、409 `Conflict`、400/422 `InvalidArguments`、其它 `Unavailable`。
- 受众区分：`CliAuthorization.cs` 增加 `McpOnly` 策略（`nexora.purpose=mcp` 且每次请求经 Keycloak userinfo 在线校验），`WebOnly` 拒绝任何带 purpose 的令牌；`/mcp` 要求 `McpOnly`，`/api/cli/**` 要求 `CliOnly`，其余 `/api/**` 要求 `WebOnly`。声明既支持扁平 `nexora.purpose` 也支持 Keycloak 输出的嵌套声明。
- 限流与日志：`Program.cs` 注册按 `sub`（缺失回退远端 IP）的固定窗口限流（60 次/分钟，队列 0，超限 429）；每次工具调用记录 `tool / workspace / subject / status / elapsedMs` 结构化日志。
- Keycloak：新增公共客户端 `nexora-mcp`（device grant + PKCE S256、`consentRequired=true`、`fullScopeAllowed=false`、默认 scope `basic/profile/email`、可选 scope `nexora.mcp`、`nexora-api` 受众映射器）与 realm scope `nexora.mcp`（同意页文案「读取工作区财务科目、总账与报表（只读）」、硬编码声明映射器 `nexora.purpose=mcp`）。首启用 `src/Hosting/Nexora.AppHost/AppHost.cs` 的 realm JSON 生成，既有库由 `scripts/p1/Configure-EmailOnboarding.ps1` 幂等补齐。
- BFF 与 CLI：`server/utils/bff-cli.ts` 泛化 `cli` / `mcp` 两种 flow；新增 `/bff/auth/mcp`（配置）、`/device`、`/token`、`/revoke`、`/verification`，CLI 仍只访问 BFF；`scripts/p5/nexora-cli.mjs` 支持 `login --client mcp`、`call --path /mcp --method POST --body <json>` 与按 flow 撤销。
- 测试：`src/Web/nexora-web/test/cli.test.ts` 覆盖 MCP scope 与 URL；`e2e/workspace.spec.ts` 新增 F41 用例（MCP 登录、initialize、tools/list、科目与试算调用、与 UI 数据一致、跨工作区拒绝、非法参数、双向受众隔离、撤销立即失效）。

## 环境与复现

- 修改 C# 后先停止 AppHost 并 `touch` 改动文件再构建（`ops_edit_file` 保留时间戳会让增量构建跳过编译；运行中的进程会锁定输出文件）：

```powershell
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
touch src/Gateway/Nexora.ApiGateway/Infrastructure/Mcp/McpEndpoints.cs src/Hosting/Nexora.AppHost/AppHost.cs
dotnet build Nexora.slnx -c Debug
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g "Finance MCP" --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

- 修改前端源码后必须重启 AppHost（Nuxt dev 不热更新 `app/` 源码）；浏览器完成 Keycloak 同意后页面停留在身份服务源，验证 Web 令牌需先回到应用源再发起同源请求。
- 既有库的 Keycloak 客户端与 scope 由 `scripts/p1/Configure-EmailOnboarding.ps1` 在 AppHost 启动时幂等补齐；可用 Admin API `GET /admin/realms/nexora/clients?clientId=nexora-mcp` 核对。

## 验收断言

| 断言 | 结果 |
| --- | --- |
| Keycloak 公共客户端 `nexora-mcp` 与 scope `nexora.mcp` 幂等创建，同意页展示只读范围 | 通过（public / consent / optional scope 与 `nexora-mcp-purpose` 映射器均已核对） |
| MCP 客户端 device grant + PKCE 同意后获得令牌，scope 含 `nexora.mcp` | 通过 |
| `initialize` 返回 `serverInfo.name = nexora-finance-mcp`，`tools/list` 返回四个只读工具 | 通过 |
| `finance_list_accounts` 返回初始化后的起始科目，且与工作台科目表数据一致 | 通过（与 `/bff/api/finance/workspaces/{id}/chart` 科目代码逐项相等） |
| `finance_trial_balance` 返回本位币 CNY 的试算结果 | 通过 |
| 跨工作区工具调用被拒（`isError=true`，不泄露数据） | 通过 |
| 非法参数（非 UUID 工作区）返回 JSON-RPC `-32602` | 通过 |
| MCP 令牌调用 `/api/cli/workspaces` 与 `/api/workspaces` 均 403（受众隔离） | 通过 |
| 撤销后同一 access token 调 `/mcp` 立即 403（网关 userinfo 在线校验） | 通过 |
| 聚焦 e2e `Finance MCP …` | 1 passed（11.1s，[日志](../../artifacts/w3/f41-mcp-e2e.log)） |
| 完整 workspace 回归套件 | 22 passed（11.3m，[日志](../../artifacts/w3/f41-workspace-suite.log)） |
| 静态验证 | `dotnet build` 0 警告 0 错误；typecheck / lint 0 error；unit 7 文件 37 测试通过；`pnpm build` 成功（[typecheck](../../artifacts/w3/f41-typecheck.log) / [lint](../../artifacts/w3/f41-lint.log) / [unit](../../artifacts/w3/f41-unit.log) / [build](../../artifacts/w3/f41-build.log)） |

## 边界与后续增强

- 当前以直接透传调用者 Bearer 令牌实现 on-behalf-of，权限由 Finance 既有授权链校验；尚未接入 token exchange 与计费权益（entitlement）校验，待 F09 / F10 的订阅与权益模型。
- MCP 令牌每次调用都经 Keycloak userinfo 在线校验以换取立即撤销语义，增加一次身份服务往返；高并发场景应加入短 TTL 缓存与失败降级。
- 限流为单实例固定窗口；多副本部署需改用集中式限流（如 Redis）并区分工具与调用者配额。
- 工具仅覆盖四个只读财务端点；采购 / 销售单据查询、多工作区批量查询、MCP resources / prompts / SSE 流式响应未实现。
- MCP 调用审计目前为网关结构化日志；持久化审计与 RCD 变更审计链的合并口径待后续条目。
