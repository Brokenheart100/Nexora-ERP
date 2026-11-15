# 工作区首页满宽桌面布局

日期：2026-11-12。状态：本地类型检查、ESLint、生产构建、4 项前端单测与 1440 / 1920 桌面截图检查通过；完整浏览器 e2e、远端 CI 与生产验收未执行。

## 范围

工作区首页原先使用 `max-width: 1360px` 居中容器，创建工作区 / 加入工作区并排后，工作区列表为单列窄卡片，桌面大屏留白明显。本次按“内容铺满桌面”调整呈现层，不改变业务逻辑与接口。

- `src/Web/nexora-web/app/pages/index.vue`：页头标题区改为 `section.hero`，左侧保留标题与说明，右侧新增 4 个统计块（工作区、企业、个人、本位币）；主体改为 12 列 `.deck`：创建工作区 7 列、加入工作区 5 列、工作区列表 8 列、概览与能力栏 4 列，账户删除预检横跨整行。工作区列表增加客户端搜索框，按名称、本位币、地区过滤，标题显示“过滤后 / 总数”；列表为自适应多列卡片（1440 宽 2 列，1920 宽 3 列），超过 520px 高时卡片内滚动。
- `src/Web/nexora-web/app/assets/css/main.css`：移除 `main` 的 1360px 限宽与居中；新增 `.hero`、`.hero-stats`、`.deck`、`.workspace-card`、`.list-tools`、`.ws-search` 及深色主题覆盖；工作区条目由分隔线列表改为带边框与悬停位移的卡片；打印样式隐藏 hero。
- 控制台条改为横向工具条：当前工作区在左、模块 tab 在右并自动换行，减小 tab 内边距以容纳 11 个模块。
- `src/Web/nexora-web/i18n/locales/zh-CN.json`、`src/Web/nexora-web/i18n/locales/en.json`：新增 `workspaces.stats.companies`、`workspaces.stats.personal`、`workspaces.list.search`、`workspaces.list.noMatch`。
- 保留既有可访问名称与结构：创建工作区表单仍用“企业名称”标签，模块 tab 仍为 `data-testid="module-<id>"`，工作区按钮仍为 `button.workspace` 并带 `aria-current`；未修改 BFF、业务 API、数据模型、权限或幂等语义。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-web typecheck` | 通过，仅既有 `ERR_PACKAGE_PATH_NOT_EXPORTED`（vue-router volar 插件路径）警告 |
| `pnpm --dir src/Web/nexora-web lint` | 通过，0 error / 0 warning |
| `pnpm --dir src/Web/nexora-web build` | 通过；Nuxt 4.6.4 / Nitro node-server，首轮 26.5s、复跑 14.1s |
| `pnpm --dir src/Web/nexora-web test:unit` | 4/4 通过 |
| 1440×1000 桌面（深色 / 浅色） | hero 与 deck 宽度 1096px，工作区列表 2 列；`scrollWidth === innerWidth`，无横向溢出 |
| 1920×1080 桌面（深色） | hero 与 deck 宽度 1576px，工作区列表 3 列 |
| 选中工作区后 | 横向控制台条显示模块 tab；概览栏展示本位币、地区、投影状态与更新时间 |
| 浏览器控制台 | 拦截 BFF 接口的视觉检查无 console error / pageerror |

视觉检查使用临时 Playwright 脚本拦截 `/bff/me`、`/bff/api/workspaces`、`/bff/api/reports/workspaces/{id}` 等接口并注入 179 个工作区，截图保存在本地 `artifacts/ui-review/`，未纳入版本控制。

## 复现

仅验证前端呈现时，可启动 Nuxt 开发服务并用 Playwright 拦截 BFF 接口：

```powershell
pnpm --dir src/Web/nexora-web dev
# 另开终端，运行带路由拦截的 Playwright 截图脚本后访问输出目录
```

需要真实数据与登录态时，按既有流程启动 AppHost 并等待 BFF：

```powershell
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait bff --apphost $appHost --timeout 150 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost $appHost --non-interactive
```

## 边界

- 按需求只针对桌面铺满布局，不做移动端专项适配；既有 1180 / 980 / 700 断点保留为回退，移动端仍隐藏 hero 统计并把 deck 收为单列。
- 本次未重跑完整浏览器 e2e（依赖 AppHost、Docker 与 Keycloak），也未执行远端 GitHub Actions 或生产验收；选择器与可访问名称未变，后续回归沿用既有用例。
- 工作区搜索为客户端过滤，不改变分页、权限或数据加载方式；hero 统计基于当前已加载的工作区列表。
- 概览栏投影状态仍由既有 Reporting 接口提供，本次未改变其契约。
