# 架构决策记录

> 2026-11-06。以下 ADR 采纳为 P0 技术设计基线，不等于实现、性能或合规验收通过；各条明确后续验证和未决条件。

| 编号 | 决策 | 状态 |
| --- | --- | --- |
| 0001 | [七个业务服务及模块边界](0001-service-boundaries.md) | 已采纳设计，待相应验证 |
| 0002 | [租户、工作区与账簿隔离](0002-workspace-tenancy.md) | 已采纳设计，待相应验证 |
| 0003 | [四层、严格 DDD 与查询端口](0003-clean-ddd-cqrs.md) | 已采纳设计，待相应验证 |
| 0004 | [CQRS 与投影重建](0004-read-models.md) | 已采纳设计，待相应验证 |
| 0005 | [RabbitMQ、Wolverine 与幂等](0005-durable-messaging.md) | 已采纳设计，待相应验证 |
| 0006 | [订单许可、预留及取消栅栏](0006-fulfillment-permits.md) | 已采纳设计，待相应验证 |
| 0007 | [库存维度与移动加权计价](0007-inventory-costing.md) | 已采纳设计，待相应验证 |
| 0008 | [过账、核销、税务模板与期间门禁](0008-financial-consistency.md) | 已采纳设计，待相应验证 |
| 0009 | [Keycloak、BFF 与浏览器会话](0009-oidc-bff.md) | 已采纳设计，待相应验证 |
| 0010 | [Nuxt CSR 与类型化接入](0010-nuxt-client.md) | 已采纳设计，待相应验证 |
| 0011 | [Aspire 编排与环境边界](0011-aspire-environments.md) | 已采纳设计，待相应验证 |
| 0012 | [迁移、切账、恢复与验收目标](0012-release-recovery.md) | 已采纳设计，待相应验证 |
| 0013 | [Wolverine 全家桶与代码生成](0013-wolverine-suite.md) | 已采纳设计，待相应验证 |
| 0014 | [统一授权端口与撤销语义](0014-authorization.md) | 已采纳设计，待相应验证 |
| 0015 | [AccountGo 固定功能基线与验收](0015-feature-baseline.md) | 已采纳设计，待相应验证 |
| 0016 | [银行、周期、通信、捐赠及平台扩展](0016-extended-modules.md) | 已采纳设计，待相应验证 |
| 0017 | [治理聚合、邀请与统一授权首个实现](0017-workspace-governance.md) | 已实现本地治理切片；完整业务角色 / 范围待完成 |
| 0018 | [独立 API Gateway](0018-api-gateway.md) | 已实施 |
| 0019 | [服务间同步集成改用 Wolverine gRPC](0019-service-grpc.md) | 已实施；生产机器身份与容量验收待完成 |
| 0020 | [前端样式分层与 Nuxt UI 交互底座](0020-frontend-design-system-layering.md) | 已采纳；Phase 1–2 已实施，Phase 3–7 推进中 |
