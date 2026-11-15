# ADR 0013 — Wolverine 全家桶与代码生成

- 日期：2026-11-06
- 状态：已采纳为技术设计基线；实现和业务条件按验证项继续跟踪。
- 关联：[架构](../架构.md)、[计划](../计划.md)、[依赖](../依赖.md)。

## 背景

用户明确要求统一 Wolverine 体系。

## 决策

采用核心 / HTTP / FluentValidation / EF Core / PostgreSQL / RabbitMQ / Saga / 调度 / RuntimeCompilation / JasperFx 工具及 Alba。P0 候选 6.61.0 已完成组合还原与类型加载；生产版本锁须按 P1 集成结果确认。

## 比较与取舍

不并行引入 MediatR / MassTransit / 手写 Outbox；Marten 仅为后续独立上下文扩展，不与 EF 同时维护同一聚合事实。

## 影响与约束

开发 Dynamic / Auto，生产目标 Static 生成链；生成、编译与最终发布分阶段处理编译器依赖。

## 验证与未决条件

- 验证：依赖探针已通过；真实事务、durable 端点、Saga、调度及 Production 启动仍待 P1。
- 未决 / 后续条件：包的编译兼容不证明 AppHost、数据库或 broker 接入已完成。
- 政策和样例：[P0 政策](../domain/p0-policies.md)；领域与契约：[上下文及状态机](../domain/p0-contexts-contracts.md)。
- 核心依赖接入情况：[可行性记录](../domain/p0-feasibility.md)。
