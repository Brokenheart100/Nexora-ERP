# 2026-11-13 状态与错误提示统一为 Nuxt UI UAlert

## 范围

Web 前端 35 个页面/组件中 36 处 `<p role="status">` / `<p role="alert">` 提示统一改为 `@nuxt/ui` 的 `UAlert`。文案、可访问名称与既有 e2e 断言保持不变。

保留例外：`WorkspaceRoleCatalog` 的加载中文案、`WorkspaceTaxes` 的税额快照摘要仍为 `<p role="status">`，它们属于纯数据/加载文本，不是告警。

## 实现

- `src/Web/nexora-web/app/app.config.ts`：为 alert 设默认 `color: primary`、`variant: subtle`，root 插槽使用紧凑内边距 `px-3 py-2`。
- 普通状态/提示：`<UAlert v-if="..." role="status" :description="..." />`，使用主色浅底。
- 错误：`color="error"` + `icon="i-lucide-circle-alert"` + `role="alert"`。
- 警告：`color="warning"` + `icon="i-lucide-triangle-alert"` + `role="alert"`，用于成员/角色页的公司不可用提示。
- 首页消息改用 `deck-wide` 保持满宽；布局页退出失败提示保留 `mt-4` 间距。
- `src/Web/nexora-web/app/assets/css/main.css`：通用 `[role="status"]` 规则收窄为 `p[role="status"]`，避免覆盖 UAlert 语义色；删除已无引用的 `.app-status` 样式。

## 验证

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `pnpm typecheck` | 通过，仅既有 vue-router/volar 插件解析警告 |
| Lint | `pnpm lint` | 0 error；index.vue 的 15 条 first-attribute-linebreak 为既有警告 |
| 单测 | `pnpm test:unit` | 11/11 通过 |
| 构建 | `pnpm build` | 通过 |
| 浏览器 e2e | `pnpm exec playwright test e2e/workspace.spec.ts e2e/email-onboarding.spec.ts` | 20 passed (11.1m)，日志 [artifacts/w2/ualert-e2e.log](../../artifacts/w2/ualert-e2e.log) |
| 视觉检查 | 退出失败与邀请码提示 | [红色错误 UAlert](../../artifacts/w2/ualert-error.png)、[蓝色提示 UAlert](../../artifacts/w2/ualert-notice.png) |

## 边界

- 仅前端呈现层改动，接口、文案与 e2e 选择器（`getByRole('status'|'alert')`）保持不变。
- 静态说明文本（hint、card-sub 等）不属于告警，未改动。
