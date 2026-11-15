# P6-02 HTTPS、秘密、权限 / 依赖 / 镜像与生产配置本地检查

> 状态：**本地检查完成，生产配置未复核，P6-02 未验收、不勾选**。
>
> 日期：2026-11-15。环境：Windows 本地仓库、.NET 10、Node 24、pnpm、Edge；未连接生产目标，Docker 引擎未启动。结论仅覆盖本地可执行检查，不替代生产 TLS 终止、密钥托管、镜像扫描与权限审计。

## 1. 检查项与结果

| 检查项 | 结果 | 证据 / 说明 | 结论 |
| --- | --- | --- | --- |
| 开发 HTTPS 证书 | 通过 | `dotnet dev-certs https --check --trust` 退出 0：CN=localhost，有效期 2026-09-10 至 2027-09-10，受信任 | 本地通过 |
| 认证 HTTPS 元数据 | 通过 | `src/Hosting/Nexora.ServiceDefaults/Authentication.cs:19`：`RequireHttpsMetadata = !builder.Environment.IsDevelopment()` | 生产默认强制 HTTPS 元数据 |
| 浏览器会话 Cookie | 通过 | `src/Web/nexora-web/server/utils/bff-session.ts:7-9`：`__Host-Nexora.Session`，`secure:true`、`httpOnly:true`、`sameSite:'lax'`；CSRF Cookie 为 `sameSite:'strict'`（`bff-csrf.ts:8`） | 本地通过 |
| CSRF | 通过 | `src/Web/nexora-web/server/utils/bff-csrf.ts:28-40` 校验 HMAC、Origin、Cookie 与请求头 / 表单双提交；`/bff/api/*` 非安全方法强制校验 | 本地通过 |
| CORS | 通过 | 未发现 `AllowAnyOrigin` / `UseCors` / `AddCors`；浏览器统一经同源 BFF | 无跨域暴露 |
| HSTS / HTTPS 重定向 | 未通过 | `src/Gateway/Nexora.ApiGateway/Program.cs:42-50` 与各服务均未调用 `UseHsts` / `UseHttpsRedirection`；网关当前仅通过 Aspire HTTPS 端点提供入口 | 生产入口必须补 TLS 终止与 HSTS，否则依赖外部代理 |
| 安全响应头 | 未通过 | 仅 `src/Web/nexora-web/server/middleware/bff-response.ts:8-10` 设置 `Cache-Control: no-store`、`Referrer-Policy: no-referrer` 与 Host 校验；未发现 CSP、`X-Content-Type-Options`、`X-Frame-Options` / frame-ancestors。发票 HTML 的 CSP 只约束 PDF 渲染页（`ChromiumInvoiceRenderer.cs:72,109,140`） | 需在 BFF / 网关统一补安全头 |
| Host 过滤 | 未通过 | `src/Services/Organization/Nexora.Organization.Api/appsettings.json:8` 与 `src/Services/Reporting/Nexora.Reporting.Api/appsettings.json:8` 均为 `"AllowedHosts": "*"`；未发现 forwarded headers 配置 | 生产需按域名 allowlist 并配置反向代理转发头 |
| OpenAPI 暴露 | 未通过 | `src/Services/Organization/Nexora.Organization.Api/Program.cs:96` 与 `src/Services/Reporting/Nexora.Reporting.Api/Program.cs:44` 无条件 `MapOpenApi()`；网关当前路由到 `/api/{**rest}`，生产应只在受控环境开放 | 生产需关闭或加认证 |
| 匿名端点 | 有边界 | `/health`、`/alive` 匿名（`src/Hosting/Nexora.ServiceDefaults/Extensions.cs:122-128`，注释要求生产放私有运维面）；`/public/invoice-pdf` 匿名（`InvoicePdfEndpoints.cs:30`，凭分享令牌使用） | 需在生产入口限制健康端点 |
| 速率限制 | 部分 | 网关 MCP 60 次/分、AI 助手 20 次/分（`src/Gateway/Nexora.ApiGateway/Program.cs:19-40`）；Organization 邀请兑换 20 次/分（`Program.cs:57-63`）；无全局限流 | 生产需统一入口限流 |
| 密钥与令牌托管 | 部分 | AppHost 用 `builder.AddParameter(..., secret: true, persist: true)` 生成 BFF / OTP / 演示密码（`AppHost.cs:11-16`）；Keycloak realm 写入 `artifacts/p1/runtime/keycloak`（`AppHost.cs:43-45,176`），该目录被 `.gitignore:16` 排除。未发现生产密钥托管 / 轮换配置 | 本地安全，生产未落地 |
| 仓库秘密扫描 | 通过（源文件） | 未在 `src/`、脚本、CI 和配置中发现硬编码私钥或生产密码；`scripts/p1` 通过环境变量 / User Secrets 读取。`artifacts/` 内是本地运行证据（含 redacted realm），不得随发布物分发 | 源文件无发现；运行产物需隔离 |
| NuGet 漏洞 | 通过 | `dotnet list Nexora.slnx package --vulnerable --include-transitive` 退出 0；输出逐项目为“没有易受攻击的包” | 本地通过 |
| npm 生产依赖漏洞 | 有条件通过 / 豁免待复核 | `pnpm --dir src/Web/nexora-web audit --prod --json`：4 项（2 low、2 moderate、0 high、0 critical）；详见第 2 节 | 无高危；需升级或记录豁免 |
| 镜像摘要固定 | 部分通过 | `src/Hosting/Nexora.AppHost/ContainerImageDigests.cs:6-13` 固定 PostgreSQL / RabbitMQ / Redis / Keycloak / Mailpit 的 SHA-256；Keycloak 派生镜像使用 digest（`scripts/p0/keycloak-email-otp/Dockerfile.onboarding:1,7`）。业务服务没有 Dockerfile，只有 Keycloak 构建镜像 | 基础设施镜像已固定；应用镜像未定义 |
| 镜像漏洞扫描 | 受阻 | `docker version` 退出 1：`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`；Docker 引擎未运行，无法扫描本地镜像 | 需在发布环境补扫 |
| 生产部署配置 | 未通过 | `README.md:93` 明确 AppHost 只提供本地示例身份与资源，发布操作会拒绝；`AppHost.cs:6-7` 非 RunMode 直接抛异常；无生产 realm、迁移作业、部署清单 / 反向代理 / 备份配置 | 生产目标未定义，P6-02 无法完成 |
| 远端 CI | 未通过 | `.github/workflows/ci.yml` 只有 backend / frontend 构建与单测 / 类型检查 / 构建；无 e2e、无依赖漏洞、无镜像扫描；`docs/计划.md:61` 记录远端 Actions 尚未执行 | 发布前需补 CI 门禁并实际执行 |

## 2. npm 漏洞明细与临时豁免

`pnpm audit --prod --json` 的 4 条告警均位于 Nuxt / Nitro 构建链，未发现 high / critical：

| 包与版本 | 严重度 | 公告 | 依赖路径 | 评估 |
| --- | --- | --- | --- | --- |
| `esbuild@0.27.7` | low | [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | `.>@nuxt/ui>@nuxt/fonts>fontless>esbuild` | Windows 开发服务器任意文件读取；构建期工具，非业务运行时入口 |
| `deepmerge@4.3.1` | low | [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | `.>nuxt>@nuxt/nitro-server>nitropack>@rollup/plugin-node-resolve>deepmerge` | 原型污染；无已发布补丁版本，需跟进上游 |
| `glob@13.0.6` | moderate | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | `.>nuxt>@nuxt/nitro-server>nitropack>@vercel/nft>glob` | 构建期文件遍历，超时取消绕过；非请求处理路径 |
| `minimatch@10.2.6` | moderate | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | Nitro / archiver / i18n 构建链 | globparts 放大导致 DoS；构建期工具 |

临时豁免理由：没有 high / critical；4 项均在 Nuxt / Nitro / 构建工具链，未证明可由业务请求直接触发；当前版本上游尚未提供全部兼容修复。**发布前必须重新审计，优先升级到含修复的 Nuxt 版本；若仍存在，应由发布负责人书面接受风险。**

## 3. 必须修复 / 发布前完成的项

1. 在网关或入口代理启用 TLS 终止、HSTS、HTTPS 重定向，并确认只暴露 HTTPS。
2. 为 BFF / 网关补 CSP、`X-Content-Type-Options`、`X-Frame-Options` 或 frame-ancestors、`Permissions-Policy` 等安全头；验证 PDF 分享页与登录跳转不被破坏。
3. 生产环境将 `AllowedHosts` 收紧为实际域名；配置 forwarded headers 并只信任已知代理。
4. 生产关闭或认证保护 Organization / Reporting 的 OpenAPI；健康端点移入私有运维面。
5. 定义应用镜像构建、非 root 用户、只读根文件系统、镜像扫描与 SBOM；当前只有 Keycloak 镜像。
6. 生产密钥改用托管密钥 / 密钥库，完成轮换、最小权限与审计；禁止把 `artifacts/p1/runtime` 打包进镜像。
7. CI 增加 e2e、依赖漏洞、镜像扫描和制品签名；在远端实际执行一次并留存结果。
8. 完成生产目标（云 / 自托管、域名、证书、入口、备份）确认后再做一次针对真实配置的复核。

## 4. 复现命令

从仓库根目录运行：

```powershell
dotnet dev-certs https --check --trust
dotnet list Nexora.slnx package --vulnerable --include-transitive
pnpm --dir src/Web/nexora-web audit --prod --json
docker version --format '{{.Server.Version}}'
```

配置检查为源码审阅：`Authentication.cs`、`bff-session.ts`、`bff-csrf.ts`、`bff-response.ts`、网关 `Program.cs`、Organization / Reporting `Program.cs`、`AppHost.cs`、`ContainerImageDigests.cs`、`.github/workflows/ci.yml`。

## 5. P6-02 验收对照

| 验收条件 | 结果 |
| --- | --- |
| TLS / 证书 | 本地受信任开发证书通过；生产 TLS 终止与 HSTS 未配置 |
| 密钥 / 令牌托管 | 本地 User Secrets + 运行时生成；生产托管 / 轮换未落地 |
| 依赖漏洞 | NuGet 通过；npm 4 项 low / moderate，已记录豁免理由 |
| 镜像扫描 | Docker 引擎未运行，受阻；应用镜像未定义 |
| 生产配置 | 未复核；Host、OpenAPI、安全头、入口限流均有缺口 |

**结论：本地基线可复现，但未满足“全绿或记录豁免理由”的发布条件；P6-02 保持未勾选。**
