# Web 样式分层 Phase 7（死 CSS 清理与全量验证）

日期：2026-11-14。状态：Phase 7 已完成；`main.css` 经两轮清理由 2225 行收敛到 1995 行（先删 7 个未使用选择器，再删控制台改版遗留的 `main >` 死选择器、未使用的 `@theme inline` 映射、与 Tailwind preflight 重复的 reset 等），scoped 样式审计未发现新增死类；静态检查、聚焦与全量 e2e 通过。远端 CI 与生产验收未执行。

决策与四层分工见 [ADR 0020](../adr/0020-frontend-design-system-layering.md)。Phase 0–6 见 [基线记录](web-ui-design-system-baseline.md)、[Phase 1–2](web-ui-design-system-phase1-2.md)、[Phase 3](web-ui-design-system-phase3.md)、[Phase 4](web-ui-design-system-phase4.md)、[Phase 5](web-ui-design-system-phase5.md) 与 [Phase 6](web-ui-design-system-phase6.md)。

## 范围

只删除确认无引用的 CSS，不新增选择器、不重排令牌、不改视觉：

1. 对 `app/assets/css/main.css` 做全量类名审计：提取 91 个类选择器，与 `app/**/*.vue`（49 个文件、约 40 万字符模板 / 脚本 / 样式正文）逐一比对，并用 `grep` 在 `src/Web/nexora-web`（vue / ts / js）复核。
2. 删除确认未使用的 7 个类：`active-toggle`、`catalog-table`、`invite-row`、`member-list`、`partner-table`、`scroll`、`taxes`。对应规则包括：
   - 表单复选组 `label.active-toggle` 的两条规则；
   - 表格容器组中的 `.catalog-table` / `.partner-table` / `.chart .scroll`（保留仍使用的 `.table-scroll`）；
   - 嵌套财务模块网格 `:is(.chart, .taxes, .ledger, .trade)` 中的 `.taxes`（4 处，保留 `.chart` / `.ledger` / `.trade`）；
   - 治理成员列表 `.governance .member-list`；
   - 暗色分组 `html.dark .invite-row`；
   - 响应式 `.catalog-table` / `.partner-table` 的 3 组规则（`> table`、`th/td`、`th:first-child`）。
3. 对 49 个 `.vue` 的 `<style scoped>` 做同样的类名-模板比对；除 `WorkspaceFinancialReports.vue` 的 `.shell` / `.console`（打印隔离选择器，元素在页面壳层）与 `pages/index.vue` 的 `.dark`（暗色全局钩子）两处按设计引用外，无死类，无需删除。

第一轮结果：`main.css` 由 2225 行降至 2199 行；剩余类名全部有引用。main.css 保留 token（`@theme inline`）、应用壳层、共享语义类（`.card` / `.primary` / `.quiet` / `.hint` / `fieldset` / `.empty-state` / `.status-pill` 等，组件仍在依赖）、财务报表 / 打印规则、暗色与响应式覆盖。ADR Phase 7 所述「main.css 只留 token / 壳层 / 报表打印 / 暗色 / 响应式」中的共享语义类按四层分工第 2 层保留，模块专属的遗留选择器已随 Phase 3 / 4 迁移删除。

## 第二轮清理（控制台改版遗留与重复规则）

控制台改版把业务面板移入 `pages/index.vue` 的 `section.console` / `#console-panel` 后，`main > …` 直系子选择器已不可能匹配；同时部分 `@theme inline` 映射没有 utility 引用，若干 reset 与 Tailwind preflight 重复。按用户要求再次清理，共删除 204 行：

1. **控制台改版遗留的 `main >` 直系子选择器（148 行）**：书册详情、嵌套财务模块、账簿 `h4` / `ul`、账号删除预检、账龄，以及 `main > section.card` 的 `h2 + .partner-actions`、`p[role=status]` 片段。`app/layouts/default.vue` 的 `<main>` 直系子只有 header 与插槽，业务组件位于 `section.console > #console-panel` 内，选择器永不匹配。
2. **未使用的 `@theme inline` 映射（23 行）**：`--color-nx-*` 17 行、`--radius-nx*` / `--shadow-nx*` 4 行、`--font-display` 1 行（仓库内无对应 utility 使用）。保留 `--color-brand-50…950`（`app.config.ts` 的 `primary: 'brand'` 依赖）与 `--font-sans`。
3. **与 Tailwind preflight 重复的 reset（19 行）**：`box-sizing` 块、`-webkit-text-size-adjust`、`body { margin: 0 }`、表单 `font: inherit`、`a:hover` 下划线（`a` 已 `text-decoration: none`）。
4. **全局 `.sr-only` 规则（11 行）**：Tailwind 已生成该 utility，`WorkspaceAssistant.vue` 另有 scoped 副本。
5. **`label.check` 选择器片段（2 行）**：保留仍使用的 `label.comparison`。

结果：`main.css` 由 2199 行降至 1995 行（删除 204 行，无新增选择器）；`grep` 复核上述类名、映射与 reset 在 `src/Web/nexora-web` 的 vue / ts / js 中无引用，构建产物仍包含 `.sr-only` 与 `.font-sans`。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-web typecheck` | 通过（exit 0） |
| `pnpm --dir src/Web/nexora-web lint` | 0 error；62 条既有 `vue/first-attribute-linebreak` warning |
| `pnpm --dir src/Web/nexora-web test:unit` | 10 个文件 53 项通过 |
| `pnpm --dir src/Web/nexora-web build` | 通过（14.5s；第二轮清理后复跑通过，客户端 4.1s + Nitro） |
| 聚焦 e2e（9 项，覆盖表格、页签、加载态与记录变更） | 9 passed（3.9m） |
| 全量 `workspace.spec.ts` + `email-onboarding.spec.ts` | 30 passed（15.2m；workspace 26 + email-onboarding 4；第二轮清理前运行） |
| 第二轮清理后 `typecheck` / `lint` | 通过（exit 0；lint 0 error、62 条既有 warning） |
| 第二轮清理后聚焦 e2e（Partner profiles / Business dashboard / Unified audit / Journal links / Record changes） | 5 passed（1.9m） |

首次全量运行出现 1 个既有会话注册表用例超时（`Account session registry lists devices, revokes other sessions and blocks replay`，29/30）；隔离重跑 56.5s 通过，随后全量重跑 30/30。判定为冷启动 / 时序 flake，与本轮前端改动无关。

## 复现

```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build

$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait gateway --apphost $appHost --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts e2e/email-onboarding.spec.ts --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line -g "Record changes capture|Unified audit|Journal links|Partner profiles|Business dashboard"
aspire stop --apphost $appHost --non-interactive
```

## 验收断言

- `main.css` 不再包含上述 7 个类名；`grep` 在 `src/Web/nexora-web` 的 vue / ts / js 中无引用。
- 明暗主题下卡片、表格、表单、页签、壳层、打印隔离与移动端布局无变化（全量 e2e 与既有截图基线覆盖）。
- 第二轮清理后 `main.css` 为 1995 行，不含 `main > .book` / `main > .aging` / 账号删除预检 / `label.check` / `--color-nx-*` / `--radius-nx*` / `--shadow-nx*` / `--font-display` / 全局 `.sr-only` / `-webkit-text-size-adjust`；构建产物仍生成 `.sr-only` 与 `.font-sans`。
- 第二轮清理后聚焦 e2e 覆盖控制台页（仪表盘、账龄、审计、关联分录、记录变更）全部通过。
- 构建产物与 `typecheck` / `lint` / 单测通过；main.css 无新增业务选择器。

## 边界与后续

- `vue/first-attribute-linebreak` warning 为既有风格告警，未在本次批量格式化中处理。
- 第二轮清理后未重跑全量 30 项套件（删除项均为已无引用的选择器与重复规则，聚焦 e2e 覆盖受影响的控制台页面）；如后续改动控制台结构，需重新核对 `main.css` 中的直系子选择器。
- 远端 CI 与生产验收未执行。
