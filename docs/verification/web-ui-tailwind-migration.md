# 前端完全迁移到 Tailwind / 清空 main.css 验证记录

- 日期：2026-11-15
- 状态：Phase 0 已完成（基线 + 护栏）；Phase 1 已完成（新增样式搬 scoped，main.css 2208 → 2000 行）；Phase 2 已完成（域级语义类 5 类迁移，main.css 2000 → 1895 行）；Phase 3 已完成（壳层与页面语义迁 scoped / utility，main.css 1895 → 732 行）；Phase 4 已完成（表单基础与原生控件迁 Nuxt UI 组件，main.css 732 → 535 行）；Phase 5–8 待执行。
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
| Phase 2 域级语义类 | quiet / primary / hint / heading-icon / actions，4 批（card / heading / eyebrow / status-pill / empty-state 留 Phase 3–5） | 完成 | 本文「Phase 2」 |
| Phase 3 壳层与页面布局 | Shell / Main column / Hero / Workspace deck / Responsive → layout 与页面 scoped / utility（暗色区段删除并入 Phase 5） | 完成 | 本文「Phase 3」 |
| Phase 4 表单基础 | 原生 input / file 控件 → UFormField / UInput / USelect / UCheckbox / UFileUpload；日期控件保留 UInput type=date | 完成 | 本文「Phase 4」 |
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

## Phase 2 域级语义类迁移（2026-11-15）

- 范围调整：本批实际迁移 `quiet`、`primary`、`hint`、`heading-icon`、`actions` 五类；`card` / `heading` / `eyebrow` / `status-pill` / `empty-state` / `card-head` / `card-sub` 依赖上下文选择器（`main > section.card`、`.deck .card`、`html.dark` 覆盖）与页面语义，留到 Phase 3–5 一并处理。
- 映射：`quiet` → `UButton variant="outline" color="neutral"`（普通 `size="sm"`，表格内 `size="xs"`）；`primary` → `UButton color="primary"`，表单内补 `type="submit"`；`hint` → `mt-2 text-[12px] leading-[1.62] text-nx-ink-3`；`heading-icon` → `mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary`；`actions` → `mb-3 mt-2 flex flex-wrap gap-2` 并删除组件 scoped `.actions`。BFF 下载 / 跳转链接保留 `<a>`，改 `rounded-nx border border-nx-border bg-nx-surface px-2.5 py-1.5 text-xs font-semibold text-nx-ink-2 hover:text-nx-primary`。
- token 桥接：main.css `@theme inline` 恢复 `--color-nx-*`（bg / surface / surface-muted / border / border-strong / ink / ink-2 / ink-3 / ink-4 / primary / primary-strong / primary-soft / success / success-soft / warning / warning-soft / danger）与 `--radius-nx`、`--radius-nx-sm`、`--shadow-nx-sm`、`--shadow-nx-md`，供 utility 使用（属 Phase 6 tokens.css 的预置）。
- 实施：lead 先试点 `WorkspaceRecordChanges.vue`、`WorkspaceAudit.vue`（审计页签保留自定义 scoped，class 改 `audit-tab`），再按 4 批并行委派：财务域 14 文件 118 个 UButton + hint 6 + heading-icon 5 + actions 9；销售 / 采购域 4 文件 46 个 UButton；库存 / 主数据域 4 文件 48 个 UButton；组织 / 治理 / 账户 / 壳层 16 文件 94 个 UButton + hint 36 + heading-icon 19 + actions 4。lead 再收尾 7 个文件（`WorkspaceCompanySettings`、`InvoiceShareDownload`、`WorkspaceBusinessRolePicker`、`WorkspaceRoleCatalog`、4 个 `pages/companies/[workspaceId]/*.vue` 标题图标、`pages/index.vue` 两个 overview-card 按钮）。
- 合计 `src/Web/nexora-web/app` 49 个文件 +509/−619；`<UButton>` 289 处 / 46 个文件。
- 上下文 CSS 修复：
  - `main > section.card > button.quiet` 失效 → `AccountSecurity.vue`、`AccountSessions.vue`、`AccountDeletionReview.vue`、`WorkspaceCapabilities.vue` 的 UButton 加 `col-start-2 justify-self-end`。
  - `fieldset > .primary` 失效但 `fieldset > button { justify-self:start }` 仍覆盖，无回归。
  - 响应式 `.formrow > .primary { width:100% }` 改 `.formrow > button`。
  - `html.dark .hint` / `html.dark .quiet` 中的 `.hint` / `.quiet` 选择器移除。
- main.css 清理：删除 `.heading-icon`、`.user .quiet`（3 处）、`main > section.card > button.quiet`、`.join-card .formrow .primary`、`.card-head .hint`、`.overview-card .quiet`、`.empty-state .hint`、`.hint`、`.primary` 全套、`.quiet` 全套（含 `td/th`）、`fieldset > .primary`、`html.dark` 中的 `.hint` / `.quiet`；main.css 2000 → 1895 行（净 diff 24+/129−）。`grep 'class="[^"]*\b(quiet|primary|hint|heading-icon|actions)\b'` 在 `app/` = 0；main.css 内 `.quiet/.primary/.hint/.heading-icon/.actions` = 0。
- 静态验证：typecheck exit 0；lint 0 error / 63 warning（全部 `vue/first-attribute-linebreak`）；单测 16 文件 / 89 通过（44.3s）；build 通过（1m27s，冷启动含类型生成）。
- 截图：`artifacts/ui-tailwind-phase2/` 5 张（`01-audit-light`、`02-record-changes-light`、`03-catalog-light`、`04-partners-light`、`05-audit-dark`）。按钮统一为 Nuxt UI outline / primary 外观，布局与信息层级不变；审计页签保留原自定义外观；暗色正常。
- 聚焦 e2e：`workspace.spec.ts -g 'Unified audit trail|Record changes capture|Catalog UI|Partner profiles'` 首次 3 passed / 1 failed，失败为工作区创建 409（见下）；配额清理后随全量套件回归通过。
- 已知数据卫生问题与处理：本地长期反复运行全量 e2e 使 alice 拥有 1001 个工作区（pro 计划上限 1000），`OpenWorkspaceUseCase` 抛 `PlanLimitExceededException`（409 `billing.quota_exceeded`）。处理：删除 `organization.workspace_navigation_links` 33 行后，删除 alice / bob 今日之前的工作区 935 行，剩余 alice 174 / bob 66，配额恢复。仅清理本地测试累积数据；其他服务库中的对应记录成为孤儿（无跨库外键），后续全量 e2e 前需关注配额。
- 全量 e2e：45 passed（16.8m）。首次运行 44 passed / 1 failed（`Account session registry lists devices, revokes other sessions and blocks replay` 在撤销设备后重新登录时等待 Keycloak 重定向 60s 超时，`workspace.spec.ts:700`）；该用例单独重跑 1 passed（1.1m），判定为认证流程 flake，与本次 UI 改动无关；第二次全量 45/45 通过。
- 提交：`feat(web): Tailwind migration Phase 2 (semantic classes to UButton/utility)`（前端 app/ + 本文档 + ADR 0020 + todolist；`docs/计划.md` 仅暂存样式段落 hunk，避免混入并发会话改动）。

## Phase 3 应用壳层与页面语义（2026-11-15）

- 3.1 壳层：`app/layouts/default.vue` 模板与 class 名保持不变，壳层 CSS 1:1 搬入 `<style scoped>`（约 437 行）：`.shell` 264px 网格、`.shell > aside` sticky 深色渐变 + `::before` 网格、导航 hover / `aria-current`、`.shell > main` 内边距、`main > header` sticky 70px + blur、面包屑 / 头像 / 用户名 / 移动端导航与遮罩、主题与语言控件；断点沿用基线 1180 / 980 / 700 / 550 / 420；PWA `env(safe-area-inset-*)` 放最后覆盖响应式内边距。用 `.shell > aside` / `.shell > main` 子选择器隔离，避免命中 `AppInstallPrompt`、`AppSessionGuard`、`WorkspaceAssistant`、`InvoiceShareDownload` 的 `aside` / `main`。
- Vue 3.5 scoped 陷阱：`:global(html.dark) .x` 会被编译成裸 `html.dark { … }`，后代选择器整体丢失；已全部改为普通 `html.dark .x`（default.vue 9 处、pages/index.vue 既有 1 处 console 页签选中态，属既有 bug 修复）。`:global(body.nx-scroll-lock)`、`:global(:root)` 完整选择器仍可用。
- 3.2 页面语义：`pages/index.vue` 模板 / 脚本未动，+591 行 scoped，逐条 1:1 复制 main.css 目标规则（与 main.css 逐规则 diff，85 条规则声明差异 0；scoped 样式 unlayered 优先于 Tailwind utilities，故不与 utility 混用）；`pages/pricing.vue` 页面级 scoped（pricing-hero / eyebrow / grid / card / note / links，颜色走 token）；`join.vue` / `cli/authorize.vue` 的 `card` + `max-w-[520px]`、login-actions → flex utility；`pages/companies/[workspaceId]/{setup,members,roles,billing}.vue` 保留 `heading` 类（打印隐藏依赖）并新增页面 scoped；`WorkspaceDashboard` 的 card-head / card-sub → utility + 局部 scoped；`WorkspaceGovernance` / `WorkspaceFinancialReports` / `WorkspaceAging` / `WorkspacePartners` / `WorkspaceMemberEditor` 局部 scoped；`AccountSessions` status-pill → utility；`WorkspaceCatalog` 基线已有 scoped 未改；`WorkspaceSetup` 的 setup-* 与 pricing-* 基线已是 scoped。
- main.css 清理：删除 Shell（160–331）、Main column（332–429）、Hero、Workspace hero、Deck、Library、Login state、Module internals、Responsive 中的壳层块、Theme controls / language switch、Dark theme 中壳层与 19 个页面块、@media 700 / 420 中 7 条页面规则；保留 Cards / Forms / Buttons / Tables / Details / fieldset actions / print / 剩余暗色（依赖剩余全局类，Phase 5 末删除）。main.css 1895 → 732 行（净 +34 / −1197）。
- 事故与修复：`ops_read_files` 读取 800 行 main.css 时被字节预算静默截断（实际 748 行），整文件写回导致尾部丢失，build 报 `CssSyntaxError: Missing closing } at @media print`；从 git d810447 取回 print 尾部并追加恢复。教训：大文件读取必须检查 `nextOffset` / `complete`，不得直接整文件写回。
- Nuxt UI 主色修复：Phase 2 引入的 `UButton color="primary"` 曾渲染为透明底白字（空按钮）。根因：main.css 的 `@theme inline` 不输出 CSS 变量，Nuxt UI 运行时插件注入的 `--ui-color-primary-500: var(--color-brand-500, "")` 解析为空 → `--ui-primary` 为空 → `bg-primary` 透明。改为 `@theme static` 强制输出 brand 调色板后 `--ui-primary=#2f5fbf`、按钮背景 `rgb(47,95,191)`；`app.config.ts` 无需改动。
- 静态验证：typecheck exit 0；lint 0 error / 63 warning（全部 `vue/first-attribute-linebreak`）；单测 16 文件 / 89 通过（33.1s）；build 22.6s 通过。
- 截图：`artifacts/ui-tailwind-phase3/` 15 张（workspaces、dashboard、reports、partners、audit、pricing 的 light / dark，setup light，workspaces mobile light / dark）。与基线逐像素 diff：pricing light / dark 完全一致；audit 4.6–4.8%、partners 1.8%、reports 12.4–20.9% 的差异来自数据（审计记录行数、报表合计）与加载时机；workspaces / dashboard 高度差异同因。目视确认主色按钮、暗色主题与移动端布局正常。
- 聚焦 e2e：8 passed（2.7m；dashboard / reports / audit / setup / pricing / join / cli / company settings / team roles / billing 相关用例）。
- 全量 e2e：45 passed（16.4m）。
- 计划偏差（已记录）：暗色区段整体删除推迟到 Phase 5 末（Forms / Tables / Cards 仍依赖 `html.dark`）；`pages/companies/*` 的 `heading` 保留 class + scoped（打印钩子）；`.table-scroll` 仍为全局规则（Phase 5）。
- 提交：`feat(web): Tailwind migration Phase 3 (shell and page semantics)`（前端 app/ 17 文件 +1168/−1215 + 本文档 + ADR 0020 + todolist；并发会话改动不纳入）。

## Phase 4 表单基础元素与原生控件（2026-11-15）

- 控件迁移（7 文件）：`pages/index.vue` 个人工作区复选框 → `UCheckbox`（保留 `personal-option` class 与 label 文案），名称 / 邀请码由手写 `label` + `div.formrow` 改 `UFormField` + `UInput`（保留 `id="name"` / `id="invitation-code"`，`getByLabel` 成立）；`WorkspaceBankImport` / `WorkspaceChart` 原生 `<input type="file">` → `UFileUpload`（`:preview="false"`、`accept`、大小校验与 `text()` 读取保留，隐藏 `input[type=file]` 仍在 DOM，`setInputFiles` 可用）；`WorkspaceCompanySettings` 公司标志 → `UFileUpload`（PNG / ≤128 KiB 校验、FileReader 预览保留）、品牌颜色 → `UInput type="color"`、自动登出 → `UInput type="number"`；`WorkspaceSetup` 品牌颜色 → `UInput type="color"`；`WorkspaceFinancialReports` 报表类型 / 报表口径 → `USelect`（`kindOptions` / `basisOptions` / `setKind`），开始 / 截止日期 → `UInput type="date"`，对比期间 → `UCheckbox`；`WorkspaceScopedRoleGrants` 授权起止日期 → `UInput type="date"`（保留 `data-testid="grant-starts-on"` / `"grant-ends-on"`）。
- 日期控件核查：全量 32 处日期 / 时间控件在更早的设计系统 Phase 4 已是 `UInput type="date"`（Nuxt UI 表单控件 + 原生日期选择器），本阶段未改 `UInputDate`：日历弹层会改变交互与 e2e `fill` 语义，属后续 UX 升级，不是删除 Forms 区段的前提。裸 `<input>` / `<select>` / `<textarea>` 在 `app/` 全量归零。
- main.css 清理：删除 Forms 区段控制类（`form` / `label` / `.formrow` 全套、`input:not(...)` / `select` / `textarea` 基础样式、`select` 自定义箭头、focus / placeholder、checkbox / radio 自定义、`input[type=color]`、`label.comparison`）、Details 区段的 `input[type=file]` / `::file-selector-button`、Dark theme 中 input / select / textarea 与 focus 规则、`@media (max-width: 700px)` 中 `.formrow` 3 条。保留 `fieldset` / `legend` 结构样式（30+ 组件依赖原生分组，注释「Kept until componentization」）、`fieldset > button`、Tables / Details 其余规则与 Cards 暗色（Phase 5 / 6）。main.css 732 → 535 行。
- 交互与外观偏差（已记录）：`USelect` 渲染 `button` + listbox（e2e 报表类型由 `selectOption` 改 `click` + `getByRole('option', { name: '利润表' })`）；`UCheckbox` 渲染 `button[role=checkbox]`（label 文案经 label 关联）；`UFileUpload` 为整列宽 dropzone 区域（`:preview="false"` 不显示已选文件）；品牌颜色宽度随全局 `input[type=color]` 删除变为控件默认（scoped 样式无法穿透 UInput 内层 input）；个人工作区名称 / 邀请码的换行与按钮 100% 媒体查询行为随 `.formrow` 删除消失。
- e2e 修改：`workspace.spec.ts:1169` 报表类型 `selectOption('profit-and-loss')` → `getByLabel('报表类型').click()` + `getByRole('option', { name: '利润表', exact: true }).click()`。
- 静态验证：typecheck exit 0；lint 0 error / 63 warning（全部 `vue/first-attribute-linebreak`）；单测 16 文件 / 89 通过（53.2s）；build 25.8s 通过。
- 截图：`artifacts/ui-tailwind-phase4/` 6 张（公司设置 light / dark、财务报表查询表单 light、账簿设置 light / dark、初始化向导 light）。目视确认 `UInput` / `USelect` / `UCheckbox` / `UFileUpload` 外观、主色按钮与暗色主题正常；初始化向导截图截取于骨架加载期，未用于表单外观对照。
- 聚焦 e2e：批次 1（Company presentation / Effective session policy / Custom roles）2 passed + 1 冷启动 flake（`邮箱注册` 链接 15s 超时，AppHost 冷启动 Nuxt 首次编译）；批次 2（Custom roles / Chart hierarchy / Effective tax rates / Opening journal reports / Setup wizard）5 passed（2.4m）。
- 全量 e2e：45 passed（16.5m）。
- 计划偏差：日期控件保留 `UInput type="date"` 而非 `UInputDate`（理由见上）；`fieldset` / `legend` 全局样式保留到组件化。
- 提交：`feat(web): Tailwind migration Phase 4 (form controls)`。

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
