# 服务间 gRPC 同步集成验证

日期 2026-11-12。范围：本地 Aspire 应用、浏览器回归与后端测试；不含远程 CI 与生产。相关决策见 [ADR 0019](../adr/0019-service-grpc.md)。

## 变更

- 新增 `src/BuildingBlocks/Nexora.BuildingBlocks.Grpc`：channel 工厂（从 Aspire `services:{name}:https:0` 解析地址并缓存）、`GrpcCallContext`（转发 Bearer、20 秒 deadline）与 `GrpcErrorMapper`（状态码还原为领域异常）。
- 各服务发布契约项目增加 `[ServiceContract]` 接口与 `[DataContract]` 消息：Organization、MasterData、Finance（新建）、Inventory（新建）。
- owner 服务组合根：`AddCodeFirstGrpc()`、`AddWolverineGrpc()`（code-first 契约、`RequireAuthorizeOnAll`、异常映射）与 `MapWolverineGrpcServices()`；消费方注册 `AddNexoraGrpcClient<T>()`。
- 同步调用迁移：Organization→Inventory 仓库引用；MasterData→Organization 工作区授权；Finance→Organization 授权、→MasterData 税务/往来引用、→Inventory 商品引用；Inventory→Organization 授权与成员；Sales / Purchasing→Organization 授权、MasterData 版本化引用、Finance 账簿设置、Inventory 仓库引用；Reporting→Organization 报表读权限确认。旧的 peer `AddHttpClient` 注册已移除，服务就绪检查保留 HTTP `/health`。

## 实施中修正的两个运行时问题

1. 客户端注册初期使用 `AddScoped` lambda 工厂。Wolverine 6 默认 `ServiceLocationPolicy.NotAllowed`，HTTP 端点代码生成遇到 `Scoped` 不透明工厂会抛 `InvalidServiceLocationException`（日志：`The service registration for Nexora.Inventory.Contracts.Grpc.IInventoryGrpc is an opaque lambda factory with the Scoped lifetime and requires service location`），端点返回 500。改为单例注册（生成的客户端无每调用状态，channel 已由工厂按 peer 缓存）。
2. gRPC 处理器类最初命名为 `*GrpcHandlers`。Wolverine 约定发现只匹配 `Handler` / `Consumer` 后缀，日志提示 `handler-shaped methods but was not discovered`；请求落到消息总线后报 `Failed to create a message handler` 并返回 Internal。类改名为 `*GrpcHandler` 后正常。

## 复现与结果

```powershell
dotnet tool restore
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build

$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraAppHost --non-interactive
aspire wait gateway --apphost $nexoraAppHost --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/email-onboarding.spec.ts --reporter=line
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --reporter=line
aspire stop --apphost $nexoraAppHost --non-interactive
```

| 验证 | 结果 |
| --- | --- |
| `dotnet build Nexora.slnx -c Release` | 0 警告 0 错误 |
| `dotnet test tests/Nexora.Tests` | 31/31 通过 |
| 浏览器 `email-onboarding.spec.ts` | 4/4 通过（含团队与角色、自定义角色范围） |
| 浏览器 `workspace.spec.ts` | 14/14 通过（6.7m；含商品目录、往来单位、公司设置、账簿/税/总账报表、采购、P4 销售库存发票） |

聚焦验证：`workspace.spec.ts --grep "Catalog UI and API"` 1/1 通过（21.4s），用于确认授权查询经 gRPC 返回。首次全量后端测试曾因 Docker 并行启动 Testcontainers 容器失败 1 例，单独重跑该类 4/4、全量再跑 31/31 通过，属本机资源竞争而非代码缺陷。

## 边界

- gRPC 只承载同步查询与授权确认，不提供耐久性；Outbox / Inbox、Saga、延时消息与死信继续由 RabbitMQ 承载，见 ADR 0019。
- 生产 mTLS、机器身份与容量验收仍由 P1-04c、P1-07e 跟踪；本记录仅覆盖本地开发栈。