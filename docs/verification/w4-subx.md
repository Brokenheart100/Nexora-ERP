# W4 SUBX 订阅计划高亮、按比例确认与限额提示验收记录

- 日期：2026-11-14
- 范围：W4 参考项目增量 SUBX（注册前计划高亮、计划变更按比例收费确认、限额提示与联系入口），依赖 F09 / F10。
- 结论：本地构建、单元测试、浏览器用例与真实 API 报价通过；未接入真实支付渠道，线下付款仅登记参考号。

## 1. 实现摘要

### 1.1 注册前计划与工作区高亮

- 新增公开定价页 `/pricing`：三档套餐名称、月价、成员 / 工作区 / 单据限额、模块清单与推荐标记；每档注册链接为 `/bff/register?plan=<code>`，并提供套餐变更说明与 `mailto:` 联系入口。
- `server/routes/bff/register.get.ts` 只接受 `free` / `standard` / `pro`，合法时将 `nexora-signup-plan` 写入 7 天 Cookie（`path=/`、`SameSite=Lax`、`Secure`，非 HttpOnly 以便界面读取），随后进入注册登录流程；非法值不写 Cookie。
- 登录页增加「先选套餐再注册」入口；工作区订阅面板读取该 Cookie，在对应计划卡片标记「注册时选择」并提示「你在注册时选择了「X」…」，激活后清除。

### 1.2 按比例报价

- `BillingProration.Quote(subscription, plan, now)` 仅在订阅有效、当前套餐与目标套餐均为付费、当前周期未结束时按比例：
  - 剩余比例 = 剩余时长 / 30 天；
  - 新套餐费用 = 目标月价 × 剩余比例，当前套餐抵扣 = 当前月价 × 剩余比例；
  - 本次应付 = max(0, 新套餐费用 − 抵扣)，金额按分四舍五入（`MidpointRounding.AwayFromZero`）；
  - 保留原周期结束日，返回剩余天数、生效时间与是否按比例。
- 无订阅、试用、过期 / 取消、当前或目标为免费版时按全价处理，周期结束为当前时间 + 30 天。
- 新增 `GET /api/workspaces/{workspaceId}/billing/plan-quote?planCode=<code>`，权限 `BillingManage`；查询不写订阅、账单或审计。端点参数显式标注 `[FromQuery]`（缺少时路由返回 404）。
- 订阅变更复用同一报价：按应付金额登记账单，按参考号判断是否已付款；按比例变更保留原周期结束日。

### 1.3 前端确认与限额提示

- `WorkspaceBilling.vue` 对免费版保持原「切换到免费版」即时路径；对付费计划先请求报价并展示确认面板（当前 / 目标套餐、剩余天数、抵扣、按比例费用、本次应付、生效时间、周期结束）。
- 确认前不发送订阅写请求。应付大于 0 时必须填写线下付款参考号；提交后才 POST `/billing/subscription`，并提示本次应付与生效日期。应付为 0 时按钮为「确认变更」，无需参考号。
- 限额区展示用量与上限，并新增「联系客服」`mailto:support@nexora.example?subject=套餐与限额咨询`。

## 2. 环境与复现

环境：Windows、仓库根 `D:\Code\CSharp\Nexora ERP`、Release 配置、本地 Aspire（PostgreSQL / Keycloak / Gateway / Nuxt BFF）、Playwright 使用 Edge 串行执行。

```powershell
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
dotnet test tests/Nexora.Tests -c Release --no-build --filter BillingProrationTests
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web build
```

浏览器用例（需 gateway 健康；运行期间不要编辑前端代码，避免 Nuxt 热重启）：

```powershell
aspire run --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/billing-subx.spec.ts --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --grep "Billing plans enforce" --reporter=line
pnpm --dir src/Web/nexora-web test:e2e
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

模型一致性（SUBX 未修改 EF 模型；预期无新迁移）：

```powershell
dotnet ef migrations has-pending-model-changes `
  --project src/Services/Organization/Nexora.Organization.Infrastructure `
  --startup-project src/Services/Organization/Nexora.Organization.Api `
  --context OrganizationDbContext --configuration Release --no-build
```

## 3. 验证结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 后端构建 | `dotnet build Nexora.slnx -c Release --no-restore` | 通过，0 警告 0 错误 |
| .NET 测试 | `dotnet test tests/Nexora.Tests -c Release --no-build` | 50 / 50 通过（1 分 2 秒） |
| 按比例单测 | `dotnet test ... --filter BillingProrationTests` | 4 / 4 通过 |
| 前端单测（新增） | `pnpm exec vitest run test/billing.test.ts` | 8 / 8 通过 |
| 前端单测（全量） | `pnpm test:unit` | 15 个文件 86 项通过 |
| 类型检查 | `pnpm typecheck` | 退出码 0（仅既存 vue-router / volar 警告） |
| 静态检查 | `pnpm lint` | 0 错误，61 条既存样式告警 |
| 前端构建 | `pnpm build` | 通过 |
| 模型一致性 | `dotnet ef migrations has-pending-model-changes ...` | `No changes have been made to the model since the last migration.` |
| SUBX e2e | `playwright test e2e/billing-subx.spec.ts` | 3 / 3 通过（10.4 秒） |
| 真实报价 | `playwright test e2e/workspace.spec.ts --grep "Billing plans enforce"` | 1 / 1 通过（26.8 秒；经真实 BFF、Organization API 与 PostgreSQL） |
| 全量 e2e | `pnpm test:e2e` | 45 / 45 通过（16.1 分钟） |

## 4. 验收断言

| 验收点 | 断言 | 结果 |
| --- | --- | --- |
| 注册计划高亮 | 合法 plan 写 Cookie；订阅面板高亮对应卡片并提示；激活后清除 | 通过（e2e 注入 Cookie 与注册 302 断言） |
| 按比例金额 | Standard 10 天后升 Pro：费用 19933、抵扣 6600、应付 13333、剩余 20 天 | 通过（单测与 e2e 一致） |
| 降级应付 | Pro 15 天后降 Standard：费用 4950、抵扣 14950、应付 0 | 通过（单测；e2e 无需参考号） |
| 周期日期 | 按比例变更保留原周期结束日；生效时间为报价时刻 | 通过（单测断言 periodEnd；e2e 断言日期显示） |
| 确认前不扣费 | 打开报价面板与填写参考号前订阅写请求数为 0 | 通过（e2e 网络计数） |
| 确认后金额 | 提交后页面显示本次应付与生效日期，账单金额使用同一报价 | 通过（e2e 断言提示与请求体） |
| 幂等 | 订阅写请求携带 operationId；重复操作不重复计费 | 通过（沿用 F09/F10 幂等与 `BillingUseCases` 重放路径） |
| 限额提示 | 展示用量 / 上限，并提供联系入口 | 通过（e2e 断言 mailto 与文案） |
| 真实报价无副作用 | 报价后订阅、账单数量与内容不变 | 通过（真实登录用例断言） |

## 5. 边界与后续增强

- 计费为线下登记：确认只登记应付金额与付款参考号，不调用支付网关；生产接入支付后需增加支付回调、退款与对账。
- 报价与确认之间若跨过周期结束或套餐状态变化，服务端会重新计算，页面显示的金额可能与最终账单相差；当前未锁定报价，后续可加入短时报价令牌。
- 计划 Cookie 仅在激活同一套餐时清除；用户改选其他套餐后旧提示可能残留，后续在任意订阅变更后清理。
- 公开定价页的限额与价格是前端静态文案，需与 `BillingPlans` 同步维护；后续可由公开配置端点提供。
- SUBX 未修改 EF 模型，不新增迁移。
- 本地 e2e 账号的工作区会随重复运行累积。本次全量前，alice 已拥有 1000 个公司工作区（Pro 上限），先备份 `organizationdb` 到 `artifacts/tmp/organization-before-cleanup.sql`，再删除该账号最旧的 200 个测试工作区（仅 `organization.workspaces` 及其级联记录，其余服务的历史行保留为孤立数据），全量后为 45 / 45。全新环境无需该步骤；测试套件尚未实现工作区回收。
