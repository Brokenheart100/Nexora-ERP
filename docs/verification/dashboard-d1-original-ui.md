# Dashboard D1：在原有 UI 接入登录会话

2026-11-20。沿用 `src/Web/nexora-dashboard/` 的原页面、默认布局和 Carbon 主题。本文记录 D1 验收时点；后续已完成的原商品页及类型化请求接入见 [D2 验收](dashboard-d2-original-ui.md)，其余业务继续在原页面推进。

## 原界面保留范围

本轮开始时记录 112 个 Vue / CSS 文件的 SHA-256。保留全部文件，仅调整以下 3 个原文件，其余 109 个保持原始字节；新增 Vue 页面、组件和布局均为 0。

| 原文件 | 本轮适配 |
| --- | --- |
| `app/components/UserMenu.vue` | 原用户菜单显示 BFF 身份；接登录、邮箱登录、开通、重新验证和退出。原主题、语言与模拟预览入口保留。 |
| `app/layouts/default.vue` | 仅绑定会话来源说明；保持原侧栏、导航、搜索与页面插槽。 |
| `app/pages/settings.vue` | `/join` 作为原设置页别名，定位到原邀请区域，显示登录状态。没有增加另一张邀请页面。 |

原有 14 个页面文件保留，商品、采购、库存、财务等业务界面及其模拟数据不重写。`app.vue → NuxtLayout → NuxtPage` 入口不变。

## D1 行为

- 纯原型 `3001` 继续离线模拟身份，不自动访问 BFF。MSW `3003` 和真实 Aspire 入口 `7444` 共用原用户菜单与同一组会话请求。
- 启动及窗口重新获得焦点时读取 `/bff/me` 和 `/bff/security/capabilities`。仅保存身份摘要和安全能力，不保存令牌。区分未登录、服务不可用和安全状态读取失败，并提供重试。
- 登录、邮箱验证码登录与邮箱开通使用已有 BFF / Keycloak 入口。通过服务端登录状态保存 `returnTo`，完成后返回原页面、查询参数及片段。
- 回跳只允许现有页面；拒绝外站、协议相对 URL、反斜杠、控制字符与未知路径。OIDC state、nonce、PKCE、服务端 Redis 会话和已有安全检查继续生效。
- 重新验证使用真实 `prompt=login`，由 Keycloak 完成独立 MFA。菜单不再把演示身份或演示设备数作为真实身份与 MFA 证明。
- 退出先获取 CSRF，再用真实 POST 表单完成 BFF 与 Keycloak 注销。较早的身份响应不能覆盖新身份，也不能在退出后恢复旧身份。
- MSW 模拟相同会话接口、状态码、回跳与 CSRF 表单；使用独立命名的模拟 Cookie。模拟 Cookie 不具备真实 BFF 认证能力，MSW 仍仅允许显式 mock 开发环境。GET 注销与真实 BFF 一致，仅回跳而不清除会话；退出必须使用带 CSRF 的 POST。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| lint / TypeScript strict | 通过 |
| Vitest | 29 个文件、125 项通过，其中本轮增加 25 项会话与回跳契约检查 |
| mock / live 配置构建 | 两种 Node 产物均通过，开发输出与生产输出保持独立 |
| MSW 原界面核心回归 | 4 项通过：原目录与拦截、菜单登录恢复与退出、不可用状态、原设置页邀请回跳 |
| 真实入口回归 | 11 个不同场景最终通过，包含 2 个新增原界面流程，以及已有 BFF、并发、隔离、配额、下载头、刷新和产物检查 |
| UI 交互与多尺寸 | 第 5 项 MSW 浏览器检查通过：键盘打开、关闭与登录；320 / 768 / 1024 / 1440 宽度内菜单可见且未越界；保留语言切换，英文退出操作可用；无页面脚本错误 |
| 条件反转检查 | 在隔离副本反转回跳白名单条件，测试断言失败；原测试恢复后 13 项通过。未改动运行中 AppHost 的应用源码。 |

真实入口首次全量为 10/11：一项在注销回跳期间过早执行页面读取，导致执行上下文销毁。测试辅助等待原菜单显示未登录后再读取 BFF；受影响的两个场景重跑 2/2 通过。失败日志及首次全量报告保存在本地运行目录，未跳过场景。

浏览器固定中文环境以避免默认浏览器语言影响文案断言。初次 MSW 文案失败来自默认英语环境，固定测试语言后原菜单核心 4 项全部通过。Nuxt Hints 对 SPA 初始壳仍有 lang/title 提示，本轮未修改原业务界面处理这些既有提示。

命令从仓库根目录执行：

```powershell
pnpm --dir src/Web/nexora-dashboard lint
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
try { pnpm --dir src/Web/nexora-dashboard build }
finally { Remove-Item Env:NUXT_PUBLIC_DATA_MODE }
pnpm --dir src/Web/nexora-dashboard test:msw
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
aspire wait dashboard --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 120 --non-interactive
pnpm --dir src/Web/nexora-dashboard test:e2e
pnpm --dir src/Web/nexora-dashboard test:e2e --grep '独立 BFF 登录|邮箱登录与只读拒绝'
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

[结果清单与页面指纹](../../artifacts/dashboard-d1-original-ui/validation.json) · [桌面原界面](../../artifacts/dashboard-d1-original-ui/msw-1440.png) · [移动端原侧栏](../../artifacts/dashboard-d1-original-ui/msw-320.png)。完整日志与首次失败记录保存在本地受保护的 `artifacts/p1/runtime/dashboard-d1-*`，不会将密钥、Cookie、OTP 或会话令牌写入公开验收清单。

## 当前边界

D1 接通原界面的登录与会话；业务页面、工作区选择和业务表单仍为原型模拟数据。D2–D4 保持待完成，随后在这些原页面中适配客户端与权限，不增加另一套业务页面。`/join` 本轮只验证登录回跳，尚未接受或兑换邀请，D12 的邀请流程继续待完成。

本轮临时启动的指定 AppHost 已正常停止，运行实例为 0；PostgreSQL、Redis、Keycloak 与 RabbitMQ 的 4 个持久卷保留。本轮为本地构建、模拟浏览器与真实 AppHost 检查，不表示远程 CI、真实外部邮件送达或生产发布验收。

实现依据：[Nuxt 插件依赖](https://nuxt.com/docs/4.x/directory-structure/app/plugins) · [Nuxt 完整页面跳转](https://nuxt.com/docs/4.x/api/utils/navigate-to) · [MSW 模拟 Cookie](https://mswjs.io/docs/http/mocking-responses/cookies) · [BFF ADR](../adr/0009-oidc-bff.md) · [接入 TODO](../ui-dashboard-api-integration-todolist.md)。
