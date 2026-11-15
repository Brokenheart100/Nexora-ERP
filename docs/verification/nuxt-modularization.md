# Web 工作台 Nuxt 模块化重构

日期：2026-11-11。状态：本地类型检查、生产构建和完整浏览器 e2e 通过；远端 CI 与生产验收未执行。

## 范围

把原先集中在 `app.vue` 的工作台拆到 Nuxt 4 标准目录，并接入 Nuxt UI、Nuxt Icon、Zod、Pinia、i18n 与颜色模式。未修改 BFF、业务 API、数据模型、面板顺序、可访问名称或财务报表打印隔离结构。

- `src/Web/nexora-web/app/layouts/default.vue`：应用壳层、侧栏、页头、语言切换、深浅色切换、退出登录；`<main>` 内 header 后直接渲染页面插槽。
- `src/Web/nexora-web/app/pages/index.vue`：工作区落地页、创建 / 加入表单、工作区列表与概览，以及全部业务组件挂载。
- `src/Web/nexora-web/app/pages/invoice-share.vue`：独立分享页，使用 `layout: false`。
- `src/Web/nexora-web/app/stores/workspace.ts`：Pinia setup store，承载身份、工作区、投影、创建、邀请、切换和退出状态。
- `src/Web/nexora-web/app/utils/workspace.ts`：工作区类型、名称空值兜底与 Zod 输入校验。
- `src/Web/nexora-web/i18n/locales/{zh-CN,en}.json`：应用壳层与工作区落地页的中英文文案。
- `src/Web/nexora-web/app/app.config.ts`：Nuxt UI 主色与中性色。
- `src/Web/nexora-web/app/app.vue`：仅保留 `UApp`、`NuxtLayout`、`NuxtPage` 与语言 head 元数据。
- `src/Web/nexora-web/nuxt.config.ts`：注册 Nuxt UI、Pinia、i18n、color-mode、ESLint 与 test-utils 模块，保留全局样式入口与 `ssr: false`。
- `src/Web/nexora-web/eslint.config.mjs`：在 Nuxt 生成的 flat config 上关闭 `vue/multi-word-component-names` 与 `vue/no-multiple-template-root`；后者因为页面必须有多个根节点，才能让 `.financial-reports` 继续作为 `<main>` 的直接子元素。
- `src/Web/nexora-web/vitest.config.ts`、`src/Web/nexora-web/test/workspace.test.ts`：Nuxt 测试环境与工作区工具函数单元测试。
- `src/Web/nexora-web/pnpm-workspace.yaml`：允许 `esbuild` 与 `vue-demi` 构建脚本，替代 pnpm 12 不再读取的 `package.json` pnpm 字段。

## 设计决定

- i18n 使用 `strategy: 'no_prefix'`，URL 不增加语言前缀；`detectBrowserLanguage: false`，默认中文，避免浏览器语言改变默认可访问名称。切换语言写入 cookie。
- 深浅色模式使用 `html.dark`（`classSuffix: ''`），偏好写入 cookie 而不是 `localStorage`；e2e 明确断言登录后 `localStorage` 与 `sessionStorage` 为空。
- 财务报表仍是 `.shell > main` 的直接子元素，`.financial-reports` 的 `region` 名称、打印按钮与打印隔离选择器保持不变。
- 工作区名称在 store 载入时统一规范化，`null` / 空白名称显示「未命名工作区」，头像首字不再直接读取原始 `name`。

## 工程质量工具

- `@nuxt/eslint` 提供 Nuxt 目录感知的 flat config；`pnpm lint` 检查，`pnpm lint:fix` 修复格式问题。首次接入后已修复动态 `delete` 与模板变量遮蔽，并统一模板属性换行。
- `@nuxt/test-utils` + Vitest + happy-dom 提供 Nuxt 运行时测试环境；`pnpm test:unit` 运行 `test/` 下的单元测试。当前测试覆盖工作区名称兜底、名称长度校验和邀请码完整性。
- Vitest 的 Nuxt 环境首次启动需要生成 `.nuxt`，`hookTimeout` 设为 60 秒；纯工具函数测试不依赖 BFF。

## 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `pnpm --dir src/Web/nexora-web typecheck` | 通过，exit 0；仅剩 vue-router volar 插件路径的非致命 warning |
| 生产构建 | `pnpm --dir src/Web/nexora-web build` | 通过，exit 0；Nuxt 4.6.4，Nitro node-server，9.91s |
| ESLint | `pnpm --dir src/Web/nexora-web lint` | 通过，0 error / 0 warning |
| 单元测试 | `pnpm --dir src/Web/nexora-web test:unit` | 4 passed |
| 完整浏览器 e2e | `pnpm --dir src/Web/nexora-web test:e2e` | 11 passed（6.4m），1 worker |

完整 e2e 覆盖：OIDC + TOTP、CSRF、工作区创建与投影、租户拒绝、退出登录、邀请与角色停用 / 恢复、Catalog、往来单位、公司展示与 390px 视口、科目表、税率、P5 账簿与报表打印、采购审批、P4 销售 / 库存 / 发票结算。

开发期预览检查另确认：`input#name` 与原生 label 保留；「创建个人工作区」复选框可访问名称未变；`html.dark` 可切换；英文标题切换生效；「已同步」精确文本唯一；`.financial-reports` 的父元素仍为 `MAIN`；390px 无横向溢出；无 page error 或 console error。

## 复现

```powershell
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait bff --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 120 --non-interactive
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
pnpm --dir src/Web/nexora-web test:e2e
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

运行 e2e 前必须停止占用 3100 端口的本地 Nuxt 开发服务器，避免它与 AppHost 的 `web` 资源争用 3000 端口；若 TOTP 因同一时间窗口被拒绝，等待下一个 30 秒窗口再重试。

## 边界

- 国际化目前覆盖应用壳层和工作区落地页；业务面板仍使用中文原文，后续可按面板逐步抽取文案键。
- 深色模式覆盖工作台全局样式与主要组件容器；图表、打印输出以浅色为准。
- 完整 e2e 11/11 在 ESLint / test-utils 接入前通过；接入后的改动仅包含模板格式化和等价的 `Reflect.deleteProperty` 改写，重跑 OIDC 用例通过。P4 用例复跑时 Playwright 浏览器进程报 `RangeError: Failed to allocate memory`，页面快照仍正常渲染，未将其作为 UI 回归结论。
- 未执行远端 GitHub Actions 与生产部署；完整 e2e 使用本地 AppHost、BFF、Edge 与开发身份。
