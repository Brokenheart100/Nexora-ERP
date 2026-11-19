# Nuxt 4 目录与工作台拆分验收

日期为 2026-11-16。本地回归使用 Nexora Aspire 开发环境、Edge 和 Mailpit。

## 实施范围

| 路径 | 职责 |
| --- | --- |
| `app/components/` | 按工作台、组织、账号、订阅、目录、采购、销售、库存、财务、审计、助手和仪表盘归档。财务按核算、银行、应收和报表继续分组。 |
| `app/composables/`、`app/utils/` | 复用逻辑与工具按业务归档。工作台模块、助手会话、仪表盘、仓库库存各有对应的 composable。 |
| `app/assets/css/` | 工作台、应用壳和定价页的样式按职责拆分，仍由对应 Vue 文件按原顺序引用为 scoped 样式。 |
| `server/utils/{auth,session,runtime}/` | 管理 OIDC、CSRF、Redis 会话与运行配置。Nitro 文件路由保留在 `server/routes/`。 |
| `shared/utils/runtimeStatus.ts` | Vue 与 Nitro 共用的运行状态类型及纯函数。 |

按组件文件名注册自动导入，既有组件名继续在原模板上使用。核对了 41 个页面与 Nitro 路由文件的路径、45 个组件文件名的唯一性，以及 `app/`、`server/`、`shared/` 的依赖方向。逐个比较了 32 个 Nitro 处理器的实现、45 个组件的模板及样式，并核对布局样式拆分后的内容及顺序。

## 复现

```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraAppHost --non-interactive
aspire wait gateway --apphost $nexoraAppHost --timeout 150 --non-interactive
$env:NEXORA_TEST_P4_MAILPIT = '1'
pnpm --dir src/Web/nexora-web test:e2e --reporter=list --output=../../../artifacts/p1/runtime/nuxt-structure-e2e/playwright
aspire stop --apphost $nexoraAppHost --non-interactive
```

启用 `NEXORA_TEST_P4_MAILPIT` 前确认发票邮件使用本机 Mailpit。

## 本地结果

- TypeScript 类型检查和 Nuxt 生产构建通过。类型检查仍输出已有的 Vue Router Volar 插件解析提示，退出码为 0。
- ESLint 退出码为 0，输出 82 条模板属性换行提示。Vitest 16 个文件共 89 项测试全部通过。
- Playwright 在 Aspire 同源网关运行完整套件，45 项全部通过，耗时约 16.7 分钟。覆盖邮箱与 OIDC 登录、退出、工作区及范围隔离、主数据、采购、销售、库存、总账、开票、Mailpit 投递、报表和打印，以及仪表盘、计费、助手、PWA、CLI 和 MCP。
- 验证结束后正常停止本次启动的 AppHost。日志及本次截图见本地 `artifacts/p1/runtime/nuxt-structure-e2e/`。
