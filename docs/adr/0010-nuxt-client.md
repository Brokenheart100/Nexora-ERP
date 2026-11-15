# ADR 0010 — Nuxt CSR 与类型化接入

- 日期：2026-11-06
- 状态：已采纳为技术设计基线；实现和业务条件按验证项继续跟踪。
- 关联：[架构](../架构.md)、[计划](../计划.md)、[依赖](../依赖.md)。

## 背景

后台页面需要表单、复杂表格与可靠异步状态，不依赖 SEO。

## 决策

Nuxt 4 / Vue 3 / TypeScript strict。页面及组件位于 `app/`，同源 BFF 位于项目根的 `server/`，两者部署为同一个 Web 资源。继续采用 CSR，业务 HTTP 客户端按服务维护，Pinia 保存 UI 状态。

## 比较与取舍

使用 Nitro 的文件路由、服务端中间件与工具目录。Keycloak 负责身份认证，Nitro 管理浏览器会话，业务请求经 API Gateway 进入所属服务，由服务端执行资源授权。[Nuxt server 目录](https://nuxt.com/docs/4.x/directory-structure/server)

## 影响与约束

公司切换取消在途请求 / 清旧缓存；金额十进制字符串，写命令有幂等键和版本。

## 验证与未决条件

- 验证：表单冲突、处理中 / 部分失败、切换竞态、键盘操作、导出与显示金额一致。
- 未决 / 后续条件：UI 组件库待 P1 真实表格 / 表单样例验证后锁定。
- 政策和样例：[P0 政策](../domain/p0-policies.md)；领域与契约：[上下文及状态机](../domain/p0-contexts-contracts.md)。
- 核心依赖接入情况：[可行性记录](../domain/p0-feasibility.md)。
