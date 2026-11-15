# W4 PWA 安装、离线壳与安全区布局验收记录

## 范围

W4 参考项目增量第八项：PWA 安装提示、应用壳与离线只读缓存、安全区布局。

验证范围包括 Web App Manifest、service worker 注册与缓存策略、安装提示与冷却、离线 / 恢复提示、安全区样式，以及前端单测、类型检查、构建和浏览器用例。后端未改动。

## 实现摘要

- Manifest：`src/Web/nexora-web/public/manifest.webmanifest` 声明 `name` / `short_name` / `start_url: "/"` / `scope: "/"` / `display: "standalone"` / `display_override`、主题色与背景色，图标包含 192×192、512×512、512×512 maskable 与 SVG。
- 图标：`src/Web/nexora-web/public/icons/` 下 `nexora.svg`、`nexora-maskable.svg` 与三张 PNG；PNG 由 `src/Web/nexora-web/scripts/pwa-icons.mjs` 使用 Playwright Edge 渲染生成，避免额外图像依赖。
- 页面头：`nuxt.config.ts` 增加 manifest 链接、`theme-color`、`apple-mobile-web-app-capable` / `apple-mobile-web-app-title`、`apple-touch-icon` 与 `viewport-fit=cover`。
- Service worker：`src/Web/nexora-web/public/sw.js`
  - 缓存：`nexora-shell-v1`（应用壳与静态资源）、`nexora-data-v1`（只读业务数据）。
  - 安装预缓存 manifest 与图标并 `skipWaiting`；激活清理旧 `nexora-*` 缓存并 `clients.claim()`。
  - 导航请求网络优先，失败回退缓存的 `/`；`/_nuxt/`、`/icons/`、manifest 缓存优先；`/bff/api/*` GET 网络优先、离线回退数据缓存，导出路径不缓存。
  - `/bff/login`、`/bff/logout`、`/bff/callback`、`/bff/antiforgery`、`/bff/sessions`、`/bff/account`、`/bff/me` 不缓存；POST `/bff/logout` 成功后清空数据缓存；`NEXORA_CLEAR_DATA` 消息同样清空。
  - 离线且无缓存时返回 503 HTML / JSON 提示。
- 注册与安装提示：
  - `app/utils/pwa.ts`：捕获 `beforeinstallprompt`、暴露待用事件；独立窗口判定、7 天关闭冷却、`swEnabled`（生产始终启用，开发仅在 `?pwa=1` 启用）。
  - `app/plugins/pwa.client.ts`：应用启动即捕获安装事件并按开关注册 `/sw.js`。
  - `AppInstallPrompt.vue`：安装 / 以后再说；拒绝后写入 `nexora:pwa-install-dismissed`。
  - `AppOfflineNotice.vue`：监听 `offline` / `online`，恢复后短暂显示「网络已恢复」。
  - `app.vue` 在版本提示与状态覆盖层之后挂载离线和安装组件。
- 安全区：`app/assets/css/main.css` 增加 `--nx-safe-top/right/bottom/left`（`env(safe-area-inset-*, 0px)`），并在 `@supports` 内调整侧栏、主区内边距、页头高度与移动端布局。
- 文案：`i18n/locales/zh-CN.json` 与 `en.json` 新增 `pwa.*`（安装标题 / 说明 / 安装 / 以后再说 / 离线 / 已恢复）。
- 测试：
  - `test/pwa.test.ts` 6 项：manifest 字段与图标、service worker 私有路径 / 数据缓存清理 / 导出跳过、独立窗口判定、关闭冷却边界、安装提示组合、开发 / 生产注册开关。
  - `e2e/pwa.spec.ts` 3 项：manifest 与 service worker 控制、安装提示与关闭冷却、离线壳与恢复联网。

## 环境与复现

环境：Windows、Edge（Playwright `channel: msedge`）、Aspire 本地编排、网关 `https://localhost:7443`。Playwright 串行 1 worker，超时 120 秒。

```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build

aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/pwa.spec.ts --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

说明：

- 开发服务器默认不注册 service worker，浏览器用例通过 `/?pwa=1` 开启；生产构建始终注册。
- 离线用例在受控重载后等待应用壳渲染并预热 1.5 秒，再切换离线；Nuxt 开发模式按需提供 Vite 模块，首次受控加载期间未请求的懒加载块不会进入缓存。
- 安装提示用例派发合成 `beforeinstallprompt`，不依赖浏览器真实安装判定。

## 验收断言

| 断言 | 结果 |
| --- | --- |
| manifest 可访问，`display`、`start_url`、scope 与 192 / 512 / maskable 图标齐全 | 通过（单测与 e2e 页面内解析 manifest） |
| 页面声明 manifest 链接并成功注册 service worker、获得页面控制权 | 通过（e2e 等待 `serviceWorker.ready` 与 `controller !== null`） |
| 安装事件出现安装卡片；「以后再说」关闭、写入时间戳并跨重载保持隐藏 | 通过（e2e 3 项之一；单测覆盖 7 天冷却边界） |
| service worker 不缓存私有 BFF 路径与导出，登出清除数据缓存 | 通过（单测读取 `sw.js` 断言路径、导出跳过与 `NEXORA_CLEAR_DATA`） |
| 断网重载由 service worker 返回应用壳，Vue 应用挂载并显示工作区界面 | 通过（e2e 断言 `fromServiceWorker() === true`、`#__nuxt` 可见与工作区标题） |
| 断网显示离线提示，恢复网络后提示 online 并继续可用 | 通过（e2e 断言 `data-state` 由 offline 转 online，恢复后重载 200 且界面正常） |
| 安全区变量与 `@supports` 布局存在 | 通过（样式实现检查；真机刘海 / 圆角视口未单独测量） |
| 前端单测 | 通过（14 文件 77 项，其中本项新增 6 项） |
| 前端 typecheck / lint | 通过（typecheck exit 0；lint 0 error，62 条既存样式告警） |
| 前端生产构建 | 通过（12.6 秒；`.output/public` 含 manifest、sw.js、5 个图标） |
| PWA 聚焦 e2e | 通过（3 passed，12.9 秒） |
| 全量 e2e | 本次未重跑；最近一次全量 33 passed（UPD / STS 记录），RDY 与 PWA 仅跑聚焦用例 |

## 边界与后续增强

- 离线能力按“只读壳 + 最近 GET 数据”实现，不包含离线写队列、后台同步或冲突合并。
- 数据缓存按 URL 存放，未按用户分区；POST 登出会清空，但会话自然过期或 GET 登出不会立即清除，共享设备需显式退出。
- 远程图标（Iconify API）离线不可用，界面可能缺少图标，不影响应用壳与缓存数据。
- 安装卡片依赖浏览器 `beforeinstallprompt`；iOS 等不派发该事件的浏览器只显示独立窗口元数据，不显示安装卡片。
- service worker 版本需在壳资源或策略变更时手动提升 `VERSION`；生产构建可考虑按构建号生成缓存名。
- 安全区样式需在真机（刘海屏、手势条）与横竖屏切换下补视觉验收。
