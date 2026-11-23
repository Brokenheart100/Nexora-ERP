# D14 新版 Dashboard 独立发布与回退

日期为 2026-11-23。验收使用新版 `src/Web/nexora-dashboard` 的 Node 产物、本地 Aspire 与独立的 GitHub Actions 检查。生产环境与试运行按 [P6 验收](../计划.md#107-p6--试运行与发布) 跟踪。

## 构建与运行

使用依赖基线锁定的 Node 24.21.0 与 pnpm 12.16.1。构建时选择模式，运行时再注入环境设置。部署应保留 `server/` 和 `public/` 等完整 Nitro 产物，使用 `NODE_ENV=production` 启动 `server/index.mjs`。HTTPS 终止在反向代理，代理保留外部 Host 并流式转发 SSE。[Nuxt Node 部署](https://nuxt.com/docs/4.x/getting-started/deployment#nodejs-server) · [Nuxt 运行时配置](https://nuxt.com/docs/4.x/guide/going-further/runtime-config)

| 环境变量 | 运行职责 |
| --- | --- |
| `NODE_ENV`、`NITRO_HOST`、`NITRO_PORT` | 以生产模式启动 Node，监听代理可访问的内部地址。本机演练监听 `127.0.0.1`。 |
| `NUXT_PUBLIC_DATA_MODE`、`NUXT_PUBLIC_BFF_ORIGIN` | 真实入口使用 `live` 和完整 HTTPS origin。本机为 `https://localhost:7444`，模拟预览使用 `mock`。 |
| `NUXT_BFF_ISSUER`、`NUXT_BFF_CLIENT_SECRET` | Keycloak realm 与新版 BFF 专用客户端凭据。注册回调和退出回调使用同一个 HTTPS origin。 |
| `NUXT_BFF_SESSION_KEY`、`NUXT_BFF_REDIS_URL` | 保护并保存服务端会话。重启或切换兼容版本时沿用环境的密钥和 Redis。 |
| `NUXT_BFF_GATEWAY_URL` | Nitro 连接固定业务 Gateway。 |
| `NEXORA_BUILD_VERSION`、`NEXORA_BUILD_ID` | `/bff/version` 报告发布版本和产物标识。使用已验收的产物摘要标识版本。 |

## 本地复现

从仓库根目录运行，使用 D0 的联调样例、Alice 和 Bob 的开发身份及本机 Mailpit。当前 AppHost 停止后可切换到产物启动模式。

```powershell
$dashboard = 'src/Web/nexora-dashboard'
pnpm --dir $dashboard install --frozen-lockfile
try {
    $env:NUXT_PUBLIC_DATA_MODE = 'mock'
    pnpm --dir $dashboard build
    $env:NUXT_PUBLIC_DATA_MODE = 'live'
    pnpm --dir $dashboard build
} finally {
    Remove-Item Env:NUXT_PUBLIC_DATA_MODE
}
node "$dashboard/scripts/verify-node-builds.mjs"

$archive = 'artifacts/p1/runtime/nexora-dashboard-d14-local.tar.gz'
tar -czf $archive -C "$dashboard/.output-live" .
$project = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
$env:Dashboard__UseNodeOutput = 'true'
$env:Dashboard__BuildVersion = '0.1.0-d14-local'
$env:Dashboard__BuildId = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
aspire start --apphost $project --non-interactive
if ($LASTEXITCODE -ne 0) { throw 'AppHost 启动失败' }
try {
    aspire wait gateway --apphost $project --timeout 180 --non-interactive
    if ($LASTEXITCODE -ne 0) { throw 'Gateway 就绪检查失败' }
    $resource = aspire describe dashboard --apphost $project --format json --non-interactive | ConvertFrom-Json
    $env:NODE_EXTRA_CA_CERTS = $resource.resources[0].environment.NODE_EXTRA_CA_CERTS
    $env:NEXORA_D14_RELEASE = '1'
    pnpm --dir $dashboard test:e2e e2e/prototype.spec.ts e2e/production.spec.ts e2e/d14-release-ui.spec.ts
} finally {
    aspire stop --apphost $project --non-interactive
    Remove-Item Env:Dashboard__UseNodeOutput,Env:Dashboard__BuildVersion,Env:Dashboard__BuildId,Env:NEXORA_D14_RELEASE -ErrorAction SilentlyContinue
}
```

`NEXORA_D14_RELEASE=1` 将 Playwright 的模拟入口切换到已构建的 `.output`。真实场景要求从新版 HTTPS 入口读到本地演练的产物标识，再使用 Aspire 停止和恢复指定的 `dashboard` 资源。报告位于 `artifacts/p1/runtime/dashboard-d14-browser-results.json`。测试附件只记录构建标识、状态、操作名称与去敏追踪 ID。

## 本地验收结果

| 检查 | 结果 |
| --- | --- |
| 编译与启动 | Mock 与 live 的 Nuxt Node 构建通过。Node 验证脚本检查 mock 深链接、静态资源和 live 缺私有配置时的启动失败。 |
| 生产产物独立运行 | 已有真实会话通过 Node 产物访问。HTML 与公开资源未包含所检查的私有配置值。Redis 不可用时 `/alive` 为 `200`，`/health` 和会话请求为 `503`。 |
| Edge 模拟与真实入口 | 三项浏览器场景通过。以构建后的 mock 预览验证布局与目录导航。新版 HTTPS 入口验证静态资源、采购深链接刷新、两次 OIDC 回调、工作区切换、Mailpit 邀请注册回跳、匿名 PDF 下载及助手 SSE。受保护会话、PDF 分享和助手流的响应均使用 `no-store`。 |
| 双身份 | Alice 与 Bob 保持各自会话。Alice 可读取自己的报表导出，Bob 在相同工作区访问该导出得到 `404`。去敏追踪 ID 为 `00-390b963bdf3523309d8a1fc11e3b78e7-3a1c0d314e9264d6-01`。 |
| 首版暂停与恢复 | 暂停 Dashboard 资源后，新版入口在 2.5 秒探测预算内不可用，业务 Gateway `/alive` 仍为 `200`。恢复原产物后，两个会话、采购单及待收货许可可读，报表以原水位完成并下载 CSV，发票邮件任务可回读为 `sent`。 |

本地产物版本为 `0.1.0-d14-local`。归档 `artifacts/p1/runtime/nexora-dashboard-d14-20261123-local.tar.gz` 的 SHA-256 为 `a322f11858801540de4ad649e09a029b7c47a28565e319f0c9cd078beed6632a`。重启前后 `/bff/version` 返回同一摘要，进程启动时间更新。去敏证据保存在 `artifacts/p1/runtime/dashboard-d14-local-a322f1185880.json`。验收完成后正常停止 AppHost，保留持久卷。

## GitHub Actions

验收分支为 `codex/dashboard-d14-release`，下列两个远端检查均针对代码提交 `042f1228af2acaaa56eaffa2ded2c44b2cbf916e`。

| 检查 | 结果 |
| --- | --- |
| Dashboard release checks | Ubuntu 24.04 上发布脚本和验收用例的 ESLint、全应用类型检查、174 项前端单测、mock 和 live 构建及 Node 启动检查均通过。[运行记录及产物](https://github.com/Brokenheart100/Nexora-ERP/actions/runs/45106598998) |
| P1 foundation | Release 构建及后端测试通过。本次配套接口变更也经本地 Dashboard 调用验证，分支迁移文件改动为 0。[运行记录](https://github.com/Brokenheart100/Nexora-ERP/actions/runs/45106598853) |

从 Actions 下载的 `nexora-dashboard-042f1228af2acaaa56eaffa2ded2c44b2cbf916e.tar.gz` 包含 `server/index.mjs` 和 `public/_nuxt/`。计算所得 SHA-256 为 `f89753650aafe04415161c7ecdb832df5be00251e9f334fce8a383e8946ee524`，与产物内的校验文件一致。CI 的 JUnit 报告记录 174 项检查、0 项失败。产物按源码提交保存。[独立工作流](../../.github/workflows/dashboard-ci.yml) · [GitHub Actions 产物](https://docs.github.com/en/actions/tutorials/store-and-share-data)

干净 runner 先以 `NODE_ENV=development` 生成 `.nuxt/`，供 ESLint 和 TypeScript 使用。全量 `pnpm lint` 的基线扫描仍报告 3,025 个错误和 140 个警告，发布检查使用本次发布代码的 ESLint、全应用类型检查与单测。

## 回退操作

首版使用暂停与恢复演练。后续发布将上一次验收通过的完整产物及 SHA-256 与候选版本一并保留。发生入口或 BFF 故障时，先停止受影响的 Dashboard 进程，选择并核对上一份产物，再以同一 HTTPS origin 和服务端配置启动。观察 `/health` 与 `/bff/version` 后，用现有会话核对已提交单据和异步任务，必要时再走一次登录。数据库与消息事实按 [P6 回退原则](p6-05-operations-drill.md) 验收。
