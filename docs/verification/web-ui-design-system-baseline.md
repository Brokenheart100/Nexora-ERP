# Web 样式分层 Phase 0 基线记录

日期：2026-11-14。状态：基线已记录、护栏已落地、打印隔离缺陷已修复；Phase 3–7 以本文与截图目录为回归基准。

决策与四层分工见 [ADR 0020](../adr/0020-frontend-design-system-layering.md)，Phase 1–2 实现见 [Phase 1–2 验证记录](web-ui-design-system-phase1-2.md)。

## 范围

Phase 0 的目标是在继续迁移前记录可量化基线，并锁定迁移护栏。Phase 1–2 已完成，因此本文基线采集于 Phase 1–2 之后、Phase 3 之前；Phase 1 之前的原始基线截图另存 `artifacts/ui-after/`。

## 基线数据（2026-11-14）

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-web typecheck` | 通过 |
| `pnpm --dir src/Web/nexora-web lint` | 0 error；34 条既有 `vue/first-attribute-linebreak` warning |
| `pnpm --dir src/Web/nexora-web test:unit` | 10 个文件 53 项通过 |
| `pnpm --dir src/Web/nexora-web build` | 通过（17.9s） |
| 聚焦 e2e（5 个场景） | 5 passed（2.2m） |
| 全量 `workspace.spec.ts` | 26 passed（13.3m） |
| AppHost | gateway healthy；明暗、桌面 / 移动截图已核对 |

## 截图基线

| 目录 | 内容 |
| --- | --- |
| `artifacts/ui-after/` | Phase 1 前原始基线：01-login、02-workspaces-light、03-console-home-light、03b-dashboard-light、04-audit-changes-light、05-audit-changes-dark、06-mobile-list-dark |
| `artifacts/ui-after-p1/` | Phase 1 后同名单（token 单一来源） |
| `artifacts/ui-after-p2/` | Phase 2 后同名单（交互底座，Phase 3 前基线） |
| `artifacts/ui-baseline-p0/` | 本次补拍：07-reports-light（财务报表明色）、08-reports-print（打印隔离视图，修复后内容可见） |

覆盖场景：登录页、工作区列表、工作台概览、业务仪表盘、审计 / 记录变更、暗色主题、390px 移动端、财务报表打印隔离。

## 打印隔离缺陷修复

补拍打印基线时发现真实缺陷：财务报表打印隔离规则假设 `.financial-reports` 是 `.shell > main` 的直接子元素，但面板现由 `section.console` 与 `#console-panel` 包裹，`main > :not(.financial-reports)` 会隐藏整个 `.console`，导致打印为空白页。修复 `WorkspaceFinancialReports.vue` 的 `@media print` 规则，逐层保留目标节点：`main > :not(.console)`、`.console > :not(#console-panel)`、`#console-panel > :not(.financial-reports)` 隐藏非目标内容。同时强化 e2e 打印断言：除计算样式外，还校验报表 `getBoundingClientRect().height > 0` 且 `offsetParent !== null`，防止祖先被隐藏时断言仍通过。

## e2e 选择器护栏

迁移前 e2e 依赖 5 个 CSS class 选择器。本次已为对应元素补充 `data-testid`，并把 e2e 改为 testid 定位：

| 场景 | 原选择器 | 现选择器 | 组件 |
| --- | --- | --- | --- |
| 工作区初始化向导 | `.setup-sub` | `getByTestId('setup-sub')` | `WorkspaceSetup.vue` |
| 业务仪表盘趋势表 | `.dashboard-trend tbody tr` | `getByTestId('dashboard-trend').locator('tbody tr')` | `WorkspaceDashboard.vue` |
| AI 助手会话历史 | `.assistant-sessions button` | `getByTestId('assistant-sessions').locator('button')` | `WorkspaceAssistant.vue` |
| 财务报表打印隔离检查 | `.financial-reports` | `[data-testid="financial-reports"]` | `WorkspaceFinancialReports.vue` |
| 财务报表打印隔离检查 | `.shell > main > header` | `[data-testid="app-header"]` | `layouts/default.vue` |

变更后 e2e 中不再有 CSS class 定位（`locator('.` / `querySelector('.` 均为 0 处）。Phase 3–7 迁移必须保留上述 `data-testid`、可访问名称、面板顺序与打印结构。

## 护栏约定

1. `main.css` 只减不增（token 层除外）；新样式用 Tailwind utility 或组件 scoped style。
2. `data-testid`、可访问名称、面板顺序、打印隔离结构在迁移中保持不变。
3. 修改 `app/` 源码后必须 `aspire stop` → `aspire start`（Nuxt dev 不热更新）。
4. 每个 Phase 结束执行：typecheck / lint / test:unit / build + 聚焦 e2e + 全量 `workspace.spec.ts` + 明暗 / 移动 / 打印截图对比。
5. 每个 Phase 结束更新 [ADR 0020](../adr/0020-frontend-design-system-layering.md) 状态与本文档。

## 复现

```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build

$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait gateway --apphost $appHost --timeout 180 --non-interactive

pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line -g "Workspace setup wizard|Business dashboard|AI assistant|Opening, journal approval"
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost $appHost --non-interactive
```

截图由临时 Playwright 用例生成，验证后删除；产物保留在 `artifacts/`。

## 验证结果（本次 Phase 0 变更）

- `data-testid` 补充与 e2e 定位切换后：typecheck 通过、lint 0 error。
- 聚焦 e2e：5 passed（2.2m，Workspace setup wizard / Business dashboard / AI assistant / Opening, journal approval / 临时打印截图用例）；临时用例验证后已删除。
- 打印截图 `artifacts/ui-baseline-p0/08-reports-print.png`：修复打印隔离选择器后，打印媒体下壳层与筛选隐藏，报表标题、期间、合计与表格可见；强化后的 e2e 打印断言通过。
- 全量 `workspace.spec.ts` 在 Phase 3 交付时回归（本次仅补属性与选择器，不改变业务行为）。
