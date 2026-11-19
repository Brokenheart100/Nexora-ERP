# Odoo 风格 Web UI 设计基线（试点版）

> 状态：试点与共享基线层（Batch 0）已完成；待用户确认方向（A 继续 Odoo / B 切 ERPNext / C 混合）后按批次铺开。
> 来源：工作区首页 + 审计模块（审计查询 / 记录变更）+ 登录状态页试点（2026-11-17）。
> 约束：不改文案、`data-testid`、name/id、API payload 与业务流程（ADR 0020 护栏）。

## 1. 目标与原则

参考 Odoo 企业版后台的视觉与信息密度，把 Nexora Web UI 从「大圆角 + 渐变 + 阴影」的营销式外观，收敛为「紧凑、扁平、边界清晰、操作优先」的 ERP 工作台外观。

原则：

1. **内容优先**：去掉装饰性渐变、毛玻璃、大阴影、超大标题；用 1px 边框、浅色底与留白划分层级。
2. **紧凑但不拥挤**：正文 13px、表头 11.5px、行高 1.5；表格行 8px 12px；控件高度 30px。
3. **统一的操作位置**：页面标题在左上、主操作在右上；查询条件在页签下方；列表工具条在筛选与表格之间。
4. **颜色只表达状态**：中性灰用于结构与文字，主色（Nexora 蓝）只用于主操作、选中项与链接；语义色仅用于状态提示。
5. **暗色跟随 token**：所有颜色经 `--od-*` / `--nx-*` 变量切换，不在规则里硬编码第二套暗色值（打印与固定语义色除外）。
6. **不重写交互**：保留 Nuxt UI 组件行为与可访问性（role / aria / label 关联），只覆盖视觉层。

## 2. 设计 Token

试点在 `src/Web/nexora-web/app/assets/css/workspace/odoo-pilot.css` 的 `.odoo-pilot` 作用域内定义；审计组件在各自 `<style scoped>` 的 `.odoo-page` 内重复同一组值。铺开时抽到共享层（见第 8 节 Batch 0）。

### 2.1 颜色（中性色）

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `--od-ink` | `#1f2937` | `#e5e7eb` | 标题、正文、表格主文字 |
| `--od-ink-2` | `#4b5563` | `#cbd5e1` | 次级文字、表头、页签未选中 |
| `--od-muted` | `#6b7280` | `#94a3b8` | 说明、label、meta、副标题 |
| `--od-border` | `#d9dee7` | `#2b3a52` | 卡片/表格/输入框/页签边框、页面头分隔线 |
| `--od-border-soft` | `#e5e7eb` | `#22304a` | 列表行分隔线、内部细分隔 |
| `--od-subtle` | `#f9fafb` | `#0f1a2b` | 表头底、hover 底、空状态底、chip 底 |
| `--od-radius` | `4px` | `4px` | 控件、列表、chip、页签底座圆角 |

语义色沿用既有 `--nx-*` token（light/dark 自动切换）：

| Token | 用途 |
| --- | --- |
| `--nx-primary` | 主操作、选中页签/行、链接（light `#2f5fbf`，dark `#7ba2f4`） |
| `--nx-primary-strong` | 主按钮 hover |
| `--nx-primary-soft` | 选中行/选中卡片底色（dark `#162742`） |
| `--nx-success` / `--nx-success-soft` | 成功状态与底色 |
| `--nx-warning` / `--nx-warning-soft` | 警告状态与底色 |
| `--nx-danger` | 错误/危险操作 |
| `--nx-surface` | 卡片、表格、面板底 |
| `--nx-surface-muted` | 分组底（fieldset 等） |

> 试点未改动 `--nx-*` 的值，主色仍由 `app/assets/css/main.css` 的 `@theme static` brand 调色板提供（`--ui-primary = #2f5fbf`）。

### 2.2 字体与字号

| 层级 | 字号 | 字重 | 其他 |
| --- | --- | --- | --- |
| 页面标题 | 20px | 600 | `letter-spacing: -0.01em; line-height: 1.3` |
| 页面副标题 | 12.5px | 400 | `line-height: 1.5`，`--od-muted`，`max-width: 78ch` |
| 卡片标题 | 15px | 600 | 间距 0 |
| 卡片副标题 | 12px | 400 | `--od-muted` |
| 正文 | 13px | 400 | `line-height: 1.5` |
| 表头 | 11.5px | 600 | `letter-spacing: 0.02em`，`--od-ink-2` |
| 表格单元 | 13px | 400 | 行内操作按钮 12px |
| 表单 label | 11px | 600 | `--od-muted`，`letter-spacing: 0.02em`，下间距 4px |
| 说明/meta | 12px | 400 | `--od-muted` |
| eyebrow | 11px | 600 | 大写，`letter-spacing: 0.08em`，前置 14×1px 短线 |
| chip / 状态 | 11px | 600 | 内边距 1px 7px，圆角 3px |
| 数字 | 13px | 600 | 统计值；表格金额用 `tabular-nums` |

字体族沿用全局 `--nx-font`（main.css `body` 设置），试点不覆盖。

### 2.3 间距（4px 基数）

| 场景 | 值 |
| --- | --- |
| 页面头 → 内容 | `margin-bottom: 12px`；页面头自身 `padding: 2px 0 16px`，`border-bottom: 1px solid var(--od-border)` |
| 页面头标题/副标题 | 标题与副标题间 4px |
| 页面头主操作组 | `gap: 8px`，右对齐 |
| notebook 页签容器 | `margin-bottom: 14px`，`gap: 2px` |
| 页签内部 | `padding: 7px 14px` |
| 筛选网格 | `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`，`gap: 10px 12px` |
| 列表工具条 | `margin: 14px 0 8px`，左右两端对齐，`gap: 12px` |
| 表格单元 | `padding: 8px 12px` |
| 卡片 | `padding: 16px 18px`；卡片间 `gap: 12px` |
| 登录卡 | `padding: 26px 28px`，顶部距视口 8vh |
| 空状态 | `padding: 16px`，最小高度 140px |

### 2.4 圆角、边框、阴影

| 元素 | 圆角 | 边框 | 阴影 |
| --- | --- | --- | --- |
| 卡片 | 6px | `1px solid var(--od-border)` | `0 1px 2px rgba(15, 23, 42, 0.04)` |
| 登录卡 | 6px | 同上 | `0 1px 3px rgba(15, 23, 42, 0.08)` |
| 控件（按钮/输入/选择） | 4px | 1px `--od-border`（primary 按钮用主色底） | 无 |
| 列表/表格容器 | 4px | 1px `--od-border` | 无 |
| chip / 状态 pill | 3px | 1px `--od-border` | 无 |
| notebook 页签 | `4px 4px 0 0` | 1px，active 时底边与面板同色形成「打开的页签」 | 无 |
| 表格内操作按钮 | 4px | UButton outline | 无 |

> 统一去阴影（`box-shadow: none`）与去渐变是本次风格转换最显著的信号；只有卡片保留 1px 级别的极浅阴影。

## 3. 控件规范

| 控件 | 规范 |
| --- | --- |
| 主按钮 | `UButton color="primary"`，高 30px，`padding: 0 12px`，13px/500，圆角 4px，无阴影 |
| 次按钮 | `UButton variant="outline" color="neutral"`，边框 `--od-border`，文字 `--od-ink` |
| 表格行内按钮 | `UButton size="xs" variant="outline"`，高 24px，12px |
| 输入框 / 下拉 | `UInput` / `USelect`，高 30px，圆角 4px，13px；label 11px 在控件上方 |
| 复选框 | `UCheckbox` + 文案 12.5px；选中用主色 |
| 日期 | 保留原生 `UInput type="date"`（不迁 UInputDate，避免交互变化） |
| 文件上传 | `UFileUpload`（试点未重绘，铺开批次统一样式） |
| 表格 | `UTable` 或自定义表格外包 1px 边框 + 4px 圆角；表头 `--od-subtle` 底、11.5px/600；行 hover `--od-subtle`；最后一行无底边 |
| notebook 页签 | 原生 `button role="tab"` 或 console 页签；active 用主色文字 + 表面色底 + 上/左/右边框 |
| 状态标签 | `UBadge` / `.status-pill`：11px/600，1px 7px，圆角 3px，语义色底 |
| 提示 | `UAlert` / `p[role="status"]`：12.5px，圆角 4px，margin 10px 0 |
| 空状态 | 虚线 1px 边框、`--od-subtle` 底、4px 圆角、居中图标 32px |
| 加载更多 | 居中，`margin-top: 12px`，outline 按钮高 30px |

## 4. 页面结构模板

### 4.1 列表 / 查询页（审计页为样板）

```text
[页面头]  标题 20px + 副标题 12.5px            [主操作按钮 30px]
───────────────────────────────────────────────── 1px 分隔线
[notebook 页签] 页签1 | 页签2
[筛选区] grid auto-fit minmax(150px,1fr)，6 字段，label 11px
[列表工具条] 共 N 条（左）                 提示/导出（右）
[列表] 1px 边框 + 4px 圆角，表头浅灰底，行 8px 12px
[加载更多] 居中
```

### 4.2 工作区首页（试点样板）

```text
[hero 页头] eyebrow + 标题 20px + 副标题        [统计 pill × N，12px]
[console bar] 当前工作区 + 类型 chip | 模块页签（下划线 active）
[面板 deck] 12 列网格：创建卡 7 / 加入卡 5 / 工作区列表 8 + 概览 rail 4
```

### 4.3 登录 / 公开页

```text
        居中 400px 卡片（6px 圆角，26px 28px 内边距）
        标题 20px + 说明 12.5px
        纵向按钮组：主按钮（主色，34px 高，全宽）+ 次按钮（描边）
```

### 4.4 表单页 / 详情页（铺开时按此模板）

- 页面头同 4.1；表单分组用卡片或 fieldset（保留原生 fieldset/legend 结构），组内 label 在上、控件 30px。
- 详情页：页面头 + 状态标签 + 分组 `dl`（dt 12px muted / dd 13px ink）+ 操作按钮在页头右上。
- 弹窗 / Drawer：沿用同一套卡片边框与圆角，去掉阴影与渐变。

## 5. 试点落地清单（已完成）

| 文件 | 改动 |
| --- | --- |
| `src/Web/nexora-web/app/assets/css/workspace/odoo-pilot.css` | 新增 570 行，覆盖 hero / login-card / console bar / console 页签 / deck 卡片 / workspace 列表 / overview rail / status pill / empty state / 响应式；`.odoo-pilot` 内定义 `--od-*` token |
| `src/Web/nexora-web/app/pages/index.vue` | 三处根元素加 `odoo-pilot` 类（`:63` hero、`:93` login-card、`:121` console）；未登录隐藏 hero（`v-if="user && (active === 'home' || !selected)"`）；`:341-346` 按顺序引入 workspace 外置样式，odoo-pilot 最后 |
| `src/Web/nexora-web/app/components/audit/WorkspaceAudit.vue` | 模板改用共享类 `odoo-page` / `odoo-page-head` / `odoo-notebook` / `odoo-filter` / `odoo-list` / `odoo-loadmore`；scoped `:229-279` 定义这套词汇与 `--od-*` token |
| `src/Web/nexora-web/app/components/audit/WorkspaceRecordChanges.vue` | 同上 notebook / 列表词汇（scoped 约 `:279` 起） |

截图：`artifacts/ui-tailwind-pilot/`（10 张，untracked 不提交）——首页 light/dark/选中态、审计 light/dark、记录变更 light/dark、首页移动端、登录 light/dark；`preview-home-light.png` / `preview-home-dark.png` 为裁切预览。

验证：`typecheck` 0；`eslint` 0 error / 46 warning（全 `vue/first-attribute-linebreak`）；`build` 22.0s；聚焦 e2e 3 passed（审计查询、记录变更、PWA 离线壳）；`pwa.spec.ts:64/80` 的 mock 用户仍显示 hero，未登录隐藏不影响测试。

## 6. 与现有架构的关系

- **Nuxt UI v4 是组件层**，Tailwind utility 是布局/间距的首选表达；Odoo 视觉通过「作用域覆盖层 + 组件 scoped 样式」实现，不重写组件。
- 覆盖层写在 SFC 的 `<style scoped>`（unlayered）或页面级外置 CSS（同样 scoped 引入），天然高于 Tailwind `@layer utilities`，可稳定覆盖 `UButton`/`UTable` 内部样式；穿透组件内部需 `:deep()`。
- `--od-*` 目前重复定义在 `.odoo-pilot` 与审计组件 `.odoo-page`，铺开前抽共享层统一（Batch 0），避免多处漂移。
- 暗色：`html.dark` 下由 token 切换；scoped 中写 `html.dark .x`（不要写 `:global(html.dark) .x`，Vue 3.5 scoped 会丢失后代选择器）。
- 打印：`html[data-print-section]` / `[data-print-target]` 规则保留在 main.css print 区，Odoo 化不改变打印结构。

## 7. 已知限制 / 保持现状

- 首页「账号与安全」下方长文本为基线已有内容，非本次回归。
- 审计表格加载时表头下的蓝色半段是 `UTable` 的 `:loading` carousel 指示条，属组件行为，不修改。
- 日期仍为原生选择器；文件上传仍为 `UFileUpload` 默认 dropzone（铺开时统一）。
- 品牌颜色输入为小色块（原生 color input 尺寸限制）。
- 暗色下 audit notebook 页签当前已用 token（`--nx-surface` / `--nx-primary`），不再有硬编码浅色。

## 8. 铺开批次计划（待用户确认后执行）

| 批次 | 范围 | 验收 |
| --- | --- | --- |
| **0. 共享层** ✅ | 已完成（2026-11-17）：新建 `app/assets/css/odoo/tokens.css`（`--od-*` 两套）与 `app/assets/css/odoo/components.css`（页面头 / notebook / filter / list / loadmore / 状态提示词汇），在 `app/assets/css/main.css` 追加两条 import；`workspace/odoo-pilot.css` 与两个审计组件 scoped 中的重复 token/组件规则已删除 | typecheck 0 / lint 0 error；计算样式断言（审计 light/dark + 首页）通过；截图对照通过；聚焦 e2e 2 passed |
| 1. 公开页 | `app/pages/index.vue`（未登录态 hero/login-card）、`app/pages/pricing.vue` + `app/assets/css/billing/pricing.css`、`app/pages/join.vue`、`app/pages/cli/authorize.vue`、`app/components/finance/receivables/InvoiceShareDownload.vue`、`app/error.vue`（如有） | 截图 light/dark；pricing / join / cli authorize / pwa 聚焦 e2e |
| 2. 工作区首页收尾 | `app/pages/index.vue` 的 console bar / console 页签 / deck / workspace 列表 / overview rail / 空状态 / 移动端；`app/assets/css/workspace/{console,hero,workspace-list,login,adaptation,odoo-pilot}.css` 收口 | 截图 desktop + mobile，light/dark；workspace 首页 e2e |
| 3. 业务列表页 | `components/catalog/{WorkspaceCatalog,WorkspacePartners}`、`components/finance/accounting/{WorkspaceTaxes,WorkspaceBook,WorkspaceLedger}`、`components/finance/reports/WorkspaceAging`、`components/finance/receivables/WorkspaceReceivables`、`components/finance/banking/WorkspaceTrade`、`components/inventory/WorkspaceInventory`、`components/purchasing/WorkspacePurchasing`、`components/sales/WorkspaceSales` | 每页截图 light/dark；对应模块聚焦 e2e |
| 4. 业务表单/详情 | `components/finance/accounting/{FiscalYearPanel,ImportedJournalBatch,OpeningBalanceImportPanel,OpeningSubledgerPanel,TaxFilingPanel,WorkspaceChart}`、`components/finance/banking/{BankReconciliationPanel,WorkspaceBankImport}`、`components/finance/donations/DonationReceiptPanel`、`components/finance/receivables/{InvoiceCommunication,InvoiceNumberingSettings,InvoiceSchedules}`、`components/purchasing/PurchaseReceiptPanel`、`components/sales/SalesFulfillmentPanel`、`components/common/ConfirmDialog` | 聚焦 e2e + 截图 light/dark |
| 5. 治理与账户 | `components/dashboard/WorkspaceDashboard`、`components/organization/{WorkspaceGovernance,WorkspaceMemberEditor,WorkspaceRoleCatalog,WorkspaceCustomRoleEditor,WorkspaceBusinessRolePicker,WorkspaceScopedRoleGrants,WorkspaceCompanySettings}`、`components/billing/{WorkspaceBilling,LocalBillingCheckout}`、`components/workspace/{WorkspaceSetup,WorkspaceCapabilities}`、`components/account/{AccountSecurity,AccountSessions,AccountDeletionReview}`、`components/assistant/WorkspaceAssistant` | 聚焦 e2e + 截图 light/dark |
| 6. 壳层 | `app/layouts/default.vue` + `app/assets/css/shell/{sidebar,toolbar,adaptation}.css` + `components/shell/*`；是否改 Odoo 浅色顶栏/侧栏待方向确认 | 断点 1180/980/700/550/420 截图 light/dark；全量 e2e |
| 7. 收尾 | 打印页、暗色矩阵、全量 e2e（45 用例）、文档/ADR/计划更新、提交 | 全量通过 |

每批流程：改样式 → typecheck + lint → 重启 AppHost（新文件/全局 CSS）→ 截图 light/dark → 聚焦 e2e → 阶段末 unit + build + 全量 e2e → 文档回填 → git commit（临时截图 spec 不提交）。

当前目录结构（2026-11-17 侦察，并发会话已完成组件目录化与样式外置）：`app/pages/` 9 个页面；`app/components/` 按业务域分 14 个目录（finance 23、organization 7、shell 5、account 3、catalog 2、billing 2、audit 2、purchasing 2、sales 2、workspace 2、dashboard 1、inventory 1、assistant 1、common 1）；壳层样式外置于 `app/assets/css/shell/`、首页样式外置于 `app/assets/css/workspace/`、定价页样式外置于 `app/assets/css/billing/`。铺开时按此结构修改，避免与并发会话写同一文件。

全量 e2e 基线（2026-11-17，试点 + Batch 0 后）：`pnpm test:e2e` 46 passed / 2 failed / 1 skipped（18.6m）。失败两项为 `e2e/email-onboarding.spec.ts:196`（期望 400 实得 403）与 `:306`（治理 settings PUT 期望 200 实得 403），单独重跑仍失败；当时工作区存在未提交的 Organization 治理后端重构（治理端点分页、`ApiWrite` 属性、`Created` 响应等），判断为并发后端改动尚未同步 e2e 所致，与本任务纯 CSS 改动无关。前端 suite 用例数由 45 增至 49（并发新增）。

## 9. 方案对比：Odoo vs ERPNext（决策中）

| 维度 | Odoo（当前参考） | ERPNext（Frappe Desk） |
| --- | --- | --- |
| 壳层 | 顶部应用菜单 + 可折叠左侧菜单；17+ 浅色侧栏、紫色品牌 | 固定左侧模块栏 + 顶部面包屑；浅色侧栏、蓝色强调 #2490ef |
| 首页 | 无强工作台，进模块直接列表/看板 | Workspace 为核心：数字卡 + 快捷卡 + 图表 |
| 列表页 | 控制面板（搜索 + Filter/Group By/Favorites + 分页）+ 表格，行高约 30px | 列表工具栏（filter 弹层、列设置、排序）+ 表格，行高略大，支持行内编辑 |
| 表单页 | statusbar 流程条 + notebook 页签 | 顶部按钮组 + 页签 + 子表格 grid |
| 搜索 | 模块内 search facets（可存收藏） | Awesome Bar 全局跨单据搜索（Ctrl/⌘+K） |
| 字体密度 | 13px 左右、紧凑 | 14px 左右、Bootstrap 4 风格、更松弛 |
| 圆角/阴影 | 4–6px、几乎无阴影 | 8px 卡片、阴影/描边更明显 |
| 观感 | 企业软件、老练紧凑 | 现代 Web、卡片化、更轻 |

方向选项：**A 继续 Odoo**（推荐，已落地词汇直接铺开）；**B 完全切 ERPNext**（需重做壳层、首页 Workspace、列表筛选弹层、表单按钮组，多 2–3 批工作量）；**C 混合**（Odoo 骨架 + 借鉴 ERPNext 的 Workspace 卡片首页与全局搜索）。

## 10. 待确认事项

0. 设计方向：A 继续 Odoo（推荐）/ B 完全切 ERPNext / C 混合（Odoo 骨架 + ERPNext 首页与搜索）。
1. 是否按本基线铺开全站（Batch 0–7）。
2. 壳层是否也 Odoo 化：保留当前深色侧栏，还是改为 Odoo 式浅色顶栏 + 应用菜单（影响最大，建议最后单独做）。
3. 信息密度：试点采用 13px 正文 / 30px 控件 / 8px 12px 行距，是否接受（更紧凑）还是希望略宽松。
4. 提交策略：当前工作区有并发会话的大规模前端重构（组件目录化、样式外置），试点文件与其交织；铺开时需与并发改动合并后再按阶段提交。
