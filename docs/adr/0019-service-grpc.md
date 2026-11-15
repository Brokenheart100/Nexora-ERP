# ADR 0019 — 服务间同步集成改用 Wolverine gRPC

日期 2026-11-12。状态 已实施（本地浏览器回归见验证记录）。

服务间同步调用（授权、主数据引用、账簿设置、仓库引用与报表读取前的权限确认）由 HTTP 客户端改为 Wolverine 的 code-first gRPC 接口；RabbitMQ 继续承载 Outbox / Inbox、Saga、延时消息与死信等耐久消息，gRPC 不作为事件传输或持久队列使用。

| 关注点 | 决策 |
| --- | --- |
| 契约位置 | 每个 owner 服务的 `Nexora.*.Contracts` 项目定义 `[ServiceContract]` 接口与 `[DataContract]` 消息；只使用 Guid / long / bool / string 等线格式友好的基元，不携带 Application / Domain / EF 类型 |
| 服务端 | owner 服务在组合根调用 `AddCodeFirstGrpc()`、`AddWolverineGrpc()`（`IncludeCodeFirstContract<T>()`、`RequireAuthorizeOnAll()`、异常到 `StatusCode` 映射），并在授权中间件后 `MapWolverineGrpcServices()`；处理器是普通 Wolverine handler（类名须以 `Handler` / `Consumer` 结尾才能被约定发现），注入 `ICurrentActor` 并执行与 HTTP 端点相同的用例与资源授权 |
| 客户端 | 消费方在组合根调用 `AddNexoraGrpcClient<T>(serviceName)`，以单例注册 code-first 客户端；`GrpcChannelFactory` 从 Aspire 服务发现配置 `services:{name}:https:0` 解析地址并缓存 channel。单例是必要的：生成的客户端无每调用状态，而 Scoped lambda 工厂会触发 Wolverine 默认 `ServiceLocationPolicy.NotAllowed` 的代码生成错误 |
| 身份传播 | `GrpcCallContext.Forward/RequireBearer` 把调用方 Bearer 写入 metadata 并设置 20 秒 deadline；服务端按 `RequireAuthorizeOnAll` 校验 `nexora-api` 受众令牌，资源授权仍由用例执行 |
| 错误语义 | 服务端将 `AccessDeniedException` / `ResourceNotFoundException` / `BusinessConflictException` / `IdempotencyConflictException` 映射为 PermissionDenied / NotFound / FailedPrecondition / Aborted；客户端 `GrpcErrorMapper` 还原为原有领域异常，调用方感知的消息保持改造前文本 |
| 非耐久边界 | gRPC 调用失败直接拒绝或转换为原 `*AuthorityUnavailable` 语义，不回退读投影；事件、命令回执和跨服务 Saga 步骤继续走 RabbitMQ durable 通道 |

已迁移的同步调用：Organization→Inventory 仓库引用；MasterData→Organization 工作区授权；Finance→Organization 工作区授权、→MasterData 税务 / 往来引用、→Inventory 商品引用；Inventory→Organization 授权与成员；Sales / Purchasing→Organization 授权、MasterData 版本化引用、Finance 账簿设置、Inventory 仓库引用；Reporting→Organization 报表读权限确认。

这样把服务间同步契约集中到发布契约项目，去掉各处 `AddHttpClient` 与手写 JSON DTO / 状态码映射；代价是 owner 服务必须同时暴露 gRPC 端点，契约变更需同步发布契约项目。同步调用仍受架构约束：关键交易不形成长同步链，可缓存主数据与额度仍由事实所有者确认。生产 mTLS / 机器身份与容量验收继续由 P1-04c、P1-07e 跟踪。