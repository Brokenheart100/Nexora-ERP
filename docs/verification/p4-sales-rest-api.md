# P4 销售订单 REST API 规范化

2026-11-15。首批覆盖销售订单创建、报价转单和 Sales 的应用异常映射。沿用 `/api/sales/workspaces/{workspaceId}/orders` 及现有 JSON 请求和响应字段。

| 接口或场景 | 契约 |
| --- | --- |
| `POST /orders` 创建报价或订单 | `201 Created`，`Location` 指向相应的订单详情，正文仍是 `id` 和 `version` |
| `POST /orders/{id}/convert` 报价转单 | `201 Created`，`Location` 指向新生成的订单 |
| 用原 `operationId` 重复同一创建或转单 | 返回相同的 `201`、位置和结果 |
| 同一 `operationId` 携带不同命令内容 | `409`，`code` 为 `sales.idempotency_conflict` |
| 正文 `expectedVersion` 与当前版本不匹配 | `409`，`code` 为 `sales.version_conflict` |
| 单据状态与请求不兼容 | `409`，`code` 为 `sales.state_conflict` |

Sales 应用异常响应提供 `application/problem+json`、`code` 和 `traceId`。浏览器通过 `/bff/api/*` 调用时，Nitro 将 `201` 返回的相对 `/api/*` 位置映射为 `/bff/api/*`。便于客户端沿用相同的会话入口读取新资源。 [HTTP 201](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.2) · [Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html)

## 请求头与正文兼容

- `GET /orders/{id}` 返回带引号的强 `ETag`，表示当前调用者看到的订单详情。客户端应原样保存和发送。有效的 `If-None-Match` 命中时返回 `304` 和当前 ETag。详情中 `isMaker` 不同时使用不同 ETag。
- 编辑、审批等决策、报价转单、履约许可签发、取消和关闭可通过 `If-Match` 校验所属订单。支持单个强标签、多个候选和单独的 `*`。弱标签不满足强比较。服务在工作区和资源权限校验后持有订单行锁，再核对前置条件。有效但不匹配的请求返回 `412` 和 `sales.precondition_failed`，格式非法返回 `400`。
- 既有客户端可以继续使用正文 `expectedVersion`，过期时沿用 `409 sales.version_conflict`。同时提供版本正文和请求头时，两项条件都须满足。
- 销售订单的七个写端点接受 `Idempotency-Key`。要求一个非空 UUID，支持带引号和现有客户端常用的不带引号形式。正文 `operationId` 仍可单独使用，同时提供时两者须相同。两种输入共用应用事务中的操作锁、审计指纹和结果回执，同一个具体版本可以跨正文和请求头重放。已成功的匹配操作重放原结果。
- Nitro 转发请求头，使用同一个 UUID 为销售创建预留单据配额。缺少可用头值、头与正文标识不一致等无效头请求在预留前拒绝。只提供旧正文时沿用现有调用方式。

[HTTP 强匹配与前置条件](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1) · [Idempotency-Key 草案](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)

## 本地复现

```powershell
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web exec eslint 'server/routes/bff/api/[...path].ts' e2e/workspace.spec.ts
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait gateway --apphost $appHost --timeout 180 --non-interactive
aspire describe sales --apphost $appHost --non-interactive
pnpm --dir src/Web/nexora-web test:e2e --grep 'P4 sales, inventory, invoicing|Billing plans enforce quotas|Custom roles keep department'
aspire stop --apphost $appHost --non-interactive
pnpm --dir src/Web/nexora-web build
```

使用 `aspire describe sales` 显示的 HTTPS 地址读取 `/openapi/v1.json`。核对 200 / 304 的 `ETag`、201 的 `Location`、七个写端点的 `Idempotency-Key`、六个订单变更端点的 `If-Match` 和 412 的 ProblemDetails schema。此端点由 Sales 在开发环境映射。

## 结果

- 锁定还原、Release 构建通过，零警告、零错误。55 项 .NET 测试通过。
- Nuxt 类型检查与生产构建通过，类型检查仍有既有的 Vue Router Volar 插件提示。改动文件的 ESLint 通过。
- Sales 正常启动，运行时 OpenAPI 返回 200，创建及转单的 `201` JSON schema 均存在。
- P4 浏览器回归通过。经 Nitro 和 YARP 核对 `201`、可访问的位置、重放结果、幂等冲突、旧版本拒绝和失败后的版本，并完成后续库存、开票、核销与通信链路。
- 部门与仓库权限、订阅配额与模块门禁两个浏览器用例通过。权限用例首轮在等待注册页链接时超时，复跑通过。

### 请求头回归

- 最终锁定还原与 Release 构建通过，零警告、零错误。55 项 .NET 测试通过。改动文件的 ESLint、Nuxt 类型检查与生产构建通过，类型检查仍有既有的 Vue Router Volar 插件提示。
- 运行时 OpenAPI 校验通过。七个写端点包含 `Idempotency-Key` 和 `409` ProblemDetails schema。六个变更端点包含 `If-Match` 和 `412` ProblemDetails schema。订单详情的 `200`、`304` 包含 `ETag`，创建的 `201` 包含 `Location`。
- P4 销售闭环通过。两个并发编辑使用同一个强 ETag，分别返回 `200`、`412`，且版本只推进一次。旧正文能重放已生效的编辑和转单。弱标签、其他表示和其他订单的标签触发 `412`，有效列表和 `*` 可操作，非法标签及无效或不一致的幂等键返回 `400`。
- `If-None-Match` 命中返回 `304`。销售创建只提供请求头时占用一张单据配额，重放不重复占用。旧正文及请求头在配额已满时都被拦截。销售到库存、应收和总账，以及计费配额、部门与仓库权限合计三个浏览器场景通过。权限场景首轮等待注册页超时，独立复跑通过。

## 后续范围

销售列表分页及其他业务服务的状态码、请求头、错误和 OpenAPI 一致性按 [REST API 规范化 TODO](../计划.md#rest-api-规范化-todo按服务) 跟踪。
