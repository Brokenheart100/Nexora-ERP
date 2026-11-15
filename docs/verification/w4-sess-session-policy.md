# W4 SESS 自动登出最短策略跨工作区提示验收记录

日期：2026-11-14。范围：W4 参考增量 SESS（工作区级闲置超时策略同步、跨工作区取最短值并提示来源、策略变更提示与到期自动登出）。依赖 F04 设备会话与令牌刷新。验收环境：本地 Aspire AppHost + PostgreSQL 持久卷，Release 构建，前端 Nuxt 4 / Vitest / Playwright（Edge）。

## 1. 实现摘要

- Organization 领域与设置：
  - `WorkspacePreferences` 新增 `SessionIdleMinutes`，默认 30 分钟，允许 1–480；修改时校验范围并递增版本。
  - `GET /api/session-policy` 返回当前账号的有效闲置超时、来源工作区列表与检查时间；多个工作区时取最短值，来源为所有等于最短值的工作区（按名称序数、再按 Id 排序）。
  - 工作区设置 `PUT /api/organization/workspaces/{id}/settings` 支持 `sessionIdleMinutes`，前端「工作区设置」可编辑。
  - 迁移 `20261114141156_AddWorkspaceSessionIdleMinutesColumn` 为 `organization.workspace_preferences` 增加 `SessionIdleMinutes`（默认 30）。
- BFF（Nuxt Nitro）：
  - `server/utils/bff-session-policy.ts` 以会话令牌请求网关 `/api/session-policy`，Redis 缓存 30 秒、最近策略保留 24 小时；失败时回退最近策略（标记 `stale`）或默认 30 分钟 / 无来源，并以 10 秒短缓存避免故障期逐请求等待。
  - `requireFreshBffSession` 在刷新或续期前校验 `lastSeenAt`，超过有效闲置时间即移除服务端会话并返回 401 `session.idle_timeout`；所有受保护的 `/bff/api`、`/bff/me`、`/bff/sessions` 请求均经过该门禁。
  - `GET /bff/session-policy` 只读且不续期，`?refresh=1` 绕过 Redis；`POST /bff/sessions/activity` 经 CSRF 校验后显式续期。两者均返回 `Cache-Control: no-store`。
- 前端：
  - `app/utils/sessionPolicy.ts` 统一策略类型、截止时间、剩余时间格式、来源摘要与 `session.idle_timeout` 判定；告警窗为 `min(2 分钟, max(15 秒, 超时 / 4))`。
  - `useSessionPolicy` 每 30 秒同步策略、每秒倒计时；活动心跳每 60 秒调用 activity；剩余不足告警窗时提示来源并可「继续使用」；到期调用 `store.logout()`；策略键变化时提示新值与来源。
  - `AppSessionGuard.vue` 监听指针、键盘、滚动与页面可见性；底部告警条与策略变更通知；`app.vue` 在登录后挂载。
  - `AccountSessions.vue` 展示有效闲置超时与来源；`WorkspaceCompanySettings.vue` 提供 1–480 分钟输入与「多工作区取最短值」说明。

## 2. 环境与复现

命令从仓库根执行。

```powershell
dotnet build Nexora.slnx -c Release
dotnet test tests/Nexora.Tests -c Release --no-build
dotnet test tests/Nexora.Tests -c Release --no-build --filter SessionPolicyTests
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web exec vitest run test/sessionPolicy.test.ts
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web build
```

模型一致性（需先构建 Organization.Api，EF 工具读取启动项目输出目录中的 Infrastructure 程序集）：

```powershell
dotnet ef migrations has-pending-model-changes `
  --project src/Services/Organization/Nexora.Organization.Infrastructure `
  --startup-project src/Services/Organization/Nexora.Organization.Api `
  --context OrganizationDbContext --configuration Release --no-build
```

浏览器用例（需 gateway 健康）：

```powershell
aspire run --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/session-policy.spec.ts --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --grep "Effective session policy" --reporter=line
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

## 3. 验证结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 后端构建 | `dotnet build Nexora.slnx -c Release` | 通过，0 警告 0 错误 |
| .NET 测试 | `dotnet test tests/Nexora.Tests -c Release --no-build` | 50 / 50 通过（1 分 2 秒） |
| 策略单测 | `dotnet test ... --filter SessionPolicyTests` | 4 / 4 通过 |
| 前端单测（本轮新增） | `pnpm exec vitest run test/sessionPolicy.test.ts` | 6 / 6 通过 |
| 前端单测（全量） | `pnpm test:unit` | 15 个文件 86 项通过 |
| 类型检查 | `pnpm typecheck` | 退出码 0（仅既存 vue-router / volar 警告） |
| 静态检查 | `pnpm lint` | 0 错误，61 条既存样式告警 |
| 前端构建 | `pnpm build` | 通过；产物含 `session-policy.get.mjs` 与 `sessions/activity.post.mjs` |
| 模型一致性 | `dotnet ef migrations has-pending-model-changes ...` | `No changes have been made to the model since the last migration.` |
| 策略 e2e | `playwright test e2e/session-policy.spec.ts` | 3 / 3 通过（11.1 秒） |
| 真实登录集成 | `playwright test e2e/workspace.spec.ts --grep "Effective session policy"` | 1 / 1 通过（9.3 秒；经真实 BFF、Organization API 与 PostgreSQL 读写策略） |
| 全量 e2e | `pnpm test:e2e` | 45 / 45 通过（16.1 分钟） |

## 4. 验收断言

| 验收点 | 断言 | 结果 |
| --- | --- | --- |
| 工作区级策略 | 默认 30；设置 1–480 分钟；越界被拒绝且保留原值 | 通过（`SessionPolicyTests` 覆盖默认值、设置、省略保留与越界） |
| 跨工作区取最短 | 可访问多个工作区时返回最短闲置时间 | 通过（策略单测；真实登录用例新增 2 分钟工作区后返回 2） |
| 来源提示 | 返回全部等于最短值的工作区，前端显示名称与分钟数 | 通过（e2e 显示「贝塔（15 分钟）」；真实登录断言 sources） |
| 策略变更即时提示 | 轮询发现新策略后显示「自动登出策略已更新为 N 分钟，来源：…」 | 通过（e2e 改写响应并触发可见性刷新） |
| 到期前提示与继续使用 | 剩余不足告警窗时显示倒计时与来源；「继续使用」续期后隐藏 | 通过（e2e 从 50 秒剩余开始，点击后 activity 调用增加） |
| 到期自动登出 | 闲置超过策略后 BFF 返回 401 并清除会话，前端调用退出 | 通过（e2e 从 58 秒剩余开始，30 秒内收到 `POST /bff/logout`） |
| 轮询不续期 | 读取策略不更新 `lastSeenAt`，仅 activity / 正常请求续期 | 通过（`session-policy.get.ts` 不调用 touch；activity 显式续期） |
| 全路径门禁 | 受保护 BFF 请求统一校验闲置超时 | 通过（`requireFreshBffSession` 接入 `/bff/me`、`/bff/sessions`、`/bff/api`） |
| 迁移与真实数据库 | 新列存在且设置持久化 | 通过（真实登录用例写入 2 分钟后读回；EF 无待迁移模型变更） |

## 5. 边界与后续增强

- 策略轮询周期为 30 秒，策略变更提示最迟约 30 秒出现；倒计时每秒刷新，服务端 `lastSeenAt` 为权威。
- 浏览器休眠或系统时钟跳变时，前端剩余时间可能与服务端不同；到期最终以 BFF 401 为准。
- 策略服务不可用时回退最近已知策略或默认 30 分钟；若实际策略更短，故障期间可能暂时放宽，后续应按最近已知值收紧并告警。
- 普通 401（非 `session.idle_timeout`）只停止守护而不主动退出，避免预览与环境故障造成误登出；闲置 401 才触发退出。
- 真实登录用例会创建临时工作区并在结束后把该工作区策略恢复为 30 分钟；不删除临时工作区。
- 后续可增加服务端推送策略变更、按角色 / 设备类型差异化超时，以及浏览器唤醒后的立即校时。
