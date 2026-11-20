# 删除另写的 Dashboard UI

2026-11-20，按用户要求已删除替代 UI，恢复用户原有界面。删除后的本地检查通过；原页面仍使用模拟数据。

## 删除范围

- 删除 27 个另写的 Vue 组件，包括 `Live*` 业务面板、编辑器、首页、用户区、工作区菜单、反馈组件，`LiveDashboardLayout`、`MockDashboardLayout`、`DashboardShell` 和新增 MSW 场景选择器。
- 删除替代界面的专用页面和浏览器用例；移除入口、组件注册及测试引用。原默认布局已从核对一致的原始版本恢复。
- 原有 14 个文件路由页面、主题、原型组件及其模拟数据保留。原 `error.vue` 和已有工作区菜单的其他改动不回退。
- BFF、OIDC、会话、CSRF、MFA、API 代理、类型化客户端、未知写入与幂等处理、MSW handlers 和网络测试保留。BFF 的浏览器验证改为核对真实 `/bff/me`，不依赖已删除界面的身份标签。

## 当前状态

页面恢复为原有模拟原型。`dataMode=live` 的配置及独立 BFF 服务保留，但页面仍使用原型自己的模拟数据，并保留模拟说明；不能把它作为真实业务 UI 验收。`dev:msw` 保留网络拦截能力，原页面尚未改为通过这些接口取数。

涉及原页面真实接入的 D1、D2、D3、D4 标记已恢复待完成。历史验收与截图保留，标注为历史，不将已删除的界面继续算作当前交付。

## 验证

| 检查 | 结果 |
| --- | --- |
| 删除与引用 | 清单内 38 个文件全部删除，其中 27 个 Vue 组件；源码、测试无已删除组件或专用测试辅助文件的残留引用 |
| 原页面保留 | 14 个页面的 SHA-256 与本次删除前一致；默认布局与原始 HEAD 版本一致 |
| lint、TypeScript strict | 通过；保留的错误页仅整理模板格式，行为不变 |
| Vitest | 26 个文件、100 项测试通过 |
| 构建 | mock 与 live BFF 配置的两种构建均通过 |
| 原型浏览器 | Edge 串行：原首页、原布局、商品目录导航通过，1 项 |
| MSW 浏览器 | 原布局挂载、请求确由 Service Worker 响应、模拟目录契约通过，1 项；不代表页面已从 MSW 取数 |
| 独立 BFF 浏览器 | HTTPS 跳转、原型预览、登录注销、CSRF、ETag/幂等/并发冲突、双会话隔离、邮箱登录和只读拒绝，4 项通过 |
| 生命周期 | 指定 AppHost 启动后等待 gateway 健康，验证完成后正常停止；4 个持久卷保留 |

删除清单、原页面指纹和结果见 [验证清单](../../artifacts/dashboard-ui-removal/validation.json)。完整执行日志保存在本地受保护的 `artifacts/p1/runtime/ui-removal-*.log`。

复现命令从仓库根目录执行：

```powershell
pnpm --dir src/Web/nexora-dashboard lint
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard exec vitest run --maxWorkers 2
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
try { pnpm --dir src/Web/nexora-dashboard build }
finally { Remove-Item Env:NUXT_PUBLIC_DATA_MODE }
pnpm --dir src/Web/nexora-dashboard test:e2e --grep '原有 UI'
pnpm --dir src/Web/nexora-dashboard test:msw
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-dashboard test:e2e --grep '新版 HTTPS|独立 BFF 登录|两个真实会话|邮箱登录与只读拒绝'
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

MSW 首次检查未能在 15 秒窗口内完成原布局挂载；将浏览器启动等待上限调整为 45 秒后通过，未修改页面逻辑。Nuxt Hints 在 SPA 初始壳产生 lang/title 提示，本轮未改动原界面来消除这些提示。

本轮仅验证本地删除、原型回归和保留的 BFF 基础。未重跑所有业务流程、远程 CI 或生产验收；不将这些结果计为原页面的 D2–D4 真实业务验收。
