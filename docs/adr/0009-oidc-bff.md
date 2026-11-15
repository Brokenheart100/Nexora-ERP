# ADR 0009 — Keycloak、BFF 与浏览器会话

- 日期：2026-11-06
- 状态：已采纳为技术设计基线；实现和业务条件按验证项继续跟踪。
- 关联：[架构](../架构.md)、[计划](../计划.md)、[依赖](../依赖.md)。

## 背景

需要参考功能的登录 / 会话体验，同时服务内部使用标准身份协议。

## 决策

BFF confidential client 使用 Code + PKCE，浏览器只持不透明 Cookie，服务端保管 token；API 验证 issuer / audience / 时效。Keycloak 管凭据，ERP 管业务成员与权限。

2026-11-13 将 BFF 迁入 Nuxt Nitro 的 `server/`。登录回调使用绑定浏览器 Cookie 的单次 Redis 状态，校验 state、nonce 和 PKCE。Redis 保存加密会话，注销删除对应票据并完成 Keycloak RP 注销。独立网关继续接入业务 API。会话存储格式随迁移更新，原浏览器会话需重新登录。

## 比较与取舍

访问令牌存放在 Nitro 服务端会话中。ERP 权限由业务服务实时检查，账号凭据保存在 Keycloak。

## 影响与约束

OTP 邮件扩展与内置 TOTP / HOTP 是不同能力。P0 的 Keycloak 26.8.2 / 自有 SPI 候选 0.1.0 已完成双节点邮箱登录验证；独立密码 + TOTP / 恢复码 / step-up 的 22 项本地检查也已通过。两类证据分开保存，均不表示生产认证发布、真实设备或 BFF 已完成。

## 验证与未决条件

- 验证：state / nonce / CSRF、受众错误、刷新并发、会话撤销、身份链接和 OTP 重放。
- 已验证部分：[邮箱 OTP 本地 17 项证据](../domain/p0-email-otp.md)，包括真实集群、SMTP 故障与消费竞态；不能据此把 F01 或 BFF 验收勾选。
- 已验证部分：[独立 MFA 本地 22 项证据](../domain/p0-mfa.md)，包括强制绑定、独立挑战、受控恢复 / 重绑、跨节点锁定与消费、SSO 提级及可信 ACR / AMR；F03 保持未验收。
- 未决 / 后续条件：生产 provider 维护与升级、真实 SMTP / 设备、Google、BFF / 浏览器、敏感命令关联与恢复审批 / 故障恢复，以及其他外部测试渠道仍待验证。
- 政策和样例：[P0 政策](../domain/p0-policies.md)；领域与契约：[上下文及状态机](../domain/p0-contexts-contracts.md)。
- 核心依赖接入情况：[可行性记录](../domain/p0-feasibility.md)。
