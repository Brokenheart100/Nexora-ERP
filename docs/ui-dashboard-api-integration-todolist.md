# Nexora Dashboard 后端接入 TODO

2026-11-20 · 本清单仅规划 `src/Web/nexora-dashboard/` 的独立接入。按用户要求已删除另写的替代 UI，恢复原有页面与模拟数据；保留 D0 基线、独立 BFF、请求客户端和 MSW 基础。原有界面的真实接入尚待完成，D1 的相关验收及 D2–D4 已恢复待完成。[删除记录](verification/dashboard-replacement-ui-removal.md) · [D0 记录与缺口](verification/dashboard-d0-baseline.md)

依据 [纯 UI 待办](ui-dashboard-backend-todolist.md) · [原型验收记录](verification/web-ui-dashboard-prototype.md) · [Nexora 架构](架构.md#13-nuxt-4-前端架构) · [实施计划](计划.md) · [P0 业务政策与算例](domain/p0-policies.md)

## 1. 接入架构

```text
浏览器 ── 新版 HTTPS 入口 ──> nexora-dashboard 页面与同源 Nitro BFF
Nitro BFF ── 服务端 Bearer ──> Gateway /api/* ──> 所属业务服务
```

- 新版用自己的项目目录、依赖锁文件、运行配置、HTTPS 入口和部署产物。页面沿用 Nuxt UI 与 Carbon 主题，Nitro BFF 在本项目的 `server/` 内承载。后端依赖通过现有 Gateway 和发布的业务 API 使用。[Gateway 路由](../src/Gateway/Nexora.ApiGateway/Infrastructure/Proxy/GatewayProxy.cs) · [BFF 决策](adr/0009-oidc-bff.md) · [Nuxt 客户端决策](adr/0010-nuxt-client.md)
- 页面和组件管理交互。按业务拆分的客户端与 composable 管理类型、请求和加载状态。Pinia 保留当前工作区、会话摘要、筛选偏好和需要跨页恢复的交互状态。正式库存、金额、权限和流程状态由所属服务返回。
- 模拟预览和真实联调使用独立运行配置。模拟模式复用 `app/mocks/`，真实模式只显示服务端数据、空态、错误态或待接入提示。两种模式共用 Nuxt UI 的布局、表格、表单、抽屉和反馈组件。

### 1.1 Nuxt 4 目录与职责

路径以 `src/Web/nexora-dashboard/` 为根。D1、D2 按职责补齐缺少的文件。

| 目录 | 职责 |
| --- | --- |
| `app/pages/`、`app/layouts/`、`app/components/` | 文件路由、布局及 Nuxt UI 界面。 |
| `app/composables/`、`app/types/`、`app/stores/`、`app/mocks/` | 按业务域组织请求和交互逻辑、页面类型、UI 状态及本地模拟数据。 |
| `app/middleware/` | 页面导航、登录引导和权限提示。会话、写入及资源授权由服务端校验。 |
| `server/routes/`、`server/middleware/`、`server/utils/`、`server/plugins/` | Nitro 路由、请求上下文、OIDC、会话、CSRF、代理工具及 Redis 连接生命周期。 |
| `shared/types/`、`shared/utils/` | 按需放 Vue 与 Nitro 都使用的类型和纯函数，保持独立于两个运行时。 |
| `public/`、`nuxt.config.ts` | 原路径公开的静态资源，以及项目级运行配置与构建设置。 |

Vue 和 Nitro 各自维护运行时专用代码。两端交互通过 HTTP 和按需共享的纯类型完成。[Nuxt 目录结构](https://nuxt.com/docs/4.x/directory-structure) · [页面中间件](https://nuxt.com/docs/4.x/directory-structure/app/middleware) · [Shared 目录](https://nuxt.com/docs/4.x/directory-structure/shared)

### 1.2 Nitro 路由映射

`server/routes/` 注册原路径，`server/api/` 自动加 `/api` 前缀。新版的 `/bff/*`、OIDC 回调和公共分享走 `server/routes/`，用 `defineEventHandler` 注册处理器。单一方法通过文件名的 `.get.ts`、`.post.ts` 约束，业务代理按契约验证允许的方法和路径。[Nuxt 服务端路由](https://nuxt.com/docs/4.x/directory-structure/server#server-routes)

| 计划文件 | 对应入口 |
| --- | --- |
| `server/routes/bff/me.get.ts` | `GET /bff/me` |
| `server/routes/bff/api/[...path].ts` | 同源 `/bff/api/*`，由 Nitro 转发到允许的 Gateway 业务路由。 |
| `server/routes/signin-oidc.get.ts` | `GET /signin-oidc` |
| `server/routes/health.get.ts`、`server/routes/alive.get.ts` | `GET /health`、`GET /alive` |
| `server/routes/public/invoice-pdf.post.ts` | D9 的 `POST /public/invoice-pdf`，使用现有公开下载契约。 |

### 1.3 运行配置与构建产物

- 在 `nuxt.config.ts` 声明私有 `runtimeConfig`，Nitro 用 `useRuntimeConfig(event)` 读取。Gateway 地址、OIDC 客户端密钥、Redis 地址和会话密钥由部署注入与键匹配的 `NUXT_*` 环境变量。例如 `runtimeConfig.bff.gatewayUrl` 对应 `NUXT_BFF_GATEWAY_URL`。只有可发送给浏览器的设置放入 `runtimeConfig.public`。[Nuxt 运行时配置](https://nuxt.com/docs/4.x/guide/going-further/runtime-config)
- 真实联调入口在部署时显式选择真实数据源，启动时校验所需配置。纯 UI 预览继续使用模拟数据。真实入口缺少配置时呈现不可用状态，供验收定位。
- 接入阶段按仓库 ADR 验收后台的客户端渲染设置 `ssr: false`，页面和 Nitro BFF 仍随同一新版应用部署。使用 `nuxt build` 的 `node-server` 输出，部署完整 `.output/` 并运行 `.output/server/index.mjs`。部署环境在启动进程时注入生产设置与密钥，本地 `.env` 用于 Nuxt CLI 开发配置。[渲染模式](https://nuxt.com/docs/4.x/guide/concepts/rendering#client-side-rendering) · [Node 部署](https://nuxt.com/docs/4.x/getting-started/deployment#nodejs-server) · [CSR 决策](adr/0010-nuxt-client.md)

## 2. HTTP 接入契约

以下业务路由用 API 端点路径表示。新版浏览器从新版入口同源访问 `/bff/api/*`，如 `GET /bff/api/workspaces`，由新版 Nitro 调用 Gateway 的对应 `/api/*`。会话与回调来自新版入口。公共发票通过 `POST /public/invoice-pdf` 下载。

| 场景 | 接入要求 |
| --- | --- |
| 页面请求 | 首次读取用 `useFetch` 或 `useAsyncData`。需要复用业务客户端时，用 `useAsyncData` 管理只读查询及其加载、失败和刷新状态。提交、审批与保存由用户动作调用封装的 `$fetch`，写入保持 `retry: 0`。浏览器统一使用 `/bff/api/*` 相对路径。[Nuxt 数据请求](https://nuxt.com/docs/4.x/getting-started/data-fetching) |
| 创建和异步处理 | `201` 表示创建了资源或任务，按返回的 ID 与 `Location` 回查。采购收货许可、销售履约许可和工作区投影的 `202` 使用同源 `Location` 查询。许可列表按本次返回的许可 ID 对照，投影遵循 `Retry-After`。按终态、超时预算或取消停止轮询，超出等待预算时保留查询入口。部分导入预览用 `200` 返回待修正问题，按校验明细及预览 ID 决定是否开放提交。 |
| 幂等写入 | 支持 `Idempotency-Key` 的端点使用每次操作独立的 UUID，其余沿用该端点的 `operationId` 等约定。头和正文并存时一致。关闭写请求自动重试。遇到断网、超时或响应丢失时标记结果待确认，先读回资源或操作结果。仅在端点支持幂等且用户明确重试同一份提交时，复用原键和原请求。 |
| 版本与冲突 | 保存读取时的 `ETag` 或 DTO 的版本。按端点契约发送原样 `If-Match`，或使用 `expectedVersion`、`expectedRevision`、`expectedSequence` 等前置条件。Sales 的订单标签按原值透传。区分版本失效、幂等键冲突和业务状态冲突，保留表单并回读当前记录，由用户核对后决定下一步。 |
| 数字和日期 | 金额和数量用十进制字符串传输。服务返回的税额、舍入、未结余额与成本用于正式展示。区分工作区本位币、业务日期 `YYYY-MM-DD` 与服务端 UTC 时间。 |
| 列表与收敛 | 按端点支持的筛选和分页参数翻页，适配数组、`items/hasMore` 等返回形状。当前页筛选须标明范围。审批、收发货和过账后重新读取相关详情及列表。报表按照服务端期间与过账水位核对。 |
| 会话与权限 | `401` 引导恢复会话。可识别的 MFA 提示走现有重新验证入口，验证后重新读取当前状态。普通 `403` 提示权限不足，按资源隐藏策略返回的 `404` 显示不可访问。角色、数据范围和模块权益按服务返回值展示。 |
| 其他错误 | 区分业务 API 的 `ProblemDetails` 与 Nitro 的会话、CSRF、MFA 错误响应。字段错误回填表单，适用时显示用于查日志的 `traceId`。限流按响应提示恢复读取，依赖不可用和意外响应保留输入，按幂等契约处理结果待确认的写入。 |
| CSV、PDF 与事件流 | 保留类型、文件名和传输语义。同源下载或预览先判断状态与内容类型，退出预览时释放临时文件 URL。助手流按 SSE 事件读取，区分断线、等待审批及执行错误。公共分享用受控令牌换取 PDF。 |

契约以当前端点、生成的 OpenAPI 与实际响应为准。[REST 契约验收基线](verification/rest-api-normalization.md) · [头字段规范化](../src/Hosting/Nexora.ServiceDefaults/Http/ApiIdempotency.cs) · [Sales 条件请求](../src/Services/Sales/Nexora.Sales.Api/Contracts/Requests/SalesOrderHeaders.cs)

## 3. 执行顺序

| 优先级 | 待办 | 首个可验收结果 |
| --- | --- | --- |
| 1 | [D0–D3](#d0-确认接入范围与联调基线) | 界面确认后，用真实身份登录、切换工作区、读取受限业务清单。 |
| 2 | [D4–D6](#d4-采购到付款) | 先走通采购到付款，再走通销售到收款，随后验退货、盘点和在途调拨。 |
| 3 | [D7–D9](#d7-总账期初与外部凭证) | 完成期初与凭证、银行作废和对账、捐赠收据、定期开票与发票交付。 |
| 4 | [D10–D11](#d10-税务与申报) | 核对税务历史、报表、账龄、导出和工作台投影。 |
| 5 | [D12–D14](#d12-组织计费与审计) | 完成管理员与辅助流程，验证新版独立发布、版本回退及待处理动作恢复。 |

采购、销售先从已初始化的联调账簿、资金账户和授权样例起跑。新建账簿、期初切账及全部治理功能由后续波次验收。

## 4. 分阶段待办

下文用 `P`、`S`、`I`、`F`、`M` 表示 `/api/{service}/workspaces/{workspaceId}`，对应 `purchasing`、`sales`、`inventory`、`finance`、`masterdata`。`O` 表示 `/api/workspaces/{id}`。每个阶段先核对所列路由的 DTO、错误和前置条件，再通过正常页面入口验收。

### D0 确认接入范围与联调基线

- [x] D0-01 记录界面确认范围及新版提交标识。已记录 `eb06469` 加当前工作树指纹，逐项核对 C1–C23 的 67 个原型子项、界面承载与后续阶段；本次未将原型验收当作真实业务验收。[范围与版本](verification/dashboard-d0-baseline.md#1-界面范围与版本)
- [x] D0-02 按 README 准备本地开发配置和专用联调工作区。Gateway、七个业务服务、Keycloak、Redis、八个业务/身份数据库与 RabbitMQ 就绪，平台探针及 4 项 AMQP 权限探针通过。专用样例覆盖制单、独立复核、仓库收货人、只读成员和不可见工作区；已初始化账簿、期间、科目映射、银行及主数据，并记录权限范围和套餐。[环境与样例](verification/dashboard-d0-baseline.md#2-联调环境与专用样例)
- [x] D0-03 跑通现有 OpenAPI 样例检查，采集七个服务的 243 个操作与首波 BFF 实际响应，记录方法、DTO、分页、权限、写入头、状态、媒体类型及来源。Organization 创建响应与 Finance setup schema 的缺口已记录归属、影响和可用读取路径；新版 BFF 的逐波响应由 D1–D14 各自验收。[契约基线](verification/dashboard-d0-baseline.md#3-契约基线与缺口)
- [x] D0-04 按现有 ESLint 规则修正 13 个 UI 文件的模板格式，`pnpm --dir src/Web/nexora-dashboard lint` 复验通过；全部 111 个 Vue 文件的非空白内容摘要保持一致。[质量门禁](verification/dashboard-d0-baseline.md#4-验证结果与边界)

2026-11-20 清理状态：按用户要求删除替代 UI，恢复原有文件路由和布局。BFF、请求客户端、MSW 与业务契约代码保留；原页面仍使用模拟数据。下方涉及原界面真实接入的条目已恢复待完成。详见 [替代 UI 删除记录](verification/dashboard-replacement-ui-removal.md)。

### D1 新版独立 Nitro BFF 与登录会话

依赖 D0。

- [x] 按 1.1、1.2 在新版 `server/` 实现业务转发、OIDC、会话、CSRF、MFA 和响应中间件。验收 GET 与 POST 进入对应处理器，业务代理只接收契约内允许的方法、路径和固定 Gateway 目标。应用和 BFF 可凭新版自己的源码、依赖锁文件和环境配置构建并启动。[Nuxt 服务端目录](https://nuxt.com/docs/4.x/directory-structure/server) [本地验收](verification/dashboard-d1-d2.md#d1-实现与证据)
- [x] 配置新版独立 HTTPS 入口与运行资源，注册 OIDC 客户端、登录及注销回调，设置 Redis 会话命名空间。按 1.3 通过私有 `runtimeConfig` 注入 Gateway 地址和密钥。验收令牌受众、应用会话 Cookie 和身份服务登录及注销。检查页面 payload 和客户端构建只含公开配置。[身份与会话决策](adr/0009-oidc-bff.md) [本地验收](verification/dashboard-d1-d2.md#d1-实现与证据)
- [ ] 接通 `GET /bff/login`、`GET /bff/email-login`、`GET /bff/register`、`GET /bff/me`、`GET /bff/antiforgery` 和 `GET/POST /bff/logout`。保留 `GET /signin-oidc`、`GET /signout-oidc` 与 `GET /signout-callback-oidc`。验收邮箱开通、受邀回跳、刷新恢复、MFA 再验证与注销。写请求由浏览器提供会话 Cookie 和 `X-CSRF-TOKEN`，Nitro 提供服务端 Bearer。[邮箱开通基线](verification/p1-email-onboarding.md) · [MFA 基线](verification/w2-f03-mfa.md) [本地验收](verification/dashboard-d1-d2.md#d1-实现与证据)
- [x] 验证 BFF 保留 `ETag`、`If-Match`、`Idempotency-Key`、`Location`、`Retry-After`、CSV/PDF 媒体类型和附件头。核对采购及销售建单 POST 以同一个操作 ID 预留配额和创建订单，重复提交只计一次，配额明确拒绝时保持原有订单状态。[Gateway 契约](adr/0018-api-gateway.md) [本地验收](verification/dashboard-d1-d2.md#d1-实现与证据)
- [x] 按新版入口核对 `GET /health`、`GET /alive` 与新版所需的 `GET /bff/status`、`GET /bff/version`。分别验证新版的认证、会话存储与业务 Gateway 连通性，验收会话不可用、无效 CSRF、刷新和注销。 [本地验收](verification/dashboard-d1-d2.md#d1-实现与证据)

### D2 类型化客户端与模拟数据切换

依赖 D1。

- [ ] 在 `app/composables/` 按业务域组织类型化请求，按第 2 节区分首次查询和用户触发的写入。核对 URL、查询参数、字段可空性、响应状态及所需响应头。Wire DTO 到页面模型以服务端 OpenAPI 与实际响应为准。列表、表单和状态提示继续用 `UTable`、`UForm`、`USlideover`。 [本地验收](verification/dashboard-d1-d2.md#d2-实现与证据)
- [ ] 按运行配置为页面提供 `app/mocks/` 或真实客户端。真实查询键包含账号、工作区、资源与筛选条件。切换身份、工作区或权限时取消在途查询并清除前一范围的数据和表单，隔离迟到响应。手动重试从原主体、工作区和提交记录发起。 [本地验收](verification/dashboard-d1-d2.md#d2-实现与证据)
- [ ] 落实第 2 节的错误、幂等、版本和异步约定。联调回归覆盖首次成功、双击、同键重放、键与请求冲突、并发修改、丢失响应、`202` 恢复查询及权限变化。Nuxt 路由和表单提供可读提示，验收请求头、最终状态和写入次数。 [本地验收](verification/dashboard-d1-d2.md#d2-实现与证据)
- [ ] 先经 BFF 用商品接口验证当前 `ETag`、旧版本的 `412` 和正文版本冲突，再在 D3 验收保留页面输入。补一个结果待确认的写入用例，核对回读前后单据数、余额或配额，以及同一身份和工作区下的人工恢复。用两个会话覆盖资源隐藏式 `404`、附加验证和迟到响应。[REST 条件请求基线](verification/rest-api-normalization.md) [本地验收](verification/dashboard-d1-d2.md#d2-实现与证据)
- [ ] 在新版项目内维护串行 Playwright 配置、登录辅助和 `test:e2e` 脚本，测试地址使用新版独立入口。先验收登录与切换工作区，再逐阶段加入真实业务流程。浏览器证据使用测试账户和去敏样例。 [本地验收](verification/dashboard-d1-d2.md#d2-实现与证据)

### D3 工作区授权、主数据与交易前置配置

依赖 D2。对应 C3、C4、C12、C13 的前置读取。

历史替代 UI 曾完成本地验收，记录见 [D3 历史验收](verification/dashboard-d3.md)。该界面已删除；下列原有页面接入及验收仍待完成。

- [ ] 接 `GET /api/me`、`GET /api/workspaces`、`GET O`、`GET O/access` 与 `GET O/billing/entitlements`，按需使用 `GET O/authorization/{permission}`。从已授权工作区、权限及权益结果初始化导航。部门、仓库、期间和单据范围以对应业务资源判定为准。验收越权深链接、只读用户和切换工作区后的可见操作。[工作区](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Workspaces/WorkspaceEndpoints.cs) · [治理](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Governance/GovernanceEndpoints.cs)
- [ ] 接 `GET M/catalog`、`POST M/items`、`GET/PUT M/items/{itemId}`、`POST M/definitions`、`GET/PUT M/definitions/{definitionId}`、`GET/POST M/partners` 及 `GET/PUT M/partners/{partnerId}`。使用 `GET M/items/{itemId}/reference`、`GET M/partners/{partnerId}/reference` 校对现有引用。验收跨工作区引用、停用项和历史单据的原值。[主数据端点](../src/Services/MasterData/Nexora.MasterData.Api/Endpoints) · [引用验收基线](verification/p2-masterdata-references.md)
- [ ] 用 `GET O/departments` 和实际订单范围筛选部门。使用 `GET I/warehouses`、`GET I/warehouses/{id}` 和 `GET I/warehouses/{id}/reference` 区分可查看与可执行的仓库。读取 `GET F/book`、`GET F/chart`、`GET F/trade`、`GET F/receivables` 和 `GET F/trade/banks`，接 `POST F/receivables/setup`、`POST F/trade/setup`。交易第一轮核对账簿、开放期间、税务配置、科目映射和资金账户齐备，参照服务返回的权限和缺失状态给出引导。[Finance](../src/Services/Finance/Nexora.Finance.Api/Endpoints) · [Inventory](../src/Services/Inventory/Nexora.Inventory.Api/Endpoints/InventoryEndpoints.cs)

### D4 采购到付款

依赖 D3。对应 C1、C3 和 C12 的采购部分。从 `/purchase-orders` 进入采购单、收货许可与供应商账务，关联流水由 `/inventory` 和 `/finance` 查看。

- [ ] 在采购列表、详情和表单接 `GET/POST P/orders`、`GET/PUT P/orders/{id}`、`POST P/orders/{id}/decision`。根据单据版本和权限开放保存、提交、撤回、退回、批准及取消。核对部门范围及制单人与审批人的职责分离。[采购单 API](../src/Services/Purchasing/Nexora.Purchasing.Api/Endpoints/PurchaseEndpoints.cs) · [D4 本地验收](verification/dashboard-msw-d4.md)
- [ ] 接 `GET/POST P/orders/{id}/receipts`，用 `202 Location` 和许可 ID 回查签发进度。通过 `GET I/warehouses/{id}/receipts` 打开仓库任务，按仓库侧许可修订号调用 `POST I/receipts/{id}/receive`。使用 `POST P/orders/{id}/receipts/{permitId}/cancel` 与 `POST P/orders/{id}/receipts/close` 处理许可取消和关闭余量，按回执刷新可收数量。[收货许可](../src/Services/Purchasing/Nexora.Purchasing.Api/Endpoints/PurchaseReceiptEndpoints.cs) · [仓库收货](../src/Services/Inventory/Nexora.Inventory.Api/Endpoints/InventoryEndpoints.cs) · [D4 本地验收](verification/dashboard-msw-d4.md)
- [ ] 接 `GET F/trade/receipts` 与适用的 `POST F/trade/receipts/{id}/accrue`，区分已实收、成本或暂估待入账和可匹配。用 `GET/POST F/trade/documents`、`GET F/trade/documents/{id}` 和 `POST F/trade/documents/{id}/decision` 处理账单及独立付款。账单按各收货行提交数量、净额和适用的税额评估 ID。含税验收在 D4 使用已配置税组调用 `POST F/tax/assessments`，税务配置界面由 D10 补齐。付款选择 `GET F/trade/bills` 中符合条件的未结账单，回读各行匹配、价差和凭证。[交易 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Trade/TradeEndpoints.cs) · [交易字段](../src/Services/Finance/Nexora.Finance.Domain/ValueObjects/Trade/TradeTerms.cs) · [D4 本地验收](verification/dashboard-msw-d4.md)
- [ ] 走通「采购批准 → 分批收货 → 暂估 → 账单 → 部分付款」。按 P0 样例，1,130.00 元账单支付 600.00 元后，应付明细与账龄均显示未结 530.00 元。通过付款凭证和银行流水核对实付 600.00 元。复测超量、重复付款、并发签发、取消与执行交错、暂估等待和传输恢复。[采购联调基线](verification/p3-purchase-to-ledger.md) · [D4 本地验收](verification/dashboard-msw-d4.md)
- [ ] 在专用联调环境验收仓库已确认收货而 Finance 消费暂时落后。用单行实收核对恢复后库存和财务各只处理一次，刷新详情能读回待处理或终态。回执未确认时保持可追溯的处理中状态。[财务消费者恢复基线](verification/p1-finance-consumer-recovery.md) · [D4 本地验收](verification/dashboard-msw-d4.md)

### D5 销售到收款

依赖 D3。按业务顺序在 D4 主路径验收后推进。对应 C2、C3 和 C12 的销售部分。从 `/sales` 进入报价、履约、发票和收款，关联库存和账龄由 `/inventory` 和 `/finance` 查看。

- [ ] 接 `GET/POST S/orders`、`GET/PUT S/orders/{id}`、`POST S/orders/{id}/decision` 与 `POST S/orders/{id}/convert`。按状态开放报价发出、报价转单、订单撤回和独立审批。校验已有转单结果、并发修改及相同业务操作的重放。[销售 API](../src/Services/Sales/Nexora.Sales.Api/Endpoints/SalesEndpoints.cs)
- [ ] 接 `GET/POST S/orders/{id}/fulfillments`，依据 `202 Location` 和许可明细追踪保留量及到期。库存页通过 `GET I/warehouses/{id}/shipments` 和 `POST I/shipments/{id}/ship` 按仓库侧修订号完成部分发货。对接 `POST S/orders/{id}/fulfillments/{permitId}/cancel` 和 `POST S/orders/{id}/fulfillments/close`，核对可交付量、取消进度与源单据状态。[销售履约](../src/Services/Sales/Nexora.Sales.Api/Endpoints/SalesFulfillmentEndpoints.cs) · [库存出库](../src/Services/Inventory/Nexora.Inventory.Api/Endpoints/SalesStockEndpoints.cs)
- [ ] 接 `GET F/receivables/shipments`、`GET F/receivables/invoices`、`GET/POST F/receivables/documents`、`GET/PUT F/receivables/documents/{id}` 和 `POST F/receivables/documents/{id}/decision`。区分已过账发票选择、发票编辑、客户收款与分次核销单据。用可开票来源核对库存商品和服务项目。验收 1,130.00 元发票收款 500.00 元，未核销时收款可用 500.00 元，核销后未结 630.00 元并能查回凭证及资金流水。[应收 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Receivables/ReceivableEndpoints.cs) · [销售联调基线](verification/p4-sales-to-ledger.md)
- [ ] 联调账簿启用发票编号时，在 D5 提前接 `GET F/receivables/invoice-numbering/preview`，将候选号作为 `expectedNumber` 跟随复核。与另一会话并发占号时回读候选号，重新确认后过账。编号配置与完整验收放在 D9。[开票验收基线](verification/accountgo-numbering-and-imports.md)
- [ ] 加测超开票、并发核销、客户不匹配、会计期间锁定与回执延迟。支持按真实发票或收款 ID 重新打开详情，核对刷新后的余额。

### D6 退货、仓库和在途调拨

依赖 D4、D5。对应 C3、C6、C13。从 `/inventory` 进入仓库及退货或调拨详情，并支持从采购单、销售单和流水回查来源。

- [ ] 采购退货接 `GET I/warehouses/{id}/returns`、`POST I/movements/{id}/returns`、`POST I/returns/{id}/decision`。销售退货接 `GET I/warehouses/{id}/sales-returns`、`POST I/shipments/{id}/returns`、`POST I/sales-returns/{id}/decision`。查 `GET I/warehouses/{id}/positions`、`GET I/warehouses/{id}/movements` 与财务来源，按实际可退量及开票状态呈现。供应商贷项和退款使用 D4 的交易单据，客户贷项和退款使用 D5 的应收单据。分别回读库存执行和财务过账。
- [ ] 接 `POST I/warehouses`、`PUT I/warehouses/{id}/receiver`、`GET/POST I/warehouses/{id}/stock-operations`、`GET I/warehouses/{id}/stock-operations/{operationId}` 和 `GET I/warehouses/{id}/stock-operations/destinations`。调拨和盘点通过 `POST I/stock-operations/{id}/decision` 确认或取消，目标仓再调用 `POST I/stock-operations/{id}/receive`。核对制单时的库存序号、复核及接收版本、两端流水、在途数量和源仓成本。
- [ ] 用多仓、部分退货及重复确认场景核对库存、财务与流水，覆盖目标仓无权限、待确认取消、超量及相关期间关闭。对真实 API 缺少的跨页来源字段，记录具体契约缺口，使用当前可查的 ID 回链。[库存端点](../src/Services/Inventory/Nexora.Inventory.Api/Endpoints) · [定价与退货政策](domain/p0-policies.md)

### D7 总账、期初与外部凭证

依赖 D3。C5、C8、C10、C15。

- [ ] 接 `GET/POST F/book`、`GET F/chart`、`POST F/chart/accounts` 和 `GET F/chart/exports/{kind}`。科目导入接 `POST F/chart/imports/preview`、`GET F/chart/imports/{id}` 与 `POST F/chart/imports/{previewId}/commit`。核对模板、结构、快照下载，科目归档、使用中限制和空账替换。验收有错、过期或科目修订失效的预览，按当前版本重新生成。[建账与科目](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting) · [科目验收基线](verification/p2-chart.md)
- [ ] 接 `POST F/ledger/opening-balances/preview`、`POST F/ledger/opening-balances/import`，后续通过凭证查询与独立过账。子账接 `GET/POST F/ledger/opening-subledgers`、`GET F/ledger/opening-subledgers/{id}`、`POST F/ledger/opening-subledgers/preview` 与 `POST F/ledger/opening-subledgers/{id}/decision`。用文件指纹、科目修订与批次版本绑定提交。按明细行、凭证和子账 ID 回链，核对库存应用中和最终过账，覆盖重导、预览失效、消息恢复、对账差异和账簿阻断。[期初联调基线](verification/p6-opening-subledger-cutover.md)
- [ ] 接 `GET F/ledger`、`GET F/ledger/trial-balance/{through}`、`GET/POST F/ledger/journals`、`GET/PUT F/ledger/journals/{id}`、`POST F/ledger/journals/{id}/decision` 与 `POST F/ledger/journals/{id}/reversal`。核对草稿、提交、独立过账或取消，冲销可回查原凭证及对应期间。
- [ ] 外部凭证接 `POST F/ledger/journals/imported`、`POST F/ledger/journals/imported/batch-decision`，核对来源编号去重、批量提交或取消、独立过账以及一条版本失效时整批保持原状态。凭证关联接 `GET/POST F/ledger/links`、`GET F/ledger/links/scan`、`POST F/ledger/links/{linkId}/delete`，验收扫描结果可回查问题凭证。[凭证 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/LedgerEndpoints.cs) · [关联验收基线](verification/w4-lnk-journal-links.md)
- [ ] 接 `GET F/readiness`、`POST F/readiness/backfill` 与 `GET/POST F/ledger/periods/{month}`。展示待计价来源、补记结果与月结历史，验证开始关账、完成关账和重开的门禁。年结与合伙核算使用 `GET/POST F/ledger/fiscal-years`、`GET F/ledger/fiscal-years/preview`、`POST F/ledger/fiscal-years/{id}/decision` 与 `GET/PUT F/ledger/partnerships/{year}`。核对待办阻断、分摊、年结后的结转凭证以及重开冲销。[财务就绪 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/ReadinessEndpoints.cs) · [财务操作基线](verification/p5-finance-operations.md)

### D8 银行、付款作废与捐赠

依赖 D4 和总账查询能力。对应 C7、C11、C14。

- [ ] 接 `GET/POST F/trade/banks`、`GET F/trade/banks/{id}`、`POST F/trade/banks/{id}/default` 与 `GET F/trade/banks/{id}/movements`，扩展交易单据到收入、费用、划转和业主往来。作废经 `POST F/trade/documents` 创建更正，再使用交易决定端点复核。核对 600.00 元付款作废后应付未结恢复为 1,130.00 元，沿原付款查到更正、凭证及资金流水。
- [ ] 接 `POST F/trade/imports/preview`、`GET F/trade/imports/{id}`、`POST F/trade/imports/{id}/commit` 和 `GET F/trade/banks/{id}/statement`。支持 CSV 列映射、逐行问题、重复行和到期重做。区分仅返回校验问题的 `200` 与创建预览的 `201`。刷新后可从预览 ID 查询状态和提交数量。
- [ ] 接 `GET/POST F/trade/statement/{id}/matches`、`POST F/trade/matches/{id}/release` 与 `POST F/trade/statement/{id}/exclude`。支持分次匹配、解除后的余额恢复和带原因的排除或恢复。从待匹配行打开适用的收入、费用或付款表单。验收对账单行 500.00 元能分配 300.00 与 200.00 元，超额、重复与冲突后余额可回读。[资金交易](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Trade/TradeEndpoints.cs)
- [ ] 接 `GET/POST F/trade/banks/{bankId}/reconciliations`、`POST F/trade/banks/{bankId}/reconciliations/preview`、`POST F/trade/reconciliations/{id}/decision` 与 `GET F/trade/reconciliations/{id}/pdf`。校对截止日、差异、复核或取消及撤销最近完成记录的门禁。用新旧两笔对账检验撤销顺序与报告快照。[对账 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Banking/BankReconciliationEndpoints.cs)
- [ ] 捐赠沿资金交易录入和复核。用 `GET F/trade/documents/{id}/donation-receipt` 及该收据下的 `GET /pdf`、`GET/POST /fiscal-tickets`、`GET /fiscal-tickets/{ticketId}`、`GET/POST /dispatches`、`GET /dispatches/{dispatchId}`、`POST /dispatches/{dispatchId}/decision` 串起普通收据、外部票据关联和邮件。按 `GET F/capabilities` 显示邮件渠道与法定票据能力。用本地 Mailpit 验收队列、独立记录、重试、重寄与放弃，按来源查看现有财政票据。[捐赠端点](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Donations) · [捐赠验收基线](verification/f36-donation-receipts.md)

### D9 定期开票、编号与交付

依赖 D5。对应 C9、C17。

- [ ] 接 `GET/POST F/receivables/schedules`、`PUT F/receivables/schedules/{id}`、`GET F/receivables/schedules/{id}/occurrences` 及计划下的 `POST /pause`、`POST /run`、`POST /skip`。运行时间、未来日期与待处理原因使用服务返回。用同一到期日验证计划修改、跳过、手动执行与服务恢复期间的重复触发，核对执行历史和发票 ID。[定期开票端点](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Invoicing/RecurringEndpoints.cs) · [到期补跑基线](verification/w1-f27-downtime.md)
- [ ] 接 `GET/PUT F/receivables/invoice-numbering` 与 `GET F/receivables/invoice-numbering/preview`，复核按实际契约提交候选编号。验收过账并发、账期阻断和早期发票保留原编号。[发票编号验收基线](verification/accountgo-numbering-and-imports.md)
- [ ] 接 `GET F/receivables/documents/{id}/pdf`、`GET/POST F/receivables/documents/{id}/shares` 和 `POST F/receivables/shares/{id}/revoke`。新版以自己的入口生成 `/invoice-share` 链接，从片段读取令牌。新版 Nitro 用 `server/routes/public/invoice-pdf.post.ts` 将匿名 `POST /public/invoice-pdf` 转发到固定的 Gateway 公开下载端点。明文链接按首次成功响应处理。验收公开下载、受保护预览、到期、撤销、媒体类型和分享令牌脱敏。[PDF 与分享 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Invoicing/InvoicePdfEndpoints.cs)
- [ ] 邮件接 `GET/POST F/receivables/documents/{id}/dispatches`、`GET F/receivables/documents/{id}/dispatches/{dispatchId}`、`POST F/receivables/dispatches/{id}/decision`。用创建位置回查队列任务，按 `GET F/capabilities` 展示渠道状态。用本地 Mailpit 验收排队、投递、失败与结果未知的人工处置。核对重试原任务、重寄创建的新任务及放弃状态。[发票邮件 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Invoicing/InvoiceMailEndpoints.cs)

### D10 税务与申报

依赖 D4、D5 和 D7 的账簿与期间数据。对应 C16。

- [ ] 接 `GET F/tax`、`POST F/tax/rates`、`POST F/tax/groups`、`POST F/tax/classifications`、`POST F/tax/assessments` 与 `GET F/tax/assessments/{id}`。按服务端生效版本和商品、伙伴税组核对税额，单据回查对应快照。验证含税、未税、折扣、舍入和税率生效日变化。
- [ ] 接 `GET/PUT F/tax/calendar`、`GET F/tax/periods/{on}`、`POST F/tax/periods/{on}/filings`、`GET F/tax/filings/{id}`。基于申报版本和指纹登记申报或带原因更正，按权限提供账簿锁定选项。用研发样例验证月度或季度、权责或收付、旧指纹拒绝、历史保留及锁账后的过账限制。[税务端点](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Tax) · [税务验收基线](verification/accountgo-tax-filings.md)

### D11 报表、账龄、导出与工作台

依赖 D4、D5 和 D7 的正式查询。对应 C5、C18。

- [ ] 接 `GET F/reports/{kind}`、`GET F/reports/{kind}/rows/{row}`、`GET F/reports/{kind}/pdf`，以及 `GET F/reporting/overview`、`GET F/reporting/aging/{kind}`、`GET F/reporting/partner-ledgers/{kind}/{partnerId}`。报告钻取按主报告返回的 `watermark` 查询，同一期间的纸面、屏幕和导出以相同快照核对。按受支持的报表开放上期比较、核算口径与权益变动。校验账龄分页后的行与整张报表总额。
- [ ] 接 `GET/POST F/report-exports`、`GET F/report-exports/{id}`、`GET F/report-exports/{id}/file` 和 `POST F/report-exports/{id}/rebuild`。按 `201 Location` 回查任务，用 `completedAtUtc` 控制下载。验收刷新恢复、排队中的文件请求、容量受限、跨用户或工作区读取和按原快照重建。[导出验收基线](verification/w2-f37-exports.md)
- [ ] 接 `GET /api/reports/workspaces/{id}`。根据 `200`、`202`、`404`、`503` 展示就绪、等待、不可访问及依赖异常，记录更新时间与投影版本。工作台金额使用 Finance 主要查询，投影用于展示实际提供的工作区数据。统一搜索、审批收件箱和库存预警按已提供的查询范围展示。[财务报表端点](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Reporting) · [Reporting 投影端点](../src/Services/Reporting/Nexora.Reporting.Api/Endpoints/ProjectionEndpoints.cs)

### D12 组织、计费与审计

依赖 D3 和 D7 的账簿初始化。对应 C4、C19–C21。

- [ ] 接 `POST /api/workspaces`、`POST /api/workspaces/personal`、`GET O/personal-links`、`PUT O/personal-links/{personalId}`、`GET/PUT O/settings` 与 `GET O/announcements`。建公司后衔接 D7 的账簿初始化，刷新后可继续未完成步骤。核对个人账本链接和解除、品牌设置、公告可见性及敏感设置的 MFA 门禁。
- [ ] 接 `GET O/members`、`GET O/roles` 和 `POST O/members/{memberId}`。业务角色维护对照该成员下的 `POST /business-roles`、`POST /purchase-role`、`POST /sales-role` 与 `POST /finance-role`，按相应请求与授权规则复用表单。验收最后管理员约束、独立批准、停用后读写与跨工作区成员选择。
- [ ] 接 `GET/POST O/invitations`、`GET O/invitations/{invitationId}`、`POST O/invitations/{invitationId}/approve`、`POST O/invitations/{invitationId}/revoke` 与 `POST /api/invitations/{invitationId}/redeem`。从新版 `/join` 验证登录回跳与兑换，邮件链接按联调环境的公开地址核对。验收独立批准、受邀地址不匹配、过期、撤销及重复兑换。[成员及邀请 API](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Governance/GovernanceEndpoints.cs)
- [ ] 接 `GET/POST O/custom-roles`、`GET/POST O/departments`、`GET/POST O/role-grants` 与 `POST O/role-grants/{grantId}`。按真实 API 展示自定义角色版本、授权期限与等待的批准人数。用跨部门、仓库和会计期间样例验收批准、到期或撤销后对应业务服务的读写结果。[角色授权基线](verification/f07-resource-scope-approvals.md)
- [ ] 接 `GET O/billing`、`GET O/billing/plan-quote`、`GET O/billing/entitlements`、`POST O/billing/subscription`、`POST O/billing/subscription/cancel` 和 `POST O/billing/invoices/{invoiceId}/pay`。本地结账按能力接 `GET/POST O/billing/local-checkout` 和 `POST O/billing/local-checkout/{invoiceId}/callback`，验收报价变化、付款引用、重复确认与权益生效。订阅限额与授权分别验收。建单配额由 D1 的 BFF 转发链负责。[计费端点](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Billing)
- [ ] Organization、Purchasing、Sales、Finance 的专项审计接各自的 `GET /audit`。上述四个服务及 MasterData、Inventory 的记录变更接各自的 `GET /record-changes` 与 `GET /record-changes.csv`。按端点分别映射动作、资源、操作人和时间范围。验收分页、CSV 使用的筛选范围、审计权限、脱敏和单据回链。[变更记录基线](verification/w4-rcd-record-changes.md)

### D13 账户安全、设备授权与助手

依赖 D1、D3。对应 C22、C23。

- [ ] 接 `GET /bff/sessions`、`POST /bff/sessions/{id}/revoke`、`POST /bff/sessions/revoke-others`、`GET /bff/session-policy` 和 `POST /bff/sessions/activity`。用真实交互更新活跃时间，策略由 Nitro 读取 Organization 的 `GET /api/session-policy`。验收策略来源、空闲退出、切换工作区及被撤销设备的下一次访问。[会话策略基线](verification/w4-sess-session-policy.md)
- [ ] 接 `GET /bff/security/capabilities`、`GET /bff/account` 和 `GET /api/account/deletion-preflight`。MFA 能力、账户资料管理与账号删除预检按身份和服务返回展示。验收能力关闭、需再验证、预检发现管理员阻断等状态。[会话安全基线](verification/w2-f04-sessions.md)
- [ ] 在新版 BFF 接入 `/bff/auth/cli` 与 `/bff/auth/mcp` 的设备授权契约。授权页用各自的 `GET /verification` 衔接身份服务。客户端通过 `GET /bff/auth/cli` 或 `GET /bff/auth/mcp` 读取配置，调用对应前缀下的 `POST /device`、`POST /token`、`POST /revoke`。用现有 CLI 和 MCP 指向新版入口，验证同意、拒绝、过期、撤销、凭据用途和模块权益。[CLI 验收基线](verification/w3-f39-cli.md) · [MCP 验收基线](verification/w3-f41-mcp.md)
- [ ] 在 `/api/assistant/workspaces/{workspaceId}` 下接 `GET /capabilities`、`GET /sessions`、`GET /sessions/{sessionId}`、`POST /runs` 与 `POST /executions/{executionId}/{cancel|resume|approve|reject}`。用默认本地提供方验证 SSE 输出、审批暂停、断线后的历史恢复、重复审批及切换工作区后的数据隔离。外部提供方的配置和凭据留在服务端，真实外部渠道联调另记验收。[助手端点](../src/Gateway/Nexora.ApiGateway/Infrastructure/Assistant/AssistantEndpoints.cs) · [助手验收基线](verification/w3-f40-assistant.md)

### D14 新版独立验收、发布与回退

依赖纳入新版发布范围的阶段。

- [ ] 用新版 `nuxt build` 的 Node 产物启动 Nitro，部署时注入 `NUXT_*` 和所需的监听设置 `NITRO_HOST`、`NITRO_PORT`。从同一新版 HTTPS 入口验收页面、静态资源、业务深链接刷新、OIDC 回调、`/health` 与 `/bff/api/*`。检查真实配置缺失时的就绪状态，并核对受保护响应的缓存策略。[Nuxt Node 部署](https://nuxt.com/docs/4.x/getting-started/deployment#nodejs-server)
- [ ] 分别验收新版模拟预览与独立真实入口。真实入口核对登录、切换工作区、邀请、分享下载和采用 SSE 的助手流，验证完整工作流使用发布的 API 契约。用两种测试身份验证会话缓存与数据隔离。
- [ ] 记录新版构建、HTTPS 入口和运行配置。在新版入口演练恢复到上一份验收过的构建，首版则演练暂停和恢复真实入口。回退后核对登录、已创建单据、待处理许可、导出及邮件任务。
- [ ] 为新版设置独立的 CI 检查、构建和单测。按版本保存本地浏览器证据、远程运行结果及去敏追踪 ID。遇到服务契约或数据库变更时验证新版调用与迁移结果。生产身份、密钥、数据库迁移、镜像回退和试运行由 P6 单独验收。[CI 工作流](../.github/workflows/ci.yml) · [项目发布计划](计划.md#107-p6--试运行与发布) · [本地回退演练](verification/p6-05-operations-drill.md) · [运维手册](运维手册.md)

### 4.1 API 覆盖索引

2026-11-19 源码口径核对七个业务服务的 243 项 HTTP 方法与路径，Gateway 及 Nitro 路由另行核对。授权、配额、身份及跨服务处理沿现有服务链验收。

| 归属 | 接口覆盖与阶段 |
| --- | --- |
| [Organization](../src/Services/Organization/Nexora.Organization.Api/Endpoints) | D3 工作区与授权读取。D12 公司、个人账本、邀请、成员、部门、角色、账单及审计。D13 会话政策、删除预检与 CLI 工作区读取。 |
| [MasterData](../src/Services/MasterData/Nexora.MasterData.Api/Endpoints) | D3 目录、商品、定义、伙伴与引用。D12 变更记录。 |
| [Purchasing](../src/Services/Purchasing/Nexora.Purchasing.Api/Endpoints) · [Sales](../src/Services/Sales/Nexora.Sales.Api/Endpoints) | D4 采购单与收货许可。D5 报价、销售订单与履约许可。D12 审计及变更。订单打印沿用详情数据。 |
| [Inventory](../src/Services/Inventory/Nexora.Inventory.Api/Endpoints) | D3 仓库引用。D4 收货、D5 发货、D6 退货、位置与流水、盘点与调拨。D12 变更记录。 |
| [Finance](../src/Services/Finance/Nexora.Finance.Api/Endpoints) | D3 交易设置。D4–D6 应收应付与退货更正。D7 账簿、科目、期初、总账、期间与合伙核算。D8 资金、对账及捐赠。D9 发票、定期计划、PDF、分享及寄送。D10 税务。D11 报表、账龄与导出。D12 审计及变更。 |
| [Reporting](../src/Services/Reporting/Nexora.Reporting.Api/Endpoints) | D11 工作区投影、待生成与授权依赖状态。 |
| [Gateway](../src/Gateway/Nexora.ApiGateway/Infrastructure) · [新版 Nitro 路由规划](#12-nitro-路由映射) | D1 新版独立 BFF 的登录、会话、配额和代理契约。D9 公共发票。D13 账户安全、设备授权和助手。D14 独立入口、发布与回退。 |

服务端链路也要保留验收。D1 的建单通过 Nitro 调用 `POST O/billing/usage/documents` 预留配额。D13 使用已有设备授权客户端验证 `GET /api/cli/workspaces` 和 `POST /mcp` 的专用令牌、权限及撤销。健康探测用于 D0/D1 的就绪检查，gRPC、RabbitMQ 与投影用关联业务结果和恢复测试验收。

## 5. 验收命令与记录

下列命令从仓库根目录运行。当前新版已有 typecheck、lint、test:unit 和 build 脚本，可用于模拟原型验证。真实工作流待界面确认后按 D 阶段执行。[新版脚本](../src/Web/nexora-dashboard/package.json)

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
```

业务服务或 Gateway 有变更时，执行解决方案的 Release 构建和相关回归。

```powershell
dotnet tool restore
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
```

联调后端以 Gateway 和所属服务就绪为前提。使用已有 AppHost 联调后端时，可运行下列脚本校验服务的 OpenAPI 样例。新版通过自己的 HTTPS 入口单独验收。

```powershell
$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
pwsh -NoProfile -File scripts/p1/Test-OpenApiContracts.ps1 -AppHost $nexoraAppHost
```

D14 用 Node 服务产物验收。先按 1.3 注入新版运行配置，再从仓库根目录启动以下产物。D2 加入 `test:e2e` 脚本后，在另一个终端串行执行新版浏览器用例。

```powershell
# 生成产物后，在已注入 NODE_ENV=production 与 NUXT_* 的验收环境运行
node src/Web/nexora-dashboard/.output/server/index.mjs
```

```powershell
# D2 添加新版 test:e2e 脚本后执行
pnpm --dir src/Web/nexora-dashboard test:e2e
```

发票与收据专项验收按本地后端环境准备 Mailpit、PDF 字体与 Chromium，从新版浏览器验证实际预览、下载与寄送。[开发环境与 PDF 准备](../README.md#本地运行) · [发票通信验收](verification/p4-sales-to-ledger.md) · [捐赠收据验收](verification/f36-donation-receipts.md)

每波在 `docs/verification/` 记录新版入口、构建或提交、测试账号角色、去敏后的单据或批次 ID、步骤、期望、实际结果和检查范围。主路径从新版界面走完，至少覆盖适用的角色隔离、重复提交、版本冲突和异步恢复后再勾选 D 子项。将适用的验收记录链接到 [实施计划](计划.md)，分别记录构建、真实 API 联调、远程 CI 与生产验收结果。
