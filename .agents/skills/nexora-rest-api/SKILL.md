---
name: nexora-rest-api
description: 设计、实现或审查 Nexora 的 C# REST API。适用于 Wolverine.HTTP 业务端点以及跨 YARP 和 Nitro 的请求响应契约，包括状态码、分页、并发前置条件、幂等、ProblemDetails 和 OpenAPI。
---

# Nexora REST API

从仓库根目录的 `AGENTS.md` 和 `docs/架构.md` 查阅当前约定，核对同模块端点、DTO、异常映射、BFF 转发和现有调用方。`dotnet-webapi` 可用于查阅 ASP.NET Core 通用能力。在 Nexora 按现有 Wolverine.HTTP、FluentValidation、CQRS 和依赖方向实现。业务端点映射输入后分发命令或调用应用查询，资源权限和状态转换由业务用例校验。

## 设计与修改契约

- 以工作区下的资源集合和具体资源组织路由。列表和详情使用 `GET`。创建资源使用 `POST`，更新方法按请求是替换完整表示还是局部变更来选择。审批、过账、冲销及报价转单保留清晰的业务语义，可用 `POST` 表达状态转换。编号、审批和冲销仍经过领域规则。
- 按实际结果决定成功状态。同步创建返回 `201`，`Location` 指向可访问的新资源。仅接受处理且尚未完成的请求可返回 `202` 并提供状态查询位置。若同步创建的资源本身就是导出任务，可返回 `201` 指向任务。`204` 响应没有正文。
- 现有写入通常在正文携带 `operationId` 和 `expectedVersion`。修改时先确认调用方和测试依赖的字段及状态码。采用 `Idempotency-Key` 或 `ETag` / `If-Match` 时，保持同一个应用层幂等或版本校验入口，同时核对网关、BFF 与客户端的头传递。HTTP 前置条件失败使用 `412`，单据状态冲突或同幂等键提交不同内容使用 `409`。既有接口的契约迁移按变更范围处理。
- 使用现有 DTO 管理字段和格式。金额与数量沿用十进制字符串，业务日期使用 `DateOnly`，事件与审计时间使用 UTC。列表与同模块的分页参数、返回形状和上限保持一致，在分页前过滤工作区和资源范围，确保分页顺序稳定。
- 在服务的异常映射中返回结构化 `ProblemDetails`。核对 `application/problem+json`、HTTP 状态、可供客户端判断的业务错误码和 `traceId`。客户端依据状态与错误码处理。资源范围策略要求隐藏存在性时沿用 `404`。

## 验证

- 比对实际路由、方法、请求响应、状态码和必要头。涉及 OpenAPI 时检查生成的文档是否准确描述 Wolverine 路由和运行时响应，尤其是返回 `IResult`、异步任务与错误分支。新增或调整的元数据 API 以项目锁定版本为准。
- 通过实际入口复现相关行为。浏览器契约经 `/bff/api/*` 验证，服务与网关契约使用对应的认证调用方式。按影响面复用现有测试，重点覆盖首次成功、重复提交、版本冲突、失败后状态及跨工作区访问。只在完成对应验收后更新计划 TODO。

参考 [HTTP 方法、状态与前置条件](https://www.rfc-editor.org/rfc/rfc9110.html)、[Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html)、[Wolverine HTTP 端点](https://wolverinefx.io/guide/http/endpoints)和 [ASP.NET Core OpenAPI](https://learn.microsoft.com/aspnet/core/fundamentals/openapi/aspnetcore-openapi?view=aspnetcore-10.0)。
