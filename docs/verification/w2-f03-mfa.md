# 2026-11-13 W2 F03 MFA 两态与敏感操作附加验证验收

范围：AccountGo 固定基线 F03 的 2.2 最低验收——“MFA 默认关闭 / 启用两态；敏感操作附加验证；强制策略生效”。本记录覆盖本地 Aspire 环境、Keycloak 26.8.2 真实 TOTP 登录、Nitro BFF 门禁与浏览器 e2e；不含远端 CI、生产部署，也不含短信 / WebAuthn 等 Keycloak 内建 OTP 之外的因子。

## 实现摘要

- 能力查询：`GET /bff/security/capabilities`（`src/Web/nexora-web/server/routes/bff/security/capabilities.get.ts`）在刷新会话后返回 `SecurityCapabilities`：available / required / enrolled / methods / stepUpSeconds / lastVerifiedAt / reauthPath。`server/utils/bff-mfa.ts` 集中定义 `MfaPolicy`、`securityCapabilities`、`evaluateMfaGate` 与 `isSensitiveRequest`。
- 敏感操作清单（`isSensitiveRequest`，仅非 GET/HEAD/OPTIONS）：公司设置 `PUT /api/workspaces/{id}/settings`；成员与角色写 `/api/workspaces/{id}/members/{id}[/business-roles|finance-role|sales-role]`；开立银行账户 `POST /api/finance/workspaces/{id}/trade/banks`；账簿决策与冲销 `POST /api/finance/workspaces/{id}/ledger/journals/{id}/(decision|reversal)`。
- 会话记录 MFA 事实：`server/utils/bff-oidc.ts:99-112` 从 ID token 读取 `amr` / `acr` / `auth_time`；`amr` 含 `otp` 或 `mfa`、或 `acr === '2'` 视为已通过多因素验证，登录写入 `BffSession.mfaAt = min(authTime, now)` 与 `mfaMethods`；未通过时两个字段缺省。
- 门禁：`server/routes/bff/api/[...path].ts:13-17` 在 CSRF 校验、会话刷新之后、代理转发之前调用 `evaluateMfaGate`。策略启用且强制时，未绑定返回 403 `mfa_enrollment_required`，超出 step-up 窗口返回 403 `mfa_step_up_required`，响应 `data.reauthPath = '/bff/login?prompt=login'`。
- 配置：`nuxt.config.ts:8` 的 `bff.mfaEnabled / mfaRequired / mfaStepUpSeconds` 默认 `true / true / 300`；`server/utils/bff-config.ts:28-31` 读取并归一化；`src/Hosting/Nexora.AppHost/AppHost.cs:181-183` 注入 `NUXT_BFF_MFA_ENABLED / NUXT_BFF_MFA_REQUIRED / NUXT_BFF_MFA_STEP_UP_SECONDS`，本地可用 `--Web:MfaEnabled / --Web:MfaRequired / --Web:MfaStepUpSeconds` 覆盖。
- Keycloak 真实 amr：`AppHost.cs:86-91` 为 `nexora-bff` 客户端声明 `oidc-amr-mapper`（`authentication-method-reference`，ID / access token 均带）；`scripts/p1/Configure-EmailOnboarding.ps1:76-107` 在 `nexora-browser` 流程为密码、OTP 与邮箱开通步骤的 execution 配置 `default.reference.value`（pwd / otp / otp）与 `default.reference.maxAge = 3600`。maxAge 必须大于授权码交换时延：Keycloak `AmrUtils.isAmrValid` 判定 `auth_time + maxAge >= now`，默认 0 会让 amr 在令牌签发后的下一请求中被丢弃。
- UI：首页新增“账户安全”卡片（`app/components/AccountSecurity.vue`），展示多因素认证、敏感操作策略、绑定状态、验证方式、最近验证与有效期，并在已绑定时提供“重新验证身份”链接。

## 环境与复现

- 启动：`aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive`，`aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 300 --non-interactive`。
- 缩短 step-up 窗口：`aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive -- --Web:MfaStepUpSeconds=20`（AppHost 命令行参数会进入 `builder.Configuration` 并注入 web 资源环境）。
- 聚焦浏览器用例：`cd src/Web/nexora-web && pnpm exec playwright test e2e/workspace.spec.ts --grep 'Security capabilities'`，结果 1 passed (23.0s)。
- 两态演练：`cd src/Web/nexora-web && node e2e/f03-stepup-drill.mjs`，日志 `artifacts/w2/f03-stepup-drill.log`，计划与断言 `artifacts/w2/f03-plan.json`（phase=done，全部断言 true）。
- 单元测试：`pnpm --dir src/Web/nexora-web test:unit`，`test/security.test.ts` 7 个用例通过；后端 `dotnet build Nexora.slnx -c Release` 通过。

## 验收断言

| 验收点 | 方法 | 结果 |
| --- | --- | --- |
| 能力查询（启用且强制） | phase1 `GET /bff/security/capabilities` 返回 available=true、required=true、enrolled=true、methods=["otp"]、stepUpSeconds=20、lastVerifiedAt 可解析、reauthPath=/bff/login?prompt=login | 通过（2026-11-13T06:03:2xZ） |
| 新鲜窗口内敏感写放行 | 登录后立即 `PUT /bff/api/workspaces/{id}/settings` → 200，version 1 | 通过 |
| 超时后敏感写拒绝 | 等待 21 秒后同一 PUT → 403，data.code=mfa_step_up_required、data.reauthPath=/bff/login?prompt=login | 通过 |
| 重新验证后恢复 | `/bff/login?prompt=login` 完成密码 + TOTP 后 capabilities.lastVerifiedAt 刷新，重试 PUT → 200，version 2 | 通过 |
| UI 卡片两态与绑定信息 | 首页 region“账户安全”含“多因素认证 已启用”“验证方式 一次性验证码（TOTP）”“有效期 20 秒”“重新验证身份” | 通过 |
| 强制策略关闭两态 | phase2 以 `--Web:MfaRequired=false` 重启：required=false、enrolled=true、methods=["otp"]、stepUpSeconds=300；超时后 stale PUT → 200，version 3 | 通过（2026-11-13T06:04:38Z） |
| Keycloak amr 真实性 | 直连 OIDC 探针 ID token `amr=["pwd","otp"]`；AppHost 重启后 execution config id 不漂移、amr 仍为 `["pwd","otp"]` | 通过 |
| 单元测试 | `test/security.test.ts`：能力两态、敏感路由匹配、门禁新鲜 / 超时 / 未绑定 / 禁用放行共 7 个用例 | 通过 |

## 边界与后续增强

- 因子仅 Keycloak 内建 TOTP；短信、WebAuthn、恢复码需先在 Keycloak 增加认证器，并扩展 amr 值到 `factorMethods`。
- 敏感操作清单集中在 `isSensitiveRequest` 一处；新增敏感写端点必须登记，否则不会触发 step-up。
- MFA 默认开启并强制；单机联调可用 `NUXT_BFF_MFA_REQUIRED=false` 或 `--Web:MfaRequired=false` 关闭强制，能力查询仍如实报告绑定状态。
- 未绑定账号执行敏感写返回 `mfa_enrollment_required` 并引导到身份提供方；Nexora 内不代办绑定流程。
- amr 依赖 Keycloak 26.8+ 的 `oidc-amr-mapper`；更早版本需升级 Keycloak，或改用其它可信声明来源。
