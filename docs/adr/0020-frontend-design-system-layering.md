# ADR 0020 — 前端样式分层与 Nuxt UI 交互底座

- 日期：2026-11-14
- 状态：已采纳；Phase 0 基线已记录、Phase 1–7 已实施并通过本地静态检查、聚焦与全量 e2e；Phase 8（完全迁移到 Tailwind）已完成 Phase 0–3（基线 / 护栏、新增样式搬 scoped、域级语义类 5 类迁移、壳层与页面语义），Phase 4–8 执行中。
- 关联：[架构](../架构.md)、[计划](../计划.md)、[依赖](../依赖.md)、[Nuxt CSR 与类型化接入](0010-nuxt-client.md)、[Phase 1–2 验证记录](../verification/web-ui-design-system-phase1-2.md)。

## 背景

工作台同时存在两套主题来源：`app/assets/css/main.css` 中约 2200 行自定义设计系统（`--nx-*` 令牌、卡片、表单、表格、状态胶囊、打印和移动端规则，约 100+ 选择器），以及 Nuxt UI 4（`@nuxt/ui`）自带的 Tailwind 主题。Tailwind v4 与 Nuxt UI 已在依赖中，但业务模板几乎不使用 utility，36 个业务组件各自维护 scoped style，颜色、圆角、按钮形态在自定义类与 Nuxt UI 组件之间不同源。继续堆叠会让视觉一致性、暗色模式和后续维护成本持续上升。

## 决策

采用四层分工，自上而下收口：

1. **Token 层（唯一来源）**：`main.css` 用 Tailwind v4 `@theme inline` 把 `--nx-*` 暴露为主题变量——`--color-brand-50…950` 品牌色阶与 `--font-sans`（Phase 7 第二轮清理删除了无 utility 引用的 `--color-nx-*`、`--radius-nx*`、`--shadow-nx*`、`--font-display` 映射）。Nuxt UI 的 `app.config.ts` 主色改为 `brand`，使 Nuxt UI 组件与自定义类共享同一色板。
2. **语义类层**：`main.css` 只保留 token、应用壳层、财务报表 / 打印规则、暗色与响应式覆盖。新增样式优先 utility 或组件 scoped style，**不再向 main.css 追加业务选择器**；迁移过程中该文件只减不增。
3. **Utility 层**：Tailwind utility 用于新代码的布局、间距、排版微调。
4. **Nuxt UI 层**：交互组件优先使用 Nuxt UI（UButton、UInput、UModal、USelect、UToast、UTable、UTabs、UFormField、USkeleton 等）。仅在财务报表、固定列 / 打印、ERP 密集布局等确有必要的场景保留自定义表格与壳层。

交互底座统一为三个组合式函数 / 组件：

- `useNotice`：封装 `useToast`，统一 success / info / warning / error 的图标与时长（error 8000ms，其余 4000ms），替换各组件自维护的 notice ref。
- `useConfirm` + `ConfirmDialog`：基于 `useOverlay` 的程序化确认弹窗，返回 `Promise<boolean>`，替换 `window.confirm`；ESC / 遮罩关闭也会 resolve 为 false。
- 页头语言切换改用 `USelect`，不再保留自定义 select 样式。

## 迁移顺序与护栏

分阶段迁移，避免一次性删除 main.css 或全量 utility 重写：

- Phase 0 基线：记录静态检查与全量 e2e 基线、明暗 / 桌面移动截图；锁定 e2e 仅有的 3 个 class 选择器（`.setup-sub`、`.dashboard-trend`、`.assistant-sessions`）。
- Phase 1 Token 单一来源：`@theme inline` 映射 + `primary: 'brand'`。
- Phase 2 交互底座：`useNotice`、`useConfirm` + `ConfirmDialog`、语言切换 `USelect`。
- Phase 3 表格：由新到旧迁移（记录变更 → 审计查询 → 商品目录 → 往来单位 → 账龄 → 科目 → 账单 → 仪表盘趋势 / 对比 / 钻取 → 关联分录 → 财务报表最后且可保留自定义）。已完成除财务报表外的列表迁移；财务报表按本节取舍保留自定义。
- Phase 4 表单：先公司设置 / 初始化向导，再税务 / 商品 / 银行导入，单据头部最后；label 文本、name、id、data-testid 与错误文案不变。
- Phase 5 页签：审计页签 → 控制台页签；UTabs 无法保持体验时保留自定义并记录原因。已完成：审计页签尝试 UTabs 后因 Reka `TabsIndicator` 未渲染、分段条与紧凑页签行不符而回退自定义；控制台页签作为壳层主导航保留自定义（见 [Phase 5 验证记录](../verification/web-ui-design-system-phase5.md)）。
- Phase 6 壳层：应用壳层与空态保留自定义，加载态换 USkeleton。已完成：4 处加载文案换 `USkeleton`，7 个 `UTable` 列表加 `:loading`（见 [Phase 6 验证记录](../verification/web-ui-design-system-phase6.md)）。
- Phase 7 清理：逐组件删除死 CSS，main.css 只留 token / 壳层 / 共享语义类 / 报表打印 / 暗色 / 响应式；全量验证并更新文档。已完成两轮清理：先删除 7 个确认未使用的选择器，再删除控制台改版遗留的 `main >` 死选择器、未使用的 `@theme inline` 映射、与 Tailwind preflight 重复的 reset 及全局 `.sr-only`（main.css 2225 → 1995 行）；scoped 样式审计无新增死类（见 [Phase 7 验证记录](../verification/web-ui-design-system-phase7.md)）。

操作护栏：Nuxt dev 不热更新 `app/` 源码，改前端后需 `aspire stop` → `aspire start`；每 Phase 结束跑聚焦 e2e 与全量 `workspace.spec.ts`；迁移保持可访问名称与 `data-testid` 稳定，避免 e2e 回归。

## Phase 8 — 完全迁移到 Tailwind（2026-11-15 追加）

Phase 1–7 已把交互底座、表格、表单、页签、壳层与死 CSS 收敛，但 main.css 仍有约 2200 行全局设计系统。Phase 8 的目标是把全局样式迁移到 **Nuxt UI 组件 + Tailwind utility + 组件 scoped CSS**，最终 main.css 只剩 `@import "tailwindcss"`、`@import "@nuxt/ui"`、`@import "./tokens.css"`。

- 终态：`tokens.css` 保留 `--nx-*` 变量与 `@theme inline` 桥接（light / dark 两套），暗色靠 token 自动切换；复杂规则留在组件 scoped（财务报表打印隔离、固定列 / 高密度表格、PWA 安全区 `env()`、壳层 sticky / 滚动锁）。
- 映射规则：`.quiet` → `UButton variant="ghost" color="neutral"`；`.primary` → `UButton color="primary"`；`.card` → `UCard` 或 `rounded-nx border border-nx-border bg-nx-surface shadow-nx-sm`；`.hint` → `text-sm text-nx-ink-3`；`.heading-icon` → `size-5 shrink-0 text-nx-primary`；`.actions` → `flex flex-wrap items-center gap-2`；`.status-pill` → `UBadge`；原生 `input/select/textarea` → `UFormField` / `UInput` / `USelect` / `UInputDate` / `UFileUpload`；打印规则 → 组件 scoped `@media print`；PWA 安全区 → `default.vue` scoped；暗色 → token utility 自动切换。
- 批次：Phase 0 基线 + 护栏 → Phase 1 搬出 version-notice / status-overlay / PWA 安全区 → Phase 2 域级语义类（quiet / primary / card / hint / heading-icon / actions，4 批）→ Phase 3 壳层与页面布局 → Phase 4 表单基础 → Phase 5 表格 / 详情 → Phase 6 拆分 tokens.css → Phase 7 删除死 CSS → Phase 8 收尾（main.css 只剩 @import）。当前进度：Phase 0–3 已完成（main.css 2208 → 2000 → 1895 → 732 行），Phase 4 起待执行。
- 护栏：不再向 main.css 新增业务选择器（只减不增）；e2e 只使用 data-testid / role / label；每批 typecheck / lint / unit / build + 聚焦 e2e + light / dark 截图对照，Phase 末全量 e2e；不改 label 文本、`name` / `id`、`data-testid`、错误文案、API payload 与业务逻辑。
- 验证记录：[前端 Tailwind 迁移验证](../verification/web-ui-tailwind-migration.md)。

## 比较与取舍

- 一次性删除 main.css 或全量 utility 重写：回归面覆盖 26 个 workspace e2e 与大量视觉细节，风险不可控，放弃。
- 只保留自定义 CSS：与 Nuxt UI 主题继续分叉，维护成本最高，放弃。
- 先 token 统一、再按组件分阶段迁移：每步可验证、可回滚，且 Phase 1 即可让 Nuxt UI 组件与自定义类同色，采纳。
- 财务 / 报表表格保留自定义：打印隔离、固定列与高密度布局是既有验收内容，Nuxt UI UTable 无法等价替代，保留并在文档中说明。

## 影响与约束

- 新组件默认使用 Nuxt UI + utility；main.css 只允许删除或收敛，不再新增业务选择器。
- 主题调整只改 token 层；暗色由 `--nx-*` 与 Nuxt UI 主题共同驱动。
- 迁移不改变 BFF、业务 API、数据模型、可访问名称、data-testid、面板顺序与打印结构。

## 验证与未决条件

- Phase 0 基线：[基线记录](../verification/web-ui-design-system-baseline.md)（静态检查与 26 项全量 e2e 基线、明暗 / 移动 / 打印截图、e2e 选择器改为 data-testid）。
- Phase 1–2 验证：[Phase 1–2 验证记录](../verification/web-ui-design-system-phase1-2.md)（typecheck / lint / 单测 / build、明暗截图对比、Nuxt UI 主色与 USelect、RCD toast 断言与全量 e2e）。
- Phase 3 验证：[Phase 3 验证记录](../verification/web-ui-design-system-phase3.md)（10 个列表迁 UTable、财务报表保留自定义的取舍、聚焦与全量 e2e）。
- Phase 4 验证：[Phase 4 验证记录](../verification/web-ui-design-system-phase4.md)（31 个组件表单迁 UFormField / UInput / USelect / UCheckbox，交互差异与 e2e 改写）。
- Phase 5 验证：[Phase 5 验证记录](../verification/web-ui-design-system-phase5.md)（审计页签 UTabs 试验与回退、控制台页签保留自定义）。
- Phase 6 验证：[Phase 6 验证记录](../verification/web-ui-design-system-phase6.md)（USkeleton 加载态与 UTable :loading）。
- Phase 7 验证：[Phase 7 验证记录](../verification/web-ui-design-system-phase7.md)（死 CSS 清理、main.css 收敛与全量验证）。
- Phase 8 验证：[前端 Tailwind 迁移验证](../verification/web-ui-tailwind-migration.md)（Phase 0 基线、护栏与后续批次结果）。
- 未决：远端 CI 与生产验收未执行；本地验证依赖 Aspire 与 Keycloak 开发身份。
