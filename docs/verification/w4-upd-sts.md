# W4 UPD / STS 版本更新提示与运行时状态页验收记录

## 范围

W4 参考项目增量第三、四项：

- UPD 版本更新提示：构建版本号注入、前端轮询 / 对比、提示重载与稍后处理。
- STS 更新 / 启动 / 维护状态页：运行时状态端点（运行 / 启动 / 更新 / 维护）、前端覆盖页、保留现场（表单草稿）并在恢复后继续。

验证范围包括 BFF 运行时端点、AppHost 环境注入、前端轮询与覆盖层、草稿捕获 / 恢复、单测与浏览器用例。

## 实现摘要

- 服务端运行时信息 `src/Web/nexora-web/server/utils/bff-runtime-info.ts`：
  - `buildInfo()`：`NEXORA_BUILD_VERSION`（缺省 `0.1.0-local`）、`NEXORA_BUILD_ID`（缺省 `版本+进程启动时间 base36+pid`）、`startedAt`（进程启动时间）、`environment`（`NEXORA_BUILD_ENV` 或 `NODE_ENV`）。
  - `runtimeStatus()`：优先读取 `NEXORA_STATUS_FILE` 指向的 JSON（`state` / `message` / `since`），文件缺失、不可读或格式错误时回退到 `NEXORA_STATUS_STATE` / `NEXORA_STATUS_MESSAGE`，默认 `running`；响应附带 `checkedAt`。
- 端点：`src/Web/nexora-web/server/routes/bff/version.get.ts`、`src/Web/nexora-web/server/routes/bff/status.get.ts`。
- AppHost：`src/Hosting/Nexora.AppHost/AppHost.cs:265` 注入 `NEXORA_BUILD_VERSION`（配置 `Web:BuildVersion`，缺省 `0.1.0-local`），`src/Hosting/Nexora.AppHost/AppHost.cs:266` 注入 `NEXORA_STATUS_FILE` 指向 `artifacts/p1/runtime/web-status.json`。
- 运维脚本 `scripts/p1/Set-WebStatus.ps1`：`-State running|starting|updating|maintenance`、`-Message`、可选 `-StatusFile`、`-Clear`；以 UTF-8 无 BOM 写入 JSON，无需重启即可生效。
- 前端工具：
  - `src/Web/nexora-web/app/utils/runtimeStatus.ts`：状态枚举、`parseRuntimeStatus`（消息截断 300、时间归一 ISO、非法状态回落 `running`）、`parseBuildInfo`、`isRuntimeBlocked`、`runtimeStateKey`、`isNewBuild`、`versionSnoozeMs`（30 分钟）。
  - `src/Web/nexora-web/app/utils/formDrafts.ts`：按 `name` 或 `id` 捕获文本 / 复选 / 单选 / 下拉，跳过 password / file / hidden / submit / button / reset / image、禁用控件与无名控件；恢复时用原生 value setter 并派发 `input` / `change`；草稿存 `sessionStorage`，键 `nexora:form-draft:<path>`，保留 24 小时，同一次页面加载内的草稿不恢复。
  - `src/Web/nexora-web/app/utils/pageLoad.ts`：每次文档加载生成 `pageLoadId`，用于区分“覆盖层期间捕获”和“重新加载后恢复”。
- 组合式函数：`useRuntimeStatus.ts`（10 秒轮询，页面可见 / 聚焦 / 恢复联网时立即刷新，5 秒超时、不自动重试，失败保留上次状态）、`useBuildVersion.ts`（60 秒轮询，首次值与最新 `buildId` 不同即提示，可稍后提醒 30 分钟）。
- 客户端插件 `src/Web/nexora-web/app/plugins/runtime-watch.client.ts`：按 `runtimeConfig.public.statusPollMs` / `versionPollMs` 启动轮询。
- 组件：`AppStatusOverlay.vue`（Teleport 到 body，`role="alertdialog"`、`aria-modal`、`data-state`，显示状态标题、运维消息、起始时间、检查时间与「立即重试」，锁定页面滚动，进入阻塞时捕获草稿、恢复后回填并清除草稿）、`AppVersionNotice.vue`（`role="status"`，「立即重载」与「稍后提醒」）。
- 挂载：`src/Web/nexora-web/app/app.vue` 在 `UApp` 内布局之后挂载两个组件。
- 配置与文案：`nuxt.config.ts` 的 `runtimeConfig.public` 增加 `statusPollMs: 10000`、`versionPollMs: 60000`；`i18n/locales/zh-CN.json` 与 `en.json` 增加 `version.*` 与 `runtime.*`；`app/assets/css/main.css` 增加版本卡片、状态覆盖层、滚动锁定与减弱动画样式。
- 测试：`test/runtimeStatus.test.ts` 7 项、`test/formDrafts.test.ts` 7 项；`e2e/runtime-status.spec.ts` 3 项（状态覆盖层 + 草稿跨重载、启动中重试恢复、新构建提示与稍后提醒）。

## 环境与复现

```powershell
dotnet build Nexora.slnx -c Release
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
curl -sk https://localhost:7443/bff/version
curl -sk https://localhost:7443/bff/status
pwsh scripts/p1/Set-WebStatus.ps1 -State maintenance -Message '总账升级中'
curl -sk https://localhost:7443/bff/status
pwsh scripts/p1/Set-WebStatus.ps1 -Clear
pnpm --dir src/Web/nexora-web exec playwright test e2e/runtime-status.spec.ts --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

注意：前端应用源码（`app/`）不会被 Nuxt 开发服务器热更新，改动后需重启 AppHost；`Set-WebStatus.ps1` 修改状态文件后最多一个轮询周期（默认 10 秒）在已打开页面生效。

## 验收断言

| 断言 | 结果 |
| --- | --- |
| `/bff/version` 返回版本、构建标识、启动时间与环境 | 通过（`{"version":"0.1.0-local","buildId":"0.1.0-local+mwgcqlyv-pb8","startedAt":"2026-11-14T11:58:20.599Z","environment":"development"}`） |
| `/bff/status` 默认 `running` | 通过 |
| 状态文件切换为 `maintenance` 后端点返回状态、消息与起始时间，无需重启 | 通过（`Set-WebStatus.ps1 -State maintenance -Message '总账升级中'` 后立即返回 `maintenance` 与消息） |
| `-Clear` 后恢复 `running` | 通过 |
| 维护状态覆盖页面、显示状态与运维消息、锁定滚动、提供立即重试 | 通过（e2e 断言 `data-state="maintenance"`、文案「维护中」、`body.nx-scroll-lock`） |
| 覆盖期间捕获表单草稿，恢复后回填且清除草稿 | 通过（e2e 断言 `sessionStorage[nexora:form-draft:/]` 含输入，重载后值恢复） |
| 启动中状态可通过「立即重试」恢复 | 通过（e2e 用例 2） |
| 新构建标识出现提示，可稍后提醒且再次刷新不再出现 | 通过（e2e 用例 3） |
| 前端单测 | 通过（全量 12 文件 67 项，其中本项新增 `runtimeStatus` 7 项、`formDrafts` 7 项） |
| 前端 typecheck / lint / 构建 | 通过（lint 0 error，62 条既存样式告警） |
| 全量 e2e 回归 | 通过（33 passed，15.4m；含本项 3 项与 workspace / email-onboarding 既有用例） |
| `dotnet build` | 通过（0 警告 0 错误，含 AppHost 环境注入） |
| `dotnet test` 全量 | 通过（36/36） |

## 边界与后续增强

- 版本提示基于同一 BFF 进程的 `buildId`；当前构建标识由进程启动时间与 pid 派生，部署新版本必然触发提示，但无法区分同一进程内的资源更新。CI 可注入稳定的 `NEXORA_BUILD_ID`（版本 + 提交号）以获得可追溯标识。
- 状态来源为环境变量或运维脚本写入的 JSON 文件，无鉴权、无按工作区粒度的差异化状态；多实例部署需共享状态文件或改为集中配置服务。
- 覆盖层只区分运行 / 启动 / 更新 / 维护四种全局状态，未表达单个下游依赖的降级；「立即重试」仅是重新拉取状态，不触发后端自检。
- 草稿捕获为通用 DOM 扫描，只覆盖 `name` / `id` 的文本、复选、单选与下拉，不覆盖富文本、文件与自定义组件内部状态；草稿存于 `sessionStorage`，关闭标签页即丢失，多标签页之间不合并。
- 离线与断网恢复由后续 PWA 项覆盖，本项仅在 `online` 事件时立即刷新状态。
- 运维脚本未纳入自动化测试，状态端点与文件解析由单测和手工 curl 覆盖。
