# Web 工作区控制台

日期：2026-11-12。状态：本地前端类型检查、生产构建与 14 项真实浏览器用例通过；远端 CI 和生产验收未执行。

## 范围

原工作台把全部业务面板（公司设置、账簿、报表、往来单位、目录、库存、采购、销售、应收等）依次平铺在同一页，页面过长且难以定位。本次改为单页控制台：顶部显示当前工作区与模块 tab，只渲染当前选中的模块。

- `src/Web/nexora-web/app/pages/index.vue`：新增控制台条、模块 tablist 与 tabpanel；保留登录页、创建工作区 / 加入工作区、工作区列表与概览、`WorkspaceCapabilities` 与 `AccountDeletionReview`。每个模块标签带 `data-testid="module-<id>"`，tabpanel 为 `#console-panel`，tab 按钮含 `role="tab"`、`aria-selected` 和 `aria-controls`。
- 模块顺序：总览 → 公司设置 → 账簿设置 → 财务报表 → 财务概览 → 往来单位 → 商品目录 → 库存工作台 → 采购订单 → 销售订单 → 应收工作台。个人工作区隐藏公司设置、采购订单、销售订单和应收工作台；尚未选择工作区时只显示总览内容。
- 10 个 `Workspace*` 面板组件在 `onMounted` 触发原有打开 / 读取函数，切换 tab 即按需加载；加载失败保留空状态，仍可用模块内刷新按钮重试。
- `src/Web/nexora-web/i18n/locales/{zh-CN,en}.json`：新增 `workspaces.console.*` 的 tab 名称与当前工作区文案。
- `src/Web/nexora-web/e2e/workspace.spec.ts`：14 处面板入口改为点击对应 `module-*` tab；公司设置用例在初始化账簿后先切回公司设置 tab 再建立个人工作区关联。
- 不改 BFF、业务 API、数据模型或既有可访问名称；面板内部按钮、标签顺序与打印结构保持原样。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-web typecheck` | 通过，仅既有 `ERR_PACKAGE_PATH_NOT_EXPORTED`（vue-router volar 插件路径）警告 |
| `pnpm --dir src/Web/nexora-web build` | 通过；Nuxt 4.6.4，Nitro node-server，构建 15.6s |
| 完整 workspace 浏览器套件 | 14/14 通过（6.6m），含目录、登录 / CSRF、邀请与授权、往来单位、公司设置、账簿与报表、税务、采购、P4 销售与开票 |
| 1440×1000 桌面 | 11 个模块 tab 单行排列；模块页不显示 hero，内容从控制台条开始 |
| 390×844 移动端 | tab 自动换行，`document.documentElement.scrollWidth <= innerWidth`，模块页无横向溢出 |
| 深浅色 | 选中 tab 在深色主题改为深色文字，避免浅主色底上的白字低对比 |

视觉审计截图在本地 `artifacts/ui-audit/`（登录页、总览、各模块、移动端及深色截图），未纳入版本控制；审计脚本为临时文件，验证后删除。

## 复现

从仓库根目录启动 AppHost 并等待 BFF，然后运行完整工作区用例：

```powershell
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait bff --apphost $appHost --timeout 150 --non-interactive
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost $appHost --non-interactive
```

Playwright 使用本地 BFF、Edge 和开发身份，串行执行；连续运行依赖 TOTP 的用例若提示验证码被拒绝，等待下一个 30 秒窗口后重试。

## 边界

- 团队与成员、角色与权限仍是独立路由 `/companies/{workspaceId}/members` 与 `/roles`，由侧栏进入；本次控制台不内嵌这两个页面。
- 未运行远端 GitHub Actions 或生产验收；完整 `test:e2e` 中其余含邮箱开通的用例沿用既有记录。
- 页面数据由既有 API 提供，未改变权限、租户隔离或幂等语义。
