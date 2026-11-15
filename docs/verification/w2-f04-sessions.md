# 2026-11-13 W2 F04 账号资料、设备会话与令牌刷新验收

范围：AccountGo 固定基线 F04 的 2.2 最低验收——“撤销后其他设备立即失效；刷新后会话延续；删除预检拦截有数据账号”。本记录覆盖本地 Aspire 环境、Nitro BFF 会话注册表、Keycloak 强制重认证与浏览器 e2e；不含远端 CI、生产部署及 Keycloak 管理端会话列表合并。

## 实现摘要

- 会话注册表（`src/Web/nexora-web/server/utils/bff-session.ts`）：会话仍以 AES-256-GCM 密封值存 Redis（`nexora:nitro:session:{handle}`），新增会话元数据 hash（`nexora:nitro:session-meta:{id}`，字段 handle / createdAt / lastSeenAt / userAgent / expiresAt / sid）和按账号的过期时间有序集合（`nexora:nitro:subject-sessions:{subject}`）。会话 id 为 handle 的 SHA-256 截断，不暴露 handle。
- 会话接口：`GET /bff/sessions` 列出当前账号的有效会话（含 current 标记，按最近活动排序）；`POST /bff/sessions/{id}/revoke` 撤销指定会话；`POST /bff/sessions/revoke-others` 撤销除当前外的全部会话。两个写接口均要求 CSRF 令牌，且只能操作属于当前 subject 的会话。
- 跨设备撤销：撤销时删除密封会话、元数据与索引；若元数据带 Keycloak `sid`，写入 `nexora:nitro:revoked-sid:{sid}` 墓碑（TTL 取会话剩余时间与 1800 秒的较小值）。被撤销设备的 BFF Cookie 失效后，即使 Keycloak SSO Cookie 仍有效，`completeLogin` 检测到墓碑会重定向 `/bff/login?prompt=login`，由 Keycloak 强制重新认证后才建立新会话。
- 令牌刷新：`requireFreshBffSession`（`server/utils/bff-oidc.ts`）在访问令牌剩余不足 60 秒时用 refresh_token 走 `refreshTokenGrant` 续期并原地更新 Redis 会话；刷新失败或没有 refresh_token 时删除会话并返回 401。`/bff/me`、`/bff/account`、`/bff/api/*` 代理统一改用该守卫。
- UI：首页新增“设备与会话”卡片（`app/components/AccountSessions.vue`），显示当前账号的浏览器 / 系统、最近活动、登录时间与当前设备标记，提供单设备撤销和“撤销其他设备”，并保留 Keycloak 账号控制台入口用于资料 / 凭据管理。

## 环境与复现

- 启动：`aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive`，`aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 240 --non-interactive`，gateway healthy 118.7s（2026-11-13 12:40）。
- 浏览器用例：`cd src/Web/nexora-web && pnpm exec playwright test e2e/workspace.spec.ts --grep 'Account session registry'`，结果 1 passed (39.2s)。
- 令牌刷新演练：`cd src/Web/nexora-web && node e2e/f04-refresh-drill.mjs`，日志 `artifacts/w2/f04-refresh-drill.log`。演练登录后等待 330 秒（Keycloak accessTokenLifespan=300s），再请求 `/bff/me`、`/bff/api/workspaces`、`/bff/sessions`，全部 200 即判定刷新成功。

## 验收断言

| 验收点 | 方法 | 结果 |
| --- | --- | --- |
| 会话列表与当前标记 | 两个浏览器上下文登录 alice 后 `GET /bff/sessions`：仅 1 条 current，id 为 22 位，含 userAgent / lastSeenAt | 通过 |
| 跨账号隔离 | bob 的会话列表不含 alice 的会话 id；bob 撤销 alice 会话返回 404 | 通过 |
| 跨设备撤销立即失效 | 撤销 alice 第二设备后：第二设备 `/bff/me` 401，当前设备仍 200 | 通过 |
| Keycloak SSO 墓碑 | 被撤销设备访问 `/bff/login` 落到 Keycloak “Please re-authenticate to continue” 密码页，重新完成密码 + TOTP 后 `/bff/me` 200 | 通过 |
| UI 撤销其他设备 | 首页“设备与会话”卡片显示 2 条会话；点击“撤销其他设备”后第二设备 401，列表收敛为 1 条 | 通过 |
| 刷新后会话延续 | 等待访问令牌过期 330 秒后 `/bff/me` 200、`/bff/api/workspaces` 200、`/bff/sessions` 200 | 通过（2026-11-13T04:48:30Z，三者均 200；日志 `artifacts/w2/f04-refresh-drill.log`） |
| 删除预检拦截有数据账号 | 既有账号用例（`workspace.spec.ts` 账号段）对 alice 返回 company-ownership / last-active-administrator / personal-workspace-disposition 阻断 | 通过（既有用例） |

## 边界与后续增强

- 会话注册表以 Nitro BFF 为准；Keycloak 管理控制台仍可查看 / 登出 Keycloak 侧会话，两侧列表未合并展示。
- 撤销墓碑 TTL 不超过 1800 秒，与 realm 的 `ssoSessionIdleTimeout=1800` 对齐；墓碑过期后由 Keycloak SSO 空闲超时兜底。
- 账号资料编辑、密码 / 凭据修改仍由 Keycloak 账号控制台承担（入口保留）；Nexora 内暂无独立资料编辑表单，与参考项目自有个人资料页存在差距，列为后续增强。
- 注销 / 删除执行链路不在本项范围；删除预检已由既有用例覆盖。
