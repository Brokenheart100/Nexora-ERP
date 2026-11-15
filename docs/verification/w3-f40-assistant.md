# W3 F40 AI 助手流式会话、历史、取消 / 恢复与工具审批验收记录

## 范围

- 对应条目：`docs/accountgo-gap-todo.md` F40 AI 助手流式会话、历史、取消 / 恢复与工具审批（`docs/计划.md` 2.2 与 10.8 F40）。
- 目标：网关提供可插拔模型 provider 的 AI 助手协议（本地确定性 stub 默认、OpenAI 兼容端点可配置）；浏览器经 BFF 使用 SSE 流式对话，支持会话历史、生成中取消、从断点恢复、写工具人工审批；会话按工作区与用户隔离并设保留期；工具调用透传调用者令牌、按用户限流；前端提供 AI 助手工作台面板。

## 实现摘要

- 协议与选项：`src/Gateway/Nexora.ApiGateway/Infrastructure/Assistant/AssistantProtocol.cs` 定义端点、SSE 事件、限流策略（`assistant`，按 `sub` 20 次/分钟、队列 0）、会话 TTL（1440 分钟）、消息长度上限（4000）与 `AssistantOptions`（Provider / Model / Endpoint / ApiKey / ChunkDelayMs / SessionTtlMinutes）。
- 会话与存储：`AssistantSession.cs` 保存用户 / 助手 / 工具消息与执行记录；`AssistantStore.cs` 以 Redis 键 `nexora:assistant:session:{id}`、`index:{workspaceId}:{subject}`、`exec:{executionId}`、`cancel:{executionId}` 保存会话与取消标记，按工作区 + 调用者主体隔离，TTL 24 小时。
- 模型 provider：`IAssistantModel.cs` 抽象流式生成；`StubAssistantModel` 为本地确定性实现（每 6 字符一块、60ms 间隔，含「试算」触发只读 `finance_trial_balance`，含「备注」触发需审批的 `session_note`）；`OpenAiAssistantModel.cs` 支持 OpenAI 兼容 `/chat/completions` SSE，由 `Ai__Provider=openai`、`Ai__Endpoint`、`Ai__Model`、`Ai__ApiKey` 配置，密钥只从 AppHost 环境读取。
- 工具与审批：`AssistantTools.cs` 定义 `finance_trial_balance`（透传调用者 Bearer 调用 Finance 试算平衡，摘要「试算平衡（日期，币种）：借方 / 贷方 / 科目数」）与 `session_note`（写工具，必须审批）；未审批不执行。
- 端点：`AssistantEndpoints.cs` 注册 `/api/assistant/workspaces/{workspaceId}/capabilities`、`sessions`（列表 / 详情）、`runs`（SSE）、`executions/{id}/cancel`、`resume`、`approve`、`reject`；全部要求 Web 受众策略，`runs` 额外限流；每个请求先经 Organization 校验工作区访问，会话按工作区与调用者主体隔离。
- 组合根与宿主：`Program.cs` 注册 `AddRedisClient("cache")`、`AddAssistant()`、限流策略并映射端点；`AppHost.cs` 为 gateway 注入 `Ai__Provider`（默认 `stub`）/ `Ai__Model`（默认 `nexora-stub`）/ `Ai__Endpoint` / `Ai__ApiKey`，引用并等待 Redis `cache` 资源。
- 前端：`app/utils/assistantStream.ts` 解析 SSE 分帧与状态文案；`app/components/WorkspaceAssistant.vue` 提供会话历史、消息列表、发送 / 取消 / 恢复生成 / 批准执行 / 拒绝、刷新与新会话，写请求带 CSRF 令牌，取消按钮在收到执行 ID 前禁用；`app/pages/index.vue` 增加「AI 助手」模块与面板；中英文文案补齐。
- 测试：`test/assistantStream.test.ts` 覆盖 SSE 分帧、CRLF / 坏帧、增量拼接与状态标签；`e2e/workspace.spec.ts` 新增 F40 用例（流式输出、取消、恢复、工具审批拒绝 / 批准、试算工具、刷新后历史、跨工作区隔离）。

## 环境与复现

- 修改 C# 后先停止 AppHost 并 `touch` 改动文件再构建（`ops_edit_file` 保留时间戳会让增量构建跳过编译；运行中的进程会锁定输出文件）：

```powershell
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
touch src/Gateway/Nexora.ApiGateway/Infrastructure/Assistant/AssistantEndpoints.cs src/Hosting/Nexora.AppHost/AppHost.cs
dotnet build Nexora.slnx -c Release
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g "AI assistant" --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

- 修改前端源码后重启 AppHost（Nuxt dev 不热更新 `app/` 源码）；默认 `Ai__Provider=stub`，无需外部模型密钥即可验收。Playwright 传参使用 `exec playwright test … -g "…"`，不要经 `pnpm run test:e2e --` 追加参数（会把 `--` 传给 Playwright 并退化为全量套件）。

## 验收断言

| 断言 | 结果 |
| --- | --- |
| 发送消息后 SSE 增量到达，助手消息流式显示本地确定性文本 | 通过（e2e 断言「已收到你的请求」与「这是本地确定性测试模型生成的流式回复」） |
| 生成中取消，消息状态变为「已取消」，出现「恢复生成」 | 通过 |
| 恢复生成从断点续写并完成，状态「已完成」 | 通过 |
| 含「备注」的写工具返回「等待审批」，未批准前不执行 | 通过 |
| 拒绝审批提示「工具调用已拒绝，未执行任何操作。」，无工具结果 | 通过 |
| 批准后提示「工具调用已批准并执行。」，工具结果「会话备注已记录：…」 | 通过 |
| 只读试算工具返回「试算平衡（…，CNY）」 | 通过 |
| 刷新页面后会话历史与消息可重新打开 | 通过 |
| 会话按工作区隔离：第二工作区会话列表为空，用第一工作区会话 ID 发起运行返回 404 | 通过 |
| 聚焦 e2e `AI assistant …` | 1 passed（29.4s；本轮日志为全量套件 [f40-assistant-e2e.log](../../artifacts/w3/f40-assistant-e2e.log)） |
| 完整 workspace + email-onboarding 回归套件 | 27 passed（13.0m，[日志](../../artifacts/w3/f40-assistant-e2e.log)） |
| 静态验证 | `dotnet build` 0 警告 0 错误；typecheck / lint 0 error（既有 Volar 插件告警）；unit 8 文件 42 测试通过；`pnpm build` 成功（[dotnet build](../../artifacts/w3/f40-dotnet-build.log) / [typecheck](../../artifacts/w3/f40-typecheck.log) / [lint](../../artifacts/w3/f40-lint.log) / [unit](../../artifacts/w3/f40-unit.log) / [build](../../artifacts/w3/f40-build.log)） |

## 边界与后续增强

- 默认使用本地确定性 stub 以支持离线验收；OpenAI 兼容 provider 已接线但未在本轮对外部模型服务做真实联调，生产启用需配置 `Ai__Provider=openai`、端点、模型与密钥，并补充失败重试、超时与内容安全策略。
- 会话保存在 Redis，TTL 24 小时；未落库为长期审计，也未接入组织审计查询（F38）或 RCD 变更审计链，助手工具调用仅记录结构化日志。
- 限流为网关单实例固定窗口（按用户 20 次/分钟）；多副本部署需集中式限流。
- 审批仅覆盖当前 `session_note` 写工具；更多写工具（如单据草稿）接入时需按工具声明 `RequiresApproval` 并补充职责分离校验。
- SSE 经 BFF 转发，浏览器断线后不支持服务端重连续传；恢复生成基于已持久化的部分内容与上下文消息，尚不支持同一会话并发运行。
