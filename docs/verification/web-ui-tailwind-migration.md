# 前端完全迁移到 Tailwind / 清空 main.css 验证记录

- 日期：2026-11-15
- 状态：Phase 0 已完成（基线 + 护栏）；Phase 1 已完成（新增样式搬 scoped，main.css 2208 → 2000 行）；Phase 2–8 待执行。
- 关联：[迁移 TODO](../../todolist.md)、[ADR 0020](../adr/0020-frontend-design-system-layering.md)、[Phase 1–7 记录](./web-ui-design-system-phase1-2.md)。

## 终态定义

`app/assets/css/main.css` 最终只保留：

```css
@import "tailwindcss";
@import "@nuxt/ui";
@import "./tokens.css";
```

- tokens 以 CSS 变量 + `@theme inline` 桥接保留，暗色靠 token 切换自动生效；模板不写大面积 `dark:`。
- 模板优先级：Nuxt UI 组件 > Tailwind utility > 组件 scoped CSS。
- 复杂规则不强行 utility 化，留在组件 scoped：财务报表打印隔离、固定列 / 高密度表格、PWA 安全区 `env()`、壳层 sticky / 滚动锁。
- 不改动：label 文本、`name` / `id`、`data-testid`、错误文案、API payload、权限与业务逻辑。

## 批次表

| 批次 | 范围 | 状态 | 验证记录 |
|---|---|---|---|
| Phase 0 基线与护栏 | git 基线提交、明暗 / 移动截图、e2e 类选择器改 data-testid、全量 e2e 基线、冻结规则 | 完成 | 本文「Phase 0」 |
| Phase 1 搬出新增样式 | version-notice / status-overlay / PWA 安全区 → 组件 / layout scoped | 完成 | 本文「Phase 1」 |
| Phase 2 域级语义类 | quiet / primary / card / hint / heading-icon / actions，4 批 | 待执行 | |
| Phase 3 壳层与页面布局 | Shell / Main column / Hero / Workspace deck / Responsive / 暗色 → layout 与页面 utility | 待执行 | |
| Phase 4 表单基础 | 原生 input/select/textarea 基础样式 → UFormField / UInput / USelect / UInputDate / UFileUpload | 待执行 | |
| Phase 5 表格 / 详情 | Tables / Details / lists / dl / Module internals | 待执行 | |
| Phase 6 拆分 tokens.css | tokens 与 `@theme inline` 拆到独立文件 | 待执行 | |
| Phase 7 删除死 CSS | 删除未使用选择器、暗色残余与重复 reset | 待执行 | |
| Phase 8 收尾 | main.css 只剩 @import；全量验证与文档 | 待执行 | |

## Phase 0 基线（2026-11-15）

### 静态基线

| 指标 | 数值 |
|---|---|
| main.css | 2208 行 / 41,514 bytes / 326 个规则块 |
| 类选择器 | 91 个（88 个在模板中使用；`dark` / `iconify` / `nx-scroll-lock` 为 JS / 主题动态类） |
| 模板 class 属性 | 752 个（45 组件 + 9 页面 + 1 layout） |
| 高频全局类 | `quiet` 41 文件 / 222 次、`primary` 36 / 75、`heading-icon` 32 / 38、`card` 31 / 35、`hint` 17 / 48、`actions` 13 / 28 |
| scoped 样式 | 39 个组件；`var(--nx-*)` 17 个组件 / 221 处 |
| 原生日期 / 时间输入 | 32 处 / 16 个组件 |
| 原生文件上传 | 3 处（BankImport / Chart / CompanySettings） |
| `UForm` 使用 | 0；zod 仅 `utils/workspace.ts` |
| 类型检查 | `pnpm typecheck` exit 0（仅既有 @vue/language-core 噪声） |
| lint | 0 error / 61 warning（全部 `vue/first-attribute-linebreak`） |
| 单测 | 16 文件 / 89 通过 |
| build | 25.5s 通过 |
| 全量 e2e | 47 passed（18.4m；含 2 个临时截图用例，业务 45 用例全部通过） |

### 截图基线

目录 `artifacts/ui-tailwind-baseline/`（临时 Playwright 截图 spec，不纳入版本控制）：

- 桌面 light：`01-login`、`02-workspaces-light`、`03-dashboard-light` … `12-audit-light`、`30-pricing-light`
- 桌面 dark：`02-workspaces-dark`、`20-dashboard-dark`、`20-book-dark`、`20-audit-dark`（Phase 1 前基线）
- 移动 light：`40-workspaces-mobile`、`41-dashboard-mobile`
- 打印：复用 `artifacts/ui-baseline-p0/08-reports-print.png`（Phase 0 修复打印隔离后的报表打印）

截图使用既有开发身份 alice 登录；面板多为空 / 错误态（新建工作区投影未就绪），用于样式对照而非数据验收。

### e2e 选择器护栏

Phase 0 起 e2e 不再使用 main.css 类选择器。`workspace.spec.ts` 仅有的 3 个 class 选择器（`.setup-sub`、`.dashboard-trend`、`.assistant-sessions`）已在 ADR 0020 Phase 0 改为 data-testid；后续新增 spec 中的类选择器一并替换：

| 旧选择器 | 新定位 |
|---|---|
| `billing-subx.spec.ts` `.plan.signup` | `getByTestId('plan-pro')` + 文本「注册时选择」 |
| `.plan`（专业版 / 标准版卡片） | `getByTestId('plan-pro')` / `getByTestId('plan-standard')` |
| `readiness.spec.ts` `.readiness .summary` | `getByTestId('readiness-summary')` |
| `.readiness tbody` | `getByTestId('readiness-costs')` |

冻结规则：

1. 不在 main.css 新增业务选择器（只减不增）；确需新增时先更新 ADR。
2. 新代码使用 Nuxt UI + Tailwind utility；复杂规则放组件 scoped。
3. e2e 新断言用 `data-testid` / role / label，禁止 CSS 类选择器。
4. tokens 只增不改名；暗色通过 token 切换，不写大面积 `dark:`。
5. 每批结束跑 typecheck / lint / unit / build + 聚焦 e2e + light/dark 截图对照；Phase 末跑全量 e2e。

## Phase 1 搬出新增样式

- 范围：main.css 删除 1997–2207 行（211 行）→ 2000 行；`grep 'version-notice|status-|nx-safe|nx-scroll-lock|nx-spin|nx-rise'` 在 main.css = 0。
- `AppVersionNotice.vue`：`<style scoped>` 承接 `.version-notice`、`.version-text`（含 strong/span）、`.version-actions`、`@keyframes nx-rise` 与 reduced-motion。
- `AppStatusOverlay.vue`：`<style scoped>` 承接 `.status-overlay`、`.status-card`、`.status-orbit` 及 `[data-state=updating|maintenance]`、`.status-eyebrow`、`.status-body`、`.status-since`、`.status-checked`、`.status-hint`、`:global(body.nx-scroll-lock){overflow:hidden}`、`@keyframes nx-spin/nx-rise` 与 reduced-motion。
- `layouts/default.vue`：`<style scoped>` 承接 `:global(:root)` 的 `--nx-safe-*`、`.shell` 的 `100vh/100dvh`、`@supports (padding: env(safe-area-inset-top))` 下 `.shell > aside` / `.shell > main` / `.shell > main > header` 的安全区内边距，以及 ≤700px 的移动端内边距。选择器加 `.shell >` 前缀，避免命中子组件内的 `aside`（如 `WorkspaceAssistant` 的会话历史）。
- e2e 护栏转换：`billing-subx.spec.ts` 的 `.plan` / `.plan.signup` → `getByTestId('plan-pro')` / `getByTestId('plan-standard')`（`article.plan` 加 `:data-testid="'plan-' + plan.code"`）；`readiness.spec.ts` 的 `.readiness .summary` / `.readiness tbody` → `getByTestId('readiness-summary')` / `getByTestId('readiness-costs')`。全 e2e 目录不再使用 main.css 类选择器（`runtime-status.spec.ts` 仅断言 `body` 的 `nx-scroll-lock` 类，属状态类）。
- 静态验证：typecheck exit 0；lint 0 error / 61 warning（全部 `vue/first-attribute-linebreak`）；单测 16 文件 89 通过；build 25.5s。
- 聚焦 e2e：`runtime-status.spec.ts`、`pwa.spec.ts`、`billing-subx.spec.ts`、`readiness.spec.ts` 共 11 passed（34.9s）。
- 截图对照：`artifacts/ui-tailwind-phase1/` 35 张与基线 `artifacts/ui-tailwind-baseline/` 逐像素比较——32 张 0 差异；`02-workspaces-light`、`02-workspaces-dark`、`40-workspaces-mobile` 仅高度变化（e2e 反复创建工作区导致列表增长）；`09-purchasing-light`、`10-sales-light` 各 3.49% 差异集中在单据列表区域（数据变化），无样式回归。
- 全量 e2e：`playwright test e2e` 全目录 47 passed（18.4m），其中 2 个为临时截图用例（`ui-tailwind-baseline.spec.ts`，收尾已删除），业务用例 45 个全部通过。注：截图用例复用了基线目录，因 Phase 1 与基线像素等价（32/35 完全一致），覆盖后的基线仍可作 Phase 2 对照。
- 提交：`git commit`（Phase 0–1 前端改动 + 本文档 + ADR 0020 + todolist）。

## 复现命令

```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/runtime-status.spec.ts e2e/pwa.spec.ts --reporter=line
```
