# Web 工作台视觉刷新

> 后续的 Nuxt 模块化重构见 [Nuxt 模块化重构](nuxt-modularization.md)。本文记录的是重构前的呈现层刷新与当时验证结果。

日期：2026-11-10，2026-11-11 补充名称空值加固。状态：本地前端检查与三个真实浏览器切片通过；完整 e2e、远端 CI 和生产验收未执行。

## 范围

本次只调整 Nuxt 工作台的呈现层，不改变 BFF、业务 API、数据模型或既有可访问名称。

- `src/Web/nexora-web/app/assets/css/main.css`：新增统一设计令牌、应用壳层、卡片、表单、表格、状态胶囊、打印和移动端规则。
- `src/Web/nexora-web/app/app.vue`：重排侧栏、页头、工作区创建 / 加入、工作区列表与概览；保留全部面板顺序、组件 props、按钮与标签文本。页头身份在 `preferred_username` 缺失时回退到 `sub` 或「当前用户」；工作区列表统一收敛名称空值，缺失时显示「未命名工作区」，避免渲染期读取 `slice` 中断。
- `src/Web/nexora-web/nuxt.config.ts`：注册全局样式入口。
- `src/Web/nexora-web/app/components/WorkspaceGovernance.vue`：角色下拉增加占位项，并在成员加载后回填默认业务角色，使显示值与提交时使用的默认角色一致。

`.financial-reports` 仍是 `.shell > main` 的直接子元素；打印隔离规则和 `region` 名称未变。工作区概览的「已同步」文本保持唯一匹配。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-web typecheck` | 通过 |
| `pnpm --dir src/Web/nexora-web build` | 通过；Nuxt 4.6.4，client 199 modules，Nitro node-server |
| 390px 视口 | `document.documentElement.scrollWidth <= innerWidth`，无横向溢出 |
| 真实 BFF / Edge 截图 | 1440×1000 桌面与 390×844 移动端已检查；折叠面板、报表、账簿、账龄、商品目录和成员授权布局正常 |
| 空名称冒烟 | Playwright 注入 `name = null` 的身份与工作区响应；页面显示「未命名工作区」，无 page error 或 console error |

真实浏览器用例（逐个运行，均通过）：

- `Catalog UI and API preserve workspace scope, versioning and idempotency`（5.5s）
- `OIDC + TOTP, CSRF, workspace creation, projection, tenant denial and logout`（10.2s）
- `Workspace invitation, role assignment, immediate suspension and reactivation through the real BFF`（19.9s）

## 复现

从仓库根目录启动 AppHost 并等待 BFF：

```powershell
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait bff --apphost $appHost --timeout 120 --non-interactive
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
pnpm --dir src/Web/nexora-web test:e2e -- --grep "Catalog UI and API"
aspire stop --apphost $appHost --non-interactive
```

运行 e2e 前必须停止占用 3100 端口的本地 Nuxt 开发服务器；否则 AppHost 的 web 资源会被占用，BFF 代理返回 504。连续运行依赖 TOTP 的用例时若提示验证码被拒绝，等待下一个 30 秒窗口后重试。

## 边界

- 未运行完整 `test:e2e`；财务报表打印、账龄、采购、销售、库存等其余场景沿用既有实现，未在本次逐一回归。
- 未执行远端 GitHub Actions 或生产部署。
- 视觉截图产物在本地 `artifacts/`，未纳入版本控制。
