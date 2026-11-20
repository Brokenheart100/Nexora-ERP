# Dashboard D1、D2：独立 BFF 与数据请求底座

> 2026-11-20 状态更新：替代 UI 已按用户要求删除。本记录为当时版本的历史验证；当前保留 BFF / 客户端 / MSW 基础，原界面接入状态见 [删除记录](dashboard-replacement-ui-removal.md)。

2026-11-19。范围以 [D1、D2 清单](../ui-dashboard-api-integration-todolist.md#d1-新版独立-nitro-bff-与登录会话) 为准。最终门禁结果在本记录末尾汇总。

## 实施顺序与验收

1. 独立 BFF：沿用已验证的 OIDC/PKCE、加密 Redis 会话、CSRF、刷新协调和 MFA 实现，在新版源码中独立构建；固定 Gateway 和业务路径/方法白名单。单元验证非法路径、方法、响应头和配置边界。
2. Aspire 与身份配置：真实入口 `https://localhost:7444`、新版资源端口 `3002`、OIDC 客户端 `nexora-dashboard-bff`；Cookie、密钥和 Redis 前缀独立。通过新版入口验证认证、回调、注销、就绪及旧入口回归。
3. D2 请求底座：类型化领域客户端、身份/工作区/权限版本查询键、取消和迟到响应隔离、错误、版本、幂等及未知写入结果恢复。模拟模式和真实模式显式区分，真实模式的后续模块显示待接入状态。
4. 新版串行 Playwright：登录和切换、CSRF/MFA、401/403/404、ETag/412/409、重复提交/同键冲突、响应丢失及回读、202 查询终止、会话刷新/不可用、头与文件响应验证。再跑 lint、类型、单测和构建。

## 验证边界

完整业务页面、交易闭环、远程 CI 和生产验收按后续阶段推进。D3 及后续 TODO 保持未完成。以下记录只覆盖本地构建、测试与实际 AppHost 联调。

## D1 实现与证据

| 边界 | 本轮实现 | 验证位置 |
| --- | --- | --- |
| 独立运行 | `dashboard` 资源、内部开发入口 3002、浏览器 HTTPS 7444；原版 7443 与模拟 3001 并存 | `e2e/integration.spec.ts`；`e2e/production.spec.ts` |
| 身份 | confidential OIDC 客户端 `nexora-dashboard-bff`；PKCE S256、独立密钥和精确登录/注销回调；`aud` 含 `nexora-api` | `Configure-EmailOnboarding.ps1`；`e2e/refresh.spec.ts` |
| 会话 | `__Host-NexoraDashboard.*` 的 Secure/HttpOnly Cookie；`nexora:dashboard:*` 的加密 Redis 记录、刷新租约、CSRF、闲置策略和撤销记录 | `server/utils/session/`；`e2e/refresh.spec.ts` |
| 代理 | 依据 D0 契约快照列出 241 个业务方法/路径组合，排除 CLI；校验 UUID 等路径参数并固定 Gateway origin；不接收用户给出的目标地址 | `server/utils/proxy/business-routes.ts`；`test/bff-route-policy.test.ts` |
| 响应 | 原样保留 ETag、条件/幂等请求头、媒体类型和附件头；201/202 的相对 `/api/*` Location 改写为 `/bff/api/*`；禁止客户端缓存 | 商品条件写入、实际 CSV/PDF、采购 202 用例 |
| 配额 | 采购、销售建单使用与业务请求相同的 operationId 预留；错误拒绝时不继续转发，预留网络故障返回 503 | `e2e/orders.spec.ts`；`e2e/sessions.spec.ts` |
| 可用性 | `/alive`、`/health`、`/bff/status`、`/bff/version`；health 检查 Redis、OIDC discovery 和 Gateway alive，避免循环健康探测 | 独立生产 Node 产物及 Redis 故障注入用例 |

登录覆盖开发账号密码+TOTP、邮箱登录和新邮箱注册。`/join` 保留受邀回跳，邀请 fragment 在当前浏览器会话中暂存并从地址栏移除。注销用原生 POST 表单提交 CSRF 并等待 OIDC 回调；GET logout 只安全返回首页。MFA 既验证正常路径，也验证带查询参数的敏感路径，防止查询字符串避开附加验证。

独立产物直接运行 `.output-live/server/index.mjs`，不依赖旧项目。生产故障测试只启动本次测试拥有的额外 Node 进程，用错误 Redis 地址验证 alive=200、health/me=503；缺少客户端密钥时拒绝启动。HTML 与客户端构建检查独立客户端密钥、会话密钥和 Redis 连接字符串均未暴露。测试详细日志和私有配置留在忽略的 `artifacts/p1/runtime/`。

## D2 实现与证据

`shared/types/wire.ts` 通过 Zod 校验会话、工作区、授权和商品 Wire DTO；`app/composables/api/` 提供 Organization 和 MasterData 客户端。目录首次读取使用 `useAsyncData`，用户写入通过封装 `$fetch.raw` 执行，`retry: 0`。保留原始状态码和响应头，解析 ProblemDetails 与 Nitro 错误，并区分登录过期、MFA、资源权限、412、409、校验和不可用。

请求范围与查询键包括数据模式、主体、工作区、授权版本、资源及筛选条件。切换时中止旧请求、清理 Nuxt 查询和表单；即使传输层仍返回结果，也要重新检查范围版本。真实模式不渲染模拟页面，当前只显示服务端工作区、商品目录或明确的待接入提示。

写入创建固定 UUID 和冻结的正文；双击共用在途请求。丢失响应、网络错误和无法确认的服务器响应标为结果待确认。先回读资源，再按主体、工作区、资源和 operationId 匹配与业务同事务保存的 CatalogReceipt 审计快照。无法读取审计或找不到回执时保持未知；仅对显式声明支持幂等的客户端开放人工重试，且复用原 UUID、正文和 If-Match。切换范围后原操作拒绝继续。

`poll` 仅访问同源业务路径，遵循 Retry-After，并由终态、总预算、取消及范围变化停止。预算覆盖在途 HTTP 请求，超时保留可恢复查询的 Location。单元验证 Retry-After、预算、中止、权限版本变化及二进制头；实际采购用例经 BFF 返回 202 后，使用本次 permitId 查询至 issued。

浏览器串行配置在新版项目内，固定新版 HTTPS 入口并使用 Edge。模拟预览存在时复用；不存在时 Playwright 创建并清理自己的预览进程。登录、TOTP、Mailpit 和请求辅助都位于本项目 `e2e/`，不导入旧版测试。场景包括：

- 新旧入口与模拟预览并存、登录、回调、CSRF 和注销；
- ETag/If-Match、同键重放、同键不同内容 409、旧头版本 412、正文旧版本 409；
- 服务端已提交但响应丢失，回执确认后写入仍为一次；
- 发送前断网、回读、审计读取被拒绝后仍保持未知，再由用户明确重试同一操作；
- 两会话资源隐藏式 404、只读用户 403、切换工作区后的迟到响应隔离；
- 并发刷新、MFA 过期及重新验证、刷新失效清除会话；
- 采购/销售同键各一张草稿、各一次配额、202 恢复查询及实际 CSV/PDF 头；
- 新注册专用账户的免费配额耗尽后，两类建单均返回 quota_exceeded，前后订单列表一致。

配额测试只调整新测试账户的订阅：邀请 alice/bob 作为独立操作者与复核人，启用业务角色，预留 500 次额度，验证拒绝，再使用本地模拟付款参考恢复该测试账户的 Pro，以读回订单数。alice/bob 自己的所有者订阅不变。采购验收只签发许可，没有执行实收、库存或财务过账。

## 复现命令与最终结果

依赖版本以仓库锁文件为准。本轮环境为 .NET SDK 10.0.402、AppHost SDK 13.6.5、CLI 17.0.0、Node 24.21.0、pnpm 12.16.1、Nuxt 4.6.4、Playwright 1.64.1。

```powershell
pnpm --dir src/Web/nexora-dashboard lint
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
pnpm --dir src/Web/nexora-dashboard build
```

Aspire 由根目录指定 AppHost 启动，并执行 `aspire wait gateway` 后运行 `pnpm --dir src/Web/nexora-dashboard test:e2e`。详细步骤见 [Dashboard README](../../src/Web/nexora-dashboard/README.md)。[去敏测试汇总与源码指纹](../../artifacts/dashboard-d1-d2/results.json) 保留当前工作树、版本标识与 8 项浏览器场景结果。

| 最终门禁 | 结果 |
| --- | --- |
| ESLint / TypeScript strict | 均通过 |
| Nuxt 单元测试 | 18 个文件，77 通过、0 失败 |
| 模拟与真实模式生产构建 | 均通过，分别输出 `.output/`、`.output-live/` |
| 实际 AppHost 编排与新版浏览器回归 | 8 通过，0 失败、0 跳过、0 flaky；约 3.6 分钟 |
| .NET Release | `dotnet build Nexora.slnx -c Release --no-restore -m:2`，0 警告、0 错误 |
| .NET 测试 | `dotnet test tests/Nexora.Tests -c Release --no-build`，62 通过、0 失败、0 跳过 |
| 范围隔离故障变异 | 反转 generation 判断后测试失败；原始字节恢复后 5 项通过 |
| 文件差异 | `git diff --check` 通过；保留本轮开始前已有工作区改动 |
| 生命周期 | 本次启动的指定 AppHost 已正常停止；`aspire ps` 返回空；保留持久卷 |

D1、D2 各 5 项已按本地验收勾选。D0 的 API 元数据缺口仍由所属后续阶段跟进，本轮按拥有方 DTO 与实际响应适配，不依赖存在冲突的生成 schema。远程 CI、部署与生产验收不包含在上述通过结果内。

发现并修正的验证问题：Nuxt 默认生成目录与已有预览争用锁，现分别隔离开发/构建目录；完整栈与默认大量 Vitest worker 同跑出现内存不足，现固定最多 2 个 worker，全部 77 项复验通过；注销测试等待真实 OIDC 导航完成，避免在跳转中执行浏览器 fetch。所有失败历史留在本地运行日志，不当作通过证据。
