# Nexora Dashboard

Nuxt 4、Vue 3、Nuxt UI 与 Carbon 主题。D1–D3 接通原用户菜单、工作区、主数据和交易前置配置。D4 在原有采购、库存和财务页面接通采购到付款。入口为 `app.vue → NuxtLayout → NuxtPage`，布局位于 `app/layouts/default.vue`。

## 当前页面与服务

| 入口 | 当前用途 |
| --- | --- |
| `http://localhost:3001` | 原有完整 UI、原型交互与模拟数据 |
| `http://localhost:3003/catalog` | 原有 UI；MSW 拦截会话、工作区、主数据读写和交易前置配置请求 |
| `http://localhost:3003/purchase-orders?mockCase=d4` | 原有 UI；MSW 采购审批、收货、暂估、账单及付款 |
| `http://localhost:3003/finance?tab=tax-center&mockCase=d10` | MSW 税务设置、税额快照、申报日历及更正 |
| `http://localhost:3003/finance?tab=reporting&mockCase=d11` | MSW 财务报表、同水位钻取、PDF、账龄及导出任务 |
| `https://localhost:7444` | 真实 BFF / Keycloak 会话、授权工作区、主数据与采购到付款 |

左下角原用户菜单提供登录、邮箱验证码登录和开通账户。左上角原工作区菜单选择获授权的公司。商品页支持创建和按版本维护，`/definitions` 维护分类与单位，`/partners` 维护多角色伙伴和联系人。`/finance?tab=documents` 的原映射卡片检查账簿、科目表、期间、税务、资金账户与映射，首次配置应付和应收映射后只读。

从 `/purchase-orders` 创建、提交和审批采购单并签发收货许可。仓库接收人通过许可链接进入 `/inventory` 确认实收。`/finance?tab=payables` 显示暂估进度，支持选实收行评估税额、提交账单及登记独立复核的付款，并可查询付款凭证、银行流水、供应商应付明细与账龄。搜索与筛选作用于当前服务器页，操作由当前工作区权限和服务端单据状态控制。

`/finance?tab=tax-center` 使用当前工作区的税率、税组和申报日历。采购账单的匹配明细可打开原评估快照，销售发票显示随单保存的税项。申报或更正使用确认时的版本和汇总指纹。[D10 验收](../../../docs/verification/dashboard-d10-tax.md)

`/finance?tab=reporting` 可按日期查看五张财务报表、钻取凭证并生成 PDF 或 CSV。`/finance?tab=aging` 可查看分页账龄和往来明细账。工作台显示 Finance 概览与 Reporting 投影。[D11 验收](../../../docs/verification/dashboard-d11-reporting.md)

```powershell
pnpm --dir src/Web/nexora-dashboard install --frozen-lockfile
pnpm --dir src/Web/nexora-dashboard dev
# 在原界面预览 MSW 场景
pnpm --dir src/Web/nexora-dashboard dev:msw
```

## 保留的接入基础

`server/` 中的 OIDC、服务端 Redis 会话、CSRF、MFA 与固定 Gateway 转发继续使用。`authSession` 只维护当前 BFF 身份摘要，`liveSession` 维护授权工作区、权限及权益。主数据和前置配置查询使用 `useAsyncData` 与按主体、工作区、授权版本和分页隔离的键；切换范围会取消请求、清除旧表单并隔离迟到响应。

原编辑抽屉保存时发送原 `If-Match`、同一操作 ID 和 CSRF 头，关闭自动重试。`412` 保留输入；网络中断后先查询原结果，再允许明确重放原键、原请求。待确认提交保存于当前标签页，刷新后可在原账号和工作区恢复；MFA 返回后也在原抽屉恢复输入。`/join` 复用原设置页处理登录回跳，邀请兑换在 D12 接入。

BFF 私有配置为 `NUXT_BFF_ISSUER`、`NUXT_BFF_CLIENT_SECRET`、`NUXT_BFF_SESSION_KEY`、`NUXT_BFF_REDIS_URL`、`NUXT_BFF_GATEWAY_URL`。`NUXT_PUBLIC_DATA_MODE=live` 与 `NUXT_PUBLIC_BFF_ORIGIN` 用于已有独立 BFF 运行环境；缺少私有配置时仍拒绝启动。令牌保存在服务端加密会话，业务调用使用同源 `/bff/api/*`。

```powershell
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
```

## 构建与验证

```powershell
pnpm --dir src/Web/nexora-dashboard lint
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard test:msw
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
try { pnpm --dir src/Web/nexora-dashboard build }
finally { Remove-Item Env:NUXT_PUBLIC_DATA_MODE }
$dashboardDescribe = aspire describe dashboard --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --format Json --non-interactive | ConvertFrom-Json
$env:NODE_EXTRA_CA_CERTS = $dashboardDescribe.resources[0].environment.NODE_EXTRA_CA_CERTS
pnpm --dir src/Web/nexora-dashboard test:e2e
```

默认构建输出 `.output/`，BFF live 配置构建输出 `.output-live/`；开发输出独立，分别为 `.output-dev/` 与 `.output-live-dev/`。MSW 仅允许显式 mock 开发环境，未知 BFF 模拟请求返回 501。

本地发布演练可在启动 AppHost 前配置 `Dashboard__UseNodeOutput=true`，让 `dashboard` 运行 `pnpm start:live`。`Dashboard__BuildVersion` 与 `Dashboard__BuildId` 标识实际产物，公开入口仍为 `https://localhost:7444`。独立 CI 打包完整的 `.output-live` 并提供 SHA-256。启动条件、回退步骤和验收记录见 [D14 发布与回退](../../../docs/verification/dashboard-d14-release.md)。

`test:e2e` 使用指定 AppHost、D0 本地开发样例、Mailpit 和受保护的开发凭据，验证真实会话、授权、主数据、前置配置和采购到付款。浏览器使用 Edge 并串行运行，Node 请求加载 AppHost 的开发 CA。`test:msw` 用同一界面验证可重复的交互、冲突和未知提交恢复。D4 的消费者和传输恢复用例通过 `NEXORA_D4_FAULTS=1` 在专用本地栈启用。

临时启动的验证 AppHost 在结束后正常停止，保留数据卷。详细状态见 [D1 验收](../../../docs/verification/dashboard-d1-original-ui.md)、[D2 验收](../../../docs/verification/dashboard-d2-original-ui.md)、[D3 验收](../../../docs/verification/dashboard-d3-original-ui.md)、[D4 验收](../../../docs/verification/dashboard-d4-original-ui.md) 与 [接入 TODO](../../../docs/ui-dashboard-api-integration-todolist.md)。
