# Nexora Dashboard UI 完善 TODO

日期：2026-11-17。范围：`src/Web/nexora-dashboard/` 独立 UI 原型（纯 UI 阶段，模拟数据，不接后端）。参考 [根 todolist](../todolist.md) 与 [原型验收记录](verification/web-ui-dashboard-prototype.md)。按后端能力规划的后续 UI 清单见 [后端能力对照的 UI TODO](ui-dashboard-backend-todolist.md)。

## 0. 口径

- 目标：在不接后端的前提下，把原型打磨到可评审的 UI 方案：组件复用、图标体系、适度动效、信息密度和交互反馈。
- 桌面优先：以 1440 宽度为基准，不做移动端专项设计与验收；现有响应式不刻意破坏，也不新增移动端工作。
- 原则：
  1. 组件优先 Nuxt UI 4 现成组件（`UDashboard*`、`UPage*`、`UTable`、`UTimeline`、`UStepper`、`UProgress`、`UEmpty`、`UDropdownMenu`、`USlideover`、`UCommandPalette` 等），不重复实现已有能力。
  2. 图标统一走 Nuxt Icon（由 Nuxt UI 内置）与 Carbon 官方图标集 `@iconify-json/carbon`，页面图标使用 `i-carbon-*`。
  3. 动效克制：150–250ms、ease-out，只用于状态变化、悬停与进入；不阻塞操作，尊重 `prefers-reduced-motion`。
  4. 数据仍来自 `app/mocks/`，编辑只更新本次预览，刷新恢复。
- 状态：待开始 / 进行中 / 完成。完成定义：typecheck、lint、build 通过；桌面 1440 light/dark 截图；浏览器控制台无错误。
- 不纳入：移动端专项、后端接入、真实鉴权与国际化。

## 1. 波次

| 波次 | 内容 | 出口 | 状态 |
| --- | --- | --- | --- |
| U1 | 图标与全局框架：Carbon 图标集、Nuxt Icon 用法统一、全局搜索、通知中心 | 每个页面图标一致，⌘K 可用 | 完成（页面转场未采用，见下） |
| U2 | 页面重组：工作台、商品目录、采购订单改用 `UPageHeader`/`UCard`/`UEmpty`/`UTimeline`/`UStepper` | 不再有可被现成组件替代的自造结构 | 完成 |
| U3 | 动效与反馈：卡片悬停、表格行、进度条、Toast、快捷键提示 | 交互有反馈且不喧宾夺主 | 完成 |
| U4 | 细节与验收：空态、密度、暗色、键盘路径、截图与文档 | 验收记录更新 | 完成 |

## 2. 清单

### U1 图标与全局框架

- [x] 新增 `@iconify-json/carbon` 依赖（1.2.30），Nuxt Icon 由 Nuxt UI 传递提供，未重复注册模块。
- [x] 页面、导航、工具栏、空态、抽屉按钮的图标从 lucide 统一替换为 `i-carbon-*`；`app/` 已无 `i-lucide` 残留。
- [x] 用 `UDashboardSearch` + `UDashboardSearchButton` 提供全局搜索（侧栏入口，⌘K）：页面、商品、采购单、最近单据四组结果，选中后跳转。
- [x] 导航栏加入通知入口：`UChip` 未读数 + `USlideover` 通知列表（待审批订单、库存预警、最近单据），支持全部已读。
- [ ] 页面转场 `app.pageTransition`：**未采用**。`UDashboardPanel` 模板根是 fragment（root div + resize-handle slot），`catalog.vue`/`purchase-orders.vue` 原本多根节点，启用后出现 `[NUXT_E4004] does not have a single root node` 与 `<Transition> renders non-element root node` 警告。改为元素级动效：`.nx-reveal`（进入上浮 240ms 交错）、`.nx-lift`（悬停）、`.nx-table`（行悬停）。后续若要页面转场，需要给页面包单根包裹层或自定义过渡容器。

### U2 页面重组

- [x] 工作台：`UPageHeader` 替换自造标题区；KPI 用 `UCard`；待办增加 `UProgress` 完成率；最近单据 `UTable`；右侧新增 `UTimeline` 最近动态。
- [x] 商品目录：工具栏保留搜索/状态/分类/重置；表格容器 `UCard` + `UTable`；空态改 `UEmpty`；分页移入卡片 footer；编辑抽屉使用 `UFormField` 校验名称。
- [x] 采购订单：详情用 `UStepper` 展示订单进度（已下单→已审批→已入库→已完成，数字 modelValue 为 0-based 索引）、入库进度 `UProgress`、金额汇总右对齐；状态/颜色共用同一映射。
- [x] 页面级操作按钮统一：导航栏放主操作（新建/通知），工具栏放筛选，金额右对齐；通知图标按钮带 `UTooltip`。
- [x] 商品目录、采购订单的低频操作收进 `UDropdownMenu`：商品目录支持导出当前结果 CSV、导入商品 CSV 演示，采购订单支持导出当前筛选 CSV（`app/utils/csv.ts` 浏览器本地生成，未经过后端）。

### U3 动效与反馈

- [x] KPI 卡片悬停轻微上移、边框与阴影强调（`.nx-lift`，`--nx-shadow-hover` 分暗色）。
- [x] 表格行悬停背景过渡（`.nx-table tbody tr:hover`）。
- [x] 分页切换内容淡入、`UTimeline` 进入动画：分页切换的表格容器加 `.nx-fade`（180ms 淡入，`prefers-reduced-motion` 关闭），工作台时间线卡片用 `.nx-reveal` + 300ms 延迟进入；`UProgress` 使用组件自带过渡。
- [x] `prefers-reduced-motion: reduce` 下关闭位移与淡入（`.nx-reveal`/`.nx-lift` 过渡全部关闭），颜色变化保留。
- [x] Toast 与保存/切换工作区反馈联动；导出、刷新、新建商品、新建采购单、模拟审批/收货/打印均给出明确 Toast 文案。

### U4 细节与验收

- [x] 加载骨架（`USkeleton`）：`app/composables/useMockRefresh.ts` 提供 550ms 模拟刷新，工作台（KPI/图表/待办/最近单据/时间线）、商品目录、采购订单表格均显示骨架；`app.config.ts` 把 `USkeleton` 默认 `bg-elevated` 覆盖为 `bg-accented`（light/dark 均可见）。空态/无结果由 `UEmpty` 覆盖。
- [x] 桌面 1440 light/dark 截图：工作台、商品目录、采购订单详情、全局搜索、通知面板（`artifacts/ui-dashboard-polish/`，10 张）；本轮补充刷新骨架、导出菜单、分页淡入等 6 张（`artifacts/ui-dashboard-todolist/`）。
- [x] typecheck、lint、build 通过；临时 Playwright 脚本检查无 console error（脚本未提交）。
- [x] 更新 [原型验收记录](verification/web-ui-dashboard-prototype.md)，勾选本清单已完成项。

### 国际化（首轮，2026-11-19）

> 状态：首轮已完成（应用壳层与工作台）。范围、命令与浏览器结果见[原型验收记录](verification/web-ui-dashboard-prototype.md)。

- [x] 启用 `@nuxtjs/i18n` 10.6.0（`no_prefix`），建立 `i18n/locales/zh-CN.json` 与 `en.json`，由 `test/i18n-locales.test.ts` 校验中英键集合、空值与占位符一致。
- [x] 应用标题、侧栏导航、命令面板、通知中心、账户与安全抽屉、工作台首页静态文案和状态枚举完成中英切换；业务 mock 数据（公司、商品、往来单位、审计摘要、待办标题）保持源语言。
- [x] 语言选择写入 `nexora-locale` Cookie，首次访问按浏览器语言检测并以 `zh-CN` 兜底，刷新后保持；`html lang` 与 Nuxt UI 组件语言同步切换。
- [ ] 其余业务页（商品目录、伙伴档案、主数据定义、采购、销售、库存、财务、设置、变更记录）逐页迁移；后端接入后新增文案纳入同一键表。

## 3. 后续候选（本轮不做）

- 页面转场：为页面建立单根过渡容器后重新评估 `app.pageTransition`。
- 后端接入、真实权限与 API 错误态：已拆分到 [后端接入 UI TODO](ui-dashboard-backend-todolist.md)，本文件继续保持“不接后端”的 UI 完善范围。
- 移动端专项与手势；主题定制面板（品牌色、密度切换）。
