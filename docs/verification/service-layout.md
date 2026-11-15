# 七个业务服务的目录整理验证

本文中的 `NU1903` 临时参数属于 Aspire 13.6.4 的历史验证。当前版本使用默认严格还原。[Aspire 13.6.5 安全补丁验证](p1-platform-readiness.md#aspire-1365-安全补丁验证)

2026-11-11，整理 Organization、Reporting、MasterData、Finance、Purchasing、Inventory 和 Sales 的手写 C# 源码。各项目内沿用原命名空间。移动文件时校验字节内容，拆分文件时按类型声明或同一类型的业务职责保留原有代码。

- `Api` 将路由和请求模型放入 `Endpoints`，下游 HTTP 适配器放入 `Integrations`。Finance 的端点按账簿与总账、银行、捐赠、开票、应收、报表、税务、交易归类。
- `Application` 和 `Domain` 按业务能力组织。交易、应收、总账和库存用例按现有职责拆分。销售和采购订单分别整理了命令、查询、领域聚合与订单行。
- `Infrastructure` 将 EF 上下文和存储归入 `Persistence`，消息处理器与 Saga 归入 `Messaging`。源码目录中的最长手写 C# 文件由 655 行降至 197 行。统计排除 `bin`、`obj` 和 EF 迁移目录。

## 本地验证

- Release 解决方案构建通过。刷新 NuGet 审计后，严格锁定还原因现有 Aspire 13.6.4 的 `NU1903` 被视作错误而退出。临时将该诊断保留为警告后，锁定还原和 Release 构建均通过。构建结果为 2 个审计警告、0 个错误。[NuGet 报告的安全公告](https://github.com/advisories/GHSA-f7vh-h5g3-7jrh)
- `Nexora.Tests` 31/31 通过，含独立 PostgreSQL、RabbitMQ 上的 Organization、Reporting 和 MasterData 集成用例。
- 七个 DbContext 都与最后一个 EF 迁移的模型一致。Organization 和 Reporting 使用各自 Infrastructure 项目中的设计时工厂。
- 本轮范围为本地构建、EF 模型检查、领域测试及 Testcontainers 集成。浏览器端到端验收待复测。

```powershell
dotnet restore Nexora.slnx --locked-mode -p:WarningsNotAsErrors=NU1903
dotnet build Nexora.slnx -c Release --no-restore -p:WarningsNotAsErrors=NU1903
dotnet test tests/Nexora.Tests -c Release --no-build

$contexts = [ordered]@{
    Organization = 'OrganizationDbContext'
    Reporting = 'ReportingDbContext'
    MasterData = 'CatalogDbContext'
    Finance = 'FinanceDbContext'
    Purchasing = 'PurchasingDbContext'
    Inventory = 'InventoryDbContext'
    Sales = 'SalesDbContext'
}
foreach ($entry in $contexts.GetEnumerator()) {
    $service = $entry.Key
    $base = "src/Services/$service/Nexora.$service"
    $startup = if ($service -in @('Organization', 'Reporting')) { "$base.Infrastructure" } else { "$base.Api" }
    dotnet ef migrations has-pending-model-changes --project "$base.Infrastructure" --startup-project $startup --context $entry.Value --configuration Release --no-build
    if ($LASTEXITCODE -ne 0) { throw "$service EF model check failed." }
}
```

## 按四层职责规范化

2026-11-11，七个服务使用 [代码目录约定](../架构.md#611-代码目录约定)。Domain 先按聚合、实体、值对象、领域服务等职责组织。Application 分开命令、读写用例、DTO、授权和端口。Api 项目作为 Presentation，HTTP 端点、请求、响应、校验和异常处理各有目录。

- Infrastructure 拆出 21 个 EF 映射配置。七个 DbContext 各自调用对应映射配置，按既有顺序注册表、索引、关系和转换。事务型 Wolverine 处理器、Saga 和消息配置归各服务的 `Messaging`。
- 八个下游 HTTP 客户端归 `Infrastructure/Integrations`，Organization 请求身份实现归 `Infrastructure/Identity`。应用层拥有相关依赖不可用异常，由 HTTP 异常处理映射响应。MasterData 将现有 Wolverine RabbitMQ 6.61.0 的直接引用移入 Infrastructure。
- HTTP 专属模型归 `Contracts/Requests` 和 `Contracts/Responses`。使用部分类型保留 58 个原有嵌套 HTTP 合约的类型名。跨服务消息继续位于独立 `Contracts` 项目。
- BFF 使用 `Presentation/Endpoints`、`Presentation/Middleware` 和 `Infrastructure/Caching`。OIDC 配置和 YARP 代理分别沿用 `Infrastructure/Authentication` 与 `Infrastructure/Proxy`。
- 锁定还原、Debug 和 Release 构建通过。Aspire 13.6.4 的 `NU1903` 仅在本地验证命令中保留为警告。31 项 .NET 测试通过，七个 EF 模型均与现有迁移一致。
- 使用 Debug 构建启动 AppHost，真实 Edge 浏览器串行运行 11 条 E2E 用例，单轮全部通过。包括身份与成员、主数据、财务、采购、库存、销售、PDF 和本机 SMTP。报告保存在 `artifacts/p1/runtime/role-layout-20261111/browser-results.json`。
- 冷启动后的第一次平台检查遇到一次 BFF readiness 503，随后 HTTP 复查恢复 200。浏览器验证结束后复测平台检查，七个服务的连接串引用、健康探测与四项 RabbitMQ 权限探针均通过。本轮 AppHost 和 SMTP 捕获器已停止。

复用上面的 EF 核验命令，以及 [P4 的本机 SMTP 设置](p4-sales-to-ledger.md)。Debug 构建完成后运行下列命令。

```powershell
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --no-build --non-interactive
aspire wait bff --apphost $appHost --timeout 180 --non-interactive
$env:NEXORA_TEST_P4_SMTP_SINK = 'http://127.0.0.1:8026'
pnpm --dir src/Web/nexora-web test:e2e
pwsh scripts/p1/Test-Platform.ps1
aspire stop --apphost $appHost --non-interactive
```
