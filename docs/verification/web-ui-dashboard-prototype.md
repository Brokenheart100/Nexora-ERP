# Nexora Dashboard UI 原型验收

日期为 2026-11-17。本机使用仓库锁定的 Node 24 与 pnpm 12，仅启动新版前端，不启动 Aspire 或后端服务。

## 实施范围

在 `src/Web/nexora-dashboard/` 由官方 Nuxt UI Dashboard 模板创建独立预览项目，保留原 `src/Web/nexora-web/`。项目维护自己的 `package.json` 与 `pnpm-lock.yaml`，保留模板 MIT 许可。Nuxt 4.6.4、Vue 3.5.44、TypeScript strict、Nuxt UI 4.12.0、Tailwind 4.3.5，端口 3001。

| 路径 | 职责 |
| --- | --- |
| `app/layouts/default.vue` | 复用 `UDashboardGroup/Sidebar/Panel/Navbar`，Carbon 深色左栏、顶栏当前页与常用操作、移动端侧栏抽屉。 |
| `app/assets/css/main.css` | Tailwind 主题色板与 Nuxt UI 语义变量：3rem 顶栏、`#f4f4f4` 浅灰画布、白色内容层、`#e0e0e0` 细边框、品牌蓝 `#0f62fe`、0.125rem 圆角、暗色 Gray 100 语义值。 |
| `app/app.config.ts` | `primary='brand'`、`neutral='carbon'`。 |
| `app/mocks/index.ts` | 3 个工作区、18 个商品、8 张采购单（含 12 行长明细）、9 条待办、7 条最近单据；覆盖长名称、空结果和常见状态。 |
| `app/pages/index.vue` | 工作台：KPI、`UChart` 月度采购额、待办、最近单据；切换工作区同步更新。 |
| `app/pages/catalog.vue` | 商品目录：搜索、状态与分类筛选、`UPagination`、`USlideover` 编辑抽屉，保存仅更新本次预览。 |
| `app/pages/purchase-orders.vue` | 采购订单：列表、筛选、详情抽屉（供应商、状态、明细、金额）与返回列表。 |
| `app/components/WorkspaceMenu.vue`、`UserMenu.vue` | 工作区切换与明暗主题菜单，替换模板团队与用户菜单。 |

模板的收件箱、客户、演示设置、示例通知、Nitro 模拟接口与闲置依赖已删除，保留 `UApp`、Dashboard 布局与 MIT 许可。

## 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

开发服务器使用 `devServer: { port: 3001, host: 'localhost' }`，普通 `pnpm dev` 即可访问 `http://localhost:3001/`。

## 本地结果

- `install --frozen-lockfile`、`typecheck`、`lint`、`build` 全部退出码 0。生产构建用时 18.0s，服务端产物 5.9 MB（gzip 1.33 MB）。
- `http://localhost:3001/` 返回 200，直接进入工作台。
- 临时 Playwright 脚本（Edge、1440×1000 与 390×844）跑通三个页面、明暗切换、工作区切换、商品编辑与筛选、采购详情与返回、键盘焦点，1 项通过（26.2s），浏览器控制台错误为空。临时脚本与日志未提交。
- 截图见 `artifacts/ui-dashboard-prototype/`：`01-dashboard-light.png` … `12-order-detail-mobile.png`，共 12 张。桌面与手机目视检查通过：首屏含表头与数据、折叠导航可用、长表可横向滚动、暗色层级正常、金额右对齐。

## 缺口与已知事项

- 本机未安装 IBM Plex Sans，字体栈回退到 `Segoe UI`，Carbon 观感依赖字号、间距和颜色，正式接入时可随产品字体方案调整。
- 所有页面仅使用本地模拟数据，编辑只更新本次预览，刷新恢复初始样例；未连接后端或 API。
- Nuxt UI `UTable` 的列使用空字符串 `header: ''` 会触发 hydration mismatch（控制台 `Hydration completed but contains mismatches.`）；本项目的操作列改用 `header: '操作'` 规避。
- 曾出现 `pnpm dev` 报 `options.hostname.toLowerCase is not a function`：Nuxt CLI 开发缓存 `node_modules/.cache/nuxt/dev-server.json` 会把 `hostname` 写成对象 `{}`。删除该缓存并在 `nuxt.config.ts` 显式设置 `devServer.host: 'localhost'` 后稳定。
- 新项目目录尚未提交，工作区另有并发改动；是否提交待确认。

## 第二轮 UI 完善（2026-11-17）

按 [UI 完善 TODO](../ui-dashboard-todolist.md) 完成首轮桌面优先完善：Carbon 图标集、全局搜索、通知中心、页面组件重组与元素级动效。仍未接后端，移动端不做专项验收。

### 范围

- 图标：新增 `@iconify-json/carbon`（1.2.30）开发依赖，`app/` 内图标统一为 `i-carbon-*`。
- 全局框架：侧栏 `UDashboardSearchButton` + 全局 `UDashboardSearch`（页面/商品/采购单/最近单据四组、⌘K）；导航栏 `UChip` + `USlideover` 通知中心（待审批、低库存、最近单据，全部已读）。
- 页面：工作台 `UPageHeader`/`UCard`/`UProgress`/`UTimeline`；商品目录 `UCard` 表格 + `UEmpty` 空态；采购订单详情 `UStepper` 进度 + 入库进度 `UProgress` + 金额汇总。
- 动效：`.nx-reveal` 进入上浮（60ms 交错）、`.nx-lift` 悬停、`.nx-table` 行悬停；`prefers-reduced-motion: reduce` 全部关闭。
- 页面转场 `app.pageTransition` 未采用：`UDashboardPanel` 根是 fragment，启用后出现 `[NUXT_E4004] does not have a single root node`；页面模板已统一用 `<div class="contents">` 包单根，但转场仍会警告，故改用元素级动效。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

### 本地结果

- `install --frozen-lockfile`、`typecheck`、`lint`、`build` 全部退出码 0；生产构建 18.5s，产物 7.42 MB（gzip 1.7 MB）。
- `http://localhost:3001/` 返回 200，三个页面可交互。
- 临时 Playwright 脚本（Edge、1440×1000）覆盖工作台/搜索面板/通知面板/暗色/商品目录/编辑抽屉/采购订单/订单详情/工作区切换/键盘焦点/reduced-motion，1 项通过（21.2s），控制台错误为空。临时脚本已删除，不提交。
- 截图见 `artifacts/ui-dashboard-polish/`：`01-dashboard-light.png`、`02-search-palette.png`、`03-notifications.png`、`04-dashboard-dark.png`、`05-catalog-light.png`、`06-catalog-editor.png`、`07-orders-light.png`、`08-order-detail.png`、`09-workspace-switch.png`、`10-catalog-keyboard-focus.png`，共 10 张。

### 本轮修复与已知事项

- `UStepper` 的数字 `modelValue` 是 0-based 步骤索引；订单状态映射按索引传递后，未完成步骤正确灰显。
- `UDashboardSidebar` 的 `#header` 固定 3rem 高，放入两行内容会被 body 遮挡；全局搜索按钮已移到侧栏默认插槽、导航菜单之前。
- ESLint better-tailwindcss 插件默认不解析 `@layer components` 中的自定义类；`eslint.config.mjs` 的 `settings['better-tailwindcss']` 增加 `detectComponentClasses: true` 后 `nx-*` 类不再报未知类。
- 其余已知事项（IBM Plex 回退 Segoe UI、mock 数据刷新恢复、`UTable` 空 `header` 的 hydration mismatch 规避、dev hint 缓存）见上一节，保持有效。
## 第三轮 UI 完善（2026-11-17，导入导出/骨架/动效补尾）

按 [UI 完善 TODO](../ui-dashboard-todolist.md) 完成上一轮留尾：CSV 导入导出菜单、加载骨架、分页淡入与时间线进入动画。

### 范围

- 新增 `app/utils/csv.ts`：`downloadCsv(filename, headers, rows)` 负责字段转义、U+FEFF BOM、Blob 与 `a[download]`，导出完全在浏览器本地完成。
- 新增 `app/composables/useMockRefresh.ts`：550ms 模拟刷新，刷新中忽略重复触发，组件卸载清理定时器。
- 商品目录：`UDropdownMenu` 收纳「导出当前结果（CSV）」「导入商品（CSV 演示）」；工具栏新增刷新按钮（带 loading）；表格加载时显示 8 行 `USkeleton` 骨架；分页切换的表格容器加 `.nx-fade` 淡入。
- 采购订单：`UDropdownMenu` 收纳「导出当前筛选（CSV）」；刷新按钮、骨架屏、分页淡入同商品目录。
- 工作台：刷新按钮改为 550ms 模拟刷新，KPI/图表/待办/最近单据/时间线分别显示骨架；导出报表改为真实 CSV；四张内容卡片补 `.nx-lift` 悬停；时间线用 `.nx-reveal` 300ms 延迟进入。
- `app/assets/css/main.css`：新增 `.nx-fade`（180ms 淡入）与 `nx-fade-in`，`prefers-reduced-motion: reduce` 下关闭。
- `app/app.config.ts`：`ui.skeleton.base` 由 `bg-elevated` 覆盖为 `bg-accented`——默认值在浅色主题下与白色卡片同色，骨架屏不可见。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

临时 Playwright 脚本（Edge、1440×1000、未提交）：工作台点「刷新」断言 `dashboard-skeleton` 可见；商品目录 `catalog-more` 导出下载并断言文件名 `商品目录-YYYY-MM-DD.csv`；刷新后断言骨架；分页切到第 2 页断言容器计算样式 `animationName` 含 `nx-fade-in`；采购订单刷新骨架与 `采购订单-YYYY-MM-DD.csv` 导出。

### 本地结果

- `install --frozen-lockfile`、`typecheck`、`lint`、`build` 全部退出码 0；生产构建 17.7s，产物 7.44 MB（gzip 1.71 MB）。
- 临时 Playwright 脚本 1 项通过（14.0s），控制台错误为空。
- 截图见 `artifacts/ui-dashboard-todolist/`：`11-dashboard-refresh-skeleton.png`、`12-catalog-more-menu.png`、`13-catalog-refresh-skeleton.png`、`14-catalog-page2-fade.png`、`15-orders-refresh-skeleton.png`、`16-orders-export-toast.png`（编号沿用上轮 01–10）。

### 本轮修复与已知事项

- `USkeleton` 默认 `bg-elevated` 在浅色主题等于卡片白色，首轮截图骨架不可见；通过 `app.config.ts` 的 `ui.skeleton.base` 改为 `bg-accented`（light `#e0e0e0` / dark `#393939`），已复查截图。
- `UPagination` 按钮的可访问名称是 `Page N`（数字文本在 `span[data-slot="label"]`），自动化定位用 `data-testid` 容器内 `button[value="N"]` 更稳。
- 导入 CSV 为演示交互：只读取行数并给出 Toast，不真正解析或写入数据；所有导出为浏览器本地生成，未经过后端。

## B0 模拟数据与全局底座（2026-11-17）

### 范围

- 依赖：`@faker-js/faker` 10.6.0、`pinia` 4.1.0、`@pinia/nuxt` 1.0.3、`zod` 4.6.7、`@vueuse/nuxt` 15.0.0；Nuxt 模块增加 `@pinia/nuxt`、`@vueuse/nuxt`。
- `app/mocks/` 按域拆分（types、workspaces、catalog、partners、purchasing、sales、inventory、finance、organization、dashboard、factories），`index.ts` 统一导出；Faker 固定 seed `20261117`，核心样例固定、批量数据由工厂生成。
- `app/stores/`：`useWorkspaceStore`、`useSessionStore`、`useUiStore`；`app/composables/`：`useMockAsync`、`useMockPermissions`、`useMockState`、`useMockRefresh`、`useNotifications`、`useMockWorkspace` 迁入 Pinia。
- `app/utils/mockSchemas.ts`：列表筛选、商品编辑与 `?state=` 的 Zod schema；商品编辑抽屉改用 `UForm` + Zod 校验。
- 新增空壳路由 `/sales`、`/inventory`、`/finance`、`/settings`（`ModulePlaceholder`），侧栏与命令面板同步入口。
- `?state=loading|empty|error|forbidden` 在商品目录与采购订单演示骨架、空态、错误、无权限；VueUse 用于搜索防抖、`useMediaQuery` 断点、`useIntersectionObserver` 进入动画与 `useClipboard` 复制单号。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

临时 Playwright 脚本（Edge、1440×1000、未提交）：工作台、商品目录、采购订单、四个新路由逐一打开并截图；点「刷新」断言骨架可见；`?state=loading|empty|error|forbidden` 断言对应状态块与「恢复正常」；切换工作区断言标题；末段收集控制台错误并断言为空。

### 本地结果

- `install --frozen-lockfile`、`typecheck`、`lint`、`build` 全部退出码 0；生产构建 22.3s，产物 10.8 MB（gzip 2.89 MB）。
- 临时 Playwright 脚本 1 项通过（16.3s），控制台错误为空。
- 截图见 `artifacts/ui-dashboard-b0/`：`01-dashboard.png`、`02-sales.png`、`03-inventory.png`、`04-finance.png`、`05-settings.png`、`06-catalog-loading.png`、`07-catalog-empty.png`、`08-catalog-error.png`、`09-catalog-forbidden.png`、`10-orders-forbidden.png`、`11-catalog-editor-validation.png`、`12-catalog-saved.png`。
- 预览：`http://localhost:3001/`（`pnpm --dir src/Web/nexora-dashboard dev`，端口与 host 写在 `nuxt.config.ts` 的 `devServer`）。

### 本轮修复与已知事项

- Faker 每次生成都重新 `seed`，保证 SSR 与客户端同序，避免随机数据触发 hydration mismatch。
- 所有写操作仍只改内存状态并提示刷新恢复；`?state=` 仅用于演示与截图，不改变数据。
- `@nuxt/fonts` 自托管 IBM Plex Sans 留在 B1；当前仍回退 `Segoe UI`。
- CSV 导入仍为演示交互，只统计行数，不解析或写入。
- 新路由只是空壳（标题、说明、模拟数据摘要），业务表格在 B3–B8 逐项填充。

## B1 壳层、身份与全局框架（2026-11-18）

### 范围

- 字体：新增开发依赖 `@nuxt/fonts` 1.2.0 并在 `nuxt.config.ts` 注册；`fonts.defaults` 开启 preload，权重 400/500/600/700，family 使用 Google provider 自托管。`app/assets/css/main.css` 的 body 使用字面量 `'IBM Plex Sans', 'Segoe UI', …` 字体栈（@nuxt/fonts 只扫描字面量 font-family，不解析 CSS 变量）。
- 身份与会话：新增 `app/mocks/identity.ts`（演示用户张明远，MFA 已启用，3 条登录会话）与 `app/mocks/billing.ts`（8 张发票，供搜索用）；`useSessionStore` 增加 `sessions`、`currentSession`、`endOtherSessions()`；`AccountSecuritySlideover` 展示账户、MFA、会话与安全设置入口，`UserMenu` 增加 MFA/会话摘要与「安全设置」。
- 工作区：`ModulePlaceholder` 按当前工作区计算模拟数据摘要，监听 `workspace.id` 重新执行 `useMockAsync` 并显示骨架；侧栏采购订单、销售订单徽标均按当前工作区计算。
- 通知：`useNotifications` 扩展到公告、采购审批、销售审批、库存预警、最近单据五类来源；抽屉支持单条已读与全部已读，未读数与时间线未读点同步。
- 命令面板：扩展为页面、商品、往来单位、采购订单、销售订单、发票、最近单据、错误页演示八组，结果全部来自 `app/mocks/`。
- 面包屑：新增 `AppBreadcrumb`，商品目录、采购订单列表与订单详情、四个新模块页均显示「工作台 / 模块」或「工作台 / 模块 / 单号」。
- 错误页：`app/error.vue` 按 403/404/500 显示不同图标、标题与说明；403 提供「切换工作区」下拉；新增 `/demo/error/[code]` 演示入口（未知状态码回退 404）。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

生产预览可用 `PORT=3002 node .output/server/index.mjs`（在项目目录内）启动。临时 Playwright 脚本（Edge、1440×1000、未提交）打开工作台校验字体、通知来源与单条/全部已读、账户安全抽屉与会话结束、命令面板新分组、商品目录面包屑、销售页工作区切换、403/404/500 演示页，并切换深色主题截图；末段断言无预期外控制台错误。

### 本地结果

- `install --frozen-lockfile`、`typecheck`、`lint`、`build` 全部退出码 0；客户端构建 4.1s、服务端 3.9s，产物 10.9 MB（gzip 2.9 MB）。
- 生产预览 7 条路由均返回 200，`/demo/error/403` 返回 403；`http://localhost:3001/` 保持 200。
- 浏览器字体：`document.fonts.check('14px "IBM Plex Sans"')` 为 true，400/500/600 状态均为 loaded；700 在未使用时保持 unloaded（按需加载）。生产构建 head 含 `<link rel="preload" as="font">`，字体文件由 `/_nuxt/fonts/*.woff2` 自托管。
- 临时 Playwright 脚本 1 项通过（26.3s）；控制台仅有 3 条故意访问 403/404/500 演示页产生的 `Failed to load resource`，过滤后无其他错误。
- 截图见 `artifacts/ui-dashboard-b1/`：`01-dashboard-light.png`、`02-notifications.png`、`03-notifications-read.png`、`04-account-security.png`、`05-account-security-ended.png`、`06-command-palette.png`、`07-catalog-breadcrumb.png`、`08-sales-workspace-switched.png`、`09-error-403.png`、`10-error-404.png`、`11-error-500.png`、`12-dashboard-dark.png`、`13-notifications-dark.png`。

### 本轮修复与已知事项

- `@nuxt/fonts` 必须看到 CSS 中的字面量 `font-family` 才会生成 `@font-face`；原先 body 使用 `var(--font-sans)` 时字体表为空。修改 CSS 后 HMR 不会重新扫描字体，需要重启开发服务器。
- 开发服务器 head 不输出字体 `preload` 标签，只有生产构建输出；因此字体预加载结论以生产预览为准。
- `USlideover` 不会把 `data-testid` 透传到 `role=dialog` 根元素，自动化改用可访问名称定位（`getByRole('dialog', { name: '通知' })`）。
- 账户安全设置的三项入口原先误用 `UButton` 不支持的 `description` prop，已改为自定义两行条目加「打开」按钮。
- 用原子替换方式编辑组件后，开发服务器 watcher 偶发未触发重编译，页面仍渲染旧组件；重启开发服务器后恢复。若后续再遇到“改了代码但界面不变”，先重启 `pnpm dev`。
- 403/404/500 演示页会在浏览器网络面板产生对应的资源错误，这是验收中唯一允许的控制台错误来源。
- 仍为纯 UI 阶段：账户、会话、发票、公告均为本地模拟数据，刷新后恢复；未连接 BFF、后端或真实权限服务。

## B2–B4 工作台增强、主数据与采购（2026-11-18）

### 范围

- B2 工作台：6 张 KPI（本月采购额、本月销售额、应收/应付、待处理采购、库存预警、在售商品）；趋势支持采购额/销售额/应收三指标切换；待办补审批/草稿/逾期分组、全部完成与撤销；最近单据补销售单与发票；最近动态接变更记录并支持类型筛选；数据更新时间、刷新骨架与三类空态（`?empty=todos|documents|activity`）。
- B3 主数据：商品目录补新建/编辑抽屉、详情抽屉（采购/销售/库存引用数、变更记录、归档恢复）、批量选择与批量归档恢复、CSV 导入演示与导出；新增伙伴档案页（搜索、类型/状态筛选、详情、编辑、CSV 导出，覆盖客户/供应商/捐赠人）；新增定义维护页（分类/单位/税码三页签，新增/编辑/删除与引用数提示）；新增变更记录页（共用 `ChangeLogTimeline`，实体与操作者筛选、分页）。
- B4 采购：列表补状态/供应商/日期筛选、筛选计数与重置；详情补审批轨迹、关联收货、审计记录，12 行长单据在 `max-h-72 overflow-auto` 容器内滚动；新建/编辑抽屉含明细行增删改、保存草稿/提交审批；批准/驳回写入本地审批轨迹与审计；收货登记支持超量校验、模拟 loading，并推进部分入库/已入库；新增采购审计页（单据/操作筛选、分页、CSV 导出）；打印预览使用 `@media print` 与独立打印组件，不接 PDF 服务。
- 统一入口：侧栏扩到 11 项（新增伙伴档案、主数据定义、采购审计、变更记录）；命令面板新增主数据定义组与变更记录组，页面组覆盖全部模块；订单与审计页共用状态、金额和面包屑展示。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

临时 Playwright 脚本（Edge、1440×1000、未提交，验收后删除）：第一段覆盖 B2 工作台 KPI、趋势切换、待办分组与全部完成/撤销、刷新骨架、最近动态筛选、KPI 跳转与三类空态；第二段覆盖 B3/B4 新建商品、商品详情/归档、批量归档、伙伴搜索/详情/编辑、定义三页签与删除引用提示、变更记录筛选、采购供应商筛选、详情审批、收货超量/收货完成、打印预览、驳回样例、采购审计筛选与 CSV 下载、命令面板新分组；第三段验证商品搜索空态、商品/变更记录/采购单的 `?state=empty|error` 与长单据表格内部滚动。

### 本地结果

- `install --frozen-lockfile`、`typecheck`、`lint`、`build` 全部退出码 0；生产构建 37.8s，产物 11.4 MB（gzip 2.98 MB）。仅有单 chunk 超过 500 kB 的既有提示，没有新增错误。
- B2 浏览器验收 1 项通过（21.6s），控制台错误为空；截图见 `artifacts/ui-dashboard-b2/`：`01-dashboard-b2-light.png`、`02-dashboard-trend-sales.png`、`03-dashboard-todos-done.png`、`04-dashboard-refresh-skeleton.png`、`05-dashboard-empty-states.png`、`05-dashboard-empty-todos.png`、`05-dashboard-empty-documents.png`、`05-dashboard-empty-activity.png`、`06-dashboard-b2-dark.png`。
- B3/B4 浏览器验收 1 项通过（50.9s），控制台错误为空；空态/长单据补充验收 1 项通过（13.7s），控制台错误为空。截图见 `artifacts/ui-dashboard-b3b4/`：`01-catalog-create-form.png`、`02-catalog-created.png`、`03-catalog-detail.png`、`04-catalog-batch.png`、`05-partners-detail.png`、`06-partners-edit-form.png`、`07-definitions-categories.png`、`08-definitions-edit-form.png`、`09-definitions-delete-confirm.png`、`10-change-log-filtered.png`、`11-orders-filtered.png`、`12-order-detail-pending.png`、`13-order-receipt-over.png`、`14-order-receipt-recorded.png`、`15-order-print-preview.png`、`16-order-rejected.png`、`17-audit-filtered.png`、`18-command-palette.png`、`19-command-palette-definitions.png`、`20-catalog-empty-search.png`、`21-catalog-state-empty.png`、`22-change-log-empty.png`、`23-order-long-detail.png`、`24-orders-state-empty.png`、`25-orders-state-error.png`。
- 预览：`http://localhost:3001/` 保持运行；全部 11 条页面路由返回 200。

### 本轮修复与已知事项

- 命令面板由客户端模块提供，原子编辑后开发服务器偶发未热更新，页面仍显示旧条目；重启 `pnpm dev` 后恢复（与 B1 记录的 watcher 现象一致）。验收前已重启并复查新页面与主数据/变更记录分组。
- `USlideover` 同样不把 `data-testid` 透传到 `role=dialog`；验收用可见文案、表单 testid 与列表行定位。截图前等待 400ms，避免抽屉滑入动画尚未结束造成右侧被裁切的错觉。
- 收货抽屉默认按「待收数量」预填，正常提交会一次收满；超量校验用超出待收数量的输入触发（例如 999999），错误在抽屉内 `UAlert` 展示，不改数据。
- 采购审计的 CSV、商品与伙伴导出均由浏览器本地生成并带 BOM；商品 CSV 导入仍只读取行数，不解析字段、不写入数据。
- 变更记录、审批轨迹、审计与收货均为本地内存写操作，刷新页面恢复初始样例；切换工作区后列表、徽标、命令面板与工作台统计同步切换。
- 仍为纯 UI 阶段：未连接 BFF、后端、数据库或真实权限服务；`?state=` 与「演示」文案只用于验收。

## B5–B7 销售应收、库存与财务（2026-11-18）

### 范围

- B5 销售与应收：报价/销售订单双页签、状态/客户/日期筛选与分页；详情抽屉含状态步骤、明细、审批轨迹与关联履约；新建订单/报价抽屉、报价转销售单确认；批准/驳回、发起履约、部分履约/完成；应收工作台；发票列表/详情、PDF 占位预览、分享链接复制、发送记录与失败重试；定期开票暂停/恢复。入口为 `/sales`。
- B6 库存：仓库卡片与仓库详情、库存位置表（仓库切换/搜索/分页）、库存流水（商品/类型/时间筛选与 CSV 导出）、收货与出库、盘点与调拨、低库存视图；单据号可从流水跳转采购/销售详情。入口为 `/inventory`。
- B7 财务：财务工作台（期间、建账、年结与待办）、科目树、凭证列表与新建凭证、试算平衡/利润表/资产负债表/现金流量表、账龄与伙伴账、税务、银行账户与流水导入预览/匹配/对账。入口为 `/finance`。
- 数据全部来自 `app/mocks/`；写操作只修改本地内存并提示「仅本次预览，刷新后恢复」。所有列表页支持 `?state=empty|error|forbidden` 演示。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

开发服务器保持在 `http://localhost:3001/`，临时 Playwright 脚本（Edge、1440×1000）覆盖销售/库存/财务三组流程，验收后删除。

### 本地结果

- `install --frozen-lockfile`、`typecheck`、`lint`、`build` 全部退出码 0；最终构建 41.9s，产物 12.3 MB（gzip 3.1 MB）；仅有单 chunk 超过 500 kB 的既有提示。
- B5/B6/B7 浏览器验收 3 项通过（1.0m），控制台错误与页面异常均为空。
- 库存流水单据号跳转补充验证 1 项通过（8.9s）：`/inventory` 的流水可从 `PO-` 单号跳到 `/purchase-orders?order=...`、从 `SO-` 单号跳到 `/sales?tab=orders&order=...`，并自动打开详情抽屉；控制台为空。
- 截图见 `artifacts/ui-dashboard-b5b7-acceptance/`，共 37 张，覆盖销售订单/报价/转单/审批/履约/发票/应收/定期开票、库存总览/位置/收货/流水/盘点/调拨/低库存/错误态、财务工作台/科目/凭证/报表/账龄税务/银行对账/错误与空态。
- 本地预览 `http://localhost:3001/` 保持运行；开发服务器各页面路由（含 `?state=` 演示参数）均返回 200。

### 本轮修复与已知事项

- 财务页 toolbar 的当前期间原先硬编码为 2026-11，与 `FinanceWorkbench` 的「当前期间」不一致；改为从期间列表取首个未关账期间，当前显示 2026-10 · 关账中。
- `USlideover` 不会把根 `data-testid` 透传到 `role=dialog`；验收订单/发票/凭证抽屉时改用 `getByRole('dialog').filter({ hasText: 单号或标题 })` 定位，按钮内部 testid 仍可正常使用。
- 库存流水跳转采购/销售详情通过查询参数实现：`purchase-orders.vue` 与 `sales.vue` 在 `onMounted` 读取 `route.query.order` 并打开对应抽屉；库存页直接 `navigateTo` 到目标路由。
- 原子替换 Vue 文件后开发服务器 watcher 偶发不重编译，新增的 `onMounted` 逻辑未进入浏览器包；重启 `pnpm dev` 后恢复。验收前已重启并确认跳转生效。
- 仍为纯 UI 阶段：无 BFF、后端、数据库或真实权限；发票分享链接、邮件发送、税务申报、银行导入与对账均只更新本地状态，刷新恢复。

## 表格列宽分隔条（2026-11-18）

### 范围

- 新增 `app/components/ResizableTable.vue` 包裹 `UTable`，利用 TanStack Table 的 column sizing 能力与 `tableApi` 暴露的 `getResizeHandler()` 实现列宽拖拽；未新增依赖。
- 15 个文件中的 27 个表格实例全部替换为 `ResizableTable`（21 个页面级表格 + 6 个详情抽屉/弹窗表格），保留各表原有 props、`-cell`/`-header` slot、class 与 `data-testid`；仅 `catalog` 的自定义 `#select-header` 全选表头保持原样。
- 表头右侧显示 Carbon 风格竖线手柄；拖拽时实时更新列宽，首次拖拽按表头当前视觉宽度初始化，固定布局后超宽表格出现横向滚动；最后一列不提供手柄。
- 样式位于 `app/assets/css/main.css` 的 `@layer components`：`.nx-table-resizable` 表头相对定位与 `::after` 手柄、`.nx-table-fixed` 表格 `table-layout: fixed` 与省略号、拖拽期间 `body.nx-col-resizing`。
- 桌面优先，不新增移动端手势；列宽只保存在组件内，刷新或切换页面后恢复默认。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

在 `http://localhost:3001/` 打开任一带表格的页面，将鼠标移到表头右缘出现竖向分隔条后左右拖拽；详情抽屉与 `/inventory` 的盘点弹窗同样适用。验收使用临时 Playwright 脚本（Edge、1440×1000，验收后删除）。

### 本地结果

- `install --frozen-lockfile`、`typecheck`、`lint`、`build` 全部退出码 0；构建 51.1s，产物 12.3 MB（gzip 3.1 MB），仅保留既有的单 chunk 超过 500 kB 提示。
- 页面级 21 个表格全部检测到手柄，首个和末个表格拖拽后列宽增加、根容器出现横向滚动；6 个详情表格（销售订单、报价单、发票、新建盘点、调拨、采购订单）同样通过。
- 明细表因 sticky 表头，手柄挂在 `position: sticky` 的 `th` 上，行为与普通表头一致；商品目录全选复选框、销售订单与采购订单的金额单元格 slot 转发均正常。
- 全量探针 `consoleErrors` 与 `badResponses` 均为空；暗色目录截图正常（`html` 为 `dark`，手柄背景随主题变化）。
- 截图 31 张与 `report.json` 见 `artifacts/ui-dashboard-splitters/`，覆盖各主页面、详情抽屉、拖拽后状态与暗色目录。
- 修复：`StocktakeSlideover.vue` 的数量输入 slot 原为 `#counted-cell`，与列 id `countedQty` 不匹配导致 10 行输入框不渲染；改为 `#countedQty-cell` 后输入框正常显示，实测首行 33 → 999 时差异徽标从 `0` 变为 `+966`，差异计数为 1 行。

### 已知事项

- 列宽不持久化：刷新或重新进入页面后恢复默认宽度；如后续需要，可按页面在 Pinia 或 sessionStorage 中保存。
- 固定列宽后内容较长时显示省略号并依赖横向滚动，这是桌面端可拖拽表格的预期取舍；表格密度切换仍待在 B9 完成。

## Nuxt 测试栈与 ResizableTable 冒烟测试（2026-11-18）

### 范围

- dashboard 新增开发依赖 `@nuxt/test-utils` 4.4.0、`vitest` 5.1.0、`@vue/test-utils` ^2.5.1（解析 2.6.0）、`happy-dom` ^21.0.4，新增 `pnpm test:unit`；均不进入生产运行时。
- `vitest.config.ts` 使用 `defineVitestConfig`，设置 `environment: 'nuxt'`、`test/**/*.test.ts`、60s hook 与 30s test 超时。
- `test/resizable-table.test.ts` 用 `mountSuspended` 挂载 `ResizableTable`，覆盖两列表头、一行数据、根元素 `nx-table-resizable` class 与 `data-testid` 透传。
- 不引入 MSW、json-server 或 Service Worker；B0 的纯 UI 模拟数据边界不变。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard build
```

### 本地结果

- `install --frozen-lockfile` 通过，锁文件无需再解析；`test:unit` 为 1 个文件、1 个测试通过，测试本身约 1.5s，整轮 2.4–4.8s（冷热环境差异）；仅有 Vue `<Suspense>` 实验特性提示。
- `typecheck`、`lint`、`build` 全部退出码 0；构建 29.6s，产物 12.3 MB（gzip 3.1 MB），仅保留既有的单 chunk 超过 500 kB 提示。
- `pnpm peers check` 仍报告传递依赖 `@emnapi/core` / `@emnapi/runtime` 的 peer 警告（来自 `@napi-rs/wasm-runtime`）；未使用 override 强行抬版本，安装、测试、类型检查与构建均不受影响。

### 已知事项

- 当前为冒烟级测试，验证 Nuxt 挂载、表格渲染与 attrs 透传，不模拟列宽拖拽；列宽交互由既有 Playwright 验收覆盖。
- 尚未加入浏览器端 e2e 或 MSW；后续接 BFF 时再按需引入 `msw/node`，并同步更新 B0 边界与依赖记录。

## B8 组织治理与 B9 全局体验（2026-11-18）

### 范围

- 设置页由占位改为七个页签：公司、成员、邀请、角色、部门、订阅、审计；共用 `useOrganizationStore` 的 Pinia 本地状态，写操作只影响本次预览。
- B8：公司资料表单；成员搜索、角色/部门/状态筛选、停用恢复与批量邀请；邀请创建、复制、撤销；角色权限矩阵（五组 14 项）；部门树增删改与子部门；订阅套餐、月/年切换、用量、取消恢复；审计操作者/类型/时间筛选、分页与 CSV 导出。
- B9：命令面板补齐最近访问、跨来源结果（页面、商品、伙伴、采购/销售/报价/发票、变更记录、错误页）、空态与键盘提示；通知已读写入 sessionStorage；商品与采购表格密度紧凑/标准切换并记住选择；表格行 Enter/Space 打开详情；销售订单、发票、采购订单与财务报表打印预览；页面切换过渡与 `prefers-reduced-motion` 全局关闭。
- 主要文件：`app/pages/settings.vue`、`app/components/settings/*Panel.vue`、`app/stores/organization.ts`、`app/stores/ui.ts`、`app/components/ResizableTable.vue`、`app/components/sales/SalesPrintPreview.vue`、`app/components/finance/ReportPrintPreview.vue`、`app/mocks/organization.ts`、`app/mocks/subscription.ts` 与 `app/assets/css/main.css`。
- 纯 UI 边界不变：无 BFF、数据库或真实鉴权；公司资料、成员、邀请、角色、部门、订阅、审计与打印只更新本地状态或浏览器会话。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

浏览器验收使用临时 Playwright 脚本（Edge、1440×1000，18 步，验收后删除）。打开 `http://localhost:3001/settings` 可依次检查七个页签；命令面板 `Ctrl/⌘+K`；打印入口位于销售订单/发票详情、采购订单详情与财务报表页；减少动效可用 DevTools 的 Emulate CSS `prefers-reduced-motion: reduce` 复核。

### 本地结果

- `install --frozen-lockfile`、`typecheck`、`lint`、`test:unit`、`build` 全部退出码 0。`test:unit` 为 1 个文件、1 个测试通过（测试 1.04s，整轮 3.25s）；构建 28.1s，产物 12.5 MB（gzip 3.13 MB），仅保留既有的单 chunk 超过 500 kB 提示。
- 浏览器验收 18 步全部通过，`consoleErrors`、`pageErrors`、`badResponses` 均为空；截图 18 张与 `report.json` 见 `artifacts/ui-dashboard-b8b9/`（`01-settings-company` … `18-purchase-print-preview`）。
- 覆盖：公司资料保存回读、成员筛选/角色/停用、批量邀请、邀请创建/复制/撤销、角色矩阵、部门增改删与占用保护、订阅切换/取消恢复、审计筛选/分页/CSV、设置暗色、命令面板最近访问/跨来源搜索/空态、通知已读跨刷新、表格密度跨刷新、表格行键盘打开、销售/发票/采购/财务报表打印、三页回归。
- 减少动效下浏览器探针读取 `.nx-lift` 的 `transition-duration` 为 `0s`、根元素 `scroll-behavior` 为 `auto`；采购订单打印预览内容与 `window.print` 调用通过；详情抽屉连续 Tab 后焦点仍在 dialog 内，Esc 可关闭。
- 修复：`DepartmentsPanel.vue` 的顶级部门下拉使用空字符串 value，触发 `A <SelectItem /> must have a value prop that is not an empty string` 并导致整页 hydration 失败，改为 `'root'` 哨兵；设置页审计图标改为 `i-carbon-document`；`finance/Reports.vue` 与 `finance/ReportPrintPreview.vue` 显式导入打印组件，规避目录前缀自动导入名 `FinanceReportPrintPreview` 无法解析；通知已读从 `useSessionStorage` 改为显式 `sessionStorage` 读写，避免 VueUse 初始化写入空数组覆盖历史已读。

### 已知事项

- 当前仍是纯 UI 原型，权限、计费、审计与打印均为本地演示，不构成合规或真实业务结果；刷新后除表格密度与通知已读外均恢复初始模拟数据。
- 审计 CSV 通过浏览器下载生成，未校验服务端导出格式或权限。
- 打印预览在 body 中保留隐藏副本供 `@media print` 使用；编写 e2e 时需以 `:visible` 限定可见预览。
- 设置页未挂通知按钮，通知相关验收在 `/catalog` 进行；这是页面布局差异，不是功能缺失。

## C1 采购到付款（2026-11-18）

### 范围

- 财务页新增「采购应付」页签：应付未结、待复核账单、可匹配收货行与已登记付款四个概览卡；供应商账单、收货计价/暂估/匹配、采购应付账龄、退货贷项与退款四块列表。
- 固定算例账单 `BILL-2026-1101`：价税合计 ¥1,130.00，初始已付 ¥600.00、未结 ¥530.00；账单详情、付款记录、应付账龄和采购订单详情应付卡使用同一余额口径。
- 供应商账单录入与复核：从可匹配收货行选择数量、单价，按 13% 计算税额，生成待复核账单；价差账单需勾选「已核对价差」后才能复核通过；通过后生成 `JE-AP-2026-XXXX` 过账凭证，退回则标记为已退回。
- 供应商付款：选择已过账且未结的账单、资金账户，登记部分或全额付款；拦截超额、已结清、停用账户和 8 秒内相同账单/金额/账户的重复提交。付款后详情、账单列表与账龄同步更新。
- 退货贷项与退款：已确认退货的贷项显示原收货行、原账单和可退金额；登记退款生成退款单，贷项状态变为已退款，详情保留来源链路。
- 采购订单详情新增「应付与供应商账单」卡：显示应付未结、待复核账单数、收货暂估与关联账单，并可深链到财务采购应付页签和指定账单。
- 主要文件：`app/mocks/supplierTrade.ts`、`app/mocks/types.ts`、`app/mocks/purchasing.ts`、`app/stores/supplierTrade.ts`、`app/components/finance/SupplierPayables.vue`、`app/components/purchase/PurchasePayablesCard.vue`、`app/pages/finance.vue`、`app/pages/purchase-orders.vue`、`test/supplier-trade.test.ts`。
- 纯 UI 边界不变：无 BFF、数据库或真实鉴权；账单、付款、贷项和退款写操作只更新 Pinia 内存，刷新后恢复初始模拟数据。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

浏览器验收使用临时 Playwright 脚本（Edge、1440×1000，14 步，验收后删除）。打开 `http://localhost:3001/finance?tab=payables` 查看采购应付；固定账单可用 `?tab=payables&bill=BILL-2026-1101` 直达。采购订单 `PO-2026-0520` 详情底部可进入应付卡。

### 本地结果

- 最终串行执行 `install --frozen-lockfile`、`typecheck`、`lint`、`test:unit`、`build`，全部退出码 0。`test:unit` 为 2 个文件、8 个测试通过（3.05s）；构建 30.7s，产物 12.7 MB（gzip 3.15 MB），仅保留既有的单 chunk 超过 500 kB 提示。
- 浏览器验收 14 步全部通过，`consoleErrors`、`pageErrors`、`badResponses` 均为空；截图 14 张与 `report.json` 见 `artifacts/ui-dashboard-c1/`（`01-payables-overview` … `14-payables-dark`）。
- 固定算例：初始详情未结 ¥530.00、账龄合计 ¥530.00；登记 ¥999.00 被拒并提示上限；登记 ¥530.00 后详情未结 ¥0.00、账龄 ¥0.00，账单列表显示已结清。
- 待复核样例 `BILL-2026-1102`：价差 +¥40.00，复核按钮在勾选价差确认前禁用，确认后过账并显示 `JE-AP-2026-1102`。
- 重复提交：先付 ¥100.00，再次提交同金额被拒（提示重复提交）；改付剩余 ¥939.60 后未结归零。
- 新账单：选择 `RC-2026-0511-01/1` 可匹配 100 件、单价 ¥8.80，生成 `BILL-2026-1105`，价税合计 ¥994.40；复核后显示 `JE-AP-2026-1105`。
- 贷项退款：`CR-2026-1102` 待退 ¥291.54，登记后生成 `RF-2026-1102`，贷项状态为已退款。
- 采购订单 `PO-2026-0520` 应付卡显示未结 ¥530.00、`BILL-2026-1101`，点击后跳转 `/finance?tab=payables&bill=BILL-2026-1101` 并打开详情；暗色采购应付页与 `/sales`、`/inventory`、`/purchase-audit` 回归通过。
- 修复：固定算例说明原使用 `toFixed(2)`，结清后显示「¥1130.00」缺少千分位；改为统一的 `formatMoney` 后显示「¥1,130.00」。

### 已知事项

- 当前仍是纯 UI 原型，账单、付款、贷项和退款均为本地演示，不构成真实财务结果；整页刷新会重置 Pinia 状态。
- 重复提交保护只覆盖当前页面会话内 8 秒窗口，未实现服务端幂等键；账单日期、到期日和退款日期使用固定演示值。
- 待复核账单计入收货行的已匹配数量，因此同一收货行不会被两张未退回账单重复开票；该口径尚未与后端 API 契约对齐。
- 浏览器截图在抽屉过渡结束后采集；`report.json` 记录每步断言与页面错误，不包含后端或权限校验。

## C2 销售到收款（2026-11-18）

### 范围

- 发票详情支持从已发货订单行编辑草稿：显示来源订单、可开票数量与开票后状态；草稿可改数量并重新计算未税、税额与价税合计，生效后进入已开票状态。
- 「标记已收款」改为独立客户收款单：选择客户、资金账户和收款日期，保存后生成 `RCPT-2026-XXXX`，列表显示收款金额、已核销与可用余额。
- 新增核销抽屉：选择同一客户的未结发票和可用收款单，输入部分或全额核销金额；超过款项可用余额时提示上限并拒绝提交，成功后同步减少发票未结和款项可用。
- 已确认销售退货生成客户贷项，贷项详情保留原发票、退货和收款链路；可登记客户退款，退款后贷项状态变为已退款。
- 固定算例 `INV-2026-0089`：价税合计 ¥1,130.00；登记 ¥500.00 收款后款项可用 ¥500.00；核销后发票详情、应收工作台与财务应收账龄均显示未结 ¥630.00；再收并核销 ¥630.00 后未结归零。
- 主要文件：`app/mocks/types.ts`、`app/mocks/receivables.ts`、`app/mocks/sales.ts`、`app/mocks/billing.ts`、`app/stores/receivables.ts`、`app/components/sales/ReceiptFormSlideover.vue`、`app/components/sales/ReceivableAllocationSlideover.vue`、`app/components/sales/SalesCreditSlideover.vue`、`app/components/sales/InvoiceDetailSlideover.vue`、`app/components/sales/ReceivableWorkbench.vue`、`app/pages/sales.vue`、`app/components/finance/AgingLedger.vue`。
- 纯 UI 边界不变：收款、核销、贷项和退款只更新 Pinia 内存，刷新后恢复初始模拟数据。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

打开 `http://localhost:3001/sales`，在「应收工作台」页签查看未结发票、收款与贷项；发票详情可从订单行或工作台进入。浏览器全流程使用临时 Playwright 脚本（Edge、1440×1000，验收后删除）。

### 本地结果

- 浏览器全流程通过，`consoleErrors`、`pageErrors` 与失败响应均为空。
- 固定算例：`INV-2026-0089` 初始未结 ¥1,130.00；登记 `RCPT-2026-1201` ¥500.00 后款项可用 ¥500.00；核销 ¥600.00 被拒并提示「核销金额不能超过款项可用余额 ¥500.00。」；核销 ¥500.00 后发票与工作台未结 ¥630.00。
- 退回与退款：登记更正后生成贷项 `CR-2026-1201`，总额 ¥1,455.44、已核销 ¥500.00、可退 ¥955.44；登记退款生成 `RF-2026-1201`，财务应收账龄仍显示未结 ¥630.00。
- 结清：再收 ¥630.00 并核销后发票未结归零，状态变为已收款；草稿 `INV-2026-0090` 将数量 6 改为 5 后合计 ¥1,783.71，开票成功。
- 关键交互：收款、核销、贷项和退款抽屉均提供上限/余额反馈；财务账龄的未结明细卡与销售应收工作台使用同一 `outstandingOf` 口径。

### 已知事项

- 当前仍是纯 UI 原型，收款、核销、贷项和退款均为本地演示，不构成真实财务结果；整页刷新会重置 Pinia 状态。
- 收款日期、资金账户和客户均为固定模拟数据，未接入真实银行流水或对账。
- 发票更正仅演示登记入口与关联展示，未实现红冲、重新开票或税务申报。
- 核销以发票为入口，尚未提供按收款单批量核销的独立工作台。

## C3 库存收发货、退货与商品表单（2026-11-18）

### 范围

- 采购订单与销售订单详情新增收发货许可面板：按订单状态生成 `SP-IN-*` / `SP-OUT-*` 许可，显示每行许可量、已执行量、执行记录、退货记录和单据剩余额度；可取消待执行许可或关闭剩余额度，仓库执行后同步更新状态。
- 库存页「待执行收发货许可」汇总待执行许可：打开执行抽屉选择仓库、经办人和日期，按行填写数量；执行前校验许可余量、仓库可用量和整数数量，库存不足时保留抽屉并提示具体商品与可用量。
- 从原收货或发货执行记录发起退货：展示可退、已退、待确认数量；超量输入给出上限提示；退货单支持确认与取消，确认后按销售/采购方向生成客户贷项或供应商贷项，并可跳转对应财务页签。
- 商品表单按新增/更新字段调整：分类和单位从模拟主数据选择，新增品牌、条码、规格、追踪方式（不追踪/批次/序列号）和销售税率；商品列表与详情展示库存余量，编辑保存后回到详情。表单保留本地演示用单价和库存录入；正式接入后数量从库存操作维护、单价在采购或销售单据行录入。
- 主要文件：`app/mocks/types.ts`、`app/mocks/stockFlow.ts`、`app/mocks/purchasing.ts`、`app/mocks/sales.ts`、`app/stores/stockFlow.ts`、`app/stores/receivables.ts`、`app/stores/supplierTrade.ts`、`app/components/inventory/StockPermitPanel.vue`、`app/components/inventory/StockPermitExecutionSlideover.vue`、`app/components/inventory/StockReturnSlideover.vue`、`app/pages/inventory.vue`、`app/pages/purchase-orders.vue`、`app/components/sales/OrderDetailSlideover.vue`、`app/pages/catalog.vue`、`app/utils/mockSchemas.ts`、`test/stock-flow.test.ts`。
- 纯 UI 边界不变：许可执行、取消、关闭、退货与商品写操作都只更新 Pinia 与本地表格，刷新后恢复初始模拟数据。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

打开 `http://localhost:3001/inventory`，在「盘点与调拨」页签查看待执行许可；采购订单详情和销售订单详情可查看许可、执行记录与退货。浏览器验收使用临时 Playwright 脚本（Edge、1440×1000，18 步，验收后删除）。

### 本地结果

- 浏览器验收 18 个截图阶段、42 项断言全部通过，`consoleErrors`、`pageErrors` 与失败响应均为空；18 张截图与 `report.json` 见 `artifacts/ui-dashboard-c3/`（`01-inventory-permits` … `18-catalog-dark`）。
- 初始待执行许可 6 条；取消 `SP-IN-0513-01` 后从待执行表消失，采购订单 `PO-2026-0513` 详情显示已取消。全量重载恢复后执行该许可，入库流水生成 `EXE-2026-0001`，采购详情许可变为已完成（400/400、60/60、30/30）。
- 采购退货：`EXE-2026-0001` 发起 5 件退货，输入 999 被拒并提示「第 1 行超过可退数量 400。」；确认后生成 `PR-2026-1202` 与供应商贷项 `CR-2026-1103`（¥127.13），财务采购应付页签可查。
- 销售出库：`SP-OUT-9001-01` 在华东仓执行 1 件被拒（人体工学网椅可用量 0）；改选华南前置仓后执行成功，许可变为部分执行（41/80、10/20、20/40），出库流水为 `EXE-2026-0002`，销售详情显示执行记录。
- 销售退货：超量 1 件被拒并提示可退上限；确认后生成 `SR-2026-1202` 与客户贷项 `CR-2026-1202`，贷项链接可直达 `/sales?tab=receivables`。另从 `FUL-9001-01` 发起退货并取消，退货行显示已取消且无贷项；随后关闭部分执行许可的剩余额度。
- 商品表单：新建商品填写完整字段后进入列表与详情；详情展示品牌、规格和追踪方式；编辑保存后回到详情并更新字段。暗色商品目录正常，`/sales`、`/inventory`、`/purchase-orders` 回归通过。
- `test:unit` 新增 `test/stock-flow.test.ts` 5 个测试，覆盖许可种子、超量执行拒绝、部分执行、销售退货超量拒绝、退货确认生成贷项、取消退货与关闭剩余额度。
- 修复：`app/pages/sales.vue` 监听 `route.query.tab`，切到应收页签时关闭订单/报价/发票抽屉，避免遮罩挡住页签；`app/pages/catalog.vue` 新增 `editFromDetail()`，先保存商品再清空详情，修复详情内编辑触发 `openEditor(null)`；`app/stores/stockFlow.ts` 的 `cancelReturn` 返回取消后的退货单。

### 已知事项

- 当前仍是纯 UI 原型，许可、执行、退货、贷项和商品写操作均为本地演示；整页刷新会重置 Pinia 状态，许可由订单状态派生而非独立持久化。
- C3 阶段已确认退货只生成贷项、不写库存流水；C6 起确认退货会同步写入库存位置与流水，见下文 C6 验收。
- 商品分类和单位以名称匹配模拟主数据，尚未使用后端请求契约中的 id；接 BFF 时需改为 id 与版本字段。商品表单的单价和库存是本地演示字段，正式接入时应从商品主数据表单移除，分别由单据行和库存操作维护。
- 执行抽屉的仓库、经办人、日期和库存可用量为固定模拟值，未接入真实库存批次、序列号或权限校验。
- 截图在抽屉过渡结束后采集；`report.json` 记录每步断言与页面错误，不包含后端或权限校验。

## C4 工作区初始化与业务授权（2026-11-18）

### 范围

- 新增 `/setup` 初始化向导，按公司资料、会计年度与开账、科目模板、可选税制顺序推进；公司资料写回模拟公司档案与审计记录，年度与开账日期需确认期初汇总后继续，科目模板与税制记录到本地初始化状态。
- 向导支持「稍后继续」：暂存当前进度并回到设置的公司页签，设置页显示完成步数、当前步骤和暂存时间；可从设置卡或页头重新进入，也可在完成页重新演示。
- 角色设置新增按部门、仓库和财务期间的授权范围；申请抽屉只展示当前角色尚未拥有的选项，提交前校验范围确有变化并阻止重复待审申请。
- 申请列表按所选角色过滤，显示待独立审批、已批准、已拒绝及审批意见；制单人张明远可提交但不能审批，所有者陈立可批准或拒绝但不能提交；批准后合并范围，拒绝必须填写原因。
- 主要文件：`app/mocks/types.ts`、`app/mocks/organization.ts`、`app/stores/organization.ts`、`app/stores/workspaceSetup.ts`、`app/pages/setup.vue`、`app/pages/settings.vue`、`app/components/settings/CompanyPanel.vue`、`app/components/settings/RolesPanel.vue`、`test/organization-authorization.test.ts`、`test/workspace-setup.test.ts`。
- 纯 UI 边界不变：初始化进度、公司资料、角色范围和申请审批都只更新 Pinia 与本地表格，刷新后恢复初始模拟数据。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

打开 `http://localhost:3001/setup` 走完四步向导，再到 `http://localhost:3001/settings?tab=roles` 切换制单人与审批人身份。浏览器验收使用临时 Playwright 脚本（Edge、1440×1000，13 个截图阶段，验收后删除）。

### 本地结果

- 浏览器验收 13 个截图阶段、41 项断言全部通过，`consoleErrors`、`pageErrors` 与失败响应均为空；截图与 `report.json` 见 `artifacts/ui-dashboard-c4/`（`01-setup-company` … `13-roles-dark`）。
- 向导从 0/4 开始：公司资料保存后继续；会计年度为 2026-01-01 至 2026-12-31，开账日 2026-01-01，确认期初汇总 ¥2,569,400.00 后进入模板；选择零售模板（商贸流通科目表，36 个科目）和小规模纳税人后完成。完成页显示四步完成，设置公司页签显示「已完成」和四步摘要，向导保存的公司名称可回读。
- 稍后继续：从设置卡回到完成页，重新演示后回到公司资料 0/4；点击「稍后继续」返回设置公司页签，状态显示 0/4、下一步公司资料，并显示「上次暂存于」时间。
- 角色初始状态：采购员范围为采购部、华东中心仓、11 月，列表有 1 条待审批；申请不扩展范围时提示「申请范围与当前授权一致，无需提交。」；新增销售部、华南前置仓、12 月后生成 `REQ-2026-1203`，待审批变为 2 条。
- 独立审批：制单人可打开申请且看不到审批按钮；切换到所有者陈立后申请按钮禁用，可批准 `REQ-2026-1203`，批准后采购员范围变为 2 个部门、2 个仓库、2 个期间；拒绝 `REQ-2026-1201` 时不填原因被拒，填写原因后状态变为已拒绝并显示审批意见，待审批归零。切回制单人后申请按钮恢复、审批按钮隐藏。
- 暗色角色页与回归 `/`、`/purchase-orders`、`/inventory`、`/finance?tab=payables` 均正常。
- `test:unit` 5 个文件 22 个测试全部通过，其中 C4 新增 `organization-authorization` 5 个和 `workspace-setup` 4 个。最终 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 串行执行退出码 0，构建 25.5s，产物 13.1 MB（gzip 3.21 MB），仅有既有的大 chunk 警告。

### 已知事项

- 当前仍是纯 UI 原型，初始化进度、公司资料、角色范围和申请审批均为本地演示；整页刷新会重置 Pinia 状态，未接入服务端 onboarding、Keycloak 身份或 Organization 授权判定。
- 两种身份是页面内的模拟切换，不代表真实登录态；申请提交、批准和拒绝没有通知、并发控制或多级审批，批准后的范围只保存在当前会话。
- 公司资料保存只更新模拟公司与审计记录；科目模板和税制仅为演示选择，不会创建真实科目、税率或期初余额。
- 期初余额汇总为固定模拟值，尚未提供导入、批次预览或校验差异；「稍后继续」只记录本地暂存时间。
- 截图在页面滚动到授权区后采集；`report.json` 记录每步断言与页面错误，不包含后端或权限校验。

## C5 财务期初与报表导出（2026-11-18）

### 范围

- 财务页签新增「期初导入」：总账期初文件可预览借贷合计、行数、平衡与逐行问题，校验通过后导入并生成期初凭证；已导入记录保留文件名、哈希、金额和凭证号。
- 子账核对覆盖库存、未结应收、未结应付、银行现金四类来源，展示来源明细、子账合计、总账合计、差异和分类校验；存在差异时必须在复核时填写说明。
- 批次流程包含提交待独立复核、批准后库存入账处理中、过账完成和拒绝；制单人可取消待复核批次，复核人不能是制单人。过账结果展示凭证、库存移动、应收应付单据和银行流水数量，并保留来源链接。
- 财务报表页新增导出记录：按当前报表和期间生成，显示排队中、已完成或失败，可下载 CSV，也可按原快照与水位重建并标注重建来源。
- 主要文件：`app/mocks/types.ts`、`app/mocks/financeOperations.ts`、`app/mocks/index.ts`、`app/stores/openingBalances.ts`、`app/stores/reportExports.ts`、`app/components/finance/Opening.vue`、`app/components/finance/ReportExports.vue`、`app/components/finance/Reports.vue`、`app/pages/finance.vue`、`test/opening-balances.test.ts`、`test/report-exports.test.ts`。
- 纯 UI 边界不变：导入、批次、复核、过账、导出和重建都只更新 Pinia 与本地表格，刷新后恢复初始模拟数据。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

打开 `http://localhost:3001/finance?tab=opening` 预览并导入总账期初、提交和复核子账批次；打开 `http://localhost:3001/finance?tab=reports` 生成、下载和重建导出。浏览器验收使用临时 Playwright 脚本（Edge、1440×1000，15 个截图阶段，验收后删除）。

### 本地结果

- 浏览器验收 15 个截图阶段、54 项断言全部通过，`consoleErrors`、`pageErrors` 与失败响应均为空；截图与 `report.json` 见 `artifacts/ui-dashboard-c5/`（`01-opening-overview` … `15-source-backlink-inventory`）。
- 总账标准文件预览：借方与贷方各 ¥3,406,040.00，差额 ¥0.00，8 行，校验徽标为「可导入」；导入后生成 `OPEN-GL-2026-0001` 和凭证 `JE-OPEN-GL-2026-0001`。问题文件第 2 行科目 1001 重复、第 3 行科目 9999 不存在，借贷差 +¥1,200.00，导入按钮禁用。
- 子账核对：8 行来源，子账合计 ¥2,956,440.00，总账合计 ¥2,954,440.00，差异 +¥2,000.00；库存子账比总账多 ¥2,000.00 标记为警告，来源链接可跳回库存页。
- 提交生成 `OB-2026-0002`（待独立复核）。制单人身份下批准按钮禁用；切换到财务负责人陈立后，不填复核说明批准被拒「存在子账差异 ¥2000.00，请填写复核说明后再批准。」；填写说明后进入库存入账处理中，随后过账完成。
- 过账结果：4 张凭证 `JE-OPEN-2026-0005` 至 `0008`、库存移动 2 笔、应收 6 张、应付 4 张、银行 2 笔；分类校验 3/4，库存差异保留，批次详情可回查 8 条来源。批次列表共 2 行。
- 导出记录初始 3 条（`EXP-2026-0001` 试算平衡已完成、`EXP-2026-0002` 现金流量表失败、`EXP-2026-0003` 资产负债表已完成）。按 2026-11 试算平衡生成 `EXP-2026-0004`，状态由「排队中」变为「已完成」；下载文件 `trial-balance-2026-11.csv`，快照 `snap-2026-11-live`、水位 #142。
- 重建生成 `EXP-2026-0005`，复用原快照与水位，详情标注「重建自 EXP-2026-0004」，下载文件名带 `-rebuild.csv`。
- 暗色主题、来源回跳与回归 `/sales`、`/purchase-orders`、`/finance` 均正常。
- `test:unit` 7 个文件 31 个测试全部通过，其中 C5 新增 `opening-balances` 5 个和 `report-exports` 4 个。最终 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 串行执行退出码 0，构建 27.8s，产物 13.2 MB（gzip 3.23 MB），仅有既有的大 chunk 警告与依赖注释警告。

### 已知事项

- 当前仍是纯 UI 原型，期初文件解析、子账核对、独立复核、库存入账和报表导出均为本地模拟；整页刷新会重置 Pinia 状态，未接入 Finance 服务的导入会话、批次版本和导出文件。
- 库存子账固定比总账多 ¥2,000.00，用于演示差异说明必填和过账结果为 3/4 校验；该差异不会因批准而自动消失。
- 子账来源链接指向模拟库存页，尚未按批次 ID 查询来源单据或凭证；过账结果中的 ID 和数量为固定模拟值。
- 导出文件由浏览器端根据当前 mock 行生成 CSV，不是服务端快照文件；排队、完成和重建使用定时器模拟，没有真实后台任务或重试。
- 截图前等待抽屉过渡和 Toast 消失；`report.json` 记录每步断言与页面错误，不包含后端或权限校验。

## 前端展示组件与分页收口（2026-11-18）

### 范围

- 三份打印预览壳合并为 `app/components/PrintPreviewSlideover.vue`，采购、销售和财务报表分别保留原有导出接口与 testid 的薄包装；打印内容仍由各自的文档组件插槽提供。
- 两份审批轨迹合并为 `app/components/ApprovalTimeline.vue`，采购与销售包装只传入步骤、标签、色调和 testid，时间线图标与空状态保持一致。
- 新增 `app/composables/useClientPagination.ts`，替换商品、往来单位、采购订单、销售、采购审计、变更记录和设置审计七处手写分页；页码越界自动回落，每页条数保持原有 8 或 10 条。
- 财务期初文件、报表期间和导出状态三个筛选恢复为 Nuxt UI `USelect`。此前为排查 hydration mismatch 临时改为原生 `select`，根因已确认是表格空表头，不是 `USelect`；恢复后水合错误为 0。
- 主要文件：`app/components/PrintPreviewSlideover.vue`、`app/components/ApprovalTimeline.vue`、`app/components/purchase/PrintPreview.vue`、`app/components/sales/SalesPrintPreview.vue`、`app/components/finance/ReportPrintPreview.vue`、`app/components/purchase/ApprovalTimeline.vue`、`app/components/sales/ApprovalTimeline.vue`、`app/composables/useClientPagination.ts`、上述七个页面与 `app/components/finance/Opening.vue`、`Reports.vue`、`ReportExports.vue`、`test/use-client-pagination.test.ts`。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

浏览器冒烟使用临时 Playwright 脚本（Edge、1440×1000，验收后删除）：打开采购订单详情、销售订单详情和财务报表，分别检查审批轨迹与三份打印预览；再逐页翻到第 2 页检查范围文案。

### 本地结果

- 冒烟 20 项断言全部通过，`consoleErrors`、`pageErrors` 与失败响应均为空；三份打印预览的 Teleport 打印文档均存在且正文长度大于 100 字符。
- 采购订单 `PO-2026-0513` 审批轨迹、销售订单 `SO-2026-9001` 审批轨迹均正常；采购、销售、财务报表三处打印按钮可用，预览告警文案与打印文档正常。
- 分页范围：商品 24 条第 2 页「第 9–16 条」，往来单位 13 条第 2 页「第 9–13 条」，采购审计 32 条第 2 页「第 11–20 条」，变更记录 29 条第 2 页「第 11–20 条」，设置审计 10 条第 2 页「第 9–10 条」；采购订单 6 条保持单页且不出现第 2 页按钮。销售订单、报价单、发票和定期开票当前分别为 7、5、7、2 条，四个分页器均单页。
- 三个 `USelect` 恢复后：期初问题文件可选中并预览出 +¥1,200.00 差额；报表期间切换为 2026-10 后标签联动；导出状态选择「失败」后仅保留 1 条失败记录。
- `test:unit` 8 个文件 34 个测试全部通过，其中新增 `use-client-pagination` 3 个。最终 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 串行执行退出码 0；最终单独复跑构建耗时 54.7s，产物 13.9 MB（gzip 3.41 MB），仅有既有的大 chunk 与依赖注释警告。

### 已知事项

- 行为保持不变，未新增截图；现有 C1–C5 截图仍代表重构前的页面外观。分页仍为客户端切片，未接入服务端分页。
- 打印仍调用浏览器打印对话框，不生成服务端 PDF；打印文档组件根节点本身带 `data-print-document`，且预览区和 body 下的 Teleport 各渲染一份，因此同一文档会出现三个匹配节点（Teleport 包装加两份文档）。冒烟脚本用 `body > div[data-print-document]` 定位 Teleport 包装；这是按打印样式隐藏预览副本的预期结构。
- `useClientPagination` 负责页码与范围文案，筛选后的总数仍由各页面传入；新增页面时应把筛选结果作为 `rows` 传入，不要重复维护页码状态。



## C6 退货与库存、流水联动（2026-11-18）

### 范围

- 新增 `app/stores/inventory.ts`（`useInventoryStore`）。库存位置和流水从 `app/mocks/inventory.ts` 深拷贝，成为工作区级唯一数据源；提供按仓库与 SKU 查询位置、总量和可用量，按退货单查询流水，以及 `applyReturn`/成功回执。`applyReturn` 对采购退货按原收货仓跨批次扣减（可用余额不足时拒绝），对销售退货计入原批次位置，没有位置时按商品主数据新建 `LOT-RET-*` 批次；每条明细写一条流水，类型为 `outbound`/`inbound`，`reference` 为退货单号，并记录 `returnId`、`executionId` 与 `balanceAfter`。同一退货单已有流水时直接返回，重复确认不会重复扣减。
- `app/stores/stockFlow.ts` 的 `confirmReturn` 改为先校验库存、再按开票状态拆分、最后写入库存：采购退货用供应商账单的匹配数量判定已开票，销售退货用非草稿、非作废发票的明细行判定；仅已开票数量生成贷项，未开票部分调用 `recordReturnReduction` 冲减可匹配（采购）或可开票（销售）数量。确认后回写明细的 `invoicedQuantity`/`uninvoicedQuantity`，消息包含各商品结存与开票拆分。
- `app/stores/supplierTrade.ts` 新增 `unbilledReturned`、`recordReturnReduction`、`billedQuantityOf` 与 `billIdWithReceiptLine`，可匹配数量再扣未开票退货；`app/stores/receivables.ts` 新增 `unbilledReturned`、`recordReturnReduction`、`unbilledReturnedOf`、`invoicedQuantityOf` 与 `invoiceableQuantityOf`，销售开票按已发货数量减去未开票退货生成。
- 新增 `app/components/inventory/StockReturnDetailSlideover.vue`：显示退货单来源（订单、往来单位、仓库）、状态、开票拆分、明细、库存流水（含结存）、原收货或发货执行记录，并提供订单与贷项链接。`StockPermitPanel` 的退货行增加「详情」入口；库存页流水表的退货行点击单据号打开同一抽屉。
- 库存页 `app/pages/inventory.vue` 的库存位置与流水改读 `useInventoryStore`，流水表新增「结存」列；进入页面不再重置库存 store，已确认退货的位置与流水得以保留。
- 模拟种子把 `SKU-1016`（华东中心仓 `LOT-2026-1109`）与 `SKU-1010`（华东中心仓 `LOT-2026-1105`）的库存都调整为 100 件，并为两条既有已确认退货各补一条流水（`mv-4021` 出库 5 件、`mv-4022` 入库 1 件），使 C6 样例从 100 件起步。
- 主要文件：`app/stores/inventory.ts`、`app/stores/stockFlow.ts`、`app/stores/supplierTrade.ts`、`app/stores/receivables.ts`、`app/components/inventory/StockReturnDetailSlideover.vue`、`app/components/inventory/StockPermitPanel.vue`、`app/pages/inventory.vue`、`app/pages/sales.vue`、`app/mocks/inventory.ts`、`app/mocks/types.ts`、`test/inventory-return.test.ts`。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

打开 `http://localhost:3001`，按以下路径复现：

1. 打开 `/purchase-orders?order=PO-2026-0511`，在收发货许可面板对 `EXE-RC-2026-0511-02` 点「退货」，输入 16 件提交，确认提示「第 3 行超过可退数量 15。」；改为 5 件并填写原因提交，再点「确认」。
2. 打开退货详情，核对开票拆分、库存流水与原收货执行记录；关闭详情与订单抽屉。
3. 通过侧栏进入销售页，打开 `SO-2026-9001`，对 `EXE-FUL-9001-01` 退货 5 件并确认，核对退货详情、贷项与流水。
4. 进入 `/inventory`，在「库存位置」搜索 `SKU-1016` 与 `SKU-1010`；在「库存流水」搜索 `PR-2026-1202` 与 `SR-2026-1202`，点击单据号核对退货详情。
5. 重复确认、取消待确认退货与超量输入的行为由 `test/inventory-return.test.ts` 覆盖。

浏览器验收使用临时 Playwright 脚本（Chromium、1440×1000，验收后删除）。

### 本地结果

- 采购样例：`EXE-RC-2026-0511-02` 第 3 行可退 15 件；输入 16 件被拒；确认 5 件后 `SKU-1016` 在华东中心仓的数量由 100 变为 95，流水 `mv-4023` 为出库 -5、结存 95，退货详情显示「已开票 5 件 · 未开票 0 件」，贷项 `CR-2026-1103`，原收货执行 `EXE-RC-2026-0511-02` 与订单 `PO-2026-0511` 链接可用。
- 销售样例：`EXE-FUL-9001-01` 第 1 行可退 39 件；确认 5 件后 `SKU-1010` 在华东中心仓的数量由 100 变为 105，流水 `mv-4024` 为入库 +5、结存 105，退货详情显示「已开票 5 件 · 未开票 0 件」，贷项 `CR-2026-1202`。
- 库存页：`SKU-1016` 的 `LOT-2026-1109` 显示 95/0/95，`SKU-1010` 的 `LOT-2026-1105` 显示 105/0/105；流水页 `PR-2026-1202` 行显示 -5/结存 95，`SR-2026-1202` 行显示 +5/结存 105，点击单据号均打开对应退货详情，来源、拆分与流水一致。
- 浏览器控制台 `console error` 与 `pageerror` 均为 0。
- `test/inventory-return.test.ts` 8 个用例通过：采购退 5 件 100→95 且流水结存 95；销售退 5 件 100→105；重复确认返回「仅待确认退货可以确认。」且库存与流水不变；取消待确认退货不改库存、不生成贷项，随后可再次发起；超量 16 件提示「超过可退数量 15」；采购 `RC-2026-0511-01` 第 1 行退 150 件拆分为已开票 100 件生成贷项、未开票 50 件冲减可匹配数量（可匹配余额 50）；未开票退货只冲减不生成贷项；客户发票可开票数量按未开票退货扣减（80→77）。
- 静态检查：`pnpm typecheck`、`pnpm lint`、`pnpm test:unit`（9 个文件 42 个测试）与 `pnpm build` 均通过。

### 已知事项

- 仍为纯 UI 原型，库存与流水写入 Pinia，整页刷新恢复初始模拟数据；未接入 Inventory 服务的批次、序列号或权限校验。
- 采购退货按原收货仓的位置数量从多到少扣减，不是 FIFO 或其他批次策略；销售退货优先回原批次位置，缺少位置时新建 `LOT-RET-*` 批次。
- 开票判定基于模拟的供应商账单匹配数量与销售发票明细，草稿发票不计为已开票；接入后端后应以实际账单匹配和发票状态为准。
- 贷项金额按退货单价 × 数量 × 1.13 计算，未按原账单的税额、折扣或价差重算。
- 确认流程先写库存、再生成贷项与冲减数量；模拟数据下后续步骤不会失败，接入后端时应改为同一事务或补偿。

## C7 付款作废与银行对账更正（2026-11-19）

### 范围

- 新增 `app/stores/bankRecon.ts`（`useBankReconStore`）。账户与流水从 `app/mocks/finance.ts` 深拷贝，成为财务页银行数据的唯一来源；维护排除项和账户级对账记录，提供 `transactionsFor`、`pendingCountOf`、`matchedCountOf`、`recordsFor`、`latestCompletedOf`、`isReconciled`、`match`、`unmatch`、`exclude`、`include`、`importRows`、`completeReconciliation`、`undoReconciliation`、`recordPaymentReversal` 与 `reset`。对账记录包含序号、完成时间、完成人、核对笔数和状态；完成对账要求待匹配为 0，撤销只允许最近一次已完成记录且原因必填。
- `app/mocks/types.ts` 为 `SupplierPayment` 增加 `status`、`voidedAt`、`voidReason` 与 `reversal`，新增 `SupplierPaymentReversal`；`app/mocks/supplierTrade.ts` 的付款种子补 `status: 'completed'`。
- `app/stores/supplierTrade.ts` 的 `paidOf` 排除已作废付款；新增 `voidPayment`：校验付款存在、未作废、原因非空、账单已过账和资金账户存在，生成冲销单 `RV-*` 与账户入账流水 `bt-rev-*`，回写作废状态并保留原付款。冲销流水标记为已匹配，凭证沿用账单凭证。
- `app/components/finance/SupplierPayables.vue` 的付款记录增加状态和「详情」入口，新增付款详情抽屉：展示原付款、关联账单、金额、资金账户、流水号与备注；未作废时可填写原因并确认作废；作废后展示冲销单、原因、更正后的银行流水、账户余额和账单未结回补说明。C1 固定算例说明按作废金额动态显示。
- `app/components/finance/BankRecon.vue` 的已匹配流水增加「解除匹配」；完成对账按钮允许在待匹配为 0 时再次完成；流水表下方展示账户对账记录与撤销状态，并提供「撤销最近对账」抽屉。`app/pages/finance.vue` 改接 `useBankReconStore`，银行数据只在显式刷新时重置，普通进入页面保留本次操作。
- 主要文件：`app/stores/bankRecon.ts`、`app/stores/supplierTrade.ts`、`app/mocks/types.ts`、`app/mocks/supplierTrade.ts`、`app/components/finance/BankRecon.vue`、`app/components/finance/SupplierPayables.vue`、`app/pages/finance.vue`、`test/bank-recon.test.ts`。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

打开 `http://localhost:3001/finance?tab=payables`，按以下路径复现：

1. 打开 `BILL-2026-1101` 详情，在付款记录点 `PAY-2026-1101` 的「详情」，填写作废原因并确认。
2. 核对付款详情出现 `RV-2026-1101`、更正流水 `bt-rev-PAY-2026-1101`、账户余额 `¥1,269,000.00`；关闭详情后账单未结由 `¥530.00` 变为 `¥1,130.00`，应付账龄合计同步增加 `¥600.00`。
3. 切换到「银行对账」，对刚生成的冲销流水点「解除匹配」，确认回到待匹配且凭证号变为「—」；再点「匹配」并确认，恢复已匹配。
4. 选择「中国银行」，将 3 笔待匹配流水全部排除，使待匹配为 0；连续完成两次对账，再撤销最近一次并填写原因。核对第 2 次显示已撤销与原因、第 1 次仍为已完成，账户仍显示「对账完成」；随后可再次完成第 3 次对账。

浏览器验收使用临时 Playwright 脚本（Microsoft Edge、1500×1100，验收后删除）。

### 本地结果

- 作废前 C1 账单未结 `¥530.00`、账龄合计 `¥530.00`；作废 `PAY-2026-1101` 后账单未结与账龄合计均为 `¥1,130.00`，固定算例说明显示「已作废 ¥600.00 付款」。付款详情显示冲销单 `RV-2026-1101`、原因「银行退回，原付款账户信息有误」、更正流水「付款作废冲销 PAY-2026-1101」入账 `600.00` 且已匹配到凭证 `JE-AP-2026-1101`，招商银行账户余额由 `¥1,268,400.00` 变为 `¥1,269,000.00`。
- 冲销流水解除匹配后状态变为「待匹配」、凭证号变为「—」；重新匹配后恢复「已匹配」，凭证号回到 `JE-AP-2026-1101`。
- 中国银行 3 笔待匹配流水全部排除后完成第一次对账；第二次完成后记录为第 2 次。撤销第 2 次并填写「遗漏两笔手续费流水」后，第 2 次显示「已撤销」及撤销时间和原因，第 1 次仍为「已完成」，账户仍显示「对账完成」；随后第三次完成对账，记录显示第 3 次「已完成」。
- 浏览器控制台 `console error` 与 `pageerror` 均为 0。
- `test/bank-recon.test.ts` 4 个用例通过：作废 C1 首笔 600.00 元付款后未结 530→1,130、`paidOf` 为 0、生成 `RV-2026-1101` 与已匹配冲销流水、账户余额增加 600；空原因与重复作废被拒；解除匹配回到待匹配且待处理数加 1，重新匹配后恢复；中国银行先完成两次对账，撤销旧记录失败、空原因失败、撤销第 2 次成功且第 1 次仍有效，随后可完成第 3 次。
- 静态检查：`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test:unit`（10 个文件 46 个测试）与 `pnpm build` 均通过；构建 45.4s，产物 14 MB（gzip 3.42 MB），仅保留既有的大 chunk 与依赖注释提示。C7 涉及文件执行 `eslint` 退出码 0。
- 全量 `pnpm lint` 当前被工作区其他并行改动阻塞，报告 301 个问题（218 error、83 warning），集中在 `ApprovalTimeline.vue`、`ChangeLogTimeline.vue`、`ModulePlaceholder.vue`、`NotificationSlideover.vue`、`PrintPreviewSlideover.vue`、`partners.vue`、`purchase-audit.vue` 等非 C7 文件；本次未修改这些文件，待对应工作流收口后复跑全量 lint。

### 已知事项

- 仍为纯 UI 原型，付款、流水与对账记录写入 Pinia，整页刷新恢复初始模拟数据；未接入 Finance 服务的付款过账、冲销或对账 API。
- 完成对账只要求待匹配为 0；排除全部流水后也可完成 0 笔核对的对账，接入后端时应要求存在实际匹配或显式选择「本期无流水」。
- 冲销流水沿用原账单凭证且不新建总账凭证；作废只处理单笔付款，未覆盖同一账单多笔后续付款、跨期间冲销或已核销应付的复杂场景。
- 对账完成人固定为模拟身份「陈昊」，撤销时间与作废时间使用本地时间；接入后端后应使用当前用户和服务端时间。

## C8 期初来源与入账结果追溯（2026-11-19）

### 范围

- `app/mocks/types.ts` 新增 `OpeningResultRecordKind`（`journal`/`stock`/`receivable`/`payable`/`bank`）与 `OpeningResultRecord`，`OpeningSubledgerPostingResult` 增加 `records`。每条记录保存单据编号、金额、来源标识、来源标签、来源行、状态与时间，来源行示例为「华东中心仓 · 第 1–12 行」。
- `app/mocks/financeOperations.ts` 新增 `buildOpeningResultRecords` 与 `buildOpeningSubledgerResult`。每个过账批次固定生成 17 条记录：4 张凭证、2 条库存流水、5 张应收单据、4 张应付单据、2 条银行流水；凭证沿用本批次的 `journalIds`，库存、应收、应付与银行编号带批次后四位。种子 `OB-2026-0001` 也改为由同一构造器生成。
- `app/stores/openingBalances.ts` 的 `postBatch` 先生成唯一凭证编号，再按实际记录构造过账结果；过账结果中的编号与数量不再硬编码，而由 `records` 按类型汇总。
- `app/components/finance/Opening.vue` 的过账结果区增加 5 个计数卡、17 行记录表、记录详情弹窗与「返回批次」。详情展示记录编号、所属批次、金额、来源行与来源单据，并提供来源页面链接；库存来源链接打开 `/inventory`，应收、应付和银行分别指向对应业务页面。
- 保留可重复运行的浏览器用例 `src/Web/nexora-web/e2e/c8-opening-trace.mjs`，同时覆盖 C8 与 C9；截图与报告输出到 `artifacts/ui-dashboard-c8-c9/`。

### 复现

```powershell
pnpm --dir src/Web/nexora-dashboard install --frozen-lockfile
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard lint
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard build
pnpm --dir src/Web/nexora-dashboard dev
node src/Web/nexora-web/e2e/c8-opening-trace.mjs
```

用例要求开发服务器已在 `http://localhost:3001` 运行，使用 Edge、1440×1000，执行后以非零退出码报告失败、控制台错误、页面错误或 4xx/5xx 响应。

### 本地结果

- 种子批次 `OB-2026-0001` 详情显示 17 条记录，计数为记账凭证 4、库存流水 2、应收单据 5、应付单据 4、银行流水 2；首条 `JE-OPEN-2026-0001` 的来源为「华东中心仓 · 第 1–12 行」，金额 ¥644,800.00。
- 记录详情回指 `OB-2026-0001`，来源单据显示 `RC-2026-0520-01`；点「返回批次」关闭详情后，底层批次抽屉仍保持打开。
- 新批次 `OB-2026-0002` 提交后为「待独立复核」；切换财务负责人陈立批准后进入「库存入账处理中」，再完成过账为「已过账」。过账结果仍为 17 条，凭证编号使用本批次序号 `JE-OPEN-2026-0005` 至 `JE-OPEN-2026-0008`，末条为 `BM-OPEN-0002-0002`，来源「中国银行一般户 · 第 39–40 行」，金额 ¥28,640.00。
- 库存来源链接回到 `/inventory`；`Opening.vue` 的计数由记录汇总，新增记录后计数与明细行数一致（4+2+5+4+2=17）。
- 浏览器验收共 59 项断言（C8 25 项、C9 34 项），`failures`、`consoleErrors`、`pageErrors`、`badResponses` 均为空，退出码 0；生成 20 张截图与 `report.json`。

### 已知事项

- 仍为纯 UI 原型，记录、凭证编号和过账结果写入 Pinia，整页刷新恢复种子数据；未调用 Finance 的期初过账接口。
- 库存记录金额固定为华东 486,400 与华南 158,400，过账后的 4 类校验仍为 3/4，因为 C5 固定的库存子账差异 +¥2,000.00 被有意保留；结果记录并不消除该差异。应收记录按实际生成 5 张汇总，C5 章节中的 6 张为旧固定文案。
- 来源链接定位到业务页面，具体来源行与来源单据在记录详情中展示；接入后端后应改为深链到对应凭证、库存流水、应收应付单据和银行流水详情。

## C9 定期开票（2026-11-19）

### 范围

- `app/mocks/types.ts` 将 `RecurringInvoicePlan` 扩展为客户、服务项目、数量、单价、按月间隔、付款账期、首期日期、结束日期、下次执行日、最后执行日、状态、版本、负责人、待处理原因与阻断期间；新增 `RecurringInvoiceOccurrence`，记录到期日、执行状态、模板版本、生成的发票与备注。
- `app/mocks/billing.ts` 提供 5 个服务项目、5 条计划与执行历史种子。计划覆盖执行中与已暂停，`RCP-2026-005` 的 2026-12 为期间阻断样例；执行历史包含已开票与已跳过记录。
- `app/stores/recurringInvoices.ts` 提供 `createPlan`、`updatePlan`、`togglePlan`、`runPlan`、`skipPlan`、`previewDates` 与按计划查询历史。固定演示今天为 2026-11-19；执行生成草稿发票并写入应收 store，同日重复执行返回原发票与「未重复生成」，期间阻断写入待处理原因并保留下次执行日。
- `app/components/sales/RecurringTable.vue`、`RecurringPlanSlideover.vue` 与 `RecurringFormSlideover.vue` 接入销售页「定期开票」页签。表格展示周期、每期未税、下次执行与状态；详情展示字段、未来执行日期、执行记录和操作；表单支持新建与编辑，选择服务联动单价，实时展示未来执行日期。
- `InvoiceDetailSlideover.vue` 的来源字段识别 `sourceScheduleId`，从执行历史进入的草稿发票显示「关联定期开票计划」与计划编号。

### 复现

打开 `http://localhost:3001/sales?tab=recurring`，依次执行：打开 `RCP-2026-001` 并执行当天到期日；再次执行同一天；打开 `RCP-2026-005` 观察期间阻断；新建季度计划；编辑首期日期；暂停与恢复；跳过到期日。也可直接运行 `node src/Web/nexora-web/e2e/c8-opening-trace.mjs` 重放完整 C8/C9 流程。

### 本地结果

- `RCP-2026-001` 执行 `2026-11-19` 后生成草稿发票 `INV-2026-0091`（价税合计 ¥14,464.00，到期 2026-12-19），下次执行日变为 2026-12-19，计划版本升到 v5；同日再次执行新增历史仍为 2 条，提示「已生成发票 INV-2026-0091，未重复生成。」，下次执行日不变。
- 从执行历史打开草稿发票 `INV-2026-0091`，来源显示「关联定期开票计划」`RCP-2026-001`；草稿编辑说明显示「来源计划 RCP-2026-001 · 本期服务数量可调整」，且不再出现仅适用于销售订单的「查看关联订单」按钮。
- `RCP-2026-005` 在 2026-12 期间阻断，历史显示「期间阻断」，详情保留「待处理：期间阻断 2026-12 会计期间尚未开启，已保留待处理原因与下次执行日。」，下次执行日仍为 2026-12-01。
- 新建 `RCP-2026-006`（数据备份与容灾服务 2×9,000、每季度、首期 2026-12-01）时预览为 2026-12-01、2027-03-01、2027-06-01、2027-09-01、2027-12-01；保存后列表增至 4 条，下次执行 2026-12-01，计划归属当前工作区。修复了季度选项把字符串写入 `intervalMonths` 导致预览只显示首期的问题，选项值改为数字。
- 编辑首期为 2027-01-05 后下次执行日刷新为 2027-01-05、版本 v2；暂停后状态「已暂停」，恢复后仍为 2027-01-05；跳过 2027-01-05 后历史显示「已跳过」、模板 v4，下次执行 2027-04-05。
- 暗色主题下表格与计划详情正常；采购订单与期初页回归通过，种子批次仍可查看结果。
- 浏览器验收 59 项断言全部通过（C8 25、C9 34），控制台错误、页面错误与异常响应均为 0；20 张截图见 `artifacts/ui-dashboard-c8-c9/`。
- `test/recurring-invoices.test.ts` 5 个用例通过；`test/opening-balances.test.ts` 扩展记录断言；全量 `pnpm test:unit` 11 个文件 51 个测试通过。
- 最终串行 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 退出码 0；构建 31.1s，产物 14 MB（gzip 3.44 MB），仅保留既有的大 chunk 与依赖注释提示。

### 已知事项

- 仍为纯 UI 原型，计划、执行历史与发票写入 Pinia，刷新后恢复种子；没有后台调度器，执行与跳过均为手动触发。
- 固定演示今天为 2026-11-19，计划的下次执行日与未来日期据此计算；接入后端后应使用服务端日期与时区。
- 期间阻断由种子中的 `blockedPeriods` 模拟（`RCP-2026-005` 的 2026-12），未接入会计期间的关闭/开启状态。
- 同一到期日重复执行只拦截已执行记录；跳过记录的同一日期同样拒绝再执行，尚未覆盖并发执行。计划列表与新建已按当前工作区隔离，单测覆盖在 `ws-south` 创建计划。

## 国际化首轮：应用壳层与工作台（2026-11-19）

### 范围

- `@nuxtjs/i18n` 10.6.0 启用 `strategy: 'no_prefix'`，新增 `i18n/locales/zh-CN.json` 与 `en.json`；`app/app.vue` 按当前语言设置页面标题、描述、`htmlAttrs.lang` 与 Nuxt UI 的 `UApp locale`（`zh_cn` / `en`）。
- `app/layouts/default.vue` 本地化侧栏 11 个导航、搜索按钮、原型提示、命令面板说明与页脚语言选择；`UserMenu.vue` 增加折叠态语言组和 `data-testid="user-menu-trigger"`；`WorkspaceMenu.vue` 本地化当前工作区文案。
- `app/pages/index.vue` 本地化工作台 KPI、趋势图标题与坐标单位、待办分组和优先级、最近单据表头与状态、最近动态、导出与刷新提示及页脚说明。中文金额使用「万元」，英文使用 `¥1k`；月份标签按 `Intl.DateTimeFormat(locale)` 生成。
- `NotificationSlideover.vue`、`AccountSecuritySlideover.vue` 与 `NotificationButton.vue` 本地化通知来源、MFA、会话与安全操作；`useNotifications.ts` 的通知标题、时间和来源文案随语言切换，业务标题与摘要保留模拟数据原文。
- `useDashboardSearch.ts` 覆盖页面分组、页面描述、商品、伙伴、定义、单据、变更记录和错误页结果；最近访问按路径映射回 `nav.*`，切换语言后不残留旧语言。
- `useMockLabels.ts` 统一采购、销售、报价、发票、变更实体、伙伴类型、定义、税码、待办优先级、单据类型与原始状态、通知来源的显示枚举；`app/mocks/types.ts` 的中文联合类型保持不变。
- 语言选择写入 `nexora-locale` Cookie：`detectBrowserLanguage` 开启 `useCookie`，`fallbackLocale: 'zh-CN'`，`redirectOn: 'root'`，`alwaysRedirect: false`。首次访问按浏览器语言检测，之后刷新保持所选语言。
- `test/i18n-locales.test.ts` 校验中英键集合、空值和占位符一致。
- 主要文件：`app/app.vue`、`app/layouts/default.vue`、`app/pages/index.vue`、`app/components/UserMenu.vue`、`WorkspaceMenu.vue`、`NotificationSlideover.vue`、`NotificationButton.vue`、`AccountSecuritySlideover.vue`、`app/composables/useLocaleSwitch.ts`、`useMockLabels.ts`、`useDashboardSearch.ts`、`useNotifications.ts`、`i18n/locales/zh-CN.json`、`en.json`、`nuxt.config.ts`、`test/i18n-locales.test.ts`。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
pnpm --dir $nexoraDashboard dev
```

打开 `http://localhost:3001`，默认应为中文。点击侧栏底部或页脚的语言选择切换到 English，检查工作台、命令面板、通知抽屉和账户安全抽屉；刷新页面确认仍为英文。再次切换回中文。浏览器验收使用临时 Playwright 脚本（Microsoft Edge、1440×1000，验收后删除）。

### 本地结果

- 中文首屏：`html lang="zh-CN"`，标题含「UI 原型」；KPI 为「本月采购额 / 本月销售额 / 应收 / 应付」；趋势区间为「2026 年 1–12 月 · 单位：万元」；页脚为「所有数据来自 app/mocks/ 的本地模拟数据，刷新页面后恢复初始值。」。
- 切换到 English 后：`html lang="en"`，KPI 为 `Purchases this month` / `Sales this month`，趋势为 `Jan–Dec 2026 · Unit: ¥1k`，搜索按钮和侧栏提示为英文，页脚为 `All data comes from local mock data...`；刷新后仍保持 `en`，Cookie `nexora-locale` 值为 `en`。
- 英文命令面板显示 `Select` / `Close` 与英文占位；通知抽屉显示 `Notifications`、`Mark all as read` 和本地化来源 `Purchase approval`；账户安全抽屉显示 `Account & security`、`MFA enabled`、`Sign-in sessions`、`End other sessions`。再切回中文后 KPI 恢复中文。
- 浏览器控制台 `console error` 与 `pageerror` 均为 0，intlify 缺键或占位符警告为 0。
- `pnpm typecheck` 退出码 0；`pnpm test:unit` 12 个文件 54 个测试全部通过，其中 `i18n-locales.test.ts` 3 个。
- `pnpm build` 退出码 0，构建 45.2s，产物 14.3 MB（gzip 3.48 MB），仅有既有的大 chunk 与依赖注释提示。
- 本次改动的 14 个源码与测试文件执行 `eslint` 退出码 0。
- 全量 `pnpm lint` 仍被工作区其他并行改动阻塞（C7 验收时为 301 个问题，集中在 `ApprovalTimeline.vue`、`ChangeLogTimeline.vue`、`ModulePlaceholder.vue`、`NotificationSlideover.vue`、`PrintPreviewSlideover.vue`、`partners.vue`、`purchase-audit.vue` 等非本轮文件），这些文件未修改。

### 已知事项

- 首轮只覆盖应用壳层与工作台。商品目录、伙伴档案、主数据定义、采购、销售、库存、财务、设置和变更记录仍为中文，后续逐页迁移并在同一键表补充文案。
- 业务 mock 数据（公司名、商品名、往来单位、审计摘要、待办标题、单据备注）保持源语言，不纳入首轮翻译；状态、类型等展示枚举已由 `useMockLabels` 本地化。
- 路由使用 `no_prefix`，中英文共用同一 URL；首次访问按浏览器语言检测，非英文浏览器仍回退 `zh-CN`。
- 开发环境下 Nuxt 大页面水合约需 6 秒，浏览器脚本需等待页面稳定后再操作 `USelect`；Reka UI 的 `USelect` 可用聚焦后回车或方向键展开。
- 验收截图与脚本为临时文件，已删除；工作区还有 500+ 条其他并行改动，本轮未提交、未重置、未修改无关文件。

## C10 外部凭证（2026-11-19）

### 范围

- `app/mocks/types.ts` 增加 `ExternalJournalStatus`、`ExternalJournalBatchIssue` 与 `ExternalJournal`，保留来源系统、外部编号、状态、版本、制单人、过账编号与分录。
- `app/mocks/externalJournals.ts` 提供 4 条种子外部凭证与来源系统选项；`app/stores/externalJournals.ts` 提供 `importJournal`、`updateJournal`、`decideBatch` 与状态计数。登记校验来源系统 1–40 位字母数字/短横线/下划线、外部编号 1–80 字符、业务日期期间、摘要、借贷平衡与重复来源编号；草稿编辑校验制单人与版本。
- `app/components/finance/ImportedJournals.vue` 接入财务页「外部凭证」页签，覆盖录入、编辑、详情、多选批量提交复核/取消/独立过账、逐条问题提示与身份切换。批量上限 50 张，混入非外部凭证、状态不符或版本冲突时整批不写入并逐条列出原因。
- `app/components/finance/JournalPanel.vue` 与财务页「凭证」页签显示外部来源与过账编号；已过账外部凭证并入总账列表。
- 保留可重复运行用例 `src/Web/nexora-web/e2e/c10-c12-acceptance.mjs`，C10 与 C11、C12 共用一次浏览器会话。

### 复现

```powershell
pnpm --dir src/Web/nexora-dashboard install --frozen-lockfile
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard lint
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard build
pnpm --dir src/Web/nexora-dashboard dev
node src/Web/nexora-web/e2e/c10-c12-acceptance.mjs
```

用例要求开发服务器已在 `http://localhost:3001` 运行，使用 Edge、1440×1000；执行后以非零退出码报告断言失败、控制台错误或页面错误，并在 `artifacts/ui-dashboard-c12/` 生成 21 张截图与 `report.json`。

### 本地结果

- 外部凭证页显示 4 条种子；`IMP-2026-0001` 详情来源为「金蝶云星空」、外部编号 `JE-2026-0088`。制单人可提交复核但看不到独立过账按钮；提交后状态「待独立复核」、版本 v2，待复核计数变为 2。
- 混选草稿与待复核凭证后执行批量取消，页面提示「整批保持原状态」并逐条指出非草稿记录；复核人切换后仅对待复核记录独立过账成功，过账计数变为 2。
- 新建外部凭证复用同一来源与外部编号时提示「不能重复登记」；总账「凭证」页签出现 `JE-2026-0089` 的外部来源标记，详情保留来源系统、外部编号与过账编号。
- C10 共 20 项断言全部通过，控制台错误与页面错误为 0。

### 已知事项

- 纯 UI 原型：外部凭证写入 Pinia，整页刷新恢复种子；批量 50 张上限与版本冲突由 store 校验，未做并发压力测试。
- 期间关闭时允许保存草稿并给出具体提示，提交复核会被拦截；未模拟后端幂等回执。

## C11 捐赠收据（2026-11-19）

### 范围

- `app/mocks/types.ts` 与 `app/mocks/donations.ts` 提供捐赠单、资金流水、收据、财政票据、邮件投递与渠道能力种子；捐赠人选项只取启用且具有 `donor` 角色的伙伴。
- `app/stores/donations.ts` 提供捐赠录入、提交复核、独立复核、过账生成收据与冲销、票据关联、邮件发送/重试/重寄/放弃及渠道启停。现金捐赠只允许现金账户，支票、银行卡与转账只允许银行账户。
- `app/components/finance/Donations.vue` 接入财务页「捐赠管理」页签；沿捐赠单展示收据编号、资金流水、凭证链接、本地收据样张、财政票据类型、法定票据能力与邮件投递记录。
- 普通收据样张可预览与打印，明确标注「非财政票据」；已关联外部财政票据的捐赠单显示票据代码、号码与开具日期，能力样例返回法定票据不可签发。

### 复现

打开 `http://localhost:3001/finance?tab=donations`，或运行上节用例。依次检查已过账捐赠单的资金流水、凭证、收据样张与邮件；在渠道停用时发送，再启用后发送；打开失败投递详情并重试；切换到财务负责人复核待处理捐赠单。

### 本地结果

- 已过账口径显示 ¥70,000.00，包含已作废原单与负额冲销记录；`DON-2026-0001` 收据号 `RCPT-DON-2026-0001`、资金流水 `BF-2026-0001`，凭证链接可打开总账详情。
- 收据样张显示捐赠人、金额、受赠单位与「非财政票据」标记；`DON-2026-0002` 显示已关联财政票据，能力样例提示法定票据不可签发。
- 渠道停用时发送被阻止并显示 SMTP 配置原因；启用后发送记录显示「SMTP 已接受」。失败记录详情保留 `SMTP 550` 原因，重试生成新的排队/已接受记录并关联原记录。
- 切换财务负责人后批准 `DON-2026-0003`，状态变为已过账并生成 `RCPT-DON-2026-0003`；列表状态与收据号同时刷新。
- C11 共 16 项断言全部通过；控制台错误与页面错误为 0。

### 已知事项

- 邮件发送、重试与重寄为本地定时模拟，不连接真实 SMTP；渠道停用原因来自固定能力样例。
- 收据打印使用浏览器打印，不生成 PDF 文件；作废与冲销记录写入 Pinia，刷新后恢复种子。

## C12 采购、销售单据操作与往来档案（2026-11-19）

### 范围

- `app/composables/useDemoActor.ts` 提供两种演示身份：张明远（业务经办/制单）与陈立（业务主管/审批）。采购与销售页按身份和工作区控制新建、提交、撤回、取消、重新提交与审批入口。
- `app/pages/purchase-orders.vue` 与 `app/pages/sales.vue` 增加已提交撤回、草稿取消、重新提交与销售报价正式发出；审批前校验制单人与审批人不同，自批记录显示提示并隐藏或禁用批准按钮。
- `app/pages/partners.vue` 支持新建客户、供应商、捐赠人及多角色主体，维护地址、税号与多个联系人；新建自动生成档案编号，编辑时编号只读。类型筛选兼容多角色，停用主体退出新单据适用项。
- `app/pages/catalog.vue` 详情展示商品/服务与是否跟踪库存；商品表单移除单价和库存输入，改为交易行与仓库流程提示；选择列补充表头，服务强制不跟踪库存，引用提示说明停用只影响新单据。
- `app/components/finance/TradeDocuments.vue` 与 `app/stores/tradeDocuments.ts` 接入财务页「单据流转」页签：展示 AR/AP 科目映射、采购暂估确认/冲回，以及供应商账单、客户收款、核销三类单据的提交、独立复核、过账与过账前取消。

### 复现

打开 `http://localhost:3001/partners` 新建多角色伙伴；打开 `/catalog` 查看商品详情；打开 `/purchase-orders` 切换审批身份观察 `PO-2026-0516` 自批提示，切回制单人撤回 `PO-2026-0512` 后重新提交；打开 `/sales?tab=quotes` 正式发出草稿报价，打开 `/sales?tab=orders` 观察 `SO-2026-9003` 自批禁用；打开 `/finance?tab=documents` 确认暂估并复核过账账单。

### 本地结果

- 新建伙伴保存 3 个角色（供应商/客户/捐赠人）、2 个联系人、地址与自动编号 `PT-*`；详情角色徽标、联系人与地址完整显示，既有停用伙伴仍保留原角色。
- 商品详情显示「商品」与「跟踪库存」，引用提示说明停用后只影响新单据；库存链接指向 `/inventory`，表单不再录入单价与库存。
- 采购 `PO-2026-0516` 在审批身份下显示自批提示且不出现批准按钮；`PO-2026-0512` 制单人撤回后显示撤回提示，可重新提交并恢复待审批入口。
- 报价 `QT-2026-0413` 由草稿正式发出，详情出现「正式发出于 2026-11-19 13:24」；销售订单 `SO-2026-9003` 在审批身份下显示自批提示，批准按钮禁用。
- 单据流转页暂估待处理 ¥98,400.00、已过账库存金额 ¥52,600.00；确认 `PB-2026-001` 后待处理归零、已过账金额变为 ¥151,000.00。AR 映射 `1122`、AP 映射 `2202` 均显示已映射。
- 供应商账单 `BILL-2026-1101` 由陈立复核后进入「已复核待过账」，再独立过账为「已过账」；制单人与复核人不同时才允许复核。
- C12 共 34 项断言全部通过；连同 C10/C11 共 70 项断言、21 张截图，`consoleErrors` 与 `pageErrors` 均为空，退出码 0。
- 最终串行 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 退出码 0；`test:unit` 14 个文件 62 个测试通过；构建 35.0s，产物 14.4 MB（gzip 3.49 MB），仅保留既有的大 chunk 与依赖注释提示。

### 已知事项

- 仍为纯 UI 原型，订单、伙伴、目录与单据流转写入 Pinia，整页刷新恢复种子；演示身份不接入 Keycloak 会话。
- 单据流转页使用独立固定样例，不写回 C1/C2 的供应商账单与应收 store；接入后端后应复用同一单据与权限校验。
- 商品单价与库存字段只从表单移除，历史 mock 仍保留原值供交易行与库存页面展示；税组按需求留待 C16。

## 品牌图标（2026-11-19）

### 范围

- 新增 `public/favicon.svg`：512×512 深靛蓝圆角底，蓝白渐变的几何 N 字标，辅以细银蓝内框与低饱和品牌蓝光；SVG 为图标源文件，不依赖字体。
- 新增 `public/favicon.ico`：内含 16×16、32×32、48×48 三个 PNG 条目，供传统浏览器与 Windows 快捷方式使用。
- 新增 `public/apple-touch-icon.png`：180×180 全出血正方形版本，移除外层圆角与描边，交由 iOS 自行遮罩；背景不透明。
- `app/app.vue` 的全局 `head` 显式声明 SVG favicon、ICO fallback 与 Apple touch icon，保留原有动态 `theme-color`。
- 预览图保存于 `artifacts/ui-dashboard-icon/favicon-preview.png`，含浅色/暗色背景、512/180/64/32/16 尺寸与 16px 8 倍像素放大。

### 复现

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard dev
```

打开 `http://localhost:3001/` 后强制刷新（或新开无痕窗口）查看标签页图标；也可直接访问 `/favicon.svg`、`/favicon.ico`、`/apple-touch-icon.png`。

### 本地结果

- 页面 head 中恰好 3 个图标链接：`image/svg+xml` 的 `/favicon.svg`、`image/x-icon` 的 `/favicon.ico`（`16x16 32x32 48x48`）和 `180x180` 的 `/apple-touch-icon.png`。
- 三个资源均返回 200：SVG 为 `image/svg+xml`（1,883 字节）、ICO 为 `image/vnd.microsoft.icon`（6,210 字节）、Apple touch 为 `image/png`（25,490 字节，180×180 RGB）。
- Pillow 读取 ICO 得到 16/32/48 三个尺寸；SVG 与 Apple PNG 均可正常解码，无请求失败或控制台错误。
- 16px 与 32px 下 N 字标仍可辨认，暗色标签栏上对比度足够；浅色与暗色页面背景均不依赖图标自带的透明留白。
- `app/app.vue` ESLint 退出码 0；复跑 `pnpm typecheck` 退出码 0；`pnpm build` 退出码 0，构建 1m24s，产物 14.4 MB（gzip 3.5 MB），仅保留既有的大 chunk 与依赖注释提示。
- 构建产物 `.output/public/` 包含上述三个图标文件。

### 已知事项

- 浏览器会缓存站点图标，替换后首次查看可能需要强制刷新或新开窗口；本轮未修改版本化路径。
- 当前只提供 favicon 与 Apple touch icon，未新增 PWA manifest、maskable icon 或社交分享大图；如后续需要安装到主屏，再补 192/512 与 manifest。
- Apple touch icon 使用独立全出血版本，圆形/超椭圆遮罩由系统完成；SVG 保持 512 圆角方形作为浏览器标签页版本。

## C13 仓库管理、盘点与在途调拨（2026-11-19）

### 范围

- `app/components/inventory/WarehouseOperations.vue` 接入库存页「仓网与调拨」页签，包含仓库网络、盘点处理与调拨三块；仓库卡片展示收货人、可接收与可调拨权限，详情可更换收货人，保存后卡片、权限提示与操作入口同步变化。
- 新建仓库支持编码、名称、城市、指定收货人，以及是否允许接收/调拨；新建后加入本地仓库列表，作为盘点与调拨的可选仓。
- 盘点详情逐行展示账面数量、实盘数量、差异与行原因，提交后与复核人身份分离；复核完成写回本地库存快照并生成 `adjust` 库存流水，处理记录保留提交、复核与完成时间。
- 调拨从来源仓创建，源仓确认出库后进入在途，来源可用量立即减少、目标仓可用量保持原值，并按商品展示在途数量与在途成本；目标仓指定收货人确认入库后完成，目标仓增加、两端流水保留同一调拨单号。重复确认只提示，不重复增减库存。
- 保留可重复运行的 `src/Web/nexora-web/e2e/c13-c16-acceptance.mjs`，C13 段覆盖上述入口、权限、盘点、调拨与重复确认。

### 复现

```powershell
pnpm --dir src/Web/nexora-dashboard dev
node src/Web/nexora-web/e2e/c13-c16-acceptance.mjs
```

打开 `http://localhost:3001/inventory`，点击「仓网与调拨」；脚本使用 Edge、1440×1000，在 `artifacts/ui-dashboard-c13-c16/` 生成截图与 `report.json`，断言失败、控制台错误或页面错误时以非零退出码结束。

### 本地结果

- 初始 3 个仓库，华东中心仓收货人为陈立；详情更换为周宁后，权限标签、提示与仓库卡片同步；新建「华北区域仓 / 北京 / 林小雨」后共 4 个仓库。
- 盘点 `ST-2026-0001` 展示 -3 与 +4 两行差异及已填原因；张明远提交后出现切换审批人提示，切陈立复核完成后，华东仓 `SKU-1001` 由 60 回写为 57、`SKU-1002` 由 120 回写为 124，并生成差异调整流水。
- 新建调拨 `TR-2026-0002`（华东中心仓 → 华南前置仓，ThinkPad X1 笔记本 ×2）出库后状态为「在途」，在途数量 2、在途成本 ¥9,000.00，来源仓可用量由 57 降至 55，目标仓保持 12；切林小雨确认入库后完成，目标仓变为 14，两端流水可按同一调拨单追溯，再次确认不重复增加。
- C13 共 42 项断言通过，截图 01–06，控制台与页面错误均为 0。

### 已知事项

- 仓库、盘点与调拨使用组件内本地状态，刷新页面恢复种子；未接入后端版本、并发与幂等校验。
- 仓库操作页使用独立库存快照，未与 C3 的收发货台账做跨页联动；权限简化为演示员工的可接收/可调拨标记。

## C14 资金账户、银行流水与对账（2026-11-19）

### 范围

- `app/mocks/treasury.ts`、`app/stores/treasury.ts` 与 `app/components/finance/Treasury.vue` 接入财务页「资金管理」页签，提供银行/现金账户、默认账户、余额与资金流水。
- 资金流水覆盖其他收入、费用、资金划转、业主投入与提款；草稿可编辑、提交复核、独立过账与作废，过账后写入凭证号并更新账户余额。资金划转生成方向相反的两条流水，共享同一业务来源。
- CSV 对账单按账户与列映射预览，区分有效行、重复行与问题行，提交后生成导入批次；同一文件重复导入被拦截。
- 对账单行可匹配已有已过账流水，或带入其他收入、费用与供应商付款并生成对应已过账流水；支持分次匹配、剩余金额、超额拦截、排除与恢复。对账按截止日期和银行期末余额计算账面余额、未达项与差异，支持保存待完成记录、取消、独立确认、报告预览及按原因撤销最近一次对账。
- `test/treasury.test.ts` 覆盖默认账户唯一性、划转两条流水、自批拦截、导入重复文件、分次匹配、超额匹配与撤销原因校验。

### 复现

打开 `http://localhost:3001/finance?tab=treasury`，或运行上节脚本的 C14 段。依次检查新建账户、划转两腿提交与独立过账、CSV 导入预览、对账单匹配与排除、对账草稿到独立确认、报告与撤销。

### 本地结果

- 初始 5 个账户（3 个银行、2 个现金），工商银行基本户为唯一默认；新建「招商银行一般户」后共 6 个。划转 ¥1,000.00 生成方向相反的两条流水，分别提交后制单人复核被拒，切陈立独立过账后两条均为「已过账」；工商银行基本户余额由 ¥286,420.00 变为 ¥285,420.00，建设银行一般户由 ¥128,750.50 变为 ¥129,750.50，凭证号为记-2026-1121 与记-2026-1122。
- 导入「工商银行_2026-12.csv」预览有效 3 行、重复 1 行、问题 2 行（重复与金额非法各一），提交提示「已导入 3 条对账单流水，问题行 2 行未入账。」
- `STM-2601` 分次匹配 ¥5,000.00 后为部分匹配，再匹配 ¥7,000.00 后完成；`STM-2602` 匹配 ¥50,000.00 被「匹配金额超过该行剩余金额」拦截；`STM-2603` 排除后保留原因并可恢复。
- 出纳备用金账面余额与银行期末余额均为 ¥8,600.00、差异 ¥0.00；保存待完成记录后制单人确认被拒，切陈立独立确认生成 `REC-2026-2701`，报告显示两期余额与零差异，撤销必须填写原因。
- C14 共 30 项断言通过，截图 07–12；`pnpm test:unit` 中 treasury 4 个测试通过。控制台与页面错误均为 0。

### 已知事项

- 纯 UI 原型：账户、流水、导入批次与对账写入 Pinia，刷新后恢复种子；未接入银行文件上传或真实 CSV 解析，导入使用固定样例文本。
- 「带入供应商付款」按费用流水模拟并直接过账，未关联采购账单或付款申请；对账确认不写回总账，仅生成本地报告。

## C15 总账、科目与关账年结（2026-11-19）

### 范围

- `app/components/finance/Closing.vue` 接入财务页「关账与年结」页签，内含工作台就绪、凭证生命周期、科目树治理、期间与年结、合伙人五个子页签；`app/mocks/closing.ts` 提供账簿、凭证、科目、期间与合伙人种子。
- 就绪检查展示账簿、期初、已过账未关联凭证与待入账库存成本；可按截止日补记库存成本并保留记录。凭证支持草稿编辑、提交复核、撤回复核、业务主管独立过账、按过账日期与原因冲销，详情回链原凭证与冲销凭证；异常扫描可定位未关联的已过账凭证，支持关联、移除关联与重复关联拦截。
- 科目树展示用途、余额、引用次数与归档状态，支持归档/恢复、模板/结构/快照 CSV 导出、CSV 文本导入预览与逐行校验、科目合并与空账簿二次确认替换。
- 期间与年结覆盖月度详情、关账检查、开始关账、清零关闭、按原因重开；年度年结预览、申请、独立确认或取消、重开及结转凭证回链。合伙人按年度维护份额、资本与提款科目，份额合计必须为 100%，预览按份额分摊本年利润。

### 复现

打开 `http://localhost:3001/finance?tab=closing`，依次切换五个子页签；脚本 C15 段覆盖就绪补记、凭证生命周期、异常关联、科目治理、三个月关账、合伙人校验与年结申请/确认/重开。

### 本地结果

- 初始就绪检查「通过 2 / 4」，凭证项提示已过账未关联 1 张，库存成本项提示待入账 ¥42,800.00；补记后变为「通过 3 / 4」，历史保留 `COST-2026-0001`。
- `JE-2026-1201`（折旧 ¥12,400.00）提交后，同身份过账提示「请切换为业务主管」；切陈立后过账成功，冲销生成 `JE-RV-2026-1201` 且原单显示「已冲销」。`JE-2026-1202` 同日完成提交与独立过账。
- 扫描定位 `JE-2026-1150`；移除 `JE-2026-1202` 的业务关联后重新进入异常列表，尝试关联同一业务单据被「不能重复关联」拦截，改选其他单据后异常清零。
- 科目表初始 32 个；`1003` 归档后可恢复；模板、结构、快照三种 CSV 均下载成功；导入样例有效 2 行、跳过 4 行，科目变为 34 个；两个有余额科目合并被拒，`1003` 并入 `1001` 后为 33 个。
- 2026-10、2026-11、2026-12 依次关账；合伙人份额改为 45%（合计 105%）时保存被拒，恢复 40% 后保存成功，年结预览分摊为 ¥103,440.00 / ¥90,510.00 / ¥64,650.00。
- 业务经办提交 2026 年结申请，业务主管独立确认后生成 `JE-CLOSE-2026`；已年结时重开月份被「需要先重开年度」拦截，重开年度后可按原因重开 2026-12。
- C15 共 38 项断言通过，截图 13–16；控制台与页面错误均为 0。

### 已知事项

- 纯 UI 原型：凭证、科目、期间、年结与合伙人配置均保存在组件内，刷新页面恢复种子；未写回后端总账或期间状态。
- 库存成本补记只更新就绪检查与本地记录，不生成正式记账凭证；年结结转凭证为演示数据，不参与报表重算。

## C16 税率、税组与申报更正（2026-11-19）

### 范围

- `app/mocks/taxCenter.ts` 与 `app/components/finance/TaxCenter.vue` 接入财务页「税务中心」页签，维护带生效日期的税率版本、税组、商品与往来单位绑定、税额计算预览及税历申报。
- 税率版本按税种维护编码、税率、生效与失效日期；同一税种新建重叠版本会被拒绝，停用后写入失效日期。税组可新建、启用、停用，组合多个税种并显示合计税率。
- 税额预览支持含税/未税口径、金额、折扣、税组、舍入与计算日期，展示未税、税额、含税、分税项明细和计算快照；切换至 2026-05-01 后同一含税金额按 14% 新版本重算。
- 税历支持按月/按季度与权责发生制/收付实现制切换；税期详情展示分税项汇总、申报编号、记录历史、差异与账簿锁定状态，首次申报后锁定，重新预览生成差异，填写原因后提交更正并追溯原申报。

### 复现

打开 `http://localhost:3001/finance?tab=tax-center`，或运行脚本 C16 段。依次停用/新建税率、创建并启停税组、保存商品与往来单位绑定、验证 1,130 元含税拆税与新税率重算，再完成 2026-11 首次申报、差异预览、原因必填与更正提交。

### 本地结果

- 初始 7 个税率版本；停用出口零税率版本后失效日期写为 2026-11-18，新建 2026-11-19 起生效的版本后为 8 个；新税组创建后为 5 个，停用/启用可往返切换。
- 商品 `SKU-1002` 与「服务税组」绑定保存后，商品与往来单位当前绑定均显示「服务税组」。
- 默认含税 ¥1,130.00 按标准内销税组拆为未税 ¥1,000.00、税额 ¥130.00、含税 ¥1,130.00；切至 2026-05-01 后为 ¥991.23 / ¥138.77 / ¥1,130.00，计算快照显示适用 14% 版本。
- 2026-11 税期初始「待申报」¥212,256.00；首次申报生成 `TAX-2026-11-0001` 并锁定账簿，重新预览差异 +¥1,650.00；空原因提交被拒，填写原因后生成 `TAX-2026-11-0001-C1`，追溯区保留原申报号，状态更新为「已更正」。
- C16 共 20 项断言通过，截图 17–18；控制台与页面错误均为 0。
- 本轮 C13–C16 合计 130 项断言、18 张截图，`report.json` 记录 `total=130, passed=130, failed=0`，控制台、页面与失败响应均为 0，脚本退出码 0。
- 最终串行 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 退出码 0；`test:unit` 15 个文件 66 个测试通过；构建 38.5s，产物 15.1 MB（gzip 3.59 MB），仅保留既有的大 chunk 与依赖注释提示。

### 已知事项

- 纯 UI 原型：税率版本、税组、绑定、申报与更正保存在组件内，刷新页面恢复种子；未接入后端税率版本或申报编号生成。
- 税历的季度与收付实现制切换已提供入口，本轮浏览器断言主要覆盖月度/权责口径；首次申报后账簿自动锁定，未提供手动解锁入口。
- 法定税务申报、财政票据与真实税局接口不在本轮范围，税期数据为固定演示值。

## C17 发票编号、PDF 与交付（2026-11-19）

### 范围

- 在销售页新增「发票交付」页签（`src/Web/nexora-dashboard/app/components/sales/InvoiceDelivery.vue`），分编号规则、样张与分享、寄送记录三部分。编号规则可按格式、起始号和指定日期预览下一号，开票复核表展示候选编号；版本或编号变动后候选失效，需要重新确认。过账后写入正式编号并锁定，既有发票保留原编号。
- 本地样张展示草稿/正式发票与公司抬头；分享记录展示有效期、状态和复制入口，支持新建与撤销；分享预览区分有效、过期、已撤销和不可用。
- 寄送记录保留收件人、投递详情、失败原因与结果未知状态，并按状态提供重试、重寄和放弃；重试/重寄生成关联的新记录并回链原记录，同时展示发送渠道与工作区发件人的可用性。

### 复现

打开 `http://localhost:3001/sales?tab=invoice-delivery`，或运行脚本 C17 段。先用制单身份确认候选编号并切换业务主管过账，再修改编号规则使旧候选失效并重新确认；随后创建/撤销分享，分别处理失败和结果未知的寄送记录。

### 本地结果

- 复核列表初始 5 张发票，候选编号为 `INV-2026-0118`；制单身份过账入口不可用，切陈立确认后可过账，正式编号写入 `INV-2026-0118` 并显示「编号已锁定」。编号规则变化后 `inv-review-2020` 出现失效提示，重新确认生成 `INV-2026-0119`。
- 本地样张显示已过账发票 `INV-2026-0117`，公司抬头与价税合计 `539,688.00` 正确；新建分享生成 `share-0006`，撤销后状态为「已撤销」，摘要为有效 1、过期 0、撤销 1、不可用 0。
- `mail-1098` 详情保留失败原因 `MAILBOX-FULL`，重试生成 `mail-1100` 并显示已送达，原记录保留回链；`mail-1099` 显示「结果未知」，改收件人重寄生成 `mail-1101`，原记录仍为未知。
- C17 共 17 项断言通过，截图 01–03。

### 已知事项

- 纯 UI 原型：编号规则、复核、分享与寄送状态保存在组件内，刷新恢复种子；未调用真实 PDF 生成、签名、对象存储或邮件服务。
- 本地样张仅用于核对抬头、编号、金额与版式，不代表可交付的法定发票文件；分享链接为演示记录，不生成可对外访问的令牌。
- 寄送渠道与发件人能力为固定样例，失败原因与重试结果由本地状态机模拟。

## C18 财务报表、账龄与工作台投影（2026-11-19）

### 范围

- 在财务页新增「报表中心」（`src/Web/nexora-dashboard/app/components/finance/ReportingCenter.vue`），分四表与钻取、账龄与明细账、权益与导出三部分。利润表按日期区间展示收入、成本、费用、营业利润和净利润，报表行可钻取到对应凭证。
- 账龄支持截止日与快照编号，展示应收、应付余额和五档分桶；客户/供应商明细账展示期初、本期增加、本期减少、期末及单据回跳。更换截止日后提示差异并可重算新快照。
- 权益变动表展示本期净利润与期末权益，导出记录沿用 C5 的期间与水位；首页新增财务投影卡（`src/Web/nexora-dashboard/app/components/finance/ReportingProjectionCard.vue`），区分过账水位、工作区版本和更新时间，并演示已就绪、待生成、暂不可用。

### 复现

打开 `http://localhost:3001/finance?tab=reporting`，或运行脚本 C18 段。核对 2026-11-01 至 2026-11-18 的利润表与钻取，再查看账龄、明细账和权益导出；最后回到工作台切换华东、华南、杭州三个工作区。

### 本地结果

- 利润表区间收入 `728,960.00`、成本 `477,473.00`、营业利润 `86,020.00`、净利润 `73,117.00`；收入行钻取到凭证 `JE-2026-1102`。
- 账龄快照 `AS-2026-11-18` 应收 `355,340.00`、应付 `320,770.00`，五档分桶含「未到期」。明细账期初 `255,460.00`、本期增加 `68,400.00`、期末 `243,060.00`；杭州云杉期末 `151,000.00`。
- 截止日改为 2026-10-31 后出现差异提示，重算生成该截止日的新快照；权益变动表期末权益 `129,030.00`，导出记录保留 `EXP-2026-0004` 并新增一条快照。
- 工作台投影：华东总部已就绪，显示 `W-142` 与工作区版本 v18；华南显示待生成，杭州显示暂不可用。
- C18 共 22 项断言通过，截图 04–07。

### 已知事项

- 纯 UI 原型：四表、账龄、明细账、权益和投影使用固定会计期间与水位，刷新恢复种子；未接后端报表引擎或实时投影服务。
- 报表金额为演示算例，不覆盖多币种折算、合并报表或复杂损益结转；导出为本地生成的文件记录与 CSV 预览。
- 钻取与单据回跳按当前样例路由跳转，目标页展示既有原型数据，不保证与报表行逐笔勾稽。

## C19 工作区、邀请与权限治理（2026-11-19）

### 范围

- 在设置页新增「治理」页签（`src/Web/nexora-dashboard/app/components/settings/GovernanceCenter.vue`），分工作区与公司、邀请与接受、成员与角色、授权审批、公告五部分。工作区页展示可访问工作区、当前身份与公司创建入口，企业创建复用初始化向导。
- 邀请详情区分组织角色与业务角色，业务角色邀请需要独立批准；演示有效、待批准、已撤回、已兑换、过期和账户不匹配，接受后可切换工作区。成员详情分开显示组织角色与业务角色，停用最后管理员时阻断并说明原因。
- 自定义角色展示修订版本、授权有效期和一人/两人审批进度，支持批准与附原因撤销；公告按身份、工作区、可见权限和有效期过滤，保留本地已读。

### 复现

打开 `http://localhost:3001/settings?tab=governance`，或运行脚本 C19 段。先以陈立在华东总部创建企业，再处理业务角色邀请、最后管理员阻断、自定义角色审批与公告可见性。

### 本地结果

- 初始可访问 3 个工作区；新建「华北测试贸易有限公司」后增加为 4 个并自动切换，生成 `ws-created-1`。
- 邀请 `gov-inv-2002` 详情显示业务角色与「独立批准」，批准后状态为「有效」；成员 `gov-m-3001` 为最后管理员，停用被阻断并展示管理员原因。
- 自定义角色 `gov-cr-4001` 显示「第 2 版」且审批进度 2/2；`gov-cr-4002` 经双人审批后状态为「已生效」。
- 张明远看不到公告 `gov-ann-5004`，页面显示可见范围说明；陈立可见。全部已读后计数写入本地状态并在刷新后保留。
- C19 共 20 项断言通过，截图 08–11。

### 已知事项

- 纯 UI 原型：工作区、成员、邀请、角色和公告均为本地样例，刷新恢复种子；新建企业与接受邀请不写入组织服务。
- 权限与审批人数以页面内演示身份和授权范围判断，未接 Keycloak、服务端会话或真实邀请邮件。
- 公告已读保存在浏览器 `localStorage`，换浏览器或清理存储后重置。

## C20 审计与业务变更追溯（2026-11-19）

### 范围

- 在变更记录页新增视图切换（`src/Web/nexora-dashboard/app/components/audit/AuditCenter.vue`），进入审计中心后分组织、财务、采购、销售、业务变更五个专项页签。支持按操作、对象、操作者和时间筛选，展示单据版本、变更前后字段、来源入口与回跳。
- 业务变更覆盖主数据与库存操作，保留操作者、对象、版本和时间；支持按服务分页及 CSV 下载，下载范围与当前筛选一致。
- 按演示身份限制专项审计访问；无权限时展示拒绝说明和身份切换入口。

### 复现

打开 `http://localhost:3001/change-log?view=audit`，或运行脚本 C20 段。查看财务审计的凭证过账筛选与详情，验证来源回跳；再切换财务身份查看组织审计的拒绝，最后以管理员查看业务变更第二页并下载 CSV。

### 本地结果

- 审计中心五个页签正常渲染；组织审计初始 7 条。财务审计按「凭证过账」筛选为 2 条，详情 `fin-2026-1119-01` 显示「当前 v2 · 变更前 v1」，变更字段与来源入口完整，来源回跳到 `/finance`。
- 财务身份查看组织审计显示拒绝（`audit-center-denied`）；管理员业务变更为 13 条，第二页可打开 `chg-2026-1116-07`，表格与当前页一致。
- CSV 文件名为 `audit-change-*.csv`，含表头与 13 条记录，内容包含 `SKU-1001` 与 `PV-2026-1109`。
- C20 共 12 项断言通过，截图 12–13。

### 已知事项

- 纯 UI 原型：审计与变更记录为只读样例，刷新恢复种子；未接各服务审计存储或真实 CSV 导出任务。
- 分页在客户端按当前筛选切片，CSV 由当前筛选范围生成；未覆盖服务端游标、导出排队和下载过期。
- 来源回跳仅验证目标路由与页面可打开，目标单据为原型固定数据，不保证审计快照与当前单据逐字段一致。

## C21 套餐报价、订阅账单与权益（2026-11-19）

### 范围

- 在计费页（`src/Web/nexora-dashboard/app/components/settings/BillingPanel.vue`）补套餐变更报价、剩余周期与按比例费用、抵扣和应付金额，展示待生效套餐、账单历史、手工登记付款参考号与模拟结账。
- 报价切换周期后失效并要求重新确认；结账提供失败、处理中和成功测试卡。手工付款校验参考号长度并写回账单详情。
- 展示套餐生效时间、模块权益、席位/存储/发票用量与限额告警；切换工作区后显示该工作区的套餐、用量和待支付账单。

### 复现

打开 `http://localhost:3001/settings?tab=billing`，或运行脚本 C21 段。先取消待生效企业版排期，生成企业版年付报价并切换周期验证重新确认，再完成失败/成功测试卡结账；最后手工支付历史失败账单并切换华南、杭州工作区。

### 本地结果

- 华东总部当前专业版·年付（订阅至 2026-12-07，12/50 席），待生效企业版自 2026-12-08；取消排期后待生效信息消失。
- 企业版年付报价 charge `985.81`、credit `443.34`、应付 `542.47`；切月付后报价失效且确认不可用，切回年付并重新生成恢复 `542.47`。确认后打开结账，失败卡保留账单待支付，成功卡完成升级；套餐变为企业版·年付，生效 2026-11-19，周期至 2027-11-19，待生效信息清除。
- 手工支付失败账单 `BILL-2026-0007`（`542.47`），参考号先填 `abc` 被长度校验拒绝，改为 `BANK-20261119-0001` 后显示已支付；账单详情显示金额、手工登记付款、参考号与支付日期。
- 华南工作区为基础版·年付，8/10 席，销售限额 200 张，待支付 `4,404.87`；杭州工作区为企业版·年付，26/200 席，待支付 `19,990.00`。
- C21 共 23 项断言通过，截图 14–16。

### 已知事项

- 纯 UI 原型：套餐、报价、账单、支付与权益为本地样例，刷新恢复种子；未接支付网关、发票系统或订阅计费服务。
- 测试卡结果固定，手工付款仅校验参考号格式并写回本地账单，不产生真实收款或对账流水。
- 切换工作区后的套餐与用量为固定演示数据，不写回组织或计费服务；价格、税额与按比例抵扣为演示算例。

## C22 账户安全与设备授权（2026-11-19）

### 范围

- 在账户菜单新增「安全设置」抽屉（`src/Web/nexora-dashboard/app/components/AccountSecuritySlideover.vue`），分账户概览、登录会话、设备授权三页签。账户概览展示当前身份与角色、4 个登录渠道状态、30 分钟空闲策略及来源、MFA 方法与敏感操作附加验证、注销预检阻断详情。抽屉保留身份卡与页签容器，三个页签分别拆为 `components/account/OverviewTab.vue`、`SessionsTab.vue`、`DevicesTab.vue`。
- 账户菜单增加演示身份切换；切换后账户资料、权限、会话、登录渠道、MFA、附加验证和注销预检同步更新。登录会话展示设备、浏览器、位置、登录时间、最近活动与到期时间，支持延长当前会话、撤销单个其他设备和批量撤销。
- 设备授权页复用同一界面处理 CLI 与 MCP 请求：输入 8 位代码核验，展示客户端、设备、位置、有效期与只读范围，并按状态提供同意、拒绝、过期说明和撤销。无效代码、过期和已处理状态均有反馈。
- 账户删除预检按所有权、有效订阅、未结账单和数据保留展示阻断项与处理入口；存在阻断时申请注销按钮不可用。

### 复现

打开 `http://localhost:3001/`，点击左下角账户菜单的「安全设置」，或运行脚本 C22 段。先以张明远查看策略、渠道、预检与 3 台设备，延长会话并撤销其他设备；切换到陈立核对 3 项阻断与过期附加验证；最后在设备授权页核验 `NXR4-8Q2P` 和 `MCP7-2K9D`，分别同意、拒绝、过期和撤销。

### 本地结果

- 张明远为所有者，4 项注销阻断，当前会话 18 分钟后空闲过期；延长后 48 分钟且状态转为有效。撤销 iPhone 后该行显示「已撤销」且撤销按钮消失，批量撤销后无其他有效设备，按钮禁用。
- 切换陈立后角色为管理员、注销阻断 3 项、会话 2 条，当前会话 185 分钟；附加验证由过期变为「刚刚完成附加验证」，再次延长按当前剩余时间累加为 215 分钟。王倩为成员，`finance.view` 不可用且 MFA 未启用，附加验证不可执行。
- CLI `NXR4-8Q2P` 初始等待确认，仅申请 `workspaces:read`，同意后状态为已授权并反馈范围；MCP `MCP7-2K9D` 展示财务、总账、报表 3 个只读范围，拒绝后设备不获得令牌。`CLI9-0X3M` 显示 15 分钟内未确认而过期且不能同意，撤销已授权设备后令牌立即失效。
- C22 共 47 项断言通过，截图 01–07；控制台、页面与失败响应均为 0。

### 已知事项

- 纯 UI 原型：身份、会话、登录渠道、MFA、附加验证和预检来自 `app/mocks/security.ts` 与 Pinia，刷新恢复种子；未接 Keycloak、服务端会话或真实 MFA。
- 撤销与批量撤销只更新页面状态，不吊销服务端令牌；空闲策略、MFA 能力和注销阻断为固定演示值。
- 设备授权为本地记录，不生成真实 OAuth 设备码或访问令牌；CLI/MCP 的同意、拒绝和撤销不写入后端。

## C23 助手会话与工具审批（2026-11-19）

### 范围

- 新增工作区助手页（`src/Web/nexora-dashboard/app/pages/assistant.vue`）与侧栏入口，分会话列表、消息区、能力状态三栏。消息区演示固定知识样例、本地分片流式输出、生成中状态、取消与恢复，以及数据截止和来源说明。页面保留工作区与套餐编排，会话列表、消息区、工具卡与能力面板分别拆为 `components/assistant/SessionList.vue`、`ConversationPanel.vue`、`ToolCard.vue`、`CapabilityPanel.vue`。
- 工具调用以待审批卡展示用途、参数摘要、工具名与执行范围；允许后写入只读结果和科目、总账、报表跳转，拒绝后说明未读取任何数据。结果链接可回到现有财务页面，返回后会话状态保留。
- 按工作区套餐与演示身份展示限制：标准版工作区提示套餐未包含并提供升级与切换入口；缺少 `finance.view` 的成员提示角色受限，禁用输入、发送和财务工具批准，能力卡标注「角色受限」。
- 新建会话、历史会话切换与恢复上下文均为本地 Pinia 状态；刷新恢复固定 3 个样例会话。

### 复现

打开 `http://localhost:3001/assistant`，或运行脚本 C23 段。先允许 `tool-balances` 并打开报表中心，再新建会话输入经营摘要并取消/恢复；随后切换 `as-aging` 拒绝账龄工具，切到华南标准版查看套餐限制，最后切王倩查看角色限制与工具批准禁用。

### 本地结果

- 华东总部专业版显示助手可用，默认打开「核对本期科目余额」，列表 3 个历史会话；能力状态中余额、账龄、凭证、目录均可用。
- `tool-balances` 待审批卡显示 `finance.read_account_balances`、参数 `period=2026-11; includeUnlinked=true; limit=20` 与「财务只读 · 华东总部」范围；允许后返回 4 行余额和科目、总账、报表 3 个入口，跳转 `/finance?tab=reporting` 后返回会话仍保留结果。
- 新建会话发送摘要请求后进入「生成中」，完成后显示截至 2026-11-18 的营业收入、成本、利润与净利润；取消后消息标记「已取消」并出现「恢复生成」，恢复后完成输出并产生 `tool-aging-live` 待审批。拒绝该工具后状态为「已拒绝」并说明未访问财务数据。
- 华南标准版显示「套餐未包含 · 标准版」与升级说明，切回华东恢复；王倩提示缺少 `finance.view` 权限，输入和发送禁用，待审批工具的「允许执行」禁用并显示无法批准说明。
- C23 共 38 项断言通过，另有 1 项全流程无错误校验；截图 08–15，控制台、页面与失败响应均为 0。

### 已知事项

- 纯 UI 原型：会话、消息、流式输出和工具结果来自 `app/mocks/assistant.ts` 与 Pinia，不调用外部模型或 MCP；刷新恢复 3 个固定样例。
- 分片速度为 45ms 追加 3 个字符，仅用于演示生成、取消和恢复；工具结果与链接为固定只读样例，不执行真实查询。
- 角色与套餐限制按演示身份和 `workspace.plan` 判断，仅影响页面交互，不构成服务端授权边界。

---

- 本轮 C17–C21 合计 94 项断言、16 张截图；`artifacts/ui-dashboard-c17-c21/report.json` 记录 `total=94, passed=94, failed=0`，控制台、页面与失败响应均为 0，脚本退出码 0。
- C17–C21 最终串行 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 退出码 0；`test:unit` 15 个文件 66 个测试通过；构建 42.1s，产物 16.3 MB（gzip 3.75 MB）。
- 本轮 C22–C23 合计 86 项断言、15 张截图；`artifacts/ui-dashboard-c22-c23/report.json` 记录 `total=86, passed=86, failed=0`，控制台、页面与失败响应均为 0，脚本退出码 0。
- C22–C23 最终串行 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 退出码 0；`test:unit` 16 个文件 70 个测试通过；构建 45.1s，产物 16.4 MB（gzip 3.78 MB），仅保留既有的大 chunk 与依赖注释提示。

