# Web 样式分层 Phase 1–2（token 单一来源与交互底座）

日期：2026-11-14。状态：Phase 1–2 本地通过（静态检查、截图对比、聚焦 e2e、全量 workspace 套件）；Phase 3–7 未开始；远端 CI 与生产验收未执行。

决策与四层分工见 [ADR 0020](../adr/0020-frontend-design-system-layering.md)。

## 范围

本次只调整前端呈现层与交互底座，不改变 BFF、业务 API、数据模型、可访问名称、`data-testid`、面板顺序与打印隔离结构。

- Phase 1 token 单一来源：`src/Web/nexora-web/app/assets/css/main.css` 新增 Tailwind v4 `@theme inline` 块，把 `--nx-*` 暴露为 `--color-nx-*` 语义色、`--color-brand-50…950` 品牌色阶、`--radius-*`、`--shadow-*`、`--font-*`；`src/Web/nexora-web/app/app.config.ts` 的 `ui.colors.primary` 由 `blue` 改为 `brand`。
- Phase 2 交互底座：新增 `app/composables/useNotice.ts`（useToast 封装）与 `app/composables/useConfirm.ts` + `app/components/ConfirmDialog.vue`（useOverlay 程序化确认弹窗，替换 `window.confirm`）；页头语言切换由自定义 select 改为 `USelect`；`WorkspaceRecordChanges.vue` 与 `InvoiceCommunication.vue` 接入 toast / 确认弹窗。

## 实现摘要

| 文件 | 变更 |
| --- | --- |
| `src/Web/nexora-web/app/assets/css/main.css` | 新增 `@theme inline` token 映射与 brand 色阶；`.locale-switch` 收敛为 `min-width: 132px`，删除旧 select 与暗色规则；移动端隐藏规则保留 |
| `src/Web/nexora-web/app/app.config.ts` | `primary: 'brand'`，Nuxt UI 组件改用品牌色 |
| `src/Web/nexora-web/app/composables/useNotice.ts` | `useToast` 封装：success / info / warning / error 图标与时长（error 8000ms，其余 4000ms），`notify` / 快捷方法 |
| `src/Web/nexora-web/app/composables/useConfirm.ts` | `overlay.create(ConfirmDialog, { destroyOnClose: true }).open(options)` 返回 `Promise<boolean>` |
| `src/Web/nexora-web/app/components/ConfirmDialog.vue` | `UModal` + `defineModel('open')`；确认 / 取消 emit `close`，ESC 与遮罩关闭 resolve false |
| `src/Web/nexora-web/app/layouts/default.vue` | 语言切换改为 `USelect`（items、icon、size、variant、color） |
| `src/Web/nexora-web/app/components/InvoiceCommunication.vue` | 分享 / 撤销 / 投递成功提示改用 `useNotice`；重新发送 / 未知投递改用 `useConfirm` 确认，删除 `window.confirm` |
| `src/Web/nexora-web/app/components/WorkspaceRecordChanges.vue` | 无权来源提示改用 toast（保留持久 UAlert）；CSV 导出成功 toast |

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-web typecheck` | 通过 |
| `pnpm --dir src/Web/nexora-web lint` | 0 error；34 条既有 `vue/first-attribute-linebreak` warning（InvoiceSchedules.vue、WorkspaceAssistant.vue） |
| `pnpm --dir src/Web/nexora-web test:unit` | 10 个文件 53 项通过 |
| `pnpm --dir src/Web/nexora-web build` | 通过（17.9s） |
| 明暗 / 桌面移动截图对比 | 自定义类布局与暗色零差异；Nuxt UI 主色由 blue-500 变为 brand `#2f5fbf`；语言切换呈现 USelect |
| 聚焦 RCD e2e（含 toast 断言） | 1 passed（8.3s） |
| 全量 `workspace.spec.ts` | 26 passed（13.3m） |

截图对比（本地 `artifacts/`，未纳入版本控制）：

- 基线：`artifacts/ui-after/`（01-login、02-workspaces-light、03-console-home-light、03b-dashboard-light、04-audit-changes-light、05-audit-changes-dark、06-mobile-list-dark）。
- Phase 1：`artifacts/ui-after-p1/` 同名单。
- Phase 2：`artifacts/ui-after-p2/` 同名单。
- 02-workspaces-light 在部分运行中捕获于数据 hydrate 前（0/0、图标未渲染），属截图时序，与 Phase 1–2 无关；04 审计页与 05 暗色页图标、布局正常。

## 复现

```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build

$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait gateway --apphost $appHost --timeout 180 --non-interactive

$env:UI_SNAPSHOT_DIR = 'artifacts/ui-after-p2'
pnpm --dir src/Web/nexora-web exec playwright test e2e/ui-snapshots.spec.ts --reporter=line

pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line -g "Record changes capture"
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost $appHost --non-interactive
```

截图 spec `src/Web/nexora-web/e2e/ui-snapshots.spec.ts` 为本次临时验证脚本，验证后删除；截图产物保留在 `artifacts/`。

## 验收断言

- 自定义语义类组件（壳层、卡片、按钮、表格、状态胶囊、审计页签）视觉与基线一致，暗色正常。
- Nuxt UI 组件主色为 brand 色板：创建工作区、查询记录变更等按钮呈现 `#2f5fbf`。
- 页头语言切换为 Nuxt UI `USelect`，可切换 `zh-CN` / `en`，移动端仍隐藏。
- CSV 导出成功后出现 toast「已导出记录变更 CSV。」（RCD e2e 断言）。
- 发票重新发送 / 未知投递确认走 `ConfirmDialog`，取消时不提交决策、确认后才提交（见边界说明）。
- 静态检查、单测、构建通过，既有 e2e 无回归。

## 边界与后续

- `InvoiceCommunication` 的确认弹窗 UI 路径当前没有 e2e 覆盖：既有发票投递用例（`workspace.spec.ts` 约 :2055–2092）全部走 API，UI 只断言到应收发票列表。ConfirmDialog 通过 typecheck / build 与组件代码验证，后续在发票 UI 用例中补确认 / 取消断言。
- Phase 3–7（表格、表单、页签、壳层、死 CSS 清理）按 [ADR 0020](../adr/0020-frontend-design-system-layering.md) 顺序推进，尚未开始。
- 未执行远端 GitHub Actions 或生产部署。
