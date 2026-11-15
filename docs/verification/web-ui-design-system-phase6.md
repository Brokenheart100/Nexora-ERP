# Web 样式分层 Phase 6（加载态与壳层）

日期：2026-11-14。状态：Phase 6 已完成；应用壳层与空态保留自定义，加载态改用 Nuxt UI `USkeleton` / `UTable :loading`。远端 CI 与生产验收未执行。

决策与四层分工见 [ADR 0020](../adr/0020-frontend-design-system-layering.md)。Phase 0–5 见 [基线记录](web-ui-design-system-baseline.md)、[Phase 1–2](web-ui-design-system-phase1-2.md)、[Phase 3](web-ui-design-system-phase3.md)、[Phase 4](web-ui-design-system-phase4.md) 与 [Phase 5](web-ui-design-system-phase5.md)。

## 范围

只改加载态，不改壳层布局、空态文案与交互：

- 4 处显式加载文案改为 `USkeleton` 占位块，保留 `role="status"` 与 `aria-label`：
  - `WorkspaceBilling.vue`（正在读取计费信息）
  - `WorkspaceDashboard.vue`（正在读取财务概览、账龄、库存与经营投影）
  - `WorkspaceRoleCatalog.vue`（正在加载角色）
  - `WorkspaceSetup.vue`（正在读取初始化状态）
- 7 个已迁 `UTable` 的列表传入 `:loading="busy"`，加载时显示 Nuxt UI 骨架行：`WorkspaceAging`、`WorkspaceAudit`、`WorkspaceBilling`、`WorkspaceCatalog`、`WorkspaceChart`、`WorkspacePartners`、`WorkspaceRecordChanges`。审计与记录变更表格的 `v-if` 改为 `entries.length || busy` / `changes.length || busy`，首次加载即可显示骨架行而不是空态。
- 应用壳层（侧栏、页头、控制台模块页签、工作区 hero）、空态（`empty-state` 文案与图标）保持自定义；`WorkspaceAssistant.vue` 中 provider 的内联「加载中」是文本内容，不是加载占位，保留。

## 实现要点

- `USkeleton` 自带 `aria-busy="true"`、`role="alert"` 与本地化 `aria-label`；外层仍保留原 `role="status"` 与中文 `aria-label`，屏幕阅读器可获知加载中的业务语义。
- 占位块使用 Tailwind utility（`h-*` / `w-*` / `space-y-3` / `grid`）表达尺寸，不新增 main.css 选择器（符合「main.css 只减不增」约定）。
- `UTable` 的 `loading` 只影响表格区域；页面级 busy 状态、按钮 `:loading` 与错误 `UAlert` 行为不变。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-web typecheck` | 通过（exit 0） |
| `pnpm --dir src/Web/nexora-web lint` | 0 error；62 条既有 `vue/first-attribute-linebreak` warning |
| `pnpm --dir src/Web/nexora-web test:unit` | 10 个文件 53 项通过 |
| `pnpm --dir src/Web/nexora-web build` | 通过（14.5s） |
| 聚焦 e2e（Catalog / Partners / Billing / Dashboard / Audit / Record changes / Setup / Custom roles 等 9 项） | 9 passed（3.9m） |
| 全量 `workspace.spec.ts` + `email-onboarding.spec.ts` | 30 passed（15.2m；workspace 26 + email-onboarding 4） |

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
aspire stop --apphost $appHost --non-interactive
```

## 验收断言

- 首次进入计费、仪表盘、角色目录、初始化向导时显示骨架占位而不是空白或纯文字；加载完成后正常渲染数据。
- 7 个列表在加载时显示骨架行，数据到达后替换为真实行；空结果仍显示原有空态文案（如「当前筛选条件下没有记录变更。」）。
- 壳层、空态、错误 `UAlert`、按钮 loading 与 `data-testid` 不变。

## 边界与后续

- 其余组件的忙碌状态仍以按钮 `:loading` / `:disabled` 表达，未逐一替换为骨架屏；优先覆盖首屏与表格区域。
- 远端 CI 与生产验收未执行。
