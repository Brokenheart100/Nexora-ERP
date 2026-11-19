# P1 双 BFF 节点、会话密钥与身份门禁

## 双 BFF 节点

2026-11-17 本地验证使用 Aspire 的 Nitro BFF 与另一独立 Nitro 进程。第二个进程仅绑定回环地址，使用相同的 Keycloak 客户端与 Redis，读取真实浏览器签发的会话。停止第二个进程后主节点可继续读取会话。将第二节点改用新密钥并配置上一把密钥后，已有会话和 CSRF 凭据仍可使用。通过第二节点撤销另一设备后，两个节点均拒绝被撤销的会话，当前设备继续有效。

```powershell
pnpm --dir src/Web/nexora-web build
$env:NEXORA_TEST_P1_TWO_BFF = '1'
pnpm --dir src/Web/nexora-web test:e2e --grep 'Account session registry' --reporter=list
```

Nitro 使用 `NUXT_BFF_SESSION_KEY` 写入 Redis 会话和签发 CSRF 凭据。配置 `NUXT_BFF_PREVIOUS_SESSION_KEY` 后可读取旧会话并验证旧 CSRF 凭据。多节点滚动切换时，节点需要在开始签发新凭据前都能验证两把密钥。旧凭据过期或经过刷新迁移后，可退役旧密钥。生产秘密分发和多节点滚动发布仍待验收。

## 邮箱登录和敏感操作

Keycloak 将邮箱认证声明为 `email`，TOTP 声明为 `otp`。BFF 验证独立因素后为敏感操作记录 MFA 时间。浏览器回归通过了注册、建公司、邀请加入，以及邮箱登录后尝试修改公司设置得到 `403 mfa_enrollment_required`。邮箱账号绑定第二因素和受控恢复仍待单独验收。

```powershell
pnpm --dir src/Web/nexora-web test:e2e --grep 'Email registration, company creation' --reporter=list
```
