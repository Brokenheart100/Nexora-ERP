# 前端完全迁移到 Tailwind / 清空 main.css — 迁移 TODO

> 目标：把全局设计系统从 `app/assets/css/main.css` 迁到 **Nuxt UI 组件 + Tailwind utility + 组件 scoped CSS**，最终 main.css 只剩 `@import`（+ 一行 tokens.css 导入）。
> 状态：执行中（2026-11-15）。Phase 0–2 已完成；Phase 3–8 待执行。基线数据来自当前工作区实测。

---

## 0. 终态定义

```css
/* app/assets/css/main.css 最终形态 */
@import "tailwindcss";
@import "@nuxt/ui";
@import "./tokens.css";   /* --nx-* 变量 + @theme inline 桥接，light/dark 两套 */
```

- **保留 tokens 为 CSS 变量**：暗色模式靠 token 切换自动生效，模板里不需要写 `dark:` 变体；删 tokens 会让工作量翻数倍。
- 模板优先级：**Nuxt UI 组件 > Tailwind utility > 组件 scoped CSS**。
- 复杂规则不强行 utility 化，留在组件 scoped：财务报表打印隔离、固定列/高密度表格、PWA 安全区 `env()`、壳层 sticky/滚动锁。
- 不改动：label 文本、`name`/`id`、`data-testid`、错误文案、API payload、权限与业务逻辑。

---

## 1. 现状基线（2026-11-15 实测）

| 指标 | 数值 |
|---|---|
| main.css | **2208 行 / 41.5 KB / 326 个规则块** |
| 类选择器 | **91 个**（88 个在模板中直接使用；`dark`/`iconify`/`nx-scroll-lock` 为 JS/主题动态类） |
| 模板 class 属性 | 752 个（分布在 45 组件 + 9 页面 + 1 layout） |
| 高频全局类 | `quiet` 41 文件/222 次、`primary` 36/75、`heading-icon` 32/38、`card` 31/35、`hint` 17/48、`actions` 13/28 |
| `var(--nx-*)` | 17 个组件、221 处（scoped 样式） |
| 带 scoped 样式的组件 | 39 个 |
| 原生日期/时间输入 | **32 处 / 16 个组件** |
| 原生文件上传 | 3 处（BankImport / Chart / CompanySettings） |
| `UForm` 使用 | 0；zod 仅 `utils/workspace.ts` 使用 |
| e2e 类选择器 | `billing-subx.spec.ts` 的 `.plan`/`.plan.signup`；`readiness.spec.ts` 的 `.readiness .summary`/`.readiness tbody` |

### main.css 分区行数

| 分区 | 行数 | 处理方式 |
|---|---|---|
| tokens / @theme 桥接 | 142 | 拆到 tokens.css，保留 |
| Shell | 172 | Phase 3 迁 default.vue |
| Main column | 104 | Phase 3 迁 default.vue |
| Hero / Workspace hero | 46 + 98 | Phase 3 迁页面 utility |
| Cards | 53 | Phase 2 迁 UCard/utility |
| Workspace deck / library | 106 + 261 | Phase 3 迁页面 utility |
| Forms | 169 | Phase 4（先迁原生控件） |
| Buttons | 74 | Phase 2 迁 UButton |
| Tables | 52 | Phase 5 |
| Details / lists / dl | 76 | Phase 5 |
| Module internals | 102 | Phase 3/5 按组件迁 |
| Responsive | 84 | Phase 3 转 Tailwind 断点 |
| Theme controls / language | 25 + 5 | Phase 3 |
| Dark theme | 408 | Phase 3 末删除（token 生效后） |
| Runtime status / version | 165 | Phase 1 搬 scoped |
| PWA safe areas | 47 | Phase 1 搬 layout scoped |

---

## 2. 迁移映射规则（先定规则再动手）

| 现有 | 目标写法 | 备注 |
|---|---|---|
| `.quiet`（222） | `UButton variant="ghost" color="neutral"` 或 `variant="outline"` | 逐处确认：链接按钮/纯文本按钮保留语义；disabled/busy 状态用 UButton `:loading` |
| `.primary`（75） | `UButton color="primary"` | 注意 `size`、`block`、图标按钮 |
| `.card`（35） | `UCard` 或 utility `rounded-nx border border-nx-border bg-nx-surface shadow-nx-sm` | 先试点确定；UCard 的 header/body/footer padding 与现状不同 |
| `.hint`（48） | `text-sm text-nx-ink-3` | 直接替换 |
| `.heading-icon`（38） | `size-5 shrink-0 text-nx-primary`，或抽 `<PageHeading>` 小组件 | 抽组件可一次消掉 32 处 |
| `.actions`（28） | `flex flex-wrap items-center gap-2` | 部分在 scoped 中保留 |
| `.heading` / `.eyebrow` | `text-xl font-semibold text-nx-ink` / `text-xs font-semibold uppercase tracking-widest text-nx-ink-4` | 页面头部 |
| `.status-pill` | `UBadge` | 2 处 |
| `.table-scroll` | UTable 自带 overflow，或 `overflow-x-auto` | 财务报表保留 scoped |
| `.console-tabs` / `.audit-tabs` | 保留自定义 scoped（ADR 已记录），或后续 UTabs | 不强迁 |
| `.shell` / `aside` / `main` / `main > header` | default.vue 的 utility + 少量 scoped | 断点 900/1100/700/550 对照 |
| 原生 `input/select/textarea` 基础样式 | UFormField/UInput/USelect/UInputDate/UFileUpload | 先迁控件，再删 Forms 区段 |
| 打印规则 | 组件 scoped `@media print` | 财务报表已有先例 |
| PWA 安全区 | default.vue scoped（保留 `env()`） | 47 行 |
| 暗色 | token utility 自动切换；删除 408 行 dark 区段 | 禁止大面积 `dark:` |
| `nx-scroll-lock` | Vue 状态绑定 class，或保留 1 行 base | AppStatusOverlay 使用 |
| `.theme-toggle` / `.locale-switch` | layout scoped | 已部分 USelect 化 |

**禁止**：`@apply`（tokens.css 除外）、新增依赖、一次性删除 main.css。

---

## 3. 护栏与每批 DoD

### 操作约束
- Nuxt dev **不热更新 app/**：每批改完 `aspire stop` → `aspire start` → `sleep 45` → `aspire wait gateway`。
- 每批只改一个域；不混后端/业务改动。
- 每批开始前记录目标类引用数；结束必须归零（该批文件范围内）。
- 视觉对照：light + dark 截图（关键页），移动端与打印页单独抽查。
- e2e 优先改 `data-testid`，禁止新增类选择器。

### 每批 Definition of Done
- [ ] 目标类在批内文件 `grep` = 0
- [ ] `pnpm --dir src/Web/nexora-web typecheck` 通过
- [ ] `pnpm --dir src/Web/nexora-web lint` 0 error
- [ ] `pnpm --dir src/Web/nexora-web test:unit` 53 通过
- [ ] `pnpm --dir src/Web/nexora-web build` 通过
- [ ] 聚焦 e2e 通过（列出 `-g` 关键词）
- [ ] light/dark 截图无回归
- [ ] 更新 `docs/verification/web-ui-tailwind-migration.md`
- [ ] git commit（建议先建立基线提交；当前仓库无提交历史）

### 验证命令
```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g "关键词" --reporter=line
```

---

## 4. 批次清单

### Phase 0 — 基线与护栏（约 0.5 天）
- [x] 建立 git 基线提交（`37fa507` "chore: baseline snapshot before Tailwind migration (Phase 0)"）
- [x] 截图基线：工作区入口 / 财务 / 销售 / 采购 / 库存 / 审计 / 账户 / 定价 8 类页面 × light/dark × desktop/mobile，存 `artifacts/ui-tailwind-baseline/`（35 张：light 13、dark 12、mobile 10）
- [x] 打印基线：财务报表 print 截图（复用 `artifacts/ui-baseline-p0/08-reports-print.png`）
- [x] 新建 `docs/verification/web-ui-tailwind-migration.md`（批次表 + 结果占位）
- [x] 更新 ADR 0020：新增 Phase 8（Tailwind 完全迁移）目标、映射规则、终态定义
- [x] 冻结：后续新代码不得在 main.css 新增选择器（PR 检查项）
- [x] 记录基线：typecheck exit 0 / lint 0 error 61 warning / unit 16 文件 89 / build 25.5s / 全量 e2e 47 passed（18.4m，含 2 临时截图用例）

### Phase 1 — 冻结并搬出新增样式（约 0.5 天）
- [x] `.version-notice/.version-text/.version-actions` → `AppVersionNotice.vue` scoped
- [x] `.status-overlay/.status-card/.status-orbit/.status-eyebrow/.status-body/.status-since/.status-checked/.status-hint` → `AppStatusOverlay.vue` scoped
- [x] `body.nx-scroll-lock` → AppStatusOverlay scoped 内的 `:global(body.nx-scroll-lock)`
- [x] PWA 安全区 47 行 → `default.vue` scoped（保留 `env(safe-area-inset-*)`）
- [x] main.css 2208 → 2000 行（删除 1997–2207 共 211 行）
- [x] 验证：pwa / 版本提示 / 状态遮罩相关 e2e + 截图

### Phase 2 — 域级语义类迁移（4 批，约 4–6 天）

> 本批实际迁移 `quiet/primary/hint/heading-icon/actions` 五类；`card/heading/eyebrow/status-pill/empty-state/card-head/card-sub` 因依赖上下文选择器与页面语义，留到 Phase 3–5。

#### 2.1 财务域
- [x] WorkspaceLedger.vue（quiet 23 / primary 3 / actions 5 / card / hint / heading-icon）
- [x] WorkspaceFinancialReports.vue（quiet 11 / primary 1 / table-scroll / report-screen 10；表格结构保留）
- [x] WorkspaceReceivables.vue（quiet 11 / primary 3 / actions / row 4）
- [x] WorkspaceTrade.vue（quiet 8 / primary 4）
- [x] BankReconciliationPanel.vue（quiet 6 / primary 2）
- [x] InvoiceSchedules.vue（quiet 6 / primary 1）
- [x] InvoiceCommunication.vue（quiet 5 / primary 2）
- [x] FiscalYearPanel.vue（quiet 5 / primary 2）
- [x] WorkspaceBankImport.vue（quiet 5 / primary 2）
- [x] WorkspaceBilling.vue（quiet 4 / primary 2 / plan 3 / current 2）
- [x] WorkspaceRecordChanges.vue（quiet 4 / primary 1 / hint）
- [x] WorkspaceTaxes.vue（quiet 3 / primary 4）
- [x] WorkspaceAging.vue（quiet 2 / primary 1）
- [x] WorkspaceBook.vue（quiet 2 / primary 1）
- [x] WorkspaceReadiness.vue（quiet 1 / primary 1 / hint；按钮与提示已迁移；表格迁 UTable、badge 迁 UBadge 留 Phase 5）
- [x] 验收：`grep 'class="[^"]*\b(quiet|primary|hint|heading-icon|actions)\b'` 在 `app/` = 0；聚焦 e2e：Ledger / Receivables / Trade / Billing / Taxes / Bank import / Record changes / Financial reports（全量 45 passed 覆盖）

#### 2.2 销售 / 采购域
- [x] WorkspacePurchasing.vue（quiet 15 / primary 3 / actions 4）
- [x] WorkspaceSales.vue（quiet 15 / primary 5 / actions 4）
- [x] PurchaseReceiptPanel.vue（quiet 3 / primary 1）
- [x] SalesFulfillmentPanel.vue（quiet 3 / primary 1）
- [x] 验收：聚焦 e2e：Purchase / Sales / Fulfillment / Receipt（全量 45 passed 覆盖）

#### 2.3 库存 / 主数据域
- [x] WorkspaceInventory.vue（quiet 10 / primary 7）
- [x] WorkspacePartners.vue（quiet 8 / primary 2）
- [x] WorkspaceCatalog.vue（quiet 7 / primary 4）
- [x] WorkspaceChart.vue（quiet 6 / primary 4）
- [x] 验收：聚焦 e2e：Inventory / Catalog / Partners / Chart（全量 45 passed 覆盖）

#### 2.4 组织 / 治理 / 账户 / 壳层
- [x] WorkspaceMemberEditor.vue（quiet 7 / primary 1 / hint 4）
- [x] WorkspaceAudit.vue（quiet 6 / primary 1 / hint；audit-tabs 保留自定义）
- [x] WorkspaceGovernance.vue（quiet 4 / primary 1 / hint 6）
- [x] WorkspaceScopedRoleGrants.vue（quiet 3 / primary 1 / hint 2）
- [x] WorkspaceSetup.vue（quiet 4 / primary 4 / setup-hint 8）
- [x] WorkspaceDashboard.vue（quiet 5 / primary 1 / card-head / card-sub / hint 7 / kpi 8 / dashboard-block 5）
- [x] WorkspaceAssistant.vue（quiet 5 / hint 4 / actions 3）
- [x] AccountSessions.vue（quiet 3 / status-pill）
- [x] AccountSecurity.vue（quiet 2 / hint 2）
- [x] AccountDeletionReview.vue（quiet 2）
- [x] WorkspaceCapabilities.vue（quiet 1）
- [x] WorkspaceCustomRoleEditor.vue（quiet 1 / primary 1 / hint 1）
- [x] AppSessionGuard.vue（quiet 1 / primary 1）
- [x] pages/index.vue（quiet 6 / primary 3 / card 5 / hint 5 / heading-icon 5）
- [x] pages/join.vue（quiet 2 / primary 1 / login-card / login-actions）
- [x] pages/cli/authorize.vue（quiet 1 / primary 1 / login-card / login-actions）
- [x] layouts/default.vue（quiet 1 / theme-toggle / locale-switch）
- [x] 验收：聚焦 e2e：Team and roles / Custom roles / Audit / Governance / Setup / Dashboard / Assistant / Account / Pricing / Login（全量 45 passed 覆盖）

### Phase 3 — 壳层与页面语义（2 批，约 2–3 天）

#### 3.1 应用壳层
- [ ] `.shell/.aside/.main/main > header` + 响应式 → `default.vue` utility + scoped
- [ ] 断点对照：900 / 1100 / 700 / 550；移动端导航、语言切换、主题切换、PWA 安全区
- [ ] `.theme-toggle`、`.locale-switch` 迁 scoped
- [ ] 删除 main.css Shell / Main column / Responsive / Theme controls 区段
- [ ] 截图：desktop light/dark + mobile light/dark

#### 3.2 页面级语义
- [ ] pages/index.vue 控制台壳层：`console-tabs/console-panel/console-bar/console-chip/console-workspace...` → utility 或 scoped（保留 data-testid）
- [ ] pages/pricing.vue：`pricing-*` / `plan` → 页面 utility（e2e 的 `.plan` 改 data-testid）
- [ ] pages/join.vue、pages/cli/authorize.vue：`login-card/login-actions` → utility
- [ ] pages/companies/*：`heading` → utility
- [ ] WorkspaceDashboard：`kpi/dashboard-*` → utility 或 scoped
- [ ] WorkspaceSetup：`setup-*`（8 个类）→ utility 或 scoped
- [ ] WorkspaceFinancialReports：`report-screen/table-scroll` 保留 scoped，打印规则 scoped
- [ ] WorkspaceAudit：`audit-tabs` 保留 scoped（记录原因）
- [ ] 删除 main.css Hero / Workspace hero / Deck / Library / Module internals / Login state 区段
- [ ] **暗色收尾**：确认所有颜色走 token utility 后，删除 main.css Dark theme 区段（408 行）
- [ ] 截图矩阵 + 聚焦 e2e：Dashboard / Setup / Pricing / Join / CLI authorize / Reports

### Phase 4 — 表单基础元素与原生控件（2–3 天）
- [ ] 原生日期/时间 32 处 / 16 组件 → `UInputDate`（e2e `fill` 改 click + option；label 文本不变）
  - BankReconciliationPanel、InvoiceSchedules、WorkspaceAging、WorkspaceAudit、WorkspaceBook、WorkspaceFinancialReports、WorkspaceInventory(6)、WorkspaceLedger(3)、WorkspacePurchasing、WorkspaceReceivables、WorkspaceRecordChanges、WorkspaceSales、WorkspaceScopedRoleGrants、WorkspaceSetup、WorkspaceTaxes、WorkspaceTrade
- [ ] 原生文件上传 3 处 → `UFileUpload`（WorkspaceBankImport / WorkspaceChart / WorkspaceCompanySettings；e2e `setInputFiles` 对照）
- [ ] 删除 main.css Forms 区段（169 行）；清理残留裸 `input/select/textarea`（pages/index.vue 搜索框等）
- [ ] 可选：新表单试点 `UForm` + zod（不纳入本次必做）
- [ ] 验收：聚焦 e2e：Catalog / Taxes / Bank import / Chart / Company settings / Setup / Ledger / Audit / Receivables

### Phase 5 — 表格 / 详情 / 列表残余（约 1 天）
- [ ] WorkspaceFinancialReports 自定义表格保留（ADR 记录），仅迁周边类
- [ ] WorkspaceReadiness 表格 → UTable（或 utility），e2e `.readiness .summary/.tbody` 改 data-testid
- [ ] 全局 Tables（52 行）+ Details/lists（76 行）删除前确认无裸元素依赖
- [ ] 裸 `<table>` 全量复查（目标：仅 WorkspaceFinancialReports 保留）
- [ ] 聚焦 e2e：Readiness / Reports / Aging / Audit

### Phase 6 — 删除 main.css 分区 + tokens 拆分（约 1 天）
- [ ] 逐段删除已归零的 CSS 分区（每删一段跑 typecheck/lint/unit/build）
- [ ] 提取 tokens：`:root` + `html.dark` + `@theme inline` → `app/assets/css/tokens.css`
- [ ] main.css 最终只剩 3 行 import；`grep -c '{' main.css` ≈ 0
- [ ] 复查 39 个 scoped 样式：`var(--nx-*)` 仍可用（tokens.css 提供）
- [ ] 全量静态检查：typecheck / lint / unit / build

### Phase 7 — 全量验证与文档（约 0.5–1 天）
- [ ] 全量 e2e：workspace.spec + email-onboarding.spec + pwa.spec + billing-subx.spec + readiness.spec（串行）
- [ ] 截图矩阵：8 类页面 × light/dark × desktop/mobile + 打印页
- [ ] `docs/verification/web-ui-tailwind-migration.md` 完成（批次结果/截图/命令/边界）
- [ ] ADR 0020 状态更新为“Tailwind 迁移完成”
- [ ] `docs/计划.md` 更新
- [ ] `aspire stop`；最终报告

---

## 5. 工作量估算

| Phase | 内容 | 估算 |
|---|---|---|
| 0–1 | 基线 + 冻结 + 搬出新增样式 | 1 天 |
| 2 | 域级语义类 4 批（约 418 处高频替换 + 其余类） | 4–6 天 |
| 3 | 壳层 + 页面语义 + 暗色删除 | 2–3 天 |
| 4 | 表单基础 + 32 日期 + 3 文件上传 | 2–3 天 |
| 5 | 表格/详情残余 | 1 天 |
| 6 | CSS 删除 + tokens 拆分 | 1 天 |
| 7 | 全量验证 + 文档 | 0.5–1 天 |
| **合计** | | **约 11–16 个工作日（含验证）** |

比 Phase 3+4 大 2–3 倍：Phase 3/4 只迁了组件层（UTable/UFormField），保留了语义类；本计划要把语义类和壳层也拿掉。

---

## 6. 风险与回滚

| 风险 | 应对 |
|---|---|
| 视觉回归（无像素 diff 基建） | 每批 light/dark 截图对照；先做 1 个 pilot 页面量化 diff |
| e2e 依赖类选择器 | 改为 `data-testid`；label/name/role 保持不变 |
| UButton 变体与现状不一致 | Phase 0 先定 `.quiet` 三档映射，pilot 验证 |
| UCard 改变 DOM/padding | 优先 utility 组合保持 1:1，必要时保留 scoped |
| 打印/PWA 复杂选择器无法 utility 化 | 保留 scoped，不强迁（终态允许 scoped） |
| 暗色回归 | tokens 不删；删 dark 区段前逐页对照 |
| Nuxt dev 不热更新 | 每批 aspire stop/start；改动前集中完成 |
| 工作区/权限 e2e 受影响 | 不改业务逻辑与 API；e2e 只改选择器 |
| 一次性删 CSS 导致全站裸样式 | 只在 Phase 6 统一删；删除前 grep 引用 = 0 |

回滚：每批一个 git commit；出问题 revert 该批，不影响其他批次。

---

## 7. 未决决策（开始前确认）

- [ ] `.card` → UCard 还是 utility 组合？（建议先 pilot 比较）
- [ ] `.quiet` 的语义分档：ghost / outline / plain 各占多少？（建议先抽样 20 处）
- [ ] 控制台壳层（console-tabs/console-panel）保留自定义还是迁 UTabs？（ADR 已记录保留，本计划建议保留 scoped）
- [ ] tokens 放 `tokens.css` 还是 `app.config.ts` 的 Nuxt UI theme？（建议 tokens.css，兼容 221 处 `var(--nx-*)`）
- [ ] 是否顺带迁 UInputDate/UFileUpload？（建议纳入 Phase 4，否则 Forms 区段删不掉）
- [ ] 是否引入 UForm + zod？（建议另开任务，不阻塞本次）
- [ ] 全量 e2e 每批跑还是每 2 批跑？（建议每 2 批 + 最终全量）

---

## 附录 A — 高频类文件分布（用于拆批）

| 类 | 文件数/次数 | 主要文件（次数） |
|---|---|---|
| quiet | 41 / 222 | WorkspaceLedger(23)、WorkspacePurchasing(15)、WorkspaceSales(15)、WorkspaceFinancialReports(11)、WorkspaceReceivables(11)、WorkspaceInventory(10)、WorkspacePartners(8)、WorkspaceTrade(8)、WorkspaceCatalog(7)、WorkspaceMemberEditor(7) |
| primary | 36 / 75 | WorkspaceInventory(7)、WorkspaceSales(5)、WorkspaceCatalog(4)、WorkspaceChart(4)、WorkspaceSetup(4)、WorkspaceTaxes(4)、WorkspaceTrade(4) |
| heading-icon | 32 / 38 | pages/index(5)、WorkspaceGovernance(3)、其余各 1 |
| card | 31 / 35 | pages/index(5)、其余各 1 |
| hint | 17 / 48 | WorkspaceDashboard(7)、WorkspaceGovernance(6)、WorkspaceBilling(5)、pages/index(5)、AccountSessions(4)、WorkspaceAssistant(4)、WorkspaceMemberEditor(4) |
| actions | 13 / 28 | WorkspaceLedger(5)、WorkspacePurchasing(4)、WorkspaceSales(4)、WorkspaceAssistant(3) |
| 页面专属 | — | kpi(WorkspaceDashboard 8)、setup-hint(WorkspaceSetup 8)、report-screen(WorkspaceFinancialReports 10)、plan(WorkspaceBilling 3 + pricing 1)、dashboard-block(5)、num(Readiness 4)、row(Receivables 4) |

## 附录 B — e2e 类选择器（迁移时同步改 data-testid）

- `billing-subx.spec.ts:82` `.plan.signup`
- `billing-subx.spec.ts:84` `.plan`（专业版）
- `billing-subx.spec.ts:132` `.plan`（标准版）
- `readiness.spec.ts:83/88` `.readiness .summary`
- `readiness.spec.ts:84/85` `.readiness tbody`

## 附录 C — 原生日期/时间输入清单（Phase 4）

BankReconciliationPanel(1)、InvoiceSchedules(2)、WorkspaceAging(2)、WorkspaceAudit(2)、WorkspaceBook(1)、WorkspaceFinancialReports(2，保留)、WorkspaceInventory(6)、WorkspaceLedger(3)、WorkspacePurchasing(1)、WorkspaceReceivables(2)、WorkspaceRecordChanges(2)、WorkspaceSales(1)、WorkspaceScopedRoleGrants(2)、WorkspaceSetup(1)、WorkspaceTaxes(2)、WorkspaceTrade(2)。

## 附录 D — 原生文件上传清单

WorkspaceBankImport.vue、WorkspaceChart.vue、WorkspaceCompanySettings.vue。
